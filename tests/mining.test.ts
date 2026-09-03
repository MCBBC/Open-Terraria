// 挖掘/砍伐击数验证（原版 1:1，阈值 100，冷却 useTime）：
// 伤害公式（Player.cs:46095-46098 axe×1.2 / :54552 pick + 分档除数 / :54553-54615 gate 段 /
// :54616-54627 尾段修益 / tileNoFail=100）：
// 铜斧(7)砍树：int(7×1.2)=8/击 → 13 击（用户实测原版 ≈13，此前我们 ×5.5=3 击是错的）
// 铜镐(35)泥土：35+35=70/击（土壤族二倍速 :54616）→ 2 击；金镐(55)石：55/击 → 2 击；
// 银镐(45)银矿(门槛20)：45→3 击
// tileNoFail（草丛 sheet 3 等）：100 → 1 击
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

/** 原版每击伤害（Game.tileHitDamage 移植的同一公式——此处独立复算做回归锚） */
export function vanillaHitDamage(sheet: number, toolType: 'pick' | 'axe', power: number, ftw = false,
  o?: { infectedSeed?: boolean; dungeonMidBand?: boolean; deep?: boolean; trapStyle137?: number }): number {
  const NO_FAIL = new Set([3, 4, 24, 32, 35, 50, 51, 52, 61, 62, 69, 73, 74, 81, 82, 83, 84, 110, 113, 115, 129, 162, 165, 184, 185, 186, 187, 192, 201, 205, 227, 233, 254, 324, 330, 331, 332, 333, 373, 374, 375, 382, 384, 461, 481, 482, 483, 484, 485, 518, 519, 528, 529, 530, 549, 624, 636, 637, 638, 654, 655, 656, 666, 697, 700, 701, 705, 709]);
  const AXE = new Set([5, 72, 80, 323, 488, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 704]);
  const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);          // Sets.Clouds（TileID.cs:197）
  const ROPE = new Set([213, 214, 353, 365, 366, 504, 449, 450, 451]); // tileRope（Main.cs:9452-9460 九件全表）
  const SOFT = new Set([0, 40, 53, 57, 59, 123, 224, 147, 397]);   // 土壤族二倍速（:54616）
  if (NO_FAIL.has(sheet)) return ftw ? 200 : 100;                  // DetermineDamage ×2(:54482)——noFail 同放大
  if (AXE.has(sheet)) {
    const d = toolType === 'axe' ? Math.floor((sheet === 80 ? power * 3 : power) * 1.2)
      : toolType === 'pick' ? power : 0;                           // 镐打斧族=PickTile 直调全伤(:54545 无 tileAxe 门)
    return toolType === 'axe' && ftw ? Math.floor(d * 1.3) : d;    // 斧 FTW ×1.3(:46096-46098)
  }
  if (toolType !== 'pick') return 0;
  if (sheet === 504) return 0;                                     // PickTile 早退(:54401)
  let dmg = power;
  if (sheet === 107 || sheet === 221) dmg = Math.floor(power / 2);
  else if (sheet === 108 || sheet === 222) dmg = Math.floor(power / 3);
  else if (sheet === 111 || sheet === 223) dmg = Math.floor(power / 4);
  else if (sheet === 211) dmg = Math.floor(power / 5);
  else if (sheet === 226) dmg = Math.floor(power / 4);             // 237 神庙祭坛不在除数链(:54552)
  else if ([25, 203, 117, 58, 41, 43, 44, 677, 678, 679].includes(sheet)) dmg = Math.floor(power / 2);
  else if (sheet === 85) dmg = ftw ? Math.floor(power / 4) : power; // 墓碑 FTW ÷4
  else if (sheet === 48 || sheet === 232 || CLOUDS.has(sheet)) dmg = power * 2;
  // 门槛（:54553-54615；deep=地下/地狱域，dungeonMidBand=X 中带豁免，infectedSeed=种子豁免）
  if (sheet === 211 && power < 200) return 0;
  if (!o?.infectedSeed && (sheet === 25 || sheet === 203) && power < 65) return 0;
  if (sheet === 117 && power < 65) return 0;
  if (sheet === 37 && power < 50) return 0;
  if ((sheet === 22 || sheet === 204) && o?.deep && power < 55) return 0;
  if (sheet === 56 && power < 55) return 0;
  if (sheet === 77 && o?.deep && power < 65) return 0;
  if (sheet === 58 && power < 65) return 0;
  if ((sheet === 226 || sheet === 237) && power < 210) return 0;
  if (sheet === 137 && power < 210 && (o?.trapStyle137 ?? 0) >= 1 && (o?.trapStyle137 ?? 0) <= 4) return 0;
  if ([41, 43, 44, 677, 678, 679].includes(sheet) && power < 100 && !o?.dungeonMidBand) return 0;
  if ((sheet === 107 || sheet === 221) && power < 100) return 0;
  if ((sheet === 108 || sheet === 222) && power < 110) return 0;
  if ((sheet === 111 || sheet === 223) && power < 150) return 0;
  if (SOFT.has(sheet)) dmg += power;                               // 土壤族 +pickPower(:54616)
  if (sheet === 404) dmg += 5;                                     // 沙漠化石(:54620)
  if (sheet === 165 || ROPE.has(sheet) || sheet === 199) dmg = 100; // 钟乳/绳族/猩红草(:54624)
  return ftw ? dmg * 2 : dmg;                                      // pick FTW ×2(:54482)
}

