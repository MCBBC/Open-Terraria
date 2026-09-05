// IIII196 批一次性取证仪②：#33 Dungeon 157 格逐格台账（x86 dump 033 ↔ JS js33-post）。
// 另对 js33-pre（dump 032 域= Dungeon pass 前）回放同格 → 本 pass 写者二分。
// 用法：cd game && SW_I196ANA=1 npx vitest run tools/_iii196ana.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I196ANA === '1';
const G2 = process.env.SW_I196_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const JS = process.env.SW_I196_JS ?? '/tmp/iii196-out/js33-post';
const JSPRE = process.env.SW_I196_JSPRE ?? '/tmp/iii196-out/js33-pre';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const r8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).byteLength);
const r16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };

(RUN ? it : it.skip)('iii196 d33 ledger', () => {
  const pre = `${G2}/033_Dungeon`;
  const g = { t: r16(`${pre}.typ`), a: r8(`${pre}.act`), w: r16(`${pre}.wal`), l: r8(`${pre}.liq`), hf: r8(`${pre}.half`), sl: r8(`${pre}.slope`), lt: r8(`${pre}.lty`), ia: r8(`${pre}.inact`) };
  const j = { f: r8(`${JS}/flags.bin`), t: r16(`${JS}/type.bin`), w: r16(`${JS}/wall.bin`), l: r8(`${JS}/liquid.bin`), lt: r8(`${JS}/liquidType.bin`), hf: r8(`${JS}/half.bin`), sl: r8(`${JS}/slope.bin`) };
  let p0: ReturnType<typeof r16> | null = null;
  try { p0 = r16(`${JSPRE}/type.bin`); } catch { /* pre optional */ }
  const pf = (() => { try { return r8(`${JSPRE}/flags.bin`); } catch { return null; } })();

  type Cell = { i: number; fam: string; g: string; jn: string; pre: string };
  const cells: Cell[] = [];
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dGh = 0;
  for (let i = 0; i < N; i++) {
    const va = g.a[i]!, ja = j.f[i]! & 1;
    const vt = va ? g.t[i]! : 0;
    const jt = ja ? (j.t[i]! === 0 ? 0 : (SHEET[j.t[i]!] >= 0 ? SHEET[j.t[i]!]! : 9999)) : 0;
    let fam = '';
    if (va !== ja) { dA++; fam += 'A'; }
    if (vt !== jt) { dT++; fam += `T${vt}>${jt}`; }
    if (g.w[i]! !== j.w[i]!) { dW++; fam += `W${g.w[i]}>${j.w[i]}`; }
    if (g.l[i]! !== j.l[i]!) { dL++; fam += `L${g.l[i]}>${j.l[i]}`; }
    if (g.hf[i]! !== j.hf[i]!) { dHf++; fam += `Hf`; }
    if (g.sl[i]! !== j.sl[i]!) { dSl++; fam += `Sl`; }
    const vl = g.l[i]! > 0 ? g.lt[i]! + 1 : 0;
    const jl = j.l[i]! > 0 ? j.lt[i]! : 0;
    if (vl !== jl) { dLt++; fam += `Y${vl}>${jl}`; }
    const vg = va ? 0 : g.t[i]!;
    const jg = ja ? 0 : (j.t[i]! === 0 ? 0 : (SHEET[j.t[i]!] >= 0 ? SHEET[j.t[i]!]! : 9999));
    if (vg !== jg) { dGh++; fam += 'Gh'; }
    if (fam) {
      const preS = p0 ? `pre(a${pf ? pf[i]! & 1 : '?'}v${SHEET[p0[i]!] ?? p0[i]})` : '';
      cells.push({ i, fam, g: `a${va}t${g.t[i]}w${g.w[i]}l${g.l[i]}y${g.lt[i]}h${g.hf[i]}s${g.sl[i]}`, jn: `a${ja}t${jt}(i${j.t[i]})w${j.w[i]}l${j.l[i]}y${jl}h${j.hf[i]}s${j.sl[i]}`, pre: preS });
    }
  }
  console.log(`counts A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Gh=${dGh} cells=${cells.length}`);
  const fams = new Map<string, number>();
  for (const c of cells) { const k = c.fam.replace(/Y\d+>\d+/, 'Y').replace(/W\d+>\d+/, 'W').replace(/L\d+>\d+/, 'L'); fams.set(k, (fams.get(k) ?? 0) + 1); }
  console.log('families:', [...fams.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' | '));
  // x/y 分布
  const xs = cells.map((c) => c.i % W).sort((a, b) => a - b);
  const ys = cells.map((c) => (c.i / W) | 0).sort((a, b) => a - b);
  console.log(`x range ${xs[0]}..${xs[xs.length - 1]}  y range ${ys[0]}..${ys[ys.length - 1]}  y uniq=${[...new Set(ys)].join(',')}`);
  // 逐格表（按 y,x 排序）
  cells.sort((a, b) => a.i - b.i);
  for (const c of cells) {
    console.log(`(${c.i % W},${(c.i / W) | 0}) [${c.fam}] gold={${c.g}} js={${c.jn}} ${c.pre}`);
  }
});
