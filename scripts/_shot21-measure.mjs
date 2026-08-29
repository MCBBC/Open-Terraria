// 用户截图 #21 像素测量：橙盒(向导)底-靴底 差 vs 绿盒(玩家)底-靴底 差
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const png = PNG.sync.read(readFileSync('/Users/vinlic/.claude/image-cache/1bdeeb26-7226-4f3a-a605-6ffea3103e9d/21.png'));
console.log('image:', png.width, 'x', png.height);
const px = (x, y) => {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
};
// 找橙色虚线盒（橙 ~R>200,G 120-190,B<80）
const orangeRows = new Map();
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const [r, g, b] = px(x, y);
    if (r > 200 && g > 110 && g < 200 && b < 90) {
      if (!orangeRows.has(y)) orangeRows.set(y, [x, x]);
      const o = orangeRows.get(y);
      o[0] = Math.min(o[0], x); o[1] = Math.max(o[1], x);
    }
  }
}
const ys = [...orangeRows.keys()].sort((a, b) => a - b);
console.log('orange rows span:', ys[0], '→', ys[ys.length - 1], 'count', ys.length);
// 盒底 = 虚线最下的横段（y 间隔小的最后一组）
let boxBottom = -1;
for (let i = ys.length - 1; i > 0; i--) {
  if (ys[i] - ys[i - 1] <= 3) boxBottom = ys[i];
  else break;
}
const topRows = ys.slice(0, 3).map((y) => [y, orangeRows.get(y)]);
console.log('guide boxBottom≈', boxBottom, 'top rows:', JSON.stringify(topRows));
// 向导靴底：盒下方区域找深棕/黑靴色（靴子棕 R 60-130 G 40-90 B 30-80,暗）
let boot = -1;
for (let y = boxBottom; y < boxBottom + 30 && boot < 0; y++) {
  for (let x = (orangeRows.get(ys[0])?.[0] ?? 0) - 6; x <= (orangeRows.get(ys[0])?.[1] ?? 0) + 6; x++) {
    const [r, g, b, a] = px(x, y);
    if (a > 200 && r > 45 && r < 140 && g > 30 && g < 100 && b > 20 && b < 90) { boot = y; break; }
  }
}
console.log('guide 首个靴色行(盒底下方):', boot, '→ 靴伸出盒底 =', boot >= 0 ? boot - boxBottom : 'n/a', 'px');


// 行内橙像素分段：≥2 段且总跨度 ≥12 → 判为盒边框行
const rowSegs = [];
for (let y = 0; y < png.height; y++) {
  const xs = [];
  for (let x = 0; x < png.width; x++) {
    const [r, g, b] = px(x, y);
    if (r > 200 && g > 110 && g < 200 && b < 90) xs.push(x);
  }
  if (xs.length < 2) continue;
  const segs = [];
  let st = xs[0], prev = xs[0];
  for (let i = 1; i <= xs.length; i++) {
    if (i === xs.length || xs[i] - prev > 4) { segs.push([st, prev]); st = xs[i]; }
    if (i < xs.length) prev = xs[i];
  }
  const span = xs[xs.length - 1] - xs[0];
  if (segs.length >= 2 && span >= 12) rowSegs.push({ y, span, segs });
}
// 盒边框行聚类（y 连续段）
const groups = [];
for (const r of rowSegs) {
  const g = groups[groups.length - 1];
  if (g && r.y - g.end <= 2) { g.end = r.y; g.rows.push(r); }
  else groups.push({ start: r.y, end: r.y, rows: [r] });
}
for (const g of groups) console.log(`橙盒行组 y=${g.start}..${g.end}`, g.rows.slice(0,2).map(r=>`span${r.span}@${r.segs.map(s=>s.join('-')).join('/')}`).join(' ; '));
const last = groups[groups.length - 1];
console.log('guide 盒底行 =', last.end);
// 盒底下方逐行非草扫描
const xr = last.rows[last.rows.length - 1].segs[0];
for (let y = last.end - 2; y < last.end + 26; y++) {
  let cnt = 0; const samples = [];
  for (let x = xr[0] - 6; x <= xr[1] + 8; x++) {
    const [r, g, b, a] = px(x, y);
    if (a < 200) continue;
    if (!(g > 115 && g > r + 25 && g > b + 25)) { cnt++; if (samples.length < 5) samples.push(`${x}:${r},${g},${b}`); }
  }
  console.log(`y=${y} 非草=${cnt}`, cnt>0&&cnt<=5?samples.join(' | '):'');
}
