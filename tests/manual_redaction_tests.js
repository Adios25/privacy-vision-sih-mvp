const assert = require('assert').strict;
require('../extension/redactionMerger.js');
const redaction = globalThis.PrivvyRedaction;

function testManualBoxAddition() {
  const box = redaction.makeBoundingBox({ x: 10, y: 20, width: 40, height: 30, id: 'manual_test', type: 'MANUAL', isUserAdded: true }, 0, 'MANUAL');
  assert.equal(box.type, 'MANUAL'); assert.equal(box.active, true); assert.equal(box.isUserAdded, true);
  assert.equal(box.label, '[REDACTED_MANUAL_1]'); assert.equal(box.id, 'manual_test');
  assert.deepEqual(box.rect, { x: 10, y: 20, width: 40, height: 30 });
}

function testManualRedactionTextStripping() {
  const page = { textBlocks: [{ text: 'secret@example.test', rect: { x: 10, y: 10, width: 100, height: 20 } }], elements: [{ id: 'e1', label: 'Email', value: 'secret@example.test', rect: { x: 10, y: 10, width: 100, height: 20 } }] };
  const box = redaction.makeBoundingBox({ x: 0, y: 0, width: 150, height: 50, type: 'MANUAL' }, 0, 'MANUAL');
  const result = redaction.applyMasksToPage(page, [box]);
  assert.equal(result.textBlocks[0].text, '[REDACTED_MANUAL_1]'); assert.equal(result.elements[0].value, '[REDACTED_MANUAL_1]');
}

function testImageCanvasBurnIn() {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  const context = { fillStyle: '', fillRect(x, y, width, height) { for (let row = y; row < y + height; row += 1) for (let col = x; col < x + width; col += 1) { const i = (row * 4 + col) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; pixels[i + 3] = 255; } } };
  redaction.redactCanvas(context, { width: 4, height: 4 }, { width: 4, height: 4 }, [{ x: 1, y: 1, width: 2, height: 2, active: true }]);
  assert.equal(pixels[(1 * 4 + 1) * 4], 0); assert.equal(pixels[(0 * 4 + 0) * 4], 255);
}

function testFalsePositiveToggle() {
  const state = redaction.mergeRedactionState({ autoDetections: [{ id: 'auto', x: 0, y: 0, width: 10, height: 10, type: 'VISUAL', active: false }], manualDetections: [] });
  assert.equal(state.mergedActiveMasks.length, 0); assert.equal(state.autoDetections[0].active, false);
}

testManualBoxAddition(); testManualRedactionTextStripping(); testImageCanvasBurnIn(); testFalsePositiveToggle();
console.log('Manual redaction tests passed.');
