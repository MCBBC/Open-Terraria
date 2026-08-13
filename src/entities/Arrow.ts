// 箭矢/通用直飞·抛物线投射物（原版 Projectile type 1/2、aiStyle 1/2 主干，Projectile.cs:546-566 + AI_001/AI_002）：
// 重力 0.3/tick（aiStyle1/2 通用常量；直飞弹传 0）、timeLeft 1200、旋转 atan2(vy,vx)+π/2（AI_001 尾部 L54877）、
// 原版贴图 Projectile_N.png；命中敌人伤害/击退/暴击（穿透>1 时同敌免疫防连击）；
// 命中 tileCut 砍草/碎罐（Projectile.CutTiles）；命中实心块 1/3 概率回收掉落。
import { Entity } from './Entity';
import { applyProjStatus, applyFrostBurn } from './projStatus';
import { hitCritters, hitPlayer, hitTownNpcs, playEnemyHitSound, statusPlayer, tryReflectProjectile } from './projTargets';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { canHit } from '../physics/LineOfSight';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 原版投射物贴图懒加载（Projectile_1.png = 木箭、Projectile_2.png = 燃烧箭，泛用所有 id） */
const spriteCache = new Map<number, HTMLImageElement>();
export function projSprite(projId: number): HTMLImageElement | null {
  let img = spriteCache.get(projId);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  img = new Image();
  img.src = `sprites/vanilla/Projectile_${projId}.png`;
  spriteCache.set(projId, img);
  return img;
}

/** Main.projFrames（Main.cs:8392 起全 275 条非 1 帧赋值，tools 内联提取）：
 *  未列入的恒 1 帧。投射物贴图是【竖向多帧行】——帧高 = 图高/帧数，
 *  整图绘制会把多帧压成胶片条（史莱姆随从 266 曾 12 帧压成一坨） */
import projFramesJson from '../data/vanilla-projframes.json';
import { projectileData } from '../data/vanillaProjectiles';
const PROJ_FRAMES = projFramesJson as Record<string, number>;
export function projFrameCount(projId: number): number {
  return PROJ_FRAMES[String(projId)] ?? 1;
}

/** 单帧裁切缓存（id+帧号 → canvas），多帧行按帧高切片 */
const frameCache = new Map<string, HTMLCanvasElement>();
export function projFrameImg(projId: number, frameIdx: number): HTMLCanvasElement | null {
  const img = projSprite(projId);
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  const frames = projFrameCount(projId);
  const idx = Math.max(0, Math.min(frames - 1, frameIdx));
  const fh = img.naturalHeight / frames;
  if (!Number.isFinite(fh) || fh < 1) return null;
  const key = `${projId}|${idx}`;
  let c = frameCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = Math.round(fh);
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, Math.round(idx * fh), img.naturalWidth, Math.round(fh), 0, 0, c.width, c.height);
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
  /** 延迟重力（世纪之花种子 275/276，Projectile.cs:54318-54329）：飞行满
   *  gravDelay tick 后才开始下坠（重力 0.025，非 aiStyle1 默认 0.3）。 */
  gravDelay?: number;
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
  /** 泰拉刃光束 985（aiStyle 191）：减速 ×0.94(>8) / 近墙阻尼 / 25t 消亡 /
   *  全程淡出 / 绿光——AI_191_TrueNightsEdge 985 分支（Projectile.cs:39241+） */
  terra?: boolean;
  /** 星怒剑 503（aiStyle 5 :22139-22157）：targetY=目标线（鼠标 Y 与玩家
   *  cy−200 取小）；线上方穿墙/alpha 渐显钳 150，线下开始撞块 */
  star?: { targetY: number };
}

/** SetDefaults 提取的 extraUpdates 表（Projectile.cs 各 type 段，0=缺省）：
 *  与生命/穿透同属【按弹型】属性，故在 Arrow 内按 projId 缺省注入而非每个
 *  spawn 点手写——83 眼激光（WoF 之眼 + 双子雷神之眼）共用同一 SetDefaults */
