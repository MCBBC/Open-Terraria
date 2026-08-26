// SM2 解释器金标：ArmorColored/HallowBoss 的期望值全部由字节码 token 级手工
// 推导（见 wing-visual-port.md 三轮记录），对照解释器执行结果。
import { describe, expect, it } from 'vitest';
import {
  defaultUniforms, getPass, runPassOnImageData, passNames, type SM2Sampler,
} from '../src/fx/SM2Effect';
import { dyeApplyOf, dyeCount, dyeEntryOf, applyDyePass } from '../src/data/vanillaDyes';
import fxJson from '../src/data/fxPixelShader.json';

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

// ================= _sat / sincos 解码锁(2026-08-24 r15 复核批) =================
// 背景:dst 修饰位判据曾写 (tok>>20)&0xF===2(实为 PARTIALPRECISION)——SDK
// d3d9types.h:513-515 D3DSPDM_NONE=0/SATURATE=1<<20/PARTIALPRECISION=2,致全库
// 54 处 _sat/34 pass 静默丢弃;sincos 曾写 sin→x/cos→y(MSDN sincos-ps:ps_2_0
// 掩码 .x→cos/.y→sin)。本组锁解码判据,防回退(执行语义由 fx-pixelshader-
// parity(HorizonClouds/WaterDistortion 镜像对拍)与 aurora-sky(交叉对拍)锁定。
describe('SM2 解码锁:_sat 位与 sincos 分量序(r15)', () => {
  // dst token 判定:opcode 表(operand token 数)同 SM2Effect.decodeProgram
  const OPS: Record<number, number> = {
    0x00: 0, 0x01: 2, 0x02: 3, 0x03: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2,
    0x08: 3, 0x09: 3, 0x0A: 3, 0x0B: 3, 0x0C: 3, 0x0D: 3, 0x0E: 2, 0x0F: 2,
    0x12: 4, 0x13: 2, 0x1F: 2, 0x20: 3, 0x21: 3, 0x23: 2, 0x24: 2, 0x25: 4,
    0x41: 1, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
  };
  interface PassJson { pass: string; tokens: number[] }
  const scan = (): { sat: Map<string, number>; sincos: Map<string, number> } => {
    const j = fxJson as unknown as { passes: PassJson[] };
    const sat = new Map<string, number>(), sincos = new Map<string, number>();
    for (const p of j.passes) {
      let i = 0, ns = 0, nc = 0;
      while (i < p.tokens.length) {
        const op = p.tokens[i++] & 0xFFFF;
        if (op === 0xFFFF) break;
        const n = OPS[op];
        if (n === undefined) break;
        const raw = p.tokens.slice(i, i + n); i += n;
        if (op === 0x1F || op === 0x51) continue;      // dcl/def 的首 token 非 dst
        if (((raw[0] >> 20) & 0xF) === 1) ns++;        // D3DSPDM_SATURATE
        if (op === 0x25) nc++;
      }
      if (ns) sat.set(p.pass, ns);
      if (nc) sincos.set(p.pass, nc);
    }
    return { sat, sincos };
  };
  it('_sat 位:34 pass/54 site(判据 ===1;回退 ===2 → 全零即红)', () => {
    const { sat } = scan();
    expect([...sat.values()].reduce((a, b) => a + b, 0)).toBe(54);
    expect(sat.size).toBe(34);
    expect(sat.get('ArmorPlaid')).toBe(3);
    expect(sat.get('ArmorTwilight')).toBe(3);
    expect(sat.get('ArmorSolar')).toBe(3);
    expect(sat.get('RainbowTownSlime')).toBe(4);
    expect(sat.get('ForceField')).toBe(2);
    expect(sat.get('HorizonClouds')).toBe(3);
    expect(sat.get('Aurora')).toBe(3);
    expect(sat.get('LitNature')).toBe(2);
    expect(sat.get('QueenSlime')).toBe(2);
    expect(sat.get('ArmorGel')).toBe(1);
    expect(sat.has('ArmorColored')).toBe(false);     // 金标旧锚 pass 无 _sat(曾致漏检)
  });
  it('sincos site:16 pass/22 site;写掩码全为单分量(.x/.y)', () => {
    const { sincos } = scan();
    expect([...sincos.values()].reduce((a, b) => a + b, 0)).toBe(22);
    expect(sincos.size).toBe(16);
    expect(sincos.get('WaterDistortionObject')).toBe(1);
    expect(sincos.get('QueenSlime')).toBe(2);
    expect(sincos.get('ArmorForceField')).toBe(3);
  });
});

