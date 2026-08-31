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
import { BuffType } from '../stats/Buffs';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { TILE } from '../core/constants';
import { projectileData } from '../data/vanillaProjectiles';
import { canHit } from '../physics/LineOfSight';
import { playerCanHitEnemy, applyBannerDamageDealt } from './projTargets';
import { damageVarRoll } from '../stats/DamageVar';
import { applyProjStatus } from './projStatus';
import { mainDifficulty, sampleCurve, remap, GDL, f32, type CurveKey } from '../stats/ScaleStats';
import { ITEM_BY_KEY } from '../data/items';
import { projSprite } from './Arrow';
import { LCG32, arcSurgeWeaponGenerator, lightningStrikeWeaponGenerator,
  type Bolt, stormLightningGenerator } from '../fx/LightningGenerator';

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

/** ★StormLightning shader 的 Extra_288 亮度 LUT（用户实拍"颜色不对且很暗"定罪）：
 *  原版 PixelShader.cso pass StormLightning（反汇编 /tmp/fx-dump-storm.txt :3181）：
 *    texld r0, (t0.x, t0.y/t0.z), s0 → r0.x ×8 ×uOpacity ×uSaturation ×vColor → oC0
 *  = 最终色=顶点色×(Extra_288.r×8×包络×强度)。Extra_288 为 256² 纵向梯度带
 *  （y=128 峰值 250→×8 过曝白热芯；上下暗→蓝辉光边）——条带横向 v 采样出
 *  "白芯蓝边"截面。曾平色 rgba 填充=无电纹不发亮。LUT 惰性构建（atlas 懒加载） */
let stormTexLut: Float32Array | null = null;
let stormTexTried = false;
function stormTexBrightness(r: import('../render/Renderer').Renderer, v: number): number {
  if (!stormTexTried) {
    stormTexTried = true;
    try {
      const img = r.atlas?.ensureVImage('vanilla/Extra_288.png');
      if (img && img.width > 0 && typeof document !== 'undefined') {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        if (cx) {
          cx.drawImage(img as CanvasImageSource, 0, 0);
          const d = cx.getImageData(0, 0, img.width, img.height).data;
          const lut = new Float32Array(img.height);
          for (let y = 0; y < img.height; y++) {
            let acc = 0;
            for (let x = 0; x < img.width; x++) acc += d[(y * img.width + x) * 4];
            lut[y] = acc / img.width / 255;
          }
          stormTexLut = lut;
        }
      }
    } catch { /* 图集未就绪/CORS——回退平色 */ }
  }
  if (!stormTexLut) return 0.5;
  return stormTexLut[Math.min(stormTexLut.length - 1, Math.max(0, (v * stormTexLut.length) | 0))];
}

/** usesIDStaticNPCImmunity 型级共享免疫表：Projectile.perIDStaticNPCImmunity[
 *  immunityIdentity, npcIndex] 按 GameUpdateCount 到期（Projectile.cs:606-611 +
 *  :784 immunityIdentity 缺省=type）——全场【同型】一张表，衰减与「正在结算的弹数」
 *  无关。墙钟实现（Arrow.idStaticCheck 先例同构）：ready() 到期即写新窗。
 *  ★账 L2 配套：1128 曾用每弹一张 HitCd(30)=N 颗云同拍 N 连击且 N 倍加速衰减。 */
class IdStaticSharedTable {
  private m = new Map<number, number>();
  constructor(private readonly cooldownMs: number) {}
  /** dealContacts 循环头调用位——时间驱动衰减,无需逐弹递减 */
  tick(): void {}
  ready(id: number, _cooldown?: number): boolean {
    const now = Date.now();
    if ((this.m.get(id) ?? 0) > now) return false;
    this.m.set(id, now + this.cooldownMs);
    if (this.m.size > 512) {
      for (const [k, v] of this.m) if (v <= now) this.m.delete(k);
    }
    return true;
  }
}

/** 1 tick 的毫秒当量（vanilla 60fps——「cooldown 10t≈167ms」的换算基数） */
const TICK_MS = 1000 / 60;

/** 1122 ArcSurge（usesIDStaticNPCImmunity + idStaticNPCHitCooldown=10 :10567-10569
 *  段;Kill 帧 localAI[0]=2 :71924） */
const ID_STATIC_1122_TABLE = new IdStaticSharedTable(10 * TICK_MS);

/** 1128 孢子云（usesIDStaticNPCImmunity + idStaticNPCHitCooldown=30 :10574-10575）——
 *  全场同型一张 30t 窗：多颗云同拍扑同敌只结算一颗 */
const ID_STATIC_1128_TABLE = new IdStaticSharedTable(30 * TICK_MS);

// ================= L1 GameMode 难度乘区正解（风暴家 EVP/PVE 双轴） =================

/** LightningPlayerDamageScaling（GameDifficultyData.cs:71；**曲线键在 Main.Difficulty
 *  浮点轴上**,非 GameMode int——Main.Difficulty getter Main.cs:2783-2809:
 *  Classic→GameDifficultyLevel.Classic(1)/Expert→Expert(2)/Master→Master(3)/
 *  Journey→【不进 Expert/Master 分支】=Classic 值 1.0,仅被旅程"给 NPC 强度"滑杆
 *  (_gameModeDifficultyOverride)+FTW 种子 +1 抬档）。1091 SetDefaults :10186
 *  `hostileDamageScaling = LightningPlayerDamageScaling` 接线本表 */
export const LIGHTNING_PLAYER_DAMAGE_SCALING: readonly CurveKey[] = [
  { input: GDL.JOURNEY, output: 0.04 },
  { input: GDL.CLASSIC, output: 0.08 },
  { input: GDL.MASTER, output: 0.24 },
  { input: GDL.LEGENDARY, output: 0.4 },
];

/** 玩家侧终值 = DamageVar(base,-luck) × curve(Difficulty) ×2 ×死囚毛衣(trap ×0.5 帽300)
 *  ——Damage_EVP 全序（Terarria1458/Terraria/Projectile.cs:14905-14922；
 *  1457 同段 :14905-14922）：`(int)num3` 截断逐级,banner/resistCold 两步对 1091 无源
 *  （bannerIdToRespondTo=0 / coldDamage=false）跳过;1091 trap=true、reflected=false。
 *  所得 <1 由 Player.Hurt 丢弃,此处不强钳 */
export function lightningEvpFinalDamage(
  base: number,
  difficultyFloat: number,
  o: { luck?: number; sweater?: boolean; rnd?: () => number } = {},
): number {
  let dmg = damageVarRoll(base, -(o.luck ?? 0), o.rnd);            // :14905 幸运方差项(取负!)
  // (int)((float)num3 * Sample)——乘积按 float32 求值再截断（100×.08f=8.0f 而非双精度 7.9999→7）
  dmg = Math.trunc(f32(f32(dmg) * sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, difficultyFloat)));   // :14916 (int)
  dmg *= 2;                                                        // :14917-14918 num4=2
  if (o.sweater) {                                                 // :14919-14922 死囚毛衣:trap 减半+帽 300
    dmg = Math.trunc(f32(f32(dmg) * 0.5));
    dmg = Math.min(dmg, 300);
  }
  return dmg;
}

/** NPC 侧乘区（:14632 `if (type == 1091) num *= Utils.Remap(Main.Difficulty,
 *  GameDifficultyLevel.Classic, Master, 1f, 3f)`;1457 :14632 同值）——Remap 默认 clamp,
 *  D≥3 钉 3（ legendary 不外推） */
export function lightningNpcMultiplier(difficultyFloat: number): number {
  return remap(difficultyFloat, GDL.CLASSIC, GDL.MASTER, 1, 3);
}

// ================= 地形/液体/装备槽小工具（A① 导通链 + L1 连带消费位） =================

/** Main.tile[x,y].liquid != 0（StormLightningLiquidCollisionCheck 谓词 :16237-16242）
 *  ——tile 中心像素采样 World.liquidAt（0-255 原始液体量） */
function tileHasLiquid(game: GameHooks, tx: number, ty: number): boolean {
  const w = game.world as unknown as { liquidAt?: (px: number, py: number) => number };
  if (typeof w.liquidAt !== 'function') return false;
  return w.liquidAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) > 0;
}

/** Utils.PlotLine int 重载 1:1（Utils.cs:2359-2415,Bresenham,jump=true 缺省;visit 返回
 *  false 即短路报 false）——A① 液体导通链与电化粒子两用 */
function plotTiles(
  x0: number, y0: number, x1: number, y1: number,
  visit: (x: number, y: number) => boolean,
): boolean {
  if (x0 === x1 && y0 === y1) return visit(x0, y0);
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  let ax = x0, ay = y0, bx = x1, by = y1;
  if (steep) { [ax, ay] = [ay, ax]; [bx, by] = [by, bx]; }
  let acc = Math.abs(bx - ax) / 2;
  let cur = ay;
  const dxT = Math.abs(bx - ax), dyT = Math.abs(by - ay);
  const incX = ax < bx ? 1 : -1, incY = ay < by ? 1 : -1;
  for (let i = ax; i !== bx; i += incX) {
    if (!visit(steep ? cur : i, steep ? i : cur)) return false;
    acc -= dyT;
    if (acc >= 0) continue;
    cur += incY;
    acc += dxT;
  }
  return true;
}

/** Utils.PlotTileLine 的切格面实现（Utils.cs:283-320：中心线步进+法向厚度带全覆盖,
 *  局部 tile 内含外沿一格）——aiStyle190/191 旋转厚带与 1127 突刺共用。
 *  A⑤ 转正：旧"三采样窗(端+中)"近似退役——PlotTileLine 是【连续带】,三窗漏中段草。 */
function cutThickTileLine(
  game: GameHooks, x0: number, y0: number, x1: number, y1: number, width: number,
): void {
  const minTx = Math.floor(Math.min(x0, x1) / TILE), maxTx = Math.floor(Math.max(x0, x1) / TILE);
  const minTy = Math.floor(Math.min(y0, y1) / TILE), maxTy = Math.floor(Math.max(y0, y1) / TILE);
  const segLen = Math.hypot(x1 - x0, y1 - y0) || 1;
  const bandR = width / 2 + 8;          // 带半径 + 8px 窗沿(PlotTileLine 部分覆盖邻格同型)
  for (let tx = minTx; tx <= maxTx; tx++) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      // 点(tile 中心)到线段距离 ≤ bandR → 在带内
      const px = (tx + 0.5) * TILE, py = (ty + 0.5) * TILE;
      const t = Math.min(1, Math.max(0, ((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / (segLen * segLen)));
      const qx = x0 + (x1 - x0) * t, qy = y0 + (y1 - y0) * t;
      if (Math.hypot(px - qx, py - qy) <= bandR) game.cutTile(tx, ty);
    }
  }
}

/** 死囚毛衣（Dead Man's Sweater 5007）佩戴态：Player.deadMansSweater(:2087,armorPiece
 *  switch :13226-13228 只扫功能槽 armor[0..9])。equipStats 未建此键（projTargets GAP 登记项),
 *  就近读装备槽 vid;vid 表查不到（注册缺失）按未戴处理 */
function playerDeadMansSweater(game: GameHooks): boolean {
  const p = game.player as unknown as { inv?: { armor?: Array<{ id?: number } | null> } };
  const armor = p?.inv?.armor;
  if (!Array.isArray(armor)) return false;
  const n = Math.min(10, armor.length);
  for (let i = 0; i < n; i++) {
    const slot = armor[i];
    if (!slot || slot.id == null) continue;
    if (slot.id === DEAD_MANS_SWEATER_ID) return true;
  }
  return false;
}

/** 死囚毛衣本仓 item id（vi_5007 → 内部 id;注册缺失时 NaN → 消费恒 false） */
const DEAD_MANS_SWEATER_ID = ITEM_BY_KEY['vi_5007_dead_man_s_sweater'] ?? NaN;

/** 敌怪最小命中面（Enemy/TownNPC 共用形状） */
interface HitTarget {
  x: number; y: number; w: number; h: number;
  id: number;
  dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number, srcProjId?: number) => boolean;
}

