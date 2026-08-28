// 滚石弹（原版 Projectile 99 aiStyle=25 RollingBall 家族）：Check2x2 摧毁巨石
// 贴图时生成（WorldGen.cs:49171-49235 各 sheet 一张 NewProjectile 表，表值经
// BoulderMech.BOULDER_CONVERT_TABLE 查询）。
// AI 常量（Projectile.cs aiStyle==25 主链 26358-26734 的非 1055/1021 通用支）：
//   重力 +0.3/t、vy 帽 16；vy<=6 时横向加速 ±0.05 至 |vx|>=7（无地面摩擦——
//   原版滚动不停站）；rotation += vx*0.06；宽高 31、penetrate=-1、
//   friendly+hostile 双面命中、每目标免疫 10t（usesLocalNPCImmunity +
//   localNPCHitCooldown，Projectile.cs:10755-10762）。贴墙 X 碰撞无独立碎裂规则
//   （TileCollision 清 vx 后仍被 accel 推进；getgood 才 BoulderExplosion）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { moveAndCollide } from '../physics/TileCollision';
import { BOULDER_CONVERT_TABLE } from '../world/BoulderMech';
import { projSprite } from './Arrow';

const KB_X = 10;               // 出生 kb 第二参 = 10f

export class RollingBoulder extends Entity {
  w = 31; h = 31;
  /** 原版弹 id（Atlas: vanilla/Projectile_{id}.png） */
  readonly projId: number;
  /** timeLeft 基线（vanilla-projectiles.json 无覆盖 → 引擎通用 life 兜底同位） */
  life = 3600;
  /** 出生表伤害 */
  readonly dmg: number;
  rotation = 0;
  /** 每目标命中免疫：目标 id → 剩余 tick（localNPCHitCooldown=10 镜像） */
  private immunities = new Map<number, number>();

  constructor(x: number, y: number, sheet: number) {
    super();
    this.x = x; this.y = y;
    const row = BOULDER_CONVERT_TABLE[sheet];
    this.projId = row?.proj ?? 99;
    this.dmg = row?.dmg ?? 70;
  }

  /** ai[0]：首 tick 后恒 1（cs:26682）；静止自启支的前置门 */
  private ai0 = false;

  /** 实心探测（cs:26688-26708 用 WorldGen.SolidTile 双行） */
  private solidAt(game: GameHooks, tx: number, ty: number): boolean {
    const st = game.world.store;
    if (!st.inBounds(tx, ty)) return true;
    return st.isSolid(tx, ty);
  }

  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    for (const [id, t] of [...this.immunities]) {
      if (t <= 1) this.immunities.delete(id); else this.immunities.set(id, t - 1);
    }
    // ---- 静止自启（cs:26684-26711 verbatim 门：ai[0]!=0 && vy<=0 && vx==0）——
    // 落入柱龛停稳后朝开阔侧踢 ±0.5，三级探柱(0/16/32px 外扩)都堵则按 cx 奇偶定边
    if (this.ai0 && this.vy <= 0 && this.vx === 0) {
      const KICK = 0.5;
      const ty = Math.floor(this.y / 16);
      const solidCol = (tx: number): boolean =>
        this.solidAt(game, tx, ty) || this.solidAt(game, tx, ty + 1);
      const probe = (leftTx: number, rightTx: number): number => {
        if (solidCol(leftTx)) return 1;
        if (solidCol(rightTx)) return -1;
        return 0;
      };
      const cxL = Math.floor((this.x - 8) / 16);
      const cxR = Math.floor((this.x + this.w + 8) / 16);
      let dir = probe(cxL, cxR);
      if (dir === 0) dir = probe(cxL - 1, cxR + 1);
      if (dir === 0) {
        dir = probe(cxL - 2, cxR + 2);
        if (dir === 0) dir = (Math.floor(this.cx / 16) % 2 === 0) ? 1 : -1;
      }
      this.vx = dir * KICK;
    }
    this.ai0 = true;
    // ---- AI_025 运动核 ----
    if (this.vy <= 6) {
      if (this.vx > 0 && this.vx < 7) this.vx += 0.05;
      if (this.vx < 0 && this.vx > -7) this.vx -= 0.05;
    }
    this.vy = Math.min(this.vy + 0.3, 16);
    // 碰撞位移（Body 旗由 lib 维护：onGround/collideY/hitWall）
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.rotation += this.vx * 0.06;

    // ---- 生命周期 ----
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }

    // ---- 双面接触伤害（friendly+hostile → NPC 与玩家都结算）----
    for (const raw of game.enemies() as Array<Record<string, unknown>>) {
      const e = raw as unknown as {
        id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
        x: number; y: number; w: number; h: number; cx: number; cy: number;
        hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
      };
      if (!e || e.dead || e.friendly || e.immortal || e.dontTakeDamage) continue;
      if ((this.immunities.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      this.immunities.set(e.id, 10);
      const dir = e.cx >= this.cx ? 1 : -1;
      e.hurt?.(this.dmg, dir * KB_X, 0, game);
    }
    const p = game.player as { dead: boolean; iframes: number; x: number; y: number; w: number; h: number };
    if (!p.dead && p.iframes <= 0 && !(this.immunities.get(-1) ?? 0)) {
      if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
        this.immunities.set(-1, 10);
        game.damagePlayer(this.dmg, this.cx, this.cy, this);
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
