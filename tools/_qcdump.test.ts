process.env.SW_FREEZE_CAVES = '1';
import { describe, it, expect } from 'vitest';
describe('qc dump', () => {
  it('dump', async () => {
    (globalThis as any).__cavesGridExport = { at: 'quickcleanup', dir: '/tmp/js-qc' };
    const { chainCheckpoints } = await import('../tests/caves-checkpoint.test');
    const r = chainCheckpoints('9293480', 0);
    console.log('qc js =', r.grids.get('quickcleanup'));
    expect(true).toBe(true);
  }, 600000);
});
