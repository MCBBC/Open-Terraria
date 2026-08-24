// 极光天空(AuroraSky.cs)锁测试——月相门 / _lastSkyColor 赋值 / 首尾 180tick
// 淡入出 / opacity×0.08 tileColor 渗入 / 淡入淡出速率。
// 锚:AuroraSky.cs:69-75(gate)/:85-123(月相 switch)/:191-402(段几何) /
// :33-56(Update)/:376-379(_lastSkyColor)/:410-422(ModifyTileColor);
// Main.cs:63356-63361(SetBackColor 尾调用序);Main.hslToRgb :47266-47296。
import { describe, it, expect } from 'vitest';
import {
  auroraMode, auroraGatedOpacity, auroraLastSkyColor, AuroraSky, AURORA_SEG,
} from '../src/render/AuroraSky';
import {
  colorOfTheSkies, skySeed, setFrameAurora, setFrameHorizon, setFrameBiome,
  setFrameCloudDim, setFrameLightning,
} from '../src/lighting/SkyColor';

describe('AuroraSky 月相门(AuroraSky.cs:85-123 switch)', () => {
  it('QuarterAtLeft(:102)/HalfAtRight(:113)return 不画', () => {
    expect(auroraMode(3)).toBeNull();
    expect(auroraMode(6)).toBeNull();
  });
  it('带数/α乘子/饱和度:Full=3带、3QL/QR=2带+flag5、HalfL/3QR=3带+×0.5、Empty=3带', () => {
    expect(auroraMode(0)).toMatchObject({ bands: 3, full: true, alphaMul: 1, saturation: 1, hueFreq: 2.5 });
    expect(auroraMode(1)).toMatchObject({ bands: 2, twoBand: true, alphaMul: 1, saturation: 1 });
    expect(auroraMode(2)).toMatchObject({ bands: 3, emptyLike: true, halfLike: true, dim: true, alphaMul: 0.5, saturation: 1, hueFreq: 0.5, hueOffset: 0.02 });
    expect(auroraMode(4)).toMatchObject({ bands: 3, emptyLike: true, halfLike: false, alphaMul: 1, saturation: 1, hueFreq: 1, hueOffset: 0.45 });
    expect(auroraMode(5)).toMatchObject({ bands: 2, twoBand: true, alphaMul: 1, saturation: 0.5 });
    expect(auroraMode(7)).toMatchObject({ bands: 3, alphaMul: 0.5, saturation: 0.5, hueFreq: 0.5, hueOffset: 0.02 });
  });
});

describe('AuroraSky 首尾 180tick 淡入出(:69-75)', () => {
  it('夜 90t → ×0.5;32310t → ×0.5(尾段对称);mid-night → ×1;白天 → 0', () => {
    expect(auroraGatedOpacity(1, 90, false)).toBeCloseTo(0.5, 12);
    expect(auroraGatedOpacity(1, 32400 - 90, false)).toBeCloseTo(0.5, 12);
    expect(auroraGatedOpacity(1, 16200, false)).toBeCloseTo(1, 12);
    expect(auroraGatedOpacity(1, 100, true)).toBe(0);            // :72 白天 return
    expect(auroraGatedOpacity(0.005, 16200, false)).toBe(0);     // ≤0.01 return
  });
});

describe('_lastSkyColor 赋值(:376-379:带0/段 num9=19 的 color)', () => {
  // num10=19/140;color = hslToRgb((num5 + cos(num10·2π·num7)·0.1)%1, saturation, 0.5)
  // 参考值经 C# 式独立计算锚定(num5 = 12.34·60/60 = globalTime 740.4s/60)
  const gt = 740.4;
  it('满月/左三分之二:num7=2.5 → cos=−0.5320 → 绿色系', () => {
    expect(auroraLastSkyColor(0, gt)).toEqual([71, 255, 0]);
    expect(auroraLastSkyColor(1, gt)).toEqual([71, 255, 0]);
  });
  it('半月族:num7=0.5 → cos=+0.9105;空月族:num7=1', () => {
    expect(auroraLastSkyColor(2, gt)).toEqual([0, 255, 150]);
    expect(auroraLastSkyColor(4, gt)).toEqual([0, 255, 111]);
  });
  it('右四分之一:饱和度 0.5(:111);右三分之二:0.5 饱和+num7=0.5(:121-122)', () => {
    expect(auroraLastSkyColor(5, gt)).toEqual([99, 191, 64]);
    expect(auroraLastSkyColor(7, gt)).toEqual([64, 191, 139]);
  });
  it('不画月相 → (0,0,0)(默认 Color,ModifyTileColor 强制 A=255 后即黑)', () => {
    expect(auroraLastSkyColor(3, gt)).toEqual([0, 0, 0]);
    expect(auroraLastSkyColor(6, gt)).toEqual([0, 0, 0]);
  });
  it('段常量:140(AuroraSky.cs:135 num6)', () => {
    expect(AURORA_SEG).toBe(140);
  });
});

