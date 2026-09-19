// BJ174 登记债4清偿：宝箱怪族掉落面定谳 + 判别力（2026-09-19）
// 1457 权威锚（1458 ItemDropDatabase 逐行 diff 零漂移）：
//   ItemDropDatabase.cs:987  473 CorruptMimic  OneFromOptions(1, 3008 DartRifle, 3014 ClingerStaff,
//                              3012 ChainGuillotines, 3015 PutridScent, 3023 WormHook)
//   ItemDropDatabase.cs:988  474 CrimsonMimic  OneFromOptions(1, 3006 SoulDrain, 3007 DartPistol,
//                              3013 FetidBaghnakhs, 3016 FleshKnuckles, 3020 TendonHook)
//   ItemDropDatabase.cs:989  475 HallowedMimic OneFromOptions(1, 3029 DaedalusStormbow, 3030 FlyingKnife,
//                              3051 CrystalVileShard, 6168 AmmoCycler4(混沌弹筒,1.4.4 新件), 3022 IlluminantHook)
//   ItemDropDatabase.cs:990-999  476 JungleMimic 十连 Common(…,3,…)
//   ItemDropDatabase.cs:1000-1002 {473,474,475} Common(499 大治疗 1,5,10) + Common(500 大魔力 1,5,15)
//   ItemDropDatabase.cs:678/679  475∈{171,475,…} 5488 / 473,474∈{170,180,473,474,…} 5489 宠物组 NormalvsExpert
//   NPC.cs:14536-14546 SetDefaults value=30000f（1456:14450/1458 同值三向对拍一致）
//     ——vanilla-npcvalue.json 曾整缺 473-476（提取器联合条件块盲区）→ 击杀零掉钱，本批补齐。
// ★BJ174 判语勘误（定谳）：原版 1457/1458 无"钥匙返还"——NPC.cs:78318 BigMimicSummonCheck
//   （Player.cs:28991 ChestChangeEvents 驱动）召出时 DestroyChest 吞钥匙；ItemDropDatabase
//   无 3091/3092 规则；负断言钉死防伪修复。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { resolveDrops, rollCoins, npcValueOf, type NpcDropCtx } from '../src/drops/NpcDrops';
import dropData from '../src/data/vanilla-npcdrops.json';

const POOL_473 = [3008, 3014, 3012, 3015, 3023];   // :987
const POOL_474 = [3006, 3007, 3013, 3016, 3020];   // :988
const POOL_475 = [3029, 3030, 3051, 6168, 3022];   // :989
const KEYS = new Set([3091, 3092]);                // NightKey/LightKey——掉落面禁入

function mkCtx(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: new RNG(42),
    netId: 1, type: 1,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 1000, y: 1000,
    worldSurfaceTile: 200, rockLayerTile: 400, underworldTileY: 900,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 3500, friendly: false, boss: false, damage: 90, value: 30000,
    hp: 80, hpMax: 100, mana: 15, manaMax: 20,
    ...over,
  };
}

function sample(type: number, n: number, over: Partial<NpcDropCtx> = {}) {
  const counts = new Map<number, number>();
  const perKill: Array<number[]> = [];
  for (let i = 0; i < n; i++) {
    const c = mkCtx({ rng: new RNG(i * 7919 + 13), netId: type, type, ...over });
    const res = resolveDrops(c);
    const ids: number[] = [];
    for (const d of res.drops) {
      counts.set(d.id, (counts.get(d.id) ?? 0) + d.n);
      ids.push(d.id);
    }
    perKill.push(ids);
  }
  return { counts, perKill };
}

interface Entry { npcs?: number[]; global?: boolean; rule: any }
const ENTRIES = (dropData as { entries: Entry[] }).entries;

