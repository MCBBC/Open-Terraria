// ★刀2-C2(2026-10-13)实体自绘钩守卫:注册 fail-fast/域门 miss/spec 三钩直通
//   (registerProjHooks 合并面)+ModDrawCtx 类型面。渲染集成(P1/P3/P4 seam)=
//   drawEnemy/drawDrop/ModProj.draw 消费,canvas 级验证归 C2 探针批。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerModNpcDraw, modNpcDrawSpecOf,
  registerModItemDraw, modItemDrawSpecOf,
  registerModProj, registerProjHooks, modProjSpecOf,
  _resetModHooksForTests,
} from '../src/mods/hooks';

describe('mod NPC 自绘注册面(刀2-C2)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('注册+查表;原版域恒 miss(零扰动)', () => {
    const spec = { preDraw: () => true, postDraw: () => {} };
    registerModNpcDraw(800, spec);
    expect(modNpcDrawSpecOf(800)).toBe(spec);
    expect(modNpcDrawSpecOf(42)).toBeNull();      // 原版域
    expect(modNpcDrawSpecOf(799)).toBeNull();
    expect(modNpcDrawSpecOf(801)).toBeNull();     // 未注册
  });

  it('fail-fast:重复注册/域外 id', () => {
    registerModNpcDraw(800, {});
    expect(() => registerModNpcDraw(800, {})).toThrow(/重复注册/);
    expect(() => registerModNpcDraw(42, {})).toThrow(/≥800/);
  });

  it('空注册=零成本门(size===0 短路)', () => {
    expect(modNpcDrawSpecOf(800)).toBeNull();
    expect(modItemDrawSpecOf(30000)).toBeNull();
  });
});

describe('mod 物品自绘注册面(刀2-C2)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('注册+查表;原版域恒 miss', () => {
    const spec = { preDrawInWorld: () => false };
    registerModItemDraw(30000, spec);
    expect(modItemDrawSpecOf(30000)).toBe(spec);
    expect(modItemDrawSpecOf(29999)).toBeNull();
    expect(modItemDrawSpecOf(46)).toBeNull();
    expect(() => registerModItemDraw(30000, {})).toThrow(/重复注册/);
    expect(() => registerModItemDraw(46, {})).toThrow(/≥30000/);
  });
});

describe('弹自绘三钩 spec 直通(刀2-C2)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('registerModProj 声明面直通;registerProjHooks 合并覆写', () => {
    const preDraw = () => true;
    const draw = () => {};
    registerModProj(2000, 'd2', { texture: 'x.png', preDraw, draw });
    const s = modProjSpecOf(2000);
    expect(s?.preDraw).toBe(preDraw);
    expect(s?.draw).toBe(draw);
    const postDraw = () => {};
    registerProjHooks(2000, { postDraw });
    expect(modProjSpecOf(2000)?.postDraw).toBe(postDraw);
    expect(modProjSpecOf(42)).toBeNull();   // 原版弹零扰动(域门 miss)
  });
});
