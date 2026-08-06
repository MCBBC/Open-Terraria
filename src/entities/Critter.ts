// 小动物实体：无害被动生物（兔/鸟/松鼠/萤火虫等，原版素材）
// 行为：闲逛（hop 跳行 / walk 爬行 / fly 飞行），玩家靠近时逃离；可被一击杀死
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { CRITTER_BY_KEY, CritterDef } from '../data/critters';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';

export class Critter extends Entity {
  def: CritterDef;
  facing = 1;
  animT = 0;
  hopCd = 0;             // 下次起跳倒计时
  wanderT = 0;           // 换向计时
  iframes = 0;
  target: { x: number; y: number } | null = null;
  perchState = 0;         // 0 飞行 1 栖息中
  perchT = 0;             // 栖息剩余 tick
  perchCd = 200 + Math.floor(Math.random() * 300); // 下次想落地倒计时
  inWater = false;        // 在水中（鸭子游水动画判定）
  flying = false;         // 起飞逃离中（鸭子）
  wantLand = false;      // 飞行中想降落
  // 动画帧窗口（蝴蝶表含 8 物种 × 3 帧，只播本物种）
  animBase = 0;
  animLen = 0; // 0 = 用全表
  // 鸟类巡航：持久航向，偶尔小角度转向（直线巡航不像原地打转）
  heading = (Math.random() - 0.5) * Math.PI * 2;
  headingT = 120 + Math.floor(Math.random() * 200);

