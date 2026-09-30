// 手持风筝弹幕（aiStyle 160，24 型 766-853）——Projectile.AI_160_Kites（1457
// Projectile.cs:49303-49347）+ KiteLogic（:49349-49575）1:1。★BJ413 2026-09-30
// 「放风筝无效」实报：风筝物品此前 itemcombat 只落 noUseGraphic 残键（J 刀 Helper
// 体面登记债）→ 使用链走通用挥摆兜底=零效果；本刀出膛面全链实装：
//   · 出膛 = Game case 'kite'（ItemCheck_Shoot :47463 通用尾支——pointPosition=
//     玩家中心、velocity=朝鼠标×shootSpeed 8、damage 0；
//     Projectile.DefaultToKite P.cs:10746-10752 4×4/penetrate −1/extraUpdates 60）。
//   · extraUpdates=60 稳态语义（P.cs:16780 while 循环 + KiteLogic :49442
//     `if (numUpdates == 1) extraUpdates = 0` 首拍后字段归零）：每 tick 全物理恰一次
//     ——本仓 60Hz fixedUpdate 逐 tick 单步 = 稳态同构（首拍 61 子步仅重复
//     收放线门外簿记,无观测面,登记备案）。
//   · 风场门 = WorldGen.InAPlaceWithWind（Mounts 单源;WorldGen.cs:88141）×
//     |Main.WindForVisuals| >= MinimumWindStrengthToFlyKite 0.2（P.cs:518）
//     → 升力 num7 = GetLerpValue(0.2,0.5,|wind|)×0.5;无风=下垂态（localAI1→1）。
//   · 收放线 = ai[0]∈[4,500]（KiteLogic :45816-45837）：channel（右键电平
//     controlUseTile,Player.cs:43123 `flag5 = controlUseTile` → channel）−5/tick、
//     controlUseItem && itemAnimation==0 +5/tick;收到最短 4 → Kill（:45938-45944）。
//   · Kill 门（:49310-49326）：CCed / 手持物品 shoot≠type / pulley / dead /
//     距玩家 >2000;张力段 CanReelThroughBlocks=true → Center 直迁（:45916-45921,
//     非锚桩版的加速度档）。
//   · buff 383 腾灵（:49340-49342）：localAI[1]<1（非下垂）且风筝底 < 玩家顶 →
//     ApplyBuffTo(383, 12)（12t=0.2s,消费面=Buffs.KiteBuff 移速+15%/镐速−10%）。
//   · 绘制 = Renderer.drawFlyingKite ← Main.DrawKite（Main.cs:37763-38220,与锚桩
//     drawLeashedKite 共用全表）。线长变化音 SoundID.Item192（:49385-49393,
//     pitch=kiteSoundPitch 公式）。
//   · 未建模（登记）：①timeLeft 书签（AI 头 60/KiteLogic 尾 2 逐拍刷新=永不超时,
//     单机零观测面）②player.heldProj 写位（本仓弹幕 drawLayer 单源
//     PROJ_DRAW_OVER_PLAYERS,风筝 0 层族天然玩家后）③联机 ai[0] netUpdate 面
//     （风筝 24 型不在 vanilla-projectiles 同步白名单,单机域）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { KITE_TRAIL_LENGTH } from './LeashedCritter';
import { getLerpValue } from '../stats/ScaleStats';

/** MinimumWindStrengthToFlyKite（Projectile.cs:518 `public const float` 原值 0.2f） */
export const KITE_MIN_WIND = 0.2;

/** 收放线界（KiteLogic :45813-45815：num=4 最短=Kill 门 / num2=500 最长 / num3=250 初值） */
export const KITE_STRING_MIN = 4;
export const KITE_STRING_MAX = 500;
export const KITE_STRING_INIT = 250;

