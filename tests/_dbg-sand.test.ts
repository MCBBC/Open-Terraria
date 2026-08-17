import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';

describe('debug sand friendly', () => {
  it('trace', () => {
    const w = new World(900, 600, 42, 'sandD');
    w.groundLevel = 100; w.rockLevel = 200;
    const st = w.store;
    for (let x = 300; x < 560; x++) st.setTileSilent(x, 100, 3);
    for (let x = 560; x < 640; x++) st.setTileSilent(x, 100, 22);
    w.clock.timeOfDay = 12 / 24;
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    const counts: Record<string, number> = {};
    let lastX = -1, lastY = -1, lastT = -1;
    for (let k = 0; k < 100; k++) {
      const rng = new RNG(k * 7919 + 13);
      const r = sp.spawn(600 * 16 + 8, 96 * 16, rng, 24, 14);
      const key = r ? String((r as unknown as { vanillaId: number }).vanillaId) : 'null';
      counts[key] = (counts[key] ?? 0) + 1;
      lastX = (sp as unknown as { spawnTileX: number }).spawnTileX;
      lastY = (sp as unknown as { spawnTileY: number }).spawnTileY;
    }
    lastT = st.get(lastX, lastY);
    console.log('counts', JSON.stringify(counts), 'lastSpawnTile', lastX, lastY, 'tile', lastT);
    expect(true).toBe(true);
  });
});
