// 叶绿水晶叶套装 SetBonus 弹族（台账 L3 清偿批,2026-08-31）。
//
// 原版真值 = Terarria1458（1457 同值两版行号并注）：
//   · 三件套检测/授予：ArmorSetBonuses.cs:128-146 四头变体
//     （近战头 1001 / 召唤头 5524 / 头盔 1002·头饰 1003 基础档，共享胸 1004×腿 1005）
//     → AddBuff(60,5)+setChlorophyte（Player.UpdateArmorSets :16417→Effect 每 tick；
//       UpdateArmorSets_Always_Chlorophyte :16436 !setChlorophyte → ClearBuff(60)）。
//   · buff 60 效果循环（Player.cs:11749-11766,1456 :10483-10500）：crystalLeaf=true +
//     每拍把 buffTime 钉回 18000 + 全桶扫描 type==226【只留最先扫到的一只】多余 Kill()
//     （flag29 首 Found 置 false——保留旧弹按 index 升序）+ 无存活锚才 NewProjectile(226)。
//   · 锚体 226 aiStyle 42（Projectile.cs :28188-28256,1456 :25949-26018）：钉玩家头顶
//     −60px / 重力翻转 +120π、scale 以 mouseTextColor 脉动（视觉面,本仓移 draw）、
//     owner 局部玩家 && crystalLeafCooldown==0 才索敌——曼哈顿 |dx|+|dy|<700 &&
//     Collision.CanHit 取最近 NPC（CanBeChasedBy 门）→ 发射 227 并 cd=40。
//     出手方向怪癖照抄：x2/y2=发射前左上自捕获,vector30=中心 → 基向=(−w/2,−h/2)
//     归一 ×12；仅当 GetChaseResults 追及(InterceptionTime≤180)才覆写为追击向量/180。
//     （GetChaseResults chaserSpeed=12×180=2160,数学上除非目标恰重合/远离越追不上,
//      否则必覆写——基向实为死路兜底。）
//   · 叶弹 227 aiStyle 43（:28260-28303 SetDefaults :8209-8218,1456 :2825/:6960 区）：
//     14×14/friendly/penetrate 1/tileCollide=false/timeLeft 180/**extraUpdates=180**/
//     hide=true——hide 型本体不绘制,飞行轨迹全是 ChlorophyteLeafCrystalShot 编排粒子;
//     extraUpdates 使 Projectile.Update 的 while(numUpdates>=0) 主循环(:16781-17346,
//     运行 MaxUpdates=181 子步/拍)连同 timeLeft--(:17308 在子步内!)整体展开 =
//     【一拍内全路径扫掠的瞬时追踪弹】：181 子步 × velocity(≈12px)≈2160px 跨度,
//     逐子步 Damage() 命中检、寿命 timeLeft=180 恰在子步耗尽后自然 Kill。
//   · on-hit 引援叶：Player.OnHit 尾段（:6986-7040,1456 :6615-6640——§L3 之"三修门"
//     本体）：!crystalLeaf||petalTimer!=0 早退;victim CanBeChasedBy 门;扫 226 桶
//     距离>1200 即 break 的【序依赖怪癖】,命中点取 OnHit(x,y);petalTimer=50 共享
//     于金花 Petals（onHitPetal :6963 未建模,登记）。方向怪癖同上但基向括号用
//     玩家 w/h（原文 width/height 无前缀直写）。
//   · 伤值：Player.crystalLeafDamage=100/crystalLeafKB=10 static 字段（:821/:823——
//     弹不吃面板乘区,NewProjectile 直传字面）。
// 伤害结算走 proj1457.dealContacts（DamageVar/banner/crit/SnapStrike 单源）;pierce 语义
// = maxPenetrate 1 flag3（Enemy.hurt pierce=1 免疫豁免+不设帧）；227 已在
// projTargets.ON_HIT_EXCLUDED_PROJS（TryDoingOnHitEffects :15210-15220）= 自续断链。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { BuffType } from '../stats/Buffs';
import { canHit } from '../physics/LineOfSight';
import { canBeChasedBy } from './projTargets';
import { HitCdImpl, dealContacts } from './proj1457';
import { leafTrailHue01, leafCrystalShotFx } from '../fx/orchestraFx';
import { projSprite } from './Arrow';

/** Player.crystalLeafDamage static 初值（Player.cs:821） */
export const CHLORO_LEAF_DAMAGE = 100;
/** Player.crystalLeafKB static 初值（Player.cs:823） */
export const CHLORO_LEAF_KB = 10;

