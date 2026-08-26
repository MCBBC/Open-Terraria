// Stardew Valley 彩蛋编排器（批III尾窗件3）——Terraria.GameContent.Animations.
// StardewValleyAnimation.cs 全时间轴 1:1 + Segments.MaskedFadeEffect（:305-364）
// 的 MaskedFade pass（PixelShader.cso :2790-2805）Canvas 逐像素复刻。
//
// 触发链（Main.cs）：树妖对话时手持 Joja 可乐 5275（CanDryadPlayStardewAnimation
// :41158：heldItem==5275 && npc.type==20 && ai[0]!=24）→ DryadText_Do_StardewValleyBit
// :40980（消耗可乐+npcChat=StardewTalk.PlayerGivesCola+NotifyProgressionEvent(46)）
// → NPC.HaveDryadDoStardewAnimation 出弹体 995（ai[0]=动画计时 tick）→
// Main.cs:28604 _stardewAnimation.Draw(spriteBatch, (int)proj.ai[0], Center−screenPos)。
//
// 时间轴（ComposeAnimation :13-56，tick=1/60s）：
//   128t 起；OutCircleScale 0→1（60t）；Wait 360t；OutCircleScale 1→0（60t）＝548t 结束。
//   MaskedFadeEffect(mask sheet Extra_216 8 帧纵向, 每 4t 换帧（verticalFrameWait=4）)
//   + PanX（Delay 128 / Duration 240 / AmountOverTime 0.55 / StartAmount −0.4）+ PanY(0)。
//   MaskedFade pass：out = mask(Extra_216, v=t0.y×(1/8)+帧idx/8).a × sprite(uv+pan)（LinearClamp）。

const TICK_MS = 1000 / 60;
const START_T = 128;
const REVEAL_T = 60;
const HOLD_T = 360;
const FADE_T = 60;
const MASK_FRAMES = 8;
const MASK_FRAME_WAIT = 4;
const PAN_DELAY = 128;
const PAN_DURATION = 240;
const PAN_OVER = 0.55;
const PAN_START = -0.4;

let startAt = -1;
let img247: HTMLImageElement | null = null;
let img249: HTMLImageElement | null = null;
let img216: HTMLImageElement | null = null;
let loaded = false;
let failedAt = 0;

/** 资产懒加载（Extra_247 全景 / Extra_249 8帧竖条 / Extra_216 8帧遮罩表） */
function ensureAssets(): boolean {
  if (loaded) return true;
  if (failedAt && Date.now() - failedAt < 10_000) return false;
  if (typeof document === 'undefined') return false;
  const names = ['Extra_247', 'Extra_249', 'Extra_216'] as const;
  const slots = [() => img247, () => img249, () => img216];
  const sets = [(v: HTMLImageElement | null) => { img247 = v; }, (v: HTMLImageElement | null) => { img249 = v; }, (v: HTMLImageElement | null) => { img216 = v; }];
  let pending = 0;
  for (let i = 0; i < 3; i++) {
    if (slots[i]()) continue;
    pending++;
    const im = new Image();
    im.onload = () => {
      sets[i](im);
      pending--;
      if (pending === 0) loaded = true;
    };
    im.onerror = () => { failedAt = Date.now(); };
    im.src = `/sprites/vanilla/${names[i]}.png`;
  }
  return loaded;
}

/** 启动彩蛋（Game.openNpcDialog 树妖+5275 触发） */
export function startStardewAnimation(): void {
  ensureAssets();
  startAt = performance.now();
}

export function stardewActive(): boolean {
  return startAt >= 0;
}

/** Panning.GetPanAmount（Segments.cs Panning：Start + Over×clamp((t−Delay)/Duration)） */
function panAmount(t: number): number {
  if (t < PAN_DELAY) return PAN_START;
  return PAN_START + PAN_OVER * Math.min(1, (t - PAN_DELAY) / PAN_DURATION);
}

/** OutCircleScale 包络：128-188 0→1 / 持 1 / 488-548 1→0 */
function circleScale(t: number): number {
  if (t < START_T) return 0;
  if (t < START_T + REVEAL_T) return (t - START_T) / REVEAL_T;
  if (t < START_T + REVEAL_T + HOLD_T) return 1;
  if (t < START_T + REVEAL_T + HOLD_T + FADE_T) return 1 - (t - START_T - REVEAL_T - HOLD_T) / FADE_T;
  return -1;   // 结束
}

