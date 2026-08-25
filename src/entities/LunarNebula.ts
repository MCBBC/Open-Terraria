// 月总双魔法武器 1:1（1.4.5.6 反编译全链）：
//   星云烈焰 3542 → 弹 634（普发）/635（20% 强发 Damage×3，else 速 −1——
//     Player.cs:46489-46498）；AI_001 :51577-51762：ai[1] 状态机（0 初始化
//     Item34 音 → 1 每 update 搜敌（634 半径 250 / 635 500 + CanHitLine 视线；
//     距敌 <20 即 Kill）→ 锁定 ai[1]=6、ai[0]=敌 → >5 追踪（vel = lerp(vel,
//     朝向×6, 1/30)；目标失效回 1）；无重力（:54638 排除 634/635）；40×40 盒、
//     extraUpdates=2、alpha 淡入 40/次、4 帧（4×MaxUpdates=12 update/帧）、
//     尘椭圆 (8,10)/(10,20) 旋转 π/24 + 4 组随机尘。Kill :68745-68807：盒扩
//     50×50 居中 + Damage()（penetrate −1 小 AoE）+ Item14 音 + 40+20 尘爆。
//   月耀 3570 → 弹 645×3 天降（Player.cs:47072-47097：X = 玩家中 + Next(201)
//     ×(−dir) + (鼠标−玩家) 再与玩家中点折叠 + Next(−200,201)、Y = 手心 −600
//     −100×i；速度 = 朝鼠标单位向（|dy| 钳 ≥20）× speed/2；ai[1] = 鼠标世界 Y 线）；
//     AI_001 :54077-54137：飞行相 alpha 恒 255（GetAlpha :76171 → 不可见，视觉
//     = 每 update 尘 229 尾迹）；Y 过线开 tileCollide；每 tick 首 update 搜敌
//     60px + 视线 → 爆炸相（ai[1]=−1：vel 0、盒 140×140、alpha −10/次、帧每
//     18 update、7×6×3=126 update 后 Kill）；NPC 命中同转爆炸（:16706-16710）；
//     Kill :68851-68866：4×尘 31 + 4×尘 229（×3 速）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite, projFrameCount } from './Arrow';
import { playerCanHitEnemy } from './projTargets';
import { canHit, canHitLine } from '../physics/LineOfSight';

type EnemyLike = {
  x: number; y: number; w: number; h: number; id: number; dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean;
};

const TAU = Math.PI * 2;

/** 通用命中（音效 + hurt + 飘字） */
function strike(game: GameHooks, e: EnemyLike, dmg: number, crit: boolean, kb: number, kdir: number, pen: number): void {
  e.hurt(dmg, kdir * kb, 0, game, pen, crit);   // 音/飘值=单点
}

// ================= 星云烈焰弹 634/635（AI_001 :51577-51762） =================

export class NebulaBlazeBolt extends Entity {
  readonly projId: number;                          // 634 普 / 635 强（20% Damage×3 档）
  w = 40; h = 40;                                   // :6539-6540
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  /** 点光：634 (0.7,0.1,0.5) / 635 (0.4,0.6,0.9)（:51584/:51597） */
  lightRGB: [number, number, number] | null;

