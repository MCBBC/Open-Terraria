// 弹 813 血云（Projectile.cs:6002 SetDefaults 32×32 aiStyle108 穿墙悬停；
// AI_108 :32503-32760）：前 50t 隐形蓄积 → 51-120t 红尘漩涡显形（每帧双尘近似），
// ai[0]==90t 生成 NPC 619 血鱿鱼（:32711-32716）；>120t 未在可见段后自然消散
// （timeLeft 600 由本类 life 收紧到 150 等效其视觉寿命）。
// 由 AI_117 CallForHelp（恐惧鹦鹉螺召唤）投掷（NPC.cs:47874）。
//
// 绘制尺寸 = 贴图原生 72×72 × AI scale（G11 对账,SetDefaults 32×32 仅判定盒;
// 曾画成 32×32 → 整体缩小 2.25×）。显形段 scale/opacity/rotation 三段语义:
// 51-90t 生长（scale=(t-50)/40,alpha 反向;rotation -= π/20/t,:32619-32622）/
// 91-120t 定格（scale=1;rotation -= π/60/t,:32674-32676）/
// >120t 收缩（scale=1-(t-120)/60;rotation -= π/30/t,:32764-32767）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { Enemy } from './Enemy';

/** 纯函数:813 显形视觉态（AI_108 三段,scale/opacity 0-1/rotation 弧度）。
 *  t<=50 仍按 0 返回（draw 侧另有隐形门）,便于单测锚定。 */
export function squidCloudVisual(t: number): { scale: number; opacity: number; rotation: number } {
  if (t <= 50) return { scale: 0, opacity: 0, rotation: 0 };
  if (t <= 90) {
    const s = (t - 50) / 40;                                   // :32619
    return { scale: s, opacity: s, rotation: -(t - 50) * (Math.PI / 20) };   // :32622
  }
  if (t <= 120) {
    return { scale: 1, opacity: 1, rotation: -40 * (Math.PI / 20) - (t - 90) * (Math.PI / 60) }; // :32674-32676
  }
  const s = Math.max(0, 1 - (t - 120) / 60);                   // :32764
  return { scale: s, opacity: s, rotation: -40 * (Math.PI / 20) - 30 * (Math.PI / 60) - (t - 120) * (Math.PI / 30) };
}

export class SquidCloud extends Entity {
  w = 32; h = 32;
  private t = 0;
  private spawned = false;

  constructor(x: number, y: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t > 50 && this.t <= 120) {
      // 红尘漩涡（尘 5 + 尘 240 各 1/2 每帧——粒子降采样 0.5）
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        game.spawnParticles(
          this.cx - Math.cos(a) * (10 + Math.random() * 11), this.cy - Math.sin(a) * (10 + Math.random() * 11),
          '#C83848', 1, 0.8, { life: 24 });
      }
      if (Math.random() < 0.25) {
        const a = Math.random() * Math.PI * 2;
        game.spawnParticles(this.cx - Math.cos(a) * 30, this.cy - Math.sin(a) * 30,
          '#8A1828', 1, 0.6, { life: 26 });
      }
    }
    // ai[0]==90：出鱿鱼（:32711）
    if (this.t === 90 && !this.spawned) {
      this.spawned = true;
      const squid = Enemy.fromVanilla(619, this.cx, this.cy);
      if (squid) {
        squid.id = (game as unknown as { entities: { nextId: number } }).entities.nextId++;
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(squid, 'enemies');
      }
    }
    // 120t 后消散（原版 :32764 scale 1-(t-120)/60 到 180 才 Kill;本类 150 提前清场,登记偏差）
    if (this.t > 150) this.dead = true;
  }

  draw(r: { canvas: HTMLCanvasElement; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    if (this.t <= 50 || !r.atlas) return;   // 前 50t 隐形（alpha 255）
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    // ensureVImage 触发懒加载(此前直取且无人预载该表 = 永久隐形,2026-08-13 排雷)
    const img = r.atlas.ensureVImage ? r.atlas.ensureVImage('vanilla/Projectile_813.png') : r.atlas.vimages.get('vanilla/Projectile_813.png');
    if (!img || !img.width) return;
    const v = squidCloudVisual(this.t);
    if (v.opacity <= 0) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(v.rotation);
    ctx.globalAlpha = v.opacity;
    ctx.imageSmoothingEnabled = false;
    // 原生 72×72 × AI scale（不再归一到判定盒 32×32）
    ctx.drawImage(img, (-img.width * v.scale) / 2, (-img.height * v.scale) / 2,
      img.width * v.scale, img.height * v.scale);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
