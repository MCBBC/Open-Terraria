// 1457 批 C 新弹实体（Terarria1457 反编译为唯一标杆；行号均指该树）：
//   ChloroClaymoreBlade  1126  aiStyle 190  AI_190_NightsEdge 1126 支（:42734-43000）
//   ChloroSaberStab      1127  aiStyle 161  AI_161_RapierStabs 1127 支（:48483-48560）
//   ChloroSporeCloud     1128  aiStyle 92   aiStyle92 段 flag46 支（:33143-33340）
//   ChloroBladeSlam      1129  aiStyle 209  AI_209_ChlorophyteClaymoreBladeSlam（:42741-42748）
//   PetalstormShot       1116  aiStyle 196  AI_196_Petal 1116 支（:41192-41290）
//   StormLightning       1117/1122 aiStyle 203 AI_203_StormLightning（:40360-40560）
//   GlacierFangShot      1115  aiStyle 208  AI_208_GlacierFangShot（:37576-37750）
// 命中统一走 playerCanHitEnemy + applyProjStatus（StatusNPC :11176 表驱动——
// 1127→397 孢子侵染 300t / 1117→323+399 / 1122→400 已在 vanilla-projstatus.json）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { TILE } from '../core/constants';
import { projectileData } from '../data/vanillaProjectiles';
import { canHit } from '../physics/LineOfSight';
import { playerCanHitEnemy } from './projTargets';
import { applyProjStatus } from './projStatus';
import { projSprite } from './Arrow';
import { LCG32, arcSurgeWeaponGenerator, lightningStrikeWeaponGenerator,
  type Bolt } from '../fx/LightningGenerator';

/** 同敌命中去重/冷却表（WeaponProj.HitCooldown 同构——该类模块私有，此处独立一份） */
class HitCdImpl {
  private map = new Map<number, number>();
  tick(): void {
    for (const [k, v] of this.map) {
      if (v <= 1) this.map.delete(k);
      else this.map.set(k, v - 1);
    }
  }
  /** cooldown<0 = localNPCHitCooldown −1（每敌一次） */
  ready(id: number, cooldown: number): boolean {
    if (this.map.has(id)) return false;
    this.map.set(id, cooldown < 0 ? 2147483647 : cooldown);
    return true;
  }
}

/** 1122 ArcSurge 的 IDStatic 免疫共享表（usesIDStaticNPCImmunity + cooldown 10,
 *  :10567-10569——IDStatic 语义 = 全场同型一张表,非每弹一张） */
const ID_STATIC_1122 = new HitCdImpl();

/** 敌怪最小命中面（Enemy/TownNPC 共用形状） */
interface HitTarget {
  x: number; y: number; w: number; h: number;
  id: number;
  dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean;
}

/** 通用命中结算：盒相交 → 暴击掷 → hurt + StatusNPC + 飘字。
 *  cooldown<0 = 每敌一次（localNPCHitCooldown −1）；返回是否命中过。
 *  gate：ownerHitCheck 距离门（CanHitWithMeleeWeapon :12415-12417 距离段）+
 *  usesOwnerMeleeHitCD 共享命中表（Damage_PVE :12596 门 + StrikeNPC :14343 写——
 *  与玩家挥击弧共用 per-enemy 命中表，同一挥击内弧+弹不双结算）。 */
function dealContacts(
  self: { x: number; y: number; w: number; h: number; cx: number; cy: number; damage: number; knockback: number; armorPen: number; critChance: number; projId: number },
  game: GameHooks,
  cd: HitCdImpl,
  cooldown: number,
  onHit?: (t: HitTarget) => void,
  gate?: { ownerCx: number; ownerCy: number; maxDist: number; sharedHits?: Set<number> },
): void {
  cd.tick();
  for (const ent of game.enemies()) {
    const e = ent as unknown as HitTarget & { vanillaId?: number };
    if (!e || e.dead) continue;
    if (!playerCanHitEnemy(ent, game, self.projId)) continue;
    if (gate) {
      // ownerHitCheckDistance：Distance(ent.Center) > N → 不命中（:12416-12418）
      if (Math.hypot(e.x + e.w / 2 - gate.ownerCx, e.y + e.h / 2 - gate.ownerCy) > gate.maxDist) continue;
      // usesOwnerMeleeHitCD：玩家近战命中表已记该敌 → 本弹跳过（:12596 flag2=false）
      if (gate.sharedHits?.has(e.id)) continue;
    }
    if (!(self.x < e.x + e.w && self.x + self.w > e.x && self.y < e.y + e.h && self.y + self.h > e.y)) continue;
    if (!cd.ready(e.id, cooldown)) continue;
    const crit = Math.random() < self.critChance;
    const dmg = crit ? self.damage * 2 : self.damage;
    const kdir = Math.sign((e.x + e.w / 2) - self.cx) || 1;
    e.hurt(dmg, kdir * self.knockback, 0, game, self.armorPen, crit);   // 音/飘值=单点
    // + 催化指环 6185（StatusNPC :11192-11196,玩家弹命中 398 300t;同 Arrow.ts:3260 先例）
    applyProjStatus(self.projId, ent as unknown as Record<string, number>,
      { catalystBand: ((game.player as unknown as { equipStats?: { catalystBand?: boolean } } | null)?.equipStats?.catalystBand) === true });
    // 命中回写共享表（StrikeNPC :14343 SetMeleeHitCooldown——玩家挥击弧同帧不再结算）
    gate?.sharedHits?.add(e.id);
    onHit?.(ent as unknown as HitTarget);
  }
}

// ================= 1126 叶绿巨剑刃（AI_190 旋刃,1226 重做本体） =================

/** 1226 出手链（Player.cs:49406-49426）：NewProjectile(MountedCenter, (dir, 0|1), 1126,
 *  Damage, KnockBack, ai0=dir×gravDir, ai1=itemAnimationMax, ai2=itemScale)。
 *  奖励击（chlorophyteBladeCounter 空）伤 ×1.5/击退 ×1.25 且水平出手 (dir,0)；
 *  普通击向下 (dir,1)。AI_190（:42734-43000）：
 *   - 首帧 localAI[2] = (velocity.Y==0)；velocity.Y 清零（:42741-42745）
 *   - num = localAI[0]/ai[1]；rotation = π·ai0·num + velocity.ToRotation() + ai0·π（:42748）
 *   - scale = (0.85 + num×0.6)×ai[2]（:42756 num6=0.85/num5=0.62 + :42995 ×ai[2]）
 *   - Center = player.RotatedRelativePoint(MountedCenter) − velocity（:42757）
 *   - 挥击尾孢子（:42924-42947，与 localAI[2] 无关）：num≤0.8 期间每帧掷
 *     Remap(meleeSpeed,1,1/3,4,2)==0 出一颗 1128（伤 ×0.75、ai1=90+rand(60)）；
 *     :42933-42938 两处 localAI[1] 保底分支为死代码（全函数无 localAI[1] 写，恒 0
 *     → localAI[0]==0 永假）——勿再读成保底帧（蓝队 R2-07 勘误）
 *   - 砸地孢子云（:42763-42820，仅 localAI[2]==1 水平击）：num≥0.8 首帧在刃尖前方
 *     FindChlorophyteSporeCloudSpawn（:42565）找 solid 台面 → onSlamCloud 回调
 *   - num≥1 Kill（:42997-43000） */