const hits = (sheet: number, toolType: 'pick' | 'axe', power: number, ftw = false,
  o?: { infectedSeed?: boolean; dungeonMidBand?: boolean; deep?: boolean; trapStyle137?: number }): number => {
  const d = vanillaHitDamage(sheet, toolType, power, ftw, o);
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
    expect(hits(5, 'pick', 35)).toBe(3);   // 镐打斧族=PickTile 直调全伤(钻头坐骑锯树通道;手持镐被 toolMatchesTile 拦→orb-hammer-gate 谓词锚)
  });
  it('泥土/石/矿：土壤族二倍速铜镐 2 击 / 石 3 击 / 金镐石 2 击', () => {
    expect(hits(0, 'pick', 35)).toBe(2);    // 泥土 70/击（:54616 土壤族，曾误 3 击）
    expect(hits(53, 'pick', 35)).toBe(2);   // 沙（同土壤族）
    expect(hits(1, 'pick', 35)).toBe(3);    // 石（不在土壤族）
    expect(hits(1, 'pick', 55)).toBe(2);    // 金镐
    expect(hits(7, 'pick', 35)).toBe(3);    // 铜矿
  });
  it('tileNoFail：花草/蘑菇植物 1 击', () => {
    expect(hits(3, 'pick', 35)).toBe(1);    // 森林短草
    expect(hits(24, 'pick', 12)).toBe(1);   // 腐化短草（木镐也秒）
  });
  it('门槛：黑檀石 65 平值 / 陨石 50 / 黑曜石 55 / 地牢砖 100', () => {
    expect(hits(25, 'pick', 55)).toBe(Infinity);  // 银镐 55 < 65（:54557 平值,无深度档）
    expect(hits(25, 'pick', 65)).toBe(4);         // int(65/2)=32 → 4 击
    expect(hits(37, 'pick', 40)).toBe(Infinity);  // 铁镐 < 50
    expect(hits(56, 'pick', 54)).toBe(Infinity);  // < 55
    expect(hits(56, 'pick', 55)).toBe(2);         // 黑曜石无除数（全伤 55）→ 2 击（原版非 /2 族）
    expect(hits(41, 'pick', 99)).toBe(Infinity);  // 地牢砖 < 100（地下,中带外）
    expect(hits(41, 'pick', 100)).toBe(2);        // int(100/2)=50 → 2 击
  });
  it('一击族：绳/链/猩红草/钟乳 =100；504 神秘蛇绳不可拆', () => {
    expect(hits(213, 'pick', 35)).toBe(1);  // 绳（tileRope → 100）
    expect(hits(214, 'pick', 12)).toBe(1);  // 链（木镐也秒）
    expect(hits(199, 'pick', 35)).toBe(1);  // 猩红草
    expect(hits(504, 'pick', 210)).toBe(Infinity); // 神秘蛇绳（PickTile 早退）
  });
  it('尾段修益：神庙祭坛全伤 1 击 / 蜥蜴砖 ÷4 两击 / 化石 +5 / 云 ×2', () => {
    expect(hits(237, 'pick', 210)).toBe(1); // 神庙祭坛 237 不在除数链(:54552)→210 全伤
    expect(hits(226, 'pick', 210)).toBe(2); // 蜥蜴砖 226 ÷4=52 → 2 击
    expect(hits(404, 'pick', 35)).toBe(3);  // 化石 35+5=40 → ceil(100/40)=3
    expect(hits(404, 'pick', 95)).toBe(1);  // 95+5=100 → 1 击
    expect(hits(189, 'pick', 35)).toBe(2);  // 云块 ×2=70 → 2 击
  });
  it('门槛补充：钴 100 / 魔矿地下 55 / 地牢 X 中带豁免 / infectedSeed 豁免 / 钻树全伤', () => {
    expect(hits(107, 'pick', 99)).toBe(Infinity);                  // 钴 <100（:54604）
    expect(hits(107, 'pick', 100)).toBe(2);                        // ÷2=50 → 2 击
    expect(hits(22, 'pick', 54, false, { deep: true })).toBe(Infinity); // 魔矿地下 <55
    expect(hits(22, 'pick', 54)).toBe(2);                          // 地表上无 55 门（全伤 54）
    expect(hits(41, 'pick', 50, false, { dungeonMidBand: true })).toBe(4); // 中带:÷2=25 → 4 击
    expect(hits(25, 'pick', 60, false, { infectedSeed: true })).toBe(4);   // 豁免:÷2=30 → 4 击
    expect(hits(5, 'pick', 210)).toBe(1);                          // 镐打斧族=全伤(PickTile 直调,DCU 锯树)
  });
  it('FTW：pick ×2 / 斧 ×1.3 / 墓碑 ÷4', () => {
    expect(hits(0, 'pick', 35, true)).toBe(1);   // 泥土 140
    expect(hits(1, 'pick', 35, true)).toBe(2);   // 石 70
    expect(hits(5, 'axe', 7, true)).toBe(10);    // int(8×1.3)=10 → 10 击
    expect(hits(85, 'pick', 35, false)).toBe(3); // 墓碑常规全伤
    expect(hits(85, 'pick', 35, true)).toBe(7);  // FTW ÷4=8 → DetermineDamage ×2=16 → 7 击（净 ÷2）
  });
});
