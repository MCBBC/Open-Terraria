// 解码 save v5 tiles(varint RLE),输出竖井列的深度×群系剖面
// 格式(serialize.ts:48): 每条目 varint(run-1) varint(type) [varint frameX frameY 仅当 type!=0]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(needInput(join(DOWNLOADS, 'map-天真的钴最高点 (4).json')), 'utf8'));
const W = d.header?.width ?? d.meta?.w ?? d.w ?? 6400;
const H = d.header?.height ?? d.meta?.h ?? d.h ?? 1800;
console.log('header keys:', Object.keys(d.header || {}).slice(0, 32).join(','));
console.log('w,h =', W, H);
const bytes = Buffer.from(d.tiles, 'base64');
console.log('tiles bytes:', bytes.length);
// varint 解码
let p = 0;
const rdVar = () => { let v = 0, sh = 0, b; do { b = bytes[p++]; v |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80); return v; };
// 行主序重建:只存我们关心的列段 x∈[x0,x1]
const X0 = 1560, X1 = 1680; // 竖井 x≈1616-1628 px/16,周围窗口
const grid = new Map(); // "x,y" -> type
let y = 0, x = 0;
const rowType = new Map(); // y -> [typeCounts] 仅关心列段
while (p < bytes.length && y < H) {
  const run = rdVar() + 1;
  const type = rdVar();
  let fx = 0, fy = 0;
  if (type !== 0) { fx = rdVar(); fy = rdVar(); }
  for (let i = 0; i < run; i++) {
    if (x >= X0 && x <= X1) {
      const k = y;
      let c = rowType.get(k); if (!c) rowType.set(k, c = new Map());
      c.set(type, (c.get(type) || 0) + 1);
    }
    x++;
    if (x >= W) { x = 0; y++; }
  }
}
console.log('decoded y rows:', y, 'consumed:', p, '/', bytes.length);
// 输出:每 20 行,列段内 top3 tile 类型
// 群系判据 tile id(1.4.5.7): 0 dirt/0 grass, 1 stone, 53 snow? 147 snow block,161 ice,57 ash,58 hellstone,199 corrupt? etc.
// 雪原:snow block 147, ice 161, purple ice 199?  terracotta...
const NAME = { 0: 'dirt', 1: 'stone', 57: 'ash', 58: 'hellstone', 59: 'mud', 147: 'snow', 161: 'ice', 199: 'corruptice', 200: 'hallowice', 396: 'crimsonice' };
const out = [];
for (let yy = 0; yy < H; yy += 10) {
  const c = rowType.get(yy); if (!c) continue;
  const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([t, n]) => (NAME[t] || 'T' + t) + ':' + n).join(' ');
  out.push(yy + '\t' + top);
}
fs.writeFileSync('/tmp/hell-shaft-profile.txt', out.join('\n'));
console.log(out.slice(0, 40).join('\n'));
console.log('...');
console.log(out.slice(-30).join('\n'));
