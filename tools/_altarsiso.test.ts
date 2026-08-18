// 一次性：#44 DemonAndCrimsonAltars 隔离重放（caves-checkpoint 链捕获入口 →
// runAltarsPass → 对拍 x86 dump044_Altars 四通道真值）。
// 裁决 caves-chain altars 检查点红：JS pass 与真游戏 dump 全等 → 金标陈旧；
// 不等 → pass 自因（真实差异）。
// 用法：SW_ALTARSISO=1 npx vitest run tools/_altarsiso.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_ALTARSISO === '1';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { runAltarsPass } from '../src/world/gen/vanilla/CorruptionPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const load = (name: string, ext: string) => readFileSync(`${VG}/${name}.${ext}`);

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Snap {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; slope: Uint8Array; half: Uint8Array; wire: Uint8Array;
  gs: GenState;
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

(RUN ? it : it.skip)('#44 Altars isolated replay vs x86 dump', async () => {
  // ── A) caves-checkpoint 链跑到 Altars 入口,捕获六通道 + gs ──
  const g0 = globalThis as { __swAltarsCap?: (gs: GenState, st: TileStore) => void };
  let snap: Snap | null = null;
  g0.__swAltarsCap = (gs, st) => {
    if (snap) return;
    snap = {
      type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(),
      liquid: st.liquid.slice(), liquidType: st.liquidType.slice(),
      slope: st.slope.slice(), half: st.half.slice(), wire: st.wire.slice(),
      gs: cloneGs(gs),
    };
  };
  try {
    const hashes = chainCheckpoints('9293480', 0);
    console.log(`[chain] done, checkpoints=${hashes.size}`);
  } finally {
    g0.__swAltarsCap = undefined;
  }
  if (!snap) throw new Error('altars capture failed');
  console.log(`[gs] shimmer=(${snap.gs.shimmerX},${snap.gs.shimmerY}) ws=${snap.gs.worldSurface} rock=${snap.gs.rockLevel} crimson=${snap.gs.crimson}`);

  // ── B) 入口状态 vs dump043（Wood_Tree_Walls 末=Altars 输入）四通道 ──
  const t43 = new Uint16Array(load('043_Wood_Tree_Walls', 'typ').buffer.slice(0));
  const a43 = load('043_Wood_Tree_Walls', 'act');
  const w43 = new Uint16Array(load('043_Wood_Tree_Walls', 'wal').buffer.slice(0));
  const l43 = load('043_Wood_Tree_Walls', 'liq');
  {
    let dT = 0, dA = 0, dW = 0, dL = 0;
    for (let i = 0; i < N; i++) {
      const ja = snap.flags[i] !== 0;
      const jT = ja ? (SHEET[snap.type[i]] ?? -1) : -1;
      const vt = a43[i] ? t43[i] : -1;
      if (vt !== jT) dT++;
      if ((a43[i] !== 0) !== ja) dA++;
      if (snap.wall[i] !== w43[i]) dW++;
      if (snap.liquid[i] !== l43[i]) dL++;
    }
    console.log(`[entry] JS链 Altars 入口 vs dump043: typ=${dT} act=${dA} wal=${dW} liq=${dL}`);
  }

  // ── C) 隔离重放:dump043 四通道 + 捕获的 slope/half/liqType/wire(保真近似)──
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t43[i]!) ?? 0;
    st.flags[i] = a43[i] ? 1 : 0;
    st.wall[i] = w43[i]!;
    st.liquid[i] = l43[i]!;
    st.slope[i] = snap.slope[i]!;
    st.half[i] = snap.half[i]!;
    st.liquidType[i] = snap.liquidType[i]!;
    st.wire[i] = snap.wire[i]!;
  }
  const rng = new RNG(snap.gs.seed);
  runAltarsPass(st, rng, snap.gs);

  // ── D) 对拍 dump044_Altars 四通道 + 祭坛清单 ──
  const t44 = new Uint16Array(load('044_Altars', 'typ').buffer.slice(0));
  const a44 = load('044_Altars', 'act');
  const w44 = new Uint16Array(load('044_Altars', 'wal').buffer.slice(0));
  const l44 = load('044_Altars', 'liq');
  let dT = 0, dA = 0, dW = 0, dL = 0, jsA = 0, vanA = 0;
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i] !== 0;
    const jT = ja ? (SHEET[st.type[i]] ?? -1) : -1;
    const vt = a44[i] ? t44[i] : -1;
    if (vt !== jT) {
      dT++;
      if (samples.length < 12) samples.push(`(${i % W},${(i / W) | 0})v${vt}>j${jT}`);
    }
    if ((a44[i] !== 0) !== ja) dA++;
    if (st.wall[i] !== w44[i]) dW++;
    if (st.liquid[i] !== l44[i]) dL++;
    if (jT === 26) jsA++;
    if (t44[i] === 26 && a44[i]) vanA++;
  }
  console.log(`[iso-out] 隔离出口 vs dump044: typ=${dT} act=${dA} wal=${dW} liq=${dL} | altar26 格 js=${jsA} van=${vanA}`);
  if (samples.length) console.log('  samples:', samples.join(' '));

  // ── E) 捕获快照本体直跑(不重建,链状态原样)对拍 dump044 ──
  const st2 = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st2.type[i] = snap.type[i]!;
    st2.flags[i] = snap.flags[i]!;
    st2.wall[i] = snap.wall[i]!;
    st2.liquid[i] = snap.liquid[i]!;
    st2.slope[i] = snap.slope[i]!;
    st2.half[i] = snap.half[i]!;
    st2.liquidType[i] = snap.liquidType[i]!;
    st2.wire[i] = snap.wire[i]!;
  }
  runAltarsPass(st2, new RNG(snap.gs.seed), snap.gs);
  let dT2 = 0, jsA2 = 0;
  for (let i = 0; i < N; i++) {
    const ja = st2.flags[i] !== 0;
    const jT = ja ? (SHEET[st2.type[i]] ?? -1) : -1;
    const vt = a44[i] ? t44[i] : -1;
    if (vt !== jT) dT2++;
    if (jT === 26) jsA2++;
  }
  console.log(`[chain-iso] 链状态直跑 vs dump044: typ=${dT2} | altar26 格 js=${jsA2} van=${vanA}`);
}, 600_000);
