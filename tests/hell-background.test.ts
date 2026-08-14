// 地狱背景层序/位置/动画回归(对照 Main.cs :52237/:52265-70/:61657-65/:52488-97):
// ① 黑盒最先打底(曾画在最后盖掉岩浆带) ② 岩浆带顶 = magmaLayer 公式(曾误用 lavaLine)
// ③ 岩浆体 3 帧动画行 ④ 表面波纹条(185+hell)存在(曾从未绘制)
import { describe, it, expect } from 'vitest';
import { BiomeBackground } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

/** 录制式 ctx:drawImage/fillRect 全记,stub img 解码完成态 */
function recorder() {
  const calls: Array<Record<string, unknown>> = [];
  const ctx = {
    save: () => {}, restore: () => {},
    drawImage: (im: unknown, ...a: unknown[]) => calls.push({ op: 'img', tex: (im as { tex?: number }).tex, args: a }),
    fillRect: (...a: unknown[]) => calls.push({ op: 'rect', args: a }),
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/** 伪 img:naturalWidth/Height 按地狱贴图实际尺寸;complete 恒真 */
function stubImgs(bg: BiomeBackground) {
  const SIZES: Record<number, [number, number]> = {
    125: [160, 288], 126: [160, 288], 127: [160, 288],
    185: [160, 48], 186: [160, 48], 187: [160, 48],
  };
  const map = (bg as unknown as { imgs: Map<number, ImageBitmap | HTMLImageElement | null> }).imgs;
  const orig = (bg as unknown as { img(n: number): ImageBitmap | HTMLImageElement | null }).img;
  (bg as unknown as { img(n: number): ImageBitmap | HTMLImageElement | null }).img = (n: number) => {
    const s = SIZES[n];
    if (s) {
      const fake = { tex: n, complete: true, naturalWidth: s[0], naturalHeight: s[1] } as unknown as HTMLImageElement;
      map.set(n, fake);
      return fake;
    }
    return orig.call(bg, -1);
  };
}

function hellWorld() {
  const w = new World(400, 600, 42, 'hell');
  w.groundLevel = 100; w.rockLevel = 200;
  return w;
}

describe('地狱背景(Main.cs DrawBackground 地下层)', () => {
  it('黑盒在带层【之前】打底且下界=UnderworldLayer(层序 :52267 在 Rock/Magma 前)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugAlpha = 1;
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugOld = bg.ugStyle;   // 无过渡,单份
    const { ctx, calls } = recorder();
    const world = hellWorld();
    const camY = (600 - 300) * 16;            // 玩家在 h-300(岩浆带 263..400 格内)
    // 直调 drawUnderground(draw 内 update 会把 ugAlpha 从 0 渐变,单帧早退)
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, { x: 3200, y: camY }, camY - 400, 1280, 800, 100);
    const rectIdx = calls.findIndex(c => c.op === 'rect');
    const firstImg = calls.findIndex(c => c.op === 'img');
    expect(rectIdx).toBeGreaterThanOrEqual(0);
    expect(firstImg).toBeGreaterThan(rectIdx);       // 黑盒先于一切贴图
    // ★整屏黑底:原版黑盒 min(screenH+200, hellBlackBoxBottom) 的钳制只在清屏色=纯黑下
    // 成立(深层各带层不画、清屏黑兜底);本仓清屏非黑 → 岩浆带可见时整屏铺黑(视觉等价)
    const hRect = calls[rectIdx].args as number[];
    expect(hRect[3]).toBe(800);   // viewH 整屏
  });

  it('岩浆带顶 = magmaLayer 公式(h-335 带,非 lavaLine h-200——曾低 ~135 格 :52237)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugAlpha = 1;
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugOld = bg.ugStyle;
    const { ctx, calls } = recorder();
    const world = hellWorld();
    const camY = (600 - 300) * 16;
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, { x: 3200, y: camY }, camY - 400, 1280, 800, 100);
    const magma = calls.find(c => c.op === 'img' && (c.tex === 125 || c.tex === 126 || c.tex === 127));
    expect(magma).toBeTruthy();
    const camTopY = camY - 400;
    const expectedTop = (100 + Math.floor((600 - 330 - 100) / 6) * 6 - 5) * 16 - camTopY + 16 + 600 - 8;
    expect((magma!.args as number[])[5]).toBeCloseTo(expectedTop, 0);   // 9 参 drawImage 的 dy=args[5]
  });

  it('岩浆体按 magmaFrame 行取帧(3 帧×96px;surface 条 185+hell 取 frame*16 行 :52488-97)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugAlpha = 1;
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugOld = bg.ugStyle;
    const { ctx, calls } = recorder();
    const world = hellWorld();
    // 相机移到 UnderworldLayer(h-200)附近:岩浆带底+表面波纹条同屏(:52488 条在带底)
    const camY = (600 - 215) * 16;
    // 推到第 2 帧:magmaBGFrame 每 8 tick(133.33ms)推一次 → 16 tick = 266.7ms
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, { x: 3200, y: camY }, camY - 400, 1280, 800, 266.7);
    const magma = calls.find(c => c.op === 'img' && (c.tex === 125 || c.tex === 126));
    expect(magma).toBeTruthy();
    expect((magma!.args as number[])[1]).toBe(96 * 2);          // sourceY = frame*96
    const strip = calls.find(c => c.op === 'img' && (c.tex === 185 || c.tex === 186));
    expect(strip).toBeTruthy();                                  // 表面条存在(曾缺失)
    expect((strip!.args as number[])[1]).toBe(16 * 2);           // sourceY = frame*16
    // 帧循环:3 帧一循环回 0(24 tick = 400ms → frame=3%3=0;新建实例清零累计,
    // 因 magmaFrameT 跨帧调用累计——原版 magmaBGFrame 同为全局持久计数)
    const bg2 = new BiomeBackground();
    stubImgs(bg2);
    (bg2 as unknown as { ugAlpha: number; ugOld: number }).ugAlpha = 1;
    (bg2 as unknown as { ugAlpha: number; ugOld: number }).ugOld = bg2.ugStyle;
    const { ctx: ctx2, calls: calls2 } = recorder();
    (bg2 as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx2, world, { x: 3200, y: camY }, camY - 400, 1280, 800, 400);
    const magma2 = calls2.find(c => c.op === 'img' && (c.tex === 125 || c.tex === 126));
    expect((magma2!.args as number[])[1]).toBe(0);               // mod 3 回 0
    void bg2;
  });

  it('地狱多层远景背景(DrawUnderworldBackground :52082-52228):五层风格集+四帧行动画+层0黑补', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugAlpha = 1;
    (bg as unknown as { ugAlpha: number; ugOld: number }).ugOld = bg.ugStyle;
    // 地狱层贴图 stub(风格 0 集 = Underworld 0-4;1/6 带动画)
    const hellMap = (bg as unknown as { hellImgs: Map<number, ImageBitmap | HTMLImageElement | null> }).hellImgs;
    const HELL: Record<number, [number, number]> = {
      0: [1024, 858], 1: [2048, 1900], 2: [1024, 630], 3: [1024, 630], 4: [48, 1300],
    };
    for (const [n, [w, hh]] of Object.entries(HELL)) {
      hellMap.set(Number(n), { tex: 200 + Number(n), complete: true, naturalWidth: w, naturalHeight: hh } as unknown as HTMLImageElement);
    }
    const world = hellWorld();
    world.underworldBG = 0;                    // 风格 0 → 集 [0,1,2,3,4]
    const camY = (600 - 100) * 16;             // 深地狱(h-100),屏底远超 h-220 门
    const { ctx, calls } = recorder();
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, { x: 3200, y: camY }, camY - 400, 1280, 800, 125);  // 125ms → frame=1
    const hell = calls.filter(c => c.op === 'img' && (c.tex as number) >= 200);
    expect(hell.length).toBeGreaterThan(0);                     // 地狱层有绘制
    // 动画帧行:贴图1(frame=1)→ sx=(1>>1)*(2048>>1)=0, sy=(1%2)*(1900>>1)=950
    const tex1 = hell.find(c => c.tex === 201);
    expect(tex1).toBeTruthy();
    expect((tex1!.args as number[])[0]).toBe(0);
    expect((tex1!.args as number[])[1]).toBe(950);
    // 层0(tex 200)之后应有黑补 rgb(11,3,7) 的 fillRect
    const black = calls.find(c => c.op === 'rect');
    expect(black).toBeTruthy();
    // 五层全画(idx 4→0 → tex 204,203,202,201,200 都出现)
    for (const t of [200, 201, 202, 203, 204]) {
      expect(hell.some(c => c.tex === t)).toBe(true);
    }
  });

});
