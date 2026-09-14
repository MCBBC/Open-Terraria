// 滚石弹（原版 Projectile 99 aiStyle=25 RollingBall 家族）：Check2x2 摧毁巨石
// 贴图时生成（WorldGen.cs:49171-49235 各 sheet 一张 NewProjectile 表，表值经
// BoulderMech.BOULDER_CONVERT_TABLE 查询）。
// AI 常量（Projectile.cs aiStyle==25 主链 26358-26734 的非 1055/1021 通用支）：
//   重力 +0.3/t、vy 帽 16；vy<=6 时横向加速 ±0.05 至 |vx|>=7（无地面摩擦——
//   原版滚动不停站）；rotation += vx*0.06；宽高 31、penetrate=-1、
//   friendly+hostile 双面命中、每目标免疫 10t（usesLocalNPCImmunity +
//   localNPCHitCooldown，Projectile.cs:10755-10762）。贴墙 X 碰撞无独立碎裂规则
//   （TileCollision 清 vx 后仍被 accel 推进；getgood 才 BoulderExplosion）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { moveAndCollide } from '../physics/TileCollision';
import { BOULDER_CONVERT_TABLE } from '../world/BoulderMech';
import { projSprite } from './Arrow';
import { beeWallPushDir } from './WeaponProj';   // SW-AF1 2026-09-04（F-3）：1047 滚石踢墙门单源化（与 655/99 同摄取器）
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE_DEFS } from '../data/tiles';
import { shimmerBlockFx, rainbowBoulderFx, rainbowRodHitFx, orchestraHslCss, hexToRgbArr }
  from '../fx/orchestraFx';
import { ParticleOrchestraType } from '../net/syncModules';

const KB_X = 10;               // 出生 kb 第二参 = 10f

// ===========================================================================
// ★SW-BJ67（2026-09-14）彩虹巨石 1047 行为面五债 D1/D2/D5（D4=CutTiles 豁免在
//   ProjCutTiles/Entity/types/Game 四件,D3=宠 1090 在 PetFollower）。
//   锚 1457=1458 同域逐字（2026-09-14 对拍 diff 零差,1458 全域行号 +1）。
// ===========================================================================

/** Utils.Remap 前向档（GetLerpValue clamped + Lerp,Utils.cs:761-780/:496-502——
 *  本域唯二调用 :20342 Remap(len,0,200,4,32) 恒 from<to;反向 GetLerpValue(10,0,i)
 *  在 D2 爆段直写 1−i/10） */
function remap1457(v: number, fMin: number, fMax: number, tMin: number, tMax: number): number {
  const t = (v - fMin) / (fMax - fMin);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return tMin + (tMax - tMin) * c;
}

/** AABB 相交（Rectangle.Intersects,XNA 闭开语义 = 原版逐轴 `l < r && r > l`） */
function rectsIntersect(ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Utils.CenteredRectangle（Utils.cs:1560-1563：position=(center−size/2).ToPoint()
 *  截断、size.ToPoint()） */
function centeredRect(cx: number, cy: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  return { x: Math.trunc(cx - w / 2), y: Math.trunc(cy - h / 2), w: Math.trunc(w), h: Math.trunc(h) };
}

/** Collision.SolidCollision（Collision.cs:2713-2745 直译）——D5 动态门消费。
 *  扫盒 = (int)(pos/16)−1 .. (int)((pos+size)/16)+2（【开】区间,整型截断）,
 *  钳世界（Y 上缘 maxTilesY−40）；格门 = !inActive() && active() && tileSolid &&
 *  !tileSolidTop,halfBrick 半格（y+8,高 8）；命中判据 = 查询盒 × 调整后格盒逐轴。 */
function solidCollision1457(
  st: { w: number; h: number; idx(x: number, y: number): number; hasTile(x: number, y: number): boolean;
    isActuated(x: number, y: number): boolean; get(x: number, y: number): number; half: Uint8Array },
  px: number, py: number, pw: number, ph: number,
): boolean {
  let x0 = Math.trunc(px / 16) - 1;
  let x1 = Math.trunc((px + pw) / 16) + 2;
  let y0 = Math.trunc(py / 16) - 1;
  let y1 = Math.trunc((py + ph) / 16) + 2;
  x0 = Math.min(Math.max(x0, 0), st.w - 1);
  x1 = Math.min(Math.max(x1, 0), st.w - 1);
  y0 = Math.min(Math.max(y0, 0), st.h - 40);
  y1 = Math.min(Math.max(y1, 0), st.h - 40);
  for (let i = x0; i < x1; i++) {
    for (let j = y0; j < y1; j++) {
      if (!st.hasTile(i, j) || st.isActuated(i, j)) continue;
      const def = TILE_DEFS[st.get(i, j)];
      if (!def || !def.solid || def.platform) continue;
      let vy = j * 16;
      let vh = 16;
      if (st.half[st.idx(i, j)] !== 0) { vy += 8; vh -= 8; }
      if (px + pw > i * 16 && px < i * 16 + 16 && py + ph > vy && py < vy + vh) return true;
    }
  }
  return false;
}

/** Utils.SolveQuadratic（Utils.cs:737-752）——浮点 IEEE 直译（a=0 时 JS 同出 ±Inf/NaN） */
function solveQuadratic1457(a: number, b: number, c: number): [number, number] | null {
  const num = b * b - 4 * a * c;
  if (num > 0) {
    const sq = Math.sqrt(num);
    return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)];
  }
  if (num < 0) return null;
  const r = (-b + Math.sqrt(num)) / (2 * a);
  return [r, r];
}

/** Utils.GetChaseResults（Utils.cs:651-690 直译）——拦截求解器 */
interface ChaseResults1457 { happens: boolean; time: number; cvx: number; cvy: number }
function getChaseResults1457(cx: number, cy: number, speed: number,
  rX: number, rY: number, rvX: number, rvY: number): ChaseResults1457 {
  if (cx === rX && cy === rY) return { happens: true, time: 0, cvx: 0, cvy: 0 };
  if (speed <= 0) return { happens: false, time: 0, cvx: 0, cvy: 0 };
  const dx = cx - rX, dy = cy - rY;
  const num = Math.hypot(dx, dy);
  const num2 = Math.hypot(rvX, rvY);
  let time: number;
  let ipX: number, ipY: number;
  if (num2 === 0) {
    time = num / speed;
    ipX = rX; ipY = rY;
  } else {
    const a = speed * speed - num2 * num2;
    const b = 2 * (dx * rvX + dy * rvY);
    const c = -num * num;
    const roots = solveQuadratic1457(a, b, c);
    if (!roots) return { happens: false, time: 0, cvx: 0, cvy: 0 };
    if (roots[0] < 0 && roots[1] < 0) return { happens: false, time: 0, cvx: 0, cvy: 0 };
    time = (roots[0] > 0 && roots[1] > 0) ? Math.min(roots[0], roots[1]) : Math.max(roots[0], roots[1]);
    ipX = rX + rvX * time;
    ipY = rY + rvY * time;
  }
  return { happens: true, time, cvx: (ipX - cx) / time, cvy: (ipY - cy) / time };
}

