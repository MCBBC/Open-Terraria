// 截图 #25 测量：EoC 红虚线盒 vs 眼球精灵 bbox
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const png = PNG.sync.read(readFileSync('/Users/vinlic/.claude/image-cache/1bdeeb26-7226-4f3a-a605-6ffea3103e9d/25.png'));
console.log('image:', png.width, 'x', png.height);
const px = (x, y) => {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
};
// 红虚线：r 高 g/b 低
const redRows = [];
for (let y = 0; y < png.height; y++) {
  const xs = [];
  for (let x = 0; x < png.width; x++) {
    const [r, g, b] = px(x, y);
    if (r > 170 && g < 80 && b < 80) xs.push(x);
  }
  if (xs.length >= 2) {
    const segs = [];
    let st = xs[0], prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i === xs.length || xs[i] - prev > 6) { segs.push([st, prev]); st = xs[i]; }
      if (i < xs.length) prev = xs[i];
    }
    if (segs.length >= 1) redRows.push({ y, segs });
  }
}
// 盒边框行 = 有两个分离段（左右边）或长段的行；聚类
const groups = [];
for (const r of redRows) {
  const g = groups[groups.length - 1];
  if (g && r.y - g.end <= 3) { g.end = r.y; g.rows.push(r); }
  else groups.push({ start: r.y, end: r.y, rows: [r] });
}
console.log('红行组:');
for (const g of groups) {
  const l = Math.min(...g.rows.map((r) => Math.min(...r.segs.map((s) => s[0]))));
  const rr = Math.max(...g.rows.map((r) => Math.max(...r.segs.map((s) => s[1]))));
  console.log(`  y ${g.start}..${g.end} x ${l}..${rr}`);
}
// EoC 盒 = 最大的红行组
let box = groups[0];
for (const g of groups) if ((g.end - g.start) > (box.end - box.start)) box = g;
const bx0 = Math.min(...box.rows.map((r) => Math.min(...r.segs.map((s) => s[0]))));
const bx1 = Math.max(...box.rows.map((r) => Math.max(...r.segs.map((s) => s[1]))));
console.log(`EoC 盒: x ${bx0}..${bx1} (${bx1 - bx0}), y ${box.start}..${box.end} (${box.end - box.start})`);
// 眼球精灵 bbox：盒范围内的白色眼球像素（r/g/b 都 > 170 且非纯白盒线）
let ex0 = 1e9, ey0 = 1e9, ex1 = -1, ey1 = -1;
for (let y = box.start - 40; y < box.end + 140 && y < png.height; y++) {
  for (let x = Math.max(0, bx0 - 120); x < Math.min(png.width, bx1 + 160); x++) {
    const [r, g, b, a] = px(x, y);
    if (a > 200 && r > 185 && g > 175 && b > 165 && !(Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 240)) {
      if (x < ex0) ex0 = x;
      if (x > ex1) ex1 = x;
      if (y < ey0) ey0 = y;
      if (y > ey1) ey1 = y;
    }
  }
}
console.log(`眼球 bbox: x ${ex0}..${ex1} (${ex1 - ex0}), y ${ey0}..${ey1} (${ey1 - ey0})`);
console.log(`盒中心: (${(bx0 + bx1) / 2}, ${(box.start + box.end) / 2})`);
console.log(`眼球中心: (${(ex0 + ex1) / 2}, ${(ey0 + ey1) / 2})`);
console.log(`眼球中心-盒中心: dx=${((ex0 + ex1) / 2 - (bx0 + bx1) / 2).toFixed(1)}, dy=${((ey0 + ey1) / 2 - (box.start + box.end) / 2).toFixed(1)}`);
console.log(`盒底-眼球底: ${(box.end - ey1)}px (正=眼球底在盒底上方)`);
console.log(`眼球顶-盒顶: ${(ey0 - box.start)}px (正=眼球顶在盒顶下方)`);

// ---- 虚线周期检测：行/列红像素 ≥4 分段 = 盒边框 ----
const rowDashes = [];
for (let y = 0; y < png.height; y++) {
  const xs = [];
  for (let x = 0; x < png.width; x++) {
    const [r, g, b] = px(x, y);
    if (r > 170 && g < 80 && b < 80) xs.push(x);
  }
  if (xs.length < 3) continue;
  let segs = 1;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 5) segs++;
  if (segs >= 4) rowDashes.push({ y, l: xs[0], r: xs[xs.length - 1] });
}
const colDashes = [];
for (let x = 0; x < png.width; x++) {
  const ys = [];
  for (let y = 0; y < png.height; y++) {
    const [r, g, b] = px(x, y);
    if (r > 170 && g < 80 && b < 80) ys.push(y);
  }
  if (ys.length < 3) continue;
  let segs = 1;
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 5) segs++;
  if (segs >= 4) colDashes.push({ x, t: ys[0], b: ys[ys.length - 1] });
}
console.log('虚线边框行:', JSON.stringify(rowDashes.slice(0, 8)));
console.log('虚线边框列:', JSON.stringify(colDashes.slice(0, 8)));
if (rowDashes.length >= 2 && colDashes.length >= 2) {
  const topB = rowDashes[0].y, botB = rowDashes[rowDashes.length - 1].y;
  const leftB = colDashes[0].x, rightB = colDashes[colDashes.length - 1].x;
  console.log(`虚线盒: x ${leftB}..${rightB} (${rightB - leftB}), y ${topB}..${botB} (${botB - topB})`);
  console.log(`盒中心: (${(leftB + rightB) / 2}, ${(topB + botB) / 2})`);
  if (ex1 > 0) {
    console.log(`眼球中心-盒中心: dx=${((ex0 + ex1) / 2 - (leftB + rightB) / 2).toFixed(1)}, dy=${((ey0 + ey1) / 2 - (topB + botB) / 2).toFixed(1)}`);
    console.log(`盒尺寸 vs 眼球bbox: ${rightB - leftB}x${botB - topB} vs ${ex1 - ex0}x${ey1 - ey0}`);
  }
}
