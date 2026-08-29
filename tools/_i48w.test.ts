// IIII48 仪W：IceBiome 隔离重放（入口=dump013 等效锚点态）vs G2 dump015。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';

const RUN = process.env.SW_I48W === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

(RUN ? it : it.skip)('i48w icebiome', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') { SHEET[i] = s; if (!BYSHEET.has(s)) BYSHEET.set(s, i); }
  }
  const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
  const rd8 = (p: string) => new Uint8Array(readFileSync(p));

  // 入口：dump013_Surface_Caves（post-SurfaceCaves；WavyCaves 零写）
  const st = new TileStore(W, H);
  const t0 = rd16(`${G2}/013_Surface_Caves.typ`);
  const a0 = rd8(`${G2}/013_Surface_Caves.act`);
  const w0 = rd16(`${G2}/013_Surface_Caves.wal`);
  const l0 = rd8(`${G2}/013_Surface_Caves.liq`);
  const lt0 = rd8(`${G2}/013_Surface_Caves.lty`);
  const hf0 = rd8(`${G2}/013_Surface_Caves.half`);
  const sl0 = rd8(`${G2}/013_Surface_Caves.slope`);
  for (let i = 0; i < N; i++) {
    st.type[i] = BYSHEET.get(t0[i]) ?? 0;
    st.flags[i] = a0[i] ? 1 : 0;
    st.wall[i] = w0[i];
    st.liquid[i] = l0[i];
    st.liquidType[i] = lt0[i];
    st.half[i] = hf0[i];
    st.slope[i] = sl0[i];
  }
  const rng = new RNG(SEED);
  const gs = {
    seed: SEED, seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    dungeonSide: 1,
    dungeonX: 2733,
    snowOriginLeft: 2608,
    snowOriginRight: 2861,
  } as never;

  const iceBefore = (() => { let c = 0; for (let i = 0; i < N; i++) if ((st.flags[i] & 1) && st.type[i] === BYSHEET.get(161)) c++; return c; })();
  const snowBefore = (() => { let c = 0; for (let i = 0; i < N; i++) if (st.type[i] === BYSHEET.get(147)) c++; return c; })();
  runIceBiomePass(st, rng, gs);
  const iceAfter = (() => { let c = 0; for (let i = 0; i < N; i++) if ((st.flags[i] & 1) && st.type[i] === BYSHEET.get(161)) c++; return c; })();
  const snowAfter = (() => { let c = 0; for (let i = 0; i < N; i++) if (st.type[i] === BYSHEET.get(147)) c++; return c; })();
  console.log(`pass-effect: ice +${iceAfter - iceBefore} snowGhosts +${snowAfter - snowBefore} snowBottom=${gs.snowBottom}`);

  // 对拍 vs 015_Generate_Ice_Biome
  const rt = rd16(`${G2}/015_Generate_Ice_Biome.typ`);
  const ra = rd8(`${G2}/015_Generate_Ice_Biome.act`);
  let dA = 0, dT = 0, fx = -1;
  const buckets = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = st.flags[i] & 1;
    const vt = va ? Math.max(0, SHEET[st.type[i]]) : 0;
    const ja = ra[i];
    const jt = ja ? rt[i] : 0;
    if (va !== (ja ? 1 : 0) || vt !== jt) {
      dA += va !== ja ? 1 : 0; dT += vt !== jt ? 1 : 0;
      if (fx < 0) fx = i;
      buckets.set(`act${va}>${ja}|${vt}>${jt}`, (buckets.get(`act${va}>${ja}|${vt}>${jt}`) ?? 0) + 1);
    }
  }
  console.log(`ice: dAct=${dA} dTyp=${dT}${fx >= 0 ? ` first@(${fx % W},${Math.floor(fx / W)})` : ''}`);
  for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log('  ', k.padEnd(16), '×', v);
}, 900_000);