/** Utils.FactorAcceleration（Utils.cs:714-719）——descendOfProjectile=(0,0.6f) 内联
 *  （JumpToPosition :20355/:20364 唯二调用）。★登记偏差：t<=0 时原式 0/0=NaN
 *  （velocity 中毒——vanilla 语义,同位 ChaseResults 同位特支 time=0 可达）,本仓
 *  物理面不容 NaN,守卫为原值不动（数值面其余逐字）。 */
function factorAcceleration1457(cvx: number, cvy: number, t: number, framesOfLenience: number): [number, number] {
  if (!(t > 0)) return [cvx, cvy];
  const num = Math.max(0, t - framesOfLenience);
  const fy = 0.6 * (num * num) / 2 / t;
  return [cvx - 0 * fy, cvy - fy];
}

/** TileID.Sets.Ore（TileID.cs:403 Factory.CreateBoolSet 全 19 元素直抄） */
const RB_ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);

/** TileID.Sets.FriendlyFairyCanLureTo（TileID.cs:413 全 17 元素直抄） */
const RB_FAIRY_LURE_SHEETS = new Set([8, 169, 21, 467, 107, 108, 111, 221, 222, 223, 211, 12, 665, 639, 236, 702, 227]);

/** Main.tileOreFinderPriority（Main.cs:6355-6391）∩ FriendlyFairyCanLureTo——
 *  扫描候选集先被 :20394 帧门收窄到上表 17 sheet,本表覆盖即全量；逐值与
 *  SceneMetrics.ORE_FINDER_PRIORITY 同源核对一致（2026-09-14）。表外 sheet
 *  原版取默认 0（非 −1,候选仍有效——勿仿 Enemy.fairyTreasureCoords 的 <0 跳过式）。 */
const RB_LURE_PRIORITY: Record<number, number> = {
  8: 260, 169: 270, 21: 500, 467: 500, 107: 600, 221: 610, 108: 620, 222: 630,
  111: 640, 223: 650, 211: 700, 12: 550, 665: 550, 639: 550, 236: 810, 702: 810, 227: 750,
};

/** SceneMetrics.IsValidForOreFinder（SceneMetrics.cs:904-919 直译） */
function rbOreFinderValid(sheet: number, frameX: number): boolean {
  if (sheet === 227) return frameX >= 272 && frameX <= 374;
  if (sheet === 129) return frameX >= 324;
  return true;
}

/** PerformSmartBounce 敌怪扫描行（NPC.CanBeChasedBy NPC.cs:78671-78679 直译门:
 *  active && chaseable && lifeMax>5 && !dontTakeDamage && !friendly && !immortal;
 *  ★chaseable 位本仓 Enemy 无承载=恒真近似——该位原版仅个别 AI 段写否,登记）。 */
interface RBChaseCandidate {
  dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
  maxHp?: number; x: number; y: number; w: number; h: number;
  vx?: number; vy?: number; cx: number; cy: number;
}

/** Main.hslToRgb(h,s,l)（Main.cs:48689-48717 + hue2rgb :48737-48757 直译,浮点 0..1 出）。
 *  ★SW-BJ64b：仅 1047 彩虹光消费（s=1,l=0.6 → 每通道 0.2..1.0 浮点,addLight 端 >1 合法,
 *  原版 Lighting.AddLight 即收 >1 值,出口钳 255=LightingEngine present 截断同向）。 */
function hslToRgb1457(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number): number => {
    if (c < 0) c += 1;
    if (c > 1) c -= 1;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  if (s === 0) return [l, l, l];
  const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t1 = 2 * l - t2;
  return [hue2rgb(h + 1 / 3, t1, t2), hue2rgb(h, t1, t2), hue2rgb(h - 1 / 3, t1, t2)];
}

/** ★SW-BJ64b 切片金标（Main.cs:33209 `Frame(5,20, proj.frame/20, proj.frame%20)`——
 *  Utils.cs:1389 Frame 直译：cell = (W/5×frameX, H/20×frameY, W/5, H/20)。1458 :33215
 *  同值）。Projectile_1047.png 95×380 → 19×19 壳 ×(5 列色相带 × 20 行微光相)。
 *  导出=金标测试消费（tests/sw-bj64b-frames.test.ts），draw() 同源调用=测的就是跑的。 */
export function rainbowBoulderCell(
  frame: number, texW = 95, texH = 380,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = texW / 5, sh = texH / 20;
  const f = ((frame % 100) + 100) % 100;
  return { sx: sw * Math.floor(f / 20), sy: sh * (f % 20), sw, sh };
}

/** ★SW-BJ64b 拖尾光金标（P.cs:26420-26435;1458 :26421 同值）：hue =
 *  ((GlobalTimeWrappedHourly×120)%300)/300 → hsl(hue,1,0.6) 基色 ×1.4（vector23）×
 *  (1−i/10)（num208=Utils.Remap(i/len,0,1,1,0) 线性 × num207²≡1）。gtw=运行秒%3600。
 *  导出=金标测试+fixedUpdate/draw 同源。 */
export function rainbowBoulderLight(
  gtw: number, i: number, trailLen = 10,
): [number, number, number] {
  const [r, g, b] = hslToRgb1457(((gtw * 120) % 300) / 300, 1, 0.6);
  const f = 1.4 * (1 - i / trailLen);
  return [r * f, g * f, b * f];
}

export class RollingBoulder extends Entity {
  w = 31; h = 31;
  /** 原版弹 id（Atlas: vanilla/Projectile_{id}.png） */
  readonly projId: number;
  /** timeLeft 基线（vanilla-projectiles.json 无覆盖 → 引擎通用 life 兜底同位） */
  life = 3600;
  /** 出生表伤害 */
  readonly dmg: number;
  rotation = 0;
  /** 每目标命中免疫：目标 id → 剩余 tick（localNPCHitCooldown=10 镜像） */
  private immunities = new Map<number, number>();

