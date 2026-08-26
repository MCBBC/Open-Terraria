// 微光/钓鱼氛围装饰鱼群（1.4 FakeFishParticle 全量移植）。
//
// 原版真值锚（Terarria1458，1457 同文件同构）：
//   - Terraria.Graphics.Renderers/FakeFishParticle.cs：
//     态机枚举 :14-20（FreeRoaming/InterestedInBobber/Latched/Jumping）、
//     Update :263-359、Prepare :415-434、TryJumping :436-445、Draw :447-503、
//     sonar 三交互 TryToMagnetizeTo :79 / TryToPushAway :93 / TryToBePinged :111 /
//     CanHit :124-141、CheckLatch :143-166、RemoveLatch :168-172、
//     EmitWaterPulse :174-188、DoStandardWaterSplash :190-261、
//     SetAndGetLatchDetails :361-379、Rotate :381-400、PickNewVelocity :402-413、
//     BeRepelled :521-561（本仓无 ParticleRepel 广播面,登记未移植）
//   - 生成门 Projectile.SpawnFakeFishInWater（Projectile.cs:20594-20696）——
//     FishingCheck 内 TryBuildFishingContext 成功即跑（:20704-20712），先于咬钩掷骰、
//     与其独立；AI_061 经 localAI[1]>660 累积器触发（:54780-54784）
//   - 编排 Spawn_FakeFish/FakeFishJump（ParticleOrchestrator.cs:1355-1370）+
//     Magnet/Ping/PushAwayFakeFish（:1372-1408）+ 咬钩联动位
//     （Projectile.cs:20962-20977 FishingCheck_RollItemDrop：sonarPotion → 浮标下补一条
//     同款鱼 + Ping + PushAway；磁化恒跑）。RequestParticleSpawn(clientOnly:true)
//     = 纯本地特效永不上网（syncModules.ts module8 注同口径）→ 本仓走本地直驱,
//     不进 module8 wire 面
//   - 湖面星闪 Spawn_LakeSparkle（ParticleOrchestrator.cs:1336-1353,FadingParticle +
//     TextureAssets.Star[0]）——生成门内每合格列 1/5 掷
//   - 音 SoundID.FishSplash（SoundID.cs:1174 fish_splash.wav WithVolume(1)
//     WithPitchVariance(0.02)）；四液型 pitchOffset 微光 5(:219)/蜂蜜 1(:233)/
//     岩浆 1(:246)/水 1(:259)，LegacySoundPlayer.PlaySound 尾段
//     Pitch=Clamp(0+offset+variance,-1,1)（LegacySoundPlayer.cs:1417）→ 两档 clamp 后
//     同为 +1（八度上移 rate 2^1）——运行时听感无差,原版如此;请求差值保留供对拍
//
// 渲染登记近似：①本体 = 原版渔获物品贴图暗剪影（Color.Lerp(W,B,.8)×.7 调制，
// 本地烘焙 multiply+destination-in,半载图拒烘防平色矩形毒缓存）;②glowmask 叠画
// （Draw :499-502）未接（渔获鱼族几乎无 glowmask）;③sonar 四向环复制（:493-496）
// 两档 sonarColor 的 alpha 恒 0（new Color(...,0),:120）→ XNA AlphaBlend 下不可见
// 死视觉,可观测的声呐反馈 = 本体向白 lerp（:489-491）,已移植;④LakeSparkle 用
// vanilla/Star_0.png 直绘近似 FadingParticle 包络。
import { TILE } from '../core/constants';
import { LIQUID_TYPE } from '../world/TileStore';
import type { TileStore } from '../world/TileStore';
import { wetCollision } from './npcLiquid';
import { liquidCollision } from '../stats/TouchDamage';
import { canHitLine } from '../physics/LineOfSight';
import { getDisplayableDrops } from '../data/vanillaFishing';
import type { FishingRollCtx } from '../data/vanillaFishing';
import { queueRippleRaw, RippleShape } from '../render/WaterWaves';

/** Main.rand.NextFloat() 缺省注入（测试换种子实现） */
let randFloat: () => number = Math.random;
/** Main.rand.Next(maxExclusive) */
function next(n: number): number {
  return n <= 0 ? 0 : Math.floor(randFloat() * n);
}
/** Main.rand.Next(min,max) 左闭右开 */
function nextRange(min: number, max: number): number {
  return max <= min ? min : min + Math.floor(randFloat() * (max - min));
}
/** NextVector2Circular(w,h)（Rand.cs 均匀圆盘? 实为逐轴均匀 [-w,w]×[-h,w]） */
function nextCircular(w: number, h: number): { x: number; y: number } {
  return { x: (randFloat() * 2 - 1) * w, y: (randFloat() * 2 - 1) * h };
}

/** 测试注入口（mathRng 同款约定；生产零调用） */
export function setFakeFishRandom(f: () => number): void {
  randFloat = f;
}

// ==================== ItemID.Sets（ItemID.cs:56/:1082/:1086，1457=1458 同值）====================

/** ReceivesDiagonalCorrectionAsFakeFish（ItemID.cs:56）：CreateBoolSet(true,2342)
 *  = 默认 true 全量、例外锯鲨 2342 为 false（物品贴图按斜 45° 绘制族需 +π/4 校正） */
export const FAKE_FISH_DIAGONAL_EXCEPT = new Set([2342]);
export function receivesDiagonalCorrectionAsFakeFish(vid: number): boolean {
  return !FAKE_FISH_DIAGONAL_EXCEPT.has(vid);
}
/** FakeFishInanimate（ItemID.cs:1082）：蛙腿 2423——静物鱼（不跳不追、旋转慢 20 倍） */
export const FAKE_FISH_INANIMATE = new Set([2423]);
/** IsFishingCrate（ItemID.cs:1086）：宝匣全表——宝匣同样按静物鱼处理（Prepare :424-429） */
export const IS_FISHING_CRATE = new Set([
  2334, 2335, 2336, 3203, 3204, 3205, 3206, 3207, 3208,
  4405, 4407, 4877, 5002,
  3979, 3980, 3981, 3982, 3983, 3984, 3985, 3986, 3987,
  4406, 4408, 4878, 5003,
]);