export class ChloroClaymoreBlade extends Entity {
  w = 16; h = 16;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  dead = false;
  readonly projId = 1126;
  /** ai[0] = 出手方向 ±1（rotation/孢子搜索侧向共用） */
  private readonly dir: number;
  /** ai[1] = itemAnimationMax（进度分母=寿命） */
  private readonly animMax: number;
  /** ai[2] = 物品 scale（终态乘区） */
  private readonly itemScale: number;
  /** localAI[2]：1=水平（奖励）击——砸地孢子云唯一门 */
  private readonly horizontal: boolean;
  private age = 0;              // localAI[0]
  private rot = 0;
  private scl = 0.85;
  private cloudFired = false;   // num≥0.8 单次门（num14<num11 比较）
  private hitCd = new HitCdImpl();  // usesLocalNPCImmunity + localNPCHitCooldown −1（:10550-10556）
  /** usesOwnerMeleeHitCD 共享命中表（:10556 → Game 注入玩家挥击 swingHitSet——
   *  同一挥击内弧+刃对同敌只结算一次；蓝队 R2-08） */
  sharedMeleeHits: Set<number> | null = null;
  /** 挥击尾孢子生成（Game 注入：NewProjectile 1128——伤 ×0.75 已在 Game 侧折算） */
  spawnSpore: (x: number, y: number, vx: number, vy: number, life: number) => void = () => {};
  /** 砸地孢子云生成（Game 注入：FindChlorophyteSporeCloudSpawn+SpawnChlorophyteSporeCloud） */
  spawnSlamCloud: (tipX: number, tipY: number) => void = () => {};

  constructor(cx: number, cy: number, dir: number, down: number, damage: number, knockback: number,
    animMax: number, itemScale: number) {
    super();
    this.dir = dir;
    this.animMax = Math.max(1, animMax);
    this.itemScale = itemScale || 1;
    this.horizontal = down === 0;      // :42741-42743 localAI[2]=(velocity.Y==0)
    this.vx = dir; this.vy = 0;        // :42745 velocity.Y=0（方向仅进 rotation/搜索侧向）
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    this.x = cx - this.w / 2 - this.vx; // Center=RotatedRelativePoint(MountedCenter)−velocity（:42757）
    this.y = cy - this.h / 2 - this.vy;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player;
    this.age++;
    const num = this.age / this.animMax;                        // :42747
    // rotation = π·ai0·num + velocity.ToRotation() + ai0·π（:42748-42750；fullRotation 本仓恒 0）
    this.rot = Math.PI * this.dir * num + Math.atan2(this.vy, this.vx) + this.dir * Math.PI;
    this.scl = (0.85 + num * 0.6) * this.itemScale;             // :42756+:42995
    // Center 跟手（:42757 RotatedRelativePoint≈MountedCenter——本仓无全身旋转）
    this.x = p.cx - this.vx;
    this.y = p.cy - this.vy;
    // 刃尖方向（:42806-42807 同构）：rotation + Remap(0.8,0,1,0,π/4)×ai0
    const tipAng = this.rot + (Math.PI / 8) * this.dir * Math.min(1, Math.max(0, (num - 0.8) / 0.2 + 0.8));
    const tipDist = (170 * 0.5 - 4) * this.scl;                 // num15（:42770）
    const tipX = this.cx + Math.cos(this.rot + (Math.PI / 8) * this.dir) * tipDist;
    const tipY = this.cy + Math.sin(this.rot + (Math.PI / 8) * this.dir) * tipDist;
    void tipAng;
    // ---- 砸地孢子云（:42763-42820，仅水平击；num≥0.8 首帧） ----
    if (this.horizontal && !this.cloudFired && num >= 0.8) {
      this.cloudFired = true;
      this.spawnSlamCloud(tipX, tipY);
    }
    // ---- 挥击尾孢子（:42924-42947，两态都撒） ----
    if (num <= 0.8 && this.spawnSpore) {
      const ms = p.attackSpeedMult > 0 ? 1 / p.attackSpeedMult : 1;   // meleeSpeed（Player.ts 倒数还原）
      const remap = 4 + (2 - 4) * Math.min(1, Math.max(0, (ms - 1) / (1 / 3 - 1)));  // Remap(ms,1,1/3,4,2)
      // ★:42933-42938 的两处 `localAI[0]==localAI[1]/3` "保底帧"是死代码——AI_190
      //  （:42734-43002）全函数无 localAI[1] 赋值（恒 0 → 条件要求 localAI[0]==0，
      //  而首帧自增后 ≥1 永假）。原版孢子纯靠每帧 Next(Remap(meleeSpeed,1,1/3,4,2))==0
      //  掷。蓝队 R2-07：曾把死分支读成 animMax/3、2animMax/3 保底必出，孢子密度虚高
      if (Math.floor(Math.random() * Math.max(1, Math.round(remap))) === 0) {
        // :42926 vector9 = player.velocity×0.77 + vector7×5（vector7=随机侧向单位向量）
        const side = this.rot + (Math.random() * 2 - 1) * (Math.PI / 2) * 0.7 + this.dir * Math.PI / 2;
        const svx = p.vx * 0.77 + Math.cos(side) * 5;
        const svy = p.vy * 0.77 + Math.sin(side) * 5;
        const posAng = this.rot + ((-Math.PI / 4) * (1 - Math.min(1, num / 0.8))
          + (Math.PI / 4) * Math.min(1, num / 0.8)) * this.dir;    // :42930 num26+Remap(num,0,1,0,π/4)
        const lerpDist = tipDist * (0.5 + 0.5 * Math.min(1, num / 0.8));  // :42928-42929 Lerp(半,全)
        this.spawnSpore(this.cx + Math.cos(posAng) * lerpDist, this.cy + Math.sin(posAng) * lerpDist,
          svx, svy, 90 + Math.floor(Math.random() * 60));
      }
    }
    // ---- 命中（usesLocalNPCImmunity + cooldown −1 :10550-10556）----
    // ownerHitCheck + ownerHitCheckDistance=300（:10554-10555）→ 只判 300px 内目标
    // （CanHitWithMeleeWeapon :12415 距离段；LOS 探针四支本仓登记近似——玩家本体
    // 挥击亦无 LOS 门）；usesOwnerMeleeHitCD（:10556）→ 与玩家挥击共享命中表
    dealContacts(this, game, this.hitCd, -1, undefined,
      { ownerCx: p.cx, ownerCy: p.cy, maxDist: 300, sharedHits: this.sharedMeleeHits ?? undefined });
    // ---- 绿光（:42948-42953）----
    game.addLightAt?.(this.cx, this.cy, 0, 0.42, 0);
    if (num >= 1) this.dead = true;                              // :42997-43000
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    const img = projSprite(1126);
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot + Math.PI / 2);   // DrawProjDirect 旋刃贴图竖条（origin 中心）
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const dw = 170 * this.scl;          // 贴图原宽 170（Projectile_1126.png）×scale
      ctx.drawImage(img, -dw / 2, -dw * (img.height / img.width) / 2, dw, dw * (img.height / img.width));
    } else {
      ctx.fillStyle = '#3FA050';
      ctx.fillRect(-84 * this.scl, -4, 168 * this.scl, 8);
    }
    ctx.restore();
  }
}

// ================= 1127 叶绿军刃刺（AI_161 1127 支,1227 重做本体） =================

/** 1227 出手链（Player.cs:47745-47756 + 通用尾段 :49957）：velocity =
 *  aim单位向量.RotatedBy(0.65×Remap(meleeSpeed,1,1/3,1,0.25)×(rand−0.5))
 *  ×(aim长 − randDirection×0.5)；ai[1] = meleeSpeed（AI_161 :48492-48500 全部
 *  节奏参数 ×ai[1]——★反编译出生点 ai13=0 与 AI 语义矛盾,按 AI 侧读数取
 *  meleeSpeed：寿命 16ms+5 / 淡入 7ms / 淡出起 12ms / 位移钳 16ms,即官方
 *  "穿刺范围随攻速成长"）。AI_161（:48483-48560）：
 *   - rotation = velocity.ToRotation()+π/2；Center = MountedCenter + velocity×(ai0−1)
 *     + (rotation−π/2) 向 ×10（:48505-48508 1127 专属垂直偏移）
 *   - Opacity = GetLerpValue(0,7ms,ai0)×GetLerpValue(16ms+5,12ms,ai0)
 *   - ai0≥16ms+5 Kill；heldProj=本体；尘 157 + Item1 每 12t（:48522-48545）
 *   - 命中：usesLocalNPCImmunity + localNPCHitCooldown −1（:10563-10565）→ 每敌一次；
 *     StatusNPC 397 孢子侵染 300t（:11729-11732,projstatus 表已登记） */
