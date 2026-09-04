// SW-U1 2026-09-04：Skeletron Prime 炮弹 102 专属实体（vanilla 名 BombSkeletronPrime,
//  Terraria.ID/ProjectileID.cs:656——仓内旧 "DD2GoblinBomb" 标注系命名串扰,681 才是
//  DD2GoblinBomb）。SW-B1 备案（"有弹无爆"）清偿：炮臂发射点 bossAI.ts 原经 shoot()→
//  Arrow 载体直线飞行（无重力/无引信/无 Kill 爆）,本件退役该载体（SW-Q1 DD2GoblinBomb
//  专属实体同构先例）。
//  全链标杆 Terarria1457：
//  · SetDefaults P.cs:1898-1903——22×22 / aiStyle 16 / hostile / penetrate −1；
//    timeLeft 缺省 3600（:789 SetDefaults 字段复位;NewProjectile 后置表 :10971-11090
//    无 102 行）。
//  · AI_016_Bombs P.cs:47763-48518（逐拍序）：平台/花盆箱中心格 Kill（:47786-47800,
//    tile.active() && (TileID.Sets.Platforms{19,427,435-439} || 380=PlanterBox
//    TileID.cs:1197;SW-X1 2026-09-04 M-2:判据按 vanilla sheet 集直查+裸 active 位,
//    非 TileStore.isPlatform 可站面——致动平台仍杀/矿车轨 239 与家具族不杀））→
//    引信嘶声循环（:47780 IsABombWithFuse[102]=true,
//    ProjectileID.cs:277;Kill :71796-71798 Stop）→ 102 专支（:47993-48010：vy>10
//    终端钳/出手音 Item10 一次（soundDelay 门）/2 帧动画 4t 一帧/落地引信钳 3）→
//    timeLeft≤3 Kill（:48031-48037）→ damage=0 每拍复写（:48048-48051,102 不在
//    豁免表——在飞接触 Damage_EVP :14851 `damage <= 0` 早退 = 零伤）→ 引信烟尘
//    31+6 双尘 50%/t（:48285-48322 通支,num30=6——水样分档仅 903 族）→ 重力门
//    ai[0]>5（:48332/:48377,102 不在第一析取支名单 → 第二支 ai[0]>5）→ 滚转
//    vx×0.1（:48404,102 不在滚转排除表）。
//  · 撞块 P.cs:19867-19900（aiStyle 16 支）：X 反弹 ×−0.4（:19874-19876）;Y 反弹被
//    `type != 102` 排除（:19882）= 落地驻停（次拍 vy==0 → 落地引信钳 3 → 同拍 Kill）。
//  · Kill P.cs:71752（aiStyle16 支 :71783-71805）：PrepareBombToBlow :47688-47693——
//    102 → tileCollide=false / Resize(128,128) / damage=40 / kb=8;SelfHurtPlayers
//    不跑（:71787 `flag4 = friendly && !npcProj && !RocketsSkip…` hostile 恒假）;
//    Damage()#1（:71799）→ Damage_EVP（damage=40 × 128² 盒）= 对玩家唯一伤害投递面
//    （在飞接触恒 0 伤,Kill 爆才是伤害——SW-B1 "弹 102 伤 0 威慑"旧注只对在飞段成立）;
//    Kill_Bombs_DoUsualKillCode :80070-80115 通支视觉（Item14/烟 31×20/火 6 对×10/
//    gore 61-63×4,本仓 = explodeAt 通支视觉）+ 102 专支二次 Resize(128)×damage 40×
//    Damage（:80108-80114——同参重入被免疫帧挡,单结算同效,Arrow.rocketExplode :3570
//    单结先例）;Kill_ExplodeTiles :79027-79035——`102 && getGoodWorld &&
//    !tenthAnniversaryWorld` → r4 炸地形（center2 = position = 弹心−11,:79072,
//    102 不在 Center 系表;非 FTW 不入闸门表 = 零地形纯视觉爆）。
//  对玩家伤害经 projTargets.hitPlayer（Damage_EVP 全链：DamageVar/banner/cold/
//  hostileDamageScaling/×2 内聚,projTargets.ts:582-588）;对 NPC 零伤（Damage_PVE_
//  Inner :12628 friendly 门,hostile 仅穿 friendly&&!dontTakeDamageFromHostiles
//  城镇 NPC 半边——本仓 explodeAt face 无该半边,零伤侧保守不近似,债已备案）。
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { moveAndCollide } from '../physics/TileCollision';
import { hitPlayer } from './projTargets';
import { projFrameImg } from './Arrow';

/** Kill_ExplodeTiles :79027-79035 闸门纯函数（SW-B1 注四象限面）：`type == 102 &&
 *  Main.getGoodWorld && !Main.tenthAnniversaryWorld` 才入爆炸表,半径 num6=4
 *  （:79031-79034 `if (type == 102) num6 = 4`）;其余三象限 = 不入表 = 零地形。 */
