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

// ---- 大宝箱怪 473-476 拖影（NPCID.Sets.TrailingMode=2 老位历史残影）----
// ★BJ175b（2026-09-20 用户实报"宝箱怪跳高无拖影,原版可见"）：
//  · 记录面 = NPC.UpdateNPC_UpdateTrails mode 2（NPC.cs:91893-91992；NPCID.cs:4769
//    `473,2,474,2,475,2,476,2`）——仅空中攻击态（(int)ai[0]==4 含 4.1 真俯冲/5/6）
//    展开历史，其余态全槽=当前位置（清零）。记录端本仓 recordTrailHistory 承载。
//  · 绘制面 = DrawNPC 通用拖尾块形状（Main.cs:23628-23643：oldPos[i]+size/2 定位、
//    alpha×=(num52-i)/num55（num52=TrailCacheLength 10/num55=15 缺省除数）、scale 恒
//    npc.scale、同帧 rCurrentNPC.frame）——★原版 Main.cs 无 473-476 特支（DrawNPCDirect
//    :22691-26712 残影族全表逐块亲读不含,1458 对拍同,登记债），按 TrailingMode 系统
//    语义 + 用户参考图补缺；i=1..9 步 1（mode 2 记录步长 1,非 Duke 家族步 2）。
//  · 非空中态整环已清零,残影与本体重合——此处仍按记录门短路（零绘制开销,swperf 同族）。
export function drawMimicAfterimages(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
): void {
  const vid = e.vanillaId;
  if (vid !== 473 && vid !== 474 && vid !== 475 && vid !== 476) return;
  const ai0 = e.ai0;
  if (ai0 !== 4 && ai0 !== 4.1 && ai0 !== 5 && ai0 !== 6) return;   // :91918 记录门=展开门
  const tex = atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (!tex) return;
  const s = e.vanillaScale || 1;
  const depth = e.historyDepth();
  for (let i = 1; i < 10; i++) {
    if (i >= depth) continue;
    const alpha = (10 - i) / 15;                       // :23634 (num52-num73)/num55
    const ox = e.histXAt(i) + e.w / 2 - frame.sw * s / 2;
    const oy = e.histYAt(i) + e.h / 2 - frame.sh * s / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(tex, frame.sx, frame.sy, frame.sw, frame.sh,
      ox, oy, frame.sw * s, frame.sh * s);
    ctx.restore();
  }
}

// ===================== ★BJ209 NPC 残影族全表推广（2026-09-20） =====================
// 原版全表（1457=1458 对拍同，Terarria1458 DrawNPCDirect 逐字节等价+UpdateTrails 同体）：
// NPCID.Sets.TrailingMode（NPCID.cs:4769）+ TrailCacheLength（:4809）+ 记录面
// UpdateNPC_UpdateTrails（NPC.cs:91893-91992，Enemy.recordTrailHistory 承载）+ 绘制面
// DrawNPCDirect oldPos 残影块（Main.cs:22723-26712 逐块亲读）。
// 本组函数=绘制面统一【绝对世界坐标】实现（与 drawMimicAfterimages 同习语），由
// Renderer.drawEnemy 本体绘制块 ctx.restore() 之后的单一挂点调用。
// 锚模型：残影帧中心 = oldPos 中心 + 与本体【同一】局部锚偏移（原版关系=残影锚
// ≡本体锚：通用大表 :23640 vs :23653、特支 +4 族 :25483 vs 本体尾段 Bottom+4 锚——
// 本仓本体锚已收敛为 anchorY 统一式，残影复用同一 addY+footFlush 即保持该关系）。
// z 序登记偏差：原版通用大表族残影画在本体之下（:23628 先于本体 Draw），特支族画在
// 本体之上（:25400-26449 后于本体）、两者都在发光层之下——本仓统一画在本体+发光层
// 之上（restore 后挂点）；残影在【旧位】与本体低重叠，视觉面登记偏差。
// 颜色登记偏差：原版 GetAlpha(npcColor)=光照色×alpha/255 与 GetShimmerColor(94/120/
// 137/138) 在残影层未逐像素移植——与 BJ175b/Mech 残影同惯例以 globalAlpha 承载衰减。

