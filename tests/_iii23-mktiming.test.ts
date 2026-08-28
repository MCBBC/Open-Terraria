// 一次性计时探针：定位 iiiiii22b 全量运行的挂点（跑完即删）
import { describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

describe('III23 timing', () => {
  it('setTileSilent throughput', () => {
    const W = 1200, H = 1300;
    const st = new TileStore(W, H);
    const dirt = TILE_BY_KEY['dirt'];
    const t0 = performance.now();
    let n = 0;
    for (let x = 0; x < W; x++) {
      for (let y = 550; y < H - 5; y++) { st.setTileSilent(x, y, dirt); n++; }
    }
    const t1 = performance.now();
    expect(n).toBeGreaterThan(0);
    // 输出耗时（断言恒真）
    expect((t1 - t0)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('SHEET_LUT build', () => {
    const t0 = performance.now();
    let c = 0;
    for (let t = 0; t < TILE_DEFS.length; t++) if ((TILE_DEFS[t]?.vanilla?.sheet ?? -1) >= 0) c++;
    const t1 = performance.now();
    expect(c).toBeGreaterThan(700);
    expect(t1 - t0).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
