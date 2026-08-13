// ChunkCache 画布释放回归(2026-08-13 性能异常扫描批次一)。
// 缺陷:markDirty/invalidateAll/LRU 淘汰丢弃旧画布对时只置哨兵/delete,
// 不释放(width=0)——detached canvas 回收滞后,动画陈设每秒重烘焙数十张,
// 慢性显存劣化(与 2026-08-10 contextlost 风暴同机制)。
// 本测试用 stub pair 验证全部丢弃路径都先释放;node 环境(vitest 默认)无 DOM,
// 故不经过 renderChunk(那需要真实 canvas)。
import { describe, it, expect } from 'vitest';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import type { World } from '../src/world/World';

function makeCache(): ChunkCache {
  const world = { store: { onTileChanged: () => {} } } as unknown as World;
  return new ChunkCache(world, new Map(), null, null);
}

function makePair(): ChunkPair {
  // stub:markDirty 只写 width/height 属性,plain object 即可
  return { wall: { width: 256, height: 256 } as HTMLCanvasElement,
           tile: { width: 256, height: 256 } as HTMLCanvasElement } as ChunkPair;
}

describe('ChunkCache 画布释放(批次一)', () => {
  it('markDirty 丢弃旧 pair 前释放(width=0)且置哨兵+入脏队', () => {
    const cc = makeCache();
    const k = ChunkCache.key(3, 4);
    const pair = makePair();
    cc.chunks.set(k, pair);
    cc.markDirty(3, 4);
    expect(pair.wall.width).toBe(0);
    expect(pair.wall.height).toBe(0);
    expect(pair.tile.width).toBe(0);
    expect(pair.tile.height).toBe(0);
    expect(cc.chunks.get(k)).toBeUndefined();
    expect(cc.dirtyQueue).toEqual([k]);
  });

  it('重复 markDirty 不重复入队(Set 去重)', () => {
    const cc = makeCache();
    const k = ChunkCache.key(0, 0);
    cc.chunks.set(k, makePair());
    cc.markDirty(0, 0);
    cc.chunks.set(k, makePair()); // 已是哨兵时 chunks.has 仍 true → 再标脏无副作用
    cc.markDirty(0, 0);
    expect(cc.dirtyQueue).toEqual([k]);
  });

  it('invalidateAll 释放全部现存 pair(跳过哨兵)', () => {
    const cc = makeCache();
    const pairs = [ChunkCache.key(1, 1), ChunkCache.key(2, 2), ChunkCache.key(3, 3)]
      .map((k) => { const p = makePair(); cc.chunks.set(k, p); return p; });
    const dirtyK = ChunkCache.key(1, 1);
    cc.markDirty(1, 1); // 先标脏一个(其 pair 已释放)
    cc.invalidateAll();
    for (const p of pairs) {
      expect(p.wall.width).toBe(0);
      expect(p.tile.width).toBe(0);
    }
    expect(cc.chunks.size).toBe(3); // 哨兵仍占 size(既有语义不变)
    expect(cc.dirtyQueue.length).toBe(3);
  });

  it('dispose 释放全部 pair 并清队列与去重集', () => {
    const cc = makeCache();
    const k = ChunkCache.key(7, 8);
    const pair = makePair();
    cc.chunks.set(k, pair);
    cc.markDirty(7, 8);
    cc.chunks.set(k, makePair()); // 标脏后重建(模拟 get)
    cc.dispose();
    expect(pair.wall.width).toBe(0); // 第一对也被释放
    expect(cc.chunks.size).toBe(0);
    expect(cc.dirtyQueue.length).toBe(0);
  });
});
