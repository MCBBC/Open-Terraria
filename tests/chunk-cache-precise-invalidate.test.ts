// ChunkCache 晚到贴图精确失效测试（before/after 失效范围断言）。
// 背景：烘焙期懒取贴图 miss（SpriteAtlas.ensureVImage → bakeTracker.note，
// SpriteAtlas.ts:391）会把 fallback 烤进 chunk；表晚到（onLoaded）必须重烘。
// ★before（旧 invalidateAll 路径）：任何烘焙表晚到 → 全量标脏（384 chunk 重烘
//   风暴 = 21 万次图像重解码 → 渲染进程崩溃，2026-08-14 trace 实锤）。
// ★after（现 file→chunks 反查）：只失效登记过该文件 miss 的 chunk；从未 miss
//   的文件晚到 = no-op。
// node 环境无 DOM，不经 renderChunk——以 tracker.note 模拟烘焙期 miss（与
// renderChunk 内部同链路：_bakingKey 置位 → note(file) → 复位）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import type { World } from '../src/world/World';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';

type TrackedAtlas = { bakeTracker: NonNullable<SpriteAtlas['bakeTracker']> };
/** 私有字段 _bakingKey 的结构视图（ChunkCache 私有 → 交叉类型会坍缩 never，走 Pick） */
type PrivCache = Pick<ChunkCache, 'chunks' | 'dirtyQueue' | 'arriveInvalidateChunks'
  | 'markDirty' | 'dispose'> & { _bakingKey: number | null };

function makeCache(): { cc: PrivCache; atlas: TrackedAtlas } {
  const world = { store: { onTileChanged: () => {} } } as unknown as World;
  const atlas = { bakeTracker: null } as unknown as TrackedAtlas;
  const cc = new ChunkCache(world, new Map(), null, null,
    atlas as unknown as SpriteAtlas) as unknown as PrivCache;
  return { cc, atlas };
}

function makePair(): ChunkPair {
  return { wall: { width: 256, height: 256 } as HTMLCanvasElement,
           tile: { width: 256, height: 256 } as HTMLCanvasElement,
           sx: 0, sy: 0, cell: -1 } as ChunkPair;
}

/** 模拟一次烘焙（renderChunk 的 tracker 交互段：置 key → note miss → 清 key） */
function simulateBake(cc: PrivCache, atlas: TrackedAtlas,
  cx: number, cy: number, missedFile: string): void {
  const k = ChunkCache.key(cx, cy);
  atlas.bakeTracker._baking = true;
  cc._bakingKey = k;
  atlas.bakeTracker.note(missedFile);
  atlas.bakeTracker._baking = false;
  cc._bakingKey = null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChunkCache 晚到贴图精确失效（file→chunks 反查）', () => {
  it('晚到文件只失效登记过该文件的 chunk；未涉及 chunk 原样保留', () => {
    vi.useFakeTimers();
    const { cc, atlas } = makeCache();
    const kA = ChunkCache.key(0, 0), kB = ChunkCache.key(5, 5), kC = ChunkCache.key(9, 9);
    const pA = makePair(), pB = makePair(), pC = makePair();
    cc.chunks.set(kA, pA); cc.chunks.set(kB, pB); cc.chunks.set(kC, pC);
    // 烘焙模拟：A/B 两 chunk 烤了 Tiles_10 的 fallback；C 未涉及
    simulateBake(cc, atlas, 0, 0, 'vanilla/Tiles_10.png');
    simulateBake(cc, atlas, 5, 5, 'vanilla/Tiles_10.png');
    simulateBake(cc, atlas, 5, 5, 'vanilla/Wall_7.png');
    // 文件到达（SpriteAtlas.ensureVImage onload → bakeTracker.onLoaded）
    atlas.bakeTracker.onLoaded('vanilla/Tiles_10.png');
    vi.advanceTimersByTime(500);                       // 500ms 去抖合批
    // after：只有 A/B 失效（置哨兵待重建 + 入脏队）
    expect(cc.chunks.get(kA)).toBeUndefined();
    expect(cc.chunks.get(kB)).toBeUndefined();
    expect(cc.dirtyQueue.length).toBe(2);
    expect(cc.arriveInvalidateChunks).toBe(2);
    // ★before 对照：旧 invalidateAll 会连 pC 一起释放（全量）——pC 必须原样
    expect(cc.chunks.get(kC)).toBe(pC);
    vi.useRealTimers();
  });

  it('从未在烘焙期 miss 的文件晚到 = no-op（不重烘任何 chunk）', () => {
    vi.useFakeTimers();
    const { cc, atlas } = makeCache();
    const pair = makePair();
    cc.chunks.set(ChunkCache.key(2, 2), pair);
    atlas.bakeTracker.onLoaded('vanilla/Tiles_999.png');   // 无登记
    vi.advanceTimersByTime(500);
    expect(cc.chunks.get(ChunkCache.key(2, 2))).toBe(pair); // 原样
    expect(cc.dirtyQueue.length).toBe(0);
    expect(cc.arriveInvalidateChunks).toBe(0);
    // 同名二次到达仍 no-op
    atlas.bakeTracker.onLoaded('vanilla/Tiles_999.png');
    vi.advanceTimersByTime(600);
    expect(cc.dirtyQueue.length).toBe(0);
    vi.useRealTimers();
  });

  it('markDirty 清缺表登记：重标脏后的到达不再重复失效', () => {
    vi.useFakeTimers();
    const { cc, atlas } = makeCache();
    cc.chunks.set(ChunkCache.key(3, 3), makePair());
    simulateBake(cc, atlas, 3, 3, 'vanilla/Tiles_20.png');
    cc.markDirty(3, 3);                               // 常规失效（重建时重登记）
    expect(cc.dirtyQueue.length).toBe(1);
    atlas.bakeTracker.onLoaded('vanilla/Tiles_20.png');
    vi.advanceTimersByTime(500);
    // 登记已被 markDirty 清除 → 该到达不再追加重烘（避免二次排队）
    expect(cc.arriveInvalidateChunks).toBe(0);
    expect(cc.dirtyQueue.length).toBe(1);
    vi.useRealTimers();
  });

  it('烘焙期外（_bakingKey=null）的 miss 不登记', () => {
    vi.useFakeTimers();
    const { cc, atlas } = makeCache();
    cc.chunks.set(ChunkCache.key(1, 1), makePair());
    atlas.bakeTracker._baking = false;                // 非烘焙窗口（SpriteAtlas.ts:391 门）
    atlas.bakeTracker.note('vanilla/Tiles_30.png');
    atlas.bakeTracker.onLoaded('vanilla/Tiles_30.png');
    vi.advanceTimersByTime(500);
    expect(cc.arriveInvalidateChunks).toBe(0);
    expect(cc.dirtyQueue.length).toBe(0);
    vi.useRealTimers();
  });

  it('dispose 清登记与计时器（跨世界不残留回调）', () => {
    vi.useFakeTimers();
    const { cc, atlas } = makeCache();
    cc.chunks.set(ChunkCache.key(4, 4), makePair());
    simulateBake(cc, atlas, 4, 4, 'vanilla/Tiles_40.png');
    atlas.bakeTracker.onLoaded('vanilla/Tiles_40.png');   // 去抖挂起中
    cc.dispose();
    vi.advanceTimersByTime(1000);
    expect((atlas as { bakeTracker: unknown }).bakeTracker).toBeNull();   // 解绑
    expect(cc.dirtyQueue.length).toBe(0);
    vi.useRealTimers();
  });
});
