import { it } from 'vitest';
import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';
it('seed flags', () => {
  const r = parseSeedChain('1.1.1.0.iamerror|106103');
  console.log('[flags]', JSON.stringify(r.flags));
  console.log('[hits]', JSON.stringify(r.hitTexts));
});
