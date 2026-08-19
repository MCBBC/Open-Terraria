// Celebration 双持械枪 1:1（1.4.5.6 反编译）：
//   喜庆弹射器MK2 3930 → 持械弹 714（AI_075 :64072-64195）：channel 驱动每 8t
//     一发；出生 ai[0]=5×Next(0,20) 相位偏移，弹道变体 = ⌊ai0/8⌋%7 **确定循环**
//     （715-718 烟花弹的 ai0 即此变体）；Item156 节奏音；枪口彩虹尘
//     hslToRgb(ai0/90%1)；变体 3 速 +1、变体 5 三连（±2π/80）、变体 4 附
//     ai1=1（蛇形相位跳）。
//   派对机枪 3475 → 持械弹 615（AI_075 :63959-64071）：每 5t 一发 Item36，
//     子弹供弹（PickAmmo 默认 14），每 7 轮（⌊ai0/5⌋%7==0）附赠 616 彩带弹
//     Damage+20 / kb×1.25 / 速 8。
//   烟花弹 715-718（AI_147 :49974-50188，extraUpdates=2=3 update/tick）：
//     变体 0-6 弹道（0：20u 后 g0.12+沿途每 20u 空爆；1：10u 上抛 vy−10 后
//     g0.25+scale 长大 2.5+尘环；2：60u 后 g0.15；3：20u 起追踪 lerp 1/8 保速；
//     4：蛇形（垂直向 ×cos(t·π/45)×3，ai1=1 时起步相位 +45）；5：40u 后
//     g0.08；6：30u 后 g0.1），终端 vy 16、rotation=atan2+π/2、
//     GetCeleb2Color 变体光。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { playEnemyHitSound, playerCanHitEnemy } from './projTargets';

type EnemyLike = {
  x: number; y: number; w: number; h: number; id: number; dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean;
};

interface MuzzleOwner { cx: number; cy: number; facing: number; dead: boolean }

/** GetCeleb2Color（:49632-49645）：变体 0-6 色板 */
export const CELEB2_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 0, 0], [255, 140, 0], [255, 215, 0], [50, 205, 50],
  [65, 105, 225], [80, 20, 180], [255, 105, 180],
];

/** 单发开火指令（Game 注入：解析弹药 → 生成弹体 → 消耗 1；返回 false = 无弹药） */
export type CelebFireFn = (
  variant: number, x: number, y: number, vx: number, vy: number,
  opts: { bonusAi1: boolean; spreadRot: (ang: number) => { x: number; y: number } },
) => boolean;

// ================= 持械枪口 714（MK2）/ 615（派对机枪）（AI_075） =================

export class Celeb2Muzzle extends Entity {
  readonly projId: number;                          // 714 MK2 / 615 派对机枪
  w = 22; h = 22;
  dead = false;
  private owner: MuzzleOwner;
  /** ai[0]：tick 计（出生 5×Next(0,20) 相位偏移 :48376） */
  private ai0: number;
  /** ai[1]：volley 冷却（714: 8t / 615: 5t） */
  private ai1: number;
  private readonly volley: number;
  private frame = 0;
  private frameCtr = 0;
  private channelCb: () => boolean;
  private aimCb: () => { x: number; y: number };
  private fireCb: CelebFireFn;

