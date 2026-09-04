// IIII100f 取证仪①（v2）：pass97 轨段流反演——绝对计数扫描。
// 原理：UnifiedRandom 状态=纯样本数函数 F^n(seed)（Knuth 减法器逐位确定性）⇒
// pass97 轨段起点流状态完全由「pass 头 reseed 后的绝对样本数 A」决定。仪具：
//   1. reseed 钩捕获 mbTrack 前最后一次 reseed 的种子（=pass97 头种子）与
//      pass97 实例至 segProbe('mbTrack') 的样本数 A0（__swOnRoll 按实例过滤）；
//      同时快照 store 全通道（轨段写面前 tile 面与金标对齐,写面同已证）。
//   2. 恢复快照→从种子重建流并前推 A→1:1 重放轨段尾（TrackGenerator 长轨/标准轨
//      +NTB 跳岩浆+getGood 黑曜石复位,MicroBiomesPass L566-634）→与金标
//      097_Micro_Biomes 八通道对拍。
//   3. C=0（A=A0）须复现 mile8 实况差账（A=10085 T=11184 W=2 L=242 Hf=139
//      Sl=1473 Lt=242）=重放保真自证；某 A 全通道=0 即定谳「金标 pre-track
//      样本数=A」,与 A0 之差=mahogany 哑骰窗收支差（正=JS 少掷/负=JS 多掷）。
// 用法：cd game && SW_I100F=1 npx vitest run tools/_iii100f-invert.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TrackGenerator } from '../src/world/gen/vanilla/TrackPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I100F === '1';
const OUT = process.env.SW_I100F_OUT ?? '/tmp/iii225b-out';
const G2 = process.env.SW_I100F_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const CMIN = Number(process.env.SW_I100F_CMIN ?? -600);
const CMAX = Number(process.env.SW_I100F_CMAX ?? 600);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const pre = `${G2}/097_Micro_Biomes`;
if (!existsSync(`${pre}.typ`)) throw new Error(`missing ${pre}.typ`);
const G = {
  t: le16(`${pre}.typ`),
  a: readFileSync(`${pre}.act`),
  w: le16(`${pre}.wal`),
  l: readFileSync(`${pre}.liq`),
  hf: readFileSync(`${pre}.half`),
  sl: readFileSync(`${pre}.slope`),
  lt: readFileSync(`${pre}.lty`),
  ia: readFileSync(`${pre}.inact`),
};

/** mile8 cmp 同构（8 通道） */
function cmp(st: TileStore): { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; first: string; pairs: string } {
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  let firstI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = G.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; if (firstI < 0) firstI = i; }
    const vt = va ? G.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; if (firstI < 0) firstI = i; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (G.w[i]! !== st.wall[i]!) { dW++; if (firstI < 0) firstI = i; }
    if (G.l[i]! !== st.liquid[i]!) { dL++; if (firstI < 0) firstI = i; }
    if (G.hf[i]! !== st.half[i]!) { dHf++; if (firstI < 0) firstI = i; const k = `H${G.hf[i]}>${st.half[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (G.sl[i]! !== st.slope[i]!) { dSl++; if (firstI < 0) firstI = i; const k = `S${G.sl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = G.l[i]! > 0 ? G.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (firstI < 0) firstI = i; const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const via = G.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; if (firstI < 0) firstI = i; }
  }
  const pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => `${k}x${n}`).join(' ');
  return { dA, dT, dW, dL, dHf, dSl, dLt, dIa, first: firstI < 0 ? 'ALL-GREEN' : `(${firstI % W},${(firstI / W) | 0})`, pairs };
}

type TypedArray = Uint16Array | Uint8Array;
const ARRAYS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

