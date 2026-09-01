// 弹 540 星尘标记（StardustTowerMark，aiStyle 103）+ 402 星尘织带蠕虫孵化链回归。
// 语义源：Projectile.cs:5873-5879（SetDefaults）、:32272-32299（AI_103 淡入/淡出/
// 孵化门——ai0 先自增再分支）、NPC.cs:44230-44314（SpawnStardustMark_StardustWorm
// BFS 世代链，仅末位标记回填 localAI[0]）、Main.cs:32589-32616（Extra_47 落点束）。
// 节律推演（ai0 初值 −10D）：世代 0 第 11 tick 孵化/39 消亡；世代 D≥1 第 10D+10
// 孵化/10D+39 消亡（255/25=10.2 → 第 11 次淡入递减破零；淡出 0→250 需 10 tick）。
import { describe, expect, it, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';   // 模块尾 bindEnemyCtor(Enemy) 自绑定
import { StardustMarkProj, spawnStardustMarks } from '../src/entities/StardustMarkProj';
import type { GameHooks } from '../src/entities/types';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';

function makeHooks(tw = 60, th = 60) {
  const w = new World(tw, th, 11, 'stardust-mark');
  w.groundLevel = Math.floor(th * 0.5);
  const enemies: Enemy[] = [];
  const projectiles: StardustMarkProj[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as StardustMarkProj);
    },
  };
  const player = new Player(tw * TILE / 2, th * TILE / 2 - 5 * TILE, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => enemies, critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {}, entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, em, world: w, player };
}

describe('StardustMarkProj（aiStyle 103，Projectile.cs:32272-32299）', () => {
  it('规格：20×20 / 恒静止（velocity 不作位移——UpdatePosition :19028 对 540 早退）', () => {
    const m = new StardustMarkProj(1000, 500, 30, -100, 0);
    expect(m.w).toBe(20);
    expect(m.h).toBe(20);
    expect(m.x).toBe(1000); expect(m.y).toBe(500);   // NewProjectile 左上角原样
    const { hooks } = makeHooks();
    for (let t = 0; t < 39; t++) m.fixedUpdate(1 / 60, hooks);
    expect(m.x).toBe(1000); expect(m.y).toBe(500);
  });

  it('世代 0：第 11 tick 孵化 402 @ (Center.X, Bottom.Y)，第 39 tick 消亡且不重复孵化', () => {
    const { hooks, enemies } = makeHooks();
    const m = new StardustMarkProj(1000, 500, 30, -100, 0);
    m.hatchType = 402;
    for (let t = 0; t < 10; t++) m.fixedUpdate(1 / 60, hooks);
    expect(enemies.length).toBe(0);                  // 255−25×10=5 未破零
    m.fixedUpdate(1 / 60, hooks);                    // t=11：−20 → 归 0 → NewNPC
    expect(enemies.length).toBe(1);
    expect(enemies[0].vanillaId).toBe(402);
    // NewNPC((int)Center.X, (int)Bottom.Y) 是 **Bottom 锚**（NPC.cs:81547）→ 孵化怪
    // 底边中心 = 弹底（2026-08-18 审查勘误：曾按中心锚断言 cy=520，差 h/2）
    expect(enemies[0].cx).toBeCloseTo(1010, 5);
    expect(enemies[0].cy).toBeCloseTo(520 - enemies[0].h / 2, 5);   // 中心 = 底 - h/2
    let t = 11;                                      // 前面已手动推过 11 tick
    for (; t < 60 && !m.dead; t++) {
      m.fixedUpdate(1 / 60, hooks);
      expect(enemies.length).toBe(1);                // localAI[1] 门：恒 1 只
    }
    expect(t).toBe(39);                              // 10D+39（D=0）
  });

  it('世代 3（ai0 初值 −30）：第 40 tick 孵化、第 69 tick 消亡（10D+10 / 10D+39）', () => {
    const { hooks, enemies } = makeHooks();
    const m = new StardustMarkProj(0, 0, 50, 50, 3);
    m.hatchType = 407;
    let spawnT = -1, t = 0;
    for (; t < 120 && !m.dead; t++) {
      m.fixedUpdate(1 / 60, hooks);
      if (spawnT < 0 && enemies.length > 0) spawnT = t + 1;
    }
    expect(spawnT).toBe(40);
    expect(enemies[0].vanillaId).toBe(407);
    expect(t).toBe(69);
  });

  it('hatchType=0（BFS 非末位标记）：全程无孵化，寿命同节律自灭', () => {
    const { hooks, enemies } = makeHooks();
    const m = new StardustMarkProj(0, 0, 10, 10, 1);
    let t = 0;
    for (; t < 120 && !m.dead; t++) m.fixedUpdate(1 / 60, hooks);
    expect(t).toBe(49);                              // 10×1+39
    expect(enemies.length).toBe(0);
  });
});

