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

// ---- Extra_59: 血月潜舰 618 蓄力圆周【双】闪（ai0==3 && ai[1]<180，case 618 段
//      Main.cs :23587-23623；★BJ211 重写 1:1——旧实现四处参数错：
//      ①半径 10·s 恒定 → 原版 num59·num58=25·p 世界 px（:23607/:23618，不乘 scale，
//        p=脉冲 0→1 环从盒心炸出）；②缺红环第一 loop（:23599-23611 white G=B=0 →
//        (255,0,0) 纯加算）；③缺 ×1.8/×1.5 scale 系数（:23610/:23621 vector9×k）；
//      ④rotation 误用 clamp(vx·0.1)（546 亮核式）→ 原版 rotation=轨道极角 num69
//        （:23606/:23617，含本体 rotation；618 rotation 走 visAngle 通道）----
const flashTintCache = new Map<string, HTMLCanvasElement>();
function flashTinted(
  tex: ImageBitmap | HTMLImageElement, tint: [number, number, number],
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;   // 非 DOM（vitest）走直绘
  const key = `extra59|${tint.join('_')}`;
  let c = flashTintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = tex.width; c.height = tex.height;
    const tc = c.getContext('2d');
    if (!tc) return null;
    tc.drawImage(tex, 0, 0);
    tc.globalCompositeOperation = 'multiply';
    tc.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
    tc.fillRect(0, 0, c.width, c.height);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(tex, 0, 0);
    flashTintCache.set(key, c);
  }
  return c;
}

