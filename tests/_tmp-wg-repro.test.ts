// 全链探针前置:pass4 生物群系 .inner 崩溃的栈定位(主线程同路径)
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

describe('wg repro', () => {
  it('crash stack', async () => {
    const opts = { seedText: 'chain2026', W: 4200, H: 1200, onProgress: (n: string, p: number) => { if (p < 0.15) process.stdout.write(`${n} `); } } as unknown as Parameters<typeof generateWorld>[1];
    try {
      const w = await (generateWorld as (a: string, b: unknown) => Promise<unknown>)('chain2026', opts);
      console.log('\nOK', !!w);
    } catch (e) {
      console.log('\nCRASH:', (e as Error).message, '\n', (e as Error).stack?.split('\n').slice(0, 12).join('\n'));
      throw e;
    }
  });
}, 400000);
