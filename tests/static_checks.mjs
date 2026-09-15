import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifests = ['extension/manifest.json', 'extension/manifest.firefox.json'];

for (const file of manifests) {
  const manifest = JSON.parse(await readFile(join(root, file), 'utf8'));
  if (manifest.version !== packageJson.version) throw new Error(`${file} version mismatch`);
  if (manifest.host_permissions?.includes('<all_urls>')) throw new Error(`${file} has broad host permissions`);
}

const javascriptFiles = ['background.js', 'browser_api.js', 'content.js', 'geometry.js', 'ocr.js', 'popup.js', 'overlayCanvas.js', 'redactionMerger.js', 'qrDetector.js', 'shadowWalker.js', 'indiaPiiValidator.js', 'agentWorkflow.js', 'zxing-browser.min.js'];
for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', join(root, 'extension', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file} failed syntax validation: ${result.stderr}`);
}

const source = await readFile(join(root, 'extension', 'popup.js'), 'utf8');
if (/sk-[A-Za-z0-9]{20,}/.test(source) || /BEGIN (RSA|OPENSSH) PRIVATE KEY/.test(source)) throw new Error('Possible secret in extension source');
if (!source.includes("planVersion: '1.0'")) throw new Error('Versioned action protocol is missing');
for (const file of ['extension/manifest.json', 'extension/manifest.firefox.json', 'package.json']) JSON.parse(await readFile(join(root, file), 'utf8'));

for (const path of [
  'extension/yolo11n.onnx', 'extension/eng.traineddata.gz', 'extension/tesseract.worker.min.js',
  'extension/zxing-browser.min.js',
  'dist/chrome/manifest.json', 'dist/firefox/manifest.json'
]) {
  try { await access(join(root, path)); } catch { console.warn(`Packaging asset not present in this checkout: ${path}`); }
}

console.log('Static syntax, manifest, permission, and secret checks passed.');
