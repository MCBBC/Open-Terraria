// Boss AI 1:1 移植(二):猪鲨鱼龙 AI_069(NPC 370)与月亮领主 aiStyle 77/78/79(NPC 398 核心 / 397 手 / 396 头)。
// 源码:Terarria1456(1.4.5.6)NPC.cs ——
//   猪鲨 AI_069_DukeFishron        :49143-50127
//   月总核心 aiStyle 77(398)      :36774-37198
//   月总手   aiStyle 78(397)      :37199-37711
//   月总头   aiStyle 79(396)      :37712-38128
//   攻击时间表 MoonLordAttacksArray :6830-6946 / MoonLordAttacksArray2 :6948-6987
//   死亡转换 checkDead             :78841-78867(396/397 血尽→ai0=-2 闭眼残肢+召真眼;398 血尽→ai0=2 死亡演出)
// 经典模式主链 1:1;expert/getGoodWorld 分支保留注释;netcode 跳过。
// 无敌语义:dontTakeDamage 用 e.iframes=2 每 tick 刷新近似(同 bossAI.ts 克脑一阶段)。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { spawnPart, shoot, accelTo } from './bossAI';

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/** Boss 伤害/防御基值缓存(状态机每 tick 从基值派生临时修正,防重复乘膨胀) */
const baseStats = new WeakMap<Enemy, { dmg: number; def: number }>();
const baseOf = (e: Enemy) => {
  let b = baseStats.get(e);
  if (!b) { b = { dmg: e.def.damage, def: e.def.defense ?? 0 }; baseStats.set(e, b); }
  return b;
};

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 标量区间平滑(驱动向量 SmoothStep 的 amount 因子) */
const smoothAmt = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
/** 原版 Vector2.SmoothStep(cur, target, amount):Lerp(amount²(3-2amount)) */
const vSmoothStep = (cur: number, target: number, amount: number) => lerp(cur, target, smoothAmt(amount));
/** 角度插值(原版 float.AngleLerp:取最短方向步进) */
const angleLerp = (cur: number, target: number, t: number) => {
  let d = target - cur;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return cur + d * t;
};

/** 原版 SimpleFlyMovement(:78100)+ 速度折半混合(月总 8/0.5+Lerp0.5 的组合写法):
 *  先单轴步进逼近目标速度,再与步进前速度做 0.5 Lerp(等效步长减半) */
const flyLerp = (e: Enemy, tx: number, ty: number, acc: number) => {
  const ox = e.vx, oy = e.vy;
  e.vx = accelTo(e.vx, tx, acc);
  e.vy = accelTo(e.vy, ty, acc);
  e.vx = lerp(ox, e.vx, 0.5);
  e.vy = lerp(oy, e.vy, 0.5);
};

/** 每实例附加槽位(原版 direction/spriteDirection/localAI/frameCounter 等无对应 Enemy 字段) */
interface DukeX { dir: number; spr: number }
const dukeX = new WeakMap<Enemy, DukeX>();
const dukeOf = (e: Enemy): DukeX => {
  let x = dukeX.get(e);
  if (!x) { x = { dir: 1, spr: 1 }; dukeX.set(e, x); }
  return x;
};
interface HandX { frame: number; l0: number; l1: number }
const handX = new WeakMap<Enemy, HandX>();
const handOf = (e: Enemy): HandX => {
  let x = handX.get(e);
  if (!x) { x = { frame: 0, l0: 0, l1: 0 }; handX.set(e, x); }
  return x;
};
interface HeadX { f2: number; f3: number; l0: number; l1: number; l2: number }
const headX = new WeakMap<Enemy, HeadX>();
const headOf = (e: Enemy): HeadX => {
  let x = headX.get(e);
  if (!x) { x = { f2: 0, f3: 0, l0: 0, l1: 0, l2: 0 }; headX.set(e, x); }
  return x;
};

/** 实心块内判定(原版 Collision.SolidCollision 的中心点近似) */
const inSolid = (game: GameHooks, e: Enemy): boolean => {
  const st = game.world.store;
  const tx = Math.floor(e.cx / TILE), ty = Math.floor(e.cy / TILE);
  return st.inBounds(tx, ty) && st.isSolid(tx, ty);
};

/** 原版"攻击时间表"推进(NPC.cs :37229-37251 / :37740-37762 / :38243-38264 同构):
 *  ai1 全局计时,逐槽累计时长定位当前槽;全部槽走完回绕 ai1=0。
 *  注意:只回写 ai1,不写 ai0——手/头由调用方把槽攻击号赋给 ai0(即其状态),
 *  核心二阶段 ai0 是相位状态(0/1/2/3),绝不能被攻击号覆盖。 */
function attackSlot(e: Enemy, table: ReadonlyArray<readonly [number, number]>): { atk: number; inSlot: number; dur: number } {
  let slot = 0, consumed = 0;
  while (slot < table.length) {
    const dur = table[slot][1];
    if (dur + consumed > e.ai1) break;
    consumed += dur;
    slot++;
  }
  if (slot === table.length) { slot = 0; e.ai1 = 0; consumed = 0; }
  const atk = table[slot][0];
  return { atk, inSlot: e.ai1 - consumed, dur: table[slot][1] };
}

// ---------------------------------------------------------------------------
// AI_069 猪鲨鱼龙(NPC 370,NPC.cs:49143-50127)
// ---------------------------------------------------------------------------
// 状态 ai0:-1 出生(75t) → 一阶段循环 0 悬浮(num3 t)→1 冲撞(num6 t)×5→2 泡泡弹(80t)
//   →3 鲨鱼龙卷(90t);血 ≤50% →4 变身(180t) →5 二阶段循环:0→6 冲撞→7 旋转泡泡冲刺(120t)
//   →8 鲨鱼龙卷;9(expert 15% 血)二段变身(180t) →10 隐身悬浮→11 冲撞/12 瞬移(30t)/13 旋转冲刺。
// 经典参数:悬浮 60t/0.45/7.5、冲撞 30t@16 速、泡泡 80t 每 4t 一发、龙卷 90t(60t 时发射)、变身 180t。

const DUKE = {
  spawnT: 75,          // num21 :49215
  hoverT: 60,          // num3  :49168(经典)
  hoverAcc: 0.45,      // num4  :49169
  hoverSpd: 7.5,       // num5  :49170
  chargeT: 30,         // num6  :49187
  chargeSpd: 16,       // num7  :49188
  bubbleT: 80,         // num8  :49202
  bubbleEvery: 4,      // num9  :49203
  bubbleAcc: 0.3,      // num10 :49204
  bubbleSpd: 5,        // num11 :49205
  nadoT: 90,           // num12 :49206
  p1T: 180,            // num13 :49207(一→二阶段变身)
  p2T: 180,            // num14 :49208(二段狂暴变身,expert)
  teleT: 30,           // num15 :49209(瞬移)
  spinT: 120,          // num16 :49210(旋转冲刺)
  spinEvery: 4,        // num17 :49211
  spinBubbleSpd: 6,    // num18 :49212
  spinDashSpd: 20,     // num19 :49213
};
/** 旋转冲刺角速度 num20 = 2π/(num16/2) = 2π/60(:49214) */
const DUKE_SPIN_RATE = TAU / (DUKE.spinT / 2);

