// AI_003 战士族逐族切片（Terarria1456/Terraria.NPC.cs AI_003_Fighters :56245-60734，
// 1.4.5.6 1:1）。本文件承接 Enemy.fighterAI 的一期通用档（固定 加速 0.1 / 限速 ±1），
// 按 NPC.cs 横向移动 else-if 链（:57799-58800）逐族给出 限速/加速/超速衰减 三元组，
// 外加两个自包含的行为型分支：混沌元素 120 传送（:57431-57460 / :60679-60696 /
// AI_AttemptToFindTeleportSpot :18876-18946 / ai[3] 卡死计数 :57504-57545）与
// 沼泽怪 166 伏击（:56327-56360）。
//
// 族表覆盖的高频怪（Top5 按 出现频率×影响面 选型；aiStyle=3 全量 186 种的分布扫描
// 见 memory 与 tests/a-batch3.test.ts）：
//   1. 僵尸族 3/132/186-189/200/223/331/332/632/691（夜地表最高频，default 档 0.8-1.2）
//   2. 骷髅族 21/201/202/203/342/635 + 愤怒骷髅 31/294-296（洞穴高频，num84 档）
//   3. 骨甲三族 269-280（地牢最高频 12 型，num85 档 1.0-3.25）
//   4. 稻草人 305-314（南瓜月高频，num86 档 1.0-2.25）
//   5. 混沌元素 120（神圣地表夜高频，3 档 + 传送）+ 3 档组 166/213/258/528/529
//
// 其余未逐行移植的 AI_002/AI_003 type 分支精确清单已登记 memory（待移植，不做近似）：
// 原版在移动链上有专属分支、本文件暂走 legacy 通用档的型 = 430-436/494/495/591
// （扑咬突进 :58669-58718）。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE, GRAVITY, MAX_FALL_SPEED } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { canHit, canHitLine } from '../physics/LineOfSight';
import { getKnockbackMultiplierScaledByDifficulty } from '../stats/ScaleStats';

/** :57462-57471 flag8=false 全表（NPC.cs:57468）。flag8 的两处下游消费：
 *  ① 攻门段 :60383 `… && flag8`——表内型**不攻门**（Psycho 466/Possessed 469/
 *     Eyezor 251/Dr Man Fly 468/沼泽怪 166/美杜莎 480 等全在内）；
 *  ② 行走/跳跃链 :60534 与 :60674 `else if (flag8) { ai[1]=0; ai[2]=0; }`——表内型
 *     的 ai[1]/ai[2] 不被通用行走清零（466 潜行态、469 爬墙态、251 激光计时、
 *     468 射击态、166/480 伏击·蓄力态都活在 ai[2] 上，被清零即状态机报废）。
 *  ②在本仓天然成立（fighterAI 的行走/跳跃段不写 ai[1]/ai[2]）；①由攻门段读本表实现。 */
export const FIGHTER_NO_DOOR: ReadonlySet<number> = new Set([
  343, 47, 67, 109, 110, 111, 120, 163, 164, 239, 168, 199, 206, 214, 215, 216,
  217, 218, 219, 220, 226, 243, 251, 257, 258, 290, 291, 292, 293, 305, 306, 307,
  308, 309, 348, 349, 350, 351, 379, 430, 431, 432, 433, 434, 435, 436, 591, 380,
  381, 382, 383, 386, 391, 449, 450, 451, 452, 466, 464, 166, 469, 468, 471, 470,
  480, 481, 482, 411, 424, 409, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503,
  504, 505, 506, 425, 427, 426, 428, 580, 508, 415, 419, 520, 524, 525, 526, 527,
  528, 529, 530, 532, 582, 624, 631,
]);

/** 横向移动三元组（else-if 链各分支的共形段：超速衰减 / 限速内加速） */
export interface FighterMove {
  /** 限速 |vx| 上限（原版 num8x） */
  max: number;
  /** 限速内每 tick 加速（原版各分支的 += 值） */
  accel: number;
  /** 超速且落地时的衰减（原版 velocity *= N；原版连 Y 一起乘，落地时 Y≈0 等价） */
  damp: number;
  /** 落地且 vx 与 direction 相逆时的额外衰减（:57799/:57916 档 0.99 / :57882 档 0.8） */
  reverseDamp?: number;
}

/** 一期通用档（原固定 加速 0.1 / 限速 ±1）——仅用于原版有专属分支但该分支待移植的型 */
const LEGACY: FighterMove = { max: 1, accel: 0.1, damp: 1 };

const inRange = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

/** :58719 射击族排除表——原版这些型在移动链上无分支（本 tick 不做横向加减速） */
function rangedMoveExcluded(id: number): boolean {
  return id === 110 || id === 111 || id === 206 || id === 214 || id === 215 || id === 216
    || inRange(id, 290, 293) || id === 350 || id === 379 || id === 380 || id === 381
    || id === 382 || inRange(id, 449, 452) || id === 468 || id === 481 || id === 411
    || id === 409 || inRange(id, 498, 506) || id === 424 || id === 426 || id === 520;
}

