// SceneMetrics 天气/微光三件套回归（对照 Terarria1456 SceneMetrics.cs:695-708）：
//  SurfaceAtmospherics = WorldGen.IsSurfaceForAtmospherics（WorldGen.cs:10991-11001）
//  ZoneRain = Main.raining && SurfaceAtmospherics（:700），ZoneSandstorm 成立时置 false（:703-705）
//  ZoneSandstorm = ZoneDesert && SurfaceAtmospherics && Sandstorm.Happening（:701）
//  ZoneShimmer = EnoughTilesForShimmer(≥300) && UndergroundForShimmering(:706) && !ZoneDungeon（:707）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { scanScene } from '../src/world/SceneMetrics';
import { LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

const SAND = TILE_BY_KEY['sand']!;   // 原版 tile 53（SAND_TILES 计数族）

/** groundLevel=120 / rockLevel=200 / h=800 的空世界（默认晴、无沙暴） */
function makeWorld(): World {
  const w = new World(400, 800, 42, 'zone-rain');
  w.groundLevel = 120;
  w.rockLevel = 200;
  return w;
}

/** 在扫描窗内灌 n 格微光液（非实心格才计数，ScanTiles cs:361-366） */
function pourShimmer(w: World, n: number): void {
  const st = w.store;
  let left = n;
  for (let y = 290; y < 330 && left > 0; y++) {
    for (let x = 100; x < 160 && left > 0; x++) {
      const i = st.idx(x, y);
      st.flags[i] = 0;              // 掏空保证 !active()
      st.liquid[i] = 255;
      st.liquidType[i] = LIQUID_TYPE.SHIMMER;
      left--;
    }
  }
}

describe('SurfaceAtmospherics（WorldGen.cs:10991-11001，普通世界 y ≤ worldSurface）', () => {
  it('地表及以上 true，地下 false', () => {
    const w = makeWorld();
    expect(scanScene(w, 200 * 16, 100 * 16, 0).surfaceAtmospherics).toBe(true);   // y=100 < 120
    expect(scanScene(w, 200 * 16, 120 * 16, 0).surfaceAtmospherics).toBe(true);   // 恰 worldSurface 含
    expect(scanScene(w, 200 * 16, 121 * 16, 0).surfaceAtmospherics).toBe(false);  // y=121 > 120
  });
});

describe('ZoneRain（SceneMetrics.cs:700-705 = raining && SurfaceAtmospherics）', () => {
  it('雨天 + 地表 → true；雨天 + 地下 → false；晴天 → false', () => {
    const w = makeWorld();
    w.weather.raining = true;
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneRain).toBe(true);
    expect(scanScene(w, 200 * 16, 130 * 16, 0).zoneRain).toBe(false);   // 深度门：地下无雨
    w.weather.raining = false;
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneRain).toBe(false);
  });

  it('ZoneSandstorm（:701）成立时 ZoneRain 强制 false（:703-705）', () => {
    // 宽世界（2000）：沙滩带 x<380 / x>1620——沙放 x 600-650 不落 oceanSand 扣减
    //（SceneMetrics L376-380：isDesertBiomeSand && oceanDepths 才计海洋沙）
    const w = new World(2000, 800, 42, 'zone-rain');
    w.groundLevel = 120;
    w.rockLevel = 200;
    const st = w.store;
    for (let y = 90; y < 130; y++) {
      for (let x = 600; x < 650; x++) st.setTileSilent(x, y, SAND);   // 2000 沙格 ≥ 1500
    }
    w.weather.raining = true;
    w.weather.sandstorm.happening = true;
    const s = scanScene(w, 625 * 16, 100 * 16, 0);
    expect(s.zoneDesert).toBe(true);
    expect(s.zoneSandstorm).toBe(true);
    expect(s.zoneRain).toBe(false);
    // 沙暴停 → ZoneRain 恢复
    w.weather.sandstorm.happening = false;
    expect(scanScene(w, 625 * 16, 100 * 16, 0).zoneRain).toBe(true);
    // 非沙漠玩家同场沙暴 → zoneSandstorm false、ZoneRain 正常
    w.weather.sandstorm.happening = true;
    const far = scanScene(w, 1200 * 16, 100 * 16, 0);
    expect(far.zoneDesert).toBe(false);
    expect(far.zoneSandstorm).toBe(false);
    expect(far.zoneRain).toBe(true);
  });
});

describe('ZoneShimmer（SceneMetrics.cs:706-707）', () => {
  it('≥300 微光液格 + 深度带内 → true；液量不足 → false', () => {
    const w = makeWorld();
    pourShimmer(w, 320);
    // y=300：groundLevel+84=204 < 300 < h-396=404 → 深度带内
    const s = scanScene(w, 130 * 16, 300 * 16, 0);
    expect(s.shimmerTileCount).toBe(320);
    expect(s.undergroundForShimmering).toBe(true);
    expect(s.zoneShimmer).toBe(true);
    // 液量不足 300（EnoughTilesForShimmer :252）
    const w2 = makeWorld();
    pourShimmer(w2, 299);
    const s2 = scanScene(w2, 130 * 16, 300 * 16, 0);
    expect(s2.shimmerTileCount).toBe(299);
    expect(s2.zoneShimmer).toBe(false);
  });

  it('深度带外（worldSurface+84 ≤ y 不满足）→ UndergroundForShimmering false', () => {
    const w = makeWorld();
    pourShimmer(w, 320);
    // y=130：130 > 120+84=204 不成立 → 带外
    const s = scanScene(w, 130 * 16, 130 * 16, 0);
    expect(s.undergroundForShimmering).toBe(false);
    expect(s.zoneShimmer).toBe(false);
  });
});
