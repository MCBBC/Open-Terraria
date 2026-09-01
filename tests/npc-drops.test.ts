// 掉落系统回归（对照 1.4.5.6 ItemDropDatabase 提取表 + NPC 掉落管线）
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import {
  resolveDrops, rollCoins, rollHeartsAndStars, npcValueOf, evalCond,
  type NpcDropCtx,
} from '../src/drops/NpcDrops';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import dropData from '../src/data/vanilla-npcdrops.json';

function mkCtx(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: new RNG(42),
    netId: 1, type: 1,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 1000, y: 1000,
    worldSurfaceTile: 200, rockLayerTile: 400, underworldTileY: 900,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 50, friendly: false, boss: false, damage: 10, value: 10,
    hp: 80, hpMax: 100, mana: 15, manaMax: 20,
    ...over,
  };
}

/** 采样 N 次击杀：每杀独立 rng，返回 id→总件数 与 每杀明细（互斥断言用） */
function sample(type: number, n: number, over: Partial<NpcDropCtx> = {}) {
  const counts = new Map<number, number>();
  const perKill: Array<number[]> = [];
  let zeroValue = false;
  for (let i = 0; i < n; i++) {
    const c = mkCtx({ rng: new RNG(i * 7919 + 13), netId: type, type, ...over });
    const res = resolveDrops(c);
    zeroValue = zeroValue || res.zeroValue;
    const ids: number[] = [];
    for (const d of res.drops) {
      counts.set(d.id, (counts.get(d.id) ?? 0) + d.n);
      ids.push(d.id);
    }
    perKill.push(ids);
  }
  return { counts, perKill, zeroValue };
}

describe('掉落提取表（静态）', () => {
  it('条目数/覆盖/未知 kind 达标', () => {
    const entries = (dropData as { entries: unknown[] }).entries;
    expect(entries.length).toBeGreaterThan(600);
    const npcs = new Set<number>();
    const kinds = new Set<string>();
    for (const e of entries as Array<{ npcs?: number[]; rule: { k: string } }>) {
      for (const n of e.npcs ?? []) npcs.add(n);
      kinds.add(e.rule.k);
    }
    expect(npcs.size).toBeGreaterThan(380);
    expect(kinds.has('unknown')).toBe(false);
  });

  it('史莱姆法杖 1/10000（原版 NormalvsExpert(1309,10000,7000)）', () => {
    const { counts } = sample(1, 5000);
    // 5000 杀期望 0.5 件：抽样应接近 0（修复前恒掉）
    expect(counts.get(1309) ?? 0).toBeLessThanOrEqual(2);
    // 凝胶恒掉 1-2
    expect(counts.get(23) ?? 0).toBeGreaterThanOrEqual(5000);
  });

  it('NPC.value 表：普通怪 + 史莱姆负 id 变体（SetDefaultsFromNetId）', () => {
    expect(npcValueOf(3)).toBe(60);        // 僵尸
    expect(npcValueOf(4)).toBe(30000);     // EoC
    expect(npcValueOf(1)).toBe(25);        // 蓝史莱姆本体（SetDefaults :8521 value=25f；
    //  曾被提取器全文误匹配 clobber 成 0 → 不掉钱 + 体内物品 value>0 门永假）
    expect(npcValueOf(-1)).toBe(100);      // 大史莱姆变体
    expect(npcValueOf(-4)).toBe(10000);    // 金史莱姆
    expect(npcValueOf(-5)).toBe(10);       // 小史莱姆（母史莱姆分裂）
  });

  it('物品 key 映射覆盖 >95%', () => {
    const ids = new Set<number>();
    const walk = (r: any) => {
      if (!r || typeof r !== 'object') return;
      if (typeof r.item === 'number') ids.add(r.item);
      for (const k of ['normal', 'expert', 'def', 'master']) if (r[k]?.k) walk(r[k]);
      if (r.ids) r.ids.forEach((x: number) => ids.add(x));
      if (r.chain) r.chain.forEach((c: any) => walk(c.rule));
    };
    for (const e of (dropData as any).entries) walk(e.rule);
    let missing = 0;
    for (const id of ids) if (!VANILLA_ITEM_KEY_BY_ID[id]) missing++;
    expect(missing / ids.size).toBeLessThan(0.05);
  });
});

