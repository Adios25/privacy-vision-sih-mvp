# Redaction evaluation v1

`redaction-v1.json` is a versioned, synthetic-only evaluation set with 22 cases: 10 labeled text cases and 12 visual cases. Every case declares its source type and coordinate system. Its SVG fixtures are evaluation data, not training data. QR payloads use `example.test` addresses and contain no personal data.

Regenerate the deterministic SVG fixtures after changing `scripts/generate_eval_fixtures.cjs`:

```powershell
node scripts/generate_eval_fixtures.cjs
```

## Run

Create a predictions JSON using the schema below, then run:

```powershell
python scripts/evaluate_redactions.py --predictions path\to\predictions.json
```

Capture predictions from the production text-rule engine and evaluate that limited scope:

```powershell
npm run eval:capture:text
python scripts/evaluate_redactions.py --kind text --predictions evaluation\predictions\text-rules-v1.json --output evaluation\results\text-rules-v1.json
```

This measures pattern and labelled-text matching on supplied synthetic strings. It does not measure Tesseract image recognition, DOM field semantics, visual masking, or complete product accuracy. The generated prediction file excludes matched values.

The default dataset is `evaluation/redaction-v1.json`. Output is written to `evaluation/results-v1.json`; pass `--output` to choose another path. No baseline results are checked in because no detector run against these labels has been captured yet. Do not treat omitted predictions as a measured detector run; the evaluator interprets omitted case IDs as zero detections and therefore counts misses.

The QR/barcode capture page runs the actual local decoder over the visual fixture images. Start a static server from the project root, open `http://127.0.0.1:8000/evaluation/qr_fixture_harness.html`, enter browser/OS details, run fixtures, and download the prediction JSON. Then score only those visual cases:

```powershell
python scripts/evaluate_redactions.py --kind visual --predictions redaction-visual-predictions-v1.json --output evaluation/results/visual-v1.json
```

The harness omits decoded barcode contents by design. Record detector source, format, confidence, and per-case latency only. The text-rule adapter above is a separate limited measurement; neither report alone represents full redaction accuracy.

## Prediction format

Text offsets are zero-based, half-open Unicode code-point spans into the case's `text` value. Visual boxes use `[x, y, width, height]` in the case image's pixel coordinates.

```json
{
  "schemaVersion": 1,
  "cases": {
    "form-pii-001": {
      "detections": [
        { "category": "EMAIL", "start": 23, "end": 44 }
      ]
    },
    "qr-small-001": {
      "detections": [
        { "category": "QR_BARCODE", "box": [16, 18, 42, 42], "source": "local-zxing-decoder" }
      ]
    }
  }
}
```

Each expected item can match at most one prediction, and categories must match. Text-span and box matches both require intersection-over-union (IoU) of at least `0.5`. Precision, recall, F1, and false-redaction rate are detection-count metrics by category. For visual categories, false-redaction area fraction is the union area of unmatched predicted boxes, clipped to fixture bounds, divided by the total area of all visual fixtures, including negative controls. Overlapping false masks count once. Text categories have no area fraction. `null` means a metric has no denominator; it is not zero.

This dataset is sufficient to run the repository's v1 evaluation workflow, but it is not proof of broad real-world performance. SVG fixtures cover small, large, rotated, low-contrast, centrally occluded QR codes; normal, low-contrast, and rotated Code 128 barcodes; plus square icon, logo, dark-control, and QR-like negative controls. Text fixtures cover the required identity/contact/form categories and safe navigation text. Expand it for new page families or detector claims. Confirm labels against rendered fixture geometry; do not count fixture generation as detector evaluation.