  constructor(owner: MuzzleOwner, projId: 714 | 615,
    channelCb: () => boolean, aimCb: () => { x: number; y: number }, fireCb: CelebFireFn) {
    super();
    this.owner = owner;
    this.projId = projId;
    this.volley = projId === 714 ? 8 : 5;
    this.ai0 = 5 * Math.floor(Math.random() * 20);
    this.ai1 = 0;   // 出生 ai[1]=0（:48376 只传 ai0）→ 首 tick 即发第一发——
                    // 勿初始化成 volley 间隔（曾致 MK2 首发迟 8t，2026-08-14 review 修）
    this.channelCb = channelCb;
    this.aimCb = aimCb;
    this.fireCb = fireCb;
    this.vx = 8; this.vy = 0;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (this.owner.dead) { this.dead = true; return; }
    if (!this.channelCb()) { this.dead = true; return; }   // 断 channel（canShoot 门等价）
    this.ai0 += 1;
    this.ai1 -= 1;
    let variant = -1;
    if (this.ai1 <= 0) {
      this.ai1 = this.volley;
      const idx = Math.floor(this.ai0 / this.volley);
      variant = idx % 7;                                    // :64090-64095 num60
    }
    // 帧动画 4t（projFrames 714/615 = 7 帧）
    if (++this.frameCtr >= 4) {
      this.frameCtr = 0;
      this.frame = (this.frame + 1) % 7;
    }
    // 挂手（RotatedRelativePoint(MountedCenter)−size/2 + gravDir×2 :64437-64439）
    this.x = this.owner.cx - this.w / 2;
    this.y = this.owner.cy - this.h / 2 + 2;
    // 速度 = 瞄准向 × 基速（:64142-64153 的持械视觉速度；±0.0327 抖动）
    const aim = this.aimCb();
    let ax = aim.x - this.owner.cx, ay = aim.y - this.owner.cy;
    const al = Math.hypot(ax, ay) || 1;
    ax /= al; ay /= al;
    const jit = (Math.random() * 0.1308997 - 0.06544985) * (this.projId === 714 ? 0.5 : 1);
    const c = Math.cos(jit), s = Math.sin(jit);
    this.vx = (ax * c - ay * s) * 8;
    this.vy = (ax * s + ay * c) * 8;
    // 枪口尘（714：彩虹 hsl(ai0/90%1) 267；615 同族彩色）
    if (Math.random() < 0.8) {
      const hue = (this.ai0 / 90) % 1;
      const col = hslToRgbCss(hue);
      game.spawnParticles(this.cx + ax * 40, this.cy + ay * 40, col, 1, 1.2, { life: 18 });
    }
    if (variant < 0) return;
    // ---- volley：开火（弹速 714: 8(+1 变体3) / 615: 14；散布 ±0.098）----
    // 首发跳音门仅 714（:64114 `if (ai[0] != 1f)`）；615 的 Item36 无此门（:64004-64008）
    if (this.projId === 714 ? this.ai0 !== 1 : true) {
      game.playSfxFiles([this.projId === 714 ? 'Item_156' : 'Item_36'], 1, this.cx, this.cy);
    }
    const spd = (this.projId === 714 ? 8 + (variant === 3 ? 1 : 0) : 14);
    const spread = 0.19634955 * Math.random() - 0.09817477;
    const fc = Math.cos(spread), fs = Math.sin(spread);
    const cvx = (ax * fc - ay * fs) * spd, cvy = (ax * fs + ay * fc) * spd;
    const spreadRot = (ang: number) => ({
      x: cvx * Math.cos(ang) - cvy * Math.sin(ang),
      y: cvx * Math.sin(ang) + cvy * Math.cos(ang),
    });
    const ok = this.fireCb(variant, this.owner.cx, this.owner.cy, cvx, cvy,
      { bonusAi1: variant === 4, spreadRot });
    if (!ok) this.dead = true;                              // 无弹药 → Kill（:64183）
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    const fh = img.height / 7;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2 + (this.owner.facing === -1 ? Math.PI : 0));
    if (this.owner.facing === -1) ctx.scale(1, -1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, this.frame * fh, img.width, fh,
      -img.width / 2, -fh / 2, img.width, fh);
    ctx.restore();
  }
}

/** hsl(0..1, 1, 0.5) → css（Main.hslToRgb 近似） */
function hslToRgbCss(h: number): string {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    const v = 1 - Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(255 * v);
  };
  return `rgb(${f(5)},${f(3)},${f(1)})`;
}

// ================= 烟花弹 715-718（AI_147） =================

export class Celeb2Rocket extends Entity {
  readonly projId: number;                          // 715-718（弹药档）
  w = 14; h = 14;                                   // SetDefaults（aiStyle147 E=2）
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  /** 变体光（GetCeleb2Color ×0.5） */
  lightRGB: [number, number, number] | null;
  /** 变体 ai[0]（muzzle 的 ⌊ai0/8⌋%7） */
  private variant: number;
  /** localAI[0]：update 计 */
  private t = 0;
  /** case3 保速（localAI[1] = 初速模长） */
  private spd0 = 0;
  /** case3 追踪目标（ai[1]=敌id+1） */
  private ai1 = 0;
  /** case4 附带 ai1=1（蛇形起步相位 +45） */
  private ai1Flag: boolean;
  /** case1 scale 长大 */
  private drawScale = 1;
  private rot = 0;
  private onExplode: (x: number, y: number, damage: number) => void;

  constructor(projId: number, variant: number, x: number, y: number, vx: number, vy: number,
    damage: number, knockback: number, ai1Flag: boolean,
    onExplode: (x: number, y: number, damage: number) => void) {
    super();
    this.projId = projId;
    this.variant = variant;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.ai1Flag = ai1Flag;
    this.onExplode = onExplode;
    this.rot = Math.atan2(vy, vx) + Math.PI / 2;
    const c = CELEB2_COLORS[Math.min(6, Math.max(0, variant))];
    this.lightRGB = [c[0] / 255 / 2, c[1] / 255 / 2, c[2] / 255 / 2];
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    for (let i = 0; i < 3 && !this.dead; i++) this.step(game);   // extraUpdates=2
  }

