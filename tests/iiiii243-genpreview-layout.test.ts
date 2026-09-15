// ★IIIII243/IIIII258 生成屏预览面板布局单测（纯几何;实机面归 scripts/_iii258-verify.mjs 探针）。
// IIII243 史实：旧布局 vAlign=1/marginBottom=56 把预览面板(本仓自研叠加物)底沿钉在 H-56,
// 与提示条(锚 H-150 字形居中)整段叠压——当时改为「等比缩放进进度条↔提示条净带」。
// IIII258 回归（用户实报 ≈2000×1184 视口面板仅 279×80 CSS 不可读）：该净带在桌面
// UIScale 公式下恒 40.4 逻辑 px（aspect≥4/3 窗口 logicalH≡600），与 CSS 分辨率无关
// ——分辨率越高 scale 越大,面板视觉占比反而越小。策略反转：**自然尺寸优先,缩放是
// 最后手段**——面板放进全屏最大净空带（标题上方 top / 提示条下方 bottom 择优）,
// 极矮屏 floor 贴屏底。
// 几何真值锚(全部 vanilla 对齐位,只读):UIGenProgressBar.SPRITE(Outer_Lower 垂尾到 +106)/
// UIHeader top=barTop-70 高 32/GameTipsDisplay TipOffsetY=-150+字形半高 17.6(两行 worst-case)。
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

/** vanilla 对齐位域（与 previewBandLayout 同公式,此处独立重算作互证） */
const anchors = (logicalW: number, logicalH: number) => {
  const barTop = UIGenProgressBar.topForScreenH(logicalH);
  return {
    barTop,
    header: { x: 0, y: barTop - PREVIEW_BAND.HEADER_ABOVE_BAR, width: logicalW, height: 32 },
    bar: {
      x: (logicalW - 612) / 2 + UIGenProgressBar.SPRITE.x, y: barTop,
      width: UIGenProgressBar.SPRITE.w, height: UIGenProgressBar.SPRITE.h,
    },
    tips: {
      x: 0, y: logicalH - PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM - PREVIEW_BAND.TIP_HALF_H,
      width: logicalW, height: PREVIEW_BAND.TIP_HALF_H * 2,
    },
    /** top 候选带两沿（提示条字形不探入的常态档） */
    topBand: {
      top: PREVIEW_BAND.EDGE_MARGIN,
      bottom: Math.min(barTop - PREVIEW_BAND.HEADER_ABOVE_BAR - PREVIEW_BAND.GAP, logicalH - PREVIEW_BAND.EDGE_MARGIN),
    },
  };
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

describe('IIIII258 · 桌面常态：自然尺寸进标题上方 top 带', () => {
  it('1080p 逻辑面:面板吃满自然宽 520,与标题/进度条/提示条零叠压,水平居中', () => {
    UIScale.resize(1920, 1080, 1);
    const W = UIScale.logicalW, H = UIScale.logicalH;
    const an = anchors(W, H);
    for (const aspect of ASPECTS) {
      const g = previewBandLayout({ logicalW: W, logicalH: H, aspect });
      expect(g.mode).toBe('top');
      // 自然尺寸优先：宽 = min(55%W, 520) = 520（带高 184 足容 520×aspect）
      expect(g.width).toBeCloseTo(PREVIEW_BAND.MAX_W, 9);
      expect(g.height).toBeCloseTo(PREVIEW_BAND.MAX_W * aspect, 9);
      // 水平居中 + top 带内垂直居中
      expect(g.x + g.width / 2).toBeCloseTo(W / 2, 9);
      expect(g.y).toBeGreaterThanOrEqual(an.topBand.top - 1e-9);
      expect(g.y + g.height).toBeLessThanOrEqual(an.topBand.bottom + 1e-9);
      // vanilla 对齐位零叠压（标题/进度条绘制外沿/提示条字形域）
      expect(overlap(g, an.header)).toBe(false);
      expect(overlap(g, an.bar)).toBe(false);
      expect(overlap(g, an.tips)).toBe(false);
      // 完整在屏
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x + g.width).toBeLessThanOrEqual(W + 1e-9);
      expect(g.y + g.height).toBeLessThanOrEqual(H + 1e-9);
    }
    UIScale.resize(800, 600, 1);
  });

  it('三档分辨率同断言(缩放无关——逻辑面恒等,几何逐值相同)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]] as const) {
      UIScale.resize(w, h, 1);
      const W = UIScale.logicalW, H = UIScale.logicalH;
      const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
      expect(g.mode).toBe('top');
      expect(g.width).toBeCloseTo(520, 9);
      expect(g.height).toBeCloseTo(520 * ASPECT_SMALL, 9);
      expect(g.x).toBeCloseTo((W - 520) / 2, 9);
      expect(g.y).toBeCloseTo(PREVIEW_BAND.EDGE_MARGIN + (184 - 520 * ASPECT_SMALL) / 2, 6);
    }
    UIScale.resize(800, 600, 1);
  });

  it('★IIIII258 回归锚:同面旧净带策略 141.4×40.4 → 新 520×148.6(面积 ≥6×,可读)', () => {
    const W = 1066.6667, H = 600;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    // IIII243 净带几何复盘：band=[barTop+106+8, H-150-17.6-8] → 高 40.4,宽=带高/aspect=141.4
    const oldW = (H - 150 - PREVIEW_BAND.TIP_HALF_H - PREVIEW_BAND.GAP - (270 + 106 + PREVIEW_BAND.GAP)) / ASPECT_SMALL;
    expect(oldW).toBeCloseTo(141.4, 1);
    expect(g.width / oldW).toBeGreaterThanOrEqual(3);          // 宽 ≥3×(520/141.4≈3.68)
    expect(g.width * g.height).toBeGreaterThanOrEqual(oldW * (oldW * ASPECT_SMALL) * 6);   // 面积 ≥6×(实际 6.56×)
  });

  it('超宽矮条(aspect 极小)保自然宽 520,带内垂直居中', () => {
    UIScale.resize(1920, 1080, 1);
    const W = UIScale.logicalW, H = UIScale.logicalH;
    const aspect = 0.04;                                 // 520×0.04=20.8 ≪ 带高 184
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect });
    expect(g.mode).toBe('top');
    expect(g.width).toBeCloseTo(PREVIEW_BAND.MAX_W, 9);
    expect(g.y).toBeGreaterThan(PREVIEW_BAND.EDGE_MARGIN);              // 带内垂直居中(不顶带)
    expect(g.y + g.height).toBeLessThan(H / 2);
    UIScale.resize(800, 600, 1);
  });
});

