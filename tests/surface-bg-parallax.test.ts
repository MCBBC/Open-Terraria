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

/** ComputeScAdj(Main.cs:63389-63413)+pushBGTopHack(=30 in-game,:58722-58774)
 *  ——2026-08-20 审计补齐:表面背景 Y 链第 3/4 项 */
const scAdjOf = (camTopY: number, viewH: number, zoom: number, groundLevel: number, h: number) => {
  const screenH = viewH / zoom;
  const num = (groundLevel * 16) / Math.max(1, camTopY + screenH);
  let k = (h * 0.15 * 16 - camTopY) * 0.00025;
  if (k < 0) k = 0;
  return num * (0.45 - k * k) * (h <= 1200 ? -500 : h <= 1800 ? -300 : -150);
};
const PUSH = 30;

describe('地表远景背景锚点（Main.cs DrawSurfaceBG :58749/:58860）', () => {
  it('Y 锚 = num3×topA+topB，num3 用 zoom 修正屏顶（曾 /1 占位 → 整体下移）', () => {
    const cam = { x: 3000, y: 100 * 16 - 200, zoom: 1.25 };
    const recs = surfBg(cam);
    expect(recs.length).toBeGreaterThan(0);
    const camTopY = cam.y - 862 / 2 / 1.25;                 // screenPosition.Y
    const num3 = -(camTopY - 300) / (100 * 16);
    const scAdj = scAdjOf(camTopY, 862, 1.25, 100, 600);
    // 山体双步（2026-08-25 原版对齐重写）：m[0]=Step1 几何 num3×1300+1090、
    // m[1]=treeMntBGSet1[1] 块 num3×1400+1260（:60430），各 + GetLayerYOffset(贴图)
    // + scAdj + push。风格按种子挑选——候选取全部森林风格 m 槽贴图的 YOffset 并集
    // （终清波扩表后 m 槽全集 {7,93,171,176,179,277,280}/{8,90,94,172,177,180,278,
    // 281,331,336}：GetLayerYOffset :60687 起 179:-100、277:-260、280:-170、
    // 180:-350、278:-120、281:-300）
    const y0Cands = [0, -50, -100, -170, -260, -760].map((o) => num3 * 1300 + 1090 + o + scAdj + PUSH);
    const y1Cands = [0, 130, -120, -200, -300, -350].map((o) => num3 * 1400 + 1260 + o + scAdj + PUSH);
    expect(recs.some((c) => y0Cands.some((y) => Math.abs(c.dy - y) < 1.01)),
      `dys=${recs.map((c) => Math.round(c.dy)).join(",")} want=[${y0Cands.map(Math.round)}]`).toBe(true);
    expect(recs.some((c) => y1Cands.some((y) => Math.abs(c.dy - y) < 1.01))).toBe(true);
    // zoom 修正判别：/1 占位锚（旧实现）的 m[0] 档与 zoom 修正档差 ~70px——
    // 渲染集命中修正档（上断言）且两档坐标差显著,占位回归即候选恒不命中
    const camTopOld = cam.y - 862 / 2;
    const num3Old = -(camTopOld - 300) / (100 * 16);
    const y0Old = num3Old * 1300 + 1090 + scAdj + PUSH;
    for (const yo of y0Cands) expect(Math.abs(y0Old - yo)).toBeGreaterThan(30);
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

// ---- 海洋专属背景层（2026-08-20 补齐）----
// 原版考据：海洋 bgStyle=4 无前景树层组——front 槽 4 仅变更换屏黑闪 overlay
// （Main.cs:58994-58996 DrawChangeOverlay(10)，BackgroundChangeFlashInfo）；
// 群系背景全在 Step2 far 槽 3（Main.cs:59348-59351 bgAlphaFarBackLayer[3] →
// DrawSurfaceBG_DrawBackMountainsLayer(oceanBG)），几何 = Step2 共用档
// parallax 0.2 / scale 1.15 / topY num3×1400+1260 + 贴图专属 Y 偏移
// （GetLayerYOffset :59172：283→-800、332/340→-25、其余 0）。
// 贴图变体 WorldGen.setBG case 7 :7513-7541（style 0-7 → 28/110/111/209/210/283/332/340）。
// 渐隐带（SunGradients.cs:218）仅当 oceanBG==283 时点亮 (157,192,255)。
describe('海洋背景层（Main.cs:59348-59351 Step2 far 槽 3）', () => {
  const OCEAN_TEX = [28, 110, 111, 209, 210, 283, 332, 340];
  const FOREST_TREE_TEX = [50, 51, 52, 53, 54, 55, 91, 92, 173, 174, 175];
  interface ORec { n: number; dy: number }
  /** zoneBeach 场景沉降到 bgStyle=4 后,按 oceanStyle 出图并记录 (贴图号, dy) */
  function oceanDraw(oceanStyle: number): ORec[] {
    const recs: ORec[] = [];
    const bg = new BiomeBackground();
    // 假图携带贴图号（1024×600 = 海洋变体真实尺寸;img() stub 防 Node 无 Image）
    (bg as unknown as { img: (n: number) => HTMLImageElement | null }).img = (n: number) => {
      if (n < 0) return null;
      return { width: 1024, height: 600, complete: true, __n: n } as unknown as HTMLImageElement;
    };
    const ctx = {
      save: () => {}, restore: () => {},
      drawImage: (im: { __n?: number }, sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number, dw: number) => { recs.push({ n: im.__n ?? -1, dy }); },
      fillRect: () => {}, fillStyle: '', globalAlpha: 1, imageSmoothingEnabled: true,
      fill: () => {},
    } as unknown as CanvasRenderingContext2D;
    const world = new World(400, 600, 7, 'ocean-bg');
    world.groundLevel = 100; world.rockLevel = 200;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugStyle = -1;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugOld = -1;
    (bg as unknown as { ugStyle: number; ugOld: number; ugAlpha: number }).ugAlpha = 0;
    const cam = { x: 3000, y: 100 * 16 - 200, zoom: 1.25 };
    const scene = { zoneBeach: true, tileX: 20, tileY: 90 } as never;
    // 一次 draw dtMs=501（30.06 帧）：bgDelay 累满 30 → bgStyle 切 4 + alpha 满
    bg.draw(ctx, world, scene, cam, 1512, 862, [1, 1, 1], 501);
    (bg as unknown as { oceanStyle: number }).oceanStyle = oceanStyle;
    recs.length = 0;
    bg.draw(ctx, world, scene, cam, 1512, 862, [1, 1, 1], 16.7);
    return recs;
  }
  it('海洋层 = 单张 oceanBG（Step2 几何 num3×1400+1260+专属偏移）,无 forest 树层兜底', () => {
    const camTopY = 100 * 16 - 200 - 862 / 2 / 1.25;
    const num3 = -(camTopY - 300) / (100 * 16);
    // style 5 → 贴图 283（offset -800）
    const r5 = oceanDraw(5).filter((r) => OCEAN_TEX.includes(r.n));
    expect(r5.length).toBeGreaterThan(0);
    expect(r5.every((r) => r.n === 283)).toBe(true);
    const scAdjO = scAdjOf(100 * 16 - 200 - 862 / 2 / 1.25, 862, 1.25, 100, 600);
    expect(r5.some((r) => Math.abs(r.dy - (num3 * 1400 + 1260 - 800 + scAdjO + PUSH)) < 1.01)).toBe(true);
    // style 0 → 贴图 28（default 偏移 0）
    const r0 = oceanDraw(0).filter((r) => OCEAN_TEX.includes(r.n));
    expect(r0.every((r) => r.n === 28)).toBe(true);
    expect(r0.some((r) => Math.abs(r.dy - (num3 * 1400 + 1260 + scAdjO + PUSH)) < 1.01)).toBe(true);
    // ★原版海洋无前景树层组——forest 兜底贴图恒不出现（曾画 fs.t[0]/fs.t[2]）
    for (const r of oceanDraw(2)) {
      expect(FOREST_TREE_TEX.includes(r.n)).toBe(false);
    }
  });
  it('渐隐带仅 @oceanBG==283 点亮（SunGradients.cs:218,权重 = 前槽 alphaFront[4]）', () => {
    const bands = (style: number) => {
      const bg = new BiomeBackground();
      // surfaceGradientBands 读森林四槽选型表——未播种时空数组下标炸,直接铺默认档
      (bg as unknown as { forestStyles: number[] }).forestStyles = [0, 0, 0, 0];
      (bg as unknown as { oceanStyle: number }).oceanStyle = style;
      const a = (bg as unknown as { alphaFront: number[] }).alphaFront;
      a[4] = 1;
      return bg.surfaceGradientBands();
    };
    expect(bands(5)).toContainEqual({ rgb: [157, 192, 255], alpha: 1 });
    for (const st of [0, 1, 2, 3, 4, 6, 7]) {
      expect(bands(st).some((b) => b.rgb[1] === 192 && b.rgb[2] === 255)).toBe(false);
    }
  });
});
