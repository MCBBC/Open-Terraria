// ★C4 烘焙 Worker 化——ChunkCache wbake 支路账本锁（2026-09-28）。
// 锁面：
//  ① 旗缺省关（node 无 location → WBAKE_ENABLED=false）;
//  ② flushDirty wbake 支路：脏 chunk 派发 bakeClient.request（不触主线程烘焙）;
//  ③ markDirty/invalidateAll 对在飞请求 bump;
//  ④ completeWorkerBake：落页 pair + GL 双层账（I1 双记不变式）+ missing/consumed
//    登记（晚到表/表替换链与主线程同源）+ 粘滞 cell 复用;
//  ⑤ requeueWorkerBake 降级回队守卫（世界外不入队/真对不入队）。
// node 无 canvas：页数组/空闲栈注入 stub（chunk-canvas-release 同款范式）。
import { describe, it, expect, vi } from 'vitest';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import { WBAKE_ENABLED } from '../src/workers/BakeClient';
import type { World } from '../src/world/World';

const W = 128, H = 96;

type Priv = Pick<ChunkCache, 'chunks' | 'dirtyQueue' | 'markDirty' | 'dispose' | 'releasePair'
  | 'pageCount' | 'invalidateAll' | 'flushDirty' | 'completeWorkerBake' | 'requeueWorkerBake'
  | 'lastFlushCount' | 'lastFlushMs'> & {
  cellFree: number[];
  stickyCell: Map<number, number>;
  wallPages: Array<{ width: number; height: number; getContext(kind: string): unknown }>;
  tilePages: Array<{ width: number; height: number; getContext(kind: string): unknown }>;
  pageUsed: number[];
  glDirtyPagesW: Map<number, Set<number>>;
  glDirtyPagesT: Map<number, Set<number>>;
  chunkSheets: Map<number, Set<string>>;
  chunkConsumed: Map<number, Set<string>>;
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

/** 空 store stub（inBounds 恒 true 但全部通道为 0 → 内核各 pass 空跳,主线程
 *  路径可完整走通;flushDirty 世界守卫亦放行） */
function emptyStore() {
  return {
    onTileChanged: () => {}, inBounds: () => true, idx: () => 0,
    flags: new Uint8Array(1), type: new Uint8Array(1), wall: new Uint8Array(1),
    half: new Uint8Array(1), slope: new Uint8Array(1), wire: new Uint8Array(1),
    paint: new Uint8Array(1), paintWall: new Uint8Array(1), liquid: new Uint8Array(1),
    frameX: new Uint8Array(1), frameY: new Uint8Array(1),
    coat: new Uint8Array(256), showInvisibleBlocks: false, w: 0, h: 0,
  };
}

function makeCache(): Priv {
  const world = { store: { onTileChanged: () => {}, inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H } } as unknown as World;
  const cc = new ChunkCache(world, new Map(), null, null) as unknown as Priv;
  // 预置一页 16 cell（绕开 allocCell 的 document 触点——node 无 DOM）
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
  return { request: vi.fn(), bump: vi.fn(), noteFileArrived: vi.fn(), dispose: vi.fn(), pumpLow: vi.fn(), hasPending: vi.fn(() => false) };
}

describe('C4 wbake 旗与账本', () => {
  it('旗缺省关（node/无 location = false;灰度禁转正）', () => {
    expect(WBAKE_ENABLED).toBe(false);
  });

  it('flushDirty wbake 支路：脏 chunk 派发 client.request,不触主线程烘焙', () => {
    const cc = makeCache();
    const client = fakeClient();
    cc.bakeClient = client;
    const k = ChunkCache.key(2, 3);
    cc.chunks.set(k, makePair(5));
    cc.markDirty(2, 3);                     // 置哨兵+入队+bump
    expect(client.bump).toHaveBeenCalledWith(k);
    cc.bakeClient = client;                 // markDirty 后仍持有
    cc.flushDirty();
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(2, 3, expect.anything());
    expect(cc.dirtyQueue.length).toBe(0);   // 出队即派发
    expect(cc.lastFlushCount).toBe(1);
    // 世界外悬空 key：不出队不派发
    const kOut = ChunkCache.key(999, 999);
    cc.chunks.set(kOut, makePair(-1));
    cc.markDirty(999, 999);
    cc.flushDirty();
    expect(client.request).toHaveBeenCalledTimes(1);   // 不增
  });

  it('bakeClient=null（旗关现状）：flushDirty 走主线程路径（同步烘焙,不派发）', () => {
    const cc = makeCache();
    const client = fakeClient();
    const k = ChunkCache.key(1, 1);
    cc.chunks.set(k, makePair(7));
    cc.markDirty(1, 1);
    // 换空世界 stub（inBounds 恒 false→内核 pass 全跳）后主线程同步烘焙可走通
    (cc as unknown as { world: { store: unknown } }).world = { store: emptyStore() };
    cc.flushDirty();
    expect(client.request).not.toHaveBeenCalled();       // 主线程路径
    expect(cc.lastFlushCount).toBe(1);                   // 同步烘焙完成 1 块
    const pair = cc.chunks.get(k) as ChunkPair;          // 真对已建（renderChunk 全链）
    expect(pair.cell).toBe(7);
    expect(cc.glDirtyPagesW.get(0)?.has(7)).toBe(true);  // GL 账照记
  });

  it('completeWorkerBake：真对落页 + GL 双层账 + missing/consumed 登记', () => {
    const cc = makeCache();
    cc.completeWorkerBake(4, 5, {} as ImageBitmap, {} as ImageBitmap, null,
      ['vanilla/Tiles_99.png'], ['vanilla/Tiles_5_0.png', 'vanilla/Wall_1.png']);
    const k = ChunkCache.key(4, 5);
    const pair = cc.chunks.get(k) as ChunkPair | undefined;
    expect(pair).toBeDefined();
    expect(pair!.cell).toBe(0);             // 预置空闲栈顶（push 15..0 → pop=0）
    expect(pair!.sx).toBe(0);               // slot0 → 页内 (0,0)
    expect(pair!.sy).toBe(0);
    // ★I1 双层同记（bgl-tile-starve 判据）
    expect(cc.glDirtyPagesW.get(0)?.has(0)).toBe(true);
    expect(cc.glDirtyPagesT.get(0)?.has(0)).toBe(true);
    // 晚到表/表替换链登记
    expect(cc.chunkSheets.get(k)?.has('vanilla/Tiles_99.png')).toBe(true);
    expect(cc.chunkConsumed.get(k)?.has('vanilla/Wall_1.png')).toBe(true);
    expect(cc.pageUsed[0]).toBe(1);
  });

  it('completeWorkerBake 重烘：粘滞原位复用（不换 slot）', () => {
    const cc = makeCache();
    cc.completeWorkerBake(4, 5, {} as ImageBitmap, {} as ImageBitmap, null, [], []);
    const cell1 = (cc.chunks.get(ChunkCache.key(4, 5)) as ChunkPair).cell;
    // 置哨兵（markDirty 语义）后回包再落
    cc.markDirty(4, 5);
    cc.completeWorkerBake(4, 5, {} as ImageBitmap, {} as ImageBitmap, null, [], []);
    const pair = cc.chunks.get(ChunkCache.key(4, 5)) as ChunkPair;
    expect(pair.cell).toBe(cell1);          // 同槽原位
    expect(cc.pageUsed[0]).toBe(1);         // 占用计数不翻倍
    expect(cc.cellFree).not.toContain(cell1);
  });

  it('requeueWorkerBake：哨兵回队;世界外/真对不回队', () => {
    const cc = makeCache();
    const k = ChunkCache.key(1, 2);
    cc.chunks.set(k, makePair(3));
    cc.markDirty(1, 2);                     // 哨兵+入队
    cc.chunks.delete(k);                    // 模拟在飞未落
    (cc as unknown as { dirtyQueue: number[] }).dirtyQueue = [];
    (cc as unknown as { dirtySet: Set<number> }).dirtySet = new Set();
    cc.requeueWorkerBake(1, 2);
    expect(cc.dirtyQueue).toEqual([k]);
    // 真对在场 → 不回队（get 占位已建）
    cc.requeueWorkerBake(1, 2);
    expect(cc.dirtyQueue.length).toBe(1);   // Set 去重
    // 世界外 → 静默
    (cc as unknown as { dirtyQueue: number[] }).dirtyQueue = [];
    cc.requeueWorkerBake(200, 200);
    expect(cc.dirtyQueue.length).toBe(0);
  });
});
