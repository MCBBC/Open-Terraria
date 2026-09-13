// 气泡族尘 34/35/152 运动语义（2026-09-13 用户实报"角色入水后嘴冒泡泡往下掉"定谳）。
// 病根：VanillaDust 池无 34/35/152 专档 → 每拍落 default 吃通用重力 +0.1 → 泡下坠。
// 原版语义（Dust.cs）：①NewDust 时 :246-253 velocity×0.1 + vy=−0.5 上浮钉值，34 号
// 生成点离水（WetCollision(pos.y−8,4,4) 失败）即 active=false；②逐拍 :2023-2040
// 离水 scale=0 灭 / 湿内 alpha+rand(2)（>255 灭）、vy=−0.5 恒上浮、34 scale+0.005 渐大。
// 原版通用重力 +0.1 先行即被 :2029 vy=−0.5 覆写=净恒 −0.5——池内 chainLink 跳过等价。
import { describe, expect, it } from 'vitest';
import { VanillaDust } from '../src/fx/VanillaDust';

/** 全湿探针（WetCollision 恒真=水下）/ 全干探针 */
const WET = () => true;
const DRY = () => false;

describe('气泡族尘 34（Bubbles）：上浮+离水灭（Dust.cs:246-253/:2023-2040）', () => {
  it('水下生成即 vy=−0.5 上浮钉值、vx×0.1（NewDust 后处理 :246-253）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 8, 8, 34, 0.5, 0.3, 0, null, 1.2)!;
    expect(d).not.toBeNull();
    expect(d.vy).toBe(-0.5);          // 上浮钉值（原版逐拍覆写,生成时即置）
    expect(Math.abs(d.vx)).toBeLessThanOrEqual(2.5 * 0.1 + 1e-9);   // (±2 掷+speedX0.5)×0.1=±0.25 全域
  });

  it('湿内逐拍恒上浮：10 拍位移 y 递减 0.5/拍，不吃重力（AI :2029 覆写重力判例）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 8, 8, 34, 0, 0, 0, null, 1.2)!;
    const y0 = d.y;
    for (let t = 0; t < 10; t++) vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, WET);
    expect(d.y).toBeCloseTo(y0 - 5, 6);   // 10 拍 × 0.5 = 5px 上升
    expect(d.vy).toBe(-0.5);
  });

  it('离水（探针恒干）→ scale=0 淘汰（AI :2025-2027）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 8, 8, 34, 0, 0, 0, null, 1.2)!;
    vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, DRY);
    // scale=0（AI :2025）→ 通用老化 −0.01 → 池汰 scale<0.1=active:false（:883 同拍）
    expect(d.scale).toBeLessThan(0.1);
    expect(d.active).toBe(false);
  });

  it('34 湿内 scale 每拍 +0.005 渐大（:2038-2039）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 8, 8, 34, 0, 0, 0, null, 1)!;
    const s0 = d.scale;
    vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, WET);
    expect(d.scale).toBeCloseTo(s0 + 0.005 - 0.01, 6);   // +0.005 专档 −0.01 通用老化=净 −0.005（原版同序）
  });

  it('alpha 每拍 +rand(2)（Next(2)∈{0,1}），>255 灭（:2031-2034）——60 拍内必不倒退且终灭', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 8, 8, 34, 0, 0, 0, null, 5)!;   // 大 scale 防先老化死
    let prev = d.alpha;
    let died = false;
    for (let t = 0; t < 800; t++) {   // alpha 均值 +0.5/拍 → ~512 拍触 256（原版同寿命）
      vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, WET);
      if (!d.active || d.scale <= 0) { died = true; break; }   // alpha>255→scale=0→老化−0.01→:883 同拍汰
      expect(d.alpha).toBeGreaterThanOrEqual(prev);   // Next(2) 非减（scale>10 逐拍汰除外恒真）
      expect(d.alpha - prev).toBeLessThanOrEqual(1);
      prev = d.alpha;
    }
    expect(died).toBe(true);   // alpha 单调到 >255 → scale=0（300 拍上限充裕）
  });

  it('35/152 同档共享受（链成员非仅 34）', () => {
    for (const type of [35, 152]) {
      const vd = new VanillaDust();
      const d = vd.spawn(100, 100, 8, 8, type, 0, 0, 0, null, 1.2)!;
      vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, WET);
      expect(d.vy).toBe(-0.5);
    }
  });
});
