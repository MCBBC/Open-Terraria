// 矿车坐骑实体（原版语义 = Mount：坐骑位锁定 + Minecart.cs 轨道跟随运动学）。
// 原版矿车不是独立实体——玩家 mount 后玩家 hitbox 即车（20×(42+heightBoost)），
// 每帧走 Player.cs:27783-27850 的 TrackCollision 段 + 常规 DryCollision。本作以
// props 实体承载同一状态，fixedUpdate 跑 1:1 运动学，玩家位置每 tick 回写
//（Player.ridingCart 封常规移动）。
//
// 坐骑参数按矿车族逐型取 Mount.cs mounts[n]（tools/extract-mounts.mjs 提取的
// vanilla-mounts.json）：
//   6  Minecart          13/13/0.04/15/5.15  heightBoost 10
//   11 MinecartMech      13/13/0.04/15/5.15  heightBoost 12
//   13 MinecartWood      10/10/0.03/12/5.15  heightBoost 10（默认矿车，无召唤物品）
//   39 DiggingMoleMinecart 6/6/0.02/15/5.15 heightBoost 10
//   其余 24 种 13/13/0.04/15/5.15 heightBoost 10
// 升级套件（5289 解锁 UsingSuperCart，Mount.cs:480-506/_shouldSuperCart）整体覆写：
//   runSpeed/dashSpeed 20、acceleration 0.1、jumpHeight 15、jumpSpeed 5.15
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { damageVar } from '../stats/ScaleStats';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import {
  MOUNT_DATA, canKillTileAt, checkTileBreakabilityAt, shouldTileSurviveAt,
  type KillTileCtx, type MountData,
} from './Mounts';
import { canHitLine } from '../physics/LineOfSight';
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS } from '../data/tiles';
import { ITEM_DEFS } from '../data/items';
import { viIdFromKey } from '../data/vanillaItemCombat';
import { playerCanHitEnemy } from './projTargets';
import {
  trackCollision, trackRotation, onTrack,
  FLAG_ON_TRACK, FLAG_BOUNCY_BUMPER, FLAG_USED_RAMP, FLAG_HIT_SWITCH,
  FLAG_BOOST_LEFT, FLAG_BOOST_RIGHT,
  CART_TEXTURE_WIDTH, PLAYER_DEFAULT_GRAVITY, TRACK_BOOST_DELTA,
  TRACK_TILE, placeTrack, frameTrackArea, areSidesMetForTrack, tryFittingTileOrientation,
  magnetPosition,
} from '../world/MinecartTrack';

/** 坐骑族贴图（CART_MOUNT_TEXTURES）由 Game.ts 经 mountIdOfTexture 消费 */
export const CART_MOUNT_TEXTURES: Record<number, string> = {};
{
  for (const id of Object.keys(MOUNT_DATA)) {
    const d: MountData = MOUNT_DATA[id];
    if (d.Minecart && d.frontTexture) {
      CART_MOUNT_TEXTURES[Number(id)] = `vanilla/${d.frontTexture}`;
    }
  }
}

/** 默认矿车 = Wooden Minecart（mount 13；Player.cs:22401 `int num4 = 13`——
 *  未装备矿车族物品时右键/QuickMinecart 上的是木质车，无需任何物品） */
export const WOOD_CART_MOUNT = 13;
export const DEFAULT_CART_TEXTURE = CART_MOUNT_TEXTURES[WOOD_CART_MOUNT]
  ?? 'vanilla/Mount_MinecartWood.png';

/** SuperCart 覆写常量（Mount.cs:371-379 SuperCart*） */
const SUPER_CART_RUN_SPEED = 20;
const SUPER_CART_DASH_SPEED = 20;
const SUPER_CART_ACCELERATION = 0.1;
const SUPER_CART_JUMP_HEIGHT = 15;
const SUPER_CART_JUMP_SPEED = 5.15;
/** Player.maxFallSpeed 默认 10f（Player.cs:27039-27043 落速钳） */
const MAX_FALL_SPEED = 10;
/** Player.cs:26349 脱轨落地（onWrongGround）时的 runSlowdown；贴轨时 = runAcceleration（:26357） */
const WRONG_GROUND_SLOWDOWN = 0.2;
/** 摔伤起步格数（Player.cs:25005-25010 num9 = 25 + extraFall；矿车 ExtraFall=0） */
const FALL_SAFE_TILES = 25;
/** 摔伤每格伤害（Player.cs:25074 num17 = (num10-num9) × 10） */
const FALL_DMG_PER_TILE = 10;

/** 鼠马车坐骑 id（MountID.DiggingMoleMinecart，MountID.cs:112） */
export const MOLE_CART_MOUNT = 39;
/** 普通轨道物品 vid（MinecartDiggerHelper.cs:81 `item.type == 2340`） */
export const TRACK_ITEM_VID = 2340;
/** SuperCart 机械激光伤害（Mount.cs:5212 `int damage = 60`） */
export const SUPER_CART_LASER_DMG = 60;
/** 激光锥半张角（Mount.cs:5218 `< MathF.PI / 4f`） */
const LASER_CONE = Math.PI / 4;

/** 轮火花尘型（DelegateMethods.Minecart.Sparks* 五实现，DelegateMethods.cs:224-420） */
export type CartDustKind = 'sparks' | 'sparksFart' | 'sparksTerraFart' | 'sparksMeow' | 'sparksMech';
/** 各坐骑的 MinecartDust 委派（Mount.cs mounts[n] 段）：
 *  33 MeowmereMinecart→SparksMeow(:988) / 51 FartMinecart→SparksFart(:1074) /
 *  53 TerraFartMinecart→SparksTerraFart(:1082) / 11 MinecartMech→SparksMech(:1462)；
 *  其余全部 → Sparks（6:891 / 16:1022 / 13:1570 / SetAsMinecart 默认 :2708） */
export const CART_DUST_KIND: Record<number, CartDustKind> = {
  33: 'sparksMeow', 51: 'sparksFart', 53: 'sparksTerraFart', 11: 'sparksMech',
};
/** 尘型分派（未登记坐骑 = 默认 Sparks） */
export function cartDustKindOf(id: number): CartDustKind {
  return CART_DUST_KIND[id] ?? 'sparks';
}

/** SuperCart 防御加成（Mount.cs:4797-4798）：
 *  num = 1 + |vx|/RunSpeed × 2.5 → statDefense += (int)(2 × num)。
 *  RunSpeed 取 _shouldSuperCart 生效档（恒 20，Mount.cs:480-486） */
export function superCartDefenseBonus(absVx: number, runSpeed: number): number {
  return Math.trunc(2 * (1 + (absVx / runSpeed) * 2.5));
}

/** 轮火花速度档（Player.cs:19585-19596 / 19643-19654）：
 *  |vx| > 0.66×maxRunSpeed → 档 2（0.66/0.33/0 三个 Next(2) 掷位）；
 *  |vx| > 0.33×maxRunSpeed → 档 1（0.5/0 两个 Next(3) 掷位）；
 *  否则档 0（原位恒一发） */