/** 通用命中结算：盒相交 → 暴击掷 → hurt + StatusNPC + 飘字。
 *  cooldown<0 = 每敌一次（localNPCHitCooldown −1）；返回是否命中过。
 *  gate：ownerHitCheck 距离门（CanHitWithMeleeWeapon :12415-12417 距离段）+
 *  usesOwnerMeleeHitCD 共享命中表（Damage_PVE :12596 门 + StrikeNPC :14343 写——
 *  与玩家挥击弧共用 per-enemy 命中表，同一挥击内弧+弹不双结算）。 */
function dealContacts(
  self: { x: number; y: number; w: number; h: number; cx: number; cy: number; damage: number; knockback: number; armorPen: number; critChance: number; projId: number },
  game: GameHooks,
  cd: HitCdImpl | IdStaticSharedTable,
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
    // ★F11：蓄能暴击强制面（TryConsumingTimerCrit，Damage_PVE :12928 同位）
    const crit = Math.random() < self.critChance
      || ((game.player as unknown as { tryConsumingTimerCrit?: (g: unknown, x: number, y: number, w: number, h: number) => boolean } | null)?.tryConsumingTimerCrit?.(game, e.x, e.y, e.w, e.h) ?? false);
    // ★F1（2026-08-31 蓝队三批）：Damage_PVE :13388 攻端旗乘区 + ★F9 DamageVar 单源
    //   （原版序：DamageVar(:12959) → …→ banner(:13388) → armorPen 弹侧 :13679 在
    //   banner 后 ⇒ 不吃旗乘——armorPen 独立参传，此处序一致）。
    //   crit 翻倍沿用仓内调用侧预倍惯例（与 Enemy.hurt 内 (int)Math.Max(1,×2)
    //   截断式同值）。
    let dmg = damageVarRoll(self.damage,
      ((game.player as unknown as { luck?: number } | null)?.luck) ?? 0);
    dmg = applyBannerDamageDealt(game, e, dmg);
    dmg *= crit ? 2 : 1;
    const kdir = Math.sign((e.x + e.w / 2) - self.cx) || 1;
    // srcProjId 尾参：on-hit 产出弹族经 TryDoingOnHitEffects 排除表断 OnHit 链
    e.hurt(dmg, kdir * self.knockback, 0, game, self.armorPen, crit, 0, true, 0, self.projId);   // 音/飘值=单点;fromPlayer=DPS 计(Projectile.cs:13709)
    // + 催化指环 6185（StatusNPC :11192-11196,玩家弹命中 398 300t;同 Arrow.ts:3260 先例）
    applyProjStatus(self.projId, ent as unknown as Record<string, number>,
      { catalystBand: ((game.player as unknown as { equipStats?: { catalystBand?: boolean } } | null)?.equipStats?.catalystBand) === true });
    // 命中回写共享表（StrikeNPC :14343 SetMeleeHitCooldown——玩家挥击弧同帧不再结算）
    gate?.sharedHits?.add(e.id);
    onHit?.(ent as unknown as HitTarget);
  }
}

/** 弹体 CutTiles 助手已迁至 ProjCutTiles.ts（全仓单点——Monk/SkyDragon 族同用） */
import { cutTilesBox } from './ProjCutTiles';

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
    // CutTiles（aiStyle190||191 线支 :15341-15343）：PlotTileLine(Center+v(rot−π/4)*60*scale,
    // Center+v(rot+π/4)*60*scale, width=60×scale)——★A⑤ 转正：带状全扫（cutThickTileLine）
    // 替换旧"端+中三采样窗"近似,中段草再不漏砍
    {
      const r60 = 60 * this.itemScale;
      const a0 = this.rot - Math.PI / 4, a1 = this.rot + Math.PI / 4;
      cutThickTileLine(game,
        this.cx + Math.cos(a0) * r60, this.cy + Math.sin(a0) * r60,
        this.cx + Math.cos(a1) * r60, this.cy + Math.sin(a1) * r60,
        r60);
    }
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
    // CutTiles（802/842/938-945/1127 线支 :15326-15331）：PlotTileLine(Center,
    // Center+SafeNormalize(velocity,−UnitY)×88f, width=10×scale)——★A⑤ 转正：
    // 全程带扫替换旧"单点刃尖"近似
    {
      const vl = Math.hypot(this.dx * this.spd, this.dy * this.spd) || 1;
      const cdx = vl > 0.001 ? (this.dx * this.spd) / vl : 0;   // SafeNormalize(−UnitY 回退)
      const cdy = vl > 0.001 ? (this.dy * this.spd) / vl : -1;
      cutThickTileLine(game, this.cx, this.cy, this.cx + cdx * 88, this.cy + cdy * 88, 10);
    }
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
 *  - ai[1] = 出生传入寿命：挥击尾孢子 90+rand(60)/砸地大云缺省 0 → num796=220（:33171）
 *  - ★L2 转正（三处,锚 Terarria1458 P.cs,1457 同值）：①`ai[0]++; if(ai[1]>=1f) ai[0]+=2f`
 *    （AI_92 :33167-33170）——尾孢子每拍老去 3 帧即【1/3 实效寿命】;②Damage_CanDealDamage
 *    :12463 `(type==1128 && ai[1]>=1f)` → 尾孢子纯视觉零伤,只有 ai[1]==0 的砸地大云结算;
 *    ③免疫面 usesIDStaticNPCImmunity + idStaticNPCHitCooldown=30（SetDefaults :10574-10575,
 *    immunityIdentity 缺省=型 :784）→ 全场 1128 一张表（ID_STATIC_1128_TABLE）
 *  - scale = Remap(t/T,0,0.1,0.25,1.1)；盒 = 30×scale/1.1 居中回写（:33182-33188）
 *  - Opacity = Remap(T,0,0.25,0,1)×Remap(T,0.5,1,1,0)×0.75；vy −= 0.01（上飘）、×0.97
 *  - 同型互斥（:33268-33300 互推 0.005）；撞实心点反弹（简化=停,登记） */
export class ChloroSporeCloud extends Entity {
  damage: number;
  knockback = 0;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  dead = false;
  readonly projId = 1128;
  /** num796（:33173-33177 ai[1]==0 → 220） */
  private readonly life: number;
  /** ai[1] 原值（>=1 → 纯视觉零伤 + 老化 ×3;==0 → 结算云） */
  private readonly ai1: number;
  /** ai[0]（老化计数,步长 1 或 3） */
  private t = 0;
  private readonly spawnFrame = Math.floor(Math.random() * 5);   // :33149 frame=rand(frames)
  private hitCd = ID_STATIC_1128_TABLE;

  constructor(cx: number, cy: number, vx: number, vy: number, damage: number, life: number) {
    super();
    this.w = 30; this.h = 30;
    this.x = cx - this.w / 2; this.y = cy - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = Math.max(1, Math.round(damage));
    this.ai1 = life;
    this.life = life > 0 ? life : 220;                          // :33168 ai[1]==0 → 220
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.ai1 >= 1) this.t += 2;                             // :33168-33170 加速老化(尾孢子)
    if (this.t > this.life) { this.dead = true; return; }       // :33179-33183
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
    // ★L2②：ai[1]>=1 尾孢子 CanDealDamage=false → 不进 Damage()（零接触伤、零
    //   CritTimer 消费）;仅砸地大云（ai[1]==0）按 IDStatic 30t 共享窗结算
    if (this.ai1 < 1) dealContacts(this, game, this.hitCd, 30);
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

/** SpawnChlorophyteSporeCloud 尾段的砸地大爆炸伤害盒（SetDefaults :3346-3360 +
 *  AI_209 :70705-70715）：盒每拍回写 width=(int)ai[1]=128 / height=(int)ai[2]=96；
 *  timeLeft=5 → Update(:17308-17312) 5 拍即亡——ai[0]>20 的 Kill 是永不可达死代码
 *  （★A④ 勘误：曾按该死代码活到 21+ 拍=3 倍寿命窗）。usesLocalNPCImmunity + cooldown −1
 *  （每敌一次）;**ownerHitCheck=true（:3358）**→ Damage_PVE_Inner 走 CanHitWithMeleeWeapon
 *  :11896 门 = Distance(owner) > ownerHitCheckDistance(缺省 1000f,:306/:701) 即不结算
 *  ——隔墙/远端敌不吃大爆盒（★A④ 主缺口；LOS 四探针同 1126 登记近似只取距离段）。 */
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
    // ownerHitCheckDistance=1000 距离段门（CanHitWithMeleeWeapon :12416-12418;usesOwnerMeleeHitCD
    // 未开 → 不吃玩家挥击共享表,仅独立 local 免疫）
    const p = game.player as unknown as { cx?: number; cy?: number };
    const gate = (p && p.cx != null && p.cy != null)
      ? { ownerCx: p.cx, ownerCy: p.cy, maxDist: 1000 } : undefined;
    cutTilesBox(game, this.x, this.y, this.w, this.h);         // CutTiles（Damage() 内旁路先于结算,:12519/:15276;排除表无 1129）
    dealContacts(this, game, this.hitCd, -1, undefined, gate);
    if (this.t === 1) {
      game.spawnParticles(this.cx, this.cy, '#32C864', 16, 3.4, { life: 26, grav: -0.03, damp: 0.93 });
    }
    if (this.t >= 5) this.dead = true;                          // timeLeft=5（:3353）
  }

  draw(): void { /* alpha=255 原版本体不绘制（:3351） */ }
}

// ================= 1116 花瓣风暴弹（AI_196 1116 支） =================

