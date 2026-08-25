// 箭矢/通用直飞·抛物线投射物（原版 Projectile type 1/2、aiStyle 1/2 主干，Projectile.cs:546-566 + AI_001/AI_002）：
// 重力 0.3/tick（aiStyle1/2 通用常量；直飞弹传 0）、timeLeft 1200、旋转 atan2(vy,vx)+π/2（AI_001 尾部 L54877）、
// 原版贴图 Projectile_N.png；命中敌人伤害/击退/暴击（穿透>1 时同敌免疫防连击）；
// 命中 tileCut 砍草/碎罐（Projectile.CutTiles）；命中实心块 1/3 概率回收掉落。
import { Entity } from './Entity';
import { SpriteAtlas, upgradeToBitmap, evictSwCacheEntry } from '../assets/SpriteAtlas';
import { applyProjStatus, applyFrostBurn } from './projStatus';
import { hitCritters, hitPlayer, hitTownNpcs, playerCanHitEnemy, statusPlayer, tryReflectProjectile } from './projTargets';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { trySnapStrike } from '../stats/SnapStrike';
import { canHit, canHitLine } from '../physics/LineOfSight';
import { LIQUID_TYPE } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { PROJ_ALPHA_MOD, type ProjAlphaMod } from '../data/vanillaProjAlpha';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 原版投射物贴图懒加载（Projectile_1.png = 木箭、Projectile_2.png = 燃烧箭，泛用所有 id） */
const spriteCache = new Map<number, ImageBitmap | HTMLImageElement>();
/** 在飞去重 + 失败 10s 冷却(2026-08-19 前把未加载完的 Image 先塞缓存:一次失败
 *  = 坏 Image(width 0)永久驻缓存,该弹幕本会话隐形且无重试——与 ensureVImage
 *  的 TTL 语义对齐;失败顺带驱逐 SW 缓存同路径条目防重吃坏字节) */
const spritePending = new Set<number>();
const spriteFailTtl = new Map<number, number>();
export function projSprite(projId: number): ImageBitmap | HTMLImageElement | null {
  const hit = spriteCache.get(projId);
  if (hit !== undefined) return hit;
  if (typeof Image === 'undefined') return null;
  const at = spriteFailTtl.get(projId);
  if (at !== undefined) {
    if (performance.now() - at > 10_000) spriteFailTtl.delete(projId);
    else return null;
  }
  if (spritePending.has(projId)) return null;
  spritePending.add(projId);
  const im = new Image();
  im.onload = () => {
    spritePending.delete(projId);
    spriteFailTtl.delete(projId);
    // has 门(双重):setProjSpriteOverride(素材包)可能已在飞行期间同步写入——
    // 晚到的原版图/bitmap 不得覆盖包注入图。非 bitmap 环境(node 测试/逃生门)
    // 直接落 Image——upgradeToBitmap 在 USE_BITMAP=false 时两个回调都不调
    const land = (x: ImageBitmap | HTMLImageElement) => { if (!spriteCache.has(projId)) spriteCache.set(projId, x); };
    if (!SpriteAtlas.USE_BITMAP) { land(im); return; }
    upgradeToBitmap(im, land, () => land(im));   // bitmap 失败退 Image
  };
  im.onerror = () => {
    spritePending.delete(projId);
    spriteFailTtl.set(projId, performance.now());
    void evictSwCacheEntry(`vanilla/Projectile_${projId}.png`);
  };
  im.src = `sprites/vanilla/Projectile_${projId}.png`;
  // 同步装载替身(node 测试的 src setter 即触发 onload)当次调用即可用;
  // 浏览器真实 onload 异步,这里仍 null,消费方下帧重查自愈
  const synced = spriteCache.get(projId);
  return synced ?? null;
}

/** 调试报告用:在场弹幕的贴图健康采样(id → 缓存命中/尺寸;cached=false 且
 *  弹幕早已在场=加载链断了,F5 报告一眼定位) */
export function projSpriteHealth(ids: Iterable<number>): Array<{ id: number; cached: boolean; w: number; h: number }> {
  const out: Array<{ id: number; cached: boolean; w: number; h: number }> = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const s = spriteCache.get(id);
    out.push({ id, cached: !!s, w: s?.width ?? 0, h: s?.height ?? 0 });
    if (out.length >= 12) break;
  }
  return out;
}

/** 预热弹幕贴图(2026-08-13,用户报"发射阶段回退兜底,过一会才正确"):
 *  懒加载下首发射击时表未就绪会先画短线兜底。进图/背包变化时把武器/弹药的
 *  shoot 链先 kick 掉(占位即触发加载,缓存 Map 去重),发射时已就绪 */
export function prefetchProjectiles(ids: Iterable<number>): void {
  if (typeof Image === 'undefined') return;
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) continue;
    projSprite(id);
  }
}

/** Main.projFrames（Main.cs:8392 起全 275 条非 1 帧赋值，tools 内联提取）：
 *  未列入的恒 1 帧。投射物贴图是【竖向多帧行】——帧高 = 图高/帧数，
 *  整图绘制会把多帧压成胶片条（史莱姆随从 266 曾 12 帧压成一坨） */
import projFramesJson from '../data/vanilla-projframes.json';
import { projectileData } from '../data/vanillaProjectiles';
import { isGemBolt, type GemStaffFlags, gemDamageMultiplier } from '../data/vanillaGemStaff';
import { projGravSpec } from '../data/vanillaItemCombat';
import { GorePiece } from './GorePiece';
import { MedusaHeadProj } from './MedusaHeadProj';
const PROJ_FRAMES = projFramesJson as Record<string, number>;

/** 网格切片表（Main.cs 逐型特判——竖条 projFrames 模型装不下的多列网格图；
 *  2026-08-23 火绒狐批）。frame 索引【列主序】：col = ⌊frame/rows⌋、row = frame%rows
 *  （两型同式）。cw/ch = 格步距、fw/fh = 帧矩形（可小于步距 = 格内留边）：
 *  · 1094/1113 火绒狐（1457 Main.cs:33734-33737 / 1456 :32844-32848 仅 1094）：
 *    手写矩形 X=(frame/9)*64、Y=(frame%9)*46、62×44——54 帧 = 6 列×9 行。
 *    图 384×1242 仅上部 414px 为本体帧；中带白剪影/下带焰团是喷火粒子特效
 *    （DrawProj_Flamethrower_Foxsparks :35719 Frame(1,7,0,3..5)）采样区,非本体帧。
 *    ★Main.projFrames 无此二型赋值（恒 1）——帧数由本表 cols*rows 供出,勿补 json。
 *  · 1092 图书管理员书（1457 Main.cs:33719-33726 / 1456 :32834-32838）：
 *    Frame(6,9,frame/9,frame%9) = 240×360 整格 40×40（projFrames[1092]=54 与格积一致,
 *    BookProj 帧语义本就是列主序：出生 Next(6)*9+Next(3)）。 */
interface ProjGrid { cols: number; rows: number; cw: number; ch: number; fw: number; fh: number }
const PROJ_GRID: Record<string, ProjGrid> = {
  1094: { cols: 6, rows: 9, cw: 64, ch: 46, fw: 62, fh: 44 },
  1113: { cols: 6, rows: 9, cw: 64, ch: 46, fw: 62, fh: 44 },
  1092: { cols: 6, rows: 9, cw: 40, ch: 40, fw: 40, fh: 40 },
};

export function projFrameCount(projId: number): number {
  const g = PROJ_GRID[String(projId)];
  if (g) return g.cols * g.rows;
  return PROJ_FRAMES[String(projId)] ?? 1;
}

/** 网格帧源矩形（列主序,越界钳末帧;非网格型返回 null）——projFrameImg /
 *  whiteSpriteOf 共用,帧矩形单测亦断言本式 */
export function projGridRect(
  projId: number, frameIdx: number,
): { sx: number; sy: number; sw: number; sh: number; count: number } | null {
  const g = PROJ_GRID[String(projId)];
  if (!g) return null;
  const count = g.cols * g.rows;
  const idx = Math.max(0, Math.min(count - 1, Math.floor(frameIdx)));
  return {
    sx: Math.floor(idx / g.rows) * g.cw,
    sy: (idx % g.rows) * g.ch,
    sw: g.fw, sh: g.fh, count,
  };
}

/** 单帧裁切缓存（id+帧号 → canvas），多帧行按帧高切片 */
const frameCache = new Map<string, HTMLCanvasElement>();
/** 热补丁替换弹幕贴图(2026-08-19 素材重制):写 spriteCache + 清该 id 的
 *  frameCache 条目(键 `id|idx` 不含 texId,不自动失效)。RemasterRuntime 调用。 */
export function setProjSpriteOverride(projId: number, img: ImageBitmap | HTMLImageElement): void {
  spriteCache.set(projId, img);
  const prefix = `${projId}|`;
  for (const k of frameCache.keys()) if (k.startsWith(prefix)) frameCache.delete(k);
}
export function projFrameImg(projId: number, frameIdx: number): HTMLCanvasElement | null {
  const img = projSprite(projId);
  if (!img || !(img.width > 0) || img.width === 0) return null;
  // 网格型（PROJ_GRID）走列主序源矩形；竖条型维持帧高切片
  const grid = projGridRect(projId, frameIdx);
  let sx: number, sy: number, sw: number, sh: number, idx: number;
  if (grid) {
    sx = grid.sx; sy = grid.sy; sw = grid.sw; sh = grid.sh;
    idx = Math.max(0, Math.min(grid.count - 1, Math.floor(frameIdx)));
  } else {
    const frames = projFrameCount(projId);
    idx = Math.max(0, Math.min(frames - 1, frameIdx));
    const fh = img.height / frames;
    if (!Number.isFinite(fh) || fh < 1) return null;
    sx = 0; sy = Math.round(idx * fh); sw = img.width; sh = Math.round(fh);
  }
  const key = `${projId}|${idx}`;
  let c = frameCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  if (frameCache.size > 2048) frameCache.clear();
  frameCache.set(key, c);
  return c;
}

/** R4-32：全白帧缓存（GetAlpha `Color.White*Opacity`,Projectile.cs:80604-80613——
 *  PhoenixQuivered/SeraphNecklaced 箭体纯白绘制）。key = `projId|frame`（-1=整图） */
const whiteSpriteCache = new Map<string, HTMLCanvasElement>();
function whiteSpriteOf(
  projId: number, frameIdx: number,
  src: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
): HTMLCanvasElement | null {
  const w = (src as HTMLImageElement).width ?? (src as ImageBitmap).width;
  const h = (src as HTMLImageElement).height ?? (src as ImageBitmap).height;
  if (!w || !h) return null;
  const key = `${projId}|${frameIdx}`;
  let c = whiteSpriteCache.get(key);
  if (c) return c;
  // 网格型先定切片矩形（帧尺寸 ≠ 整图尺寸,画布须按帧开）;竖条型整图宽 × 帧高
  const grid = frameIdx >= 0 ? projGridRect(projId, frameIdx) : null;
  c = document.createElement('canvas');
  c.width = grid ? grid.sw : w;
  c.height = grid ? grid.sh : h;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  if (grid) {
    cx.drawImage(src as CanvasImageSource, grid.sx, grid.sy, grid.sw, grid.sh, 0, 0, grid.sw, grid.sh);
  } else if (frameIdx >= 0) {
    const fh = h / projFrameCount(projId);
    cx.drawImage(src as CanvasImageSource, 0, Math.round(frameIdx * fh), w, Math.round(fh), 0, 0, w, Math.round(fh));
  } else {
    cx.drawImage(src as CanvasImageSource, 0, 0);
  }
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, w, h);
  if (whiteSpriteCache.size > 512) whiteSpriteCache.clear();
  whiteSpriteCache.set(key, c);
  return c;
}

export interface ArrowOpts {
  /** 重力/tick（aiStyle1/2 = 0.3；直飞魔法弹传 0）。默认 0.3 */
  grav?: number;
  /** 原版 timeLeft（Projectile.cs:526 默认 3600）。缺省读 vanilla-projectiles.json
   *  timeLeft 列（SetDefaults 逐型覆写：小丑箭 5=120 :599 / 诅咒镖 478=300 :5264 /
   *  月总箭 639=90 :6603），再缺省 3600 */
  life?: number;
  /** 穿透次数（原版 penetrate）。缺省读 vanilla-projectiles.json penetrate 列
   *  （SetDefaults 逐型：小丑箭 5=−1 无限 :594 / 邪箭 4=5 :585 / 水晶镖 477=5 :5252 /
   *  月总箭 639=4 :6609），再缺省 1。−1 = 无限穿透（同敌按全局 immune 帧冷却再命中） */
  pierce?: number;
  /** 敌对弹（原版 Projectile.hostile，Damage_EVP :13708 门禁）：
   *  Boss/敌怪发射的弹传 true → 命中玩家结算伤害；玩家武器弹默认 false 不伤玩家。 */
  hostile?: boolean;
  /** aiStyle 14 弹跳弹（希腊火/装饰球等月事件弹幕，Projectile.cs 碰撞反弹
   *  cs:18314-18327 档）：撞实心块法向反弹 ×0.5 衰减而非消亡。 */
  bounce?: boolean;
  /** 1457 宝石法珠特性（GemStaffFeatures，vanillaGemStaff.ts）——Game 侧
   *  PackGemStaffFeatures 打包传入；穿透/穿甲/timeLeft 终值化在 ctor 内做 */
  gem?: GemStaffFlags;
  /** SwirlTwins 孪生弹反相相位（Game 侧第二颗传 1，Player.cs:49924-49926 ai[1]=1；
   *  2026-08-22 补接线——曾 Game 传参但本表未声明、ctor 未消费，孪生弹恒同相） */
  gemPhase?: number;
  /** aiStyle 14 荆棘球档（世纪之花 277，Projectile.cs:18306-18314）：
   *  vx 恒反 ×0.9；仅入撞 |vy|>3 才竖弹 ×0.9（地面滚动语义）。 */
  thornBounce?: boolean;
  /** 延迟重力（AI_001 重力链语义，2026-08-14 对账）：ai[0] 达 gravDelay 的那拍
   *  开始下坠（原版 `ai[0] >= 15f` :54686 ≥ 门，2026-08-22 修 off-by-one——曾
   *  `age > gravDelay` 晚一拍）。默认档 = 15（箭缓坠 +0.1，:54686-54696）；275/276
   *  世纪之花种子 35（g 0.025，:54318-54329）。计数与施加都在 subStep 内 =
   *  per-update（extraUpdates 弹同原版） */
  gravDelay?: number;
  /** 二段重力（686/711 :54640-54659：ai0≥10 后 +0.1，≥20 再 +0.1） */
  grav2?: number;
  grav2At?: number;
  /** 恒定 vx 衰减/update（686/711 ×0.99——与 drag 不同：不挂重力门） */
  dragAlways?: number;
  /** 专家追踪（275/276/277 共用模式，Projectile.cs:54330-54345/:23307-23316）：
   *  每 tick v=(v*(weight-1)+dirToPlayer*speed)/weight，速度 <floor 归一到 floor
   *  （277 用 cap：>cap 归一到 cap）。spawn 侧仅在专家模式注入。 */
  homing?: { speed: number; weight: number; floor?: number; cap?: number; axis?: 'x' | 'y' };
  /** 电圈发射器导弹 442（aiStyle 1 + AI_001 type 段 :55689-55740）：锁定格
   *  （原版 ai[0]/[1] = tileTargetX/Y = 发射时刻鼠标格，Player.cs:49905-49908 写入、
   *  :25586-25604 钳 [5, maxTiles−5]）。★直线飞向锁定点（无逐帧转向——AI 段无
   *  velocity 修正式，"追踪"观感 = ≤16px 到点即 Kill :55704-55710），非朝点 homing。 */
  aimPoint?: { tx: number; ty: number };
  /** 原版 Projectile.extraUpdates（Projectile.cs:15331-15336 numUpdates 循环）：
   *  每逻辑帧把整段 AI/位移/碰撞/命中多跑 N 次——弹速视觉上 ×(N+1)，timeLeft
   *  同步按子步消耗（:15861 在循环内）。83 眼激光 SetDefaults=2（:1369）。 */
  extraUpdates?: number;
  /** X 轴空气阻力/tick（aiStyle 2 投掷族默认档 ×0.97，Projectile.cs:21969） */
  drag?: number;
  /** 终端下落速度（框架默认 16；aiStyle 2 投掷档 32，Projectile.cs:21973-21977） */
  maxFall?: number;
  /** 翻滚旋转（aiStyle 2 刀族：重力期内 rotation += (|vx|+|vy|)*0.03*dir，
   *  Projectile.cs:21508；前 gravDelay tick 保持 atan2 姿态 :21971-21972） */
  tumble?: boolean;
  /** 平飞期姿态锁定（48/54/93/520/599 前 20t atan2 姿态） */
  tumblePoseLock?: boolean;
  /** 泰拉刃光束 985（aiStyle 191，Player.cs:48316 出生注入）：
   *  ai[0]=朝向±1 / ai[1]=18（寿命=ai1+25=43t）/ ai[2]=物品 scale。
   *  淡入 ai1×0.5=9t、末 12t 淡出；34t 后 damage=0（纯视觉尾段）；减速 >8 档
   *  仅初速 >8 时激活（正牌出生速=瞄准向×5 恒不触发——973 甩剑才用） */
  terra?: { ai0: number; ai1: number; ai2: number };
  /** 星怒剑 503（aiStyle 5 :22139-22157）：targetY=目标线（鼠标 Y 与玩家
   *  cy−200 取小）；线上方穿墙/alpha 渐显钳 150，线下开始撞块 */
  star?: { targetY: number };
  /** 食人鱼 190（aiStyle 39，1156 食人鱼枪，GAP G3 行为层）：非空 = 走
   *  piranhaStep 独占状态机（直飞咬敌 → 咬住周期撕咬 → 松手返回回收），
   *  通用 subStep 的重力/撞块消亡/穿透递减语义不适用 */
  piranha?: PiranhaCtl;
  /** 原版 Projectile.tileCollide=false（SetDefaults 逐型；月事件 325/329/348/350/351
   *  等）：跳过撞块消亡/反弹与 CutTiles——HandleMovement 整段不跑（Projectile.cs:15331
   *  位移段门）。缺省按 projectileData(projId).tileCollide === false 自动置位。 */
  noTileCollide?: boolean;
  /** 329 焰镰（aiStyle 56，Projectile.cs:27666-27687）：出生继承发射者 rotation（ai[0]）
   *  与 spriteDirection（-ai[1]）；|vx|+|vy|<16 时速度 ×1.05/t 自加速（曾丢 = 低速
   *  慢速弹报废），rotation += (|vx|+|vy|)*0.025*direction 恒旋。 */
  scythe?: { rot0: number; flipDir: number };
  /** 270 骷髅王髅骨（Projectile.cs:53192-53213）：ai1 30-110 窗口向最近玩家
   *  转向（(v*24+dir*spd)/25 保速）；速 <18 ×1.02/t 自加速；每帧 5 号尘尾迹。 */
  skullBone?: boolean;
  /** 351 礼盒（aiStyle 58，Projectile.cs:27727-27757）：两段重力——前 30t 平飞，
   *  之后 vy+0.1；一旦 vy>=0 转二段（恒 +0.1 钳 3、vx×0.99）；帧 0/1 随段切换。 */
  present?: boolean;
  /** 452 月总幻影矢（aiStyle 82，Projectile.cs:30119-30195）：三段弹道独占速度链——
   *  0 段 45t 弧线上升 + 1 段 90t 反向弧线（vx = velocity.RotatedBy(ai1).X 钳 ±6、
   *  vy−0.08/下坠再 −0.2、钳 −7）→ 2 段 14 速追踪玩家（Lerp(v,dir·14,0.6) 后目标
   *  vy 钳 ≥6、逐轴 0.4 步进；距玩家 <30 消亡触发 Game 爆炸钩）；alpha 255−40/t
   *  渐显、<40 出尘 229。spin = 出生 ai[1] 弧线弯转角（发射点 :37332/:38558 掷
   *  随机 ±π/30 + π/180·side，1 段末取反）。grav 须传 0。 */
  phantasm?: { spin: number };
  /** 454 月总幻影能量球（aiStyle 83，Projectile.cs:30236-30282）：ai0<30 附
   *  ownerId（手/真眼）随行（位置=主心−尺寸/2−v）→ ≥30 减速 ×0.96 列队（帧
   *  0/1 每 6t 切）→ 外部齐射指令置 ai0=−1（帧 1+extraUpdates 1，velocity 由
   *  发射点统一给定 12 速，见 volleyPhantomOrbs）。tileCollide=false（数据表）。 */
  phantomOrb?: { ownerId: number; ai0?: number };
  /** 92 坠星（aiStyle 5 :22152-22156 + Kill 91/92 共段 :72260-72283，圣箭 516
   *  Kill 链）：lineY = ai[1] 命中线（弹顶越过该线才恢复撞块——出生在命中点上空
   *  600-900px，先穿墙直飞再落地）；gen = ai[0]（1 = 圣箭直系，消亡时可再链一代，
   *  孙代 ai[0]=0 恒不再链）。grav 须 0（aiStyle 5 无重力，速度由 Kill 给定 22）。 */
  starFall?: { lineY: number; gen?: number };
  /** 1021 月总巨砾（aiStyle 25，Projectile.cs:24685-24712 物理段 + 弹地
   *  :17578-17600）：重力 0.06/终端 16、|vy|≤1 地面滚动加速 vx ±0.025 至 ±3.5、
   *  rotation += vx·0.06；Y 撞 vy>4 反弹 ×−0.9 + Dig 音/尘，轻落（0<vy≤4）置
   *  rest 标；X 撞反弹 ×−0.75 计 3 次，超次消亡。grav 须传 0.06。 */
  mlBoulder?: boolean;
  /** 448 火星飞碟火炮弹（aiStyle 80，Projectile.cs:29801-29890）：ai1 引信 20t
   *  倒数 → 点火加速 +4（8→12）+ 8 尘爆 + 锁定最近玩家 + tileCollide=true →
   *  点火后 [0,30) 逐 t 20% 角度转向玩家 → 180t 自毁；距玩家 ≤42 或撞块 =
   *  Kill 爆炸（判定盒外扩 112×112 重结算 + Item14，:70544-70580）。 */
  martianRocket?: boolean;
  /** 出生预置同敌局部免疫（Projectile.localNPCImmunity[npc]=N 出生直写——花瓣
   *  1038 SpawnFlowerExplosionOn 1456 :23 预置 30t：花瓣自被 proc 目标体内出生,
   *  30t 内不得命中目标本体,飞出后才可伤及；1457 重制版 :32 同款保留）。与
   *  localNPCHitCooldown（命中后写档,数据列驱动）独立：本表项只在出生时写入 */
  localImmuneSeed?: { npcId: number; t: number };
  /** 荆棘链段 ai[1]（Vilethorn 7/8、Nettle Burst 150/151/152——aiStyle 4）：
   *  武器首发不传（=0），链生子段传父段递增后的 ai[1]。消费见 THORN_CHAIN_PROJS 支 */
  thornChainAi1?: number;
}

/** 食人鱼控制面（Game 注入，同 PrismProj channelCb/aimCb 模式） */
export interface PiranhaCtl {
  /** Player.channel 电平（按住=持续咬；松手 → ai[0]=1 返回 + ai[1]=−1 禁再咬，
   *  Projectile.cs:26093-26096）。附带 heldItem/死亡门（同 FlailProj 回调先例） */
  channel: () => boolean;
  /** 当前瞄准点（世界坐标）——回收补弹的出生方向（ItemCheck_Shoot num4/num5） */
  aim: () => { x: number; y: number };
}

/** 食人鱼常量（SetDefaults Projectile.cs:2509-2520：22×22 aiStyle 39 /
 *  penetrate −1 / ranged / timeLeft 走通用默认 3600 :526 /
 *  usesLocalNPCImmunity + localNPCHitCooldown = 14 :2520-2521） */
export const PIRANHA_PROJ = 190;
export const PIRANHA_LIFE = 3600;
export const PIRANHA_HIT_CD = 14;

/** 食人鱼咬住/搜敌目标最小面（Enemy 满足） */
interface PiranhaTarget {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number;
  vx: number; vy: number;
  id: number;
  hp: number;
  dead: boolean;
  dontTakeDamage?: boolean;
  iframes?: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks,
    pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean;
  def?: { hitSound?: string[] };
  hemorrhageT?: number;
}

/** extraUpdates：已并入 vanilla-projectiles.json（tools/extract-projectiles.mjs
 *  NUM_FIELDS 提取，249 款非 0；83 眼激光=2 等原先手工条目同源于 SetDefaults） */

/** 旋转模式（scripts/_projrot-audit.mjs 对 AI_001 type 链逐分支提取 + 非 aiStyle1
 *  特例）：默认 'up' = 贴图朝上（AI_001 尾部默认 atan2+π/2，:54877——箭/子弹）；
 *  下表 = 贴图【朝右】的弹型（rotation=atan2(vy,vx)，向左运动时按原版
 *  spriteDirection 水平镜像，食人鱼 AI 即 :26122-26140 模式）：
 *  16 魔法飞弹头（113 Magic Missile，AI_009 :54039 ToRotation；54×54 方图头朝右）、
 *  34 Flamelash 火鞭（218，AI_020 族 ToRotation；48×384 八帧行按帧行切片）、
 *  190 食人鱼（aiStyle 39，1156 食人鱼枪；曾恒 +π/2 → 鱼 90° 侧翻）、
 *  837（AI_001 显式 MIRROR 分支 :54715，1313 骷髅头法书 shoot）、
 *  1023（AI_001 仅 wiggle :54743，基姿态 0 朝右，5460 发射器） */
const PROJ_ROT_RIGHT = new Set([16, 34, 190, 837, 1023, 485]);

/** aiStyle 27 剑气族（AI_027 尾部 :24858-24861：rotation = atan2(vy,vx) + 0.785
 *  = 速度角 + 45°，斜向剑气贴图）——曾走默认 +π/2 恒偏 45°（用户报"附魔剑
 *  光束角度偏"）。成员：114 邪恶三叉戟弹(683)/115 敌侧/116 光束剑波(723)/
 *  132 泰拉刃波/156 光束/173 附魔剑波(989)。例外 157 夜波=direction×0.4 旋转体
 *  （1.4.5 已无武器射出，未移植登记） */
const PROJ_ROT_DIAG = new Set([114, 115, 116, 132, 156, 173, 660, 451]);   // 451 涌流剑 rotation=vel+π/4（:31594/:31636）
export { PROJ_ROT_DIAG };

/** 恒旋族（AI_001 尾链 :54741-54749/:54822-54825：rotation 每帧累加、不对齐速度）：
 *  312 南瓜灯 += vx*0.02；772 晶洞 += sign(vx)·(|vx|+|vy|)·0.05；
 *  94 水晶风暴 += vx*0.2（AI_024 :24305）/ 95 诅咒之焰 += 0.3×direction
 *  （AI_008 :22659-22662，aiStyle8 自动换向 :15675→direction=sign(vx)）/
 *  424 流星弹 += vx*2（AI_001 type 段 :54159）/
 *  90 水晶碎块 += vx*0.2（AI_024 同款 :24305，515 水晶子弹 Kill 碎片）/
 *  92 坠星 += sign(vx)·(|vx|+|vy|)·0.01（aiStyle5 尾链 :22241-22245，direction=sign(vx)）。
 *  R27：27 水矢/45 恶魔镰刀 += 0.3/0.8×direction（AI_008 尾 :24636 / AI_018 :25781，
 *  direction=AutomaticallyChangesDirection 按 sign(vx) 每 update 刷新 :17122-17132/
 *  :17388——aiStyle18 不在豁免表；v.x==0 时 direction 保持原值，本仓取 ||1 兜底）。
 *  同链其余（248 花瓣/483 种子/532 骨手套/675 黑法师弹/921·926·937）无武器可达。 */
const PROJ_SPIN: Record<number, (a: Arrow) => number> = {
  312: a => a.vx * 0.02,
  772: a => Math.sign(a.vx) * (Math.abs(a.vx) + Math.abs(a.vy)) * 0.05,
  94: a => a.vx * 0.2,
  95: a => 0.3 * (a.vx < 0 ? -1 : 1),
  27: a => 0.3 * Math.sign(a.vx || 1),          // 水矢自旋（AI_008 :24636）
  45: a => 0.8 * Math.sign(a.vx || 1),          // 恶魔镰刀快自旋（AI_018 :25781）
  1114: a => a.vx * 0.2,                                             // 日耀花弹（AI_024 :26285 rotation += vx×0.2 全族）
  424: a => a.vx * 2,
  90: a => a.vx * 0.2,
  92: a => Math.sign(a.vx || 1) * (Math.abs(a.vx) + Math.abs(a.vy)) * 0.01,
  // 617 星璇秘术（aiStyle 118 :35295/:35301/:35350/:35358）：恒 rotation −= π/30，
  // 快速段 ai[0]≥30 追加 −= π/180（慢速段无追加）
  617: a => -(Math.PI / 30) - (Math.hypot(a.vx, a.vy) > 4 && a.na617Ai0 >= 30 ? Math.PI / 180 : 0),
  // 沙球族（AI_010 尾链 :55149-55154 非 736-738 支）：rotation += 0.1/update 恒滚
  42: () => 0.1, 65: () => 0.1, 68: () => 0.1, 354: () => 0.1,
  // ★R28：aiStyle8 火之花 15 / 冰之花 253（AI_008 尾 :24640-24642 `rotation +=
  //   0.3f*direction`，direction=AutomaticallyChangesDirection 按 sign(vx) 刷新
  //   :17122/:17388——aiStyle8 不在豁免表）；510 毒液瓶（aiStyle2 type 支
  //   :23465-23467 `rotation += |vx|*0.04*direction`——翻滚投掷姿态）
  15: a => 0.3 * Math.sign(a.vx || 1),
  253: a => 0.3 * Math.sign(a.vx || 1),
  510: a => Math.abs(a.vx) * 0.04 * Math.sign(a.vx || 1),
  // 511-513 毒云：rotation 由 AI 分支全权维护（相位+t×2π/480）,表项仅接通 spinRot 消费
  511: () => 0,
  512: () => 0,
  513: () => 0,
  // ★R29 星星炮族自旋（AI_005 通用尾 :24216-24221 `rotation += (|vx|+|vy|)×0.01×
  // direction`——direction=sign(vx);AI_151_SuperStar :22346 同式 ×0.005。
  // ★红队 §8"rotation+=0.3×direction"系数系误记,按源码 (|vx|+|vy|) 式落表）
  955: a => (Math.abs(a.vx) + Math.abs(a.vy)) * 0.01 * Math.sign(a.vx || 1),
  728: a => (Math.abs(a.vx) + Math.abs(a.vy)) * 0.005 * Math.sign(a.vx || 1),
  // 131 蘑菇孢子云（AI_030 default 支 :27152 rotation += 0.2 恒旋——伴生弹支 AI 侧
  //  只管速度/alpha,旋转走本表）
  131: () => 0.2,
};

/** 沙球族（aiStyle 10，沙枪 266 弹）：42 沙 / 65 黑檀 / 68 猩红 / 354 化石
 *  （PickAmmo :52666-52678 换弹产物；物理档 AI_010 :54890-55160，见 subStep
 *  sandBall 支；Kill 落地放块走 Game.onProjectileDeath 42/65/68/354 分支） */
const SAND_BALL_PROJ = new Set([42, 65, 68, 354]);
/** AI_010 途经破坏表（:55114-55120）：草族/装饰/雕像/宝石——KillTile 全语义 */
const SAND_BALL_CUT_SHEETS = new Set([185, 186, 187, 165, 12, 665, 639, 105, 178]);

/** 信号枪族（aiStyle 33，AI_033 Projectile.cs:27425-27498）：163 信号弹（信号枪
 *  930）/310（5378 前身彩蛋弹）/1008（探矿信号弹）/1009 诅咒信号弹（5378 诅咒
 *  信号弹，PickAmmo 弹药 931 同槽换弹）/1010/1011。SetDefaults 同构：6×6 盒、
 *  penetrate −1、alpha 255（渐显）、timeLeft 36000（163 :2517-2526 / 1009 :9592-9601） */
const FLARE_PROJS = new Set([163, 310, 1008, 1009, 1010, 1011]);
/** AI_033 尘尾型号表（:27446-27464 switch(type)）：alpha<70 期每 update 一枚 */
const FLARE_DUST: Record<number, number> = { 163: 127, 310: 187, 1008: 169, 1009: 75, 1010: 66, 1011: 310 };

/** SetDefaults alpha 初值（Projectile.alpha，逐型直写；GetAlpha :75940 消费）。
 *  仅接本批消费 id（提取器 NUM_FIELDS 未含 alpha，登记）：未列 = 0 全显。
 *  5 小丑箭 100(:599，GetAlpha :76579 固定 (255,255,255,0) 不消费——登记)/
 *  94 水晶风暴 50(:1516，GetAlpha :76322 固定 (200,200,200,25) 同不消费)/
 *  95 诅咒之焰 100(:1527，同 94)/280 黄金雨 255(:3402)/477 水晶镖 255(:5250)/
 *  478 诅咒镖 255(:5260)/521 水晶脉冲 255(:5637)/639 月总箭 255(:6608)/
 *  932 仙王射弹 0(:8571)/
 *  207 叶绿弹 255(:2680-2691，AI −25/t 渐显 :53937-53943)/837 骷髅头法书弹
 *  255(:7842-7851，同段消费)/92 坠星 0 起 aiStyle5 通用闪烁档（:22222-22238
 *  alpha ±25/t 在 0..200 间振荡 = 星光闪烁） */
/** GetAlpha=(200,200,200,25) 加算族（Projectile.cs:81007——15 火球/34 火焰鞭/93 魔法
 *  匕首/94 水晶风暴/95 诅咒之焰/96 敌诅咒火/1114 日耀花/253 霜球/258 火球/102 Prime
 *  炸弹）：XNA AlphaBlend=预乘语义,RGB 全额加算 A 只衰背景=发光观感。canvas 'lighter'
 *  复刻（2026-08-24 清零批,source-over 直译=半透灰） */
const ADDITIVE_GLOW_PROJS = new Set([15, 34, 93, 94, 95, 96, 1114, 253, 258, 102,
  876]);   // R27：zapinator（GetAlpha :81458-81464 (255−alpha) 白 A=0 = 加算白光渐显）
const PROJ_ALPHA0: Record<number, number> = {
  5: 100, 94: 50, 95: 100, 280: 255, 477: 255, 478: 255, 521: 255, 639: 255, 932: 0,
  207: 255, 837: 255,
  // R27：22 水花权杖 alpha=255(:1048)/27 水矢 alpha=255(:1103)+timeLeft/=2=1800(:1104)/
  // 45 恶魔镰刀 alpha=100(:1289，GetAlpha :81468 恒 White 不消费——存真值备案)/
  // 7/8/150/151/152 荆棘链 alpha=255(:884/:2408，aiStyle4 渐显期 −50[/−75]/update 消费)
  22: 255, 27: 255, 45: 100,
  410: 255,                                                          // 泡泡枪泡体（:4926 alpha=255,ai72 −25/t 渐显钳 50）
  7: 255, 8: 255, 150: 255, 151: 255, 152: 255,
  876: 255,                                                          // 灰/橙 zapinator（:8426）
  // ★R28：294 暗影束（SetDefaults :3840-3849 alpha 无显式行——aiStyle48 AI 支
  // :28640-28644 `alpha = 255` 每 update 直写）/ 295 地狱火叉弹（aiStyle50
  // SetDefaults alpha=255 :3851-3870 区段）/ 296 火柱爆区（同段）/
  // 535 美杜莎之首（SetDefaults :6096-6108 无 alpha 行但本体常驻玩家头部,
  // GetAlpha 缺省路径不消费——本仓转换成专用类前的一帧兜底）
  294: 255, 295: 255, 296: 255, 535: 255,

  // ★R29：631 幻象矢（SetDefaults :6783-6792 alpha=255 渐显,AI_122 −15/t 消费）/
  // 661 黑爆弹（:7110-7122 alpha=255,AI −55/t 渐显+scale1.3）/ 819 血箭（:7997-8006
  // alpha=255+hide 隐形弹体,DrawProj −20/t 渐显,视觉=血迹拖尾）/ 955 星星炮星
  // （:9015-9024 alpha=50 起 AI_005 通用闪烁档 0↔200 ±25/t）/ 728 超级星星炮星
  //（:7661-7672 alpha=255,AI_151 −10/t 钳 100）
  631: 255, 661: 255, 819: 255, 955: 50, 728: 255,
  // ★R29：469 蜂箭（SetDefaults :5437-5446 alpha=255——AI :56164 localAI>2 后
  // −50/update 渐显;此前缺列 = 蜂箭出生即全显,渐显链无起点）
  469: 255,

  114: 255,                                                          // 邪恶三叉戟（:2031；AI 侧按速度 Remap 改写 :26794）
  163: 255, 310: 255, 1008: 255, 1009: 255, 1010: 255, 1011: 255,   // 信号枪族（163 :2523 等）
  514: 255,                                                          // 钉（aiStyle 93 −25/t 渐显 :33427-33434）
  246: 255,                                                          // 刺炮弹（−20/t 渐显 :58106-58110）
  311: 255,                                                          // 糖果玉米（−50/t 渐显 :58117-58123）
  442: 255,                                                          // 电圈导弹（−90/4t 渐显 :55691-55703，AI 段消费）
  451: 255,                                                          // 涌流剑（SetDefaults alpha=255 :5237；飞行期 0↔75 脉动 :31620-31640）
  617: 255,                                                          // 星璇秘术（SetDefaults alpha=255 :7106-7116；−15/t 渐显 :35290-35295）
  181: 255, 189: 255, 307: 255, 316: 255, 566: 255,                  // aiStyle 36 蜂族（−50/update 渐显 :27690-27697）
  616: 255,                                                          // 星旋涡旋弹（−25/t 渐显 :58378-58384）
  297: 255,                                                          // 幽灵法杖弹（SetDefaults :5685-5695 alpha=255，AI 不消费恒全显）
  659: 255,                                                          // 灵魂之焰（SetDefaults :8571-8580 alpha=255，−12/t 渐显 :36901-36903）
};

/** usesIDStaticNPCImmunity 共享免疫表（全场同型一张表,非每弹一张）：
 *  376 小鬼火球 cooldown 6t（SetDefaults :4612-4615）/ 604 孢子云 cooldown 10t
 *  （:6081-6082）——蓝队 R7-24：376 曾走逐弹 hitSet（N 只同拍对同敌 N 连击）。
 *  墙钟实现（窗口 ≤10t=167ms 短,暂停/掉帧偏移可忽略;惰性过期,>512 项时清扫） */
const ID_STATIC_TABLES = new Map<number, Map<number, number>>();   // projType → (enemyId → 到期 ms)
function idStaticCheck(projId: number, enemyId: number, cooldownMs: number): boolean {
  let m = ID_STATIC_TABLES.get(projId);
  if (!m) { m = new Map(); ID_STATIC_TABLES.set(projId, m); }
  const now = Date.now();
  if ((m.get(enemyId) ?? 0) > now) return false;
  m.set(enemyId, now + cooldownMs);
  if (m.size > 512) {
    for (const [k, v] of m) if (v <= now) m.delete(k);
  }
  return true;
}

/** 直立族：521 水晶脉冲/79 彩虹光弹。★R27 勘误：宝石法杖弹 121-126/597 曾被误入本表——
 *  原注释引"aiStyle 29 全链零 rotation 赋值"与源码不符，AI_029_GemStaffs_ActuallyGemStaffs
 *  尾部显式 **rotation = velocity.ToRotation()**（1457:38644 / 1458:38691）——宝石珠顺
 *  速度向摆放，已移出（红队 R27 §1 P1）。521 同为 aiStyle 29 也应旋转（同函数尾行），
 *  但其贴图/消费面未在本批核对面，暂留原状登记；79 由 MissileProj 独立绘制不经本表 */
const PROJ_NO_ROT = new Set([521, 79]);
export { PROJ_NO_ROT };
export { PROJ_ROT_RIGHT };

/** 速度向直置族（R27）：宝石法珠弹 121-126/597——AI_029 尾 rotation =
 *  velocity.ToRotation()（1457:38644/1458:38691）且无 spriteDirection 翻转
 *  （DrawProj :33667-33678 只消费 num341=rotation + dir 缺省）→ 绘制角 = 速度角本身,
 *  无 ±π/2 偏移、无水平镜像 */
const PROJ_ROT_ASIS = new Set([121, 122, 123, 124, 125, 126, 597, 732]);   // 732 风暴气旋 rotation=velocity.ToRotation()（AI_044 :28317）
export { PROJ_ROT_ASIS };

/** 子弹消亡火花音族（★R29：Projectile.Kill :77624-77625 列表直抄——Collision.HitTiles
 *  +SoundID.Item10；1458 列表含 389。消费面：Arrow 实心块路径 HitTiles 近似尘 +
 *  Game.onProjectileDeath Item_10 音）。放 Arrow.ts 供两侧共用（Game 反向 import） */
export const BULLET_KILL_SFX = new Set([14, 20, 88, 36, 83, 84, 389, 104, 279, 100, 110,
  180, 207, 357, 242, 302, 257, 259, 285, 287, 576, 577, 876, 968]);

/** 荆棘链族（Vilethorn 7/8 + Nettle Burst 150/151/152，aiStyle 4，红队 R27 §10/§11）：
 *  UpdatePosition 对 aiStyle==4 整体早退（Projectile.cs:20552）= 链段【全程静止】；
 *  AI_004 :23943-24080 状态机：alpha −50(/−75 nettle)/update 渐显期不动 → 归零转 ai[0]=1
 *  并链生子段（position+velocity+(w/2,h/2) 处、同速度、damage 同值、ai[1]+1；type7 在
 *  ai[1]≥6 后升 type8 尾刺 / 150↔151 每节翻转、ai[1]≥10 且 type151 → 152 尾端）；淡出期
 *  alpha += 5(nettle 3) 至 ≥255 Kill（无声无尘）。出生音 Item8 于 localAI[0]==0 门播一次。
 *  ctor 按 THORN_CHAIN_PROJS 自动置位（同 sandBall/flare 先例），thornChainAi1 注入段号 */
const THORN_CHAIN_PROJS = new Set([7, 8, 150, 151, 152]);

/** ★R29 幻象弓 630 载体控制面（Game 注入,同 PiranhaCtl 模式）：
 *  volley() = Game.phantasmPickAmmo 等价（每轮现解析弹药:弹型/伤/kb/速终值+耗弹掷;
 *  null = 无弹药 → 载体 Kill）;channel() = player.channel 电平近似（按住+未阻挡+
 *  仍持本武器）;aim() = Main.MouseWorld 等价（世界坐标瞄准点） */
export interface Phantasm630Ctl {
  channel(): boolean;
  aim(): { x: number; y: number };
  volley(): { pid: number; dmg: number; kb: number; speed: number } | null;
}

export class Arrow extends Entity {
  w = 10; h = 10; // 原版 SetDefaults type 1：width/height = 10；构造器按弹型覆写
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  /** 原版投射物类型（1=木箭 2=燃烧箭，PickAmmo projToShoot = ammo.shoot） */
  projId: number;
  /** 绘制 scale（SetDefaults scale 字段；绘制尺寸 = 贴图原生 × scale，
   *  与判定盒 w/h 无关——子弹 14 是 2×20 曳光条 × 1.2，曾误画成 10×100） */
  drawScale = 1;
  /** 回收掉落的 item key（null = 不回收，如燃烧箭） */
  dropKey: string | null;
  grav: number;
  life: number;
  pierce: number;
  /** 发射时 maxPenetrate（穿透判定用——剩 1 的穿透弹仍是穿透语义,Projectile.cs:11904） */
  pierceInit: number;
  /** 敌对弹（原版 Projectile.hostile）：命中玩家结算（Damage_EVP 语义） */
  hostile: boolean;
  /** 随从/哨兵射出的弹（ProjectileID.Sets.MinionShot/SentryShot 语义：吃鞭 tag） */
  whipTagShot = false;
  /** 命中施加 OnFire 300t（1106 火舌 :11002-11004） */
  ignite = false;
  /** 命中施加地狱火 OnFire3(323) 300-600t（1097 生成侧 ai[1]>0 档 :11315-11318——
   *  1113 可靠的火绒狐射弹 ai[1]=3/1 全地狱火，与 1094 的 OnFire(24) 档区分） */
  igniteHellfire = false;
  /** 暴击加成（百分点，spawn 侧注入：player.critChance(kind)+item.crit；基 4% 另计。
   *  审计 §6：此前硬编码 4% 导致远程/魔法/投掷吃不到装备/套装/词缀/item.crit */
  critBonus = 0;
  /** 暴击总概率阈值（0-1，spawn 侧一次性算好；未设=按 critBonus+4%） */
  critChance = 0;
  /** 护甲穿透（玩家侧：spawn 注入 equipStats.armorPen+词缀 arpen，=原版
   *  GetArmorPenetration(melee)（Player.cs:4170-4177）；弹幕自带份见 settlePen） */
  armorPen = 0;
  /** 结算穿甲 = 玩家侧 armorPen + 本型号 armorPenetration（Projectile.cs SetDefaults
   *  逐型直写,25 款非 0——StrikeNPC :12068 num3 两源相加后再入
   *  NPC.checkArmorPenetration :81913 单池；独立字段,不与 Ichor 混算） */
  private get settlePen(): number {
    return this.armorPen + (projectileData(this.projId)?.armorPenetration ?? 0);
  }
  /** 星云套 booster 回调（StrikeNPC :12892-12905：魔法弹命中 → Game 判定掉落） */
  nebulaCb: (() => void) | null = null;
  /** aiStyle 14 弹跳：撞块反弹不消亡 */
  bounce: boolean;
  /** 冰霜盔甲引擎资格（ranged 弹 true;魔法/召唤弹 false——原版 melee||ranged 门） */
  frostEligible = false;
  /** aiStyle 14 荆棘球档（277）：撞块按 Projectile.cs:18306-18314 反弹 */
  thornBounce: boolean;
  skullBoneT = 0;   // ai[1] 计数（270 转向窗口）
  /** 延迟重力（AI_001 链）：age（update 计）超过此值才施加 grav；-1=不延迟 */
  gravDelay: number;
  /** 二段重力（686/711）：age 超过 grav2At 再加 grav2；0=无 */
  grav2: number;
  grav2At: number;
  /** 恒定 vx 衰减/update（0=无；686/711 0.99——不挂重力门） */
  dragAlways: number;
  /** 410 泡体 scale（ai[1]=rand(60,121)/100,首拍掷定——AI_072 :30954 盒 14×14×scale） */
  bubbleScale = 0;
  /** 167-170 烟花 ai[1]=1=发射器档（AI_034 :30xxx 出膛尘花+尾迹;0=无） */
  launcherFirework = 0;
  /** 烟花 ai[0]（AI_034 发射器档计数） */
  private fwAi0 = 0;
  /** 专家追踪参数（null=无） */
  homing: { speed: number; weight: number; floor?: number; cap?: number; axis?: 'x' | 'y' } | null;
  /** 电圈导弹 442 锁定格（ai[0]/[1]，tile 坐标；null=非锁定弹）——subStepAI 442 段消费 */
  aimPt: { tx: number; ty: number } | null = null;
  /** localAI[0]（:55691-55703 渐显计数 + alpha==0 后 :55716 尘环节拍复用同槽） */
  private aimCnt = 0;
  /** localAI[1]（:55708-55712 alpha==0 后 120t 超时计数） */
  private aimLife = 0;
  /** 原版 Projectile.extraUpdates：每帧额外子步数（0=普通 1 步） */
  extraUpdates: number;
  /** X 轴空气阻力/tick（1=无；投掷族 0.97） */
  drag: number;
  /** 终端下落速度（缺省 16） */
  maxFall: number;
  /** 翻滚旋转（aiStyle 2 刀族重力期） */
  tumble: boolean;
  /** 平飞期姿态锁定（48/54/93/520/599 前 20t atan2 姿态，Projectile.cs:21971-21972） */
  tumblePoseLock: boolean;
  /** 翻滚累积角（tumble 专用，勿与 Enemy.spin 混） */
  tumbleRot = 0;
  /** 恒旋累积角（PROJ_SPIN 族：312 南瓜灯/772 晶洞，AI_001 :54741/:54824） */
  spinRot = 0;
  /** 已存活 tick（延迟重力/追踪门用） */
  age = 0;
  /** 原版 Projectile.alpha（SetDefaults 逐型初值 PROJ_ALPHA0；AI 侧逐型衰减、
   *  draw 侧 GetAlpha 近似消费——修复4 alpha 通道） */
  alpha = 0;
  /** aiStyle 专属计数（94 水晶风暴 ai[1] 缩径倒计时 / 95 诅咒之焰 ai[1] 重力门 /
   *  280 黄金雨 ai[0] 重力门——每弹仅一个 aiStyle，恒不复用） */
  private aiCnt = 0;
  // ---- 大地法杖巨石 261（AI_014 type 段 :18235/:12745）专属态 ----
  /** 慢速死亡门：|v|<1.5 消亡 */
  boulder = false;
  // ---- 飞龙剑气 684（AI_001 type 段 :52086-52098）专属态 ----
  /** SetDefaults alpha=255（:7021）→ AI 每帧 −40 渐显 */
  dragonFade = false;
  dragonAlpha = 255;
  /** 711 双足翼龙弹：命中 Betsy's Curse(203) 600t（:10719-10721） */
  betsyCurse = false;
  // ---- 泰拉刃光束 985（aiStyle 191）专属态 ----
  terra = false;
  // ---- 星怒剑 503 专属态 ----
  /** 目标线 Y（null=非星怒弹）；cy>targetY 后 tileCollide 生效（:22139-22143） */
  starY: number | null = null;
  /** alpha（255 起 −15/t；线上钳 150 / 线下钳 0——:22197-22206） */
  starAlpha = 255;
  /** 周期音（Item9 :22177-22180，20-60t 掷一次） */
  private starSndT = 20;
  /** tileCollide 已生效（越目标线后） */
  private starCollide = false;
  /** localAI[0] 计时 */
  terraT = 0;
  /** ai[0] 朝向（±1）/ ai[1] 生命基准 18 / ai[2] 物品 scale（出生注入） */
  terraAi0 = 1;
  terraAi1 = 18;
  terraAi2 = 1;
  /** 尾段清伤（t ≥ Lerp(ai1, ai1+25, 0.65) → damage=0，:39337-39340） */
  terraNoHit = false;
  /** localAI[1] 近墙减速标记 */
  terraWall = false;
  /** 已反射（原版 Projectile.reflected：反射源命中后置位，防重复反射；
   *  反射后弹体转 hostile——不再入下方敌怪判定，改走 hitPlayer 伤玩家） */
  reflected = false;
  /** 穿透投射物的同敌免疫表（敌人 id 集合） */
  private hitSet = new Set<number>();
  /** 1457 宝石法珠特性（null = 非宝石弹/未启用） */
  gem: GemStaffFlags | null = null;
  /** SwirlTwins 正弦摆相位计数（localAI[0]，:38615 每步 +1） */
  private gemSwirlT = 0;
  /** SwirlTwins 反相相位(1457 ai[1]:0=首弹,1=孪生弹,:49924-49926) */
  gemPhase = 0;
  /** 114 邪恶三叉戟减速计时（ai[0]，:26781 每步 +1） */
  private gem114T = 0;
  // ---- 特殊箭特效批（2026-08-22，weapon-audit-2026-08-22 类别六）----
  /** 225 叶绿箭撞块弹反计数（ai[1]，:17130：首跳伤 ×0.66 / 第 4 撞 Kill） */
  private arrow225Ai1 = 0;
  /** 710 空中祸害裂片标（原版出生参 ai[1]=-1——裂片命中不再撒裂片，BetsySharpnel
   *  :51077 `ai[1] != -1f` 门） */
  abShard = false;
  /** 485 狱翼箭 ai[0]/ai[1] 游移向量（ctor 掷定，Pl.cs:46934-46943） */
  private hwAiX = 0;
  private hwAiY = 0;
  /** 485 扇翅帧（frameCounter≥2 推帧 5 帧循环，:54834-54843——draw 消费） */
  hwFrame = 0;
  private hwFrameT = 0;
  /** 477 水晶镖平滑姿态角（前 5 拍对齐速度角+π/2、之后 (rot×2+aim)/3，
   *  :54802-54812——draw 消费；null = 未初始化走默认档） */
  dartRot: number | null = null;
  // ---- 1457 弧线引矢（AI_001_Features 位标 Projectile.cs:243-289——ai[2] 的
  //      FloatIntUnion 位 0..3；本仓展开为四布尔。写入端 = Player 侧
  //      Update_HarpyCharm/HarpyCharmEffect :28648-28704 扫描 → applyHarpyCharm
  //      （ApplyHarpyCharm :58779-58807）；消费端 = subStep 尾 homing 段（AI_001
  //      尾 :58752-58777）+ 命中侧 phoenixQuivered（StatusNPC :11178-11182）----
  /** bit0 HarpyCharmed（:245-251）：已被引矢锁定——homing 激活 + 玩家扫描跳过 */
  harpyCharmed = false;
  /** bit1 HarpyCharmConsumed（:257-263）：homing 中目标丢失 → 置位停引（:58772-58776），
   *  弹体回普通弹道（原版位不复位） */
  harpyCharmConsumed = false;
  /** bit2 PhoenixQuivered（:269-275，6181 凤凰箭袋标记）：命中 → Hellfire(323) 300t
   *  （StatusNPC :11178-11182 `nPC.AddBuff(323, 300)`） */
  phoenixQuivered = false;
  /** bit3 SeraphNecklaced（:281-287，6180 炽天使标记）：命中仅视觉
   *  （SilverBulletSparkle :71881-71893 + GetAlpha 白 :80608-80613），无结算面 */
  seraphNecklaced = false;
  /** R4-38：宝石法珠首帧音已播闸（AI_029 soundDelay 0→-1 单发语义） */
  gemShotSounded = false;
  // ---- 荆棘链族（7/8/150/151/152，aiStyle4，红队 R27 §10/§11）----
  /** 族激活（ctor 按 THORN_CHAIN_PROJS 自动置位）——subStep 独占状态机 */
  thornChain = false;
  /** ai[0]：0=渐显期（不动）/ 1=淡出期（alpha 回升） */
  private thornAi0 = 0;
  /** ai[1] 段号（武器首发 0；链生子段 = 父递增值，opts 注入） */
  thornAi1 = 0;
  /** 出生音 Item8 已播闸（localAI[0]==0 单发门 :23945-23954） */
  private thornBornSounded = false;

  /** FindTargetWithLineOfSight 等价：视距内最近且有视线的敌怪（:38571 FindTargetWithLineOfSight）。
   *  h = 目标命中盒高（225 叶绿箭归巢瞄准点上偏移 nPC.height×0.1..0.5 消费，:17147）。
   *  公开：1457 弧线引矢玩家侧扫描（harpyCharmEffect）对在场箭逐支调同款视距索敌 */
  nearestEnemyWithLos(game: GameHooks, range: number): { cx: number; cy: number; h: number } | null {
    let best: { cx: number; cy: number; h: number } | null = null;
    let bestD = range;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { cx?: number; cy?: number; x: number; y: number; w: number; h: number; dead?: boolean; id: number };
      if (e.dead) continue;
      const cx = e.cx ?? e.x + e.w / 2;
      const cy = e.cy ?? e.y + e.h / 2;
      const d = Math.hypot(cx - this.cx, cy - this.cy);
      if (d >= bestD) continue;
      // 局部免疫期目标不入池（FindTargetWithLineOfSight :46483-46485
      // `projectile.localNPCImmunity[i] != 0 → flag=false`——宝石弹 60t 命中冷却窗内
      // 不再锁回刚打过的敌;出生预置窗（spawnImmuneCd）与命中冷却（localImmuneCd）
      // 本仓拆两表,同源 vanilla localNPCImmunity 数组,一并跳过）——蓝队 R7-4
      if ((this.localImmuneCd.get(e.id) ?? 0) > 0 || (this.spawnImmuneCd.get(e.id) ?? 0) > 0) continue;
      // CanHit 全盒→全盒（:46488 targeter.position/width/height → npc.position/width/
      // height——曾两端 0×0 盒心,薄障碍/斜角视线判定边缘差）
      if (!canHitLine(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      best = { cx, cy, h: e.h };
      bestD = d;
    }
    return best;
  }

  /** AoeExplosion 爆段（Kill :77011-77058）：Resize(160)=80px 半径 AoE——
   *  伤害 ×0.35/GetDamageMultiplier、kb ×0.35、penetrate -1（一击全杀段） */
  private gemAoeBurst(game: GameHooks): void {
    if (!this.gem?.aoeExplosion) return;
    const mult = gemDamageMultiplier(this.gem);
    const dmg = Math.max(1, Math.trunc(this.damage * (0.35 / mult)));
    const R = 80;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { cx?: number; cy?: number; x: number; y: number; w: number; h: number; dead?: boolean; hurt?: (...a: unknown[]) => boolean };
      if (e.dead || !e.hurt) continue;
      const cx = e.cx ?? e.x + e.w / 2;
      const cy = e.cy ?? e.y + e.h / 2;
      if (Math.abs(cx - this.cx) < R + e.w / 2 && Math.abs(cy - this.cy) < R + e.h / 2) {
        e.hurt(dmg, Math.sign(cx - this.cx) * this.knockback * 0.35, 0, game, this.settlePen, false, this.pierceInit, true);
      }
    }
    game.spawnParticles(this.cx, this.cy, '#C080FF', 18, 3, { life: 24, size: 3 });
  }

  /** ★R28 §6 星璇秘术死亡爆（Kill :73553-73612）：176×176 居中 Damage() AoE +
   *  Item14 + 4×d240 + 30 循环×(d62 scale3.7 + d90 Crimson fadeIn1) + 10×d62 +
   *  10×d240 + 2 烟 gore(61-63)（自属 618 火花由 naParent 分支父亡即杀承载） */
  private arcanumDeathBurst(game: GameHooks): void {
    const R = 88;                                       // Resize(176) → 半径 88
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean; hurt?: (...a: unknown[]) => boolean };
      if (e.dead || !e.hurt) continue;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      if (Math.abs(ecx - this.cx) < R + e.w / 2 && Math.abs(ecy - this.cy) < R + e.h / 2) {
        const crit = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
        e.hurt(crit ? this.damage * 2 : this.damage,
          Math.sign(ecx - this.cx) * this.knockback, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      }
    }
    game.playSfxFiles?.(['Item_14'], 1, this.cx, this.cy);
    for (let i = 0; i < 4; i++) {                       // 4×d240
      game.spawnDust?.(this.cx - 4, this.cy - 4, 8, 8, 240, 0, 0, 100, null, 1.5, true);
    }
    for (let i = 0; i < 30; i++) {                      // 30 循环×(d62+d90 Crimson)
      const d62 = game.spawnDust?.(this.cx - 4, this.cy - 4, 8, 8, 62, 0, 0, 200, null, 3.7, true);
      if (d62) { d62.vx *= 3; d62.vy *= 3; }
      const d90 = game.spawnDust?.(this.cx - 4, this.cy - 4, 8, 8, 90, 0, 0, 100, null, 1.5, true);
      if (d90) { d90.vx *= 2; d90.vy *= 2; d90.fadeIn = 1; }
    }
    for (let i = 0; i < 10; i++) {
      const dc = game.spawnDust?.(this.cx - 4, this.cy - 4, 8, 8, 62, 0, 0, 0, null, 2.7, true);
      if (dc) { dc.vx *= 3; dc.vy *= 3; }
      const dd = game.spawnDust?.(this.cx - 4, this.cy - 4, 8, 8, 240, 0, 0, 0, null, 1.5, true);
      if (dd) { dd.vx *= 3; dd.vy *= 3; }
    }
    for (let i = 0; i < 2; i++) {                       // 烟 gore 61-63（:73604-73610）
      const g = GorePiece.newGore(61 + Math.floor(Math.random() * 3), this.cx, this.cy, 0, 0);
      if (g) {
        g.vx *= 0.3; g.vy *= 0.3;
        g.vx += (Math.floor(Math.random() * 21) - 10) * 0.05;
        g.vy += (Math.floor(Math.random() * 21) - 10) * 0.05;
      }
    }
  }

  /** ★R28 §4 灵魂之焰死亡爆（Kill :73798-73837,ai[0]≥0 已锁过敌才爆）：
   *  80×80 居中 Damage() AoE + Item14 + 前 15 枚 d27 正 Y 环形 RotatedBy(2π(i+1)/15)
   *  ×(5+rand×1.5) fadeIn1.5+、后 15 枚随机盘内散布 ×2 + 10×d31 烟 */
  private flame659DeathBurst(game: GameHooks): void {
    const R = 40;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean; hurt?: (...a: unknown[]) => boolean };
      if (e.dead || !e.hurt) continue;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      if (Math.abs(ecx - this.cx) < R + e.w / 2 && Math.abs(ecy - this.cy) < R + e.h / 2) {
        const crit = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
        e.hurt(crit ? this.damage * 2 : this.damage,
          Math.sign(ecx - this.cx) * this.knockback, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      }
    }
    game.playSfxFiles?.(['Item_14'], 1, this.cx, this.cy);
    for (let i = 0; i < 30; i++) {
      const sc = 2 + Math.random() * 0.5;
      let vx = 0, vy = 0;
      if (i < 15) {
        const th = ((i + 1) / 15) * Math.PI * 2;        // UnitY.RotatedBy(2π(i+1)/15)
        vx = -Math.sin(th) * (5 + Math.random() * 1.5);
        vy = Math.cos(th) * (5 + Math.random() * 1.5);
      }
      const d = game.spawnDust?.(i < 15 ? this.cx - 1 : this.cx - Math.sin(Math.random() * Math.PI * 2) * R * Math.random(),
        i < 15 ? this.cy - 1 : this.cy + Math.cos(Math.random() * Math.PI * 2) * R * Math.random(),
        2, 2, 27, vx, vy, 0, null, sc, true);
      if (d) { d.fadeIn = i < 15 ? 1.5 + Math.random() * 0.5 : 0.5 + Math.random() * 0.5; if (i >= 15) { d.vx *= 2; d.vy *= 2; } }
    }
    for (let i = 0; i < 10; i++) {                      // 10×d31 烟
      const th = Math.random() * Math.PI * 2;
      game.spawnDust?.(this.cx - 1 + Math.cos(th) * R / 1.5, this.cy - 1 + Math.sin(th) * R / 1.5,
        2, 2, 31, 0, 0, 0, null, 1.5, true);
    }
  }

  /** ★R29 玛瑙爆破枪 661 黑爆二段（Kill :73493-73540）：position 归心后 Resize(160×160)
   *  → Damage() AoE 二次结算（伤=弹体全额、kb 同弹）+ Item14 + 4×d240(scale1.5) +
   *  20 循环×{d62 scale3.7 v×3+径向(2..6) / d62 scale1.5 Crimson×0.5 fadeIn1 v×2+径向8} +
   *  20×d62 scale2.7 沿速度轴环 + 70×d240 沿速度轴环 */
  private blackBolt661Burst(game: GameHooks): void {
    const R661 = 80;                                       // Resize(160) 半宽
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean; hurt?: (...a: unknown[]) => boolean };
      if (e.dead || !e.hurt) continue;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      if (Math.abs(ecx - this.cx) < R661 + e.w / 2 && Math.abs(ecy - this.cy) < R661 + e.h / 2) {
        const crit = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
        e.hurt(crit ? this.damage * 2 : this.damage,
          Math.sign(ecx - this.cx) * this.knockback, 0, game, this.settlePen, crit, 0, true);   // fromPlayer=DPS 计
      }
    }
    game.playSfxFiles?.(['Item_14'], 1, this.cx, this.cy);
    for (let i = 0; i < 4; i++) {                          // 4×d240（UnitY.RotByRandom 盘内）
      const th = Math.random() * Math.PI * 2, rr = Math.random() * R661 / 2;
      game.spawnDust?.(this.cx + Math.sin(th) * rr - 4, this.cy + Math.cos(th) * rr - 4,
        8, 8, 240, 0, 0, 100, null, 1.5);
    }
    for (let i = 0; i < 20; i++) {                         // 20 循环×双 d62
      const th = Math.random() * Math.PI * 2, rr = Math.random() * R661 / 2;
      const px = this.cx + Math.sin(th) * rr, py = this.cy + Math.cos(th) * rr;
      const dA = game.spawnDust?.(px - 4, py - 4, 8, 8, 62, 0, 0, 200, null, 3.7, true);
      if (dA) {
        dA.vx *= 3; dA.vy *= 3;
        dA.vx += Math.sign(px - this.cx) * (2 + Math.random() * 4);   // DirectionTo(pos) 径向
        dA.vy += Math.sign(py - this.cy) * (2 + Math.random() * 4);
      }
      const dB = game.spawnDust?.(px - 4, py - 4, 8, 8, 62, 0, 0, 100,
        { r: 110, g: 10, b: 30, a: 255 }, 1.5, true);      // Color.Crimson*0.5 tint
      if (dB) { dB.fadeIn = 1; dB.vx *= 2; dB.vy *= 2; dB.vx += Math.sign(px - this.cx) * 8; dB.vy += Math.sign(py - this.cy) * 8; }
    }
    const va661k = Math.atan2(this.vy, this.vx);
    const ca661k = Math.cos(va661k), sa661k = Math.sin(va661k);
    for (let i = 0; i < 20; i++) {                         // 20×d62 scale2.7 沿速度轴
      const th = Math.random() * Math.PI * 2;
      const ox = Math.sin(th) * R661 / 2, oy = -Math.cos(th) * R661 / 2;
      game.spawnDust?.(this.cx + ox * ca661k - oy * sa661k - 4,
        this.cy + ox * sa661k + oy * ca661k - 4, 8, 8, 62, 0, 0, 0, null, 2.7, true);
    }
    for (let i = 0; i < 70; i++) {                         // 70×d240 沿速度轴
      const th = Math.random() * Math.PI * 2;
      const ox = Math.sin(th) * R661 / 2, oy = -Math.cos(th) * R661 / 2;
      game.spawnDust?.(this.cx + ox * ca661k - oy * sa661k - 4,
        this.cy + ox * sa661k + oy * ca661k - 4, 8, 8, 240, 0, 0, 0, null, 1.5);
    }
  }

  // ---- 喵刀弹 502（Meowmere Cat）专属态 ----
  /** 614 星尘细胞弹 ai[1]（AI_113_TargetSticker :41289-41330）：目标敌 id（发射侧
   *  MinionProj 注入,原版 NewProjectile 第 11 参 = num13 目标索引）——硬追踪/失的即杀/
   *  命中匹配目标上 buff 183×900t（StatusNPC :11381-11383 `type==614 && ai[1]==i`） */
  stickerTgt = 0;
  /** ai[0]：弹跳+命中共享计数（0..5，≥5 消亡）——弹跳 :18169 递增/命中 :16794
   *  递增同槽（先到 5 者杀弹，喵叫音高 style=5+ai0 随之爬升） */
  meowCount = 0;
  /** localNPCHitCooldown 同敌再命中冷却（SetDefaults :5466-5468 = 10t） */
  private meowHitCd = new Map<number, number>();
  /** 1457: 通用局部 NPC 无敌帧（usesLocalNPCImmunity + localNPCHitCooldown=N，
   *  Projectile.cs:10688-10689 等）——同弹对同敌 N t 冷却后再命中（数据列驱动，
   *  121-126/597 宝石法珠 60t / 77-78 音符 30t / 309 FrostBlast 10t / 502 喵刀 10t 同型） */
  private localImmuneCd = new Map<number, number>();
  /** 出生预置局部免疫表（localNPCImmunity[target]=N——localImmuneSeed opts 写入,
   *  每 tick 递减（DecrementLocalImmuneTimeCounters :15919-15936,Update :15330
   *  在子步循环前每 tick 一次）,命中环独立消费。与命中后写档 localImmuneCd
   *  分离：本表项不参与命中后冷却语义） */
  private spawnImmuneCd = new Map<number, number>();
  /** 本弹的 localNPCHitCooldown（>0 = 启用局部免疫冷却语义） */
  private localImmune = 0;
  /** 宝石弹 oldPos 环（扁平 [x0,y0,x1,y1,…]，[0]=本 tick 出生位、[2i/2i+1]=i tick 前
   *  ——Projectile.cs:15452-15466 FastThenSlow 拖尾扫掠 oldPos[1..5] 消费） */
  private gemTrail: number[] = [];
  /** oldPos 拖尾环（彩虹拖尾 Main.cs:32495-32513 沿 oldPos 逐段绘制，N=10） */
  private meowTrail: number[] = [];
  /** aiStyle 24 书族 oldPos 环（94 水晶风暴/95 诅咒之焰/1114 日耀花——Main.cs:35251/
   *  :35299 十份渐隐拷贝沿 oldPos 绘制,缩放/色各 ×(9−i)/9,N=10） */
  private starTrail: number[] = [];
  /** 迪斯科 RGB（DoUpdate_AnimateDiscoRGB Main.cs:19441 六段 ±7/帧；初值 R=255） */
  private discoR = 255;
  private discoG = 0;
  private discoB = 0;
  private discoStyle = 0;
  /** 弹体点光（Game 实体光扫读 lightRGB——同 Enemy 约定） */
  lightRGB: [number, number, number] | null = null;
  /** 点光源像素覆盖（缺省=实体中心；985 泰拉刃 :39382 光心=弹心+朝向 85×scale） */
  lightRGBAt: { x: number; y: number } | null = null;
  // ---- 叶绿弹 207 / 骷髅头法书弹 837（AI_001 顶层段 :53906-54010）----
  /** ai[1] 锁敌标记（原版 = npc 索引+1；本仓存 Enemy.id，0 = 未锁） */
  chloAi1 = 0;
  /** localAI[0] 初速（首次 AI 取 |v|，此后恒为转向基准速度——转向不清速） */
  chloSpeed = 0;
  // ---- aiStyle 36 蜂族（AI() 派发器 :27683-27862）----
  /** ai[0] 索敌延迟计数（>30 后每 update 重搜最近敌，:27762-27764 钳 30） */
  private bee36Delay = 0;
  /** 本拍锁定目标（每拍重搜，不持久锁——原版无 ai 锁存） */
  private bee36Aim: { cx: number; cy: number } | null = null;
  /** 本拍是否锁到真实敌（false = 无目标前瞻点；316 速度档/307 friendly 消费） */
  private bee36AimLocked = false;
  /** 307 小吞噬者 friendly 旗（SetDefaults 无 friendly :3986-3995；锁定瞬间置位
   *  :27789-27792——锁定前穿敌不结算，命中环按此门禁） */
  friendly307 = false;
  /** frameCounter（316 6 拍/帧 2 帧循环 :27699-27706 / 其余 3 拍/帧 3 帧 :27720-27727）*/
  bee36Frame = 0;
  private bee36FrameT = 0;
  /** 蜂族姿态角（draw 消费；null = 非蜂族）：307 = atan2(vy,vx)−π/2（:27698）/
   *  其余 = velocity.X×0.1（:27716）——每 AI 步刷新 */
  bee36Tilt: number | null = null;
  /** 蜂族 alpha 归零后 extraUpdates→0 挂起（:27693-27695——原版 numUpdates 每 tick
   *  头读取,当拍已入循环的子步数不变,下一 tick 起 1 子步/tick） */
  private bee36EU0 = false;
  // ---- 616 星旋机枪涡旋弹（AI_001 重力链 616 支 :58383-58465）----
  /** ai[0] 索敌延迟（>20 后激活，:58403-58405 自减钳 20） */
  private vx616Delay = 0;
  /** ai[1] 锁敌（npc 索引+1；本仓存 Enemy.id；0=未锁；失效不复锁 :58421-58437） */
  private vx616Ai1 = 0;
  /** localAI[0] 初速快照（转向基准，:58371-58377） */
  private vx616Speed = 0;
  // ---- 297 幽灵法杖弹（aiStyle 51 :28825-28927）----
  // （无持久态——每拍全量重搜）
  // ---- 659 灵魂之焰（aiStyle 129 :36861-36970）----
  /** ai[0] 锁定目标（vanilla npc 索引，负数 = 无/失效态；本仓存 Enemy.id，−1 无） */
  private sf659Ai0 = -1;
  /** localAI[0] 重索敌节拍（每 5 update 一搜，:36878-36882） */
  private sf659Cd = 0;
  // ---- ★R28 中期魔法族（红队 R28 §1-§15）专属态 ----
  /** 出生自校正挂起旗（首个子步按 Player.Shoot 公式重构自身/兄弟弹几何——
   *  发射链挂点在 Game.ts（R26 蓝队分区），本仓以"出生弹=原版 i=0 弹"为锚
   *  在实体侧补齐多发散布/天降几何/悬浮出生态） */
  rp30Pending = false;       // 336 松针手枪梯次扇（Player.cs:48067-48086）
  blz337Pending = false;     // 337 暴雪法杖天顶双锥（:48089-48117）
  bat316Pending = false;     // 316 蝙蝠杖 2-3 只散布（:48820-48830）
  sf659Birth = false;        // 659 灵魂之焰悬浮出生态（:49297-49310）
  /** 659 出生基准向（ctor 快照 normalize(初速)——CanHit 试向的旋转基准） */
  private sf659DirX = 0;
  private sf659DirY = -1;
  /** 659 三臂旋尘相位 ai[1]（每 update 自增 :36916） */
  private sf659Phase = 0;
  /** 522 子蛇 ai[1] 计数（>40 Kill + 尘 scale 衰减 num7=(60−ai1)/60 :38428-38433） */
  private sn522Ai1 = 0;
  /** 316 蝙蝠杖出生基准速（ctor 快照——兄弟弹散布叠加基准,原版 num4/num5） */
  private batBaseVx = 0;
  private batBaseVy = 0;
  /** 294 暗影束：localAI[0] 子步龄 / localAI[1]/[2] 束段锚点（:28609-28613 +
  *  HandleMovement :18976-19013 编排束消费） */
  private sbL0 = 0;
  private sbAx = 0;
  private sbAy = 0;
  /** 296 地狱火叉爆区：ai[0]（+4/update,>540 Kill ≈135t 存续 :28776-28790）+
  *  Item74 点火吼单次门（localAI[0]==0 :28772-28775） */
  private if296Ai0 = 0;
  private if296Sounded = false;
  /** 511-513 毒云：ai[0] 存续计数（>260 Kill :33168-33177）/ 自旋相位
  *  （rotation = 相位 + t×2π/480 :33192-33194） */
  private cloudT = 0;
  private cloudPhase = 0;
  /** 337 固定起始帧（发射侧 ai[1]=rand.Next(5)，AI 不推进 :57927） */
  pinFrame: number | null = null;
  /** usesIDStaticNPCImmunity 组共享免疫键（非 null = 启用；511-513 毒云
   *  UseGroupStaticImmunity(511) :10678-10687——三型共用一张表,重叠不叠伤） */
  idStaticGroup: number | null = null;
  /** 组共享免疫冷却 ms（idStaticNPCHitCooldown×50ms；毒云 10t=167ms） */
  idStaticCdMs = 167;
  // ---- ★R29 幻象弓载体 630 / 追踪矢 631（红队 §1）----
  /** 630 载体控制面（Game 注入：channel 电平/瞄准点/volley 弹药解析;null = 非 630
   *  或敌侧来源）。行为块 = AI_001 type==630 支 Projectile.cs:68194-68295 */
  ph630Ctl: Phantasm630Ctl | null = null;
  /** 630 ai[0] 计龄（加速窗档位 40/80/120 → interval 24/22/20/18） */
  private ph630Age = 0;
  /** 630 ai[1] volley 倒计时（出生 0 → 首拍即触发一轮） */
  private ph630VolleyCd = 0;
  /** 630 soundDelay 音效节拍器（首拍 ai0==1 豁免,Item_5 每 interval 拍） */
  private ph630SndCd = 0;
  /** 631 ai[0] 受害者（Enemy.id;−1 = 目标失效态） */
  ph631Tgt = -1;
  /** 631 ai[1] 错峰延迟（命中侧补刀三连 0/15/30——延迟期 velocity=Zero 定身） */
  ph631Delay = 0;
  /** 819 血箭 localAI[0] 首拍尘爆闸（DrawProj :57371-57381 出生 8×d5 单次） */
  private bArrow819Born = false;
  /** 469 蜂箭渐显计数（localAI[1],>2 后 alpha−=50/update :56164-56174） */
  private ph469T = 0;
  /** ★R29 幻象弓 phantasmTime 窗口（静态时间戳,ms）：630 载体每子步续窗
   *  （player.phantasmTime=2 :68239）;命中侧补刀链消费（:13935）。33ms ≈ 2t */
  static phantasmWindowUntil = 0;
  /** 命中侧补刀窗口判活（Date/perf 时钟;载体在场即真） */
  static phantasmWindowActive(): boolean {
    return typeof performance !== 'undefined' && performance.now() < Arrow.phantasmWindowUntil;
  }
  // ---- 409 剃刀台风（aiStyle 71 :30848-30951，2622 剃刀台风）----
  /** ai[0] 一次性锁敌（npc 索引+1；0 = 未锁；本仓存 Enemy.id，0 未锁） */
  private ty409Ai0 = 0;
  /** localAI[0] 锁敌冷却（未锁时 30 update 一搜，:30907-30910） */
  private ty409Cd = 0;
  // ---- 451 涌流剑（aiStyle 81 :31541-31760，2880 涌流剑）----
  /** ai[0] 状态机：0=飞行（0↔75 alpha 脉动）/[1,1+pen)=命中后淡出+寻的瞬移/
   *  [1+pen,1+2pen)=末段淡出可伤（ai[1]<5 期豁免）。命中钩：0→+pen，否则 −(pen+1) */
  iwAi0 = 0;
  /** localAI[0]：飞行期节拍（>7 起脉动）/淡出期清零 */
  private iwL0 = 0;
  /** localAI[1]：飞行期脉动相（0=渐隐 1=渐显） */
  private iwL1 = 0;
  /** ai[1]：末段 15 update 计数（命中/撞块钩清零，:14121/:18225） */
  private iwAi1 = 0;
  /** 451 淡出期骑乘目标（≤250 无视线最近敌，position += npc.velocity :31682） */
  private iwRide: { id: number; vx: number; vy: number } | null = null;
  /** 451 骑乘目标中心（瞬移重射用） */
  private iwRideTarget: { cx: number; cy: number } | null = null;
  // ---- 617 星璇秘术（aiStyle 118 :35283-35455，3476 星璇秘术）----
  /** ai[0] 相位计数（减速段 ≥30 起 ×0.98；速度 <4.1 归一 4 并清零重计；
   *  慢速段 %30==0 且 <241 掷 618、≥600 Kill） */
  na617Ai0 = 0;
  /** ai[1] 锁敌（本仓存 Enemy.id，0 未锁；失效清锁重搜 :35417-35427） */
  private na617Ai1 = 0;
  // ---- 618 星璇火花（aiStyle 119 :35458-35540，617 伴生隐形伤弹）----
  /** 父 617 引用（null = 非 618 路径）；父亡即 Kill（:35475-35478） */
  naParent: Arrow | null = null;
  /** 父中心上一 update 快照（骑乘位移 = 父位移 :35483-35486） */
  private naLastPX = 0;
  private naLastPY = 0;
  /** ai[0]（≥420 停止骑乘，:35479-35481） */
  private naAi0 = 0;

  /** 451 ≤250 寻的 + 骑乘（:31649-31661/:31707-31725）：无视线门最近 CanBeChasedBy，
   *  命中即 position += npc.velocity（随敌漂移）；存中心供瞬移重射 */
  private iwSeek451(game: GameHooks, range: number): void {
    let best = range;
    let found: { id: number; cx: number; cy: number; vx: number; vy: number } | null = null;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean; vx?: number; vy?: number };
      if (e.dead) continue;
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      const d = Math.hypot(cx - this.cx, cy - this.cy);
      if (d >= best) continue;
      best = d;
      found = { id: e.id, cx, cy, vx: e.vx ?? 0, vy: e.vy ?? 0 };
    }
    if (found) {
      this.iwRide = { id: found.id, vx: found.vx, vy: found.vy };
      this.iwRideTarget = { cx: found.cx, cy: found.cy };
      this.x += found.vx;                                  //（:31682/:31722 position += npc.velocity）
      this.y += found.vy;
    } else {
      this.iwRide = null;
      this.iwRideTarget = null;
    }
  }

  /** 451 命中钩（Damage :14115-14121）：ai[0]==0 → += pen，否则 −= pen+1；ai[1]=0 */
  private iwOnHit(): void {
    const pen451 = Math.max(1, this.pierceInit);
    if (this.iwAi0 === 0) this.iwAi0 += pen451;
    else this.iwAi0 -= pen451 + 1;
    this.iwAi1 = 0;
  }

  /** 451 可伤门（Damage_CanDealDamage :12463 `451 && ((ai[0]-1)/pen==0 || ai[1]<5)
   *  && ai[0]!=0` → 豁免）：飞行态恒可伤；淡出态 [1,1+pen) 恒豁免；末段前 5 拍豁免 */
  private iwCanDamage(): boolean {
    if (this.iwAi0 === 0) return true;
    const pen451 = Math.max(1, this.pierceInit);
    if (this.iwAi0 >= 1 && this.iwAi0 < 1 + pen451) return false;
    if (this.iwAi0 >= 1 + pen451 && this.iwAi0 < 1 + 2 * pen451) return this.iwAi1 >= 5;
    return true;
  }
  // ---- 92 坠星（aiStyle 5 + Kill 91/92 共段）----
  /** ai[1] 命中线 Y（弹顶越过才恢复撞块；-Infinity = 非坠星路径） */
  starFallLine = -Infinity;
  /** ai[0] 代际（1 = 圣箭直系可再链一代；孙代 0 不链） */
  starFallGen = 0;
  /** aiStyle5 通用闪烁档相位（localAI[0]：1=升 0→200 / -1=降 200→0，:22222-22238） */
  private twinkleDir = 1;
  /** aiStyle5 Item_9 星啸节拍器（soundDelay = 20+rand(40)，:22166-22172） */
  private starSndCd = 0;
  // ---- 食人鱼 190（aiStyle 39，Projectile.cs:26065-26315）专属态 ----
  /** 非空 = 食人鱼状态机激活（fixedUpdate 直入 piranhaStep） */
  piranha: PiranhaCtl | null = null;
  /** alpha（SetDefaults :2517 = 255；AI :26067 每 tick −50，6t 淡入归零） */
  pAlpha = 255;
  /** ai[0]：0=直飞（:26245 分支）/ 1=返回玩家（:26266 分支） */
  pAi0 = 0;
  /** ai[1]：0=未咬（命中即咬 :12447）/ >0=咬住目标 / −1=松手禁再咬（:26095） */
  pAi1 = 0;
  /** 咬住目标（vanilla 存 npc index+1，此处直接持引用 + 每 tick 校验存活） */
  pTarget: PiranhaTarget | null = null;
  /** localNPCImmunity 同敌冷却表（SetDefaults :2521 = 14t，:13157 命中写入） */
  private pHitCd = new Map<number, number>();
  /** 帧推进计数 / 当前帧（:26301-26310：4t/帧 4 帧循环——draw 侧消费） */
  pFrameCounter = 0;
  pFrame = 0;
  /** 姿态角（未镜像系 atan2(vy,vx)）与翻转位（spriteDirection<0）——咬住时
   *  velocity 已清零，atan2(0,0) 会把鱼掰回 0°，故由 AI 侧在清速前记录（:26119-26143） */
  pRot = 0;
  pFlip = false;
  /** 出生弹速（ItemCheck_Shoot num4/num5 模长 = item.shootSpeed 14）——补弹复用 */
  pShootSpeed = 0;
  // ---- 329 焰镰（aiStyle 56）/ 351 礼盒（aiStyle 58）专属态 ----
  /** tileCollide=false（跳过撞块/CutTiles） */
  noTileCollide = false;
  /** 焰镰恒旋累积角（出生 = 发射者 rotation） */
  scytheRot: number | null = null;
  /** 焰镰 spriteDirection（<0 时贴图水平镜像） */
  scytheFlip = 1;
  private scytheInit = false;
  /** 礼盒两段重力状态机（0=前段平飞/1=下落段）+ ai[1] 计时 + 淡入 alpha */
  present = false;
  presentStage = 0;
  private presentT = 0;
  private presentAlpha = 255;
  // ---- 452 幻影矢（aiStyle 82）/ 454 幻影能量球（83）/ 1021 巨砾（25）/
  //      448 火箭（80）专属态（2026-08-19 月总/火星/Betsy 弹道批）----
  /** 452 弹道激活 */
  phantasm = false;
  /** 452 ai[1] 弧线弯转角（进 2 段 = FindClosest 玩家索引，单人恒 0 = 旋转恒等） */
  private phSpin = 0;
  /** 452 ai[0] 段号（0/1 上升弧线、2 追踪） */
  private phStage = 0;
  /** 452 localAI[0] 段内计数（0 段 45t / 1 段 90t） */
  private phT = 0;
  /** 452 alpha（255 起 −40/t 渐显；draw 消费） */
  phAlpha = 255;
  /** 454 归巢球激活 */
  phantomOrb = false;
  /** 454 ai[0]：≥0 计数（0..29 随行 / ≥30 列队）、−1 齐射态（帧 1+双步） */
  orbAi0 = 0;
  /** 454 归属 NPC id（ai[1]=whoAmI 语义——齐射指令按 ownerId 圈定己方球） */
  orbOwnerId = 0;
  /** 454 帧（0/1：列队每 6t 切换 / 齐射恒 1） */
  orbFrame = 0;
  private orbFrameT = 0;
  /** 454 alpha（255 钳 200 −5/t；scale = 1−alpha/255 随之伸展） */
  private orbAlpha = 255;
  /** 454 父体消失后的冻结锚（原版 npc 槽位数据残留语义——不消亡只停驻） */
  private orbAnchor: { x: number; y: number } | null = null;
  /** 1021 月总巨砾激活 */
  mlBoulder = false;
  /** 1021 localAI[1]：X 反弹计数（>3 消亡；轻落置 999 = rest 标） */
  private boulderBounces = 0;
  /** 448 火箭激活 */
  martianRocket = false;
  /** 沙球族（aiStyle 10，42/65/68/354）激活——ctor 按 SAND_BALL_PROJ 自动置位 */
  sandBall = false;
  // ---- 信号枪族（aiStyle 33，AI_033 :27425-27498 + 撞块贴壁 :18731-18745）----
  /** 族激活——ctor 按 FLARE_PROJS 自动置位（163 信号枪 930 / 1009 诅咒信号弹 5378） */
  flare = false;
  /** ai[0]/ai[1] 姿态向量（非贴壁期每拍取当前速度；贴壁后冻结——draw 侧
   *  rotation = atan2(ai1, ai0)+π/2 :27497 消费，贴壁时 velocity 已清零） */
  private flareAi0 = 0;
  private flareAi1 = 0;
  /** localAI[0]：1 = 已贴壁停驻（撞块置 1 :18744；脱块回 0 + localAI[1]=30 :27480-27483） */
  private flareStuck = 0;
  /** localAI[1]：≥30 后每拍 vy+0.09（:27477-27482 自增后钳回 30 = 恒触发档） */
  private flareGravT = 0;
  // ---- 钉 514（aiStyle 93，钉枪 3107 弹，AI_093 Projectile.cs:33425-33487）----
  /** ai[0]：0 飞行（20t 后下垂）/ 1 撞块弹开（×0.6/t 衰减）/ <0 刺入敌体
   *  （= −(敌 id+1)，跟随敌心偏移 velocity） */
  nail93 = false;
  nailAi0 = 0;
  /** ai[1] 计时（飞行 20t 下垂门 / 刺入·弹开 90t 消亡门） */
  private nailAi1 = 0;
  /** 刺入 DoT 节拍（immune[owner]=1 档 :14060-14062 → 隔拍再刺） */
  private nailDotT = 0;
  /** 448 ai[0]（0 引信 / 1 点火追踪） */
  private rkAi0 = 0;
  /** 448 ai[1] 引信倒数（出生 20，:36099 NewProjectile 第 10 参） */
  private rkFuse = 20;
  /** 448 localAI[1] 点火后计时（==180 自毁） */
  private rkT = 0;
  /** 448 帧（3t/帧 3 帧循环）+ 帧计数 */
  rkFrame = 0;
  private rkFrameT = 0;
  /** AI_001 家族旗（ctor 按 SetDefaults aiStyle==1 置位）——尾 ±16 钳消费（R7-8） */
  aiStyleOne = false;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    knockback: number, projId = 1, dropKey: string | null = null, opts?: ArrowOpts) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.dropKey = dropKey;
    // 判定盒/绘制 scale 按弹型取 SetDefaults（子弹 14 = 4×4 hitbox；箭 1 = 10×10）
    const pd0 = projectileData(projId);
    if (pd0?.width) this.w = pd0.width;
    if (pd0?.height) this.h = pd0.height;
    this.drawScale = pd0?.scale ?? 1;
    // 重力缺省 = AI_001 规格链（projGravSpec：箭 0.1@15 缓坠 / 子弹 flag3 直线 /
    // 686/711 两段式…）——未显式传 grav 的调用面（敌方箭/塔弹/同步复体）自动对齐；
    // 显式传 grav 的走调用方档（gravDelay 缺省回到 -1 无延迟，旧语义不回退）
    const spec0 = projGravSpec(projId);
    const gravExplicit = opts?.grav !== undefined;
    this.grav = gravExplicit ? opts!.grav! : spec0.grav;
    this.gravDelay = opts?.gravDelay ?? (gravExplicit ? -1 : spec0.delay);
    this.grav2 = opts?.grav2 ?? (gravExplicit ? 0 : spec0.grav2 ?? 0);
    this.grav2At = opts?.grav2At ?? (gravExplicit ? 0 : spec0.grav2At ?? 0);
    this.dragAlways = opts?.dragAlways ?? (gravExplicit ? 0 : spec0.drag ?? 0);
    // 寿命表（修复2）：opts 显式优先 → SetDefaults timeLeft（vanilla-projectiles.json
    // 提取自 Projectile.cs SetDefaults）→ 缺省 3600（P.cs:526）。逐型覆写：小丑箭
    // 5=120(:599)/诅咒镖 478=300(:5264)/水晶风暴 94=600(:1517)/月总箭 639=90(:6603)
    this.life = opts?.life ?? pd0?.timeLeft ?? 3600;
    // 27 水矢 SetDefaults `timeLeft /= 2`（:1104）→ 3600/2=1800（提取器不建模表达式列,
    // 常量补——红队 R27 §6：曾 3600 寿命翻倍）。min 而非覆写：发射链显式传缺省
    // 3600（fireGemStaffBolts 表缺列兜底）时同样收敛到原版终值
    if (projId === 27) this.life = Math.min(this.life, 1800);
    // 穿透表（修复1）：opts 显式优先 → SetDefaults penetrate → 缺省 1。−1 = 无限
    // （小丑箭 5(:594)/地狱火箭 41(:982)；命中侧按全局 immune 帧冷却再命中）
    this.pierce = opts?.pierce ?? pd0?.penetrate ?? 1;
    // alpha 初值（修复4，SetDefaults 逐型 PROJ_ALPHA0）
    this.alpha = PROJ_ALPHA0[projId] ?? 0;
    // 424 流星弹 scale = ai[1]（AI :54158 直读；发射侧 Player.cs:47069 ai1 =
    // 0.5+rand×0.3——本仓发射点未注入，出生时同分布掷定）
    if (projId === 424) this.drawScale = 0.5 + Math.random() * 0.3;
    // 374 黄蜂毒刺 scale ×0.9（SetDefaults :4586 `scale *= 0.9f`——提取器漏 scale 列,
    // 常量补;蓝队 R7-27：曾 drawScale 恒 1,毒刺视觉大 11%）
    if (projId === 374) this.drawScale = 0.9;
    // NewProjectile 出生速钳（Projectile.cs:10259-10267）：aiStyle 1 弹逐轴 |v|≥16
    // → 双轴 ×0.97 收敛（注意原版负 vy 侧无等号：vy < −16 才收）
    if ((pd0?.aiStyle ?? -1) === 1) {
      this.aiStyleOne = true;
      let guard = 0;
      while (guard++ < 512 && (this.vx >= 16 || this.vx <= -16 || this.vy >= 16 || this.vy < -16)) {
        this.vx *= 0.97;
        this.vy *= 0.97;
      }
    }
    // 485 狱翼箭出生游移（Player.cs:46934-46943 炼狱天弓 3019 专支）：ai[0]/ai[1] =
    // 瞄准向 RotatedByRandom(0.3927)（±π/8）、实际初速 = 瞄准向 RotatedByRandom(0.1963)
    // （±π/16）——AI 侧 v=(v×39+ai)/40 即朝游移向量渐转（:54828-54829）。Game 发射点
    // 未注入 ai，ctor 内同分布自掷（424 流星弹 scale 同先例）
    if (projId === 485) {
      const a485 = (Math.random() * 2 - 1) * 0.39269908120686464;
      const c485 = Math.cos(a485), s485 = Math.sin(a485);
      this.hwAiX = this.vx * c485 - this.vy * s485;
      this.hwAiY = this.vx * s485 + this.vy * c485;
      const b485 = (Math.random() * 2 - 1) * 0.19634954084936207;
      const c2b = Math.cos(b485), s2b = Math.sin(b485);
      const rvx = this.vx * c2b - this.vy * s2b;
      const rvy = this.vx * s2b + this.vy * c2b;
      this.vx = rvx;
      this.vy = rvy;
    }
    // 1457 FinalizeProjectile_GemStaves（:22259-22296）：特性穿透/穿甲/timeLeft 终值化
    if (opts?.gem) {
      this.gem = opts.gem;
      if (opts.gemPhase) this.gemPhase = opts.gemPhase;   // 孪生弹反相（:49924-49926）
      let addPen = 0;
      let addArpen = 0;
      if (opts.gem.fastThenSlow) { addPen = Math.max(addPen, 1); this.life *= 2; }
      if (opts.gem.canBounce) addPen = Math.max(addPen, 2);
      if (opts.gem.biggerHitbox) addPen = Math.max(addPen, 1);
      if (opts.gem.arPenSpread) addArpen += 4;
      if (opts.gem.allGems) { addPen = 2; addArpen = 4; this.life = 90; }
      this.pierce += addPen;
      this.armorPen += addArpen;
    }
    this.pierceInit = this.pierce;
    this.hostile = opts?.hostile ?? false;
    this.bounce = opts?.bounce ?? false;
    this.thornBounce = opts?.thornBounce ?? false;
    this.skullBoneT = opts?.skullBone ? 1 : 0;
    this.homing = opts?.homing ?? null;
    if (opts?.aimPoint) this.aimPt = opts.aimPoint;
    // 442 缺省 ai[0]/[1] = 0（NewProjectile 缺省实参）→ 锁定点 (8,8)——原版语义
    // （发射侧 2796 恒显式传 tileTarget，此兜底仅覆盖非常规来源）
    if (projId === 442 && !this.aimPt) this.aimPt = { tx: 0, ty: 0 };
    this.extraUpdates = opts?.extraUpdates ?? pd0?.extraUpdates ?? 0;   // 子弹 14=1(2 步/tick)、高速弹 207=2
    this.localImmune = pd0?.localNPCHitCooldown ?? 0;
    // 311 糖果玉米 usesLocalNPCImmunity+localNPCHitCooldown=10（SetDefaults
    // :4047-4048，提取器漏提两列 → 常量补；同敌 10t 冷却再命中）
    if (projId === 311) this.localImmune = 10;
    // 出生预置局部免疫（localNPCImmunity[target]=N——花瓣 1038 = 30t,见 opts 注）
    if (opts?.localImmuneSeed) this.spawnImmuneCd.set(opts.localImmuneSeed.npcId, opts.localImmuneSeed.t);
    this.drag = opts?.drag ?? 1;
    this.maxFall = opts?.maxFall ?? 16;
    this.tumble = opts?.tumble ?? false;
    this.tumblePoseLock = opts?.tumblePoseLock ?? false;
    this.terra = !!opts?.terra;
    if (projId === 684) { this.dragonFade = true; this.dragonAlpha = 255; }
    if (projId === 711) { this.dragonFade = true; this.dragonAlpha = 255; this.betsyCurse = true; }
    if (projId === 261) this.boulder = true;
    if (opts?.terra) {
      this.terraAi0 = opts.terra.ai0;
      this.terraAi1 = opts.terra.ai1;
      this.terraAi2 = opts.terra.ai2;
    }
    if (opts?.star) this.starY = opts.star.targetY;
    // tileCollide=false：显式优先，缺省按 SetDefaults 数据表（325/329/348/350/351…）
    if (opts?.noTileCollide !== undefined) this.noTileCollide = opts.noTileCollide;
    else if (pd0?.tileCollide === false) this.noTileCollide = true;
    if (opts?.scythe) { this.scytheRot = opts.scythe.rot0; this.scytheFlip = opts.scythe.flipDir; }
    this.present = !!opts?.present;
    // 452/454/1021/448 per-proj 档（skullBone 同模式：opts 激活 + subStep 消费）
    if (opts?.phantasm) { this.phantasm = true; this.phSpin = opts.phantasm.spin; }
    if (opts?.phantomOrb) {
      this.phantomOrb = true;
      this.orbOwnerId = opts.phantomOrb.ownerId;
      this.orbAi0 = opts.phantomOrb.ai0 ?? 0;
    }
    this.mlBoulder = !!opts?.mlBoulder;
    this.martianRocket = !!opts?.martianRocket;
    // 沙球族自动激活（SetDefaults aiStyle 10 表驱动，无需 opts 注入）
    this.sandBall = SAND_BALL_PROJ.has(projId);
    // 信号枪族自动激活（SetDefaults aiStyle 33 表驱动：163 :2517-2526 等）
    this.flare = FLARE_PROJS.has(projId);
    // 钉自动激活（SetDefaults aiStyle 93 :5843-5852，钉枪 3107 / 钉弹 3108 shoot）
    this.nail93 = projId === 514;
    if (opts?.starFall) {
      this.starFallLine = opts.starFall.lineY;
      this.starFallGen = opts.starFall.gen ?? 0;
    }
    if (opts?.piranha) {
      this.piranha = opts.piranha;
      this.pShootSpeed = Math.hypot(vx, vy);   // Game 侧可覆写为精确 shootSpeed
    }
    // 荆棘链族自动激活（SetDefaults aiStyle 4：7/8 :876-887 / 150-152 :2400-2412——
    // alpha=255 渐显起点 + tileCollide=false 穿墙 + penetrate=-1 已由数据表承载）
    this.thornChain = THORN_CHAIN_PROJS.has(projId);
    if (opts?.thornChainAi1) this.thornAi1 = opts.thornChainAi1;
    // ---- ★R28 中期魔法族激活（发射链挂点在 Game.ts,实体侧出生自校正/专属 AI）----
    // ★birthLock：兄弟弹生成期间不再自挂 pending（否则每枚兄弟弹首子步再次
    // 展开 = 指数弹幕爆炸,探针实证过的坑）
    // 336 松针弹：梯次扇自校正挂起（仅玩家弹——敌侧 336 无此几何）
    if (projId === 336 && !this.hostile && !Arrow.birthLock) {
      this.rp30Pending = true;
      // 发射侧 ai[0] 初值 rand(0,10(i+1))（Player.cs:48085 aiArgs1）→ 重力门
      // 50−init 子步前移；本弹 = i=0 档 rand(0,10)
      this.gravDelay = Math.max(1, 50 - Math.floor(Math.random() * 10));
    }
    // 337 暴雪雪片：天顶双锥几何自校正 + 固定起始帧（ai[1]=rand.Next(5) :48115）
    if (projId === 337 && !this.hostile && !Arrow.birthLock) {
      this.blz337Pending = true;
      this.pinFrame = Math.floor(Math.random() * 5);
    }
    // 316 蝙蝠杖蝠：2-3 只散布自校正（:48820-48830 num124=rand.Next(2,4)）
    if (projId === 316 && !this.hostile && !Arrow.birthLock) {
      this.bat316Pending = true;
      this.batBaseVx = vx;
      this.batBaseVy = vy;
    }
    // 659 灵魂之焰：悬浮出生态自校正（ctor 快照基准向——Game 以 aim×3 直射出膛,
    // 原版方向=全圆随机 CanHit 试选、速度归零 :49297-49310）
    if (projId === 659 && !Arrow.birthLock) {
      const l659 = Math.hypot(vx, vy);
      if (l659 > 0.01) { this.sf659DirX = vx / l659; this.sf659DirY = vy / l659; }
      this.sf659Birth = !this.hostile;
    }
    // 511-513 毒云泡：aiStyle92 AI 头 tileCollide=false 每 update 直写（:33159）+
    // UseGroupStaticImmunity(511)=IDStatic 共享免疫 10t（:10678-10687——提取器
    // 未建模该两列,常量补）
    if (projId >= 511 && projId <= 513) {
      this.noTileCollide = true;
      this.idStaticGroup = 511;   // 组共享免疫键（命中环 idStaticCheck(511,…) 消费）
      this.idStaticCdMs = 167;    // idStaticNPCHitCooldown=10t ≈167ms
      this.cloudPhase = Math.random() * Math.PI * 2;
    }
  }

  /** GetAlpha 渲染近似（修复4；Projectile.cs:75940 GetAlpha → canvas globalAlpha）。
   *  缺省路径（:76837-76850）= RGB×(1−alpha/255)/A=255−alpha → 不透明度 (255−α)/255；
   *  特例型按 GetAlpha 固定返回色折算。null = 无覆写（保持 1）。
   *  280 黄金雨：SetDefaults alpha=255（:3402）+ 缺省路径 → 全程隐形（视觉=尘流，
   *  AI 侧每子步 3×尘 170）/ 477/478 镖：:76303-76308 alpha==0 → (255,255,255,200)
   *  否则 (0,0,0,0) → 前 3 拍隐形后 200/255 / 94/95：:76322-76326 固定
   *  (200,200,200,25) → 200/255 近似（近加算微透）/ 521/639：缺省路径淡入 */
  private drawGlobalAlpha(): number | null {
    switch (this.projId) {
      case 280: return 0;
      case 477: case 478: return this.alpha === 0 ? 200 / 255 : 0;
      case 94: case 95: case 1114: return 200 / 255;   // 1114 日耀花弹同支（:81007 GetAlpha (200,200,200,25)）
      case 521: case 639: return (255 - this.alpha) / 255;
      // 207/837（GetAlpha :76682-76687：r=g=b=255−alpha → 缺省路径同式）/
      // 92（aiStyle5 通用闪烁档 :22222-22238，alpha 0↔200 振荡）/
      // 163 族信号弹（SetDefaults alpha=255 :2523，AI_033 −50/t 渐显 :27428-27435
      // → 缺省路径同式，5 拍淡入）
      case 207: case 837: case 92: return (255 - this.alpha) / 255;
      case 442: return (255 - this.alpha) / 255;   // 电圈导弹渐显（缺省 GetAlpha 路径同式 :76837-76850）
      case 114: return (255 - this.alpha) / 255;   // 邪恶三叉戟（缺省路径同式;AI 侧速度 Remap 改写）
      case 604: return (255 - this.alpha) / 255;   // 孢子云（aiStyle 115 alpha+10/t 淡出 :35062-35068）
      case 131: case 732: return (255 - this.alpha) / 255;   // 蘑菇孢子/风暴气旋渐隐（AI_030 :27154/AI_044 :28307 alpha 累加,GetAlpha 缺省路径同式）
      case 163: case 310: case 1008: case 1009: case 1010: case 1011:
        return (255 - this.alpha) / 255;
      case 514: return (255 - this.alpha) / 255;   // 钉 aiStyle 93 渐显（:33427-33434）
      case 246: case 311: return (255 - this.alpha) / 255;   // 刺炮弹/糖果玉米渐显
      // aiStyle 36 蜂族（SetDefaults alpha=255，AI −50/update 渐显 :27690-27697——
      // GetAlpha 缺省路径 r=g=b=255−alpha 同式）/ 616 涡旋弹（−25/t :58378-58384）/
      // 659 灵魂之焰（−12/t :36901-36903）
      case 181: case 189: case 307: case 316: case 566:
      case 616: case 659: return (255 - this.alpha) / 255;
      case 617: return (255 - this.alpha) / 255;   // 星璇秘术渐显（:35290-35295）
      case 618: return 0;                          // 星璇火花恒隐身（alpha 恒 255 :35533）
      // ---- R27 ----
      // 22 水花权杖 / 27 水矢：SetDefaults alpha=255（:1048/:1103）+ GetAlpha 缺省路径
      // num14=(255−alpha)/255=0 → 弹体贴图全程隐形，视觉本体=AI 尘水流（红队 R27 §2/§6
      // 补强：尘载体已接,原'防整弹消失'豁免解除）
      case 22: case 27: return 0;
      // ★R28：294 暗影束/295 地狱火叉弹/296 火柱爆区（aiStyle48/50 SetDefaults
      //   alpha=255 → GetAlpha 缺省路径 A=255−alpha=0 全程隐形,视觉本体=编排尘焰,
      //   红队 R28 §1/§2）/ 535 美杜莎之首（挂首模型由 MedusaHeadProj 承载,
      //   转换前的通用 Arrow 帧不显示）
      case 294: case 295: case 296: case 535: return 0;
      // ★R29：630 幻象弓载体（aiStyle75,DrawProj :33xxx 画的是持弓姿态非弹体贴图,
      // 本仓未建模载体绘制 → 隐形,P2 登记）/ 631 幻象矢（alpha255 渐显 :6786,AI_122
      // −15/t）/ 661 黑爆弹（alpha255 渐显 :7117,AI −55/t + scale1.3）/
      // 819 血箭（alpha255+hide :8001,DrawProj −20/t 渐显——本体近乎全隐,视觉=拖尾）/
      // 955 星星炮星（AI_005 通用闪烁档 :24200-24213 alpha 0↔200 ±25/t）/
      // 728 超级星（AI_151 −10/t 钳 100 :22340-22343）
      case 630: return 0;
      case 410: return (255 - this.alpha) / 255;   // 泡泡枪泡体（ai72 alpha 255→50,缺省 GetAlpha 路径同式）
      case 631: case 661: case 819: case 955: case 728: return (255 - this.alpha) / 255;
      // 337 暴雪法杖雪片（GetAlpha :81157 = (250,250,250,150) 半透白——恒定档,
      // 不随 alpha 字段变化）
      case 337: return 150 / 255;
      // aiStyle4 荆棘链（7/8 :876 / 150-152 :2408 alpha=255 起）：GetAlpha 缺省路径
      // （150 族固定支 :81311 同式）→ 不透明度=(255−alpha)/255——渐显(−50[/−75]/update
      // 至 0)后淡出(+5[nettle+3] 至 ≥255 Kill)全程可见度随 alpha 反相
      case 7: case 8: case 150: case 151: case 152: return (255 - this.alpha) / 255;
      // 876 zapinator（GetAlpha :81458-81464 与 88/89/100 等同支）：alpha<200 →
      // (255−alpha)白加算、≥200 Transparent——出生 25.5 update 渐显白光
      case 876: return this.alpha >= 200 ? 0 : (255 - this.alpha) / 255;
      // ---- Xenopopper 子弹族（GetAlpha :81040-81100 区段）——白化档走 drawXenoFilter ----
      case 445: return (128 / 255) * (1 - this.alpha / 255);   // (255,255,255,128)×(1-α/255)
      case 446: return 1 - this.alpha / 255;                   // Lerp(白,0.8)×(1-α/255)
      case 447: return 200 / 255;                              // (255,255,255,200) 恒
      case 450: return (255 - this.alpha) / 255;               // (200,200,200,255-α)
      case 451: case 684: return (255 - this.alpha) / 255;     // 白×((255-α)/255)
      case 452: case 454: return 1 - this.alpha / 255;         // 白×(1-α/255)
      case 440: case 449: case 606: return (255 - this.alpha) / 255;  // r=g=b=255-α 纯白剪影
      default: return null;
    }
  }

  /** Xenopopper 子弹族加算发光（原版 GlowMask 214 族 + 泡泡残余光观感——
   *  442/445-447/449-451 等破裂弹在原版带青紫光晕，缺层=弹体暗淡偏色） */
  private static readonly XENO_GLOW = new Set([435, 436, 437, 439, 440, 442, 445, 446, 447, 449, 450, 451, 452, 454]);

  /** Xenopopper 子弹族白化滤镜（GetAlpha Lerp(白,k) 的 Canvas 近似——
   *  446 向白混 0.8 / 447-454 全白化 / 440/449/606 纯白剪影。
   *  brightness 提亮 + saturate 去色近似 Lerp 白；返回 null = 无调制） */
  private drawXenoFilter(): string | null {
    switch (this.projId) {
      case 446: return 'brightness(1.8) saturate(0.35)';
      case 447: case 451: case 684: case 452: case 454: return 'brightness(1.6) saturate(0.3)';
      case 445: return 'brightness(1.5) saturate(0.4)';
      case 450: return 'brightness(1.25) saturate(0.5)';
      case 440: case 449: case 606: return 'brightness(2.2) saturate(0)';   // 纯白剪影
      default: return null;
    }
  }

  /** GetAlpha 全量表调制（vanillaProjAlpha.ts ← Projectile.cs:75940-76850 全分支 307 id）。
   *  在 drawGlobalAlpha（现有专属档）之后消费——返回 null = 无覆写。
   *  语义约定（表头注释详述）：RGB 乘子折进 globalAlpha；Lerp(白,k) 用
   *  brightness/saturate 滤镜近似（复用 drawXenoFilter 模式）；off=1 的登记项不消费。 */
  private drawTableAlpha(): { ga: number; filter: string | null } | null {
    const m: ProjAlphaMod | undefined = PROJ_ALPHA_MOD[this.projId];
    if (!m || m.off) return null;
    const a = this.alpha;
    const fade = 1 - a / 255;
    // 固定色 rgb 滤镜：纯白=无；灰阶=brightness(r/255)；彩色=亮度近似（色相偏移未建模）
    const rgbFilter = (rgb: readonly number[] | undefined): string | null => {
      if (!rgb) return null;
      const [r, g, b] = rgb;
      if (r === 255 && g === 255 && b === 255) return null;
      if (r === g && g === b) return `brightness(${(r / 255).toFixed(3)})`;
      return `brightness(${(((r + g + b) / 3) / 255).toFixed(3)})`;
    };
    // Lerp(newColor,White,k) 白化近似：brightness 使中灰 128 → 128(1−k)+255k，
    // saturate 随 k 去色（k=1 全白剪影，与 drawXenoFilter 440/449/606 档同式）
    const lerpFilter = (k: number): string =>
      k >= 0.999 ? 'brightness(2.2) saturate(0)'
        : `brightness(${(1 - k + (k * 255) / 128).toFixed(2)}) saturate(${Math.max(0, 1 - k * 0.8).toFixed(2)})`;
    switch (m.kind) {
      case 'invisible': return { ga: 0, filter: null };
      case 'fade':
        return { ga: fade * (m.mul ?? 1), filter: m.bright ? `brightness(${m.bright})` : null };
      case 'fade2': return { ga: fade * fade * (m.mul ?? 1), filter: null };
      case 'fixed': return { ga: ((m.rgba?.[3] ?? 255) / 255) * (m.mul ?? 1), filter: rgbFilter(m.rgba) };
      case 'fixedfade':
        return { ga: ((m.rgba?.[3] ?? 255) / 255) * fade * (m.mul ?? 1), filter: rgbFilter(m.rgba) };
      case 'afade': {
        // tail 门（575/596/659）：life<tail → α=255−255·life/tail（GetAlpha :76233-76238）
        let ae = a;
        if (m.tail && this.life < m.tail) ae = 255 - (255 * this.life) / m.tail;
        let ga = Math.max(0, ((m.rgba?.[3] ?? 255) - ae * (m.slope ?? 1)) / 255) * (m.mul ?? 1);
        if (m.inv) ga *= fade;                       // rgb 侧 (255−α) 衰减折进 ga
        return { ga, filter: rgbFilter(m.rgba) };
      }
      case 'lerp': return { ga: fade * (m.mul ?? 1), filter: lerpFilter(m.k ?? 1) };
      case 'lerpkeep': return { ga: m.mul ?? 1, filter: lerpFilter(m.k ?? 1) };
      case 'lerpblack': return { ga: 1, filter: `brightness(${1 - (m.k ?? 0.25)})` };
      case 'lerpcolor':
        // Lerp(newColor,(255,200,60),0.5) 橙化：亮度近似（色相偏移未建模）
        return {
          ga: fade,
          filter: `brightness(${((((m.rgba?.[0] ?? 255) + (m.rgba?.[1] ?? 200) + (m.rgba?.[2] ?? 60)) / 3 / 128) * 0.5 + 0.5).toFixed(2)}) saturate(1.2)`,
        };
      case 'lerpalphain': return { ga: (a / 255) * (m.mul ?? 1), filter: lerpFilter(m.k ?? 1) };
      case 'alpha0': return { ga: a === 0 ? (m.rgba?.[3] ?? 200) / 255 : 0, filter: null };
      case 'alphaLt': return { ga: a < (m.lt ?? 140) ? (m.rgba?.[3] ?? 100) / 255 : 0, filter: rgbFilter(m.rgba) };
      case 'alpha255hide': return { ga: a >= 255 ? 0 : 1, filter: null };
      case 'random': return { ga: a > 0 ? 0 : 200 / 255, filter: null };
      case 'disco': return { ga: 70 / 255, filter: null };
      case 'pulse40': {
        // WrappedLerp(0,255,t)=三角波（Utils.cs:273-281：num=2t,>1 折返）——40t 周期 0→255→0
        const t40 = (((this.life % 40) + 40) % 40) / 40;
        return { ga: t40 <= 0.5 ? t40 * 2 : 2 - t40 * 2, filter: null };
      }
      case 'life': return { ga: Math.min(1, this.life / 255), filter: null };
      case 'life2': return { ga: (100 / 255) * Math.min(1, (3 * this.life) / 255), filter: null };
      default: return null;
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标——
    // 曾双变换把箭甩出屏幕,表现为"箭隐形但能命中")
    const ctx = r.ctx;
    if (!ctx) return;
    // 泰拉刃光束 985 独占（DrawProj_TerraBlade2Shot Main.cs:27670-27712）：
    // Frame(1,4) 四帧 170×170（帧 0 主体/帧 3 白芯）；多层镜像叠画：
    // 蓝(45,124,205)×2 对称 ±π/8 张开 + 绿白内芯 ×2 + 绿(34,177,76) ×2
    // ±0.25 收拢 + 黄绿(181,230,29) + 帧 3 白芯三层递缩——ai[0]=0（未传参）
    // 时各 ±ai0 项归零对称；旋转角=velocity 角（无 +π/2，贴图正交）。
    // 淡出 = Remap(localAI[0],0,25,1,0)
    if (this.terra) {
      const img = projSprite(985);
      if (!img || !(img.width > 0) || img.width === 0) return;
      const fw = img.width, fh = img.height / 4;
      // 淡入淡出（:39344 985 专属）：Remap(t,0,ai1/2,0,1)×Remap(t,ai1+13,ai1+25,1,0)
      const aIn = Math.min(1, this.terraT / (this.terraAi1 * 0.5));
      const aOut = this.terraT <= this.terraAi1 + 13 ? 1
        : Math.max(0, (this.terraAi1 + 25 - this.terraT) / 12);
      const fade = aIn * aOut;
      // num6 双段（:39273 主段 Remap(t,ai1*0.4,ai1+25,0,1)——绘制张合的推进分母）
      const num = Math.min(1, Math.max(0, (this.terraT - this.terraAi1 * 0.4) / (this.terraAi1 + 25 - this.terraAi1 * 0.4)));
      const spread = 1 - num;
      // 绘制 scale（:39341）：Remap(1−(1−num6)²,0,1,1.5,1)×ai2
      const fv = 1 - (1 - num) * (1 - num);
      const terraScale = (1.5 - 0.5 * Math.min(1, Math.max(0, fv))) * this.terraAi2;
      const rot = Math.atan2(this.vy, this.vx);
      const layer = (sy: number, a: number, angOff: number, frame: number, flipV: boolean) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a * fade));
        ctx.translate(this.cx, this.cy);
        ctx.rotate(rot + angOff * this.terraAi0);   // ±ai[0] 方向项（:27694 ai0=±1）
        if (flipV) ctx.scale(1, -1);
        const dw = fw * sy * terraScale;
        ctx.drawImage(img, 0, frame * fh, fw, fh, -dw / 2, -fh * sy * terraScale / 2, dw, fh * sy * terraScale);
        ctx.restore();
        ctx.globalAlpha = 1;
      };
      ctx.imageSmoothingEnabled = false;
      layer(0.95, 0.5, Math.PI / 8 * spread, 0, false);            // 蓝镜像对（±π/8×spread）
      layer(0.95, 0.5, -Math.PI / 8 * spread, 0, true);
      layer(1, 0.12, 0, 0, false);                                 // 绿白内芯（color5 近似）
      layer(1, 0.3, Math.PI / 4 * 0.25 * spread, 0, false);        // 绿 ±0.25 收拢
      layer(1, 0.3, -Math.PI / 4 * 0.25 * spread, 0, true);
      layer(0.975, 0.5, Math.PI / 4 * 0.15 * spread, 0, false);    // 黄绿主芯
      layer(1, 0.6, Math.PI / 4 * 0.05 * spread, 3, false);        // 帧 3 白芯三层
      layer(0.8, 0.5, -0.05, 3, false);
      layer(0.6, 0.4, -0.1, 3, false);
      return;
    }
    // 星怒剑 503 独占：rotation=vel−π/2（:22236-22239），origin (w/2, 70)
    // （Main.cs:29898-29901——34×90 贴图锚点近底部，剑尖前伸 70px）；
    // Opacity = 1−alpha/255 渐显
    if (this.starY !== null) {
      const img = projSprite(503);
      if (!img || !(img.width > 0) || img.width === 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.starAlpha / 255));
      ctx.translate(this.cx, this.cy);
      ctx.rotate(Math.atan2(this.vy, this.vx) - Math.PI / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -img.width / 2, -70, img.width, img.height);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    // 翻滚态用累积角（aiStyle 2）；48/54/93/520/599 平飞期姿态锁定 atan2
    const tumbling = this.tumble && !(this.tumblePoseLock && this.age <= this.gravDelay);
    // 食人鱼姿态由 AI 侧维护（pRot/pFlip）：咬住时 velocity 清零（:26126-26129），
    // 现算 atan2(0,0)=0 会把鱼掰回正右——原版 rotation 在清速前取目标向（:26119-26143）
    // 信号弹同型：rotation = atan2(ai[1], ai[0])+π/2（:27497），贴壁 velocity 清零后
    // ai 向量冻结在末速——现算 atan2(0,0)=0 会把弹头掰回正上
    const ang = this.piranha ? this.pRot
      : this.flare ? Math.atan2(this.flareAi1, this.flareAi0)
        : (tumbling ? this.tumbleRot : Math.atan2(this.vy, this.vx));
    const img = projSprite(this.projId);
    // 喵刀弹 502 彩虹拖尾（Main.cs:32495-32513）：Projectile_250.png（14×32）沿
    // oldPos 逐段——旋转=段向-π/2、纵向拉伸=段长/32、alpha=127/255×(1-i/N)，
    // 画在【本体之前】（原版在本体绘制后叠画，此处先画拖尾再本体等效）
    if (this.projId === 502 && this.meowTrail.length >= 4) {
      const streak = projSprite(250);
      if (streak && (streak.width > 0) && streak.width > 0) {
        const N = this.meowTrail.length / 2;
        for (let i = N - 1; i > 0; i--) {
          const x1 = this.meowTrail[i * 2], y1 = this.meowTrail[i * 2 + 1];
          const x2 = this.meowTrail[(i - 1) * 2], y2 = this.meowTrail[(i - 1) * 2 + 1];
          const segLen = Math.hypot(x2 - x1, y2 - y1);
          if (segLen < 0.01) continue;
          const segAng = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
          ctx.save();
          ctx.translate(x1 + this.w / 2, y1 + this.h / 2);
          ctx.rotate(segAng);
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = (127 / 255) * (1 - i / N);
          // origin (w/2, 0)：段起点为锚、沿段向拉伸到段长（scaleY=段长/贴图高）
          ctx.drawImage(streak, -streak.width / 2, 0,
            streak.width, Math.max(1, segLen));
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }
    // ---- aiStyle 24 书族十份 oldPos 渐隐拖尾（Main.cs:35251 94/:35299 1114——
    //      ai[1]>6 起沿 oldPos[0..9] 绘制,缩放/RGBA 各 ×(9−i)/9,GetAlpha=(200,200,200,25)
    //      ★XNA AlphaBlend=预乘语义（飞灵终审同款）：RGB 全额加算、A=25 只衰背景
    //      10%=加算发光观感——canvas 'lighter' 复刻,source-over 直译=半透灰（用户实报）----
    if ((this.projId === 94 || this.projId === 1114) && this.age > 6
      && this.starTrail.length >= 4) {
      const imgT = projSprite(this.projId);
      if (imgT && (imgT.width > 0)) {
        const baseA = this.drawGlobalAlpha() ?? 1;
        const pts = this.starTrail;
        const m = pts.length / 2;
        const sc = this.projId === 1114 ? 1.2 : 1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < Math.min(10, m - 1); i++) {
          const k = 1 - i / 10;                      // newest 1.0 → oldest 0.1
          const px = pts[(m - 1 - i) * 2], py = pts[(m - 1 - i) * 2 + 1];
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, baseA * k));
          ctx.translate(px + this.w / 2, py + this.h / 2);
          ctx.rotate(this.spinRot);
          ctx.drawImage(imgT, -imgT.width * sc * k / 2, -imgT.height * sc * k / 2,
            imgT.width * sc * k, imgT.height * sc * k);
          ctx.restore();
        }
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    // alpha 通道（修复4）：GetAlpha 近似 → globalAlpha（present/phantasm/piranha 等
    // 专属档在下方各自覆写，id 集不相交）；drawGlobalAlpha 未接的 id 落全量表
    // （vanillaProjAlpha.ts ← Projectile.cs:75940-76850，off=1 登记项不消费）
    const ga = this.drawGlobalAlpha();
    let tableFilter: string | null = null;
    if (ga !== null) ctx.globalAlpha = Math.max(0, Math.min(1, ga));
    else {
      const mod = this.drawTableAlpha();
      if (mod) {
        ctx.globalAlpha = Math.max(0, Math.min(1, mod.ga));
        tableFilter = mod.filter;
      }
    }
    const xenoFilter = this.drawXenoFilter();
    if (xenoFilter) ctx.filter = xenoFilter;
    else if (tableFilter) ctx.filter = tableFilter;
    // 329 焰镰（aiStyle 56）：rotation 恒自旋（不对齐速度）；spriteDirection<0 水平镜像
    if (this.scytheRot !== null) {
      ctx.rotate(this.spinRot);
      if (this.scytheFlip < 0) ctx.scale(-1, 1);
      const scyImg = projSprite(this.projId);
      ctx.imageSmoothingEnabled = false;
      if (scyImg && (scyImg as HTMLImageElement).complete !== false && scyImg.width > 0) {
        ctx.drawImage(scyImg, -scyImg.width / 2, -scyImg.height / 2, scyImg.width, scyImg.height);
      }
      ctx.restore();
      return;
    }
    // 351 礼盒（aiStyle 58）：帧 0/1 随两段重力态；淡入 alpha
    if (this.present) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.presentAlpha / 255));
    }
    // 452 幻影矢（aiStyle 82 :30121-30125 alpha 255−40/t 渐显）/
    // 454 幻影球（aiStyle 83 :30238-30245 alpha 钳 200 后 −5/t，GetAlpha 语义）
    if (this.phantasm) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.phAlpha / 255));
    } else if (this.phantomOrb) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.orbAlpha / 255));
    }
    // 朝右贴图族（PROJ_ROT_RIGHT）：rotation=atan2(vy,vx)（vanilla :26122-26140 模式），
    // 向左运动水平镜像（spriteDirection 语义）；其余默认朝上 atan2+π/2（AI_001 L54877）
    const rightArt = PROJ_ROT_RIGHT.has(this.projId);
    const flipLeft = this.piranha ? this.pFlip : this.vx < 0;
    if (rightArt && flipLeft) {
      ctx.scale(-1, 1);              // 先镜像再旋转（R(π−ang)∘M ≡ 原版 flip+atan2(−vy,−vx)）
      ctx.rotate(Math.PI - ang);
    } else if (PROJ_SPIN[this.projId]) {
      ctx.rotate(this.spinRot);      // 恒旋族（:54741/:54824 累加不对齐速度）
    } else if (this.mlBoulder) {
      ctx.rotate(this.spinRot);      // 1021 巨砾滚动旋转（:24666 rotation += vx·0.06 累积）
    } else if (this.projId >= 167 && this.projId <= 170) {
      ctx.rotate(ang + Math.PI / 2);  // 烟花（AI_034 :30xxx rotation=velocity+π/2）
    } else if (PROJ_NO_ROT.has(this.projId)) {
      /* 直立族（aiStyle 29 零 rotation）：恒不旋转 */
    } else if (PROJ_ROT_ASIS.has(this.projId)) {
      ctx.rotate(ang);               // R27：宝石珠 rotation=velocity.ToRotation()（:38691）
    } else if (this.projId === 477 && this.dartRot !== null) {
      ctx.rotate(this.dartRot);      // 477 水晶镖平滑姿态（:54802-54812，AI 侧维护）
    } else if (this.bee36Tilt !== null) {
      ctx.rotate(this.bee36Tilt);    // aiStyle 36 蜂族（:27716 rotation = velocity.X*0.1f
    } else {                         //   ——微倾不振转；307 小吞噬者 = atan2−π/2（:27698）
      ctx.rotate(rightArt ? ang
        : PROJ_ROT_DIAG.has(this.projId) ? ang + Math.PI / 4   // aiStyle 27 剑气 +45°（:24860）
          : ang + Math.PI / 2);
    }
    // 469 蜂箭（:54789-54798）：vx>0 → spriteDirection=-1（贴图朝左，源翻转语义）
    if (this.projId === 469 && this.vx > 0) ctx.scale(-1, 1);
    // 316 蝙蝠杖蝠（:27704-27710）：vx>0 → spriteDirection=-1（蝠贴图朝左）——
    // 其余蜂族 spriteDirection=sign(vx) 与贴图原生朝向一致不翻转（:27699-27715）
    if (this.projId === 316 && this.vx > 0) ctx.scale(-1, 1);
    // 502 朝向（:22659-22665）：spriteDirection=sign(vx)——贴图在旋转坐标系内水平镜像
    if (this.projId === 502 && this.vx < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    // 食人鱼淡入（aiStyle 39 :26067-26071：alpha 255 起 −50/t，6t 归零）
    if (this.piranha) ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.pAlpha / 255));
    // 多帧行（190 食人鱼 4 帧/837 3 帧）按帧行切片防胶片压扁；单帧走整图。
    // 食人鱼帧号由 AI 推进（:26301-26310 frameCounter≥4 推帧 4 帧循环），
    // 其余型号沿用 age/5 档
    const frames = projFrameCount(this.projId);
    const fIdx = this.piranha ? this.pFrame
      : this.phantomOrb ? this.orbFrame      // 454 帧：列队 6t 切 0/1 / 齐射恒 1（:30250/:30261-30266）
        : this.martianRocket ? this.rkFrame   // 448 帧：3t/帧 3 帧循环（:29862-29868）
          : this.present ? this.presentStage    // 351 礼盒帧 0/1 随两段重力态（:27736/:27749）
            : this.projId === 485 ? this.hwFrame   // 485 狱翼扇翅帧：2 拍/帧 5 帧循环（:54834-54843）
              : this.bee36Tilt !== null ? this.bee36Frame   // aiStyle 36 蜂族：3/6 拍/帧（:27699/:27720）
                : this.pinFrame !== null ? this.pinFrame    // ★R28 337 帧恒 ai[1]（发射掷,AI 不推进 :57927）
                  : Math.floor(this.age / 5) % frames;
    const frameImg = frames > 1 ? projFrameImg(this.projId, fIdx) : null;
    let drawImg: CanvasImageSource | null = frameImg ?? img;
    // R4-32（GetAlpha,Projectile.cs:80604-80613）：aiStyle1 且 PhoenixQuivered||
    // SeraphNecklaced → 箭体画 Color.White*Opacity（全亮）——白帧缓存逐 id 烘焙
    if (this.phoenixQuivered || this.seraphNecklaced) {
      const src = frameImg ?? img;
      if (src) drawImg = whiteSpriteOf(this.projId, frames > 1 ? fIdx : -1, src) ?? drawImg;
    }
    if (drawImg && (drawImg as HTMLImageElement).complete !== false
      && (drawImg.width > 0 || (drawImg as HTMLImageElement).width > 0)) {
      const isXeno = Arrow.XENO_GLOW.has(this.projId);
      // 原生尺寸 × SetDefaults scale（与判定盒 w/h 解耦）：子弹 14 = 2×20×1.2
      // 曳光条；箭 1 = 14×32 贴图 × 1。曾统一拉成 w×w 宽 → 100px 巨型子弹/箭偏小
      // 454 随 alpha 伸展（:30244-30245 scale = 1−alpha/255）
      const s = this.drawScale * (this.phantomOrb ? 1 - this.orbAlpha / 255 : 1);
      const iw = drawImg.width || (drawImg as HTMLImageElement).width;
      const ih = drawImg.height || (drawImg as HTMLImageElement).height;
      // GetAlpha=(200,200,200,25) 加算族（Projectile.cs:81007：15 火球/34 火焰鞭/
      // 93 魔法匕首/94 水晶风暴/95 诅咒之焰/96 敌诅咒火/1114 日耀花/253 霜球/258 火球
      // /102 Prime 炸弹(alpha<255)）——XNA 预乘语义 RGB 全额加算（2026-08-24 清零批
      // 扩族；source-over 直译=半透灰/死板不透明两态皆非）
      if (ADDITIVE_GLOW_PROJS.has(this.projId)) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(drawImg as CanvasImageSource, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.drawImage(drawImg as CanvasImageSource, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
      }
      if (isXeno) {
        // 加算发光叠画（同矩形 lighter α0.45）——原版 GlowMask 214 族观感
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.45;
        ctx.drawImage(drawImg as CanvasImageSource, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.max(0, Math.min(1, ga ?? 1));
      }
    } else {
      // 贴图未就绪：短线兜底
      ctx.strokeStyle = this.projId === 2 ? '#FFB060' : '#D8C8A0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -Math.min(14, Math.hypot(this.vx, this.vy) * 1.4));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 统一消亡出口（Projectile.Kill 语义钩子）：碎镜 1085 近身 150px 坏运等
   *  按弹型分发由 Game 侧 onProjectileDeath 消费 */
  private killNow(game: GameHooks): void {
    // 448 火箭：Kill 全路径 = 爆炸（Projectile.Kill :70544-70580——Item14 音 +
    // 判定盒外扩 112×112 重结算 Damage() + 尘 31×4/228×80；近身 42/撞块/180t
    // 自毁全部走此口）
    if (this.martianRocket) this.rocketExplode(game);
    // 1457 宝石法珠 AoeExplosion 爆段（Kill :77011-77058，黄玉法珠/长袍臂）：
    // Resize(160) 80px 半径 AoE + 伤 ×0.35/GetDamageMultiplier + kb ×0.35
    if (this.gem?.aoeExplosion && !this.dead) this.gemAoeBurst(game);
    // ---- Kill 按弹型音/尘分档（2026-08-22 特殊箭特效批；撞块/寿命/穿透耗尽全
    //      路径同 vanilla Kill() 一处结算）----
    // 1/81 木箭/敌木箭（98/980/1073 同档非本批域）：legacy PlaySound(0)=SoundID.Dig
    // + 尘 7×10（Projectile.cs:70989-70996）
    if (this.projId === 1 || this.projId === 81) {
      game.playSfx?.('dig', 1, this.cx, this.cy);
      for (let i = 0; i < 10; i++) game.spawnDust?.(this.x, this.y, this.w, this.h, 7);
    } else if (this.projId === 2 || this.projId === 82) {
      // 2/82 燃烧箭/敌燃烧箭：legacy PlaySound(0) + 火尘 6×10（:72542-72549）
      game.playSfx?.('dig', 1, this.cx, this.cy);
      for (let i = 0; i < 10; i++) game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 0, 0, 100);
    } else if (this.projId === 474) {
      // 474 骨箭：legacy PlaySound(0) + 骨尘 26×20（scale 0.9，:72550-72557）
      game.playSfx?.('dig', 1, this.cx, this.cy);
      for (let i = 0; i < 20; i++) game.spawnDust?.(this.x, this.y, this.w, this.h, 26, 0, 0, 0, null, 0.9);
    } else if (this.projId === 469 && !this.hostile) {
      // 469 蜂箭 Kill 放蜂（:73369-73390，owner==myPlayer 门 → !hostile 近似）
      this.spawnBeeSwarm(game);
    }
    // ---- ★R28 Kill 爆族分档（音+尘配比逐把照抄行号；撞块/寿命/穿透/命中全路径
    //      同 vanilla Kill() 一处结算）----
    else if (this.projId === 15 || this.projId === 253) {
      // §13/§14 火之花/冰之花（:77763-77783）：Item10 + 20 循环×2 枚 d6(253→d135)
      // （首枚 scale2 noGravity、次枚缺省;初速 −弹速×0.2,后 ×2）
      game.playSfxFiles?.(['Item_10'], 1, this.cx, this.cy);
      const kd = this.projId === 253 ? 135 : 6;
      for (let i = 0; i < 20; i++) {
        const d1 = game.spawnDust?.(this.x, this.y, this.w, this.h, kd,
          -this.vx * 0.2, -this.vy * 0.2, 100, null, 2, true);
        if (d1) { d1.vx *= 2; d1.vy *= 2; }
        const d2 = game.spawnDust?.(this.x, this.y, this.w, this.h, kd,
          -this.vx * 0.2, -this.vy * 0.2, 100);
        if (d2) { d2.vx *= 2; d2.vy *= 2; }
      }
    } else if (this.projId === 510 && !this.hostile) {
      // §10 毒液瓶死亡毒云爆（Kill :75094-75109）：Item107 玻璃碎 + gore 704/705
      // （瓶碎片,−oldVel×0.2）+ owner 本机掷 rand.Next(20,31)=20..30 枚 511-513
      // 毒云泡（随机单位向 ×rand(10,201)×0.01、伤=瓶全额、kb1）——持续悬浮伤害云
      // 是本武器核心输出（区域封锁）;aiStyle92 行为在 subStepAI 511-513 分支
      game.playSfxFiles?.(['Item_107'], 1, this.cx, this.cy);
      GorePiece.newGore(704, this.cx, this.cy, -this.vx * 0.2, -this.vy * 0.2);
      GorePiece.newGore(705, this.cx, this.cy, -this.vx * 0.2, -this.vy * 0.2);
      const nCloud = 20 + Math.floor(Math.random() * 11);          // Next(20,31)
      const entsC = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
      for (let i = 0; i < nCloud && entsC?.add; i++) {
        let ux = Math.floor(Math.random() * 201) - 100;
        let uy = Math.floor(Math.random() * 201) - 100;
        if (ux === 0 && uy === 0) uy = 1;
        const ul = Math.hypot(ux, uy) || 1;
        const spd = (10 + Math.floor(Math.random() * 191)) * 0.01; // ×rand(10,201)×0.01 = 0.10..2.00
        const cloud = new Arrow(this.cx, this.cy, ux / ul * spd, uy / ul * spd,
          this.damage, 1, 511 + Math.floor(Math.random() * 3), null,
          { grav: 0, life: 3600, pierce: -1 });
        cloud.critChance = this.critChance;
        cloud.critBonus = this.critBonus;
        cloud.armorPen = this.armorPen;
        entsC.add(cloud, 'projectiles');
      }
    } else if (this.projId === 316) {
      // §3 蝙蝠杖蝠（:75761-75770）：5×d195（scale0.85,noGravity,v+=弹速×0.5）——无音效
      for (let i = 0; i < 5; i++) {
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 195,
          0, 0, 0, null, 0.85, true);
        if (d) { d.vx += this.vx * 0.5; d.vy += this.vy * 0.5; }
      }
    } else if (this.projId === 337) {
      // §9 暴雪雪片（:77089-77096）：Item27 音 + 10×d197 noGravity
      game.playSfxFiles?.(['Item_27'], 1, this.cx, this.cy);
      for (let i = 0; i < 10; i++) {
        game.spawnDust?.(this.x, this.y, this.w, this.h, 197, 0, 0, 0, null, 1, true);
      }
    } else if (this.projId === 114 && !this.hostile) {
      // §12 邪恶三叉戟沿弹道迸散（:78793-78807）：Item10 + for i∈4..30 若 rand(128)
      // ≥alpha(隐身期不撒)：position−oldV×(30/i) 处 2 枚 d27（scale1.4/0.9,noGravity,
      // v×0.5）——本仓以消亡时速度代 oldVelocity（衰减型死亡两者近同,登记）
      game.playSfxFiles?.(['Item_10'], 1, this.cx, this.cy);
      for (let i = 4; i <= 30; i++) {
        if (Math.floor(Math.random() * 128) < this.alpha) continue;   //（隐身期不撒）
        const bx = this.x - this.vx * (30 / i);
        const by = this.y - this.vy * (30 / i);
        const da = game.spawnDust?.(bx, by, 8, 8, 27, this.vx, this.vy, 100, null, 1.4, true);
        if (da) { da.vx *= 0.5; da.vy *= 0.5; }
        const db = game.spawnDust?.(bx, by, 8, 8, 27, this.vx, this.vy, 100, null, 0.9, true);
        if (db) { db.vx *= 0.5; db.vy *= 0.5; }
      }
    } else if (this.projId === 295 && !this.hostile) {
      // §2 地狱火叉死亡火柱（Kill :75810-75815,owner 本机门）：Center 生成 296 爆区,
      // damage×0.75(int 截断)、kb 继承——150×150 盒驻留 ~135t 对盒内敌持续结算
      if (!this.dead) {
        const pillar = new Arrow(this.cx - 75, this.cy - 75, 0, 0,
          Math.max(1, Math.trunc(this.damage * 0.75)), this.knockback, 296, null,
          { grav: 0, pierce: -1 });
        pillar.critChance = this.critChance;
        pillar.critBonus = this.critBonus;
        pillar.armorPen = this.armorPen;
        const ents = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
        ents?.add?.(pillar, 'projectiles');
      }
    } else if (this.projId === 521 && !this.hostile) {
      // §11 水晶蛇死亡链（:74663-74700）：Item110 + 20×d254（1/3 type++→255、
      // fadeIn/scale 抖动、v×2.5−oldVel/10）+ owner 本机 3..5 枚 522 小蛇
      //（随机单位向 ×rand(70,101)×0.1、伤 ×0.8 int 截断、kb ×0.8）
      game.playSfxFiles?.(['Item_110'], 1, this.cx, this.cy);
      for (let i = 0; i < 20; i++) {
        let t = 254;
        let fadeIn: number | null = null;
        let sc = 1.2 + (Math.floor(Math.random() * 21) - 10) * 0.01;
        if (Math.floor(Math.random() * 3) === 0) {
          t = 255;
          fadeIn = 1.1 + (Math.floor(Math.random() * 21) - 10) * 0.01;
          sc = 0.35 + (Math.floor(Math.random() * 21) - 10) * 0.01;
        }
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, t,
          this.vx * 0.1, this.vy * 0.1, 0, null, sc, true);
        if (d) {
          if (fadeIn !== null) d.fadeIn = fadeIn;
          d.vx *= 2.5; d.vy *= 2.5;
          d.vx -= this.vx / 10; d.vy -= this.vy / 10;
        }
      }
      const nSnake = 3 + Math.floor(Math.random() * 3);
      const entsS = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
      for (let k = 0; k < nSnake && entsS?.add; k++) {
        let ux = Math.floor(Math.random() * 201) - 100;
        let uy = Math.floor(Math.random() * 201) - 100;
        if (ux === 0 && uy === 0) uy = 1;
        const ul = Math.hypot(ux, uy) || 1;
        const spd = (70 + Math.floor(Math.random() * 31)) * 0.1;   // rand(70,101)×0.1 = 7.0..10.0
        const snake = new Arrow(this.x + this.w / 2, this.y + this.h / 2,
          ux / ul * spd, uy / ul * spd,
          Math.max(1, Math.trunc(this.damage * 0.8)), this.knockback * 0.8, 522, null,
          { grav: 0, life: 40, pierce: 1 });
        snake.critChance = this.critChance;
        snake.critBonus = this.critBonus;
        snake.armorPen = this.armorPen;
        entsS.add(snake, 'projectiles');
      }
    }
    // ---- ★R28 死亡 AoE 二次结算两件（Resize+Damage() 模式,NebulaBlazeBurst/
    //      LunarFlareStar 同构第三/四例）----
    // ★R35 清单①：410 泡泡破裂（Kill :74257-74280）——Item54 爆泡音+10× d212 环状尘
    //（尘位=Center+normalize(尘−Center)×10×ai[1]×scale,速度向外;num306=10×ai[1]）
    if (this.projId === 410 && !this.dead) {
      game.playSfxFiles?.(['Item_54'], 1, this.cx, this.cy);
      const bsc = this.bubbleScale || 1;
      const br = 10 * bsc;
      for (let bp = 0; bp < 10; bp++) {
        const bd = game.spawnDust?.(this.cx - br, this.cy - br, br * 2, br * 2, 212,
          0, 0, 0, null, bsc, true);
        if (bd) {
          const bl = Math.hypot(bd.vx, bd.vy) || 1;
          bd.vx = (bd.vx / bl) * (45 + Math.floor(Math.random() * 46)) / 10;
          bd.vy = (bd.vy / bl) * (45 + Math.floor(Math.random() * 46)) / 10;
        }
      }
    }
    // ★R35 清单③：烟花四式爆花（Kill :74257 起,各 400 尘 noGravity scale1.3——
    // 167=d130 四环速 4/8/12/16;168=d131 速 2×(i/100)→10→13;169=d132 旋臂花
    // （rand 5-8 臂×Lerp 弧,本仓简化环阵登记）;170=d133/134 交替速 16/11/8/5）
    if (this.projId >= 167 && this.projId <= 170 && !this.dead) {
      const fwVel = (dt: number, dType: number, i: number): void => {
        const bd = game.spawnDust?.(this.cx - 3, this.cy - 3, 6, 6, dType, 0, 0, 100, null, 1.3, true);
        if (!bd) return;
        bd.noGravity = true; bd.scale = 1.3;
        let dvx = bd.vx, dvy = bd.vy;
        if (dvx === 0 && dvy === 0) { dvx = 1; }
        const dl = Math.hypot(dvx, dvy) || 1;
        const k = dt / dl;
        bd.vx = dvx * 0.5 + dvx * k; bd.vy = dvy * 0.5 + dvy * k;
        void i;
      };
      if (this.projId === 167) {
        for (let i = 0; i < 400; i++) fwVel(i < 100 ? 4 : i < 200 ? 8 : i < 300 ? 12 : 16, 130, i);
      } else if (this.projId === 168) {
        for (let i = 0; i < 400; i++) fwVel(i > 250 ? 13 : i > 100 ? 10 : 2 * (i / 100), 131, i);
      } else if (this.projId === 169) {
        // 旋臂花简化:rand(5,9) 臂均布环阵,速 rand(12,17)（原式 Lerp 弧线登记备案）
        const arms = 5 + Math.floor(Math.random() * 4);
        for (let ai9 = 0; ai9 < arms; ai9++) {
          const aa = (ai9 / arms) * Math.PI * 2;
          for (let k9 = 0; k9 < 20; k9++) {
            const spd9 = (12 + Math.random() * 5);
            const bd9 = game.spawnDust?.(this.cx - 3, this.cy - 3, 6, 6, 132,
              Math.cos(aa) * spd9, Math.sin(aa) * spd9, 100, null, 1.3, true);
            if (bd9) { bd9.noGravity = true; bd9.scale = 1.3; }
          }
        }
      } else {
        for (let i = 0; i < 400; i++) {
          const tier = i > 300 ? 5 : i > 200 ? 8 : i > 100 ? 11 : 16;
          fwVel(tier, i > 100 ? (i > 300 ? 134 : 133) : 133, i);
        }
      }
    }
    if (this.projId === 617 && !this.dead) this.arcanumDeathBurst(game);
    else if (this.projId === 659 && !this.dead && this.sf659Ai0 >= 0) this.flame659DeathBurst(game);
    // ★R29 玛瑙爆破枪黑爆二段（Kill :73493-73540）：Resize(160)→Damage() AoE
    else if (this.projId === 661 && !this.dead && !this.hostile) this.blackBolt661Burst(game);
    // §1 暗影束消亡：补铺末段（Kill :71840-71870 从最后锚点到死亡位广播）
    if (this.projId === 294 && !this.hostile && this.sbL0 > 9
      && (this.sbAx > 0 || this.sbAy > 0)) {
      this.shadowbeamSegment(game);
      game.broadcastParticleOrchestra?.(Arrow.SHADOWBEAM_ORCHESTRA_IDX, this.cx, this.cy,
        this.sbAx, this.sbAy, Math.round(Math.hypot(this.vx, this.vy) * 1000));
    }
    // ★91/92 圣箭星雨（:72250-72287）/ 41 狱炎箭 64×64 爆炸（:73256-73293）/
    // 89 水晶碎裂（:72289+）已由尾部 onProjectileDeath 分发到 Game 侧实现
    // （Game.onProjectileDeath projId 分支），此处不内结防双触发
    // R4-32（Projectile.cs:71881-71893）：SeraphNecklaced 弹死亡 → SilverBulletSparkle
    // ×(4+Next(2))——银白火花（编排器粒子本仓无池,spawnParticles 近似）
    if (this.seraphNecklaced) {
      game.spawnParticles(this.cx, this.cy, '#E8E8FF', 4 + (Math.random() < 0.5 ? 1 : 0), 2.2,
        { life: 18, grav: 0.05, damp: 0.94 });
    }
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h, this.vx, this.vy,
      this.damage, { hostile: this.hostile, ai0: this.starFallGen, kb: this.knockback,
        arpen: this.settlePen, sc: this.drawScale });
  }

  /** 448 Kill 爆炸（:70544-70580）：position 归心后 width=height=112 重开判定盒
   *  结算 Damage_EVP（爆炸即是本弹的伤害投递方式——接触路径在 42px 近爆门前
   *  恒先消亡），尘近似 31×4 + 228×80（gore 61-63 略） */
  private rocketExplode(game: GameHooks): void {
    const cx = this.cx, cy = this.cy;
    this.x = cx - 56;
    this.y = cy - 56;
    this.w = 112;
    this.h = 112;
    game.playSfxFiles?.(['Item_14'], 1, cx, cy);
    game.spawnParticles(cx, cy, '#FFC860', 22, 4, { life: 26, damp: 0.93 });
    game.spawnParticles(cx, cy, '#907858', 4, 2, { life: 24 });
    hitPlayer(this, game, this.damage);   // :70580 Kill 内 Damage() 二次结算
  }

  /** 469 蜂箭 Kill 放蜂（Projectile.cs:73369-73390）：6 拍循环、奇数拍（1/3/5）
   *  再掷 Next(3)==0 才放（期望 4 只、3-6 只区间）；出生点 = position −
   *  oldVelocity 归一×8×i；速度 = Next(-35,36)×0.01 + oldVelocity/6（aiStyle 36
   *  追踪 AI 未建模——直线漂移近似，同 Game 蜂蜜斗篷反击蜂先例，登记）；
   *  蜂型 = beeType()（Player.cs:12006 Hive Pack 3333 半数 566 巨蜂——equipStats
   *  无 strongBees 通道恒 181，登记）/ 伤 = beeDamage(damage/3)（:12017 181 档
   *  +Next(2)）/ kb = beeKB(0)=0（:12026）；penetrate=2、magic=false/ranged=true
   *  （:73388-73390——ranged 走冰霜引擎门 frostEligible） */
  private spawnBeeSwarm(game: GameHooks): void {
    const ents = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
    if (!ents?.add) return;
    const ol = Math.hypot(this.vx, this.vy);
    const nx = ol > 0 ? (this.vx / ol) * 8 : 0;   // vector65 = oldVelocity 归一 ×8
    const ny = ol > 0 ? (this.vy / ol) * 8 : 0;
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 1 && Math.floor(Math.random() * 3) !== 0) continue;   // :73374 奇数拍 1/3
      const bee = new Arrow(this.x - nx * i, this.y - ny * i,
        (Math.floor(Math.random() * 71) - 35) * 0.01 + this.vx / 6,
        (Math.floor(Math.random() * 71) - 35) * 0.01 + this.vy / 6,
        Math.trunc(this.damage / 3) + Math.floor(Math.random() * 2), 0, 181, null, {});
      bee.pierce = 2;                       // :73390 覆盖 181 表值 penetrate 3
      bee.pierceInit = 2;
      bee.frostEligible = true;             // ranged = true（:73389-73390）
      bee.critChance = this.critChance;
      bee.critBonus = this.critBonus;
      bee.armorPen = this.armorPen;
      ents.add(bee, 'projectiles');
    }
  }

  /** 710 空中祸害命中撒裂片（Damage() :13165-13168 → BetsySharpnel :51075-51091）：
   *  5 枚 710 = (0,6).RotatedBy(π/4 − i·π/6)（num3 = −2×(π/4)/(5−1)），同伤/kb、
   *  出生 ai[1]=-1（abShard 标——裂片不再撒裂片 :51077 门）；CopyLocalNPCImmunityTo
   *  对 710 为空表（无 usesLocalNPCImmunity）不接 */
  private spawnBetsyShards(game: GameHooks): void {
    const ents = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
    if (!ents?.add) return;
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI / 4 - (Math.PI / 6) * i;          // num + num3×i
      const s = new Arrow(this.cx, this.cy, -6 * Math.sin(ang), 6 * Math.cos(ang),
        this.damage, this.knockback, 710, null, {});
      s.abShard = true;                                     // ai[1] = -1（:51086 尾参）
      s.frostEligible = true;
      s.critChance = this.critChance;
      s.critBonus = this.critBonus;
      s.armorPen = this.armorPen;
      ents.add(s, 'projectiles');
    }
  }

  /** ★R29 幻象弓命中侧补刀链（Projectile.cs:13935-13943）：phantasmTime>0（630 载体
   *  在场续窗）时任何 arrow 弹（arrow=true 且 type≠631）命中 NPC → 从玩家身体随机点
   *  （position+Size×RandomVector2(0,1)）朝目标补 3 枚 631 幻象矢——方向=归一(目标−
   *  源点)×6、伤=damage×30%（int 截断）、kb=0、ai[0]=受害者 / ai[1]=0/15/30 错峰延迟 */
  private spawnPhantasmChase(game: GameHooks, target: { id: number; cx: number; cy: number }): void {
    const ents = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
    if (!ents?.add || !Arrow.phantasmWindowActive()) return;
    const p = game.player;
    const sxp = p.x + p.w * Math.random();
    const syp = p.y + p.h * Math.random();
    const dxp = target.cx - sxp, dyp = target.cy - syp;
    const dlp = Math.hypot(dxp, dyp) || 1;
    const vx631 = dxp / dlp * 6, vy631 = dyp / dlp * 6;
    const dmg631 = Math.max(1, Math.trunc(this.damage * 0.3));
    for (const delay of [0, 15, 30]) {
      const c = new Arrow(sxp, syp, vx631, vy631, dmg631, 0, 631, null,
        { grav: 0, life: 1200 });
      c.ph631Tgt = target.id;
      c.ph631Delay = delay;
      c.critChance = this.critChance;
      c.critBonus = this.critBonus;
      c.armorPen = this.armorPen;
      ents.add(c, 'projectiles');
    }
  }

  /** 710 空旷判定（Damage() :12236-12239）：WorldUtils.Find(Center, Down(12)+notNull
   *  +solid) 未找到实心 = 空旷 → 命中伤 ×1.5。Down(12) 自锚点格起向下探 12 格
   *  （Searches.Down :44-55 含 i=0） */
  /** 876 命中侧随机化的 ai[1] 态（tileCollide 关断窗——AI 拍据此恢复,见 subStep 876 支） */
  private zapAi1 = 0;
  /** 876 zapinator 命中侧随机化（Damage_PVE type 876 支 Projectile.cs:12691-12777 逐行，
   *  掷序敏感）。rand(N)==0 语义 = 1/N 概率（Terraria Next(N) 右开）；±256 瞬移后
   *  tileCollide=false 由 AI :56892-56901 按 ai[1] 态恢复。Collision.SolidTiles 回退门
   *  以"命中点格实心"近似（弹盒 4×4 单格覆盖）。 */
  private zapinatorHitChaos(game: GameHooks): void {
    const ri = (n: number): number => Math.floor(Math.random() * n);   // [0,n)
    const solidAt = (px: number, py: number): boolean => {
      const st = game.world.store;
      const bx = Math.floor(px / TILE), by = Math.floor(py / TILE);
      return st.inBounds(bx, by) && st.isSolid(bx, by);
    };
    let tc = !this.noTileCollide;                        // 当前 tileCollide 态（AI 拍已恢复）
    if (ri(20) === 0) { tc = false; this.x += ri(513) - 256; }          // X 瞬移 ±256
    if (ri(20) === 0) { tc = false; this.y += ri(513) - 256; }          // Y 瞬移 ±256
    if (ri(2) === 0) tc = false;
    if (ri(3) !== 0) {                                   // 2/3：残像回退 −velocity×[0,39]
      const vx0 = this.x, vy0 = this.y;
      let back = ri(40);
      this.x -= this.vx * back; this.y -= this.vy * back;
      if (tc && solidAt(this.cx, this.cy)) {
        this.x = vx0; this.y = vy0;
        back = ri(40);
        this.x -= this.vx * back; this.y -= this.vy * back;
        if (tc && solidAt(this.cx, this.cy)) { this.x = vx0; this.y = vy0; }
      }
    }
    this.vx *= 0.6;                                      // (:12722)
    this.vy *= 0.6;
    if (ri(7) === 0) this.vx += 0.3;                     // rand(30,31)*0.01（:12723-12726）
    if (ri(7) === 0) this.vy += 0.3;
    this.damage = Math.max(1, Math.trunc(this.damage * 0.9));   // (int)((double)*0.9)
    this.knockback *= 0.9;
    if (ri(20) === 0) this.knockback *= 10;
    if (ri(50) === 0) this.damage *= 10;
    if (ri(7) === 0) {                                   // ±64 抖位 X（SolidTiles 回退）
      const x0 = this.x;
      this.x += ri(129) - 64;
      if (tc && solidAt(this.cx, this.cy)) this.x = x0;
    }
    if (ri(7) === 0) {                                   // ±64 抖位 Y
      const y0 = this.y;
      this.y += ri(129) - 64;
      if (tc && solidAt(this.cx, this.cy)) this.y = y0;
    }
    if (ri(14) === 0) this.vx *= -1;                     // (:12763-12768)
    if (ri(14) === 0) this.vy *= -1;
    if (ri(10) === 0) {                                  // ×rand(1,201)*0.0005（:12769-12772）
      const k = (1 + ri(200)) * 0.0005;
      this.vx *= k; this.vy *= k;
    }
    this.zapAi1 = tc ? 0 : 1;                            // (:12775-12777 ai[1] = tileCollide?0:1)
  }

  private skyOpen12(game: GameHooks): boolean {
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    for (let k = 0; k < 12; k++) {
      const y = ty + k;
      if (!st.inBounds(tx, y)) break;
      if (st.isSolid(tx, y)) return false;
    }
    return true;
  }

  /** ApplyHarpyCharm（Projectile.cs:58779-58807）：引矢落标——rotateTowards
   *  (maxChange=π :58781/:58784) 一步全转保速 + 置 HarpyCharmed 位（:58787）+
   *  6181→PhoenixQuivered（:58788-58791）/ 6180→SeraphNecklaced（:58792-58795）+
   *  timeLeft 钳 ≤300（:58797-58800）。粒子（:58802 HarpyCharm/PhoenixQuiver/
   *  SeraphNecklace 三型）视觉面省略。 */
  applyHarpyCharm(tcx: number, tcy: number, itemVid: number): void {
    const sp = Math.hypot(this.vx, this.vy);
    const want = Math.atan2(tcy - this.cy, tcx - this.cx);
    this.vx = Math.cos(want) * sp;                       // rotateTowards π = 全角一步到位
    this.vy = Math.sin(want) * sp;
    this.harpyCharmed = true;                            // :58787
    if (itemVid === 6181) this.phoenixQuivered = true;   // :58788-58791
    if (itemVid === 6180) this.seraphNecklaced = true;   // :58792-58795
    if (this.life > 300) this.life = 300;                // :58797-58800 timeLeft 钳 300
  }

  /** Collision.SolidCollision 等价（aiStyle 33 贴壁判定 :27480/:27487）：弹体
   *  6×6 盒覆盖到的格任一实心即 true（SolidCollision 逐格扫盒语义） */
  private flareSolidOverlap(game: GameHooks): boolean {
    const st = game.world.store;
    const x0 = Math.floor(this.x / TILE), x1 = Math.floor((this.x + this.w - 1) / TILE);
    const y0 = Math.floor(this.y / TILE), y1 = Math.floor((this.y + this.h - 1) / TILE);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        if (!st.inBounds(ix, iy)) continue;
        if (st.isSolid(ix, iy)) return true;
      }
    }
    return false;
  }

  /** ★R28 出生自校正（首个子步恰一次）：发射链挂点在 Game.ts case 'magic'
   *  （R26 蓝队文件分区，通用链以"单发直射出膛"为唯一形态），原版 Player.Shoot
   *  的多发梯次扇/天顶双锥/悬浮出生态几何在此按公式重构。
   *  锚定约定：本弹 = 原版发射循环的某一发（Game 出膛参数 = 未散布基准向量 +
   *  枪口点，与原版 i 循环首项同形）；兄弟弹经 entities 桶补齐。 */
  private birthSelfCorrect(game: GameHooks): void {
    const ents = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
    // ---- §8 336 松针手枪梯次扇（Player.cs:48067-48086）----
    // num30 = 2+rand.Next(3) 发；第 i 发 speed += rand(±35)×0.025×i 后重归一
    // ×shootSpeed(12)；出生点 = muzzle + baseV×(count−i)×1.75（沿弹道梯次排布）；
    // ai[0] 初值 rand(0,10(i+1))（重力门 50−init 子步,ctor/i=0 与此处兄弟弹同式）
    if (this.rp30Pending) {
      this.rp30Pending = false;
      Arrow.birthLock = true;
      try {
      const n30 = 2 + Math.floor(Math.random() * 3);
      const mzx = this.x, mzy = this.y;                     // 枪口（本弹原始出生位）
      const bvx = this.vx, bvy = this.vy;                   // 未散布基准向量（×12）
      const spd336 = Math.hypot(bvx, bvy) || 12;
      this.x += bvx * (n30 - 0) * 1.75;                     // i=0：前移最远、无散布
      this.y += bvy * (n30 - 0) * 1.75;
      for (let i = 1; i < n30 && ents?.add; i++) {
        let sx = bvx + (Math.floor(Math.random() * 71) - 35) * 0.025 * i;
        let sy = bvy + (Math.floor(Math.random() * 71) - 35) * 0.025 * i;
        const l = Math.hypot(sx, sy) || 1;                  // 重归一到 shootSpeed（:48077-48080）
        const pin = new Arrow(mzx + bvx * (n30 - i) * 1.75, mzy + bvy * (n30 - i) * 1.75,
          sx / l * spd336, sy / l * spd336,
          this.damage, this.knockback, 336, null,
          { grav: 0.5, gravDelay: Math.max(1, 50 - Math.floor(Math.random() * 10 * (i + 1))) });
        pin.critChance = this.critChance;
        pin.critBonus = this.critBonus;
        pin.armorPen = this.armorPen;
        ents.add(pin, 'projectiles');
      }
      } finally { Arrow.birthLock = false; }
    }
    // ---- §9 337 暴雪法杖天顶双锥（Player.cs:48089-48117）----
    // ★R27 multishot 已按 useTime5<anim10 泛化出每击 2 发（vanilla flag4 同数）→
    // 本弹=1 雪片,目标线高度档由静态奇偶轮替（Y−600/Y−700）;原版双发同拍,
    // 本仓两拍相隔 useTime=5 子步窗,登记近似。X = 枪口+rand(201)(−dir)+(鼠标X−玩家X)
    // 折叠玩家中点 ±200;瞄准向 |dy|≥20 恒向下 + 归一 ×speed(10) + rand(±40)×0.02 抖动
    if (this.blz337Pending) {
      this.blz337Pending = false;
      const p = game.player;
      const facing = (p.facing ?? 1);
      const slot = (Arrow.blz337Alt++) % 2;                 // 目标线高度档轮替
      const pcx = p.x + p.w * 0.5;
      let sx = pcx + Math.floor(Math.random() * 201) * -facing + (p.aimWX - p.x);
      sx = (sx + p.cx) / 2 + Math.floor(Math.random() * 401) - 200;
      const sy = p.cy - 600 - 100 * slot;
      let dx = p.aimWX - sx;
      let dy = p.aimWY - sy;
      if (dy < 0) dy *= -1;                                 //（:48103-48106 翻负）
      if (dy < 20) dy = 20;                                 //（:48107-48109 钳 ≥20）
      const len = Math.hypot(dx, dy) || 1;
      const jit = (Math.floor(Math.random() * 81) - 40) * 0.02;
      const vx = dx / len * 10 + jit;
      const vy = dy / len * 10 - jit;                       // 双轴独立掷（:48111-48112）
      this.x = sx; this.y = sy;
      this.vx = vx; this.vy = vy;
      void 0;
    }
    // ---- §3 316 蝙蝠杖 2-3 只散布（Player.cs:48820-48830）----
    // num124 = rand.Next(2,4)；每只 num4/num5 += rand(±35)×0.05 双轴散布
    // （含 i=0——本弹散布在此补掷,与兄弟弹同分布）。无出生点位偏移
    if (this.bat316Pending) {
      this.bat316Pending = false;
      Arrow.birthLock = true;
      try {
      const n124 = 2 + Math.floor(Math.random() * 2);
      const jx = (Math.floor(Math.random() * 71) - 35) * 0.05;
      const jy = (Math.floor(Math.random() * 71) - 35) * 0.05;
      this.vx += jx; this.vy += jy;
      for (let i = 1; i < n124 && ents?.add; i++) {
        const b = new Arrow(this.x, this.y,
          this.batBaseVx + (Math.floor(Math.random() * 71) - 35) * 0.05,
          this.batBaseVy + (Math.floor(Math.random() * 71) - 35) * 0.05,
          this.damage, this.knockback, 316, null,
          { grav: 0, life: 600, pierce: 1 });
        b.critChance = this.critChance;
        b.critBonus = this.critBonus;
        b.armorPen = this.armorPen;
        ents.add(b, 'projectiles');
      }
      } finally { Arrow.birthLock = false; }
    }
    // ---- §4 659 灵魂之焰悬浮出生态（Player.cs:49297-49310）----
    // 方向 = 全圆随机（CanHit 试 ≤10 次）RotatedBy ×(0.95+rand×0.3)；
    // 出生点 = pointPosition + 该向×30；velocity = Zero；ai[0]=−2
    if (this.sf659Birth) {
      this.sf659Birth = false;
      let ang = Math.random() * Math.PI * 2;
      for (let t = 0; t < 10; t++) {
        if (canHitLine(game.world.store, this.cx, this.cy, 0, 0,
          this.cx + Math.cos(ang) * 100, this.cy + Math.sin(ang) * 100, 0, 0)) break;
        ang = Math.random() * Math.PI * 2;                  //（:49299-49304 重掷）
      }
      const mag = 0.95 + Math.random() * 0.3;
      const ux = (this.sf659DirX * Math.cos(ang) - this.sf659DirY * Math.sin(ang)) * mag;
      const uy = (this.sf659DirX * Math.sin(ang) + this.sf659DirY * Math.cos(ang)) * mag;
      this.x += ux * 30;                                    // vector57×30 偏移（:49308）
      this.y += uy * 30;
      this.vx = 0; this.vy = 0;                             // velocity = Zero
      this.sf659Ai0 = -1;                                   // ai[0]=−2 → 无锁态
    }
    // ---- §15 535 美杜莎之首转换（AI_100 :45296-45454 整套挂件模型）----
    // Game 通用链把 3269 当普通魔法杖扣蓝发一枚漂移 Arrow——首子步换成
    // MedusaHeadProj 专用实体并退还本次误扣魔（ShouldSkipManaUse :53329-53331
    // 语义,R26 落地分流后随 MEDUSA_REFUND_LEGACY_CHARGE 关闭）
    if (this.projId === 535) {
      const m = new MedusaHeadProj(game.player, this.damage, this.knockback,
        this.critChance, this.critBonus, this.armorPen);
      if (ents?.add) ents.add(m, 'projectiles');
      this.dead = true;                                     // 静默让位（无尘无声）
    }
  }

  /** ★R28：3269 上游扣魔退还开关——R26 蓝队在 Game.ts case 'magic' 落地
   *  ItemCheck_PayMana_ShouldSkipManaUse(3269) 分流后置 false（见落点清单 #1）
   *  （实际消费在 MedusaHeadProj 同名静态字段,此处注释锚点） */
  static readonly MEDUSA_REFUND_LEGACY_CHARGE = true;

  /** 静态奇偶轮替（337 天顶双锥目标线高度档） */
  private static blz337Alt = 0;
  /** ★R28 出生自校正互斥锁：兄弟弹构造期抑制 ctor 的 pending 自挂（防递归展开） */
  private static birthLock = false;

  /** ParticleOrchestraType.ShadowbeamFriendly 枚举序（ParticleOrchestraType.cs:64,
   *  Keybrand=0 起 → 59）;broadcast 钩子只送联机中继,本地视觉由 shadowbeamSegment 承载 */
  private static readonly SHADOWBEAM_ORCHESTRA_IDX = 59;

  /** §1 束段铺撒（Spawn_Shadowbeam :1987-2005 + SpawnHelper_SpawnInLine :2012-2031）：
   *  从锚点(sbAx/sbAy)到当前心按步距 max(4,|v|) 铺点,每步 3×d173（本位/−dir·0.25|v|/
   *  −dir·0.5|v|）、scale rand(70..110)×0.013、尘速 ×0.2 */
  private shadowbeamSegment(game: GameHooks): void {
    const dxs = this.cx - this.sbAx, dys = this.cy - this.sbAy;
    const dist = Math.hypot(dxs, dys);
    if (dist <= 0) return;
    const spd = Math.hypot(this.vx, this.vy);
    const step = Math.max(4, spd);
    const ux = dxs / dist, uy = dys / dist;
    for (let s = 0; s < dist; s += step) {
      const px = this.sbAx + ux * s;
      const py = this.sbAy + uy * s;
      for (let k = 0; k < 3; k++) {
        const off = k * 0.25 * spd;
        game.spawnDust?.(px - ux * off, py - uy * off, 1, 1, 173,
          0, 0, 0, null, (70 + Math.random() * 40) * 0.013, true);
      }
    }
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // R4-38：宝石法珠首帧音（1457 AI_029_GemStaffs_ActuallyGemStaffs :38543-38551
    // soundDelay==0→-1 闸,统一 Item_205=StackableItem8ForRubyStaff;1120→Item72）——
    // 傀儡侧不播（快照可晚到多拍,迟响比不响更怪;原版客户端全量模拟本 AI,此处
    // 仅拥有端=发声主体）
    if (!this.gemShotSounded && (isGemBolt(this.projId) || this.projId === 1120)) {
      this.gemShotSounded = true;
      game.playSfxFiles?.([this.projId === 1120 ? 'Item_72' : 'Item_205'], 1, this.cx, this.cy);
    }
    // 宝石弹 oldPos 环（Projectile.cs:17236-17245 TrailingMode=2 每 tick 逐位后移，
    // oldPos[0]=本 tick 出生位）——Colliding :15452-15466 FastThenSlow 拖尾扫掠消费
    //（蓝队 R2-02：本仓 Arrow 原无位置历史，补 5 帧环形缓冲）
    if (this.gem) {
      this.gemTrail.unshift(this.x, this.y);
      if (this.gemTrail.length > 12) this.gemTrail.length = 12;
    }
    // 食人鱼 190 独占状态机（aiStyle 39）——重力/穿透递减/撞块消亡等通用语义不适用
    if (this.piranha) { this.piranhaStep(game); return; }
    // 出生预置局部免疫逐帧递减（DecrementLocalImmuneTimeCounters :15919-15936——
    // Update :15330 在 numUpdates 子步循环【前】每 tick 恰一次，非每子步）
    for (const [k, v] of this.spawnImmuneCd) {
      if (v <= 1) this.spawnImmuneCd.delete(k); else this.spawnImmuneCd.set(k, v - 1);
    }
    // extraUpdates 子步循环（Projectile.cs:15331-15336）：numUpdates = extraUpdates，
    // while(numUpdates>=0) 跑完整 AI/位移/命中体——timeLeft 也在循环内逐子步消耗
    //（:15861），故弹体寿命同步缩短为 1/(N+1)。
    // aiStyle 36 蜂族：alpha 归零拍 extraUpdates=0（:27693-27695）——挂起到 tick 头
    // 生效（原版 numUpdates 每 tick 读取一次，当拍子步数不变）
    if (this.bee36EU0) { this.bee36EU0 = false; this.extraUpdates = 0; }
    for (let u = 0; u <= this.extraUpdates; u++) {
      this.subStep(game);
      if (this.dead) return;
    }
  }

  /** 单次子步（无 extraUpdates 时即整帧本体）——timeLeft 递减在 AI/位移/命中之后。
   *  蓝队 R7-5：原版 `timeLeft--; if (timeLeft <= 0) Kill()` 位于子步循环【末尾】
   *  （Update :17307-17311，AI/位移/Damage 之后）——AI 恰好跑 timeLeft 次,且寿命尽
   *  当拍即杀（Kill 链如 AoeExplosion 同拍触发）。曾在子步头递减：全体 Arrow 系
   *  寿命恒少 1 个 AI update（timeLeft 门控型 837 −33 速消/639 重力门级联偏移一拍） */
  private subStep(game: GameHooks): void {
    if (this.life <= 0) { this.killNow(game); return; }   // 防御（正常由尾部递减杀）
    this.subStepAI(game);
    if (this.dead) return;                                // AI 侧已杀（killNow 已走）
    if (--this.life <= 0) this.killNow(game);
  }

  /** 子步 AI 本体（subStep 包装——life 递减/判死收口在包装层） */
  private subStepAI(game: GameHooks): void {
    const world = game.world;
    this.age++;
    // ★R28 出生自校正（首子步一次）——见方法注
    if ((this.rp30Pending || this.blz337Pending || this.bat316Pending
      || this.sf659Birth || this.projId === 535) && !this.hostile) {
      this.birthSelfCorrect(game);
      if (this.dead) return;
    }
    // ---- 荆棘链族（7/8/150-152）独占状态机：UpdatePosition 对 aiStyle4 早退
    //      （Projectile.cs:20552）= 无通用位移（下方位移行按 thornChain 跳过）、
    //      重力恒 0（aiStyle≠1）；命中管线照常（接触伤害在 Damage() 独立结算）。
    //      击杀由 thornStep 内 killNow 收口 ----
    if (this.thornChain) {
      this.thornStep(game);
      if (this.dead) return;
    }
    // 469 蜂箭入水即消亡（AI_001 头 Projectile.cs:51125 `type == 469 && wet &&
    // !honeyWet && !shimmerWet` → Kill()——水/岩浆档，蜂蜜/微光豁免）。
    // 本仓 wet = 弹心格液量 >0 + liquidType ∈ {WATER, LAVA}（LIQUID_TYPE +1 编码）
    if (this.projId === 469) {
      const st469 = world.store;
      const wx = Math.floor((this.x + this.w / 2) / TILE), wy = Math.floor((this.y + this.h / 2) / TILE);
      if (st469.inBounds(wx, wy) && st469.liquid[st469.idx(wx, wy)] > 0) {
        const lt = st469.liquidType[st469.idx(wx, wy)];
        if (lt === LIQUID_TYPE.WATER || lt === LIQUID_TYPE.LAVA) { this.killNow(game); return; }
      }
    }
    // ---- ★R29 幻象弓载体 630（AI_001 type==630 支 Projectile.cs:68194-68295）----
    // ai[0]++ 计龄;加速窗 num67=(age≥40)+(≥80)+(≥120),interval=24−2×num67（四档
    // 24/22/20/18）;ai[1]-- 归零触发 volley（重置 interval）+ soundDelay 节拍器
    //（canShoot 门内 Item_5,首拍 ai[0]==1 豁免）;每拍 player.phantasmTime=2 续窗
    // （本仓静态时间戳 Arrow.phantasmWindowUntil）。volley：canShoot=false → Kill;
    // 成立 → ctl.volley() 现解析弹药（null=无弹药 → Kill）、本体 velocity 重瞄
    // =归一(鼠标−position)×shootSpeed×scale×0.55、一次生成 4 枚真箭
    //（出生点=弹心±Next(−15,15)、速度=归一(velocity)×speed3×(0.6+rand×0.8)、
    // noDropItem、伤/kb/弹型全取弹药终值）
    if (this.projId === 630 && this.ph630Ctl) {
      const ctl = this.ph630Ctl;
      this.ph630Age++;
      let tier630 = 0;
      if (this.ph630Age >= 40) tier630++;
      if (this.ph630Age >= 80) tier630++;
      if (this.ph630Age >= 120) tier630++;
      const interval630 = 24 - 2 * tier630;
      this.ph630VolleyCd--;
      let volley630 = false;
      if (this.ph630VolleyCd <= 0) {
        this.ph630VolleyCd = interval630;
        volley630 = true;
      }
      const canShoot630 = ctl.channel();
      if (--this.ph630SndCd <= 0 && canShoot630) {
        this.ph630SndCd = interval630;
        if (this.ph630Age !== 1) game.playSfxFile?.('Item_5', 1, this.cx, this.cy);
      }
      Arrow.phantasmWindowUntil = performance.now() + 33;   // phantasmTime=2（每拍续窗）
      if (volley630) {
        const res630 = canShoot630 ? ctl.volley() : null;
        if (!res630) { this.killNow(game); return; }
        const aim630 = ctl.aim();
        let dirX630 = aim630.x - this.x, dirY630 = aim630.y - this.y;
        const dl630 = Math.hypot(dirX630, dirY630);
        if (dl630 > 0) { dirX630 /= dl630; dirY630 /= dl630; }
        else { dirX630 = 0; dirY630 = -1; }                 // NaN 兜 −UnitY（:68252-68255）
        // 重瞄速度 = 归一(鼠标−position) × weapon.shootSpeed × scale(1) × 0.55
        //（:68256-68262 num70 = player.HeldItem.shootSpeed × scale——3540 表值
        // shootSpeed=20,与弹药 speed3 无关）
        this.vx = dirX630 * (20 * 0.55);
        this.vy = dirY630 * (20 * 0.55);
        const ents630 = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
        for (let k630 = 0; k630 < 4 && ents630?.add; k630++) {
          const vl630 = Math.hypot(this.vx, this.vy) || 1;
          const sp630 = res630.speed * (0.6 + Math.random() * 0.8);
          const a630 = new Arrow(
            this.x + Math.random() * 30 - 15, this.y + Math.random() * 30 - 15,
            (this.vx / vl630) * sp630, (this.vy / vl630) * sp630,
            res630.dmg, res630.kb, res630.pid, null, {});
          a630.frostEligible = true;
          a630.critChance = this.critChance;
          a630.critBonus = this.critBonus;
          a630.armorPen = this.armorPen;
          ents630.add(a630, 'projectiles');
        }
      }
    }
    // ---- 矛伴生弹 AI 支（AI_019 伴生,R30 §3.2 落点清单 #8,2026-08-25 接通）----
    if (this.projId === 131) {
      // 131 孢子云 = AI_030 default 支（Projectile.cs:27148-27155）：v×0.8 减速悬浮 +
      // rotation += 0.2 自旋（PROJ_SPIN 表消费）+ alpha+4 渐隐,alpha≥255 → Kill(~64t)
      this.vx *= 0.8;
      this.vy *= 0.8;
      this.alpha += 4;
      if (this.alpha >= 255) { this.killNow(game); return; }
    } else if (this.projId === 732) {
      // 732 气旋 = AI_044 type==732 支（:28305-28320）：alpha+12 渐隐 Kill(>255 ~22t)+
      // 1/5 d226 尘(noGravity,v×1.2)+rotation=velocity 向（PROJ_ROT_ASIS 消费）
      this.alpha += 12;
      if (Math.floor(Math.random() * 5) === 0) {
        const d732 = game.spawnDust?.(this.x, this.y, this.w, this.h, 226, 0, 0, 150, undefined, 0.8);
        if (d732) { d732.noGravity = true; d732.vx *= 1.2; d732.vy *= 1.2; }
      }
      if (this.alpha > 255) { this.killNow(game); return; }
    }
    // ---- ★R29 幻象矢 631（aiStyle122 AI_122 :35543-35596）：ai[0]=受害者
    //（命中侧补刀写入 Enemy.id）/ ai[1]=错峰延迟（0/15/30——延迟期 velocity=Zero
    // 定身 return）;目标有效且盒交叠 → Kill+直伤结算;失效态（flag64）velocity==Zero
    // 即 Kill、恢复撞块、alpha+=10 淡出 >255 Kill;有效态 homing v=归一(目标心−弹心)
    // ×12、alpha−=15 钳 0 渐显 ----
    if (this.projId === 631 && !this.hostile) {
      const ents631l = game.enemies();
      let tgt631: { id: number; x: number; y: number; w: number; h: number; dead?: boolean } | null = null;
      for (const ent of ents631l) {
        const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean };
        if (e.id === this.ph631Tgt && !e.dead) { tgt631 = e; break; }
      }
      const valid631 = this.ph631Tgt >= 0 && !!tgt631;
      if (!valid631) this.ph631Tgt = -1;
      if (tgt631
        && this.x < tgt631.x + tgt631.w && this.x + this.w > tgt631.x
        && this.y < tgt631.y + tgt631.h && this.y + this.h > tgt631.y) {
        // 盒交叠 → Kill()+Damage()（:35564-35569——直伤 kb 0,暴击按弹体阈值）
        const crit631 = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
        const rec631 = tgt631 as unknown as { hurt?: (...a: unknown[]) => boolean };
        rec631.hurt?.(Math.max(1, Math.trunc(this.damage)) * (crit631 ? 2 : 1),
          0, 0, game, this.settlePen, crit631, this.pierceInit, true);
        this.killNow(game);
        return;
      }
      if (this.ph631Delay > 0) {
        this.ph631Delay--;
        this.vx = 0; this.vy = 0;
        return;                                   //（:35575-35579 提前 return,不转姿态不位移）
      }
      if (!valid631 || !tgt631) {
        if (this.vx === 0 && this.vy === 0) { this.killNow(game); return; }
        this.noTileCollide = false;               //（:35584 tileCollide=true）
        this.alpha += 10;
        if (this.alpha > 255) { this.killNow(game); return; }
      } else {
        const dx631 = tgt631.x + tgt631.w / 2 - this.cx, dy631 = tgt631.y + tgt631.h / 2 - this.cy;
        const dl631 = Math.hypot(dx631, dy631) || 1;
        this.vx = dx631 / dl631 * 12;
        this.vy = dy631 / dl631 * 12;
        this.alpha = Math.max(0, this.alpha - 15);
      }
    }
    // ---- ★R29 弹药飞行拖尾族（AI_001 逐型尘块,行号照抄;素箭素弹 → 分型视觉）----
    // 41 地狱火箭（:56450-56456）：每 update d31(smoke,alpha100,scale1.6,noGravity)+
    // d6(fire,scale2,noGravity)——火尾是弹的可视主体
    if (this.projId === 41) {
      game.spawnDust?.(this.x, this.y, this.w, this.h, 31, 0, 0, 100, null, 1.6, true);
      game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 0, 0, 100, null, 2, true);
    } else if (this.projId === 91) {
      // 91 圣箭（:56554-56560）：1/2 概率 d58|d15（v×0.25 后再 ×0.25,alpha150,scale0.9）
      if (Math.floor(Math.random() * 2) === 0) {
        const t91 = Math.floor(Math.random() * 2) !== 0 ? 58 : 15;
        const d91 = game.spawnDust?.(this.x, this.y, this.w, this.h, t91,
          this.vx * 0.25, this.vy * 0.25, 150, null, 0.9);
        if (d91) { d91.vx *= 0.25; d91.vy *= 0.25; }
      }
    } else if (this.projId === 120) {
      // 120 冰雪弓箭（:58231-58238）：每 update d67 出生点=position−velocity、
      // v 继承后 ×0.3,noGravity,scale1.2 雪雾拖尾
      const d120 = game.spawnDust?.(this.x - this.vx, this.y - this.vy, this.w, this.h, 67,
        this.vx, this.vy, 100, null, 1.2, true);
      if (d120) { d120.vx *= 0.3; d120.vy *= 0.3; }
    } else if (this.projId === 225) {
      // 225 叶绿箭（:55992-55995）：1/2 概率 d40 绿色荧光（noGravity,scale1.3,v×0.5）
      if (Math.floor(Math.random() * 2) === 0) {
        const d225 = game.spawnDust?.(this.x, this.y, this.w, this.h, 40, 0, 0, 0, null, 1.3, true);
        if (d225) { d225.vx *= 0.5; d225.vy *= 0.5; }
      }
    } else if (this.projId === 282) {
      // 282 毒液箭（:55970-55973）：每 update d171 毒泡（scale=rand(1..9)×0.1,
      // noGravity,fadeIn1.5,v×0.25 后 +=v×0.25）
      const d282 = game.spawnDust?.(this.x, this.y, this.w, this.h, 171, 0, 0, 100, null,
        (1 + Math.floor(Math.random() * 9)) * 0.1, true);
      if (d282) { d282.fadeIn = 1.5; d282.vx = d282.vx * 0.25 + this.vx * 0.25; d282.vy = d282.vy * 0.25 + this.vy * 0.25; }
    } else if (this.projId === 469) {
      // 469 蜂箭渐显（:56164-56174）：localAI>2 后 alpha−=50 钳 0（镜像已有）
      this.ph469T++;
      if (this.ph469T > 2) this.alpha = Math.max(0, this.alpha - 50);
    } else if (this.projId === 819) {
      // 819 血箭（DrawProj :57369-57400）：首拍 8×d5 尘爆（随机向×2+v 单位向×2,
      // scale0.9,fadeIn1.3）;alpha−=20 渐显;每拍 5×d5 血迹（v×0.5 后 ×0.25,
      // 位置=弹心−velocity×i/5 沿路径回铺）;1/2 d267 红雾（NewDustPerfect 弹心−v×3）
      if (!this.bArrow819Born) {
        this.bArrow819Born = true;
        for (let i = 0; i < 8; i++) {
          const th819 = (Math.random() * 2 - 1) * Math.PI;
          const ul819 = Math.hypot(this.vx, this.vy) || 1;
          const d819b = game.spawnDust?.(this.x, this.y, this.w, this.h, 5,
            Math.cos(th819) * 2 + this.vx / ul819 * 2, Math.sin(th819) * 2 + this.vy / ul819 * 2, 100);
          if (d819b) { d819b.scale = 0.9; d819b.fadeIn = 1.3; d819b.x = this.cx; d819b.y = this.cy; }
        }
      }
      this.alpha = Math.max(0, this.alpha - 20);
      for (let i = 1; i < 6; i++) {
        const d819t = game.spawnDust?.(this.cx - this.vx * i / 5 - 4, this.cy - this.vy * i / 5 - 4, 8, 8, 5, 0, 0, 100);
        if (d819t) { d819t.scale = 0.9; d819t.vx = d819t.vx * 0.5 + this.vx * 0.5; d819t.vy = d819t.vy * 0.5 + this.vy * 0.5; d819t.vx *= 0.25; d819t.vy *= 0.25; }
      }
      if (Math.floor(Math.random() * 2) === 0) {
        const d267 = game.spawnDust?.(this.cx - this.vx * 3 - 4, this.cy - this.vy * 3 - 4, 8, 8, 267,
          this.vx * 0.5, this.vy * 0.5, 0, { r: 255, g: 0, b: 0, a: 26 }, 0.7, true);
        if (d267) { d267.vx *= 2; d267.vy *= 2; }
      }
    }
    // ---- ★R29 星星炮星 955（aiStyle5,AI_005 通用支 :24133-24240）----
    // 通用闪烁档 alpha 0↔200 ±25/t + Item_9 星啸 20-59t + 1/20 尘 58（v×0.5,
    // alpha150,scale1.2)+屏内 1/6 gore16/17（自旋在 PROJ_SPIN 表;light R18 禁入区）
    if (this.projId === 955) {
      this.alpha += 25 * this.twinkleDir;
      if (this.alpha >= 200) { this.alpha = 200; this.twinkleDir = -1; }
      if (this.alpha <= 0) { this.alpha = 0; this.twinkleDir = 1; }
      if (--this.starSndCd <= 0) {
        this.starSndCd = 20 + Math.floor(Math.random() * 40);
        game.playSfxFiles?.(['Item_9'], 0.5, this.cx, this.cy);
      }
      if (Math.floor(Math.random() * 20) === 0) {
        game.spawnDust?.(this.x, this.y, this.w, this.h, 58, this.vx * 0.5, this.vy * 0.5, 150, null, 1.2);
      }
    } else if (this.projId === 728) {
      // ---- ★R29 超级星星炮星 728（aiStyle151 AI_151_SuperStar :22338-22376）----
      // alpha−=10 钳 100 半透 + Item_9 循环音同档 + 自旋 ×0.005（PROJ_SPIN）+
      // 2 臂各 1/8 d228 星尘（v×0.25,scale1.3,noGravity,+RotatedBy(±π/8)×0.2）+
      // 屏内 1/6 gore16/17
      this.alpha = Math.max(100, this.alpha - 10);
      if (--this.starSndCd <= 0) {
        this.starSndCd = 20 + Math.floor(Math.random() * 40);
        game.playSfxFiles?.(['Item_9'], 0.5, this.cx, this.cy);
      }
      for (let i = 0; i < 2; i++) {
        if (Math.floor(Math.random() * 8) === 0) {
          const ra728 = (Math.PI / 8) * (1 - 2 * i);
          const c728 = Math.cos(ra728), s728 = Math.sin(ra728);
          const d728 = game.spawnDust?.(this.x, this.y, this.w, this.h, 228,
            this.vx * 0.25, this.vy * 0.25, 127, null, 1.3, true);
          if (d728) {
            d728.vx *= 0.25; d728.vy *= 0.25;
            d728.vx += (this.vx * c728 - this.vy * s728) * 0.2;
            d728.vy += (this.vx * s728 + this.vy * c728) * 0.2;
          }
        }
      }
    }
    // ★661 黑爆显形链（AI_001 type==661 支 :56705-56745）：alpha−=55/t 渐显 +
    // scale=1.3；归零瞬间沿速度向排布 16×d62 暗环（scale1.5,noLight,noGravity,
    // v×4+velocity×0.3）；alpha≤0 期每子步 3×d240 暗尘（noGravity,v×0.3）
    if (this.projId === 661) {
      if (this.alpha <= 0) {
        for (let i = 0; i < 3; i++) {
          const d240c = game.spawnDust?.(this.x, this.y, this.w, this.h, 240, 0, 0, 100, null, 1, true);
          if (d240c) { d240c.vx *= 0.3; d240c.vy *= 0.3; }
        }
      } else {
        this.alpha -= 55;
        this.drawScale = 1.3;
        if (this.alpha <= 0) {
          this.alpha = 0;
          const va661 = Math.atan2(this.vy, this.vx);
          const ca661 = Math.cos(va661), sa661 = Math.sin(va661);
          for (let i = 0; i < 16; i++) {
            const th661 = i * (Math.PI * 2 / 16);
            const ox661 = Math.sin(th661) * 1, oy661 = -Math.cos(th661) * 4;   // −UnitY.Rot(th)×(1,4)
            const d661r = game.spawnDust?.(this.cx, this.cy, 0, 0, 62, 0, 0, 0, null, 1.5, true);
            if (d661r) {
              d661r.x = this.cx + ox661 * ca661 - oy661 * sa661;
              d661r.y = this.cy + ox661 * sa661 + oy661 * ca661;
              d661r.vx = d661r.vx * 4 + this.vx * 0.3;
              d661r.vy = d661r.vy * 4 + this.vy * 0.3;
            }
          }
        }
      }
    }
    // AI_001 重力链（2026-08-14 对账，:53083-54698 全链规格走 projGravSpec）：
    //   默认 = ai0≥15 update 后 +0.1/update、终端 16（:54686-54696/:54871-54887）
    //   ——箭族 15t 平飞缓坠；子弹/光束 flag3 表豁免（grav=0）；
    //   275/276 延迟档（35t 后 g=0.025，:54318-54329）；
    //   686/711 两段式（≥10 +0.1、≥20 再 +0.1、vx×0.99 恒定，:54640-54659）；
    //   aiStyle 2 投掷族（:21955-21977 默认档）：20t 平飞后 vy+=0.4、vx×=0.97、终端 32
    //   门 = ai[0] >= N（≥ 含等号；2026-08-22 修 off-by-one，曾 age > N 晚一拍）。
    //   终端速度（AI_001 尾 :54878-54890 flag7）：下坠钳 +16；flag4 上飘弹（1006）
    //   对称钳 −16 → grav<0 档取 −maxFall
    if (this.grav !== 0 && (this.gravDelay < 0 || this.age >= this.gravDelay)) {
      this.vy = this.grav < 0 ? Math.max(this.vy + this.grav, -this.maxFall)
        : Math.min(this.vy + this.grav, this.maxFall);
      if (this.drag !== 1) this.vx *= this.drag;
    }
    if (this.grav2 !== 0 && this.age >= this.grav2At) {
      this.vy = Math.min(this.vy + this.grav2, this.maxFall);
    }
    if (this.dragAlways !== 0) this.vx *= this.dragAlways;
    // ---- aiStyle 24 书族（94/1114）oldPos 环推进（Main.cs:35251/:35299 消费）----
    // ★95 诅咒之焰无 oldPos 拖尾块（其绿尘即尾,Main.cs 只画 94/1114 两支）——曾误入
    if (this.projId === 94 || this.projId === 1114) {
      this.starTrail.push(this.x, this.y);
      if (this.starTrail.length > 20) this.starTrail.splice(0, this.starTrail.length - 20);   // oldPos 10 点
    }
    // 1114 尘迹（AI_024 :26322-26330）：1/4 tick 尘 57 noGravity 速度×0.5 缩×0.9
    //（金色星光=日耀花视觉主体；noLight 尘不进光照,spawnParticles 近似）
    if (this.projId === 1114 && this.age % 4 === 0) {
      game.spawnParticles(this.cx, this.cy, '#FFD966', 1, 0.5, { life: 18, grav: 0 });
    }
    // ---- R35 清单①：410 泡泡枪泡体（AI_072,Projectile.cs:30954-30977）----
    // localAI0++ >3 后 alpha −25/t 钳 ≥50（GetAlpha 缺省路径 → 半透渐显）;
    // velocity ×0.96 全向量减速;ai[1] 首拍掷 rand(60,121)/100=scale,盒 14×14×scale 居中
    if (this.projId === 410) {
      if (this.bubbleScale === 0) {
        this.bubbleScale = (60 + Math.floor(Math.random() * 61)) / 100;
        const bw = Math.trunc(14 * this.bubbleScale);
        this.x += (this.w - bw) / 2; this.y += (this.h - bw) / 2;   // position=Center−盒/2（:30971-30976）
        this.w = bw; this.h = bw;
      }
      if (this.age > 3) this.alpha = Math.max(50, this.alpha - 25);
      this.vx *= 0.96; this.vy *= 0.96;
    }
    // ---- R35 清单③：烟花 167-170（AI_034,Projectile.cs aiStyle34 支）----
    // rotation=velocity+π/2（draw 侧）;发射器档(ai1==1):ai0++,==1 拍 8×d6 尘花
    // （noGravity ×3 vel,fadeIn0.5,pos+=v/2,vel+=v/4+player.v×0.1 近似略玩家项）,
    // ai0>2 每拍尾迹 d6(x+2,y+20)8×8 vel=v scale1.2 noGravity
    if (this.projId >= 167 && this.projId <= 170 && this.launcherFirework === 1) {
      this.fwAi0++;
      if (this.fwAi0 === 1) {
        for (let fn = 0; fn < 8; fn++) {
          const fd = game.spawnDust?.(this.x, this.y, this.w, this.h, 6,
            this.vx * 3, this.vy * 3, 100, null, 1.8, true);
          if (fd) { fd.noGravity = true; fd.fadeIn = 0.5; fd.vx += this.vx / 4; fd.vy += this.vy / 4; }
        }
      }
      if (this.fwAi0 > 2) {
        game.spawnDust?.(this.x + 2, this.y + 20, 8, 8, 6,
          this.vx, this.vy, 100, null, 1.2, true);
      }
    }
    // ---- R27：宝石法珠飞行彩尘（AI_029_GemStaffs_ActuallyGemStaffs :38534-38541）----
    //  两臂各 1/5 掷：d(type−121+86 / 597→262) 于弹盒内、初速=弹速全额(NewDust 叠加
    //  ±2 抖动)、alpha50、scale1.2、noGravity、速度再 ×0.3——彩色闪烁拖尾是本族视觉主体
    if (isGemBolt(this.projId)) {
      const gdType = this.projId === 597 ? 262 : this.projId - 121 + 86;
      for (let g = 0; g < 2; g++) {
        if (Math.floor(Math.random() * 5) !== 0) continue;
        const gd = game.spawnDust?.(this.x, this.y, this.w, this.h, gdType,
          this.vx, this.vy, 50, null, 1.2, true);
        if (gd) { gd.vx *= 0.3; gd.vy *= 0.3; }
      }
    }
    // ---- 沙球族（aiStyle 10，AI_010 :54890-55160）：沙枪 266 无 channel 旗
    //      （Item.cs:4486-4502 case 266 全段无 channel）→ 出生即 ai[0]=1 直飞档，
    //      ai[1]≥60 update 后 vy+0.2/update（:55066-55075，42/65/68/354 专属——
    //      其余 aiStyle10 型走 0.41 通用档）；终端 vy 10（:55151-55154 非 736-738 支）。
    //      途经草族/装饰/雕像/宝石 KillTile（:55114-55120 表）+ 顶坡铲平上浮
    //      （:55121-55127 SlopeTile+position.Y−16）。旋转在 PROJ_SPIN 表。
    //      Kill 落地放块（42→53/65→112/68→116/354→234）在 Game.onProjectileDeath ----
    if (this.sandBall) {
      this.aiCnt++;                                              // ai[1] += 1（:55069）
      if (this.aiCnt >= 60) this.vy = Math.min(this.vy + 0.2, 10);
      const stS = world.store;
      const sx0 = Math.floor(this.x / TILE), sx1 = Math.floor((this.x + this.w) / TILE);
      const sy0 = Math.floor(this.y / TILE), sy1 = Math.floor((this.y + this.h) / TILE);
      for (let si = sx0; si <= sx1; si++) {
        for (let sj = sy0; sj <= sy1; sj++) {
          if (!stS.inBounds(si, sj)) continue;
          const ti = stS.idx(si, sj);
          if (!stS.flags[ti]) continue;
          const sheet = TILE_DEFS[stS.type[ti]]?.vanilla?.sheet ?? -1;
          if (SAND_BALL_CUT_SHEETS.has(sheet)) {
            game.breakTile?.(si, sj);                            // WorldGen.KillTile 全语义
          } else if ((stS.slope[ti] === 1 || stS.slope[ti] === 2)) {
            stS.setSlope(si, sj, 0);                             // topSlope 且非平台 → 铲平
            this.y -= TILE;                                      // position.Y -= 16（:55127）
          }
        }
      }
    }
    // ---- aiStyle 专属物理（修复3：94/95/280/424 此前走通用直线兜底）----
    // 94 水晶风暴（aiStyle 24，Projectile.cs:24302-24326）：light=scale×0.5、
    // rotation+=vx×0.2（PROJ_SPIN 表）、1/4 尘 70、velocity×0.985 阻力、
    // ai[1]>130 后 scale −0.05/t 至 0.2 消亡
    if (this.projId === 94) {
      this.aiCnt++;                                              // ai[1] += 1（:24306）
      const l94 = this.drawScale * 0.5;
      this.lightRGB = [l94 * 0.5, 0, l94];                        // ProjLight :16380-16382 R×0.5/G×0/B=light(紫)——曾发白光
      if (Math.random() < 0.25) {                                // 1/4 尘 70（:24308-24315）
        game.spawnParticles(this.cx, this.cy, '#A0C8F0', 1, 0.5, { life: 20, grav: 0 });
      }
      this.vx *= 0.985; this.vy *= 0.985;                        // velocity *= 0.985（:24317）
      if (this.aiCnt > 130) {                                    //（:24318-24325）
        this.drawScale -= 0.05;
        if (this.drawScale <= 0.2) {
          this.drawScale = 0.2;
          this.killNow(game);
          return;
        }
      }
    } else if (this.projId === 1114) {
      // 1114 日耀花弹（aiStyle 24，Projectile.cs:26292/:26310-26340）：light=scale×0.5
      // （:26292 族首,ProjLight :16383-16388 乘 R×0.6/G×0.45/B×0.2=暖橙——夜间照明,
      // Update :17136 无昼夜门）、velocity×0.985 阻力、ai[1]>130 后 scale −0.05/t 至
      // 0.2 消亡（光随缩径衰减至 0.1）、wet 即 Kill（:26311-26313）。此前无物理分支
      // =无光+永续飞行（2026-08-25 用户报"夜间无照明"）
      this.aiCnt++;                                              // ai[1] += 1（:26333）
      const l1114 = this.drawScale * 0.5;
      this.lightRGB = [l1114 * 0.6, l1114 * 0.45, l1114 * 0.2];  // :26292 + ProjLight :16383-16388
      this.vx *= 0.985; this.vy *= 0.985;                        // velocity *= 0.985（:26334）
      const stW = (game as unknown as { world?: { store?: { wet?: Uint8Array; idx(x: number, y: number): number } } }).world?.store;
      if (stW?.wet) {
        const wx0 = Math.floor(this.x / TILE), wx1 = Math.floor((this.x + this.w - 1) / TILE);
        const wy0 = Math.floor(this.y / TILE), wy1 = Math.floor((this.y + this.h - 1) / TILE);
        for (let wi = wx0; wi <= wx1 && !this.dead; wi++) {
          for (let wj = wy0; wj <= wy1; wj++) {
            if (stW.wet[stW.idx(wi, wj)] > 0) { this.killNow(game); break; }   // wet → Kill（:26311-26313）
          }
        }
      }
      if (this.aiCnt > 130) {                                    //（:26335-26340）
        this.drawScale -= 0.05;
        if (this.drawScale <= 0.2) {
          this.drawScale = 0.2;
          this.killNow(game);
          return;
        }
      }
    } else if (this.projId === 95) {
      // 95 诅咒之焰（aiStyle 8，Projectile.cs:22624-22655）：每拍尘 75 绿焰
      // （:22624-22631，1 枚 scale 3×speed 继承）、ai[1]≥20 后 vy+=0.2
      // （:22651-22653）、rotation+=0.3×dir 翻滚（PROJ_SPIN 表）、vy 钳 16（:22664）
      this.aiCnt++;                                              // ai[1] += 1（:22647-22649）
      game.spawnParticles(this.cx + this.vx, this.cy + this.vy, '#40C040', 1, 1, { life: 18, grav: 0 });
      if (this.aiCnt >= 20) this.vy += 0.2;
      if (this.vy > 16) this.vy = 16;
    } else if (this.projId === 280) {
      // 280 黄金雨（aiStyle 12，Projectile.cs:22815-22862）：scale−0.002/子步至 0
      // 消亡（:22824-22827）；ai[0]>3 后重力 0.075 + 3×尘 170 + 1/8 追加
      // （:22831-22858），否则 ai[0]++（:22860-22862）。extraUpdates 2 → 3 子步/帧
      this.drawScale -= 0.002;
      if (this.drawScale <= 0) { this.killNow(game); return; }
      if (this.aiCnt > 3) {
        this.vy += 0.075;
        game.spawnParticles(this.cx, this.cy, '#D8B840', 3, 0.5, { life: 16, grav: 0 });
        if (Math.random() < 0.125) {
          game.spawnParticles(this.cx, this.cy, '#D8B840', 1, 0.3, { life: 14, grav: 0 });
        }
      } else {
        this.aiCnt++;
      }
    } else if (this.projId === 876) {
      // ---- R27：876 zapinator AI 尾段（Projectile.cs:56892-56908，aiStyle1 type 段）----
      //  tileCollide 按 ai[1] 态逐拍恢复（命中侧随机化把撞块关掉后,下一次 Damage 结算
      //  的末态写回 ai[1],AI 拍再据此恢复——穿墙窗恰一拍）;alpha −10/update 渐显至 0
      this.noTileCollide = this.zapAi1 === 1;
      if (this.alpha > 0) this.alpha -= 10;
      if (this.alpha < 0) this.alpha = 0;
    } else if (this.projId === 45) {
      // ---- R27：45 恶魔镰刀（aiStyle 18，Projectile.cs:25772-25798）----
      //  shootSpeed 0.2 是【指数加速起点】：ai[0]∈[30,100) 每 update velocity×=1.06、
      //  ai[0]≥100 置 200 冻结（:25782-25793）——"慢启动高音速镰刀"；快自旋在 PROJ_SPIN
      //  表（rotation += direction×0.8 :25781）；每 update 2×d27(alpha100,noGravity)
      //  （:25794-25798）。熔岩反弹无此型档；Kill 爆见 Game.onProjectileDeath
      this.aiCnt++;                                              // ai[0]++（:25782）
      if (this.aiCnt >= 30) {
        if (this.aiCnt < 100) {
          this.vx *= 1.06;                                       // (:25785-25788)
          this.vy *= 1.06;
        } else {
          this.aiCnt = 200;                                      // 冻结（:25789-25792）
        }
      }
      for (let i = 0; i < 2; i++) {
        game.spawnDust?.(this.x, this.y, this.w, this.h, 27, 0, 0, 100, null, 1, true);
      }
    } else if (this.projId === 27) {
      // ---- R27：27 水矢拖尾（aiStyle 8 type 支，Projectile.cs:24515-24577）----
      //  五点错位 d172 连续水痕 = 该弹可视本体（SetDefaults alpha=255 + GetAlpha 缺省
      //  路径 → 弹体贴图全程隐形，drawGlobalAlpha 已置 0）。门 `ai[1]==0 || rand(5)==0`
      //  中 ai[1] 是熔岩反弹旗（本支不接,P2 登记）恒走前半。后段重力不存在：
      //  :24618 `type != 27 && ...` 不自增 ai[1] → `ai[1]>=20 重力门恒假`（红队 P2 项驳）
      for (let i = 0; i < 5; i++) {                              // (:24554-24567)
        const d = game.spawnDust?.(this.x + 4, this.y + 4, this.w - 8, this.h - 8,
          172, 0, 0, 100, null, 1.2, true);
        if (d) {
          d.vx = d.vx * 0.1 + this.vx * 0.1;
          d.vy = d.vy * 0.1 + this.vy * 0.1;
          d.x -= (this.vx / 3) * i;
          d.y -= (this.vy / 3) * i;
        }
      }
      if (Math.floor(Math.random() * 5) === 0) {                 // 1/5 追加小尘(:24568-24576)
        const ds = game.spawnDust?.(this.x + 4, this.y + 4, this.w - 8, this.h - 8,
          172, 0, 0, 100, null, 0.6);
        if (ds) {
          ds.vx = ds.vx * 0.25 + this.vx * 0.5;
          ds.vy = ds.vy * 0.25 + this.vy * 0.5;
        }
      }
    } else if (this.projId === 22) {
      // ---- R27：22 水花权杖（aiStyle 12 type 22 支，Projectile.cs:24835-24926）----
      //  num97=0.01 收缩/update 至 ≤0 Kill（≈100 个 AI update；extraUpdates=2 → ~34 帧
      //  寿命——"短程喷泉"）；num98=0.15 重力弧线（ai[0]>3 门）；3×d172 六px 内缩盒错位
      //  拖尾 + 1/8 小尘。弹体贴图同 27 全程隐形（alpha=255 缺省 GetAlpha）。熔岩反弹
      //  （ai[1]=1 档 LCG32 种子链 :24839-24876）P2 登记未接——种子注入面缺
      this.drawScale -= 0.01;
      if (this.drawScale <= 0) { this.killNow(game); return; }
      if (this.aiCnt > 3) {
        this.vy += 0.15;
        for (let i = 0; i < 3; i++) {                            // (:24896-24911)
          const d = game.spawnDust?.(this.x + 6, this.y + 6, this.w - 12, this.h - 12,
            172, 0, 0, 100, null, 1.2, true);
          if (d) {
            d.vx = d.vx * 0.3 + this.vx * 0.5;
            d.vy = d.vy * 0.3 + this.vy * 0.5;
            d.x -= (this.vx / 3) * i;
            d.y -= (this.vy / 3) * i;
          }
        }
        if (Math.floor(Math.random() * 8) === 0) {               // (:24912-24920)
          const ds = game.spawnDust?.(this.x + 6, this.y + 6, this.w - 12, this.h - 12,
            172, 0, 0, 100, null, 0.75);
          if (ds) {
            ds.vx = ds.vx * 0.5 + this.vx * 0.5;
            ds.vy = ds.vy * 0.5 + this.vy * 0.5;
          }
        }
      } else {
        this.aiCnt++;
      }
    } else if (this.projId === 424) {
      // 424 流星法杖弹（AI_001 type 段，Projectile.cs:54149-54181）：tileCollide
      // 动态门——低于玩家 300px 或高于地表线（worldSurface×16）恢复撞块（:54151-54157，
      // SetDefaults tileCollide=false → 高空穿墙坠落）；scale=ai[1]（ctor 掷定）；
      // rotation+=vx×2（PROJ_SPIN 表）；每子步 3×尘 6 火焰尾（:54160-54179）
      const mp = game.player as { y?: number } | null;
      if (mp && typeof mp.y === 'number' && this.y > mp.y - 300) this.noTileCollide = false;
      if (this.y < game.world.groundLevel * 16) this.noTileCollide = false;
      game.spawnParticles(this.cx, this.cy, '#E08030', 3, 0.8, { life: 16, grav: 0 });
    } else if (this.projId === 90) {
      // 90 水晶碎块（aiStyle 24，Projectile.cs:24302-24326 非 94 支，515 水晶子弹
      // Kill 碎片）：light=scale×0.5、rotation+=vx×0.2（PROJ_SPIN 表）、velocity×0.96
      // 阻力、ai[1]>15 后 scale −0.05/t 至 0.2 消亡（94 支的 130t 长寿命档不适用）
      this.aiCnt++;                                              // ai[1] += 1（:24306）
      const l90 = this.drawScale * 0.5;
      this.lightRGB = [l90 * 0.05, l90 * 0.2, l90];               // light=scale×0.5（:24304）+ ProjLight :16630-16635 R×0.05/G×0.2/B=light(深蓝)——曾发白光覆盖静态表
      this.vx *= 0.96; this.vy *= 0.96;                          // velocity *= 0.96（:24320）
      if (this.aiCnt > 15) {                                     //（:24321-24326）
        this.drawScale -= 0.05;
        if (this.drawScale <= 0.2) {
          this.drawScale = 0.2;
          this.killNow(game);
          return;
        }
      }
    } else if (this.projId === 604) {
      // ---- 604 孢子云（aiStyle 115 :35047-35069,603 悠悠球伴生弹——蓝队 R7-30）----
      //  SetDefaults :6073-6083：14×14/friendly/penetrate −1/melee/scale 1.2/
      //  IDStatic 10t。AI：光 0.075/0.3/0.15、速度 ×0.985 阻尼、旋转 +=vx×0.2
      //  ±0.08、ai[1]>30 后 alpha +10/t 至 255 消亡（约 57t 寿命）
      this.lightRGB = [0.075, 0.3, 0.15];
      this.vx *= 0.985; this.vy *= 0.985;
      this.spinRot += this.vx * 0.2 + (this.vx > 0 ? 0.08 : -0.08);
      this.aiCnt++;
      if (this.aiCnt > 30) {
        this.alpha = Math.min(255, this.alpha + 10);
        if (this.alpha >= 255) { this.killNow(game); return; }
      }
    } else if (this.projId === 614) {
      // ---- 614 星尘细胞弹 = aiStyle 113 TargetSticker（:41289-41330）----
      //  蓝队 R7-19：曾当直飞 Arrow 生成（不追踪/不失的即杀/无 183 buff——末地召唤
      //  核心输出弹哑弹）。① alpha −63/t 淡入（num=63 :41293-41299,SetDefaults 255 :6619）；
      //  ② ai[1]=发射侧注入的目标索引,目标 !CanBeChasedBy → 立即 Kill（:41317-41320）；
      //  ③ 硬追踪 v = (v×4 + 归一(目标−心)×14)/5（:41321-41330,速度向 14 收敛）。
      //  命中侧：目标盒收缩 + buff 183 门见命中环（stickerTgt 消费）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 63);
      const tgt614 = this.stickerTgt
        ? (game.enemies() as Array<{ id: number; dead?: boolean }>).find((q) => q.id === this.stickerTgt)
        : null;
      if (!tgt614 || tgt614.dead || !playerCanHitEnemy(tgt614 as never, game, this.projId)) {
        this.killNow(game);                                    // :41318-41320 失的即杀
        return;
      }
      const te614 = tgt614 as unknown as { x: number; y: number; w: number; h: number };
      let vx614 = te614.x + te614.w / 2 - this.cx;
      let vy614 = te614.y + te614.h / 2 - this.cy;
      const dl614 = Math.hypot(vx614, vy614);
      if (dl614 > 0) { vx614 = (vx614 / dl614) * 14; vy614 = (vy614 / dl614) * 14; }
      else { vx614 = 0; vy614 = 0; }                           // vector==Zero 保持零（:41326）
      this.vx = (this.vx * 4 + vx614) / 5;                     // num3=5（:41328-41330）
      this.vy = (this.vy * 4 + vy614) / 5;
    } else if (this.projId === 207 || this.projId === 837) {
      // 叶绿弹 207 / 骷髅头法书弹 837（AI_001 顶层段 :53906-54010，1179 叶绿弹追踪）：
      // ① alpha 255 起 −25/t 渐显（:53937-53943），<170 期沿弹道后向拖 75 号尘迹
      //   （:53911-53920，10 点排布 −v/10·i，本仓取 2 点近似）；
      // ② localAI[0] = 初速（==0 时取 |v|，此后恒为基准——转向不清速）；
      // ③ 锁敌（ai[1]==0，:53947-53969）：300px 曼哈顿视距内 CanBeChasedBy+CanHit
      //   最近者，锁 ai[1]=目标（锁后 flag5 复位，但同拍随即进 ④ 保持段再置位 →
      //   锁敌当帧即开始转向）；
      // ④ 保持（ai[1]>0，:53971-53990）：目标 active+CanBeChasedBy(ignoreDontTakeDamage)
      //   +!dontTakeDamage 且 1000px 内 → 追踪；失效/超距 → ai[1]=0 下帧重锁；
      // ⑤ !friendly 不追踪（敌方同型弹直飞）；转向 v=(v×(N−1)+dir×speed)/N
      //   （207 N=8 :57868-57872；★837 N=20——1457 :57861-57864 把 1456 的 32 改 20
      //   （1456 :54001-54005），转向响应 ×1.6，蓝队 R7-1 曾照抄 1456 旧值）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 25);
      if (this.projId === 207) this.lightRGB = [0.5, 0.5, 0.5];   // SetDefaults light=0.5（:2686）
      // ★1457 新增（:57774-57779，1456 无此块）：837 弹心埋进实心格时每 update 额外
      //   烧 33t 寿命（timeLeft>33 门）——防骷髅头穿墙滞留（480t → 最快 ~15 拍耗尽），
      //   蓝队 R7-2：曾整缺，射入方块后按自然寿命慢消且穿透期内持续可命中贴墙敌
      if (this.projId === 837 && this.life > 33) {
        const bx837 = Math.floor(this.cx / TILE), by837 = Math.floor(this.cy / TILE);
        if (world.store.inBounds(bx837, by837) && world.store.isSolid(bx837, by837)) this.life -= 33;
      }
      // 尘拖尾仅 207（:57760 `type == 207 && alpha < 170`；837 alpha 恒 255 隐身无尘段
      //   ——蓝队 R7-3：曾 207||837 合并支无型别门，837 多一路可见尘迹泄露弹道）
      if (this.projId === 207 && this.alpha < 170) {
        for (const k of [0, 5]) {
          const d = game.spawnDust?.(this.x - (this.vx / 10) * k, this.y - (this.vy / 10) * k,
            1, 1, 75, 0, 0, this.alpha, null, 1, true);
          if (d) { d.vx = 0; d.vy = 0; }
        }
      }
      if (this.chloSpeed === 0) this.chloSpeed = Math.hypot(this.vx, this.vy);
      {
        let steer = false;
        let tx = this.cx, ty = this.cy;
        const enemies = game.enemies() as Array<{
          id: number; x: number; y: number; w: number; h: number; dead: boolean;
          dontTakeDamage?: boolean;
        }>;
        const manh = (e: { x: number; y: number; w: number; h: number }) =>
          Math.abs(this.cx - (e.x + e.w / 2)) + Math.abs(this.cy - (e.y + e.h / 2));
        if (this.chloAi1 === 0) {
          let best = 300;
          let bestId = 0;
          for (const e of enemies) {
            if (e.dead) continue;
            if (!playerCanHitEnemy(e, game, this.projId)) continue;   // CanBeChasedBy（:53950）
            const d = manh(e);
            if (d >= best) continue;
            // Collision.CanHit（:53956 弹心 1×1 → 敌盒）
            if (!canHitLine(world.store, this.cx, this.cy, 0, 0, e.x, e.y, e.w, e.h)) continue;
            best = d; tx = e.x + e.w / 2; ty = e.y + e.h / 2; bestId = e.id;
          }
          if (bestId !== 0) this.chloAi1 = bestId;   // :53963-53966（当帧 flag5 复位不转）
        }
        if (this.chloAi1 !== 0) {
          const tgt = enemies.find((e) => e.id === this.chloAi1);
          // :53973-53976 active + CanBeChasedBy(ignoreDontTakeDamage) + !dontTakeDamage
          if (tgt && !tgt.dead && !tgt.dontTakeDamage && playerCanHitEnemy(tgt, game, this.projId)) {
            if (manh(tgt) < 1000) {                       // :53981 1000px 保持圈
              steer = true;
              tx = tgt.x + tgt.w / 2; ty = tgt.y + tgt.h / 2;
            }
          } else {
            this.chloAi1 = 0;                             // :53984-53986 失效清锁
          }
        }
        if (this.hostile) steer = false;                  // :53992-53994 !friendly 不追踪
        if (steer) {
          const sp = this.chloSpeed;
          let dx = tx - this.cx, dy = ty - this.cy;
          const dl = Math.hypot(dx, dy) || 1;
          const w = this.projId === 837 ? 20 : 8;         // num204（:57861-57864，★1457 32→20）
          this.vx = (this.vx * (w - 1) + (dx / dl) * sp) / w;
          this.vy = (this.vy * (w - 1) + (dy / dl) * sp) / w;
        }
      }
    } else if (this.projId === 181 || this.projId === 189 || this.projId === 307
      || this.projId === 316 || this.projId === 566) {
      // ---- aiStyle 36 蜂族（AI() 派发器 Projectile.cs:27683-27862）----
      // 181 蜂枪蜂(1121)/566 巨蜂(beeType 强蜂 20%)/189 黄蜂枪蜂(1155)/
      // 316 蝙蝠杖蝠(1801)/307 腐化者天罚小吞噬者(1571 命中 Kill 链 :78052-78062 掷)：
      // ① 入水消亡（307 豁免——:27685 `type != 307 && wet && !honeyWet && !shimmerWet`）；
      // ② alpha −50/update 渐显，归零后 extraUpdates=0（:27690-27697，SetDefaults 3 →
      //    淡入期 4 子步/帧、全显后 1——速度观感先快后常）；
      // ③ 30 update 索敌延迟（:27762-27764 ai[0]++ 钳 30）后【每 update 重搜】最近敌
      //   （800 曼哈顿 + CanHit 全盒视线；湿敌豁免表：Duke Fishron 370 或 307 自身，
      //    :27769）——无持久锁，每拍重选最近；
      // ④ 无目标 → 瞄准点 = 弹心 + v×100（保持直飞，:27784-27788）；307 锁到目标瞬间
      //    friendly = true（:27789-27792——出生非 friendly，锁定才可伤敌）；
      // ⑤ 逐轴步进转向（:27823-27862）：目标速度向量 = 归一(目标−弹心)×speed，
      //    v.x < 目标 → +accel（变号再 +2×accel），反之 −accel——蜂群"振翅折线"观感。
      //    逐型 speed/accel：181 6/0.1、189 9/0.2、307 13/0.35、316 13/0.325(锁定)
      //    或 10/0.25(自由)、566 6.8/0.14（:27793-27822）。
      const st36 = world.store;
      {
        const bx36 = Math.floor(this.cx / TILE), by36 = Math.floor(this.cy / TILE);
        if (st36.inBounds(bx36, by36) && st36.liquid[st36.idx(bx36, by36)] > 0) {
          const lt36 = st36.liquidType[st36.idx(bx36, by36)];
          if ((lt36 === LIQUID_TYPE.WATER || lt36 === LIQUID_TYPE.LAVA) && this.projId !== 307) {
            this.killNow(game); return;                    //（:27685-27688）
          }
        }
      }
      if (this.alpha > 0) {
        this.alpha = Math.max(0, this.alpha - 50);         //（:27690-27692）
        if (this.alpha === 0) this.bee36EU0 = true;        //（:27693-27695，下一 tick 生效
      }                                                    //   ——原版 numUpdates 每 tick
                                                           //   头读取,当拍子步数不变）
      // 姿态/帧（:27697-27727）：307 rotation=atan2(vy,vx)−π/2、6 拍/帧 2 帧；
      // 其余 rotation=vx×0.1、3 拍/帧 3 帧（draw 侧消费 bee36Frame/bee36Tilt）
      this.bee36Tilt = this.projId === 307
        ? Math.atan2(this.vy, this.vx) - Math.PI / 2
        : this.vx * 0.1;
      // 307 尘尾（:27707-27716）：每 update 3×184 尘（scale 0.5、速度 0、
      // 位置 = 弹心 − v/3×i 沿弹道后向排布）
      if (this.projId === 307) {
        for (let i = 0; i < 3; i++) {
          const d307 = game.spawnDust?.(this.cx - (this.vx / 3) * i - 2,
            this.cy - (this.vy / 3) * i - 2, 4, 4, 184, 0, 0, 0, null, 0.5);
          if (d307) { d307.vx = 0; d307.vy = 0; }
        }
      }
      if (++this.bee36FrameT >= (this.projId === 307 ? 6 : 3)) {
        this.bee36FrameT = 0;
        const maxF = this.projId === 307 ? 2 : 3;
        this.bee36Frame = (this.bee36Frame + 1) % maxF;
      }
      // 索敌（:27762-27792）
      this.bee36Aim = null;
      this.bee36AimLocked = false;
      if (++this.bee36Delay > 30) {
        this.bee36Delay = 30;                              //（:27763-27764 钳）
        let best36 = 800;
        for (const ent of game.enemies()) {
          const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean; wet?: boolean };
          if (e.dead) continue;
          if (!playerCanHitEnemy(ent, game, this.projId)) continue;      // CanBeChasedBy
          // 湿敌豁免（:27769）：Duke Fishron 370 或 307 自身可追湿敌
          if (e.wet && this.projId !== 307 && e.id !== 370) continue;
          const d36 = Math.abs(this.cx - (e.x + e.w / 2)) + Math.abs(this.cy - (e.y + e.h / 2));
          if (d36 >= best36) continue;
          if (!canHitLine(world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
          best36 = d36;
          this.bee36Aim = { cx: e.x + e.w / 2, cy: e.y + e.h / 2 };
          this.bee36AimLocked = true;
        }
        if (this.bee36AimLocked && this.projId === 307) this.friendly307 = true;  //（:27789-27792）
      }
      if (!this.bee36Aim) {
        this.bee36Aim = { cx: this.cx + this.vx * 100, cy: this.cy + this.vy * 100 };  //（:27784-27788）
      }
      // 逐轴步进转向（:27823-27862）
      const P36: Record<number, [number, number]> = {
        181: [6, 0.1], 189: [9, 0.2], 307: [13, 0.35],
        316: this.bee36AimLocked ? [13, 0.325] : [10, 0.25], 566: [6.8, 0.14],
      };
      const [spd36, acc36] = P36[this.projId];
      {
        const dx36 = this.bee36Aim.cx - this.cx, dy36 = this.bee36Aim.cy - this.cy;
        const dl36 = Math.hypot(dx36, dy36) || 1;
        const wantX = (dx36 / dl36) * spd36, wantY = (dy36 / dl36) * spd36;
        if (this.vx < wantX) { this.vx += acc36; if (this.vx < 0 && wantX > 0) this.vx += acc36 * 2; }
        else if (this.vx > wantX) { this.vx -= acc36; if (this.vx > 0 && wantX < 0) this.vx -= acc36 * 2; }
        if (this.vy < wantY) { this.vy += acc36; if (this.vy < 0 && wantY > 0) this.vy += acc36 * 2; }
        else if (this.vy > wantY) { this.vy -= acc36; if (this.vy > 0 && wantY < 0) this.vy -= acc36 * 2; }
      }
    } else if (this.projId === 616) {
      // ---- 616 星旋机枪涡旋弹（AI_001 重力链 616 支，Projectile.cs:58383-58465）----
      // 3475 星旋机枪(615 持械弹)每 7 轮附赠（Game 侧已接 :68011-68025 伤+20/kb×1.25/
      // 速 8）：① alpha −25/update 渐显（:58378-58384）；② <170 期 3×229 尘尾迹
      // （:58385-58394）；③ localAI[0]=初速快照（:58371-58377，转向不清速）；
      // ④ 20 update 延迟（:58403-58405 ai[0]++ >20 自减钳 20）后锁敌：800 曼哈顿
      //   + CanHit（:58407-58420）锁 ai[1]=敌+1——【失效不复锁】（:58421-58437 无
      //   清锁支，与 207/837 的失效重锁不同）；⑤ 1000px 保持圈（:58438-58441）；
      // ⑥ 转向 v=(v×7+dir×初速)/8（:58448-58452 num249=8）；!friendly 不追踪
      //   （:58442-58444）。
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 25);
      if (this.alpha < 170) {
        for (let k = 0; k < 3; k++) {
          const d616 = game.spawnDust?.(
            this.cx - (this.vx / 3) * k, this.cy - (this.vy / 3) * k,
            1, 1, 229, 0, 0, 200, null, 0.5, true);
          if (d616) { d616.vx = 0; d616.vy = 0; }
        }
      }
      if (this.vx616Speed === 0) this.vx616Speed = Math.hypot(this.vx, this.vy);
      if (++this.vx616Delay > 20) {
        this.vx616Delay = 20;                              //（:58403-58405 钳）
        if (this.vx616Ai1 === 0) {
          let best616 = 800;
          let bestId616 = 0;
          for (const ent of game.enemies()) {
            const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean };
            if (e.dead) continue;
            if (!playerCanHitEnemy(ent, game, this.projId)) continue;
            const d616 = Math.abs(this.cx - (e.x + e.w / 2)) + Math.abs(this.cy - (e.y + e.h / 2));
            if (d616 >= best616) continue;
            if (!canHitLine(world.store, this.cx, this.cy, 0, 0, e.x, e.y, e.w, e.h)) continue;
            best616 = d616;
            bestId616 = e.id;
          }
          if (bestId616 !== 0) this.vx616Ai1 = bestId616;  //（:58418-58420）
        }
        if (this.vx616Ai1 !== 0) {
          const t616 = (game.enemies() as Array<{ id: number; x: number; y: number; w: number; h: number; dead?: boolean }>)
            .find((e) => e.id === this.vx616Ai1);
          //（:58423-58437）active + CanBeChasedBy(ignoreDontTakeDamage) + 1000px 内
          if (t616 && !t616.dead && playerCanHitEnemy(t616, game, this.projId)
            && Math.abs(this.cx - (t616.x + t616.w / 2)) + Math.abs(this.cy - (t616.y + t616.h / 2)) < 1000) {
            const dx616 = t616.x + t616.w / 2 - this.cx, dy616 = t616.y + t616.h / 2 - this.cy;
            const dl616 = Math.hypot(dx616, dy616) || 1;
            this.vx = (this.vx * 7 + (dx616 / dl616) * this.vx616Speed) / 8;   //（:58448-58452）
            this.vy = (this.vy * 7 + (dy616 / dl616) * this.vx616Speed) / 8;
          }
        }
      }
    } else if (this.projId === 297) {
      // ---- 297 幽灵法杖弹（aiStyle 51，Projectile.cs:28825-28927，1446 幽灵法杖）----
      // 每拍重搜最近敌（400 曼哈顿 + Distance<400 欧氏双门 + CanHit 盒心 1×1→敌心，
      // :28861-28880）→ 转向 v=(v×20+dir×6)/21（:28913-28916 num384=6/num=21）；
      // 无目标保持直飞。293 敌对失魂同支追玩家（:28881-28901，speed 3/权重 101）——
      // 敌对弹由 NPC AI 侧生成，本仓走 Enemy 弹幕路径不在此接（登记）。
      let b297 = 400;
      let ax297 = 0, ay297 = 0, got297 = false;
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean };
        if (e.dead) continue;
        if (!playerCanHitEnemy(ent, game, this.projId)) continue;
        const dE = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
        if (dE >= b297) continue;                          // Distance < 400（:28865）
        if (!canHitLine(world.store, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y + e.h / 2, 0, 0)) continue;
        const dM = Math.abs(this.cx - (e.x + e.w / 2)) + Math.abs(this.cy - (e.y + e.h / 2));
        if (dM >= b297) continue;                          // 曼哈顿 < 400（:28879）
        b297 = dM;
        ax297 = e.x + e.w / 2; ay297 = e.y + e.h / 2; got297 = true;
      }
      if (got297) {
        const dx297 = ax297 - this.cx, dy297 = ay297 - this.cy;
        const dl297 = Math.hypot(dx297, dy297) || 1;
        this.vx = (this.vx * 20 + (dx297 / dl297) * 6) / 21;   //（:28913-28916）
        this.vy = (this.vy * 20 + (dy297 / dl297) * 6) / 21;
      }
    } else if (this.projId === 659) {
      // ---- 659 灵魂之焰（aiStyle 129，Projectile.cs:36861-36970，3779 灵魂之焰）----
      // ① 每 5 update 重索敌（:36878-36882 localAI[0] 节拍）：400 欧氏 +
      //   CanHitLine(弹心→敌心 或 敌顶)（:36888-36893）取最近锁 ai[0]，锁到即
      //   timeLeft=420（:36896-36899）；② 追踪 v=(v×2+dir×7.5)/3（:36954-36959，
      //   距离 >1 才转）；③ 目标失效 → ai[0]=−1 且 timeLeft 钳 5（:36963-36966）；
      // ④ 埋入实心格 → timeLeft 钳 2（:36945-36948）；⑤ alpha −12/t 渐显
      //   （:36901-36903）、timeLeft<30 停渐显。
      if (this.sf659Cd > 0) this.sf659Cd--;
      if (this.sf659Cd === 0 && this.sf659Ai0 < 0) {
        this.sf659Cd = 5;                                  //（:36881 localAI[0]=5f）
        let best659 = 400;
        let bestId659 = -1;
        for (const ent of game.enemies()) {
          const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean };
          if (e.dead) continue;
          if (!playerCanHitEnemy(ent, game, this.projId)) continue;      // CanBeChasedBy
          const d659 = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
          if (d659 >= best659) continue;                   //（:36890 < 400f）
          const hitC = canHitLine(world.store, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y + e.h / 2, 0, 0);
          const hitT = canHitLine(world.store, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y, 0, 0);
          if (!hitC && !hitT) continue;                    //（:36892-36893 心|顶双门）
          best659 = d659;
          bestId659 = e.id;
        }
        if (bestId659 >= 0) {
          this.sf659Ai0 = bestId659;
          this.life = 420;                                 //（:36896-36898 timeLeft = 420 直写）
        }
      }
      if (this.sf659Ai0 >= 0) {
        const t659 = (game.enemies() as Array<{ id: number; x: number; y: number; w: number; h: number; dead?: boolean }>)
          .find((e) => e.id === this.sf659Ai0);
        if (t659 && !t659.dead) {
          const dx659 = t659.x + t659.w / 2 - this.cx, dy659 = t659.y + t659.h / 2 - this.cy;
          if (Math.hypot(dx659, dy659) > 1) {              //（:36952 Distance > num1008=1）
            const dl659 = Math.hypot(dx659, dy659);
            this.vx = (this.vx * 2 + (dx659 / dl659) * 7.5) / 3;   //（:36954-36959）
            this.vy = (this.vy * 2 + (dy659 / dl659) * 7.5) / 3;
          }
        } else {
          this.sf659Ai0 = -1;
          this.life = Math.min(this.life, 5);              //（:36963-36966）
        }
      }
      if (this.life > 2) {
        const bx659 = Math.floor(this.cx / TILE), by659 = Math.floor(this.cy / TILE);
        if (world.store.inBounds(bx659, by659) && world.store.isSolid(bx659, by659)) {
          this.life = 2;                                   //（:36945-36948）
        }
      }
      if (this.life > 30 && this.alpha > 0) this.alpha = Math.max(0, this.alpha - 12);  //（:36901-36903）
      // ★R28 三臂旋尘（:36916-36927）：ai[1]++ 相位,3 臂各 1/3 掷 d27——位置 =
      //   心+UnitY.RotatedBy(臂×2π/3+相位)×10、速度 = DirectionFrom(尘位) =
      //   归一(心−尘位)【向心】(Entity.DirectionFrom :210-213 归一(Center−Source),
      //   红队"径向外向"系误读)、scale 按 timeLeft 三档(<120→1.1/<60→1.6)、
      //   fadeIn .5、alpha200——三臂螺旋暗焰是该弹可视主体
      {
        this.sf659Phase++;
        const sc659 = this.life < 60 ? 1.6 : this.life < 120 ? 1.1 : 0.5;   //（:36910-36915）
        for (let arm = 0; arm < 3; arm++) {
          if (Math.floor(Math.random() * 3) !== 0) continue;
          const th = arm * (Math.PI * 2 / 3) + this.sf659Phase;
          const px659 = this.cx - Math.sin(th) * 10;
          const py659 = this.cy + Math.cos(th) * 10;
          const dl659b = Math.hypot(this.cx - px659, this.cy - py659) || 1;
          const d659c = game.spawnDust?.(px659 - 1, py659 - 1, 2, 2, 27,
            (this.cx - px659) / dl659b, (this.cy - py659) / dl659b, 200, null, sc659, true);
          if (d659c) d659c.fadeIn = 0.5;
        }
      }
    } else if (this.projId === 522) {
      // ---- ★R28 §11 水晶蛇子蛇（aiStyle29 522 支 :38427-38455,521 Kill 链生）----
      // ai[1]>40 Kill;vy+0.2/update 钳 18、vx×0.98;每 update 2×d254（pos=(pos+心)/2,
      // v×0.3,scale1.1×衰减(num7=(60−ai1)/60)）+ 1×d255（pos=(pos+心×5)/6,v×0.1,
      // fadeIn=0.9×num7,scale0.6×衰减）——本体 alpha=255 恒隐,视觉即尘蛇
      this.sn522Ai1++;
      const num7 = (60 - this.sn522Ai1) / 60;
      if (this.sn522Ai1 > 40) { this.killNow(game); return; }
      this.vy = Math.min(this.vy + 0.2, 18);
      this.vx *= 0.98;
      for (let i = 0; i < 2; i++) {
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 254,
          this.vx, this.vy, 50, null, 1.1 * num7, true);
        if (d) { d.x = (d.x + this.cx) / 2; d.y = (d.y + this.cy) / 2; d.vx *= 0.3; d.vy *= 0.3; }
      }
      const d255 = game.spawnDust?.(this.x, this.y, this.w, this.h, 255,
        this.vx, this.vy, 50, null, 0.6 * num7, true);
      if (d255) { d255.x = (d255.x + this.cx * 5) / 6; d255.y = (d255.y + this.cy * 5) / 6; d255.fadeIn = 0.9 * num7; }
    } else if (this.projId === 15 || this.projId === 253) {
      // ---- ★R28 §13/§14 火之花 15（112）/冰之花 253（1264）（aiStyle8 else 支
      //      :24604-24646 / 253 支 :24587-24599）----
      // 每 update 2×d6(253→d135)：初速=弹速×0.2、alpha100、scale2、noGravity，
      // 再 ×0.3（净值 ×0.06）；ai[1]++ ≥20 → vy+=0.2（20t 后坠弧）；vy 钳 16。
      // 自旋 rotation+=0.3×sign(vx) 走 PROJ_SPIN；加算辉光已接（ADDITIVE_GLOW）
      const fdType = this.projId === 253 ? 135 : 6;
      for (let i = 0; i < 2; i++) {
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, fdType,
          this.vx * 0.2, this.vy * 0.2, 100, null, 2, true);
        if (d) { d.vx *= 0.3; d.vy *= 0.3; }
      }
      this.aiCnt++;
      if (this.aiCnt >= 20) this.vy += 0.2;              //（:24633-24635）
      if (this.vy > 16) this.vy = 16;                    //（:24643-24645）
    } else if (this.projId === 294) {
      // ---- ★R28 §1 暗影束（aiStyle48 AI 支 :28609-28631 + HandleMovement 编排束
      //      :18976-19013 + Spawn_Shadowbeam ParticleOrchestrator :1987-2010）----
      // 本体恒隐（alpha=255→GetAlpha A=0,PROJ_ALPHA0/drawGlobalAlpha 承载）;可视面
      // =束段尘:【撞块时】从锚点(localAI[1]/[2])到当前心铺 d173 线束(步距 max(4,|v|),
      // 每步 3 枚 scale rand(70..110)×0.013、v×0.2)后重锚——红队"逐拍铺束"系误读,
      // 广播块在 HandleMovement 碰撞处理链内(:18008 lastVelocity!=velocity → flag →
      // 各 type 分支);Kill 补铺末段(:71840-71870)。首 delay=9 子步静默(:28612/:54941)
      this.sbL0++;
      if (this.sbL0 - 1 === 9) { this.sbAx = this.cx; this.sbAy = this.cy; }   // localAI==delay 锚定
    } else if (this.projId === 295) {
      // ---- ★R28 §2 地狱火叉弹体（aiStyle50 295 支 :28760-28769）----
      // 本体隐形(alpha255);视觉 = 每 update 8×d174 尘焰包裹(noGravity,alpha100,
      // scale1.2,v×0.5+弹速×0.1)——滚动火团观感
      for (let i = 0; i < 8; i++) {
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 174,
          0, 0, 100, null, 1.2, true);
        if (d) { d.vx *= 0.5; d.vy *= 0.5; d.vx += this.vx * 0.1; d.vy += this.vy * 0.1; }
      }
    } else if (this.projId === 296) {
      // ---- ★R28 §2 地狱火叉爆区（aiStyle50 296 支 :28772-28800）----
      // Item74 点火吼一次(localAI[0]==0 门);ai[0]+=4/update（自增 1+type 加成 3）,
      // >540 Kill ≈135t 存续;每 update ~18×d174 火焰柱（中心±10 出生、随机向速度
      // 3..8 归一外发、scale1.5,noGravity,alpha100）。150×150 盒对盒内敌持续结算
      // 由通用命中环承载(pierce −1 全局 immune 冷却再命中)
      if (!this.if296Sounded) {
        this.if296Sounded = true;
        game.playSfxFiles?.(['Item_74'], 1, this.cx, this.cy);
      }
      this.if296Ai0 += 4;
      if (this.if296Ai0 > 540) { this.killNow(game); return; }   //（:28778-28791）
      for (let i = 0; i < 17.5; i++) {                            // num361=25×0.7=17.5 → 18 圈
        const ax = Math.floor(Math.random() * 21) - 10;
        const ay = Math.floor(Math.random() * 21) - 10;
        const al = Math.sqrt(ax * ax + ay * ay);
        if (al <= 0) continue;
        const ratio = (3 + Math.floor(Math.random() * 6)) / al;   // Next(3,9)=3..8 归一外发
        const px = this.cx + Math.floor(Math.random() * 21) - 10;
        const py = this.cy + Math.floor(Math.random() * 21) - 10;
        game.spawnDust?.(px - 1, py - 1, 2, 2, 174, ax * ratio, ay * ratio, 100, null, 1.5, true);
      }
    } else if (this.projId >= 511 && this.projId <= 513) {
      // ---- ★R28 §10 毒云泡（aiStyle92 flag45 支 :33144-33245,3105 毒液瓶 Kill 链）----
      // ai[0]>260 Kill;不透明度包络 Remap(t,0,.3,0,1)×Remap(t,.3,1,1,0)×0.7
      // （:33196-33198——涌出后消散）;rotation=出生相位+t×2π/480（whoAmI 相位项以
      // 出生掷近似 :33192-33194）;velocity ×0.96/update。伤害面 = 组共享 IDStatic
      // 免疫（ctor idStaticGroup=511,10t 同敌再结算）;云间互斥推挤(P2 未接,登记)
      this.cloudT++;
      if (this.cloudT > 260) { this.killNow(game); return; }     //（:33168-33177）
      const t260 = this.cloudT / 260;
      const opacity = Math.min(1, t260 / 0.3)
        * Math.max(0, Math.min(1, (1 - t260) / 0.7)) * 0.7;
      this.alpha = Math.round(255 - opacity * 255);              // 引擎 alpha 反相语义
      this.spinRot = this.cloudPhase + this.cloudT * (Math.PI * 2) / 480;
      this.vx *= 0.96; this.vy *= 0.96;
    } else if (this.projId === 337) {
      // ---- ★R28 §9 暴雪雪片（AI_001 337 支 :57920-57933,1931 暴雪法杖）----
      // 动态穿墙门:低于玩家(y>player.y−300)或高于地表线(<worldSurface×16)才开
      // tileCollide（高空穿墙、接近目标高度恢复撞墙）;帧恒 ai[1]（ctor 掷 pinFrame,
      // draw fIdx 链消费）;1/2 掷 d197 雪尘(v×0.5,noGravity)
      const p337 = game.player;
      if (this.y > p337.y - 300 || this.y < (game.world.groundLevel || 0) * TILE) {
        this.noTileCollide = false;
      }
      if (Math.random() < 0.5) {
        const d337 = game.spawnDust?.(this.x, this.y, this.w, this.h, 197,
          0, 0, 0, null, 1, true);
        if (d337) { d337.vx *= 0.5; d337.vy *= 0.5; }
      }
    } else if (this.projId === 409) {
      // ---- 409 剃刀台风（aiStyle 71，Projectile.cs:30848-30951，2622 剃刀台风）----
      // ① 一次性锁敌（ai[0]==0 且 localAI[0]==0，:30883-30906）：500 欧氏 +
      //   CanHit 全盒最近敌 → ai[0]=敌+1；无目标 → localAI[0]=30（30 update 后再掷）；
      // ② 保持（:30912-30931）：目标 active+!dontTakeDamage+immune[owner]==0 且
      //   1000 曼哈顿内 → 追踪；失效/超距 → ai[0]=0（等冷却重锁）；
      // ③ 转向（:30933-30947）：角差 wrap 后 ×0.1 旋转（rotateTowards 档）；
      // ④ 速度 +0.0025/update 无帽（:30949-30951）。
      if (this.ty409Cd > 0) this.ty409Cd--;
      if (this.ty409Ai0 === 0 && this.ty409Cd === 0) {
        let best409 = 500;
        let bestId409 = 0;
        for (const ent of game.enemies()) {
          const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean; iframes?: number };
          if (e.dead) continue;
          if (!playerCanHitEnemy(ent, game, this.projId)) continue;      // CanBeChasedBy
          const d409 = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
          if (d409 >= best409) continue;
          if (!canHitLine(world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
          best409 = d409;
          bestId409 = e.id;
        }
        if (bestId409 !== 0) this.ty409Ai0 = bestId409;
        else this.ty409Cd = 30;                    //（:30907-30910）
      }
      let steer409 = false;
      let tx409 = 0, ty409 = 0;
      if (this.ty409Ai0 !== 0) {
        const t409 = (game.enemies() as Array<{ id: number; x: number; y: number; w: number; h: number; dead?: boolean; iframes?: number; dontTakeDamage?: boolean }>)
          .find((e) => e.id === this.ty409Ai0);
        //（:30912-30931）active + !dontTakeDamage + immune[owner]==0 + 1000px 曼哈顿
        if (t409 && !t409.dead && !t409.dontTakeDamage && !((t409.iframes ?? 0) > 0)
          && Math.abs(this.cx - (t409.x + t409.w / 2)) + Math.abs(this.cy - (t409.y + t409.h / 2)) < 1000) {
          steer409 = true;
          tx409 = t409.x + t409.w / 2; ty409 = t409.y + t409.h / 2;
        } else {
          this.ty409Ai0 = 0;                       //（:30925-30929 失效清锁等冷却）
        }
      }
      if (steer409) {
        const want409 = Math.atan2(ty409 - this.cy, tx409 - this.cx);
        const cur409 = Math.atan2(this.vy, this.vx);
        let diff409 = want409 - cur409;
        while (diff409 > Math.PI) diff409 -= Math.PI * 2;   //（:30937-30941 wrap）
        while (diff409 < -Math.PI) diff409 += Math.PI * 2;
        const na409 = cur409 + diff409 * 0.1;               //（:30947 RotatedBy(diff×0.1)）
        const sp409 = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na409) * sp409;
        this.vy = Math.sin(na409) * sp409;
      }
      {
        const sp409b = Math.hypot(this.vx, this.vy);        //（:30949-30951 速度爬升无帽）
        if (sp409b > 0) {
          this.vx = (this.vx / sp409b) * (sp409b + 0.0025);
          this.vy = (this.vy / sp409b) * (sp409b + 0.0025);
        }
      }
    } else if (this.projId === 451) {
      // ---- 451 涌流剑（aiStyle 81，Projectile.cs:31541-31760，2880 涌流剑）----
      // num645=penetrate(3)、num647=max(1,|v|/11)。三态：
      // ① ai[0]==0 飞行（:31574-31640）：7 update 后 alpha 0↔75 脉动（scale ±0.01
      //   同步）；② [1,1+pen) 命中/撞块淡出（:31642-31690）：tileCollide=false、
      //   alpha += 15×num647、v ×= 0.98/num647、≤250 无视线最近敌骑乘
      //   （position += npc.velocity :31682）；alpha≥255 → ai[0]==1 Kill /
      //   有目标 → 瞬移至目标周围 100px 随机点 + v=归一(目标−新位)×15 +
      //   ai[0] += pen（:31661-31681）/ 无目标 Kill；③ [1+pen,1+2pen) 末段
      //   （:31691-31725）：scale 0.9、前 15 update alpha −125 + v×0.98（可伤门
      //   :12463 ai[1]<5 豁免）、之后 alpha += 51 + v×0.8 至 255 Kill。
      // 命中钩（Damage :14115-14121）：ai[0]==0 → += pen，否则 −= pen+1；ai[1]=0。
      // 撞块钩（:18222-18227）：ai[0]=1、ai[1]=0、v = lastVelocity/2。
      const sp451 = Math.hypot(this.vx, this.vy);
      const num647 = Math.max(1, sp451 / 11);
      const pen451 = Math.max(1, this.pierceInit);
      if (this.iwAi0 === 0) {
        this.iwL0++;
        if (this.iwL0 > Math.min(7, 7 * num647)) {          //（:31616 num664）
          if (this.iwL1 === 0) {
            this.drawScale -= 0.01;                          //（:31621 num660）
            this.alpha += 5;                                 //（:31622 num661）
            if (this.alpha > 75) { this.alpha = 75; this.iwL1 = 1; }   //（:31623-31626）
          } else {
            this.drawScale += 0.01;                          //（:31631）
            this.alpha -= 5;
            if (this.alpha <= 0) { this.alpha = 0; this.iwL1 = 0; }    //（:31633-31636）
          }
        }
      } else if (this.iwAi0 >= 1 && this.iwAi0 < 1 + pen451) {
        this.noTileCollide = true;                           //（:31643）
        this.alpha += 15 * num647;                           //（:31645 num665）
        this.vx *= 0.98 / num647;                            //（:31646 num666）
        this.vy *= 0.98 / num647;
        this.iwL0 = 0;                                       //（:31647）
        this.iwSeek451(game, 250);
        if (this.alpha >= 255) {
          this.alpha = 255;
          if (this.iwAi0 === 1) { this.killNow(game); return; }        //（:31667-31669）
          if (this.iwRide) {
            // 瞬移至目标周围 100px 随机点 + 重射（:31671-31679）
            const t451 = this.iwRideTarget;
            if (t451) {
              const a451 = Math.random() * Math.PI * 2;
              this.x = t451.cx + Math.cos(a451) * 100 - this.w / 2;
              this.y = t451.cy + Math.sin(a451) * 100 - this.h / 2;
              const dx451 = t451.cx - this.cx, dy451 = t451.cy - this.cy;
              const dl451 = Math.hypot(dx451, dy451) || 1;
              this.vx = (dx451 / dl451) * 15;
              this.vy = (dy451 / dl451) * 15;
              this.iwAi0 += pen451;                          //（:31678）
              this.iwRide = null;
            } else {
              this.killNow(game); return;
            }
          } else {
            this.killNow(game); return;                      //（:31682-31684 无目标）
          }
        }
      } else if (this.iwAi0 >= 1 + pen451 && this.iwAi0 < 1 + 2 * pen451) {
        this.drawScale = 0.9;                                //（:31693）
        this.noTileCollide = true;                           //（:31694）
        this.iwAi1++;                                        //（:31696）
        if (this.iwAi1 >= 15) {                              //（:31697）
          this.alpha += 51;                                  //（:31698）
          this.vx *= 0.8; this.vy *= 0.8;                    //（:31699）
          if (this.alpha >= 255) { this.killNow(game); return; }       //（:31700-31702）
        } else {
          this.alpha -= 125;                                 //（:31704）
          if (this.alpha < 0) this.alpha = 0;
          this.vx *= 0.98; this.vy *= 0.98;                  //（:31706）
        }
        this.iwSeek451(game, 250);                           //（:31707-31725 骑乘）
      }
    } else if (this.naParent) {
      // ---- 618 星璇火花（aiStyle 119，Projectile.cs:35458-35540，617 伴生）----
      // 隐形伤弹（alpha 恒 255 :35533）：①父亡即 Kill（:35475-35478 proj4==null →
      // ai[0]=420 + Kill）；②骑乘（:35483-35486 position += 父位移）；③速度向父
      // 符号步进 ±0.15/轴、|v|>6 归一 6（:35490-35495）；④ai[0] ≥ 420 停骑乘
      // （:35479-35481 直飞到 timeLeft 420 自然亡）。
      this.naAi0++;
      const parent = this.naParent;
      if (parent.dead) { this.killNow(game); return; }       //（:35475-35478）
      if (this.naAi0 < 420) {
        this.x += parent.cx - this.naLastPX;                 //（:35483-35486 骑乘）
        this.y += parent.cy - this.naLastPY;
        this.vx += Math.sign(parent.cx - this.cx) * 0.15;    //（:35490-35492）
        this.vy += Math.sign(parent.cy - this.cy) * 0.15;
        const s618 = Math.hypot(this.vx, this.vy);
        if (s618 > 6) { this.vx *= 6 / s618; this.vy *= 6 / s618; }   //（:35493-35495）
      }
      this.naLastPX = parent.cx;
      this.naLastPY = parent.cy;
      this.alpha = 255;                                      //（:35533 恒隐身）
    } else if (this.projId === 617) {
      // ---- 617 星璇秘术（aiStyle 118，Projectile.cs:35283-35455，3476 星璇秘术）----
      // 两段：①快速段（|v|>4）：ai[0]≥30 起 v×0.98 + scale→1.3，|v|<4.1 归一 4 并
      //   ai[0] 清零（:35345-35352）；②慢速段（|v|≤4）：每 30 update（<241）掷一枚
      //   618 隐形火花（随机向×12、伤 = 本弹/2 int 截断 :35379-35383）+ 锁敌追踪
      //   （800 欧氏 + CanHit 盒心锁 ai[1]、<1000 保持、v=(v×7+dir×4)/8
      //   :35386-35441）+ ai[0]≥600 Kill（:35453-35455）。alpha −15/t 渐显。
      this.na617Ai0++;
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 15);
      // ★R28 环绕尘带（:35293-35342 快速段 1/3 掷 / :35345-35372 慢速段每拍一组）：
      //   半数 d86|d90 Crimson 切向环绕（pos=心−UnitY.rot 随机×10~21、v=切向×6）、
      //   半数 d240 外环 ×30（v=反切向×3）；customData=弹体跟随语义未接,普通尘近似
      {
        const unit617 = (): [number, number] => {
          const a = Math.random() * Math.PI * 2;             // UnitY.RotatedByRandom(2π)
          return [-Math.sin(a), Math.cos(a)];
        };
        if (Math.hypot(this.vx, this.vy) > 4) {
          if (Math.floor(Math.random() * 3) === 0) {
            const [ux, uy] = unit617();
            if (Math.random() < 0.5) {
              const d617a = game.spawnDust?.(this.cx - ux * (10 + Math.random() * 11),
                this.cy - uy * (10 + Math.random() * 11), 1, 1,
                Math.random() < 0.5 ? 86 : 90,
                -uy * 6, ux * 6, 0, null, 0.5 + Math.random(), true);   // 切向 = rot(+π/2)
              if (d617a) d617a.fadeIn = 0.5;
            } else {
              const d617b = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30,
                1, 1, 240, uy * 3, -ux * 3, 0, null, 0.5 + Math.random(), true);
              if (d617b) d617b.fadeIn = 0.5;
            }
          }
        } else if (Math.floor(Math.random() * 2) === 0) {
          // 慢速段（:35345-35372）：1/2 掷 → d86+d90(Crimson) 切向环绕一组 +
          // d240 外环（×20~31、反切向×5）；scale 升档 0.9+
          const s617s = 0.9 + Math.random();
          {
            const [uxa, uya] = unit617();
            const da = game.spawnDust?.(this.cx - uxa * (10 + Math.random() * 11),
              this.cy - uya * (10 + Math.random() * 11), 1, 1, 86,
              -uya * 6, uxa * 6, 0, null, s617s, true);
            if (da) da.fadeIn = 0.5;
          }
          {
            const [uxb, uyb] = unit617();
            const db = game.spawnDust?.(this.cx - uxb * (10 + Math.random() * 11),
              this.cy - uyb * (10 + Math.random() * 11), 1, 1, 90,
              -uyb * 6, uxb * 6, 0, { r: 220, g: 20, b: 60, a: 255 }, s617s, true);
            if (db) db.fadeIn = 0.5;
          }
          {
            const [uxc, uyc] = unit617();
            const dc = game.spawnDust?.(this.cx - uxc * (20 + Math.random() * 11),
              this.cy - uyc * (20 + Math.random() * 11), 1, 1, 240,
              uyc * 5, -uxc * 5, 0, null, s617s, true);
            if (dc) dc.fadeIn = 0.5;
          }
        }
      }
      if (Math.hypot(this.vx, this.vy) > 4) {
        if (this.na617Ai0 >= 30) {
          this.vx *= 0.98; this.vy *= 0.98;                  //（:35347-35348）
          this.drawScale = Math.min(1.3, this.drawScale + 0.0074468083);   //（:35349-35352）
        }
        const sp617 = Math.hypot(this.vx, this.vy);
        if (sp617 > 0 && sp617 < 4.1) {                      //（:35353-35357）
          this.vx = (this.vx / sp617) * 4;
          this.vy = (this.vy / sp617) * 4;
          this.na617Ai0 = 0;
        }
      } else {
        // 慢速段：618 掷骰（:35379-35383）
        if (this.na617Ai0 % 30 === 0 && this.na617Ai0 < 241) {
          const ents617 = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
          if (ents617?.add) {
            const a618 = Math.random() * Math.PI * 2;        // UnitY.RotatedByRandom(2π)
            const spark = new Arrow(this.cx, this.cy,
              -Math.sin(a618) * 12, Math.cos(a618) * 12,
              Math.max(1, Math.trunc(this.damage / 2)), 0, 618, null,
              { grav: 0, life: 420, pierce: -1 });
            spark.naParent = this;                           // ai[1] = ProjectileKey
            spark.naLastPX = this.cx;
            spark.naLastPY = this.cy;
            spark.critChance = this.critChance;
            spark.armorPen = this.armorPen;
            ents617.add(spark, 'projectiles');
          }
        }
        // 锁敌追踪（:35386-35441）
        if (this.na617Ai1 === 0) {
          let best617 = 800;
          let bestId617 = 0;
          for (const ent of game.enemies()) {
            const e = ent as unknown as { id: number; x: number; y: number; w: number; h: number; dead?: boolean };
            if (e.dead) continue;
            if (!playerCanHitEnemy(ent, game, this.projId)) continue;
            const d617 = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
            if (d617 >= best617) continue;
            if (!canHitLine(world.store, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y + e.h / 2, 0, 0)) continue;
            best617 = d617;
            bestId617 = e.id;
          }
          if (bestId617 !== 0) this.na617Ai1 = bestId617;    //（:35417-35427）
        }
        let steer617 = false;
        let tx617 = 0, ty617 = 0;
        if (this.na617Ai1 !== 0) {
          const t617 = (game.enemies() as Array<{ id: number; x: number; y: number; w: number; h: number; dead?: boolean }>)
            .find((e) => e.id === this.na617Ai1);
          //（:35429-35436）active + CanBeChasedBy(ignoreDontTakeDamage) + <1000 欧氏
          if (t617 && !t617.dead
            && Math.hypot(t617.x + t617.w / 2 - this.cx, t617.y + t617.h / 2 - this.cy) < 1000) {
            steer617 = true;
            tx617 = t617.x + t617.w / 2; ty617 = t617.y + t617.h / 2;
          } else {
            this.na617Ai1 = 0;                               // 失效清锁重搜
          }
        }
        if (steer617) {                                      //（:35443-35441 v=(v×7+dir×4)/8）
          const dx617 = tx617 - this.cx, dy617 = ty617 - this.cy;
          const dl617 = Math.hypot(dx617, dy617) || 1;
          this.vx = (this.vx * 7 + (dx617 / dl617) * 4) / 8;
          this.vy = (this.vy * 7 + (dy617 / dl617) * 4) / 8;
        }
        if (this.na617Ai0 >= 600) { this.killNow(game); return; }   //（:35453-35455）
      }
    } else if (this.projId === 92) {
      // 92 坠星（aiStyle 5，Projectile.cs:22152-22156 + :22222-22245，圣箭 Kill 链）：
      // 无重力直飞（aiStyle5 无重力段）；弹顶越过 ai[1] 命中线才恢复撞块（:22152-22156，
      // SetDefaults tileCollide=false → 线上方穿墙）；light 0.9（:22334）+ 1/10 尘 58
      // 星屑尾（:22336-22339）；alpha 通用闪烁档 0↔200（:22222-22238）；Item_9 星啸
      // 每 20-59t（:22166-22172）；rotation += sign(vx)·(|vx|+|vy|)·0.01（PROJ_SPIN 表）
      if (this.y > this.starFallLine) this.noTileCollide = false;
      this.lightRGB = [0.9, 0.9, 0.9];
      if (Math.random() < 0.1) {
        game.spawnDust?.(this.x, this.y, this.w, this.h, 58,
          this.vx * 0.5, this.vy * 0.5, 150, null, 1.2);
      }
      this.alpha += 25 * this.twinkleDir;
      if (this.alpha >= 200) { this.alpha = 200; this.twinkleDir = -1; }
      if (this.alpha <= 0) { this.alpha = 0; this.twinkleDir = 1; }
      if (--this.starSndCd <= 0) {
        this.starSndCd = 20 + Math.floor(Math.random() * 40);
        game.playSfxFiles?.(['Item_9'], 0.5, this.cx, this.cy);
      }
    } else if (this.projId === 485) {
      // 485 狱翼箭（AI_001 type 段，Projectile.cs:54826-54850）：v=(v×39+ai)/40
      // 逐拍向游移向量（ctor 掷定的 ai[0]/ai[1]）渐转（蝙蝠扇翅漂移感）；每拍
      // 火尘 6（noGravity、v×0.2、位置=(dust+Center)/2，:54830-54833）；帧推进
      // frameCounter≥2 推帧 5 帧循环（:54834-54843，2 拍/帧——曾走 age/5 恒 5 拍/帧）；
      // vx<0 镜像 + rotation=atan2(−vy,−vx)（:54844-54850）= PROJ_ROT_RIGHT draw 档
      this.vx = (this.vx * 39 + this.hwAiX) / 40;
      this.vy = (this.vy * 39 + this.hwAiY) / 40;
      const d485 = game.spawnDust?.(this.x, this.y, this.w, this.h, 6);
      if (d485) {
        d485.noGravity = true;
        d485.vx *= 0.2;
        d485.vy *= 0.2;
        d485.x = (d485.x + this.cx) / 2;
        d485.y = (d485.y + this.cy) / 2;
      }
      if (++this.hwFrameT >= 2) {
        this.hwFrameT = 0;
        this.hwFrame = (this.hwFrame + 1) % 5;
      }
    } else if (this.flare) {
      // ---- 信号枪族（aiStyle 33，AI_033 Projectile.cs:27425-27498）----
      // ① alpha −50/t 渐显（:27428-27435，SetDefaults 255 :2523 → 5 拍全显）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 50);
      // ② 尘尾（alpha<70 期每 update 一枚 :27444-27472）：型号按 FLARE_DUST 表
      //   （163→127 火花/1009→75 诅咒焰…），出生点 (x, y−2) 6×6、scale 1.6、
      //   noGravity、速度 = 弹速、位置/速度再沿姿态向量回退 1（拖在弹后）
      if (this.alpha < 70) {
        const n260 = 4;                                        // num260 = 4f（:27437）
        let fx = this.flareAi0, fy = this.flareAi1;
        if (fx === 0 && fy === 0) { fx = 1; fy = 0; }          // :27439-27441 零向量取 (1,0)
        const fl = Math.hypot(fx, fy) || 1;
        const ux = (fx / fl) * n260, uy = (fy / fl) * n260;    // 归一 ×4（:27442-27445）
        const dF = game.spawnDust?.(this.x, this.y - 2, 6, 6, FLARE_DUST[this.projId] ?? 127,
          this.vx, this.vy, 100, null, 1.6, true);
        if (dF) {
          dF.x -= ux; dF.y -= uy;
          dF.vx -= ux; dF.vy -= uy;
        }
      }
      // ③ 停驻/重力（:27474-27493）：localAI[0]==0 飞行档——ai 向量跟速度、
      //   localAI[1]≥30 后每拍 vy+0.09（自增后钳回 30 = 恒触发）；贴壁档——
      //   脱块回飞行（localAI[1]=30 立即续坠）+ damage=0（停驻弹不伤人）
      if (this.flareStuck === 0) {
        this.flareAi0 = this.vx;
        this.flareAi1 = this.vy;
        this.flareGravT++;
        if (this.flareGravT >= 30) {
          this.vy += 0.09;
          this.flareGravT = 30;
        }
      } else {
        if (!this.flareSolidOverlap(game)) {
          this.flareStuck = 0;
          this.flareGravT = 30;
        }
        this.damage = 0;
      }
      // ④ vy 钳 16（:27494-27496）
      if (this.vy > 16) this.vy = 16;
      // ⑤ rotation = atan2(ai1, ai0)+π/2（:27497，draw 侧消费 flareAi 向量）
    } else if (this.nail93) {
      // ---- 钉 514（aiStyle 93，AI_093 Projectile.cs:33425-33487）----
      // ① alpha −25/t 渐显（:33427-33434）+ vy 钳 18（:33435-33438）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 25);
      if (this.vy > 18) this.vy = 18;
      if (this.nailAi0 === 0) {
        // ② 飞行档：ai[1]>20 后下垂（vy+0.1、vx×0.992，:33439-33448）；rotation
        //    恒跟速度（默认 atan2+π/2 draw 档即 :33447）
        this.nailAi1++;
        if (this.nailAi1 > 20) { this.vy += 0.1; this.vx *= 0.992; }
      } else if (this.nailAi0 === 1) {
        // ③ 撞块弹开档：tileCollide=false + 速度 ×0.6/t 衰减（:33450-33455），
        //    ai[1]>90 消亡（:33479-33486）
        this.noTileCollide = true;
        this.vx *= 0.6; this.vy *= 0.6;
        if (++this.nailAi1 > 90) { this.killNow(game); return; }
      } else {
        // ④ 刺入档（ai[0]<0）：钉心 = 敌心 − velocity（velocity 即刺入偏移向量，
        //    :33459-33463）；敌亡 → 脱刺随机 6 速弹出（:33464-33473）；偏移过长
        //    ×0.99 收敛（:33474-33477）；ai[1]>90 消亡（:33479-33486）
        this.noTileCollide = true;
        const eid = -this.nailAi0 - 1;
        const tgt = (game.enemies() as Array<{ id: number; dead: boolean; cx: number; cy: number; w: number; h: number }>)
          .find((e2) => e2.id === eid);
        if (!tgt || tgt.dead) {
          this.nailAi0 = 0;
          this.nailAi1 = 20;
          const aN = Math.random() * Math.PI * 2;   // Next(-100,101)² 归一 ×6 等价
          this.vx = Math.cos(aN) * 6;
          this.vy = Math.sin(aN) * 6;
        } else {
          if (Math.hypot(this.vx, this.vy) > (tgt.w + tgt.h) / 3) { this.vx *= 0.99; this.vy *= 0.99; }
          this.x = tgt.cx - this.vx - this.w / 2;
          this.y = tgt.cy - this.vy - this.h / 2;
          if (++this.nailAi1 > 90) { this.killNow(game); return; }
          // 刺入 DoT（Damage aiStyle93 段 :13368-13376 dmg×0.15 + :14060-14062
          // immune[owner]=1 隔拍再刺）；暴击链同通用弹
          if (++this.nailDotT >= 2) {
            this.nailDotT = 0;
            const rec = tgt as unknown as { hurt?: (...a: unknown[]) => boolean; iframes?: number };
            if (rec.hurt && !(tgt as unknown as { dead?: boolean }).dead) {
              const critN = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
              const dN = Math.max(1, Math.trunc(this.damage * 0.15)) * (critN ? 2 : 1);
              rec.hurt(dN, 0, 0, game, this.settlePen, critN, 1, true);   // 音/飘值=StrikeNPC 单点
            }
          }
        }
      }
    } else if (this.projId === 246) {
      // 刺炮弹 246（AI_001 type 段 :58105-58114，刺炮发射器 1258）：alpha −20/t
      // 渐显（SetDefaults 255 :3296）+ ai[0]≥60 后 vy+0.15/t 下坠（age=ai[0]，
      // extraUpdates 1 → 2 子步/t 同 vanilla ai[0] 节奏）；Kill 爆炸+249 破片在
      // Game.onProjectileDeath 246 分支
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 20);
      if (this.age >= 60) this.vy += 0.15;
    } else if (this.projId === 311) {
      // 糖果玉米 311（AI_001 type 段 :58116-58132，糖果玉米步枪 1782）：alpha
      // −50/t 渐显（SetDefaults 255 :4041）+ ai[0]≥30 后 vy+0.5/t 下坠
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 50);
      if (this.age >= 30) this.vy += 0.5;
    }
    // ---- alpha 通道 AI 侧（修复4：Projectile.alpha 逐型衰减）----
    if (this.projId === 521) {
      // 521 水晶脉冲（aiStyle 29，Projectile.cs:25086-25100）：alpha −50/t 淡入；
      // 归零后每拍星尘 254×3 + 255×2（:25063-25085）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 50);
      else {
        game.spawnParticles(this.cx, this.cy, '#B878E8', 3, 0.6, { life: 16, grav: 0 });
        game.spawnParticles(this.cx, this.cy, '#F0C8F8', 2, 0.2, { life: 14, grav: 0 });
      }
    } else if (this.projId === 639) {
      // 639 月总箭（AI_001，Projectile.cs:52999-53003）：alpha −55/t 淡入
      // （归零 16 芒星环特效属"特殊箭特效"后续批，登记未接）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 55);
    } else if (this.projId === 477 || this.projId === 478) {
      // 477/478 镖（AI_001，Projectile.cs:54412-54415）：localAI[0]>3 → alpha=0
      // （前 3 拍隐形——GetAlpha :76303-76308 alpha≠0 返回 (0,0,0,0)）
      if (this.age > 3) this.alpha = 0;
    }
    // 477 水晶镖旋转平滑（AI_001 type 段，Projectile.cs:54802-54812）：localAI[1]<5
    // 前 rotation = atan2(vy,vx)+π/2（对齐速度角），之后 (rot×2+aim)/3 渐近平滑
    //（镖体翻滚滞后感）——draw 侧消费 dartRot。localAI[1] 每 AI 步 +1（extraUpdates
    // 1 → 2 子步/帧，age 即子步龄，前 5 子步对齐）
    if (this.projId === 477) {
      const aim477 = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      if (this.age <= 5) this.dartRot = aim477;
      else this.dartRot = ((this.dartRot ?? aim477) * 2 + aim477) / 3;
    }
    // 1457 邪恶三叉戟弹 114 重做（AI aiStyle27 头 :26778-26812,1456 无此块）：
    // scale 1.5、ai[0] 计时、localAI[0]=初速;20t 后速度 ×0.98 减速淡出,<1 Kill;
    // alpha = Remap(localAI[0],2,0,1,0)×255（速度衰减即淡出）
    if (this.projId === 114) {
      if (this.drawScale !== 1.5) this.drawScale = 1.5;
      this.gem114T++;
      if (this.gem114T >= 20) {
        this.vx *= 0.98;
        this.vy *= 0.98;
        // Kill 门原版 = localAI[0] < 1（初速快照,与 velocity 同步 ×0.98 衰减 :26789-26793）
        // ——读实时速度等价（仅外力改写 velocity 时分叉,登记）
        if (Math.hypot(this.vx, this.vy) < 1) { this.killNow(game); return; }
      }
      // alpha = Remap(localAI[0],2,0,1,0)×255（:26794-26796）——高速段恒 255 隐身
      //（SetDefaults alpha=255 :2031 + 27 号尘迹标记弹道）,减速穿 2 后线性显形至停,
      // 消亡前完全实体（蓝队 R7-6：曾 alpha 恒 0 全程不透明——方向反了,原版是
      // "隐身加速段+减速显形",非"减速渐隐"）
      const sp114 = Math.hypot(this.vx, this.vy);
      const a114 = Math.max(0, Math.min(1, sp114 / 2));
      this.alpha = Math.round(a114 * 255);
      // 1/2 掷 27 号尘（:26797-26807）：rand+0.2 < 显形度 才掷,位置=弹心+随机 16
      // −速度×2.5、速度=+v×0.5（原版 oldVelocity 链 ×−0.5→位移×5→×−1 净效果）
      if (Math.random() < 0.5 && Math.random() + 0.2 < a114) {
        const d114 = game.spawnDust?.(
          this.cx + (Math.random() * 2 - 1) * 16 - this.vx * 2.5,
          this.cy + 4 + (Math.random() * 2 - 1) * 16 - this.vy * 2.5,
          8, 8, 27, this.vx * 0.5, this.vy * 0.5, 100, null, 1 + Math.random() * 0.6);
        void d114;
      }
    }
    // 1457 宝石法珠行为（AI_029_GemStaffs :38561-38640 + HandleMovement :18106-18160）：
    //   Homing 视距 500（FastThenSlow/CanBounce ×2=1000）、转向率随距离/速度;
    //   FastThenSlow 恒 ×0.97 减速（缩到 0.1 以下 Kill）;
    //   SwirlTwins 垂直向正弦摆（幅 6、0.05Hz×π 相位）
    if (this.gem) {
      const g = this.gem;
      if (g.swirlTwins) {
        // :38618-38630 num18=ai[1]×π(孪生弹反相);本仓 gemPhase 0/1
        const num18 = this.gemPhase * Math.PI;
        const n19 = Math.sin((this.gemSwirlT) * (Math.PI * 2) * 0.05 + num18);
        const n20 = Math.sin((this.gemSwirlT + 1) * (Math.PI * 2) * 0.05 + num18);
        this.gemSwirlT++;
        const d = n20 - n19;
        const sp = Math.hypot(this.vx, this.vy) || 1;
        this.x += (-this.vy / sp) * d * 6;
        this.y += (this.vx / sp) * d * 6;
      }
      if (g.fastThenSlow) {
        // :38633-38641 减速段：速度 >0.1 恒 ×0.97；≤0.1 后逐帧 scale −0.005 收缩、
        // <0.1 Kill（不是悬停到 timeLeft 自然消亡——蓝队 R2-13 补；scale 仅视觉，
        // 原版 Colliding 用 width/height 不随 scale 缩）
        if (Math.hypot(this.vx, this.vy) > 0.1) { this.vx *= 0.97; this.vy *= 0.97; }
        else {
          this.drawScale -= 0.005;
          if (this.drawScale < 0.1) { this.killNow(game); return; }
        }
      }
      if (g.homing) {
        // :38563-38624 视距 500（FastThenSlow/CanBounce ×2）;FindTargetWithLineOfSight
        // 取最近有视线目标;速度 <num9(8,FastThenSlow×2) 时 +0.1 提速并 ×1.1;
        // rotateTowards 转向率 = Remap(距离,视距,0,0,1)×0.1+0.01（近距 +0.05 并
        // Remap(速度,1,3,10,1) 放大）;近距 150px 内再向目标速度 lerp 0.2
        const range = 500 * ((g.fastThenSlow || g.canBounce) ? 2 : 1);
        const tgt = this.nearestEnemyWithLos(game, range);
        if (tgt) {
          let sp = Math.hypot(this.vx, this.vy);
          const maxSp = 8 * (g.fastThenSlow ? 2 : 1);
          if (sp < maxSp) {
            // :38580-38584 先双轴 +0.1×单位向、再双轴 ×1.1（蓝队 R7-10：曾 0.1 项只加
            // 在 vx、vy 直接 ×1.1——低速近距竖直飞行的法向收敛不对称）
            const inv = 1 / (sp || 1);
            this.vx += this.vx * inv * 0.1;
            this.vy += this.vy * inv * 0.1;
            this.vx *= 1.1;
            this.vy *= 1.1;
            sp = Math.hypot(this.vx, this.vy);
          }
          const dist = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
          // :38591-38601 转向率 = Remap(dist,range,0,0,1)×0.1 + 0.01；低速(<maxSp)
          //  再 +0.05 后【整项】×Remap(sp,1,3,10,1)（蓝队 R7-11：曾乘子只作用于 0.05
          //  加法项且线性近似——speed=1 时我方 0.61 vs 原版 1.6，2.6 倍偏弱）
          let turn = Math.max(0, 1 - dist / range) * 0.1 + 0.01;
          if (sp < maxSp) {
            turn = (turn + 0.05) * Math.max(1, Math.min(10, 10 - (sp - 1) * 4.5));   // Remap(sp,1,3,10,1)
          }
          // :38598-38601 FastThenSlow 高速段转向衰减 num14 *= Remap(speed,30,40,1,0)
          // ——×5 出速(40)起步完全不拐弯，减速穿 30 后线性恢复满转向（蓝队 R2-12 补）
          if (g.fastThenSlow) turn *= Math.max(0, Math.min(1, 1 - (sp - 30) / 10));
          const want = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
          const cur = Math.atan2(this.vy, this.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const nv = cur + Math.max(-turn, Math.min(turn, diff));
          this.vx = Math.cos(nv) * sp;
          this.vy = Math.sin(nv) * sp;
          if (dist < 150) {           // :38622-38623 近距收敛 lerp（目标向量 = Zero.MoveTowards
            //  (敌偏移, maxSp)——偏移长 <maxSp 时返回原偏移向量本身不越界;曾恒取
            //  单位向×maxSp，dist<8 时目标长 8 > 实际偏移造成过冲振荡。蓝队 R7-12）
            const k = Math.max(0, 1 - dist / 150) * 0.2;
            const capped = dist > maxSp;
            const txv = capped ? ((tgt.cx - this.cx) / dist) * maxSp : (tgt.cx - this.cx);
            const tyv = capped ? ((tgt.cy - this.cy) / dist) * maxSp : (tgt.cy - this.cy);
            this.vx = this.vx * (1 - k) + txv * k;
            this.vy = this.vy * (1 - k) + tyv * k;
          }
        }
      }
    }
    // 329 焰镰（aiStyle 56，:27666-27687）：首步继承发射者 rotation；此后
    // |vx|+|vy|<16 → 速度 ×1.05 自加速（子步粒度——原版 AI 每 update 一跑）；恒旋
    if (this.scytheRot !== null) {
      if (!this.scytheInit) {
        this.scytheInit = true;
        this.spinRot = this.scytheRot;      // localAI[0]==0 → rotation = ai[0]（:27668-27672）
      }
      const mag = Math.abs(this.vx) + Math.abs(this.vy);
      if (mag < 16) { this.vx *= 1.05; this.vy *= 1.05; }
      this.spinRot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.025 * (this.vx < 0 ? -1 : 1);   // :27686
    }
    // 351 礼盒（aiStyle 58，:27727-27757）：两段重力 + 淡入 + 帧 0/1
    if (this.present) {
      this.presentT += 1;
      this.presentAlpha = Math.max(0, this.presentAlpha - 50);   // :27729-27733
      if (this.presentStage === 0) {
        if (this.presentT > 30) this.vy += 0.1;                  // :27737-27741
        if (this.vy >= 0) this.presentStage = 1;                 // :27742-27745
      } else {
        this.vy = Math.min(this.vy + 0.1, 3);                    // :27750-27754
        this.vx *= 0.99;
      }
    }
    // 翻滚（aiStyle 2 刀族 :21508，自出生每 tick 累加）；48/54/93/520/599 在
    // 平飞期由 draw 侧姿态锁定覆盖（:21971-21972）
    if (this.tumble) {
      this.tumbleRot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * (this.vx >= 0 ? 1 : -1);
    }
    // 恒旋族（AI_001 :54741-54749/:54822-54825）：rotation 逐 update 累加
    const spinFn = PROJ_SPIN[this.projId];
    if (spinFn) this.spinRot += spinFn(this);
    // 大地巨石 261：慢速消亡（|v|<1.5）+ 墙撞爆岩视觉（:18235-18244）
    if (this.boulder) {
      const spd261 = Math.hypot(this.vx, this.vy);
      if (spd261 < 1.5) { this.killNow(game); return; }
      if (this.hitWall && spd261 > 3) {
        game.playSfx('dig', 1, this.cx, this.cy);
        game.spawnParticles(this.cx, this.cy, '#8C6A4A', 10, 3, { life: 30 });
      }
    }
    // 飞龙剑气 684（AI_001 type 段 :52086-52098）：alpha 255−40/t 渐显 + 尘 60 拖尾
    if (this.dragonFade) {
      this.dragonAlpha = Math.max(0, this.dragonAlpha - 40);
      if (Math.random() < 0.5) {
        game.spawnParticles(this.cx + (Math.random() - 0.5) * 20, this.cy + (Math.random() - 0.5) * 80,
          '#C0E8FF', 1, 0.8, { life: 16 });
      }
    }
    // 泰拉刃光束 985（AI_191 :39248-39266 + 985 专属尾段 :39333-39377）：
    // 寿命 = ai[1]+25（出生 18 → 43t）；淡入 ai[1]/2=9t、末 12t 淡出（:39344）；
    // t≥Lerp(ai1,ai1+25,0.65)≈34 清伤（纯视觉尾段）；>8 速才减速/探墙（:39362
    // velocity.Length()>8 → ×0.94/t + 探墙 localAI[1] → ×0.8/×0.88 阻尼——正牌
    // 出生速=瞄准向×shootSpeed×5=60（Player.cs:48316，Game 侧已修正漏乘），
    // 分支全程激活至衰减速降 ≤8；973 甩剑共用段）
    if (this.terra) {
      this.terraT++;
      const terraLife = this.terraAi1 + 25;
      if (this.terraT >= terraLife) { this.killNow(game); return; }
      if (!this.terraNoHit && this.terraT >= Math.round(this.terraAi1 + 25 * 0.65)) {
        this.terraNoHit = true;
        this.damage = 0;                                  // :39337-39340 damage=0
      }
      const stT = world.store;
      this.lightRGB = [0.25, 0.86, 0.38];    // Color(64,220,96)（:39382）
      // 光心 = 弹心 + 朝向 ×85×scale（:39382 Center+rotation.ToRotationVector2()*85*scale）
      {
        const sp = Math.hypot(this.vx, this.vy) || 1;
        this.lightRGBAt = { x: this.cx + (this.vx / sp) * 85, y: this.cy + (this.vy / sp) * 85 };
      }
      if (Math.hypot(this.vx, this.vy) > 0.5 && Math.random() < 0.6) {
        game.spawnParticles(this.cx, this.cy, '#7CE81E', 1, 1.2, { life: 18 });
      }
      if (Math.hypot(this.vx, this.vy) > 8) {
        this.vx *= 0.94; this.vy *= 0.94;
        if (!this.terraWall) {
          const rot = Math.atan2(this.vy, this.vx);
          let clear = false;
          for (let k = -1; k <= 1 && !clear; k += 0.5) {
            const a = rot + k * (Math.PI / 4) * 0.25;
            clear = canHit(stT, this.cx, this.cy, 0, 0,
              this.cx + Math.cos(a) * 110, this.cy + Math.sin(a) * 110, 0, 0);
          }
          if (!clear) this.terraWall = true;
        }
        if (this.terraWall && Math.hypot(this.vx, this.vy) > 8) { this.vx *= 0.8; this.vy *= 0.8; }
        if (this.terraWall) { this.vx *= 0.88; this.vy *= 0.88; }
      }
    }
    // 星怒剑 503（aiStyle 5 :22139-22157 + 503 段 :22197-22266）：无重力恒速；
    // 线上方穿墙（tileCollide=false）→ 越线后撞块；alpha 255−15/t 渐显（线上
    // 钳 150 / 线下钳 0）；周期 Item9 星啸；尘 58 星尘尾；rotation=vel−π/2（draw 侧）
    if (this.starY !== null) {
      // :22139-22143 tileCollide=true 仅当 Center.Y > ai[1]（严格大于——边界对齐）
      this.starCollide = this.cy > this.starY;
      const above = this.cy < this.starY;
      const floorA = above ? 150 : 0;
      this.starAlpha = Math.max(floorA, this.starAlpha - 15);
      if (--this.starSndT <= 0) {
        this.starSndT = 20 + Math.floor(Math.random() * 40);
        game.playSfxFiles(['Item_9'], 0.5, this.cx, this.cy);
      }
      if (Math.random() < 0.3) {
        game.spawnParticles(this.cx, this.cy, '#FFF8C8', 1, 0.9, { life: 20 });
      }
    }
    // 专家追踪（Projectile.cs:54330-54345 275/276 / :23307-23316 277：
    // v=(v*(weight-1)+dirToPlayer*speed)/weight；<floor 或 >cap 归一）
    // 270 骷髅髅骨（:53192-53213）：ai1 30-110 窗口转向（保速混合）+ <18 速
    // ×1.02/t 自加速
    if (this.skullBoneT > 0) {
      this.skullBoneT += 1;
      const p = game.player;
      if (p && !p.dead && this.skullBoneT > 30 && this.skullBoneT < 110) {
        const spd = Math.hypot(this.vx, this.vy) || 0.001;
        const ddx = p.cx - this.cx, ddy = p.cy - this.cy;
        const dl = Math.hypot(ddx, ddy) || 1;
        let nvx = (this.vx * 24 + (ddx / dl) * spd) / 25;
        let nvy = (this.vy * 24 + (ddy / dl) * spd) / 25;
        const nl = Math.hypot(nvx, nvy) || 1;
        this.vx = nvx / nl * spd; this.vy = nvy / nl * spd;
      }
      if (Math.hypot(this.vx, this.vy) < 18) { this.vx *= 1.02; this.vy *= 1.02; }
    }
    // ---- 452 月总幻影矢（aiStyle 82，Projectile.cs:30119-30195）三段弹道 ----
    if (this.phantasm) {
      this.phAlpha = Math.max(0, this.phAlpha - 40);            // :30121-30125 渐显
      const riseArc = () => {
        // :30135-30144 / :30172-30181：vx = velocity.RotatedBy(ai1).X 钳 ±6；
        // vy −0.08（vy>0 再 −0.2）、钳 −7
        const c = Math.cos(this.phSpin), s = Math.sin(this.phSpin);
        this.vx = Math.max(-6, Math.min(6, this.vx * c - this.vy * s));
        this.vy -= 0.08;
        if (this.vy > 0) this.vy -= 0.2;
        if (this.vy < -7) this.vy = -7;
      };
      if (this.phStage === 0) {
        this.phT++;
        if (this.phT >= 45) { this.phT = 0; this.phStage = 1; this.phSpin = -this.phSpin; }  // :30128-30134
        riseArc();
      } else if (this.phStage === 1) {
        this.phT++;
        // :30163-30171：90t 末 ai[1] = FindClosest 索引（单人恒 0 = 旋转恒等）
        if (this.phT >= 90) { this.phT = 0; this.phStage = 2; this.phSpin = 0; }
        riseArc();
      } else {
        // :30176-30196 14 速追踪：距玩家 <30 消亡（触发 Game 452 爆炸钩）
        const p = game.player;
        if (p && !p.dead) {
          let ddx = p.cx - this.cx, ddy = p.cy - this.cy;
          const dist = Math.hypot(ddx, ddy);
          if (dist < 30) { this.killNow(game); return; }
          ddx = ddx / dist * 14;
          ddy = ddy / dist * 14;
          const tx2 = this.vx + (ddx - this.vx) * 0.6;          // Lerp(v, dir·14, 0.6)
          let ty2 = this.vy + (ddy - this.vy) * 0.6;
          if (ty2 < 6) ty2 = 6;                                 // :30186-30188 目标 vy 钳 ≥6
          const st = 0.4;
          if (this.vx < tx2) { this.vx += st; if (this.vx < 0 && tx2 > 0) this.vx += st; }
          else if (this.vx > tx2) { this.vx -= st; if (this.vx > 0 && tx2 < 0) this.vx -= st; }
          if (this.vy < ty2) { this.vy += st; if (this.vy < 0 && ty2 > 0) this.vy += st; }
          else if (this.vy > ty2) { this.vy -= st; if (this.vy > 0 && ty2 < 0) this.vy -= st; }
        }
      }
      // :30197-30199 alpha<40 尘 229（速度 −v/3）
      if (this.phAlpha < 40) {
        game.spawnParticles(this.cx, this.cy, '#C060E8', 1, 0.8, { life: 20 });
      }
    }
    // ---- 454 月总幻影能量球（aiStyle 83，Projectile.cs:30236-30282）----
    if (this.phantomOrb) {
      // :30238-30245 alpha 255 → 钳 200 → −5/t（scale 随之伸展，draw 消费）
      this.orbAlpha = Math.min(this.orbAlpha, 200);
      this.orbAlpha = Math.max(0, this.orbAlpha - 5);
      if (this.orbAi0 >= 0) this.orbAi0++;                      // :30246-30248
      if (this.orbAi0 === -1) {
        // :30249-30253 齐射态：帧 1 + extraUpdates=1（速度由发射点统一给定）
        this.orbFrame = 1;
        this.extraUpdates = 1;
      } else {
        const src = (game.enemies() as Array<{ id: number; dead: boolean; cx: number; cy: number }>)
          .find((n) => n.id === this.orbOwnerId);
        const ax = src && !src.dead ? src.cx : (this.orbAnchor?.x ?? this.cx);
        const ay = src && !src.dead ? src.cy : (this.orbAnchor?.y ?? this.cy);
        if (src && !src.dead) this.orbAnchor = { x: ax, y: ay };
        if (this.orbAi0 < 30) {
          // :30254-30257 附主随行：position = 主心 − 尺寸/2 − v（下方位移段 +v
          // 落回主心——原版 AI 直写 + HandleMovement 加 v 的合成语义）
          this.x = ax - this.w / 2 - this.vx;
          this.y = ay - this.h / 2 - this.vy;
        } else {
          // :30258-30267 列队：×0.96 减速 + 帧 0/1 每 6t 切换
          this.vx *= 0.96;
          this.vy *= 0.96;
          if (++this.orbFrameT >= 6) {
            this.orbFrameT = 0;
            this.orbFrame = this.orbFrame === 0 ? 1 : 0;
          }
        }
      }
      // :30280-30281 alpha<40 每步尘 229 ×2
      if (this.orbAlpha < 40) {
        game.spawnParticles(this.cx, this.cy, '#C060E8', 2, 0.5, { life: 18 });
      }
    }
    // ---- 1021 月总巨砾（aiStyle 25，Projectile.cs:24666-24712 物理段）----
    // 重力 0.06/终端 16 走 grav 链（spawn 侧传 grav 0.06）；此处滚动旋转 +
    // 地面滚动加速
    if (this.mlBoulder) {
      this.spinRot += this.vx * 0.06;                           // :24666 rotation += vx·0.06
      if (Math.abs(this.vy) <= 1) {                             // :24685-24693 |vy|≤1 滚动加速
        if (this.vx > 0 && this.vx < 3.5) this.vx += 0.025;
        else if (this.vx < 0 && this.vx > -3.5) this.vx -= 0.025;
      }
    }
    // ---- 448 火箭（aiStyle 80，Projectile.cs:29801-29890）----
    if (this.martianRocket) {
      if (this.rkAi0 === 0 && this.rkFuse > 0) {
        this.rkFuse--;                                          // :29804-29806 引信倒数（20t）
      } else if (this.rkAi0 === 0) {
        // :29807-29827 点火：+4 加速 + 8 尘爆 + 锁定 + tileCollide=true
        this.rkAi0 = 1;
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > 0) {
          const k = (spd + 4) / spd;
          this.vx *= k; this.vy *= k;
        }
        this.noTileCollide = false;                             // :29833 tileCollide = true
        const rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        const cr = Math.cos(rot - Math.PI / 2), sr = Math.sin(rot - Math.PI / 2);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          const ox = -8 - Math.cos(a) * 2, oy = -Math.sin(a) * 8;   // :29815-29817 UnitX·−8 + −UnitY.Rot(i·π/4)·(2,8)
          game.spawnParticles(this.cx + ox * cr - oy * sr, this.cy + ox * sr + oy * cr,
            '#FFD070', 1, 0, { life: 16 });
        }
      } else {
        // :29832-29860 点火后：180t 自毁；[0,30) 逐 t 20% 角度转向玩家
        this.rkT++;
        if (this.rkT === 180) { this.killNow(game); return; }
        const p = game.player;
        if (this.rkT < 30 && p && !p.dead) {
          const cur = Math.atan2(this.vy, this.vx);
          let diff = Math.atan2(p.cy - this.cy, p.cx - this.cx) - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const ca = Math.cos(diff * 0.2), sa = Math.sin(diff * 0.2);
          const nvx = this.vx * ca - this.vy * sa;
          const nvy = this.vx * sa + this.vy * ca;
          this.vx = nvx; this.vy = nvy;
        }
      }
      // :29862-29868 帧 3t/帧 3 帧循环；:29869-29877 每 t 尾焰尘 1+ai0 枚
      // （喷口 = Center + UnitY.RotatedBy(rotation)·8·(i+1)，rotation = 速度角+π/2）
      if (++this.rkFrameT >= 3) { this.rkFrameT = 0; this.rkFrame = (this.rkFrame + 1) % 3; }
      const rkRot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      game.spawnParticles(this.cx + Math.cos(rkRot) * 8, this.cy + Math.sin(rkRot) * 8,
        '#FFB040', 1 + this.rkAi0, 0, { life: 14 });
      // :29878-29889 距玩家 ≤42 → Kill 爆炸（伤害由爆炸盒投递）
      const pr = game.player;
      if (pr && !pr.dead && Math.hypot(pr.cx - this.cx, pr.cy - this.cy) <= 42) {
        this.killNow(game);
        return;
      }
    }
    if (this.homing) {
      const p = game.player;
      if (p && !p.dead) {
        let dx = p.cx - (this.x + this.w / 2), dy = p.cy - (this.y + this.h / 2);
        const d = Math.hypot(dx, dy) || 1;
        dx = dx / d * this.homing.speed;
        dy = dy / d * this.homing.speed;
        // axis：原版单轴混入档（刺球 277 专家只混 X,:23307-23316）
        this.vx = (this.vx * (this.homing.weight - 1) + dx) / this.homing.weight;
        if (this.homing.axis !== 'x') this.vy = (this.vy * (this.homing.weight - 1) + dy) / this.homing.weight;
        const sp = Math.hypot(this.vx, this.vy);
        if (this.homing.floor !== undefined && sp < this.homing.floor && sp > 0) {
          this.vx = this.vx / sp * this.homing.floor;
          this.vy = this.vy / sp * this.homing.floor;
        }
        if (this.homing.cap !== undefined && sp > this.homing.cap) {
          this.vx = this.vx / sp * this.homing.cap;
          this.vy = this.vy / sp * this.homing.cap;
        }
      }
    }
    // ---- 电圈发射器导弹 442（AI_001 type 段 Projectile.cs:55689-55740，1:1）----
    // ① 渐显（:55691-55703）：alpha 255 起，localAI[0] 计数 ≥4 后每拍 −90（计数
    //    复位仅发生在钳 0 拍 → 实际 4/5/6 三拍归零，非每 4 拍一步）；② 到点杀
    //    （:55704-55710）：弹心与锁定格心 (ai×16+8) 距 ≤16 → Kill（Kill 特效/电球
    //    443 生成在 Game.onProjectileDeath 442 分支——全消亡路径同 vanilla Kill()
    //    单口）；③ alpha==0 期（:55708-55730）：localAI[1] ≥120 超时 Kill +
    //    Lighting(0.3,0.45,0.8) 青蓝光 + localAI[0]==3 拍（每 3t）8 粒 135 尘旋转环
    //    （scale 1.5/noGravity/绕 rotation−π/2=速度角，速度 = v×0.66）。
    //    ★本段无 velocity 修正式——导弹直线飞行，"飞向锁定点"由初速方向 + 到点杀
    //    组成（发射侧 Game 2796 分支传 aimPoint）。
    if (this.projId === 442 && this.aimPt) {
      if (this.alpha !== 0) {
        this.aimCnt++;
        if (this.aimCnt >= 4) {
          this.alpha -= 90;
          if (this.alpha < 0) { this.alpha = 0; this.aimCnt = 2; }
        }
      }
      const px = this.aimPt.tx * 16 + 8, py = this.aimPt.ty * 16 + 8;
      if (Math.hypot(this.cx - px, this.cy - py) <= 16) { this.killNow(game); return; }
      if (this.alpha === 0) {
        if (++this.aimLife >= 120) { this.killNow(game); return; }
        this.lightRGB = [0.3, 0.45, 0.8];                    //（:55713）
        if (++this.aimCnt >= 3) {                            //（:55714-55730）
          this.aimCnt = 0;
          const ang = Math.atan2(this.vy, this.vx);          // rotation − π/2（aiStyle1 通用姿态）
          const ca = Math.cos(ang), sa = Math.sin(ang);
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const ox = -8 + Math.sin(a) * 2, oy = -Math.cos(a) * 4;   // UnitX·−8 + −UnitY.Rot(a)·(2,4)
            const d = game.spawnDust?.(this.cx, this.cy, 0, 0, 135, 0, 0, 0, null, 1.5, true);
            if (d) {
              d.x = this.cx + ox * ca - oy * sa;
              d.y = this.cy + ox * sa + oy * ca;
              d.vx = this.vx * 0.66;
              d.vy = this.vy * 0.66;
            }
          }
        }
      }
    }
    // AI_001 尾 ±16 钳（:58736-58752）：flag7 = type != 577，全体 aiStyle 1 弹每
    // update 无条件 vy ≤ 16（vy < −16 仅 flag4=1006，重力分支已对称钳 −maxFall）。
    // 蓝队 R7-8：曾钳在重力门内——grav=0 型（flag3 免重力子弹族等）全程不钳；
    // 出生钳保证 |vy|≤16 且现接 grav=0 型无自增速，实际不可达，但 616 等自带增速型
    // 接入即漏钳，提出门外收口（577 豁免）
    if (this.aiStyleOne && this.projId !== 577 && this.vy > 16) this.vy = 16;
    // ---- 1457 弧线引矢消费（AI_001 尾 :58752-58777——本段在 AI_001 最末，重力/
    //      姿态/±16 钳之后、位移之前；命中侧 phoenixQuivered 见下方命中环）----
    if (this.harpyCharmed && !this.harpyCharmConsumed) {
      // :58756-58758 num253=视距 1600、maxChange=π（一步全转）→
      // FindTargetWithLineOfSight(1600)
      const tgt = this.nearestEnemyWithLos(game, 1600);
      if (tgt) {
        const spH = Math.hypot(this.vx, this.vy);
        const wantH = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
        this.vx = Math.cos(wantH) * spH;                   // :58761 rotateTowards(π) 保速
        this.vy = Math.sin(wantH) * spH;
        if (spH < 1) { this.vx = 0; this.vy = 1; }         // :58762-58765 SafeNormalize(UnitY)
        if (spH < 12) { this.vx *= 1.05; this.vy *= 1.05; }   // :58766-58769 低速自加速
      } else {
        this.harpyCharmConsumed = true;                    // :58772-58776 无目标 → 位停引
      }
    }
    // aiStyle4 荆棘链：UpdatePosition 早退（Projectile.cs:20552）——链段全程静止，
    // 不消费速度位移（"接力推进"= 子段出生在父段前方一格速度处）
    if (!this.thornChain) {
      this.x += this.vx;
      this.y += this.vy;
    }
    // 喵刀弹 502：迪斯科点光（Projectile.cs:22613-22621 (Disco+0.5)/2）+ 拖尾采样
    if (this.projId === 502) {
      const n = 7;   // DoUpdate_AnimateDiscoRGB（Main.cs:19441-19496 六段 ±7/帧）
      switch (this.discoStyle) {
        case 0: this.discoG = Math.min(255, this.discoG + n); if (this.discoG >= 255) this.discoStyle++; break;
        case 1: this.discoR = Math.max(0, this.discoR - n); if (this.discoR <= 0) this.discoStyle++; break;
        case 2: this.discoB = Math.min(255, this.discoB + n); if (this.discoB >= 255) this.discoStyle++; break;
        case 3: this.discoG = Math.max(0, this.discoG - n); if (this.discoG <= 0) this.discoStyle++; break;
        case 4: this.discoR = Math.min(255, this.discoR + n); if (this.discoR >= 255) this.discoStyle++; break;
        default: this.discoB = Math.max(0, this.discoB - n); if (this.discoB <= 0) this.discoStyle = 0; break;
      }
      this.lightRGB = [(0.5 + this.discoR / 255) / 2, (0.5 + this.discoG / 255) / 2, (0.5 + this.discoB / 255) / 2];
      this.meowTrail.push(this.x, this.y);
      if (this.meowTrail.length > 20) this.meowTrail.splice(0, this.meowTrail.length - 20);   // oldPos 10 点
      for (const [k, v] of this.meowHitCd) {
        if (v <= 1) this.meowHitCd.delete(k); else this.meowHitCd.set(k, v - 1);
      }
      for (const [k, v] of this.localImmuneCd) {
        if (v <= 1) this.localImmuneCd.delete(k); else this.localImmuneCd.set(k, v - 1);
      }
    }
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.killNow(game); return; }
    const tileType = world.store.get(tx, ty);
    // 星怒剑线上方穿墙（:22139-22143 越线前 tileCollide=false）与
    // noTileCollide 族（SetDefaults 逐型 325/329/348/350/351…，HandleMovement
    // 整段不跑）——撞块/砍草整段跳过（曾漏 = 月事件弹幕扎进地里被地形吞噬）
    if (tileType !== 0 && !this.noTileCollide && !(this.starY !== null && !this.starCollide)) {
      // 可砍物（杂草/瓦罐）：Projectile.CutTiles 语义——原版 CutTiles 是 Damage()
      // 内的旁路副作用（Projectile.cs:11824，在 :15738 Damage 调用链内），不拦截命中
      game.cutTile(tx, ty);
      // 阻挡/消亡判定只看【实心】(Main.tileSolid 语义):树干/火把/平台等非实心格
      // 箭直接穿过,且【继续走下方命中管线】——曾对非实心格整体 return,把该 tick
      // 的 NPC/玩家命中全部跳过:训练假人(378 贴图格与 18×40 命中盒同位,穿过全程
      // 弹心都在 378 格内)子弹零命中穿体而过;草丛/树冠内的弹幕同样漏判。
      // 原版 HandleMovement 只在实心格 Kill(:16132),Damage 在其后独立运行(:15738)
      if (world.store.isSolid(tx, ty)) {
        // 钉 514 撞块（HandleMovement aiStyle 93 支 :18931-18941）：不消亡——
        // ai[1]=0/ai[0]=1 + tileCollide=false + position+=velocity + 速度 =
        // lastVelocity 归一×3 弹开（AI 侧 ×0.6/t 衰减、90t 消亡）
        if (this.nail93 && this.nailAi0 === 0) {
          this.nailAi1 = 0;
          this.nailAi0 = 1;
          this.noTileCollide = true;
          this.x += this.vx;
          this.y += this.vy;
          const nl = Math.hypot(this.vx, this.vy) || 1;
          this.vx = (this.vx / nl) * 3;
          this.vy = (this.vy / nl) * 3;
          return;
        }
        // 信号枪族贴壁（HandleMovement aiStyle 33 支 :18731-18745）：不消亡不反弹
        // ——position += lastVelocity（原版湿弹 /2；本仓 wet 未建模恒全速）再嵌入
        // 一步 + velocity 归零 + localAI[0]=1；此后 AI 侧 damage=0 停驻、块被挖/
        // 脱块即恢复下坠（localAI[1]=30 立即续坠 :27480-27483）
        if (this.flare) {
          if (this.flareStuck === 0) {
            this.x += this.vx;
            this.y += this.vy;
            this.vx = 0;
            this.vy = 0;
            this.flareStuck = 1;
          }
          return;
        }
        // aiStyle 14 弹跳弹（希腊火 326-328 / 装饰球 346）：撞块法向反弹不消亡
        if (this.bounce && this.bounceOff(game)) return;
        // 1457 宝石法珠 CanBounce（HandleMovement :18112-18150）：撞块法向反弹 ×0.8 +
        // penetrate--（归零消亡）——琥珀法珠/琥珀长袍臂。hitWall 族旗是 moveAndCollide
        // 分轴碰撞语义、本类裸位移不置位（曾据此判死=分支永假,反弹死代码）——
        // 到达本分支即已撞实心,按速度主轴定反射面:|vx|>|vy| 水平撞壁反 vx,否则反 vy
        if (this.gem?.canBounce) {
          if (Math.abs(this.vx) > Math.abs(this.vy)) this.vx = -this.vx * 0.8;
          else this.vy = -this.vy * 0.8;
          if (this.pierce > 0 && --this.pierce <= 0) { this.killNow(game); return; }
          return;
        }
        // 喵刀弹 502（AI_008 弹跳档 :18165-18206）：tink 音 + ai[0] 计数 ≥5 消亡；
        // 全速翻面（无 ×0.9 衰减——type 15 才有 ×0.8），同 hitSet 语义无
        if (this.projId === 502 && this.meowBounceOff(game)) return;
        // 荆棘球 277 专属档（Projectile.cs:18306-18314）：vx 恒反 ×0.9；
        // 仅入撞 |vy|>3 竖弹 ×0.9（贴地滚动）
        if (this.thornBounce && this.thornBounceOff(game)) return;
        // 1021 月总巨砾弹地档（Projectile.cs:17578-17600）：Y 撞 Dig 音+×−0.9
        // 反弹 / X 撞 ×−0.75 计 3 次超次消亡（false 交还下方消亡口）
        if (this.mlBoulder && this.boulderBounceOff(game)) return;
        // 225 叶绿箭撞块弹反（HandleMovement type 段 Projectile.cs:17128-17150）：
        // ai[1] 计数（首跳伤 ×0.66 :17131-17134）、第 4 撞 Kill（:17135-17139）、
        // 全速反 lastVelocity + FindTargetWithLineOfSight 归巢（:17140-17150）
        if (this.projId === 225 && this.chloroBounceOff(game)) return;
        // 451 涌流剑撞块（HandleMovement type 段 :18222-18227）：ai[0]=1、ai[1]=0、
        // v = lastVelocity/2 → 走命中后淡出支（ai[0]==1 → alpha 满即 Kill）
        if (this.projId === 451) {
          this.iwAi0 = 1;
          this.iwAi1 = 0;
          this.vx *= 0.5;
          this.vy *= 0.5;
          return;
        }
        // ★R28 §1 294 暗影束无限墙反弹（HandleMovement :18976-18984：速度分量
        // 全速反号、penetrate −1 不因撞块死）+ 编排束铺撒（上一锚点→当前位置,
        // Spawn_Shadowbeam :1987-2005 步距 max(4,|v|)×3 枚 d173）后重锚。
        // ★原版按 TileCollision 分轴反射;本仓单点碰撞无轴信息,按速度主轴反射（登记）
        if (this.projId === 294) {
          if (Math.abs(this.vx) > Math.abs(this.vy)) this.vx = -this.vx;
          else this.vy = -this.vy;
          if (this.sbL0 > 9 && (this.sbAx > 0 || this.sbAy > 0)) {
            this.shadowbeamSegment(game);
            game.broadcastParticleOrchestra?.(Arrow.SHADOWBEAM_ORCHESTRA_IDX, this.cx, this.cy,
              this.sbAx, this.sbAy, Math.round(Math.hypot(this.vx, this.vy) * 1000));
          }
          this.sbAx = this.cx; this.sbAy = this.cy;
          return;
        }
        // 实心块：1/3 概率回收掉落（原版箭 Kill 的掉落），然后消失
        // ★R29：子弹撞块 HitTiles 近似（Kill :77624-77625 族——Collision.HitTiles 在
        // 弹盒覆盖格撒 3-5 粒砖色尘;本仓以 4×d7 通用碎屑近似,音在 Game.onProjectileDeath
        // BULLET_KILL_SFX 分支）
        if (BULLET_KILL_SFX.has(this.projId)) {
          for (let i = 0; i < 4; i++) game.spawnDust?.(this.x - 2, this.y - 2, this.w + 4, this.h + 4, 7);
        }
        if (this.dropKey && Math.random() < 1 / 3) game.spawnDrop(this.x, this.y, this.dropKey, 1);
        this.killNow(game);
        return;
      }
    }
    // 敌对弹命中玩家（原版 Projectile.Damage_EVP :13706-13830）：不消耗弹体，
    // Player.damage 自带 iframes 去重（= 原版 player.immune 门禁）；
    // 实际造成伤害才走 StatusPlayer 的 debuff 授予（:13798-13800；
    // 276 毒种子的中毒授予在 statusPlayer case 276）
    if (this.hostile && hitPlayer(this, game, this.damage)) statusPlayer(game, this.projId);
    // 敌对弹命中城镇 NPC(原版 flag2 分支:hostile && victim.friendly,Projectile.cs:11975-11976);
    // 不消耗弹体(原版该分支不动 keepIterating)
    if (this.hostile) hitTownNpcs(this, game, this.damage, 0, 'hostile');
    // 友方弹 → 城镇 NPC 窄门（Damage_PVE_Inner flag :11970-11972：臭鸡蛋 318
    // 无条件 / 向导 22·裁缝 54 巫毒装备——任意玩家弹（弓/投掷蛋等）可走此门，
    // 2026-08-18 补；命中不消耗穿透语义（TownNPC.hurt 8t iframes 自去重））
    else if (!this.reflected && hitTownNpcs(this, game, this.damage, 0, 'playerProj', this.projId)) {
      if (this.projId === 318) { this.killNow(game); return; }   // 臭蛋砸 NPC 即碎（penetrate 1）
    }
    // 反射后的弹体 friendly 已翻（原版 Damage NPC 需 friendly 门禁，小动物也是 NPC）
    // ——不再伤小动物/敌怪，只走上方 hitPlayer 回打发射者
    if (this.reflected) return;
    // 小动物:一击致死并消耗弹体(原版小动物是 NPC;近战挥砍同语义)
    if (hitCritters(this, game)) { this.killNow(game); return; }
    // 敌对弹不入敌怪判定（原版 Damage_PVE_Inner :11902-11905 `hostile && flag2`
    // 门：hostile 弹对非 friendly NPC 整段 return——Boss 自射弹幕不会误伤/消耗在
    // 自家部件上（月总 454 附手随行 30t 若走此环会在手心爆掉）；城镇 NPC 侧已在
    // 上方 hitTownNpcs('hostile') 走"敌方弹恒命中"档，反射弹也已在上方拦截）
    if (this.hostile) return;
    // 307 腐化者小吞噬者 friendly 门（SetDefaults 无 friendly :3986-3995；锁定敌怪
    // 瞬间 friendly=true :27789-27792）——锁定前穿过敌怪不结算（原版非 friendly
    // 弹 Damage_PVE 整段不进）
    if (this.projId === 307 && !this.friendly307) return;
    // 451 涌流剑可伤门（Damage_CanDealDamage :12463）：淡出态 [1,1+pen) 恒豁免、
    // 末段前 5 拍（ai[1]<5）豁免——淡出/瞬移期穿过敌怪不结算
    if (this.projId === 451 && !this.iwCanDamage()) return;
    // 命中敌人（原版 penetrate：箭 1 射中即停；手里剑 4 穿 4 敌，同敌免疫防连击）
    // 飞龙剑气 684 命中盒 = 垂直线 ±40px 厚 16（CanHitWithOwnBody :14693-14701，
    // 非通用 16×16 盒——巨剑气横扫判定）
    const dragonLine = this.projId === 684;
    const dSpd = Math.hypot(this.vx, this.vy) || 1;
    const dPerpX = dragonLine ? -this.vy / dSpd : 0;
    const dPerpY = dragonLine ? this.vx / dSpd : 0;
    // ---- 钉 514（aiStyle 93）命中专管：刺入/弹开态不入通用管线（DoT 已在 AI 侧
    //      隔拍直投）；飞行态首中即刺入（Damage aiStyle93 段 :13368-13376——
    //      ai[1]=0、ai[0]=-敌-1、velocity=敌心-弹心；伤全额、immune[owner]=1 档
    //      :14060-14062 不耗穿透不入 hitSet）----
    if (this.nail93 && this.nailAi0 !== 0) return;
    if (this.nail93 && this.nailAi0 === 0) {
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; cx: number; cy: number; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean };
        if (e.dead) continue;
        if (!playerCanHitEnemy(e, game, this.projId)) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        if (((e as unknown as { iframes?: number }).iframes ?? 0) > 0) continue;   // immune[owner] 门
        const critN = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
        const dN = Math.max(1, Math.trunc(this.damage)) * (critN ? 2 : 1);
        e.hurt(dN, 0, 0, game, this.settlePen, critN, 1, true);   // 音/飘值=StrikeNPC 单点
        this.nailAi0 = -(e.id + 1);            // :13372-13373 ai[0] = -victimIndex-1
        this.nailAi1 = 0;                      // :13370 ai[1] = 0
        this.vx = e.cx - this.cx;              // :13374 velocity = targetNPC.Center - Center
        this.vy = e.cy - this.cy;
        this.noTileCollide = true;             // :33450 刺入态 tileCollide=false
        return;
      }
    } else {
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
      if (e.dead) continue;
      if (!playerCanHitEnemy(e, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892/CanBeChasedBy :91070——睡渔夫 376 等友好 NPC 玩家武器无效/不追踪）
      const foxInf = dragonLine ? 0 : this.foxHitInflate();
      // 1457 宝石法珠 Colliding 重载（Projectile.cs:15443-15476，type 121/122/123/
      // 124/597/125/126 专属）三段（蓝队 R2-02 补）：
      //  ② BiggerHitbox：主命中盒 Inflate(30)
      //  ③ 末尾 return Collision.CanHit(Center→targetRect.Center)——视线门对全部
      //     宝石弹生效（隔墙不可命中）
      //  ① FastThenSlow：oldPos[1..5] 逐帧拖尾盒各测相交+CanHit(旧盒→敌盒)
      //    （宝石弹 TrailingMode=2 有 oldPos 记录——×5 出速 40px/t 单帧位移大，
      //    无拖尾盒会从薄目标两帧之间漏过）
      const gem = !dragonLine ? this.gem : undefined;
      const gemInf = gem?.biggerHitbox ? 30 : 0;
      const hitInf = foxInf + gemInf;
      // 614 星尘细胞弹目标盒收缩（Colliding :15823-15826）：targetRect.Inflate(−w/8,−h/8)
      //（>8×8 才缩——细胞弹只咬目标核心,贴大敌盒边缘擦过不算;蓝队 R7-19 顺带项）
      const tShrink614 = this.projId === 614 && e.w > 8 && e.h > 8;
      const ex614 = tShrink614 ? e.x + e.w / 8 : e.x;
      const ey614 = tShrink614 ? e.y + e.h / 8 : e.y;
      const ew614 = tShrink614 ? e.w - (e.w / 8) * 2 : e.w;
      const eh614 = tShrink614 ? e.h - (e.h / 8) * 2 : e.h;
      let hitBox = !dragonLine
        ? (this.x - hitInf < ex614 + ew614 && this.x + this.w + hitInf > ex614
          && this.y - hitInf < ey614 + eh614 && this.y + this.h + hitInf > ey614)
        : (() => {
          for (let k2 = -40; k2 <= 40; k2 += 16) {
            const bx = this.cx + dPerpX * k2 - 8, by = this.cy + dPerpY * k2 - 8;
            if (bx < e.x + e.w && bx + 16 > e.x && by < e.y + e.h && by + 16 > e.y) return true;
          }
          return false;
        })();
      if (gem && hitBox) {
        // ③ 视线门：CanHit(弹心,0,0, 敌盒心,0,0)
        if (!canHitLine(game.world.store, this.cx, this.cy, 0, 0,
          e.x + e.w / 2, e.y + e.h / 2, 0, 0)) hitBox = false;
      }
      if (gem && !hitBox && gem.fastThenSlow) {
        // ① 拖尾扫掠：oldPos[1..5]（本仓 gemTrail 每 tick 记录出生位置，1=上一 tick）
        const stG = game.world.store;
        for (let ti = 1; ti <= 5; ti++) {
          const ox = this.gemTrail[ti * 2], oy = this.gemTrail[ti * 2 + 1];
          if (ox === undefined) break;                      // oldPos==Zero → break（:15457）
          const tx = ox - hitInf, ty = oy - hitInf;
          const tw = this.w + hitInf * 2, th = this.h + hitInf * 2;
          if (tx < e.x + e.w && tx + tw > e.x && ty < e.y + e.h && ty + th > e.y
            && canHitLine(stG, tx, ty, tw, th, e.x, e.y, e.w, e.h)) {
            hitBox = true;
            break;
          }
        }
      }
      if (hitBox) {
        // 反射源（419 旋刃冲刺等 reflectsProjectiles 置标）：命中前先走反射
        // （原版 Projectile.cs:12050-12060，反射即终止本帧命中迭代 keepIterating=false）
        if (tryReflectProjectile(this, this.projId, e, game)) {
          this.pierce = 1;            // 原版 penetrate=1（NPC.cs:67058）
          this.pierceInit = 1;        // 反射后按单发弹语义（命中不设敌方帧）
          this.hitSet.clear();        // 转敌对后命中表作废
          return;
        }
        // 出生预置局部免疫（localNPCImmunity[target]=N 窗口内不得命中该敌——
        // Damage_PVE flag2 `usesLocalNPCImmunity && array[i] == 0` :11858 同式；
        // 花瓣 1038 = 30t，过期后照常走下方分支）
        if ((this.spawnImmuneCd.get(e.id) ?? 0) > 0) continue;
        // 376 小鬼火球 / 604 孢子云 IDStatic 共享免疫（usesIDStaticNPCImmunity——
        // 全场同型一张表,多弹齐射不叠伤;蓝队 R7-24 曾走逐弹 hitSet）。
        // ★R28：511-513 毒云 UseGroupStaticImmunity(511) 同机制——三型共用键 511
        // （immunityIdentity :10686,idStaticNPCHitCooldown=10t）
        if ((this.projId === 376 || this.projId === 604)
          && !idStaticCheck(this.projId, e.id, this.projId === 376 ? 100 : 167)) continue;
        if (this.idStaticGroup !== null
          && !idStaticCheck(this.idStaticGroup, e.id, this.idStaticCdMs)) continue;
        // 502 喵刀弹：localNPCHitCooldown=10t 同敌再命中（穿透弹 hitSet 是永久免疫，
        // 502 是"同一敌 10t 冷却后可再咬"——SetDefaults :5466-5468）
        if (this.projId === 502) {
          const cd = this.meowHitCd.get(e.id) ?? 0;
          if (cd > 0) continue;
          this.meowHitCd.set(e.id, 10);
        } else if (this.localImmune > 0) {
          // 1457: 通用局部免疫（usesLocalNPCImmunity+localNPCHitCooldown=N，数据列驱动）
          const cd = this.localImmuneCd.get(e.id) ?? 0;
          if (cd > 0) continue;
          this.localImmuneCd.set(e.id, this.localImmune);
        } else {
          // 全局 immune[owner] 门（Damage_PVE_Inner :11905）：敌怪 iframes 内不命中、
          // 不耗穿透（曾缺 = 穿透弹穿过刚被别弹打中的敌白耗穿透数；piranhaStep
          // :1744 同门先例）。pierceInit 1 = 单发弹 flag3 豁免（Enemy.hurt :11457 同门）
          if (this.pierceInit !== 1 && ((e as { iframes?: number }).iframes ?? 0) > 0) continue;
          // 穿透弹同敌不重复命中；无限穿透（penetrate −1：小丑箭 5/地狱火箭 41，
          // 无 usesLocalNPCImmunity）不入 hitSet——iframes 过期即可再命中（修复1）
          if (this.pierceInit >= 0 && this.hitSet.has(e.id)) continue;
        }
        // ★鞭 tag（WhipTagEffect.CanRunHitEffects :73-84：MinionShot/SentryShot 弹幕吃
        //   tag——随从/哨兵射出的箭 whipTagShot 置标时走 resolveWhipTagHit 统一结算：
        //   ModifyTaggedHit tag 加伤+TagCrit 暴击（WhipTagEffect.cs:58-70）、OnTaggedHit
        //   （黑收成 916）、proc 窗口首跳（TagEffectState.cs:216-243）。随从弹无基础
        //   暴击（原版 summon 系 crit 仅来自 TagCrit）——4% 基础暴击只留给玩家远程弹）
        let dmg = this.damage;
        // ★R27：876 zapinator 命中侧随机化（Damage_PVE :12691-12777，每次命中掷一遍、
        //  掷序敏感——瞬移→回退→变速→改伤）。"打出去发生什么谁也不知道"即本武器全部卖点
        if (this.projId === 876) this.zapinatorHitChaos(game);
        // 985 泰拉刃光束（Damage_PVE_Inner :12700-12703 `case 985: damage *= 0.75`）：
        // 每次命中伤害 ×0.75（(int) 截断；在暴击翻倍前——原版 switch 先于 StrikeNPC）
        if (this.projId === 985) dmg = Math.max(1, Math.trunc(dmg * 0.75));
        // 710 空中祸害空旷加伤（Damage() :12236-12239）：命中点下方 12 格内无实心
        // → num12 ×1.5（(int) 截断；暴击翻倍前——原版在 DamageVar 之后、crit 倍率之前）
        if (this.projId === 710 && this.skyOpen12(game)) dmg = Math.trunc(dmg * 1.5);
        // 981 银弹对狼人 ×3（Damage_PVE_Inner :12594-12597 `type==981 &&
        // targetNPC.type==104 → num12 *= 3`；NPCID 104 = Werewolf 狼人（满月夜
        // hard 地表怪，本仓 VanillaSpawner L4533 已生成）——暴击翻倍前同槽位。
        // ★审计原文"蚀地怪 Eater of Segments"系误记：1456 反编译 NPCID.cs:11273
        //   `public const short Werewolf = 104`，银弹克狼人是 1.4.5 主题机制）
        if (this.projId === 981 && (e as { vanillaId?: number | null }).vanillaId === 104) dmg *= 3;
        let crit: boolean;
        if (this.whipTagShot) {
          const en2 = e as unknown as import('./WhipTag').WhipTagged;
          // 黑收成 OnTaggedHit 直伤通道（916 等价：额外一跳落在被命中敌上）
          en2.hurtFx = (d: number) => { e.hurt(d, Math.sign(this.vx) * 2, -2, game, 0, false, 0, true); };   // 鞭 tag 直伤=DPS 计
          const res = resolveWhipTagHit(en2, dmg, game,
            (el) => (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(el, 'projectiles'),
            SUMMON_TAG_MUL[this.projId] ?? 1, e.x + e.w / 2, e.y + e.h / 2);
          dmg = res.dmg;
          crit = res.crit;
        } else {
          // 暴击：基 4% + spawn 注入的系暴击/item.crit（P:2300-2304/P:25230-25232）
          crit = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
          if (crit) dmg *= 2;
        }
        if (this.ignite) {
          const en3 = e as unknown as { onFireT?: number };
          en3.onFireT = Math.max(en3.onFireT ?? 0, 5); // AddBuff(24,300)=5s
        }
        if (this.igniteHellfire) {
          const en4 = e as unknown as { onFire3T?: number };
          en4.onFire3T = Math.max(en4.onFire3T ?? 0, 5 + Math.random() * 5); // AddBuff(323,Next(300,600))=5-10s
        }
        // 1457 凤凰箭袋 6181 引矢标记（StatusNPC :11178-11182：aiStyle1 +
        // PhoenixQuivered 位 → AddBuff(323, 300) = Hellfire 定值 5s，无掷幅）
        if (this.phoenixQuivered) {
          const en4b = e as unknown as { onFire3T?: number };
          en4b.onFire3T = Math.max(en4b.onFire3T ?? 0, 5);
        }
        // 命中 debuff（StatusNPC:10555 表驱动——火枪弹 2 33% OnFire 180t 等,按型号掷骰）
        // 614 传 ai1TargetId：表内 183 条目带 gate 'ai1==i'（:11381-11383 只上绑定目标）
        // ★1458：催化指环 ctx 接通（StatusNPC :11192-11196 `!npcProj && catalystBand`
        //  → 398 300t 任意命中）——本仓 1457 箭命中路径漏传 ctx（旗聚合零消费）,
        //  借 1458 门补齐；!npcProj=仅玩家弹（敌箭不走本敌伤路径,天然满足）
        applyProjStatus(this.projId, e as unknown as Record<string, number>,
          this.projId === 614 ? { ai1TargetId: this.stickerTgt }
            : { catalystBand: ((game.player as unknown as { equipStats?: { catalystBand?: boolean } } | null)?.equipStats?.catalystBand) === true });
        // ★1458 毒刺 6165/6184/6185（StatusNPC :11182-11191,1458 加 !npcProj 门）：
        // 玩家箭体命中 100% Poisoned(20) 90t=1.5s——本仓 1457 漏接（equipStats 旗
        // 聚合于 Player.ts:1234-1259 但零消费）,借 1458 修复补齐
        if (VANILLA_ARROW_PROJS.has(this.projId)
          && ((game.player as unknown as { equipStats?: { accPoisonBarb?: boolean } } | null)?.equipStats?.accPoisonBarb)) {
          (e as unknown as { poisonT?: number }).poisonT =
            Math.max((e as unknown as { poisonT?: number }).poisonT ?? 0, 1.5);
        }
        // 信号枪族点燃（StatusNPC :11687-11696：163/310/1008/1010/1011 →
        //   OnFire(24) Next(3)==0?600:300t = 10s/5s；1009 诅咒信号弹 →
        //   Cursed Inferno(39) 600t=10s（:11702-11705））
        if (this.projId === 1009) {
          (e as unknown as { cursedT?: number }).cursedT =
            Math.max((e as unknown as { cursedT?: number }).cursedT ?? 0, 10);
        } else if (FLARE_PROJS.has(this.projId)) {
          const en5 = e as unknown as { onFireT?: number };
          en5.onFireT = Math.max(en5.onFireT ?? 0, Math.random() < 1 / 3 ? 10 : 5);
        }
        if (this.betsyCurse) {
          // Betsy's Curse 203（type 711 命中 AddBuff(203,600) :10719-10721）——
          // 原版无"每层 -10 防"堆叠档：betsysCurse flag（NPC.cs:93287-93289）只是
          // checkArmorPenetration 池内 +40（:81922-81924），Enemy.hurt buffPen 直读
          // betsysCurseT 即 1:1（2026-08-14 考古销项，旧注释的"层"描述非原版）
          const rec = e as unknown as Record<string, number>;
          rec.betsysCurseT = Math.max(rec.betsysCurseT ?? 0, 600);
        }
        // 冰霜盔甲引擎(ranged 门,:93712;魔法/召唤弹 frostEligible=false)
        if (this.frostEligible) {
          applyFrostBurn((game.player as unknown as { equipStats: { frostBurn: boolean } }).equipStats.frostBurn,
            e as unknown as Record<string, number>);
        }
        if (this.nebulaCb) this.nebulaCb(); // 星云 booster（:12892-12905，伤害>0 门已过）
        // 拍击石 6167 kind0 远程脉冲（Damage_PVE_Inner :13443-13446 `(ranged &
        // ownedBySomeone) && accSnappingStone → TryMakingSnappingStoneStrike(…,0)`）：
        // 门 = 玩家弹（!hostile ≈ ownedBySomeone,本仓同 :1019 owner==myPlayer 近似）
        // + 型号 ranged 位（projectileData 表,1121 脉冲弹自身也 ranged——360t 共用冷却
        // 在 trySnapStrike 内先置,不递归；随从/哨兵弹 668/680/1120 等无 ranged 位自然
        // 排除,与原版同门）+ 6167 在身。30×远程伤/120px/2 目标弹 1121
        if (!this.hostile
          && (projectileData(this.projId)?.ranged ?? false)
          && (game.player as unknown as { equipStats?: { accSnappingStone?: boolean } })
            ?.equipStats?.accSnappingStone) {
          trySnapStrike(game, game.player, 0, e.x + e.w / 2, e.y + e.h / 2, e.id,
            { w: e.w, h: e.h, cx: e.x + e.w / 2, cy: e.y + e.h / 2 });   // R4-33 victim 自脉冲
        }
        // ★1457 GetDamageMultiplier 乘区已上移到发射侧（Player.cs:49813-49814
        //   `(int)((float)Damage * damageMultiplier)` C# 截断，Game.fireGemStaffBolts
        //   消费）——弹幕 damage 字段即终值，命中侧不再乘（蓝队 R2-06：命中侧
        //   Math.round 曾致 SwirlTwins 0.6/ArPenSpread 0.5 档在 x.5 处系统性 +1）
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.settlePen, crit, this.pierceInit, true);   // 音/飘值=StrikeNPC 单点
        // ★R29 幻象弓命中侧补刀（Projectile.cs:13935）：arrow 弹（type≠631）命中且
        // 630 载体在场（phantasmTime>0）→ 从玩家身体随机点补 3 枚 631 追踪矢。
        // 原版门 = projectile.arrow && type != 631 && phantasmTime > 0（本仓以
        // VANILLA_ARROW_PROJS 全集承载 arrow 位）
        if (!this.hostile && this.projId !== 631 && VANILLA_ARROW_PROJS.has(this.projId)) {
          this.spawnPhantasmChase(game, { id: e.id, cx: e.x + e.w / 2, cy: e.y + e.h / 2 });
        }
        if (this.pierceInit >= 0) this.hitSet.add(e.id);   // 无限穿透不入表（iframes 门冷却再命中）
        // 502 喵刀弹命中：无特效音/无计数消亡（全库唯一 PlaySound(37) 在撞块
        // HandleMovement :16797——2026-08-13 实测复核修正：曾误接在命中链）。
        // 命中只消费 penetrate（5 NPC 上限）+ localNPCHitCooldown 同敌冷却
        // ---- 吸血链（Projectile.cs:12877-12892 on-hit 段）----
        // 吸血鬼飞刀 304 → vampireHeal（:12879-12882，!moonLeech 门）；
        // 魔法弹 + 幽灵套 ghostHeal → ghostHeal（:12883-12888，canGhostHeal 全 true
        // 近似——雕像产怪 flag 未实装）。ghostHurt（幽灵伤害头 156）未接，登记。
        // numHits = 含本次的命中数（原版 StrikeNPC 先自增，hitSet.size 此时已含本敌）
        if (this.projId === 304) {
          game.applyLifeSteal?.('vampire', Math.round(dmg), this.hitSet.size, this.x, this.y);
        } else if (projectileData(this.projId)?.magic) {
          game.applyLifeSteal?.('ghost', Math.round(dmg), this.hitSet.size, this.x, this.y, true);
        }
        // 710 空中祸害命中撒裂片（Damage() :13165-13168 → BetsySharpnel :51075-51091，
        // 在 penetrate-- 前）：本体（ai[1]≠-1）每跳撒 5 枚 710 裂片（abShard 标不再链）
        if (this.projId === 710 && !this.abShard) this.spawnBetsyShards(game);
        // 638/639/640 月总箭每跳衰减（Damage() :13221-13224 `damage = (int)(damage×0.96)`）
        // ——原版在 num12 结算后改写 damage 字段 = 本跳全额、下一跳 ×0.96（穿透 4 跳
        // 递弱）；(int) 截断、钳 ≥1
        if (this.projId === 638 || this.projId === 639 || this.projId === 640) {
          this.damage = Math.max(1, Math.trunc(this.damage * 0.96));
        }
        // 穿透递减（−1 = 无限穿透不递减不消亡，修复1）
        if (this.pierce > 0 && --this.pierce <= 0) { this.killNow(game); return; }
        // 451 涌流剑命中钩（Damage :14115-14121）：状态机推进（淡出→瞬移重射）
        if (this.projId === 451) this.iwOnHit();
      }
    }
    }   // 钉 514 命中专管 else 收口
    // 城镇 NPC 受击(原版 Projectile.Damage 对 friendly NPC 同样生效——杀裁缝师
    // 召骷髅王即此链);穿透/销毁语义与敌怪一致
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2)
      && this.pierce > 0 && --this.pierce <= 0) { this.killNow(game); return; }
  }

  /** 1457 :15079-15086（Damage_GetHitbox 1106 狐火分支,仅此 type 挂高速门）:
   *  num2 = (int)Remap(localAI[0],0,72,0,20)（localAI[0]=出膛龄）;velocity.Length()>10
   *  → num2×2+10。本仓 1106 出生 life 24 = 72t 的 3 速等价（MinionProj 出生注释）,
   *  龄 ×3 回 vanilla 刻度 */
  private foxHitInflate(): number {
    if (this.projId !== 1106) return 0;
    const age = Math.min(this.age * 3, 72);
    let n = Math.floor((age / 72) * 20);
    if (Math.hypot(this.vx, this.vy) > 10) n = n * 2 + 10;
    return n;
  }

  /** 225 叶绿箭撞块弹反（HandleMovement type 段 Projectile.cs:17128-17150）：
   *  ai[1] += 1、首跳（==1）伤 ×0.66（:17131-17134）、第 4 撞 Kill（:17135-17139）、
   *  velocity = −lastVelocity（:17140-17141——原版按 TileCollision 改变的轴反，此处
   *  逐轴回退探测等价）+ FindTargetWithLineOfSight()（缺省 800）归巢：瞄准点 =
   *  目标中心上方 nPC.height×Lerp(0.1,0.5,GetLerpValue(0,300,t))（:17146-17148），
   *  保速转向。恒返回 true（消亡走内部 killNow，不落下方通用掉落/消亡口）。 */
  private chloroBounceOff(game: GameHooks): boolean {
    this.arrow225Ai1++;
    if (this.arrow225Ai1 === 1) this.damage = Math.max(1, Math.trunc(this.damage * 0.66));   // :17133
    if (this.arrow225Ai1 >= 4) { this.killNow(game); return true; }                          // :17135-17139
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const t0 = Math.floor(px / TILE), t1 = Math.floor(py / TILE);
      return st.inBounds(t0, t1) && st.isSolid(t0, t1);
    };
    if (this.vx !== 0 && !solidAt(this.x + this.w / 2 - this.vx, this.y + this.h / 2)) this.vx = -this.vx;
    if (this.vy !== 0 && !solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) this.vy = -this.vy;
    const tgt = this.nearestEnemyWithLos(game, 800);
    if (tgt) {
      const t = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
      const lerp = Math.min(1, Math.max(0, t / 300));                 // GetLerpValue(0,300,t)
      const off = tgt.h * (0.1 + 0.4 * lerp);                         // Lerp(h*0.1, h*0.5, ·)
      const dx = tgt.cx - this.cx, dy = (tgt.cy - off) - this.cy;
      const dl = Math.hypot(dx, dy);
      const sp = Math.hypot(this.vx, this.vy);
      if (dl > 0) { this.vx = (dx / dl) * sp; this.vy = (dy / dl) * sp; }
      else { this.vx = 0; this.vy = -sp; }                            // SafeNormalize(-UnitY)
    }
    return true;
  }

  /** 1021 巨砾弹地（Projectile.cs:17578-17600）：Y 被挡 lastVy>4 → HitTiles 尘 +
   *  Dig 音（PlaySound 0）+ vy ×−0.9；缓落（0<lastVy≤4）置 rest 标（localAI[1]=999
   *  → 后续 X 撞直接消亡）；X 被挡 ×−0.75 反弹计 3 次（:17592-17595），超次
   *  Kill（false 交还调用方消亡）。顶棚（lastVy≤0）原版不显式反弹（碰撞解算
   *  归零）——此处对齐 ×−0.9 近似。 */
  private boulderBounceOff(game: GameHooks): boolean {
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const t0 = Math.floor(px / TILE), t1 = Math.floor(py / TILE);
      return st.inBounds(t0, t1) && st.isSolid(t0, t1);
    };
    // Y 轴被挡：回退一步（−vy）脱离实心即成立
    if (this.vy !== 0 && !solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) {
      if (this.vy > 4) {
        game.playSfx('dig', 1, this.cx, this.cy);            // :17583-17584
        game.spawnParticles(this.cx, this.cy + this.h / 2, '#B8A890', 4, 2, { life: 20 });
        this.y -= this.vy;
        this.vy = -this.vy * 0.9;                            // :17585
      } else if (this.vy > 0) {
        this.y -= this.vy;
        this.vy = 0;                                         // 贴地（后续 |vy|≤1 滚动加速段接管）
        this.boulderBounces = 999;                           // :17586-17588 rest 标
      } else {
        this.y -= this.vy;
        this.vy = -this.vy * 0.9;                            // 顶棚近似
      }
    }
    // X 轴被挡：×−0.75 反弹计次，>3 消亡
    if (this.vx !== 0 && !solidAt(this.x + this.w / 2 - this.vx, this.y + this.h / 2)) {
      if (this.boulderBounces <= 3) {
        this.x -= this.vx;
        this.vx = -this.vx * 0.75;                           // :17592-17595
        this.boulderBounces += 1;
      } else {
        return false;                                        // :17596-17599
      }
    }
    // 回退后仍嵌实心（嵌入过深）→ false 消亡
    return !solidAt(this.x + this.w / 2, this.y + this.h / 2);
  }

  /** 荆棘球 277 撞块反弹（Projectile.cs:18306-18314）：vx 恒反 ×0.9；
   *  竖向仅入撞 |vy|>3 才 ×-0.9（否则贴地滚动）。逐轴回退探测，脱困失败 false。 */
  private thornBounceOff(game: GameHooks): boolean {
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const t0 = Math.floor(px / TILE), t1 = Math.floor(py / TILE);
      return st.inBounds(t0, t1) && st.isSolid(t0, t1);
    };
    let bounced = false;
    if (!solidAt(this.x + this.w / 2 - this.vx, this.y + this.h / 2)) {
      this.x -= this.vx;
      this.vx *= -0.9;
      bounced = true;
    }
    // :23389-23399 Y 反弹门 vy>1（曾 >3）;缓慢落地(vy≤1 的下落撞地)才滚动
    // = vy 归零 + 摩擦 ×0.97 + |vx|≤0.01 静止自灭（空中侧撞勿砍 vy——曾
    // `bounced||` 门误伤,review 修）
    if (this.vy > 1 && !solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) {
      this.y -= this.vy;
      this.vy *= -0.9;
      bounced = true;
    } else if (this.vy > 0) {
      this.vy = 0;
      this.vx *= 0.97;
      if (Math.abs(this.vx) <= 0.01) { this.dead = true; }
    }
    return bounced;
  }

  /** aiStyle 14 撞块反弹（Projectile.cs:18314-18327 默认档：法向 ×-0.5，低速归零）。
   *  逐轴回退探测穿透轴并反弹；两轴均无法脱困（嵌入过深）则返回 false 交还消亡。 */
  private bounceOff(game: GameHooks): boolean {
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const t0 = Math.floor(px / TILE), t1 = Math.floor(py / TILE);
      return st.inBounds(t0, t1) && st.isSolid(t0, t1);
    };
    let bounced = false;
    // X 轴：回退一步脱离实心 → 穿透轴是 X，反弹并退回
    if (!solidAt(this.x + this.w / 2 - this.vx, this.y + this.h / 2)) {
      this.x -= this.vx;
      this.vx *= -0.5;
      bounced = true;
    }
    if (!solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) {
      this.y -= this.vy;
      this.vy = this.vy > 1 ? -this.vy * 0.5 : 0;
      bounced = true;
    }
    return bounced;
  }

  /** 喵刀弹 502 撞块档（HandleMovement :16794-16812——type 502 专支，先于
   *  通用 aiStyle-8 tink 链（:18165）命中，故弹跳只喵叫不 tink）：
   *  ai[0]=Clamp(+1,1,5) + PlaySound(37=Meowmere, style 5+ai0)（Item_57/58
   *  随机、音量 ×0.5×style×0.05（style 6-10 → 0.15-0.25）、音高扰动 ±0.4
   *  由双素材近似）；≥5 消亡；全速翻面（与 lastVelocity 逐轴对比后取负）。 */
  private meowBounceOff(game: GameHooks): boolean {
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const t0 = Math.floor(px / TILE), t1 = Math.floor(py / TILE);
      return st.inBounds(t0, t1) && st.isSolid(t0, t1);
    };
    this.meowCount = Math.max(1, Math.min(5, this.meowCount + 1));   // Clamp(:16796)
    const style = 5 + this.meowCount;
    game.playSfxFiles([Math.random() < 0.5 ? 'Item_57' : 'Item_58'],
      0.5 * style * 0.05, this.cx, this.cy);
    if (this.meowCount >= 5) { this.killNow(game); return true; }
    if (!solidAt(this.x + this.w / 2 - this.vx, this.y + this.h / 2)) {
      this.x -= this.vx;
      this.vx = -this.vx;
    }
    if (!solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) {
      this.y -= this.vy;
      this.vy = -this.vy;
    }
    return true;
  }

  // ================= 食人鱼 190（aiStyle 39，Projectile.cs:26065-26315）=================
  // 状态机 1:1：ai[0]=0 直飞咬敌（:26245）/ 1 返回玩家（:26266）；ai[1]=0 未咬可咬 /
  // >0 咬住（Damage_PVE :12447 首咬写入 index+1）/ −1 松手禁再咬（:26095）。
  // 咬住伤害 = 普通 hitbox 接触走 Damage_PVE（:11868-11871 localNPCImmunity 门 +
  // :11905 全局 immune 门），localNPCHitCooldown=14t 同敌周期撕咬（:13157）。

  /** 姿态记录（:26119-26125/:26139-26143/:26252-26287 三处 rotation 赋值：
   *  vx<0 → spriteDirection=−1 + rotation=atan2(−vy,−vx)，等效 draw 的
   *  scale(−1)+rotate(π−ang) 变换——此处只存未镜像角 + 翻转位） */
  private pFace(vx: number, vy: number): void {
    this.pRot = Math.atan2(vy, vx);
    this.pFlip = vx < 0;
  }

  /** 统一消亡出口 + 回收补弹（Kill 语义；在场数 <3 且仍按住 → 补满 3，
   *  Player.cs:42856-42868 ItemCheck num∈(0,3) 置 flag4 → :47768-47786 生成 3−num 条） */
  private piranhaKill(game: GameHooks): void {
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
    if (this.piranha?.channel()) this.pTopUp(game);
  }

  /** 回收补弹（ItemCheck_Shoot 1156 专支 Player.cs:47768-47786：生成
   *  3−在场数 条；速度分量各 +Next(−40,41)×0.05 扰动；出生点=玩家枪口。
   *  无重播 UseSound——原版 channel 期 itemTime 恒被 SetDummyItemTime(5) 顶住，
   *  无第二次 use 起手声） */
  private pTopUp(game: GameHooks): void {
    const p = game.player as { cx: number; cy: number } | null;
    const ents = (game as unknown as {
      entities?: { projectiles?: unknown[]; add?: (e: unknown, b: string) => void };
    }).entities;
    if (!p || !ents?.add) return;
    const alive = (ents.projectiles ?? []).filter(
      (o) => (o as { projId?: number }).projId === PIRANHA_PROJ && !(o as { dead?: boolean }).dead).length;
    const aim = this.piranha!.aim();
    const a = Math.atan2(aim.y - p.cy, aim.x - p.cx);
    for (let i = 0; i < 3 - alive; i++) {
      const np = new Arrow(p.cx + Math.cos(a) * 14, p.cy - 4 + Math.sin(a) * 14,
        Math.cos(a) * this.pShootSpeed + (Math.floor(Math.random() * 81) - 40) * 0.05,
        Math.sin(a) * this.pShootSpeed + (Math.floor(Math.random() * 81) - 40) * 0.05,
        this.damage, this.knockback, PIRANHA_PROJ, null,
        { grav: 0, life: PIRANHA_LIFE, piranha: this.piranha! });
      np.critChance = this.critChance;
      np.critBonus = this.critBonus;
      np.armorPen = this.armorPen;
      np.frostEligible = this.frostEligible;
      np.pShootSpeed = this.pShootSpeed;
      ents.add(np, 'projectiles');
    }
  }

  /** 荆棘链段状态机（aiStyle 4，Projectile.cs:23943-24080 逐行；红队 R27 §10/§11）。
   *  ★UpdatePosition 对 aiStyle==4 整体早退（:20552）= 链段全程【静止】——"逐节接力"
   *  是每段出生在父段前方一格速度处（position+velocity+halfSize）的视觉推进，
   *  非弹体位移。返回前已置 dead 时由调用方收口。 */
  private thornStep(game: GameHooks): void {
    const nettle = this.projId >= 150 && this.projId <= 152;
    // 出生音 Item8（localAI[0]==0 && ai[1]==0 门 :23945-23954——仅武器首发段播,
    // 链生段 ai[1]>=2 静默；494→Item101 档无武器可达不接）
    if (!this.thornBornSounded) {
      this.thornBornSounded = true;
      if (this.thornAi1 === 0) game.playSfxFiles?.(['Item_8'], 1, this.cx, this.cy);
    }
    if (this.thornAi0 === 0) {
      // 渐显期（:23956-24032）
      // 150 族出生翻转（ai[1]==0 && alpha==255 && rand(2)==0 → type++ :23958-23962）
      if (nettle && this.thornAi1 === 0 && this.alpha === 255 && Math.floor(Math.random() * 2) === 0) {
        this.projId++;
      }
      this.alpha -= 50;                    // :23963
      if (nettle) this.alpha -= 25;        // :23964-23967（净步长 −75）
      if (this.alpha > 0) return;          // 渐显期不动（UpdatePosition 早退）
      this.alpha = 0;
      this.thornAi0 = 1;
      if (this.thornAi1 === 0) {           // :23978-23982（仅首发段补一步位移）
        this.thornAi1++;
        this.x += this.vx;
        this.y += this.vy;
      }
      // 链生子段（owner==myPlayer 门 :23983/:24012——本仓以 !hostile 近似,敌侧不生成）
      if (this.hostile) return;
      const ents = (game as unknown as {
        entities?: { add?: (e: unknown, b: string) => void };
      }).entities;
      if (!ents?.add) return;
      let childType = this.projId;
      if (this.projId === 7) {                       // :23985-23989（ai[1]>=6 升尾刺 8）
        if (this.thornAi1 >= 6) childType = 8;
      } else if (this.projId === 150 || this.projId === 151) {   // :24014-24026
        childType = this.projId === 150 ? 151 : 150;            // 150↔151 每节翻转
        if (this.thornAi1 >= 10 && this.projId === 151) childType = 152;   // 尾端
      } else {
        return;                                   // 8/152 尾端不再链生
      }
      const child = new Arrow(this.x + this.vx + this.w / 2, this.y + this.vy + this.h / 2,
        this.vx, this.vy, this.damage, this.knockback, childType, null,
        { thornChainAi1: this.thornAi1 + 1 });
      child.critChance = this.critChance;
      child.critBonus = this.critBonus;
      child.armorPen = this.armorPen;
      ents.add(child, 'projectiles');
      return;
    }
    // 淡出期（:24034-24080）
    // 穿 170 尘爆（门字面 = alpha < 170 && alpha+5 >= 170 :24034——nettle 步长 3 但门仍 +5）
    if (this.alpha < 170 && this.alpha + 5 >= 170) {
      if (nettle) {
        for (let i = 0; i < 8; i++) {            // :24038-24044 d7 ×8
          const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 7,
            this.vx * 0.025, this.vy * 0.025, 200, null, 1.3, true);
          if (d) { d.vx *= 0.5; d.vy *= 0.5; }
        }
      } else {
        for (let i = 0; i < 3; i++) {            // :24058-24061 d18 ×3 + d14 ×1
          game.spawnDust?.(this.x, this.y, this.w, this.h, 18,
            this.vx * 0.025, this.vy * 0.025, 170);
        }
        game.spawnDust?.(this.x, this.y, this.w, this.h, 14, 0, 0, 170, null, 1.1);
      }
    }
    this.alpha += nettle ? 3 : 5;                // :24065-24076
    if (this.alpha >= 255) this.killNow(game);   // :24077-24080（无声无尘自然消亡）
  }

  private piranhaStep(game: GameHooks): void {
    // Update :15329 DecrementLocalImmuneTimeCounters——localNPCImmunity 逐帧递减
    for (const [k, v] of this.pHitCd) {
      if (v <= 1) this.pHitCd.delete(k); else this.pHitCd.set(k, v - 1);
    }
    if (--this.life < 0) { this.piranhaKill(game); return; }   // R7-5：AI 恰跑 timeLeft 次（食人鱼无 Kill 链,杀拍差一子步无观察面,备案）
    this.age++;
    // 淡入（:26067-26071）
    this.pAlpha = Math.max(0, this.pAlpha - 50);
    const p = game.player as { cx: number; cy: number; vx?: number; vy?: number; dead?: boolean; facing?: number } | null;
    // :26072-26077 玩家失活/死亡/离主 >2000 → Kill
    if (!p || p.dead) { this.piranhaKill(game); return; }
    const dxp = p.cx - this.cx, dyp = p.cy - this.cy;
    const dp = Math.hypot(dxp, dyp);
    if (dp > 2000) { this.piranhaKill(game); return; }
    // :26078-26087 淡入完成后每帧面向食人鱼（SetDummyItemTime 持物锁未接，登记 GAP）
    if (this.pAlpha === 0 && p.facing !== undefined) p.facing = this.cx > p.cx ? 1 : -1;
    // :26093-26096 松手（淡入完成后才生效）：返回 + ai[1]=−1 禁再咬
    if (this.pAlpha === 0 && !this.piranha!.channel()) {
      this.pAi0 = 1; this.pAi1 = -1; this.pTarget = null;
    }
    // :26098-26102 咬住超距（离主 >1500）脱咬转返回（ai[1]=0 仍可再咬）
    if (this.pAi1 > 0 && dp > 1500) { this.pAi1 = 0; this.pAi0 = 1; this.pTarget = null; }
    let tileCollide = true;
    if (this.pAi1 > 0) {
      tileCollide = false;                                   // :26105
      const t = this.pTarget;
      if (t && !t.dead && t.hp > 0) {                        // :26107 目标存活
        const speed = 16;                                    // :26109 num313 咬敌速
        const dx = t.cx - this.cx, dy = t.cy - this.cy;
        const d = Math.hypot(dx, dy);
        if (d < speed) {
          this.vx = dx; this.vy = dy;                        // :26116-26117 残差直抵
          if (d > speed / 3) {
            this.pFace(this.vx, this.vy);                    // :26119-26125 朝目标
            this.vx = 0; this.vy = 0;                        // :26126-26129 type 190 咬定
          }
        } else {
          const dd = d === 0 ? 0.0001 : d;                   // :26132-26136
          this.vx = dx / dd * speed; this.vy = dy / dd * speed;
          this.pFace(this.vx, this.vy);                      // :26138-26143
        }
        this.x += t.vx; this.y += t.vy;                      // :26159-26161 跟随目标速度
        // :26162-26178 同主多弹排斥（<8px 逐轴 ∓4——多鱼咬同一大体型怪时散开）
        const sibs = (game as unknown as {
          entities?: { projectiles?: Array<{ projId?: number; dead?: boolean; x?: number; y?: number; cx?: number; cy?: number }> };
        }).entities?.projectiles;
        if (sibs) {
          for (const o of sibs) {
            if (o === this || o.projId !== PIRANHA_PROJ || o.dead) continue;
            if (Math.hypot((o.cx ?? 0) - this.cx, (o.cy ?? 0) - this.cy) >= 8) continue;
            if (this.x < (o.x ?? 0)) this.vx -= 4; else this.vx += 4;
            if (this.y < (o.y ?? 0)) this.vy -= 4; else this.vy += 4;
          }
        }
        this.pAi0 = 1;                                       // :26184-26188 咬住期恒置 1
      } else {
        // :26190-26196 目标死亡 → 清咬
        this.pAi1 = 0; this.pTarget = null;
        // :26197-26223 半径 3000 内视线可达最近敌（CanBeChasedBy :91070 近似 =
        //  存活/未无敌/可受伤；Manhattan 度量 num322）
        let best: PiranhaTarget | null = null;
        let bestScore = 3000;                                // :26205 num319
        let bx = 0, by = 0;
        for (const ent of game.enemies()) {
          const e = ent as unknown as PiranhaTarget;
          if (e.dead || e.hp <= 0 || e.dontTakeDamage) continue;
          if (!playerCanHitEnemy(e, game, this.projId)) continue;   // friendly 门（CanBeChasedBy :91070——睡渔夫 376 等友好 NPC 不入索敌）
          const score = Math.abs(this.cx - e.cx) + Math.abs(this.cy - e.cy);
          if (score >= bestScore) continue;
          if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
          bestScore = score; best = e; bx = e.cx; by = e.cy;
        }
        if (best) {
          // :26223-26241 转咬新目标（立即入咬住态，速度 16 直指）
          const dd = Math.hypot(bx - this.cx, by - this.cy) || 0.0001;
          this.vx = (bx - this.cx) / dd * 16;
          this.vy = (by - this.cy) / dd * 16;
          this.pFace(this.vx, this.vy);
          this.pAi0 = 0; this.pAi1 = 1; this.pTarget = best;
        }
        // 未找到新目标 → pAi0 已被 :26188 段置 1 → 返回（即便仍按住）
      }
    } else if (this.pAi0 === 0) {
      // :26245-26261 直飞：无追踪（首咬靠接触），离主 >700 → 返回
      if (dp > 700) this.pAi0 = 1;                           // :26247-26251
      this.pFace(this.vx, this.vy);                          // :26252-26261
    } else {
      // :26266-26299 返回：穿墙、速度 20 直指玩家、<70px 回收
      tileCollide = false;
      this.pFace(this.vx, this.vy);                          // :26267-26287（保留来向姿态）
      if (dp < 70) { this.piranhaKill(game); return; }       // :26276-26279
      const dd = dp === 0 ? 0.0001 : dp;                     // :26273 num324=20
      this.vx = dxp / dd * 20;
      this.vy = dyp / dd * 20;
      this.x += p.vx ?? 0; this.y += p.vy ?? 0;              // :26296-26299 type 190
    }
    // :26301-26310 帧推进（4t/帧 4 帧循环；AI 侧真源，draw 消费 pFrame）
    if (++this.pFrameCounter >= 4) {
      this.pFrameCounter = 0;
      this.pFrame = (this.pFrame + 1) % 4;
    }
    // 位移积分（Update 运动段在 AI 后）
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!game.world.store.inBounds(tx, ty)) { this.piranhaKill(game); return; }
    // 撞块（HandleMovement :17940-17964 aiStyle 39 档：HitTiles 尘 + dig 声 +
    //  ai[0]=1 返回，弹体不消亡；咬住/返回期 tileCollide=false 整段跳过）
    const tileType = game.world.store.get(tx, ty);
    if (tileCollide && tileType !== 0) {
      game.cutTile(tx, ty);
      if (game.world.store.isSolid(tx, ty)) {
        this.x -= this.vx; this.y -= this.vy;                // 碰撞回退（停在墙前）
        this.vx = 0; this.vy = 0;
        this.pAi0 = 1;                                       // :17958 返回
        game.spawnParticles(this.cx, this.cy, '#B0A080', 4, 1.5, { life: 18 });
        game.playSfx('dig', 1, this.cx, this.cy);            // :17962 SoundID.Dig(0)
      }
    }
    // 小动物接触（Damage_PVE 对 NPC 通用：小动物 friendly=false 亦受击；
    //  penetrate=−1 弹体不消耗；非 CanBeChasedBy 目标不会成为咬住对象）
    hitCritters(this, game);
    // 命中结算（Damage_PVE :11850 迭代 + Damage_PVE_Inner :11888）
    for (const ent of game.enemies()) {
      const e = ent as unknown as PiranhaTarget;
      if (e.dead) continue;
      if (!playerCanHitEnemy(e, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892/CanBeChasedBy :91070——睡渔夫 376 等友好 NPC 玩家武器无效/不追踪）
      if (!(this.x < e.x + e.w && this.x + this.w > e.x
        && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      if (this.pHitCd.has(e.id)) continue;                   // :11869 localNPCImmunity 门
      if ((e.iframes ?? 0) > 0) continue;                    // :11905 npc.immune[owner] 门
      // StrikeNPC :12811（暴击链同通用弹：基 4% + spawn 注入系暴击）
      const crit = Math.random() < (this.critChance || (4 + this.critBonus) / 100);
      const dmg = crit ? this.damage * 2 : this.damage;
      // StatusNPC :10622-10625：命中必挂 Hemorrhage(375) 240-360t（表驱动）
      applyProjStatus(PIRANHA_PROJ, e as unknown as Record<string, number>);
      if (this.frostEligible) {
        applyFrostBurn((game.player as unknown as { equipStats?: { frostBurn?: boolean } })
          .equipStats?.frostBurn ?? false, e as unknown as Record<string, number>);
      }
      // pierce=1 档：命中不设敌方免疫帧（:13154-13158 immune[owner]=0 语义），
      // fromPlayer=true 走 DPS/掉落门链；音/飘值=StrikeNPC 单点
      e.hurt(dmg, Math.sign(e.cx - this.cx) * this.knockback, 0, game, this.settlePen, crit, 1, true);
      this.pHitCd.set(e.id, PIRANHA_HIT_CD);                 // :13157 localNPCHitCooldown=14
      if (this.pAi1 === 0) { this.pAi1 = 1; this.pTarget = e; }   // :12447-12450 首咬 latch
    }
  }
}

// ---------------------------------------------------------------------------
// 454 幻影能量球齐射指令（发射点侧遍历场上本波球——LunarOrb.parentId 圈定模式）
// ---------------------------------------------------------------------------
/** 把场上全部 ownerId 的 454（ai0≠−1）置齐射态并统一赋速（NPC.cs:37407-37427
 *  手攻击 2 num1232==292 / :38487-38505 真眼攻击 2 t==105）：原版逐弹覆写同一个
 *  vector175/vector224（手：normalize(玩家−(手心+(0,−350)))·12；真眼：瞄准向·12）
 *  ——全部球以【同一速度矢量】平行齐射，非逐球独立寻的。 */
export function volleyPhantomOrbs(game: GameHooks, ownerId: number, vx: number, vy: number): void {
  const list = (game as unknown as { entities?: { projectiles?: unknown[] } }).entities?.projectiles ?? [];
  for (const o of list) {
    const p = o as Arrow;
    if (p.dead || p.projId !== 454 || !p.phantomOrb) continue;
    if (p.orbOwnerId !== ownerId || p.orbAi0 === -1) continue;
    p.orbAi0 = -1;
    p.vx = vx;
    p.vy = vy;
  }
}

/** 给场上全部 ownerId 的 454（ai0≠−1）叠加速度（NPC.cs:38471-38483 真眼攻击 2
 *  t==75 升空：velocity += 眼速度 (0,−7)——列队球整体被带起）。 */
export function nudgePhantomOrbs(game: GameHooks, ownerId: number, dvx: number, dvy: number): void {
  const list = (game as unknown as { entities?: { projectiles?: unknown[] } }).entities?.projectiles ?? [];
  for (const o of list) {
    const p = o as Arrow;
    if (p.dead || p.projId !== 454 || !p.phantomOrb) continue;
    if (p.orbOwnerId !== ownerId || p.orbAi0 === -1) continue;
    p.vx += dvx;
    p.vy += dvy;
  }
}

// ---------------------------------------------------------------------------
// 1457 弧线引矢（鹰妖护符 6166 / 炽天使项链 6180 / 凤凰箭袋 6181）玩家侧扫描
// ---------------------------------------------------------------------------

/** 原版 Projectile.arrow = true 弹型全集（SetDefaults 23 处直写 :811/:821/:841/:853/
 *  :1241/:1747/:1908/:2062/:2097/:2583/:3104/:3642/:3692/:5440/:5478/:5608/:5685/
 *  :6783/:6877/:7525/:7997/:8847/:9574——1 木箭/2 燃烧箭/4 邪箭/5 小丑箭/41 狱炎箭/
 *  91 圣箭/225 叶绿箭/469 蜂箭/474 骨箭/485 狱翼箭/639 月总箭/710 空中祸害裂片/
 *  932 仙王射弹等）。弧线引矢扫描门 = `projectile.arrow && aiStyle == 1`
 *  （Player.cs:28682） */
export const VANILLA_ARROW_PROJS = new Set([
  1, 2, 4, 5, 41, 91, 103, 117, 120, 172, 225, 278, 282, 469, 474, 485, 495,
  631, 639, 710, 819, 932, 1006,
]);

/** HarpyCharmEffect 玩家参数面（结构化类型——Player 实体直传，避免实体环） */
export interface HarpyCharmPlayer {
  cx: number;
  cy: number;
  equipStats: { accHarpyCharm: boolean; accSeraphNecklace: boolean; hasPhoenixQuiver: boolean };
  /** Player.accHarpyCharmCooldown（:1219）——命中引矢时直写（:28702） */
  accHarpyCharmCooldown: number;
}

/** HarpyCharmEffect（Player.cs:28661-28704，由 Update_HarpyCharm :28648-28659 在
 *  冷却归零拍调用）：扫描在场玩家箭——距玩家 [400,1200)（:28667-28687 三非门：
 *  <400 太近不引 / ≥当前最近跳过 / >1200 太远不引）、arrow+aiStyle1+未引（:28682），
 *  取最近一支且其 FindTargetWithLineOfSight(1600) 有视线目标 → ApplyHarpyCharm。
 *  冷却 90t、6180 炽天使 ×0.8=72（:28670-28674）；标记件优先级
 *  hasPhoenixQuiver→6181 > accSeraphNecklace→6180 > 6166（:28700）。 */
export function harpyCharmEffect(game: GameHooks, player: HarpyCharmPlayer): void {
  if (!player.equipStats.accHarpyCharm || player.accHarpyCharmCooldown > 0) return;   // :28663-28666
  const NEAR = 400;      // num :28667
  const FAR = 1200;      // num2 :28668
  const LOS = 1600;      // num3 :28669
  let cd = 90;           // num4 :28670
  if (player.equipStats.accSeraphNecklace) cd = Math.trunc(cd * 0.8);   // :28671-28674 →72
  let best: Arrow | null = null;             // num6 :28676
  let bestD = Number.POSITIVE_INFINITY;      // num7 :28678 float.MaxValue
  let target: { cx: number; cy: number } | null = null;   // npcTargetIndex
  const list = (game as unknown as { entities?: { projectiles?: unknown[] } }).entities?.projectiles ?? [];
  for (const o of list) {
    const p = o as Arrow;
    // :28682 门：active/arrow/owner==whoAmI/aiStyle==1/未 HarpyCharmed——本仓
    // owner 等价 = 非敌方弹（!hostile；玩家弹恒 owner 本地）
    if (p.dead || p.hostile) continue;
    if (!VANILLA_ARROW_PROJS.has(p.projId)) continue;
    if ((projectileData(p.projId)?.aiStyle ?? -1) !== 1) continue;
    if (p.harpyCharmed) continue;
    const d = Math.hypot(p.cx - player.cx, p.cy - player.cy);   // num8 :28686
    // :28687 原式 `!(d<400) && !(d>=best) && !(d>1200)` = [400,1200] 内比最近
    if (!(d < NEAR) && !(d >= bestD) && !(d > FAR)) {
      const tgt = p.nearestEnemyWithLos(game, LOS);             // :28689
      if (tgt) {
        bestD = d;
        best = p;
        target = tgt;
      }
    }
  }
  if (best && target) {
    // :28700 标记件 id 三档 → :28701 ApplyHarpyCharm → :28702 冷却写入
    const itemVid = player.equipStats.hasPhoenixQuiver ? 6181
      : player.equipStats.accSeraphNecklace ? 6180 : 6166;
    best.applyHarpyCharm(target.cx, target.cy, itemVid);
    player.accHarpyCharmCooldown = cd;
    // ★R25-⑦ 音效段先行（Spawn_HarpyCharm,ParticleOrchestrator1458.cs:477-504）：
    //   默认 SoundID.Item39（6166 鹰妖护符/6180 炽天使项链）、flag=6181 凤凰箭袋→
    //   SoundID.Item20；SoundEngine.PlaySound(type, 弹体位置, pitch 0/vol 1)。
    //   粒子族（FadingParticle 双环带 num2×4/num3×3、6181/6180 ×2 与 PrettySparkle）
    //   待 FadingParticle 原语另批（R15-17 登记维持）。
    game.playSfxWav?.(itemVid === 6181 ? 'Item_20' : 'Item_39', 1, best.cx, best.cy);
  }
}
