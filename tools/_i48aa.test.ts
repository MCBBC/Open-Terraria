// IIII48 仪AB：desert 段隔离重放（入口=dump018）→ 导出 mine-typ/act/wal/liq/lty。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runDesertPass } from '../src/world/gen/vanilla/DesertPass';

it.skipIf(process.env.SW_I48AA !== '1')('i48aa desert export', async () => {
  const G2 = '/tmp/iii45-out/x86-remix';
  const W = 4200, H = 1200, N = W * H;
  const SEED = 1138154190;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') { SHEET[i] = s; if (!BYSHEET.has(s)) BYSHEET.set(s, i); }
  }
  const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
  const rd8 = (p: string) => new Uint8Array(readFileSync(p));
  const st = new TileStore(W, H);
  const f = '018_Mud_Caves_To_Grass';
  const t = rd16(`${G2}/${f}.typ`); const a = rd8(`${G2}/${f}.act`); const wv = rd16(`${G2}/${f}.wal`);
  const lq = rd8(`${G2}/${f}.liq`); const lt = rd8(`${G2}/${f}.lty`); const hf = rd8(`${G2}/${f}.half`); const sl = rd8(`${G2}/${f}.slope`);
  for (let i = 0; i < N; i++) {
    st.type[i] = BYSHEET.get(t[i]) ?? 0; st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = wv[i]; st.liquid[i] = lq[i]; st.liquidType[i] = lt[i];
    st.half[i] = hf[i]; st.slope[i] = sl[i];
  }
  const rng = new RNG(SEED);
  const gs = {
    seed: SEED, seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380, beachLeftEnd: 376, beachRightStart: 3873,
    dungeonSide: 1 as 1 | -1, dungeonX: 2733,
    snowOriginLeft: 2608, snowOriginRight: 2861,
    remixMushroomLayerLow: 850, remixMushroomLayerHigh: 1000,
    desertHiveHigh: H, desertHiveLow: 0, desertHiveLeft: W, desertHiveRight: 0,
    undergroundDesert: null as never, undergroundDesertHive: null as never,
  } as never as Parameters<typeof runDesertPass>[2];
  runDesertPass(st, rng, gs);
  writeFileSync('/tmp/iii51-out/mine-desert.typ', Buffer.from((() => {
    const o = new Uint16Array(N);
    for (let i = 0; i < N; i++) o[i] = (st.flags[i] & 1) ? Math.max(0, SHEET[st.type[i]]) : 0;
    return o.buffer;
  })()));
  writeFileSync('/tmp/iii51-out/mine-desert.act', Buffer.from(Uint8Array.from(st.flags, (v) => v & 1)));
  writeFileSync('/tmp/iii51-out/mine-desert.liq', Buffer.from(st.liquid));
  // JS 域(水1/岩浆2)→ vanilla 0 基（水0/岩浆1）
  const ltyOut = new Uint8Array(N);
  for (let i2 = 0; i2 < N; i2++) {
    if (st.liquid[i2] > 0) ltyOut[i2] = st.liquidType[i2] === 2 ? 1 : 0;
    else ltyOut[i2] = st.liquidType[i2] === 2 ? 1 : st.liquidType[i2] === 1 ? 0 : st.liquidType[i2];
  }
  writeFileSync('/tmp/iii51-out/mine-desert.lty', Buffer.from(ltyOut));
  // desertHive bounds
  console.log(`hiveBounds=[${gs.desertHiveHigh},${gs.desertHiveLow}] x[${gs.desertHiveLeft},${gs.desertHiveRight}] ud=${JSON.stringify(gs.undergroundDesert)}`);
}, 900_000);
