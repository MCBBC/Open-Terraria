// 传送门枪物品链 601 PortalGunBolt 对账（src/entities/PortalGunBolt.ts）。
// 弹体物理锚点：SetDefaults Projectile.cs:6223-6231（10×10/alpha255/extraUpdates30）、
// 600 发弹 :63883-63911（速度 3）、AI :51174-51228、撞块 :16672-16691。
// 用假 GameHooks + 手工 TileStore 驱动（免起 dev server，纯逻辑断言）。
import { describe, it, expect } from 'vitest';
import { PortalGunBolt, firePortalGun } from '../src/entities/PortalGunBolt';
import { portalRegistry, clearPortals, placePortal } from '../src/entities/Portal';
import type { GameHooks } from '../src/entities/types';
import type { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';

/** 假 TileStore：只实现 inBounds/isSolid/idx/half/slope（Portal.placePortal 消费面） */
function fakeStore(w: number, h: number, solid: (x: number, y: number) => boolean): TileStore {
  return {
    width: w, height: h,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    isSolid: solid,
    idx: (x: number, y: number) => y * w + x,
    half: new Uint8Array(w * h),
    slope: new Uint8Array(w * h),
  } as unknown as TileStore;
}

/** 假 GameHooks：记录 placePortal/sfx/粒子调用 */
function fakeHooks(st: TileStore) {
  const placed: Array<{ x: number; y: number; vx: number; vy: number; form: number }> = [];
  const sfx: Array<{ name: string }> = [];
  const lights: Array<[number, number]> = [];
  const hooks = {
    world: { store: st } as GameHooks['world'],
    placePortal: (x: number, y: number, vx: number, vy: number, form: number) => {
      placed.push({ x, y, vx, vy, form });
    },
    playSfx: (name: string) => { sfx.push({ name }); },
    addLightAt: (x: number, y: number) => { lights.push([x, y]); },
  } as unknown as GameHooks;
  return { hooks, placed, sfx, lights };
}

describe('601 弹体基础（SetDefaults :6223-6231 / 600 发弹 :63883-63911）', () => {
  it('firePortalGun：出膛位 = 玩家中心 + 14px 前置，弹速 = 方向×3', () => {
    const b = firePortalGun({ cx: 100, cy: 200 }, 0, 0);
    expect(b.x + b.w / 2).toBeCloseTo(114, 5);
    expect(b.y + b.h / 2).toBeCloseTo(196, 5);
    expect(b.vx).toBeCloseTo(3, 5);
    expect(b.vy).toBeCloseTo(0, 5);
    expect(b.w).toBe(10);
    expect(b.h).toBe(10);
    expect(b.form).toBe(0);
  });
  it('form 1 = 右键蓝门（Player.cs:48055 altFunctionUse==2 → 1）', () => {
    expect(firePortalGun({ cx: 0, cy: 0 }, -Math.PI / 2, 1).form).toBe(1);
  });
  it('瞄准 NaN 防御 → -UnitY（:63907-63910）', () => {
    const b = firePortalGun({ cx: 0, cy: 0 }, NaN, 0);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(-3);
  });
});

describe('601 飞行与撞块（extraUpdates30 → 31 子步/tick；:16672-16691 落门）', () => {
  it('直线无阻挡：每 tick 位移 = 3×31 = 93px，逐子步不穿墙（alpha 走 -15 台阶）', () => {
    const st = fakeStore(400, 400, () => false);
    const { hooks } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 10, cy: TILE * 10 }, 0, 0);
    const x0 = b.x;
    b.fixedUpdate(1, hooks);
    expect(b.x - x0).toBeCloseTo(93, 5);
    expect(b.dead).toBe(false);
  });
  it('撞块 → placePortal(左上, lastVelocity, form) 后 Kill（:16685-16690）', () => {
    const st = fakeStore(100, 100, (x) => x >= 50);  // x≥50 tile 列为墙
    const { hooks, placed } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 10, cy: TILE * 10 }, 0, 0);
    for (let t = 0; t < 60 && !b.dead; t++) b.fixedUpdate(1, hooks);
    expect(b.dead).toBe(true);
    expect(placed.length).toBe(1);
    expect(placed[0].form).toBe(0);
    expect(placed[0].vx).toBeCloseTo(3, 5);
    expect(placed[0].vy).toBeCloseTo(0, 5);
  });
  it('form 1 撞块同样落门传 form（门色由 placePortal 侧消费）', () => {
    const st = fakeStore(100, 100, (x) => x >= 50);
    const { hooks, placed } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 10, cy: TILE * 10 }, 0, 1);
    for (let t = 0; t < 60 && !b.dead; t++) b.fixedUpdate(1, hooks);
    expect(placed[0].form).toBe(1);
  });
  it('出界消亡（timeLeft 兜底之外的快速路径）', () => {
    const st = fakeStore(100, 100, () => false);
    const { hooks, placed } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 99, cy: TILE * 10 }, 0, 0);
    for (let t = 0; t < 60 && !b.dead; t++) b.fixedUpdate(1, hooks);
    expect(b.dead).toBe(true);
    expect(placed.length).toBe(0);   // 出界不落门
  });
  it('端到端：假墙场景 placePortal 挂钩 → 门实体入注册表（Portal.placePortal 解算）', () => {
    clearPortals();
    const st = fakeStore(60, 60, (x, y) => y >= 30 && x < 40);  // 下方墙板
    const reg: unknown[] = [];
    const { hooks } = fakeHooks(st);
    // 直接复用真 placePortal（entities/Portal.ts）作挂钩实现，同 Game.placePortal
    hooks.placePortal = (x: number, y: number, vx: number, vy: number, form: number) => {
      const p = placePortal(st, x, y, vx, vy, form);
      if (p) reg.push(p);
    };
    const b = firePortalGun({ cx: TILE * 10, cy: TILE * 10 }, Math.PI / 2, 0);  // 向下射
    for (let t = 0; t < 60 && !b.dead; t++) b.fixedUpdate(1, hooks);
    expect(b.dead).toBe(true);
    expect(reg.length).toBe(1);
    expect(portalRegistry().length).toBe(1);
    expect(portalRegistry()[0].form).toBe(0);
    clearPortals();
  });
});

