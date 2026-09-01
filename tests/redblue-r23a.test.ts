// 红蓝对抗 R23a 修复回归（红队报告 /tmp/recon/red-team-r23a.md 必修清单）：
//   1. 触须 264 专家动态半径血量参照 = 触须自身 life（NPC.cs:32531-32535）
//      ——曾误用本体 hp → 全体触须随本体掉血同步外扩
//   2. WoF Leech 链 off-by-one：头 ai[2]=Next(3,6) 是【身节数】不含尾
//      （NPC.cs:51883-51902）→ 全链 {4,5,6} 段；曾按"身+尾总数"传 3+rnd(3)
//   3. Plantera 专家 justHit 强发：受击 Next(2)==0 → 下次蓄力满无视视线
//      （NPC.cs:32144-32147/:32158-32162）；普通档无此掷、隔墙不发
//   4. FTW 克脑重力倒置：二阶段置锚（NPC.cs:32650-32653）+ 消费端距 <4000px
//      gravDir=-1（Player.cs:26489-26496/Main.cs:18127）；FTW 门控（普通种子零行为）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { BuffState } from '../src/stats/Buffs';
import { planteraAI, planteraTentacleAI, planteraTentacle2AI, queenBeeAI }
  from '../src/entities/bossAI_queenbee_plantera';
import { brainOfCthulhuAI } from '../src/entities/bossAI';
import { wallOfFleshAI } from '../src/entities/bossAI_wof';
import { consumeBrainOfGravity } from '../src/entities/Player';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

const THORN = TILE_BY_KEY['v_655_plantera_thorns']!;
/** 内部 id ≠ vanilla sheet——按 sheet 1（石）反解（wof-hardmode.test 同款） */
const STONE = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 1);

function makeWorld(opts: { expert?: boolean; ftw?: boolean; w?: number; h?: number } = {}): World {
  const w = new World(opts.w ?? 200, opts.h ?? 260, 7, 'r23a');
  w.groundLevel = 50;
  if (opts.expert) w.difficulty = 1;
  if (opts.ftw) w.seedFlags = { getGoodWorld: true };
  return w;
}

/** 假宿主：enemies/projectiles 共桶分流（spawnPart/shoot 经 entities.add 写入） */
function makeHooks(world: World, playerAt?: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'projectiles') projectiles.push(e);
      else enemies.push(e as Enemy);
    },
  };
  const px = (playerAt?.x ?? 100) * TILE, py = (playerAt?.y ?? 55) * TILE;
  const player = {
    x: px - 10, y: py - 21, w: 20, h: 42, cx: px, cy: py,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: new BuffState(),
  };
  const hooks = {
    world, player,
    scene: { zoneJungle: true },
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: typeof em }).entities = em;
  return { hooks, enemies, projectiles, player };
}

/** 全图实心石 + 掏一条空气走廊（荆棘随机游走落点域） */
function solidWorldWithCorridor(ftw: boolean): World {
  const w = makeWorld({ ftw });
  const st = w.store;
  for (let x = 0; x < st.w; x++) for (let y = 0; y < st.h; y++) st.setTileSilent(x, y, STONE);
  for (let x = 40; x <= 170; x++) for (let y = 46; y <= 58; y++) {
    const i = st.idx(x, y);
    st.flags[i] = 0; st.type[i] = 0;
  }
  return w;
}

const thornCount = (w: World): number => {
  let n = 0;
  for (let x = 0; x < w.store.w; x++) for (let y = 0; y < w.store.h; y++) {
    if (w.store.get(x, y) === THORN) n++;
  }
  return n;
};

