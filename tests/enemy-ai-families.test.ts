import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// AI 家族错误回退消除回归（aiStyle 0/17/19/23/25/39/41/44/56）
type DartLike = { vx: number; vy: number; damage: number };

function flatWorld(playerAt: { x: number; y: number }) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  const shots: DartLike[] = [];
  const hooks = {
    world: w,
    player: {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    },
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    // 台账清偿批(2026-08-31)：AI_044 同型聚群互斥环(:31189)新增 game.enemies()
    // 扫描消费——mock hooks 补空表(原 581 参数档用例断言不变)
    enemies: () => [],
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: (e: unknown) => { shots.push(e as DartLike); } },
  } as never;
  return { w, hooks, shots };
}

describe('AI 家族回退消除', () => {
  it('被缚NPC 105（aiStyle 0）：原地站立不动、零接触伤害', () => {
    const { hooks } = flatWorld({ x: 40, y: 58 });
    const e = Enemy.fromVanilla(105, 40 * 16, 59 * 16)!;
    expect(e.def.damage).toBe(0);          // friendly 旗 → 零伤害
    const x0 = Math.round(e.x);
    for (let t = 0; t < 120; t++) e.fixedUpdate(1 / 60, hooks);
    expect(Math.abs(e.x - x0)).toBeLessThan(1); // 不游走
  });

  it('秃鹫 61（aiStyle 17）：栖息不动；玩家进入 200px 盒 → 起飞（vy=-6）', () => {
    const far = flatWorld({ x: 60, y: 40 });
    const e = Enemy.fromVanilla(61, 40 * 16, 59 * 16)!;
    e.y = 60 * 16 - e.h; e.vy = 0;   // 贴地栖息（悬空出生原版语义=直接起飞）
    for (let t = 0; t < 60; t++) e.fixedUpdate(1 / 60, far.hooks);
    expect(e.ai0).toBe(0);                  // 远处保持栖息
    const near = flatWorld({ x: 40, y: 58 });
    const e2 = Enemy.fromVanilla(61, 40 * 16, 59 * 16)!;
    let tookOff = false;
    for (let t = 0; t < 30; t++) {
      e2.fixedUpdate(1 / 60, near.hooks);
      if (e2.ai0 === 1) { tookOff = true; break; }
    }
    expect(tookOff).toBe(true);
  });

  it('蚁狮 69（aiStyle 19）：扎地不动；玩家在上方 200t 后射沙球（速 12、伤 10）', () => {
    const { hooks, shots } = flatWorld({ x: 40, y: 55 });
    const e = Enemy.fromVanilla(69, 40 * 16, 58 * 16)!;
    const x0 = Math.round(e.x);
    let fired = false;
    for (let t = 0; t < 400 && !fired; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (shots.length > 0) fired = true;
    }
    expect(fired).toBe(true);
    expect(Math.abs(e.x - x0)).toBeLessThan(2); // 全程扎根不位移
    expect(shots[0].damage).toBe(10);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(12, 1);
  });

  it('飞行武器 83（aiStyle 23）：三态循环——冲刺(9)→漂移→蓄转(转速递增)', () => {
    const { hooks } = flatWorld({ x: 44, y: 58 });
    const e = Enemy.fromVanilla(83, 40 * 16, 58 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.ai0).toBe(1);                                  // 冲刺后转漂移
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(9, 1);
    for (let t = 0; t < 100; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.ai0).toBe(2);                                  // 漂移 100t → 蓄转
    const ang0 = e.visAngle;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.visAngle).not.toBe(ang0);                      // 转速递增旋转中
  });

  it('宝箱怪 85（aiStyle 25）：远处伪装；玩家近 200px → 显形起跳循环', () => {
    const far = flatWorld({ x: 60, y: 50 });
    const e = Enemy.fromVanilla(85, 40 * 16, 59 * 16)!;
    e.y = 60 * 16 - e.h; e.vy = 0;   // 贴地伪装
    for (let t = 0; t < 90; t++) e.fixedUpdate(1 / 60, far.hooks);
    expect(e.ai0).toBe(0);                                  // 伪装
    const near = flatWorld({ x: 40, y: 57 });
    const e2 = Enemy.fromVanilla(85, 40 * 16, 59 * 16)!;
    let active = false;
    for (let t = 0; t < 60; t++) {
      e2.fixedUpdate(1 / 60, near.hooks);
      if (e2.ai0 === 1) { active = true; break; }
    }
    expect(active).toBe(true);
  });

  it('陆龟 154（aiStyle 39）：远距蓄力 400t → 蓄势 → 旋冲(初速 10/6)', () => {
    const { hooks } = flatWorld({ x: 70, y: 58 });   // >200px 持续蓄力（cs:29344 门），避免走近后停蓄
    const e = Enemy.fromVanilla(154, 40 * 16, 59 * 16)!;
    for (let t = 0; t < 600 && e.ai0 !== 3; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.ai0).toBe(3);                                  // 进入旋冲
    for (let t = 0; t < 3; t++) e.fixedUpdate(1 / 60, hooks); // 首帧定速后再断言
    expect(Math.abs(e.vx) + Math.abs(e.vy)).toBeGreaterThan(5);
  });

  it('赫柏林 174（aiStyle 41）：落地蓄力后起跳（vy=-5 小跳）', () => {
    const { hooks } = flatWorld({ x: 44, y: 58 });
    const e = Enemy.fromVanilla(174, 40 * 16, 59 * 16)!;
    let jumped = false;
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < -1) { jumped = true; break; }
    }
    expect(jumped).toBe(true);
  });

  it('蚁狮蜂 581（aiStyle 44）：无重力追击，接近玩家水平位', () => {
    const { hooks } = flatWorld({ x: 46, y: 55 });
    const e = Enemy.fromVanilla(581, 40 * 16, 55 * 16)!;
    for (let t = 0; t < 200; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.vy).toBeLessThan(1);            // 悬空不坠落
    expect(Math.abs(e.cx - 46 * 16)).toBeLessThan(64); // 逼近到 xGate(40px) 悬停区
  });

  it('地牢之魂 288（aiStyle 56）：穿墙惯性追踪玩家', () => {
    const { w, hooks } = flatWorld({ x: 46, y: 58 });
    // 中间竖一道墙，验证穿墙
    for (let y = 50; y <= 59; y++) w.store.setTileSilent(43, y, 2);
    const e = Enemy.fromVanilla(288, 40 * 16, 58 * 16)!;
    for (let t = 0; t < 300; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cx).toBeGreaterThan(42 * 16);   // 穿过墙向玩家移动
  });
});