export function drawDreadnautilusFlash(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
): void {
  if (e.ai0 !== 3 || e.ai1 >= 180) return;
  const tex = atlas.ensureVImage('vanilla/Extra_59.png');
  if (!tex) return;
  const p = (e.ai1 % 180) / 180;                       // num68 :23590-23591
  const n = 4;                                         // num57=4 :23592
  const R = 25 * p;                                    // num59·num58 世界 px :23607
  const s = (e.vanilla?.scale ?? 1) * (e.vanillaScale || 1);
  const sy = 0.5 + p * 0.75;                           // vector9.Y :23595
  const tri = p < 0.5 ? p / 0.5 : (1 - p) / 0.5;       // LerpValue(0,.5)·LerpValue(1,.5)
  const bright = tri * 0.25;                           // :23602/:23615
  const rot = e.visAngle || 0;                         // num69=极角+rotation :23606
  // 两 loop：红(G=B=0,A=0 纯加算)×1.8 :23599-23611 → 白(A=0)×1.5 :23612-23622
  const loops: Array<{ tint: [number, number, number] | null; k: number }> = [
    { tint: [255, 0, 0], k: 1.8 },
    { tint: null, k: 1.5 },
  ];
  for (const { tint, k } of loops) {
    // 染色画布不可用（非 DOM/vitest）时回退直绘——生产 DOM 恒成功
    const img = (tint ? flashTinted(tex, tint) : null) ?? tex;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';          // A=0 纯加算习语
    ctx.globalAlpha = Math.max(0, Math.min(1, bright));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rot;
      ctx.save();
      ctx.translate(e.cx + Math.cos(ang) * R, e.cy + Math.sin(ang) * R);
      ctx.rotate(ang);                                 // :23610/:23621 rotation=num69
      ctx.scale(s * k, s * sy * k);                    // vector9×k
      ctx.drawImage(img, -tex.width / 2, -tex.height / 2, tex.width, tex.height);
      ctx.restore();
    }
    ctx.restore();
  }
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
//  · 绘制面 = ★BJ248 勘误（2026-09-21 R2 复核翻案 BJ175b「原版无特支」判据）：
//    原版【有】473-476 专支——Main.cs:26436-26451（1458 同号逐字节同）aiStyle 87
//    后绘 extras 区残影支：`else if (aiStyle==87)` 内 `ai[0]==4||5||6` 态门、i=1..9、
//    α 四通道 = 0.5×ch×(10−i)/20（:26444-26447）+ GetShimmerColor 染色（:26448，本仓
//    无逐实体微光染色管线→恒等备案，同 BJ209/94/120/137/138 惯例）、同帧
//    rCurrentNPC.frame、oldPos[i]+size/2 定位（:26449）。BJ175b 旧注引用的
//    :23628-23643 通用块 α=(10−i)/15 系张冠李戴，已废。
//    ★z 序同步翻案：:26436 在本体链（:25645+）之后的后绘 extras 区=【本体之上】
//    （BJ237 drawNpcTrailGhostsOverBody 组，477/479 :26396 块之后）——BJ175b 旧
//    「本体之下」挂点+旧 α 均纠偏（Renderer 挂点已迁）。
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
    const alpha = (0.5 * (10 - i)) / 20;               // :26444-26447 0.5×ch×(10−i)/20 四通道均值
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
// Renderer.drawEnemy 双挂点调用（★BJ237 拆分）：【本体之下】前绘族走本体变换内
// 本体 drawImage 之前的槽（槽内 setTransform 回父空间，SkyRenderer.drawStar 同
// 习语）；【本体之上】后绘族保持 ctx.restore() 之后的挂点。
// 锚模型：残影帧中心 = oldPos 中心 + 与本体【同一】局部锚偏移（原版关系=残影锚
// ≡本体锚：通用大表 :23640 vs :23653、特支 +4 族 :25483 vs 本体尾段 Bottom+4 锚——
// 本仓本体锚已收敛为 anchorY 统一式，残影复用同一 addY+footFlush 即保持该关系）。
// z 序（★BJ237 归位定谳 2026-09-21，1457 DrawNPCDirect 逐块亲读、1458 对拍逐锚同号
// =零变更；修正 BJ209「特支族=本体之上」一刀切误判——默认路径残影组 :25472-25586
// 实际全在本体链 :25645+ 之前）：
//   【本体之下】通用大表 :23627 残影→:23645 环→:23660 本体；551 :23845-23858→
//   本体 :23859；439/440 case :24901-24914→环 :24923→本体 :24933；519 全绘 case
//   内段位即本体；默认路径前绘组 94 :25472 / 125-131,139,140 :25486 / 417 :25499 /
//   419 :25517 / 516 :25573（418 :25535 同组，本仓 drawCoriteTrail 前绘位已同相）。
//   【本体之上】后绘 extras 区（本体链之后）：120 :26015 / 137,138 :26030、
//   克眼冲刺 4 :26361、471 :26383、477,479 :26396、473-476 aiStyle 87 :26436（★BJ248
//   归位：BJ175b 旧判「本体之下+无特支」被 R2 复核翻案,挂点/α 同刀纠偏）。
//   BJ209 曾统一 restore 后挂点=全部本体之上（前绘族盖住本体；426 首影 α≈0.667
//   静止时洗白本体）——登记债，本刀清偿。426/620 等环族另见 BJ211 环位（残影先于环）。
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

/** ★BJ245（2026-09-21）邪教徒仪式召唤环（case 439/440 环段 Main.cs:24907-24931;
 *  1458 :24858-24940 对拍逐字节等价=零变更；BJ211 环族只收通用大表 num57,本 case
 *  在表外——BJ237 亲读立案,本刀清偿）——ai0==5（仪式瞬移态）&& ai1∈[0,30) 窗内
 *  4 份 Extra_30 环拷贝：
 *   · num328=(1−cos(ai1/30·π))/2（:24918-24919;0 起单调升至 1）、半径=70×num328
 *     世界 px（:24920 num329=70 裸值【不乘 scale】,仅贴图 draw 乘 scale）;
 *   · 角=(i/4)·2π+rotation（:24928）;色=Lerp(npcColor,White,amount10)→GetAlpha
 *     →×(1−num328)（:24923-24925）——环窗落 else 支 amount10=0（:24877-24878）
 *     不染白,光照色由 compositeLight 全屏乘承载（BJ209/残影同惯例）;A=(255−alpha)
 *     ×(1−num328) → globalAlpha=(1−num328)×opacity 合并;
 *   · 源矩形=残影同款 rectangle14（Extra_30 半高帧,row=frameIdx>=4 底行
 *     :24861-24866）;锚=Center+radial+本体锚偏移（:24928-24930 −NPC帧半×scale
 *     +halfSize×scale+origin=halfSize 恒等相消 → 贴图中心=Center+radial,
 *     (0,num46+num47+gfxOffY)≡addY+footFlush 同残影锚模型）;
 *   · z 序=残影（:24879-24894）→环（:24922-24931）→本体（:24933）——分发器内
 *     drawCultistGhosts 之后调用=本体之下前绘槽同相（BJ237 槽）。 */