describe('AuroraSky.Update 淡入淡出(:33-56)', () => {
  it('淡入 +0.3/s 钳 1(:50-54);淡出 −0.5/s 归零停(:41-46)', () => {
    const a = new AuroraSky();
    a.setActive(true);
    expect(a.opacity).toBe(0);
    a.update(1);
    expect(a.opacity).toBeCloseTo(0.3, 12);
    a.update(2);                        // 0.3+0.6=0.9
    expect(a.opacity).toBeCloseTo(0.9, 12);
    a.update(1);                        // 1.2 → 钳 1
    expect(a.opacity).toBe(1);
    a.setActive(false);                 // Deactivate:_isLeaving=true(:432)
    a.update(1);                        // 1−0.5
    expect(a.opacity).toBeCloseTo(0.5, 12);
    expect(a.isActive).toBe(true);      // 淡出中 _isActive 仍 true(:44 归零才翻)
    a.update(1.5);                      // 0.5−0.75<0 → 归零停
    expect(a.opacity).toBe(0);
    expect(a.isActive).toBe(false);
  });
  it('淡出中重入不重 Activate(ManageSpecialBiomeVisuals :123-133 的 IsActive 守卫)', () => {
    const a = new AuroraSky();
    a.setActive(true);
    a.update(2);                        // 0.6
    a.setActive(false);                 // leaving
    a.update(0.2);                      // 0.6−0.1=0.5,_isActive 仍 true
    a.setActive(true);                  // on === IsActive() → 无操作(原版怪癖)
    a.update(0.2);
    expect(a.opacity).toBeCloseTo(0.4, 12);   // 仍在淡出
    a.update(1);                        // 归零
    expect(a.isActive).toBe(false);
    a.setActive(true);                  // 完全停下后才可重激活
    expect(a.isActive).toBe(true);
  });
  it('tileColorState:opacity≤0 → null(:412 门)', () => {
    const a = new AuroraSky();
    expect(a.tileColorState()).toBeNull();
    a.setActive(true);
    a.update(1);
    expect(a.tileColorState()).toMatchObject({ opacity: 0.3 });
  });
});

describe('ModifyTileColor 渗入(Main.cs:63360,序在 :63356 ModifyHorizonLight 后)', () => {
  // 深夜 timeOfDay=0:setBackColor → [5,5,5] → 满月地板 19 → [19,19,19]
  // (与 horizon-parity 同源锚);极光 [200,50,50]×opacity0.5 → k=0.04
  resetFrameState();
  it('cots 三通道 lerp 0.04(:419 opacity×0.08)', () => {
    expect(colorOfTheSkies(0, 1, false, false, 0)).toEqual([19, 19, 19]);
    setFrameAurora({ rgb: [200, 50, 50], opacity: 0.5, phase: 0 });
    const c = colorOfTheSkies(0, 1, false, false, 0);
    expect(c[0]).toBeCloseTo(19 + (200 - 19) * 0.04, 10);
    expect(c[1]).toBeCloseTo(19 + (50 - 19) * 0.04, 10);
    expect(c[2]).toBeCloseTo(19 + (50 - 19) * 0.04, 10);
  });
  it('月相 QuarterAtLeft(:415)直通;null 态直通', () => {
    setFrameAurora({ rgb: [200, 50, 50], opacity: 0.5, phase: 3 });
    expect(colorOfTheSkies(0, 1, false, false, 0)).toEqual([19, 19, 19]);
    setFrameAurora(null);
    expect(colorOfTheSkies(0, 1, false, false, 0)).toEqual([19, 19, 19]);
  });
  it('skySeed(tileColor :62608)同链消费:lerp 后 [26.24,20.24,20.24] 加权均值', () => {
    const base = skySeed(0, 1, false, false, 0);
    expect(base[0]).toBeCloseTo(190 / 2550, 12);   // (19·3+7·19)/10/255
    setFrameAurora({ rgb: [200, 50, 50], opacity: 0.5, phase: 0 });
    const withAur = skySeed(0, 1, false, false, 0);
    // bg=[26.24,20.24,20.24] → R=(66.72+7·26.24)/10/255、G=(66.72+7·20.24)/10/255
    expect(withAur[0]).toBeCloseTo(250.4 / 2550, 9);
    expect(withAur[1]).toBeCloseTo(208.4 / 2550, 9);
  });
});

