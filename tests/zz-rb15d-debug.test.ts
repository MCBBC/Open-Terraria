import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';

describe('RB15d debug', () => {
  it('mutated gate + spy behavior', async () => {
    const src = readFileSync(new URL('../../server/src/sim/SimHost.ts', import.meta.url), 'utf8');
    const mutated = src.includes('if (false) return; // MUTATED');
    console.log('MUTATED_ON_DISK:', mutated);
    console.log('gate present:', src.includes('if (stopEvents) return;'));
    const w = new World(64, 32, 4242, 'dbg');
    w.flags.hardMode = true;
    w.flags['downed_134'] = true;
    w.flags.shadowOrbSmashed = true;
    w.lunarEvent.active = true;
    console.log('flags persist:', w.flags.hardMode, w.flags['downed_134'], 'lunar:', w.lunarEvent.active);
    const spy = vi.spyOn(Math, 'random');
    console.log('spy works:', Math.random());
    spy.mockRestore();
    expect(mutated).toBe(true);
  });
});
