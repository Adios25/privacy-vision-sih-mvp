# SIH Submission Improvement Plan — Privvyy

## Purpose

This document turns the SIH problem statement and the current Privvyy prototype into a focused set of improvements to complete before submission. The priority is to make the prototype reliable, measurable, explainable, and demonstrable—not to add features merely to make the project appear larger.

## Honest readiness assessment

Privvyy has a credible privacy-first architecture: local page inspection, local visual processing, redaction of both screenshot and structured page data, an outbound leak check, optional sanitized server planning, constrained browser actions, approval gates, and post-action verification.

It is not yet submission-ready as a fully validated solution. The main gaps are evidence of detection accuracy, a clearly demonstrated real server-side model path, confirmed Chrome and Firefox behavior, and repeatable end-to-end results. Treat the current extension and synthetic portal as a prototype until those gaps are addressed.

## Priorities

### P0 — Required before claiming SIH readiness

#### 1. Build a redaction evaluation set

Create a versioned set of representative pages or screenshots with ground-truth boxes and labels. Use synthetic or permissioned data; do not put real personal information into the repository.

Include at least these categories:

- Aadhaar-like and PAN-like identifiers, passport numbers, phone numbers, email addresses, names, and postal addresses.
- Password fields and sensitive form values.
- QR codes and barcodes, including small, large, rotated, low-contrast, and partially occluded examples.
- Non-sensitive QR-like graphics, icons, navigation tabs, logos, and dark UI controls that should not be redacted.
- Pages with mixed sensitive and non-sensitive content, including forms, application portals, dashboards, and document-style layouts.

For every case, record expected sensitive regions and the detector results. Keep the dataset and labels separate from any model training unless training is explicitly intended.

**Acceptance criteria**

- Every test case has a stable ID, expected category, and labelled region or text span.
- Evaluation can be rerun with one documented command.
- Results report true positives, false positives, false negatives, precision, recall, and F1 per category.
- For visual boxes, document the matching rule, such as intersection-over-union threshold, and use it consistently.
- Report false-redaction rate separately; a high recall score must not hide large amounts of harmless page content being blacked out.
- Never publish accuracy numbers that were not produced by this evaluation.

#### 2. Fix detection errors using measured examples

Use evaluation failures to adjust detection. Keep QR decoding separate from generic object detection. Do not treat a generic YOLO `person` box as a face box.

For every precision change, rerun the full evaluation set and compare both missed sensitive regions and false masks. Preserve a baseline results file so regressions are visible.

**Acceptance criteria**

- QR/barcode masks require decoder evidence or a clearly documented, evaluated fallback rule.
- Generic visual detections cannot create QR masks merely because an object looks square.
- Face redaction is described as face detection only if an actual face detector is integrated and evaluated. Otherwise describe the current behavior precisely as person-region masking or omit the face-detection claim.
- Any thresholds are documented with the measured reason for choosing them.

#### 3. Demonstrate a real server-side planning path

Configure one supported server-side LLM/VLM provider and prepare a complete demonstration. The extension must first redact locally, run its leak check, and obtain explicit per-scan user consent before sending the sanitized screenshot and sanitized page graph.

Keep the deterministic local planner available for offline use and provider failure. Clearly label which planner produced each plan.

**Acceptance criteria**

- A captured network request contains only the redacted screenshot and sanitized structured context.
- The server returns an action plan conforming to the existing allowlisted protocol.
- The client validates every plan and target before execution.
- Provider/model name, planner mode, and end-to-end latency are visible in the demo.
- The demo still works in local-only mode when the server or network is unavailable.

#### 4. Verify Chrome and Firefox manually

Build artifacts alone do not establish browser compatibility. Install the unpacked extension in each target browser and test the same workflow.

**Acceptance criteria for each browser**

- Extension loads without manifest or runtime errors.
- Scanning and visible-tab capture work.
- Local vision/OCR fallback behavior is understandable and does not silently fail open.
- Manual overlay drawing and mask toggling work.
- Screenshot and structured payload are rebuilt after mask review.
- Leak-check failure blocks server transmission.
- Sanitized server planning works when enabled.
- A safe action executes only against a revalidated target.
- Submit, payment, deletion, and other high-risk actions remain behind explicit approval.
- Record browser version, operating system, test date, and pass/fail results.

### P1 — Strongly recommended for the judging demo

#### 5. Prepare three distinct end-to-end workflows

