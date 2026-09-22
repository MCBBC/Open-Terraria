// ★C3 动画格脏索引守卫（2026-09-22）
//
// 动画格（isDynamicAnimSheet）每帧视口全格谓词扫 → ChunkCache.animCellsOf 按 chunk
// 缓存格集（markDirty/invalidateAll 同域失效,绘制时惰性重建=实时 store 态）。
// 行主序恢复：收集序（chunk 行主序×格集行主序）≠ 原全视口行主序,绘制侧按
// ty·16384+tx 打包稳定排序恢复（同键保序=原 stable 双循环序）。
// ★墙动态层不索化（hasTexture 懒到无失效域,见 ChunkCache 注）——结构锁防误扩。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ChunkCache } from '../src/render/ChunkCache';
import { TILE_DEFS } from '../src/data/tiles';
import { isDynamicAnimSheet } from '../src/render/TileAnim';
import type { World } from '../src/world/World';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const chunkSrc = src('../src/render/ChunkCache.ts');
const rendererSrc = src('../src/render/Renderer.ts');

// ---------- 夹具：32×16 合成 store（2×1 chunk 域）----------
const W = 32, H = 16;
type Priv = {
  animCellsOf(cx: number, cy: number): Int32Array;
  markDirty(cx: number, cy: number): void;
  invalidateAll(): void;
  _animIdx: Map<number, Int32Array>;
};

function makeCache() {
  const flags = new Uint8Array(W * H);
  const type = new Uint16Array(W * H);
  const store = {
    idx: (x: number, y: number) => y * W + x,
    flags, type,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
    onTileChanged: () => {},
  };
  const world = { store, w: W, h: H } as unknown as World;
  const cc = new ChunkCache(world, new Map(), null, null);
  return { cc: cc as unknown as Priv, flags, type };
}

// 探测动画/静态 tile 内部 id（数据驱动,不硬编码）
function probeTileTypes(): { animId: number; staticId: number } {
  let animId = -1, staticId = -1;
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const van = TILE_DEFS[i]?.vanilla;
    if (!van) continue;
    if (animId < 0 && isDynamicAnimSheet(van.sheet)) animId = i;
    if (staticId < 0 && !isDynamicAnimSheet(van.sheet)) staticId = i;
    if (animId >= 0 && staticId >= 0) break;
  }
  expect(animId).toBeGreaterThanOrEqual(0);
  expect(staticId).toBeGreaterThanOrEqual(0);
  return { animId, staticId };
}

// ---------- 行为面 ----------
describe('C3 animCellsOf 行为面', () => {
  const { animId, staticId } = probeTileTypes();

  it('只收动画格,行主序（li=ly*16+lx 递增 ⟺ (ty,tx) 字典序）', () => {
    const { cc, flags, type } = makeCache();
    const set = (tx: number, ty: number, t: number) => { const i = ty * W + tx; flags[i] = 1; type[i] = t; };
    set(0, 0, staticId);      // 静态格不入集
    set(1, 0, animId);        // li=1
    set(0, 1, animId);        // li=16
    set(3, 2, animId);        // li=35
    set(2, 2, staticId);
    const cells = cc.animCellsOf(0, 0);
    expect(Array.from(cells)).toEqual([1, 16, 35]);
  });

  it('无动画 chunk=空集且缓存（同一实例复用）', () => {
    const { cc, flags, type } = makeCache();
    flags[5] = 1; type[5] = staticId;
    const a = cc.animCellsOf(1, 0);
    expect(a.length).toBe(0);
    expect(cc.animCellsOf(1, 0)).toBe(a);          // 缓存命中同实例
  });

  it('markDirty 失效 → 重建读实时态（改 flags 后反映）', () => {
    const { cc, flags, type } = makeCache();
    const i01 = 0 * W + 1;                          // (1,0)
    flags[i01] = 1; type[i01] = animId;
    expect(cc.animCellsOf(0, 0).length).toBe(1);
    flags[i01] = 0;                                 // tile 消失（实时态）
    cc.markDirty(0, 0);
    expect(cc.animCellsOf(0, 0).length).toBe(0);    // 重建反映实时态
  });

  it('invalidateAll 全清索引', () => {
    const { cc, flags, type } = makeCache();
    const i41 = 1 * W + 4;                          // (4,1)——store 布局 y*W+x
    flags[i41] = 1; type[i41] = animId;
    expect(cc.animCellsOf(0, 0).length).toBe(1);
    flags[i41] = 0;
    cc.invalidateAll();
    expect(cc.animCellsOf(0, 0).length).toBe(0);
    expect(cc._animIdx.size).toBe(1);               // 重建后回填（惰性而非永久空）
  });
});

// ---------- 排序键性质 ----------
describe('C3 行主序键 ty·16384+tx', () => {
  it('键升序 ⟺ (ty,tx) 字典序；解包往返恒等（世界 ≤8400² < 2¹⁴ 余量）', () => {
    const pts: Array<[number, number]> = [];
    for (let ty = 0; ty < 40; ty += 7) for (let tx = 0; tx < 40; tx += 5) pts.push([tx, ty]);
    // 打乱后按键排序,应恢复字典序
    const shuffled = [...pts].reverse();
    const keyed = shuffled.map(([tx, ty]) => ({ k: ty * 16384 + tx, tx, ty }));
    keyed.sort((a, b) => a.k - b.k);
    const restored = keyed.map(({ tx, ty }) => [tx, ty] as [number, number]);
    const sorted = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    expect(restored).toEqual(sorted);
    for (const { k, tx, ty } of keyed) {
      expect(k & 16383).toBe(tx);
      expect(k >>> 14).toBe(ty);
      expect(k).toBeLessThan(2 ** 31);
    }
  });
});

// ---------- 结构锁 ----------
describe('C3 结构锁', () => {
  it('ChunkCache：谓词与全扫逐字同式；markDirty/invalidateAll 失效点在位', () => {
    expect(chunkSrc).toContain('this._animIdx.delete(k);');
    expect(chunkSrc).toContain('this._animIdx.clear();');
    expect(chunkSrc).toContain('if (!van || !isDynamicAnimSheet(van.sheet)) continue;');
    expect(chunkSrc).toContain('list.push(ly * CHUNK + lx);');
  });

  it('Renderer：收集+打包排序+解包在位（遍历序恢复链完整）', () => {
    expect(rendererSrc).toContain('aKeys[nAnim++] = aty * 16384 + atx;');
    expect(rendererSrc).toContain('if (nAnim > 1) aKeys.sort(this._animKeyCmp);');
    expect(rendererSrc).toContain('const tx = aKey & 16383;');
    expect(rendererSrc).toContain('const ty = aKey >>> 14;');
    expect(rendererSrc).toContain('chunks.animCellsOf(acx, acy)');
  });

  it('墙动态层保持全格扫（hasTexture 无失效域,禁索化）', () => {
    const wallFn = rendererSrc.slice(
      rendererSrc.indexOf('private drawAnimatedWallLayer'),
      rendererSrc.indexOf('private drawAnimatedTileLayer'),
    );
    expect(wallFn).toContain('for (let ty = ty0; ty <= ty1; ty++)');   // 原全扫保留
    expect(wallFn).not.toContain('animCellsOf');
  });
});