export class ChloroSaberStab extends Entity {
  w = 18; h = 18;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  dead = false;
  readonly projId = 1127;
  /** 出手单位向量（原版 velocity 归一）与速度模长 */
  private readonly dx: number;
  private readonly dy: number;
  private readonly spd: number;
  private readonly ms: number;   // ai[1] = meleeSpeed
  private t = 0;
  private rot = 0;
  private hitCd = new HitCdImpl();

  constructor(dirX: number, dirY: number, speed: number, meleeSpeed: number,
    damage: number, knockback: number) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dx = dirX / n;
    this.dy = dirY / n;
    this.spd = speed;
    this.ms = meleeSpeed > 0 ? meleeSpeed : 1;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    this.rot = Math.atan2(this.dy, this.dx) + Math.PI / 2;   // :48486
    this.x = 0; this.y = 0;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player;
    this.t++;
    const life = Math.round(16 * this.ms) + 5;                 // num（:48492）
    const fadeOut = Math.round(12 * this.ms);                  // num2（:48495）
    const fadeIn = Math.max(1, Math.round(7 * this.ms));       // num3（:48494）
    const adv = Math.min(this.t, Math.round(16 * this.ms));    // num4（:48493 Min(ai0,16ms)）
    // Center = MountedCenter + velocity×(adv−1) + (rotation−π/2) 向 ×10（:48503-48508）
    const px = Math.cos(this.rot - Math.PI / 2) * 10;
    const py = Math.sin(this.rot - Math.PI / 2) * 10;
    this.x = p.cx + this.dx * this.spd * (adv - 1) + px - this.w / 2;
    this.y = p.cy + this.dy * this.spd * (adv - 1) + py - this.h / 2;
    // 朝向随出手向量（:48510-48512 spriteDirection；:48496-48499 1127 ChangeDir）
    if (this.dx !== 0) p.facing = this.dx > 0 ? 1 : -1;
    if (this.t >= life) { this.dead = true; return; }
    // CutTiles += 1127（切割长度 88f,Projectile.cs:15498 段）——刃尖 44px 扫草
    game.cutTile(Math.floor((this.cx + this.dx * 44) / TILE), Math.floor((this.cy + this.dy * 44) / TILE));
    // 尘 157 + Item1 每 12t（:48522-48545；音效本仓 Item_1）
    if (this.t % 12 === 1) game.playSfxAt?.('hit', this.cx, this.cy);
    game.spawnParticles(this.cx, this.cy, '#4C8C3C', 2, 1.2, { life: 16, grav: 0, damp: 0.9 });
    dealContacts(this, game, this.hitCd, -1);
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(1127);
    const life = Math.round(16 * this.ms) + 5;
    const fadeOut = Math.round(12 * this.ms);
    const fadeIn = Math.max(1, Math.round(7 * this.ms));
    // Opacity = GetLerpValue(0,fadeIn,t)×GetLerpValue(life,fadeOut,t)（:48501-48502 clamped）
    const aIn = Math.min(1, this.t / fadeIn);
    const aOut = this.t <= fadeOut ? 1 : Math.max(0, (life - this.t) / (life - fadeOut));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, aIn * aOut));
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    const sd = this.dx >= 0 ? 1 : -1;                          // spriteDirection=sign(vx)（:48510）
    if (sd === -1) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      ctx.fillStyle = '#3FA050';
      ctx.fillRect(-9, -40, 18, 80);
    }
    ctx.restore();
  }
}

// ================= 1128 叶绿孢子云（aiStyle 92 flag46 支） =================

/** SpawnChlorophyteSporeCloud 撒下的漂浮孢子（Projectile.cs:33143-33405 flag46）：
 *  - 寿命 = ai[1]（挥击尾孢子 90+rand(60)；砸地大云走同型 220 缺省——本类由
 *    SpawnChlorophyteSporeCloud 生成时 ai[1] 缺省 0 → 220）
 *  - scale = Remap(t/T,0,0.1,0.25,1.1)；盒 = 30×scale/1.1 居中回写（:33182-33188）
 *  - Opacity = Remap(T,0,0.25,0,1)×Remap(T,0.5,1,1,0)×0.75；vy −= 0.01（上飘）
 *  - velocity ×0.97；同型互斥（:33268-33300 互推 0.005）；撞实心点反弹（简化=停）
 *  - 命中：usesIDStaticNPCImmunity + cooldown 30（:10574-10575）——全场 1128 共享
 *    一张 30t 表（本类经 Game 注入共享 HitCd 语义：cooldown 30 每弹独立近似,登记） */
export class ChloroSporeCloud extends Entity {
  damage: number;
  knockback = 0;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  dead = false;
  readonly projId = 1128;
  private readonly life: number;
  private t = 0;
  private readonly spawnFrame = Math.floor(Math.random() * 5);   // :33149 frame=rand(frames)
  private hitCd = new HitCdImpl();

