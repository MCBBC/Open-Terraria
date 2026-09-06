// 地牢碎砖片弹（proj 736-738 DungeonDebris，Projectile.cs:7466-7474 规格 + Kill :75336-75360）。
// 来源：裂砖族（481-483）破坏时每块喷 1 片（WorldGen.cs:63887-63895：
//   NewProjectile(i*16+8, j*16+8, 0, 0.41, type-481+736, damage 20)——非 friendly=对玩家敌对）。
// 规格：10×10 / knockBack 6 / penetrate -1 / aiStyle 10（重力落体近似：g 0.3/tick）。
// Kill（撞块/命中/寿命尽，:75336-75360）：Item_127 + 3 尘（dust 275/276/277 色系）+
//   中心正下格若为裂砖 1/2 掷 KillTile（连锁——原版无 noItem，掉同色地牢砖）。
// ★通用湿段接入（2026-09-06 溅花缺口杂项批）：736-738 走 SetDefaults `(736||737||738)`
//   共档 :7750-7757（10×10/aiStyle10/penetrate −1）,【无 ignoreWater 行】→ 受段
//   （vanilla-projectiles.json 同向）;AI_010 无 wet 消费（:58809-59083 grep 实证）→
//   溅花+旗维护即全部效果。★阻尼 N/A 定谳：aiStyle 10 在 HandleMovement 走专支
//   :17701-17720（TileCollision 直连,与 wet 阻尼支 :17718 互斥——velocity 场不被
//   阻尼改写,位移不折减）,本类直积分位移行原样照跑。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { hitPlayer } from './projTargets';
import { projectileWetSection } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE } from '../core/constants';
import { isCrackedAt } from '../world/CrackedBricks';

const DEBRIS_COLOR: Record<number, string> = { 736: '#42546D', 737: '#54643F', 738: '#6B4463' };

export class DebrisProj extends Entity {
  w = 10; h = 10;
  private readonly projId: number;   // 736/737/738（随 481/482/483 主题色）
  private life = 600;                // timeLeft 兜底（防滞留）
  // ---- ★通用湿段旗（ProjWetFlags 同形;projectileWetSection 共享体逐值维护）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐子步折减） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调自做） */
  presetDone = false;

  constructor(sheet481: number, x: number, y: number) {
    super();
    this.projId = sheet481 - 481 + 736;
    // :63887 传入即格心（i*16+8）；初速 (0, 0.41)（:63893）
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = 0;
    this.vy = 0.41;
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
    if (img && (img as HTMLImageElement).naturalWidth > 0) {
      const iw = (img as HTMLImageElement).naturalWidth;
      const ih = (img as HTMLImageElement).naturalHeight;
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);   // 贴图原生尺寸（AI_001 朝向族）
    } else {
      ctx.fillStyle = DEBRIS_COLOR[this.projId] ?? '#666';
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    this.vy += 0.3;                                   // 重力落体（aiStyle 10 近似）
    // ---- ★通用湿段（:16903-17113,共享体）——AI(:16880)→湿段(:16903)→位移
    //      (:17120 HandleMovement→:20561 UpdatePosition)位序;采样位=AI 后位移前
    //      =上拍移动结算位。AI 杀拍（撞块/命中,本类融合拍序在位移后判定）不跑湿段
    //      =仓内湿段批统一口径（RollingBoulder 同式,登记有界偏差）
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    this.x += this.vx;
    this.y += this.vy;
    // 敌对命中（damage 20，NewProjectile 默认 friendly=false）
    if (hitPlayer(this, game, 20, true)) {
      this.killFx(game);
      this.dead = true;
      return;
    }
    // 撞块 → Kill
    const st = game.world.store;
    const cx = Math.floor((this.x + this.w / 2) / TILE), cy = Math.floor((this.y + this.h / 2) / TILE);
    if (st.inBounds(cx, cy) && st.isSolid(cx, cy)) {
      this.killFx(game);
      this.dead = true;
    }
  }

  /** Kill 段（:75336-75360）：Item127 + 尘 + 中心下格裂砖 1/2 掷 KillTile（掉落） */
  private killFx(game: GameHooks): void {
    game.playSfxFile?.('Item_127', 1, this.cx, this.cy);
    game.spawnParticles(this.cx, this.cy, DEBRIS_COLOR[this.projId] ?? '#666', 3, 1.4);
    const st = game.world.store;
    const cx = Math.floor(this.cx / TILE), cy = Math.floor((this.y + this.h) / TILE) + 1;  // 中心格+1（:75345）
    if (isCrackedAt(st, cx, cy) && Math.random() < 0.5) {
      game.breakTile?.(cx, cy);   // KillTile（默认 noItem=false——掉同色地牢砖）
    }
  }
}
