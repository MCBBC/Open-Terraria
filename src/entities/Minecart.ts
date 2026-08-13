// 矿车坐骑实体（原版语义 = Mount 6 "Minecart"：坐骑位锁定 + Minecart.cs 轨道跟随运动学）。
// 原版矿车不是独立实体——玩家 mount 后玩家 hitbox 即车（20×52，heightBoost 10），
// 每帧走 Player.cs:27783-27850 的 TrackCollision 段。本作以 props 实体承载同一状态，
// fixedUpdate 跑 1:1 运动学，玩家位置每 tick 回写（Player.ridingCart 封常规移动）。
//
// 坐骑参数（Mount.cs mounts[6] / SuperCart 常量）：
//   runSpeed 13 / dashSpeed 13 / acceleration 0.04 / jumpHeight 15 / jumpSpeed 5.15
//   升级套件（5289 解锁 UsingSuperCart）：20 / 20 / 0.1 / 15 / 5.15
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import {
  trackCollision, trackRotation, onTrack,
  FLAG_ON_TRACK, FLAG_BOUNCY_BUMPER, FLAG_USED_RAMP, FLAG_HIT_SWITCH,
  FLAG_BOOST_LEFT, FLAG_BOOST_RIGHT,
  CART_RUN_SPEED, CART_DASH_SPEED, CART_ACCELERATION,
  CART_JUMP_HEIGHT, CART_JUMP_SPEED,
  SUPER_CART_RUN_SPEED, SUPER_CART_DASH_SPEED, SUPER_CART_ACCELERATION,
  SUPER_CART_JUMP_HEIGHT, SUPER_CART_JUMP_SPEED,
  TRACK_BOOST_DELTA, PLAYER_DEFAULT_GRAVITY, RUN_SLOWDOWN,
  CART_TEXTURE_WIDTH,
} from '../world/MinecartTrack';

/** 矿车族物品（vanilla id）→ 坐骑贴图文件（Mount.cs mounts[n].frontTexture） */
export const CART_TEXTURES: Record<number, string> = {
  2343: 'vanilla/Mount_Minecart.png',          // Minecart（mount 6）
  3353: 'vanilla/Mount_MinecartMech.png',      // Mechanical Cart（mount 11）
  4066: 'vanilla/Mount_MinecartDesert.png',    // Desert Minecart（mount 15）
  4426: 'vanilla/Extra_108.png',               // Bee Minecart（mount 18）
  4427: 'vanilla/Extra_109.png',               // Ladybug Minecart（mount 19）
  4428: 'vanilla/Extra_110.png',               // Pigron Minecart（mount 20）
  4429: 'vanilla/Extra_111.png',               // Sunflower Minecart（mount 21）
  4443: 'vanilla/Extra_112.png',               // Demonic Hellcart（mount 22）
  4450: 'vanilla/Extra_115.png',               // Shroom Minecart（mount 24）
};
export const DEFAULT_CART_TEXTURE = 'vanilla/Mount_Minecart.png';

export class Minecart extends Entity {
  // 原版坐骑 hitbox：width 20、height 42 + heightBoost 10 = 52（Mount.cs mounts[6]）
  w = 20;
  h = 52;
  mounted = false;          // 玩家骑乘中
  dead = false;
  /** 坐骑贴图（Mount.frontTexture 文件名，atlas.ensureVImage 懒加载） */
  texture = DEFAULT_CART_TEXTURE;
  /** 升级套件已解锁（Player.UsingSuperCart → SuperCart* 常量） */
  superCart = false;
  /** 车身朝向翻转（撞弹性挡板时随输入翻；Mount._type 6 绘制翻转语义近似） */
  cartFlip = false;
  /** 车身倾角（Player.fullRotation = TrackRotation 的 atan2） */
  rotation = 0;
  /** 纵向贴轨绘制偏移（TrackRotation 返回值 = Player.gfxOffY） */
  gfxOffY = 0;
  /** 本 tick 是否在轨（Player.onTrack） */
  onTrackNow = false;
  /** 跳跃剩余 tick（Player.jump = Mount.JumpHeight；每 tick vy=-jumpSpeed） */
  jump = 0;
  jumpSpeed = CART_JUMP_SPEED;
  /** 加速轨道累积（Player.trackBoost：下帧并入 vx，钳 ±maxRunSpeed） */
  trackBoost = 0;
  /** 斜坡起飞动画计时（Player.cartRampTime = min(1,|vx|/RunSpeed)*20） */
  cartRampTime = 0;
  /** 轮组动画 tick（Mount runningFrame 3 帧 × delay 12） */
  animTick = 0;
  /** TrackCollision 的 lastBoost（加速轨去重：同格不重复给速） */
  lastBoostX = 0;
  lastBoostY = 0;
  /** 落轨音效的 fallStart（Player.fallStart：开始下落的 tile Y） */
  fallStart = 0;

