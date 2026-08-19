// 日耀喷发 3473 → 611 链鞭 + 612 爆焰（AI_075 共享壳下 611 专属段 :63918-63956 +
// 出生链 Player.cs:48059-48063 + 绘制 Main.cs:32061-32115 + AI_117 爆焰 :33299-33320）：
//   611：首帧 Item116；alpha −42/t 渐显；localAI[0]=初速角；ai[1]=出生抖动 ±π/8；
//     旋进 spinningpoint = (num50×(ai0/30×2π−π/2)).ToRotationVector2，Y×sin(ai[1])
//     （ai[1]≤0 翻两处），再旋 localAI[0]；ai[0]<30 每 tick velocity += 48×spin
//     （链鞭甩出）否则 Kill。命中 AddBuff 189(Daybreak) 300t + 每 4t 一发 612
//     （落点敌中心，ai[2]=0.85+rand×1.15 缩放）；免疫 4t。
//   611 绘制 = 链条拼装：帧头 (0,2,30,40) 旋转 vel+π、origin(15,16)−(0,4)；
//     身段 (0,68,30,18) 沿 vel 向平铺至 (|vel|+16−40)px；第二层 (0,46,30,18)
//     （本仓单层近似，双层视觉差异小备案）。
//   612（AI_117）：scale = ai[1]（0.85+rand×1.15 起，每 tick +0.01）；帧 3t/帧 ×5；
//     ai[0]≥15 消亡；命中 AddBuff 189。贴图 52×260 = 5 帧 52px。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playEnemyHitSound, playerCanHitEnemy } from './projTargets';

/** Daybreak（BuffType 189）——611/612 命中授予 300t（:10703-10708）；无 Buff 表直写计时 */
function applyDaybreak(e: Record<string, number>): void {
  e.daybreakT = Math.max(e.daybreakT ?? 0, 300);
}

export class SolarFlare extends Entity {
  w = 8; h = 8;
  damage: number;
  critChance = 0.04;
  armorPen = 0;
  /** ai[1] 缩放基（出生 0.85+rand×1.15） */
  private sc: number;
  private ai0 = 0;
  private frame = 0;
  private frameCtr = 0;
  private hitCd = new Map<number, number>();
  dead = false;
  lightRGB: [number, number, number] | null = [0.6, 0.3, 0.05];

  constructor(x: number, y: number, damage: number, sc: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.damage = damage;
    this.sc = sc;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.ai0++;
    this.sc += 0.01;                                   // scale = ai[1]+0.01/t（:33302-33304）
    if (this.ai0 >= 15) { this.dead = true; return; }  // 3×5 帧（:33306-33309）
    if (++this.frameCtr >= 3) { this.frameCtr = 0; if (++this.frame >= 5) this.frame = 0; }
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitCd.has(e.id)) continue;
      const reach = 40 * this.sc;                      // 爆焰视觉半径命中盒近似
      if (!(this.cx - reach < e.x + e.w && this.cx + reach > e.x && this.cy - reach < e.y + e.h && this.cy + reach > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, 0, 0, game, this.armorPen, crit);
      applyDaybreak(e as unknown as Record<string, number>);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 4);
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(612);
    const ctx = r.canvas.getContext('2d');
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const fw = 52, fh = img.height / 5;
    const dw = fw * this.sc, dh = fh * this.sc;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(this.cx, this.cy);
    ctx.drawImage(img, 0, this.frame * fh, fw, fh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

export class SolarEruptionWhip extends Entity {
  w = 16; h = 16;
  damage: number;
  critChance = 0.04;
  armorPen = 0;
  /** ai[1] 出生抖动（(rand−0.5)×π/4，Player.cs:48060） */
  private ai1: number;
  /** localAI[0] 初速角 */
  private aimAng: number;
  /** ai[0] 计数（30 Kill） */
  private ai0 = 0;
  /** localAI[1] 612 节流（4t） */
  private lai1 = 0;
  private alpha = 255;
  private hitCd = new Map<number, number>();
  dead = false;
  lightRGB: [number, number, number] | null = [0.5, 0.25, 0.05];

  constructor(vx: number, vy: number, damage: number) {
    super();
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.ai1 = (Math.random() - 0.5) * Math.PI / 4;
    this.aimAng = Math.atan2(vy, vx);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (this.ai0 === 0) game.playSfxFiles(['Item_116'], 1, this.cx, this.cy);
    if (this.lai1 > 0) this.lai1--;
    this.alpha = Math.max(0, this.alpha - 42);
    // 旋进（:63932-63945）
    let num50 = Math.cos(this.aimAng) >= 0 ? 1 : -1;
    if (this.ai1 <= 0) num50 *= -1;
    const ang = num50 * (this.ai0 / 30 * Math.PI * 2 - Math.PI / 2);
    let sx = Math.cos(ang), sy = Math.sin(ang);
    sy *= Math.sin(this.ai1);
    if (this.ai1 <= 0) sy *= -1;
    const ca = Math.cos(this.aimAng), sa = Math.sin(this.aimAng);
    const spx = sx * ca - sy * sa, spy = sx * sa + sy * ca;
    this.ai0++;
    if (this.ai0 < 30) {
      this.vx += 48 * spx;
      this.vy += 48 * spy;
    } else {
      this.dead = true; return;
    }
    this.x += this.vx;
    this.y += this.vy;
    // 命中：16×16 盒 + Daybreak + 4t 节流出 612
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; cx: number; cy: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitCd.has(e.id)) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.vx) * 2, 0, game, this.armorPen, crit);
      applyDaybreak(e as unknown as Record<string, number>);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 4);
      if (this.lai1 <= 0) {                            // 612 节流（:13229-13236）
        this.lai1 = 4;
        const flare = new SolarFlare(e.cx, e.cy, this.damage, 0.85 + Math.random() * 1.15);
        flare.critChance = this.critChance;
        flare.armorPen = this.armorPen;
        (game as unknown as { entities: { add: (en: unknown, b: string) => void } }).entities.add(flare, 'projectiles');
      }
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(611);
    const ctx = r.canvas.getContext('2d');
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    if (this.vx === 0 && this.vy === 0) return;
    const op = Math.max(0, 1 - this.alpha / 255);
    if (op <= 0.02) return;
    const spd = Math.hypot(this.vx, this.vy);
    const vlen = spd || 1;
    const ux = this.vx / vlen, uy = this.vy / vlen;
    const rot = Math.atan2(this.vy, this.vx) + Math.PI;   // rotation = vel 角 + π
    // 帧头 (0,2,30,40)：origin(15,16)−(0,4)
    ctx.save();
    ctx.globalAlpha = op;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(rot);
    ctx.drawImage(img, 0, 2, 30, 40, -15, -12, 30, 40);
    ctx.restore();
    // 身段 (0,68,30,18) 沿 vel 平铺至 (|vel|+16−40)px（:32073-32091）
    let remain = spd + 16 - 40;
    if (remain > 0) {
      let px = this.cx + ux * 24, py = this.cy + uy * 24;
      while (remain > 0) {
        const seg = Math.min(18, remain);
        ctx.save();
        ctx.globalAlpha = op;
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI);
        ctx.drawImage(img, 0, 68, 30, Math.round(seg), -15, 0, 30, Math.max(1, seg));
        ctx.restore();
        px += ux * seg; py += uy * seg;
        remain -= seg;
      }
    }
    ctx.globalAlpha = 1;
  }
}
