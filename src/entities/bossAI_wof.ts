// 血肉墙 Boss 族 1:1 移植(Terarria1456 NPC.cs ilspycmd 反编译,经典模式参数):
//   aiStyle 27 血肉墙本体 113  → NPC.cs:25718-26140 → wallOfFleshAI
//   aiStyle 28 血肉墙之眼 114  → NPC.cs:26141-26298 → wofEyeAI
//   aiStyle 29 饥饿者   115  → NPC.cs:26299-26496 → hungryAI
//   (Hungry II 116 = aiStyle 2 飘浮眼,已有 floatEyeAI,不在此文件)
//
// 与原版的两处结构性差异(无 Main 静态/无 whoAmI 槽位):
//   1. 原版部件靠 Main.wofNPCIndex / realLife 锚定头(NewNPC 的 Start 只是槽位搜索
//      起点,NPC.cs:81524-81559 不写 ai[])→ 这里用闲置 ai 槽存头实体 id 锚定:
//      之眼 ai1(其状态机只占 ai0)、饥饿者 ai3(其 ai1 被原版用作脱落倒计时),
//      同 bossAI.ts primePartAI 的 find head 模式;头失效/死亡 → 部件自毁。
//   2. Main.wofDrawAreaTop/Bottom 是 Main 静态(同屏只有一只血肉墙)→ 模块级变量,
//      由墙初始化(localAI[0]==0 分支,:25726-25731)复位。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { spawnPart, shoot, losClear } from './bossAI';

// Main.wofDrawAreaTop/Bottom(NPC.cs Main 静态;单只血肉墙语义,墙初始化时复位 -1)
let wofDrawAreaTop = -1;
let wofDrawAreaBottom = -1;

// ---- 每实体辅助槽(原版 localAI[1..3],Enemy 只有 ai0-ai3 且 ai1/ai2 被 AI 主链占用) ----
interface WallLocals { despawnT: number; roarT: number }        // localAI[1] / localAI[3]
interface EyeLocals { charge: number; burst: number; lastHeadHp: number } // localAI[1]/[2] + 血量同步基线
const wallLocals = new WeakMap<Enemy, WallLocals>();
const eyeLocals = new WeakMap<Enemy, EyeLocals>();
const wallLocalOf = (e: Enemy): WallLocals => {
  let l = wallLocals.get(e);
  if (!l) { l = { despawnT: 0, roarT: 0 }; wallLocals.set(e, l); }
  return l;
};
const eyeLocalOf = (e: Enemy): EyeLocals => {
  let l = eyeLocals.get(e);
  if (!l) { l = { charge: 0, burst: 0, lastHeadHp: 0 }; eyeLocals.set(e, l); }
  return l;
};

/** 伤害/防御基值缓存(ai29 每 tick 从基值派生临时修正,防重复乘膨胀;同 bossAI.baseOf) */
const baseStats = new WeakMap<Enemy, { dmg: number; def: number }>();
const baseOf = (e: Enemy) => {
  let b = baseStats.get(e);
  if (!b) { b = { dmg: e.def.damage, def: e.def.defense ?? 0 }; baseStats.set(e, b); }
  return b;
};

/** 锚定槽:之眼用 ai1(其状态机只占 ai0),饥饿者用 ai3(其 ai1 被原版用作脱落倒计时) */
const headAnchor = (e: Enemy): number => (e.vanillaId === 115 ? e.ai3 : e.ai1);

/** 按锚定槽找血肉墙本体(原版 Main.wofNPCIndex;头失效 → 部件自毁) */
const headOf = (e: Enemy, game: GameHooks): Enemy | null => {
  const head = (game.enemies() as Enemy[]).find((n) => n.id === headAnchor(e) && !n.dead);
  if (!head || head.vanilla?.aiStyle !== 27) return null;
  return head;
};

const countType = (game: GameHooks, id: number): number =>
  (game.enemies() as Enemy[]).filter((n) => n.vanillaId === id && !n.dead).length; // 原版 CountNPCS

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 原版 UnderworldLayer = maxTilesY-200(World.lavaLine,TerrainPass 设定;0=未知回退) */
const underworldLayer = (game: GameHooks): number => {
  const lava = game.world.lavaLine;
  return lava > 0 ? lava : game.world.store.h - 200;
};

