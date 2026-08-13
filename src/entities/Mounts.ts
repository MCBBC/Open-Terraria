// 坐骑系统（1.4.5.6 原版 1:1 移植：Terraria/Mount.cs + Terraria.ID/MountID.cs +
// Player.cs 骑乘接管段 :26310-26334/:26416/:26637-26700/:35734-35790）。
//
// 数据源 = tools/extract-mounts.mjs 从反编译源码提取的 src/data/vanilla-mounts.json
//（64 坐骑全量：参数/帧组/贴图表名/能力位/召唤物品/坐骑 buff）。
// 矿车族（MountID.Sets.Cart）走 src/entities/Minecart.ts 轨道运动学，本模块不回退
//（isCart 门：参数/帧状态仍可查询，物理由 Minecart 接管）。
//
// 三模物理接管（Player.fixedUpdate 挂钩）：
//   陆行族 —— Run 段参数覆写（Player.cs:26329-26331：maxRun=RunSpeed/accRun=DashSpeed/
//             runAcc=Acceleration），常规 moveAndCollide 碰撞照走；
//   飞行族 —— usesHover（UFO 7/蜜蜂 5/猪鲨崽 12/巫婆扫帚 23/熔岩鲨 49）走 Hover()
//             能量-疲劳双池 1:1；非 hover 的飞行坐骑（驯鹿 0/猪龙 2）走 Flight()
//             飞行时量 + 松键重力/3 衰减；
//   游泳族 —— 海龟 4/猪鲨崽 12/海盗船 44/熔岩鲨 49：buff 131/168/265 授予 ignoreWater
//             （Player.cs:9592-9608）→ 水下不降速不溺水物理，frameState==4 时
//             RunSpeed→swimSpeed、跳跃 +5 高 /+2.5 速（Mount.JumpHeight/JumpSpeed）。
import mountJson from '../data/vanilla-mounts.json';

// ---- 数据表类型（vanilla-mounts.json 提取产物） ----
export interface MountData {
  buff: number;
  /** 变身坐骑（52/54-56/61）与滚轴鞋（57-60）原版未设 = 0 */
  heightBoost?: number;
  flightTimeMax?: number;
  fatigueMax?: number;
  fallDamage?: number;
  extraFall?: number;
  runSpeed: number;
  dashSpeed?: number;
  swimSpeed?: number;
  acceleration: number;
  jumpHeight: number;
  jumpSpeed: number;
  usesHover?: boolean;
  constantJump?: boolean;
  blockExtraJumps?: boolean;
  abilityChargeMax?: number;
  abilityDuration?: number;
  abilityCooldown?: number;
  walkingGraceTimeMax?: number;
  totalFrames: number;
  playerYOffsets?: number[];
  xOffset?: number;
  yOffset?: number;
  playerHeadOffset?: number;
  bodyFrame?: number;
  spawnDust?: number;
  Minecart?: boolean;
  CanRideMinecartTracks?: boolean;
  CanUseWings?: boolean;
  emitsLight?: boolean;
  lightColor?: number[];
  standingFrameStart?: number; standingFrameCount?: number; standingFrameDelay?: number;
  runningFrameStart?: number; runningFrameCount?: number; runningFrameDelay?: number;
  flyingFrameStart?: number; flyingFrameCount?: number; flyingFrameDelay?: number;
  inAirFrameStart?: number; inAirFrameCount?: number; inAirFrameDelay?: number;
  idleFrameStart?: number; idleFrameCount?: number; idleFrameDelay?: number;
  idleFrameLoop?: boolean;
  swimFrameStart?: number; swimFrameCount?: number; swimFrameDelay?: number;
  dashingFrameStart?: number; dashingFrameCount?: number; dashingFrameDelay?: number;
  backTexture?: string; frontTexture?: string;
  backTextureExtra?: string; frontTextureExtra?: string;
  backTextureGlow?: string; frontTextureGlow?: string;
}

