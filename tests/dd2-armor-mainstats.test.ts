// DD2 盔甲散件主属性接线锁定（2026-09-03 批，退役 vanillaSummonStats 旧注"armorStat 大批,登记未接"）。
// 数值真值 = Terarria1457/Terraria/Player.cs GrantArmorBenefits case 实读：
//   头盔面 3797/3800/3803/3806（:13231/:13245/:13271/:13258）+ T3 3871/3874/3877/3880
//   （:13284/:13298/:13313/:13328）→ vanillaSummonStats.SUMMON_GEAR 扩展字段（sumFx 消费）；
//   胸/腿面 3798-3882（:13236-13342）→ vanillaArmorSets.DD2_PIECE_FX（Player.ts 盔甲三件环消费）；
//   禁戒 3776-3778（:13368-13384）/诡异 1834（:14045-14050）→ SUMMON_GEAR（accfx 消费环
//   只扫配饰槽 3+，其 json 甲件行是死键，盔甲面由本表承载）。
// 耗魔语义：原版 Player.manaCost 单浮点【加算】折扣（:13233 manaCost-=0.1f/:13306 -=0.15f）
//   → manaCostOff 池（禁用乘区：0.9×0.85=0.765 ≠ 原版 1−0.1−0.15=0.75）。
// lifeRegen 语义：120 单位/tick 累计 1HP（:19383-19407）→ equipStats.hpPerSec = N/2。
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { SUMMON_GEAR } from '../src/data/vanillaSummonStats';
import { DD2_PIECE_FX } from '../src/data/vanillaArmorSets';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

const ARMOR_SLOT: Record<number, 0 | 1 | 2> = {
  3797: 0, 3800: 0, 3803: 0, 3806: 0, 3871: 0, 3874: 0, 3877: 0, 3880: 0,
  3801: 1, 3804: 1, 3807: 1, 3872: 1, 3875: 1, 3878: 1, 3777: 1,
  3778: 2, 1834: 2, 3776: 0,
  2361: 0, 2362: 1, 2363: 2, 2370: 0, 2371: 1, 2372: 2, 3266: 0, 3267: 1, 3268: 2,
};

/** 裸玩家基线（对照件——任何散件主属性都必须相对基线变化） */
function bareStats() {
  const p = new Player(0, 0, new Inventory());
  return p.equipStats;
}

/** 单件穿装（按甲件槽位），读 equipStats */
function withPiece(vid: number) {
  const p = new Player(0, 0, new Inventory());
  p.inv.armor[ARMOR_SLOT[vid]] = { id: iid(vid), stack: 1 };
  return p.equipStats;
}

/** 非召唤面主属性通道全零断言（相对基线无变化 = 该件原版无散件主属性） */
function expectNoMainStats(s: ReturnType<typeof bareStats>, base: ReturnType<typeof bareStats>): void {
  expect(s.manaCostOff).toBeCloseTo(base.manaCostOff);
  expect(s.hpPerSec).toBeCloseTo(base.hpPerSec);
  expect(s.dmgMelee).toBeCloseTo(base.dmgMelee);
  expect(s.dmgRanged).toBeCloseTo(base.dmgRanged);
  expect(s.dmgMagic).toBeCloseTo(base.dmgMagic);
  expect(s.critRanged).toBe(base.critRanged);
  expect(s.meleeSpeed).toBeCloseTo(base.meleeSpeed);
  expect(s.mana).toBe(base.mana);
  expect(s.moveMult).toBeCloseTo(base.moveMult);
}

