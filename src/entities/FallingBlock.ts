// 下落沙族(原版 Projectile 31/56/67/71/179/241 SandBallFalling 系,aiStyle 10 = AI_010):
// 沙族图块失去下方支撑 → 转为下落投射物:重力 0.3/tick 坠落并旋转,
// 命中实体造成 10 伤害(penetrate = -1,同敌冷却;friendly+hostile 双向——砸怪也砸玩家),
// 落到实心格上变回原 tile。见 Game.checkFallingSand(触发侧)。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { hitCritters, hitTownNpcs, playerCanHitEnemy } from './projTargets';
import { hostileProjectileDamage, mainDifficulty } from '../stats/ScaleStats';

export class FallingBlock extends Entity {
  w = 10; h = 10; // 原版 width/height = 10(vanilla-projectiles.json 全沙族一致)
  tileKey: string;
  rot = 0;
  /** 本块是否已砸过玩家(每块只结算一次,防同帧多 hit) */
  private hitPlayer = false;
  /** 同敌冷却 tick(原版穿透弹 per-NPC 免疫帧语义) */
  private hitCd = new Map<number, number>();
  life = 3600;
  static readonly DAMAGE = 10; // 原版 SandBallFalling damage = 10
  static readonly GRAV = 0.3;  // aiStyle 2/10 通用重力

  constructor(x: number, y: number, tileKey: string) {
    super();
    this.x = x; this.y = y;
    this.tileKey = tileKey;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    this.vy = Math.min(this.vy + FallingBlock.GRAV, 16);
    this.x += this.vx;
    this.y += this.vy;
    this.rot += 0.25;
    // 冷却推进
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    const st = game.world.store;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!st.inBounds(tx, ty)) { this.dead = true; return; }

    // ---- 命中实体(先于落地判定:穿过实体继续坠,penetrate -1) ----
    // 玩家(hostile 方向;attacker 仅 Enemy 型,沙块不传)
    const p = game.player;
    if (!this.hitPlayer && p && !p.dead && this.aabbOverlaps(p)) {
      this.hitPlayer = true;
      // Damage_EVP：SandBallFalling 基础 10（P31 hostile 弹），命中再过乘区×2
      game.damagePlayer(hostileProjectileDamage(FallingBlock.DAMAGE, mainDifficulty(game.world)) * 2, this.cx, this.cy);
    }
    // 敌人 + 小动物 + 城镇 NPC(friendly 方向;原版巨石碾压 NPC,hurt iframes 兜连击)
    hitTownNpcs(this, game, FallingBlock.DAMAGE, Math.sign(this.vx) * 2);
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const cd = this.hitCd.get(e.id) ?? 0;
      if (cd > 0) continue;
      this.hitCd.set(e.id, 20);
      e.hurt(FallingBlock.DAMAGE, 0, 0, game);
    }
    if (hitCritters(this, game)) { /* 小动物被砸即死,块继续坠 */ }

    // ---- 落地:变回 tile(原版 Projectile.Kill aiStyle==10 段 :75362-75530)----
    // ★原版语义:放置格 = 投射物【中心格】且必须为空(!active),被占 → 【直接消失
    // 不放置】(碰撞停在实心顶,中心格自然在实心上方空格)。曾"向上扫第一个空位":
    // 沙落到草/仙人掌上会被抬到草上方悬空叠放、甚至顶进仙人掌臂位断掉仙人掌
    // (用户实报"蚁狮沙堆叠在草上/仙人掌断缝")。
    if (st.isSolid(tx, ty) || st.isPlatform(tx, ty)) {
      const tid = TILE_BY_KEY[this.tileKey];
      if (tid !== undefined && st.type[st.idx(tx, ty)] === 0) {
        st.setTile(tx, ty, tid, 0, 0);
        game.playSfx?.('dig', 0.6);
        // 沙堆到仙人掌旁 → 仙人掌支撑复查(原版 TileFrame case 80 → CheckCactus
        // 级联;沙坡/沙堆改变邻接后悬托仙人掌须断根——用户实报"仙人掌悬在沙坡上")
        const CAC = TILE_BY_KEY['v_80_cactus'];
        if (CAC !== undefined) {
          for (const [ax, ay] of [[tx, ty - 1], [tx - 1, ty], [tx + 1, ty], [tx - 1, ty - 1], [tx + 1, ty - 1]] as const) {
            if (st.inBounds(ax, ay) && st.get(ax, ay) === CAC) {
              game.fellCactus?.(ax, ay);
              break;
            }
          }
        }
      }
      this.dead = true;   // 中心格被占(落在草/仙人掌/任意非空格)→ 沙消失(原版同)
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(实体循环在世界变换内):取该 tile 的原版表首帧,随下落旋转
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    const tid = TILE_BY_KEY[this.tileKey];
    const sheet = tid !== undefined ? TILE_DEFS[tid]?.vanilla?.sheet : undefined;
    if (sheet === undefined) return;
    const fr = r.atlas.vframeAt(sheet, 0, 0);
    if (!fr) return;
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -8, -8, 16, 16);
    ctx.restore();
  }
}
