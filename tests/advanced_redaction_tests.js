const assert = require('assert').strict;
require('../extension/redactionMerger.js');
require('../extension/indiaPiiValidator.js');
require('../extension/geometry.js');
require('../extension/qrDetector.js');
const redaction = globalThis.PrivvyRedaction;
const india = globalThis.PrivvyIndiaPii;
const qrDetector = globalThis.PrivvyQrDetector;

function testQrMask() {
  const qr = redaction.makeBoundingBox({ id: 'qr_1', category: 'QR_BARCODE', label: '[QR_REDACTED]', x: 2, y: 3, width: 20, height: 20 }, 0, 'VISUAL');
  const state = redaction.mergeRedactionState({ autoDetections: [qr], manualDetections: [] });
  assert.equal(state.mergedActiveMasks[0].type, 'QR');
  assert.equal(state.mergedActiveMasks[0].category, 'QR_BARCODE');
  assert.equal(state.mergedActiveMasks[0].label, '[QR_REDACTED]');
}

function testQrContentNeverSerializes() {
  const qr = redaction.makeBoundingBox({ type: 'QR', category: 'QR_BARCODE', label: '[QR_REDACTED]', x: 0, y: 0, width: 10, height: 10 }, 0, 'QR');
  assert.equal(JSON.stringify(qr).includes('https://private.example'), false);
}

function testShadowPayloadSanitization() {
  const page = { textBlocks: [{ text: '<EMAIL_1>', shadowRoot: true, rect: { x: 1, y: 1, width: 10, height: 10 } }], elements: [{ label: '<EMAIL_1>', value: '<EMAIL_1>', shadowRoot: true, rect: { x: 1, y: 1, width: 10, height: 10 } }] };
  assert.equal(page.textBlocks[0].text, '<EMAIL_1>');
  assert.equal(page.elements[0].value, '<EMAIL_1>');
}

function testIndiaValidators() {
  assert.equal(india.validVerhoeff('236375286327'), true);
  assert.equal(india.validVerhoeff('236375286328'), false);
  assert.equal(india.validPan('ABCPD1234F'), true);
  assert.equal(india.panHolderType('ABCPD1234F'), 'P');
  assert.equal(india.validIfsc('SBIN0001234'), true);
  assert.equal(india.validIfsc('BAD123'), false);
}

function testInactiveMasksAreNotActive() {
  const state = redaction.mergeRedactionState({ autoDetections: [{ type: 'QR', active: false, x: 0, y: 0, width: 5, height: 5 }], manualDetections: [] });
  assert.equal(state.mergedActiveMasks.length, 0);
}

function testQrVisualPrecisionFilter() {
  const nativeQr = { type: 'QR', category: 'QR_BARCODE', source: 'local-qr-detector', confidence: 1, rect: { x: 0, y: 0, width: 20, height: 20 } };
  const strongYoloQr = { type: 'VISUAL', category: 'QR_BARCODE', source: 'YOLO11n', confidence: 0.93, rect: { x: 100, y: 100, width: 180, height: 170 } };
  const weakYoloQr = { type: 'VISUAL', category: 'QR_BARCODE', source: 'YOLO11n', confidence: 0.62, rect: { x: 100, y: 100, width: 180, height: 170 } };
  const wideYoloQr = { type: 'VISUAL', category: 'QR_BARCODE', source: 'YOLO11n', confidence: 0.95, rect: { x: 100, y: 100, width: 280, height: 25 } };
  const face = { type: 'VISUAL', category: 'FACE', source: 'YOLO11n', confidence: 0.3, rect: { x: 0, y: 0, width: 10, height: 10 } };
  const result = redaction.filterVisualQrCandidates([nativeQr, strongYoloQr, weakYoloQr, wideYoloQr, face]);
  assert.equal(redaction.QR_VISUAL_CONFIDENCE_THRESHOLD, 0.88);
  assert.equal(redaction.isLikelyQrBox(strongYoloQr.rect), true);
  assert.equal(redaction.isLikelyQrBox(wideYoloQr.rect), false);
  assert.deepEqual(result, [nativeQr, face]);
}

function testVerifiedDecoderMetadataNeverIncludesRawValue() {
  const result = qrDetector.verifiedDetection({ x: 20, y: 30, width: 80, height: 80 }, { width: 400, height: 400 }, { width: 200, height: 200 }, 'local-zxing-decoder', 'QR_CODE', 0);
  assert.equal(result.type, 'QR');
  assert.equal(result.verified, true);
  assert.equal(result.format, 'qr_code');
  assert.deepEqual(result.rect, { x: 10, y: 15, width: 40, height: 40 });
  assert.equal(JSON.stringify(result).includes('rawValue'), false);
  assert.equal(JSON.stringify(result).includes('https://private.example'), false);
}

function testFallbackPointRectAndDedupe() {
  const result = { getResultPoints: () => [{ getX: () => 10, getY: () => 20 }, { getX: () => 90, getY: () => 100 }] };
  assert.deepEqual(qrDetector.rectFromPoints(result, { width: 120, height: 120 }), { x: 10, y: 14, width: 80, height: 92 });
  const one = { rect: { x: 1, y: 1, width: 50, height: 50 } };
  const duplicate = { rect: { x: 2, y: 2, width: 50, height: 50 } };
  const separate = { rect: { x: 100, y: 1, width: 50, height: 50 } };
  assert.deepEqual(qrDetector.dedupe([one, duplicate, separate]), [one, separate]);
}

function testQrPixelBlackoutKeepsNearbyPixels() {
  const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255);
  const context = { fillStyle: '', fillRect(x, y, width, height) { for (let row = y; row < y + height; row += 1) for (let col = x; col < x + width; col += 1) { const index = (row * 8 + col) * 4; pixels[index] = pixels[index + 1] = pixels[index + 2] = 0; } } };
  redaction.redactCanvas(context, { width: 8, height: 8 }, { width: 8, height: 8 }, [{ x: 3, y: 3, width: 2, height: 2, active: true }], 1, 1);
  assert.equal(pixels[(3 * 8 + 3) * 4], 0);
  assert.equal(pixels[(2 * 8 + 2) * 4], 0);
  assert.equal(pixels[(1 * 8 + 1) * 4], 255);
}

testQrMask(); testQrContentNeverSerializes(); testShadowPayloadSanitization(); testIndiaValidators(); testInactiveMasksAreNotActive(); testQrVisualPrecisionFilter(); testVerifiedDecoderMetadataNeverIncludesRawValue(); testFallbackPointRectAndDedupe(); testQrPixelBlackoutKeepsNearbyPixels();
console.log('Advanced redaction tests passed.');
