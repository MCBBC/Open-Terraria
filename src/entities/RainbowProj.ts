// 彩虹枪（Rainbow Gun 1260）弹链 1:1：
//   250 彩虹头（SetDefaults :3054）：12×12 aiStyle46 magic alpha255【隐形】
//     （GetAlpha :76643 return Transparent——本体从不显示）penetrate-1 ignoreWater。
//     AI_046（:26685-26742）：每 2t（localAI[0]>4→重置 3）铺一片 251 段；
//     ai[0] 计数（上升时 ×(1−vy/3) 加速计）>30 后 vy+=0.5 重力 + vx 按升降
//     ×0.95/×1.05——彩虹头呈抛物拱弧；速度恒归一到 15.95；rotation=atan2−π/2；
//     timeLeft 钳 2400；撞块即亡（tileCollide 默认 true）。
//   251 彩虹段（SetDefaults :3067）：14×14 aiStyle46 friendly magic penetrate-1
//     scale1.25 light0.3 tileCollide=false；首帧锁 rotation=弹头方向、timeLeft=2400
//     （≈40s 持续）；alpha 生命周期（:26758-26770）：首 10t 淡入（255→0）、
//     中段恒 0（全显）、末 10t 淡出（GetAlpha :76647 亮度=255−alpha）；
//     命中 usesIDStaticNPCImmunity + idStaticNPCHitCooldown 10——【全段共享】
//     同一敌每 10t 至多吃一段伤害（静态按弹型免疫表，非每段独立）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playEnemyHitSound } from './projTargets';

/** 251 静态免疫表（原版 usesIDStaticNPCImmunity：按弹型共享，非每段独立）。
 *  表项 = 敌 id → 到期时刻（共享钟，多段同 tick 不会重复衰减冷却——
 *  每段自衰减会让 N 段把 10t 压缩成 10/N t，实测踩坑）。 */
const segImmuneUntil = new Map<number, number>();
/** 共享钟（60tps → 1t=16.67ms；测试经 _setRainbowClock 注入假钟） */
let nowMs: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const IMMUNE_MS = 10 * (1000 / 60);

/** 测试钩子：替换共享钟（彩虹段静态免疫表用） */
export function _setRainbowClock(fn: (() => number) | null): void {
  nowMs = fn ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
}

export class RainbowSegment extends Entity {
  w = 14; h = 14;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** GetAlpha 亮度源（255=隐 … 0=全显） */
  alpha = 255;
  /** 剩余寿命（原版 timeLeft，首帧钳 2400） */
  private life = 3600;
  /** 首帧初始化标记（localAI[0]==0 分支） */
  private init = false;
  private rot: number;
  dead = false;
  /** 弹体点光（SetDefaults light 0.3） */
  lightRGB: [number, number, number] | null = [0.3, 0.3, 0.3];

  constructor(x: number, y: number, dirX: number, dirY: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.damage = damage;
    this.knockback = knockback;
    this.rot = Math.atan2(dirY, dirX) - Math.PI / 2;   // 首帧锁（:26748-26754）
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 首帧 timeLeft=2400（AI_046 :26755 localAI[0]==0 分支）
    if (!this.init) { this.init = true; this.life = 2400; }
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }
    // alpha 生命周期（:26758-26770）
    if (this.life < 10) this.alpha = 255 - Math.floor(255 * this.life / 10);       // 淡出
    else if (this.life > 2390) this.alpha = 255 - Math.floor(255 * (2400 - this.life) / 10); // 淡入
    else this.alpha = 0;                                                            // 中段全显
    // 命中（穿透 -1 + 同型静态 10t 冷却；免疫表按需扩容清理过期项防无界增长）
    if (segImmuneUntil.size > 512) {
      const t0 = nowMs();
      for (const [k, v] of segImmuneUntil) if (v <= t0) segImmuneUntil.delete(k);
    }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const until = segImmuneUntil.get(e.id) ?? 0;
      if (until > nowMs()) continue;
      segImmuneUntil.set(e.id, nowMs() + IMMUNE_MS);
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.x - e.x) * this.knockback, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.y, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(251);
    const ctx = r.canvas.getContext('2d');
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const a = Math.max(0, Math.min(1, (255 - this.alpha) / 255));   // GetAlpha 亮度=255−alpha
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    // 绘制锚（Main.cs:29886 num143=18/num144=−10：贴图中心 = 盒中心 + (−10,−18)
    // ——段贴图骑在弹道上方而非盒心，2026-08-13 复查修正）
    ctx.translate(this.cx - 10, this.cy - 18);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    // scale 1.25（SetDefaults）——32×32 贴图 → 40×40
    ctx.drawImage(img, -20, -20, 40, 40);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export class RainbowBolt extends Entity {
  w = 12; h = 12;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** ai[0] 拱弧计时（>30 起重力） */
  private ai0 = 0;
  /** localAI[0] 铺段节拍（>4 → 铺并重置 3 = 每 2t） */
  private lai0 = 0;
  private life = 3600;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.life > 2400) this.life = 2400;            // timeLeft 钳（:26703-26706）
    // 铺段（:26698-26702：localAI[0]>4 → 重置 3 = 每 2t 一片）
    this.lai0 += 1;
    if (this.lai0 > 4) {
      this.lai0 = 3;
      const seg = new RainbowSegment(this.cx, this.cy, this.vx, this.vy, this.damage, this.knockback);
      seg.critChance = this.critChance;
      seg.armorPen = this.armorPen;
      (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(seg, 'projectiles');
    }
    // 拱弧物理（:26708-26721）：ai[0] += 1（上升 vy<0 时更快）；>30 后 vy+=0.5
    // + vx×(0.95|1.05)（下落阻/升加速）——彩虹头走拱形
    let step = 1;
    if (this.vy < 0) step -= this.vy / 3;
    this.ai0 += step;
    if (this.ai0 > 30) {
      this.vy += 0.5;
      this.vx *= this.vy > 0 ? 0.95 : 1.05;
    }
    // 速度恒归一 15.95（:26723-26731）
    const sp = Math.hypot(this.vx, this.vy) || 1;
    this.vx = this.vx / sp * 15.95;
    this.vy = this.vy / sp * 15.95;
    this.x += this.vx;
    this.y += this.vy;
    // 撞块即亡（tileCollide 默认 true）——出界同亡
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    if (!st.inBounds(tx, ty) || st.isSolid(tx, ty)) this.dead = true;
  }

  draw(_r: unknown): void {
    /* 本体恒隐形（GetAlpha :76643 return Transparent）——只铺段不显示 */
  }
}
