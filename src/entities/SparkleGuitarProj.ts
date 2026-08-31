// 星璇之音 Stellar Tune 演奏弹（弹 856 / 物品 4715）+ 无视线减伤乘区（2026-08-31 批④；
// 二轮蓝队批⑦修正 F1 触敌自杀+Kill 爆裂真结算、F2 减伤视线系别归位步行族）。
// 标杆 Terarria1457/Terraria/Projectile.cs + Player.cs/Item.cs（行号均指该树）：
//   SetDefaults 弹 856（:8208-8220）：32×32、aiStyle 167、friendly、alpha=255、magic、
//     tileCollide=false、ignoreWater、extraUpdates=2、usesLocalNPCImmunity=true +
//     localNPCHitCooldown=-1（每敌一跳终生一次）。
//   AI_167_SparkleGuitar（:47427-47445）：寿命 num=90t——localAI[0] 计满 88 Kill
//     （`>= num-1f` 判定先于本轮位移,num2=t/90 曲线参数）;每拍 Center = CatmullRom 四控制点：
//       P0 = player.Center − v×2        （value :47433）
//       P1 = player.Center              （center）
//       P2 = (ai[0], ai[1])             出手时钦定的目标锚点（vector33,X/Y 存 ai）
//       P3 = (ai[0],ai[1]) − v ×(1−t×3) （value2 :47436）
//     t = localAI[0]/90;type==856 时 rotation = 2π×t + HotPink 光照（视觉位,本仓仅 rot）。
//     ⚠ velocity 全程不动（AI 无速度写回）——脚本化路径,-v 仅作形状控制。
//   减伤 ModifyStellarTuneDamage（:15267-15273）：type==856 且 owner 有效且
//     !Collision.CanHit(this→Main.player[owner]) ⇒ damage = (int)(damage×0.75)
//     （C# int 截断）。消费点 = Damage_PVE :13333-13339 与 Damage_PVP :14719-14723,
//     即【每次命中结算时】按当时无视线状态折算,非出生期定死。
//   Kill 爆裂（Kill 弹 856 段 :72803-72841，★F1 修正 2026-08-31 二轮蓝队——旧头注
//     「Resize 只改写死亡当帧盒、无再结算语义」系误判，已废）：尘 58×6 + 278 双环 +
//     gore16/ParticleOrchestraType.StellarTune 为视觉面之外，段尾有【真结算】：
//       position = Center; width = height = 128; Center = position;
//       maxPenetrate = penetrate = -1; Damage();        （:72831-72840）
//     ⇒ 以弹心居中的 128×128 盒对邻接未免疫敌各跑一轮完整 Damage_PVE_Inner 链
//     （DamageVar/crit/kb/hitDirection(:13652)/StrikeNPC；ModifyStellarTuneDamage
//     :13335 同在链内逐命中即时判——本轮判时弹盒已是 128 形）。penetrate 置 -1 的
//     意义 = 绕开单敌截断：爆裂轮 keepIterating 不再折断（对比 :14194 penetrate--
//     分支只在 >0 时触发），盒内全体可结算。免疫排除 = usesLocalNPCImmunity flag2
//     （:12598 array[i]==0 才受理）：localNPCHitCooldown=-1 在首轮命中即写 array=-1
//     （:14158-14163），故被触杀的那个敌天然不会被爆裂双扣。两条 Kill 路（AI_167 寿尽
//     :47429 自身 Kill / Update :17312 penetrate==0）都进本段——触杀当拍即爆。
//   ⚠ ★γ 案已收口（终局扫尾批 A6，2026-08-31）：原版 numUpdates 循环（Update
//     :16781-16782）把 AI() 与位移、Damage() 一并包进 ⇒ extraUpdates=2 时每 tick
//     跑 3 子步、localAI[0] 每 tick +3、寿尽 ≈88/3→30 tick。fixedUpdate 现按子步
//     循环重写：t++ → 寿门 → CatmullRom 以 t01=localAI[0]/90 **逐子步取样**（曲线
//     对拍同源,非只改计时）→ 本子步 Damage() 盒判。爆裂结算/contact 致死语义不变。
//     tests/spectre-stellar-procs 寿尽案已随此翻新（diedAt=30）。
//   联机通道（2026-08-31 二轮蓝队批）：msg27 kind=9 真类重建（Game.netProjBroadcast
//     分派序前置支/netMakeProj case9；旧端把 856 落进 kind1 武器族支曾被 melee 化——
//     收端视线门/melee crit 掷/浸剂 melee 位三重错位+缺结算侧 ×0.75,见 Game.netPuppetProjContact）。
//   出手侧（Player.cs:48448-48477）：见 computeStellarTuneShot 导出（GA 缝合点清单在批报告）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { canHit } from '../physics/LineOfSight';
import { playerCanHitEnemy } from './projTargets';

