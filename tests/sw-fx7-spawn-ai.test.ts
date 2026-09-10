// SW-FX7（2026-09-10）spawn/AI 域登记债补齐批——逐条现状定谳 + 实修回归
// 台账来源：docs/spawn-parity-gaps.md「待补(有可见影响)」+ 2026-08-17 登记批
// 本文件覆盖：
//  A. CountNPCS 全量计数通道（SW-FX7 实修）：Game→VanillaSpawner.npcCounts 注入，
//     vanilla NPC.cs CountNPCS = Main.npc 全表遍历。消费面 N 阈值门：
//     250 雨云怪 <2（:4192）/ 467 致命球 <2（:3575）/ 510 沙幽灵 <4（:3973）/
//     74+297+298 晨鸟 <6（:4328）；==0 型唯一门 513（:1703）语义与 Set 等价不受损。
//     未注入域（测试/直调）回退 activeIds 0/1 检测 = 旧退化路径保留。
//  B. 250 雨云怪 <2 门行为面（注入 2 只 → 零刷生；1 只 → 可刷生）。
//  C. noSpawnCycle 死亡面（SW-FX7 实修）：NPC.checkDead 尾 :78941 无条件置位——
//     任意非演出死亡 → 下一刷怪周期跳过（NPC.SpawnNPC :80991-80995 消费）。
//     消散面（:78797,runDespawnFx）此前已接,本批补死亡面。
//  D. 登记批已清项判别力锁定（防后续批回退）：
//     471 玩家死 EncourageDespawn(1)（:57286-57293）/ 316 幽灵 dead·>3000 离场
//     （:24812-24839）/ 546 离沙漠驱散（:63219-63229）/ 329·315 非南瓜月驱散
//     （:63230-63240）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

type Counts = Record<number, number>;

function grassWorld(): { w: World; sp: VanillaSpawner } {
  const w = new World(1300, 600, 42, 'sw-fx7');
  w.groundLevel = 100;
  w.rockLevel = 200;
  const st = w.store;
  for (let x = 380; x < 920; x++) st.setTileSilent(x, 100, 3 /* grass */);
  return { w, sp: new VanillaSpawner(w) };
}

const countNpcOf = (sp: VanillaSpawner) =>
  (sp as unknown as { countNpc(id: number): number }).countNpc.bind(sp);

describe('SW-FX7 A：CountNPCS 全量计数通道（npcCounts 注入 + 回退）', () => {
  it('注入表优先：2 只在场 → countNpc(250)=2（N 阈值门可判满）', () => {
    const { sp } = grassWorld();
    sp.activeIds = new Set([250]);
    sp.npcCounts = new Map([[250, 2]]);
    expect(countNpcOf(sp)(250)).toBe(2);
    // 467（:3575 <2 门）/ 510（:3973 <4 门）同通道
    sp.npcCounts = new Map([[467, 3], [510, 4]]);
    expect(countNpcOf(sp)(467)).toBe(3);
    expect(countNpcOf(sp)(510)).toBe(4);
  });

  it('未注入回退 activeIds 0/1（旧退化路径保留=兼容测试域）；缺席 id = 0', () => {
    const { sp } = grassWorld();
    sp.activeIds = new Set([250, 513]);
    sp.npcCounts = new Map();
    expect(countNpcOf(sp)(250)).toBe(1);   // 退化：只知在场
    expect(countNpcOf(sp)(513)).toBe(1);   // ==0 门语义不受损（:1703）
    expect(countNpcOf(sp)(999)).toBe(0);   // 全缺席
  });

  it('晨鸟和门 <6（:4328）：注入 74:3+297:2 = 5 <6 可再刷,6 = 封顶', () => {
    const { sp } = grassWorld();
    sp.npcCounts = new Map([[74, 3], [297, 2]]);
    const sum = countNpcOf(sp)(74) + countNpcOf(sp)(297) + countNpcOf(sp)(298);
    expect(sum).toBe(5);
    sp.npcCounts = new Map([[74, 4], [297, 2]]);
    expect(countNpcOf(sp)(74) + countNpcOf(sp)(297) + countNpcOf(sp)(298)).toBe(6);
  });

  it('月事件 counts 表仍可用（回退链第二级,旧消费面零变化）', () => {
    const { sp } = grassWorld();
    sp.activeIds = new Set();
    sp.npcCounts = new Map();
    (sp as unknown as { moonEvent: { counts: Map<number, number> } | null }).moonEvent =
      { counts: new Map([[341, 2]]) };
    expect(countNpcOf(sp)(341)).toBe(2);
  });
});

