import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { chainCheckpoints } from './caves-checkpoint.test';
it('export crim trace', () => {
  (globalThis as { __crimTrace?: string[] }).__crimTrace = [];
  chainCheckpoints('SandboxWorld', 1);
  writeFileSync('/tmp/crim-js.txt', ((globalThis as { __crimTrace?: string[] }).__crimTrace ?? []).join('\n') + '\n');
  expect(true).toBe(true);
}, 300000);
