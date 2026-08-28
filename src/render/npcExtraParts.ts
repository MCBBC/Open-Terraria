// DrawNPC 附加贴图层批量移植（2026-08-27 全面审计补漏批）。
// 源 = 1458 Main.cs DrawNPC(:22678-26100) 内的 mySpriteBatch.Draw(TextureAssets.Extra[...])
// 附加层——每函数头注标原版行号与门条件。所有函数在 drawEnemy/drawTownNPC 的
// 通用帧绘制同层调用（ctx 已在世界变换内），使用同一 ctx 上下文。
// 参数 ctx/e/atlas + 所需散参由调用方（Renderer.drawEnemy）从 Enemy 属性算好传入。
import type { Enemy } from '../entities/Enemy';
import { SpriteAtlas } from '../assets/SpriteAtlas';

/** GlobalTimeWrappedHourly 近似（Main.cs:16777 每帧 +1/60s，3600 回卷） */
function gtw(): number {
  return (performance.now() / 1000) % 3600;
}

type Ctx = CanvasRenderingContext2D;

// ---- Extra_27: 火星探测器 399 逃跑态扫描束（Main.cs ai0==2 段）----
// ai0==2（被发现后上升逃跑）时 ×2 张半透明扫描束。color = LimeGreen→Red（ai[1] 距离
// 近变红），A=0 纯加算。rotation=π/2、origin(10,48)、scale=pulse×4。pulse=1−GTW%5/5。
// 参数 gfxOff = Enemy 无此字段（原版 gfxOffY 地形卡位偏移，本仓蚁狮系 AI 不写=0）。
export function drawMartianProbeBeams(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas, gfxOff: number,
): void {
  if (e.ai0 !== 2) return;
  const tex = atlas.ensureVImage('vanilla/Extra_27.png');
  if (!tex) return;
  const pulse = 1 - (gtw() % 5) / 5;
  const lerp = Math.max(0, Math.min(1, e.ai1 / 20));
  const a = pulse;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  const sc = pulse * 4;
  for (let i = 0; i < 2; i++) {
    ctx.save();
    ctx.translate(e.cx, e.cy + gfxOff - 4 + 6);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(tex, 0, 0, tex.width, tex.height,
      -10 * sc, -48 * sc, tex.width * sc, tex.height * sc);
    ctx.restore();
  }
  ctx.restore();
}

// ---- Extra_55: Corite 418 拖尾（ai0==2|4 段 Main.cs value56 链）----
// 7 段 oldPos 拖尾。4 帧竖条贴图（68×384 → Frame(1,4,0,num216) 68×96/帧）。
export function drawCoriteTrail(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
): void {
  if (e.ai0 !== 2 && e.ai0 !== 4) return;
  const tex = atlas.ensureVImage('vanilla/Extra_55.png');
  if (!tex) return;
  const depth = e.historyDepth();
  const num214 = Math.min(1, e.ai1 / 45);
  const num212 = Math.floor(e.ai1 / 2) % 4;
  const sh = tex.height / 4;
  const s = e.vanillaScale || 1;
  for (let i = 6; i >= 0; i--) {
    if (i >= depth) continue;
    const lerpB = i / 12;
    let cr = 255;
    let cg = Math.round(215 + (69 - 215) * num214);
    let cb = 0;
    cr = Math.round(cr * (1 - lerpB));
    cg = Math.round(cg * (1 - lerpB));
    cb = Math.round(255 * lerpB);
    const decay = (10 - i) / 20;
    const alpha = (64 / 255) * num214 * decay;
    const frame = ((num212 - i) % 4 + 4) % 4;
    const ox = e.histXAt(i) + e.w / 2 - (36 * s) / 2 + 12 * s;
    const oy = e.histYAt(i) + e.h - sh * s + 12 * s;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(tex, 0, frame * sh, tex.width, sh, ox, oy, tex.width * s, sh * s);
    ctx.restore();
  }
}