  constructor(cx: number, cy: number, vx: number, vy: number, damage: number, life: number) {
    super();
    this.w = 30; this.h = 30;
    this.x = cx - this.w / 2; this.y = cy - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = Math.max(1, Math.round(damage));
    this.life = life > 0 ? life : 220;                          // :33168 ai[1]==0 → 220
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t > this.life) { this.dead = true; return; }       // :33172-33176
    const T = this.t / this.life;
    const scl = 0.25 + (1.1 - 0.25) * Math.min(1, T / 0.1);     // :33182
    const side = 30 * scl / 1.1;                                // :33184-33186
    this.x += this.cx - side / 2 - this.x; this.y += this.cy - side / 2 - this.y;
    this.w = side; this.h = side;
    this.vy -= 0.01;                                            // :33189
    this.vx *= 0.97; this.vy *= 0.97;                           // :33206 flag46 档
    this.x += this.vx; this.y += this.vy;
    // 撞实心点 → 静止（原版 :33306-33405 多向反弹,云体低速近似=贴壁悬停）
    const st = game.world.store;
    const tx = Math.floor((this.cx + Math.sign(this.vx) * 16) / TILE);
    const ty = Math.floor((this.cy + Math.sign(this.vy) * 16) / TILE);
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { this.vx = 0; this.vy = 0; }
    dealContacts(this, game, this.hitCd, 30);
    if (this.t % 3 === 0) {
      game.spawnParticles(this.cx, this.cy, '#32C864', 1, 0.6, { life: 24, grav: -0.02, damp: 0.94 });
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const T = this.t / this.life;
    const opacity = Math.max(0, Math.min(1, T / 0.25)) * Math.max(0, Math.min(1, (1 - T) / 0.5)) * 0.75;
    const img = projSprite(1128);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.id * 0.4002029 + this.t * (Math.PI * 2) / 480);  // :33199-33200
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const dw = 30 * (0.25 + 0.85 * Math.min(1, T / 0.1)) * 1.1;
      // projFrames[1128]=5（Main.cs:8865）——竖条 5 帧按出生随机帧定格（:33149-33151
      // ai[0]==0 → frame=rand(frames),云体不播帧）
      const fh = img.height / 5;
      const fr = this.spawnFrame % 5;
      ctx.drawImage(img, 0, Math.round(fr * fh), img.width, Math.round(fh),
        -dw / 2, -dw / 2, dw, dw);
    } else {
      ctx.fillStyle = '#32C864';
      ctx.beginPath();
      ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ================= 1129 叶绿巨剑砸地爆（AI_209） =================

/** SpawnChlorophyteSporeCloud 尾段的视觉大爆炸伤害盒（:42741-42748）：
 *  width=(int)ai[1]=128 / height=(int)ai[2]=96、ai[0]++>20 Kill、无位移无绘制
 *  （alpha=255 原版即全透明）。ownerHitCheck（:10588）= 不与本体挥击重复结算,
 *  本仓无该共享 CD 通道 → 每敌一次（cooldown −1）近似。 */
export class ChloroBladeSlam extends Entity {
  damage: number;
  knockback = 0;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  dead = false;
  readonly projId = 1129;
  private t = 0;
  private hitCd = new HitCdImpl();

  constructor(cx: number, cy: number, w: number, h: number, damage: number) {
    super();
    this.w = w; this.h = h;
    this.x = cx - w / 2; this.y = cy - h / 2;
    this.damage = Math.max(1, Math.round(damage));
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    dealContacts(this, game, this.hitCd, -1);
    if (this.t === 1) {
      game.spawnParticles(this.cx, this.cy, '#32C864', 16, 3.4, { life: 26, grav: -0.03, damp: 0.93 });
    }
    if (this.t > 20) this.dead = true;                          // :42746-42748
  }

  draw(): void { /* alpha=255 原版本体不绘制（:10583） */ }
}

// ================= 1116 花瓣风暴弹（AI_196 1116 支） =================

/** 6154 Petalstorm 出手（Player.cs:48010-48026）每 use 3 瓣：
 *  v = NextVector2Circular(1,1)+NextVector2CircularEdge(3,2)（Y>0 取反）×2 + aim×2；
 *  ai0=−1 / ai1=(itemAnimation/itemAnimationMax×0.66+miscCounter)%1（相位）；
 *  出生点 = MountedCenter+(dir×15, gravDir×3)（挂墙则回 MountedCenter）。
 *  AI_196（:41192-41290）1116 支：光 (0,0.6,0.6)、alpha=Remap(timeLeft,30,0,0,255)、
 *  scale×0.75、索敌 400px 无 LOS 门、追踪 v=(v×30+dir×6)/31、无目标漂移
 *  vx→sin(ai0×0.1)×1.5 / vy→0.3；前 20t 减速 ×0.95（:41220-41227）。
 *  SetDefaults（:10415-10426）：18×18、timeLeft 120、penetrate 1、
 *  usesLocalNPCImmunity + cooldown −1（每敌一次）、magic、ignoreWater。 */
export class PetalstormShot extends Entity {
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 1116;
  private t = 0;
  private readonly phase: number;
  private readonly life = 120;
  private frame = 0;
  private frameCounter = 0;
  private rot = 0;
  private scl = 0.5;
  private hitCd = new HitCdImpl();

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number, phase: number) {
    super();
    this.w = 18; this.h = 18;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    this.phase = phase;
    this.rot = Math.random() * Math.PI * 2;                     // :41212
    this.scl = (0.6 + 0.3 * Math.random()) * 0.75;              // :41213-41216
    this.frame = Math.floor(Math.random() * 8);                 // :41210
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t >= this.life) { this.dead = true; return; }      // timeLeft 120 → 120t 消亡
    if (++this.frameCounter >= 4) {                             // :41218-41223
      this.frameCounter = 0;
      this.frame = (this.frame + 1) % 8;
    }
    this.rot += (this.vx + this.vy) * 0.1;                      // :41225
    if (this.t < 20) {                                          // :41220-41227（ai0<20 减速段）
      this.vx *= 0.95; this.vy *= 0.95;
      this.x += this.vx; this.y += this.vy;
      game.addLightAt?.(this.cx, this.cy, 0, 0.6, 0.6);
      return;
    }
    // 索敌 400px（1116：num3=400/num4=0 → 无 LOS 门,:41246-41249）
    let best: { cx: number; cy: number } | null = null;
    let bd = 400;
    for (const q of game.enemies()) {
      const e = q as { cx: number; cy: number; dead: boolean; maxHp: number; def?: { friendly?: boolean; critter?: boolean } };
      if (e.dead || e.maxHp <= 5 || e.def?.friendly || e.def?.critter) continue;
      const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      // :41263-41270（1116：num6=6/num7=30）v = (v×30 + dir×6)/31
      const d = Math.hypot(best.cx - this.cx, best.cy - this.cy) || 1;
      const hx = (best.cx - this.cx) / d * 6;
      const hy = (best.cy - this.cy) / d * 6;
      this.vx = (this.vx * 30 + hx) / 31;
      this.vy = (this.vy * 30 + hy) / 31;
    } else {
      // :41274-41276（1116 漂移档：sin(ai0×0.1)×1.5 / 0.3）
      this.vx += (Math.sin((this.t + this.phase * 100) * 0.1) * 1.5 - this.vx) * 0.1;
      this.vy += (0.3 - this.vy) * 0.1;
    }
    this.x += this.vx; this.y += this.vy;
    game.addLightAt?.(this.cx, this.cy, 0, 0.6 * Math.max(0, Math.min(1, (this.life - this.t) / 120)), 0.6 * Math.max(0, Math.min(1, (this.life - this.t) / 120)));
    dealContacts(this, game, this.hitCd, -1);
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(1116);
    const T = this.t / this.life;
    const alpha = 1 - Math.max(0, Math.min(1, (30 - (this.life - this.t)) / 30));  // Remap(timeLeft,30,0,0,255)
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    const dw = 18 * this.scl * (img && img.width > 0 ? img.width / 18 : 1);
    if (img && img.width > 0) {
      const fh = img.height / 8;
      ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
        -dw / 2, -dw / 2, dw, dw);
    } else {
      ctx.fillStyle = '#E86FA8';
      ctx.beginPath();
      ctx.arc(0, 0, dw / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    void T;
  }
}

// ================= 1117/1122 天雷/红雷（AI_203_StormLightning） =================

/** 6155 LightningStrike（1117）出手（Player.cs:49686-49703）：落点 = 鼠标位钳可达区,
 *  出手沿 aim 步进至距鼠标 <20+|vx|+|vy| 吸附；再沿 aim 反向退出实心块（≤16 步）；
 *  ai0=−1 / ai2=rand 种子。6173 ArcSurge（1122）（:49670-49703）：鼠标位钳可达 + 距离
 *  <shootSpeed×20 外推 + ±20px 抖动,再向 GetSparkleGuitarTarget 前 2 个有效目标
 *  各补一颗（Game 侧实现）。AI_203（:40360-40560）：
 *  - 1117：寿命 30、索敌门 CanBeChasedBy、搜索半径 12、无目标跟鼠标（v=鼠标−中心
 *    钳 16,撞实心停）；1122：寿命 240、半径 32、无鼠标跟随、玩家侧 localAI[2] 5 次
 *    豁免计数后可选中玩家（自伤链,本仓玩家弹不伤主——登记）
 *  - 目标锁定（ai[0] Pack/Unpack :40508-40560）：锁定后每帧校验,失效即 Kill
 *  - 中心 MoveTowards(目标,32)；ai[1]++≥寿命 Kill；ai[1]==寿命×0.15 播 NPCHit34
 *  - ★命中模型（Colliding :15962 aiStyle 203 支 → StormLightningCollisionCheck
 *    :16205）：飞行期【无普通接触盒】——仅 Kill 帧 GenerateMainBoltPath 折线 +
 *    customHitbox=MultiPointHitbox(16×16, bolt.positions) → Damage() 沿整条闪电
 *    一次性结算（:71904-71930 1122 手→雷 / :71931-71975 1117 天降 bolt+64×64 爆
 *    炸域+液体链 localAI[0]=3）
 *  - Kill 帧编排（P57 Spawn_ArcLightning :1245-1345 / StormLightningParticle）：
 *    bolt 折线视觉（StormLightningDrawer 波前扫掠）+ 沿线 278/226 光尘
 *    （EmitSpawnDust :78-135）+ steadyLight 沿线点光 + Item15/ArcSurge(203) 双音
 *  - 1117 Damage() 伤 ×0.8（:13581-13586）——Game 侧出生伤已折算 */
export class StormLightning extends Entity {
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  declare readonly projId: number;
  /** ai[2] 出手种子（Player.cs :49678/:49642 Main.rand.Next(MaxFloatInt+1)；Game 注入） */
  seed = 0;
  private readonly life: number;
  private readonly searchR: number;
  private t = 0;
  private hitCd = new HitCdImpl();
  private sharedCd: HitCdImpl | null;
  /** ai[0] 目标锁（≥0=NPC 桶序；本仓无玩家目标链——登记） */
  private targetIdx = -1;
  /** Kill 帧 bolt 折线（视觉 + 命中域）；visualT>0 = 尸检期（弹已停 AI,仅画 bolt） */
  private bolt: Bolt | null = null;
  private boltColor: [number, number, number] = [1, 1, 1];
  private visualT = 0;
  private readonly visualTotal = 16;
  /** 跟鼠标回调（1117 无目标态；Game 注入） */
  mouseWorld?: () => { x: number; y: number };

