import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';

describe('debug sand friendly 2', () => {
  it('trace', () => {
    const w = new World(900, 600, 42, 'sandD2');
    w.groundLevel = 100; w.rockLevel = 200;
    const st = w.store;
    for (let x = 300; x < 560; x++) st.setTileSilent(x, 100, 3);
    for (let x = 470; x < 520; x++) st.setTileSilent(x, 100, 22);
    w.clock.timeOfDay = 12 / 24;
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    const counts: Record<string, number> = {};
    let lastX = -1;
    for (let k = 0; k < 60; k++) {
      const rng = new RNG(k * 7919 + 13);
      const r = sp.spawn(495 * 16 + 8, 96 * 16, rng, 24, 14);
      counts[r ? String((r as unknown as { vanillaId: number }).vanillaId) : 'null'] = (counts[r ? String((r as unknown as { vanillaId: number }).vanillaId) : 'null'] ?? 0) + 1;
      lastX = (sp as unknown as { spawnTileX: number }).spawnTileX;
    }
    console.log('counts', JSON.stringify(counts), 'lastX', lastX, 'tileAt', st.get(lastX, 100));
    expect(true).toBe(true);
  });
});
