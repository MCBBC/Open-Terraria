// accfx 甲件主属性死键批收偿（2026-09-04 blue-fix，armorStat 大批欠账）。
// 缺口：vanilla-accfx.json 收录的甲件主属性行此前只被配饰槽 3+ 消费环
// （Player.ts accFxOfInternal 配饰循环 + divingHelm 专查）扫到，盔甲三件面全死键。
// 修法：Player.ts equipStats 盔甲三件 [hVid,bVid,lVid] armorStat 环消费 json 数值面
// （mana/life/move/meleeSpd/dmg×3/crit×3/manaCostOff，与配饰链同字段同聚合）；
// 提取器漏标的 manaCost -= X 面已补进 json（11 行,锚 1457 Player.cs GrantArmorBenefits）；
// 召唤面 minionDamage 由 vanillaSummonStats.SUMMON_GEAR 承载（9 件入表）。
// 真值 = Terarria1457/Terraria/Player.cs GrantArmorBenefits if-chain :13557-14052。
// ★件名勘误（ItemID.cs 实名）：4982-4984 = CrystalNinja 水晶忍者套（任务清单误标"日曜"）；
//   真日曜 Solar Flare = 2763-2765；551 = HallowedPlateMail（胸）/552 = Greaves（腿）/
//   553 = Helmet（头,远程档）——三件角色与名字直觉相反,以 decompile 为准。
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { SUMMON_GEAR } from '../src/data/vanillaSummonStats';
import fxJson from '../src/data/vanilla-accfx.json';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const FX = fxJson as unknown as Record<string, Record<string, number>>;

const ARMOR_SLOT: Record<number, 0 | 1 | 2> = {
  // head=0 / body=1 / legs=2（ItemID.cs 实名定位;551 胸、552 腿、553 远程头）
  551: 1, 552: 2, 553: 0, 558: 0, 559: 0,
  4896: 0, 4897: 0, 4898: 0, 4899: 0, 4900: 1, 4901: 2,
  1001: 0, 1002: 0, 1003: 0, 1004: 1, 1005: 2,
  1546: 0, 1547: 0, 1548: 0, 1549: 1, 1550: 2,
  2199: 0, 2200: 1, 2201: 1, 2202: 2,
  2757: 0, 2758: 1, 2759: 2,
  2760: 0, 2761: 1, 2762: 2,
  2763: 0, 2764: 1, 2765: 2,
  4982: 0, 4983: 1, 4984: 2,
  1834: 2,
};

function bareStats() {
  return new Player(0, 0, new Inventory()).equipStats;
}

function withPiece(vid: number) {
  const p = new Player(0, 0, new Inventory());
  p.inv.armor[ARMOR_SLOT[vid]] = { id: iid(vid), stack: 1 };
  return p.equipStats;
}

