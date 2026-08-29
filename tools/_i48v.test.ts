// IIII48 仪V：状态敏感性直测——同一 extra 参数在 空态/dump态 下的成本；REAL-src 与 faithful 双版本。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

it.skipIf(process.env.SW_I48V !== '1')('i48v state sensitivity', () => {
  const G2 = '/tmp/iii45-out/x86-remix';
  const W = 4200, H = 1200, N = W * H;
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !BYSHEET.has(s)) BYSHEET.set(s, i);
  }
  const mkState = () => {
    const st = new TileStore(W, H);
    const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(readFileSync(p).byteOffset));
    void b16;
    const t0 = new Uint16Array(readFileSync(`${G2}/010_Small_Holes.typ`).buffer.slice(0));
    const a0 = new Uint8Array(readFileSync(`${G2}/010_Small_Holes.act`));
    for (let i = 0; i < N; i++) { st.type[i] = BYSHEET.get(t0[i]) ?? 0; st.flags[i] = a0[i] ? 1 : 0; }
    return st;
  };
  const gs = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    undergroundDesert: null,
  } as never;

  function probe(storeKind: string, q: number, stp: number, spX: number): number {
    const st = storeKind === 'empty' ? new TileStore(W, H) : mkState();
    const rng = new RNG(999);
    let cnt = 0;
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = () => cnt++;
    tileRunner(st, rng, gs, 1482, 1187, { strength: q, steps: stp, type: -1, speedX: spX, speedY: 0.06, noYChange: true });
    tileRunner(st, rng, gs, 1482, 1187, { strength: q, steps: stp, type: -1, speedX: -spX, speedY: -0.06, noYChange: true });
    delete g.__swOnRoll;
    return cnt;
  }

  for (const [tag, q, stp, spX] of [
    ['real-bounds', 17, 101, 20.2],
    ['csharp', 17, 101, 20.3],
  ] as const) {
    console.log(`${tag}: empty=${probe('empty', q, stp, spX)} dump=${probe('dump', q, stp, spX)}`);
  }
}, 300_000);
