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
//     实心探测近似（Arrow bounceOff 同法登记）。★BJ206：X 探针改实心门+hoik
//     单向墙放行（详见 fixedUpdate 撞块段注）；Y 探针 isActive 旧近似维持（原版
//     Y 无 hoik 门，升程遇平台反弹偏差=登记）
// 登记偏差：环境天灯渲染层（SkyRenderer LanternSky）与弹体是两套系统——原版 855 仅
//   为自发光弹体上升体,LanternSky 的灯笼海由 LanternNight.lanternsUp 驱动,【不存在】
//   "放飞注册入天灯海"的通道（LanternSky.cs 无 855 引用实证）；本类不接入该表。
//   静音：case 4702 与 DefaultToThrownWeapon 均无 UseSound（itemUseSound 表缺省即静默）。
// ★通用湿段接入（2026-09-06 溅花缺口杂项批）：855 走 SetDefaults :8199-8207
//   （netImportant/12×12/aiStyle166/penetrate −1/timeLeft 1000）【无 ignoreWater 行】
//   → 受段（vanilla-projectiles.json 同向）。AI_166_Dove type855 支无 wet 消费
//   （:48410-48483 grep 实证）→ 溅花+旗维护即全部效果。tileCollide 缺省 true
//   → 湿阻尼适用（:17755 wetVelocity=velocity×0.5 只进 UpdatePosition :20561 位移行,
//   velocity 场不减——乘进位移行,碰撞探针仍读未阻尼 velocity 同 TileCollision 原文）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE } from '../core/constants';

export class SkyLanternProj extends Entity {
  w = 12; h = 12;
  dead = false;
  readonly projId = 855;
  // ---- ★通用湿段旗（ProjWetFlags 同形;projectileWetSection 共享体逐值维护）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐子步折减） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调自做） */
  presetDone = false;
  life = 1000;
  rot = 0;
  frame = 0;
  private frameTimer = 0;
  alpha = 0;
  /** ★BJ206 2026-09-20：hoik 单向墙承载（BJ161/FX34c 同款类字段习语，Arrow.ts
   *  hoik 字段注同源）——原版 Projectile.HandleMovement(:17578) 全路径 TileCollision
   *  第 10 参 hoik=true（855 aiStyle166 无特支，慢速干路 :17823 不传参吃
   *  Collision.cs:2299 形参缺省 true）⇒ 弹 855 原版本体可穿 Hoik 单向墙。
   *  本类单盒探针承载的消费门=X 探针身后格坡邻配对（fixedUpdate 撞块段）。 */
  hoik = true;

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
    // ---- ★通用湿段（:16903-17113,共享体）——AI(:16880)→湿段(:16903)→HandleMovement
    //      (:17120)位序;采样位=AI 后位移前 = 上拍移动结算位
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // ---- 撞块反身（HandleMovement :18459-18473；单盒双轴实心近似 TileCollision）----
    // ★BJ206 2026-09-20（A1）：X 探针改实心门+hoik 单向墙放行——
    //  · isSolid≈Main.tileSolid：TileCollision X 双支（Collision.cs:2412/:2432）前提
    //    `!Main.tileSolidTop`（平台族）+旗判 Main.tileSolid——旧 isActive 连平台/
    //    火把也反弹，超出可拦集合；Y 探针维持 isActive 旧近似（原版 Y 无 hoik 门，
    //    平台升程反弹偏差另行登记）。
    //  · hoik 放行=身后格坡邻配对（:2412 右行查 (i-1,j) slope 2/4；:2432 左行查
    //    (i+1,j) slope 1/3；界外=坡 0 不豁免=原版 `i<1` 短路）——本类 X 探针轴专属，
    //    无需 Arrow 单点中心模型的主轴臂门（|vx|>=|vy|）；放行=整段跳过弹离+反身
    //    （原版无碰撞事件 velocity 不变，:18459 反身链不可达）。反向进入（身后格
    //    非齿）照常反弹=单向性保留。判据与 moveAndCollide X 面（TileCollision.ts
    //    :430-435）/Arrow hoikAdmit（:7922-7927）同构。
    {
      const nxT = Math.floor((this.cx + this.vx) / TILE), cyT = Math.floor(this.cy / TILE);
      if (st.inBounds(nxT, cyT) && st.isSolid(nxT, cyT)) {
        const dirX = this.vx > 0 ? 1 : this.vx < 0 ? -1 : 0;
        const bjX = nxT - dirX;
        const bsX = bjX >= 0 && bjX < st.w ? st.slope[st.idx(bjX, cyT)] : 0;
        const hoikAdmit = this.hoik && dirX !== 0
          && (dirX > 0 ? (bsX === 2 || bsX === 4) : (bsX === 1 || bsX === 3));
        if (!hoikAdmit) {
          this.x -= this.cx - nxT * TILE - TILE / 2;       // 弹离块面
          this.vx = -this.vx;                               // X 全速反号(:18462-18464)
        }
      }
      const nyT = Math.floor((this.cy + this.vy) / TILE), cxT2 = Math.floor(this.cx / TILE);
      if (st.inBounds(cxT2, nyT) && st.isActive(cxT2, nyT)) {
        const rising = this.vy < 0;
        this.y -= this.cy - nyT * TILE - TILE / 2;
        this.vy = -this.vy;                                 // Y 反号
        if (rising) this.vy *= 0.25;                        // (:18466-18470 顶升限幅)
      }
    }
    // ---- 位移（★水中阻尼 ×0.5/蜂蜜 0.25/微光 0.375 乘进位移行,velocity 场不减
    //      ——HandleMovement :17755 wetVelocity 只进 UpdatePosition :20561）----
    const df = projWaterDragFactor(this);
    this.x += this.vx * df;
    this.y += this.vy * df;
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
