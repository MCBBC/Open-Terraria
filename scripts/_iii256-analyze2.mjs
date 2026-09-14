// 按特征色剖析:亮带(147,177,253±6)与水体(9,61,191±6)逐列存在性
import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync(process.argv[2] ?? '/tmp/iii256-out/repro-full.png'));
const { width, height, data } = png;
const near = (x, y, c, tol) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const i = (y * width + x) * 4;
  return Math.abs(data[i] - c[0]) <= tol && Math.abs(data[i+1] - c[1]) <= tol && Math.abs(data[i+2] - c[2]) <= tol;
};
// 逐列:亮带行集合 / 水体行集合
const LIGHT = [147, 177, 253], BODY = [9, 61, 191], MID = [51, 107, 249];
let out = [];
for (let x = 0; x < width; x++) {
  let lightRows = [], bodyRows = [], midRows = [];
  for (let y = 330; y < 520; y++) {
    if (near(x, y, LIGHT, 8)) lightRows.push(y);
    else if (near(x, y, MID, 8)) midRows.push(y);
    else if (near(x, y, BODY, 8)) bodyRows.push(y);
  }
  if (lightRows.length || bodyRows.length) {
    out.push({ x, light: lightRows.length ? `${lightRows[0]}-${lightRows[lightRows.length-1]}(${lightRows.length})` : '-', mid: midRows.length ? `${midRows[0]}-${midRows[midRows.length-1]}(${midRows.length})` : '-', body: bodyRows.length ? `${bodyRows[0]}-${bodyRows[bodyRows.length-1]}(${bodyRows.length})` : '-' });
  }
}
// 压缩打印:按 x 连续段
console.log('columns with water colors (x: light/mid/body rows):');
let prev = null, start = 0;
const flush = (a, b) => {
  const l = out[a], e = out[b];
  console.log(`  x${l.x}..${e.x}  light=${l.light}..${e.light}  body=${l.body}..${e.body}`);
};
for (let i = 1; i <= out.length; i++) {
  if (i === out.length || out[i].x !== out[i-1].x + 1) { flush(start, i - 1); start = i; }
}