// ===========================================================================
// 1. 触须 264 动态半径血量参照（NPC.cs:32531-32535 num843=1-life/lifeMax 用自身）
// ===========================================================================
describe('R23a-1 触须动态半径参照自身血量', () => {
  it('专家档：残血触须轨道外扩、满血触须不动（同几何对照；误用本体血量时两者全等）', () => {
    const rand = Math.random; Math.random = () => 0;   // 偏移重掷/方向全确定
    try {
      // 偏移重掷 l[0]=120..480→120、ai0/ai1=-100..100→-100（rand=0）→ 目标方向 (-√2/2,-√2/2)
      const run = (tentacleHpRatio: number): number => {
        const w = makeWorld({ expert: true });
        const { hooks, enemies } = makeHooks(w, { x: 100, y: 40 });
        const boss = Enemy.fromVanilla(262, 100 * TILE, 130 * TILE)!;
        em_add(hooks, boss);
        const ten = Enemy.fromVanilla(264, boss.cx, boss.cy)!;
        em_add(hooks, ten);
        ten.bInit = true;
        ten.hp = Math.max(1, Math.round(ten.maxHp * tentacleHpRatio));
        planteraTentacle2AI(ten, hooks, hooks.player as never);   // 重掷偏移(-100,-100)
        // 把触须放到满血轨道半径的落点上（沿重掷方向的单位射线 ×200px）
        const d = Math.hypot(-100, -100);
        ten.x = boss.cx + (-100 / d) * 200 - ten.w / 2;
        ten.y = boss.cy + (-100 / d) * 200 - ten.h / 2;
        ten.vx = 0; ten.vy = 0;
        planteraTentacle2AI(ten, hooks, hooks.player as never);
        void enemies;
        return Math.abs(ten.vx);
      };
      const healthy = run(1);     // orbit=200+300×0 → 已在目标点不动
      const wounded = run(0.5);   // orbit=200+300×0.5=350 → 向外加速 |vx|>0
      expect(healthy).toBe(0);
      expect(wounded).toBeGreaterThan(0);
    } finally { Math.random = rand; }
  });

  it('经典档无动态半径项：残血与满血行为一致', () => {
    const rand = Math.random; Math.random = () => 0;
    try {
      const run = (ratio: number): number => {
        const w = makeWorld({});
        const { hooks } = makeHooks(w, { x: 100, y: 40 });
        const boss = Enemy.fromVanilla(262, 100 * TILE, 130 * TILE)!;
        em_add(hooks, boss);
        const ten = Enemy.fromVanilla(264, boss.cx, boss.cy)!;
        em_add(hooks, ten);
        ten.bInit = true;
        ten.hp = Math.max(1, Math.round(ten.maxHp * ratio));
        planteraTentacle2AI(ten, hooks, hooks.player as never);
        const d = Math.hypot(-100, -100);
        ten.x = boss.cx + (-100 / d) * 200 - ten.w / 2;
        ten.y = boss.cy + (-100 / d) * 200 - ten.h / 2;
        ten.vx = 0; ten.vy = 0;
        planteraTentacle2AI(ten, hooks, hooks.player as never);
        return Math.abs(ten.vx);
      };
      expect(run(1)).toBe(run(0.5));   // 无 expert 300×(1-血比) 项 → 等宽轨道
    } finally { Math.random = rand; }
  });
});