describe('spawnStardustMarks（NPC.cs:44230-44314 BFS 世代链）', () => {
  it('random=0 确定性走查：直链 4 只（分叉预算 0）、仅末位孵化 405、之字游走锚点', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const { hooks, projectiles } = makeHooks();
      const marks = spawnStardustMarks(hooks, 1000, 500, 'worm')!;
      expect(marks.length).toBe(4);                  // 根深 Next(3,6)=3 → gen 0..3
      expect(projectiles.length).toBe(4);            // 全部入 projectiles 桶
      // 池 [405,402,407] SelectRandom(rand=0) → 405；仅末位回填（localAI[0]，:44308）
      expect(marks[3].hatchType).toBe(405);
      expect(marks.slice(0, 3).every((m) => m.hatchType === 0)).toBe(true);
      // gen0：ang=(0.5−0)·π/8、dist=100+100·0 → v=(sin π/8, −cos π/8)·100
      expect(marks[0].x).toBe(1000); expect(marks[0].y).toBe(500);
      expect(marks[0].vx).toBeCloseTo(Math.sin(Math.PI / 8) * 100, 5);
      expect(marks[0].vy).toBeCloseTo(-Math.cos(Math.PI / 8) * 100, 5);
      // 世代锚点 = 前锚 + 该代标记的速度向量（奇代 π 基角之字下行）
      expect(marks[1].x).toBeCloseTo(1000 + Math.sin(Math.PI / 8) * 100, 5);
      expect(marks[1].y).toBeCloseTo(500 - Math.cos(Math.PI / 8) * 100, 5);
      expect(marks[2].x).toBeCloseTo(marks[1].x + Math.sin(1.375 * Math.PI) * 100, 5);
      expect(marks[2].y).toBeCloseTo(marks[1].y - Math.cos(1.375 * Math.PI) * 100, 5);
      // 深度耗尽末梢 v=(0,0)（childDepth−1<0，:44288-44291）
      expect(marks[3].vx).toBe(0); expect(marks[3].vy).toBe(0);
      // 逐只推到消亡：gen0..2 不孵化（−1），末位 gen3 第 40 tick 孵出唯一 405
      const hatchTimes: number[] = [];
      for (const m of marks) {
        const before = (hooks.enemies() as Enemy[]).length;
        let hatchT = -1, t = 0;
        for (; t < 120 && !m.dead; t++) {
          m.fixedUpdate(1 / 60, hooks);
          if (hatchT < 0 && (hooks.enemies() as Enemy[]).length > before) hatchT = t + 1;
        }
        hatchTimes.push(hatchT);
      }
      expect(hatchTimes).toEqual([-1, -1, -1, 40]);
      expect((hooks.enemies() as Enemy[])[0].vanillaId).toBe(405);
    } finally {
      rnd.mockRestore();
    }
  });

  it('空池（405∪406≥2 且 402≥3 且 407≥1）→ null 静默（:44244-44247）', () => {
    const { hooks, enemies } = makeHooks();
    const stub = (id: number) => ({ vanillaId: id, dead: false }) as unknown as Enemy;
    enemies.push(stub(405), stub(406), stub(402), stub(402), stub(402), stub(407));
    expect(spawnStardustMarks(hooks, 0, 0, 'worm')).toBeNull();
  });

  it('蠕虫版 402 池上限 3 / 塔版 2（两变体唯一计数差，:44237 vs :44149）', () => {
    const { hooks, enemies } = makeHooks();
    const stub = (id: number) => ({ vanillaId: id, dead: false }) as unknown as Enemy;
    // 其余门关死（405∪406=2、407=1），402=2：蠕虫版 2<3 开 / 塔版 2<2 关
    enemies.push(stub(405), stub(406), stub(402), stub(402), stub(407));
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const worm = spawnStardustMarks(hooks, 0, 0, 'worm')!;
      expect(worm.length).toBeGreaterThan(0);
      expect(worm[worm.length - 1].hatchType).toBe(402);   // 蠕虫版池=[402]
      expect(spawnStardustMarks(hooks, 0, 0, 'tower')).toBeNull();  // 塔版全关门
    } finally {
      rnd.mockRestore();
    }
  });
});

describe('wormAI 402 接线（NPC.cs:51424-51461 → SpawnStardustMark_StardustWorm）', () => {
  it('第 570 tick 冲刺点触发标记链（+4）、ai2 600 归零后第 1170 tick 二次爆发', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const h = makeHooks(300, 120);                 // 大世界防出界
      const worm = Enemy.fromVanilla(402, h.player.cx, h.player.cy - 4 * TILE)!;
      h.em.add(worm, 'enemies');
      for (let t = 0; t < 569; t++) {
        worm.fixedUpdate(1 / 60, h.hooks);
        expect(h.projectiles.length).toBe(0);
      }
      worm.fixedUpdate(1 / 60, h.hooks);             // 第 570 tick：ai2==570 尘暴+标记链
      expect(h.projectiles.length).toBe(4);
      expect(h.projectiles[3].hatchType).toBe(405);  // 池随机（rand=0 → 405）
      // 571..600 计满归零 → 新周期 1..570 → 全局第 1170 tick 二次爆发（周期 600）
      for (let t = 0; t < 599; t++) worm.fixedUpdate(1 / 60, h.hooks);
      expect(h.projectiles.length).toBe(4);          // 中途无新弹
      worm.fixedUpdate(1 / 60, h.hooks);             // 第 600 tick 后恰好再满 570
      expect(h.projectiles.length).toBe(8);
      expect(worm.dead).toBe(false);                 // ★不自灭（渐隐归渲染端）
    } finally {
      rnd.mockRestore();
    }
  });
});