  constructor(projId: number, x: number, y: number, damage: number, knockback: number) {
    super();
    this.projId = projId;
    this.w = 16; this.h = 16;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    // :40363-40370（1117：num=30/num2=12；1122：缺省 240/32）
    this.life = projId === 1117 ? 30 : 240;
    this.searchR = projId === 1117 ? 12 : 32;
    this.sharedCd = projId === 1122 ? ID_STATIC_1122 : null;     // 1122 IDStatic 10（全场同型一张表）
    this.boltColor = projId === 1117 ? [60 / 255, 120 / 255, 1] : [1, 60 / 255, 60 / 255]; // GetLightningColor :40566
  }

  /** TileCollision（LightningGenerator.cs:209-226）：实心/斜坡 或 液体浸没 */
  private tileProbe(game: GameHooks): (x: number, y: number) => boolean {
    return (x: number, y: number): boolean => {
      const tx = Math.trunc(x / 16), ty = Math.trunc(y / 16);
      const st = game.world.store;
      if (!st.inBounds(tx, ty)) return false;
      if (st.isSolid(tx, ty)) return true;
      const liq = typeof game.world.liquidAt === 'function' ? game.world.liquidAt(x, y) : 0;
      return liq > 0 && (Math.trunc(y) % 16) > (16 * (255 - liq)) / 255;
    };
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // ---- Kill 帧后：bolt 视觉余命（弹本体已死,原版由 StormLightningParticle 承接）----
    if (this.visualT > 0) {
      this.visualT--;
      // steadyLight（StormLightningParticle.Update :157-165）：沿线每 20 点加光,
      // 强度 = Remap(progress,0,0.3,0,1)×Remap(progress,0.7,1,1,0)
      if (this.bolt && game.addLightAt) {
        const prog = 1 - this.visualT / this.visualTotal;
        const k = remapL(prog, 0, 0.3, 0, 1) * remapL(prog, 0.7, 1, 1, 0);
        const pos = this.bolt.positions;
        const [r, g, b] = this.boltColor;
        for (let i = 0; i < pos.length; i += 20) {
          game.addLightAt(pos[i].x, pos[i].y, r * k, g * k, b * k);
        }
      }
      if (this.visualT === 0) this.dead = true;
      return;
    }
    this.t++;
    // :40445-40448 ai[1]>=num → Kill（Kill 帧内结算 bolt 伤害,见 doKill）
    if (this.t >= this.life) { this.doKill(game); return; }
    // 目标锁校验（:40372-40392）：锁定后失效（死亡/超距 600）即 Kill
    if (this.targetIdx >= 0) {
      const e = this.enemyAt(game, this.targetIdx);
      if (!e || e.dead || Math.hypot(e.cx - this.cx, e.cy - this.cy) > 600) {
        this.doKill(game); return;
      }
    }
    // 索敌（:40397-40421）：仅无目标时扫（1117 需 CanBeChasedBy 口径≈非 friendly/小动物）
    if (this.targetIdx < 0) {
      let best = -1;
      let bd = this.searchR;
      const list = game.enemies();
      for (let i = 0; i < list.length; i++) {
        const e = list[i] as { cx: number; cy: number; dead: boolean; maxHp: number; def?: { friendly?: boolean; critter?: boolean } };
        if (e.dead || e.maxHp <= 5 || e.def?.friendly || e.def?.critter) continue;
        const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) this.targetIdx = best;                     // ai[0]=PackTargetIndex
    }
    if (this.targetIdx >= 0) {
      // :40443 MoveTowards(center,32)
      const e = this.enemyAt(game, this.targetIdx)!;
      const d = Math.hypot(e.cx - this.cx, e.cy - this.cy) || 1;
      const step = Math.min(32, d);
      this.x += (e.cx - this.cx) / d * step;
      this.y += (e.cy - this.cy) / d * step;
    } else if (this.projId === 1117 && this.mouseWorld) {
      // :40423-40436（1117 无目标跟鼠标：v=鼠标−中心钳 16,撞实心停）
      const m = this.mouseWorld();
      let vx = m.x - this.cx, vy = m.y - this.cy;
      const l = Math.hypot(vx, vy);
      if (l > 16) { vx = vx / l * 16; vy = vy / l * 16; }
      const st = game.world.store;
      const tx = Math.floor((this.cx + vx) / TILE), ty = Math.floor((this.cy + vy) / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { vx = 0; vy = 0; }
      this.x += vx; this.y += vy;
      game.spawnParticles(this.cx, this.cy, '#3C78FF', 1, 1.2, { life: 14, grav: 0, damp: 0.92 });
    }
    const prog = this.t / this.life;
    if (this.t === Math.floor(this.life * 0.15)) {
      game.playSfxAt?.('hit', this.cx, this.cy);                // NPCHit34（:40459,本仓近似）
      game.spawnParticles(this.cx, this.cy, this.projId === 1117 ? '#3C78FF' : '#FF3C3C', 6, 2.2, { life: 18, grav: -0.02, damp: 0.93 });
    }
    // :40450-40455 num9=√(1−(num8−1)²)×0.3 光强包络（num8=Remap(prog,0,0.5,0,1)）
    const num8 = Math.min(1, Math.max(0, (prog - 0) / 0.5));
    const num9 = Math.sqrt(Math.max(0, 1 - (num8 - 1) * (num8 - 1))) * 0.3;
    const [cr, cg, cb] = this.boltColor;
    game.addLightAt?.(this.cx, this.cy, cr * num9, cg * num9, cb * num9);
  }

  private enemyAt(game: GameHooks, idx: number): { cx: number; cy: number; dead: boolean } | null {
    const e = game.enemies()[idx] as { cx: number; cy: number; dead: boolean } | undefined;
    return e ?? null;
  }

  // ---- Kill 帧（Projectile.Kill :71904-71975 type 1122 / 1091||1117 支） ----
  private doKill(game: GameHooks): void {
    const probe = this.tileProbe(game);
    const center = { x: this.cx, y: this.cy };
    const gen = this.projId === 1122
      ? arcSurgeWeaponGenerator(this.handAnchor(game), center, probe)
      : lightningStrikeWeaponGenerator(probe);
    // 1122：direction = center − hand（:71913-71914）；1117：direction 缺省 UnitY
    // （Generate(null,seed,target,direction??UnitY) → 天降 bolt,start=目标上方 750px）
    const dir = this.projId === 1122
      ? { x: center.x - this.handAnchor(game).x, y: center.y - this.handAnchor(game).y }
      : null;
    const bolt = gen.generateMainBoltPath(this.seed >>> 0, center, dir);
    this.bolt = bolt;
    // 1117：撞块 → 中心吸附 bolt 末点（:71945-71949）；液体 → localAI[0]=3
    if (this.projId === 1117) {
      if (bolt.collidedWithTile) {
        const last = bolt.positions[bolt.positions.length - 1];
        this.x = last.x - this.w / 2; this.y = last.y - this.h / 2;
      }
      // localAI[0]=3 液体链导电（SelfHurtPlayers 玩家自伤——本仓玩家弹不伤主,登记）
      void (typeof game.world.liquidAt === 'function' ? game.world.liquidAt(this.cx, this.cy) : 0);
    }
    // ---- MultiPointHitbox 16×16 沿 bolt 折线一次性结算（:71918-71919/:71957-71962）----
    this.damageAlongBolt(game, bolt);
    // ---- 编排视觉（Spawn_ArcLightning P57:1245-1345）----
    this.emitBoltFx(game, bolt);
    // 弹本体死,bolt 视觉余命 16f（StormLightningParticle lifeTimeTotal=num2）
    this.visualT = this.visualTotal;
  }

  /** StormLightningParticle.GetPlayerAnchorPos（:137-140）：RotatedRelativePoint
   *  (HandPosition ?? MountedCenter)——本仓无 HandPosition 缓存,取 RRP(MountedCenter)；
   *  mock/缺省回退玩家中心 */
  private handAnchor(game: GameHooks): { x: number; y: number } {
    const p = game.player as unknown as {
      mountedCenter?: { x: number; y: number };
      rotatedRelativePoint?: (x: number, y: number) => { x: number; y: number };
      cx: number; cy: number;
    };
    const mc = p.mountedCenter ?? { x: p.cx, y: p.cy };
    return p.rotatedRelativePoint ? p.rotatedRelativePoint(mc.x, mc.y) : mc;
  }

  /** MultiPointHitbox.Intersects（MultiPointHitbox.cs:26-38）：目标盒 ±8px 膨胀后
   *  含任一 bolt 点 → 命中。逐敌结算（crit/击退/StatusNPC 同 dealContacts 管线；
   *  1117 local 免疫 −1 / 1122 IDStatic 10） */
  private damageAlongBolt(game: GameHooks, bolt: Bolt): void {
    const cd = this.sharedCd ?? this.hitCd;
    cd.tick();
    const pts = bolt.positions;
    for (const ent of game.enemies()) {
      const e = ent as unknown as HitTarget & { vanillaId?: number };
      if (!e || e.dead) continue;
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;
      // 膨胀盒含点判定（BoundingRect 粗筛省略——敌量小,逐点直测）
      let hit = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x >= e.x - 8 && p.x < e.x + e.w + 8 && p.y >= e.y - 8 && p.y < e.y + e.h + 8) {
          hit = true; break;
        }
      }
      // 1117 附加爆炸域（Colliding :15955-15961 localAI[0]==1 → myRect.Inflate(60)；
      // 64×64 爆炸矩形为其子域）——本仓 localAI 恒按"未撞块"档处理
      if (!hit && this.projId === 1117 && !bolt.collidedWithTile) {
        hit = Math.abs(e.x + e.w / 2 - this.cx) <= 8 + 60 && Math.abs(e.y + e.h / 2 - this.cy) <= 8 + 60;
      }
      if (!hit) continue;
      if (!cd.ready(e.id, this.projId === 1122 ? 10 : -1)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      const kdir = Math.sign(e.x + e.w / 2 - this.cx) || 1;
      e.hurt(dmg, kdir * this.knockback, 0, game, this.armorPen, crit);
      // + 催化指环 6185（StatusNPC :11192-11196,玩家弹命中 398 300t）
      applyProjStatus(this.projId, ent as unknown as Record<string, number>,
        { catalystBand: ((game.player as unknown as { equipStats?: { catalystBand?: boolean } } | null)?.equipStats?.catalystBand) === true });
    }
  }

