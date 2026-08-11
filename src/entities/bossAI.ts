// Boss AI 1:1 移植(Terarria1456 NPC.cs SetDefaults 指定 aiStyle 的专用核)。
// 由 Enemy.fixedUpdate 的 aiStyle 分发调用;弹幕用 MagicProj/投射桶,部件用 fromVanilla。
// 各核保留原版状态机主链与特征机制(移速/计时/阶段),专家专属分支注释标明。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { MagicProj } from './MagicProj';
import { Arrow } from './Arrow';

const addProj = (game: GameHooks, p: MagicProj) => {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(p, 'projectiles');
};
export const addEnemy = (game: GameHooks, e: Enemy) => {
  const em = (game as unknown as { entities?: { nextId?: number; add?: (en: unknown, b: string) => void } }).entities;
  if (em?.nextId !== undefined) e.id = em.nextId++;
  em?.add?.(e, 'enemies');
  return e;
};

/** AI_011 骷髅王战斗状态机(NPC.cs:21904-22288 完整核;守卫分支已在 skeletronHeadAI)。
 *  ai0=初始化(双手 36 生成);ai1: 0=悬浮(800t)→1=旋冲(400t)循环;2=守卫/白天;3=离场。
 *  悬浮: Y 拉向玩家上方 250(0.02/±2),X 朝玩家 0.05/±8;旋冲: rotation+=0.3*dir、
 *  朝玩家 1.5 倍速、伤害 ×1.3、防御 -10(:22026-22179)。 */
export function skeletronBossAI(e: Enemy, game: GameHooks, player: Player | null) {
  const isGuardian = e.vanillaId === 68;
  // 初始化:生成双手 36(:21914-21931)
  if (!e.bInit) {
    e.bInit = true;
    if (!isGuardian) {
      for (const side of [-1, 1]) {
        const h = spawnPart(game, e, 36);
        if (h) { h.ai0 = side; h.ai1 = e.id; h.ai3 = 150; h.bInit = true; }
      }
    }
  }
  // 白天 → ai1=2(守卫/离场语义);玩家死/超 2000px → 3
  if (game.world.clock.isDay && !isGuardian && e.ai1 !== 3) e.ai1 = 2;
  if (!player || Math.abs(e.cx - player.cx) > 2000 || Math.abs(e.cy - player.cy) > 2000) {
    if (!player || Math.abs(e.cx - player.cx) > 2000 || Math.abs(e.cy - player.cy) > 2000) e.ai1 = 3;
  }
  if (e.ai1 === 2) {
    // 白天狂暴（:22247-22261）：damage/defense 均 9999、rotation+=0.3*direction、
    // 8 速恒直追——此前只改了伤害没改防御，且玩家死后 null 解引用
    e.def.damage = 9999;
    e.def.defense = 9999;
    e.spin += (e.facing || 1) * 0.3;
    if (player) {
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (dx / d) * 8; e.vy = (dy / d) * 8;
    }
    e.x += e.vx; e.y += e.vy;
    return;
  }
  if (e.ai1 === 3) {
    // 离场（:22262-22271）：vy+=0.1 下坠、vx 衰减、EncourageDespawn(50)——
    // 此前 y+=4 直落且永不 despawn，导致玩家死后 Boss 血条永久残留
    e.vy += 0.1;
    if (e.vy < 0) e.vy *= 0.95;
    e.vx *= 0.95;
    e.x += e.vx; e.y += e.vy;
    e.encourageDespawn(50);
    return;
  }
  if (!player) return;

  e.ai2 += 1;
  if (e.ai1 === 0) {
    // 悬浮段(:22046-22091)
    if (e.ai2 >= 800) { e.ai2 = 0; e.ai1 = 1; }
    // 回悬浮:恢复冲撞前的伤害/防御基值
    const base = baseStats.get(e);
    if (base) { e.def.damage = base.dmg; e.def.defense = base.def; }
    if (e.y > player.y - 250) {
      if (e.vy > 0) e.vy *= 0.98;
      e.vy -= 0.02;
      if (e.vy > 2) e.vy = 2;
    } else {
      if (e.vy < 0) e.vy *= 0.98;
      e.vy += 0.02;
      if (e.vy < -2) e.vy = -2;
    }
    if (e.cx > player.cx) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= 0.05;
      if (e.vx > 8) e.vx = 8;
    } else {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += 0.05;
      if (e.vx < -8) e.vx = -8;
    }
  } else if (e.ai1 === 1) {
    // 旋冲段(:22115-22179):rot+=0.3*dir,1.5 倍速直冲,伤害 ×1.3,防御 -10。
    // 原版在进入冲撞时一次性应用——每 tick 重乘会把伤害放大 1.3^400,故缓存基值按基值设置
    if (e.ai2 >= 400) { e.ai2 = 0; e.ai1 = 0; }
    let base = baseStats.get(e);
    if (!base) { base = baseOf(e); }
    e.def.defense = Math.max(0, base.def - 10);
    e.def.damage = Math.round(base.dmg * 1.3);
    e.spin += (e.facing || 1) * 0.3;
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    const spd = 12; // (1.5x 追击速)
    e.vx += ((dx / d) * spd - e.vx) * 0.1;
    e.vy += ((dy / d) * spd - e.vy) * 0.1;
  }
  e.facing = e.vx > 0 ? 1 : -1;
  e.x += e.vx; e.y += e.vy;
}

/** Boss 伤害/防御基值缓存(状态机每 tick 从基值派生临时修正,防重复乘膨胀) */
const baseStats = new WeakMap<Enemy, { dmg: number; def: number }>();
const baseOf = (e: Enemy) => {
  let b = baseStats.get(e);
  if (!b) { b = { dmg: e.def.damage, def: e.def.defense ?? 0 }; baseStats.set(e, b); }
  return b;
};

let enemyCtor: (typeof import('./Enemy'))['Enemy'] | null = null;
/** Enemy 构造注入(Enemy.ts import 时回填,避免循环依赖) */
export function bindEnemyCtor(c: (typeof import('./Enemy'))['Enemy']) { enemyCtor = c; }

export function spawnPart(game: GameHooks, src: Enemy, id: number): Enemy | null {
  if (!enemyCtor) return null;
  const p = enemyCtor.fromVanilla(id, src.cx, src.cy);
  if (!p) return null;
  return addEnemy(game, p);
}

/** AI_012 骷髅王手(NPC.cs:22289-22400):锚定头(ai1=头 id),头离场 → 自毁;
 *  头非悬浮态 → 漂在头两侧(±120×ai0, 头上方 100);悬浮态 → 缓慢环绕(±200, +230)。
 *  每 300t(ai3 计)朝玩家挥击冲刺。 */
