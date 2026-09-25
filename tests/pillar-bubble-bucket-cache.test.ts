// ★四柱掉帧定谳批（2026-09-25）主犯①锁：盾泡 SM2 产物 uTime 200ms 时间桶缓存
// （src/fx/ForceFieldBubble.ts bubbleCache;rainbowSlimeCache 判例同款 5fps 语义）。
// 红（旧码）：每塔每帧 runPassOnImageData 冷跑 128² 解释器——同桶二帧 2 次冷跑。
// 绿（本批）：同桶二帧 1 次冷跑+1 次命中（计数器）+两次 drawImage 源=同一 canvas
// 对象（同一对象 ⇒ 像素同桶逐位）。变异判别：摘桶查找（恒 miss）→ a) 红;
// 键漏 uColor → c) 红;键混入半径/alpha → d) 红（应零冷跑却逐帧重跑）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drawForceFieldBubble, __resetForceFieldBubbleForTest, __forceFieldBubbleStats } from '../src/fx/ForceFieldBubble';
import type { Renderer } from '../src/render/Renderer';

// ---- SM2Effect mock：runPassOnImageData 计数+确定性涂画（uTime 入字节可判桶沿） ----
const passCalls: Array<{ uTime: number; uColor: number[] }> = [];
vi.mock('../src/fx/SM2Effect', () => ({
  getPass: () => ({ __fakePass: true }),
  defaultUniforms: () => ({
    uColor: [1, 1, 1], uSecondaryColor: [1, 1, 1], uSaturation: 1, uOpacity: 1,
    uTime: 0, uSourceRect: [0, 0, 0, 0], uImageSize0: [0, 0],
  }),
  runPassOnImageData: (_pass: unknown, data: Uint8ClampedArray, _w: number, _h: number,
    u: { uTime: number; uColor: number[] }): void => {
    passCalls.push({ uTime: u.uTime, uColor: [...u.uColor] });
    // 确定性涂画：字节=uTime 桶沿值（跨桶必不同 → 逐位可判）
    const v = Math.floor(u.uTime * 255) % 256;
    for (let i = 0; i < data.length; i += 4) { data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255; }
  },
}));

// ---- 无 jsdom 最小 fake DOM（bj112b-forcefield-coldstart 同款 stub） ----
class FakeCtx2d {
  putImageDataLog: Array<{ w: number; h: number }> = [];
  createImageData(w: number, h: number): ImageData { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as unknown as ImageData; }
  putImageData(im: ImageData): void { this.putImageDataLog.push({ w: im.width, h: im.height }); }
  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;   // 原版 Perlin α 恒 255
    return { data, width: w, height: h } as unknown as ImageData;
  }
  drawImageLog: Array<unknown[]> = [];
  drawImage(...a: unknown[]): void { this.drawImageLog.push(a); }
  save(): void {} restore(): void {} translate(): void {} rotate(): void {}
  beginPath(): void {} arc(): void {} stroke(): void {}
}
class FakeCanvas {
  width = 0; height = 0;
  ctx = new FakeCtx2d();
  getContext(): FakeCtx2d { return this.ctx; }
}
let lastCanvas: FakeCanvas | null = null;
function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): unknown { lastCanvas = new FakeCanvas(); return lastCanvas; },
  };
}
installFakeDom();

function fakeRenderer(): { renderer: Renderer; setImage(v: unknown): void } {
  let img: unknown = { width: 128, height: 128 };   // 缺省已就绪（pending 面测试内显式覆盖）
  const atlas = { ensureVImage(): unknown { return img; } };
  return { renderer: { atlas } as unknown as Renderer, setImage: (v: unknown) => { img = v; } };
}
type Opts = Parameters<typeof drawForceFieldBubble>[2];
function opts(over: Partial<Opts> = {}): Opts {
  return { cx: 100, cy: 100, radius: 300, tint: [255, 120, 60], frac: 1, breakT: -1, reformT: -1, time: 1.0, ...over };
}