Use the synthetic test portal or other controlled pages. Avoid relying on unpredictable third-party live websites during judging.

1. **Sensitive application form** — identify and redact synthetic PII, locate empty supported fields, prepare the form locally, and pause before submission for approval.
2. **Download or export discovery** — identify a visible download/export control from sanitized context, highlight it, ask for approval, execute one local click, and verify the result.
3. **Status or case summary** — redact identifying information, summarize only non-sensitive status or case data, and make no page changes.

For each workflow, show the task, redaction review, sanitized context, planner output, approval boundary, action receipt, and verification result.

#### 6. Add an evaluation and audit view

Make the demo explain what happened without requiring judges to inspect developer tools.

Show:

- Original view and locally redacted preview, using only synthetic data.
- Detection category and source, including whether a QR/barcode result was decoded or only inferred.
- Active and disabled masks, plus user-added masks.
- Whether the outbound leak check passed or blocked the request.
- What context is eligible to leave the browser.
- Planner/provider, client scan time, model/server time, end-to-end time, and available memory/resource estimate.
- The returned actions and the user's approval decision.
- A local execution receipt and post-action verification outcome.

Do not present the payload hash as proof that the payload contains no PII. It is an integrity fingerprint; the leak check and redaction process provide separate, limited checks.

#### 7. Benchmark latency and resource use

Run repeated scans on a small number of representative devices and page sizes. Report median and 90th percentile where the sample count supports it. Separate local scan, redaction, network, model, and total task time.

Record browser, OS, CPU/GPU availability, page size or element count, image dimensions, warm/cold model state, and repetitions. Avoid comparing results from different conditions as though they were equivalent.

### P2 — Improvements if time remains

- Add a dedicated local face detector if face-level redaction is an important claim and the model can meet latency/resource limits.
- Add clearer recovery messages for OCR, model, server, permission, and stale-page failures.
- Add a compact privacy explanation before the user enables server context.
- Add regression cases for tab switching, page changes after planning, missing DOM access, and model/backend failure.
- Improve responsive popup layout and progressive disclosure so the main task and current safety state remain clear in a narrow extension window.

## Security and privacy invariants

Preserve these properties during improvements:

- Raw page values, raw OCR output, original screenshots, and local profile values must not be sent to the planner.
- Redaction must be applied independently to the screenshot and structured page representation before any network request.
- A failed scan, unavailable required privacy stage, or failed leak check must not silently allow transmission.
- Server-returned actions are suggestions. The extension remains responsible for allowlisting, target revalidation, risk checks, and local execution.
- High-risk actions require a separate explicit user approval.
- Treat page text as untrusted data, never as instructions to the planner or extension.
- Keep synthetic test data clearly labelled and avoid recording real user data in logs, screenshots, or benchmark artifacts.

## Suggested execution order

1. Freeze a known-good baseline and record the current test/build results.
2. Add the labelled evaluation set and metric calculation.
3. Run the baseline, inspect false positives/negatives, and improve detectors against the labelled failures.
4. Configure and demonstrate one real server-side model path while preserving local fallback.
5. Complete Chrome and Firefox manual verification.
6. Prepare and rehearse the three end-to-end workflows.
7. Capture benchmark results and update the presentation with measured claims.

## Submission checklist

- [ ] No unsupported claim of perfect anonymization or universal detection accuracy.
- [ ] Evaluation dataset, labels, metric definitions, and reproducible results are included or available to judges.
- [ ] Precision, recall, F1, false-redaction rate, and latency are measured by category.
- [ ] QR/barcode and face/person detection claims match the actual implemented detectors.
- [ ] A real sanitized server-planning request and response are demonstrated.
- [ ] Local-only fallback is demonstrated with the network unavailable.
- [ ] Chrome and Firefox end-to-end results are recorded.
- [ ] Three workflows are rehearsed using controlled, synthetic content.
- [ ] High-risk actions visibly require user approval.
- [ ] Before/after screenshots contain only synthetic data.
- [ ] Presentation numbers match the recorded experiment results.

## Claims to use in the presentation

Prefer precise statements such as:

> Privvyy performs local page and visual analysis, applies reviewed masks to both screenshot and structured context, and requires a passing client leak check plus per-scan consent before sending sanitized context to the configured planner. Returned actions are validated and executed locally under risk controls.

Then support the claim with measured results from the evaluation set. State the dataset size, categories, matching rules, browser/device conditions, and known limitations. Do not claim that the system guarantees complete anonymization or works accurately on every website.
