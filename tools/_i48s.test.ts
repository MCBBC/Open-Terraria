// IIII48 仪T：分离调用 + 表格离线比对——彻底排除框架干扰。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

it.skipIf(process.env.SW_I48T !== '1')('i48t separated-table', async () => {
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

  function tableRun(bound: number): string {
    const st = new TileStore(W, H);
    const rng = new RNG(SEED);
    let cnt = 0;
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = () => cnt++;
    let num = Math.trunc(Math.trunc(W * H * 0.00013) * 1.1);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
      const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
      const x = rng.nextIntRange(0, W);
      const y = rng.nextIntRange(769, H);
      tileRunner(st, rng, gs, x, y, { strength: s2, steps: s3, type });
    }
    const mainEnd = cnt;
    num = Math.trunc(W * H * 0.00013 * 0.4);
    const rows: string[] = [`mainEnd=${mainEnd}`];
    for (let j = 0; j < num; j++) {
      const c0 = cnt;
      const type2 = rng.nextInt(10) === 0 ? -2 : -1;
      const q = rng.nextIntRange(7, bound);
      const stp = rng.nextIntRange(50, 200);
      const spX = rng.nextIntRange(100, 221) * 0.1;
      const spY = rng.nextIntRange(-10, 11) * 0.02;
      const x2 = rng.nextIntRange(0, W);
      const y2 = rng.nextIntRange(769, H);
      const hEnd = cnt;
      tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
      const r1 = cnt - hEnd;
      tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
      const r2 = cnt - hEnd - r1;
      rows.push(`E${j}|q=${q}|stp=${stp}|spX=${spX.toFixed(1)}|xy=${x2},${y2}|r1=${r1}|r2=${r2}`);
    }
    delete g.__swOnRoll;
    rows.push(`total=${cnt}`);
    return rows.join('\n');
  }

  writeFileSync('/tmp/iii51-out/tAB.txt', `${tableRun(26)}\n=====\n${tableRun(25)}`);
}, 300_000);
