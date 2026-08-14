// 主菜单背景（1456 源码对齐版）：
//   原版标题屏 = 森林背景专属（DrawBG:48035-48042 bgStyle = dayTime?0:1 = Forest1/Forest2），
//   前景是【多套森林树型变体轮换】（treeBGSet1-4 + backgroundLayerTransitionSpeed=0.02 交叉淡化），
//   不是不同生物群系！位置为绝对 UI 坐标（DrawSurfaceBG_Forest gameMenu 分支）：
//     远山 treeMntBGSet[0] y=100（:59257）、treeMntBGSet[1] y=230（:59307）
//     树层0 y=320（-50 若 50 / -100 若 53…:60815）、树层1 y=400、树层2 y=480
//     树层 scale=1.25 parallax=0.4（:60710）；基准 UI 高 982（1920×1080 UIScale1.1）
//   昼夜循环（UpdateTime:64426 菜单也走 time）→ 天空/日月/星 + 夜间 multiply 压暗。
import { upgradeToBitmap } from '../assets/SpriteAtlas';
import { SkyRenderer } from './SkyRenderer';
import { Clock } from '../world/World';

/** 森林背景变体（SetForestBGSet WorldGen.cs:7605 实表）：远山对 + 三树层 */
interface ForestVariant { mnt: [number, number]; trees: [number, number, number] }
const FOREST_VARIANTS: ForestVariant[] = [
  { mnt: [7, 8], trees: [50, 51, 52] },      // style 1（默认）
  { mnt: [7, 8], trees: [53, 54, 55] },      // style 2
  { mnt: [7, 90], trees: [91, -1, 92] },     // style 3
  { mnt: [171, 172], trees: [173, -1, -1] }, // style 6
  { mnt: [176, 177], trees: [178, -1, -1] }, // style 7
];
const VARIANT_HOLD_MS = 30_000;  // 原版约 30-40s 轮换
const VARIANT_FADE_MS = 3_000;   // bgAlpha 交叉淡化

/** 供 TitleMenu 读取的菜单时间状态（LogoA/LogoB 昼夜交叉淡化用） */
export const menuTimeInfo = { timeOfDay: 0.3, dayFactor: 1 };

/** 原版 gameMenu 绝对 Y 基准：1920×1080 @UIScale1.1 → UI 高 982 */
const UI_H = 982;

export class MenuBackground {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sky = new SkyRenderer();
  /** 菜单时钟：一圈 2.5 分钟（原版 30min 太慢，日月升降肉眼不可见） */
  private clock = new Clock(24 * 60 * 1000); // 与世界同周期 24min（1:1）

  /** 标题屏日月拖拽写时间（GOING_OLDSCHOOL B2，Main.cs:62434-62446 反算值）：
   *  供 mainFlow.flow.onSunMoonGrab → setClockT(t01) 接线，日月跟手 */
  setClockT(time01: number): void {
    this.clock.timeOfDay = ((time01 % 1) + 1) % 1;
  }
  private camX = 0;
  private imgs = new Map<number, ImageBitmap | HTMLImageElement>();
  private variantIdx = Math.floor(Math.random() * FOREST_VARIANTS.length);
  private variantT = 0;

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

  private img(n: number): ImageBitmap | HTMLImageElement | null {
    if (n < 0) return null;
    if (this.imgs.has(n)) return this.imgs.get(n) ?? null;
    const im = new Image();
    im.onload = () => upgradeToBitmap(im, (b) => this.imgs.set(n, b));
    im.src = `sprites/vanilla/Background_${n}.png`;
    return null;  // bitmap 就绪才入缓存(未就绪 drawLayer 跳帧)
  }

  /** UI 像素 → 当前屏幕像素（原版 UIScale 语义） */
  private ui(): number { return this.canvas.height / UI_H; }

  /** 单层横滚平铺（原版 DrawSurfaceBG 主循环） */
  private drawLayer(n: number, parallax: number, y: number, scale: number, alpha = 1) {
    const im = this.img(n);
    if (!im || !(im.width > 0) || im.width === 0 || alpha <= 0.01) return;
    const w = im.width * scale, h = im.height * scale;
    const startX = -(((this.camX * parallax) % w) + w) % w - w / 2;
    const loops = Math.ceil(this.canvas.width / w) + 2;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 接缝修复：浮点 X/宽度平铺会在相邻贴图间露出亚像素缝隙——
    // 坐标取整 + 每张多画 1px 重叠（背景层无感知，消除滚动接缝）
    const yR = Math.round(y);
    for (let i = 0; i < loops; i++) {
      ctx.drawImage(im, Math.round(startX + i * w), yR, Math.ceil(w) + 1, h);
    }
    ctx.restore();
  }

  /** 画一套森林变体（绝对 UI 坐标 + 贴图特例偏移，:60815 起） */
  private drawVariant(idx: number, alpha: number) {
    const v = FOREST_VARIANTS[idx % FOREST_VARIANTS.length];
    const u = this.ui();
    // 远山（:59257 y=100 / :59307 y=230；parallax 0.1/0.18，scale 1）
    this.drawLayer(v.mnt[0], 0.10, 100 * u, u, alpha);
    this.drawLayer(v.mnt[1], 0.18, 230 * u, u, alpha);
    // 树层（gameMenu: y=320/400/480；scale 1.25；parallax 0.4）
    const treeYBase = [320, 400, 480];
    for (let i = 0; i < 3; i++) {
      const tex = v.trees[i];
      if (tex < 0) continue;
      let y = treeYBase[i];
      // 贴图特例（:60815-60854：50→-50、53→-100、91/173→+200、178→+75、52→-50、55→-100、92→+150）
      if (tex === 50 || tex === 51 || tex === 52) y -= 50;
      else if (tex === 53 || tex === 54 || tex === 55) y -= 100;
      else if (tex === 91 || tex === 92 || tex === 173) y += 150 + (i === 0 ? 50 : 0);
      else if (tex === 178) y += 75;
      this.drawLayer(tex, 0.4, y * u, 1.25 * u, alpha);
    }
  }

  tick(dtMs: number) {
    this.clock.tick(dtMs);
    this.camX += 4 * (dtMs / 16.7); // 原版 MenuXMovement(4f)/帧
    const W = this.canvas.width, H = this.canvas.height;
    menuTimeInfo.timeOfDay = this.clock.timeOfDay;
    menuTimeInfo.dayFactor = this.clock.dayFactor;

    this.sky.draw(this.ctx, this.clock, W, H, this.camX, dtMs);

    // 森林变体轮换 + 交叉淡化（bgAlpha 语义）
    this.variantT += dtMs;
    const cycle = VARIANT_HOLD_MS + VARIANT_FADE_MS;
    if (this.variantT >= cycle) {
      this.variantT -= cycle;
      this.variantIdx = (this.variantIdx + 1) % FOREST_VARIANTS.length;
    }
    const fade = Math.max(0, Math.min(1, (this.variantT - VARIANT_HOLD_MS) / VARIANT_FADE_MS));
    this.drawVariant(this.variantIdx, 1 - fade);
    if (fade > 0) this.drawVariant(this.variantIdx + 1, fade);

    // 夜间压暗（ColorOfSurfaceBackgrounds 随昼夜变暗；只压背景不压 DOM UI）
    const dark = (1 - this.clock.dayFactor) * 0.72;
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
