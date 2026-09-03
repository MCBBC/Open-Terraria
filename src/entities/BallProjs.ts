// 玩具球弹家族（孤儿武器 B3 波：沙滩球 155 / 橄榄球 861）。
// ---------------------------------------------------------------------------
// 沙滩球 155（BeachBallProj——沙滩球 859 shoot）
//   SetDefaults（Projectile.cs:2428-2434）：44×44 / aiStyle 32 / friendly /
//   netImportant。物品侧（Item.cs:11440-11453）useStyle1/speed6/consumable/
//   noUseGraphic/noMelee/useTime=useAnim20/UseSound Item1。
//   AI_032（Projectile.cs:27264-27408）：
//     · ai[0]++；≥20 钳回 18（每 ~2t 扫描）→ 盒相交玩家/NPC/弹幕踢飞：
//       vy=-4.5、vx 先钳 ±2 再 =(vx+dir×1.75)/2 后 += 对方 vx×3、钳 ±6、模长钳 16，
//       ai[1]++（踢次计数）；★timeLeft 每帧重置 10 = 仅静止杀（Kill 唯一出口
//       除被水泡烂 vx==0）
//     · 静止杀 vx==0&&vy==0（:27350）；rotation += vx×0.02
//     · 地面摩擦 vy==0 → vx×0.98 / 水中 0.99 / 空中 0.995，|vx|<0.03 归零（:27356-27361）
//     · wet：ai[1]=0、vy>0 → ×0.95、vy−0.1 下限 −4（浮升）、vx==0 即杀（:27362-27372）
//     · 否则 vy += 0.1 上限 10（:27378-27381）
//   WallCollision 支（type==155,:18714-18728）：ai[1]>10 → Chat 广播 Game.BallBounceResult；
//     ai[1]=0；X 反弹 ×(-0.6)、Y 反弹 ×(-0.6) 仅 lastVy>2。
//   Kill（Projectile.cs:79351-79354）：RequestNewItem(Center, 859) 还玩家。
//   广播已接 ChatHelper.BroadcastChatMessage 世界聊天面（game.chatBroadcast 单口：
//   单机 ChatMonitor + 联机 channel2 系统行中继,2026-09-03 清偿退役 recLog 备案）。
// ---------------------------------------------------------------------------
// 橄榄球 861（FootballProj——橄榄球 4743 shoot）
//   SetDefaults（Projectile.cs:8269-8275）：10×10 / aiStyle 2 / friendly / netImportant。
//   物品侧（Item.cs:38989-39004）speed11/damage0/consumable/noUseGraphic/noMelee/
//   useTime=useAnim15/UseSound Item1。
//   撞墙支（Projectile.cs:18484-18502）：系数 num27 = ai[1]==1 ? -0.6 : -1；X 反转 ×num27，
//   Y 反转 ×num27 仅 lastVy>0.7；|vy|<0.5 → vy=0；**首次触墙后 ai[1]=1**（切滚动态）。
//   碰撞盒 10×10（Update colWidth/colHeight 表 :20073——与 SetDefaults 同值）。
//   AI 型专段（Projectile.cs:23674-23730）：
//     · owner==本地 → localAI[0]++ 钳 30；命中任一存活玩家 → Kill（被捡走并回归）。
//       ★宽限语义钉死（2026-08-31 台账核清,Projectile.cs:23677-23691 原文）：
//       回收条件 = `(player2.whoAmI != player.whoAmI || !(localAI[0] < 30f))` ——
//       【宽限期(≤30t)只豁免 owner 本人】,其他玩家一触即回收,
//       不存在"任何玩家共享 30t 宽限窗"面;MP 下远端玩家提前触球被回收=原文真值。
//     · vy==0 → vx×0.95 / 空 0.995；|vx|<0.5 → 0；vx==0&&vy==0 → Kill
//     · vy += 0.1
//     · ai[1]==1（滚动）：frame=frameCounter=0，rotation += (|vx|+|vy|)×0.03×direction
//       （direction ∈ 弹速符号,Update 常规写回）
//       否则飞行：frame 从 1 起 4 帧 5t/步循环；rotation = atan2(vy,vx)+π/4，
//       spriteDirection 按 vx 翻面 + π/2 微调
//   受伤撒球（Player.cs:38542-38549）：hasFootball 玩家受击 → 全背包 4743 清空改为
//     发射同数量弹 861（vel=(-hitDir×4,-6)，ai0=0/ai1=1/ai2=原堆叠数）。Game.damagePlayer 内接。
//   Kill（Projectile.cs:79355-79357）：RequestNewItem(Center+(0,-2), 4743, max(ai[2],1))。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';
import { TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Lang } from '../i18n/Lang';

