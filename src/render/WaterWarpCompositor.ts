// 水体果冻后处理编排器（离屏水层 + 位移场扭曲合成；管线考据见 GLWaterDistortion 头注）。
//
// 职责（对应任务分解）：
//  a. 前景/背景水 pass 画进离屏 waterCanvas（= 原版 waterTarget/backWaterTarget 语义；
//     Renderer.drawLiquids 把 ctx 切到本模块的离屏）
//  b. 波场（waterWaves._R 经 readGridR）作为扭曲纹理喂 GL（GLWaterDistortion 上传）
//  c. GL 合成：waterCanvas 的 UV 被位移场偏移（噪声双采样 + 波场，公式=obj19）
//  d. 合成结果画回世界层（光照 compositeLight 在其后乘光——水扭曲吃光照）
//  2D 回退：GL 不可用（?wwarp=2d 对拍 / WebGL 死亡）→ 分块 drawImage 位移近似
//     （32px 块 × 整数偏移；块间 ≤1px 台阶——涟漪主体保留，环境微 shimmer 弱化为
//     块常量；X 位移（噪声 ±0.3px）一并舍入）。静水（全场 |位移|<0.5 设备 px）单次
//     直拷零额外成本。
//  逃生门：?wwarp=0 整条管线关闭 → 直画 + 表层格 Y 位移旧路径（LiquidOffset 语义
//     的原载体，零回归兜底）。
//
// 表层水线 bob 的"LiquidOffset 语义"在管线激活时由位移场整体交付（原版 waterTarget
// 本体无 bob——bob 全部来自 filter 的屏幕位移）；管线关闭时回落旧逐格 bob 路径。
import { GLWaterDistortion } from './GLWaterDistortion';
import { waterWaves, waveTexReady } from './WaterWaves';
import { lastWaterDrawBounds, setWaterWarpDebug } from './VanillaLiquidRenderer';

/** 帧级相机/CSS 换算态（Renderer.updateWaterWaves 每帧缓存；2D 回退坐标换算共用） */
export interface WaterWarpFrameState {
  /** 模拟系 CSS px 视口（波场/噪声坐标系） */
  cssW: number; cssH: number;
  /** 设备 px / css px（DPR 缩放） */
  cssScale: number;
  /** css px / 世界 px */
  cssZoom: number;
  /** 视口左上世界 px（相机中心 - 半视口） */
  camL: number; camT: number;
}

/** 2D 回退分块边长（设备 px；涟漪波长 ≥40 css px，32px 块可跟踪其主体） */
const FALLBACK_CELL = 32;

export class WaterWarpCompositor {
  private fgCanvas: HTMLCanvasElement | null = null;
  private fgCtx: CanvasRenderingContext2D | null = null;
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D | null = null;
  private gl: GLWaterDistortion | null = null;
  private glRetryAt = 0;
  /** ?wwarp=0 关闭 / 2d 强制回退（对拍）/ auto（默认 GL 优先） */
  readonly mode: 'auto' | '2d' | 'off' = (() => {
    try {
      const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('wwarp') : null;
      if (v === '0') return 'off';
      if (v === '2d') return '2d';
    } catch { /* 非浏览器环境 */ }
    return 'auto';
  })();

  /** 管线帧级激活（SceneState.cs:129 WaveQuality>0 + 噪声就绪；Renderer 另查 cpuRender） */
  active(): boolean {
    return this.mode !== 'off' && typeof document !== 'undefined'
      && waterWaves.quality > 0 && waveTexReady();
  }