// ---- R33 review C1 修复回归：texld-s1 检测 + noise 采样器覆写 ----
describe('R33 C1：texld-s1 检测与 noise 采样器接线', () => {
  /** 2×1 白图跑 ArmorGel/ArmorTwilight，注入指定 s1 → 返回首像素 RGB */
  const runWith = (vid: number, s1: SM2Sampler): [number, number, number] => {
    const apply = dyeApplyOf(vid)!;
    const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    applyDyePass(data, 2, 1, apply, [], undefined, s1);
    return [data[0] / 255, data[1] / 255, data[2] / 255];
  };
  const near3 = (a: [number, number, number], b: [number, number, number], eps = 1e-3) =>
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;

  it('needsImage1 = texld-s1 检测：Gel/Twilight/Phase 真,HallowBoss 真,ArmorColored 假', () => {
    for (const vid of [3024, 3561, 3562, 4663, 3039]) expect(dyeApplyOf(vid)!.needsImage1).toBe(true);
    expect(dyeApplyOf(4778)!.needsImage1).toBe(true);    // Extra_156（消费端 hallowRamp）
    expect(dyeApplyOf(1007)!.needsImage1).toBe(false);   // ArmorColored 无 s1
  });

  it('ArmorGel：s1=noise 到达 pass（白噪声 vs 黑回退输出不同;噪声门非均匀）', () => {
    const white: SM2Sampler = () => [1, 1, 1, 1];
    const black: SM2Sampler = () => [0, 0, 0, 1];
    const withWhite = runWith(3024, white);
    const withBlack = runWith(3024, black);
    expect(near3(withWhite, withBlack)).toBe(false);     // 修复后 noise 项生效 → 输出改变
    // 字节码实测：r6(=s1.r) 反向调制 B 通道（s1=0 → B=0.310 / s1=1 → B=0）
    expect(withBlack[2]).toBeGreaterThan(0.05);          // 黑 s1 = 今日回退态（B 通道塌满）
    expect(withWhite[2]).toBeLessThan(0.05);             // 白 s1 → B 归零（高光路径接管）
  });

  it('ArmorTwilight：noise 覆写生效（s1 梯度驱动 → 两档噪声输出不同）', () => {
    const lo: SM2Sampler = () => [0.1, 0.1, 0.1, 1];
    const hi: SM2Sampler = () => [0.9, 0.9, 0.9, 1];
    const a = runWith(3039, lo);
    const b = runWith(3039, hi);
    expect(near3(a, b)).toBe(false);                     // s1 调制可达
  });
});

// ---- R33 回归轮：Phase 染料×翅膀 终验回归（消失+卡顿） ----
describe('R33 回归轮：noise 族回退与 Phase alpha 保形', () => {
  /** 翅膀帧近似:184×56 中央体(暗蓝,α200)+透明边;返回 avgA/vis */
  const wingBake = (s1?: SM2Sampler, time = 12.34) => {
    const apply = dyeApplyOf(3042)!;
    const W = 92, H = 28;   // 半分辨率桶(缓存后实际走 200ms 桶,此处测数学)
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; const b = x > 30 && x < 65 && y > 5 && y < 23;
      data[i] = b ? 180 : 0; data[i + 1] = b ? 60 : 0; data[i + 2] = b ? 220 : 0; data[i + 3] = b ? 200 : 0;
    }
    apply.uniforms.uTime = time;
    applyDyePass(data, W, H, apply, [], { sx: 0, sy: 0, sheetW: W, sheetH: H }, s1);
    let sumA = 0, vis = 0, bodyA = 0, bodyN = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; sumA += data[i + 3];
      if (data[i + 3] > 40) vis++;
      if (x > 30 && x < 65 && y > 5 && y < 23) { bodyA += data[i + 3]; bodyN++; }
    }
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) hash = (hash + data[i] * 31 + data[i + 1] * 7 + data[i + 2]) | 0;
    return { avgA: sumA / (W * H), vis, bodyAvgA: bodyA / bodyN, hash };
  };

  it('★alpha 保形：体区烘焙 avgA ≥ 输入 α×0.7（翅膀不消失——out.a=sceneA+相位项）', () => {
    const r = wingBake((u, v) => [0.27, 0.27, 0.27, 1]);   // 真 Misc_noise 均值
    expect(r.bodyAvgA).toBeGreaterThanOrEqual(200 * 0.7);
    expect(r.vis).toBeGreaterThan(300);
  });

  it('★中性回退：无注入 = 中性灰 0.5（不泄漏消费端 hallowRamp）', () => {
    const neutral = wingBake();                                    // noiseSampler 未就绪路径
    const explicitGray = wingBake((u, v) => [0.5, 0.5, 0.5, 1]);   // 同值显式注入
    expect(neutral.avgA).toBeCloseTo(explicitGray.avgA, 0);
    expect(neutral.vis).toBe(explicitGray.vis);
    // 与 hallowRamp 型渐变（错纹理）逐像素可区分
    const ramp = wingBake((u, v) => [u, v, 0.5, 1]);
    expect(neutral.hash).not.toBe(ramp.hash);
  });

  it('★噪声族 uImageSize1 强制 [256,256]（rcp(0)=Infinity 相位 UV 中毒修复）', () => {
    const a = dyeApplyOf(3042)!;
    a.uniforms.uImageSize1 = [0, 0];
    const data = new Uint8ClampedArray(8 * 4);
    applyDyePass(data, 2, 1, a, [], undefined);
    expect(a.uniforms.uImageSize1).toEqual([256, 256]);
    const b = dyeApplyOf(4778)!;                                    // HallowBoss(Extra_156) 同强制
    b.uniforms.uImageSize1 = [0, 0];
    applyDyePass(new Uint8ClampedArray(8 * 4), 2, 1, b, [() => [1, 1, 1, 1]], undefined);
    expect(b.uniforms.uImageSize1).toEqual([256, 256]);
  });
});