beforeEach(() => {
  passCalls.length = 0;
  __resetForceFieldBubbleForTest();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('四柱掉帧批①：盾泡 SM2 产物 uTime 200ms 时间桶缓存', () => {
  it('同桶二帧零解释器冷跑（1 冷跑+1 命中）+两次 blit 源同一对象=像素同桶逐位（旧码 2 冷跑=红）', () => {
    const { renderer } = fakeRenderer();
    const ctx = new FakeCtx2d();
    expect(drawForceFieldBubble(ctx as unknown as CanvasRenderingContext2D, renderer, opts({ time: 1.0 }))).toBe(true);
    expect(drawForceFieldBubble(ctx as unknown as CanvasRenderingContext2D, renderer, opts({ time: 1.19 }))).toBe(true);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);       // 同桶只冷跑一次
    expect(__forceFieldBubbleStats.cacheHits).toBe(1);
    expect(passCalls.length).toBe(1);
    // 两次 drawImage 的源 = 同一缓存画布对象（同一对象 ⇒ 源字节逐位相同）
    expect(ctx.drawImageLog.length).toBe(2);
    expect(ctx.drawImageLog[0]?.[0]).toBe(ctx.drawImageLog[1]?.[0]);
  });

  it('桶左沿渲染：冷跑 uTime=⌊t×5⌋×0.2（键的纯函数,同桶任意 t 产物可复现）', () => {
    const { renderer } = fakeRenderer();
    const ctx = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    drawForceFieldBubble(ctx, renderer, opts({ time: 1.17 }));
    expect(passCalls[0]?.uTime).toBeCloseTo(1.0, 10);      // 桶 5 → uTime=1.0
    __resetForceFieldBubbleForTest(); passCalls.length = 0;
    drawForceFieldBubble(ctx, renderer, opts({ time: 1.0 }));
    expect(passCalls[0]?.uTime).toBeCloseTo(1.0, 10);      // 同桶异 t 同产物入参
  });

  it('跨桶重跑（t=1.19→1.21 桶 5→6）+冷跑 uTime 走桶沿 1.2', () => {
    const { renderer } = fakeRenderer();
    const ctx = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    drawForceFieldBubble(ctx, renderer, opts({ time: 1.19 }));
    drawForceFieldBubble(ctx, renderer, opts({ time: 1.21 }));
    expect(__forceFieldBubbleStats.sm2Runs).toBe(2);
    expect(passCalls[1]?.uTime).toBeCloseTo(1.2, 10);
  });

  it('uColor 入键：reformT（重塑窗）/breakT（破盾 2,2,2）差异必新冷跑', () => {
    const { renderer } = fakeRenderer();
    const ctx = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    drawForceFieldBubble(ctx, renderer, opts({ reformT: -1 }));   // uColor=(1,1,1)
    drawForceFieldBubble(ctx, renderer, opts({ reformT: 0.5 }));  // uColor=(1.25,…)
    drawForceFieldBubble(ctx, renderer, opts({ breakT: 0.3 }));   // uColor=(2,2,2)
    expect(__forceFieldBubbleStats.sm2Runs).toBe(3);
    expect(passCalls.map((c) => c.uColor)).toEqual([[1, 1, 1], [1.25, 1.25, 1.25], [2, 2, 2]]);
  });

  it('半径/alpha（frac）/grow 不入键：blit 侧变化零冷跑（键混入渲染参=红）', () => {
    const { renderer } = fakeRenderer();
    const ctx = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    drawForceFieldBubble(ctx, renderer, opts({ radius: 300, frac: 1 }));
    drawForceFieldBubble(ctx, renderer, opts({ radius: 250, frac: 0.5 }));
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);
    expect(__forceFieldBubbleStats.cacheHits).toBe(1);
  });

  it('LRU≤8：10 个新桶后最旧桶被逐（重画=冷跑）,最新桶仍命中', () => {
    const { renderer } = fakeRenderer();
    const ctx = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    for (let k = 0; k < 10; k++) { now += 3000; drawForceFieldBubble(ctx, renderer, opts({ time: 1.0 + k * 0.21 })); }
    expect(__forceFieldBubbleStats.sm2Runs).toBe(10);
    const runs = __forceFieldBubbleStats.sm2Runs;
    now += 3000;
    drawForceFieldBubble(ctx, renderer, opts({ time: 1.0 }));       // 最旧桶 5（已被逐）
    expect(__forceFieldBubbleStats.sm2Runs).toBe(runs + 1);
    drawForceFieldBubble(ctx, renderer, opts({ time: 1.0 + 9 * 0.21 })); // 最新桶仍在
    expect(__forceFieldBubbleStats.cacheHits).toBeGreaterThan(0);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(runs + 1);
  });

  it('perlin 未就绪逐帧重查语义不变（BJ112-① 契约:缓存不吞 pending 面）', () => {
    const r = fakeRenderer();
    let calls = 0;
    (r.renderer as unknown as { atlas: { ensureVImage(): unknown } }).atlas.ensureVImage = () => { calls++; return null; };
    const ctx = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    expect(drawForceFieldBubble(ctx, r.renderer, opts())).toBe(false);
    expect(drawForceFieldBubble(ctx, r.renderer, opts())).toBe(false);
    expect(calls).toBe(2);   // 逐帧重查（旧 15s 负缓存复辟=1=红）
  });
});
