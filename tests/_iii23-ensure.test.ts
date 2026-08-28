// 一次性：ensureExtraSpawnPoints 计时（跑完即删）
import { describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ensureExtraSpawnPoints, PLAYER_TEAM_COUNT } from '../src/world/spawn/ExtraSpawnsRoyale';

describe('III23 ensure', () => {
  it('single compute timing', () => {
    const W = 1200, H = 900;
    const st = new TileStore(W, H);
    const w = new World(W, H, 424242, 't');
    w.store = st; w.groundLevel = 520; w.spawnX = 600; w.spawnY = 560;
    w.seedFlags = { teamBasedSpawns: true } as typeof w.seedFlags;
    const dirt = TILE_BY_KEY['dirt'];
    for (let x = 0; x < W; x++) for (let y = 550; y < H - 5; y++) st.setTileSilent(x, y, dirt);
    const t0 = performance.now();
    const pts = ensureExtraSpawnPoints(w);
    const t1 = performance.now();
    expect(pts.length).toBe(PLAYER_TEAM_COUNT);
    expect(t1 - t0).toBeLessThan(Number.MAX_SAFE_INTEGER);   // 真断言占位
  });
});
