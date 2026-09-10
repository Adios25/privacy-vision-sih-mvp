const assert = require('assert').strict;

require('../extension/ocr.js');

function word(text, confidence, x0, y0, x1, y1) {
  return { text, confidence, bbox: { x0, y0, x1, y1 } };
}

function blocks(lines) {
  return [{ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }];
}

const fixture = blocks([
  [word('Email:', 96, 10, 10, 60, 30), word('student@example.test', 94, 70, 10, 250, 30)],
  [word('Aadhaar:', 93, 10, 40, 80, 60), word('1111', 91, 90, 40, 130, 60), word('2222', 92, 140, 40, 180, 60), word('3333', 90, 190, 40, 230, 60)],
  [word('Full', 95, 10, 70, 40, 90), word('name:', 95, 45, 70, 90, 90), word('Soumil', 89, 100, 70, 155, 90), word('Bhosle', 90, 160, 70, 215, 90)],
]);

const result = globalThis.PrivvyOCR.extractSensitiveOcr(
  fixture,
  { width: 300, height: 100 },
  { width: 150, height: 50 }
);

assert.deepEqual(new Set(result.rawTerms), new Set(['student@example.test', '1111 2222 3333', 'Soumil Bhosle']));
assert.deepEqual(result.detections.map((item) => item.category).sort(), ['AADHAAR_LIKE', 'EMAIL', 'PERSON']);

const email = result.detections.find((item) => item.category === 'EMAIL');
assert.deepEqual(email.rect, { x: 35, y: 5, width: 90, height: 10 });
assert.equal(email.source, 'local-ocr');
assert.ok(email.confidence > 0.9);

const aadhaar = result.detections.find((item) => item.category === 'AADHAAR_LIKE');
assert.deepEqual(aadhaar.rect, { x: 45, y: 20, width: 70, height: 10 });

const ordinary = globalThis.PrivvyOCR.extractSensitiveOcr(
  blocks([[word('Welcome', 99, 0, 0, 70, 20), word('student', 99, 75, 0, 140, 20)]]),
  { width: 200, height: 100 },
  { width: 200, height: 100 }
);
assert.equal(ordinary.detections.length, 0);
assert.equal(ordinary.rawTerms.length, 0);

const ruler = '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16';
assert.equal(globalThis.PrivvyOCR.collectMatches(ruler).length, 0, 'Document ruler numbers must not look like a payment card');

const validCard = globalThis.PrivvyOCR.collectMatches('Payment 4111 1111 1111 1111');
assert.equal(validCard.length, 1);
assert.equal(validCard[0].category, 'CARD_LIKE');
assert.equal(globalThis.PrivvyOCR.collectMatches('Payment 4111 1111 1111 1112').length, 0, 'Invalid generic card candidates must be ignored');

assert.equal(globalThis.PrivvyOCR.collectMatches('Aadhaar-like KYC').some((item) => item.category === 'AADHAAR_LIKE'), false, 'Descriptive Aadhaar text must not be treated as a value');
assert.equal(globalThis.PrivvyOCR.collectMatches('Aadhaar: 1111 2222 3333').some((item) => item.category === 'AADHAAR_LIKE'), true, 'Labelled Aadhaar values must still be detected');

console.log('All Privvy local OCR tests passed.');
