// IIII249 ?shinebudget=<ms> 巡航烘焙时间盒——纯函数单测(2026-09-13)。
//  面:flag 解析(parseShineBudget)/预算记账(budgetExhausted/budgetConsume)/
//  工作清单合并排序(planShineWork:先到先得+中心优先+pair 去重+确定性并列)/
//  条目完成态(shineEntryComplete)/遥测账本复位(shineStats.reset)。
//  非纯函数面(断行续烘逐位恒等/flag-off 全帧等价/A-B 帧时/追赶期)由
//  scripts/_iii249-equiv.mjs(烘焙产物摘要对拍)+ scripts/_iii249-shine-ab.mjs
//  探针闭环,不在纯函数可达面。
import { describe, expect, it } from 'vitest';
import {
  parseShineBudget, shineBudgetMs, shineStats, shineEntryComplete,
  budgetExhausted, budgetConsume, planShineWork,
} from '../src/render/TileShine';
import type { ChunkPair } from '../src/render/ChunkCache';

const pairOf = (n: number) => ({ __test: 'pair', n }) as unknown as ChunkPair;

describe('IIIII249 parseShineBudget — ?shinebudget=<ms> 解析', () => {
  it('未传/无参 → null(缺省=现行「每帧 2 chunk」计数预算,零变化)', () => {
    expect(parseShineBudget('')).toBeNull();
    expect(parseShineBudget('?play=small')).toBeNull();
    expect(parseShineBudget('?seed=05162020&glband=0')).toBeNull();
  });
  it('合法正整数/小数(向下取整)/多参混排', () => {
    expect(parseShineBudget('?shinebudget=4')).toBe(4);
    expect(parseShineBudget('?play=small&shinebudget=8&seed=x')).toBe(8);
    expect(parseShineBudget('?shinebudget=4.9')).toBe(4);
    expect(parseShineBudget('?shinebudget=16')).toBe(16);
  });
  it('shinebudget=0 = 显式关(转正后反向逃生门);空串同 0', () => {
    expect(parseShineBudget('?shinebudget=0')).toBe(0);
    expect(parseShineBudget('?shinebudget=')).toBe(0);
  });
  it('负数/非有限 → null(容错视同未传,不炸)', () => {
    expect(parseShineBudget('?shinebudget=-3')).toBeNull();
    expect(parseShineBudget('?shinebudget=abc')).toBeNull();
    expect(parseShineBudget('?shinebudget=Infinity')).toBeNull();
    expect(parseShineBudget('?shinebudget=NaN')).toBeNull();
  });
  it('Node 环境(无 location)模块装载 = 0(缺省路径)', () => {
    expect(shineBudgetMs).toBe(0);
  });
});

describe('IIIII249 预算记账 — 计数形态原语义 + 时间盒死线', () => {
  it('budgetExhausted:undefined=false;计数 left<=0=true(原语义);死线已过=true', () => {
    expect(budgetExhausted(undefined)).toBe(false);
    expect(budgetExhausted({ left: 2 })).toBe(false);
    expect(budgetExhausted({ left: 0 })).toBe(true);
    const past = { deadline: performance.now() - 1 };
    const future = { deadline: performance.now() + 60_000 };
    expect(budgetExhausted(past)).toBe(true);
    expect(budgetExhausted(future)).toBe(false);
  });
  it('budgetConsume:仅计数形态扣减;时间盒死线不被"扣减"语义触碰', () => {
    const c: { left: number } = { left: 2 };
    budgetConsume(c);
    expect(c.left).toBe(1);
    budgetConsume(undefined);                       // 无预算不炸
    const d = { deadline: 123.456 };
    budgetConsume(d as unknown as { left: number }); // 形态守卫:'left' in 才扣
    expect(d.deadline).toBe(123.456);
  });
});