// ===========================================================================
// 2. WoF Leech 链段数（NPC.cs:51883-51902：ai[2]=Next(3,6) 是身节数,+尾={4,5,6}段）
// ===========================================================================
describe('R23a-2 Leech 链 off-by-one', () => {
  it('身节 118 数量 = Next(3,6) 本值（rand=0 → 4 段全链 = 身3+尾1，旧错码只给身2）', () => {
    const rand = Math.random; Math.random = () => 0;
    try {
      const w = makeWorld({ h: 260 });
      const { hooks, enemies } = makeHooks(w);
      const wof = Enemy.fromVanilla(113, 100 * TILE, (w.store.h - 160) * TILE)!;
      em_add(hooks, wof);
      wof.ai1 = 2701; wof.ai2 = 1;   // 直入放虫轮（跳过 2700t 攒气）
      wallOfFleshAI(wof, hooks, null);
      const heads = enemies.filter((n) => n.vanillaId === 117).length;
      const bodies = enemies.filter((n) => n.vanillaId === 118).length;
      const tails = enemies.filter((n) => n.vanillaId === 119).length;
      expect(heads).toBe(1);
      expect(bodies).toBe(3);        // ai[2]=Next(3,6)=3（rand=0）＝身节数
      expect(tails).toBe(1);         // 归零转尾
    } finally { Math.random = rand; }
  });

  it('rand 掷中区间上段 → 身4+尾1（Next(3,6) 三档可采,{4,5,6} 全链）', () => {
    const rand = Math.random; Math.random = () => 0.5;   // 4+floor(0.5*3)=5 → 身4+尾1
    try {
      const w = makeWorld({ h: 260 });
      const { hooks, enemies } = makeHooks(w);
      const wof = Enemy.fromVanilla(113, 100 * TILE, (w.store.h - 160) * TILE)!;
      em_add(hooks, wof);
      wof.ai1 = 2701; wof.ai2 = 1;
      wallOfFleshAI(wof, hooks, null);
      expect(enemies.filter((n) => n.vanillaId === 118).length).toBe(4);
      expect(enemies.filter((n) => n.vanillaId === 119).length).toBe(1);
    } finally { Math.random = rand; }
  });
});

// ===========================================================================
// 3. Plantera 专家 justHit 强发门（NPC.cs:32144-32147/:32158-32162）
// ===========================================================================
function drivePlanteraShots(expert: boolean, blockLos: boolean): number {
  const rand = Math.random; Math.random = () => 0;
  try {
    const w = makeWorld({ expert });
    if (blockLos) {
      // 视线遮挡墙：boss(100,50) ↔ 玩家(140,50) 连线上的实心柱
      for (let y = 30; y <= 80; y++) {
        w.store.setTile(119, y, STONE);
        w.store.setTile(120, y, STONE);
      }
    }
    const { hooks, projectiles } = makeHooks(w, { x: 140, y: 50 });
    const e = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
    em_add(hooks, e);
    for (let t = 0; t < 60; t++) {
      e.justHitT = 2;               // 保持"本 tick 受击"窗口
      planteraAI(e, hooks, (hooks as unknown as { player: Player }).player);
    }
    return projectiles.length;
  } finally { Math.random = rand; }
}