/** 横向移动 else-if 链（NPC.cs:57799-58800）1:1。返回 null = 原版该型在链上无分支。 */
export function fighterMoveSpec(e: Enemy): FighterMove | null {
  const id = e.vanillaId ?? -1;
  const hpRatio = e.hp / e.maxHp;                  // life/lifeMax
  const scale = e.vanillaScale;                    // npc.scale（负 netID 变种）
  if (rangedMoveExcluded(id)) return null;         // :58719 排除表（链上无分支）
  if (id === 159 || id === 349) {                  // :57799-57830 吸血鬼/胡桃夹子
    return { max: 6, accel: 0.07, damp: 0.8, reverseDamp: 0.99 };
  }
  if (id === 199) {                                // :57882-57915 蜥蜴人爬行态
    return { max: 4, accel: 0.1, damp: 0.8, reverseDamp: 0.8 };
  }
  if (id === 120 || id === 166 || id === 213 || id === 258 || id === 528 || id === 529) {
    return { max: 3, accel: 0.07, damp: 0.8, reverseDamp: 0.99 };   // :57916-57949
  }
  // :57950-57975 二速族（狼人 104/装甲骷髅 77/装甲维京 197/猩红斧 163 等）
  if (id === 461 || id === 27 || id === 77 || id === 104 || id === 163 || id === 162
    || id === 196 || id === 197 || id === 212 || id === 257 || id === 326 || id === 343
    || id === 348 || id === 351 || inRange(id, 524, 527) || id === 530 || id === 236) {
    return { max: 2, accel: 0.07, damp: 0.8 };
  }
  if (id === 109) return { max: 2, accel: 0.04, damp: 0.8 };        // :57976-57998 小丑
  // :58002-58136 常规族（僵尸/骷髅/愤怒骷髅/木乃伊/甲虫/精灵等）num84 档
  if (id === 21 || id === 26 || id === 31 || id === 294 || id === 295 || id === 296
    || id === 47 || id === 73 || id === 140 || id === 164 || id === 239 || id === 167
    || id === 168 || id === 185 || id === 198 || id === 201 || id === 202 || id === 203
    || id === 217 || id === 218 || id === 219 || id === 226 || id === 181 || id === 254
    || id === 338 || id === 339 || id === 340 || id === 342 || id === 385 || id === 389
    || id === 462 || id === 463 || id === 466 || id === 464 || id === 469 || id === 470
    || id === 480 || id === 482 || id === 425 || id === 429 || id === 586 || id === 631
    || id === 635) {
    let num84 = 1.5;                               // :58005
    if (id === 294) num84 = 2;                     // :58011-58013
    else if (id === 295) num84 = 1.75;
    else if (id === 296) num84 = 1.25;
    else if (id === 201) num84 = 1.1;
    else if (id === 202) num84 = 0.9;
    else if (id === 203) num84 = 1.2;
    else if (id === 338) num84 = 1.75;
    else if (id === 339) num84 = 1.25;
    else if (id === 340) num84 = 2;
    else if (id === 385) num84 = 1.8;
    else if (id === 389) num84 = 2.25;
    else if (id === 462) num84 = 4;
    else if (id === 463) num84 = 0.75;
    else if (id === 466) num84 = 3.75;
    else if (id === 469) num84 = 3.25;
    else if (id === 480) num84 = 1.5 + (1 - hpRatio) * 2;   // 美杜莎越伤越快
    else if (id === 425) num84 = 6;
    else if (id === 429) num84 = 4;
    else if (id === 631) num84 = 0.9;
    else if (id === 586) num84 = 1.5 + (1 - hpRatio) * 3.5; // 僵尸人鱼越伤越快
    // :58007-58010 Face Monster 181 的 remixWorld 3.75 档不适用本作（无 remix 世界）
    const scaleBoost = id === 21 || id === 201 || id === 202 || id === 203
      || id === 342 || id === 635;                 // :58080-58083
    if (scaleBoost) num84 *= 1 + (1 - scale);
    return { max: num84, accel: 0.07, damp: 0.8 };
  }
  // :58137-58204 骨甲三族（锈蚀 269-272 / 蓝色 273-276 / 地狱 277-280）num85 档
  if (inRange(id, 269, 280)) {
    let num85 = 1.5;                               // :58139
    if (id === 269) num85 = 2;
    else if (id === 270) num85 = 1;
    else if (id === 271) num85 = 1.5;
    else if (id === 272) num85 = 3;
    else if (id === 273) num85 = 1.25;
    else if (id === 274) num85 = 3;
    else if (id === 275) num85 = 3.25;
    else if (id === 276) num85 = 2;
    else if (id === 277) num85 = 2.75;
    else if (id === 278) num85 = 1.8;
    else if (id === 279) num85 = 1.3;
    else if (id === 280) num85 = 2.5;
    num85 *= 1 + (1 - scale);                      // :58189
    return { max: num85, accel: 0.07, damp: 0.8 };
  }
  // :58205-58264 稻草人十型 num86 档（<310 的扑跳分支 :58231-58242 待移植，见 memory）
  if (inRange(id, 305, 314)) {
    let num86 = 1.5;                               // :58207
    if (id === 305 || id === 310) num86 = 2;
    else if (id === 306 || id === 311) num86 = 1.25;
    else if (id === 307 || id === 312) num86 = 2.25;
    else if (id === 308 || id === 313) num86 = 1.5;
    else if (id === 309 || id === 314) num86 = 1;
    return { max: num86, accel: 0.07, damp: 0.8 };
  }
  if (id === 67 || id === 220 || id === 428) {     // :58265-58287 螃蟹/海螺/外星幼虫
    return { max: 0.5, accel: 0.03, damp: 0.7 };
  }
  if (id === 78 || id === 79 || id === 80 || id === 630) {   // :58288-58317 木乃伊族
    let num87 = 1, num88 = 0.05;
    if (hpRatio < 0.5) { num87 = 2; num88 = 0.1; } // :58293-58297 半血激怒
    if (id === 79 || id === 630) num87 *= 1.5;     // :58298-58301
    return { max: num87, accel: num88, damp: 0.7 };
  }
  if (id === 287) return { max: 5, accel: 0.2, damp: 0.7 };          // :58318-58340 骨李
  if (id === 243) {                                                   // :58365-58397 冰雪巨人
    return {
      max: 1 + (1 - hpRatio) * 1.5,
      accel: 0.07 + (1 - hpRatio) * 0.15,
      damp: 0.7,
    };
  }
  if (id === 251) {                                                   // :58401-58433 独眼僵尸
    return {
      max: 1 + (1 - hpRatio) * 2,
      accel: 0.08 + (1 - hpRatio) * 0.2,
      damp: 0.7,
    };
  }
  if (id === 386) {                                                   // :58444-58456 火星工程师
    // ai[2]>0（放炮塔蓄势）→ 只衰减不加速
    return e.ai2 > 0 ? { max: 0, accel: 0, damp: 0.8 } : { max: 1.5, accel: 0.15, damp: 0.7 };
  }
  if (id === 460) {                                                   // :58457-58525 屠夫
    let num98 = 0.1;                                                  // :58460-58480 分段加速衰减
    for (const t of [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]) {
      if (Math.abs(e.vx) > t) num98 *= 0.8;
    }
    return {
      max: 3 + (1 - hpRatio) * 3,                                     // :58481
      accel: num98,
      damp: 0.7,
      reverseDamp: 0.93,                                              // :58492/:58504
    };
  }
  if (id === 391 || id === 427 || id === 415 || id === 419 || id === 518 || id === 532) {
    // :58613-58667 Scutlix/外星蜂/Drakomire/Selenian/Drakanian/Basilisk
    if (id === 427) return { max: 6, accel: 0.2, damp: 0.8 };         // :58624-58627
    if (id === 415) return { max: 4, accel: 0.1, damp: 0.95 };        // :58628-58631
    if (id === 419) return { max: 6, accel: 0.15, damp: 0.85 };       // :58632-58635
    if (id === 518) return { max: 5, accel: 0.1, damp: 0.95 };        // :58636-58639
    if (id === 532) return { max: 5, accel: 0.15, damp: 0.98 };       // :58640-58643
    return { max: 5, accel: 0.25, damp: 0.7 };                        // :58622-58623
  }
  // :58669-58718 扑咬突进族（哥布林苦力 430-436/龙虾 494/495/火把僵尸 591）——专属
  // 突进分支待移植（见 memory），暂走一期通用档
  if (inRange(id, 430, 436) || id === 494 || id === 495 || id === 591) return LEGACY;
  // :58719-58800 default 档 num108（僵尸变体/雨衣僵尸/血僵尸/沼泽怪等其余战士族）
  let num108 = 1;                                                     // :58722
  if (id === 624) num108 = 2.5;                                       // 地精
  else if (id === 186) num108 = 1.1;
  else if (id === 187) num108 = 0.9;
  else if (id === 188) num108 = 1.2;
  else if (id === 189) num108 = 0.8;
  else if (id === 132) num108 = 0.95;
  else if (id === 200) num108 = 0.87;
  else if (id === 223) num108 = 1.05;
  else if (id === 632) num108 = 0.8;
  else if (id === 691) num108 = 0.85;
  // :58770-58783 血僵尸 489：限速 = (2.5 - min(距离×0.0025, 1.5)) × 0.8（expert 恒 false）
  // ——距离项需要玩家坐标，在 fighterMoveStep 内取
  const scaleBoost = id === 489 || id === 3 || id === 132 || id === 186 || id === 187
    || id === 188 || id === 189 || id === 200 || id === 223 || id === 331 || id === 332;
  if (scaleBoost) num108 *= 1 + (1 - scale);                          // :58790-58793
  return { max: num108, accel: 0.07, damp: 0.8 };
}

