// 魔法投射物(原版 Projectile 14 Spark / 短命发光弹语义):
// 直线飞行、撞块消失、命中伤害、寿命短(原版 spark 30tick)。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class MagicProj extends Entity {
  w = 6; h = 6;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  dead = false;
  color: string;
  grav = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, life: number, color: string) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.life = life;
    this.color = color;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标)
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.dead = true; return; }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; dead: boolean };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#C080FF');
        this.dead = true;
        return;
      }
    }
  }
}
