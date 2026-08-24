// 水面波动模拟（Water Waves）+ 浪质量四档（Wave Quality）单测。
// 金标来源：PixelShader.cso obj49/obj50、ScreenShader.cso obj19 逐指令反汇编复原的
// 公式（见 src/render/WaterWaves.ts 头部行号），金标数值由同公式独立脚本预生成。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  waveProcessorStep, waveSourceGates, waterDistortionIntensity, washShapeValue,
  queueRipple, queueRippleRaw, setWaveTextures, waterWaves, WATER_DAMP,
  injectEntity, RippleShape,
} from '../src/render/WaterWaves';

describe('waveSourceGates（WaterShaderData.cs:114-118 档位门）', () => {
  it('0 档：全关（SceneState.cs:129 滤镜整体关闭）', () => {
    const g = waveSourceGates(0);
    expect(g.npc).toBe(false);        // 0 档连 NPC 也不注入（滤镜关闭，frame() 早退）
    expect(g.player).toBe(false);
    expect(g.ripple).toBe(false);
    expect(g.projectile).toBe(false);
    expect(g.viscosity).toBe(false);
  });
  it('1 档：仅滤镜激活（无 q>=2 源）', () => {
    const g = waveSourceGates(1);
    expect(g.player).toBe(false);
    expect(g.ripple).toBe(false);
    expect(g.projectile).toBe(false);
  });
  it('2 档：玩家 + 涟漪 + 自定义；弹幕仍关', () => {
    const g = waveSourceGates(2);
    expect(g.player).toBe(true);
    expect(g.ripple).toBe(true);
    expect(g.custom).toBe(true);
    expect(g.projectile).toBe(false);
  });
  it('3 档：全开（含弹幕/黏度补偿语义）', () => {
    const g = waveSourceGates(3);
    expect(g.projectile).toBe(true);
    expect(g.viscosity).toBe(true);
  });
  it('NPC 波在 1-3 档恒开（:79 _useNPCWaves 无档位门）', () => {
    expect(waveSourceGates(1).npc).toBe(true);
    expect(waveSourceGates(2).npc).toBe(true);
    expect(waveSourceGates(3).npc).toBe(true);
  });
});

describe('waveProcessorStep（WaterProcessor obj49 复原）', () => {
  it('中性场不动（R=G=0.5 定点）', () => {
    expect(waveProcessorStep(0.5, 0.5, 0.5, 0.5, 0.5, 0.5)).toEqual([0.5, 0.5]);
  });
  it('中心 +1/512 凸起 → 反相下压 + 负速度（金标，含 unorm8 双重量化）', () => {
    const r = waveProcessorStep(0.5, 0.5, 0.5, 0.5, 0.50390625, 0.5);
    expect(r[0]).toBeCloseTo(0.49609375, 10);
    expect(r[1]).toBeCloseTo(0.4609375, 10);
  });
  it('邻格 +1/512 凸起 → 波向外传播（金标）', () => {
    const r = waveProcessorStep(0.50390625, 0.5, 0.5, 0.5, 0.5, 0.5);
    expect(r[0]).toBeCloseTo(0.50390625, 10);
    expect(r[1]).toBeCloseTo(0.51953125, 10);
  });
  it('unorm 钳制：满场 1 → outR 钳 1（打满轨道是动力学一部分）', () => {
    const r = waveProcessorStep(1, 1, 1, 1, 1, 1);
    expect(r[0]).toBe(1);
    expect(r[1]).toBeCloseTo(0.98828125, 10);
  });
  it('速度 √ 编码与 10/3 解码互逆（w·|w| ≡ dv）', () => {
    const g0 = 0.75;                            // 编码速度
    const dv = (g0 - 0.5) / 0.3;                // w（= 解码速度）
    expect(dv).toBeCloseTo(0.8333333333333334, 10);
    const reEnc = 0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv));
    expect(reEnc).toBeCloseTo(0.7738612788329577, 9);
  });
  it('纯速度注入（G=1）一步后高度打满（w|w| 主导，金标）', () => {
    const r = waveProcessorStep(0.5, 0.5, 0.5, 0.5, 0.5, 1);
    // w=(0.5)·3.333=1.667; H=1.667²=2.78 → newH=2.676 → enc>1 → 钳 1
    expect(r[0]).toBe(1);
  });
  it('damp 常量 = exp2(c2.x float32 = −0.0551415532827)', () => {
    expect(WATER_DAMP).toBeCloseTo(Math.pow(2, -0.0551415532827), 12);
  });
});