export function skeletronHandAI(e: Enemy, game: GameHooks, player: Player | null) {
  const headId = e.ai1;
  const enemies = game.enemies() as unknown[];
  const head = enemies.find((n) => (n as Enemy).id === headId) as Enemy | undefined;
  if (!head || head.vanilla?.aiStyle !== 11 || head.dead) { e.dead = true; return; }
  e.master = head; // 臂骨 IK 渲染用（Renderer.drawSkeletronArm）
  if (head.ai1 === 3) { e.dead = true; return; }
  e.facing = -(e.ai0 || 1);
  if (!player) { e.x += e.vx; e.y += e.vy; return; }
  // 缓慢环绕(头悬浮态);头冲撞态则回到侧位
  const ty = head.y - 100;
  const tx = head.x + head.w / 2 - e.w / 2 - 120 * (e.ai0 || 1);
  if (head.ai1 === 0) {
    e.ai3 += 1;
    if (e.ai3 >= 300) { e.ai3 = -120; } // 负值=挥击中
    if (e.ai3 < 0) {
      // 挥击:朝玩家冲刺 8 速
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx += ((dx / d) * 8 - e.vx) * 0.15;
      e.vy += ((dy / d) * 8 - e.vy) * 0.15;
    } else {
      // 环绕位:头右/左 200px、下方 230(原版 num200 系)
      const ox = head.x + head.w / 2 - e.w / 2 - 200 * (e.ai0 || 1);
      const oy = head.y + 230;
      e.vx += ((ox - e.x) * 0.02 - e.vx) * 0.1;
      e.vy += ((oy - e.y) * 0.02 - e.vy) * 0.1;
    }
  } else {
    // 头冲撞中:快速回侧位
    e.vx += ((tx - e.x) * 0.05 - e.vx) * 0.2;
    e.vy += ((ty - e.y) * 0.05 - e.vy) * 0.2;
  }
  e.x += e.vx; e.y += e.vy;
}

/** AI_015 史莱姆王(NPC.cs SetDefaults case 50 / AI_015):大跳朝玩家 + 受击攒怒 +
 *  落地砸出小史莱姆(30% 概率)。经典模式无传送(专家专属),暂不移植传送。 */
export function kingSlimeAI(e: Enemy, game: GameHooks, player: Player | null) {
  // Enemy.ai0 默认 -1120(史莱姆族约定);原版 AI_015 的 ai[0] 从 0 起步 → 首帧复位
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; }
  // 玩家死/远距 3000px(:43466-43485)：TargetClosest 二次判定后仍失败 →
  // EncourageDespawn(10) + 背对 + ai[1]=5 缩身离场（anti-cheese 传送回归）
  const ksd = player ? Math.hypot(player.cx - e.cx, player.cy - e.cy) : Infinity;
  if (!player || ksd > 3000) {
    e.encourageDespawn(10);
    if (player) e.facing = player.cx < e.cx ? 1 : -1; // 转身背对(:43479-43485)
    if (e.ai1 !== 5 && e.ai1 !== 6) { e.ai1 = 5; e.ai3 = 0; }
  }
  if (e.ai1 === 5) {
    // 离场态(:43537-43575)：缩身 60 tick 后传送到世界右下角，转 6 号淡入
    e.ai3++;
    e.squash = Math.max(0, 1 - e.ai3 / 60) * 0.6; // 缩身近似（scale 收缩）
    e.vy += 0.3;
    e.x += e.vx; e.y += e.vy;
    if (e.ai3 >= 60) {
      e.x = (game.world.w - 3) * 16;
      e.y = (game.world.h - 3) * 16;
      e.ai1 = 6; e.ai3 = 0;
      e.squash = 0;
      e.spawnAlpha = 255; e.alphaFade = true; // 淡入（6 号态）
    }
    return;
  }
  if (e.ai1 === 6) {
    // 淡入回归（约 30 tick spawnAlpha 归零后回战斗）
    e.ai3++;
    e.ai0 = 0;
    if (e.ai3 >= 30) { e.ai1 = 0; e.ai3 = 0; }
    return;
  }
  if (!player) return;
  e.ai0 += 1;
  if (!e.onGround) {
    e.vy += 0.35; // 重力(原版大跳重力)
    // 空中水平减速朝玩家
    if (e.vx > 0) e.vx -= 0.02; else if (e.vx < 0) e.vx += 0.02;
  } else {
    // 落地:砸压判定 + 30% 出小史莱姆(原版 SpawnNPC(16) 语义)
    if (e.ai0 > 10) {
      const dx = player.cx - e.cx;
      e.vy = -8 - Math.random() * 3; // 大跳(原版 -8~-11)
      e.vx = Math.max(-7, Math.min(7, dx * 0.06));
      if (Math.random() < 0.3) {
        for (let k = 0; k < 2; k++) {
          const s = spawnPart(game, e, 16);
          if (s) { s.x += (Math.random() - 0.5) * 60; s.vy = -4; }
        }
      }
      game.spawnParticles(e.cx, e.y + e.h, '#3080FF', 8, 2.2);
    }
  }
  e.x += e.vx;
  e.y += e.vy;
  // 地形碰撞(实心块)
  collideGround(e, game);
}

/** AI_054 克苏鲁之脑(NPC.cs AI_054 + 267 爬行者环):
 *  一阶段(爬行者存活时无敌:dontTakeDamage)脑体悬空不动,爬行者环绕玩家;
 *  爬行者全灭 → 二阶段:瞬移冲刺(3 点环绕) + 幻影(简化:冲刺时半透明)。 */
