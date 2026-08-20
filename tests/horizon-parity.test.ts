// 地平线系统纯函数对账(2026-08-20 光照专案·原版化落地):
//   锚:SunGradients.cs 梯度表 / Main.cs:2865 HorizonPhase / SetBackColor:62896-62931
//   sunColor 三段 / :63354-63359 非血月月色恒白 / NextHorizonRenderer:185-196
//   ModifyHorizonLight 的逐通道 max-lerp。
import { describe, it, expect } from 'vitest';
import {
  SUNRISE_GRADS, SUNSET_GRADS, horizonPhaseOf, sunColorOf, moonDrawColor, modifyHorizonLight,
} from '../src/lighting/Horizon';

describe('SunGradients 梯度表(SunGradients.cs 逐值)', () => {
  it('四调色板 × 15 帧,首末帧锚值', () => {
    expect(SUNRISE_GRADS).toHaveLength(4);
    expect(SUNRISE_GRADS[0]).toHaveLength(15);
    expect(SUNRISE_GRADS[0][0]).toEqual([17, 35, 67]);      // Sunrise_Blue[0]
    expect(SUNRISE_GRADS[0][14]).toEqual([255, 230, 153]);  // Sunrise_Blue[14]
    expect(SUNRISE_GRADS[3][7]).toEqual([138, 95, 155]);    // Sunrise_Aluminum[7]
    expect(SUNSET_GRADS[2][14]).toEqual([240, 125, 63]);    // Sunset_Pink[14]
    expect(SUNSET_GRADS[3][0]).toEqual([27, 24, 39]);       // Sunset_Red[0]
  });
});

describe('HorizonPhase(Main.cs:2865-2877)', () => {
  it('夜/白昼后半 = moonPhase;白昼前半 −1;负数回卷 +8', () => {
    expect(horizonPhaseOf(5, false, 0)).toBe(5 % 4);
    expect(horizonPhaseOf(5, true, 30000)).toBe(5 % 4);
    expect(horizonPhaseOf(0, true, 100)).toBe(7 % 4);       // 0−1 → 7
  });
});

describe('sunColor 三段曲线(SetBackColor Main.cs:62896-62931)', () => {
  it('黎明首端 (55,75,5) → 正午白;黄昏末端 (55,25,55)', () => {
    expect(sunColorOf(0)).toEqual([55, 75, 5]);
    expect(sunColorOf(13500)).toEqual([255, 255, 255]);
    expect(sunColorOf(20000)).toEqual([255, 255, 255]);     // 正午段
    expect(sunColorOf(37800.5)[0]).toBeCloseTo(255, 0);     // 黄昏前段起点≈白
    const dusk = sunColorOf(54000);                          // 黄昏后段末端(浮点尾差容差)
    expect(dusk[0]).toBeCloseTo(55, 5);
    expect(dusk[1]).toBeCloseTo(25, 5);
    expect(dusk[2]).toBeCloseTo(55, 5);
  });
});

describe('月绘制色(SetBackColor:63354-63359 + 血月 :62946-62960)', () => {
  it('非血月恒白;血月入夜首端红移 (215,225,255) → 深夜 (205,55,55)', () => {
    expect(moonDrawColor(0, false)).toEqual([255, 255, 255]);
    expect(moonDrawColor(0, true)).toEqual([215, 225, 255]);
    expect(moonDrawColor(16200, true)).toEqual([205, 55, 55]);
  });
});

describe('ModifyHorizonLight(NextHorizonRenderer:185-196 逐通道 max 后 lerp)', () => {
  it('可见度 0 = 原样;可见度 1 单通道取 max', () => {
    expect(modifyHorizonLight([10, 10, 10], 0, 0, 0)).toEqual([10, 10, 10]);
    // Sunset_Blue 中帧 = [171,103,125](相位 0)
    const out = modifyHorizonLight([10, 200, 10], 0, 1, 0);
    expect(out[0]).toBe(171);                               // max(10,171)=171
    expect(out[1]).toBe(200);                               // max(200,103)=200
    expect(out[2]).toBe(125);                               // max(10,125)=125
  });
});

// ---- 群系影响四块(SetBackColor :63002-63228,2026-08-20 原版化) ----
import { setBackColor, applyBiomeToSun, applyBiomeToMoon, type BiomeInfluence } from '../src/lighting/SkyColor';