/** 绘制面共享散参（Renderer.drawEnemy 本体块内已知量） */
export interface NpcGhostOpts {
  scale: number;        // 本体渲染 scale（vanilla.scale × vanillaScale × expertRenderScale）
  addY: number;         // 本体锚偏移（addY+footFlush，纹理单位——ctx.scale 乘回世界 px）
  opacity: number;      // 出生渐显 1−spawnAlpha/255（原版 GetAlpha 的 npc.alpha 乘区）
  rot: number;          // 本体有效旋转（残影用当前旋转=原版 rCurrentNPC.rotation）
  mirror: boolean;      // 本体朝向镜像（spriteEffects 翻转）
  frameIdx: number;     // 当前帧序（FindFrame 值）
  frames: number;       // 帧数
}

/** 通用大表族残影参数（Main.cs switch :23429-23589）：count=num52/stride=num53/div=num55，
 *  循环 i 从 1 到 count 步 stride、α=(count−i)/div、同帧/当前旋转/恒 npc.scale。
 *  表内其余 id（428/523/541/552-557/561-573/578/583-585/618/661）num52=0=无 oldPos
 *  残影（仅圆周光晕，非 oldPos 域=登记债）。 */
const GENERIC_TABLE_GHOSTS: Record<number, { count: number; stride: number; div: number }> = {
  427: { count: 8, stride: 2, div: 24 },   // 蜂枪手 :23502-23506
  426: { count: 6, stride: 2, div: 6 },    // 蜂后 :23508-23518（光晕另登记）
  546: { count: 8, stride: 2, div: 24 },   // 怒滚草 :23519-23522
  542: { count: 6, stride: 3, div: 12 },   // 沙鲨四族 :23523-23529
  543: { count: 6, stride: 3, div: 12 },
  544: { count: 6, stride: 3, div: 12 },
  545: { count: 6, stride: 3, div: 12 },
  581: { count: 6, stride: 2, div: 18 },   // 飞蚁狮 :23530-23534
  521: { count: 10, stride: 2, div: 10 },  // 邪教徒巨鱿 :23535-23540
  620: { count: 6, stride: 2, div: 18 },   // 鲨鱼兵 :23541-23567（金晕另登记）
  558: { count: 6, stride: 2, div: 18 },   // DD2 飞龙/掷火怪 ai0==2（冲锋态）:23431-23441
  559: { count: 6, stride: 2, div: 18 },
  560: { count: 6, stride: 2, div: 18 },
  574: { count: 6, stride: 2, div: 18 },
  575: { count: 6, stride: 2, div: 18 },
};

/** 残影帧绘制原语：帧中心钉 (gx, gy)，rot/mirror 同本体，纹理单位 addY 随 ctx.scale 乘回 */
function drawGhostSprite(
  ctx: Ctx, tex: CanvasImageSource,
  src: { sx: number; sy: number; sw: number; sh: number },
  gx: number, gy: number, rot: number, mirror: boolean,
  s: number, alpha: number, gs: number, addY: number,
  lighter = false,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  if (lighter) ctx.globalCompositeOperation = 'lighter';
  ctx.translate(gx, gy);
  if (rot) ctx.rotate(rot);
  ctx.scale((mirror ? -1 : 1) * s * gs, s * gs);
  ctx.drawImage(tex, src.sx, src.sy, src.sw, src.sh,
    -src.sw / 2, -src.sh / 2 + addY, src.sw, src.sh);
  ctx.restore();
}

/** 通用大表族（:23400-23643）。521 的 scale=Lerp(npc.scale, 0.3f 字面, t)（:23487/:23541
 *  value4=0.3f 不乘 scale——原版字面值），t=1−(count−i)/div。 */
