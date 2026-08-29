// IIII48 仪Q：bound 转换对照微观——逐 attempt 打印 raw v、两界换算、各自 runner 成本。
import { it } from 'vitest';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

it.skipIf(process.env.SW_I48Q !== '1')('i48q conversions', async () => {
  const W = 4200, H = 1200;
  const SEED = 1138154190;
  const gs = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    undergroundDesert: null,
  } as never;
  // 先推进主循环至与 i48p 相同的流位
  const rng = new RNG(SEED);
  let cntAll = 0;
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = () => cntAll++;
  let num = Math.trunc(Math.trunc(W * H * 0.00013) * 1.1);
  for (let i = 0; i < num; i++) {
    const type = rng.nextInt(10) === 0 ? -2 : -1;
    const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
    const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
    const x = rng.nextIntRange(0, W);
    const y = rng.nextIntRange(769, H);
    tileRunner(new TileStore(W, H), rng, gs, x, y, { strength: s2, steps: s3, type });
  }
  console.log(`mainEnd=${cntAll}`);
  // E 段：只打头部骰（不跑 runner），取 raw 值与两界换算
  num = Math.trunc(W * H * 0.00013 * 0.4);
  let diffs = 0;
  for (let j = 0; j < Math.min(num, 30); j++) {
    const type2 = rng.nextInt(10) === 0 ? -2 : -1;
    // 取下一 raw 但用两种映射：
    const gsRaw = (rng as unknown as { vanilla?: { peek?: () => number } }).vanilla;
    const before = cntAll;
    const stp = rng.nextIntRange(50, 200);
    const spX = rng.nextIntRange(100, 221) * 0.1;
    const spY = rng.nextIntRange(-10, 11) * 0.02;
    const x2 = rng.nextIntRange(0, W);
    const y2 = rng.nextIntRange(769, H);
    void gsRaw; void before;
    console.log(`E${j}: t=${type2} stp=${stp} spX=${spX.toFixed(1)} xy=(${x2},${y2})`);
  }
  delete g.__swOnRoll;
});