describe('IIIII258 · 宽不足按宽缩放（窄屏）', () => {
  it('竖屏 390×844:自然宽 214.5 为钳,top 带内居中', () => {
    const W = 390, H = 844;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    const an = anchors(W, H);
    expect(g.mode).toBe('top');
    expect(g.width).toBeCloseTo(Math.min(W * PREVIEW_BAND.WIDTH_FRAC, PREVIEW_BAND.MAX_W), 9);
    expect(g.x).toBeCloseTo((W - g.width) / 2, 9);
    expect(g.y).toBeGreaterThanOrEqual(an.topBand.top - 1e-9);
    expect(g.y + g.height).toBeLessThanOrEqual(an.topBand.bottom + 1e-9);
    expect(overlap(g, an.header)).toBe(false);
    expect(overlap(g, an.bar)).toBe(false);
    expect(overlap(g, an.tips)).toBe(false);
  });
});

describe('IIIII258 · 矮窗降级链（top 不可用 → bottom → floor）', () => {
  it('800×500(IIIII243 时代净带塌缩走 floor 98×28):现在 top 带照常放 440×125.7', () => {
    const W = 800, H = 500;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    const an = anchors(W, H);
    expect(g.mode).toBe('top');
    expect(g.width).toBeCloseTo(Math.min(W * PREVIEW_BAND.WIDTH_FRAC, PREVIEW_BAND.MAX_W), 9);
    expect(g.height).toBeCloseTo(g.width * ASPECT_SMALL, 9);
    expect(overlap(g, an.header)).toBe(false);
    expect(overlap(g, an.bar)).toBe(false);
    expect(overlap(g, an.tips)).toBe(false);
  });

  it('H=300(提示条字形探进 top 带且剩余放不下):floor 贴屏底最小条,y≥0,不压提示条', () => {
    const W = 800, H = 300;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    const an = anchors(W, H);
    expect(g.mode).toBe('floor');
    expect(g.height).toBeCloseTo(PREVIEW_BAND.MIN_BAND_H, 9);
    expect(g.width).toBeCloseTo(PREVIEW_BAND.MIN_BAND_H / ASPECT_SMALL, 9);
    expect(g.y + g.height).toBeCloseTo(H - PREVIEW_BAND.EDGE_MARGIN, 9);   // 贴屏底(边距 8)
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width / 2).toBeCloseTo(W / 2, 9);
    expect(overlap(g, an.tips)).toBe(false);          // floor 最低承诺:不压提示条字形域+不出屏
    expect(g.y + g.height).toBeLessThanOrEqual(H);
  });

  it('H=180(提示条在顶、bar 出屏):top 带在提示条字形之下让位后仍放 407×116.4', () => {
    const W = 800, H = 180;
    const g = previewBandLayout({ logicalW: W, logicalH: H, aspect: ASPECT_SMALL });
    const an = anchors(W, H);
    expect(g.mode).toBe('top');
    expect(g.y).toBeCloseTo(H - PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM + PREVIEW_BAND.TIP_HALF_H + PREVIEW_BAND.GAP, 9);
    expect(g.y + g.height).toBeCloseTo(H - PREVIEW_BAND.EDGE_MARGIN, 9);
    expect(overlap(g, an.tips)).toBe(false);
    expect(g.y).toBeGreaterThanOrEqual(0);
  });

  it('未知 aspect(≤0)不炸:floor 零高或最小条,坐标有限', () => {
    for (const aspect of [0, -1, NaN]) {
      const g = previewBandLayout({ logicalW: 1066.6667, logicalH: 600, aspect });
      expect(Number.isFinite(g.x) && Number.isFinite(g.y)).toBe(true);
      expect(g.height).toBeGreaterThanOrEqual(0);
      expect(g.mode).toBe('floor');
    }
  });
});

