# SIH readiness evidence status

Updated: 2026-09-26. This is a prototype status report, not a readiness declaration.

| Work item | Status | Evidence / remaining work |
|---|---|---|
| Automated baseline | RECORDED | `evaluation/baseline/BASELINE.md`; npm and Python suites pass on the recorded worktree. |
| Labeled evaluation set | IMPLEMENTED, NOT SCORED | `redaction-v1.json` has 22 synthetic cases: 10 text and 12 visual, with explicit source/coordinate metadata, QR/Code 128 variations, and four visual negative controls. Broader real-world claims still require a larger external validation set. |
| Detector prediction capture | IMPLEMENTED, NOT RUN | `qr_fixture_harness.html` captures decoder boxes/provenance; `capture_text_predictions.cjs` captures production text-rule spans without values. Neither result capture has been run for final evidence. |
| Accuracy results | NOT MEASURED | No detector predictions have been captured; no precision/recall/F1 claims are supported. |
| Detector corrections | IMPLEMENTED, NOT RE-EVALUATED | COCO `person` maps to `PERSON_REGION`; generic YOLO QR candidates are filtered; password label matching is included. Additional correction must be driven by the pending measured results. |
| Server planner path | IMPLEMENTED; DEMO BLOCKED | WebSocket bridge validates protocol/leak/consent/input shape, constrains model output, and returns provider/model plus model/server time. The popup revalidates targets, surfaces metadata, and rejects bridge errors. No provider key, running planner, local Ollama service, or model was available during this run. |
| Audit view | IMPLEMENTED, NOT VERIFIED | Popup exposes redaction review, sanitized preview, leak state, local/server plans, timing, approval, receipt, and sanitized evidence export. It has not been judged in a real browser run. |
| Chrome/Firefox checks | NOT RUN | Only Codex's in-app browser was available in this environment. Use `manual-browser-verification.md` on Chrome and Firefox installations. |
| Demo workflows | DOCUMENTED, NOT REHEARSED | See `demo-workflows.md`; perform and record all three runs manually. |
| Latency/resource benchmark | TOOLING READY, NOT RUN | Sanitized evidence-to-CSV extraction, raw template, and comparable-group median/p90 summarizer exist. No benchmark values captured. |
| Submission claims | NOT READY | Update slides/README claims only after detector results, provider evidence, browser records, and benchmarks exist. |

## Implementation handoff

The remaining plan items now have repository support:

- Text-rule and visual QR/barcode prediction capture.
- Per-category evaluator with false-mask union-area accounting.
- Twelve deterministic visual fixtures, including four negative controls.
- Timestamped per-scan consent and leak-check validation at both client and WebSocket bridge boundaries.
- Sanitized evidence export and provider evidence audit.
- Separate redaction, network, model, server, and end-to-end timing fields.
- Benchmark CSV template, comparable-condition grouping, median, and p90 summarization.
- Timing-only benchmark row extraction from reviewed sanitized evidence exports.
- Browser, workflow, provider, and final readiness runbooks.

No manual result has been upgraded by these implementation changes. Follow `evaluation/TESTING_HANDOFF.md` when testing begins.

## Previously recorded automated checks

These checks predate the final implementation pass. They are historical evidence only; rerun the commands in `TESTING_HANDOFF.md` before submission.

- `npm test` — PASS.
- Bundled Python runtime `tests/run_tests.py` — PASS.
- `npm run build` — NOT RUN; current build script deletes and recreates existing distribution folders and ZIPs. Existing artifacts were preserved.
- `node --check` for the QR fixture generator, popup, and QR detector — PASS.
- QR harness inline script parse — PASS.
- `scripts/evaluate_redactions.py --help` — PASS.
- Evaluator metric and box-union arithmetic smoke check — PASS; no detector results file was created.

The expanded evaluation fixture generator ran successfully after the final implementation changes. This validates fixture generation only; it does not measure detector accuracy. No generated evaluator results or fabricated performance values are checked in.
