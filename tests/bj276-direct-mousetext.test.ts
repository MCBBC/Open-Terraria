// ★BJ276 2026-09-22 信息栏文本方案 B(动态读数直绘)行为锁 + 烘焙退役锁。
// (用户拍板:信息栏读数=动态键每帧变→烘焙逐帧 miss+canvas 出生 ~88/s→退役,
//  改 drawDirectMouseText 直绘;悬停标签静态面保留烘焙。机制账见
//  MouseTextBake.ts 头注 BJ276 段;探针 scripts/_bj276-infobar-planb.mjs 实机
//  churn/出生率/观感 A/B。无 jsdom 环境,fake DOM 桩 = bj270 同款+transform 记录;
//  断言面:)
//  ① 直绘 op 锁:font/textAlign/textBaseline/4×'#000'±2 描边+本体色/globalAlpha/
//    translate+scale(save/restore 包裹)——op 序与 FX57 前旧直绘回退支逐字节同形;
//  ② 直绘零缓存交互:任意 churn 键流(逐帧变串)bake/tint 缓存恒空+零 canvas 出生;
//  ③ 退役结构锁:InfoAccsLayer 只出 drawDirectMouseText(禁回退烘焙);
//    Renderer.drawMouseTextLayer 仍走 drawBakedMouseText(静态面保留);
//  ④ 静态面回归:drawBakedMouseText 烘焙/命中语义不变(bj270/perf-textbake 详锁)。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

