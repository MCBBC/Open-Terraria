// 雪原出怪池回归（SpawnAnNPC 地表夜 L4555 冰系落脚段 + 昼基础史莱姆 + 地下 L4748）：
// 夜=161 冰冻僵尸(旧名爱斯基摩僵尸)主导；昼=147 冰史莱姆；地下冰/雪=147。
// （钉落脚格驱动——全链 e2e 见 live 探针 scripts/_snow-live-probe.mjs，已实证 161×833/147×302）
import { describe, it, expect } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

describe('雪原出怪池（L4555/L4435/L4748）', () => {
  const SNOW = TILE_BY_KEY['snow']!;
  const ICE = TILE_BY_KEY['ice']!;

  function roll(world: World, tileY: number, night: boolean, tile: number, n: number) {
    world.clock.timeOfDay = night ? 0.9 : 0.3;
    const spawner = new VanillaSpawner(world);
    const s = spawner as unknown as {
      spawnTileX: number; spawnTileY: number; spawnTileType: number;
      setFlagsForChosenTile: (x: number, y: number, t: number, rng: RNG) => void;
      spawnAnNPC: (rng: RNG) => { vanillaId?: number } | null;
      dayTime: boolean;
    };
    const ids = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const rng = new RNG(k * 7919 + 13);
      s.setFlagsForChosenTile(100, tileY, tile, rng);
      s.dayTime = !night;
      s.spawnTileX = 100; s.spawnTileY = tileY; s.spawnTileType = tile;
      const e = s.spawnAnNPC(rng);
      if (e?.vanillaId != null) ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
    }
    return ids;
  }

  it('雪面夜：161 冰冻僵尸主导（>60%），无 147', () => {
    const w = new World(400, 400, 42, 'snowN');
    w.groundLevel = 120; w.rockLevel = 200;
    const ids = roll(w, 100, true, SNOW, 400);
    const z = ids.get(161) ?? 0;
    expect(z).toBeGreaterThan(240);              // 诊断实测 334/400
    expect(ids.get(147) ?? 0).toBe(0);           // 冰史莱姆只在昼/地下
  });
  it('雪面昼：基础史莱姆 147', () => {
    const w = new World(400, 400, 42, 'snowD');
    w.groundLevel = 120; w.rockLevel = 200;
    const ids = roll(w, 100, false, SNOW, 200);
    expect(ids.get(147) ?? 0).toBeGreaterThan(150); // 诊断实测 400/400
  });
  it('地下冰：147 冰史莱姆为主', () => {
    const w = new World(400, 400, 42, 'snowU');
    w.groundLevel = 120; w.rockLevel = 200;
    const ids = roll(w, 160, true, ICE, 300);
    expect(ids.get(147) ?? 0).toBeGreaterThan(150); // 诊断实测 286/400
  });
});