describe('IIIII258 · 全 H 扫描不变量(200..1200 步 25)', () => {
  it('任意 H:面板在屏内;mode=top/bottom 时与标题/bar 外沿/提示条字形域零叠压;floor 贴底不压提示条', () => {
    const W = 1066.6667;
    for (let H = 200; H <= 1200; H += 25) {
      for (const aspect of ASPECTS) {
        const g = previewBandLayout({ logicalW: W, logicalH: H, aspect });
        expect(g.width).toBeGreaterThanOrEqual(0);
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.x + g.width).toBeLessThanOrEqual(W + 1e-9);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.y + g.height).toBeLessThanOrEqual(H + 1e-9);
        const an = anchors(W, H);
        expect(overlap(g, an.tips)).toBe(false);       // 全模式最低承诺:提示条字形域零叠压
        if (g.mode === 'top' || g.mode === 'bottom') {
          expect(overlap(g, an.header)).toBe(false);
          expect(overlap(g, an.bar)).toBe(false);
          expect(g.height).toBeGreaterThanOrEqual(PREVIEW_BAND.MIN_BAND_H - 1e-9);
        } else {
          // floor 只承诺贴屏底(边距内)+不出屏+不压提示条;极矮窗允许吃进 bar 域(净空已塌)
          expect(g.y + g.height).toBeCloseTo(Math.min(H - PREVIEW_BAND.EDGE_MARGIN, H), 9);
        }
      }
    }
  });
});

describe('IIIII258 · 常量钉值(几何真值漂移即爆红)', () => {
  it('GAP=8 / 提示条锚 150 / 字形半高 17.6 / 标题位 70 / MIN_BAND_H=28 / 自然宽 0.55∩520', () => {
    expect(PREVIEW_BAND.GAP).toBe(8);
    expect(PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM).toBe(150);   // GameTipsDisplay.TipOffsetY
    expect(PREVIEW_BAND.TIP_HALF_H).toBeCloseTo((2 * 16 * 1.1) / 2, 9);
    expect(PREVIEW_BAND.HEADER_ABOVE_BAR).toBe(70);          // UIWorldLoadState 构造位 header.top=barTop-70
    expect(PREVIEW_BAND.MIN_BAND_H).toBe(28);
    expect(PREVIEW_BAND.WIDTH_FRAC).toBe(0.55);
    expect(PREVIEW_BAND.MAX_W).toBe(520);
    expect(UIGenProgressBar.SPRITE).toEqual({ x: -8, y: 0, w: 620, h: 106 });   // Outer 620×70@(-8,0) ∪ Lower 532×46@(+36,+60)
  });

  it('策略差异锚:1080p 旧净带底沿=提示条字形上沿-8(面板 40.4 高) → 新 top 带 [8, 标题顶-8] 内放 148.6 高', () => {
    UIScale.resize(1920, 1080, 1);
    const H = UIScale.logicalH;
    const g = previewBandLayout({ logicalW: UIScale.logicalW, logicalH: H, aspect: ASPECT_SMALL });
    const bandBottom = 270 - PREVIEW_BAND.HEADER_ABOVE_BAR - PREVIEW_BAND.GAP;   // 标题顶-8 = 192
    expect(g.y).toBeGreaterThanOrEqual(PREVIEW_BAND.EDGE_MARGIN);                // 带顶=边距 8
    expect(g.y + g.height).toBeLessThanOrEqual(bandBottom + 1e-9);               // 带内(带内垂直居中,不贴底)
    expect(g.height).toBeCloseTo(520 * ASPECT_SMALL, 9);   // 旧 40.4 → 新 148.6(可读)
    expect(g.height).toBeGreaterThan(100);
    UIScale.resize(800, 600, 1);
  });
});
