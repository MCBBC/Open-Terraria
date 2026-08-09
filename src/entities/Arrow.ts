// 箭矢投射物(原版 Projectile 1/2 Arrow 语义:抛物线重力、撞块消失、命中伤害、可回收)。
import { Entity } from './Entity';
import { TILE, GRAVITY } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class Arrow extends Entity {
  w = 8; h = 4;
  vx: number;
  vy: number;
  damage: number;
  dropKey: string | null; // 命中土块可回收;null = 不回收
  life = 1200;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, dropKey: string | null = null) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.dropKey = dropKey;
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const x = (this.x - cam.x) * cam.zoom + r.canvas.width / 2;
    const y = (this.y - cam.y) * cam.zoom + r.canvas.height / 2;
    // 朝速度方向的短线(原版箭矢贴图近似)
    const len = Math.min(16, Math.hypot(this.vx, this.vy) * 1.6) * cam.zoom;
    const ang = Math.atan2(this.vy, this.vx);
    ctx.strokeStyle = '#D8C8A0';
    ctx.lineWidth = 2 * cam.zoom;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
    ctx.stroke();
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    const world = game.world;
    this.vy = Math.min(this.vy + GRAVITY * 0.35, 8);
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    // 撞块:30% 回收为掉落(原版 1/3),否则消失
    if (world.store.isSolid(tx, ty)) {
      if (this.dropKey && Math.random() < 1 / 3) game.spawnDrop(this.x, this.y, this.dropKey, 1);
      this.dead = true;
      return;
    }
    // 命中敌人(entities.enemies 桶)
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; dead: boolean };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#FFD060');
        this.dead = true;
        return;
      }
    }
  }
}
