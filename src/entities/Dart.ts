// 飞镖投射物(原版 Projectile 10 Dart 语义:直线飞行、撞块消失、命中伤害)。
// 陷阱(137)发射;简化布线:同排/同列直线可见(≤60 格无实心阻挡)的拉杆/开关/压力板驱动。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class Dart extends Entity {
  w = 8; h = 4;
  vx: number;
  vy: number;
  damage: number;
  life = 600; // tick 上限(原版 timeLeft 600)
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const x = (this.x - cam.x) * cam.zoom + r.canvas.width / 2;
    const y = (this.y - cam.y) * cam.zoom + r.canvas.height / 2;
    ctx.fillStyle = '#C8B89A';
    ctx.fillRect(x, y, this.w * cam.zoom, this.h * cam.zoom);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    const world = game.world;
    this.x += this.vx;
    this.y += this.vy;
    // 撞实心块消失
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (world.store.isSolid(tx, ty)) { this.dead = true; return; }
    // 命中玩家(敌对陷阱):矩形相交
    const p = game.player;
    if (!p.dead && this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
      p.damage(this.damage, this.x, this.y);
      game.addDamageNumber(p.cx, p.y, this.damage, false, '#FF8060');
      this.dead = true;
    }
  }
}
