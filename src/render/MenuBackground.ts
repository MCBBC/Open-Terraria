// 主菜单背景（原版语义对齐版）：
//   昼夜循环（time 在 gameMenu 也推进，UpdateTime:64426 无条件 time+=dayRate）→
//   天空/星星/太阳月亮随时间变化 + 夜间地表层整体压暗；
//   生物群系主题轮换（原版标题屏固定森林，1.4.4 起轮换群系背景；贴图集表取自
//   BiomeBackground 的 setBG 表）+ 过渡交叉淡化（bgAlpha 语义）；
//   前景视差层贴底 + 横向平铺，缩放只跟屏高（bgScale=max(1,H/800)）。
import { SkyRenderer } from './SkyRenderer';
import { Clock } from '../world/World';

/** 标题屏主题（远山层 + 前景三层；-1 = 无该层）。贴图 id 取自 BiomeBackground setBG 表 */
interface TitleTheme { far: number; layers: [number, number, number] }
const THEMES: TitleTheme[] = [
  { far: 7, layers: [50, 51, 52] },        // 森林（默认组）
  { far: 23, layers: [12, 13, 14] },       // 腐化
  { far: 24, layers: [43, 44, 45] },       // 猩红
  { far: 35, layers: [37, 38, 39] },       // 雪原
  { far: 15, layers: [15, 16, 17] },       // 丛林
  { far: 24, layers: [21, 20, -1] },       // 沙漠
  { far: 29, layers: [29, 30, 31] },       // 神圣
  { far: 7, layers: [26, 27, 28] },        // 发光蘑菇
];
const THEME_HOLD_MS = 90_000;   // 每主题停留
const THEME_FADE_MS = 4_000;    // 交叉淡化时长

/** 供 TitleMenu 读取的菜单时间状态（LogoA/LogoB 昼夜交叉淡化用） */
export const menuTimeInfo = { timeOfDay: 0.3, dayFactor: 1 };

export class MenuBackground {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sky = new SkyRenderer();
  /** 菜单时钟：一圈 2.5 分钟（游戏内 30 分钟太慢，太阳 1.5px/s 肉眼不可见；
   *  加速后约 75s 昼 + 75s 夜，日月升降与昼夜交替肉眼可见） */
  private clock = new Clock(150_000);
  private camX = 0;
  private imgs = new Map<number, HTMLImageElement>();
  private themeIdx = Math.floor(Math.random() * THEMES.length);
  private themeT = 0;

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

  private img(n: number): HTMLImageElement | null {
    if (n < 0) return null;
    if (this.imgs.has(n)) return this.imgs.get(n) ?? null;
    const im = new Image();
    im.src = `sprites/vanilla/Background_${n}.png`;
    this.imgs.set(n, im);
    return im;
  }

  /** 缩放只跟屏高（与宽度无关；宽度不足横向平铺） */
  private bgScale(): number {
    return Math.max(1, this.canvas.height / 800);
  }

  /** 单层横滚平铺 */
  private drawLayer(n: number, parallax: number, y: number, alpha = 1) {
    const im = this.img(n);
    if (!im || !im.complete || im.naturalWidth === 0 || alpha <= 0.01) return;
    const scale = this.bgScale();
    const w = im.naturalWidth * scale, h = im.naturalHeight * scale;
    const startX = -(((this.camX * parallax) % w) + w) % w;
    const loops = Math.ceil(this.canvas.width / w) + 1;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < loops; i++) ctx.drawImage(im, startX + i * w, y, w, h);
    ctx.restore();
  }

  /** 主题绘制：远山 + 前景三层贴底（错层 1.10/1.03/0.94，最前层沉到屏底以下） */
  private drawTheme(idx: number, alpha: number) {
    const th = THEMES[idx % THEMES.length];
    const H = this.canvas.height, s = this.bgScale();
    this.drawLayer(th.far, 0.10, H * 0.18 * s, alpha);
    const sinks = [1.10, 1.03, 0.94];
    const pars = [0.25, 0.25, 0.27];
    for (let i = 0; i < 3; i++) {
      const tex = th.layers[i];
      if (tex < 0) continue;
      const im = this.img(tex);
      if (!im || !im.complete || im.naturalWidth === 0) continue;
      const h = im.naturalHeight * this.bgScale();
      this.drawLayer(tex, pars[i], H - h * sinks[i], alpha);
    }
  }

  tick(dtMs: number) {
    this.clock.tick(dtMs);
    this.lastDt = dtMs;
    this.camX += 4 * (dtMs / 16.7); // 原版 MenuXMovement(4f)/帧
    const W = this.canvas.width, H = this.canvas.height;
    menuTimeInfo.timeOfDay = this.clock.timeOfDay;
    menuTimeInfo.dayFactor = this.clock.dayFactor;

    this.sky.draw(this.ctx, this.clock, W, H, this.camX, dtMs);

    // 主题轮换 + 交叉淡化（bgAlpha ±0.05/帧 语义的时长版）
    this.themeT += dtMs;
    const cycle = THEME_HOLD_MS + THEME_FADE_MS;
    if (this.themeT >= cycle) {
      this.themeT -= cycle;
      this.themeIdx = (this.themeIdx + 1) % THEMES.length;
    }
    const fade = Math.max(0, Math.min(1, (this.themeT - THEME_HOLD_MS) / THEME_FADE_MS));
    this.drawTheme(this.themeIdx, 1 - fade);
    if (fade > 0) this.drawTheme(this.themeIdx + 1, fade);

    // 夜间压暗（≈ ColorOfSurfaceBackgrounds 随 timeOfDay 变暗；只压地表层不压 UI——UI 在 DOM 层）
    const dark = (1 - this.clock.dayFactor) * 0.72; // dayFactor 1→0.32
    if (dark > 0.01) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'multiply';
      this.ctx.fillStyle = `rgb(${Math.round(255 - dark * 170)},${Math.round(255 - dark * 150)},${Math.round(255 - dark * 60)})`;
      this.ctx.fillRect(0, 0, W, H);
      this.ctx.restore();
    }
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  /** 调试探针 */
  lastDt = 0;
  clockTime(): number { return this.clock.timeOfDay; }
}
