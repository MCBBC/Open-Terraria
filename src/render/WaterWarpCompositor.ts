// 水体扭曲后处理编排器（前景水离屏 + 全屏位移合成；管线考据见 GLWaterDistortion 头注）。
//
// 职责（对应原版语义）：
//  a. 前景水 pass 画进离屏 fgCanvas（= 原版 waterTarget 独立渲染目标语义；
//     Renderer.drawLiquids 前景 pass 把 ctx 切到本模块离屏）
//  b. endFgPass：离屏【未扭曲】1:1 合成回世界层（原版 Main.cs:61748 waterTarget
//     直画进场景——水体本体不扭，扭曲全在 EndCapture 全屏 pass）
//  c. applyFullScreen：带光照世界层（GLWorldLight 输出）+ 本离屏（alpha 门控纹理）
//     喂 GLWaterDistortion → 扭曲后画布（Renderer 在 compositeLight 的 GL 路径里
//     以其输出替换直画）。水下整屏扭 / 水线果冻 / 旱地 0，全由 obj19 门控交付。
//  降级：GL 不可用（WebGL 死亡/软件渲染/CPU 渲染）→ applyFullScreen 返回 null，
//     调用方原样直画（无全屏扭曲；表层逐格 bob 也随 warpMode 关闭——静水，无
//     撕裂风险）。
//  逃生门：?wwarp=0 整条管线关闭（前景水直画世界层 + 表层逐格 bob 旧路径）；
//     ?wwarp=2d 强制跳过 GL 全屏 pass（对拍用）。
import { starvedLock } from './GLStats';
import { GLWaterDistortion } from './GLWaterDistortion';
import { waterWaves, waveTexReady } from './WaterWaves';
import { setWaterWarpDebug } from './VanillaLiquidRenderer';

/** 帧级相机/CSS 换算态（Renderer.updateWaterWaves 每帧缓存） */
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

export class WaterWarpCompositor {
  private fgCanvas: HTMLCanvasElement | null = null;
  private fgCtx: CanvasRenderingContext2D | null = null;
  private gl: GLWaterDistortion | null = null;
  private glRetryAt = 0;
  /** ?wwarp=0 关闭 / 2d 强制跳过 GL 全屏（对拍）/ auto（默认 GL 优先） */
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
   * 开始前景水 pass：离屏 fgCanvas 克隆世界变换后返回其 ctx（调用方把
   * drawVanillaLiquids 前景水画上去）。null = 本帧不走离屏（调用方直画世界层）。
   */
  beginFgPass(srcCtx: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    const w = srcCtx.canvas.width, h = srcCtx.canvas.height;
    if (w === 0 || h === 0) return null;
    if (!this.fgCanvas || !this.fgCtx) {
      this.fgCanvas = document.createElement('canvas');
      this.fgCtx = this.fgCanvas.getContext('2d');
      if (!this.fgCtx) { this.fgCanvas = null; return null; }
    }
    if (this.fgCanvas.width !== w || this.fgCanvas.height !== h) {
      this.fgCanvas.width = w; this.fgCanvas.height = h;   // resize 自带清屏
    } else {
      this.fgCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.fgCtx.clearRect(0, 0, w, h);
    }
    // 克隆世界变换（含相机像素吸附/punch——getTransform 全量捕获）
    this.fgCtx.setTransform(srcCtx.getTransform());
    this.fgCtx.globalAlpha = 1;
    this.fgCtx.globalCompositeOperation = 'source-over';
    return this.fgCtx;
  }

  /**
   * 结束前景水 pass：离屏内容【未扭曲】1:1 合成回 srcCtx（身份变换、设备像素）。
   * 原版 Main.cs:61748 waterTarget 直画进场景——水体本体不扭，扭曲全在
   * applyFullScreen 的全屏 pass。
   */
  endFgPass(srcCtx: CanvasRenderingContext2D): void {
    if (!this.fgCanvas) return;
    srcCtx.save();
    srcCtx.setTransform(1, 0, 0, 1, 0, 0);
    srcCtx.globalAlpha = 1;
    srcCtx.globalCompositeOperation = 'source-over';
    srcCtx.drawImage(this.fgCanvas, 0, 0);
    srcCtx.restore();
    // drawVanillaLiquids 的收尾契约（目标 ctx alpha=1）由本函数承继
    srcCtx.globalAlpha = 1;
  }

  /** 前景水离屏（= 原版 waterTarget；applyFullScreen 的 alpha 门控纹理） */
  gateCanvas(): HTMLCanvasElement | null {
    return this.fgCanvas;
  }

  /** 预热 GL 扭曲层（#perf2026-08-28：提前触发上下文创建/着色器编译到加载页窗口；
   *  off/2d 模式 no-op。仅触发现有惰性工厂，无绘制副作用） */
  prewarm(): void {
    if (this.mode === 'auto') void this.glLayer();
  }

  /**
   * 全屏水体扭曲：scene（带光照世界层画布）按位移场重采样、前景水 alpha 门控。
   * 返回扭曲后画布；null = 本帧不扭（GL 不可用 / 逃生门 / 无水帧直通失败），
   * 调用方原样直画 scene。noiseSrc = 噪声贴图（GL 一次性上传）。
   */
  applyFullScreen(
    scene: HTMLCanvasElement, st: WaterWarpFrameState, noiseSrc: TexImageSource | null,
  ): HTMLCanvasElement | null {
    if (this.mode !== 'auto') return null;          // off/2d 逃生门 → 原样直画
    const gl = this.glLayer();
    if (!gl) return null;
    if (gl.composite(scene, this.gateCanvas(), noiseSrc, st.cssW, st.cssH,
      waterWaves.progress, waterWaves.intensity,
      waterWaves.readGridR(), waterWaves.gridW(), waterWaves.gridH())) {
      setWaterWarpDebug('gl');
      return gl.canvas;
    }
    return null;
  }

  /** GL 扭曲是否不可用（F5 诊断：WebGL 缺失/软件渲染/上下文死亡——真值=全屏
   *  扭曲管线走不了，水体只有表层格 bob 路径，深层注入不可见） */
  glUnavailable(): boolean {
    if (this.mode === 'off' || this.mode === '2d') return true;
    if (this.gl) return this.gl.unavailable || !!this.gl.diedAt;
    // 未实例化：试建一个探测（30s 闩内直接 true）
    if (performance.now() < this.glRetryAt) return true;
    return false;
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
    if (starvedLock()) return null;   // 饥饿锁:扭曲层不参与重建竞争(#三开压测批)
    const inst = new GLWaterDistortion();
    if (inst.unavailable) {
      inst.dispose();
      this.glRetryAt = performance.now() + 30_000;
      return null;
    }
    this.gl = inst;
    return inst;
  }
}