/** 狂暴判定 flag6(:49238):玩家在太空(y<800)/地下(y>worldSurface*16)/离开两侧海洋带 */
function dukeEnraged(game: GameHooks, player: Player): boolean {
  const st = game.world.store;
  const surface = (game.world.groundLevel || Math.floor(st.h * 0.3)) * TILE;
  return player.y < 800 || player.y > surface ||
    (player.x > 6400 && player.x < st.w * TILE - 6400);
}

/** 一阶段悬浮结束的下一招(:49471-49542) */
function dukePick1(e: Enemy, enraged: boolean): number {
  const a3 = Math.floor(e.ai3);
  let next = 0; // 0=无事(原版 switch 无匹配分支,ai2 继续累计)
  if (a3 >= 0 && a3 <= 9) next = 1;          // 冲撞
  else if (a3 === 10) { e.ai3 = 1; next = 2; } // 泡泡弹
  else if (a3 === 11) { e.ai3 = 0; next = 3; } // 鲨鱼龙卷
  if (enraged && next === 2) next = 3;       // :49495 狂暴时泡泡弹换龙卷
  if (e.hp <= e.maxHp * 0.5) next = 4;       // :49499 半血变身
  return next;
}
/** 二阶段悬浮结束的下一招(:49736-49809) */
function dukePick2(e: Enemy, enraged: boolean): number {
  const a3 = Math.floor(e.ai3);
  let next = 0;
  if (a3 >= 0 && a3 <= 5) next = 1;          // 冲撞(6)
  else if (a3 === 6) { e.ai3 = 1; next = 2; } // 旋转泡泡冲刺(7)
  else if (a3 === 7) { e.ai3 = 0; next = 3; } // 鲨鱼龙卷(8)
  // flag2(expert hp≤15%):next=4 → ai0=9(:49756-49759)——经典模式不可达,代码保留见 dukeState9
  if (enraged && next === 2) next = 3;       // :49760
  return next;
}
/** 冲撞起手(:49503-49520 / :49764-49781 / :49988-50004 同构):定速直冲+朝向修正 */
function dukeCharge(e: Enemy, player: Player, spd: number, toState: number, st: DukeX) {
  const dx = player.cx - e.cx, dy = player.cy - e.cy;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * spd;
  e.vy = (dy / d) * spd;
  e.ai0 = toState; e.ai1 = 0; e.ai2 = 0;
  e.spin = Math.atan2(e.vy, e.vx);
  const s = Math.sign(dx) || st.dir;
  st.dir = s;
  if (st.spr === 1) e.spin += Math.PI;
  st.spr = -s;
}
/** 悬浮段共用(:49415-49468 / :49680-49733 / :49932-49967 同构):
 *  目标点 = 玩家 + (ai1 侧偏, -200);desired = normalize(目标-自身-速度)*spd 后 SimpleFlyMovement */
function dukeHover(e: Enemy, player: Player, acc: number, spd: number, sideOff: number, st: DukeX) {
  if (e.ai1 === 0) e.ai1 = sideOff * Math.sign(e.cx - player.cx || 1);
  const dx = player.cx + e.ai1 - e.cx - e.vx;
  const dy = player.cy - 200 - e.cy - e.vy;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = accelTo(e.vx, (dx / d) * spd, acc);
  e.vy = accelTo(e.vy, (dy / d) * spd, acc);
  const s = Math.sign(player.cx - e.cx) || st.dir;
  if (e.ai2 === 0 && s !== st.dir) e.spin += Math.PI;
  st.dir = s;
  if (st.spr !== -st.dir) e.spin += Math.PI;
  st.spr = -st.dir;
}

