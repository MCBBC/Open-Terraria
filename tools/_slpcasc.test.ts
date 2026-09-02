// #53 SmoothWorld 坡面雪崩预分析 + 塌缩预测（AAA 后续，纯取证）：
// ① JS 管线跑到 slot13（半砖平滑）末抓 @52/@53 全通道 + (22,664) 逐槽史 + slot13 内
//    SWAct 事件流（x≤40）；随后中止生成省时。
// ② @52 输入差逐通道量化（含 slope/half 差格清单 + x 分布带）。
// ③ 重放分解（基座=golden052+JS frame，逐族回注 JS 债）：
//    clean / typact(#32) / liq(#49) / hs(#47) / full(管线) → 掷数 + vs dump053 八通道差
//    + clean↔full 逐格掷位首分叉（雪崩起点）。
// ④ (22,664) 定源：golden/JS 各时点值 + 写入槽位 + SmoothWorld 内写入事件。
// 用法：cd game && SW_SLP=1 npx vitest run tools/_slpcasc.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_SLP === '1';
const G2 = process.env.SW_SLP_G ?? '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const VAN_N53 = 5_097_254; // x86 passchain #53 掷数（U 批定标）
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

const DUMPNAME = new Map<number, string>();
if (RUN) for (const f of readdirSync(G2))   // ★套件门(2026-09-02):夹具目录缺省不扫 {
  const m = /^(\d{3})_(.+)\.typ$/.exec(f);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

interface Snap { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; wire: Uint8Array }
const snapStore = (st: TileStore): Snap => ({
  type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(), liquid: st.liquid.slice(),
  liquidType: st.liquidType.slice(), half: st.half.slice(), slope: st.slope.slice(),
  frameX: st.frameX.slice(), frameY: st.frameY.slice(), wire: st.wire.slice(),
});

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

/** 八通道差：vs dump idx。返回逐通道计数 + 首差格（行/列主序）+ slope/half 差格样本 */
interface DiffR { dAct: number; dTyp: number; dWal: number; dLiq: number; dLty: number; dHf: number; dSl: number; dIa: number; firstRow: string; firstCol: Record<string, string>; hsCells: string[]; slMinX: number; slX: Array<[number, number]> }
function diffAll(st: Snap, idx: number, hsLimit = 12): DiffR {
  const t = rd16(idx, 'typ'), a = rd8(idx, 'act'), w = rd16(idx, 'wal'), l = rd8(idx, 'liq');
  const hf = rd8(idx, 'half'), sl = rd8(idx, 'slope'), lt = rd8(idx, 'lty'), ia = rd8(idx, 'inact');
  const r: DiffR = { dAct: 0, dTyp: 0, dWal: 0, dLiq: 0, dLty: 0, dHf: 0, dSl: 0, dIa: 0, firstRow: '', firstCol: {}, hsCells: [], slMinX: 99999, slX: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] };
  let anyRow = false;
  const colSeen = new Set<string>();
  for (let i = 0; i < N; i++) {
    const va = a[i] !== 0, ja = st.flags[i] !== 0;
    const jt = ja ? (SHEET[st.type[i]] ?? -1) : 0;
    const vt = va ? t[i] : 0;
    const jl = st.liquid[i], vlt = l[i] > 0 ? lt[i] : 0, jlt = st.liquid[i] > 0 ? st.liquidType[i] - 1 : 0;
    const dA = va !== ja, dT = vt !== jt, dW = w[i] !== st.wall[i], dL = l[i] !== jl, dLt = vlt !== jlt, dH = hf[i] !== st.half[i], dS = sl[i] !== st.slope[i], dI = (ia[i] !== 0) !== ((st.wire[i] >>> 5) & 1 === 1);
    if (!(dA || dT || dW || dL || dLt || dH || dS || dI)) continue;
    const x = i % W, y = (i / W) | 0;
    if (!anyRow) { r.firstRow = `(${x},${y})`; anyRow = true; }
    if (dA) r.dAct++; if (dT) r.dTyp++; if (dW) r.dWal++; if (dL) r.dLiq++; if (dLt) r.dLty++;
    if (dH) r.dHf++; if (dS) { r.dSl++; if (x < r.slMinX) r.slMinX = x; const b = x < 100 ? 0 : x < 600 ? 1 : x < 700 ? 2 : x < 3400 ? 3 : 4; r.slX[b][1]++; }
    if (dI) r.dIa++;
    if ((dH || dS) && r.hsCells.length < hsLimit) r.hsCells.push(`(${x},${y}) h${st.half[i]}>${hf[i]} s${st.slope[i]}>${sl[i]}`);
    for (const [ck, d] of [['act', dA], ['typ', dT], ['wal', dW], ['liq', dL], ['lty', dLt], ['half', dH], ['slope', dS]] as Array<[string, boolean]>) {
      if (d && !colSeen.has(ck)) { r.firstCol[ck] = `(${x},${y})`; colSeen.add(ck); }
    }
  }
  return r;
}
const fmtDiff = (label: string, r: DiffR) => console.log(`${label}: act=${r.dAct} typ=${r.dTyp} wal=${r.dWal} liq=${r.dLiq} lty=${r.dLty} half=${r.dHf} slope=${r.dSl} inact=${r.dIa} | 首差(行)${r.firstRow} | slope首差(列主序)=${r.firstCol['slope'] ?? '·'} slope最小x=${r.slMinX === 99999 ? '·' : r.slMinX} slope x带[<100,100-600,600-700,700-3400,>3400]=${JSON.stringify(r.slX)}${r.hsCells.length ? `\n   h/s 差格: ${r.hsCells.join(' ')}` : ''}`);

