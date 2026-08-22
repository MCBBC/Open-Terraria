// 鞭 tag 表 1457 锚（基准切换批）：表数据 / proc 门组 / falloff 对拍 1457 反编译。
//  权威：Terarria1457 Terraria.ID/ItemID.cs:1313-1420（UniqueTagEffects object[36]）+
//  Terraria/Projectile.cs:13497-13548（多目标 falloff）/ :13968-14013（proc switch）+
//  Terraria.GameContent.Items/WhipTagEffect.cs:17-22（TagDuration 缺省 240;唯一覆写
//  5479=480 = ItemID.cs:1402）
import { describe, it, expect } from 'vitest';
import {
  TAG_EFFECTS, WHIP_PROC_ITEMS, WHIP_PROC_ONCE_ITEMS, WHIP_FALLOFF,
} from '../src/entities/WhipTag';

describe('鞭 tag 表 1457（ItemID.cs:1313-1420）', () => {
  it('全表 18 条（object[36] = 18 对,:1313）', () => {
    expect(Object.keys(TAG_EFFECTS).length).toBe(18);
  });

  it('4678 = WhipTagEffect_SwordWhip（:1368-1374）：9 伤/buff 308×180/240t;ModifyProcHit → MegaSlash +30 flat（_SwordWhip.cs:17-27）', () => {
    expect(TAG_EFFECTS[4678]).toMatchObject({
      kind: 'swordwhip', tagDuration: 240, tagDamage: 9, critChance: 0,
      playerBuffId: 308, playerBuffTime: 180, playerBuffAppliedManually: false,
    });
  });

  it('5478 = WhipTagEffect_ElectricEel（:1393-1397）：12 伤/5% crit/240t/无自 buff;ModifyProcHit → 链电 +50 flat（_ElectricEel.cs:18-56）', () => {
    expect(TAG_EFFECTS[5478]).toMatchObject({
      kind: 'eel', tagDuration: 240, tagDamage: 12, critChance: 5, playerBuffId: 0,
    });
  });

  it('5479 = WhipTagEffect_Constellation（:1399-1405）：TagDuration=480 全表唯一覆写（:1402）/15 伤/15% crit', () => {
    expect(TAG_EFFECTS[5479]).toMatchObject({ kind: 'constellation', tagDuration: 480, tagDamage: 15, critChance: 15 });
  });

  it('6143 Foxparks 不在表（1457 整条删除,object[36] 无该对;1456 ItemID.cs:1408-1412 才有）', () => {
    expect(TAG_EFFECTS[6143]).toBeUndefined();
  });

  it('5477 花鞭 = ViolentDisplayOfFlower（:1375-1379）：9 伤/无时长覆写 → 240t', () => {
    expect(TAG_EFFECTS[5477]).toMatchObject({ kind: 'flower', tagDuration: 240, tagDamage: 9 });
  });
});

describe('proc 门组（1457 Projectile.cs:13968-14013 switch(type)）', () => {
  it('首鞭门 = {913→4912,1031→5476,1032→5477}（:13970-13977 localAI[0]==0）+ 每鞭 = {847→4678,1033→5478,1035→5480}（:14009-14013 无门）', () => {
    expect([...WHIP_PROC_ITEMS].sort((a, b) => a - b)).toEqual([4678, 4912, 5476, 5477, 5478, 5480]);
  });

  it('首鞭门组 = {4912,5476,5477}（:13970-13977;847/1033/1035 无 localAI[0] 门）', () => {
    expect([...WHIP_PROC_ONCE_ITEMS].sort((a, b) => a - b)).toEqual([4912, 5476, 5477]);
  });

  it('proj→item 映射（Item.cs DefaultToWhip）：847→4678（:38539-38540）/1033→5478（:43180-43182）/1035→5480（:43188-43190）;849（黑收成 4680,:38548-38549）无 case → 不入组', () => {
    expect(WHIP_PROC_ITEMS.has(4680)).toBe(false);   // 849 黑收成走 OnTaggedHit（_DarkHarvest.cs:9-12）
    expect(WHIP_PROC_ITEMS.has(4678)).toBe(true);
    expect(WHIP_PROC_ITEMS.has(5478)).toBe(true);
    expect(WHIP_PROC_ONCE_ITEMS.has(4678)).toBe(false);
    expect(WHIP_PROC_ONCE_ITEMS.has(5478)).toBe(false);
    expect(WHIP_PROC_ONCE_ITEMS.has(5480)).toBe(false);
  });
});

describe('WHIP_FALLOFF（1457 Projectile.cs:13453-13550 Damage_PVE_Inner）', () => {
  it('1034 星鞭 = 0.90（:13545-13547）', () => {
    expect(WHIP_FALLOFF[1034]).toBe(0.90);
  });

  it('全表 18 键与 1457 逐一相等', () => {
    expect(WHIP_FALLOFF).toEqual({
      1104: 0.40,   // :13497-13499
      1028: 0.40,   // :13500-13502
      841: 0.50,    // :13503-13505
      1029: 0.60,   // :13506-13508
      1030: 0.60,   // :13509-13511
      914: 0.60,    // :13512-13514
      1031: 0.70,   // :13515-13517
      952: 0.90,    // :13518-13520
      913: 0.66,    // :13521-13523
      912: 0.70,    // :13524-13526
      847: 0.80,    // :13527-13529
      1032: 0.85,   // :13530-13532
      848: 0.95,    // :13533-13535
      849: 0.90,    // :13536-13538
      1033: 0.95,   // :13539-13541
      915: 0.80,    // :13542-13544
      1034: 0.90,   // :13545-13547
      1035: 0.95,   // :13548-13550
    });
  });
});
