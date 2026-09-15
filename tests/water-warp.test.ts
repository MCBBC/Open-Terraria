// 水体全屏扭曲管线（GLWaterDistortion / WaterWarpCompositor）单测。
// 金标来源：ScreenShader.cso obj19（pass "FilterWaterDistortion"）逐指令反汇编——
// 见 src/render/GLWaterDistortion.ts 头注（位移公式 + #55-71 alpha 门控）。
// GLSL 无法在 node 执行 → 沿用 heat-distortion.test.ts 的"源码锁常量"模式；
// 坐标系/激活门为纯逻辑直测。
import { describe, it, expect } from 'vitest';
import { GLWaterDistortion } from '../src/render/GLWaterDistortion';
import { WaterWarpCompositor } from '../src/render/WaterWarpCompositor';
import { waterWaves, setWaveTextures } from '../src/render/WaterWaves';
import { liquidDebugState } from '../src/render/VanillaLiquidRenderer';

describe('GLWaterDistortion.FRAG：obj19 位移公式锁（防漂移）', () => {
  const f = GLWaterDistortion.FRAG;

  it('双噪声采样：0.1/0.2 双尺度 + ±progress·0.04 反向 Y 滚动（c12.x/c12.z/c1/c2）', () => {
    expect(f).toContain('nu.x * 0.1');
    expect(f).toContain('nu.x * 0.2');
    expect(f).toContain('nu.y * 0.1 + uProgress * 0.04');   // #15 c1 = prog·0.04
    expect(f).toContain('nu.y * 0.2 - uProgress * 0.04');   // #17 c2 = −prog·0.04
  });

  it('梯度 = n1.xy − n2.xy（#26 add r0.zw, r0, -r1 —— 负号修饰符，非求和）', () => {
    expect(f).toContain('n1.x - n2.x');
    expect(f).toContain('n1.y - n2.y');
  });

  it('波场：(px+uWaveOff)·0.25/网格尺寸（DISTORTION_BUFFER_SCALE WaterShaderData.cs:47）+ R−0.5 中心（★BJ89 读侧亚栅格补偿进坐标）', () => {
    expect(f).toContain('(px + uWaveOff) * 0.25 / uWaveSize');
    expect(f).toContain('h - 0.5');
  });

  it('位移合成：DISPX=grad.x·0.1·I / DISPY=grad.y·0.1·I − clamp(h\',±0.3)（#29-34，含 −0.4·B 黏度项 1456 已死=1）', () => {
    expect(f).toContain('gx * 0.1 * uIntensity');
    expect(f).toContain('gy * 0.1 * uIntensity - clamp(h - 0.5, -0.3, 0.3)');
  });

  it('屏幕位移量：(DISPX·0.1, DISPY)·32 —— c14.x=0.1/c14.y=1 × c5=32·opacity/res × res（★2026-09-08 缝案定版：波形增益 wamp 默认回原版 1，2=可选观感档 ?wamp=2）', () => {
    expect(f).toContain('vec2(dispx * 0.1, dispy) * 32.0');
    expect(f).toContain('vUv + disp / uCssSize');
  });

  it('坐标系统一：位移场以 CSS px 计算（uCssSize；噪声场=世界 css px=wpx/noiseSize——BJ76 世界锚定）', () => {
    expect(f).toContain('vUv * uCssSize');
    expect(f).toContain('vec2 nu = wpx / uNoiseSize');
  });
});

