// shader 审计战役：TrailShader（MagicMissile 族拖尾 pass 复刻）单元闸门。
// 断言：①公式输出非均匀（噪声门×边缘包络生效,非平色）②uOpacity 线性调制
// ③atlas miss 负缓存路径安全。无 jsdom 环境——注入最小 fake DOM（canvas/2d 子集）。
import { describe, it, expect, beforeAll } from 'vitest';
import { drawStripTrail } from '../src/fx/TrailShader';

interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
interface FakeCanvas { width: number; height: number; _ctx: FakeCtx2d; getContext(k: string): FakeCtx2d | null }
class FakeCtx2d {
  buf: FakeBuf | null = null;
  blitCalls = 0;
  gco = '';
  constructor(public cv: FakeCanvas) {}
  createImageData(w: number, h: number): FakeBuf { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData(im: FakeBuf): void { this.buf = im; }
  getImageData(x: number, y: number, w: number, h: number): FakeBuf {
    if (this.buf && this.buf.width === w) return this.buf;
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  drawImage(src: FakeCanvas): void {
    this.blitCalls++;
    if ((src as FakeCanvas)._ctx?.buf) this.buf = (src as FakeCanvas)._ctx.buf;   // 合成结果带出
  }
  save(): void {}
  restore(): void {}
  get globalCompositeOperation(): string { return this.gco; }
  set globalCompositeOperation(v: string) { this.gco = v; }
}

function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): FakeCanvas {
      const cv: FakeCanvas = { width: 0, height: 0, _ctx: null as never, getContext(k: string) {
        if (k !== '2d') return null;
        if (!cv._ctx) cv._ctx = new FakeCtx2d(cv);
        return cv._ctx;
      } };
      return cv;
    },
  };
}

/** 迷你 LUT 图：Extra_194=门全开(255)，其余=底噪 200 */
function mkImg(v: number): FakeCanvas & { _pixels: number } {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const cv = dom.document.createElement('canvas');
  cv.width = 2; cv.height = 2;
  const cx2 = cv.getContext('2d')!;
  const im = cx2.createImageData(2, 2);
  for (let i = 0; i < 4; i++) {
    im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  cx2.putImageData(im);
  (cv as FakeCanvas & { _pixels: number })._pixels = v;
  return cv as FakeCanvas & { _pixels: number };
}

function fakeAtlas(): never {
  const cache = new Map<string, FakeCanvas>();
  return {
    ensureVImage: (path: string) => {
      if (!path) return null;
      const v = path.includes('Extra_194') ? 255 : 200;
      if (!cache.has(path)) cache.set(path, mkImg(v));
      return cache.get(path)!;
    },
  } as never;
}

type Pt = { x: number; y: number; hw: number; r: number; g: number; b: number; a: number };
const PTS = (n: number): Pt[] => Array.from({ length: n }, (_, i) => ({
  x: 10 + i * 8, y: 32, hw: 8,
  r: 0.6 + 0.4 * (i / (n - 1)), g: 0.3, b: 0.9, a: Math.min(1, 0.3 + i / n),
}));

describe('TrailShader(MagicMissile 族拖尾 pass 复刻)', () => {
  beforeAll(() => installFakeDom());

  it('合成非均匀条带：噪声门×边缘包络生效（R 值多档,非平色）', () => {
    const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
    const target = dom.document.createElement('canvas');
    target.width = 256; target.height = 64;
    target.getContext('2d');
    const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D, { atlas: fakeAtlas() } as never,
      { set: 'RainbowRod', pts: PTS(10), opacity: 2, time: 1.2 });
    expect(ok).toBe(true);
    expect(target._ctx.blitCalls).toBe(1);
    const buf = target._ctx.buf!;
    const rs = new Set<number>();
    let lit = 0;
    for (let i = 0; i < buf.data.length; i += 4) {
      if (buf.data[i] > 0 || buf.data[i + 3] > 0) lit++;
      if (buf.data[i] > 0) rs.add(buf.data[i]);
    }
    expect(lit).toBeGreaterThan(50);       // 条带着色
    expect(rs.size).toBeGreaterThan(3);    // 非平色：噪声门/边缘包络多档调制
  });
  it('uOpacity 线性调制：opacity 减半 → 同位亮度减半', () => {
    const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
    const run = (op: number): FakeBuf => {
      const t = dom.document.createElement('canvas');
      t.width = 256; t.height = 64;
      t.getContext('2d');
      drawStripTrail(t._ctx as unknown as CanvasRenderingContext2D, { atlas: fakeAtlas() } as never,
        { set: 'MagicMissile', pts: PTS(8), opacity: op, time: 0.5 });
      return t._ctx.buf!;
    };
    const a = run(2), b = run(1);
    let checked = 0;
    for (let i = 0; i < a.data.length && checked < 24; i += 4) {
      if (a.data[i] > 8 && a.data[i] < 250) { expect(Math.abs(b.data[i] - a.data[i] / 2)).toBeLessThanOrEqual(1); checked++; }  // 饱和像素跳过(Uint8 clamp 破坏线性)
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('atlas miss → 安全不绘制（负缓存路径）', () => {
    const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
    const t = dom.document.createElement('canvas');
    t.width = 64; t.height = 32;
    const ok = drawStripTrail(t._ctx as unknown as CanvasRenderingContext2D,
      { ensureVImage: () => null } as never,
      { set: 'FlameLash', pts: PTS(6), opacity: 2, time: 0 });
    expect(ok).toBe(false);
  });
});