/** 规则树内出现的全部 item id（oneOf 池/common/expert 分支/链全走一遍） */
function ruleItemIds(r: any, acc = new Set<number>()): Set<number> {
  if (!r || typeof r !== 'object') return acc;
  if (typeof r.item === 'number') acc.add(r.item);
  for (const k of ['normal', 'expert', 'def', 'master']) if (r[k]?.k) ruleItemIds(r[k], acc);
  if (r.ids) r.ids.forEach((x: number) => acc.add(x));
  if (r.chain) r.chain.forEach((c: any) => ruleItemIds(c.rule, acc));
  return acc;
}

describe('BJ174 静态锚定（vanilla-npcdrops ↔ ItemDropDatabase.cs:987-1002/678/679）', () => {
  it('473/474/475：oneOf 池逐 id + 大药水两条 + 宠物组规则,无多余条目', () => {
    for (const [npc, pool] of [[473, POOL_473], [474, POOL_474], [475, POOL_475]] as const) {
      const own = ENTRIES.filter((e) => !e.global && (e.npcs ?? []).includes(npc));
      const oneOf = own.filter((e) => e.rule.k === 'oneOf' && e.npcs!.length === 1);
      expect(oneOf).toHaveLength(1);
      expect(oneOf[0].rule.denom).toBe(1);
      expect(oneOf[0].rule.num).toBe(1);
      expect(oneOf[0].rule.ids).toEqual(pool);
      const potions = own.filter((e) => e.rule.k === 'common' && e.rule.denom === 1);
      expect(potions.map((e) => e.rule.item).sort((a, b) => a - b)).toEqual([499, 500]);
      expect(potions.find((e) => e.rule.item === 499)!.rule).toMatchObject({ min: 5, max: 10 });
      expect(potions.find((e) => e.rule.item === 500)!.rule).toMatchObject({ min: 5, max: 15 });
      const pets = own.filter((e) => e.rule.k === 'expert');
      expect(pets).toHaveLength(1);   // 5489(473/474) / 5488(475) NormalvsExpert 分组条目
      expect(pets[0].rule.normal.denom).toBe(200);
      expect(pets[0].rule.expert.denom).toBe(150);
      expect(own).toHaveLength(4);    // oneOf + 499 + 500 + 宠物组——再无第五条
    }
  });

  it('476 丛林宝箱怪：十连 Common(1/3) 数量区间逐条对拍 :990-999', () => {
    const own = ENTRIES.filter((e) => !e.global && (e.npcs ?? []).includes(476));
    const table: Array<[number, number, number]> = [
      [52, 1, 1], [1724, 1, 1], [2353, 5, 10], [1922, 1, 1], [678, 3, 5],
      [1336, 1, 1], [2676, 2, 4], [2272, 1, 1], [5395, 1, 1], [4986, 69, 69],
    ];
    expect(own).toHaveLength(10);
    for (const [item, min, max] of table) {
      const e = own.find((x) => x.rule.item === item);
      expect(e, `item ${item} 缺条目`).toBeTruthy();
      expect(e!.rule).toMatchObject({ k: 'common', denom: 3, min, max });
    }
  });

  it('★钥匙返还负断言：473-476 规则树全无 3091/3092（原版吞钥匙, BJ174 判语勘误钉死）', () => {
    for (const npc of [473, 474, 475, 476]) {
      for (const e of ENTRIES.filter((x) => !x.global && (x.npcs ?? []).includes(npc))) {
        const ids = ruleItemIds(e.rule);
        for (const k of KEYS) expect(ids.has(k), `NPC ${npc} 规则含钥匙 ${k}`).toBe(false);
      }
    }
  });
});

