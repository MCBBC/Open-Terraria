// DrawNPC 附加贴图层批量移植（2026-08-27 全面审计补漏批）。
// 源 = 1458 Main.cs DrawNPC(:22678-26100) 内的 mySpriteBatch.Draw(TextureAssets.Extra[...])
// 附加层——每函数头注标原版行号与门条件。所有函数在 drawEnemy/drawTownNPC 的
// 通用帧绘制同层调用（ctx 已在世界变换内），使用同一 ctx 上下文。
// 参数 ctx/e/atlas + 所需散参由调用方（Renderer.drawEnemy）从 Enemy 属性算好传入。
import type { Enemy } from '../entities/Enemy';
import { SpriteAtlas } from '../assets/SpriteAtlas';
import { dustPremulBake } from '../fx/VanillaDust';
import { globalTimeWrappedHourly } from '../core/GameTime';   // ★BJ330 GTW 单源

/** GlobalTimeWrappedHourly（Main.cs:17014——★BJ330 收编 GameTime 单源,暂停/失焦冻结） */
function gtw(): number {
  return globalTimeWrappedHourly();
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
  // ★BJ343 件 6：GTW 漏收编站收编——原版 Main.cs:23750 `(int)(GlobalTimeWrappedHourly
  //  % 0.5f / 0.5f * 4f)`（Extra_80 头冠 4 帧）。GTW 单源=暂停/失焦随世界冻结（BJ330
  //  语义,原 performance.now 墙钟相位照走=漂移）
  const animT = gtw() % 0.5 / 0.5 * 4;
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

// ---- Duke Fishron 370/372/373 残影系统（Main.cs :24674-24856 aiStyle 69 case 逐值）----
// 结构（原版 case 内绘制序）：①npcColor 相位染色 → ②oldPos 拖影（NPC 贴图）→
// ③圆周脉冲拷贝（NPC 贴图）→ ④本体（Renderer 通用路径）→ ⑤ai0≥4 DukeFishron.png
// 叠层（trail 步 1 + burst i=1 起 + 本体叠画，Yellow 系配色）。
// ★BJ310 续刀（2026-09-23 用户追问"二阶段形态贴图移植对吗"定谳=近似版偏差重写）：
//  旧实现（2026-08-27 审计批）三处结构性偏差——a) ai0≥4 把残影贴图【整换】为
//  DukeFishron.png，原版是 NPC_370 本体之上【另画一整层】（:24802 门后 value76 重赋
//  值，本体仍画 NPC_370）；b) 圆周爆发状态表自造（悬浮 0/5/10 发 7 张 α=0 恒零、
//  ai0≥4 恒发 10 张 R10 α0.5）——原版仅 3/8 态 ai2>60(R40)/4 态 ai2>120(R60)/
//  9 态 ai2>120(R60)/12 态(R20) 四窗、amp=(1−cos)/3 振荡、α×(1−amp)；c) 拖影段数
//  态表（num335：−1 态 0/悬浮 0·5·10 态 7/其余 10）与 ×0.5 α 因子（原版无此数）
//  缺失，ai0==1 蓝色冲刺残影（Lerp(色,Blue,0.5)）整缺。
// XNA Color 语义备忘：Color×float 乘 RGBA 四通道（=premultiplied α 同步衰减，Canvas
// 侧等价【bake rgb×k + globalAlpha=k】）；Color.Lerp 截断取整（(int) 戄断,127.5→127）。
// 残影 rotation/flip = 本体当前值（原版 :24742 传 rCurrentNPC.rotation+spriteEffects,
// 非历史值）;位置 = oldPos[i] 中心（绝对世界位,不随本体 transform）。
// ★BJ325（2026-09-24）登记债清偿：GetAlpha d370 蓝通道增亮（NPC.cs:94684-94691
// B×Lerp((255−α)/255,1,0.25),α>0 即入块半隐时可见）——基座拖影/基座爆发两面经
// duke370PremulPair 预乘烘焙对接线（本体面在 Renderer.drawEnemy 同判据接线）;
// 冲刺蓝残影的 light 无关蓝加项在暗处偏差（bake 乘 (0.5,0.5,1) 在光照=1 时逐值精确）。
// 叠层爆发 :24849 虽经 GetAlpha 但 value81=Yellow×k（B=0）→ num9×0=0 数学恒等,
// 零观感不接线（登记）;叠层拖影/叠层本体原文不经 GetAlpha,不涉本刀。

/** 猪鲨相位染色（Main.cs :24686-24699 buffColor 链,0-1 rgb 乘数）——本体/拖影/爆发
 *  共用。ai0>9 终怒 (0.4,0.8,0.4)/ai0>4 二阶段 (0.5,0.7,0.5)/变身窗 ai0==4&&ai2>120
 *  渐变 ramp k=(ai2−120)/60。null = 无染色（一阶段常规）。 */
export function dukePhaseTint(e: Enemy): [number, number, number] | null {
  if (e.vanillaId !== 370) return null;
  const ai0 = e.ai0, ai2 = e.ai2 ?? 0;
  if (ai0 > 9) return [0.4, 0.8, 0.4];
  if (ai0 > 4) return [0.5, 0.7, 0.5];
  if (ai0 === 4 && ai2 > 120) {
    const t = (ai2 - 120) / 60;
    return [1 - 0.5 * t, 1 - 0.3 * t, 1 - 0.5 * t];
  }
  return null;
}

/** num335 拖影段数态表（Main.cs :24700-24712）：370 的 −1 态 0/悬浮 0·5·10 态 7/
 *  其余（含 372/373 全态）10。导出供 BJ310 回归测试锚定。 */
export function dukeTrailCount(e: Enemy): number {
  if (e.vanillaId !== 370) return 10;
  if (e.ai0 === -1) return 0;
  if (e.ai0 === 0 || e.ai0 === 5 || e.ai0 === 10) return 7;
  return 10;
}

/** 圆周脉冲参数（Main.cs :24747-24786）：[拷贝数 num338, 幅 num339, 半径 num340]。
 *  3/8 态 ai2>60 → R40；(4/9) 态 ai2>120 → R60；12 态 → R20；amp=(1−cos(θ))/3。
 *  导出供 BJ310 回归测试锚定。 */
export function dukeBurstParams(e: Enemy): [number, number, number] {
  const ai0 = e.ai0, ai2 = e.ai2 ?? 0;
  if ((ai0 === 3 || ai0 === 8) && ai2 > 60) {
    return [6, (1 - Math.cos(((ai2 - 60) / 30) * Math.PI * 2)) / 3, 40];
  }
  if ((ai0 === 4 || ai0 === 9) && ai2 > 120) {
    return [6, (1 - Math.cos(((ai2 - 120) / 60) * Math.PI * 2)) / 3, 60];
  }
  if (ai0 === 12) {
    return [6, (1 - Math.cos((ai2 / 30) * Math.PI * 2)) / 3, 20];
  }
  return [0, 0, 0];
}

// ---- ★BJ325 GetAlpha d370 蓝通道增亮（NPC.cs:94684-94691,BJ312 per-channel 手术域）----
// 原版 GetAlpha type==370 支:ai[0]!=-1 && ai[0]<9 时蓝通道因子改用
// num9=Lerp(num,1,0.25)（num=(255−alpha)/255;>1 钳死码照抄）——B 通道比 R/G 少衰减,
// 入块半隐时（AI_069 :49498-49516 SolidCollision ±15 钳 [0,150]）鱼身呈蓝调而非均匀淡出。
// 本仓 GetAlpha 等价面=灰度单系数 num 进 globalAlpha（光照由 compositeLight 事后乘）,
// per-channel 维度无载体 → 走【预乘烘焙对】（dustPremulBake 精确判例,
// tests/dust-premultiplied-blend 数值验证）：erase 面（α=texA×cA）+ add 面
// （premult=texP×cRGB,cRGB=(num,num,num9)）,两步 'destination-out'+'lighter'
// = XNA AlphaBlend 逐字节精确（α 过冲偏差类见 dustPremulBake 头注:仅 rgb>e 亮点位,
// 本刀 mB=num9>mA=num 时 texB>255·num/num9 才触发,亮蓝高光受限）。
// 模型边界（备案）：本仓缺省尾=单系数 num（globalAlpha）,非 XNA cRGB+cA 双因子完整式
// ——R/G 通道维持仓内既有口径不动（用户定标域,NPC_TINT_KA 同域）,本刀只补 B 相对增亮
// =登记债「蓝通道增亮整支」的精确边界;R/G 若改 cRGB=num 全式属另一笔模型债,不越界。

/** d370 GetAlpha 蓝增亮因子（NPC.cs:94684-94691 逐值）。null=分支不活：
 *  门外（ai0==-1 潜行 intro / ai0>=9 终怒,或 372/373 非本支）、α 端点
 *  （α=0 → num=1 → num9=1 恒等无操作;α=255 → ga=0 不可见,手术无面）。 */
export function duke370GetAlphaBoost(e: Enemy): { num: number; num9: number } | null {
  if (e.vanillaId !== 370) return null;
  if (!(e.ai0 !== -1 && e.ai0 < 9)) return null;
  const a = Math.min(255, Math.max(e.spawnAlpha, 0));
  if (a <= 0 || a >= 255) return null;
  const num = (255 - a) / 255;
  const num9 = Math.min(1, num + (1 - num) * 0.25);   // Lerp(num,1f,0.25f)+num9>1 钳
  return { num, num9 };
}

/** 预乘对烘焙缓存（key=tag|rect|m 四字节）。dustPremulBake 纯函数尺寸无关,
 *  直接喂 NPC 帧级 ImageData;LRU 溢出逐最旧（dukeBake 同式,勿整表 clear）。
 *  上限 160×(2 面×202×162×4B)≈42MB 最坏,实际工作集（帧×α 桶×decay 档）远低。 */
const dukePairCache = new Map<string, { add: HTMLCanvasElement; erase: HTMLCanvasElement }>();
const DUKE_PAIR_CACHE_MAX = 160;

export function duke370PremulPair(
  src: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  rect: { sx: number; sy: number; sw: number; sh: number },
  mR: number, mG: number, mB: number, mA: number,
  tag: string,
): { add: HTMLCanvasElement; erase: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  const key = `${tag}|${rect.sx},${rect.sy},${rect.sw},${rect.sh}|${mR}_${mG}_${mB}_${mA}`;
  const hit = dukePairCache.get(key);
  if (hit) return hit;
  if (dukePairCache.size >= DUKE_PAIR_CACHE_MAX) {
    const k0 = dukePairCache.keys().next().value;
    if (k0 !== undefined) dukePairCache.delete(k0);
  }
  const mid = document.createElement('canvas');
  mid.width = rect.sw; mid.height = rect.sh;
  const mc = mid.getContext('2d', { willReadFrequently: true })!;
  mc.drawImage(src, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
  const baked = dustPremulBake(mc.getImageData(0, 0, rect.sw, rect.sh).data, mR, mG, mB, mA);
  const mk = (bytes: Uint8ClampedArray) => {
    const c = document.createElement('canvas');
    c.width = rect.sw; c.height = rect.sh;
    const cc = c.getContext('2d')!;
    const im = cc.createImageData(rect.sw, rect.sh);
    im.data.set(bytes);
    cc.putImageData(im, 0, 0);
    return c;
  };
  const pair = { add: mk(baked.add), erase: mk(baked.erase) };
  dukePairCache.set(key, pair);
  return pair;
}

/** 预乘对两步绘制（'destination-out' 擦 + 'lighter' 叠,dustPremulPair 同式）。
 *  调用方须持 globalAlpha=1（因子已折入 m 四字节）;出口复位 gCO（ga 归调用方管）。 */
export function drawDukePremulPair(
  ctx: Ctx, pair: { add: HTMLCanvasElement; erase: HTMLCanvasElement }, dx: number, dy: number,
): void {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(pair.erase, dx, dy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(pair.add, dx, dy);
  ctx.globalCompositeOperation = 'source-over';
}

/** 染色帧烘焙缓存（key 含 vid/贴图/变体/量化色）。multiply+destination-in。 */
export function dukeBake(
  atlas: SpriteAtlas, texKey: string, tex: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  frame: { sx: number; sy: number; sw: number; sh: number },
  tint: [number, number, number], variant: string,
): HTMLCanvasElement | null {
  if (!dukeBake._cache) dukeBake._cache = new Map<string, HTMLCanvasElement>();
  const q = (v: number) => Math.round(v * 255) & ~15;   // 0-1→0-255 量化 16 步进（ramp 60 值→≤4 桶/通道）
  const key = `${texKey}|${variant}|${q(tint[0])}_${q(tint[1])}_${q(tint[2])}|${frame.sx},${frame.sy},${frame.sw},${frame.sh}`;
  let c = dukeBake._cache.get(key);
  if (c) return c;
  // ★canvas 哨兵案（2026-09-23 猪鲨海实报）：战斗中光照 tint 逐帧变 → key 海量
  //  miss → 缓存无上限增长（哨兵 63-90 张/秒）= 杀后 surface 压力驻留。LRU 上限
  //  （dustPmCacheEvict 同款）：超限逐最旧——被逐键重烘像素确定性相同,零语义。
  if (dukeBake._cache.size >= 512) {
    const k0 = dukeBake._cache.keys().next().value;
    if (k0 !== undefined) dukeBake._cache.delete(k0);
  }
  c = document.createElement('canvas');
  c.width = frame.sw; c.height = frame.sh;
  const tc = c.getContext('2d')!;
  tc.drawImage(tex, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
  tc.globalCompositeOperation = 'multiply';
  tc.fillStyle = `rgb(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)})`;
  tc.fillRect(0, 0, frame.sw, frame.sh);
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(tex, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
  dukeBake._cache.set(key, c);
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace dukeBake {
  export let _cache: Map<string, HTMLCanvasElement> | undefined;
}

/** layer='base'：NPC 贴图拖影+爆发（本体之下,pre-transform 挂点）；
 *  layer='overlay'：370 且 ai0≥4 的 DukeFishron.png 叠层（本体之上,后绘挂点）。
 *  npcColor = 相位染色 dukePhaseTint(e) ?? [255,255,255]（调用方传入）。 */
export function drawDukeAfterimages(
  ctx: Ctx, e: Enemy, atlas: SpriteAtlas,
  frame: { sx: number; sy: number; sw: number; sh: number },
  npcColor: [number, number, number],
  layer: 'base' | 'overlay' = 'base',
): void {
  const vid = e.vanillaId;
  if (vid !== 370 && vid !== 372 && vid !== 373) return;
  const ai0 = e.ai0;
  const s = e.vanillaScale || 1;
  const isDuke = vid === 370;
  if (layer === 'overlay' && !(isDuke && ai0 >= 4)) return;   // :24802 叠层门

  const overlay = layer === 'overlay';
  const tex = overlay
    ? atlas.ensureVImage('vanilla/DukeFishron.png')
    : atlas.ensureVImage(`vanilla/NPC_${vid}.png`);
  if (!tex) return;

  // XNA 颜色链（:24707-24721 基座 / :24806-24812 叠层）：
  //  基座拖影/爆发色 = Lerp(color46, value77, amount11) → GetAlpha → ×段衰减；
  //  color46 在非冲刺态被重赋值为【染色后】npcColor（:24720）；ai0==1 冲刺保
  //  染色前值且 Lerp 目标 = Blue(0,0,255)、量 0.5（:24713-24717,372/373 同款
  //  :24725-24728）——ai0==1 与 ai0>4 互斥,染色前=染色后（等价简化,登记）。
  //  叠层色：color47 = Lerp(White,Yellow,0.5) = (255,255,127)（(int) 戫断）、
  //  value77 = Yellow、amount11 = 1（trail/burst 色恒 = Yellow×k）、本体 = color47。
  const blue = !overlay && ai0 === 1;
  const cr = npcColor[0], cg = npcColor[1], cb = npcColor[2];
  const ghostTint: [number, number, number] = overlay
    ? [1, 1, 0]                                       // Yellow(255,255,0)
    : blue
      ? [cr * 0.5, cg * 0.5, cb * 0.5 + 0.5]          // Lerp(色,Blue,0.5)（登记债:蓝加项）
      : [cr, cg, cb];
  const baked = dukeBake(atlas, overlay ? 'DukeFishron' : `NPC_${vid}`, tex, frame, ghostTint,
    overlay ? 'ov' : blue ? 'blue' : 'n');
  if (!baked) return;

  // 共同变换：本体当前 rotation(e.spin)+flip（:24742 spriteEffects 同源,B1-E10 门）
  const withGhostTransform = (px: number, py: number, draw: () => void): void => {
    ctx.save();
    ctx.translate(px, py);
    if (e.spin) ctx.rotate(e.spin);
    ctx.scale(s * (e.facing > 0 ? -1 : 1), s);
    draw();
    ctx.restore();
  };

  if (!overlay) {
    // ★BJ325:GetAlpha d370 蓝增亮因子（门=ai0≠−1∧<9∧α∈(0,255),372/373 恒 null）
    const boost = duke370GetAlphaBoost(e);
    // ---- ②基座拖影（:24732-24743）：i=1,3,…<num335（步 num336=2）----
    //  原版色链=Lerp(color46,value77,0.5门)→GetAlpha(:24738)→×(num335−i)/15。
    //  GetAlpha 缺省尾=单系数 num;★BJ325:d370 支活时 B 因子=num9 —— 预乘对
    //  cRGB=(num,num,num9)×decay、cA=num×decay（decay 档集 {1/15..9/15} 有界,
    //  m 四字节精确量化;缓存键含 rect+m,LRU 160）。
    const num335 = dukeTrailCount(e);
    const num = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;   // GetAlpha 缺省尾
    for (let i = 1; i < num335; i += 2) {
      if (i >= e.historyDepth()) continue;
      const alpha = num * ((num335 - i) / 15);
      if (alpha <= 0.004) continue;
      const px = e.histXAt(i) + e.w / 2, py = e.histYAt(i) + e.h / 2;
      withGhostTransform(px, py, () => {
        if (boost) {
          const decay = (num335 - i) / 15;
          const mR = Math.round(255 * boost.num * decay);
          const mB = Math.round(255 * boost.num9 * decay);
          const mA = Math.round(255 * boost.num * decay);
          const pair = duke370PremulPair(baked, { sx: 0, sy: 0, sw: frame.sw, sh: frame.sh },
            mR, mR, mB, mA, 'duke370trail');
          if (pair) {
            ctx.globalAlpha = 1;
            drawDukePremulPair(ctx, pair, -frame.sw / 2, -frame.sh / 2);
            return;
          }
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.drawImage(baked, -frame.sw / 2, -frame.sh / 2);
      });
    }
    // ---- ③基座圆周脉冲（:24787-24797）：i=0..5，位=Center+((i/6)2π+rotation)·R·amp ----
    //  GetAlpha(:24792)→×(1−amp)。amp=(1−cos)/3 连续摆动 → m 四字节按 16 步进
    //  量化（&~15,dukeBake 同款;≤15/255 乘数误差作用于 ≤num×1 的爆发鬼影 α 上
    //  =绝对 ≤2%,登记偏差类同染色量化）,否则缓存逐帧打穿=每帧 6×getImageData。
    const [n338, amp, rad] = dukeBurstParams(e);
    for (let i = 0; i < n338; i++) {
      const ang = (i / n338) * Math.PI * 2 + e.spin;
      const px = e.cx + Math.cos(ang) * rad * amp;
      const py = e.cy + Math.sin(ang) * rad * amp;
      withGhostTransform(px, py, () => {
        if (boost) {
          const decay = 1 - amp;
          const q16 = (b: number) => b & ~15;
          const mR = q16(Math.round(255 * boost.num * decay));
          const mB = q16(Math.round(255 * boost.num9 * decay));
          const mA = q16(Math.round(255 * boost.num * decay));
          const pair = duke370PremulPair(baked, { sx: 0, sy: 0, sw: frame.sw, sh: frame.sh },
            mR, mR, mB, mA, 'duke370burst');
          if (pair) {
            ctx.globalAlpha = 1;
            drawDukePremulPair(ctx, pair, -frame.sw / 2, -frame.sh / 2);
            return;
          }
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, num * (1 - amp)));
        ctx.drawImage(baked, -frame.sw / 2, -frame.sh / 2);
      });
    }
    return;
  }

  // ---- ⑤DukeFishron 叠层（:24806-24855）。k 因子（Color×float 乘 RGBA=α 同步衰减）：
  //  ai0==4 → k=(ai2−120)/60 渐显；ai0==12 → 三角脉冲 1−|2·ai2/30−1|；其余 1。 ----
  const ai2 = e.ai2 ?? 0;
  let k = 1;
  if (ai0 === 4) k = (ai2 - 120) / 60;
  else if (ai0 === 12) {
    let t = ai2 / 30;
    if (t > 0.5) t = 1 - t;
    k = 1 - t * 2;
  }
  if (k <= 0) return;
  const num335 = dukeTrailCount(e);
  // 叠层拖影（:24833-24843）：num336 重赋 1 → i=1..num335−1 步 1；【无 GetAlpha】
  // （:24838 仅 ×(num335−i)/15）；色 = Lerp(color47,Yellow,1) = Yellow×k。
  for (let i = 1; i < num335; i += 1) {
    if (i >= e.historyDepth()) continue;
    const alpha = k * ((num335 - i) / 15);
    if (alpha <= 0.004) continue;
    const px = e.histXAt(i) + e.w / 2, py = e.histYAt(i) + e.h / 2;
    withGhostTransform(px, py, () => {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(baked, -frame.sw / 2, -frame.sh / 2);
    });
  }
  // 叠层圆周脉冲（Main.cs:24844-24854）：i=1..num338−1（【1 起】,基座 0 起）；色 =
  // value81 = Lerp(color47,value77,1) = Yellow×k → GetAlpha → ×(1−num339=0.5)。
  // ★BJ342 ND6：GetAlpha A 面 = num5 = newColor.A − alpha（NPC.cs:94557,尾段钳
  // [0,255] :94820-94824）——newColor.A = 255k（Color×float 四通道乘）⇒
  // A = clamp(255k−α)/255,再 ×0.5。旧 k×(1−α/255)×0.5 少扣 α 全额且缺 0 钳,
  // 仅 α>0∧k<1 域发散（隐身渐显期偏亮）
  const [n338] = dukeBurstParams(e);
  const alphaSpawn = Math.min(255, Math.max(e.spawnAlpha, 0));
  for (let i = 1; i < n338; i++) {
    const ang = (i / n338) * Math.PI * 2 + e.spin;
    const px = e.cx + Math.cos(ang) * 10 * 0.5;
    const py = e.cy + Math.sin(ang) * 10 * 0.5;
    withGhostTransform(px, py, () => {
      ctx.globalAlpha = Math.max(0, Math.min(1,
        (Math.max(0, Math.min(255, 255 * k - alphaSpawn)) / 255) * (1 - 0.5)));
      ctx.drawImage(baked, -frame.sw / 2, -frame.sh / 2);
    });
  }
  // 叠层本体（:24855）：色 = color47 = (255,255,127)×k（GetAlpha 不经——α 不随
  // spawnAlpha 衰减,瞬移态本体隐而金光留=原版本相）。k 进 rgb bake（Color×float,
  // ai2<120 时 k<0 的负色域原文字节回绕无定义,本仓 k≤0 早退=同效不可见,登记）。
  const bodyTint: [number, number, number] = [k, k, (127 / 255) * k];   // color47=(255,255,127)×k
  const bakedBody = dukeBake(atlas, 'DukeFishron', tex, frame, bodyTint, 'ovBody');
  if (bakedBody) {
    withGhostTransform(e.cx, e.cy, () => {
      ctx.globalAlpha = 1;
      ctx.drawImage(bakedBody, -frame.sw / 2, -frame.sh / 2);
    });
  }
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
