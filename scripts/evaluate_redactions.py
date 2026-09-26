#!/usr/bin/env python3
"""Score detector outputs against a versioned Privvy evaluation dataset."""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = ROOT / "evaluation" / "redaction-v1.json"
DEFAULT_OUTPUT = ROOT / "evaluation" / "results-v1.json"
BOX_IOU_THRESHOLD = 0.5
SPAN_IOU_THRESHOLD = 0.5


def overlap_ratio(a: list[int], b: list[int]) -> float:
    left, top = max(a[0], b[0]), max(a[1], b[1])
    right = min(a[0] + a[2], b[0] + b[2])
    bottom = min(a[1] + a[3], b[1] + b[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    union = a[2] * a[3] + b[2] * b[3] - intersection
    return intersection / union if union else 0.0


def span_iou(a: dict, b: dict) -> float:
    intersection = max(0, min(a["end"], b["end"]) - max(a["start"], b["start"]))
    union = max(a["end"], b["end"]) - min(a["start"], b["start"])
    return intersection / union if union else 0.0


def clipped_box_union_area(boxes: list[list[float]], width: int, height: int) -> float:
    clipped = []
    for x, y, box_width, box_height in boxes:
        left, top = max(0, x), max(0, y)
        right, bottom = min(width, x + box_width), min(height, y + box_height)
        if right > left and bottom > top:
            clipped.append((left, top, right, bottom))
    x_edges = sorted({edge for box in clipped for edge in (box[0], box[2])})
    area = 0.0
    for x0, x1 in zip(x_edges, x_edges[1:]):
        intervals = sorted((top, bottom) for left, top, right, bottom in clipped if left < x1 and right > x0)
        covered_y = 0.0
        if intervals:
            start, end = intervals[0]
            for next_start, next_end in intervals[1:]:
                if next_start <= end:
                    end = max(end, next_end)
                else:
                    covered_y += end - start
                    start, end = next_start, next_end
            covered_y += end - start
        area += (x1 - x0) * covered_y
    return area


def pair_counts(expected: list[dict], predicted: list[dict], modality: str) -> tuple[int, int, int, list[dict]]:
    threshold = BOX_IOU_THRESHOLD if modality == "visual" else SPAN_IOU_THRESHOLD
    remaining = set(range(len(expected)))
    true_positive = false_positive = 0
    errors = []
    for prediction in predicted:
        pred_value = prediction.get("box") if modality == "visual" else prediction
        match = None
        for index in remaining:
            target = expected[index]
            if prediction.get("category") != target.get("category"):
                continue
            target_value = target.get("box") if modality == "visual" else target
            score = overlap_ratio(pred_value, target_value) if modality == "visual" else span_iou(pred_value, target_value)
            if score >= threshold:
                match = index
                break
        if match is None:
            false_positive += 1
            errors.append({"kind": "false_positive", "prediction": prediction})
        else:
            true_positive += 1
            remaining.remove(match)
    false_negative = len(remaining)
    errors.extend({"kind": "false_negative", "expected": expected[index]} for index in sorted(remaining))
    return true_positive, false_positive, false_negative, errors


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def evaluate(dataset: dict, predictions: dict, kind: str | None = None, dataset_path: Path = DEFAULT_DATASET) -> dict:
    if not dataset.get("syntheticOnly"):
        raise ValueError("Evaluation dataset must declare syntheticOnly=true")
    cases = [case for case in dataset["cases"] if kind is None or case["kind"] == kind]
    if not cases:
        raise ValueError(f"Dataset has no cases of kind {kind!r}")
    expected_ids = {case["id"] for case in cases}
    prediction_cases = predictions.get("cases", {})
    unknown_ids = set(prediction_cases) - expected_ids
    if unknown_ids:
        raise ValueError(f"Predictions contain unknown case IDs: {', '.join(sorted(unknown_ids))}")

    if dataset.get("schemaVersion") != 1 or predictions.get("schemaVersion") != 1:
        raise ValueError("Dataset and prediction schemaVersion must both be 1")
    ids = [case.get("id") for case in dataset.get("cases", [])]
    if len(ids) != len(set(ids)) or any(not case_id for case_id in ids):
        raise ValueError("Dataset case IDs must be present and unique")
    for case in dataset.get("cases", []):
        if case.get("synthetic") is not True:
            raise ValueError(f"Dataset case must declare synthetic=true: {case.get('id')}")
        if not case.get("sourceType") or not case.get("coordinateSystem"):
            raise ValueError(f"Dataset case is missing sourceType or coordinateSystem: {case.get('id')}")

    totals = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "false_redaction_area": 0})
    details = []
    visual_categories = {item["category"] for case in cases if case["kind"] == "visual" for item in case["expected"]}
    visual_area = sum(case["imageSize"][0] * case["imageSize"][1] for case in cases if case["kind"] == "visual")
    for case in cases:
        if case["kind"] not in ("text", "visual"):
            raise ValueError(f"Unsupported case kind in {case['id']}: {case['kind']}")
        modality = "visual" if case["kind"] == "visual" else "text"
        predicted = prediction_cases.get(case["id"], {}).get("detections", [])
        if case["kind"] == "visual":
            width, height = case["imageSize"]
            fixture = (dataset_path.parent / case["fixture"]).resolve()
            fixtures_root = (dataset_path.parent / "fixtures").resolve()
            if not fixture.is_relative_to(fixtures_root) or not fixture.is_file():
                raise ValueError(f"Missing or unsafe visual fixture for {case['id']}: {case['fixture']}")
            if fixture.suffix.lower() == ".svg":
                root = ET.parse(fixture).getroot()
                if (root.get("width"), root.get("height")) != (str(width), str(height)):
                    raise ValueError(f"Visual fixture dimensions do not match labels for {case['id']}")
            for item in case["expected"]:
                if len(item.get("box", [])) != 4 or item["box"][2] <= 0 or item["box"][3] <= 0:
                    raise ValueError(f"Invalid expected box in {case['id']}: {item}")
            for detection in predicted:
                if len(detection.get("box", [])) != 4 or any(not isinstance(x, (int, float)) for x in detection["box"]) or detection["box"][2] <= 0 or detection["box"][3] <= 0:
                    raise ValueError(f"Invalid predicted box in {case['id']}: {detection}")
        else:
            text = case["text"]
            for item in case["expected"]:
                if not (0 <= item.get("start", -1) < item.get("end", -1) <= len(text)):
                    raise ValueError(f"Invalid expected text span in {case['id']}: {item}")
            for detection in predicted:
                if not (0 <= detection.get("start", -1) < detection.get("end", -1) <= len(text)):
                    raise ValueError(f"Invalid predicted text span in {case['id']}: {detection}")
            image_area = 0

        tp, fp, fn, errors = pair_counts(case["expected"], predicted, modality)
        categories = {item["category"] for item in case["expected"] + predicted}
        for category in categories:
            expected_category = [item for item in case["expected"] if item["category"] == category]
            predicted_category = [item for item in predicted if item.get("category") == category]
            ctp, cfp, cfn, _ = pair_counts(expected_category, predicted_category, modality)
            row = totals[category]
            row["tp"] += ctp
            row["fp"] += cfp
            row["fn"] += cfn
            if modality == "visual":
                visual_categories.add(category)
                false_positives = [e["prediction"] for e in errors if e["kind"] == "false_positive" and e["prediction"].get("category") == category]
                row["false_redaction_area"] += clipped_box_union_area(
                    [item["box"] for item in false_positives], width, height
                )
        details.append({
            "caseId": case["id"],
            "kind": case["kind"],
            "truePositive": tp,
            "falsePositive": fp,
            "falseNegative": fn,
            "predictions": predicted,
            "errors": errors,
        })

    metrics = {}
    for category, row in sorted(totals.items()):
        tp, fp, fn = row["tp"], row["fp"], row["fn"]
        precision = tp / (tp + fp) if tp + fp else None
        recall = tp / (tp + fn) if tp + fn else None
        f1 = 2 * precision * recall / (precision + recall) if precision is not None and recall is not None and precision + recall else 0.0 if precision is not None and recall is not None else None
        metrics[category] = {
            **{key: row[key] for key in ("tp", "fp", "fn")},
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "falseRedactionRate": fp / (tp + fp) if tp + fp else None,
            "falseRedactionAreaFraction": row["false_redaction_area"] / visual_area if category in visual_categories and visual_area else None,
        }
    return {
        "schemaVersion": 1,
        "datasetId": dataset["datasetId"],
        "runMetadata": predictions.get("runMetadata", {}),
        "datasetCaseCount": len(cases),
        "caseKindFilter": kind,
        "matching": {"textSpanIoUThreshold": SPAN_IOU_THRESHOLD, "visualBoxIoUThreshold": BOX_IOU_THRESHOLD},
        "metricsByCategory": metrics,
        "cases": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--kind", choices=("text", "visual"), help="Evaluate only cases of this modality")
    parser.add_argument("--predictions", type=Path, required=True, help="Detector outputs in the JSON schema described in evaluation/README.md")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = evaluate(load_json(args.dataset), load_json(args.predictions), args.kind, args.dataset.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote evaluation for {result['datasetCaseCount']} cases to {args.output}")


if __name__ == "__main__":
    main()