  private step(game: GameHooks): void {
    this.t += 1;
    this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;       // :49981
    switch (this.variant) {
      case 0:
        if (this.t >= 20) { this.vy = Math.min(this.vy + 0.12, 16); }
        if (this.t > 20 && this.t % 20 === 0) this.trailBurst(game);   // 沿途空爆（:49996-49999）
        break;
      case 1:
        if (this.t === 10) this.vy -= 10;                        // 上抛（:50003-50006）
        if (this.t >= 10) {
          this.vy = Math.min(this.vy + 0.25, 16);
          this.drawScale = Math.min(2.5, this.drawScale + 0.015);
          if (this.t % 10 === 0) this.ringDust(game);
        }
        break;
      case 2:
        if (this.t >= 60) this.vy = Math.min(this.vy + 0.15, 16);
        break;
      case 3: {
        if (this.spd0 === 0) this.spd0 = Math.hypot(this.vx, this.vy);   // localAI[1] 保速
        if (this.t >= 25 && this.ai1 === 0 && this.t >= 20) this.vy = Math.min(this.vy + 0.15, 16);
        if (this.t >= 20) {                                       // 追踪（:50088-50145）
          let tx = 0, ty = 0, found = false;
          if (this.ai1 === 0) {
            let bd = 800;
            for (const ent of game.enemies()) {
              const e = ent as unknown as EnemyLike & { cx: number; cy: number };
              if (!playerCanHitEnemy(e, game, this.projId)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
              if (e.dead) continue;
              const d = Math.abs(e.cx - this.cx) + Math.abs(e.cy - this.cy);
              if (d < bd) { bd = d; tx = e.x + e.w / 2; ty = e.y + e.h / 2; found = true; this.ai1 = e.id + 1; }
            }
            if (!found) this.ai1 = 0;
          } else {
            for (const ent of game.enemies()) {
              const e = ent as unknown as EnemyLike & { cx: number; cy: number };
              if (!e.dead && e.id === this.ai1 - 1) {
                tx = e.x + e.w / 2; ty = e.y + e.h / 2; found = true; break;
              }
            }
          }
          if (found) {
            const dx = tx - this.cx, dy = ty - this.cy;
            const dl = Math.hypot(dx, dy) || 1;
            const W = 8;
            this.vx = (this.vx * (W - 1) + dx / dl * this.spd0) / W;
            this.vy = (this.vy * (W - 1) + dy / dl * this.spd0) / W;
          }
        }
        break;
      }
      case 4: {
        if (this.t === 1 && this.ai1Flag) this.t += 45;           // 相位跳（:50150-50153）
        const a = Math.atan2(this.vy, this.vx);
        const ux = Math.cos(a), uy = Math.sin(a);
        const px = -uy, py = ux;                                  // 垂直向
        // 原式（:50154-50156）：x = normalize(v).RotatedBy(t·π/45).X；
        //                        position += normalize(v).RotatedBy(π/2) × x × 3
        const rx = ux * Math.cos(this.t * (Math.PI / 45)) - uy * Math.sin(this.t * (Math.PI / 45));
        this.x += px * rx * 3;
        this.y += py * rx * 3;
        this.drawScale = 2;
        if (this.t >= 10) this.vy = Math.min(this.vy + 0.04, 16);
        break;
      }
      case 5:
        if (this.t >= 40) this.vy = Math.min(this.vy + 0.08, 16);
        break;
      case 6:
        if (this.t >= 30) this.vy = Math.min(this.vy + 0.1, 16);
        break;
      default:
        break;
    }
    this.x += this.vx;
    this.y += this.vy;
    const st = game.world.store;
    const tx = Math.floor(this.cx / 16), ty = Math.floor(this.cy / 16);
    if (!st.inBounds(tx, ty)) { this.dead = true; return; }
    if (st.get(tx, ty) !== 0 && st.isSolid(tx, ty)) { this.explode(game); return; }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as EnemyLike;
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e as never);
      e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.y, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.explode(game);                              // penetrate 1 → 命中即 Kill
      return;
    }
  }

  /** 变体 0 沿途空爆视觉（AI_147_Explosion case0 近似：尘 31×4 + 130×20） */
  private trailBurst(game: GameHooks): void {
    game.spawnParticles(this.cx, this.cy, '#E8C060', 4, 1.6, { life: 20 });
    const col = `rgb(${CELEB2_COLORS[this.variant].join(',')})`;
    game.spawnParticles(this.cx, this.cy, col, 10, 1.2, { life: 26 });
  }

  /** 变体 1 尘环（:50030-50046 近似） */
  private ringDust(game: GameHooks): void {
    const col = `rgb(${CELEB2_COLORS[this.variant].join(',')})`;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      game.spawnParticles(this.cx + Math.cos(a) * 4, this.cy + Math.sin(a) * 8, col, 1, 1, { life: 18 });
    }
  }

  /** Kill：爆（716/718 毁地形由 EXPLODE_RADIUS 表管；视觉=变体色爆） */
  private explode(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    const col = `rgb(${CELEB2_COLORS[Math.min(6, this.variant)].join(',')})`;
    game.spawnParticles(this.cx, this.cy, col, 14, 2.2, { life: 24 });
    game.spawnParticles(this.cx, this.cy, '#E8C060', 6, 1.8, { life: 20 });
    this.onExplode(this.cx, this.cy, this.damage);
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    const dw = img.width * this.drawScale, dh = img.height * this.drawScale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}