  // ---- ★通用湿段（Projectile.cs:16903-17113 全体弹共用段,2026-09-04 溅花缺口批
  //  → projWetSection 共享体接入;豁免核对（SetDefaults 逐 id,ignoreWater=缺行）：
  //  · :1835-1852 共块 {99,727,1013,1014,1053,1054,1055,1057} 无 ignoreWater 行 → 受段
  //  · 1048 :9930-9939 无行 → 受段;1047 :9920-9929 `ignoreWater=true`@:9928 → 豁免
  //    （共享体整段门早退,四旗恒 false,溅花/阻尼零触发——与原版 :16903 同向）
  //  · 1002（sheet 654 大石柱仙人掌球）:9525-9539 无行 → 受段（注：原版 1002 是
  //    aiStyle 16 弹,本类按既有模型同跑 AI_025——湿段仍按真 id 1002 传参接线）----
  //  位序口径：AI_025（踢门/滚转/滚地加速/重力/:26748 AnyWet 消费）→ 湿段(:16903)
  //  → moveAndCollide（HandleMovement :17721-17764 湿阻尼读【本拍刷新后】旗,乘进
  //  dx/dy 入参、采纳处原样回读）。99 系 aiStyle 25 不在 UpdatePosition 跳过表
  //  （:20551）→ 阻尼适用。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐 update −1） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调用执行） */
  presetDone = false;

  // ---- ★SW-BJ64b（2026-09-13）1047 彩虹壳帧账/拖尾（P.cs:26411-26471 / Main.cs:33205-33210;
  //  1458 :26412/:33211 同域逐字=1457,零变更）----
  /** 弹帧 0..99：Projectile_1047.png 95×380 = 5 列×20 行 19×19 壳表（列=frame/20 色相带、
   *  行=frame%20 微光相,100 帧环 200t）;AI 每 2t 前进（P.cs:26414-26418）。 */
  frame = 0;
  private frameCounter = 0;
  // ---- ★SW-BJ67（2026-09-14）行为面债 D1/D2/D5 域 ----
  /** D5：ai[1] 弹跳宽限计数（JumpToPosition P.cs:20368 置值；AI :26438-26441 消费——
   *  >0 期间 tileCollide=false 穿墙 + flag9 跳过静止自启,逐拍 −1） */
  ai1 = 0;
  /** D1：localAI[1] 高速弹跳计数（CheckBounce :20192 ++；★1457/1458 同域核对——
   *  1047 域内只写不读,与 1013（>20 Kill）/1021（>3 Kill）不同域,1:1 照抄） */
  localAI1 = 0;
  /** D5：Projectile.tileCollide 镜像（physics/TileCollision.Body 同名可选位——
   *  AI_025 :26437 每 tick 动态写,moveAndCollide 读 false 时整段跳过碰撞直写位移） */
  tileCollide?: boolean;
  /** TrailingMode[1047]=0（ProjectileID.cs:385 表尾）旧位环 10 段——P.cs:17199-17203
   *  每拍【位移后】shift+头插 [0]=position;trailN = 非 Zero 段数（消费端与原版
   *  Vector2.Zero 哨兵截断同义）。 */
  private readonly trailX = new Array<number>(10).fill(0);
  private readonly trailY = new Array<number>(10).fill(0);
  private trailN = 0;

  constructor(x: number, y: number, sheet: number) {
    super();
    this.x = x; this.y = y;
    const row = BOULDER_CONVERT_TABLE[sheet];
    this.projId = row?.proj ?? 99;
    this.dmg = row?.dmg ?? 70;
  }

