// mod 弹幕实体(2026-10-04 P2):轻量直射弹体,行为=内置缺省(重力/寿命/tile 消亡/
// 敌怪&玩家命中)+spec 钩子覆写。设计锚:docs/mod-loader-design.md §2.3「弹幕」刀序。
// 纪律:
//   ① 与 Arrow(10.6k 行原版弹族宿主)并列注册——原版弹零改动;
//   ② 命中门=playerCanHitEnemy(通用 Damage_PVE 门)——crit/加伤/ immunity 全走
//     原版设施(P2 不内建掷率环,mod onHit 钩可自行扩展);
//   ③ 绘制=实体自绘(Entity.draw 通用分派,Renderer 零改),贴图经
//     vanilla/Projectile_<projId>.png 覆盖键(mod 资产注入,资源包同键族);
//   ④ 联机:mod 弹 P2 不进实体同步(kind 枚举外=旧端剥条降级矩阵,零崩溃)。
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import type { GameHooks } from './types';
import { Entity } from './Entity';
import { playerCanHitEnemy, hitPlayer } from './projTargets';
import { modProjSpecOf, modProjModIdOf, applyModNpcBuff, type ModProjLike } from '../mods/hooks';
import { modBuffTypeOf } from '../mods/buffs';
import type { Enemy } from './Enemy';

