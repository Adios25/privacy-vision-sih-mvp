# High-Precision QR and Barcode Redaction Implementation Plan

## Objective

Improve Privvy so it reliably redacts actual QR codes and barcodes while avoiding unrelated controls such as URL, PDF, Multi-URL, Contact, Email, Phone, Social, logos, navigation items, icons, and parent containers.

The implementation must preserve all currently working features.

## Strict Preservation Requirements

1. Do not remove, rewrite, or broadly refactor existing functionality.
2. Do not change OCR redaction, DOM PII detection, Aadhaar detection, phone detection, email detection, address detection, Shadow DOM scanning, manual redaction, payload hashing, action planning, or active-tab cancellation.
3. Do not use the generic YOLO model as the primary QR detector.
4. Do not use `parentElement.innerText` to classify QR/barcode visuals.
5. Do not redact a parent container when only a child image contains a QR/barcode.
6. Do not weaken, remove, or rewrite existing tests.
7. Do not load decoder libraries from a CDN.
8. Do not send screenshots or raw QR/barcode values to a third-party service.
9. Keep QR/barcode decoding local to the browser.
10. Make isolated QR/barcode changes only.
11. Preserve Chrome and Firefox compatibility.
12. If an unrelated feature fails, stop and revert only the QR-specific change that caused the regression.

## Baseline Before Editing

Run these commands before making changes:

```powershell
npm test
npm run build
& 'C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tests/run_tests.py
```

Record the baseline results. Do not attribute pre-existing failures to this implementation.

## Files to Inspect

Review these files before editing:

- `extension/popup.js`
- `extension/qrDetector.js`
- `extension/content.js`
- `extension/redactionMerger.js`
- `extension/geometry.js`
- `extension/popup.html`
- `tests/advanced_redaction_tests.js`
- `tests/manual_redaction_tests.js`
- `tests/yolo_tests.js`
- `tests/static_checks.mjs`
- `scripts/package_extensions.py`
- `package.json`

Trace the current flow:

```text
Screenshot capture
      ↓
BarcodeDetector / QR detection
      ↓
DOM visual semantic detection
      ↓
YOLO visual detection
      ↓
Detection merge
      ↓
Redaction state
      ↓
Canvas blackout
      ↓
Sanitized DOM and image payload
      ↓
Optional server request
```

## 1. Make a Dedicated Decoder the QR Authority

Use the native `BarcodeDetector` when it is available.

Because browser support is inconsistent, especially across Firefox, add a locally bundled fallback decoder. Prefer one of:

- `@zxing/browser` for QR and multiple 1D/2D barcode formats.
- `jsQR` for QR-only fallback.

Do not load either library from a remote CDN.

The fallback must run locally and must not transmit the screenshot or decoded raw value.

The decoder should produce metadata similar to:

```js
{
  type: 'QR',
  category: 'QR_BARCODE',
  source: 'local-barcode-decoder',
  format: 'qr_code',
  confidence: 1,
  coordinateSpace: 'screenshot',
  rect: {
    x: 100,
    y: 200,
    width: 180,
    height: 180
  }
}
```

Do not store `rawValue` in the redaction manifest or outgoing payload.

## 2. Remove QR Responsibility from Generic YOLO

The generic YOLO model must not independently activate QR masks.

If YOLO produces a QR-like result, treat it as an unverified candidate:

```js
{
  type: 'VISUAL',
  category: 'QR_BARCODE',
  source: 'YOLO11n',
  verified: false,
  active: false
}
```

Only a dedicated decoder result may automatically become an active QR/barcode mask.

Do not apply QR filtering rules to:

- `FACE`
- `SIGNATURE`
- `IDENTITY_DOCUMENT`
- `EMAIL`
- `PHONE`
- `ADDRESS`
- OCR detections
- DOM detections
- Manual detections

## 3. Fix DOM Visual Semantic Detection

Do not use this for QR classification:

```js
element.parentElement.innerText
```

The parent may contain unrelated text such as:

```text
QR Code Generator
URL
PDF
Multi-URL
Contact
Plain Text
App
SMS
Email
Phone
Social
```

Use only direct metadata from the visual element:

```js
const directContext = [
  element.getAttribute('alt'),
  element.getAttribute('aria-label'),
  element.getAttribute('data-visual-purpose'),
  element.getAttribute('title'),
  element.getAttribute('name'),
  element.id,
  element.className
]
  .filter(Boolean)
  .join(' ')
  .toLowerCase();
```

Only create a semantic QR candidate when:

1. The element is an `IMG`, `CANVAS`, or explicitly marked `SVG`.
2. Its own metadata clearly identifies QR/barcode content.
3. Its own metadata does not identify a logo, generator, scanner, menu, navigation item, or icon.
4. It is not merely a child of a QR-related parent container.

Do not change existing non-QR semantic behavior.

## 4. Prefer Actual Visual Elements

For QR/barcode candidates, prefer rectangles belonging to:

- `IMG`
- `CANVAS`
- `SVG`

Do not create automatic QR masks for:

- `DIV`
- `SECTION`
- `BUTTON`
- `NAV`
- `HEADER`
- Parent containers

If a QR label is attached to a container:

1. Search for a visual child.
2. Use the child rectangle only if it is a valid visual target.
3. If no visual child exists, do not create an automatic QR mask.
4. Keep the parent container unchanged.

## 5. Add a Two-Pass Decode Strategy

To improve recall for small QR thumbnails:

```text
Pass 1: decode the full captured screenshot.
Pass 2: decode visible IMG, CANVAS, and SVG elements individually.
```

For small candidates:

- Render the candidate at 2x or 4x resolution.
- Decode the upscaled candidate locally.
- Convert the decoder rectangle back to screenshot or viewport coordinates.