/** 同 AABB 相交（Rectangle.Intersects 语义：边缘相贴不算） */
function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

abstract class BallBase extends Entity {
  declare x: number; declare y: number;
  abstract readonly projId: number;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, w: number, h: number) {
    super();
    this.w = w; this.h = h;
    this.x = x - w / 2; this.y = y - h / 2;
    this.vx = vx; this.vy = vy;
  }

  /** 命中扫掠盒（moveAndCollide 前），判本帧是否真的撞了 tile */
  protected stepWithCollision(world: import('../world/World').World): void {
    moveAndCollide(this, world, this.vx, this.vy);
  }

  /** 出界防巡游（原版世界边缘 Kill 兜底等价） */
  protected outOfBounds(game: GameHooks): boolean {
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    return !st.inBounds(tx, ty);
  }
}

export class BeachBallProj extends BallBase {
  readonly projId = 155;
  /** Projectile.rotation（AI_032 rotation += vx×0.02） */
  rot = 0;
  /** ai[1]：踢飞累计次数（被踢 ++,撞墙清零；>10 时撞墙广播） */
  bounceCount = 0;
  /** ai[0]：扫描节拍 */
  private scan = 0;
  life = 32400;   // 登记护栏：timeLeft 每帧重置永不超时,防极端卡嵌死循环

  constructor(x: number, y: number, vx: number, vy: number) {
    super(x, y, vx, vy, 44, 44);
  }

