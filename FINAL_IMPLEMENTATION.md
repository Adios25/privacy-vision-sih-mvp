# Privvy: Final Implementation

## 1. Project Summary

Privvy is a privacy-preserving browser vision agent for Chrome and Firefox. It performs screen and page analysis locally, sanitizes sensitive content before any optional server request, and returns browser actions that are validated and executed locally.

The project uses form completion as a safe demonstration workflow, but the architecture supports broader browser-agent actions such as scrolling, clicking, selecting options, and navigating workflows.

```text
Browser page
    ↓
Local DOM / Shadow DOM / OCR / vision analysis
    ↓
Local privacy gate
    ├── Opaque screenshot masking
    ├── DOM and text sanitization
    ├── QR/barcode masking
    └── Leak check
    ↓
Sanitized structural payload
    ├── Offline local planner
    └── Optional server planner
    ↓
Local action validation and execution
```

## 2. Implemented Features

### Local vision processing

- YOLO11n runs locally through ONNX Runtime Web.
- The current packaged runtime uses the WASM backend for reliable Chrome and Firefox support.
- WebGPU failure does not block the scan path.
- Vision inference time, backend, and detection information are shown in the UI.

### Privacy-preserving redaction

- Sensitive screenshot regions are covered with fully opaque dark or black rectangles.
- Existing placeholder-token behavior remains unchanged.
- Sensitive DOM values are replaced locally with safe tokens.
- Original user-entered values are never overwritten.
- Raw DOM values, OCR strings, profile values, and QR/barcode contents are excluded from the outbound payload.

### Manual redaction review

- Users can draw manual bounding boxes over missed sensitive regions.
- Automatic masks can be toggled off for false positives.
- Manual boxes use the `MANUAL` type and labels such as `[REDACTED_MANUAL_1]`.
- Active manual masks affect both the screenshot and the structural DOM payload.
- Planning is gated until the redaction review is approved.

### QR and barcode protection

- Native `BarcodeDetector` support is used when available.
- QR and barcode detections are represented as `QR_BARCODE` masks.
- Decoder output is never stored or sent to the server.
- QR/barcode regions use the safe label `[QR_REDACTED]`.
- Detector failure does not disable DOM, OCR, or normal visual redaction.
- Semantic QR/barcode fixtures are included in the local test website.

### Open Shadow DOM support

- The scanner recursively walks ordinary DOM nodes and open Shadow DOM trees.
- Sensitive text and controls inside open shadow roots receive the same sanitization treatment as regular DOM content.
- Shadow-root controls remain available in the local target map for validated action execution.
- Closed Shadow DOM is intentionally treated as unsupported because it cannot be safely inspected through ordinary extension APIs.

### India-specific PII validation

The extension includes local validators for:

- Aadhaar-like values using Verhoeff validation
- PAN format and holder type
- IFSC format

Validation is used as a confidence signal. A validation failure does not automatically disable conservative or contextual redaction.

### Local egress audit

The popup includes a local audit panel showing:

- Active mask count
- Disabled mask count
- QR/barcode mask count
- Open Shadow DOM detection count
- Structured payload matches
- Leak-check result
- SHA-256 hash of the sanitized payload

The hash is an integrity fingerprint. It is not used as the privacy guarantee. Privacy depends on local sanitization, opaque masking, leak checks, and blocking unsafe requests.

## 3. Extension UI

The popup and side panel include:

- Editable assistance task
- Local scan controls
- Redaction ledger and category counters
- Interactive redaction review
- Manual overlay toggle
- Redaction approval gate
- Local egress audit
- Sanitized payload inspection
- OCR and vision performance metrics
- Offline action plan
- Optional server planner approval
- Local action execution receipt

The UI is responsive and adapts to narrow popup and wider side-panel windows. Long hashes and payload values wrap safely, and review controls stack on smaller displays.

## 4. Planning and Automation Model

### Offline action plan

The offline planner is retained as a resilience feature. It runs entirely in the browser and demonstrates graceful operation when server planning is unavailable.

Supported local behavior includes:

- Filling supported empty fields
- Preserving existing values
- Validating action targets before execution
- Clicking safe controls
- Blocking unsafe or stale actions
- Showing an execution receipt