// ==================== 数学件（Utils.Remap/AngleTowards/rotateTowards 1:1）====================

/** Utils.Remap（Utils.cs:345-349，GetLerpValue clamped） */
export function remap(v: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  const t = (v - fromMin) / (fromMax - fromMin);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return toMin + (toMax - toMin) * c;
}

/** MathHelper.WrapAngle（±π 归一） */
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Utils.AngleTowards（Utils.cs） */
function angleTowards(cur: number, target: number, maxChange: number): number {
  cur = wrapAngle(cur);
  target = wrapAngle(target);
  if (cur < target) {
    if (target - cur > Math.PI) cur += Math.PI * 2;
  } else if (cur - target > Math.PI) {
    cur -= Math.PI * 2;
  }
  cur += Math.max(-maxChange, Math.min(maxChange, target - cur));
  return cur;
}

/** Utils.rotateTowards（Utils.cs:2052-2057）：保持模长的朝向渐转 */
function rotateHeadingToward(
  fromX: number, fromY: number, headAngle: number,
  toX: number, toY: number, maxChange: number,
): number {
  const targetAngle = Math.atan2(toY - fromY, toX - fromX);
  return angleTowards(headAngle, targetAngle, maxChange);
}

function safeNormalize(x: number, y: number, fx: number, fy: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: fx, y: fy };
  return { x: x / len, y: y / len };
}

// ==================== 音（SoundID.cs:1174 + LegacySoundPlayer.cs:1417）====================

/** DoStandardWaterSplash 四液型 pitchOffset（FakeFishParticle.cs:219/:233/:246/:259） */
export const FISH_SPLASH_PITCH_OFFSET = { shimmer: 5, honey: 1, lava: 1, water: 1 } as const;
export type FishSplashLiquid = keyof typeof FISH_SPLASH_PITCH_OFFSET;

/** SoundID.FishSplash WithPitchVariance(0.02)（SoundID.cs:1174）：±variance 连续掷 */
export function fishSplashPitch(kind: FishSplashLiquid, rand: () => number = Math.random): number {
  // LegacySoundPlayer.PlaySound 尾段 Clamp(instance.Pitch + variance + offset, -1, 1)
  // （:1417）→ 两档 clamp 后同为 +1（八度上移）——原版运行时四液同调,差值死参备案
  const p = FISH_SPLASH_PITCH_OFFSET[kind] + (rand() * 2 - 1) * 0.02;
  return Math.max(-1, Math.min(1, p));
}

// ==================== 状态机（FakeFishParticle.cs 全量）====================

const enum State {
  FreeRoaming = 0,      // :16
  InterestedInBobber,   // :17
  Latched,              // :18
  Jumping,              // :19
}

/** 可 latch 目标的窄视图（原版 _latchedProjectile 字段投影；cx/cy 为活读 getter）。
 *  retract=bobber ai[0]、ai1=bobber ai[1] 原值（负=咬钩窗）、caughtVid=收竿带渔获时
 *  ai[1]=localAI[1] 镜像（Player.cs:53082，±id） */
export interface FakeFishLatchTarget {
  readonly cx: number;
  readonly cy: number;
  readonly active: boolean;
  readonly projType: number;
  readonly retract: number;
  readonly ai1: number;
  readonly caughtVid: number;
}

export class FakeFish {
  x = 0; y = 0;                 // Position（世界坐标,顶点语义同原版 Vector2 Position）
  vx = 0; vy = 0;               // Velocity
  rotation = 0;                 // Rotation
  itemType = 0;                 // _itemInstance.type（贴图与 latch 配对身份）
  lifeCounted = 0;              // _lifeTimeCounted
  lifeTotal = 0;                // _lifeTimeTotal
  totalScale = 0.6;             // _totalScale（Prepare :418 = 0.6+0.15×rand）
  private waitTime = 0;         // _waitTime
  private state: State = State.FreeRoaming;
  jumpTimeLeft = 0;             // _jumpTimeLeft
  private looksDiagonal = false;        // _itemLooksDiagonal
  private targetVx = 0; private targetVy = 0;   // _targetVelocity
  private bobberX = 0; private bobberY = 0;     // _bobberLocation
  private steerTime = 0;        // _steerTime
  inanimate = false;            // _isInanimate
  /** 声呐态（TryToBePinged :117-120）：start=60+dist/10,timeleft 倒计时 */
  sonarStart = 0;
  private sonarTimeleft = 0;
  private selectedSonar = false;
  private wasWet = false;       // _wasWet
  private delayTime = 0;        // _delayTime（出生/起跳 0..10t 迟启,Update :265）
  private gotRepelled = false;  // _gotRepelled（BeRepelled 面,本仓未消费）
  dead = false;                 // ShouldBeRemovedFromRenderer
  restingInPool = false;        // IsRestingInPool
  private latched: FakeFishLatchTarget | null = null;
  private latchedType = 0;      // _latchedProjectileType

