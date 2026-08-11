import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// 敌怪远程攻击回归（对照 1456 NPC.cs 各发射点）
type DartLike = { x: number; y: number; vx: number; vy: number; damage: number };

/** 开阔世界 + 玩家 + 收集发射的弹幕 */
function shooterWorld(playerAt: { x: number; y: number }) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 20; x <= 60; x++) st.setTileSilent(x, 60, 2); // 地板
  const shots: DartLike[] = [];
  const player = {
    x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
    cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
    dead: false, useTime: 0,
  };
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: () => {},
    entities: { add: (e: unknown) => { shots.push(e as DartLike); } },
  } as never;
  return { w, hooks, shots, player: player as unknown as { useTime: number } };
}

/** 跑 tick 直到出弹或超时；返回消耗 tick 数（-1 = 超时未发射） */
function runUntilShot(e: Enemy, hooks: never, shots: DartLike[], maxTicks: number): number {
  for (let t = 0; t < maxTicks; t++) {
    e.fixedUpdate(1 / 60, hooks);
    if (shots.length > 0) return t;
  }
  return -1;
}

describe('敌怪远程攻击（对照原版发射点）', () => {
  it('黄蜂 42：玩家挥动中（useTime>0）且有视线 → 发射毒刺（原版待机清零门）', () => {
    const { hooks, shots, player } = shooterWorld({ x: 40, y: 50 });
    player.useTime = 1; // 持续挥动
    const e = Enemy.fromVanilla(42, 38 * 16, 50 * 16)!;
    const t = runUntilShot(e, hooks, shots, 1200); // 期望 ~104t；朝向门失败会整轮重来，留足余量
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(10);       // 毒刺伤害 10
    const spd = Math.hypot(shots[0].vx, shots[0].vy);
    expect(spd).toBeCloseTo(8, 1);          // 弹速 8
  });

  it('黄蜂 42：玩家全程待机 → 永不射刺（cs:51161 itemAnimation 门）', () => {
    const { hooks, shots } = shooterWorld({ x: 40, y: 50 });
    const e = Enemy.fromVanilla(42, 38 * 16, 50 * 16)!;
    const t = runUntilShot(e, hooks, shots, 600);
    expect(t).toBe(-1);
  });

  it('哈比 48：有视线 → ai[0] 30/60/90 三连羽（速 6、伤 15）', () => {
    const { hooks, shots } = shooterWorld({ x: 40, y: 52 });
    const e = Enemy.fromVanilla(48, 40 * 16, 48 * 16)!;
    const t = runUntilShot(e, hooks, shots, 200);
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(15);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(6, 1);
  });

  it('骷髅弓手 110：落地 + 视线 + <700px → 蓄力半程发射火焰箭（伤 35）', () => {
    const { hooks, shots, player } = shooterWorld({ x: 44, y: 59 });
    player.useTime = 1; // cs:60036-60039 idle 门：目标待机（itemAnimation==0）不开瞄
    const e = Enemy.fromVanilla(110, 40 * 16, 59 * 16)!;
    const t = runUntilShot(e, hooks, shots, 300);
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(35);
  });

  it('骷髅弓手 110：目标全程待机 → 不开瞄不射（cs:60037 idle 门）', () => {
    const { hooks, shots } = shooterWorld({ x: 44, y: 59 });
    const e = Enemy.fromVanilla(110, 40 * 16, 59 * 16)!;
    const t = runUntilShot(e, hooks, shots, 400);
    expect(t).toBe(-1);
  });

  it('蜗牛怪 122：待机 120t + 视线 → 充能至 32 发射粉激光（速 7、伤 25、<700px）', () => {
    const { hooks, shots } = shooterWorld({ x: 44, y: 55 });
    const e = Enemy.fromVanilla(122, 40 * 16, 55 * 16)!;
    const t = runUntilShot(e, hooks, shots, 400);
    expect(t).toBeGreaterThan(120); // 至少经过待机期
    expect(shots[0].damage).toBe(25);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(7, 1);
  });

  it('爬行者 101：锚定 + 有视线 → 120t 后喷诅咒焰（速 10、伤 22）', () => {
    const { w, hooks, shots } = shooterWorld({ x: 44, y: 55 });
    const e = Enemy.fromVanilla(101, 40 * 16, 55 * 16)!;
    e.ai0 = 40; e.ai1 = 55; // 锚点 tile 坐标
    w.store.setTileSilent(40, 55, 2); // 锚点格放块（植物族锚定判定）
    const t = runUntilShot(e, hooks, shots, 300);
    expect(t).toBeGreaterThan(100);
    expect(shots[0].damage).toBe(22);
  });

  it('尖刺史莱姆 184：落地近距有视线 → 抛物线尖刺（速 4.5、伤 9）', () => {
    const { hooks, shots } = shooterWorld({ x: 42, y: 58 }); // 与史莱姆同层（地板上一格），视线不被地板挡
    const e = Enemy.fromVanilla(184, 40 * 16, 59 * 16)!;
    const t = runUntilShot(e, hooks, shots, 200);
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(9);
  });

  it('巨型诅咒颅 289：≤500px 状态机 → 冲刺段第 20 tick 暗影焰（速 6、伤 25）', () => {
    const { hooks, shots } = shooterWorld({ x: 42, y: 55 });
    const e = Enemy.fromVanilla(289, 40 * 16, 55 * 16)!;
    const t = runUntilShot(e, hooks, shots, 400);
    expect(t).toBeGreaterThan(100); // 120t 待机 + 20t 冲刺
    expect(shots[0].damage).toBe(25);
  });
});