/** AI_069 主入口(经典模式) */
export function dukeFishronAI(e: Enemy, game: GameHooks, player: Player | null) {
  const st = dukeOf(e);
  if (!e.bInit) { e.bInit = true; e.ai0 = -1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.spawnAlpha = 255; } // :49247-49257
  const b = baseOf(e);
  const enraged = player ? dukeEnraged(game, player) : false;
  const flag = e.hp <= e.maxHp * 0.5;                       // flag  :49147 二阶段
  const flag3 = e.ai0 > 4;                                  // flag3 :49149(二阶段状态 5-13)
  const flag4 = e.ai0 > 9;                                  // flag4 :49150(expert 狂暴段 10-13)
  const flag5 = e.ai3 < (flag3 ? 3 : 5) * 2;                // flag5 :49151-49152

  // 伤害/防御修正(:49153-49167 + 狂暴 :49239-49245)——每 tick 从基值派生
  if (flag4) { e.def.damage = Math.round(b.dmg * 1.1); e.def.defense = 0; }
  else if (flag3) { e.def.damage = Math.round(b.dmg * 1.2); e.def.defense = Math.round(b.def * 0.8); }
  else { e.def.damage = b.dmg; e.def.defense = b.def; }
  if (enraged) { e.def.damage = b.dmg * 2; e.def.defense = b.def * 2; }

  // 悬浮/冲撞参数(:49168-49201;expert 档注释)
  let hoverT = DUKE.hoverT, hoverAcc = DUKE.hoverAcc, hoverSpd = DUKE.hoverSpd;
  if (flag4) { hoverAcc = 0.7; hoverSpd = 12; hoverT = 30; }            // :49171-49176
  else if (flag3 && flag5) { hoverAcc = 0.5; hoverSpd = 8; hoverT = 20; } // :49177-49182
  else if (flag5 && !flag3 && !flag4) hoverT = 30;                       // :49183-49186
  let chargeT = DUKE.chargeT, chargeSpd = DUKE.chargeSpd;
  if (flag4) { chargeT = 25; chargeSpd = 27; }                           // :49189-49193(expert 同档)
  if (enraged) { hoverT = 10; chargeSpd += 6; }                          // :49239-49245

  // 玩家死/远离 5600px(:49218-49237):减速升空离场(原版另 EncourageDespawn(10);
  // 本工程 Boss 不参与 despawn 块,故仅保留升空)。原版此处无回血逻辑。
  if (!player || player.dead || Math.hypot(player.cx - e.cx, player.cy - e.cy) > 5600) {
    e.vy -= 0.4;
    e.encourageDespawn(10); // :49234 急升逃离 + EncourageDespawn(10)
    e.ai0 = e.ai0 > 4 ? 5 : 0;
    e.ai2 = 0;
    e.x += e.vx; e.y += e.vy;
    return;
  }

  // ---- 身体旋转朝向(:49258-49345)----
  let target = Math.atan2(player.cy - e.cy, player.cx - e.cx);
  if (st.spr === 1) target += Math.PI;
  if (target < 0) target += TAU; else if (target > TAU) target -= TAU;
  if (e.ai0 === -1 || e.ai0 === 3 || e.ai0 === 4 || e.ai0 === 8) target = 0; // :49271-49286
  let step = 0.04;                                                            // num23 :49287
  if (e.ai0 === 1 || e.ai0 === 6 || e.ai0 === 7) step = 0;                    // :49288-49295
  if (e.ai0 === 3 || e.ai0 === 4 || e.ai0 === 8) step = 0.01;                 // :49296-49307
  let rot = e.spin;
  if (rot < target) rot += (target - rot > Math.PI ? -step : step);
  if (rot > target) rot += (rot - target > Math.PI ? step : -step);
  if (rot > target - step && rot < target + step) rot = target;
  if (rot < 0) rot += TAU; else if (rot > TAU) rot -= TAU;
  if (rot > target - step && rot < target + step) rot = target;
  e.spin = rot;

  // ---- 透明度(:49346-49364 + 各状态内分支;近似为 spawnAlpha 渐变) ----
  if (e.ai0 !== -1 && e.ai0 < 9) e.spawnAlpha = inSolid(game, e) ? Math.min(255, e.spawnAlpha + 15) : Math.max(0, e.spawnAlpha - 15);

  let invuln = false; // flag7(dontTakeDamage = !flag7,:50126)
  switch (e.ai0) {
    case -1: { // 出生(:49365-49414)
      invuln = true;
      e.vx *= 0.98; e.vy *= 0.98;
      const s = Math.sign(player.cx - e.cx) || st.dir;
      st.dir = s; st.spr = -s;
      if (e.ai2 > 20) {
        e.vy = -2;
        e.spawnAlpha = clamp(e.spawnAlpha - 5 + (inSolid(game, e) ? 15 : 0), 0, 150); // :49375-49391
      } else if (e.spawnAlpha < 255) e.spawnAlpha = 255;
      if (e.ai2 === DUKE.nadoT - 30) { // :49392 出生尘环
        game.spawnParticles(e.cx, e.cy, '#8FD8FF', 18, 2.4, { life: 40 });
        game.playSfx('roar', 0.8);
      }
      e.ai2 += 1;
      if (e.ai2 >= DUKE.spawnT) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; }
      break;
    }
    case 0: { // 一阶段悬浮(:49415-49543)
      if (player.dead) break;
      dukeHover(e, player, hoverAcc, hoverSpd, 300, st);
      e.ai2 += 1;
      if (e.ai2 >= hoverT) {
        const next = dukePick1(e, enraged);
        if (next === 1) dukeCharge(e, player, chargeSpd, 1, st);
        else if (next === 2) { e.ai0 = 2; e.ai1 = 0; e.ai2 = 0; }
        else if (next === 3) {
          e.ai0 = 3; e.ai1 = 0; e.ai2 = 0;
          if (enraged) e.ai2 = DUKE.nadoT - 40; // :49530-49533 狂暴跳过前摇
        } else if (next === 4) { e.ai0 = 4; e.ai1 = 0; e.ai2 = 0; }
      }
      break;
    }
    case 1: { // 冲撞(:49544-49566)
      game.spawnParticles(e.cx + e.w / 2 - Math.cos(e.spin) * e.w * 0.3, e.cy + e.h / 2 - Math.sin(e.spin) * e.h * 0.3, '#8FD8FF', 2, 1.5, { life: 18 });
      e.ai2 += 1;
      if (e.ai2 >= chargeT) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 += 2; }
      break;
    }
    case 2: { // 泡泡弹幕(:49567-49637)
      if (player.dead) break;
      if (e.ai1 === 0) e.ai1 = 300 * Math.sign(e.cx - player.cx || 1);
      const dx = player.cx + e.ai1 - e.cx - e.vx;
      const dy = player.cy - 200 - e.cy - e.vy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = accelTo(e.vx, (dx / d) * DUKE.bubbleSpd, DUKE.bubbleAcc);
      e.vy = accelTo(e.vy, (dy / d) * DUKE.bubbleSpd, DUKE.bubbleAcc);
      if (e.ai2 === 0) game.playSfx('roar', 0.5);
      if (e.ai2 % DUKE.bubbleEvery === 0) { // :49610-49618 每 4t 吐一颗爆裂泡泡(NPC 371)
        const ddx = player.cx - e.cx, ddy = player.cy - e.cy;
        const dd = Math.hypot(ddx, ddy) || 1;
        const bub = spawnPart(game, e, 371);
        if (bub) {
          bub.x = e.cx + (ddx / dd) * ((e.w + 20) / 2) - bub.w / 2;
          bub.y = e.cy + (ddy / dd) * ((e.w + 20) / 2) + 45 - bub.h / 2;
        }
      }
      const s = Math.sign(player.cx - e.cx) || st.dir;
      st.dir = s; st.spr = -s;
      e.ai2 += 1;
      if (e.ai2 >= DUKE.bubbleT) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; }
      break;
    }
    case 3: dukeSharknado(e, game, player, st, false); break;          // :49638-49660
    case 4: { // 一→二阶段变身(:49661-49679)
      invuln = true;
      e.vx *= 0.98;
      e.vy = lerp(e.vy, 0, 0.02);
      if (e.ai2 === DUKE.p1T - 60) game.playSfx('roar', 0.9);
      e.ai2 += 1;
      if (e.ai2 >= DUKE.p1T) { e.ai0 = 5; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
      break;
    }
    case 5: { // 二阶段悬浮(:49680-49811)
      if (player.dead) break;
      dukeHover(e, player, hoverAcc, hoverSpd, 300, st);
      e.ai2 += 1;
      if (e.ai2 >= hoverT) {
        const next = dukePick2(e, enraged);
        if (next === 1) dukeCharge(e, player, chargeSpd, 6, st);
        else if (next === 2) { // 旋转泡泡冲刺起手(:49782-49797):20 速直冲
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          e.vx = (dx / d) * DUKE.spinDashSpd;
          e.vy = (dy / d) * DUKE.spinDashSpd;
          e.spin = Math.atan2(e.vy, e.vx);
          const s = Math.sign(dx) || st.dir;
          st.dir = s;
          if (st.spr === 1) e.spin += Math.PI;
          st.spr = -s;
          e.ai0 = 7; e.ai1 = 0; e.ai2 = 0;
        } else if (next === 3) { e.ai0 = 8; e.ai1 = 0; e.ai2 = 0; }
        else if (next === 4) { e.ai0 = 9; e.ai1 = 0; e.ai2 = 0; } // expert
      }
      break;
    }
    case 6: { // 二阶段冲撞(:49812-49834)
      game.spawnParticles(e.cx, e.cy, '#8FD8FF', 2, 1.5, { life: 18 });
      e.ai2 += 1;
      if (e.ai2 >= chargeT) { e.ai0 = 5; e.ai1 = 0; e.ai2 = 0; e.ai3 += 2; }
      break;
    }
    case 7: { // 旋转泡泡冲刺(:49835-49864)
      if (e.ai2 === 0) game.playSfx('roar', 0.6);
      if (e.ai2 % DUKE.spinEvery === 0) { // 每 4t 沿垂直方向甩一颗泡泡
        const vlen = Math.hypot(e.vx, e.vy) || 1;
        const bub = spawnPart(game, e, 371);
        if (bub) {
          bub.bInit = true; bub.ai0 = 0; bub.ai1 = 0;          // 预置初速,跳过自初始化
          bub.ai3 = (80 + Math.random() * 41) / 100;            // :49751 随机 scale
          bub.x = e.cx + (e.vx / vlen) * ((e.w + 20) / 2) - bub.w / 2;
          bub.y = e.cy + (e.vy / vlen) * ((e.w + 20) / 2) + 45 - bub.h / 2;
          const ang = Math.atan2(e.vy / vlen, e.vx / vlen) + (Math.PI / 2) * st.dir;
          bub.vx = Math.cos(ang) * DUKE.spinBubbleSpd;
          bub.vy = Math.sin(ang) * DUKE.spinBubbleSpd;
        }
      }
      // 速度/身体同步旋转(-num20*direction,:49854-49855)
      {
        const r = -DUKE_SPIN_RATE * st.dir;
        const cos = Math.cos(r), sin = Math.sin(r);
        const nvx = e.vx * cos - e.vy * sin, nvy = e.vx * sin + e.vy * cos;
        e.vx = nvx; e.vy = nvy;
        e.spin -= DUKE_SPIN_RATE * st.dir;
      }
      e.ai2 += 1;
      if (e.ai2 >= DUKE.spinT) { e.ai0 = 5; e.ai1 = 0; e.ai2 = 0; }
      break;
    }
    case 8: dukeSharknado(e, game, player, st, true); break;           // :49865-49885
    case 9: { // expert 二段狂暴变身(:49886-49931;经典不可达,保留供 expert 接线)
      invuln = true;
      if (e.ai2 < DUKE.p2T - 90) e.spawnAlpha = clamp(e.spawnAlpha + (inSolid(game, e) ? 15 : -15), 0, 255);
      else e.spawnAlpha = Math.min(255, e.spawnAlpha + 4);
      e.vx *= 0.98;
      e.vy = lerp(e.vy, 0, 0.02);
      if (e.ai2 === DUKE.p2T - 60) game.playSfx('roar', 0.9);
      e.ai2 += 1;
      if (e.ai2 >= DUKE.p2T) { e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
      break;
    }
    case 10: { // expert 狂暴段悬浮(:49932-50018)
      if (player.dead) break;
      e.spawnAlpha = Math.min(255, e.spawnAlpha + 25); // 隐身逼近
      dukeHover(e, player, hoverAcc, hoverSpd, 360, st);
      e.ai2 += 1;
      if (e.ai2 >= hoverT) {
        const a3 = Math.floor(e.ai3);
        const next = (a3 === 0 || a3 === 2 || a3 === 3 || a3 === 5 || a3 === 6 || a3 === 7) ? 1 : 2;
        if (next === 1) dukeCharge(e, player, chargeSpd, 11, st);
        else { e.ai0 = 12; e.ai1 = 0; e.ai2 = 0; }
      }
      break;
    }
    case 11: { // expert 狂暴段冲撞(:50019-50047)
      e.spawnAlpha = Math.max(0, e.spawnAlpha - 25);
      game.spawnParticles(e.cx, e.cy, '#8FD8FF', 2, 1.5, { life: 18 });
      e.ai2 += 1;
      if (e.ai2 >= chargeT) { e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 += 1; }
      break;
    }
    case 12: { // expert 瞬移爆冲(:50048-50107)
      invuln = true;
      e.spawnAlpha = Math.min(255, e.spawnAlpha + 17);
      e.vx *= 0.98;
      e.vy = lerp(e.vy, 0, 0.02);
      if (e.ai2 === DUKE.teleT / 2) { // :50066-50093 中点瞬移到玩家另一侧
        if (e.ai1 === 0) e.ai1 = 300 * Math.sign(e.cx - player.cx || 1);
        e.x = player.cx - e.ai1 - e.w / 2;
        e.y = player.cy - 200 - e.h / 2;
        const s = Math.sign(player.cx - e.cx) || st.dir;
        st.dir = s; st.spr = -s;
        game.spawnParticles(e.cx, e.cy, '#8FD8FF', 14, 2.4, { life: 30 });
        game.playSfx('roar', 0.6);
      }
      e.ai2 += 1;
      if (e.ai2 >= DUKE.teleT) {
        e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 += 1;
        if (e.ai3 >= 9) e.ai3 = 0;
      }
      break;
    }
    case 13: { // expert 狂暴段旋转冲刺(:50108-50125;不吐泡泡)
      if (e.ai2 === 0) game.playSfx('roar', 0.6);
      {
        const r = -DUKE_SPIN_RATE * st.dir;
        const cos = Math.cos(r), sin = Math.sin(r);
        const nvx = e.vx * cos - e.vy * sin, nvy = e.vx * sin + e.vy * cos;
        e.vx = nvx; e.vy = nvy;
        e.spin -= DUKE_SPIN_RATE * st.dir;
      }
      e.ai2 += 1;
      if (e.ai2 >= DUKE.spinT) { e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 += 1; }
      break;
    }
    default: break;
  }
  if (invuln) e.iframes = 2;
  e.facing = st.spr;
  e.x += e.vx;
  e.y += e.vy;
}

