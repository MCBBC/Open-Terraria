// 竖井剖面 v2(数组版,行主序已验证) + 行为日志 y(t) 分段
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('/Users/vinlic/Downloads/map-天真的钴最高点 (4).json', 'utf8'));
const W = d.header.width, H = d.header.height;
console.log('groundLevel:', d.header.groundLevel, 'rockLevel:', d.header.rockLevel, 'spawn:', JSON.stringify(d.header.spawn));
const bytes = Buffer.from(d.tiles, 'base64');
let p = 0;
const rdVar = () => { let v = 0, sh = 0, b; do { b = bytes[p++]; v |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80); return v; };
const cellType = new Uint16Array(W * H);
let idx = 0;
while (p < bytes.length) {
  const run = rdVar() + 1;
  const type = rdVar();
  let fx = 0, fy = 0;
  if (type !== 0) { fx = rdVar(); fy = rdVar(); }
  cellType.fill(type, idx, idx + run);
  idx += run;
}
// 竖井列 x∈[1614,1632](玩家 x 1616-1628)。每 y:active tile 的类型分布
const X0 = 1614, X1 = 1632;
const NAME = { 0: 'air', 1: 'stone', 57: 'ash', 58: 'hellstone', 59: 'mud', 147: 'snow', 161: 'ice', 5: 'trees' };
const rows = [];
for (let y = 0; y < H; y++) {
  const c = new Map();
  let act = 0;
  for (let x = X0; x <= X1; x++) {
    const t = cellType[y * W + x];
    if (t !== 0) { act++; c.set(t, (c.get(t) || 0) + 1); }
  }
  rows.push({ y, act, top: [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => (NAME[t] || 'T' + t) + ':' + n).join(',') });
}
// 求群系段:每行 snow+ice 格数,找到「雪带」上下界
const snowish = (y) => { let n = 0; for (let x = X0; x <= X1; x++) { const t = cellType[y * W + x]; if (t === 147 || t === 161) n++; } return n; };
let surfTop = -1, snowEnd = -1, ashStart = -1, lastTile = -1;
for (let y = 0; y < H; y++) {
  const s = snowish(y);
  if (s >= 6 && surfTop < 0) surfTop = y;
  if (s >= 6) snowEnd = y;
  const act = rows[y].act;
  if (act > 0) lastTile = y;
}
for (let y = 0; y < H; y++) { if (rows[y].top.includes('ash') && ashStart < 0) { ashStart = y; break; } }
console.log('snow band: y', surfTop, '->', snowEnd, '| first ash:', ashStart, '| last active tile y:', lastTile);
// 摘要输出每 20 行
const out = [];
for (let y = 0; y < H; y += 20) out.push(String(y).padStart(4) + ' act=' + String(rows[y].act).padStart(2) + '  ' + rows[y].top);
fs.writeFileSync('/tmp/hell-shaft-profile2.txt', out.join('\n'));
console.log(out.join('\n'));
