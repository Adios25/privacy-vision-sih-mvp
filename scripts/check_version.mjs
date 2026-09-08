import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expected = packageJson.version;

function assertVersion(label, actual) {
  if (actual !== expected) throw new Error(`${label} has version ${actual}, expected ${expected}`);
}

assertVersion('package.json', packageJson.version);
for (const file of ['extension/manifest.json', 'extension/manifest.firefox.json']) {
  const manifest = JSON.parse(await readFile(join(root, file), 'utf8'));
  assertVersion(file, manifest.version);
}

for (const file of ['extension/content.js', 'extension/popup.js']) {
  const source = await readFile(join(root, file), 'utf8');
  const matches = [...source.matchAll(/(?:CONTENT_VERSION|EXTENSION_VERSION)\s*=\s*['"]([^'"]+)['"]/g)];
  if (!matches.length) throw new Error(`${file} does not declare an extension version`);
  for (const match of matches) assertVersion(`${file} runtime constant`, match[1]);
}

const readme = await readFile(join(root, 'README.md'), 'utf8');
if (!readme.includes(`Privvy (v${expected})`)) throw new Error(`README.md does not identify Privvy as v${expected}`);

if (process.argv.includes('--artifacts')) {
  for (const browser of ['chrome', 'firefox']) {
    const path = join(root, 'dist', browser, 'manifest.json');
    try { await access(path); } catch { throw new Error(`Missing packaged ${browser} manifest`); }
    assertVersion(`dist/${browser}/manifest.json`, JSON.parse(await readFile(path, 'utf8')).version);
  }
}

console.log(`Version consistency check passed: ${expected}`);