export function drawGenericTableGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  const vid = e.vanillaId ?? -1;
  const p = GENERIC_TABLE_GHOSTS[vid];
  if (!p) return;
  if ((vid === 558 || vid === 559 || vid === 560 || vid === 574 || vid === 575) && e.ai0 !== 2) return;
  const tex = atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (!tex) return;
  const depth = e.historyDepth();
  for (let i = 1; i < p.count; i += p.stride) {
    if (i >= depth) break;
    const t = 1 - (p.count - i) / p.div;
    const alpha = ((p.count - i) / p.div) * o.opacity;
    if (alpha <= 0.004) continue;
    const gs = vid === 521 ? o.scale + (0.3 - o.scale) * t : 1;
    drawGhostSprite(ctx, tex, frame, e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2,
      o.rot, o.mirror, o.scale, alpha, gs / o.scale, o.addY);
  }
}

/** 拜月教邪教徒 439/440（mode 0 隔拍记录；Main.cs:24901-24935 case 439/440）：
 *  Extra_30 双行符印（行=frameIdx>=4?1:0），门 ai0==-1 && ai1∈[320,960) → i=1,3,5
 *  （num323=6）/ ai0==1 → i=1,3（num323=4）；α 衰减 (num323−i)/num323 只乘 RGB、
 *  A=100 钉死（:24922-24926）——本仓以 α=(衰减)×(100/255) 合并承载（登记）。 */
export function drawCultistGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  o: NpcGhostOpts,
): void {
  const vid = e.vanillaId;
  if (vid !== 439 && vid !== 440) return;
  let n = 0;
  if (e.ai0 === -1 && e.ai1 >= 320 && e.ai1 < 960) n = 6;
  else if (e.ai0 === 1) n = 4;
  if (n <= 0) return;
  const tex = atlas.ensureVImage('vanilla/Extra_30.png');
  if (!tex) return;
  const half = tex.height / 2;
  const row = o.frameIdx >= 4 ? 1 : 0;
  const depth = e.historyDepth();
  for (let i = 1; i < n; i += 2) {
    if (i >= depth) break;
    const alpha = ((n - i) / n) * (100 / 255) * o.opacity;
    drawGhostSprite(ctx, tex, { sx: 0, sy: row * half, sw: tex.width, sh: half },
      e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2,
      0, o.mirror, o.scale, alpha, 1, o.addY);
  }
}

/** Betsy 551 残影（mode 7；Main.cs:23794-23861 else if type==551）：oldPos[9,6,3]、
 *  每位三层（后翼 Extra_82→躯干→前翼 Extra_81），α=npcColor×(1−i/10)×0.35 再 A/2
 *  （:23852-23854）→ 0.175×(1−i/10)；旋转=oldRot（:23851）；翼帧=lai0/4 的 2×5 帧；
 *  翼偏移/origin：sp2=(79.5,-26)/o4=(16,176)、sp1=(20.5,-34)/o5=(215,170)、躯干
 *  origin=(150.5,78)（:23810-23815 vector13/14/15 推导；翻转 X 侧由 ctx mirror 承载，
 *  dx 按翻转档折算——翻转档 dx 恒等式已验算躯干层 F=0/1 同值）。层序=后翼→躯干→前翼。 */
