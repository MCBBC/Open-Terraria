// 消耗型投掷武器（手里剑/飞刀等）数据链路测试
import { describe, it, expect } from 'vitest';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';

function viIdFromKey(key: string): number {
  const m = key.match(/^vi_(\d+)_/);
  return m ? Number(m[1]) : -1;
}

/** 与 Game.ts thrownCombat 同构 */
function thrownCombat(def: (typeof ITEM_DEFS)[number]): { shoot: number; damage: number } | null {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0) return null;
  const c = itemCombat(vid);
  if (!c?.shoot || !c.consumable || !c.noMelee || c.useAmmo || c.ammo) return null;
  return { shoot: c.shoot, damage: c.damage ?? 0 };
}

describe('消耗型投掷武器', () => {
  it('手里剑/飞刀被识别为投掷武器且有正确数值', () => {
    const shuriken = ITEM_DEFS[ITEM_BY_KEY['vi_42_shuriken']];
    const knife = ITEM_DEFS[ITEM_BY_KEY['vi_279_throwing_knife']];
    expect(shuriken && thrownCombat(shuriken)).toEqual({ shoot: 3, damage: 10 });
    expect(knife && thrownCombat(knife)).toEqual({ shoot: 48, damage: 12 });
  });

  it('速度/冷却来自原版 combat 表', () => {
    const c42 = itemCombat(42)!;
    expect(c42.shootSpeed).toBe(9);
    expect(c42.useTime).toBe(15);
    const c279 = itemCombat(279)!;
    expect(c279.shootSpeed).toBe(10);
    expect(c279.useTime).toBe(15);
  });

  it('弓（木弓）不被误判为投掷武器（有 useAmmo/ranged 体系）', () => {
    // 木弓 vid 39：无 consumable → thrownCombat 不命中
    const bow = ITEM_DEFS[ITEM_BY_KEY['wood_bow']];
    const c39 = itemCombat(39);
    expect(c39?.consumable).toBeFalsy();
    void bow;
  });

  it('木箭（弹药）不被误判为投掷武器', () => {
    const arrow = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[40]]];
    expect(arrow).toBeDefined();
    const c40 = itemCombat(40);
    expect(c40?.ammo).toBe(40); // 是弹药而非投掷物
    expect(arrow && thrownCombat(arrow)).toBeNull();
  });
});
