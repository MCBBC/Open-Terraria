// 异星泡泡枪泡沫 444（aiStyle 78）：SetDefaults Projectile.cs:4877-4888（10×10、
// friendly、ranged、alpha 255、extraUpdates 1、tileCollide 缺省 true）/ AI_078
// :29684-29714 / Kill 爆裂 :70282-70303。异星泡泡枪 2797 一次喷 4-5 颗
//（Player.cs:46943-46968），泡沫本体不结算接触伤害（Damage_CanDealDamage :11782
// 豁免表含 444——纯载体，穿透敌人不消亡），漂浮转向瞄准线（每子步角差 ×5% 收敛 +
// 速度 ×0.96 衰减），timeLeft 钳 60（:29711-29713）逐子步消耗（:15861）→ 60 子步
// 后（或撞块）爆裂 → 按发射时锁定的弹药弹型（localAI[0]）与弹速（localAI[1]）朝
// 爆裂时刻鼠标方向射出真子弹（Kill :70296-70302 Main.screenPosition+mouse）。
// 实体独立成类（HealProj/GrenadeProj 回调先例）：爆裂态（锁定弹型/弹速）随泡体
// 走，不经 Arrow 通用弹 opts——Arrow 命中/消亡链由并行批占用，且 444 无接触伤害
// 无需通用命中管线。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projFrameImg } from './Arrow';

export const XENO_BUBBLE_PROJ = 444;
/** 泡沫寿命 = AI_078 的 timeLeft 钳值（:29711-29713）；extraUpdates=1（SetDefaults
 *  :4887）→ timeLeft 逐子步消耗（:15861）= 60 子步 = 30 tick */
export const XENO_BUBBLE_LIFE = 60;
/** 散布半角 num20（Player.cs:46958 `MathF.PI * 2f / 3f`） */
export const XENO_SPREAD = (Math.PI * 2) / 3;

/** 泡数（Player.cs:46957-46960）：`Next(4, 5)` 恒 4，`Next(4) == 0`（25%）再 +1
 *  → 4-5 颗。roll01 = Math.random()（Main.rand.Next(4) 商值等价） */
export function xenoBubbleCount(roll01: number): number {
  return 4 + (Math.floor(roll01 * 4) === 0 ? 1 : 0);
}

/** 逐泡初速（Player.cs:46961-46966 1:1）：num22 = rand×0.2+0.05（0.05..0.25）、
 *  方向 = 瞄准速向量 RotatedBy(num20×rand−num20/2) 后 ×num22。svx/svy = 瞄准向
 *  ×弹速（原版 num4/num5 归一到 speed 后的向量）→ 泡速 = 弹速×num22（12 速枪
 *  = 0.6..3 px/子步）。rot01/spd01 = 两独立 Math.random() */
export function xenoBubbleVelocity(svx: number, svy: number, rot01: number, spd01: number):
  { vx: number; vy: number } {
  const num22 = spd01 * 0.2 + 0.05;
  const a = XENO_SPREAD * rot01 - XENO_SPREAD / 2;
  const c = Math.cos(a), s = Math.sin(a);
  return { vx: (svx * c - svy * s) * num22, vy: (svx * s + svy * c) * num22 };
}

/** 爆裂回调（Game 侧生成真子弹：读爆裂时刻鼠标世界坐标 + 发射锁定的弹型/弹速/
 *  暴击/穿甲——Kill :70296-70302 用 Main.screenPosition+mouse = 爆裂时刻瞄准，
 *  非发射时刻） */
export type XenoBurstCb = (cx: number, cy: number, dmg: number, kb: number) => void;

export class XenoBubbleProj extends Entity {
  w = 10; h = 10;                       // SetDefaults :4879-4880
  /** 泡体伤害/击退（= 枪链终值，爆裂子弹透传 :70301）——Entity 基类无此二字段 */
  damage = 0;
  knockback = 0;
  /** ai[0] 瞄准角（Player.cs:46956 ToRotation）——AI_078 转向目标线 */
  private readonly aimAng: number;
  /** localAI[0]/[1]（Player.cs:46967-46968）：爆裂子弹弹型/弹速 */
  private readonly bulletPid: number;
  private readonly bulletSpd: number;
  private readonly onBurst: XenoBurstCb;
  /** timeLeft（AI_078 钳 60，:29711-29713） */
  private life = XENO_BUBBLE_LIFE;
  /** alpha 255 起 −30/子步渐显（:29686-29691）；draw 乘 (1−alpha/255)（:76424） */
  private alpha = 255;
  /** rotation = 速度角 − π/2（:29706） */
  private rot = 0;