/** XNA Vector2.CatmullRom（同 MinionProj 内私有实现;此处独立避免跨类内联依赖） */
export function catmullRom(
  v1: { x: number; y: number }, v2: { x: number; y: number },
  v3: { x: number; y: number }, v4: { x: number; y: number }, t: number,
): { x: number; y: number } {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (2 * v2.x + (-v1.x + v3.x) * t + (2 * v1.x - 5 * v2.x + 4 * v3.x - v4.x) * t2
      + (-v1.x + 3 * v2.x - 3 * v3.x + v4.x) * t3),
    y: 0.5 * (2 * v2.y + (-v1.y + v3.y) * t + (2 * v1.y - 5 * v2.y + 4 * v3.y - v4.y) * t2
      + (-v1.y + 3 * v2.y - 3 * v3.y + v4.y) * t3),
  };
}

/** ModifyStellarTuneDamage 1:1（Projectile.cs:15268-15273）：losBlocked 传「当前弹心到
 *  主玩家 Center 的 Collision.CanHit 已断」布尔（两调用点均为即时结算）。
 *  C# `(int)((double)dmg * 0.75)` = 截断向零。 */
export function modifyStellarTuneDamage(damage: number, losBlocked: boolean): number {
  if (!losBlocked) return damage;
  return Math.trunc(damage * 0.75);
}

/** Damage_PVE_Inner 命中方向 num40（:13652 `int num40 = direction`）：856 无类型特化支
 *  （switch/aiStyle 特化表皆不含 167），而 aiStyle167 走 AutomaticallyChangesDirection
 *  （:17387 豁免表无 167 ⇒ true）——每子步按 velocity.X 符号写回 direction；AI_167 从不
 *  写速度 ⇒ 全程锚定出手水平符号（vx<0 → -1，否则 +1，Entity.cs:20 默认值兜底）。 */
function stellarHitDir(vx: number): number {
  return vx < 0 ? -1 : 1;
}

/** 命中结算共用形参包（直击与 Kill 爆裂同链，区别只在弹盒尺寸与免疫排除面）。 */
function stellarStrike(
  e: { hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean,
    pierce?: number, fromPlayer?: boolean) => boolean },
  damage: number, kx: number, game: GameHooks, armorPen: number, critChance: number,
): void {
  e.hurt(Math.max(1, damage), kx, 0, game, armorPen,
    Math.random() < critChance, 0, true);          // StrikeNPC 单点（Enemy.hurt 同构）
}

/** 出手暴击率单源（★二轮蓝队 FR2-F：词缀位曾漏——Game case4715 只吃 stTune.crit）。
 *  原版链 = Item.Prefix（Item.cs:585 `crit += crt`）先把词缀位折进物品 crit 字段 →
 *  Player.Update 每帧 `magicCrit += inventory[selectedItem].crit`（Player.cs:25712-714，
 *  三系同行加算）→ GetWeaponCrit(:54009-54024) 直返累计表。基础 4 = 字段初值
 *  （:2415 magicCrit = 4）。本仓 base(itemCombat)/prefix(prefixStat.crt) 分账存放，
 *  此处求和还原原字段终值口径（同族近战链形制参照 Game.ts arcCritZ `+ (ps?.crt ?? 0)`）。 */
export function stellarTuneCritChance(
  equipChainCritPct: number, itemBaseCrit: number | undefined, prefixCrt: number | undefined,
): number {
  return Math.min(1, (4 + equipChainCritPct + (itemBaseCrit ?? 0) + (prefixCrt ?? 0)) / 100);
}

