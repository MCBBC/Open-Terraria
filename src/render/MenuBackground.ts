// 主菜单背景（1456 UpdateMenu/DrawSurfaceBG 1:1 调度版 2026-08-23）。
// 原版标题屏 = 森林背景（DrawBG gameMenu 分支），调度本体在 Main.cs:19678
// UpdateMenu + :47582 DrawMenu：
//  · 时间（:19768-19804）：昼 time+=33.88235294117647/帧、夜 +=30.857142857142858
//    （60fps 定帧）→ 全昼夜 ≈44.1s 真实时间（昼 26.6s/夜 17.5s）。夜尽 time>32400
//    → time=0/dayTime=true/moonPhase++(wrap 8)/bloodMoon=false；昼尽 >54000 → 入夜。
//    初始 = 开局态 time 13500（8:15AM）/满月/moonType 0。
//  · 背景组重掷（:19724-19762）：夜 time≥16200 每夜一次 RandomizeBackgrounds；
//    昼 time≥27000 每日一次 moonType=Next(9)+重掷。173 守卫 ×2（treeBGSet1[0]==173
//    连重掷两次）。lockMenuBGChange：生成/读档世界期 true，menuMode==0 解锁。
//    ★1456 backgroundLayerTransitionSpeed(:2564) 全工程只写不读=死字段 → 切换瞬时。
//  · 森林样式池 RollRandomForestBGStyle（WorldGen.cs:7899）+ SetForestBGSet 全表
//    （:7605-7726，样式 1-13+31/51/71/72/73）。
//  · 层规格（gameMenu 分支，1080 backbuffer 基准，num4=2）：
//    远山0 y=100 scale2 par0.15（:59246-59257）；远山1 y=230 startX−500（:59316-59319）
//    树层0 y=320 scale2.5 par0.4（:60710-60733 逐贴图：91 par.27/sc1.2、173 par.25/
//    sc1.3、178 par.3/sc1.2、184 par.25、282 sc1.4）
//    树层1 y=400 startX−80 scale2.62 par0.43（:60846-60853；51/54 水平翻转 :60884）
//    树层2 y=480 startX−120 scale2.68 par0.49（:60907-60910；槽0=91 时 sc2.6/par.42）
//  · 逐槽位 Y 微调（:60826-60960）：槽0 50→−50/53→−100/91·173→+200/178→+75/
//    330·335→−150/343→−300；槽1 51→−50/54→−100/329·334→−150/342→−300；
//    槽2 52→−50/55→−100/92→+150/328·333→−150/341→−50
//  · 173 树动画 = Background 251-254 四帧（GetBackgroundCounter=GlobalTimeWrapped
//    Hourly×40，/10%4，:60817-60824）；341 = 2×2 帧图（GetBackgroundRect :60655，
//    counter/15%4，Frame 高 −4 收缩）。
//  · 层色 = ColorOfSurfaceBackgroundsModified = ColorOfTheSkies——菜单也跑
//    SetBackColor（:61409 isInGameMenuOrIsServer=gameMenu）→ 层乘天空色（非叠罩）。
//  · 星坠落：夜 rand(12)==0/帧 → 随机星 Fall（:19697-19703 LetStarsFallInMenu）。
//  · 日月抓取（alreadyGrabbingSunOrMoon :19766）只冻结时间推进——重掷/坠星照跑。
//  · MenuXMovement += 4/帧，wrap ±2^31（:47625-47631）。
import { loadBitmapOnly } from '../assets/SpriteAtlas';
import { SkyRenderer } from './SkyRenderer';
import { Clock } from '../world/World';
import {
  colorOfTheSkies, setFrameAurora, setFrameBiome, setFrameCloudDim,
  setFrameLightning, setFrameHorizon,
} from '../lighting/SkyColor';

