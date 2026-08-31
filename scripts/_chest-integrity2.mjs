// 宝箱完整性 v2：全类型保留，分类左右伴缺失 + 邻格身份统计。
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(process.env.SW_MAP, 'utf8'));
const W = d.header.width;
const s = Buffer.from(d.tiles, 'base64').toString('binary');
const u8 = new Uint8Array(s.length);
for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
const N = W * d.header.height;
const type = new Int32Array(N);
let p = 0, i = 0;
while (i < N && p < u8.length) {
  let run = 0, sh = 0;
  for (;;) { const b = u8[p++]; run |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  let t = 0; sh = 0;
  for (;;) { const b = u8[p++]; t |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  const end = Math.min(i + run + 1, N);
  for (; i < end; i++) { type[i] = t; }
}
const g = (x, y) => (x >= 0 && y >= 0 && x < W && d.header.height ? type[y * W + x] : 0);
const stats = { intactAnchor: 0, leftOnlyMissingRight: [], rightOnlyNoLeft: 0, rightPartnerTypes: new Map() };
for (let y = 1; y < d.header.height - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    if (g(x, y) !== 21 || g(x - 1, y) === 21) continue;   // 只处理左锚
    if (g(x + 1, y) === 21) { stats.intactAnchor++; continue; }
    stats.leftOnlyMissingRight.push({ x, y });
    const rt = g(x + 1, y);
    stats.rightPartnerTypes.set(rt, (stats.rightPartnerTypes.get(rt) ?? 0) + 1);
  }
  // 右半孤儿:自己是 21 但左边不是、且不在左锚统计里（右伴缺失的另一侧）
}
for (let y = 1; y < d.header.height - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    if (g(x, y) !== 21) continue;
    if (g(x - 1, y) === 21 || g(x + 1, y) === 21) continue;
    void x; void y;
  }
}
// 右半孤儿计数（独立跑一遍）
let rightOrphans = 0;
const rightOrphanList = [];
for (let y = 1; y < d.header.height - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    if (g(x, y) === 21 && g(x - 1, y) !== 21 && g(x + 1, y) !== 21) {
      // 已经算进 leftOnly；这里只数另一种：右侧无伴且左侧也无 —— 同一批。
      rightOrphans++;
      if (rightOrphanList.length < 8) rightOrphanList.push([x, y]);
    }
    else if (g(x, y) === 21 && g(x - 1, y) !== 21 && g(x + 1, y) !== 21) { /* noop */ }
  }
}
console.log(JSON.stringify({
  intactAnchors: stats.intactAnchor,
  leftOnlyCount: stats.leftOnlyMissingRight.length,
  leftOnlySampleSurface: stats.leftOnlyMissingRight.filter(v => v.y < 500).slice(0, 12),
  rightPartnerTypes: [...stats.rightPartnerTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  doubleCountedNote: rightOrphans,
}, null, 2));