const PROJ_EXTRA_UPDATES: Record<number, number> = {
  83: 2, // Projectile.cs:1369（width 4/aiStyle 1/penetrate 3/extraUpdates 2/scale 1.7）
};

export class Arrow extends Entity {
  w = 10; h = 10; // 原版 SetDefaults type 1：width/height = 10
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  /** 原版投射物类型（1=木箭 2=燃烧箭，PickAmmo projToShoot = ammo.shoot） */
  projId: number;
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
  /** 护甲穿透（N:81913 减防语义——spawn 注入，命中时传 hurt 第 5 参） */
  armorPen = 0;
  /** 星云套 booster 回调（StrikeNPC :12892-12905：魔法弹命中 → Game 判定掉落） */
  nebulaCb: (() => void) | null = null;
  /** aiStyle 14 弹跳：撞块反弹不消亡 */
  bounce: boolean;
  /** 冰霜盔甲引擎资格（ranged 弹 true;魔法/召唤弹 false——原版 melee||ranged 门） */
  frostEligible = false;
  /** aiStyle 14 荆棘球档（277）：撞块按 Projectile.cs:18306-18314 反弹 */
  thornBounce: boolean;
  /** 延迟重力（275/276）：age 超过此值才施加 grav；-1=不延迟 */
  gravDelay: number;
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
  /** 已存活 tick（延迟重力/追踪门用） */
  age = 0;
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
  /** localAI[0] 计时（25t 消亡 + 淡出分母） */
  terraT = 0;
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
    this.grav = opts?.grav ?? 0.3;
    this.life = opts?.life ?? 1200;
    this.pierce = opts?.pierce ?? 1;
    this.pierceInit = this.pierce;
    this.hostile = opts?.hostile ?? false;
    this.bounce = opts?.bounce ?? false;
    this.thornBounce = opts?.thornBounce ?? false;
    this.gravDelay = opts?.gravDelay ?? -1;
    this.homing = opts?.homing ?? null;
    this.extraUpdates = opts?.extraUpdates ?? PROJ_EXTRA_UPDATES[projId] ?? 0;
    this.drag = opts?.drag ?? 1;
    this.maxFall = opts?.maxFall ?? 16;
    this.tumble = opts?.tumble ?? false;
    this.tumblePoseLock = opts?.tumblePoseLock ?? false;
    this.terra = opts?.terra ?? false;
    if (opts?.star) this.starY = opts.star.targetY;
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
      if (!img || !img.complete || img.naturalWidth === 0) return;
      const fw = img.naturalWidth, fh = img.naturalHeight / 4;
      const fade = Math.max(0, 1 - this.terraT / 25);
      const num = Math.min(1, this.terraT / 30);            // Remap(t,0,30,0,1)
      const spread = 1 - num;
      const rot = Math.atan2(this.vy, this.vx);
      const layer = (sy: number, a: number, angOff: number, frame: number, flipV: boolean) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a * fade));
        ctx.translate(this.cx, this.cy);
        ctx.rotate(rot + angOff);
        if (flipV) ctx.scale(1, -1);
        ctx.drawImage(img, 0, frame * fh, fw, fh, -fw / 2 * sy, -fh / 2 * sy, fw * sy, fh * sy);
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
      if (!img || !img.complete || img.naturalWidth === 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.starAlpha / 255));
      ctx.translate(this.cx, this.cy);
      ctx.rotate(Math.atan2(this.vy, this.vx) - Math.PI / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -img.naturalWidth / 2, -70, img.naturalWidth, img.naturalHeight);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    // 翻滚态用累积角（aiStyle 2）；48/54/93/520/599 平飞期姿态锁定 atan2
    const tumbling = this.tumble && !(this.tumblePoseLock && this.age <= this.gravDelay);
    const ang = tumbling ? this.tumbleRot : Math.atan2(this.vy, this.vx);
    const img = projSprite(this.projId);
    // 喵刀弹 502 彩虹拖尾（Main.cs:32495-32513）：Projectile_250.png（14×32）沿
    // oldPos 逐段——旋转=段向-π/2、纵向拉伸=段长/32、alpha=127/255×(1-i/N)，
    // 画在【本体之前】（原版在本体绘制后叠画，此处先画拖尾再本体等效）
    if (this.projId === 502 && this.meowTrail.length >= 4) {
      const streak = projSprite(250);
      if (streak && streak.complete && streak.naturalWidth > 0) {
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
          ctx.drawImage(streak, -streak.naturalWidth / 2, 0,
            streak.naturalWidth, Math.max(1, segLen));
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(ang + Math.PI / 2); // 原版贴图纵向：rotation = atan2+π/2（AI_001 L54877）
    // 502 朝向（:22659-22665）：spriteDirection=sign(vx)——贴图在旋转坐标系内水平镜像
    if (this.projId === 502 && this.vx < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -this.w / 2, -this.w / 2, this.w, this.w * (img.naturalHeight / img.naturalWidth));
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
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
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
    // aiStyle 1/2 通用重力（原版箭 0.3/tick 抛物线；直飞弹 grav=0）；
    // 275/276 延迟重力（Projectile.cs:54318-54329：35t 后 g=0.025）；
    // aiStyle 2 投掷族（Projectile.cs:21955-21977 默认档）：20t 平飞后
    // vy+=0.4、vx×=0.97，终端 32
    if (this.grav !== 0 && (this.gravDelay < 0 || this.age > this.gravDelay)) {
      this.vy = Math.min(this.vy + this.grav, this.maxFall);
      if (this.drag !== 1) this.vx *= this.drag;
    }
    // 翻滚（aiStyle 2 刀族 :21508，自出生每 tick 累加）；48/54/93/520/599 在
    // 平飞期由 draw 侧姿态锁定覆盖（:21971-21972）
    if (this.tumble) {
      this.tumbleRot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * (this.vx >= 0 ? 1 : -1);
    }
    // 泰拉刃光束 985（AI_191 :39248-39263 + 985 减速段 :39340-39377）：
    // 25t 消亡（ai[1]=0 → num4=25）；>8 速 ×0.94 减速；前方 110px 扇形探视线
    // 失败 → localAI[1]=1（×0.8 仍 >8 时 / ×0.88 双阻尼）；淡出 + 绿光 + 尘
    if (this.terra) {
      this.terraT++;
      if (this.terraT >= 25) { this.killNow(game); return; }
      const stT = world.store;
      this.lightRGB = [0.25, 0.86, 0.38];    // Color(64,220,96)（:39382）
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
      const above = this.cy < this.starY;
      this.starCollide = !above;
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
    // 反射后的弹体 friendly 已翻（原版 Damage NPC 需 friendly 门禁，小动物也是 NPC）
    // ——不再伤小动物/敌怪，只走上方 hitPlayer 回打发射者
    if (this.reflected) return;
    // 小动物:一击致死并消耗弹体(原版小动物是 NPC;近战挥砍同语义)
    if (hitCritters(this, game)) { this.killNow(game); return; }
    // 命中敌人（原版 penetrate：箭 1 射中即停；手里剑 4 穿 4 敌，同敌免疫防连击）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
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
        // 冰霜盔甲引擎(ranged 门,:93712;魔法/召唤弹 frostEligible=false)
        if (this.frostEligible) {
          applyFrostBurn((game.player as unknown as { equipStats: { frostBurn: boolean } }).equipStats.frostBurn,
            e as unknown as Record<string, number>);
        }
        if (this.nebulaCb) this.nebulaCb(); // 星云 booster（:12892-12905，伤害>0 门已过）
        playEnemyHitSound(game, e);
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit, this.pierceInit, true);
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
}