export function drawBetsyGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  if (e.vanillaId !== 551) return;
  const back = atlas.ensureVImage('vanilla/Extra_82.png');
  const front = atlas.ensureVImage('vanilla/Extra_81.png');
  const body = atlas.ensureVImage('vanilla/NPC_551.png');
  if (!back || !front || !body) return;
  const fc = Math.floor((e.lai0 ?? 0) / 4);
  const col = Math.floor(fc / 5), row = fc % 5;
  const w82 = 336 / 2, h82 = 1810 / 5, w81 = 532 / 2, h81 = 1940 / 5;
  const F = o.mirror;   // 原版 spriteEffects2（整支翻转惯例）=本仓本体镜像同相
  const depth = e.historyDepth();
  for (const i of [9, 6, 3]) {
    if (i >= depth) break;
    const alpha = 0.35 * (1 - i / 10) * 0.5 * o.opacity;
    const gx = e.histXAt(i) + e.w / 2, gy = e.histYAt(i) + e.h / 2;
    const rot = e.histRotAt(i);
    const layer = (tex: CanvasImageSource, srcX: number, srcY: number, sw: number, sh: number,
      ox: number, oy: number, px: number, py: number, W: number) => {
      const dx = F ? (ox + px - W) : (px - ox);
      const dy = py - oy;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      ctx.scale((F ? -1 : 1) * o.scale, o.scale);
      ctx.drawImage(tex, srcX, srcY, sw, sh, dx, dy, sw, sh);
      ctx.restore();
    };
    // 后翼 Extra_82（offset sp2, origin o4）
    layer(back, col * w82, row * h82, w82, h82, 16, 176, 79.5, -26, w82);
    // 躯干（offset 0, origin vector15；源=本体当前帧）
    layer(body, frame.sx, frame.sy, frame.sw, frame.sh,
      F ? frame.sw - 150.5 : 150.5, 78, 0, 0, frame.sw);
    // 前翼 Extra_81（offset sp1, origin o5）
    layer(front, col * w81, row * h81, w81, h81, 215, 170, 20.5, -34, w81);
  }
}

/** 日耀黏液 519（mode 7 len=20；Main.cs:24637-24652 case 519）：全环 oldPos 19..0 逐位、
 *  粉×(1−0.035i)（RGB 衰减）、A×(i/20)（:24645-24649）、scale=Lerp(0.3,1.1,(20−i)/20)
 *  （越旧越大=尾迹展开）、rot=oldRot。粉色调 (255,192,203) 以 alpha 合并承载（登记）。
 *  原版 Draw source=null=整贴图（519 frames=1 同相）。 */
export function drawSolarGoopGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  o: NpcGhostOpts,
): void {
  if (e.vanillaId !== 519) return;
  const tex = atlas.ensureVImage('vanilla/NPC_519.png');
  if (!tex) return;
  const LEN = 20;   // TrailCacheLength[519]=20（NPCID.cs:4809）
  const depth = Math.min(LEN, e.historyDepth());
  for (let i = depth - 1; i >= 0; i--) {
    const num359 = (LEN - i) / LEN;
    const rgb = 1 - (1 / LEN) * 0.7 * i;
    const alpha = rgb * (i / LEN) * o.opacity;
    if (alpha <= 0.004) continue;
    const gs = 0.3 + (1.1 - 0.3) * num359;
    drawGhostSprite(ctx, tex, { sx: 0, sy: 0, sw: tex.width, sh: tex.height },
      e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2,
      e.histRotAt(i), o.mirror, o.scale, alpha, gs, o.addY);
  }
}

/** 特支后绘族（本体 Draw 之后求值，Main.cs:25400-26449 逐块）：
 *  · 94 腐化者 :25472-25485：i=1,3,5，RGBA×(10−i)/15（Shimmer 色登记偏差）
 *  · 120 混沌元素 :26015-26033：i=1..9，TextureAssets.Chaos 整图，色 (150,100,150,50)
 *    ×(10−i)/15——A=50/255×衰减，RGB 衰减并入 alpha（登记）
 *  · 137/138 荧光蝠/史莱姆 :26034-26051：同 120 色式，本体贴图
 *  · 417 日耀疾滚兽 :25499-25511：ai0==6 门，i=5..0，RGBA×(10−i)/20，rot=oldRot，
 *    scale=Lerp(0.5,1,(5−i)/6)
 *  · 471 地精召唤师 :26383-26395：ai3<0 门，i=1..9，npcColor×0.5×(10−i)/20
 *  · 477 飞蛾魔 :26396-26415：speed>9 门，帧倒退 (frameIdx−i) mod frames
 *  · 479 飞蛾魔幼体 :26416-26441：speed>6.5 门，同 477
 *  · 516 日耀耀斑 :25567-25586：i=6..0，白×(10−i)/20 再 Lerp→Transparent(i/6)，
 *    帧倒退 (frameIdx−4−i) mod 4，scale=Lerp(0.35,1.2,(10−i)/10) */
