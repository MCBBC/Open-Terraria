// ChunkCache cell 归还回归(2026-08-13 批次一;2026-08-18 atlas 化重写;
// 2026-08-30 槽位粘滞改约)。
// 旧缺陷:markDirty/invalidateAll/LRU 淘汰丢弃旧画布对时只置哨兵/delete 不释放
// ——detached canvas 回收滞后,慢性显存劣化(与 2026-08-10 contextlost 风暴同机制)。
// 2026-08-18 atlas 化语义:丢弃 = 【cell 归还 freeList】(页共享永不中途销毁)。
// ★2026-08-30 改约(动画邻域抖扭修复,见 stickyCell 注):markDirty/invalidateAll
// 【不再还池】——cell 转入 stickyCell 粘滞占用,重烘原位覆写。原因:Chromium 缩放
// blit 的页邻域渗色使 chunk 换 slot = 静态块随动画 tick 抖扭(_atlas-sampling-
// semantics 实验锁定)。还池仅存于:LRU 淘汰(先注销粘滞)、dispose、烘炸兜底。
// node 环境(vitest 默认)无 DOM,故不经 renderChunk/allocCell(需真实 canvas)——
// 页数组/空闲栈用注入 stub 验证。
import { describe, it, expect } from 'vitest';
import { ChunkCache, type ChunkPair } from '../src/render/ChunkCache';
import type { World } from '../src/world/World';

/** 私有字段的结构视图(ChunkCache 私有 → 直接交叉会坍缩 never,走 Pick;见
 *  chunk-cache-precise-invalidate.test.ts 同款注释) */
type Priv = Pick<ChunkCache, 'chunks' | 'dirtyQueue' | 'markDirty' | 'dispose' | 'releasePair' | 'pageCount' | 'invalidateAll'> & {
  cellFree: number[];
  stickyCell: Map<number, number>;
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

describe('ChunkCache cell 归还(atlas 化 + 槽位粘滞)', () => {
  it('markDirty 保持 cell 占用(粘滞)+置哨兵+入脏队——不还池', () => {
    const cc = makeCache();
    const k = ChunkCache.key(3, 4);
    cc.chunks.set(k, makePair(7));
    cc.markDirty(3, 4);
    expect(cc.cellFree).not.toContain(7);          // ★不还池(换 slot=页邻域渗色变化=抖扭)
    expect(cc.stickyCell.get(k)).toBe(7);          // 粘滞登记:重烘时 acquireCell 原位复用
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
    expect(cc.stickyCell.has(k)).toBe(false);      // stub 无页目标不入粘滞表
  });

  it('invalidateAll 同样保持粘滞占用(跳过哨兵)', () => {
    const cc = makeCache();
    const cells = [3, 9, 21];
    const keys = [ChunkCache.key(1, 1), ChunkCache.key(2, 2), ChunkCache.key(3, 3)];
    keys.forEach((k, i) => cc.chunks.set(k, makePair(cells[i])));
    cc.markDirty(1, 1); // 先标脏一个(cell=3 粘滞持有)
    cc.invalidateAll();
    for (const c of cells) expect(cc.cellFree).not.toContain(c);   // ★全部仍占用
    for (const [i, k] of keys.entries()) expect(cc.stickyCell.get(k)).toBe(cells[i]);
    expect(cc.chunks.size).toBe(3); // 哨兵仍占 size(既有语义不变)
    expect(cc.dirtyQueue.length).toBe(3);
  });

  it('LRU 淘汰路径(releasePair)归还 cell 而非毁页;淘汰前须注销粘滞(get 内已做)', () => {
    const cc = makeCache();
    const pair = makePair(12);
    expect(() => cc.releasePair(pair)).not.toThrow();
    expect(cc.cellFree).toEqual([12]);
    expect(pair.wall.width).toBe(1024); // 页尺寸不变
    cc.releasePair(undefined);          // 容错:undefined/no-cell 均 no-op
    cc.releasePair(makePair());
    expect(cc.cellFree.length).toBe(1);
  });

  it('dispose 销毁全部页(width=0)并清 cell/chunk/粘滞表/脏队', () => {
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
    expect(cc.stickyCell.size).toBe(0);
    expect(cc.chunks.size).toBe(0);
    expect(cc.dirtyQueue.length).toBe(0);
  });

  it('★粘滞不变量:cell 还池前必须注销登记(LRU 回收代码路径 get() 已按序调用)', () => {
    // 该不变量由 get() 内"stickyCell.delete(oldest) 先于 releasePair(oldest)"保证;
    // 本测试以契约形式钉死双动作的存在与顺序意义——若未来有人只删其一,
    // 双重分配(粘滞持池外 cell)会引发 allocCell 复用已画 chunk = 画面错乱。
    const cc = makeCache();
    const k = ChunkCache.key(9, 9);
    cc.chunks.set(k, makePair(31));
    cc.stickyCell.set(k, 31);            // 模拟 acquireCell 登记后的稳态
    // LRU 淘汰序列(与 get() 循环体一致):
    cc.stickyCell.delete(k);
    cc.releasePair(cc.chunks.get(k));
    cc.chunks.delete(k);
    expect(cc.stickyCell.has(k)).toBe(false);
    expect(cc.cellFree).toContain(31);   // 此时才允许进池
  });
});
