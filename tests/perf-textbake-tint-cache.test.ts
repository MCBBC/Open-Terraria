// ★perf-textbake 2026-09-19 染色结果缓存单元闸门(无 jsdom 环境——注入最小 fake DOM,
//  trail-shader.test.ts 同款;合成正确性=逐像素金标由探针 scripts/_ptc-textbake-ab.mjs
//  实机 Chrome 对拍,此处锁**机制**:命中零重染/键含 color+regime/LRU 逐出与
//  recency/失效钩子/逃生门(见 perf-textbake-hatch.test.ts)/主画布 op 序与旧路径同形)。
import { describe, it, expect, beforeAll } from 'vitest';

interface Op { tag: string; op: string; args: unknown[] }
interface RecCtx {
  canvas: RecCanvas;
  font: string; textAlign: string; textBaseline: string;
  fillStyle: string; globalCompositeOperation: string;
  imageSmoothingEnabled: boolean; globalAlpha: number;
  ops: Op[];
  measureText(t: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number };
  fillText(t: string, x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(...a: unknown[]): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
  putImageData(im: ImageData, x: number, y: number): void;
  save(): void; restore(): void;
}
interface RecCanvas {
  width: number; height: number;
  _ctx: RecCtx | null;
  getContext(kind: string): RecCtx | null;
}

function installFakeDom(): { listeners: Map<string, Array<() => void>>; canvases: RecCanvas[] } {
  const listeners = new Map<string, Array<() => void>>();
  const canvases: RecCanvas[] = [];
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): RecCanvas {
      const cv: RecCanvas = {
        width: 0, height: 0, _ctx: null,
        getContext(kind: string) {
          if (kind !== '2d') return null;
          if (!cv._ctx) {
            const ctx: RecCtx = {
              canvas: cv,
              font: '', textAlign: '', textBaseline: '',
              fillStyle: '', globalCompositeOperation: 'source-over',
              imageSmoothingEnabled: true, globalAlpha: 1,
              ops: [],
              measureText(t: string) {
                return { width: 6.5 * t.length, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 };
              },
              fillText(t: string, x: number, y: number) { ctx.ops.push({ tag: 'cv', op: 'fillText', args: [t, x, y] }); },
              fillRect(x: number, y: number, w: number, h: number) { ctx.ops.push({ tag: 'cv', op: 'fillRect', args: [x, y, w, h] }); },
              clearRect(x: number, y: number, w: number, h: number) { ctx.ops.push({ tag: 'cv', op: 'clearRect', args: [x, y, w, h] }); },
              drawImage(...a: unknown[]) { ctx.ops.push({ tag: 'cv', op: 'drawImage', args: a }); },
              getImageData(x: number, y: number, w: number, h: number) {
                return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as ImageData;
              },
              putImageData(_im: ImageData, _x: number, _y: number) { ctx.ops.push({ tag: 'cv', op: 'putImageData', args: [] }); },
              save() { ctx.ops.push({ tag: 'cv', op: 'save', args: [] }); },
              restore() { ctx.ops.push({ tag: 'cv', op: 'restore', args: [] }); },
            };
            cv._ctx = ctx;
          }
          return cv._ctx;
        },
      };
      canvases.push(cv);
      return cv;
    },
    addEventListener(type: string, fn: () => void) {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
  };
  return { listeners, canvases };
}