describe('waterDistortionIntensity（SceneState.cs:159-173）', () => {
  const base = (wind: number, rain: number, tx: number, ty: number) =>
    waterDistortionIntensity(wind, rain, tx, ty, 2100, 700, 110, 190);
  it('地表中心无风雨：世界边项 −0.25、地狱项已满衰减 0 → 0.75', () => {
    // num=1050 → clamp((1050−380)/100)=1 → −(0.5−0.25)=−0.25 → 1−0.25=0.75
    // 地表 num6=1 → ·1；地狱项 clamp((700−100−200)/300)=1 → 0.9−0.9=0；+(1−1)·0.75=0
    expect(base(0, 0, 1050, 100)).toBeCloseTo(0.75, 10);
  });
  it('狂风暴雨钳 2.5', () => {
    expect(base(0.8, 1, 1050, 100)).toBeCloseTo(2.5, 10);
  });
  it('地下（worldSurface 与 rockLayer 之间）', () => {
    // tileY=300: num6 = 1−clamp(3·190/80)=0 → I·0 + 0 + 0.75 → 0.75? no:
    // I(=1.65)·0 = 0 → +0.9−clamp((700−300−200)/300)·0.9 = 0.9−0.667·0.9 = 0.3 → +0.75 → 1.05
    expect(base(0, 0, 1050, 300)).toBeCloseTo(1.05, 10);
  });
  it('地狱层（近底）', () => {
    // tileY=650: num6=0 → 0 + 0.9−0·0.9 + 0.75 = 1.65? 计算:clamp((700-650-200)/300)=0 → 0.9 → 1.65
    expect(base(0, 0, 1050, 650)).toBeCloseTo(1.65, 10);
  });
  it('世界边缘（num<380 → 边缘项 +0.25）', () => {
    // num=30: clamp((30-380)/100)=0 → −(0−0.25)=+0.25 → 1+0.25+0.9 = 2.15? 金标 1.25?
    expect(base(0, 0, 30, 100)).toBeCloseTo(1.25, 10);
  });
});

