// IIII104b：MB-pass 反演重放 + 段头掷流偏置注入（SW_I135_BIAS_<anchor>=k）。
// 锚点经 __swSeg 段名触发（同名点位于该段 count-draw 之后、放置循环之前），
// 注入即在同一 UnifiedRandom 流上原地 next() k 次 —— 用于定位「±Δ样本」偏差段。
// 比较 = 九通道（8ch+wir）对 truth(~/GoldenChains/golden-ftw-wir#097)。
import { readFileSync, existsSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const G2 = process.env.SW_I135_G2 ?? `${process.env.HOME}/GoldenChains/golden-ftw-wir`;
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const N = W * H;
const SEED = Number(process.env.SW_I135_SEED ?? '1671560105');

// 段名→偏置
const BIAS_POINTS = ['passStart', 'deadCount', 'iceCount', 'swordAttempts', 'campCount',
  'trapCount', 'treeCount', 'longTrackCount', 'stdTrackCount', 'mbLavaS'] as const;
const BIAS: Record<string, number> = {};
for (const p of BIAS_POINTS) {
  const v = process.env[`SW_I135_BIAS_${p}`];
  if (v !== undefined && v !== '') BIAS[p] = Number(v);
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

function hydrate(): { st: TileStore; gs: GenState; chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> } {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8'));
  if (existsSync(`${BASE}/base_gensolid.json`)) {
    const list = JSON.parse(readFileSync(`${BASE}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>;
    restoreGenSolid(new Map(list));
  }
  return { st, gs, chests };
}

it('III135 MB replay with anchored bias injection', () => {
  const t0 = Date.now();
  const { st, gs, chests } = hydrate();
  const rng = new RNG(SEED);
  let trueRolls = 0;
  const ledger: Array<[string, number]> = [];
  const oRoll = (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = () => { trueRolls++; };
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (name: string) => {
      const k = BIAS[name];
      if (k && k > 0) {
        for (let z = 0; z < k; z++) rng.next();
        console.log(`[bias] injected +${k} raw samples @${name}`);
      }
      if (['passStart', 'deadCount', 'iceCount', 'swordAttempts', 'campCount', 'trapCount', 'treeCount', 'longTrackCount', 'stdTrackCount', 'mbLavaS'].includes(name)) {
        ledger.push([name, trueRolls]);
      }
    };
  const r0 = Date.now();
  runMicroBiomesPass(st, rng, gs, chests as never);
  (globalThis as unknown as { __swSeg?: unknown }).__swSeg = undefined;
  (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = oRoll;
  console.log(`pass done ${Date.now() - r0}ms trueRolls=${trueRolls}`);
  console.log('LEDGER ' + ledger.map(([n, v]) => `${n}=${v}`).join(' '));

  // ---- 九通道对拍 ----
  const load16 = (p: string) => new Uint16Array(readFileSync(p).buffer, 0, N);
  const load8 = (p: string) => readFileSync(p);
  const pre = `${G2}/097_Micro_Biomes`;
  const xt = load16(`${pre}.typ`), xa = load8(`${pre}.act`), xw = load16(`${pre}.wal`),
    xl = load8(`${pre}.liq`), xhf = load8(`${pre}.half`), xsl = load8(`${pre}.slope`),
    xlt = load8(`${pre}.lty`), xia = load8(`${pre}.inact`);
  const xwir = existsSync(`${pre}.wir`) ? load8(`${pre}.wir`) : null;
  let dA = 0, dT = 0, dW2 = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dWir = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const pk = (k: string, i: number): void => {
    pair.set(k, (pair.get(k) ?? 0) + 1);
    if (fI < 0) fI = i;
  };
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; pk(`A${va}>${ja}`, i); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; pk(`T${vt}>${jt}`, i); }
    if (xw[i] !== st.wall[i]) { dW2++; pk(`W${xw[i]}>${st.wall[i]}`, i); }
    if (xl[i] !== st.liquid[i]) { dL++; pk(`L${xl[i]}>${st.liquid[i]}`, i); }
    if (xhf[i] !== st.half[i]) { dHf++; pk(`Hf${xhf[i]}>${st.half[i]}`, i); }
    if (xsl[i] !== st.slope[i]) { dSl++; pk(`Sl${xsl[i]}>${st.slope[i]}`, i); }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; pk(`Y${vl}>${jl}`, i); }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; pk(`Ia${via}>${jia}`, i); }
    if (xwir) {
      const vw = (xwir[i] ?? 0) & ~32;
      const jw = (st.wire[i] ?? 0) & ~32;
      if (vw !== jw) { dWir++; pk(`Wb${vw}>${jw}`, i); }
    }
  }
  const bad = dA || dT || dW2 || dL || dHf || dSl || dLt || dIa || dWir;
  console.log(`replay-vs-#097: A=${dA} T=${dT} W=${dW2} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} Wir=${dWir}`
    + ` ${bad ? '✗ first=(' + (fI % W) + ',' + Math.floor(fI / W) + ') top=' + [...pair.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ') : '✓ ZERO'}`
    + ` [t=${Date.now() - t0}ms]`);
  // 偏置签名摘要（供批量脚本 grep）
  console.log(`SIG bias=${JSON.stringify(BIAS)} total_diff=${(dA + dT + dW2 + dL + dHf + dSl + dLt + dIa + dWir)}`);
  // 残差格明细（前 40 条）
  if (bad) {
    const det: string[] = [];
    for (let i = 0; i < N && det.length < 40; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja) { det.push(`(${i % W},${Math.floor(i / W)}) act ${va}>${ja} t${vt}>${jt}`); continue; }
      if (vt !== jt) { det.push(`(${i % W},${Math.floor(i / W)} typ ${vt}>${jt}`); continue; }
      if (xsl[i] !== st.slope[i]) { det.push(`(${i % W},${Math.floor(i / W)}) sl ${xsl[i]}>${st.slope[i]}`); continue; }
      if (xhf[i] !== st.half[i]) det.push(`(${i % W},${Math.floor(i / W)}) hf ${xhf[i]}>${st.half[i]}`);
      else if (xl[i] !== st.liquid[i]) det.push(`(${i % W},${Math.floor(i / W)}) liq`);
      else if ((xwir[i] & ~32) !== (st.wire[i] & ~32)) det.push(`(${i % W},${Math.floor(i / W)}) wir ${(xwir[i] & ~32) >> 0}>>${(st.wire[i] & ~32)}`);
    }
    console.log(`residual cells:\n` + det.join('\n'));
  }
}, 900_000);