  constructor(public key: string, x: number, y: number) {
    super();
    this.def = CRITTER_BY_KEY[key];
    this.w = this.def.w;
    this.h = this.def.h;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.hopCd = Math.floor(Math.random() * 60);
    // 蝴蝶：随机物种（表内 8 物种 × 3 帧），只播本物种的 3 帧
    if (this.def.npc === 356) {
      const species = Math.floor(Math.random() * 8);
      this.animBase = species * 3;
      this.animLen = 3;
    }
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.animT++;
    if (this.iframes > 0) this.iframes--;
    const player = (game as unknown as { player: Player }).player;
    const flee = !!player && !player.dead && this.def.fleeRange > 0 &&
      Math.hypot(player.cx - this.cx, player.cy - this.cy) < this.def.fleeRange;

    // 鸭子式两栖飞行：平时地面走/水里游，受惊起飞逃离，安全后降落
    if (this.def.fleeFly) {
      if (this.flying) {
        if (flee) this.wantLand = false;
        else this.wantLand = true;
        this.flyMove(game, flee, player, this.wantLand);
        if (this.wantLand && this.onGround) { this.flying = false; this.wantLand = false; }
      } else {
        if (flee && (this.onGround || this.inWater)) {
          this.flying = true;
          this.vy = -3.2;
        } else {
          this.groundAI(game, flee, player);
        }
      }
    } else if (this.def.kind === 'fly') {
      if (this.def.perch) {
        // 鸟类：偶尔落地栖息；玩家靠近立即起飞逃离
        if (this.perchState === 1) {
          if (flee) { this.perchState = 0; this.vy = -2.5; }
          else if (--this.perchT <= 0) { this.perchState = 0; this.vy = -2; }
          else { // 栖息：站地不动
            this.vx *= 0.7;
            this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
            moveAndCollide(this, game.world, this.vx, this.vy);
            return;
          }
        }
        this.flyAI(game, flee, player);
        // 飞行中偶尔找落点（只在开阔地表、不逃逃时）
        if (this.perchState === 0 && !flee && --this.perchCd <= 0 && this.onGround === false) {
          this.perchCd = 300 + Math.floor(Math.random() * 400);
          const gx = Math.floor(this.cx / TILE);
          let gy = Math.floor(this.cy / TILE);
          let solid = -1;
          for (let k = 0; k < 24; k++, gy++) {
            if (gy >= game.world.store.h) break;
            if (game.world.store.isSolid(gx, gy)) { solid = gy; break; }
          }
          if (solid > 0) this.target = { x: this.cx, y: (solid - 1) * TILE };
        }
        // 到达落点 → 栖息
        if (this.perchState === 0 && this.onGround && !flee && Math.abs(this.vx) < 0.3) {
          this.perchState = 1;
          this.perchT = 240 + Math.floor(Math.random() * 360);
        }
      } else {
        this.flyAI(game, flee, player);
      }
    } else {
      this.groundAI(game, flee, player);
    }

    // 远离玩家清除
    if (player) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (d > TILE * 70) this.dead = true;
    }
  }

  /** 地面 AI：闲逛跳行/爬行，玩家靠近逃离 */
  private groundAI(game: GameHooks, flee: boolean, player: Player | null) {
    const st = game.world.store;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    this.inWater = inWater;

    if (flee && player) this.facing = player.cx < this.cx ? 1 : -1;
    else if (--this.wanderT <= 0) {
      this.wanderT = 90 + Math.floor(Math.random() * 150);
      if (Math.random() < 0.5) this.facing = -this.facing;
    }

    if (this.def.kind === 'hop') {
      // 跳行：静止蓄力 → 起跳（逃离时高频远跳）
      this.vx *= 0.8;
      if (--this.hopCd <= 0 && this.onGround) {
        this.hopCd = flee ? 18 : 50 + Math.floor(Math.random() * 60);
        this.vx = this.facing * this.def.speed * (flee ? 1.6 : 1);
        this.vy = -(3.2 + Math.random() * 0.8);
      }
    } else {
      this.vx = this.facing * this.def.speed * (flee ? 2.2 : 1);
    }

    // 可游泳生物（鸭子）：浮在水上
    if (this.def.water && inWater) {
      this.vy -= 0.3;
      this.vy *= 0.92;
      this.vx *= 0.95;
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall && this.onGround) this.facing = -this.facing;
  }

  /** 飞行 AI：绕巡航点飘，玩家靠近飞离 */
  private flyAI(game: GameHooks, flee: boolean, player: Player | null) {
    this.flyMove(game, flee, player, false);
  }

  /** 飞行移动核心。landing=true 时关闭悬停改用重力下落找地面 */
  private flyMove(game: GameHooks, flee: boolean, player: Player | null, landing: boolean) {
    const steer = 0.09;
    if (flee && player) {
      const dx = this.cx - player.cx, dy = this.cy - player.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * steer * 3;
      this.vy += (dy / d) * steer * 3;
      this.facing = dx > 0 ? 1 : -1;
    } else if (this.def.perch) {
      // 鸟类：持久航向直线巡航，每 2-5 秒小角度改向（±35°），飞出画面自然销毁
      if (--this.headingT <= 0) {
        this.headingT = 120 + Math.floor(Math.random() * 200);
        this.heading += (Math.random() - 0.5) * 1.2;
      }
      this.vx += Math.cos(this.heading) * steer;
      this.vy += Math.sin(this.heading) * steer * 0.4;
      this.facing = this.vx > 0 ? 1 : -1;
    } else {
      // 蝴蝶/萤火虫：小范围低空飘（不远离出生地太多）
      if (--this.wanderT <= 0) {
        this.wanderT = 50 + Math.floor(Math.random() * 100);
        this.target = {
          x: this.cx + (Math.random() - 0.5) * 130,
          y: this.cy + (Math.random() - 0.5) * 60,
        };
      }
      const t = this.target ?? { x: this.cx, y: this.cy };
      const dx = t.x - this.cx, dy = t.y - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * steer;
      this.vy += (dy / d) * steer;
      this.facing = dx > 0 ? 1 : -1;
    }
    this.vx *= 0.96; this.vy *= 0.96;
    const spd = Math.hypot(this.vx, this.vy);
    const max = this.def.speed * (flee ? 2 : 1);
    if (spd > max) { this.vx = (this.vx / spd) * max; this.vy = (this.vy / spd) * max; }
    if (landing) {
      // 降落模式：重力下落 + 保留水平漂移，落地由外层接管
      this.vy = Math.min(this.vy + GRAVITY * 0.5, MAX_FALL_SPEED * 0.6);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) this.vx = -this.vx * 0.6;
    if (this.hitHead) this.vy = -Math.abs(this.vy) * 0.6;
    if (this.onGround) this.vy = -Math.abs(this.vy) - 0.4;
  }

  /** 被击中即死：红色血粒子 + 死亡音效（原版小动物死亡走通用 NPC_Killed 槽） */
  hurt(game: GameHooks): boolean {
    if (this.iframes > 0) return false;
    this.dead = true;
    game.spawnParticles(this.cx, this.cy, '#C03030', 6, 1.8);
    game.spawnParticles(this.cx, this.cy, '#8A1818', 4, 1.2);
    // 小动物死亡声：与史莱姆一致（NPC_Killed_1）；
    // 主角击杀与怪物碾压都走这里，两条路径音效完全一致
    game.playSfxFiles(['NPC_Killed_1'], 0.8);
    return true;
  }

  draw() { /* Renderer 统一绘制 */ }
}
