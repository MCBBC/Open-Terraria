import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
it('pipe ash', async () => {
  await generateWorld({ width: 4200, height: 1200, seedText: 'registry-clear-1' });
}, 900000);