/** 6154 Petalstorm 出手（Player.cs:48010-48026）每 use 3 瓣：
 *  v = NextVector2Circular(1,1)+NextVector2CircularEdge(3,2)（Y>0 取反）×2 + aim×2；
 *  ai0=−1 / ai1=(itemAnimation/itemAnimationMax×0.66+miscCounter)%1（相位）；
 *  出生点 = MountedCenter+(dir×15, gravDir×3)（挂墙则回 MountedCenter）。
 *  AI_196（:41192-41290）1116 支：光 (0,0.6,0.6)、alpha=Remap(timeLeft,30,0,0,255)、
 *  scale×0.75、索敌 400px【CanHit 视线门恒须——num4=0 时 !(dist>0) 恒假,:41257-41258,
 *  ★R34-① 勘误旧注「无 LOS 门」】、追踪 v=(v×30+dir×6)/31、无目标漂移
 *  vx→sin(ai0×0.1)×1.5 / vy→0.3；前 20t 减速 ×0.95（:41220-41227）;撞块软反弹 ×0.25
 *  （:18181-18191 单轴独立翻向——TileCollision 解算被挡轴置零后本支按轴重翻,
 *  另一轴照常推进;B1 转正）/penetrate=1 命中即亡/Kill 尘 306×4（:72202）。
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
    if (this.t >= this.life) { this.die(game); return; }        // timeLeft 120 → 120t 消亡
    if (++this.frameCounter >= 4) {                             // :41218-41223
      this.frameCounter = 0;
      this.frame = (this.frame + 1) % 8;
    }
    this.rot += (this.vx + this.vy) * 0.1;                      // :41225
    if (this.t < 20) {
      // :41220-41227（ai0<20 减速段）;光照 ai[0]≥10 门(:41232-41236)
      this.vx *= 0.95; this.vy *= 0.95;
    } else {
      // 索敌 400px。★R34-① 勘误（原注释「无 LOS 门」系误读）：1116 num4=0 时
      //   条件 `!(dist>0)||CanHit` 的左支恒假 → CanHit 对一切目标必选（:41257-41258）。
      //   隔墙敌不追踪；候选命中即 num3 收缩=最近者胜（与下方 bd 收缩同构）
      let best: { cx: number; cy: number } | null = null;
      let bd = 400;
      const st = game.world.store;
      for (const q of game.enemies()) {
        const e = q as { x?: number; y?: number; w?: number; h?: number; cx: number; cy: number; dead: boolean; maxHp: number; def?: { friendly?: boolean; critter?: boolean } };
        if (e.dead || e.maxHp <= 5 || e.def?.friendly || e.def?.critter) continue;
        const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
        if (d >= bd) continue;
        // Collision.CanHit(this, npc)（弹盒→目标盒逐格视线,:388-480）
        const ex = e.x ?? e.cx, ey = e.y ?? e.cy, ew = e.w ?? 16, eh = e.h ?? 16;
        if (!canHit(st, this.x, this.y, this.w, this.h, ex, ey, ew, eh)) continue;
        bd = d; best = e as { cx: number; cy: number };
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
    }
    this.moveWithBounce(game);
    // CutTiles（:12517/:15276;CanCutTiles 排除表无 1116）——扫草/碎罐同 GlacierFangShot
    cutTilesBox(game, this.x, this.y, this.w, this.h);
    if (this.t >= 10) {
      const fade = Math.max(0, Math.min(1, (this.life - this.t) / 120));
      game.addLightAt?.(this.cx, this.cy, 0,
        0.6 * (this.t < 20 ? 1 : fade),                         // 相1 恒 (0,.6,.6)/相2 ×Remap(timeLeft)
        0.6 * (this.t < 20 ? 1 : fade));
    }
    // penetrate=1（:10422）——首次伤害结算即 Kill（原注释漏了总数帽）。
    // ★命中结算全周期有效（原版碰撞循环每拍跑,非仅相 2）
    dealContacts(this, game, this.hitCd, -1, () => { this.dead = true; });
  }

  /** HandleMovement tileCollide 段（:18181-18191 type==1116 支）：TileCollision 解算把被
   *  挡轴速度置零（velocity.X != lastVelocity.X 即该轴受阻）→ 本支按【单轴独立】翻向
   *  ×0.25 软反弹、另一轴照常推进、弹体不亡（★B1 转正：曾两轴同翻=斜角贴墙时竖直
   *  动量也归零成"粘墙",原版只翻被挡轴）。X/Y 探针按行进终点中心格分轴取。 */
  private moveWithBounce(game: GameHooks): void {
    const nx = this.x + this.vx, ny = this.y + this.vy;
    const st = game.world.store;
    const probeSolid = (px: number, py: number): boolean => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return !st.inBounds(tx, ty) || st.isSolid(tx, ty);
    };
    const blockedX = this.vx !== 0 && probeSolid(nx + this.w / 2, this.y + this.h / 2);
    const blockedY = this.vy !== 0 && probeSolid(this.x + this.w / 2, ny + this.h / 2);
    // 被挡轴翻向不推进（原版解算回卷位移）;自由轴照常走
    const vxNew = blockedX ? -this.vx * 0.25 : this.vx;         // :18183-18186 单轴 −×0.25
    const vyNew = blockedY ? -this.vy * 0.25 : this.vy;         // :18187-18189 同式
    this.vx = vxNew; this.vy = vyNew;
    if (!blockedX) this.x += this.vx;
    if (!blockedY) this.y += this.vy;
  }

  /** Kill() 1116 尘（:72202-72217）：306×4（Center±Circular(10,10)×scale,scale
   *  1.5+0.25rand,noGravity,color(50,170,255),vel=v×0.4)+白克隆 scale×0.3×alphaRemap。
   *  本仓 spawnParticles 近似（蓝白两组,alphaRemap 折入 size） */
  private die(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    const a = Math.max(0, Math.min(1, (30 - (this.life - this.t)) / 30));
    const remap = 1 - a;                                        // Remap(alpha,0,255,1,0)
    if (remap <= 0) return;                                     // 全透明期消亡不出尘
    for (let i = 0; i < 4; i++) {
      game.spawnParticles(this.cx, this.cy, '#32AAFF', 1, 1.5,
        { life: 18, grav: 0, damp: 0.94, size: (1.5 + Math.random() * 0.25) * remap });
      game.spawnParticles(this.cx, this.cy, '#FFFFFF', 1, 1.2,
        { life: 12, grav: 0, damp: 0.94, size: (1.5 + Math.random() * 0.25) * 0.3 * remap });
    }
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
 *    钳 16,撞实心停）；1122：★寿命=1 拍（SetDefaults timeLeft=1 :10447 → Update
 *    :17308 Kill 先于 AI,出生首拍即落雷;ai[1] 帽 240 仅敌意 1091 消费）、半径 32、
 *    玩家侧 localAI[2] 5 次豁免计数后可选中玩家（自伤链,本仓玩家弹不伤主——登记）
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
  private sharedCd: HitCdImpl | IdStaticSharedTable | null;
  /** ai[0] 目标锁（≥0=NPC 桶序；1091 玩家目标=布尔,单玩家足够——原版 ai[0]=-2-idx） */
  private targetIdx = -1;
  /** 1091 玩家目标态（:40419-40438 num3=14 半径+localAI[2] 5 次豁免计数） */
  private targetPlayer = false;
  private playerGrace = 0;
  /** noLightning+moreLightning 双种子组合（:12795 伤害变治疗/绿雷;Game 注入） */
  comboSeed = false;
  /** Kill 帧 bolt 折线（视觉 + 命中域）；visualT>0 = 尸检期（弹已停 AI,仅画 bolt） */
  private bolt: Bolt | null = null;
  /** localAI[0] 组值（Kill 帧 :71944-71952）：0=飞行期 / 1=未撞块 / 2=撞块 / 3=落点浸液。
   *  消费面 = StormLightningCollisionCheck(:16205) 爆域(1)/液体导通(3) 双门 */
  private boltLocalAI0 = 0;
  /** 全 bolt 列表（主雷+分支叉——StormLightningParticle.Draw foreach bolts 全画,
   *  叉强度 0.5×0.8^(depth−1);曾 generateMainBoltPath 传 null 列表=叉生成即丢弃） */
  private bolts: Bolt[] = [];
  private boltColor: [number, number, number] = [1, 1, 1];
  private visualT = 0;
  /** 尸检寿命：1117=45（Spawn_StormLightning num=45;★R35 勘误:曾误用宽度 num2=12 当
   *  寿命=闪 4 倍快——num2 是 Prepare 的 width 参）/ 1122=16（Spawn_ArcLightning num2=16,
   *  MovementVector.Y==1 ×3 档登记未接） */
  private visualTotal = 16;
  /** 跟鼠标回调（1117 无目标态；Game 注入） */
  mouseWorld?: () => { x: number; y: number };

  constructor(projId: number, x: number, y: number, damage: number, knockback: number) {
    super();
    this.projId = projId;
    this.w = 16; this.h = 16;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    // :40363-40370（1117：num=30/num2=12；1091：缺省 240/32；1122：缺省 240/32）
    // ★R34-② 勘误：1122 SetDefaults `timeLeft = 1`（:10447）——Update 循环
    //   `timeLeft--; if(≤0) Kill()`（:17308-17312）先于 AI 派发 → 出生首拍即 Kill，
    //   AI_203 的 ai[1]≥240 帽全程死代码（仅敌意 1091 用到）。bolt 整线伤害在 Kill 帧
    //   （:71895-71921），故实体寿命=1 拍：本拍 fixedUpdate 走 doKill 落雷。
    // ★1091 世界落雷（2026-08-25 补全,1.4.5 新机制）：寿命=缺省 240（ai[1] 帽真实
    //   消费者）;标记期无害（Damage_CanDealDamage :12483 localAI[0]≤0→false——
    //   localAI[0] 在 Kill 帧才写 1/2/3）;玩家侧目标半径 num3=14(Legendary 32)+
    //   localAI[2] 5 次豁免计数（Legendary 0）;色=青 (80,220,220)（:40590,
    //   noLightning+moreLightning 组合种子 → 绿 (80,220,80) 且伤害变治疗）
    this.life = projId === 1117 ? 30 : (projId === 1091 ? 240 : 1);
    this.searchR = projId === 1117 ? 12 : 32;
    this.sharedCd = projId === 1122 ? ID_STATIC_1122_TABLE : null;   // 1122 IDStatic 10（全场同型一张表）
    this.boltColor = projId === 1117 ? [60 / 255, 120 / 255, 1]
      : projId === 1091 ? [80 / 255, 220 / 255, 220 / 255]
      : [1, 60 / 255, 60 / 255]; // GetLightningColor :40566
    // ★闪电之击专项 R35 再勘误：bolt 视觉余命=Prepare 的 lifeTimeTotal 参——
    //   1117=Spawn_StormLightning num=45(:1031)/1122=Spawn_ArcLightning num2=16(:1259,
    //   MovementVector.Y==1 ×3 档登记)。曾误读宽度 num2=12 当寿命=闪 4 倍快
    this.visualTotal = projId === 1122 ? 16 : 45;   // 1091 世界落雷同 Spawn_StormLightning 档
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
      const vprog = 1 - this.visualT / this.visualTotal;
      // 天端 windup 电花（StormLightningParticle.Update num<0.5 段 :177-227）：
      // 主雷 positions[0]=1117 天上端点——3× rand(4)==0 顶升 d306(±90° 抖) +
      // k=±1 侧向 45° d306 + 白核克隆;本仓 spawnParticles 近似（d306 池无帧链）
      if (this.bolt && vprog < 0.5) {
        const skyEnd = this.bolt.positions[0];
        const col = this.projId === 1117 ? '#3C78FF' : '#FF3C3C';
        for (let j = 0; j < 3; j++) {
          if (Math.floor(Math.random() * 4) !== 0) continue;
          const a9 = -Math.PI / 2 + (Math.random() * 2 - 1) * Math.PI / 2;
          game.spawnParticles(skyEnd.x, skyEnd.y, col, 1, 1.8,
            { life: 16, grav: 0, vx: Math.cos(a9) * 4, vy: Math.sin(a9) * 4, damp: 0.95 });
          game.spawnParticles(skyEnd.x, skyEnd.y, '#FFFFFF', 1, 1.3,
            { life: 12, grav: 0, vx: Math.cos(a9) * 4, vy: Math.sin(a9) * 4, damp: 0.95 });
        }
        for (let k = -1; k <= 1; k += 2) {
          if (Math.floor(Math.random() * 4) !== 0) continue;
          const a9 = -Math.PI / 2 + k * Math.PI / 4;
          game.spawnParticles(skyEnd.x, skyEnd.y, col, 1, 1.8,
            { life: 16, grav: 0, vx: Math.cos(a9) * 4, vy: Math.sin(a9) * 4, damp: 0.95 });
        }
      }
      // steadyLight（StormLightningParticle.Update :157-165）：沿线每 20 点加光,
      // 强度 = Remap(progress,0,0.3,0,1)×Remap(progress,0.7,1,1,0)
      if (this.bolt && game.addLightAt) {
        const prog = vprog;
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
    if (this.targetPlayer) {
      const p = game.player;
      if (!p || p.dead || Math.hypot(p.cx - this.cx, p.cy - this.cy) > 600) {
        this.doKill(game); return;
      }
    }
    // 索敌（:40397-40421）：仅无目标时扫（1117 需 CanBeChasedBy 口径≈非 friendly/小动物）。
    // ★R25-②a 对齐两处：vanilla 按 NPC 槽序取【首个】入半径者（:40400-40403
    //   `if (entity != null) break`——非最近者）；距离口径 =
    //   Distance(npc.Hitbox.ClosestPointInRect(Center))（到目标【盒】最近点,:40405,
    //   大体型判定圈不缩水）。门 !dontTakeDamage 与 CanBeChasedBy 三近似维持登记
    if (this.targetIdx < 0) {
      const list = game.enemies();
      for (let i = 0; i < list.length; i++) {
        const e = list[i] as { cx: number; cy: number; x: number; y: number; w: number; h: number; dead: boolean; maxHp: number; def?: { friendly?: boolean; critter?: boolean } };
        if (e.dead || e.maxHp <= 5 || e.def?.friendly || e.def?.critter) continue;
        // ClosestPointInRect(Center)：Center 钳入目标盒后的最近点距离
        const px = Math.min(Math.max(this.cx, e.x), e.x + e.w);
        const py = Math.min(Math.max(this.cy, e.y), e.y + e.h);
        if (Math.hypot(px - this.cx, py - this.cy) <= this.searchR) {
          this.targetIdx = i;                                   // ai[0]=PackTargetIndex（槽序首中即定）
          break;                                                // :40401-40403 entity!=null → break
        }
      }
    }
    if (this.targetIdx >= 0) {
      // :40443 MoveTowards(center,32)
      const e = this.enemyAt(game, this.targetIdx)!;
      const d = Math.hypot(e.cx - this.cx, e.cy - this.cy) || 1;
      const step = Math.min(32, d);
      this.x += (e.cx - this.cx) / d * step;
      this.y += (e.cy - this.cy) / d * step;
    } else if (this.targetPlayer) {
      // :40453-40456 玩家目标 MoveTowards(center,32)
      const p = game.player;
      const d = Math.hypot(p.cx - this.cx, p.cy - this.cy) || 1;
      const step = Math.min(32, d);
      this.x += (p.cx - this.cx) / d * step;
      this.y += (p.cy - this.cy) / d * step;
    } else if (this.projId === 1091) {
      // :40419-40438 玩家侧捕获（NPC 扫描落空后）：num3=14（Legendary 32——本仓
      //   无 Legendary 档）;玩家在半径内时 localAI[2] 豁免计数 +1,计满 5 次才可
      //   被选中（Legendary 0 次=立即可选）——给玩家 5 tick 逃离窗
      const p = game.player;
      if (p && !p.dead) {
        const px = Math.min(Math.max(this.cx, p.x), p.x + p.w);
        const py = Math.min(Math.max(this.cy, p.y), p.y + p.h);
        if (Math.hypot(px - this.cx, py - this.cy) <= 14) {
          if (this.playerGrace < 5) this.playerGrace++;
          else this.targetPlayer = true;
        }
      }
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
    // ★回炉：风窗粒子连续撒（vanilla :40518-40526 每拍 P<=prog×0.2——曾仅 t=15%
    //   一发 6 粒=光球期 2/3 屏时几乎无粒子=用户"很暗"主源之一）
    if (this.t > 1 && Math.random() <= prog * 0.55) {
      const [wr, wg2, wb] = this.boltColor;
      game.spawnParticles(this.cx + (Math.random() * 2 - 1) * 10,
        this.cy + (Math.random() * 2 - 1) * 10,
        `rgb(${Math.round(wr * 255)},${Math.round(wg2 * 255)},${Math.round(wb * 255)})`,
        2, 1.4, { life: 14, grav: -0.01, damp: 0.92 });
    }
    if (this.t === Math.floor(this.life * 0.15)) {
      // ★闪电之击专项：windup 音=NPCHit34（Projectile.cs:40507 vol=Lerp(.4,1,
      //   Main.SceneState.outsideWeatherEffectIntensity)）——资产无 npchit_34.wav，
      //   取电花特征最近的 dd2_lightning_aura_zap_0-3（近似登记）。室外强度经
      //   world.weather.outsideWeatherEffect（Weather.ts:217,:338 钳 0-1,SceneState
      //   同源值;与本类 doKill Kill 帧音同通道,缺省 1 兜底同款）——曾固定 0.8
      //   （F2 2026-08-26 对齐 Lerp 原式）
      const zaps = ['dd2_lightning_aura_zap_0', 'dd2_lightning_aura_zap_1',
        'dd2_lightning_aura_zap_2', 'dd2_lightning_aura_zap_3'];
      const wx = (game.world as unknown as { weather?: { outsideWeatherEffect?: number } }).weather;
      const inten = Math.max(0, Math.min(1, wx?.outsideWeatherEffect ?? 1));
      game.playSfxWav?.(zaps[(Math.random() * 4) | 0], 0.4 + 0.6 * inten, this.cx, this.cy);
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
    // 生成器按型分流（Kill :71936-71940）：1122=ArcSurge 手→雷；1091=StormLightning
    // （世界落雷预设,与 TrySpawnLightningBolt CanHitTarget 同款）；1117=LightningStrikeWeapon
    const gen = this.projId === 1122
      ? arcSurgeWeaponGenerator(this.handAnchor(game), center, probe)
      : this.projId === 1091
        ? stormLightningGenerator(probe)
        : lightningStrikeWeaponGenerator(probe);
    // 1122：direction = center − hand（:71913-71914）；1117：direction 缺省 UnitY
    // （Generate(null,seed,target,direction??UnitY) → 天降 bolt,start=目标上方 750px）
    const dir = this.projId === 1122
      ? { x: center.x - this.handAnchor(game).x, y: center.y - this.handAnchor(game).y }
      : null;
    // ★R35 勘误：Generate 传 bolts 列表（StormLightningParticle._Prepare :74 同式）——
    //   分支叉收集进列表全画（曾 generateMainBoltPath 传 null=叉生成即丢弃=闪电无叉）;
    //   calcRotations=true（EmitSpawnDust 尘速=−rotations[i] 向量,:103-106）。
    //   direction null→UnitY 展开在调用方（generate 不收 null,GenerateMainBoltPath :295 同式）
    this.bolts = [];
    const bolt = gen.generate(this.bolts, this.seed >>> 0, center,
      dir ?? { x: 0, y: 1 }, true, true);
    this.bolt = bolt;
    // ---- 撞块吸附 + localAI[0] 组值（Kill :71933-71955）：flag8=!collided →
    //   未撞=1 / 撞块=2；两型【都】把中心吸附到 bolt 末点后取落点格液体；
    //   浸液覆写 localAI[0]=3 并触发整链电化粒子（A① 导通链门）。
    //   1122 例外：ArcSurge 分支在生成前显式 localAI[0]=2（:71924）＝无爆域/导通 ----
    if (bolt.collidedWithTile && this.projId !== 1122) {
      const last = bolt.positions[bolt.positions.length - 1];
      this.x = last.x - this.w / 2; this.y = last.y - this.h / 2;
    }
    if (this.projId === 1122) {
      this.boltLocalAI0 = 2;                                    // :71924 显式 2
    } else {
      this.boltLocalAI0 = bolt.collidedWithTile ? 2 : 1;         // :71944 flag8
      if (tileHasLiquid(game, Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
        this.boltLocalAI0 = 3;                                  // :71950-71952 浸液导通态
        this.spawnLiquidElectrification(game);                  // :14502-14520 电化粒子链
        // :71956-71957 SelfHurtPlayers（1117 owner==本地 入水自伤）——本仓玩家弹不伤主
        // 维持既有登记；导通对玩家的伤害面由下方 1091 EVP 命中口径覆盖
      }
    }
    // ---- 打屏/背景白闪（Spawn_StormLightning，ParticleOrchestrator.cs:1027-1053）：
    //   flag = IndexOfPlayerWhoInvokedThis != 255 → 1117(武器,value=owner)/1091(世界,value=255)。
    //   ★A⑦ 转正：PunchCameraModifier + Main.NewLightning(instant:true) 只在 !flag 支
    //   （:1044-1052）＝【1091 世界雷】专属演出,1117 从无打屏（曾错装）。强度=
    //   Lerp(2,10,outsideWeatherEffectIntensity)（"恒 6"近似随之退役）;frames=45;
    //   起源=bolt 落点。vibrationCyclesPerSecond=3/falloff=1500 本仓 punchCamera
    //   形参无该两通道（hook 内定 cps 6/falloff 1000）维持登记 */
    if (this.projId === 1091) {
      const weather = (game.world as unknown as {
        weather?: { outsideWeatherEffect?: number; newLightning?: (instant?: boolean) => void };
      }).weather;
      const inten = Math.max(0, Math.min(1, weather?.outsideWeatherEffect ?? 1));
      const th = Math.random() * Math.PI * 2;
      const end9 = bolt.positions[bolt.positions.length - 1];
      game.punchCamera?.(Math.cos(th) * 0.5, Math.sin(th), 45, 2 + 8 * inten, end9.x, end9.y);
      weather?.newLightning?.(true);                            // 背景白闪系统瞬发档
    }
    // ---- MultiPointHitbox 16×16 沿 bolt 折线一次性结算（:71918-71919/:71957-71962）----
    this.damageAlongBolt(game, bolt);
    // ---- 1091 玩家侧结算（friendly+hostile+trap 三态弹）:Damage_EVP 全口径 —---
    //   命中面走 Colliding 的 aiStyle203 分流（bolt 折线 ±8 / 64×64 爆域 / 液体导通,
    //   与 NPC 同源——曾仅按 bolt 路径判=浸液连锁近旁玩家漏劈）;缩放序见
    //   lightningEvpFinalDamage（curve 在 Main.Difficulty 浮点轴,{Journey .04/Classic .08/
    //   Master .24/Legendary .4} ×2 ×死囚毛衣）。noLightning+moreLightning 组合种子 →
    //   Heal(80) 免伤（Damage_EVP :14931-14935）
    if (this.projId === 1091) {
      const p = game.player as unknown as
        { x?: number; y?: number; w?: number; h?: number; cx?: number; cy?: number; dead?: boolean } | null | undefined;
      if (p && !p.dead && !(p as { iframes?: number }).iframes) {
        const pbox = {
          x: p.x ?? (p.cx ?? this.cx) - 10, y: p.y ?? (p.cy ?? this.cy) - 21,
          w: p.w ?? 20, h: p.h ?? 42,
        };
        // MultiPoint 点优先取实触点（击退源坐标），否则爆域/导通面命中用落点心
        let hitPt: { x: number; y: number } | null = null;
        for (const q of bolt.positions) {
          if (q.x >= pbox.x - 8 && q.x < pbox.x + pbox.w + 8
            && q.y >= pbox.y - 8 && q.y < pbox.y + pbox.h + 8) { hitPt = { x: q.x, y: q.y }; break; }
        }
        if (hitPt || this.stormBoltCollides(game, pbox.x, pbox.y, pbox.w, pbox.h)) {
          this.evpStormBolt(game, hitPt ?? { x: this.cx, y: this.cy });
        }
      }
    }
    // ---- 编排视觉（Spawn_ArcLightning P57:1245-1345）----
    this.emitBoltFx(game, bolt);
    // 弹本体死,bolt 视觉余命 visualTotal（1117=45/1122=16）
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

  /** aiStyle203 命中面全口径（Colliding aiStyle203 分流 :15954-15965 +
   *  StormLightningCollisionCheck :16205-16243；1457 :15954/:16205 同值序）：
   *   ①1117 先置支 —— localAI[0]==1 时本体盒 Inflate(60)（半沿 68）；
   *   ②通用·爆域 —— localAI[0]==1 → GetStormLightningExplosionRect=
   *     CenteredRectangle(Center,64)（半沿 32,:16232-16235。★A② 勘误：此域三型共有,
   *     主消费面是 1091 世界雷——曾只挂 1117 用 ±68 近似充数）；
   *   ③通用·液体导通 —— localAI[0]==3 且 Distance(center,targetCenter)<500px 且
   *     Utils.PlotLine 落点心→目标心【全程】liquid!=0（StormLightningLiquidCollisionCheck
   *     :16237-16242,A① 导通链）；④尾段 MultiPointHitbox ±8 含容。
   *  命中即真（原生 OR 语序与原版一致）。 */
  private stormBoltCollides(game: GameHooks, wx: number, wy: number, ww: number, wh: number): boolean {
    const ecx = wx + ww / 2, ecy = wy + wh / 2;
    const dxT = Math.abs(ecx - this.cx), dyT = Math.abs(ecy - this.cy);
    const halfW = ww / 2, halfH = wh / 2;
    if (this.boltLocalAI0 === 1) {
      if (this.projId === 1117 && dxT <= 68 + halfW && dyT <= 68 + halfH) return true;
      if (dxT <= 32 + halfW && dyT <= 32 + halfH) return true;
    }
    if (this.boltLocalAI0 === 3 && Math.hypot(ecx - this.cx, ecy - this.cy) < 500) {
      const allWet = plotTiles(
        Math.floor(this.cx / TILE), Math.floor(this.cy / TILE),
        Math.floor(ecx / TILE), Math.floor(ecy / TILE),
        (x, y): boolean => tileHasLiquid(game, x, y));
      if (allWet) return true;
    }
    const pts = this.bolt?.positions ?? [];
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      if (q.x >= wx - 8 && q.x < wx + ww + 8 && q.y >= wy - 8 && q.y < wy + wh + 8) return true;
    }
    return false;
  }

  /** SpawnLightningLiquidElectrificationParticles（:14502-14520）：以落点为心 40 条放射
   *  PlotLine（半径 500px、只走液体格、遇干格即止）逐格 1/4 率 白光 AddLight+电花编排
   *  粒子。编排粒子形态池缺——spawnParticles 白火花近似 */
  private spawnLiquidElectrification(game: GameHooks): void {
    const sx9 = Math.floor(this.cx / TILE), sy9 = Math.floor(this.cy / TILE);
    for (let i = 1; i < 40; i++) {
      const ang = Math.PI * i / 20;
      const ex9 = Math.floor((this.cx + Math.cos(ang) * 500) / TILE);
      const ey9 = Math.floor((this.cy + Math.sin(ang) * 500) / TILE);
      plotTiles(sx9, sy9, ex9, ey9, (x, y): boolean => {
        if (!tileHasLiquid(game, x, y)) return false;
        if (Math.random() * 4 >= 1) return true;                  // Main.rand.Next(4)==0 才出
        game.spawnParticles((x + 0.5) * TILE, (y + 0.5) * TILE, '#FFFFFF', 1, 1.2,
          { life: 14, grav: 0, damp: 0.92 });
        game.addLightAt?.((x + 0.5) * TILE, (y + 0.5) * TILE, 1, 1, 1);
        return true;
      });
    }
  }

  /** Damage_EVP type==1091 终值序列（:14846-14949;1457 :14846-14949 同值序）：
   *  门禁(死亡/无敌 General 免疫槽) → CanParryAgainst(:31673 盾反击窗) /
   *  comboSeed Heal(80)(:14931-14935,置 flag2 吞伤害同效) → 终值链
   *  lightningEvpFinalDamage(DamageVar(-luck) → ×curve(Difficulty) → ×2 → 死囚毛衣)
   *  → Player.Hurt/Game.damagePlayer → trap 成就(WATCH_YOUR_STEP HandleSpecialEvent(4))。
   *  敌体 velocity 本仓未建模（天降雷按 UnitY 参与朝向判别,登记）；
   *  banner/resistCold 两步对 1091 无源跳过（bannerIdToRespondTo=0/coldDamage=false）。 */
  private evpStormBolt(game: GameHooks, hitPt: { x: number; y: number }): void {
    const p = game.player as unknown as {
      cx: number; cy: number; facing?: number; shieldParryTimeLeft?: number;
      luck?: number; hp: number; maxHp: number; dead?: boolean; maxMana?: number;
    };
    // CanParryAgainst（:31673-31679）：shieldParryTimeLeft>0 && sign(boltCenterX−playerCenterX)
    // ==direction && enemyVelocity!=Zero && !immune —— 格挡成功 = 零伤（EVP flag2 短路）
    const parried = ((p.shieldParryTimeLeft ?? 0) > 0)
      && Math.sign(this.cx - p.cx) === (p.facing ?? 1);
    if (this.comboSeed) {
      p.hp = Math.min(p.maxHp, p.hp + 80);                        // Heal(80)（:14933）
      return;
    }
    if (parried) return;
    const dmg = lightningEvpFinalDamage(this.damage, mainDifficulty(game.world), {
      luck: p.luck ?? 0,
      sweater: playerDeadMansSweater(game),
    });
    if (dmg < 1) return;                                          // Hurt <1 丢弃语义
    game.damagePlayer(dmg, hitPt.x, hitPt.y, undefined, false, false);
    // trap 尾段（:14942-14948）：trapDebuffSource 标记本仓无位；成就致死分支保留
    if ((game.player as unknown as { dead?: boolean }).dead) {
      game.achievements?.handleSpecialEvent(4, {
        statLifeMax: p.maxHp,
        statManaMax: (game.player as unknown as { maxMana?: number }).maxMana ?? 20,
      });
    }
  }

  /** 命中域逐敌结算（Damage_PVE_Inner 链——crit/击退/StatusNPC 同 dealContacts 管线;
   *  免疫窗：1117 local −1 / 1122 IDStatic 10 型级共享表 / 1091 local −1） */
  private damageAlongBolt(game: GameHooks, bolt: Bolt): void {
    const cd = this.sharedCd ?? this.hitCd;
    cd.tick();
    for (const ent of game.enemies()) {
      const e = ent as unknown as HitTarget & { vanillaId?: number; hp: number; maxHp: number };
      if (!e || e.dead) continue;
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;
      // aiStyle203 Colliding 全口径（bolt 折线 ±8 含容 / 爆域 / 液体导通——A①②）
      if (!this.stormBoltCollides(game, e.x, e.y, e.w, e.h)) continue;
      if (!cd.ready(e.id, this.projId === 1122 ? 10 : -1)) continue;
      const crit = Math.random() < this.critChance;
      let dmg = crit ? this.damage * 2 : this.damage;
      // 1091 NPC 伤难度乘区（Damage_GetProjectileSpecificDamageMultiplier :14630-14633,
      // 1457 :14632 同式）：×Remap(Main.Difficulty 浮点轴, Classic1, Master3, 1, 3)——
      // 经典 D=1→1 / 专家 D=2→2 / 大师 D=3→3 / 旅程滑杆缺省 D=0.5→clamp 1
      // （★L1 错键修正：曾按 GameMode int 直采 {0..3}）
      if (this.projId === 1091) {
        dmg = Math.round(dmg * lightningNpcMultiplier(mainDifficulty(game.world)));
        // noLightning+moreLightning 组合种子：NPC 伤害改治疗 10% lifeMax（:12795-12807）
        if (this.comboSeed) {
          const heal = Math.min(Math.round(e.maxHp * 0.1), e.maxHp - e.hp);
          if (heal > 0) { e.hp = Math.min(e.maxHp, e.hp + heal); }
          continue;
        }
      }
      const kdir = Math.sign(e.x + e.w / 2 - this.cx) || 1;
      e.hurt(dmg, kdir * this.knockback, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
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
    // ★R35：尘速=−rotations[i] 单位向量（:103-106——calcRotations 已开,曾恒 UnitY）
    const rots = bolt.rotations;
    for (let i = 5; i < pts.length - 5; i++) {
      if (rng.next(maxValue) !== 0) continue;
      const p = pts[i];
      const spd = (3 + rng.nextFloat() * 6.5) * velMul;
      const d = game.spawnDust?.(p.x, p.y, 0, 0, dustType, 0, spd, 0, color, baseScale + rng.nextFloat() * 0.5);
      if (d) {
        d.x = p.x; d.y = p.y;                    // NewDustPerfect（:107）
        if (rots) { d.vx = -Math.cos(rots[i]) * spd; d.vy = -Math.sin(rots[i]) * spd; }
        else { d.vx = 0; d.vy = spd; }           // rotations==null 回退 UnitY（:102）
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
    // ★闪电之击专项勘误：Kill 音按型分流——Item15+ArcSurge(Item_203) 双音属
    //   Spawn_ArcLightning（1122 ArcSurge 专支,ParticleOrchestrator.cs:1263-1268）;
    //   1117/1091 走 Spawn_StormLightning 声段（:1055-1060）：
    //   vol = Lerp(0.4,1,outsideWeatherEffectIntensity) 两型同式；
    //   flag=IndexOfPlayerWhoInvokedThis!=255 → 1117(=owner)=LightningStrikeHit
    //   （=style(2,204)=Item_204.wav,pitch 0）/ 1091(=255 自然雷)=InstantThunder
    //   （SoundID.cs:1126 三变体随机）。★声在 Kill 帧（原版编排由 Kill 触发,
    //   Game.spawnStormBolt1091 出手侧不播——2026-08-26 review 修双播+提前 4s）
    if (this.projId === 1122) {
      game.playSfxWav?.('Item_15', 1, hand.x, hand.y);
      game.playSfxWav?.('Item_203', 0.6, hand.x, hand.y, (Math.random() * 2 - 1) * 0.2 - 0.05);
    } else {
      const w = (game.world as unknown as { weather?: { outsideWeatherEffect?: number } }).weather;
      const inten = Math.max(0, Math.min(1, w?.outsideWeatherEffect ?? 1));
      const v = 0.4 + 0.6 * inten;
      if (this.projId === 1117) game.playSfxWav?.('Item_204', v, end.x, end.y);
      else {
        game.playSfxFiles?.(['instant_thunder_0', 'instant_thunder_1', 'instant_thunder_2'],
          v, end.x, end.y);
      }
    }
  }

  /** StormLightningDrawer（:69-115）Canvas 折线近似：逐段梯形带 + 波前扫掠 α。
   *  StripWidth：w×Remap(s,0.5,1,1,0.5)×Remap(progress,0.5,1,1,0.5)(+taperEnd)；
   *  StripColors：waveIn×waveOut 双波门。加算合成。
   *  ★R35 勘误：①anim 按型分流——1117=DefaultAnim(FadeStart.1/Mid.25/End.75/Final0/
   *  WaveLen.5/In.15/Out.75,:45-55),1122=ArcSurge(.1/.4/1/.3/.3/.3/.5,:57-67),曾两型
   *  同套 ArcSurge 参数;②foreach bolts 全画（StormLightningParticle.Draw :257-262）,
   *  叉强度 0.5×0.8^(depth−1)×Intensity;③天端 windup 电花（Update num<0.5 段 :177-227,
   *  d306 顶升/侧向+白核克隆,d226 HackFrame278——draw 侧每帧近似 spawn）。 */
  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    if (this.bolt && this.visualT > 0 && this.bolts.length > 0) {
      const progress = 1 - this.visualT / this.visualTotal;
      const is1117 = this.projId === 1117;
      const anim = is1117
        ? { fadeStart: 0.1, fadeMid: 0.25, fadeEnd: 0.75, final: 0, waveLen: 0.5, waveIn: 0.15, waveOut: 0.75 }
        : { fadeStart: 0.1, fadeMid: 0.4, fadeEnd: 1, final: 0.3, waveLen: 0.3, waveIn: 0.3, waveOut: 0.5 };
      const opacity = remapL(progress, anim.fadeStart, anim.fadeMid, 0.5, 1)
        * remapL(progress, anim.fadeMid, anim.fadeEnd, 1, anim.final);
      const waveInP = remapL(progress, 0, anim.waveIn, 0, 1);
      const waveOutP = remapL(progress, 1 - anim.waveOut, 1, 0, 1);
      for (const b of this.bolts) {
        const inten = (b.forkDepth === 0 ? 1 : 0.5 * Math.pow(0.8, b.forkDepth - 1));
        this.drawBolt(ctx, r, b, inten, progress, opacity, anim, waveInP, waveOutP);
      }
    } else {
      // 飞行期本体贴图（:40450-40455 光强包络近似亮度）
      const img = projSprite(this.projId);
      const T = this.t / this.life;
      const glow = Math.sqrt(Math.max(0, 1 - Math.pow(2 * Math.min(1, T / 0.5) - 1, 2))) * 0.3 + 0.75;   // ★回炉:底亮 0.4→0.75(悬浮期光球可读性)
      // ★回炉:加算白芯辉光盘（vanilla 风窗粒子云的观感等价——贴图本体是暗蓝小纹,
      //   仅 source-over 叠画=用户实拍"很暗"的 orb 期主源）
      const [gcr, gcg, gcb] = this.boltColor;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, glow));
      ctx.translate(this.cx, this.cy);
      // ★辉光盘必须在 translate 之后（曾画在世界原点=不可见）
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
      grd.addColorStop(0, `rgba(255,255,255,${(0.85 * glow).toFixed(3)})`);
      grd.addColorStop(0.45, `rgba(${Math.round(gcr * 255)},${Math.round(gcg * 255)},${Math.round(gcb * 255)},${(0.5 * glow).toFixed(3)})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(-16, -16, 32, 32);
      ctx.globalCompositeOperation = 'source-over';
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

  private drawBolt(ctx: CanvasRenderingContext2D, r9: import('../render/Renderer').Renderer,
    bolt: Bolt,
    intensity: number, progress: number, opacity: number,
    anim: { waveLen: number; waveIn: number; waveOut: number },
    waveInP: number, waveOutP: number): void {
    const pts = bolt.positions;
    if (pts.length < 2) return;
    // Prepare 的 width 参（StormLightningParticle._Prepare → Spawn_StormLightning
    // :1048 `num2 = flag ? 12 : 16`——1117 武器雷 12 / 1091 世界雷 16）
    const W = this.projId === 1091 ? 16 : 12;
    // 波前双门（WaveTransition :88-91,anim 按型——R35 勘误:1117=DefaultAnim 曾误套 ArcSurge）
    const waveIn = Math.min(1, Math.max(0, waveInP));
    const waveOut = Math.min(1, Math.max(0, waveOutP));
    const taperEnd = bolt.progressRange.max < 1;
    const [cr, cg, cb] = this.boltColor;
    const range = bolt.progressRange;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = range.min + (range.max - range.min) * (i / (pts.length - 1));
      const s1 = range.min + (range.max - range.min) * ((i + 1) / (pts.length - 1));
      // 波前双门（WaveTransition :88-91）
      const a0 = waveGate(s0, waveIn, anim.waveLen, 0, 1) * waveGate(s0, waveOut, anim.waveLen, 1, 0);
      const a1 = waveGate(s1, waveIn, anim.waveLen, 0, 1) * waveGate(s1, waveOut, anim.waveLen, 1, 0);
      if (a0 <= 0.004 && a1 <= 0.004) continue;
      const w0 = stripWidthAt(s0, W, progress, taperEnd, bolt) * intensity;
      const w1 = stripWidthAt(s1, W, progress, taperEnd, bolt) * intensity;
      const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
      const l = Math.hypot(dx, dy) || 1;
      const px = -dy / l, py = dx / l;
      const am = (a0 + a1) / 2 * opacity;
      if (am <= 0.004) continue;
      // ★StormLightning shader 复刻（PixelShader.cso pass StormLightning）：
      //   片元色=vColor×(Extra_288.r×8×uOpacity×uSaturation)——条带横向 K 切片,
      //   每片按 v 采 LUT 亮度:中央亮带×8 过曝=白热芯,上下暗=蓝辉光边
      //   ('lighter' 加算,fill alpha=波门,rgb 折增益)
      const K = 6;
      for (let k9 = 0; k9 < K; k9++) {
        const v9 = (k9 + 0.5) / K;
        const lut = stormTexBrightness(r9, v9);
        // ★C2 勘误（字节码 :3207-3210 writemask）：×8×uOpacity×uSaturation 增益链
        //   只写 r0.x【红通道】——末指令 mul r0.xyzw,r0,v0 逐通道展开后 G/B=
        //   tex.g/b×vColor 不吃增益。曾三通道全乘 → 边带亮度比 2.77× 偏差
        const gainR = lut * 8 * opacity * intensity;
        // vColor=StormLightningDrawer 白顶点色（StripColors=White——蓝调由风窗粒子/
        //   光 tint 承担;曾用 GetLightningColor 蓝基 → C2 分通道后亮度重心崩塌）
        const wcr = 1 - (1 - cr) * 0.35, wcb = 1 - (1 - cb) * 0.35;
        const e9r = Math.min(255, wcr * 255 * gainR);
        const e9g = Math.min(255, 255 * lut * (1 - (1 - cg) * 0.35));
        const e9b = Math.min(255, wcb * 255 * lut);
        if (e9r + e9g + e9b < 6) continue;
        const sw0 = w0 / K, sw1 = w1 / K;
        const o0 = -w0 / 2 + k9 * sw0, o1 = -w1 / 2 + k9 * sw1;
        ctx.fillStyle = `rgba(${e9r | 0},${e9g | 0},${e9b | 0},${Math.min(1, am).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(pts[i].x + px * o0, pts[i].y + py * o0);
        ctx.lineTo(pts[i + 1].x + px * o1, pts[i + 1].y + py * o1);
        ctx.lineTo(pts[i + 1].x + px * (o1 + sw1), pts[i + 1].y + py * (o1 + sw1));
        ctx.lineTo(pts[i].x + px * (o0 + sw0), pts[i].y + py * (o0 + sw0));
        ctx.closePath();
        ctx.fill();
      }
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
  /** ★R34-③：penetrate=(int)Remap(charge/60,0,1,1,3)（:37651）命中总数帽（1..3 档） */
  private penTier = 1;
  private hits = 0;
  private hitCd = new HitCdImpl();
  /** Projectile.timeLeft 等价（蓄力期每拍重置 300 :37596；释放后 300 递减归零
   *  Kill=释放冰矛 5 秒寿命——曾无上限,开阔天空永不消亡=无限堆积,用户实报） */
  private life = 300;
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
      // ★手持动画续期（channel 语义:蓄力期 itemAnimation 钉满,手持法杖全程举向
      //  鼠标不脱落——swing 窗 24t 远短于蓄力,不续则法杖中途消失,用户实报）。
      //  ★aim 同步续期（:50382 itemRotation 逐帧跟鼠标——曾冻结在出手瞬间,
      //  鼠标一动法杖与冰矛分离=冰矛"长在身上"不挂杖,用户实报）
      const mAim = this.ctl.aim();
      game.refreshChannelItem?.(Math.atan2(mAim.y - p.cy, mAim.x - p.cx));
      this.life = 300;                                       // :37596 timeLeft=300 每拍重置
      const m = this.ctl.aim();
      // 挂手：RotatedRelativePoint(MountedCenter) − Size/2（:37587）
      this.x = p.cx - this.w / 2;
      this.y = p.cy - this.h / 2;
      // 蓄力态同样每拍 CutTiles（Damage() 对 active 弹无条件跑,1115 不在
      // Damage_CanDealDamage :12461 排除表——挂手弹盒扫到瓦罐/草即碎,原版同态）
      cutTilesBox(game, this.x, this.y, this.w, this.h);
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
    // CutTiles（Damage→CutTiles 每拍旁路,:12517/:15276;CanCutTiles 排除表无 1115）：
    // 瓦罐等非实心 tileCut 物弹盒扫到即碎——曾整缺=冰矛穿罐不碎（2026-08-26 用户报）
    cutTilesBox(game, this.x, this.y, this.w, this.h);
    // ★寿命帽（timeLeft=300 蓄力期每拍重置 :37596,释放后递减归零 Kill=5 秒寿命——
    //  此前无上限,开阔地释放的冰矛永不消亡=多次施法无限堆积,用户实报蓄力贴图异常）
    this.life = (this.life ?? 300) - 1;
    if (this.life <= 0) { this.dead = true; return; }
    // 撞实心 → 消亡（tileCollide=true :37644）
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) {
      game.spawnParticles(this.cx, this.cy, '#BFE8FF', 8, 2.4, { life: 20, grav: 0.04, damp: 0.94 });
      this.dead = true;
      return;
    }
    game.addLightAt?.(this.cx, this.cy, 0.2, 0.5, 0.8);
    // ★R34-③：释放穿透档 penetrate=(int)Remap(num5,0,1,1,3)（:37651）——命中总数帽
    dealContacts(this, game, this.hitCd, -1, () => {
      this.hits++;
      if (this.hits >= this.penTier) this.dead = true;          // penetrate 耗尽 → Kill
    });
  }

  /** 释放帧（:37632-37660）：伤 ×Remap(charge,0,60,1,4)/kb ×4/pen 1→3
   *  （★R34-③ 已接：penTier=hits 总帽,cooldown −1 维持每敌一次）+ 出膛抖动 */
  private release(game: GameHooks, p: { cx: number; cy: number }): void {
    this.released = true;
    const c = Math.min(1, Math.max(0, this.charge / 60));
    if (this.charge >= 10) {                                   // ai[0]<10 → num5=0（:37638-37640）
      this.damage = Math.max(1, Math.round(this.damage * (1 + 3 * c)));
      this.knockback *= 4;
      // num7=(int)Remap(charge/60,0,1,1,3)（:37648-37650）——C# 截断,1..3 档
      const n5 = Math.min(1, Math.max(0, this.charge / 60));
      this.penTier = Math.max(1, Math.trunc(1 + (3 - 1) * n5));
    } else {
      this.knockback *= 1;
      this.penTier = 1;                                        // ai[0]<10 → num5=0 → pen=1
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
    const aim = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.globalAlpha = this.released ? 1 : 0.9;
    // ★蓄力态锚=手持法杖位（MountedCenter+aim×staffReach 6,与 drawUseItem 杖支
    //  同锚）,矛【尾】贴锚、沿瞄准方向从杖上向外生长（原版观感:冰矛叠在法杖上
    //  从手伸出——曾居中玩家盒中心=半截长在角色身上,用户三次实报）。
    //  释放态=居中飞行体（原版 DrawProjectiles 居中同款）
    const staffAx = Math.cos(aim) * 6, staffAy = Math.sin(aim) * 6;
    if (!this.released) {
      ctx.translate(this.cx + staffAx, this.cy + staffAy);
      ctx.rotate(aim + Math.PI / 2);
      ctx.imageSmoothingEnabled = false;
      if (img && img.width > 0) {
        const fh = img.height / 3;
        // 矛尾钉锚:精灵【底边】(帧底=尾)在锚上,沿旋转后的"上"=瞄准方向伸出
        ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
          -img.width / 2, -fh, img.width, fh);
      } else {
        ctx.fillStyle = '#8FD8FF';
        ctx.fillRect(-5, -28, 10, 28);
      }
      ctx.restore();
      return;
    }
    ctx.translate(this.cx, this.cy);
    ctx.rotate(aim + Math.PI / 2);
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

/** FindChlorophyteSporeCloudSpawn（:42565-42590；1457 :42565 同构）：
 *  扫描窗 = 刃尖列 num2/行 num3 ± 出手侧 5 格 ×竖 [−2..2]，筛"solid 且上格空"台面；
 *  距离度量 num6 = |原 spawnPosition(刃尖) − 候选格中心((num2+i)*16+8,(num3+j)*16−8)|
 *  **按候选自己那列**取近（★A③ 勘误：曾以返回位 sx=基准列横距代替——跨列候选全
 *  同距，行选择退化为"最左扫描命中"，最多偏一行）；返回值仍钉
 *  `spawnPosition.X = vector2.X`（基准列中心,:42587——winning 列只进度量不进返回!）
 *  与 `spawnPosition.Y = (num3+j)*16 − 8`（中奖行顶）。找不到返回 null。 */
export function findSporeCloudSpawn(
  st: { inBounds(x: number, y: number): boolean; isSolid(x: number, y: number): boolean },
  tipX: number, tipY: number, dirX: number,
): { x: number; y: number } | null {
  const tx0 = Math.floor(tipX / TILE);
  const ty0 = Math.floor(tipY / TILE);
  const iLo = dirX > 0 ? -5 : 0;
  const iHi = dirX > 0 ? 0 : 5;
  let bestSy: number | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = iLo; i <= iHi; i++) {
    for (let j = -2; j <= 2; j++) {
      const tx = tx0 + i, ty = ty0 + j;
      if (!st.inBounds(tx, ty) || !st.inBounds(tx, ty - 1)) continue;
      if (st.isSolid(tx, ty) && !st.isSolid(tx, ty - 1)) {
        // 度量用【候选列】中心（:42583 num6 右操作数）;基准列 X 只决定返回值
        const cx9 = tx * TILE + 8;
        const cy9 = ty * TILE - 8;
        const d = Math.hypot(tipX - cx9, tipY - cy9);
        if (d < bd) { bd = d; bestSy = ty * TILE - 8; }
      }
    }
  }
  return bestSy == null ? null : { x: tx0 * TILE + 8, y: bestSy };
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

// ================= R34 批:4062 雷杖 731 / 2795 激光机枪 439+440 / 3852 右键 704 / 5065 魔法阵 950 =================

/** 731 ThunderStaffShot（AI_029·731 支 Projectile.cs:38461-38509 + SetDefaults
 *  :7696-7705 + Kill :77055-77069 + 出手 Player.cs 通用尾 :49960）：
 *  - 10×10/ai29/alpha=255 起步 −15/t 渐显(≈17t 全显)/extraUpdates1/timeLeft90/magic
 *  - 垂直之字摆：ai0++(奇数拍 ¼ 概率再+1);@10 vy−5 @12 vy+5 @18 vy+5 @20 vy−5 归零
 *  - 帧 4t 进帧(projFrames[731]=4 Main.cs:8769);尘 226×⅓(scale0.4,vel=v×0.5 或 ×0.7)
 *  - 光 (0.2,0.5,0.7);Kill:SoundID 0(击块)+尘 226×15(oldV×0.5,⅔ noGravity scale×1.5) */
export class ThunderBoltShot extends Entity {
  w = 10; h = 10;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 731;
  private t = 0;
  private readonly life = 90;      // timeLeft 90（SetDefaults）
  private ai0 = 0;                 // 摆相计数
  private frame = 0;
  private frameCounter = 0;
  private alpha = 255;             // SetDefaults alpha=255 → 渐显
  private hitCd = new HitCdImpl();

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t >= this.life || this.dead) { this.die(game); return; }
    if (++this.frameCounter >= 4) {                            // :38463-38470
      this.frameCounter = 0;
      this.frame = (this.frame + 1) % 4;                       // projFrames[731]=4
    }
    this.alpha = Math.max(0, this.alpha - 15);                 // :38471-38475 渐显
    // 之字摆（:38476-38497）
    this.ai0++;
    const oddTick = this.ai0 % 2 !== 0 && Math.random() < 0.25;
    if (oddTick) this.ai0++;
    switch (Math.trunc(this.ai0)) {
      case 10: this.vy -= 5; break;
      case 12: this.vy += 5; break;
      case 18: this.vy += 5; break;
      case 20: this.vy -= 5; this.ai0 = 0; break;
    }
    if (Math.random() < 1 / 3) {                               // 尘 226 ×⅓(:38498-38507)
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 226,
        this.vx, this.vy, 50, null, 0.4);
      if (d) {
        d.noGravity = true;
        d.vx = 0; d.vy = 0;
        d.vx = this.vx * 0.5 * (Math.random() < 2 / 3 ? 1.4 : 1);
        d.vy = this.vy * 0.5 * (Math.random() < 2 / 3 ? 1.4 : 1);
      }
    }
    game.addLightAt?.(this.cx, this.cy, 0.2, 0.5, 0.7);        // :38508
    // 位移（SetDefaults extraUpdates=1 :7702-7704 → Update 每帧双跑,射程/位移×2——
    // ★A⑥ 转正：曾折叠为单步全速=射程减半。双子步各带 tileCollide 判（440 先例）,
    // AI/音尘按拍单跑登记差异（原版连 AI 亦双跑,仓内惯例折只剩运动面））
    for (let s9 = 0; s9 < 2; s9++) {
      this.x += this.vx; this.y += this.vy;
      const st = game.world.store;
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (!st.inBounds(tx, ty) || st.isSolid(tx, ty)) { this.die(game); return; }
    }
    cutTilesBox(game, this.x, this.y, this.w, this.h);         // CutTiles（:12517/:15276;排除表无 731）
    dealContacts(this, game, this.hitCd, 10);                  // 缺省免疫窗（非 local 表族）
  }

  /** Kill（:77055-77069）：SoundID 0 + 尘 226×15(oldV×0.5,⅔ noGravity/scale×1.5/vel×0.5) */
  die(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    game.playSfxAt?.('hit', this.cx, this.cy);                 // SoundID 0 击块音（本仓近似轨）
    for (let i = 0; i < 15; i++) {
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 226,
        this.vx * 0.5, this.vy * 0.5, 50, null, 0.5);
      if (d && Math.random() < 2 / 3) {
        d.noGravity = true;
        d.scale *= 1.5;
        d.vx *= 0.5; d.vy *= 0.5;
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(731);
    ctx.save();
    ctx.globalAlpha = 1 - this.alpha / 255;                    // GetAlpha 白化淡入(:81134 灰阶近似)
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.vy, this.vx) + 0 /*ai29 弹体竖直贴图→随速度向*/);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const fh = img.height / 4;
      ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
        -(img.width * 0.7) / 2, -fh / 2, img.width * 0.7, fh);
    } else {
      ctx.fillStyle = '#66CCFF';
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();
  }
}

// ---------------- 2795 激光机枪:439 持握体(AI_075·439 支 :67185-67284) ----------------

export interface LaserMgCtl {
  /** player.channel 电平（mouseHeld+持械+!CCED 由 Game 侧并入门） */
  channel: () => boolean;
  /** 当前鼠标世界坐标（实时转向基准） */
  aim: () => { x: number; y: number };
  /** CheckMana(held.mana, pay:true)——每发射拍扣蓝（ManaV2 空蓝照充语义） */
  payMana: () => void;
  /** GetSlowMagicUseRate()（1/0.4）★消费点①发射节拍 */
  rate: () => number;
  /** GetSlowMagicScalar()（1/2.5）★消费点②帧动画 ③循环音间隔 */
  scalar: () => number;
  /** 双发回调（Game 侧造 440×2） */
  fire: (x: number, y: number, vx: number, vy: number) => void;
  onKill?: () => void;
}

/** 439 LaserMachinegun 持握体（SetDefaults 22×22/ai75/penetrate−1/noTile + 公共尾
 *  :68381-68390 position=RRP(MountedCenter)−Size/2、rotation=vAngle+π/2、timeLeft=2 续命）。
 *  发射节拍 period=24−6×stage(stage=@40/80/120 → 24/18/12/6t 四档加速);
 *  slowMagic:ai1+=rate(节拍÷0.4)、frameCounter≥4×scalar、soundDelay=period×scalar。
 *  循环音 Item91(ai0≠1 首帧免);枪口尘 135×2(Center+aim 向×24,scale1.4,noGravity)。
 *  发射拍 gate 失败 → Kill(:67242-67282)。 */
export class LaserMachinegunHolder extends Entity {
  w = 22; h = 22;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 439;
  private ai0 = 0;               // 充能计数（档位门 40/80/120）
  private ai1 = 0;               // 发射累加器
  private frame = 0;
  private frameCounter = 0;
  private soundDelay = 0;
  private velAng = 0;            // velocity 角（公共尾 rotation=vAngle+π/2）
  private ctl: LaserMgCtl;

  constructor(x: number, y: number, ang: number, damage: number, knockback: number, ctl: LaserMgCtl) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.velAng = ang;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    this.ctl = ctl;
  }

  get aimAngle(): number { return this.velAng; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.ai0++;
    const stage = (this.ai0 >= 40 ? 1 : 0) + (this.ai0 >= 80 ? 1 : 0) + (this.ai0 >= 120 ? 1 : 0);   // :67188-67200
    const period = 24 - 6 * stage;                                                                   // 24/18/12/6
    this.ai1 += this.ctl.rate();                                                                     // ★消费点①(:67204)
    let firing = false;
    if (this.ai1 >= period) { this.ai1 = 0; firing = true; }                                         // :67206-67210
    this.frameCounter += 1 + stage;                                                                  // 加速档带帧(:67211)
    if (this.frameCounter >= 4 * this.ctl.scalar()) {                                                // ★消费点②(:67212)
      this.frameCounter = 0;
      this.frame = (this.frame + 1) % 6;                                                             // projFrames[439]=6(Main.cs:8674)
    }
    if (--this.soundDelay <= 0) {
      this.soundDelay = Math.max(1, Math.round(period * this.ctl.scalar()));                         // ★消费点③(:67223)
      if (this.ai0 !== 1) game.playSfxWav?.('Item_91', 1, this.cx, this.cy);                         // 循环射击音(:67226)
    }
    if (this.ai1 === this.ctl.rate() && this.ai0 !== 1) {                                            // 枪口尘(:67229-67241)
      for (let i = 0; i < 2; i++) {
        const d = game.spawnDust?.(this.cx + Math.cos(this.velAng) * 24 - 8,
          this.cy + Math.sin(this.velAng) * 24 - 8, 16, 16, 135,
          Math.cos(this.velAng), Math.sin(this.velAng), 100, null, 1.4);
        if (d) { d.noGravity = true; d.vx *= 0.66; d.vy *= 0.66; }
      }
    }
    // 公共尾挂手（:68381-68389）：RRP(MountedCenter)≈玩家中心 − Size/2;timeLeft=2 续命
    const p = game.player as unknown as { cx: number; cy: number };
    this.x = p.cx - this.w / 2;
    this.y = p.cy - this.h / 2;
    if (firing) {
      const m = this.ctl.aim();
      if (!this.ctl.channel()) { this.kill(game); return; }                                        // gate 失败 → Kill(:67281)
      this.ctl.payMana();
      // 实时转向：v = normalize(mouse − hand) × shootSpeed(20)
      const dx = m.x - p.cx, dy = m.y - p.cy;
      const l = Math.hypot(dx, dy) || 1;
      this.velAng = Math.atan2(dy, dx);
      const spd = 14;                                                                              // num10=14(:67265)
      for (let i = 0; i < 2; i++) {                                                                // 双发 440(:67267-67277)
        const jx = (Math.random() * 15) | 0, jy = (Math.random() * 15) | 0;                        // rand(−7,±7)
        const a = this.velAng + (Math.random() * 0.19634954631328583 - 0.09817477315664291);       // RotatedBy ±0.0982rad
        this.ctl.fire(p.cx + jx - 7, p.cy + jy - 7, Math.cos(a) * spd, Math.sin(a) * spd);
      }
    }
  }

  kill(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    this.ctl.onKill?.();
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(439);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.velAng + Math.PI / 2);                       // 公共尾 rotation=vAngle+π/2(:68382)
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const fh = img.height / 6;
      ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
        -img.width / 2, -fh / 2, img.width, fh);
    } else {
      ctx.fillStyle = '#8899BB';
      ctx.fillRect(-11, -11, 22, 22);
    }
    ctx.restore();
  }
}

