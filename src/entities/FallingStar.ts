// 夜间坠星（WorldGen.SpawnFallingObjects :71861-71898 → 弹幕 720 Spawner →
// AI_148 :50191-50225 弹幕 12 FallingStar）1:1：
//   生成：仅夜（非 remix）、X 列 100..maxTilesX-51、Y 顶部 maxTilesY×5% 内；
//         运气定向（FindClosest + RollLuck(15)==0 → 玩家 ±640px，ai[1] 记玩家）；
//         初速 = (Next(-100,101), Next(200)+100) 归一化到恒速 12px/tick（无重力）。
//   Spawner 期 180 tick（ai[0]+=dayRate；定向时 X 向玩家 ×0.35）后转正星。
//   正星（aiStyle 5）：撞实心即 Kill；白天+自然星（damage>500）Kill 不掉落；
//         每 20+Next(40) tick 播 SoundID.Item9。
//   落地（Kill :75593）：自然星掉落 Item 75 坠落之星 ×1；尘埃 58×7 + 圆环 278。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';

export class FallingStar extends Entity {
  w = 18; h = 18;
  dead = false;
  /** 自然星标记（原版 damage>500；武器星不掉落品/白天不清除） */
  natural: boolean;
  /** 运气定向玩家（原版 ai[1]>-1：X 向玩家衰减追踪） */
  private homing = false;
  /** Spawner 阶段剩余 tick（原版 ai[0] 180 后转正星） */
  private warmup: number;
  private soundT = 0;
  private nextSound: number;

  constructor(x: number, y: number, vx: number, vy: number, warmup: number, homing: boolean, natural: boolean) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.warmup = warmup;
    this.homing = homing;
    this.natural = natural;
    this.soundT = 0;
    this.nextSound = 20 + Math.floor(Math.random() * 40);
  }

  /** 出生点校验（原版 Collision.SolidCollision 门 :71887） */
  static canSpawnAt(st: GameHooks['world']['store'], x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return st.inBounds(tx, ty) && !st.isSolid(tx, ty);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const w = game.world;
    // 白天清除（Spawner :50193 / 正星 :22141——仅自然星）
    if (w.clock.isDay) {
      if (this.natural || this.warmup > 0) { this.dead = true; return; }
    }
    if (this.warmup > 0) {
      // AI_148 Spawner 期：ai[0]+=dayRate；180 后定向时 velocity.X *= 0.35 再按玩家方向
      this.warmup--;
      if (this.warmup === 0) {
        if (this.homing) {
          const p = game.player;
          this.vx = Math.sign(p.cx - this.cx) * Math.abs(this.vx) * 0.35;
          if (this.vx === 0) this.vx = 0.1;
        }
      }
      return; // 悬停期不移动（原版 Spawner tileCollide=false 定点）
    }
    // 恒速直线下落（aiStyle 5 无重力）+ 落点碰撞
    const nx = this.x + this.vx, ny = this.y + this.vy;
    const tx = Math.floor((nx + this.w / 2) / TILE), ty = Math.floor((ny + this.h) / TILE);
    const st = w.store;
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) {
      // 落地 Kill（:75593）：掉落 + 特效
      this.dead = true;
      if (this.natural) {
        game.spawnDrop(this.cx - 8, this.y - 4, 'vi_75_fallen_star', 1, 0, -2);
      }
      game.spawnParticles(this.cx, this.cy, '#C8D8FF', 7, 2.5, { life: 30 });
      game.spawnBurst?.(this.cx, this.cy, '#6495ED', 10, 2, Math.PI * 2, Math.PI, { life: 26 });
      game.playSfxFiles(['Item_10'], 0.8, this.cx, this.cy);
      return;
    }
    this.x = nx; this.y = ny;
    // 轨迹尘埃 + 周期音效（:22175 播 Item9）
    if (this.natural && Math.random() < 0.5) {
      game.spawnParticles(this.cx + (Math.random() - 0.5) * 16, this.cy + this.h, '#E8F0FF', 1, 0.4, { life: 20 });
    }
    if (++this.soundT >= this.nextSound) {
      this.soundT = 0;
      this.nextSound = 20 + Math.floor(Math.random() * 40);
      game.playSfxFiles(['Item_9'], 0.5, this.cx, this.cy);
    }
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) this.dead = true;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    if (this.warmup > 0) return; // Spawner 隐形（alpha 255）
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.vy, this.vx) - Math.PI / 2);
    // 原版贴图 Projectile_9.png(22×24,单帧;旋转对齐速度向)
    const img = r.atlas?.ensureVImage?.('vanilla/Projectile_9.png') ?? null;
    if (img) {
      ctx.drawImage(img, -11, -12, 22, 24);
      ctx.restore();
      return;
    }
    // 星形：四角星简形（贴图缺失时程序兜底）
    ctx.fillStyle = this.natural ? '#FFF7D8' : '#D8E8FF';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(2.5, -2.5);
    ctx.lineTo(9, 0);
    ctx.lineTo(2.5, 2.5);
    ctx.lineTo(0, 9);
    ctx.lineTo(-2.5, 2.5);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-2.5, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Star.NightSetup（Star.cs:41-60）：每夜重掷 starfallBoost——
 *  10% → 3.0-5.0（流星夜）；余 1/3 → 1.0-1.5（弱流星夜）；其余 1.0。
 *  十周年世界阈值 1/5 与 1/2（:46-50）。 */
export function nightStarfallBoost(anniversary: boolean): number {
  const a = anniversary ? 1 / 5 : 1 / 10;
  const b = anniversary ? 1 / 2 : 1 / 3;
  if (Math.random() < a) return (300 + Math.floor(Math.random() * 201)) * 0.01;
  if (Math.random() < b) return (100 + Math.floor(Math.random() * 51)) * 0.01;
  return 1.0;
}
