// 1457 弹幕/武器数值批闸门(批3):悠悠球三表/回力镖攻速缩放/宝石法珠分化/弩车首射延迟/
// 音符弹穿透/EVP 豁免表/炸弹定伤表——锚定 Terarria1457 反编译源码终值。
// 数据面由 tests/item-stats-golden-1457.test.ts(recon-item-1456-1457.mjs)覆盖,
// 本文件锁代码面行为常量与纯函数。
import { describe, expect, it } from 'vitest';
import { YOYO_RANGE, YOYO_TOP } from '../src/entities/WeaponProj';
import { SUMMON_TAG_MUL } from '../src/entities/WhipTag';
import { HOOK_PROJ_STATS } from '../src/data/grappleHooks';
import {
  GEM_BOLT_FEATURES, GEM_ROBE_FEATURES, packGemStaffFeatures,
  gemDamageMultiplier, finalizeGemStaffStats, isGemBolt,
} from '../src/data/vanillaGemStaff';
import { projectileData } from '../src/data/vanillaProjectiles';
import { FIXED_SELF_DAMAGE_FOR_PLAYERS } from '../src/core/Game';
import combatJson from '../src/data/vanilla-itemcombat.json';
import whipsJson from '../src/data/vanilla-whips.json';

describe('1457 悠悠球三表(ProjectileID.cs:281/283 + AI_099_2)', () => {
  it('YoyosMaximumRange: 562 FormatC 320 / 554 Kraken 380(1456: 235/340)', () => {
    expect(YOYO_RANGE[562]).toBe(320);
    expect(YOYO_RANGE[554]).toBe(380);
  });
  it('YoyosTopSpeed: 563 Gradient 16 / 554 Kraken 22(1456: 12/16)', () => {
    expect(YOYO_TOP[563]).toBe(16);
    expect(YOYO_TOP[554]).toBe(22);
  });
  it('SummonTagDamageMultiplier: ★1457 表={864:0.669}(ProjectileID.cs:37;1456 的 688/689/690:0.5 三项已删)', () => {
    // 1457 ProjectileID.cs:37 CreateFloatSet(1f,864f,0.669f)——旧 1456 :31 的
    // 688/689/690 闪电光环 0.5 三项在 1457 已移除,864 Smolstar=0.669 唯一保留。
    // 2026-08-23 基准切换 1457 后按 1457 表锁（旧"并表"断言作废）
    expect(SUMMON_TAG_MUL).toEqual({ 864: 0.669 });
  });
});

describe('1457 回力镖/钩爪(AI_003/AI_007)', () => {
  it('双钩 73/74 回收 22(1457 Projectile.cs:53723-53725 ai[0]==1 num18=22f;1456 :49888-49890=17)+牵引 12.5(1457 Player.cs:23022-23025 case 73/74;1456 无覆盖=11);报告"649 星尘钩"系误标,646-649 恒 24', () => {
    expect(HOOK_PROJ_STATS[73].retract).toBe(22);
    expect(HOOK_PROJ_STATS[74].retract).toBe(22);
    expect(HOOK_PROJ_STATS[73].pull).toBe(12.5);
    expect(HOOK_PROJ_STATS[74].pull).toBe(12.5);
    expect(HOOK_PROJ_STATS[649].retract).toBe(24);
  });
});

describe('1457 宝石法珠分化(GemStaffFeatures)', () => {
  it('七弹主特性映射(Projectile.cs:36-160 Bits)', () => {
    expect(GEM_BOLT_FEATURES[121]).toEqual({ homing: true });
    expect(GEM_BOLT_FEATURES[124]).toEqual({ fastThenSlow: true });
    expect(GEM_BOLT_FEATURES[597]).toEqual({ canBounce: true });
    expect(GEM_BOLT_FEATURES[123]).toEqual({ swirlTwins: true });
    expect(GEM_BOLT_FEATURES[122]).toEqual({ aoeExplosion: true });
    expect(GEM_BOLT_FEATURES[125]).toEqual({ arPenSpread: true });
    expect(GEM_BOLT_FEATURES[126]).toEqual({ biggerHitbox: true });
    expect(isGemBolt(597)).toBe(true);
    expect(isGemBolt(520)).toBe(false);
  });
  it('长袍特性并集(Player.cs:49990 PackGemStaffFeatures)', () => {
    // 紫晶法珠 + 琥珀长袍 → Homing + CanBounce
    expect(packGemStaffFeatures(121, 4256, undefined)).toEqual({ homing: true, canBounce: true });
    // 无长袍 = 仅主特性
    expect(packGemStaffFeatures(121, undefined, undefined)).toEqual({ homing: true });
  });
  it('GetDamageMultiplier(Projectile.cs:165-182): 0.6/0.8/0.5 取最小,AllGems 恒 1', () => {
    expect(gemDamageMultiplier({ swirlTwins: true })).toBe(0.6);
    expect(gemDamageMultiplier({ canBounce: true })).toBeCloseTo(0.8, 6);
    expect(gemDamageMultiplier({ arPenSpread: true })).toBe(0.5);
    expect(gemDamageMultiplier({ allGems: true, arPenSpread: true })).toBe(1);
  });
  it('FinalizeProjectile_GemStaves(:22259-22296): 穿透/穿甲/timeLeft 终值化', () => {
    // 翡翠: pen+1 & timeLeft×2
    expect(finalizeGemStaffStats({ fastThenSlow: true }, { penetrate: 1, armorPen: 0, timeLeft: 300 }))
      .toEqual({ penetrate: 2, armorPen: 0, timeLeft: 600 });
    // 琥珀: pen+2
    expect(finalizeGemStaffStats({ canBounce: true }, { penetrate: 1, armorPen: 0, timeLeft: 300 }).penetrate).toBe(3);
    // 红晶: arpen+4
    expect(finalizeGemStaffStats({ arPenSpread: true }, { penetrate: 1, armorPen: 0, timeLeft: 300 }).armorPen).toBe(4);
    // AllGems: pen+2/arpen+4/timeLeft 90
    expect(finalizeGemStaffStats({ allGems: true }, { penetrate: 1, armorPen: 0, timeLeft: 300 }))
      .toEqual({ penetrate: 3, armorPen: 4, timeLeft: 90 });
  });
});

