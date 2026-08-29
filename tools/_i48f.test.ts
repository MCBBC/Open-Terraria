// IIII48 仪F：真实 runCavesPass 于 G2-dump010 上隔离重放——三段(DirtLayer/RockLayer/
// SurfaceCaves)各自对拍 G2 dump 011/012；首差格与肇事 attempt 定位。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runCavesPass } from '../src/world/gen/vanilla/CavesPass';

const RUN = process.env.SW_I48F === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i48f isolated real cavespass', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }

  const st = new TileStore(W, H);
  const t0 = rd16(`${G2}/010_Small_Holes.typ`);
  const a0 = rd8(`${G2}/010_Small_Holes.act`);
  const w0 = rd16(`${G2}/010_Small_Holes.wal`);
  const l0 = rd8(`${G2}/010_Small_Holes.liq`);
  const lt0 = rd8(`${G2}/010_Small_Holes.lty`);
  const hf0 = rd8(`${G2}/010_Small_Holes.half`);
  const sl0 = rd8(`${G2}/010_Small_Holes.slope`);
  // sheet 域→内部 id 反查（本仓库内部 id 下标）
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !BYSHEET.has(s)) BYSHEET.set(s, i);
  }
  for (let i = 0; i < N; i++) {
    const id = BYSHEET.get(t0[i]);
    st.type[i] = id ?? 0;
    st.flags[i] = a0[i] ? 1 : 0;
    st.wall[i] = w0[i];
    st.liquid[i] = l0[i];
    st.liquidType[i] = lt0[i]; // vanilla 0 基？检查——mile8 用 +1 修正，TileStore 存的是 JS +1 基?
    st.half[i] = hf0[i];
    st.slope[i] = sl0[i];
  }

  const rng = new RNG(SEED);
  const gs = {
    seed: SEED,
    seedFlags: { remix: true },
    // 真值（仪G 采集 genstate-at-caves.json）
    worldSurface: 337,
    worldSurfaceLow: 162,
    worldSurfaceHigh: 312,
    rockLevel: 769,
    rockLevelLow: 700,
    rockLevelHigh: 769,
    waterLine: 929,
    lavaLine: 418,
    genWorldSurface: 276,           // raw double 276.xx
    genRockLayer: 745.8000000000001,
    genWorldSurfaceHigh: 312,
    remixSurfaceLayerLow: 700,
    remixSurfaceLayerHigh: 850,
    beachDistance: 380,
    beachLeftEnd: 376,
    beachRightStart: 3873,
    undergroundDesert: { x0: 1660, y0: 286, x1: 2000, y1: 1017 },
  } as never as Parameters<typeof runCavesPass>[2];

  // 捕获各子段末态：reseed 钩打点
  interface Snap { name: string; typ: Uint16Array; act: Uint8Array }
  let snaps: Snap[] = [];
  let pending = '';
  const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
  const snapNow = (nm: string) => {
    const typ = new Uint16Array(N);
    const act = new Uint8Array(N);
    for (let i = 0; i < N; i++) { typ[i] = (st.flags[i] & 1) ? Math.max(0, SHEET[st.type[i]]) : 0; act[i] = st.flags[i] & 1; }
    snaps.push({ name: nm, typ, act });
    console.log(`snapshot@${nm}`);
  };
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    // 进函数时立刻捕获「pre」；此后两个 reseed 分别对应 RockLayer/Surface 头
    if (pending === 'call' ) { snapNow('postDirtLayer'); pending = ''; }
    return oReseed.call(this, s);
  };

  // 调 runCavesPass 前：先跑 DirtLayer 只需让函数自跑——但钩子在 reseed 前触发；
  // 改为人工拆两步不可行（私有），直接让 reseed 钩打点：
  //   第一次 reseed=postSmallHoles(pre)；... 实际序列=RockLayer 边界/Surface 边界。
  snaps = [];
  const gRoll = globalThis as { __swOnRoll?: (v: number) => void };
  let cnt = 0;
  gRoll.__swOnRoll = () => cnt++;
  (globalThis as unknown as { __swI48C?: { n: number } }).__swI48C = {
    get n() { return cnt; },
  };
  console.log(`cons check wsLow=${gs.worldSurfaceLow}`);
  void pending;

  // 手动分段调用不可行 → 直接整体调用，重播钩只在两次内部边界处工作。
  // 序列：入口无 reseed（外层管线已做）→ 内部 ①DirtLayer 头 ②RockLayer 头 ③Surface 头
  let seq = 0;
  let lastCnt = 0;
  const gRollL = globalThis as { __swOnRoll?: (v: number) => void };
  void gRollL;
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    seq++;
    console.log(`reseed#${seq} cumulative dice=${cnt - lastCnt}`);
    lastCnt = cnt;
    if (seq === 2) snapNow('post-DirtLayer');     // 第二次 reseed=RockLayer 头
    if (seq === 3) snapNow('post-RockLayer');     // 第三次 reseed=Surface 头
    return oReseed.call(this, s);
  };
  runCavesPass(st, rng, gs);
  snapNow('post-SurfaceCaves');
  delete gRoll.__swOnRoll;
  console.log(`total dice in runCavesPass=${cnt}`);

  // 对拍
  const cmp2 = (sn: Snap, refTypName: string) => {
    const rt = rd16(`${G2}/${refTypName}.typ`);
    const ra = rd8(`${G2}/${refTypName}.act`);
    let dA = 0, dT = 0, fx = -1;
    const buckets = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const va = sn.act[i], jja = ra[i];
      const vt = sn.typ[i], jt = jja ? rt[i] : 0;
      if (va !== jja || vt !== jt) {
        dA += va !== jja ? 1 : 0;
        dT += vt !== jt ? 1 : 0;
        if (fx < 0) fx = i;
        const k = `${va}|${vt}>${jja}|${jt}`;
        buckets.set(k, (buckets.get(k) ?? 0) + 1);
      }
    }
    console.log(`${sn.name.padEnd(16)} vs ${refTypName}: dAct=${dA} dTyp=${dT}${fx >= 0 ? ` first@(${fx % W},${Math.floor(fx / W)})` : ''}`);
    for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`   ${k.padEnd(14)}×${v}`);
    }
  };
  for (const [sn, rn] of [[0, '011_Dirt_Layer_Caves'], [1, '012_Rock_Layer_Caves'], [2, '013_Surface_Caves']] as const) {
    cmp2(snaps[sn], rn);
  }
}, 900_000);