  /** Spawn_ArcLightning（P57:1245-1345）+ StormLightningParticle.EmitSpawnDust
   *  （:78-135）：沿线 278（1122 锚手档）/226（1117 天雷档）光尘双画 + 枪口/雷尾
   *  粒子 + Item15/ArcSurge(Item_203) 双音。bolt 折线本体由 draw() 波前扫掠呈现。 */
  private emitBoltFx(game: GameHooks, bolt: Bolt): void {
    const pts = bolt.positions;
    if (pts.length < 2) return;
    const [r, g, b] = this.boltColor;
    const color = { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: 0 };
    // EmitSpawnDust（flag=AnchorToPlayerHand≥0 → 1122 档）：type 278、num4=Remap(
    // 线长,100,500,2,5)、num3=2、num=1.2、color×1.2；1117 档 type 226/num4=10/
    // num3=6/num=1。rotations=null → velocity=UnitY 回退（:103-106）
    const anchored = this.projId === 1122;
    const lineLen = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
    const num4 = anchored ? Math.max(2, Math.min(5, 2 + (lineLen - 100) * (5 - 2) / (500 - 100))) : 10;
    const velMul = anchored ? 1.2 : 1;
    const baseScale = anchored ? 0.7 : 0.4;
    const back = anchored ? 2 : 6;
    const dustType = anchored ? 278 : 226;
    const maxValue = Math.ceil(pts.length / num4);
    // 种子 RNG（EmitSpawnDust :80 new LCG32Random(seed)——与折线同种子独立流）
    const rng = new LCG32(this.seed >>> 0);
    for (let i = 5; i < pts.length - 5; i++) {
      if (rng.next(maxValue) !== 0) continue;
      const p = pts[i];
      const spd = (3 + rng.nextFloat() * 6.5) * velMul;
      const d = game.spawnDust?.(p.x, p.y, 0, 0, dustType, 0, spd, 0, color, baseScale + rng.nextFloat() * 0.5);
      if (d) {
        d.x = p.x; d.y = p.y;                    // NewDustPerfect（:107）
        d.vx = 0; d.vy = spd;                    // velocity=UnitY×spd
        d.fadeIn = 0;
        d.noGravity = true;
        d.noLight = true; d.noLightEmittance = true;   // steadyLight（:115-118）
        d.x -= d.vx * back; d.y -= d.vy * back;        // position −= velocity×num3
        const d2 = game.vanillaDust?.clone(d);         // CloneDust 白核副画（:124-132）
        if (d2) {
          if (anchored) { d2.vx = d.vx; d2.scale = d.scale * 0.66; d2.color = { r: 255, g: 255, b: 255, a: 0 }; }
          else { d2.vx *= 0.5; d2.scale -= 0.3; }
        }
      }
    }
    // 枪口光斑 + 雷尾电弧（FadingParticle/RandomizedFrameParticle 916 帧近似——
    // 本仓粒子池无 916 贴图帧链,用加算火花近似形态）
    const hand = this.handAnchor(game);
    const end = pts[pts.length - 1];
    game.spawnParticles(hand.x, hand.y, this.projId === 1117 ? '#3C78FF' : '#FF3C3C', 6, 1.6,
      { life: 14, grav: 0, damp: 0.9 });
    game.spawnParticles(end.x, end.y, this.projId === 1117 ? '#3C78FF' : '#FF3C3C', 10, 2.4,
      { life: 20, grav: 0, damp: 0.92 });
    // 双音效（:1306-1307）：Item15 + ArcSurge=LegacySoundStyle(2,203)=Item_203.wav,
    // 后者 pitch=NextFloatDirection×0.2−0.05、vol 0.6
    game.playSfxWav?.('Item_15', 1, hand.x, hand.y);
    game.playSfxWav?.('Item_203', 0.6, hand.x, hand.y, (Math.random() * 2 - 1) * 0.2 - 0.05);
  }