/** 鲨鱼龙卷(状态 3 :49638-49660 / 状态 8 :49865-49885 共用):
 *  减速悬停,ai2==60 时发射龙卷水弹 proj 385(SharknadoBolt,原版伤害 0 的落地生成器)。
 *  简化:本工程无 385 落地生成龙卷+鲨鱼龙 372 寻的链,补一发 proj 407 直飞"鲨鱼"弹幕
 *  (伤害取 NPC 372 Sharkron 经典接触伤 100)近似龙卷出鲨。 */
function dukeSharknado(e: Enemy, game: GameHooks, player: Player, st: DukeX, big: boolean) {
  e.vx *= 0.98;
  e.vy = lerp(e.vy, 0, 0.02);
  if (e.ai2 === DUKE.nadoT - 30) {
    game.playSfx('roar', 0.7);
    if (big) {
      // 状态 8:原地一发(原版 ai0=1 即在自身处展开大龙卷,:49873-49876)
      shoot(game, e.cx, e.cy, 0, 2, 0, 385, 300);
    } else {
      // 状态 3:左右两发斜落(:49646-49651)
      shoot(game, e.cx, e.cy, st.dir * 2, 8, 0, 385, 300);
      shoot(game, e.cx, e.cy, -st.dir * 2, 8, 0, 385, 300);
    }
    // 鲨鱼弹幕(原版由龙卷持续生成 372;此为直飞近似)
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    for (let k = -1; k <= 1; k++) {
      shoot(game, e.cx, e.cy, (dx / d) * 9 + k * 2.5, (dy / d) * 9 + k * 1.2, 100, 407, 300);
    }
  }
  e.ai2 += 1;
  if (e.ai2 >= DUKE.nadoT) { e.ai0 = big ? 5 : 0; e.ai1 = 0; e.ai2 = 0; }
}

/** AI_070 爆裂泡泡(NPC 371,NPC.cs:35122-35195):
 *  朝玩家漂移(风偏+微上浮),玩家贴近(外扩 40px)或 150t 后爆炸(体积扩到 100×100,
 *  4t 后消散)。原版命中是 justHit→爆炸而非死亡;本工程近似为 hp 受损即转爆炸。
 *  简化:ai3 的随机 scale(:35134)无 Enemy 对应字段,仅记录不应用。 */
