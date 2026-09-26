#!/usr/bin/env node
// Capture the production OCR rule-engine spans without storing matched text values.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
require(path.join(root, 'extension', 'ocr.js'));

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const datasetPath = path.resolve(argument('--dataset', path.join(root, 'evaluation', 'redaction-v1.json')));
const outputPath = path.resolve(argument('--output', path.join(root, 'evaluation', 'predictions', 'text-rules-v1.json')));
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
if (dataset.schemaVersion !== 1 || dataset.syntheticOnly !== true) throw new Error('Expected a schemaVersion 1 synthetic-only dataset.');

const cases = {};
for (const fixture of dataset.cases.filter((item) => item.kind === 'text')) {
  cases[fixture.id] = {
    detections: globalThis.PrivvyOCR.collectMatches(fixture.text).map((match) => ({
      category: match.category,
      start: match.start,
      end: match.end,
      source: 'production-ocr-rule-engine'
    }))
  };
}

const output = {
  schemaVersion: 1,
  runMetadata: {
    capturedAt: new Date().toISOString(),
    detector: 'Privvy production OCR rule engine',
    scope: 'Pattern and labelled-text matching only; OCR image recognition is excluded',
    datasetId: dataset.datasetId,
    syntheticOnly: true,
    rawMatchedValuesExcluded: true
  },
  cases
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${Object.keys(cases).length} synthetic text prediction cases to ${outputPath}`);
