// BJ89 债3 守卫：波场缓冲滚动世界锚定（WaterShaderData _lastDistortionDrawOffset
// 三件套 1:1——注入锚 snapUp :183 / 传播 vector3=F_n−F_{n−1} :151-156 / 读侧补偿
// uImageOffset :374 + obj19 c11）。
//
// 定谳（2026-09-15 真实在环探针）：旧实现存 +camCss·0.25（符号反）+注入真 cam+读屏
// 幕锚定 → 内容随相机【同向】移，世界静止 stamp 在 +40px 跳变后表观世界 1004→1080
// （≈2× 相机速漂移）；原版任意龄期 0px。变异证红：frame() 滚动域去负号 / 摘
// uWaveOff / 出界改回 clamp → 本文件多例即红。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { waterWaves, setWaveTextures } from '../src/render/WaterWaves';

const VIEW_W = 800, VIEW_H = 600;
const WORLD_X = 1000, WORLD_Y = 300;
// stamp 顶点峰（flow 右向 → 形状左半负相位区；峰 texel 相对 stamp 盒固定）
function peakR(): { bx: number; by: number; v: number } {
  const R = waterWaves.readGridR();
  const w = waterWaves.gridW();
  const cy = ((WORLD_Y - 200) * 0.25) | 0;
  let best = -1, bi = -1;
  for (let y = cy - 6; y <= cy + 6; y++) {
    for (let x = 0; x < w; x++) {
      const v = R[y * w + x];
      if (v > best) { best = v; bi = y * w + x; }
    }
  }
  return { bx: bi % w, by: (bi / w) | 0, v: best };
}
const inp = (camX: number) => ({
  camX, camY: 200, zoom: 1, viewW: VIEW_W, viewH: VIEW_H,
  tileX: 60, tileY: 20, maxTilesX: 8400, maxTilesY: 2400,
  worldSurface: 300, rockLayer: 1200, windAbs: 0, rain: 0, dt: 1 / 60,
});