// ---------------- 440 LaserMachinegunLaser(SetDefaults :5106-5116 + AI :55738-55774) ----------------

/** 5×5/aiStyle1/alpha255 −25/t 渐显/extraUpdates2(3 子步全速)/timeLeft600/magic/noTile。
 *  光 (0.25,0.4,0.7)(:55748-55750);localAI[0]+3/t 至 100(纯视觉余量);
 *  Kill 尘 135×rand(3,7) scale2.1 noGravity(:74946-74956)。直线弹,缺省免疫窗。 */
export class LaserMachinegunLaser extends Entity {
  w = 5; h = 5;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 440;
  private t = 0;
  private readonly life = 600;
  private alpha = 255;
  private localAI0 = 0;
  private hitCd = new HitCdImpl();

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t >= this.life) { this.die(game); return; }
    this.alpha = Math.max(0, this.alpha - 25);                  // :55740-55744
    this.localAI0 = Math.min(100, this.localAI0 + 3);           // :55754-55762（视觉余量）
    game.addLightAt?.(this.cx, this.cy, 0.25, 0.4, 0.7);        // :55748
    for (let s = 0; s < 3; s++) {                               // extraUpdates=2 → 3 子步全速
      this.x += this.vx; this.y += this.vy;
      cutTilesBox(game, this.x, this.y, this.w, this.h);        // CutTiles（:12517/:15276;两门排除表均无 440）
      const st = game.world.store;
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (!st.inBounds(tx, ty) || st.isSolid(tx, ty)) { this.die(game); return; }
    }
    dealContacts(this, game, this.hitCd, 10);
  }

  private die(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    const n = 3 + ((Math.random() * 4) | 0);                    // rand(3,7)
    for (let i = 0; i < n; i++) {
      const d = game.spawnDust?.(this.cx, this.cy, 0, 0, 135, 0, 0, 100, null, 2.1);
      if (d) { d.noGravity = true; d.vx *= 2; d.vy *= 2; }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(440);
    ctx.save();
    ctx.globalAlpha = 1 - this.alpha / 255;                     // GetAlpha=(255−alpha) 灰阶(:81088)
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const L = Math.hypot(this.vx, this.vy) * 3;               // 拉长光束段（子步行程）
      ctx.drawImage(img, -L / 2, -img.height / 2, L, img.height);
    } else {
      ctx.fillStyle = '#AABBEE';
      ctx.fillRect(-4, -1, 8, 2);
    }
    ctx.restore();
  }
}

