// ★IIIII243 生成屏预览面板净带布局单测（纯几何;实机面归 scripts/_iii243-genpreview-layout.mjs 探针）。
// 用户实报:旧布局 vAlign=1/marginBottom=56 把预览面板(本仓自研叠加物)底沿钉在 H-56,
// 与提示条(锚 H-150 字形居中)整段叠压——重排为「进度条绘制下沿 ↔ 提示条字形上沿」净带。
// 几何真值锚(全部 vanilla 对齐位,只读):UIGenProgressBar.SPRITE(Outer_Lower 垂尾到 +106)/
// GameTipsDisplay TipOffsetY=-150+字形半高 17.6/UIHeader top=barTop-70。
// 逻辑屏面锚:720p/1080p/1440p 在 UIScale 公式下同为 1066.67×600(max(min(W/800,H/600),H/1080×1.1))。
import { describe, it, expect } from 'vitest';
import {
  previewBandLayout,
  PREVIEW_BAND,
  type PreviewBandRect,
} from '../src/vui/states/GenWorldPreview';
import { UIGenProgressBar } from '../src/vui/elements/UIGenProgressBar';
import { UIScale } from '../src/vui/draw/UIScale';

/** 小世界预览位图纵横比（4200×1200 → 840×240,fy=fx 保比） */
const ASPECT_SMALL = 1200 / 4200;
/** 中/大世界纵横比（6400×1800/8400×2400 同 ~0.281/0.286） */
const ASPECTS = [ASPECT_SMALL, 1800 / 6400, 2400 / 8400];

const overlap = (a: PreviewBandRect | { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }, eps = 0.51): boolean =>
  a.x < b.x + b.width - eps && a.x + a.width > b.x + eps &&
  a.y < b.y + b.height - eps && a.y + a.height > b.y + eps;

/** 净带两沿（与 previewBandLayout 同公式,此处独立重算作互证） */
const bandEdges = (logicalH: number) => {
  const top = UIGenProgressBar.topForScreenH(logicalH) + UIGenProgressBar.SPRITE.h + PREVIEW_BAND.GAP;
  const bottom = logicalH - PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM - PREVIEW_BAND.TIP_HALF_H - PREVIEW_BAND.GAP;
  return { top, bottom };
};

describe('IIIII243 · 逻辑屏面锚（三档分辨率同面）', () => {
  it('1280×720 / 1920×1080 / 2560×1440 → 同一逻辑面 1066.67×600', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]] as const) {
      UIScale.resize(w, h, 1);
      expect(UIScale.logicalH).toBeCloseTo(600, 6);
      expect(UIScale.logicalW).toBeCloseTo(1066.6667, 3);
    }
    UIScale.resize(800, 600, 1);   // 还原基准,防泄漏到同文件他测
  });
});

