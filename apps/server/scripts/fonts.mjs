// Converts the WOFF files shipped by @fontsource into TTF for the link-preview renderer (resvg reads TrueType).
// WOFF 1.0 is a container of zlib-compressed sfnt tables: https://www.w3.org/TR/WOFF/
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const FONTS = [
  ['@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff', 'bricolage-600.ttf'],
  ['@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff', 'bricolage-800.ttf'],
  ['@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff', 'geist-mono-600.ttf'],
];

function woffToSfnt(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('not a WOFF file');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = woff.readUInt32BE(o);
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const checksum = woff.readUInt32BE(o + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : raw;
    if (data.length !== origLength) throw new Error('bad table length');
    tables.push({ tag, checksum, data });
  }
  let entrySelector = 0;
  while (2 ** (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = 2 ** entrySelector * 16;
  const headerSize = 12 + numTables * 16;
  let size = headerSize;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.writeUInt32BE(t.tag, o);
    out.writeUInt32BE(t.checksum, o + 4);
    out.writeUInt32BE(offset, o + 8);
    out.writeUInt32BE(t.data.length, o + 12);
    t.data.copy(out, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return out;
}

for (const [from, to] of FONTS) {
  const sfnt = woffToSfnt(readFileSync(require.resolve(from)));
  writeFileSync(new URL(`../src/fonts/${to}`, import.meta.url), sfnt);
  console.log(`${to}: ${sfnt.length} bytes`);
}
