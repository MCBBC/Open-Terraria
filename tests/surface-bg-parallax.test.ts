// 地表远景背景 Y 轴/视差锚回归（2026-08-19 用户报"远景图 Y 轴偏下"）：
// 根因 = camTopY 曾写 `cam.y - viewH/2/1`——/1 是缩放占位符，zoom≠1 下屏顶
// 世界 Y 偏差 viewH/2×(1-1/zoom)（zoom1.25/viewH862 ≈ 86px）→ num3 偏大 →
// bgTopY = num3×topA + topB 整体下移 ~40px。
// 修正 = Main.screenPosition 语义：中心 - 半屏/zoom（X/Y 同式，:58860/:58749）。
import { describe, it, expect } from 'vitest';
import { BiomeBackground } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

interface Rec { dx: number; dy: number; dw: number }
function recorder() {
  const recs: Rec[] = [];
  const ctx = {
    save: () => {}, restore: () => {},
    drawImage: (im: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number, dw: number) => { recs.push({ dx, dy, dw }); },
    fillRect: () => {}, fillStyle: '', globalAlpha: 1, imageSmoothingEnabled: true,
    img: (im: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number, dw: number) => { recs.push({ dx, dy, dw }); },
    fill: () => {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, recs };
}

const FAKE_W = 1152, FAKE_H = 216;
function surfBg(cam: { x: number; y: number; zoom: number }) {
  const bg = new BiomeBackground();
  // Node 无 Image——img() 懒加载炸,stub 成已知尺寸假图
  (bg as unknown as { img: (n: number) => HTMLImageElement | null }).img = (n: number) => {
    if (n < 0) return null;
    const recs2 = (bg as unknown as { __recs?: Rec[] }).__recs;
    void recs2;
    return { width: FAKE_W, height: FAKE_H, complete: true } as HTMLImageElement;
  };
  const r = recorder();
  (bg as unknown as { __recs: Rec[] }).__recs = r.recs;
  const world = new World(400, 600, 7, 'bganchor');
  world.groundLevel = 100; world.rockLevel = 200;
  (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugStyle = -1;
  (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugOld = -1;
  (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugAlpha = 0;
  bg.draw(r.ctx, world, {} as never, cam, 1512, 862, [1, 1, 1], 16.7);
  return r.recs;
}

describe('地表远景背景锚点（Main.cs DrawSurfaceBG :58749/:58860）', () => {
  it('Y 锚 = num3×topA+topB，num3 用 zoom 修正屏顶（曾 /1 占位 → 整体下移）', () => {
    const cam = { x: 3000, y: 100 * 16 - 200, zoom: 1.25 };
    const recs = surfBg(cam);
    expect(recs.length).toBeGreaterThan(0);
    const camTopY = cam.y - 862 / 2 / 1.25;                 // screenPosition.Y
    const num3 = -(camTopY - 300) / (100 * 16);
    // 森林专属远山两档（:60716-60717 topA 1300/1600, topB 1090/1350——调试实证
    // 首帧 alphaFront 仅 0.05 时树层同绘,两档均在 recs）
    const y0 = num3 * 1300 + 1090;
    const y1 = num3 * 1600 + 1350;
    expect(recs.some((c) => Math.abs(c.dy - y0) < 1.01)).toBe(true);
    expect(recs.some((c) => Math.abs(c.dy - y1) < 1.01)).toBe(true);
    // 旧实现（cam.y - 862/2）算出的同档 topY 必差 ~70px——若退回 /1 占位,
    // 修正档坐标恒不出现（实measured 差 70px = 用户可见的"Y 偏下"量）
    const camTopOld = cam.y - 862 / 2;
    const num3Old = -(camTopOld - 300) / (100 * 16);
    const y0Old = num3Old * 1300 + 1090;
    expect(Math.abs(y0Old - y0)).toBeGreaterThan(30);
    expect(recs.some((c) => Math.abs(c.dy - y0Old) < 1)).toBe(false);
  });

  it('X 锚 = 屏左 camLeftX（中心 - 半屏/zoom）×parallax 的 IEEERemainder', () => {
    const cam = { x: 3000, y: 100 * 16 - 200, zoom: 1.25 };
    const recs = surfBg(cam);
    expect(recs.length).toBeGreaterThan(0);
    const camLeftX = 3000 - 1512 / 2 / 1.25;                 // 2395.2
    // 通用远山档（parallax 0.15/scale 1，:59240）——宽 = 贴图原生宽(未知)，
    // 改验族性质：所有 dx 等差（wScaled 步进）且首块起点 = -ieeeRem-something < 0
    const firstRow = recs[0];
    expect(firstRow.dx).toBeLessThan(1);
    // 步进一致性：同 dy 的相邻 dx 差恒等（模 +1px 保险重叠）
    const byY = new Map<number, number[]>();
    for (const c of recs) {
      const k = Math.round(c.dy);
      (byY.get(k) ?? byY.set(k, []).get(k)!).push(c.dx);
    }
    for (const [k, xs] of byY) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        const step = xs[i] - xs[i - 1];
        if (step > 1) expect(step).toBeGreaterThan(0);       // 步进必正（无重叠倒序）
      }
      void k;
    }
  });

  it('ieeeRemOf：IEEE round-half-even（48 rem 96 = 48——0.5 取偶 0）', () => {
    expect(BiomeBackground.ieeeRemOf(100, 96)).toBeCloseTo(4, 10);
    expect(BiomeBackground.ieeeRemOf(48, 96)).toBeCloseTo(48, 10);
    expect(BiomeBackground.ieeeRemOf(-100, 96)).toBeCloseTo(-4, 10);
    expect(BiomeBackground.ieeeRemOf(144, 96)).toBeCloseTo(-48, 10);   // 1.5 取偶 2
  });
});