/** 玩家侧环境/输入闭包（Game case 'kite' 装配;测试以常量闭包直喂） */
export interface KiteCtx {
  /** 右键电平（controlUseTile——channel 收线;Player.cs:43123） */
  channel(): boolean;
  /** 左键电平 && itemAnimation==0（controlUseItem 放线;KiteLogic :45828-45830） */
  letOut(): boolean;
  /** 手持物品 shoot（≠projId → Kill;:49313-49315） */
  heldShoot(): number;
  /** Player.CCed（Player.cs:3361 frozen/webbed/stoned 族） */
  cced(): boolean;
  /** Player.noItems（:49312 与 CCed 同一 if 臂）。★Q4 刀 2026-09-30 定谳勘误：
   *  noItems 语义=Cursed buff 23（Player.cs:11821 noItems=true+cursed=true）+钻头
   *  坐骑 MountID.Drill=8（:53576 ItemCheck_HandleMount）——【非】PvP 观战/死者
   *  （spectating/dead 各自独立字段,:17538 观战门在 PickItemSelectionOverride、
   *  :49321 dead 是本门独立腿;原注「PvP 观战禁用面」系误标,本刀勘误）。 */
  noItems(): boolean;
  /** Player.pulley 绳上悬挂（:49317-49319） */
  pulley(): boolean;
  /** Player.dead（:49321-49323） */
  dead(): boolean;
  /** 手臂锚点（GetArmPosition :51208 等价——repo 单源=yoyoStringAnchor :9377） */
  armPos(): { x: number; y: number };
  /** 玩家朝向（:46035 spriteDirection = player.direction） */
  playerDir(): number;
  /** 玩家转向（:45947-45952 |dx|>|dy|/2 → ChangeDir） */
  faceDir(d: number): void;
  /** buff 383 腾灵 12t（:49340-49342 ApplyBuffTo——Buffs.KiteBuff apply 0.2s） */
  applyKiteBuff(): void;
  /** 玩家盒顶 Y（player.Top.Y——buff 门 :49341） */
  playerTopY(): number;
  /** 玩家盒心 X/Y（>2000 距离 Kill 门 :49325-49327） */
  playerCenter(): { x: number; y: number };
  /** Main.WindForVisuals ≙ weather.windSpeedCurrent（KiteFlyingInfo.WindInWorld） */
  wind(): number;
  /** Main.cloudAlpha（KiteFlyingInfo.CloudAlpha） */
  cloudAlpha(): number;
  /** WorldGen.InAPlaceWithWind(position,width,height)（:49362——Mounts 单源） */
  inWind(): boolean;
  /** SoundID.Item192 线长变化音（:49390-49392;pitch 由实体算好直传） */
  playReelSfx(pitch: number): void;
  /** TileCollision 阻挡探测（盒左上/宽高 → 任一实心格;TileCollision 直移档。
   *  缺省 undefined = 测试/无世界 mock 直移不阻） */
  solidBox?(px: number, py: number, w: number, h: number): boolean;
}

/** 纯函数：帧选择（:45969-46034;单测锚定——与锚桩 selectFrame 同表） */
export function kiteSelectFrame(
  projId: number, speed: number, num7: number, prevFrame: number, frameCounter: number,
): { frame: number; frameCounter: number } {
  switch (projId) {
    case 771: case 822: case 823: case 827: case 830: case 838:
    case 843: case 844: case 845: case 846: case 850: case 852:
      return { frame: 0, frameCounter };
    case 828: case 829:
      return { frame: speed < 6 ? 1 : 0, frameCounter };
    case 826:
      return { frame: 0, frameCounter };   // frame = (int)ai[1]——AI 面无写入恒 0（:49539-49540）
    case 824: case 839: case 840: case 853:
      if (num7 < 0.15) return { frame: 0, frameCounter };
      { const fc = frameCounter + 1;       // Main.rand.Next(4) 抽帧节拍（:49554-49560）
        return fc > (1 - num7) * 10
          ? { frame: Math.floor(Math.random() * 4), frameCounter: 0 }
          : { frame: prevFrame, frameCounter: fc };
      }
    default:                               // 766-770 五色：速度四档
      return { frame: speed < 3 ? 0 : speed < 5 ? 1 : speed < 7 ? 2 : 3, frameCounter };
  }
}

/** 纯函数：升力系数（:49368 GetLerpValue(0.2,0.5,|wind|)×0.5;风场门内才非零） */
export function kiteLift(wind: number): number {
  return getLerpValue(0.2, 0.5, Math.abs(wind), true) * 0.5;
}

/** 纯函数：线长变化音 pitch（:49388 `(len-4)/(500-4)×−0.12+0.06`） */
export function kiteReelPitch(len: number): number {
  return ((len - KITE_STRING_MIN) / (KITE_STRING_MAX - KITE_STRING_MIN)) * -0.12 + 0.06;
}