export function drawCultistRitualRing(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  o: NpcGhostOpts,
): void {
  const vid = e.vanillaId;
  if (vid !== 439 && vid !== 440) return;
  if (e.ai0 !== 5 || e.ai1 < 0 || e.ai1 >= 30) return;
  const tex = atlas.ensureVImage('vanilla/Extra_30.png');
  if (!tex) return;
  const num328 = (1 - Math.cos((e.ai1 / 30) * Math.PI)) / 2;   // :24918-24919
  const radius = 70 * num328;                                  // :24920 裸 70（不乘 scale）
  const alpha = (1 - num328) * o.opacity;                      // ×(1−num328)（GetAlpha 合并 opacity）
  if (alpha <= 0.004) return;
  const half = tex.height / 2;
  const row = o.frameIdx >= 4 ? 1 : 0;
  const src = { sx: 0, sy: row * half, sw: tex.width, sh: half };
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + o.rot;                 // :24928 (num330/num327)·2π+rotation
    const gx = e.cx + Math.cos(ang) * radius;
    const gy = e.cy + Math.sin(ang) * radius;
    drawGhostSprite(ctx, tex, src, gx, gy, o.rot, o.mirror, o.scale, alpha, 1, o.addY);
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

/** 特支前绘族（原版画在【本体之下】——默认路径残影组 :25472-25586，先于本体链
 *  :25645+；★BJ237 定谳修正 BJ209「特支族=本体之上」一刀切误判）：
 *  · 94 腐化者 :25472-25485：i=1,3,5，RGBA×(10−i)/15（Shimmer 色登记偏差）
 *  · 417 日耀疾滚兽 :25499-25511：ai0==6 门，i=5..0，RGBA×(10−i)/20，rot=oldRot，
 *    scale=Lerp(0.5,1,(5−i)/6)
 *  · 516 日耀耀斑 :25567-25586：i=6..0，白×(10−i)/20 再 Lerp→Transparent(i/6)，
 *    帧倒退 (frameIdx−4−i) mod 4，scale=Lerp(0.35,1.2,(10−i)/10) */
export function drawPreBodySpecialGhosts(
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
  } else if (vid === 417) {
    if (e.ai0 !== 6) return;
    const tex = texOf();
    if (!tex) return;
    for (let i = 5; i >= 0; i--) {
      if (i >= depth) continue;
      drawGhostSprite(ctx, tex, frame, gx(i), gy(i), e.histRotAt(i), o.mirror, o.scale,
        ((10 - i) / 20) * o.opacity, 0.5 + (1 - 0.5) * ((5 - i) / 6), o.addY);
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

/** 特支后绘族（原版画在【本体之上】——本体链之后的后绘 extras 区，★BJ237 定谳；
 *  BJ209 的 restore 后挂点对本组本就同相，保持后绘位不动）：
 *  · 120 混沌元素 :26015-26033：i=1..9，TextureAssets.Chaos 整图，色 (150,100,150,50)
 *    ×(10−i)/15——A=50/255×衰减，RGB 衰减并入 alpha（登记）
 *  · 137/138 荧光蝠/史莱姆 :26034-26051：同 120 色式，本体贴图
 *  · 471 地精召唤师 :26383-26395：ai3<0 门，i=1..9，npcColor×0.5×(10−i)/20
 *  · 477 飞蛾魔 :26396-26415：speed>9 门，帧倒退 (frameIdx−i) mod frames
 *  · 479 飞蛾魔幼体 :26416-26441：speed>6.5 门，同 477 */
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
  if (vid === 120 || vid === 137 || vid === 138) {
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

/** ★BJ237 残影族【本体之下】分发（Renderer.drawEnemy 本体变换内、本体 drawImage
 *  之前、BJ211 环位之前的槽调用——原版残影 :23627 先于环 :23645；槽内
 *  setTransform 回父空间=绝对世界坐标，BJ209 参数面零漂移）。z 序逐块定谳见组头注。 */
export function drawNpcTrailGhosts(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  drawGenericTableGhosts(ctx, e, atlas, frame, o);
  drawCultistGhosts(ctx, e, atlas, o);
  drawCultistRitualRing(ctx, e, atlas, o);   // ★BJ245：仪式环（残影→环→本体 :24901→:24923→:24933）
  drawBetsyGhosts(ctx, e, atlas, frame, o);
  drawSolarGoopGhosts(ctx, e, atlas, o);
  drawPreBodySpecialGhosts(ctx, e, atlas, frame, o);
  drawSolenianGhosts(ctx, e, atlas, o);
  drawMechTrailGhosts(ctx, e, atlas, frame, o);
}

/** ★BJ237 残影族【本体之上】分发（特支后绘组 120/137/138/471/477/479 + 克眼冲刺 4
 *  ——原版本体链之后的后绘 extras 区；Renderer.drawEnemy 本体 restore 后挂点调用
 *  =本体之上同相） */
export function drawNpcTrailGhostsOverBody(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcGhostOpts,
): void {
  drawPostBodyTrailGhosts(ctx, e, atlas, frame, o);
  drawEocDashGhosts(ctx, e, atlas, frame, o);
}

/** 残影族 id 全集（Renderer 双挂点快速门——不含 ai 门，ai 门在各 draw 函数内；
 *  418 走 drawCoriteTrail 前绘位不在本表） */
export const NPC_TRAIL_GHOST_IDS: ReadonlySet<number> = new Set([
  ...Object.keys(GENERIC_TABLE_GHOSTS).map(Number),   // 426/427/521/542-546/558-560/574/575/581/620
  439, 440,        // 邪教徒符印+仪式环（:24901/:24923 本体之下,BJ245 补环）
  551,             // Betsy（:23845 本体之下）
  519,             // 日耀黏液（全绘 case 段位即本体）
  94, 417, 516,    // 特支前绘组（:25472/:25499/:25567 本体之下）
  419,             // 日耀旋刃（:25517 本体之下）
  125, 126, 127, 128, 129, 130, 131, 139, 140,   // 机械族（:25486 本体之下）
  4,               // 克眼冲刺（:26361 本体之上）
  120, 137, 138,   // 混沌/荧光蝠（:26015/:26030 本体之上）
  471, 477, 479,   // 召唤师/飞蛾魔（:26383/:26396 本体之上）
]);

// ===================== ★BJ211 num57 圆周光晕环族（2026-09-20，BJ209 债②销账） =====================
// 原版语义（Terarria1457 Main.cs DrawNPCDirect 通用大表段 :23400-23701 亲读；
// Terarria1458 对拍：num57 全部锚 :23413/:23479/:23489/:23498/:23505/:23512/:23552/
// :23564/:23583 与 1457 逐行同号=该段零变更）：
//   · 通用大表 if(type∈{…})(:23400) 内 switch(:23419-23626) 给七个 id 置 num57（环
//     份数）/num59（半径）/num58（包络）/num60（角偏移）/color10/amount/amount2，
//     由 :23645-23656 num74 循环统一画【本体贴图当前帧】环拷贝（非 oldPos 域）：
//       angle = i/num57·2π + rotation + num60；半径 = num59·num58（世界 px；唯 523
//       的 num59=10·npc.scale 自带 scale :23553）；色 = Lerp(npcColor,color10,amount)
//       →GetAlpha→Lerp(·,color10,amount2)→×(1−num58)；帧/origin/scale 与本体同源。
//   · 参与 id（num57>0 全集）：426(:23511)/523(:23551)/541(:23497)/568/569(:23475)/
//     618 两相(:23578/:23587)/620(:23561)/661(:23504)。大表其余 id num57 恒 0=无环
//     （427/428/521/542-546/552-557/561-563/566/567/570-575/578/581/583-585——销案）。
//   · 568/569 出生相（localAI[3]<60）num57=3 紫加算环 = drawWitherBirth 已承载
//     （Renderer 本体块同位）；≥60 常态 num57=4 HotPink 环 = 本刀补。
//   · 541/568/569/661 的 GlowMask 金/粉/彩虹轨道环（:23670-23715）= Renderer
//     NPC_GLOW_ORBIT 已承载（等价）；本刀只补【本体帧】num74 环。
//   · 挂点：本体变换内、本体 drawImage 之前（drawWitherBirth 同族先例位）——原版环
//     画在本体【之下】(:23645 环 → :23660 本体)，环拷贝绕盒心 4-25px 与本体高重叠；
//     若走 BJ209 残影 restore 后挂点（本体之上），包络谷底（f=1−num58→1）会把本体
//     洗白（661 最烈）。本体 rotation/镜像由 ctx 变换承载（transformed 空间无需
//     rot/mirror 散参——ctx.rotate 即角度式中的 rotation 项，镜像对均匀环拷贝
//     【位置集合】恒等映射 i↔count−i，拷贝贴图翻转=spriteEffects 同相）。
//   · 色链 npcColor=Lighting.GetColor：本仓无逐实体光染色管线（同 BJ209/Glow 表
//     登记）→ 全亮 White 进链，两段 Lerp 塌缩为常量 tint（表内钉值）。
//   · XNA 预乘（SrcBlend=One,InvSrcAlpha）：out = tex.rgb×tint×f + dst×(1−A·f/255)
//     （f=1−num58 乘区）。A=255 → source-over 单程；A∈(0,255) → destination-out
//     (A·f/255)+lighter(f) 两步；A=0 → 纯 lighter（α=0 纯加算习语）。

/** num57 环参数表（case 钉值 :23419-23626；tint/outA=色链塌缩值） */
export interface NpcAuraRingSpec {
  count: number;                 // num57
  radius: number;                // num59（世界 px @npc.scale=1）
  scaleRadius?: boolean;         // 523：num59=10·npc.scale（:23553）
  period: number;                // GTW 包络周期 s（0=非 GTW 相位）
  env: 'half' | 'sixth';         // cos/2+0.5 | cos/6+0.75
  phase?: 'ai1p30' | 'lai1';     // num58 相位源（618 ai0==1 相 / 523）
  ai2Floor?: boolean;            // 661：num58=max(env,GetLerpValue(0,60,ai2)) :23508
  spinPhase?: boolean;           // 523：num60=localAI[0]（AI_101 :40531 +=π/60/t）
  tint: [number, number, number] | null;   // 色链塌缩 RGB（null=White/不染色）
  outA: number;                  // 色链末端 A（255 常态；568/569=191；523≈141）
  spawnGate?: boolean;           // 568/569：lai3>=60（出生相=drawWitherBirth 承载）
}

export const NPC_AURA_RINGS: Record<number, NpcAuraRingSpec> = {
  // 426 外星蜂后（:23511-23519）：n4/r4/period1.2/Turquoise(64,224,208)：
  //   lerp(White,T,0.5)=(159.5,239.5,231.5)→(160,240,232)、A=255
  426: { count: 4, radius: 4, period: 1.2, env: 'half', tint: [160, 240, 232], outA: 255 },
  // 523 远古末日（:23551-23560）：n3/r10·scale/HotPink(255,105,180) amount .5+amount2
  //   .8、A→128 → 塌缩 rgb=(255,120,187.5)→(255,120,188)、A=lerp(lerp(255,128,.5),
  //   128,.8)=140.7→141；num60=lai0（:40531 +=π/60/帧）、num58=lai1=0.25+cos(ai1·
  //   2π/60)·0.25（:40532，UnitY.RotatedBy(θ).Y=cosθ）
  523: { count: 3, radius: 10, scaleRadius: true, period: 0, env: 'half', phase: 'lai1', spinPhase: true, tint: [255, 120, 188], outA: 141 },
  // 541 沙元素（:23497-23503）：n4/r6/period2.4/Gold(255,215,0) lerp .5 → (255,235,127.5)
  541: { count: 4, radius: 6, period: 2.4, env: 'half', tint: [255, 235, 128], outA: 255 },
  // 620 鲨鱼兵（:23561-23573）：n4/r6/period2.4/Gold——同 541；620 origin 覆写
  //   （:23563 −4·sdir）对本体/环同加=环相对本体零移（Renderer :7680 本体净位移
  //   同款 dx0 承载）；num47=-9 走 DRAW_NUM47_OVERRIDE（本体锚已含,环同锚）
  620: { count: 4, radius: 6, period: 2.4, env: 'half', tint: [255, 235, 128], outA: 255 },
  // 661 帝皇蝶（:23504-23510）：n6/r6/period2.4/color10=White（case 未覆写）→ 全亮
  //   下不染色；num58 下限=GetLerpValue(0,60,ai2)（:23508）；AI_065 rotation=vx·0.3
  //   （:73539,ctx 承载）；彩虹 HSL 轨道环另在 NPC_GLOW_ORBIT（已承载）
  661: { count: 6, radius: 6, period: 2.4, env: 'half', ai2Floor: true, tint: null, outA: 255 },
  // 568/569 枯萎兽常态（:23475-23485）：n4/r4/period1.5/sixth（cos/6+0.75）/HotPink
  //   A→127 → lerp .5=(255,180,217.5)→(255,180,218)、A=lerp(255,127,.5)=191；
  //   出生相 lai3<60 → num57=3 紫加算环=drawWitherBirth（:23486-23495）
  568: { count: 4, radius: 4, period: 1.5, env: 'sixth', tint: [255, 180, 218], outA: 191, spawnGate: true },
  569: { count: 4, radius: 4, period: 1.5, env: 'sixth', tint: [255, 180, 218], outA: 191, spawnGate: true },
  // 618 血月潜舰（case 618 :23574-23625）：基表=ai0==1 相（:23578-23586 n6/r15/
  //   num58=(ai1%30)/30·0.8+0.2）；ai0==3 相（:23587-23594 n4/r25/num58=(ai1%180)/180）
  //   由 draw 函数分派覆写。color10=White/amount=0 → 不染色；Extra_59 白红双闪另在
  //   drawDreadnautilusFlash（同 case 段,已 1:1 重写）
  618: { count: 6, radius: 15, period: 0, env: 'half', phase: 'ai1p30', tint: null, outA: 255 },
};

/** 环参与 id 全集（Renderer 挂点快速门 + tests 结构锁） */
export const NPC_AURA_RING_IDS: ReadonlySet<number> = new Set(
  Object.keys(NPC_AURA_RINGS).map(Number),
);

/** 环绘制散参（本体变换内调用；rot 由 ctx 变换承载不进散参） */
export interface NpcAuraOpts {
  scale: number;     // 本体渲染 scale（ctx 变换值——世界 px 半径 /scale 折算纹素）
  addY: number;      // 本体锚偏移（addY+footFlush，纹素——与本体 drawImage 同锚）
  opacity: number;   // 出生渐显（GetAlpha 的 alpha 乘区，合并进 f——BJ209 同惯例）
  /** 本体 ctx 是否处于 facing 镜像（Renderer :7841 同判）——仅 620 的 dx0 消费：
   *  本体 :7680 的 origin 覆写平移在镜像【之前】入链（世界号不受镜像影响），
   *  环 dx0 在镜像【之后】的纹素空间 → 需按镜像翻号落同一世界位移 */
  mirror?: boolean;
  lai3?: number;     // 568/569 localAI[3]（witherBeastLocal——出生门 <60 不画常态环）
  tSec?: number;     // GlobalTimeWrappedHourly 注入（缺省 gtw()；tests 钉相位用）
}

/** 环拷贝染色缓存（tint/vid 恒定，vid+帧尺寸为键——drawDukeAfterimages 同习语） */
const auraRingTintCache = new Map<string, HTMLCanvasElement>();
function auraRingTinted(
  key: string, tex: CanvasImageSource,
  src: { sx: number; sy: number; sw: number; sh: number },
  tint: [number, number, number],
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;   // 非 DOM（vitest）走直绘
  let c = auraRingTintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = src.sw; c.height = src.sh;
    const tc = c.getContext('2d');
    if (!tc) return null;
    tc.drawImage(tex, src.sx, src.sy, src.sw, src.sh, 0, 0, src.sw, src.sh);
    tc.globalCompositeOperation = 'multiply';
    tc.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
    tc.fillRect(0, 0, src.sw, src.sh);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(tex, src.sx, src.sy, src.sw, src.sh, 0, 0, src.sw, src.sh);
    auraRingTintCache.set(key, c);
  }
  return c;
}

/** num58 包络（:23481/:23500/:23507/:23514/:23558/:23566/:23582 相位式） */
function auraNum58(spec: NpcAuraRingSpec, ai1: number, tSec: number): number {
  if (spec.phase === 'lai1') {
    // :40532 localAI[1] = 0.25 + UnitY.RotatedBy(ai1·2π/60).Y·0.25（.Y=cosθ）
    return 0.25 + Math.cos((ai1 * Math.PI * 2) / 60) * 0.25;
  }
  if (spec.phase === 'ai1p30') {
    // :23580-23585 num65=(ai1%30)/30、num58=num65·0.8+0.2
    return ((ai1 % 30) / 30) * 0.8 + 0.2;
  }
  const x = ((tSec % spec.period) / spec.period) * Math.PI * 2;
  return spec.env === 'half' ? Math.cos(x) / 2 + 0.5 : Math.cos(x) / 6 + 0.75;
}

/** 环参数规划（纯函数，tests 锁面）：null=本帧无环（门/相不符） */
export function npcAuraRingParams(
  vid: number,
  s: { ai0: number; ai1: number; ai2: number; animT: number; lai3: number; tSec: number; scale: number },
): { count: number; radiusWorld: number; num58: number; num60: number; fade: number;
    tint: [number, number, number] | null; outA: number } | null {
  const spec = NPC_AURA_RINGS[vid];
  if (!spec) return null;
  if (spec.spawnGate && s.lai3 < 60) return null;
  let count = spec.count;
  let radius = spec.radius;
  let num58: number;
  if (vid === 618) {
    if (s.ai0 === 1 && s.ai1 < 90) {
      num58 = ((s.ai1 % 30) / 30) * 0.8 + 0.2;                    // :23580-23585
    } else if (s.ai0 === 3 && s.ai1 < 180) {
      count = 4; radius = 25;                                     // :23592-23593
      num58 = (s.ai1 % 180) / 180;                                // :23591
    } else return null;
  } else {
    num58 = auraNum58(spec, s.ai1, s.tSec);
  }
  if (spec.ai2Floor) {
    // :23508 GetLerpValue(0,60,ai2,clamped)
    num58 = Math.max(num58, Math.max(0, Math.min(1, s.ai2 / 60)));
  }
  const num60 = spec.spinPhase ? s.animT * (Math.PI / 60) : 0;    // :40531 π/60/帧
  const npcScale = s.scale;                                        // vanilla.scale×vanillaScale
  const radiusWorld = (spec.scaleRadius ? radius * npcScale : radius) * num58;
  return { count, radiusWorld, num58, num60, fade: 1 - num58, tint: spec.tint, outA: spec.outA };
}

/** num57 本体帧环（Renderer.drawEnemy 本体变换内、本体 drawImage 之前调用——
 *  原版环在本体之下 :23645→:23660，见组头注挂点论证） */
export function drawNpcAuraRings(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  o: NpcAuraOpts,
): void {
  const vid = e.vanillaId ?? -1;
  const spec = NPC_AURA_RINGS[vid];
  if (!spec) return;
  if (spec.spawnGate && (o.lai3 ?? 0) < 60) return;
  const tex = atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (!tex) return;
  const npcScale = (e.vanilla?.scale ?? 1) * (e.vanillaScale || 1);
  const prm = npcAuraRingParams(vid, {
    ai0: e.ai0, ai1: e.ai1, ai2: e.ai2, animT: e.animT,
    lai3: o.lai3 ?? 0, tSec: o.tSec ?? gtw(), scale: npcScale,
  });
  if (!prm) return;
  const f = prm.fade * o.opacity;                       // ×(1−num58)×GetAlpha 合并
  if (f <= 0.004) return;
  const tinted = spec.tint
    ? auraRingTinted(`aura|${vid}|${frame.sw}x${frame.sh}|${spec.tint.join('_')}`, tex, frame, spec.tint)
    : null;
  const srcImg: CanvasImageSource = tinted ?? tex;
  // 620 origin 覆写净位移：本体 :7680 平移在镜像链前=世界 +4·sdir·scale 恒定；
  // 环 dx0 在镜像后纹素空间 → mirror 时翻号才落同一世界位移（620 rotation=0
  // （AI_107 :65302）→ 无旋转项混入）。sdir 表达式与 :7680 同款
  const dx0 = vid === 620
    ? 4 * (e.facing >= 0 ? 1 : -1) * (o.mirror ? -1 : 1) * npcScale / o.scale
    : 0;
  const prevOp = ctx.globalCompositeOperation;
  const prevA = ctx.globalAlpha;
  // XNA 预乘混合三分支（组头注）：A=255 单程 source-over；A∈(0,255) 两步；
  // A=0 纯 lighter（本表无 A=0 项——568/569 出生紫环在 drawWitherBirth）
  if (spec.outA >= 255) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.max(0, Math.min(1, f));
  } else if (spec.outA > 0) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = Math.max(0, Math.min(1, (spec.outA / 255) * f));
  } else {
    ctx.globalCompositeOperation = 'lighter';   // A=0 纯加算习语（表内现无 A=0 项）
    ctx.globalAlpha = Math.max(0, Math.min(1, f));
  }
  const cut = spec.outA < 255 && spec.outA > 0;
  for (let i = 0; i < prm.count; i++) {
    const ang = (i / prm.count) * Math.PI * 2 + prm.num60;   // :23652 角度式
    const dx = dx0 + Math.cos(ang) * prm.radiusWorld / o.scale;   // 世界 px→纹素
    const dy = Math.sin(ang) * prm.radiusWorld / o.scale;
    if (cut) {
      ctx.drawImage(srcImg, frame.sx, frame.sy, frame.sw, frame.sh,
        -frame.sw / 2 + dx, -frame.sh / 2 + o.addY + dy, frame.sw, frame.sh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, Math.min(1, f));
    }
    ctx.drawImage(srcImg, frame.sx, frame.sy, frame.sw, frame.sh,
      -frame.sw / 2 + dx, -frame.sh / 2 + o.addY + dy, frame.sw, frame.sh);
    if (cut) {
      // 下一份拷贝重回削底相（XNA 逐 Draw 语义）
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = Math.max(0, Math.min(1, (spec.outA / 255) * f));
    }
  }
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevA;
}
