// IIII48 仪Z：jungleX 候选 A/B——798(旧带推算) vs 1008(新带)，取 dTyp 小者。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';

it.skipIf(process.env.SW_I48Z !== '1')('i48z origin A/B', () => {
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
  const t17 = rd16(`${G2}/017_Jungle.typ`); const a17 = rd8(`${G2}/017_Jungle.act`);

  function trial(origin: number): number {
    const st = new TileStore(W, H);
    const t = rd16(`${G2}/016_Grass.typ`); const a = rd8(`${G2}/016_Grass.act`);
    const wv = rd16(`${G2}/016_Grass.wal`); const lq = rd8(`${G2}/016_Grass.liq`);
    const lt = rd8(`${G2}/016_Grass.lty`); const hf = rd8(`${G2}/016_Grass.half`); const sl = rd8(`${G2}/016_Grass.slope`);
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
      undergroundDesert: null, jungleX: origin,
    };
    runJunglePass(st, rng, gs);
    let dT = 0;
    for (let i = 0; i < N; i++) {
      const va = st.flags[i] & 1;
      const vt = va ? Math.max(0, SHEET[st.type[i]]) : 0;
      const jt = a17[i] ? t17[i] : 0;
      if (vt !== jt) dT++;
    }
    return dT;
  }

  console.log(`origin=798 → dTyp=${trial(798)}`);
  console.log(`origin=1008 → dTyp=${trial(1008)}`);
}, 900_000);
