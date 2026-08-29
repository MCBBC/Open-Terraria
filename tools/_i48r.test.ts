import { it } from 'vitest';
import { RNG } from '../src/core/rng';

it.skipIf(process.env.SW_I48R !== '1')('i48r bound mappings', () => {
  const a = new RNG(424242);
  const b = new RNG(424242);
  let diffs = 0;
  const ex: string[] = [];
  for (let i = 0; i < 10000; i++) {
    const va = a.nextIntRange(7, 25); // [7,24]
    const vb = b.nextIntRange(7, 26); // [7,25]
    if (va !== vb) {
      diffs++;
      if (ex.length < 5) ex.push(`#${i}: N7,25=${va} N7,26=${vb}`);
    }
  }
  console.log(`mismatches=${diffs}/10000`);
  console.log(ex.join(' | '));
});
