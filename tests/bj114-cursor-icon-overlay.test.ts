// SW-BJ114 交互图标上浮层（用户实报"光标灰描边盖住门/椅交互图标"）：
// 定谳=光标描边参数是原版 1:1（Main.cs:48865-48913 DrawThickCursor,Cursors[11]
// 18×18×cursorScale×1.1 四向、MouseBorderColor (64,64,64,64)=预乘白 25%α"灰"）,
// 病灶=绘制序反序——原版层 36 光标(:46011)先画、层 40 交互图标(:45792)后画=图标
// 在上;本仓光标恒在 ui-canvas（VUI z-index 300）=游戏画布之上,12b 图标面画在游戏
// 画布 ⇒ 图标被 14px 本体+16.4px 阴影+19.8px 描边足迹罩灰。修=图标面上浮层
// z-index 301（原版 36<40 序）,面几何逐值不动。本文件三面判别：
// ①行为面（假画布录制）:图标 blit 只进上浮层、主画布零图标绘制、平移/锚逐值;
// ②守恒面:帧章 gate（12b 跳过帧清层）;逃生门 ?sw-iconoverlay=0 回退旧路径;
// ③结构锁（源文本锚,变异即红）+遮盖面积断言（描边足迹 vs 图标核心区几何）。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// ---- 录制画布桩（node 环境;drawImage/translate/clearRect 等逐调用记录） ----
interface Call { fn: string; args: unknown[] }
type RecCtx = CanvasRenderingContext2D & { __calls: Call[] };
function makeCtx(): RecCtx {
  const calls: Call[] = [];
  return new Proxy({ __calls: calls }, {
    get(t, k) {
      if (k === '__calls') return calls;
      return (...args: unknown[]) => { calls.push({ fn: String(k), args }); };
    },
    set() { return true; },   // imageSmoothingEnabled/globalAlpha 等赋值直吞
  }) as unknown as RecCtx;
}
interface RecCanvas {
  width: number; height: number; style: Record<string, string>;
  parentElement: { appendChild(c: unknown): void } | null;
  getContext(): RecCtx;
  remove(): void;
}
function makeCanvas(w = 300, h = 150): RecCanvas {
  const ctx = makeCtx();
  return {
    width: w, height: h, style: {},
    parentElement: null,
    getContext: () => ctx,
    remove: () => { /* DOM 摘除记录不需要 */ },
  };
}
const created: RecCanvas[] = [];

let RendererCtor: typeof import('../src/render/Renderer').Renderer;
let r: InstanceType<typeof RendererCtor>;
let mainCtx: RecCtx;
const PLAYER = {
  cursorItemIconID: 10, cursorItemIconEnabled: true,
  cursorItemIconPush: 0, cursorItemIconReversed: false,
};
// 门(vanilla item 10 icon 34×30)/油漆弹药子图标——atlasIcon 猴补切片
const ICON = { img: { __icon: 'door' }, sx: 0, sy: 0, sw: 34, sh: 30 };
const AMMO = { img: { __icon: 'ammo' }, sx: 0, sy: 0, sw: 16, sh: 16 };

const rAny = () => r as unknown as Record<string, unknown>;
const draw = () => (r as unknown as {
  drawCursorItemIcon(ctx: CanvasRenderingContext2D, p: unknown): void;
}).drawCursorItemIcon(mainCtx as unknown as CanvasRenderingContext2D, PLAYER);

