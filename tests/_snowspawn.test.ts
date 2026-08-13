// 雪原出怪诊断②：钉落脚格 + setFlagsForChosenTile（surfaceSpawn 正确置位）
import { describe, it } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

describe('雪原出怪诊断②', () => {
  const SNOW = TILE_BY_KEY['snow']!;
  const ICE = TILE_BY_KEY['ice']!;

  function rollPool(world: World, tileY: number, night: boolean, tile: number, n: number) {
    world.clock.timeOfDay = night ? 0.9 : 0.3;
    const spawner = new VanillaSpawner(world);
    const s = spawner as unknown as {
      spawnTileX: number; spawnTileY: number; spawnTileType: number;
      setFlagsForChosenTile: (x: number, y: number, t: number, rng: RNG) => void;
      spawnAnNPC: (rng: RNG) => { vanillaId?: number } | null;
      dayTime: boolean;
    };
    s.dayTime = !night;
    const ids = new Map<number, number>();
    let nullCount = 0;
    for (let k = 0; k < n; k++) {
      const rng = new RNG(k * 7919 + 13);
      s.setFlagsForChosenTile(100, tileY, tile, rng);
      s.spawnTileX = 100; s.spawnTileY = tileY; s.spawnTileType = tile;
      const e = s.spawnAnNPC(rng);
      if (!e || e.vanillaId == null) { nullCount++; continue; }
      ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
    }
    return { ids, nullCount };
  }

  it('雪面夜池', () => {
    const w = new World(400, 400, 42, 'sn1');
    w.groundLevel = 120; w.rockLevel = 200;
    const { ids, nullCount } = rollPool(w, 100, true, SNOW, 400);
    console.log('NIGHT surface snow:', [...ids.entries()].sort((a, b) => b[1] - a[1]), 'null:', nullCount);
  });
  it('雪面昼池', () => {
    const w = new World(400, 400, 42, 'sn2');
    w.groundLevel = 120; w.rockLevel = 200;
    const { ids, nullCount } = rollPool(w, 100, false, SNOW, 400);
    console.log('DAY surface snow:', [...ids.entries()].sort((a, b) => b[1] - a[1]), 'null:', nullCount);
  });
  it('地下冰 150 层', () => {
    const w = new World(400, 400, 42, 'sn3');
    w.groundLevel = 120; w.rockLevel = 200;
    const { ids, nullCount } = rollPool(w, 150, true, ICE, 400);
    console.log('NIGHT ug ice y150:', [...ids.entries()].sort((a, b) => b[1] - a[1]), 'null:', nullCount);
  });
});
