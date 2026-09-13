# QR and Barcode Redaction Precision Plan

## Objective

Improve QR/barcode redaction precision so Privvy masks actual QR/barcode regions while avoiding unrelated logos, navigation labels, icons, thumbnails, and surrounding containers.

The current working features must remain unchanged. This is an isolated QR-specific improvement.

## Non-Negotiable Safety Rules

1. Do not remove, rewrite, or broadly refactor existing functionality.
2. Do not change the scan lifecycle or active-tab cancellation behavior.
3. Do not change DOM PII detection, OCR detection, manual redaction, Shadow DOM scanning, Aadhaar detection, phone detection, email detection, address detection, or action-plan execution.
4. Do not change the existing payload schema except where necessary to preserve QR detector metadata.
5. Do not remove or rename any existing UI or audit field.
6. Do not change redaction behavior for non-QR categories.
7. Preserve Chrome and Firefox compatibility.
8. Do not weaken, remove, or rewrite existing tests to make them pass.
9. Make only small, local changes related to QR/barcode precision.
10. If an unrelated feature breaks, stop and revert the QR-specific change causing the regression.

## Existing Detection Flow

The implementation must preserve this flow:

```text
DOM scan
  + OCR scan
  + YOLO visual scan
  + native BarcodeDetector scan
        ↓
mergeDetections()
        ↓
createRedactionState()
        ↓
drawRedactedPreview()
        ↓
sanitized structural and visual payload
        ↓
optional server request
```

## Files to Inspect Before Editing

- `extension/popup.js`
- `extension/qrDetector.js`
- `extension/redactionMerger.js`
- `tests/advanced_redaction_tests.js`
- `tests/manual_redaction_tests.js`
- `package.json`

Do not edit a file until its current behavior and related tests have been reviewed.

## Implementation Tasks

### 1. Preserve detector source information

Native QR detector results must remain distinguishable from YOLO results.

Native results should retain metadata equivalent to:

```js
{
  type: 'QR',
  category: 'QR_BARCODE',
  source: 'local-qr-detector',
  confidence: 1
}
```

YOLO QR predictions must not automatically be treated as verified QR detections. They should retain their visual source, for example:

```js
{
  type: 'VISUAL',
  category: 'QR_BARCODE',
  source: 'YOLO11n'
}
```

Do not change the representation of DOM or OCR detections.

### 2. Add a QR-only confidence threshold

Add a narrowly scoped constant:

```js
const QR_VISUAL_CONFIDENCE_THRESHOLD = 0.88;
```

Only YOLO QR candidates with confidence at or above this threshold may be accepted as visual QR candidates.

This threshold must not affect:

- `FACE`
- `SIGNATURE`
- `IDENTITY_DOCUMENT`
- `EMAIL`
- `PHONE`
- `ADDRESS`
- DOM detections
- OCR detections
- Manual detections

### 3. Add QR geometry validation

Add a helper similar to:

```js
function isLikelyQrBox(rect) {
  if (!rect) return false;

  const width = Number(rect.width);
  const height = Number(rect.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width < 40 || height < 40) return false;

  const aspectRatio = width / height;
  return aspectRatio >= 0.75 && aspectRatio <= 1.33;
}
```

Use this helper only for YOLO QR candidates.

Do not apply it to OCR, manual, face, signature, or identity-document boxes.

Native `BarcodeDetector` results may bypass this check because the browser has already confirmed the barcode.

### 4. Filter visual QR candidates before merging

Before visual detections are passed into `mergeDetections()`, filter only invalid YOLO QR candidates.

The intended logic is:

```js
const filteredVisionDetections = vision.detections.filter((detection) => {
  if (detection.category !== 'QR_BARCODE') return true;

  const isNativeQr = detection.source === 'local-qr-detector';

  return isNativeQr || (
    detection.confidence >= QR_VISUAL_CONFIDENCE_THRESHOLD &&
    isLikelyQrBox(detection.rect)
  );
});
```

Use the filtered list when merging detections with DOM, OCR, and native QR results.

Do not change merge behavior for other categories.

### 5. Reduce padding for QR masks only

In `drawRedactedPreview()`, reduce QR padding so nearby content is not unnecessarily blacked out.

The QR-specific value may be:

```js
const paddingByCategory = {
  FACE: 5,
  SIGNATURE: 4,
  IDENTITY_DOCUMENT: 4,
  QR_BARCODE: 1
};
```

Do not change padding for any non-QR category.

Manual redaction padding and behavior must remain unchanged unless the current implementation already handles manual boxes through a separate path.

