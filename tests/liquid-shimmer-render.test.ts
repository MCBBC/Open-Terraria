// 微光渲染探针（VanillaLiquidRenderer sparkle 黑底 + 表层彩虹条回归，2026-08-12）。
// 用户实测两问题：
//  ① sparkle 星点闪烁贴图带黑色背景 → 根因 = 原版 PNG 的 sparkle 带本身就是
//    【黑底不透明】灰度加色闪纹（alpha=255 的纯黑占 66%），multiply/直画都会把
//     黑底当实心像素。修法 = tintSparkleBand 以亮度重造 alpha（黑→透明）。
//  ② 表层缺"彩虹条" → 根因 = sparkle 源 Y 误用基底层强制切的 1280，而原版
//    :716 在 sparkle 前把 sourceRectangle 重置回原始值（sy），表面格 sparkle
//    几乎全越界跳过。修法 = shimmerSparkleSource(sx, sy, fr)。
// 断言全部基于真实素材像素（pngjs 直读 public/sprites/vanilla/Misc_water_14.png）
// 与导出的纯函数，不依赖 DOM（vitest node 环境）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// pngjs 无类型声明（同 scripts/*.mjs 的既有用法，仅本像素探针在 ts 侧引用）
// @ts-ignore
import { PNG } from 'pngjs';
import { tintSparkleBand, shimmerSparkleSource, shimmerSparkleGate, shimmerGlitterHue } from '../src/render/VanillaLiquidRenderer';

const TEX = PNG.sync.read(
  readFileSync(join(__dirname, '..', 'public', 'sprites', 'vanilla', 'Misc_water_14.png')));

/** 取 (x,y) 的 [r,g,b,a]（未乘 alpha 直读 PNG） */
function px(x: number, y: number): [number, number, number, number] {
  const i = (y * TEX.width + x) * 4;
  return [TEX.data[i], TEX.data[i + 1], TEX.data[i + 2], TEX.data[i + 3]];
}

describe('① sparkle 黑底根因与亮度→alpha 重造', () => {
  it('素材事实：sparkle 带（X∈[48,96)）是纯灰度且黑底不透明（=必须重造 alpha）', () => {
    expect(TEX.width).toBe(144);
    expect(TEX.height).toBe(1360); // 17 行 × 80px 动画带
    let opaqueBlack = 0, opaqueTotal = 0, maxChannelDelta = 0;
    for (let y = 0; y < 1280; y++) {
      for (let x = 48; x < 96; x++) {
        const [r, g, b, a] = px(x, y);
        if (a === 255) {
          opaqueTotal++;
          if (r < 30 && g < 30 && b < 30) opaqueBlack++;
        }
        maxChannelDelta = Math.max(maxChannelDelta,
          Math.max(r, g, b) - Math.min(r, g, b));
      }
    }
    // 纯灰度：三通道差恒 0 → 亮度即像素值，亮度→alpha 是无损重造
    expect(maxChannelDelta).toBe(0);
    // 黑底不透明占比 > 50%：若不重造 alpha，一半以上面积画成黑/彩黑块
    expect(opaqueBlack / opaqueTotal).toBeGreaterThan(0.5);
  });

  it('tintSparkleBand：黑底 → alpha 0（透明），亮斑保留强度并染成彩虹色', () => {
    // 取一个 16×16 sparkle 帧（X 48-63, Y 0-15）灌进重造函数
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const [r, g, b, a] = px(48 + x, y);
        const i = (y * 16 + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
      }
    }
    tintSparkleBand(data, 200, 40, 120);
    let transparent = 0, tinted = 0, alphaMismatch = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const src = px(48 + x, y);
        const lum = src[0] * 0.299 + src[1] * 0.587 + src[2] * 0.114;
        const i = (y * 16 + x) * 4;
        if (Math.abs(data[i + 3] - lum) > 0.5) alphaMismatch++;
        if (data[i + 3] === 0) transparent++;
        else if (data[i] === 200 && data[i + 1] === 40 && data[i + 2] === 120) tinted++;
        expect(data[i + 3]).toBeLessThanOrEqual(255);
      }
    }
    expect(alphaMismatch).toBe(0);          // alpha = 亮度 1:1
    expect(transparent).toBeGreaterThan(100); // 大面积黑底归零
    expect(tinted).toBeGreaterThan(50);      // 亮斑全数染色
  });
});