/** 锚体每拍出手后的冷却窗（aiStyle42 :28254 crystalLeafCooldown=40——递减位在
 *  Player.fixedUpdate ：25665-67 与 petalTimer/shadowDodgeTimer 同段） */
export const CHLORO_ANCHOR_COOLDOWN_TICKS = 40;
/** on-hit 引援窗（Player.OnHit :7009 petalTimer=50t,与花瓣共享计时字段） */
export const CHLORO_PETAL_TIMER_TICKS = 50;
/** Projectile.MaxUpdates（extraUpdates+1 :556-560）——227 的子步展开数 */
const LEAF_SUBSTEPS = 181;

interface PlayerLite {
  dead: boolean;
  cx: number;
  cy: number;
  gravDir?: number;
  crystalLeafCooldown: number;
  buffs: { has(t: BuffType): boolean };
}

interface NpcLite {
  x: number; y: number; w: number; h: number;
  vx?: number; vy?: number;
}

/** Utils.SolveQuadratic（Utils.cs:721-740）1:1：a≥0 时判别式三支 */
function solveQuadratic(a: number, b: number, c: number): [number, number] | null {
  const num = b * b - 4 * a * c;
  if (num > 0) return [(-b + Math.sqrt(num)) / (2 * a), (-b - Math.sqrt(num)) / (2 * a)];
  if (num < 0) return null;
  return [-b / (2 * a), -b / (2 * a)];
}

export interface ChaseResults {
  happens: boolean;
  /** 原版单位=「chaserSpeed 为速度量纲的时间」；消费侧配对除以摊销帧数使用 */
  time: number;
  vx: number;
  vy: number;
}

/** Utils.GetChaseResults（Utils.cs:651-692）1:1——匀速追及拦截解算。
 *  输入速度量纲：runnerVelocity 为 px/tick,chaserSpeed 为 px/unitTime——原版即如此
 *  （调用方传 num*180 再除回 180,等价把插值时间拉长 180 倍细分子步），照抄不自作换算 */
export function getChaseResults(
  chaserX: number, chaserY: number, chaserSpeed: number,
  runnerX: number, runnerY: number, runnerVx: number, runnerVy: number,
): ChaseResults {
  if (chaserX === runnerX && chaserY === runnerY) {
    return { happens: true, time: 0, vx: 0, vy: 0 };      // :656-664 重合特例
  }
  if (chaserSpeed <= 0) return { happens: false, time: 0, vx: 0, vy: 0 };
  const dx = chaserX - runnerX;
  const dy = chaserY - runnerY;
  const dist = Math.hypot(dx, dy);
  const rv = Math.hypot(runnerVx, runnerVy);
  let interceptionTime = dist / chaserSpeed;
  let ix = runnerX;
  let iy = runnerY;
  if (rv !== 0) {
    const a = chaserSpeed * chaserSpeed - rv * rv;
    const b = 2 * (dx * runnerVx + dy * runnerVy);
    const c = -dist * dist;
    const roots = solveQuadratic(a, b, c);
    if (!roots) return { happens: false, time: 0, vx: 0, vy: 0 };
    const [r1, r2] = roots;
    if (r1 < 0 && r2 < 0) return { happens: false, time: 0, vx: 0, vy: 0 };
    if (r1 > 0 && r2 > 0) interceptionTime = Math.min(r1, r2);
    else interceptionTime = Math.max(r1, r2);
    ix = runnerX + runnerVx * interceptionTime;
    iy = runnerY + runnerVy * interceptionTime;
  }
  // 除零防护：InterceptionTime 只在重合特例为 0（已上探返回）
  const inv = interceptionTime !== 0 ? 1 / interceptionTime : 0;
  return {
    happens: true, time: interceptionTime,
    vx: (ix - chaserX) * inv, vy: (iy - chaserY) * inv,
  };
}

