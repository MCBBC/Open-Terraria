// A 级近似清零 第三批探针：
//   1. DD2 T2/T3 出怪逐怪概率表（src/world/OldOnesArmy.ts ↔ DD2Event.cs
//      Difficulty_2_SpawnMonsterFromGate :1240-1442 / Difficulty_3 :1545-1766）
//   2. 钓鱼咬钩（src/entities/Bobber.ts ↔ Projectile.cs AI_061 :50762-50937 /
//      FishingCheck :19175-19185 / SetFishingCheckResults :19327-19346）
//   3. 攻速配饰（src/entities/Player.attackSpeedMult ↔ Player.cs CapAttackSpeeds
//      :28555-28574 / 力量手套族 :14559-14826 / TryAllowingItemReuse :52036-52053）
//   4. AI_003 逐族切片（src/entities/fighterFamilies.ts ↔ NPC.cs :57799-58800
//      横向移动链 / :57431-57460+:60679-60696 混沌元素 / :56327-56360 沼泽怪）
// 宿主全确定性：DD2 用脚本化 rand 队列，钓鱼/配饰走真实数据表。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory, ACC_ARMOR_START } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { Bobber } from '../src/entities/Bobber';
import { Enemy } from '../src/entities/Enemy';
import {
  spawnMonsterFromGate, newOldOnesArmyState, type OldOnesArmyState, type OldOnesArmyHost,
} from '../src/world/OldOnesArmy';
import {
  fighterMoveSpec, chaosElementalStep, attemptToFindTeleportSpot, swampThingAmbushStep,
} from '../src/entities/fighterFamilies';
import type { GameHooks } from '../src/entities/types';
import { BuffType } from '../src/stats/Buffs';
import { TILE } from '../src/core/constants';

// ---------------------------------------------------------------------------
// DD2：脚本化 rand 宿主（rand 队列消费完回退 7——永不命中 0 分支）
// ---------------------------------------------------------------------------
interface Spy { spawned: number[]; counts: Map<number, number>; any: Set<number> }

function makeDD2Host(randQueue: number[], spy: Spy): OldOnesArmyHost {
  return {
    broadcast: () => {},
    spawnNpc: (id) => { spy.spawned.push(id); spy.counts.set(id, (spy.counts.get(id) ?? 0) + 1); },
    countNpcs: (id) => spy.counts.get(id) ?? 0,
    anyNpc: (id) => spy.any.has(id),
    crystalPoints: () => [],
    dropAtCrystal: () => {},
    arenaEnds: () => ({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }),
    findGroundY: () => null,
    rand: (n) => {
      const v = randQueue.length ? randQueue.shift()! : 7;
      return v % n;
    },
    activePlayersCount: () => 1,   // 单机：:1267/:1578 缩放循环零次
  };
}

function t2State(wave: number): OldOnesArmyState {
  const st = newOldOnesArmyState();
  st.ongoing = true; st.ongoingDifficulty = 2; st.waveNumber = wave;
  st.timeLeftUntilSpawningBegins = 0;
  return st;
}

function t3State(wave: number): OldOnesArmyState {
  const st = t2State(wave);
  st.ongoingDifficulty = 3;
  return st;
}