export class ModProj extends Entity {
  projId: number;
  damage: number;
  knockback: number;
  pierce: number;
  ageTicks = 0;
  /** 发射方阵营(P2:玩家武器弹=true/mod NPC AI 弹=false;联机傀儡=P3) */
  ownerIsPlayer: boolean;
  /** ★P6:hostile 位(原版 Projectile.hostile 语义)——mod NPC AI 弹=true 时,
   *  msg27 kind12 携 bit7,访客端 netPuppetProjContact 对己结算(victim-settles) */
  hostile = false;
  /** 命中过の敵怪 id 集(穿透去重;同怪一次) */
  private hitSet = new Set<number>();
  private spec: NonNullable<ReturnType<typeof modProjSpecOf>>;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number,
    projId: number, ownerIsPlayer: boolean) {
    super();
    const spec = modProjSpecOf(projId);
    if (!spec) throw new Error(`[mod-proj] 未注册的 mod 弹: ${projId}`);
    this.spec = spec;
    this.projId = projId;
    this.damage = damage;
    this.knockback = knockback;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = spec.width ?? 16; this.h = spec.height ?? 16;
    this.pierce = spec.pierce ?? 1;
    this.ownerIsPlayer = ownerIsPlayer;
  }

  kill(): void { this.dead = true; }

  fixedUpdate(dt: number, game: GameHooks): void {
    const like = this as unknown as ModProjLike;
    // —— 联机傀儡(P4):快照跟随+寿命+视觉钩;不结算伤害/tile(host 权威) ——
    //   剔除由 netProjPuppets 180t 超时/死亡清理面承担(Game.ts)
    if (this.netPuppet) {
      this.netPuppetStep();
      this.ageTicks++;
      if (this.ageTicks > (this.spec.lifetime ?? 3600)) this.dead = true;
      this.spec.update?.(like, game as never);
      return;
    }
    if (this.dead) return;
    // —— 寿命(缺省 3600) ——
    this.ageTicks++;
    const life = this.spec.lifetime ?? 3600;
    if (this.ageTicks > life) { this.dead = true; return; }
    // —— 位移:重力+子步推进(★P4 红蓝修正:单步 |v|>14px 可整体跳过 16px 墙——
    //    按速度切子步,每子步做 tile 采样) ——
    this.vy += this.spec.gravity ?? 0;
    const totalVx = this.vx, totalVy = this.vy;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalVx), Math.abs(totalVy)) / 14));
    const sx = totalVx / steps, sy = totalVy / steps;
    for (let s = 0; s < steps && !this.dead; s++) {
      const nx = this.x + sx, ny = this.y + sy;
      if (this.spec.tileCollide !== false) {
        const st = game.world.store;
        // 4 角+中心采样(★P4 红蓝修正:旧 3 点采样有小弹盒角部漏检带)
        const solidAt = (px: number, py: number): boolean =>
          st.isSolid(Math.floor(px / 16), Math.floor(py / 16));
        const hitTile = solidAt(nx, ny) || solidAt(nx + this.w, ny)
          || solidAt(nx, ny + this.h) || solidAt(nx + this.w, ny + this.h)
          || solidAt(nx + this.w / 2, ny + this.h / 2);
        if (hitTile) {
          const swallow = this.spec.onTileHit?.(like, game as never) === true;
          if (!swallow) { this.dead = true; return; }
        }
      }
      this.x = nx; this.y = ny;
    }
    if (this.dead) return;
    // —— 敌怪命中(friendly 弹;命中门/免疫/伤害全原版设施) ——
    // ★GameHooks 无 entities 面——Arrow.ts:9608 同款 cast 习语
    const entities = (game as unknown as { entities: { enemies: Enemy[] } }).entities;
    if (this.ownerIsPlayer && this.damage > 0) {
      for (const e of entities.enemies) {
        if (e.dead || this.hitSet.has(e.id)) continue;
        if (!playerCanHitEnemy(e, game as never, this.projId)) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        const swallow = this.spec.onHit?.(like, e, game as never) === true;
        if (swallow) continue;
        const kb = Math.sign(e.cx - this.cx) * this.knockback;
        // ★P4 红蓝修正:hurt 第 7 参 pierce 传 1(原版单发弹语义:无视免疫帧且不设帧)
        //   ——旧传 0=近战档(设 10t 全局免疫),霰弹型多弹同拍只落 1 发
        (e as Enemy).hurt(Math.max(1, Math.trunc(this.damage)), kb, 0, game, undefined, false, 1, true);
        // ★mod debuff 施加(P4):npcDebuff 声明面(键→BuffType 经所属 mod 解析;
        //   chance 掷;max 合并入 NPC 侧存储,tick 在 runModPostEntities)
        const db = this.spec.npcDebuff;
        if (db) {
          const chance = db.chance ?? 1;
          if (chance >= 1 || Math.random() < chance) {
            const modId = modProjModIdOf(this.projId);
            if (modId) {
              applyModNpcBuff(e, modBuffTypeOf(modId, db.buff), db.duration);
            }
          }
        }
        this.hitSet.add(e.id);
        if (this.pierce > 0) {           // ★≤0=无限穿透(文档统一;旧实现 0=即亡)
          this.pierce--;
          if (this.pierce === 0) { this.dead = true; return; }
        }
      }
    }
    // —— 玩家命中(hostile 弹;P2 最小直伤面) ——
    if (!this.ownerIsPlayer && this.damage > 0) {
      if (hitPlayer(this, game as never, this.damage)) {
        const swallow = this.spec.onHitPlayer?.(like, game as never) === true;
        if (!swallow) { this.dead = true; return; }
      }
    }
    // —— mod 行为钩(内置缺省后;可改速度/位置/自管粒子) ——
    this.spec.update?.(like, game as never);
  }
  draw(r: Renderer, cam: Camera): void {
    // vanilla/Projectile_<projId>.png 覆盖键(mod 资产注入;资源包同键族)
    const img = r.atlas?.ensureVImage(`vanilla/Projectile_${this.projId}.png`) ?? null;
    if (!img) return;
    const c = r.ctx;
    if (!c) return;
    // ★rivals 批修复(用户实报"隔空伤害无贴图"):实体循环 ctx 已含相机变换
    //   (Arrow.draw 同约定,世界坐标直绘)——旧实现做 this.x-cam.x 屏幕坐标换算
    //   = 相机变换叠加双重偏移,弹体恒画到屏外。视口剔除改世界域粗判。
    if (this.x + this.w < cam.x - 64 || this.x - this.w > cam.x + r.canvas.width + 64) return;
    if (this.y + this.h < cam.y - 64 || this.y - this.h > cam.y + r.canvas.height + 64) return;
    if (this.spec.rotateToVelocity) {
      const ang = Math.atan2(this.vy, this.vx);
      c.save();
      c.imageSmoothingEnabled = false;
      c.translate(this.x + this.w / 2, this.y + this.h / 2);
      c.rotate(ang);
      c.drawImage(img as CanvasImageSource, -this.w / 2, -this.h / 2, this.w, this.h);
      c.restore();
    } else {
      c.imageSmoothingEnabled = false;
      c.drawImage(img as CanvasImageSource, this.x, this.y, this.w, this.h);
    }
  }
}