export function dukeBubbleAI(e: Enemy, game: GameHooks, player: Player | null) {
  void game;
  if (e.ai0 !== 1 && e.hp < e.maxHp) { e.ai0 = 1; e.ai1 = 4; e.hp = e.maxHp; } // justHit→爆
  if (!e.bInit && player) { // :35124-35131 初速 = 朝玩家 ±100px 随机偏移 × 11~17.7 速
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 0;
    e.ai3 = (80 + Math.random() * 41) / 100;
    const jx = e.cx - player.cx + (Math.random() - 0.5) * 200;
    const jy = e.cy - player.cy + (Math.random() - 0.5) * 200;
    const d = Math.hypot(jx, jy) || 1;
    const spd = (165 + Math.random() * 100) / 15;
    e.vx = -(jx / d) * spd;
    e.vy = -(jy / d) * spd;
    e.alphaFade = false;
    e.spawnAlpha = 50; // :35136-35140
  }
  if (player) {
    // :35132-35133 主漂移:v = (v*40 + dir*20)/41
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    e.vx = (e.vx * 40 + (dx / d) * 20) / 41;
    e.vy = (e.vy * 40 + (dy / d) * 20) / 41;
  }
  // :35141-35146 风扰+上浮(风取 0)
  e.vx = (e.vx * 50 + (Math.random() - 0.5) * 2) / 51;
  e.vy = (e.vy * 50 - 0.25 + (Math.random() - 0.5) * 4) / 51;
  if (e.vy > 0) e.vy -= 0.04;
  if (e.ai0 === 0 && player) { // :35147-35175 玩家贴近 → 爆炸
    const pad = 40 + e.w / 2;
    if (Math.abs(player.cx - e.cx) < pad + player.w / 2 && Math.abs(player.cy - e.cy) < pad + player.h / 2) {
      e.ai0 = 1; e.ai1 = 4;
    }
  }
  if (e.ai0 === 0) {
    e.ai1 += 1;
    if (e.ai1 >= 150) { e.ai0 = 1; e.ai1 = 4; } // :35167-35175 超时自爆
  } else {
    // 爆炸:体积扩到 100×100(:35187-35193)并 4t 后消散
    if (e.w !== 100) {
      e.x = e.cx - 50; e.y = e.cy - 50;
      e.w = 100; e.h = 100;
      game.spawnParticles(e.cx, e.cy, '#BFE8FF', 8, 2, { life: 20 });
    }
    e.iframes = 2; // dontTakeDamage
    e.ai1 -= 1;
    if (e.ai1 <= 0) { e.dead = true; return; }
  }
  e.x += e.vx;
  e.y += e.vy;
}

// ---------------------------------------------------------------------------
// 月亮领主 aiStyle 77 核心(NPC 398,NPC.cs:36774-37198)
// ---------------------------------------------------------------------------
// ai0:-1 出生演出(60t,生成 2×397 手 + 1×396 头)→ 0 一阶段(双手+头存活期间无敌,随玩家悬停)
//   → 1 二阶段(三部件全部闭眼(ai0=-2)后解除无敌,自主追玩家+弹幕循环)
//   → 2 死亡演出(600t 后真死,全族消散)/ 3 玩家全灭离场(60t 后全族清除)。
//   -2:远距(>2400px)传送归位后的短演出。

/** 二阶段弹幕表 = MoonLordAttacksArray2(:6966-6985,10 槽循环)。
 *  原版该表驱动 NPC 400 真眼(aiStyle 81,:38243-38264);真眼不在本次范围,
 *  攻击主链折叠到核心上执行(投射物 id/伤害取自 78/79/81 的原版发射调用)。 */
const ML_CORE_P2: ReadonlyArray<readonly [number, number]> = [
  [0, 90], [1, 90], [0, 90], [2, 135], [0, 90], [3, 200], [0, 90], [4, 375], [0, 90], [2, 135],
];

/** 朝玩家发射一发弹幕的通用出口(伤害/弹 id 全部来自原版 NewProjectile 调用点) */
function mlShoot(e: Enemy, game: GameHooks, player: Player, ox: number, oy: number,
  spd: number, dmg: number, projId: number) {
  const dx = player.cx - (e.cx + ox), dy = player.cy - (e.cy + oy);
  const d = Math.hypot(dx, dy) || 1;
  shoot(game, e.cx + ox, e.cy + oy, (dx / d) * spd, (dy / d) * spd, dmg, projId, 600);
}

/** 核心悬停移动(:36854-36865 / :36912-36923 同构):目标 = 玩家 + (0,130),8 速/0.5 步进+半程混合 */
function mlCoreHover(e: Enemy, player: Player) {
  const dx = player.cx - e.cx;
  const dy = player.cy + 130 - e.cy;
  if (Math.hypot(dx, dy) > 20) {
    const d = Math.hypot(dx - e.vx, dy - e.vy) || 1;
    flyLerp(e, ((dx - e.vx) / d) * 8, ((dy - e.vy) / d) * 8, 0.5);
  }
}

export function moonLordCoreAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = -1; e.ai1 = 0; e.ai2 = 0; } // :36780-36785
  // 原版 checkDead(:78859-78867):血尽 → ai0=2 死亡演出,满血续命 600t 后真死
  if (e.hp <= 0 && e.ai0 !== 2) { e.ai0 = 2; e.ai1 = 0; e.hp = e.maxHp; e.iframes = 2; }

  if (e.ai0 === -2) { // 远距传送归位(:36786-36809)
    e.iframes = 2;
    e.ai1 += 1;
    if (e.ai1 >= 60) { e.ai1 = 0; e.ai0 = 0; }
  } else if (e.ai0 === -1) { // 出生演出(:36810-36853)
    e.iframes = 2;
    e.ai1 += 1;
    if (e.ai1 >= 60) {
      e.ai1 = 0; e.ai0 = 0; e.ai2 = 0;
      // 生成双手 397(核心两侧 ±400)与头 396(上方 400);ai3 = 核心 id(锚定)
      for (let i = 0; i < 2; i++) {
        const h = spawnPart(game, e, 397);
        if (h) {
          h.x = e.cx + i * 800 - 400 - h.w / 2;
          h.y = e.cy - 100 - h.h / 2;
          h.ai0 = 0; h.ai1 = 0; h.ai2 = i; h.ai3 = e.id; h.bInit = true;
        }
      }
      const hd = spawnPart(game, e, 396);
      if (hd) {
        hd.x = e.cx - hd.w / 2;
        hd.y = e.cy - 400 - hd.h / 2;
        hd.ai0 = 0; hd.ai1 = 0; hd.ai2 = 0; hd.ai3 = e.id; hd.bInit = true;
      }
      game.playSfx('roar', 1);
    }
  } else if (e.ai0 === 0 || e.ai0 === 1) {
    // 三部件(锚定本核心)
    const parts = (game.enemies() as Enemy[]).filter(
      (n) => !n.dead && (n.vanillaId === 396 || n.vanillaId === 397) && n.ai3 === e.id);
    if (e.ai0 === 0) {
      e.iframes = 2; // dontTakeDamage(:36856)
      // 部件缺失 → 核心即毁(:36866-36890 flag84)
      if (parts.length < 3) { e.dead = true; return; }
      // 三部件全部闭眼残肢(ai0=-2)→ 解除无敌进二阶段(:36891-36909 flag85)
      if (parts.every((p) => p.ai0 === -2)) { e.ai0 = 1; e.ai1 = 0; }
    }
    if (player) mlCoreHover(e, player);
    if (e.ai0 === 1 && player) mlCoreBarrage(e, game, player); // 二阶段弹幕(真眼主链折叠)
  } else if (e.ai0 === 2) { // 死亡演出(:36925-37064)
    e.iframes = 2;
    e.vx = lerp(e.vx, 0, 0.02);
    e.vy = lerp(e.vy, -0.5, 0.02);
    e.ai1 += 1;
    // :36954-37022 每 3t 一簇爆炎(60t<ai1<580);:37049 起声效/光效略
    if (e.ai1 % 3 === 0 && e.ai1 > 60 && e.ai1 < 580) {
      game.spawnParticles(
        e.cx + (Math.random() - 0.5) * 400, e.cy + (Math.random() - 0.5) * 400,
        '#C04030', 6, 3, { life: 30 });
    }
    if (e.ai1 >= 600) { // :37053-37063 真死 → 全族由各部件 AI 检测 core.dead 自毁
      e.dead = true;
      return;
    }
  } else if (e.ai0 === 3) { // 玩家全灭离场(:37065-37135)
    e.iframes = 2;
    e.vx = lerp(e.vx, e.facing, 0.02);
    e.vy = lerp(e.vy, -0.5, 0.02);
    e.ai1 += 1;
    if (e.ai1 >= 60) { // :37109-37127 清除全部部件与自身
      for (const n of game.enemies() as Enemy[]) {
        if (!n.dead && (n.vanillaId === 396 || n.vanillaId === 397 || n.vanillaId === 400) && n.ai3 === e.id) n.dead = true;
      }
      e.dead = true;
      return;
    }
  }

  // 玩家全灭 → 离场(:37136-37161)
  if (!player && e.ai0 !== -1 && e.ai0 !== -2 && e.ai0 !== 2 && e.ai0 !== 3) { e.ai0 = 3; e.ai1 = 0; }
  // 玩家远距 >2400px → 全族瞬移归位(:37162-37197)
  if (player && e.ai0 >= 0 && e.ai0 < 2 && Math.hypot(player.cx - e.cx, player.cy - e.cy) > 2400) {
    const dx = player.cx - e.cx;
    const dy = player.cy - 150 - e.cy;
    e.x += dx; e.y += dy;
    for (const n of game.enemies() as Enemy[]) {
      if (!n.dead && (n.vanillaId === 396 || n.vanillaId === 397 || n.vanillaId === 400) && n.ai3 === e.id) {
        n.x += dx; n.y += dy;
      }
    }
    e.ai0 = -2; e.ai1 = 0;
  }
  e.x += e.vx;
  e.y += e.vy;
}

