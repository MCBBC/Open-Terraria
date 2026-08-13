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
import { damageVar } from '../stats/ScaleStats';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { MOUNT_DATA, type MountData } from './Mounts';
import type { TileStore } from '../world/TileStore';
import {
  trackCollision, trackRotation, onTrack,
  FLAG_ON_TRACK, FLAG_BOUNCY_BUMPER, FLAG_USED_RAMP, FLAG_HIT_SWITCH,
  FLAG_BOOST_LEFT, FLAG_BOOST_RIGHT,
  CART_TEXTURE_WIDTH, PLAYER_DEFAULT_GRAVITY, TRACK_BOOST_DELTA,
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
    } else if (controlRight && this.vx < maxRun) {
      if (this.vy === 0) {
        if (this.vx < -slow) this.vx += slow;
        this.vx += this.acceleration;
      }
      if (this.onWrongGround) {
        if (this.vx > slow) this.vx -= slow;
        else this.vx = 0;
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
        // :27272-27276 击退预除 knockBackResist（矿车击退不随抗性衰减——Enemy.hurt
        // 管线会再除一次，此处先乘回抵消）近似登记：hurt 侧无 resist 暴露，直接传原值
        void kb; kb = 10 + 40 * ratio;
        let base: number;
        if (this.superCart) base = 50 + 100 * ratio;         // :28814-28817
        else if (this.mountId === WOOD_CART_MOUNT) base = 15 + 30 * ratio;  // :28809-28811 case 13
        else base = 25 + 55 * ratio;                          // :28786-28807
        // Main.DamageVar :65597-65620（±15% + luck 重掷）
        let dmg = Math.max(1, damageVar(base, p.luck));
        // :28808-28810 hardMode 与 expertMode 两个独立 ×1.5（曾漏 expert 档）
        if (game.world.flags?.hardMode) dmg = Math.trunc(dmg * 1.5);
        if (game.world.isExpert) dmg = Math.trunc(dmg * 1.5);   // :28818-28820
        if (game.world.isExpert) dmg = Math.round(dmg * 1.5);          // :28821-28822
        const crit = Math.random() * 100 + 1
          <= Math.max(p.critChance('melee'), p.critChance('ranged'), p.critChance('magic'));
        if (crit) dmg = Math.round(dmg * 2);
        for (const ent of game.enemies()) {
          const e = ent as unknown as {
            x: number; y: number; w: number; h: number; dead: boolean;
            iframes: number; dontTakeDamage?: boolean; vanillaId?: number; friendly?: boolean;
            hurt: (d: number, kx: number, ky: number, g: GameHooks, ap: number, c: boolean, p: number) => boolean;
          };
          if (e.dead || e.dontTakeDamage || e.friendly) continue;
          if (!(rx < e.x + e.w && rx + rw > e.x && ry < e.y + e.h && ry + rh > e.y)) continue;
          // 命中：pierce=0 走 hurt 自带免疫门；命中后覆写 30t（原版 immune[i]=30）
          if (e.hurt(dmg, dir * kb, 0, game, 0, crit, 0)) {
            e.iframes = 30;
            if (e.dead) {
              game.achievements?.handleSpecialEvent(9,
                { statLifeMax: p.maxHp, statManaMax: p.maxMana });
            }
          }
        }
      }
    }

    // 完全脱轨坠出世界底（误用兜底）：消亡防穿地（正常脱轨由 dryCollide 落地）
    if (!this.onTrackNow && !this.wasGrounded
      && this.y > st.h * 16 - 64) {
      this.dead = true;
      this.mounted = false;
    }
  }

  /** 轮组动画帧（Mount runningFrameCount 3 / runningFrameDelay 12；静止 standingFrame 0） */
  get animFrame(): number {
    return Math.abs(this.vx) > 0.1 ? Math.floor(this.animTick / 12) % 3 : 0;
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
