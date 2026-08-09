// 飞镖投射物(原版 Projectile 10 Dart 语义:直线飞行、撞块消失、命中伤害)。
// 陷阱(137)发射;简化布线:同排/同列直线可见(≤60 格无实心阻挡)的拉杆/开关/压力板驱动。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 电路陷阱投射物(Wiring.cs:1495-1743 五种):dart/flame/spiky/boulder/geyser */
const TRAP_SHOT_STYLE: Record<string, { w: number; h: number; color: string; grav: number }> = {
  dart: { w: 8, h: 4, color: '#C8B89A', grav: 0 },
  flame: { w: 10, h: 10, color: '#FF8030', grav: 0 },
  spiky: { w: 12, h: 12, color: '#8A8F96', grav: 0.18 },
  boulder: { w: 14, h: 14, color: '#9A8C72', grav: 0.22 },
  geyser: { w: 10, h: 14, color: '#B8E8F0', grav: 0.02 },
};

export class TrapShot extends Entity {
  w = 8; h = 8;
  vx: number;
  vy: number;
  damage: number;
  kind: 'dart' | 'flame' | 'spiky' | 'boulder' | 'geyser';
  life = 600;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, kind: 'dart' | 'flame' | 'spiky' | 'boulder' | 'geyser') {
    super();
    const s = TRAP_SHOT_STYLE[kind];
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kind = kind;
    this.w = s.w; this.h = s.h;
    if (kind === 'spiky') this.life = 1800; // 原版尖刺球 timeLeft 1800
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const x = (this.x - cam.x) * cam.zoom + r.canvas.width / 2;
    const y = (this.y - cam.y) * cam.zoom + r.canvas.height / 2;
    ctx.fillStyle = TRAP_SHOT_STYLE[this.kind].color;
    ctx.fillRect(x, y, this.w * cam.zoom, this.h * cam.zoom);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    this.vy += TRAP_SHOT_STYLE[this.kind].grav;
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) {
      // 尖刺球/巨石:撞块反弹衰减,其余消失
      if (this.kind === 'spiky' || this.kind === 'boulder') {
        if (Math.abs(this.vy) > 1) { this.vy *= -0.4; this.vx *= 0.7; this.y -= this.vy; }
        else { this.vy = 0; this.vx *= 0.94; }
      } else { this.dead = true; return; }
    }
    const p = game.player;
    if (!p.dead && this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
      p.damage(this.damage, this.x, this.y);
      game.addDamageNumber(p.cx, p.y, this.damage, false, '#FF8060');
      if (this.kind !== 'boulder') this.dead = true;
    }
  }
}

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
