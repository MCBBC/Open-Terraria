// 箭矢/通用直飞·抛物线投射物（原版 Projectile type 1/2、aiStyle 1/2 主干，Projectile.cs:546-566 + AI_001/AI_002）：
// 重力 0.3/tick（aiStyle1/2 通用常量；直飞弹传 0）、timeLeft 1200、旋转 atan2(vy,vx)+π/2（AI_001 尾部 L54877）、
// 原版贴图 Projectile_N.png；命中敌人伤害/击退/暴击（穿透>1 时同敌免疫防连击）；
// 命中 tileCut 砍草/碎罐（Projectile.CutTiles）；命中实心块 1/3 概率回收掉落。
import { Entity } from './Entity';
import { SpriteAtlas, upgradeToBitmap, evictSwCacheEntry } from '../assets/SpriteAtlas';
import { applyProjStatus, applyFrostBurn } from './projStatus';
import { hitCritters, hitPlayer, hitTownNpcs, playEnemyHitSound, playerCanHitEnemy, statusPlayer, tryReflectProjectile } from './projTargets';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { trySnapStrike } from '../stats/SnapStrike';
import { canHit, canHitLine } from '../physics/LineOfSight';
import { LIQUID_TYPE } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
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
const PROJ_FRAMES = projFramesJson as Record<string, number>;
export function projFrameCount(projId: number): number {
  return PROJ_FRAMES[String(projId)] ?? 1;
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
  const frames = projFrameCount(projId);
  const idx = Math.max(0, Math.min(frames - 1, frameIdx));
  const fh = img.height / frames;
  if (!Number.isFinite(fh) || fh < 1) return null;
  const key = `${projId}|${idx}`;
  let c = frameCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width;
  c.height = Math.round(fh);
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, Math.round(idx * fh), img.width, Math.round(fh), 0, 0, c.width, c.height);
  if (frameCache.size > 2048) frameCache.clear();
  frameCache.set(key, c);
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
const PROJ_ROT_DIAG = new Set([114, 115, 116, 132, 156, 173, 660]);
export { PROJ_ROT_DIAG };

/** 恒旋族（AI_001 尾链 :54741-54749/:54822-54825：rotation 每帧累加、不对齐速度）：
 *  312 南瓜灯 += vx*0.02；772 晶洞 += sign(vx)·(|vx|+|vy|)·0.05；
 *  94 水晶风暴 += vx*0.2（AI_024 :24305）/ 95 诅咒之焰 += 0.3×direction
 *  （AI_008 :22659-22662，aiStyle8 自动换向 :15675→direction=sign(vx)）/
 *  424 流星弹 += vx*2（AI_001 type 段 :54159）/
 *  90 水晶碎块 += vx*0.2（AI_024 同款 :24305，515 水晶子弹 Kill 碎片）/
 *  92 坠星 += sign(vx)·(|vx|+|vy|)·0.01（aiStyle5 尾链 :22241-22245，direction=sign(vx)）。
 *  同链其余（248 花瓣/483 种子/532 骨手套/675 黑法师弹/921·926·937）无武器可达。 */