describe('DD2 T2 出怪概率链（Difficulty_2 :1240-1442）', () => {
  it('波 1：Next(20)==0 且 562<5 → 枯萎兽 562；否则基线 553（:1281-1289）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t2State(1), makeDD2Host([0], s), 0, 0, false);
    expect(s.spawned).toEqual([562]);
    const s2: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t2State(1), makeDD2Host([3], s2), 0, 0, false);
    expect(s2.spawned).toEqual([553]);
  });

  it('波 1 配额：562 已达 num2=5 → 即便 Next(20)==0 也落 553（:1248/:1282）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    s.counts.set(562, 5);
    spawnMonsterFromGate(t2State(1), makeDD2Host([0], s), 0, 0, false);
    expect(s.spawned).toEqual([553]);
  });

  it('波 2 三级链：1/3 龙 572 → 1/8 枯萎兽 562 → 基线 553（:1290-1300）', () => {
    const a: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t2State(2), makeDD2Host([0], a), 0, 0, false);   // Next(3)==0 → 572
    expect(a.spawned).toEqual([572]);
    const b: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t2State(2), makeDD2Host([1, 0], b), 0, 0, false); // 3 档落空 → Next(8)==0 → 562
    expect(b.spawned).toEqual([562]);
    const c: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t2State(2), makeDD2Host([1, 4], c), 0, 0, false); // 全落空 → 553
    expect(c.spawned).toEqual([553]);
  });

  it('波 3 双出：Next(4)==0 时 556+553 同拍两只（:1314-1318）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    // 链：Next(7)≠0 → Next(10)≠0 → Next(8)≠0 → 基线档内 Next(4)==0 → 双出
    spawnMonsterFromGate(t2State(3), makeDD2Host([1, 1, 1, 0], s), 0, 0, false);
    expect(s.spawned).toEqual([556, 553]);
  });

  it('波 5 龙/法师二选一：Next(2)!=0 → 574（:1348）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    // Next(7)≠0 → Next(10)≠0 → Next(4)==0 进龙档 → Next(2)!=0 → 574
    spawnMonsterFromGate(t2State(5), makeDD2Host([1, 1, 0, 1], s), 0, 0, false);
    expect(s.spawned).toEqual([574]);
  });

  it('波 6 基线档 Next(3)!=0 恒出 556+553 双出（:1389-1391）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    // Next(7)≠0 → Next(17)≠0 → Next(5)≠0 → Next(9)≠0 → Next(3)≠0 → 基线档 Next(3)!=0 → 556+553
    spawnMonsterFromGate(t2State(6), makeDD2Host([1, 1, 1, 1, 1, 1], s), 0, 0, false);
    expect(s.spawned).toEqual([556, 553]);
  });

  it('波 7 右门 + 进度 >10% + 无 576 → 双足翼龙长老（:1401-1404）', () => {
    const st = t2State(7);
    st.waveKills = 30;   // > 220*0.1
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(st, makeDD2Host([], s), 0, 0, false);   // leftGate=false → 免掷
    expect(s.spawned).toEqual([576]);
  });
});