  /** ai[0]：首 tick 后恒 1（cs:26682）；静止自启支的前置门 */
  private ai0 = false;

  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    for (const [id, t] of [...this.immunities]) {
      if (t <= 1) this.immunities.delete(id); else this.immunities.set(id, t - 1);
    }
    // ---- ★SW-BJ67 D5 伴生位（AI_025 :26373 `bool flag9 = false` 的等价前算）：
    //  flag9 仅在 :26440（ai[1]>0 宽限支）被置 !tileCollide（宽限期 tileCollide 恒
    //  false → flag9=true）,唯一消费点 = 下行静止自启门 :26595 `!flag9`。本域 ai[1]
    //  只在弹跳宽限支内递减,本拍前置点读 ai[1] 与 :26437 门读值同拍（递减在后），
    //  故 flag9 ≡ (ai1 > 0)。 ----
    const flag9 = this.ai1 > 0;
    // ---- 静止自启（cs:26684-26711 verbatim 门：ai[0]!=0 && vy<=0 && vx==0）——
    // 落入柱龛停稳后朝开阔侧踢 ±0.5，三级探柱(0/16/32px 外扩)都堵则按 cx 奇偶定边
    // SW-AF1 2026-09-04（F-3 收敛）：踢墙摄取器单源化 → WeaponProj.beeWallPushDir
    //  （655 蜂巢支/99 巨石支同一摄取器：三级递宽 ±8/24/40px 扫窗、左实优先、
    //  Center.X 奇偶兜底、SolidTile 全语义摄取 = active && tileSolid && !tileSolidTop
    //  && !halfBrick && slope==0（W.cs:70642-70655））。原第二实现 solidAt 用
    //  st.isSolid()（缺 halfBrick/slope/platform 排除→斜坡/半砖/平台格误判实心墙起踢）
    //  且 Math.floor 负商分叉,一并随 trunc(C# (int)) 修正。行为变更=1:1 目标。
    //  ★OOB 语义（SW-AL1 2026-09-05 定谳,纠正旧备案"越界=null→true"）：
    //  vanilla Main.tile 是裸 Tile[,]（Main.cs:1690）,OOB 下标抛异常被 SolidTile
    //  catch 吞掉【返 false】——beeWallPushDir OOB=false ≡ 原版,非差项
    //  （详证见 WeaponProj.ts beeWallPushDir 注）。※欠账备案：原版弹幕触世界界
    //  active=false 消散（P.cs:16789-16802）,本实体未接出界杀（655/949 已接）。
    //  ★SW-BJ67 D5：补 :26595 `!flag9` 门——弹跳宽限期（smart bounce 后穿墙段）
    //  不起踢（原版 flag9 消费位）。
    if (this.ai0 && this.vy <= 0 && this.vx === 0 && !flag9) {
      this.vx = beeWallPushDir(game.world.store, this.x, this.y, this.w, this.cx);
    }
    this.ai0 = true;
    // ---- ★SW-BJ64b 1047 专支（P.cs:26411-26471;1458 :26412 逐字同）----
    //  ① 帧动画（:26414-26418）：frameCounter 每 2t 一帧、frame 环 0..99。
    //  ② 彩虹拖尾光（:26420-26435）：基色 = hsl(((GlobalTimeWrappedHourly×120)%300)/300,
    //    1, 0.6)×1.4（vector22/23）;沿 oldPos 逐点 ×(1−i/10)（num208 Remap 线性,
    //    num207≡1 平方不变）,经 DelegateMethods.CastLightOpen（DelegateMethods.cs:729-742）
    //    ——【实心体格不吃光】门:active() && !inActive() && !tileSolidTop && tileSolid
    //    → 跳过（本仓映射:hasTile=原版 active() 裸位 / isActuated=inActive /
    //    TILE_DEFS.solid=tileSolid / .platform=tileSolidTop）。
    //    GlobalTimeWrappedHourly = 运行秒 %3600（Main.cs:16777;FlickerClock 同源公式）。
    //  ③ 微光星屑（:26466-26471）：ShimmerBlock clientOnly 每拍一粒,位 = Center+
    //    圆缘随机(w/2,h/2)、move = velocity×0.05（本地直驱 shimmerBlockFx,
    //    PetFollower 1090 判例同款;原版无 UniqueInfoPiece → 0）。
    if (this.projId === 1047) {
      if (++this.frameCounter >= 2) {
        this.frameCounter = 0;
        if (++this.frame >= 100) this.frame = 0;
      }
      const gtw = typeof performance !== 'undefined' ? (performance.now() / 1000) % 3600 : 0;
      const st = game.world.store;
      for (let i = 0; i < this.trailN; i++) {
        const tx = Math.floor((this.trailX[i] + this.w / 2) / 16);
        const ty = Math.floor((this.trailY[i] + this.h / 2) / 16);
        if (st.inBounds(tx, ty) && st.hasTile(tx, ty) && !st.isActuated(tx, ty)) {
          const d = TILE_DEFS[st.get(tx, ty)];
          if (d && d.solid && !d.platform) continue;
        }
        const [lr, lg, lb] = rainbowBoulderLight(gtw, i);
        game.addLightAt?.(this.trailX[i] + this.w / 2, this.trailY[i] + this.h / 2, lr, lg, lb);
      }
      // ---- ★SW-BJ67 D5：tileCollide 动态门（P.cs:26437-26456 逐字;1458 :26438 同）----
      //  `tileCollide = ai[1]==0 && !SolidCollision(position,w,h)`——嵌墙穿透态：
      //  仅当不在弹跳宽限期【且】当前未嵌入实心体时才吃 tile 碰撞（嵌入格内自由
      //  穿越 = 原版防卡死通道）;ai[1]>0 宽限期恒 false（smart bounce 跃迁后穿墙）
      //  且置 flag9/逐拍递减;ai[1]<=0 时 1/4 拍越出玩家视区（playArea 1920×1200
      //  Main.cs:758）即 smart bounce 拉回 + 1/180 拍无条件 smart bounce。
      this.tileCollide = this.ai1 === 0 && !solidCollision1457(st, this.x, this.y, this.w, this.h);
      if (this.ai1 > 0) {
        // flag9 已在 fixedUpdate 头部按本拍 ai[1] 前值等价前算（:26440 语义同）
        this.ai1--;                                        // :26441（:26442-26443 空支）
      } else {
        if (Math.floor(Math.random() * 4) === 0) {         // :26444 Main.rand.Next(4)==0
          const pa = this.rbGetAreas(game).playArea;       // :26447 GetAreas
          if (!rectsIntersect(this.x, this.y, this.w, this.h, pa.x, pa.y, pa.w, pa.h)) {
            this.rbPerformSmartBounce(game);               // :26449-26451
          }
        }
        if (Math.floor(Math.random() * 180) === 0) {       // :26453 Next(180)==0（owner==myPlayer 恒真）
          this.rbPerformSmartBounce(game);                 // :26454-26456
        }
      }
      const ang = Math.random() * Math.PI * 2;
      shimmerBlockFx(game,
        this.cx + Math.cos(ang) * this.w / 2, this.cy + Math.sin(ang) * this.h / 2,
        this.vx * 0.05, this.vy * 0.05);
    }
    // ---- AI_025 运动核 ----
    if (this.vy <= 6) {
      if (this.vx > 0 && this.vx < 7) this.vx += 0.05;
      if (this.vx < 0 && this.vx > -7) this.vx -= 0.05;
    }
    this.vy = Math.min(this.vy + 0.3, 16);
    // ---- AI_025 AnyWet 消费（:26748-26762,原版 AI 段尾——读【上拍】湿旗字段）----
    //  `if (AnyWet && netMode != 1)`: 1053 → Kill(任一液) / wet∧655 → Kill(蜂巢,
    //  WeaponProj GrenadeProj 域已接) / lavaWet∧(727|1054) → Kill。99/1013/1014/
    //  1047/1048/1055/1057 无湿杀面;1002 原版 aiStyle 16 无此块 → 显式排除。
    //  1047 豁免湿段 → 四旗恒 false → 恒不触发（与原版同向）。
    if (this.projId !== 1002
      && (this.wet || this.lavaWet || this.honeyWet || this.shimmerWet)) {
      if (this.projId === 1053) this.dead = true;                     // :26750-26752
      else if (this.lavaWet && (this.projId === 727 || this.projId === 1054)) {
        this.dead = true;                                             // :26758-26760
      }
    }
    if (this.dead) return;
    // ---- ★通用湿段（:16903-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // ---- 碰撞响应（Projectile.cs:19055-19101 巨石族分支 verbatim）----
    const lastVX = this.vx, lastVY = this.vy;
    // 碰撞位移（Body 旗由 lib 维护：onGround/collideY/hitWall）
    // ★水中位移阻尼（HandleMovement :17721-17764,湿段批）——速度【场】不减只削
    // 位移：阻尼乘进 dx/dy 入参,b.vx/vy=碰撞调整字段采纳处原样回读（勿除回,
    // 原版碰撞响应式读的也是未阻尼 velocity 场,lastVelocity 档不掺阻尼）
    const df = projWaterDragFactor(this);
    // SW-AQ1 2026-09-05：oldPosition 上报（Update :17118 AI 后/位移前置位）——
    //  99 ∈ OBJTYPE3 白名单（:17195）,objType 3 扫描新旧位判定
    //  （Collision.cs:3346-3353/:3356）消费;滚石撞墙碎裂拍 dead=true,
    //  旧位=本拍位移前真实值,碎裂拍扫描按原版 :19966 后位序照跑
    this.oldX = this.x; this.oldY = this.y;
    moveAndCollide(this, game.world, this.vx * df, this.vy * df);
    // ★SW-BJ64b：旧位环捕获（P.cs:17199-17203——TrailingMode=0 每拍无条件 shift+头插,
    //  [0] = HandleMovement 后 position（即本拍碰撞调整位）;置于碰撞响应分支前,
    //  撞墙碎裂拍旧位也照原版落账 = Kill 拖尾尘消费位）
    if (this.projId === 1047) {
      for (let i = 9; i > 0; i--) {
        this.trailX[i] = this.trailX[i - 1];
        this.trailY[i] = this.trailY[i - 1];
      }
      this.trailX[0] = this.x;
      this.trailY[0] = this.y;
      if (this.trailN < 10) this.trailN++;
    }
    this.rotation += this.vx * 0.06;
    // ---- ★SW-BJ67 D1（2026-09-14）：1047 专支 = RainbowBoulder_CheckBounce
    //  （P.cs:19192-19194 `else if (type == 1047) RainbowBoulder_CheckBounce(ref
    //  lastVelocity)`;1458 :19193 同）——巨石族 ①高速落地/②撞墙碎裂两支对 1047
    //  【都不适用】：弹墙按速度分段弹回（|v|≥1 → 0.95 近弹性）且不碎,弹后转
    //  PerformSmartBounce 重新寻的。原仓把 1047 落进 ②Kill 支 = 行为债 D1 本体。
    if (this.projId === 1047) {
      this.rbCheckBounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else {
      // ① 高速落地（lastVy>5）：弹回 20% + 落地尘/声（SoundID 0 = dig 系）
      if (this.vy !== lastVY && lastVY > 5) {
        this.vy = -lastVY * 0.2;
        game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });
        game.playSfx?.('dig', 0.8);
        if (this.projId === 1057) { this.dead = true; return; }   // 1057 落地即碎
      }
      // ② 横向撞墙：**Kill()（碎裂）**——不是反弹！ping-pong 根因即漏了这条
      // （cs:19097-19100 else 支；1055 荧光石球例外不碎走追踪切换）
      if (this.vx !== lastVX) {
        if (this.projId !== 1055) {
          game.spawnParticles?.(this.cx, this.cy, '#9A9A9A', 10, 1.6, { life: 18 });
          this.dead = true;
          return;
        }
      }
    }

    // ---- 生命周期 ----
    this.life--;
    if (this.life <= 0) { this.rbKill(game); return; }   // ★SW-BJ67 D2：唯一死亡门

    // ---- 双面接触伤害（friendly+hostile → NPC 与玩家都结算）----
    for (const raw of game.enemies() as Array<Record<string, unknown>>) {
      const e = raw as unknown as {
        id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
        x: number; y: number; w: number; h: number; cx: number; cy: number;
        hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
      };
      if (!e || e.dead || e.friendly || e.immortal || e.dontTakeDamage) continue;
      if ((this.immunities.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      this.immunities.set(e.id, 10);
      const dir = e.cx >= this.cx ? 1 : -1;
      e.hurt?.(this.dmg, dir * KB_X, 0, game);
    }
    const p = game.player as { dead: boolean; iframes: number; x: number; y: number; w: number; h: number };
    if (!p.dead && p.iframes <= 0 && !(this.immunities.get(-1) ?? 0)) {
      if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
        this.immunities.set(-1, 10);
        // ★SW-BI1 2026-09-06（用户崩溃报告定谳）：不传 this 作 attacker——attacker 槽是
        //  Enemy 受击反击面（荆棘/仙人掌套/日曜爆闪 → attacker.hurt(...)），弹体无 hurt
        //  方法，把滚石自身送进反击槽 → `k.hurt is not a function` → 帧循环守卫停机
        //  （沙漠滚仙人掌球实报，2026-09-06 报告 SW-BI1）。与全弹族调用约定对齐
        //  （FallingBlock:275/MeteorChunk:126/Dart 系/bossAI_* 均不传 attacker）：
        //  原版弹侧命中无 NPC 可反（PlayerDeathReason.ByProjectile），本无攻击者槽语义。
        game.damagePlayer(this.dmg, this.cx, this.cy);
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (this.projId === 1047) {
      // ★SW-BJ64b 1047 彩虹壳三叠画。原版序：拖尾块（Main.cs:33351-33385）先画=垫底，
      //  本体（:33571）后画=压顶。帧账 = Frame(5,20, frame/20, frame%20)（:33209）——
      //  源矩形 19×19、origin=帧心（:33210）、scale=vector82×2（:33208,SetDefaults
      //  scale=1）、color87 = GetAlpha 全亮白（:80967 `type==488||1047 → (255,255,255,255)`,
      //  即本体不受环境光暗化=黑暗里也发光）、num340 = rotation（:33167/:33229 尾
      //  `type!=1055 → rotation += vx*0.06`）。
      //  ★反伪影自证：实拍逐点直读 drawImage 源矩形对拍本式（scripts/_bj64b.mjs）。
      const cw = img.width / 5, ch = img.height / 20;
      const cell = rainbowBoulderCell(this.frame, img.width, img.height);
      // ① 250 微光拖尾（:33351-33367,Projectile_250 14×32,origin=(w/2,0),沿段拉伸）：
      //    num350=0.5/num351=1 → scaleX=2.2×0.5=1.1、scaleY=段长/32、rot=段向−π/2、
      //    alpha=(127/255)×(1−i/10)²（white4.A=127 × (1−num355)²,i=旧位序 0..9）
      const streak = projSprite(250);
      if (streak && streak.width > 0) {
        for (let i = 9; i > 0; i--) {
          if (i >= this.trailN) continue;                     // 原版 Zero 哨兵截断
          const x1 = this.trailX[i] + this.w / 2, y1 = this.trailY[i] + this.h / 2;
          const x0 = this.trailX[i - 1] + this.w / 2, y0 = this.trailY[i - 1] + this.h / 2;
          const seg = Math.hypot(x0 - x1, y0 - y1);
          if (seg < 0.01) continue;
          ctx.save();
          ctx.translate(x1, y1);
          ctx.rotate(Math.atan2(y0 - y1, x0 - x1) - Math.PI / 2);
          ctx.globalAlpha = (127 / 255) * (1 - i / 10) * (1 - i / 10);
          ctx.drawImage(streak, -streak.width * 1.1 / 2, 0, streak.width * 1.1, Math.max(1, seg));
          ctx.restore();
        }
      }
      // ② Extra_55 星屑（:33368-33385）：68×384 竖 4 帧（68×96/帧）,origin=(w/2,h/8+14),
      //    rot=velocity.ToRotation()−π/2、scale=Lerp(0.1,0.8,(10−i)/10)×0.5、
      //    白×(1−i/3) 且 A=0 = 纯加法惯用法（memory:XNA α=0 → canvas 'lighter'）
      const spark = r.atlas?.ensureVImage('vanilla/Extra_55.png');
      if (spark) {
        const sh = spark.height / 4;
        const ox = spark.width / 2, oy = spark.height / 8 + 14;
        const rot = Math.atan2(this.vy, this.vx) - Math.PI / 2;
        const f4 = this.frame % 4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 3; i >= 0; i--) {
          if (i >= this.trailN) continue;
          let fi = (f4 - i) % 4;
          if (fi < 0) fi += 4;                                // num358（:33379-33382）
          const a = 1 - i / 3;                                // white5 × (1−i/3)×num351
          if (a <= 0) continue;
          const sc = (0.1 + 0.7 * (10 - i) / 10) * 0.5;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(this.trailX[i] + this.w / 2, this.trailY[i] + this.h / 2);
          ctx.rotate(rot);
          ctx.drawImage(spark, 0, fi * sh, spark.width, sh,
            -ox * sc, -oy * sc, spark.width * sc, sh * sc);
          ctx.restore();
        }
        ctx.restore();
      }
      // ③ 本体单帧切片（:33571 缺省支 sourceRectangle2 非 null）——源矩形走
      //  rainbowBoulderCell 金标同源,绘制尺寸 = 帧心 origin × scale2 → 38×38
      ctx.globalAlpha = 1;
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh,
        -cw, -ch, cw * 2, ch * 2);
    } else {
      // 余族（99/727/1013/1048/1053/1054/1055/1057/1002）整图单帧：DrawProjDirect
      //  sourceRectangle2=null 缺省支（Main.cs:33169/:33571）——1055 竖条 10 帧走
      //  Main.cs:30618 家族块专支、1014 整图即原版本相（DrawProjDirect 全域无 1014
      //  切片支,projFrames[1014]=11 仅供 AI 消费）——1:1 维持勿"顺手修"。
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ===========================================================================
  // ★SW-BJ67（2026-09-14）D1 smart bounce 链 + D2 Kill 彩虹爆
  // ===========================================================================

  /** D1 弹跳响应（RainbowBoulder_CheckBounce P.cs:20165-20222 直译;HandleMovement
   *  碰撞响应位 :19192 调用,ref lastVelocity = 本拍 moveAndCollide 前速度快照）。
   *  弹回系数按 |lastV| 分段（<0.5→0.1 / <0.75→0.25 / <1→0.5 / 其余 0.95）;
   *  flag = 高速（|lastV|>5,双轴任一）→ localAI[1]++ + Collision.HitTiles（仓内
   *  近似=同族 ① 支灰尘,见该支注）+ SoundID.RainbowBoulder;flag2 = 双轴任一被
   *  碰撞改写 → PerformSmartBounce。 */
  private rbCheckBounce(lastVX: number, lastVY: number, game: GameHooks): void {
    const num = Math.abs(lastVX);
    const num2 = Math.abs(lastVY);
    let num3 = 0.95;
    let num4 = 0.95;
    if (num < 0.5) num3 = 0.1;
    else if (num < 0.75) num3 = 0.25;
    else if (num < 1) num3 = 0.5;
    if (num2 < 0.5) num4 = 0.1;
    else if (num2 < 0.75) num4 = 0.25;
    else if (num2 < 1) num4 = 0.5;
    let flag = false;
    let flag2 = false;
    if (this.vy !== lastVY) {                          // :20184-20189
      if (Math.abs(lastVY) > 5) flag = true;
      this.vy = -lastVY * num4;
      flag2 = true;
    }
    if (this.vx !== lastVX) {                          // :20190-20196
      if (Math.abs(lastVX) > 5) flag = true;
      this.vx = -lastVX * num3;
      flag2 = true;
    }
    if (flag) {                                        // :20197-20201
      this.localAI1++;
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });
      game.playSfxWav?.('rainbow_boulder', 1, this.x, this.y);
    }
    if (flag2) {                                       // :20221-20223
      this.rbPerformSmartBounce(game);
    }
  }

  /** D1 防刷门（RainbowBoulder_PreventSpam P.cs:20139-20162 直译）：6000×6000 盒
   *  （Utils.CenteredRectangle）内同 owner 同 type 活跃弹（除自身）≥7 → Kill。
   *  owner 维度单机恒同主（联机弹域本仓统一本地主,与原版 owner==主同向）。 */
  private rbPreventSpam(game: GameHooks): void {
    const box = centeredRect(this.cx, this.cy, 6000, 6000);
    let count = 0;
    const list = game.projectiles?.() ?? [];
    for (const raw of list) {
      if (count >= 7) break;                           // :20148-20150 循环头即判
      if (raw === this) continue;                      // :20152 i != whoAmI
      const p = raw as { dead?: boolean; projId?: number; x: number; y: number; w: number; h: number };
      if (!p || p.dead || p.projId !== this.projId) continue;   // active && owner && type
      if (!rectsIntersect(p.x, p.y, p.w, p.h, box.x, box.y, box.w, box.h)) continue;
      count++;
    }
    if (count >= 7) this.rbKill(game);                 // :20160-20162
  }

  /** D1 smart bounce（RainbowBoulder_PerformSmartBounce P.cs:20227-20278 直译）：
   *  防刷门 → 藏宝高亮 → GetAreas（最近玩家 playArea/closeToMe）→ 敌怪索敌
   *  （CanBeChasedBy ∧ 盒交 playArea,按距玩家最近）→ JumpToEnemy；无敌怪则
   *  playArea（tile 化）寻宝 JumpToTreasure；再无则距玩家 <3000 → JumpToPlayer。 */
  private rbPerformSmartBounce(game: GameHooks): void {
    this.rbPreventSpam(game);                          // :20229
    if (this.dead) return;                             // :20230 !active
    this.rbHighlightNearbyTreasure(game);              // :20234
    const { closest, playArea, closeToMe } = this.rbGetAreas(game);   // :20235
    let num = Infinity;
    let num2 = Infinity;
    let target: RBChaseCandidate | null = null;
    for (const raw of game.enemies() as unknown[]) {   // :20237-20257（Main.npc 全槽）
      const e = raw as RBChaseCandidate | null;
      if (!e || e.dead) continue;                      // CanBeChasedBy active
      if (!((e.maxHp ?? 0) > 5) || e.dontTakeDamage || e.friendly || e.immortal) continue;
      if (!rectsIntersect(e.x, e.y, e.w, e.h, playArea.x, playArea.y, playArea.w, playArea.h)) continue;
      const num3 = Math.hypot(closest.cx - e.cx, closest.cy - e.cy);
      if (!(num <= num3)) {                            // :20245 `!(num <= num3)`
        num = num3;
        target = e;
        if (!rectsIntersect(e.x, e.y, e.w, e.h, closeToMe.x, closeToMe.y, closeToMe.w, closeToMe.h)
          && num2 > num3) {
          num2 = num3;                                 // nPC2 仅记账（原版 :20262 跳塔取 nPC）
        }
      }
    }
    if (target) {                                      // :20259-20265
      this.rbJumpToPosition(target.cx, target.cy, target.vx ?? 0, target.vy ?? 0, game);
      return;
    }
    // :20267-20271 playArea tile 化（int 逐字段 /16）→ GetTreasureCoords
    const pa2 = {
      x: Math.trunc(playArea.x / 16), y: Math.trunc(playArea.y / 16),
      w: Math.trunc(playArea.w / 16), h: Math.trunc(playArea.h / 16),
    };
    const treasure = this.rbGetTreasureCoords(game, pa2);
    if (treasure) {
      this.rbJumpToPosition(treasure[0] * 16, treasure[1] * 16, 0, 0, game);   // JumpToTreasure :20272（ToWorldCoordinates=×16）
      return;
    }
    const dist = Math.hypot(closest.cx - this.cx, closest.cy - this.cy);
    if (dist < 3000) {
      // JumpToPlayer :20276-20278 —— ★targetVelocity = player.position 字面（非
      // velocity!vanilla 原文 :20319 `JumpToPosition(player.Center, player.position)`
      // ——position (x,y) 被当速度喂进拦截式,1:1 照抄勿"顺手修"）。
      this.rbJumpToPosition(closest.cx, closest.cy, closest.x, closest.y, game);
    }
  }

  /** D1 藏宝高亮（RainbowBoulder_HighlightNearbyTreasure P.cs:20280-20307 直译）：
   *  中心 tile ±(CenteredRectangle(tile 心,(5,5)) → Left..Right/Top..Bottom 含端)
   *  扫 FriendlyFairyCanLureTo ∧ IsValidForOreFinder 格 → RainbowBoulder1 编排
   *  （clientOnly:true 本地直驱;内环 `num<0.5` 恰 1 迭代 → MovementVector=UnitX×16）
   *  + 命中行 j++ 双步（:20302）。 */
  private rbHighlightNearbyTreasure(game: GameHooks): void {
    const st = game.world.store;
    const tx = Math.trunc(this.cx / 16);
    const ty = Math.trunc(this.cy / 16);
    const rect = centeredRect(tx, ty, 5, 5);
    for (let i = rect.x; i <= rect.x + rect.w; i++) {
      for (let j = rect.y; j <= rect.y + rect.h; j++) {
        if (i < 2 || j < 2 || i >= st.w - 2 || j >= st.h - 2) continue;   // InWorld(i,j,2)
        if (!st.hasTile(i, j)) continue;
        const t = st.get(i, j);
        const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? 0;
        if (!RB_FAIRY_LURE_SHEETS.has(sheet)) continue;
        const fx = (st as unknown as { frameX?: ArrayLike<number> }).frameX?.[st.idx(i, j)] ?? 0;
        if (!rbOreFinderValid(sheet, fx)) continue;
        const ang = Math.random() * Math.PI * 2;      // NextVector2Circular(16,16)=角均匀×线性半径（F6 口径,2 掷）
        const rr = Math.random() * 16;
        const px = i * 16 + 8 + Math.cos(ang) * rr;
        const py = j * 16 + 8 + Math.sin(ang) * rr;
        rainbowBoulderFx(game, 1, px, py, 16, 0);     // clientOnly:true → 不广播
        j++;                                          // :20302
      }
    }
  }

  /** D1 GetAreas（RainbowBoulder_GetAreas P.cs:20309-20315 直译）：FindClosest
   *  最近存活玩家（candidatePlayers 槽序镜像 Main.player 扫描;全灭回退首槽=原版
   *  返回 0 槽同构）→ playArea = CenteredRectangle(player.Center, MaxWorldViewSize
   *  (1920,1200) Main.cs:758) / closeToMe = CenteredRectangle(Center,(300,150))。 */
  private rbGetAreas(game: GameHooks): {
    closest: { x: number; y: number; cx: number; cy: number; dead: boolean };
    playArea: { x: number; y: number; w: number; h: number };
    closeToMe: { x: number; y: number; w: number; h: number };
  } {
    const players = (game.candidatePlayers?.() ?? [game.player])
      .filter((p) => p && !p.dead);
    if (players.length === 0) players.push(game.player);
    let closest = players[0]!;
    let bd = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
      if (d < bd) { bd = d; closest = p; }
    }
    return {
      closest,
      playArea: centeredRect(closest.cx, closest.cy, 1920, 1200),
      closeToMe: centeredRect(this.cx, this.cy, 300, 150),
    };
  }

  /** D1 跃迁核（RainbowBoulder_JumpToPosition P.cs:20338-20371 直译）：
   *  初速 = (target−Center).SafeNormalize((0,−1)) × Remap(len,0,200,4,32);
   *  RB4 编排（clientOnly:false → 本地直生 + module8 上行,owner==myPlayer 门单机
   *  恒真）;num4=8..32 步 2 逐档拦截解（GetChaseResults）命中 → 速度=ChaserVelocity
   *  经 FactorAcceleration((0,0.6))、num3=(int)(InterceptionTime−2);全 miss →
   *  FactorAcceleration(初速, min(120,num3));ai[1]=num3（宽限拍数）。 */
  private rbJumpToPosition(tCX: number, tCY: number, velX: number, velY: number, game: GameHooks): void {
    const dx = tCX - this.cx;
    const dy = tCY - this.cy;
    const len = Math.hypot(dx, dy);
    const num2 = remap1457(len, 0, 200, 4, 32);        // :20342
    let num3 = len / num2;                             // :20343
    let vx: number;
    let vy: number;
    if (len > 0) {
      vx = (dx / len) * num2;                          // SafeNormalize((0,-1))×num2
      vy = (dy / len) * num2;
    } else {
      vx = 0; vy = -num2;                              // 零长回退 Vector2.UnitY*-1
    }
    rainbowBoulderFx(game, 4, this.cx, this.cy, vx, vy);   // :20346-20353 clientOnly:false
    game.broadcastParticleOrchestra?.(ParticleOrchestraType.RainbowBoulder4, this.cx, this.cy, vx, vy);
    let flag = false;
    for (let num4 = 8; num4 <= 32; num4 += 2) {        // :20355-20364
      const cr = getChaseResults1457(this.cx, this.cy, num4, tCX, tCY, velX, velY);
      if (cr.happens) {
        [vx, vy] = factorAcceleration1457(cr.cvx, cr.cvy, cr.time, 0);
        num3 = Math.trunc(cr.time - 2);                // (int) 截断
        flag = true;
      }
    }
    if (!flag) {
      [vx, vy] = factorAcceleration1457(vx, vy, Math.min(120, num3), 0);   // :20366-20368
    }
    this.vx = vx;
    this.vy = vy;
    this.ai1 = num3;                                   // :20369
  }

  /** D1 寻宝（RainbowBoulder_GetTreasureCoords P.cs:20374-20420 直译）：
   *  playArea（tile 化入参）∩ 世界内缩 40（Inflate(−40)）→ 逐格扫
   *  FriendlyFairyCanLureTo ∧ IsValidForOreFinder；Ore 集格 7×7 同类 <40 → 优先级
   *  置 −1 作废;同优先取最近（`num2 <= num4` ∧ `num2!=num4 || d<num3` 序）。 */
  private rbGetTreasureCoords(game: GameHooks,
    pa: { x: number; y: number; w: number; h: number }): [number, number] | null {
    const st = game.world.store;
    // Rectangle.Intersect(playArea, Rect(0,0,maxTilesX,maxTilesY).Inflate(-40,-40))
    const x0 = Math.max(pa.x, 40);
    const y0 = Math.max(pa.y, 40);
    const xR = Math.min(pa.x + pa.w, st.w - 40);       // Right = X+Width
    const yB = Math.min(pa.y + pa.h, st.h - 40);       // Bottom = Y+Height
    let num2 = -1;
    let num3 = -1;
    let bx = -1;
    let by = -1;
    for (let i = x0; i <= xR; i++) {                   // Left..Right 含端（原版字面）
      for (let j = y0; j <= yB; j++) {
        if (!st.hasTile(i, j)) continue;
        const t = st.get(i, j);
        const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? 0;
        if (!RB_FAIRY_LURE_SHEETS.has(sheet)) continue;
        const fx = (st as unknown as { frameX?: ArrayLike<number> }).frameX?.[st.idx(i, j)] ?? 0;
        if (!rbOreFinderValid(sheet, fx)) continue;
        let num4 = RB_LURE_PRIORITY[sheet] ?? 0;       // tileOreFinderPriority 缺省 0（非 −1）
        if (RB_ORE_SHEETS.has(sheet)) {                // TileID.Sets.Ore :20399
          let num8 = 0;
          for (let k = i - 3; k <= i + 3; k++) {       // num5=num6=3（7×7）
            for (let l = j - 3; l <= j + 3; l++) {
              if (st.hasTile(k, l) && st.get(k, l) === t) num8++;
            }
          }
          if (num8 < 40) num4 = -1;                    // num7=40
        }
        if (num2 <= num4) {                            // :20412
          const num9 = Math.hypot(i * 16 + 8 - this.cx, j * 16 + 8 - this.cy);
          if (num2 !== num4 || !(num9 >= num3)) {      // :20414 同优先取近
            num2 = num4;
            num3 = num9;
            bx = i;
            by = j;
          }
        }
      }
    }
    return num2 !== -1 && bx >= 0 ? [bx, by] : null;   // :20419 return num2 != -1
  }

  /** D2 唯一死亡门（vanilla Kill() 单口——timeLeft 耗尽/PreventSpam/boss 命中
   *  全走 Kill → type==1047 爆段）。★P.cs:14336 `type==1047 &&
   *  targetNPC.TreatedAsABossForRainbowBoulders → Kill()`（命中 boss 即碎）登记
   *  未入本批（伤害面债,不在五债任务书内——后续批次锚 :14336/:14337）。 */
  private rbKill(game: GameHooks): void {
    this.dead = true;
    if (this.projId === 1047) this.rbKillRainbowExplosion(game);
  }

  /** D2 Kill 彩虹爆（P.cs:72354-72427 直译;1458 :72355 同域逐字）：沿 oldPos 环
   *  （Zero 哨兵截断）dust267 彩虹尘（数 = Next(1,4) 减尾三档、色相 = (基相+1−i/10)
   *  %1、scale/fadeIn/位 Lerp 逐式）+ CloneDust 白影（scale/2、fadeIn×0.85、白）+
   *  RainbowRodHit 编排 ×2（clientOnly:true,move=UnitX.RotatedBy(num61τ)×16）+
   *  dust66 ×14（α100 scale1.7 noGravity 速×3）+ SoundID.RainbowBoulder。 */
  private rbKillRainbowExplosion(game: GameHooks): void {
    game.playSfxWav?.('rainbow_boulder', 1, this.cx, this.cy);   // :72356 SoundID.RainbowBoulder
    let targetX = this.cx;                             // target3 = Center
    let targetY = this.cy;
    const num55 = Math.random();                       // :72357
    const half = this.w / 2;                           // vector12 = Size/2（15.5）
    for (let num56 = 0; num56 < this.trailN; num56++) {  // oldPos 环（Zero 哨兵=trailN 截断,同义）
      const vx0 = this.trailX[num56];
      const vy0 = this.trailY[num56];
      const lerpT = 1 - num56 / 10;                    // GetLerpValue(10,0,i,clamped)
      const newColor = hexToRgbArr(orchestraHslCss((num55 + lerpT) % 1, 1, 0.65));   // :72363
      let num57 = 1 + Math.floor(Math.random() * 3);   // Next(1,4)=1..3 :72364
      const num58 = 0.3 + (1 - 0.3) * lerpT;           // Lerp(0.3,1,lerpT) :72366
      if (num56 >= 10 * 0.3) num57--;                  // :72367
      if (num56 >= 10 * 0.65) num57 -= 2;              // :72370
      if (num56 >= 10 * 0.85) num57 -= 3;              // :72373
      // vector11 = vector10.DirectionTo(target3).SafeNormalize(Zero)
      const ddx = targetX - vx0;
      const ddy = targetY - vy0;
      const dl = Math.hypot(ddx, ddy);
      const dirX = dl > 0 ? ddx / dl : 0;
      const dirY = dl > 0 ? ddy / dl : 0;
      targetX = vx0;
      targetY = vy0;
      for (let num59 = 0; num59 < num57; num59++) {    // :72378-72417
        const d = game.spawnDust?.(vx0, vy0, this.w, this.h, 267, 0, 0, 0, newColor);
        if (!d) continue;                              // 池满（原版 6000 槽位变异面,仓内约定跳过）
        const k = Math.random() * 0.8;                 // :72381 velocity *= NextFloat×0.8
        d.vx *= k; d.vy *= k;
        d.noGravity = true;                            // :72382
        d.scale = 0.9 + Math.random() * 1.2;           // :72383 覆写（含 NewDust 抖动）
        d.fadeIn = Math.random() * 1.2 * num58;        // :72384
        d.vx += dirX * 6;                              // :72385 += vector11×6
        d.vy += dirY * 6;
        d.scale *= num58;                              // :72387
        d.x = (vx0 + half) + (d.x - (vx0 + half)) * lerpT;   // :72388 Lerp(旧位+Size/2, 位, lerpT)
        d.y = (vy0 + half) + (d.y - (vy0 + half)) * lerpT;
        const w = game.vanillaDust?.clone(d);          // :72390-72396 CloneDust 白影
        if (w) {
          w.scale /= 2;
          w.fadeIn *= 0.85;
          w.color = { r: 255, g: 255, b: 255, a: 255 };
        }
      }
    }
    for (let num61 = 0; num61 < 0.5; num61 += 0.25) {  // :72418-72425 恰 2 迭代
      rainbowRodHitFx(game, this.cx, this.cy, Math.cos(num61 * Math.PI * 2) * 16, Math.sin(num61 * Math.PI * 2) * 16);
    }
    for (let num62 = 0; num62 < 14; num62++) {         // :72426-72432
      // 色相掷【前】于 NewDust 内部掷（:72427 实参式,F6 掷序纪律）
      const color = hexToRgbArr(orchestraHslCss(Math.random(), 1, 0.5));
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 66, 0, 0, 100, color, 1.7);
      if (!d) continue;
      d.noGravity = true;                              // :72429
      d.vx *= 3;                                       // :72430-72431 velocity *= 3
      d.vy *= 3;
    }
  }
}
