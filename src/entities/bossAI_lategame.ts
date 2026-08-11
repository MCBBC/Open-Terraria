// 后期三大 Boss AI 1:1 移植(Terarria1456 = 1.4.5.6 反编译源码,经典模式主链):
//   aiStyle 84  拜月教邪教徒 439  AI_084_LunaticCultist()        NPC.cs:64921-65957
//   aiStyle 120 光之女皇     636  AI_120_HallowBoss()           NPC.cs:46299-47302(+DashTo :47304)
//   aiStyle 121 史莱姆皇后   657  AI_121_QueenSlime()           NPC.cs:45543-46177(+FlyMovement :45467)
// 由 Enemy.fixedUpdate 的 aiStyle 分发调用(接线见文件尾「接线清单」);本文件不改动任何已有文件。
// 弹幕统一走 bossAI.shoot(Arrow 直飞桶);原版「定点预告→延时冲刺」类投射物(465/919/923)
// 收敛为带初速直飞(见各处注释)。expert/getGoodWorld/大师分支一律只注释不实现;netcode 跳过。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { spawnPart, shoot, losClear } from './bossAI';

// ===================== 共用工具(与 bossAI.ts 同语义,私有副本) =====================

/** 原版 MathHelper.Clamp */
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** 原版 Utils.GetLerpValue(clamped) */
const lerpValue = (from: number, to: number, t: number): number =>
  from === to ? (t < from ? 0 : 1) : clamp((t - from) / (to - from), 0, 1);
/** 原版 Vector2.Lerp */
const vLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 伤害/防御基值缓存(状态机每 tick 从基值派生临时修正,防重复乘膨胀;同 bossAI.baseStats) */
const baseStats = new WeakMap<Enemy, { dmg: number; def: number }>();
const baseOf = (e: Enemy): { dmg: number; def: number } => {
  let b = baseStats.get(e);
  if (!b) {
    // 首次进入时 def 可能已被别的状态改写——重新取原版数据基值兜底
    b = { dmg: e.def.damage, def: e.def.defense ?? 0 };
    if (e.vanilla) {
      b.dmg = e.vanilla.damage ?? b.dmg;
      b.def = e.vanilla.defense ?? b.def;
    }
    baseStats.set(e, b);
  }
  return b;
};

/** 原版 localAI[0..3] 的外部存储(Enemy 只有 ai0-ai3 四个槽) */
const localAI = new WeakMap<Enemy, { la0: number; la1: number; la2: number; la3: number }>();
const laOf = (e: Enemy): { la0: number; la1: number; la2: number; la3: number } => {
  let l = localAI.get(e);
  if (!l) { l = { la0: 0, la1: 0, la2: 0, la3: 0 }; localAI.set(e, l); }
  return l;
};

/** 原版 SimpleFlyMovement(NPC.cs:23866 雏形):逐轴向目标速度以加速度步进(钳 ±acc) */
function simpleFly(e: Enemy, dvx: number, dvy: number, acc: number): void {
  e.vx += clamp(dvx - e.vx, -acc, acc);
  e.vy += clamp(dvy - e.vy, -acc, acc);
}

/** 无碰撞积分(noTileCollide 族) */
function flyIntegrate(e: Enemy): void {
  e.x += e.vx;
  e.y += e.vy;
}

/** 地形碰撞(bossAI.collideGround 的私有副本:Queen Slime 走路/砸地需要) */
function collideGround(e: Enemy, game: GameHooks): void {
  const st = game.world.store;
  const tx = Math.floor(e.cx / TILE);
  const ty = Math.floor((e.y + e.h) / TILE);
  if (st.inBounds(tx, ty) && st.isSolid(tx, ty) && e.vy >= 0) {
    e.y = ty * TILE - e.h;
    e.vy = 0;
    e.onGround = true;
  } else {
    e.onGround = false;
  }
  const ty2 = Math.floor(e.y / TILE);
  if (st.inBounds(tx, ty2) && st.isSolid(tx, ty2) && e.vy < 0) {
    e.y = (ty2 + 1) * TILE;
    e.vy = 0;
  }
  const tx2 = Math.floor((e.x + e.w) / TILE);
  if (st.inBounds(tx2, Math.floor(e.cy / TILE)) && st.isSolid(tx2, Math.floor(e.cy / TILE)) && e.vx > 0) {
    e.x = tx2 * TILE - e.w; e.vx = 0;
  }
  const tx3 = Math.floor(e.x / TILE);
  if (st.inBounds(tx3, Math.floor(e.cy / TILE)) && st.isSolid(tx3, Math.floor(e.cy / TILE)) && e.vx < 0) {
    e.x = (tx3 + 1) * TILE; e.vx = 0;
  }
}