const PROJ_SPIN: Record<number, (a: Arrow) => number> = {
  312: a => a.vx * 0.02,
  772: a => Math.sign(a.vx) * (Math.abs(a.vx) + Math.abs(a.vy)) * 0.05,
  94: a => a.vx * 0.2,
  95: a => 0.3 * (a.vx < 0 ? -1 : 1),
  424: a => a.vx * 2,
  90: a => a.vx * 0.2,
  92: a => Math.sign(a.vx || 1) * (Math.abs(a.vx) + Math.abs(a.vy)) * 0.01,
  // 沙球族（AI_010 尾链 :55149-55154 非 736-738 支）：rotation += 0.1/update 恒滚
  42: () => 0.1, 65: () => 0.1, 68: () => 0.1, 354: () => 0.1,
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
const PROJ_ALPHA0: Record<number, number> = {
  5: 100, 94: 50, 95: 100, 280: 255, 477: 255, 478: 255, 521: 255, 639: 255, 932: 0,
  207: 255, 837: 255,
  163: 255, 310: 255, 1008: 255, 1009: 255, 1010: 255, 1011: 255,   // 信号枪族（163 :2523 等）
  514: 255,                                                          // 钉（aiStyle 93 −25/t 渐显 :33427-33434）
  246: 255,                                                          // 刺炮弹（−20/t 渐显 :58106-58110）
  311: 255,                                                          // 糖果玉米（−50/t 渐显 :58117-58123）
};

/** 直立族（aiStyle 29 全链 :24994-25207 零 rotation 赋值=恒不旋转）：宝石法杖箭
 *  121-126（739-744 六色杖）/521 水晶脉冲/597 琥珀箭——曾走默认 +π/2 对速度
 *  旋转（宝石随飞行方向翻滚），原版恒直立；79 彩虹光弹 = :32420-32423 显式
 *  num327=0 直立（另带按 12 帧前位移的 scale 渐缩——scale 通道登记未接） */
const PROJ_NO_ROT = new Set([121, 122, 123, 124, 125, 126, 521, 597, 79]);
export { PROJ_NO_ROT };
export { PROJ_ROT_RIGHT };

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
  /** 专家追踪参数（null=无） */
  homing: { speed: number; weight: number; floor?: number; cap?: number; axis?: 'x' | 'y' } | null;
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

  /** FindTargetWithLineOfSight 等价：视距内最近且有视线的敌怪（:38571 FindTargetWithLineOfSight）。
   *  h = 目标命中盒高（225 叶绿箭归巢瞄准点上偏移 nPC.height×0.1..0.5 消费，:17147）。
   *  公开：1457 弧线引矢玩家侧扫描（harpyCharmEffect）对在场箭逐支调同款视距索敌 */
  nearestEnemyWithLos(game: GameHooks, range: number): { cx: number; cy: number; h: number } | null {
    let best: { cx: number; cy: number; h: number } | null = null;
    let bestD = range;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { cx?: number; cy?: number; x: number; y: number; w: number; h: number; dead?: boolean };
      if (e.dead) continue;
      const cx = e.cx ?? e.x + e.w / 2;
      const cy = e.cy ?? e.y + e.h / 2;
      const d = Math.hypot(cx - this.cx, cy - this.cy);
      if (d >= bestD) continue;
      if (!canHitLine(game.world.store, this.cx, this.cy, 0, 0, cx, cy, 0, 0)) continue;
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
  // ---- 喵刀弹 502（Meowmere Cat）专属态 ----
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
  /** oldPos 拖尾环（彩虹拖尾 Main.cs:32495-32513 沿 oldPos 逐段绘制，N=10） */
  private meowTrail: number[] = [];
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
    // 穿透表（修复1）：opts 显式优先 → SetDefaults penetrate → 缺省 1。−1 = 无限
    // （小丑箭 5(:594)/地狱火箭 41(:982)；命中侧按全局 immune 帧冷却再命中）
    this.pierce = opts?.pierce ?? pd0?.penetrate ?? 1;
    // alpha 初值（修复4，SetDefaults 逐型 PROJ_ALPHA0）
    this.alpha = PROJ_ALPHA0[projId] ?? 0;
    // 424 流星弹 scale = ai[1]（AI :54158 直读；发射侧 Player.cs:47069 ai1 =
    // 0.5+rand×0.3——本仓发射点未注入，出生时同分布掷定）
    if (projId === 424) this.drawScale = 0.5 + Math.random() * 0.3;
    // NewProjectile 出生速钳（Projectile.cs:10259-10267）：aiStyle 1 弹逐轴 |v|≥16
    // → 双轴 ×0.97 收敛（注意原版负 vy 侧无等号：vy < −16 才收）
    if ((pd0?.aiStyle ?? -1) === 1) {
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
      case 94: case 95: return 200 / 255;
      case 521: case 639: return (255 - this.alpha) / 255;
      // 207/837（GetAlpha :76682-76687：r=g=b=255−alpha → 缺省路径同式）/
      // 92（aiStyle5 通用闪烁档 :22222-22238，alpha 0↔200 振荡）/
      // 163 族信号弹（SetDefaults alpha=255 :2523，AI_033 −50/t 渐显 :27428-27435
      // → 缺省路径同式，5 拍淡入）
      case 207: case 837: case 92: return (255 - this.alpha) / 255;
      case 163: case 310: case 1008: case 1009: case 1010: case 1011:
        return (255 - this.alpha) / 255;
      case 514: return (255 - this.alpha) / 255;   // 钉 aiStyle 93 渐显（:33427-33434）
      case 246: case 311: return (255 - this.alpha) / 255;   // 刺炮弹/糖果玉米渐显
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
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    // alpha 通道（修复4）：GetAlpha 近似 → globalAlpha（present/phantasm/piranha 等
    // 专属档在下方各自覆写，id 集不相交）
    const ga = this.drawGlobalAlpha();
    if (ga !== null) ctx.globalAlpha = Math.max(0, Math.min(1, ga));
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
    } else if (PROJ_NO_ROT.has(this.projId)) {
      /* 直立族（aiStyle 29 零 rotation）：恒不旋转 */
    } else if (this.projId === 477 && this.dartRot !== null) {
      ctx.rotate(this.dartRot);      // 477 水晶镖平滑姿态（:54802-54812，AI 侧维护）
    } else {
      ctx.rotate(rightArt ? ang
        : PROJ_ROT_DIAG.has(this.projId) ? ang + Math.PI / 4   // aiStyle 27 剑气 +45°（:24860）
          : ang + Math.PI / 2);
    }
    // 469 蜂箭（:54789-54798）：vx>0 → spriteDirection=-1（贴图朝左，源翻转语义）
    if (this.projId === 469 && this.vx > 0) ctx.scale(-1, 1);
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
              : Math.floor(this.age / 5) % frames;
    const frameImg = frames > 1 ? projFrameImg(this.projId, fIdx) : null;
    const drawImg = frameImg ?? img;
    if (drawImg && (drawImg as HTMLImageElement).complete !== false
      && (drawImg.width > 0 || (drawImg as HTMLImageElement).width > 0)) {
      // 原生尺寸 × SetDefaults scale（与判定盒 w/h 解耦）：子弹 14 = 2×20×1.2
      // 曳光条；箭 1 = 14×32 贴图 × 1。曾统一拉成 w×w 宽 → 100px 巨型子弹/箭偏小
      // 454 随 alpha 伸展（:30244-30245 scale = 1−alpha/255）
      const s = this.drawScale * (this.phantomOrb ? 1 - this.orbAlpha / 255 : 1);
      const iw = drawImg.width || (drawImg as HTMLImageElement).width;
      const ih = drawImg.height || (drawImg as HTMLImageElement).height;
      ctx.drawImage(drawImg as CanvasImageSource, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
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
    // ★91/92 圣箭星雨（:72250-72287）/ 41 狱炎箭 64×64 爆炸（:73256-73293）/
    // 89 水晶碎裂（:72289+）已由尾部 onProjectileDeath 分发到 Game 侧实现
    // （Game.onProjectileDeath projId 分支），此处不内结防双触发
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h, this.vx, this.vy,
      this.damage, { hostile: this.hostile, ai0: this.starFallGen, kb: this.knockback, arpen: this.settlePen });
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

  /** 710 空旷判定（Damage() :12236-12239）：WorldUtils.Find(Center, Down(12)+notNull
   *  +solid) 未找到实心 = 空旷 → 命中伤 ×1.5。Down(12) 自锚点格起向下探 12 格
   *  （Searches.Down :44-55 含 i=0） */
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

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
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
    for (let u = 0; u <= this.extraUpdates; u++) {
      this.subStep(game);
      if (this.dead) return;
    }
  }

  /** 单次子步（无 extraUpdates 时即整帧本体） */
  private subStep(game: GameHooks): void {
    if (--this.life <= 0) { this.killNow(game); return; }
    const world = game.world;
    this.age++;
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
      this.lightRGB = [l94, l94, l94];                           // light = scale*0.5（:24304）
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
      this.lightRGB = [l90, l90, l90];                           // light = scale*0.5（:24304）
      this.vx *= 0.96; this.vy *= 0.96;                          // velocity *= 0.96（:24320）
      if (this.aiCnt > 15) {                                     //（:24321-24326）
        this.drawScale -= 0.05;
        if (this.drawScale <= 0.2) {
          this.drawScale = 0.2;
          this.killNow(game);
          return;
        }
      }
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
      //   （:53999-54010，207 N=8 / 837 N=32）
      if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 25);
      if (this.projId === 207) this.lightRGB = [0.5, 0.5, 0.5];   // SetDefaults light=0.5（:2686）
      if (this.alpha < 170) {
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
          const w = this.projId === 837 ? 32 : 8;         // num203（:54001-54005）
          this.vx = (this.vx * (w - 1) + (dx / dl) * sp) / w;
          this.vy = (this.vy * (w - 1) + (dy / dl) * sp) / w;
        }
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
              rec.hurt(dN, 0, 0, game, this.settlePen, critN, 1, true);
              game.addDamageNumber(this.cx, this.cy, Math.round(dN), critN, critN ? '#FF8040' : '#FFD060');
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
        if (Math.hypot(this.vx, this.vy) < 1) { this.killNow(game); return; }
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
        if (Math.hypot(this.vx, this.vy) > 0.1) { this.vx *= 0.97; this.vy *= 0.97; }
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
            this.vx += (this.vx / (sp || 1)) * 0.1;
            this.vx *= 1.1;
            this.vy *= 1.1;
            sp = Math.hypot(this.vx, this.vy);
          }
          const dist = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
          let turn = Math.max(0, 1 - dist / range) * 0.1 + 0.01;
          if (sp < maxSp) {
            turn += 0.05 * Math.max(1, Math.min(10, 10 - (sp - 1) * 4.5)); // Remap(sp,1,3,10,1) 近似
          }
          const want = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
          const cur = Math.atan2(this.vy, this.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const nv = cur + Math.max(-turn, Math.min(turn, diff));
          this.vx = Math.cos(nv) * sp;
          this.vy = Math.sin(nv) * sp;
          if (dist < 150) {           // :38622-38623 近距收敛 lerp
            const k = Math.max(0, 1 - dist / 150) * 0.2;
            const txv = ((tgt.cx - this.cx) / dist) * maxSp;
            const tyv = ((tgt.cy - this.cy) / dist) * maxSp;
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
    this.x += this.vx;
    this.y += this.vy;
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
        // 实心块：1/3 概率回收掉落（原版箭 Kill 的掉落），然后消失
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
        playEnemyHitSound(game, e);
        e.hurt(dN, 0, 0, game, this.settlePen, critN, 1, true);
        game.addDamageNumber(this.cx, this.cy, Math.round(dN), critN, critN ? '#FF8040' : '#FFD060');
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
      // 1457 宝石法珠 BiggerHitbox（Colliding :15447-15474）：命中盒外扩 30px
      const gemInf = !dragonLine && this.gem?.biggerHitbox ? 30 : 0;
      const hitInf = foxInf + gemInf;
      const hitBox = !dragonLine
        ? (this.x - hitInf < e.x + e.w && this.x + this.w + hitInf > e.x
          && this.y - hitInf < e.y + e.h && this.y + this.h + hitInf > e.y)
        : (() => {
          for (let k2 = -40; k2 <= 40; k2 += 16) {
            const bx = this.cx + dPerpX * k2 - 8, by = this.cy + dPerpY * k2 - 8;
            if (bx < e.x + e.w && bx + 16 > e.x && by < e.y + e.h && by + 16 > e.y) return true;
          }
          return false;
        })();
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
          en2.hurtFx = (d: number) => { e.hurt(d, Math.sign(this.vx) * 2, -2, game); };
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
        applyProjStatus(this.projId, e as unknown as Record<string, number>);
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
          trySnapStrike(game, game.player, 0, e.x + e.w / 2, e.y + e.h / 2, e.id);
        }
        // ★1457 GetDamageMultiplier(Player.cs:49810-49813):宝石弹【全部伤害】(含本体
        //   直击)乘 SwirlTwins 0.6/CanBounce 0.8/ArPenSpread 0.5 取最小——曾只在
        //   AoeExplosion 爆伤消费,三系法杖本体直击虚高 25-67%(完整性审查 P1-1)
        if (this.gem) dmg = Math.max(1, Math.round(dmg * gemDamageMultiplier(this.gem)));
        playEnemyHitSound(game, e);
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.settlePen, crit, this.pierceInit, true);
        game.addDamageNumber(this.x, this.y, Math.round(dmg), crit, crit ? '#FF8040' : '#FFD060');
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

  private piranhaStep(game: GameHooks): void {
    // Update :15329 DecrementLocalImmuneTimeCounters——localNPCImmunity 逐帧递减
    for (const [k, v] of this.pHitCd) {
      if (v <= 1) this.pHitCd.delete(k); else this.pHitCd.set(k, v - 1);
    }
    if (--this.life <= 0) { this.piranhaKill(game); return; }
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
      playEnemyHitSound(game, e);
      // pierce=1 档：命中不设敌方免疫帧（:13154-13158 immune[owner]=0 语义），
      // fromPlayer=true 走 DPS/掉落门链
      e.hurt(dmg, Math.sign(e.cx - this.cx) * this.knockback, 0, game, this.settlePen, crit, 1, true);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FF8040' : '#FFD060');
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
  }
}