Only successful decoder results may become active masks.

## 6. Validate Coordinate Conversion

Every detection must declare its coordinate space:

```js
coordinateSpace: 'screenshot'
```

or:

```js
coordinateSpace: 'css-viewport'
```

Convert coordinates exactly once:

```text
Screenshot coordinates
        ↓
CSS viewport coordinates
        ↓
Preview canvas coordinates
```

Do not apply device-pixel-ratio scaling twice.

Use decoder `boundingBox` or `cornerPoints` directly. Do not infer a QR rectangle from nearby text or a YOLO box.

During development, log:

```js
console.table({
  source: detection.source,
  format: detection.format,
  coordinateSpace: detection.coordinateSpace,
  x: detection.rect.x,
  y: detection.rect.y,
  width: detection.rect.width,
  height: detection.rect.height
});
```

Remove noisy logs or place them behind a debug flag after validation.

## 7. Keep QR Padding Small

Use small QR-specific padding:

```js
QR_BARCODE: 1
```

Do not change padding for faces, signatures, identity documents, OCR, DOM, or manual masks.

Do not use padding to compensate for inaccurate coordinates.

## 8. Add Mask Provenance to the Review UI

Each mask should expose its source and status:

```text
Category: QR_BARCODE
Source: BarcodeDetector
Format: qr_code
Status: Verified
```

Unverified candidates should appear as:

```text
Category: QR_BARCODE
Source: YOLO11n
Status: Unverified
Active: No
```

Preserve these audit fields:

```text
Active masks
Disabled masks
QR/barcode masks
Shadow DOM detections
Structured matches
Payload hash
```

Do not remove or rename existing fields.

## 9. Preserve Privacy Guarantees

Verify that:

- QR screenshot regions are blacked out.
- Raw QR values are never stored in the payload.
- Raw barcode values are never stored in the payload.
- DOM text remains sanitized.
- Leak checks still block unsafe payloads.
- Manual boxes mask both the image and structural DOM payload.
- Payload hash generation still works.
- Active-tab changes still cancel scanning.
- Redaction approval is still required before server planning.

## 10. Required Tests

Add focused tests without weakening existing tests.

### Native decoder acceptance

Verify that a native decoder result becomes an active QR mask.

### Fallback decoder acceptance

Verify that the local fallback creates an active QR mask when native detection is unavailable.

### YOLO QR rejection

Verify that a YOLO QR prediction alone does not become an active QR mask.

### False-positive UI rejection

Verify that these do not become QR masks:

- URL
- PDF
- Multi-URL
- Contact
- Plain Text
- App
- SMS
- Email
- Phone
- Social
- Logo
- Navigation icons
- Buttons

### Multiple QR codes

Verify that two actual QR codes produce exactly two QR masks.

### Barcode formats

Test:

- QR
- Code 128
- EAN-13
- UPC-A
- Data Matrix
- PDF417

### Small QR thumbnails

Verify that small QR images are detected during the second pass.

### Styled QR with logo

Verify that a decodable QR with a centre logo is detected and only its region is masked.

### Canvas QR

Verify that canvas-rendered QR codes are detected accurately.

### SVG QR

Verify that SVG QR codes are detected without masking their surrounding container.

### Coordinate accuracy

Verify that the blackout rectangle aligns with the decoder rectangle under different viewport sizes and device-pixel ratios.

### Existing feature regression

Verify that these still pass:

- OCR redaction
- DOM PII redaction
- Aadhaar detection
- Phone detection
- Email detection
- Address detection
- Shadow DOM detection
- Manual overlay
- Inactive-mask toggling
- Payload hash
- Leak check
- Action plan
- Active-tab cancellation

## 11. Browser Validation

Use synthetic values such as `https://example.com` only.

Test these websites:

- `https://goqr.me/`
- `https://barcode.donaldmurillo.com/`
- `https://www.qrcode-monkey.com/`
- `https://www.qrforge.co/`
- `https://qrcode.ikit.app/?lang=en`

Also test the local synthetic website in:

```text
test-website/
```

For each page, record:

```text
Actual QR/barcodes
Detected masks
False-positive masks
Missed masks
Detector source
Audit count
```

After rebuilding the extension:

1. Open `chrome://extensions`.
2. Click **Reload** for Privvy.
3. Hard-refresh the target website with `Ctrl + Shift + R`.
4. Close and reopen the side panel.
5. Run a new scan.

This is required because an existing content script may remain loaded in an already-open tab.

## 12. Final Validation Commands

Run:

```powershell
npm test
npm run build
& 'C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tests/run_tests.py
git diff --check
```

The Chrome and Firefox archives must be generated successfully.

## Acceptance Criteria

The implementation is complete only when:

- Actual QR codes are detected and masked.
- Actual barcodes are detected and masked.
- URL, PDF, and Multi-URL controls are not masked.
- Logos and navigation elements are not masked.
- YOLO cannot independently activate QR masks.
- Native and fallback decoding work locally.
- Small QR codes receive a second decoding pass.
- Coordinates align correctly.
- Existing PII and manual redaction features remain unchanged.
- All tests pass.
- Chrome and Firefox builds pass.
- No external CDN or server decoder is used.
- No unrelated files are modified.

## Rollback Rule

If an existing feature breaks:

1. Identify the QR-specific change responsible.
2. Revert only that change.
3. Keep the existing working implementation intact.
4. Do not modify unrelated logic to force tests to pass.
5. Report the failing test and affected feature.

## Required Final Report

After implementation, report:

1. Exact files modified.
2. Decoder strategy used.
3. How YOLO QR false positives were prevented.
4. How parent-container false positives were prevented.
5. How coordinate conversion was verified.
6. Tests added.
7. Existing features verified.
8. Chrome and Firefox build results.
9. Remaining limitations.
