// 主菜单背景：天空 + 云横向滚动（复刻 Main.DrawBG 菜单分支 48035-48042 的横滚语义）。
// 背景画在独立 canvas（z-index 0），VUI 透明叠加其上。
import { SkyRenderer } from './SkyRenderer';
import { Clock } from '../world/World';

export class MenuBackground {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sky = new SkyRenderer();
  private clock = new Clock(30 * 60 * 1000);
  private camX = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;z-index:0;';
    parent.insertBefore(this.canvas, parent.firstChild);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = () => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  /** 每帧驱动。返回 false 表示已销毁 */
  tick(dtMs: number) {
    this.clock.tick(dtMs);
    this.camX += 4 * (dtMs / 16.7); // 原版 MenuXMovement(4f)/帧
    this.sky.draw(this.ctx, this.clock, this.canvas.width, this.canvas.height, this.camX);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}