(RUN ? it : it.skip)('#53 SmoothWorld avalanche pre-analysis', async () => {
  // ── ① 管线跑到 slot13 末 ──
  let js52: Snap | null = null, js53: Snap | null = null;
  let gs52: Map<number, boolean> | null = null;
  const cellHist: string[] = [];
  const pipeActs: Array<[string, number, number, number]> = [];
  let pipeSwOn = false;
  const g0 = globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void };
  g0.__swSWAct = (fn, x, y, e) => {
    if (pipeSwOn && x >= 18 && x <= 40 && pipeActs.length < 200_000) pipeActs.push([fn, x, y, e]);
  };
  class Ab extends Error { constructor() { super('SLP-ABORT'); } }
  const TX = 22, TY = 664;
  const cellStr = (st: TileStore) => {
    const k = TY * W + TX;
    return `(${TX},${TY}) a${st.flags[k]} h${st.half[k]} s${st.slope[k]}`;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0,
      onWorldPartial: (w, i, name) => {
        const cur = cellStr(w.store);
        const prev = cellHist.length ? cellHist[cellHist.length - 1]!.split('] ')[1] : '';
        if (cur !== prev) cellHist.push(`[${String(i).padStart(2)} ${name}] ${cur}`);
        if (i === 12) {
          js52 = snapStore(w.store);
          gs52 = snapshotGenSolid();
          pipeSwOn = true;
        } else if (i === 13) {
          js53 = snapStore(w.store);
          pipeSwOn = false;
          throw new Ab();
        }
      },
    });
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    if (!(e instanceof Ab || cause instanceof Ab)) throw e;
  } finally { g0.__swSWAct = undefined; }
  if (!js52 || !js53 || !gs52) throw new Error('capture failed');
  const j52 = js52 as Snap, j53 = js53 as Snap, solid52 = gs52 as Map<number, boolean>;
  console.log(`captured @52/@53 + GenSolid(${solid52.size})；(22,664) 槽史变化点 ${cellHist.length} 个`);
  for (const h of cellHist) console.log('  ', h);
  console.log(`slot13 内 SWAct(x∈[18,40]) 事件数=${pipeActs.length}；前 30: ${pipeActs.slice(0, 30).map(([f, x, y, e]) => `${f}(${x},${y})${e || ''}`).join(' ')}`);
  const act22 = pipeActs.filter(([, x, y]) => x === 22 && y >= 655 && y <= 675);
  console.log(`  (22, y∈[655,675]) 事件: ${act22.map(([f, , y, e]) => `${f}@y${y}${e || ''}`).join(' ') || '无'}`);

  // ── ② @52 输入差量化 ──
  console.log('\n=== ② JS@52(SmoothWorld 输入) vs dump052 ===');
  const d52 = diffAll(j52, 52, 20);
  fmtDiff('[52 入口]', d52);

  console.log('\n=== ③ JS@53 vs dump053（管线现状） ===');
  fmtDiff('[53 出口]', diffAll(j53, 53));

  // ── 债格掩码（@52）──
  const t52 = rd16(52, 'typ'), a52 = rd8(52, 'act'), l52 = rd8(52, 'liq'), lt52 = rd8(52, 'lty'), hf52 = rd8(52, 'half'), sl52 = rd8(52, 'slope');
  const mTypAct = new Uint8Array(N), mLiq = new Uint8Array(N), mHs = new Uint8Array(N);
  let nTa = 0, nLq = 0, nHs = 0;
  for (let i = 0; i < N; i++) {
    const dA = (a52[i] !== 0) !== (j52.flags[i] !== 0);
    const dT = (a52[i] ? t52[i] : 0) !== (j52.flags[i] ? (SHEET[j52.type[i]] ?? -1) : 0);
    if (dA || dT) { mTypAct[i] = 1; nTa++; }
    const dL = l52[i] !== j52.liquid[i];
    const dLt = (l52[i] > 0 ? lt52[i] : 0) !== (j52.liquid[i] > 0 ? j52.liquidType[i] - 1 : 0);
    if (dL || dLt) { mLiq[i] = 1; nLq++; }
    if (hf52[i] !== j52.half[i] || sl52[i] !== j52.slope[i]) { mHs[i] = 1; nHs++; }
  }
  // 各债格 x 范围
  const xRange = (m: Uint8Array): string => {
    let mn = 99999, mx = -1, cnt = 0;
    for (let i = 0; i < N; i++) if (m[i]) { const x = i % W; if (x < mn) mn = x; if (x > mx) mx = x; cnt++; }
    return cnt ? `n=${cnt} x∈[${mn},${mx}]` : 'n=0';
  };
  console.log(`\n债格分解: typAct(${xRange(mTypAct)}) liq(${xRange(mLiq)}) hs(${xRange(mHs)})`);

  // ── ④ 重放分解 ──
  interface Visit { cell: Int32Array; draws: Int32Array; k: number }
  const runReplay = (label: string, build: () => TileStore, track?: Visit): { draws: number; d: DiffR; acts: string[]; out: Snap } => {
    const st = build();
    restoreGenSolid(solid52);
    const { rng, box } = countedRng(SEED);
    const gc = globalThis as { __swSWCell?: (x: number, y: number) => void; __swSWAct?: (fn: string, x: number, y: number, e: number) => void };
    const acts: string[] = [];
    if (track) {
      gc.__swSWCell = (x, y) => {
        if (track.k < track.cell.length) { track.cell[track.k] = y * W + x; track.draws[track.k] = box.n; track.k++; }
      };
    }
    gc.__swSWAct = (fn, x, y, e) => { if (x >= 18 && x <= 40 && acts.length < 300_000) acts.push(`${box.n}:${fn}(${x},${y})${e || ''}`); };
    try { runSmoothWorldPass(st, rng, { seed: SEED } as GenState); } finally { gc.__swSWCell = undefined; gc.__swSWAct = undefined; }
    const out = snapStore(st);
    const d = diffAll(out, 53, 6);
    console.log(`\n[${label}] draws=${box.n} (vs vanilla ${VAN_N53}, diff=${box.n - VAN_N53})`);
    fmtDiff(`  → vs dump053`, d);
    return { draws: box.n, d, acts, out };
  };
  /** 基座：golden052 全通道 + JS frame/wall；逐通道 mask 回注 JS 值 */
  const buildHybrid = (mTyp?: Uint8Array, mLiqM?: Uint8Array, mHsM?: Uint8Array, full = false): () => TileStore => () => {
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      const pT = full || (mTyp && mTyp[i] === 1);
      const pL = full || (mLiqM && mLiqM[i] === 1);
      const pH = full || (mHsM && mHsM[i] === 1);
      if (pT) { st.type[i] = j52.type[i]; st.flags[i] = j52.flags[i]; }
      else { st.flags[i] = a52[i] ? 1 : 0; st.type[i] = a52[i] ? (REV.get(t52[i]) ?? 0) : 0; }
      if (pL) { st.liquid[i] = j52.liquid[i]; st.liquidType[i] = j52.liquidType[i]; }
      else { st.liquid[i] = l52[i]; st.liquidType[i] = l52[i] > 0 ? lt52[i] + 1 : 0; }
      if (pH) { st.half[i] = j52.half[i]; st.slope[i] = j52.slope[i]; }
      else { st.half[i] = hf52[i]; st.slope[i] = sl52[i]; }
      st.wall[i] = j52.wall[i];
      st.frameX[i] = j52.frameX[i]; st.frameY[i] = j52.frameY[i];
      st.wire[i] = j52.wire[i];
    }
    return st;
  };

  const vClean: Visit = { cell: new Int32Array(4_900_000), draws: new Int32Array(4_900_000), k: 0 };
  const clean = runReplay('clean·输入归零(仅剩 JS frame/wall)', buildHybrid(), vClean);
  const typ = runReplay('typact·仅 #32 typ/act 债', buildHybrid(mTypAct));
  const liq = runReplay('liq·仅 #49 liq/lty 债', buildHybrid(undefined, mLiq));
  const hs = runReplay('hs·仅 half/slope 债(#47 起)', buildHybrid(undefined, undefined, mHs));
  const vFull: Visit = { cell: new Int32Array(4_900_000), draws: new Int32Array(4_900_000), k: 0 };
  const full = runReplay('full·管线 @52 输入全量', buildHybrid(undefined, undefined, undefined, true), vFull);
  // full 重放 vs 管线 @53（重放忠实性：应全 0）
  {
    let dA = 0, dT = 0, dL = 0, dH = 0, dS = 0, first = '';
    const fo = full.out;
    for (let i = 0; i < N; i++) {
      const bad = fo.flags[i] !== j53.flags[i] || (fo.flags[i] && (SHEET[fo.type[i]] ?? -1) !== (SHEET[j53.type[i]] ?? -1))
        || fo.liquid[i] !== j53.liquid[i] || fo.half[i] !== j53.half[i] || fo.slope[i] !== j53.slope[i];
      if (!bad) continue;
      if (fo.flags[i] !== j53.flags[i]) dA++;
      else if ((SHEET[fo.type[i]] ?? -1) !== (SHEET[j53.type[i]] ?? -1)) dT++;
      else if (fo.liquid[i] !== j53.liquid[i]) dL++;
      else if (fo.half[i] !== j53.half[i]) dH++;
      else dS++;
      if (!first) first = `(${i % W},${(i / W) | 0})`;
    }
    console.log(`\n[重放忠实性] full 重放 vs 管线@53: act=${dA} typ=${dT} liq=${dL} half=${dH} slope=${dS} first=${first || '·'}`);
    void liq; void typ;
  }

  // ── 雪崩起点：clean vs full 逐格掷位首分叉 ──
  {
    const k = Math.min(vClean.k, vFull.k);
    let firstK = -1;
    for (let q = 0; q < k; q++) { if (vClean.draws[q] !== vFull.draws[q]) { firstK = q; break; } }
    if (firstK < 0) console.log('\n[雪崩起点] clean 与 full 掷位全程一致（loop1 无流移）');
    else {
      const cell = vClean.cell[firstK];
      const prev = firstK > 0 ? vClean.cell[firstK - 1] : -1;
      console.log(`\n[雪崩起点] 首个掷位分叉：进入格 #${firstK} = (${cell % W},${(cell / W) | 0})（前格 (${prev % W},${(prev / W) | 0}) 处理中分叉；clean draws=${vClean.draws[firstK]} full=${vFull.draws[firstK]}）`);
    }
    // 动作流首分叉（x∈[18,40]）
    const n = Math.min(clean.acts.length, full.acts.length);
    let fa = -1;
    for (let q = 0; q < n; q++) { if (clean.acts[q] !== full.acts[q]) { fa = q; break; } }
    if (fa < 0) console.log('[动作流] x∈[18,40] 动作序列一致');
    else console.log(`[动作流] 首分叉@#${fa}: clean=${clean.acts[fa]} full=${full.acts[fa]}（前后: clean ${clean.acts[fa - 1] ?? '·'} / full ${full.acts[fa - 1] ?? '·'}）`);
  }

  // ── ⑤ (22,664) 定源汇总 ──
  {
    const k = TY * W + TX;
    console.log(`\n[(22,664)] golden052 h${hf52[k]} s${sl52[k]} | golden053 h${rd8(53, 'half')[k]} s${rd8(53, 'slope')[k]} | JS@52 h${j52.half[k]} s${j52.slope[k]} | JS@53 h${j53.half[k]} s${j53.slope[k]} | 邻域 JS@53 s[up,dn,l,r]=${j53.slope[k - W]},${j53.slope[k + W]},${j53.slope[k - 1]},${j53.slope[k + 1]} a[up]=${j53.flags[k - W]}`);
  }

  // ── 预测汇总 ──
  console.log('\n=== 塌缩预测 ===');
  console.log(`R0(clean)=slope ${clean.d.dSl}/half ${clean.d.dHf}/typ ${clean.d.dTyp}/liq ${clean.d.dLiq} draws差=${clean.draws - VAN_N53} → SmoothWorld 自身独立残差`);
  console.log(`R_typact=${typ.d.dSl}/${typ.d.dHf}  R_liq=${liq.d.dSl}/${liq.d.dHf}  R_hs=${hs.d.dSl}/${hs.d.dHf}  R_full=${full.d.dSl}/${full.d.dHf}`);
  console.log(`OOO(#32)+MMM(#49) 清零后 #53 预期残差 ≈ R_hs（若 R_hs≈R_full 则雪崩主源非 #32/#49；若 R_hs≈0 则连锁塌缩成立）`);
}, 580_000);
