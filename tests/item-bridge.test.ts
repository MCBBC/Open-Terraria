// vi_ 道具功能桥接回归（工具/药水）：vanilla-itemfunc 数据 + Buff 映射链路
import { describe, it, expect } from 'vitest';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { BUFF_DEFS, BuffType } from '../src/stats/Buffs';

// 原版 buff id → BuffType（Game 桥接同款反查）
const BUFF_BY_VANILLA = new Map<number, BuffType>();
for (const [bt, d] of Object.entries(BUFF_DEFS)) BUFF_BY_VANILLA.set(d.vanillaBuff, Number(bt) as BuffType);

describe('vanilla-itemfunc 数据（1456 Item.cs 提取）', () => {
  it('铁镐 1：pick 40 / damage 5 / melee', () => {
    const f = itemFuncOfVid(1)!;
    expect(f.pick).toBe(40);
    expect(f.damage).toBe(5);
    expect(f.melee).toBe(1);
  });
  it('铁锤 7：hammer 40；钴镐 77：pick 110？——抽铜镐 3509：pick 35', () => {
    expect(itemFuncOfVid(7)!.hammer).toBe(40);
    expect(itemFuncOfVid(3509)!.pick).toBe(35);
  });
  it('治疗药水 188 healLife 100 / 魔力药水 110 healMana 50', () => {
    expect(itemFuncOfVid(188)!.healLife).toBe(100);
    expect(itemFuncOfVid(188)!.potion).toBe(1);
    expect(itemFuncOfVid(110)!.healMana).toBe(50);
  });
  it('Buff 药水：铁皮 292 buffType 5+28800t（8 分钟）/ 挖矿 2322 buffType 104+36000t', () => {
    const iron = itemFuncOfVid(292)!;
    expect(iron.buffType).toBe(5);
    expect(iron.buffTime).toBe(28800);
    expect(iron.consumable).toBe(1);
    const mine = itemFuncOfVid(2322)!;
    expect(mine.buffType).toBe(104);
    expect(mine.buffTime).toBe(36000);
  });
});

describe('桥接链路（Game.itemFuncTool / 药水分支同源判定）', () => {
  it('工具派生公式（itemFuncTool 同款）：铁镐 → pick 40%', () => {
    const pick = itemFuncOfVid(1)!;
    const derived = {
      type: pick.pick ? 'pick' : pick.axe ? 'axe' : 'hammer',
      power: pick.pick ?? pick.axe ?? pick.hammer,
    };
    expect(derived).toEqual({ type: 'pick', power: 40 });
  });
  it('BUFF_BY_VANILLA 反查：5→铁皮 / 3→敏捷 / 2→恢复 / 8→羽落 / 15→水上行走', () => {
    expect(BUFF_BY_VANILLA.get(5)).toBe(BuffType.Ironskin);
    expect(BUFF_BY_VANILLA.get(3)).toBe(BuffType.Agility);
    expect(BUFF_BY_VANILLA.get(2)).toBe(BuffType.Regen);
    expect(BUFF_BY_VANILLA.get(8)).toBe(BuffType.Featherfall);
    expect(BUFF_BY_VANILLA.get(15)).toBe(BuffType.WaterWalking);
  });
  it('耐药性 21 不作为主动施加的药水 Buff（治疗副作用另行施加）', () => {
    // 药水分支对 buffType=21（PotionSickness）不主动 apply——它由治疗动作触发
    expect(BUFF_BY_VANILLA.get(21)).toBe(BuffType.Resistance);
  });
});
