// 箭矢投射物（原版 Projectile type 1/2、aiStyle 1 主干，Projectile.cs:546-566 + AI_001）：
// 重力 0.3/tick（aiStyle1 通用常量）、timeLeft 1200、旋转 atan2(vy,vx)+π/2（AI_001 尾部 L54877）、
// 原版贴图 Projectile_N.png；命中敌人伤害/击退/暴击；命中 tileCut 砍草/碎罐（Projectile.CutTiles）；
// 命中实心块 1/3 概率回收掉落。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 原版箭贴图懒加载（Projectile_1.png = 木箭、Projectile_2.png = 燃烧箭） */
const spriteCache = new Map<number, HTMLImageElement>();
function arrowSprite(projId: number): HTMLImageElement | null {
  let img = spriteCache.get(projId);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  img = new Image();
  img.src = `sprites/vanilla/Projectile_${projId}.png`;
  spriteCache.set(projId, img);
  return img;
}

export class Arrow extends Entity {
  w = 10; h = 10; // 原版 SetDefaults type 1：width/height = 10
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  /** 原版投射物类型（1=木箭 2=燃烧箭，PickAmmo projToShoot = ammo.shoot） */
  projId: number;
  /** 回收掉落的 item key（null = 不回收，如燃烧箭） */
  dropKey: string | null;
  /** 原版 timeLeft = 1200（Projectile.cs:554） */
  life = 1200;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    knockback: number, projId = 1, dropKey: string | null = null) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.dropKey = dropKey;
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const x = (this.x + this.w / 2 - cam.x) * cam.zoom + r.canvas.width / 2;
    const y = (this.y + this.h / 2 - cam.y) * cam.zoom + r.canvas.height / 2;
    const ang = Math.atan2(this.vy, this.vx);
    const img = arrowSprite(this.projId);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2); // 原版贴图纵向：rotation = atan2+π/2（AI_001 L54877）
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -this.w * cam.zoom / 2, -this.w * cam.zoom / 2, this.w * cam.zoom, this.w * cam.zoom * (img.naturalHeight / img.naturalWidth));
    } else {
      // 贴图未就绪：短线兜底
      ctx.strokeStyle = this.projId === 2 ? '#FFB060' : '#D8C8A0';
      ctx.lineWidth = 2 * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -Math.min(14, Math.hypot(this.vx, this.vy) * 1.4) * cam.zoom);
      ctx.stroke();
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    const world = game.world;
    // aiStyle 1 通用重力（原版箭 0.3/tick 抛物线）
    this.vy = Math.min(this.vy + 0.3, 16);
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.dead = true; return; }
    const tileType = world.store.get(tx, ty);
    if (tileType !== 0) {
      // 可砍物（杂草/瓦罐）：Projectile.CutTiles 语义——弹幕扫过即砍，箭继续飞行
      game.cutTile(tx, ty);
      if (world.store.get(tx, ty) === 0) return; // 砍掉了（非实心）：箭不受阻挡
      // 实心块：1/3 概率回收掉落（原版箭 Kill 的掉落），然后消失
      if (this.dropKey && Math.random() < 1 / 3) game.spawnDrop(this.x, this.y, this.dropKey, 1);
      this.dead = true;
      return;
    }
    // 命中敌人（穿透 1：木箭射中即停，原版 arrow penetrate=1）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        // 暴击：玩家远程基础 4%（原版 ranged 初始 4）
        const crit = Math.random() < 0.04;
        const dmg = crit ? this.damage * 2 : this.damage;
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game);
        game.addDamageNumber(this.x, this.y, Math.round(dmg), crit, crit ? '#FF8040' : '#FFD060');
        this.dead = true;
        return;
      }
    }
  }
}
