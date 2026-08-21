// A 级数值近似清理（2026-08-14）四项回归：
//   项1 Ichor/穿甲池语义：NPC.checkArmorPenetration 1:1 纯函数（NPC.cs:81913-81938）
//      + Ichor 施加点时长对账（StatusNPC 表 278/479 + 浸剂 meleeEnchant 5）
//   项2 armorPen 独立字段：弹幕自带 armorPenetration 数据层（SetDefaults 25 款）
//      + Arrow.settlePen 两源相加（StrikeNPC :12068 num3 语义）
//   项3 玩家侧 DoT：Bleeding 无直伤（Player.cs:18998 爬坡阻断模型）+
//      OnFire vampireSeed 特档（:18798-18802 -100 lifeRegen = 50 HP/s）
//   项4 鞭 DoT 分档：ApplyWhipDebuffs 1:1（Projectile.cs:11067-11090）
//      913→OnFire3 / 912→Frostburn2（旧实现误并入 OnFire 4s 近似）
import { describe, it, expect, vi } from 'vitest';
import { npcCheckArmorPenetration, applyProjStatus, applyMeleeImbue } from '../src/entities/projStatus';
import { projectileData } from '../src/data/vanillaProjectiles';
import { Arrow } from '../src/entities/Arrow';
import { applyWhipDebuffs } from '../src/entities/WhipProj';
import { BuffState, BuffType } from '../src/stats/Buffs';

describe('项1 Ichor/checkArmorPenetration 单池语义（NPC.cs:81913-81938）', () => {
  it('ichor 单独在身：+15 入池 → min(15,def)/2 加伤（def30 → 7，整除截断）', () => {
    // vanilla：pen=15 → 15<30 → return 15/2 = 7（int 除法）——非"防-15"直减也非平推 +7
    expect(npcCheckArmorPenetration(30, 0, 0, { ichor: true })).toBe(7);
    expect(npcCheckArmorPenetration(31, 0, 0, { ichor: true })).toBe(7); // 15/2=7.5 截 7
  });
  it('池饱和：ichor15+弹幕25=40 > def30 → 钳 def/2=15（非 12+7=19 独立相加）', () => {
    expect(npcCheckArmorPenetration(30, 25, 0, { ichor: true })).toBe(15);
    expect(npcCheckArmorPenetration(30, 25, 0)).toBe(12); // 无 ichor：25/2=12（独立字段）
  });
  it('早退：def≤0 或池≤0 → 0（负防御不吃穿甲加成）', () => {
    expect(npcCheckArmorPenetration(0, 50, 0, { ichor: true, brokenArmor: true })).toBe(0);
    expect(npcCheckArmorPenetration(-15, 50, 0, { ichor: true })).toBe(0);
    expect(npcCheckArmorPenetration(30, 0, 0)).toBe(0);
  });
  it('全池累加：ichor15+broken20+betsy40+pct(int)(def×pct)（:81916-81927）', () => {
    // def100 pct1：15+20+40+100=175 > 100 → 钳 50；def200 pct0.5：75+100=175 < 200 → 87
    expect(npcCheckArmorPenetration(100, 0, 1, { ichor: true, brokenArmor: true, betsysCurse: true })).toBe(50);
    expect(npcCheckArmorPenetration(200, 0, 0.5, { ichor: true, brokenArmor: true, betsysCurse: true })).toBe(87);
    // pct (int) 截断：def50×0.5=25 → 15+25=40 → 20
    expect(npcCheckArmorPenetration(50, 0, 0.5, { ichor: true })).toBe(20);
  });
  it('armorPen 与 ichor 同池等价：同为 15 贡献同一加成（不混算的两个来源）', () => {
    expect(npcCheckArmorPenetration(30, 15, 0)).toBe(npcCheckArmorPenetration(30, 0, 0, { ichor: true }));
  });
});

describe('项1 Ichor 施加点时长对账（StatusNPC 表 + 浸剂）', () => {
  it('278 灵液喷射族 → ichorT 600t=10s（:11014）；479 → 420-840t（:10830）', () => {
    const e: Record<string, number> = {};
    applyProjStatus(278, e);
    expect(e.ichorT).toBe(10);
    const lo: Record<string, number> = {};
    vi.spyOn(Math, 'random').mockReturnValue(0);
    applyProjStatus(479, lo);
    const hi: Record<string, number> = {};
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    applyProjStatus(479, hi);
    expect(lo.ichorT).toBe(7);      // 420t
    expect(hi.ichorT).toBe(14);     // 840t
    vi.restoreAllMocks();
  });
  it('浸剂灵液 meleeEnchant5：60×Next(10,20)t = 10-19s（Player.cs:6155-6158）', () => {
    const mk = () => ({ has: (b: number) => b === BuffType.ImbueIchor });
    const lo: Record<string, number> = {};
    vi.spyOn(Math, 'random').mockReturnValue(0);
    applyMeleeImbue(mk() as unknown as { has: (b: never) => boolean }, lo);
    const hi: Record<string, number> = {};
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    applyMeleeImbue(mk() as unknown as { has: (b: never) => boolean }, hi);
    expect(lo.ichorT).toBeCloseTo(10, 5);
    expect(hi.ichorT).toBeLessThan(20);   // 上界开区间（Next(10,20) ≤19s）
    expect(hi.ichorT).toBeGreaterThanOrEqual(18.9);
    vi.restoreAllMocks();
  });
});

