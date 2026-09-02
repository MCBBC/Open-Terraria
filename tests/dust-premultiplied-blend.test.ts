// dust 预乘混合批（Renderer.drawVanillaDustPass × VanillaDust.dustPremulBake）数值闸门。
// 断言三段：①烘焙字节面精确性 ②canvas 两步合成（destination-out+lighter,W3C 语义
// 独立实现）逐像素 = XNA 预乘 AlphaBlend 公式（±2 8bit 容差）③旧直色 source-over
// 模型对同一公式必偏离（钉死被修掉的语义 bug,防回退）。
// XNA 公式（Main.DrawDust spriteBatch.Begin(BlendState.AlphaBlend) = 预乘混合
// One/InverseSourceAlpha;贴图经内容管线预乘,直色 PNG 先乘 texA;Draw 的 Color 入参
// c 逐通道调制,src.rgb=texP×c.rgb 不乘 c.a、src.a=tex.a×c.a）：
//   final = dst×(1−texA×cA) + tex.rgb×texA×cRGB   （单次 clamp）
import { describe, it, expect, vi } from 'vitest';
import { dustPremulBake, dustPmCacheTouch, dustPmCacheEvict, DUST_PM_CACHE_MAX } from '../src/fx/VanillaDust';
import { Renderer } from '../src/render/Renderer';

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
  // ★R2 #8:dst 通道改 0-1 浮点渐变——字节域 + Math.min(1,·) 钳使 10/12 texel 双侧
  // 饱和为 1,erase×dst 项零覆盖(通过理由失真);渐变域让每个 texel 的乘法项可见
  const px = (k: number) => [Math.round(DSTS[k % 5] * 0.72), Math.round(DSTS[(k + 1) % 5] * 0.58), Math.round(DSTS[(k + 3) % 5] * 0.44), 1];
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

// ---------------------------------------------------------------------------
// dustPmCache 分代 LRU（2026-09-02 红队 PLAUSIBLE finding 清偿金标）——旧实现上限
// 溢出【整体 clear】:连续多色 colorPass/331 贴片键周期打穿时全缓存瞬间归零,每键
// 重烘 1×getImageData（GPU 回读）= 帧尖峰。金标钉死:溢出不清空全部/最旧先出/
// 热键（命中重插入）不被分代窗口淘汰。
// ---------------------------------------------------------------------------
describe('dustPmCache 分代 LRU（溢出不清空全部/最旧先出）', () => {
  it('dustPmCacheEvict:超限只逐出最旧 1/4,其余保留', () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 2100; i++) m.set(`k${i}`, i);
    dustPmCacheEvict(m);
    expect(m.size).toBe(2100 - (2100 >> 2));            // 1575 —— 非 0(旧 clear 归零)
    expect(m.has('k0')).toBe(false);                    // 最旧先出
    expect(m.has(`k${(2100 >> 2) - 1}`)).toBe(false);   // 逐出窗末（k524）
    expect(m.has(`k${2100 >> 2}`)).toBe(true);          // 窗后首个幸存（k525）
    expect(m.has('k2099')).toBe(true);                  // 最新档全保留
  });

  it('dustPmCacheTouch:命中重插入=访问序,热键不被分代淘汰', () => {
    const m = new Map<string, number>();
    for (let i = 0; i < DUST_PM_CACHE_MAX + 1; i++) m.set(`k${i}`, i);   // 2049>2048
    dustPmCacheTouch(m, 'k0');                          // 最旧键命中 → 移到尾
    dustPmCacheEvict(m);                                // 逐 2049>>2=512 个
    expect(m.size).toBe(DUST_PM_CACHE_MAX + 1 - 512);
    expect(m.has('k0')).toBe(true);                     // 刚访问者幸存
    expect(m.has('k1')).toBe(false);                    // 未访问旧键先出
  });

  it('≤上限零淘汰(顺序不变)', () => {
    const m = new Map<string, number>([['a', 1], ['b', 2]]);
    dustPmCacheEvict(m);
    expect([...m.keys()]).toEqual(['a', 'b']);
  });

  it('dustPremulPair 接线:稳态规模有界不清空、命中同对象、最旧档被逐出后重烘', () => {
    // node 环境无 canvas——桩 document.createElement（烘焙只走 clearRect/drawImage/
    // getImageData/createImageData/putImageData 五口;数据面已由上方 dustPremulBake 组覆盖）
    const px = new Uint8ClampedArray(8 * 8 * 4);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 8, height: 8,
        getContext: () => ({
          clearRect: () => {}, drawImage: () => {}, putImageData: () => {},
          getImageData: () => ({ data: px, width: 8, height: 8 }),
          createImageData: () => ({ data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 }),
        }),
      }),
    });
    try {
      const self = { dustPmCache: null as Map<string, unknown> | null, dustPmBake: null };
      const pairFn = (Renderer.prototype as unknown as {
        dustPremulPair: (this: unknown, img: CanvasImageSource, fx: number, fy: number,
          mr: number, mg: number, mb: number, ma: number) => unknown;
      }).dustPremulPair;
      const get = (fx: number) => pairFn.call(self, {} as CanvasImageSource, fx, 0, 0.5, 0.5, 0.5, 0.1);
      const first = get(0);
      expect(get(0)).toBe(first);                       // 命中=同一烘焙对(不重烘)
      for (let i = 0; i < 2100; i++) get(i);            // 2100 独立键连续打穿
      const size = self.dustPmCache!.size;
      expect(size).toBeGreaterThan(0);                  // 溢出不清空全部(旧实现=0)
      expect(size).toBeLessThanOrEqual(DUST_PM_CACHE_MAX + 2);   // 分代后稳态有界
      expect(get(0)).not.toBe(first);                   // 最旧档已逐出 → 重烘新对象
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