// ---------------- 3852 右键风暴 704(AI_145_BookStaffStorm :71421-71560 + SetDefaults :7449) ----------------

/** 60×210/ai145/friendly magic/tileCollide=false/penetrate−1/local 免疫−1/timeLeft600。
 *  寿命帽 300t(localAI[0]≥16 → 提前至 285);vx 保持出手向(±speed)仅 vy 受控:
 *  身下 16×160 列撞固块/液体 → 升(vy −2/−4 至 −16,localAI[0]+=2),否则坠(+2/+4 至 +16)。
 *  尘 274 沿纵向椭圆(fadeIn1.3 scale0.87 alpha211 noGravity,vel.x+=v.x×2.1)+
 *  底部尘 31×4;彩带 gore 1007/1008 ×⅕(timeLeft60)。循环音 dd2_book_staff_twister_loop
 *  (末 15t 音量线性归零)。命中每敌一次(cooldown −1)。 */
export class BookStormTwister extends Entity {
  w = 60; h = 210;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 704;
  private t = 0;
  private life = 300;            // ai[0] 帽 300（localAI[0]≥16 → 285,简化取 300 登记）
  private localAI0 = 0;
  private hitCd = new HitCdImpl();
  /** 循环轨句柄(:71434-71447 soundDelay==0 首拍起播,localAI[1] 存 SlotId)——
   *  GameHooks.startLoopSfx 返回面的结构化类型(与 types.ts :169 同构) */
  private loop: { stop(): void; setVolume(v: number): void; readonly playing: boolean; readonly dead: boolean } | null = null;