  /** 编排消费（Spawn_FakeFish :1355-1369 + Prepare :415-434 1:1） */
  prepare(itemType: number, lifeTimeTotal: number, bobberX: number, bobberY: number): void {
    this.itemType = itemType;                       // _itemInstance.SetDefaults
    this.totalScale = 0.6 + 0.15 * randFloat();     // :418
    this.bobberX = bobberX;
    this.bobberY = bobberY + 8;                     // :419 +(0,8)
    this.inanimate = false;
    this.lifeTotal = lifeTimeTotal;
    // :422 Next(3)!=0 ? Interested : FreeRoaming —— 2/3 对浮标感兴趣
    this.state = next(3) !== 0 ? State.InterestedInBobber : State.FreeRoaming;
    this.looksDiagonal = receivesDiagonalCorrectionAsFakeFish(itemType);   // :423
    // :424-429 宝匣/静物表 → 强制 FreeRoaming+inanimate、弃斜校
    if (IS_FISHING_CRATE.has(itemType) || FAKE_FISH_INANIMATE.has(itemType)) {
      this.state = State.FreeRoaming;
      this.inanimate = true;
      this.looksDiagonal = false;
    }
    this.pickNewVelocity();
    this.steerTime = nextRange(30, 121);            // :431
    this.wasWet = true;                             // :432
    this.delayTime = 0;                             // :433
  }

  /** TryJumping（:436-445）：jumpTimeLeft = ⌊vy/−0.2⌋×2（重力 0.2 反解） */
  tryJumping(): void {
    if (this.inanimate) return;
    this.jumpTimeLeft = Math.trunc(this.vy / -0.2) * 2;
    this.state = State.Jumping;
    this.delayTime = nextRange(0, 11);              // :443
  }

  /** TryToMagnetizeTo（:79-91） */
  tryToMagnetizeTo(st: TileStore, t: FakeFishLatchTarget, requiredItemType = -1): boolean {
    if (!this.canHit(st, t.cx, t.cy, requiredItemType)) return false;
    this.latched = t;
    this.latchedType = t.projType;
    this.state = State.Latched;
    this.setAndGetLatchDetails();
    this.rotate(true);
    return true;
  }

  /** TryToPushAway（:93-109）：非本款鱼才推（同款豁免 :99） */
  tryToPushAway(st: TileStore, cx: number, cy: number, requiredItemType = -1): boolean {
    if (this.state === State.Jumping) return false;
    if (requiredItemType === this.itemType) return false;
    // :103 allowedRange 形参传 160f 但 CanHit 本体固定 80f（:131 num=80）——原版死参照抄
    if (!this.canHit(st, cx, cy, -1)) return false;
    const d = safeNormalize(this.x - cx, this.y - cy, 0, 1);   // DirectionTo(Position)
    const k = 1 + 1 * randFloat();                              // *(1+1×NextFloat())×1
    this.vx += d.x * k;
    this.vy += d.y * k;
    return true;
  }

  /** TryToBePinged（:111-122） */
  tryToBePinged(st: TileStore, cx: number, cy: number, requiredItemType = -1): boolean {
    // :113 allowedRange 形参传 1000f,CanHit 固定 80f——同上死参
    if (!this.canHit(st, cx, cy, -1)) return false;
    const num = Math.trunc(Math.hypot(cx - this.x, cy - this.y) / 10);
    this.sonarStart = this.sonarTimeleft = 60 + num;   // :118
    this.selectedSonar = requiredItemType === this.itemType;
    // :120 两档色 α 恒 0 → 环复制在 AlphaBlend 下不可见（见头注③）,仅存档位
    return true;
  }

  /** CanHit（:124-141）：类型配对 + 固定 80f 距离 + CanHitLine 视线 */
  private canHit(st: TileStore, cx: number, cy: number, requiredItemType: number): boolean {
    if (requiredItemType !== -1 && this.itemType !== requiredItemType) return false;
    if (Math.hypot(cx - this.x, cy - this.y) > 80) return false;   // :130-134 固定 80
    if (!canHitLine(st, cx, cy, 0, 0, this.x, this.y, 0, 0)) return false;
    return true;
  }

  /** CheckLatch（:143-166）：脱钩三路——失活/换型/超距、停咬（ai0==0∧ai1≥0）、收线 */
  private checkLatch(): void {
    if (this.state !== State.Latched || !this.latched) return;
    const t = this.latched;
    if (!t.active || t.projType !== this.latchedType
      || Math.hypot(t.cx - this.x, t.cy - this.y) > 80) {
      this.removeLatch();
    } else if (t.retract === 0 && t.ai1 >= 0) {
      this.removeLatch();                            // :154-157 咬钩窗关闭
    } else if (t.retract === 1) {
      this.removeLatch();                            // :158-165 收线
      if (t.caughtVid === this.itemType) this.dead = true;   // 本鱼即渔获 → 自灭
    }
  }

  private removeLatch(): void {
    this.state = State.FreeRoaming;
    this.pickNewVelocity();
  }

  /** SetAndGetLatchDetails（:361-379）：理想挂点 = Center+(0,8)+(8,5),
   *  偏移 = 归一×6 且 y 折正、y-3、x 按 v.X 反号偏 4;寿命钳 85% */
  private setAndGetLatchDetails(): void {
    const t = this.latched!;
    const idealX = t.cx + 8, idealY = t.cy + 13;          // +(0,8)+(8,5)
    const vx = idealX - this.x, vy = idealY - this.y;
    let ox: number, oy: number;
    const n = safeNormalize(vx, vy, 0, -1);               // SafeNormalize(-UnitY)
    ox = n.x * 6; oy = n.y * 6;
    if (oy > 0) oy *= -1;                                 // :366-369
    oy -= 3;                                              // :370
    ox += Math.sign(vx) * -4;                             // :371
    this.targetVx = ox; this.targetVy = oy;               // _targetVelocity = idealOffset
    this.bobberX = idealX; this.bobberY = idealY;
    const cap = Math.trunc(this.lifeTotal * 0.85);
    if (this.lifeCounted > cap) this.lifeCounted = cap;
    return;                                               // 调用侧取 ideal 作挂点位
  }

