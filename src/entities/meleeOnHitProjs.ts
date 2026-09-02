// ★R2-07(g)/R2-06④（蓝队二轮）近战 on-hit 弹实体族——按原版 Projectile.cs
// SetDefaults/AI 忠实新建；消费方 = Game.updateSwingHits 命中管线（ApplyNPCOnHitEffects
// 对应位）。权威原文逐段锚在各类注释内。命中面与 VolcanoBlastProj 同口径
// （截断盒相交 + playerCanHitEnemy + Main.DamageVar ±15% + crit 折叠 + e.hurt 单点）。
// 免疫写方桥统一走 game.noteNpcPlayerImmune（GC1 出口）。
import { Entity } from './Entity';
import { projSprite } from './Arrow';
import { playerCanHitEnemy, applyBannerDamageDealt } from './projTargets';
import { damageVarRoll } from '../stats/DamageVar';
import { projectileSnapStrikeBonus } from '../stats/SnapStrike';
import type { GameHooks } from './types';

interface EnemyLike {
  id: number; x: number; y: number; w: number; h: number; cx?: number; cy?: number;
  vx?: number; vy?: number;
  dead: boolean; dontTakeDamage?: boolean;
  hurt: (dmg: number, kx: number, ky: number, g: GameHooks, pen?: number,
    crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number,
    srcProjId?: number) => boolean;
}

/** usesLocalNPCImmunity / usesIDStaticNPCImmunity 族落地的全局窗清零写（GC1：
 *  Projectile.cs:14177 immune[owner]=0 —— 新命中面覆盖前窗）。 */
function clearGlobalImmune(game: GameHooks, npcId: number): void {
  (game as unknown as { noteNpcPlayerImmune?: (id: number, ticks: number) => void })
    .noteNpcPlayerImmune?.(npcId, 0);
}

/** Projectile.KillOldestJavelin（Projectile.cs:15156-15181）等价形：同型同目标且
 * 处钉扎态的存活 javelin ≥ maxCount 时击杀 timeLeft 最老一枚（新弹自身受保护）。 */
export function killOldestJavelin(
  game: GameHooks, protectedProj: unknown, projType: number, targetNpcId: number, maxCount: number,
): void {
  const pq = game.projectiles as unknown;
  const list: unknown[] = typeof pq === 'function' ? ((pq as () => unknown[])()) : (Array.isArray(pq) ? pq : []);
  const scan: Array<{ ent: JavelinStickerProj; tLeft: number }> = [];
  for (const p of list) {
    if (!(p instanceof JavelinStickerProj)) continue;
    if (p === protectedProj || p.projType !== projType || p.ai0 !== 1 || p.targetId !== targetNpcId) continue;
    scan.push({ ent: p, tLeft: p.timeLeft });
    if (scan.length >= maxCount) break;
  }
  if (scan.length < maxCount) return;
  let oldest = 0;
  for (let j = 1; j < scan.length; j++) {
    if (scan[j].tLeft < scan[oldest].tLeft) oldest = j;
  }
  scan[oldest].ent.kill();
}

/** vanilla 截断盒相交（Rectangle((int)x,(int)y,w,h).Intersects 左闭右开）。 */
function boxHit(px: number, py: number, pw: number, ph: number,
  ex: number, ey: number, ew: number, eh: number): boolean {
  const qx = Math.trunc(px), qy = Math.trunc(py);
  const tx = Math.trunc(ex), ty = Math.trunc(ey);
  return qx < tx + ew && tx < qx + pw && qy < ty + eh && ty < qy + ph;
}