  /** cx/cy = 泡心（NewProjectile 语义）；dmg/kb = 枪链终值（爆裂子弹沿用 :70301
   *  `damage, knockBack` 透传） */
  constructor(cx: number, cy: number, vx: number, vy: number, aimAng: number,
    dmg: number, kb: number, bulletPid: number, bulletSpd: number, onBurst: XenoBurstCb) {
    super();
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.vx = vx;
    this.vy = vy;
    this.damage = dmg;
    this.knockback = kb;
    this.aimAng = aimAng;
    this.bulletPid = bulletPid;
    this.bulletSpd = bulletSpd;
    this.onBurst = onBurst;
    this.rot = Math.atan2(vy, vx) - Math.PI / 2;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // extraUpdates=1（SetDefaults :4887）→ 每 tick 2 子步（Projectile.cs:15331-15336
    // numUpdates 循环；AI/位移/timeLeft 全在子步内）
    for (let u = 0; u < 2 && !this.dead; u++) this.subStep(game);
  }

  private subStep(game: GameHooks): void {
    if (--this.life <= 0) { this.burst(game); return; }        // timeLeft 逐子步（:15861）
    this.alpha = Math.max(0, this.alpha - 30);                 //（:29686-29691）
    // 转向瞄准线（:29692-29705）：v6 = ai[0] 单位向量，角差 wrap 到 (−π,π] 后
    // ×0.05 收敛（RotatedBy），速度再 ×0.96 衰减
    const va = Math.atan2(this.vy, this.vx);
    let d = this.aimAng - va;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const na = va + d * 0.05;
    const sp = Math.hypot(this.vx, this.vy) * 0.96;
    this.vx = Math.cos(na) * sp;
    this.vy = Math.sin(na) * sp;
    this.rot = na - Math.PI / 2;                               //（:29706）
    // 位移 + 撞块爆裂（tileCollide 缺省 true——SetDefaults 未关；box 10×10 取
    // 中心点近似，泡速 ≤3px/子步无隧穿）
    this.x += this.vx;
    this.y += this.vy;
    if (game.world.store.isSolid(Math.floor(this.cx / 16), Math.floor(this.cy / 16))) {
      this.burst(game);
    }
  }

  /** Kill 爆裂（:70282-70303）：Item96 音 + 尘 171×Next(5,9)（scale 1.4/alpha 100/
   *  noGravity/速度 ×0.8）+ 回调生成真子弹（弹型/弹速 = 发射锁定 localAI[0]/[1]，
   *  伤害/击退沿用泡体） */
  private burst(game: GameHooks): void {
    this.dead = true;
    const cx = this.cx, cy = this.cy;
    game.playSfxFiles?.(['Item_96'], 1, cx, cy);               // SoundID.Item96（:70283）
    const n = 5 + Math.floor(Math.random() * 4);               // Next(5,9)（:70284）
    for (let i = 0; i < n; i++) {
      const d = game.spawnDust?.(cx, cy, 0, 0, 171, 0, 0, 100, null, 1.4, true);
      if (d) { d.vx *= 0.8; d.vy *= 0.8; }                     //（:70287）
    }
    this.onBurst(cx, cy, this.damage, this.knockback);
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, 1 - this.alpha / 255));   //（:76424）
    const img = projFrameImg(XENO_BUBBLE_PROJ, 0);
    if (img && img.width > 0) {
      ctx.drawImage(img as CanvasImageSource, -img.width / 2, -img.height / 2);
    } else {
      // 贴图未就绪：小圆兜底（prefetchProjectiles 已含 444 时首帧即真贴图）
      ctx.fillStyle = '#90C8F8';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