describe('★armorStat 甲件主属性环（equipStats 盔甲三件消费 vanilla-accfx.json 数值面）', () => {
  const base = bareStats();

  it('叶绿头 1001（ChlorophyteMask）：meleeDamage+0.16/meleeCrit+6（:13744-13748）', () => {
    expect(withPiece(1001).dmgMelee).toBeCloseTo(base.dmgMelee + 0.16);
    expect(withPiece(1001).critMelee).toBe(base.critMelee + 6);
  });

  it('叶绿魔头 1003（ChlorophyteHeadgear）：mana+80/magicDamage+0.16/manaCost−0.17【加算】（:13751-13756）', () => {
    const s = withPiece(1003);
    expect(s.mana).toBe(base.mana + 80);
    expect(s.dmgMagic).toBeCloseTo(base.dmgMagic + 0.16);
    expect(s.manaCostOff).toBeCloseTo(0.17);
  });

  it('叶绿头 1002：dmgRanged+0.16（:13750-13754）;省弹档 chloro 由 ARMOR_AMMO_SAVE_VID 单源（json 无该旗）', () => {
    const s = withPiece(1002);
    expect(s.dmgRanged).toBeCloseTo(base.dmgRanged + 0.16);
    expect(s.ammoSaveChloro).toBe(true);
    expect(FX['1002'].ammoSave).toBeUndefined();   // 提取器漏标档位键,免双计
  });

  it('星旋胸 2758（VortexBreastplate）：dmgRanged+0.12/critRanged+12（:14009-14014）+ ammoCost75 单源', () => {
    const s = withPiece(2758);
    expect(s.dmgRanged).toBeCloseTo(base.dmgRanged + 0.12);
    expect(s.critRanged).toBe(base.critRanged + 12);
    expect(s.ammoSaveCost75).toBe(true);
  });

  it('星云头 2760（NebulaHelmet）：mana+60/magicDamage+0.07/magicCrit+7/manaCost−0.15（:14018-14022）', () => {
    const s = withPiece(2760);
    expect(s.mana).toBe(base.mana + 60);
    expect(s.dmgMagic).toBeCloseTo(base.dmgMagic + 0.07);
    expect(s.critMagic).toBe(base.critMagic + 7);
    expect(s.manaCostOff).toBeCloseTo(0.15);
  });

  it('星云腿 2762（NebulaLeggings）：moveSpeed+0.1/magicDamage+0.1（:14033-14037）', () => {
    const s = withPiece(2762);
    expect(s.moveMult).toBeCloseTo(base.moveMult + 0.1);
    expect(s.dmgMagic).toBeCloseTo(base.dmgMagic + 0.1);
  });

  it('蘑菇矿头 1546（ShroomiteHeadgear）：armorStat 环【跳过】——crit+5/×1.12 由 shroomiteType 单源', () => {
    const s = withPiece(1546);
    expect(s.critRanged).toBe(base.critRanged);          // 不经 accfx 环（免与 :2604 双计）
    expect(s.shroomiteType).toBe('arrow');
  });

  it('蘑菇矿胸 1549（ShroomiteBreastplate）：critRanged+13/dmgRanged+0.13（:13830-13835）+ ammoCost80 单源', () => {
    const s = withPiece(1549);
    expect(s.critRanged).toBe(base.critRanged + 13);
    expect(s.dmgRanged).toBeCloseTo(base.dmgRanged + 0.13);
    expect(s.ammoSaveCost80).toBe(true);
  });

  it('蘑菇矿腿 1550（ShroomiteLeggings）：moveSpeed+0.12/rangedCrit+7（:13837-13841）', () => {
    const s = withPiece(1550);
    expect(s.moveMult).toBeCloseTo(base.moveMult + 0.12);
    expect(s.critRanged).toBe(base.critRanged + 7);
  });

  it('甲虫胸 2200（BeetleScaleMail）：meleeDamage+0.08/crit+8/meleeSpeed+0.06/move+0.06（:13926-13932）', () => {
    const s = withPiece(2200);
    expect(s.dmgMelee).toBeCloseTo(base.dmgMelee + 0.08);
    expect(s.critMelee).toBe(base.critMelee + 8);
    expect(s.meleeSpeed).toBeCloseTo(base.meleeSpeed + 0.06);
    expect(s.moveMult).toBeCloseTo(base.moveMult + 0.06);
  });

  it('甲虫头 2199（BeetleHelmet）：meleeDamage+0.06（:13921-13923;aggro+250 走 AGGRO_ARMOR_PIECE 单源）', () => {
    expect(withPiece(2199).dmgMelee).toBeCloseTo(base.dmgMelee + 0.06);
  });

  it('神圣腿 552（HallowedGreaves）：dmg×3+0.07/move+0.08（:13713-13720）+ minionDamage+0.07（SUMMON_GEAR 承载）', () => {
    const s = withPiece(552);
    expect(s.dmgMelee).toBeCloseTo(base.dmgMelee + 0.07);
    expect(s.dmgRanged).toBeCloseTo(base.dmgRanged + 0.07);
    expect(s.dmgMagic).toBeCloseTo(base.dmgMagic + 0.07);
    expect(s.moveMult).toBeCloseTo(base.moveMult + 0.08);
    expect(s.minionDmg).toBeCloseTo(base.minionDmg + 0.07);
  });

  it('神圣胸 551（HallowedPlateMail）：三系 crit+7（:13707-13712）;远程头 553（Helmet）：dmgRanged+0.15/crit+8（:13697-13701）', () => {
    const s = withPiece(551);
    expect(s.critMelee).toBe(base.critMelee + 7);
    expect(s.critRanged).toBe(base.critRanged + 7);
    expect(s.critMagic).toBe(base.critMagic + 7);
    const h = withPiece(553);
    expect(h.dmgRanged).toBeCloseTo(base.dmgRanged + 0.15);
    expect(h.critRanged).toBe(base.critRanged + 8);
  });

  it('远古神圣 4901（腿）≡ 552 全值（:13713 同 case）;4896（头）≡ 559（:13691-13696）', () => {
    const a = withPiece(4901);
    expect(a.moveMult).toBeCloseTo(base.moveMult + 0.08);
    expect(a.minionDmg).toBeCloseTo(base.minionDmg + 0.07);
    const m = withPiece(4896);
    expect(m.dmgMelee).toBeCloseTo(base.dmgMelee + 0.1);
    expect(m.meleeSpeed).toBeCloseTo(base.meleeSpeed + 0.1);
    expect(m.critMelee).toBe(base.critMelee + 10);
  });

  it('水晶忍者头 4982（CrystalNinjaHelmet）：三系 crit+5/manaCost−0.1【加算】（:13721-13726）', () => {
    const s = withPiece(4982);
    expect(s.critMelee).toBe(base.critMelee + 5);
    expect(s.critRanged).toBe(base.critRanged + 5);
    expect(s.critMagic).toBe(base.critMagic + 5);
    expect(s.manaCostOff).toBeCloseTo(0.1);
  });

  it('水晶忍者腿 4984（CrystalNinjaLeggings）：meleeSpeed+0.1/move+0.2（:13738-13742）', () => {
    const s = withPiece(4984);
    expect(s.meleeSpeed).toBeCloseTo(base.meleeSpeed + 0.1);
    expect(s.moveMult).toBeCloseTo(base.moveMult + 0.2);
  });

  it('日曜头 2763（SolarFlareHelmet,★真日曜）：meleeCrit+26/lifeRegen+2 → hpPerSec+1（:13987-13992）', () => {
    const s = withPiece(2763);
    expect(s.critMelee).toBe(base.critMelee + 26);
    expect(s.hpPerSec).toBeCloseTo(base.hpPerSec + 1);
  });

  it('诡异腿 1834：moveMult +0.2 恰一次（SUMMON_GEAR 单源,armorStat 环字段级优先记 0 免双计;:14045-14050）', () => {
    expect(withPiece(1834).moveMult).toBeCloseTo(base.moveMult + 0.2);
  });

  it('对照件（负门）：407 工具腰带等非甲件 vid 不在本环——甲件环只读 [hVid,bVid,lVid]', () => {
    // 配饰槽照旧走配饰环:同样 551 头盔位(553 远程头)不误入——三件环只吃甲件槽 vid
    const s = withPiece(1001);
    expect(s.hpPerSec).toBeCloseTo(base.hpPerSec);          // 1001 无 life 面
    expect(s.sentrySlots).toBe(base.sentrySlots);           // 无召唤面甲不触 sumFx sentry
  });
});