  override fixedUpdate(_dt: number, game: GameHooks): void {
    const world = game.world;
    if (this.outOfBounds(game)) { this.dead = true; return; }

    // ---- 盒扫描踢飞（AI_032 :27264-27349）：原版单道门 = ai[0]++ 后仅 ≥20 一档,
    //      同支内复位 18 并扫描（稳态每 2t 恰一轮）;曾写成复位后再开一道 ≥18 门
    //      → scan∈[18..20) 每 tick 全扫 ×2（红队 finding B3-2,已删第二道门）----
    this.scan++;
    if (this.scan >= 20) {
      this.scan = 18;                               // ai[0] = 18（未被踢则 +2t 后再扫）
      const kick = (dir: number, ovx: number, ovy: number): void => {
        this.scan = 0;                              // ai[0] = 0（仅真实踢中才置 0,:27278）
        let nvx = this.vx, nvy = -4.5;              // velocity.Y = -4.5
        if (nvx > 2) nvx = 2; if (nvx < -2) nvx = -2;         // 钳 ±2
        nvx = (nvx + dir * 1.75) / 2;               // =(vX+direction*1.75)/2
        nvx += ovx * 3;                             // += 对象 velocity.X*3
        nvy += ovy;                                 // += 对象 velocity.Y
        if (nvx > 6) nvx = 6; if (nvx < -6) nvx = -6;         // 钳 ±6
        const sp = Math.hypot(nvx, nvy);
        if (sp > 16) { nvx = nvx / sp * 16; nvy = nvy / sp * 16; }  // SafeNormalize×16
        this.vx = nvx; this.vy = nvy;
        this.bounceCount++;                          // ai[1]++
      };
      // 玩家（candidatePlayers = Main.player[0..254] 全表扫描等价,M11 口径）
      for (const p of game.candidatePlayers?.() ?? [game.player]) {
        const dead = (p as unknown as { dead?: boolean }).dead;
        if (!dead && overlaps(this, p)) kick(p.facing, p.vx, p.vy);
      }
      // NPC（矩形盒直比;原版 Colliding 大体全盒）
      for (const e of [...(game.enemies?.() ?? []), ...(game.npcs?.() ?? [])]) {
        const b = e as unknown as { x?: number; y?: number; w?: number; h?: number; dead?: boolean; hitbox?: () => { x: number; y: number; w: number; h: number } };
        if (b.dead || !b) continue;
        const box = b.hitbox ? b.hitbox() : { x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? 0, h: b.h ?? 0 };
        if (overlaps(this, box)) kick((e as unknown as { dir?: number }).dir ?? 1, (b as unknown as { vx?: number }).vx ?? 0, (b as unknown as { vy?: number }).vy ?? 0);
      }
      // 其他弹幕（排除自身；原版含全部 active 弹,无害互推）
      for (const o of game.projectiles?.() ?? []) {
        const ob = o as unknown as { x?: number; y?: number; w?: number; h?: number; dead?: boolean; vx?: number; vy?: number };
        if (!ob || ob === this || ob.dead) continue;
        const box = { x: ob.x ?? 0, y: ob.y ?? 0, w: ob.w ?? 0, h: ob.h ?? 0 };
        if (overlaps(this, box)) kick(1, ob.vx ?? 0, ob.vy ?? 0);
      }
    }

    // ---- 静止杀（:27348-27350,AI 段——读的是上 tick 移动结算后的"沉降态"速度；
    //       ★须在重力/摩擦前判,否则贴地 vy 恒被 +0.1 再顶起,永不成零）----
    if (this.vx === 0 && this.vy === 0) { this.dieReturnItem(game); return; }

    // ---- 湿身判定（wet 由上一帧 WetCollision 写;本仓取当前弹心格 liquid）----
    const st = world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    const wet = st.inBounds(tx, ty) && st.liquid[st.idx(tx, ty)] > 0;

    // rotation += vx×0.02（:27352）
    this.rot += 0.02 * this.vx;
    // 摩擦（:27354-27361）： vy==0 → ×0.98 / wet 0.99 / 空 0.995;|vx|<0.03 归零
    if (this.vy === 0) this.vx *= 0.98;
    else if (wet) this.vx *= 0.99;
    else this.vx *= 0.995;
    if (Math.abs(this.vx) < 0.03) this.vx = 0;

    // ---- AI 重力/浮力（:27362-27381）：湿浮 vy−0.1 下限 −4 且 vx==0 即 Kill；干重力 +0.1 上限 10 ----
    if (wet) {
      this.bounceCount = 0;
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.1;
      if (this.vy < -4) this.vy = -4;
      if (this.vx === 0) {                            // 水中停住即杀(:27369-27370)
        this.dieReturnItem(game);
        return;
      }
    } else {
      this.vy += 0.1;
      if (this.vy > 10) this.vy = 10;
    }

    // ---- 移动+撞墙（HandleMovement WallCollision 支 :18714-18728）----
    const lvx = this.vx, lvy = this.vy;
    this.onGround = false; this.hitWall = false; this.hitHead = false; this.collideY = false;
    this.stepWithCollision(world);

    if (this.hitWall || this.collideY) {
      // 沙滩球撞墙反跳（:18715-18728）
      if (this.bounceCount > 10) {
        // ChatHelper.BroadcastChatMessage（:18719）：NetworkText.FromKey("Game.BallBounceResult",
        //  FromKey(弹名), ai[1]) + ChatColors.ServerMessage(255,240,20)（ChatColors.cs:13）。
        //  {0}=Lang.GetProjectileName(155)（"Beach Ball"）、{1}=踢次数。广播单口 =
        //  单机本地消息列（Main.NewText 形态）+ 联机 channel2 系统行中继其他端
        game.chatBroadcast?.(
          Lang.text('Game.BallBounceResult',
            Lang.projectileName(this.projId) ?? `Projectile ${this.projId}`, this.bounceCount),
          255, 240, 20);
      }
      this.bounceCount = 0;
      let nx = this.vx, ny = this.vy;
      if (nx !== lvx) nx = lvx * -0.6;                       // X 反弹 ×(-0.6)
      if (ny !== lvy && lvy > 2) ny = lvy * -0.6;            // Y 反弹仅 lastVy>2
      this.vx = nx; this.vy = ny;
    }

    if (--this.life <= 0) { this.dead = true; }      // 护栏（登记,非原版路径）
  }

