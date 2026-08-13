// 雪原出怪 e2e：真实生成世界 + 全链 spawn()（findSpawnTile→SpawnAnNPC）
import { describe, it } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/core/constants';

describe('雪原 e2e', () => {
  it('真实世界雪面夜间全链', async () => {
    const w = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', name: 'snowE2E' });
    const st = w.store;
    const SNOW = TILE_BY_KEY['snow']!;
    // 找雪原带：地表(groundLevel 上下)成片 SNOW 的列
    let foundX = -1, foundY = -1;
    outer: for (let x = 60; x < st.w - 60; x += 40) {
      for (let y = Math.max(4, w.groundLevel - 30); y < w.groundLevel + 10; y++) {
        if (st.type[st.idx(x, y)] === SNOW && st.isSolid(x, y)) {
          // 确认上方净空
          if (!st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) { foundX = x; foundY = y; break outer; }
        }
      }
    }
    console.log('snow surface:', foundX, foundY, 'groundLevel', w.groundLevel);
    if (foundX < 0) { console.log('NO SNOW SURFACE FOUND — 世界侧问题'); return; }
    // 玩家站雪面上（脚底=foundY+1 的上表面）
    const pcx = foundX * TILE + 8, pcy = (foundY - 1) * TILE + 8;
    w.clock.timeOfDay = 0.9;
    const spawner = new VanillaSpawner(w);
    const ids = new Map<number, number>();
    let nulls = 0;
    for (let k = 0; k < 3000; k++) {
      const e = spawner.spawn(pcx, pcy, new RNG(k * 7919 + 13), 43, 27);
      if (!e || e.vanillaId == null) { nulls++; continue; }
      ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
    }
    console.log('e2e night tally:', [...ids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12), 'nulls:', nulls);
    const s = spawner as unknown as { ZoneSnow: boolean; zoneCounts: Record<string, number> };
    console.log('ZoneSnow flag after run:', s.ZoneSnow, 'zoneCounts:', s.zoneCounts);
  }, 300000);
});