  /** EmitWaterPulse（:174-188）：出入液沿触发——岩浆盒查 → 湿查(honey/shimmer 旗)
   *  → 四液 splash → QueueRipple(Circle,4×4,(0.7,0.84,0,1)) */
  private emitWaterPulse(game: FakeFishHost): void {
    const st = game.world.store;
    const lavaWet = liquidCollision(st, this.x - 4, this.y - 4, 8, 8, LIQUID_TYPE.LAVA);
    const wet = wetCollision(st, this.x - 4, this.y - 4, 8, 8);
    this.doStandardWaterSplash(game, wet.shimmer ? 'shimmer' : wet.honey ? 'honey'
      : lavaWet ? 'lava' : 'water');
    // WaterShaderData.QueueRipple（:184-186）：value=1.4 → 色 (0.5,0.6,0,1)×1.4
    // =(0.7,0.84,0,饱和1)、Circle、4×4
    queueRippleRaw(this.x, this.y, 4, 4, 0.7, 0.84, 1, RippleShape.Circle, 0);
  }

  /** DoStandardWaterSplash（:190-261）四液分支：尘型 308/152/35/dustWater() 各 10 粒,
   *  noGravity+scale1.3;音 fish_splash——★微光支在循环【内】播 ×10(:219 原版如此)、
   *  蜂蜜/岩浆/水支循环外一次(:233/:246/:259)。pitchOffset 见 FISH_SPLASH_PITCH_OFFSET */
  private doStandardWaterSplash(game: FakeFishHost, kind: FishSplashLiquid): void {
    const vectorX = this.x - 4, vectorY = this.y - 4;     // castPosition-(4,4)
    const boxX = vectorX - 6, boxY = vectorY + (8 / 2) - 8;   // -(6, h/2-8)
    const dustType =
      kind === 'shimmer' ? 308 :
      kind === 'honey' ? 152 :
      kind === 'lava' ? 35 :
      dustWaterFor((game as FakeFishGameProbe).renderer?.waterStyle ?? 0);
    for (let i = 0; i < 10; i++) {
      const d = game.spawnDust?.(boxX, boxY, 8 + 12, 24, dustType);
      if (d) {
        switch (kind) {
          case 'shimmer':                                 // :200-203
            d.vy -= 4; d.vx *= 2.5; d.scale = 1.3; d.noGravity = true;
            d.color = SHIMMER_DUST_COLORS[next(6)];       // :204-218 六掷三色+缺省
            break;
          case 'honey':                                   // :227-231
            d.vy -= 1; d.vx *= 2.5; d.scale = 1.3; d.alpha = 100; d.noGravity = true;
            break;
          case 'lava':                                    // :240-244
            d.vy -= 1.5; d.vx *= 2.5; d.scale = 1.3; d.alpha = 100; d.noGravity = true;
            break;
          default:                                        // :252-257 水
            d.vy -= 4; d.vx *= 2.5; d.scale = 1.3; d.alpha = 100; d.noGravity = true;
            break;
        }
      }
      // :219 微光支逐粒播（×10）;其余支见循环外
      if (kind === 'shimmer') game.playSfxWav?.('fish_splash', 1, this.x, this.y, fishSplashPitch('shimmer'));
    }
    if (kind !== 'shimmer') {
      game.playSfxWav?.('fish_splash', 1, this.x, this.y, fishSplashPitch(kind));
    }
  }

  /** PickNewVelocity（:402-413） */
  private pickNewVelocity(): void {
    const c = nextCircular(1.5, 0.6);
    this.targetVx = c.x; this.targetVy = c.y;
    if (this.state === State.InterestedInBobber) {         // :405-408
      const n = safeNormalize(this.bobberX - this.x, this.bobberY - this.y, 0, -1);
      const k = 0.7 + 0.5 * randFloat();
      this.targetVx = n.x * k; this.targetVy = n.y * k;
    } else if (this.state === State.Latched && this.latched) {   // :409-412
      const n = safeNormalize(this.latched.cx - this.x, this.latched.cy - this.y, 0, -1);
      this.targetVx = n.x * 0.7; this.targetVy = n.y * 0.7;
    }
  }

  /** Rotate（:381-400）： Interested/Latched 朝浮标,否则朝速度;步长 0.1（静物×0.05） */
  private rotate(instant = false): void {
    let step = 0.1;
    if (this.inanimate) step *= 0.05;
    if (instant) step = Math.PI * 2;
    if (this.state === State.InterestedInBobber || this.state === State.Latched) {
      this.rotation = rotateHeadingToward(
        this.x, this.y, this.rotation, this.bobberX, this.bobberY, step);
    } else if (this.vx !== 0 || this.vy !== 0) {
      this.rotation = angleTowards(this.rotation, Math.atan2(this.vy, this.vx), step);
    }
  }