/** 横向移动执行（各分支共形段 1:1）。dir = direction（朝目标）。
 *  508/580/582（蚁狮冲锋兽族）走专属平滑逼近式（:58526-58612）。 */
export function fighterMoveStep(e: Enemy, dir: number, player: Player | null): void {
  const id = e.vanillaId ?? -1;
  if (id === 508 || id === 580 || id === 582) { chargerApproach(e, dir, player); return; }
  const spec = fighterMoveSpec(e);
  if (!spec) return;                        // 原版该型链上无分支（射击族排除表）
  let max = spec.max;
  if (id === 489 && player) {               // :58770-58783 血僵尸按距离减速
    let num109 = Math.hypot(player.cx - e.cx, player.cy - e.cy) * 0.0025;
    if (num109 > 1.5) num109 = 1.5;
    max = (2.5 - num109) * 0.8;
  }
  if (e.vx < -max || e.vx > max) {
    if (e.vy === 0) e.vx *= spec.damp;      // 原版 velocity *= damp（落地时 Y≈0 等价）
  } else if (e.vx < max && dir === 1) {
    // :58102-58105 Psycho 466：direction=+1 而 vx<-2（潜伏突袭的逆向余速）→ 先 ×0.9 刹车
    if (id === 466 && e.vx < -2) e.vx *= 0.9;
    if (spec.reverseDamp !== undefined && e.vy === 0 && e.vx < 0) e.vx *= spec.reverseDamp;
    e.vx += spec.accel;
    if (e.vx > max) e.vx = max;
  } else if (e.vx > -max && dir === -1) {
    // :58118-58121 对称侧：direction=-1 而 vx>2 → ×0.9
    if (id === 466 && e.vx > 2) e.vx *= 0.9;
    if (spec.reverseDamp !== undefined && e.vy === 0 && e.vx > 0) e.vx *= spec.reverseDamp;
    e.vx -= spec.accel;
    if (e.vx < -max) e.vx = -max;
  }
  // :58132-58135 弗里茨 462 落地逆行额外衰减
  if (id === 462 && e.vy === 0
    && ((dir > 0 && e.vx < 0) || (dir < 0 && e.vx > 0))) e.vx *= 0.9;
}

