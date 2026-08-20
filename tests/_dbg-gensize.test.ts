import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
it('normal small world baseline', async () => {
  const t0 = Date.now();
  const w = await generateWorld({ width: 1300, height: 400, seedText: '9293480', evil: 0 });
  console.log('NORMAL_GEN_SECONDS', ((Date.now() - t0) / 1000).toFixed(1));
}, 100000);
