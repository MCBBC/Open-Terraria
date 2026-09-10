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
// ★终清波批：1090 彩虹巨石宠微光粒子（AI_067 ai[0]==1 段 Projectile.cs:50640-50648,
// ParticleOrchestration ShimmerBlock clientOnly:true 本地直驱——fx 本体 L6 收编池复用）
import { shimmerBlockFx } from '../fx/orchestraFx';
// ★终清波批：1050 斧仙树干扫描面（TileID.Sets.IsShakeable 等价集）+ 木材 vid→key
import { TREE_SHAKEABLE_SHEETS } from '../world/TreeShake';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { TILE_DEFS } from '../data/tiles';

// ===================== 数据表类型（vanilla-petai.json） =====================
type PetFamily = 'ground' | 'fly' | 'hover';

/** 跟随目标（Game.updatePetSlot 传入主角引用；构造签名对外不变） */
interface OwnerRef {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number; facing: number; dead: boolean;
  /** 玩家速度（动态提速门 :57540/:59145 消费） */
  vx?: number; vy?: number;
  /** 玩家四方向键电平（Game 输入合成段逐帧喂入——Wisp 211/ShadowOrb 18 的
   *  控制键偏移消费面:Projectile.cs:60779-60790/:24736-24745）。缺省
   *  undefined = 输入态不可知,偏移不生效（原版 control*=false 同观感）。 */
  inputLeft?: boolean; inputRight?: boolean; inputUp?: boolean; inputDown?: boolean;
  /** 坐骑面（Wisp 211 脱离门飞行坐骑支 :60813 原文 `player3.mount.Active &&
   *  player3.mount.CanFly(player3)`,红队 F8 补支）——属主 Player 直挂其
   *  MountInstance（active/canFly 与 Mount.cs:2817-2859 对齐;canFly 形参由属主
   *  实体充任,同 Player.ts:4555 `mnt2.canFly(this)`）。缺省 undefined = 无坐骑。 */
  mount?: { active: boolean; canFly(p: unknown): boolean };
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

/** ★终零波批：帧 branch 自带 rotation 的逐款集（208/825/958/1027——
 *  Projectile.cs:65827/:61861/:61969/:63624，draw() 消费 animRot） */
const PET_ANIM_ROT_IDS = new Set([208, 825, 958, 1027]);

/** TreeID.Sets.IsShakeable 子集可摇树的木材/树种掉落 vid 映射（KillTile_GetTreeDrops
 *  :66718-66790 树种面精简——GetTreeTypeAndTreeBottom 溯基座草族由【同列下探首块非
 *  干草格】承载。宝石树 583-589 的宝石果面与冠帧橡实面不入此精简表（登记）） */
const PET_AXE_WOOD_BY_GRASS: Record<number, number> = {
  23: 619, 199: 911, 60: 620, 147: 2503, 109: 621, 492: 621, 633: 5215,
};   // Forest/其余基座 → 9

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
/** ★SW-BL1 2026-09-06 伤害面定谳（证据结案,守卫即 1:1——不接 hurt/不加入任何可受击桶）：
 *  原版宠物全体=【投射物】非 NPC。宠物型 ∈ Main.projPet（Main.cs:8869-8989 逐型在案:
 *  208/211/653/764/774/825/957/958/960/1027/1050/1056/1090/1093…）;光宠 18（Shadow Orb,
 *  aiStyle 11,Projectile.cs:995-1005）/492（Magic Lantern,aiStyle 90,:5645-5652）不在
 *  projPet 表但同为投射物,light-pet 旗走 Buff 域（Main.lightPet bool[BuffID.Count],
 *  Main.cs:786）。投射物数据模型无 life/无 StrikeNPC,受害集三脸（Projectile.Damage
 *  :12502 分派）——Damage_PVE (:12572,Main.npc) / Damage_PVP (:14637,Main.player) /
 *  Damage_EVP (:12528,Main.player)——均不含投射物自身;且 Damage_CanDealDamage :12495
 *  对 projPet 型【反方向】恒 false（宠物也不能打 NPC,266/407/317 等祖辈例外除外）。
 *  敌怪 AI 索敌集=Main.player/城镇,从不选宠物。⇒ 原版宠物是结构免疫体（不存在
 *  "被打死/重生"语义——存续只由装备槽 buff 驱动 Player.UpdatePet :17147-17162）。
 *  仓内对应:本类为 Game.petFollower/lightPetFollower 单例（Game.ts:36287-36288,
 *  非 enemies/critters/npcs 桶成员）,无 hurt() 方法,爆炸/enemy 接触/弹幕全部 victim
 *  集不可达=1:1。任务面曾以"原版 Main.npc 单数组全员可被打"为前提评估——该前提对
 *  宠物不适用（宠物非 NPC）,以本注为正解结案。 */
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

