// IIII48 仪O：单 runner 掷耗 vs strength 微观测试（real src engine，空 store）
import { it } from 'vitest';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48O === '1';

it.skipIf(!RUN)('i48o micro cost vs strength', () => {
  const W = 4200, H = 1200;
  const gs = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    undergroundDesert: null,
  } as never;
  for (const str of [8, 16, 25, 45]) {
    const st = new TileStore(W, H);
    const rng = new RNG(777);
    let cnt = 0;
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = () => cnt++;
    tileRunner(st, rng, gs, 2100, 900, { strength: str, steps: 100, type: -1, speedX: 15.3, speedY: -0.14, noYChange: true });
    delete g.__swOnRoll;
    console.log(`str=${str} steps=100 speedExplicit noYChange → cost=${cnt}`);
  }
  // 对照：无显式速度
  for (const str of [8, 16, 25]) {
    const st = new TileStore(W, H);
    const rng = new RNG(777);
    let cnt = 0;
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = () => cnt++;
    tileRunner(st, rng, gs, 2100, 900, { strength: str, steps: 100, type: -1 });
    delete g.__swOnRoll;
    console.log(`str=${str} steps=100 autoSpeed noYChange=false → cost=${cnt}`);
  }
}, 300_000);