  /** Update（:263-359）逐 tick 积分 */
  update(game: FakeFishHost): void {
    const st = game.world.store;
    if (this.delayTime-- >= 0) return;                    // :265-268 迟启窗
    if (++this.lifeCounted >= this.lifeTotal) {           // :269-272 寿命到
      this.dead = true;
    }
    if (--this.sonarTimeleft < 0) this.sonarTimeleft = 0; // :273-276
    // :277-282 出入液沿 → 水花脉冲
    const flag = wetCollision(st, this.x, this.y, 2, 2).wet;
    if (flag !== this.wasWet) this.emitWaterPulse(game);
    this.wasWet = flag;
    if (this.state === State.Jumping) {                   // :283-295
      this.vy += 0.2;
      this.rotation = Math.atan2(this.vy, this.vx);
      this.x += this.vx; this.y += this.vy;
      if (--this.jumpTimeLeft > 0) return;
      this.state = State.FreeRoaming;
      this.pickNewVelocity();
      this.vx *= 0.15; this.vy *= 0.15;
    }
    // :296-301 低速游荡重掷（--waitTime 仅在前两门过后求值——短路语义保留）
    if (this.lifeCounted / this.lifeTotal >= 0.15
      && Math.hypot(this.vx, this.vy) < 0.1 && --this.waitTime <= 0) {
      this.waitTime = nextRange(30, 121);
      this.pickNewVelocity();
      this.steerTime = nextRange(30, 121);
    }
    if (--this.steerTime > 0) {                           // :302-306
      const hvx = Math.cos(this.rotation), hvy = Math.sin(this.rotation);
      this.vx += (hvx * 1 - this.vx) / 30;                // Lerp(vel, rotVec, 1/30)
      this.vy += (hvy * 1 - this.vy) / 30;
      this.vx += (this.targetVx - this.vx) * 0.05;        // Lerp(vel, target, .05)
      this.vy += (this.targetVy - this.vy) * 0.05;
    } else if (Math.hypot(this.vx, this.vy) > 0.3) {      // :307-310
      this.vx *= 0.975; this.vy *= 0.975;
    }
    if (this.state === State.InterestedInBobber           // :311-319 近浮标减速绕旋
      && Math.hypot(this.bobberX - this.x, this.bobberY - this.y) < 16) {
      this.vx *= 0.9; this.vy *= 0.9;
      if (Math.hypot(this.vx, this.vy) < 0.02) {
        const num = 0.3 + 1.4 * randFloat();
        const n = safeNormalize(this.bobberX - this.x, this.bobberY - this.y, 0, 0);
        this.vx = n.x * -num; this.vy = n.y * -num;
      }
    }
    this.checkLatch();                                    // :320
    if (this.state === State.Latched && this.latched) {   // :321-325 吸附挂点
      this.setAndGetLatchDetails();
      const t = this.latched;
      const ix = t.cx + 8, iy = t.cy + 13;                // idealBobberPosition
      this.x += (ix - this.targetVx - this.x) * 0.05;     // Lerp(pos, ideal-offset, .05)
      this.y += (iy - this.targetVy - this.y) * 0.05;
    }
    this.x += this.vx; this.y += this.vy;                 // :326
    this.rotate();                                        // :327
    // :328-332 离水强制进入余 20t 收尾
    if (this.lifeTotal - this.lifeCounted > 20 && !flag) {
      this.lifeCounted = this.lifeTotal - 20;
    }
    // :333-337 上探离水面 → 抑制推进+下沉
    if (this.vy < 0 && !wetCollision(st, this.x, this.y - 20, 0, 0).wet) {
      this.steerTime = 0;
      this.vy *= 0.92;
    }
    // :338-343 前向 32px 探干 → 掉头
    if (this.vx !== 0 || this.vy !== 0) {
      const fn = safeNormalize(this.vx, this.vy, 0, 0);
      if (!wetCollision(st, this.x + fn.x * 32, this.y + fn.y * 32, 0, 0).wet) {
        this.steerTime = 0;
        this.pickNewVelocity();
        this.vx *= 0.92; this.vy *= 0.92;
      }
    } else {
      return;                                             // :344-347 零速即止
    }
    // :348-358 四向 16px 探干（只查速度同侧半圆）→ 掉头
    for (let f = 0; f < 1; f += 0.25) {
      const px = Math.cos(Math.PI * 2 * f) * 16;
      const py = Math.sin(Math.PI * 2 * f) * 16;
      const vn = safeNormalize(this.vx, this.vy, 0, 1);
      if (px * vn.x + py * vn.y >= 0
        && !wetCollision(st, this.x + px, this.y + py, 0, 0).wet) {
        this.steerTime = 0;
        this.pickNewVelocity();
        this.vx *= 0.92; this.vy *= 0.92;
        break;
      }
    }
  }

  /** 收竿带渔获匹配自灭判定（CheckLatch :161-164 的 reel 时点直驱镜像——本仓收竿
   *  即 Kill 浮漂,等不到下一 tick 的 active=false 分支,由 Bobber.reel 显式通知） */
  matchesLatch(t: FakeFishLatchTarget): boolean {
    return this.latched === t;
  }

  // ---- Draw（:447-503）所需只读投影 ----
  get stateId(): number { return this.state; }
  get isSonarActive(): boolean {
    return this.sonarStart > 0 && this.sonarTimeleft <= this.sonarStart && this.sonarTimeleft > 0;
  }
  get isSelectedSonar(): boolean { return this.selectedSonar; }
  get looksDiagonally(): boolean { return this.looksDiagonal; }
  /** _sonarTimeleft 只读（Draw :489 fromValue = 1 − timeleft/start） */
  get sonarLeft(): number { return this.sonarTimeleft; }
}

/** 微光尘三色+缺省档（:204-218 六掷：case0 白黄/case1 冰蓝/case2 粉/缺省淡紫） */
const SHIMMER_DUST_COLORS: Array<{ r: number; g: number; b: number; a: number }> = [
  { r: 255, g: 255, b: 210, a: 255 },
  { r: 190, g: 245, b: 255, a: 255 },
  { r: 255, g: 150, b: 255, a: 255 },
  { r: 190, g: 175, b: 255, a: 255 },   // default ×3 掷
  { r: 190, g: 175, b: 255, a: 255 },
  { r: 190, g: 175, b: 255, a: 255 },
];

/** Dust.dustWater()（Dust.cs:405-423）：Main.waterStyle 分档,缺省 33。
 *  本仓 waterStyle 经渲染器字段透传（结构化探测,测试 mock 兼容） */
export function dustWaterFor(waterStyle: number): number {
  switch (waterStyle) {
    case 2: return 98;
    case 3: return 99;
    case 4: return 100;
    case 5: return 101;
    case 6: return 102;
    case 7: return 103;
    case 8: return 104;
    case 9: return 105;
    case 10: return 123;
    case 12: return 288;
    default: return 33;
  }
}

