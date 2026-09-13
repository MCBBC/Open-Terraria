#!/usr/bin/env node
// 两 PNG 像素差定位(等价仪调试):输出差异数/最大通道差/差异 bbox/差异行直方。
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

// 极简 PNG 解码(8bit RGB/RGBA 非交错)
function decodePng(buf) {
  let off = 8; const w = [], h = [];
  const idat = [];
  let colorType = 0, bitDepth = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w[0] = data.readUInt32BE(0); h[0] = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const W = w[0], H = h[0];
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = W * bpp;
  const out = Buffer.alloc(W * H * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (colorType === 6) { out[o] = cur[x * 4]; out[o + 1] = cur[x * 4 + 1]; out[o + 2] = cur[x * 4 + 2]; out[o + 3] = cur[x * 4 + 3]; }
      else if (colorType === 2) { out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[x]; out[o + 3] = 255; }
    }
    prev = cur;
  }
  return { w: W, h: H, data: out };
}

const [pa, pb] = process.argv.slice(2, 4);
const A = decodePng(readFileSync(pa));
const B = decodePng(readFileSync(pb));
if (A.w !== B.w || A.h !== B.h) { console.log(`size diff ${A.w}x${A.h} vs ${B.w}x${B.h}`); process.exit(0); }
let n = 0, maxc = 0, sumAbs = 0;
let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
const rowHist = new Map();
for (let i = 0; i < A.data.length; i += 4) {
  const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]));
  if (d > 0) {
    n++; maxc = Math.max(maxc, d); sumAbs += d;
    const px = (i >> 2) % A.w, py = (i >> 2) / A.w | 0;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
    const band = py >> 4;
    rowHist.set(band, (rowHist.get(band) ?? 0) + 1);
  }
}
console.log(`${pa} vs ${pb}`);
console.log(`diffPx=${n}/${A.w * A.h} (${(100 * n / (A.w * A.h)).toFixed(3)}%) maxCh=${maxc} meanAbs=${n ? (sumAbs / n).toFixed(2) : 0}`);
if (n) console.log(`bbox=(${minX},${minY})..(${maxX},${maxY})`);
// 样例差像素(前 6 个,坐标+两版颜色)
let shown = 0;
for (let i = 0; i < A.data.length && shown < 6; i += 4) {
  const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
  if (d > 0) {
    const px = (i >> 2) % A.w, py = (i >> 2) / A.w | 0;
    const c = (D, o) => `${D.data[o]},${D.data[o + 1]},${D.data[o + 2]},${D.data[o + 3]}`;
    console.log(`  sample (${px},${py}) A=[${c(A, i)}] B=[${c(B, i)}]`);
    shown++;
  }
}
const top = [...rowHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`topBands(y/16): ${top.map(([b, c]) => `${b * 16}-${b * 16 + 15}:${c}`).join(' ')}`);
// 追加:样例差像素坐标+两版颜色(调试用)
