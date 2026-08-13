// SM2 解释器金标：ArmorColored/HallowBoss 的期望值全部由字节码 token 级手工
// 推导（见 wing-visual-port.md 三轮记录），对照解释器执行结果。
import { describe, expect, it } from 'vitest';
import {
  defaultUniforms, getPass, runPassOnImageData, passNames, type SM2Sampler,
} from '../src/fx/SM2Effect';
import { dyeApplyOf, dyeCount, dyeEntryOf } from '../src/data/vanillaDyes';

const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps;
const rgba = (data: Uint8ClampedArray) =>
  [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];

/** 1×N 单行图：texels 线性排列 */
function strip(texels: Array<[number, number, number, number]>): { data: Uint8ClampedArray; w: number; h: number } {
  const w = texels.length, h = 1;
  const data = new Uint8ClampedArray(w * 4);
  texels.forEach((t, i) => {
    data[i * 4] = t[0] * 255; data[i * 4 + 1] = t[1] * 255;
    data[i * 4 + 2] = t[2] * 255; data[i * 4 + 3] = t[3] * 255;
  });
  return { data, w, h };
}

/** 合成调色板 s1：颜色 = (u, v, 0.5, 1) */
const identityRamp: SM2Sampler = (u, v) => [u, v, 0.5, 1];

describe('SM2 解释器：ArmorColored（字节码真值）', () => {
  const pass = getPass('ArmorColored')!;
  const u = defaultUniforms();
  u.uColor = [1, 0, 0];
  u.uSaturation = 1.2;          // DyeInitializer.cs:29 红染料真实值

  it('preshader 常量：c0=1−uColor, c1=1/sat, c2=1−1/sat', () => {
    const c = pass.setupConstants(u);
    // c0.rgb = 1 − (1,0,0) = (0,1,1)
    expect(near(c[0], 0) && near(c[1], 1) && near(c[2], 1)).toBe(true);
    expect(near(c[4], 1 / 1.2)).toBe(true);      // c1.x = k
    expect(near(c[8], 1 - 1 / 1.2)).toBe(true);  // c2.x = 1−k
  });

  it('白像素：输出 (1, 0.9167, 0.9167)', () => {
    const { data, w, h } = strip([[1, 1, 1, 1]]);
    runPassOnImageData(pass, data, w, h, u);
    const out = rgba(data);
    expect(near(out[0], 1)).toBe(true);
    expect(near(out[1], 0.9167)).toBe(true);
    expect(near(out[2], 0.9167)).toBe(true);
    expect(near(out[3], 1)).toBe(true);
  });

  it('蓝偏像素 (0.2,0.2,1)：输出 (0.9867, 0.1167, 0.1167)', () => {
    const { data, w, h } = strip([[0.2, 0.2, 1, 1]]);
    runPassOnImageData(pass, data, w, h, u);
    const out = rgba(data);
    expect(near(out[0], 0.98667, 2e-3)).toBe(true);
    expect(near(out[1], 0.11667, 2e-3)).toBe(true);
    expect(near(out[2], 0.11667, 2e-3)).toBe(true);
  });

  it('透明像素 alpha 保持 0（×A 路径）', () => {
    const { data, w, h } = strip([[1, 1, 1, 0]]);
    runPassOnImageData(pass, data, w, h, u);
    const out = rgba(data);
    expect(out[3]).toBe(0);
  });
});

describe('SM2 解释器：ArmorHallowBoss 染料（44 翅膀同款 rainbow）', () => {
  const pass = getPass('ArmorHallowBoss')!;
  const u = defaultUniforms();
  u.uTime = 0;

  it('灰像素 0.4：ramp[SUM/2+t/2, 0.5]×0.8 + 原色×0.2', () => {
    const { data, w, h } = strip([[0.4, 0.4, 0.4, 1]]);
    // SUM=0.8 → 采样 (0.4, 0.5)（ramp v=c1.x=0.5,非 0.8——解释器实证）；
    // 期望 0.8×(0.4,0.5,0.5) + 0.2×(0.4,0.4,0.4) = (0.4, 0.48, 0.48)
    runPassOnImageData(pass, data, w, h, u, [identityRamp]);
    const out = rgba(data);
    expect(near(out[0], 0.4, 2e-3)).toBe(true);
    expect(near(out[1], 0.48, 2e-3)).toBe(true);
    expect(near(out[2], 0.48, 2e-3)).toBe(true);
    expect(near(out[3], 1)).toBe(true);
  });
});

