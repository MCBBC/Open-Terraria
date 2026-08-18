// 箭矢/通用直飞·抛物线投射物（原版 Projectile type 1/2、aiStyle 1/2 主干，Projectile.cs:546-566 + AI_001/AI_002）：
// 重力 0.3/tick（aiStyle1/2 通用常量；直飞弹传 0）、timeLeft 1200、旋转 atan2(vy,vx)+π/2（AI_001 尾部 L54877）、
// 原版贴图 Projectile_N.png；命中敌人伤害/击退/暴击（穿透>1 时同敌免疫防连击）；
// 命中 tileCut 砍草/碎罐（Projectile.CutTiles）；命中实心块 1/3 概率回收掉落。
import { Entity } from './Entity';
import { upgradeToBitmap } from '../assets/SpriteAtlas';
import { applyProjStatus, applyFrostBurn } from './projStatus';
import { hitCritters, hitPlayer, hitTownNpcs, playEnemyHitSound, statusPlayer, tryReflectProjectile } from './projTargets';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { canHit } from '../physics/LineOfSight';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 原版投射物贴图懒加载（Projectile_1.png = 木箭、Projectile_2.png = 燃烧箭，泛用所有 id） */
const spriteCache = new Map<number, ImageBitmap | HTMLImageElement>();
export function projSprite(projId: number): ImageBitmap | HTMLImageElement | null {
  let img = spriteCache.get(projId);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  im.onload = () => upgradeToBitmap(im, (b) => spriteCache.set(projId, b));
  img = im;
  img.src = `sprites/vanilla/Projectile_${projId}.png`;
  spriteCache.set(projId, img);
  return img;
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
import { projGravSpec } from '../data/vanillaItemCombat';
const PROJ_FRAMES = projFramesJson as Record<string, number>;
export function projFrameCount(projId: number): number {
  return PROJ_FRAMES[String(projId)] ?? 1;
}

/** 单帧裁切缓存（id+帧号 → canvas），多帧行按帧高切片 */
const frameCache = new Map<string, HTMLCanvasElement>();
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
  /** 原版 timeLeft（Projectile.cs:554 默认 1200） */
  life?: number;
  /** 穿透次数（原版 penetrate：手里剑 4、箭 1；-1 视作 1） */
  pierce?: number;
  /** 敌对弹（原版 Projectile.hostile，Damage_EVP :13708 门禁）：
   *  Boss/敌怪发射的弹传 true → 命中玩家结算伤害；玩家武器弹默认 false 不伤玩家。 */
  hostile?: boolean;
  /** aiStyle 14 弹跳弹（希腊火/装饰球等月事件弹幕，Projectile.cs 碰撞反弹
   *  cs:18314-18327 档）：撞实心块法向反弹 ×0.5 衰减而非消亡。 */
  bounce?: boolean;
  /** aiStyle 14 荆棘球档（世纪之花 277，Projectile.cs:18306-18314）：
   *  vx 恒反 ×0.9；仅入撞 |vy|>3 才竖弹 ×0.9（地面滚动语义）。 */
  thornBounce?: boolean;
  /** 延迟重力（AI_001 重力链语义，2026-08-14 对账）：飞行满 gravDelay 个
   *  update 后才开始下坠。默认档 = 15（箭缓坠 +0.1，:54686-54696）；275/276
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
  homing?: { speed: number; weight: number; floor?: number; cap?: number };
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
 *  312 南瓜灯 += vx*0.02；772 晶洞 += sign(vx)·(|vx|+|vy|)·0.05。
 *  同链其余（248 花瓣/483 种子/532 骨手套/675 黑法师弹/921·926·937）无武器可达。 */
const PROJ_SPIN: Record<number, (a: Arrow) => number> = {
  312: a => a.vx * 0.02,
  772: a => Math.sign(a.vx) * (Math.abs(a.vx) + Math.abs(a.vy)) * 0.05,
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
  /** 延迟重力（AI_001 链）：age（update 计）超过此值才施加 grav；-1=不延迟 */
  gravDelay: number;
  /** 二段重力（686/711）：age 超过 grav2At 再加 grav2；0=无 */
  grav2: number;
  grav2At: number;
  /** 恒定 vx 衰减/update（0=无；686/711 0.99——不挂重力门） */
  dragAlways: number;
  /** 专家追踪参数（null=无） */
  homing: { speed: number; weight: number; floor?: number; cap?: number } | null;
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
  // ---- 喵刀弹 502（Meowmere Cat）专属态 ----
  /** ai[0]：弹跳+命中共享计数（0..5，≥5 消亡）——弹跳 :18169 递增/命中 :16794
   *  递增同槽（先到 5 者杀弹，喵叫音高 style=5+ai0 随之爬升） */
  meowCount = 0;
  /** localNPCHitCooldown 同敌再命中冷却（SetDefaults :5466-5468 = 10t） */
  private meowHitCd = new Map<number, number>();
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
    this.life = opts?.life ?? 1200;
    this.pierce = opts?.pierce ?? 1;
    this.pierceInit = this.pierce;
    this.hostile = opts?.hostile ?? false;
    this.bounce = opts?.bounce ?? false;
    this.thornBounce = opts?.thornBounce ?? false;
    this.homing = opts?.homing ?? null;
    this.extraUpdates = opts?.extraUpdates ?? pd0?.extraUpdates ?? 0;   // 子弹 14=1(2 步/tick)、高速弹 207=2
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
    if (opts?.piranha) {
      this.piranha = opts.piranha;
      this.pShootSpeed = Math.hypot(vx, vy);   // Game 侧可覆写为精确 shootSpeed
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标——
    // 曾双变换把箭甩出屏幕,表现为"箭隐形但能命中")
    const ctx = r.canvas.getContext('2d');
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
    const ang = this.piranha ? this.pRot
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
    // 朝右贴图族（PROJ_ROT_RIGHT）：rotation=atan2(vy,vx)（vanilla :26122-26140 模式），
    // 向左运动水平镜像（spriteDirection 语义）；其余默认朝上 atan2+π/2（AI_001 L54877）
    const rightArt = PROJ_ROT_RIGHT.has(this.projId);
    const flipLeft = this.piranha ? this.pFlip : this.vx < 0;
    if (rightArt && flipLeft) {
      ctx.scale(-1, 1);              // 先镜像再旋转（R(π−ang)∘M ≡ 原版 flip+atan2(−vy,−vx)）
      ctx.rotate(Math.PI - ang);
    } else if (PROJ_SPIN[this.projId]) {
      ctx.rotate(this.spinRot);      // 恒旋族（:54741/:54824 累加不对齐速度）
    } else if (PROJ_NO_ROT.has(this.projId)) {
      /* 直立族（aiStyle 29 零 rotation）：恒不旋转 */
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
    const fIdx = this.piranha ? this.pFrame : Math.floor(this.age / 5) % frames;
    const frameImg = frames > 1 ? projFrameImg(this.projId, fIdx) : null;
    const drawImg = frameImg ?? img;
    if (drawImg && (drawImg as HTMLImageElement).complete !== false
      && (drawImg.width > 0 || (drawImg as HTMLImageElement).width > 0)) {
      // 原生尺寸 × SetDefaults scale（与判定盒 w/h 解耦）：子弹 14 = 2×20×1.2
      // 曳光条；箭 1 = 14×32 贴图 × 1。曾统一拉成 w×w 宽 → 100px 巨型子弹/箭偏小
      const s = this.drawScale;
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
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h, this.vx, this.vy);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 食人鱼 190 独占状态机（aiStyle 39）——重力/穿透递减/撞块消亡等通用语义不适用
    if (this.piranha) { this.piranhaStep(game); return; }
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
    // AI_001 重力链（2026-08-14 对账，:53083-54698 全链规格走 projGravSpec）：
    //   默认 = ai0≥15 update 后 +0.1/update、终端 16（:54686-54696/:54871-54887）
    //   ——箭族 15t 平飞缓坠；子弹/光束 flag3 表豁免（grav=0）；
    //   275/276 延迟档（35t 后 g=0.025，:54318-54329）；
    //   686/711 两段式（≥10 +0.1、≥20 再 +0.1、vx×0.99 恒定，:54640-54659）；
    //   aiStyle 2 投掷族（:21955-21977 默认档）：20t 平飞后 vy+=0.4、vx×=0.97、终端 32
    if (this.grav !== 0 && (this.gravDelay < 0 || this.age > this.gravDelay)) {
      this.vy = Math.min(this.vy + this.grav, this.maxFall);
      if (this.drag !== 1) this.vx *= this.drag;
    }
    if (this.grav2 !== 0 && this.age > this.grav2At) {
      this.vy = Math.min(this.vy + this.grav2, this.maxFall);
    }
    if (this.dragAlways !== 0) this.vx *= this.dragAlways;
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
    // t≥Lerp(ai1,ai1+25,0.65)≈34 清伤（纯视觉尾段）；>8 速才减速/探墙（正牌
    // 出生速=瞄准向×5 恒不触发，973 甩剑共用段）
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
    if (this.homing) {
      const p = game.player;
      if (p && !p.dead) {
        let dx = p.cx - (this.x + this.w / 2), dy = p.cy - (this.y + this.h / 2);
        const d = Math.hypot(dx, dy) || 1;
        dx = dx / d * this.homing.speed;
        dy = dy / d * this.homing.speed;
        this.vx = (this.vx * (this.homing.weight - 1) + dx) / this.homing.weight;
        this.vy = (this.vy * (this.homing.weight - 1) + dy) / this.homing.weight;
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
    }
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.killNow(game); return; }
    const tileType = world.store.get(tx, ty);
    // 星怒剑线上方穿墙（:22139-22143 越线前 tileCollide=false）——整段跳过
    if (tileType !== 0 && !(this.starY !== null && !this.starCollide)) {
      // 可砍物（杂草/瓦罐）：Projectile.CutTiles 语义——弹幕扫过即砍
      game.cutTile(tx, ty);
      // 阻挡判定只看【实心】(Main.tileSolid 语义):树干/火把/平台等非实心格
      // 箭直接穿过(此前 tileType!==0 一刀切,箭会被树挡住——树 solid:false)
      if (!world.store.isSolid(tx, ty)) return;
      // aiStyle 14 弹跳弹（希腊火 326-328 / 装饰球 346）：撞块法向反弹不消亡
      if (this.bounce && this.bounceOff(game)) return;
      // 喵刀弹 502（AI_008 弹跳档 :18165-18206）：tink 音 + ai[0] 计数 ≥5 消亡；
      // 全速翻面（无 ×0.9 衰减——type 15 才有 ×0.8），同 hitSet 语义无
      if (this.projId === 502 && this.meowBounceOff(game)) return;
      // 荆棘球 277 专属档（Projectile.cs:18306-18314）：vx 恒反 ×0.9；
      // 仅入撞 |vy|>3 竖弹 ×0.9（贴地滚动）
      if (this.thornBounce && this.thornBounceOff(game)) return;
      // 实心块：1/3 概率回收掉落（原版箭 Kill 的掉落），然后消失
      if (this.dropKey && Math.random() < 1 / 3) game.spawnDrop(this.x, this.y, this.dropKey, 1);
      this.killNow(game);
      return;
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
    // 命中敌人（原版 penetrate：箭 1 射中即停；手里剑 4 穿 4 敌，同敌免疫防连击）
    // 飞龙剑气 684 命中盒 = 垂直线 ±40px 厚 16（CanHitWithOwnBody :14693-14701，
    // 非通用 16×16 盒——巨剑气横扫判定）
    const dragonLine = this.projId === 684;
    const dSpd = Math.hypot(this.vx, this.vy) || 1;
    const dPerpX = dragonLine ? -this.vy / dSpd : 0;
    const dPerpY = dragonLine ? this.vx / dSpd : 0;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
      if (e.dead) continue;
      const hitBox = !dragonLine
        ? (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)
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
        // 502 喵刀弹：localNPCHitCooldown=10t 同敌再命中（穿透弹 hitSet 是永久免疫，
        // 502 是"同一敌 10t 冷却后可再咬"——SetDefaults :5466-5468）
        if (this.projId === 502) {
          const cd = this.meowHitCd.get(e.id) ?? 0;
          if (cd > 0) continue;
          this.meowHitCd.set(e.id, 10);
        } else if (this.hitSet.has(e.id)) continue; // 穿透弹已命中过此敌
        // ★鞭 tag（WhipTagEffect.CanRunHitEffects :73-84：MinionShot/SentryShot 弹幕吃
        //   tag——随从/哨兵射出的箭 whipTagShot 置标时走 resolveWhipTagHit 统一结算：
        //   ModifyTaggedHit tag 加伤+TagCrit 暴击（WhipTagEffect.cs:58-70）、OnTaggedHit
        //   （黑收成 916）、proc 窗口首跳（TagEffectState.cs:216-243）。随从弹无基础
        //   暴击（原版 summon 系 crit 仅来自 TagCrit）——4% 基础暴击只留给玩家远程弹）
        let dmg = this.damage;
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
        // 命中 debuff（StatusNPC:10555 表驱动——火枪弹 2 33% OnFire 180t 等,按型号掷骰）
        applyProjStatus(this.projId, e as unknown as Record<string, number>);
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
        playEnemyHitSound(game, e);
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.settlePen, crit, this.pierceInit, true);
        game.addDamageNumber(this.x, this.y, Math.round(dmg), crit, crit ? '#FF8040' : '#FFD060');
        this.hitSet.add(e.id);
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
        if (--this.pierce <= 0) { this.killNow(game); return; }
      }
    }
    // 城镇 NPC 受击(原版 Projectile.Damage 对 friendly NPC 同样生效——杀裁缝师
    // 召骷髅王即此链);穿透/销毁语义与敌怪一致
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2)
      && --this.pierce <= 0) { this.killNow(game); return; }
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
    if (this.vy > 3 && !solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) {
      this.y -= this.vy;
      this.vy *= -0.9;
      bounced = true;
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
