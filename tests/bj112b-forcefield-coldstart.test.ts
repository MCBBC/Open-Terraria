// BJ112-① 塔盾泡冷启动死窗修复闸门（src/fx/ForceFieldBubble.ts perlinData）。
// 旧实现：15s 时间负缓存把"图集懒载未就绪"（ensureVImage 首帧必 null,SpriteAtlas.ts:635
// pending 面）钉成"加载失败"→ 盾=100 下 0..15s 零绘制（原版塔一进屏泡即随,
// Main.cs:24551-24583）；且 perlinTried=0 初值使页面生命前 15s 连首拍尝试都不发
// （预武装死窗）。修复=良性 miss 逐帧重查（SpriteAtlas.ts:360 "下帧自愈"契约），
// 真失败（404/坏字节）由图集自身 _vImageFailed 10s TTL 负缓存+瞬态重试背书
//（SpriteAtlas.ts:651-686）——节流权归图集,消费面零自缓存。
// ★变异判别：负缓存复辟（时间冷却挡住 pending/失败面）→ 两条 it 皆红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { drawForceFieldBubble, __resetForceFieldBubbleForTest } from '../src/fx/ForceFieldBubble';
import type { Renderer } from '../src/render/Renderer';

// 无 jsdom——注入最小 fake DOM（trail-shader-sm2.test.ts 同款 stub）
interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
class FakeCtx2d {
  createImageData(w: number, h: number): FakeBuf {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(_im: FakeBuf): void {}
  getImageData(_x: number, _y: number, w: number, h: number): FakeBuf {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;   // α 恒 255（原版 Perlin 实测）
    return { data, width: w, height: h };
  }
  drawImage(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  beginPath(): void {}
  arc(): void {}
  stroke(): void {}
}
function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): unknown {
      return { width: 0, height: 0, getContext: (_k: string) => new FakeCtx2d() };
    },
  };
}
installFakeDom();

type Opts = Parameters<typeof drawForceFieldBubble>[2];

function fakeRenderer(): {
  renderer: Renderer;
  atlas: { calls: number; ensureVImage(f: string): unknown };
  setImage(v: unknown): void;
} {
  let img: unknown = null;
  const atlas = {
    calls: 0,
    ensureVImage(_f: string) { this.calls++; return img; },
  };
  return {
    renderer: { atlas } as unknown as Renderer,
    atlas,
    setImage: (v: unknown) => { img = v; },
  };
}
function opts(): Opts {
  return { cx: 100, cy: 100, radius: 300, tint: [255, 120, 60], frac: 1, breakT: -1, reformT: -1, time: 0.5 };
}
function fakeCtx(): CanvasRenderingContext2D {
  return new FakeCtx2d() as unknown as CanvasRenderingContext2D;
}

afterEach(() => {
  vi.restoreAllMocks();
  __resetForceFieldBubbleForTest();
});

describe('BJ112-① 塔盾泡冷启动（ForceFieldBubble.perlinData 良性 miss 不吃负缓存）', () => {
  it('懒载未就绪逐帧重查,贴图到达次拍即绘（旧 15s 负缓存=第二拍仍 false=红）', () => {
    const { renderer, setImage } = fakeRenderer();
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const ctx = fakeCtx();
    expect(drawForceFieldBubble(ctx, renderer, opts())).toBe(false);   // 首拍:pending → null
    setImage({ width: 128, height: 128 });                              // 图集懒载落地（下一帧）
    t += 16;
    expect(drawForceFieldBubble(ctx, renderer, opts())).toBe(true);    // ★下帧自愈
  });

  it('pending/失败期不吞 ensureVImage 调用（节流归图集 _vImageFailed TTL;旧负缓存 15s 内 calls=0=红）', () => {
    const { renderer, atlas } = fakeRenderer();                         // 恒 null（真 404 面）
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const ctx = fakeCtx();
    for (let i = 0; i < 5; i++) {
      drawForceFieldBubble(ctx, renderer, opts());
      t += 16;                                                          // 1000..1064ms ≪ 15s
    }
    expect(atlas.calls).toBe(5);                                        // ★每帧都查;复辟负缓存 → ≤1
  });

  it('长 pending 窗（>15s 模拟时钟）后到达仍即绘——旧实现此窗内恒零绘制=红', () => {
    const { renderer, setImage } = fakeRenderer();
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const ctx = fakeCtx();
    let drawn = false;
    for (let i = 0; i < 1200; i++) {                                    // ~19.2s 逐帧
      drawn = drawForceFieldBubble(ctx, renderer, opts());
      t += 16;
    }
    expect(drawn).toBe(false);                                          // 仍未就绪
    setImage({ width: 128, height: 128 });
    t += 16;
    expect(drawForceFieldBubble(ctx, renderer, opts())).toBe(true);     // ★到达次拍即绘
  });
});
