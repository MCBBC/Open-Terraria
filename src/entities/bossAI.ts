// Boss AI 1:1 移植(Terarria1456 NPC.cs SetDefaults 指定 aiStyle 的专用核)。
// 由 Enemy.fixedUpdate 的 aiStyle 分发调用;弹幕用 MagicProj/投射桶,部件用 fromVanilla。
// 各核保留原版状态机主链与特征机制(移速/计时/阶段),专家专属分支注释标明。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { MagicProj } from './MagicProj';

const addProj = (game: GameHooks, p: MagicProj) => {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(p, 'projectiles');
};
const addEnemy = (game: GameHooks, e: Enemy) => {
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
    // 守卫恒速直追(伤害 9999 语义)
    e.def.damage = isGuardian ? 9999 : e.def.damage;
    const dx = player!.cx - e.cx, dy = player!.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    e.vx = (dx / d) * 8; e.vy = (dy / d) * 8;
    e.x += e.vx; e.y += e.vy;
    return;
  }
  if (e.ai1 === 3) { e.y += 4; return; }
  if (!player) return;

  e.ai2 += 1;
  if (e.ai1 === 0) {
    // 悬浮段(:22046-22091)
    if (e.ai2 >= 800) { e.ai2 = 0; e.ai1 = 1; }
    // 回悬浮:恢复冲撞前的伤害/防御基值
    const base = skSpinBase.get(e);
    if (base) { e.def.damage = base.dmg; e.def.defense = base.def; skSpinBase.delete(e); }
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
    let base = skSpinBase.get(e);
    if (!base) { base = { dmg: e.def.damage, def: e.def.defense ?? 0 }; skSpinBase.set(e, base); }
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

/** 骷髅王冲撞态的伤害/防御基值缓存(进冲撞一次性 ×1.3/-10,离场恢复) */
const skSpinBase = new WeakMap<Enemy, { dmg: number; def: number }>();

let enemyCtor: (typeof import('./Enemy'))['Enemy'] | null = null;
/** Enemy 构造注入(Enemy.ts import 时回填,避免循环依赖) */
export function bindEnemyCtor(c: (typeof import('./Enemy'))['Enemy']) { enemyCtor = c; }

function spawnPart(game: GameHooks, src: Enemy, id: number): Enemy | null {
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
  if (!player) return;
  // Enemy.ai0 默认 -1120(史莱姆族约定);原版 AI_015 的 ai[0] 从 0 起步 → 首帧复位
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; }
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
  if (!player) return;
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