  /**
   * 开始水体 pass：离屏 waterCanvas 克隆世界变换后返回其 ctx（调用方把
   * drawVanillaLiquids 画上去）。null = 本帧不走离屏（调用方直画世界层）。
   */
  beginPass(srcCtx: CanvasRenderingContext2D, isBackground: boolean): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    const w = srcCtx.canvas.width, h = srcCtx.canvas.height;
    if (w === 0 || h === 0) return null;
    if (!this.fgCanvas || !this.fgCtx || !this.bgCanvas || !this.bgCtx) {
      this.fgCanvas = document.createElement('canvas');
      this.fgCtx = this.fgCanvas.getContext('2d');
      this.bgCanvas = document.createElement('canvas');
      this.bgCtx = this.bgCanvas.getContext('2d');
      if (!this.fgCtx || !this.bgCtx) { this.fgCanvas = null; this.bgCanvas = null; return null; }
    }
    const c = isBackground ? this.bgCanvas : this.fgCanvas;
    const ctx = isBackground ? this.bgCtx! : this.fgCtx!;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }   // resize 自带清屏
    else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
    }
    // 克隆世界变换（含相机像素吸附/punch——getTransform 全量捕获）
    ctx.setTransform(srcCtx.getTransform());
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return ctx;
  }

  /**
   * 结束水体 pass：位移场扭曲离屏内容合成回 srcCtx（身份变换、设备像素 1:1）。
   * noiseSrc = 噪声贴图（atlas 提取；GL 一次性上传）。
   * foot = 足迹纹理（前景 pass = 背景水层；GL 采样落空回退用，见 GLWaterDistortion.FRAG）。
   */
  endPass(
    srcCtx: CanvasRenderingContext2D, isBackground: boolean,
    st: WaterWarpFrameState, noiseSrc: TexImageSource | null,
    foot: HTMLCanvasElement | null = null,
  ): void {
    const src = isBackground ? this.bgCanvas! : this.fgCanvas!;
    srcCtx.save();
    srcCtx.setTransform(1, 0, 0, 1, 0, 0);
    srcCtx.globalAlpha = 1;
    srcCtx.globalCompositeOperation = 'source-over';
    let path: 'gl' | '2d' = '2d';
    if (this.mode === 'auto') {
      const gl = this.glLayer();
      if (gl && gl.composite(src, noiseSrc, st.cssW, st.cssH,
        waterWaves.progress, waterWaves.intensity,
        waterWaves.readGridR(), waterWaves.gridW(), waterWaves.gridH(), foot)) {
        srcCtx.drawImage(gl.canvas, 0, 0);
        path = 'gl';
      }
    }
    if (path === '2d') this.warp2D(srcCtx, src, st);
    srcCtx.restore();
    // drawVanillaLiquids 的收尾契约（目标 ctx alpha=1）在管线激活时由本函数承继
    // ——否则直画路径每帧末尾的 globalAlpha=1 落在离屏上，主 ctx 残留前置 pass 的 alpha
    srcCtx.globalAlpha = 1;
    setWaterWarpDebug(path);
  }

  /** 背景水层画布（= 水体足迹含浸润带；前景 pass 采样落空回退的足迹纹理） */
  footprintCanvas(): HTMLCanvasElement | null {
    return this.bgCanvas;
  }

  /** GL 实例哨兵（活实例直取；死亡 5s 退避；初始化失败 30s 闩——同 worldLightLayer） */
  private glLayer(): GLWaterDistortion | null {
    if (this.gl) {
      if (!this.gl.unavailable && !this.gl.diedAt) return this.gl;
      if (performance.now() - this.gl.diedAt < 5000) { this.gl = null; return null; }
      this.gl.dispose();
      this.gl = null;
    }
    if (performance.now() < this.glRetryAt) return null;
    const inst = new GLWaterDistortion();
    if (inst.unavailable) {
      inst.dispose();
      this.glRetryAt = performance.now() + 30_000;
      return null;
    }
    this.gl = inst;
    return inst;
  }

  /** 2D 回退：分块位移合成（块偏移 = sampleDisplace@块中心世界坐标，整数化） */
  private warp2D(dst: CanvasRenderingContext2D, src: HTMLCanvasElement, st: WaterWarpFrameState): void {
    const b = lastWaterDrawBounds();
    if (!b) return;                      // 本 pass 无水体（离屏全透明）——零成本直通
    // 外扩 24 设备 px：浸润带画进离屏层后足迹比水体格外伸 1 格（16 世界 px）；
    // 分块覆盖域必须含带，否则 2D 回退丢带
    const x0 = Math.max(0, b[0] - 24), y0 = Math.max(0, b[1] - 24);
    const x1 = Math.min(src.width, b[2] + 24), y1 = Math.min(src.height, b[3] + 24);
    if (x1 <= x0 || y1 <= y0) return;
    const cell = FALLBACK_CELL;
    const cols = Math.ceil((x1 - x0) / cell), rows = Math.ceil((y1 - y0) / cell);
    const n = cols * rows;
    const dxs = new Int16Array(n), dys = new Int16Array(n);
    const disp: [number, number] = [0, 0];
    let any = false;
    for (let r = 0; r < rows; r++) {
      const cy = y0 + r * cell;
      const ch = Math.min(cell, y1 - cy);
      const cssY = (cy + ch * 0.5) / st.cssScale;
      const wy = st.camT + cssY / st.cssZoom;
      for (let c = 0; c < cols; c++) {
        const cx = x0 + c * cell;
        const cw = Math.min(cell, x1 - cx);
        const cssX = (cx + cw * 0.5) / st.cssScale;
        waterWaves.sampleDisplace(st.camL + cssX / st.cssZoom, wy, disp);
        const k = r * cols + c;
        // css px 位移 → 设备 px（= sampleDisplace 文档坐标语义）
        const dx = Math.round(disp[0] * st.cssScale);
        const dy = Math.round(disp[1] * st.cssScale);
        dxs[k] = dx; dys[k] = dy;
        if (dx !== 0 || dy !== 0) any = true;
      }
    }
    if (!any) {                           // 静水：位移场全零 → 单次直拷
      dst.drawImage(src, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      return;
    }
    for (let r = 0; r < rows; r++) {
      const cy = y0 + r * cell;
      const ch = Math.min(cell, y1 - cy);
      for (let c = 0; c < cols; c++) {
        const cx = x0 + c * cell;
        const cw = Math.min(cell, x1 - cx);
        const k = r * cols + c;
        dst.drawImage(src, cx, cy, cw, ch, cx + dxs[k], cy + dys[k], cw, ch);
      }
    }
  }
}