describe('DD2 T2 头盔散件主属性（SUMMON_GEAR 扩展字段 → sumFx 盔甲扫描）', () => {
  const base = bareStats();

  it('3797 学徒帽 T2：sentry+1 / manaCost−0.1【加算】/ magicDamage+0.1（:13231-13235）', () => {
    expect(SUMMON_GEAR[3797]).toMatchObject({ sentry: 1, manaCostOff: 0.1, dmgMagic: 0.1 });
    const s = withPiece(3797);
    expect(s.sentrySlots).toBe(base.sentrySlots + 1);
    expect(s.manaCostOff).toBeCloseTo(0.1);
    expect(s.manaCostMul).toBe(1);            // 走加算池,不吃乘区
    expect(s.dmgMagic).toBeCloseTo(0.1);
    expect(s.dmgMelee).toBeCloseTo(0);        // 原版无近战伤（蓝队对照）
    expect(s.critRanged).toBe(0);
  });

  it('3800 侍从头盔 T2：sentry+1 / lifeRegen+4 → hpPerSec+2（:13245-13248,120 单位/tick 语义）', () => {
    expect(SUMMON_GEAR[3800]).toMatchObject({ sentry: 1, lifeRegen: 4 });
    const s = withPiece(3800);
    expect(s.sentrySlots).toBe(1);
    expect(s.hpPerSec).toBeCloseTo(base.hpPerSec + 2);
  });

  it('3803 女猎手头巾 T2：sentry+1 / rangedCrit+10（:13271-13274）', () => {
    expect(SUMMON_GEAR[3803]).toMatchObject({ sentry: 1, critRanged: 10 });
    const s = withPiece(3803);
    expect(s.sentrySlots).toBe(1);
    expect(s.critRanged).toBe(base.critRanged + 10);
  });

  it('3806 武僧头带 T2：sentry+1 / meleeSpeed+0.2（:13258-13261）', () => {
    expect(SUMMON_GEAR[3806]).toMatchObject({ sentry: 1, meleeSpeed: 0.2 });
    const s = withPiece(3806);
    expect(s.sentrySlots).toBe(1);
    expect(s.meleeSpeed).toBeCloseTo(base.meleeSpeed + 0.2);
  });
});

describe('DD2 T3 头盔散件主属性（近战/魔法/远程暴各归各链；召唤伤已接位保留）', () => {
  const base = bareStats();

  it('3871 侍从巨盔 T3：sentry+2 / meleeDamage+0.1 与 minionDamage+0.1 同值（:13284-13288）', () => {
    expect(SUMMON_GEAR[3871]).toMatchObject({ sentry: 2, dmg: 0.10, dmgMelee: 0.10 });
    const s = withPiece(3871);
    expect(s.sentrySlots).toBe(2);
    expect(s.minionDmg).toBeCloseTo(0.1);
    expect(s.dmgMelee).toBeCloseTo(0.1);      // 近战与召唤同值（实读核实）
    expect(s.dmgMagic).toBeCloseTo(0);
  });

  it('3874 学徒战斗帽 T3：sentry+2 / magicDamage+0.15 / minionDamage+0.15（:13298-13302）', () => {
    expect(SUMMON_GEAR[3874]).toMatchObject({ sentry: 2, dmg: 0.15, dmgMagic: 0.15 });
    const s = withPiece(3874);
    expect(s.sentrySlots).toBe(2);
    expect(s.minionDmg).toBeCloseTo(0.15);
    expect(s.dmgMagic).toBeCloseTo(0.15);
  });

  it('3877 女猎手服 T3：sentry+2 / minionDamage+0.1 / rangedCrit+10（:13313-13317）', () => {
    expect(SUMMON_GEAR[3877]).toMatchObject({ sentry: 2, dmg: 0.10, critRanged: 10 });
    const s = withPiece(3877);
    expect(s.sentrySlots).toBe(2);
    expect(s.minionDmg).toBeCloseTo(0.1);
    expect(s.critRanged).toBe(10);
  });

  it('3880 武僧束发 T3：sentry+2 / minionDamage+0.2 / meleeDamage+0.2（:13328-13332）', () => {
    expect(SUMMON_GEAR[3880]).toMatchObject({ sentry: 2, dmg: 0.20, dmgMelee: 0.20 });
    const s = withPiece(3880);
    expect(s.sentrySlots).toBe(2);
    expect(s.minionDmg).toBeCloseTo(0.2);
    expect(s.dmgMelee).toBeCloseTo(0.2);
  });
});