/** 朝 (tx,ty) 的喷口旋转角(墙/之眼共用,:26050-26079 / :26183-26206):
 *  dx/dy 先乘回距离(原版 num387*=num389,喂 atan2 不归一),玩家在推进方向前侧才瞄准,
 *  否则贴回 0(嘴/眼朝前)。返回 [rotation, flag](flag=是否在前侧) */
function mouthRotation(e: Enemy, player: { cx: number; cy: number }): [number, boolean] {
  let dx = player.cx - e.cx, dy = player.cy - e.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  dx *= dist; dy *= dist;
  if (e.facing > 0) {
    if (player.cx > e.cx) return [Math.atan2(-dy, -dx) + Math.PI, true];
    return [0, false];
  }
  if (player.cx < e.cx) return [Math.atan2(dy, dx) + Math.PI, true];
  return [0, false];
}

// ================= aiStyle 27 血肉墙本体 113(NPC.cs:25718-26140) =================

/** ai[1]=Leech 计时 / ai[2]=Leech 轮次 / ai3=localAI[0](1=区域已初始化 2=部件已生成)。
 *  水平恒速推进(血量越低越快),Y 吸附到地狱空腔竖直中点(wofDrawArea);
 *  定期从口中涌出 Leech 117;低于半血计时加速;玩家死 180t 后自毁离场。
 *  移动自行积分:Y 直接吸附(velocity.Y 分支被 :25977 覆盖),X 沿 vx 推进。 */
