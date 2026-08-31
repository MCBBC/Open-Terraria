// IIII111 精确动作图（全通道）：dump075→dump076 差异格清单
import { readFileSync } from 'node:fs';
const G2 = '/tmp/iii80-out/x86-jagged';
const W = 4200;
const rd = (p, wide) => { const b = readFileSync(p); return wide ? new Uint16Array(b.buffer, b.byteOffset, b.length >> 1) : new Uint8Array(b.buffer, b.byteOffset); };
const pre = (i, nm) => `${G2}/${String(i).padStart(3, '0')}_${nm}`;
const A = 75, B_ = 76;
const ch = (idx, nm) => ({
  t: rd(`${pre(idx, nm)}.typ`, true), a: rd(`${pre(idx, nm)}.act`), w: rd(`${pre(idx, nm)}.wal`, true),
  l: rd(`${pre(idx, nm)}.liq`), hf: rd(`${pre(idx, nm)}.half`), sl: rd(`${pre(idx, nm)}.slope`),
  lt: rd(`${pre(idx, nm)}.lty`), ia: rd(`${pre(idx, nm)}.inact`), wi: rd(`${pre(idx, nm)}.wire`), fx: rd(`${pre(idx, nm)}.frx`, true), fy: rd(`${pre(idx, nm)}.fry`, true),
});
const X = ch(A, 'Place_Fallen_Log'), Y = ch(B_, 'Traps');
const sites = process.argv.slice(2).map((s) => s.split(',').map(Number));
const R = Number(process.env.SW_R ?? 60);
for (const [cx, cy] of sites) {
  console.log(`\n=== diffs @(${cx},${cy}) ±${R}: dx,dy | act,type(fx,fy) | wall | half,slope | wire | ia ===`);
  let n = 0;
  for (let dy = -R; dy <= R; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= 1200) continue;
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= W) continue;
      const i = y * W + x;
      const d = [];
      if (X.a[i] !== Y.a[i]) d.push(`act${X.a[i]}>${Y.a[i]}`);
      if ((Y.a[i] ? Y.t[i] : 0) !== (X.a[i] ? X.t[i] : 0)) d.push(`typ${X.a[i] ? X.t[i] : '-'}>${Y.a[i] ? Y.t[i] : '-'}`);
      if (X.fx[i] !== Y.fx[i] || X.fy[i] !== Y.fy[i]) d.push(`fr${X.fx[i]},${X.fy[i]}>${Y.fx[i]},${Y.fy[i]}`);
      if (X.w[i] !== Y.w[i]) d.push(`wal${X.w[i]}>${Y.w[i]}`);
      if (X.hf[i] !== Y.hf[i]) d.push(`hf${X.hf[i]}>${Y.hf[i]}`);
      if (X.sl[i] !== Y.sl[i]) d.push(`sl${X.sl[i]}>${Y.sl[i]}`);
      if (X.wi[i] !== Y.wi[i]) d.push(`wi${X.wi[i]}>${Y.wi[i]}`);
      if (X.ia[i] !== Y.ia[i]) d.push(`ia${X.ia[i]}>${Y.ia[i]}`);
      if (d.length) { console.log(`(${dx},${dy})abs(${x},${y}): ${d.join(' ')}`); n++; }
    }
  }
  console.log(`total ${n} diff cells`);
}