export function drawPostBodyTrailGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  const vid = e.vanillaId;
  const depth = e.historyDepth();
  const gx = (i: number) => e.histXAt(i) + e.w / 2;
  const gy = (i: number) => e.histYAt(i) + e.h / 2;
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const texOf = () => atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (vid === 94) {
    const tex = texOf();
    if (!tex) return;
    for (let i = 1; i < 6; i += 2) {
      if (i >= depth) break;
      drawGhostSprite(ctx, tex, frame, gx(i), gy(i), o.rot, o.mirror, o.scale,
        ((10 - i) / 15) * o.opacity, 1, o.addY);
    }
  } else if (vid === 120 || vid === 137 || vid === 138) {
    const tex = vid === 120 ? atlas.ensureVImage('vanilla/Chaos.png') : texOf();
    if (!tex) return;
    const src = vid === 120
      ? { sx: 0, sy: 0, sw: tex.width, sh: tex.height }
      : frame;
    for (let i = 1; i < 10; i++) {
      if (i >= depth) break;
      // 色 (150,100,150,50)×(10−i)/15：A=50/255×衰减；RGB 衰减并入 alpha（登记）
      drawGhostSprite(ctx, tex, src, gx(i), gy(i), o.rot, o.mirror, o.scale,
        ((50 / 255) * (10 - i) / 15) * o.opacity, 1, o.addY);
    }
  } else if (vid === 417) {
    if (e.ai0 !== 6) return;
    const tex = texOf();
    if (!tex) return;
    for (let i = 5; i >= 0; i--) {
      if (i >= depth) continue;
      drawGhostSprite(ctx, tex, frame, gx(i), gy(i), e.histRotAt(i), o.mirror, o.scale,
        ((10 - i) / 20) * o.opacity, 0.5 + (1 - 0.5) * ((5 - i) / 6), o.addY);
    }
  } else if (vid === 471) {
    if (e.ai3 >= 0) return;
    const tex = texOf();
    if (!tex) return;
    for (let i = 1; i < 10; i++) {
      if (i >= depth) break;
      drawGhostSprite(ctx, tex, frame, gx(i), gy(i), o.rot, o.mirror, o.scale,
        (0.5 * (10 - i) / 20) * o.opacity, 1, o.addY);
    }
  } else if (vid === 477 || vid === 479) {
    const gate = vid === 477 ? 9 : 6.5;
    if (Math.hypot(e.vx, e.vy) <= gate) return;
    const tex = texOf();
    if (!tex) return;
    for (let i = 1; i < 10; i++) {
      if (i >= depth) break;
      const ghostIdx = mod(o.frameIdx - i, o.frames);   // frame.Y -= fh*i 回卷（:26403-26408）
      drawGhostSprite(ctx, tex, { sx: frame.sx, sy: ghostIdx * frame.sh, sw: frame.sw, sh: frame.sh },
        gx(i), gy(i), o.rot, o.mirror, o.scale,
        (0.5 * (10 - i) / 20) * o.opacity, 1, o.addY);
    }
  } else if (vid === 516) {
    const tex = texOf();
    if (!tex) return;
    for (let i = 6; i >= 0; i--) {
      if (i >= depth) continue;
      const ghostIdx = mod(o.frameIdx - 4 - i, 4);   // (row−4−i) mod 4（:25572-25580）
      const a = ((10 - i) / 20) * (1 - i / 6) * o.opacity;
      drawGhostSprite(ctx, tex, { sx: frame.sx, sy: ghostIdx * frame.sh, sw: frame.sw, sh: frame.sh },
        gx(i), gy(i), o.rot, o.mirror, o.scale, a,
        0.35 + (1.2 - 0.35) * ((10 - i) / 10), o.addY);
    }
  }
}

