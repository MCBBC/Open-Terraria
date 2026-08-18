// 地下带状背景平铺几何回归(2026-08-17 "蘑菇区远景平铺错位"修复):
// ① 水平周期 = 贴图宽-32(160 宽贴图采样中间 128 列 [16+diff, 144+diff)——两侧 16px
//    是 wrap padding;整宽 160 平铺会每 160px 出一条图案断缝,即本 bug 根因)
// ② dest X = bgStartX + P*i + diff(caveParallax 0.88 视差滚动 + num2 16px 世界网格
//    对齐,src/dst 同移——Main.cs :52277/:52836)
// ③ 深层垂直行相位锁定:bgStartY = IEEERemainder(bgTopY,96)-96(带顶世界锁定,
//    非屏幕顶锚定——屏幕锚定会随相机漂移,Main.cs :52541)
// ④ 蘑菇 style 2 槽位 = 62/63/64/65(UpdateBackgroundStyles case 2)
import { describe, it, expect } from 'vitest';
import { BiomeBackground } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

function recorder() {
  const calls: Array<Record<string, unknown>> = [];
  const ctx = {
    save: () => {}, restore: () => {},
    drawImage: (im: unknown, ...a: unknown[]) => calls.push({ op: 'img', tex: (im as { tex?: number }).tex, args: a }),
    fillRect: (...a: unknown[]) => calls.push({ op: 'rect', args: a }),
    fillStyle: '', globalAlpha: 1, imageSmoothingEnabled: true,
      img: (im: unknown, ...a: unknown[]) => calls.push({ op: 'img', tex: (im as { tex?: number }).tex, args: a }),
    fill: (x: number, y: number, w: number, h: number, ...a: unknown[]) => calls.push({ op: 'rect', args: [x, y, w, h, ...a] }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/** 贴图尺寸表:62/64 表面条 160×16;63/65 带体 160×96 */
const SIZES: Record<number, [number, number]> = {
  62: [160, 16], 63: [160, 96], 64: [160, 16], 65: [160, 96],
};

function stubImgs(bg: BiomeBackground) {
  const map = (bg as unknown as { imgs: Map<number, HTMLImageElement | null> }).imgs;
  const orig = (bg as unknown as { img(n: number): HTMLImageElement | null }).img;
  (bg as unknown as { img(n: number): HTMLImageElement | null }).img = (n: number) => {
    const s = SIZES[n];
    if (s) {
      const fake = { tex: n, complete: true, width: s[0], height: s[1], naturalWidth: s[0], naturalHeight: s[1] } as unknown as HTMLImageElement;
      map.set(n, fake);
      return fake;
    }
    return orig.call(bg, -1);
  };
}

/** C# Math.IEEERemainder(IEEE round-half-even)——与实现同式 */
function ieeeRem(a: number, b: number): number {
  const r = a / b, f = Math.floor(r), d = r - f;
  const n = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
  return a - b * n;
}

function deepWorld(): World {
  const w = new World(400, 600, 42, 'ugbg');
  w.groundLevel = 100; w.rockLevel = 200;
  return w;
}

/** 深层相机下地狱多层远景也会画——Node 无 Image,置空缓存(未加载态)防崩 */
function stubHellNull(bg: BiomeBackground): void {
  const m = (bg as unknown as { hellImgs: Map<number, unknown> }).hellImgs;
  for (let n = 0; n <= 13; n++) m.set(n, null);
}

describe('地下背景平铺几何(Main.cs DrawBackground :52217-53517)', () => {
  it('style2(蘑菇)深层:slot3 只用中间 128 列(源 X=16+diff,宽≤128)非整宽 160', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    stubHellNull(bg);
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugStyle = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugOld = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugAlpha = 1;
    const { ctx, calls } = recorder();
    const world = deepWorld();
    const camY = 4600;   // 岩石带深层(rockTP=3264+屏高 < screenY → 深层档;且在 magmaPx=4208 之上,岩石带可见)
    const cam = { x: 3200, y: camY };
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, cam, camY - 400, 1280, 800, 16.7);
    const rock = calls.filter(c => c.op === 'img' && c.tex === 65);
    expect(rock.length).toBeGreaterThan(0);
    // 源窗:全部起点 ≥16 且宽 ≤128(旧实现整宽 160/起点 0 必挂)
    for (const c of rock) {
      const [sx, , sw] = c.args as number[];
      expect(sw).toBeLessThanOrEqual(128);
      expect(sx).toBeGreaterThanOrEqual(8);   // 16+diff,diff∈[-8,8]
      expect(sx + sw).toBeLessThanOrEqual(152);   // 16+diff(≤8)+128
    }
    // 旧实现整宽 160 平铺时会出现宽 160 的调用——恒不出现
    expect(rock.some(c => (c.args as number[])[2] === 160)).toBe(false);
  });

  it('水平滚动:dest X = bgStartX + 128*i + diff(0.88 视差 + 16px 网格对齐,src/dst 同移)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    stubHellNull(bg);
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugStyle = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugOld = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugAlpha = 1;
    const { ctx, calls } = recorder();
    const world = deepWorld();
    const camY = 4600;
    const cam = { x: 3200, y: camY };
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, cam, camY - 400, 1280, 800, 16.7);
    // 期望参数(与实现同式)
    const screenX = cam.x - 1280 / 2;
    const startX = Math.trunc(-ieeeRem(128 + screenX * 0.88, 128) - 64);
    let diff = Math.round(-ieeeRem(startX + screenX, 16));
    if (diff === -8) diff = 8;
    const rock = calls.filter(c => c.op === 'img' && c.tex === 65);
    const firstRowY = (rock[0].args as number[])[5];
    const sameRow = rock.filter(c => (c.args as number[])[5] === firstRowY);
    expect(sameRow.length).toBeGreaterThanOrEqual(Math.trunc(1280 / 128) + 1);
    // 逐列:dest X 序列 = startX + 128*i + diff;源 X - dest 偏移恒 16(源=dest+16)
    for (const c of sameRow) {
      const [sx, , , , dx] = c.args as number[];
      const i = (dx - diff - startX) / 128;
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(sx).toBe(16 + diff);   // 采样窗起点 = 16+diff(中间 128 列,±8 滑动)
    }
    // 16px 网格对齐:dest+screenX ≡ 0 (mod 16)
    for (const c of sameRow) {
      const dx = (c.args as number[])[4];
      expect((dx + screenX) % 16).toBeCloseTo(0, 6);
    }
  });

  it('深层垂直行相位锁定 rockTP(世界锁定):行 Y ≡ rockTP-screenY (mod 96)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    stubHellNull(bg);
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugStyle = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugOld = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugAlpha = 1;
    const { ctx, calls } = recorder();
    const world = deepWorld();
    const camY = 4600;
    const screenY = camY - 400;
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, { x: 3200, y: camY }, screenY, 1280, 800, 16.7);
    // rockTP = 100*16 + ceil((200-100)*16/96)*96 + 32;1600/96=16.67 → 17*96=1632 → 1600+1632+32
    const rockTP = 100 * 16 + 17 * 96 + 32;
    const rock = calls.filter(c => c.op === 'img' && c.tex === 65);
    expect(rock.length).toBeGreaterThan(0);
    const ys = new Set<number>();
    for (const c of rock) ys.add((c.args as number[])[5]);
    // 起始行 = IEEERemainder(bgTopY,96)-96(相位锁定;旧实现屏幕顶锚 -96 恒定必挂)
    const bgTopY = rockTP - screenY;
    const startY = Math.trunc(ieeeRem(bgTopY, 96) - 96);
    expect(ys.has(startY)).toBe(true);
    for (const y of ys) {
      expect((((y - startY) % 96) + 96) % 96).toBe(0);   // 96 步进
      expect(((y + screenY - rockTP) % 96 + 96) % 96).toBe(0);   // 世界锁定
    }
  });

  it('泥土带同相位锁定 dirtTop;slot2/0 条为 16px 单行(带顶-16/地表条)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    stubHellNull(bg);
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugStyle = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugOld = 2;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugAlpha = 1;
    const { ctx, calls } = recorder();
    const world = deepWorld();
    // 浅层:相机在地表附近(泥土带+slot0 表面条可见)
    const camY = 100 * 16 + 60;
    const screenY = camY - 400;
    (bg as unknown as { drawUnderground(c: CanvasRenderingContext2D, w: World, cm: { x: number; y: number }, t: number, vw: number, vh: number, dt: number): void })
      .drawUnderground(ctx, world, { x: 3200, y: camY }, screenY, 1280, 800, 16.7);
    const dirt = calls.filter(c => c.op === 'img' && c.tex === 63);
    expect(dirt.length).toBeGreaterThan(0);
    // 浅层:首行 = dirtTop 原值(非 IEEERemainder 档)
    const dirtTop = 100 * 16 - screenY + 16;
    expect((dirt[0].args as number[])[5]).toBe(dirtTop);
    // slot0 表面条:单行 16px @ dirtTop-16;不向下多铺(旧实现 hHint 32 铺两行)
    const strip0 = calls.filter(c => c.op === 'img' && c.tex === 62);
    expect(strip0.length).toBeGreaterThan(0);
    for (const c of strip0) {
      const [, sy, , , dx, dy, , dh] = c.args as number[];
      expect(sy).toBe(0);
      expect(dh).toBeLessThanOrEqual(16);
      expect(dy).toBe(100 * 16 - 16 - screenY + 16);
    }
  });
});