describe('SM2 解释器：HallowBoss misc pass（44 翅膀烘焙，PlayerRainbowWingsTextureContent）', () => {
  const pass = getPass('HallowBoss')!;
  const u = defaultUniforms();
  u.uTime = 1.35;

  it('灰 0.4 + t=1.35 → 坐标 fold(1.75)=0.75，y=0.5 → 纯 ramp 色×A', () => {
    const { data, w, h } = strip([[0.4, 0.4, 0.4, 1]]);
    runPassOnImageData(pass, data, w, h, u, [identityRamp]);
    const out = rgba(data);
    expect(near(out[0], 0.75, 3e-3)).toBe(true);   // x = frac(|1.75|) 且 ≥0
    expect(near(out[1], 0.5, 3e-3)).toBe(true);    // y=c1.x=0.5（解释器实证）
    expect(near(out[2], 0.5, 3e-3)).toBe(true);
    expect(near(out[3], 1)).toBe(true);
  });

  it('负 fold：gray 0.4 + t=−0.7 → −0.3 → −frac(0.3) = −0.3（wrap 后 0.7）', () => {
    const u2 = { ...defaultUniforms(), uTime: -0.7 };
    const { data, w, h } = strip([[0.4, 0.4, 0.4, 1]]);
    // cmp: x<0 → −frac(|x|) = −0.3；wrap 采样器由烘焙侧承担（identityRamp 不 wrap，
    // 直接验证坐标语义：−0.3 的 identity = −0.3 钳 0）
    runPassOnImageData(pass, data, w, h, u2, [identityRamp]);
    const out = rgba(data);
    expect(near(out[0], 0, 2e-3)).toBe(true);      // UNORM 钳 0
  });
});

describe('染料表 × pass 覆盖', () => {
  it('116 条染料全部有可执行字节码 pass（旧"effect 缺口"清零）', () => {
    const names = new Set(passNames());
    const missing: Array<[number, string]> = [];
    for (let vid = 1; vid < 6000; vid++) {
      const e = dyeEntryOf(vid);
      if (e && !names.has(e.tech)) missing.push([vid, e.tech]);
    }
    expect(missing).toEqual([]);
    expect(dyeCount()).toBe(116);
  });

  it('dyeApplyOf 装配 uniforms（红染料 1007：ArmorColored + sat 1.2）', () => {
    const a = dyeApplyOf(1007)!;
    expect(a.tech).toBe('ArmorColored');
    expect(a.uniforms.uSaturation).toBeCloseTo(1.2);
    expect(a.uniforms.uColor).toEqual([1, 0, 0]);
  });

  it('HallowBoss 染料 4778 标记 needsImage1（Extra_156 绑定）', () => {
    const a = dyeApplyOf(4778)!;
    expect(a.tech).toBe('ArmorHallowBoss');
    expect(a.needsImage1).toBe(true);
  });
});

describe('t0 子矩形映射（SpriteBatch UV 语义）', () => {
  it('ArmorColoredGradient：子矩形烘焙与整图烘焙等价（t0×uImageSize0−uSourceRect.xy）', () => {
    const pass = getPass('ArmorColoredGradient')!;
    const texels: Array<[number, number, number, number]> = [
      [1, 1, 1, 1], [0.6, 0.5, 0.4, 1], [0.3, 0.3, 0.3, 1], [0, 0, 0, 1],
    ];
    const mk = () => strip(texels);
    const uBase = defaultUniforms();
    uBase.uColor = [1, 0, 0];
    uBase.uSecondaryColor = [0, 0, 1];
    uBase.uSaturation = 1.2;
    // A：整图（uImageSize0=4×1、uSourceRect=0,0,4,1、t0=局部）
    const a = mk();
    const uA = { ...uBase, uImageSize0: [4, 1] as [number, number], uSourceRect: [0, 0, 4, 1] as [number, number, number, number] };
    runPassOnImageData(pass, a.data, a.w, a.h, uA);
    // B：同一 4px 切片在大表 x=2 处（uImageSize0=6×1、uSourceRect=2,0,4,1、t0=全表）
    const b = mk();
    const uB = { ...uBase, uImageSize0: [6, 1] as [number, number], uSourceRect: [2, 0, 4, 1] as [number, number, number, number] };
    runPassOnImageData(pass, b.data, b.w, b.h, uB, [], { sx: 2, sy: 0, sheetW: 6, sheetH: 1 });
    for (let i = 0; i < a.data.length; i++) {
      expect(Math.abs(a.data[i] - b.data[i])).toBeLessThanOrEqual(2);   // 仅 Uint8 量化差
    }
  });

  it('缺 t0Rect 的旧路径在子矩形下错锚（回归守卫：两输出必须不同）', () => {
    const pass = getPass('ArmorColoredGradient')!;
    const texels: Array<[number, number, number, number]> = [
      [1, 1, 1, 1], [0.6, 0.5, 0.4, 1], [0.3, 0.3, 0.3, 1], [0, 0, 0, 1],
    ];
    const uBase = defaultUniforms();
    uBase.uColor = [1, 0, 0];
    uBase.uSecondaryColor = [0, 0, 1];
    uBase.uSaturation = 1.2;
    const b = strip(texels);
    const uB = { ...uBase, uImageSize0: [6, 1] as [number, number], uSourceRect: [2, 0, 4, 1] as [number, number, number, number] };
    const withRect = strip(texels);
    runPassOnImageData(pass, withRect.data, withRect.w, withRect.h, uB, [], { sx: 2, sy: 0, sheetW: 6, sheetH: 1 });
    runPassOnImageData(pass, b.data, b.w, b.h, uB);                     // 无 t0Rect（切片局部 t0）
    let diff = 0;
    for (let i = 0; i < b.data.length; i += 4) {
      if (Math.abs(b.data[i] - withRect.data[i]) > 8
        || Math.abs(b.data[i + 1] - withRect.data[i + 1]) > 8) diff++;
    }
    expect(diff).toBeGreaterThan(0);   // 证明位置依赖 pass 对 t0 映射敏感（映射真实生效）
  });
});