describe('项2 armorPen 独立字段（弹幕 armorPenetration 数据层 + settlePen）', () => {
  it('vanilla-projectiles：25 款自带穿甲入表（SetDefaults 直写）', () => {
    expect(projectileData(85)?.armorPenetration).toBe(15);   // 叶绿弹 :1400
    expect(projectileData(917)?.armorPenetration).toBe(30);  // 酷鞭雪花哨兵 :9494
    expect(projectileData(1036)?.armorPenetration).toBe(30); // 麻线鞭蜘蛛
    expect(projectileData(916)?.armorPenetration).toBe(50);
    expect(projectileData(1045)?.armorPenetration).toBe(50);
    expect(projectileData(1106)?.armorPenetration).toBe(5);  // 火舌
    expect(projectileData(1)?.armorPenetration).toBeUndefined(); // 无穿甲档不落键
  });
  it('Arrow.settlePen = 玩家 AP + 本型号 AP（StrikeNPC :12068 两源,再入 :81913 池）', () => {
    const a85 = new Arrow(0, 0, 1, 0, 10, 1, 85, null);
    a85.armorPen = 5;
    expect((a85 as unknown as { settlePen: number }).settlePen).toBe(20);
    const a1 = new Arrow(0, 0, 1, 0, 10, 1, 1, null);
    a1.armorPen = 5;
    expect((a1 as unknown as { settlePen: number }).settlePen).toBe(5);
  });
  it('独立参与结算：armorPen 15 单独即可无视 15 防（不依赖 ichor 通道）', () => {
    // def 30：armorPen 15 → 加伤 7；ichor 也 15 → 同值——两通道等价且可并存于池内
    expect(npcCheckArmorPenetration(30, 15, 0)).toBe(7);
    expect(npcCheckArmorPenetration(30, 15, 0, { ichor: true })).toBe(15); // 30/2 钳制
  });
});

describe('项3 玩家侧 DoT（Buffs.ts ENV_DOTS）', () => {
  it('OnFire 基档 -4 HP/s（Player.cs:18810-18813 lifeRegen-8）', () => {
    const b = new BuffState();
    b.apply(BuffType.OnFire, 2);
    let loss = 0;
    for (let i = 0; i < 60; i++) loss += b.tick(1 / 60);
    expect(loss).toBe(-4);
  });
  it('vampireSeed 世界：OnFire → -50 HP/s（:18798-18802 lifeRegen-100）', () => {
    const b = new BuffState();
    b.vampireSeed = true;
    b.apply(BuffType.OnFire, 2);
    let loss = 0;
    for (let i = 0; i < 60; i++) loss += b.tick(1 / 60);
    expect(loss).toBe(-50);
  });
  it('vampireSeed 只提档 buff 24：OnFire3(323) 恒 -4（:18819-18827 无该分支）', () => {
    const b = new BuffState();
    b.vampireSeed = true;
    b.apply(BuffType.OnFire3, 2);
    let loss = 0;
    for (let i = 0; i < 60; i++) loss += b.tick(1 / 60);
    expect(loss).toBe(-4);
  });
  it('Bleeding(30) 无直接 DoT：模型=清 lifeRegenTime 爬坡（:18998-19001）', () => {
    const b = new BuffState();
    b.apply(BuffType.Bleeding, 2);
    expect(b.tick(1)).toBe(0);   // 不掉血；回血阻断在 Player.lifeRegenTime（:19000）
    const b2 = new BuffState();
    b2.apply(BuffType.Obstructed, 2); // 163 同 bleed 语义（:11421-11425）
    expect(b2.tick(1)).toBe(0);
  });
});

describe('项4 鞭敌方 debuff 分档（ApplyWhipDebuffs Projectile.cs:11067-11090）', () => {
  it('913 火鞭 → OnFire3(323) 240t=4s（旧实现误并 OnFire 4 HP/s 近似）', () => {
    const e: Record<string, number> = {};
    applyWhipDebuffs(913, e);
    expect(e.onFire3T).toBe(4);
    expect(e.onFireT).toBeUndefined();
  });
  it('912 酷鞭 → Frostburn2(324) 240t=4s（25 HP/s 档）', () => {
    const e: Record<string, number> = {};
    applyWhipDebuffs(912, e);
    expect(e.frostburn2T).toBe(4);
    expect(e.onFireT).toBeUndefined();
  });
  it('AddBuff max 合并：已有 10s 不被 4s 缩短；914 荆棘鞭 1/5 中毒 180t=3s', () => {
    const e: Record<string, number> = { onFire3T: 10 };
    applyWhipDebuffs(913, e);
    expect(e.onFire3T).toBe(10);
    const p: Record<string, number> = {};
    vi.spyOn(Math, 'random').mockReturnValue(0);
    applyWhipDebuffs(914, p);
    expect(p.poisonT).toBe(3);
    const miss: Record<string, number> = {};
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    applyWhipDebuffs(914, miss);
    expect(miss.poisonT).toBeUndefined();
    vi.restoreAllMocks();
  });
  it('1033 电鳗鞭 → 362 落 eelWhipT 240t=4s（1457 DoT 重做:Add(100,50)=50 HP/s 平铺,'
    + 'NPC.cs:92781——链式缩放/标记玩家数/链电粒子全删）;849 黑收成 310 纯视觉仍不落字段', () => {
    // 旧断言（1456 锚"标记类不落 DoT 字段"）按 1457 终态更新
    const e: Record<string, number> = {};
    applyWhipDebuffs(1033, e);
    expect(e.eelWhipT).toBe(4);
    applyWhipDebuffs(849, e);
    expect(Object.keys(e)).toEqual(['eelWhipT']);
  });
});
