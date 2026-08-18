// GGGG 卡点定位（node 侧，无需 server）：逐 pass 进度 + 300s 看门狗
import { describe, it } from 'vitest';

describe('gggg hang locator', () => {
  it('generateWorld progress', async () => {
    const mod = await import('../src/world/gen/WorldGen');
    const t0 = Date.now();
    const log = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
    const watchdog = setTimeout(() => {
      console.log('WATCHDOG: still running at 240s');
      process.exit(3);
    }, 240_000);
    await mod.generateWorld({
      width: 4200, height: 1200, seedText: '12345', name: 'hang',
      onProgress: (label, p) => log(`${(p * 100).toFixed(0)}% ${label}`),
    });
    clearTimeout(watchdog);
    log('DONE');
  }, 300_000);
});