interface Op { op: string; args: unknown[]; style?: string; alpha?: number }
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
  translate(x: number, y: number): void; scale(x: number, y: number): void;
}
interface RecCanvas {
  width: number; height: number;
  _ctx: RecCtx | null;
  getContext(kind: string, attrs?: unknown): RecCtx | null;
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
              fillText(t: string, x: number, y: number) { ctx.ops.push({ op: 'fillText', args: [t, x, y], style: ctx.fillStyle, alpha: ctx.globalAlpha }); },
              fillRect(x: number, y: number, w: number, h: number) { ctx.ops.push({ op: 'fillRect', args: [x, y, w, h] }); },
              clearRect(x: number, y: number, w: number, h: number) { ctx.ops.push({ op: 'clearRect', args: [x, y, w, h] }); },
              drawImage(...a: unknown[]) { ctx.ops.push({ op: 'drawImage', args: a }); },
              getImageData(x: number, y: number, w: number, h: number) {
                return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as ImageData;
              },
              putImageData(_im: ImageData, _x: number, _y: number) { ctx.ops.push({ op: 'putImageData', args: [] }); },
              save() { ctx.ops.push({ op: 'save', args: [] }); },
              restore() { ctx.ops.push({ op: 'restore', args: [] }); },
              translate(x: number, y: number) { ctx.ops.push({ op: 'translate', args: [x, y] }); },
              scale(x: number, y: number) { ctx.ops.push({ op: 'scale', args: [x, y] }); },
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

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(resolve(HERE, '..', p), 'utf8');

describe('★BJ276 信息栏方案 B:直绘行为锁 + 烘焙退役锁', () => {
  let mod: typeof import('../src/vui/draw/MouseTextBake');
  let PixelText: typeof import('../src/vui/draw/PixelText').PixelText;
  let FONT: string;
  let mainCtx: RecCtx;
  let canvases: RecCanvas[];

  beforeAll(async () => {
    ({ canvases } = installFakeDom());
    mod = await import('../src/vui/draw/MouseTextBake');
    PixelText = (await import('../src/vui/draw/PixelText')).PixelText;
    PixelText.ready = true;
    FONT = (await import('../src/vui/draw/PixelText')).CANVAS_MOUSETEXT_FONT;
    const mainCv = document.createElement('canvas') as unknown as RecCanvas;
    mainCv.width = 400; mainCv.height = 300;
    mainCtx = mainCv.getContext('2d')!;
  });

  const births = () => canvases.length;
  const direct = (text: string, y: number, opts?: Partial<Parameters<typeof mod.drawDirectMouseText>[4]>) =>
    mod.drawDirectMouseText(mainCtx as unknown as CanvasRenderingContext2D, text, 30, y, {
      anchor: 'middle', color: '#e8e4f0', ...opts,
    });

  it('①直绘 op 锁:font/锚/四向 ±2 黑描边+本体色/translate+scale+α,save·restore 包裹', () => {
    const n0 = births();
    mainCtx.ops.length = 0;
    direct('18 mph', 90, { alpha: 0.34, scaleX: 0.9, scaleY: 0.95 });
    const ops = mainCtx.ops.map((o) => o.op);
    // 结构:save → (translate,scale,α 隐式) → 5×fillText → restore
    expect(ops[0]).toBe('save');
    expect(ops[ops.length - 1]).toBe('restore');
    expect(ops.filter((o) => o === 'save').length).toBe(1);
    expect(ops.filter((o) => o === 'restore').length).toBe(1);
    // font/锚钉值(直绘自钉,不依赖调用侧预置)
    expect(mainCtx.font).toBe(FONT);                       // '14px "Fusion Pixel 12px", monospace'
    expect(mainCtx.textAlign).toBe('left');
    expect(mainCtx.textBaseline).toBe('middle');
    // translate(X+20,ty)+scale(215 钳制)落位
    expect(mainCtx.ops.find((o) => o.op === 'translate')?.args).toEqual([30, 90]);
    expect(mainCtx.ops.find((o) => o.op === 'scale')?.args).toEqual([0.9, 0.95]);
    // 5 次 fillText:4×'#000'@[±2,0]/[0,±2](描边,压暗 α 生效)+1×本体@[0,0]
    const fills = mainCtx.ops.filter((o) => o.op === 'fillText');
    expect(fills.length).toBe(5);
    expect(fills.slice(0, 4).map((o) => o.args)).toEqual([[ '18 mph', 2, 0], ['18 mph', -2, 0], ['18 mph', 0, 2], ['18 mph', 0, -2]]);
    expect(fills.slice(0, 4).every((o) => o.style === '#000')).toBe(true);
    expect(fills[4].args).toEqual(['18 mph', 0, 0]);
    expect(fills[4].style).toBe('#e8e4f0');
    expect(fills.every((o) => o.alpha === 0.34)).toBe(true);   // 压暗行 α=描边+正文一起暗
    // 零 canvas 出生(直绘与缓存零交互)
    expect(births()).toBe(n0);
    expect(mod.bakeStats().count).toBe(0);
    expect(mod.bakeStats().tintCount).toBe(0);
  });

  it("①'top' 锚(drawMouseTextLayer 同表):textBaseline='top' 同 op 形", () => {
    mainCtx.ops.length = 0;
    direct('铜短剑', 40, { anchor: 'top' });
    expect(mainCtx.textBaseline).toBe('top');
    expect(mainCtx.ops.filter((o) => o.op === 'fillText').length).toBe(5);
  });

  it('②动态读数 churn 键流(逐帧变串)直绘:烘焙/染色缓存恒空+零 canvas 出生', () => {
    const n0 = births();
    // 模拟 8s@60fps:秒表 mph+罗盘英尺 逐帧变串(480 帧两组 churn 键)
    for (let f = 0; f < 480; f++) {
      direct(`速度: ${f % 40} mph`, 90);
      direct(`位置: ${1000 + f} 英尺 东`, 112);
    }
    expect(births()).toBe(n0);                    // 零 canvas 出生(before 实机 ~88/s → 0)
    expect(mod.bakeStats().count).toBe(0);        // 不入烘焙缓存(动态键退役)
    expect(mod.bakeStats().tintCount).toBe(0);    // 不入染色缓存
  });

  it('③退役结构锁:InfoAccsLayer 只出直绘(禁回退烘焙);Renderer 悬停面保留烘焙', () => {
    const layer = read('src/render/InfoAccsLayer.ts');
    expect(layer).toContain('drawDirectMouseText(ctx, r.text');
    expect(layer).not.toContain('drawBakedMouseText');
    const renderer = read('src/render/Renderer.ts');
    expect(renderer).toContain('drawBakedMouseText(ctx, p.cursorItemIconText');   // 静态面保留
  });

  it('④静态面回归:drawBakedMouseText 烘焙/命中语义不变(悬停标签面)', () => {
    const n0 = births();
    const ok1 = mod.drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '悬停: 铜短剑', 10, 10, {
      anchor: 'top', color: '#e8e4f0',
    });
    expect(ok1).toBe(true);
    expect(mod.bakeStats().count).toBe(1);        // 静态键首烘入缓存
    const nMid = births();
    const ok2 = mod.drawBakedMouseText(mainCtx as unknown as CanvasRenderingContext2D, '悬停: 铜短剑', 10, 40, {
      anchor: 'top', color: '#e8e4f0',
    });
    expect(ok2).toBe(true);
    expect(mod.bakeStats().count).toBe(1);        // 命中零重烘
    expect(births()).toBe(nMid);                  // 命中零出生(首烘 2 canvas:sil+mask)
    expect(nMid).toBeGreaterThan(n0);
  });
});
