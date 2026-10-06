// ★E51(2026-10-06)TintAtlas 回收失效精确化判别器:
//  旧链「回收→bumpTexEpoch(页)」=全页 er: 键换代,页上全部矩形再绘时全部重传
//  ——内容未变的矩形=保险性追新税(E51 定谳:GL 活机 atk8/9 1200 帧 1381 bump→
//  2023 笔 156MB 受累重传;2D 降级窗回切=全页风暴)。新链=钩子注入时精确失效
//  (仅被覆写矩形),钩子缺位回退页级 bump(fail-closed,2026-09-27 原语义)。
//  本测试锁:①粒度两档分流 ②失效矩形参数逐值 ③纯新分配零失效 ④invalidateTintRect
//  的 texCache 摘除+dropTexture 精确删除面。
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { TintAtlas, setTintAtlasInvalidateRect } from '../src/render/TintAtlas';
import { bumpTexEpoch, texEpoch, texId } from '../src/render/texId';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

// ---- fake document(2D ctx 桩:bake 链 clearRect/drawImage/paint no-op) ----
const fakeCtx = () => ({
  clearRect: () => {},
  drawImage: () => {},
  fillRect: () => {},
  getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  putImageData: () => {},
  set globalCompositeOperation(_: string) {},
  get globalCompositeOperation() { return 'source-over'; },
  set globalAlpha(_: number) {},
  get globalAlpha() { return 1; },
  set imageSmoothingEnabled(_: boolean) {},
  get imageSmoothingEnabled() { return false; },
});
const docStub = {
  createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) as unknown as HTMLCanvasElement,
};
const hadDoc = typeof (globalThis as Record<string, unknown>).document !== 'undefined';
const prevDoc = (globalThis as Record<string, unknown>).document;
(globalThis as Record<string, unknown>).document = docStub;
afterEach(() => {
  setTintAtlasInvalidateRect(null);   // 用例间复位兜底档(document stub 本文件生命周期保持)
});
afterAll(() => {
  if (hadDoc) (globalThis as Record<string, unknown>).document = prevDoc;
  else delete (globalThis as Record<string, unknown>).document;
});

const noopPaint = (): void => {};

describe('★E51 TintAtlas 回收失效粒度两档', () => {
  it('钩子注入:drop→复用 bake 走精确失效(rect 参数逐值),页纪元不 bump', () => {
    const t = new TintAtlas();
    const r0 = t.bake('a', 40, 40, noopPaint)!;
    expect(r0).toBeTruthy();
    const calls: Array<{ cv: HTMLCanvasElement; x: number; y: number; w: number; h: number }> = [];
    setTintAtlasInvalidateRect((cv, x, y, w, h) => calls.push({ cv, x, y, w, h }));
    const ep0 = texEpoch(r0.c);   // 页画布纪元(未 bump=0)
    t.drop('a');                  // 矩形入 free-list
    const r1 = t.bake('b', 40, 40, noopPaint)!;   // alloc 命中 free-list=recycled
    expect(r1.c).toBe(r0.c);      // 同页复用
    expect(calls.length).toBe(1);
    expect(calls[0].cv).toBe(r1.c);
    expect(calls[0].x).toBe(r1.x);
    expect(calls[0].y).toBe(r1.y);
    expect(calls[0].w).toBe(r1.w);
    expect(calls[0].h).toBe(r1.h);
    expect(texEpoch(r1.c)).toBe(ep0);   // ★精确档:页纪元不动(其他矩形零追新)
  });

  it('钩子缺位(兜底档):drop→复用 bake 走页级 bumpTexEpoch(2026-09-27 原语义)', () => {
    const t = new TintAtlas();
    const r0 = t.bake('a', 40, 40, noopPaint)!;
    const ep0 = texEpoch(r0.c);
    t.drop('a');
    const r1 = t.bake('b', 40, 40, noopPaint)!;   // recycled,bump 页
    expect(texEpoch(r1.c)).toBe(ep0 + 1);
  });

  it('纯新分配(shelf 新区,recycled=false):两档皆零失效零 bump', () => {
    const t = new TintAtlas();
    const calls: unknown[] = [];
    setTintAtlasInvalidateRect(() => calls.push(1));
    const a = t.bake('a', 40, 40, noopPaint)!;
    const ep0 = texEpoch(a.c);
    const b = t.bake('b', 40, 40, noopPaint)!;   // 同页第二矩形=shelf 新区
    expect(b.c).toBe(a.c);
    expect(b.x).toBe(40);          // 行尾追加(a 右侧,row.w 单调增=纯新区)
    expect(b.y).toBe(0);
    expect(calls.length).toBe(0);  // 纯新区:无覆写=零失效
    expect(texEpoch(b.c)).toBe(ep0);
  });

  it('同 bake 命中(LRU 续期)不触发失效', () => {
    const t = new TintAtlas();
    const calls: unknown[] = [];
    setTintAtlasInvalidateRect(() => calls.push(1));
    t.bake('a', 40, 40, noopPaint);
    t.bake('a', 40, 40, noopPaint);   // 命中
    expect(calls.length).toBe(0);
  });
});

