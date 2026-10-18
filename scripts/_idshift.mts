// 验证 tile id 漂移:解码存档 → 读标注点 tile id → 对照当前 TILE_DEFS 索引
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles.ts';
import fs from 'fs';

const m = JSON.parse(fs.readFileSync(needInput(join(DOWNLOADS, 'map-Starter_World (5).json')), 'utf8'));
const w = m.header.width, h = m.header.height;
const buf = Buffer.from(m.tiles, 'base64');
function dec(p: { i: number }): number {
  let v = 0, shift = 0, b: number;
  do { b = buf[p.i++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
  return v;
}
const n = w * h;
const type = new Uint16Array(n), fx = new Uint16Array(n), fy = new Uint16Array(n);
let o = 0; const p = { i: 0 };
while (o < n) {
  const run = dec(p) + 1, t = dec(p);
  const a = t !== 0 ? dec(p) : 0, b = t !== 0 ? dec(p) : 0;
  for (let k = 0; k < run && o + k < n; k++) { type[o + k] = t; fx[o + k] = a; fy[o + k] = b; }
  o += run;
}
const keyOf = (id: number) => (id > 0 && id < TILE_DEFS.length ? TILE_DEFS[id].key : `?${id}`);

// 标注点
const at = (x: number, y: number) => {
  const i = y * w + x;
  return { id: type[i], key: keyOf(type[i]), fx: fx[i], fy: fy[i] };
};
console.log('标注点:', JSON.stringify(at(3227, 391)), JSON.stringify(at(3227, 396)));
console.log('当前索引: v_530_oasis_plants =', TILE_BY_KEY['v_530_oasis_plants'], ' v_5_trees =', TILE_BY_KEY['v_5_trees'], ' tree =', TILE_BY_KEY['tree']);

// 全图 id 分布:取前 20 高频 id,标注其当前 key + 典型帧
const freq = new Map<number, number>();
for (let i = 0; i < n; i++) if (type[i]) freq.set(type[i], (freq.get(type[i]) ?? 0) + 1);
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
for (const [id, c] of top) {
  const d = TILE_DEFS[id];
  console.log(`id=${id} count=${c} key=${d?.key ?? '?'} sheet=${d?.vanilla?.sheet ?? '-'}`);
}
process.exit(0);