  /** Kill(:79351-79354)：RequestNewItem(Center, 859) 还玩家 */
  private dieReturnItem(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    game.spawnDrop?.(this.cx, this.cy, 'vi_859_BeachBall', 1);   // spawnDrop 出参=盒心
  }

  /** 单帧 50×50（public/sprites/vanilla/Projectile_155.png 实测）——绕中心旋转绘制 */
  override draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage('vanilla/Projectile_155.png');
    const ctx = r.ctx;
    if (!ctx || !img) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

export class FootballProj extends BallBase {
  readonly projId = 861;
  /** Projectile.rotation（飞行 = 速度向 + π/4 / 滚动 += 速度模×0.03×dir） */
  rot = 0;
  /** ai[1]：0 手掷档 / 1 触墙后滚动档（:18501 无条件置位） */
  rolledOnce = false;
  /** ai[2]：Kill 回落堆叠数（受击撒球链传原堆叠 :38546;手掷默认 0 → max(...,1)=1） */
  stackCount = 0;
  /** spriteDirection（Update 常规 velocity.X 符号写回；draw 翻面消费） */
  lvxSign = 1;
  /** localAI[0]：出生宽限 30t（期内自己不触发"接触回收"） */
  private grace = 0;
  private frameCounter = 0;
  frame = 0;
  life = 3600;

  constructor(x: number, y: number, vx: number, vy: number, stackCount = 0, rolledOnce = false) {
    super(x, y, vx, vy, 10, 10);
    this.stackCount = stackCount;
    this.rolledOnce = rolledOnce;
  }

