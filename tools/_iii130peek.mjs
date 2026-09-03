// IIII107 一次性细看器：dump098/099 + b_ 基座邻域/写面打印
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const G2 = `${homedir()}/GoldenChains/golden-remix/dumps`;
const OUT = '/tmp/iii130-out';
const W = 4200, H = 1200;
const u8 = (p) => { const b = readFileSync(p); return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const le16 = (p) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const S = new Int32Array(u8(`${OUT}/sheet.bin`).buffer);
const D = (n) => ({
  a: u8(`${G2}/${n}.act`), t: le16(`${G2}/${n}.typ`), sl: u8(`${G2}/${n}.slope`),
  hf: u8(`${G2}/${n}.half`), l: u8(`${G2}/${n}.liq`), w: le16(`${G2}/${n}.wal`),
});
const d98 = D('098_Settle_Liquids_Again'), d99 = D('099_Cactus__Palm_Trees____Coral');
const bT = le16(`${OUT}/b_type.bin`), bF = u8(`${OUT}/b_flags.bin`), bSl = u8(`${OUT}/b_slope.bin`);

const mode = process.argv[2] ?? 'vwrite';
if (mode === 'vwrite') {
  const x0 = Number(process.argv[3]), x1 = Number(process.argv[4]);
  for (let x = x0; x <= x1; x++) for (let y = 0; y < H; y++) {
    const i = y * W + x;
    const v = d98.a[i] !== d99.a[i] || (d98.a[i] ? d98.t[i] : 0) !== (d99.a[i] ? d99.t[i] : 0)
      || d98.sl[i] !== d99.sl[i] || d98.hf[i] !== d99.hf[i] || d98.l[i] !== d99.l[i] || d98.w[i] !== d99.w[i];
    if (v) console.log(`  (${x},${y}) van98 t=${d98.a[i] ? d98.t[i] : 0} sl=${d98.sl[i]} hf=${d98.hf[i]} → van99 t=${d99.a[i] ? d99.t[i] : 0} sl=${d99.sl[i]} act=${d99.a[i]} liq=${d99.l[i]}`);
  }
} else if (mode === 'cell') {
  const x0 = Number(process.argv[3]), x1 = Number(process.argv[4]);
  const y0 = Number(process.argv[5]), y1 = Number(process.argv[6]);
  for (let y = y0; y <= y1; y++) {
    let row = `y=${y} `;
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      row += `[x${x}:${d98.a[i] ? `${d98.t[i]}sl${d98.sl[i]}h${d98.hf[i]}` : '.'}] `;
    }
    console.log(row);
  }
} else if (mode === 'anchor') {
  // 中段深带锚清单（vanilla 口径）：sand 53/112/234 active、上格 air+wal0、
  // SolidTile 六件套细分（slope/half 非零 ⇒ vanilla 拒之门内）
  const SAND = new Set([53, 112, 234]);
  const x0 = Number(process.argv[3]) ?? 400, x1 = Number(process.argv[4]) ?? 3800;
  let n = 0;
  for (let x = x0; x <= x1; x++) for (let y = 338; y < H - 50; y++) {
    const i = y * W + x;
    if (!(d98.a[i] && SAND.has(d98.t[i]))) continue;
    const ai = i - W;
    if (d98.a[ai] || d98.w[ai] !== 0) continue;
    const b1 = d98.a[i + W] && d98.t[i + W] === 53;
    const b2 = d98.a[i + 2 * W] && d98.t[i + 2 * W] === 53;
    const gate = !(d98.sl[i] !== 0 || d98.hf[i] !== 0);
    if (gate && b1 && b2) { n++; console.log(`  anchor (${x},${y}) t=${d98.t[i]} sl=${d98.sl[i]} b1=${b1} b2=${b2} → vanilla RPALM+RCACT 域`); }
  }
  console.log(`vanilla 深带受理锚(六件套+双53下格) x∈[${x0},${x1}] = ${n}`);
}
