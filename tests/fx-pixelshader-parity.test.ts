// 三个 PixelShader 系统的字节码锚锁测（2026-08-20 shader 升级批）:
//   LensFlare(obj69)/HorizonClouds(obj62)/WaterProcessor(obj49)/WaterDistortionObject(obj50)
// 金标 = src/fx/SM2Effect.ts 直接执行 PixelShader.cso 的 SM2 字节码（非手抄公式）——
// 本测试把"解释器执行字节码的输出"与"本仓 TS 实现公式"逐探针对拍,任何一侧公式
// 漂移立即红。行号注释指向 fxPixel.txt 反汇编（tools/disasm-fx.mjs 产物）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPass, defaultUniforms, SM2Pass, type SM2Sampler } from '../src/fx/SM2Effect';
import { horizonCloudShade, MOON_COLORS } from '../src/render/SkyRenderer';
import { waveProcessorStep, washShapeValue } from '../src/render/WaterWaves';

// ---------- 解释器执行工具 ----------
interface ExecOut { out: [number, number, number, number] | null }
function execPixel(
  pass: SM2Pass, uniforms: ReturnType<typeof defaultUniforms>,
  samplers: SM2Sampler[], t0: [number, number],
  v0: [number, number, number, number] = [1, 1, 1, 1],
  t1?: [number, number],
): ExecOut['out'] {
  const c = pass.setupConstants(uniforms);
  const regs = new Float64Array(32 * 4);
  const tex = new Float64Array(8 * 4);
  tex[0] = t0[0]; tex[1] = t0[1];
  if (t1) { tex[4] = t1[0]; tex[5] = t1[1]; }   // t1 预置(解释器只写 t0)
  const v = new Float64Array(8 * 4);
  v[0] = v0[0]; v[1] = v0[1]; v[2] = v0[2]; v[3] = v0[3];
  const o = new Float64Array(4);
  return pass.execPixel(c, regs, tex, v, o, t0[0], t0[1], samplers);
}
const pad255 = (v: number[]) => v.map((x) => Math.round(x * 255));

// ================= LensFlare（obj69,fxPixel.txt :3215-3229） =================
describe('LensFlare 字节码锚（occlusion 采样语义定谳）', () => {
  it('全 6 指令:final = 贴图.rgba × 元素色.rgba × 遮挡.α（四通道同乘标量）', () => {
    const pass = getPass('LensFlare')!;
    const u = defaultUniforms();
    const flare: SM2Sampler = () => [0.9, 0.8, 0.7, 0.6];        // s0 光斑贴图
    const occ: SM2Sampler = () => [0.1, 0.2, 0.3, 0.4];          // s1 1×1 遮挡纹理(α=0.4)
    const out = execPixel(pass, u, [flare, occ], [0.3, 0.3], [0.7, 0.6, 0.5, 0.8]);
    expect(out).not.toBeNull();
    // 手算:0.9·0.7·0.4 / 0.8·0.6·0.4 / 0.7·0.5·0.4 / 0.6·0.8·0.4
    expect(out![0]).toBeCloseTo(0.252, 12);
    expect(out![1]).toBeCloseTo(0.192, 12);
    expect(out![2]).toBeCloseTo(0.14, 12);
    expect(out![3]).toBeCloseTo(0.192, 12);
  });
  it('遮挡采样坐标恒 (0.5, 0)——1×1 纹理与 uv 无关;遮挡=1 时恒等', () => {
    const pass = getPass('LensFlare')!;
    const u = defaultUniforms();
    let occCoord: [number, number] | null = null;
    const occ: SM2Sampler = (uu, vv) => { occCoord = [uu, vv]; return [0, 0, 0, 0.25]; };
    const flare: SM2Sampler = () => [1, 1, 1, 1];
    const out = execPixel(pass, u, [flare, occ], [0.9, 0.1], [1, 1, 1, 1]);
    expect(occCoord).toEqual([0.5, 0.5]);   // :3225 mov r1.xy, c0 = c0.x 复制(0.5);1×1 纹理全坐标同值
    expect(out).toEqual([0.25, 0.25, 0.25, 0.25]);               // ×occ.α 全通道
  });
  it('结论:现实现"occ 预乘 intensity → 贴图×元素色×α"与字节码数学等价(乘法结合律)', () => {
    // drawLensFlare: tintedFlareSprite(tex×元素RGB) × globalAlpha(mul·ioi·i·intensity·occ)
    const tex = 0.9, elem = 0.7, mul = 8 / 51, intensity = 0.62, occ = 0.37;
    const impl = tex * elem * (mul * intensity * occ);           // 本仓渲染链
    expect(impl).toBeCloseTo(0.9 * 0.7 * 0.37 * (8 / 51) * 0.62, 15);
  });
});

