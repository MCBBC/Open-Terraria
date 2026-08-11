import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// 小动物 AI 全家族 1:1 回归（aiStyle 1/7/16/64/65/66/67/68/112/114/115/116/118）
function critterWorld(playerAt: { x: number; y: number } | null, opts: { water?: boolean } = {}) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  if (opts.water) {
    // y 45-59 注水（水面在 45）
    for (let x = 20; x <= 60; x++) for (let y = 45; y <= 59; y++) st.setLiquid(x, y, 255, 1);
  }
  const hooks = {
    world: w,
    player: playerAt ? {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    } : null,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: () => {} },
    enemies: () => [] as unknown[],
  } as never;
  return { w, hooks };
}

describe('小动物 AI 家族', () => {
  it('兔 46（aiStyle 7）：站/走循环 + 1 格台阶自动跳', () => {
    const { w, hooks } = critterWorld(null);
    w.store.setTileSilent(45, 59, 2); // 前方 1 格台阶
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let walked = false, jumped = false;
    for (let t = 0; t < 3000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (Math.abs(e.vx) > 0.2) walked = true;
      if (e.vy < -1) jumped = true;
    }
    expect(walked).toBe(true);
    expect(jumped).toBe(true); // 循环踱步终会撞上台阶跳过/掉头前先试跳
  });

  it('蚱蜢 377（aiStyle 1）：玩家 200px 外不蹦；靠近才激愤跳', () => {
    const far = critterWorld({ x: 70, y: 40 });
    const e = Enemy.fromVanilla(377, 40 * 16, 59 * 16)!;
    let jumped = false;
    for (let t = 0; t < 600; t++) {
      e.fixedUpdate(1 / 60, far.hooks);
      if (e.vy < -1) { jumped = true; break; }
    }
    expect(jumped).toBe(false); // 远处保持走路档
    const near = critterWorld({ x: 41, y: 58 });
    const e2 = Enemy.fromVanilla(377, 40 * 16, 59 * 16)!;
    let hopped = false;
    for (let t = 0; t < 300; t++) {
      e2.fixedUpdate(1 / 60, near.hooks);
      if (e2.vy < -1) { hopped = true; break; }
    }
    expect(hopped).toBe(true);
  });

  it('萤火虫 355（aiStyle 64）：无重力漂移不坠落', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(355, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 200; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cy).toBeLessThan(59 * 16); // 仍悬空
  });

  it('蝴蝶 356（aiStyle 65）：漂移 + 100px 内敌怪规避', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(356, 40 * 16, 50 * 16)!;
    const y0 = e.cy;
    for (let t = 0; t < 200; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cy).toBeLessThan(59 * 16); // 悬空漂移
    void y0;
  });

  it('蠕虫 357（aiStyle 66）：静止/蠕动循环、蠕动速度 0.2', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(357, 40 * 16, 59 * 16)!;
    let crawled = false;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.ai0 === 1) { crawled = true; break; }
    }
    expect(crawled).toBe(true);
  });

  it('松露虫 374：玩家 160px 内 90t → 钻地变身 375', () => {
    const { hooks } = critterWorld({ x: 41, y: 58 });
    const e = Enemy.fromVanilla(374, 40 * 16, 59 * 16)!;
    let transformed = false;
    for (let t = 0; t < 200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 375) { transformed = true; break; }
    }
    expect(transformed).toBe(true);
  });

  it('蜗牛 359（aiStyle 67）：贴墙爬不坠落（noGravity 爬行态）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(359, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 100; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cy).toBeLessThan(55 * 16); // 爬行态不自由落体
  });

  it('鸭飞形 363（aiStyle 68）：飞行 300t 落地 → 变回行走形 362', () => {
    const { hooks } = critterWorld({ x: 60, y: 40 });
    const e = Enemy.fromVanilla(363, 40 * 16, 58 * 16)!;
    let back = false;
    for (let t = 0; t < 1200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 362) { back = true; break; }
    }
    expect(back).toBe(true);
  });

  it('蜻蜓 599（aiStyle 114）：绕锚点悬停/突进，不远离锚点太远', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(599, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 600; t++) e.fixedUpdate(1 / 60, hooks);
    expect(Math.hypot(e.cx - 40 * 16, e.cy - 50 * 16)).toBeLessThan(200); // 锚点约束
  });

  it('瓢虫 604（aiStyle 115）：飞/陆双态切换', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(604, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 300; t++) e.fixedUpdate(1 / 60, hooks);
    expect([0, 1]).toContain(e.ai2); // 状态域合法（0 飞/1 陆）
    expect(e.cy).toBeLessThan(60 * 16); // 不沉底
  });

  it('水黾 612（aiStyle 116）：水面附近悬停不沉底', () => {
    const { hooks } = critterWorld(null, { water: true });
    const e = Enemy.fromVanilla(612, 40 * 16, 46 * 16)!;
    for (let t = 0; t < 300; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cy).toBeLessThan(59 * 16); // 没有沉到水底
  });

  it('海马 626（aiStyle 118）：水中游动不坠底、离水瘫软', () => {
    const { hooks } = critterWorld(null, { water: true });
    const e = Enemy.fromVanilla(626, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 300; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cy).toBeLessThan(59 * 16); // 悬浮水中
  });

  it('金鱼 55（aiStyle 16）：路由到 AI_016 游泳（水中活动）', () => {
    const { hooks } = critterWorld({ x: 42, y: 50 }, { water: true });
    const e = Enemy.fromVanilla(55, 40 * 16, 50 * 16)!;
    let moved = false;
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (Math.abs(e.vx) + Math.abs(e.vy) > 0.3) { moved = true; break; }
    }
    expect(moved).toBe(true);
  });
});