/** 锚体 226（"水晶叶"悬浮晶体,头顶常驻） */
export class ChloroLeafCrystalAnchor extends Entity {
  w = 22; h = 42;
  readonly projId = 226;
  dead = false;
  rotation = 0;

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player as unknown as PlayerLite & { equipStats?: unknown } | null;
    if (!p || p.dead || !p.buffs.has(BuffType.LeafCrystal)) {
      this.dead = true;                          // :28190-93 !crystalLeaf → Kill
      return;
    }
    this.pinTo(p);
    this.fireIfNeeded(game, p);
  }

  /** AI 钉位（:28192-28204）：Center−(w/2,h/2)−60,gravDir==−1 支 +120 且 rotation=3.14 */
  pinTo(p: { cx: number; cy: number; gravDir?: number }): void {
    this.x = p.cx - this.w / 2;
    let py = p.cy - this.h / 2 - 60;
    if ((p.gravDir ?? 1) === -1) {
      py += 120;
      this.rotation = 3.14;
    } else {
      this.rotation = 0;
    }
    this.y = py;
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);                 // :28205-07 (int) 截断
  }

  /** 索敌+出手（:28209-28255）。owner!=Main.myPlayer 门不建模：本仓锚体恒由本地
   *  玩家端驱动（远端代理不跑 fixedUpdate,MP 显影面偏差登记于 Game 端生成注） */
  fireIfNeeded(game: GameHooks, p: PlayerLite): void {
    if (p.crystalLeafCooldown !== 0) return;
    // x2/y2 先捕获后再扫目标的字面顺序 = 出手基向 (−w/2,−h/2) 怪癖之源（:28214-15）
    const x2 = this.x;
    const y2 = this.y;
    let best = 700;                              // num316 曼哈顿初值
    let target: NpcLite | null = null;
    for (const ent of game.enemies()) {
      const e = ent as unknown as NpcLite & { id?: number } | null;
      if (!e || canBeChasedBy(ent) === false) continue;
      const ecx = e.x + e.w / 2;
      const ecy = e.y + e.h / 2;
      const d = Math.abs(this.x + this.w / 2 - ecx) + Math.abs(this.y + this.h / 2 - ecy);
      if (d >= best) continue;
      const st = game.world.store;
      if (!canHit(st, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      best = d;
      target = e;
    }
    if (!target) return;
    const speed = 12;                            // num321
    const ccx = this.x + this.w * 0.5;           // vector30
    const ccy = this.y + this.h * 0.5;
    let nx = x2 - ccx;                           // 怪癖基向（见文件头）
    let ny = y2 - ccy;
    const len = Math.sqrt(nx * nx + ny * ny);
    // len 为 (11²+21²)^.5 常数 ~23.7，永非零；逐字面缩放
    const k = speed / len;
    nx *= k;
    ny *= k;
    const chase = getChaseResults(this.cx, this.cy, speed * 180,
      target.x + target.w / 2, target.y + target.h / 2, target.vx ?? 0, target.vy ?? 0);
    if (chase.happens && chase.time <= 180) {    // :28243-47 InterceptionHappens && Time<=180
      nx = chase.vx / 180;                       // vector31=ChaserVelocity/num326
      ny = chase.vy / 180;
    }
    game.spawnChloroLeafShot?.(this.cx - 4, this.cy, nx, ny);   // :28253 Center.X−4f
    p.crystalLeafCooldown = CHLORO_ANCHOR_COOLDOWN_TICKS;        // :28254
  }

  draw(r: import('../render/Renderer').Renderer, _cam: import('../render/Camera').Camera): void {
    // scale 脉动（:28206-08 AI 内计算——纯视觉,本仓移至绘制帧以复用 FlickerClock）：
    // num=(int(mouseTextColor)/200−0.35)×0.2,scale=num+0.95 ⇒ mouseText∈[190,255] 对应
    // [1.066,1.135]。light=0.4（SetDefaults :3113-3123 light 支在 lighting 侧:
    // ProjectileLightColor 表 type 226 倍率 0.25/1/0.5 P.cs:16721）
    const mtt = r.lighting?.clock.mouseTextColor ?? 255;   // FlickerClock（LightingEngine:get clock）
    const scl = (((mtt | 0) / 200 - 0.35) * 0.2) + 0.95;
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(226);                 // 素材包覆写/失败 TTL 语义在 helper 内
    ctx.save();
    ctx.translate(this.cx, this.cy);
    if (this.rotation !== 0) ctx.rotate(Math.PI);         // 反重力面 π 翻转（:28200）
    ctx.imageSmoothingEnabled = false;
    const dw = this.w * scl;
    const dh = this.h * scl;
    if (img) {
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#50C860';
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);             // 图集未载兜底平色
    }
    ctx.restore();
  }
}

/** 叶弹 227（隐藏瞬发追踪弹——本体 hide,视觉=ChlorophyteLeafCrystalShot 粒子 streak） */
export class ChloroLeafShot extends Entity {
  w = 14; h = 14;
  readonly projId = 227;
  damage: number;
  knockback: number;
  critChance = 0.04;             // friendly 无类别旗默认 crit 面（TitaniumStormShard 同式）
  armorPen = 0;
  meleeProj = false;
  dead = false;
  private rotation = 0;
  private timeLeft = 180;        // SetDefaults :3129-3137 timeLeft=180（子步消耗制）
  private burstDone = false;
  /** usesLocalNPCImmunity 表（penetrate=1 单发窗——dealContacts cooldown=−1 每敌一次） */
  private readonly hitCd = new HitCdImpl();

