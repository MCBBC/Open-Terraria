// dust 预乘混合批（Renderer.drawVanillaDustPass × VanillaDust.dustPremulBake）数值闸门。
// 断言三段：①烘焙字节面精确性 ②canvas 两步合成（destination-out+lighter,W3C 语义
// 独立实现）逐像素 = XNA 预乘 AlphaBlend 公式（±2 8bit 容差）③旧直色 source-over
// 模型对同一公式必偏离（钉死被修掉的语义 bug,防回退）。
// XNA 公式（Main.DrawDust spriteBatch.Begin(BlendState.AlphaBlend) = 预乘混合
// One/InverseSourceAlpha;贴图经内容管线预乘,直色 PNG 先乘 texA;Draw 的 Color 入参
// c 逐通道调制,src.rgb=texP×c.rgb 不乘 c.a、src.a=tex.a×c.a）：
//   final = dst×(1−texA×cA) + tex.rgb×texA×cRGB   （单次 clamp）
import { describe, it, expect } from 'vitest';
import { dustPremulBake } from '../src/fx/VanillaDust';

/** 2×2 直色贴图：tA=255 / 半透 / 全透（形状外）/ 低α,覆盖四象限 */
const TEX = new Uint8ClampedArray([
  200, 100, 50, 255,
  255, 255, 255, 128,
  10, 20, 30, 0,
  80, 160, 240, 64,
]);

/** canvas 两步合成仿真（premult 浮点;按 W3C spec 独立实现,与烘焙代码零共享）：
 *  'destination-out': dst' = dst×(1−srcA);'lighter': dst' = clamp(dst+src.premult) */
function compositePremulPair(dst: number[], add: Uint8ClampedArray, erase: Uint8ClampedArray): number[] {
  const out = dst.slice();
  for (let i = 0; i < out.length; i += 4) {
    const ea = erase[i + 3] / 255;
    for (let ch = 0; ch < 3; ch++) out[i + ch] *= 1 - ea;                       // ① 擦
    const sa = add[i + 3] / 255;                                                // = 255 → 1
    for (let ch = 0; ch < 3; ch++) out[i + ch] = Math.min(1, out[i + ch] + (add[i + ch] / 255) * sa); // ② 加
  }
  return out;
}

/** 旧实现模型（直色 source-over:src.rgb=tex.rgb×cRGB×srcA、src.a=tex.a×cA） */
function compositeOldStraight(dst: number[], tex: Uint8ClampedArray, mR: number, mA: number): number[] {
  const out = dst.slice();
  for (let i = 0; i < out.length; i += 4) {
    const sa = (tex[i + 3] / 255) * (mA / 255);
    for (let ch = 0; ch < 3; ch++) {
      out[i + ch] = (tex[i + ch] / 255) * (mR / 255) * sa + out[i + ch] * (1 - sa);
    }
  }
  return out;
}

/** XNA 预乘公式（浮点独立推导,byte 输入） */
function xnaFormula(dst: number[], tex: Uint8ClampedArray, mR: number, mA: number): number[] {
  const out = dst.slice();
  for (let i = 0; i < out.length; i += 4) {
    const texA = tex[i + 3] / 255;
    for (let ch = 0; ch < 3; ch++) {
      out[i + ch] = Math.min(1, out[i + ch] * (1 - texA * (mA / 255)) + (tex[i + ch] / 255) * texA * (mR / 255));
    }
  }
  return out;
}

function maxDev(a: number[], b: number[]): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 4) for (let ch = 0; ch < 3; ch++) m = Math.max(m, Math.abs(a[i + ch] - b[i + ch]) * 255);
  return m;
}

/** 已知背景（含 0/低/中/高/饱和五档,2×2=4 px × 3 组轮转） */
const DSTS = [0, 64, 128, 200, 255];
function mkDst(): number[] {
  const px = (k: number) => [DSTS[k % 5], DSTS[(k + 1) % 5], DSTS[(k + 3) % 5], 1];
  return [...px(0), ...px(1), ...px(2), ...px(3)];
}