beforeAll(async () => {
  (globalThis as Record<string, unknown>).Image = class {
    src = ''; onload: (() => void) | null = null;
    width = 0; height = 0;
    addEventListener() { /* noop */ }
  };
  (globalThis as Record<string, unknown>).document = {
    createElement: (_tag: string) => { const c = makeCanvas(); created.push(c); return c; },
  };
  (globalThis as Record<string, unknown>).window = {
    addEventListener: () => {}, removeEventListener: () => {},
    innerWidth: 1280, innerHeight: 720,
  };
  ({ Renderer: RendererCtor } = await import('../src/render/Renderer'));
  r = new RendererCtor(null as never);
  // 主画布=Renderer 自持引用（字段初始化器可能先建别的画布,不按 created 序取）
  (rAny().canvas as RecCanvas).parentElement = { appendChild: () => {} };
  mainCtx = makeCtx();
  // 猴补图标源:vid→图标切片
  rAny().atlas = { __atlas: true };
  (r as unknown as { atlasIcon(id: number): unknown }).atlasIcon = (id: number) =>
    id === 10 ? ICON : null;
  (r as unknown as { itemInternalOfVid(vid: number): number }).itemInternalOfVid = (vid: number) => vid;
}, 120000);

const overlayOf = (): RecCanvas | undefined =>
  created.find((c) => c.width === 84 && c.height === 84);
const overlayCalls = (): Call[] => overlayOf()!.getContext().__calls;

describe('SW-BJ114 ①行为面:图标面只进上浮层', () => {
  it('主画布零图标绘制;上浮层收到 (2,2) 顶左 ×cursorScale 的图标 blit', () => {
    expect(created.length).toBeGreaterThanOrEqual(2);   // 构造器至少建主画布+lightCanvas
    draw();
    const main = mainCtx.__calls.filter((c) => c.fn === 'drawImage');
    expect(main).toHaveLength(0);                       // ★病灶面:主画布(=光标之下)不再画图标
    const ov = overlayOf();
    expect(ov).toBeTruthy();
    const imgs = overlayCalls().filter((c) => c.fn === 'drawImage');
    expect(imgs).toHaveLength(1);
    const [, , , sw, sh, dx, dy, dw, dh] = imgs[0].args;
    expect([sw, sh, dx, dy]).toEqual([34, 30, 2, 2]);   // 2px 边距;门 34×30 ×cursorScale=1
    expect(dw).toBe(34);
    expect(dh).toBe(30);
  });

  it('层锚=图标顶左 mouse+(10+push):元素 translate(mouse+8+push)+层内(2,2)', () => {
    (rAny()._mouseX as number) = 200;
    (rAny()._mouseY as number) = 130;
    (rAny().cursorIconCtx as { cursorScale: number }).cursorScale = 1.1;   // 呼吸峰
    draw();
    const ov = overlayOf()!;
    // 原版 :45848-45850 等价顶左=mouse+(10+push) → 元素=顶左-2px 边距
    expect(ov.style.transform).toBe('translate(208px, 138px)');
    const [, , , , , dx, dy, dw, dh] = overlayCalls().filter((c) => c.fn === 'drawImage').at(-1)!.args;
    expect([dx, dy]).toEqual([2, 2]);
    expect(dw).toBeCloseTo(34 * 1.1, 6);
    expect(dh).toBeCloseTo(30 * 1.1, 6);
  });

  it('油漆弹药子图标随图标面同层(:44531-44538 锚 mouse+(10+off) 相对不动)', () => {
    (rAny()._mouseX as number) = 100;
    (rAny()._mouseY as number) = 100;
    (rAny().cursorIconCtx as { cursorScale: number }).cursorScale = 1;
    (r as unknown as { atlasIcon(id: number): unknown }).atlasIcon = (id: number) =>
      id === 1072 ? ICON : (id === 1543 ? AMMO : null);
    const cc = rAny().cursorIconCtx as { heldVid: number; paintAmmoVid: number };
    cc.heldVid = 1072;          // 手持红油漆喷射器(num∈PAINT_TOOLS,off=(28,28))
    cc.paintAmmoVid = 1543;
    PLAYER.cursorItemIconID = 0;   // 走 heldVid 支
    const before = overlayCalls().filter((c) => c.fn === 'drawImage').length;
    draw();
    const imgs = overlayCalls().filter((c) => c.fn === 'drawImage').slice(before);
    expect(imgs).toHaveLength(2);   // 图标+弹药
    // drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh):ammo 绝对锚=mouse+10+(28,28);
    // 层内=绝对-(ox-2,oy-2),ox=mouse+10 → 层内(30,30)
    expect(imgs[1].args[5]).toBe(30);
    expect(imgs[1].args[6]).toBe(30);
    expect(imgs[1].args[7]).toBeCloseTo(16 * 0.8, 6);
    // 还原
    cc.heldVid = 0; cc.paintAmmoVid = 0;
    PLAYER.cursorItemIconID = 10;
    (r as unknown as { atlasIcon(id: number): unknown }).atlasIcon = (id: number) => (id === 10 ? ICON : null);
  });

  it('上浮层在光标层之上:z-index 301 > VUI ui-canvas 300(原版 36<40 层序)', () => {
    draw();
    const css = overlayOf()!.style.cssText;
    const m = /z-index:(\d+);/.exec(css);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThan(300);   // > VUI.ts 光标层 z-index:300
  });
});

