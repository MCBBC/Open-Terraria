// IIIII80 冒烟：六秘种子旗标各跑一次小世界，验证管线端到端不崩（含五钩路径）。
// 用法：cd game && npx vitest run tools/_iii80smoke.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const CASES: Array<[string, Record<string, boolean>]> = [
  ['sgis', { surfaceIsInSpace: true }],
  ['toad', { surfaceIsMushrooms: true }],
  ['fishmox', { noInfection: true }],
  ['sparkle', { hallowOnTheSurface: true }],
  ['jagged', { digExtraHoles: true }],
  ['rainbow', { rainbowStuff: true }],
];

const RUN = process.env.SW_I80_SMOKE === '1';

(RUN ? it : it.skip)('iii80 smoke: six secret-seed worlds complete', async () => {  for (const [name, flags] of CASES) {
    const t0 = Date.now();
    await generateWorld({
      width: 1400, height: 500, seedText: '77100' + (CASES.findIndex((c) => c[0] === name) + 1),
      evil: 0, seedFlags: flags,
      onWorldPartial: () => {},
    });
    console.log(`[iii80-smoke] ${name} ok ${Date.now() - t0}ms`);
  }
}, 600_000);
