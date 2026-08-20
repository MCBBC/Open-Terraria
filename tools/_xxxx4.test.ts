// XXXXX 批·#97 残 8 格击杀路径追踪（9293480）。用毕即删。
// 用法：cd game && SW_XX=1 npx vitest run tools/_xxxx4.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_XX === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
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
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('#97 remaining-8 kill path trace', async () => {
  const c = { t: b16(gPath(96, 'typ')), a: b8(gPath(96, 'act')), w: b16(gPath(96, 'wal')), l: b8(gPath(96, 'liq')), hf: b8(gPath(96, 'half')), sl: b8(gPath(96, 'slope')), lt: b8(gPath(96, 'lty')), ia: b8(gPath(96, 'inact')) };
  const gs = JSON.parse(readFileSync(`${BDIR}/s48/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s48/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s48/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${BDIR}/s48/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = c.ia[i]! ? 0x20 : 0;
  }
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; st.wire[i] |= fw[q + 3]! & 0x1f; }

  const world = new World(W, H, SEED);
  world.store = st;
  world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
  }
  restoreGenSolid(gensolid);

  // 观察格：8 差格 + 各自锚(下格) + 3×3
  const watch: Array<[number, number]> = [
    [837, 1048], [910, 1155], [3687, 1086], [3800, 1085], [3317, 1097],
    [3580, 895], [3515, 897], [3128, 978],
  ];
  const watchSet = new Set<number>(watch.map(([x, y]) => y * W + x));
  for (const [x, y] of watch) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) watchSet.add((y + dy) * W + (x + dx));
  const G = (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void });
  G.__swKillCap = (x, y, sheet) => {
    const i = y * W + x;
    if (watchSet.has(i)) console.log(`  [engine-kill] (${x},${y}) sheet=${sheet} phase=${phase}`);
  };
  let phase = 'init';

  const rng = new RNG(SEED);
  const sim = new LiquidSim(world);
  sim.passRand = (max) => rng.nextInt(max);
  sim.passRng = rng;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
  if (world.genWaterLine > 0) {
    sim.genWaterLine = world.genWaterLine;
    const d = world.genDungeonExempt;
    if (d) sim.dungeonWaterExempt = (x, y, w) => x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1 && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
  }
  sim.applyGenSolidOverrides((await import('../src/world/gen/vanilla/GenSolid')).snapshotGenSolid());
  sim.worldGenTilesIgnoreWater(true);
  const simAny2 = sim as unknown as Record<string, unknown>;
  const origCA = simAny2.checkAlch as (x: number, y: number) => void;
  simAny2.checkAlch = (x: number, y: number) => {
    const i = y * W + x;
    if (watchSet.has(i)) console.log(`  [checkAlch] (${x},${y}) t${SHEET[st.type[i]!]} fx${st.frameX[i]} anchor(${x},${y + 1}) t${SHEET[st.type[i + W]!]} a${st.flags[i + W]! & 1} l${st.liquid[i]} lt${st.liquidType[i]} phase=${phase}`);
    origCA.call(sim, x, y);
  };
  const origKTA = simAny2.killTileAt as (x: number, y: number) => void;
  simAny2.killTileAt = (x: number, y: number) => {
    const i = y * W + x;
    if (watchSet.has(i)) {
      const sh = SHEET[st.type[i]!] ?? -1;
      const stk = (new Error().stack ?? '').split('\n').slice(2, 5).map(s => s.trim()).join(' <- ');
      console.log(`  [direct-kill] (${x},${y}) sheet=${sh} fx=${st.frameX[i]} fy=${st.frameY[i]} l${st.liquid[i]} lt${st.liquidType[i]} phase=${phase} :: ${stk}`);
    }
    origKTA.call(sim, x, y);
  };
  phase = 'qw';
  sim.quickWater();
  phase = 'wc1';
  sim.waterCheck();
  sim.quickSettle = true;
  for (let round = 0; round < 10; round++) {
    phase = `r${round}`;
    const maxIter = (sim.numLiquid + sim.bufferLen) * 5;
    let ul = 0;
    while (sim.numLiquid > 0 && ul < maxIter) { sim.updateLiquid(); ul++; }
    phase = `r${round}wc`;
    sim.waterCheck();
  }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  phase = 'merge';
  sim.finalGenMergeCheck();
  G.__swKillCap = undefined;

  // 终态逐格报告：8 格 + 锚 + 上格
  const g97t = b16(gPath(97, 'typ')), g97a = b8(gPath(97, 'act'));
  for (const [x, y] of watch) {
    for (let dy = 1; dy >= -1; dy--) {
      const i = (y + dy) * W + x;
      console.log(`  (${x},${y + dy}) v(t${g97t[i]},a${g97a[i]}) j(t${SHEET[st.type[i]!]},a${st.flags[i]! & 1},f${st.frameX[i]!},${st.frameY[i]!},l${st.liquid[i]},lt${st.liquidType[i]}) | base t${c.t[i]} a${c.a[i]} f${st.frameX[i]}=${c.t[i] === 61 || c.t[i] === 82 || c.t[i] === 83 ? `(base fx ${st.frameX[i]})` : ''}`);
    }
    console.log('  ---');
  }
}, 300_000);
