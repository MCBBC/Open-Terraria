// 一次性仲裁：SM2 解释器直跑 obj49/obj62/obj69 字节码，校验手译公式。
// 运行：npx vitest run tests/_fxsm2-arb.test.ts（跑完即删，不入库）
import { describe, it } from 'vitest';
import { getPass, defaultUniforms, type SM2Sampler } from '../src/fx/SM2Effect';

const pad8 = (v: number[]) => v.map((x) => Math.round(x * 255));

describe('SM2 字节码仲裁', () => {
  it('WaterProcessor: 中性场(0.5,0.5,0,1) 一步', () => {
    const pass = getPass('WaterProcessor')!;
    const u = defaultUniforms();
    u.uImageSize0 = [480, 270];           // 1/4 屏
    const c = pass.setupConstants(u);
    const regs = new Float64Array(32 * 4);
    const tex = new Float64Array(8 * 4);
    const v0 = new Float64Array(8); v0[0] = v0[1] = v0[2] = v0[3] = 1;
    const o = new Float64Array(4);
    const s0: SM2Sampler = () => [0.5, 0.5, 0, 1];
    const r = pass.execPixel(c, regs, tex, v0, o, 0.5, 0.5, [s0]);
    console.log('neutral→', pad8(r!), 'c0/c1=', c[0], c[4]);
  });
  it('WaterProcessor: 邻左 0.75 其余中性 一步', () => {
    const pass = getPass('WaterProcessor')!;
    const u = defaultUniforms();
    u.uImageSize0 = [4, 4];
    const c = pass.setupConstants(u);
    const regs = new Float64Array(32 * 4);
    const tex = new Float64Array(8 * 4);
    const v0 = new Float64Array(8); v0[0] = v0[1] = v0[2] = v0[3] = 1;
    const o = new Float64Array(4);
    const s0: SM2Sampler = (uu, vv) => {
      // 网格 4×4: 中心 uv=(2.5/4, 2.5/4)? 取 uv 使中心像素; 左邻像素 R=0.75
      // 像素中心: x+0.5)/4; 我们在 uv=(0.625,0.625) 采样 → 像素 (2,2)
      // 左邻 = 像素 (1,2)。R: (1,2)=0.75, 其他 0.5, G 全 0.5, B 0
      const x = Math.floor(uu * 4), y = Math.floor(vv * 4);
      const isLeft = x === 1 && y === 2;
      return [isLeft ? 0.75 : 0.5, 0.5, 0, 1];
    };
    const r = pass.execPixel(c, regs, tex, v0, o, 2.5 / 4, 2.5 / 4, [s0]);
    console.log('leftBump→', pad8(r!));
    // 手算（-1 版）: S=(2·0.75−1)+0+0+0−1=0.5; c=0; T=2(0.125−0)=0.25; w=0;
    // H=0.25; newH=0.2406; outR=round(512·0.6203)/512=318/512=0.62109→255:158.4
    // 手算（无-1版）: S=1.5; T=2·0.375=0.75; H=0.75; newH=0.7219; outR≈0.861
  });
  it('HorizonClouds: 公式探针', () => {
    const pass = getPass('HorizonClouds')!;
    const u = defaultUniforms();
    u.uColor = [1, 0.9647, 0.8];
    u.uDrawPosition = [100, 50];
    u.uShaderSpecificData = [200, 60, 0.8, 0];
    const c = pass.setupConstants(u);
    const regs = new Float64Array(32 * 4);
    const tex = new Float64Array(8 * 4);
    const v0 = new Float64Array(8); v0[0] = 0.6; v0[1] = 0.62; v0[2] = 0.68; v0[3] = 0.9;
    const o = new Float64Array(4);
    // 云贴图: 全部不透明白 (r=g=b=a=1)? 试: 全 1
    const s0: SM2Sampler = () => [1, 1, 1, 1];
    const t0x = 0.4, t0y = 0.4;   // uv
    // t1 = 像素位。execPixel 的 tex[0]=t0x 是 t0;t1 需要… execPixel 只设 t0!
    // 看看 t1 是怎么进来的 —— tex 数组预置 t1
    tex[4] = 120; tex[5] = 55;    // t1.xy
    const r = pass.execPixel(c, regs, tex, v0, o, t0x, t0y, [s0]);
    console.log('horizon→', r, pad8(r!));
    // 手算: uv=(.4,.4): U=(.4,.365)D=(.4,.54)L=(.365,.4)R=(.435,.4)C=(.4,.4) 全1
    // sumα=5 → cov=1−1=0; C.r=1 → thick=1−4(1−.62)=1−1.52=−0.52; A=max(−.52,0)=0
    // frag=(120,55); d1=(20,5); n1=(20,5)/20.618=(.9701,.2425)
    // d2=(200−120,60−55)=(80,5); |d2|=80.156; n2=(.99756,.06234); dot=.98177
    // falloff=1−(80.156/60)²=1−1.7879=−0.7879; B=max(.98177,−.7879)=.98177
    // R=|uv·2−1|=|(.6,−.2)|=√(.36+.04)=.63246
    // BR−.05=.62117; term1=.62117·0=0; term2=.6B=.58906; dist=(d≤50?−1)=−1(d>50)
    // shadeRaw=0+.58906−.3−1=−0.71094; D=max(.3,1.3−.000556·80.156)=1.25543;D³=1.9771
    // shade=.8·(−.71094)·1.9771=−1.1246 → 负! final=r2+shade·r1
  });
  it('LensFlare: occlusion 乘法语义', () => {
    const pass = getPass('LensFlare')!;
    const u = defaultUniforms();
    const c = pass.setupConstants(u);
    const regs = new Float64Array(32 * 4);
    const tex = new Float64Array(8 * 4);
    const v0 = new Float64Array(8); v0[0] = 0.7; v0[1] = 0.6; v0[2] = 0.5; v0[3] = 0.8;
    const o = new Float64Array(4);
    const s0: SM2Sampler = () => [0.9, 0.8, 0.7, 0.6];
    const s1: SM2Sampler = () => [0.1, 0.2, 0.3, 0.4];   // 1×1 遮挡: alpha=0.4
    const r = pass.execPixel(c, regs, tex, v0, o, 0.3, 0.3, [s0, s1]);
    console.log('lens→', r, pad8(r!));
    // 预期: (0.9·0.7·0.4, 0.8·0.6·0.4, 0.7·0.5·0.4, 0.6·0.8·0.4)
  });
});