export function brainOfCthulhuAI(e: Enemy, game: GameHooks, player: Player | null) {
  // 玩家死/远离（:32557-32566/:32810-32822）：曼哈顿 >6000px 瞬消；
  // 玩家死 → localAI[3] 计数 120，>60 后 vy+=(n-60)*0.25 越坠越快钻地逃离、ai[0]=2、alpha=10
  // （原版还含 !ZoneCrimson 触发——跨群系判定未实现，仅 dead）
  if (player && Math.abs(player.cx - e.cx) + Math.abs(player.cy - e.cy) > 6000) {
    e.dead = true; e.bossFled = true;
    return;
  }
  if (!player) {
    e.encourageDespawn(750); // 原版无显式 EncourageDespawn，靠 CheckActive timeLeft(750) 收尾
    e.ai3++;
    if (e.ai3 > 60) {
      e.vy += (e.ai3 - 60) * 0.25;
      e.ai0 = 2;
      e.spawnAlpha = Math.max(e.spawnAlpha, 245);
    }
    e.x += e.vx; e.y += e.vy;
    return;
  }
  const enemies = game.enemies() as unknown[];
  // 初次:补生成爬行者(原版 371-393 只)——必须先于爬行者计数,
  // 否则首 tick 爬行者为 0 直接落二阶段,永远不生成
  if (!e.bInit) {
    e.bInit = true;
    for (let k = 0; k < 8; k++) {
      const c = spawnPart(game, e, 267);
      if (c) {
        const ang = (k / 8) * Math.PI * 2;
        c.x = player.cx + Math.cos(ang) * 150;
        c.y = player.cy + Math.sin(ang) * 150;
      }
    }
  }
  const creepers = enemies.filter((n) => (n as Enemy).vanillaId === 267 && !(n as Enemy).dead);
  if (creepers.length > 0) {
    // 一阶段:无敌 + 悬浮微移(原版 ai[0]=0 悬空不动;爬行者环攻击)
    e.iframes = 2;
    e.vx *= 0.9; e.vy *= 0.9;
    e.x += e.vx; e.y += e.vy;
    return;
  }
  // 二阶段:瞬移冲刺循环(ai0 计 60t 一冲)
  e.ai0 += 1;
  e.spawnAlpha = 0;
  if (e.ai0 % 60 === 0) {
    // 瞬移到玩家周围随机点,朝玩家冲刺
    const ang = Math.random() * Math.PI * 2;
    e.x = player.cx + Math.cos(ang) * 200 - e.w / 2;
    e.y = player.cy + Math.sin(ang) * 200 - e.h / 2;
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    e.vx = (dx / d) * 9; e.vy = (dy / d) * 9;
    game.spawnParticles(e.cx, e.cy, '#A03050', 10, 2);
  }
  e.x += e.vx; e.y += e.vy;
}

/** 267 爬行者(NPC.cs AI_055 简化):环绕主人/玩家漂移 + 接触伤害 */
export function creeperAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!player) { e.x += e.vx; e.y += e.vy; return; }
  e.ai0 += 0.02;
  // 环绕玩家(半径 100-160 摆动)
  const r = 130 + Math.sin(e.aiT * 0.03) * 30;
  const tx = player.cx - e.w / 2 + Math.cos(e.ai0) * r;
  const ty = player.cy - e.h / 2 + Math.sin(e.ai0) * r;
  e.vx += (tx - e.x) * 0.01;
  e.vy += (ty - e.y) * 0.01;
  e.vx *= 0.92; e.vy *= 0.92;
  e.x += e.vx; e.y += e.vy;
  void game;
}

// ================= 机械三王(NPC.cs AI_030-037,1.4.5.6 行号见各核注释) =================
// 经典模式参数 1:1;专家/大师/FTW 分支仅注释保留。

/** 原版速度逼近(L26539-26670 雏形):朝目标速度单轴步进,符号翻转时双倍步进 */
export function accelTo(v: number, target: number, a: number): number {
  if (v < target) { v += a; if (v < 0 && target > 0) v += a; }
  else if (v > target) { v -= a; if (v > 0 && target < 0) v -= a; }
  return v;
}
/** 朝 (tx,ty) 以速度 spd/加速度 acc 追赶(vanilla numXXX = spd/dist 归一后 accelTo) */
export function seek(e: Enemy, tx: number, ty: number, spd: number, acc: number): void {
  const dx = tx - e.cx, dy = ty - e.cy;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = accelTo(e.vx, (dx / d) * spd, acc);
  e.vy = accelTo(e.vy, (dy / d) * spd, acc);
}
/** 直线视线(原版 Collision.CanHit 近似:8px 采样无实心块) */
export function losClear(game: GameHooks, x0: number, y0: number, x1: number, y1: number): boolean {
  const st = game.world.store;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x0 + (x1 - x0) * t) / TILE), ty = Math.floor((y0 + (y1 - y0) * t) / TILE);
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return false;
  }
  return true;
}
/** Boss 弹幕:直飞(grav 0)+ 原版 Projectile_N 贴图 */
export function shoot(game: GameHooks, x: number, y: number, vx: number, vy: number, dmg: number, projId: number, life = 300): void {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
    new Arrow(x, y, vx, vy, dmg, 0, projId, null, { grav: 0, life, pierce: 1 }), 'projectiles');
}

/** AI_030/031 双子(NPC.cs:26497-27735):雷神之眼 125 / 魔神之眼 126。
 *  旋转持续瞄准玩家(0.1/0.15 步进+绕圈处理);白天/玩家死 → 上飞离场;
 *  一阶段(血>40%):侧向悬浮(300/400)→4-10 连冲(12/13 速);二阶段变身自旋;
 *  三阶段:雷眼 激光 83→100(伤害×1.5 防+10),魔眼 火焰喷射 101(伤害×1.5 防+18)。 */