describe('DD2 T3 出怪概率链（Difficulty_3 :1545-1766）', () => {
  it('波 1：Next(18)==0 且 563<7 → 563；基线档 Next(7)==0 双出 557+554（:1592-1605）', () => {
    const a: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t3State(1), makeDD2Host([0], a), 0, 0, false);
    expect(a.spawned).toEqual([563]);
    const b: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t3State(1), makeDD2Host([1, 0], b), 0, 0, false);
    expect(b.spawned).toEqual([557, 554]);
  });

  it('波 3 尾档 554+557 联合计数 <60 → 单出 554（:1644-1645）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    // Next(13)≠0 → Next(7)≠0 → Next(10)≠0 → Next(8)≠0 → 尾档
    spawnMonsterFromGate(t3State(3), makeDD2Host([1, 1, 1, 1], s), 0, 0, false);
    expect(s.spawned).toEqual([554]);
  });

  it('波 4：Next(24)==0 且无 565 → 黑暗魔法师 T3 型（:1648-1650）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t3State(4), makeDD2Host([0], s), 0, 0, false);
    expect(s.spawned).toEqual([565]);
    const s2: Spy = { spawned: [], counts: new Map(), any: new Set([565]) };
    spawnMonsterFromGate(t3State(4), makeDD2Host([0, 1, 1, 1, 1, 1], s2), 0, 0, false);
    expect(s2.spawned[0]).toBe(554);   // 已在世 → 链落基线 554
  });

  it('波 5：Next(20)==0 且无 577 → 食人魔 T3 型；Next(4)==0 → 575（:1671/:1683）', () => {
    const a: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t3State(5), makeDD2Host([0], a), 0, 0, false);
    expect(a.spawned).toEqual([577]);
    const b: Spy = { spawned: [], counts: new Map(), any: new Set([577]) };
    // 577 档落空(Next(17)≠0 → 569 档落空 Next(8)≠0 → 571 档落空 Next(7)==0 进龙档 → Next(4)==0 → 575
    spawnMonsterFromGate(t3State(5), makeDD2Host([5, 1, 1, 0, 0], b), 0, 0, false);
    expect(b.spawned).toEqual([575]);
  });

  it('波 6 双链独立：链一全落空、链二 Next(7)==0 → 报复者 578（:1697-1749）', () => {
    const s: Spy = { spawned: [], counts: new Map(), any: new Set() };
    // 链一：Next(20)≠0 ×2 → Next(12)≠0 → Next(25)≠0；链二：Next(7)==0 → 578
    spawnMonsterFromGate(t3State(6), makeDD2Host([1, 1, 1, 1, 0], s), 0, 0, false);
    expect(s.spawned).toEqual([578]);
  });

  it('波 7：Next(20)==0 且 571<6 → 电球 571；尾档 Next(5)==0 双出 557+554（:1733-1751）', () => {
    const a: Spy = { spawned: [], counts: new Map(), any: new Set() };
    spawnMonsterFromGate(t3State(7), makeDD2Host([0], a), 0, 0, false);
    expect(a.spawned).toEqual([571]);
    const b: Spy = { spawned: [], counts: new Map(), any: new Set() };
    // Next(20)≠0 → Next(17)≠0 → Next(10)≠0 → 尾档 Next(5)==0 → 557+554
    spawnMonsterFromGate(t3State(7), makeDD2Host([1, 1, 1, 0], b), 0, 0, false);
    expect(b.spawned).toEqual([557, 554]);
  });
});

