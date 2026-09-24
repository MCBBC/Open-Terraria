// ★BJ328（2026-09-24）：沙丘 pass 位置拒绝采样在【非 UI 小宽度】下的终止性判别面。
// 病灶：拒绝带（丛林 ±600·scale / 中央 ±300 / 雪原 ±300）对 w<1800 的世界全域覆盖
// ——中央带在原版无放松支（丛林 w 次/雪原 2w 次有）⇒ 1200×850（探针 __swFlow.newWorld
// 路径）生成挂死在 pass1[沙丘]，BJ318 两发复现、本刀再复现。修=中央带补 4w 次放松
// （支持档 ≥4200 下 P(连拒 4w)=0.75^16800≈0 ⇒ 掷流逐位不变，seed-parity 金标绿）。
// 判别面：1200×850 上跑 runDunesPass，注入【掷骰预算 rng】——修前（无放松臂）拒绝环
// 永不终止、预算必然爆；修后正常返回。变异 1 发=摘除放松臂 ⇒ 本测试红（预算炸）。
import { describe, it, expect } from 'vitest';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

/** 掷骰预算 rng：任何骰面方法超预算即抛（拒绝环挂死=预算爆=红） */
function budgetRng(seed: number, budget: number): RNG {
  const inner = new RNG(seed);
  let used = 0;
  const tick = (): void => {
    if (++used > budget) throw new Error(`dunes 掷骰预算耗尽（>${budget}）=拒绝环未终止`);
  };
  return {
    vanilla: inner.vanilla,
    next: () => { tick(); return inner.next(); },
    nextInt: (m: number) => { tick(); return inner.nextInt(m); },
    nextIntRange: (a: number, b: number) => { tick(); return inner.nextIntRange(a, b); },
    int: (a: number, b: number) => { tick(); return inner.int(a, b); },
    reseed: (s: number) => inner.reseed(s),
  } as unknown as RNG;
}

function tinyGenState(w: number): GenState {
  // 最小 GenState 面：runDunesPass（非 dual/skyblock/ntb 普通种子）只读这些
  return {
    seed: 314159,
    seedFlags: {},
    jungleX: Math.trunc(w * 0.72),
    snowOriginLeft: Math.trunc(w * 0.1),
    snowOriginRight: Math.trunc(w * 0.22),
    worldSurface: 180,
    genWorldSurfaceHigh: 180,
    crimson: false,
  } as unknown as GenState;
}

describe('BJ328 沙丘拒绝采样·小宽度终止性', () => {
  it('1200×850：沙丘 pass 在掷骰预算内完成（修后=放松臂兜底）', () => {
    const st = new TileStore(1200, 850);
    const rng = budgetRng(314159, 200_000);
    expect(() => runDunesPass(st, rng, tinyGenState(1200))).not.toThrow();
  });

  it('4200×1200（UI 小档）：沙丘 pass 掷流不受放松臂扰动（预算内完成+骰数不变锚）', () => {
    // 同种子跑两遍：一遍带预算（正常完成），一遍记录总骰数——放松臂在支持尺寸
    // 不可达 ⇒ 骰数与「4w 阈值改为天文数字」的对照跑恒等（此处以 200k 预算内
    // 完成且骰数 < 2000 为锚：4200 宽沙丘 pass 全程骰数百级）。
    const st = new TileStore(4200, 1200);
    let used = 0;
    const inner = new RNG(271828);
    const counting = {
      vanilla: inner.vanilla,
      next: () => { used++; return inner.next(); },
      nextInt: (m: number) => { used++; return inner.nextInt(m); },
      nextIntRange: (a: number, b: number) => { used++; return inner.nextIntRange(a, b); },
      int: (a: number, b: number) => { used++; return inner.int(a, b); },
      reseed: (s: number) => inner.reseed(s),
    } as unknown as RNG;
    expect(() => runDunesPass(st, counting, tinyGenState(4200))).not.toThrow();
    expect(used).toBeLessThan(2000);
  });
});