describe('1457 弹幕 SetDefaults 批(vanilla-projectiles.json = 1457 终值)', () => {
  it('音符弹 76-78 penetrate 5 + ignoreWater(AI/0 :24096 族)', () => {
    for (const id of [76, 77, 78]) {
      expect(projectileData(id)?.penetrate).toBe(5);
      expect(projectileData(id)?.ignoreWater).toBe(true);
    }
  });
  it('301 帕拉丁锤 penetrate 1000 / 350 导弹 timeLeft 300 / 352 尖钉 1200', () => {
    expect(projectileData(301)?.penetrate).toBe(1000);
    expect(projectileData(350)?.timeLeft).toBe(300);
    expect(projectileData(352)?.timeLeft).toBe(1200);
  });
  it('478 诅咒镖 penetrate 3(★1457 基准 Projectile.cs:5531;旧 1456 钉 2 已撤)/ 480 timeLeft 180 / 698 地裂 75×200·timeLeft 5', () => {
    expect(projectileData(478)?.penetrate).toBe(3);
    expect(projectileData(480)?.timeLeft).toBe(180);
    expect(projectileData(698)?.width).toBe(75);
    expect(projectileData(698)?.timeLeft).toBe(5);
  });
  it('837 骷髅头 timeLeft 480 + 穿墙 / 1049 陨石 timeLeft 1200 / 949 去 hostile', () => {
    expect(projectileData(837)?.timeLeft).toBe(480);
    expect(projectileData(837)?.tileCollide).toBe(false);
    expect(projectileData(1049)?.timeLeft).toBe(1200);
    expect(projectileData(949)?.hostile).toBeUndefined();
  });
  it('1106 删 armorPenetration / 114 重做(timeLeft180+extraUpdates2+arpen25,penetrate 缺省 1)', () => {
    expect(projectileData(1106)?.armorPenetration).toBeUndefined();
    expect(projectileData(114)?.timeLeft).toBe(180);
    expect(projectileData(114)?.extraUpdates).toBe(2);
    expect(projectileData(114)?.armorPenetration).toBe(25);
    expect(projectileData(114)?.penetrate).toBeUndefined();
  });
  it('宝石弹 121-126/597 = ApplyGemStaffStats(friendly+timeLeft300+localImmunity60,penetrate 缺省 1)', () => {
    for (const id of [121, 122, 123, 124, 125, 126, 597]) {
      const d = projectileData(id);
      expect(d?.friendly).toBe(true);
      expect(d?.timeLeft).toBe(300);
      expect(d?.localNPCHitCooldown).toBe(60);
      expect(d?.penetrate).toBeUndefined(); // 1456 显式行删除 = 缺省 1
    }
  });
  it('新弹 1111-1135 已登记(SetDefaults 数据面,25 弹)', () => {
    expect(projectileData(1111)).not.toBeNull();
    expect(projectileData(1126)?.aiStyle).toBe(190);
    expect(projectileData(1135)?.aiStyle).toBe(210);
  });
});

describe('1457 Item SetDefaults 终值抽查(combat/whips 全量在 item-stats-golden-1457)', () => {
  const c = combatJson as Record<string, Record<string, number | boolean>>;
  it('宝石法杖 mana 全族(739-744/3377)与 683 邪恶三叉戟', () => {
    expect(c['739'].mana).toBe(7);
    expect(c['743'].mana).toBe(9);
    expect(c['743'].damage).toBe(18);
    expect(c['744'].mana).toBe(9);
    expect(c['3377'].mana).toBe(9);
    expect(c['683'].damage).toBe(150);
    expect(c['683'].useAnimation).toBe(27);
    expect(c['683'].knockBack).toBeCloseTo(6.66, 6);
  });
  it('悠悠球 damage(3283-3291)与鞭系(whips 5477/5688;★1457 基准终值:Item.cs:43178/:44693)', () => {
    expect(c['3291'].damage).toBe(120);
    expect(c['3315'].crit).toBe(20);
    // 1457 终值:5477 花鞭 dmg=50(Item.cs:43178 DefaultToWhip(1032,50,2f,4f))/
    // 5688 史莱姆鞭 dmg=15(DefaultToWhip(1104,15,1f,4f))——旧"1456 终值 75/12"标题随基准切换勘误
    expect((whipsJson as Record<string, { dmg: number }>)['5477'].dmg).toBe(50);
    expect((whipsJson as Record<string, { dmg: number }>)['5688'].dmg).toBe(15);
  });
});

describe('1457 EVP/炸弹定伤表', () => {
  it('FixedSelfDamageForPlayers: 133-144/776-801=60、1117=120(ProjectileID.cs:193)', () => {
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[134]).toBe(60);
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[144]).toBe(60);
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[776]).toBe(60);
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[801]).toBe(60);
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[1117]).toBe(120);
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[28]).toBeUndefined();
  });
});