describe('washShapeValue（WaterDistortionObject obj50 复原）', () => {
  it('quad 中心 rlen=0 → 0', () => {
    expect(washShapeValue(0, 0, 0.4, 0, 0.5)).toBe(0);
  });
  it('flow 零向量 → 0', () => {
    expect(washShapeValue(0.2, 0, 0, 0, 0.5)).toBe(0);
  });
  it('顺流方向内圈（r<2π 钳域）→ cosφ>0 恒零', () => {
    // radial=(1,0) 方向、flow=(−1,0)+0.5 → flowSigned=(−0.5,0) → dot(−f,rad)=1 → 1−0.2=0.8
    // r=0.2·25.12=5.024 < 2π → max(r,2π) 钳（obj50 #27）→ φ≈−0.0039。
    // ★R15-13 勘正:D3D9 sincos 指令 .x=cos/.y=sin（MSDN+ps_2_0 版本 token 双证,
    //   54 site/34 pass 全量复活）——旧断言按 sin 解释器探针金标 0.002548… 已废;
    //   cos(−0.0039)>0 → min(cos,0)=0 → 内圈恒零
    const v = washShapeValue(0.2, 0, -0.5, 0, 1);
    expect(v).toBe(0);
  });
  it('内圈 max(r,2π) 钳：r<2π 各点 φ 恒定 → 同为零（obj50 #27 字节码锚）', () => {
    // |uvc|=0.1/0.2/0.24 全部 → φ = frac(2π·0.159155+0.5)·2π−π 同值 → cos>0 同零
    const a = washShapeValue(0.1, 0, -0.5, 0, 1);
    const b = washShapeValue(0.2, 0, -0.5, 0, 1);
    const c = washShapeValue(0.24, 0, -0.5, 0, 1);
    expect(a).toBe(0);
    expect(b).toBe(0);
    expect(c).toBe(0);
  });
  it('中圈（2π≤r<4π）不钳：cos<0 扇区出正强度、cos≥0 扇区为零（#28 frac 链）', () => {
    // r=8.79（|uvc|=0.35）→ φ=frac 链≈+2.507 → cos≈−0.806 → −cosφ×0.8×1
    // r=11.3（0.45）→ φ≈−1.266 → cos>0 → 0（旧 sin 公式下两值互换,同源勘正）
    const v1 = washShapeValue(0.35, 0, -0.5, 0, 1);
    const v2 = washShapeValue(0.45, 0, -0.5, 0, 0.5);
    expect(v1).toBeCloseTo(0.6451102224781842, 10);
    expect(v2).toBe(0);
  });
  it('远处（r≥4π）恒小负角 → cosφ>0 恒零', () => {
    // |uvc|=0.6 → r=15.07 ≥ 4π → φ=−0.00637111 → cos>0 → 0（旧 −sinφ 尾迹已废）
    const v = washShapeValue(0.6, 0, -0.5, 0, 1);
    expect(v).toBe(0);
  });
});

describe('涟漪队列（WaterShaderData.cs:446-470）', () => {
  beforeEach(() => {
    waterWaves.resetForTest();
    waterWaves.setQuality(2);
  });
  it('queueRipple 默认重载：尺寸 4·max(|s|,1)、色 (0.5,g,0)·num', () => {
    queueRipple(100, 100, 1, RippleShape.Square, 0);
    const d = waterWaves.debug();
    expect(d.rippleQueueUsed).toBe(1);
  });
  it('q<2 时入队 = 清空全队列（:462-465）', () => {
    queueRipple(100, 100);          // 先入一个（q=2 有效）
    expect(waterWaves.debug().rippleQueueUsed).toBe(1);
    waterWaves.setQuality(1);
    queueRipple(200, 200);          // 触发清空
    expect(waterWaves.debug().rippleQueueUsed).toBe(0);
  });
});

