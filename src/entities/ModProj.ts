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
import { modProjSpecOf, modProjModIdOf, applyModNpcBuff, modProjIdOfKey, type ModProjLike } from '../mods/hooks';
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
  /** 命中过の敵怪 id 集(穿透去重;★五百八十五 hitRefresh>0=按 ageTicks 过期窗,
   *  常驻召唤体可周期性再命中;缺省 0=永久去重) */
  private hitSet = new Map<number, number>();
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
    if (ownerIsPlayer) { this.ownerX = x; this.ownerY = y; }   // boomerang 返程锚(构造时)
    this.pierce = spec.pierce ?? 1;
    this.ownerIsPlayer = ownerIsPlayer;
  }

  kill(): void { this.dead = true; }

  ownerX = 0; ownerY = 0; orbitPhase = 0; orbitCx: number | null = null; orbitCy: number | null = null;
  holdT = 0;   // ★三百五十一刀:holdout 节拍计数
  /** ★五百八十二:holdout 释放存续态(onChannelEnd 返回 true 置位——channel 门解除,
   *  update 钩自管转储/再装填并自行 kill;C# Condemnation 弹倾泻/M1Garand 装填弹体
   *  存续面。mod 侧经 p.__swHoldoutReleased 读) */
  __swHoldoutReleased = false;

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
    this.ageTicks++;
    // ★三百五十一刀:holdout 原语(Calamity Holdout 弹范式——跟随玩家/channel
    //  门/魔耗/timeLeft 续命;RancorHoldout.cs 等全系同构)
    if (this.spec.holdout) {
      const p = (game as unknown as { player?: { cx: number; cy: number; dead?: boolean; checkMana?(n: number): boolean } }).player;
      const held = (game as unknown as { input?: { mouseHeld?: boolean } }).input?.mouseHeld;
      const h = this.spec.holdout;
      // ★五百八十二:释放存续期——channel 门/魔耗/节拍射击全解除,只跑 update 钩
      //  (mod 侧转储/再装填/kill 自管;寿命不受 3600 上限——存续弹自管消亡)
      if (this.__swHoldoutReleased) {
        this.spec.update?.(this as unknown as ModProjLike, game as never);
        return;
      }
      if (!p || p.dead || !held) {
        // ★五百七十一:channel 结束钩(松开左键/死亡时调用=释放面;C# KillHoldoutLogic
        //  同位)——★五百八十二:返回 true=释放存续(C# Condemnation 转储至耗尽/
        //  M1Garand 再装填中弹体不亡),置释放态后 update 钩接管;false/void=照旧消亡
        const keep = h.onChannelEnd?.(this as any, game as any) === true;
        if (!keep) { this.dead = true; return; }
        this.__swHoldoutReleased = true;
        this.spec.update?.(this as unknown as ModProjLike, game as never);
        return;
      }   // channel 门
      this.x = p.cx - this.w / 2;                                 // 跟随(:35 Owner.Center+offset)
      this.y = p.cy - this.h / 2;
      this.vx = 0; this.vy = 0;
      this.holdT = (this.holdT ?? 0) + 1;
      if (h.manaCost && this.holdT % (h.manaRate ?? 12) === 0) {  // 魔耗节拍(:22 rate12)
        if (!p.checkMana!(h.manaCost)) { this.dead = true; return; }
      }
      // ★三百五十六刀:节拍射击面(shoot.every tick 自动发射;atMouse=鼠标处生成;
      //  proj=mod 弹全键,经 hooks.projKeyIndex 解析——节拍射击族 holdout 免写钩)
      const sh = h.shoot;
      if (sh && sh.proj && this.holdT % Math.max(1, sh.every) === 0) {
        const pid = modProjIdOfKey(sh.proj);
        if (pid >= 0) {
          const gg = (globalThis as { __swGame?: { camera?: { screenToWorld?(x: number, y: number): [number, number] }; input?: { mouseX: number; mouseY: number } } }).__swGame;
          const mwt = gg?.camera?.screenToWorld && gg.input
            ? gg.camera.screenToWorld(gg.input.mouseX, gg.input.mouseY) : null;
          const [mx, my] = mwt ?? [this.cx, this.cy - 100];
          const dx = mx - this.cx, dy = my - this.cy;
          const dd = Math.hypot(dx, dy) || 1;
          const v = sh.vel ?? 8;
          const px = sh.atMouse ? mx : this.cx;
          const py = sh.atMouse ? my : this.cy;
          (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(
            new ModProj(px, py, (dx / dd) * v, (dy / dd) * v, this.damage, 0, pid, true));
        }
      }
      this.spec.update?.(this as unknown as ModProjLike, game as never);   // 首帧附属/射击节拍=弹钩
      return;                                                     // 寿命由 channel 门管(续命同义)
    }
    // —— 寿命(缺省 3600) ——
    const life = this.spec.lifetime ?? 3600;
    if (this.ageTicks > life) { this.dead = true; return; }
    // ★B7 一百零六刀:原语②accelerate(初速向推进)/③boomerang(返程)/④orbit(环绕)
    if (this.spec.accelerate) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      this.vx += (this.vx / sp) * this.spec.accelerate;
      this.vy += (this.vy / sp) * this.spec.accelerate;
    }
    if (this.spec.boomerang && this.ageTicks >= this.spec.boomerang.returnTicks) {
      const ox = this.ownerX, oy = this.ownerY;
      const dx = ox - this.cx, dy = oy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      // ★三百四十二刀:accel 缺省 0.5(vanilla aiStyle 3 返程臂=向 owner 每帧加速,
      //  1457 重构后字面待核=登记;实参可经声明面 boomerang.accel 覆写)
      const accel = this.spec.boomerang.accel ?? 0.5;
      this.vx += (dx / d) * accel;
      this.vy += (dy / d) * accel;
      if (d < 24) this.dead = true;   // 拾取消亡
    }
    if (this.spec.orbit) {
      const o = this.spec.orbit;
      const a = this.ageTicks * o.omega + (this.orbitPhase ?? 0);
      this.orbitCx = this.orbitCx ?? this.cx;
      this.orbitCy = this.orbitCy ?? this.cy;
      this.x = this.orbitCx + Math.cos(a) * o.radius - this.w / 2;
      this.y = this.orbitCy + Math.sin(a) * o.radius - this.h / 2;
      this.vx = -Math.sin(a) * o.radius * o.omega;
      this.vy = Math.cos(a) * o.radius * o.omega;
    }
    // ★B7 一百零五刀:弹幕 AI 通用面①homing(追踪:向最近敌怪加速 accel/拍)
    //  ——ownerIsPlayer 弹才追敌(hostile 弹=登记);上限钳速
    if (this.spec.homing && this.ownerIsPlayer) {
      const accel = this.spec.homing;
      let best: { cx: number; cy: number } | null = null;
      let bestD = 1e9;
      const enemies = (game as unknown as { entities?: { enemies?: Array<{ dead?: boolean; cx: number; cy: number }> } }).entities?.enemies;
      for (const en of enemies ?? []) {
        if (en.dead) continue;
        const d = Math.hypot(en.cx - this.cx, en.cy - this.cy);
        if (d < bestD) { bestD = d; best = en; }
      }
      if (best && bestD < (this.spec.homingDist ?? 800)) {
        const d = Math.hypot(best.cx - this.cx, best.cy - this.cy) || 1;
        this.vx += ((best.cx - this.cx) / d) * accel;
        this.vy += ((best.cy - this.cy) / d) * accel;
        const sp = Math.hypot(this.vx, this.vy);
        const cap = Math.max(8, accel * 12);
        if (sp > cap) { this.vx = (this.vx / sp) * cap; this.vy = (this.vy / sp) * cap; }
      }
    }
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
    if (this.ownerIsPlayer && this.damage > 0 && !this.spec.noContactDamage) {
      for (const e of entities.enemies) {
        if (e.dead) continue;
        const hitT = this.hitSet.get(e.id);
        if (hitT !== undefined) {
          // ★五百八十五:重击窗(hitRefresh>0=窗内去重,窗外过期可再命中)
          const refresh = this.spec.hitRefresh ?? 0;
          if (refresh <= 0 || this.ageTicks - hitT < refresh) continue;
          this.hitSet.delete(e.id);
        }
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
        this.hitSet.set(e.id, this.ageTicks);
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
    // ★618-R3F1:相机锚=视口中心(worldToScreen=(wx-cam.x)*z+viewW/2)——
    //  旧式 cam.x±宽 当左上角=左/上半屏弹恒被剔除;改中心锚+zoom 归一
    const zoom = (r as unknown as { zoom?: number }).zoom ?? 1;
    const halfW = r.canvas.width / (2 * zoom) + 64, halfH = r.canvas.height / (2 * zoom) + 64;
    const cx2 = cam.x;   // 中心锚=cam.x(渲染变换 translate(viewW/2)·scale(z)·translate(-cam.x) 的 cam.x 即视口中心)
    if (this.x + this.w < cx2 - halfW || this.x - this.w > cx2 + halfW) return;
    if (this.y + this.h < cam.y - halfH || this.y - this.h > cam.y + halfH) return;
    // ★五百八十五:竖排帧切片(frames>1 时按 (ageTicks/6)%frames 取行;
    //  贴图高=frames×单帧高,行高=img.height/frames)
    const frames = this.spec.frames ?? 1;
    const fh = frames > 1 ? img.height / frames : img.height;
    const row = frames > 1 ? Math.floor(this.ageTicks / 6) % frames : 0;
    if (this.spec.rotateToVelocity) {
      const ang = Math.atan2(this.vy, this.vx);
      c.save();
      c.imageSmoothingEnabled = false;
      c.translate(this.x + this.w / 2, this.y + this.h / 2);
      c.rotate(ang);
      c.drawImage(img as CanvasImageSource, 0, row * fh, img.width, fh, -this.w / 2, -this.h / 2, this.w, this.h);
      c.restore();
    } else {
      c.imageSmoothingEnabled = false;
      c.drawImage(img as CanvasImageSource, 0, row * fh, img.width, fh, this.x, this.y, this.w, this.h);
    }
  }
}
