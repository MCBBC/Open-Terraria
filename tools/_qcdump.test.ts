process.env.SW_FREEZE_CAVES = '1';
import { describe, it, expect } from 'vitest';
describe('slope bisect', () => {
  it('dump dungeon', async () => {
    (globalThis as any).__cavesGridExport = { at: 'dungeon', dir: '/tmp/js-dg' };
    const { chainCheckpoints } = await import('../tests/caves-checkpoint.test');
    chainCheckpoints('9293480', 0);
    expect(true).toBe(true);
  }, 600000);
});
