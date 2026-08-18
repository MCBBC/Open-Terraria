// 一次性：#33 MountainCaveOpenings 隔离重放（cavinator 终止步 2 骰修复的裁决）。
// dump032_Dungeon(输入) → runMountainCavesPass → 对拍 dump033_Mountain_Caves(真游戏)。
// 0 差 = 修复正确(caves-chain 金标陈旧);≠0 = 修复错(回滚)。
// 用法：SW_MCISO=1 npx vitest run tools/_mciso.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_MCISO === '1';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const NAMES: Record<number, string> = { 32: 'Dungeon', 33: 'Mountain_Caves' };
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

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

let gsCap: GenState | null = null;

(RUN ? it : it.skip)('#33 MCOpenings isolated replay', async () => {
  const g0 = globalThis as { __swMcCap?: (gs: GenState, st: TileStore) => void };
  g0.__swMcCap = (gs) => { if (!gsCap) gsCap = cloneGs(gs); };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g0.__swMcCap = undefined;
  }
  if (!gsCap) throw new Error('gs capture failed');

  const t32 = new Uint16Array(load(32, 'typ').buffer.slice(0));
  const a32 = load(32, 'act');
  const w32 = new Uint16Array(load(32, 'wal').buffer.slice(0));
  const l32 = load(32, 'liq');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t32[i]!) ?? 0;
    st.flags[i] = a32[i] ? 1 : 0;
    st.wall[i] = w32[i]!;
    st.liquid[i] = l32[i]!;
    st.liquidType[i] = l32[i]! > 0 ? 1 : 0;
  }
  runMountainCavesPass(st, new RNG(gsCap.seed), gsCap);

  const t33 = new Uint16Array(load(33, 'typ').buffer.slice(0));
  const a33 = load(33, 'act');
  const w33 = new Uint16Array(load(33, 'wal').buffer.slice(0));
  const l33 = load(33, 'liq');
  let dT = 0, dA = 0, dW = 0, dL = 0;
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i] !== 0;
    const jT = ja ? (SHEET[st.type[i]] ?? -1) : -1;
    const vt = a33[i] ? t33[i] : -1;
    if (vt !== jT) dT++;
    if ((a33[i] !== 0) !== ja) dA++;
    if (st.wall[i] !== w33[i]) dW++;
    if (st.liquid[i] !== l33[i]) dL++;
  }
  console.log(`[iso-out] 修复版 MCOpenings 隔离 vs dump033: typ=${dT} act=${dA} wal=${dW} liq=${dL}`);
  console.log(`(对照:管线修复前 033 出口管线差=18641;修复后=1501 全来自 032 Dungeon)`);
}, 300_000);