describe('R23a-3 Plantera justHit 强发', () => {
  it('专家+隔墙+持续受击 → 蓄力满无视视线强发（曾整缺=恒 0 发）', () => {
    expect(drivePlanteraShots(true, true)).toBeGreaterThan(0);
  });
  it('普通档同场景 → 无强发掷,隔墙恒 0 发', () => {
    expect(drivePlanteraShots(false, true)).toBe(0);
  });
  it('专家+无遮挡 → 正常视线发射照常（墙确实挡弹/正常通路未破坏）', () => {
    expect(drivePlanteraShots(true, false)).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 4a. FTW 克脑重力倒置——生产端置锚（NPC.cs:32650-32653）+ FTW 门控
// ===========================================================================
describe('R23a-4a 克脑二阶段重力倒置锚', () => {
  it('FTW：爬行者清零进二阶段后 world.brainOfGravity=本体 id', () => {
    const w = makeWorld({ ftw: true });
    const { hooks } = makeHooks(w);
    const brain = Enemy.fromVanilla(266, 110 * TILE, 130 * TILE)!;
    brain.bInit = true;            // 跳过爬行者生成（模拟已清零）
    em_add(hooks, brain);
    brainOfCthulhuAI(brain, hooks, hooks.player as never);   // 一阶段→ai0=-1
    expect(brain.ai0).toBe(-1);
    brainOfCthulhuAI(brain, hooks, hooks.player as never);   // 二阶段 tick 置锚
    expect(w.brainOfGravity).toBe(brain.id);
  });

  it('普通种子：二阶段不置锚（恒 -1,运行时等价金标纪律）', () => {
    const w = makeWorld({});
    const { hooks } = makeHooks(w);
    const brain = Enemy.fromVanilla(266, 110 * TILE, 130 * TILE)!;
    brain.bInit = true;
    em_add(hooks, brain);
    brainOfCthulhuAI(brain, hooks, hooks.player as never);
    brainOfCthulhuAI(brain, hooks, hooks.player as never);
    expect(brain.ai0).toBe(-1);
    expect(w.brainOfGravity).toBe(-1);
  });
});

// ===========================================================================
// 4b. 消费端 forcedGravity（Player.cs:26489-26496 + Main.cs:18127 失效清除）
// ===========================================================================
function fakeP(cx: number, cy: number): { p: Player; gravDir: () => 1 | -1; t: () => number } {
  const holder = { p: null as unknown as Player };
  const p = {
    cx, cy, gravDir: 1 as 1 | -1, forcedGravityT: 0, buffs: new BuffState(),
  } as unknown as Player;
  holder.p = p;
  return { p, gravDir: () => p.gravDir, t: () => p.forcedGravityT };
}

describe('R23a-4b 重力倒置消费端', () => {
  it('距脑 <4000px → 计数刷新 10 且 gravDir=-1', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w);
    const brain = Enemy.fromVanilla(266, 0, 0)!;
    em_add(hooks, brain);
    w.brainOfGravity = brain.id;
    const { p, gravDir, t } = fakeP(brain.cx + 100, brain.cy);   // 远小于 4000px
    consumeBrainOfGravity(p, hooks);
    expect(gravDir()).toBe(-1);
    expect(t()).toBe(9);           // 置 10 后当 tick 衰减一次
  });

  it('出距后计数耗尽 → 归位 gravDir=1（原版 :26933 else 支复位）', () => {
    const w = makeWorld();
    const { hooks, enemies } = makeHooks(w);
    const brain = Enemy.fromVanilla(266, 0, 0)!;
    em_add(hooks, brain);
    w.brainOfGravity = brain.id;
    const far = 5000;
    const { p, gravDir, t } = fakeP(far, 0);
    p.forcedGravityT = 1;          // 残余 1t
    consumeBrainOfGravity(p, hooks);
    expect(t()).toBe(0);
    expect(gravDir()).toBe(1);
    void enemies;
  });

  it('锚失效（死亡/非 266）→ 清 -1（Main.cs:18127），gravDir 不动', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w);
    const dead = Enemy.fromVanilla(266, 0, 0)!;
    em_add(hooks, dead);
    dead.dead = true;
    w.brainOfGravity = dead.id;
    const { p, gravDir } = fakeP(0, 0);
    consumeBrainOfGravity(p, hooks);
    expect(w.brainOfGravity).toBe(-1);
    expect(gravDir()).toBe(1);
  });
});