  /** ai[1]：0 初始化 / 1 搜敌 / 6+ 追踪（num28=5） */
  private ai1 = 0;
  /** ai[0]：目标敌 id（634/635 在 flag3 排除表 :53152 → ai[0] 不自增） */
  private ai0 = 0;
  /** localAI[0]：尘椭圆相位（−Next(48) 起步，48 回绕） */
  private lai0: number;
  /** ★R28 出手散射补掷门（首帧一次,见 fixedUpdate 注） */
  private birthSpreadDone = false;
  private alphaI = 255;
  private frame = 0;
  private frameCtr = 0;
  private rot = 0;
  /** 参数档：[搜索半径, 尘椭圆(x,y), 尘 scale, 光色, 尘基色表, 尘底色] */
  private cfg: { seek: number; ex: number; ey: number; scale: number; rgb: [number, number, number]; palette: number[]; base: number };

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number, variant: 634 | 635) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = variant;
    this.rot = Math.atan2(vy, vx);
    this.lai0 = -Math.floor(Math.random() * 48);
    if (variant === 635) {
      this.cfg = { seek: 500, ex: 10, ey: 20, scale: 1, rgb: [0.4, 0.6, 0.9], palette: [242, 59, 88], base: 88 };
    } else {
      this.cfg = { seek: 250, ex: 8, ey: 10, scale: 1.2, rgb: [0.7, 0.1, 0.5], palette: [242, 73, 72, 71, 255], base: 255 };
    }
    this.lightRGB = this.cfg.rgb;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // ★R28 §5 出手散射（Player.cs:49282-49296,3542 专支）：num179 =
    //   (rand−0.5)×(π/4)×0.7 ≈ ±15.75°,CanHit 失败重掷至多 10 次;vector56 =
    //   基准向.RotatedBy(num179)×(0.95+rand×0.3)。发射挂点在 Game.ts（R26 蓝队
    //   分区）→ 首帧在此对出膛向量补掷（本弹即原版该发）
    if (!this.birthSpreadDone) {
      this.birthSpreadDone = true;
      const spd0 = Math.hypot(this.vx, this.vy);
      if (spd0 > 0.01) {
        let rot = (Math.random() - 0.5) * (Math.PI / 4) * 0.7;
        for (let t = 0; t < 10; t++) {
          const ux = Math.cos(rot), uy = Math.sin(rot);
          if (canHitLine(game.world.store, this.x, this.y, 0, 0,
            this.x + ux * 100, this.y + uy * 100, 0, 0)) break;
          rot = (Math.random() - 0.5) * (Math.PI / 4) * 0.7;       // 重掷
        }
        const c = Math.cos(rot), s = Math.sin(rot);
        const nvx = (this.vx * c - this.vy * s) * (0.95 + Math.random() * 0.3);
        const nvy = (this.vx * s + this.vy * c) * (0.95 + Math.random() * 0.3);
        this.vx = nvx; this.vy = nvy;
        this.rot = Math.atan2(nvy, nvx);
      }
    }
    for (let i = 0; i < 3 && !this.dead; i++) this.step(game);   // extraUpdates=2（MaxUpdates 3）
  }

  private step(game: GameHooks): void {
    const NUM28 = 5;                                 // 搜敌宽限
    // ---- ai[1] 状态机（:51600-51658）----
    if (this.ai1 === 0) {
      this.ai1 = 1;
      this.lai0 = -Math.floor(Math.random() * 48);
      game.playSfxFiles(['Item_34'], 1, this.x, this.y);   // :51604-51605
    } else if (this.ai1 === 1) {
      let target: EnemyLike | null = null;
      let bd = this.cfg.seek;
      for (const ent of game.enemies()) {
        const e = ent as unknown as EnemyLike;
        if (!playerCanHitEnemy(e, game, this.projId)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
        if (e.dead) continue;
        const d = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
        if (d < bd && canHit(game.world.store, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y + e.h / 2, 0, 0)) {
          bd = d; target = e;
        }
      }
      if (bd < 20) { this.burst(game); return; }     // :51624-51627 贴脸即爆
      if (target) { this.ai1 = NUM28 + 1; this.ai0 = target.id; }
    } else if (this.ai1 > NUM28) {
      this.ai1 += 1;
      let target: EnemyLike | null = null;
      for (const ent of game.enemies()) {
        const e = ent as unknown as EnemyLike;
        if (!e.dead && e.id === this.ai0) { target = e; break; }
      }
      if (!target) { this.ai1 = 1; this.ai0 = 0; }   // :51640-51646
      else {
        const dx = target.x + target.w / 2 - this.cx, dy = target.y + target.h / 2 - this.cy;
        const d = Math.hypot(dx, dy);
        if (d < 20) { this.burst(game); return; }    // :51652-51654
        const NUM30 = 6, NUM40 = 30;
        this.vx = (this.vx * (NUM40 - 1) + dx / d * NUM30) / NUM40;
        this.vy = (this.vy * (NUM40 - 1) + dy / d * NUM30) / NUM40;
      }
    }
    if (this.ai1 >= 1 && this.ai1 < NUM28) {         // :51659-51666（过渡带）
      this.ai1 += 1;
      if (this.ai1 === NUM28) this.ai1 = 1;
    }
    // ---- 视觉（:51667-51703）----
    this.alphaI = Math.max(0, this.alphaI - 40);
    if (++this.frameCtr >= 12) {                     // num32 = 4×MaxUpdates = 12
      this.frameCtr = 0;
      this.frame = (this.frame + 1) % 4;
    }
    this.rot = Math.atan2(this.vy, this.vx);
    this.lai0 += 1;
    const pool = game.vanillaDust;
    if (this.lai0 === 48) this.lai0 = 0;
    else if (this.alphaI === 0 && pool) {
      for (let i = 0; i < 2; i++) {                  // 尘椭圆双螺旋
        const a = -Math.PI / 2 + this.lai0 * (Math.PI / 24) + i * Math.PI;
        const d = pool.spawn(this.cx, this.cy, 0, 0, this.cfg.base, 0, 0, 160);
        if (!d) break;
        d.scale = this.cfg.scale;
        d.noGravity = true;
        d.x = this.cx + Math.cos(a) * this.cfg.ex - Math.cos(this.rot) * 10 + this.vx * 2;
        d.y = this.cy + Math.sin(a) * this.cfg.ey - Math.sin(this.rot) * 10 + this.vy * 2;
        const tdx = this.cx + this.vx * 16 - d.x, tdy = this.cy + this.vy * 16 - d.y;
        const tl = Math.hypot(tdx, tdy) || 1;
        d.vx = tdx / tl * 2 + this.vx * 2;
        d.vy = tdy / tl * 2 + this.vy * 2;
      }
    }
    if (pool) {
      const back = (spread: number) => Math.PI + (Math.random() * 2 - 1) * spread + this.rot;
      const half = this.w / 2;
      if (Math.random() < 1 / 12) {                  // 尘 31 拖尾（:51745-51753）
        const d = pool.spawn(this.x, this.y, this.w, this.h, 31, 0, 0, 100);
        if (d) {
          d.vx *= 0.1; d.vy *= 0.1;
          d.x = this.cx + Math.cos(back(0.19635)) * half + this.vx * 2;
          d.y = this.cy + Math.sin(back(0.19635)) * half + this.vy * 2;
          d.fadeIn = 0.9; d.noGravity = true;
        }
      }
      if (Math.random() < 1 / 64) {                  // 尘 31 微光（:51763-51775）
        const d = pool.spawn(this.x, this.y, this.w, this.h, 31, 0, 0, 155, null, 0.8);
        if (d) {
          d.vx *= 0.3; d.vy *= 0.3;
          d.x = this.cx + Math.cos(back(0.3927)) * half;
          d.y = this.cy + Math.sin(back(0.3927)) * half;
          if (Math.random() < 0.5) d.fadeIn = 1.4;
        }
      }
      if (Math.random() < 1 / 4) {                   // 尘彩色族 ×2（:51776-51788）
        for (let i = 0; i < 2; i++) {
          const d = pool.spawn(this.x, this.y, this.w, this.h,
            this.cfg.palette[Math.floor(Math.random() * this.cfg.palette.length)], 0, 0, 0, null, 1.2);
          if (!d) break;
          d.vx *= 0.3; d.vy *= 0.3;
          d.noGravity = true;
          d.x = this.cx + Math.cos(back(0.7854)) * half;
          d.y = this.cy + Math.sin(back(0.7854)) * half;
          if (Math.random() < 0.5) d.fadeIn = 1.4;
        }
      }
      if (this.projId === 634 && Math.random() < 1 / 12) {   // 634 尾焰（:51745 前段）
        const d = pool.spawn(this.x, this.y, this.w, this.h, 255, 0, 0, 100);
        if (d) {
          d.vx *= 0.3; d.vy *= 0.3;
          d.x = this.cx + Math.cos(back(0.19635)) * half;
          d.y = this.cy + Math.sin(back(0.19635)) * half;
          d.fadeIn = 0.9; d.noGravity = true;
        }
      }
      if (this.projId === 635 && Math.random() < 1 / 3) {    // 635 尾焰（:51754-51762）
        const d = pool.spawn(this.x, this.y, this.w, this.h, 88, 0, 0, 100, null, 1.5);
        if (d) {
          d.vx *= 0.3; d.vy *= 0.3;
          d.x = this.cx + Math.cos(back(0.19635)) * half;
          d.y = this.cy + Math.sin(back(0.19635)) * half;
          d.fadeIn = 1.2; d.noGravity = true;
        }
      }
    }
    // ---- 位移 + 撞块（aiStyle1 直飞无重力 + tileCollide）----
    this.x += this.vx;
    this.y += this.vy;
    const st = game.world.store;
    const tx = Math.floor(this.cx / 16), ty = Math.floor(this.cy / 16);
    if (!st.inBounds(tx, ty) || st.get(tx, ty) !== 0 && st.isSolid(tx, ty)) { this.burst(game); return; }
    // ---- 命中（40×40 盒 penetrate 1 → Kill 爆）----
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as EnemyLike;
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      strike(game, e, crit ? this.damage * 2 : this.damage, crit, this.knockback,
        Math.sign((e.x + e.w / 2) - this.cx) || 1, this.armorPen);
      this.burst(game, e.id);
      return;
    }
  }

  /** Kill 链（:68745-68807）：50×50 居中 AoE + Item14 + 尘爆。
   *  skipId = 刚被飞行盒命中的敌（原版由 npc.immune[owner] 10t 挡住 Kill 内
   *  Damage() 的二次结算——本仓 hurt iframe 等价，但免同帧双记显式跳过） */
  private burst(game: GameHooks, skipId = -1): void {
    if (this.dead) return;
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
    game.playSfxFiles(['Item_14'], 1, this.x, this.y);
    const ex = this.cx, ey = this.cy;
    // Damage()：盒 50×50、penetrate −1——对全Overlap敌各结算一次
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as EnemyLike;
      if (e.dead || e.id === skipId) continue;
      if (!(ex - 25 < e.x + e.w && ex + 25 > e.x && ey - 25 < e.y + e.h && ey + 25 > e.y)) continue;
      const crit = Math.random() < this.critChance;
      strike(game, e, crit ? this.damage * 2 : this.damage, crit, this.knockback,
        Math.sign((e.x + e.w / 2) - ex) || 1, this.armorPen);
    }
    // 尘爆（40 彩 + 20 底）——vector30 = (rot−π/2)向 ×|vel|×3
    const pool = game.vanillaDust;
    const spd = Math.hypot(this.vx, this.vy) * 3;
    const bx = Math.cos(this.rot - Math.PI / 2) * spd, by = Math.sin(this.rot - Math.PI / 2) * spd;
    if (pool) {
      for (let i = 0; i < 40; i++) {
        const d = pool.spawn(ex - 25, ey - 25, 50, 50,
          this.cfg.palette[Math.floor(Math.random() * this.cfg.palette.length)], 0, 0, 200, null,
          this.projId === 635 ? 3.7 : 1.7);
        if (!d) break;
        const a = Math.random() * TAU, rr = Math.random() * 25;
        d.x = ex + Math.cos(a) * rr; d.y = ey + Math.sin(a) * rr;
        d.noGravity = true;
        d.vx = d.vx * 3 + bx * Math.random();
        d.vy = d.vy * 3 + by * Math.random();
      }
      for (let i = 0; i < 20; i++) {
        const d = pool.spawn(ex - 25, ey - 25, 50, 50, this.cfg.base, 0, 0, 0, null,
          this.projId === 635 ? 2.2 : 2);
        if (!d) break;
        const a = (Math.random() * 2 - 1) * Math.PI + this.rot;
        d.x = ex + Math.cos(a) * 25 / 3;
        d.y = ey + Math.sin(a) * 25 / 3;
        d.noGravity = true;
        d.vx = d.vx * 0.5 + bx * (0.6 + 0.6 * Math.random());
        d.vy = d.vy * 0.5 + by * (0.6 + 0.6 * Math.random());
      }
    }
    game.spawnParticles(ex, ey, this.projId === 635 ? '#8FB8FF' : '#E878E8', 8, 2, { life: 20 });
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const a = (255 - this.alphaI) / 255;            // GetAlpha :76359（白 × Opacity）
    if (a <= 0.02) return;
    const fh = img.height / Math.max(1, projFrameCount(this.projId));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, this.frame * fh, img.width, fh,
      -img.width / 2, -fh / 2, img.width, fh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ================= 月耀星 645（AI_001 :54077-54137） =================