// ============================================================================
// 971 蜡烛尖刺试刺 / 975 血腥屠杀者尖刺（TentacleSpike_TrySpiking :44509-44526 /
// BloodButcherer_TryButchering :44528-44544）
//   SetDefaults：971 → :9199-9209 / 975 → :9289-9298：w=h=16 aiStyle=113 friendly
//   melee penetrate=-1；971 alpha=255 drawLayer=3；975 alpha=0 hide=true。
//   NewProjectile 尾参 (ai0=1f, ai1=npc.whoAmI) → 出生即 AI_113 钉扎态：
//     tileCollide=false / ignoreWater=true；Center = 目标 Center − velocity×2；
//     击杀窗 localAI0 ≥ 60×num11（num11=9×MaxUpdates，MaxUpdates=extraUpdates+1=1
//     → 540t）；目标失效/dontTakeDamage 即杀（AI_113 :41467-41485 分支序）；
//     localAI[1]==0 拍 rotation = velocity.ToRotation()+π/2 定格。
//   StatusNPC 出生面：971 → AddBuff(337,540)、975 → AddBuff(344,540)
//     （Projectile.cs:11349-11356——由产生侧消费 addStickerStack，本实体不重复施加）。
//   命中面：Damage_CanDealDamage 一览表（Projectile.cs:12463
//     `(…|614||971||975||1024)&&ai[0]==1f` 排除）→ 钉扎态【不可】再结算伤害。
//   每 30t 目标 HitEffect(0,1.0) 视觉节拍（:41463 flag2）：仓内无 NPC.HitEffect
//   通用打击出高子系统（gore 按 NPC 型分派在 Enemy 受击链内部），保留节拍锚、不发光效。
// ============================================================================
export class JavelinStickerProj extends Entity {
  w = 16; h = 16;
  /** XNA α 域（255 全透）：971 起始 255 淡出、975 恒 0 且 hide */
  alpha: number;
  readonly projType: number;
  readonly targetId: number;
  /** ai[0]（出生恒 1：钉扎态；KillOldestJavelin 扫描判据） */
  readonly ai0 = 1;
  timeLeft = 3600;
  private localAI0 = 0;
  private localAI1 = 0;
  private rotation = 0;

  constructor(projType: number, x: number, y: number, vx: number, vy: number,
    targetId: number) {
    super();
    this.projType = projType;
    this.alpha = projType === 971 ? 255 : 0;
    this.targetId = targetId;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = vx;
    this.vy = vy;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // AI_113 头部 alpha 淡出（:41294-41298）：每 tick −25 至 0（XNA α 域，971 才可见）
    this.alpha -= this.projType === 971 ? 25 : 0;      // 975 初值 0 且 hide，无需淡出
    if (this.alpha < 0) this.alpha = 0;

    let target: EnemyLike | null = null;
    for (const raw of game.enemies()) {
      const c = raw as EnemyLike;
      if (c && !c.dead && c.id === this.targetId) { target = c; break; }
    }
    this.localAI0++;
    if (!target || target.dontTakeDamage === true || this.localAI0 >= 540) {
      this.dead = true;                                // Kill()（钉扎窗耗尽/目标失效）
      return;
    }
    // :41480 Center = npc.Center − velocity×2（velocity 为出生速度保持不变）
    const tcx = target.cx ?? Math.fround(target.x + target.w / 2);
    const tcy = target.cy ?? Math.fround(target.y + target.h / 2);
    this.x = Math.fround(tcx - Math.fround(this.vx * 2)) - this.w / 2;
    this.y = Math.fround(tcy - Math.fround(this.vy * 2)) - this.h / 2;
    if (this.localAI1 === 0) {                          // :41566-41570 定格一次
      this.localAI1 = 1;
      this.rotation = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    }
    // —— 971 尘支（:41519-41537）：偶数帧自尾端（center − norm(v)×8）发尘 4，
    //     初速 = **目标 NPC.velocity** + (NextFloatDirection×0.35, 2.5)，fadeIn=0.25
    //     无重力。★F4（2026-08-31 蓝队三批）：旧式 `-norm(v)×8×0.35` 系把"弹体反向
    //     归一化"当成了初速——原式 `Vector2 value = npc.velocity +
    //     new Vector2(rand.NextFloatDirection() × 0.35f, 2.5f)`，法向项整删。
    if (this.projType === 971 && this.timeLeft % 2 === 0 && this.targetId > 0) {
      const len = Math.hypot(this.vx, this.vy);
      const nx = len > 0 ? this.vx / len : 0, ny = len > 0 ? this.vy / len : 0;
      const tvx = target?.vx ?? 0, tvy = target?.vy ?? 0;   // Main.npc[num12].velocity
      const dirJ = (Math.random() * 2 - 1) * 0.35;          // NextFloatDirection×0.35
      const d = game.spawnDust?.(Math.trunc(this.cx - nx * 8) - 5, Math.trunc(this.cy - ny * 8) - 5,
        10, 10, 4, Math.fround(tvx + dirJ), Math.fround(tvy + 2.5),
        200, { r: 120, g: 50, b: 120, a: 0 }, 0.65);
      if (d) { d.noGravity = true; d.fadeIn = 0.25; }
    }
    // —— 975 尘支（:41539-41571）：中心两笔尘 5（CloneDust 链旋转变体 + 1/3 第三笔）；
    //     spinningpoint = norm×(−7) 后 RotatedBy(±π/2·dir·0.05) 系随机微旋
    if (this.projType === 975 && this.timeLeft % 2 === 0) {
      const len = Math.hypot(this.vx, this.vy);
      const bx = len > 0 ? (this.vx / len) * -7 : -7, by = len > 0 ? (this.vy / len) * -7 : 0;
      const emit = (vx: number, vy: number): void => {
        const d = game.spawnDust?.(Math.trunc(this.cx) - 5, Math.trunc(this.cy) - 5,
          10, 10, 5, Math.fround(vx * 0.85), Math.fround(vy * 0.85 + 0.85), 0, null, 1.5);
        if (d) { d.scale = 1.1; }
      };
      const r1 = Math.PI * 2 * (Math.random() * 2 - 1) * 0.025;
      const c1 = Math.cos(r1), s1 = Math.sin(r1);
      emit(Math.fround(bx * c1 - by * s1), Math.fround(bx * s1 + by * c1));
      const r2 = Math.PI * 2 * (Math.random() * 2 - 1) * 0.025;
      const c2 = Math.cos(r2), s2 = Math.sin(r2);
      emit(Math.fround(bx * c2 - by * s2), Math.fround(bx * s2 + by * c2));
      if (Math.floor(Math.random() * 3) === 0) emit(bx * 0.9, by * 0.9);
    }
    this.timeLeft--;
  }