/** 模块帧状态复位(测试间隔离——Renderer 每帧都会重写,此处显式归零) */
function resetFrameState(): void {
  setFrameAurora(null);
  setFrameHorizon(null);
  setFrameBiome(null);
  setFrameCloudDim(1);
  setFrameLightning(0);
}

// ================= Aurora 像素公式(SM2 字节码 pass Aurora 逐指令) =================
// 反汇编锚:tools/disasm-fx.mjs 产出 fxPixel.txt "-- pass Aurora"(:3109-3172,下述
// 指令行号均指此文件);常量 def c5/c6/c7 取 float32 位(:3125-3127);
// c0..c3=preshader(:3174-3179);c4=uShaderSpecificData(:3173);
// s0=Extra_286/s1=Extra_287(CTAB 符号,DyeInitializer.cs:485-487)。
// 数值锚=独立手算(脚本二次推导后固化为字面量),指令行号逐条标注。
import {
  AURORA_F32, auroraIntensity, auroraPixel, auroraNoiseUV, auroraSpecificData,
} from '../src/render/AuroraSky';
import { getPass, defaultUniforms, type SM2Sampler } from '../src/fx/SM2Effect';

const F = AURORA_F32;   // f32 精确字面量(与 def 常量同位)

describe('specificData(AuroraSky.cs:139-189 同序覆写链)', () => {
  it('各月相×带号的 (X,Y,Z,W) 终值表', () => {
    const m = (p: number) => auroraMode(p)!;
    // Full:Y 基 0/.7/.8 → flag&&i!=0 全部 0.4,带 0 再被 flag&&i==0 覆 0.5
    expect(auroraSpecificData(m(0), 0)).toEqual([0, 0.5, 0, 0]);
    expect(auroraSpecificData(m(0), 1)).toEqual([0, 0.4, 0, 0]);
    expect(auroraSpecificData(m(0), 2)).toEqual([0, 0.4, 0, 0]);
    // 3QL/QR(flag5):i0=0.3、i1=0.5
    expect(auroraSpecificData(m(1), 0)).toEqual([0, 0.3, 0, 0]);
    expect(auroraSpecificData(m(1), 1)).toEqual([0, 0.5, 0, 0]);
    expect(auroraSpecificData(m(5), 0)).toEqual([0, 0.3, 0, 0]);
    expect(auroraSpecificData(m(5), 1)).toEqual([0, 0.5, 0, 0]);
    // HalfL/3QR(flag4→X=0.3;flag2&&!flag3 不改 Z(flag3 在场);i0 由尾部 0.7 覆写)
    expect(auroraSpecificData(m(2), 0)).toEqual([0.3, 0.7, 0, 0]);
    expect(auroraSpecificData(m(2), 1)).toEqual([0.3, 0.6000000238418579, 0, 0]);   // f32(0.4+0.2)
    expect(auroraSpecificData(m(2), 2)).toEqual([0.3, 0.800000011920929, 0, 0]);    // f32(0.4+0.4)
    expect(auroraSpecificData(m(7), 2)).toEqual([0.3, 0.800000011920929, 0, 0]);
    // Empty(flag2&&!flag3→Z=0.2):i0=0.7(尾部覆写)、i1=0.6、i2=0.8
    expect(auroraSpecificData(m(4), 0)).toEqual([0, 0.7, 0.2, 0]);
    expect(auroraSpecificData(m(4), 1)).toEqual([0, 0.6000000238418579, 0.2, 0]);
    expect(auroraSpecificData(m(4), 2)).toEqual([0, 0.800000011920929, 0.2, 0]);
  });
});