// ---- Extra_59: 血月潜舰 618 蓄力圆周闪（ai0==3 && ai[1]<180）----
export function drawDreadnautilusFlash(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
): void {
  if (e.ai0 !== 3 || e.ai1 >= 180) return;
  const tex = atlas.ensureVImage('vanilla/Extra_59.png');
  if (!tex) return;
  const pulse = (e.ai1 % 180) / 180;
  const n = 4;
  const s = e.vanillaScale || 1;
  const sy = 0.5 + pulse * 0.75;
  const brightness = (pulse < 0.5 ? pulse / 0.5 : (1 - pulse) / 0.5) * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = brightness;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (e.visAngle || 0);
    const dx = e.cx + Math.cos(ang) * 10 * s;
    const dy = e.cy + Math.sin(ang) * 10 * s * sy;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(Math.max(-Math.PI / 8, Math.min(Math.PI / 8, (e.vx || 0) * 0.1)));
    ctx.scale(s, s * sy);
    ctx.drawImage(tex, -tex.width / 2, -tex.height / 2, tex.width, tex.height);
    ctx.restore();
  }
  ctx.restore();
}

// ---- Extra_129: 血月潜舰 618 触腕叠加层（type==618 门，全程）----
export function drawDreadnautilusOverlay(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
): void {
  const tex = atlas.ensureVImage('vanilla/Extra_129.png');
  if (!tex) return;
  const s = e.vanillaScale || 1;
  ctx.save();
  ctx.translate(e.cx, e.cy);
  if (e.visAngle) ctx.rotate(e.visAngle);
  ctx.scale(s * ((e.facing ?? -1) === 1 ? -1 : 1), s);
  ctx.drawImage(tex, frame.sx, frame.sy, frame.sw, frame.sh,
    -frame.sw / 2, -frame.sh / 2, frame.sw, frame.sh);
  ctx.restore();
}

// ---- Extra_80: DD2 Old One's Skeleton 566/567 头冠（localAI[3]≥115 门）----
export function drawDD2SkeletonCrown(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas, frameRow: number,
): void {
  if (e.vanillaId !== 566 && e.vanillaId !== 567) return;
  if ((e.lai3 ?? 0) < 115) return;
  const tex = atlas.ensureVImage('vanilla/Extra_80.png');
  if (!tex) return;
  const animT = (performance.now() / 1000) % 0.5 / 0.5 * 4;
  const frameY = Math.floor(animT);
  const fh = tex.height / 4;
  const s = e.vanillaScale || 1;
  const dx = (e.facing ?? -1) * 8 * s;
  const offsets = [6, 4, 2, 6, 8, 6, 4, 2, 6];
  const dy = -(offsets[Math.min(frameRow, offsets.length - 1)] ?? 0) * s;
  ctx.save();
  ctx.translate(e.cx + dx, e.cy + dy);
  ctx.drawImage(tex, 0, frameY * fh, tex.width, fh, -tex.width / 2, -fh / 2, tex.width, fh);
  ctx.restore();
}

// ---- Extra_81/82: Betsy 551 双翼（localAI[0]/4 = 2×5 帧表）----
export function drawBetsyWings(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  draw: (img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
         dx: number, dy: number, dw: number, dh: number) => void,
): void {
  if (e.vanillaId !== 551) return;
  const back = atlas.ensureVImage('vanilla/Extra_82.png');
  const front = atlas.ensureVImage('vanilla/Extra_81.png');
  if (!back || !front) return;
  const fc = Math.floor((e.lai0 ?? 0) / 4);
  const col = Math.floor(fc / 5);
  const row = fc % 5;
  const w82 = 336 / 2, h82 = 1810 / 5;
  const w81 = 532 / 2, h81 = 1940 / 5;
  const s = e.vanillaScale || 1;
  const flip = (e.facing ?? -1) === 1;
  draw(back, col * w82, row * h82, w82, h82,
    e.cx - (flip ? -1 : 1) * 100 * s, e.cy - 30 * s, w82 * s, h82 * s);
  draw(front, col * w81, row * h81, w81, h81,
    e.cx + (flip ? -1 : 1) * 100 * s, e.cy - 30 * s, w81 * s, h81 * s);
}

