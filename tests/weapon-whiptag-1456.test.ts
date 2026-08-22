// 鞭 tag 表 1456 化锚（审计修复批）：表数据 / proc 门组 / falloff 对拍 1456 反编译。
//  权威：Terarria1456 Terraria.ID/ItemID.cs:1301-1413（UniqueTagEffects object[38]）+
//  Terraria/Projectile.cs:12598-12679（多目标 falloff）/ :12932-12981（proc switch）+
//  Terraria.GameContent.Items/WhipTagEffect.cs:17-22（TagDuration 缺省 240,全表无覆写）
import { describe, it, expect } from 'vitest';
import {
  TAG_EFFECTS, WHIP_PROC_ITEMS, WHIP_PROC_ONCE_ITEMS, WHIP_FALLOFF,
} from '../src/entities/WhipTag';

describe('鞭 tag 表 1456 化（ItemID.cs:1301-1413）', () => {
  it('全表 19 条（object[38] = 19 对,:1301）', () => {
    expect(Object.keys(TAG_EFFECTS).length).toBe(19);
  });

  it('4678 = 基类 WhipTagEffect（:1356-1362）：9 伤/buff 308×180/240t——1457 swordwhip(MegaSlash +30+916) 退役', () => {
    expect(TAG_EFFECTS[4678]).toMatchObject({
      kind: 'base', tagDuration: 240, tagDamage: 9, critChance: 0,
      playerBuffId: 308, playerBuffTime: 180, playerBuffAppliedManually: false,
    });
  });

  it('5478 = 基类（:1381-1387）：12 伤/5% crit/240t/无自 buff——1457 eel(链电 +50 flat) 退役;NetSync=true（:1386）仅 MP 位', () => {
    expect(TAG_EFFECTS[5478]).toMatchObject({
      kind: 'base', tagDuration: 240, tagDamage: 12, critChance: 5, playerBuffId: 0,
    });
  });

  it('5479 = 基类缺省 240t（:1388-1393;WhipTagEffect.cs:19-22）——1457 的 480 覆写退役', () => {
    expect(TAG_EFFECTS[5479]).toMatchObject({ tagDuration: 240, tagDamage: 15, critChance: 15 });
  });

  it('6143 Foxparks 在表（:1408-1412）：基类 4 伤/240t（1457 整条删除,1456 在）', () => {
    expect(TAG_EFFECTS[6143]).toMatchObject({ kind: 'base', tagDuration: 240, tagDamage: 4, critChance: 0 });
  });

  it('5477 花鞭 = ViolentDisplayOfFlower（:1363-1367）：9 伤/无时长覆写 → 240t', () => {
    expect(TAG_EFFECTS[5477]).toMatchObject({ kind: 'flower', tagDuration: 240, tagDamage: 9 });
  });
});

describe('proc 门组（1456 Projectile.cs:12932-12981 switch(type)）', () => {
  it('proc 启用 = {913→4912,1031→5476,1032→5477}（首鞭门 :12934-12942）+ {1035→5480}（每鞭 :12972-12974）', () => {
    expect([...WHIP_PROC_ITEMS].sort((a, b) => a - b)).toEqual([4912, 5476, 5477, 5480]);
  });

  it('首鞭门组 = {4912,5476,5477}（localAI[0]==0 才 TryEnableProc :12934-12942;1035 无门）', () => {
    expect([...WHIP_PROC_ONCE_ITEMS].sort((a, b) => a - b)).toEqual([4912, 5476, 5477]);
  });

  it('847/1033 无 case（:12932-12981）→ 4680/5478 不在门组（847 黑收成走 OnTaggedHit,WhipTagEffect_DarkHarvest.cs:9-12）', () => {
    expect(WHIP_PROC_ITEMS.has(4680)).toBe(false);
    expect(WHIP_PROC_ITEMS.has(5478)).toBe(false);
    expect(WHIP_PROC_ONCE_ITEMS.has(4680)).toBe(false);
    expect(WHIP_PROC_ONCE_ITEMS.has(5478)).toBe(false);
  });
});

describe('WHIP_FALLOFF（1456 Projectile.cs:12598-12679）', () => {
  it('1034 星鞭 = 0.90（:12674-12676）', () => {
    expect(WHIP_FALLOFF[1034]).toBe(0.90);
  });

  it('全表 18 键与 1456 逐一相等', () => {
    expect(WHIP_FALLOFF).toEqual({
      1104: 0.40,   // :12626-12628
      1028: 0.40,   // :12629-12631
      841: 0.50,    // :12632-12634
      1029: 0.60,   // :12635-12637
      1030: 0.60,   // :12638-12640
      914: 0.60,    // :12641-12643
      1031: 0.70,   // :12644-12646
      952: 0.90,    // :12647-12649
      913: 0.66,    // :12650-12652
      912: 0.70,    // :12653-12655
      847: 0.80,    // :12656-12658
      1032: 0.85,   // :12659-12661
      848: 0.95,    // :12662-12664
      849: 0.90,    // :12665-12667
      1033: 0.95,   // :12668-12670
      915: 0.80,    // :12671-12673
      1034: 0.90,   // :12674-12676
      1035: 0.95,   // :12677-12679
    });
  });
});
