// 召唤物实体（R6）：随从（飞行/地面通用 AI 近似）与哨兵（定点炮台）。
// 原版各随从 aiStyle（62/66/26/121/156/164/197…）行为高度定制，本实体按三大类
// 近似（数值=武器 combat 表；上限/驱逐/召回语义取 Player.maxMinions 链）：
//   flying：悬停玩家侧后环形槽位 → 锁定最近敌 ≤700px 俯冲突进（接触伤害+同敌冷却）
//           → >1300px 瞬移回玩家（原版 minion 回收语义）
//   ground ：重力+碰撞，地面追击最近敌，接触伤害
//   sentry ：定点（施法点），每 60t 朝最近敌 ≤600px 射一弹（Arrow 复用）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Arrow, projFrameImg, projFrameCount } from './Arrow';

/** 敌人最小形状（鸭子类型，避免与 Enemy 循环依赖） */
interface EnemyLike {
  cx: number; cy: number; x: number; y: number; w: number; h: number; id: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
}

/** 接触伤害的每敌冷却表（原版 npc.immune[owner]≈10t） */
export class MinionHitCd {
  private map = new Map<number, number>();
  ready(id: number, cd: number): boolean {
    const t = this.map.get(id) ?? 0;
    if (t > 0) { this.map.set(id, t - 1); return false; }
    this.map.set(id, cd);
    return true;
  }
}

export class MinionProj extends Entity {
  w = 16; h = 16;
  dead = false;
  damage: number;
  knockback: number;
  projId: number;
  /** true=哨兵（定点炮台，独立于随从上限） */
  sentry: boolean;
  /** 哨兵剩余寿命（t；随从不耗） */
  life: number;
  /** 同列槽位序（多随从环形悬停错位） */
  slot: number;
  private ownerRef: () => Player | null;
  private hitCd = new MinionHitCd();
  private shootCd = 0;
  /** 地面型重力 */
  private ground: boolean;
  onGround = false;
  /** 存活 tick（多帧贴图动画驱动） */
  age = 0;

  constructor(
    x: number, y: number, projId: number, damage: number, knockback: number,
    sentry: boolean, slot: number, ground: boolean,
    owner: () => Player | null,
  ) {
    super();
    this.x = x; this.y = y;
    this.projId = projId;
    this.damage = damage;
    this.knockback = knockback;
    this.sentry = sentry;
    this.slot = slot;
    this.ground = ground;
    this.life = sentry ? 60 * 600 : Infinity; // 哨兵 10 分钟（哨兵类默认时限近似）
    this.ownerRef = owner;
  }

  /** 最近敌人（无目标 null）——鸭子类型最小形状 */
  private nearestEnemy(game: GameHooks, maxRange: number): EnemyLike | null {
    const p = this.ownerRef();
    if (!p) return null;
    let best: EnemyLike | null = null;
    let bestD = maxRange;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean };
      if (!en || en.dead) continue;
      const d = Math.hypot(en.cx - this.cx, en.cy - this.cy);
      if (d < bestD) { bestD = d; best = en; }
    }
    return best;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    this.age++;
    if (this.sentry) {
      if (--this.life <= 0) { this.dead = true; return; }
      // 哨兵：定点炮台，60t 一发
      const tgt = this.nearestEnemy(game, 600);
      if (tgt) {
        this.shootCd--;
        if (this.shootCd <= 0) {
          this.shootCd = 60;
          const ang = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
          const owner = this.ownerRef();
          const dmg = Math.max(1, Math.round(this.damage * (owner ? owner.damageMult('magic') : 1)));
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            new Arrow(this.cx, this.cy, Math.cos(ang) * 6, Math.sin(ang) * 6, dmg, this.knockback, this.projId, null),
            'projectiles');
        }
      }
      return;
    }
    // 随从
    const p = this.ownerRef();
    if (!p) { this.dead = true; return; }
    const tgt = this.nearestEnemy(game, 700);
    if (!this.ground) {
      // 飞行：无目标 → 环形槽位悬停玩家侧后；有目标 → 俯冲
      if (tgt) {
        const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 5;
        this.vy = (dy / d) * 5;
      } else {
        const hoverAng = this.slot * Math.PI * 0.5;
        const hx = p.cx - p.facing * 36 + Math.cos(hoverAng) * 22;
        const hy = p.cy - 30 + Math.sin(hoverAng) * 18;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const spd = Math.min(4, d * 0.08);
        this.vx = (dx / d) * spd;
        this.vy = (dy / d) * spd;
      }
      this.x += this.vx;
      this.y += this.vy;
      // 回收（Minion Removal ：>1300px 瞬移回玩家）
      if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 1300) {
        this.x = p.cx - p.facing * 30;
        this.y = p.cy - 30;
      }
    } else {
      // 地面：重力+碰撞追击
      if (tgt) {
        this.vx += Math.sign(tgt.cx - this.cx) * 0.12;
        this.vx = Math.max(-3.5, Math.min(3.5, this.vx));
        if (this.onGround && tgt.cy < this.cy - 24 && Math.random() < 0.03) this.vy = -5; // 小跳追高
      } else {
        this.vx *= 0.9;
        // 跟随玩家（距离大时小跑）
        const dx = p.cx - this.cx;
        if (Math.abs(dx) > 60) this.vx = Math.max(-2.5, Math.min(2.5, dx * 0.02));
      }
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, this.vx, this.vy);
    }
    // 接触伤害（同敌 20t 冷却；伤害吃玩家 summon≈magic 乘区）
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean };
      if (en.dead) continue;
      if (!(this.x < en.x + en.w && this.x + this.w > en.x && this.y < en.y + en.h && this.y + this.h > en.y)) continue;
      if (!this.hitCd.ready(en.id, 20)) continue;
      const dmg = Math.max(1, Math.round(this.damage * p.damageMult('magic')));
      en.hurt(dmg, Math.sign(en.cx - this.cx) * this.knockback * 0.5, -1, game);
    }
    // 玩家死亡/过远不消失（原版随从持续到上限驱逐或卸装）——仅跟随
    void TILE;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    // 世界坐标绘制（Renderer 实体循环在世界变换内）——投射物贴图懒加载通道同 Arrow。
    // 原版投射物贴图是竖向多帧行（projFrames 表）：按帧高切片 + age 驱动动画，
    // 1:1 像素尺寸（整图压 32px 会把 12 帧行压成胶片条）
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const frames = projFrameCount(this.projId);
    const frame = frames > 1 ? Math.floor(this.age / 8) % frames : 0;
    const img = projFrameImg(this.projId, frame);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.imageSmoothingEnabled = false;
    if (img) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      // 兜底：召唤符记色块（哨兵紫 / 随从金）——贴图缺失或懒加载未就绪
      ctx.fillStyle = this.sentry ? '#B080FF' : '#FFD060';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(-8, -8, 16, 16);
    }
    ctx.restore();
  }
}
