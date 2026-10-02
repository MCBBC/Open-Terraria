// 仙灵宝箱引导链（NPC.cs AI_112 :48602-48960 + GetFairyTreasureCoords NPC.cs:49236-49295）
// 状态 2 玩家引导 → 3 绕宝圆舞 → 4 带路 → 5 终演 FairyEffects / 6 无宝重试 / 7 离场
import { describe, expect, it } from 'vitest';
import { fairyTreasureCoords, fairyTreasureValidAt, FAIRY_ORE_VEIN_SHEETS } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE_BY_KEY, ORE_SHEETS, FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS } from '../src/data/tiles';

const w = new World(200, 120, 11, 'fairy');
// 放一个金宝箱（sheet 21）在 (100, 60)
const CHEST = TILE_BY_KEY['chest']!;

describe('GetFairyTreasureCoords（NPC.cs:48794-48852）', () => {
  it('窗口内金宝箱命中；窗口外无宝 → null', () => {
    w.store.setTileSilent(100, 60, CHEST, 0, 0);
    // 中心 (100,60) ±75×±50 → 覆盖
    expect(fairyTreasureCoords(w.store, 100 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
    // 远处无窗
    expect(fairyTreasureCoords(w.store, 190 * 16, 60 * 16)).toBeNull();
    expect(fairyTreasureCoords(w.store, 10 * 16, 60 * 16)).toBeNull();
  });

  it('227 生命果仅 frameX 272-374 有效（SceneMetrics.IsValidForOreFinder）', () => {
    const fruit = TILE_BY_KEY['v_227_dye_plants']!;
    w.store.setTileSilent(100, 60, fruit, 300, 0);
    expect(fairyTreasureCoords(w.store, 100 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
    w.store.setTileSilent(100, 60, fruit, 100, 0);
    expect(fairyTreasureCoords(w.store, 100 * 16 + 8, 60 * 16 + 8)).toBeNull();
  });

  it('fairyTreasureValidAt：目标被挖 → 失效（状态 5 提前终演门）', () => {
    w.store.setTileSilent(100, 60, CHEST, 0, 0);
    expect(fairyTreasureValidAt(w.store, 100, 60)).toBe(true);
    w.store.setTileSilent(100, 60, 0, 0, 0);
    expect(fairyTreasureValidAt(w.store, 100, 60)).toBe(false);
  });
});

// ===================== Z3：矿脉门（NPC.cs:49258-49278）+ 优先级表 236/702=810（Main.cs:6570-6571） =====================
// 每例独立空世界（构造器不跑 worldgen,store 全空气）——零跨例污染
const GOLD = TILE_BY_KEY['ore_gold']!;            // sheet 8（lure∩Ore,矿脉门适用）
const FRUIT = TILE_BY_KEY['v_236_life_fruit_plant']!;      // sheet 236=810 全表最高
const REPLICA = TILE_BY_KEY['v_702_life_fruit_replica']!;  // sheet 702=810
const HERB = TILE_BY_KEY['v_227_dye_plants']!;    // sheet 227=750（旧表最高）

function fairyWorld(seed: number) {
  return new World(200, 120, seed, 'z3-fairy');
}

describe('Z3 矿脉门（±3×±3 同类计数<40 → 剔除,NPC.cs:49258-49278）', () => {
  it('单块金矿不引路（vein=1<40 → num4=−1,全候选剔除 → null）', () => {
    const w2 = fairyWorld(21);
    w2.store.setTileSilent(100, 60, GOLD, 0, 0);
    expect(fairyTreasureCoords(w2.store, 100 * 16 + 8, 60 * 16 + 8)).toBeNull();
  });

  it('单块金矿+宝箱 → 引到宝箱（剔除是移出候选,非中断搜索）', () => {
    const w2 = fairyWorld(22);
    w2.store.setTileSilent(100, 60, GOLD, 0, 0);
    w2.store.setTileSilent(140, 60, CHEST, 0, 0);   // 同窗内（x≤159 钳）
    expect(fairyTreasureCoords(w2.store, 100 * 16 + 8, 60 * 16 + 8)).toEqual([140, 60]);
  });

  it('7×7 金矿脉（中心窗 49≥40）→ 引路,同优先取最近=仙灵脚下格', () => {
    const w2 = fairyWorld(23);
    for (let i = 97; i <= 103; i++)
      for (let j = 57; j <= 63; j++) w2.store.setTileSilent(i, j, GOLD, 0, 0);
    expect(fairyTreasureCoords(w2.store, 100 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
  });

  it('阈值边界：窗内恰 40 同类 → 有效;再挖 1 格（39）→ 该格失格', () => {
    const w2 = fairyWorld(24);
    for (let i = 57; i <= 63; i++)
      for (let j = 57; j <= 63; j++) w2.store.setTileSilent(i, j, GOLD, 0, 0);
    // 顶行 7 格+次行左 2 格清空 → 中心窗 49−9=40（num8<40 为假 → 有效）
    for (let i = 57; i <= 63; i++) w2.store.setTileSilent(i, 57, 0, 0, 0);
    w2.store.setTileSilent(57, 58, 0, 0, 0);
    w2.store.setTileSilent(58, 58, 0, 0, 0);
    expect(fairyTreasureCoords(w2.store, 60 * 16 + 8, 60 * 16 + 8)).toEqual([60, 60]);
    // 再清 1 格 → 中心窗 39 → 中心失格（其余格是否候选不影响本断言）
    w2.store.setTileSilent(59, 58, 0, 0, 0);
    expect(fairyTreasureCoords(w2.store, 60 * 16 + 8, 60 * 16 + 8)).not.toEqual([60, 60]);
  });

  it('5×8 整块金矿（总 40 但任一 ±3×±3 窗≤35）→ null（逐窗计数非脉总量）', () => {
    const w2 = fairyWorld(25);
    for (let i = 96; i <= 100; i++)
      for (let j = 56; j <= 63; j++) w2.store.setTileSilent(i, j, GOLD, 0, 0);
    expect(fairyTreasureCoords(w2.store, 98 * 16 + 8, 59 * 16 + 8)).toBeNull();
  });
});

describe('Z3 优先级表 236/702=810（Main.cs:6570-6571,全表最高）', () => {
  it('矿脉门矿种推导锁：FAIRY_ORE_VEIN_SHEETS ≡ TileID.Sets.Ore ∩ FriendlyFairyCanLureTo', () => {
    const inter = [...ORE_SHEETS].filter(s => FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS.has(s)).sort((a, b) => a - b);
    expect([...FAIRY_ORE_VEIN_SHEETS].sort((a, b) => a - b)).toEqual(inter);
    expect(inter).toEqual([8, 107, 108, 111, 169, 211, 221, 222, 223]);   // 金/钴/秘银/精金/铂/叶绿/钯/山铜/钛
  });

  it('生命果 > 成熟草药(750,旧表最高) > 宝箱(400)——仙灵贴草药仍选中生命果', () => {
    const w2 = fairyWorld(31);
    w2.store.setTileSilent(100, 60, FRUIT, 0, 0);
    w2.store.setTileSilent(120, 60, HERB, 300, 0);   // 227 成熟株 frameX∈[272,374]
    w2.store.setTileSilent(140, 60, CHEST, 0, 0);
    expect(fairyTreasureCoords(w2.store, 120 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
  });

  it('生命果(810) 压 完整 7×7 金矿脉(260)——跨优先级距离不翻盘', () => {
    const w2 = fairyWorld(32);
    for (let i = 90; i <= 96; i++)
      for (let j = 57; j <= 63; j++) w2.store.setTileSilent(i, j, GOLD, 0, 0);
    w2.store.setTileSilent(110, 60, FRUIT, 0, 0);
    expect(fairyTreasureCoords(w2.store, 93 * 16 + 8, 60 * 16 + 8)).toEqual([110, 60]);
  });

  it('702 生命果复制品同 810——同优先取最近（两侧各验一次）', () => {
    const w2 = fairyWorld(33);
    w2.store.setTileSilent(100, 60, FRUIT, 0, 0);      // 2×2 @ (100..101,60..61)
    w2.store.setTileSilent(108, 60, REPLICA, 0, 0);    // 2×2 @ (108..109,60..61)
    // 仙灵 @ (103,60)：果近（32px）→ 果
    expect(fairyTreasureCoords(w2.store, 103 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
    // 仙灵 @ (105,60)：复制品近（48px vs 64px）→ 复制品
    expect(fairyTreasureCoords(w2.store, 105 * 16 + 8, 60 * 16 + 8)).toEqual([108, 60]);
  });
});
