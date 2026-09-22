// vi_* 数据驱动武器分类与数值测试（1456 combat/projectiles 表驱动）
import { describe, it, expect } from 'vitest';
import { combatWeapon, thrownCombat, projGravity } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';

const def = (key: string) => ITEM_DEFS[ITEM_BY_KEY[key]];

describe('vi_* 武器分类（combatWeapon）', () => {
  it('纯近战：铁剑走 melee 分支且数值来自 combat 表', () => {
    const w = combatWeapon({ key: 'vi_4_iron_shortsword', vid: 4 });
    // useAnimation=挥击动画时长 / autoReuse=持按连挥（Player.ItemCheck 分立计数）
    expect(w).toEqual({ kind: 'melee', damage: 12, knockback: 5.5, useTime: 20, useAnimation: 20, autoReuse: false });
  });

  it('回旋镖：附魔回旋镖 → boomerang + 投射物 6（aiStyle 3）', () => {
    const w = combatWeapon({ key: 'vi_55_enchanted_boomerang', vid: 55 });
    expect(w?.kind).toBe('boomerang');
    if (w?.kind === 'boomerang') expect(w.shoot).toBe(6);
    expect(projectileData(6)?.aiStyle).toBe(3);
  });

  it('长矛：木矛 → spear + 投射物 46（aiStyle 19，DefaultToSpear 展开验证）', () => {
    const w = combatWeapon({ key: 'vi_274_spear', vid: 274 });
    expect(w?.kind).toBe('spear');
    if (w?.kind === 'spear') expect(w.shoot).toBe(46);
    expect(projectileData(46)?.aiStyle).toBe(19);
  });

  it('悠悠球：投影射物 546 → yoyo（aiStyle 99，区间块+DefaultToYoyo 展开验证）', () => {
    // 找一个 shoot=546 的物品：直接验证投射物表与分发器的联动
    expect(projectileData(546)?.aiStyle).toBe(99);
    const yoyo = combatWeapon({ key: 'vi_3284_amarok', vid: 3284 });
    expect(yoyo?.kind).toBe('yoyo');
  });

  it('连枷：链球 → flail（aiStyle 15，DefaultToFlail 展开验证）', () => {
    const w = combatWeapon({ key: 'vi_162_ball_o_hurt', vid: 162 });
    expect(w?.kind).toBe('flail');
    expect(projectileData(25)?.aiStyle).toBe(15);
  });

  it('爆炸物：手雷 → grenade（ai16，必须先于投掷判定）', () => {
    const w = combatWeapon({ key: 'vi_166_grenade', vid: 166 });
    expect(w?.kind).toBe('grenade');
    if (w?.kind === 'grenade') {
      expect(w.shoot).toBe(28);
      expect(projectileData(28)?.aiStyle).toBe(16);
    }
  });

  it('魔法：紫晶法杖 → magic，mana 7、shoot 121', () => {
    // 1457: 宝石法杖 mana 全族上调（5→7，Terarria1457 Item.cs:9977；1456:9958=5）
    const w = combatWeapon({ key: 'vi_739_amethyst_staff', vid: 739 });
    expect(w).toMatchObject({ kind: 'magic', mana: 7, shoot: 121, damage: 15, useTime: 37 });
  });

  it('手里剑仍是 ai2 投掷武器（combatWeapon 不接管，thrownCombat 命中）', () => {
    expect(combatWeapon({ key: 'vi_42_shuriken', vid: 42 })).toBeNull();
    expect(thrownCombat({ key: 'vi_42_shuriken', vid: 42 })).toEqual({ shoot: 3, damage: 10 });
  });

  it('弓（useAmmo 体系）不被 combatWeapon 分流', () => {
    expect(combatWeapon({ key: VANILLA_ITEM_KEY_BY_ID[39], vid: 39 })).toBeNull();
  });

  it('天顶剑族 4956/5669 → melee + useTime=useAnimation/3（Item.cs:39984 算式）', () => {
    // melee+noMelee+aiStyle182 曾落 'shot' 兜底 = 直线箭弹（无剑阵无挥击）
    expect(combatWeapon({ key: 'vi_4956_zenith', vid: 4956 })).toMatchObject(
      { kind: 'melee', damage: 190, knockback: 6.5, useTime: 10, useAnimation: 30, autoReuse: true, shoot: 933, shootSpeed: 16 });
    expect(combatWeapon({ key: 'vi_5669_true_copper_shortsword', vid: 5669 })).toMatchObject(
      { kind: 'melee', damage: 190, useTime: 10, useAnimation: 30, autoReuse: true, shoot: 1100, shootSpeed: 16 });
  });
});

describe('辅助数据', () => {
  it('projGravity：ai2/16 抛物线 0.3，直飞 0', () => {
    expect(projGravity(3)).toBe(0.3);   // 手里剑 ai2
    expect(projGravity(28)).toBe(0.3);  // 手雷 ai16
    expect(projGravity(121)).toBe(0);   // 紫晶弹 ai29 直飞
  });

  it('已注册物品全链路：分类器对 ITEM_DEFS 的 vi_ 武器可稳定判定', () => {
    let n = 0;
    for (const d of ITEM_DEFS) {
      if (!d || !d.key.startsWith('vi_')) continue;   // ★方案 A:守洞
      if (combatWeapon(d) || thrownCombat(d)) n++;
    }
    expect(n).toBeGreaterThan(80); // 至少覆盖近战+回旋镖+长矛+魔法+投掷各族
  });
});