/** 蚁狮冲锋兽族平滑逼近（:58526-58612）1:1：目标速度档随当前速度分段抬升，
 *  靠 (v×n ± 目标)/(n+1) 指数逼近；与目标同向时直接逼近，逆向且 |vy| 小时缓刹。 */
function chargerApproach(e: Enemy, dir: number, player: Player | null): void {
  const id = e.vanillaId ?? -1;
  let num99 = 2.5, num100 = 10;                       // :58528-58529
  const speed = Math.abs(e.vx);
  if (id === 582) {                                   // :58531-58541 Basilisk
    num99 = 2.25; num100 = 7;
    if (speed > 2.5) { num99 = 3; num100 += 75; }
    else if (speed > 2) { num99 = 2.75; num100 += 55; }
  } else if (speed > 2.75) {                          // :58542-58548
    num99 = 3.5; num100 += 80;
  } else if (speed > 2.25) {
    num99 = 3; num100 += 60;
  }
  if (Math.abs(e.vy) < 0.5) {                         // :58549-58558 落地逆行缓刹
    if ((e.vx > 0 && dir < 0) || (e.vx < 0 && dir > 0)) { e.vx *= 0.95; e.vy *= 0.95; }
  }
  if (Math.abs(e.vy) > 0.3) {                         // :58559-58567 空中(>gravity)逼近加速
    num100 *= id === 582 ? 2 : 3;
  }
  if (e.vx <= 0 && dir < 0) e.vx = (e.vx * num100 - num99) / (num100 + 1);      // :58569-58571
  else if (e.vx >= 0 && dir > 0) e.vx = (e.vx * num100 + num99) / (num100 + 1); // :58572-58574
  else if (player && Math.abs(e.cx - player.cx) > 20 && Math.abs(e.vy) <= 0.3) {
    e.vx *= 0.99;                                     // :58575-58578
    e.vx += dir * 0.025;
  }
}

// ---------------------------------------------------------------------------
// 混沌元素 120（NPC.cs:57431-57460 到达演出 / :60679-60696 传送触发 /
// ai[3] 卡死计数 :57504-57545 / AI_AttemptToFindTeleportSpot :18876-18946）
// ---------------------------------------------------------------------------
/** 上一帧 X（ai[3] 卡死计数的 position.X == oldPosition.X 判据） */
const prevX = new WeakMap<Enemy, number>();
/** 两帧前位置（混沌元素传送旧端 FX 用——原版 oldPos[2] :57453） */
const pos2 = new WeakMap<Enemy, { x: number; y: number }>();
const pos1 = new WeakMap<Enemy, { x: number; y: number }>();