export const MOUNT_COUNT: number = mountJson.count;
/** id → 内部名（MountID.cs const 表） */
export const MOUNT_NAMES: Record<string, string> = mountJson.names;
/** id → 数据（Mount.cs Initialize() 提取） */
export const MOUNT_DATA: Record<string, MountData> = mountJson.mounts;
/** MountID.Sets 能力位（CreateBoolSet/CreateIntSet 展开） */
export const MOUNT_SETS: Record<string, boolean[]> = mountJson.sets;
/** 召唤物品 id → 坐骑 id（Item.cs SetDefaults `mountType = N` / DefaultToMinecart） */
export const ITEM_TO_MOUNT: Record<string, number> = mountJson.itemMount;
/** 坐骑 buff id → 坐骑 id（BuffID.Sets.MountType） */
export const BUFF_TO_MOUNT: Record<string, number> = mountJson.buffMount;
/** 主贴图可得性登记（terraria-assets 缺表的坐骑 → 色块近似渲染） */
export const MOUNT_TEXTURE_OK: Record<string, boolean> = mountJson.textureOk;

export const mountName = (id: number): string => MOUNT_NAMES[String(id)] ?? `Mount${id}`;
export const isCartMount = (id: number): boolean => !!MOUNT_SETS.Cart?.[id];

/** 贴图不可得坐骑的色块近似渲染色（按生物族群登记；其余默认棕） */
const MOUNT_FALLBACK_COLOR: Record<number, string> = {
  0: '#B03030', 1: '#E8E0D8', 2: '#C060C0', 3: '#4080FF', 4: '#406040', 5: '#E8B020',
  7: '#9098C0', 8: '#C0C8D0', 9: '#704030', 10: '#F0F0F0', 12: '#60A0E0', 14: '#C8B060',
  17: '#E0E0E0', 23: '#804020', 37: '#F090B0', 40: '#A06030', 41: '#D8D0C0', 42: '#403848',
  43: '#C05030', 44: '#805838', 45: '#705030', 46: '#38A848', 47: '#C04858', 48: '#5858C8',
  49: '#E05020', 50: '#6090FF', 52: '#A0A8B0', 54: '#C8A060', 55: '#909098', 56: '#584868',
  57: '#E8E8E8', 58: '#58C058', 59: '#F0F0F0', 60: '#F090C0', 61: '#F0D048', 62: '#68C8E8',
  63: '#F08040',
};
export const mountFallbackColor = (id: number): string => MOUNT_FALLBACK_COLOR[id] ?? '#8A6A4A';

/** 坐骑 buff 授予的水下自由语义（Player.cs UpdateBuffs :9592-9608：
 *  131 海龟 / 168 猪鲨崽 → ignoreWater+accFlipper；265 熔岩鲨 → canFloatInWater+accFlipper） */
const BUFF_SWIM_FREE = new Set([131, 168, 265, 279]);

/** MountInstance 消费的玩家视图（结构性接口，避免与 Player 循环依赖） */
export interface MountedPlayerView {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  inWater: boolean;
  facing: number;
  inputX: number; inputJump: boolean; inputUp: boolean; inputDown: boolean;
  /** 上一 tick 是否按下跳跃（releaseJump 语义：松开后才可重触发飞行/起跳） */
  prevInputJump: boolean;
  gravDir: number;
  /** 缓存世界（fixedUpdate 每帧刷新；Hover/TryBeginningFlight 的 tile 探针用） */
  store: {
    inBounds(tx: number, ty: number): boolean;
    idx(tx: number, ty: number): number;
    flags: Uint8Array | number[];
    isSolid(tx: number, ty: number): boolean;
  } | null;
}

/** 帧状态（Mount.cs FrameStanding..FrameDashing 常量） */
export const FRAME_STANDING = 0;
export const FRAME_RUNNING = 1;
export const FRAME_IN_AIR = 2;
export const FRAME_FLYING = 3;
export const FRAME_SWIMMING = 4;
export const FRAME_DASHING = 5;

const DEFAULT_GRAVITY = 0.4;

