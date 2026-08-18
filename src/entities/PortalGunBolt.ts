// 传送门枪物品链的 601 PortalGunBolt 弹体（ProjectileID.cs:1562）。
// 全链（item 3384 = Portal Gun，ItemID.cs:8307；★任务单曾写 1153——1153 是
// Lihzahrd Watcher Statue 旗帜，源码为唯一标杆取 3384）：
//   ① Item.cs:30926-30942 case 3384：useStyle5 / useAnimation=useTime=20 / shootSpeed 24f /
//     knockBack 2f / UseSound=null / shoot=600 / noMelee / noUseGraphic / channel / autoReuse
//   ② Player.cs:48053-48057：持有 3384 发 projToShoot(600)，ai1 = altFunctionUse==2 ? 1 : 0
//     （右键 = ManageRightClickFeatures :31161-31165 置 altFunctionUse=1 → ItemCheck
//      :42060-42063 升 2 → 蓝门；左键 0 = 橙门）
//   ③ Projectile.cs:63883-63911（600 首 AI 帧）：按鼠标重瞄准 ×24，发出 601
//     （速度 = normalize(瞄准)×3f，ai0 = form）——本类即该 601
//   ④ 601 SetDefaults（:6223-6231）：10×10 / aiStyle1 / alpha 255 / friendly / extraUpdates 30
//   ⑤ 601 AI（:51174-51228）：光尘 + alpha 每子步 -15 + 2 帧动画 + 拖尾尘
//   ⑥ 撞块（:16672-16691）：TryPlacingPortal(this, lastVelocity, velocity) → position += velocity → Kill
// extraUpdates 语义（Update :15331-15334 numUpdates=extraUpdates; while(numUpdates>=0)）：
// 每 tick "AI+移动+碰撞" 整轮跑 31 次 → 弹速 3px×31 = 93px/tick（近瞬时光束，撞块检测
// 逐子步进行不穿墙）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { TILE } from '../core/constants';
import { portalColor } from './Portal';
import { texId } from '../render/texId';

/** 601 SetDefaults（:6225-6226）碰撞盒 */
const BOLT_W = 10;
const BOLT_H = 10;
/** :6230 extraUpdates = 30（每 tick 子步数 = extraUpdates+1 = 31） */
const EXTRA_UPDATES = 30;
/** :63904 num49 = 3f（600 发 601 的单子步速度） */
const BOLT_SPEED = 3;
/** SetDefaults 不写 timeLeft → 默认 3600 */
const BOLT_LIFE = 3600;

/** 601 PortalGunBolt（物品 3384 / 传送门炮共用弹型；物品链由此类承载） */
export class PortalGunBolt extends Entity {
  w = BOLT_W;
  h = BOLT_H;
  /** ai[0] = 门色 form（0 橙 / 1 蓝）。物品链：左键 0 / 右键 1（Player.cs:48055） */
  form: 0 | 1 = 0;
  /** alpha（:6228 初值 255，AI 每子步 -15 地板 0 → 约 9 子步后全显） */
  private alpha = 255;
  /** :51209-51214 frameCounter 4 子步一帧，Main.projFrames[601] = 2 */
  private frame = 0;
  private frameCounter = 0;
  /** timeLeft（每 tick 减 1，撞块/出界先死） */
  private life = BOLT_LIFE;
  private static frameCache = new Map<string, HTMLCanvasElement>();