export function wallOfFleshAI(e: Enemy, game: GameHooks, player: Player | null) {
  const st = game.world.store;
  // :25719-25722 推出世界两侧 → 自毁
  if (e.x < 160 || e.x > (st.w - 10) * TILE) { e.dead = true; return; }
  const L = wallLocalOf(e);
  // :25726-25731 localAI[0]==0 → 初始化,draw 区域复位 -1
  if (e.ai3 === 0) { e.ai3 = 1; wofDrawAreaBottom = -1; wofDrawAreaTop = -1; }
  // :25733-25790 getGoodWorld 随机刷 Hoplite(24):FTW 专属,不实现

  // ---- Leech 计时(:25792-25800):ai1 每 tick +1;ai2==0 时低血额外 +1(<50%)/+1(<20%);
  //      满 2700 → ai2=1(进入放虫轮) ----
  e.ai1 += 1;
  if (e.ai2 === 0) {
    if (e.hp < e.maxHp * 0.5) e.ai1 += 1;
    if (e.hp < e.maxHp * 0.2) e.ai1 += 1;
    if (e.ai1 > 2700) e.ai2 = 1;
  }
  // ---- Leech 放虫(:25802-25827):ai2>0 且 ai1>60 时,每 60t 出 1 只(计数 <10);
  //      一轮 3 只(血 <30% 时 4 只),轮满 ai2 回 0 重新攒 2700t ----
  const num369 = 60;
  if (e.ai2 > 0 && e.ai1 > num369) {
    let num370 = 3;
    if (e.hp < e.maxHp * 0.3) num370++;
    e.ai2 += 1;
    e.ai1 = 0;
    if (e.ai2 > num370) e.ai2 = 0;
    if (countType(game, 117) < 10) {
      const leech = spawnPart(game, e, 117); // 117 aiStyle 6 蠕虫,已有实现
      if (leech) {
        // :25818 坐标是底部中心(NewNPC Bottom 锚点,NPC.cs:81547):中心 X、墙中心下 20
        leech.x = e.cx - leech.w / 2;
        leech.y = e.y + e.h / 2 + 20 - leech.h;
        leech.vx = e.facing * 8; // :25820 沿推进方向甩出
      }
    }
  }
  // ---- :25828-25836 localAI[3] 吼叫计时(600-1600t 随机,负值冷却) ----
  L.roarT += 1;
  if (L.roarT >= 600 + Math.random() * 1000) {
    L.roarT = -Math.random() * 200;
    game.playSfx('roar', 0.8); // 原版 SoundID 4/style 10(WoF 尖啸),音效资源映射由主会话定
  }

  // ---- 地狱空腔上下沿扫描(:25837-25965) ----
  const underworld = underworldLayer(game);       // Main.UnderworldLayer
  const num372 = underworld + 10;                 // 允许带顶部
  const num373 = num372 + 70;                     // 允许带底部(共 70 格)
  const num374 = Math.floor(e.x / TILE);          // 墙左沿 tile
  const num375 = Math.floor((e.x + e.w) / TILE);  // 墙右沿 tile
  const num376 = Math.floor((e.y + e.h / 2) / TILE); // 墙中心行
  // 单行内实心/液体 tile 计数(:25866-25877 / :25902-25913;原版 try/catch 出界 +15 不移植)
  const rowHits = (y: number): number => {
    let c = 0;
    for (let x = num374; x <= num375; x++) {
      if (st.inBounds(x, y) && (st.isSolid(x, y) || st.liquid[st.idx(x, y)] > 0)) c++;
    }
    return c;
  };
  // 底沿:从中心行 +7 向下累计 15 个实心/液体(:25851-25882)
  let hits = 0;
  let yScan = num376 + 7;
  while (hits < 15 && yScan > underworld) {
    yScan++;
    if (yScan > st.h - 10) { yScan = st.h - 10; break; }
    if (yScan < num372) continue;
    hits += rowHits(yScan);
  }
  yScan += 4; // 再让出 4 格
  wofDrawAreaBottom = approachPx(wofDrawAreaBottom, yScan * TILE); // :25884-25895 每 tick ±1 平滑
  // 顶沿:从中心行 -7 向上累计 15 个(:25897-25935)
  hits = 0;
  yScan = num376 - 7;
  while (hits < 15 && yScan < st.h - 10) {
    yScan--;
    if (yScan <= 10) { yScan = 10; break; }
    if (yScan > num373) continue;
    if (yScan < num372) { yScan = num372; break; }
    hits += rowHits(yScan);
  }
  yScan -= 4;
  wofDrawAreaTop = approachPx(wofDrawAreaTop, yScan * TILE); // :25918-25929
  // :25930-25939 钳到允许带 [num372, num373]
  wofDrawAreaTop = Math.round(clamp(wofDrawAreaTop, num372 * TILE, num373 * TILE));
  wofDrawAreaBottom = Math.round(clamp(wofDrawAreaBottom, num372 * TILE, num373 * TILE));
  // :25940-25946 上下沿间距保底 160px
  if (wofDrawAreaTop > wofDrawAreaBottom - 160) wofDrawAreaTop = wofDrawAreaBottom - 160;
  else if (wofDrawAreaBottom < wofDrawAreaTop + 160) wofDrawAreaBottom = wofDrawAreaTop + 160;

  // ---- Y 吸附空腔竖直中点(:25948-25977;velocity.Y 的 ±1 分支随即被覆盖,语义即吸附) ----
  const num381 = (wofDrawAreaBottom + wofDrawAreaTop) / 2 - e.h / 2;
  e.y = num381;

  // ---- 推进速度(:25979-25994 经典档):1.5 起,血量阈值逐档加成 ----
  let num382 = 1.5;
  if (e.hp < e.maxHp * 0.75) num382 += 0.25;
  if (e.hp < e.maxHp * 0.5) num382 += 0.4;
  if (e.hp < e.maxHp * 0.25) num382 += 0.5;
  if (e.hp < e.maxHp * 0.1) num382 += 0.6;
  // :25995-26011 expert(<66%+0.3/<33%+0.3/<5%+0.6/<3.5%+0.6,整体 ×1.35+0.35)与
  //        getGoodWorld(×1.1+0.2)分支:不实现

  // ---- 推进方向(:26013-26029):vx==0(首帧)按玩家侧定向;此后恒沿 direction 定速 ----
  if (e.vx === 0) {
    // TargetClosest(:26014;玩家死亡时改选存活玩家侧,:26016-26027 多人分支不适用)
    e.facing = player && player.cx >= e.cx ? 1 : -1;
    e.vx = e.facing;
  }
  if (e.vx < 0) { e.vx = -num382; e.facing = -1; }
  else { e.vx = num382; e.facing = 1; }

  // ---- 玩家死亡 → 3 秒自毁离场(:26031-26048 localAI[1] 1/180 爬满即死) ----
  if (!player || player.dead) {
    L.despawnT += 1 / 180;
    if (L.despawnT >= 1) {
      game.playSfx('roar', 0.8);
      e.hp = 0;
      e.dead = true;
      return;
    }
  } else {
    L.despawnT = clamp(L.despawnT - 1 / 30, 0, 1);
  }

  // ---- 喷口朝向(:26050-26079) ----
  if (player) e.spin = mouthRotation(e, player)[0];

  // ---- :26081-26125 expert 模式按玩家距离重生 Hungry(115,挑未占用的 ai0 槽位):不实现 ----

  // ---- 首帧部件生成(:26127-26140 localAI[0]==1 时执行一次):
  //      双眼 114(上眼 ai0=1 贴顶沿半程 / 下眼 ai0=-1 贴底沿半程)+ 11 只 Hungry 115
  //      (ai0 = k*0.1-0.05 沿空腔竖向均布)。眼 ai1 / Hungry ai3 = 头实体 id 锚定
  //      (见文件头说明与 hungryAI 注释) ----
  if (e.ai3 === 1) {
    e.ai3 = 2;
    // 生成坐标均为底部中心(NewNPC Bottom 锚点,NPC.cs:81547):X = 墙左沿,Y = 给定值
    const eyeTop = spawnPart(game, e, 114);
    if (eyeTop) {
      eyeTop.x = e.x; eyeTop.y = (e.cy + wofDrawAreaTop) / 2 - eyeTop.h;
      eyeTop.ai0 = 1; eyeTop.ai1 = e.id; eyeTop.bInit = true;
    }
    const eyeBottom = spawnPart(game, e, 114);
    if (eyeBottom) {
      eyeBottom.x = e.x; eyeBottom.y = (e.cy + wofDrawAreaBottom) / 2 - eyeBottom.h;
      eyeBottom.ai0 = -1; eyeBottom.ai1 = e.id; eyeBottom.bInit = true;
    }
    const hungryY = (e.cy + wofDrawAreaBottom) / 2;
    for (let k = 0; k < 11; k++) {
      const h = spawnPart(game, e, 115);
      if (h) { h.x = e.x; h.y = hungryY - h.h; h.ai0 = k * 0.1 - 0.05; h.ai3 = e.id; h.bInit = true; }
    }
  }

  // 水平推进(AI 自行积分;Y 已吸附,不积分)
  e.x += e.vx;
}

