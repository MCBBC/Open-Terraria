// 生成期实时世界地图预览（用户特有需求；原版 1.4.0.5 无此功能）。
// 两种模式：
//  - 位图模式（worker 路径）：worldGen.worker 每个 pass 渲染降采样 RGBA（≤640px 宽）
//    transfer 回主线程，此处直接 putImageData——零扫描、零主线程遍历；
//  - 列扫描模式（主线程 fallback）：1px/tile 离屏 canvas + 每帧限量增量重绘
//    （等价原版 DrawToMap 的 maxMapUpdates 限额思想；生成期 setTileSilent 不触发事件）。
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb } from '../draw/UISpriteBatch';
import { UIScale } from '../draw/UIScale';
import { mapColor24 } from '../../render/MapColors';
import type { World } from '../../world/World';

/** 每帧重绘的列数（列扫描 fallback；8400 列大世界约 2 秒扫完一轮） */
const COLUMNS_PER_FRAME = 64;
/** 位图帧擦除耗时（ms）：整帧瞬切观感是"跳变"，改为从左到右刷过揭示 */
const BITMAP_WIPE_MS = 1200;

export class GenWorldPreview extends UIElement {
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private colImg: ImageData;
  private sweepCol = 0;
  /** 位图模式：worker 侧已渲染，收到帧直接 putImageData（不再列扫描） */
  private bitmapMode = false;
  /** 位图显示缓冲（wipe 动画的工作画布；off 始终持有最新帧全文） */
  private show: HTMLCanvasElement | null = null;
  private showCtx: CanvasRenderingContext2D | null = null;
  private revealX = 0;   // 已刷过的源像素宽（0..show.width）
  /** 本轮揭示中途吃过新帧：左段 0..revealX 还是旧内容，本轮走完立即补扫一轮 */
  private roundMissedLeft = false;
  private lastWipeAt = 0;   // 上次 wipe 时间戳（dt 步进；高刷屏不加速）
  private world: World | null = null;
  private previewAspect = 0;

  constructor(world?: World) {
    super();
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d')!;
    this.colImg = this.offCtx.createImageData(1, 1);
    if (world) this.initSweep(world);
  }

  /** 列扫描模式（fallback）：1px/tile 离屏 canvas */
  private initSweep(world: World) {
    this.world = world;
    this.off.width = world.w;
    this.off.height = world.h;
    this.colImg = this.offCtx.createImageData(1, world.h);
    this.previewAspect = world.h / world.w;
    this.applyLayout();
  }

  /** 位图模式（worker 路径）：canvas 尺寸 = 首帧位图尺寸。
   *  新帧写入 off 后不瞬切上屏，而是从左到右擦除式揭示（update 每帧推进 revealX）
   *  ——观感对齐旧列扫描的"刷过去就是每个步骤新生成的效果"（2026-08-26 用户反馈） */
  setPreviewFrame(rgba: Uint8ClampedArray, width: number, height: number): void {
    const first = !this.bitmapMode || this.off.width !== width;
    if (first) {
      this.bitmapMode = true;
      this.off.width = width;
      this.off.height = height;
      this.previewAspect = height / width;
      this.applyLayout();
      this.show = document.createElement('canvas');
      this.show.width = width;
      this.show.height = height;
      this.showCtx = this.show.getContext('2d')!;
    }
    const img = this.offCtx.createImageData(width, height);
    img.data.set(rgba);
    this.offCtx.putImageData(img, 0, 0);
    // 尺寸变化（换世界）：老缓冲作废，直接整帧上屏；首帧同理
    if (first || !this.showCtx || this.show!.width !== width) {
      this.showCtx?.drawImage(this.off, 0, 0);
      this.revealX = width;
      this.roundMissedLeft = false;
      return;
    }
    // 揭示途中来了新帧：edge 之后未揭示区仍显示旧内容，揭示继续但改吃新帧——
    // 不重置 revealX（连续扫，老列扫描同款语义：边缘过后即最新态）。
    // ★链式补扫：本轮结束后立即再扫一轮，把左段错过的新内容补齐——否则最后
    //   一帧若在半途到达，揭示停在半路就再无后续帧，终态永远是"半刷"画面
    if (this.revealX >= width) {   // 揭示已完成 → 立即开新的一轮
      this.revealX = 0;
    } else {
      this.roundMissedLeft = true;
    }
  }

  /** 布局：底部居中，宽取屏宽 55%（上限 520），等比缩放；底部留 56px 避开小贴士行 */
  private applyLayout() {
    const w = Math.min(UIScale.logicalW * 0.55, 520);
    const h = w * this.previewAspect;
    this.width = StyleDimension.fromPixels(w);
    this.height = StyleDimension.fromPixels(h);
    this.hAlign = 0.5;
    this.vAlign = 1;
    this.marginBottom = 56;
  }

