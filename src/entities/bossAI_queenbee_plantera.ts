// 蜂后 222(aiStyle 43,NPC.cs:30312-30998)+ 世纪之花族 1:1 移植(Terarria1456,1.4.5.6)。
//   aiStyle 50(NPC.cs:31807-31872)= NPC 261 真菌孢子 / 265 孢子(漂移族,261 撞墙即碎)
//   aiStyle 51(NPC.cs:31873-32237)= NPC 262 世纪之花本体(钩蔓均值牵引 + 二阶段触须)
//   aiStyle 52(NPC.cs:32238-32405)= NPC 263 世纪之花钩蔓(抓墙锚定,牵引本体)
// 经典模式参数 1:1;getGoodWorld 分支已实装(蜂后暴怒 +0.5/世纪之花本体 ×1.15/二阶段
// 触须 14 只/触手加速度 +4);expert 分支全量实装(2026-08-19 台账 E):蜂后防御
// +20×(1-血比)/攻式 +1..3/俯冲 16-24/悬浮 12-18·0.15-0.4/冲过头窗 600→300/
// 减速阈值 0.1→0.25/上飞步进 0.07→0.1/出蜂节奏 +1/毒刺间隔 40→15-35 与速 +2/+5;
// netcode(netUpdate/Main.netMode)跳过。
// 本体/部件均 noTileCollide(原版 SetDefaults),故位移由各核自行积分(e.x+=vx)。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { TILE_BY_KEY } from '../data/tiles';
import { getAttackDamageScaledByDifficulty, getAttackDamageForProjectiles } from '../stats/ScaleStats';
import { moveAndCollide } from '../physics/TileCollision';
import { spawnPart, shoot, accelTo, losClear } from './bossAI';
import { mainExpertMode } from '../stats/ScaleStats';

/** 原版 localAI[0..3](Enemy 的 ai0-ai3 对应 ai[],localAI 是独立数组 → WeakMap 落盘) */
const localAI = new WeakMap<Enemy, number[]>();
const la = (e: Enemy): number[] => {
  let a = localAI.get(e);
  if (!a) { a = [0, 0, 0, 0]; localAI.set(e, a); }
  return a;
};

/** Main.rand.Next(n) → [0,n) */
const rnd = (n: number): number => Math.floor(Math.random() * n);
/** Main.rand.Next(a, b) → [a,b) */
const rndRange = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** 蜂后毒刺态悬浮步进(NPC.cs:30960-30977):与 accelTo 同构,但符号翻转时补步 ×2 */
const step2 = (v: number, target: number, a: number): number => {
  if (v < target) { v += a; if (v < 0 && target > 0) v += a * 2; }
  else if (v > target) { v -= a; if (v > 0 && target < 0) v -= a * 2; }
  return v;
};

/** WorldGen.SpawnPlanteraThorns(WorldGen.cs:76875-76917)1:1:FTW 钩蔓抵锚瞬间以落点为
 *  起点撒 Next(3,6)=3..5 条世纪之花荆棘(tile 655)随机游走线——每条 Next(15,31)=15..30
 *  步、初始方向横竖各半随机、每步 1/5 概率横竖换向;只铺空格(vanilla 循环体
 *  `!active() → PlaceTile(655)` 门,:76899-76903),出界整轮即止(InWorld :76908)。
 *  调用点 = 钩蔓 AI_052 抵锚分支(NPC.cs:32462-32466)。tile 655 触碰伤 100 +
 *  触碰即毁(TouchDamage TOUCH_IMMEDIATE/TOUCH_DESTROY 已接),tileCut 可清除 */
function spawnPlanteraThorns(game: GameHooks, px: number, py: number): void {
  const st = game.world.store;
  const thorn = TILE_BY_KEY['v_655_plantera_thorns'] ?? -1;
  if (thorn < 0) return;
  const strands = rndRange(3, 6);
  for (let i = 0; i < strands; i++) {
    let steps = rndRange(15, 31);
    let tx = Math.floor(px / TILE);
    let ty = Math.floor(py / TILE);
    let dx = 0, dy = 0;
    if (rnd(2) !== 0) dy = rnd(2) === 0 ? 1 : -1;
    else dx = rnd(2) === 0 ? 1 : -1;
    while (steps > 0) {
      steps--;
      if (st.inBounds(tx, ty)) {
        const idx = st.idx(tx, ty);
        if (st.flags[idx] === 0) st.setTile(tx, ty, thorn);   // PlaceTile !active() 门
      }
      tx += dx;
      ty += dy;
      if (!st.inBounds(tx, ty)) return;
      if (rnd(5) === 0) {
        if (dy === 0) { dx = 0; dy = rnd(2) === 0 ? 1 : -1; }
        else { dy = 0; dx = rnd(2) === 0 ? 1 : -1; }
      }
    }
  }
}

