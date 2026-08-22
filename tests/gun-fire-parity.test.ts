// 枪械射击链对账（2026-08-22 审计 ❌ 批：数值表/弹型强制/省弹分档/雪球炮弹药）：
//   · 数值表：狙击步枪 1254 crit+25（Item.cs:15499）/ SDMG 1553 crit+10（:18657）/
//     雪球炮 1319 useAmmo=949 Snowball（:16318）/ 四管霰弹枪 4703 全量（:38629）
//   · 弹型强制：电圈发射器 2796→442（Player.cs:46539-46541）/ 气喇叭 5117→968
//    （:46547-46549）/ 狙击 1254·维纳斯 1255·Uzi 1265 火枪弹→高速弹 242（:46477-46487）
//   · 逐枪省弹：PickAmmo :52755-52778 六档独立掷（gunAmmoSaveHit）
import { describe, expect, it } from 'vitest';
import { itemCombat, resolveAmmoProjId, forceGunProjId, gunAmmoSaveHit, rangedAmmoWeapon, ammoDamageKind } from '../src/data/vanillaItemCombat';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { WAV_MAP } from '../src/core/Sfx';

describe('枪械数值表（vanilla-itemcombat）', () => {
  it('狙击步枪 1254 自带暴击 +25（Item.cs:15499 crit += 25）', () => {
    expect(itemCombat(1254)?.crit).toBe(25);
    expect(itemCombat(1254)?.damage).toBe(200);
  });

  it('SDMG 1553 自带暴击 +10（Item.cs:18657 crit += 10）', () => {
    expect(itemCombat(1553)?.crit).toBe(10);
  });

  it('四管霰弹枪 4703 全量数值（Item.cs:38629 DefaultToRangedWeapon(14,Bullet,55,7f)）', () => {
    const c = itemCombat(4703);
    expect(c).toMatchObject({ shoot: 14, useAmmo: 97, useTime: 55, useAnimation: 55, shootSpeed: 7 });
    expect(c?.noMelee).toBe(true);
    expect(c?.ranged).toBe(true);
  });

  it('四管霰弹枪 4703 已注册（vi_ 键 + useAmmo 接管）', () => {
    expect(ITEM_BY_KEY['vi_4703_四管霰弹枪']).toBeDefined();
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4703_四管霰弹枪']].vid).toBeUndefined(); // 键反解 4703
    expect(rangedAmmoWeapon({ key: 'vi_4703_四管霰弹枪' })).toBe(97);
  });
});

describe('雪球炮 1319 弹药链（useAmmo 97→949 Snowball，Item.cs:16318）', () => {
  it('useAmmo = 949（AmmoID.Snowball，AmmoID.cs:134）', () => {
    expect(itemCombat(1319)?.useAmmo).toBe(949);
    expect(itemCombat(1319)?.shoot).toBe(166);
  });

  it('雪球弹 949 已注册且 combat.ammo=949（PickAmmo 反查可装填）', () => {
    expect(ITEM_BY_KEY['vi_949_snowball']).toBeDefined();
    expect(itemCombat(949)?.ammo).toBe(949);
  });

  it('弹型解析：雪球弹 shoot 166 > 0 → 弹体 166（PickAmmo :52656-52659 尾链）', () => {
    expect(resolveAmmoProjId(1319, 949, 949, 166, 166)).toBe(166);
  });

  it('伤害分道：雪球 949 → specialist（GetWeaponDamageMultiplier :52521-52535 三表）', () => {
    expect(ammoDamageKind(949)).toBe('rocket');    // IsSpecialist 含 Snowball
    expect(ammoDamageKind(40)).toBe('arrow');      // IsArrow
    expect(ammoDamageKind(1836)).toBe('arrow');    // IsArrow.Stake
    expect(ammoDamageKind(97)).toBe('bullet');     // IsBullet
    expect(ammoDamageKind(1783)).toBe('bullet');   // IsBullet.CandyCorn
    expect(ammoDamageKind(283)).toBe('rocket');    // IsSpecialist.Dart
    expect(ammoDamageKind(75)).toBe('rocket');     // IsSpecialist.FallenStar
    expect(ammoDamageKind(780)).toBe('other');     // 溶液不在三表
  });

  it('StrongerVariant 档（getgood 世界）dmg 22 / 6t（Item.cs:16322-16329）', () => {
    // 变体层 vanillaItemVariants.ITEM_VARIANT_STATS[1319]，普通世界取常规值
    expect(itemCombat(1319)?.damage).toBe(10);
    expect(itemCombat(1319)?.useTime).toBe(19);
  });
});