// ================= HorizonClouds（obj62,fxPixel.txt :2914-2998） =================
describe('HorizonClouds 字节码锚（逐像素 shade 公式）', () => {
  // 采样器:全 1(实心云)与稀疏云两档
  const solid: SM2Sampler = () => [1, 1, 1, 1];
  const runHC = (
    texSampler: SM2Sampler, v0: [number, number, number, number],
    drawPos: [number, number], cel: [number, number, number],
    t0: [number, number], t1: [number, number],
  ) => {
    const pass = getPass('HorizonClouds')!;
    const u = defaultUniforms();
    u.uColor = [1, 0.9647, 0.8];
    u.uDrawPosition = drawPos;
    u.uShaderSpecificData = [cel[0], cel[1], cel[2], 0];
    return execPixel(pass, u, [texSampler], t0, v0, t1);
  };
  const shadeOf = (texSumA: number, texR: number,
    frag: [number, number], draw: [number, number], cel: [number, number],
    uv: [number, number], intensity: number) => horizonCloudShade(
    texSumA, texR, frag[0], frag[1], draw[0], draw[1], cel[0], cel[1], uv[0], uv[1], intensity);

  it('锚1:实心云/远天体(d=80.16) → inner<0 被 #57 _sat 钳 0,shade=0,输出=贴图×v0', () => {
    const v0 = [0.6, 0.62, 0.68, 0.9];
    const out = runHC(solid, v0, [100, 50], [200, 60, 0.8], [0.4, 0.4], [120, 55])!;
    // shade=sat(inner·0.8)·D³:solid→A=0、inner=0.983·0.283−0.3=−0.0219<0 → shade=0
    // (2026-08-24 r15 _sat 修复:旧镜像无钳得 −0.0346 负 shade——字节码恒 ≥0)
    expect(out[0]).toBeCloseTo(0.6, 6);
    expect(out[1]).toBeCloseTo(0.62, 6);
    expect(out[2]).toBeCloseTo(0.68, 6);
    expect(out[3]).toBeCloseTo(0.9, 6);
    // 手算公式对拍(实心:texSumA=5/texR=1)
    const shade = shadeOf(5, 1, [120, 55], [100, 50], [200, 60], [0.4, 0.4], 0.8);
    expect(shade).toBe(0);
    // 尾式:out = r2 + shade·(r1·v.a − r2),shade=0 → out=r2=tex·v
    const r1 = [(0.6 + 1) / 2, (0.62 + 0.9647) / 2, (0.68 + 0.8) / 2, (0.9 + 1) / 2];
    for (const k of [0, 1, 2] as const) {
      expect(v0[k] + shade * (r1[k] * 0.9 - v0[k])).toBeCloseTo(out[k], 6);
    }
  });
  it('锚2:向阳边缘(R=1,B=1) → 正 shade,云向阳侧提亮', () => {
    // frag = 云右缘(uv (1,0.5) → R=1),天体沿 +x:dot(n1,n2)=1
    const frag: [number, number] = [117, 50];
    const out = runHC(solid, [0.5, 0.52, 0.6, 0.8], [100, 50], [140, 50, 1.0],
      [1.0, 0.5], frag)!;
    const shade = shadeOf(5, 1, frag, [100, 50], [140, 50], [1.0, 0.5], 1.0);
    expect(shade).toBeGreaterThan(0.3);                    // ≈0.34(手算 0.16·D³)
    // 尾式逐通道对拍
    const v = [0.5, 0.52, 0.6, 0.8];
    const r1 = [(0.5 + 1) / 2, (0.52 + 0.9647) / 2, (0.6 + 0.8) / 2, 0.9];
    for (const k of [0, 1, 2] as const) {
      expect(v[k] + shade * (r1[k] * 0.8 - v[k])).toBeCloseTo(out[k], 6);
    }
  });
  it('锚3:稀疏云(texSumA=2 → coverage 0.6)+thickness #25 _sat 钳(texR=0.4→sat(−0.22)=0)', () => {
    // 半透明云:α=0.4 → texSumA=2(coverage=0.6);texR=0.4 → thickness=1−4·sat(−0.22)=1
    // (旧无钳值 1.88;A=max(1,0.6)=1)inner=0+0.6−0.3−0.553<0 → shade=0 → out=r2
    const sparse: SM2Sampler = () => [0.4, 0.4, 0.4, 0.4];
    const frag: [number, number] = [130, 60];
    const out = runHC(sparse, [0.5, 0.5, 0.5, 0.7], [100, 50], [150, 70, 0.9],
      [0.5, 0.5], frag)!;
    const shade = shadeOf(2, 0.4, frag, [100, 50], [150, 70], [0.5, 0.5], 0.9);
    expect(shade).toBe(0);
    const v = [0.5, 0.5, 0.5, 0.7];
    const texR = 0.4, texA = 0.4;                          // 稀疏云贴图值
    const r1 = [(0.5 + 1) / 2, (0.5 + 0.9647) / 2, (0.5 + 0.8) / 2, 0.85];
    for (const k of [0, 1, 2] as const) {
      const r2 = texR * v[k];                              // r2.rgb = tex.rgb·v
      expect(r2 + shade * (r1[k] * texA * 0.7 - r2)).toBeCloseTo(out[k], 6);
    }
  });
  it('distTerm d>50 恒 0(非 −1):#51 第三源 = c3.x=0(正 shade 域判别)', () => {
    // d=55(刚过 50):B=R=1、A=0 → inner=1−0.3+distTerm;distTerm=0→0.7,
    // 若误用 −1 → inner=−0.3 被 #57 _sat 钳 0——用正 shade 域锁语义
    const shade = shadeOf(5, 1, [160, 50], [100, 50], [215, 50], [1.0, 0.5], 1);
    // D=max(0.3,1.3−55/1800)=1.269444,D³=2.045696;shade=sat(0.7)·D³
    expect(shade).toBeCloseTo(1.4319872063614545, 9);
    expect(shade).toBeGreaterThan(1);
  });
  it('GetMoonStrength = |4−phase|/4(GetCelestialBodyColors 月色乘子)', () => {
    // HorizonHelper.cs:134-136 Remap(|4−phase|,0,4,0,1)
    expect(Math.abs(4 - 0) / 4).toBe(1);    // 满月全强度
    expect(Math.abs(4 - 4) / 4).toBe(0);    // 新月零强度(uColor 黑)
    expect(Math.abs(4 - 2) / 4).toBe(0.5);
    expect(MOON_COLORS.length).toBe(9);     // :28-36 表 9 项
    expect(MOON_COLORS[0]).toEqual([230, 235, 255]);
    expect(MOON_COLORS[1]).toEqual([250, 235, 160]);
    expect(MOON_COLORS[8]).toEqual([225, 180, 255]);
  });
});

