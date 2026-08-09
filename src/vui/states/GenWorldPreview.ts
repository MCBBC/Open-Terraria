// 生成期实时世界地图预览（用户特有需求；原版 1.4.0.5 无此功能）。
// 策略：离屏 canvas（1px/tile）+ 每帧限量「列扫描」增量重绘（等价原版 DrawToMap 的
// maxMapUpdates 限额思想）；生成中数据持续变化，扫描循环刷新而非脏块跟踪
// （生成期 setTileSilent 不触发 onTileChanged）。
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb } from '../draw/UISpriteBatch';
import { mapColor24 } from '../../render/MapColors';
import type { World } from '../../world/World';

/** 每帧重绘的列数（列 = 全高 1px 宽；8400 列大世界约 2 秒扫完一轮） */
const COLUMNS_PER_FRAME = 64;

export class GenWorldPreview extends UIElement {
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private colImg: ImageData;
  private sweepCol = 0;

  constructor(private world: World) {
    super();
    this.off = document.createElement('canvas');
    this.off.width = world.w;
    this.off.height = world.h;
    this.offCtx = this.off.getContext('2d')!;
    this.colImg = this.offCtx.createImageData(1, world.h);
    // 左侧全高：x=8；宽 300（逻辑 px）；上下留 8px 边距（margin 收缩 Fill 高度）
    this.left = StyleDimension.fromPixels(8);
    this.top = StyleDimension.fromPixels(8);
    this.width = StyleDimension.fromPixels(300);
    this.height = StyleDimension.Fill;
    this.marginTop = 8;
    this.marginBottom = 8;
  }

  update(): void {
    this.sweep();
    super.update();
  }

  /** 列扫描增量重绘（每帧限量防卡顿） */
  private sweep() {
    const st = this.world.store;
    const w = this.world.w, h = this.world.h;
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
