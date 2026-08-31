// 波涌之刃 2880 → 弹 451（aiStyle 81 内联段 Projectile.cs:29896-30060，
// 出生链 Player.cs:48616-48618：ai[0]=-1 初值）：
//   阶段 -1（掷出）：tileCollide 开；spdN=max(1,|v|/11)；7t 起尾尘；
//     scale −0.01×spdN / alpha +5×spdN 钳 75（渐显蓄势）→ ai[0]=0；
//     rotation = vel 角+π/4。
//   阶段 0（折返）：同尘；scale −0.01 / alpha +75 钳 255 → ai[0]=1（进入瞬击）。
//   阶段 1..penetrate（瞬击穿梭）：tileCollide 关；alpha +15×spdN、vel ×0.98/spdN；
//     每帧 250px 内最近敌；alpha≥255 时：ai[0]==1 → Kill（末段）；
//     有敌 → ai[0]+=penetrate、瞬移敌旁 100px 随机环、vel=朝敌 15、rotation 同步；
//     无敌 → Kill。瞬击间跟随目标速度（position += target.velocity）。
//   命中免疫：首段免疫穿透档（:11782 族名单 451 首段单跳）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { canBeChasedBy, playerCanHitEnemy, applyBannerDamageDealt } from './projTargets';
import { projectileSnapStrikeBonus } from '../stats/SnapStrike';

export class TideSlash extends Entity {
  w = 16; h = 16;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** ai[0]：-1 掷出 / 0 折返 / ≥1 瞬击段索引（+penetrate 递进，==1 末段） */
  private ai0: number;
  /** localAI[0] 阶段内计数 */
  private lai0 = 0;
  private alpha = 0;
  private rot = 0;
  private penetrate: number;
  private hitSet = new Set<number>();
  private hitCd = new Map<number, number>();
  dead = false;
  lightRGB: [number, number, number] | null = [0.4, 0.5, 0.9];

  constructor(vx: number, vy: number, damage: number, knockback: number, penetrate: number) {
    super();
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.penetrate = Math.max(1, penetrate);
    this.ai0 = -1;
    this.rot = Math.atan2(vy, vx) + Math.PI / 4;
  }

  private get spdN(): number { return Math.max(1, Math.hypot(this.vx, this.vy) / 11); }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.lai0++;
    // 尾尘（两阶段共用：7t 起随机 226/229）
    if (this.lai0 > 7 && Math.random() < 0.4) {
      game.spawnParticles(this.cx - 8, this.cy + 8, Math.random() < 0.5 ? '#8CB8FF' : '#B8E0FF',
        1, 0.6, { life: 18 });
    }
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    if (this.ai0 === -1) {
      // 掷出（:29900-29942）：alpha += 5×spdN，钳 75 达成 → ai0=0
      this.alpha = Math.min(75, this.alpha + 5 * this.spdN);
      if (this.alpha >= 75) { this.ai0 = 0; this.lai0 = 0; }
      this.moveAndHit(game);
    } else if (this.ai0 === 0) {
      // 折返（:29943-29987）：alpha +75 钳 255 → ai0=1
      this.alpha = Math.min(255, this.alpha + 75);
      if (this.alpha >= 255) { this.ai0 = 1; this.lai0 = 0; }
      this.moveAndHit(game);
    } else {
      // 瞬击穿梭（:29990-30052）
      this.alpha = Math.min(255, this.alpha + 15 * this.spdN);
      const damp = 0.98 / this.spdN;
      this.vx *= damp; this.vy *= damp;
      this.lai0 = 0;
      // 250px 最近敌
      let target: { cx: number; cy: number; vx: number; vy: number } | null = null, bd = 250;
      for (const ent of game.enemies()) {
        const e = ent as unknown as { cx: number; cy: number; vx: number; vy: number; dead: boolean };
        if (!canBeChasedBy(ent)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
        if (e.dead) continue;
        const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
        if (d < bd) { bd = d; target = e; }
      }
      if (this.alpha >= 255) {
        if (this.ai0 === 1) { this.dead = true; return; }   // 末段消亡（:30020-30024）
        if (target) {
          this.ai0 += this.penetrate;
          const a = Math.random() * Math.PI * 2;
          this.x = target.cx + Math.cos(a) * 100 - this.w / 2;
          this.y = target.cy + Math.sin(a) * 100 - this.h / 2;
          const dl = Math.hypot(target.cx - this.cx, target.cy - this.cy) || 1;
          this.vx = (target.cx - this.cx) / dl * 15;
          this.vy = (target.cy - this.cy) / dl * 15;
          this.lai0 = 0;
          this.alpha = 255;
        } else {
          this.dead = true; return;
        }
      }
      if (target) { this.x += target.vx; this.y += target.vy; }   // 骑乘目标速度（:30047-30049）
      this.moveAndHit(game);
    }
    this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 4;
  }

  private moveAndHit(game: GameHooks): void {
    this.x += this.vx;
    this.y += this.vy;
    // 撞块：瞬击段关碰撞，掷出/折返开（原版 tileCollide 开 + 无反弹分支=消亡）
    const st = game.world.store;
    const tx = Math.floor(this.cx / 16), ty = Math.floor(this.cy / 16);
    if (this.ai0 < 1 && st.inBounds(tx, ty) && st.isSolid(tx, ty)) {
      game.spawnParticles(this.cx, this.cy, '#8CB8FF', 6, 2, { life: 22 });
      this.dead = true; return;
    }
    if (!st.inBounds(tx, ty)) { this.dead = true; return; }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitSet.has(e.id) || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★F3 接线（蓝队四轮）：波涌之刃弹 451 数据面 melee（SetDefaults 类旗投影）→
      // 焰爆石/拍击石双支（Projectile.cs:13439-13446）随 Damage() 生效；加伤在 banner
      // 采样外、随暴击并入实伤参（序注见 stats/SnapStrike.ts F1 迁移）
      const snapBonusTide = projectileSnapStrikeBonus(game,
        { projId: 451 }, e.x + e.w / 2, e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: e.x + e.w / 2, cy: e.y + e.h / 2 },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusTide ? Math.trunc(snapBonusTide * (crit ? 2 : 1)) : 0),
        Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      this.hitSet.add(e.id);
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(451);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const op = Math.max(0, Math.min(1, 1 - this.alpha / 255));
    if (op <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = op;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