/** 朝玩家预测位置的单位向量(player.velocity*20 预判,NPC.cs:65380 系) */
function aimLead(e: Enemy, player: Player, fallbackX: number): { x: number; y: number } {
  const dx = player.cx + player.vx * 20 - e.cx;
  const dy = player.cy + player.vy * 20 - e.cy;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 0.0001) return { x: fallbackX, y: 0 };
  return { x: dx / d, y: dy / d };
}
/** 旋转 */
const rot = (x: number, y: number, a: number): [number, number] =>
  [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

// ===================== AI_084 拜月教邪教徒 439(NPC.cs:64921-65957) =====================
// 状态机(ai0): -1 出生显形(420t) / 0 选招(40t) / 1 飞掠占位 / 2 冰雾 464 / 3 火球 467 /
//   4 闪电 465 / 5 仪式瞬移(克隆体跳过) / 6 被打中真身后的硬直(克隆分支,跳过) /
//   7 远古之光(原版 NPC522,收敛为 468 直飞弹)/ 8 远古末日 NPC523(经典不被选中,保留状态体)。
// 经典数值: 冰 35 伤(:64930)/火 30 伤·18t×3(:64941-64946)/闪电 45 伤·20+80t(:64953-64958)/
//   光 20t×2(:64963-64967)/末日 20t×3(:64970-64973);半血防御 ×0.65(:64982-64985)。
// 选招表(:65160-65254 两张 switch 表合一;表尾拍把 ai3 复位 -1 → 下次完成攻击后回 0 重循环):
//   一阶段 12 拍 [冲,火,冲,冰,冲,雷,冲,火,冲,冰,冲,仪式] 循环;
//   二阶段 12 拍 [冲,火,冲,光,冲,雷,冲,光,冲,冰,冲,雷] 循环(原版二阶段不再仪式召克隆)。
const CULTIST_CYCLE_P1 = [0, 1, 0, 2, 0, 3, 0, 1, 0, 2, 0, 4];
const CULTIST_CYCLE_P2 = [0, 1, 0, 5, 0, 3, 0, 5, 0, 2, 0, 3];

/** 选招(:65131-65226 两张 switch 表合一;表尾拍把 ai3 复位 -1 → 下次完成攻击后回 0 重循环) */
function cultistPick(e: Enemy, phase2: boolean): number {
  const table = phase2 ? CULTIST_CYCLE_P2 : CULTIST_CYCLE_P1;
  const i = Math.floor(e.ai3);
  if (i < 0 || i >= table.length) { e.ai3 = -1; return 0; }
  if (i === table.length - 1) e.ai3 = -1; // :65175/:65225 表尾复位
  return table[i];
}

export function lunaticCultistAI(e: Enemy, game: GameHooks, player: Player | null): void {
  const la = laOf(e);
  if (!e.bInit) {
    // :65047-65057 localAI[0]==0:音效 + alpha=255 + ai[0]=-1(出生显形)
    e.bInit = true;
    e.ai0 = -1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    la.la0 = 1;
    e.spawnAlpha = 254;
    game.playSfx('roar', 0.6);
  }
  const b = baseOf(e);
  const phase2 = e.hp <= e.maxHp / 2;                       // flag :64928
  e.def.defense = Math.floor(phase2 ? b.def * 0.65 : b.def); // :64982-64985 半血防御 ×0.65

  // :65060-65088 玩家死/超 5600px → 消散退场
  if (!player || player.dead || Math.hypot(player.cx - e.cx, player.cy - e.cy) > 5600) {
    game.spawnParticles(e.cx, e.cy, '#6040A0', 14, 2.4);
    e.dead = true;
    return;
  }
  // 朝向(:65117-65120 sign(player.X - center.X))
  const face = Math.sign(player.cx - e.cx);
  if (face !== 0) e.facing = face;

  // ---- ai0 == -1 出生显形(:65059-65109):420t,前段不可选中;300t 起上浮 ----
  if (e.ai0 === -1) {
    e.spawnAlpha = Math.max(0, 254 - e.ai1 * 5); // :65066 alpha -= 5/tick
    e.iframes = 2; // flag3/flag4 → dontTakeDamage
    e.ai1 += 1;
    if (e.ai1 > 360) { e.vx *= 0.95; e.vy *= 0.95; }      // :65117-65123 收势阻尼
    else if (e.ai1 > 300) { e.vx = 0; e.vy = -1; }        // :65126-65130 velocity=-UnitY
    flyIntegrate(e);
    if (e.ai1 >= 420) { e.ai0 = 0; e.ai1 = 0; e.spawnAlpha = 0; }
    return;
  }

  // ---- ai0 == 0 选招(:65110-65336):40t 后按 ai3 拍号取招 ----
  if (e.ai0 === 0) {
    e.ai1 += 1;
    if (e.ai1 >= 40) {
      e.ai1 = 0;
      const pick = cultistPick(e, phase2);
      if (pick === 0) {
        // 飞掠占位(:65277-65336):无克隆体时环位恒为玩家正上 (0,-200)(num16=0),
        // num14 = ceil(距离/50) 至少 1;velocity = 位移/num14,ai1 = num14*2(隔拍移动)
        const destX = player.cx;
        const destY = player.cy - 200;
        const dist = Math.hypot(destX - e.cx, destY - e.cy);
        const num14 = Math.max(1, Math.ceil(dist / 50));
        e.vx = (destX - e.cx) / num14;
        e.vy = (destY - e.cy) / num14;
        e.x -= e.vx; e.y -= e.vy; // :65318-65321 whoAmI>=自身 → 选拍当帧回退(净位移 0)
        e.ai0 = 1;
        e.ai1 = num14 * 2;
      } else if (pick === 1) { e.ai0 = 3; } // 火球
      else if (pick === 2) { e.ai0 = 2; }   // 冰雾
      else if (pick === 3) { e.ai0 = 4; }   // 闪电
      else if (pick === 4) { e.ai0 = 5; }   // 仪式瞬移
      else if (pick === 5) { e.ai0 = 7; }   // 远古之光
      // pick === 6(远古末日)仅 expert 随机替换会命中(:65270-65275),经典不触发
    }
    flyIntegrate(e);
    return;
  }

  // ---- ai0 == 1 飞掠(:65338-65361):奇数拍回退位移 → 实际隔拍移动;期间无敌(flag3) ----
  if (e.ai0 === 1) {
    e.iframes = 2;
    const undo = Math.floor(e.ai1) % 2 !== 0 && e.ai1 !== 1; // :65341-65344
    if (!undo) flyIntegrate(e);
    e.ai1 -= 1;
    if (e.ai1 <= 0) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // ---- ai0 == 2 冰雾 464(:65362-65429):4t 时一发,35 伤,4 速直飞;持续 4+120 ----
  if (e.ai0 === 2) {
    if (e.ai1 >= 4 && (e.ai1 - 4) % 120 === 0) {
      const aim = aimLead(e, player, e.facing);
      const [ox, oy] = [e.cx + e.facing * 30, e.cy + 12];
      shoot(game, ox, oy, aim.x * 4, aim.y * 4, 35, 464);
      game.playSfx('roar', 0.35);
    }
    e.ai1 += 1;
    if (e.ai1 >= 4 + 120) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // ---- ai0 == 3 火球 467(:65430-65530):每 18t 一发×3,30 伤,(6+rand4) 速 ±0.52rad 散布;持续 4+18*3 ----
  if (e.ai0 === 3) {
    if (e.ai1 >= 4 && (e.ai1 - 4) % 18 === 0) {
      const aim = aimLead(e, player, e.facing);
      const spd = 6 + Math.random() * 4;
      const [dvx, dvy] = rot(aim.x * spd, aim.y * spd, (Math.random() - 0.5) * 2 * 0.5235987901687622);
      shoot(game, e.cx + e.facing * 30, e.cy + 12, dvx, dvy, 30, 467);
    }
    // 第三拍(num13==2)克隆体补射 468(:65462-65499)——无克隆体,跳过
    e.ai1 += 1;
    if (e.ai1 >= 4 + 18 * 3) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // ---- ai0 == 4 闪电 465(:65531-65622):20t 时在头顶 100px 撒球,45 伤;持续 20+80 ----
  if (e.ai0 === 4) {
    if (e.ai1 === 20) {
      // 原版 465 零速悬停后从天引雷(Projectile.AI 收敛:直飞 6 速朝玩家)
      const dx = player.cx - e.cx, dy = player.cy - (e.cy - 100);
      const d = Math.hypot(dx, dy) || 1;
      shoot(game, e.cx, e.cy - 100, dx / d * 6, dy / d * 6, 45, 465);
      game.playSfx('roar', 0.5);
    }
    e.ai1 += 1;
    if (e.ai1 >= 20 + 80) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // ---- ai0 == 5 仪式瞬移(:65623-65756):0-30 淡出,30 瞬移,30-90 隐形,90-120 淡入,
  //      120-420 可被选中(打真身窗口);持续 420 ----
  if (e.ai0 === 5) {
    const t = e.ai1;
    if (t >= 0 && t < 30) {
      e.spawnAlpha = Math.floor((t / 30) * 254);
      e.iframes = 2; // flag3/flag4
    } else if (t >= 30 && t < 90) {
      e.spawnAlpha = 254;
      e.iframes = 2;
      if (t === 30) {
        // :65636-65648 原版为绕自身半径 180 的环位重定位(≤180px);
        // 收敛:直接瞬移到绕玩家椭圆 (300,200) 8 环位中最远一格——即下一拍飞掠的目的地,
        // 保留「消失→别处再现」语义且产生 >300px 位置跳变。
        let far = 0, farD = -1;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const px = player.cx + Math.cos(a) * 300;
          const py = player.cy + Math.sin(a) * 200;
          const d = Math.hypot(px - e.cx, py - e.cy);
          if (d > farD) { farD = d; far = k; }
        }
        const a = (far / 8) * Math.PI * 2;
        e.x = player.cx + Math.cos(a) * 300 - e.w / 2;
        e.y = player.cy + Math.sin(a) * 200 - e.h / 2;
        e.vx = 0; e.vy = 0;
        game.spawnParticles(e.cx, e.cy, '#8060D0', 18, 2.6);
        game.playSfx('roar', 0.7);
        // 克隆体(NPC 440,环位补位 + 490 仪式弹幕,:65636-65675)按任务要求跳过
      }
    } else if (t >= 90 && t < 120) {
      e.spawnAlpha = Math.floor(254 * (1 - (t - 90) / 30));
      e.iframes = 2;
    } else {
      e.spawnAlpha = 0; // 120-420 可选中(chaseable)
    }
    e.ai1 += 1;
    if (e.ai1 >= 420) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // ---- ai0 == 6 打中真身硬直(:65757-65770,克隆分支专用)——跳过 ----

  // ---- ai0 == 7 远古之光(:65796-65877):每 20t 一轮×2,每轮 5 发呈扇面(步进 2π/25);持续 4+20*2 ----
  if (e.ai0 === 7) {
    if (e.ai1 >= 4 && (e.ai1 - 4) % 20 === 0) {
      e.facing = Math.sign(player.cx - e.cx) || e.facing; // :65842-65846
      const aim = aimLead(e, player, e.facing);
      const num47 = (Math.PI * 2) / 25; // :65856
      for (let i = 0; i < 5; i++) {
        const [dvx, dvy] = rot(aim.x * 8, aim.y * 8, num47 * i - (Math.PI * 2 / 5 - num47) / 2); // :65860
        // 简化项:原版生成 5 只 NPC522 远古之光(:65862-65865,aiStyle 100 直飞核未移植,
        // 现分发会落 zombieAI),按同弹道收敛为 468 直飞弹,伤取同段克隆火球 18(:65837)
        shoot(game, e.cx + e.facing * 30, e.cy + 12 + 7, dvx, dvy, 18, 468);
      }
      game.playSfx('roar', 0.5);
    }
    e.ai1 += 1;
    if (e.ai1 >= 4 + 20 * 2) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // ---- ai0 == 8 远古末日(:65873-65932):玩家附近随机空位撒 NPC523(最多 1 只);持续 4+20*3 ----
  // 经典选招表不含 6(expert 随机替换专属,:65270-65275),此处仅保留状态体防外部置入。
  if (e.ai0 === 8) {
    if (e.ai1 >= 4 && (e.ai1 - 4) % 20 === 0) {
      const st = game.world.store;
      const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
      const etx = Math.floor(e.cx / TILE), ety = Math.floor(e.cy / TILE);
      for (let tries = 0; tries < 100; tries++) {
        const tx = ptx + Math.floor(Math.random() * 41) - 20;
        const ty = pty + Math.floor(Math.random() * 41) - 20;
        const nearPlayer = Math.abs(ty - pty) <= 7 && Math.abs(tx - ptx) <= 7;
        const nearSelf = Math.abs(ty - ety) <= 3 && Math.abs(tx - etx) <= 3;
        if (nearPlayer || nearSelf || !st.inBounds(tx, ty) || st.isSolid(tx, ty)) continue;
        const n = spawnPart(game, e, 523);
        if (n) { n.x = tx * TILE + 8 - n.w / 2; n.y = ty * TILE + 8 - n.h / 2; n.vx = 0; n.vy = 0; n.bInit = true; }
        break;
      }
    }
    e.ai1 += 1;
    if (e.ai1 >= 4 + 20 * 3) { e.ai0 = 0; e.ai1 = 0; e.ai3 += 1; e.vx = 0; e.vy = 0; }
    return;
  }

  // 未知状态:回选招
  e.ai0 = 0; e.ai1 = 0;
}

// ===================== AI_120 光之女皇 636(NPC.cs:46299-47302) =====================
// 状态机(ai0): 0 出生(180t) / 1 悬浮蓄力枢纽(DashTo 靠近 10t + 减速,45t(二阶段 20t)选招)/
//   2 彩虹射线 873 / 4 光枪墙 919 / 5 永恒彩虹 872 / 6 太阳舞 923 / 7 光枪回环 919(二阶段)/
//   8,9 刀阵冲刺(±50 速,6-40t 无敌蓄力,40-90t 伤害 ×1.5)/ 10 半血变身传送 /
//   13 淡出退场(目标失效/超 6400px)。3(874 天降极光)与 11/12 为 expert 专属拍,跳过。
// 经典弹幕伤害(:46326-46345): 919 墙 50 / 919 回环 70 / 873 45 / 872 45 / 923 50 / 874 40。
// 选招表(:46400-46490): 一阶段 10 拍 [2,8,6,8,5,2,8,4,8,5] 循环,血 ≤50% 强制 10(变身);
//   二阶段 9 拍 [7,2,8,5,2,6,6,4,8] 循环(expert 追加 11/12 拍已剔除)。
const EMPRESS_CYCLE_P1 = [2, 8, 6, 8, 5, 2, 8, 4, 8, 5];
const EMPRESS_CYCLE_P2 = [7, 2, 8, 5, 2, 6, 6, 4, 8];

/** 原版 AI_120_HallowBoss_DashTo(:47304-47317):目标上移 300,>200 再回退 100,
 *  速度 = lerp(单位向量*min(len,18), vector/6, lerpValue(100,600,len)) */
function empressDashTo(e: Enemy, tx0: number, ty0: number): void {
  let tx = tx0, ty = ty0 - 300;
  const d0 = Math.hypot(tx - e.cx, ty - e.cy);
  if (d0 > 200) {
    const ux = (tx - e.cx) / (d0 || 1), uy = (ty - e.cy) / (d0 || 1);
    tx -= ux * 100; ty -= uy * 100;
  }
  const vx = tx - e.cx, vy = ty - e.cy;
  const len = Math.hypot(vx, vy) || 1;
  const lv = lerpValue(100, 600, len);
  const cap = Math.min(len, 18);
  e.vx = vLerp((vx / len) * cap, vx / 6, lv);
  e.vy = vLerp((vy / len) * cap, vy / 6, lv);
}

/** 悬浮趋近(:46502 系):距 (玩家+偏移) > 40 才以 SimpleFlyMovement(dir*12, 0.5) 靠近 */
function empressHover(e: Enemy, player: Player, ox: number, oy: number, spdMul = 1, accMul = 1): void {
  const tx = player.cx + ox, ty = player.cy + oy;
  if (Math.hypot(tx - e.cx, ty - e.cy) > 40) {
    const dx = tx - e.cx, dy = ty - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    simpleFly(e, (dx / d) * 12 * spdMul, (dy / d) * 12 * spdMul, 0.5 * accMul);
  }
}

export function empressOfLightAI(e: Enemy, game: GameHooks, player: Player | null): void {
  if (!e.bInit) {
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.spawnAlpha = 254; // Opacity = ai1/180 渐显(:46410)
    game.spawnParticles(e.cx, e.cy - 80, '#FFE080', 20, 2.5);
  }
  const phase2 = e.ai3 === 1 || e.ai3 === 3; // AI_120_HallowBoss_IsInPhase2 :46179
  const b = baseOf(e);
  // :47296-47301 二阶段防御 ×1.2(ShouldEmpressBeEnraged 白天暴怒分支按任务不实现:白天不逃不暴怒)
  e.def.defense = Math.floor(phase2 ? b.def * 1.2 : b.def);

  // 目标失效/超 6400px → 淡出退场(:46437-46444/:46595 num36=13;此后只有 13 态不触 player)
  if ((!player || player.dead || Math.hypot(player.cx - e.cx, player.cy - e.cy) > 6400) && e.ai0 !== 13) {
    e.ai0 = 13; e.ai1 = 0; e.ai2 += 1;
    e.vx /= 4; e.vy /= 4;
  }
  if (player) e.facing = player.cx > e.cx ? 1 : -1;
  if (!player) {
    // 目标彻底失效:上方已强制 ai0=13,此处推进淡出自毁(:47236/:47264-47271)
    e.spawnAlpha = Math.min(254, e.spawnAlpha + 5);
    e.vx *= 0.95; e.vy *= 0.95;
    e.ai1 += 1;
    flyIntegrate(e);
    if (e.ai1 >= 20 && e.spawnAlpha >= 254) e.dead = true;
    return;
  }

  // 冲刺窗口伤害倍率(num16,:46352/:47006):8/9 态 40-90t 时 ×1.5
  const dashBoost = (e.ai0 === 8 || e.ai0 === 9) && e.ai1 > 40 && e.ai1 <= 90;
  e.def.damage = Math.round(b.dmg * (dashBoost ? 1.5 : 1));

  switch (e.ai0) {
    // ---- 0 出生(:46370-46422):velocity=(0,5) 后 0.95 阻尼,180t 渐显;全程无敌(flag6=false) ----
    case 0: {
      if (e.ai1 === 0) { e.vx = 0; e.vy = 5; }
      e.iframes = 2; // :46408-46409 flag6=false → dontTakeDamage
      e.vx *= 0.95; e.vy *= 0.95;
      e.spawnAlpha = Math.max(0, 254 - Math.floor(clamp(e.ai1 / 180, 0, 1) * 254));
      e.ai1 += 1;
      if (e.ai1 >= 180) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 1 悬浮蓄力枢纽(:46418-46511):前 10t DashTo 冲近,之后阻尼;到时按表选招 ----
    case 1: {
      const dur = phase2 ? 20 : 45; // num34 :46419(expert/getGoodWorld 折半分支不实现)
      if (e.ai1 <= 10) empressDashTo(e, player.cx, player.cy);
      if (Math.hypot(e.vx, e.vy) > 16 && e.ai1 > 10) { e.vx /= 2; e.vy /= 2; }
      e.vx *= 0.92; e.vy *= 0.92;
      e.ai1 += 1;
      if (e.ai1 < dur) break;
      const table = phase2 ? EMPRESS_CYCLE_P2 : EMPRESS_CYCLE_P1;
      let next = table[Math.floor(e.ai2) % table.length];
      if (!phase2 && e.hp / e.maxHp <= 0.5) next = 10; // :46463 半血强制变身
      if (next === 8 && player.cx > e.cx) next = 9;     // :46493 冲刺方向
      e.ai0 = next; e.ai1 = 0; e.ai2 += 1;
      break;
    }
    // ---- 2 彩虹射线 873(:46512-46649):悬玩家左上(-150,-250),每 3t 一发直飞,60t 止 ----
    case 2: {
      empressHover(e, player, -150, -250);
      const dur = 60 + (90 - (phase2 ? 15 : 0)); // num90 - num17 :46517/:46356
      if (Math.floor(e.ai1) % 3 === 0 && e.ai1 < 60) {
        const [dvx, dvy] = rot(0, -6, (Math.PI / 2) * (Math.random() * 2 - 1));
        shoot(game, e.cx - 55, e.cy - 30, dvx, dvy, 45, 873);
      }
      e.ai1 += 1;
      if (e.ai1 >= dur) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 4 光枪墙 919(:46695-46779):悬玩家上 (0,-350),每 4t 在玩家周围 300px 环上布枪 ----
    case 4: {
      empressHover(e, player, 0, -350);
      const dur = 100 + (20 - (phase2 ? 15 : 0));
      // :46715 每 4t 布一杆;:46734 距玩家 >2400 跳过当拍(原版 continue,计时不断)
      if (Math.floor(e.ai1) % 4 === 0 && e.ai1 < 100 && Math.hypot(player.cx - e.cx, player.cy - e.cy) <= 2400) {
        const num82 = 4; // 经典枪数(expert 5)
        const num85 = Math.floor(e.ai1) / 4;
        let ux = Math.cos(Math.PI / (num82 * 2) + num85 * (Math.PI / num82));
        let uy = Math.sin(Math.PI / (num82 * 2) + num85 * (Math.PI / num82));
        ux += ux > 0 ? 0.5 : -0.5; // 经典横向外扩(:46725-46727)
        const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        if (player.vx * ux + player.vy * uy > 0) { ux = -ux; uy = -uy; } // 逆着玩家速度布枪(:46738)
        const leadX = player.cx + player.vx * 90, leadY = player.cy + player.vy * 90;
        let px = player.cx + ux * 300 - player.vx * 30;
        let py = player.cy + uy * 300 - player.vy * 30;
        const pd = Math.hypot(px - player.cx, py - player.cy);
        if (pd < 300) { // 环距不足外推(:46724-46731)
          const ex = player.cx - px, ey = player.cy - py;
          const el = Math.hypot(ex, ey) || 1;
          px = player.cx - (ex / el) * 300; py = player.cy - (ey / el) * 300;
        }
        const ax = leadX - px, ay = leadY - py;
        const al = Math.hypot(ax, ay) || 1;
        // 原版 919 零速预告后沿 v4 方向冲刺(Projectile.AI 收敛:12 速直飞)
        shoot(game, px, py, (ax / al) * 12, (ay / al) * 12, 50, 919, 240);
      }
      e.ai1 += 1;
      if (e.ai1 >= dur) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 5 永恒彩虹 872(:46780-46870):悬玩家上,开场 13 发环形彩弹(8 速) ----
    case 5: {
      empressHover(e, player, 0, -350);
      const dur = 42 + (30 - (phase2 ? 15 : 0));
      if (Math.floor(e.ai1) % 42 === 0 && e.ai1 < 42) {
        const base = Math.random() * Math.PI * 2;
        for (let k = 0; k < 13; k++) {
          const t = k / 13;
          const [ux, uy] = rot(0, 1, Math.PI / 2 + Math.PI * 2 * t + base);
          const [ox, oy] = rot(ux, uy, -Math.PI / 2);
          shoot(game, e.cx + 55 + ox * 30, e.cy - 30 + oy * 30, ux * 8, uy * 8, 45, 872);
        }
        game.playSfx('roar', 0.4);
      }
      e.ai1 += 1;
      if (e.ai1 >= dur) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 6 太阳舞 923(:46871-46935):悬玩家上 (-80,-500) 低速,每 60t 一环 6 发,3 环 ----
    case 6: {
      empressHover(e, player, -80, -500, 0.3, 0.7);
      const dur = 180 + (120 - (phase2 ? 15 : 0));
      if (Math.floor(e.ai1) % 60 === 0 && e.ai1 < 180) {
        const volley = Math.floor(e.ai1) / 60;
        const flip = player.cx > e.cx ? 1 : 0;
        for (let t = 0; t < 1; t += 1 / 6) {
          const slot = (t + (1 / 6) * 0.5 + volley * (1 / 6) * 0.5) % 1;
          const a = Math.PI * 2 * (slot + flip);
          // 原版 923 零速绕体公转(收敛:8 速放射)
          shoot(game, e.cx, e.cy - 100, Math.cos(a) * 8, Math.sin(a) * 8, 50, 923, 240);
        }
      }
      e.ai1 += 1;
      if (e.ai1 >= dur) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 7 光枪回环 919(二阶段,:46936-47049):每 60t 以玩家为中心布 13 连枪线,4 线 ----
    case 7: {
      empressHover(e, player, 0, -350, 0.4, 1);
      const dur = 240 + (20 - (phase2 ? 15 : 0));
      if (Math.floor(e.ai1) % 60 === 0 && e.ai1 < 240) {
        const line = Math.floor(e.ai1) / 60;
        let cx0 = player.cx, cy0 = player.cy;
        let dirX = 0, dirY = 0, axX = 0, axY = 0;
        const span = 1950; // num76 = 13*150 :46961
        switch (line) { // :46976-47011 四线几何
          case 0: cx0 += -span / 2; dirX = 0; dirY = span; axX = 1; axY = 0; break;
          case 1: cx0 += span / 2; cy0 += 75; dirX = 0; dirY = span; axX = -1; axY = 0; break;
          case 2: cx0 += -span * 0.4; cy0 += -span * 0.4; dirX = span * 1.4; dirY = 0; axX = 1; axY = 1; break;
          default: cx0 += span * 0.4 + 75; cy0 += -span * 0.4; dirX = -span * 1.4; dirY = 0; axX = -1; axY = 1; break;
        }
        const al = Math.hypot(axX, axY) || 1;
        for (let t = 0; t <= 1.0001; t += 1 / 13) {
          const ox = cx0 + dirX * (t - 0.5), oy = cy0 + dirY * (t - 0.5);
          shoot(game, ox, oy, (axX / al) * 12, (axY / al) * 12, 70, 919, 240);
        }
        game.playSfx('roar', 0.45);
      }
      e.ai1 += 1;
      if (e.ai1 >= dur) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 8/9 刀阵冲刺(:47053-47089):0-40t 冲到玩家侧后 550px(6-40t 无敌),
    //      40-90t 以 ±50 横速突进(伤害 ×1.5),其后 0.92 阻尼 ----
    case 8:
    case 9: {
      const side = e.ai0 === 8 ? -1 : 1; // num33 :47056
      if (e.ai1 <= 40) {
        if (e.ai1 >= 6) e.iframes = 2; // flag6 → dontTakeDamage(:47058)
        const destX = player.cx + side * -550, destY = player.cy;
        const dx = destX - e.cx, dy = destY - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        simpleFly(e, (dx / d) * 12, (dy / d) * 12, 1.0);
        if (e.ai1 === 40) { e.vx *= 0.3; e.vy *= 0.3; }
      } else if (e.ai1 <= 90) {
        e.vx = vLerp(side * 50, e.vx, 0.05);
        e.vy = vLerp(0, e.vy, 0.05);
        if (e.ai1 === 90) { e.vx *= 0.7; e.vy *= 0.7; }
      } else {
        e.vx *= 0.92; e.vy *= 0.92;
      }
      e.ai1 += 1;
      if (e.ai1 >= 90 + (20 - (phase2 ? 15 : 0))) { e.ai0 = 1; e.ai1 = 0; }
      break;
    }
    // ---- 10 半血变身(:47106-47135):90t 时传送玩家上 250 处并 ai3 0→1(进入二阶段) ----
    case 10: {
      if (e.ai1 >= 30 && e.ai1 <= 170) e.iframes = 2; // flag6 → dontTakeDamage(:47110)
      e.vx *= 0.95; e.vy *= 0.95;
      if (e.ai1 === 90) {
        if (e.ai3 === 0) e.ai3 = 1; // ai3==2(白天暴怒)分支不实现
        e.x = player.cx - e.w / 2;
        e.y = player.cy - 250 - e.h / 2;
        game.spawnParticles(e.cx, e.cy, '#FFEE90', 24, 3);
        game.playSfx('roar', 0.8);
      }
      e.ai1 += 1;
      if (e.ai1 >= 180 + (20 - (phase2 ? 15 : 0))) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; }
      break;
    }
    // ---- 13 淡出退场(:47226-47281):alpha 渐隐,全隐后移除 ----
    case 13: {
      e.spawnAlpha = Math.min(254, e.spawnAlpha + 5);
      e.ai1 += 1;
      if (e.ai1 >= 20 && e.spawnAlpha >= 254) e.dead = true;
      break;
    }
    default:
      e.ai0 = 1; e.ai1 = 0;
      break;
  }
  // :47292 alpha 渐隐回落(0/13 态各自管控 spawnAlpha,不参与)
  if (e.ai0 !== 0 && e.ai0 !== 13) e.spawnAlpha = Math.max(0, e.spawnAlpha - 5);
  flyIntegrate(e);
}

// ===================== AI_121 史莱姆皇后 657(NPC.cs:45543-46177) =====================
// 状态机(ai0): 0 待机(一阶段地面/二阶段 FlyMovement) / 1 传送后显形 / 2 传送消散 /
//   3 走路连跳(-8,-8,-6,-13 四连) / 4 升空砸地(ai2=0 升空 60t → ai2=1 重力坠,落地撒 922) /
//   5 凝胶环(ai2=0 蓄 50t → ai2=1 撒 926 环)。
// 半血(flag2)进二阶段:悬浮 FlyMovement + 攻速变化 + 暴怒(离开神圣之地)分支按任务跳过。
// 经典数值(:45546-45552): 砸地 922 40 伤 / 凝胶环 926 30 伤;砸地蓄力 30t(二阶段 10t);
//   凝胶环 6 发(二阶段 10 发);仆从按掉血 2%(二阶段 1.5%)撒 1-2 只 NPC 658/659/660。
const QUEEN_MINION_VANILLA = [658, 659, 660]; // vanilla :46134-46146 蓝/粉/紫仆从(1.4.0.5 与 1.4.5.6 同 id)
// 658-660 未入 vanilla-npcs.json(提取遗漏)时的兜底:全部取真实史莱姆族——
// 任务清单的 535/536/537 实为 SlimeSpiked/TheBride(僵尸!)/SandSlime(NPCID.cs:12135-12139),
// 536 不可用,故以 16 蓝史莱姆补位
const QUEEN_MINION_FALLBACK = [535, 537, 16];

/** AI_015_KingSlime_FindTeleportSpot(NPC.cs:43402-43434)收敛:anti → 玩家脚下;
 *  否则玩家 10 格半径内找"脚下实心 + 头顶 7 格开阔"的随机格,Bottom 落点返回(:43417-43418) */
function queenTeleportSpot(game: GameHooks, player: Player, anti: boolean): { x: number; y: number; found: boolean } {
  if (anti) return { x: player.x + player.w / 2, y: player.y + player.h, found: false }; // :43406-43409
  const st = game.world.store;
  const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
  const cands: Array<[number, number]> = [];
  for (let x = ptx - 10; x <= ptx + 10; x++) {
    for (let y = pty - 10; y <= pty + 10; y++) {
      if (!st.inBounds(x, y) || !st.isSolid(x, y)) continue;
      let clear = true;
      for (let k = 1; k <= 7; k++) {                       // 头顶 7 格(BuildCache 10/7 参数)
        if (st.inBounds(x, y - k) && st.isSolid(x, y - k)) { clear = false; break; }
      }
      if (clear) cands.push([x, y]);
    }
  }
  if (cands.length > 0) {
    const [x, y] = cands[Math.floor(Math.random() * cands.length)];
    return { x: x * TILE + TILE / 2, y: y * TILE, found: true };
  }
  return { x: player.x + player.w / 2, y: player.y + player.h, found: false }; // :43430-43433 兜底
}

/** AI_121_QueenSlime_FlyMovement(:45467-45542):12 速/0.085 加速度趋近玩家上方 250,
 *  反向且 >100px 时加速度 ×2;旋转 = vx*0.1 钳 ±0.5 */
function queenFlyMovement(e: Enemy, game: GameHooks, player: Player): void {
  e.onGround = false;
  const spd = 12, accBase = 0.085, hover = 250;
  let tx = player.cx, ty = player.cy - hover;
  if (losClear(game, e.cx, e.cy, player.cx, player.cy)) {
    tx = player.cx; ty = player.cy - hover;
  } else {
    // :45478-45496 无视线 → 逐级上探玩家上方第一个实心格下方(简化:玩家上方 16px 一档,探 16 档)
    const st = game.world.store;
    let found = false;
    for (let i = 0; i < 16; i++) {
      const py = player.cy - 16 * i;
      const ptx = Math.floor(player.cx / TILE), pty = Math.floor(py / TILE);
      if (st.inBounds(ptx, pty) && st.isSolid(ptx, pty)) {
        tx = player.cx; ty = py + 16;
        found = true;
        break;
      }
    }
    if (!found) { tx = player.cx; ty = player.cy; }
  }
  let dvx = tx - e.cx, dvy = ty - e.cy;
  const dist = Math.hypot(dvx, dvy);
  let acc = accBase;
  if (Math.abs(dvx) < 40) dvx = e.vx;                       // :45512-45514
  const lim = spd - 2;
  if (dist > 100 && ((e.vx < -lim && dvx > 0) || (e.vx > lim && dvx < 0))) acc *= 2; // :45516-45519
  if (dist < 40) { dvx = e.vx; dvy = e.vy; }                // :45521-45522
  else if (dist < 80) { dvx = (dvx / (dist || 1)) * spd * 0.65; dvy = (dvy / (dist || 1)) * spd * 0.65; }
  else { dvx = (dvx / (dist || 1)) * spd; dvy = (dvy / (dist || 1)) * spd; }
  simpleFly(e, dvx, dvy, acc);
  e.spin = clamp(e.vx * 0.1, -0.5, 0.5); // :45536-45541
}

export function queenSlimeAI(e: Enemy, game: GameHooks, player: Player | null): void {
  const la = laOf(e);
  if (!e.bInit) {
    // :45559-45566 localAI[0]==0:ai[1]=-100,localAI[0]=lifeMax
    e.bInit = true;
    e.ai0 = 0; e.ai1 = -100; e.ai2 = 0; e.ai3 = 0;
    la.la0 = e.maxHp;
  }
  const phase2 = e.hp <= e.maxHp / 2; // flag2 :45552
  // 掉血阈值撒仆从(:46147-46177):localAI[0] 记上次标记血量,差值超 2%(二阶段 1.5%)即撒
  if (la.la0 >= e.maxHp / 2 && e.hp < e.maxHp / 2) {
    la.la0 = e.hp;            // :46142-46148 进二阶段复位状态
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
  }
  const b = baseOf(e);
  e.def.damage = b.dmg;
  e.def.defense = b.def;
  // 玩家死/超 500 格 → 鼓励离场(EncourageDespawn:45576;简化为远距上浮,不清除)
  if (!player || player.dead || Math.abs(e.cx - player.cx) / 16 > 500) {
    e.encourageDespawn(10); // :45574 二次判定后仍失败 → EncourageDespawn(10)
    if (player) e.facing = player.cx < e.cx ? 1 : -1; // 背对玩家（:45576-45582）
    e.vy -= 0.06;
    e.y += e.vy; e.x += e.vx;
    e.spin = clamp(e.vx * 0.1, -0.5, 0.5);
    return;
  }
  const dirToPlayer = player.cx >= e.cx ? 1 : -1;
  e.facing = dirToPlayer;

  // 传送蓄能(ai3,一阶段专属 :45576-45618):无视线或高差 >320 时 +1.5/t,否则 -1/t;
  // 满 300 且落地待机 → 进传送(2)。落点 = AI_015_KingSlime_FindTeleportSpot(NPC.cs:43402)
  // 收敛:玩家 10 格半径内"脚下实心+头顶 7 格开阔"的随机格(:43412 BuildCache 10/7 参数);
  // 反挂机(蓄满 360 或距玩家 >2000)→ 直接落到玩家脚下(:43404-43410)。
  if (!phase2) {
    const blocked = !losClear(game, e.cx, e.cy, player.cx, player.cy) || Math.abs(e.y - (player.y + player.h)) > 320;
    if (blocked) e.ai3 += 1.5;
    else e.ai3 = Math.max(0, e.ai3 - 1);
    if (e.ai3 >= 300 && e.ai0 === 0 && e.vy === 0 && e.onGround) {
      const anti = e.ai3 >= 360 || Math.hypot(player.cx - e.cx, player.cy - e.cy) > 2000; // :45588-45595
      if (e.ai3 >= 360) e.ai3 = 360;      // :45591-45593
      const spot = queenTeleportSpot(game, player, anti);
      la.la1 = spot.x; la.la2 = spot.y;
      if (anti || spot.found) { e.ai0 = 2; e.ai1 = 0; }
      else e.ai3 = 0;                     // :45596-45599 找不到落点 → 重攒
    }
  }

  // noGravity/noTileCollide 置位(:45634-45635 默认关;case 4/5 与二阶段飞行开启)——
  // 原版 case 4 整段(含 ai2=0 升空)置 noGravity,故一阶段升空同样免重力
  const flying = e.ai0 === 5 || (e.ai0 === 4 && e.ai2 === 0) || (phase2 && e.ai0 === 0);
  if (!flying) {
    // 通用重力(NPC.cs:91519-91524,!noGravity 时 +0.3 钳 maxFallSpeed 10;
    // 俯冲段(:45945)自身 +1 钳 14 与此叠加,实际仍受 10 上限——与原版一致)
    if (!e.onGround) e.vy += 0.3;
    if (e.vy > 10) e.vy = 10;
  } else {
    e.onGround = false;
  }

  switch (e.ai0) {
    // ---- 0 待机(:45628-45686):地面摩擦 / 二阶段飞行;ai1 过阈值(60/120)选下一招 ----
    case 0: {
      if (phase2) {
        queenFlyMovement(e, game, player);
      } else if (e.onGround) {
        e.vx *= 0.8;
        if (Math.abs(e.vx) < 0.1) e.vx = 0;
        e.spin = 0;
      }
      // :45673 一阶段空中(!flag2 && velocity.Y!=0)不计数,落地后才推进选拍
      if (!phase2 && !e.onGround && e.vy !== 0) break;
      e.ai1 += 1;
      const idle = phase2 ? 120 : 60; // num10 :45648-45652
      if (e.ai1 > idle) {
        e.ai1 = 0;
        if (phase2) {
          // :45660-45678 二阶段:默认砸地(ai2=1),玩家在上方或横距 >250 改凝胶环
          let next = Math.random() < 0.5 ? 4 : 5;
          let sub = next === 4 ? 1 : 0;
          if (next === 4 && (player.y + player.h < e.y + e.h || Math.abs(player.cx - e.cx) > 250)) {
            next = 5; sub = 0;
          }
          e.ai0 = next; e.ai2 = sub;
        } else {
          // :45680-45686 一阶段:随机 跳(3)/砸地(4)/凝胶环(5)
          const r = Math.floor(Math.random() * 3);
          e.ai0 = r === 0 ? 3 : r === 1 ? 4 : 5;
          e.ai2 = 0;
        }
      }
      break;
    }
    // ---- 1 传送后显形(:45689-45720):30t;缩放动画(num3)为纯视觉,跳过 ----
    case 1: {
      e.spin = 0;
      game.spawnParticles(e.cx, e.cy, '#7040A0', 2, 1.2);
      e.ai1 += 1;
      if (e.ai1 >= 30) { e.ai0 = 0; e.ai1 = 0; }
      break;
    }
    // ---- 2 传送消散(:45721-45758):60t 后落位到 la1/la2(底部对齐) ----
    case 2: {
      e.spin = 0;
      e.ai1 += 1;
      if (e.ai1 >= 60 && la.la1 !== 0) {
        e.iframes = 2; // dontTakeDamage = hide(:46138)
        e.x = la.la1 - e.w / 2;
        e.y = la.la2 - e.h;
        e.vx = 0; e.vy = 0;
        e.ai0 = 1; e.ai1 = 0;
        game.spawnParticles(e.cx, e.cy, '#7040A0', 16, 2.4);
      } else if (e.ai1 > 90) {
        e.ai0 = 1; e.ai1 = 0; // 找不到落点的兜底
      }
      break;
    }
    // ---- 3 走路连跳(:45759-45844):四连跳 vy=-8/-8/-6/-13,横速递增 4/4.5/4/3.5;
    //      落地重跳倒计时 ai1(血量 <66%/<33% 各 +4/t 加速) ----
    case 3: {
      e.spin = 0;
      if (e.onGround) {
        e.vx *= 0.8;
        if (Math.abs(e.vx) < 0.1) e.vx = 0;
        e.ai1 += 4;
        if (e.hp < e.maxHp * 0.66) e.ai1 += 4;
        if (e.hp < e.maxHp * 0.33) e.ai1 += 4;
        if (e.ai1 >= 0) {
          if (e.ai2 === 3) {
            e.vy = -13; e.vx += 3.5 * dirToPlayer;
            e.ai1 = 0; e.ai2 = 0;
            e.ai0 = 0; // 大跳结束回待机
            game.spawnParticles(e.cx, e.y + e.h, '#8060C0', 10, 2.2);
          } else if (e.ai2 === 2) {
            e.vy = -6; e.vx += 4.5 * dirToPlayer;
            e.ai1 = -40; e.ai2 += 1;
          } else {
            e.vy = -8; e.vx += 4 * dirToPlayer;
            e.ai1 = -40; e.ai2 += 1;
          }
          e.onGround = false;
        }
      } else {
        // 空中横移(:45819-45844):朝玩家 0.2/t,上限 3(反向时 0.93 阻尼)
        const cap = 3;
        if ((dirToPlayer === 1 && e.vx < cap) || (dirToPlayer === -1 && e.vx > -cap)) {
          if ((dirToPlayer === -1 && e.vx < 0.1) || (dirToPlayer === 1 && e.vx > -0.1)) {
            e.vx += 0.2 * dirToPlayer;
          } else {
            e.vx *= 0.93;
          }
        }
      }
      break;
    }
    // ---- 4 升空砸地(:45845-46006):ai2=0 飞向玩家上 384(60t) → ai2=1 重力坠(蓄力 30/10t,
    //      vy+1/t 钳 14);落地撒 922 冲击波(40 伤)+ 尘暴,回待机 ----
    case 4: {
      e.spin *= 0.9;
      if (e.ai2 === 1) {
        const num13 = phase2 ? 10 : 30; // :45856-45860
        e.vx *= 0.8;
        if (!e.onGround) {
          const prev = e.ai1;
          e.ai1 += 1;
          if (e.ai1 >= num13) {
            if (prev < num13) game.playSfx('roar', 0.5);
            e.vy += 1;
            if (e.vy === 0) e.vy = 0.01;
            if (e.vy >= 14) e.vy = 14; // num17 = 14(经典;getGoodWorld 15.99 不实现)
          } else {
            e.vy *= 0.8;
          }
          if (phase2 && e.ai1 > num13 + 120) { // 二阶段超时兜底(:45931-45938)
            e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.vy *= 0.8;
          }
        } else {
          // 落地冲击(:45870-45890):922 冲击波 + 尘暴 + 回待机
          shoot(game, e.cx, e.y + e.h, 0, 0, 40, 922, 240);
          game.spawnParticles(e.cx, e.y + e.h, '#B090E0', 20, 3);
          game.playSfx('roar', 0.7);
          e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
        }
      } else {
        // ai2=0 升空(:45967-46005):前 30t 原地蓄势(:45972-45974),之后 20 速冲向
        // 玩家上方 384(超 500 格用自身),满 60t 转 ai2=1 俯冲
        e.ai1 += 1;
        if (e.ai1 >= 30) {
          let tx = e.cx, ty = e.cy - 384;
          if (Math.abs(e.cx - player.cx) / 16 <= 500) { tx = player.cx; ty = player.cy - 384; }
          const dx = tx - e.cx, dy = ty - e.cy;
          const d = Math.hypot(dx, dy);
          if (Math.abs(e.vy) < 0.5) { // 原版判 velocity.Y == 0;浮点残留放宽半格
            const l = d || 1;
            e.vx = (dx / l) * 20; e.vy = (dy / l) * 20;
          } else {
            e.vy *= 0.95;
          }
          if (e.ai1 >= 60) {
            e.ai1 = 0; e.ai2 = 1;
            e.vy = -3; // :45982-45985
            e.vx *= 0.5;
          }
        }
      }
      break;
    }
    // ---- 5 凝胶环(:46007-46121):ai2=0 蓄 50t(二阶段兼飞)→ ai2=1 第 10t 撒 926 环
    //      (6 发(二阶段 10 发),30 伤,9 速,-i*2π/N) ----
    case 5: {
      e.spin *= 0.9;
      if (e.ai2 === 1) {
        e.ai1 += 1;
        if (e.ai1 >= 10) {
          const count = phase2 ? 10 : 6; // num6/num7 :46024-46031
          for (let i = 0; i < count; i++) {
            const a = -i * (Math.PI * 2) / 10;
            shoot(game, e.cx, e.cy, Math.cos(a) * 9, Math.sin(a) * 9, 30, 926);
          }
          game.playSfx('roar', 0.5);
          e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
        }
      } else {
        e.ai1 += 1;
        if (e.ai1 >= 50) { e.ai1 = 0; e.ai2 = 1; }
        if (phase2) queenFlyMovement(e, game, player);
      }
      break;
    }
    default:
      e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
      break;
  }

  // 积分 + 碰撞(飞行态无碰撞)
  e.x += e.vx;
  e.y += e.vy;
  if (!flying) collideGround(e, game);

  if (e.hp <= 0) return;

  // 掉血撒仆从(:46147-46177):差值超阈值 → 1-2 只,本体附近随机落点,ai0=-500*rand3
  const threshold = Math.floor(e.maxHp * (phase2 ? 0.015 : 0.02));
  if (e.hp + threshold < la.la0) {
    la.la0 = e.hp;
    const n = 1 + Math.floor(Math.random() * 2); // Next(1,3)
    for (let k = 0; k < n; k++) {
      const pick = Math.floor(Math.random() * 3);
      let minion = spawnPart(game, e, QUEEN_MINION_VANILLA[pick]);
      if (!minion) minion = spawnPart(game, e, QUEEN_MINION_FALLBACK[pick]); // 数据缺 658-660
      if (minion) {
        minion.x = e.x + Math.random() * Math.max(1, e.w - 32);
        minion.y = e.y + Math.random() * Math.max(1, e.h - 32);
        minion.vx = (Math.floor(Math.random() * 31) - 15) * 0.1;
        minion.vy = (-Math.floor(Math.random() * 31)) * 0.1;
        minion.ai0 = -500 * Math.floor(Math.random() * 3);
        minion.ai1 = 0;
      }
    }
  }
}

// ===================== 接线清单(主会话统一接线,本文件不改动已有文件) =====================
// Enemy.fixedUpdate aiStyle 分发(Enemy.ts case 表)追加:
//   case 84:  lunaticCultistAI(this, game, p); break;   // 439 拜月教邪教徒(克隆体 440 未移植,任务简化)
//   case 120: empressOfLightAI(this, game, p); break;   // 636 光之女皇(无 spin 渲染,仅 facing)
//   case 121: queenSlimeAI(this, game, p); break;       // 657 史莱姆皇后(俯仰用 spin)
// 召唤 key: spawnPart(game, src, id)——史后仆从 vanilla 658/659/660(数据缺→535/537/16 兜底);
//   邪教徒 ai0=8 态撒 523(经典不可达)。弹幕 key: shoot(game, x, y, vx, vy, dmg, projId)——
//   464 冰雾/465 闪电球/467 火球/468 光珠;872 永恒彩虹/873 虹迹/874 极光/919 光枪/923 日舞;
//   922 砸地冲击/926 凝胶弹。
// 注意:Projectile_464/465/467/468/872/873/874/919/922/923/926.png 尚未入 public/sprites/vanilla/,
//   Arrow 会画兜底短线,素材补齐后自动生效。

// ============================================================================
// AI_100 远古之光 522(NPC.cs:42064-42142):直飞投射物型 NPC。
// 初速 ai[2]/ai[3];ai[0]>60 后按 ai[1] 弯转、>120 阻尼;触地(ai0>=0 时)→ 停驻 5t 自灭。
// (当前邪教徒远古之光已收敛为 468 直飞弹,本核供数据完整性/未来 1:1 替换)
// ============================================================================
export function ancientLightAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.vx = e.ai2; e.vy = e.ai3; }
  if (e.vy === 0 && e.ai0 >= 0) { e.ai0 = -1; e.ai1 = 0; return; }
  if (e.ai0 === -1) {
    e.vx = 0; e.vy = 0;
    e.ai1 += 1;
    if (e.ai1 >= 5) e.dead = true;
    return;
  }
  e.spin = Math.atan2(e.vy, e.vx) - Math.PI / 2;
  if (e.ai0 >= 0) {
    e.ai0 += 1;
    if (e.ai0 > 60) {
      const c = Math.cos(e.ai1), s = Math.sin(e.ai1);
      const nvx = e.vx * c - e.vy * s, nvy = e.vx * s + e.vy * c;
      e.vx = nvx; e.vy = nvy;
    }
    if (e.ai0 > 120) { e.vx *= 0.98; e.vy *= 0.98; }
    if (Math.hypot(e.vx, e.vy) < 0.2) { e.vx = 0; e.vy = 0; }
  }
  e.x += e.vx;
  e.y += e.vy;
  void game; void player;
}

// ============================================================================
// AI_101 远古末日 523(NPC.cs:42143-42221):锚定邪教徒(ai0=头 id)蓄能 420t 显形,
// 蓄满朝四方喷 593 弹(damage)后消散;头失效/蓄满 → 自灭。
// (经典模式邪教徒不可达,专家专属;专家档未开时仅作数据完整性)
// ============================================================================
export function ancientDoomAI(e: Enemy, game: GameHooks, player: Player | null) {
  const CHARGE_MAX = 420;
  const boss = (game.enemies() as Enemy[]).find((n) => !n.dead && n.id === e.ai0 && n.vanillaId === 439);
  let rate = 1;
  if (boss && boss.hp < boss.maxHp / 2) rate = 2;
  if (boss && boss.hp < boss.maxHp / 4) rate = 3;
  const gone = !boss || e.ai1 >= CHARGE_MAX;
  e.ai1 += rate;
  const prog = Math.max(0, Math.min(1, e.ai1 / 120)); // :42168 显形进度(前 120t)
  e.vanillaScale = prog;                 // 原版 scale 0→1 显形
  e.spawnAlpha = Math.round(255 - prog * 255); // 原版 alpha 255→0
  if (e.ai1 >= CHARGE_MAX) {
    for (let k = 0; k < 4; k++) {
      const ang = -Math.PI / 2 + (Math.PI / 2) * k;
      shoot(game, e.cx, e.cy, Math.cos(ang) * 4, Math.sin(ang) * 4, e.def.damage, 593);
    }
  }
  if (gone) e.dead = true;
  void player;
}