/** draw 区域每 tick ±1 平滑逼近(:25884-25895 / :25918-25929;首次直接取值) */
function approachPx(cur: number, target: number): number {
  if (cur === -1) return target;
  if (cur > target) { cur--; if (cur < target) cur = target; }
  else if (cur < target) { cur++; if (cur > target) cur = target; }
  return cur;
}

// ================= aiStyle 28 血肉墙之眼 114(NPC.cs:26141-26298) =================

/** ai0 = ±1(1=上眼 -1=下眼),ai1 = 头实体 id。
 *  X 钉在墙上、Y 在空腔上半/下半程的中点吸附(±1 步进,±5 钳);
 *  蓄能 600t 后进入激光连射(经典 4 连,低血加档;45t 间隔 + 视线检查),
 *  眼激光 Projectile 83(速 9 起/伤 11 起,低血加档)。血量与墙共享(realLife)。 */
export function wofEyeAI(e: Enemy, game: GameHooks, player: Player | null) {
  const head = headOf(e, game);
  // :26142-26146 Main.wofNPCIndex<0(墙已不在)→ 自毁
  if (!head) { e.dead = true; return; }
  const L = eyeLocalOf(e);
  // :26147-26152 realLife 血量共享:眼受到的伤害回流墙(原版 StrikeNPC 按 realLife 转移),
  // 再镜像墙血量。回流判定:仅当墙自身血量本 tick 未变(head.hp == 上次同步值)且眼血
  // 低于同步值时才算"眼的独立伤害"(墙血只单调降,被回补/改档时不得误判)
  if (head.hp === L.lastHeadHp && e.hp < head.hp) head.hp = e.hp;
  L.lastHeadHp = head.hp;
  if (head.hp > 0) { e.hp = head.hp; e.maxHp = head.maxHp; }

  // :26157-26159 X 钉在墙左沿,朝向随墙
  e.x = head.x;
  e.facing = head.facing;
  // :26161-26167 Y 目标:空腔中点向上/下半程取中(上眼贴顶 / 下眼贴底)
  const mid = (wofDrawAreaBottom + wofDrawAreaTop) / 2;
  const ty = (e.ai0 > 0 ? (mid + wofDrawAreaTop) / 2 : (mid + wofDrawAreaBottom) / 2) - e.h / 2;
  if (e.y > ty + 1) e.vy = -1;
  else if (e.y < ty - 1) e.vy = 1;
  else { e.vy = 0; e.y = ty; }
  e.vy = clamp(e.vy, -5, 5); // :26177-26182

  // :26183-26206 喷口朝向(仅玩家在前侧时瞄准)
  let front = false;
  if (player) [e.spin, front] = mouthRotation(e, player);

  // ---- 激光(:26211-26296) ----
  // :26213-26235 连射发数与蓄能速率随墙血量加档(经典)
  let num409 = 4;   // 一轮发数
  L.charge += 1;
  if (head.hp < head.maxHp * 0.75) { L.charge += 1; num409++; }
  if (head.hp < head.maxHp * 0.5) { L.charge += 1; num409++; }
  if (head.hp < head.maxHp * 0.25) { L.charge += 1; num409 += 2; }
  if (head.hp < head.maxHp * 0.1) { L.charge += 2; num409 += 3; }
  // :26236-26242 expert(整体 +1 档,<10% 再 +3):不实现
  if (L.burst === 0) {
    // 蓄能段(:26245-26249):满 600t → 进连射
    if (L.charge > 600) { L.burst = 1; L.charge = 0; }
  } else if (player && L.charge > 45 && losClear(game, e.x, e.y, player.x, player.y)) {
    // 连射段(:26252-26262):45t 一发,需视线(Collision.CanHit);发满一轮回蓄能
    L.charge = 0;
    L.burst += 1;
    if (L.burst >= num409) L.burst = 0;
    if (front) {
      // :26264-26296 眼激光 83:速 9 / 伤 11 起,低血加档(:26268-26276)
      let num410 = 9;
      let num411 = 11;
      if (head.hp < head.maxHp * 0.5) { num411++; num410 += 1; }
      if (head.hp < head.maxHp * 0.25) { num411++; num410 += 1; }
      if (head.hp < head.maxHp * 0.1) { num411 += 2; num410 += 2; }
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      const vx = (dx / d) * num410, vy = (dy / d) * num410;
      // 出膛点 = 眼中心 + 单位速度(:26278-26286);83 原版 timeLeft 600/extraUpdates 2
      // (Projectile.cs:1360-1370),本仓 Arrow 未建模 extraUpdates,按原速直飞
      shoot(game, e.cx + vx, e.cy + vy, vx, vy, num411, 83, 600);
    }
  }

  // 移动自行积分:X 已钉墙,仅 Y 步进
  e.y += e.vy;
}

