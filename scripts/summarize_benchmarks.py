#!/usr/bin/env python3
"""Summarize comparable Privvy benchmark CSV runs with median and nearest-rank p90."""
from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GROUP_FIELDS = ("browser", "browser_version", "os", "os_version", "cpu", "gpu", "model", "model_state", "viewport_width", "viewport_height", "image_width", "image_height", "page_element_count")
METRICS = ("client_scan_ms", "redaction_ms", "network_ms", "model_ms", "total_task_ms", "js_heap_bytes")


def percentile90(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(0.9 * len(ordered)) - 1)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation" / "benchmarks" / "summary.json")
    parser.add_argument("--minimum-runs", type=int, default=5)
    args = parser.parse_args()
    if args.minimum_runs < 2:
        raise ValueError("minimum-runs must be at least 2")

    with args.input.open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    if not rows:
        raise ValueError("Benchmark CSV has no rows")
    missing = [field for field in (*GROUP_FIELDS, *METRICS) if field not in rows[0]]
    if missing:
        raise ValueError(f"Benchmark CSV is missing columns: {', '.join(missing)}")

    groups: dict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        groups[tuple(row.get(field, "").strip() for field in GROUP_FIELDS)].append(row)

    summaries = []
    for key, group in sorted(groups.items()):
        if len(group) < args.minimum_runs:
            continue
        metrics = {}
        for field in METRICS:
            values = [float(row[field]) for row in group if row.get(field, "").strip()]
            if values:
                metrics[field] = {"samples": len(values), "median": statistics.median(values), "p90": percentile90(values)}
        summaries.append({"conditions": dict(zip(GROUP_FIELDS, key)), "runs": len(group), "metrics": metrics})

    output = {
        "schemaVersion": 1,
        "source": args.input.name,
        "minimumRuns": args.minimum_runs,
        "rawRowCount": len(rows),
        "comparableGroups": summaries,
        "excludedGroupCount": sum(1 for group in groups.values() if len(group) < args.minimum_runs),
        "method": "Median and nearest-rank p90; rows are grouped by browser, OS, hardware, model state, viewport/image dimensions, and page element count."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(summaries)} comparable benchmark group(s) to {args.output}")


if __name__ == "__main__":
    main()