// ============================================================================
// AI_043 蜂后 222(NPC.cs:30312-30998)
// ai[0] 状态:-1 选下一招 / 0 悬浮-俯冲循环 / 2 飞至玩家上方 / 1 机枪蜜蜂 /
//            3 毒刺弹幕 / 4 远距追赶 / 5 玩家死离场。
// ai[1]:状态 0 内的半程计数(偶=悬浮 奇=冲撞减速,>2*num662 换招);离开时暂存上一状态供 -1 去重。
// ai[2]:状态 0 减速门(1=正在减速);状态 1/3 已发弹计数。
// ============================================================================
export function queenBeeAI(e: Enemy, game: GameHooks, player: Player | null) {
  // 首帧复位(ai0 默认 -1120 是史莱姆族约定,原版 ai[0] 从 0 起步)
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; la(e)[0] = 0; e.lai0 = 0; }   // 渲染帧带同步(FindFrame case 222)
  // 玩家失效 = 原版 TargetClosest 落空后的 dead4(:30316-30319)
  const dead4 = !player || player.dead;
  // 专家分支一(:30313-30318):defense = defDefense + (int)(20×(1-血比))——
  // 基值缓存 la[3](蜂后 localAI[3] 原版未用)
  const expert = mainExpertMode(game.world);
  if (la(e)[3] === 0) la(e)[3] = e.def.defense ?? 0;
  if (expert) e.def.defense = la(e)[3] + Math.trunc(20 * (1 - e.hp / e.maxHp));
  // 暴怒度 num658(:30321-30333):地表 +1 / 非丛林 +1 / getGoodWorld +0.5(:30331-30334)。
  // ZoneJungle = Game.scene 窗口计数(丛林砖 60/61/62/74/226/225 ≥140 且非地狱层)
  let num658 = 0;
  if (e.y / TILE < game.world.groundLevel) num658 += 1;
  if (!game.scene?.zoneJungle) num658 += 1;
  if (game.world.seedFlags?.getGoodWorld) num658 += 0.5;
  const num659 = player ? Math.hypot(player.cx - e.cx, player.cy - e.cy) : 1e9;
  // timeLeft 保活地板(:30419-30421):ai[0]!=5 时 timeLeft<60 → 60——despawnTimer=
  // 原版 timeLeft,长距风筝离屏时消散倒数不低于 60t(2026-08-24 R23a 补)
  if (e.ai0 !== 5 && e.despawnTimer < 60) e.despawnTimer = 60;
  if (e.ai0 !== 5 && num659 > 3000) e.ai0 = 4;   // :30336-30341 远距追赶
  if (dead4) e.ai0 = 5;                           // :30342-30345

  let direction = e.facing || 1;
  if (e.ai0 === 5) {
    // 离场(:30346-30383):朝世界远端飞,vx 恒向远端加速 0.08
    e.vy *= 0.98;
    direction = e.vx < 0 ? -1 : 1;
    e.facing = direction;
    const halfW = game.world.store.w * TILE / 2;   // Main.maxTilesX * 8 = 世界中线
    if (e.x < halfW) {
      if (e.vx > 0) e.vx *= 0.98; else la(e)[0] = 1; e.lai0 = 1;   // 帧带同步 case 222
      e.vx -= 0.08;
    } else {
      if (e.vx < 0) e.vx *= 0.98; else la(e)[0] = 1; e.lai0 = 1;   // 帧带同步 case 222
      e.vx += 0.08;
    }
    e.encourageDespawn(10); // :30390 离场态每 tick EncourageDespawn(10)——离屏 ~10t 消散
  } else if (e.ai0 === -1) {
    // 选下一招(:30384-30408):{0,2,3} 随机,避开 ai1 暂存的上一状态
    let pick: number;
    do {
      pick = rnd(3);
      if (pick === 1) pick = 2; else if (pick === 2) pick = 3;
    } while (pick === e.ai1);
    e.ai0 = pick;
    e.ai1 = 0;
    e.ai2 = 0;
  } else if (e.ai0 === 0) {
    // 悬浮-俯冲循环(:30409-30605)
    // num662 = 循环半程对数(:30422-30438):经典 2;专家 <1/2 +1、<1/3 +1、<1/5 +1;
    // 再 + 暴怒度(int)
    let num662 = 2;
    if (expert) {
      if (e.hp < e.maxHp / 2) num662 += 1;
      if (e.hp < e.maxHp / 3) num662 += 1;
      if (e.hp < e.maxHp / 5) num662 += 1;
    }
    num662 += Math.trunc(1 * num658);
    if (e.ai1 > 2 * num662 && e.ai1 % 2 === 0) {
      // 循环数满 → 换招(:30419-30427);ai1 归 0 = 上一状态是 0
      e.ai0 = -1;
      e.ai1 = 0;
      e.ai2 = 0;
    } else if (e.ai1 % 2 === 0) {
      // 悬浮/俯冲判定(:30428-30499)
      direction = player!.cx < e.cx ? -1 : 1;
      const num663 = 20 + 20 * num658;
      if (Math.abs(e.cy - player!.cy) < num663) {
        // 俯冲(:30451-30499):localAI[0]=1(冲刺动画);num664 速直冲玩家——
        // 经典 12,专家 16 起 +2/档(<75/<50/<25/<10%,满档 24,:30458-30478)+ 7×暴怒
        la(e)[0] = 1; e.lai0 = 1;   // 帧带同步 case 222
        e.ai1 += 1;
        e.ai2 = 0;
        let num664 = 12;
        if (expert) {
          num664 = 16;
          if (e.hp < e.maxHp * 0.75) num664 += 2;
          if (e.hp < e.maxHp * 0.5) num664 += 2;
          if (e.hp < e.maxHp * 0.25) num664 += 2;
          if (e.hp < e.maxHp * 0.1) num664 += 2;
        }
        num664 += 7 * num658;
        const dx = player!.cx - e.cx, dy = player!.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx = (dx / d) * num664;
        e.vy = (dy / d) * num664;
        e.facing = direction;
        game.playSfxFile?.('Zombie_125', 1, e.cx, e.cy); // :30488 PlaySound(29,…,125) 蜂后冲刺吼真轨（"Zombie"族=逐 NPC 语音槽位；原 roar 近似销核）
      } else {
        // 悬浮(:30485-30565):Y 朝玩家步进 num669 钳 ±num668;X 三段 >600 加速 /
        // <300 反向 / 中带阻尼 0.8,钳 ±16——经典 12/0.15,专家 +1/+0.05、+1/+0.05、
        // +2/+0.05、+2/+0.1(<75/<50/<25/<10%,:30492-30516)+ 3×/0.5×暴怒(:30517-30518)
        la(e)[0] = 0; e.lai0 = 0;   // 帧带同步 case 222
        let num668 = 12;
        let num669 = 0.15;
        if (expert) {
          if (e.hp < e.maxHp * 0.75) { num668 += 1; num669 += 0.05; }
          if (e.hp < e.maxHp * 0.5) { num668 += 1; num669 += 0.05; }
          if (e.hp < e.maxHp * 0.25) { num668 += 2; num669 += 0.05; }
          if (e.hp < e.maxHp * 0.1) { num668 += 2; num669 += 0.1; }
        }
        num668 += 3 * num658;
        num669 += 0.5 * num658;
        e.vy += e.cy < player!.cy ? num669 : -num669;
        e.vy = clamp(e.vy, -num668, num668);
        const dxAbs = Math.abs(e.cx - player!.cx);
        if (dxAbs > 600) e.vx += 0.15 * direction;
        else if (dxAbs < 300) e.vx -= 0.15 * direction;
        else e.vx *= 0.8;
        e.vx = clamp(e.vx, -16, 16);
        e.facing = direction;
      }
    } else {
      // 俯冲后(:30558-30605):冲过头判定窗 num670——经典 600,专家随血量收窄
      // 550/500/450/300(<75/<50/<25/<10%,:30567-30586);再 −(int)(100×暴怒)
      direction = e.vx < 0 ? -1 : 1;
      e.facing = direction;
      let num670 = 600;
      if (expert) {
        if (e.hp < e.maxHp * 0.1) num670 = 300;
        else if (e.hp < e.maxHp * 0.25) num670 = 450;
        else if (e.hp < e.maxHp * 0.5) num670 = 500;
        else if (e.hp < e.maxHp * 0.75) num670 = 550;
      }
      num670 -= Math.trunc(100 * num658);
      const num671 = e.cx < player!.cx ? -1 : 1;
      let flag45 = false;
      // 冲过头/垂直脱靶 → 进入减速门 ai2=1
      if (direction === num671 && Math.abs(e.cx - player!.cx) > num670) { e.ai2 = 1; flag45 = true; }
      if (Math.abs(e.cy - player!.cy) > num670 * 1.5) { e.ai2 = 1; flag45 = true; }
      if (num658 > 0 && flag45) { e.vx *= 0.5; e.vy *= 0.5; }
      if (e.ai2 === 1) {
        // 减速(:30608-30643):0.9/tick;专家 <1/2、<1/3、<1/5 各再 0.9 + 阈值 +0.05
        // (num672 经典 0.1 → 满档 0.25);暴怒再 0.7;速降 < num672 → 回悬浮(ai1+1)
        la(e)[0] = 0; e.lai0 = 0;   // 帧带同步 case 222
        e.vx *= 0.9;
        e.vy *= 0.9;
        let num672 = 0.1;
        if (expert) {
          if (e.hp < e.maxHp / 2) { e.vx *= 0.9; e.vy *= 0.9; num672 += 0.05; }
          if (e.hp < e.maxHp / 3) { e.vx *= 0.9; e.vy *= 0.9; num672 += 0.05; }
          if (e.hp < e.maxHp / 5) { e.vx *= 0.9; e.vy *= 0.9; num672 += 0.05; }
        }
        if (num658 > 0) { e.vx *= 0.7; e.vy *= 0.7; }
        if (Math.abs(e.vx) + Math.abs(e.vy) < num672) {
          e.ai2 = 0;
          e.ai1 += 1;
        }
      } else {
        la(e)[0] = 1; e.lai0 = 1;   // 仍朝目标飞行,维持冲刺动画(帧带同步 case 222)
      }
    }
  } else if (e.ai0 === 2) {
    // 飞至玩家上方 200(:30649-30703):12 速 / 步进 num674(经典 0.07,专家 0.1,
    // :30653-30658);距目标 <200 → 机枪蜜蜂
    direction = player!.cx < e.cx ? -1 : 1;
    e.facing = direction;
    const num675 = player!.cx - e.cx;
    const num676 = player!.cy - 200 - e.cy;
    const num677 = Math.hypot(num675, num676);
    if (num677 < 200) {
      e.ai0 = 1;
      e.ai1 = 0;
    } else {
      const num674 = expert ? 0.1 : 0.07;
      const t = 12 / num677;
      e.vx = accelTo(e.vx, num675 * t, num674);
      e.vy = accelTo(e.vy, num676 * t, num674);
    }
  } else if (e.ai0 === 1) {
    // 机枪蜜蜂(:30691-30830)
    la(e)[0] = 0; e.lai0 = 0;   // 帧带同步 case 222
    direction = player!.cx < e.cx ? -1 : 1;
    // 毒刺口 vector78(:30697):x 偏 rand(20)*direction,y 取 0.8h
    const vx78 = e.x + e.w / 2 + rnd(20) * direction;
    const vy78 = e.y + e.h * 0.8;
    const distToPlayer = Math.hypot(player!.cx - e.cx, player!.cy - e.cy);
    // 出蜂节奏(:30713-30741):ai[1] +1/t;专家 + 1000px 内玩家数/2(int 除,单玩家 0)
    // + <75/<50/<25/<10% 各 +0.25(满档 +1)
    e.ai1 += 1;
    if (expert) {
      const num681 = player && !player.dead
        && Math.hypot(player.cx - e.cx, player.cy - e.cy) < 1000 ? 1 : 0;
      e.ai1 += Math.trunc(num681 / 2);
      if (e.hp < e.maxHp * 0.75) e.ai1 += 0.25;
      if (e.hp < e.maxHp * 0.5) e.ai1 += 0.25;
      if (e.hp < e.maxHp * 0.25) e.ai1 += 0.25;
      if (e.hp < e.maxHp * 0.1) e.ai1 += 0.25;
    }
    const num683 = Math.floor(40 - 18 * num658);
    let flag46 = false;
    if (e.ai1 > num683) {
      e.ai1 = 0;
      e.ai2 += 1;
      flag46 = true;
    }
    if (flag46 && losClear(game, vx78, vy78, player!.cx, player!.cy)) {
      // 出蜂(:30752-30778):210/211 小蜂,5 速朝玩家
      const bee = spawnPart(game, e, rndRange(210, 212));
      if (bee) {
        const dx = player!.cx - e.cx, dy = player!.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        bee.vx = (dx / d) * 5;
        bee.vy = (dy / d) * 5;
        // 原版 localAI[0]=60(蜜蜂寿命锚);本框架 swarmerAI 无该语义,Despawn 系统兜底
      }
      game.playSfx('hit', 1, e.cx, e.cy);   // :30752 PlaySound(3,x,y) 无 style → NPC_Hit_1（真轨已接，0.4→1 恢复原版音量）
    }
    if (distToPlayer > 400 || !losClear(game, vx78, vy78 - 30, player!.cx, player!.cy)) {
      // 拉近(:30779-30823):以毒刺口为基准 14 速 / 0.1 步进
      const dx = player!.cx - vx78, dy = player!.cy - vy78;
      const t = 14 / (Math.hypot(dx, dy) || 1);
      e.vx = accelTo(e.vx, dx * t, 0.1);
      e.vy = accelTo(e.vy, dy * t, 0.1);
    } else {
      e.vx *= 0.9;
      e.vy *= 0.9;
    }
    e.facing = direction;
    if (e.ai2 > 5) {
      // 6 波蜂后换招(:30824-30829);ai1=1 供 -1 去重(1 不在 {0,2,3} 内,等效不去重)
      e.ai0 = -1;
      e.ai1 = 1;
    }
  } else if (e.ai0 === 3) {
    // 毒刺弹幕(:30820-30981)
    // 悬浮逼近档(:30822-30830):经典 4/0.05,专家 6/0.075;再 + 6×/0.2×暴怒
    let num688 = 4;
    let num689 = 0.05;
    if (expert) { num688 = 6; num689 = 0.075; }
    num688 += 6 * num658;
    num689 += 0.2 * num658;
    direction = player!.cx < e.cx ? -1 : 1;
    const vx80 = e.x + e.w / 2 + rnd(20) * direction;
    const vy80 = e.y + e.h * 0.8;
    const num690 = player!.cx - e.cx;
    const num691 = player!.cy - 300 - e.cy;
    const num692 = Math.hypot(num690, num691);
    e.ai1 += 1;
    // 发射间隔 num693(:30838-30843):经典 40;专家 <10% 血 15 / <1/3 25 / ≥1/2 35 /
    // 其余 30;再 −(int)(5×暴怒)
    let num693 = 40;
    if (expert) {
      num693 = e.hp < e.maxHp * 0.1 ? 15
        : (e.hp < e.maxHp / 3 ? 25
          : (e.hp >= e.maxHp / 2 ? 35 : 30));
    }
    num693 -= Math.trunc(5 * num658);
    // 每隔 num693 tick 且位于玩家上方且视线通 → 毒刺 719
    if (e.ai1 % num693 === num693 - 1 && e.y + e.h < player!.y
      && losClear(game, vx80, vy80, player!.cx, player!.cy)) {
      // 速 num694(:30849-30857):经典 8;专家 +2,专家 <10% 血再 +3;+ 7×暴怒
      let num694 = 8;
      if (expert) num694 += 2;
      if (expert && e.hp < e.maxHp * 0.1) num694 += 3;
      num694 += 7 * num658;
      const num695 = Math.max(1, Math.floor(80 - 39 * num658));
      const num696 = Math.max(1, Math.floor(40 - 19 * num658));
      let dx = player!.cx - vx80 + rndRange(-num695, num695 + 1);
      let dy = player!.cy - vy80 + rndRange(-num696, num696 + 1);
      const t = num694 / (Math.hypot(dx, dy) || 1);
      dx *= t;
      dy *= t;
      // 毒刺 719 = aiStyle1 默认档 0.1@15t 缓坠(去显式 grav:0——曾恒直飞,终审修)
      shoot(game, vx80, vy80, dx, dy, 11, 719, 300, { grav: 0.1, gravDelay: 15 });
      game.playSfxFiles(['Item_17'], 1, e.cx, e.cy);   // SoundID.Item17 真轨（WAV_MAP 命中 Item_17.wav，近似销核）
    }
    if (!losClear(game, vx80, vy80 - 30, player!.cx, player!.cy)) {
      // 隔墙:直接朝玩家 14 速 / 0.1 步进(暴怒 0.5,:30881-30925)
      const step = num658 > 0 ? 0.5 : 0.1;
      const dx = player!.cx - vx80, dy = player!.cy - vy80;
      const t = 14 / (Math.hypot(dx, dy) || 1);
      e.vx = accelTo(e.vx, dx * t, step);
      e.vy = accelTo(e.vy, dy * t, step);
    } else if (num692 > 100) {
      // 朝悬浮点(玩家上方 300)逼近 4 速 / 0.05 步进(:30935-30978);
      // 原版此分支符号翻转时步进 ×2(num689 * 2f),与 accelTo 单补步不同 → 专用步进
      direction = player!.cx < e.cx ? -1 : 1;
      e.facing = direction;
      const t = num688 / num692;
      e.vx = step2(e.vx, num690 * t, num689);
      e.vy = step2(e.vy, num691 * t, num689);
    }
    const num703 = 20 - 5 * num658;
    if (e.ai1 > num693 * num703) {
      // 弹幕时长满(40*20=800t)→ 换招(:30979-30981);ai1=3 供 -1 去重
      e.ai0 = -1;
      e.ai1 = 3;
    }
  } else if (e.ai0 === 4) {
    // 远距追赶(:30982-30998):14 速混合逼近,进入 2000px → 换招
    la(e)[0] = 1; e.lai0 = 1;   // 帧带同步 case 222
    let tx = player!.cx - e.cx, ty = player!.cy - e.cy;
    const d = Math.hypot(tx, ty) || 1;
    tx = (tx / d) * 14;
    ty = (ty / d) * 14;
    e.vx = (e.vx * 14 + tx) / 15;
    e.vy = (e.vy * 14 + ty) / 15;
    direction = e.vx < 0 ? -1 : 1;
    e.facing = direction;
    if (num659 < 2000) {
      e.ai0 = -1;
      la(e)[0] = 0; e.lai0 = 0;   // 帧带同步 case 222
    }
  }
  e.x += e.vx;
  e.y += e.vy;
}