describe('SW-BJ114 ②守恒面', () => {
  it('帧章 gate:animTick 前进后 12b 未画 → 层清空(防残影浮全屏地图/菜单)', () => {
    (rAny().animTick as number) = 41;
    draw();   // 盖章 stamp=41
    expect(overlayCalls().filter((c) => c.fn === 'drawImage').length).toBeGreaterThan(0);
    (rAny().animTick as number) = 42;
    (r as unknown as { iconOverlayFrameGate(): void }).iconOverlayFrameGate();
    const clr = overlayCalls().filter((c) => c.fn === 'clearRect');
    expect(clr[clr.length - 1].args).toEqual([0, 0, 84, 84]);
  });

  it('帧章 gate:同帧重盖章(12b 再入)不重复清层', () => {
    (rAny().animTick as number) = 43;
    (r as unknown as { iconOverlayFrameGate(): void }).iconOverlayFrameGate();   // head:清上帧
    draw();                                                                       // 12b:重画+盖章
    const n = overlayCalls().filter((c) => c.fn === 'drawImage').length;
    (r as unknown as { iconOverlayFrameGate(): void }).iconOverlayFrameGate();   // 同章不再清
    expect(overlayCalls().filter((c) => c.fn === 'drawImage')).toHaveLength(n);
  });

  it('逃生门 ?sw-iconoverlay=0:回退游戏画布(旧层序),不建上浮层', async () => {
    vi.resetModules();
    created.length = 0;
    PLAYER.cursorItemIconID = 10;
    PLAYER.cursorItemIconPush = 0;
    PLAYER.cursorItemIconEnabled = true;
    (globalThis as Record<string, unknown>).location = { search: '?sw-iconoverlay=0' };
    try {
      const { Renderer: R2 } = await import('../src/render/Renderer');
      const r2 = new R2(null as never);
      const ctx2 = makeCtx();
      const r2Any = r2 as unknown as Record<string, unknown>;
      (r2Any.canvas as RecCanvas).parentElement = { appendChild: () => {} };
      r2Any.atlas = { __atlas: true };
      (r2 as unknown as { atlasIcon(id: number): unknown }).atlasIcon = (id: number) => (id === 10 ? ICON : null);
      (r2 as unknown as { itemInternalOfVid(vid: number): number }).itemInternalOfVid = (vid: number) => vid;
      r2Any._mouseX = 100;
      r2Any._mouseY = 100;
      (r2 as unknown as {
        drawCursorItemIcon(ctx: CanvasRenderingContext2D, p: unknown): void;
      }).drawCursorItemIcon(ctx2 as unknown as CanvasRenderingContext2D, PLAYER);
      // 回退=旧行为:图标画进游戏画布,绝对坐标 mouse+(10+push)=(110,110)
      const imgs = ctx2.__calls.filter((c) => c.fn === 'drawImage');
      expect(imgs).toHaveLength(1);
      expect(imgs[0].args.slice(5)).toEqual([110, 110, 34, 30]);
      expect(created.filter((c) => c.width === 84 && c.height === 84)).toHaveLength(0);
    } finally {
      delete (globalThis as Record<string, unknown>).location;
    }
  });
});