/** update/draw 宿主窄接口（GameHooks 结构子集 + 渲染器 waterStyle 探测） */
export interface FakeFishDust {
  vx: number; vy: number; scale: number; alpha: number; noGravity: boolean;
  color?: { r: number; g: number; b: number; a: number } | null;
}
export interface FakeFishHost {
  world: { store: TileStore };
  playSfxWav?(file: string, vol?: number, x?: number, y?: number, pitch?: number, replace?: boolean): void;
  spawnDust?(
    x: number, y: number, w: number, h: number, type: number,
    speedX?: number, speedY?: number, alpha?: number,
    color?: { r: number; g: number; b: number; a: number } | null, scale?: number,
    noGravity?: boolean,
  ): FakeFishDust | null;
}
interface FakeFishGameProbe extends FakeFishHost {
  renderer?: { waterStyle?: number };
}

// ==================== 湖面星闪（Spawn_LakeSparkle :1336-1353 近似）====================

interface LakeSparkle {
  x: number; y: number; vx: number; vy: number;
  axPerT: number; ayPerT: number;
  life: number; age: number;
  rot: number; rotVel: number;
  scale: number; baseAlpha: number;
}

const sparkles: LakeSparkle[] = [];

/** FadingParticle.SetBasicInfo/SetTypeInfo 包络近似：寿命 50..140t、加速 =
 *  MovementVector/60/寿命、白星随机透明度、FadeIn/Out 各 45%、自旋 ±2π/32×|move|钳 */
function spawnLakeSparkle(moveX: number, moveY: number, px: number, py: number): void {
  sparkles.push({
    x: px, y: py, vx: 0, vy: 0,
    axPerT: moveX / 60, ayPerT: moveY / 60,   // vector=/60 再 /num——两步合并于 age 循环
    age: 0,
    life: 50 + 90 * randFloat(),              // SetTypeInfo(num=50+90×rand)
    rot: randFloat() * Math.PI * 2,
    rotVel: (randFloat() < 0.5 ? -1 : 1) * (Math.PI * 2 / 32)
      * Math.max(0, Math.min(1, Math.hypot(moveX, moveY) / 32)),
    scale: 0.5 + 0.5 * randFloat(),
    baseAlpha: randFloat(),
  });
}

// ==================== 鱼群池（ParticlePool<FakeFishParticle>(100) :32）====================

export const FAKE_FISH_POOL_CAP = 100;
const school: FakeFish[] = [];

export function fakeFishCount(): number { return school.length; }
export function eachFakeFish(): readonly FakeFish[] { return school; }
/** 世界卸载/测试复位（原版粒子系统随世界重建） */
export function clearFakeFish(): void {
  school.length = 0;
  sparkles.length = 0;
}

/** Spawn_FakeFish/FakeFishJump（ParticleOrchestrator.cs:1355-1370）本地直驱入口。
 *  moveX/moveY = settings.MovementVector（普通 spawn 携浮标中心;jump 携跳跃初速） */
export function requestFakeFishSpawn(
  posX: number, posY: number, moveX: number, moveY: number,
  itemType: number, jumping = false,
): boolean {
  if (school.length >= FAKE_FISH_POOL_CAP) return false;   // 池满近似（RequestParticle 无空闲即弃）
  const f = new FakeFish();
  f.x = posX; f.y = posY;                                  // :1358-1361
  const life = nextRange(240, 421);                        // :1362 lifeTimeTotal=rand(240,421)
  f.prepare(itemType, life, moveX, moveY);                  // :1363-1365（bobberLocation=movementVector）
  if (jumping) {                                           // :1366-1369
    f.vx = moveX; f.vy = moveY;
    f.tryJumping();
  }
  school.push(f);
  return true;
}

// ==================== 生成门（Projectile.SpawnFakeFishInWater :20594-20696）====================

/** Collision.SolidTiles(Vector2,w,h)（Collision.cs:3500-3503 + :3468-3506 int 重载）:
 *  端格含入（floor((p+w)/16) 不减 1）+ 越界四面回 true */
function solidTilesRect(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  const sx = Math.floor(px / TILE), ex = Math.floor((px + w) / TILE);
  const sy = Math.floor(py / TILE), ey = Math.floor((py + h) / TILE);
  if (sx < 0 || sy < 0 || ex >= st.w || ey >= st.h - 40) return true;
  for (let i = sx; i <= ex; i++) {
    for (let j = sy; j <= ey; j++) {
      if (st.isSolid(i, j)) return true;   // active∧!actuated∧tileSolid∧!solidTop（isSolid 同构）
    }
  }
  return false;
}

/** GetFishingPondWidth（Projectile.cs:20203-20213）：横向扩到水体边缘（越界停 10/W-10） */
function pondWidthOf(st: TileStore, x: number, y: number): { minX: number; maxX: number } {
  const liq = (i: number, j: number) => (st.inBounds(i, j) ? st.liquid[st.idx(i, j)] : 0);
  let minX = x, maxX = x;
  while (minX > 10 && liq(minX, y) > 0 && !st.isSolid(minX, y)) minX--;
  while (maxX < st.w - 10 && liq(maxX, y) > 0 && !st.isSolid(maxX, y)) maxX++;
  return { minX, maxX };
}

/** SpawnFakeFishInWater（Projectile.cs:20594-20696）1:1。ctx = 本次 fishingCheck
 *  已构建的 FishingRollCtx（display 条件与实际渔获共用同一掷——RollDropLevels 在
 *  TryBuildFishingContext 内先于本门）。rng 注入供测试。 */