export function primeBombTerrainRadius(getGoodWorld: boolean, tenthAnniversary: boolean): number {
  return getGoodWorld && !tenthAnniversary ? 4 : 0;
}

/** :47996-47998 专支终端钳（AI 位,重力加算前——位移拍峰值 vy≤10.2,次拍回钳）。 */
export function primeBombFallClamp(vy: number): number {
  return vy > 10 ? 10 : vy;
}

/** SW-X1 2026-09-04（M-2）：:47786-47800 中心格 Kill 判据集 = TileID.Sets.Platforms
 *  （TileID.cs:243 `Factory.CreateBoolSet(19, 427, 435, 436, 437, 438, 439)`）∪
 *  {380=PlanterBox TileID.cs:1197}。★按 vanilla sheet id 过滤本仓 tile 表
 *  （仓 id≠原版 id,映射同 TileStore.isPlatform 的 sheet 通道——239 矿车轨可站但
 *  不入原版 Platforms 集）。★非 TileStore.isPlatform——后者是"可站面"查询
 *  （家具族 frameY==0（工作台/桌/铁砧/书架/钢琴等）也在内,且对已致动平台返
 *  false）≠ 原版本判据:裸 active() 位（致动平台仍杀,TileStore.hasTile 即该位）。
 *  仓内同值集合先例：VanillaFraming.ts:93 SETS_PLATFORMS / FinalCleanupPass.ts:214 /
 *  WldImport.ts:435。 */
const PRIME_BOMB_PLATFORM_IDS = new Set<number>(
  TILE_DEFS.flatMap((d, i) => {
    const s = d?.vanilla?.sheet;
    return s !== undefined && (s === 19 || s === 380 || s === 427 || (s >= 435 && s <= 439)) ? [i] : [];
  }),
);

/** :48332-48394 重力门步进纯函数。ai[0] 每拍 +1（:48332）;门 `ai[0] > 5f`
 *  （:48377 第二析取支——102 不在第一支名单）;开门拍 ai[0] 钳 10（:48379）,
 *  落地帧（vy==0&&vx≠0）vx×0.97、|vx|<0.01 归零（:48380-48384,原版唯一摩擦点）,
 *  再 vy+=0.2（:48394,无终端钳——SW-N1 同案）。 */
export function primeBombGravityStep(ai0: number, vx: number, vy: number): { ai0: number; vx: number; vy: number } {
  const n = ai0 + 1;
  if (n <= 5) return { ai0: n, vx, vy };
  let nvx = vx;
  if (vy === 0 && vx !== 0) {
    nvx = vx * 0.97;
    if (nvx > -0.01 && nvx < 0.01) nvx = 0;
  }
  return { ai0: 10, vx: nvx, vy: vy + 0.2 };
}

/** :48004-48006 落地引信钳（AI 位,timeLeft 视角）：vy==0 且余量 >3 → 钳 3,
 *  随后 :48031 `timeLeft <= 3` 同拍 Kill = 落地即爆。 */
export function primeBombLandingFuse(fuse: number, vy: number): number {
  return vy === 0 && fuse > 3 ? 3 : fuse;
}