describe('IIIII249 planShineWork — 先到先得 + 中心优先 + 去重(纯函数)', () => {
  const CX = 256;   // CHUNK*TILE,chunk 中心 = (cx+0.5)*256
  it('中心优先:距相机中心升序(相机在 chunk(2,2) 中心)', () => {
    const camX = 2.5 * CX, camY = 2.5 * CX;
    const fresh = [
      { cx: 0, cy: 2, pair: pairOf(0) },
      { cx: 3, cy: 2, pair: pairOf(3) },
      { cx: 2, cy: 2, pair: pairOf(2) },
    ];
    const out = planShineWork([], fresh, camX, camY, CX);
    expect(out.map((o) => o.pair)).toEqual([pairOf(2), pairOf(3), pairOf(0)]);
  });
  it('先到先得:待烘队列整体优先于本帧新缺额(即便更远)', () => {
    const camX = 0, camY = 0;
    const p99 = pairOf(99), p1 = pairOf(1);
    const pending = [{ cx: 9, cy: 9, pair: p99 }];   // 远
    const fresh = [{ cx: 0, cy: 0, pair: p1 }];      // 近
    const out = planShineWork(pending, fresh, camX, camY, CX);
    expect(out).toHaveLength(2);
    expect(out[0].pair).toBe(p99);
    expect(out[1].pair).toBe(p1);
  });
  it('组内中心升序:待烘队列内部也按距离(先到先得定组,组内定序)', () => {
    const camX = 0, camY = 0;
    const pending = [
      { cx: 5, cy: 0, pair: pairOf(51) },
      { cx: 1, cy: 0, pair: pairOf(11) },
    ];
    const out = planShineWork(pending, [], camX, camY, CX);
    expect(out.map((o) => o.cx)).toEqual([1, 5]);
  });
  it('pair 去重:同 chunk 同帧只处理一次(队列与缺额面重叠时)', () => {
    const camX = 0, camY = 0;
    const p = pairOf(7);
    const out = planShineWork([{ cx: 1, cy: 1, pair: p }], [{ cx: 1, cy: 1, pair: p }], camX, camY, CX);
    expect(out).toHaveLength(1);
  });
  it('并列距离 = 行序确定性(cy 优先,cx 次之)', () => {
    const camX = 2.5 * CX, camY = 2.5 * CX;
    // chunk(1,2) 与 (3,2) 对相机中心对称等距
    const fresh = [
      { cx: 3, cy: 2, pair: pairOf(3) },
      { cx: 1, cy: 2, pair: pairOf(1) },
    ];
    const out = planShineWork([], fresh, camX, camY, CX);
    expect(out.map((o) => o.cx)).toEqual([1, 3]);
  });
  it('不改入参(返回新数组)', () => {
    const camX = 0, camY = 0;
    const pending = [{ cx: 5, cy: 5, pair: pairOf(5) }];
    const fresh = [{ cx: 0, cy: 0, pair: pairOf(0) }];
    planShineWork(pending, fresh, camX, camY, CX);
    expect(pending[0].cx).toBe(5);
    expect(fresh[0].cx).toBe(0);
  });
});

describe('IIIII249 条目完成态与遥测账本', () => {
  it('shineEntryComplete:_resumeRow undefined=完成;>0=部分烘焙待续', () => {
    expect(shineEntryComplete({ shimmerQ: 0 } as never)).toBe(true);
    expect(shineEntryComplete({ shimmerQ: 0, _resumeRow: undefined } as never)).toBe(true);
    expect(shineEntryComplete({ shimmerQ: 0, _resumeRow: 5 } as never)).toBe(false);
  });
  it('shineStats.reset:数值位归零,reset 本体保留', () => {
    shineStats.frames = 9; shineStats.bakes = 7; shineStats.catchupMax = 33;
    shineStats.hits = 100; shineStats.pending = 4;
    shineStats.reset();
    expect(shineStats.frames).toBe(0);
    expect(shineStats.bakes).toBe(0);
    expect(shineStats.catchupMax).toBe(0);
    expect(shineStats.hits).toBe(0);
    expect(shineStats.pending).toBe(0);
    expect(typeof shineStats.reset).toBe('function');
  });
});