describe('DD2 胸/腿件主属性（DD2_PIECE_FX 对账批：补近战/远程伤、再生、耗魔加算）', () => {
  const base = bareStats();

  it('3801 侍从旧护甲 T2：meleeDamage+0.15（:13249-13252——此前缺）', () => {
    expect(DD2_PIECE_FX[3801]).toMatchObject({ dmgMelee: 0.15, dmgMinion: 0.15 });
    const s = withPiece(3801);
    expect(s.dmgMelee).toBeCloseTo(0.15);
    expect(s.minionDmg).toBeCloseTo(0.15);
  });

  it('3804 女猎手护甲 T2：rangedDamage+0.2（:13275-13279——此前缺）+ 省弹 1/10 走直表', () => {
    expect(DD2_PIECE_FX[3804]).toMatchObject({ dmgRanged: 0.2, dmgMinion: 0.2 });
    const s = withPiece(3804);
    expect(s.dmgRanged).toBeCloseTo(0.2);
    expect(s.minionDmg).toBeCloseTo(0.2);
    expect(s.ammoSaveHuntress).toBe(true);    // huntressAmmoCost90（:13278）
  });

  it('3807 武僧护甲 T2：meleeDamage+0.2（:13262-13265——此前缺）', () => {
    expect(DD2_PIECE_FX[3807]).toMatchObject({ dmgMelee: 0.2, dmgMinion: 0.2 });
    const s = withPiece(3807);
    expect(s.dmgMelee).toBeCloseTo(0.2);
    expect(s.minionDmg).toBeCloseTo(0.2);
  });

  it('3872 侍从旧护甲 T3：lifeRegen+8 → hpPerSec+4（:13289-13292——此前缺）', () => {
    expect(DD2_PIECE_FX[3872]).toMatchObject({ dmgMinion: 0.3, lifeRegen: 8 });
    const s = withPiece(3872);
    expect(s.minionDmg).toBeCloseTo(0.3);
    expect(s.hpPerSec).toBeCloseTo(base.hpPerSec + 4);
  });

  it('3875 学徒长袍 T3：minion+0.25/magic+0.1/manaCost−0.15【加算】（:13303-13307,旧乘区 0.85 退役）', () => {
    expect(DD2_PIECE_FX[3875]).toMatchObject({ dmgMinion: 0.25, dmgMagic: 0.1, manaCostOff: 0.15 });
    const s = withPiece(3875);
    expect(s.minionDmg).toBeCloseTo(0.25);
    expect(s.dmgMagic).toBeCloseTo(0.1);
    expect(s.manaCostOff).toBeCloseTo(0.15);
    expect(s.manaCostMul).toBe(1);
  });

  it('3878 女猎手 T3 胸件：minionDmg 恰 +0.25（双记回归锁）+ rangedDamage+0.25（:13318-13322）', () => {
    expect(SUMMON_GEAR[3878]).toBeUndefined();  // 旧 SUMMON_GEAR 条目退役（曾与 DD2_PIECE_FX 同值双记 → +0.5）
    expect(DD2_PIECE_FX[3878]).toMatchObject({ dmgMinion: 0.25, dmgRanged: 0.25, ammoCost80: true });
    const s = withPiece(3878);
    expect(s.minionDmg).toBeCloseTo(0.25);      // ≠ 0.5
    expect(s.dmgRanged).toBeCloseTo(0.25);
    expect(s.ammoSaveCost80).toBe(true);
  });

  it('3797+3875 并戴：耗魔加算 1−0.1−0.15=0.75（禁乘区回归锁 0.9×0.85=0.765）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[0] = { id: iid(3797), stack: 1 };
    p.inv.armor[1] = { id: iid(3875), stack: 1 };
    const s = p.equipStats;
    expect(s.manaCostOff).toBeCloseTo(0.25);
    expect(s.manaCostMul).toBe(1);
    expect(s.dmgMagic).toBeCloseTo(0.2);        // 0.1（头）+0.1（胸）
  });
});