### 6. Avoid parent-container QR masking

For QR-related DOM candidates, prefer actual visual elements:

- `IMG`
- `CANVAS`
- `SVG`

Do not globally change DOM target selection.

If QR-specific refinement is needed:

1. Apply it only to `QR_BARCODE` detections.
2. Search for a visual child when the detected node is a container.
3. Use the child’s rectangle when a suitable visual child exists.
4. Fall back to the original rectangle when no suitable child exists.
5. Never affect normal text, form fields, or unrelated DOM detections.

### 7. Preserve the local egress audit

Keep all existing audit fields:

```text
Active masks
Disabled masks
QR/barcode masks
Shadow DOM detections
Structured matches
Payload hash
```

The QR/barcode count must represent active QR masks according to the existing mask type/category rules.

Do not remove or rename audit fields.

### 8. Preserve privacy behavior

The following must continue to work:

- QR screenshot blackout
- QR structural payload masking
- Manual redaction
- OCR redaction
- DOM text stripping
- leak-check blocking
- payload hash generation
- active-tab scan cancellation
- redaction approval gate

No original raw value may be added to the outgoing payload.

## Required Tests

Add focused tests without unnecessarily modifying existing tests.

### Test 1: Native QR detection is accepted

Use a native detector result with a valid square rectangle and expect it to remain active.

### Test 2: Strong YOLO QR candidate is accepted

Example:

```js
{
  type: 'VISUAL',
  category: 'QR_BARCODE',
  source: 'YOLO11n',
  confidence: 0.93,
  rect: { x: 100, y: 100, width: 180, height: 170 }
}
```

Expected result: accepted.

### Test 3: Low-confidence YOLO QR candidate is rejected or disabled

Use confidence `0.62` and expect the candidate not to become an active QR mask.

### Test 4: Non-square YOLO candidate is rejected

Example:

```js
{
  confidence: 0.95,
  rect: { x: 100, y: 100, width: 280, height: 25 }
}
```

Expected result: rejected.

### Test 5: Non-QR detections are unaffected

Verify that QR filtering does not affect:

- faces
- signatures
- identity documents
- phone numbers
- email addresses
- addresses
- OCR detections
- DOM detections

### Test 6: Manual redaction is unaffected

Verify that manual boxes remain:

- correctly generated
- active by default
- included in the visual redaction
- included in the structural payload
- counted in the audit

### Test 7: QR pixel blackout is preserved

Use a synthetic image or canvas and verify that:

- the QR region is blacked out
- pixels outside the QR region remain unchanged
- the QR padding is limited
- the blackout still occurs after filtering

### Test 8: Leak check is preserved

Verify that known raw values do not appear in the structured payload after QR filtering.

## Baseline and Validation Commands

Run the baseline before editing:

```powershell
npm test
npm run build
python tests/run_tests.py
```

Run the same commands after implementation:

```powershell
npm test
npm run build
python tests/run_tests.py
```

All of the following must pass:

- JavaScript unit tests
- manual redaction tests
- advanced redaction tests
- OCR tests
- YOLO tests
- Python SIH tests
- Chrome build
- Firefox build
- manifest validation
- static syntax checks

## Manual Browser Validation

Use the QR Code Generator test website from the reported screenshots.

Verify that:

1. The main QR image is redacted.
2. QR thumbnails are redacted only when actually detected.
3. The website logo is not redacted.
4. Navigation labels are not redacted.
5. Icons are not redacted.
6. The surrounding QR panel is not unnecessarily redacted.
7. The Local Egress Audit reports the expected QR count.
8. Existing PII redactions still work.
9. The manual overlay still works.
10. Switching tabs during scanning still stops the scan.

## Acceptance Criteria

The implementation is complete only when:

- QR false positives are reduced.
- Actual QR codes remain protected.
- Existing detection categories behave as before.
- Manual redaction works as before.
- Payload and audit behavior works as before.
- Chrome and Firefox builds pass.
- No unrelated files are modified.
- No existing tests are weakened or removed.
- The final report lists the exact files changed.
- The final report lists every validation command and its result.

## Rollback Rule

If an existing feature breaks:

1. Identify the QR-specific change responsible.
2. Revert only that change.
3. Keep the existing working implementation intact.
4. Do not modify unrelated detection or redaction logic to force tests to pass.
5. Report the failing test and affected feature clearly.

## Final Response Required from Codex

After implementation, report:

1. Summary of QR precision changes.
2. Exact files modified.
3. Existing features verified.
4. New tests added.
5. Build and test results.
6. Any known limitations or remaining false-positive cases.
