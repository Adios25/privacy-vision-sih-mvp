#!/usr/bin/env python3
"""Local WebSocket bridge for a vLLM OpenAI-compatible Qwen2-VL server."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("privvy-vlm-bridge")

app = FastAPI(title="Privvy Qwen2-VL WebSocket Bridge")
VLM_BASE_URL = os.environ.get("VLM_BASE_URL", "http://127.0.0.1:11434/v1")
VLM_MODEL = os.environ.get("VLM_MODEL", "qwen2.5vl:3b")
VLM_API_KEY = os.environ.get("VLM_API_KEY", "EMPTY")
client = AsyncOpenAI(base_url=VLM_BASE_URL, api_key=VLM_API_KEY)


def raw_image_data(value: str) -> str:
    """Return base64 payload without an optional data URI prefix."""
    if value.startswith("data:") and "," in value:
        return value.split(",", 1)[1]
    return value


@app.websocket("/agent/loop")
async def agent_loop(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload: dict[str, Any] = json.loads(await websocket.receive_text())
            image_data = raw_image_data(str(payload.get("image_base64", "")))
            dom_elements = payload.get("dom_elements", [])
            goal = str(payload.get("goal", "Choose the safest valid browser action."))

            messages = [
                {
                    "role": "system",
                    "content": "You are a browser agent. Create an ordered action plan based on the image and DOM JSON. Respond in strict JSON with this shape: {\"actions\":[{\"action\":\"TYPE\"|\"CLICK\"|\"COMPLETE\",\"target_id\":\"exact DOM id when needed\",\"placeholder\":\"<USER_NAME> etc. when typing\",\"message\":\"optional\"}]}. Use exact DOM ids. Include every required TYPE and CLICK action in order, then exactly one COMPLETE action last. Never invent target ids.",
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
                            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
                        },
                    ],
                },
            ]

            completion = await client.chat.completions.create(
                model=VLM_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
            )
            content = completion.choices[0].message.content or "{}"
            await websocket.send_json(json.loads(content))
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except json.JSONDecodeError as error:
        logger.warning("Invalid JSON received or returned: %s", error)
        await websocket.close(code=1003, reason="Invalid JSON")
    except Exception:
        logger.exception("VLM bridge request failed")
        try:
            await websocket.send_json({"error": "Local VLM request failed."})
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8788)