  // ---- ★终清波批彩蛋状态 ----
  /** 764 UpbeatStar alpha 脉冲三角波（localAI[0]：0..120 折返,:66806-66808/
   *  :66831-66834 Opacity=Lerp(0.4,0.75,tri)）；starRot=localAI[1] 自旋累加
   *  （+=vX*0.01+1/120 wrap ±2π,:66809-66816—— FallenStar 覆绘旋转消费面,
   *  ★SW-FX9 已随 Item_75.png 入库接通,draw() 覆绘支消费） */
  private starT = 0;
  private starOpacity = 1;
  private starRot = 0;
  /** 1050 斧仙（AI_144 case 1050 :71258-71338）：axeCd=localAI[1]（<0 冷却,
   *  ≥0 工作态）、chopAccum=localAI[2] 砍击蓄量、lai0 相位 = animTick 共用、
   *  chopMode 锚覆写与动画窗标记 */
  private axeCd = 0;
  private chopAccum = 0;
  /** 1090 彩虹巨石宠微光粒子相位（原版读 Main.LocalPlayer.miscCounter %2==0） */
  private shimmerParity = 0;
  /** 764 Y 波消费位（upbeatStarTick 前置计算→hoverAI 目标点叠加,:66835 case 尾式） */
  private hoverWaveY = 0;
  /** 1050 斧仙 chop 态锚覆写（树格近侧位,axeFairyAI 帧内直读） */
  private _axeTargetX?: number;
  private _axeTargetY?: number;
  /** 1050 斧仙 localAI[0] 相位（120 wrap——公共尾段 lai0++ 承载,Y 波相基准） */
  private axeLai0 = 0;
  /** npc.rotation（AI_144 双档旋转面：快档 avg12 / 慢档 ×0.96 衰减；draw 消费） */
  private rot = 0;
  // ---- ★终零波批：地面族逐款帧机 latch ----
  /** 958/825 待机轮 localAI[0]（眨眼/表情轮盘计时——Projectile.cs:63403/:64522） */
  private laiG = 0;
  /** 208/825/958/1027 帧 branch 内 rotation（rotation=vx·k 等，draw 消费；
   *  undefined = 本拍无旋转覆写 → 走通用翻转面） */
  private animRot?: number;

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
    // ★终清波批：764 UpbeatStar 专属前段（alpha 脉冲/Y 波相位/d292 微光尘）——
    //   AI_144 case 764 :66801-66832；movement 仍走 hover 公共段（flag2=true 悬停族）
    if (this.projId === 764) this.upbeatStarTick(p, game);
    switch (R.family) {
      case 'ground': this.groundAI(p, game, R); break;
      case 'fly': this.flyAI(p, R); break;
      case 'hover':
        // ★终清波批：1050 斧仙走全量专支（扫描/砍击/动画窗覆写——通用 hover 帧
        //   机表达不了 chop 态 num5=8 带）,其余悬停族照旧
        if (this.projId === 1050) { this.axeFairyAI(p, game); break; }
        this.hoverAI(p, R); break;
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
      // ★终清波批：1090 彩虹巨石宠微光粒子（AI_067 ai[0]==1 归位飞行段 :50640-50648,
      // Main.LocalPlayer.miscCounter %2==0 → ShimmerBlock 编排 @Center+NextCircularEdge
      // (w/2,h/2)、MovementVector=v*0.05、UniqueInfoPiece=500;clientOnly:true 本地直驱）
      if (this.projId === 1090) {
        const gmc = (p as unknown as { miscCounter?: number }).miscCounter
          ?? (game as unknown as { miscCounter?: number }).miscCounter ?? ++this.shimmerParity;
        if ((gmc % 2 + 2) % 2 === 0 && shimmerBlockFx) {
          const ang = Math.random() * Math.PI * 2;
          const ex = this.cx + Math.cos(ang) * this.w / 2, ey = this.cy + Math.sin(ang) * this.h / 2;
          shimmerBlockFx(game, ex, ey, this.vx * 0.05, this.vy * 0.05, 500);
        }
      }
      // 落回地面门（:57556-57562）：距玩家 < landRange、玩家落地、宠物不高于玩家脚、
      // 宠物未嵌块 → 退出飞行（vy 钳 ≥ -6）
      // ★终零波：208 鹦鹉降落禁用档（P.cs:61487——玩家 |vx|+|vy|>4 时 num102=-1,
      // 本 tick 不降；"0.95 水平阻尼"旧登记系该段误读,顺此销核）
      const landGate = !(this.projId === 208 && pSpeed >= 4);
      const pvy = (p as { vy?: number }).vy ?? 0;
      const landRange = e.landRange ?? D.landRange ?? 200;
      if (landGate && dist < landRange && pvy === 0 && this.y + this.h <= p.y + p.h
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
    // ★终零波：208 鹦鹉本支字面档 = +0.1 / cap4（P.cs:65846-65847，flag27 链
    // type==208 分支内自带——非家族通用行）
    const grav = this.projId === 208 ? 0.1 : (e.gravity ?? D.gravity ?? 0.4);
    const fallCap = this.projId === 208 ? 4 : (e.fallCap ?? D.fallCap ?? 10);
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
    // ★Wisp(211) 控制键偏移（AI_026 211 专属支 :60779-60801,登记缺口①清偿
    //  2026-09-03；down 档红队 F7 修正）：controlLeft → 目标 −120 / controlRight →
    //  +120（if/else if 链,同按左优先,:60782-60788）;纵轴按原文 if/else 结构——
    //  down 支仅 +120【无 −60】（:60790-60793）,else 支 = 无条件 −60（:60800,基线
    //  hoverY 即该项）+ up −120（:60796-60798）→ 净偏移 up −180 / 无键 −60 /
    //  down +120。偏移在距离计算前施于目标点 = 原版施于 num64/num65 同构
    // （远距瞬移/追击档同吃）
    if (this.projId === 211 && (p.inputLeft !== undefined || p.inputUp !== undefined
      || p.inputRight !== undefined || p.inputDown !== undefined)) {
      if (p.inputLeft) tx -= 120;
      else if (p.inputRight) tx += 120;
      if (p.inputDown) ty = p.cy + 120;   // down 支字面 +120,不含 else 支无条件 −60（:60790-60793）
      else if (p.inputUp) ty -= 120;      // else 支:基线 hoverY(−60) + up −120（:60794-60801）
    }
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
    // ★ Wisp(211) 远距追击档（AI_026 211 专属支 :60774-60827;红队 F8 纠锚——旧
    //  :56867-56925 系 AI_001 无关段）：localAI[0] 闩——>200 置位（:60864-60866）；
    //  追击中恒速 12 直取（<12 直接取位移;num63 :60818 重赋 12 只作追击速度）；
    //  脱离门 = 距 <10（:60810）且玩家近乎静止(|v|<num63=5f,:60777 赋值) 且
    //  （velocity.Y==0 或（mount.Active && mount.CanFly）,:60813——飞行坐骑也算
    //  可脱离）。此前只建模近档 → 玩家跑远 Wisp 明显滞后
    if (this.projId === 211) {
      const pSpeed = Math.abs(p.vx ?? 0) + Math.abs(p.vy ?? 0);
      const mountFly = !!(p.mount?.active && p.mount.canFly(p));   // :60813 mount.Active && mount.CanFly
      if (!this.wispFar && d > 200) this.wispFar = true;
      if (this.wispFar) {
        if (d < 10 && pSpeed < 5 && ((p.vy ?? 0) === 0 || mountFly)) this.wispFar = false;
        else {
          const k = d < 12 ? 1 : 12 / (d || 1);
          this.vx = dx * k; this.vy = dy * k;
          this.x += this.vx; this.y += this.vy;
          if (this.vx > 0.5) this.dir = -1;
          else if (this.vx < -0.5) this.dir = 1;
          return;   // 追击段独立收尾（原版 localAI[0]==1 支 return :60862）
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
      // ★ShadowOrb(18) 控制键档（:24736-24745,登记缺口①清偿 2026-09-03）：
      //  controlUp → 目标 = (玩家中心X−6, 玩家头顶上 40px)、controlDown →
      //  (玩家中心X−6, 玩家脚底下 40px),两档皆保持距 num87 70→4（num84−=6 只在
      //  两键支内）;无键 = 玩家中心 + holdDist 70 不变
      const orbUp = this.projId === 18 && p.inputUp === true;
      const orbDown = this.projId === 18 && p.inputDown === true;
      const orbHold = orbUp || orbDown ? 4 : e.holdDist;
      const tx = orbUp || orbDown ? p.cx - 6 : p.cx;
      const ty = orbUp ? p.y - 40 : orbDown ? p.y + p.h + 40 : p.cy;
      const dx = tx - this.cx, dy = ty - this.cy;
      const d = Math.hypot(dx, dy);
      if (d > teleport) {
        this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2;
        this.vx = 0; this.vy = 0;
      } else if (d > orbHold) {
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
    // ★终清波批：764 Y 波（AI_144 case 764 段尾 vector.Y += cos(lai0/120·τ)×2）——
    //   upbeatStarTick 每 tick 前置算好供本处消费（case 特有波不并 bob 表）
    if (this.projId === 764 && this.hoverWaveY !== 0) ty0 += this.hoverWaveY;
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
  // 帧表 = 竖排条（Main.projFrames；帧高 = 图高/帧数）。逐款帧窗口转正面：
  //   ground：待机 0／空中 1／行走 0..min(frames,3) 按 |vx| 累进（家族通用式近似,
  //           兜底面）；★终零波批已转正专支:960 Chester(:63714-63828)/208 鹦鹉
  //           (:65826)/825 小红熊猫(:64465+:61852)/958 独眼巨鹿宠(:63386+:61955)/
  //           1027 掘地蜂群(:63576) —— 见 parrotStep/pandaStep/deerclopsStep/
  //           cavelingStep 各方法体内行号注;
  //   fly：匀速循环全表（移动 4t/帧、待机 8t/帧）；
  //   hover：AI_144/124 原版双速率（待机 idleRate/移动 moveRate，vel>6 判移动）。
  //   ★957 GlommerPet 走专支（见 case 'hover' 头部注释）。
  //   ★960 Chester 宠物箱走专支（见 case 'ground' 头部注释——2026-08-26 接通，
  //     此前落在本文件尾"③ 地面族逐款帧窗口"近似登记内）。
  private stepAnim(R: PetParams, game?: GameHooks, movedX = true): void {
    const frames = Math.max(1, R.e.frames ?? 1);
    // ★终清波批：1050 帧行为全量走 axeFairyAI 专支（chop 带 num5=8 表达不了）——此处直退
    if (this.projId === 1050) return;
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
        // ---- ★终零波批：四款逐帧窗转正（此前按家族通用式近似）----
        if (this.projId === 208) { this.parrotStep(movedX); break; }
        if (this.projId === 825) { this.pandaStep(movedX); break; }
        if (this.projId === 958) { this.deerclopsStep(movedX); break; }
        if (this.projId === 1027) { this.cavelingStep(movedX); break; }
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

  // ===========================================================================
  // ★终零波批：地面族四款逐帧窗（此前按家族通用规则近似——本批逐款转正）。
  // 源 = AI_026 flag27 状态链（Projectile.cs:63335 起）+ 追赶飞行窗（:61852/:61955/
  // :62290 各 type 分支）。判据面：air=velocity.Y≠0（引擎等价=moveAndCollide 落地
  // 即 vy==0,Chester 批同约定）；idle=flag27(position.X−oldPosition.X==0 ↔ movedX
  // 取反)；flight=this.flying（ai[0]≠0）。旋转经 animRot 字段在 draw() 消费。
  // ===========================================================================

  /** 208 鹦鹉（flag27 链 :65826-65848 + 飞行窗 :62290-62299 同式合并——两段字面一致）：
   *  落定→面向玩家(双 if 序) rot 归零 frame0；其余 rot=vx×0.075、7t 步进、窗 [1..4]
   *  （>4 回 1 / <1 钳 1）。★重力档差异（本支字面 velocity.Y+=0.1 cap4 :65846-65847
   *  vs 家族通用 0.4/10）由 groundAI projId===208 覆写承载 */
  private parrotStep(movedX: boolean): void {
    if (this.vy === 0 && !movedX && !this.flying) {
      const p = this.ownerRef();
      if (p) {
        if (p.cx < this.cx) this.dir = -1;
        else if (p.cx > this.cx) this.dir = 1;       // :65831-65836 双独立 if
      }
      this.animRot = 0;
      this.frame = 0;
      this.frameAcc = 0;
      return;
    }
    this.animRot = this.vx * 0.075;
    if (++this.frameAcc > 6) { this.frameAcc = 0; this.frame++; }
    if (this.frame > 4) this.frame = 1;
    if (this.frame < 1) this.frame = 1;
  }

  /** 825 小红熊猫（flag27 链 :64465-64554 + 飞行窗 :61852-61861）：
   *  空 → laiG 清 frame12；追赶飞 → 4t 步进窗 [21..25] + rot=vx×0.025；
   *  待机 → 三段表情轮盘（1..2 段 6t 循环 / 3..11 段 6t 循环回 0 / 其余归 13,13 段
   *  9t 后 14→0,laig>300 且 rand(50)==0 → rand(2)?3:1 入轮）;行走 → rate 按 |v|
   *  分档（>4:每3t/>2:每2t/≤2:每4t）、窗 [13..19]（<13 回 13、>19 回 14）。
   *  待机朝向反序（player 左 → spriteDirection=+1,:64474-64477） */
  private pandaStep(movedX: boolean): void {
    if (this.flying) {                                    // ai[0]≠0 追赶飞行（:61852）
      if (++this.frameAcc > 4) { this.frameAcc = 0; this.frame++; }
      if (this.frame < 21 || this.frame > 25) this.frame = 21;
      this.animRot = this.vx * 0.025;
      return;
    }
    this.animRot = undefined;                             // 落地链无旋转覆写（飞行值清零防残留）
    if (this.vy !== 0) {                                  // 空中定格（:64469-64472）
      this.laiG = 0;
      this.frameAcc = 0;
      this.frame = 12;
      return;
    }
    if (!movedX) {                                        // 待机轮盘（:64473-64535）
      const p = this.ownerRef();
      this.dir = -(Math.sign(p ? p.cx - this.cx : 0)) || this.dir;
      if (this.frame >= 1 && this.frame <= 2) {
        this.laiG = 0;
        if (++this.frameAcc > 5) { this.frameAcc = 0; this.frame++; }
        if (this.frame > 2) this.frame = 0;
      } else if (this.frame >= 3 && this.frame <= 11) {
        this.laiG = 0;
        if (++this.frameAcc > 5) { this.frameAcc = 0; this.frame++; }
        if (this.frame > 11) this.frame = 0;
      } else {
        if (this.frame === 13) {
          if (++this.frameAcc > 8) { this.frameAcc = 0; this.frame++; }
          if (this.frame === 14) this.frame = 0;
        }
        if (this.frame !== 0) this.frame = 13;
        else this.frame = 0;
        if (this.frame === 0) {
          this.laiG++;
          if (this.laiG > 300 && Math.floor(Math.random() * 50) === 0) {
            this.frame = Math.floor(Math.random() * 2) === 0 ? 1 : 3;   // switch(rand(2))
          }
        }
      }
      return;
    }
    // 行走（:64537-64550）：rate=num214∈{3(|v|≤2),1(>2),2(>4)} 步进周期=num214+1
    this.laiG = 0;
    const len = Math.hypot(this.vx, this.vy);
    const num214 = len > 4 ? 2 : len > 2 ? 1 : 3;
    if (++this.frameAcc > num214) { this.frameAcc = 0; this.frame++; }
    if (this.frame < 13) this.frame = 13;
    if (this.frame > 19) this.frame = 14;
  }

  /** 958 独眼巨鹿宠 DeerclopsPet（flag27 链 :63386-63427 + 飞行窗 :61955-61970）：
   *  空 → laiG/frameCounter 清 frame4；待机 → 面向玩家（player 左 → −1）+ 停留
   *  laiG++ 过 200 起眨眼帧 1+(laiG−200)/6（≥218 收 0 并重掷 laiG=rand(100)）；行走 →
   *  frameCounter+=|v| 每 7t 步进、窗 [5..12]；追赶飞 → sign(vx) 定向、<13 先钉 13、
   *  4t 步进窗 [13..16]、rot=clamp(vx×0.025,±0.4)。行走态 rotation 无覆写 */
  private deerclopsStep(movedX: boolean): void {
    if (this.flying) {                                    // ai[0]≠0（:61955）
      if (this.vx !== 0) this.dir = Math.sign(this.vx);
      if (this.frame < 13) { this.frame = 13; this.frameAcc = 0; }
      if (++this.frameAcc > 4) { this.frameAcc = 0; this.frame++; }
      if (this.frame > 16) this.frame = 13;
      this.animRot = clamp(this.vx * 0.025, -0.4, 0.4);
      return;
    }
    this.animRot = undefined;                             // 落地链无旋转覆写（飞行值清零防残留）
    if (this.vy !== 0) {                                  // 空中定格（:63387-63390）
      this.laiG = 0;
      this.frameAcc = 0;
      this.frame = 4;
      return;
    }
    if (!movedX) {                                        // 待机+眨眼轮（:63392-63409）
      const p = this.ownerRef();
      this.dir = -(Math.sign(p ? this.cx - p.cx : 0)) || this.dir;   // player 左→−1（:63394-63397 同序）
      this.laiG++;
      if (this.laiG > 200) {
        this.frame = 1 + Math.floor((this.laiG - 200) / 6);
        if (this.laiG >= 218) {
          this.frame = 0;
          this.laiG = Math.floor(Math.random() * 100);
        }
      } else {
        this.frame = 0;
      }
      return;
    }
    this.laiG = 0;                                        // 行走（:63410-63420）
    this.frameAcc += Math.trunc(Math.hypot(this.vx, this.vy));
    if (this.frameAcc > 6) { this.frameAcc = 0; this.frame++; }
    if (this.frame < 5 || this.frame > 12) this.frame = 5;
  }

  /** 1027 掘地蜂群 Caveling（flag27 链 :63576-63631；α 视觉+渐隐降落链 :61346/:59945 登记偏差）：
   *  升(vy<0)→frame2 / 降(vy>0)→frame4 / 待机→面向玩家反向序（player 左→+1)frame0 /
   *  行走→frameCounter+=max(1,(int)(|v|/2)) 每 6t 步进窗 [0..3];rot=0,腾空时 =
   *  vy/10·π/4·(−spriteDirection)（:63622-63626）。★碰撞腾空分帧(rot/2/4 帧)与
   *  本仓"onGround 稳态"近似一致性由引擎落地清 vy 保证 */
  private cavelingStep(movedX: boolean): void {
    if (this.flying || !this.onGround) {
      // 追赶飞行（vanilla=(209/956/1027) 特化「渐隐平移至玩家脚下」:61346-61368，
      // 非 ai[0]!=0 通用追击）——未建模登记，维持批前通用表现（定格帧 1）
      this.animRot = undefined;
      this.frameAcc = 0;
      this.frame = 1;
      return;
    }
    if (this.vy < 0) this.frame = 2;
    else if (this.vy > 0) this.frame = 4;
    else if (!movedX) {
      const p = this.ownerRef();
      this.dir = -(Math.sign(p ? p.cx - this.cx : 0)) || this.dir;   // player 左→+1(:63590-63593 反序族同 825)
      this.frame = 0;
      this.frameAcc = 0;
    } else {
      this.frameAcc += Math.max(1, Math.trunc(Math.hypot(this.vx, this.vy) / 2));
      if (this.frameAcc > 5) { this.frameAcc = 0; this.frame++; }
      if (this.frame < 0 || this.frame > 3) this.frame = 0;
    }
    this.animRot = this.vy !== 0
      ? this.vy / 10 * (Math.PI / 4) * (-this.dir)
      : 0;
  }

  // ===================== ★终清波批彩蛋（AI_144 DD2Pet 特化段） =====================
  /** 764 UpbeatStar 前段（Projectile.cs:66801-66832 AI_144 case 764 全式）：
   *  · localAI[0] 相位 ++ wrap120 → alpha 脉冲三角波 Opacity=Lerp(0.4,0.75,fold)
   *    （:66831-66834,num11 折返）；draw() 以 starOpacity 消费
   *  · localAI[1] 自旋：+=vX×0.01 + 1/120，wrap ±2π；慢速档再 ×0.9（:66809-66820）
   *    ——消费面（DrawProjWithStarryTrail FallenStar 覆绘 rotation）★SW-FX9
   *    已随 Item_75.png 入库接通（draw() 覆绘支,Main.cs:38315-38333）
   *  · d292 微光尘：慢速档 |v|∈(0.1,4) Next(30)==0 一粒（vel×0.5 出速→×0.3 阻尼+
   *    noLightEmittance,:66821-66823）;快速档 ≥4 时无屏盒结果消费直 Next(15)==0 且
   *    scale0.9 档（:66826-66830——原版 Hitbox.Intersects 结果弃置,不建模）
   *  · Y 波 cos(localAI[0]/120·τ)×2 → hoverWaveY 供 hoverAI 目标叠加（:66835） */
  private upbeatStarTick(p: OwnerRef, game: GameHooks): void {
    void p;
    this.starT = this.starT + 1 > 120 ? 0 : this.starT + 1;        // :66806-66808
    let num11 = this.starT / 120 * 2;                              // :66831
    if (num11 > 1) num11 = 2 - num11;
    this.starOpacity = num11 * (0.75 - 0.4) + 0.4;                 // Lerp(0.4,0.75)
    this.starRot += (this.vx ?? 0) * 0.01 + 1 / 120;               // :66809-66811
    while (this.starRot < -Math.PI * 2) this.starRot += Math.PI * 2;
    while (this.starRot > Math.PI * 2) this.starRot -= Math.PI * 2;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd < 4) {
      this.starRot *= 0.9;                                         // :66819
      if (spd > 0.1 && Math.floor(Math.random() * 30) === 0) {     // :66821-66823
        const d = game.spawnDust?.(this.x - this.vx, this.y - this.vy,
          this.w, this.h, 292, this.vx * 0.5, this.vy * 0.5, 150);
        if (d) { d.vx *= 0.3; d.vy *= 0.3; d.noLightEmittance = true; }
      }
    } else if (Math.floor(Math.random() * 15) === 0) {             // :66826-66830
      const d = game.spawnDust?.(this.x - this.vx, this.y - this.vy,
        this.w, this.h, 292, this.vx * 0.5, this.vy * 0.5, 150, null, 0.9);
      if (d) d.noLightEmittance = true;
    }
    this.hoverWaveY = Math.cos(this.starT / 120 * Math.PI * 2) * 2; // :66835 case 尾
  }

  /** 1050 斧仙全量专支（Item 5517/buff 372；AI_144 case 1050 :71258-71338 + 公共尾段
   *  :71339-71414 逐段）：原地沿玩家朝向侧扫 12 格寻 IsShakeable 树干——找到即锚定
   *  树格近侧 30px 悬停（vector 覆写）+ 动画窗 8..15 每 3t + 砍击拍（frame==8||12 且
   *  frameCounter==0：木屑粒/dig 音/蓄量++ 与 200+rand(100)（rand(20)==0 ÷8 加急档）
   *  达标且 rand(5)==0 → KillTile_DropItems 掉木材【不毁树】）;主 >320px 或扫空 →
   *  localAI[1] 置 -300 缓启。移动/旋转/帧行为照公共尾段（num4=16 常规带 vs chop 带）。*/
  private axeFairyAI(p: OwnerRef, game: GameHooks): void {
    const st = game.world.store;
    const num = 3;                       // 巡航速度档 num=3f（case 1050 覆写 :71263）
    const accFactor = 0.1;               // num7 缺省档
    // ---- case 1050 头段（:71258-71338）----
    if (this.axeCd < 0) this.axeCd++;                                  // 冷却回充 :71264-71267
    let chopMode = false;
    if (this.axeCd >= 0) {
      if (Math.hypot(p.cx - this.cx, p.cy - this.cy) >= 320) {
        this.axeCd = -300;                                             // 远离 → localAI[1]=-300
      } else {
        this.chopAccum++;                                              // localAI[2]++（近主即累计）
        // 侧向扫描（:71268-71290）：中心格起 ×direction 至多 12 格——IsShakeable
        // 即树干命中；非树实心截停；越界/tile 空截停；溢出格（k==0）步退一格
        const tx0 = Math.floor(this.cx / TILE), ty0 = Math.floor(this.cy / TILE);
        let px = tx0, k = 12, hit = false, walkedOut = false;
        const sheetOf = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
        while (!hit && k > 0 && st.inBounds(px, ty0)) {
          const t = st.type[st.idx(px, ty0)];
          // 1457 Projectile.cs:71285 `if (tile.active())`——active() 位本体读 hasTile
          // （红蓝对抗 F7：曾用 type≠0 代读，幽灵树残型被误砍 → 幽灵树掉木材；
          //   下游 dropFairyWood 同根 type 读只随此门可达，自动封闭）
          if (st.hasTile(px, ty0)) {
            if (TREE_SHAKEABLE_SHEETS.has(sheetOf(t))) { hit = true; break; }
            if (st.isSolid(px, ty0)) break;               // SolidTile 非树截停（不置 flag3）
          }
          k--;
          px += p.facing;
          if (!st.inBounds(px, ty0)) walkedOut = true;
        }
        if (walkedOut && k === 0) px -= p.facing;         // num9==0 步退（:71291-71294）
        if (hit) {
          chopMode = true;
          // 锚定覆写（:71295-71297）：vector = 树心 +(−dir×30,0) − MountedCenter；
          // 动画窗 num4=16/num5=8/num2=3（:71298-71300）
          this._axeTargetX = px * TILE + 8 - p.facing * 30;
          this._axeTargetY = ty0 * TILE + 8;
          // 砍击拍（:71301-71324）：frameCounter==0 ∧ frame∈{8,12} → 尘/音/蓄量掷骰
          if (this.frameAcc === 0 && (this.frame === 8 || this.frame === 12)) {
            game.spawnParticles?.(px * TILE + 8, ty0 * TILE + 8, '#7A5230',
              3, 1.6, { life: 22, grav: 0.25 });         // KillTile_MakeTileDust 木屑≈C 近似
            game.playSfxFiles?.(['dig'], 1, this.cx, this.cy);   // PlaySounds(fail:true)≈dig 档
            let need = 200 + Math.floor(Math.random() * 100);
            if (Math.floor(Math.random() * 20) === 0) need = Math.floor(need / 8);   // 加急档
            if (this.chopAccum >= need && Math.floor(Math.random() * 5) === 0) {
              this.chopAccum = 0;                        // localAI[2] 归零 + 掉木材【不毁树】
              this.dropFairyWood(game, px, ty0);
            }
          }
        }
      }
    }
    // ---- 公共尾段（:71339-71414）----
    // case 尾 Y 波：cos(localAI[0]·π/30)×2（lai0 120 wrap 由本类 axeLai0 承载）
    this.axeLai0 = (this.axeLai0 + 1) % 120;
    const waveY = Math.cos(this.axeLai0 * (Math.PI / 30)) * 2;
    // vector：chop 态锚定向 / 常规 (−dir×30, −20)+wave（case 头 vector.X*=-1）
    const vx0 = chopMode && this._axeTargetX !== undefined
      ? this._axeTargetX - p.cx
      : -p.facing * 30;
    const vy0 = chopMode && this._axeTargetY !== undefined
      ? this._axeTargetY - p.cy
      : -20;
    const tx = p.cx + vx0, ty = p.cy + vy0 + waveY;     // vector4 = MountedCenter+vector
    const dist = Math.hypot(tx - this.cx, ty - this.cy);
    if (dist > 1000) {                                   // :71345-71348 瞬移（Center=player.Center+vec）
      this.x = p.cx + vx0 - this.w / 2;
      this.y = p.cy + vy0 + waveY - this.h / 2;
      this.vx = 0; this.vy = 0;
    }
    const tvx = tx - this.cx, tvy = ty - this.cy;
    if (dist < num) { this.vx *= 0.25; this.vy *= 0.25; }            // :71353-71355
    const tl = Math.hypot(tvx, tvy);
    if (tl !== 0) {
      if (tl < num * 0.5) { this.vx = tvx; this.vy = tvy; }          // :71357-71360
      else { this.vx = tvx * accFactor; this.vy = tvy * accFactor; } // :71361-71366
    }
    this.dir = p.facing;                                 // direction=spriteDirection=主向
    // 帧机：常规带 num4=3/num5=0 rate num2=5；chop 带 num4=16/num5=8 rate num2=3
    // 旋转两档照原文（快 |v|>6 → num13=vX×num6+vY·dir×0.02 avg12；慢 → 衰减 ±π wrap）
    const bandTop = chopMode ? 16 : 3;
    const bandReset = chopMode ? 8 : 0;
    const fast = Math.hypot(this.vx, this.vy) > 6;
    const rateN = fast ? 3 : 5;                          // 快档 num3=3 / 慢档 num2=5
    if (fast) {
      const num13 = this.vx * 0.08 + this.vy * p.facing * 0.02;
      this.rot = (this.rot * 11 + num13) / 12;           // (rot*(12-1)+num13)/12
      if (++this.frameAcc >= rateN) {
        this.frameAcc = 0;
        if (++this.frame >= bandTop) this.frame = bandReset;
      }
    } else {
      if (this.rot > Math.PI) this.rot -= Math.PI * 2;
      if (this.rot > -0.005 && this.rot < 0.005) this.rot = 0;
      else this.rot *= 0.96;
      if (++this.frameAcc >= rateN) {
        this.frameAcc = 0;
        if (++this.frame >= bandTop) this.frame = bandReset;
      }
    }
  }

  /** 斧仙木料掉落（KillTile_DropItems :64469 → GetTreeDrops 树种面精简版）：
   *  同列下探首块非干格定基座 → TILE_DEFS 换算原版 sheet（本仓 tile id≠原版 id,
   *  Game.dropVanillaTreeLoot 同口径）→ 树种 vid（PET_AXE_WOOD_BY_GRASS,缺省 9）；
   *  bonusWood 掷骰 1/3 面（手持斧力读取跨私有域登记简化）+ 蘑菇树 50% 无果。
   *  ★宝石树果面/冠帧橡实面不入此精简表（登记） */
  private dropFairyWood(game: GameHooks, treeX: number, treeY: number): void {
    const st = game.world.store;
    const sheetOf = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    let sheet = sheetOf(st.type[st.idx(treeX, treeY)]);
    let gy = treeY;
    while (gy < st.h) {
      const t = st.type[st.idx(treeX, gy)];
      if (t !== 0 && sheetOf(t) !== sheet) break;
      gy++;
    }
    const groundSheet = gy < st.h ? sheetOf(st.type[st.idx(treeX, gy)]) : -1;
    const isMushroom = groundSheet === 70 || sheet === 72;
    if (isMushroom && Math.random() >= 0.5) return;
    const vid = isMushroom ? 183
      : (PET_AXE_WOOD_BY_GRASS[groundSheet] ?? 9);
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    if (!key) return;
    const bonus = Math.floor(Math.random() * 35) <= 0 || Math.floor(Math.random() * 3) === 0;
    game.spawnDrop?.(treeX * TILE + 8, gy * TILE, key, bonus ? 2 : 1,
      (Math.random() - 0.5) * 2, -2 - Math.random());
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
    // ★SW-FX9（2026-09-10）：764 UpbeatStar DrawProjWithStarryTrail 陨星覆绘
    //   （Main.cs:38315-38333——资产面=Item_75.png 经 atlas-append 通道入库,登记债清偿）：
    //   · 画序:DrawProjWithStarryTrail 在 DrawProjectiles else-if 链先跑、本体
    //     EntitySpriteDraw 在后 → 覆绘【先】于本体（本体压顶）
    //   · 贴图 = Item_75 Frame(1,8) 顶帧（22×26,恒首帧不逐帧走）,origin=帧心,
    //     position=Center,proj.scale=1
    //   · rotation = proj.rotation + localAI[1]（:38316）——AI_144 不写 rotation
    //     (缺省 0) → = starRot（upbeatStarTick 累积 vx×0.01+1/120 wrap±2π 慢速×0.9）
    //   · color = Color(255,255,255, projectileColor.A−proj.alpha)（:38303;
    //     764 GetAlpha 恒 White P.cs:80749-80751,Opacity 三角波写 alpha
    //     :71244-71245）→ A = 255×Opacity → globalAlpha = starOpacity
    //   · SpriteEffects.None:覆绘不随 facing 翻转 → 独立 save 块,不吃本体 flip
    //   · Extra_91 五星芒尾未画（拖尾域登记债维持,见类尾注②——非本批范围）
    if (this.projId === 764) {
      const itemImg = r.atlas?.ensureVImage?.('vanilla/Item_75.png');
      if (itemImg && itemImg.height >= 8) {
        const ifh = itemImg.height / 8;                        // Frame(1,8) 帧高 26
        ctx.save();
        ctx.globalAlpha *= this.starOpacity;                   // A=255×Opacity
        ctx.rotate(this.starRot);                              // proj.rotation+localAI[1]
        ctx.drawImage(itemImg, 0, 0, itemImg.width, ifh,
          -itemImg.width / 2, -ifh / 2, itemImg.width, ifh);
        ctx.restore();
      }
    }
    // ★终清波批：1050 旋转照原版 npc.rotation（AI_144 双档旋转面）；
    //   764 alpha 脉冲（Opacity 三角波 Lerp(0.4,.75) :66831-66834）→ globalAlpha
    if (this.projId === 1050) {
      if (flip) { ctx.rotate(-this.rot); ctx.scale(-1, 1); }
      else ctx.rotate(this.rot);
    } else if (this.animRot !== undefined && PET_ANIM_ROT_IDS.has(this.projId)) {
      // ★终零波：地面族四款帧 branch rotation（208=vx×0.075 / 825·958 飞行=vx×0.025
      // [958 钳 ±0.4] / 1027 腾空=vy/10·π/4×(−dir)；翻转位按 1050 同式先旋后镜）
      if (flip) { ctx.rotate(-this.animRot); ctx.scale(-1, 1); }
      else ctx.rotate(this.animRot);
    } else if (this.params.e.roll) ctx.rotate(this.rollRot);
    else if (flip) ctx.scale(-1, 1);
    if (this.projId === 764) ctx.globalAlpha *= this.starOpacity;
    // 帧按原像素尺寸 1:1 绘制（原版投射物 scale=1，判定盒小于贴图帧）
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  // =============== 回退：旧统一肩后悬停近似（表外 proj id 用） ===============
  // 登记缺口（残留的近似项；★终零波批已大面积销核）：
  //  ① ★2026-09-03 清偿：Wisp(211)/ShadowOrb(18) 的控制键偏移已 1:1 入位
  //    （Wisp 211 = AI_026 专属支 :60779-60790,Left/Right ±120、Down +120/Up −120,
  //    缺省 hoverY −60 已含;ShadowOrb 18 = aiStyle 11 :24736-24745,Up/Down
  //    目标 = 玩家头顶上/脚底下 40px + 中心X−6 + 保持距 70→4）。输入态 =
  //    OwnerRef 四方向键电平（Game 输入合成段喂入,Player.inputLeft/Right/Up/Down）。
  //  ② ★终清波批销核面：764 alpha 脉冲/Y 波/d292 微光尘（upbeatStarTick）、1050 斧仙
  //    砍树专支（axeFairyAI+dropFairyWood）、1090 归位飞行 ShimmerBlock 编排粒子
  //    （groundAI flying 段）已 1:1 入位。653 同伴方块彩蛋本体在 MinionProj.
  //    companionCubeStep（本仓该宠走弹体召唤路 = 原版 BuffHandle_SpawnPetIfNeeded
  //    NewProjectile 同构,非 PetFollower 承载）→ 此处无重复实现。
  //    ★资产缺口销核（2026-09-01 终零波批）：Extra_91 星芒尾已随 StarfuryStar.draw
  //    真值组合落地（vanilla/Extra_91.png 盘上在案,MissileProj.ts 染色副本周转池），
  //    渲染域债登记退役。★SW-FX9（2026-09-10）：FallenStar 覆绘(764)随 Item_75.png
  //    入库（atlas-append 通道）+ draw() 覆绘支落地,登记债清偿（Main.cs:38315-38333）。
  //  ③ 地面族逐款帧窗口——★终零波批销核面：960 Chester（chesterStepAnim 1:1,
  //    2026-08-26）、208 鹦鹉（parrotStep+[0.1/cap4] 重力档 + 追赶降落禁用档
  //    P.cs:61487——旧"0.95 水平阻尼"系误读销核）、825 小红熊猫（pandaStep 表情
  //    轮盘三段式+speed 分档行走窗 [13..19]+飞行窗 [21..25]）、958 独眼巨鹿宠
  //    （deerclopsStep 待机眨眼轮 laiG>200+行走窗 [5..12]+飞行窗 [13..16] 与
  //    rot clamp±0.4）、1027 掘地蜂群（cavelingStep 升降分帧 2/4+|v|/2 分档窗
  //    [0..3]+腾空 rot）均转正（见各 step 方法体内行号）。登记残留=①1027 追赶
  //    飞行的特化「渐隐平移至玩家脚下」链（P.cs:61346-61368,非通用追击族,现走
  //    cavelingStep 通用定格近似）;②Pal 族(1093/1094/1098)专属 Joy 音效
  //    （1.4.5 Palworld 联动素材缺,维持下条登记）;
  //  ④ AI_026 抚摸(petting)：已接通（beingPetted 2026-08-20——flag9 闲逛/浮游停摆 +
  //     面向玩家，全链在 Player.petAnimal/updatePettingAnimal + Game 右键链）。
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