/** 核心二阶段弹幕(原版 NPC 400 真眼攻击链,aiStyle 81 :38347-38600;
 *  投射物/伤害取原版调用点:462 PhantasmalBolt 35(:38382)、454 PhantasmalSphere 40(:38455)、
 *  455 PhantasmalDeathray 75(:37913)、452 PhantasmalEye 30(:37333)) */
function mlCoreBarrage(e: Enemy, game: GameHooks, player: Player) {
  const { atk, inSlot, dur } = attackSlot(e, ML_CORE_P2);
  switch (atk) {
    case 1: // 幻影之眼 452×4 扇形(:37326-37334)
      if (inSlot === 0) {
        for (let k = -1.5; k <= 1.5; k++) {
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          const ang = Math.atan2(dy, dx) + k * 0.35;
          shoot(game, e.cx, e.cy, Math.cos(ang) * 8, Math.sin(ang) * 8, 30, 452, 600);
        }
      }
      break;
    case 2: // 幻影能量球 454:先慢速散出,后段朝玩家加速(原版 30t 后转向寻的,:38447-38456/:38475)
      if (inSlot === 0) {
        for (let k = 0; k < 3; k++) {
          const ang = -Math.PI / 2 + (k - 1) * 0.6;
          shoot(game, e.cx, e.cy, Math.cos(ang) * 4, Math.sin(ang) * 4, 40, 454, 600);
        }
      } else if (inSlot === 60) {
        for (let k = -1; k <= 1; k++) mlShoot(e, game, player, 0, 0, 12, 40, 454);
      }
      break;
    case 3: // 三连幻影矢 462(:38378-38383,slot 末 14/7/0 三发)
      if (inSlot === dur - 14 || inSlot === dur - 7 || inSlot === dur) {
        mlShoot(e, game, player, 0, 0, 8, 35, 462);
      }
      break;
    case 4: // 死亡之光 455(原版为持续扫射激光;直飞弹近似)
      if (inSlot === 0 || inSlot === 120 || inSlot === 240) {
        mlShoot(e, game, player, 0, 0, 7, 75, 455);
      }
      break;
    default: break; // 0 = 闭眼冷却 90t
  }
}

// ---------------------------------------------------------------------------
// 月亮领主 aiStyle 78 手(NPC 397,NPC.cs:37199-37711)
// ---------------------------------------------------------------------------
// 攻击时间表 MoonLordAttacksArray[0, ai2](:6854-6883):
//   ai2=0(左手,side=-1):[闭50, 眼70, 球330, 闭60, 矢90]
//   ai2=1(右手,side=+1):[眼70, 闭50, 矢90, 闭60, 球330]
// 攻击:0 闭眼悬停(无敌)/ 1 眼球环射 452(30 伤)/ 2 能量球扫射 454(40 伤,末段全数转向玩家)
//   / 3 三连幻影矢 462(30 伤,预判 20t)。
// 无敌语义:dontTakeDamage = frame>=21(:37215)——只有攻击中(睁眼)可受击。

const ML_HAND_ATTACKS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  0: [[0, 50], [1, 70], [2, 330], [0, 60], [3, 90]],
  1: [[1, 70], [0, 50], [3, 90], [0, 60], [2, 330]],
};