export interface StellarShotInput {
  playerCx: number; playerCy: number;
  /** Main.MouseWorld（原始鼠标世界点——原版此处不做 reach 钳,:48449 直取） */
  mouseWorldX: number; mouseWorldY: number;
  /** GetSparkleGuitarTarget 结果集（:47030-47051：1000×800 居中矩形 ∩ CanBeChasedBy）；
   *  空表 ⇒ 落未锁定支。注入端由 GA 缝合（实体循环） */
  targets: Array<{ cx: number; cy: number; vx?: number; vy?: number }> | null;
  targetRoll: () => number;                       // Main.rand.Next(validTargets.Count)（:48454）
  /** NextVector2Circular(24f,24f) 圆盘均匀样本（:48460 抖动——保持原版圆盘分布语义） */
  nextJitter: () => { x: number; y: number };
  /** NextVector2CircularEdge(1f,1f) 单位向量（:48465 方向形参） */
  nextEdgeUnit: () => { x: number; y: number };
  /** Main.rand.NextFloat() [0,1)（:48475 上扬保底用） */
  nextFloat01: () => number;
}
export interface StellarShotOutput {
  spawnX: number; spawnY: number;                 // pointPosition = RotatedRelativePoint(mountedCenter)
  vx: number; vy: number;                         // vector35（AI_167 曲线方向形参,量值=dist×2）
  aimX: number; aimY: number;                     // vector33 → NewProjectile ai[0]/ai[1]（:48477）
}

/**
 * Player.cs:48448-48477 出手向量 1:1。随机量全部注入以便确定性测试与联机一致化。
 * GetSparkleGuitarTarget 矩形门见 sparkleGuitarTargetRect——候选收集在调用端。
 */
export function computeStellarTuneShot(inp: StellarShotInput): StellarShotOutput {
  // 锚点：目标有效 → nPC.Center + nPC.velocity×20f（:48453-48455）;否则鼠标点±24 抖动
  let aimX = inp.mouseWorldX, aimY = inp.mouseWorldY;
  let locked = false;
  if (inp.targets && inp.targets.length > 0) {
    const t = inp.targets[Math.floor(inp.targetRoll() * inp.targets.length)];
    if (t) {
      aimX = t.cx + (t.vx ?? 0) * 20;
      aimY = t.cy + (t.vy ?? 0) * 20;
      locked = true;
    }
  }
  // vector34 = 未抖动前距离向量（:48456）——700 钳比较用它,勿搬进抖动后
  let dxa = aimX - inp.playerCx, dya = aimY - inp.playerCy;
  if (!locked) {
    const j = inp.nextJitter();
    aimX += j.x; aimY += j.y;
    const dl = Math.hypot(dxa, dya);
    if (dl > 700) {
      dxa *= 700 / dl; dya *= 700 / dl;
      aimX = inp.playerCx + dxa; aimY = inp.playerCy + dya;   //（:48461-48463）
    }
  }
  // 方向形参：单位向量,Y>0 取反压上半平面,|Y|<0.5 再给上扬保底（:48465-48477）
  const e0 = inp.nextEdgeUnit();
  let ux = e0.x, uy = e0.y;
  if (uy > 0) uy = -uy;
  if (Math.abs(uy) < 0.5) uy = -inp.nextFloat01() * 0.5 - 0.5;
  const norm = Math.hypot(ux, uy) || 1;
  ux /= norm; uy /= norm;
  const dist = Math.hypot(dxa, dya);              // vector34.Length()（钳后终值,:48476）
  return { spawnX: inp.playerCx, spawnY: inp.playerCy,
    vx: ux * dist * 2, vy: uy * dist * 2, aimX, aimY };
}

/** GetSparkleGuitarTarget（Player.cs:47030-47051）判定用矩形：CenteredRectangle(Center,1000×800) */
export function sparkleGuitarTargetRect(pcx: number, pcy: number): {
  left: number; right: number; top: number; bottom: number;
} {
  return { left: pcx - 500, right: pcx + 500, top: pcy - 400, bottom: pcy + 400 };
}

