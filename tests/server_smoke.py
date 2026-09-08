#!/usr/bin/env python3
"""Local heuristic server smoke test; no external provider or API key is required."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="


def request(url: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request_obj = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request_obj, timeout=5) as response:
        return response.status, json.loads(response.read().decode())


def payload():
    return {
        "task": "Fill empty fields and prepare submission",
        "imageDataUrl": f"data:image/png;base64,{PNG}",
        "leakCheck": {"status": "passed", "knownRawTermsInStructuredPayload": 0},
        "page": {"title": "Smoke", "urlClass": "127.0.0.1", "viewport": [1, 1], "textBlocks": [], "categoryCounts": {}, "elements": [
            {"id": "e1", "role": "textbox", "enabled": True, "value": "", "purpose": "email", "inputType": "email", "label": "Email", "risk": "EMAIL"}
        ]},
    }


def main():
    env = {**os.environ, "PV_PROVIDER": "heuristic", "PV_PORT": "0"}
    # The current entry point prints a fixed port, so use an available deterministic test port.
    env["PV_PORT"] = "8799"
    process = subprocess.Popen([sys.executable, str(ROOT / "server" / "server.py")], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(30):
            try:
                request("http://127.0.0.1:8799/api/health")
                break
            except Exception:
                time.sleep(0.1)
        assert request("http://127.0.0.1:8799/api/health")[0] == 200
        assert request("http://127.0.0.1:8799/api/ready")[0] == 200
        status, plan = request("http://127.0.0.1:8799/api/plan", payload())
        assert status == 200 and plan["planVersion"] == "1.0"
        assert request("http://127.0.0.1:8799/api/metrics")[0] == 200
        try:
            request("http://127.0.0.1:8799/api/plan", {"bad": True})
        except urllib.error.HTTPError as error:
            assert error.code == 400
        else:
            raise AssertionError("Malformed payload was accepted")
        print("Server smoke test passed.")
    finally:
        process.terminate()
        process.wait(timeout=5)


if __name__ == "__main__":
    main()
