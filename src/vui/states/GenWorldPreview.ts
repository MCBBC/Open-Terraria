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

// ---- ★IIIII258 生成屏预览面板布局（可读优先；IIIII243 净带策略反转） ----
// 用户实报（sandboxworld.online ≈2000×1184 视口截图）：IIIII243 的「等比缩放进净带」
// 把面板缩到 141×40 逻辑（scale~1.97 → 279×80 CSS），不可读——净带（进度条绘制下沿
// ↔ 提示条字形上沿）在桌面 UIScale 公式下恒 40.4 逻辑 px 高（aspect≥4/3 的窗口
// logicalH≡600），且与 CSS 分辨率无关：分辨率越高 scale 越大，面板视觉尺寸占比反而
// 越小。本批原则反转：**最小可读尺寸优先，缩放是最后手段**——面板按自然尺寸
// （min(55%W, 520)）放进全屏最大的净空带，放不下才等比缩，再不行才 floor。
// 净空带几何锚（全部 vanilla 对齐位，只读不修）：
//   · 标题（UIHeader）顶 = topForScreenH(H)-70（UIWorldLoadState 构造位）→ 标题上方
//     [0, barTop-78] 是全宽净空（桌面档恒 184 逻辑 px 高）——top 候选带；
//   · 提示条字形域 = H-150±17.6（GameTipsDisplay TipOffsetY，worst-case 两行）→
//     字形下沿以下是全宽净空——bottom 候选带（须同时让开进度条绘制外沿 barTop+106）；
//   · 进度条绘制外沿 = topForScreenH(H)+106（UIGenProgressBar.SPRITE，Outer_Lower
//     垂尾伸到 +106）；左右侧区受进度条半宽 314 钳（桌面仅 ~211 逻辑 px 宽），
//     放不下自然宽，不设候选。
// 两候选带按「可容纳面板面积」择优（同积取 top=桌面语义）；都放不下 MIN_BAND_H
// 才 floor 贴屏底最小条。探测提示：擦除揭示（BITMAP_WIPE_MS）期间面板左新右旧
// 常驻分界——小尺寸下被读成"两个并排小矩形"（IIIII258 复现探针实锤 55/58 样本
// 揭示中途），面板放大后该分界恢复为正常的"从左到右揭示"观感。

/** 布局常量（逻辑像素；previewBandLayout 消费，tests/iiiii243-genpreview-layout 钉值） */
export const PREVIEW_BAND = {
  /** 净带与相邻 vanilla 元素/屏边的间隙 */
  GAP: 8,
  /** 提示条锚线距屏底（GameTipsDisplay TipOffsetY=-150；UIWorldLoadState.TIP_OFFSET_Y 同值） */
  TIP_ANCHOR_FROM_BOTTOM: 150,
  /** 提示条字形半高 worst-case（两行：2×16×1.1/2——折行域见 GameTipsDisplay.CreateWrappedText） */
  TIP_HALF_H: 17.6,
  /** 标题顶 = barTop-70（UIWorldLoadState 构造位；UIWorldLoad.cs 布局对齐） */
  HEADER_ABOVE_BAR: 70,
  /** 候选带兜底阈值：带高低于此不放（→ floor 贴屏底最小条） */
  MIN_BAND_H: 28,
  /** 面板自然宽策略（55%W / 上限 520——自然尺寸优先的"尺寸基准"） */
  WIDTH_FRAC: 0.55,
  MAX_W: 520,
  /** 四边最小余量（水平居中前提下的带宽钳制 + 带上下沿离屏边间隙） */
  EDGE_MARGIN: 8,
} as const;

/** 布局结果（逻辑像素；mode='top'=标题上方带（桌面常态），'bottom'=提示条下方带，
 *  'floor'=极矮屏贴屏底最小条） */
export interface PreviewBandRect {
  x: number; y: number; width: number; height: number;
  mode: 'top' | 'bottom' | 'floor';
}

/** ★IIIII258 预览面板布局（纯函数，单测钉值；IIIII243 净带策略反转）。
 *  原则：自然尺寸优先（min(logicalW×0.55, 520)），等比缩放（aspect=h/w）只是带高
 *  不足时的收敛手段，floor 是最后兜底。两个全宽候选带：
 *    top    = [max(边距, 提示条字形下沿+GAP), min(标题顶-GAP, H-边距)]
 *             （提示条字形域只在极矮屏上探进该带，届时带顶抬到其下沿之下）；
 *    bottom = [max(提示条字形下沿+GAP, 进度条绘制外沿+GAP), H-边距]。
 *  各带内：宽 = min(自然宽, maxW, 带高/aspect)（等比），水平居中 + 带内垂直居中；
 *  两带都可放取可容纳面积大者（同积取 top——桌面恒 top），单带可放取该带；
 *  两带都 < MIN_BAND_H（或 aspect 未知）→ floor：贴屏底 MIN_BAND_H 高的最小条
 *  （y≥0 钳；aspect 未知时高 0=不可见，drawSelf 早退）。 */
