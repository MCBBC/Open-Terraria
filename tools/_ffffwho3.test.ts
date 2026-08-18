// SW_FFFFA=1 npx vitest run tools/_ffffwho3.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFFA;
import { generateWorld } from '../src/world/gen/WorldGen';
import * as TreeMod from '../src/world/gen/vanilla/TreePass';

describe.skipIf(!RUN)('FFFF extra tree caller', () => {
  it('trace', async () => {
    const orig = TreeMod.growTree;
    let hits = 0;
    const spy = (st: unknown, rng: unknown, gs: unknown, i: number, y: number, ig = false) => {
      if (i >= 3400 && i <= 3425 && y >= 120 && y <= 150 && hits < 8) {
        hits++;
        console.log(`GROW (${i},${y}) ig=${ig} @${(new Error().stack ?? '').split('\n').slice(2, 5).join(' <= ')}`);
      }
      return (orig as (...a: unknown[]) => unknown)(st, rng, gs, i, y, ig);
    };
    (TreeMod as unknown as { growTree: unknown }).growTree = spy;
    // 同时拦截 re-export 侧：WorldGen.ts 从 TreePass import——ESM 模块绑定不可改，
    // 但调用方直接 import TreePass 的场合会被拦截；vite 转译 CJS 可拦截。
    try {
      await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 1, name: 'ffff' } as never);
    } finally {
      (TreeMod as unknown as { growTree: unknown }).growTree = orig;
    }
    console.log(`hits=${hits}`);
  }, 600000);
});