describe('★E51 GLShimExecutor.invalidateTintRect 精确失效', () => {
  const packedOf = (x: number, y: number, w: number, h: number) =>
    ((x * 8192 + y) * 4096 + w) * 4096 + h;

  function mkShim() {
    const sh = Object.create(GLShimExecutor.prototype) as GLShimExecutor & Record<string, unknown>;
    const dropped: string[] = [];
    const texs = new Map<string, unknown>();
    const glw = {
      unavailable: false,
      dropTexture: (key: string) => { dropped.push(key); texs.delete(key); },
    };
    Object.assign(sh, {
      active: true,
      glw,
      texCache: new Map<number, Map<number, { e: { key: string }; ep: number }>>(),
    });
    return { sh, dropped, texs, glw };
  }

  it('命中条目:texCache 摘除+dropTexture(全键)精确删除', () => {
    const { sh, dropped, texs } = mkShim();
    const cv = docStub.createElement();
    const id = texId(cv);   // 与 invalidateTintRect 内部同源(WeakMap 身份)
    const sub = new Map<number, { e: { key: string }; ep: number }>();
    const packed = packedOf(16, 32, 40, 40);
    const key = `er:${id}:0:16,32,40,40`;
    sub.set(packed, { e: { key }, ep: 0 });
    (sh as unknown as { texCache: Map<number, Map<number, { e: { key: string }; ep: number }>> })
      .texCache.set(id, sub);
    texs.set(key, {});
    expect(sh['invalidateTintRect'](cv, 16, 32, 40, 40)).toBe(true);
    expect(dropped).toEqual([key]);
    expect(sub.has(packed)).toBe(false);
    expect(texs.has(key)).toBe(false);
  });

  it('未驻留矩形/未知页=真(无陈旧面);非 active=假(调用方兜底)', () => {
    const { sh, dropped } = mkShim();
    const cv = docStub.createElement();
    expect(sh['invalidateTintRect'](cv, 0, 0, 10, 10)).toBe(true);   // texCache 无此页=无陈旧面
    expect(dropped.length).toBe(0);
    const sub = new Map<number, { e: { key: string }; ep: number }>();
    (sh as unknown as { texCache: Map<number, Map<number, { e: { key: string }; ep: number }>> })
      .texCache.set(texId(cv), sub);
    expect(sh['invalidateTintRect'](cv, 0, 0, 10, 10)).toBe(true);   // 页内无此 packed
    expect(dropped.length).toBe(0);
    (sh as unknown as { active: boolean }).active = false;
    sub.set(packedOf(0, 0, 10, 10), { e: { key: 'k' }, ep: 0 });
    expect(sh['invalidateTintRect'](cv, 0, 0, 10, 10)).toBe(false);  // ★shim 非在场→调用方必须兜底
    expect(dropped.length).toBe(0);
  });

  it('★链级兜底:钩子返 false(shim 不在场)→TintAtlas 侧走页级 bumpTexEpoch', () => {
    const t = new TintAtlas();
    const r0 = t.bake('a', 40, 40, noopPaint)!;
    const ep0 = texEpoch(r0.c);
    // 模拟 Renderer 注入闭包的兜底语义:精确失效失败→bumpTexEpoch
    setTintAtlasInvalidateRect((cv, x, y, w, h) => {
      const ok = false;   // shim 不在场(2D/降级窗)
      if (!ok) bumpTexEpoch(cv);
    });
    t.drop('a');
    const r1 = t.bake('b', 40, 40, noopPaint)!;   // recycled
    expect(texEpoch(r1.c)).toBe(ep0 + 1);   // 兜底档触发
  });
});