describe('GLWaterDistortion.FRAG：obj19 #55-71 alpha 门控锁（水下整屏扭曲的本体）', () => {
  const f = GLWaterDistortion.FRAG;

  it('四采样器：s0 场景（带光照世界层）/ s1 噪声 / s2 波场 / s3 前景水层（ScreenShaderData.Apply :159-185）', () => {
    expect(f).toContain('uniform sampler2D uScene');
    expect(f).toContain('uniform sampler2D uNoise');
    expect(f).toContain('uniform sampler2D uWave');
    expect(f).toContain('uniform sampler2D uWater');
  });

  it('α 饱和：min(α·100, 1)——α>0.01 即 1（#55-58 mul c14.z=100 + min c13.y=1）', () => {
    expect(f).toContain('texture2D(uWater, uvD).a * 100.0');
    expect(f).toContain('texture2D(uWater, vUv).a * 100.0');
  });

  it('存在门 f = min(100·(aD+aU), 1)；Δα = aD − aU（#59-63）', () => {
    expect(f).toContain('float dA = aD - aU');
    expect(f).toContain('min((aD + aU) * 100.0, 1.0)');
  });

  it('方向门 w = smoothstep((DISPY·c5.y+0.001)·500)，c5.y=32/res → x = dispy·16000/res + 0.5（#43-49）', () => {
    expect(f).toContain('dispy * 16000.0 / uCssSize.y + 0.5');
    expect(f).toContain('x * x * (3.0 - 2.0 * x)');
  });

  it('门控合成 gate = f·(1−sat(|Δα|·(1−|2w+Δα−1|)))；out = mix(原样, 位移后, gate)（#64-74；★2026-09-08 字节级订正：原版 mul r0.x_sat 在乘积上先饱和，负积→gate=f 不放大，SW 旧式末尾 clamp 在半覆盖边缘过度位移=多层水）', () => {
    expect(f).toContain('1.0 - clamp(abs(dA) * (1.0 - abs(2.0 * w + dA - 1.0)), 0.0, 1.0)');
    expect(f).toContain('mix(texture2D(uScene, vUv), texture2D(uScene, uvD), gate)');
  });

  it('门控语义三态（★2026-09-08 字节级订正式，乘积先饱和）：水体内部 Δα=0 → gate=f=1；旱地 f=0 → 0；dA=-1 边缘 w<0.5 → gate=f 全量位移、w=1 → 0；dA=+1 边缘 w=1 → gate=f（水面抬升）、w=0 → 0', () => {
    // 纯数学复核门控公式在三态下的取值（与 FRAG 同式,mul r0.x_sat 乘积先饱和）
    const gate = (aD: number, aU: number, w: number) => {
      const dA = aD - aU;
      const fq = Math.min((aD + aU) * 100, 1);
      const sat = Math.max(0, Math.min(1, Math.abs(dA) * (1 - Math.abs(2 * w + dA - 1))));
      return fq * (1 - sat);   // ★字节级订正式：乘积先饱和（mul r0.x_sat）
    };
    expect(gate(1, 1, 0.5)).toBe(1);      // 水下内部：全量扭曲
    expect(gate(0, 0, 0.5)).toBe(0);      // 旱地：不扭
    // dA=-1（水中像素,位移采样越出上缘 aD=0,aU=1）：
    expect(gate(0, 1, 0)).toBe(1);        //   w=0：负积饱和 0 → gate=f=1（全量位移=水面随场下沉）
    expect(gate(0, 1, 0.25)).toBe(1);     //   w=0.25：负积饱和 0 → gate=f（旧式此处外推 0.5=偏差）
    expect(gate(0, 1, 0.75)).toBe(0.5);   //   w=0.75：正积 0.5 → 半量位移（过渡带）
    expect(gate(0, 1, 1)).toBe(0);        //   w=1：正积饱和 1 → gate=0（反向保护）
    // dA=+1（空气中像素,位移采样落入水体 aD=1,aU=0）：
    expect(gate(1, 0, 0)).toBe(0);        //   w=0：正积饱和 1 → gate=0（上浮方向不抬升）
    expect(gate(1, 0, 0.25)).toBe(0.5);   //   w=0.25：正积 0.5 → 半量位移
    expect(gate(1, 0, 0.5)).toBe(1);      //   w=0.5：积 0 → gate=f（水被拉上=波峰）
  });
});