  constructor(cx: number, cy: number, vx: number, vy: number, damage = CHLORO_LEAF_DAMAGE,
    knockback = CHLORO_LEAF_KB) {
    super();
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.vx = vx;
    this.vy = vy;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    this.rotation = Math.atan2(vy, vx) + Math.PI;   // :28261 atan2+π（velocity 恒定）
  }

  get rot(): number { return this.rotation; }
  get lifeT(): number { return this.timeLeft; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 出生帧演出（:28260-28274 soundDelay==0 && type==227 恒单次）——8×d157 noGravity
    // vel=自身随机 ×3 + 弹速 ×NextFloat()、scale 1.5 + legacy 音 6（仓内映射 'dig',
    // 与 206/225 叶绿箭族先例同表）
    if (!this.burstDone) {
      this.burstDone = true;
      game.playSfxWav?.('Item_6', 1, this.cx, this.cy);
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const f = Math.random();
        game.spawnDust?.(this.x, this.y, this.w, this.h, 157,
          Math.cos(ang) * 3 + this.vx * f, Math.sin(ang) * 3 + this.vy * f,
          0, null, 1.5, true);
      }
    }
    // 子步展开主循环（Projectile.Update while(numUpdates>=0) :16781-17346 展开 181 步）。
    // 原文子步序：世界边界早退 → UpdateEnchantmentVisuals(无) → HandleMovement(position+=
    // velocity) → Damage() → timeLeft--; ≤0 Kill。（AI 位于移动前——rotation 已常量化,
    // 轨迹粒子随子步推进采样,见 trailStep）
    for (let u = 0; u < LEAF_SUBSTEPS && !this.dead; u++) {
      const st = game.world.store;
      const tw = st.w * 16;
      const th = st.h * 16;
      if (this.x <= 16 || this.y <= 16 || this.x + this.w >= tw - 16 || this.y + this.h >= th - 16) {
        this.dead = true;                        // :16788 active=false 静默出界
        return;
      }
      this.x += this.vx;
      this.y += this.vy;
      this.trailStep(game, u);
      // Damage()（每子步结算面——DamageVar/banner/SnapStrike/crit 单源经共享
      // dealContacts;pierce=1 = flag3 免疫豁免+不设帧,命中即亡 penetrate）
      let hit = false;
      dealContacts(this, game, this.hitCd, -1, () => { hit = true; }, undefined, 1);
      if (hit) {
        this.killWithFx(game);
        return;
      }
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.killWithFx(game);                   // :17308-17313 寿命尽 Kill（7040 区死亡尘/音）
        return;
      }
    }
  }

  /** 轨迹编排粒子（aiStyle43 :28279-28303 每子步请求 ChlorophyteLeafCrystalShot——
   *  原版 181 次/拍;本仓每 45 子步采样一次 ≈4 次/拍,色相链与广播 uniqueInfo 一致,
   *  密度差登记） */
  private trailStep(game: GameHooks, u: number): void {
    if (u % 45 !== 0) return;
    const hue = leafTrailHue01(this.timeLeft);
    const infoByte = Math.max(0, Math.min(255, Math.round(hue * 255)));
    game.broadcastParticleOrchestra?.(
      17 /* ParticleOrchestraType.ChlorophyteLeafCrystalShot */,
      this.cx, this.cy, this.vx, this.vy, infoByte);
    leafCrystalShotFx(game, this.cx, this.cy, this.vx, this.vy, hue);
  }

  /** hide=true（SetDefaults :3136）——本体不绘制,视觉=ChlorophyteLeafCrystalShot
   *  轨迹编排粒子（trailStep 广播）+出生/Kill 尘。实体管线要求抽象实现,故留空 */
  draw(_r: import('../render/Renderer').Renderer, _cam: import('../render/Camera').Camera): void {}

  private killWithFx(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    game.playSfxWav?.('Item_6', 1, this.cx, this.cy);            // legacy PlaySound(6,:76022)
    for (let i = 0; i < 15; i++) {                                // 15×d157（:76024-76031）
      const f = Math.random();
      game.spawnDust?.(this.x, this.y, this.w, this.h, 157,
        this.vx * f, this.vy * f, 0, null, 1.5, true);            // vel += oldVel×NextFloat
    }
  }
}