describe('禁戒/诡异散件主属性（accfx 甲件死键改由 SUMMON_GEAR 承载）', () => {
  const base = bareStats();

  it('3776 禁戒面具：magicDamage+0.15（:13368-13372——旧注"accfx 主链管"系死链）', () => {
    expect(SUMMON_GEAR[3776]).toMatchObject({ dmg: 0.15, dmgMagic: 0.15 });
    const s = withPiece(3776);
    expect(s.dmgMagic).toBeCloseTo(0.15);
    expect(s.minionDmg).toBeCloseTo(0.15);
  });

  it('3777 禁戒长袍：statManaMax2+40（:13373-13378）', () => {
    expect(SUMMON_GEAR[3777]).toMatchObject({ slot: 1, dmg: 0.10, mana: 40 });
    const s = withPiece(3777);
    expect(s.mana).toBe(base.mana + 40);
    expect(s.minionSlots).toBe(1);
    expect(s.minionDmg).toBeCloseTo(0.1);
  });

  it('3778 禁戒裤：statManaMax2+40 / magicDamage+0.1（:13379-13384）', () => {
    expect(SUMMON_GEAR[3778]).toMatchObject({ slot: 1, mana: 40, dmgMagic: 0.10 });
    const s = withPiece(3778);
    expect(s.mana).toBe(base.mana + 40);
    expect(s.dmgMagic).toBeCloseTo(0.1);
    expect(s.minionSlots).toBe(1);
  });

  it('1834 诡异护腿：moveSpeed+0.2 → moveMult 1.2（:14045-14050）', () => {
    expect(SUMMON_GEAR[1834]).toMatchObject({ slot: 1, dmg: 0.11, move: 0.2 });
    const s = withPiece(1834);
    expect(s.moveMult).toBeCloseTo(base.moveMult + 0.2);
    expect(s.minionSlots).toBe(1);
    expect(s.minionDmg).toBeCloseTo(0.11);
  });
});

describe('蜂/蜘蛛/黑曜核实（原版仅召唤面——非召唤通道必须全零）', () => {
  it('2361-2363 / 2370-2372 / 3266-3268（:13918-13943/:13960-13969 实读无散件主属性）', () => {
    const base = bareStats();
    for (const vid of [2361, 2362, 2363, 2370, 2371, 2372, 3266, 3267, 3268]) {
      const s = withPiece(vid);
      expectNoMainStats(s, base);
    }
    // 召唤面本身不回退（抽查三件）
    expect(withPiece(2361).minionDmg).toBeCloseTo(0.04);
    expect(withPiece(2361).minionSlots).toBe(1);
    expect(withPiece(3268).minionDmg).toBeCloseTo(0.08);
    expect(withPiece(2372).minionSlots).toBe(1);
  });
});

describe('equipStats 记忆化键覆盖（盔甲槽 id 变更必须失效重算——无需扩键）', () => {
  it('3797 → 空头 → 3871 同一 getter 读数逐帧正确（内容键,armor[0..19] id+prefix 在键内）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.equipStats.sentrySlots).toBe(0);
    p.inv.armor[0] = { id: iid(3797), stack: 1 };
    expect(p.equipStats.sentrySlots).toBe(1);
    expect(p.equipStats.manaCostOff).toBeCloseTo(0.1);
    p.inv.armor[0] = null;
    expect(p.equipStats.sentrySlots).toBe(0);
    expect(p.equipStats.manaCostOff).toBeCloseTo(0);
    p.inv.armor[0] = { id: iid(3871), stack: 1 };
    expect(p.equipStats.sentrySlots).toBe(2);
    expect(p.equipStats.dmgMelee).toBeCloseTo(0.1);
  });
});
