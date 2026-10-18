// 存档花苞扫描：v3+ RLE 稳定 id 直扫（tile 238=世花球茎/236=生命果/237=蜥蜴祭坛/233=丛林植物）。
// RLE 条目: varint(run-1) varint(type)[varint fx fy 仅 type!=0]（SaveFile.ts decode 同构）。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';

const PATH = process.env.BULB_MAP ?? needInput(join(DOWNLOADS, 'map-可怕的洞穴小岛 (1).json'));
const d = JSON.parse(readFileSync(PATH, 'utf8'));
const W = d.header.width, H = d.header.height, N = W * H;
const b64 = atob ?? ((s) => Buffer.from(s, 'base64').toString('binary'));
const s = b64(d.tiles);
const u8 = new Uint8Array(s.length);
for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);

const WANT = new Set([238, 236, 237, 233]);
const hits = new Map();   // type -> [idx...]
let p = 0, i = 0, runs = 0;
while (i < N && p < u8.length) {
  let run = 0, sh = 0;
  for (;;) { const b = u8[p++]; run |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  let tRaw = 0; sh = 0;
  for (;;) { const b = u8[p++]; tRaw |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  let fx = 0, fy = 0;
  if (tRaw !== 0) {
    sh = 0;
    for (;;) { const b = u8[p++]; fx |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
    sh = 0;
    for (;;) { const b = u8[p++]; fy |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  }
  const end = Math.min(i + run + 1, N);
  if (WANT.has(tRaw)) {
    if (!hits.has(tRaw)) hits.set(tRaw, []);
    const arr = hits.get(tRaw);
    for (let k = i; k < end; k++) arr.push(k);
  }
  i = end; runs++;
}
console.log(JSON.stringify({
  header: { name: d.header.name, seed: d.header.seed, size: `${W}x${H}`, dungeonX: d.header.dungeonX, jungleX: d.header.jungleX },
  worldFlags: d.flags,
  rleStreamsOk: i === N && p >= u8.length - 1 ? true : { decodedCells: i, bytesConsumed: p, totalBytes: u8.length },
  counts: Object.fromEntries([...WANT].map((t) => {
    const arr = hits.get(t) ?? [];
    return [
      t,
      { n: arr.length,
        sampleXY: arr.slice(0, 8).map((k) => [k % W, Math.floor(k / W)]) },
    ];
  })),
}, null, 2));