  constructor(x: number, y: number, vx: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = 0;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
    // ★外部提前 kill 也必须拆循环轨（2026-08-26 review 补）：自然寿命终点的
    //   loop.stop() 在 fixedUpdate 尾段，外部置 dead（Entity.compact 剔除回调 destroy,
    //   Entity.ts:69-76）不走那里——漏注入则龙卷风循环音满音量长鸣至重载。
    //   GrenadeProj 引信音/dd2 传送门循环轨同款兜底通道
    (this as unknown as { destroy?: () => void }).destroy = () => { this.loop?.stop(); };
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    // 循环音(:71434-71447)：首拍 PlayTrackedSound 起轨;每 tick Volume=
    // 1−max(ai[0]−(life−15),0)/15(末 15t 线性归零)。★位置跟身(activeSound.Position=
    // Center)本仓循环轨无此通道,龙卷横移慢+轨短,简化为定源登记。
    if (this.t === 1) {
      this.loop = game.startLoopSfx?.('dd2_book_staff_twister_loop', 1, 1) ?? null;
    } else {
      this.loop?.setVolume(Math.max(0, 1 - Math.max(this.t - (this.life - 15), 0) / 15));
    }
    if (this.t >= this.life) {
      this.loop?.stop();
      this.dead = true;
      return;
    }                                                      // :71454-71457
    // 垂直物理（:71467-71510）：身下 16×160 探测柱
    const probeX = this.cx - 8, probeYTop = this.y + this.h - 160;
    let blocked = false;
    {
      const st = game.world.store;
      for (let yy = probeYTop; !blocked && yy < this.y + this.h; yy += 16) {
        const tx = Math.floor(probeX / TILE), ty = Math.floor(yy / TILE);
        if (st.inBounds(tx, ty) && (st.isSolid(tx, ty))) blocked = true;
      }
    }
    if (blocked) {                                              // 支撑/浸液 → 升
      if (this.vy > 0) this.vy = 0;
      this.vy -= this.vy > -4 ? 2 : 4;
      if (this.vy < -16) this.vy = -16;
      if (this.vy <= -4) this.localAI0 += 2;
    } else {                                                    // 悬空 → 坠
      this.localAI0 = Math.max(0, this.localAI0 - 1);
      if (this.vy < 0) this.vy = 0;
      this.vy += this.vy < 4 ? 2 : 4;
      if (this.vy > 16) this.vy = 16;
    }
    this.x += this.vx; this.y += this.vy;
    cutTilesBox(game, this.x, this.y, this.w, this.h);          // CutTiles（:12517/:15276;两门排除表均无 704）
    // 尘 274 ×1（:71511-71537,ai[0]<270 门略作恒真近似——末 30t 收尾停尘登记）
    if (this.t < this.life - 30) {
      const amt = Math.random();
      const px = this.cx + (amt - 0.5) * this.h * 0.2 * 0.5 * 2;
      const py = this.y + this.h * (0.5 + (Math.random() * 1.9 - 0.95)) * 0.5 + 10;
      const d = game.spawnDust?.(px, py, 0, 0, 274, 0, Math.random() * -0.5 - 1.3, 211, null, 0.87);
      if (d) {
        d.fadeIn = 1.3;
        d.noGravity = true;
        d.noLight = true;
        d.vx = (1 + Math.random()) + this.vx * 2.1;
      }
    }
    for (let k = 0; k < 4; k++) {                               // 底部尘 31×4(:71538-71544)
      const d = game.spawnDust?.(this.x + this.w / 2 - 25, this.y + this.h - 25, 50, 25, 31,
        this.vx, -2, 100, null, 1);
      if (d) d.noGravity = true;
    }
    dealContacts(this, game, this.hitCd, -1);                   // localNPCHitCooldown=−1
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(704);
    if (!img || img.width <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, this.x, this.y, this.w, this.h);
    ctx.restore();
  }
}