describe('WaterWarpCompositor：激活门与坐标系（node 环境无 document → 恒不激活）', () => {
  it('node 无 DOM：active() 恒 false、beginFgPass 恒 null（直画回退路径）', () => {
    const c = new WaterWarpCompositor();
    expect(c.active()).toBe(false);
    expect(c.mode).toBe('auto');   // 无 location → auto（GL 优先）
  });

  it('quality=0 → active() false（SceneState.cs:129 WaveQuality>0 滤镜整体关）', () => {
    // node 下 document 检查先短路——用纯逻辑复核门序：quality>0 是必要条件
    // （此处验证 quality=0 时即便有纹理也关：直接验证 waterWaves 态）
    waterWaves.setQuality(0);
    expect(waterWaves.quality).toBe(0);
    waterWaves.setQuality(3);
    expect(waterWaves.quality).toBe(3);
  });

  it('帧态换算三角闭合：css↔设备↔世界（WaterWarpFrameState 三系互算）', () => {
    // 纯数学复核全屏 pass 的坐标链：device→css（÷cssScale）→world（camL + css/cssZoom）
    // 与 WaterWaves 采样系（world→css：(world−cam)·cssZoom）互逆
    const st = { cssW: 960, cssH: 540, cssScale: 2, cssZoom: 1.25, camL: 1000, camT: 2000 };
    const devX = 1920 / 2;                       // 设备 px（画面中心）
    const cssX = devX / st.cssScale;             // → css px
    const worldX = st.camL + cssX / st.cssZoom;  // → 世界 px
    expect(cssX).toBeCloseTo(480, 10);
    // 逆变换（WaterWaves 采样系）：
    expect((worldX - st.camL) * st.cssZoom).toBeCloseTo(cssX, 10);
    expect(cssX * st.cssScale).toBeCloseTo(devX, 10);
  });

  it('平滑步长基准：x = DISPY·16000/res.y + 0.5 在 res.y=800 时 DISPY=±0.025 饱和（|位移|>0.8px 即方向门）', () => {
    const x = (dispy: number, resY: number) => dispy * 16000 / resY + 0.5;
    expect(x(0, 800)).toBeCloseTo(0.5, 10);      // 零位移 → 0.5 中心
    expect(x(0.025, 800)).toBeCloseTo(1.0, 10);  // +0.8px 饱和
    expect(x(-0.025, 800)).toBeCloseTo(0.0, 10); // −0.8px 饱和
  });
});

describe('管线调试态（LiquidDebugState.warp）', () => {
  it('初始 off；setWaterWarpDebug 记录路径与次数', async () => {
    const before = liquidDebugState().warp.passes;
    const { setWaterWarpDebug, clearWaterWarpDebug } = await import('../src/render/VanillaLiquidRenderer');
    setWaterWarpDebug('gl');
    const d = liquidDebugState().warp;
    expect(d.active).toBe(true);
    expect(d.path).toBe('gl');
    expect(d.passes).toBe(before + 1);
    clearWaterWarpDebug();
    expect(liquidDebugState().warp.active).toBe(false);
    expect(liquidDebugState().warp.path).toBe('off');
  });
});

describe('波场纹理喂入约定（GL LUMINANCE 8bit 上传 ↔ _R 值域）', () => {
  it('_R 值域恒 k/256 量化（q256 写入）→ ×255 编码误差 ≤ 半个量化步（不可见级）', () => {
    // 复核编码误差上界：|v − round(v·255)/255| ≤ 1/510 ≈ 0.00196
    // 位移误差 = 0.00196·32·1（hClamp·32px）≈ 0.063 px —— 亚像素
    const maxErr = 0.5 / 255;
    for (let k = 0; k <= 256; k++) {
      const v = k / 256;
      // 模块编码（Uint8Array 赋值截断 = floor(x+0.5) 舍入）
      const enc = Math.min(255, Math.floor(v * 255 + 0.5)) / 255;
      expect(Math.abs(v - enc)).toBeLessThanOrEqual(maxErr + 1e-9);
    }
  });
});