(RUN ? it : it.skip)('iii100f pass97 track-window stream inversion (absolute count scan)', { timeout: 1_200_000 }, async () => {
  const g = globalThis as {
    __swSeg?: (name: string, detail?: unknown) => void;
    __swOnRoll?: (value: number, inst: object) => void;
  };
  // ── 钩 1：reseed（记录种子序列；activeUr/计数器供 A0 测量）──
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: RNG, s: number) => void;
  const reseedLog: Array<{ seed: number; ur: UnifiedRandom }> = [];
  let activeUr: UnifiedRandom | null = null;
  let activeCount = 0;
  RNGp.reseed = function (this: RNG, s: number) {
    const r = oReseed.call(this, s);
    const ur = (this as unknown as { ur: UnifiedRandom }).ur;
    reseedLog.push({ seed: s, ur });
    activeUr = ur; activeCount = 0;
    return r;
  };
  // ── 钩 2：样本观测（按当前 pass 实例过滤计数）──
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number, inst: object) => {
    if (activeUr && inst === (activeUr as unknown as object)) activeCount++;
    oRoll?.(v, inst);
  };
  // ── 钩 3：mbTrack 快照（store+rng 状态+A0）──
  let cap: {
    st: TileStore; gs: GenState; chests: unknown[];
    seed97: number; a0: number; state: { sa: Int32Array; ix: number };
    snap: Record<string, TypedArray>;
  } | null = null;
  g.__swSeg = (name, detail) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: TileStore; rng: RNG; gs: GenState; chests?: unknown[] };
    const last = reseedLog[reseedLog.length - 1]!;
    const ur = d.rng.vanilla as unknown as { seedArray: Int32Array; inext: number };
    const s: Record<string, TypedArray> = {};
    for (const k of ARRAYS) s[k] = (d.st[k] as TypedArray).slice();
    cap = {
      st: d.st, gs: d.gs, chests: d.chests ?? [],
      seed97: last.seed, a0: activeCount,
      state: { sa: ur.seedArray.slice(), ix: ur.inext },
      snap: s,
    };
    throw new Error('__I100F_ABORT__');   // 快照到手即中止生成（mile8 同法）
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    } as Parameters<typeof generateWorld>[0]);
  } catch (e) {
    if (!(e instanceof Error) || e.message !== '__I100F_ABORT__') throw e;
  }
  g.__swSeg = undefined;
  g.__swOnRoll = oRoll;
  RNGp.reseed = oReseed;
  if (!cap) throw new Error('mbTrack 快照未捕获');
  const S = cap;
  // 取证开关：pre-track store 落盘（gold096/097 三方对差用）
  if (process.env.SW_I100F_SNAP === '1') {
    const enc = (a: Uint8Array | Uint16Array): Buffer => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    writeFileSync(`${OUT}/js-pretrack.typ`, enc(S.snap.type));
    writeFileSync(`${OUT}/js-pretrack.act`, enc(S.snap.flags));
    writeFileSync(`${OUT}/js-pretrack.wal`, enc(S.snap.wall));
    writeFileSync(`${OUT}/js-pretrack.liq`, enc(S.snap.liquid));
    writeFileSync(`${OUT}/js-pretrack.meta.txt`, `A0=${S.a0} seed97=${S.seed97}\n`);
  }

  // ── 流重建器：seed97 → 前推 A 样本 ──
  const AMIN = Math.max(0, S.a0 + CMIN);
  const AMAX = S.a0 + CMAX;
  const scanUr = new UnifiedRandom(S.seed97);
  for (let i = 0; i < AMIN; i++) scanUr.next();
  const baseState = {
    sa: (scanUr as unknown as { seedArray: Int32Array }).seedArray.slice(),
    ix: (scanUr as unknown as { inext: number }).inext,
  };
  const setState = (ur: UnifiedRandom, sa: Int32Array, ix: number): void => {
    (ur as unknown as { seedArray: Int32Array }).seedArray.set(sa);
    (ur as unknown as { inext: number }).inext = ix;
  };
  // 保真自证 A：从种子重建 A0 状态 ≡ 捕获的 pass97 实例状态
  const chk = new UnifiedRandom(S.seed97);
  for (let i = 0; i < S.a0; i++) chk.next();
  const chkU = chk as unknown as { seedArray: Int32Array; inext: number };
  let stateIdentical = true;
  for (let i = 0; i < 56; i++) if (chkU.seedArray[i] !== S.state.sa[i]) stateIdentical = false;
  if (chkU.inext !== S.state.ix) stateIdentical = false;

  /** 轨段尾 1:1 重放（MicroBiomesPass.ts L566-634）。返回诊断。 */
  const runTail = (rng: RNG): { ltrk: number; ltrkOk: number; std: number; stdOk: number } => {
    const st = S.st, gs = S.gs, w = st.w, h = st.h;
    const areaScale = (w * h) / 5040000;
    const scW = (v: number): number => Math.trunc((w / 4200) * v);
    const trackGen = new TrackGenerator(st, gs, S.chests as never);
    const trackFailLimit = Math.floor(w / 2);
    let trackCount = rng.int(scW(1), scW(2));
    const ltrk = trackCount;
    let ltrkOk = 0;
    let tDone = 0, tFail = 0;
    while (tDone < trackCount) {
      const ox = rng.int(10, w - 11);
      const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
      const okL = trackGen.place(ox, oy, scW(400), scW(1000), rng);
      if (okL) { tDone++; tFail = 0; ltrkOk++; } else { tFail++; if (tFail > trackFailLimit) { tDone++; tFail = 0; } }
    }
    trackCount = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
    const std = trackCount;
    let stdOk = 0;
    tDone = 0; tFail = 0;
    while (tDone < trackCount) {
      const ox = rng.int(10, w - 11);
      const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
      const okS = trackGen.place(ox, oy, scW(150), scW(300), rng);
      if (okS) { tDone++; tFail = 0; stdOk++; } else { tFail++; if (tFail > trackFailLimit) { tDone++; tFail = 0; } }
    }
    // lava 段：GFB notTheBees=true → 跳过（vanilla if(!notTheBees) 同构）
    if (gs.seedFlags.getGoodWorld) flipGenSolid([56], false);
    return { ltrk, ltrkOk, std, stdOk };
  };

  // 候选 RNG：把扫描流装进临时 RNG 包装（runTail 只吃 RNG API）
  const candRng = new RNG(1);
  (candRng as unknown as { ur: UnifiedRandom }).ur = scanUr;

  /** 314 连通域（8-conn）bbox 列表——巷起点=+1 巷最左 x / −1 巷最右 x */
  const laneBoxes = (act: Uint8Array, typ: Uint16Array): string => {
    const seen = new Uint8Array(N);
    const out: string[] = [];
    for (let i = 0; i < N; i++) {
      if (seen[i] || !act[i] || typ[i] !== 314) continue;
      const q = [i]; seen[i] = 1;
      let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, cnt = 0;
      while (q.length) {
        const j = q.pop()!; cnt++;
        const x = j % W, y = (j / W) | 0;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (!seen[k] && act[k] && typ[k] === 314) { seen[k] = 1; q.push(k); }
        }
      }
      out.push(`${minx}..${maxx}/${miny}..${maxy}(${cnt})`);
    }
    out.sort((p, q2) => Number(p.split('..')[0]) - Number(q2.split('..')[0]));
    return out.join(' ');
  };
  const laneBoxesGold = laneBoxes(G.a, G.t);
  const jsTyp = new Uint16Array(N);
  const jsAct = new Uint8Array(N);
  const laneBoxesJs = (): string => {
    const st = S.st;
    for (let i = 0; i < N; i++) { jsTyp[i] = (st.flags[i] & 1) ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999) : 0; jsAct[i] = st.flags[i] & 1; }
    return laneBoxes(jsAct, jsTyp);
  };

  const lines: string[] = [];
  lines.push(`iii100f v2 invert A0=${S.a0} seed97=${S.seed97} stateIdentical=${stateIdentical} REAL_WS=${S.gs.worldSurface} REAL_LAVAline=${(S.gs as unknown as { lavaLine: number }).lavaLine}`);
  lines.push(`scan A ∈ [${AMIN}..${AMAX}] golden=${G2}/097_Micro_Biomes`);
  lines.push(`golden lanes: ${laneBoxesGold}`);
  lines.push('mile8 实况基线: A=10085 T=11184 W=2 L=242 Hf=139 Sl=1473 Lt=242 Ia=0（JS LTRK count1/ok1, STRK count7）');
  lines.push('C=A-A0 | dA dT dW dL dHf dSl dLt dIa | ltrk(ok) std(ok) | lanes | first');
  let verdict = 'NO-MATCH';
  for (let a = AMIN; a <= AMAX; a++) {
    for (const k of ARRAYS) (S.st[k] as TypedArray).set(S.snap[k]);
    setState(scanUr, baseState.sa, baseState.ix);
    for (let i = 0; i < a - AMIN; i++) scanUr.next();
    const diag = runTail(candRng);
    const r = cmp(S.st);
    const c = a - S.a0;
    lines.push(`${String(c).padStart(5)} | ${r.dA} ${r.dT} ${r.dW} ${r.dL} ${r.dHf} ${r.dSl} ${r.dLt} ${r.dIa} | L${diag.ltrk}(${diag.ltrkOk}) S${diag.std}(${diag.stdOk}) | ${laneBoxesJs()} | ${r.first}`);
    if (r.dA === 0 && r.dT === 0 && r.dW === 0 && r.dL === 0 && r.dHf === 0 && r.dSl === 0 && r.dLt === 0 && r.dIa === 0) {
      verdict = `MATCH-AT-C=${c} (golden pre-track count=${a})`;
      break;
    }
  }
  lines.push(`VERDICT: ${verdict}`);
  writeFileSync(`${OUT}/invert100f.txt`, lines.join('\n') + '\n');
});
