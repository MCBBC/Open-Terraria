// IIII111 历史扫描：三差异格在 x86 全槽 dump 中的 act/type 史（正确 byteOffset）
import { readFileSync, readdirSync } from 'node:fs';
const G2 = '/tmp/iii80-out/x86-jagged';
const W = 4200;
const cells = [[2421, 487], [2421, 488], [2373, 738], [2422, 487], [2422, 488]];
// also neighbors of interest
const extra = [];
for (let x = 2418; x <= 2423; x++) { extra.push([x, 487]); extra.push([x, 488]); }
const want = new Set(cells.concat(extra).map(([x, y]) => `${x},${y}`));
const names = {};
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) names[Number(m[1])] = m[2];
}
function chans(idx) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${names[idx]}`;
  const rd = (p, wide) => {
    const b = readFileSync(p);
    return wide ? new Uint16Array(b.buffer, b.byteOffset, b.length >> 1) : new Uint8Array(b.buffer, b.byteOffset);
  };
  try {
    return { t: rd(`${pre}.typ`, true), a: rd(`${pre}.act`), fx: rd(`${pre}.frx`, true), fy: rd(`${pre}.fry`, true), hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), ia: rd(`${pre}.inact`), w: rd(`${pre}.wal`, true) };
  } catch { return null; }
}
const idxs = [...want].map((s) => s.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
console.log('slot                     | ' + idxs.map(([x, y]) => `${x},${y}`).join(' | '));
const histRows = idxs.map(() => []);
for (let d = 0; d <= 105; d++) {
  const c = chans(d);
  if (!c) continue;
  let line = '';
  for (const [x, y] of idxs) {
    const i = y * W + x;
    line += `${c.a[i] ? c.t[i] : '.'}/${c.fx[i]},${c.fy[i]} `;
  }
  console.log(`#${String(d).padStart(3)} ${names[d].slice(0, 22).padEnd(22)} ${line}`);
}
