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
import { UIGenProgressBar } from '../elements/UIGenProgressBar';
import type { World } from '../../world/World';

/** 每帧重绘的列数（列扫描 fallback；8400 列大世界约 2 秒扫完一轮） */
const COLUMNS_PER_FRAME = 64;
/** 位图帧擦除耗时（ms）：整帧瞬切观感是"跳变"，改为从左到右刷过揭示 */
const BITMAP_WIPE_MS = 1200;

// ---- ★IIIII243 生成屏预览面板净带布局（叠压修复） ----
// 用户实报（1080p 天顶生成中截图）：旧布局 vAlign=1/marginBottom=56 把面板底沿钉在
// H-56，与提示条（锚 H-150、字形上下居中 ±17.6..55）整段叠压。面板是本仓自研叠加物
// （vanilla 无此子元素），由它让位——放进「进度条绘制下沿 ↔ 提示条字形上沿」净带。
// 净带几何三锚（全部 vanilla 对齐位，只读不修）：
//   · 进度条下沿 = topForScreenH(H)+106（UIGenProgressBar.SPRITE——Outer_Lower 532×46
//     画在 y+60，短条框垂尾伸到 +106；用元素高 70 会与垂尾叠 36px）；
//   · 提示条上沿 = H-150（GameTipsDisplay TipOffsetY）− 字形半高（上下居中锚定，
//     worst-case 两行 vecH=35.2 → 半高 17.6；超两行走 110 收缩域，现实提示池不达）；
//   · 标题（UIHeader）在 barTop-70，全部 H≥600 档与净带零接触（单测断言守）。

/** 净带布局常量（逻辑像素；previewBandLayout 消费，tests/iiiii243-genpreview-layout 钉值） */
export const PREVIEW_BAND = {
  /** 净带与相邻 vanilla 元素的上下间隙 */
  GAP: 8,
  /** 提示条锚线距屏底（GameTipsDisplay TipOffsetY=-150；UIWorldLoadState.TIP_OFFSET_Y 同值） */
  TIP_ANCHOR_FROM_BOTTOM: 150,
  /** 提示条字形半高 worst-case（两行：2×16×1.1/2——折行域见 GameTipsDisplay.CreateWrappedText） */
  TIP_HALF_H: 17.6,
  /** 极矮屏兜底阈值：净带高低于此 → 贴净带下沿放最小预览条（floor 模式） */
  MIN_BAND_H: 28,
  /** 面板自然宽策略（旧 55%/上限 520 保留为带内上限——只有带高放得下时才给满） */
  WIDTH_FRAC: 0.55,
  MAX_W: 520,
  /** 两侧最小余量（水平居中前提下的带宽钳制） */
  EDGE_MARGIN: 8,
} as const;

/** 布局结果（逻辑像素；mode='band'=正常带内放行，'floor'=极矮屏贴底最小条） */
export interface PreviewBandRect {
  x: number; y: number; width: number; height: number;
  mode: 'band' | 'floor';
}

/** ★IIIII243 预览面板净带布局（纯函数，单测钉值）。
 *  净带 = [进度条绘制下沿+8, 提示条字形上沿-8]；面板等比缩放（aspect=h/w）到带高内、
 *  水平居中、带内垂直居中；自然宽（min(logicalW×0.55, 520)）只作上限——超宽矮条
 *  （aspect<带高/naturalW）保自然宽，带宽不足（极窄屏）按宽钳。带高不足 MIN_BAND_H
 *  （logicalH<600 档净带塌缩,如 800×500 窗）→ floor：贴净带下沿放 MIN_BAND_H 高的
 *  最小条（"贴底"，y≥0 钳）。 */
