// 挖掘/砍伐击数验证（原版 1:1，阈值 100，冷却 useTime）：
// 伤害公式（Player.cs:45098 axe×1.2 / :52981 pick + 分档除数 / tileNoFail=100）
// 铜斧(7)砍树：int(7×1.2)=8/击 → 13 击（用户实测原版 ≈13，此前我们 ×5.5=3 击是错的）
// 铜镐(35)泥土：35/击 → 3 击；金镐(55)石：55/击 → 2 击；银镐(45)银矿(门槛20)：45→3 击
// tileNoFail（草丛 sheet 3 等）：100 → 1 击
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

/** 原版每击伤害（Game.tryMine 移植的同一公式——此处独立复算做回归锚） */
export function vanillaHitDamage(sheet: number, toolType: 'pick' | 'axe', power: number): number {
  const NO_FAIL = new Set([3, 4, 24, 32, 35, 50, 51, 52, 61, 62, 69, 73, 74, 81, 82, 83, 84, 110, 113, 115, 129, 162, 165, 184, 185, 186, 187, 192, 201, 205, 227, 233, 254, 324, 330, 331, 332, 333, 373, 374, 375, 382, 384, 461, 481, 482, 483, 484, 485, 518, 519, 528, 529, 530, 549, 624, 636, 637, 638, 654, 655, 656, 666, 697, 700, 701, 705, 709]);
  const AXE = new Set([5, 72, 80, 323, 488, 583, 584, 585, 586, 587, 589, 596, 616, 634, 704]);
  if (NO_FAIL.has(sheet)) return 100;
  if (AXE.has(sheet)) return toolType === 'axe' ? Math.floor((sheet === 80 ? power * 3 : power) * 1.2) : 0;
  if (toolType !== 'pick') return 0;
  let dmg = power;
  if (sheet === 107 || sheet === 221) dmg = Math.floor(power / 2);
  else if (sheet === 108 || sheet === 222) dmg = Math.floor(power / 3);
  else if (sheet === 111 || sheet === 223) dmg = Math.floor(power / 4);
  else if (sheet === 211) dmg = Math.floor(power / 5);
  else if (sheet === 226 || sheet === 237) dmg = Math.floor(power / 4);
  else if ([25, 203, 117, 58, 41, 43, 44, 481, 482, 483].includes(sheet)) dmg = Math.floor(power / 2);
  else if (sheet === 48 || sheet === 232) dmg = power * 2;
  // 门槛（取地表上方；地下门槛建另一用例）
  const gates: Array<[number, number]> = [[211, 200], [25, 65], [203, 65], [117, 65], [37, 50], [56, 55], [58, 65], [226, 210], [237, 210], [41, 100], [43, 100], [44, 100]];
  for (const [sh, gate] of gates) if (sheet === sh && power < gate) return 0;
  return dmg;
}

const hits = (sheet: number, toolType: 'pick' | 'axe', power: number): number => {
  const d = vanillaHitDamage(sheet, toolType, power);
  if (d <= 0) return Infinity;
  return Math.ceil(100 / d);
};

describe('工具数据（原版 Item.cs SetDefaults 提取值核对）', () => {
  it('铜镐/铜斧/铁镐/铁斧/银/金 全字段', () => {
    // 本地工具 def 已退役:vi_ 工具数值走 itemfunc(力)+itemcombat(伤害/useTime)桥
    const expect_ = (vid: number, type: 'pick' | 'axe' | 'hammer', power: number, damage: number, useTime: number) => {
      const f = itemFuncOfVid(vid)!;
      expect(f.pick ?? f.axe ?? f.hammer).toBe(power);
      expect(f.pick !== undefined ? 'pick' : f.axe !== undefined ? 'axe' : 'hammer').toBe(type);
      const c = itemCombat(vid)!;
      expect(c.damage).toBe(damage);
      expect(c.useTime).toBe(useTime);
    };
    expect_(3509, 'pick', 35, 4, 15);   // Copper Pickaxe
    expect_(3506, 'axe', 7, 3, 21);     // Copper Axe
    expect_(1, 'pick', 40, 5, 13);      // Iron Pickaxe
    expect_(10, 'axe', 9, 5, 19);       // Iron Axe
    expect_(3515, 'pick', 45, 6, 11);   // Silver Pickaxe
    expect_(3512, 'axe', 10, 6, 18);    // Silver Axe
    expect_(3521, 'pick', 55, 6, 17);   // Gold Pickaxe
    expect_(3518, 'axe', 11, 7, 18);    // Gold Axe
    expect_(196, 'hammer', 25, 2, 25);  // Wooden Hammer
  });
});

describe('击数（阈值 100，原版公式）', () => {
  it('树：斧族专属；铜斧 13 击 / 铁斧 10 击 / 金斧 8 击', () => {
    expect(hits(5, 'axe', 7)).toBe(13);    // int(8.4)=8 → ceil(100/8)=13
    expect(hits(5, 'axe', 9)).toBe(10);    // int(10.8)=10
    expect(hits(5, 'axe', 11)).toBe(8);    // int(13.2)=13 → ceil=8
    expect(hits(5, 'pick', 35)).toBe(Infinity); // 镐不能砍树（tileAxe 排除）
  });
  it('泥土/石/矿：铜镐 3 击 / 金镐 2 击', () => {
    expect(hits(0, 'pick', 35)).toBe(3);    // 泥土
    expect(hits(1, 'pick', 35)).toBe(3);    // 石
    expect(hits(1, 'pick', 55)).toBe(2);    // 金镐
    expect(hits(7, 'pick', 35)).toBe(3);    // 铜矿
  });
  it('tileNoFail：花草/蘑菇植物 1 击', () => {
    expect(hits(3, 'pick', 35)).toBe(1);    // 森林短草
    expect(hits(24, 'pick', 12)).toBe(1);   // 腐化短草（木镐也秒）
  });
  it('门槛：黑檀石 65 / 陨石 50 / 黑曜石 55 / 地牢砖 100', () => {
    expect(hits(25, 'pick', 55)).toBe(Infinity);  // 银镐 55 < 65
    expect(hits(25, 'pick', 65)).toBe(4);         // int(65/2)=32 → 4 击
    expect(hits(37, 'pick', 40)).toBe(Infinity);  // 铁镐 < 50
    expect(hits(56, 'pick', 54)).toBe(Infinity);  // < 55
    expect(hits(56, 'pick', 55)).toBe(2);         // 黑曜石无除数（全伤 55）→ 2 击（原版非 /2 族）
    expect(hits(41, 'pick', 99)).toBe(Infinity);  // 地牢砖 < 100（地下）
    expect(hits(41, 'pick', 100)).toBe(2);        // int(100/2)=50 → 2 击
  });
});
