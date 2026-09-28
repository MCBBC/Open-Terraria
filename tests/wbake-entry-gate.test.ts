// ★wbake=1 世界入场空白修复刃（2026-09-28）——视口优先调度 + 幕布覆盖门锁。
// 病灶定谳：wbake=1 首烘 chunk 占位=透明页区,whenFirstPaint(2/4 渲染帧)的幕布门
// 只数帧——worker 往返慢于帧数时幕布提前掀开=全视口瓦片/墙层空白 1-2s（用户
// 截图图36/37;wbake=0 同步烘焙在幕布下完成=无感）。
// 修复面（本文件锁）：
//  ① ChunkCache.inViewport/viewportCovered：视域判定 + 可视视口 chunk 全部落页查询;
//  ② workerAwaiting 占位账：get() wbake 占位入账,completeWorkerBake/主线程重建/
//    LRU 淘汰/dispose 出账——旗关恒空=viewportCovered 恒 true（幕布语义零变化）;
//  ③ BakeClient 视口优先调度：高优（forceHi/视域内）ready 即派发;低优（视口外）
//    lowHold 回包驱动限速排空;低优升级;fail 全队列回退主线程;
//  ④ Game.whenViewportBaked 覆盖门 + 帧循环轮询接线（源锚）+ whenFirstPaint
//    帧数语义不动（源锚）+ mainFlow 旗关表达式逐字保留（源锚）。
// node 无 canvas：页数组/空闲栈注入 stub（wbake-cache-accounts 同款范式）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import { BakeClient } from '../src/workers/BakeClient';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';

