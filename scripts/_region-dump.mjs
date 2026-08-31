// 区域矩阵转储（save v4）：typeId/framX 汇总符号化,定位家具互踩几何。
// 用法：SW_MAP=x.json CX=1631 CY=330 R=8 node tools/run-diag.mjs scripts/_region-dump.mjs
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(process.env.SW_MAP, 'utf8'));
const W = d.header.width;
const s = Buffer.from(d.tiles, 'base64').toString('binary');
const u8 = new Uint8Array(s.length);
for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
const N = W * d.header.height;
const type = new Int32Array(N), fxA = new Int32Array(N), fyA = new Int32Array(N);
let p = 0, i = 0;
while (i < N && p < u8.length) {
  let run = 0, sh = 0;
  for (;;) { const b = u8[p++]; run |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  let t = 0; sh = 0;
  for (;;) { const b = u8[p++]; t |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  let fxv = -1, fyv = -1;
  if (t !== 0) {
    sh = 0;
    for (;;) { const b = u8[p++]; fxv |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
    sh = 0;
    for (;;) { const b = u8[p++]; fyv |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
  }
  const end = Math.min(i + run + 1, N);
  for (; i < end; i++) { type[i] = t; fxA[i] = fxv; fyA[i] = fyv; }
}
const CX = Number(process.env.CX ?? 1631), CY = Number(process.env.CY ?? 330);
const R = Number(process.env.R ?? 6);
const lines = [];
for (let y = CY - R; y <= CY + R + 1; y++) {
  let row = `y=${y} `;
  for (let x = CX - R - 1; x <= CX + R + 1; x++) {
    const k = y * W + x;
    const t = type[k];
    let c = '.';
    if (t === 21) c = 'C';            // chest(stable)
    else if (t === 88) c = 'D'
    else if (t === 321) c = 'w'
    else if (t !== 0) c = '?';
    row += c;
  }
  // 附注：这一行内 C/D 的 fx,fy
  const notes = [];
  for (let x = CX - R - 1; x <= CX + R + 2; x++) {
    const k = y * W + x;
    if (type[k] === 21 || type[k] === 88) notes.push(`${type[k] === 21 ? 'C' : 'D'}@:fx${fxA[k]},fy${fyA[k]}`);
  }
  lines.push(row + (notes.length ? '   | ' + notes.join(' ') : ''));
}
console.log(lines.join('\n'));