  kill(): void { this.dead = true; }                     // Projectile.Kill 等价位

  draw(r: { ctx: CanvasRenderingContext2D }): void {
    if (this.projType === 975) return;                   // hide=true 不画
    const img = projSprite(this.projType);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = Math.max(0, Math.min(1, (255 - this.alpha) / 255));
    ctx.drawImage(img, -this.w / 2, -this.h / 2, this.w, this.h);
    ctx.restore();
  }
}

// ============================================================================
// 977 村正斩月光波（ApplyNPCOnHitEffects `sItem.type == 155 & _spawnMuramasaCut`
// 支 Player.cs:44893-44906：出生点 = 敌盒 Inflate(30,16)、Y−8 内随机点 → 向量 =
// ((盒心−出生点).SafeNormalize((direction,gravDir)))×8 后 RotatedBy(0.7853981)；
// 伤 = dmgRandomized×0.5、kb=0f、ai[0]=num6 转角增量）
//   SetDefaults（Projectile.cs:15219-15236）：w=h=20 aiStyle=152 friendly
//   tileCollide=false ignoreWater=true melee penetrate=1 usesLocalNPCImmunity=true
//   localNPCHitCooldown=-1 armorPenetration=5 scale=1+Next(30)*0.01 extraUpdates=2
//   timeLeft=10*MaxUpdates（extraUpdates=2 → MaxUpdates=3 → 30）。
//   AI_152_SuperStarSlash（Projectile.cs:22432-22552，type==977 面）：α −10/t 钳 ≥100；
//   soundDelay==0 → SoundID.Item1 ×1；ai[0]!=0 → 每子步旋转 ai[0]/(10×MaxUpdates)；
//   velocity×=0.96；1/8 子步掷 → 尘 172 于中心。
//   extraUpdates 子步循环连 AI 同跑 3 次/帧（尘埃掷数、旋转、衰减、timeLeft
//   递减 :17307 与 Damage 结算 :17186 都在子步体内）。
//   ★F3 勘误存档：旧注"timeLeft 仅外层帧递减一次"系误读——Update 的 while
//   (numUpdates>=0) 体每子步全跑，寿命 = 30/3 = 10 实帧（已修）。
//   usesLocalNPCImmunity/-1 → 每目标至多一发；penetrate=1 → 单次受理后消亡。
// ============================================================================
export class MuramasaSlashProj extends Entity {
  w = 20; h = 20;
  damage: number;
  knockback: number;
  /** 外部注入：玩家侧穿甲池（Game 侧 equipStats.armorPen+meleeArmorPen）——
   *  结算份 = 注入值 + 型号 armorPenetration 5 */
  armorPenInject = 0;
  /** live 注入口（调用方接 () => 0.04+player.critChance('melee')/100） */
  critChanceFn: (() => number) | null = null;
  private penLeft = 1;
  private lifeLeft = 30;
  private aiAngle: number;
  private scale: number;
  private hitSet = new Set<number>();
  private soundPlayed = false;
  private alphaX = 255;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    knockback: number, aiAngle: number) {
    super();
    this.scale = Math.fround(1 + Math.floor(Math.random() * 30) * 0.01);
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.aiAngle = aiAngle;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (!this.soundPlayed) {
      this.soundPlayed = true;
      game.playSfx('throw', 1, this.cx, this.cy);       // SoundID.Item1（:22458-22462）
    }
    for (let step = 0; step < 3; step++) {              // extraUpdates=2 → 3 子步
      this.alphaX = Math.max(100, this.alphaX - 10);    // :22442-22447
      if (this.aiAngle !== 0) {                         // :22486-22492
        const ang = this.aiAngle / (10 * 3);            // num4=10、num5=num4×MaxUpdates=30
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const nx = this.vx * cos - this.vy * sin;
        const ny = this.vx * sin + this.vy * cos;
        this.vx = Math.fround(nx); this.vy = Math.fround(ny);
      }
      this.vx = Math.fround(this.vx * 0.96);            // :22501-22502
      this.vy = Math.fround(this.vy * 0.96);
      if (Math.floor(Math.random() * 8) === 0) {        // :22503-22509 尘 172
        game.spawnDust?.(Math.trunc(this.cx) - 5, Math.trunc(this.cy) - 5, 10, 10, 172,
          this.vx * 0.5, this.vy * 0.5, 100, null, 0.9);
      }
      this.x += this.vx; this.y += this.vy;
      // ★F3（2026-08-31 蓝队三批）：Projectile.Update 的 timeLeft-- 在 extraUpdates
      //   子步循环【内】（Projectile.cs:17307 属 while(numUpdates>=0) 体——extraUpdates=2
      //   ⇒ 每实帧递减 3 次）。SetDefaults `timeLeft = 10*MaxUpdates`（:9225）=30
      //   ⇒ 寿命 10 实帧。旧实现每帧减一次 = 三倍寿。
      if (--this.lifeLeft <= 0) { this.dead = true; return; }
    }

    const px = Math.trunc(this.x), py = Math.trunc(this.y);
    for (const raw of game.enemies()) {
      const e = raw as EnemyLike;
      if (!e || e.dead || this.hitSet.has(e.id)) continue;
      // ★dontTakeDamage 目标排除（:12600 同款——tryConsumingTimerCrit 在 hurt 前,
      //   被拒命中不得烧蓄能充能,终审补）
      if ((raw as unknown as { dontTakeDamage?: boolean }).dontTakeDamage === true) continue;
      if (!playerCanHitEnemy(raw as never, game)) continue;
      const gate = game as unknown as { meleeNpcImmuneGateOf?: (id: number) => boolean };
      if (gate.meleeNpcImmuneGateOf && !gate.meleeNpcImmuneGateOf(e.id)) continue;
      if (!boxHit(px, py, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      // ★F9/F1（2026-08-31 蓝队三批）：DamageVar 单源 + Damage_PVE :13388 攻端旗乘区
      let crit = (this.critChanceFn?.() ?? 0) > Math.random();
      // ★F11：TryConsumingTimerCrit 强制暴击（Damage_PVE :12928，977 结算接入）
      if (((game.player as unknown as { tryConsumingTimerCrit?: (g: unknown, x: number, y: number, w: number, h: number) => boolean } | null)?.tryConsumingTimerCrit?.(game, e.x, e.y, e.w, e.h) ?? false)) crit = true;
      let dmgVar = damageVarRoll(this.damage,
        ((game.player as unknown as { luck?: number } | null)?.luck) ?? 0);
      dmgVar = applyBannerDamageDealt(game, e, dmgVar);
      // ★F3 接线（蓝队四轮）：村正斩波 977 数据面 melee（SetDefaults :9196-9225 类旗
      // 投影）→ 焰爆石/拍击石双支（Projectile.cs:13439-13446）随 Damage() 生效；
      // 加伤在 banner 后并入、随暴击并入实伤参（原版序注同上）。
      const snapBonusMuramasa = projectileSnapStrikeBonus(game,
        { projId: 977 }, e.x + e.w / 2, e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: e.x + e.w / 2, cy: e.y + e.h / 2 },
          targeterBox: { x: px, y: py, w: this.w, h: this.h } });
      e.hurt(dmgVar * (crit ? 2 : 1)
        + (snapBonusMuramasa ? Math.trunc(snapBonusMuramasa * (crit ? 2 : 1)) : 0),
        Math.sign((e.cx ?? this.cx) - this.cx) || 1,     // kb 原文 0f → 位移 0；方向位保留
        0, game, this.armorPenInject + 5, crit, 0, true, 0, 977);   // ★A-F1：srcProjId 进排除表
      clearGlobalImmune(game, e.id);
      this.hitSet.add(e.id);
      if (--this.penLeft <= 0) { this.dead = true; return; }   // penetrate=1
    }
  }

  draw(r: { ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(977);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (255 - this.alphaX) / 155));
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.vy, this.vx) - Math.PI / 2);
    const dw = this.w * this.scale, dh = this.h * this.scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