describe('★数据面金标（json 行值 ≡ 1457 decompile;提取器漏标面已补）', () => {
  it('manaCostOff 补齐 12 行（4982/1003/2760/2189/1282-1287/4256/2279,行号见注释）', () => {
    expect(FX['4982'].manaCostOff).toBeCloseTo(0.1);    // :13726
    expect(FX['1003'].manaCostOff).toBeCloseTo(0.17);   // :13755
    expect(FX['2760'].manaCostOff).toBeCloseTo(0.15);   // :14021
    expect(FX['2189'].manaCostOff).toBeCloseTo(0.13);   // :13782
    expect(FX['1282'].manaCostOff).toBeCloseTo(0.05);   // :13825
    expect(FX['1283'].manaCostOff).toBeCloseTo(0.07);   // :13830
    expect(FX['1284'].manaCostOff).toBeCloseTo(0.09);   // :13835
    expect(FX['1285'].manaCostOff).toBeCloseTo(0.11);   // :13840
    expect(FX['1286'].manaCostOff).toBeCloseTo(0.13);   // :13845
    expect(FX['4256'].manaCostOff).toBeCloseTo(0.13);   // :13845 同 case
    expect(FX['1287'].manaCostOff).toBeCloseTo(0.15);   // :13850
    expect(FX['2279'].manaCostOff).toBeCloseTo(0.1);    // :13406 吉普赛长袍 GypsyRobe
  });

  it('SUMMON_GEAR 甲件 minionDamage 面十二件（1457 if-chain 实读,提取器不覆盖 minionDamage 模式）', () => {
    expect(SUMMON_GEAR[403]).toMatchObject({ dmg: 0.08 });    // :13567
    expect(SUMMON_GEAR[552]).toMatchObject({ dmg: 0.07 });    // :13713
    expect(SUMMON_GEAR[4901]).toMatchObject({ dmg: 0.07 });   // :13713
    expect(SUMMON_GEAR[1004]).toMatchObject({ dmg: 0.05 });   // :13762
    expect(SUMMON_GEAR[1208]).toMatchObject({ dmg: 0.03 });   // :13597
    expect(SUMMON_GEAR[1209]).toMatchObject({ dmg: 0.02 });   // :13607
    expect(SUMMON_GEAR[1214]).toMatchObject({ dmg: 0.08 });   // :13639
    expect(SUMMON_GEAR[1218]).toMatchObject({ dmg: 0.04 });   // :13664
    expect(SUMMON_GEAR[1219]).toMatchObject({ dmg: 0.03 });   // :13674
    expect(SUMMON_GEAR[792]).toMatchObject({ dmg: 0.03 });    // :13470 三件共支
    expect(SUMMON_GEAR[375]).toMatchObject({ dmg: 0.03 });    // :13511
    expect(SUMMON_GEAR[379]).toMatchObject({ dmg: 0.07 });    // :13534
  });

  it('甲件环/单源互斥不变式：SUMMON_GEAR 已覆盖字段与 accfx 行【同值】（3776/3777/3778/1834;armorStat 环字段级优先记 0 免双计）', () => {
    const FACES = ['mana', 'life', 'move', 'meleeSpd', 'dmgMelee', 'dmgRanged', 'dmgMagic', 'dmgAll', 'critMelee', 'critRanged', 'critMagic', 'manaCostOff'] as const;
    for (const [k, row] of Object.entries(FX)) {
      const sg = SUMMON_GEAR[Number(k)];
      if (!sg) continue;
      for (const f of FACES) {
        if (row[f] !== undefined && (sg as unknown as Record<string, number | undefined>)[f] !== undefined) {
          expect(row[f], `accfx[${k}].${f} ≡ SUMMON_GEAR[${k}].${f}`).toBeCloseTo((sg as unknown as Record<string, number>)[f]);
        }
      }
    }
  });
});