describe('Aurora 像素公式数值锚(指令链手算)', () => {
  it('锚1 — n1=n2=n3=0.5、grad=0.5、sd=(0.3,0.5):强度链 :3145-3166', () => {
    // A = sat(1−0.7f32·0.125) = 0.9125000014901161(:3145-3147,★#15 _sat)
    // f1 = 0.5+0.1f32(:3148) → B = lrp(A,1,f1) = 0.9650000007264317(:3149)
    // B2 = lrp(B,1,sdY) = 0.9825000003632158(:3150-3151)
    // C = lrp(B2,1,f2=0.25) = 0.98687500027241182(:3152-3153)
    // t15 = 0.1f32+0.9f32·C = 0.98818747820635322(:3154)
    // E 链:1−n2⁴=0.9375(:3155-3156)→ F=0.96875(:3158-3159)
    //   → G=lerp(F,1,0.25)=0.9765625(:3160)→ t16=0.98359375027939677(:3161)
    // band = sat(3·grad) = sat(1.5) = 1(★#37 _sat,2026-08-24 r15 修)
    // inten = t15·t16·(1·0.5^1.2f32) = 0.42307668993966630(:3162-3166)
    expect(auroraIntensity(0.5, 0.5, 0.5, 0.5, 0.5)).toBeCloseTo(0.42307668993966630, 15);
    // :3167-3169 逐通道 v+sat(v·sdX)=×1.3 ×v0=(1,0.5,0.25),UNORM 钳(:3171)后均 <1
    const px = auroraPixel(0.5, 0.5, 0.5, 0.5, 0.3, 0.5, 1, 0.5, 0.25);
    expect(px[0]).toBeCloseTo(0.54999969692156625, 15);
    expect(px[1]).toBeCloseTo(0.27499984846078313, 15);
    expect(px[2]).toBeCloseTo(0.13749992423039156, 15);
  });

  it('锚2 — preshader T=2·uTime+sdY 与三路噪声 UV(:3132-3144/:3174-3179)', () => {
    // t0=(0.25,10,20)(grad=0.5)、uTime=10、sdY=0.5 → T=20.5
    // uv1(s0)=(z·20−T·0.02, T·0.02)=(14.59, 0.41)(:3132/:3134-3135)
    // uv2(s0)=(z·6−T·0.01, T·0.01)=(4.295, 0.205)(:3136-3137/:3140)
    // uv3(s1)=(t0.x, grad)=(0.25, 0.5)(:3141/:3139)
    const uv = auroraNoiseUV(0.25, 10, 20, 10, 0.5);
    expect(uv[0]).toBeCloseTo(14.59, 12);
    expect(uv[1]).toBeCloseTo(0.41, 12);
    expect(uv[2]).toBeCloseTo(4.295, 12);
    expect(uv[3]).toBeCloseTo(0.205, 12);
    expect(uv[4]).toBe(0.25);
    expect(uv[5]).toBeCloseTo(0.5, 12);
  });

  it('锚3 — 边界语义:n2=1→E=0、lrp 外插(f1=1.1)、UNORM 饱和(:3148-3161/:3171)', () => {
    // n1=1: A=sat(0.30000001192…)(1−0.7f32);f1=grad+0.1=1.1>1 → B 外插=1.0699999998509884
    // C=1.0027999999940396;n2=1: 1−n2⁴=0 → E=max(0,0)=0(:3157)
    // F=sdY=0.8 → G=0.96;band=sat(3·1)=1(★#37 _sat,2026-08-24 r15 修)
    // inten=0.97444941868204349(旧值 2.923=未钳 3·grad 所致)
    expect(auroraIntensity(1, 1, 1, 1, 0.8)).toBeCloseTo(0.97444941868204349, 15);
    // 逐通道 v+sat(v·0.3)×v0=(0.2,0.1,0) → (0.25335684885733134, 0.12667842442866567, 0)
    const px = auroraPixel(1, 1, 1, 1, 0.3, 0.8, 0.2, 0.1, 0);
    expect(px[0]).toBeCloseTo(0.25335684885733134, 15);
    expect(px[1]).toBeCloseTo(0.12667842442866567, 15);
    expect(px[2]).toBe(0);
    // 亮端饱和:v0=(1,1,1) → 全 1.0(UNORM :3171)
    const sat = auroraPixel(1, 1, 1, 1, 0.3, 0.8, 1, 1, 1);
    expect(sat).toEqual([1, 1, 1]);
  });
});