const W = 128, H = 96;
const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const MAINFLOW = readFileSync(new URL('../src/mainFlow.ts', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../src/workers/BakeClient.ts', import.meta.url), 'utf8');

type Priv = Pick<ChunkCache, 'chunks' | 'dirtyQueue' | 'markDirty' | 'dispose' | 'get'
  | 'pageCount' | 'flushDirty' | 'completeWorkerBake' | 'requeueWorkerBake'
  | 'inViewport' | 'viewportCovered' | 'animView'> & {
  workerAwaiting: Set<number>;
  cellFree: number[];
  pageUsed: number[];
  wallPages: Array<{ width: number; height: number; getContext(kind: string): unknown }>;
  tilePages: Array<{ width: number; height: number; getContext(kind: string): unknown }>;
  glDirtyPagesW: Map<number, Set<number>>;
  glDirtyPagesT: Map<number, Set<number>>;
  bakeClient: { request: ReturnType<typeof vi.fn>; bump: ReturnType<typeof vi.fn>; noteFileArrived: ReturnType<typeof vi.fn>; dispose(): void } | null;
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

function makeCache(world?: Partial<World>): Priv {
  const st = new TileStore(W, H);
  const w = { store: st, groundLevel: 40, rockLevel: 60, treeX: [], treeStyle: [], treeTops: [], chests: [],
    ...world } as unknown as World;
  const cc = new ChunkCache(w, new Map(), null, null) as unknown as Priv;
  (cc as unknown as { wallPages: unknown[] }).wallPages = [fakeCanvas()];
  (cc as unknown as { tilePages: unknown[] }).tilePages = [fakeCanvas()];
  cc.pageUsed.push(0);
  for (let s = 15; s >= 0; s--) cc.cellFree.push(s);
  return cc;
}

function makePair(cell = -1): ChunkPair {
  return { wall: fakeCanvas(), tile: fakeCanvas(), sx: 0, sy: 0, cell } as unknown as ChunkPair;
}

function fakeClient() {
  return { request: vi.fn(), bump: vi.fn(), noteFileArrived: vi.fn(), dispose: vi.fn() };
}

// ---- BakeClient 调度测试夹具：真 TileStore（dispatch 快照可完整构建）----
function makeClientCache() {
  const cc = makeCache();
  return cc;
}

type ClientPriv = {
  worker: { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn>; onmessage: unknown; onerror: unknown } | null;
  ready: boolean;
  dead: boolean;
  pending: Map<number, { cx: number; cy: number; bumped: boolean; hi: boolean }>;
  preReadyHigh: number[];
  preReadyLow: number[];
  lowHold: Array<{ k: number; at: number }>;
  request(cx: number, cy: number, c: unknown, forceHi?: boolean): void;
  dispatch(k: number): void;
  onMessage(res: unknown): void;
  flushPreReady(): void;
  fail(why: string): void;
};

function makeClient(cc: Priv): ClientPriv {
  const client = new BakeClient(cc as unknown as ChunkCache, {} as never, new Map()) as unknown as ClientPriv;
  client.worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
  return client;
}

const bakedReply = (cx: number, cy: number) => ({
  type: 'baked', id: 0, cx, cy, wall: {}, tile: {}, glow: null, missing: [], consumed: [], ms: 1,
});

describe('入场空白修复刃①：ChunkCache 视域判定与覆盖查询', () => {
  it('inViewport：animView 相交判定（含 +2 chunk 外延带语义=调用方给定域）', () => {
    const cc = makeCache();
    expect(cc.inViewport(0, 0)).toBe(false);            // animView 未置=保守低优
    cc.animView = { x0: 256, y0: 256, x1: 1024, y1: 768 };
    expect(cc.inViewport(1, 1)).toBe(true);             // 256..512 与视域相交
    expect(cc.inViewport(0, 0)).toBe(false);            // [0,256) 与 [256,…) 相切不相交
    expect(cc.inViewport(2, 2)).toBe(true);             // 512..768 在域内
    expect(cc.inViewport(5, 1)).toBe(false);            // 1280..1536 在域外
    expect(cc.inViewport(1, 5)).toBe(false);
  });

  it('viewportCovered：旗关/无占位恒 true（幕布语义零变化）', () => {
    const cc = makeCache();
    cc.animView = { x0: 0, y0: 0, x1: 1024, y1: 768 };
    expect(cc.viewportCovered()).toBe(true);
    // 已落页的真对不阻塞
    cc.chunks.set(ChunkCache.key(1, 1), makePair(3));
    expect(cc.viewportCovered()).toBe(true);
  });

  it('get() wbake 占位 → workerAwaiting 入账 → 视口内未覆盖;视口外不阻塞', () => {
    const cc = makeCache();
    const client = fakeClient();
    cc.bakeClient = client;
    cc.animView = { x0: 0, y0: 0, x1: 256, y1: 256 };   // 只视口 (0,0) 一块
    const p = cc.get(0, 0);
    expect(p.cell).toBe(0);                              // 占位对（粘滞槽位）
    expect(client.request).toHaveBeenCalledWith(0, 0, expect.anything(), true); // 可视支路=高优
    expect(cc.workerAwaiting.has(ChunkCache.key(0, 0))).toBe(true);
    expect(cc.viewportCovered()).toBe(false);            // 视口内占位=未覆盖
    // 视口外占位不阻塞覆盖门
    const client2 = fakeClient();
    cc.bakeClient = client2;
    cc.animView = { x0: 4096, y0: 4096, x1: 8192, y1: 8192 };
    cc.get(1, 1);
    expect(cc.workerAwaiting.has(ChunkCache.key(1, 1))).toBe(true);
    expect(cc.viewportCovered()).toBe(true);
  });

  it('completeWorkerBake 出账 → 覆盖;markDirty 重占位再入账', () => {
    const cc = makeCache();
    cc.bakeClient = fakeClient();
    cc.animView = { x0: 0, y0: 0, x1: 256, y1: 256 };
    cc.get(0, 0);
    expect(cc.viewportCovered()).toBe(false);
    cc.completeWorkerBake(0, 0, {} as ImageBitmap, {} as ImageBitmap, null, [], []);
    expect(cc.workerAwaiting.size).toBe(0);
    expect(cc.viewportCovered()).toBe(true);
    // 运行期编辑 → 占位重建 → 再次未覆盖 → 回包再覆盖
    cc.markDirty(0, 0);
    cc.get(0, 0);
    expect(cc.viewportCovered()).toBe(false);
    cc.completeWorkerBake(0, 0, {} as ImageBitmap, {} as ImageBitmap, null, [], []);
    expect(cc.viewportCovered()).toBe(true);
  });

  it('LRU 淘汰/dispose 出账（防覆盖门被陈旧 key 永久阻塞）', () => {
    const cc = makeCache();
    cc.bakeClient = fakeClient();
    const saved = ChunkCache.MAX_CHUNKS;
    ChunkCache.MAX_CHUNKS = 1;
    try {
      cc.get(0, 0);
      cc.get(1, 1);                       // 超限 → 淘汰最旧 (0,0)
      expect(cc.workerAwaiting.has(ChunkCache.key(0, 0))).toBe(false);
      expect(cc.workerAwaiting.has(ChunkCache.key(1, 1))).toBe(true);
    } finally { ChunkCache.MAX_CHUNKS = saved; }
    cc.dispose();
    expect(cc.workerAwaiting.size).toBe(0);
  });
});

describe('入场空白修复刃②：BakeClient 视口优先调度', () => {
  it('高优（forceHi）ready 即派发;低优（视口外）进 lowHold 不派发', () => {
    const cc = makeClientCache();
    const c = makeClient(cc);
    c.ready = true;
    c.request(2, 2, cc, true);
    expect(c.worker!.postMessage).toHaveBeenCalledTimes(1);
    const msg = c.worker!.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('bake');
    expect(msg.snap.cx).toBe(2);
    c.request(5, 3, cc);                                  // animView 未置=低优（世界内 chunk）
    expect(c.worker!.postMessage).toHaveBeenCalledTimes(1);   // 不派发
    expect(c.lowHold.length).toBe(1);
  });

  it('回包驱动排空:无高优在飞 cap=4,有高优在飞 cap=1（保底不饿死）', () => {
    const cc = makeClientCache();
    const c = makeClient(cc);
    c.ready = true;
    c.request(0, 0, cc, true);                            // 高优 A 在飞
    for (let i = 1; i <= 6; i++) c.request(i, 0, cc);     // 6 低优
    expect(c.lowHold.length).toBe(6);
    c.onMessage(bakedReply(0, 0));                        // A 回包 → 有高优在飞?无 → cap 4
    expect(c.lowHold.length).toBe(2);
    expect(c.worker!.postMessage).toHaveBeenCalledTimes(5);   // A + 4 低优
    // 高优在飞态:cap=1
    c.request(7, 0, cc, true);                            // 高优 B 派发
    const before = c.worker!.postMessage.mock.calls.length;
    c.onMessage(bakedReply(0, 1));                        // 一个低优回包 → cap 1
    expect(c.worker!.postMessage.mock.calls.length).toBe(before + 1);
    expect(c.lowHold.length).toBe(1);
    c.onMessage(bakedReply(7, 0));                        // B 回包 → 无高优 → cap 4
    expect(c.lowHold.length).toBe(0);
  });

  it('低优升级：lowHold 内摘出立即派发;已在飞标 hi', () => {
    const cc = makeClientCache();
    const c = makeClient(cc);
    c.ready = true;
    c.request(3, 3, cc);                                  // 低优入 hold
    expect(c.lowHold.length).toBe(1);
    c.request(3, 3, cc, true);                            // 同 key 高优=升级
    expect(c.lowHold.length).toBe(0);
    expect(c.worker!.postMessage).toHaveBeenCalledTimes(1);
    expect(c.pending.get(ChunkCache.key(3, 3))?.hi).toBe(true);
  });

  it('待就绪分流：ready 前 high/low 分队;flushPreReady 高先低后（worker FIFO=烘焙序）', () => {
    const cc = makeClientCache();
    const c = makeClient(cc);
    c.ready = false;
    c.request(0, 0, cc, true);
    c.request(5, 5, cc);
    expect(c.preReadyHigh).toEqual([ChunkCache.key(0, 0)]);
    expect(c.preReadyLow).toEqual([ChunkCache.key(5, 5)]);
    expect(c.worker!.postMessage).not.toHaveBeenCalled();
    c.ready = true;
    c.flushPreReady();
    const types = c.worker!.postMessage.mock.calls.map((call) => call[0].snap.cx);
    expect(types).toEqual([0, 5]);                        // 高优先派发
    expect(c.lowHold.length).toBe(0);                     // 无高优在飞 → 低优随排空
  });

  it('fail 锁死降级：pending/preReady 高低/lowHold 全量回退主线程脏队', () => {
    const cc = makeClientCache();
    const requeue = vi.fn();
    (cc as unknown as { requeueWorkerBake: unknown }).requeueWorkerBake = requeue;
    const c = makeClient(cc);
    c.ready = false;
    c.request(1, 1, cc, true);
    c.request(2, 2, cc);
    c.ready = true;
    c.request(3, 3, cc);                                  // lowHold
    expect(c.lowHold.length).toBe(1);
    c.fail('测试降级');
    // 3 个唯一 key 全量回退（pending 与待发队列双登记同 pristine fail 语义,重复回
    // 队由 requeueWorkerBake 去重无害）
    expect(new Set(requeue.mock.calls.map((call) => `${call[0]},${call[1]}`)).size).toBe(3);
    expect(c.lowHold.length).toBe(0);
    expect(c.preReadyHigh.length).toBe(0);
    expect(c.preReadyLow.length).toBe(0);
    expect(c.pending.size).toBe(0);
  });
});

describe('入场空白修复刃③：幕布覆盖门（源锚+旗关零变化）', () => {
  it('Game.whenViewportBaked 接线：旗关立即 resolve;覆盖门/超时保险/帧循环轮询在位', () => {
    expect(GAME).toContain('whenViewportBaked(timeoutMs = 3000): Promise<void>');
    expect(GAME).toContain('if (!WBAKE_ENABLED) return Promise.resolve();');
    expect(GAME).toContain('_viewportWaits');
    // 帧循环轮询:与 _paintWaits 同域消费（真实渲染帧驱动）
    expect(GAME).toContain('this._viewportWaits = this._viewportWaits.filter((w) => {');
    expect(GAME).toContain('|| nowMs >= w.deadline) { w.res(); return false; }');
  });

  it('whenFirstPaint 帧数语义不动（2 渲染帧缺省/跳帧不计数——既有锁同域复核）', () => {
    expect(GAME).toContain('whenFirstPaint(frames = 2): Promise<void> {');
    expect(GAME).toContain('if (this._paintedFrames >= frames) return Promise.resolve();');
    expect(GAME).toContain('return new Promise((res) => this._paintWaits.push({ frames, res }));');
  });

  it('mainFlow：旗关表达式逐字保留（wbake=0 幕布语义零变化）', () => {
    expect(MAINFLOW).toContain('const entryGate = WBAKE_ENABLED');
    expect(MAINFLOW).toContain(': g.whenFirstPaint(4);');
    // 旗开 = whenFirstPaint(4) 之后链入覆盖门（3s 保险强制掀幕）
    expect(MAINFLOW).toContain('g.whenFirstPaint(4).then(() => g.whenViewportBaked(3000))');
    // 3s 兜底 race 原样保留（渲染异常防永久黑屏）
    expect(MAINFLOW).toContain('new Promise((r) => setTimeout(r, 3000))');
  });

  it('BakeClient：视口优先调度锚（lowHold/drainLow/inViewport 消费在位）', () => {
    expect(CLIENT).toContain('forceHi = false');
    expect(CLIENT).toContain('this.cache.inViewport(cx, cy)');
    expect(CLIENT).toContain('private drainLow(): void');
    expect(CLIENT).toContain('LOW_DRAIN_BUSY');
    expect(CLIENT).toContain('private upgrade(k: number, p: Pending): void');
  });

  it('ChunkCache：占位账与视域查询锚（workerAwaiting 三出账口+inViewport/viewportCovered）', () => {
    const CACHE = readFileSync(new URL('../src/render/ChunkCache.ts', import.meta.url), 'utf8');
    expect(CACHE).toContain('workerAwaiting.add(k)');
    expect(CACHE).toContain('this.workerAwaiting.delete(k);   // 真对落页=出账');
    expect(CACHE).toContain('viewportCovered(): boolean');
    expect(CACHE).toContain('inViewport(cx: number, cy: number): boolean');
  });
});
