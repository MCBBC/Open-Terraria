// ★wbake=1 占位对账本缺口修复刃（2026-09-28）——「部分图块永久色块」定谳锁。
// 病灶（机制级,亲读核定）：
//  A1 BakeClient.onMessage error 回包用 res.id（请求序号）查 pending（键=chunk key）
//     ——键域错位,永远查不到 → pending 残留+不重派。该 chunk 后续 request 全部
//     落在 bump 分支=永无新请求 → 占位对永挂透明页区（=用户实报丛林基地部分
//     区块暗棕色块:透明 cell 透出地下背景）。
//  A2 ChunkCache.requeueWorkerBake 对占位对（get() 建,有真对前）直接 return
//     ——单请求失败/降级 fail() 路径重入队被跳过 → 占位对既无在飞请求又不在
//     脏队,LRU 不淘汰（静态场景）=永久透明。
//  修复面（本文件锁）：
//  ① BakeClient inflight id→key 反查表：error 按 id 精确清账+requeue;
//  ② ChunkPair.placeholder 标记：get() 占位对置位,completeWorkerBake/renderChunk
//    真对不置;
//  ③ requeueWorkerBake：占位对=拆对入队（哨兵/无对语义不变;真对不入队语义不变）;
//  ④ flushDirty wbake 分支：占位对∧无在飞请求（蒸发残账）→ 拆对重派;
//  ⑤ 混合路由（worker 慢路径 15-50× 旁路）：视口内 chunk 主线程同步烘焙
//    （0.47ms/块 immediate 出图,传送 1-2s 空白根治）,视口外保持 worker 异步。
// node 无 canvas：页数组/空闲栈注入 stub（wbake-cache-accounts 同款范式）。
import { describe, it, expect, vi } from 'vitest';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import { BakeClient } from '../src/workers/BakeClient';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';

const W = 128, H = 96;

/** Priv 视图（wbake-cache-accounts 同款范式——不走 ChunkCache 交叉类型防私有
 *  成员撞车 reduced-to-never） */
type Priv = {
  chunks: Map<number, ChunkPair | undefined>;
  dirtyQueue: number[];
  dirtySet: Set<number>;
  markDirty(cx: number, cy: number): void;
  requeueWorkerBake(cx: number, cy: number): void;
  get(cx: number, cy: number): ChunkPair;
  flushDirty(maxN?: number, budgetMs?: number): void;
  completeWorkerBake(cx: number, cy: number, w: unknown, t: unknown, g: unknown,
    missing: string[], consumed: string[]): void;
  dispose(): void;
  workerAwaiting: Set<number>;
  cellFree: number[];
  pageUsed: number[];
  wallPages: unknown[];
  tilePages: unknown[];
  animView: { x0: number; y0: number; x1: number; y1: number } | null;
  bakeClient: unknown;
};

function fakeCanvas() {
  const noop = () => {};
  const ctx = {
    save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop,
    translate: noop, clearRect: noop, drawImage: noop, fillRect: noop,
    imageSmoothingEnabled: true, globalAlpha: 1, filter: 'none', fillStyle: '',
  };
  return { width: 1024, height: 1024, getContext: () => ctx };
}

function makeCache(): Priv {
  const st = new TileStore(W, H);
  const w = { store: st, groundLevel: 40, rockLevel: 60, treeX: [], treeStyle: [], treeTops: [], chests: [] } as unknown as World;
  const cc = new ChunkCache(w, new Map(), null, null) as unknown as Priv;
  (cc as unknown as { wallPages: unknown[] }).wallPages = [fakeCanvas()];
  (cc as unknown as { tilePages: unknown[] }).tilePages = [fakeCanvas()];
  cc.pageUsed.push(0);
  for (let s = 15; s >= 0; s--) cc.cellFree.push(s);
  return cc;
}

function makePair(cell = -1, placeholder = false): ChunkPair {
  return { wall: fakeCanvas(), tile: fakeCanvas(), sx: 0, sy: 0, cell,
    ...(placeholder ? { placeholder: true } : {}) } as unknown as ChunkPair;
}