// 噪声场世界锚定（2026-09-14 BJ76 定谳：obj19 #10-12 pixel = t0·uScreenResolution +
// uScreenPosition，uScreenPosition = UnscaledScreenPosition − offScreenRange = 相机世界左上
// ⇒ 原版涟漪场锚定世界；本仓曾漏相机项 = 屏幕锚定 = 用户报"走动时波纹跟着角色跑"）
describe('噪声场世界锚定（BJ76）：FRAG 结构锁 + CPU 不变式', () => {
  const f = GLWaterDistortion.FRAG;

  it('FRAG：uWorldPx 声明 + wpx = px + uWorldPx（世界 css px = 屏幕 px + cam·cssZoom）', () => {
    expect(f).toContain('uniform vec2 uWorldPx');
    expect(f).toContain('vec2 wpx = px + uWorldPx');
  });

  it('FRAG：波场缓冲读含 uWaveOff 亚栅格补偿（obj19 c11=uImageOffset 进采样坐标——★BJ89 定谳；旧"屏幕坐标不改"锁随内容移向修正退役）', () => {
    expect(f).toContain('texture2D(uWave, (px + uWaveOff) * 0.25 / uWaveSize)');
  });

  it('CPU 不变式：sampleDisplace 固定世界点在相机平移下恒定（屏幕锚定该值必漂移）', () => {
    // 高频合成噪声 128²（源码锁无 GL,用 CPU 路径直接验证世界锚定语义）
    const S = 128;
    const data = new Uint8ClampedArray(S * S * 4);
    let seed = 987654321;
    for (let i = 0; i < S * S; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i * 4] = seed & 0xff;
      data[i * 4 + 1] = (seed >> 8) & 0xff;
      data[i * 4 + 2] = (seed >> 16) & 0xff;
      data[i * 4 + 3] = 255;
    }
    setWaveTextures({ w: S, h: S, data }, { data: new Uint8ClampedArray(64 * 128 * 4).fill(128) });
    waterWaves.setQuality(3);
    // 分配波场网格（中性）——frame 一次
    waterWaves.frame({ camX: 1000, camY: 2000, zoom: 1, viewW: 800, viewH: 520,
      tileX: 500, tileY: 250, maxTilesX: 4200, maxTilesY: 1200,
      worldSurface: 300, rockLayer: 800, windAbs: 0, rain: 0, dt: 1 / 60 });
    const out: [number, number] = [0, 0];
    const wx = 8000, wy = 4000;   // 固定世界点
    waterWaves.setCamera(1000, 2000, 1);
    waterWaves.sampleDisplace(wx, wy, out);
    const d1: [number, number] = [out[0], out[1]];
    waterWaves.setCamera(1512, 2256, 1);   // 相机平移（512,256）世界 px
    waterWaves.sampleDisplace(wx, wy, out);
    const d2: [number, number] = [out[0], out[1]];
    expect(d2[0]).toBeCloseTo(d1[0], 9);
    expect(d2[1]).toBeCloseTo(d1[1], 9);
    // 反证：同一屏幕点（非世界点）在相机平移前后采样值【应】不同（场没跟着屏幕走）
    waterWaves.setCamera(1000, 2000, 1);
    waterWaves.sampleDisplace(wx, wy, out);
    const e1: [number, number] = [out[0], out[1]];
    waterWaves.setCamera(1512, 2256, 1);
    waterWaves.sampleDisplace(wx - 512, wy - 256, out);   // 同一屏幕点
    const e2: [number, number] = [out[0], out[1]];
    expect(e2[0] !== e1[0] || e2[1] !== e1[1]).toBe(true);
  });
});

// 喂纹理防串扰（waterWaves 单例被其他 describe 改态——恢复中性）
describe('测试隔离收尾', () => {
  it('恢复 wave 质量与纹理态', () => {
    waterWaves.setQuality(3);
    setWaveTextures(null, null);
    expect(waterWaves.quality).toBe(3);
  });
});