describe('怪物掉落采样（行为）', () => {
  it('僵尸 3：枷锁≈1/50、僵尸手臂≈1/250、无火把伪条目、掉钱', () => {
    const n = 2000;
    const { counts } = sample(3, n);
    const shackle = counts.get(216) ?? 0;   // 1/50 → 期望 40
    expect(shackle).toBeGreaterThan(15);
    expect(shackle).toBeLessThan(70);
    const arm = counts.get(1304) ?? 0;      // 1/250 → 期望 8
    expect(arm).toBeGreaterThan(0);
    expect(arm).toBeLessThan(20);
    expect(counts.has(8)).toBe(false);      // 火把伪条目已消灭
    // 钱币（value=60 铜）：管线独立掷
    const coin = rollCoins(60, mkCtx({ type: 3, rng: new RNG(7) }), false);
    const total = coin.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    expect(total).toBeGreaterThan(40);
    expect(total).toBeLessThan(130);
  });

  it('恶魔眼 2：晶状体 1/100 与黑晶状体互斥（failedRoll 链）', () => {
    const { perKill } = sample(2, 2000);
    let lens = 0, black = 0;
    for (const ids of perKill) {
      const l = ids.filter((x) => x === 236).length;
      const b = ids.filter((x) => x === 38).length;
      expect(l + b).toBeLessThanOrEqual(1); // 至多其一
      lens += l; black += b;
    }
    // 晶状体 1/100（≈20/2000）；黑晶状体 = 晶状体失败后 1/3（≈660/2000）——
    // 1456 ItemDropDatabase.cs:1087 ≡ 1457 :1091 同一条规则 Common(236,100).OnFailedRoll(Common(38,3))
    expect(lens).toBeGreaterThan(10);
    expect(black).toBeGreaterThan(550);
    expect(black).toBeLessThan(800);
  });

  it('噬魂怪 6：暗影鳞片三选一 1/175 + 魔矿 1/3', () => {
    const { counts } = sample(6, 2000);
    const scales = (counts.get(956) ?? 0) + (counts.get(957) ?? 0) + (counts.get(958) ?? 0);
    expect(scales).toBeGreaterThan(2);   // 期望 ≈11
    expect(scales).toBeLessThan(30);
    expect(counts.get(68) ?? 0).toBeGreaterThan(450); // 魔矿 1/3 → ≈667
  });

  it('EoC 4：普通=矿石+掉钱，专家=宝藏袋+清零钱', () => {
    // 普通（corruption 分支：魔矿 30-90 恒掉 + 邪箭）
    const normal = sample(4, 50);
    expect(normal.counts.get(56) ?? 0).toBeGreaterThan(0);   // 魔矿
    expect(normal.zeroValue).toBe(false);
    expect(npcValueOf(4)).toBeGreaterThan(0);
    // 专家
    const expert = sample(4, 20, { isExpert: true });
    expect(expert.counts.get(3319) ?? 0).toBe(20);           // 每杀必掉宝藏袋
    expect(expert.zeroValue).toBe(true);                     // value 清零 → 不掉钱
    expect(expert.counts.get(56) ?? 0).toBe(0);              // NotExpert 矿石条目关闭
  });

  it('专家模式叠加大师：纪念品恒掉（masterCommon）', () => {
    const master = sample(4, 10, { isExpert: true, isMaster: true });
    expect(master.counts.get(4924) ?? 0).toBe(10);
    expect(master.counts.get(3319) ?? 0).toBe(10);
  });

  it('心/星：普通怪偶发、史莱姆族不掉', () => {
    const c = mkCtx({ type: 3, lifeMax: 60, damage: 15, rng: new RNG(99) });
    let hearts = 0, stars = 0;
    for (let i = 0; i < 2000; i++) {
      for (const d of rollHeartsAndStars({ ...c, rng: new RNG(i * 31 + 5) })) {
        if (d.id === 58) hearts++;
        if (d.id === 184) stars++;
      }
    }
    expect(hearts).toBeGreaterThan(50);  // 1/6×1/2×2/3 ≈ 5.5%
    expect(stars).toBeGreaterThan(30);   // 1/6×1/2×(mana未满) + 1/2 额外星
    // 母史莱姆 16 排除（R14-A7：原版按 netID 16/121/81 整段跳过,零掷）
    const none = rollHeartsAndStars(mkCtx({ type: 16, netId: 16, lifeMax: 60, damage: 15 }));
    expect(none.length).toBe(0);
  });

  it('钱币管线：8 层放大均值 ≈ value×1.08，血月加成生效', () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const coins = rollCoins(100, mkCtx({ rng: new RNG(i * 17 + 3) }), false);
      sum += coins.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    }
    const avg = sum / 2000;
    // 均值 = 1.275(基线) × ∏(1+1/2^k×增幅) ≈ 1.47×value（源码公式逐项核对）
    expect(avg).toBeGreaterThan(130);
    expect(avg).toBeLessThan(165);
    let bloodSum = 0;
    for (let i = 0; i < 2000; i++) {
      const coins = rollCoins(100, mkCtx({ rng: new RNG(i * 17 + 3) }), true);
      bloodSum += coins.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    }
    expect(bloodSum / 2000).toBeGreaterThan(avg); // 血月 ×(1.0-2.0)
  });

  it('恶魔眼晶状体→可疑眼球条件（EoC 击败后不掉，条件恒 false）', () => {
    const { counts } = sample(2, 200, { flags: {} });
    expect(counts.get(43) ?? 0).toBe(0); // EyeOfCthulhuDefeatedAndNoAltarsInWorld 恒 false
  });
});

