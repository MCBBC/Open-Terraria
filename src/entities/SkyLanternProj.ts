// 放飞灯笼（Projectile 855,Item 4702）。锚点：Item.cs case 4702 :38645-38650
// （DefaultToThrownWeapon(855,25,4f)+noUseGraphic+ranged=false——useStyle1/25t/射速4/
//   consumable/noMelee 由 Default 形态继承，:48458-48471）；弹 SetDefaults :8197-8205
//   ——12×12/aiStyle166/penetrate −1/timeLeft 1000/netImportant；
// AI_166_Dove :48411-48500 type==855 支 + HandleMovement 撞块反身 :18459-18473。
//
// 行为逐项：
//   · 出生帧 = rand.Next(4)（localAI[0] 首拍定色,:48414-48418）+ 每 6t 走帧 0..3
//     （num2=6 type855 档,:48419-48427）
//   · 光照 AddLight(Center,(1,0.6,0.1)×(1−alpha/255))（:48430-48431）
//   · rotation = vx×0.2
//   · 升力节奏（:48434-48443）：vy<−1 → vy×0.99 缓升;否则 vy += sin(timeLeft%200/200×2π)
//     ×0.25、>0.5 时 vy×0.8，钳 ±1.5
//   · 风漂（:48445-48453）：vx += 0.0525×WindForVisuals(0 则取 0.1)，钳 ±2
//   · 淡出收口（:48467-48472）：timeLeft<90 起 alpha+=3/tick，alpha≥255 → Kill
//   · tileCollide=true（SetDefaults 缺省 true）撞块按 lastVelocity 反身（X 全反、
//     Y 反后升程遇顶 ×0.25,仅 lastVy<0 时）——本仓无 moveAndCollide 分轴旗，以逐轴
//     实心探测近似（Arrow bounceOff 同法登记）
// 登记偏差：环境天灯渲染层（SkyRenderer LanternSky）与弹体是两套系统——原版 855 仅
//   为自发光弹体上升体,LanternSky 的灯笼海由 LanternNight.lanternsUp 驱动,【不存在】
//   "放飞注册入天灯海"的通道（LanternSky.cs 无 855 引用实证）；本类不接入该表。
//   静音：case 4702 与 DefaultToThrownWeapon 均无 UseSound（itemUseSound 表缺省即静默）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { TILE } from '../core/constants';

export class SkyLanternProj extends Entity {
  w = 12; h = 12;
  dead = false;
  readonly projId = 855;
  life = 1000;
  rot = 0;
  frame = 0;
  private frameTimer = 0;
  alpha = 0;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.frame = (Math.random() * 4) | 0;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const st = game.world.store;
    // ---- 帧/光照/姿态（AI_166_Dove :48414-48432）----
    if (++this.frameTimer > 6) {
      this.frameTimer = 0;
      this.frame = (this.frame + 1) % 4;
    }
    game.addLightAt?.(this.cx, this.cy,
      1 - this.alpha / 255, 0.6 - this.alpha / 255 * 0.6, 0.1 - this.alpha / 255 * 0.1);
    this.rot = this.vx * 0.2;
    // ---- 升力节奏（:48434-48443）----
    if (this.vy < -1) {
      this.vy *= 0.99;
    } else {
      const tl = Math.max(0, this.life);
      this.vy += Math.sin((tl % 200) / 200 * Math.PI * 2) * 0.25;
      if (this.vy > 0.5) this.vy *= 0.8;
      this.vy = Math.min(1.5, Math.max(-1.5, this.vy));
    }
    // ---- 风漂（:48445-48453：Main.WindForVisuals 0 取 0.1 兜底）——本仓无
    //   GameHooks 级风面,world.weather.windSpeedCurrent 可读则用,缺省按零风档 ----
    const wind = (game.world as unknown as { weather?: { windSpeedCurrent?: number } }).weather?.windSpeedCurrent ?? 0;
    this.vx += 0.0525 * (wind === 0 ? 0.1 : wind);
    this.vx = Math.min(2, Math.max(-2, this.vx));
    // ---- 撞块反身（HandleMovement :18459-18473；单盒双轴实心近似 TileCollision）----
    {
      const nxT = Math.floor((this.cx + this.vx) / TILE), cyT = Math.floor(this.cy / TILE);
      if (st.inBounds(nxT, cyT) && st.isActive(nxT, cyT)) {
        this.x -= this.cx - nxT * TILE - TILE / 2;         // 弹离块面
        this.vx = -this.vx;                                 // X 全速反号(:18462-18464)
      }
      const nyT = Math.floor((this.cy + this.vy) / TILE), cxT2 = Math.floor(this.cx / TILE);
      if (st.inBounds(cxT2, nyT) && st.isActive(cxT2, nyT)) {
        const rising = this.vy < 0;
        this.y -= this.cy - nyT * TILE - TILE / 2;
        this.vy = -this.vy;                                 // Y 反号
        if (rising) this.vy *= 0.25;                        // (:18466-18470 顶升限幅)
      }
    }
    // ---- 位移 ----
    this.x += this.vx;
    this.y += this.vy;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; return; }
    // ---- 寿命/淡出（:15861 timeLeft-- 子步尾 + :48467-48472）----
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.life < 90) this.alpha += 3;
    if (this.alpha >= 255) this.dead = true;
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    // 懒加载通道(lazyload-guards):ensureVImage miss 返 null→本帧早退,下帧自愈;禁直取贴图表
    const img = r.atlas.ensureVImage?.('vanilla/Projectile_855.png') ?? null;
    if (!img || !img.width) return;
    // 竖向 4 帧（frame 高 = 图高/4,AI_166 定 0..3 环）;光环四副本(Main.cs:33887 ±4px
    // flinker)以 shadowBlur 近似,登记
    const fh = img.height / 4;
    const aOp = Math.max(0, Math.min(255, 255 - this.alpha));
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.globalAlpha = aOp / 255;
    ctx.drawImage(img, 0, this.frame * fh, img.width, fh, -this.w / 2, -fh / 2, this.w, fh);
    ctx.globalAlpha = aOp / 255 * 0.3;
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]] as const) {
      ctx.drawImage(img, 0, this.frame * fh, img.width, fh, dx - this.w / 2, dy - fh / 2, this.w, fh);
    }
    ctx.restore();
  }
}
