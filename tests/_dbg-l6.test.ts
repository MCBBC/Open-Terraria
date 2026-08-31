import { describe, it } from 'vitest';
import { World } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/World';
import { VanillaSpawner } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/spawn/VanillaSpawner';
import { RNG } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/core/rng';

describe('dbg', () => {
  it('pond distribution', () => {
    const w = new World(1300, 600, 42, 'dbg');
    w.groundLevel = 100; w.rockLevel = 200;
    const st = w.store;
    for (let x = 380; x < 920; x++) st.setTileSilent(x, 100, 3);
    for (let x = 594; x <= 606; x++) { st.setLiquid(x, 98, 255, 1); st.setLiquid(x, 99, 255, 1); }
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    const counts: Record<string, number> = {};
    let picked = 0;
    for (let k = 0; k < 300; k++) {
      const r = sp.spawn(600 * 16 + 8, 96 * 16, new RNG(k * 7919 + 13), 24, 14);
      const sx = (sp as unknown as { spawnTileX: number }).spawnTileX;
      if (sx >= 590 && sx <= 610) picked++;
      const key = r ? String(r.vanillaId) : ('null');
      counts[key] = (counts[key] ?? 0) + 1;
      console.error('attempt', k, 'tileX', sx, 'tileY', (sp as unknown as { spawnTileY: number }).spawnTileY,
        'waterTile', (sp as unknown as { waterTile: boolean }).waterTile,
        'result', key, 'type', (sp as unknown as { spawnTileType: number }).spawnTileType);
    }
    console.error('picked-in-pond', picked, JSON.stringify(counts));
  });
});
