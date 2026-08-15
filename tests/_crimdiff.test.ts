import { it, expect } from 'vitest';
import { chainCheckpoints } from './caves-checkpoint.test';
it('export corruption grid', () => {
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport
    = { at: 'corruption', dir: '/tmp/corrupt-js' };
  chainCheckpoints('SandboxWorld', 1);
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = undefined;
  expect(true).toBe(true);
}, 300000);