describe('BJ174 行为判别（resolveDrops 采样）', () => {
  it('杀 473：每杀恰一装备件（池内）、大药水区间、无钥匙无跨池', () => {
    const { counts, perKill } = sample(473, 200);
    for (let i = 0; i < perKill.length; i++) {
      const ids = perKill[i];
      const poolHits = ids.filter((x) => POOL_473.includes(x));
      expect(poolHits, `kill#${i} 装备件数=${poolHits.length}`).toHaveLength(1);
      for (const k of KEYS) expect(ids).not.toContain(k);
      for (const x of [...POOL_474, ...POOL_475]) expect(ids).not.toContain(x);
    }
    // 池覆盖：200 掷漏某件概率 (4/5)^200≈4e-20
    for (const id of POOL_473) expect(counts.get(id) ?? 0).toBeGreaterThan(0);
    // 药水区间（每杀 5-10 / 5-15）
    const heal = sample(473, 200).counts.get(499) ?? 0;
    const mana = sample(473, 200).counts.get(500) ?? 0;
    expect(heal).toBeGreaterThanOrEqual(200 * 5);
    expect(heal).toBeLessThanOrEqual(200 * 10);
    expect(mana).toBeGreaterThanOrEqual(200 * 5);
    expect(mana).toBeLessThanOrEqual(200 * 15);
  });

  it('474/475 池互斥且各自覆盖（475 含 1.4.4 新件 6168 混沌弹筒）', () => {
    for (const [npc, pool] of [[474, POOL_474], [475, POOL_475]] as const) {
      const { counts, perKill } = sample(npc, 200);
      for (const ids of perKill) {
        expect(ids.filter((x) => pool.includes(x))).toHaveLength(1);
        for (const k of KEYS) expect(ids).not.toContain(k);
      }
      for (const id of pool) expect(counts.get(id) ?? 0).toBeGreaterThan(0);
    }
  });

  it('476：十连 1/3 逐件出现、数量区间逐杀合法（120 杀漏掷概率 (2/3)^120≈4e-21）', () => {
    const table: Array<[number, number, number]> = [
      [52, 1, 1], [1724, 1, 1], [2353, 5, 10], [1922, 1, 1], [678, 3, 5],
      [1336, 1, 1], [2676, 2, 4], [2272, 1, 1], [5395, 1, 1], [4986, 69, 69],
    ];
    const { counts } = sample(476, 120);
    for (const [item] of table) {
      expect(counts.get(item) ?? 0, `item ${item} 未出现`).toBeGreaterThan(0);
    }
    // 逐杀区间：独立种子逐杀断言
    for (let i = 0; i < 60; i++) {
      const res = resolveDrops(mkCtx({ rng: new RNG(i * 104729 + 7), netId: 476, type: 476 }));
      const got = new Map<number, number>();
      for (const d of res.drops) got.set(d.id, (got.get(d.id) ?? 0) + d.n);
      for (const [item, min, max] of table) {
        const n = got.get(item) ?? 0;
        if (n > 0) { expect(n, `kill#${i} item ${item}`).toBeGreaterThanOrEqual(min); expect(n).toBeLessThanOrEqual(max); }
      }
    }
  });

  it('★钱币面：npcValueOf 473-476=30000（NPC.cs:14546 value=30000f）→ rollCoins 非零', () => {
    for (const npc of [473, 474, 475, 476]) expect(npcValueOf(npc)).toBe(30000);
    const ctx = mkCtx({ rng: new RNG(7), netId: 473, type: 473, value: 30000 });
    const coins = rollCoins(npcValueOf(473), ctx, false);
    const worth = coins.reduce((s, d) => s + d.n * (d.id === 74 ? 1000000 : d.id === 73 ? 10000 : d.id === 72 ? 100 : 1), 0);
    expect(worth).toBeGreaterThan(0);
    expect(worth).toBeGreaterThanOrEqual(20000);   // 乘区下限 30000×0.8
    expect(worth).toBeLessThanOrEqual(150000);
  });

  it('专家宠物件 1/150 vs 经典 1/200（5489,分母只认 expert 分支）', () => {
    const exp = sample(473, 6000, { isExpert: true }).counts.get(5489) ?? 0;   // 期望 40
    const nor = sample(473, 6000).counts.get(5489) ?? 0;                       // 期望 30
    expect(exp).toBeGreaterThanOrEqual(10);
    expect(nor).toBeLessThanOrEqual(80);
  });
});
