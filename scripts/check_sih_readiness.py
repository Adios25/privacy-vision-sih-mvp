#!/usr/bin/env python3
"""Report SIH evidence completeness without treating templates as completed runs."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def path(relative: str) -> Path:
    return ROOT / relative


def read_json(relative: str) -> dict | None:
    try:
        value = json.loads(path(relative).read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def markdown_section(relative: str, heading: str) -> str:
    try:
        text = path(relative).read_text(encoding="utf-8")
    except OSError:
        return ""
    marker = f"## {heading}"
    if marker not in text:
        return ""
    section = text.split(marker, 1)[1]
    return section.split("\n## ", 1)[0]


def table_rows(section: str) -> list[list[str]]:
    rows = []
    for line in section.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or cells[0].lower() in {"check", "field", "workflow", "claim", "claim surface"}:
            continue
        if all(set(cell) <= {"-", ":"} for cell in cells):
            continue
        rows.append(cells)
    return rows


def browser_passed(browser: str) -> bool:
    rows = table_rows(markdown_section("evaluation/manual-browser-verification.md", browser))
    metadata = table_rows(markdown_section("evaluation/manual-browser-verification.md", "Run record"))
    metadata_column = 1 if browser == "Chrome" else 2
    metadata_complete = len(metadata) >= 6 and all(
        len(row) > metadata_column
        and bool(row[metadata_column])
        and "pending" not in row[metadata_column].casefold()
        and "not run" not in row[metadata_column].casefold()
        for row in metadata
    )
    return metadata_complete and len(rows) >= 10 and all(
        len(row) > 2 and row[1].upper() == "PASS" and bool(row[2]) for row in rows
    )


def result_recorded(relative: str, expected_kind: str) -> bool:
    result = read_json(relative)
    return bool(
        result
        and result.get("datasetCaseCount", 0) > 0
        and result.get("caseKindFilter") == expected_kind
        and isinstance(result.get("metricsByCategory"), dict)
        and result.get("runMetadata", {}).get("capturedAt")
    )


def workflows_passed() -> bool:
    rows = table_rows(markdown_section("evaluation/demo-workflows.md", "Rehearsal record"))
    return len(rows) == 3 and all(
        len(row) > 4 and row[3].upper() == "PASS" and bool(row[4]) for row in rows
    )


def claim_review_passed() -> bool:
    rows = table_rows(markdown_section("evaluation/submission-claim-review.md", "Review record"))
    return len(rows) >= 5 and all(
        len(row) > 2 and row[1].upper() == "PASS" and bool(row[2]) for row in rows
    )


dataset = read_json("evaluation/redaction-v1.json")
provider_audit = read_json("evaluation/provider-evidence/audit-report.json")
benchmark = read_json("evaluation/benchmarks/summary.json")

checks = {
    "baselineRecord": path("evaluation/baseline/BASELINE.md").is_file(),
    "versionedSyntheticDataset": bool(dataset and dataset.get("syntheticOnly") is True and len(dataset.get("cases", [])) >= 20),
    "textPredictionCapture": path("scripts/capture_text_predictions.cjs").is_file(),
    "visualPredictionCapture": path("evaluation/qr_fixture_harness.html").is_file(),
    "evaluationTool": path("scripts/evaluate_redactions.py").is_file(),
    "browserChromePassedWithEvidence": browser_passed("Chrome"),
    "browserFirefoxPassedWithEvidence": browser_passed("Firefox"),
    "providerAuditPassed": bool(provider_audit and provider_audit.get("passed") is True),
    "visualResultsRecorded": result_recorded("evaluation/results/visual-v1.json", "visual"),
    "textResultsRecorded": result_recorded("evaluation/results/text-rules-v1.json", "text"),
    "benchmarkSummaryHasComparableRuns": bool(benchmark and benchmark.get("comparableGroups")),
    "workflowRehearsalsPassedWithEvidence": workflows_passed(),
    "submissionClaimsReviewed": claim_review_passed(),
}

report = {
    "ready": all(checks.values()),
    "checks": checks,
    "missing": [name for name, passed in checks.items() if not passed],
    "note": "A passing machine-readable gate confirms recorded artifacts, not their scientific quality. Review evidence manually."
}
print(json.dumps(report, indent=2))
raise SystemExit(0 if report["ready"] else 1)
