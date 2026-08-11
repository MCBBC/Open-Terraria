// 台账 #48 食物链：SetFoodDefaults 提取（85 件 useStyle 2/9 + buffType 26/206/207）
// + WellFed 三档数值（Player.cs:11523-11570）+ 使用桥接时长
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';

const mk = () => new Player(0, 0, new Inventory());
const FUNC = JSON.parse(readFileSync('src/data/vanilla-itemfunc.json', 'utf8')) as Record<string, Record<string, number>>;

// 源码实表抽样（Item.cs SetFoodDefaults 逐 case，独立誊录防提取脚本自证）
const TRUTH: Record<number, { buffType: number; buffTime: number; useStyle: number }> = {
  4022: { buffType: 207, buffTime: 172800, useStyle: 2 }, // 金美味 Golden Delight（48min）
  1919: { buffType: 207, buffTime: 14400, useStyle: 2 },  // 帕泰炒面
  3532: { buffType: 207, buffTime: 86400, useStyle: 2 },  // 海鲜大餐（24min）
  1911: { buffType: 207, buffTime: 14400, useStyle: 9 },  // useGulpSound → 仰饮
  2426: { buffType: 206, buffTime: 36000, useStyle: 2 },  // 二档
  357:  { buffType: 206, buffTime: 28800, useStyle: 9 },  // 葡萄汁
  4009: { buffType: 26, buffTime: 18000, useStyle: 2 },   // 一档
  967:  { buffType: 26, buffTime: 3600, useStyle: 9 },    // case 内强制 useStyle=9
  969:  { buffType: 26, buffTime: 36000, useStyle: 9 },   // case 内强制 useStyle=9
  5275: { buffType: 26, buffTime: 7200, useStyle: 9 },    // Joja 可乐
};

describe('食物提取（SetFoodDefaults → vanilla-itemfunc）', () => {
  it('84 件食补全量：buffType ∈ {25,26,206,207} 且 buffTime>0 且 useStyle ∈ {2,9} 且 consumable', () => {
    // SetFoodDefaults 共 85 case：84 DefaultToFood + 1912 蛋酒走 DefaultToHealingPotion(healLife)
    const foods = Object.entries(FUNC).filter(([, v]) => v.buffType && [25, 26, 206, 207].includes(v.buffType));
    expect(foods.length).toBe(84);
    for (const [id, v] of foods) {
      expect(v.useStyle === 2 || v.useStyle === 9, `id ${id} useStyle=${v.useStyle}`).toBe(true);
      expect(v.consumable, `id ${id} consumable`).toBe(1);
      expect(v.buffTime, `id ${id} buffTime`).toBeGreaterThan(0);
    }
  });
  it('抽样 10 件对照源码实表（buffType/buffTime/useStyle）', () => {
    for (const [id, t] of Object.entries(TRUTH)) {
      const ff = FUNC[id]!;
      expect(ff.buffType).toBe(t.buffType);
      expect(ff.buffTime).toBe(t.buffTime);
      expect(ff.useStyle).toBe(t.useStyle);
    }
  });
  it('三档分布：26×42 / 206×26 / 207×14 / 25×2（2266+353 醉酒）', () => {
    const foods = Object.values(FUNC).filter((v) => v.buffType && [25, 26, 206, 207].includes(v.buffType));
    const cnt = (b: number) => foods.filter((v) => v.buffType === b).length;
    expect(cnt(26)).toBe(42);
    expect(cnt(206)).toBe(26);
    expect(cnt(207)).toBe(14);
    expect(cnt(25)).toBe(2);
  });
  it('itemFuncOfVid 运行时桥一致（以 1919 为例）', () => {
    expect(itemFuncOfVid(1919)?.buffType).toBe(207);
    expect(itemFuncOfVid(1919)?.buffTime).toBe(14400);
  });
});

describe('WellFed 三档数值（Player.cs:11523-11570）', () => {
  it('26 一档：def+2/暴击+2/伤+5%/近战速+5%/移速+20%/镐速×0.95', () => {
    const p = mk();
    p.buffs.apply(BuffType.WellFed, 300);
    expect(p.defense).toBe(2);
    expect(p.critChance('melee')).toBe(2);
    expect(p.critChance('magic')).toBe(2);
    expect(p.damageMult('ranged')).toBeCloseTo(1.05, 5);
    expect(p.attackSpeedMult).toBeCloseTo(1.05, 5);
    expect(p.buffs.moveSpeedMult).toBeCloseTo(1.2, 5);
    expect(p.buffs.wellFedPickMult).toBeCloseTo(0.95, 5);
  });
  it('206 二档：def+3/暴击+3/伤+7.5%/移速+30%', () => {
    const p = mk();
    p.buffs.apply(BuffType.WellFed2, 840);
    expect(p.defense).toBe(3);
    expect(p.critChance('ranged')).toBe(3);
    expect(p.damageMult('magic')).toBeCloseTo(1.075, 5);
    expect(p.buffs.moveSpeedMult).toBeCloseTo(1.3, 5);
  });
  it('207 三档：def+4/暴击+4/伤+10%/移速+40%/镐速×0.85', () => {
    const p = mk();
    p.buffs.apply(BuffType.WellFed3, 2880);
    expect(p.defense).toBe(4);
    expect(p.critChance('melee')).toBe(4);
    expect(p.damageMult('melee')).toBeCloseTo(1.1, 5);
    expect(p.buffs.moveSpeedMult).toBeCloseTo(1.4, 5);
    expect(p.buffs.wellFedPickMult).toBeCloseTo(0.85, 5);
  });
  it('多档并存取最高档；到期回落', () => {
    const p = mk();
    p.buffs.apply(BuffType.WellFed, 300);
    p.buffs.apply(BuffType.WellFed3, 600);
    expect(p.defense).toBe(4);
    p.buffs.remove(BuffType.WellFed3);
    expect(p.defense).toBe(2);
    p.buffs.remove(BuffType.WellFed);
    expect(p.defense).toBe(0);
    expect(p.buffs.wellFedTier).toBe(0);
  });
  it('BUFF_DEFS 反查：原版 id 26/206/207 → WellFed 三档（Game.ts BUFF_BY_VANILLA 链）', () => {
    const byVanilla = new Map<number, BuffType>();
    for (const [bt, d] of Object.entries(BUFF_DEFS)) byVanilla.set(d.vanillaBuff, Number(bt) as BuffType);
    expect(byVanilla.get(26)).toBe(BuffType.WellFed);
    expect(byVanilla.get(206)).toBe(BuffType.WellFed2);
    expect(byVanilla.get(207)).toBe(BuffType.WellFed3);
  });
  it('使用桥时长：buffTime tick → 秒（1919 = 14400t = 240s）', () => {
    const ff = itemFuncOfVid(1919)!;
    expect(Math.round((ff.buffTime ?? 0) / 60)).toBe(240);
  });
});
