// 流星雨陨石碎块(Projectile 1078 "MeteorOre",WorldGen.UpdateWorld :71771-71810
// 消耗 meteorShowerCount 的产物)。与夜间坠星(FallingStar,弹幕 12)是两个东西:
// 1078 带重力抛物线、伤害 50(专家40/大师35)+ 击退 5、命中玩家施加 OnFire(24)
// 300-600t(Projectile.cs:11456-11459)、撞地消亡【无掉落】——流星雨是灾害,
// 不是坠星农场。
// · SetDefaults(:9783-9793):w=h=14, hostile+friendly, penetrate=-1
// · AI_199(:37668-37691):frame=rand(3) 视觉;尘 31+6 号;红光(1,0,0);
//   rotation += vx*0.06 + direction*0.06;运动=通用重力(0.3,aiStyle 199 无运动覆写)
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { BuffType } from '../stats/Buffs';
import { hitTownNpcs, hitCritters, playEnemyHitSound } from './projTargets';

export class MeteorChunk extends Entity {
  w = 14; h = 14;
  rot = 0;
  /** 帧变体(:37673 Main.rand.Next(3),帧不自增) */
  frame: number;
  life = 5400;
  private hitPlayer = false;
  private hitCd = new Map<number, number>();

  constructor(x: number, y: number, vx: number, vy: number, frame = Math.floor(Math.random() * 3)) {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.frame = frame;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    // 通用重力抛物线(aiStyle 199 仅视觉,运动走 Projectile 通用路径,0.3 同族常数)
    this.vy = Math.min(this.vy + 0.3, 16);
    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.vx * 0.06 + (this.vx >= 0 ? 0.06 : -0.06);   // :37689-37690
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    const st = game.world.store;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!st.inBounds(tx, ty)) { this.dead = true; return; }
    // 伤害(:71801-71806):50 / 专家 40 / 大师 35,击退 5
    const diff = (game.world as unknown as { difficulty?: number }).difficulty ?? 0;
    const dmg = diff >= 2 ? 35 : diff === 1 ? 40 : 50;
    const p = game.player;
    if (!this.hitPlayer && p && !p.dead && this.aabbOverlaps(p)) {
      this.hitPlayer = true;                              // penetrate -1:穿过不消亡
      game.damagePlayer(dmg, this.cx, this.cy);
      p.buffs.apply(BuffType.OnFire, (300 + Math.floor(Math.random() * 301)) / 60);  // :11456
    }
    hitTownNpcs(this, game, dmg, Math.sign(this.vx) * 5);
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const cd = this.hitCd.get(e.id) ?? 0;
      if (cd > 0) continue;
      this.hitCd.set(e.id, 20);
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.vx) * 5, 0, game);
    }
    hitCritters(this, game);
    // 尘迹(AI_199 :37675-37687 每帧双尘,概率降采样防 60TPS 粒子爆)
    if (Math.random() < 0.5) {
      game.spawnParticles(this.cx, this.cy, '#FF7050', 1, 0.5, { life: 18 });
    }
    // 撞地消亡(tileCollide 默认;Kill 无特例 → 无掉落)
    if (st.isSolid(tx, ty)) {
      game.spawnParticles(this.cx, this.cy, '#FF9060', 6, 2, { life: 24 });
      this.dead = true;
    }
  }

  draw(r: { canvas: HTMLCanvasElement; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    // Projectile_1078.png 16×54 = 3 帧 16×18
    const ctx = r.canvas.getContext('2d');
    if (!ctx || !r.atlas) return;
    // ensureVImage 触发懒加载(此前直取且无人预载该表 = 永久隐形,2026-08-13 排雷)
    const img = r.atlas.ensureVImage ? r.atlas.ensureVImage('vanilla/Projectile_1078.png') : r.atlas.vimages.get('vanilla/Projectile_1078.png');
    if (!img || !img.width) return;
    const fw = 16, fh = 18;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.drawImage(img, 0, this.frame * fh, fw, fh, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }
}