// ============================================================================
// AI_050 孢子漂移族(NPC.cs:31807-31872):NPC 261 真菌孢子 / 265 孢子(世纪之花二阶段产物)。
// 弱重力 0.02 下沉 + X 朝玩家 0.1 步进;261 撞墙即碎(life=0),265 穿墙。
// ============================================================================
export function planteraHookAI(e: Enemy, game: GameHooks, player: Player | null) {
  // EncourageDespawn(5,:31808):共享 Despawn 系统兜底（离屏 5t 即消）
  e.encourageDespawn(5);
  e.vy += 0.02;                                    // :31819
  if (player) {
    if (e.vy < 0 && player.y > e.y + 100) e.vy *= 0.95;   // :31821-31824
    if (e.vy > 1) e.vy = 1;
    // X 朝玩家 0.1 步进(expert ×2),逆向先 0.98 阻尼(:31829-31860)
    const homeStep = mainExpertMode(game.world) ? 0.2 : 0.1;
    if (e.x + e.w < player.x) {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += homeStep;
    } else if (e.x > player.x + player.w) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= homeStep;
    }
  }
  if (e.vx > 5 || e.vx < -5) e.vx *= 0.97;         // :31861-31864
  e.spin = e.vx * 0.2;                             // rotation = velocity.X * 0.2f(:31865)
  if (e.vanillaId === 261) {
    // 真菌孢子:noTileCollide=false,撞墙即碎(:31810-31818)
    e.onGround = false; e.hitWall = false; e.hitHead = false;
    moveAndCollide(e, game.world, e.vx, e.vy);
    if (e.hitWall || e.hitHead || e.onGround) {
      e.hp = 0;
      e.dead = true;
      game.spawnParticles(e.cx, e.cy, '#7A9E4F', 5, 1.5);   // HitEffect(0,100) 近似
    }
  } else {
    // 265 孢子 noTileCollide(:31815-31817)
    e.x += e.vx;
    e.y += e.vy;
  }
}

