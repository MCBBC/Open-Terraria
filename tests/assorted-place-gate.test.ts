// 草族种子/法杖放置门（Player.cs:41362-41440 纯函数锁定）。
// 2026-09-01 用户实报：神圣种子手铺在草地上朝空格叠出新草块——根因是转化门
// false 后回落通用"空格+邻接支撑"铺块链（已修=族内物品终止通用链）。
// 本表另锁 nactive() 门：非法杖种子对空格恒 false（empty 入参）。
import { describe, it, expect } from 'vitest';
import { assortedPlaceOk, GRASS_SEED_STAFF_VIDS, GRASS_CONVERT_SHEETS } from '../src/world/evolution/PlantRules';
import { vanillaItemCreateTile } from '../src/data/items';

describe('assortedPlaceOk（AssortedThings 门）', () => {
  it('圣草 tile(109)（神圣种子的 createTile）：只转活跃泥土(0)；空格恒 false；草基座/泥拒绝', () => {
    expect(assortedPlaceOk(false, 109, 0, false)).toBe(true);    // 泥土 → 原位转化
    expect(assortedPlaceOk(false, 109, 0, true)).toBe(false);    // ★空格（nactive 门）——叠块根因
    expect(assortedPlaceOk(false, 109, 109, false)).toBe(false); // 圣草基座 → 拒绝
    expect(assortedPlaceOk(false, 109, 59, false)).toBe(false);  // 泥 → 拒绝（圣种不吃泥）
  });
  it('普通草种(2)同 109；腐化种(23)：泥土或泥；丛林(60)/蘑菇(70)只吃泥；灰烬草种(633)只吃灰烬', () => {
    expect(assortedPlaceOk(false, 2, 0, false)).toBe(true);
    expect(assortedPlaceOk(false, 2, 0, true)).toBe(false);  // 空格拒绝
    expect(assortedPlaceOk(false, 2, 59, false)).toBe(false);
    expect(assortedPlaceOk(false, 23, 0, false)).toBe(true);
    expect(assortedPlaceOk(false, 23, 59, false)).toBe(true);
    expect(assortedPlaceOk(false, 60, 59, false)).toBe(true);
    expect(assortedPlaceOk(false, 60, 0, false)).toBe(false);
    expect(assortedPlaceOk(false, 70, 59, false)).toBe(true);
    expect(assortedPlaceOk(false, 633, 57, false)).toBe(true);
    expect(assortedPlaceOk(false, 633, 0, false)).toBe(false);
  });
  it('法杖(213/5295)促草面净效应（★BJ562 定谳 2026-10-08）：仅活跃泥土——空格/石/灰砖/泥均 no-op', () => {
    // AssortedThings staff 支 canPlace 读裸 type∈{0,1,38}（:41364-41370），但 PlaceTile(2)
    // 内门 `num==2 && (tile.type!=0 || !tile.active())`（WorldGen.cs:59876）恒拒——净 no-op。
    // 石/灰砖→苔藓 = StaffOfRegrowthCheck 死代码（1457 零调用点，1456/1458 同谳）。
    expect(assortedPlaceOk(true, 2, 0, false)).toBe(true);   // 活跃泥土 → 草（唯一可转面）
    expect(assortedPlaceOk(true, 2, 0, true)).toBe(false);   // 空格 → no-op（症状②根因）
    expect(assortedPlaceOk(true, 2, 1, false)).toBe(false);  // 石 → no-op
    expect(assortedPlaceOk(true, 2, 38, false)).toBe(false); // 灰砖 → no-op
    expect(assortedPlaceOk(true, 2, 59, false)).toBe(false); // 泥 → no-op（草不吃泥）
  });
});

describe('种子/草块物品判别路由（2026-09-01 二次修正）', () => {
  it('GRASS_SEED_STAFF_VIDS=原版 GrassSeeds 全集+法杖；place_v_109 草块物品不在内', () => {
    for (const v of [62, 59, 2171, 369, 195, 194, 5214, 213, 5295]) {
      expect(GRASS_SEED_STAFF_VIDS.has(v)).toBe(true);
    }
    expect(GRASS_SEED_STAFF_VIDS.has(10171)).toBe(false);   // place_v_109_hallowed_grass_block
  });
});

describe('草族路由三要素（2026-09-01 三修：meta 推导）', () => {
  it('vanillaItemCreateTile：种子/法杖从量产 def 推导 createTile；本仓 place_v 族= -1', () => {
    expect(vanillaItemCreateTile(62)).toBe(2);      // 草种子
    expect(vanillaItemCreateTile(369)).toBe(109);   // 神圣种子 → 圣草
    expect(vanillaItemCreateTile(213)).toBe(2);     // 再生法杖
    expect(vanillaItemCreateTile(5295)).toBe(2);    // 再生之斧
    expect(vanillaItemCreateTile(5214)).toBe(633);  // 灰烬草种
    expect(vanillaItemCreateTile(10171)).toBe(-1);  // place_v_109（本仓 vid，无 meta）
    expect(vanillaItemCreateTile(-1)).toBe(-1);
  });
});

// ★路由域单源锁定（Game.ts 字面量副本已删）。= assortedPlaceOk 非法杖各支受理面。
//  增减成员须同步 Player.cs:41372/:41378/:41390/:41403/:41416 对应分支——
//  tileMoss 族/227/滴水族/火把族【不在】此集（各自专路，勿混入）。
describe('GRASS_CONVERT_SHEETS 路由域（单源）', () => {
  it('全集恰为九员：草/腐草(2) 泥草转坏族(23,199,661,662→59) 丛林(60) 圣草(109) 灰烬草(633)', () => {
    expect([...GRASS_CONVERT_SHEETS].sort((a, b) => a - b))
      .toEqual([2, 23, 60, 70, 109, 199, 633, 661, 662]);
  });
});