/**
 * 弹 856 实体：SetDefaults(:8208)/AI_167(:47427)/命中管线(Damage_PVE ×localNPCImmunity
 * -1 + ModifyStellarTuneDamage :13333)全按原文。spawn/aim 由 computeStellarTuneShot
 * 产出后 GA 接线（Game.ts 10338 登记的"攻击面未实装"清偿由此闭合）。
 */
export class SparkleGuitarProj extends Entity {
  readonly projId = 856;
  w = 32; h = 32;
  friendly = true;
  magic = true;
  tileCollide = false;
  ignoreWater = true;
  critChance = 0;
  armorPen = 0;
  knockback = 0;
  /** ai[0]/ai[1] = 出手时 vector33（目标锚点世界坐标） */
  private aimX: number; private aimY: number;
  /** localAI[0]（float 语义,整数推进） */
  private t = 0;
  private life = 90;                               // AI num=90（:47428）
  private hitOnce = new Set<number>();             // localNPCHitCooldown=-1 ⇒ 终生每敌一次
  /** 上一帧锚定的玩家引用快照（原版直读 Main.player[owner].Center——每拍现查） */
  constructor(x: number, y: number, vx: number, vy: number, public damage: number,
    aimX: number, aimY: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;                    // 原版 velocity 保持出手值,AI 不写回
    this.aimX = aimX; this.aimY = aimY;
  }

  /** AI_167 脚本位置推导（测试友好:playerCenter 可注入覆盖默认 game.player 中心） */
  private splineAt(t01: number, pcx: number, pcy: number): { x: number; y: number } {
    const nvx = -this.vx, nvy = -this.vy;          // vector2 = -velocity（:47434）
    const p0 = { x: pcx + nvx * 2, y: pcy + nvy * 2 };
    const p1 = { x: pcx, y: pcy };
    const p2 = { x: this.aimX, y: this.aimY };
    const p3 = { x: this.aimX + nvx * (1 - t01 * 3), y: this.aimY + nvy * (1 - t01 * 3) };
    return catmullRom(p0, p1, p2, p3, t01);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // 联机傀儡（v8 msg27 kind=9，远端弹幕快照驱动）：对敌判定归拥有者客户端；
    // 对玩家（PvP bit6）由收端本地结算 Damage_PVP 族（Game.netPuppetProjContact——
    // 含 ModifyStellarTuneDamage ×0.75 折算与 crit 掷点缺席判定,见彼处注释）。
    // AI_167 spline 锚「发射者 Center」是发送端权威路径,收端不重放（netPuppetStep 插值跟随）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player as { cx: number; cy: number; x: number; y: number; w: number; h: number };
    // ---- ★γ 移交硬伤收口（终局扫尾批 A6）：numUpdates 循环 1:1 —— 原版
    //      Projectile.Update(:16781-16782) `numUpdates = extraUpdates; while(numUpdates>=0)`
    //      把 AI()【与位移、Damage()】一并包进子步循环，extraUpdates=2 ⇒ 每拍 3 子步。
    //      此前本仓每 fixedUpdate 只 t+1（寿命 ×3=89t 案），命中面虽已跑 3 遍但曲线
    //      推进没跟上 ⇒ 触杀窗/爆裂位置系统性滞后。现 AI 与位移同步 EU 化：每个子步
    //      ++localAI[0]（t++）→ 寿门(>= num-1=89)→ CatmullRom 曲线以 t01=localAI[0]/90
    //      **逐步取样**（num2=localAI[0]/num 精确复刻,float 语义务必保留）→ 再跑本子步
    //      的 Damage() 盒判。寿尽 = 首个 ++t≥89 的子步（tick 30 内第 88/89 步,
    //      ceil((num-1)/3)=30 tick）。
    for (let u = 0; u <= 2 && !this.dead; u++) {     // numUpdates=extraUpdates 循环体 ×3
      this.t++;                                      // AI_167 ++localAI[0]（:47429）
      if (this.t >= 89) {                            //（:47429-47432 `>= num-1` → Kill()）
        this.killStellarTune(game);                  // 寿尽同样走 Kill 弹 856 段（爆裂真结算）
        return;
      }
      const t01 = this.t / 90;                       // num2（float 除法语义）——每子步重取样
      const pos = this.splineAt(t01, p.cx, p.cy);
      this.x = pos.x - this.w / 2;
      this.y = pos.y - this.h / 2;

      // ---- 命中（Damage():17184 每 update 跑 extraUpdates+1=3 次；PVE 梯 :12572/:12615。
      //      penetrate 默认 1（:366）且 SetDefaults 不重设 ⇒ 首个有效敌 :14194 penetrate--
      //      →0 → Update :17312 同拍 Kill()——弹 856 是单发：触敌即亡+死亡爆裂。
      //      usesLocalNPCImmunity/-1 只承担免疫标记语义（首轮命中写 array=-1），非"多敌多跳"）----
      for (const ent of game.enemies()) {
        const e = ent as never as {
          id: number; x: number; y: number; w: number; h: number; dead: boolean;
          hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean,
            pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean;
        };
        if (!e || e.dead) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        if (!playerCanHitEnemy(ent, game, this.projId)) continue;
        if (this.hitOnce.has(e.id)) continue;
        this.hitOnce.add(e.id);                    // array[victimIndex] = -1（:14158-14163）
        // ★ModifyStellarTuneDamage（:13333-13339 命中结算点）：每轮即时判 LOS——
        //   Entity 重载 CanHit(this, Main.player[owner]) = 步行族整盒对整盒（Collision.cs
        //   :373 → Vector2 重载 :383 → Point 纯整型链 :388；F2 归位,canHitLine 系系别错挂已废）
        const blocked = !canHit(game.world.store, this.x, this.y, this.w, this.h,
          p.x, p.y, p.w, p.h);
        stellarStrike(e, modifyStellarTuneDamage(this.damage, blocked),
          stellarHitDir(this.vx) * this.knockback, game, this.armorPen, this.critChance);
        this.killStellarTune(game);                // penetrate==0 → 同拍 Kill（含爆裂结算）
        break;                                     // keepIterating=false 单敌截断（:12603/:14203）
      }
    }
  }

