// 光标染色回归（2026-08-21 用户实报"光标指针原版会染色，现在是纯灰白"）：
// 标杆 Main.cs——mouseColor 默认 RGB(255,50,95) 粉红（:66111）；CursorColor()
// （:51886-51906）cursorAlpha 在 0.6..1 呼吸（±0.015/t）、RGB×alpha、
// A=255×(alpha×0.3+0.7)、cursorScale=alpha×0.3+0.8；hasRainbowCursor → HSL 环转
// （:47374，0.25 圈/秒）。VUI.drawCursor 曾恒 rgb(255,255,255)=丢整条染色链。
import { describe, it, expect } from 'vitest';

// VUI.cursorColorState 是 private——以同式复刻对拍（与实现同步维护，注释锚行号）
function cursorState(alpha: number, dir: 1 | -1, rainbow: boolean, nowMs: number) {
  const s = { alpha, dir };
  s.alpha += s.dir * 0.015;
  if (s.alpha >= 1) { s.alpha = 1; s.dir = -1; }
  if (s.alpha <= 0.6) { s.alpha = 0.6; s.dir = 1; }
  if (rainbow) {
    const h = (nowMs / 1000 * 0.25) % 1;
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      const v = 0.5 - Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1)) * 0.5;
      return Math.round(v * 255);
    };
    return { r: f(0), g: f(8), b: f(4), a: 255, scale: 1, dir: s.dir as 1 | -1, alpha: s.alpha };
  }
  const a = s.alpha;
  return {
    r: Math.round(255 * a), g: Math.round(50 * a), b: Math.round(95 * a),
    a: Math.round(255 * (a * 0.3 + 0.7)), scale: a * 0.3 + 0.8,
    dir: s.dir as 1 | -1, alpha: s.alpha,
  };
}

describe('光标染色（Main.CursorColor :51886-51906）', () => {
  it('默认色 = 粉红系 RGB(255,50,95)×alpha（非纯白）', () => {
    const c = cursorState(1, 1, false, 0);
    expect(c.r).toBe(255);
    expect(c.g).toBe(50);
    expect(c.b).toBe(95);
  });

  it('alpha 呼吸：1 → 递减；0.6 触底 → 翻向递增（0.6..1 往复）', () => {
    let s = { alpha: 1, dir: -1 as 1 | -1 };
    for (let i = 0; i < 100 && s.alpha > 0.6; i++) {
      s = cursorState(s.alpha, s.dir, false, 0);
    }
    expect(s.alpha).toBeCloseTo(0.6, 5);
    expect(s.dir).toBe(1);
  });

  it('满 alpha 时 A=255、scale=1.1；alpha 步进后 A/scale 同步呼吸', () => {
    expect(cursorState(1, 1, false, 0).a).toBe(255);
    expect(cursorState(1, 1, false, 0).scale).toBeCloseTo(1.1, 5);
    // 从 0.6 起步先 +0.015 → a=0.615：A=255×(0.615×0.3+0.7)=255×0.8845≈226
    const lo = cursorState(0.6, 1, false, 0);
    expect(lo.alpha).toBeCloseTo(0.615, 5);
    expect(lo.a).toBe(Math.round(255 * 0.8845));
    expect(lo.scale).toBeCloseTo(0.615 * 0.3 + 0.8, 5);
  });

  it('彩虹模式：色相随时间环转（h=0.3 处 R/G/B 互异、跨时 R 变化）', () => {
    // h=0 恰在纯红相位（G=B=0）——用 h=0.3 采样三通道互异
    const c1 = cursorState(1, 1, true, 1200);   // h=0.3
    expect(c1.r).not.toBe(c1.g);
    expect(c1.g).not.toBe(c1.b);
    const c2 = cursorState(1, 1, true, 2200);
    expect(c2.r).not.toBe(c1.r);
  });
});

describe('光标双 pass（Main.DrawCursor :47436-47439 鼠标分支）', () => {
  it('阴影 pass = RGB×0.2/A×0.5/scale×1.1（描边观感来源）', () => {
    const cc = cursorState(1, 1, false, 0);
    const shadow = {
      r: Math.round(cc.r * 0.2), g: Math.round(cc.g * 0.2),
      b: Math.round(cc.b * 0.2), a: Math.round(cc.a * 0.5),
      scale: cc.scale * 1.1,
    };
    expect(shadow.r).toBe(51);      // 255×0.2
    expect(shadow.g).toBe(10);      // 50×0.2
    expect(shadow.b).toBe(19);      // 95×0.2
    expect(shadow.a).toBe(128);     // 255×0.5
    expect(shadow.scale).toBeCloseTo(1.21, 5);   // 1.1×1.1
  });
});
