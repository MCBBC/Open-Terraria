// SW-BJ41 2026-09-09：以太（Aether/ZoneShimmer）判定链金标回归。
// 金标 = Terarria1457 SceneMetrics.cs（1458 同域逐行零变更，2026-09-09 核对）：
//   - 计数窗 ZoneScanSize = (1920/16+25·2−1, 1200/16+25·2−1) = (169,124)（:12-16），
//     CenteredRectangle(TileCenter, ·)（:356）→ X∈[cx−84,cx+84] / Y∈[cy−62,cy+61]
//   - 微光按【液体】计数：ScanTiles :367-373 只在 !active() 格计 _liquidCounts[liquidType()]，
//     ShimmerTileCount = _liquidCounts[3]（:601）＝LiquidID.Shimmer（本仓 +1 编码 =4）
//   - ShimmerTileThreshold = 300（:24）；EnoughTilesForShimmer = ≥300（:252）
//   - UndergroundForShimmering = worldSurface+84 < Y < maxTilesY−396（:711，严格不等）
//   - ZoneShimmer = EnoughTilesForShimmer && UndergroundForShimmering && !ZoneDungeon（:712）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { scanScene } from '../src/world/SceneMetrics';
import { LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

const DBRICK = TILE_BY_KEY['v_41_blue_brick']!;   // 原版 tile 41（DungeonTileCount 族）

/** groundLevel=120 / rockLevel=200 / h=800 空世界（同 scene-weather-zones 夹具）。
 *  深度带 = 204 < Y < 404（:711） */
function makeWorld(): World {
  const w = new World(400, 800, 42, 'bj41-aether');
  w.groundLevel = 120;
  w.rockLevel = 200;
  return w;
}

/** 在 (px,py) 判定窗内灌 n 格微光液：20 宽 × 深度行铺（窗内 X±84 / Y−62..Y+61） */
function pourShimmer(w: World, n: number, px = 200, py = 250, type = LIQUID_TYPE.SHIMMER): void {
  const st = w.store;
  let left = n;
  for (let y = py + 6; y < py + 62 && left > 0; y++) {
    for (let x = px - 10; x < px + 10 && left > 0; x++) {
      const i = st.idx(x, y);
      st.flags[i] = 0;              // 掏空保证 !active()（ScanTiles :367-373 计数前提）
      st.liquid[i] = 255;
      st.liquidType[i] = type;
      left--;
    }
  }
}

describe('SW-BJ41 微光计数窗（SceneMetrics.cs:12-16/:356 169×124 CenteredRectangle）', () => {
  it('窗界内 299+1 格：第 300 格（窗内）补足即置位', () => {
    const w = makeWorld();
    pourShimmer(w, 299);
    const s299 = scanScene(w, 200 * 16, 250 * 16, 0);
    expect(s299.shimmerTileCount).toBe(299);
    expect(s299.zoneShimmer).toBe(false);
    // 第 300 格放窗内 x=px+10（仍在 ±84 窗内）
    const st = w.store;
    const i = st.idx(211, 256);
    st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.SHIMMER;
    const s300 = scanScene(w, 200 * 16, 250 * 16, 0);
    expect(s300.shimmerTileCount).toBe(300);
    expect(s300.zoneShimmer).toBe(true);
  });

  it('窗外格不计数：X=px−85（窗左界外）/ Y=py+62（窗下界排他）', () => {
    const w = makeWorld();
    pourShimmer(w, 299);
    const st = w.store;
    // X 侧：CenteredRectangle 左界 = cx−84 → cx−85 在窗外
    let i = st.idx(200 - 85, 256);
    st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.SHIMMER;
    // Y 侧：Bottom 排他 = cy+62 → cy+62 在窗外
    i = st.idx(200, 250 + 62);
    st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.SHIMMER;
    const s = scanScene(w, 200 * 16, 250 * 16, 0);
    expect(s.shimmerTileCount).toBe(299);
    expect(s.zoneShimmer).toBe(false);
    // 对照：同两格放进窗内（x=cx−84 / y=cy+61）即计数 +2
    i = st.idx(200 - 84, 256);
    st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.SHIMMER;
    i = st.idx(200, 250 + 61);
    st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.SHIMMER;
    const s2 = scanScene(w, 200 * 16, 250 * 16, 0);
    expect(s2.shimmerTileCount).toBe(301);
    expect(s2.zoneShimmer).toBe(true);
  });
});

describe('SW-BJ41 微光液体计数口径（ScanTiles :367-373 只计 !active() 格的微光液）', () => {
  it('实心格上的液体不计数（active 格走 _tileCounts 不走 _liquidCounts）', () => {
    const w = makeWorld();
    pourShimmer(w, 299);
    const st = w.store;
    // 第 300 格：液在但 active 位=1 → 不计
    const i = st.idx(211, 256);
    st.flags[i] = 1; st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.SHIMMER;
    const s = scanScene(w, 200 * 16, 250 * 16, 0);
    expect(s.shimmerTileCount).toBe(299);
  });

  it('非微光液体（水/蜂蜜）不计数', () => {
    const w = makeWorld();
    pourShimmer(w, 299);
    const st = w.store;
    for (const t of [LIQUID_TYPE.WATER, LIQUID_TYPE.HONEY]) {
      const i = st.idx(211, 256);
      st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = t;
      expect(scanScene(w, 200 * 16, 250 * 16, 0).shimmerTileCount).toBe(299);
    }
  });
});

describe('SW-BJ41 深度带 UndergroundForShimmering（SceneMetrics.cs:711 严格不等）', () => {
  it('上界：Y > worldSurface+84 才成立——Y=204 假 / Y=205 真', () => {
    const w = makeWorld();
    // 液池随扫描中心灌（窗 Y±62 内 20×16=320 格）
    for (const cy of [204, 205]) pourShimmer(w, 320, 200, cy);
    expect(scanScene(w, 200 * 16, 204 * 16, 0).undergroundForShimmering).toBe(false);
    expect(scanScene(w, 200 * 16, 204 * 16, 0).zoneShimmer).toBe(false);
    expect(scanScene(w, 200 * 16, 205 * 16, 0).undergroundForShimmering).toBe(true);
    expect(scanScene(w, 200 * 16, 205 * 16, 0).zoneShimmer).toBe(true);
  });

  it('下界：Y < maxTilesY−396 才成立——Y=404 假 / Y=403 真', () => {
    const w = makeWorld();
    for (const cy of [403, 404]) pourShimmer(w, 320, 200, cy);
    expect(scanScene(w, 200 * 16, 404 * 16, 0).undergroundForShimmering).toBe(false);
    expect(scanScene(w, 200 * 16, 404 * 16, 0).zoneShimmer).toBe(false);
    expect(scanScene(w, 200 * 16, 403 * 16, 0).undergroundForShimmering).toBe(true);
    expect(scanScene(w, 200 * 16, 403 * 16, 0).zoneShimmer).toBe(true);
  });

  it('地狱带内（Y≥maxTilesY−200）无以太（:711 下的推论,与 ZoneUnderworldHeight 正交）', () => {
    const w = makeWorld();
    pourShimmer(w, 320, 200, 620);
    expect(scanScene(w, 200 * 16, 620 * 16, 0).zoneShimmer).toBe(false);
  });
});

describe('SW-BJ41 ZoneShimmer 三条件合取（SceneMetrics.cs:712）', () => {
  it('ZoneDungeon 成立时压制 ZoneShimmer（&& !ZoneDungeon 腿）', () => {
    const w = makeWorld();
    pourShimmer(w, 320);
    const st = w.store;
    // 玩家中心格地牢墙 7（:692 wallDungeon）+ 窗内地牢砖 ≥250（DungeonTileThreshold）
    st.setWall(200, 250, 7);
    let n = 0;
    for (let y = 190; y < 200 && n < 250; y++) {
      for (let x = 120; x < 280 && n < 250; x++, n++) st.setTileSilent(x, y, DBRICK);
    }
    const s = scanScene(w, 200 * 16, 250 * 16, 0);
    expect(s.zoneDungeon).toBe(true);
    expect(s.shimmerTileCount).toBeGreaterThanOrEqual(300);
    expect(s.zoneShimmer).toBe(false);
  });

  it('阈值矩阵：299 假 / 300 真 / 301 真（EnoughTilesForShimmer ≥300,:252）', () => {
    for (const [n, want] of [[299, false], [300, true], [301, true]] as const) {
      const w = makeWorld();
      pourShimmer(w, n);
      const s = scanScene(w, 200 * 16, 250 * 16, 0);
      expect(s.shimmerTileCount, `n=${n}`).toBe(n);
      expect(s.zoneShimmer, `n=${n}`).toBe(want);
    }
  });
});
