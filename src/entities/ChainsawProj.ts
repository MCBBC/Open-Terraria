// 屠夫链锯 3098 → 弹 509（AI_020 :23837-23949）：channel 持械——挂玩家手
// （position=MountedCenter−size/2）、velocity=瞄准向（每帧直写）、松链即 Kill；
// 2 帧 2t/帧 旋转动画；Item189 每 20t（链锯音）；rotation = atan2(vy,vx)+π/2 +
// 链锯朝向修正（原版 +1.57）；尘 31 火花（1/6 概率、vy −0.15×7-12 反溅）。
// 命中 = 弹盒（22×22）持续判定 + 同敌 10t 免疫（原版 penetrate -1 走
// localNPCHitCooldown 通道，此处 10t 冷却近似——1.4.5.6 ai20 无 -1 特判）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playEnemyHitSound } from './projTargets';

interface SawOwner { cx: number; cy: number; facing: number; dead: boolean }

export class ChainsawProj extends Entity {
  w = 22; h = 22;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  private frame = 0;
  private frameCtr = 0;
  private sndT = 0;
  private hitCd = new Map<number, number>();
  private owner: SawOwner;
  channelCb: () => boolean;
  aimCb: () => { x: number; y: number };
  dead = false;
  /** 绘制 scale（SetDefaults 509 = 1.2） */
  private drawScale = 1.2;

  constructor(owner: SawOwner, damage: number, knockback: number,
    channelCb: () => boolean, aimCb: () => { x: number; y: number }) {
    super();
    this.owner = owner;
    this.damage = damage;
    this.knockback = knockback;
    this.channelCb = channelCb;
    this.aimCb = aimCb;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // channel 门（:23896-23905）：断链即 Kill
    if (!this.channelCb()) { this.dead = true; return; }
    // 2 帧 2t/帧（:23846-23856 type 509 分支）
    if (++this.frameCtr >= 2) { this.frameCtr = 0; this.frame = 1 - this.frame; }
    // 链锯音（:23857-23868：非镐 509 → Item189 每 20t）
    if (--this.sndT <= 0) {
      this.sndT = 20;
      game.playSfxFiles(['Item_189'], 1, this.cx, this.cy);
    }
    // 挂手（:23914-23916：position = MountedCenter − size/2）
    this.x = this.owner.cx - this.w / 2;
    this.y = this.owner.cy - this.h / 2;
    // 瞄准向（:23871-23901：vel = 鼠标世界位 − 手位）
    const aim = this.aimCb();
    this.vx = aim.x - this.owner.cx;
    this.vy = aim.y - this.owner.cy;
    // 尘 31 火花（:23939-23948：1/6、前向偏 0.6-0.9×vel、反溅）
    if (Math.random() < 1 / 6) {
      game.spawnParticles(
        this.cx + this.vx * 0.06 * (6 + Math.random() * 4) / 10 * 10,
        this.cy + this.vy * 0.06,
        '#D8B878', 1, 1.4, { life: 18, grav: -0.15 });
    }
    // 命中（弹盒持续 + 10t 冷却）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(509);
    const ctx = r.canvas.getContext('2d');
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const frames = Math.max(1, Math.round(img.height / img.width));
    const fh = img.height / frames;
    const idx = Math.min(frames - 1, this.frame % frames);
    const rot = Math.atan2(this.vy, this.vx) + Math.PI / 2 + 1.57;   // :23917（+π/2 贴图纵向 +1.57 链锯修正）
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(rot);
    if (this.vx < 0) ctx.scale(1, -1);
    ctx.imageSmoothingEnabled = false;
    const dw = img.width * this.drawScale, dh = fh * this.drawScale;
    ctx.drawImage(img, 0, idx * fh, img.width, fh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}