export function previewBandLayout(input: {
  logicalW: number;
  logicalH: number;
  /** 预览位图纵横比 h/w（等比缩放基准；≤0 视为未知 → floor 兜底） */
  aspect: number;
  /** 自然宽上限（缺省 min(logicalW×0.55, 520)） */
  naturalW?: number;
}): PreviewBandRect {
  const { logicalW, logicalH, aspect } = input;
  const edge = PREVIEW_BAND.EDGE_MARGIN;
  const gap = PREVIEW_BAND.GAP;
  const barTop = UIGenProgressBar.topForScreenH(logicalH);
  const barBottom = barTop + UIGenProgressBar.SPRITE.y + UIGenProgressBar.SPRITE.h;   // 绘制外沿（垂尾 +106）
  const headerTop = barTop - PREVIEW_BAND.HEADER_ABOVE_BAR;
  const tipsTop = logicalH - PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM - PREVIEW_BAND.TIP_HALF_H;      // 两行 worst-case 字形上沿
  const tipsBottom = logicalH - PREVIEW_BAND.TIP_ANCHOR_FROM_BOTTOM + PREVIEW_BAND.TIP_HALF_H;   // 两行 worst-case 字形下沿
  const maxW = Math.max(0, logicalW - edge * 2);
  const natural = input.naturalW ?? Math.min(logicalW * PREVIEW_BAND.WIDTH_FRAC, PREVIEW_BAND.MAX_W);
  const k = aspect > 0 ? aspect : 0;

  const fit = (top: number, bottom: number): { x: number; y: number; width: number; height: number } | null => {
    const bh = bottom - top;
    if (!(bh >= PREVIEW_BAND.MIN_BAND_H) || k === 0) return null;   // NaN/负/塌缩同败
    const width = Math.min(natural, maxW, bh / k);
    const height = width * k;
    return { x: (logicalW - width) / 2, y: top + (bh - height) / 2, width, height };
  };
  // top 候选带：标题上方全宽净空；仅当提示条字形域实际探进带跨（极矮屏）才把带顶
  // 抬到其下沿之下（桌面档 tipsTop ≫ 带底,不回避——带高吃满 0..headerTop-GAP）
  const aBottom = Math.min(headerTop - gap, logicalH - edge);
  const a = fit(tipsTop < aBottom ? Math.max(edge, tipsBottom + gap) : edge, aBottom);
  // bottom 候选带：提示条字形下沿以下全宽净空（同时让开进度条绘制外沿——矮屏 bar 尾可探到带内）
  const b = fit(Math.max(tipsBottom + gap, barBottom + gap), logicalH - edge);
  if (a || b) {
    // 择带：可容纳面积大者（>= 使同积取 top=桌面语义；两带几何对 aspect 单调同向,
    // top 带在全部现实档 ≥ bottom 带,此分支实为防御性对称）
    const pickTop = a && (!b || a.width * a.height >= b.width * b.height);
    const g = pickTop ? a! : b!;
    return { ...g, mode: pickTop ? 'top' : 'bottom' };
  }
  // floor 兜底（极矮窗/未知 aspect）：贴屏底最小条，宽按 maxW 收，y≥0 钳
  const width = Math.min(maxW, k > 0 ? PREVIEW_BAND.MIN_BAND_H / k : maxW);
  const height = width * k;
  return { x: (logicalW - width) / 2, y: Math.max(0, logicalH - edge - height), width, height, mode: 'floor' };
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

  /** 布局（★IIIII258 可读优先反转；IIIII243 净带策略的回归修复）：IIIII243 把面板
   *  等比缩放进「进度条绘制下沿 ↔ 提示条字形上沿」40.4 逻辑 px 净带（桌面档恒值,
   *  与 CSS 分辨率无关）——用户实报 ≈2000×1184 视口面板仅 279×80 CSS 不可读。
   *  现按自然尺寸优先放进全屏最大净空带（标题上方 top / 提示条下方 bottom 择优),
   *  几何全在 previewBandLayout 纯函数（单测钉值）；vanilla 对齐位（标题/进度条/
   *  提示条）零触碰，极矮屏 floor 贴屏底。 */
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
