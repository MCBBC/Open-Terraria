// IIII111 wire 取证：dump075→076 邻域红/蓝线与致动位变化图
import { readFileSync } from 'node:fs';
const G2 = '/tmp/iii80-out/x86-jagged';
const W = 4200;
const rd = (p, wide) => { const b = readFileSync(p); return wide ? new Uint16Array(b.buffer, b.byteOffset, b.length >> 1) : new Uint8Array(b.buffer, b.byteOffset); };
const pre = (i, nm) => `${G2}/${String(i).padStart(3, '0')}_${nm}`;
const d75 = {
  w: rd(`${pre(75, 'Place_Fallen_Log')}.wire`, true),
  t: rd(`${pre(75, 'Place_Fallen_Log')}.typ`, true),
  a: rd(`${pre(75, 'Place_Fallen_Log')}.act`),
};
const d76 = {
  w: rd(`${pre(76, 'Traps')}.wire`, true),
  t: rd(`${pre(76, 'Traps')}.typ`, true),
  a: rd(`${pre(76, 'Traps').replace('Traps', 'Traps')}.act`),
  ia: rd(`${pre(76, 'Traps')}.inact`),
};
const sites = process.argv.slice(2).length ? process.argv.slice(2).map((s) => s.split(',').map(Number)) : [[2417, 487], [2377, 738]];
for (const [cx, cy] of sites) {
  console.log(`\n=== wire @(${cx},${cy}) 行=y；d76wire: R=红线 B=蓝 A=致动 | 括号=d75 值 | T=x76type ===`);
  for (let y = cy - 10; y <= cy + 10; y++) {
    let row = '';
    for (let x = cx - 16; x <= cx + 16; x++) {
      const i = y * W + x;
      const v76 = d76.w[i], v75 = d75.w[i];
      const bits = ((v76 & 1) ? 'R' : '') + ((v76 & 2) ? 'B' : '') + ((v76 & 16) ? 'A' : '');
      const chg = v76 !== v75 ? '*' : '';
      const ty = d76.a[i] ? String(d76.t[i]).padStart(3) : ' ..';
      row += `${chg}${bits.padEnd(3)}${ty} `;
    }
    console.log(`y=${String(y).padStart(4)} ${row}`);
  }
}
