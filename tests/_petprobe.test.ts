import { it } from 'vitest';
import { BestiaryTracker } from '../src/data/Bestiary';

it('dbg bestiary completion', () => {
  const b = new BestiaryTracker();
  const c = (b as unknown as { completion?: () => { percent: number } }).completion;
  console.log('completion fn:', typeof c, c ? JSON.stringify(c.call(b)) : 'MISSING');
});