// ---- Extra_289: 万圣节书架骷髅 693（localAI 驱动色彩/缩放）----
export function drawLibrarianSkeleton(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
): void {
  if (e.vanillaId !== 693) return;
  const tex = atlas.ensureVImage('vanilla/Extra_289.png');
  if (!tex) return;
  const la0 = e.lai0 ?? 0;
  const la2 = e.lai2 ?? 0;
  const la3 = e.lai3 ?? 1;
  let scaleF = 1;
  let alpha = 1;
  const decay = la2 / 10;
  if (decay > 0) { scaleF += decay * 0.2; alpha -= decay * 0.25; }
  if (la0 < 60) alpha *= Math.max(0, Math.min(1, la0 / 60));
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.5));
  ctx.translate(e.cx, e.cy);
  ctx.scale(scaleF * (e.vanillaScale || 1), scaleF * (e.vanillaScale || 1));
  ctx.drawImage(tex, -tex.width / 2, -tex.height / 2, tex.width, tex.height);
  ctx.restore();
}

// ---- Extra_263: 电工 124 变体头饰（townNpcVariationIndex==1 门）----
// TownNPC 路径调用（Mechanic 是城镇 NPC 不走 drawEnemy）。num46/num47 由调用方传入。
export function drawMechanicHeadgear(
  ctx: Ctx, atlas: SpriteAtlas,
  cx: number, bottom: number, spriteDirection: number,
  num46: number, num47: number, gfxOffY: number,
): void {
  const tex = atlas.ensureVImage('vanilla/Extra_263.png');
  if (!tex) return;
  const dx = cx - tex.width / 2 - spriteDirection * 3;
  const dy = bottom - 14 + num46 + num47 + gfxOffY - 2;
  ctx.save();
  ctx.drawImage(tex, dx, dy, tex.width, tex.height);
  ctx.restore();
}

// ---- Extra_57: 522 未命名 NPC 加算覆盖帧（aiStyle 100 段）----
// 白色 A=0 纯加算覆盖帧 + oldPos 残影（value85 链）。NPC 522 无正常生成路径，
// 但 DrawNPC 绘制段存在，1:1 对齐补接。
export function draw522Overlay(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
): void {
  if (e.vanillaId !== 522) return;
  const tex = atlas.ensureVImage('vanilla/Extra_57.png');
  if (!tex) return;
  const s = e.vanillaScale || 1;
  // 加算覆盖帧（A=0 纯加算，白 = 全通道加算）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  ctx.translate(e.cx, e.cy);
  ctx.scale(s * ((e.facing ?? -1) === 1 ? -1 : 1), s);
  ctx.drawImage(tex, -tex.width / 2, -tex.height / 2, tex.width, tex.height);
  ctx.restore();
  // oldPos 残影（value85 链：white × (1 − num374 × num375)、alpha 衰减、
  // scale = Lerp(0.8, 0.3, num376)、rotation = oldRot[num375]）
  const depth = e.historyDepth();
  const num375Max = Math.min(depth - 1, Math.floor(tex.width / 10));
  for (let num375 = num375Max; num375 >= 1; num375--) {
    const num376 = (depth - num375) / depth;
    const ox = e.histXAt(num375) + e.w / 2 - e.x;
    const oy = e.histYAt(num375) + e.h / 2 - e.y;
    const alpha = (1 - num376) * (1 - num375 / 1) * (1 - num376);
    if (alpha <= 0.01) continue;
    const sc = s * (0.8 + (0.3 - 0.8) * num376);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(e.x + ox, e.y + oy);
    if (e.visAngle) ctx.rotate(e.visAngle);
    ctx.scale(sc, sc);
    ctx.drawImage(tex, -tex.width / 2, -tex.height / 2, tex.width, tex.height);
    ctx.restore();
  }
}