describe('IIIII243 · 净带内放行（正常态 band）', () => {
  it('1080p 逻辑面:面板进带(带内垂直居中/水平居中/等比),与 bar sprite、提示条零叠压', () => {
    UIScale.resize(1920, 1080, 1);
    const W = UIScale.logicalW, H = UIScale.logicalH;
    const bar = {
      x: (W - 612) / 2 + UIGenProgressBar.SPRITE.x, y: UIGenProgressBar.topForScreenH(H),
      width: UIGenProgressBar.SPRITE.w, height: UIGenProgressBar.SPRITE.h,
    };
    for (const aspect of ASPECTS) {
      const g = previewBandLayout({ logicalW: W, logicalH: H, aspect });
      expect(g.mode).toBe('band');
      const edges = bandEdges(H);
      // 等比 + 带内
      expect(g.height).toBeCloseTo(g.width * aspect, 9);
      expect(g.y).toBeGreaterThanOrEqual(edges.top - 1e-9);
      expect(g.y + g.height).toBeLessThanOrEqual(edges.bottom + 1e-9);
      // 水平居中
      expect(g.x + g.width / 2).toBeCloseTo(W / 2, 9);
      // 与进度条绘制外沿零叠压（垂尾 +106 计入）
      expect(overlap(g, bar)).toBe(false);
      // 与提示条字形域(锚 H-150 worst-case 两行)零叠压
      const tip = { x: 0, y: H - 150 - PREVIEW_BAND.TIP_HALF_H, width: W, height: PREVIEW_BAND.TIP_HALF_H * 2 };
      expect(overlap(g, tip)).toBe(false);
      // 与标题域(barTop-70 起,高 32=16×scale2)零叠压
      const header = { x: 0, y: UIGenProgressBar.topForScreenH(H) - 70, width: W, height: 32 };
      expect(overlap(g, header)).toBe(false);
    }
  });

  it('三档分辨率同断言(缩放无关——逻辑面恒等,几何逐值相同)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]] as const) {
      UIScale.resize(w, h, 1);
      const W = UIScale.logicalW, H = UIScale.logicalH;
      const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
      const edges = bandEdges(H);
      expect(g.y).toBeCloseTo(edges.top, 9);            // 带高等比吃满 → 顶=带顶
      expect(g.y + g.height).toBeCloseTo(edges.bottom, 9);
      expect(g.width).toBeCloseTo((edges.bottom - edges.top) / ASPECT_SMALL, 9);
    }
    UIScale.resize(800, 600, 1);
  });

  it('超宽矮条(aspect 小于 带高/naturalW)保自然宽 520,带内垂直居中', () => {
    UIScale.resize(1920, 1080, 1);
    const W = UIScale.logicalW, H = UIScale.logicalH;
    const aspect = 0.04;                                 // 比 520×0.04=20.8 < 带高 40.4 更矮
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect });
    expect(g.mode).toBe('band');
    expect(g.width).toBeCloseTo(PREVIEW_BAND.MAX_W, 9);
    const edges = bandEdges(H);
    expect(g.y).toBeGreaterThan(edges.top);              // 带内垂直居中(不顶带)
    expect(g.y + g.height).toBeLessThan(edges.bottom);
    UIScale.resize(800, 600, 1);
  });
});

describe('IIIII243 · 宽不足按宽缩放（窄屏）', () => {
  it('竖屏 390×844:自然宽 214.5 为钳,带内居中', () => {
    const W = 390, H = 844;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    const edges = bandEdges(H);
    expect(g.mode).toBe('band');
    expect(g.width).toBeCloseTo(Math.min(W * PREVIEW_BAND.WIDTH_FRAC, PREVIEW_BAND.MAX_W), 9);
    expect(g.x).toBeCloseTo((W - g.width) / 2, 9);
    expect(g.y).toBeGreaterThanOrEqual(edges.top - 1e-9);
    expect(g.y + g.height).toBeLessThanOrEqual(edges.bottom + 1e-9);
  });
});

