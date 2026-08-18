// ChunkCache cell 归还回归(2026-08-13 批次一;2026-08-18 atlas 化重写)。
// 旧缺陷:markDirty/invalidateAll/LRU 淘汰丢弃旧画布对时只置哨兵/delete 不释放
// ——detached canvas 回收滞后,慢性显存劣化(与 2026-08-10 contextlost 风暴同机制)。
// 2026-08-18 atlas 化后语义:丢弃 = 【cell 归还 freeList】(页共享永不中途销毁,
// 运行期画布创建/销毁=0);页只在 dispose(退出世界/切渲染模式)时 width=0 销毁。
// node 环境(vitest 默认)无 DOM,故不经 renderChunk/allocCell(需真实 canvas)——
// 页数组/空闲栈用注入 stub 验证。
import { describe, it, expect } from 'vitest';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import type { World } from '../src/world/World';

/** 私有字段的结构视图(ChunkCache 私有 → 直接交叉会坍缩 never,走 Pick;见
 *  chunk-cache-precise-invalidate.test.ts 同款注释) */
type Priv = Pick<ChunkCache, 'chunks' | 'dirtyQueue' | 'markDirty' | 'dispose' | 'releasePair' | 'pageCount' | 'invalidateAll'> & {
  cellFree: number[];
  wallPages: HTMLCanvasElement[];
  tilePages: HTMLCanvasElement[];
};

function makeCache(): Priv {
  const world = { store: { onTileChanged: () => {} } } as unknown as World;
  return new ChunkCache(world, new Map(), null, null) as unknown as Priv;
}

function makePair(cell = -1): ChunkPair {
  // stub:plain object;cell=-1 = 外部无页目标(releasePair no-op 语义)
  return { wall: { width: 1024, height: 1024 } as HTMLCanvasElement,
           tile: { width: 1024, height: 1024 } as HTMLCanvasElement,
           sx: 0, sy: 0, cell } as ChunkPair;
}

describe('ChunkCache cell 归还(atlas 化)', () => {
  it('markDirty 归还旧 pair 的 cell + 置哨兵 + 入脏队', () => {
    const cc = makeCache();
    const k = ChunkCache.key(3, 4);
    const pair = makePair(7);
    cc.chunks.set(k, pair);
    cc.markDirty(3, 4);
    expect(cc.cellFree).toContain(7);              // cell 已还,可复用
    expect(pair.wall.width).toBe(1024);            // ★页不动(共享资源,不得中途销毁)
    expect(cc.chunks.get(k)).toBeUndefined();
    expect(cc.dirtyQueue).toEqual([k]);
  });

  it('重复 markDirty 不重复入队(Set 去重),无 cell 的 stub no-op 不炸', () => {
    const cc = makeCache();
    const k = ChunkCache.key(0, 0);
    cc.chunks.set(k, makePair()); // cell=-1(外部 stub)
    cc.markDirty(0, 0);
    cc.chunks.set(k, makePair()); // 已是哨兵时 chunks.has 仍 true → 再标脏无副作用
    cc.markDirty(0, 0);
    expect(cc.dirtyQueue).toEqual([k]);
    expect(cc.cellFree.length).toBe(0);
  });

  it('invalidateAll 归还全部现存 pair 的 cell(跳过哨兵)', () => {
    const cc = makeCache();
    const cells = [3, 9, 21];
    const keys = [ChunkCache.key(1, 1), ChunkCache.key(2, 2), ChunkCache.key(3, 3)];
    keys.forEach((k, i) => cc.chunks.set(k, makePair(cells[i])));
    cc.markDirty(1, 1); // 先标脏一个(其 cell=3 已还)
    cc.invalidateAll();
    for (const c of cells) expect(cc.cellFree).toContain(c);
    expect(cc.chunks.size).toBe(3); // 哨兵仍占 size(既有语义不变)
    expect(cc.dirtyQueue.length).toBe(3);
  });

  it('LRU 淘汰路径(releasePair)归还 cell 而非毁页', () => {
    const cc = makeCache();
    const pair = makePair(12);
    expect(() => cc.releasePair(pair)).not.toThrow();
    expect(cc.cellFree).toEqual([12]);
    expect(pair.wall.width).toBe(1024); // 页尺寸不变
    cc.releasePair(undefined);          // 容错:undefined/no-cell 均 no-op
    cc.releasePair(makePair());
    expect(cc.cellFree.length).toBe(1);
  });

  it('dispose 销毁全部页(width=0)并清 cell/chunk/脏队', () => {
    const cc = makeCache();
    const k = ChunkCache.key(7, 8);
    cc.chunks.set(k, makePair(5));
    cc.markDirty(7, 8);
    cc.chunks.set(k, makePair()); // 标脏后重建(模拟 get)
    const wp = { width: 1024, height: 1024 } as HTMLCanvasElement;
    const tp = { width: 1024, height: 1024 } as HTMLCanvasElement;
    cc.wallPages.push(wp); cc.tilePages.push(tp);
    cc.dispose();
    expect(wp.width).toBe(0);                       // 页级销毁(dispose 是唯一毁页点)
    expect(tp.height).toBe(0);
    expect(cc.wallPages.length).toBe(0);
    expect(cc.cellFree.length).toBe(0);
    expect(cc.chunks.size).toBe(0);
    expect(cc.dirtyQueue.length).toBe(0);
  });
});
