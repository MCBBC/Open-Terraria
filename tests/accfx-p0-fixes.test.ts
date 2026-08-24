// 配饰审计 P0 修复批（2026-08-22，docs/audit/item-audit-2026-08-22.md「配饰类道具审计」）：
// 钓鱼族四件断链 / 1322·1343 点燃 / 3223 闪避 / 魔力四件 mana 40 / 2998+935·1301·3015 召唤伤 /
// 圣骑士盾族免击退+冰障 / 单件批（485/900/953/975/3224/223/3090/1923/3619/3624/5107/lavaRose 族）。
// 数值基准 1457（Terarria1457/）：魔力四件 111/982/1595/2221 mana=40（Player.cs:15030-15047
// switch 终值；旧 1456 钉 20/25 已随 2026-08-23 基准切换反转），其余配饰数值两版同值。
import { describe, it, expect } from 'vitest';
import { accFxOfInternal } from '../src/data/vanillaAccFx';
import { SUMMON_GEAR } from '../src/data/vanillaSummonStats';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { npcNoAggroActive } from '../src/entities/Enemy';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

describe('配饰审计 P0：钓鱼族四件断链（Bobber equipStats.fishingTackle/lavaFishing）', () => {
  it('accfx 数据：2374 钓技10（无钓具箱旗）/ 2375 钓具箱 / 3721 箱+钓技 / 4881 岩浆钓 / 5064 全有（:14111-14141）', () => {
    expect(accFxOfInternal(_iid(2374))).toMatchObject({ fish: 10 });
    expect(accFxOfInternal(_iid(2374))?.fishingTackle).toBeUndefined();  // 耳环不进饵耗族
    expect(accFxOfInternal(_iid(2375))).toMatchObject({ fishingTackle: 1 });
    expect(accFxOfInternal(_iid(3721))).toMatchObject({ fishingTackle: 1, fish: 10 });
    expect(accFxOfInternal(_iid(4881))).toMatchObject({ lavaFishing: 1 });
    expect(accFxOfInternal(_iid(5064))).toMatchObject({ fishingTackle: 1, lavaFishing: 1, fish: 10 });
  });

  it('equipStats 聚合：5064 → fishingTackle+lavaFishing+fishingSkill+10；2374 → 仅钓技', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(5064), stack: 1 };
    expect(p.equipStats.fishingTackle).toBe(true);
    expect(p.equipStats.lavaFishing).toBe(true);
    expect(p.equipStats.fishingSkill).toBe(10);
    p.inv.armor[3] = { id: _iid(2374), stack: 1 };
    expect(p.equipStats.fishingTackle).toBe(false);
    expect(p.equipStats.fishingSkill).toBe(10);
    p.inv.armor[3] = { id: _iid(4881), stack: 1 };
    expect(p.equipStats.lavaFishing).toBe(true);
    expect(p.equipStats.fishingSkill).toBe(0);   // 4881 无钓技（:14127-14129）
  });
});

describe('配饰审计 P0：近战点燃与闪避断链', () => {
  it('1322 岩浆石 / 1343 烈火手套 → equipStats.magmaStone（Game.applyMagmaStoneSwing 消费端）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(1322), stack: 1 };
    expect(p.equipStats.magmaStone).toBe(true);
    p.inv.armor[3] = { id: _iid(1343), stack: 1 };
    expect(p.equipStats.magmaStone).toBe(true);
  });

  it('3223 混乱之脑 → equipStats.boc（Player.ts 受击 1/6 闪避消费端）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.equipStats.boc).toBe(false);
    p.inv.armor[3] = { id: _iid(3223), stack: 1 };
    expect(p.equipStats.boc).toBe(true);
  });
});

describe('配饰审计 P0：魔力四件 statManaMax2（★1457 基准 Player.cs:15030-15048；旧 1456 钉 20/25 已反转）', () => {
  it('accfx 记 mana 40（111/982/1595/2221；1457 :15034/:15042 num=40）', () => {
    for (const vid of [111, 982, 1595, 2221]) {
      expect(accFxOfInternal(_iid(vid))?.mana, `vid ${vid}`).toBe(40);
    }
  });

  it('982 魔力再生手环：equipStats.mana 40 + manaRegenBonus 60,delayBonus 恒 0（★1458 :15037-15046 已删 delayBonus++,数据面 vanilla-accfx 三键同步删,与 6188/6189 同档）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(982), stack: 1 };
    expect(p.equipStats.mana).toBe(40);
    expect(p.equipStats.manaRegenBonus).toBe(60);
    expect(p.equipStats.manaRegenDelayBonus).toBe(0);
  });
});