/** ai[3] 卡死计数（:57504-57545）+ 传送。仅 type 120：num58 = 180（:57430-57433）。
 *  返回新的 ai3 值（调用方写回 this.ai3）。 */
export function chaosElementalStep(
  e: Enemy, game: GameHooks, p: Player | null,
): number {
  const num58 = 180;                                   // :57433
  const oldX = prevX.get(e) ?? e.x;
  prevX.set(e, e.x);
  const p2Prev = pos2.get(e) ?? { x: e.x, y: e.y };    // oldPos[2]：两帧前位置
  pos2.set(e, pos1.get(e) ?? { x: e.x, y: e.y });
  pos1.set(e, { x: e.x, y: e.y });
  let ai3 = e.ai3;
  if (ai3 === -120) {                                  // :57436-57460 传送到达帧
    e.vx = 0; e.vy = 0;
    ai3 = 0;
    game.playSfxFiles(['Item_8'], 1, e.cx, e.cy);      // :57439 Item8 新位置一次
    // 新旧双端各 20 尘 71（alpha200 scale2 noGravity），速度沿 旧→新 方向相向（:57447-57457）
    const dir = Math.atan2(e.cy - (p2Prev.y + e.h / 2), e.cx - (p2Prev.x + e.w / 2));
    game.spawnBurst?.(e.cx, e.cy, '#B06AE8', 20, 2, dir, 0.5, { life: 30 });
    game.spawnBurst?.(p2Prev.x + e.w / 2, p2Prev.y + e.h / 2, '#B06AE8', 20, 2,
      dir + Math.PI, 0.5, { life: 30 });
  }
  // :57520-57524 flag7 = 落地且 vx 与 direction 相逆 → 计数上升
  const opposite = e.vy === 0 && ((e.vx > 0 && e.facing < 0) || (e.vx < 0 && e.facing > 0));
  if (e.x === oldX || ai3 >= num58 || opposite) ai3 += 1;              // :57525-57528
  else if (Math.abs(e.vx) > 0.9 && ai3 > 0) ai3 -= 1;                 // :57529-57531
  if (ai3 > num58 * 10) ai3 = 0;                                      // :57533-57535
  if (e.justHit) ai3 = 0;                                             // :57537-57539
  if (p && p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
    ai3 = 0;                                                          // :57543-57545 触碰归零
  }
  if (p && ai3 >= num58) {                                            // :60679-60696
    const ttx = Math.floor(p.cx / TILE), tty = Math.floor(p.cy / TILE);
    const spot = attemptToFindTeleportSpot(e, game, ttx, tty, 20, 9);
    if (spot) {
      e.x = spot.x * TILE - e.w / 2;
      e.y = spot.y * TILE - e.h;
      ai3 = -120;
    }
  }
  return ai3;
}

/** AI_AttemptToFindTeleportSpot（NPC.cs:18876-18946）1:1。返回落点 tile 坐标。
 *  opts：centered=净空改 i±fluff 矩形（星云脑 :41650）；inAir=免脚下实心（星云脑）；
 *  dungeonWallGate=地牢法师族门（:18899-18904：type 32/281-286 要求上一格地牢砖墙）。 */