type ClientPriv = {
  worker: { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> } | null;
  ready: boolean; dead: boolean; nextId: number;
  pending: Map<number, { cx: number; cy: number; bumped: boolean; hi: boolean }>;
  lowHold: Array<{ k: number; at: number }>;
  request(cx: number, cy: number, c: unknown, forceHi?: boolean): void;
  onMessage(res: unknown): void;
  fail(why: string): void;
};

function makeClient(cc: unknown): ClientPriv {
  const client = new BakeClient(cc as ChunkCache, {} as never, new Map()) as unknown as ClientPriv;
  client.worker = { postMessage: vi.fn(), terminate: vi.fn() };
  return client;
}

describe('wbake 占位对缺口①：error 回包按 id 反查（inflight 表）', () => {
  it('error 回包：pending 精确清账 + requeueWorkerBake 被调（键域错位回归锁）', () => {
    const cc = makeCache();
    const c = makeClient(cc);
    c.ready = true;
    c.request(2, 2, cc, true);                       // 派发（id=1）
    expect(c.pending.has(ChunkCache.key(2, 2))).toBe(true);
    const requeueSpy = vi.spyOn(cc, 'requeueWorkerBake');
    // worker 回 error:id=请求序号（非 chunk key——旧实现按 res.id 查 pending 恒 miss）
    c.onMessage({ type: 'error', id: 1, message: '测试单请求失败' });
    expect(c.pending.has(ChunkCache.key(2, 2))).toBe(false);   // pending 清账
    expect(requeueSpy).toHaveBeenCalledWith(2, 2);
    // 后续 request 不再被旧残账锁死（可重新派发）
    c.request(2, 2, cc, true);
    expect(c.worker!.postMessage).toHaveBeenCalledTimes(2);
  });

  it('error 回包 digest 直通 id 不误伤;未知 id 静默（errStreak 照计）', () => {
    const cc = makeCache();
    const c = makeClient(cc);
    c.ready = true;
    c.onMessage({ type: 'error', id: 999, message: '幻影 id' });   // 不抛不误删
    expect(c.pending.size).toBe(0);
  });
});

describe('wbake 占位对缺口②：requeueWorkerBake 占位对拆除', () => {
  it('占位对 → 拆对入队（真对/哨兵语义不变）', () => {
    const cc = makeCache();
    const k = ChunkCache.key(3, 4);
    // 占位对（get() 建）:requeue = 拆对 + 入队
    cc.chunks.set(k, makePair(5, true));
    cc.requeueWorkerBake(3, 4);
    expect(cc.chunks.get(k)).toBeUndefined();          // 拆对（哨兵,重建即真对）
    expect(cc.dirtyQueue).toContain(k);
    // 真对:不回队（动画稳态轮转的正常路径语义保持）
    (cc.dirtyQueue as number[]).length = 0;
    (cc as unknown as { dirtySet: Set<number> }).dirtySet = new Set();
    cc.chunks.set(k, makePair(5));                     // 真对（无 placeholder 标记）
    cc.requeueWorkerBake(3, 4);
    expect(cc.dirtyQueue.length).toBe(0);
    expect(cc.chunks.get(k)).toBeDefined();
  });

  it('fail() 降级:占位对被拆对回队,主线程路径可重建（A2 永挂回归锁）', () => {
    const cc = makeCache();
    cc.animView = null;
    const c = makeClient(cc);
    cc.bakeClient = c as unknown as never;
    c.ready = true;
    cc.get(1, 1);                                      // 占位对建立（animView 未置=低优）
    const k = ChunkCache.key(1, 1);
    expect(cc.chunks.get(k)?.placeholder).toBe(true);  // get() 占位对带标记
    c.fail('测试整体降级');
    expect(cc.chunks.get(k)).toBeUndefined();          // 占位对已拆（待重建）
    expect(cc.dirtyQueue).toContain(k);                // 主线程脏队接手
    expect((cc as unknown as { bakeClient: unknown }).bakeClient).toBeNull();
    // 旗关路径 get() 重建真对（placeholder 不带）
    const pair = cc.get(1, 1);
    expect(pair.placeholder).toBeFalsy();
  });
});