/**
 * 单坐骑实例状态机（Mount.cs 实例字段 + 行为 1:1）。
 * 玩家持有恒一个实例（player.mount），active 即骑乘中。
 */
export class MountInstance {
  active = false;
  type = -1;
  /** 当前帧索引（竖排帧条第 frame 行） */
  frame = 0;
  private frameCounter = 0;
  frameExtra = 0;
  private frameExtraCounter = 0;
  /** 帧状态机态（FRAME_*） */
  frameState = FRAME_STANDING;
  /** 飞行剩余 tick（flightTimeMax；ResetFlightTime 重置） */
  flyTime = 0;
  /** 飞行疲劳（hover 族用尽 flyTime 后累积，疲劳越高爬升越弱） */
  fatigue = 0;
  private fatigueMax = 0;
  abilityCharging = false;
  abilityCharge = 0;
  abilityCooldown = 0;
  abilityDuration = 0;
  /** 离地行走宽限（UpdateFrame :3599：vy!=0 起每帧 -1，归零才切空中帧） */
  walkingGraceTime = 0;
  private idleTime = 0;
  private idleTimeNext = -1;
  /** 待机随机数种子（UpdateFrame state0 idle 触发 rand(900,1500) 的本仓等价） */
  private idleRand = Math.random();

  get data(): MountData | null {
    return this.active ? MOUNT_DATA[String(this.type)] ?? null : null;
  }

  /** 矿车族：物理由 Minecart.ts 接管（Player.ridingCart 分支），本实例只保留参数查询 */
  get isCart(): boolean {
    return this.active && isCartMount(this.type);
  }

  get buff(): number { return this.data?.buff ?? -1; }
  get bodyFrame(): number { return this.data?.bodyFrame ?? 3; }
  get heightBoost(): number { return this.data?.heightBoost ?? 0; }
  get blockExtraJumps(): boolean { return !!this.data?.blockExtraJumps; }
  get autoJump(): boolean { return !!this.data?.constantJump; }
  get fallDamageFactor(): number { return this.data?.fallDamage ?? 1; }
  get extraFall(): number { return this.data?.extraFall ?? 0; }
  /** 游泳族门：坐骑 buff 在水下自由集内（Player.cs:9592-9608 的 ignoreWater 等价） */
  get swimFree(): boolean { return this.active && BUFF_SWIM_FREE.has(this.buff); }

  // ---- Mount.cs RunSpeed getter :451-486（每坐骑特例 1:1） ----
  runSpeed(): number {
    const d = this.data;
    if (!d) return 0;
    // 海龟/猪鲨崽/海盗船/熔岩鲨：游泳帧态下取 swimSpeed
    if (this.type === 4 && this.frameState === FRAME_SWIMMING) return d.swimSpeed ?? d.runSpeed;
    if ((this.type === 12 || this.type === 44 || this.type === 49) && this.frameState === FRAME_SWIMMING) {
      return d.swimSpeed ?? d.runSpeed;
    }
    if (this.type === 12 && this.frameState === FRAME_IN_AIR) return d.runSpeed + 13.5;
    if (this.type === 44 && this.frameState === FRAME_IN_AIR) return d.runSpeed + 4;
    if (this.type === 5 && this.frameState === FRAME_IN_AIR) {
      const t = this.fatigueMax > 0 ? this.fatigue / this.fatigueMax : 0;
      return d.runSpeed + 4 * (1 - t);
    }
    if (this.type === 50 && this.frameState === FRAME_IN_AIR) return d.runSpeed + 2;
    return d.runSpeed;
  }

  get dashSpeed(): number { return this.data?.dashSpeed ?? this.data?.runSpeed ?? 0; }
  get acceleration(): number { return this.data?.acceleration ?? 0.1; }

  // ---- Mount.cs JumpHeight/JumpSpeed :2767-2816 ----
  jumpHeight(xVelocity: number): number {
    const d = this.data;
    if (!d) return 0;
    let n = d.jumpHeight;
    if (this.type === 0) n += Math.trunc(Math.abs(xVelocity) / 4);
    else if (this.type === 1) n += Math.trunc(Math.abs(xVelocity) / 2.5);
    else if ((this.type === 4 || this.type === 49) && this.frameState === FRAME_SWIMMING) n += 5;
    return n;
  }