/** 发射侧在场门（★BJ417 2026-09-30 重定谳——BJ413「原版无单实例门」系漏检）：
 *  ItemID.Sets.HasAProjectileThatHasAUsabilityCheck = 风筝 24 件全集（ItemID.cs:177）
 *  → ItemCheck_CheckCanUse_Inner 尾支（Player.cs:52932-52935）
 *  → ItemCheck_CheckUsabilityOfProjectiles（:52994-53005）逐 active owned 弹
 *  → Projectile.CheckUsability（Projectile.cs:54404-54410）`aiStyle==160 → false`。
 *  语义 = 【任意】aiStyle160 弹在场（owner==whoAmI）→ 风筝物品 TryStartUse 整体
 *  失败=零副作用（不起手动画/不出膛/不消费点击）——非「同型」门：任何一只风筝
 *  在飞时,手持另一型风筝同样被拒（原版单风筝语义）。本仓等价:场上存在活 KiteProj
 *  即拒;netPuppet 为远端傀儡（非 owner 域,同 boomerangBlockedByOwned 口径）不计。 */
export function kiteBlockedByOwnedAirborne(projectiles: readonly unknown[]): boolean {
  for (const e of projectiles) {
    if (e instanceof KiteProj && !e.dead && !e.netPuppet) return true;
  }
  return false;
}