export function twinsAI(e: Enemy, game: GameHooks, player: Player | null, spaz: boolean) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  // 白天/玩家死:上飞离场(原版 :26585/:27208 vy-=0.04 + EncourageDespawn(10))——
  // 玩家死亡派发为 null,一并进离场（此前 null 仅漂移不消散）
  if (game.world.clock.isDay || !player || player.dead) {
    e.vy -= 0.04;
    e.encourageDespawn(10); // 离屏即消(Enemy 打 bossFled,Game 不播击败/不记账)
    e.x += e.vx; e.y += e.vy;
    return;
  }
  // ---- 旋转瞄准(num427/num471:atan2(dy-59, 自-玩)+π/2,步进 0.1/0.15) ----
  let target = Math.atan2(e.y + e.h - 59 - (player.y + player.h / 2), e.cx - player.cx) + Math.PI / 2;
  if (target < 0) target += 6.283; else if (target > 6.283) target -= 6.283;
  const step = spaz ? 0.15 : 0.1;
  let rot = e.spin;
  if (rot < target) { rot += (target - rot > Math.PI ? -step : step); }
  else if (rot > target) { rot += (rot - target > Math.PI ? step : -step); }
  if (Math.abs(rot - target) < step) rot = target;
  if (rot < 0) rot += 6.283; else if (rot > 6.283) rot -= 6.283;
  e.spin = rot;

  // ---- 一阶段(ai0=0) ----
  if (e.ai0 === 0) {
    if (e.ai1 === 0) {
      // 侧向悬浮:雷眼 玩家侧 300/上方 300 速 7/0.1;魔眼 侧 400 速 12/0.4
      const spd = spaz ? 12 : 7, acc = spaz ? 0.4 : 0.1;
      const side = e.cx < player.x + player.w ? -1 : 1;
      const offX = spaz ? 400 : 300, offY = spaz ? 0 : 300;
      const tx = player.cx + side * offX, ty = player.cy - offY;
      const hoverDist = Math.hypot(tx - e.cx, ty - e.cy);
      seek(e, tx, ty, spd, acc);
      e.ai2 += 1;
      if (e.ai2 >= 600) { e.ai1 = 1; e.ai2 = 0; e.ai3 = 0; }
      // 悬浮期弹幕:魔眼 每 60t 诅咒焰 96(25 伤 12 速);雷眼 位于玩家上方且距悬浮点<400 时绿激光 83(20 伤 9 速)
      if (spaz) {
        e.ai3 += 1;
        if (e.ai3 >= 60) {
          e.ai3 = 0;
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          shoot(game, e.cx + dx / d * 4, e.cy + dy / d * 4,
            dx / d * 12 + (Math.random() - 0.5) * 4, dy / d * 12 + (Math.random() - 0.5) * 4, 25, 96);
        }
      } else if (e.y + e.h < player.y && hoverDist < 400) {
        e.ai3 += 1;
        if (e.ai3 >= 60) {
          e.ai3 = 0;
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          shoot(game, e.cx + dx / d * 15, e.cy + dy / d * 15,
            dx / d * 9 + (Math.random() - 0.5) * 6.4, dy / d * 9 + (Math.random() - 0.5) * 6.4, 20, 83);
        }
      }
    } else if (e.ai1 === 1) {
      // 冲撞:一次性朝玩家定速(雷眼 12/魔眼 13)
      e.spin = target;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spd = spaz ? 13 : 12;
      e.vx = dx / d * spd; e.vy = dy / d * spd;
      e.ai1 = 2;
    } else if (e.ai1 === 2) {
      e.ai2 += 1;
      if (e.ai2 >= (spaz ? 8 : 25)) {
        e.vx *= 0.96; e.vy *= 0.96;
        if (Math.abs(e.vx) < 0.1) e.vx = 0;
        if (Math.abs(e.vy) < 0.1) e.vy = 0;
      } else {
        e.spin = Math.atan2(e.vy, e.vx) - Math.PI / 2;
      }
      if (e.ai2 >= (spaz ? 42 : 70)) {
        e.ai3 += 1; e.ai2 = 0;
        e.spin = target;
        if (e.ai3 >= (spaz ? 10 : 4)) { e.ai1 = 0; e.ai3 = 0; }
        else e.ai1 = 1;
      }
    }
    if (e.hp < e.maxHp * 0.4) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    e.x += e.vx; e.y += e.vy;
    return;
  }

  // ---- 变身(ai0=1 自旋加速 / ai0=2 减速,各 100t;ai2=角速度 0↔0.5) ----
  if (e.ai0 === 1 || e.ai0 === 2) {
    if (e.ai0 === 1) { e.ai2 += 0.005; if (e.ai2 > 0.5) e.ai2 = 0.5; }
    else { e.ai2 -= 0.005; if (e.ai2 < 0) e.ai2 = 0; }
    e.spin += e.ai2;
    e.ai1 += 1;
    if (e.ai1 >= 100) {
      e.ai0 += 1; e.ai1 = 0;
      if (e.ai0 === 3) e.ai2 = 0;
      else {
        game.playSfx('roar', 0.7);
        game.spawnParticles(e.cx, e.cy, '#FF6040', 20, 2);
      }
    }
    e.vx *= 0.98; e.vy *= 0.98;
    if (Math.abs(e.vx) < 0.1) e.vx = 0;
    if (Math.abs(e.vy) < 0.1) e.vy = 0;
    e.x += e.vx; e.y += e.vy;
    return;
  }

  // ---- 三阶段(ai0=3):伤害×1.5,防御 +(雷眼10/魔眼18) ----
  const b = baseOf(e);
  e.def.damage = Math.round(b.dmg * 1.5);
  e.def.defense = b.def + (spaz ? 18 : 10);
  if (e.ai1 === 0) {
    // 上方悬浮:雷眼 玩家正上 300(8/0.15,300t→冲);魔眼 侧 180 同高(4/0.1,400t→冲)+ 火焰喷射 101
    const spd = spaz ? 4 : 8, acc = spaz ? 0.1 : 0.15;
    const offX = spaz ? 180 : 0, offY = spaz ? 0 : 300;
    const side = e.cx < player.x + player.w ? -1 : 1;
    seek(e, player.cx + side * offX, player.cy - offY, spd, acc);
    e.ai2 += 1;
    if (e.ai2 >= (spaz ? 400 : 300)) { e.ai1 = 1; e.ai2 = 0; e.ai3 = 0; }
    e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
    if (e.aiT % (spaz ? 8 : 180) === 0 && losClear(game, e.cx, e.cy, player.cx, player.cy)) {
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spdP = spaz ? 6 : 8.5;
      const dmgP = spaz ? 30 : 25;
      const pid = spaz ? 101 : 100;
      const lead = spaz ? 4 : 15;
      shoot(game, e.cx + dx / d * lead, e.cy + dy / d * lead,
        dx / d * spdP + (Math.random() - 0.5) * 0.8, dy / d * spdP + (Math.random() - 0.5) * 0.8, dmgP, pid);
    }
  } else if (e.ai1 === 1) {
    // 冲撞:雷眼 侧 340 8/0.2 / 180t 循环;魔眼 直冲 14 速(50/80t 减速,连 6)
    if (spaz) {
      e.spin = target;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = dx / d * 14; e.vy = dy / d * 14;
      e.ai1 = 2;
    } else {
      const side = e.cx < player.x + player.w ? -1 : 1;
      seek(e, player.cx + side * 340, player.cy, 8, 0.2);
      e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
      if (e.aiT % 60 === 0 && losClear(game, e.cx, e.cy, player.cx, player.cy)) {
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, e.cx + dx / d * 15, e.cy + dy / d * 15, dx / d * 9, dy / d * 9, 18, 100);
      }
      e.ai2 += 1;
      if (e.ai2 >= 180) { e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    }
  } else if (e.ai1 === 2 && spaz) {
    // 魔眼冲撞减速段(50t 起阻尼,80t 一循环,6 循环回悬浮)
    e.ai2 += 1;
    if (e.ai2 >= 50) {
      e.vx *= 0.93; e.vy *= 0.93;
      if (Math.abs(e.vx) < 0.1) e.vx = 0;
      if (Math.abs(e.vy) < 0.1) e.vy = 0;
    } else {
      e.spin = Math.atan2(e.vy, e.vx) - Math.PI / 2;
    }
    if (e.ai2 >= 80) {
      e.ai3 += 1; e.ai2 = 0;
      e.spin = target;
      if (e.ai3 >= 6) { e.ai1 = 0; e.ai3 = 0; } else e.ai1 = 1;
    }
  } else if (e.ai1 === 2) {
    // 雷眼冲撞减速段(25t 起阻尼,70t 一循环,4 循环回悬浮)
    e.ai2 += 1;
    if (e.ai2 >= 25) {
      e.vx *= 0.96; e.vy *= 0.96;
      if (Math.abs(e.vx) < 0.1) e.vx = 0;
      if (Math.abs(e.vy) < 0.1) e.vy = 0;
    } else {
      e.spin = Math.atan2(e.vy, e.vx) - Math.PI / 2;
    }
    if (e.ai2 >= 70) {
      e.ai3 += 1; e.ai2 = 0;
      e.spin = target;
      if (e.ai3 >= 4) { e.ai1 = 0; e.ai3 = 0; } else e.ai1 = 1;
    }
  }
  e.x += e.vx; e.y += e.vy;
}