Form completion is a demonstration use case rather than the sole purpose of the extension.

### Server planner

The server planner is optional. A request is permitted only after:

1. Local scanning completes.
2. The screenshot is redacted.
3. The structural payload is sanitized.
4. The known-value leak check passes.
5. The user approves server context transmission.
6. The user approves the redaction review.

High-risk actions, including synthetic submission, require a separate explicit approval.

## 5. Synthetic Test Website

The local test website at `http://127.0.0.1:8787` includes:

- Synthetic names, emails, phone numbers, addresses, dates, Aadhaar-like values, and passport values
- Prefilled and user-entered field preservation tests
- Synthetic face and signature visual assets
- Synthetic identity-document visual asset
- QR-code visual fixture
- Barcode visual fixture
- Open Shadow DOM email and phone fixture
- Untrusted page instructions for prompt-injection safety testing
- Multiple service scenarios: internship, KYC, telehealth, and visa

All values are dummy test data and should remain local.

## 6. Important Privacy Invariants

- No raw page value is sent before sanitization.
- No decoded QR/barcode value enters the server payload.
- Inactive masks are not burned into the outbound screenshot.
- Manual masks affect both pixels and structural text.
- Existing user-entered values are never modified by planning.
- The server receives only sanitized image and structural context.
- Local fallback planning continues without network access.
- Closed Shadow DOM is not accessed through unsafe instrumentation.

## 7. Main Files

```text
extension/content.js              DOM and open Shadow DOM scanning
extension/popup.js                UI, screenshot, detection merge, planner flow
extension/ocr.js                  Local OCR detection and contextual matching
extension/geometry.js              Coordinate conversion utilities
extension/redactionMerger.js       Shared active-mask and payload redaction logic
extension/overlayCanvas.js         Manual redaction interaction overlay
extension/qrDetector.js             Local QR/barcode detection
extension/shadowWalker.js           Open Shadow DOM traversal
extension/indiaPiiValidator.js      Indian identifier validators
test-website/                      Synthetic end-to-end test portal
tests/                             Unit, security, OCR, vision, and server tests
```

## 8. Running the Project

From the repository root:

```powershell
cd "C:\Users\Soumil Sawant\Documents\SIH_PROJECT\privacy-vision-sih-mvp"
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server/server.py
```

Open the test website:

```text
http://127.0.0.1:8787
```

Run JavaScript tests:

```powershell
npm test
```

Run the Python SIH tests:

```powershell
& "C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tests/run_tests.py
```

Build both browser packages:

```powershell
npm run build
```

Load Chrome from:

```text
dist\chrome
```

Load Firefox from:

```text
dist\firefox\manifest.json
```

## 9. Validation Results

The following checks pass:

- JavaScript unit tests
- Manual redaction tests
- Advanced redaction tests
- OCR regression tests
- YOLO geometry tests
- Static syntax and manifest checks
- Python SIH test suite
- Chrome package build
- Firefox package build
- Git whitespace validation

## 10. Known Limitations

- Native QR/barcode decoding depends on browser `BarcodeDetector` support.
- Closed Shadow DOM is not supported by design.
- The WASM backend is slower than hardware-accelerated inference on some systems.
- OCR latency depends on device performance and page complexity.
- The SHA-256 payload hash does not prove that a payload is free from PII.
- Production deployments should add stronger server authentication, transport security, request-size limits, and operational monitoring.

## 11. Recommended Hackathon Demonstration

1. Open the synthetic test website.
2. Select the KYC or visa scenario.
3. Click **Scan current page**.
4. Show that names, identifiers, faces, signatures, QR/barcode regions, and Shadow DOM values are masked locally.
5. Open **Review & Adjust Redactions**.
6. Add a manual box or disable a false-positive mask.
7. Show the local egress audit with zero structured matches.
8. Approve the redaction list.
9. Demonstrate the offline action plan.
10. Optionally enable sanitized server context and show the server-generated plan.
11. Execute only validated safe actions.
12. Keep high-risk submission behind explicit approval.

The core message is:

> Privvy does not merely hide sensitive pixels. It enforces a local privacy gate across screenshots, DOM structure, OCR, QR/barcode regions, and open Shadow DOM before server reasoning is allowed.