describe('601 视觉/音效门（AI :51174-51228 / 撞块 :16672-16684）', () => {
  it('撞块音走 ai[1] 恒 0 分支 → 恒 Item_115（portalOrange）', () => {
    // 近距墙面：飞行 <16 子步即撞（alpha 仍 >0）→ 走 :16674 音门
    const st = fakeStore(100, 100, (x) => x >= 13);
    const { hooks, sfx } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 12, cy: TILE * 10 }, 0, 0);
    for (let t = 0; t < 10 && !b.dead; t++) b.fixedUpdate(1, hooks);
    expect(b.dead).toBe(true);
    expect(sfx.length).toBeGreaterThanOrEqual(1);
    expect(sfx.every((s) => s.name === 'portalOrange')).toBe(true);
  });
  it('远距飞行：alpha 跨 15 阈值时按 form 分音（form1 → portalBlue, :51195-51202）', () => {
    const st = fakeStore(100, 100, (x) => x >= 90);   // 远墙
    const { hooks, sfx } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 10, cy: TILE * 10 }, 0, 1);
    for (let t = 0; t < 120 && !b.dead; t++) b.fixedUpdate(1, hooks);
    expect(sfx.some((s) => s.name === 'portalBlue')).toBe(true);
  });
  it('点光按门色×0.5 逐子步登记（:51176-51179）', () => {
    const st = fakeStore(100, 100, () => false);
    const { hooks, lights } = fakeHooks(st);
    const b = firePortalGun({ cx: TILE * 10, cy: TILE * 10 }, 0, 0);
    b.fixedUpdate(1, hooks);
    expect(lights.length).toBe(31);   // 31 子步每步一光
  });
});