/** AI_032 机械骷髅王头 127(NPC.cs:27736-28054):初生成 4 部件;
 *  ai1: 0=悬浮(Y 带 200-500/X 窗 ±100,600t)→1=旋冲(防伤×2,2 速,400t);
 *  2=白天狂暴(伤/防 9999,10+距离/100 速追杀);3=玩家死/远 6000px 离场。 */
export function skeletronPrimeAI(e: Enemy, game: GameHooks, player: Player | null) {
  // 初始化:生成 128/129/130/131(ai0=侧 ±1, ai1=头 id;130/131 ai3=150 预热)
  if (!e.bInit) {
    e.bInit = true;
    const specs: Array<[number, number]> = [[128, -1], [129, 1], [130, -1], [131, 1]];
    for (const [id, side] of specs) {
      const p = spawnPart(game, e, id);
      if (p) { p.ai0 = side; p.ai1 = e.id; p.ai3 = id === 130 || id === 131 ? 150 : 0; p.bInit = true; }
    }
  }
  // 每 tick 从基值重置(vanilla damage=defDamage/defense=defDefense 置顶)
  const b = baseOf(e);
  e.def.damage = b.dmg;
  e.def.defense = b.def;
  // 玩家死亡(=无有效目标):按离场处理(原版 TargetClosest 落空 → ai[1]=3)
  if (!player) e.ai1 = 3;
  // 玩家死/超 6000px → 离场
  if (!player || Math.abs(e.cx - player.cx) > 6000 || Math.abs(e.cy - player.cy) > 6000) e.ai1 = 3;
  if (!player) { e.x += e.vx; e.y += e.vy; return; }
  // 白天 → 狂暴(原版不逃走,持续 9999 追杀;Game.ts 日出剔除对 127 豁免)
  if (game.world.clock.isDay && e.ai1 !== 3 && e.ai1 !== 2) {
    e.ai1 = 2;
    game.playSfx('roar', 0.8);
  }
  if (e.ai1 === 0) {
    // 悬浮段(:27787-27874):Y 带 [玩家-200, 玩家-500] 0.1/±2;X 窗 ±100 0.1/±8
    e.ai2 += 1;
    if (e.ai2 >= 600) { e.ai2 = 0; e.ai1 = 1; }
    e.spin = e.vx / 15;
    if (e.y > player.y - 200) {
      if (e.vy > 0) e.vy *= 0.98;
      e.vy -= 0.1;
      if (e.vy > 2) e.vy = 2;
    } else if (e.y < player.y - 500) {
      if (e.vy < 0) e.vy *= 0.98;
      e.vy += 0.1;
      if (e.vy < -2) e.vy = -2;
    }
    if (e.cx > player.cx + 100) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= 0.1;
      if (e.vx > 8) e.vx = 8;
    }
    if (e.cx < player.cx - 100) {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += 0.1;
      if (e.vx < -8) e.vx = -8;
    }
  } else if (e.ai1 === 1) {
    // 旋冲段(:27875-27970):防伤×2,spin+=0.3*dir,经典 2 速直冲,400t 回悬浮
    e.def.defense = b.def * 2;
    e.def.damage = b.dmg * 2;
    e.ai2 += 1;
    if (e.ai2 === 2) game.playSfx('roar', 0.6);
    if (e.ai2 >= 400) { e.ai2 = 0; e.ai1 = 0; }
    e.spin += (e.facing || 1) * 0.3;
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    e.vx = dx / d * 2; e.vy = dy / d * 2;
  } else if (e.ai1 === 2) {
    // 白天狂暴(:27971-28004):伤/防 9999,速 10+dist/100 钳 [8,32]
    e.def.damage = 9999;
    e.def.defense = 9999;
    e.spin += (e.facing || 1) * 0.3;
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    let spd = 10 + d / 100;
    spd = Math.max(8, Math.min(32, spd));
    e.vx = dx / d * spd; e.vy = dy / d * spd;
  } else {
    // 离场(:28043-28052):下坠离场
    e.vy += 0.1;
    if (e.vy < 0) e.vy *= 0.95;
    e.vx *= 0.95;
    if (e.vy > 13) e.vy = 13;
    e.encourageDespawn(10); // 离屏即消(bossFled,不播击败)
  }
  e.facing = e.vx > 0 ? 1 : -1;
  e.x += e.vx;
  e.y += e.vy;
}

/** AI_033-036 Prime 四部件(NPC.cs:28055-29110):ai1=头 id,ai0=侧 ±1。
 *  33=锯 129(上冲俯冲 22 速)/34=激光 130(直冲 20 速,ai3 初始 150 预热)/
 *  35=钳 128(悬头侧,激光 102 0 伤)/36=炮 131(玩家上空悬停,激光 100 25 伤)。
 *  公共:头失效→自毁;头离场(ai1==3)→自毁;远离锚点 800px→追赶态 99。 */