describe('BJ89 债3：波场滚动世界锚定（行为面）', () => {
  beforeEach(() => {
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    setWaveTextures(null, null);
  });

  it('单帧 +40px 跳变：内容移向 = −ΔF（原版 vector3），表观世界坐标不变', () => {
    const cam0 = 640;
    waterWaves.frame(inp(cam0));                       // 预热：同步 F（避免 reset 首帧大跳变）
    waterWaves.injectWash(WORLD_X, WORLD_Y, 48, 48, 0.9, 0.5, 0.8);
    waterWaves.frame(inp(cam0));                       // 同相机步：stamp 原位
    const p0 = peakR();
    expect(p0.v).toBeGreaterThan(0.5);                 // 夹具非哑：stamp 真在缓冲里
    const apparent0 = 4 * p0.bx + cam0;                // 屏幕锚定读侧换算（snapUp≈cam 时）
    const cam1 = cam0 + 40;                            // ΔF = floor(−170)−floor(−160) = −10
    waterWaves.frame(inp(cam1));
    const p1 = peakR();
    // 内容移动 = vector3 = −10 texel（旧实现 +10 = 本判据红）
    expect(p1.bx - p0.bx).toBeLessThanOrEqual(-9);
    expect(p1.bx - p0.bx).toBeGreaterThanOrEqual(-11);
    // 表观世界坐标不变（读侧补偿 + snapUp 锚——旧实现 1004→1084 = 本判据红）
    const apparent1 = 4 * p1.bx + cam1;
    expect(Math.abs(apparent1 - apparent0)).toBeLessThanOrEqual(4);
    expect(Math.abs(apparent1 - WORLD_X)).toBeLessThanOrEqual(8);
  });

  it('连续步行 pan（20 帧 ×3px）：每帧新章表观世界坐标有界（单章相干追踪）', () => {
    let cam = 640;
    waterWaves.frame(inp(cam));
    const drifts: number[] = [];
    for (let f = 0; f < 20; f++) {
      cam += 3;
      waterWaves.injectWash(WORLD_X, WORLD_Y, 48, 48, 0.9, 0.5, 0.8);
      waterWaves.frame(inp(cam));
      const p = peakR();
      drifts.push(4 * p.bx + cam - WORLD_X);
      waterWaves.disable();   // 清场（_scrollX 保留）——下一帧只含单一新章=相干峰
    }
    // ★判据 = 有界性（旧实现逐帧 +2×步速单调漂移，20 帧累计 >90px=本判据红；
    //   新实现锚定栅格：|drift| = 峰 texel 量化 ±1texel + 亚栅格相位 ≤ 8px——
    //   vanilla 同为 4px/texel 缓冲量化精度，读侧补偿只对齐采样栅格）
    expect(Math.max(...drifts.map(Math.abs))).toBeLessThanOrEqual(8);
    // 无趋势：首尾漂移差有界（旧实现首尾差 ~2×19×3=114px）
    const span = Math.abs(drifts[drifts.length - 1] - drifts[0]);
    expect(span).toBeLessThanOrEqual(8);
  });

  it('大跳变出界源 = 中性（原版 swap 清屏未覆盖区；旧 clamp 边缘拉伸=红）', () => {
    waterWaves.frame(inp(1000));                       // F 同步
    waterWaves.frame(inp(1000 + 4 * 600));             // 单帧 +2400px = ΔF −600 ≫ 网格宽
    const R = waterWaves.readGridR();
    let non = 0;
    for (let i = 0; i < R.length; i++) if (R[i] !== 0.5) non++;
    expect(non).toBe(0);
  });

  it('CPU 读路径：sampleDisplace 位移谷钉在世界点（相机 pan 下不漂）', () => {
    const noise = new Uint8ClampedArray(256 * 256 * 4).fill(128);   // 平噪声=梯度零→h 项主导
    setWaveTextures({ w: 256, h: 256, data: noise }, { data: new Uint8ClampedArray(64 * 128 * 4).fill(255) });
    let cam = 640;
    waterWaves.frame(inp(cam));
    waterWaves.injectWash(WORLD_X, WORLD_Y, 48, 48, 0.9, 0.5, 0.8);
    waterWaves.frame(inp(cam));
    const dipAt = (): number => {
      const o = [0, 0] as [number, number];
      let best = -1, bx = 0;
      for (let x = WORLD_X - 160; x <= WORLD_X + 160; x += 2) {
        waterWaves.sampleDisplace(x, WORLD_Y, o);
        // 平噪声→梯度零，dispy = −clamp(h−0.5)；stamp R 沉积双向（s<0.5 段压 R
        // 低于 0.5）→ 位移峰取 |dispy| 最大（h 项幅度 ~0.1-0.3·32=3-10px）
        if (Math.abs(o[1]) > best) { best = Math.abs(o[1]); bx = x; }
      }
      return bx;
    };
    const d0 = dipAt();
    const moving: number[] = [d0];
    for (let f = 0; f < 8; f++) { cam += 3; waterWaves.frame(inp(cam)); moving.push(dipAt()); }
    // 静态相机对照臂：同一演化序列（环扩散本身移动 |dispy| 峰）——隔离滚动分量
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    setWaveTextures({ w: 256, h: 256, data: noise }, { data: new Uint8ClampedArray(64 * 128 * 4).fill(255) });
    let camS = 640;
    waterWaves.frame(inp(camS));
    waterWaves.injectWash(WORLD_X, WORLD_Y, 48, 48, 0.9, 0.5, 0.8);
    waterWaves.frame(inp(camS));
    const still: number[] = [dipAt()];
    for (let f = 0; f < 8; f++) { waterWaves.frame(inp(camS)); still.push(dipAt()); }
    // stamp 盒半宽 24px 内的形状峰（新月形不对称）——|d0−WORLD_X| 本征 ≤24
    expect(Math.abs(d0 - WORLD_X)).toBeLessThanOrEqual(24);
    // ★滚动致偏 = 动/静两臂逐帧差（旧实现 ~2×步速累积 ≈50px=本判据红；新实现 ≤8px）
    for (let f = 0; f < moving.length; f++) {
      expect(Math.abs(moving[f] - still[f])).toBeLessThanOrEqual(8);
    }
  });
});

describe('BJ89 债3：结构锁（源文本锚）', () => {
  const wavesSrc = readFileSync(new URL('../src/render/WaterWaves.ts', import.meta.url), 'utf8');
  const warpSrc = readFileSync(new URL('../src/render/WaterWarpCompositor.ts', import.meta.url), 'utf8');

  it('frame() 滚动域 = F（floor(−camCss·0.25)，vanilla vector−screenPosition）', () => {
    expect(wavesSrc).toContain('Math.floor(-inp.camX * inp.zoom * 0.25)');
  });
  it('注入锚 = snapUp（center·z + 4F；DrawWaves :183）——洗掠与涟漪两路', () => {
    expect(wavesSrc).toContain('(centerX * z + 4 * this._scrollX) * 0.25');
    expect(wavesSrc).toContain('(_rqX[q] * z + 4 * this._scrollX) * 0.25');
  });
  it('读侧补偿在 _readR 与公开 waveReadOffset（Apply :374）——函数体逐字锁', () => {
    expect(wavesSrc).toContain('const ox = this._camX * this._zoom + 4 * this._scrollX;');
    expect(wavesSrc).toContain('return [this._camX * this._zoom + 4 * this._scrollX, this._camY * this._zoom + 4 * this._scrollY];');
    expect(wavesSrc).toContain('waveReadOffset()');
  });
  it('_step 出界源 = 中性（非 clamp）', () => {
    expect(wavesSrc).toContain('R2[i] = 0.5; G2[i] = 0.5;');
  });
  it('GL 接线：WaterWarpCompositor 传 waveReadOffset → uWaveOff', () => {
    expect(warpSrc).toContain('...waterWaves.waveReadOffset()');
  });
});
