// 钱币传送门弹（proj 518 CoinPortal，aiStyle 94，Projectile.cs:31696-31782 全 1:1）。
// 触发：罐子 SmashPot 的 RollLuck 大奖（WorldGen.cs:57186-57194
// GetClosestRollLuck(range)==0 → NewProjectile 518）——普通罐 1/500、
// 金字塔罐(style25-27 num=10→range=125) 1/125 全游戏最高。
// 规格（:5601-5608）：32×32 / aiStyle 94 / alpha 255 起步 / tileCollide=false / ignoreWater。
// 阶段机：ai0 1..40 淡入(alpha-=5、v*=0.85，==40 掷 ai1∈{10,15,30})
//   → 41..60 悬停(v=0) → 61..210 每 ai1 tick 中央喷金 coin(item 73)枚
//   （速度=UnitY 旋随机 ×(3,2) ×(0.5..1) −(0,1)，:31746-31751）
//   → 211..239 缩小淡出(scale-=1/30、alpha+=15) → 240 消亡。
// 光（:31777）：AddLight(0.8,0.71,0.24)×0.3；尘（:31768-31776）：alpha<90 时 1/3 掷
//   环形金尘 246（半径=(w,h)*scale*0.85/2 圆上）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';

export class CoinPortalProj extends Entity {
  w = 32; h = 32;
  private ai0 = 0;
  private ai1 = 0;      // 出币间隔（:31720-31729 三档掷签 10/15/30 → 总币 15/10/5 枚）
  private localAI0 = 0; // 出币累积器（:31745 localAI[0] += 1 >= ai[1] 重置喷币）
  private alpha = 255;
  private frame = 0;
  private frameCounter = 0;
  private scale = 1;

  constructor(x: number, y: number) {
    super();
    // NewProjectile 传入即中心（X-width/2, Y-height/2）；初速 (0,-12)（:57192）
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = 0;
    this.vy = -12;
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const a = Math.max(0, Math.min(1, (255 - this.alpha) / 255)); // GetAlpha ×(1-α/255)（:76261-76265）
    ctx.save();
    ctx.globalAlpha = a;
    const img = projSprite(518);
    const sz = 32 * this.scale;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    ctx.imageSmoothingEnabled = false;
    if (img && (img.width > 0) && img.width > 0) {
      const fh = img.height / 4;   // projFrames[518]=4（Main.cs:8435）竖排帧
      ctx.drawImage(img, 0, this.frame * fh, img.width, fh,
        cx - sz / 2, cy - sz / 2, sz, sz);
    } else {
      ctx.fillStyle = '#C8A028';
      ctx.beginPath();
      ctx.arc(cx, cy, sz / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (++this.frameCounter >= 4) {          // 4 tick/帧 4 帧循环（:31698-31706）
      this.frameCounter = 0;
      if (++this.frame >= 4) this.frame = 0;
    }
    this.ai0++;
    if (this.ai0 <= 40) {
      this.alpha -= 5;
      if (this.alpha < 0) this.alpha = 0;
      this.vx *= 0.85; this.vy *= 0.85;
      if (this.ai0 === 40) {                 // :31719-31729 rand(3) → ai[1]
        this.ai1 = [10, 15, 30][(Math.random() * 3) | 0];
      }
    } else if (this.ai0 <= 60) {
      this.vx = 0; this.vy = 0;              // 悬停（:31736-31743）
    } else if (this.ai0 <= 210) {
      if (++this.localAI0 >= this.ai1) {     // 每 ai1 tick 喷 1 金币（:31744-31751）
        this.localAI0 = 0;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        const th = Math.random() * Math.PI * 2;
        const k = Math.random() * 0.5 + 0.5;
        // UnitY.RotatedByRandom(2π) ×(3,2)×k −UnitY×1（分量乘）
        const vx = -Math.sin(th) * 3 * k;
        const vy = Math.cos(th) * 2 * k - 1;
        const key = VANILLA_ITEM_KEY_BY_ID[73];   // 73 = Gold Coin
        if (key) game.spawnDrop(cx, cy, key, 1, vx, vy);
      }
    } else {
      this.scale -= 1 / 30;
      this.alpha += 15;
      if (this.ai0 >= 240) { this.dead = true; return; }   // Kill()（:31761-31765）
    }
    if (this.alpha < 90 && Math.random() < 1 / 3) {        // 环形金尘 246（:31767-31776）
      const r = 32 * this.scale * 0.85 / 2;
      const th = Math.random() * Math.PI * 2;
      game.spawnParticles(this.x + this.w / 2 - Math.sin(th) * r,
        this.y + this.h / 2 + Math.cos(th) * r, '#FFE745', 1, 0, { life: 24 });
    }
    game.addLightAt?.(this.x + this.w / 2, this.y + this.h / 2, 0.24, 0.213, 0.085); // ×0.3（:31780）
  }
}
