// IIII99e（2026-08-31）：rainbow #44 Altars 写面差隔离重放。
// A) 真链跑到 Altars 入口捕获 gs+store（并验 vs golden-rainbow dump043 八通道）；
// B) dump043 八通道重建 store + 捕获 gs 独立跑 runAltarsPass；
// C) 双跑产物 vs dump044 八通道对拍 + 两侧祭坛簇清单逐点比对。
// 用法：SW_RBALT=1 npx vitest run tools/_rbalt.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runAltarsPass } from '../src/world/gen/vanilla/CorruptionPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_RBALT === '1';
const G2 = process.env.HOME + '/GoldenChains/golden-rainbow';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const SEED = process.env.SW_M8_SEED ?? '771006';

const ld = (nm: string, ext: string) => {
  const b = readFileSync(`${G2}/${nm}.${ext}`);
  return ext === 'typ' || ext === 'wal' ? new Uint16Array(b.buffer.slice(0)) : new Uint8Array(b);
};
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

interface Snap { store: TileStore; gs: GenState }
function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array || v instanceof Uint16Array || v instanceof Uint8Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

(RUN ? it : it.skip)('rainbow #44 altars isolated replay', async () => {
  // ── P32 记录钩：capture 清零后只记 Altars pass 内的 place3x2 ──
  const p32log: Array<[number, number, number]> = [];
  const gP = globalThis as { __swP32?: (x: number, y: number, t: number) => void };
  gP.__swP32 = (x, y, t) => p32log.push([x, y, t]);

  let snap: Snap | null = null;
  const g0 = globalThis as { __swAltarsCap?: (gs: GenState, st: TileStore) => void };
  g0.__swAltarsCap = (gs, st) => {
    if (snap) return;
    p32log.length = 0;
    snap = {
      store: Object.assign(new TileStore(W, H), {
        type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(),
        liquid: st.liquid.slice(), liquidType: st.liquidType.slice(),
        slope: st.slope.slice(), half: st.half.slice(), wire: st.wire.slice(),
      }) as TileStore,
      gs: cloneGs(gs),
    };
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0,
      seedFlags: { rainbowStuff: true },
      onWorldPartial: () => {},
    });
  } finally {
    g0.__swAltarsCap = undefined;
  }
  if (!snap) throw new Error('altars capture failed');
  console.log(`[gs] seed=${snap.gs.seed} ws=${snap.gs.worldSurface} rock=${snap.gs.rockLevel} crimson=${snap.gs.crimson} crimsonLeft=${snap.gs.crimsonLeft} shimmer=(${snap.gs.shimmerX},${snap.gs.shimmerY})`);

  // ── 入口态 vs dump043 八通道 ──
  const d43 = {
    t: ld('043_Wood_Tree_Walls', 'typ'), a: ld('043_Wood_Tree_Walls', 'act'), w: ld('043_Wood_Tree_Walls', 'wal'),
    l: ld('043_Wood_Tree_Walls', 'liq'), hf: ld('043_Wood_Tree_Walls', 'half'), sl: ld('043_Wood_Tree_Walls', 'slope'),
    lt: ld('043_Wood_Tree_Walls', 'lty'), ia: ld('043_Wood_Tree_Walls', 'inact'),
  };
  const chk43 = (st: TileStore, tag: string) => {
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    const samp: string[] = [];
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i] !== 0;
      const va = d43.a[i] !== 0;
      const jt = ja ? (SHEET[st.type[i]] ?? -1) : -1;
      const vt = va ? d43.t[i] : -1;
      if (va !== ja) { dA++; if (samp.length < 10) samp.push(`A(${i % W},${Math.floor(i / W)})v${va}j${ja}`); }
      if (vt !== jt) { dT++; if (samp.length < 10) samp.push(`T(${i % W},${Math.floor(i / W)})v${vt}j${jt}`); }
      if (st.wall[i] !== d43.w[i]) dW++;
      if (st.liquid[i] !== d43.l[i]) dL++;
      if ((st.half[i] ?? 0) !== d43.hf[i]) dHf++;
      if ((st.slope[i] ?? 0) !== d43.sl[i]) dSl++;
      const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
      const vl = d43.l[i] > 0 ? d43.lt[i] + 1 : 0;
      if (jl !== vl) dLt++;
      const jia = ((st.wire[i] >>> 5) & 1);
      if (jia !== d43.ia[i]) dIa++;
    }
    console.log(`[${tag}] vs dump043: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}${samp.length ? '\n   ' + samp.join(' ') : ''}`);
    return dA + dT + dW + dL + dHf + dSl + dLt + dIa;
  };
  const badCap = chk43(snap.store, 'entry-capture');
  if (badCap !== 0) throw new Error(`捕获入口态与 dump043 不等（${badCap}）——快照保真失败,后续结论作废`);

  // ── B) dump043 重建独立跑 ──
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(d43.t[i]) ?? 0;
    st.flags[i] = d43.a[i] ? 1 : 0;
    st.wall[i] = d43.w[i];
    st.liquid[i] = d43.l[i];
    st.slope[i] = d43.sl[i];
    st.half[i] = d43.hf[i];
    st.liquidType[i] = d43.l[i] > 0 ? d43.lt[i] + 1 : 0;
    st.wire[i] = d43.ia[i] ? (st.wire[i] | (1 << 5)) : st.wire[i];
  }
  const badRebuild = chk43(st, 'dump-rebuild');
  if (badRebuild !== 0) throw new Error(`dump043 重建与真值不等（${badRebuild}）`);
  p32log.length = 0;
  runAltarsPass(st, new RNG(snap.gs.seed), snap.gs);
  const jsList = p32log.map(([x, y, t]) => `${x},${y},t${t}`);
  console.log(`[js-p32] place3x2 调用 ${p32log.length}: ${jsList.join(' ')}`);

  // ── C) 出口 vs dump044 八通道 + 簇清单 ──
  const d44 = {
    t: ld('044_Altars', 'typ'), a: ld('044_Altars', 'act'), w: ld('044_Altars', 'wal'),
    l: ld('044_Altars', 'liq'), hf: ld('044_Altars', 'half'), sl: ld('044_Altars', 'slope'),
    lt: ld('044_Altars', 'lty'), ia: ld('044_Altars', 'inact'),
  };
  let oT = 0, oA = 0, oW = 0, oL = 0, oHf = 0, oSl = 0, oLt = 0, oIa = 0;
  const osamp: string[] = [];
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i] !== 0;
    const jt = ja ? (SHEET[st.type[i]] ?? -1) : -1;
    const vt = d44.a[i] ? d44.t[i] : -1;
    if (vt !== jt) { oT++; if (osamp.length < 20) osamp.push(`T(${i % W},${Math.floor(i / W)})v${vt}>j${jt}`); }
    if ((d44.a[i] !== 0) !== ja) oA++;
    if (st.wall[i] !== d44.w[i]) oW++;
    if (st.liquid[i] !== d44.l[i]) oL++;
    if ((st.half[i] ?? 0) !== d44.hf[i]) oHf++;
    if ((st.slope[i] ?? 0) !== d44.sl[i]) oSl++;
    if ((st.liquid[i] > 0 ? st.liquidType[i] : 0) !== (d44.l[i] > 0 ? d44.lt[i] + 1 : 0)) oLt++;
    if (((st.wire[i] >>> 5) & 1) !== d44.ia[i]) oIa++;
  }
  console.log(`[iso-out] dump重建跑 vs dump044: A=${oA} T=${oT} W=${oW} L=${oL} Hf=${oHf} Sl=${oSl} Lt=${oLt} Ia=${oIa}`);
  if (osamp.length) console.log('  samples:', osamp.join(' | '));

  // JS 侧最终坛格 → 簇
  const JB = new Set<number>();
  for (let i = 0; i < N; i++) if (st.flags[i] && SHEET[st.type[i]] === 26) JB.add(i);
  function clusters(cells: Iterable<number>) {
    const arr = [...cells].sort((p, q) => p - q);
    const cs = new Set(arr);
    const out: Array<{ tl: string }> = [];
    const seen = new Set<number>();
    for (const i of arr) {
      if (seen.has(i) || cs.has(i - W) || cs.has(i - 1)) continue;
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++) for (let dx = 0; dx < 3; dx++) {
        if (!cs.has(i + dy * W + dx)) { ok = false; break; }
        seen.add(i + dy * W + dx);
      }
      out.push({ tl: `${i % W},${Math.floor(i / W)}${ok ? '' : '?'}` });
    }
    return out;
  }
  const VB: Set<number> = new Set();
  for (let i = 0; i < N; i++) if (d44.a[i] && d44.t[i] === 26) VB.add(i);
  const jc = clusters(JB), vc = clusters(VB);
  const jSet = new Set(jc.map((c) => c.tl)), vSet = new Set(vc.map((c) => c.tl));
  console.log(`[census] JS 坛 ${jc.length} / x86 坛 ${vc.length}`);
  console.log(`  仅JS: ${[...jSet].filter((k) => !vSet.has(k)).join(' ') || '(无)'}`);
  console.log(`  仅x86: ${[...vSet].filter((k) => !jSet.has(k)).join(' ') || '(无)'}`);
  if (oA + oT + oW + oL + oHf + oSl + oLt + oIa !== 0) throw new Error(`隔离出口非零差(A${oA}/T${oT}/...)`);
}, 900_000);
