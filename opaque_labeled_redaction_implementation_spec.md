# Implementation Plan: QR/Barcode Masking, Shadow DOM Support, and Egress Hardening

## Context and Scope

Privvy's existing opaque redaction pipeline is already complete and working correctly:

- Sensitive screenshot regions are covered by fully opaque boxes.
- Safe placeholder tokens such as `[EMAIL]`, `[PHONE]`, and `[FACE]` are rendered on the boxes.
- The same semantic category is represented in the sanitized JSON payload.
- Raw pixels, raw DOM values, raw OCR text, and profile values are kept inside the browser.

Do **not** reimplement or replace that behavior. Do not add blur redaction, translucent masks, or synthetic replacement text in this iteration.

This plan focuses only on the following improvements:

1. QR and barcode detection with opaque masking.
2. Open Shadow DOM scanning and sanitization.
3. India-specific PII validation improvements.
4. Egress hardening and audit visibility.
5. Regression, security, and performance tests.

## Existing Repository Architecture

The project is a JavaScript MV3 browser extension. Use the existing architecture rather than creating unused TypeScript files:

```text
extension/content.js          DOM scanning and local sanitization
extension/popup.js            screenshot, detection merge, payload, planner UI
extension/ocr.js              local OCR detection
extension/geometry.js         coordinate conversion
extension/redactionMerger.js  shared active-mask and payload logic
extension/overlayCanvas.js    manual review overlay
tests/                        Node and Python test suites
```

Suggested new JavaScript modules:

```text
extension/qrDetector.js
extension/shadowWalker.js
extension/indiaPiiValidator.js
tests/advanced_redaction_tests.js
```

All new modules must be included in the extension packaging process and loaded before the code that uses them.

## Non-Negotiable Privacy Invariants

1. QR/barcode contents are detected locally and are never decoded into outbound payload fields.
2. QR/barcode screenshots are covered by the existing fully opaque mask renderer.
3. Existing placeholder-token behavior remains unchanged.
4. No raw value may be used to create a visible label.
5. No raw DOM value, OCR string, decoded QR content, or profile value may be sent to `/api/plan`.
6. Existing user-entered values must not be overwritten.
7. Manual, DOM, OCR, visual, QR, and barcode detections must use the existing shared active-mask merge pipeline.
8. Inactive masks must not be burned into the outbound screenshot.
9. Open Shadow DOM data must receive the same sanitization and leak-check treatment as normal DOM data.
10. Closed Shadow DOM must be treated as unsupported rather than being accessed through unsafe page instrumentation.

## Task 1: QR and Barcode Detection

### Objective

Automatically identify QR codes and barcodes in visual regions and add them to the existing redaction list before screenshot burn-in and payload creation.

### Target Files

- `extension/qrDetector.js`
- `extension/popup.js`
- `extension/redactionMerger.js`
- `extension/popup.html`
- `extension/manifest.json`
- `extension/manifest.firefox.json`

### Detection Strategy

Use local detection only, in this order:

1. Use the native `BarcodeDetector` API when available.
2. Use a bundled local QR decoder such as `jsQR` when native support is unavailable.
3. If neither is available, skip QR decoding without failing the scan.

Do not load QR or barcode libraries from a CDN.

Scan these sources:

- visible `<img>` elements;
- visible `<canvas>` elements;
- screenshot regions where DOM text is absent;
- supported SVG image regions if their pixels can be safely rasterized locally.

### Detection Output

Create a normal detection object and pass it through the existing redaction merger:

```js
{
  id: 'qr_1',
  type: 'QR',
  category: 'QR_BARCODE',
  label: '[QR_REDACTED]',
  active: true,
  isUserAdded: false,
  source: 'local-qr-detector',
  rect: { x, y, width, height },
  confidence: 1
}
```

For a barcode, use the same `QR_BARCODE` category and label unless a more specific safe category is required.

### Privacy Rules

- The decoder may inspect pixels locally but must not expose decoded text, URLs, JSON, XML, or raw values to the payload.
- Store only the existence of the code, its type/category, confidence, and bounding box.
- Cover the entire code region with the existing opaque renderer.
- Do not draw decoded content on the screenshot.
- If the code overlaps DOM metadata such as `alt`, `aria-label`, or nearby text, sanitize that metadata using the existing token rules.
- A detector failure must not disable the existing DOM, OCR, or visual redaction paths.

## Task 2: Open Shadow DOM Walker

### Objective

Detect and sanitize sensitive text and controls inside open Web Component shadow roots.

### Target Files

- `extension/shadowWalker.js`
- `extension/content.js`
- `extension/popup.js` if target metadata or payload handling requires changes
- `tests/advanced_redaction_tests.js`

### Required Behavior

Implement a recursive walker that traverses:

- ordinary DOM child nodes;
- open `element.shadowRoot` trees;
- text nodes;
- labels and semantic attributes;
- inputs, textareas, selects, buttons, links, and elements with ARIA roles.

Use `getBoundingClientRect()` to generate the same CSS viewport-relative coordinates used by the current scanner.

The walker must reuse the existing functions for:

- pattern sanitization;
- semantic purpose inference;
- placeholder generation;
- raw-term collection;
- detection metadata;
- target mapping and state fingerprints.

### Target Identity

Controls inside an open shadow root must remain addressable during safe local execution. Preserve enough local metadata to re-identify the element, such as a shadow path or a root-scoped target reference.

The target identity must not include raw form values.

### Limitations