// ---------------------------------------------------------------------------
// 钓鱼：AI_061 累积器 / FishingCheck 咬钩门 / SetFishingCheckResults 窗口
// ---------------------------------------------------------------------------
function fishingHooks(opts: {
  pool?: { x: number; w: number };
  depth?: number;
  groundLevel?: number;
  bobberTileY?: number;
}) {
  const store = new TileStore(200, 120);
  const groundLevel = opts.groundLevel ?? 100;
  const depth = opts.depth ?? 3;   // 泊深（行数）；水体总数 = 宽×min(深, H-10-行) 
  if (opts.pool) {
    for (let dx = 0; dx < opts.pool.w; dx++) {
      for (let dy = 0; dy < depth; dy++) {
        store.setLiquid(opts.pool.x + dx, (opts.bobberTileY ?? 95) + dy, 200, 1);
      }
    }
  }
  const player = new Player(64 * TILE, (opts.bobberTileY ?? 95) * TILE - 60, new Inventory());
  const hooks = {
    world: {
      store,
      groundLevel,
      // 中性时段（乘区=1）：昼 10000 tick / 月相 2 / 无雨无云 / 非血月
      clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
      weather: { raining: false, cloudAlpha: 0 },
      flags: {},
      scene: null,
    },
    player,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { hooks, player, store };
}

/** 驱动到落水漂浮 */
function land(b: Bobber, hooks: GameHooks, max = 400): boolean {
  for (let i = 0; i < max; i++) { b.fixedUpdate(1, hooks); if (b.floating) return true; }
  return false;
}

describe('钓鱼咬钩（AI_061 :50897-50934 / FishingCheck :19179-19184 / :19334）', () => {
  it('等待累积公式：每 tick +⌊力/30⌋+rand(1,3)+rand(300)<力 项 → >660 触发咬钩判定（:50897-50915）', () => {
    const { hooks, player } = fishingHooks({ pool: { x: 64, w: 40 } });
    const b = new Bobber(player.cx, player.y - 10, 6, -4, 50, 0, 50, () => player);
    expect(land(b, hooks)).toBe(true);
    // 池 40×3=120 格 / 需 300（atmo=1）→ 水质缩放 :19244-19246 力 100→40
    // 期望 ≈660/3.7 ≈ 178 tick，上界含 1/60 的 +60 延迟与咬钩门空拍
    let ticks = 0, bit = false;
    for (; ticks < 2500; ticks++) {
      b.fixedUpdate(1, hooks);
      if (b.biteT > 0) { bit = true; break; }
    }
    expect(bit).toBe(true);
    expect(ticks).toBeGreaterThan(80);
    expect(ticks).toBeLessThan(1500);
  });

  it('咬钩窗口幅度 = rand(-240,-90) - 钓鱼力：缩放后力 40 → (130, 280]（:19334）', () => {
    const { hooks, player } = fishingHooks({ pool: { x: 64, w: 40 } });
    const b = new Bobber(player.cx, player.y - 10, 6, -4, 50, 0, 50, () => player);
    expect(land(b, hooks)).toBe(true);
    for (let i = 0; i < 2500 && b.biteT <= 0; i++) b.fixedUpdate(1, hooks);
    expect(b.biteT).toBeGreaterThan(130);
    expect(b.biteT).toBeLessThanOrEqual(280);
  });

  it('窗口耗尽 → 逃脱：ai[1] 每 tick += rand(1,5)，归零清渔获（:50918-50934）', () => {
    const { hooks, player } = fishingHooks({ pool: { x: 64, w: 40 } });
    const b = new Bobber(player.cx, player.y - 10, 6, -4, 50, 0, 50, () => player);
    expect(land(b, hooks)).toBe(true);
    for (let i = 0; i < 2500 && b.biteT <= 0; i++) b.fixedUpdate(1, hooks);
    expect(b.catchId).toBeGreaterThan(0);
    for (let i = 0; i < 600 && b.biteT > 0; i++) b.fixedUpdate(1, hooks);
    expect(b.biteT).toBe(0);
    expect(b.catchId).toBe(0);
    expect(b.reel(hooks)).toBe(0);
  });

  it('水体 <75 格 → FishingCheck 直接不咬（:19208-19211）', () => {
    const { hooks, player } = fishingHooks({ pool: { x: 64, w: 20 } });   // 20×3=60 < 75
    const b = new Bobber(player.cx, player.y - 10, 6, -4, 50, 0, 50, () => player);
    expect(land(b, hooks)).toBe(true);
    let bit = false;
    for (let i = 0; i < 1500; i++) { b.fixedUpdate(1, hooks); if (b.biteT > 0) { bit = true; break; } }
    expect(bit).toBe(false);
  });

  it('海洋判定 = 边缘 380 格 && 地表以上 && 水体 >1000（:19886）——大池边缘咬出海洋池渔获', () => {
    const { hooks, player } = fishingHooks({ pool: { x: 2, w: 75 }, depth: 20, bobberTileY: 95 });
    const b = new Bobber(4 * TILE, 90 * TILE, 0, 2, 50, 0, 50, () => player);   // 落在边缘 380 格内
    expect(land(b, hooks)).toBe(true);
    // 连续收 6 次：渔获必须出自海洋池（鱼/匣/垃圾），不许出现普通地表池独有鱼
    const oceanPool = new Set([2299, 2301, 2302, 2308, 2488, 2334, 2335, 2336, 2339, 2337]);
    const surfaceOnly = new Set([2290, 2297, 2298, 2303, 2309, 2310, 2311, 2330]);
    const catches: number[] = [];
    for (let round = 0; round < 6; round++) {
      let got = 0;
      for (let i = 0; i < 3000; i++) {
        b.fixedUpdate(1, hooks);
        if (b.biteT > 0 && b.catchId > 0) { got = b.catchId; break; }
      }
      if (!got) break;
      catches.push(got);
      b.reel(hooks);
      b.dead = false;   // 复用同一浮标继续统计池归属
    }
    expect(catches.length).toBeGreaterThanOrEqual(4);
    expect(catches.every((c) => oceanPool.has(c))).toBe(true);
    expect(catches.some((c) => surfaceOnly.has(c))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 攻速配饰：CapAttackSpeeds 倒数档 + 力量手套族
// ---------------------------------------------------------------------------
function playerWith(accessoryKeys: string[]): Player {
  const p = new Player(100, 100, new Inventory());
  accessoryKeys.forEach((key, i) => {
    const id = ITEM_BY_KEY[key];
    if (id != null) p.inv.armor[ACC_ARMOR_START + i] = { id, stack: 1 };
  });
  return p;
}

describe('攻速配饰（CapAttackSpeeds :28555-28574 / 猛爪手套 :14559-14562）', () => {
  it('裸装 → 倒数档 1/1 = 1', () => {
    expect(playerWith([]).attackSpeedMult).toBe(1);
  });

  it('猛爪手套 211：meleeSpeed += 0.12 → 1/1.12（原 ×2 档已废，:14559-14562 只给 +0.12）', () => {
    const p = playerWith(['vi_211_feral_claws']);
    expect(p.equipStats.meleeSpeed).toBeCloseTo(0.12, 6);
    expect(p.attackSpeedMult).toBeCloseTo(1 / 1.12, 6);
    expect(p.attackSpeedMult).toBeLessThan(1);   // 攻速提升 = 时长乘数 <1
  });

  it('双猛爪手套叠加 0.24 → 1/1.24', () => {
    expect(playerWith(['vi_211_feral_claws', 'vi_211_feral_claws']).attackSpeedMult)
      .toBeCloseTo(1 / 1.24, 6);
  });

  it('力量手套族 autoReuseGlove：近战自动连挥旗（TryAllowingItemReuse :52040-52042）', () => {
    expect(playerWith([]).equipStats.autoReuseGlove).toBe(false);
    expect(playerWith(['vi_211_feral_claws']).equipStats.autoReuseGlove).toBe(true);
  });

  it('乘法链 raw = (1+装备)×buff 档 → 倒数；醉酒 ×1.1 叠加（:11519/:28566-28573）', () => {
    const p = playerWith(['vi_211_feral_claws']);
    p.buffs.apply(BuffType.Tipsy, 3600);   // 醉酒近战速 ×1.1
    expect(p.attackSpeedMult).toBeCloseTo(1 / (1.12 * 1.1), 6);
  });
});

// ---------------------------------------------------------------------------
// AI_003 逐族切片（fighterFamilies.ts）
// ---------------------------------------------------------------------------
function vanillaEnemy(id: number, hpRatio = 1): Enemy {
  const e = Enemy.fromVanilla(id, 0, 0)!;
  if (hpRatio < 1) e.hp = Math.max(1, Math.floor(e.maxHp * hpRatio));
  return e;
}

describe('AI_003 横向移动族表（NPC.cs:57799-58800）', () => {
  it('僵尸族 default 档 num108：132→0.95 / 186→1.1 / 189→0.8（:58741-58752）', () => {
    expect(fighterMoveSpec(vanillaEnemy(132))!.max).toBeCloseTo(0.95, 6);
    expect(fighterMoveSpec(vanillaEnemy(186))!.max).toBeCloseTo(1.1, 6);
    expect(fighterMoveSpec(vanillaEnemy(189))!.max).toBeCloseTo(0.8, 6);
  });

  it('骷髅族 num84：21→1.5 / 201→1.1 / 202→0.9 / 342→1.5×(1+(1-scale))（:58005-58136）', () => {
    expect(fighterMoveSpec(vanillaEnemy(21))!.max).toBeCloseTo(1.5, 6);
    expect(fighterMoveSpec(vanillaEnemy(201))!.max).toBeCloseTo(1.1, 6);
    expect(fighterMoveSpec(vanillaEnemy(202))!.max).toBeCloseTo(0.9, 6);
    expect(fighterMoveSpec(vanillaEnemy(342))!.max).toBeCloseTo(1.5, 6);   // scale=1 → ×1
  });

  it('骨甲三族 num85 全表：269→2 / 275→3.25 / 278→1.8（:58137-58204）', () => {
    expect(fighterMoveSpec(vanillaEnemy(269))!.max).toBeCloseTo(2, 6);
    expect(fighterMoveSpec(vanillaEnemy(275))!.max).toBeCloseTo(3.25, 6);
    expect(fighterMoveSpec(vanillaEnemy(278))!.max).toBeCloseTo(1.8, 6);
  });

  it('稻草人 num86：305→2 / 306→1.25 / 314→1（:58205-58227）', () => {
    expect(fighterMoveSpec(vanillaEnemy(305))!.max).toBeCloseTo(2, 6);
    expect(fighterMoveSpec(vanillaEnemy(306))!.max).toBeCloseTo(1.25, 6);
    expect(fighterMoveSpec(vanillaEnemy(314))!.max).toBeCloseTo(1, 6);
  });

  it('混沌元素 120 → 3 档 + 逆行缓刹 0.99；射击族 110 在链上无分支（:57916/:58719）', () => {
    const chaos = fighterMoveSpec(vanillaEnemy(120))!;
    expect(chaos.max).toBe(3);
    expect(chaos.accel).toBeCloseTo(0.07, 6);
    expect(chaos.reverseDamp).toBeCloseTo(0.99, 6);
    expect(fighterMoveSpec(vanillaEnemy(110))).toBe(null);
    expect(fighterMoveSpec(vanillaEnemy(290))).toBe(null);
  });

  it('血僵尸 489 / 冰雪巨人 243 / 独眼僵尸 251 的 HP 动态档（:58770/:58365/:58401）', () => {
    // 480 美杜莎：1.5 + (1-HP比)×2 —— 满血 1.5 / 半血 2.5
    expect(fighterMoveSpec(vanillaEnemy(480, 1))!.max).toBeCloseTo(1.5, 6);
    expect(fighterMoveSpec(vanillaEnemy(480, 0.5))!.max).toBeCloseTo(2.5, 6);
    // 251 独眼僵尸：1 + (1-HP比)×2
    expect(fighterMoveSpec(vanillaEnemy(251, 0.5))!.max).toBeCloseTo(2, 6);
  });

  it('木乃伊族半血激怒：1→2 档 / 加速 0.05→0.1（:58288-58317）', () => {
    const calm = fighterMoveSpec(vanillaEnemy(78, 1))!;
    const rage = fighterMoveSpec(vanillaEnemy(78, 0.4))!;
    expect(calm.max).toBe(1); expect(calm.accel).toBeCloseTo(0.05, 6);
    expect(rage.max).toBe(2); expect(rage.accel).toBeCloseTo(0.1, 6);
  });
});

describe('混沌元素 120 传送（:57431-57460 / :60679-60696 / :18876-18946）', () => {
  function chaosWorld(): World {
    const w = new World(120, 90, 7, 'chaos-test');
    const st = w.store;
    w.groundLevel = 40;
    // 玩家脚下 60×3 实心地面（y=70），上方净空
    for (let x = 10; x < 70; x++) for (let y = 70; y < 73; y++) st.setTile(x, y, 1);
    return w;
  }
  function chaosHooks(w: World, playerAt: { x: number; y: number }): GameHooks {
    const px = playerAt.x * TILE, py = playerAt.y * TILE;
    const player = { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, vx: 0, vy: 0 };
    return {
      world: w, player,
      enemies: () => [], critters: () => [], spawnDrop: () => null,
      damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    } as unknown as GameHooks;
  }

  it('ai[3] 卡死计数到 180 → 传送到玩家附近可站格并置 -120（:60679-60696）', () => {
    const w = chaosWorld();
    const hooks = chaosHooks(w, { x: 40, y: 68 });
    const e = vanillaEnemy(120);
    e.x = 12 * TILE; e.y = 68 * TILE; e.w = 20; e.h = 40;
    e.ai3 = 180;
    const ai3 = chaosElementalStep(e, hooks, hooks.player as never);
    expect(ai3).toBe(-120);
    // 落点在玩家 20 格半径内且站在实心面上
    const tx = Math.floor((e.x + e.w / 2) / TILE), ty = Math.floor((e.y + e.h) / TILE);
    expect(Math.abs(tx - 40)).toBeLessThanOrEqual(20);
    expect(w.store.isSolid(tx, ty)).toBe(true);
  });

  it('ai[3] = -120 → 到达帧：速度清零、计数归零（:57436-57460）', () => {
    const w = chaosWorld();
    const hooks = chaosHooks(w, { x: 40, y: 68 });
    const e = vanillaEnemy(120);
    e.x = 40 * TILE; e.y = 66 * TILE; e.vx = 3; e.vy = 2;
    e.ai3 = -120;
    const ai3 = chaosElementalStep(e, hooks, hooks.player as never);
    expect(ai3).toBe(0);
    expect(e.vx).toBe(0);
    expect(e.vy).toBe(0);
  });

  it('与玩家距离 >2000px → AI_AttemptToFindTeleportSpot 直接放弃（:18885-18888）', () => {
    const w = chaosWorld();
    const hooks = chaosHooks(w, { x: 40, y: 68 });
    const e = vanillaEnemy(120);
    e.x = 40 * TILE; e.y = 66 * TILE; e.w = 20; e.h = 40;
    e.ai3 = 180;
    // 目标点在 2000px 外（玩家上空 240 列）→ 落点搜索直接判失败
    expect(attemptToFindTeleportSpot(e, hooks, 240, 68, 20, 9)).toBe(null);
    // 玩家附近无可站格（净空世界）→ 计数到 180 也不传送
    const empty = new World(120, 90, 7, 'chaos-empty');
    empty.groundLevel = 40;
    const e2 = vanillaEnemy(120);
    e2.x = 40 * TILE; e2.y = 66 * TILE; e2.w = 20; e2.h = 40;
    e2.ai3 = 180;
    const hooks2 = chaosHooks(empty, { x: 40, y: 60 });
    const ai3 = chaosElementalStep(e2, hooks2, hooks2.player as never);
    expect(ai3).toBeGreaterThanOrEqual(180);
    expect(e2.x).toBe(40 * TILE);
  });

  it('触碰玩家 AABB → ai[3] 归零（:57543-57545）', () => {
    const w = chaosWorld();
    const hooks = chaosHooks(w, { x: 40, y: 68 });
    const e = vanillaEnemy(120);
    e.x = 40 * TILE; e.y = 68 * TILE; e.w = 20; e.h = 40;   // 与玩家重叠
    e.ai3 = 100;
    expect(chaosElementalStep(e, hooks, hooks.player as never)).toBe(0);
  });
});

describe('沼泽怪 166 伏击（:56327-56360）', () => {
  it('非 166 型不受影响；伏击态接管本 tick（原地减速 + ai[2] 递增）', () => {
    const zombie = vanillaEnemy(3);
    zombie.vx = 2;
    expect(swampThingAmbushStep(zombie, false)).toBe(false);
    const e = vanillaEnemy(166);
    e.vx = 2; e.ai2 = -10;
    expect(swampThingAmbushStep(e, false)).toBe(true);
    expect(e.ai2).toBe(-9);
    expect(e.vx).toBeCloseTo(1.8, 6);
  });

  it('伏击中看见玩家 / 受击 → 立即解除（:56338-56344）', () => {
    const e = vanillaEnemy(166);
    e.ai2 = -10;
    swampThingAmbushStep(e, true);          // canSee → 归零
    expect(e.ai2).toBe(0);
    const e2 = vanillaEnemy(166);
    e2.ai2 = -10;
    e2.justHitT = 2;                        // justHit
    expect(swampThingAmbushStep(e2, false)).toBe(false);
    expect(e2.ai2).toBe(0);
  });
});