describe('群系影响块(SetBackColor :63002-63228 逐式)', () => {
  const BIO = (o: Partial<BiomeInfluence>): BiomeInfluence =>
    ({ corrupt: 0, crimson: 0, jungle: 0, mushroom: 0, graveyard: 0, ...o });
  it('腐化 I=1 正午白 → (165,115,185);地板后仍 ≥15', () => {
    const bg = setBackColor(27000, true, 0, false, 1, BIO({ corrupt: 1 }));
    expect(bg).toEqual([165, 115, 185]);
  });
  it('猩红 I=1 正午白 → R 用 G 归一(255−40=215,G=145,B=115)', () => {
    const bg = setBackColor(27000, true, 0, false, 1, BIO({ crimson: 1 }));
    expect(bg).toEqual([215, 145, 115]);
  });
  it('丛林 I=1 正午白 → (215,255,185)(G 不动)', () => {
    const bg = setBackColor(27000, true, 0, false, 1, BIO({ jungle: 1 }));
    expect(bg).toEqual([215, 255, 185]);
  });
  it('蘑菇 I=1 正午白 → (5,5,5)→地板 19(满月)兜住', () => {
    const bg = setBackColor(27000, true, 0, false, 1, BIO({ mushroom: 1 }));
    expect(bg).toEqual([19, 19, 19]);   // 255−250=5,MOON_FLOOR[0]=19 兜底
  });
  it('墓园 I=1 正午白 → ×0.4 = (102,102,102)', () => {
    const bg = setBackColor(27000, true, 0, false, 1, BIO({ graveyard: 1 }));
    expect(bg).toEqual([102, 102, 102]);
  });
  it('sunColor 腐化块:白 → (155,155,255)(b 系数 0 不动)', () => {
    const sun: [number, number, number] = [255, 255, 255];
    applyBiomeToSun(sun, BIO({ corrupt: 1 }));
    expect(sun).toEqual([155, 155, 255]);
  });
  it('moonColor 蘑菇跨通道块:白 → (85,115,65) 快照语义', () => {
    const moon: [number, number, number] = [255, 255, 255];
    applyBiomeToMoon(moon, BIO({ mushroom: 1 }));
    expect(moon).toEqual([85, 115, 65]);
  });
});

// ---- 太阳/耀斑链四机制（2026-08-20 补齐批·Main.cs/NextHorizonRenderer 逐式） ----
import {
  adjustFlareIntensity, decayCelestialModY, flareShadowTerm,
} from '../src/render/SkyRenderer';

describe('AdjustIntensity sunScorch 分支(NextHorizonRenderer.cs:393-408)', () => {
  it('无 sunScorch(counter=0) = (temporal×celestial)³', () => {
    expect(adjustFlareIntensity(0.5, 0.8, 0)).toBeCloseTo(0.4 ** 3, 10);   // :395-397
    expect(adjustFlareIntensity(0.9, 1, 0)).toBeCloseTo(0.729, 10);
  });
  it('counter>0 整体替换为 1−(1−lerp(0,300,counter))² 曲线 ×celestial ×5', () => {
    // :401-405;temporal 值被丢弃(替换非叠加)
    expect(adjustFlareIntensity(0.02, 0.8, 300)).toBeCloseTo(1 * 0.8 * 5, 10);   // lerp=1 → 1
    expect(adjustFlareIntensity(0.9, 1, 150)).toBeCloseTo(0.75 * 5, 10);        // lerp=0.5 → 1−0.25
    expect(adjustFlareIntensity(0.9, 0.8, 150)).toBeCloseTo(0.75 * 0.8 * 5, 10);
    // counter=1(最小非零档):lerp=1/300 → 1−(299/300)² = 599/90000
    expect(adjustFlareIntensity(1, 1, 1)).toBeCloseTo((599 / 90000) * 5, 10);
  });
});

describe('sunModY/moonModY 衰减(Main.cs:62415-62416 (short)(modY×0.999))', () => {
  it('×0.999 后向零截断;小值一步归零;short 回卷', () => {
    expect(decayCelestialModY(500)).toBe(499);        // trunc(499.5)
    expect(decayCelestialModY(-500)).toBe(-499);
    expect(decayCelestialModY(200)).toBe(199);        // trunc(199.8)
    expect(decayCelestialModY(1)).toBe(0);            // trunc(0.999)
    expect(decayCelestialModY(-1)).toBe(0);           // trunc(−0.999) → 0
    expect(decayCelestialModY(0)).toBe(0);
    expect(decayCelestialModY(32767)).toBe(32734);    // trunc(32734.233)
    expect(decayCelestialModY(40000)).toBe(-25576);   // int16 回卷(39960−65536)
  });
});

describe('耀斑玩家残影项(LensFlareElement.cs:34-37)', () => {
  it('无残影环(≤1 项)恒 0;移动残影在日→屏心轴向投影 ×|v|', () => {
    expect(flareShadowTerm(undefined, 1000, 500, 500, 500)).toBe(0);
    expect(flareShadowTerm([{ x: 3, y: 4 }], 1000, 500, 500, 500)).toBe(0);
    // 6 项历史每帧 +100px 向右:最新(600,0) vs 4 帧前(200,0) → v=(400,0),日→屏心=(1,0)
    const hist = [100, 200, 300, 400, 500, 600].map((x) => ({ x, y: 0 }));
    expect(flareShadowTerm(hist, 1000, 500, 500, 500)).toBeCloseTo(400, 6);
    // 垂直反向移动(v 不在日向上) → 投影 0
    const histV = [0, 100, 200, 300, 400, 500].map((y) => ({ x: 0, y }));
    expect(flareShadowTerm(histV, 1000, 500, 500, 500)).toBeCloseTo(0, 6);
  });
});