describe('SW-FX7 B：250 雨云怪 <2 门行为面（NPC.cs:4192）', () => {
  /** 雨+困难地表采样（:3167 臂 = 昼池之前,昼夜皆可达） */
  function rainBatch(sp: VanillaSpawner, w: World, pre: (sp: VanillaSpawner) => void): Counts {
    const counts: Counts = {};
    w.flags.hardMode = true;
    w.weather.raining = true;
    w.clock.timeOfDay = 12 / 24;
    pre(sp);
    for (let k = 0; k < 2400; k++) {
      const r = sp.spawn(650 * 16 + 8, 99 * 16, new RNG(k * 7919 + 13), 24, 14);
      if (!r || r.vanillaId == null) continue;
      counts[r.vanillaId] = (counts[r.vanillaId] ?? 0) + 1;
    }
    return counts;
  }

  it('场上 2 只雨云怪（注入 {250:2}）→ 整批零 250；1 只 → 照常掷出', () => {
    const a = grassWorld();
    const blocked = rainBatch(a.sp, a.w, (sp) => { sp.npcCounts = new Map([[250, 2]]); });
    expect(blocked[250] ?? 0).toBe(0);
    const b = grassWorld();
    const allowed = rainBatch(b.sp, b.w, (sp) => { sp.npcCounts = new Map([[250, 1]]); });
    expect(allowed[250] ?? 0).toBeGreaterThan(0);
  });
});

describe('SW-FX7 C：noSpawnCycle 死亡面（NPC.checkDead :78941）', () => {
  function makeGame(flags: Record<string, unknown>) {
    return {
      enemies: () => [] as unknown[],
      spawnDrop: () => null,
      playSfx: () => {},
      playSfxFiles: () => {},
      spawnParticles: () => {},
      spawnDust: () => null,
      addDamageNumber: () => {},
      onEnemyKilled: () => {},
      cutTile: () => {},
      world: { flags: {} as Record<string, boolean>, difficulty: 0, isExpert: false },
      player: { hp: 100, maxHp: 100, dead: false, luck: 0, team: 0, buffs: { has: () => false }, addDPS: () => {} },
      ...flags,
    } as unknown as GameHooks;
  }

  it('致死一击 → noSpawnCycleThisFrame 置位（=原版下一周期刷怪跳过）', () => {
    const game = makeGame({});
    const e = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;   // 僵尸（无血尽转换支）
    e.hurt(e.hp + 100, 0, 0, game, 0, false, 1, true);
    expect(e.dead).toBe(true);
    expect(game.noSpawnCycleThisFrame).toBe(true);
  });

  it('未致死不置位（门与死亡面同源,不误伤常规受击帧）', () => {
    const game = makeGame({});
    const e = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;
    e.hurt(10, 0, 0, game, 0, false, 1, true);
    expect(e.dead).toBe(false);
    expect(game.noSpawnCycleThisFrame).not.toBe(true);
  });

  it('血尽转演出族（星璇塔 517,checkDead :78867 转支）不置位——非真死', () => {
    const game = makeGame({});
    const e = Enemy.fromVanilla(517, 100 * 16, 50 * 16)!;
    e.hurt(e.hp + 100, 0, 0, game, 0, false, 1, true);
    expect(e.dead).toBe(false);
    expect(game.noSpawnCycleThisFrame).not.toBe(true);
  });
});