  jumpSpeed(xVelocity: number): number {
    const d = this.data;
    if (!d) return 0;
    let n = d.jumpSpeed;
    if (this.type === 0 || this.type === 1) n += Math.abs(xVelocity) / 7;
    else if ((this.type === 4 || this.type === 49) && this.frameState === FRAME_SWIMMING) n += 2.5;
    return n;
  }

  // ---- Mount.cs CanFly/CanHover :2817-2859 ----
  canFly(p: MountedPlayerView): boolean {
    if (!this.active) return false;
    const d = this.data;
    if (!d) return false;
    if ((d.flightTimeMax ?? 0) === 0) return false;
    if (this.type === 48) return false;    // DarkMageBook 永不飞行
    void p;
    return true;
  }

  canHover(p: MountedPlayerView): boolean {
    if (!this.active) return false;
    const d = this.data;
    if (!d || !d.usesHover) return false;
    if (this.type === 49) return this.frameState === FRAME_SWIMMING;   // 熔岩鲨只在水中悬停
    void p;
    return true;
  }

  /** hover 是否豁免疲劳池（DoesHoverIgnoresFatigue :3534：无 fatigueMax 的 hover 坐骑） */
  private hoverIgnoresFatigue(): boolean {
    return (this.data?.fatigueMax ?? 0) <= 0;
  }

  // ---- 能量/疲劳恢复（Mount.cs :2897-2945） ----
  abilityRecovery(): void {
    if (this.abilityCharging) {
      if (this.abilityCharge < (this.data?.abilityChargeMax ?? 0)) this.abilityCharge++;
    } else if (this.abilityCharge > 0) this.abilityCharge--;
    if (this.abilityCooldown > 0) this.abilityCooldown--;
    if (this.abilityDuration > 0) this.abilityDuration--;
  }

  fatigueRecovery(): void {
    if (this.fatigue > 2) this.fatigue -= 2;
    else this.fatigue = 0;
  }

  /** 非悬停飞行坐骑的能量消费（Flight :2937：flyTime 递减，耗尽返回 false） */
  flight(): boolean {
    if (this.flyTime <= 0) return false;
    this.flyTime--;
    return true;
  }

  resetFlightTime(p: MountedPlayerView): void {
    const d = this.data;
    this.flyTime = this.active ? d?.flightTimeMax ?? 0 : 0;
    // 驯鹿：落地瞬间按水平速度续飞（:5267 flyTime += |vx|*20）
    if (this.type === 0) this.flyTime += Math.trunc(Math.abs(p.vx) * 20);
  }