describe('② 表层 sparkle 源 Y（DrawShimmer :716-721 重置语义）', () => {
  it('表面格（fx=16,fy=0 → 原始 sy=0）sparkle 取原始 sy 带：全 16 帧都在贴图内', () => {
    for (let fr = 0; fr < 16; fr++) {
      const [sSrcX, sSrcY] = shimmerSparkleSource(16, 0, fr);
      expect(sSrcX).toBe(64);                    // sx+48
      expect(sSrcY).toBe(fr * 80);               // 原始 sy(=0) + 80×fr，不再叠加 1280
      expect(sSrcY + 16).toBeLessThanOrEqual(TEX.height); // 越界 = 彩虹条消失的旧回归
    }
  });

  it('非表面格（fy=48 内角变体）同样走原始 sy 带，不混入动画帧基线', () => {
    const [sSrcX, sSrcY] = shimmerSparkleSource(0, 48, 7);
    expect(sSrcX).toBe(48);
    expect(sSrcY).toBe(48 + 7 * 80); // 608 < 1280 ✓
  });

  it('素材事实：Y=1280 表面带 = 中列纯白 16×16 块（基底层 1:1 切源依据）', () => {
    for (let y = 1280; y < 1296; y++) {
      for (let x = 16; x < 32; x++) {
        expect(px(x, y)).toEqual([255, 255, 255, 255]); // 纯白块 × baseColor 波色
      }
    }
    // 带内其余区域全透明：切源不会带出杂边
    let stray = 0;
    for (let y = 1280; y < 1360; y++) {
      for (let x = 0; x < 48; x++) {
        if (x >= 16 && x < 32 && y < 1296) continue;
        if (px(x, y)[3] > 0) stray++;
      }
    }
    expect(stray).toBe(0);
  });
});

// ---- ③ FX61（2026-09-17）：sparkle 绘制门 De Morgan 回归 + 彩虹相位直方图 ----
// 用户实报"微光液面顶缘缺原版彩虹渐变线"。根因 = 门误写 !(A||B)（≡A∧B），
// 表层格 (sx=16, sy=0) 被判成 body → sparkle 退化棋盘格×噪声微闪。标杆 =
// LiquidRenderer.cs:717 `sourceRectangle.X != 16 || sourceRectangle.Y % 80 != 48`。
describe('③ FX61 sparkle 绘制门（:717 De Morgan 直译）', () => {
  // 独立参照实现（与 src 内实现零共享，防同源盲区）
  const ref = (sx: number, sy: number): boolean => sx !== 16 || sy % 80 !== 48;

  it('回归钉：表层格 (16,0) 必须 top=true（常驻 0.5 glitter = 彩虹条的载体）', () => {
    expect(shimmerSparkleGate(16, 0)).toBe(true);
  });

  it('真值表全扫：参照式 (X!==16 || Y%80!==48) 逐对同值（body 内部格 (16,48) 恒 false）', () => {
    expect(shimmerSparkleGate(16, 48)).toBe(false);   // 满格内部态 = 唯一 false
    for (const sx of [0, 4, 16, 32, 48, 64, 96, 140]) {
      for (const sy of [0, 4, 16, 32, 47, 48, 49, 64, 128, 1280]) {
        expect(shimmerSparkleGate(sx, sy)).toBe(ref(sx, sy));
      }
    }
  });

  it('彩虹相位（:768）：参照式同值 + 相邻液面格相位差 ≈1/6（逐格彩虹渐变）+ 180s 整周期', () => {
    const refHue = (x: number, y: number, t: number): number =>
      ((((x + y / 6)) + t / 30) / 6) % 1;
    for (const [x, y, t] of [[0, 0, 0], [100, 200, 600], [3333, 471, 12345]] as const) {
      expect(shimmerGlitterHue(x, y, t)).toBeCloseTo(refHue(x, y, t), 10);
    }
    // 空间渐变：同一时刻液面行相邻格 hue 差 = 1/6（模 1）
    const h0 = shimmerGlitterHue(500, 300, 1000);
    const h1 = shimmerGlitterHue(501, 300, 1000);
    const d = ((h1 - h0) % 1 + 1) % 1;
    expect(Math.abs(d - 1 / 6)).toBeLessThan(1e-9);
    // 时间漂移：Δt=180s → 相位整退一周期（同格同色回绕）
    expect(shimmerGlitterHue(500, 300, 1000))
      .toBeCloseTo(shimmerGlitterHue(500, 300, 1000 + 180 * 60), 6);
  });

  it('彩虹多色相存在判据（desert-style4 直方图指纹法）：空间 6 格一整周期彩虹 + 时间轴 16 档全可达', () => {
    const STEPS = 16;
    const hueIdx = (x: number, y: number, t: number): number =>
      ((Math.floor(shimmerGlitterHue(x, y, t) * STEPS) % STEPS) + STEPS) % STEPS;
    // 空间率 1:1（:768 空间项 /6）：相邻格 hue 步进 1/6（≈60°）→ 每 6 格回绕一整圈
    // = 液面顶缘逐格红→绿→蓝循环（用户截图的彩虹渐变带）；32 格行 ≥5 个整周期。
    // 顶点色在原版为 GPU 连续插值（Canvas 口 16 档量化下整格采样每周期 6 档）
    const h0 = shimmerGlitterHue(500, 300, 9000);
    const h6 = shimmerGlitterHue(506, 300, 9000);
    expect(Math.abs((h6 - h0) % 1)).toBeLessThan(1e-9);
    const row = new Set<number>();
    for (let x = 0; x < 32; x++) row.add(hueIdx(x, 300, 9000));
    expect(row.size).toBeGreaterThanOrEqual(6);
    // 时间轴：dHue/d帧 = 1/180 → 180 帧（3s）一个整周期，逐帧扫 16 档全可达
    // （漂移彩虹；60 帧步长 = 每步 1/3 周期会走样成 3 档）
    const col = new Set<number>();
    for (let t = 0; t < 180; t++) col.add(hueIdx(300, 300, t));
    expect(col.size).toBe(STEPS);
  });
});
