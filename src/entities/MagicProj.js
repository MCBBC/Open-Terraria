// 魔法投射物(原版 Projectile 14 Spark / 短命发光弹语义):
// 直线飞行、撞块消失、命中伤害、寿命短(原版 spark 30tick)。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
export class MagicProj extends Entity {
    constructor(x, y, vx, vy, damage, life, color) {
        super();
        Object.defineProperty(this, "w", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 6
        });
        Object.defineProperty(this, "h", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 6
        });
        Object.defineProperty(this, "vx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "vy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "damage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "life", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dead", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "color", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "grav", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.life = life;
        this.color = color;
    }
    draw(r, cam) {
        const ctx = r.canvas.getContext('2d');
        if (!ctx)
            return;
        const x = (this.x - cam.x) * cam.zoom + r.canvas.width / 2;
        const y = (this.y - cam.y) * cam.zoom + r.canvas.height / 2;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(x + this.w / 2 * cam.zoom, y + this.h / 2 * cam.zoom, 4 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
    }
    fixedUpdate(_dt, game) {
        if (--this.life <= 0) {
            this.dead = true;
            return;
        }
        this.x += this.vx;
        this.y += this.vy;
        const tx = Math.floor((this.x + this.w / 2) / TILE);
        const ty = Math.floor((this.y + this.h / 2) / TILE);
        if (game.world.store.isSolid(tx, ty)) {
            this.dead = true;
            return;
        }
        for (const ent of game.enemies()) {
            const e = ent;
            if (e.dead)
                continue;
            if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
                e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game);
                game.addDamageNumber(this.x, this.y, this.damage, false, '#C080FF');
                this.dead = true;
                return;
            }
        }
    }
}