  // ---- 悬停物理（Mount.cs Hover :3310-3466 主体 1:1） ----
  hover(p: MountedPlayerView): boolean {
    const d = this.data;
    if (!d) return false;
    const noFatigue = this.hoverIgnoresFatigue();
    // 悬停生效帧态（:3313-3332）：默认空中/游泳；熔岩鲨限游泳；56/61 蝙蝠/精灵族含飞行
    let flyingState = this.frameState === FRAME_IN_AIR || this.frameState === FRAME_SWIMMING;
    if (this.type === 49) flyingState = this.frameState === FRAME_SWIMMING;
    if (this.type === 56 || this.type === 61) {
      flyingState = this.frameState === FRAME_IN_AIR || this.frameState === FRAME_FLYING;
    }
    if (flyingState) {
      let canLift = true;
      let mult = 1;
      // 猪鲨崽未湿身减半（:3344-3348 MountFishronSpecial 未实装走减半支线）
      if (this.type === 12 && p.inWater === false) mult = 0.5;
      const fatigueRatio = noFatigue ? 0 : this.fatigueMax > 0 ? this.fatigue / this.fatigueMax : 0;
      // 能量池：先吃 flyTime，尽后累积疲劳，疲劳满则失去升力（:3322-3342）
      if (!noFatigue) {
        if (this.flyTime > 0) this.flyTime--;
        else if (this.fatigue < this.fatigueMax) this.fatigue += 1;
        else canLift = false;
      }
      let vMin = 4 * fatigueRatio;
      let vMax = 4 * fatigueRatio;
      if (vMin === 0) vMin = -0.001;
      if (vMax === 0) vMax = -0.001;
      let vy = p.vy;
      // 升降输入（:3396-3424）
      if ((p.inputUp || p.inputJump) && canLift) {
        vMin = -2 - 6 * (1 - fatigueRatio);
        if (this.type === 56 || this.type === 61) vMin = -d.dashSpeed!;
        vy -= d.acceleration * mult;
      } else if (p.inputDown) {
        vMax = 8;
        if (this.type === 56 || this.type === 61) vMax = d.dashSpeed!;
        vy += d.acceleration * mult;
      }
      // 钳位带（:3426-3436：超带按 acceleration 回拉）
      if (vy < vMin) {
        vy = (vMin - vy < d.acceleration) ? vMin : vy + d.acceleration * mult;
      } else if (vy > vMax) {
        vy = (vy - vMax < d.acceleration) ? vMax : vy - d.acceleration * mult;
      }
      if (this.type === 56 || this.type === 61) {
        if (vMin !== -0.001) vy = Math.max(vy, vMin);
        if (vMax !== -0.001) vy = Math.min(vy, vMax);
      }
      p.vy = vy;
    } else if (!noFatigue) {
      // 非悬停帧态：正常重力（:3440）
      p.vy += DEFAULT_GRAVITY * p.gravDir;
    }
    return true;
  }

  /** 起跳瞬间向上的 hover 触发（Player.cs:26416：vy==0 且 CanHover 且按上且松键边沿） */
  tryStartHover(p: MountedPlayerView): void {
    if (p.vy === 0 && this.canHover(p) && p.inputUp && !p.prevInputJump) {
      p.vy = -(this.acceleration + DEFAULT_GRAVITY + 0.001);
    }
  }

