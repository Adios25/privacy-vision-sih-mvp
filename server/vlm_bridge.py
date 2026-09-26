#!/usr/bin/env python3
"""Guarded WebSocket bridge for an OpenAI-compatible multimodal planner."""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import time
from datetime import datetime
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("privvy-vlm-bridge")

app = FastAPI(title="Privvy Multimodal Planner WebSocket Bridge")
VLM_BASE_URL = os.environ.get("VLM_BASE_URL", "http://127.0.0.1:11434/v1")
VLM_MODEL = os.environ.get("VLM_MODEL", "qwen2.5vl:3b")
VLM_API_KEY = os.environ.get("VLM_API_KEY", "EMPTY")
VLM_PROVIDER = os.environ.get("VLM_PROVIDER", "ollama")
VLM_MAX_OUTPUT_TOKENS = int(os.environ.get("VLM_MAX_OUTPUT_TOKENS", "512"))
client = AsyncOpenAI(base_url=VLM_BASE_URL, api_key=VLM_API_KEY)
ALLOWED_MODEL_ACTIONS = {"TYPE", "CLICK", "COMPLETE"}
ALLOWED_PLACEHOLDERS = {
    "<USER_NAME>", "<USER_EMAIL>", "<USER_PHONE>", "<USER_ADDRESS>",
    "<USER_DOB>", "<USER_AADHAAR>", "<USER_PASSPORT>"
}
MAX_REDACTED_IMAGE_BYTES = 4 * 1024 * 1024


def raw_image_data(value: str) -> str:
    """Return base64 payload without an optional data URI prefix."""
    if value.startswith("data:") and "," in value:
        return value.split(",", 1)[1]
    return value


def validated_model_plan(value: Any) -> dict[str, Any]:
    """Return only the bounded action protocol accepted by the extension."""
    if not isinstance(value, dict) or not isinstance(value.get("actions"), list):
        raise ValueError("VLM response must contain an actions list.")
    actions = []
    for raw_action in value["actions"][:50]:
        if not isinstance(raw_action, dict):
            raise ValueError("Every VLM action must be an object.")
        action = str(raw_action.get("action", raw_action.get("type", ""))).upper()
        if action not in ALLOWED_MODEL_ACTIONS:
            raise ValueError("VLM returned an unsupported action.")
        normalized: dict[str, Any] = {"action": action}
        if action in {"TYPE", "CLICK"}:
            target_id = str(raw_action.get("target_id", raw_action.get("targetId", ""))).strip()
            if not target_id or len(target_id) > 80:
                raise ValueError("VLM action is missing a bounded target id.")
            normalized["target_id"] = target_id
        if action == "TYPE":
            placeholder = str(raw_action.get("placeholder", ""))
            if placeholder not in ALLOWED_PLACEHOLDERS:
                raise ValueError("VLM returned an unsupported placeholder.")
            normalized["placeholder"] = placeholder
        message = str(raw_action.get("message", "")).strip()
        if message:
            normalized["message"] = message[:500]
        actions.append(normalized)
    if not actions or actions[-1]["action"] != "COMPLETE" or any(
        item["action"] == "COMPLETE" for item in actions[:-1]
    ):
        raise ValueError("VLM plan must end with exactly one COMPLETE action.")
    return {"actions": actions, "message": str(value.get("message", ""))[:500]}


@app.websocket("/agent/loop")
async def agent_loop(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload: dict[str, Any] = json.loads(await websocket.receive_text())
            request_started = time.perf_counter()
            if payload.get("protocolVersion") != "1.0":
                await websocket.send_json({"error": "Unsupported planner protocol."})
                continue
            if payload.get("leakCheck", {}).get("status") != "passed":
                await websocket.send_json({"error": "Client leak check did not pass."})
                continue
            consent = payload.get("consent", {})
            if consent.get("serverContext") is not True or not consent.get("grantedAt"):
                await websocket.send_json({"error": "Per-scan server consent is required."})
                continue
            try:
                datetime.fromisoformat(str(consent["grantedAt"]).replace("Z", "+00:00"))
            except ValueError:
                await websocket.send_json({"error": "Server consent timestamp is invalid."})
                continue
            image_value = str(payload.get("imageDataUrl", ""))
            if not image_value.startswith("data:image/"):
                await websocket.send_json({"error": "A locally redacted image is required."})
                continue
            image_mime = image_value[5:].split(";", 1)[0]
            sanitized = payload.get("sanitizedContext", {})
            page = sanitized.get("page", {}) if isinstance(sanitized, dict) else {}
            dom_elements = page.get("elements", []) if isinstance(page, dict) else []
            if not isinstance(dom_elements, list):
                await websocket.send_json({"error": "A sanitized UI graph is required."})
                continue
            if not isinstance(sanitized.get("redactionManifest"), list):
                await websocket.send_json({"error": "A redaction manifest is required."})
                continue
            image_data = raw_image_data(image_value)
            try:
                decoded_image = base64.b64decode(image_data, validate=True)
            except (binascii.Error, ValueError):
                await websocket.send_json({"error": "The redacted image encoding is invalid."})
                continue
            if not decoded_image or len(decoded_image) > MAX_REDACTED_IMAGE_BYTES:
                await websocket.send_json({"error": "The redacted image is empty or too large."})
                continue
            task = payload.get("task", {})
            goal = str(task.get("label", "Choose the safest valid browser action.")) if isinstance(task, dict) else str(task)

            allowed_placeholders = ", ".join(sorted(ALLOWED_PLACEHOLDERS))
            messages = [
                {
                    "role": "system",
                    "content": f"You are a browser agent. Return exactly one JSON object with an actions array. Allowed action values: TYPE, CLICK, COMPLETE. Never output SELECT or any other action. Every TYPE placeholder must be exactly one of: {allowed_placeholders}. Use exact DOM ids from DOM JSON; never invent target ids. Include safe required TYPE and CLICK actions in order. End actions with exactly one COMPLETE action. If no safe action is needed, return actions containing only COMPLETE. No prose outside JSON.",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Goal: {goal}\nDOM JSON: {json.dumps(dom_elements, ensure_ascii=False)}",
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{image_mime};base64,{image_data}"},
                        },
                    ],
                },
            ]

            model_started = time.perf_counter()
            completion = await client.chat.completions.create(
                model=VLM_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=VLM_MAX_OUTPUT_TOKENS,
            )
            model_ms = round((time.perf_counter() - model_started) * 1000, 1)
            content = completion.choices[0].message.content or "{}"
            try:
                plan = validated_model_plan(json.loads(content))
            except (json.JSONDecodeError, ValueError):
                logger.warning("VLM output failed action validation; returning safe COMPLETE-only plan")
                plan = {
                    "actions": [{"action": "COMPLETE", "message": "No safe model action was accepted."}],
                    "message": "Ollama output did not satisfy the action protocol. Safe no-op plan returned.",
                    "degraded": True,
                }
            plan.update({
                "provider": VLM_PROVIDER,
                "model": VLM_MODEL,
                "metrics": {
                    "modelMs": model_ms,
                    "serverMs": round((time.perf_counter() - request_started) * 1000, 1),
                },
            })
            await websocket.send_json(plan)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except json.JSONDecodeError as error:
        logger.warning("Invalid JSON received or returned: %s", error)
        await websocket.close(code=1003, reason="Invalid JSON")
    except Exception:
        # Provider exceptions may include request details; keep logs data-free.
        logger.error("VLM bridge request failed")
        try:
            await websocket.send_json({"error": "Configured planner request failed."})
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8788)