describe('配饰审计 P0：召唤伤通道', () => {
  it('2998 召唤徽章入 SUMMON_GEAR：minionDmg +0.15（:14891-14894）', () => {
    expect(SUMMON_GEAR[2998]).toMatchObject({ dmg: 0.15 });
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(2998), stack: 1 };
    expect(p.equipStats.minionDmg).toBeCloseTo(0.15);
  });

  it('935/1301/3015 accfx dmgMinion +12%/+10%/+5%（:14900/:14431/:14105）', () => {
    expect(accFxOfInternal(_iid(935))).toMatchObject({ dmgMinion: 0.12 });
    expect(accFxOfInternal(_iid(1301))).toMatchObject({ dmgMinion: 0.1 });
    expect(accFxOfInternal(_iid(3015))).toMatchObject({ dmgMinion: 0.05 });
    const p = new Player(0, 0, new Inventory());
    for (const [vid, dmg] of [[935, 0.12], [1301, 0.1], [3015, 0.05]] as const) {
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      expect(p.equipStats.minionDmg, `vid ${vid}`).toBeCloseTo(dmg);
    }
  });
});

describe('配饰审计 P0：圣骑士盾族 938/3997/3998 + 冰障', () => {
  it('三件免击退（:14800 noKnockback）', () => {
    const p = new Player(0, 0, new Inventory());
    for (const vid of [938, 3997, 3998]) {
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      expect(p.equipStats.noKnockback, `vid ${vid}`).toBe(true);
    }
  });

  it('1253/3997 → iceBarrierAcc（:14348-14351 半血挂 buff 62；3998 无此旗）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(1253), stack: 1 };
    expect(p.equipStats.iceBarrierAcc).toBe(true);
    p.inv.armor[3] = { id: _iid(3997), stack: 1 };
    expect(p.equipStats.iceBarrierAcc).toBe(true);
    expect(p.equipStats.noKnockback).toBe(true);   // 3997 兼圣骑士盾族
    p.inv.armor[3] = { id: _iid(3998), stack: 1 };
    expect(p.equipStats.iceBarrierAcc).toBe(false);
  });
});

describe('配饰审计 P0：单件批', () => {
  it('485 月光护身符 → wolfAcc（BEHAVIOR_FX 补裸件 :14633-14640）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(485), stack: 1 };
    expect(p.equipStats.wolfAcc).toBe(true);
  });

  it('900 月亮石夜/日食档天界石复合（:14871-14874）+ nightPhase 进 equipStats 键', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(900), stack: 1 };
    p.nightPhase = false;
    expect(p.equipStats.def).toBe(0);            // 白天档不授
    p.nightPhase = true;
    expect(p.equipStats.def).toBe(4);            // skyStone 复合 def+4（:12558-12570）
    expect(p.equipStats.mana).toBe(0);
  });

  it('953 攀爬爪 / 975 鞋钉 → spikedBoots（:14489-14496 各 +1）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(953), stack: 1 };
    expect(p.equipStats.spikedBoots).toBe(true);
    p.inv.armor[3] = { id: _iid(975), stack: 1 };
    expect(p.equipStats.spikedBoots).toBe(true);
  });

  it('3224 蠕虫围巾 endurance +0.17（:14532-14535 → enduranceEq 消费通道）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(3224), stack: 1 };
    expect(p.equipStats.enduranceEq).toBeCloseTo(0.17);
  });

  it('223 大自然的恩赐耗魔 -6% 加算（:14561-14563）；与魔力花 555 叠加 = 0.14', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(223), stack: 1 };
    expect(p.equipStats.manaCostOff).toBeCloseTo(0.06);
    p.inv.armor[4] = { id: _iid(555), stack: 1 };
    expect(p.equipStats.manaCostOff).toBeCloseTo(0.14);   // 花 0.08 + 恩赐 0.06（加算非乘）
  });

  it('3090 皇家凝胶 → royalGel 进 npcNoAggroActive 索敌门（:14144-14168）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(npcNoAggroActive(p)).toBe(false);
    p.inv.armor[3] = { id: _iid(3090), stack: 1 };
    expect(p.equipStats.royalGel).toBe(true);
    expect(npcNoAggroActive(p)).toBe(true);
  });

  it('1923 工具箱 toolboxRange +1（:14405-14408，与 2215 族 +3/+2 分通道叠加）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(1923), stack: 1 };
    expect(p.equipStats.toolboxRange).toBe(1);
    p.inv.armor[4] = { id: _iid(2215), stack: 1 };
    expect(p.equipStats.tileRange).toBe(true);
    expect(p.equipStats.toolboxRange).toBe(1);   // 两通道并存（Game.tileReach 相加）
  });

  it('机械三件：3619 透镜 mechShowWires / 3624 加压器 autoActuator（5107 荧光体地面加速旗）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(3619), stack: 1 };
    expect(p.equipStats.mechShowWires).toBe(true);
    p.inv.armor[3] = { id: _iid(3624), stack: 1 };
    expect(p.equipStats.autoActuator).toBe(true);
    p.inv.armor[3] = { id: _iid(5107), stack: 1 };
    expect(p.equipStats.magiluminescence).toBe(true);
  });

  it('lavaRose 族五件（1323/908/4003/4004/5000 → :27384-27387 岩浆伤 80→35/OnFire 210）', () => {
    for (const vid of [1323, 908, 4003, 4004, 5000]) {
      expect(accFxOfInternal(_iid(vid))?.lavaRose, `vid ${vid}`).toBe(1);
    }
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(1323), stack: 1 };
    expect(p.equipStats.lavaRose).toBe(true);
  });
});