describe('wbake 占位对缺口③：flushDirty 蒸发残账救回', () => {
  it('占位对∧无在飞 → 拆对重派;占位对∧在飞 → 跳过', () => {
    const cc = makeCache();
    const client = {
      request: vi.fn(), bump: vi.fn(), noteFileArrived: vi.fn(), dispose: vi.fn(), pumpLow: vi.fn(),
      hasPending: vi.fn((k: number) => k === ChunkCache.key(6, 6)),   // (6,6) 在飞
    };
    (cc as unknown as { bakeClient: unknown }).bakeClient = client;
    const kEvap = ChunkCache.key(5, 5);
    cc.chunks.set(kEvap, makePair(2, true));           // 蒸发占位对（无在飞）
    cc.dirtyQueue.push(kEvap);
    (cc as unknown as { dirtySet: Set<number> }).dirtySet.add(kEvap);
    const kFly = ChunkCache.key(6, 6);
    cc.chunks.set(kFly, makePair(3, true));            // 在飞占位对
    cc.dirtyQueue.push(kFly);
    (cc as unknown as { dirtySet: Set<number> }).dirtySet.add(kFly);
    cc.flushDirty();
    expect(cc.chunks.get(kEvap)).toBeUndefined();      // 蒸发占位对被拆
    expect(client.request).toHaveBeenCalledWith(5, 5, expect.anything());
    expect(cc.chunks.get(kFly)?.placeholder).toBe(true); // 在飞占位对不动
    expect(client.request).not.toHaveBeenCalledWith(6, 6, expect.anything());
  });
});

describe('wbake 混合路由（worker 慢路径旁路）', () => {
  it('get() 视口内 → 主线程同步烘焙（不派发 worker,即出真对）;视口外 → 占位+worker', () => {
    const cc = makeCache();
    const client = {
      request: vi.fn(), bump: vi.fn(), noteFileArrived: vi.fn(), dispose: vi.fn(), pumpLow: vi.fn(),
      hasPending: vi.fn(() => false),
    };
    (cc as unknown as { bakeClient: unknown }).bakeClient = client;
    (cc as unknown as { animView: { x0: number; y0: number; x1: number; y1: number } | null }).animView
      = { x0: 0, y0: 0, x1: 512, y1: 512 };
    const p = cc.get(0, 0);                            // 视口内
    expect(p.placeholder).toBeFalsy();                 // 真对（同步烘焙）
    expect(p.cell).toBe(0);
    expect(client.request).not.toHaveBeenCalledWith(0, 0, expect.anything(), true);
    expect((cc as unknown as { workerAwaiting: Set<number> }).workerAwaiting.size).toBe(0);
    // 视口外:占位+worker（后台流式,现状语义）
    (cc as unknown as { animView: { x0: number; y0: number; x1: number; y1: number } | null }).animView
      = { x0: 8192, y0: 8192, x1: 12288, y1: 12288 };
    const q = cc.get(20, 20);
    expect(q.placeholder).toBe(true);
    expect(client.request).toHaveBeenCalledWith(20, 20, expect.anything(), false);
  });

  it('flushDirty wbake 分支：视口内脏块=同步 get;视口外=request', () => {
    const cc = makeCache();
    const client = {
      request: vi.fn(), bump: vi.fn(), noteFileArrived: vi.fn(), dispose: vi.fn(), pumpLow: vi.fn(),
      hasPending: vi.fn(() => false),
    };
    (cc as unknown as { bakeClient: unknown }).bakeClient = client;
    (cc as unknown as { animView: { x0: number; y0: number; x1: number; y1: number } | null }).animView
      = { x0: 0, y0: 0, x1: 512, y1: 512 };
    // 预置哨兵（既有 chunk 被标脏态;markDirty 对惰性未建 chunk 不入队）
    const sentinel = undefined as unknown as ChunkPair;
    cc.chunks.set(ChunkCache.key(0, 0), sentinel);
    cc.chunks.set(ChunkCache.key(5, 5), sentinel);
    cc.markDirty(0, 0);                                // 视口内
    cc.markDirty(5, 5);                                // 视口外（世界内:128×96 tiles=8×6 chunks）
    cc.flushDirty();
    expect(client.request).toHaveBeenCalledWith(5, 5, expect.anything());
    expect(client.request).not.toHaveBeenCalledWith(0, 0, expect.anything());
    const pair = cc.chunks.get(ChunkCache.key(0, 0)) as ChunkPair;
    expect(pair.placeholder).toBeFalsy();              // 同步烘焙真对
  });
});
