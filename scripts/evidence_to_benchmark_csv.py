#!/usr/bin/env python3
"""Extract timing-only benchmark rows from sanitized Privvy evidence exports."""
from __future__ import annotations

import argparse
import base64
import csv
import json
import struct
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote_to_bytes

ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    "run_id", "date", "browser", "browser_version", "os", "os_version", "cpu", "gpu",
    "model", "model_state", "page_element_count", "viewport_width", "viewport_height",
    "image_width", "image_height", "repetition", "client_scan_ms", "redaction_ms",
    "network_ms", "model_ms", "total_task_ms", "js_heap_bytes", "notes"
)
JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Evidence must be a JSON object: {path}")
    return value


def decode_data_url(value: str) -> bytes:
    if not value.startswith("data:image/") or "," not in value:
        return b""
    header, encoded = value.split(",", 1)
    return base64.b64decode(encoded) if ";base64" in header.casefold() else unquote_to_bytes(encoded)


def image_dimensions(data_url: str) -> tuple[int | str, int | str]:
    data = decode_data_url(data_url)
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return struct.unpack(">II", data[16:24])
    if not data.startswith(b"\xff\xd8"):
        return "", ""
    index = 2
    while index + 8 < len(data):
        while index < len(data) and data[index] != 0xFF:
            index += 1
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            break
        segment_length = int.from_bytes(data[index:index + 2], "big")
        if marker in JPEG_SOF and index + 7 <= len(data):
            height = int.from_bytes(data[index + 3:index + 5], "big")
            width = int.from_bytes(data[index + 5:index + 7], "big")
            return width, height
        if segment_length < 2:
            break
        index += segment_length
    return "", ""


def numeric(value: object) -> int | float | str:
    if isinstance(value, bool) or value is None or value == "":
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return ""
    return int(number) if number.is_integer() else number


def evidence_row(path: Path, evidence: dict, args: argparse.Namespace, repetition: int) -> dict:
    payload = evidence.get("sanitizedPayload")
    if not isinstance(payload, dict):
        raise ValueError(f"Missing sanitizedPayload: {path}")
    page = payload.get("page") if isinstance(payload.get("page"), dict) else {}
    client = payload.get("clientMetrics") if isinstance(payload.get("clientMetrics"), dict) else {}
    server_plan = evidence.get("plans", {}).get("server")
    server_plan = server_plan if isinstance(server_plan, dict) else {}
    server_metrics = server_plan.get("metrics") if isinstance(server_plan.get("metrics"), dict) else {}
    outbound = evidence.get("outboundRequest")
    image_url = outbound.get("imageDataUrl", "") if isinstance(outbound, dict) else payload.get("imageDataUrl", "")
    image_width, image_height = image_dimensions(str(image_url))
    viewport = page.get("viewport", [])
    viewport_width = viewport[0] if isinstance(viewport, list) and len(viewport) > 1 else ""
    viewport_height = viewport[1] if isinstance(viewport, list) and len(viewport) > 1 else ""
    exported_at = str(evidence.get("exportedAt", ""))
    try:
        run_date = datetime.fromisoformat(exported_at.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        run_date = ""
    total_task = server_metrics.get("e2eMs", client.get("totalScanMs"))
    model = args.model or server_plan.get("model") or "local-only"
    elements = page.get("elements") if isinstance(page.get("elements"), list) else []
    return {
        "run_id": path.stem,
        "date": run_date,
        "browser": args.browser,
        "browser_version": args.browser_version,
        "os": args.os,
        "os_version": args.os_version,
        "cpu": args.cpu,
        "gpu": args.gpu,
        "model": model,
        "model_state": args.model_state,
        "page_element_count": len(elements),
        "viewport_width": viewport_width,
        "viewport_height": viewport_height,
        "image_width": image_width,
        "image_height": image_height,
        "repetition": repetition,
        "client_scan_ms": numeric(client.get("totalScanMs")),
        "redaction_ms": numeric(client.get("redactionMs")),
        "network_ms": numeric(server_metrics.get("networkMs")),
        "model_ms": numeric(server_metrics.get("modelMs")),
        "total_task_ms": numeric(total_task),
        "js_heap_bytes": numeric(client.get("jsHeapBytes")),
        "notes": args.notes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, action="append", required=True, help="Repeat for each sanitized evidence export")
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation" / "benchmarks" / "raw-results.csv")
    parser.add_argument("--browser", required=True)
    parser.add_argument("--browser-version", required=True)
    parser.add_argument("--os", required=True)
    parser.add_argument("--os-version", required=True)
    parser.add_argument("--cpu", required=True)
    parser.add_argument("--gpu", default="unknown")
    parser.add_argument("--model", help="Override the model recorded by the server plan")
    parser.add_argument("--model-state", choices=("cold", "warm", "not-applicable"), required=True)
    parser.add_argument("--start-repetition", type=int, default=1)
    parser.add_argument("--notes", default="")
    parser.add_argument("--append", action="store_true")
    args = parser.parse_args()
    if args.start_repetition < 1:
        raise ValueError("start-repetition must be positive")
    if args.output.exists() and not args.append:
        raise FileExistsError(f"Output already exists; choose another path or pass --append: {args.output}")

    rows = [
        evidence_row(path, read_json(path), args, args.start_repetition + index)
        for index, path in enumerate(args.evidence)
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_header = not args.output.exists() or args.output.stat().st_size == 0
    with args.output.open("a", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=FIELDS)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} timing-only benchmark row(s) to {args.output}")


if __name__ == "__main__":
    main()
