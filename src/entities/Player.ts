// 玩家实体：移动、跳跃、游泳、Buff/配饰属性聚合、摔伤
import { Entity } from './Entity';
import type { GameHooks } from './types';
import {
  GRAVITY, MAX_FALL_SPEED, PLAYER_WALK_ACCEL, PLAYER_WALK_MAX,
  PLAYER_FRICTION, PLAYER_AIR_FRICTION, PLAYER_JUMP_SPEED, PLAYER_JUMP_TICKS,
  PLAYER_IFRAME_TICKS, TILE,
} from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Inventory, ACCESSORY_START } from '../items/Inventory';
import { BuffState } from '../stats/Buffs';
import { ITEM_DEFS } from '../data/items';

// 摔伤参数（移植自 Maples Player.Fall，单位换算为 tile）
const FALL_SAFE_TILES = 6;
const FALL_FATAL_TILES = 20;

export class Player extends Entity {
  w = 14; h = 30;        // 宽 <1 格（可入单格竖井），高 ≤2 格（可入两格通道）
  facing = 1;            // 1 右 -1 左
  baseMaxHp = 100;
  hp = 100;
  inv: Inventory;
  buffs = new BuffState();
  iframes = 0;
  jumpHold = 0;          // 长按跳跃剩余加速 tick
  inWater = false;
  headUnderwater = false;
  breath = 6;            // 气口：6 个气泡（#6）
  private breathAccum = 0;
  private drownAccum = 0;
  inLava = false;
  private lavaAccum = 0;
  animTime = 0;          // 走路动画计时
  useTime = 0;           // 通用动作冷却
  dead = false;
  respawnTimer = 0;
  // 摔伤追踪
  private fallStartY: number | null = null;
  private surfaceJumpCd = 0;  // 水面起跳冷却
  sinceHurt = 0;               // 距上次受击 tick（自然回血计时；渲染层读取做心心跳动效）
  private regenAccum = 0;

  constructor(x: number, y: number, inv: Inventory) {
    super();
    this.x = x; this.y = y;
    this.inv = inv;
  }

  // ---- 配饰效果（重算式聚合，幂等）----
  get hasHorseshoe(): boolean {
    for (let i = ACCESSORY_START; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (s && ITEM_DEFS[s.id]?.accessory === 'lucky_horseshoe') return true;
    }
    return false;
  }
  get hasFeralClaws(): boolean {
    for (let i = ACCESSORY_START; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (s && ITEM_DEFS[s.id]?.accessory === 'feral_claws') return true;
    }
    return false;
  }
  /** 防御 = 基础(0) + 铁皮 Buff(+6) */
  get defense(): number {
    return this.buffs.defenseBonus;
  }
  get maxHp(): number {
    return this.baseMaxHp + this.buffs.healthBonus;
  }
  get thornsActive(): boolean {
    return this.buffs.hasThorns;
  }
  /** 近战攻速倍率（猛爪手套 ×2） */
  get attackSpeedMult(): number {
    return this.hasFeralClaws ? 2 : 1;
  }
  /** 近战伤害加成（猛爪手套 +5） */
  get meleeDamageBonus(): number {
    return this.hasFeralClaws ? 5 : 0;
  }