const clampF = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class KiteProj extends Entity {
  w = 4; h = 4;
  projId: number;
  /** drawFlyingKite 消费名（=drawLeashedKite k.projType 同名面） */
  get projType(): number { return this.projId; }
  private ctx: KiteCtx;
  /** ai[0]——线长（收放线块写;初值 0 → 首拍置 250,:45820-45822） */
  ai0 = 0;
  /** localAI[0]——无风下垂累积 0..300（:45871;DrawKite num18 源） */
  projectileLocalAI0 = 0;
  /** localAI[1]——下垂/飘飞插值 0..1（:45969;DrawKite num19 + buff 门 <1） */
  projectileLocalAI1 = 0;
  /** localAI[2]——线长簿记（:45838-45854;变化即播 Item_192） */
  localAI2 = 0;
  soundDelay = 0;
  frame = 0;
  frameCounter = 0;
  rotation = 0;
  spriteDirection = 1;
  /** Main.GlobalTimeWrappedHourly 等价（锚桩 timeCounter 同式 +1/60/tick） */
  timeCounter = 0;
  /** 绘制快照：手臂锚点（KiteLogic anchorPoint——drawFlyingKite 主绳起点） */
  anchorX = 0; anchorY = 0;
  /** 本 tick 风读数快照（drawFlyingKite num17 源——渲染层不回读 weather） */
  windSnapshot = 0;
  /** 联机半包平滑偏移（本域未建模恒 0——drawFlyingKite k.netOffset* 同名面） */
  netOffsetX = 0; netOffsetY = 0;
  /** 拖尾缓存（oldPos/oldRot/oldSpriteDirection——DrawKite 尾段采样;长度=TrailCacheLength） */
  oldPos: Array<{ x: number; y: number }>;
  oldRot: number[];
  oldSpriteDirection: number[];

  constructor(cx: number, cy: number, projId: number, ctx: KiteCtx) {
    super();
    this.projId = projId;
    this.ctx = ctx;
    this.x = cx - this.w / 2;   // 盒心=出膛点（Projectile.cs:10878-10879 NewProjectile 盒心语义）
    this.y = cy - this.h / 2;
    const n = KITE_TRAIL_LENGTH[projId] ?? 10;
    this.oldPos = Array.from({ length: n }, () => ({ x: this.cx, y: this.cy }));
    this.oldRot = new Array<number>(n).fill(0);
    this.oldSpriteDirection = new Array<number>(n).fill(1);
  }

  override fixedUpdate(_dt: number, _game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const ctx = this.ctx;
    this.timeCounter += 1 / 60;
    // ---- AI_160_Kites Kill 门（:49310-49327）----
    // noItems 腿（★Q4 刀 2026-09-30 补齐）：原文 `if (player.CCed || player.noItems)`
    // 同一 if 臂——noItems=Cursed 23+钻头坐骑 8（Game 侧 noItems 闭包承载,语义勘误
    // 见 KiteCtx.noItems 注;原注「PvP 观战禁用面 :49311」系误标已撤）
    let flag = false;
    if (ctx.cced() || ctx.noItems()) flag = true;
    else if (ctx.heldShoot() !== this.projId) flag = true;
    else if (ctx.pulley()) flag = true;
    else if (ctx.dead()) flag = true;
    if (!flag) {
      const pc = ctx.playerCenter();
      flag = Math.hypot(pc.x - this.cx, pc.y - this.cy) > 2000;
    }
    if (flag) { this.dead = true; return; }
    this.kiteLogic();
    // ---- buff 383（:49340-49342;owner==myPlayer 本仓单机恒真）----
    if (this.projectileLocalAI1 < 1 && this.y + this.h < ctx.playerTopY()) ctx.applyKiteBuff();
    this.shiftTrail();
  }

  /** KiteLogic（:49349-49575,稳态 extraUpdates=0 档——首拍 61 子步语义见头注） */
  private kiteLogic(): void {
    const ctx = this.ctx;
    // ---- 收放线块（:45816-45837;owner==myPlayer && extraUpdates==0 恒档）----
    let v = this.ai0 === 0 ? KITE_STRING_INIT : this.ai0;
    if (ctx.channel()) v -= 5;
    if (ctx.letOut()) v += 5;
    this.ai0 = clampF(v, KITE_STRING_MIN, KITE_STRING_MAX);
    // ---- 线长簿记 + Item_192（:45838-45854）----
    if (this.localAI2 === 0) {
      this.localAI2 = this.ai0;
    } else if (this.localAI2 !== this.ai0) {
      this.localAI2 = this.ai0;
      if (this.soundDelay === 0) {
        this.soundDelay = 30;
        ctx.playReelSfx(kiteReelPitch(this.localAI2));
      }
    }
    if (this.soundDelay > 0) this.soundDelay--;
    // ---- 风场门（:45863-45871）----
    const arm = ctx.armPos();
    this.anchorX = arm.x;
    this.anchorY = arm.y;
    const num6 = ctx.inWind() ? ctx.wind() : 0;
    this.windSnapshot = num6;
    const windy = Math.abs(num6) >= KITE_MIN_WIND;
    this.projectileLocalAI0 = clampF(this.projectileLocalAI0 - (windy ? 1 : -1), 0, 300);
    const num7 = kiteLift(num6);
    // ---- 拍动目标（:45873-45885）----
    const cloud = ctx.cloudAlpha();
    let vecX = num6 * 25;
    let vecY = (Math.sin(this.timeCounter) + cloud * 5) * 25;
    if (cloud > 0 && Math.abs(num6) >= cloud / 2 && vecY > 0) vecY *= 1 - Math.abs(num6) * 2;
    const targetX = this.cx + vecX;
    const targetY = this.cy + vecY;
    let vxT = targetX - this.cx, vyT = targetY - this.cy;
    const vl = Math.hypot(vxT, vyT);
    const push = 3 + cloud * 7;
    if (vl > 0) { vxT = (vxT / vl) * push; vyT = (vyT / vl) * push; } else { vxT = 0; vyT = 0; }
    if (num7 === 0) { vxT = 0; vyT = 0; }
    // ---- 速度趋近 + 升力/微重力（:45891-45909）----
    const num8 = Math.hypot(targetX - this.cx, targetY - this.cy);
    const lerpV = getLerpValue(5, 10, num8, true);
    const yKeep = this.vy;
    if (num8 > 10) {
      const t = 0.075 * lerpV;
      this.vx += (vxT - this.vx) * t;
      this.vy += (vyT - this.vy) * t;
    }
    this.vy = yKeep;
    this.vy -= num7;
    this.vy += 0.02 + num7 * 0.25;
    this.vy = clampF(this.vy, -2, 2);
    if (this.cy + this.vy < targetY) this.vy += (this.vy + num7 + 0.01 - this.vy) * 0.75;
    if (Math.abs(this.vx) > 0.02) this.vx *= 0.98;
    // ---- 线张力（:45910-45945;CanReelThroughBlocks=true → Center 直迁档）----
    const num9 = Math.hypot(this.anchorX - this.cx, this.anchorY - this.cy);
    const num10 = this.ai0;
    const flag2 = num9 > num10;
    const flag3 = num9 > num10 - 2;
    if (flag2) {
      let ddx = this.anchorX - this.cx, ddy = this.anchorY - this.cy;
      const dl = Math.hypot(ddx, ddy) || 1;
      ddx /= dl; ddy /= dl;
      const num11 = num9 - num10;
      this.x += ddx * num11;               // base.Center += vector2×num11（直迁）
      this.y += ddy * num11;
      let flag4 = ddy < 0.8 || num7 > 0;   // Dot(dir, UnitY) = dir.Y
      if (num7 === 0 && Math.abs(this.vx) < 0.05) flag4 = false;
      this.vy += ddy * 0.05;
      if (flag4) this.vy -= 0.15;
      this.vx += ddx * 0.2;
      if (num10 === KITE_STRING_MIN) {     // :45938-45944 收到最短 → Kill + AFK 清零
        this.dead = true;
        return;
      }
    }
    // ---- 玩家转向（:45947-45952）----
    const v4x = this.cx - this.anchorX, v4y = this.cy - this.anchorY;
    if (Math.abs(v4x) > Math.abs(v4y) / 2) ctx.faceDir(v4x > 0 ? 1 : -1);
    // ---- 朝向（:45953-45967）----
    const dir = ctx.playerDir();
    let d5x = this.anchorX - this.cx, d5y = this.anchorY - this.cy;
    const d5l = Math.hypot(d5x, d5y);
    if (d5l > 0) { d5x /= d5l; d5y /= d5l; } else { d5x = 0; d5y = 0; }
    const flag5 = num7 === 0 && this.vy >= 0.02 && !flag3;   // 下垂态
    if (flag5) {
      this.rotation *= 0.95;
    } else {
      let num12 = Math.atan2(-d5y, -d5x) + Math.PI / 4;      // (-vector6).ToRotation()
      if (this.spriteDirection === -1) num12 -= (Math.PI / 2) * dir;
      this.rotation = num12 + this.vx * 0.05;
    }
    this.projectileLocalAI1 = clampF(this.projectileLocalAI1 + (flag5 ? 1 : -1) * 0.005, 0, 1);
    // ---- 帧表 + spriteDirection（:45969-46035）----
    const sel = kiteSelectFrame(this.projId, Math.hypot(this.vx, this.vy), num7, this.frame, this.frameCounter);
    this.frame = sel.frame;
    this.frameCounter = sel.frameCounter;
    this.spriteDirection = dir;
    // HandleMovement 子集（:16132 起,4×4 盒 |velocity|≤4 直移档——分量阻挡清零;
    // 张力段已直迁,此步仅消费残余速度。aiStyle 160 排除 SlopeCollision 分支
    // （P.cs:17881 `aiStyle != 160`）,无 Kill-on-tile 面）
    this.moveWithTileStop();
  }

  /** 速度位移 + 分量阻挡清零（TileCollision 直移档;平台不阻） */
  private moveWithTileStop(): void {
    const solid = this.ctx.solidBox;
    if (!solid) { this.x += this.vx; this.y += this.vy; return; }
    let nvx = this.vx, nvy = this.vy;
    if (nvx !== 0 && solid(this.x + nvx, this.y, this.w, this.h)) nvx = 0;
    if (nvy !== 0 && solid(this.x + nvx, this.y + nvy, this.w, this.h)) nvy = 0;
    this.vx = nvx; this.vy = nvy;
    this.x += nvx; this.y += nvy;
  }

  /** Utils.Shift(arr, 1) + 当前态（DrawKite 尾段采样面;LeashedKite.cs:215-220 同式） */
  private shiftTrail(): void {
    for (let i = this.oldPos.length - 1; i > 0; i--) {
      this.oldPos[i].x = this.oldPos[i - 1].x; this.oldPos[i].y = this.oldPos[i - 1].y;
      this.oldRot[i] = this.oldRot[i - 1];
      this.oldSpriteDirection[i] = this.oldSpriteDirection[i - 1];
    }
    this.oldPos[0].x = this.cx; this.oldPos[0].y = this.cy;
    this.oldRot[0] = this.rotation;
    this.oldSpriteDirection[0] = this.spriteDirection;
  }

  draw(r: Renderer, _cam: Camera): void {
    r.drawFlyingKite(this);
  }
}