export function attemptToFindTeleportSpot(
  e: Enemy, game: GameHooks, targetTileX: number, targetTileY: number,
  rangeFromTargetTile: number, telefragPreventionDistanceInTiles: number,
  opts: { centered?: boolean; inAir?: boolean; dungeonWallGate?: boolean } = {},
): { x: number; y: number } | null {
  const st = game.world.store;
  const cx = Math.floor(e.cx / TILE), cy = Math.floor(e.cy / TILE);    // :18878-18879
  let num3 = 0;
  let found = false;
  if (Math.abs(cx * TILE - targetTileX * TILE) + Math.abs(cy * TILE - targetTileY * TILE) > 2000) {
    num3 = 100;                                                         // :18885-18888 超距直接放弃
  }
  let chosen: { x: number; y: number } | null = null;
  while (!found && num3 < 100) {                                        // :18890
    num3++;
    const num5 = targetTileX - rangeFromTargetTile
      + Math.floor(Math.random() * (rangeFromTargetTile * 2 + 1));      // :18892
    const yStart = targetTileY - rangeFromTargetTile
      + Math.floor(Math.random() * (rangeFromTargetTile * 2 + 1));      // :18893
    for (let i = yStart; i < targetTileY + rangeFromTargetTile; i++) {  // :18893
      // :18896-18899 自身 3×3 邻域跳过 + 非激活格跳过（teleportInAir=false）
      if ((i >= cy - 1 && i <= cy + 1 && num5 >= cx - 1 && num5 <= cx + 1)
        || !st.inBounds(num5, i) || st.get(num5, i) === 0) continue;
      // :18899-18904 地牢法师门：上一格须地牢砖墙（wallDungeon 集）
      if (opts.dungeonWallGate
        && !(st.wall[st.idx(num5, i - 1)] >= 7 && st.wall[st.idx(num5, i - 1)] <= 9
          || (st.wall[st.idx(num5, i - 1)] >= 94 && st.wall[st.idx(num5, i - 1)] <= 99))) continue;
      // :18907-18909 头顶格岩浆面跳过（lava()）
      if (!st.inBounds(num5, i - 1) || st.liquidType[st.idx(num5, i - 1)] === 2) continue;
      // :18910 脚下须实心（!tileSolid 跳过；teleportInAir 跳过本门）
      if (!opts.inAir && !st.isSolid(num5, i)) continue;
      // :18915 身位净空（fluff=1）：!centered → (i±1)×(i-4..i-2) 三行；centered → i±1 矩形
      let clear = true;
      const yLo = opts.centered ? -1 : -4, yHi = opts.centered ? 1 : -2;
      for (let dy = yLo; dy <= yHi && clear; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (st.inBounds(num5 + dx, i + dy) && st.isSolid(num5 + dx, i + dy)) clear = false;
        }
      }
      if (!clear) continue;
      // :18926-18945 telefrag 预防：落点外扩 N 格与玩家 AABB（含 20t 速度外推并集）不相交
      const ext = telefragPreventionDistanceInTiles * TILE;
      const box = { x: num5 * TILE - ext, y: i * TILE - ext, w: TILE + ext * 2, h: TILE + ext * 2 };
      const p = game.player as Player;
      const ux = p.x + p.vx * 20, uy = p.y + p.vy * 20;                 // num4=20（:18884）
      const px0 = Math.min(p.x, ux), px1 = Math.max(p.x + p.w, ux + p.w);
      const py0 = Math.min(p.y, uy), py1 = Math.max(p.y + p.h, uy + p.h);
      if (px0 < box.x + box.w && px1 > box.x && py0 < box.y + box.h && py1 > box.y) {
        found = false;
        break;
      }
      chosen = { x: num5, y: i };
      found = true;
      break;
    }
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// 沼泽怪 166 伏击（NPC.cs:56327-56360）：1/240 概率进入伏击态（ai[2] = -480..-60），
// 静立到 受击 / 看见玩家 为止；期间只做原地减速并跳过本 tick 行走。
// 返回 true = 本 tick 已被伏击分支接管（调用方跳过行走段）。
// ---------------------------------------------------------------------------
export function swampThingAmbushStep(e: Enemy, canSee: boolean): boolean {
  if (e.vanillaId !== 166) return false;
  if (Math.random() < 1 / 240) e.ai2 = -(60 + Math.floor(Math.random() * 420));  // :56329-56332
  if (e.ai2 < 0) {
    if (e.justHit) e.ai2 = 0;                                                    // :56338-56340
    if (canSee) e.ai2 = 0;                                                       // :56341-56344
  }
  if (e.ai2 < 0) {
    e.vx *= 0.9;                                                                 // :56349
    if (e.vx > -0.1 && e.vx < 0.1) e.vx = 0;                                     // :56350-56354
    e.ai2 += 1;                                                                  // :56355
    if (e.ai2 === 0) e.vx = e.facing * 0.1;                                      // :56356-56358
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 日食怪战士族专属行为分支（AI_003_Fighters 内 type 段，1.4.5.6 1:1）
// ---------------------------------------------------------------------------

/** Psycho 466 潜伏突袭（NPC.cs:56290-56326，AI_003 最前段——比行走/跳跃/远程全早，
 *  两分支 return 跳过本 tick 余段；重力由 UpdateNPC 尾补，本仓等价自补）。
 *  ai[2] 状态机：0=潜伏（alpha 200 全隐 + TargetClosest，玩家 <170px / 被推动 /
 *  被击 → -16）；<0=显形倒数（alpha 每 tick −num5/16 = −12.5，ai[2]+1 至 0 时
 *  ai[2]=1 并 vx=direction×2 起冲）；≥1=显形（alpha 0，走通用段）。
 *  @returns true = 本 tick 已被潜伏/显形段接管（调用方直接收尾） */
export function psychoStealthStep(e: Enemy, game: GameHooks, p: Player | null): boolean {
  if (e.vanillaId !== 466) return false;
  const num5 = 200;                                       // :56292
  if (e.ai2 === 0) {
    e.spawnAlpha = num5;                                  // :56295 潜伏全隐
    if (p) e.facing = e.seekDirX(p);                      // :56296 TargetClosest
    // :56297-56300：目标存活且中心距 <170px → 触发显形
    if (p && !p.dead && Math.hypot(p.cx - e.cx, p.cy - e.cy) < 170) e.ai2 = -16;
    // :56301-56304：自身被推动/下落超两档重力/受击 → 同样触发
    if (e.vx !== 0 || e.vy < 0 || e.vy > 2 || e.justHit) e.ai2 = -16;
    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL_SPEED);      // :56305 return（UpdateNPC :91519 重力）
    moveAndCollide(e, game.world, e.vx, e.vy);
    return true;
  }
  if (e.ai2 < 0) {
    if (e.spawnAlpha > 0) {                               // :56309-56316 显形渐入
      e.spawnAlpha -= num5 / 16;
      if (e.spawnAlpha < 0) e.spawnAlpha = 0;
    }
    e.ai2 += 1;                                           // :56317
    if (e.ai2 === 0) {                                    // :56318-56322 显形完成 → 起冲
      e.ai2 = 1;
      e.vx = e.facing * 2;
    }
    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL_SPEED);      // :56323 return
    moveAndCollide(e, game.world, e.vx, e.vy);
    return true;
  }
  e.spawnAlpha = 0;                                       // :56325 显形态恒 0
  return false;
}

/** Nailhead 463 受击散射（NPC.cs:57547-57613）。justHit 且 localAI[3] 冷却尽且 1/3
 *  掷中 → 冷却 30t，散射 3-5 枚 Nail 弹（proj 498，伤害 = 自身 damage×0.15 截断，
 *  击退 1）。方向：每发随机单位向量，有目标时先向目标平均向量偏置再归一；末尾
 *  num68 发改为直指目标。单人下目标集 = 本地玩家（CanHitLine 门）。
 *  弹速 num76 = rand(8..12)。发射点 = (Center.X, position.Y + width/4)（:57611）。 */
export function nailheadHitScatter(e: Enemy, game: GameHooks, p: Player | null): void {
  if (e.vanillaId !== 463) return;
  if (e.lai3 > 0) e.lai3 -= 1;                            // :57549-57552 localAI[3] 冷却
  if (!(e.justHit && e.lai3 <= 0 && Math.floor(Math.random() * 3) === 0)) return;  // :57553
  e.lai3 = 30;                                            // :57555
  const num67 = 3 + Math.floor(Math.random() * 3);        // :57556 Next(3,6) = 3-5 发
  // :57559-57570 目标收集（255 玩家全扫 → 单人 = 本地玩家，CanHitLine 门）
  let num68 = 0;
  if (p && !p.dead
    && canHitLine(game.world.store, e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) num68 = 1;
  // :57585-57592 vector20 = (-1,-1) + Σ(目标单位向量) 归一（目标平均方向）
  let bx = -1, by = -1;
  if (num68 > 0) {
    const ddx = p!.cx - e.cx, ddy = p!.cy - e.cy;
    const dd = Math.hypot(ddx, ddy) || 1;
    bx += ddx / dd; by += ddy / dd;
    const bd = Math.hypot(bx, by) || 1;
    bx /= bd; by /= bd;
  }
  const ox = e.cx;                                        // :57611 Center.X
  const oy = e.y + e.w / 4;                               // :57611 position.Y + width/4
  const dmg = Math.trunc(e.def.damage * 0.15);            // :57611 (int)(damage * 0.15)
  for (let i = 0; i < num67; i++) {
    const num76 = 8 + Math.floor(Math.random() * 5);      // :57595 Next(8,13) = 8-12
    let vx = Math.floor(Math.random() * 201) - 100;       // :57596 Next(-100,101)
    let vy = Math.floor(Math.random() * 201) - 100;
    const vd = Math.hypot(vx, vy) || 1;
    vx /= vd; vy /= vd;                                   // :57597
    if (num68 > 0) {                                      // :57598-57602 目标偏置
      vx += bx; vy += by;
      const vd2 = Math.hypot(vx, vy) || 1;
      vx /= vd2; vy /= vd2;
    }
    vx *= num76; vy *= num76;                             // :57603
    if (num68 > 0) {                                      // :57604-57610 末发直指目标
      num68--;
      const ddx = p!.cx - e.cx, ddy = p!.cy - e.cy;
      const dd = Math.hypot(ddx, ddy) || 1;
      vx = (ddx / dd) * num76; vy = (ddy / dd) * num76;
    }
    e.spawnHostileProj(game, ox, oy, vx, vy, dmg, 498);   // :57611 proj 498 Nail（kb 1 → Dart 无击退通道，登记）
  }
}

/** Butcher 460 空中免击退（NPC.cs:57615-57624）：|vy| 超过一档重力步（正被击飞/
 *  下坠加速中）→ knockBackResist=0 完全免疫；否则 0.25 走难度曲线。
 *  原版阈值是 npc.gravity(0.3)（NPC.cs:6026），本仓战士重力步长 = GRAVITY，
 *  语义一致（自由落体 ≥2 tick 即超过）。 */
export function butcherKbStep(e: Enemy): void {
  if (e.vanillaId !== 460) return;
  if (e.vy < -GRAVITY || e.vy > GRAVITY) {
    e.kbResistOverride = 0;                               // :57617-57620
  } else {
    e.kbResistOverride = getKnockbackMultiplierScaledByDifficulty(0.25, e.difficulty); // :57623
  }
}

/** Possessed 469 背景墙爬行冲刺（NPC.cs:57626-57677）。
 *  击退：0.45 难度曲线；爬墙冲刺态（ai[2]==1）免疫（:57628-57632）。
 *  flag11 = 中心 3×3 任一格有背景墙（:57634-57650）。
 *   ai[2]==0 且贴墙：落地 → 上蹿 vy=-4.6、vx×1.3（flag=true 放行空中跳跃段）；
 *   下坠中且目标存活 → 转 ai[2]=1（:57651-57663）。
 *   ai[2]==1 且贴墙且视线通 → 冲刺：期望速度 = 朝目标单位向量 × (4.5 + 距离/300)，
 *   29/30 平滑逼近，noGravity（:57664-57673，段末 return）。
 *  不满足任一 → noGravity=false、ai[2]=0（:57675-57676，回通用段）。
 *  @returns true = 冲刺分支本 tick 已接管（调用方收尾） */
export function possessedStep(e: Enemy, game: GameHooks, p: Player | null): boolean {
  if (e.vanillaId !== 469) return false;
  e.kbResistOverride = e.ai2 === 1
    ? 0
    : getKnockbackMultiplierScaledByDifficulty(0.45, e.difficulty);   // :57628-57632
  const st = game.world.store;
  // flag11（:57634-57650）：中心 3×3 内任一格 wall>0
  const nx = Math.floor(e.cx / TILE), ny = Math.floor(e.cy / TILE);
  let flag11 = false;
  for (let i = nx - 1; i <= nx + 1 && !flag11; i++) {
    for (let j = ny - 1; j <= ny + 1; j++) {
      if (st.inBounds(i, j) && st.wall[st.idx(i, j)] > 0) { flag11 = true; break; }
    }
  }
  if (e.ai2 === 0 && flag11) {
    if (e.vy === 0) {                                     // :57653-57658 贴墙起跳
      e.vy = -4.6;
      e.vx *= 1.3;
    } else if (e.vy > 0 && p && !p.dead) {
      e.ai2 = 1;                                          // :57659-57662 下坠中转爬墙态
    }
  }
  if (flag11 && e.ai2 === 1 && p && !p.dead
    && canHit(st, e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) {           // :57664
    const dx = p.cx - e.cx, dy = p.cy - e.cy;             // :57666 vector23
    const num81 = Math.hypot(dx, dy) || 1;                // :57667
    const spd = 4.5 + num81 / 300;                        // :57669
    e.vx = (e.vx * 29 + (dx / num81) * spd) / 30;         // :57670 29/30 平滑
    e.vy = (e.vy * 29 + (dy / num81) * spd) / 30;
    e.ai2 = 1;                                            // :57672
    e.x += e.vx; e.y += e.vy;                             // noGravity=true（:57671）无碰撞积分
    return true;                                          // :57673 return
  }
  e.ai2 = 0;                                              // :57675-57676
  return false;
}

/** Fritz 462 跳扑（NPC.cs:57678-57710）。落地 + 目标 <150px + |vx|>3 + 朝目标
 *  横向逼近 → vx×1.75、vy−4.5；目标在下方按落差 ≥20/40/80/100px 追加
 *  −0.5/−1/−1.5/−1.5；|vx| 钳 7。段内 flag=true（放行空中跳跃段），
 *  不 return——继续走本 tick 通用行走。 */
export function fritzPounceStep(e: Enemy, p: Player | null): void {
  if (e.vanillaId !== 462 || e.vy !== 0 || !p) return;
  if (Math.hypot(p.cx - e.cx, p.cy - e.cy) >= 150) return;            // :57678 <150px
  if (Math.abs(e.vx) <= 3) return;                                    // :57678 |vx|>3
  // :57678 朝目标横向逼近（vx 与 目标方向 同号）
  if (!((e.vx < 0 && e.cx > p.cx) || (e.vx > 0 && e.cx < p.cx))) return;
  e.vx *= 1.75;                                                       // :57681
  e.vy -= 4.5;                                                        // :57682
  const drop = e.cy - p.cy;                                           // :57683 Center.Y 差
  if (drop > 20) e.vy -= 0.5;                                         // :57683-57684
  if (drop > 40) e.vy -= 1;                                           // :57687-57688
  if (drop > 80) e.vy -= 1.5;                                         // :57691-57692
  if (drop > 100) e.vy -= 1.5;                                        // :57695-57696
  if (Math.abs(e.vx) > 7) e.vx = e.vx < 0 ? -7 : 7;                   // :57699-57709
}