export function moonLordHandAI(e: Enemy, game: GameHooks, player: Player | null) {
  // 锚定核心;核心缺失/死亡 → 自毁(:37202-37207)
  const core = (game.enemies() as Enemy[]).find((n) => n.id === e.ai3 && n.vanillaId === 398);
  if (!core || core.dead) { e.dead = true; return; }
  // 原版 checkDead(:78845-78857):血尽 → ai0=-2 闭眼残肢(满血续命+无敌)+召真眼(此处折叠为核心弹幕)
  if (e.hp <= 0 && e.ai0 !== -2) { e.ai0 = -2; e.ai1 = 0; e.hp = e.maxHp; e.iframes = 2; }

  const x = handOf(e);
  const side = e.ai2 === 0 ? -1 : 1;  // num1231 :37208-37210
  e.facing = side;                    // spriteDirection

  // 攻击表推进(:37221-37251;ai0=-2 残肢态不参与调度)
  let inSlot = 0, dur = 0;
  if (e.ai0 !== -2) {
    e.ai1 += 1;
    const s = attackSlot(e, ML_HAND_ATTACKS[e.ai2 === 0 ? 0 : 1]);
    e.ai0 = s.atk; // :37245 原版 ai[0] 即攻击号(亦为手部状态)
    inSlot = s.inSlot; dur = s.dur;
  }
  let frameT = 0; // num1234(帧目标=frameT*7)

  if (e.ai0 === -2) { // 闭眼残肢(:37252-37280)
    frameT = 0;
    e.def.damage = 80; // :37254
    if (e.ai1 >= 32) e.ai1 = 0;
    handHover(e, core, side);
  } else if (e.ai0 === 0) { // 闭眼悬停(:37281-37303)
    frameT = 3;
    x.l1 = Math.max(0, x.l1 - 0.05);
    handHover(e, core, side);
  } else if (e.ai0 === 1 && player) { // 眼球环射(:37304-37346)
    frameT = 0;
    const cyc = 28; // num1240*num1241 = 7*4
    if (inSlot >= cyc * 2) {
      x.l1 = Math.max(0, x.l1 - 0.07);
    } else if (inSlot >= cyc) {
      x.l1 = Math.min(0.75, x.l1 + 0.05);
      const ang = (TAU * (inSlot % cyc)) / cyc - Math.PI / 2; // :37324
      x.l0 = Math.atan2(Math.sin(ang) * 66, Math.cos(ang) * 30);
      if (inSlot % 4 === 0) handFireEye(e, game, x, side); // :37326-37334 452(30 伤)
    } else {
      x.l1 = Math.min(0.75, x.l1 + 0.02);
      const ang = (TAU * (inSlot % cyc)) / cyc - Math.PI / 2;
      x.l0 = Math.atan2(Math.sin(ang) * 66, Math.cos(ang) * 30);
    }
  } else if (e.ai0 === 2) { // 能量球扫射(:37347-37447)
    const ax = core.cx + 220 * side + side * 100;   // vector168
    const ay = core.cy - 60 - 50;
    const swx = 400 * side, swy = -60;              // vector169
    if (inSlot < 30) {
      handApproach(e, ax, ay, 8, 0.2);
    } else if (inSlot < 210) {
      frameT = 1;
      if ((inSlot - 30) % 30 === 0 && player) { // :37372-37380 每 30t 一发 454(40 伤)
        const k = Math.floor((inSlot - 30) / 30);
        let vx = 5 * side + (k - 3.5) * side * 3;
        let vy = -8 + (k - 4.5);
        vx *= 1.2; vy *= 1.2;
        shoot(game, e.cx, e.cy, vx, vy, 40, 454, 600);
      }
      const t = smoothAmt((inSlot - 30) / 180);
      handSeek(e, ax + swx * t, ay + swy * t, 20, 0.5); // :37381-37387
    } else if (inSlot < 282) {
      frameT = 0;
      e.vx *= 0.9; e.vy *= 0.9;
    } else if (inSlot < 287) {
      frameT = 1;
      e.vx *= 0.9; e.vy *= 0.9;
    } else if (inSlot < 292) {
      frameT = 2;
      e.vx *= 0.9; e.vy *= 0.9;
    } else if (inSlot < 300) {
      frameT = 3;
      // :37407-37427 原版在此把本手全部 454 弹转向玩家(12 速);本工程投射物无寻的,
      // 近似为朝玩家补射 6 发 454(40 伤)
      if (inSlot === 292 && player) {
        for (let k = 0; k < 6; k++) {
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          const ang = Math.atan2(dy, dx) + (k - 2.5) * 0.18;
          shoot(game, e.cx, e.cy, Math.cos(ang) * 12, Math.sin(ang) * 12, 40, 454, 600);
        }
      }
      const t = 1 - (inSlot - 270) / 30;
      handSeek(e, ax + swx * smoothAmt(t), ay + swy * smoothAmt(t), 14, 0.1); // :37428-37434
    } else {
      frameT = 3;
      handApproach(e, ax, ay, 8, 0.2); // :37436-37446 归位
    }
  } else if (e.ai0 === 3 && player) { // 三连幻影矢(:37448-37472)
    frameT = 0;
    const pvx = (player as unknown as { vx: number }).vx ?? 0;
    const pvy = (player as unknown as { vy: number }).vy ?? 0;
    const dx = player.cx + pvx * 20 - e.cx, dy = player.cy + pvy * 20 - e.cy; // :37455 预判 20t
    x.l0 = angleLerp(x.l0, Math.atan2(dy, dx), 0.5);
    x.l1 = Math.min(1, x.l1 + 0.05);
    if (inSlot === dur - 35) game.playSfx('roar', 0.5); // :37462-37465
    if (inSlot === dur - 14 || inSlot === dur - 7 || inSlot === dur) {
      // :37466-37471 从眼球位置射 462(30 伤,8 速)
      const exx = Math.cos(x.l0) * 30 * x.l1, eyy = Math.sin(x.l0) * 66 * x.l1;
      const d = Math.hypot(dx, dy) || 1;
      shoot(game, e.cx + exx, e.cy + eyy, (dx / d) * 8, (dy / d) * 8, 30, 462, 600);
    }
  }

  // 睁闭眼帧推进(:37493-37509):每 tick 向目标帧走 1,dontTakeDamage = frame>=21
  const frameTarget = frameT * 7;
  if (frameTarget > x.frame) x.frame += 1;
  else if (frameTarget < x.frame) x.frame -= 1;
  x.frame = clamp(x.frame, 0, 21);

  // 位置钳制(:37473-37492):下一位置锁在核心侧上方盒内
  let minX = core.cx + 220 * side + 110 * side, minY = core.cy - 60 - 150;
  let maxX = minX + 370 * side, maxY = minY + 150;
  if (minX > maxX) { const t = minX; minX = maxX; maxX = t; }
  if (minY > maxY) { const t = minY; minY = maxY; maxY = t; }
  const nx = clamp(e.cx + e.vx, minX, maxX);
  const ny = clamp(e.cy + e.vy, minY, maxY);
  e.x = nx - e.w / 2;
  e.y = ny - e.h / 2;

  // 无敌:闭眼(frame>=21)或残肢态;可受击时不写 iframes,保留 hurt() 的 8t 受击免疫
  if (x.frame >= 21 || e.ai0 === -2) e.iframes = 2;
  e.spin = x.l0; // 手部眼球角度(渲染朝向)
}

/** 手部悬停(:37266-37279 / :37289-37302):核心侧上方 (350*side, -100),6 速/0.3 步进+半程混合 */
function handHover(e: Enemy, core: Enemy, side: number) {
  const dx = core.cx + 350 * side - e.cx;
  const dy = core.cy - 100 - e.cy;
  const d = Math.hypot(dx, dy);
  if (d > 20) flyLerp(e, (dx / d) * 6, (dy / d) * 6, 0.3);
}
/** SmoothStep 趋近(:37358-37367 / :37438-37445):velocity = SmoothStep(v, normalize(delta)*min(spd,|delta|), k) */
function handApproach(e: Enemy, tx: number, ty: number, spd: number, k: number) {
  const dx = tx - e.cx, dy = ty - e.cy;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const m = Math.min(spd, d);
  e.vx = vSmoothStep(e.vx, (dx / d) * m, k);
  e.vy = vSmoothStep(e.vy, (dy / d) * m, k);
}
/** 扫射段追随(:37381-37387 / :37428-37434):Lerp(v, normalize(delta)*min(spd,|delta|), k) */
function handSeek(e: Enemy, tx: number, ty: number, spd: number, k: number) {
  const dx = tx - e.cx, dy = ty - e.cy;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  e.vx = lerp(e.vx, (dx / d) * Math.min(spd, d), k);
  e.vy = lerp(e.vy, (dy / d) * Math.min(spd, d), k);
}
/** 眼球环射一发 452(:37326-37334):从眼球椭圆外沿射出,沿眼球朝向 8 速,30 伤 */
function handFireEye(e: Enemy, game: GameHooks, x: HandX, side: number) {
  const exx = Math.cos(x.l0) * 30 * x.l1, eyy = Math.sin(x.l0) * 66 * x.l1;
  const d = Math.hypot(exx, eyy) || 1;
  const px = e.cx + (exx / d) * 72.46 * 0.4 - side; // |vector159|=√(30²+66²)≈72.46(:37330)
  const py = e.cy + (eyy / d) * 72.46 * 0.4 + 3;
  shoot(game, px, py, (exx / d) * 8, (eyy / d) * 8, 30, 452, 600);
}