  /** worker 路径首帧预览：在未知世界尺寸时先建预览容器 */
  static fromFirstFrame(rgba: Uint8ClampedArray, width: number, height: number): GenWorldPreview {
    const p = new GenWorldPreview();
    p.setPreviewFrame(rgba, width, height);
    return p;
  }

  update(): void {
    if (this.bitmapMode && this.showCtx && this.revealX < this.show!.width) this.wipe();
    else if (!this.bitmapMode && this.world) this.sweep();
    super.update();
  }

  /** 位图帧擦除推进：把 off 的 [revealX, revealX+step) 列段拷上显示缓冲。
   *  帧到达密时多轮揭示共用一条连续 edge（老列扫描观感），帧稀时单轮走完整屏；
   *  走完若 roundMissedLeft 立即接一轮补扫，保证最新帧最终完整上屏 */
  private wipe() {
    const w = this.show!.width;
    // 按 dt 步进：刷过速度与刷新率无关（ProMotion 120Hz 同速）；钳 dt≤100ms 防卡顿瞬移
    const now = performance.now();
    const dt = Math.min(100, this.lastWipeAt ? now - this.lastWipeAt : 16.7);
    this.lastWipeAt = now;
    const step = Math.max(1, Math.round((w / BITMAP_WIPE_MS) * dt));
    const x0 = this.revealX, x1 = Math.min(w, x0 + step);
    this.showCtx!.drawImage(this.off, x0, 0, x1 - x0, this.off.height, x0, 0, x1 - x0, this.off.height);
    this.revealX = x1;
    if (x1 >= w && this.roundMissedLeft) {
      this.revealX = 0;
      this.roundMissedLeft = false;
    }
  }

  /** 列扫描增量重绘（每帧限量防卡顿；仅 fallback 模式） */
  private sweep() {
    const world = this.world!;
    const st = world.store;
    const w = world.w, h = world.h;
    const data = this.colImg.data;
    let n = COLUMNS_PER_FRAME;
    while (n-- > 0) {
      const x = this.sweepCol;
      const bg = world.groundLevel > 0
        ? { groundLevel: world.groundLevel, rockLevel: world.rockLevel }
        : undefined;
      for (let y = 0; y < h; y++) {
        const c = mapColor24(st, x, y, bg);
        const i = y * 4;
        data[i] = (c >> 16) & 255;
        data[i + 1] = (c >> 8) & 255;
        data[i + 2] = c & 255;
        data[i + 3] = 255;
      }
      this.offCtx.putImageData(this.colImg, x, 0);
      this.sweepCol = (x + 1) % w;
      if (this.sweepCol === 0) break; // 扫完一轮，下一帧从头
    }
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    if (d.width <= 0 || d.height <= 0) return;
    // 位图模式画 show（擦除揭示中的显示缓冲）；列扫描模式仍画 off（增量直写）
    const img = (this.bitmapMode && this.show) ? this.show : this.off;
    batch.draw({ img, sx: 0, sy: 0, sw: img.width, sh: img.height },
      d.x, d.y, { scaleX: d.width / img.width, scaleY: d.height / img.height });
    // 边框
    batch.fillRect(d.x, d.y, d.width, 2, rgb(0, 0, 0, 160));
    batch.fillRect(d.x, d.y + d.height - 2, d.width, 2, rgb(0, 0, 0, 160));
    batch.fillRect(d.x, d.y, 2, d.height, rgb(0, 0, 0, 160));
    batch.fillRect(d.x + d.width - 2, d.y, 2, d.height, rgb(0, 0, 0, 160));
    // 扫描前沿白色指示线（显示层叠加，不写入帧缓冲）：细主线 + 极淡光晕。
    // 揭示进行中贴边缘；扫完即隐。fallback 列扫描的循环前沿同款
    let frac = -1;
    if (this.bitmapMode && this.show && this.revealX > 0 && this.revealX < this.show.width)
      frac = this.revealX / this.show.width;
    else if (!this.bitmapMode && this.world && this.world.w > 0)
      frac = this.sweepCol / this.world.w;
    if (frac >= 0) {
      const ex = d.x + d.width * frac;
      batch.fillRect(ex - 2, d.y + 2, 4, d.height - 4, rgb(255, 255, 255, 38));
      batch.fillRect(ex, d.y + 2, 1, d.height - 4, rgb(255, 255, 255, 190));
    }
  }
}
