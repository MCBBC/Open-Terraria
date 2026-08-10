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

export class GenWorldPreview extends UIElement {
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private colImg: ImageData;
  private sweepCol = 0;
  /** 位图模式：worker 侧已渲染，收到帧直接 putImageData（不再列扫描） */
  private bitmapMode = false;
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

  /** 位图模式（worker 路径）：canvas 尺寸 = 首帧位图尺寸 */
  setPreviewFrame(rgba: Uint8ClampedArray, width: number, height: number): void {
    if (!this.bitmapMode || this.off.width !== width) {
      this.bitmapMode = true;
      this.off.width = width;
      this.off.height = height;
      this.previewAspect = height / width;
      this.applyLayout();
    }
    const img = new ImageData(rgba, width, height);
    this.offCtx.putImageData(img, 0, 0);
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
    if (!this.bitmapMode && this.world) this.sweep();
    super.update();
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
      for (let y = 0; y < h; y++) {
        const c = mapColor24(st, x, y);
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
    batch.draw({ img: this.off, sx: 0, sy: 0, sw: this.off.width, sh: this.off.height },
      d.x, d.y, { scaleX: d.width / this.off.width, scaleY: d.height / this.off.height });
    // 边框
    batch.fillRect(d.x, d.y, d.width, 2, rgb(0, 0, 0, 160));
    batch.fillRect(d.x, d.y + d.height - 2, d.width, 2, rgb(0, 0, 0, 160));
    batch.fillRect(d.x, d.y, 2, d.height, rgb(0, 0, 0, 160));
    batch.fillRect(d.x + d.width - 2, d.y, 2, d.height, rgb(0, 0, 0, 160));
  }
}