// ============================================================================
// 289 彩纸泡（PvP/敌怪侧 meleeEnchant==7 派对浸剂伴发，Player.cs:44847-44849 /
// :44465-44468 与 Projectile.cs:13649-13651 弹幕面同式）
//   SetDefaults（Projectile.cs:3786-3795）：w=h=10 aiStyle=1 alpha=255 penetrate=-1
//   timeLeft=2。寿限内 α 保持 255（AI_001 不回退 α）→ 全程不可见；可观察效果 =
//   Kill 粒（Projectile.cs:76091-76102）：30 粒尘 139..142，velocity 继承弹速后
//   ±randNext(-50..50)×0.01 加项与 ×(1±0.5) 缩放各两段。damage=0/kb=0 的友方弹
//   在两拍内对敌怪的 Strike 面不可观察（瞬时消亡+原版同拍刚受理主命中），本移植
//   不跑命中循环（避免对刚被命中目标制造额外 stagger 帧）。
// ============================================================================
export class ConfettiBurstProj extends Entity {
  w = 10; h = 10;
  /** ★Z-F4（2026-08-31 蓝队三批）联机元数据：原 NewProjectile 内联
   *  NetMessage.SendData(27)（Projectile.cs 对应位）= 出生即时上线。此前实体无
   *  projId/color/netProjMeta 任一识别位 → netProjBroadcast 分派链 kind<0 直接跳过,
   *  联机侧整段不可见（广播只靠周期差分扫描+本弹寿命仅 2 拍，扫描窗根本轮不到）。
   *  projId=289 使其落入 kind1 武器族通判（aux 带浸剂）；接收端按 kind1 用 Boomerang
   *  代表类重建——纯视觉重建妥协：远端傀儡不复算本地 Kill 尘尾段（发送端照常出尘，
   *  远端以消亡闪烁兜底），既定登记见 Game.netMakeProj case1 注与 spawnFriendlyProj。
   */
  readonly projId = 289;
  private lifeLeft = 2;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.x += this.vx;
    this.y += this.vy;
    if (--this.lifeLeft <= 0) {
      for (let i = 0; i < 30; i++) {                    // :76092-76102
        const t = 139 + Math.floor(Math.random() * 4);
        const d = game.spawnDust?.(Math.trunc(this.x) - 5, Math.trunc(this.y) - 5, 10, 10, t,
          this.vx, this.vy, 0, null, 1.2);
        if (!d) break;
        // ★F16（2026-08-31 蓝队三批）逐笔补齐原版六段扰动（:76094-76102）：
        //   vX/vY 各 += Next(-50,51)×0.01 → 各 ×(1+Next(-50,51)×0.01)
        //   → 各 += Next(-50,51)×0.05（旧实现缺此 4 笔中的"×0.05 加项"两笔）
        //   + scale 微抖 ×(1+Next(-30,31)×0.01)（旧全缺）
        //   ★O1 核销(2026-09-02)：scale 行=1456:71613 / 1457:76104 Next(-30,31)（61 值域
        //   整型）——floor(rand*61)-30 逐位精确,合法勿动
        d.vx += (Math.floor(Math.random() * 101) - 50) * 0.01;
        d.vy += (Math.floor(Math.random() * 101) - 50) * 0.01;
        d.vx *= 1 + (Math.floor(Math.random() * 101) - 50) * 0.01;
        d.vy *= 1 + (Math.floor(Math.random() * 101) - 50) * 0.01;
        d.vx += (Math.floor(Math.random() * 101) - 50) * 0.05;
        d.vy += (Math.floor(Math.random() * 101) - 50) * 0.05;
        d.scale *= 1 + (Math.floor(Math.random() * 61) - 30) * 0.01;
      }
      this.dead = true;
    }
  }

  draw(): void { /* alpha=255 两拍不可见 */ }
}

