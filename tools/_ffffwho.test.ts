// FFFF 谁写了 (3438..3440,148)=tall plants？setTileSilent 拦截 + 栈
// SW_FFFF5=1 npx vitest run tools/_ffffwho.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF5;
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';

describe.skipIf(!RUN)('FFFF tallgrass writer', () => {
  it('intercept', async () => {
    const TALL = 320;
    const orig = TileStore.prototype.setTileSilent;
    let hits = 0;
    (TileStore.prototype as unknown as { setTileSilent: unknown }).setTileSilent = function (
      this: TileStore, x: number, y: number, t: number, ...rest: unknown[]) {
      if (t === TALL && y >= 147 && y <= 150 && x >= 3436 && x <= 3444 && hits < 6) {
        hits++;
        console.log(`WRITE (${x},${y}) t=${t} @${new Error().stack?.split('\n').slice(1, 5).join(' <= ')}`);
      }
      return (orig as (...a: unknown[]) => unknown).apply(this, [x, y, t, ...rest]);
    };
    try {
      await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 1, name: 'ffff' } as never);
    } finally {
      (TileStore.prototype as unknown as { setTileSilent: unknown }).setTileSilent = orig;
    }
    console.log(`hits=${hits}`);
  }, 600000);
});
