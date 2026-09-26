#!/usr/bin/env node
// Generate deterministic synthetic QR and negative-control SVG fixtures.
const fs = require('node:fs');
const path = require('node:path');
const { QRCodeEncoder, QRCodeDecoderErrorCorrectionLevel } = require('@zxing/library');
const Code128Reader = require(path.resolve(__dirname, '..', 'node_modules', '@zxing', 'library', 'cjs', 'core', 'oned', 'Code128Reader.js')).default;

const outputDir = path.resolve(__dirname, '..', 'evaluation', 'fixtures');
fs.mkdirSync(outputDir, { recursive: true });

function encodeSvg({ id, width, height, box, value, dark = '#000000', light = '#ffffff', rotate = 0, occlude = false, noise = false }) {
  const matrix = noise ? null : QRCodeEncoder.encode(value, QRCodeDecoderErrorCorrectionLevel.L).matrix;
  const modules = matrix?.width || 0;
  const quiet = 4;
  const cell = box.size / (modules + quiet * 2);
  const startX = box.x + quiet * cell;
  const startY = box.y + quiet * cell;
  const rects = [];
  for (let y = 0; y < modules; y += 1) for (let x = 0; x < modules; x += 1) {
    if (matrix.get(x, y) === 1) rects.push(`<rect x="${(startX + x * cell).toFixed(3)}" y="${(startY + y * cell).toFixed(3)}" width="${(cell + 0.02).toFixed(3)}" height="${(cell + 0.02).toFixed(3)}" fill="${dark}"/>`);
  }
  const centerX = box.x + box.size / 2;
  const centerY = box.y + box.size / 2;
  const code = `<g transform="rotate(${rotate} ${centerX} ${centerY})"><rect x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" fill="${light}"/>${rects.join('')}${occlude ? `<rect x="${box.x + box.size * 0.37}" y="${box.y + box.size * 0.39}" width="${box.size * 0.22}" height="${box.size * 0.18}" fill="${light}"/>` : ''}</g>`;
  const negative = noise ? `<rect x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" fill="${light}" stroke="#5d6570" stroke-width="2"/><path d="M${box.x + 5} ${box.y + 5}h${box.size - 10}v${box.size - 10}h-${box.size - 10}z M${box.x + box.size / 2} ${box.y + 7}v${box.size - 14} M${box.x + 7} ${box.y + box.size / 2}h${box.size - 14}" fill="none" stroke="#344054" stroke-width="3"/><circle cx="${centerX}" cy="${centerY}" r="${box.size * 0.14}" fill="#d0d5dd"/>` : '';
  fs.writeFileSync(path.join(outputDir, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f2f4f7"/>${noise ? negative : code}</svg>\n`, 'utf8');
}

function code128Svg({ id, width, height, box, value, dark = '#000000', light = '#ffffff', rotate = 0 }) {
  const codes = [104, ...Array.from(value, (character) => {
    const code = character.charCodeAt(0) - 32;
    if (code < 0 || code > 94) throw new Error('Code 128 fixture supports printable ASCII only.');
    return code;
  })];
  const checksum = codes.reduce((sum, code, index) => sum + code * (index || 1), 0) % 103;
  codes.push(checksum, 106);
  const patterns = codes.map((code) => Array.from(Code128Reader.CODE_PATTERNS[code]));
  const quietModules = 10;
  const totalModules = quietModules * 2 + patterns.flat().reduce((sum, modules) => sum + modules, 0);
  const moduleWidth = box.width / totalModules;
  let cursor = box.x + quietModules * moduleWidth;
  let black = true;
  const bars = [];
  for (const pattern of patterns) for (const modules of pattern) {
    const barWidth = modules * moduleWidth;
    if (black) bars.push(`<rect x="${cursor.toFixed(3)}" y="${box.y}" width="${(barWidth + 0.01).toFixed(3)}" height="${box.height}" fill="${dark}"/>`);
    cursor += barWidth;
    black = !black;
  }
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const barcode = `<g transform="rotate(${rotate} ${centerX} ${centerY})"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${light}"/>${bars.join('')}</g>`;
  fs.writeFileSync(path.join(outputDir, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f2f4f7"/>${barcode}</svg>\n`, 'utf8');
}

function negativeSvg(id, body, width = 640, height = 480) {
  fs.writeFileSync(
    path.join(outputDir, `${id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f2f4f7"/>${body}</svg>\n`,
    'utf8'
  );
}

encodeSvg({ id: 'qr-small', width: 320, height: 240, box: { x: 16, y: 18, size: 84 }, value: 'https://example.test/synthetic-qr-small' });
encodeSvg({ id: 'qr-large', width: 1280, height: 720, box: { x: 880, y: 120, size: 280 }, value: 'https://example.test/synthetic-qr-large' });
encodeSvg({ id: 'qr-rotated', width: 640, height: 480, box: { x: 210, y: 140, size: 180 }, value: 'https://example.test/synthetic-qr-rotated', rotate: 27 });
encodeSvg({ id: 'qr-low-contrast', width: 640, height: 480, box: { x: 210, y: 140, size: 180 }, value: 'https://example.test/synthetic-qr-low-contrast', dark: '#666666', light: '#e5e5e5' });
encodeSvg({ id: 'qr-occluded', width: 640, height: 480, box: { x: 210, y: 140, size: 180 }, value: 'https://example.test/synthetic-qr-occluded', occlude: true });
encodeSvg({ id: 'non-sensitive-square', width: 640, height: 480, box: { x: 220, y: 150, size: 160 }, value: '', noise: true });
code128Svg({ id: 'barcode-code128', width: 640, height: 360, box: { x: 120, y: 105, width: 400, height: 120 }, value: 'SYNTHETIC-2048' });
code128Svg({ id: 'barcode-low-contrast', width: 640, height: 360, box: { x: 120, y: 105, width: 400, height: 120 }, value: 'SYNTHETIC-4096', dark: '#666666', light: '#e5e5e5' });
code128Svg({ id: 'barcode-rotated', width: 640, height: 360, box: { x: 120, y: 105, width: 400, height: 120 }, value: 'SYNTHETIC-8192', rotate: 15 });
negativeSvg('non-sensitive-logo', '<g transform="translate(210 130)"><rect width="220" height="220" rx="44" fill="#163b66"/><path d="M45 150L110 42l65 108z" fill="#fff"/><circle cx="110" cy="123" r="24" fill="#4fc3a1"/></g>');
negativeSvg('non-sensitive-dark-control', '<rect x="170" y="185" width="300" height="82" rx="12" fill="#101828"/><path d="M205 226h36m-18-18v36" stroke="#fff" stroke-width="8" stroke-linecap="round"/><text x="265" y="236" font-family="Arial" font-size="28" fill="#fff">Add record</text>');
negativeSvg('non-sensitive-qr-like', '<g transform="translate(210 130)" fill="none" stroke="#344054" stroke-width="12"><rect width="80" height="80"/><rect x="140" width="80" height="80"/><rect y="140" width="80" height="80"/><path d="M115 105h42v42h-42zm65 55h40v60h-65v-28h25zM105 175h28v45h-28z"/></g>');
console.log(`Generated synthetic evaluation fixtures in ${outputDir}`);
