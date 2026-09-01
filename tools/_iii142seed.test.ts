import { it } from 'vitest';
import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';
it('parse', () => {
  const r = parseSeedChain('1.1.1.0.thecarebearsmovie|106102');
  console.log(JSON.stringify(r));
});