describe('字节码解释器交叉对拍(src/fx/SM2Effect.ts 直接执行 pass Aurora)', () => {
  // 采样器按 texld 指令序供值(:3142 s0→n1、:3143 s0→n2、:3144 s1→n3),
  // 同时捕获各路 UV;v0=顶点色;t0.z 由 tex[2] 直供(AddVertexPair 的 d 分量)。
  const pass = getPass('Aurora');
  it.skipIf(!pass)('公式/UV 与字节码执行逐点一致', () => {
    expect(pass).not.toBeNull();
    const cases: Array<{
      t0: [number, number, number]; uTime: number; sd: [number, number, number, number];
      v0: [number, number, number, number]; noise: [number, number, number];
    }> = [
        { t0: [0.25, 10, 20], uTime: 10, sd: [0.3, 0.5, 0.2, 0], v0: [1, 0.5, 0.25, 1], noise: [0.5, 0.5, 0.5] },
        { t0: [0.9, 33.3, 55.5], uTime: 123.4, sd: [0, 0.8, 0, 0], v0: [0.2, 0.9, 0.4, 0], noise: [0.8, 0.15, 0.62] },
        { t0: [0.02, 3, 77], uTime: 3599.7, sd: [0.3, 0.6, 0, 0], v0: [0.9, 0.1, 0.7, 1], noise: [1, 1, 1] },
        { t0: [0.5, 90, 90], uTime: 0, sd: [0, 0.4, 0.2, 0], v0: [1, 1, 1, 1], noise: [0, 0, 0] },
      ];
    for (const c of cases) {
      const [n1, n2, n3] = c.noise;
      const uvSeen: Array<[number, number]> = [];
      let call = 0;
      // s0 两路(:3142→n1、:3143→n2)按 texld 调用序分流
      const s0seq: SM2Sampler = (u, v) => {
        uvSeen.push([u, v]);
        return [call++ === 0 ? n1 : n2, 0, 0, 1];
      };
      const s1: SM2Sampler = (u, v) => { uvSeen.push([u, v]); return [n3, 0, 0, 1]; };
      const u = defaultUniforms();
      u.uTime = c.uTime;
      u.uShaderSpecificData = c.sd;
      const cc = pass!.setupConstants(u);
      const regs = new Float64Array(32 * 4);
      const tex = new Float64Array(8 * 4);
      tex[2] = c.t0[2];                       // t0.z(d 分量,解释器不自动装配)
      const v0 = new Float64Array(8);
      v0[0] = c.v0[0]; v0[1] = c.v0[1]; v0[2] = c.v0[2]; v0[3] = c.v0[3];
      const o = new Float64Array(4);
      const res = pass!.execPixel(cc, regs, tex, v0, o, c.t0[0], c.t0[1], [s0seq, s1]);
      expect(res).not.toBeNull();
      const grad = c.t0[1] * (1 / c.t0[2]);
      const px = auroraPixel(n1, n2, n3, grad, c.sd[0], c.sd[1], c.v0[0], c.v0[1], c.v0[2]);
      expect(px[0]).toBeCloseTo(res![0], 9);
      expect(px[1]).toBeCloseTo(res![1], 9);
      expect(px[2]).toBeCloseTo(res![2], 9);
      expect(res![3]).toBe(0);                                       // :3170 α=c6.x=0
      // UV 对拍(preshader T=2·uTime+sdY 进 c0..c3)
      const uv = auroraNoiseUV(c.t0[0], c.t0[1], c.t0[2], c.uTime, c.sd[1]);
      expect(uvSeen.length).toBe(3);
      expect(uvSeen[0][0]).toBeCloseTo(uv[0], 9);   // :3142 路径
      expect(uvSeen[0][1]).toBeCloseTo(uv[1], 9);
      expect(uvSeen[1][0]).toBeCloseTo(uv[2], 9);   // :3143 路径
      expect(uvSeen[1][1]).toBeCloseTo(uv[3], 9);
      expect(uvSeen[2][0]).toBeCloseTo(uv[4], 9);   // :3144 路径
      expect(uvSeen[2][1]).toBeCloseTo(uv[5], 9);
    }
  });
});

describe('Aurora 公式 f32 常量(def c5/c6/c7 位级,:3125-3127)', () => {
  it('AURORA_F32 与字节码 def 位一致', () => {
    expect(F.pow1_2).toBe(1.2000000476837158); // f32(1.2) = c5.x
    expect(F.nz).toBe(0.699999988079071);      // f32(0.7) = c6.z = c7.y
    expect(F.add01).toBe(0.10000000149011612); // f32(0.1) = c7.x
    expect(F.add03).toBe(0.30000001192092896); // f32(0.3) = c7.z
    expect(F.mul09).toBe(0.8999999761581421);  // f32(0.9) = c7.w
    expect(F.mul3).toBe(3); expect(F.mul6).toBe(6); expect(F.mul20).toBe(20); // c5.y/c5.z/c6.y
  });
});