// ---- Duke Fishron 370 残影系统（Main.cs aiStyle 69 分支内 value76 链）----
// oldPos 拖影（10 段间隔 2）+ 圆周爆发残影（N 张绕本体均匀角度）+ ai0≥4 换贴图。
export function drawDukeAfterimages(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  npcColor: [number, number, number],
): void {
  const vid = e.vanillaId;
  if (vid !== 370 && vid !== 372 && vid !== 373) return;
  const ai0 = e.ai0;
  const s = e.vanillaScale || 1;
  // 贴图选择：ai0≥4 → DukeFishron.png（黄色怒态），否则 NPC_370 正常帧
  const useDuke = vid === 370 && ai0 >= 4;
  const tex = useDuke
    ? atlas.ensureVImage('vanilla/DukeFishron.png')
    : atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (!tex) return;

  // npcColor 状态色（vanilla buffColor 链：ai0>9 绿×(0.4,0.8)、ai0>4 绿×(0.5,0.7)、
  // ai0==4 && ai[2]>120 白→黄渐变）
  let cr = 1, cg = 1, cb = 1;
  if (vid === 370) {
    if (ai0 > 9) { cr = 0.4; cg = 0.8; }
    else if (ai0 > 4) { cr = 0.5; cg = 0.7; }
    else if (ai0 === 4 && (e.ai2 ?? 0) > 120) {
      const t = Math.min(1, ((e.ai2 ?? 0) - 120) / 60);
      cr = 1 - 0.5 * t; cg = 1 - 0.3 * t; cb = 1 - 0.5 * t;
    }
  }

  // oldPos 拖影 + 圆周爆发残影（XNA 颜色 = buffColor(npcColor, …) × GetAlpha——
  // Canvas2D 1:1 = drawImage 后 globalCompositeOperation='multiply' 乘 tint 色 +
  // 'destination-in' 保 alpha → 等效 XNA 预乘 tint×alpha 混合）。
  // 缓存 canvas 避免每帧 per-afterimage 重烤（≤3 状态 × 1 贴图）。
  const depth = e.historyDepth();
  // 状态色 → RGB 0-255（vanilla buffColor 链已算入 cr/cg/cb）
  const tintR = Math.round(cr * 255), tintG = Math.round(cg * 255), tintB = Math.round(cb * 255);
  // 缓存 canvas（懒建、复用——同帧多残影不重烤）
  const tintKey = `${tintR}_${tintG}_${tintB}_${frame.sw}x${frame.sh}`;
  if (!drawDukeAfterimages._cache) drawDukeAfterimages._cache = new Map<string, HTMLCanvasElement>();
  let tinted = drawDukeAfterimages._cache.get(tintKey);
  if (!tinted) {
    tinted = document.createElement('canvas');
    tinted.width = frame.sw; tinted.height = frame.sh;
    const tc = tinted.getContext('2d')!;
    tc.drawImage(tex, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
    tc.globalCompositeOperation = 'multiply';
    tc.fillStyle = `rgb(${tintR},${tintG},${tintB})`;
    tc.fillRect(0, 0, frame.sw, frame.sh);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(tex, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
    drawDukeAfterimages._cache.set(tintKey, tinted);
  }
  // oldPos 拖影（10 段间隔 2、α=(10-i)/15×0.5）
  for (let i = 1; i < 10; i += 2) {
    if (i >= depth) continue;
    const alpha = ((10 - i) / 15) * 0.5;
    const ox = e.histXAt(i) + e.w / 2 - frame.sw * s / 2;
    const oy = e.histYAt(i) + e.h / 2 - frame.sh * s / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(tinted, ox, oy, frame.sw * s, frame.sh * s);
    ctx.restore();
  }

  // 圆周爆发残影（ai0 特定态）
  let burstN = 0, burstR = 0, burstAlpha = 0;
  if (vid === 370) {
    if (ai0 === -1) { burstN = 0; }
    else if (ai0 === 0 || ai0 === 5 || ai0 === 10) { burstN = 7; burstR = 10; burstAlpha = 0; }
    else if (ai0 >= 4) { burstN = 10; burstR = 10; burstAlpha = 0.5; }
    if (burstN > 0) {
      for (let i = 0; i < burstN; i++) {
        const ang = (i / burstN) * Math.PI * 2 + (e.visAngle || 0);
        const dx = e.cx + Math.cos(ang) * burstR * s;
        const dy = e.cy + Math.sin(ang) * burstR * s;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, burstAlpha));
        ctx.drawImage(tinted, dx - frame.sw * s / 2, dy - frame.sh * s / 2, frame.sw * s, frame.sh * s);
        ctx.restore();
      }
    }
  }
}
// 缓存挂载点（TypeScript 静态属性扩展）
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace drawDukeAfterimages {
  export let _cache: Map<string, HTMLCanvasElement> | undefined;
}