// ============================================================================
// 524 血舌球（Bladetongue 3211 on-hit 伴发，Player.cs:44826-44836 敌怪面 /
// :44446-44454 PvP 面同式向量链）
//   SetDefaults（Projectile.cs:5941-5954）：w=h=10 aiStyle=96 friendly alpha=255
//   penetrate=5 ignoreWater=true melee extraUpdates=5 usesIDStaticNPCImmunity=true
//   idStaticNPCHitCooldown=10。
//   AI_096（Projectile.cs:33612-33640）：ai[0]+=0.6 → >500 即 Kill；重力 +0.008/t；
//   双笔尘 170（每笔独立 1/3 拒绝门），尘位=(尘位+Center)/2 收拢、noGravity、
//   velocity×0.1、scale×[(800−ai0)/800+0.1]，第二笔再加 velocity/2 偏移。
//   α 无淡出面 → 全寿限不可见（视觉仅拖尾尘）；不画 sprite。
//   ★F2 勘误存档：旧实现把 AI_096 单步跑（=extraUpdates 被吞）——Update 子步
//   循环体内 AI+积分+Damage 全跑（Projectile.cs:16780-17330），已按 6 子步重构。
//   usesIDStaticNPCImmunity 冷却 10t 为【全型共享】表（IDStatic 语义：模块级 Map）。
// ============================================================================
const GLOB_IDSTATIC_COOLDOWN_TICKS = 10;
const GLOB_IDSTATIC_HITS: Map<number, number> = new Map();   // npcId → 冷却到期 tick