export function primePartAI(e: Enemy, game: GameHooks, player: Player | null) {
  const headId = e.ai1;
  const head = (game.enemies() as Enemy[]).find((n) => n.id === headId && n.vanilla?.aiStyle === 32);
  // 头死亡/失效 → 自毁(原版 ai2+=10 到 50 清除;简化即时)
  if (!head || head.dead) { e.dead = true; return; }
  e.master = head; // 臂骨 IK 渲染用（Renderer.drawPrimeArm，Main.cs:22633-22675）
  const side = e.ai0 || 1;
  e.facing = -side;
  const ax = head.cx - 200 * side, ay = head.y + 230; // 部件锚点(vanilla num528 系)
  const distA = Math.hypot(ax - e.cx, ay - e.cy);
  if (e.ai2 !== 99) { if (distA > 800) e.ai2 = 99; }
  else if (distA < 400) e.ai2 = 0;
  if (head.ai1 === 3) { e.dead = true; return; } // 头离场:部件跟随消散
  if (!player) {
    // 玩家死亡且头非战斗态（ai[1]!=0）：下坠不再攻击（:28067-28074 vy+=0.1 上限 16）
    if (head.ai1 !== 0) {
      e.vy = Math.min(e.vy + 0.1, 16);
      e.vx *= 0.95;
    }
    e.x += e.vx; e.y += e.vy;
    return;
  }

  const style = e.vanilla?.aiStyle ?? 33;
  const hoverBand = (yLow: number, yHigh: number, acc: number, max: number) => {
    // Y 带 [head.y+yLow, head.y+yHigh] 内归位(vanilla 双侧 if)
    if (e.y > head.y + yLow) {
      if (e.vy > 0) e.vy *= 0.96;
      e.vy -= acc;
      if (e.vy > max) e.vy = max;
    } else if (e.y < head.y + yHigh) {
      if (e.vy < 0) e.vy *= 0.96;
      e.vy += acc;
      if (e.vy < -max) e.vy = -max;
    }
  };
  const xWindow = (winHigh: number, winLow: number, acc: number, max: number) => {
    // X 窗 [head.cx+winLow, head.cx+winHigh] 内归位(头侧偏移由调用方传正值)
    if (e.cx > head.cx + winHigh) {
      if (e.vx > 0) e.vx *= 0.96;
      e.vx -= acc;
      if (e.vx > max) e.vx = max;
    } else if (e.cx < head.cx + winLow) {
      if (e.vx < 0) e.vx *= 0.96;
      e.vx += acc;
      if (e.vx < -max) e.vx = -max;
    }
  };

  if (e.ai2 === 99) {
    // 追赶态(:28083-28132):直奔头(0.5/±12 X,0.1/±8 Y)
    if (e.y > head.y) { if (e.vy > 0) e.vy *= 0.96; e.vy -= 0.1; if (e.vy > 8) e.vy = 8; }
    else if (e.y < head.y) { if (e.vy < 0) e.vy *= 0.96; e.vy += 0.1; if (e.vy < -8) e.vy = -8; }
    if (e.cx > head.cx) { if (e.vx > 0) e.vx *= 0.96; e.vx -= 0.5; if (e.vx > 12) e.vx = 12; }
    if (e.cx < head.cx) { if (e.vx < 0) e.vx *= 0.96; e.vx += 0.5; if (e.vx < -12) e.vx = -12; }
    e.x += e.vx; e.y += e.vy;
    return;
  }

  if (style === 33) {
    // ---- 锯(NPC 129,:28134-28358) ----
    if (e.ai2 === 0 || e.ai2 === 3) {
      if (head.ai1 !== 0) {
        // 头冲撞中:7 速逼近玩家(0.05 步进/0.97 阻尼)
        seekSteer(e, player, 7, 0.05);
        e.ai3 += 1;
        if (e.ai3 >= 600) { e.ai2 = 0; e.ai3 = 0; }
      } else {
        e.ai3 += 1;
        if (e.ai3 >= 300) { e.ai2 = 1; e.ai3 = 0; }
        hoverBand(320, 260, 0.04, 3);
        if (e.cx > head.cx) { if (e.vx > 0) e.vx *= 0.96; e.vx -= 0.3; if (e.vx > 12) e.vx = 12; }
        if (e.cx < head.cx - 250) { if (e.vx < 0) e.vx *= 0.96; e.vx += 0.3; if (e.vx < -12) e.vx = -12; }
      }
      e.spin = Math.atan2(ay - e.cy, ax - e.cx) + Math.PI / 2;
    } else if (e.ai2 === 1) {
      // 升空俯冲:升至头上 200 → 22 速冲玩家
      e.spin = Math.atan2(ay - e.cy, ax - e.cx) + Math.PI / 2;
      e.vx *= 0.95;
      e.vy -= 0.1;
      if (e.vy < -8) e.vy = -8;
      if (e.y < head.y - 200 && player) {
        e.ai2 = 2;
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx = dx / d * 22; e.vy = dy / d * 22;
      }
    } else if (e.ai2 === 2) {
      // 俯冲到玩家下方/开始上移 → 回环绕(3)
      if (!player || e.y > player.y || e.vy < 0) e.ai2 = 3;
    } else if (e.ai2 === 5 && player) {
      if ((e.vx > 0 && e.cx > player.cx) || (e.vx < 0 && e.cx < player.cx)) e.ai2 = 0;
    }
  } else if (style === 34) {
    // ---- 激光(NPC 130,:28439-28638) ----
    if (e.ai2 === 0 || e.ai2 === 3) {
      if (head.ai1 !== 0) {
        // 头冲撞中:12 速突进(慢于 2 直接定速,否则阻尼)
        if (player) {
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          if (Math.abs(e.vx) + Math.abs(e.vy) < 2) { e.vx = dx / d * 12; e.vy = dy / d * 12; }
          else { e.vx *= 0.97; e.vy *= 0.97; }
        }
        e.ai3 += 1;
        if (e.ai3 >= 600) { e.ai2 = 0; e.ai3 = 0; }
      } else {
        e.ai3 += 1;
        if (e.ai3 >= 600) { e.ai2 = 1; e.ai3 = 0; }
        hoverBand(300, 230, 0.1, 3);
        if (e.cx > head.cx + 250) { if (e.vx > 0) e.vx *= 0.94; e.vx -= 0.3; if (e.vx > 9) e.vx = 9; }
        if (e.cx < head.cx) { if (e.vx < 0) e.vx *= 0.94; e.vx += 0.2; if (e.vx < -8) e.vx = -8; }
      }
      e.spin = Math.atan2(ay - e.cy, ax - e.cx) + Math.PI / 2;
    } else if (e.ai2 === 1) {
      // 升空直冲:升至头上 280 → 20 速冲玩家(初 ai3=150 → 首冲提前)
      const ax2 = head.cx - 280 * side, ay2 = head.y + 230;
      e.spin = Math.atan2(ay2 - e.cy, ax2 - e.cx) + Math.PI / 2;
      if (e.vy > 0) e.vy *= 0.9;
      e.vx = (e.vx * 5 + head.vx) / 6;
      e.vx += 0.5;
      e.vy -= 0.5;
      if (e.vy < -9) e.vy = -9;
      if (e.y < head.y - 280 && player) {
        e.ai2 = 2;
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx = dx / d * 20; e.vy = dy / d * 20;
      }
    } else if (e.ai2 === 2) {
      if (!player || e.y > player.y || e.vy < 0) {
        if (e.ai3 >= 4) { e.ai2 = 3; e.ai3 = 0; }
        else { e.ai2 = 1; e.ai3 += 1; }
      }
    } else if (e.ai2 === 4) {
      // 侧向横扫(原版与 5 互切;头冲撞分支偶尔进入)
      e.spin = Math.atan2(ay - e.cy, ax - e.cx) + Math.PI / 2;
      e.vy = (e.vy * 5 + head.vy) / 6;
      e.vx += 0.5;
      if (e.vx > 12) e.vx = 12;
      if (player && Math.abs(e.cx - head.cx) > 500) {
        e.ai2 = 5;
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx = dx / d * 17; e.vy = dy / d * 17;
      }
    } else if (e.ai2 === 5 && player && e.cx < player.cx - 100) {
      if (e.ai3 >= 4) { e.ai2 = 0; e.ai3 = 0; }
      else { e.ai2 = 4; e.ai3 += 1; }
    }
  } else if (style === 35) {
    // ---- 钳(NPC 128,:28653-28874) ----
    if (e.ai2 === 0) {
      if (head.ai1 !== 0) {
        hoverBand(-100, -100, 0.07, 6);
        xWindow(-120 * side, -120 * side, 0.1, 8);
      } else {
        e.ai3 += 1;
        if (e.ai3 >= 1100) { e.ai2 = 1; e.ai3 = 0; }
        hoverBand(-150, -150, 0.04, 3);
        xWindow(200, 160, 0.2, 8);
      }
      e.spin = Math.atan2(ay - e.cy, ax - e.cx) + Math.PI / 2;
      // 反向激光 102(原版伤害 0 = 纯视觉威慑)每 140t
      if (e.aiT % 140 === 0) {
        const dx = -(ax - e.cx), dy = -(ay - e.cy);
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, e.cx + dx / d * 4, e.cy + dy / d * 4,
          dx / d * 12 + (Math.random() - 0.5) * 0.8, dy / d * 12 + (Math.random() - 0.5) * 0.8, 0, 102);
      }
    } else if (e.ai2 === 1 && player) {
      e.ai3 += 1;
      if (e.ai3 >= 300) { e.ai2 = 0; e.ai3 = 0; }
      // 悬停:头 X / 玩家上方 80(6 速,0.04 X/0.08 Y,0.9 阻尼)
      seekSteer2(e, head.cx, player.cy - 80, 6, 0.04, 0.08);
      e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
      if (e.aiT % 40 === 0) {
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, e.cx + dx / d * 4, e.cy + dy / d * 4,
          dx / d * 10 + (Math.random() - 0.5) * 0.8, dy / d * 10 + (Math.random() - 0.5) * 0.8, 0, 102);
      }
    }
  } else if (style === 36) {
    // ---- 炮(NPC 131,:28889-29109;初 ai3=150 计入 800 门) ----
    if (e.ai2 === 0 || e.ai2 === 3) {
      if (head.ai1 !== 0) {
        hoverBand(-100, -100, 0.07, 6);
        xWindow(-120 * side, -120 * side, 0.1, 8);
      } else {
        e.ai3 += 1;
        if (e.ai3 >= 800) { e.ai2 = 1; e.ai3 = 0; }
        hoverBand(-100, -100, 0.1, 3);
        xWindow(-180 * side, -180 * side, 0.14, 8);
      }
      if (player) {
        e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
        if (e.aiT % 200 === 0) {
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          shoot(game, e.cx + dx / d * 8, e.cy + dy / d * 8,
            dx / d * 8 + (Math.random() - 0.5) * 4, dy / d * 8 + (Math.random() - 0.5) * 4, 25, 100);
        }
      }
    } else if (e.ai2 === 1 && player) {
      e.ai3 += 1;
      if (e.ai3 >= 200) { e.ai2 = 0; e.ai3 = 0; }
      // 悬停玩家左侧 350/上方 20(7 速,0.1/0.03,0.9 阻尼)
      seekSteer2(e, player.cx - 350, player.cy - 20, 7, 0.1, 0.03);
      e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
      if (e.aiT % 80 === 0) {
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, e.cx + dx / d * 8, e.cy + dy / d * 8,
          dx / d * 10 + (Math.random() - 0.5) * 4, dy / d * 10 + (Math.random() - 0.5) * 4, 25, 100);
      }
    }
  }
  e.x += e.vx;
  e.y += e.vy;
}