// ============================================================================
// AI_051 世纪之花 262(NPC.cs:31873-32237)
// 本体无重力,由钩蔓(263, aiStyle 52)均值牵引:目标点 = 钩蔓中心 + 朝玩家偏移(≤500px);
// 一阶段(血>50%):防 36 / 接触伤 50,种子弹幕 275(22)/276 毒种(27)/277 刺球(31);
// 二阶段(血≤50%):防 10 / 接触伤 70,提速(2.5→5→7 / 0.025→0.05),触须 264×8 + 孢子 265。
// plantBoss 静态引用由"场上 262 查找"等价替代(单 Boss 语义)。
// ============================================================================
export function planteraAI(e: Enemy, game: GameHooks, player: Player | null) {
  const l = la(e);
  // 玩家死(:31875-31883) → flag51 = 反向离场。框架在玩家死亡时传 null,
  // 而原版 flag51 分支仍读取尸体坐标 → 从索敌目标取回原对象(Enemy.eocAI 同款;
  // M11：Main.player[target] 可为访客代理,无目标史再回退本地)
  const p = player ?? e.targetRef(game);
  const flag51 = !p || p.dead;
  if (!p) {   // 原版不可能无 player(Main.player[target] 恒有对象);防御性减速漂移
    e.vx *= 0.95;
    e.vy *= 0.95;
    e.x += e.vx;
    e.y += e.vy;
    return;
  }
  // 暴怒 flag50(:31923-31928):!ZoneJungle || 玩家顶边 Y < worldSurface*16
  // || > UnderworldLayer*16 → num793+8 / num794=0.15(ZoneJungle = Game.scene 窗口计数;
  // UnderworldLayer = maxTilesY-200,Main.cs:2863——勿用 lavaLine,两者差近 200 格)
  const underLayer = (game.world.store.h - 200) * TILE;
  const flag50 = !game.scene?.zoneJungle
    || p.y < game.world.groundLevel * TILE
    || p.y > underLayer;
  // 初始化(:31886-31892):localAI[0]=1 + 钩蔓 263×3
  if (!e.bInit) {
    e.bInit = true;
    l[0] = 1;
    for (let k = 0; k < 3; k++) spawnPart(game, e, 263);
  }
  // despawn 防逃(:31885-31892):SpawnBoss 时 timeLeft×20=15000;目标存活且
  // 4800px 内每 tick 刷新回 750,否则倒数归零消散（玩家死 flag51 不刷新→离场消散）
  {
    const dist = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    if (!flag51 && dist < 4800) {
      e.despawnTimer = 750;
      e.despawnEncouraged = false;
    } else {
      e.despawnEncouraged = true;
      if (e.despawnTimer > 15000) e.despawnTimer = 15000;
    }
  }
  // 钩蔓中心(:31893-31913):场上前 3 只 aiStyle 52 的位置均值
  let sumX = 0, sumY = 0, cnt = 0;
  for (const n of game.enemies() as Enemy[]) {
    if (n !== e && !n.dead && n.vanilla?.aiStyle === 52) {
      sumX += n.cx;
      sumY += n.cy;
      cnt++;
      if (cnt > 2) break;   // 原版 num791 > 2 break(只取 3 只)
    }
  }
  // 原版 num791=0 时除 0 得 NaN(本体漂移);此处退化为本体位保持可玩
  let num789 = cnt > 0 ? sumX / cnt : e.cx;
  let num790 = cnt > 0 ? sumY / cnt : e.cy;
  // 速度/加速度档(:31914-31928):2.5/0.025 → 半血 5/0.05 → 1/4 血 7
  const expert = mainExpertMode(game.world);
  const ftw = !!game.world.seedFlags?.getGoodWorld;
  let num793 = 2.5;
  let num794 = 0.025;
  if (e.hp < e.maxHp / 2) { num793 = 5; num794 = 0.05; }
  if (e.hp < e.maxHp / 4) num793 = 7;
  if (flag50) { num793 += 8; num794 = 0.15; }   // :31923-31941 暴怒档
  if (expert) {                                 // :31936-31942 expert 档
    num793 = (num793 + 1) * 1.1;
    num794 = (num794 + 0.01) * 1.1;
  }
  if (ftw) { num793 *= 1.15; num794 *= 1.15; }  // :31943-31946
  // 目标点 = 钩蔓中心 + 朝玩家偏移,钳 500px(:31942-31968)
  let num795 = p.cx - num789;
  let num796 = p.cy - num790;
  if (flag51) {
    num795 = -num795;
    num796 = -num796;
    num793 += 8;
  }
  let num797 = Math.hypot(num795, num796);
  const num798 = 500 + (flag50 ? 350 : 0) + (expert ? 150 : 0);
  if (num797 >= num798) {
    const s = num798 / num797;
    num795 *= s;
    num796 *= s;
  }
  num789 += num795;
  num790 += num796;
  // 逼近目标点(:31969-32015):距离 < num793 保持现速,否则归一到 num793;0.025 步进(符号翻转双步)
  num795 = num789 - e.cx;
  num796 = num790 - e.cy;
  num797 = Math.hypot(num795, num796);
  if (num797 < num793) {
    num795 = e.vx;
    num796 = e.vy;
  } else {
    const s = num793 / num797;
    num795 *= s;
    num796 *= s;
  }
  // 原版此段符号翻转时补步 ×2(num794 * 2f,:31984-32015)→ step2(同蜂后毒刺态)
  e.vx = step2(e.vx, num795, num794);
  e.vy = step2(e.vy, num796, num794);
  // 朝向玩家旋转(:32016-32019)
  e.spin = Math.atan2(p.cy - e.cy, p.cx - e.cx) + Math.PI / 2;
  e.x += e.vx;
  e.y += e.vy;

  if (e.hp > e.maxHp / 2) {
    // ---- 一阶段(:32020-32133) ----
    e.def.defense = 36;                       // :32028
    e.def.damage = getAttackDamageScaledByDifficulty(50, e.difficulty ?? 0); // :32026 C/E/M=50/100/150(旧写死经典档,2026-08-13 修)
    if (flag50) { e.def.defense *= 2; e.def.damage *= 2; }   // :32030-32034 暴怒防/接触伤 ×2
    l[1] += 1;                                // :32034
    for (const th of [0.9, 0.8, 0.7, 0.6]) if (e.hp < e.maxHp * th) l[1] += 1;
    if (flag50) l[1] += 3;                     // :32059-32062 暴怒蓄力 +3
    if (expert) l[1] += 1;                     // :32058-32060 expert 蓄力 +1
    // :32144-32147 专家受击强发掷:justHit && Next(2)==0 → localAI[3]=1(下次蓄力满
    //   无视视线强发一次;掷在每 tick 蓄力段,R23a 补——曾注释自认未建模)
    if (expert && e.justHit && rnd(2) === 0) l[3] = 1;
    if (ftw) l[1] += 1;                        // :32066-32068
    if (l[1] > 80) {
      l[1] = 0;
      // 视线检查(:32069-32078):Collision.CanHit(position,w,h,player,...) 近似
      let flag52 = losClear(game, e.x, e.y, p.x, p.y);
      // :32158-32162 localAI[3]>0 → 无视视线强发并清旗
      if (l[3] > 0) { flag52 = true; l[3] = 0; }
      if (flag52) {
        // 种子 275 / 毒种 276 / 刺球 277(:32080-32133)
        const num802 = expert ? 17 : 15;      // :32088-32097
        let num803 = p.cx - e.cx;
        let num804 = p.cy - e.cy;
        const t = num802 / (Math.hypot(num803, num804) || 1);
        num803 *= t;
        num804 *= t;
        let num806 = 22;
        let num807 = 275;
        let life = 300;
        // 弹幕物理:275/276 = aiStyle 1(35t 后 g=0.025 下坠,Projectile.cs:54318-54329;
        // expert 追踪 18/70/floor14,:54330-54345);277 = aiStyle 14(撞块 ×-0.9 反弹,
        // :18306-18314 + expert 追踪 12/200/cap16,:23307-23316)
        let arrowOpts: Partial<import('./Arrow').ArrowOpts> = { grav: 0.025, gravDelay: 35 };
        // :54338-54345 专家追踪档附带 tileCollide=false + timeLeft 钳 180
        if (expert) {
          arrowOpts = { ...arrowOpts, homing: { speed: 18, weight: 70, floor: 14 }, noTileCollide: true };
          life = Math.min(life, 180);
        }
        if (e.hp < e.maxHp * 0.8 && rnd(expert ? 2 : 4) === 0) {
          num806 = 27;                        // 毒种 276(命中上毒在 statusPlayer case 276)
          num807 = 276;
          l[1] = -30;                         // 下发弹延迟 30t
        } else if (e.hp < e.maxHp * 0.8 && rnd(expert ? 6 : 8) === 0) {
          num806 = 31;                        // 刺球 277
          num807 = 277;
          l[1] = -120;                        // 下发弹延迟 120t
          life = 1200;                        // 原版不设 timeLeft(保持默认 1200)
          // :23380-23399 重力 0.2 且仅 15t 后(曾 0.3 从 0t);专家追踪只混 X 轴
          // (:23307-23316,速帽 16)——homing.axis='x'(终审修)
          arrowOpts = { grav: 0.2, gravDelay: 15, thornBounce: true };
          if (expert) arrowOpts = { ...arrowOpts, homing: { speed: 12, weight: 200, cap: 16, axis: 'x' } };
        }
        if (flag50) num806 *= 2;              // :32120-32122 暴怒弹伤 ×2
        // :32123 弹伤 Remap:num806 = GetAttackDamage_ForProjectiles(num806, num806*0.9)
        // ——经典 22/27/31,专家 ×0.9 截断(19/24/27)。证据链:原版弹体 damage 存该值,
        // 命中端另乘 hostile 弹难度缩放+×2(本仓 projTargets.hitPlayer:136 同构),
        // 两级相乘=原版口径;此前直传 22/27/31 会漏掉专家端 0.9 系数(2026-08-19 结案)
        num806 = getAttackDamageForProjectiles(num806, num806 * 0.9, e.difficulty);
        shoot(game, e.cx + num803 * 3, e.cy + num804 * 3, num803, num804, num806, num807, life, arrowOpts);
        // 出膛音（Projectile.cs:56303-56312 ai[1]==0 首拍）:弹 275 种子 / 276 毒种
        // → Item17（277 刺球不在 AI_001 出膛音链,无声）——发射位等价结算
        // （弹先出生后补播,同 bossAI.ts 83=Item_33 先例）
        if (num807 === 275 || num807 === 276) game.playSfxWav?.('Item_17', 1, e.cx, e.cy);
      }
    }
  } else {
    // ---- 二阶段(血≤50%,:32134-32237) ----
    e.def.defense = 10;                       // :32134
    e.def.damage = getAttackDamageScaledByDifficulty(70, e.difficulty ?? 0); // :32134 C/E/M=70/140/210(旧写死经典档)
    if (flag50) { e.def.defense *= 4; e.def.damage *= 2; }   // :32136-32140 暴怒防 ×4/接触伤 ×2
    // 首次进二阶段:触须 264×8(:32144-32154;getGoodWorld +6=14)
    if (l[0] === 1) {
      l[0] = 2;
      const nT = ftw ? 14 : 8;
      for (let k = 0; k < nT; k++) spawnPart(game, e, 264);
      // expert:每个存活钩蔓(263)再派 3 只 ai[3]=hookIndex+1 锚定触须(:32155-32167)
      if (expert) {
        const hooks = (game.enemies() as Enemy[]).filter((n) => !n.dead && n.vanillaId === 263);
        hooks.forEach((hk, hi) => {
          for (let k = 0; k < Math.floor(nT / 2) - 1; k++) {
            const t = spawnPart(game, e, 264);
            if (t) t.ai3 = hk.id + 1;   // ai[3] = hook whoAmI+1（触手2 按 id 反查锚）
          }
        });
      }
    }
    // expert 每 60t 补触须(:32171-32185):自由触须(ai3==0)<8 且 1/((count+1)*10) → +1
    if (expert && rnd(60) === 0) {
      const free = (game.enemies() as Enemy[]).filter((n) => !n.dead && n.vanillaId === 264 && n.ai3 === 0);
      if (free.length < 8 && rnd((free.length + 1) * 10) <= 1) spawnPart(game, e, 264);
    }
    // 二阶段入场花瓣 Gore 378/379/380(:32194-32200)→ 粒子近似
    if (l[2] === 0) {
      l[2] = 1;
      game.spawnParticles(e.cx, e.cy, '#5FA054', 8, 2);
    }
    // expert 每 60t 补触须(:32172-32190)省略
    l[1] += 1;                                // :32202
    for (const th of [0.4, 0.3, 0.2, 0.1]) if (e.hp < e.maxHp * th) l[1] += 1;
    if (l[1] >= 350) {
      // 孢子 265(:32216-32236):8 速,落点偏移(下方目标去掉 0.2|dx| 弧垂)
      const num820 = p.cx - e.cx + rndRange(-10, 11);
      let num821 = Math.abs(num820 * 0.2);
      let num822 = p.cy - e.cy + rndRange(-10, 11);
      if (num822 > 0) num821 = 0;
      num822 -= num821;
      const t = 8 / (Math.hypot(num820, num822) || 1);
      const spore = spawnPart(game, e, 265);
      if (spore) {
        spore.vx = num820 * t;
        spore.vy = num822 * t;
      }
      l[1] = 0;
    }
  }
}