export class BombSkeletronPrimeProj extends Entity {
  w = 22; h = 22;                       // SetDefaults :1898-1899
  vx: number;
  vy: number;
  /** AI_016 :48048 每拍复写 0 + NPC 发射面 num562/num569=0（NPC.cs:28843/:28924）——
   *  在飞接触 Damage_EVP :14851 早退 = 零伤;Kill 爆伤 40 硬编码于 PrepareBombToBlow */
  readonly damage = 0;
  readonly projId = 102;
  dead = false;
  /** 引信（vanilla timeLeft）：SetDefaults :789 缺省 3600,无 per-Type 行 */
  private fuse = 3600;
  private ai0 = 0;
  private rot = 0;
  /** 出手音门（vanilla soundDelay :47999——0 → 播一次置 −1） */
  private soundDelay = 0;
  /** 2 帧动画态（:48005-48009：counter 4t 一帧,回绕 2 帧;projFrames[102]=2,
   *  Main.cs:8720——贴图 22×48 竖条 2 帧 24px,帧高切片） */
  frame = 0;
  private frameCounter = 0;
  /** 引信嘶声循环句柄（:47780 PlayTrackedLoopedSound;Kill :71796-71798 Stop） */
  private fuseSnd: { stop(): void; setPos(px: number, py: number): void } | null | undefined;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;   // 入参 = 出膛弹心像素
    this.vx = vx; this.vy = vy;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.dead) return;   // ★Kill 后 active=false 跳过 Update（:16780,红蓝 orphan-b2 同款防重入）
    const st = game.world.store;
    // 出界杀（:16793-16802 中心出世界界 → active=false 静默消亡,无爆尘无 Kill 爆）
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
      this.dead = true;
      this.destroy();
      return;
    }
    // ---- AI_016_Bombs（vanilla 逐拍序）----
    // SW-X1 2026-09-04（M-2）：:47786-47800 中心格 Kill 判据原版字面
    //  `tile.active() && (TileID.Sets.Platforms[tile.type] || tile.type == 380)`——
    //  旧 st.isPlatform() 是"可站面"查询（家具/矿车轨 239 在内、致动位排除）≠本判据。
    const tx102 = Math.floor(this.cx / TILE), ty102 = Math.floor(this.cy / TILE);
    if (st.hasTile(tx102, ty102) && PRIME_BOMB_PLATFORM_IDS.has(st.get(tx102, ty102))) {
      this.explode(game);
      return;
    }
    // :47780 引信嘶声（IsABombWithFuse[102]=true,timeLeft>1）
    if (this.fuse > 1) {
      if (!this.fuseSnd) this.fuseSnd = game.startTrackedLoop?.('bombFuse', 0.2, this.cx, this.cy) ?? null;
      else this.fuseSnd.setPos(this.cx, this.cy);
    }
    // :47993-48010 102 专支：终端钳 → 出手音 → 帧动画 → 落地引信钳
    this.vy = primeBombFallClamp(this.vy);
    if (this.soundDelay === 0) {
      this.soundDelay = -1;
      game.playSfxWav?.('Item_10', 1, this.cx, this.cy);        // SoundID.Item10 = legacy(2,10) SoundID.cs:434
    }
    this.frameCounter++;
    if (this.frameCounter > 3) { this.frame++; this.frameCounter = 0; }
    if (this.frame > 1) this.frame = 0;
    this.fuse = primeBombLandingFuse(this.fuse, this.vy);
    // :48031-48037 Kill 门（timeLeft≤3；落地钳 3 → 同拍爆 = 原版"落地即爆"节奏;
    //  永不落地侧 3600t 兜底同门）
    if (this.fuse <= 3) {
      this.explode(game);
      return;
    }
    // SW-X1 2026-09-04（H-1）：timeLeft-- 每拍递减（Update :17305-17311 `timeLeft--;
    //  if (timeLeft <= 0) Kill()`,位=AI(:16880) 后/HandleMovement 前——本仓 AI 体
    //  Kill 门后即原版相位）。曾整缺 → 纯空中 3600t 兜底 Kill 永不到达,弹永不爆。
    this.fuse--;
    // :48048-48051 damage=0——ctor readonly 0 恒成立（在飞接触零伤,注释见字段）
    // :48285-48322 引信烟尘通支：掷 Next(2)==0 → 双尘齐出（31 小烟 + 主尘 num30=6）,
    //  出生点 = Center+(0,−h/2[−6]).RotBy(rot)×1.1（引信尖,随滚转自转）,scale/fadeIn
    //  按原版绝对赋值（NewDust 抖动被覆写——与 GrenadeProj.fuseSmokeGeneral 同构）
    if (Math.random() < 0.5) {
      const sin = Math.sin(this.rot), cos = Math.cos(this.rot);
      const d31 = game.spawnDust?.(this.x, this.y, this.w, this.h, 31, 0, 0, 100, null, 1);
      if (d31) {
        d31.scale = 0.1 + Math.floor(Math.random() * 5) * 0.1;      // Next(5)×0.1
        d31.fadeIn = 1.5 + Math.floor(Math.random() * 5) * 0.1;
        d31.noGravity = true;
        d31.x = this.cx + sin * (this.h / 2) * 1.1;
        d31.y = this.cy - cos * (this.h / 2) * 1.1;
      }
      const d6 = game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 0, 0, 100, null, 1);
      if (d6) {
        d6.scale = 1 + Math.floor(Math.random() * 5) * 0.1;
        d6.noGravity = true;
        d6.x = this.cx + sin * (this.h / 2 + 6) * 1.1;
        d6.y = this.cy - cos * (this.h / 2 + 6) * 1.1;
      }
    }
    // :48332/:48377-48394 重力门 + :48404 滚转
    const g = primeBombGravityStep(this.ai0, this.vx, this.vy);
    this.ai0 = g.ai0; this.vx = g.vx; this.vy = g.vy;
    this.rot += this.vx * 0.1;
    // ---- 位移 + 撞块（Update aiStyle16 支 :19867-19900;moveAndCollide 正典管线,
    //      GrenadeProj 投掷支同款;dropThrough=true = 原版弹不拦平台,平台面 Kill 走上支）----
    const lastVx = this.vx, lastVy = this.vy;
    const bodyY0 = this.y;   // SW-X1：本拍积分前 y（残差口径,WeaponProj SW-N1/W1 同构）
    // SW-AQ1 2026-09-05：oldPosition 上报（Update :17118 AI 后/位移前置位）——
    //  102 走 objType 4 扫描（:19978）,新旧位判定（Collision.cs:3346-3353/:3356）消费
    this.oldX = this.x; this.oldY = this.y;
    const body = {
      x: this.x, y: this.y, w: this.w, h: this.h,
      vx: this.vx, vy: this.vy,
      onGround: false, hitWall: false, hitHead: false, collideY: false,
      tileCollide: true, dropThrough: true,
    };
    moveAndCollide(body, game.world, this.vx, this.vy);
    // SW-X1 2026-09-04（H-1）：碰撞结果回写——原版 :17718
    //  `velocity = Collision.TileCollision(...)` 把结果赋回 velocity,次拍 AI 读之。
    //  曾只回写 x/y 不回写 vx/vy → this.vy 恒保 AI 拍前值 → primeBombLandingFuse
    //  （vy==0 门 :48004-48006）永不触发 + timeLeft 无递减 → 引信恒 3600 落地永不爆。
    //  X 支（:19872-19876）：TileCollision 改 X（撞墙）→ vx = lastVx × -0.4（102 无
    //  29 的 ×0.8 二次衰减）;未改 → 保留管线终值。
    //  Y 支（:19877-19886）：反弹支被 `type != 102` 排除 → 保留 TileCollision 钳后
    //  速度 = 残差口径 body.y − bodyY0（本拍实际位移;SW-N1 论证：落地返「到贴面距」,
    //  残差存活到下拍 → 下拍 AI vy==0 落地引信钳相位与原版一致;body.vy 恒 0 会吞
    //  残差把钳位提前 1 拍）。勿补 bounce。
    if (body.hitWall) this.vx = lastVx * -0.4;
    else this.vx = body.vx;
    if (body.hitHead || body.onGround) this.vy = body.y - bodyY0;
    else this.vy = body.vy;
    this.x = body.x; this.y = body.y;
  }

  destroy(): void {
    this.fuseSnd?.stop();               // Kill :71796-71798 GetActiveSound?.Stop()
    this.fuseSnd = null;
  }

  /** Kill P.cs:71752（aiStyle16 支）+ Kill_Bombs_DoUsualKillCode :80070-80115 +
   *  Kill_ExplodeTiles :79027-79035。伤害/视觉/地形序 = 原版：Damage()#1（128² 盒×
   *  damage 40,PrepareBombToBlow :47688-47693）→ 视觉 + 二次 Damage（免疫帧挡,
   *  单结算同效）→ 地形爆（FTW 闸门）。
   *  SW-X1 2026-09-04（L-4④ 核）：onProjectileDeath 对 102 无 Item_10 支
   *  （Game.BULLET_KILL_SFX = Kill :77650 列表逐字,102 不在）→ 出手音 :47999
   *  单口不叠播,无需修。 */
  private explode(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
    // projId 供 hitPlayer 的 SkipDamage_EVP/NoCheese 表读面（102 两表皆不在=常规 General 桶）
    const blast: { x: number; y: number; w: number; h: number; projId?: number } = {
      x: this.cx - 64, y: this.cy - 64, w: 128, h: 128, projId: this.projId,
    };
    hitPlayer(blast, game, 40);
    this.destroy();
    const radius = primeBombTerrainRadius(
      !!game.world.seedFlags?.getGoodWorld, !!game.world.seedFlags?.tenthAnniversary);
    // 非入表象限 radius=0/destroyTiles=false → explodeAt 零地形,通支视觉照跑
    // （烟 31×20/火 6 对×10/gore 61-63×4/Item14 = :80070-80115 小族,projId 102 在列）
    // SW-AC1 2026-09-04：尾参 kbDir=Kill 态弹末 vx 符号——Projectile.direction
    //  （Update :17121-17132 自动面 `velocity.X < 0 → -1 else 1`,102 aiStyle16
    //  在自动面,落地/炮臂轨迹不改 X 符号;0 落 else 档 +1）
    game.explodePrimeBomb102?.(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE),
      this.cx, this.cy, radius, radius > 0, this.vx < 0 ? -1 : 1);
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projFrameImg(this.projId, this.frame);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);                    // :48404 rotation += velocity.X * 0.1
    ctx.imageSmoothingEnabled = false;
    if (img) {
      // GetAlpha :81007 (200,200,200,25) 加算族（Arrow.ts ADDITIVE_GLOW_PROJS 102 同面）
      // ——XNA 预乘 A=25 只衰背景,RGB 全额加算 = 发光观感;canvas 'lighter' 复刻
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // 贴图未就绪兜底（node 测试/图未加载;帧 22×24）
      ctx.fillStyle = '#404040';
      ctx.fillRect(-11, -12, 22, 24);
    }
    ctx.restore();
    void cam;
  }
}