  /** 退出飞行帧态探测（Mount.cs TryBeginningFlight :4509-4528） */
  tryBeginningFlight(p: MountedPlayerView, state: number): void {
    if (this.frameState === state || (state !== FRAME_IN_AIR && state !== FRAME_FLYING)
      || !this.canHover(p) || p.inputUp || p.inputDown || p.inputJump) return;
    const st = p.store;
    if (!st) return;
    const ty = Math.floor((p.y + p.h + 1) / 16);
    let blocked = false;
    for (let tx = Math.floor(p.x / 16); tx <= Math.floor((p.x + p.w - 1) / 16); tx++) {
      if (st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty)) { blocked = true; break; }
    }
    if (blocked && this.hoverIgnoresFatigue()) p.y -= 0.001;
  }

  /** 落地帧态探测（Mount.cs TryLanding :4544-4558：无升降输入且下方 4px 无地面） */
  tryLanding(p: MountedPlayerView): void {
    if ((this.frameState === FRAME_FLYING || this.frameState === FRAME_IN_AIR)
      && !p.inputUp && !p.inputDown && !p.inputJump) {
      const st = p.store;
      if (!st) return;
      const ty = Math.floor((p.y + p.h + 4) / 16);
      let grounded = false;
      for (let tx = Math.floor(p.x / 16); tx <= Math.floor((p.x + p.w - 1) / 16); tx++) {
        if (st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty)) { grounded = true; break; }
      }
      if (!grounded) this.updateFrame(p, this.intendedGroundedFrame(p), p.vx, p.vy);
    }
  }

  /** 地面帧态意图（Mount.cs GetIntendedGroundedFrame :4529-4543） */
  intendedGroundedFrame(p: MountedPlayerView): number {
    const still = p.vx === 0;
    if (still) return FRAME_STANDING;
    return FRAME_RUNNING;
  }

  // ---- 帧状态机（Mount.cs UpdateFrame :3563-4490 的通用路径 + 常用族特例） ----
  updateFrame(p: MountedPlayerView, state: number, vx: number, vy: number): void {
    const d = this.data;
    if (!d) return;
    if (this.frameState !== state) {
      this.frameState = state;
      // UFO（7）恒空中帧；熔岩鲨浸水恒游泳帧（:3688/:3697-3710）
      if (!(this.type === 7)) this.frameCounter = 0;
    }
    if (this.type === 7) state = FRAME_FLYING;
    if (state !== FRAME_STANDING) this.idleTime = 0;
    // 离地行走宽限（:3599-3607）
    if (vy === 0) this.walkingGraceTime = d.walkingGraceTimeMax ?? 0;
    else if (this.walkingGraceTime > 0) this.walkingGraceTime--;
    if (p.inputDown && p.vy > 0) this.walkingGraceTime = 0;

    switch (state) {
      case FRAME_STANDING: {
        // 待机帧（:4139-4226）：站立 delay 计数 + idle 段（rand(900,1500) 后播 idle 动画）
        if ((d.idleFrameCount ?? 0) !== 0) {
          if (this.idleTime === 0) {
            this.idleTimeNext = 900 + Math.trunc(this.idleRand * 600);
            if (this.type === 2) this.idleTimeNext = 600 + Math.trunc(this.idleRand * 300);
            this.idleRand = Math.random();
          }
          this.idleTime++;
        }
        this.frameCounter += 1;
        if ((d.idleFrameCount ?? 0) !== 0 && this.idleTime >= this.idleTimeNext) {
          const delay = d.idleFrameDelay ?? 12;
          const step = Math.trunc((this.idleTime - this.idleTimeNext) / delay);
          if (step >= (d.idleFrameCount ?? 0)) {
            if (d.idleFrameLoop) { this.idleTime = this.idleTimeNext; this.frame = d.idleFrameStart ?? 0; }
            else { this.frameCounter = 0; this.frame = d.standingFrameStart ?? 0; this.idleTime = 0; }
          } else {
            this.frame = (d.idleFrameStart ?? 0) + step;
          }
        } else if (this.frameCounter > (d.standingFrameDelay ?? 12)) {
          this.frameCounter -= d.standingFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.standingFrameStart ?? 0)
          || this.frame >= (d.standingFrameStart ?? 0) + Math.max(1, d.standingFrameCount ?? 1)) {
          this.frame = d.standingFrameStart ?? 0;
        }
        break;
      }
      case FRAME_RUNNING: {
        // 跑动帧速率 = 水平速度（:4228-4262）；海盗船/暗黑魔法书族取速度比例
        let rate = Math.abs(vx);
        if (this.type === 44) rate = Math.max(1, Math.abs(vx) * 0.25);
        if (this.type === 48) rate = Math.max(0.5, Math.hypot(vx, vy) * 0.125);
        if (this.type === 50) rate = Math.abs(vx) * 0.5;
        this.frameCounter += rate;
        if (this.frameCounter > (d.runningFrameDelay ?? 12)) {
          this.frameCounter -= d.runningFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.runningFrameStart ?? 0)
          || this.frame >= (d.runningFrameStart ?? 0) + Math.max(1, d.runningFrameCount ?? 1)) {
          this.frame = d.runningFrameStart ?? 0;
        }
        break;
      }
      case FRAME_FLYING: {
        this.frameCounter += 1;
        if (this.frameCounter > (d.flyingFrameDelay ?? 12)) {
          this.frameCounter -= d.flyingFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.flyingFrameStart ?? 0)
          || this.frame >= (d.flyingFrameStart ?? 0) + Math.max(1, d.flyingFrameCount ?? 1)) {
          this.frame = d.flyingFrameStart ?? 0;
        }
        break;
      }
      case FRAME_IN_AIR: {
        this.frameCounter += 1;
        if (this.frameCounter > (d.inAirFrameDelay ?? 12)) {
          this.frameCounter -= d.inAirFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.inAirFrameStart ?? 0)
          || this.frame >= (d.inAirFrameStart ?? 0) + Math.max(1, d.inAirFrameCount ?? 1)) {
          this.frame = d.inAirFrameStart ?? 0;
        }
        // 蜜蜂悬停副帧（翅膀层 :4412-4425：疲劳越低拍越快）
        if (this.type === 5 && (d.fatigueMax ?? 0) > 0) {
          const t = this.fatigue / this.fatigueMax;
          this.frameExtraCounter += 6 - 4 * t;
          if (this.frameExtraCounter > (d.flyingFrameDelay ?? 12)) {
            this.frameExtra++;
            this.frameExtraCounter -= d.flyingFrameDelay ?? 12;
          }
          if (this.frameExtra < (d.flyingFrameStart ?? 0)
            || this.frameExtra >= (d.flyingFrameStart ?? 0) + Math.max(1, d.flyingFrameCount ?? 1)) {
            this.frameExtra = d.flyingFrameStart ?? 0;
          }
        }
        break;
      }
      case FRAME_SWIMMING: {
        // 游泳帧速率 = 平均速度（:4427-4446）
        const rate = Math.trunc((Math.abs(vx) + Math.abs(vy)) / 2);
        this.frameCounter += rate;
        if (this.frameCounter > (d.swimFrameDelay ?? 12)) {
          this.frameCounter -= d.swimFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.swimFrameStart ?? 0)
          || this.frame >= (d.swimFrameStart ?? 0) + Math.max(1, d.swimFrameCount ?? 1)) {
          this.frame = d.swimFrameStart ?? 0;
        }
        break;
      }
      case FRAME_DASHING: {
        this.frameCounter += Math.abs(vx);
        if (this.frameCounter > (d.dashingFrameDelay ?? 40)) {
          this.frameCounter -= d.dashingFrameDelay ?? 40;
          this.frame++;
        }
        if (this.frame < (d.dashingFrameStart ?? 0)
          || this.frame >= (d.dashingFrameStart ?? 0) + Math.max(1, d.dashingFrameCount ?? 1)) {
          this.frame = d.dashingFrameStart ?? 0;
        }
        break;
      }
    }
  }

  /** 每帧帧态调度（Player.cs:35745-35790 的 mount.UpdateFrame 分派 1:1）。
   *  飞行帧态门 = FlyTime>0 && jump==0 && controlJump && !CanHover（:35734） */
  updateFrameDispatch(p: MountedPlayerView): void {
    if (p.vy !== 0 && this.walkingGraceTime <= 0) {
      if (this.flyTime > 0 && p.inputJump && !this.canHover(p)) {
        this.tryBeginningFlight(p, FRAME_FLYING);
        this.updateFrame(p, FRAME_FLYING, p.vx, p.vy);
        this.tryLanding(p);
      } else if (p.inWater) {
        this.updateFrame(p, FRAME_SWIMMING, p.vx, p.vy);
      } else {
        this.tryBeginningFlight(p, FRAME_IN_AIR);
        this.updateFrame(p, FRAME_IN_AIR, p.vx, p.vy);
        this.tryLanding(p);
      }
    } else {
      this.updateFrame(p, this.intendedGroundedFrame(p), p.vx, p.vy);
    }
  }

  // ---- 上下坐骑 ----

  /** 上坐骑（Mount.cs SetMount :6184-6296）：同型/无效 id/蜜蜂浸水 拒绝；
   *  换骑先清旧 buff；授予坐骑 buff 3600t + 出生尘 */
  setMount(m: number, p: MountedPlayerView & { buffs?: { remove(t: unknown): void } }, game?: {
    spawnParticles?(x: number, y: number, color: string, n: number, spd?: number): void;
  }): boolean {
    if (this.type === m || m < 0 || m >= MOUNT_COUNT) return false;
    if (m === 5 && p.inWater) return false;              // 蜜蜂座骑浸水不可上（:6190）
    if (this.active) {
      this.reset();
    }
    this.active = true;
    this.flyTime = 0;
    this.type = m;
    const d = this.data;
    this.fatigueMax = d?.fatigueMax ?? 0;
    // 出生尘（DoSpawnDust :6363：spawnDust 族；本仓粒子为程序化圆，数量 10）
    if (game?.spawnParticles && d?.spawnDust) {
      game.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#C8C8C8', 10, 1.5);
    }
    return true;
  }

  /** 下坐空间检查（Mount.cs CanDismountWithResult :6600：42 高玩家盒能放下才许下） */
  canDismount(p: MountedPlayerView): boolean {
    const st = p.store;
    if (!st) return true;
    const h = 42;
    for (let tx = Math.floor(p.x / 16); tx <= Math.floor((p.x + p.w - 1) / 16); tx++) {
      for (let ty = Math.floor((p.y + p.h - h) / 16); ty <= Math.floor((p.y + p.h - 1) / 16); ty++) {
        if (st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty)) return false;
      }
    }
    return true;
  }

  tryDismount(p: MountedPlayerView): boolean {
    if (!this.canDismount(p)) return false;
    this.dismount(p);
    return true;
  }

  dismount(p?: MountedPlayerView, game?: {
    spawnParticles?(x: number, y: number, color: string, n: number, spd?: number): void;
  }): void {
    if (!this.active) return;
    if (game?.spawnParticles && this.data?.spawnDust) {
      game.spawnParticles((p?.x ?? 0) + (p?.w ?? 0) / 2, (p?.y ?? 0) + (p?.h ?? 0) / 2, '#C8C8C8', 10, 1.5);
    }
    this.reset();
  }

  reset(): void {
    this.active = false;
    this.type = -1;
    this.frame = 0;
    this.frameCounter = 0;
    this.frameExtra = 0;
    this.frameExtraCounter = 0;
    this.frameState = FRAME_STANDING;
    this.flyTime = 0;
    this.fatigue = 0;
    this.fatigueMax = 0;
    this.idleTime = 0;
    this.idleTimeNext = -1;
    this.abilityCharging = false;
    this.abilityCharge = 0;
    this.abilityCooldown = 0;
    this.abilityDuration = 0;
    this.walkingGraceTime = 0;
  }

  /** 每 tick 维护（Player.fixedUpdate 挂点）：能量恢复 + 地面飞行时量回充 + 帧态机 */
  upkeep(p: MountedPlayerView): void {
    if (!this.active || this.isCart) return;
    this.abilityRecovery();
    if (p.onGround || p.vy === 0) {
      this.resetFlightTime(p);
      this.fatigueRecovery();
    }
    this.tryStartHover(p);
    this.updateFrameDispatch(p);
  }

  // ---- 渲染信息 ----

  /** 玩家绘制纵向偏移（Mount.PlayerOffset :409-423：playerYOffsets[当前帧]） */
  get playerOffset(): number {
    const d = this.data;
    if (!d || !d.playerYOffsets?.length) return 0;
    if (this.frame >= d.totalFrames) return 0;
    return d.playerYOffsets[this.frame] ?? 0;
  }

  get textures(): { back?: string; front?: string; backExtra?: string; frontExtra?: string } {
    const d = this.data;
    if (!d) return {};
    const f = (n?: string) => (n ? `vanilla/${n}` : undefined);
    return { back: f(d.backTexture), front: f(d.frontTexture), backExtra: f(d.backTextureExtra), frontExtra: f(d.frontTextureExtra) };
  }
}

/** 物品 id（vanilla）→ 坐骑 id；非召唤物返回 -1 */
export function mountOfItem(vanillaItemId: number): number {
  const m = ITEM_TO_MOUNT[String(vanillaItemId)];
  return m === undefined ? -1 : m;
}

/** 坐骑 buff id → 坐骑 id（BuffID.Sets.MountType） */
export function mountOfBuff(buffId: number): number {
  const m = BUFF_TO_MOUNT[String(buffId)];
  return m === undefined ? -1 : m;
}
