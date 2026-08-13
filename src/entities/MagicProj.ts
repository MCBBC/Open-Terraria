// 魔法投射物(原版 Projectile 14 Spark / 短命发光弹语义):
// 直线飞行、撞块消失、命中伤害、寿命短(原版 spark 30tick)。
import { Entity } from './Entity';
import { hitCritters, hitTownNpcs, playEnemyHitSound } from './projTargets';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class MagicProj extends Entity {
  /** GetWeaponCrit 合并值（Game 注入；缺省 4% 基础） */
  critChance = 0.04;
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
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.dead = true; return; }
    // 小动物:一击致死并消耗弹体(近战挥砍同语义)
    if (hitCritters(this, game)) { this.dead = true; return; }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; dead: boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        playEnemyHitSound(game, e);
        const crit = Math.random() < this.critChance; // 暴击链（P:52512——曾恒 false）
        e.hurt(crit ? this.damage * 2 : this.damage, Math.sign(this.vx) * 2, 0, game, 0, false, 0, true);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#C080FF');
        this.dead = true;
        return;
      }
    }
    // 城镇 NPC 受击(原版 friendly 弹对 NPC 同效;一碰即碎同敌怪)
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2)) { this.dead = true; return; }
  }
}
