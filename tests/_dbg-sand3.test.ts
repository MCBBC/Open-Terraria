import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('debug sand 3', () => {
  it('trace', () => {
    const w = new World(900, 600, 42, 'sandD3');
    w.groundLevel = 100; w.rockLevel = 200;
    const st = w.store;
    for (let x = 300; x < 560; x++) st.setTileSilent(x, 100, 3);
    for (let x = 470; x < 520; x++) st.setTileSilent(x, 100, 22);
    w.clock.timeOfDay = 12 / 24;
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    console.log('T.SAND id =', TILE_BY_KEY['sand'], 'T.GRASS =', TILE_BY_KEY['grass']);
    const r = sp.spawn(495 * 16 + 8, 96 * 16, new RNG(13), 24, 14);
    const sx = (sp as unknown as { spawnTileX: number }).spawnTileX;
    const sy = (sp as unknown as { spawnTileY: number }).spawnTileY;
    console.log('picked', r ? (r as unknown as { vanillaId: number }).vanillaId : null,
      'spawnTile', sx, sy, 'type', st.get(sx, sy));
    expect(true).toBe(true);
  });
});
