# Testing handoff

Repository-side implementation is complete for the current SIH readiness plan. The remaining gate is evidence collection on real Chrome/Firefox installations and a configured model provider. Run these steps in order; do not skip failed stages.

## 1. Automated and build checks

```powershell
npm test
npm run check:version
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tests\run_tests.py
npm run build
```

`npm run build` replaces the existing `dist/chrome`, `dist/firefox`, and ZIP artifacts. Preserve any artifact you still need before running it.

## 2. Text-rule evaluation

```powershell
npm run eval:capture:text
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\evaluate_redactions.py --kind text --predictions evaluation\predictions\text-rules-v1.json --output evaluation\results\text-rules-v1.json
```

Review every false positive and false negative. This result covers rule matching on supplied strings, not OCR recognition accuracy.

## 3. Visual QR/barcode evaluation

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/evaluation/qr_fixture_harness.html` in each target browser, run the fixtures, save the prediction JSON, then evaluate it:

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\evaluate_redactions.py --kind visual --predictions PATH_TO_PREDICTIONS.json --output evaluation\results\visual-v1.json
```

## 4. Browser and workflow verification

- Load `dist/chrome` unpacked in Chrome.
- Load `dist/firefox/manifest.json` as a temporary Firefox add-on.
- Follow every row in `manual-browser-verification.md`.
- Rehearse every workflow in `demo-workflows.md`.
- Store only synthetic evidence.

## 5. Real provider evidence

Configure `server/vlm_bridge.py` as documented in `server/CONFIGURATION.md`. The bridge now refuses requests without protocol `1.0`, a passing leak check, timestamped per-scan consent, a redacted image, and a sanitized page graph.

Run a synthetic server workflow, export evidence from the popup, review the JSON, and audit it:

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\audit_planner_evidence.py --evidence evaluation\provider-evidence\sanitized-server-run-YYYY-MM-DD.json --require-server --output evaluation\provider-evidence\audit-report.json
```

## 6. Benchmarks

Export one sanitized evidence file per repetition. Capture at least five comparable repetitions for each condition, then extract timing-only rows (repeat `--evidence` for every run):

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\evidence_to_benchmark_csv.py --evidence PATH_TO_RUN_01.json --evidence PATH_TO_RUN_02.json --output evaluation\benchmarks\raw-results-YYYY-MM-DD.csv --browser Chrome --browser-version VERSION --os Windows --os-version VERSION --cpu "CPU MODEL" --gpu "GPU MODEL" --model-state warm
```

Then summarize the comparable rows:

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\summarize_benchmarks.py --input evaluation\benchmarks\raw-results-YYYY-MM-DD.csv --output evaluation\benchmarks\summary.json --minimum-runs 5
```

The popup now reports DOM scan, vision, redaction, server, model, network, end-to-end, payload size, and memory values.

## 7. Submission claim review

Review the README, demo script, and any slide deck against the recorded evidence. Complete every row in `evaluation/submission-claim-review.md`; do not mark a row `PASS` without a source or evidence path.

## 8. Readiness gate

After updating all manual records and evidence files:

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\check_sih_readiness.py
```

Do not declare readiness solely from this exit code. Review result quality, browser evidence, provider evidence, screenshots, and claims manually.