// ===========================================================================
// 4c. FTW 钩蔓抵锚撒荆棘（NPC.cs:32462-32475 + WorldGen.cs:76875）
// ===========================================================================
describe('R23a-4c 钩蔓 SpawnPlanteraThorns', () => {
  function driveHookThorns(ftw: boolean): number {
    const rand = Math.random; Math.random = () => 0;
    try {
      const w = solidWorldWithCorridor(ftw);
      const { hooks } = makeHooks(w, { x: 60, y: 52 });   // 玩家放空气走廊内
      const boss = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
      em_add(hooks, boss);
      const hook = Enemy.fromVanilla(263, boss.cx, boss.cy)!;
      hook.bInit = true;
      em_add(hooks, hook);
      // tick1：锚搜索（flag54 路径,rand=0 → 收实心探针点）→ 飞行中 localAI[3]=1
      planteraTentacleAI(hook, hooks, null);
      if (hook.ai0 <= 0 || hook.ai1 <= 0) return -1;      // 锚没收到（环境失配,防御）
      // tick2：锚改钉到钩蔓脚下 → 抵锚分支 → FTW 撒荆棘
      hook.ai0 = Math.floor(hook.cx / TILE);
      hook.ai1 = Math.floor(hook.cy / TILE);
      planteraTentacleAI(hook, hooks, null);
      return thornCount(w);
    } finally { Math.random = rand; }
  }

  it('FTW：飞行后抵锚瞬间撒荆棘 tile 655', () => {
    expect(driveHookThorns(true)).toBeGreaterThanOrEqual(10);
  });
  it('普通种子：抵锚零荆棘（FTW 门控）', () => {
    expect(driveHookThorns(false)).toBe(0);
  });

  it('FTW 但未经历飞行帧（localAI[3]=0 直接抵锚）→ 不撒', () => {
    const rand = Math.random; Math.random = () => 0;
    try {
      const w = makeWorld({ ftw: true });   // 空世界：锚搜索失败 → 保留手工邻位锚
      const { hooks } = makeHooks(w, { x: 100, y: 52 });
      const boss = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
      em_add(hooks, boss);
      const hook = Enemy.fromVanilla(263, boss.cx, boss.cy)!;
      hook.bInit = true;
      hook.ai0 = Math.floor(hook.cx / TILE);
      hook.ai1 = Math.floor(hook.cy / TILE);
      em_add(hooks, hook);
      planteraTentacleAI(hook, hooks, null);
      expect(thornCount(w)).toBe(0);
    } finally { Math.random = rand; }
  });
});

// ===========================================================================
// 4d. FTW 触须 1/10 反射弹幕（NPC.cs:32487-32497）
// ===========================================================================
describe('R23a-4d 触须 reflectsProjectiles', () => {
  function driveReflect(ftw: boolean, randVal: number): boolean | null {
    const rand = Math.random; Math.random = () => randVal;
    try {
      const w = makeWorld({ ftw });
      const { hooks } = makeHooks(w);
      const boss = Enemy.fromVanilla(262, 100 * TILE, 130 * TILE)!;
      em_add(hooks, boss);
      const ten = Enemy.fromVanilla(264, boss.cx + 300, boss.cy)!;
      ten.bInit = true;
      em_add(hooks, ten);
      planteraTentacle2AI(ten, hooks, hooks.player as never);
      return ten.reflectsProjectiles;
    } finally { Math.random = rand; }
  }

  it('FTW：掷中（Next(10)==0）→ 反射开', () => {
    expect(driveReflect(true, 0)).toBe(true);
  });
  it('FTW：掷不中 → 每 tick 复位 false（原版 else 支显式清位）', () => {
    expect(driveReflect(true, 0.99)).toBe(false);
  });
  it('普通种子：字段恒 false 不被触碰', () => {
    expect(driveReflect(false, 0)).toBe(false);
  });
});

// ===========================================================================
// 5. QB timeLeft 保活地板（NPC.cs:30419-30421）
// ===========================================================================
describe('R23a-5 QB timeLeft 保活地板', () => {
  it('非离场态 despawnTimer<60 抬到 60', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w);
    const bee = Enemy.fromVanilla(222, 100 * TILE, 100 * TILE)!;
    em_add(hooks, bee);
    bee.ai0 = 0; bee.despawnTimer = 10;
    queenBeeAI(bee, hooks, hooks.player as never);
    expect(bee.despawnTimer).toBeGreaterThanOrEqual(60);
  });

  it('离场态(ai0=5)不抬地板（EncourageDespawn(10) 语义保留）', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w);
    const bee = Enemy.fromVanilla(222, 100 * TILE, 100 * TILE)!;
    em_add(hooks, bee);
    bee.bInit = true;               // 跳过首帧 ai0 归零（否则会被重置回 0）
    bee.ai0 = 5; bee.despawnTimer = 10;
    queenBeeAI(bee, hooks, hooks.player as never);
    expect(bee.despawnTimer).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
function em_add(hooks: GameHooks, e: Enemy): void {
  (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
}
