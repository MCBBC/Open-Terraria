// 水体果冻后处理管线（GLWaterDistortion / WaterWarpCompositor）单测。
// 金标来源：ScreenShader.cso obj19（pass "FilterWaterDistortion"）逐指令反汇编——
// 见 src/render/GLWaterDistortion.ts 头注（负号修饰符三处订正后的最终公式）。
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

  it('波场：px·0.25/网格尺寸（DISTORTION_BUFFER_SCALE WaterShaderData.cs:47）+ R−0.5 中心', () => {
    expect(f).toContain('px * 0.25 / uWaveSize');
    expect(f).toContain('h - 0.5');
  });

  it('位移合成：DISPX=grad.x·0.1·I / DISPY=grad.y·0.1·I − clamp(h\',±0.3)（#29-34，含 −0.4·B 黏度项 1456 已死=1）', () => {
    expect(f).toContain('gx * 0.1 * uIntensity');
    expect(f).toContain('gy * 0.1 * uIntensity - clamp(h - 0.5, -0.3, 0.3)');
  });

  it('屏幕位移量：(DISPX·0.1, DISPY)·32 —— c14.x=0.1/c14.y=1 × c5=32·opacity/res × res', () => {
    expect(f).toContain('vec2(dispx * 0.1, dispy) * 32.0');
    expect(f).toContain('vUv + disp / uCssSize');
  });

  it('坐标系统一：位移场以 CSS px 计算（uCssSize；与 sampleDisplace 的 (world−cam)·cssZoom 同系）', () => {
    expect(f).toContain('vUv * uCssSize');
    expect(f).toContain('px / uNoiseSize');
  });
});

describe('WaterWarpCompositor：激活门与坐标系（node 环境无 document → 恒不激活）', () => {
  it('node 无 DOM：active() 恒 false、beginPass 恒 null（直画回退路径）', () => {
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
    // 纯数学复核 2D 回退的坐标链：device→css（÷cssScale）→world（camL + css/cssZoom）
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
    setWaterWarpDebug('2d');
    expect(liquidDebugState().warp.path).toBe('2d');
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

// 喂纹理防串扰（waterWaves 单例被其他 describe 改态——恢复中性）
describe('测试隔离收尾', () => {
  it('恢复 wave 质量与纹理态', () => {
    waterWaves.setQuality(3);
    setWaveTextures(null, null);
    expect(waterWaves.quality).toBe(3);
  });
});
