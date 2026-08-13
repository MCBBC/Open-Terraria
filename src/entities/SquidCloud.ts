// 弹 813 血云（Projectile.cs:6002 SetDefaults 32×32 aiStyle108 穿墙悬停；
// AI_108 :32503-32760）：前 50t 隐形蓄积 → 51-120t 红尘漩涡显形（每帧双尘近似），
// ai[0]==90t 生成 NPC 619 血鱿鱼（:32711-32716）；>120t 未在可见段后自然消散
// （timeLeft 600 由本类 life 收紧到 150 等效其视觉寿命）。
// 由 AI_117 CallForHelp（恐惧鹦鹉螺召唤）投掷（NPC.cs:47874）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { Enemy } from './Enemy';

export class SquidCloud extends Entity {
  w = 32; h = 32;
  private t = 0;
  private spawned = false;
  /** 消散透明度（0=实） */
  private fade = 0;

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
    // 120t 后消散
    if (this.t > 120) {
      this.fade = Math.min(1, (this.t - 120) / 30);
      if (this.t > 150) this.dead = true;
    }
  }

  draw(r: { canvas: HTMLCanvasElement; atlas?: { vimages: Map<string, HTMLImageElement>; ensureVImage?: (f: string) => HTMLImageElement | null } | null }): void {
    if (this.t <= 50 || !r.atlas) return;   // 前 50t 隐形（alpha 255）
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    // ensureVImage 触发懒加载(此前直取且无人预载该表 = 永久隐形,2026-08-13 排雷)
    const img = r.atlas.ensureVImage ? r.atlas.ensureVImage('vanilla/Projectile_813.png') : r.atlas.vimages.get('vanilla/Projectile_813.png');
    if (!img || !img.width) return;
    // 旋转 -= π/60（:32725）；scale/alpha 在 51-120 显形段固定 1/0
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(-this.t * (Math.PI / 60));
    ctx.globalAlpha = Math.max(0, 1 - this.fade);
    ctx.drawImage(img, -this.w / 2, -this.h / 2, this.w, this.h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
