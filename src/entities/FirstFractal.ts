// 初代分形剑 4722 → 弹 857（AI_168_FirstFractal :43886-43920 + 出生链
// Player.cs:47400-47447）：channel（useTime=anim/5 每挥 5 发）。出生：
//   目标=GetSparkleGuitarTarget 随机可追敌（+预测 20t 速度）或鼠标位（±24px 散布、
//   距离钳 700、方向混入玩家速度 ×0.8）；弹速 12+rand×2；ai[0]=±π/120 曲率；
//   出生点=目标−∫30 步旋转弧（vector40，从弧尾入场的飞刀感）。
//   AI：60t 消亡；帧=rand(15)；vel.RotatedBy(ai0)；Opacity 淡入 12t/末 12t；
//   rotation=π/4×spriteDir+vel 角（左向 +π）；尘 278 尾（1/15，>7t）。
//   绘制：Projectile_857 帧条（贴图尺寸待运行期取），×Opacity。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { hitTownNpcs, playerCanHitEnemy } from './projTargets';

export class FirstFractalSlash extends Entity {
  w = 32; h = 32;
  damage: number;
  critChance = 0.04;
  armorPen = 0;
  /** ai[0] 每 tick 曲率（±π/120） */
  private ai0: number;
  /** localAI[0] 计数（60 消亡） */
  private t = 0;
  private frame: number;
  private opacity = 0;
  private rot = 0;
  private hitSet = new Set<number>();
  dead = false;
  lightRGB: [number, number, number] | null = [0.5, 0.7, 1];

  constructor(x: number, y: number, vx: number, vy: number, damage: number, ai0: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.ai0 = ai0;
    this.frame = Math.floor(Math.random() * 15);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (++this.t >= 59) { this.dead = true; return; }
    // vel 旋转（:43901）
    const c = Math.cos(this.ai0), s = Math.sin(this.ai0);
    const nvx = this.vx * c - this.vy * s, nvy = this.vx * s + this.vy * c;
    this.vx = nvx; this.vy = nvy;
    // Opacity 淡入 12t/末 12t（:43903）
    const LIFE = 60;
    const in01 = Math.min(1, this.t / 12);
    const out01 = this.t <= LIFE - 12 ? 1 : Math.max(0, (LIFE - this.t) / 12);
    this.opacity = in01 * out01;
    const sd = this.vx > 0 ? 1 : -1;
    this.rot = Math.PI / 4 * sd + Math.atan2(this.vy, this.vx) + (sd === -1 ? Math.PI : 0);
    this.x += this.vx;
    this.y += this.vy;
    // 尘 278 尾（1/15，>7t）
    if (this.t > 7 && Math.random() < 1 / 15) {
      game.spawnParticles(this.cx, this.cy, Math.random() < 0.7 ? '#7CB8FF' : '#FFFFFF', 1, 1.2, { life: 20 });
    }
    // 命中（穿透 -1；localNPCHitCooldown=10）
    // 城镇 NPC 巫毒窄门（Damage_PVE_Inner :11970-11972——玩家弹族同门；无娃娃 no-op）
    hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 6.5, 'playerProj', 0);
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitSet.has(e.id)) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      e.hurt(dmg, Math.sign(this.vx) * 6.5, 0, game, this.armorPen, crit);   // 音/飘值=单点
      this.hitSet.add(e.id);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(857);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    if (this.opacity <= 0.02) return;
    const frames = Math.max(1, Math.round(img.height / img.width));
    const fh = img.height / frames;
    const idx = Math.min(frames - 1, this.frame % frames);
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    if (this.vx < 0) ctx.scale(1, -1);
    ctx.drawImage(img, 0, idx * fh, img.width, fh,
      -img.width / 2, -fh / 2, img.width, fh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