  private wasOnTrack = false;
  private prevJump = false;

  /** 坐骑参数（SuperCart 覆盖） */
  get runSpeed(): number { return this.superCart ? SUPER_CART_RUN_SPEED : CART_RUN_SPEED; }
  get dashSpeed(): number { return this.superCart ? SUPER_CART_DASH_SPEED : CART_DASH_SPEED; }
  get acceleration(): number { return this.superCart ? SUPER_CART_ACCELERATION : CART_ACCELERATION; }
  get jumpHeight(): number { return this.superCart ? SUPER_CART_JUMP_HEIGHT : CART_JUMP_HEIGHT; }

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

    // ---- trackBoost 并入（Player.cs:19530-19544：钳 ±maxRunSpeed）----
    if (this.trackBoost !== 0) {
      this.vx += this.trackBoost;
      this.trackBoost = 0;
      if (this.vx < -maxRun) this.vx = -maxRun;
      else if (this.vx > maxRun) this.vx = maxRun;
    }

    // ---- 水平输入（Player.cs:19546-19690 Carts 段 1:1）----
    // 车只在贴轨（vy==0）时响应加速/反推；runSlowdown+runAcceleration 同帧叠加
    const controlLeft = p.inputX < 0, controlRight = p.inputX > 0;
    if (controlLeft && this.vx > -maxRun) {
      if (this.vy === 0) {
        if (this.vx > RUN_SLOWDOWN) this.vx -= RUN_SLOWDOWN;
        this.vx -= this.acceleration;
      }
    } else if (controlRight && this.vx < maxRun) {
      if (this.vy === 0) {
        if (this.vx < -RUN_SLOWDOWN) this.vx += RUN_SLOWDOWN;
        this.vx += this.acceleration;
      }
    }
    // 朝向：仅输入方向与速度同号才转（Player.cs:19553-19561 mount.Cart 门）
    if (p.inputX !== 0 && Math.sign(this.vx) === p.inputX) p.facing = p.inputX;

    // ---- 跳跃（Player.JumpMovement :20402-20418 + Mount.JumpSpeed/JumpHeight）----
    // 起跳需松键重按（releaseJump；autoJump 默认关），续跳按住即可（jump>0 段）
    this.jumpSpeed = (this.superCart ? SUPER_CART_JUMP_SPEED : CART_JUMP_SPEED);
    if (p.inputJump) {
      if (this.jump > 0) {
        if (this.vy === 0) this.jump = 0;
        else { this.vy = -this.jumpSpeed; this.jump--; }
      } else if (!this.prevJump && this.vy === 0 && this.onTrackNow) {
        // MountID.Sets.Cart 起跳：位置微抬防立即重贴轨（:20406 position.Y -= 0.001）
        this.y -= 0.001;
        this.jump = this.jumpHeight;
        this.vy = -this.jumpSpeed;
      }
    } else {
      this.jump = 0;
    }
    this.prevJump = !!p.inputJump;

    // ---- 重力（Player.gravity = defaultGravity 0.4；在轨时 TrackCollision 清零 vy）----
    if (this.vy === 0) this.fallStart = Math.trunc(this.y / 16);
    this.vy += PLAYER_DEFAULT_GRAVITY;

