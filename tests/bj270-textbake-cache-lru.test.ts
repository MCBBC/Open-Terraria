// ★BJ270 2026-09-22 MouseTextBake 烘焙缓存 LRU 化 + 烘焙画布 willReadFrequently 守卫
// (Windows 丛林卡顿 trace 定谳:getImageData 5.39s/16.1% 全 trace 头号热点,
//  链 = binarize←bake←drawBakedMouseText←InfoAccsLayer.draw——信息栏读数文本逐帧
//  churn 逐帧 miss,且满容量 `cache.clear()` 全清 = 静态行条目陪葬级联重烘,
//  trace 前 9s rAF 间隙 >100ms×33 次的帧爆发物证)。
//
// 【机制锁】(无 jsdom 环境,fake DOM 桩 perf-textbake-tint-cache.test.ts 同款;
//  逐像素正确性由烘焙位图字节同源保证——willReadFrequently 只改后备_store 类型,
//  不改 Skia 光栅化输出):
//  ① pixel 档烘焙 sil/mask getContext 收到 {willReadFrequently:true} 且走
//    binarize(getImageData+putImageData);hidpi 档不传 attrs 且零读回。
//  ② 满容量单条 LRU 逐出(非全清):>512 churn 后缓存 size≤512 且静态行条目仍命中
//    (sil 位图同一性不变);对照一次性键被逐出(重烘=sil 新身份)。
//  ③ 命中刷 recency:每帧重画的静态行恒 MRU 不被逐;一次性 churn 键居头部被逐。
//  ④ 失效钩子面不受影响(clearMouseTextCaches 仍清烘焙缓存)。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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
  /** ★BJ270:捕获 getContext 第二参(ctx 属性),验 willReadFrequently 面 */
  _attrs: unknown;
  _ctx: RecCtx | null;
  getContext(kind: string, attrs?: unknown): RecCtx | null;
}

function installFakeDom(): { listeners: Map<string, Array<() => void>>; canvases: RecCanvas[] } {
  const listeners = new Map<string, Array<() => void>>();
  const canvases: RecCanvas[] = [];
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): RecCanvas {
      const cv: RecCanvas = {
        width: 0, height: 0, _attrs: undefined, _ctx: null,
        getContext(kind: string, attrs?: unknown) {
          if (kind !== '2d') return null;
          if (!cv._ctx) {
            // 浏览器语义:ctx 属性只在【首次创建】生效——后续 getContext 返回
            // 同一 context、忽略 attrs(binarize 的二次 getContext 不覆盖记录)
            cv._attrs = attrs;
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
                return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as unknown as ImageData;
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

describe('★BJ270 MouseTextBake 烘焙缓存 LRU + willReadFrequently', () => {
  let mod: typeof import('../src/vui/draw/MouseTextBake');
  let mainCtx: RecCtx;
  let canvases: RecCanvas[];
  const g = globalThis as Record<string, unknown>;
  const origDpr = g.devicePixelRatio;

  beforeAll(async () => {
    ({ canvases } = installFakeDom());
    g.devicePixelRatio = 1;            // pixel 档(Windows 100%/125% 判定域)
    mod = await import('../src/vui/draw/MouseTextBake');
    const PixelText = (await import('../src/vui/draw/PixelText')).PixelText;
    PixelText.ready = true;
    const mainCv = document.createElement('canvas') as unknown as RecCanvas;
    mainCv.width = 400; mainCv.height = 300;
    mainCtx = mainCv.getContext('2d')!;
  });

  afterAll(() => {
    if (origDpr === undefined) delete g.devicePixelRatio; else g.devicePixelRatio = origDpr;
  });

  const draw = (t: string) => mod.drawBakedMouseText(
    mainCtx as unknown as CanvasRenderingContext2D, t, 10, 10,
    { anchor: 'middle', color: '#e8e4f0' });

  /** 本轮新建的「有 fillText ops」画布 = 恰 2 张(sil+mask;sharedCtx 仅
   *  measureText 零 op,tint scratch 仅合成 op 无 fillText——按 op 面甄别,
   *  不按创建序猜测) */
  const bakedPair = (marker: number): [RecCanvas, RecCanvas] => {
    const fresh = canvases.slice(marker).filter((c) => c._ctx && c._ctx.ops.some((o) => o.op === 'fillText'));
    expect(fresh.length).toBe(2);
    return [fresh[0], fresh[1]];
  };
  const silBlits = () => mainCtx.ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]);

  it('pixel 档:烘焙 sil/mask 挂 willReadFrequently:true 且走 binarize 读回', () => {
    const marker = canvases.length;
    mainCtx.ops.length = 0;
    expect(draw(' BJ270 属性面')).toBe(true);
    const [sil, mask] = bakedPair(marker);
    expect(sil._attrs).toEqual({ willReadFrequently: true });
    expect(mask._attrs).toEqual({ willReadFrequently: true });
    // binarize 面(桩的 getImageData 不记 op;putImageData=binarize 终端 op)
    expect(sil._ctx!.ops.some((o) => o.op === 'putImageData')).toBe(true);
    expect(mask._ctx!.ops.some((o) => o.op === 'putImageData')).toBe(true);
  });

  it('hidpi 档(dpr≥1.5):烘焙画布不传 attrs 且零读回(字节面零变化)', () => {
    g.devicePixelRatio = 2;
    const marker = canvases.length;
    mainCtx.ops.length = 0;
    expect(draw(' HIDPI 档面')).toBe(true);
    const [sil, mask] = bakedPair(marker);
    expect(sil._attrs).toBeUndefined();
    expect(mask._attrs).toBeUndefined();
    expect(sil._ctx!.ops.some((o) => o.op === 'putImageData')).toBe(false);  // 不走 binarize
    expect(mask._ctx!.ops.some((o) => o.op === 'putImageData')).toBe(false);
    g.devicePixelRatio = 1;
  });

  it('满容量 LRU 逐出+recency:600 churn 后静态行仍命中(sil 同一性),一次性键被逐', () => {
    mainCtx.ops.length = 0;
    // 静态行 A:先烘一次
    expect(draw('静态行A')).toBe(true);
    const silA0 = silBlits()[0];
    expect(silA0).toBeDefined();
    // 600 个一次性 churn 键,每轮 A 重画一次(=真实信息栏节奏:静态行每帧命中)
    for (let i = 0; i < 600; i++) {
      expect(draw(`churn#${i}`)).toBe(true);
      expect(draw('静态行A')).toBe(true);
    }
    expect(mod.bakeStats().count).toBeLessThanOrEqual(512);   // 单条逐出,不再全清堆积
    const silA1 = silBlits()[silBlits().length - 2];          // 末次绘制 [sil, tint] 的 sil
    expect(silA1).toBe(silA0);                                // A 恒命中:同一烘焙位图
    // 对照:一次性键 B(烘一次后 600 churn 不重画)被逐出 → 重画=重烘(新身份)
    expect(draw('一次性键B')).toBe(true);
    const silB0 = silBlits()[silBlits().length - 2];          // [sil, tint] 两 blit 的 sil
    for (let i = 0; i < 600; i++) draw(`churn2#${i}`);
    expect(draw('一次性键B')).toBe(true);
    const silB1 = silBlits()[silBlits().length - 2];
    expect(silB1).not.toBe(silB0);                            // B 被逐,重烘新位图
  });

  it('失效钩子:clearMouseTextCaches 清烘焙缓存(bakeStats.count 归零)', () => {
    expect(mod.bakeStats().count).toBeGreaterThanOrEqual(1);
    mod.clearMouseTextCaches();
    expect(mod.bakeStats().count).toBe(0);
  });
});