// ============================================================================
// AI_052 世纪之花钩蔓 263(NPC.cs:32238-32405):抓墙锚定 + 牵引本体。
// ai[0]/ai[1] = 锚点 tile 坐标;localAI[0] = 换锚倒计时(每次抓墙后 300-600t,血低加速);
// 到点后钉在锚点(速度=残差),本体以钩蔓均值+玩家偏移为目标被拉动。
// plantBoss 静态引用由"场上 262 查找"等价替代;本体消失 → 自毁(StrikeNPCNoInteraction 9999)。
// ============================================================================
export function planteraTentacleAI(e: Enemy, game: GameHooks, player: Player | null) {
  const l = la(e);
  const st = game.world.store;
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; }
  // 本体引用(原版静态 plantBoss;:32241-32246 本体消失 → 9999 自伤)
  const boss = (game.enemies() as Enemy[]).find((n) => !n.dead && n.vanillaId === 262) ?? null;
  if (!boss) {
    e.hp -= 9999;
    if (e.hp <= 0) e.dead = true;
    return;
  }
  e.master = boss; // 钩蔓链渲染用（Renderer.drawPlanteraVine，Main.cs:22225-22261）
  const target: { cx: number; cy: number; x: number; y: number; dead: boolean } = player ?? boss;
  const flag54 = !player || player.dead;    // 玩家死(:32248-32250)
  // 暴怒 flag53(:32252-32257):目标玩家非丛林 / 顶边 Y < worldSurface*16 /
  // > UnderworldLayer*16(maxTilesY-200,Main.cs:2863) / 玩家死(flag54)→ 入口 localAI[0] -4
  const underLayerT = (game.world.store.h - 200) * TILE;
  const flag53 = !game.scene?.zoneJungle
    || (!!player && player.y < game.world.groundLevel * TILE)
    || (!!player && player.y > underLayerT)
    || flag54;
  // 换锚倒计时(:32268-32291)
  if (e.ai0 === 0 || e.ai1 === 0) l[0] = 0;
  l[0] -= 1;
  if (boss.hp < boss.maxHp / 2) l[0] -= 2;   // :32275-32277
  if (boss.hp < boss.maxHp / 4) l[0] -= 2;
  if (flag53) { l[0] -= 4; }                 // :32252-32256 入口 -4
  if (flag53) l[0] -= 6;                     // :32283-32285 换锚前 -6
  // 错峰:其他同类钩蔓仍在飞行 → 随机 60-300t 后再换(:32286-32298)
  if (!flag54 && l[0] <= 0 && e.ai0 !== 0) {
    for (const n of game.enemies() as Enemy[]) {
      if (n !== e && !n.dead && n.vanillaId === 263 && (n.vx !== 0 || n.vy !== 0)) {
        l[0] = rndRange(60, 300);
        break;
      }
    }
  }
  if (l[0] <= 0) {
    // 搜新锚点(:32299-32351):玩家附近(无锚时取玩家-本体中点)随机扩散找实心/墙 tile
    l[0] = rndRange(300, 600);
    let found = false;
    let num826 = 0;
    while (!found && num826 <= 1000) {
      num826++;
      let num827 = Math.floor(target.cx / TILE);
      let num828 = Math.floor(target.cy / TILE);
      if (e.ai0 === 0) {
        // 首锚:取玩家与本体中点(:32309-32312)
        num827 = Math.floor((target.cx + boss.cx) / 32);
        num828 = Math.floor((target.cy + boss.cy) / 32);
      }
      if (flag54) {
        num827 = Math.floor(boss.x / TILE);
        num828 = Math.floor((boss.y + 400) / TILE);
      }
      const num829 = 20 + Math.floor(100 * (num826 / 1000));   // 扩散半径 20→120
      let num830 = num827 + rndRange(-num829, num829 + 1);
      let num831 = num828 + rndRange(-num829, num829 + 1);
      // 半血后 1/6 概率直接试玩家所在格(有墙才用,:32322-32332)
      if (boss.hp < boss.maxHp / 2 && rnd(6) === 0) {
        const ptx = Math.floor(target.cx / TILE), pty = Math.floor(target.cy / TILE);
        if (st.inBounds(ptx, pty) && st.wall[st.idx(ptx, pty)] > 0) {
          num830 = ptx;
          num831 = pty;
        }
      }
      // 实心 tile / (墙 tile 且搜索过半或本体半血)(:32333-32350)
      if (st.inBounds(num830, num831)
        && (st.isSolid(num830, num831)
          || (st.wall[st.idx(num830, num831)] > 0 && (num826 > 500 || boss.hp < boss.maxHp / 2)))) {
        found = true;
        e.ai0 = num830;
        e.ai1 = num831;
      }
    }
  }
  if (!(e.ai0 > 0) || !(e.ai1 > 0)) return;   // :32352-32355 无锚不动
  // 收线速度(:32356-32375):6 → 本体半血 8 → 1/4 血 10;expert +1、半血后再 +1;
  // 暴怒/玩家死 ×2
  let num834 = 6;
  if (boss.hp < boss.maxHp / 2) num834 = 8;
  if (boss.hp < boss.maxHp / 4) num834 = 10;
  const expertHook = mainExpertMode(game.world);
  if (expertHook) num834 += 1;
  if (expertHook && boss.hp < boss.maxHp / 2) num834 += 1;
  if (flag53) num834 *= 2;                   // :32368-32371 暴怒收线 ×2
  if (flag54) num834 *= 2;
  // 朝锚点(锚点 tile 中心 - 8px)收线(:32383-32395):近于 12+速 → 速度=残差(钉住)
  const num835 = e.ai0 * TILE - 8 - e.cx;
  const num836 = e.ai1 * TILE - 8 - e.cy;
  const num837 = Math.hypot(num835, num836);
  const ftwHook = !!game.world.seedFlags?.getGoodWorld;
  if (num837 < 12 + num834) {
    // :32462-32466 FTW:飞行中(localAI[3]=1)抵锚瞬间撒荆棘(SpawnPlanteraThorns,
    //   WorldGen.cs:76875——tile 655 随机游走线;R23a 补)
    if (ftwHook && l[3] === 1) { l[3] = 0; spawnPlanteraThorns(game, e.cx, e.cy); }
    e.vx = num835;
    e.vy = num836;
  } else {
    if (ftwHook) l[3] = 1;                     // :32471-32474 飞行中每 tick 置旗
    const s = num834 / num837;
    e.vx = num835 * s;
    e.vy = num836 * s;
  }
  // 朝本体旋转(:32396-32405)
  e.spin = Math.atan2(boss.cy - e.cy, boss.cx - e.cx) - Math.PI / 2;
  e.x += e.vx;
  e.y += e.vy;
}