// ---------------------------------------------------------------------------
// 月亮领主 aiStyle 79 头(NPC 396,NPC.cs:37712-38128)
// ---------------------------------------------------------------------------
// 恒定悬停在核心正上方 400px(无自主移动);攻击表 MoonLordAttacksArray[0,2](:6874-6883):
//   [矢180, 闭30, 吸血435, 矢180, 光375]。
// 攻击:0 睁眼瞄准(无敌)/ 1 死亡之光 455(75 伤,:37902-37916)/ 2 月噬 456(0 伤,:37957-37973)
//   / 3 三连幻影矢 462(30 伤,:37991-38015)。-2 闭眼残肢(80 接触伤)/ -3 核心死亡后永闭。
// 无敌语义:dontTakeDamage = localAI[3]>=15(:37724)。

const ML_HEAD_ATTACKS: ReadonlyArray<readonly [number, number]> = [
  [3, 180], [0, 30], [2, 435], [3, 180], [1, 375],
];

export function moonLordHeadAI(e: Enemy, game: GameHooks, player: Player | null) {
  const core = (game.enemies() as Enemy[]).find((n) => n.id === e.ai3 && n.vanillaId === 398);
  if (!core || core.dead) { e.dead = true; return; } // :37714-37719
  // checkDead(:78845-78857)同手:血尽 → ai0=-2 闭眼残肢
  if (e.hp <= 0 && e.ai0 !== -2 && e.ai0 !== -3) { e.ai0 = -2; e.ai1 = 0; e.ai2 = 0; e.hp = e.maxHp; e.iframes = 2; }

  const x = headOf(e);
  e.vx = 0; e.vy = 0; // :37725
  e.x = core.cx - e.w / 2; // :37726 恒定在核心上方 400px
  e.y = core.cy - 400 - e.h / 2;

  // 攻击表推进(:37732-37762;ai0<0 不参与)
  let inSlot = 0, dur = 0;
  if (e.ai0 >= 0) {
    e.ai1 += 1;
    const s = attackSlot(e, ML_HEAD_ATTACKS);
    e.ai0 = s.atk; // :37756 原版 ai[0] 即攻击号(亦为头部状态)
    inSlot = s.inSlot; dur = s.dur;
  }
  let f2T = 0, f3T = 0; // num1262/num1263(帧目标 = f2T*7 / f3T*5)

  if (e.ai0 === -3) { // 核心死亡后永闭(:37763-37781;由 -2 分支转入 :37784-37788)
    e.def.damage = 0;
    e.spin = lerp(e.spin, Math.PI / 12, 0.07);
    if (e.ai1 >= 32) e.ai1 = 0;
    if (x.f2 < 14) x.f2 += 1;
    e.iframes = 2;
    return;
  }
  if (e.ai0 === -2) { // 闭眼残肢(:37782-37844)
    if (core.ai0 === 2) { e.ai0 = -3; return; } // :37784-37788
    e.def.damage = 80;
    e.iframes = 2;
    if (e.ai1 >= 32) e.ai1 = 0;
    e.ai2 += 1;
    if (e.ai2 >= 555) e.ai2 = 0;
    if (e.ai2 >= 120 && player) { // :37805-37843 残肢期月噬循环
      const lt = e.ai2 - 120;
      if (lt === 0) { // :37811-37827 从额前 216px 发月噬 456(0 伤,纯吸血视觉)
        const dx = player.cx - e.cx, dy = player.cy - (e.cy + 216);
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, e.cx, e.cy + 216, (dx / d) * 6, (dy / d) * 6, 0, 456, 600);
      }
      // :37828-37842 原版在 lt=120/180/240 于玩家处召 401 月噬怪;不在本次范围,略
    }
    return;
  }

  if (e.ai0 === 0 && player) { // 睁眼瞄准(:37845-37864)
    f3T = 3;
    const dx = player.cx - e.cx, dy = player.cy + 22 - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    x.l0 = Math.atan2(dy, dx);
    x.l1 = Math.min(1, Math.max(0, (1 - Math.min(1, d / 500)) * 2)); // :37850-37860
    x.l2 = lerp(x.l2, 1, 0.2);
  } else if (e.ai0 === 1 && player) { // 死亡之光(:37865-37952)
    if (inSlot < 180) {
      x.l1 = Math.max(0, x.l1 - 0.05);
      if (inSlot >= 60) { // :37876-37898 聚能尘
        game.spawnParticles(
          e.cx + (Math.random() - 0.5) * 27, e.cy + (Math.random() - 0.5) * 59, '#B040C0', 2, 1.2, { life: 24 });
      }
    } else if (inSlot < dur - 15) {
      // :37902-37916 原版发射 455 死亡之光(75 伤)并以 2π/540 每t 扫射;
      // 本工程投射物无持续扫射,按发射方向(∓60° 预偏)直飞近似,逐t 扫射略
      if (inSlot === 180) {
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        const n = dx / d < 0 ? 1 : -1; // num1278
        const ang = Math.atan2(dy, dx) - n * (TAU / 6);
        shoot(game, e.cx, e.cy, Math.cos(ang) * 9, Math.sin(ang) * 9, 75, 455, 600);
        game.playSfx('roar', 0.8);
      }
      x.l1 = Math.min(1, x.l1 + 0.05);
    } else {
      f3T = 3;
      x.l1 = Math.max(0, x.l1 - 0.07);
    }
  } else if (e.ai0 === 2) { // 月噬(:37953-37990)
    f2T = 2;
    f3T = 3;
    if (inSlot === 0 && player) { // :37958-37973 额前 216px 朝玩家月噬 456(0 伤)
      const dx = player.cx - e.cx, dy = player.cy - (e.cy + 216);
      const d = Math.hypot(dx, dy) || 1;
      shoot(game, e.cx, e.cy + 216, (dx / d) * 6, (dy / d) * 6, 0, 456, 600);
    }
    // :37975-37989 原版在 inSlot=120/180/240 召 401;不在本次范围,略
  } else if (e.ai0 === 3 && player) { // 三连幻影矢(:37991-38015)
    const pvx = (player as unknown as { vx: number }).vx ?? 0;
    const pvy = (player as unknown as { vy: number }).vy ?? 0;
    const dx = player.cx + pvx * 20 - e.cx, dy = player.cy + pvy * 20 - e.cy;
    x.l0 = angleLerp(x.l0, Math.atan2(dy, dx), 0.5);
    x.l1 = Math.min(1, x.l1 + 0.05);
    if (inSlot === dur - 35) game.playSfx('roar', 0.5);
    if (inSlot === dur - 14 || inSlot === dur - 7 || inSlot === dur) {
      // 眼球椭圆 (27,59)(:37727 vector200),8 速 30 伤
      const exx = Math.cos(x.l0) * 27 * x.l1, eyy = Math.sin(x.l0) * 59 * x.l1;
      const d = Math.hypot(dx, dy) || 1;
      shoot(game, e.cx + exx, e.cy + eyy, (dx / d) * 8, (dy / d) * 8, 30, 462, 600);
    }
  }

  // 帧推进(:38016-38049;注:原版 :38042-38048 钳制误写 localAI[2],此处按语义钳 [3])
  const f2Target = f2T * 7, f3Target = f3T * 5;
  if (f2Target > x.f2) x.f2 += 1; else if (f2Target < x.f2) x.f2 -= 1;
  x.f2 = clamp(x.f2, 0, 14);
  if (f3Target > x.f3) x.f3 += 1; else if (f3Target < x.f3) x.f3 -= 1;
  x.f3 = clamp(x.f3, 0, 15);
  if (x.f3 >= 15) e.iframes = 2; // dontTakeDamage = localAI[3]>=15(闭眼无敌)
  e.spin = x.l0;
}