  /** x/y = 弹心（600.Center，Projectile.cs:63905-63911）；内部存左上锚（碰撞盒 10×10，
   *  placePortal 消费的正是左上 + 5 的中心语义，同 TrapShot） */
  constructor(x: number, y: number, vx: number, vy: number, form: 0 | 1) {
    super();
    this.x = x - BOLT_W / 2;
    this.y = y - BOLT_H / 2;
    this.vx = vx;
    this.vy = vy;
    this.form = form;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) {
      this.dead = true;
      return;
    }
    const [pr, pg, pb] = portalColor(this.form);
    const trailColor = this.form === 0 ? '#FFAA28' : '#3CE0FF'; // 与 TrapShot 拖尾同色表（门色近似）
    let updates = EXTRA_UPDATES;                                  // :15331 numUpdates = extraUpdates
    while (updates >= 0 && !this.dead) {
      updates--;                                                  // :15332-15334
      // ---- AI（:51174-51228，每子步一次）----
      // :51176-51179 门色×0.5 点光（center + velocity×3）
      game.addLightAt?.(this.cx + this.vx * 3, this.cy + this.vy * 3,
        (pr * 0.5) / 255, (pg * 0.5) / 255, (pb * 0.5) / 255);
      if (this.alpha > 0 && this.alpha <= 15) {                   // :51180-51203：4 尘(264) + 音
        // 尘速 = velocity×2 + RandomVector2(-1,1) → 定向爆发近似（speed 6 ± 散布）
        game.spawnBurst?.(this.cx, this.cy, trailColor, 4, 6,
          Math.atan2(this.vy, this.vx), 0.35, { life: 14, damp: 0.94 });
        // :51195-51202 按 ai[0] 选音（form 1 → Item_114 蓝 / form 0 → Item_115 橙）
        game.playSfx(this.form === 0 ? 'portalOrange' : 'portalBlue', 1, this.x, this.y);
      }
      this.alpha -= 15;                                           // :51204-51208
      if (this.alpha < 0) this.alpha = 0;
      if (++this.frameCounter >= 4) {                             // :51209-51214
        this.frameCounter = 0;
        this.frame = (this.frame + 1) % 2;
      }
      // :51217-51227 alpha==0 期拖尾尘（263，velocity/4，每子步 1 粒）——
      // 本仓粒子池上限 600（Game.spawnParticles），按 TrapShot 同款惯例折半（每 2 子步 1 粒）
      if (this.alpha === 0 && (updates & 1) === 0) {
        game.spawnBurst?.(this.cx, this.cy, trailColor, 1, 0.75,
          Math.atan2(this.vy, this.vx), 0.1, { life: 10, damp: 0.94 });
      }
      // ---- 移动 + 撞块（Update 主体序：AI 后 position += velocity，再碰撞响应）----
      const lvx = this.vx;
      const lvy = this.vy;
      this.x += this.vx;
      this.y += this.vy;
      const tx = Math.floor(this.cx / TILE);
      const ty = Math.floor(this.cy / TILE);
      if (!game.world.store.inBounds(tx, ty)) {
        this.dead = true;                                          // 出界消亡（原版 timeLeft 兜底）
        break;
      }
      if (game.world.store.isSolid(tx, ty)) {
        // :16672-16691 撞块落门
        if (this.alpha > 0) {                                      // :16674 音门（alpha>0 才播）
          // :16676-16683 按 ai[1] 选音——601 生成只写 ai0（:63911 尾参），
          // ai[1] 恒 0 → 此分支恒 Item_115（原版实况，非笔误；AI 侧 :51195 才按 form 分音）
          game.playSfx('portalOrange', 1, this.x, this.y);
        }
        game.placePortal?.(this.x, this.y, lvx, lvy, this.form);   // :16685-16688 TryPlacingPortal(this, lastVelocity, velocity)
        this.x += this.vx;                                         // :16689 position += velocity
        this.y += this.vy;
        this.dead = true;                                          // :16690 Kill()
        break;
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = r.atlas?.ensureVImage('vanilla/Projectile_601.png');
    const [pr, pg, pb] = portalColor(this.form);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    // 与 TrapShot 'portalbolt' 同款朝向约定（速度角，rotOff 0）
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.globalAlpha = 1 - this.alpha / 255;                        // alpha 255→0 = 透明→全显
    if (img && (img.width > 0) && img.width > 0) {
      // GetAlpha（:76199-76202）：601 整体贴图染门色——multiply + destination-in 保形
      const f = PortalGunBolt.tintedFrame(img, this.frame, pr, pg, pb);
      ctx.drawImage(f, -10, -10);
    } else {
      // 贴图未就绪回退：门色速度向短线（TrapShot 同款兜底形态）
      ctx.strokeStyle = `rgb(${pr},${pg},${pb})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-this.vx * 2, -this.vy * 2);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 帧染门色缓存（20×19 帧 × 2 帧 × 2 色；手法同 Portal.tintedFrame） */
  private static tintedFrame(tex: ImageBitmap | HTMLImageElement, frame: number, r: number, g: number, b: number): HTMLCanvasElement {
    const key = `${texId(tex)}|${frame}|${r},${g},${b}`;
    const hit = PortalGunBolt.frameCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = 20;
    c.height = 19;
    const cx = c.getContext('2d')!;
    cx.drawImage(tex, 0, frame * 19, 20, 19, 0, 0, 20, 19);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, 20, 19);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(tex, 0, frame * 19, 20, 19, 0, 0, 20, 19);
    PortalGunBolt.frameCache.set(key, c);
    return c;
  }
}

/** 物品 3384 使用入口（Game.updateUse 接线用）：
 *  form = 0 左键（橙门）/ 1 右键（蓝门）——altFunctionUse 语义见 Player.cs:48055。
 *  aimAngle = 屏幕中心→鼠标的瞄准角（Game 侧 atan2(mouseY-canvasH/2, mouseX-canvasW/2) 同款）。
 *  弹速链 1:1：方向 = aimAngle（:63887-63897 按鼠标重瞄准），单子步速 3（:63904 num49=3f），
 *  extraUpdates 30 → PortalGunBolt 内部自跑 31 子步。返回弹体（调用方入 'projectiles' 桶） */
export function firePortalGun(
  player: { cx: number; cy: number },
  aimAngle: number,
  form: 0 | 1,
): PortalGunBolt {
  const mx = player.cx + Math.cos(aimAngle) * 14;   // 出膛位（Game 枪族同款 14px 前置）
  const my = player.cy - 4 + Math.sin(aimAngle) * 14;
  let vx = Math.cos(aimAngle) * BOLT_SPEED;          // :63906-63910 normalize(瞄准)×3
  let vy = Math.sin(aimAngle) * BOLT_SPEED;
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
    vx = 0;                                          // :63907-63910 NaN → -UnitY
    vy = -BOLT_SPEED;
  }
  const bolt = new PortalGunBolt(mx, my, vx, vy, form);
  return bolt;
}