// ---------------- 5065 公主之武魔法阵 950(AI_186_PrincessWeapon :43454-43573) ----------------

/** 104×104/ai186/alpha255(本体不可见全粒子)/timeLeft180 但 AI 自管 60t 即 Kill/
 *  tileCollide=false/penetrate=−1/ignoreWater。Damage() 伤 ×0.98（:13575-13577,出生伤折算）。
 *  包络：Opacity=Remap(t,0,60,1,0);scale=(0.4+0.6×easeOut²)×(1−Remap(t,45,60)²);
 *  尘 267(HSL(0.92,1,0.5)粉)双环反向 ×3×½掷(环缘半径 52×scale,法向±45°偏移 6px,
 *  fadeIn rand×1.2×scale,vel 法向∓2+v×0.5)+白克隆 scale/2 fade×0.85;
 *  PrincessWeapon 编排粒子 ×¾掷(u<0.95);t==50 四正交收束爆发 ×2 档速度(:43554-43572)。
 *  命中走通用接触（缺省免疫窗）;direction 朝目标为表现位（:13232,省略）。 */
export class PrincessMagicCircle extends Entity {
  w = 104; h = 104;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  magicProj = true;
  readonly projId = 950;
  private t = 0;
  private readonly life = 60;
  opacity = 1;
  scl = 0.4;
  private hitCd = new HitCdImpl();

