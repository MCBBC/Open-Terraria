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
/** 原版加速趋近模式（Projectile.cs 各宠物分支通用写法）：
 *  cur < want → +=acc（反向时再 +=acc）；cur > want → -=acc（对称） */
function accelToward(cur: number, want: number, acc: number): number {
  if (cur < want) {
    cur += acc;
    if (acc > 0.05 && cur < 0) cur += acc;
  } else if (cur > want) {
    cur -= acc;
    if (acc > 0.05 && cur > 0) cur -= acc;
  }
  return cur;
}

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

// ===================== 实体 =====================
export class PetFollower extends Entity {
  /** 原版宠物全体走 Collision.StepUp（AI_026 :59280 / AI_067 :47756） */
  stepUp = true;
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
  /** 慢速计时（bob 相位 / legacy 正弦浮动共用） */
  private animTick = 0;
  /** aiStyle 67 滚动角（rotation += vx/roll） */
  private rollRot = 0;

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
    const R = this.params;
    if (!R) { this.legacyAI(p); return; }   // 表外 id：回退登记见文件尾
    switch (R.family) {
      case 'ground': this.groundAI(p, game, R); break;
      case 'fly': this.flyAI(p, R); break;
      case 'hover': this.hoverAI(p, R); break;
    }
    this.stepAnim(R);
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
      const flySpeed = e.flySpeed ?? D.flySpeed ?? 10;
      const flyAccel = e.flyAccel ?? D.flyAccel ?? 0.2;
      const tx = (dx0 / want) * flySpeed, ty = (dy0 / want) * flySpeed;
      this.vx = accelToward(this.vx, tx, flyAccel);
      this.vy = accelToward(this.vy, ty, flyAccel);
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
    const targetX = pcx + (e.followDx ?? 0) * p.facing;
    const dxs = targetX - this.cx;
    const idleRange = e.idleRange ?? D.idleRange ?? 85;
    const accel = e.accel ?? D.accel ?? 0.08;
    const maxSpeed = e.maxSpeed ?? D.maxSpeed ?? 6.5;
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
      acc = (e.farAccel !== undefined && d > 300) ? e.farAccel : (e.accel ?? F.accel ?? 0.4);
      const k = spd / (d || 1);
      dx *= k; dy *= k;
    }
    if (acc > 0) {
      this.vx = accelToward(this.vx, dx, acc);
      this.vy = accelToward(this.vy, dy, acc);
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
  private stepAnim(R: PetParams): void {
    const frames = Math.max(1, R.e.frames ?? 1);
    if (frames <= 1) { this.frame = 0; return; }
    switch (R.family) {
      case 'ground': {
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

  // ===================== 绘制 =====================
  draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage(`vanilla/Projectile_${this.projId}.png`);
    const ctx = r.canvas.getContext('2d');
    if (!ctx || !img) return;
    if (!this.params) { this.legacyDraw(ctx, img); return; }
    const frames = Math.max(1, this.params.e.frames ?? 1);
    // 竖排帧条（原版投射物表布局）：帧高 = 图高/帧数；贴图异常（不足一帧）回退整图
    const fh = frames > 1 ? img.height / frames : img.height;
    const useStrip = Number.isFinite(fh) && fh >= 1 && (frames <= 1 || img.height >= frames);
    const sx = 0, sy = useStrip ? Math.round(this.frame * fh) : 0;
    const sw = img.width, sh = useStrip ? Math.round(fh) : img.height;
    // 翻转 = 原版 spriteDirection（flipSign 映射：+1 朝右翻、-1 朝左翻、0 不翻）
    const face = this.params.e.faceFrom === 'player'
      ? (this.ownerRef()?.facing ?? 1)
      : this.dir;
    const flip = (this.params.e.flipSign ?? 0) !== 0
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
  //  ④ AI_026 抚摸(petting)交互帧、尘/Gore 特效未移植。
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

  private legacyDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
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
