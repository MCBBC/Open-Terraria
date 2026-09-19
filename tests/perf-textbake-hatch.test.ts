// ★perf-textbake 2026-09-19 逃生门闸门:?textbakecache=0 → 直通旧路径(共享 scratch
//  逐帧重染,与本修前逐字节同形)——回退通道保留至用户验收。独立文件:逃生门旗惰性
//  读一次,须在模块首次调用前装好 location(动态 import 前)。
import { describe, it, expect, beforeAll } from 'vitest';

interface RecCanvas {
  width: number; height: number;
  _ctx: {
    ops: Array<{ op: string; args: unknown[] }>;
    drawImage(...a: unknown[]): void;
    [k: string]: unknown;
  } | null;
  getContext(kind: string): unknown;
}

function installFakeDom(): void {
  const canvases: RecCanvas[] = [];
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): RecCanvas {
      const cv: RecCanvas = {
        width: 0, height: 0, _ctx: null,
        getContext(kind: string) {
          if (kind !== '2d') return null;
          if (!cv._ctx) {
            cv._ctx = {
              ops: [],
              font: '', textAlign: '', textBaseline: '', fillStyle: '',
              globalCompositeOperation: 'source-over',
              imageSmoothingEnabled: true, globalAlpha: 1,
              measureText(t: string) {
                return { width: 6.5 * t.length, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 };
              },
              fillText() { cv._ctx!.ops.push({ op: 'fillText', args: [] }); },
              fillRect() { cv._ctx!.ops.push({ op: 'fillRect', args: [] }); },
              clearRect() { cv._ctx!.ops.push({ op: 'clearRect', args: [] }); },
              drawImage(...a: unknown[]) { cv._ctx!.ops.push({ op: 'drawImage', args: a }); },
              getImageData(x: number, y: number, w: number, h: number) {
                return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
              },
              putImageData() { cv._ctx!.ops.push({ op: 'putImageData', args: [] }); },
              save() {}, restore() {},
            };
          }
          return cv._ctx;
        },
      };
      canvases.push(cv);
      return cv;
    },
    addEventListener() { /* 逃生门文件不测监听 */ },
  };
  void canvases;
}

describe('perf-textbake 逃生门 ?textbakecache=0', () => {
  let drawBakedMouseText: typeof import('../src/vui/draw/MouseTextBake').drawBakedMouseText;
  let mod: typeof import('../src/vui/draw/MouseTextBake');
  let PixelText: typeof import('../src/vui/draw/PixelText').PixelText;
  let mainCtx: { ops: Array<{ op: string; args: unknown[] }>; drawImage(...a: unknown[]): void } & Record<string, unknown>;

  beforeAll(async () => {
    (globalThis as Record<string, unknown>).location = { search: '?textbakecache=0' };
    installFakeDom();
    mod = await import('../src/vui/draw/MouseTextBake');
    PixelText = (await import('../src/vui/draw/PixelText')).PixelText;
    PixelText.ready = true;
    const mainCv = (document as unknown as { createElement(t: string): RecCanvas }).createElement('canvas');
    mainCv.width = 400; mainCv.height = 300;
    mainCtx = mainCv.getContext('2d') as typeof mainCtx;
    drawBakedMouseText = mod.drawBakedMouseText;
  });

  it('直通旧路径:每次调用都重染(无缓存条目),主画布恒 [sil, tint] 两 blit', () => {
    const ok1 = drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '逃生门', 10, 10, {
      anchor: 'top', color: '#e8e4f0',
    });
    const ok2 = drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '逃生门', 10, 30, {
      anchor: 'top', color: '#e8e4f0',
    });
    expect(ok1 && ok2).toBe(true);
    const st = mod.bakeStats();
    expect(st.tintCacheOn).toBe(false);
    expect(st.tintCount).toBe(0);                             // 缓存整支旁路
    const draws = mainCtx.ops.filter((o) => o.op === 'drawImage');
    expect(draws.length).toBe(4);                             // 每次两 blit(旧路径同形)
    // 旧路径共享 scratch:两次 tint 源同一画布(逐帧重写同形)
    expect(draws[1].args[0]).toBe(draws[3].args[0]);
  });
});
