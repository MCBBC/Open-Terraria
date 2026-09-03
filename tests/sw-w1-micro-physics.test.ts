// SW-W1 2026-09-04 微物理尾三件：① 655 重力 0.3 先钳后加（AI_025 :26684-26687/:26738-26741）② AI_016 滚转门后位（:48400-48407,滚行吃 :48382 ×0.97 后 vx;贴附拍 scan 清 vx 零增量）③ 撞顶残差回写（:2451 钳速+ε;ε 间隙效应由本仓贴面吸附吸收,摩擦相位 vanilla 对齐）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { GrenadeProj } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';
const rot = (p: GrenadeProj) => (p as unknown as { rot: number }).rot;   // 私有探测,caster-book 惯用法
const mk = (rows: number[] = []) => {
  const w = new World(80, 60, 30, 'open'); for (const r of rows) for (let x = 0; x < 80; x++) w.store.setTileSilent(x, r, 1, 0, 0);
  return { world: w, player: null, enemies: () => [], critters: () => [], cutTile: () => {} } as unknown as GameHooks;
};
describe('SW-W1 AI_025/AI_016 微物理三件', () => {
  it('655 重力 0.3 先钳后加：vy=16.1 → 钳 16 再 +0.3 = 16.3（旧 0.2 后钳=恒 16）', () => {
    const p = new GrenadeProj(640, 100, 0, 16.1, 10, 3600, 655, () => {});
    p.fixedUpdate(0, mk());
    expect(p.vy).toBeCloseTo(16.3, 12);
  });
  it('滚转门后位：滚行拍 Δrot=2.91×0.1（旧读摩擦前 3×0.1）;贴附拍 vx=0 零增量', () => {
    const g = mk([50]);
    const a = new GrenadeProj(640, 800 - 22 - 1, 3, 0, 100, 3600, 28, () => {});
    for (let i = 0; i < 5; i++) a.fixedUpdate(0, g);
    const r5 = rot(a);
    a.fixedUpdate(0, g);                                  // t6 门开拍：摩擦 3→2.91 后才滚转
    expect(a.vx).toBeCloseTo(2.91, 12);
    expect(rot(a) - r5).toBeCloseTo(0.291, 12);
    const b = new GrenadeProj(640, 800 - 22 + 6, 2, 0, 100, 3600, 37, () => {});
    b.fixedUpdate(0, mk([50]));                           // 贴附拍：scan 置 vx=0 → 增量恰 0
    expect([b.vx, rot(b)]).toEqual([0, 0]);
  });
  it('撞顶残差回写：残差 -1 存活 → 次拍无摩擦+贴面复读归零 → 再次拍摩擦（vanilla 相位）', () => {
    const g = mk([46, 50]);                               // 顶=752,地面=800
    const p = new GrenadeProj(640, 778, 2, -3, 100, 3600, 28, () => {});
    for (let i = 0; i < 10; i++) p.fixedUpdate(0, g);     // t10 撞顶（钳距 1px → 残差 -1）
    expect(p.vy).toBeCloseTo(-1, 9);
    expect(p.vx).toBe(2);                                 // 撞顶拍 vx 未摩擦
    p.fixedUpdate(0, g);                                  // t11 残差≠0 门假;复读位移 0 → vy 归零
    expect([p.vx, p.vy]).toEqual([2, 0]);
    p.fixedUpdate(0, g);                                  // t12 vy==0 → 摩擦#1
    expect(p.vx).toBeCloseTo(2 * 0.97, 12);
  });
});
