import { mkdir, rm, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const source = join(root, 'extension');
const dist = join(root, 'dist');

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date = new Date()) {
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
}

function dosDate(date = new Date()) {
  return (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

async function zipDirectory(target, archive) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of (await readdir(target)).sort()) {
    const name = Buffer.from(file, 'utf8');
    const data = await readFile(join(target, file));
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime()), u16(dosDate()),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime()), u16(dosDate()),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(centrals.length), u16(centrals.length),
    u32(centralDirectory.length), u32(offset), u16(0)
  ]);
  await writeFile(archive, Buffer.concat([...locals, centralDirectory, end]));
}

async function build(name, manifestName) {
  const target = join(dist, name);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of await readdir(source)) {
    if (file !== 'manifest.json' && file !== 'manifest.firefox.json') {
      await copyFile(join(source, file), join(target, file));
    }
  }
  const manifest = JSON.parse(await readFile(join(source, manifestName), 'utf8'));
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const legacyArchive = join(dist, `privacy-vision-sih-${name}.zip`);
  const archive = join(dist, `privvy-${name}.zip`);
  await rm(legacyArchive, { force: true });
  await rm(archive, { force: true });
  await zipDirectory(target, archive);
  return archive;
}

await mkdir(dist, { recursive: true });
for (const [browser, manifest] of [['chrome', 'manifest.json'], ['firefox', 'manifest.firefox.json']]) {
  console.log(await build(browser, manifest));
}