  /** Projectile.Kill() 弹 856 段 1:1（:72803-72841）：视觉尘后真结算——Resize 128×128 居中
   *  + maxPenetrate=penetrate=-1 + Damage()。爆裂轮与普通命中同链（stellarStrike/减伤折算
   *  一致）；唯一差别：免疫排除面（hitOnce 成员=本轮前已被本弹标免疫者——恰为触杀的敌）
   *  与 penetrate=-1 ⇒ 全体盒内未免疫敌各吃一轮、不再单发截断。active 守卫/幂等 =
   *  :71761-71764 同构。 */
  private killStellarTune(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    for (let i = 0; i < 6; i++) {                  // dust58 ×6 于本体盒（:72807-72809）
      game.spawnDust?.(this.x, this.y, this.w, this.h, 58, 0, 0, 150, null, 0.8);
    }
    // gore16/StellarTune 编排不建模（渲染层接点=Game.onProjectileDeath 镜段,头注）
    const bw = 128, bh = 128;
    this.x = this.cx - bw / 2;                     // position = Center → 盒左上随 128 展开
    this.y = this.cy - bh / 2;
    this.w = bw; this.h = bh;
    const p = game.player as { x: number; y: number; w: number; h: number };
    // ModifyStellarTuneDamage 本轮逐命中评估(:13335),但本轮内弹盒恒 128、玩家盒不变
    // ⇒ 判值全体一致,评一次即等价（避免 per-victim 重复世界查询）
    const blocked = !canHit(game.world.store, this.x, this.y, this.w, this.h,
      p.x, p.y, p.w, p.h);
    for (const ent of game.enemies()) {
      const e = ent as never as {
        id: number; x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean,
          pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean;
      };
      if (!e || e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x
        && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;
      if (this.hitOnce.has(e.id)) continue;        // flag2（:12598 usesLocalNPCImmunity array[i]==0）
      this.hitOnce.add(e.id);
      stellarStrike(e, modifyStellarTuneDamage(this.damage, blocked),
        stellarHitDir(this.vx) * this.knockback, game, this.armorPen, this.critChance);
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    void _cam;
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate((Math.PI * 2) * (this.t / 90));     // rotation = 2π×num2（:47440）
    ctx.fillStyle = '#FF78C0';                     // HotPink 光照族配色兜底（贴图就绪时被遮盖）
    ctx.beginPath();
    ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
