// #53 雪崩预分析·终（SW_SLP3=1）：
// ① clean 重放保真 ghost type（含非活性格 golden typ 直映）→ R0 是否归零；
// ② ghost 敏感面量化：SmoothWorld 仅在补角分支无 active 门读侧邻 type
//    （cs:16600/16605/16621/16626 的 190/48/232/495）——统计 golden 侧 ghost∈该集
//    而 JS type 不同的格子（管线 ghost 清零差的暴露面）；
// ③ 债族拆分：typact 债按 60>59（#49 沉降族）vs 其余（#32 地牢族）分别重放；
// ④ S(22,664) 的 draw 序号归属 loop1/loop2（full 债输入重放,acts 全量 x∈[20,24]）。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_SLP3 === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
if (RUN) for (const f of readdirSync(G2))   // ★套件门(2026-09-02):夹具目录缺省不扫 { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

interface Snap { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; wire: Uint8Array }
const snapStore = (st: TileStore): Snap => ({
  type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(), liquid: st.liquid.slice(),
  liquidType: st.liquidType.slice(), half: st.half.slice(), slope: st.slope.slice(),
  frameX: st.frameX.slice(), frameY: st.frameY.slice(), wire: st.wire.slice(),
});

(RUN ? it : it.skip)('#53 avalanche final probes', async () => {
  let js52: Snap | null = null, solid52: Map<number, boolean> | null = null;
  class Ab extends Error { constructor() { super('AB'); } }
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0,
      onWorldPartial: (w, i) => { if (i === 12) { js52 = snapStore(w.store); solid52 = snapshotGenSolid(); } else if (i === 13) throw new Ab(); },
    });
  } catch (e) { const c = (e as { cause?: unknown })?.cause; if (!(e instanceof Ab || c instanceof Ab)) throw e; }
  const j52 = js52 as Snap, solid = solid52 as Map<number, boolean>;
  const t52 = rd16(52, 'typ'), a52 = rd8(52, 'act'), l52 = rd8(52, 'liq'), lt52 = rd8(52, 'lty'), hf52 = rd8(52, 'half'), sl52 = rd8(52, 'slope');

  // ── ① ghost 保真 clean 重放 ──
  const replay = (label: string, build: () => TileStore): { draws: number; dA: number; dT: number; dH: number; dS: number; cells: string[]; acts: string[] } => {
    const st = build();
    restoreGenSolid(solid);
    const rng = new RNG(SEED);
    const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
    const orig = ur.internalSample.bind(ur);
    const box = { n: 0 };
    ur.internalSample = () => { box.n++; return orig(); };
    const acts: string[] = [];
    (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct = (fn, x, y, e) => {
      if (x >= 20 && x <= 24) acts.push(`${box.n}:${fn}(${x},${y})${e || ''}`);
    };
    try { runSmoothWorldPass(st, rng, { seed: SEED } as GenState); } finally { (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined; }
    const a53 = rd8(53, 'act'), t53 = rd16(53, 'typ'), hf53 = rd8(53, 'half'), sl53 = rd8(53, 'slope');
    let dA = 0, dT = 0, dH = 0, dS = 0;
    const cells: string[] = [];
    for (let i = 0; i < N; i++) {
      const va = a53[i] !== 0, ja = st.flags[i] !== 0;
      const jt = ja ? (SHEET[st.type[i]] ?? -1) : -1;
      const bad = va !== ja || (ja && t53[i] !== jt) || hf53[i] !== st.half[i] || sl53[i] !== st.slope[i];
      if (!bad) continue;
      if (va !== ja) dA++; else if (t53[i] !== jt) dT++; else if (hf53[i] !== st.half[i]) dH++; else dS++;
      if (cells.length < 8) cells.push(`(${i % W},${(i / W) | 0}) a${ja ? 1 : 0}>${va ? 1 : 0} t${jt}>${t53[i]} h${st.half[i]}>${hf53[i]} s${st.slope[i]}>${sl53[i]}`);
    }
    console.log(`[${label}] draws=${box.n} (diff=${box.n - 5097254}) dA=${dA} dT=${dT} dH=${dH} dS=${dS} ${cells.join(' ')}`);
    return { draws: box.n, dA, dT, dH, dS, cells, acts };
  };

  // 基座构造：keepGhost=保真非活性 ghost；patch 族掩码
  const mkMask = (fn: (i: number) => boolean) => { const m = new Uint8Array(N); let n = 0; for (let i = 0; i < N; i++) if (fn(i)) { m[i] = 1; n++; } return { m, n }; };
  const isTypDiff = (i: number) => (a52[i] !== 0) !== (j52.flags[i] !== 0) || (a52[i] ? t52[i] : 0) !== (j52.flags[i] ? (SHEET[j52.type[i]] ?? -1) : 0);
  const isSettleTyp = (i: number) => isTypDiff(i) && a52[i] === 1 && t52[i] === 60 && j52.flags[i] === 1 && SHEET[j52.type[i]] === 59;
  const mDun = mkMask((i) => isTypDiff(i) && !isSettleTyp(i));
  const mSet = mkMask(isSettleTyp);
  console.log(`债族拆分: 地牢族 typAct=${mDun.n} 格 | 沉降 60>59 族=${mSet.n} 格`);

  const build = (m: Uint8Array | null, keepGhost: boolean): () => TileStore => () => {
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      if (m && m[i]) {
        st.type[i] = j52.type[i]; st.flags[i] = j52.flags[i];
      } else {
        st.flags[i] = a52[i] ? 1 : 0;
        st.type[i] = keepGhost ? (REV.get(t52[i]) ?? 0) : (a52[i] ? (REV.get(t52[i]) ?? 0) : 0);
      }
      st.liquid[i] = l52[i]; st.liquidType[i] = l52[i] > 0 ? lt52[i] + 1 : 0;
      st.half[i] = hf52[i]; st.slope[i] = sl52[i];
      st.wall[i] = j52.wall[i]; st.frameX[i] = j52.frameX[i]; st.frameY[i] = j52.frameY[i]; st.wire[i] = j52.wire[i];
    }
    return st;
  };

  const rg = replay('clean·ghost 保真', build(null, true));
  replay('clean·ghost 清零(对照=②基座)', build(null, false));
  replay('dungeon 债单独(60>59 剔除)·ghost 保真', build(mDun.m, true));
  replay('settle 60>59 单独·ghost 保真', build(mSet.m, true));

  // ── ② ghost 敏感面 ──
  {
    const SENS = new Set([48, 190, 232, 495]);
    let n = 0;
    const lst: string[] = [];
    for (let i = 0; i < N; i++) {
      if (a52[i] !== 0) continue;                       // 仅非活性 ghost
      if (!SENS.has(t52[i])) continue;                  // golden ghost ∈ 补角读集
      const jt = j52.flags[i] ? (SHEET[j52.type[i]] ?? -1) : 0;
      if (jt === t52[i]) continue;                      // JS ghost 一致
      n++;
      if (lst.length < 10) lst.push(`(${i % W},${(i / W) | 0}) g${t52[i]}>j${jt}`);
    }
    console.log(`\nghost 敏感面(非活性 golden ghost∈{48,190,232,495} 且 JS 异): n=${n} ${lst.join(' ')}`);
  }

  // ── ④ S(22,664) loop 归属（full 债重放）──
  {
    const mAll = mkMask((i) => isTypDiff(i) || l52[i] !== j52.liquid[i] || (l52[i] > 0 ? lt52[i] : 0) !== (j52.liquid[i] > 0 ? j52.liquidType[i] - 1 : 0) || hf52[i] !== j52.half[i] || sl52[i] !== j52.slope[i]);
    const r = replay('full 债(掩码全量)·ghost 保真', build(mAll.m, true));
    const LOOP1 = 5_097_254 - 4160 * 1160;
    const hits = r.acts.filter((s) => s.includes('(22,664)') || s.includes('(22,663)') || s.includes('(22,665)'));
    console.log(`\nloop1 掷总数=${LOOP1}；(22,663..665) 事件: ${hits.join(' ') || '无'} → ${(hits[0] && parseInt(hits[0]) > LOOP1) ? 'loop2 写入' : 'loop1 写入'}`);
  }
}, 580_000);
