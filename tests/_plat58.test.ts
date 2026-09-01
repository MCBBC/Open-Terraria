import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';

const LOG = '/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T09-22-21-139Z.json';
describe('plat58', () => {
  it('isSolid真值核查', () => {
    const j = JSON.parse(readFileSync(LOG, 'utf8'));
    const st = new TileStore(4000, 1200);
    for (const [k, v] of Object.entries(j.meta.terrain.cells)) {
      const [x, y] = k.split(',').map(Number);
      const i = st.idx(x, y);
      st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
      if (v[3]) st.flags[i] |= 64;
    }
    console.log('isSolid @铅柱列:');
    for (const y of [278, 279, 280, 281, 282]) {
      console.log(`  (3174,${y}) type=${st.type[st.idx(3174,y)]} solid=${st.isSolid(3174,y)} active=${st.isActive(3174,y)} slope=${st.slope[st.idx(3174,y)]}`);
    }
    console.log('isPlatform @链:');
    for (const [x, y] of [[3172,275],[3173,276],[3174,277],[3175,278],[3176,279],[3177,280],[3178,281]] as const) {
      console.log(`  (${x},${y}) plat=${st.isPlatform(x,y)} slope=${st.slope[st.idx(x,y)]} solid=${st.isSolid(x,y)}`);
    }
  });
});