describe('逐枪弹型强制（forceGunProjId，Player.cs 弹型段）', () => {
  it('电圈发射器 2796 恒 442，无视火箭弹型（:46539-46541）', () => {
    expect(forceGunProjId(2796, 442)).toBe(442);   // 一型火箭（加法链 442+0）
    expect(forceGunProjId(2796, 445)).toBe(442);   // 二型（442+3）——旧链混入假弹
    expect(forceGunProjId(2796, 451)).toBe(442);   // 四型（442+9）
  });

  it('气喇叭 5117 恒 968，无视子弹弹型（:46547-46549）', () => {
    expect(forceGunProjId(5117, 14)).toBe(968);
    expect(forceGunProjId(5117, 69)).toBe(968);    // 高速弹也强制
  });

  it('狙击 1254/维纳斯 1255/Uzi 1265：火枪弹 14 → 高速弹 242（:46477-46487）', () => {
    expect(forceGunProjId(1254, 14)).toBe(242);
    expect(forceGunProjId(1255, 14)).toBe(242);
    expect(forceGunProjId(1265, 14)).toBe(242);
  });

  it('转换仅限火枪弹：银弹 69/高速弹 207 不被改；他枪直通', () => {
    expect(forceGunProjId(1254, 69)).toBe(69);
    expect(forceGunProjId(1254, 207)).toBe(207);
    expect(forceGunProjId(98, 14)).toBe(14);       // 迷你鲨不转换
    expect(forceGunProjId(96, 14)).toBe(14);       // 火枪不转换
  });
});

describe('逐枪省弹分档（gunAmmoSaveHit，PickAmmo :52755-52778）', () => {
  it('掷 0 才省档：迷你鲨 98 / 糖果玉米 1782 = 1/3，巨鲨 533 / 加特利托 2270 = 1/2', () => {
    expect(gunAmmoSaveHit(98, 0.0)).toBe(true);    // Next(3)==0 → 省
    expect(gunAmmoSaveHit(98, 0.4)).toBe(false);
    expect(gunAmmoSaveHit(1782, 0.0)).toBe(true);
    expect(gunAmmoSaveHit(533, 0.0)).toBe(true);   // Next(2)==0 → 省
    expect(gunAmmoSaveHit(533, 0.6)).toBe(false);
    expect(gunAmmoSaveHit(2270, 0.0)).toBe(true);
  });

  it('掷非 0 才省档（仅耗 1/3）：SDMG 1553 / 链式机枪 1929', () => {
    expect(gunAmmoSaveHit(1553, 0.0)).toBe(false); // Next(3)==0 → 照常耗
    expect(gunAmmoSaveHit(1553, 0.5)).toBe(true);  // Next(3)!=0 → 省
    expect(gunAmmoSaveHit(1929, 0.9)).toBe(true);
  });

  it('非表枪恒耗弹', () => {
    expect(gunAmmoSaveHit(96, 0.0)).toBe(false);   // 火枪
    expect(gunAmmoSaveHit(1254, 0.0)).toBe(false); // 狙击
    expect(gunAmmoSaveHit(0, 0.0)).toBe(false);
  });

  it('统计速率收敛（3000 掷）：98≈1/3、533≈1/2、1553≈2/3', () => {
    const rate = (vid: number): number => {
      let n = 0;
      for (let i = 0; i < 3000; i++) if (gunAmmoSaveHit(vid, Math.random())) n++;
      return n / 3000;
    };
    expect(Math.abs(rate(98) - 1 / 3)).toBeLessThan(0.04);
    expect(Math.abs(rate(533) - 1 / 2)).toBeLessThan(0.04);
    expect(Math.abs(rate(1553) - 2 / 3)).toBeLessThan(0.04);
  });
});

describe('榴弹族爆炸音（Projectile.Kill :74469-74538 弹型分支）', () => {
  it('Item62 闷爆轨已登记（手雷 30/火箭一型 133/二型 136/三型 139）', () => {
    expect(WAV_MAP.explosionGrenade).toEqual(['Item_62']);
    expect(WAV_MAP.explosion).toEqual(['Item_14']);
  });
});