  override fixedUpdate(_dt: number, game: GameHooks): void {
    const world = game.world;
    if (this.outOfBounds(game)) { this.dead = true; return; }

    // 接触回收（:23677-23691）：owner 本地门本仓恒真（单人/代理弹都归本端桶）。
    // Kill() 单口 → :79355-79357 回落段同样生效（被"捡走"= 回到玩家头顶掉落）。
    // ★宽限=owner-only 钉死（Projectile.cs:23686 `(player2.whoAmI != player.whoAmI ||
    //   !(localAI[0] < 30f))`）：30t 窗只豁免 owner;其余候选玩家(含 MP 远端代理)
    //   存活且盒相交即立即回收——非债,原文如此。
    this.grace = Math.min(30, this.grace + 1);
    for (const p of game.candidatePlayers?.() ?? [game.player]) {
      const meta = p as unknown as { dead?: boolean; owner?: boolean; who?: number };
      if (meta.dead) continue;
      const isSelf = (p as unknown) === (game.player as unknown);
      if (isSelf && this.grace < 30) continue;      // 自己须过宽限
      if (overlaps(this, p)) { this.dieReturnItem(game); return; }   // Colliding→Kill
    }

    // ---- 型专段速度学（AI 段 :23692-23706）：★先摩擦后重力——vy 读的是上 tick
    //       移动结算沉降态（贴地=0 选 0.95 档）;静止杀在此判（若放移动后会因
    //       贴地 +0.1 恒非零而永不触发）----
    if (this.vy === 0) this.vx *= 0.95; else this.vx *= 0.995;
    if (Math.abs(this.vx) < 0.5) this.vx = 0;
    if (this.vx === 0 && this.vy === 0) {           // 静止 → Kill 回收(:23703-23704)
      this.dieReturnItem(game);
      return;
    }
    this.vy += 0.1;                                  // 重力

    // ---- 帧/自转（:23707-23729,AI 段消费当前速度）----
    if (this.rolledOnce) {
      this.frame = 0; this.frameCounter = 0;
      const dir = this.vx < 0 ? -1 : 1;             // Update 自动写向(:17121-17131):vx<0→-1 否则 +1,
                                                    // vx==0 亦取 +1（曾按 vy<0 取 -1 = 反向,B3-minor）
      this.rot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * dir;
    } else {
      if (this.frame === 0) this.frame = 1;
      if (++this.frameCounter > 4) {                 // >4 → 5t/帧
        this.frameCounter = 0;
        if (++this.frame >= 4) this.frame = 1;       // projFrames[861]=4(Main.cs:8803)
      }
      this.lvxSign = this.vx < 0 ? -1 : 1;           // spriteDirection（Update 常规写回）
      this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 4;   // velocity.ToRotation()+90°
      if (this.vx < 0) this.rot += Math.PI / 2;      // spriteDirection==-1 微调
    }

    // ---- 移动+撞墙（HandleMovement 支 :18484-18502,lastVelocity 门镜像）----
    const lvx = this.vx, lvy = this.vy;
    this.onGround = false; this.hitWall = false; this.hitHead = false; this.collideY = false;
    this.stepWithCollision(world);
    if (this.hitWall || this.collideY) {
      const k = this.rolledOnce ? -0.6 : -1;        // num27 = ai[1]==1 ? -0.6 : -1
      let nx = this.vx, ny = this.vy;
      if (nx !== lvx) nx = lvx * k;                 // X 反转×k
      if (ny !== lvy && lvy > 0.7) ny = lvy * k;    // Y 反转仅 lastVy>0.7
      if (Math.abs(ny) < 0.5) ny = 0;               // :18497-18498
      this.vx = nx; this.vy = ny;
      this.rolledOnce = true;                        // ai[1] = 1（首触墙即切档）
    }
    if (--this.life <= 0) this.dead = true;
  }

  /** localAI[0] 只读（测试断言用） */
  graceTicks(): number { return this.grace; }

  /** Kill（Projectile.cs:79355-79357）：RequestNewItem(Center+(0,-2), 4743,
   *  max(ai[2],1))——接触回收/静止/撞墙各 Kill 路径共口 */
  private dieReturnItem(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    game.spawnDrop?.(this.cx, this.cy - 2, 'vi_4743_Football',
      Math.max(this.stackCount, 1));                    // spawnDrop 出参=盒心;+(-2) 垂直
  }

  /** 竖排 4 帧（Projectile_861.png 实测 22×96 = 22×24×4;SetDefaults 盒 10×10、
   *  原版绘制 origin = 贴图中心）——飞行态按帧滚动条,滚动态钉 frame0 绕心旋转 */
  override draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage('vanilla/Projectile_861.png');
    const ctx = r.ctx;
    if (!ctx || !img) return;
    const fh = img.height >= 4 ? img.height / 4 : img.height;
    const sy = Math.round(this.frame * fh);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    if (this.rolledOnce) ctx.rotate(this.rot);
    else {
      // 飞行：rotation 已含速度向 + 翻面微调（AI 内），仅缩进贴图朝向
      ctx.rotate(this.rot);
      if (this.lvxSign < 0) ctx.scale(-1, 1);   // spriteDirection 镜像
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, sy, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
    ctx.restore();
  }
}