/** 原版"逼近目标速度"舵(:28161-28192 锯/激光共用):目标 = dir*spd,0.97 阻尼 ±0.05 步进 */
export function seekSteer(e: Enemy, target: { cx: number; cy: number }, spd: number, acc: number): void {
  const dx = target.cx - e.cx, dy = target.cy - e.cy;
  const d = Math.hypot(dx, dy) || 1;
  const tx = (dx / d) * spd, ty = (dy / d) * spd;
  if (e.vx > tx) { if (e.vx > 0) e.vx *= 0.97; e.vx -= acc; }
  if (e.vx < tx) { if (e.vx < 0) e.vx *= 0.97; e.vx += acc; }
  if (e.vy > ty) { if (e.vy > 0) e.vy *= 0.97; e.vy -= acc; }
  if (e.vy < ty) { if (e.vy < 0) e.vy *= 0.97; e.vy += acc; }
}
/** 同上但 X/Y 不同步进(钳/炮悬停态,:28817-28848/:29052-29083),0.9 阻尼 */
export function seekSteer2(e: Enemy, tx0: number, ty0: number, spd: number, accX: number, accY: number): void {
  const dx = tx0 - e.cx, dy = ty0 - e.cy;
  const d = Math.hypot(dx, dy) || 1;
  const tx = (dx / d) * spd, ty = (dy / d) * spd;
  if (e.vx > tx) { if (e.vx > 0) e.vx *= 0.9; e.vx -= accX; }
  if (e.vx < tx) { if (e.vx < 0) e.vx *= 0.9; e.vx += accX; }
  if (e.vy > ty) { if (e.vy > 0) e.vy *= 0.9; e.vy -= accY; }
  if (e.vy < ty) { if (e.vy < 0) e.vy *= 0.9; e.vy += accY; }
}

/** AI_037 毁灭者 134-136(NPC.cs:50129-50624):头穿地飞行——
 *  空中:下坠 0.15/钳 16 并横漂向玩家;地下(实心/液体):全向舵向玩家(0.1/0.15 双档);
 *  白天/玩家死:加速下坠,过岩石层整链消散;体节 135 探针随机激光 100。
 *  段链 80 段(原版 GetDestroyerSegmentsCount;链距 44px)由头驱动收缩跟随。 */
