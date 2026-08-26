// 宠物跟随实体（vanity/light pet 的视觉体）。
//
// ===== AI 分派（2026-08 升级：统一近似 → 原版 aiStyle 家族分派） =====
// 原版宠物 = 独立投射物 AI。Projectile.AI 按 aiStyle 分派（Projectile.cs），
// 宠物相关家族实测分布（tools/extract-petai.mjs 对 vanilla-pets.json 的 61 个
// 唯一 proj id 统计）：
//   aiStyle 26 → 48 款（AI_026 共享宠物 AI，:55166）：其中 10 款走分支内
//     `tileCollide = false` 的无重力悬停子分支（飞行环绕族），其余 38 款走尾段
//     地面行走+跳跃+超距追赶飞行；
//   aiStyle 67 → 5 款（AI_067_FreakingPirates :46471，滚地族：红心/同伴方块/
//     最脏的块/巨石宠/彩虹巨石宠——rotation += vx/16|20 滚动）；
//   aiStyle 144 → 4 款（AI_144_DD2Pet :66728，DD2 龙/幽灵/欢快之星/斧头仙子）；
//   aiStyle 124 → 2 款（AI() 内联 :34023，可疑触手/格洛默）；
//   aiStyle 11 → 1 款（:22684，暗影宝珠光宠）；
//   aiStyle 90 → 1 款（:31320，魔法灯笼光宠）。
// 运行时按家族分派三套引擎（参数取自 src/data/vanilla-petai.json，逐参数带源码
// 行号）：
//   ground 地面跳跃族 —— 行走(moveAndCollide)+前方挡墙跳跃梯(:59299-59315)+
//     超距(>catchUpRange 或 |dy|>300 :57379)切换无重力追赶飞行(ai[0]!=0 :57447)；
//   fly   飞行环绕族 —— 悬停玩家后上方 + 随机抖动/正弦浮游 + 加速趋近 + 2000 瞬移；
//   hover 悬停锚点族 —— 锚定玩家 MountedCenter 偏移（速度=位移×系数直取）。
// 61 款全覆盖；表外 proj id（未来新增/数据缺口）回退旧"肩后悬停近似"
// （legacyAI/legacyDraw），登记见文件尾。
//
// 存续语义 = Player.UpdatePet（Player.cs:17147-17162）：装备槽 buffType 在位
// 即存活；Game 每帧 ensure/despawn（见 Game.updatePets）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projectileData } from '../data/vanillaProjectiles';
import { moveAndCollide } from '../physics/TileCollision';
import { TILE } from '../core/constants';
import petAiJson from '../data/vanilla-petai.json';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

// ===================== 数据表类型（vanilla-petai.json） =====================
type PetFamily = 'ground' | 'fly' | 'hover';

/** 跟随目标（Game.updatePetSlot 传入主角引用；构造签名对外不变） */
interface OwnerRef {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number; facing: number; dead: boolean;
  /** 玩家速度（动态提速门 :57540/:59145 消费） */
  vx?: number; vy?: number;
}

interface PetAiEntry {
  name: string;
  aiStyle: number;
  family: PetFamily;
  /** ground：目标 X 偏移（target = cx + followDx·facing；负 = 身后；aiStyle 67 族） */
  followDx?: number;
  /** ground：|targetX - cx| ≤ 此值不产生行走冲动（AI_026 num，默认 85 :55178） */
  idleRange?: number;
  accel?: number;        // 行走加速度（num181 :59104）
  maxSpeed?: number;     // 行走速度上限（num182 :59105）
  catchUpRange?: number; // 距离超过 → 追赶飞行（num91 :57320）
  catchUpVert?: number;  // 纵向差超过 → 追赶飞行（:57379 的 300f）
  flyAccel?: number;     // 追赶飞行加速度（num100 :57450）
  flySpeed?: number;     // 追赶飞行速度（num111 :57513）
  landRange?: number;    // 追赶飞行落回地面的距离门（num101 :57451）
  gravity?: number;      // 0.4（:59421）
  fallCap?: number;      // 10
  jumpLadder?: number[]; // [-5.1,-7.1,-11.1,-10.1,-9.1]（:59299-59315）
  teleport?: number;     // 超距瞬移阈值
  /** fly/hover：target = (cx + hoverX·facing, cy + hoverY)（hoverY 负 = 上方） */
  hoverX?: number;
  hoverY?: number;
  jitter?: number;       // fly：目标点随机抖动 ±N（:56495）
  bob?: number;          // fly/hover：正弦浮游幅（774/1046/702）
  bobPeriod?: number;    // 浮游周期 tick
  speed?: number;        // fly：趋近速度（num53 :56515）／hover(11)：环绕速度
  farSpeed?: number;     // fly：远距提速档（197/199）
  farDist?: number;      // fly：远距阈值
  farAccel?: number;     // fly：>300px 加速度档（num41 0.2）
  near?: number;         // fly：贴身门（钳 vy ≥ -6）
  brake?: number;        // fly：刹车距离
  brakeMode?: 'damp' | 'clamp' | 'direct';
  holdDist?: number;     // hover(11)：环绕保持距（num86 :22765）
  speedBase?: number;    // hover(90)：基速（num822 :31378）
  rampDist?: number;     // hover(90)：速度斜坡起距（200）
  ramp?: number;         // hover(90)：斜坡系数（0.1/px）
  speedLerp?: number;    // hover(90)：速度插值权重（num821 :31377）
  snap?: number;         // hover：吸附距（vel ×0.25 门）
  velLerp?: number;      // hover：vel = Δ × 系数（num7 :66737）
  roll?: number;         // aiStyle 67：rotation += vx/N（20｜16）
  faceFrom?: 'move' | 'player' | 'none';
  flipSign?: number;     // +1 朝右翻转；-1 朝左翻转；0 不翻（= 原版 spriteDirection 语义）
  frames?: number;       // Main.projFrames（竖排帧数）
  frameTo?: number;      // hover：动画帧上限（1050 只用 0-2）
  idleRate?: number;     // hover：待机每帧 tick（AI_144 num2）
  moveRate?: number;     // hover：移动每帧 tick（AI_144 num3）
  line?: number;         // 源码行号（该款分支头）
}