export class LunarFlareStar extends Entity {
  readonly projId = 645;
  w = 10; h = 10;                                    // :6676-6677
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;

  /** ai[1]：鼠标世界 Y 线（过线开 tileCollide）/ −1 = 爆炸相 */
  private ai1: number;
  /** ai[0]：爆炸相 update 计数（126 Kill） */
  private ai0 = 0;
  private alphaI = 255;
  private frame = 0;
  private frameCtr = 0;
  private exploded = false;
  /** 爆炸锚（盒 140×140 居中不动） */
  private ecx = 0; private ecy = 0;
  /** 每 update 序（tick 首 update 才搜敌） */
  private updInTick = 0;
  /** 爆炸相每敌一次（localNPCHitCooldown=−1） */
  private hitSet = new Set<number>();
  /** ★R28 §7 命中线重估门：原版 ai[2] = num5+pointPosition.Y = 出生 Y + 钳后
   *  |dy|(|dy|≥20) 恒在出生点【下】方;Game.ts :11466 曾用原始 dy(可负) → 高打低
   *  lineY 为负过线门永不触发。首帧按 player.aimWY 重估（发射挂点在 Game.ts,
   *  R26 分区）——同帧 aimWY 即发射时鼠标世界坐标 */
  private lineYFixed = false;
  private startY = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number, lineY: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    // 兜底钳门：lineY < 出生 Y+20（原版恒 ≥）时先钳到最小值,首帧再按 aimWY 精确重估
    this.ai1 = Math.max(lineY, y + 20);
    this.startY = y;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.updInTick = 0;
    for (let i = 0; i < 6 && !this.dead; i++) { this.step(game); this.updInTick++; }   // extraUpdates=5
  }

  private step(game: GameHooks): void {
    const st = game.world.store;
    // ★R28 §7：首帧按鼠标世界 Y 精确重估目标线（原版 ai[2]=出生Y+max(20,|dy|)）
    if (!this.lineYFixed) {
      this.lineYFixed = true;
      const aimY = (game.player as { aimWY?: number } | null | undefined)?.aimWY
        ?? (this.startY + 20);
      this.ai1 = Math.max(this.ai1, this.startY + Math.max(20, Math.abs(aimY - this.startY)));
    }
    const collide = this.ai1 !== -1 && this.y > this.ai1;   // :54079-54082 过线开碰撞
    // 尘 229 尾（每 update；体内实心时 noLight）:54089-54096
    const pool = game.vanillaDust;
    const solidHere = st.inBounds(Math.floor(this.cx / 16), Math.floor(this.cy / 16))
      && st.isSolid(Math.floor(this.cx / 16), Math.floor(this.cy / 16));
    if (pool) {
      const d = pool.spawn(this.x, this.y, this.w, this.h, 229);
      if (d) {
        d.x = this.cx; d.y = this.cy;
        d.vx = 0; d.vy = 0;
        d.noGravity = true;
        if (solidHere) d.noLight = true;
      }
    }
    if (this.ai1 === -1) {
      // ---- 爆炸相（:54104-54125）：140×140、alpha−10、7 帧×18 update、126 Kill ----
      this.ai0 += 1;
      this.vx = 0; this.vy = 0;
      this.w = 140; this.h = 140;
      this.x = this.ecx - 70; this.y = this.ecy - 70;
      this.alphaI = Math.max(0, this.alphaI - 10);
      if (++this.frameCtr >= 18) { this.frameCtr = 0; this.frame++; }
      for (const ent of game.enemies()) {
        if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
        const e = ent as unknown as EnemyLike;
        if (e.dead || this.hitSet.has(e.id)) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        const crit = Math.random() < this.critChance;
        strike(game, e, crit ? this.damage * 2 : this.damage, crit, this.knockback,
          Math.sign((e.x + e.w / 2) - this.ecx) || 1, this.armorPen);
        this.hitSet.add(e.id);
      }
      if (this.ai0 >= 126) {                         // 7×MaxUpdates(6)×3
        this.dead = true;
        game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
      }
      return;
    }
    this.alphaI = 255;                               // :54126 飞行相恒隐（视觉=尘尾）
    // 每 tick 首 update 搜敌 60px + 视线 → 爆炸（:54127-54136）
    if (this.updInTick === 0) {
      for (const ent of game.enemies()) {
        if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
        const e = ent as unknown as EnemyLike;
        if (e.dead) continue;
        if (Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy) >= 60) continue;
        if (!canHit(game.world.store, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y + e.h / 2, 0, 0)) continue;
        this.explodeNow();
        return;
      }
    }
    // 位移（直飞无重力）+ 撞块（过线后）
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor(this.cx / 16), ty = Math.floor(this.cy / 16);
    if (collide && st.inBounds(tx, ty) && st.get(tx, ty) !== 0 && st.isSolid(tx, ty)) {
      this.killDust(game);
      return;
    }
    if (!st.inBounds(tx, ty)) { this.killDust(game); return; }
    // 命中敌 → 转爆炸（:16706-16710，非 Kill）
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as EnemyLike;
      if (e.dead || this.hitSet.has(e.id)) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      this.explodeNow();
      return;
    }
  }

  /** 进入爆炸相（ai[0]=0、ai[1]=−1、锚=当前中心） */
  private explodeNow(): void {
    this.exploded = true;
    this.ecx = this.cx; this.ecy = this.cy;
    this.ai0 = 0;
    this.ai1 = -1;
    this.frameCtr = 0;
  }

  /** Kill 链（:68851-68866）：4×尘 31 + 4×尘 229 ×3 速（体内实心 → 尘 noLight） */
  private killDust(game: GameHooks): void {
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
    const st = game.world.store;
    const tx = Math.floor(this.cx / 16), ty = Math.floor(this.cy / 16);
    const solidHere = st.inBounds(tx, ty) && st.isSolid(tx, ty);   // flag5（:68853）
    const pool = game.vanillaDust;
    if (pool) {
      for (let i = 0; i < 4; i++) {
        pool.spawn(this.x, this.y, this.w, this.h, 31, 0, 0, 100, null, 1.5);
      }
      for (let i = 0; i < 4; i++) {
        const d = pool.spawn(this.x, this.y, this.w, this.h, 229, 0, 0, 0, null, 2.5);
        if (d) { d.noGravity = true; d.vx *= 3; d.vy *= 3; d.noLight = solidHere; }
      }
    }
    game.spawnParticles(this.cx, this.cy, '#FF9AE8', 6, 1.8, { life: 18 });
  }

  draw(r: Renderer, _cam: Camera): void {
    if (!this.exploded) return;                      // 飞行相 alpha=255 → GetAlpha≈0 不画
    const img = projSprite(645);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const a = (255 - this.alphaI) / 255;
    if (a <= 0.02) return;
    const fh = img.height / 7;                // 7 帧（98×686）
    const fr = Math.min(6, this.frame);
    ctx.save();
    ctx.globalAlpha = a * 0.5;                       // GetAlpha :76171 A=127−alpha/2 ≈ 半透
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, fr * fh, img.width, fh,
      this.ecx - img.width / 2, this.ecy - fh / 2, img.width, fh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