// GLSL 源码级回归守卫(公式常量/结构锁定,同 gl-layer-regression 模式)
describe('GLSpriteLayer HorizonClouds GLSL 守卫(源码级)', () => {
  const SRC = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
  it('云 shader 五点采样偏移/常量链与字节码一致', () => {
    expect(SRC).toContain('vUv + vec2(0.0, -0.035)');      // #10 上
    expect(SRC).toContain('vUv + vec2(0.0, 0.14)');        // #11 下(0.14 非 0.035!)
    expect(SRC).toContain('vUv + vec2(-0.035, 0.0)');      // #12 左
    expect(SRC).toContain('vUv + vec2(0.035, 0.0)');       // #13 右
    expect(SRC).toContain('1.0 - 0.2 * (up.a + dn.a + lf.a + rt.a + cc.a)');  // #23
    expect(SRC).toContain('4.0 * clamp(cc.r - 0.62, 0.0, 1.0)');           // #24-26(★#25 _sat)
    expect(SRC).toContain('1.0 - (dist * 0.0166667) * (dist * 0.0166667)');   // #38-39 (d/60)²
    expect(SRC).toContain('dist <= 50.0 ? dist / 50.0 - 1.0 : 0.0');         // #51(else=0)
    expect(SRC).toContain('clamp(B * R - 0.05, 0.0, 1.0) * A + 0.6 * A + B * R - 0.3 + distTerm');  // #45-53(★#45 _sat)
    expect(SRC).toContain('clamp(inner * uCelestial.z, 0.0, 1.0) * D * D * D');       // #54-57(★#57 _sat)
    expect(SRC).toContain('1.3 - dist * 0.000555556');     // #49 (c4.x=1/1800)
    expect(SRC).toContain('mix(uVertColor, vec4(uCelestialCol, 1.0), 0.5) * cc.a');   // #60-61
    expect(SRC).toContain('r2 + shade * (r1 * uVertColor.a - r2)');                   // #63-64
  });
  it('wrap2 双轴 REPEAT 采样器(vanilla LinearWrap)与 cloudQuad 程序切换回退', () => {
    expect(SRC).toMatch(/wrap2[\s\S]{0,300}TEXTURE_WRAP_S, gl\.REPEAT[\s\S]{0,120}TEXTURE_WRAP_T, gl\.REPEAT/);
    expect(SRC).toContain('cloudQuad(');
    // cloudQuad 末尾切回基础程序(uniform 属程序态)
    expect(SRC).toMatch(/cloudQuad[\s\S]{0,2000}gl\.useProgram\(this\.prog\);/);
  });
});