interface PetAiTable {
  meta: { petProjCount: number; familyCounts: Record<string, number>; fallback: string };
  defaults: Record<PetFamily, Partial<PetAiEntry>>;
  pets: Record<string, PetAiEntry>;
}

const TABLE = petAiJson as unknown as PetAiTable;

/** 解析后的运行时参数（条目 + 家族默认） */
interface PetParams { family: PetFamily; e: PetAiEntry }
function resolveParams(projId: number): PetParams | null {
  const e = TABLE.pets[String(projId)];
  return e ? { family: e.family, e } : null;
}

// ===================== 共享小工具 =====================
/** 实体盒是否嵌入实心块（越界视作实心——追赶飞行落回门的嵌块判定） */
function solidAtBox(st: { inBounds(c: number, r: number): boolean; isSolid(c: number, r: number): boolean },
  x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!st.inBounds(tx, ty) || st.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

/** 跳跃梯取档（AI_026 :59293-59317 / AI_067 :47754-47780 同构）：按挡墙格头顶净空 */
function jumpPick(st: { inBounds(c: number, r: number): boolean; isSolid(c: number, r: number): boolean },
  tx: number, ty: number, ladder: number[]): number {
  const solid = (x: number, y: number) => st.inBounds(x, y) && st.isSolid(x, y);
  if (!solid(tx, ty - 1) && !solid(tx, ty - 2)) return ladder[0];  // -5.1
  if (!solid(tx, ty - 2)) return ladder[1];                        // -7.1
  if (solid(tx, ty - 5)) return ladder[2];                         // -11.1
  if (solid(tx, ty - 4)) return ladder[3];                         // -10.1
  return ladder[4];                                                // -9.1
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 原版加速趋近模式（Projectile.cs 各宠物分支通用写法）：
 *  cur < want → +=acc（反向时再 +=acc）；cur > want → -=acc（对称） */
export function accelToward(cur: number, want: number, acc: number): number {
  if (cur < want) {
    cur += acc;
    if (acc > 0.05 && cur < 0) cur += acc;
  } else if (cur > want) {
    cur -= acc;
    if (acc > 0.05 && cur > 0) cur -= acc;
  }
  return cur;
}

/** fly 族 Y 轴加速（:56666-56674）：交叉零点时额外步 ×2（vy += num41 后再
 *  velocity.Y<0 时 += num41*2 —— 总步 3×acc；X 轴无此倍率） */
export function accelTowardY(cur: number, want: number, acc: number): number {
  if (cur < want) {
    cur += acc;
    if (acc > 0.05 && cur < 0) cur += acc * 2;
  } else if (cur > want) {
    cur -= acc;
    if (acc > 0.05 && cur > 0) cur -= acc * 2;
  }
  return cur;
}

/** fly 族距离分档加速度（:56560-56640，仅宠物款）：[近阈值, 近档] + [远阈值, 远档]
 *  ——先判 < 近阈值再判 > 远阈值（同 d 不同时成立，后者覆盖）。表外款默认 0.4 */
const FLY_ACCEL_TIERS: Record<number, { near?: [number, number]; far?: [number, number] }> = {
  380:  { near: [100, 0.1], far: [300, 0.4] },   // :56596-56605
  198:  { near: [100, 0.1], far: [300, 0.6] },   // :56611-56619（886 非宠物不入表）
  815:  { near: [100, 0.1] },                     // :56581-56590（无远档）
  817:  { near: [100, 0.1], far: [400, 0.5] },    // :56581-56593（815 排除远档）
  774:  { near: [40, 0.1], far: [300, 0.6] },     // :56626-56634
  1046: { near: [40, 0.1], far: [300, 0.6] },     // :56626-56634
};
export function flyAccelOf(projId: number, d: number, fallback: number): number {
  const t = FLY_ACCEL_TIERS[projId];
  if (!t) return fallback;
  let acc = fallback;
  if (t.near && d < t.near[0]) acc = t.near[1];
  if (t.far && d > t.far[0]) acc = t.far[1];
  return acc;
}

// ===================== 实体 =====================
export class PetFollower extends Entity {
  /** 原版宠物全体走 Collision.StepUp（AI_026 :59280 / AI_067 :47756） */
  stepUp = true;
  stepUpHolds = true; stepUpNpc = true;   // holdsMatching + IgnoredByNpcStepUp（NPC.cs:54382 flag22 恒 true）
  w = 16;
  h = 16;
  dead = false;
  /** AI 参数（表外 id = null → legacy 回退） */
  private readonly params: PetParams | null;
  /** 地面族追赶飞行状态（原版 ai[0] != 0 分支 :57447） */
  private flying = false;
  /** 朝向（原版 direction；翻转经 flipSign 映射 spriteDirection） */
  private dir = 1;
  /** 动画帧与帧内计时（原版 frame/frameCounter） */
  private frame = 0;
  private frameAcc = 0;
  /** 957 弹跳休息计时（原版 localAI[0]：200+rand(150) 掷息 / 移动重置 300——
   *  Projectile.cs:36155/:36185/:36199；初值 0 = 首次静止即弹跳，同原文） */
  private restT = 0;
  /** 960 Chester 开盖段相位闩（原版 localAI[0]：0=开盖首拍帧13 → >6t 置 1 进保持环；
   *  Projectile.cs:63749-63777）与跟踪闩（localAI[1]：入开盖段先清 frameCounter 的
   *  一次性沿 :63751-63755/:63782-63786）。合盖/行走/空中按原文逐处归零 */
  private chestLidPhase = 0;
  private chestLidArm = 0;
  /** 慢速计时（bob 相位 / legacy 正弦浮动共用） */
  private animTick = 0;
  /** aiStyle 67 滚动角（rotation += vx/roll） */
  private rollRot = 0;
  /** Wisp(211) 远距追击闩（原版 localAI[0]，:56867-56925） */
  private wispFar = false;
  /** 被抚摸中（AI_026 flag9 = player.petting.proj == whoAmI，:55182）：闲逛/浮游
   *  态全停（:3898 `ai[1]!=0 || flag9 → flag2=flag3=false`）+ 面向玩家站定。
   *  Game 侧 Player.petAnimal 置位 / updatePettingAnimal 停止时复位（2026-08-20
   *  接通——此前文件尾"④ AI_026 抚摸交互帧未移植"登记销核） */
  beingPetted = false;
  /** 被玩家跟踪为容器（Chester 960 专用；原版 piggyBankProjTracker.IsTracking ↔
   *  Chester_IsAnyPlayerTrackingThisProjectile Projectile.cs:66055-66066）：Game 侧
   *  面板经此宠物打开时置位，Player.HandleBeingInChestRange（Player.cs:31258-31280）
   *  每 tick 复核存活+射程后回写，驱动 type==960 开盖帧段（Projectile.cs:63747） */
  beingTracked = false;

  constructor(x: number, y: number, public readonly projId: number,
    private ownerRef: () => OwnerRef | null) {
    super();
    this.x = x; this.y = y;
    const pd = projectileData(projId);
    this.w = pd?.width ?? 16;
    this.h = pd?.height ?? 16;
    this.params = resolveParams(projId);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const p = this.ownerRef();
    if (!p || p.dead) { this.dead = true; return; }
    this.animTick++;
    // flag27 基准（position.X - oldPosition.X == 0f，Projectile.cs:63335）：
    // 物理/AI 推进前取位，stepAnim 消费（960 帧机"静止/行走"分档判据）
    const prevX = this.x;
    // 被抚摸（AI_026 flag9）：闲逛/浮游停摆 + 面向玩家 + 速度衰减（地面族保留重力）
    if (this.beingPetted) {
      this.dir = Math.sign(p.cx - this.cx) || this.dir;
      this.vx *= 0.8;
      if (this.params?.family === 'ground') {
        const e = this.params.e;
        this.vy = Math.min(this.vy + (e.gravity ?? 0.4), e.fallCap ?? 10);
        moveAndCollide(this, game.world, this.vx, this.vy);
      } else {
        this.vx = 0; this.vy = 0;
      }
      if (this.params) this.stepAnim(this.params, game, this.x !== prevX);
      return;
    }
    const R = this.params;
    if (!R) { this.legacyAI(p); return; }   // 表外 id：回退登记见文件尾
    switch (R.family) {
      case 'ground': this.groundAI(p, game, R); break;
      case 'fly': this.flyAI(p, R); break;
      case 'hover': this.hoverAI(p, R); break;
    }
    this.stepAnim(R, game, this.x !== prevX);
  }

  // =============== 地面跳跃族（aiStyle 26 地面子型 + aiStyle 67 滚地族） ===============
  // AI_026 尾段（:59098-59440）+ ai[0]!=0 追赶飞行（:57447-57610）；
  // AI_067（:46471）同构，差异 = followDx 目标偏移 + roll 滚动角。
  private groundAI(p: OwnerRef, game: GameHooks, R: PetParams): void {
    const e = R.e;
    const D = TABLE.defaults.ground;
    const st = game.world.store;
    const pcx = p.cx, pcy = p.cy;
    const dx0 = pcx - this.cx, dy0 = pcy - this.cy;
    const dist = Math.hypot(dx0, dy0);
    const teleport = e.teleport ?? D.teleport ?? 2000;

    // 超距瞬移（AI_026 :57368-57373 / AI_067 :47386-47388）
    if (dist > teleport) {
      this.x = pcx - this.w / 2; this.y = pcy - this.h / 2;
      this.vx = 0; this.vy = 0; this.flying = false;
      return;
    }

    // 追赶飞行态（无重力直取玩家；AI_026 :57447-57610）
    if (this.flying) {
      const want = dist || 1;
      // ★ 玩家高速动态提速（:57540-57543）：num111 = max(num111, |玩家速度|)——
      //  玩家冲刺/坠落时宠物追赶速度跟随抬高
      const pSpeed = Math.abs(p.vx ?? 0) + Math.abs(p.vy ?? 0);
      const flySpeed = Math.max(e.flySpeed ?? D.flySpeed ?? 10, pSpeed);
      const flyAccel = e.flyAccel ?? D.flyAccel ?? 0.2;
      // ★ <60px 保持当前速度漂移（:57557-57561 num109<60 → 目标速度=当前速度）
      if (dist >= 60) {
        const tx = (dx0 / want) * flySpeed, ty = (dy0 / want) * flySpeed;
        this.vx = accelToward(this.vx, tx, flyAccel);
        this.vy = accelToward(this.vy, ty, flyAccel);
      }
      this.x += this.vx; this.y += this.vy;
      // 落回地面门（:57556-57562）：距玩家 < landRange、玩家落地、宠物不高于玩家脚、
      // 宠物未嵌块 → 退出飞行（vy 钳 ≥ -6）
      const pvy = (p as { vy?: number }).vy ?? 0;
      const landRange = e.landRange ?? D.landRange ?? 200;
      if (dist < landRange && pvy === 0 && this.y + this.h <= p.y + p.h
        && !solidAtBox(st, this.x, this.y, this.w, this.h)) {
        this.flying = false;
        if (this.vy < -6) this.vy = -6;
      }
      return;
    }

    // 落后/被拉开 → 切追赶飞行（:57375-57405：dist > num91 或 |dy| > 300）
    const catchUpRange = e.catchUpRange ?? D.catchUpRange ?? 500;
    const catchUpVert = e.catchUpVert ?? D.catchUpVert ?? 300;
    if (dist > catchUpRange || Math.abs(dy0) > catchUpVert) {
      this.flying = true;
      return;
    }

    // ---- 地面行走（:59187-59221）----
    // ★ 动态目标偏移：960 Chester（:56042-56050）= 玩家身后 70px（玩家移动时取
    //  direction、静止取方位）；1027 GlowPine（:56014-56018）= 玩家朝向反侧 28px
    let targetX: number;
    if (this.projId === 960) {
      const dir = (p.vx ?? 0) !== 0 ? p.facing : Math.sign(pcx - this.cx) || p.facing;
      targetX = pcx - 70 * dir;
    } else if (this.projId === 1027) {
      targetX = pcx - 28 * p.facing;
    } else {
      targetX = pcx + (e.followDx ?? 0) * p.facing;
    }
    const dxs = targetX - this.cx;
    const idleRange = e.idleRange ?? D.idleRange ?? 85;
    const accel = e.accel ?? D.accel ?? 0.08;
    // ★ 玩家高速动态提速（:59145-59148）：num182 = max(num182, |玩家速度|) 且
    //  抬升时 num181=0.3——玩家冲刺时地面宠物步速/加速跟随
    const pSpeedG = Math.abs(p.vx ?? 0) + Math.abs(p.vy ?? 0);
    const baseMax = e.maxSpeed ?? D.maxSpeed ?? 6.5;
    const maxSpeed = Math.max(baseMax, pSpeedG);
    if (dxs < -idleRange) {
      this.vx = this.vx > -3.5 ? this.vx - accel : this.vx - accel * 0.25;
    } else if (dxs > idleRange) {
      this.vx = this.vx < 3.5 ? this.vx + accel : this.vx + accel * 0.25;
    } else {
      this.vx *= 0.9;
      if (Math.abs(this.vx) <= accel) this.vx = 0;
    }
    this.vx = clamp(this.vx, -maxSpeed, maxSpeed);
    // 朝向（:59424-59432：direction = sign(velocity.X)，spriteDirection 由 flipSign 映射）
    if (this.vx < 0) this.dir = -1;
    else if (this.vx > 0) this.dir = 1;

    // ---- 前方挡墙跳跃（:59256-59291 探墙 + :59293-59317 跳跃梯）----
    const moving = Math.abs(dxs) > idleRange && this.vx !== 0;
    if (this.onGround && moving) {
      const d = this.vx > 0 ? 1 : -1;
      const tx = Math.floor(this.cx / TILE) + d + Math.floor(this.vx);
      const ty = Math.floor(this.cy / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) {
        this.vy = jumpPick(st, tx, ty, e.jumpLadder ?? D.jumpLadder ?? [-5.1, -7.1, -11.1, -10.1, -9.1]);
      }
    }

    // 重力 + 碰撞位移（:59421 通用档 velocity.Y += 0.4f / cap 10）
    const grav = e.gravity ?? D.gravity ?? 0.4;
    const fallCap = e.fallCap ?? D.fallCap ?? 10;
    this.vy = Math.min(this.vy + grav, fallCap);
    moveAndCollide(this, game.world, this.vx, this.vy);
    // aiStyle 67 滚动角（AI_067 :46795-46800：rotation += vx/20；1056/1090 /16）
    if (e.roll) this.rollRot += this.vx / e.roll;
  }

  // =============== 飞行环绕族（aiStyle 26 悬停子型） ===============
  // 198 组共享体（:56468-56700）+ 175/197/199/211 独立分支。无 tileCollide。
  private flyAI(p: OwnerRef, R: PetParams): void {
    const e = R.e;
    const F = TABLE.defaults.fly;
    const hoverX = e.hoverX ?? F.hoverX ?? -60;
    const hoverY = e.hoverY ?? F.hoverY ?? -60;
    let tx = p.cx + hoverX * p.facing;
    let ty = p.cy + hoverY;
    if (e.jitter) {  // 每帧重掷目标点（:56495-56497 rand(-10,21)）
      tx += Math.random() * (e.jitter * 2 + 1) - e.jitter;
      ty += Math.random() * (e.jitter * 2 + 1) - e.jitter;
    }
    if (e.bob) {     // 774/1046 正弦浮游（:56489-56493）；702 余弦 bob（AI_144）
      const period = e.bobPeriod || 120;
      ty += Math.cos((this.animTick % period) / period * Math.PI * 2) * e.bob;
    }
    let dx = tx - this.cx, dy = ty - this.cy;
    const d = Math.hypot(dx, dy);
    const teleport = e.teleport ?? F.teleport ?? 2000;
    if (d > teleport) {  // 超距瞬移（:56526-56537）
      this.x = tx - this.w / 2; this.y = ty - this.h / 2;
      this.vx = 0; this.vy = 0;
      return;
    }
    const brake = e.brake ?? F.brake ?? 50;
    const mode = e.brakeMode ?? 'damp';
    let acc: number;
    // ★ Wisp(211) 远距追击档（:56867-56925）：localAI[0] 闩——>200 置位；追击中
    //  恒速 12 直取（<12 直接取位移）；脱离门 = 距 <10 且玩家近乎静止(|v|<12) 且
    //  玩家着地/飞行坐骑。此前只建模近档 → 玩家跑远 Wisp 明显滞后
    if (this.projId === 211) {
      const pSpeed = Math.abs(p.vx ?? 0) + Math.abs(p.vy ?? 0);
      if (!this.wispFar && d > 200) this.wispFar = true;
      if (this.wispFar) {
        if (d < 10 && pSpeed < 12 && ((p.vy ?? 0) === 0)) this.wispFar = false;
        else {
          const k = d < 12 ? 1 : 12 / (d || 1);
          this.vx = dx * k; this.vy = dy * k;
          this.x += this.vx; this.y += this.vy;
          if (this.vx > 0.5) this.dir = -1;
          else if (this.vx < -0.5) this.dir = 1;
          return;   // 追击段独立收尾（原版分支 return :56921）
        }
      }
    }
    if (d < brake) {
      switch (mode) {
        case 'direct':   // 199(:57021)/211(:56892)：贴身直接取位移
          this.vx = dx; this.vy = dy; acc = 0;
          break;
        case 'clamp': {  // 175(:56217-56225)/197：阻尼 + 位移钳 ±2
          if (Math.abs(this.vx) > 2 || Math.abs(this.vy) > 2) { this.vx *= 0.99; this.vy *= 0.99; }
          dx = clamp(dx, -2, 2); dy = clamp(dy, -2, 2);
          acc = 0.01;
          break;
        }
        default: {       // 198 组(:56647-56650)：阻尼 + 微加速度爬行
          if (Math.abs(this.vx) > 2 || Math.abs(this.vy) > 2) { this.vx *= 0.99; this.vy *= 0.99; }
          acc = 0.01;
          break;
        }
      }
    } else {
      const spd = (e.farSpeed !== undefined && e.farDist !== undefined && d > e.farDist)
        ? e.farSpeed : (e.speed ?? F.speed ?? 14);
      acc = (e.farAccel !== undefined && d > 300) ? e.farAccel : flyAccelOf(this.projId, d, e.accel ?? F.accel ?? 0.4);
      const k = spd / (d || 1);
      dx *= k; dy *= k;
    }
    if (acc > 0) {
      this.vx = accelToward(this.vx, dx, acc);
      this.vy = accelTowardY(this.vy, dy, acc);   // Y 轴交叉零点 ×2（:56666-56674）
    }
    this.x += this.vx; this.y += this.vy;
    // 贴身钳 vy（:56537-56542，配合"玩家落地且宠物未嵌块"条件近似）
    const near = e.near ?? F.near ?? 100;
    if (d < near && this.vy < -6) this.vy = -6;
    // 朝向（:56686-56692：|vx|>0.25 阈值；199 恒 spriteDirection=1 由 flipSign=0 表达）
    if (this.vx > 0.25) this.dir = -1;
    else if (this.vx < -0.25) this.dir = 1;
  }

  // =============== 悬停锚点族（aiStyle 11 / 90 / 124 / 144） ===============
  private hoverAI(p: OwnerRef, R: PetParams): void {
    const e = R.e;
    const H = TABLE.defaults.hover;
    const teleport = e.teleport ?? H.teleport ?? 1000;

    // aiStyle 11（:22752-22804）：绕玩家保持 holdDist，速度恒定直取
    if (e.holdDist !== undefined) {
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy);
      if (d > teleport) {
        this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2;
        this.vx = 0; this.vy = 0;
      } else if (d > e.holdDist) {
        const k = (e.speed ?? 3) / (d || 1);
        this.vx = dx * k; this.vy = dy * k;
        this.x += this.vx; this.y += this.vy;
      } else {
        this.vx = 0; this.vy = 0;
      }
      return;
    }

    const tx0 = p.cx + (e.hoverX ?? 0) * p.facing;
    let ty0 = p.cy + (e.hoverY ?? 0);
    if (e.bob) {
      const period = e.bobPeriod || 120;
      ty0 += Math.cos((this.animTick % period) / period * Math.PI * 2) * e.bob;  // AI_144 702 余弦 bob
    }
    const dx = tx0 - this.cx, dy = ty0 - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > teleport) {   // 超距瞬移（124 :34149 / 144 :66804-66806 / 90 :31373）
      this.x = tx0 - this.w / 2; this.y = ty0 - this.h / 2;
      this.vx = 0; this.vy = 0;
      return;
    }

    // aiStyle 90（:31377-31400）：速度斜坡 + 权重插值 v=(v*(n-1)+want)/n
    if (e.speedLerp !== undefined) {
      const base = e.speedBase ?? 4;
      let spd = base;
      if (e.rampDist !== undefined && e.ramp !== undefined && d > e.rampDist) {
        spd += (d - e.rampDist) * e.ramp;
      }
      if (d < spd) { this.vx *= 0.25; this.vy *= 0.25; spd = d; }
      const k = spd / (d || 1);
      const wx = dx * k, wy = dy * k;
      const n = e.speedLerp;
      this.vx = (this.vx * (n - 1) + wx) / n;
      this.vy = (this.vy * (n - 1) + wy) / n;
      this.x += this.vx; this.y += this.vy;
      return;
    }

    // 124/144（:34152-34169 / :66808-66819）：Δ < snap·0.5 直取，否则 vel = Δ×系数
    const snap = e.snap ?? H.snap ?? 4;
    const velLerp = e.velLerp ?? H.velLerp ?? 0.1;
    if (d < snap) { this.vx *= 0.25; this.vy *= 0.25; }
    if (dx !== 0 || dy !== 0) {
      if (Math.hypot(dx, dy) < snap * 0.5) { this.vx = dx; this.vy = dy; }
      else { this.vx = dx * velLerp; this.vy = dy * velLerp; }
    }
    this.x += this.vx; this.y += this.vy;
  }

  // ===================== 动画帧推进 =====================
  // 帧表 = 竖排条（Main.projFrames；帧高 = 图高/帧数）。逐款帧窗口（如 958 行走
  // 5-12/待机 0/空中 4）未逐款移植，按家族通用规则近似：
  //   ground：待机 0／空中 1／行走 0..min(frames,3) 按 |vx| 累进（:61700 通用式
  //           frameCounter += |vx|，>6 进帧）；
  //   fly：匀速循环全表（移动 4t/帧、待机 8t/帧）；
  //   hover：AI_144/124 原版双速率（待机 idleRate/移动 moveRate，vel>6 判移动）。
  //   ★957 GlommerPet 走专支（见 case 'hover' 头部注释）。
  //   ★960 Chester 宠物箱走专支（见 case 'ground' 头部注释——2026-08-26 接通，
  //     此前落在本文件尾"③ 地面族逐款帧窗口"近似登记内）。
  private stepAnim(R: PetParams, game?: GameHooks, movedX = true): void {
    const frames = Math.max(1, R.e.frames ?? 1);
    if (frames <= 1) { this.frame = 0; return; }
    switch (R.family) {
      case 'ground': {
        // ---- ★T3 Chester 宠物箱 960 专属帧机（Projectile.cs:63714-63828 AI_026
        // type==960 支 1:1；20 帧床：0-3 待机 6t/帧 / 4 空中 / 5-12 行走 /
        // 13-18 开盖段 / 19 合盖过渡）。分档判据 = 空中(vy≠0 :63717)、
        // 静止(flag27=本 tick 水平零位移 :63335/:63724)、被跟踪(:63747) ----
        if (this.projId === 960 && frames === 20) {
          this.chesterStepAnim(movedX);
          break;
        }
        if (!this.onGround) { this.frame = Math.min(1, frames - 1); this.frameAcc = 0; break; }
        if (Math.abs(this.vx) <= 0.1) { this.frame = 0; this.frameAcc = 0; break; }
        this.frameAcc += Math.abs(this.vx);
        if (this.frameAcc > 6) {
          this.frameAcc = 0;
          const walk = Math.max(1, Math.min(frames, 3));
          this.frame = (this.frame + 1) % walk;
        }
        break;
      }
      case 'fly': {
        const rate = Math.hypot(this.vx, this.vy) > 1 ? 4 : 8;
        if (++this.frameAcc >= rate) { this.frameAcc = 0; this.frame = (this.frame + 1) % frames; }
        break;
      }
      case 'hover': {
        // ---- ★B1 接线批：957 GlommerPet 待机弹跳专支（Projectile.cs:36126-36205，
        // aiStyle124 内联 type==957 段）——静止(v≤0.01)且中心列探针过（下方连续 4 格
        // 非实+第 5 格实，SolidTileAllowBottomSlope :36138-36160）时进入弹跳段：
        // localAI[0] 归零后帧跳 num936×2=24 起、3t/帧（帧≤30 段 2t/帧——原文
        // `frame<=30 && frame<=33` 两条件同域取严 :36166-36168），36 归零并掷休息
        // 计时 200+rand(150)；休息期与移动期同档 4t/帧扫 0..23（:36190-36205）。
        // 帧==32 触发 GlommerBounce（:36173-36174；SoundID.cs:1054 双变体 ×0.5）
        // ——触发点在推进器单点自增内，同帧天然不重复。其余 hover 族维持原近似。 ----
        if (this.projId === 957 && game && frames === 12) {
          const resting = Math.hypot(this.vx, this.vy) <= 0.01 && this.glommerGroundProbe(game);
          if (!resting) {
            this.restT = 300;                                   // :36161/:36199 移动/悬空重置
            if (++this.frameAcc >= 4) { this.frameAcc = 0; this.frame = (this.frame + 1) % 24; }
            break;
          }
          if (--this.restT > 0) {                               // 休息期慢扫（:36190-36198）
            if (++this.frameAcc >= 4) { this.frameAcc = 0; if (++this.frame >= 24) this.frame = 0; }
            break;
          }
          this.restT = 0;
          if (this.frame < 24) this.frame = 24;                 // 入弹跳段先跳 24（:36164-36165）
          if (++this.frameAcc >= (this.frame <= 30 ? 2 : 3)) {
            this.frameAcc = 0;
            this.frame++;
            if (this.frame >= 36) {                             // 弹跳收拍 → 掷下一轮计时
              this.restT = 200 + Math.floor(Math.random() * 150);
              this.frame = 0;
              break;
            }
            if (this.frame === 32) game.playSfxFiles(['glommer_bounce_0', 'glommer_bounce_1'], 0.5, this.cx, this.cy);
          }
          break;
        }
        const e = R.e;
        const rate = Math.hypot(this.vx, this.vy) > 6
          ? (e.moveRate ?? 4) : (e.idleRate ?? 6);
        if (++this.frameAcc >= rate) {
          this.frameAcc = 0;
          const to = e.frameTo !== undefined ? Math.min(e.frameTo, frames - 1) : frames - 1;
          this.frame = this.frame >= to ? 0 : this.frame + 1;
        }
        break;
      }
    }
  }

  /** ★T3 Chester 宠物箱 960 帧机（Projectile.cs:63714-63828 AI_026 type==960 支 1:1）。
   *  20 帧床分段：0-3 待机（frameCounter/6 :63798-63805）/ 4 空中（:63722）/ 5-12 行走
   *  （frameCounter += max(2,|v|)，窗界外回 5，:63808-63823）/ 13 开盖首拍（>6t 进保持，
   *  :63749-63764）/ 14-18 开盖保持环（>6t 步进越界回 14，:63765-63777）/ 19 合盖过渡
   *  （停 7t 回 0，:63787-63796）。状态闩 chestLidPhase/chestLidArm = localAI[0]/[1]、
   *  frameAcc = frameCounter；movedX 取反即 flag27（position.X-oldPosition.X==0f :63335） */
  private chesterStepAnim(movedX: boolean): void {
    // 空中档（velocity.Y != 0f :63717-63723；本仓落地碰撞逐 tick 清 vy——
    // TileCollision moveAxis `if (b.vy > 0) b.vy = 0`,贴地即 vy==0 同原文语义）：
    // 全状态复位 + 定格帧 4
    if (this.vy !== 0) {
      this.chestLidPhase = 0; this.chestLidArm = 0; this.frameAcc = 0;
      this.frame = 4;
      return;
    }
    // ---- 静止档（flag27 :63724）----
    if (!movedX) {
      // 面向玩家（!flag11 门 :63726-63733——追赶飞行态不夺朝向；960 族
      // spriteDirection=direction 直映 Projectile.cs:63331-63334 → dir=玩家侧符号）
      if (!this.flying) {
        const p = this.ownerRef();
        if (p) this.dir = Math.sign(p.cx - this.cx) || this.dir;
      }
      // 收步段：行走循环未走完先收完（5..11 每 4t 进帧、到 12 归 0，:63734-63746）
      if (this.frame >= 5 && this.frame < 12) {
        if (++this.frameAcc > 3) {
          this.frameAcc = 0;
          this.frame++;
          if (this.frame >= 12) this.frame = 0;
        }
        return;
      }
      // 被跟踪 → 开盖段（Chester_IsAnyPlayerTrackingThisProjectile :63747/:66055-66066；
      // beingTracked 由 Game T2 每 tick 回写）
      if (this.beingTracked) {
        if (this.chestLidPhase === 0) {                 // localAI[0]==0 首拍（:63749-63764）
          if (this.chestLidArm === 0) { this.chestLidArm = 1; this.frameAcc = 0; }  // localAI[1] 沿
          this.frame = 13;
          if (++this.frameAcc > 6) { this.chestLidPhase = 1; this.frame = 14; this.frameAcc = 0; }
        } else {                                        // 保持环 14..18（:63765-63777）
          if (++this.frameAcc > 6) {
            this.frame++;
            if (this.frame > 18) this.frame = 14;
            this.frameAcc = 0;
          }
        }
        return;
      }
      // 无人跟踪：复位开盖闩（:63781-63786）+ 合盖过渡/待机轮（:63787-63805）
      this.chestLidPhase = 0;
      if (this.chestLidArm === 1) { this.chestLidArm = 0; this.frameAcc = 0; }
      if (this.frame >= 12 && this.frame <= 19) {       // 合盖过渡定格 19（:63787-63796）
        this.frame = 19;
        if (++this.frameAcc > 6) { this.frame = 0; this.frameAcc = 0; }
        return;
      }
      if (++this.frameAcc >= 24) this.frameAcc = 0;     // 待机 0..3（frameCounter/6）
      this.frame = Math.floor(this.frameAcc / 6);
      return;
    }
    // ---- 行走档（else of flag27 :63808-63823）：闩全清 + 速度累进帧 ----
    this.chestLidPhase = 0; this.chestLidArm = 0;
    this.frameAcc += Math.floor(Math.max(2, Math.hypot(this.vx, this.vy)));
    if (this.frameAcc > 6) { this.frame++; this.frameAcc = 0; }
    if (this.frame < 5 || this.frame > 12) this.frame = 5;   // 窗界钳回 5
  }

  /** 957 地面探针（Projectile.cs:36138-36160）：中心格起下探 5 格——前 4 格全非实、
   *  第 5 格实心才许弹跳。SolidTileAllowBottomSlope 以本仓 isSolid 近似（jumpPick
   *  同口径），越界=不可弹跳（原文坐标钳同样置 false） */
  private glommerGroundProbe(game: GameHooks): boolean {
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    for (let i = 0; i < 5; i++) {
      if (!st.inBounds(tx, ty + i)) return false;
      if ((st.isSolid(tx, ty + i)) !== (i === 4)) return false;
    }
    return true;
  }

  // ===================== 绘制 =====================
  draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage(`vanilla/Projectile_${this.projId}.png`);
    const ctx = r.ctx;
    if (!ctx || !img) return;
    if (!this.params) { this.legacyDraw(ctx, img); return; }
    const frames = Math.max(1, this.params.e.frames ?? 1);
    // 竖排帧条（原版投射物表布局）：帧高 = 图高/帧数；贴图异常（不足一帧）回退整图
    const fh = frames > 1 ? img.height / frames : img.height;
    const useStrip = Number.isFinite(fh) && fh >= 1 && (frames <= 1 || img.height >= frames);
    // ★B1：957 帧床是 3 列 × projFrames 行横排（Main.cs:33708-33713
    // `Frame(3, projFrames)`，frameX=frame/12、frameY=frame%12）——弹跳段线性帧号
    // 24..35 落在第 3 列，竖条假设会越界取空。按列宽 1/3 切片（Projectile_957.png
    // 实测 168×1296 → 单格 56×108）
    let sx = 0, sy = useStrip ? Math.round(this.frame * fh) : 0;
    let sw = img.width;
    if (useStrip && this.projId === 957 && frames > 1) {
      const fw = Math.floor(img.width / 3);
      sx = Math.round(Math.floor(this.frame / frames) * fw);
      sy = Math.round((this.frame % frames) * fh);
      sw = fw;
    }
    const sh = useStrip ? Math.round(fh) : img.height;
    // 翻转 = 原版 spriteDirection（flipSign 映射：+1 朝右翻、-1 朝左翻、0 不翻）；
    // ★ 313 Spider 例外（:59361 `type != 313` 门——原版跳过 spriteDirection 赋值，恒不翻）
    const face = this.params.e.faceFrom === 'player'
      ? (this.ownerRef()?.facing ?? 1)
      : this.dir;
    const flip = this.projId !== 313
      && (this.params.e.flipSign ?? 0) !== 0
      && this.params.e.flipSign === Math.sign(face || 1);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.imageSmoothingEnabled = false;
    if (this.params.e.roll) ctx.rotate(this.rollRot);
    else if (flip) ctx.scale(-1, 1);
    // 帧按原像素尺寸 1:1 绘制（原版投射物 scale=1，判定盒小于贴图帧）
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  // =============== 回退：旧统一肩后悬停近似（表外 proj id 用） ===============
  // 登记缺口（本次升级后残留的近似项）：
  //  ① Wisp(211)/ShadowOrb(18) 的控制键偏移（controlUp/Down ±40、controlLeft/Right
  //    ±120）——ownerRef 无输入态，未建模；
  //  ② 764 UpbeatStar 透明度脉冲、1050 AxeFairyPet 砍树行为、653 同伴方块岩浆
  //    尖叫/黑暗戳人、1090 彩虹巨石微光粒子——纯视觉/彩蛋，未移植；
  //  ③ 地面族逐款帧窗口（958 行走 5-12、825 待机表情轮盘等）与 208 鹦鹉 0.95
  //    水平阻尼、1027 波浪帧段——按家族通用规则近似；
  //    ★960 Chester 已转正专支（chesterStepAnim，Projectile.cs:63714-63828，
  //    2026-08-26 接通——开盖/合盖/行走/待机四段 1:1），从本登记销核；
  //  ④ AI_026 抚摸(petting)：已接通（beingPetted 2026-08-20——flag9 闲逛/浮游停摆 +
  //     面向玩家，全链在 Player.petAnimal/updatePettingAnimal + Game 右键链）。
  //     残留：Pal 族(1093/1094/1098)专属 Joy 音效（1.4.5 Palworld 联动，素材
  //     dd2 系无对应 wav，登记）。
  private legacyAI(p: OwnerRef): void {
    // 目标位：玩家肩后（朝向反向 ×22px，头侧 -26px）+ 正弦浮动（±4px，0.06/t）
    const bob = Math.sin(this.animTick * 0.06) * 4;
    const tx = p.cx - p.facing * 22 - this.w / 2;
    const ty = p.y - 26 + bob;
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1200) { this.x = tx; this.y = ty; return; }  // 远距瞬移近似
    const step = Math.min(6, dist);
    if (dist > 0.01) {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  private legacyDraw(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement): void {
    // 横排帧假设（旧版）：帧宽 = 贴图高（方形帧）；不足一帧的整图直接画
    const fw = img.height;
    const frames = fw > 0 ? Math.max(1, Math.floor(img.width / fw)) : 1;
    const fi = frames > 1 ? Math.floor(this.animTick / 8) % frames : 0;
    const p = this.ownerRef();
    const flip = p ? p.facing < 0 : false;
    ctx.save();
    if (flip) {
      ctx.translate(this.x + this.w, this.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, fi * fw, 0, fw, fw, 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(img, fi * fw, 0, fw, fw, this.x, this.y, this.w, this.h);
    }
    ctx.restore();
  }
}