// ============================================================
// ③ 结构锁+遮盖面积断言（源文本锚/1457 常量,变异即红）
// ============================================================
const rendererSrc = read('src/render/Renderer.ts');
const vuiSrc = read('src/vui/VUI.ts');

describe('SW-BJ114 ③结构锁', () => {
  it('图标面路由结构锁:drawCursorItemIcon 图标支经 iconOverlayCtx 上浮,主 ctx 兜底回退', () => {
    expect(rendererSrc).toMatch(/const octx = this\.iconOverlayCtx\(\) \?\? ctx;/);
    expect(rendererSrc).toMatch(/octx\.drawImage\(icon\.img, icon\.sx, icon\.sy, icon\.sw, icon\.sh,\s*\n\s*ox \+ kx, oy \+ ky, dw, dh\);/);
    expect(rendererSrc).toMatch(/this\._iconOverlayStamp = this\.animTick;/);
  });

  it('渲染头帧守恒结构锁:animTick++ 后紧跟 iconOverlayFrameGate', () => {
    expect(rendererSrc).toMatch(/this\.animTick\+\+;\s*\n\s*this\.iconOverlayFrameGate\(\);/);
  });

  it('dispose 结构锁:上浮层 DOM 兄弟节点随 Renderer 生命周期摘除', () => {
    expect(rendererSrc).toMatch(/this\.clearIconOverlay\(\);\s*\n\s*if \(this\._iconOverlay\) \{ this\._iconOverlay\.remove\(\); this\._iconOverlay = null; \}/);
  });

  it('层序数锁:上浮层 301 必须高于 VUI ui-canvas 光标层 300(两源同读)', () => {
    const m = rendererSrc.match(/z-index:(\d+);display:none;/);
    expect(m).toBeTruthy();
    expect(vuiSrc).toMatch(/z-index:300;/);   // VUI.ts 光标层 cssText(菜单态+cursorOnly 态)
    expect(Number(m![1])).toBeGreaterThan(300);
  });

  it('遮盖面积断言(1457 常量推导):描边足迹 ≠0 相交图标,但图标核心区(中心/右下半)在足迹外', () => {
    // 光标足迹(相对鼠标,1457 值):本体 Cursors[0] 14×14 origin 0 → [0,14];
    // 阴影 +Vector2.One ×1.1 → 上限 1+15.4=16.4;描边 Cursors[11] 18×18 ×1.1
    // origin(2,2) 四向偏移 (2,2)±1 → 最远帧位 x+3,帧左=x+3-2×1.1,延伸 18×1.1=19.8
    // → 上限 20.6(:48848-48849/:48865-48913 逐值)。
    const body = 14, shadowMax = 1 + 14 * 1.1, strokeMax = 3 - 2 * 1.1 + 18 * 1.1;
    const footprintMax = Math.max(body, shadowMax, strokeMax);
    const iconLeft = 10, doorW = 34, doorH = 30;   // 门图标顶左 mouse+(10+push),34×30
    expect(footprintMax).toBeCloseTo(20.6, 5);
    expect(footprintMax).toBeGreaterThan(iconLeft);   // 相交存在——旧层序(图标在下)必被罩=实报机理
    const cx = iconLeft + doorW / 2, cy = iconLeft + doorH / 2;   // 门图标中心 (27,25)
    expect(cx).toBeGreaterThan(footprintMax);          // 核心(中心)在描边足迹外
    expect(cy).toBeGreaterThan(footprintMax);
    // 描边新增吞带:描边上限 20.6 - 阴影上限 16.4 = 4.2px(门图标左上带 10..20.6)
    expect(strokeMax - shadowMax).toBeGreaterThan(4);
    // 修复后序保护:图标在上 ⇒ 相交带像素由图标决定(结构锁 z301>300 + 行为面主画布零绘制背书)
  });
});