// ================= WaterProcessor（obj49,fxPixel.txt :2476-2542） =================
describe('WaterProcessor 字节码锚（传播内核 waveProcessorStep）', () => {
  const proc = (L: number, R: number, U: number, D: number, C: number, G: number) => {
    const pass = getPass('WaterProcessor')!;
    const u = defaultUniforms();
    u.uImageSize0 = [4, 4];                       // 1/4 texel 偏移(采样可落在邻格)
    // 4×4 网格:像素 (x,y) 值按回调;中心像素 (2,2) 在 uv (2.5/4, 2.5/4)
    const at = (x: number, y: number): [number, number, number, number] => {
      const isL = x === 1 && y === 2, isC = x === 2 && y === 2;
      const isR = x === 3 && y === 2, isU = x === 2 && y === 1, isD = x === 2 && y === 3;
      const v = isL ? L : isR ? R : isU ? U : isD ? D : isC ? C : 0.5;
      const g = isC ? G : 0.5;
      return [v, g, 0, 1];
    };
    const s0: SM2Sampler = (uu, vv) => at(Math.min(3, Math.max(0, Math.floor(uu * 4))),
      Math.min(3, Math.max(0, Math.floor(vv * 4))));
    return execPixel(pass, u, [s0], [2.5 / 4, 2.5 / 4]);
  };
  it('中性场定点(0.5,0.5):S=0 → 输出恒中性', () => {
    const out = proc(0.5, 0.5, 0.5, 0.5, 0.5, 0.5)!;
    expect(pad255(out)).toEqual([128, 128, 0, 255]);
    expect(waveProcessorStep(0.5, 0.5, 0.5, 0.5, 0.5, 0.5)).toEqual([0.5, 0.5]);
  });
  it('左邻 +0.75 凸起:解释器 vs waveProcessorStep 全等(158,165)', () => {
    const out = proc(0.75, 0.5, 0.5, 0.5, 0.5, 0.5)!;
    expect(pad255(out)).toEqual([158, 165, 0, 255]);
    const mine = waveProcessorStep(0.75, 0.5, 0.5, 0.5, 0.5, 0.5);
    // 解释器 = shader 寄存器原值;本实现额外含渲染目标 unorm8 写入量化(≤1/256)
    expect(Math.abs(mine[0] - out![0])).toBeLessThanOrEqual(1 / 512 + 1e-9);
    expect(Math.abs(mine[1] - out![1])).toBeLessThanOrEqual(1 / 256 + 1e-9);
  });
  it('速度注入(G=1)+中心高度 0.9 复合场:两实现逐位一致', () => {
    const out = proc(0.5, 0.50390625, 0.5, 0.5, 0.9, 1)!;
    const mine = waveProcessorStep(0.5, 0.50390625, 0.5, 0.5, 0.9, 1);
    expect(Math.abs(mine[0] - out[0])).toBeLessThanOrEqual(1 / 512 + 1e-9);
    expect(Math.abs(mine[1] - out[1])).toBeLessThanOrEqual(1 / 256 + 1e-9);
  });
});