describe('dustPremulBake 烘焙面（Renderer 预乘对数据源）', () => {
  it('add=直色→预乘×Color 单次量化(A=255)、erase.A=texA×mA/255(RGB=0)', () => {
    const { add, erase } = dustPremulBake(TEX, 120, 120, 120, 120);
    for (let i = 0; i < TEX.length; i += 4) {
      const tA = TEX[i + 3];
      for (let ch = 0; ch < 3; ch++) {
        expect(Math.abs(add[i + ch] - Math.round((TEX[i + ch] * tA * 120) / 65025))).toBeLessThanOrEqual(1);
      }
      expect(add[i + 3]).toBe(255);                                              // 全额加法载体
      expect(Math.abs(erase[i + 3] - Math.round((tA * 120) / 255))).toBeLessThanOrEqual(1);
      expect(erase[i]).toBe(0); expect(erase[i + 1]).toBe(0); expect(erase[i + 2]).toBe(0);
    }
  });

  it('colorPass 档逐通道乘数独立（mR≠mG≠mB）', () => {
    const { add } = dustPremulBake(TEX, 250, 120, 40, 200);
    for (let i = 0; i < TEX.length; i += 4) {
      const tA = TEX[i + 3];
      expect(Math.abs(add[i] - Math.round((TEX[i] * tA * 250) / 65025))).toBeLessThanOrEqual(1);
      expect(Math.abs(add[i + 1] - Math.round((TEX[i + 1] * tA * 120) / 65025))).toBeLessThanOrEqual(1);
      expect(Math.abs(add[i + 2] - Math.round((TEX[i + 2] * tA * 40) / 65025))).toBeLessThanOrEqual(1);
      expect(Math.abs(add[i + 3] - 255)).toBeLessThanOrEqual(0);
    }
  });
});

describe('canvas 两步合成 ≡ XNA 预乘公式（逐像素数值等价）', () => {
  const cases: Array<[number, number, number, number, string]> = [
    [120, 120, 120, 120, '默认档 num(α=120)'],
    [255, 255, 255, 25, 'type6 档 A=25/255'],
    [250, 120, 40, 200, 'colorPass 逐通道档'],
    [230, 230, 230, 115, 'type261 档'],
    [255, 255, 255, 0, 'A=0 加性特例(erase 无操作)'],
  ];
  for (const [mR, mG, mB, mA, name] of cases) {
    it(`${name}: maxDev ≤ 2/255`, () => {
      const { add, erase } = dustPremulBake(TEX, mR, mG, mB, mA);
      const dst = mkDst();
      const got = compositePremulPair(dst, add, erase);
      const exp = xnaFormula(dst, TEX, mR, mA);
      expect(maxDev(got, exp)).toBeLessThanOrEqual(2);
    });
  }

  it('A=0 特例退化为纯加法 dst+texP×cRGB（=既有 lighter 加性通道同式）', () => {
    const { add, erase } = dustPremulBake(TEX, 255, 255, 255, 0);
    for (let i = 3; i < erase.length; i += 4) expect(erase[i]).toBe(0);
    const dst = mkDst();
    const got = compositePremulPair(dst, add, erase);
    for (let i = 0; i < dst.length; i += 4) {
      const texA = TEX[i + 3] / 255;
      for (let ch = 0; ch < 3; ch++) {
        expect(Math.abs(got[i + ch] - Math.min(1, dst[i + ch] + (TEX[i + ch] / 255) * texA)) * 255).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('旧直色 source-over 模型必偏离公式（语义 bug 钉死,防回退）', () => {
  it('默认档（a>0）偏差 >2/255——加性项被额外乘 c.a（src 压暗）', () => {
    const dst = mkDst();
    const oldDev = maxDev(compositeOldStraight(dst, TEX, 120, 120), xnaFormula(dst, TEX, 120, 120));
    expect(oldDev).toBeGreaterThan(2);
    // 而新烘焙对对同公式 ≤2（同输入同背景）
    const { add, erase } = dustPremulBake(TEX, 120, 120, 120, 120);
    expect(maxDev(compositePremulPair(dst, add, erase), xnaFormula(dst, TEX, 120, 120))).toBeLessThanOrEqual(2);
  });
});