  /** StormLightningDrawer（:69-115）Canvas 折线近似：逐段梯形带 + 波前扫掠 α。
   *  StripWidth：w×Remap(s,0.5,1,1,0.5)×Remap(progress,0.5,1,1,0.5)(+taperEnd)；
   *  StripColors：waveIn×waveOut 双波门（ArcSurge 参数 :57-67）。加算合成。 */
  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    if (this.bolt && this.visualT > 0) {
      const progress = 1 - this.visualT / this.visualTotal;
      this.drawBolt(ctx, this.bolt, 1, progress);
    } else {
      // 飞行期本体贴图（:40450-40455 光强包络近似亮度）
      const img = projSprite(this.projId);
      const T = this.t / this.life;
      const glow = Math.sqrt(Math.max(0, 1 - Math.pow(2 * Math.min(1, T / 0.5) - 1, 2))) * 0.3 + 0.4;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, glow));
      ctx.translate(this.cx, this.cy);
      ctx.imageSmoothingEnabled = false;
      if (img && img.width > 0) {
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      } else {
        ctx.fillStyle = this.projId === 1117 ? '#3C78FF' : '#FF3C3C';
        ctx.fillRect(-8, -24, 16, 48);
      }
    }
    ctx.restore();
  }

  private drawBolt(ctx: CanvasRenderingContext2D, bolt: Bolt,
    intensity: number, progress: number): void {
    const pts = bolt.positions;
    if (pts.length < 2) return;
    const W = 12;                                          // Prepare width 12f
    // StripColors（:93-102）：ArcSurge 参数 FadeStart 0.1/FadeMid 0.4/FadeEnd 1/
    // Final 0.3 + 波前 In 0.3/Out 0.5/Length 0.3
    const opacity = remapL(progress, 0.1, 0.4, 0.5, 1) * remapL(progress, 0.4, 1, 1, 0.3);
    const waveIn = Math.min(1, Math.max(0, progress / 0.3));
    const waveOut = Math.min(1, Math.max(0, (progress - (1 - 0.5)) / 0.5));
    const taperEnd = bolt.progressRange.max < 1;
    const [cr, cg, cb] = this.boltColor;
    const range = bolt.progressRange;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = range.min + (range.max - range.min) * (i / (pts.length - 1));
      const s1 = range.min + (range.max - range.min) * ((i + 1) / (pts.length - 1));
      // 波前双门（WaveTransition :88-91）
      const a0 = waveGate(s0, waveIn, 0.3, 0, 1) * waveGate(s0, waveOut, 0.3, 1, 0);
      const a1 = waveGate(s1, waveIn, 0.3, 0, 1) * waveGate(s1, waveOut, 0.3, 1, 0);
      if (a0 <= 0.004 && a1 <= 0.004) continue;
      const w0 = stripWidthAt(s0, W, progress, taperEnd, bolt) * intensity;
      const w1 = stripWidthAt(s1, W, progress, taperEnd, bolt) * intensity;
      const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
      const l = Math.hypot(dx, dy) || 1;
      const px = -dy / l, py = dx / l;
      const am = (a0 + a1) / 2 * opacity;
      if (am <= 0.004) continue;
      ctx.fillStyle = `rgba(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0},${Math.min(1, am).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(pts[i].x + px * w0 / 2, pts[i].y + py * w0 / 2);
      ctx.lineTo(pts[i + 1].x + px * w1 / 2, pts[i + 1].y + py * w1 / 2);
      ctx.lineTo(pts[i + 1].x - px * w1 / 2, pts[i + 1].y - py * w1 / 2);
      ctx.lineTo(pts[i].x - px * w0 / 2, pts[i].y - py * w0 / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** StripWidth（:104-115）单点宽度 */
function stripWidthAt(s: number, width: number, progress: number,
  taperEnd: boolean, bolt: Bolt): number {
  let w = width;
  w *= remapL(s, 0.5, 1, 1, 0.5);
  w *= remapL(progress, 0.5, 1, 1, 0.5);
  if (taperEnd) {
    w *= remapL(bolt.progressRange.max - s, 0.1, 0, 1, bolt.isMainBolt ? 0.5 : 0);
  }
  return Math.max(0.5, w);
}

/** WaveTransition（:88-91）＝Remap(progressOnStrip, lerp(−len,1,waveProgress),
 *  lerp(0,1+len,waveProgress), to, from) */
function waveGate(s: number, waveProgress: number, len: number, from: number, to: number): number {
  const a = -len + (1 + len) * waveProgress;
  const b = 0 + (1 + len) * waveProgress;
  return remapL(s, a, b, to, from);
}

/** Utils.Remap（clamp 版,本文件局部用——LightningGenerator.remap 不导出重复） */
function remapL(fromValue: number, fromMin: number, fromMax: number,
  toMin: number, toMax: number): number {
  const t = Math.min(1, Math.max(0, (fromValue - fromMin) / ((fromMax - fromMin) || 1e-9)));
  return toMin + (toMax - toMin) * t;
}

// ================= 1115 冰川之牙蓄力弹（AI_208_GlacierFangShot） =================

/** 6153 GlacierFang（channel 蓄力,Item.cs:47423-47434 channel=true）出手即生成挂手弹,
 *  AI_208（:37576-37750）两态：
 *  - 蓄力态（ai1==0）：挂玩家 RotatedRelativePoint(MountedCenter)、每 3t 朝鼠标转向
 *    （速 Remap(ai0,0,60,4,15)）、每 20t 播 GlacierFang_Charging + CheckMana 扣蓝
 *    （ai0≤60）、ai0 += GetSlowMagicUseRate()（1.0 常态/0.4 空蓝,Player.cs:47434-47442）；ai0≥60 强制松手（:37628）
 *  - 释放态（ai1==1 首帧）：伤 ×Remap(charge,0,60,1,4)、kb ×4、penetrate 1→3、
 *    Muzzle 音 + 15 组尘；此后 extraUpdates 1-2、重力 Remap(charge,0,45,0.15,0.025)
 *    钳 vy 16、tileCollide=true
 *  - 帧 0/1/2 按 charge 20/40 分档；蓝光 (0.2,0.5,0.8)×Remap(charge,0,60,0.5,1)
 *  - SetDefaults（:10468-10480）：10×10、usesLocalNPCImmunity + cooldown −1 */
export interface GlacierFangCtl {
  /** Player.channel 电平（按住蓄力）+ 死亡/CC 门 */
  channel: () => boolean;
  /** 当前鼠标世界坐标 */
  aim: () => { x: number; y: number };
  /** CheckMana(pay:true)（每 20t 蓄力扣蓝；ManaV2 蓝不足照充） */
  payMana: () => void;
  /** GetSlowMagicUseRate()（1.0 正常 / 0.4 空蓝过载,Player.cs:47434-47442） */
  chargeRate: () => number;
}

export class GlacierFangShot extends Entity {
  w = 10; h = 10;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 1115;
  private charge = 0;        // ai[0]
  private released = false;  // ai[1]==1
  private frame = 0;
  private hitCd = new HitCdImpl();
  private ctl: GlacierFangCtl;

  constructor(x: number, y: number, dirX: number, dirY: number, damage: number, knockback: number, ctl: GlacierFangCtl) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    const n = Math.hypot(dirX, dirY) || 1;
    this.vx = dirX / n * 4; this.vy = dirY / n * 4;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    this.ctl = ctl;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player;
    if (!this.released) {
      // ---- 蓄力态（:37579-37630）----
      if (!this.ctl.channel() || this.charge >= 60) {
        this.release(game, p);
        return;
      }
      // channel 蓄力期用魔动画续期（Player.cs:43143-43146 itemAnimation 持续>0 每帧
      // ItemCheck_ApplyManaRegenDelay → delay 钉 4 = 全程 5% 滴流回蓝；2026-08-22
      // 审计 ❌ 修复——蓄力最长 60 拍(慢施 ÷2.5=150t)远超 useTime,不续期则白嫖魔力）
      p.onChannelManaHold?.();
      const m = this.ctl.aim();
      // 挂手：RotatedRelativePoint(MountedCenter) − Size/2（:37587）
      this.x = p.cx - this.w / 2;
      this.y = p.cy - this.h / 2;
      if (Math.floor(this.charge) % 3 === 0) {
        const spd = 4 + (15 - 4) * Math.min(1, Math.max(0, this.charge / 60));   // Remap(ai0,0,60,4,15)
        const d = Math.hypot(m.x - p.cx, m.y - p.cy) || 1;
        this.vx = (m.x - p.cx) / d * spd;
        this.vy = (m.y - p.cy) / d * spd;
      }
      if (Math.floor(this.charge) % 20 === 0 && this.charge > 0) {
        // R4-37：GlacierFang_Charging=Item_210（Projectile.cs:37610-37613 soundDelay=20 节拍;
        // 文件级音量 ×0.35=LegacySoundPlayer.cs:579 case210,FILE_CASE_VOL 自动生效）
        game.playSfxWav?.('Item_210', 1, this.cx, this.cy);
        this.ctl.payMana();                                    // CheckMana(pay:true)（:37613）
      }
      this.charge += this.ctl.chargeRate();                    // ai[0] += GetSlowMagicUseRate()（:37626）
      game.addLightAt?.(this.cx, this.cy, 0.1, 0.25, 0.4);
      if (Math.random() < 0.34) {
        game.spawnParticles(this.cx, this.cy, '#BFE8FF', 1, 1, { life: 16, grav: 0, damp: 0.92 });
      }
      return;
    }
    // ---- 释放态（:37632-37664）----
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15 + (0.025 - 0.15) * Math.min(1, Math.max(0, this.charge / 45));  // Remap(ai0,0,45,0.15,0.025)
    if (this.vy > 16) this.vy = 16;
    // 撞实心 → 消亡（tileCollide=true :37644）
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) {
      game.spawnParticles(this.cx, this.cy, '#BFE8FF', 8, 2.4, { life: 20, grav: 0.04, damp: 0.94 });
      this.dead = true;
      return;
    }
    game.addLightAt?.(this.cx, this.cy, 0.2, 0.5, 0.8);
    dealContacts(this, game, this.hitCd, -1);
  }

  /** 释放帧（:37632-37660）：伤 ×Remap(charge,0,60,1,4)/kb ×4/pen 1→3（pen 通道
   *  在本类 cooldown −1 已等价"每敌一次",×3 穿透档登记）+ 出膛抖动 */
  private release(game: GameHooks, p: { cx: number; cy: number }): void {
    this.released = true;
    const c = Math.min(1, Math.max(0, this.charge / 60));
    if (this.charge >= 10) {                                   // ai[0]<10 → num5=0（:37638-37640）
      this.damage = Math.max(1, Math.round(this.damage * (1 + 3 * c)));
      this.knockback *= 4;
    } else {
      this.knockback *= 1;
    }
    // 出膛抖动（:37641）+ 无 LOS 门消亡（:37652-37654）
    const jx = (Math.random() * 2 - 1) * (1 - c);
    const jy = (Math.random() * 2 - 1) * (1 - c);
    this.vx += jx; this.vy += jy;
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { this.dead = true; return; }
    void p;
    // R4-37：GlacierFang_Muzzle=Item_201 pitch+0.2（Projectile.cs:37634 PlaySound(...,0.2f)）
    game.playSfxWav?.('Item_201', 1, this.cx, this.cy, 0.2);
    game.spawnParticles(this.cx, this.cy, '#BFE8FF', 10, 2.6, { life: 20, grav: 0, damp: 0.93 });
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(1115);
    this.frame = this.charge >= 40 ? 2 : this.charge >= 20 ? 1 : 0;   // :37666-37672
    ctx.save();
    ctx.globalAlpha = this.released ? 1 : 0.9;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const fh = img.height / 3;
      ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
        -img.width / 2, -fh / 2, img.width, fh);
    } else {
      ctx.fillStyle = '#8FD8FF';
      ctx.fillRect(-5, -14, 10, 28);
    }
    ctx.restore();
  }
}

// ================= 1128/1129 生成器（SpawnChlorophyteSporeCloud :42616-42733 纯函数） =================

/** FindChlorophyteSporeCloudSpawn（:42565-42590）：从刃尖前方格起,朝出手反侧扫 5 格
 *  （velocity.X>0 → i∈[−5,0] 否则 [0,5]）×竖 [−2,2],找"solid 且上格非 solid"的台面,
 *  取距候选点最近者 → 落点 = (台面格中心, 台面顶 −8)。找不到返回 null。 */
export function findSporeCloudSpawn(
  st: { inBounds(x: number, y: number): boolean; isSolid(x: number, y: number): boolean },
  tipX: number, tipY: number, dirX: number,
): { x: number; y: number } | null {
  const tx0 = Math.floor(tipX / TILE);
  const ty0 = Math.floor(tipY / TILE);
  const iLo = dirX > 0 ? -5 : 0;
  const iHi = dirX > 0 ? 0 : 5;
  let best: { x: number; y: number } | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = iLo; i <= iHi; i++) {
    for (let j = -2; j <= 2; j++) {
      const tx = tx0 + i, ty = ty0 + j;
      if (!st.inBounds(tx, ty) || !st.inBounds(tx, ty - 1)) continue;
      if (st.isSolid(tx, ty) && !st.isSolid(tx, ty - 1)) {
        const sx = tx0 * TILE + 8;
        const sy = ty * TILE - 8;
        const d = Math.hypot(tipX - sx, tipY - sy);
        if (d < bd) { bd = d; best = { x: sx, y: sy }; }
      }
    }
  }
  return best;
}

export interface SporeCloudSpawnCtx {
  /** NewProjectile 1128（Game 注入 entities.add） */
  spawnCloud: (x: number, y: number, vx: number, vy: number, dmg: number) => void;
  /** NewProjectile 1129（大爆炸盒 128×96,伤 ×1） */
  spawnSlam: (x: number, y: number, dmg: number) => void;
  /** 该玩家在场 1128 计数（ownedProjectileCounts[1128],衰减掷 :42633） */
  ownedClouds: () => number;
  /** SoundID.Item167（:42732） */
  playSlamSound: (x: number, y: number) => void;
  /** 尘（KillTile_GetTileDustAmount×6 近似——每台面 6 颗） */
  dust: (x: number, y: number) => void;
}

/** SpawnChlorophyteSporeCloud 1:1（:42616-42733）：以台面格为锚,横向扫 5 格（出手侧）
 *  ×竖 ±2 的"solid 且上空"台面;每列统计台面数 num3,每台面撒 num3==1?2:1 颗 1128,
 *  每颗掷 Remap(owned[1128],10,100,1,0.2) 通过率;速度 = (±0.25vx + dir×4×rand,
 *  rand(−45,0)×0.1×2.3);任一台面出孢子 → 刃尖前 1129 大爆炸（128×96,伤 ×1）+Item167。 */
export function spawnChlorophyteSporeCloud(
  st: { inBounds(x: number, y: number): boolean; isSolid(x: number, y: number): boolean },
  spawnX: number, spawnY: number, velX: number, playerDir: number,
  bladeDmg: number, ctx: SporeCloudSpawnCtx,
): void {
  const tx0 = Math.floor(spawnX / TILE);
  const ty0 = Math.floor(spawnY / TILE);
  const xLo = velX > 0 ? tx0 - 5 : tx0;
  const xHi = velX > 0 ? tx0 : tx0 + 5;
  const rate = 1 + (0.2 - 1) * Math.min(1, Math.max(0, (ctx.ownedClouds() - 10) / 90));  // Remap(owned,10,100,1,0.2)
  let any = false;
  for (let i = xLo; i <= xHi; i++) {
    let platforms = 0;
    for (let j = -2; j <= 2; j++) {
      if (st.inBounds(i, ty0 + j) && st.inBounds(i, ty0 + j - 1)
        && st.isSolid(i, ty0 + j) && !st.isSolid(i, ty0 + j - 1)) platforms++;
    }
    for (let j = -2; j <= 2; j++) {
      const ty = ty0 + j;
      if (!st.inBounds(i, ty) || !st.inBounds(i, ty - 1)) continue;
      if (!st.isSolid(i, ty) || st.isSolid(i, ty - 1)) continue;
      ctx.dust(i * TILE + 8, ty * TILE);
      const per = platforms !== 1 ? 1 : 2;                    // :42700 num6
      for (let n = 0; n < per; n++) {
        if (Math.random() > rate) continue;                   // :42703 掷
        const lo = -0.25 * velX;
        const hi = 0.25 * velX - lo;
        let vx = Math.random() * hi + lo;                     // :42706-42708
        vx += playerDir * 4 * Math.random();                  // :42709
        const vy = Math.random() * -45 * 0.1 * 2.3;           // :42710-42711（rand(−45,0)×0.1×2.3）
        ctx.spawnCloud(i * TILE + Math.random() * 12 + 4, ty * TILE - (4 * n - 4),
          vx, vy, bladeDmg * 0.75);
        any = true;
      }
    }
  }
  if (any) {
    // :42721-42731 大爆炸位 = 刃尖向 ×(81−16) −(112/±48 修正) −Y48——按台面锚近似
    const sx = spawnX + (velX > 0 ? -112 + 48 : -48);
    ctx.spawnSlam(sx, spawnY - 48, bladeDmg);
    ctx.playSlamSound(spawnX, spawnY);
  }
}

/** LOS 门（canHit 转发,供 Game 侧索敌复用） */
export { canHit };