describe('perf-textbake 染色结果缓存', () => {
  let drawBakedMouseText: typeof import('../src/vui/draw/MouseTextBake').drawBakedMouseText;
  let mod: typeof import('../src/vui/draw/MouseTextBake');
  let PixelText: typeof import('../src/vui/draw/PixelText').PixelText;
  let mainCtx: RecCtx;
  let listenerBag: Map<string, Array<() => void>>;

  beforeAll(async () => {
    ({ listeners: listenerBag } = installFakeDom());
    mod = await import('../src/vui/draw/MouseTextBake');
    PixelText = (await import('../src/vui/draw/PixelText')).PixelText;
    PixelText.ready = true;   // fontReady 直通,不查 document.fonts
    const mainCv = document.createElement('canvas') as unknown as RecCanvas;
    mainCv.width = 400; mainCv.height = 300;
    mainCtx = mainCv.getContext('2d')!;
    drawBakedMouseText = mod.drawBakedMouseText;
  });

  /** 主画布 drawImage 序(src 依 ctx 区分:主 ctx 的 ops 只含本画布调用) */
  const mainBlits = () => mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]);
  const composeOps = () => mainCtx.ops.filter((o) => o.op === 'clearRect' || o.op === 'fillRect');

  it('miss→hit:首次合成一次,二次零合成且 tint 源同一画布;主画布恒 [sil, tint] 两 blit', () => {
    const ok1 = drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '附近无特殊植物', 100, 50, {
      anchor: 'middle', color: '#e8e4f0',
    });
    expect(ok1).toBe(true);
    expect(mainBlits().length).toBe(2);                       // sil + tint
    const tint1 = mainBlits()[1];
    expect(composeOps().length).toBe(0);                      // 合成不在主画布(不在 scratch 之外的画布)
    const st1 = mod.bakeStats();
    expect(st1.tintCount).toBe(1);

    const ok2 = drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '附近无特殊植物', 100, 80, {
      anchor: 'middle', color: '#e8e4f0',
    });
    expect(ok2).toBe(true);
    expect(mainBlits().length).toBe(4);                       // 每帧恒两 blit
    expect(mainBlits()[3]).toBe(tint1);                       // 同一缓存画布(零重染铁证)
    expect(mod.bakeStats().tintCount).toBe(1);                // 未新增条目
  });

  it('主画布 op 序与旧两 blit 逐 op 同形([sil blit, tint blit],同参)', () => {
    mainCtx.ops.length = 0;
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, 'Depth 123 FT', 30, 60, {
      anchor: 'middle', color: '#FFE745', alpha: 0.34, scaleX: 0.7, scaleY: 1,
    });
    const draws = mainCtx.ops.filter((o) => o.op === 'drawImage');
    expect(draws.length).toBe(2);
    const [, ...a1] = draws[0].args;
    const [, ...a2] = draws[1].args;
    expect(a1).toEqual(a2);                                   // dx,dy,dw,dh 完全同参(=旧两 blit 同位)
    expect(draws[0].args[0]).not.toBe(draws[1].args[0]);      // 源不同(sil vs 染色图)
  });

  it('键含 color:同文本异色各自成条目,旧色回取仍命中', () => {
    const ok1 = drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '混排 CJK 42', 10, 10, {
      anchor: 'top', color: '#e8e4f0',
    });
    const ok2 = drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '混排 CJK 42', 10, 10, {
      anchor: 'top', color: '#FFE745',
    });
    expect(ok1 && ok2).toBe(true);
    const st = mod.bakeStats();
    expect(st.tintCount).toBeGreaterThanOrEqual(3);           // 行1 case 已有 2 条 + 本例 2 色 − 无逐出
    const gray = mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]);
    expect(gray[gray.length - 2]).not.toBe(gray[gray.length - 1]);   // 两色不同画布
  });

  it('键含 regime:devicePixelRatio 跨 1.5 门限 → 异档异条目(互不命中)', () => {
    const before = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 1;
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '档位键', 5, 5, { anchor: 'top', color: '#e8e4f0' });
    const nPixel = mod.bakeStats().tintCount;
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 2;
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '档位键', 5, 5, { anchor: 'top', color: '#e8e4f0' });
    const nHidpi = mod.bakeStats().tintCount;
    expect(mod.bakeStats().regime).toBe('hidpi');
    expect(nHidpi).toBe(nPixel + 1);                          // hidpi 档独立成条
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 1;
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '档位键', 5, 5, { anchor: 'top', color: '#e8e4f0' });
    expect(mod.bakeStats().regime).toBe('pixel');
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = before;
  });

  it('LRU:容量 256 上界;最旧条目逐出后重取=重合成(新画布);recency 刷新保活', () => {
    mainCtx.ops.length = 0;
    const start = mod.bakeStats().tintCount;
    // 填到上界
    const firstCv = (() => {
      drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, 'LRU-A', 0, 0, { anchor: 'top', color: '#e8e4f0' });
      return mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]).pop();
    })();
    for (let i = 0; i < 256; i++) {
      drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, `LRU 填充 ${i}`, 0, 0, { anchor: 'top', color: '#e8e4f0' });
    }
    expect(mod.bakeStats().tintCount).toBeLessThanOrEqual(256);
    // 逐出已发生:逐出画布入回收站(回收站非空=逐出事件铁证;条目本体已换血)
    expect(mod.bakeStats().tintPool).toBeGreaterThan(0);
    // 'LRU-A' 未再触碰 → 条目已逐出;重取触发重合成,scratch 从回收站复用逐出画布
    // (同对象回归 = 回收站机制铁证,非缓存命中——命中路径不触发回收站弹出)
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, 'LRU-A', 0, 0, { anchor: 'top', color: '#e8e4f0' });
    const reA = mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]).pop();
    expect(reA).toBe(firstCv);                                // 回收站复用(容量守恒)
    expect(mod.bakeStats().tintPool).toBeLessThan(8);
    // recency:再次触碰 A 后灌 255 新条目(总 256)→ A 仍活
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, 'LRU-A', 0, 0, { anchor: 'top', color: '#e8e4f0' });
    const aCv = mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]).pop();
    for (let i = 0; i < 255; i++) {
      drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, `LRU 保活 ${i}`, 0, 0, { anchor: 'top', color: '#e8e4f0' });
    }
    expect(mod.bakeStats().tintCount).toBeLessThanOrEqual(256);
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, 'LRU-A', 0, 0, { anchor: 'top', color: '#e8e4f0' });
    const aCv2 = mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]).pop();
    expect(aCv2).toBe(aCv);                                   // recency 刷新 ⇒ 未被逐出
    void start;
  });

  it('失效钩子:clearMouseTextCaches 清两缓存 + sw:remaster-applied 监听触发同效', () => {
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '失效面', 1, 1, { anchor: 'top', color: '#e8e4f0' });
    expect(mod.bakeStats().tintCount).toBeGreaterThanOrEqual(1);
    expect(mod.bakeStats().count).toBeGreaterThanOrEqual(1);
    mod.clearMouseTextCaches();
    expect(mod.bakeStats().tintCount).toBe(0);
    expect(mod.bakeStats().count).toBe(0);
    // 重画重烘(条目重建)
    drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '失效面', 1, 1, { anchor: 'top', color: '#e8e4f0' });
    expect(mod.bakeStats().tintCount).toBe(1);
    // remaster 事件面(BestiaryPanel.ts:64 同款先例)
    const arr = listenerBag.get('sw:remaster-applied');
    expect(arr?.length).toBeGreaterThanOrEqual(1);
    arr![0]();
    expect(mod.bakeStats().tintCount).toBe(0);
    expect(mod.bakeStats().count).toBe(0);
  });

  it('bakeStats 暴露 tint 缓存诊断面(探针消费)', () => {
    const st = mod.bakeStats();
    expect(typeof st.tintCount).toBe('number');
    expect(typeof st.tintPool).toBe('number');
    expect(st.tintCacheOn).toBe(true);                        // 本文件未设逃生门参数
  });
});