// ============================================================================
// AI_053 世纪之花触须 264(NPC.cs:32406-32536):二阶段环绕本体漂移攻击。
// ai[0]/ai[1] = 环绕偏移(px,每 120-480t 随机重掷 ±100);环绕半径 200,
// 本体 <25%/10% 血各 +100;加速度 0.2(符号翻转 0.9 阻尼),速度钳 ±8;
// ai[3]>0 时锚定 ai[3]-1 指定的 NPC(原版多人分割);本体消失 → 自毁。
// ============================================================================
export function planteraTentacle2AI(e: Enemy, game: GameHooks, player: Player | null) {
  const l = la(e);
  // :32487-32497 FTW:每 tick 1/10 掷反射玩家弹幕(reflectsProjectiles;消费端
  //   projTargets.tryReflectProjectile——WeaponProj/Arrow/Dart 命中管线已接。
  //   非 FTW 世界不触该字段恒 false,R23a 补)
  if (game.world.seedFlags?.getGoodWorld) e.reflectsProjectiles = rnd(10) === 0;
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; l[0] = 0; }
  const boss = (game.enemies() as Enemy[]).find((n) => !n.dead && n.vanillaId === 262) ?? null;
  if (!boss) { e.hp -= 9999; if (e.hp <= 0) e.dead = true; return; }
  // 原版 :32426-32429:ai[3]>0 → 锚 ai[3]-1 的 NPC(本框架触须不设锚,恒随本体)
  const anchor = e.ai3 > 0
    ? (game.enemies() as Enemy[]).find((n) => !n.dead && n.id === e.ai3 - 1) ?? boss
    : boss;
  e.master = anchor; // 触须链渲染用（Renderer.drawPlanteraVine，Main.cs:22262-22285）
  // 偏移重掷(:32432-32439)
  l[0] -= 1;
  if (l[0] <= 0) {
    l[0] = rndRange(120, 480);
    e.ai0 = rndRange(-100, 101);
    e.ai1 = rndRange(-100, 101);
  }
  // 环绕半径随本体血量(:32442-32451);expert 动态半径 num843=1-life/lifeMax 用
  // 【触须自身】血量(NPC.cs:32531-32535,触须 lifeMax1000——被打残的触须轨道变宽;
  // 曾误用本体血量=全体触须随本体掉血同步外扩,R23a 修)+ 加速度 0.5(:32454-32459);
  // getGoodWorld 加速度 +4(:32460-32463)
  const expertTen = mainExpertMode(game.world);
  const ftwTen = !!game.world.seedFlags?.getGoodWorld;
  let orbit = 200;
  if (boss.hp < boss.maxHp * 0.25) orbit += 100;
  if (boss.hp < boss.maxHp * 0.1) orbit += 100;
  if (expertTen) orbit += 300 * (1 - e.hp / e.maxHp);
  const accTen = 0.2 + (expertTen ? 0.3 : 0) + (ftwTen ? 4 : 0);
  // 目标点 = 锚点 + 归一化偏移×半径;步进 accTen,符号翻转 0.9 阻尼(:32467-32509)
  let dx = anchor.cx + e.ai0 - anchor.cx;
  let dy = anchor.cy + e.ai1 - anchor.cy;
  const d = Math.hypot(dx, dy) || 1;
  dx = (dx / d) * orbit;
  dy = (dy / d) * orbit;
  if (e.cx < anchor.cx + dx) { e.vx += accTen; if (e.vx < 0 && dx > 0) e.vx *= 0.9; }
  else if (e.cx > anchor.cx + dx) { e.vx -= accTen; if (e.vx > 0 && dx < 0) e.vx *= 0.9; }
  if (e.cy < anchor.cy + dy) { e.vy += accTen; if (e.vy < 0 && dy > 0) e.vy *= 0.9; }
  else if (e.cy > anchor.cy + dy) { e.vy -= accTen; if (e.vy > 0 && dy < 0) e.vy *= 0.9; }
  e.vx = Math.max(-8, Math.min(8, e.vx));
  e.vy = Math.max(-8, Math.min(8, e.vy));
  // 朝向旋转(:32526-32535)
  if (dx > 0) { e.facing = 1; e.spin = Math.atan2(dy, dx); }
  if (dx < 0) { e.facing = -1; e.spin = Math.atan2(dy, dx) + 3.14; }
  void player;
  e.x += e.vx;
  e.y += e.vy;
}