export function wheelSparkTier(absVx: number, maxRunSpeed: number): 0 | 1 | 2 {
  if (Math.abs(absVx) > maxRunSpeed * 0.66) return 2;
  if (Math.abs(absVx) > maxRunSpeed * 0.33) return 1;
  return 0;
}

/** MathHelper.WrapAngle（XNA）：折回 (-π, π] */
function wrapAngle(x: number): number {
  x = (x + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
}

/** SuperCart 机械激光束（Projectile 591 MinecartMechLaser）。原版发射即
 *  Projectile.NewProjectile + damage=60 + Damage() 后 damage=0（Mount.cs:5224-5228）
 *  ——伤害当场结算，余下的弹体纯视觉（aiStyle 101，Projectile.cs:6117-6126 /
 *  :31987-32029：20t 淡出 + 尾随玩家 + 玩家反向即灭）。591 无 melee/ranged/
 *  magic 旗（SetDefaults 未置，Projectile.cs:490-492 默认全 false）→ 永不暴击。
 *  束源 = (-20,-39) 档 mech 点；束向 = 源→目标盒内随机点（:5221 RandomVector2） */
export interface CartLaserBeam {
  /** 相对车位的束源偏移（每 tick 重锚 = position += playerΔ，aiStyle101 :32016） */
  dx: number; dy: number;
  /** 束向量（源→目标，长度即束长） */
  vx: number; vy: number;
  /** 发射向水平符号（玩家反向即灭门 :32020-32024） */
  dirX: number;
  /** localAI[0]（:31988 起 20t） */
  age: number;
}

export class Minecart extends Entity {
  /** 矿车坐骑 id（MountID.Sets.Cart 族；默认 6，Game.ts 按物品/木质车覆写） */
  mountId = 6;
  /** 车身宽度（Player.width 恒 20，坐骑不改宽） */
  w = 20;
  /** 车身高度 = 42 + mounts[mountId].heightBoost（Mount.cs 每型 heightBoost） */
  h = 52;
  mounted = false;          // 玩家骑乘中
  dead = false;
  /** 坐骑贴图（Mount.frontTexture 文件名，atlas.ensureVImage 懒加载） */
  texture = DEFAULT_CART_TEXTURE;
  /** 升级套件已解锁（Player.UsingSuperCart → SuperCart* 常量） */
  superCart = false;
  /** 车身朝向翻转（撞弹性挡板时随输入翻；Player.cartFlip） */
  cartFlip = false;
  /** 车身倾角（Player.fullRotation = TrackRotation 的 atan2） */
  rotation = 0;
  /** 纵向贴轨绘制偏移（TrackRotation 返回值 = Player.gfxOffY） */
  gfxOffY = 0;
  /** 本 tick 是否在轨（Player.onTrack） */
  onTrackNow = false;
  /** 脱轨落地（Player.onWrongGround：vy==0 且磁石位无轨，:26344-26360） */
  onWrongGround = false;
  /** 跳跃剩余 tick（Player.jump = Mount.JumpHeight；每 tick vy=-jumpSpeed） */
  jump = 0;
  jumpSpeed = 5.15;
  /** 加速轨道累积（Player.trackBoost：下帧并入 vx，钳 ±maxRunSpeed） */
  trackBoost = 0;
  /** 斜坡起飞动画计时（Player.cartRampTime = min(1,|vx|/RunSpeed)*20；
   *  >0 期间重力停摆只递减，Player.cs:27031-27037） */
  cartRampTime = 0;
  /** 轮组动画 tick（Mount runningFrame 3 帧 × delay 12） */
  animTick = 0;
  /** TrackCollision 的 lastBoost（加速轨去重：同格不重复给速） */
  lastBoostX = 0;
  lastBoostY = 0;
  /** 摔伤追踪（Player.fallStart：开始下落的 tile Y） */
  fallStart = 0;
  /** SuperCart 机械激光余辉（Projectile 591 视觉束，见 CartLaserBeam 注释） */
  laserBeams: CartLaserBeam[] = [];

  private prevJump = false;
  private prevInputX = 0;
  /** 上 tick 落地标记（onWrongGround 判定的 vy==0 取上 tick 碰撞后态） */
  private wasGrounded = false;

  private get mdata(): MountData | null {
    return MOUNT_DATA[String(this.mountId)] ?? null;
  }

  /** 应用坐骑型参数（构造/上车时一次）：h = 42 + heightBoost（Mount.GetHeightBoost） */
  applyMountStats(): void {
    const hb = this.mdata?.heightBoost ?? 10;
    this.h = 42 + hb;
  }

  // ---- 坐骑参数（Mount.cs RunSpeed/DashSpeed/Acceleration getter :480-506 +
  //      JumpHeight/JumpSpeed :2786-2816：_shouldSuperCart 优先整体覆写） ----
  get runSpeed(): number {
    return this.superCart ? SUPER_CART_RUN_SPEED : this.mdata?.runSpeed ?? 13;
  }
  get dashSpeed(): number {
    return this.superCart ? SUPER_CART_DASH_SPEED : this.mdata?.dashSpeed ?? this.mdata?.runSpeed ?? 13;
  }
  get acceleration(): number {
    return this.superCart ? SUPER_CART_ACCELERATION : this.mdata?.acceleration ?? 0.04;
  }
  get jumpHeight(): number {
    return this.superCart ? SUPER_CART_JUMP_HEIGHT : this.mdata?.jumpHeight ?? 15;
  }
  /** 本型基础跳跃速度（SuperCart 覆写后 SuperCartJumpSpeed 5.15，Mount.cs:279-2812） */
  get baseJumpSpeed(): number {
    return this.superCart ? SUPER_CART_JUMP_SPEED : this.mdata?.jumpSpeed ?? 5.15;
  }
  /** 摔伤系数（mounts[n].fallDamage，矿车族恒 1） */
  get fallDamageFactor(): number { return this.mdata?.fallDamage ?? 1; }

  draw(r: Renderer, _cam: Camera): void {
    // ---- SuperCart 机械激光余辉（Projectile 591，aiStyle 101 的视觉段）----
    // GetAlpha（Projectile.cs:76276-76279）：alpha = Lerp(0,255,age/20) →
    // RGB = 255-alpha、通道 α = 63-alpha/4（即随龄淡出）；束沿发射向量画到
    // 目标点（束长 = |v|，束端 = 目标盒内随机点）；每 tick 束源重锚车位
    if (this.laserBeams.length) {
      const ctx = r.canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.lineCap = 'round';
        for (const b of this.laserBeams) {
          const a = Math.min(255, 255 * (b.age / 20));
          const alpha = Math.max(0, (63 - a / 4) / 255);
          ctx.strokeStyle = `rgba(${255 - a | 0},${255 - a | 0},${255 - a | 0},${alpha})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(this.x + b.dx, this.y + b.dy);
          ctx.lineTo(this.x + b.dx + b.vx, this.y + b.dy + b.vy);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // 骑乘中由 Renderer.drawPlayer 叠画（原版 frontTexture 在玩家之前层）；
    // 未骑乘的矿车原版不存在（坐骑 buff 结束即消失）——保留贴图绘制仅作调试残留态
    if (this.mounted) return;
    const img = r.atlas?.ensureVImage(this.texture);
    const ctx = r.canvas.getContext('2d');
    if (!ctx || !img) return;
    const fh = Math.floor(img.height / 3);
    ctx.drawImage(img, 0, 0, img.width, fh,
      this.x + this.w / 2 - CART_TEXTURE_WIDTH / 2, this.y + this.h / 2 - fh / 2,
      img.width, fh);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (!this.mounted) { this.dead = true; return; }   // 坐骑语义：无骑乘即消亡
    const p = game.player;
    const st = game.world.store;
    const maxRun = this.runSpeed;

    // ---- 贴轨/脱轨态（Player.cs:26344-26360：mount.Cart && velocity.Y==0 时判）----
    //  vy==0 取上一 tick 碰撞后态（原版该段在 HorizontalMovement 之前，读的就是
    //  上帧碰撞结果）；贴轨判定原版直调 Minecart.OnTrack 磁石位探针（非 onTrack 旗标）。
    //  脱轨落地 → fullRotation=0 + onWrongGround + runSlowdown 0.2；
    //  此时按方向键（release 边沿）→ TryDismount 下车
    const groundedNow = this.vy === 0;
    const onTrackProbe = onTrack(st, this.x, this.y, this.w, this.h);
    this.onWrongGround = groundedNow && !onTrackProbe;
    if (this.onWrongGround) {
      this.rotation = 0;
      if ((p.inputX < 0 && this.prevInputX >= 0) || (p.inputX > 0 && this.prevInputX <= 0)) {
        // Mount.TryDismount（:26353-26355）：下车保持车位与车速（Mount.Dismount 不清速度）
        this.mounted = false;
        this.dead = true;
        p.x = this.x;
        p.y = this.y;
        p.vx = this.vx;
        p.vy = this.vy;
        p.ridingCart = false;
        p.cart = null;
        p.cartDefenseBonus = 0;   // 坐骑防御加成随下车解除（UpdateEffects 停跑）
        return;
      }
    }
    // runSlowdown（:26312 默认 0.2；:26349 脱轨落地 0.2；:26357 贴轨 = runAcceleration）
    const slow = groundedNow && onTrackProbe ? this.acceleration : WRONG_GROUND_SLOWDOWN;

    // ---- trackBoost 并入（Player.cs:19530-19544：钳 ±maxRunSpeed）----
    if (this.trackBoost !== 0) {
      this.vx += this.trackBoost;
      this.trackBoost = 0;
      if (this.vx < -maxRun) this.vx = -maxRun;
      else if (this.vx > maxRun) this.vx = maxRun;
    }

    // ---- 水平输入（Player.cs:19546-19791 HorizontalMovement Carts 段 1:1）----
    // 车只在贴轨（vy==0）时响应加速/反推；runSlowdown+runAcceleration 同帧叠加
    const controlLeft = p.inputX < 0, controlRight = p.inputX > 0;
    if (controlLeft && this.vx > -maxRun) {
      if (this.vy === 0) {
        if (this.vx > slow) this.vx -= slow;
        this.vx -= this.acceleration;
      }
      // onWrongGround 刹车（:19577-19586）：脱轨后方向推力被对冲，车无法自走
      if (this.onWrongGround) {
        if (this.vx < -slow) this.vx += slow;
        else this.vx = 0;
      }
      // ---- 车轮火花+滚动声（Player.cs:19573-19615 左推分支）----
      // 门：AnyTrackRider && !onWrongGround && onTrack（上 tick 碰撞后态，同上方
      // onWrongGround 取态口径）&& itemAnimation==0 && vy==0 && vx>=0（反向推动）
      if (this.onTrackNow && !this.onWrongGround && p.itemAnimTicks === 0
        && this.vy === 0 && this.vx >= 0) {
        this.emitWheelSparks(game);
      }
    } else if (controlRight && this.vx < maxRun) {
      if (this.vy === 0) {
        if (this.vx < -slow) this.vx += slow;
        this.vx += this.acceleration;
      }
      if (this.onWrongGround) {
        if (this.vx > slow) this.vx -= slow;
        else this.vx = 0;
      }
      // ---- 车轮火花+滚动声（Player.cs:19631-19673 右推分支；门 vx<=0）----
      if (this.onTrackNow && !this.onWrongGround && p.itemAnimTicks === 0
        && this.vy === 0 && this.vx <= 0) {
        this.emitWheelSparks(game);
      }
    } else if (Math.abs(this.vx) >= 1) {
      // :19731-19762 无输入矿车（|vx|≥1）：脱轨落地按 runSlowdown 刹车；
      //  贴轨不减速，只钳 ±maxRunSpeed
      if (this.onWrongGround) {
        if (this.vx > 0) {
          if (this.vx > slow) this.vx -= slow;
          else this.vx = 0;
        } else if (this.vx < 0) {
          if (this.vx < -slow) this.vx += slow;
          else this.vx = 0;
        }
      }
      if (this.vx > maxRun) this.vx = maxRun;
      if (this.vx < -maxRun) this.vx = -maxRun;
    } else if (this.vy === 0) {
      // :19764-19777 落地无输入摩擦：|vx|<1 的慢车被刹停（原版语义）
      if (this.vx > slow) this.vx -= slow;
      else if (this.vx < -slow) this.vx += slow;
      else this.vx = 0;
    } else {
      // :19778-19791 空中无输入摩擦 ×0.5
      const s = slow * 0.5;
      if (this.vx > s) this.vx -= s;
      else if (this.vx < -s) this.vx += s;
      else this.vx = 0;
    }
    // 朝向：仅输入方向与速度同号才转（Player.cs:19553-19561 mount.Cart 门）
    if (p.inputX !== 0 && Math.sign(this.vx) === p.inputX) p.facing = p.inputX;
    this.prevInputX = p.inputX;

    // ---- 跳跃（Player.JumpMovement :20402-20418 + Mount.JumpSpeed/JumpHeight）----
    // 起跳需松键重按（releaseJump；autoJump 默认关），续跳按住即可（jump>0 段）。
    // 起跳门 = velocity.Y==0（贴轨或脱轨落地皆可，:20404 括号链），非"必须在轨"
    this.jumpSpeed = this.baseJumpSpeed;
    if (p.inputJump) {
      if (this.jump > 0) {
        if (this.vy === 0) this.jump = 0;
        else { this.vy = -this.jumpSpeed; this.jump--; }
      } else if (!this.prevJump && this.vy === 0) {
        // MountID.Sets.Cart 起跳：位置微抬防立即重贴轨（:20406 position.Y -= 0.001）
        this.y -= 0.001;
        this.jump = this.jumpHeight;
        this.vy = -this.jumpSpeed;
      }
    } else {
      this.jump = 0;
    }
    this.prevJump = !!p.inputJump;

    // ---- 重力（Player.cs:26499 cartRampTime 归零 + :27031-27037 斜坡窗口停摆）----
    if (this.vy === 0) {
      this.cartRampTime = 0;                      // :26499
      this.fallStart = Math.trunc(this.y / 16);   // fallStart = position.Y/16
    }
    if (this.cartRampTime <= 0) this.vy += PLAYER_DEFAULT_GRAVITY;
    else this.cartRampTime--;                     // :27036：起飞窗口内不加重力
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;   // :27039-27043

    // ---- TrackCollision（Player.cs:27795-27850 1:1）----
    // 液体减速（:27802-27806 num108）：湿 0.5 / 蜂蜜·微光 0.25，速度整体缩放后
    // 进碰撞再还原（原版 velocity *= num108 → TrackCollision → velocity /= num108）
    const wet = p.inWater, honey = p.inHoney, shimmer = p.inShimmer;
    const liq = p.merman ? 1 : shimmer ? 0.25 : honey ? 0.25 : !wet ? 1 : 0.5;
    const prevVy = this.vy;
    const rider = {
      x: this.x, y: this.y,
      vx: this.vx * liq, vy: this.vy * liq,
      lastBoostX: this.lastBoostX, lastBoostY: this.lastBoostY,
    };
    const bits = trackCollision(
      st, rider, this.w, this.h,
      !!p.inputDown, !!p.inputUp, this.fallStart, false,
      {
        landing: (lx, ly) => {
          // MinecartLandingSound（DelegateMethods.Minecart.LandingSound → SoundID.Item53）+ 轮花
          game.playSfxFile?.('Item_53', 0.7, lx, ly);
          game.spawnParticles(lx, ly + this.h - 4, '#C8B08A', 6, 1.2, { life: 24 });
        },
      },
    );
    this.vx = rider.vx / liq;
    this.vy = rider.vy / liq;
    this.x = rider.x; this.y = rider.y;
    this.lastBoostX = rider.lastBoostX; this.lastBoostY = rider.lastBoostY;

    this.onTrackNow = !!(bits & (1 << FLAG_ON_TRACK));
    if (this.onTrackNow) {
      // 倾角 + gfxOffY（Player.cs:27804-27806：位置前探一步取两轮轨面）
      const rot = { v: this.rotation };
      this.gfxOffY = trackRotation(st, this.x + this.vx, this.y + this.vy, this.w, this.h,
        !!p.inputDown, !!p.inputUp, rot);
      this.rotation = rot.v;
      if (prevVy > PLAYER_DEFAULT_GRAVITY && this.vy === 0) this.fallStart = Math.trunc(this.y / 16);
    } else {
      this.rotation = 0;
      this.gfxOffY = 0;
      // JumpingSound 委托原版为空实现（DelegateMethods.cs:246-248）——离轨不发声
    }
    if (bits & (1 << FLAG_BOUNCY_BUMPER)) {
      if (controlLeft || controlRight) this.cartFlip = !this.cartFlip;
      if (this.vx > 0) p.facing = 1;
      else if (this.vx < 0) p.facing = -1;
      // BumperSound（DelegateMethods.Minecart.BumperSound → SoundID.Item56）
      game.playSfxFile?.('Item_56', 0.8, this.x, this.y);
    }
    if (bits & (1 << FLAG_USED_RAMP)) {
      this.cartRampTime = Math.trunc(Math.min(1, Math.abs(this.vx) / this.dashSpeed) * 20);
    }
    if (bits & (1 << FLAG_HIT_SWITCH)) {
      // Player.cs:27927-27931 → Minecart.HitTrackSwitch → Wiring.HitSwitch(磁石位)
      const mx = Math.trunc((this.x + this.w / 2 - CART_TEXTURE_WIDTH / 2 + 25) / 16);
      const my = Math.trunc((this.y + this.h / 2 + 26) / 16);
      game.hitTrackSwitch?.(mx, my);
    }
    if (bits & (1 << FLAG_BOOST_LEFT)) this.trackBoost -= TRACK_BOOST_DELTA;   // :27845（Minecart.BoosterSpeed=4）
    if (bits & (1 << FLAG_BOOST_RIGHT)) this.trackBoost += TRACK_BOOST_DELTA;  // :27849

    // ---- 位置积分（原版在 TrackCollision 后由 DryCollision 完成）----
    //  贴轨：轨道非实心，常规碰撞只处理横向撞墙；
    //  脱轨：走完整实体碰撞（实心落面/墙面）——坐骑恒 fallThrough=true
    //  （:27787-27790 mount.Cart 分支），平台一律穿过
    if (this.onTrackNow) {
      this.x += this.vx;
      this.y += this.vy;
      if (this.vx !== 0) {
        const headX = Math.floor((this.x + this.w / 2 + Math.sign(this.vx) * this.w / 2) / 16);
        const feetY = Math.floor((this.y + this.h - 4) / 16);
        if (st.inBounds(headX, feetY) && st.isSolid(headX, feetY)) {
          this.x -= this.vx;
          this.vx = 0;
        }
      }
    } else {
      const wasFalling = this.vy > 0;
      this.dryCollide(st);
      if (wasFalling && this.vy === 0) {
        // ---- 脱轨落地摔伤（Player.cs:25005-25091：num10 = tileY - fallStart，
        //  num9 = 25 + ExtraFall；矿车族 ExtraFall=0、FallDamage=1。
        //  落在轨上 num10=0（:25018-25021）——本分支只在脱轨落地时结算）----
        const num10 = Math.trunc(this.y / 16) - this.fallStart;
        this.fallStart = Math.trunc(this.y / 16);
        if (num10 > FALL_SAFE_TILES
          && !(p.equipStats.wing || p.hasHorseshoe || p.equipStats.noFallDmg)) {
          const dmg = Math.max(1, Math.round((num10 - FALL_SAFE_TILES) * FALL_DMG_PER_TILE
            * this.fallDamageFactor));
          p.lastDamageCause = { kind: 'fell' };
          p.damage(dmg, this.cx, this.y - 10);
          game.playSfx?.('hurt');
          game.addDamageNumber?.(this.cx, this.y, dmg, false, '#FF5050');
          // 成就：摔落幸存（:25078-25082）
          if (!p.dead && p.hp > 0 && p.hp <= p.maxHp / 10) {
            game.achievements?.handleSpecialEvent(8,
              { statLifeMax: p.maxHp, statManaMax: p.maxMana });
          }
        }
      }
    }
    this.wasGrounded = this.onTrackNow || this.vy === 0;

    if (Math.abs(this.vx) > 0.1) this.animTick++;
    else this.animTick = 0;

    // ---- 玩家坐骑位回写（原版玩家 hitbox 即车；此处锁玩家到车位）----
    p.x = this.x;
    p.y = this.y;
    p.vx = this.vx;
    p.vy = 0;
    p.onGround = this.onTrackNow || this.wasGrounded;
    p.fallStartY = null;   // 常规摔伤链由本实体 fallStart 接管（脱轨落地段结算）

    // ---- 矿车撞怪（Player.cs:27225-27296）：速度>4 扩盒命中敌怪 ----
    //  盒 = 坐骑盒（width/height 即车盒 20×52，非 20×42 玩家盒）+ 速度扩张
    //  （vx<-1 x-15 / vx>1 w+15 / |vx|>10 再 ±10 / vy<-1 y-10 / vy>1 h+10）；
    //  敌怪 only（friendly 城镇 NPC 不伤，:27253）；伤害 GetMinecartDamage（:28776-
    //  28822）：默认 25+55×速比、mount 13 木质车 15+30×速比、SuperCart 50+100×速比，
    //  hardMode ×1.5 且 expertMode ×1.5；击退 = 10+40×速比（knockBackResist 由
    //  hurt() 内乘）；暴击 = max(近/远/魔) 掷骰（:27261-27270）；immune 30t（:27286）；
    //  击杀 → HandleSpecialEvent(9) VEHICULAR_MANSLAUGHTER（:27288-27290）
    {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 4) {
        // 速比分母 = maxRunSpeed = mount.RunSpeed（骑乘态 :26329 整体覆写）
        const ratio = spd / maxRun;
        let rx = this.x, ry = this.y, rw = this.w, rh = this.h;
        if (this.vx < -1) rx -= 15;
        if (this.vx > 1) rw += 15;
        if (this.vx < -10) rx -= 10;
        if (this.vx > 10) rw += 10;
        if (this.vy < -1) ry -= 10;
        if (this.vy > 1) rh += 10;
        const dir = this.vx < 0 ? -1 : 1;
        let kb = 10 + 40 * ratio;
        let base: number;
        if (this.superCart) base = 50 + 100 * ratio;         // :28814-28817
        else if (this.mountId === WOOD_CART_MOUNT) base = 15 + 30 * ratio;  // :28809-28811 case 13
        else base = 25 + 55 * ratio;                          // :28786-28807
        // Main.DamageVar :65597-65620（±15% + luck 重掷）
        let dmg = Math.max(1, damageVar(base, p.luck));
        // :28818-28822 hardMode 与 expertMode 两个独立 ×1.5（C# (int) 截断）
        if (game.world.flags?.hardMode) dmg = Math.trunc(dmg * 1.5);
        if (game.world.isExpert) dmg = Math.trunc(dmg * 1.5);
        const crit = Math.random() * 100 + 1
          <= Math.max(p.critChance('melee'), p.critChance('ranged'), p.critChance('magic'));
        if (crit) dmg = Math.round(dmg * 2);
        for (const ent of game.enemies()) {
          const e = ent as unknown as {
            x: number; y: number; w: number; h: number; dead: boolean;
            iframes: number; dontTakeDamage?: boolean; vanillaId?: number; friendly?: boolean;
            hurt: (d: number, kx: number, ky: number, g: GameHooks, ap: number, c: boolean, p: number) => boolean;
          };
          if (e.dead || e.dontTakeDamage || !playerCanHitEnemy(e, game)) continue;   // friendly 门（e.friendly 是空字段 no-op——真旗在 def.friendly）
          if (!(rx < e.x + e.w && rx + rw > e.x && ry < e.y + e.h && ry + rh > e.y)) continue;
          // :27277-27281：0<knockBackResist<1 时预除抗性（StrikeNPC 内部再乘回 →
          //  矿车击退净效果不随抗性衰减）。hurt() 管线按 kbx×resist 结算，故先除抵消
          const resist = (ent as { def?: { knockBackResist?: number } }).def?.knockBackResist ?? 1;
          const kbx = resist > 0 && resist < 1 ? kb / resist : kb;
          // 命中：pierce=0 走 hurt 自带免疫门；命中后覆写 30t（原版 immune[i]=30）
          if (e.hurt(dmg, dir * kbx, 0, game, 0, crit, 0)) {
            e.iframes = 30;
            if (e.dead) {
              game.achievements?.handleSpecialEvent(9,
                { statLifeMax: p.maxHp, statManaMax: p.maxMana });
            }
          }
        }
      }
    }

    // ---- SuperCart 防御+激光（Mount.cs:4793-4799 UpdateEffects）----
    // _shouldSuperCart = Cart 族 && UsingSuperCart（本实体 superCart 即该旗）；
    // num = 1 + |vx|/RunSpeed×2.5（RunSpeed 走 SuperCart 档 20）→ statDefense += (int)(2×num)
    p.cartDefenseBonus = this.superCart
      ? superCartDefenseBonus(Math.abs(this.vx), this.runSpeed) : 0;
    if (this.superCart) this.castSuperCartLaser(p, game);
    // 激光余辉推进（Projectile.cs:31987-32029：20t 寿 + 尾随车位 + 反向即灭）
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      const b = this.laserBeams[i];
      b.age++;
      if (b.age >= 20                                                       // :31993 localAI[0] >= 20
        || (Math.sign(this.vx) !== b.dirX && this.vx !== 0)) {              // :32020-32024
        this.laserBeams.splice(i, 1);
      }
    }

    // ---- 鼠马车挖掘（Player.cs:19905 TryUsingDiggerCart：撞怪结算后同段）----
    this.tryUsingDiggerCart(p, game);

    // 完全脱轨坠出世界底（误用兜底）：消亡防穿地（正常脱轨由 dryCollide 落地）
    if (!this.onTrackNow && !this.wasGrounded
      && this.y > st.h * 16 - 64) {
      this.dead = true;
      this.mounted = false;
      p.cartDefenseBonus = 0;
    }
  }

  /** 轮组动画帧（Mount runningFrameCount 3 / runningFrameDelay 12；静止 standingFrame 0） */
  get animFrame(): number {
    return Math.abs(this.vx) > 0.1 ? Math.floor(this.animTick / 12) % 3 : 0;
  }

  // ---------------------------------------------------------------------------
  // 车轮火花（Player.cs:19573-19615 + Minecart.cs:1629-1638 + DelegateMethods.cs:224-413）
  // ---------------------------------------------------------------------------

  /** 加速/反推时的车轮火花 + 滚动声。调用点已过门（贴轨/反向推动/itemAnim==0）；
   *  此处只做 Item55 声 + 三档速度掷位 → WheelSparks 磁石位 → 尘型委派
   *  （DelegateMethods.Minecart.rotation = fullRotation → this.rotation 直读） */
  private emitWheelSparks(game: GameHooks): void {
    // SoundID.Item55 矿车滚动声（Player.cs:19574，盒中心；FILE_CASE_VOL 无专属修正）
    game.playSfxFile?.('Item_55', 1, this.x + this.w / 2, this.y + this.h / 2);
    // 掷位（Player.cs:19585-19614）：|vx| 对 maxRunSpeed（骑乘态 = mount.RunSpeed）
    // 档2 → 0.66/0.33/0 三位各 50%；档1 → 0.5/0 两位各 2/3；档0 → 原位恒一发
    const maxRun = this.runSpeed;
    const trySpark = (mul: number, chance: number): void => {
      if (Math.random() >= chance) return;
      // Minecart.WheelSparks（:1629-1638）：Position(=车位置+velocity×mul) +
      // (Width/2-textureWidth/2, Height/2) + MagnetOffset —— magnetPosition 同式
      const mp = magnetPosition(this.x + this.vx * mul, this.y + this.vy * mul, this.w, this.h);
      this.wheelSparkDust(game, mp.x, mp.y);
    };
    switch (wheelSparkTier(this.vx, maxRun)) {
      case 2:
        trySpark(0.66, 0.5); trySpark(0.33, 0.5); trySpark(0, 0.5);
        break;
      case 1:
        trySpark(0.5, 2 / 3); trySpark(0, 2 / 3);
        break;
      default:
        trySpark(0, 1);
        break;
    }
  }

  /** 单粒轮火花（DelegateMethods.Minecart.Sparks 族，DelegateMethods.cs:224-413）。
   *  尘型按坐骑委派分派（cartDustKindOf）；NewDust 后逐字段后置与原版同序 */
  private wheelSparkDust(game: GameHooks, x: number, y: number): void {
    const rand = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo));
    // :226 dustPosition += (Next(2)==0 ? 13 : -13, 0).RotatedBy(rotation)
    const off = rand(0, 2) === 0 ? 13 : -13;
    const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
    const px = x + off * cos, py = y + off * sin;
    // NewDust(dustPosition, 1, 1, type, Next(-2,3), Next(-2,3)) 的初速
    const vx0 = rand(-2, 3), vy0 = rand(-2, 3);
    const kind = cartDustKindOf(this.mountId);
    if (kind === 'sparksFart' || (kind === 'sparksTerraFart' && rand(0, 2) === 0)) {
      // SparksFart（:329-347，dust 211）——TerraFart 的 fart 半支（:349-354）
      const d = game.spawnDust?.(px, py, 1, 1, 211, vx0, vy0, 50, null, 0.8);
      if (!d) return;
      if (rand(0, 2) === 0) d.alpha += 25;      // :331-337
      if (rand(0, 2) === 0) d.alpha += 25;
      d.noLight = true;                          // :338
      d.noGravity = rand(0, 3) === 0;            // :339
      d.vx *= rand(15, 51) * 0.01;               // :340-344
      d.vx *= rand(25, 101) * 0.01;
      d.vy *= rand(15, 51) * 0.01;
      d.vy -= rand(15, 31) * 0.1;
      d.y -= 4;                                  // :345
      return;
    }
    if (kind === 'sparksTerraFart') {
      // SparksTerraFart 的另一半（:355-373，dust 107 绿色妖精尘）
      const t = Math.random() * 0.3;
      const color = {
        r: Math.round(64 + (255 - 64) * t), g: Math.round(220 + (255 - 220) * t),
        b: Math.round(96 + (255 - 96) * t), a: 255,
      };
      const d = game.spawnDust?.(px, py, 1, 1, 107, vx0, vy0, 100, color, 0.8);
      if (!d) return;
      if (rand(0, 2) === 0) d.alpha += 25;      // :360-366
      if (rand(0, 2) === 0) d.alpha += 25;
      d.noLightEmittance = true;                 // :367
      d.noGravity = rand(0, 3) === 0;            // :368
      d.vx *= rand(15, 51) * 0.01;               // :369-371
      d.vx *= rand(25, 101) * 0.01;
      d.vy *= rand(15, 51) * 0.01;
      d.vy -= rand(15, 31) * 0.1;
      d.y -= 4;                                  // :372
      return;
    }
    // Sparks（:224-246 dust 213）/ SparksMech（:374-393 dust 260）/ SparksMeow
    // （:395-413 dust 213 + 染料 shader——shader 系统无对应，dust 本体同 Sparks，登记近似）
    const type = kind === 'sparksMech' ? 260 : 213;
    const fadeInExtra = kind === 'sparksMech' ? 0.5 : 1;   // :230 vs :378
    const d = game.spawnDust?.(px, py, 1, 1, type, vx0, vy0);
    if (!d) return;
    d.noGravity = true;                          // :228
    d.fadeIn = d.scale + fadeInExtra + 0.01 * rand(0, 51);
    d.vx *= rand(15, 51) * 0.01;                 // :233-235
    d.vx *= rand(25, 101) * 0.01;
    d.vy *= rand(15, 51) * 0.01;
    d.vy -= rand(15, 31) * 0.1;
    d.y -= 4;                                    // :236
    if (rand(0, 3) !== 0) d.noGravity = false;   // :237-241
    else d.scale *= 0.6;
  }

  // ---------------------------------------------------------------------------
  // SuperCart 机械激光（Mount.cs:5200-5258）
  // ---------------------------------------------------------------------------

  /** GetMinecartMechPoint（Mount.cs:5234-5258）：车身 mech 参考点
   *  = Bottom + (±offX 旋) + (斜坡 Lerp 补偿旋) */
  private minecartMechPoint(p: Player, offX: number, offY: number): { x: number; y: number } {
    const num = Math.sign(this.vx) || p.facing;         // :5236-5240
    const num3 = Math.sign(offX);                        // :5242（调用档 ±20 非 0）
    let ox = offX;
    if (p.facing !== num) ox -= num3;                    // :5243-5246
    if (num === -1) ox -= num3;                          // :5247-5250
    const rot = this.rotation;                           // fullRotation
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const v0x = ox * num, v0y = offY;
    const vx = v0x * cos - v0y * sin, vy = v0x * sin + v0y * cos;
    // :5252 vector2 = (Lerp(0,-8,rot/(π/4)), Lerp(0,2,|rot/(π/4)|)).RotatedBy(rot)
    const q = rot / (Math.PI / 4);
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    const w2x = lerp(0, -8, q), w2y = lerp(0, 2, Math.abs(q));
    let wx = w2x * cos - w2y * sin, wy = w2x * sin + w2y * cos;
    if (num === Math.sign(rot)) {                        // :5253-5256
      const m = lerp(1, 0.6, Math.abs(q));
      wx *= m; wy *= m;
    }
    return { x: this.x + vx + wx, y: this.y + this.h + vy + wy };   // Bottom + ...
  }

  /** CastSuperCartLaser（Mount.cs:5200-5232）：发射即结算（591 弹 Damage 后
   *  damage=0——见 CartLaserBeam 注释），60 伤无暴击无击退 */
  private castSuperCartLaser(p: Player, game: GameHooks): void {
    if (this.vx === 0) return;                            // :5207 静止不发
    const num = Math.sign(this.vx) || p.facing;           // :5202-5206
    const mech = this.minecartMechPoint(p, 20, -19);      // :5211 索敌档
    const st = game.world.store;
    for (const ent of game.enemies()) {
      const e = ent as unknown as {
        x: number; y: number; w: number; h: number; dead: boolean;
        iframes: number; dontTakeDamage?: boolean; friendly?: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, ap: number, c: boolean, pi: number) => boolean;
      };
      // CanBeChasedBy 口径（城镇/友好排除，同撞怪段 :27253）+ 玩家免疫门（:5218）
      if (e.dead || e.dontTakeDamage || !playerCanHitEnemy(e, game)) continue;   // friendly 门（同上，CanHit 门修空字段）
      if (e.iframes > 0) continue;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      if (Math.hypot(ecx - mech.x, ecy - mech.y) >= 300) continue;   // Distance < 300
      // Collision.CanHitLine(npc盒, mech点 0×0)
      if (!canHitLine(st, e.x, e.y, e.w, e.h, mech.x, mech.y, 0, 0)) continue;
      // 前向 ±π/4 锥（:5218）：AngleFrom = atan2(目标-源)，朝向角 = rot + (num==-1 ? π : 0)
      const angleFrom = Math.atan2(ecy - mech.y, ecx - mech.x);      // Entity.cs:190-193
      const facing = this.rotation + (num === -1 ? Math.PI : 0);
      if (Math.abs(wrapAngle(wrapAngle(angleFrom) - wrapAngle(facing))) >= LASER_CONE) continue;
      // :5220-5229：束源切 (-20,-39) 档；束端 = 目标盒内随机点（RandomVector2(0,1)）
      const src = this.minecartMechPoint(p, -20, -39);
      const rx = e.x + e.w * Math.random(), ry = e.y + e.h * Math.random();
      this.laserBeams.push({
        dx: src.x - this.x, dy: src.y - this.y,
        vx: rx - src.x, vy: ry - src.y,
        dirX: Math.sign(this.vx), age: 0,
      });
      // damage=60 → Damage()（无 melee/ranged/magic 旗 → 永不暴击；kb 0）
      e.hurt(SUPER_CART_LASER_DMG, 0, 0, game, 0, false, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // 鼠马车挖掘（Player.cs:19912-19933 TryUsingDiggerCart + MinecartDiggerHelper.cs）
  // ---------------------------------------------------------------------------

  /** Player.RotatedRelativePoint（Player.cs:4063-4077）矿车态：
   *  pivot = Bottom+(0,gfxOffY)；pos.Y += gfxOffY 后绕 pivot 旋 fullRotation，
   *  再 + (0,-num2) + (0,num2).RotatedBy（num2 = PlayerOffset/2+4 = 8，
   *  矿车 playerYOffsets 恒 8，SetAsMinecart :2720-2726） */
  private rotatedRelativePoint(px: number, py: number): { x: number; y: number } {
    const rot = this.rotation;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pivX = this.x + this.w / 2;
    const pivY = this.y + this.h + this.gfxOffY;
    // pos.Y += gfxOffY（:4075）与 pivot 内的 gfxOffY 相消（同加一次）
    const vx0 = px - this.x - this.w / 2;
    const vy0 = py - (this.y + this.h);
    const rx = vx0 * cos - vy0 * sin, ry = vx0 * sin + vy0 * cos;
    const num2 = 4 + 4;                                   // PlayerOffset(8)/2 + 4
    return {
      x: pivX + rx + -num2 * sin,
      y: pivY + ry - num2 + num2 * cos,
    };
  }

  /** TryUsingDiggerCart（Player.cs:19912-19933）：鼠马车在轨且落地时，
   *  按住任一方向键 → 朝 facing 挖穿前方并延轨 */
  private tryUsingDiggerCart(p: Player, game: GameHooks): void {
    if (this.mountId !== MOLE_CART_MOUNT || this.vy !== 0) return;   // :19914
    const num = 12, num2 = 20;
    const st = game.world.store;
    const isTrackAt = (wx: number, wy: number): boolean => {
      if (!st.inBounds(Math.trunc(wx / 16), Math.trunc(wy / 16))) return false;
      const k = st.idx(Math.trunc(wx / 16), Math.trunc(wy / 16));
      return !!(st.flags[k] & 1) && st.type[k] === TRACK_TILE;
    };
    // :19918-19920 前探点（Center + (12·direction, gravDir·20)）再 + (0, gravDir·10)
    const gravDir = 1;   // 矿车无重力翻转（本仓未实装 gravDir 翻转坐骑）
    let tp = this.rotatedRelativePoint(
      this.x + this.w / 2 + num * p.facing, this.y + this.h / 2 + gravDir * num2);
    tp = { x: tp.x, y: tp.y + gravDir * 10 };
    if (!isTrackAt(tp.x, tp.y)) {                        // :19922 非轨道 → 半档 X 再试
      tp = this.rotatedRelativePoint(
        this.x + this.w / 2 + num * p.facing * 0.5, this.y + this.h / 2 + gravDir * num2);
      tp = { x: tp.x, y: tp.y + gravDir * 10 };
    }
    const digY = (p.inputDown ? 1 : 0) - (p.inputUp ? 1 : 0);   // :19927
    if (p.inputUp || p.inputDown || p.inputX !== 0) {           // :19928 任一方向键
      this.moleTryDigging(p, game, Math.trunc(tp.x / 16), Math.trunc(tp.y / 16),
        p.facing, digY);
    }
  }

  /** MinecartDiggerHelper.TryDigging（MinecartDiggerHelper.cs:10-56） */
  private moleTryDigging(p: Player, game: GameHooks, px: number, py: number,
    digX: number, digYArg: number): void {
    const digY = 0;   // :12 digDirectionY 强制归零（竖挖分支不可达，原版同款死代码）
    const st = game.world.store;
    // :14 站位非轨道 || 地表以上 → 不挖（worldSurface = Main.worldSurface）
    const worldSurface = (game.world as unknown as { groundLevel?: number }).groundLevel ?? 0;
    if (!st.inBounds(px, py) || st.type[st.idx(px, py)] !== TRACK_TILE
      || !st.inBounds(px, py + digY) || py < worldSurface) return;
    const point2 = { x: px + digX, y: py + digY };
    // :21 已连通（含 ±1 竖差绕行）→ 不重挖
    if (this.alreadyLeadsIntoWantedTrack(st, px, py, point2.x, point2.y)
      || (digY === 0 && (this.alreadyLeadsIntoWantedTrack(st, px, py, point2.x, point2.y - 1)
        || this.alreadyLeadsIntoWantedTrack(st, px, py, point2.x, point2.y + 1)))) return;
    const num = 5;   // :25-29 挖穿列高（竖挖同为 5）
    const y0 = point2.y - (num - 1);
    // :33-40 前方 5 格逐格预检（可通行 + 镐力足）
    for (let y = y0; y <= point2.y; y++) {
      if (!this.canGetPastTile(game, point2.x, y)) return;
      if (!game.pickPowerEnough?.(point2.x, y)) return;
    }
    // :41-48 有轨道物品 → 挖穿 5 格 + 消耗 1 轨道 + 放新轨
    const slot = this.findMinecartTrackItem(p);
    if (slot < 0) return;
    for (let y = y0; y <= point2.y; y++) this.mineTheTileIfNecessary(game, point2.x, y);
    p.inv.removeAt(slot, 1);
    placeTrack(st, point2.x, point2.y, 0);   // PlaceATrack :190-198（style 0 普通轨）
    frameTrackArea(st, point2.x, point2.y);  // WorldGen.PlaceTile case 314 的 framing 链
    this.vx = Math.max(-1, Math.min(1, this.vx));   // :50 挖穿瞬间限速
    // :51-54 连接不完整 → 双端帧修正
    if (!this.alreadyLeadsIntoWantedTrack(st, px, py, point2.x, point2.y)) {
      this.correctTrackConnections(st, px, py, point2.x, point2.y);
    }
  }

  /** AlreadyLeadsIntoWantedTrack（MinecartDiggerHelper.cs:99-121）+
   *  GetExpectedDirections（:123-141）：两端皆为轨道且连接方向互恰 */
  private alreadyLeadsIntoWantedTrack(st: TileStore, sx: number, sy: number,
    ex: number, ey: number): boolean {
    const isTrack = (x: number, y: number): boolean =>
      st.inBounds(x, y) && !!(st.flags[st.idx(x, y)] & 1) && st.type[st.idx(x, y)] === TRACK_TILE;
    if (!isTrack(sx, sy) || !isTrack(ex, ey)) return false;
    // GetExpectedDirections：dy = ey-sy、dx = ex-sx；
    // dx==-1 → startLeft=dy/endRight=-dy；dx==1 → startRight=dy/endLeft=-dy
    const dy = ey - sy, dx = ex - sx;
    let expStartLeft: number | null = null, expStartRight: number | null = null;
    let expEndLeft: number | null = null, expEndRight: number | null = null;
    if (dx === -1) { expStartLeft = dy; expEndRight = -dy; }
    if (dx === 1) { expStartRight = dy; expEndLeft = -dy; }
    if (!areSidesMetForTrack(st, sx, sy, expStartLeft, expStartRight)) return false;
    if (!areSidesMetForTrack(st, ex, ey, expEndLeft, expEndRight)) return false;
    return true;
  }

  /** CorrectTrackConnections（MinecartDiggerHelper.cs:148-161）：双端按期望连接
   *  重定型（TryFittingTileOrientation，Minecart.cs:1564-1607） */
  private correctTrackConnections(st: TileStore, sx: number, sy: number,
    ex: number, ey: number): void {
    const dy = ey - sy, dx = ex - sx;
    let expStartLeft: number | null = null, expStartRight: number | null = null;
    let expEndLeft: number | null = null, expEndRight: number | null = null;
    if (dx === -1) { expStartLeft = dy; expEndRight = -dy; }
    if (dx === 1) { expStartRight = dy; expEndLeft = -dy; }
    tryFittingTileOrientation(st, sx, sy, expStartLeft, expStartRight);
    tryFittingTileOrientation(st, ex, ey, expEndLeft, expEndRight);
  }

  /** CanGetPastTile（MinecartDiggerHelper.cs:172-188）：CheckTileBreakability==0 +
   *  ShouldTileSurvive==false + （活性时）非困难祭坛/CanKillTile 双门 */
  private canGetPastTile(game: GameHooks, x: number, y: number): boolean {
    const st = game.world.store;
    const ctx: KillTileCtx = {
      hardMode: !!(game.world.flags as Record<string, boolean> | undefined)?.hardMode,
      // chestDestroyable 缺省：无宝箱内容表时按可毁近似（Mounts.ts 同口径注释）
      chestDestroyable: () => true,
    };
    if (checkTileBreakabilityAt(st, x, y, ctx) !== 0) return false;
    if (shouldTileSurviveAt(st, x, y, ctx)) return false;
    const k = st.idx(x, y);
    if (st.flags[k] & 1) {
      // :183 tile 26（DemonAltar）非困难模式不可破（sheet 26 = 该原版型的素材表）
      const def = TILE_DEFS[st.type[k]];
      if (def?.vanilla?.sheet === 26 && !ctx.hardMode) return false;
      if (!canKillTileAt(st, x, y, ctx)) return false;
    }
    return true;
  }

  /** FindMinecartTrackItem（MinecartDiggerHelper.cs:73-89）：0-57 格内首个
   *  2340 轨道物品；正被使用的选中格跳过（:78 selectedItem==i 且使用窗内） */
  private findMinecartTrackItem(p: Player): number {
    for (let i = 0; i < 58; i++) {
      const s = p.inv.slots[i];
      if (!s) continue;
      if (p.inv.selected === i && p.itemAnimTicks > 0) continue;   // :78
      const def = ITEM_DEFS[s.id];
      const vid = def?.vid ?? (def ? viIdFromKey(def.key) : -1);
      if (vid === TRACK_ITEM_VID && s.stack > 0) return i;
    }
    return -1;
  }

  /** MineTheTileIfNecessary（MinecartDiggerHelper.cs:200-209）：活性格 KillTile
   *  （掉落+音效+帧刷新——breakTile 即 WorldGen.KillTile 语义） */
  private mineTheTileIfNecessary(game: GameHooks, x: number, y: number): void {
    const st = game.world.store;
    if (st.inBounds(x, y) && st.flags[st.idx(x, y)] & 1) {
      game.breakTile?.(x, y);
    }
  }

  /** 脱轨后的常规碰撞（DryCollision 的矿车路径：轴向分离、仅实心格——
   *  坐骑恒 fallThrough=true（Player.cs:27787-27790 mount.Cart），平台穿过）。
   *  落地 = 下行被挡（vy 清零），由调用方按 vy 是否归零结算摔伤/贴地态 */
  private dryCollide(st: TileStore): void {
    // X 轴（像素步进防隧穿）
    const stepX = Math.sign(this.vx);
    let remainX = Math.abs(this.vx);
    while (remainX > 0) {
      const s = Math.min(1, remainX);
      remainX -= s;
      const nx = this.x + stepX * s;
      if (this.boxSolid(st, nx, this.y)) { this.vx = 0; break; }
      this.x = nx;
    }
    // Y 轴
    const stepY = Math.sign(this.vy);
    let remainY = Math.abs(this.vy);
    while (remainY > 0) {
      const s = Math.min(1, remainY);
      remainY -= s;
      const ny = this.y + stepY * s;
      if (this.boxSolid(st, this.x, ny)) {
        this.vy = 0;
        break;
      }
      this.y = ny;
    }
  }

  /** 盒内是否有实心格（TileStore.isSolid：active+tileSolid；平台不挡车） */
  private boxSolid(st: TileStore, x: number, y: number): boolean {
    const x0 = Math.floor(x / 16), x1 = Math.floor((x + this.w - 0.01) / 16);
    const y0 = Math.floor(y / 16), y1 = Math.floor((y + this.h - 0.01) / 16);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }
}