/** SetForestBGSet 全表（WorldGen.cs:7605-7726）：mnt=treeMntBGSet、trees=treeBGSet */
interface ForestStyle { mnt: [number, number]; trees: [number, number, number] }
const FOREST_STYLES: Record<number, ForestStyle> = {
  1: { mnt: [7, 8], trees: [50, 51, 52] },
  2: { mnt: [7, 8], trees: [53, 54, 55] },
  3: { mnt: [7, 90], trees: [91, -1, 92] },
  31: { mnt: [7, 90], trees: [91, -1, 11] },
  4: { mnt: [93, 94], trees: [-1, -1, -1] },
  5: { mnt: [93, 94], trees: [-1, -1, 55] },
  51: { mnt: [93, 94], trees: [-1, -1, 11] },
  6: { mnt: [171, 172], trees: [173, -1, -1] },
  7: { mnt: [176, 177], trees: [178, -1, -1] },
  71: { mnt: [176, 177], trees: [178, -1, 11] },
  72: { mnt: [176, 177], trees: [178, -1, 52] },
  73: { mnt: [176, 177], trees: [178, -1, 55] },
  8: { mnt: [179, 180], trees: [184, -1, -1] },
  9: { mnt: [277, 278], trees: [279, -1, -1] },
  10: { mnt: [280, 281], trees: [282, -1, -1] },
  11: { mnt: [7, 331], trees: [330, 329, 328] },
  12: { mnt: [7, 336], trees: [335, 334, 333] },
  13: { mnt: [7, -1], trees: [343, 342, 341] },
};

/** Main.rand 菜单侧替身（UnifiedRandom Next 语义：Next(n) ∈ 0..n-1） */
function nextInt(n: number): number { return Math.floor(Math.random() * n); }

/** RollRandomForestBGStyle（WorldGen.cs:7899-7911）加权滚掷 */
function rollForestStyle(): number {
  let n = nextInt(14);
  if ((n === 1 || n === 2) && nextInt(2) === 0) n = nextInt(14);
  if (n === 0) n = nextInt(14);
  if (n === 3 && nextInt(3) === 0) n = 31;
  if (n === 5 && nextInt(2) === 0) n = 51;
  if (n === 7 && nextInt(4) === 0) n = 71 + nextInt(3);
  return n;
}

/** 腐化背景样式表（WorldGen.setBG case 1 :7201-7240；RandomizeBackgrounds_
 *  Corruption :7979 = Next(6)，5→51/52）——夜晚菜单槽（bgStyle=1）的绘制集 */
const CORRUPT_STYLES: Record<number, [number, number, number]> = {
  0: [12, 13, 14], 1: [56, 57, 58], 2: [211, 212, 213], 3: [225, 226, 227],
  4: [240, 241, 242], 51: [324, 323, 322], 52: [324, 226, 322],
};

/** 供 TitleMenu 读取的菜单时间状态（LogoA/LogoB 昼夜交叉淡化用） */
export const menuTimeInfo = { timeOfDay: 13500 / 54000 * 0.625 + 0.1875, dayFactor: 1 };

/** 1080 backbuffer 基准 → 当前画布（原版菜单 Y/尺度常量所在空间） */
const REF_H = 1080;
const FRAME_MS = 1000 / 60;          // 原版定帧步长（速度常量按帧计）
const MENU_X_WRAP = 2147483647;      // :47626 screenPosition.X wrap 边界

export class MenuBackground {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sky = new SkyRenderer();
  /** 仅供 setClockT/sky.draw 的 Clock 形参载体——时间由 tick 按原版公式直写 */
  private clock = new Clock(24 * 60 * 1000);

  // ---- 原版菜单调度状态（Main.UpdateMenu）----
  private vTime = 13500;              // Main.time（昼 0..54000 / 夜 0..32400）
  private dayTime = true;
  private moonPhase = 0;
  private moonType = 0;               // Main.moonType（:19759 每日 27000 后 Next(9) 重掷）
  private dayCount = 1;
  private menuBGChangedDay = false;   // :1930/:1932
  private menuBGChangedNight = false;
  private lockBG = false;             // lockMenuBGChange（生成/读档期）
  private grabbing = false;           // alreadyGrabbingSunOrMoon（只冻时间 :19766）
  private grabUntil = 0;
  private starAcc = 0;                // 定帧累积器（坠星 1/12 每帧）
  /** 当前森林样式（WorldGen.treeBG1 菜单侧；初始 = 开局默认样式 1） */
  private style = 1;
  /** WorldGen.corruptBG（夜晚菜单槽 bgStyle=1 = Corruption！DrawBG :63450——
   *  UpdateMenu 的 setBG(1,style) 保它过午夜重掷 = 夜槽可见性铁证） */
  private corruptStyle = 0;
  /** bgAlphaFrontLayer 菜单双槽 [Forest1, Corruption]——昼/夜翻转 0.02/帧
   *  交叉淡化（backgroundLayerTransitionSpeed=0.02 gameMenu :63448 +
   *  UpdateBGVisibility_FrontLayer :63534-63551）。★原版菜单零硬切：重掷保
   *  留可见槽（昼保 treeBG1/夜保 corruptBG），切换全走淡化 */
  private alphaF = [1, 0];