// ================= aiStyle 29 饥饿者 115(NPC.cs:26299-26496) =================

/** ai0 = 沿空腔竖向的挂点比例(墙生成时 -0.05..0.95 均布),ai1 = 脱落倒计时(0=挂墙),
 *  ai2 = 环绕半径爆发计时(100-200 内 ×1.3,200 复位)。ai3 = 头实体 id 锚定
 *  (原版无此槽语义,靠 Main.wofNPCIndex;见文件头说明)。
 *  挂墙(ai1==0):绕锚点(墙中心 X, 空腔顶 + 跨度×ai0)以 ±0.1 步进追"锚点 + 朝玩家
 *  偏移(钳到半径 num415)",速度钳 ±4(经典);受击 → ai1=10 脱落数 tick 自由飞行;
 *  墙血 <75%/<50% 时半径 300→500→700、伤害 45/60、防御 20/30。 */
export function hungryAI(e: Enemy, game: GameHooks, player: Player | null) {
  // :26299-26301 justHit（受击单帧旗标，hurt() 置位）→ ai[1]=10（脱落 10t 后回挂墙态）
  if (e.justHit) e.ai1 = 10;
  const head = headOf(e, game);
  // :26303-26306 Main.wofNPCIndex<0(墙已不在)→ 自毁
  if (!head) { e.dead = true; return; }
  // ai0 初值 -1120(史莱姆语义)复位:非墙生成的 Hungry 挂空腔中点
  if (!e.bInit) { e.bInit = true; if (e.ai0 < -1000) e.ai0 = 0.5; }

  // :26308-26335 挂墙半径/伤害/防御随墙血量变化(经典档;expert 的 defense 恢复与
  //        槽位倍率 :26337-26358 不实现)
  let num414 = 0.1;   // 步进
  let num415 = 300;   // 挂墙半径
  const b = baseOf(e);
  e.def.damage = b.dmg; // :26311 damage = defDamage(每 tick 复位)
  let num416 = 0;
  if (head.hp < head.maxHp * 0.5) {
    num416 = 60;
    e.def.defense = 30;
    num415 = 700;
  } else if (head.hp < head.maxHp * 0.75) {
    num416 = 45;
    e.def.defense = 20;
    num415 = 500;
  } else {
    e.def.defense = b.def;
  }
  if (num416 > 0) e.def.damage = num416; // :26333-26335 GetAttackDamage_ScaledByDifficulty 经典=原值

  // ---- 锚点(:26360-26362):墙中心 X,空腔顶 + 跨度×ai0 ----
  const num417 = head.cx;
  const y2 = wofDrawAreaTop + (wofDrawAreaBottom - wofDrawAreaTop) * e.ai0;
  // :26364-26370 爆发计时:101-200 内半径 ×1.3(取整),200 复位
  e.ai2 += 1;
  if (e.ai2 > 100) {
    num415 = Math.floor(num415 * 1.3);
    if (e.ai2 > 200) e.ai2 = 0;
  }
  // ---- 朝玩家偏移(:26372-26377;无玩家时偏移 0 = 回挂点) ----
  let num419 = (player ? player.cx : e.cx) - e.w / 2 - num417;
  let num420 = (player ? player.cy : e.cy) - e.h / 2 - y2;
  const num421 = Math.sqrt(num419 * num419 + num420 * num420);
  if (e.ai1 === 0) {
    // ---- 挂墙环绕(:26379-26424):偏移钳到半径后单轴步进,逆向往返 2.5 倍步进 ----
    if (num421 > num415) {
      const s = num415 / num421;
      num419 *= s;
      num420 *= s;
    }
    if (e.x < num417 + num419) {
      e.vx += num414;
      if (e.vx < 0 && num419 > 0) e.vx += num414 * 2.5;
    } else if (e.x > num417 + num419) {
      e.vx -= num414;
      if (e.vx > 0 && num419 < 0) e.vx -= num414 * 2.5;
    }
    if (e.y < y2 + num420) {
      e.vy += num414;
      if (e.vy < 0 && num420 > 0) e.vy += num414 * 2.5;
    } else if (e.y > y2 + num420) {
      e.vy -= num414;
      if (e.vy > 0 && num420 < 0) e.vy -= num414 * 2.5;
    }
    const num422 = 4; // 速度钳(经典;:26426-26449 expert 按血量与相对墙向加成不实现)
    e.vx = clamp(e.vx, -num422, num422);
    e.vy = clamp(e.vy, -num422, num422);
  } else if (e.ai1 > 0) {
    // ---- 脱落(:26451-26453):倒计时,不转向(保持惯性扑向玩家) ----
    e.ai1 -= 1;
  } else {
    e.ai1 = 0;
  }

  // ---- 朝向(:26456-26463) ----
  if (num419 > 0) { e.facing = 1; e.spin = Math.atan2(num420, num419); }
  if (num419 < 0) { e.facing = -1; e.spin = Math.atan2(num420, num419) + Math.PI; }

  // 移动自行积分(原版 :26465 后由碰撞段积分;Hungry noTileCollide 穿墙)
  e.x += e.vx;
  e.y += e.vy;
}