describe('IIIII243 · 极矮屏兜底（floor 贴底）', () => {
  it('800×500(净带塌缩 -59.6):贴净带下沿放 28 最小条,y≥0,水平居中', () => {
    const W = 800, H = 500;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    expect(g.mode).toBe('floor');
    const edges = bandEdges(H);
    expect(edges.bottom - edges.top).toBeLessThan(PREVIEW_BAND.MIN_BAND_H);
    expect(g.height).toBeCloseTo(PREVIEW_BAND.MIN_BAND_H, 9);
    expect(g.width).toBeCloseTo(PREVIEW_BAND.MIN_BAND_H / ASPECT_SMALL, 9);
    expect(g.y + g.height).toBeCloseTo(edges.bottom, 9);   // 贴底=净带下沿(提示条字形上沿-8)
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width / 2).toBeCloseTo(W / 2, 9);
  });

  it('荒谬矮窗(H=180):贴底被 y≥0 钳住,不出屏', () => {
    const g = previewBandLayout({ logicalW: 800, logicalH: 180, aspect: ASPECT_SMALL });
    expect(g.mode).toBe('floor');
    expect(g.y).toBe(0);                                  // bandBottom-28 < 0 → 钳 0
    expect(g.y + g.height).toBeLessThanOrEqual(180);
  });

  it('未知 aspect(≤0)不炸:floor 零宽或最小条', () => {
    for (const aspect of [0, -1, NaN]) {
      const g = previewBandLayout({ logicalW: 1066.6667, logicalH: 600, aspect });
      expect(Number.isFinite(g.x) && Number.isFinite(g.y)).toBe(true);
      expect(g.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('IIIII243 · 全 H 扫描不变量(400..1200 步 25)', () => {
  it('任意 H:面板在屏内、mode=band 时与 bar 外沿/提示条字形域零叠压', () => {
    const W = 1066.6667;
    for (let H = 400; H <= 1200; H += 25) {
      for (const aspect of ASPECTS) {
        const g = previewBandLayout({ logicalW: W, logicalH: H, aspect });
        expect(g.width).toBeGreaterThanOrEqual(0);
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.x + g.width).toBeLessThanOrEqual(W + 1e-9);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.y + g.height).toBeLessThanOrEqual(H + 1e-9);
        const bar = {
          x: (W - 612) / 2 + UIGenProgressBar.SPRITE.x, y: UIGenProgressBar.topForScreenH(H),
          width: UIGenProgressBar.SPRITE.w, height: UIGenProgressBar.SPRITE.h,
        };
        const tip = { x: 0, y: H - 150 - PREVIEW_BAND.TIP_HALF_H, width: W, height: PREVIEW_BAND.TIP_HALF_H * 2 };
        if (g.mode === 'band') {
          expect(overlap(g, bar)).toBe(false);
          expect(overlap(g, tip)).toBe(false);
        } else {
          // floor 只承诺贴底(提示条上方)与不出屏;极矮屏允许吃进 bar 域(净带已塌)
          expect(g.y + g.height).toBeCloseTo(Math.min(bandEdges(H).bottom, H), 9);
        }
      }
    }
  });
});

describe('IIIII243 · 常量钉值(几何真值漂移即爆红)', () => {
  it('GAP=8 / 提示条锚 150 / 字形半高 17.6 / MIN_BAND_H=28 / 自然宽 0.55∩520', () => {
    expect(PREVIEW_BAND.GAP).toBe(8);
    expect(PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM).toBe(150);   // GameTipsDisplay.TipOffsetY
    expect(PREVIEW_BAND.TIP_HALF_H).toBeCloseTo((2 * 16 * 1.1) / 2, 9);
    expect(PREVIEW_BAND.MIN_BAND_H).toBe(28);
    expect(PREVIEW_BAND.WIDTH_FRAC).toBe(0.55);
    expect(PREVIEW_BAND.MAX_W).toBe(520);
    expect(UIGenProgressBar.SPRITE).toEqual({ x: -8, y: 0, w: 620, h: 106 });   // Outer 620×70@(-8,0) ∪ Lower 532×46@(+36,+60)
  });

  it('净带与旧布局的差异锚:1080p 旧底沿 H-56 → 新底沿 = 净带下沿(提示条字形上沿-8)', () => {
    UIScale.resize(1920, 1080, 1);
    const H = UIScale.logicalH;
    const g = previewBandLayout({ logicalW: UIScale.logicalW, logicalH: H, aspect: ASPECT_SMALL });
    expect(g.y + g.height).toBeCloseTo(H - 150 - PREVIEW_BAND.TIP_HALF_H - PREVIEW_BAND.GAP, 9);
    expect(g.y + g.height).toBeLessThan(H - 56 - 1);   // 与旧底沿至少差 1px(实际 ~76px)
    UIScale.resize(800, 600, 1);
  });
});