  get frame(): number {
    if (!this.onGround) return 4;
    if (Math.abs(this.vx) > 0.3) {
      return 1 + Math.floor(this.animTime / 8) % 3;
    }
    return 0;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    const world = game.world;
    if (this.iframes > 0) this.iframes--;
    if (this.useTime > 0) this.useTime--;

    // Buff tick：自然回复（恢复 Buff）
    const buffHeal = this.buffs.tick(dt);
    if (buffHeal > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + buffHeal);
    // 自然回血：脱离战斗 5 秒后每秒缓回 1 点
    this.sinceHurt++;
    if (this.sinceHurt > 300 && this.hp > 0 && this.hp < this.maxHp) {
      this.regenAccum += dt;
      if (this.regenAccum >= 1) {
        this.regenAccum -= 1;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }
    // 上限收缩时钳制
    if (this.hp > this.maxHp) this.hp = this.maxHp;

    // 液体检测（身体中心 + 头部）
    const liq = world.store.liquid[world.store.idx(
      Math.floor(this.cx / TILE), Math.floor((this.y + this.h * 0.6) / TILE),
    )];
    this.inWater = liq > 100;
    const centerIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h * 0.6) / TILE));
    this.inLava = world.store.liquidType[centerIdx] === 2 && world.store.liquid[centerIdx] > 60;
    const headLiq = world.store.liquid[world.store.idx(
      Math.floor(this.cx / TILE), Math.floor((this.y + 2) / TILE),
    )];
    this.headUnderwater = headLiq > 100;
    // 岩浆伤害：每半秒 15
    if (this.inLava) {
      this.lavaAccum += dt;
      if (this.lavaAccum >= 0.5) {
        this.lavaAccum = 0;
        this.damage(15, this.cx, this.y - 10);
        game.addDamageNumber(this.cx, this.y, 15, false, '#FF6020');
      }
    } else this.lavaAccum = 0;

    // 气口：头部浸水时 12 秒耗尽 6 口，耗尽后每秒掉 10 血；出水立即恢复
    if (this.headUnderwater) {
      this.breathAccum += dt;
      const per = 2; // 每口气 2 秒
      while (this.breathAccum >= per && this.breath > 0) {
        this.breathAccum -= per;
        this.breath--;
      }
      if (this.breath <= 0) {
        this.drownAccum += dt;
        if (this.drownAccum >= 1) {
          this.drownAccum -= 1;
          this.damage(10, this.cx, this.y - 10);
          game.addDamageNumber(this.cx, this.y, 10, false, '#60A0FF');
        }
      }
    } else if (this.breath < 6) {
      this.breath = 6;
      this.breathAccum = 0;
      this.drownAccum = 0;
    }

    // 死亡等待重生
    if (this.hp <= 0) {
      this.dead = true;
      return;
    }

    // 水平（敏捷 Buff 提速）
    const speedMult = this.buffs.moveSpeedMult;
    const ix = this.inputX;
    if (ix !== 0) {
      this.vx += ix * PLAYER_WALK_ACCEL * (this.inWater ? 0.6 : 1) * speedMult;
      this.facing = ix;
    } else {
      this.vx *= this.onGround ? PLAYER_FRICTION : PLAYER_AIR_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    const maxSpd = PLAYER_WALK_MAX * (this.inWater ? 0.55 : 1) * speedMult;
    this.vx = Math.max(-maxSpd, Math.min(maxSpd, this.vx));

    // 跳跃 / 游泳
    if (this.inWater) {
      // 头部露出水面（踩水状态）→ 允许正常力度起跳跃上岸块（带冷却防连跳）
      if (this.inputJump && !this.headUnderwater) {
        if (this.surfaceJumpCd <= 0) {
          this.vy = -PLAYER_JUMP_SPEED;
          this.jumpHold = PLAYER_JUMP_TICKS;
          this.surfaceJumpCd = 24;
        }
      } else if (this.inputJump) {
        // 全浸没：游泳上浮
        this.vy = Math.max(this.vy - 0.62, -4.4);
      }
      if (this.surfaceJumpCd > 0) this.surfaceJumpCd--;
      this.vy += GRAVITY * 0.3;
      this.vy = Math.max(-4.6, Math.min(3.0, this.vy));
      this.fallStartY = null;
    } else {
      if (this.inputJump && this.onGround) {
        this.vy = -PLAYER_JUMP_SPEED;
        this.jumpHold = PLAYER_JUMP_TICKS;
      }
      if (this.inputJump && this.jumpHold > 0) {
        this.vy -= 0.22;
        this.jumpHold--;
      } else {
        this.jumpHold = 0;
      }
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    }
    // 松键截断上升（手感）
    if (!this.inputJump && this.vy < -2) this.vy = -2;

    // 摔伤追踪：开始下落记录高度，落地结算
    if (!this.onGround && this.vy > 0 && this.fallStartY === null) {
      this.fallStartY = this.y;
    }
    if (this.vy < -0.1) this.fallStartY = null; // 重新上升则重置

    this.dropThrough = !!this.inputDown;
    moveAndCollide(this, world, this.vx, this.vy);

    // 自动上台阶：贴地行走撞 1 格高台阶且上方净空 → 直接踏上去（无需跳跃）
    // 注意碰撞后 vx 已清零，用输入方向判断
    if (this.onGround && this.hitWall && this.inputX !== 0) {
      const dir = this.inputX;
      const frontX = dir > 0 ? this.x + this.w + 1 : this.x - 1;
      const fx = Math.floor(frontX / TILE);
      const fy = Math.floor((this.y + this.h - 1) / TILE);
      const stepSolid = world.store.isSolid(fx, fy);
      const headroom = !world.store.isSolid(fx, fy - 1) && !world.store.isSolid(fx, fy - 2);
      if (stepSolid && headroom) {
        const ny = this.y - TILE;
        // 抬升后自身所占空间必须无实心
        let clear = true;
        const tx0 = Math.floor(this.x / TILE), tx1 = Math.floor((this.x + this.w - 1) / TILE);
        const ty0 = Math.floor(ny / TILE), ty1 = Math.floor((ny + this.h - 1) / TILE);
        for (let tx = tx0; tx <= tx1 && clear; tx++) {
          for (let ty = ty0; ty <= ty1; ty++) {
            if (world.store.isSolid(tx, ty)) { clear = false; break; }
          }
        }
        if (clear) {
          this.y = ny;
          this.x += dir * 2.5;
          this.onGround = true;
        }
      }
    }

    // 落地摔伤结算（幸运马掌免疫）
    if (this.onGround && this.fallStartY !== null) {
      const fallTiles = (this.y - this.fallStartY) / TILE;
      this.fallStartY = null;
      if (fallTiles > FALL_SAFE_TILES && !this.hasHorseshoe) {
        const t = Math.min(1, (fallTiles - FALL_SAFE_TILES) / (FALL_FATAL_TILES - FALL_SAFE_TILES));
        const dmgPercent = 10 + 90 * t * t * t; // 10%~100% 三次方曲线（Maples 公式）
        const dmg = Math.max(1, Math.round((dmgPercent / 100) * this.hp));
        this.damage(dmg, this.cx, this.y - 10);
        game.addDamageNumber(this.cx, this.y, dmg, false, '#FF8050');
      }
    }

    if (Math.abs(this.vx) > 0.3 && this.onGround) this.animTime += Math.abs(this.vx);
    else this.animTime = 0;

    // 越界保护
    const maxY = world.h * TILE;
    if (this.y > maxY + 100) this.damage(9999, this.cx, this.y);
  }

  // 输入状态由 Game 每帧写入
  inputX = 0;
  inputJump = false;
  inputDown = false;

  /** 受击：防御减伤公式 max(1, dmg - defense*0.5)（移植自 Maples Player.OnAttacked） */
  damage(dmg: number, srcX: number, srcY: number): boolean {
    if (this.iframes > 0 || this.dead) return false;
    const reduction = Math.max(1, dmg - this.defense * 0.5);
    this.hp -= reduction;
    this.iframes = PLAYER_IFRAME_TICKS;
    this.sinceHurt = 0; // 受击打断自然回血
    // 击退
    const dir = this.cx < srcX ? -1 : 1;
    this.vx = dir * 3.4;
    this.vy = -3;
    return true;
  }

  draw() { /* 由 Renderer 统一绘制 */ }
}