describe('波场系统 frame（WaterShaderData StepLiquids/PreDraw）', () => {
  beforeEach(() => {
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    // 喂假纹理：noise 全 0.5 灰（环境波为零 → 只测涟漪链路）、Ripples 圆形=白
    const noise = new Uint8ClampedArray(256 * 256 * 4).fill(128);
    const ripple = new Uint8ClampedArray(64 * 128 * 4).fill(255);
    setWaveTextures({ w: 256, h: 256, data: noise }, { data: ripple });
  });
  const frameInp = {
    camX: 0, camY: 0, zoom: 1, viewW: 400, viewH: 400,
    tileX: 1050, tileY: 100, maxTilesX: 2100, maxTilesY: 700,
    worldSurface: 110, rockLayer: 190, windAbs: 0, rain: 0, dt: 1 / 60,
  };
  it('涟漪注入 → 传播扩散（波前每步 ±1 texel 外扩）+ 幅度有界', () => {
    queueRippleRaw(200, 200, 64, 64, 0.5, 1, 1, RippleShape.Square, 0);   // 满速度注入
    waterWaves.frame(frameInp);
    const d1 = waterWaves.debug();
    expect(d1.stepsLastFrame).toBe(1);
    expect(d1.activeTexels).toBeGreaterThan(0);
    for (let f = 0; f < 29; f++) waterWaves.frame(frameInp);
    const d2 = waterWaves.debug();
    // 波前扩散：30 帧后活跃面积显著增长（16×16 注入块 → ~π·30² 波前带）
    expect(d2.activeTexels).toBeGreaterThan(d1.activeTexels);
    // 幅度有界（阻尼 + unorm 量化；不允许无限增长）
    const g = waterWaves.readGridR();
    let min = 2, max = -1;
    for (let i = 0; i < g.length; i++) { if (g[i] < min) min = g[i]; if (g[i] > max) max = g[i]; }
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(0);
  });
  it('q=0：不步进、缓冲中性', () => {
    waterWaves.setQuality(0);
    queueRippleRaw(200, 200, 64, 64, 0.5, 1, 1, RippleShape.Square, 0);
    waterWaves.frame(frameInp);
    const d = waterWaves.debug();
    expect(d.stepsLastFrame).toBe(0);
    expect(d.activeTexels).toBe(0);
  });
  it('q=1：涟漪入队即清 → 缓冲中性（只有噪声环境波，无涟漪源）', () => {
    waterWaves.setQuality(1);
    queueRippleRaw(200, 200, 64, 64, 0.5, 1, 1, RippleShape.Square, 0);
    waterWaves.frame(frameInp);
    expect(waterWaves.debug().activeTexels).toBe(0);
  });
  it('progress 按 dt·intensity·0.75 累加（:121）', () => {
    waterWaves.frame(frameInp);
    const d = waterWaves.debug();
    expect(d.progress).toBeCloseTo((1 / 60) * d.intensity * 0.75, 10);
  });
  it('掉帧（dt 大）→ 补 2 步（PreDraw min(queuedSteps,2)）', () => {
    queueRippleRaw(200, 200, 64, 64, 0.5, 1, 1, RippleShape.Square, 0);
    waterWaves.frame({ ...frameInp, dt: 1 / 20 });
    expect(waterWaves.debug().stepsLastFrame).toBe(2);
  });
});

describe('injectEntity 档位门', () => {
  beforeEach(() => {
    waterWaves.resetForTest();
    setWaveTextures(null, null);
  });
  const cam = { camX: 0, camY: 0, viewW: 800, viewH: 600, zoom: 1 };
  it('q=0：任何实体都不注入', () => {
    waterWaves.setQuality(0);
    injectEntity({ kind: 'player', x: 100, y: 100, w: 20, h: 42, vx: 3, vy: 0, wet: true, wetCount: 10, honeyWet: false, lavaWet: false }, cam.camX, cam.camY, cam.viewW, cam.viewH, cam.zoom);
    expect(waterWaves.debug().rippleQueueUsed).toBe(0);
  });
  it('q=3：玩家湿身 + wetCount 涟漪入队', () => {
    waterWaves.setQuality(3);
    injectEntity({ kind: 'player', x: 100, y: 100, w: 20, h: 42, vx: 3, vy: 0, wet: true, wetCount: 10, honeyWet: false, lavaWet: false }, cam.camX, cam.camY, cam.viewW, cam.viewH, cam.zoom);
    expect(waterWaves.debug().rippleQueueUsed).toBe(1);
  });
  it('q=2：弹幕不注入（>=3 门）', () => {
    waterWaves.setQuality(2);
    injectEntity({ kind: 'projectile', x: 300, y: 300, w: 10, h: 10, vx: 8, vy: 0, wet: true, wetCount: 0, honeyWet: false, lavaWet: false, projDistort: true }, cam.camX, cam.camY, cam.viewW, cam.viewH, cam.zoom);
    expect(waterWaves.debug().rippleQueueUsed).toBe(0);
  });
  it('屏幕外实体剔除（:196 ±16px 盒）', () => {
    waterWaves.setQuality(3);
    injectEntity({ kind: 'player', x: 5000, y: 100, w: 20, h: 42, vx: 3, vy: 0, wet: true, wetCount: 10, honeyWet: false, lavaWet: false }, cam.camX, cam.camY, cam.viewW, cam.viewH, cam.zoom);
    expect(waterWaves.debug().rippleQueueUsed).toBe(0);
  });
});
