// 下落沙族(原版 Projectile 31/56/67/71/179/241 SandBallFalling 系,aiStyle 10 = AI_010):
// 沙族图块失去下方支撑 → 转为下落投射物:重力 0.3/tick 坠落并旋转,
// 命中实体造成 10 伤害(penetrate = -1,同敌冷却;friendly+hostile 双向——砸怪也砸玩家),
// 落到实心格上变回原 tile。见 Game.checkFallingSand(触发侧)。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import { TILE_BY_KEY, TILE_DEFS, VANILLA_TILE_ID } from '../data/tiles';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { hitCritters, hitTownNpcs, playerCanHitEnemy } from './projTargets';
import { hostileProjectileDamage, mainDifficulty } from '../stats/ScaleStats';

// 落格门用原版 TileID → 本仓 id 换算（★本仓 tile id ≠ 原版 TileID,2026-08-25 修正）
const T_RAIL = VANILLA_TILE_ID.get(314);      // MinecartTrack
const T_CONV_L = VANILLA_TILE_ID.get(421);    // ConveyorBeltLeft
const T_CONV_R = VANILLA_TILE_ID.get(422);    // ConveyorBeltRight
const T_STALAC = VANILLA_TILE_ID.get(165);    // CaveDecos 钟乳石

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
    // 上一帧中心格（落地放置格,见下方落地段注释）
    const prevTx = Math.floor((this.x + this.w / 2) / TILE);
    const prevTy = Math.floor((this.y + this.h / 2) / TILE);
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

    // ---- 落地:变回 tile(原版 Projectile.Kill aiStyle==10 :79117-79310 等价)----
    // ★放置格 = 上一帧中心格:原版 TileCollision 把弹体挡在实心【外】,Kill 时中心格
    // =实心上方空格;本仓碰撞判定在积分后(中心已入实心格半步),上一帧中心格即原版
    // 弹回后的中心格。放置格须空(!active),被占→直接消失不放置(:79248 门)。
    // ★修正史:初版"向上扫第一个空位"→沙抬到草/仙人掌上方悬空叠放(用户实报
    // "蚁狮沙堆叠在草上/仙人掌断缝");二版把放置条件钉在碰撞格上→中心入实心恒被占
    // =下落沙【永不落格】的隐性回归;本版(2026-08-25)按上一帧中心格落格。
    // 下方 314 轨道/421-422 传送带 → 不放(:79256-79260);BlockBelowMakesSandFall
    // (WorldGen.cs:87868:下方空/下方非实心且再下空/钟乳石165)→不放,防放置即再落。
    // (半砖修正 :79242-79246 依赖运行时半砖碰撞面,本仓无,登记;玩家版被占时掉落
    //  对应物品块 num18>0(:79300)——本仓无投射物掉物接口,登记)
    if (st.isSolid(tx, ty) || st.isPlatform(tx, ty)) {
      const tid = TILE_BY_KEY[this.tileKey];
      const below = st.inBounds(prevTx, prevTy + 1) ? st.get(prevTx, prevTy + 1) : 0;
      const below2 = st.inBounds(prevTx, prevTy + 2) ? st.get(prevTx, prevTy + 2) : 0;
      let noPlace = below === T_RAIL || below === T_CONV_L || below === T_CONV_R;
      if (!noPlace && below === 0) noPlace = true;
      else if (!noPlace && below2 === 0 && !st.isSolid(prevTx, prevTy + 1)) noPlace = true;
      else if (!noPlace && below === T_STALAC) noPlace = true;
      if (tid !== undefined && !noPlace && st.inBounds(prevTx, prevTy)
        && st.type[st.idx(prevTx, prevTy)] === 0) {
        st.setTile(prevTx, prevTy, tid, 0, 0);
        game.playSfx?.('dig', 0.6);
        // 沙堆到仙人掌旁 → 仙人掌支撑复查(原版 TileFrame case 80 → CheckCactus
        // 级联;沙坡/沙堆改变邻接后悬托仙人掌须断根——用户实报"仙人掌悬在沙坡上")
        const CAC = TILE_BY_KEY['v_80_cactus'];
        if (CAC !== undefined) {
          for (const [ax, ay] of [[prevTx, prevTy - 1], [prevTx - 1, prevTy], [prevTx + 1, prevTy], [prevTx - 1, prevTy - 1], [prevTx + 1, prevTy - 1]] as const) {
            if (st.inBounds(ax, ay) && st.get(ax, ay) === CAC) {
              game.fellCactus?.(ax, ay);
              break;
            }
          }
        }
      }
      this.dead = true;   // 放置格被占/门拦截 → 沙消失(原版同,蚁狮版 num18=0 纯消失)
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
