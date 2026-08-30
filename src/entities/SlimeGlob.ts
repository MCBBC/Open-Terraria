// 史莱姆枪黏胶弹(Projectile 406,Item.cs case 2610 :25505-25518;SetDefaults
// Projectile.cs:4866-4875;AI aiStyle==60 Projectile.cs:29430-29700;Kill :75506-75515)
// ——玩具武器:枪/弹伤害恒 0,唯一效果=重叠 NPC 施加 Slimed(137) 180t(:29657 起
// type==406 直投扫描),火系 DoT ×2 由 Enemy.slimedT 消费链承接(该链与 projStatus
// SUPPORTED 137 注册早已建成,此前只缺施加源=本实体+Game 分派)。
//
// 运动语义:aiStyle60 在原版重力分支/弹跳表/Sets 表零登记 → 直线飞行无重力;
// GetCollisionParams(:47745)碰撞盒缩 1×1=对地形近乎穿透 → 不做 tileCollide;
// Kill 由 scale 衰减触发(scale −0.015/t → ~67t,射程≈8px/t×67)。行进带蓝黏尘
// 尾(dust4 RGB(0,80,255) α175 每 tick 6 粒沿速度梯度);死亡爆 40 粒同色大尘
// (vel=oldVelocity×0.2 散布,:75510-75515)。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { TILE } from '../core/constants';
import { applyBuffTicks } from './projStatus';

export class SlimeGlob extends Entity {
  w = 14; h = 14;
  dead = false;
  readonly projId = 406;
  private scale = 1;
  private readonly oldVx: number;
  private readonly oldVy: number;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    // Kill(:75510 velocity=oldVelocity*0.2):extraUpdates=2 三子步等速直线,
    // 出膛速 ≡ 上 tick 首子步前速度,直取即等价
    this.oldVx = vx; this.oldVy = vy;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.x += this.vx; this.y += this.vy;
    const st = game.world.store;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; return; }

    // 行进尾迹(AI type==406 支 :29661-29690):每 tick 6 粒 dust4 α175 色
    // RGB(0,80,255,100) scale1.2,盒内缩 12×12,50% 二次 +25α,位置沿速度梯度
    const cA = Math.random() < 0.5 ? 0.69 : 0.55;
    for (let k = 0; k < 6; k++) {
      game.spawnParticles?.(
        this.x + this.w / 2 + this.vx * k / 6 + (Math.random() - 0.5) * (this.w - 12),
        this.y + this.h / 2 + this.vy * k / 6 + (Math.random() - 0.5) * (this.h - 12),
        'rgba(0,80,255,' + cA.toFixed(2) + ')', 1, 0.6,
        { life: 18 + (Math.random() * 10 | 0), vx: this.vx * 0.3, vy: this.vy * 0.3, damp: 0.98 });
    }

    // Slimed 直投(AI 扫描 :29663-29700):逐 tick 对重叠 NPC AddBuff(137,180);
    // 门=!active/dontTakeDamage/lifeMax<=1;盒=14×14 全尺寸(owner 本地=宿主模拟惯例)
    for (const ent of game.enemies()) {
      const e = ent as unknown as {
        x: number; y: number; w: number; h: number; dead?: boolean;
        dontTakeDamage?: boolean; lifeMax?: number;
      };
      if (!e || e.dead || e.dontTakeDamage || (e.lifeMax !== undefined && e.lifeMax <= 1)) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      applyBuffTicks(e as unknown as { [field: string]: number | undefined }, 137, 180);
    }

    // 寿命衰减(AI :29431-29437):scale −0.015/t;≤0 → Kill(此刻 velocity*=5 仅为
    // Kill 爆基向量动量感,本实现 killBurst 直接用 oldVx×0.2 承接)
    this.scale -= 0.015;
    if (this.scale <= 0) { this.killBurst(game); this.dead = true; return; }
  }

  /** Kill 段(:75506-75515):velocity=oldVelocity×0.2 基向量 + 40 粒 dust4 α175
   *  scale1.6 散布 vel ±Next(-50,51)×0.015 锚 Center —— 观感=黏球啪嗒摊成一滩 */
  private killBurst(game: GameHooks): void {
    for (let k = 0; k < 40; k++) {
      game.spawnParticles?.(
        this.cx, this.cy,
        'rgba(0,80,255,0.69)', 1, 1.6,
        {
          life: 20 + (Math.random() * 18 | 0),
          vx: this.oldVx * 0.2 + ((Math.random() * 101 | 0) - 50) * 0.015,
          vy: this.oldVy * 0.2 + ((Math.random() * 101 | 0) - 50) * 0.015,
          grav: 0.08, damp: 0.97,
        });
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    const img = r.atlas.ensureVImage ? r.atlas.ensureVImage('vanilla/Projectile_406.png') : r.atlas.vimages.get('vanilla/Projectile_406.png');
    if (!img || !img.width) return;
    // alpha 恒 255(SetDefaults,无 AI 改写段)=不透明绘制,以 scale 收缩呈现消亡
    const s = Math.max(0.05, this.scale);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.drawImage(img, (-this.w / 2) * s, (-this.h / 2) * s, this.w * s, this.h * s);
    ctx.restore();
  }
}
