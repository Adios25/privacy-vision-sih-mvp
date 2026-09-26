#!/usr/bin/env python3
"""Smoke-test the local Ollama WebSocket bridge with a synthetic image."""

from __future__ import annotations

import asyncio
import json

import websockets


PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="


async def main() -> None:
    payload = {
        "protocolVersion": "1.0",
        "consent": {"serverContext": True, "grantedAt": "2026-09-26T00:00:00Z"},
        "task": {"id": "prepare_form", "label": "Complete the page task"},
        "imageDataUrl": f"data:image/png;base64,{PNG}",
        "leakCheck": {"status": "passed", "knownRawTermsInStructuredPayload": 0},
        "sanitizedContext": {
            "page": {"elements": [{"id": "submit-1", "role": "button", "label": "Submit", "enabled": True}]},
            "redactionManifest": [],
            "clientMetrics": {},
            "audit": {},
        },
    }
    async with websockets.connect("ws://127.0.0.1:8788/agent/loop", open_timeout=10) as socket:
        await socket.send(json.dumps(payload))
        response = json.loads(await socket.recv())
        assert isinstance(response, dict)
        assert "error" not in response, response
        print(json.dumps(response, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