Closed shadow roots cannot be reliably inspected by ordinary extension JavaScript. Document this limitation and ensure the scanner continues safely without throwing errors.

## Task 3: India-Specific PII Validation

### Objective

Improve precision for Indian identifiers without allowing validation failures to expose potentially sensitive data.

### Target Files

- `extension/indiaPiiValidator.js`
- `extension/content.js`
- `extension/ocr.js`
- `tests/advanced_redaction_tests.js`

### Required Validators

Implement local validators for:

- Verhoeff validation for Aadhaar-like 12-digit values;
- PAN format and holder-type validation;
- IFSC format validation.

Use validation results as confidence signals, not as the only condition for redaction.

Recommended behavior:

```text
Regex match + valid checksum
    -> high-confidence sensitive detection

Regex match + invalid checksum + identity/KYC context
    -> still redact

Regex match + invalid checksum + no sensitive context
    -> lower confidence; retain existing conservative behavior
```

Do not call IFSC validation a checksum unless a real bank-directory verification source is added. The basic IFSC rule only validates format.

## Task 4: Egress Hardening and Audit Visibility

### Objective

Make it easier to prove locally that the finalized outbound payload contains only sanitized content.

### Target Files

- `extension/popup.html`
- `extension/popup.css`
- `extension/popup.js`
- `extension/redactionMerger.js`

Add or improve a local audit section showing:

- active mask count;
- disabled mask count;
- QR/barcode mask count;
- Shadow DOM detection count;
- detected categories;
- known raw terms checked;
- number of structured payload matches;
- leak-check status;
- SHA-256 hash of the finalized sanitized payload.

Use wording such as:

```text
Sanitized payload verified locally
Known-value leak check: Passed
Payload hash: sha256-...
```

The hash is an integrity fingerprint, not proof that the payload contains no PII. The privacy assertion must continue to rely on actual sanitization, opaque image masking, and raw-term leak checks.

The audit UI must not persist or transmit the raw page merely to display a comparison.

## Task 5: Regression and Security Tests

### Target File

`tests/advanced_redaction_tests.js`

Add tests for:

### QR and barcode masking

1. A QR detection becomes an active `QR_BARCODE` mask.
2. The mask uses `[QR_REDACTED]`.
3. The screenshot pixels inside the QR bounds become fully opaque.
4. Decoded QR content is absent from the serialized outbound payload.
5. Detector failure does not break the normal scan path.

### Shadow DOM

6. Sensitive text inside an open shadow root is tokenized.
7. Sensitive controls inside an open shadow root receive bounding boxes.
8. Shadow-root controls remain safely addressable for local execution.
9. Closed shadow roots do not crash the scanner.

### India validators

10. Valid Verhoeff values are accepted.
11. Invalid Verhoeff values reduce confidence but do not bypass contextual redaction.
12. PAN format and holder-type rules work.
13. IFSC format validation accepts valid values and rejects malformed values.

### Egress safety

14. Raw names, emails, phones, and OCR terms are absent from the outbound payload.
15. Decoded QR text is absent from the outbound payload.
16. Existing user-entered field values are preserved.
17. The payload hash is deterministic for identical sanitized payloads.
18. Changing the sanitized payload changes the hash.

## Task 6: Performance Measurement

Measure these independently instead of enforcing one universal latency threshold:

- ordinary DOM scan time;
- Shadow DOM scan time;
- QR/barcode scan time;
- screenshot capture time;
- YOLO inference time;
- OCR time;
- redaction rendering time;
- payload serialization time;
- total scan time.

QR and barcode scanning should be limited to visible image/canvas regions and should not run repeatedly on unchanged frames.

Do not make a universal sub-500 ms requirement a correctness failure. First-load model initialization, OCR, device speed, browser, and page size can vary substantially.

## Optional Future Optimization: Worker Offloading

Worker migration is not required for this iteration. Consider it only after correctness is complete and performance measurements show a real problem.

If added later:

- move YOLO preprocessing/inference first;
- move QR preprocessing second;
- retain a main-thread fallback for Firefox and unsupported environments;
- never allow worker failure to bypass sanitization;
- do not move DOM traversal or computed-style inspection into a worker because workers cannot access the page DOM.

## Acceptance Criteria

- [ ] Existing opaque box and placeholder-token behavior remains unchanged.
- [ ] QR and barcode regions are detected locally when supported.
- [ ] QR and barcode regions are covered by the existing opaque redaction renderer.
- [ ] Decoded QR/barcode contents never enter the outbound payload.
- [ ] Open Shadow DOM text and controls are scanned and sanitized.
- [ ] Closed Shadow DOM is handled safely as unsupported.
- [ ] India-specific validators improve confidence without disabling contextual redaction.
- [ ] Audit UI reports mask counts and leak-check status locally.
- [ ] Payload hashing is deterministic and correctly scoped to the sanitized payload.
- [ ] Existing user-entered values remain untouched.
- [ ] Local planning continues to work offline.
- [ ] Chrome and Firefox extension packages build successfully.
- [ ] JavaScript and server test suites pass.

## Explicit Non-Goals

- Do not reimplement opaque redaction.
- Do not change the existing placeholder-token format without a demonstrated compatibility reason.
- Do not add blur-based redaction.
- Do not add translucent masks.
- Do not add synthetic replacement text.
- Do not decode QR/barcode content into server-visible metadata.
- Do not claim that SHA-256 alone proves zero PII.
- Do not claim support for closed Shadow DOM.
