// fx54 巨型龙蛋（tile 752 / item 6142,PalworldChilletEgg）生成金标
//
// 机制锚（Terarria1457 亲读）：DyePlants pass（WorldGen.cs:20126 体内尾奏
//   cs:20155 PlaceChilletEggs）→ TryPlacingChilletEgg（cs:46099）：5 次 ±10 微调、
//   地面门 HasValidGroundForChilletEggBelowSpot（cs:46124 白名单 0/70/633/59/225
//   ∪Conversion.Grass∪Conversion.Stone∪tileMoss + SolidTileAllowBottomSlope，
//   与 HasValidGroundForGlowTulipBelowSpot cs:73686 逐字同文）→ PlaceTile→
//   Place2x2（cs:51780 双列地面 nactive&&(SolidTile2||tileTable)+2×2 净空）；
//   NoNearbyChilletEggs（cs:46079）±20 方框（41×41 间距）；掷域 x∈[100,maxX-100]、
//   y∈[rockLayer,maxY-200]（remix −350,cs:46068）；目标数 GetWorldSize()=
//   0→6/1→9/2→12（cs:46055-46064），尝试上限 10000（cs:46066）。
// 已知合法欠额：蛋在染料植物槽落位后，仍会被后续【原版同款】直写结构覆压——
//   微群系 MiningExplosivesBiome 的 ShapeRunner SetTile 矿石地板 + Circle(5)
//   ClearTile 挖房（MicroBiomesPass MiningExplosives 段）等为原版 WorldUtils
//   直写语义（无多格物感知,不留 KillTile 链），vanilla 同样会压掉蛋 ⇒ 最终数
//   低于目标属原版行为，不是漏生成（fx54 全链取证：placed=target 达标、后被
//   微群系炸药屋压掉 1 颗；探针见 git 记录）。
// 发现性：蛋在原版 Main.tileSpelunker 表内（Main.cs:9606）⇒ 洞穴探险增益可高亮、
//   金属探测器可测（tileOreFinderPriority 752=770,Main.cs:6355 段）——渲染侧
//   HIGHLIGHT_SETS.spelunker 已换原版全表（Renderer.ts TILE_SPELUNKER_SHEETS）。
import { describe, it, expect } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { loadFixtureWorld } from './world-fixtures';
import { generateWorld } from '../src/world/gen/WorldGen';
import type { TileStore } from '../src/world/TileStore';

/** 收集世界中全部 2×2 完整蛋锚（右下角格坐标；四格 active 且 sheet=752） */
function eggAnchors(st: TileStore): Array<{ x: number; y: number }> {
  const isEgg = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return (st.flags[i] & 1) !== 0 && TILE_DEFS[st.type[i]]?.vanilla?.sheet === 752;
  };
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < st.h; y++) {
    for (let x = 1; x < st.w; x++) {
      if (isEgg(x, y) && isEgg(x - 1, y) && isEgg(x, y - 1) && isEgg(x - 1, y - 1)) out.push({ x, y });
    }
  }
  return out;
}

describe('fx54 巨型龙蛋生成金标', () => {
  it('档案快照：固定种子最终蛋数（fixture 静态钉值）', () => {
    // 小世界(4200×1200, seed 9293480)=5；中世界(6400×1800, 同种子)=7；
    // remix(dontdigup)=6——均为生成端当拍快照（欠额=微群系直写压蛋,原版同款语义）。
    expect(eggAnchors(loadFixtureWorld('small').store)).toHaveLength(5);
    expect(eggAnchors(loadFixtureWorld('medium').store)).toHaveLength(7);
    expect(eggAnchors(loadFixtureWorld('iii6-remix').store)).toHaveLength(6);
  });

  it('全链生成活性守卫：新鲜小世界蛋数 4..6（不低于原版压蛋后地板,不超目标 6）', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const anchors = eggAnchors(world.store);
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    expect(anchors.length).toBeLessThanOrEqual(6);
  }, 600_000);

  it('间距/掷域约束：41×41 间距 + 洞穴层深度带（cs:46055-46080）', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const anchors = eggAnchors(world.store);
    expect(anchors.length).toBeGreaterThan(0);
    const rockLevel = Math.floor(world.rockLevel);
    for (const a of anchors) {
      // 锚(右下)纵域：y∈[rockLayer, maxY-200)（y 为蛋底行,y-1 为顶行）
      expect(a.y).toBeGreaterThanOrEqual(rockLevel);
      expect(a.y).toBeLessThan(world.h - 200);
      // 侧边距 100（x∈[100,maxX-100],蛋占 x-1..x）
      expect(a.x).toBeGreaterThanOrEqual(100);
      expect(a.x).toBeLessThanOrEqual(world.w - 100);
    }
    // NoNearbyChilletEggs：任两锚切比雪夫距离 ≥ 21（±20 方框互斥）
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const cheb = Math.max(Math.abs(anchors[i].x - anchors[j].x), Math.abs(anchors[i].y - anchors[j].y));
        expect(cheb).toBeGreaterThanOrEqual(21);
      }
    }
  }, 600_000);
});
