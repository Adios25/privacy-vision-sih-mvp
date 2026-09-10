const assert = require('assert').strict;
require('../extension/redactionMerger.js');
require('../extension/indiaPiiValidator.js');
const redaction = globalThis.PrivvyRedaction;
const india = globalThis.PrivvyIndiaPii;

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

testQrMask(); testQrContentNeverSerializes(); testShadowPayloadSanitization(); testIndiaValidators(); testInactiveMasksAreNotActive();
console.log('Advanced redaction tests passed.');