export function spawnFakeFishInWater(
  game: FakeFishHost, x: number, y: number, ctx: FishingRollCtx,
  rng: () => number = Math.random,
): void {
  const prev = randFloat;
  randFloat = rng;
  try {
    const st = game.world.store;
    const { minX: pondMin, maxX: pondMax } = pondWidthOf(st, x, y);
    const num = 10;
    let minX = Math.max(x - num, pondMin);            // :20597-20598 ±10 列窗
    let maxX = Math.min(x + num, pondMax);
    const num2 = 1, num3 = 1, num4 = 10, num5 = 3;    // :20599-20602 边缩1/表层1/深限10/深下限3
    minX += num2; maxX -= num2;                       // :20603
    const entries = getDisplayableDrops(ctx);         // :20605-20607
    if (entries.length === 0) return;                 // :20608-20610
    let totalFreq = 0;
    for (const e of entries) totalFreq += e.frequency;   // :20612-20617
    for (let i = minX; i <= maxX; i++) {
      // :20619-20631 逐列向下量水深（液且非实心,≤10 格,H-10 封顶）
      let j = y;
      let depth = 0;
      for (; st.inBounds(i, j) && st.liquid[st.idx(i, j)] > 0 && !st.isSolid(i, j) && j < st.h - 10; j++) {
        if (depth >= num4) break;
        depth++;
      }
      if (depth < num5) continue;                     // :20632-20634 浅于 3 格列不出
      const loY = num3 * 16 + 4;                      // :20637 Y 采样窗 [20, depth·16+12]
      const hiY = depth * 16 + 16 - num3 * 16 - 4 + 1;
      // ---- LakeSparkle 1/5 列（:20635-20646）----
      if (next(5) === 0) {
        const posY = y * 16 + nextRange(loY, hiY);
        const rise = (y * 16 - posY) * randFloat();   // :20639-20641 上浮分量
        spawnLakeSparkle(0, rise, i * 16 + nextRange(4, 13), posY);
      }
      if (next(10) !== 0) continue;                   // :20647-20649 1/10 列出鱼
      let posX = i * 16 + nextRange(4, 13);
      let posY = y * 16 + nextRange(loY, hiY);
      const bobberWX = x * 16, bobberWY = y * 16;     // :20652 浮标格世界坐标
      // :20654-20665 频率加权选展示鱼种（num9 = 总频率×NextFloat 逐项扣减）
      let roll = totalFreq * randFloat();
      let itemType = entries[0].itemType;
      for (const e of entries) {
        itemType = e.itemType;
        roll -= e.frequency;
        if (roll <= 0) break;
      }
      let orchJump = false;
      let moveX = bobberWX, moveY = bobberWY;         // :20667 普通 spawn 携浮标中心
      // ---- 1/4 跳鱼候选（:20669-20693）----
      if (next(4) === 0) {
        const n11 = nextRange(minX, maxX + 1);
        const n12 = nextRange(minX, maxX + 1);
        const left = Math.min(n11, n12);
        const span = Math.abs(n11 - n12);
        // :20678 起跳窗矩形 = (left·16+2, y·16-2, span·16-4, 12),向上扫至多 6 次
        let ry = y * 16 - 2;
        let clears = 0;
        for (let tries = 0; tries < 6 && !solidTilesRect(st, left * 16 + 2, ry, span * 16 - 4, 12); tries++) {
          ry -= 16;
          clears++;
        }
        const n18 = 3;
        if (clears >= n18) {                          // :20687 净空 ≥3 格才跳
          orchJump = true;
          const n19 = nextRange(1, 4);                // :20689 跃前潜深 1..3 格
          const n20 = n18 + n19;
          const heightPx = nextRange(16 * n20, (n19 + clears) * 16);   // :20691 跳高像素
          const atGravity = 0.2;
          // Utils.GetJumpForce/GetJumpTimeToApex（Utils.cs:704-712）
          const jumpForce = Math.sqrt(heightPx / atGravity * 2) * atGravity;
          const timeToApex2 = Math.sqrt(heightPx / atGravity * 2) * 2;
          moveX = ((n12 - n11) * 16) / timeToApex2;
          moveY = -jumpForce;
          posX = n11 * 16 + 4 + next(9);
          posY = (y + n19) * 16 + 4 + next(9);
        }
      }
      requestFakeFishSpawn(posX, posY, moveX, moveY, itemType, orchJump);   // :20695-20701
    }
  } finally {
    randFloat = prev;
  }
}

// ==================== sonar 三交互（ParticleOrchestrator.cs:1372-1408）====================

/** MagnetFakeFish（:1372-1389）：距离升序先试配型,全败再按序无差别磁化一只 */
export function magnetFakeFish(
  st: TileStore, target: FakeFishLatchTarget, searchedItemType: number,
): void {
  const ordered = [...school].sort((a, b) =>
    Math.hypot(a.x - target.cx, a.y - target.cy) - Math.hypot(b.x - target.cx, b.y - target.cy));
  for (const f of ordered) {
    if (f.tryToMagnetizeTo(st, target, searchedItemType)) return;
  }
  for (const f of ordered) {
    if (f.tryToMagnetizeTo(st, target, -1)) return;
  }
}

