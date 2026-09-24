// ★BJ336 变异验证一次性探针：4200×1200 腐化支掷骰计数（放松臂同种子流不变性证据）。
// SW_BJ336=1 门。
import { describe, it, expect } from 'vitest';
import { writeSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const HEAVY = process.env.SW_BJ336 === '1';

function countingRng(seed: number): { rng: RNG; used: () => number } {
  const inner = new RNG(seed);
  let used = 0;
  return {
    rng: {
      vanilla: inner.vanilla,
      next: () => { used++; return inner.next(); },
      nextInt: (m: number) => { used++; return inner.nextInt(m); },
      nextIntRange: (a: number, b: number) => { used++; return inner.nextIntRange(a, b); },
      int: (a: number, b: number) => { used++; return inner.int(a, b); },
      reseed: (s: number) => inner.reseed(s),
    } as unknown as RNG,
    used: () => used,
  };
}

describe('BJ336 变异探针: 4200 腐化掷骰计数', () => {
  it.skipIf(!HEAVY)('4200×1200 crimson=false 全支骰数', () => {
    const st = new TileStore(4200, 1200);
    const { rng, used } = countingRng(314159);
    const gs = {
      seed: 271828, seedFlags: {}, crimson: false, dungeonSide: 0,
      dungeonLocation: 336, worldSurface: 252, worldSurfaceLow: 252,
      rockLevel: 540, undergroundDesert: undefined, evilZones: [],
    } as unknown as GenState;
    runCorruptionPass(st, rng, gs);
    try { writeSync(1, `[bj336-dice] 4200 corruption dice=${used()}\n`); } catch { /* fd */ }
    expect(used()).toBeGreaterThan(0);
  });
});