export class BladetongueGlobProj extends Entity {
  w = 10; h = 10;
  damage: number;
  knockback: number;
  armorPenInject = 0;
  /** live 注入口（调用方接 () => 0.04+player.critChance('melee')/100——melee 类别源） */
  critChanceFn: (() => number) | null = null;
  private penLeft = 5;
  private ai0 = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    knockback: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const now = (game as unknown as { tickCount?: number }).tickCount ?? 0;
    // ★F2（2026-08-31 蓝队三批）extraUpdates=5 子步循环：Projectile.Update 的
    //   while(numUpdates>=0) 体每实帧跑 extraUpdates+1=6 次——AI_096（ai0 累计/
    //   双笔尘 170×6 组/重力）、位移积分与 Damage 结算全部随子步推进。
    //   寿命随之归位：ai0 += 0.6/子步 → >500 Kill 在 ~139 实帧（旧单步 ≈833 帧）；
    //   尘密度 ×6 与原版 DensityIndex 同拍。
    for (let step = 0; step < 6; step++) {
      if (this.dead) break;
      // AI_096 主干
      this.ai0 += 0.6;                                    // :33613
      if (this.ai0 > 500) { this.dead = true; return; }   // :33614-33617
      this.vy += 0.008;                                   // :33638 重力
      for (let n = 0; n < 2; n++) {                       // :33619-33637 双笔尘 170
        if (Math.floor(Math.random() * 3) !== 0) continue;
        const d = game.spawnDust?.(Math.trunc(this.x) - 5, Math.trunc(this.y) - 5, 10, 10,
          170, 0, 0, 100, null, 1);
        if (!d) break;
        d.x = Math.fround((d.x + this.cx) / 2);
        d.y = Math.fround((d.y + this.cy) / 2);
        d.noGravity = true;
        d.vx *= 0.1; d.vy *= 0.1;
        d.scale *= Math.fround((800 - this.ai0) / 800) + 0.1;
        if (n === 1) {
          d.x += Math.fround(this.vx / 2);
          d.y += Math.fround(this.vy / 2);
        }
      }
      this.x += this.vx; this.y += this.vy;

      // ---- 命中面（Damage_PVE_Inner 闸门 + IDStatic 共享冷却 10t + penetrate=5，
      //      原版 Damage() 本就在子步体内 Projectile.cs:17186 → 每子步结算）----
      const px = Math.trunc(this.x), py = Math.trunc(this.y);
      for (const raw of game.enemies()) {
        const e = raw as EnemyLike;
        if (!e || e.dead) continue;
        // ★dontTakeDamage 目标排除（:12600 同款,终审补——同上环）
        if ((raw as unknown as { dontTakeDamage?: boolean }).dontTakeDamage === true) continue;
        if (!playerCanHitEnemy(raw as never, game)) continue;
        const exp = GLOB_IDSTATIC_HITS.get(e.id);
        if (exp !== undefined && now < exp) continue;
        if (!boxHit(px, py, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
        // ★F9/F1：DamageVar 单源 + Damage_PVE :13388 攻端旗乘区；命中回写 ai[0]+=50
        // （type==524 特例 :13261-63）
        let crit = (this.critChanceFn?.() ?? 0) > Math.random();
        // ★F11：TryConsumingTimerCrit 强制暴击（Damage_PVE :12928，524 结算接入）
        if (((game.player as unknown as { tryConsumingTimerCrit?: (g: unknown, x: number, y: number, w: number, h: number) => boolean } | null)?.tryConsumingTimerCrit?.(game, e.x, e.y, e.w, e.h) ?? false)) crit = true;
        let dmgVar = damageVarRoll(this.damage,
          ((game.player as unknown as { luck?: number } | null)?.luck) ?? 0);
        dmgVar = applyBannerDamageDealt(game, e, dmgVar);
        // ★F3 接线（蓝队四轮）：血舌球 524 数据面 melee（SetDefaults :5941-54 类旗投影）
        // → 焰爆石/拍击石双支（Projectile.cs:13439-13446）随 Damage() 子步结算生效；
        // 加伤在 banner 后并入（原版序 :14457 晚于 :13387），随暴击并入实伤参。
        const snapBonusGlob = projectileSnapStrikeBonus(game,
          { projId: 524 }, e.x + e.w / 2, e.y + e.h / 2, e.id,
          { victimBox: { w: e.w, h: e.h, cx: e.x + e.w / 2, cy: e.y + e.h / 2 },
            targeterBox: { x: px, y: py, w: this.w, h: this.h } });
        e.hurt(dmgVar * (crit ? 2 : 1)
          + (snapBonusGlob ? Math.trunc(snapBonusGlob * (crit ? 2 : 1)) : 0),
          Math.sign((e.cx ?? this.cx) - this.cx) || 1, 0,
          game, this.armorPenInject, crit, 0, true);
        this.ai0 += 50;                                    // :13261 netUpdate=true; ai[0]+=50f
        GLOB_IDSTATIC_HITS.set(e.id, now + GLOB_IDSTATIC_COOLDOWN_TICKS);
        clearGlobalImmune(game, e.id);
        if (--this.penLeft <= 0) { this.dead = true; return; }   // penetrate=5 计数耗尽
      }
    }
  }

  draw(): void { /* AI_096 无 α 回退 → 全程不可见（视觉=拖尾尘 170）*/ }
}
