// ★spawn 画面外判定统计(2026-09-07 用户报「怪物在画面里生成」):
// findSpawnTile 的 safeArea(1.04×半屏)门——500 次采样的落点分布验证。
// 画面内(|dx|<vw && |dy|<vh)必须=0;1.0~1.04 带=贴边(原版常数,登记)。
import { describe, it, expect } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { RNG } from '../src/core/rng';

const W = 400, H = 300, GROUND = 120;
function mkWorld(): World {
  const st = new TileStore(W, H);
  st.onTileChanged = () => {};
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y < H; y++) st.setTileSilent(x, y, 1);   // 石地
  }
  const world = { store: st, w: W, h: H, groundLevel: GROUND - 20, rockLevel: GROUND + 40,
    seedFlags: {}, flags: {} } as unknown as World;
  void world.w; void world.h;
  return world;
}

describe('findSpawnTile safeArea 统计', () => {
  it('500 次采样:落点全部在画面外(|dx|≥vw 或 |dy|≥vh)', () => {
    const world = mkWorld();
    const sp = new VanillaSpawner(world);
    (sp as unknown as { pX: number; pY: number }).pX = 200;
    (sp as unknown as { pY: number }).pY = GROUND - 3;
    const vw = 38, vh = 22;   // 典型半屏格数(1512×862@zoom1.25)
    const rng = new RNG(12345);
    let inView = 0, total = 0, edge = 0;
    for (let k = 0; k < 500; k++) {
      (sp as unknown as { scopeNum3: number }).scopeNum3 = 0;
      (sp as unknown as { ignoreSafeWalls: boolean }).ignoreSafeWalls = false;
      (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = false;
      const ok = (sp as unknown as { findSpawnTile: (r: RNG, a: number, b: number) => boolean })
        .findSpawnTile(rng, vw, vh);
      if (!ok) continue;
      const st = world.store;
      const dx = Math.abs((sp as unknown as { spawnTileX: number }).spawnTileX - 200);
      const dy = Math.abs((sp as unknown as { spawnTileY: number }).spawnTileY - (GROUND - 3));
      total++;
      if (dx < vw && dy < vh) inView++;
      if (dx >= vw * 1.0 && dx < vw * 1.04 || dy >= vh * 1.0 && dy < vh * 1.04) edge++;
    }
    expect(total).toBeGreaterThan(100);   // 采样有效性
    expect(inView).toBe(0);               // 画面内=0
    console.log(`[spawn-safe] total=${total} 画面内=${inView} 贴边带(1.0~1.04)=${edge} (${(edge / total * 100).toFixed(1)}%)`);
  });
});