/** PingFakeFish（:1391-1399）：80f 视距内全员声呐点亮 */
export function pingFakeFish(st: TileStore, cx: number, cy: number, searchedItemType: number): void {
  const ordered = [...school].sort((a, b) =>
    Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  for (const f of ordered) f.tryToBePinged(st, cx, cy, searchedItemType);
}

/** PushAwayFakeFish（:1401-1408） */
export function pushAwayFakeFish(st: TileStore, cx: number, cy: number, searchedItemType: number): void {
  const ordered = [...school].sort((a, b) =>
    Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  for (const f of ordered) f.tryToPushAway(st, cx, cy, searchedItemType);
}

/** 收竿带渔获（Player.cs:53082 bobber.ai[1]=localAI[1] 的可观测镜像）：被该浮标
 *  latch 且鱼种=渔获的个体即刻自灭（CheckLatch :161-164 收线路的时点补偿） */
export function releaseCaughtFakeFish(target: FakeFishLatchTarget, itemType: number): void {
  for (const f of school) {
    if (f.matchesLatch(target) && f.itemType === itemType) f.dead = true;
  }
}

// ==================== 学校 tick / draw（Game/Renderer 单行挂点）====================

/** 主循环步进（Main.Update :4004 ParticleSystem_World_BehindPlayers.Update 同位） */
export function updateFakeFishSchool(game: FakeFishHost): void {
  for (let i = school.length - 1; i >= 0; i--) {
    const f = school[i];
    f.update(game);
    if (f.dead) school.splice(i, 1);
  }
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    s.age++;
    s.vx += s.axPerT; s.vy += s.ayPerT;
    s.x += s.vx; s.y += s.vy;
    s.rot += s.rotVel;
    if (s.age >= s.life) sparkles.splice(i, 1);
  }
}

// ---- 暗剪影烘焙（Draw :486/:498 Color.Lerp(W,B,.8)×.7 调制;本地两步乘色,
//      半加载窗拒烘不缓存——天体渲染双修教训：平色矩形永久毒化缓存）----

const silhouetteCache = new Map<string, HTMLCanvasElement>();
const SILHOUETTE_RGB = [51, 51, 51];   // Lerp(White,Black,0.8)

function silhouetteOf(
  atlas: { vicon(vid: number): { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } | null },
  vid: number, rgb: [number, number, number],
): HTMLCanvasElement | null {
  const q = (v: number) => Math.round(v / 32) * 32;   // 粗量化防 ping 渐变刷爆缓存
  const key = `${vid}|${q(rgb[0])},${q(rgb[1])},${q(rgb[2])}`;
  const hit = silhouetteCache.get(key);
  if (hit) return hit;
  if (silhouetteCache.size > 256) silhouetteCache.clear();
  if (typeof document === 'undefined') return null;
  const ar = atlas.vicon(vid);
  if (!ar || ar.sw <= 0 || ar.sh <= 0) return null;   // 未就绪:不缓存,下次重试
  const img = ar.img as { width?: number; naturalWidth?: number };
  if (!((img.naturalWidth ?? img.width ?? 0) > 0)) return null;
  const w = Math.max(1, Math.ceil(ar.sw)), h = Math.max(1, Math.ceil(ar.sh));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, 0, w, h);
  cx.globalCompositeOperation = 'multiply';            // RGB 乘调制色
  cx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = 'destination-in';      // 轮廓还原
  cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, 0, w, h);
  cx.globalCompositeOperation = 'source-over';
  silhouetteCache.set(key, c);
  return c;
}

/** Draw（:447-503）。r = Renderer（类型经调用方结构化传递避免环 import）：
 *  ctx/atlas/vicon 可达即可。glowmask 叠画与 sonar 环复制未画（见头注②③）。 */
export function drawFakeFishSchool(r: {
  ctx: CanvasRenderingContext2D | null;
  atlas: {
    vicon(vid: number): { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } | null;
    ensureVImage(path: string): CanvasImageSource | null;
  } | null;
}): void {
  const ctx = r.ctx;
  const atlas = r.atlas;
  if (!ctx || !atlas) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // ---- LakeSparkle 层（Star_0 加性自旋闪烁,FadingParticle 包络近似）----
  if (sparkles.length) {
    const starImg = atlas.ensureVImage('vanilla/Star_0.png');
    if (starImg && (starImg as { width: number }).width > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sparkles) {
        const t = s.age / s.life;
        const env = remap(t, 0, 0.45, 0, 1) * remap(t, 0.45, 1, 1, 0);   // FadeIn/Out 45%
        if (env <= 0) continue;
        ctx.globalAlpha = env * s.baseAlpha;
        const size = 22 * s.scale;                                       // Star_0 原生约 22px
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.drawImage(starImg, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
  // ---- 鱼本体（Draw :450-498）----
  for (const f of school) {
    const ar = atlas.vicon(f.itemType);
    if (!ar) continue;                                  // item 0 等无贴图层=原版空白观感
    const ratio = f.lifeCounted / f.lifeTotal;
    const envelope = remap(ratio, 0, 0.25, 0, 1) * remap(ratio, 0.85, 1, 1, 0);   // :451-452
    if (envelope <= 0) continue;
    // :455-458 呼吸缩摆（vector3=(2π·ratio·6).ToRotationVector2() → X+=Y·0.014/Y+=X·0.012）
    const ph = Math.PI * 2 * ratio * 6;
    const sx = f.totalScale + Math.sin(ph) * 0.014;
    const sy = f.totalScale + Math.cos(ph) * 0.012;
    let rot = f.rotation;
    if (f.looksDiagonally) rot += Math.PI / 4;          // :460-463 斜校
    const flip = f.vx < 0;                              // :477-479 逆行竖翻
    // :487-491 声呐白闪：fromValue=1−timeleft/start,num4 双梯形包络,
    //          选中向白全额 lerp / 他鱼 ×0.4
    let pingK = 0;
    if (f.isSonarActive) {
      const fromValue = 1 - f.sonarLeft / f.sonarStart;
      pingK = remap(fromValue, 0, 0.2, 0, 1) * remap(fromValue, 0.2, 1, 1, 0);
    }
    const whiten = f.isSelectedSonar ? pingK : pingK * 0.4;
    const rgb: [number, number, number] = [
      SILHOUETTE_RGB[0] + (255 - SILHOUETTE_RGB[0]) * whiten,
      SILHOUETTE_RGB[1] + (255 - SILHOUETTE_RGB[1]) * whiten,
      SILHOUETTE_RGB[2] + (255 - SILHOUETTE_RGB[2]) * whiten,
    ];
    const img = silhouetteOf(atlas, f.itemType, rgb);
    if (!img) continue;
    // :486/:498 alpha = Lerp(.7,1,whiten)×包络（Lerp(color,White,k) 的 A 支 178→255）
    ctx.globalAlpha = ((178 + 77 * whiten) / 255) * envelope;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(rot);
    if (flip) ctx.scale(1, -1);
    const dw = ar.sw * sx, dh = ar.sh * sy;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  ctx.restore();
}