    // ---- TrackCollision（Player.cs:27795-27850 1:1）----
    this.wasOnTrack = this.onTrackNow;
    const prevVy = this.vy;
    const rider = {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy,
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
    this.x = rider.x; this.y = rider.y; this.vx = rider.vx; this.vy = rider.vy;
    this.lastBoostX = rider.lastBoostX; this.lastBoostY = rider.lastBoostY;

    this.onTrackNow = !!(bits & (1 << FLAG_ON_TRACK));
    if (this.onTrackNow) {
      // 倾角 + gfxOffY（Player.cs:27804-27806：位置前探一步取两轮轨面）
      const rot = { v: this.rotation };
      this.gfxOffY = trackRotation(st, this.x + this.vx, this.y + this.vy, this.w, this.h,
        !!p.inputDown, !!p.inputUp, rot);
      this.rotation = rot.v;
      if (this.vy === 0) this.cartRampTime = 0;   // Player.cs:26499-26501
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
    if (bits & (1 << FLAG_BOOST_LEFT)) this.trackBoost -= TRACK_BOOST_DELTA;
    if (bits & (1 << FLAG_BOOST_RIGHT)) this.trackBoost += TRACK_BOOST_DELTA;

    // ---- 位置积分（原版在 TrackCollision 后由常规碰撞段 position += velocity 完成：
    // TrackCollision 只改速度 + 贴轨 Y 快照。轨道非实心——横向撞实心墙即停回退）----
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

    if (Math.abs(this.vx) > 0.1) this.animTick++;
    else this.animTick = 0;

    // ---- 玩家坐骑位回写（原版玩家 hitbox 即车；此处锁玩家到车位）----
    p.x = this.x;
    p.y = this.y;
    p.vx = this.vx;
    p.vy = 0;
    p.onGround = this.onTrackNow;
    p.fallStartY = null;   // 车上不计摔伤（原版 mount fallStart 语义）

    // ---- 矿车撞怪（Player.cs:27225-27296）：速度>4 扩盒命中敌怪 ----
    //  盒 = 玩家盒 + 速度扩张（vx<-1 x-15 / vx>1 w+15 / |vx|>10 再 ±10 /
    //  vy<-1 y-10 / vy>1 h+10）；敌怪 only（friendly 城镇 NPC 不伤，:27258）；
    //  伤害 = DamageVar(25+55×速比)（SuperCart 50+100×速比 :28801-28804；
    //  hardMode ×1.5 :28806-28808）；击退 = 10+40×速比；
    //  暴击 = max(近/远/魔) 掷骰（:27261-27270）；immune 30t（:27287）；
    //  击杀 → HandleSpecialEvent(9) VEHICULAR_MANSLAUGHTER（:27289-27292）
    {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 4) {
        const ratio = spd / PLAYER_WALK_MAX;   // velocity.Length()/maxRunSpeed
        let rx = this.x, ry = this.y, rw = p.w, rh = p.h;
        if (this.vx < -1) rx -= 15;
        if (this.vx > 1) rw += 15;
        if (this.vx < -10) rx -= 10;
        if (this.vx > 10) rw += 10;
        if (this.vy < -1) ry -= 10;
        if (this.vy > 1) rh += 10;
        const dir = this.vx < 0 ? -1 : 1;
        const kb = 10 + 40 * ratio;
        let base = 25 + 55 * ratio;
        if (this.superCart) base = 50 + 100 * ratio;
        let dmg = Math.max(1, Math.round(base * (1 + (Math.random() * 30 - 15) / 100))); // DamageVar ±15%
        if (game.world.flags?.hardMode) dmg = Math.round(dmg * 1.5);
        const crit = Math.random() * 100
          < Math.max(p.critChance('melee'), p.critChance('ranged'), p.critChance('magic'));
        if (crit) dmg = Math.round(dmg * 2);
        for (const ent of game.enemies()) {
          const e = ent as unknown as {
            x: number; y: number; w: number; h: number; dead: boolean;
            iframes: number; dontTakeDamage?: boolean; vanillaId?: number;
            hurt: (d: number, kx: number, ky: number, g: GameHooks, ap: number, c: boolean, p: number) => boolean;
          };
          if (e.dead || e.dontTakeDamage) continue;
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

    // 完全脱轨且离轨远处（误用兜底）：无轨重力自然下落由 TileCollision 缺失 → 消亡防穿地
    if (!this.onTrackNow && this.vy > 0 && !onTrack(st, this.x, this.y, this.w, this.h)
      && this.y > game.world.store.h * 16 - 64) {
      this.dead = true;
      this.mounted = false;
    }
  }

  /** 轮组动画帧（Mount runningFrameCount 3 / runningFrameDelay 12；静止 standingFrame 0） */
  get animFrame(): number {
    return Math.abs(this.vx) > 0.1 ? Math.floor(this.animTick / 12) % 3 : 0;
  }
}