// ================= WaterDistortionObject（obj50,fxPixel.txt :2544-2578） =================
describe('WaterDistortionObject 字节码锚（洗掠形状 washShapeValue）', () => {
  const runWash = (vColor: [number, number, number], t0: [number, number]) => {
    const pass = getPass('WaterDistortionObject')!;
    const u = defaultUniforms();
    return execPixel(pass, u, [], t0, vColor);
  };
  it('内圈 r<2π:max(r,2π) 钳 → φ≈−0.0032 恒小负角,cosφ>0 → 恒零', () => {
    // vColor=(0,0.5,1):flowSigned=(−0.5,0);t0=(0.6,0.5):uvc=(0.1,0),r=2.512<6.28
    // (2026-08-24 r15 sincos 修:obj50 `sincos r2.x`=cos 非 sin——钳后常值角
    //  cos(−0.0032)≈1>0 → 内圈恒 0;旧 sin 校准值 0.0025483 弱尾迹作废)
    const out = runWash([0, 0.5, 1], [0.6, 0.5])!;
    expect(out[0]).toBe(0);
    expect(out[3]).toBeCloseTo(out[0], 12);      // 输出 (s,0,0,s)
    expect(out[1]).toBe(0);
    expect(washShapeValue(0.1, 0, -0.5, 0, 1)).toBe(0);
  });
  it('中圈 2π≤r<4π 与外圈 r≥4π:逐点一致(cos 负半波域 0.35/正域 0.45/外缘)', () => {
    // r=8.79 → φ≈2.507:cosφ=−0.8056<0 → −cosφ·0.8 = 0.6451(sin 旧校准此点=0)
    expect(runWash([-0.5 + 0.5, 0 + 0.5, 1], [0.85, 0.5])![0]).toBeCloseTo(0.6451102190623945, 9);
    expect(washShapeValue(0.35, 0, -0.5, 0, 1)).toBeCloseTo(0.6451102190623945, 6);   // float32 常量舍入
    // r=11.3 → φ≈−1.263:cosφ=0.3035≥0 → 0(旧 sin 值 0.3811 作废)
    const a = runWash([0, 0.5, 0.5], [0.95, 0.5])![0];
    expect(a).toBe(0);
    expect(washShapeValue(0.45, 0, -0.5, 0, 0.5)).toBeCloseTo(a, 6);
    // 角点 r≈15.7 ≥ 4π:恒 φ=−0.00637111,cos>0 → 0
    const b = runWash([0, 0.5, 0.5], [0.98, 0.9])![0];
    expect(washShapeValue(0.48, 0.4, -0.5, 0, 0.5)).toBeCloseTo(b, 6);
  });
  it('输出四通道 (s,0,0,s) 语义:R=位移强度,A=s(非预乘 blend 消费)', () => {
    const out = runWash([0, 0.5, 0.5], [0.95, 0.5])!;
    expect(out![2]).toBe(0);
    expect(out![3]).toBeCloseTo(out![0], 12);
  });
});