export function previewBandLayout(input: {
  logicalW: number;
  logicalH: number;
  /** 预览位图纵横比 h/w（等比缩放基准；≤0 视为未知 → floor 最小条兜底） */
  aspect: number;
  /** 自然宽上限（缺省 min(logicalW×0.55, 520)） */
  naturalW?: number;
}): PreviewBandRect {
  const { logicalW, logicalH, aspect } = input;
  const barTop = UIGenProgressBar.topForScreenH(logicalH);
  const bandTop = barTop + UIGenProgressBar.SPRITE.y + UIGenProgressBar.SPRITE.h + PREVIEW_BAND.GAP;
  const bandBottom = logicalH - PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM - PREVIEW_BAND.TIP_HALF_H - PREVIEW_BAND.GAP;
  const bandH = bandBottom - bandTop;
  const maxW = Math.max(0, logicalW - PREVIEW_BAND.EDGE_MARGIN * 2);
  const natural = input.naturalW ?? Math.min(logicalW * PREVIEW_BAND.WIDTH_FRAC, PREVIEW_BAND.MAX_W);
  const k = aspect > 0 ? aspect : 0;
  // floor 兜底（极矮屏/未知 aspect）：净带塌缩 → 贴净带下沿的最小条，宽按 maxW 收
  if (!(bandH >= PREVIEW_BAND.MIN_BAND_H) || k === 0) {
    const width = Math.min(maxW, k > 0 ? PREVIEW_BAND.MIN_BAND_H / k : maxW);
    const h = width * k;
    return { x: (logicalW - width) / 2, y: Math.max(0, bandBottom - h), width, height: h, mode: 'floor' };
  }
  // 正常态：等比缩放进带（高不足缩高、宽不足缩宽），水平居中 + 带内垂直居中
  const width = Math.max(0, Math.min(natural, maxW, bandH / k));
  const height = width * k;
  return {
    x: (logicalW - width) / 2,
    y: bandTop + (bandH - height) / 2,
    width, height,
    mode: 'band',
  };
}

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

  /** 布局（★IIIII243 重排）：放进「进度条绘制下沿 ↔ 提示条字形上沿」净带——旧版
   *  vAlign=1/marginBottom=56 把面板底沿钉在 H-56，与提示条（锚 H-150 字形居中）
   *  整段叠压（用户实报截图）；预览是本仓自研叠加物，由它让位（vanilla 对齐位
   *  标题/进度条/提示条零触碰）。几何全在 previewBandLayout 纯函数（单测钉值）：
   *  等比缩放进带、水平居中、带内垂直居中，极矮屏贴带下沿。 */
  private applyLayout() {
    const g = previewBandLayout({
      logicalW: UIScale.logicalW,
      logicalH: UIScale.logicalH,
      aspect: this.previewAspect,
    });
    this.lastLayW = UIScale.logicalW;
    this.lastLayH = UIScale.logicalH;
    this.width = StyleDimension.fromPixels(g.width);
    this.height = StyleDimension.fromPixels(g.height);
    this.left = StyleDimension.fromPixels(g.x);
    this.top = StyleDimension.fromPixels(g.y);
    this.hAlign = 0;
    this.vAlign = 0;
    this.marginTop = 0;
    this.marginBottom = 0;
  }

  /** 上次布局时的逻辑屏面（窗口/用户缩放变化 → 净带重算；update 每帧两数比对） */
  private lastLayW = 0;
  private lastLayH = 0;

  /** worker 路径首帧预览：在未知世界尺寸时先建预览容器 */
  static fromFirstFrame(rgba: Uint8ClampedArray, width: number, height: number): GenWorldPreview {
    const p = new GenWorldPreview();
    p.setPreviewFrame(rgba, width, height);
    return p;
  }

  update(): void {
    // ★IIIII243：生成中拖窗口/设置改 UI 缩放 → 逻辑屏面变，净带重排（旧布局钉死
    // 首帧尺寸同款盲区；两数比对零开销）
    if (this.lastLayW !== UIScale.logicalW || this.lastLayH !== UIScale.logicalH) this.applyLayout();
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
        ? { groundLevel: world.groundLevel, rockLevel: world.rockLevel,
            underworld: world.lavaLine > 0 ? world.lavaLine : undefined,
            remix: !!world.seedFlags?.remix }   // ★IIIII218：地狱底/remix 上表与游戏内同构
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