export function destroyerAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) {
    e.bInit = true;
    // 原版 ai[0]==0 时头生成 80 段链(body 135×79 + tail 136;链距 44*scale)
    const segs = enemySpawnChain(e, 80);
    for (const s of segs) addEnemy(game, s);
  }
  const st = game.world.store;
  // 接地判定(flag2):AABB 外扩 1-2 格内实心块或液体>64(:50278-50298)
  let buried = false;
  const tx0 = Math.max(0, Math.floor(e.x / TILE) - 1), tx1 = Math.min(st.w - 1, Math.floor((e.x + e.w) / TILE) + 2);
  const ty0 = Math.max(0, Math.floor(e.y / TILE) - 1), ty1 = Math.min(st.h - 1, Math.floor((e.y + e.h) / TILE) + 2);
  for (let x = tx0; x <= tx1 && !buried; x++) {
    for (let y = ty0; y <= ty1; y++) {
      const i = st.idx(x, y);
      if ((st.flags[i] && st.isSolid(x, y)) || st.liquid[i] > 64) {
        if (e.x + e.w > x * TILE && e.x < x * TILE + 16 && e.y + e.h > y * TILE && e.y < y * TILE + 16) { buried = true; break; }
      }
    }
  }

  // 白天/玩家死:下坠离场;过岩石层整链消散(:50337-50356)
  const dayFlee = game.world.clock.isDay || !player || player.dead;
  if (dayFlee) {
    e.vy += 1;
    if (e.y > game.world.groundLevel * TILE) e.vy += 1;
    e.spin = Math.atan2(e.vy, e.vx) + Math.PI / 2;
    e.x += e.vx; e.y += e.vy;
    driveChain(e, 44);
    if (e.y > game.world.rockLevel * TILE) {
      e.bossFled = true; // 黎明钻地撤离=非击杀(Game 不播击败/不记账)
      for (let s: Enemy | null = e; s; s = s.wormNext) s.dead = true;
    }
    return;
  }

  const spd = 16, acc = 0.1, acc2 = 0.15;
  if (!buried) {
    // 空中(:50416-50458):下坠 0.15 钳 16;慢速时横漂,满速下坠时向玩家 X 修正
    e.vy += 0.15;
    if (e.vy > spd) e.vy = spd;
    const px = Math.floor(player.cx / TILE) * TILE, py = Math.floor(player.cy / TILE) * TILE;
    const sx = Math.floor(e.cx / TILE) * TILE, sy = Math.floor(e.cy / TILE) * TILE;
    const dx = px - sx, dy = py - sy;
    if (Math.abs(e.vx) + Math.abs(e.vy) < spd * 0.4) {
      e.vx += (e.vx < 0 ? -acc * 1.1 : acc * 1.1);
    } else if (e.vy === spd) {
      if (e.vx < dx) e.vx += acc;
      else if (e.vx > dx) e.vx -= acc;
    } else if (e.vy > 4) {
      e.vx += (e.vx < 0 ? acc * 0.9 : -acc * 0.9);
    }
    void dy;
  } else {
    // 地下(:50459-50585):目标速度 = 方向*16,分档加速(同向双轴 0.15→同向单轴 0.10+
    // 反轴轻推→主轴 0.11 次轴补速;含防卡死角交叉助推)
    const dx = Math.floor(player.cx / TILE) * TILE - Math.floor(e.cx / TILE) * TILE;
    const dy = Math.floor(player.cy / TILE) * TILE - Math.floor(e.cy / TILE) * TILE;
    const d = Math.hypot(dx, dy) || 1;
    const tvx = (dx / d) * spd, tvy = (dy / d) * spd;
    const sameX = (e.vx > 0 && tvx > 0) || (e.vx < 0 && tvx < 0);
    const sameY = (e.vy > 0 && tvy > 0) || (e.vy < 0 && tvy < 0);
    if (sameX && sameY) {
      if (e.vx < tvx) e.vx += acc2; else if (e.vx > tvx) e.vx -= acc2;
      if (e.vy < tvy) e.vy += acc2; else if (e.vy > tvy) e.vy -= acc2;
    }
    if (sameX || sameY) {
      if (e.vx < tvx) e.vx += acc; else if (e.vx > tvx) e.vx -= acc;
      if (e.vy < tvy) e.vy += acc; else if (e.vy > tvy) e.vy -= acc;
      if (Math.abs(tvy) < spd * 0.2 && ((e.vx > 0 && tvx < 0) || (e.vx < 0 && tvx > 0))) {
        e.vy += (e.vy > 0 ? acc * 2 : -acc * 2);
      }
      if (Math.abs(tvx) < spd * 0.2 && ((e.vy > 0 && tvy < 0) || (e.vy < 0 && tvy > 0))) {
        e.vx += (e.vx > 0 ? acc * 2 : -acc * 2);
      }
    } else if (Math.abs(dx) > Math.abs(dy)) {
      if (e.vx < tvx) e.vx += acc * 1.1; else if (e.vx > tvx) e.vx -= acc * 1.1;
      if (Math.abs(e.vx) + Math.abs(e.vy) < spd * 0.5) e.vy += (e.vy > 0 ? acc : -acc);
    } else {
      if (e.vy < tvy) e.vy += acc * 1.1; else if (e.vy > tvy) e.vy -= acc * 1.1;
      if (Math.abs(e.vx) + Math.abs(e.vy) < spd * 0.5) e.vx += (e.vx > 0 ? acc : -acc);
    }
  }
  e.spin = Math.atan2(e.vy, e.vx) + Math.PI / 2;
  e.x += e.vx;
  e.y += e.vy;
  // 段链跟随(linkDist 44 = 44*scale;原版 num24) + 探针弹幕
  driveChain(e, 44);
  if (!buried) {
    for (let s = e.wormNext; s; s = s.wormNext) {
      if (s.vanillaId !== 135 || s.dead) continue;
      // 原版 135:localAI[0] += Next(4),达 Next(1400,26000) 触发(期望 ~6850t/节);
      // 近似为每 tick 2/6850 概率 + 视线检查
      if (Math.random() < 2 / 6850 && losClear(game, s.cx, s.cy, player.cx, player.cy)) {
        const dx = player.cx - s.cx + (Math.random() - 0.5) * 40;
        const dy = player.cy - s.cy + (Math.random() - 0.5) * 40;
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, s.cx + dx / d * 5, s.cy + dy / d * 5,
          dx / d * 8 + (Math.random() - 0.5) * 2, dy / d * 8 + (Math.random() - 0.5) * 2, 22, 100);
      }
    }
  }
}

/** 生成蠕虫段链(Enemy.spawnWormChain 的外部包装;Destroyer 用 135/136) */
export function enemySpawnChain(head: Enemy, count: number): Enemy[] {
  const Ctor = enemyCtor;
  if (!Ctor) return [];
  return Ctor.spawnWormChain(head, count);
}
/** 头驱动段链收缩跟随(原版 :50374-50414,linkDist 可配) */
export function driveChain(head: Enemy, linkDist: number): void {
  for (let s = head.wormNext; s; s = s.wormNext) {
    const fx = s.wormFollow!;
    const dxC = fx.cx - s.cx;
    const dyC = fx.cy - s.cy;
    const dist = Math.hypot(dxC, dyC);
    if (dist > 0.01) {
      const shrink = (dist - linkDist) / dist;
      s.x += dxC * shrink;
      s.y += dyC * shrink;
      s.spin = Math.atan2(dyC, dxC) + Math.PI / 2;
      s.facing = dxC < 0 ? 1 : -1;
    }
  }
}

// ---- 工具 ----

function collideGround(e: Enemy, game: GameHooks) {
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