function drawMasked(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, mask: HTMLImageElement,
  cx: number, cy: number, dw: number, dh: number, panX: number, maskIdx: number, scale: number,
): void {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, dw); cv.height = Math.max(1, dh);
  const c2 = cv.getContext('2d', { willReadFrequently: true });
  if (!c2) return;
  // MaskedFade pass：sprite 采样 uv+pan（LinearClamp→越界取边）、alpha × mask.a
  const src = c2.createImageData(cv.width, cv.height);
  const mcv = document.createElement('canvas');
  mcv.width = mask.width; mcv.height = mask.height;
  const m2 = mcv.getContext('2d', { willReadFrequently: true });
  const scv = document.createElement('canvas');
  scv.width = img.width; scv.height = img.height;
  const s2 = scv.getContext('2d', { willReadFrequently: true });
  if (!m2 || !s2) return;
  m2.drawImage(mask, 0, 0);
  s2.drawImage(img, 0, 0);
  const md = m2.getImageData(0, 0, mask.width, mask.height).data;
  const sd = s2.getImageData(0, 0, img.width, img.height).data;
  const fh = mask.height / MASK_FRAMES;
  const clamp1 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
  const samp = (d: Uint8ClampedArray, w: number, h: number, u: number, v: number): [number, number, number, number] => {
    const x = Math.min(w - 1, Math.max(0, Math.round(u * w)));
    const y = Math.min(h - 1, Math.max(0, Math.round(v * h)));
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  };
  const cxp = cv.width / 2, cyp = cv.height / 2;
  const radius = Math.hypot(cxp, cyp) * Math.min(1, Math.max(0, scale));
  for (let py = 0; py < cv.height; py++) {
    const v = (py + 0.5) / cv.height;
    for (let px = 0; px < cv.width; px++) {
      const u = (px + 0.5) / cv.width;
      // OutCircleScale：中心圆外不可见（Segments.cs OutCircleScale 半径缩放）
      if (scale < 1 && Math.hypot(px + 0.5 - cxp, py + 0.5 - cyp) > radius) continue;
      const mv = clamp1(v / MASK_FRAMES + maskIdx / MASK_FRAMES);   // :2800 mad t0.y×(1/8)+idx/8
      const m = samp(md, mask.width, mask.height, u, mv);
      const sp = samp(sd, img.width, img.height, clamp1(u + panX), clamp1(v));  // :2801-2802 uv+pan
      const a = (m[3] / 255) * (sp[3] / 255);
      if (a <= 0.004) continue;
      const o = (py * cv.width + px) * 4;
      src.data[o] = sp[0]; src.data[o + 1] = sp[1]; src.data[o + 2] = sp[2]; src.data[o + 3] = a * 255;
    }
  }
  c2.putImageData(src, 0, 0);
  ctx.drawImage(cv, cx - dw / 2, cy - dh / 2, dw, dh);
}

/** 帧绘制（Renderer 末段屏叠消费）。返回 false = 未激活/已结束。 */
export function drawStardewAnimation(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): boolean {
  if (startAt < 0) return false;
  const t = Math.floor((performance.now() - startAt) / TICK_MS);
  const scale = circleScale(t);
  if (scale < 0) { startAt = -1; return false; }   // 548t 结束复位
  if (!ensureAssets() || !img247 || !img249 || !img216) return false;
  const panX = panAmount(t);
  const maskIdx = Math.floor(t / MASK_FRAME_WAIT) % MASK_FRAMES;   // (t/4)%8（MaskedFadeEffect :344）
  // 全景底（Extra_247 全帧,MaskedFade 遮罩显隐+PanX 滑移）
  const dw = Math.min(viewW * 0.75, viewH * 1.5);
  const dh = dw * (104 / 240);
  drawMasked(ctx, img247, img216, viewW / 2, viewH / 2, dw, dh, panX, maskIdx, scale);
  // 8 帧竖条前景（Extra_249,SetFrameSequence 每 4t 一帧）
  const fh = img249.height / MASK_FRAMES;
  const fcv = document.createElement('canvas');
  fcv.width = img249.width; fcv.height = fh;
  const fc = fcv.getContext('2d');
  if (fc) {
    fc.drawImage(img249, 0, maskIdx * fh, img249.width, fh, 0, 0, img249.width, fh);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, scale));
    const fw = dw * 0.42;
    ctx.drawImage(fcv, viewW / 2 - fw / 2, viewH / 2 - (fw * fh / img249.width) / 2, fw, fw * fh / img249.width);
    ctx.restore();
  }
  return true;
}
