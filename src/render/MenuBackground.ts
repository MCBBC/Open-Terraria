// 主菜单背景（原版素材版）：天空（SkyRenderer）+ 原版地表视差层
// （Background_7/8 远山 + Background_50/51/52 森林树层，DrawSurfaceBG 的分层语义），
// 横向无限滚动（原版 MenuXMovement 4px/帧）。替代此前纯天空程序化背景。
import { SkyRenderer } from './SkyRenderer';
import { Clock } from '../world/World';

export class MenuBackground {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sky = new SkyRenderer();
  private clock = new Clock(30 * 60 * 1000);
  private camX = 0;
  private imgs = new Map<number, HTMLImageElement>();

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

  /** 原版背景贴图懒加载（Background_N，MISC 管线已全量落盘） */
  private img(n: number): HTMLImageElement | null {
    if (this.imgs.has(n)) return this.imgs.get(n) ?? null;
    const im = new Image();
    im.src = `sprites/vanilla/Background_${n}.png`;
    this.imgs.set(n, im);
    return im;
  }

  /** 单层横滚绘制：贴图平铺铺满屏宽，y 为层顶位置，parallax 为视差系数 */
  private drawLayer(n: number, parallax: number, y: number, alpha = 1) {
    const im = this.img(n);
    if (!im || !im.complete || im.naturalWidth === 0) return; // 首帧未就绪跳过
    const ctx = this.ctx;
    // 等比放大到至少铺满屏宽的 1.1 倍（保证平铺无缝循环感）
    const scale = Math.max(this.canvas.width / im.naturalWidth, 1.15);
    const w = im.naturalWidth * scale;
    const h = im.naturalHeight * scale;
    let startX = -(((this.camX * parallax) % w) + w) % w;
    const loops = Math.ceil(this.canvas.width / w) + 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < loops; i++) ctx.drawImage(im, startX + i * w, y, w, h);
    ctx.restore();
  }

  tick(dtMs: number) {
    this.clock.tick(dtMs);
    this.camX += 4 * (dtMs / 16.7); // 原版 MenuXMovement(4f)/帧
    const W = this.canvas.width, H = this.canvas.height;
    this.sky.draw(this.ctx, this.clock, W, H, this.camX);
    // ---- 原版素材地表层（自上而下：远山 → 近山 → 树层贴底）----
    // 远山（Forest 远山组 m[0]=7 parallax 0.1 / m[1]=8 parallax 0.18）
    this.drawLayer(7, 0.10, H * 0.18);
    this.drawLayer(8, 0.18, H * 0.34);
    // 森林树层（t=[50,51,52]，越后越近越快；贴底对齐）
    this.drawLayer(50, 0.25, H - 509 * (W / 1024) * 0.9);
    this.drawLayer(51, 0.25, H - 509 * (W / 1024) * 1.0);
    this.drawLayer(52, 0.27, H - 509 * (W / 1024) * 1.1);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}
