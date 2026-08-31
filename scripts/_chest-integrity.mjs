// 全图宝箱完整性扫描(stable-id 域直读):每个箱子的左锚格应满足
// 右邻同为箱(fx+18)、左右同行；孤格 / 缺右伴 / 叠梳妆台 全部列出。
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
  let fa = 0, fb = 0;
  if (t !== 0) { sh = 0;
    for (;;) { const b = u8[p++]; fa |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
    sh = 0;
    for (;;) { const b = u8[p++]; fb |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  }
  const end = Math.min(i + run + 1, N);
  for (; i < end; i++) { type[i] = t === 21 ? 1e6 + fa * 64 + fb : 0; }
}
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < d.header.height ? type[y * W + x] : 0);
const cells = [];
for (let y = 1; y < d.header.height - 1; y++) for (let x = 1; x < W - 1; x++) {
  if (get(x, y) >= 1e6) cells.push([x, y]);
}
const orphans = [], stacksOnDresser = [];
const seenAnchor = new Set();
for (const [x, y] of cells) {
  const selfV = get(x, y);
  const fx = Math.floor((selfV % 1e6) / 64), fy = selfV % 64;
  const leftIsChest = get(x - 1, y) >= 1e6;
  const rightIsChest = get(x + 1, y) >= 1e6;
  if (!leftIsChest) {
    seenAnchor.add(`${x},${y}`);
    // 左锚格:伙伴判定
    if (!rightIsChest || (get(x + 1, y) % 64 !== fy)) {
      orphans.push({ x, y, fx, fy, note: !rightIsChest ? '缺右伴' : 'fy 不齐' });
    }
    // 是否骑在梳妆台上(下方两格任一为 dresser)
    const below1 = get(x, y + 1) % 1e6, below2 = get(x + 1, y + 1) % 1e6;
    void below1; void below2;
    const dressBelow = [[x, y + 1], [x + 1, y + 1]].some(([xx, yy]) => {
      const v = get(xx, yy); return v > 0 && Math.floor((v % 1e6) / 64) > 0 && get(xx, yy) >= 1e6;
    });
    void dressBelow;
  }
}
// 骑在梳妆台上的箱子(下两行内含 dresser 单元)
for (const [x, y] of cells) {
  const underDresser = [];
  for (let dy = 1; dy <= 2; dy++) for (let dx = 0; dx <= 1; dx++) {
    if (type[(y + dy) * W + (x + dx)] === 88) underDresser.push(`${x + dx},${y + dy}`);
  }
  if (underDresser.length && (get(x - 1, y) < 1e6)) stacksOnDresser.push({ anchor: `${x},${y}`, dresserCells: underDresser });
}
console.log(JSON.stringify({
  totalChestCells: cells.length,
  orphanChests: orphans,
  chestOnDresserAnchors: stacksOnDresser.slice(0, 20),
}, null, 2));