  private camX = 0;
  private imgs = new Map<number, ImageBitmap | HTMLImageElement>();
  /** 层 tint 烘焙缓冲（tex → 画布+上次 tint；tint 变化 >1/255 才重烘） */
  private tintBufs = new Map<number, { cv: HTMLCanvasElement; tr: number; tg: number; tb: number }>();

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;z-index:0;';
    parent.insertBefore(this.canvas, parent.firstChild);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    // 菜单帧态清零（UpdateMenu :19693-19696 lightning=0/Graveyard=0 语义）——
    // 退盘回菜单时 Renderer 的帧状态残留会渗进 colorOfTheSkies
    setFrameBiome(null);
    setFrameAurora(null);
    setFrameCloudDim(1);
    setFrameLightning(0);
    setFrameHorizon(null);
    this.sky.moonType = 0;
  }

  private resize = () => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  private img(n: number): ImageBitmap | HTMLImageElement | null {
    if (n < 0) return null;
    if (this.imgs.has(n)) return this.imgs.get(n) ?? null;
    loadBitmapOnly(`vanilla/Background_${n}.png`, () => this.imgs.has(n), (x) => this.imgs.set(n, x));
    return null;
  }

  /** 标题屏日月拖拽写时间（GOING_OLDSCHOOL B2，TitleMenu 反算 t01 抛出）。
   *  反解回 vanilla time/dayTime 供调度链继续；拖拽期时间冻结 = 本方法每次调用
   *  刷 grabUntil 300ms 尾窗（tick 里 grabbing=now<grabUntil ≈ 原版
   *  alreadyGrabbingSunOrMoon 按住态 :19766——松手后 300ms 内恢复推进，无感） */
  setClockT(time01: number): void {
    const t = ((time01 % 1) + 1) % 1;
    this.clock.timeOfDay = t;
    if (t > Clock.DAWN && t < Clock.DUSK) {
      this.dayTime = true;
      this.vTime = (t - Clock.DAWN) / 0.625 * 54000;
    } else {
      this.dayTime = false;
      this.vTime = ((((t - Clock.DUSK) % 1) + 1) % 1) / 0.375 * 32400;
    }
    this.grabUntil = performance.now() + 300;
  }

  /** 日月拖拽垂直跟手（Main.cs:62430/:62440 sunModY/moonModY）——透传 SkyRenderer */
  setCelestialModY(dayTime: boolean, modY: number): void {
    this.sky.setCelestialModY(dayTime, modY);
  }

  /** lockMenuBGChange（世界生成/读档期置 true，回标题解锁——mainFlow 接线点） */
  setBGLock(on: boolean): void { this.lockBG = on; }

  /** RandomizeBackgrounds 的菜单侧（UpdateMenu :19741-19750：重掷 + 173 守卫 ×2）。
   *  ★可见槽保留由调用方负责（:19744-19748 setBG(1,style) 夜保腐化 /
   *  :19756-19761 setBG(0,treeBG) 昼保森林）——原版菜单零硬切的关键 */
  private randomizeMenuBG(): void {
    this.style = rollForestStyle();
    if (this.style === 6) this.style = rollForestStyle();      // treeBGSet1[0]==173
    if (this.style === 6) this.style = rollForestStyle();
    const n = nextInt(6);                                       // RandomizeBackgrounds_Corruption
    this.corruptStyle = n === 5 ? (nextInt(2) === 0 ? 51 : 52) : n;
  }

  /** vanilla time/dayTime → Clock.timeOfDay（昼 4:30AM=0.1875 起 0.625 跨度） */
  private syncClock(): void {
    this.clock.timeOfDay = this.dayTime
      ? Clock.DAWN + (this.vTime / 54000) * 0.625
      : (Clock.DUSK + (this.vTime / 32400) * 0.375) % 1;
    this.clock.moonPhase = this.moonPhase;
    this.clock.dayCount = this.dayCount;
  }

  tick(dtMs: number) {
    const frames = Math.min(8, dtMs / FRAME_MS);   // 后台标签回来防大步进雪崩
    // 星坠落（:19697-19703）：夜 rand(12)==0/帧 → 随机星 Fall（抓取中照跑）
    if (!this.dayTime) {
      this.starAcc += frames;
      while (this.starAcc >= 1) {
        this.starAcc -= 1;
        if (nextInt(12) === 0) this.sky.starFallAt(Math.random() * 1000, 1000);
      }
    }
    // 背景组重掷调度（:19724-19762，抓取中照跑）。★可见槽保留（原版菜单零硬切）：
    //  夜重掷保 corruptBG（setBG(1,style) :19744-19748——夜槽=腐化正显示）、
    //  昼重掷保 treeBG1（setBG(0,treeBG) :19756-19761——昼槽=森林正显示）
    if (!this.lockBG) {
      if (this.dayTime) {
        this.menuBGChangedDay = false;
      } else if (!this.menuBGChangedDay && this.vTime >= 16200) {
        this.menuBGChangedDay = true;
        const keepCorrupt = this.corruptStyle;
        this.randomizeMenuBG();
        this.corruptStyle = keepCorrupt;
      }
      if (!this.dayTime) {
        this.menuBGChangedNight = false;
      } else if (!this.menuBGChangedNight && this.vTime >= 27000) {
        this.menuBGChangedNight = true;
        this.moonType = nextInt(9);                    // :19759 moonType=Next(9)
        this.sky.moonType = this.moonType;
        const keepForest = this.style;
        this.randomizeMenuBG();
        this.style = keepForest;
      }
    }
    // 昼夜 bgStyle 翻转（:63450 夜=1 Corruption/昼=0 Forest1）+ 双槽 0.02/帧
    // 交叉淡化（gameMenu transitionSpeed :63448 + FrontLayer 坡道 :63534-63551）
    const targetSlot = this.dayTime ? 0 : 1;
    for (let s = 0; s < 2; s++) {
      const tv = s === targetSlot ? 1 : 0;
      const d = tv - this.alphaF[s];
      this.alphaF[s] += Math.sign(d) * Math.min(0.02 * frames, Math.abs(d));
    }
    // 时间推进（:19768-19804；alreadyGrabbingSunOrMoon → 冻结 :19766）
    this.grabbing = performance.now() < this.grabUntil;
    if (!this.grabbing) {
      if (this.dayTime) this.vTime += 33.88235294117647 * frames;
      else this.vTime += 30.857142857142858 * frames;
      if (!this.dayTime && this.vTime > 32400) {
        this.vTime = 0;
        this.dayTime = true;
        this.moonPhase = (this.moonPhase + 1) % 8;     // :19793-19799
        this.dayCount++;
      } else if (this.dayTime && this.vTime > 54000) {
        this.vTime = 0;
        this.dayTime = false;
      }
    }
    this.syncClock();
    menuTimeInfo.timeOfDay = this.clock.timeOfDay;
    menuTimeInfo.dayFactor = this.clock.dayFactor;
    // MenuXMovement（:47625-47631：+4/帧，wrap ±2^31）
    this.camX = (this.camX + 4 * frames) % MENU_X_WRAP;

    const W = this.canvas.width, H = this.canvas.height;
    // 相机 Y = surface·16 − 屏高（DrawMenu :47620）——云 num3 视差/atmo 归位
    this.sky.draw(this.ctx, this.clock, W, H, this.camX, dtMs,
      this.sky.vanillaMenuCamY(H));
    this.drawForest();
  }

  /** 层 tint = ColorOfTheSkies（:61409 菜单也跑 SetBackColor → :56194）。
   *  近白免烘（正昼）；量化 1/255 变化才重烘（tint 缓动不抖帧） */
  private layerTint(): [number, number, number] | null {
    const c = colorOfTheSkies(this.clock.timeOfDay, this.dayCount, false, false, this.moonPhase);
    if (c[0] >= 254.5 && c[1] >= 254.5 && c[2] >= 254.5) return null;
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  }

  /** tint 烘焙（multiply + destination-in 保 α；CanvasBgBlit.drawTiledTinted 同技法） */
  private tinted(n: number, im: HTMLImageElement | ImageBitmap,
    t: [number, number, number] | null): HTMLImageElement | ImageBitmap | HTMLCanvasElement {
    if (!t) return im;
    let e = this.tintBufs.get(n);
    if (!e || e.cv.width !== im.width || e.cv.height !== im.height) {
      const cv = document.createElement('canvas');
      cv.width = im.width; cv.height = im.height;
      e = { cv, tr: -1, tg: -1, tb: -1 };
      this.tintBufs.set(n, e);
    }
    if (Math.abs(e.tr - t[0]) > 0.004 || Math.abs(e.tg - t[1]) > 0.004 || Math.abs(e.tb - t[2]) > 0.004) {
      const g = e.cv.getContext('2d')!;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, e.cv.width, e.cv.height);
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${Math.round(t[0] * 255)},${Math.round(t[1] * 255)},${Math.round(t[2] * 255)})`;
      g.fillRect(0, 0, e.cv.width, e.cv.height);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-over';
      e.tr = t[0]; e.tg = t[1]; e.tb = t[2];
    }
    return e.cv;
  }

  /** 单层横滚平铺（原版 bgStartX = −IEEERemainder(screenX·par, w) − w/2 + dx） */
  private drawLayer(im: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
    par: number, y: number, scale: number, dx: number, alpha = 1,
    src?: [number, number, number, number], flip = false): void {
    const w = (src ? src[2] : im.width) * scale;
    const h = (src ? src[3] : im.height) * scale;
    if (w <= 0 || h <= 0 || alpha <= 0.01) return;
    const startX = -(((this.camX * par) % w) + w) % w - w / 2 + dx;
    const loops = Math.ceil(this.canvas.width / w) + 2;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 接缝修复：取整 + 每张 +1px 重叠（浮点平铺亚像素缝，背景层无感知）
    const yR = Math.round(y);
    for (let i = 0; i < loops; i++) {
      const x = Math.round(startX + i * w);
      if (flip) {
        ctx.save();
        ctx.translate(x + w, yR);
        ctx.scale(-1, 1);
        if (src) ctx.drawImage(im, src[0], src[1], src[2], src[3], 0, 0, w, h);
        else ctx.drawImage(im, 0, 0, w, h);
        ctx.restore();
      } else if (src) {
        ctx.drawImage(im, src[0], src[1], src[2], src[3], x, yR, w, h);
      } else {
        ctx.drawImage(im, x, yR, Math.ceil(w) + 1, h);
      }
    }
    ctx.restore();
  }

  /** GetBackgroundCounter（:60700-60706 gameMenu 分支 = GlobalTimeWrappedHourly×40） */
  private bgCounter(): number {
    return (performance.now() / 1000 % 3600) * 40;
  }

  /** 地表背景全栈：远山（跨槽共用，bgAlphaFarBackLayer 驱动）+ 双槽树层按
   *  bgAlphaFrontLayer 交叉淡化（昼 Forest1 / 夜 Corruption） */
  private drawForest(): void {
    const st = FOREST_STYLES[this.style] ?? FOREST_STYLES[1];
    const k = this.canvas.height / REF_H;
    const tint = this.layerTint();
    // 远山两带（Step1 :59246-59257 y=100 / Step2 :59316-59319 y=230 startX−500；
    // scale=1×num4=2、par 0.15 共用）
    const m0 = this.img(st.mnt[0]);
    if (m0) this.drawLayer(this.tinted(st.mnt[0], m0, tint), 0.15, 100 * k, 2 * k, 0);
    const m1 = this.img(st.mnt[1]);
    if (m1) this.drawLayer(this.tinted(st.mnt[1], m1, tint), 0.15, 230 * k, 2 * k, -500 * k);
    // 槽 Forest1（bgStyle 0）：树三层（_Forest gameMenu：y=320/400/480）
    if (this.alphaF[0] > 0.01) {
      const a = this.alphaF[0];
      this.drawTreeSlot(0, st.trees[0], 320 * k, 1.25 * 2 * k, 0.4, 0, a, tint, k);
      this.drawTreeSlot(1, st.trees[1], 400 * k, 1.31 * 2 * k, 0.43, -80 * k, a, tint, k);
      this.drawTreeSlot(2, st.trees[2], 480 * k, 1.34 * 2 * k, 0.49, -120 * k, a, tint, k);
    }
    // 槽 Corruption（bgStyle 1 = 夜菜单）：DrawSurfaceBG_Corrupt gameMenu 分支
    if (this.alphaF[1] > 0.01) this.drawCorruptTrees(this.alphaF[1], tint, k);
  }

  /** 腐化三层（DrawSurfaceBG_Corrupt gameMenu：y=320/400/480、scale 2.5/2.62/2.68、
   *  L1 恒水平翻转 :60750；56 套三层全 −100 :60722-60724/:60766/:60800——L1/L2
   *  也查 indexes[0]==56） */
  private drawCorruptTrees(a: number, tint: [number, number, number] | null, k: number): void {
    const set = CORRUPT_STYLES[this.corruptStyle] ?? CORRUPT_STYLES[0];
    const y56 = set[0] === 56 ? -100 * k : 0;
    const l0 = this.img(set[0]);
    if (l0) this.drawLayer(this.tinted(set[0], l0, tint), 0.4, 320 * k + y56, 1.25 * 2 * k, 0, a);
    const l1 = this.img(set[1]);
    if (l1) this.drawLayer(this.tinted(set[1], l1, tint), 0.43, 400 * k + y56, 1.31 * 2 * k, -80 * k, a, undefined, true);
    const l2 = this.img(set[2]);
    if (l2) this.drawLayer(this.tinted(set[2], l2, tint), 0.49, 480 * k + y56, 1.34 * 2 * k, -120 * k, a);
  }

  /** 单树层（:60708-60960 逐槽位规格/偏移/特例 1:1） */
  private drawTreeSlot(slot: 0 | 1 | 2, tex: number, y: number, scale: number,
    par: number, dx: number, alpha: number,
    tint: [number, number, number] | null, k: number): void {
    if (tex < 0) return;
    let sc = scale, pr = par;
    let src: [number, number, number, number] | undefined;
    let flip = false;
    let n = tex;
    if (slot === 0) {
      // :60712-60733 逐贴图 scale/par 覆写
      if (tex === 91) { pr = 0.27; sc = 1.2 * 2 * k; }
      else if (tex === 173) { pr = 0.25; sc = 1.3 * 2 * k; }
      else if (tex === 178) { pr = 0.3; sc = 1.2 * 2 * k; }
      else if (tex === 184) { pr = 0.25; }
      else if (tex === 282) { sc = 1.4 * 2 * k; }
      if (tex === 173) {
        // :60817-60824 动画四帧 251-254（counter/10%4）
        n = 251 + (Math.floor(this.bgCounter() / 10) % 4);
      }
      // :60826-60842 Y 微调
      if (tex === 50) y -= 50 * k;
      else if (tex === 53) y -= 100 * k;
      else if (tex === 91 || tex === 173) y += 200 * k;
      else if (tex === 178) y += 75 * k;
      else if (tex === 330 || tex === 335) y -= 150 * k;
      else if (tex === 343) y -= 300 * k;
    } else if (slot === 1) {
      if (tex === 51 || tex === 54) flip = true;      // :60884 FlipHorizontally
      if (tex === 51) y -= 50 * k;
      else if (tex === 54) y -= 100 * k;
      else if (tex === 329 || tex === 334) y -= 150 * k;
      else if (tex === 342) y -= 300 * k;
    } else {
      // :60901-60904 槽0=91 → 本层 sc1.3×2/par0.42
      if (FOREST_STYLES[this.style]?.trees[0] === 91) { sc = 1.3 * 2 * k; pr = 0.42; }
      if (tex === 52) y -= 50 * k;
      else if (tex === 55) y -= 100 * k;
      else if (tex === 92) y += 150 * k;
      else if (tex === 328 || tex === 333) y -= 150 * k;
      else if (tex === 341) y -= 50 * k;
      if (tex === 341) {
        // GetBackgroundRect :60674-60680：2×2 帧（counter/15%4）+ Inflate(0,-2)
        const im = this.img(341);
        if (!im) return;
        const idx = Math.floor(this.bgCounter() / 15) % 4;
        const fw = im.width / 2, fh = im.height / 2;
        src = [(idx % 2) * fw, Math.floor(idx / 2) * fh + 2, fw, fh - 4];
        const tim = this.tinted(341, im, tint);
        this.drawLayer(tim, pr, y, sc, dx, alpha, src, flip);
        return;
      }
    }
    const im = this.img(n);
    if (!im) return;
    this.drawLayer(this.tinted(n, im, tint), pr, y, sc, dx, alpha, undefined, flip);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.canvas.width = 0; this.canvas.height = 0;   // 立刻还回后备(不等 GC;双开预算紧)
    for (const e of this.tintBufs.values()) { e.cv.width = 0; e.cv.height = 0; }
    this.tintBufs.clear();
  }

  /** 调试探针 */
  lastDt = 0;
  clockTime(): number { return this.clock.timeOfDay; }
}