describe('SW-FX7 D：登记批已清项判别力锁定', () => {
  // 世界 300×200：敌怪放玩家 3000px 外/屏外（>960+半宽）——共享尾 CheckActive
  // 的屏内 despawnTimer=750 重置不触发，AI 内 EncourageDespawn 效果可观测
  function aiWorld(playerAt: { x: number; y: number; dead?: boolean }) {
    const w = new World(300, 200, 42, 'sw-fx7-ai');
    const st = w.store;
    for (let x = 20; x <= 280; x++) st.setTileSilent(x, 60, 2);
    const player = {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: playerAt.dead ?? false, useTime: 0, vx: 0, vy: 0,
    };
    const hooks = {
      world: w,
      player,
      enemies: () => [] as unknown[],
      playSfx: () => {},
      playSfxFiles: () => {},
      playSfxWav: () => {},
      spawnParticles: () => {},
      spawnDust: () => null,
      spawnDrop: () => null,
      damagePlayer: (): number => 0,
      addDamageNumber: () => {},
      entities: { add: () => {} },
    } as never;
    return { w, hooks, player };
  }
  const FAR_X = 260;   // 260*16−40*16 = 3520px >3000 且远超屏窗

  it('471 哥布林召唤师：玩家死 → EncourageDespawn(1)（NPC.cs:57286-57293）', () => {
    const { hooks } = aiWorld({ x: 40, y: 59, dead: true });
    const e = Enemy.fromVanilla(471, FAR_X * 16, 59 * 16)!;
    e.ai3 = 0;                                  // 地面态（态机尾为死亡快散支）
    e.fixedUpdate(1 / 60, hooks);
    expect(e.despawnEncouraged).toBe(true);
    expect(e.despawnTimer).toBeLessThanOrEqual(1);
  });

  it('316 墓园幽灵：玩家死/3000px 外 → EncourageDespawn(10)（:24812-24839）', () => {
    const deadHooks = aiWorld({ x: 40, y: 59, dead: true });
    const a = Enemy.fromVanilla(316, FAR_X * 16, 58 * 16)!;
    a.ai3 = 0;
    a.fixedUpdate(1 / 60, deadHooks.hooks);
    expect(a.despawnEncouraged).toBe(true);
    expect(a.despawnTimer).toBeLessThanOrEqual(10);
    // >3000px 面（存活玩家但远超 3000px）
    const farHooks = aiWorld({ x: 40, y: 59 });
    const b = Enemy.fromVanilla(316, FAR_X * 16, 58 * 16)!;
    b.ai3 = 0;
    b.fixedUpdate(1 / 60, farHooks.hooks);
    expect(Math.hypot(FAR_X * 16 - 40 * 16, 0)).toBeGreaterThan(3000);
    expect(b.despawnEncouraged).toBe(true);
  });

  it('546 怒滚虫：目标不在沙漠 → EncourageDespawn(10)+停追（:63219-63229）', () => {
    const { hooks } = aiWorld({ x: 40, y: 59 });
    const e = Enemy.fromVanilla(546, FAR_X * 16, 59 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.despawnEncouraged).toBe(true);
    expect(e.despawnTimer).toBeLessThanOrEqual(10);
  });

  it('329 地狱犬/315 无头骑士：非南瓜月 → EncourageDespawn(10)（:63230-63240）', () => {
    for (const vid of [329, 315]) {
      const { hooks } = aiWorld({ x: 40, y: 59 });
      const e = Enemy.fromVanilla(vid, FAR_X * 16, 59 * 16)!;
      e.fixedUpdate(1 / 60, hooks);
      expect(e.despawnEncouraged, `vid=${vid}`).toBe(true);
      expect(e.despawnTimer, `vid=${vid}`).toBeLessThanOrEqual(10);
    }
  });
});