describe('提取器三盲区 + 求值器门（2026-08-13 审计修复）', () => {
  const HALLOWEEN = {
    zoneHallow: false, zoneCorrupt: false, zoneCrimson: false, zoneJungle: false,
    zoneSnow: false, zoneDesert: false, zoneDungeon: false, zoneBeach: false,
    bloodMoon: false, halloween: true, xmas: false, windy: false,
  };
  const CRIMSON_DEEP = {
    zoneHallow: false, zoneCorrupt: false, zoneCrimson: true, zoneJungle: false,
    zoneSnow: false, zoneDesert: false, zoneDungeon: false, zoneBeach: false,
    bloodMoon: false, halloween: false, xmas: false, windy: false,
  };

  it('盲区1：masterAll 用类字段 _masterModeDropRng=4 → 宠物 ≈25%（曾 denom=1 恒掉）', () => {
    // EoC 4 大师模式：4798 宠物 1/4；且 CommonCode 收尾 value=0 → 恒清钱币（曾漏）
    const master = sample(4, 2000, { isExpert: true, isMaster: true });
    const pet = master.counts.get(4798) ?? 0;
    expect(pet).toBeGreaterThan(400);   // 期望 500
    expect(pet).toBeLessThan(600);
    expect(master.zeroValue).toBe(true);
  });

  it('盲区2：ByCondition chanceNumerator 是第 6 参 → 蜂后 Beenade 3/4×10-30（曾 num=30 恒掉）', () => {
    // ItemDropDatabase.cs:551：ByCondition(NotExpert, 1130, 4, 10, 30, 3)——npc 222 蜂后
    const { counts } = sample(222, 400, {});
    const n = counts.get(1130) ?? 0;
    expect(n).toBeGreaterThan(4200);    // 期望 400×0.75×20 = 6000 件
    expect(n).toBeLessThan(7800);
  });

  it('盲区3：冰模仿怪 629 肉前池（RegisterIceMimic_GetEasyModeItemPool 方法实参）', () => {
    // 1457 :244-251 池 8 选 {670,724,950,6153,(1319),987,1579,6172}（obj[4]=isRemix?725:1319；
    //  1456 是 6 选——蓝队 R2-10 补 6153/6172）；挂 NotRemixSeedEasymode 门（曾恒 false → 整支丢失）
    const pool = [670, 724, 950, 6153, 1319, 987, 1579, 6172];
    const { counts, perKill } = sample(629, 300, {});
    let hits = 0;
    for (const ids of perKill) {
      const inPool = ids.filter((x) => pool.includes(x));
      expect(inPool.length).toBeLessThanOrEqual(1);   // 每杀至多一件
      hits += inPool.length;
    }
    expect(hits).toBeGreaterThan(255);   // 1/20 主骰失败后恒掉 → ≈95%
    expect(counts.has(676)).toBe(false);  // 硬模式独占项不出
    expect(counts.has(1264)).toBe(false);
    expect((counts.get(6153) ?? 0)).toBeGreaterThan(0);   // 1457 新件 GlacierFang 可掉
    expect((counts.get(6172) ?? 0)).toBeGreaterThan(0);   // 1457 新件 HeavySling 可掉
  });

  it('条件补齐：NotRemixSeedEasymode = !hardMode / RemixSeedEasymode 恒 false（Conditions.cs:1370/1318）', () => {
    expect(evalCond('NotRemixSeedEasymode', [], mkCtx({ hardMode: false }))).toBe(true);
    expect(evalCond('NotRemixSeedEasymode', [], mkCtx({ hardMode: true }))).toBe(false);
    expect(evalCond('RemixSeedEasymode', [], mkCtx({ hardMode: false }))).toBe(false);
    expect(evalCond('RemixSeedEasymode', [], mkCtx({ hardMode: true }))).toBe(false);
  });

  it('noLuck 门：NotScalingWithLuck 规则不吃幸运（576 的 3865 恒 1/7）', () => {
    // CommonDropNotScalingWithLuck.cs:17 用 rng.Next 直掷；若走 RollLuck，
    // luck=1 时命中率升到 (ln7-ln3)/4 ≈ 21%，本断言即红
    const rate = (luck: number) => (sample(576, 3000, { luck }).counts.get(3865) ?? 0) / 3000;
    const r0 = rate(0), r1 = rate(1);
    expect(r0).toBeGreaterThan(0.11);    // 1/7 ≈ 0.143
    expect(r0).toBeLessThan(0.18);
    expect(Math.abs(r1 - r0)).toBeLessThan(0.05);
  });

  it('礼物袋 NPC 门（Conditions.cs:891-934）：value=0 与 type=23 排除', () => {
    const ok = sample(3, 800, { extras: HALLOWEEN });
    expect(ok.counts.get(1774) ?? 0).toBeGreaterThan(2);    // 1/80 → 期望 10
    const statue = sample(3, 800, { extras: HALLOWEEN, statueSpawned: true, value: 0 });
    expect(statue.counts.get(1774) ?? 0).toBe(0);           // 雕像怪 value=0（Wiring.cs:2479）
    const skull = sample(23, 800, { extras: HALLOWEEN });
    expect(skull.counts.get(1774) ?? 0).toBe(0);            // 诅咒骷髅头显式排除
  });

  it('魂/钥匙排除 NPCID.Sets.DontDropDungeonKeysOrSouls = {23}（NPCID.cs:4438）', () => {
    const deep = { hardMode: true, y: 12000, extras: CRIMSON_DEEP };   // y/16=750 > rockLayer 400
    const zombie = sample(3, 500, deep);
    expect(zombie.counts.get(521) ?? 0).toBeGreaterThan(40);  // 暗夜之魂 1/5 → 期望 100
    const skull = sample(23, 500, deep);
    expect(skull.counts.get(521) ?? 0).toBe(0);               // 诅咒骷髅头不掉魂（曾掉）
  });

  it('悠悠球五条件补 HasPlayerTarget（NPC.cs:6603）', () => {
    const yoyo = {
      hardMode: false, y: (1200 - 100) * 16,          // y/16=1100 > maxTilesY-350=850
      flags: { downed_35: true },                     // downedBoss3（骷髅王）
    };
    expect(evalCond('YoyoCascade', [], mkCtx({ ...yoyo, hasPlayerTarget: true }))).toBe(true);
    expect(evalCond('YoyoCascade', [], mkCtx({ ...yoyo, hasPlayerTarget: false }))).toBe(false);
    expect(evalCond('YoyoCascade', [], mkCtx({ ...yoyo, hasPlayerTarget: undefined }))).toBe(false);
  });

  it('钱币幸运重掷：双轮取极值（NPC.cs:80414-80487，曾重掷门形同虚设）', () => {
    const total = (cs: Array<{ id: number; n: number }>) =>
      cs.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    const mean = (luck: number) => {
      let s = 0;
      for (let i = 0; i < 3000; i++) s += total(rollCoins(1000, mkCtx({ rng: new RNG(i * 13 + 7), luck }), false));
      return s / 3000;
    };
    const base = mean(0), good = mean(1), bad = mean(-1);
    expect(good).toBeGreaterThan(base * 1.03);   // luck>0 取两轮较大
    expect(bad).toBeLessThan(base * 0.97);       // luck<0 取两轮较小
  });
});

