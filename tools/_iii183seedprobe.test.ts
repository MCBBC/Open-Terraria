import { it } from 'vitest';
import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';
it('seed probe', () => {
  const r = parseSeedChain('1.1.1.0.iamerror|106103');
  console.log('[iii183] flags =', JSON.stringify(r.flags), 'hits =', JSON.stringify(r.hitTexts));
  console.log('[iii183] errorWorld =', r.flags.errorWorld, 'noSurface =', r.flags.noSurface);
});
