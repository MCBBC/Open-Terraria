// mod loader 性能守卫(2026-10-04 P4):实测各钩子空载/满载单次成本,
// 阈值放宽 10-100×(防 JIT 噪声误报,守的是数量级回归而非精确值)。
// 判据基准:60Hz fixedUpdate 每拍预算 16.67ms——空载钩子合计须 ≪0.1% 预算。
// 阈值锚(citation 见 docs/mod-loader-p0-report.md P4.5 性能损失表):
//   takeModNpcAi 空载 ≤ 20ns/次 → 300 敌怪每拍 ≤ 6µs(0.036% 预算)
//   runModItemUse 空载 ≤ 50ns/次
//   runModPre/Post/PostUpdate 空载 ≤ 20ns/次
//   满载 Map.get(64 项 miss)≤ 100ns/次
//   applyModItemIds 一次性接长(30000→65535)≤ 10ms(启动期一次性)
import { describe, it, expect, beforeAll } from 'vitest';
import {
  takeModNpcAi, runModItemUse, runModPreUpdate, runModPostEntities, runModPostUpdate,
  registerNpcAi, registerItemUse, registerSystem, _resetModHooksForTests,
} from '../src/data/../mods/hooks';
import { applyModItemIds } from '../src/data/items';
import { ITEM_STABLE_OF_INTERNAL, ITEM_INTERNAL_OF_STABLE } from '../src/data/items';

function bench(fn: () => void, iters: number): number {
  // 预热(JIT)
  for (let i = 0; i < Math.min(100_000, iters); i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t0) / iters * 1e6;   // ns/次
}

describe('mod 钩子性能守卫(空载=零 mod 会话的实际形态)', () => {
  beforeAll(() => {
    _resetModHooksForTests();
  });

  it('takeModNpcAi 空载 ≤ 20ns(每敌怪每 tick 一次;300 敌怪=每拍 ≤ 6µs)', () => {
    const ns = bench(() => takeModNpcAi(42), 2_000_000);
    expect(ns).toBeLessThan(20);
  });

  it('runModItemUse 空载 ≤ 50ns(每 tick 一次)', () => {
    const gameStub = { player: {}, input: { mouseX: 0, mouseY: 0 } } as never;
    const ns = bench(() => runModItemUse(gameStub, { vid: 42 } as never, { id: 42, stack: 1 } as never, 0, 0), 1_000_000);
    expect(ns).toBeLessThan(50);
  });

  it('三个 fixedUpdate 系统钩空载 ≤ 20ns 各(每 tick 各一次)', () => {
    const gameStub = {} as never;
    expect(bench(() => runModPreUpdate(gameStub, 1 / 60), 2_000_000)).toBeLessThan(20);
    expect(bench(() => runModPostEntities(gameStub, 1 / 60), 2_000_000)).toBeLessThan(20);
    expect(bench(() => runModPostUpdate(gameStub), 2_000_000)).toBeLessThan(20);
  });

  it('恒等表读:30000 段外的原版段下标读不受 mod 域影响(基线参照)', () => {
    // 读路径零变化:恒等表查询 = 单次下标读(无函数调用),此处只守表长度不炸
    expect(ITEM_STABLE_OF_INTERNAL[1]).toBeDefined();
  });
});

describe('mod 钩子性能守卫(满载=mod 挂满后的框架开销上限)', () => {
  beforeAll(() => {
    _resetModHooksForTests();
    // 挂满形态:64 个 mod NPC AI + 64 个 itemUse + 16 个 system
    for (let i = 800; i < 864; i++) registerNpcAi(i, () => {});
    for (let i = 30000; i < 30064; i++) registerItemUse(i, () => true);
    for (let i = 0; i < 16; i++) registerSystem({ preUpdate: () => {}, postEntities: () => {}, postUpdate: () => {} });
  });

  it('takeModNpcAi 满载 miss(64 项 Map)≤ 100ns(300 敌怪=每拍 ≤ 30µs=0.18%)', () => {
    const ns = bench(() => takeModNpcAi(42), 2_000_000);
    expect(ns).toBeLessThan(100);
  });

  it('runModItemUse 满载 miss ≤ 100ns', () => {
    const gameStub = { player: {}, input: { mouseX: 0, mouseY: 0 } } as never;
    const ns = bench(() => runModItemUse(gameStub, { vid: 42 } as never, { id: 42, stack: 1 } as never, 0, 0), 1_000_000);
    expect(ns).toBeLessThan(100);
  });

  it('16 个 system 空钩循环 ≤ 1.5µs(每 tick 一次=0.009% 预算)', () => {
    const gameStub = {} as never;
    const ns = bench(() => runModPreUpdate(gameStub, 1 / 60), 500_000);
    expect(ns).toBeLessThan(1500);   // 16 个空函数调用+循环
    expect(bench(() => runModPostEntities(gameStub, 1 / 60), 500_000)).toBeLessThan(1500);
    expect(bench(() => runModPostUpdate(gameStub), 500_000)).toBeLessThan(1500);
  });

  it('applyModItemIds 一次性接长到 65535 ≤ 10ms(启动期,存档期零成本)', () => {
    const t0 = performance.now();
    applyModItemIds([65535]);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(10);
    expect(ITEM_INTERNAL_OF_STABLE.get(65535)).toBe(65535);
    // 回滚本次接长对本文件后续测试无影响(fresh registry per file)
  });
});
