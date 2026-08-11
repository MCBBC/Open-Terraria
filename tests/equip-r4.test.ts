// R4 回归：魔力星经济（磁石/手铐/魔力花）+ 盔甲套装加成表
import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const mk = () => new Player(0, 0, new Inventory());

describe('R4 魔力星经济', () => {
  it('魔力磁石（天界磁石 2219）：星拾取范围 +80', () => {
    const p = mk();
    expect(p.manaMagnetBonus).toBe(0);
    p.inv.armor[3] = { id: _iid(2219), stack: 1 };
    expect(p.manaMagnetBonus).toBe(80);
  });

  it('魔力手铐 1595：受伤回蓝 = 原始伤害 1:1', () => {
    const p = mk();
    p.mana = 0; p.hp = 100; p.iframes = 0;
    p.inv.armor[3] = { id: _iid(1595), stack: 1 };
    expect(p.equipStats.magicCuffs).toBe(true);
    p.damage(30, 0, 0, false);
    expect(p.mana).toBeGreaterThanOrEqual(Math.min(30, p.maxMana));
  });

  it('魔力花 555：装备判定（耗魔 -8% 由 Game 门消费）', () => {
    const p = mk();
    p.inv.armor[3] = { id: _iid(555), stack: 1 };
    expect(p.equipStats.manaFlower).toBe(true);
  });
});

describe('R4 盔甲套装加成', () => {
  it('铁三件（2|2|2）：setBonus 防 +2 命中', () => {
    const p = mk();
    expect(p.equipStats.setBonus).toBeNull();
    p.inv.armor[0] = { id: _iid(90), stack: 1 };  // IronHelmet
    p.inv.armor[1] = { id: _iid(81), stack: 1 };  // IronChainmail
    p.inv.armor[2] = { id: _iid(77), stack: 1 };  // IronGreaves
    expect(p.equipStats.setBonus?.name).toBe('MetalTier1');
    expect(p.equipStats.def).toBe(2);
  });
  it('熔岩三件（9|9|9）：近战 +10% + fireWalk', () => {
    const p = mk();
    p.inv.armor[0] = { id: _iid(231), stack: 1 };
    p.inv.armor[1] = { id: _iid(232), stack: 1 };
    p.inv.armor[2] = { id: _iid(233), stack: 1 };
    const st = p.equipStats;
    expect(st.setBonus?.name).toBe('Molten');
    expect(st.dmgMelee).toBeCloseTo(0.1, 5);
    expect(st.fireWalk).toBe(true);
  });
  it('死灵三件（7|7|7）：远程暴 +10（头 75/7 均命中）', async () => {
    const p = mk();
    // NecroHelmet 150? —— 用槽序反查任一 hs=7 头盔不直观；直接验表条目存在
    // （换装路径已由铁/熔岩两例覆盖）
    const { ARMOR_SET_BONUSES } = await import('../src/data/vanillaArmorSets');
    expect(ARMOR_SET_BONUSES['7|7|7'].critRanged).toBe(10);
    expect(ARMOR_SET_BONUSES['75|7|7'].critRanged).toBe(10);
  });
  it('丛林套（8|8|8）：耗魔 manaCostMul 0.84', async () => {
    const { ARMOR_SET_BONUSES } = await import('../src/data/vanillaArmorSets');
    expect(ARMOR_SET_BONUSES['8|8|8'].manaCostMul).toBeCloseTo(0.84, 5);
  });
});