describe('史莱姆体内物品（SlimeBodyItemDropRule）', () => {
  it('ai1<=0 不触发（CanDrop :14-18）；>0 掉出对应物品且堆叠在档位内', () => {
    // 未掷（0）/掷空（-1）→ DoesntFillConditions：体内物（火把 8）绝不出——
    // 凝胶/钱币等其他规则照常掉，故按"目标物品缺席"断言而非零掉落
    expect(sample(1, 60, { ai1: 0 }).perKill.every((k) => !k.includes(8))).toBe(true);
    expect(sample(1, 60, { ai1: -1 }).perKill.every((k) => !k.includes(8))).toBe(true);
    // 全档位表逐物品核：必出 + 堆叠闭区间 [min,max]（GetDropInfo :36-112）
    const table = (dropData as { slimeBody: Record<string, [number, number]> }).slimeBody;
    for (const [id, [mn, mx]] of Object.entries(table)) {
      const n = Number(id);
      for (let i = 0; i < 40; i++) {
        const res = resolveDrops(mkCtx({ rng: new RNG(i * 31 + n), netId: 1, type: 1, ai1: n }));
        const hit = res.drops.find((d) => d.id === n);
        expect(hit, `item ${id} 未掉出`).toBeTruthy();
        expect(hit!.n, `item ${id} 堆叠 ${hit!.n} 越界 [${mn},${mx}]`).toBeGreaterThanOrEqual(mn);
        expect(hit!.n).toBeLessThanOrEqual(mx);
      }
    }
  });

  it('整合：Enemy 首帧掷定 ai1（type 1 value=25>0 过门），物品 id 全在掷骰表内', async () => {
    const { Enemy } = await import('../src/entities/Enemy');
    const { World } = await import('../src/world/World');
    const w = new World(80, 80, 42, 'open');
    w.groundLevel = 42; w.rockLevel = 60;
    const hooks = {
      world: w, player: null,
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: (): number => 0,
      entities: { add: () => {} }, enemies: () => [] as unknown[],
    } as never;
    const ALLOWED = new Set([-1, 2, 3, 8, 9, 11, 12, 13, 14, 29, 58, 71, 72, 73, 75, 147,
      150, 166, 290, 292, 296, 314, 539, 699, 700, 701, 702, 751, 965, 1103, 1104, 1105,
      1106, 1124, 1125, 1345, 2322, 2350, 3081, 3086, 3609, 364, 365, 366, 3736, 3737, 3738,
      4343, 4344, 4367, 4368, 4369, 4370, 4371, 4612, 4674]);   // 含 genItem 矿石桶 11-14
    const rolled = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const e = Enemy.fromVanilla(1, 50 * 16, 50 * 16)!;
      e.fixedUpdate(1 / 60, hooks);
      expect(e.ai1).not.toBe(0);              // 首帧必掷（-1 或物品 id）
      expect(ALLOWED.has(e.ai1), `掷出表外物品 ${e.ai1}`).toBe(true);
      if (e.ai1 > 0) rolled.add(e.ai1);
    }
    expect(rolled.size).toBeGreaterThan(3);   // 采样确实掷出多种物品
    // 只掷一次：第二帧不再变化
    const e2 = Enemy.fromVanilla(1, 50 * 16, 50 * 16)!;
    e2.fixedUpdate(1 / 60, hooks);
    const first = e2.ai1;
    e2.fixedUpdate(1 / 60, hooks);
    expect(e2.ai1).toBe(first);
  }, 30000);   // 惰性 import('entities/Enemy') 冷加载 ≈14s（items/bossAI/Renderer
               // 贴图懒加载在模块图内）——缺省 5s 超时误杀,非逻辑耗时
});
