// IIII195 一次性取证：JS 槽末「微群系」(SW_I81_SAVE 产物) vs x86-iamerror 097_Micro_Biomes
// 差格空间画像（T53>397 族 x/y 直方图 + 样点）。零主路径改动。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const JS_P = process.env.SW_I195_JS ?? '/tmp/iii195-out/js-slot97/base_';
const OR_P = process.env.SW_I195_OR ?? `${process.env.HOME}/GoldenChains/i106/x86-iamerror/097_Micro_Biomes`;
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const RUN = process.env.SW_I195 === '1';
(RUN ? it : it.skip)('iii195 slot97 spatial diff', () => {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0, N * 2));
  const jT = le16(`${JS_P}type.bin`), jA = readFileSync(`${JS_P}flags.bin`), jW = le16(`${JS_P}wall.bin`),
    jL = readFileSync(`${JS_P}liquid.bin`);
  const oT = le16(`${OR_P}.typ`), oA = readFileSync(`${OR_P}.act`), oW = le16(`${OR_P}.wal`),
    oL = readFileSync(`${OR_P}.liq`);
  const pair = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const va = oA[i] ? 1 : 0, ja = jA[i] & 1;
    const vt = va ? oT[i]! : 0;
    const jt = ja ? (jT[i]! === 0 ? 0 : (SHEET[jT[i]!] >= 0 ? SHEET[jT[i]!]! : 9999)) : 0;
    if (vt === jt && va === ja) continue;
    const k = `${va ? 'A1' : 'A0'}${ja ? 'jA1' : 'jA0'} T${vt}>${jt}`;
    const e = pair.get(k);
    if (e) { e[0]++; e[1] += i % W; e[2] += (i / W) | 0; e[3] = Math.min(e[3], i % W); e[4] = Math.max(e[4], i % W); e[5] = Math.min(e[5], (i / W) | 0); e[6] = Math.max(e[6], (i / W) | 0); }
    else pair.set(k, [1, i % W, (i / W) | 0, i % W, i % W, (i / W) | 0, (i / W) | 0]);
  }
  console.log('III195 pairs (top 20, [count, xMean, yMean, xMin..xMax, yMin..yMax]):');
  for (const [k, v] of [...pair.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 20)) {
    console.log(`   ${String(v[0]).padStart(6)} ${k}  x̄=${Math.round(v[1] / v[0])} ȳ=${Math.round(v[2] / v[0])} x[${v[3]}..${v[4]}] y[${v[5]}..${v[6]}]`);
  }
  // T53>397 族的 x 直方图（300 宽带）与 y 直方图（100 带）
  const fam: number[] = [];
  for (let i = 0; i < N; i++) {
    const va = oA[i] ? 1 : 0, ja = jA[i] & 1;
    const vt = va ? oT[i]! : 0;
    const jt = ja ? (jT[i]! === 0 ? 0 : (SHEET[jT[i]!] >= 0 ? SHEET[jT[i]!]! : 9999)) : 0;
    if (vt === 53 && jt === 397) fam.push(i);
  }
  const xb = new Map<number, number>();
  const yb = new Map<number, number>();
  for (const i of fam) {
    const x = i % W, y = (i / W) | 0;
    xb.set(Math.floor(x / 300), (xb.get(Math.floor(x / 300)) ?? 0) + 1);
    yb.set(Math.floor(y / 100), (yb.get(Math.floor(y / 100)) ?? 0) + 1);
  }
  console.log('III195 T53>397 x-hist(300):', [...xb.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `x${b * 300}-${b * 300 + 299}:${n}`).join(' '));
  console.log('III195 T53>397 y-hist(100):', [...yb.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `y${b * 100}-${b * 100 + 99}:${n}`).join(' '));
  // 墙差分族
  const wp = new Map<string, number>();
  for (let i = 0; i < N; i++) { if (jW[i] !== oW[i]) { const k = `W${oW[i]}>${jW[i]}`; wp.set(k, (wp.get(k) ?? 0) + 1); } }
  console.log('III195 wall pairs (top 10):', [...wp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}×${v}`).join(' '));
  // 液差分族
  const lp = new Map<string, number>();
  for (let i = 0; i < N; i++) { if (jL[i] !== oL[i]) { const k = `L${oL[i]}>${jL[i]}`; lp.set(k, (lp.get(k) ?? 0) + 1); } }
  console.log('III195 liq pairs (top 10):', [...lp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}×${v}`).join(' '));
});
