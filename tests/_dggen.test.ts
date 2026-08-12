import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
const SEEDS = ['9293480', 'SandboxWorld', '999', 'test', '123456789'];
it('full gen timing per slot', async () => {
  for (const s of SEEDS) {
    let t0 = Date.now();
    const stamps: string[] = [];
    const world = await generateWorld({ width: 4200, height: 1200, seedText: s }, (label) => {
      const d = Date.now() - t0; t0 = Date.now();
      if (d > 1500) stamps.push(`${label}=${(d / 1000).toFixed(1)}s`);
    });
    console.log(`SEED ${s} TOTAL ${((Date.now() - t0) / 1000).toFixed(1)}s slow-slots=[${stamps.join(', ')}]`);
    void world;
  }
}, 600000);