/** 日耀旋刃 419 拖尾（mode 7；Main.cs:25512-25534，ai2<=-9 门；原 drawNpcGlow 内联块
 *  迁出——其 ctx 在本体变换内，绝对历史坐标被当作相对位移=双重偏移，BJ209 修正）：
 *  Glow_154 网格（帧高=texH/17），行 (row−3−i) mod 3 + 5，白 A=0 纯加算（XNA α=0
 *  惯例→'lighter'），rot=oldRot，scale=Lerp(0.75,1.2,(10−i)/10)。 */
export function drawSolenianGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  o: NpcGhostOpts,
): void {
  if (e.vanillaId !== 419 || e.ai2 > -9) return;
  const tex = atlas.ensureVImage('vanilla/Glow_154.png');
  if (!tex) return;
  const gh = tex.height / o.frames;
  const depth = e.historyDepth();
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  for (let i = 6; i >= 0; i--) {
    if (i >= depth) continue;
    const trow = mod(o.frameIdx - 3 - i, 3) + 5;
    drawGhostSprite(ctx, tex, { sx: 0, sy: trow * gh, sw: tex.width, sh: gh },
      e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2,
      e.histRotAt(i), o.mirror, o.scale, ((10 - i) / 20) * o.opacity,
      0.75 + (1.2 - 0.75) * ((10 - i) / 10), o.addY, true);
  }
}

/** 克眼 4 冲刺残影（mode 3；Main.cs:26359-26371，ai0==3 && ai1>=4 门；原 drawEnemy
 *  内联块迁出——同 419 双重偏移修正）。i=1..9，α=0.5×(10−i)/20，同帧同当前旋转。 */
export function drawEocDashGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  if (e.vanillaId !== 4 || e.ai0 !== 3 || e.state < 4) return;
  const tex = atlas.ensureVImage('vanilla/NPC_4.png');
  if (!tex) return;
  const depth = e.historyDepth();
  for (let i = 1; i < 10; i++) {
    if (i >= depth) break;
    const a = (10 - i) / 40;
    if (a <= 0.01) continue;
    drawGhostSprite(ctx, tex, frame, e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2,
      o.rot, o.mirror, o.scale, a * o.opacity, 1, o.addY);
  }
}

/** 机械族旧位拖尾（mode 6；Main.cs:25486-25498；原 drawEnemy 内联块迁出——同上双重
 *  偏移修正）：125-131 全族 + 139 自由态（ai3==0）+ 140；i=9,7,5,3,1，RGBA×(10−i)/20，
 *  同帧同当前旋转（e.spin=ROTATION_NPC 旋转通道）。 */
export function drawMechTrailGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  const vid = e.vanillaId ?? -1;
  if (!((vid >= 125 && vid <= 131) || (vid === 139 && e.ai3 === 0) || vid === 140)) return;
  const tex = atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (!tex) return;
  const depth = e.historyDepth();
  for (let i = 9; i >= 1; i -= 2) {
    if (i >= depth) break;
    drawGhostSprite(ctx, tex, frame, e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2,
      o.rot, o.mirror, o.scale, ((10 - i) / 20) * o.opacity, 1, o.addY);
  }
}

/** BJ209 残影族统一分发（Renderer.drawEnemy 本体 restore 后单挂点调用） */
export function drawNpcTrailGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  drawGenericTableGhosts(ctx, e, atlas, frame, o);
  drawCultistGhosts(ctx, e, atlas, o);
  drawBetsyGhosts(ctx, e, atlas, frame, o);
  drawSolarGoopGhosts(ctx, e, atlas, o);
  drawPostBodyTrailGhosts(ctx, e, atlas, frame, o);
  drawSolenianGhosts(ctx, e, atlas, o);
  drawEocDashGhosts(ctx, e, atlas, frame, o);
  drawMechTrailGhosts(ctx, e, atlas, frame, o);
}