  constructor(x: number, y: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = 0; this.vy = 0;                                   // 零速定点放置（Player.cs:48183）
    this.damage = Math.max(1, Math.trunc(damage * 0.98));       // Damage() 折价 (int)(dmg×0.98)(:13575)
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t >= this.life) { this.dead = true; return; }      // :43457-43461
    const u = this.t / this.life;
    this.opacity = 1 - u;                                       // Remap(ai0,0,num,1,0)
    const e1 = 1 - (1 - u) * (1 - u);
    const e2 = 1 - (1 - e1) * (1 - e1);
    const tailK = Math.pow(Math.max(0, Math.min(1, (this.t - 45) / 15)), 2);
    this.scl = (0.4 + 0.6 * e2) * (1 - tailK);                  // :43463-43470
    if (u < 0.9) {                                              // 双环尘（:43479-43537）
      const ringR = (this.w / 2) * this.scl;
      for (const dirSign of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          if (Math.random() >= 0.5) continue;
          const a = Math.random() * Math.PI * 2;
          const nx = Math.cos(a), ny = Math.sin(a);
          const px = this.cx + nx * ringR + ny * dirSign * 6;
          const py = this.cy + ny * ringR - nx * dirSign * 6;
          const d = game.spawnDust?.(px, py, 0, 0, 267, 0, 0, 0,
            { r: 255, g: 102, b: 178, a: Math.round(255 * this.opacity) },
            0.3 + Math.random() * 1.2 * this.scl, true);
          if (d) {
            d.scale *= this.scl;
            d.vx = ny * dirSign * -2 * this.scl + this.vx * 0.5;
            d.vy = -nx * dirSign * -2 * this.scl + this.vy * 0.5;
          }
        }
      }
      if (Math.random() < 0.75) {                               // 编排粒子近似(:43538-43552)
        const a = Math.random() * Math.PI * 2 + Math.PI / 2;
        const rr = (this.w / 2) * this.scl;
        game.spawnParticles(this.cx + Math.cos(a) * rr, this.cy + Math.sin(a) * rr, '#FF66B2',
          1, 1, { life: 20, grav: 0, damp: 0.93 });
      }
    }
    if (this.t === this.life - 10) {                            // 收束爆发(:43554-43572)
      for (let q = 0; q < 4; q += 1) {
        const a = Math.PI * 2 * q * 0.25;
        game.spawnParticles(this.cx, this.cy, '#FF66B2', 2, 6,
          { life: 22, grav: 0, damp: 0.92 });
        void a;
      }
    }
    cutTilesBox(game, this.x, this.y, this.w, this.h);          // CutTiles（:12517/:15276;两门排除表均无 950）
    dealContacts(this, game, this.hitCd, 10);                   // 缺省免疫窗
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    // 本体 alpha=255 不可见——以半透明双环呈现粒子阵包络（原版观感近似）
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity) * 0.28;
    ctx.strokeStyle = '#FF66B2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, (this.w / 2) * this.scl, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = Math.max(0, this.opacity) * 0.16;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, (this.w / 2) * this.scl * (0.4 + 0.6 * this.scl), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}


// ---------------- 修齐批②：钛金屏障碎片 908（AI_175 :46151-46172） ----------------

/** TitaniumStormShard（Player.cs:6927-6936 on-hit 生成≤7;SetDefaults :8628-8638:
 *  14×14/ai175/friendly/penetrate1/timeLeft3600/drawLayer3）：
 *  - frame=rand12、rotation=rand2π 后每拍 +=π/200（:46160-46162）
 *  - 环绕：角=(index/total+miscCounterNormalized×6)×2π、半径=24+total×6,
 *    位=Lerp(位, player.Center+(cos,sin×0.05)×半径, 0.3)（水平扁椭圆,Y 压 0.05）
 *  - 存续门=hasTitaniumStormBuff(buff306)/玩家存活,失即 Kill（:46154-46157）
 *  - 接触伤 50/kb15/penetrate1（命中即亡） */
export class TitaniumStormShard extends Entity {
  w = 14; h = 14;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  readonly projId = 908;
  private t = 0;
  private rot = Math.random() * Math.PI * 2;
  private frame = Math.floor(Math.random() * 12);
  private orbitAngle = 0;
  private hitCd = new HitCdImpl();

  constructor(x: number, y: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.damage = Math.max(1, Math.round(damage));
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player as unknown as { cx: number; cy: number; dead: boolean;
      buffs: { has(t: BuffType): boolean } };
    if (!p || p.dead || !p.buffs.has(BuffType.TitaniumStorm)) { this.dead = true; return; }
    this.t++;
    this.rot += Math.PI / 200;                                 // :46162
    // 组序（AI_GetMyGroupIndexAndFillBlackList 同构近似：同 projId 存活序）
    const all = (game.projectiles?.() ?? []) as Array<{ projId?: number; dead?: boolean }>;
    const group = all.filter((q) => q && !q.dead && q.projId === 908);
    const index = Math.max(0, group.indexOf(this as unknown as { projId?: number; dead?: boolean }));
    const total = Math.max(1, group.length);
    this.orbitAngle = (index / total + this.t / 60 * 6) * Math.PI * 2;
    const radius = 24 + total * 6;                             // :46165
    const tx = p.cx + Math.cos(this.orbitAngle) * radius;
    const ty = p.cy + Math.sin(this.orbitAngle) * radius * 0.05;
    this.x += (tx - this.w / 2 - this.x) * 0.3;                // Lerp 0.3（:46170）
    this.y += (ty - this.h / 2 - this.y) * 0.3;
    dealContacts(this, game, this.hitCd, -1, () => { this.dead = true; });   // penetrate=1
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(908);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const fw = img.width / 12;
      ctx.drawImage(img, this.frame * fw, 0, fw, img.height, -fw / 2, -img.height / 2, fw, img.height);
    } else {
      ctx.fillStyle = '#B8C4D8';
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }
}
