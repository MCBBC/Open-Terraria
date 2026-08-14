// Boss AI 1:1 移植(Terarria1456 NPC.cs SetDefaults 指定 aiStyle 的专用核)。
// 由 Enemy.fixedUpdate 的 aiStyle 分发调用;弹幕用 MagicProj/投射桶,部件用 fromVanilla。
// 各核保留原版状态机主链与特征机制(移速/计时/阶段),专家专属分支注释标明。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { mainExpertMode, getAttackDamageForProjectiles } from '../stats/ScaleStats';
import { canHit } from '../physics/LineOfSight';
import { MagicProj } from './MagicProj';
import { Arrow } from './Arrow';
import { markMechQueen, registerMechQueen, mechQueenUp, getMechQueen, getMechQueenCenter } from './mechQueen';

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
  // ★进入狂暴时冻结旋转方向(ai3):原版 rotation += direction*0.3 的 direction 是
  //  TargetClosest 的**持久**朝向字段(目标侧),非每帧 sign(vx)——曾用 facing
  //  (每帧 vx 符号)致旋冲过头贴脸时 spin 反复换号 = "只会两边摇动不旋转"
  if (game.world.clock.isDay && !isGuardian && e.ai1 !== 3) {
    if (e.ai1 !== 2) e.ai3 = player && player.cx > e.cx ? 1 : -1;
    e.ai1 = 2;
  }
  if (!player || Math.abs(e.cx - player.cx) > 2000 || Math.abs(e.cy - player.cy) > 2000) {
    if (!player || Math.abs(e.cx - player.cx) > 2000 || Math.abs(e.cy - player.cy) > 2000) e.ai1 = 3;
  }
  if (e.ai1 === 2) {
    // 白天狂暴（:22247-22261）：damage/defense 均 9999、rotation+=0.3*direction、
    // 8 速恒直追——此前只改了伤害没改防御，且玩家死后 null 解引用
    e.def.damage = 9999;
    e.def.defense = 9999;
    e.spin += (e.ai3 || 1) * 0.3;
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
    // 悬浮段(:22046-22091):rotation = velocity.X/15(倾转)
    e.spin = e.vx / 15;
    if (e.ai2 >= 800) {
      e.ai2 = 0;
      e.ai1 = 1;
      // 旋冲方向冻结 = 目标侧(TargetClosest direction 语义,见上 ai1=2 注)
      e.ai3 = player.cx > e.cx ? 1 : -1;
    }
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
    e.spin += (e.ai3 || 1) * 0.3;
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

/** 指定坐标生成原版怪（NPC.NewNPC 语义，Bottom 锚点由调用方换算）：
 *  spawnWOF（bossAI_wof）等无"母体"来源的生成点用 */
export function spawnVanillaEnemy(game: GameHooks, id: number, x: number, y: number): Enemy | null {
  if (!enemyCtor) return null;
  const p = enemyCtor.fromVanilla(id, x, y);
  if (!p) return null;
  return addEnemy(game, p);
}

/** Enemy.spawnWormChain 的代理出口（外部 AI 文件以 type-only 导入 Enemy，
 *  运行时引用会成环——绑定源同 spawnPart 的 enemyCtor）：建链并入 enemies 桶 */
export function spawnWormChainFor(game: GameHooks, head: Enemy, segCount: number): Enemy[] {
  if (!enemyCtor) return [];
  const segs = enemyCtor.spawnWormChain(head, segCount);
  const em = (game as unknown as { entities?: { add?: (e: unknown, b: string) => void } }).entities;
  for (const s of segs) em?.add?.(s, 'enemies');
  return segs;
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
/** 史莱姆王传送目的地（Bottom 锚像素，= vanilla localAI[1]/[2]；despawn 支=世界角 :43485） */
const kingTpDest = new WeakMap<Enemy, { x: number; y: number }>();
/** localAI[0] anti-cheese 计数（:43504-43510 ≥360 或距玩家 >2000px → 落玩家脚底） */
const kingAntiCheese = new WeakMap<Enemy, number>();

/** AI_015_KingSlime_FindTeleportSpot（:43402-43434 收敛）：外环 ±10/内环 ±7 收
 *  "上格净空的实心格、非岩浆、对玩家有视线"的落点随机取一；失败退 (±6,±2)；
 *  再失败落玩家脚底。返回 Bottom 锚像素。 */
function kingFindTeleportSpot(e: Enemy, game: GameHooks, player: Player): { x: number; y: number } {
  const st = game.world.store;
  const px = Math.floor(player.cx / TILE), py = Math.floor((player.y + player.h) / TILE);
  const cand: Array<{ x: number; y: number }> = [];
  for (const [rx, ry] of [[10, 10], [6, 2]] as const) {
    cand.length = 0;
    for (let x = px - rx; x <= px + rx; x++) {
      for (let y = py - ry; y <= py + ry; y++) {
        if (!st.inBounds(x, y) || !st.isSolid(x, y)) continue;
        if (st.isSolid(x, y - 1)) continue;                       // 顶上净空
        if (st.liquid[st.idx(x, y - 1)] > 0 && st.liquidType[st.idx(x, y - 1)] === 2) continue; // 岩浆
        if (!canHit(st, x * TILE + 8, (y - 1) * TILE + 8, 1, 1, player.x, player.y, player.w, player.h)) continue;
        // 外环 ±10/内环 ±7：|dx|>7 || |dy|>7 的环带才收（内 7×7 排除近身）
        if (rx === 10 && Math.abs(x - px) <= 7 && Math.abs(y - py) <= 7) continue;
        cand.push({ x, y });
      }
    }
    if (cand.length) break;
  }
  const pick = cand.length ? cand[Math.floor(Math.random() * cand.length)] : { x: px, y: py };
  return { x: pick.x * TILE + TILE / 2, y: (pick.y + 1) * TILE };   // Bottom 锚
}

export function kingSlimeAI(e: Enemy, game: GameHooks, player: Player | null) {
  // Enemy.ai0 默认 -1120(史莱姆族约定);原版 AI_015 的 ai[0] 从 0 起步 → 首帧复位
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; }
  // 玩家死/远距 3000px(:43466-43485)：TargetClosest 二次判定后仍失败 →
  // EncourageDespawn(10) + 背对 + ai[1]=5 缩身离场（anti-cheese 传送回归）
  const ksd = player ? Math.hypot(player.cx - e.cx, player.cy - e.cy) : Infinity;
  if (!player || ksd > 3000) {
    e.encourageDespawn(10);
    if (player) e.facing = player.cx < e.cx ? 1 : -1; // 转身背对(:43479-43485)
    if (e.ai1 !== 5 && e.ai1 !== 6) {
      e.ai1 = 5; e.ai3 = 0;
      kingTpDest.set(e, { x: game.world.w * TILE, y: game.world.h * TILE }); // :43485-43488 世界角
    }
  }
  if (e.ai1 === 5) {
    // 离场/传送缩身态（:43537-43575）：60 tick 缩身 → Gore734 → Bottom 锚落位 → 6 号淡入
    e.ai3++;
    e.squash = Math.max(0, 1 - e.ai3 / 60) * 0.6; // 缩身近似（scale 收缩）
    game.spawnParticles(e.cx, e.cy, '#4E88FF', 10, 1.2, { life: 30 }); // 每帧 10 尘 4 蓝 ×0.5（:43564-43570）
    e.vy += 0.3;
    e.x += e.vx; e.y += e.vy;
    if (e.ai3 === 60) {
      game.spawnParticles(e.cx, e.cy - e.h / 2, '#FFD060', 6, 2, { life: 40 }); // Gore 734 王冠（:43552）
    }
    if (e.ai3 >= 60) {
      const dest = kingTpDest.get(e) ?? { x: game.world.w * TILE, y: game.world.h * TILE };
      e.x = dest.x - e.w / 2;
      e.y = dest.y - e.h;                          // base.Bottom = (localAI[1], localAI[2])（:43554）
      e.ai1 = 6; e.ai3 = 0;
      e.squash = 0;
      e.spawnAlpha = 255; e.alphaFade = true; // 淡入（6 号态）
    }
    return;
  }
  if (e.ai1 === 6) {
    // 淡入回归（约 30 tick spawnAlpha 归零后回战斗）
    e.ai3++;
    game.spawnParticles(e.cx, e.cy, '#4E88FF', 10, 2.4, { life: 30 }); // 到达尘 ×2（:43584-43590）
    e.ai0 = 0;
    if (e.ai3 >= 30) { e.ai1 = 0; e.ai3 = 0; }
    return;
  }
  if (!player) return;
  // ---- 常规周期传送（:43507-43530）：ai2 在 无视线||高差>160 时累计，≥300 且落地 →
  //  传送循环；antiCheese（localAI[0]≥360 或距玩家>2000px）直接落玩家脚底（:43504-43510）----
  if (e.ai1 < 5 && e.onGround) {
    const los = canHit(game.world.store, e.x, e.y, e.w, e.h, player.x, player.y, player.w, player.h);
    const heightGap = Math.abs(e.y - (player.y + player.h));
    if (!los || heightGap > 160) e.ai2 += 1;
    else if (e.ai2 > 0) e.ai2 -= 1;
    const ac = (kingAntiCheese.get(e) ?? 0) + 1;
    kingAntiCheese.set(e, ac);
    const kdist = Math.hypot(player.cx - e.cx, player.cy - e.cy);
    if (e.ai2 >= 300) {
      e.ai2 = 0; e.ai0 = 0;
      kingTpDest.set(e, ac >= 360 || kdist > 2000
        ? { x: player.cx, y: player.y + player.h }   // antiCheese 玩家脚底
        : kingFindTeleportSpot(e, game, player));
      e.ai1 = 5; e.ai3 = 0;
    }
  }
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

/** AI_054 克苏鲁之脑 266（NPC.cs:32537-32827 全核 1:1）：
 *  SetDefaults :12370-12386 dontTakeDamage=true（fromVanilla 已置位）→ 一阶段不可击；
 *  爬行者清零 → ai[0]=-1 进二阶段（入场演出一次性 + 解除无敌）。
 *  一阶段 ai[0]：0 缓追玩家（1 速 :32703-32723；FTW ×3）+ 瞬移计时 localAI[1] 达
 *  120+Next(300) 选点(:32744-32785，12..40 格偏移、目标速度向投影 +16×speed、
 *  101 次后无条件 / 非实心且(>75 次或 CanHit) 才收)→ 1 渐隐(+5/t 到 255)→
 *  落点瞬移(:32788-32799)→ 2 渐显(-5/t 到 0)→ 回 0。
 *  二阶段 ai[0]<0：-1 追踪 8 速 ((v*50+dir)/51 :32591-32600)，计时 localAI[1]
 *  达 60+Next(120)（justHit 时 -Next(5) :32605-32609）→ -2（v×0.9、ai[3]+=25/t
 *  到 255 后瞬移 :32660-32681）→ -3（ai[3]-=25/t 回 -1 :32682-32699），alpha 跟 ai[3]。
 *  专家/FTW 四镜像幻影（Main.cs:24799-24843）：life<lifeMax 时以玩家中心镜像画
 *  4 份（Renderer.drawEnemy BoC 分支），alpha=(1-life/lifeMax)²×2 钳 0..1——
 *  与本 AI 的 alpha 渐隐/渐显瞬移循环是两套独立机制。
 *  距离消散 :32555-32567（曼哈顿 >6000px）；玩家死/离猩红 :32810-32826
 *  （localAI[3] 钳 120，>60 后 vy+=(n-60)*0.25、ai[0]=2、alpha=10；
 *  ZoneCrimson 读 world.scene.zoneCrimson）。 */
export function brainOfCthulhuAI(e: Enemy, game: GameHooks, player: Player | null) {
  const st = game.world.store;
  // :32555-32567 TargetClosest 后曼哈顿 >6000 → active=false（记逃走）
  if (player && Math.abs(player.cx - e.cx) + Math.abs(player.cy - e.cy) > 6000) {
    e.dead = true; e.bossFled = true;
    return;
  }
  // 初次生成爬行者（:32540-32553）：GetBrainOfCthuluCreepersCount(:51330-51338)=20，
  // getGoodWorld（for the worthy 种子）= 40；出点 = 本体中心 ±(width/height) 随机，
  // 初速 = Next(-30,31)*0.1。爬行者锚定本体（原版 crimsonBoss 静态位 → master 引用）
  // 本仓 ai0 缺省 -1120 是史莱姆 hop 计数哨兵；原版 NPC.ai[0] 缺省 0（一阶段态）。
  // 放在 bInit 门之外：存档载入的实体同样需要归一（载入值 0/-1..-3 不受影响）
  if (e.ai0 === -1120) e.ai0 = 0;
  if (!e.bInit) {
    e.bInit = true;
    for (let k = 0; k < (game.world.seedFlags?.getGoodWorld ? 40 : 20); k++) {
      const c = spawnPart(game, e, 267);
      if (!c) continue;
      c.master = e;
      c.ai0 = 0; // 原版 ai[0] 缺省 0（环绕态）
      c.x = e.cx + (Math.floor(Math.random() * (2 * e.w)) - e.w) - c.w / 2;
      c.y = e.cy + (Math.floor(Math.random() * (2 * e.h)) - e.h) - c.h / 2;
      c.vx = (Math.floor(Math.random() * 61) - 30) * 0.1;
      c.vy = (Math.floor(Math.random() * 61) - 30) * 0.1;
    }
  }
  // 一阶段爬行者计数（:32726-32742）
  const creepers = (game.enemies() as Enemy[]).filter((n) => !n.dead && n.vanillaId === 267);

  if (e.ai0 < 0) {
    // ---- 二阶段（:32569-32699）----
    // :32575-32588 入场演出一次性（localAI[2] 门）：SoundID 3（Zombie_1）+
    //   血块 gore 392-395（gore 未接 → 粒子近似，登记）+ 尘 5 号 ×20 + SoundID 15
    //   （ZombieMoan wav 未提取 → 略，登记）
    if (e.lai2 === 0) {
      e.lai2 = 1;
      game.playSfxFiles(['NPC_Hit_1'], 1, e.cx, e.cy);
      game.spawnParticles(e.cx, e.cy, '#A03050', 20, 2);
      game.playSfxFiles(['Zombie_2'], 0.8, e.cx, e.cy);
    }
    // :32589 爬行者全灭后解除一阶段无敌（SetDefaults :12372 置位）
    e.dontTakeDamage = false;
    // :32590-32600 追踪：8 速逼近（(v*50+dir)/51）
    if (player) {
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (e.vx * 50 + (dx / d) * 8) / 51;
      e.vy = (e.vy * 50 + (dy / d) * 8) / 51;
    }
    if (e.ai0 === -1) {
      // :32603-32657 瞬移计时：localAI[1]+1，justHit 抵扣 Next(5)；
      //   达 60+Next(120)（单人无 netMode 附加段 :32611-32614）→ 选点 → ai[0]=-2
      e.lai1 += 1;
      if (e.justHit) e.lai1 -= Math.floor(Math.random() * 5);
      const num859 = 60 + Math.floor(Math.random() * 120);
      if (e.lai1 >= num859 && player) {
        e.lai1 = 0;
        const spot = pickTeleportSpot(st, e, player, 10, 12, false);
        e.ai3 = 0;
        e.ai0 = -2;
        e.ai1 = spot.x; e.ai2 = spot.y;
      }
    } else if (e.ai0 === -2) {
      // :32660-32681 渐隐：v×0.9，ai[3]+=25/t（单人档），到 255 → 落点瞬移
      e.vx *= 0.9; e.vy *= 0.9;
      e.ai3 += 25;
      if (e.ai3 >= 255) {
        e.ai3 = 255;
        e.x = e.ai1 * TILE - e.w / 2;
        e.y = e.ai2 * TILE - e.h / 2;
        game.playSfxFiles(['Item_8'], 1, e.cx, e.cy); // SoundID.Item8
        e.ai0 = -3;
      }
      e.spawnAlpha = e.ai3;
    } else if (e.ai0 === -3) {
      // :32682-32699 渐显：ai[3]-=25/t，≤0 回 -1
      e.ai3 -= 25;
      if (e.ai3 <= 0) {
        e.ai3 = 0;
        e.ai0 = -1;
      }
      e.spawnAlpha = e.ai3;
    }
  } else {
    // ---- 一阶段（:32701-32808）----
    // :32703-32723 缓追玩家：1 速（getGoodWorld ×3 :32708-32710），<1px 直达
    if (player) {
      let dx = player.cx - e.cx, dy = player.cy - e.cy;
      let num870 = 1;
      if (game.world.seedFlags?.getGoodWorld) num870 *= 3;
      const d = Math.hypot(dx, dy);
      if (d < num870) {
        e.vx = dx; e.vy = dy;
      } else {
        e.vx = (dx / d) * num870;
        e.vy = (dy / d) * num870;
      }
    }
    if (e.ai0 === 0) {
      // :32726-32742 爬行者清零 → 二阶段
      if (creepers.length === 0) {
        e.ai0 = -1;
        e.lai1 = 0;
        e.spawnAlpha = 0;
      }
      // :32743-32785 瞬移计时：120+Next(300) → 选点（12..40 格）→ ai[0]=1
      if (player) {
        e.lai1 += 1;
        if (e.lai1 >= 120 + Math.floor(Math.random() * 300)) {
          e.lai1 = 0;
          const spot = pickTeleportSpot(st, e, player, 12, 40, true);
          e.ai0 = 1;
          e.ai1 = spot.x; e.ai2 = spot.y;
        }
      }
    } else if (e.ai0 === 1) {
      // :32788-32799 渐隐：+5/t 到 255 → 落点瞬移 → ai[0]=2
      e.spawnAlpha = Math.min(255, e.spawnAlpha + 5);
      if (e.spawnAlpha >= 255) {
        game.playSfxFiles(['Item_8'], 1, e.cx, e.cy); // SoundID.Item8
        e.x = e.ai1 * TILE - e.w / 2;
        e.y = e.ai2 * TILE - e.h / 2;
        e.ai0 = 2;
      }
    } else if (e.ai0 === 2) {
      // :32800-32808 渐显：-5/t 到 0 → ai[0]=0
      e.spawnAlpha = Math.max(0, e.spawnAlpha - 5);
      if (e.spawnAlpha <= 0) e.ai0 = 0;
    }
  }
  e.x += e.vx;
  e.y += e.vy;
  // :32810-32826 玩家死 || !玩家 ZoneCrimson（玩家离开猩红群系，SceneMetrics
  //   本帧快照 world.scene.zoneCrimson）→ 下坠逃离尾段（原版在状态机之后）：
  //   localAI[3] 钳 120，>60 后 vy+=(n-60)*0.25、ai[0]=2、alpha=10；恢复则计数递减。
  //   scene 为 null（本帧未扫/宿主无快照）视作"在猩红内"不逃离——原版 ZoneCrimson
  //   是玩家字段，扫描后才有意义，null 不等价 false
  const scene = game.world.scene;
  const playerGone = !player || player.dead || (scene != null && !scene.zoneCrimson);
  if (playerGone) {
    if (e.lai3 < 120) e.lai3 += 1;
    if (e.lai3 > 60) e.vy += (e.lai3 - 60) * 0.25;
    e.ai0 = 2;
    e.spawnAlpha = 10;
  } else if (e.lai3 > 0) {
    e.lai3 -= 1;
  }
}

/** 克脑瞬移选点（一阶段 :32748-32784 / 二阶段 :32620-32656 同构，参数不同）：
 *  以玩家所在格为原点，min..max 格随机偏移（各 50% 取负）；偏移向量与玩家速度
 *  同向（点积>0）时沿自身方向外推 16×speed px；一阶段收点条件 =
 *  101 次后无条件 或（非实心 且（76 次后 或 对玩家 CanHit）），二阶段 =
 *  101 次后无条件 或 非实心；越界点 = 非实心直接收（SolidTile 越界取空 tile，
 *  :32646/:32775 无 InWorld 门）。返回 tile 坐标。 */
function pickTeleportSpot(
  st: GameHooks['world']['store'], _e: Enemy, p: Player,
  min: number, max: number, losGate: boolean,
): { x: number; y: number } {
  const pxSpeed = Math.hypot(p.vx, p.vy);
  let tries = 0;
  let tx = Math.floor(p.cx / TILE), ty = Math.floor(p.cy / TILE);
  for (;;) {
    tries++;
    let a = min + Math.floor(Math.random() * (max - min + 1));
    let b = min + Math.floor(Math.random() * (max - min + 1));
    if (Math.floor(Math.random() * 2) === 0) a *= -1;
    if (Math.floor(Math.random() * 2) === 0) b *= -1;
    let vx = a * TILE, vy = b * TILE;
    // 玩家速度与偏移同向 → 外推（SafeNormalize 后 ×16×speed）
    if (p.vx * vx + p.vy * vy > 0) {
      const vl = Math.hypot(vx, vy) || 1;
      vx += (vx / vl) * 16 * pxSpeed;
      vy += (vy / vl) * 16 * pxSpeed;
    }
    tx = Math.floor(p.cx / TILE) + Math.trunc(vx / TILE);
    ty = Math.floor(p.cy / TILE) + Math.trunc(vy / TILE);
    // WorldGen.SolidTile 越界取默认空 tile → 非实心：越界点直接视"非实心+视线通"
    // 收下（NPC.cs:32646/:32775 收点条件无 InWorld 门，此前越界一律重掷是偏差）
    const inB = st.inBounds(tx, ty);
    const solid = inB && st.isSolid(tx, ty); // WorldGen.SolidTile
    const canSee = !losGate || !inB
      || canHit(st, tx * TILE, ty * TILE, 1, 1, p.x, p.y, p.w, p.h);
    if (tries > 100 || (!solid && (!losGate || tries > 75 || canSee))) break;
  }
  return { x: tx, y: ty };
}

/** 267 爬行者（NPC.cs:32828-32914 全核 1:1，SetDefaults :12388-12400）：
 *  ai[0]=0 环绕态：距主体 >90px 时 8 速逼近（(v*15+dir)/16）后 return；
 *  ≤90px 且 |v|<8 时两轴 ×1.05；直冲门 :32857 = `(expertMode && Next(100)==0) || Next(200)==0`
 *  （专家两掷串联：命中概率 1/100+(99/100)(1/200)≈1.5%）→ 8 速直冲玩家、ai[0]=1。
 *  ai[0]=1 扑咬态：专家追踪 :32872-32886——单位向量朝玩家 ×9（getGoodWorld ×12），
 *  (v*99+dir)/100（FTW (v*49+dir)/50）；经典档无追踪。
 *  距主体 >700px 回环绕；否则 !justHit 即 return（保持直飞），
 *  justHit 时按 knockBackResist 分流（=0 → 计数 ai[1] 超 5 回环绕，
 *  否则立即回环绕——267 原值 0.8 → 一击即回）。主体不在 → 消散（:32830-32835）。 */
export function creeperAI(e: Enemy, game: GameHooks, _player: Player | null) {
  // 本仓 ai0 缺省 -1120（史莱姆哨兵）归一到原版缺省 0（环绕态）
  if (e.ai0 === -1120) e.ai0 = 0;
  const boss = e.master;
  // :32830-32835 crimsonBoss<0（主体不在）→ active=false
  if (!boss || boss.dead || boss.vanillaId !== 266) { e.dead = true; return; }
  // Main.expertMode（Main.cs:2762，getGoodWorld 抬档同样成立）
  const expert = mainExpertMode(game.world);
  const player = _player && !_player.dead ? _player : null;
  if (e.ai0 === 0) {
    // :32836-32856 环绕态：ai[1]=0；距主体 >90px 逼近
    e.ai1 = 0;
    const dx = boss.cx - e.cx, dy = boss.cy - e.cy;
    const d = Math.hypot(dx, dy);
    if (d > 90) {
      e.vx = (e.vx * 15 + (dx / d) * 8) / 16;
      e.vy = (e.vy * 15 + (dy / d) * 8) / 16;
      e.x += e.vx; e.y += e.vy;
      return;
    }
    if (Math.abs(e.vx) + Math.abs(e.vy) < 8) {
      e.vy *= 1.05;
      e.vx *= 1.05;
    }
    // :32857-32869 直冲门（TargetClosest 后 8 速直冲玩家、转扑咬态）：
    //   `netMode!=1 && ((expertMode && Next(100)==0) || Next(200)==0)`
    //   ★ 掷骰顺序照原版：专家先掷 Next(100)，未中再掷 Next(200)（短路求值）
    if (player && ((expert && Math.floor(Math.random() * 100) === 0) || Math.floor(Math.random() * 200) === 0)) {
      const pdx = player.cx - e.cx, pdy = player.cy - e.cy;
      const pd = Math.hypot(pdx, pdy) || 1;
      e.vx = (pdx / pd) * 8;
      e.vy = (pdy / pd) * 8;
      e.ai0 = 1;
    }
    e.x += e.vx; e.y += e.vy;
    return;
  }
  // ---- 扑咬态 ai[0]=1（:32871-32913）----
  // :32872-32886 专家追踪：朝玩家单位向量 ×9（FTW ×12），
  //   velocity = (v*99+dir)/100（FTW (v*49+dir)/50）——经典档直飞不追踪
  if (expert && player) {
    let tx = player.cx - e.cx, ty = player.cy - e.cy;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;                       // vector101.Normalize()
    if (game.world.seedFlags?.getGoodWorld) {
      tx *= 12; ty *= 12;
      e.vx = (e.vx * 49 + tx) / 50;
      e.vy = (e.vy * 49 + ty) / 50;
    } else {
      tx *= 9; ty *= 9;
      e.vx = (e.vx * 99 + tx) / 100;
      e.vy = (e.vy * 99 + ty) / 100;
    }
  }
  // :32887-32894 距主体 >700px → 回环绕
  const bdx = boss.cx - e.cx, bdy = boss.cy - e.cy;
  if (Math.hypot(bdx, bdy) > 700) {
    e.ai0 = 0;
  } else {
    // :32897-32900 未受击保持直飞（经典档无追踪）
    if (!e.justHit) { e.x += e.vx; e.y += e.vy; return; }
    // :32901-32912 knockBackResist==0（def 存承受比例：0=免疫）→ 计数 ai[1]>5 回环绕；
    //   否则一击即回（267 原值 0.8 走此支）
    if ((e.def.knockbackResist ?? 1) <= 0.01) {
      e.ai1 += 1;
      if (e.ai1 > 5) e.ai0 = 0;
    } else {
      e.ai0 = 0;
    }
  }
  e.x += e.vx;
  e.y += e.vy;
  void game;
}

// ================= 机械三王(NPC.cs AI_030-037,1.4.5.6 行号见各核注释) =================
// 经典模式参数 1:1;getGoodWorld(FTW)分支已全量实装(克脑/双子/毁灭者/爬行者);
// 专家/大师分支仅注释保留。史莱姆王 AI_015 的 FTW 分支(:43440/:43662)依赖的
// 基线行为(空中横移 num7=3、跳跃 num2 缩放)本仓未建模,无可挂载点,登记跳过。

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
/** 直线视线(Collision.CanHit 1:1,Collision.cs:388-480:逐 tile 扫描,半砖/坡面/
 *  平台/已致动/开门态不阻挡,"两邻格均整实心"=被夹住 → 无视线;8px 采样近似已退役)。
 *  入参为像素点对(w=h=0 → 中心=该点);原版 CanHitLine 场景见 physics/LineOfSight */
export function losClear(game: GameHooks, x0: number, y0: number, x1: number, y1: number): boolean {
  return canHit(game.world.store, x0, y0, 0, 0, x1, y1, 0, 0);
}
/** Boss 弹幕:直飞(grav 0)+ 原版 Projectile_N 贴图。
 *  hostile=true(原版 Projectile.hostile):命中玩家结算——所有走本出口的弹都是
 *  Boss/敌怪发射的敌弹(双子激光/死光/蜂后毒刺/哥布林弹等) */
export function shoot(game: GameHooks, x: number, y: number, vx: number, vy: number, dmg: number, projId: number, life = 300, arrowOpts?: Partial<import('./Arrow').ArrowOpts>): void {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
    new Arrow(x, y, vx, vy, dmg, 0, projId, null, { grav: 0, life, pierce: 1, hostile: true, ...arrowOpts }), 'projectiles');
}

/** NPC.SpawnMechQueen 合体召唤链(NPC.cs:19739-19748,Game.summonMechdusa 调用)：
 *  queen(127) 落位 → markMechQueen(=SpawnBoss :81472 写 ai[3]=mechQueen 非零标记)
 *  → 以 queen Center 为共同出生点同点 NewNPC 125/126/134 + 2×139 探针
 *  (ai2=毁灭者头引用,ai3=∓1 侧位——原版第 7/8 参 ai2/ai3,曾误记 ai0)。
 *  调用方须已过 anyMechBossUp 门与 Mechdusa 种子门(remix+getGood)。 */
export function spawnMechQueenEnsemble(game: GameHooks, cx: number, cy: number): Enemy | null {
  const queen = spawnVanillaEnemy(game, 127, cx, cy);
  if (!queen) return null;
  // SpawnBoss :81469-81473：Type==127 且 mechQueen!=-1 → ai[3]=whoAmI(非零标记)；
  // 本仓 ai3 是旋冲方向缓存(±1)不冲突——mech 态旋转走 AngleLerp 不读 ai3,标记走 WeakSet
  markMechQueen(queen);
  queen.ai3 = queen.id;
  // :19743-19747 同点伴随(取 mechQueen 的 Center);探针 ai2=134 引用、ai3=∓1 侧位
  for (const id of [125, 126]) spawnVanillaEnemy(game, id, queen.cx, queen.cy);
  const head = spawnVanillaEnemy(game, 134, queen.cx, queen.cy);
  for (const side of [-1, 1]) {
    const probe = spawnVanillaEnemy(game, 139, queen.cx, queen.cy);
    if (probe) { probe.ai2 = head ? head.id : -1; probe.ai3 = side; }
  }
  return queen;
}

/** Mechdusa 探针 139 挂链锁位(NPC.cs AI_005 :50866-50920 + :50975-51007)：
 *  ai3≠0 = 召唤链出生的挂链探针——queen 失效/头失效 → 脱落(ai3=0 回常规 swarmer,
 *  dontTakeDamage 解除);头在场 → 锁位绕头(头中心 + (26×ai3,0).RotatedBy(头 rotation,
 *  头中心)),速度 = queen 速度,无敌;localAI[0] 每 tick +3、受击清零,≥360 发 84 号
 *  弹(25 伤,玩家速度×20 预判 8 速,Projectile.cs 命中端另乘难度)。
 *  返回 true = 已锁位并完成积分(调用方须跳过常规移动段)。 */
export function mechProbeLock(e: Enemy, game: GameHooks, player: Player | null): boolean {
  if (!mechQueenUp()) {
    e.dontTakeDamage = false;
    e.ai3 = 0;                        // :50909-50919 else 分支:脱落
    return false;
  }
  const queen = getMechQueen()!;
  // :50877-50881 ai2 引用失效(头槽变号) → FindFirstNPC(134) 重挂
  const ens = game.enemies() as Enemy[];
  let host: Enemy | null = ens.find((n) => !n.dead && n.vanillaId === 134 && n.id === e.ai2) ?? null;
  if (!host) {
    host = ens.find((n) => !n.dead && n.vanillaId === 134) ?? null;
    if (host) e.ai2 = host.id;
  }
  if (!host) {
    e.dontTakeDamage = false;
    e.ai3 = 0;
    return false;
  }
  // :50898-50907 锁位:绕头公转(半径 26、相位随头 rotation),速度 = queen 速度
  const ang = host.spin;
  const ox = 26 * e.ai3;
  const px = host.cx + ox * Math.cos(ang);
  const py = host.cy + ox * Math.sin(ang);
  e.x = px - e.w / 2;
  e.y = py - e.h / 2;
  e.vx = queen.vx;
  e.vy = queen.vy;
  e.dontTakeDamage = true;
  // :50975-51007 射击(localAI[0] 挂链 +3/t、≥360 预判弹)
  e.lai0 += 1 + 2;
  if (e.justHitT > 0) e.lai0 = 0;
  if (e.lai0 >= 360) {
    e.lai0 = 0;
    if (player && losClear(game, e.cx, e.cy, player.cx, player.cy)) {
      const dx = player.cx - e.cx - player.vx * 20;
      const dy = player.cy - e.cy - player.vy * 20;
      const d = Math.hypot(dx, dy) || 1;
      shoot(game, e.cx, e.cy, dx / d * 8, dy / d * 8,
        getAttackDamageForProjectiles(25, 22, e.difficulty), 84);
    }
  }
  // :51041 探针倾斜 rotation = vx×0.1 + 通用积分(锁位点 + queen 速度)
  e.visAngle = e.vx * 0.1;
  e.x += e.vx;
  e.y += e.vy;
  return true;
}

/** Mechdusa queen 锚点(NPC.cs:26571-26579 雷眼 / :27194-27202 魔眼)：
 *  GetMechQueenCenter + (±150,-250)×0.75 再 RotatedBy(queen.velocity.X×0.025, 中心)
 *  ——双子挂 queen 头上,随 queen 水平速度整体旋转。返回绝对坐标。 */
export function mechQueenAnchor(queen: Enemy, spaz: boolean): { x: number; y: number } {
  const qc = getMechQueenCenter(queen);
  // vector38/44 = new Vector2(±150, -250) × 0.75
  const ox = (spaz ? 150 : -150) * 0.75, oy = -250 * 0.75;
  const ang = queen.vx * 0.025;            // num431/num475
  const cos = Math.cos(ang), sin = Math.sin(ang);
  // RotatedBy(ang, qc)：绕 qc 旋转 (qc+off) 点
  return { x: qc.x + ox * cos - oy * sin, y: qc.y + ox * sin + oy * cos };
}

/** AI_030/031 双子(NPC.cs:26497-27735):雷神之眼 125 / 魔神之眼 126。
 *  旋转持续瞄准玩家(0.1/0.15 步进+绕圈处理);白天/玩家死 → 上飞离场;
 *  一阶段(血>40%):侧向悬浮(300/400)→4-10 连冲(12/13 速);二阶段变身自旋;
 *  三阶段:雷眼 激光 83→100(伤害×1.5 防+10),魔眼 火焰喷射 101(伤害×1.5 防+18)。
 *  getGoodWorld(FTW)分支全量实装:悬浮/冲刺/弹幕计数抬档(:26599/26709/26745/
 *  26883/27020 雷眼,:27218/27313/27373/27539 魔眼)。
 *  Mechdusa 联动(IsMechQueenUp,2026-08-14 全分支实装):锚位悬浮(:26571-26579/
 *  :27194-27202)、悬浮计时 600→1200(:26685/:27291)、雷眼激光门 60→90/120
 *  (:26675-26680,有 135 段在场=120)、变身段反弹弹幕(:26812/:27435)、
 *  三阶段锚位悬浮+计时 300/400→1200(:26891-26906/:27510-27587/:27651-27671)、
 *  魔眼三阶段旋转步进 ×0.25(:27135-27139)、火焰沿自身朝向喷(:27640-27647)。 */
export function twinsAI(e: Enemy, game: GameHooks, player: Player | null, spaz: boolean) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  // Main.getGoodWorld(for the worthy)
  const ftw = !!game.world.seedFlags?.getGoodWorld;
  // Mechdusa 合体态(NPC.IsMechQueenUp)——queen 失效(死亡/消散)自动回落 false
  const mq = mechQueenUp();
  const queen = mq ? getMechQueen() : null;
  // 白天/玩家死:上飞离场(原版 :26585/:27208 vy-=0.04 + EncourageDespawn(10))——
  // 玩家死亡派发为 null,一并进离场（此前 null 仅漂移不消散）
  if (game.world.clock.isDay || !player || player.dead) {
    e.vy -= 0.04;
    e.encourageDespawn(10); // 离屏即消(Enemy 打 bossFled,Game 不播击败/不记账)
    e.x += e.vx; e.y += e.vy;
    return;
  }
  // ★双子 timeLeft 互保（:26548-26563）：夜晚、未消散且 timeLeft<10 时,向场上
  //  另一只眼借生命期（DiscourageDespawn(other.timeLeft-1)：取 max 抬升,NPC.cs:7237
  //  ——timeLeft 对应本仓 despawnTimer 屏外递减位）。效果=两只眼离屏同步消散,
  //  不会一只先蒸发留下单眼"独眼龙"
  if (!game.world.clock.isDay && e.despawnTimer < 10) {
    const other = (game.enemies() as Enemy[]).find((n) => !n.dead
      && n !== e && (n.vanillaId === 125 || n.vanillaId === 126));
    if (other && other.despawnTimer - 1 > e.despawnTimer) e.despawnTimer = other.despawnTimer - 1;
  }
  // reflectsProjectiles 每帧复位(:26582/:27204)——mech 变身段(:26812/:27435)置真
  e.reflectsProjectiles = false;
  // ---- 旋转瞄准(num427/num471:atan2(dy-59, 自-玩)+π/2,步进 0.1/0.15) ----
  let target = Math.atan2(e.y + e.h - 59 - (player.y + player.h / 2), e.cx - player.cx) + Math.PI / 2;
  if (target < 0) target += 6.283; else if (target > 6.283) target -= 6.283;
  // :27135-27139 魔眼 mech 态悬浮(三阶段 ai0==3 && ai1==0)旋转步进 ×0.25
  //  (锚位悬浮时头缓慢转向玩家)
  let step = spaz ? 0.15 : 0.1;
  if (spaz && mq && e.ai0 === 3 && e.ai1 === 0) step *= 0.25;
  let rot = e.spin;
  if (rot < target) { rot += (target - rot > Math.PI ? -step : step); }
  else if (rot > target) { rot += (rot - target > Math.PI ? step : -step); }
  if (Math.abs(rot - target) < step) rot = target;
  if (rot < 0) rot += 6.283; else if (rot > 6.283) rot -= 6.283;
  e.spin = rot;

  // ---- 一阶段(ai0=0) ----
  if (e.ai0 === 0) {
    if (e.ai1 === 0) {
      // 侧向悬浮:雷眼 玩家侧 300/上方 300 速 7/0.1;魔眼 侧 400 速 12/0.4;
      // FTW ×1.15(:26599-26603 雷眼 / :27218-27222 魔眼)
      let spd = spaz ? 12 : 7, acc = spaz ? 0.4 : 0.1;
      if (ftw) { spd *= 1.15; acc *= 1.15; }
      const side = e.cx < player.x + player.w ? -1 : 1;
      const offX = spaz ? 400 : 300, offY = spaz ? 0 : 300;
      const tx = player.cx + side * offX, ty = player.cy - offY;
      const hoverDist = Math.hypot(tx - e.cx, ty - e.cy);   // num438:玩家侧悬浮点距(mech 激光门消费)
      if (mq && queen) {
        // mech 锚位悬浮(:26622-26678 雷眼 / :27231-27260 魔眼):速 14、目标 =
        // queen 锚点;距离 >14 时目标速度钳 14,速度指数逼近(雷眼 1/60 :26674-26679,
        // 魔眼 1/5 :27241-27248)——双子挂 queen 头上随头旋转
        const a = mechQueenAnchor(queen, spaz);
        let dx = a.x - e.cx, dy = a.y - e.cy;
        const d = Math.hypot(dx, dy);
        if (d > 14) { dx = dx / d * 14; dy = dy / d * 14; }
        const k = spaz ? 5 : 60;   // 魔眼 (v*4+t)/5 / 雷眼 (v*59+t)/60
        e.vx = (e.vx * (k - 1) + dx) / k;
        e.vy = (e.vy * (k - 1) + dy) / k;
      } else {
        seek(e, tx, ty, spd, acc);
      }
      e.ai2 += 1;
      // mech 悬浮计时 600→1200(:26685-26690 雷眼 num440 / :27291-27296 魔眼 num483)
      if (e.ai2 >= (mq ? 1200 : 600)) { e.ai1 = 1; e.ai2 = 0; e.ai3 = 0; }
      // 悬浮期弹幕:魔眼 每 60t 诅咒焰 96(25 伤 12 速);雷眼 位于玩家上方且距悬浮点<400 时绿激光 83(20 伤 9 速)
      if (spaz) {
        e.ai3 += 1 + (ftw ? 0.4 : 0);   // :27313-27316 FTW 诅咒焰计数 +0.4/t
        if (e.ai3 >= 60) {
          e.ai3 = 0;
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          shoot(game, e.cx + dx / d * 4, e.cy + dy / d * 4,
            dx / d * 12 + (Math.random() - 0.5) * 4, dy / d * 12 + (Math.random() - 0.5) * 4, 25, 96);
        }
      } else if (e.y + e.h < player.y && hoverDist < 400) {
        e.ai3 += 1 + (ftw ? 0.5 : 0);   // :26709-26711 FTW 激光计数 +0.5/t
        // mech 激光门 60→90/120(:26673-26679 num441 = !npcsFoundForCheckActive[135]
        //   ? 90 : 120——毁灭者身段在场=更慢)
        const laserGate = mq
          ? ((game.enemies() as Enemy[]).some((n) => !n.dead && n.vanillaId === 135) ? 120 : 90)
          : 60;
        if (e.ai3 >= laserGate) {
          e.ai3 = 0;
          const dx = player.cx - e.cx, dy = player.cy - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          shoot(game, e.cx + dx / d * 15, e.cy + dy / d * 15,
            dx / d * 9 + (Math.random() - 0.5) * 6.4, dy / d * 9 + (Math.random() - 0.5) * 6.4, 20, 83);
        }
      }
    } else if (e.ai1 === 1) {
      // 冲撞:一次性朝玩家定速(雷眼 12/魔眼 13;FTW 雷眼 +2(:26750-26752)、
      // 魔眼 ×1.2(:27373-27376))
      e.spin = target;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      let spd = spaz ? 13 : 12;
      if (ftw) spd = spaz ? spd * 1.2 : spd + 2;
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
    // mech 变身段反弹玩家弹幕(:26812-26815 雷眼 / :27435-27438 魔眼)——
    // Projectile.cs:12050 flag6 命中即 ReflectProjectile 回射玩家(伤 1/4)
    if (mq) e.reflectsProjectiles = true;
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
    // 上方悬浮:雷眼 玩家正上 300(8/0.15,300t→冲);魔眼 侧 180 同高(4/0.1,400t→冲)
    // + 火焰喷射 101;FTW ×1.15(:26883-26887 雷眼 / :27539-27544 魔眼)
    let spd = spaz ? 4 : 8, acc = spaz ? 0.1 : 0.15;
    if (ftw) { spd *= 1.15; acc *= 1.15; }
    const offX = spaz ? 180 : 0, offY = spaz ? 0 : 300;
    const side = e.cx < player.x + player.w ? -1 : 1;
    if (!spaz && mq && queen) {
      // mech 雷眼三阶段锚位悬浮(:26891-26906):速 14、queen 锚点、距离钳 14、
      // 速度指数逼近 (v*4+t)/5;悬浮计时 300→1200(:26950-26953 num456)
      const a = mechQueenAnchor(queen, false);
      let dx = a.x - e.cx, dy = a.y - e.cy;
      const d = Math.hypot(dx, dy);
      if (d > 14) { dx = dx / d * 14; dy = dy / d * 14; }
      e.vx = (e.vx * 4 + dx) / 5;
      e.vy = (e.vy * 4 + dy) / 5;
    } else {
      seek(e, player.cx + side * offX, player.cy - offY, spd, acc);
    }
    e.ai2 += 1;
    // mech 悬浮计时:雷眼 300→1200 / 魔眼 400→1200(:26950/:27581)
    if (e.ai2 >= (mq ? 1200 : (spaz ? 400 : 300))) { e.ai1 = 1; e.ai2 = 0; e.ai3 = 0; }
    e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
    // 弹幕节奏 = 血量阶梯累积器（雷眼 :26971-26990 / 魔眼 :27598-27612 同表）：
    // 每 tick +1，<75%/<50%/<25% 各再 +1、<10% 再 +2（满血 1×、濒死 6×），
    // 蓄满（雷眼 180 / 魔眼 8）且视线可达 → 清零发射——曾写死固定节拍无低血加速
    e.ai3 += 1;
    if (e.hp < e.maxHp * 0.75) e.ai3 += 1;
    if (e.hp < e.maxHp * 0.5) e.ai3 += 1;
    if (e.hp < e.maxHp * 0.25) e.ai3 += 1;
    if (e.hp < e.maxHp * 0.1) e.ai3 += 2;
    if (e.ai3 > (spaz ? 8 : 180) && losClear(game, e.cx, e.cy, player.cx, player.cy)) {
      e.ai3 = 0;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spdP = spaz ? 6 : 8.5;
      const dmgP = spaz ? 30 : 25;
      const pid = spaz ? 101 : 100;
      const lead = spaz ? 4 : 15;
      let vx = dx / d * spdP + (Math.random() - 0.5) * 0.8;
      let vy = dy / d * spdP + (Math.random() - 0.5) * 0.8;
      let ox = e.cx + dx / d * lead, oy = e.cy + dy / d * lead;
      if (spaz && mq) {
        // mech 魔眼火焰沿自身朝向喷(:27640-27647):速度 = (rotation+π/2) 单位向量
        // ×6 + 自身速度×0.5,出膛点 = 中心 - 速度×3(反向出膛,火焰从"眼后"甩出)
        const fx = Math.cos(e.spin + Math.PI / 2) * spdP + e.vx * 0.5;
        const fy = Math.sin(e.spin + Math.PI / 2) * spdP + e.vy * 0.5;
        vx = fx; vy = fy;
        ox = e.cx - fx * 3; oy = e.cy - fy * 3;
      }
      shoot(game, ox, oy, vx, vy, dmgP, pid);
    }
    // 魔眼火焰音（:27593-27603 localAI[2]：视线可达时每 22t Item34——视线在
    // 下方发射门里判过，此处同帧条件内不重复掷）
    if (spaz && e.ai3 === 0) game.playSfxFiles(['Item_34'], 0.6, e.cx, e.cy);
    if (spaz && mq && queen) {
      // mech 魔眼三阶段尾段锚位悬浮(:27651-27671):玩家侧移动代码照跑后,
      // 目标速度改 queen 锚点(速 14 距离钳)、速度指数逼近 (v*59+t)/60——慢漂
      const a = mechQueenAnchor(queen, true);
      let dx = a.x - e.cx, dy = a.y - e.cy;
      const d = Math.hypot(dx, dy);
      if (d > 14) { dx = dx / d * 14; dy = dy / d * 14; }
      e.vx = (e.vx * 59 + dx) / 60;
      e.vy = (e.vy * 59 + dy) / 60;
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
      // FTW ×1.15(:27015-27025)
      let spd2 = 8, acc2 = 0.2;
      if (ftw) { spd2 *= 1.15; acc2 *= 1.15; }
      seek(e, player.cx + side * 340, player.cy, spd2, acc2);
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
 *  2=白天狂暴(伤/防 9999,10+距离/100 速追杀);3=玩家死/远 6000px 离场。
 *  Mechdusa queen 态(IsMechQueenUp,2026-08-14 全分支):悬浮 Y 带 300-350、
 *  X 窗平移 -450×侧(:27813-27819 num515/513/514);悬浮/旋冲/狂暴旋转改
 *  AngleLerp 倾转非自旋(:27797-27801/:27887-27892/:27950-27954);旋冲速
 *  ×0.6/0.75 + 近距防过冲钳(:27951-27966);离场级联——先 EncourageDespawn
 *  双子,双子尽 → 毁灭者头 Transform(136) 静默消散 + 自身消散(:27975-28011)。 */
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
  // AI_032 :27738-27744:伤害/防御基值复位 + queen 每 tick 重登记(ai[3]!=0 →
  // mechQueen=whoAmI 的本仓等价 = WeakSet 标记,见 mechQueen.ts 头注)+ 反弹复位
  const b = baseOf(e);
  e.def.damage = b.dmg;
  e.def.defense = b.def;
  registerMechQueen(e);
  e.reflectsProjectiles = false;
  const mq = mechQueenUp();
  // 玩家死亡(=无有效目标):按离场处理(原版 TargetClosest 落空 → ai[1]=3)
  if (!player) e.ai1 = 3;
  // 玩家死/超 6000px → 离场
  if (!player || Math.abs(e.cx - player.cx) > 6000 || Math.abs(e.cy - player.cy) > 6000) e.ai1 = 3;
  // mech 离场级联(:27975-28011)——玩家死亡路径同样要跑,先于 !player 早退:
  //  先 EncourageDespawn(5) 双子;双子尽 → 毁灭者头 Transform(136)(ai[1]=0 →
  //  AI_037 段死分支 :50189-50202 静默消散,136 无掉落/不置 downed)+ 自身消散
  if (e.ai1 === 3 && mq) {
    const ens = game.enemies() as Enemy[];
    for (const t of ens) {
      if (!t.dead && (t.vanillaId === 125 || t.vanillaId === 126)) t.encourageDespawn(5);
    }
    if (!ens.some((t) => !t.dead && (t.vanillaId === 125 || t.vanillaId === 126))) {
      const head = ens.find((t) => !t.dead && t.vanillaId === 134);
      if (head) { head.bossFled = true; head.dead = true; }  // Transform(136) 等价消散
      e.encourageDespawn(5);
    }
  }
  if (!player) { e.x += e.vx; e.y += e.vy; return; }
  // 白天 → 狂暴(原版不逃走,持续 9999 追杀;Game.ts 日出剔除对 127 豁免)
  // ★旋转方向冻结(ai3)同骷髅王 35:原版 rotation += direction*0.3 用 TargetClosest
  //  持久 direction,非每帧 sign(vx)(曾 facing 致贴脸旋冲 spin 反复换号成摆动)
  if (game.world.clock.isDay && e.ai1 !== 3 && e.ai1 !== 2) {
    e.ai3 = player && player.cx > e.cx ? 1 : -1;
    e.ai1 = 2;
    game.playSfx('roar', 0.8);
  }
  if (e.ai1 === 0) {
    // 悬浮段(:27787-27874):Y 带 [玩家-200, 玩家-500] 0.1/±2;X 窗 ±100 0.1/±8;
    // mech:Y 带 [玩家-300, 玩家-350]、X 窗平移 -450×侧(:27813-27819)
    e.ai2 += 1;
    if (e.ai2 >= 600) {
      e.ai2 = 0;
      e.ai1 = 1;
      e.ai3 = player.cx > e.cx ? 1 : -1;
    }
    // 旋转:mech = AngleLerp(vx/15*0.5, 0.75) 阻尼倾转(:27797-27800)/
    //  非 mech = 裸 vx/15(:27801)
    if (mq) {
      const tilt = (e.vx / 15) * 0.5;
      e.spin += (tilt - e.spin) * 0.75;
    } else {
      e.spin = e.vx / 15;
    }
    // mech 悬浮带参数(:27813-27819):num516=玩家在头哪侧,num515=-450×侧
    const yLow = mq ? 300 : 200, yHigh = mq ? 350 : 500;
    const xShift = mq ? -450 * (player.cx < e.cx ? -1 : 1) : 0;
    if (e.y > player.y - yLow) {
      if (e.vy > 0) e.vy *= 0.98;
      e.vy -= 0.1;
      if (e.vy > 2) e.vy = 2;
    } else if (e.y < player.y - yHigh) {
      if (e.vy < 0) e.vy *= 0.98;
      e.vy += 0.1;
      if (e.vy < -2) e.vy = -2;
    }
    if (e.cx > player.cx + 100 + xShift) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= 0.1;
      if (e.vx > 8) e.vx = 8;
    }
    if (e.cx < player.cx - 100 + xShift) {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += 0.1;
      if (e.vx < -8) e.vx = -8;
    }
  } else if (e.ai1 === 1) {
    // 旋冲段(:27875-27970):防伤×2,经典 2 速直冲,400t 回悬浮;
    // mech:旋转改 AngleLerp 倾转(:27887-27892)、冲速 ×0.75(无 135)/0.6
    // (有 135)(:27951-27955)、距玩家 < 冲速时速度钳到距离防过冲抖动(:27958-27966)
    e.def.defense = b.def * 2;
    e.def.damage = b.dmg * 2;
    e.ai2 += 1;
    if (e.ai2 === 2) game.playSfx('roar', 0.6);
    if (e.ai2 >= 400) { e.ai2 = 0; e.ai1 = 0; }
    if (mq) {
      const tilt = (e.vx / 15) * 0.5;
      e.spin += (tilt - e.spin) * 0.75;
    } else {
      e.spin += (e.ai3 || 1) * 0.3;
    }
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const dist = Math.hypot(dx, dy) || 1;
    let spd = 2;
    if (mq) {
      spd *= (game.enemies() as Enemy[]).some((n) => !n.dead && n.vanillaId === 135) ? 0.6 : 0.75;
    }
    e.vx = dx / dist * spd; e.vy = dy / dist * spd;
    if (mq) {
      // :27958-27966 近距防过冲:距 <0.1 归零,距 < 冲速 → 速度缩到距离
      const d2 = dist < 0.1 ? 0 : dist;
      if (d2 < spd) {
        const vlen = Math.hypot(e.vx, e.vy);
        if (vlen > 0) { e.vx = e.vx / vlen * d2; e.vy = e.vy / vlen * d2; }
        else { e.vx = 0; e.vy = 0; }
      }
    }
  } else if (e.ai1 === 2) {
    // 白天狂暴(:27971-28004):伤/防 9999,速 10+dist/100 钳 [8,32];
    // mech 旋转改 AngleLerp 倾转(:27950-27954)
    e.def.damage = 9999;
    e.def.defense = 9999;
    if (mq) {
      const tilt = (e.vx / 15) * 0.5;
      e.spin += (tilt - e.spin) * 0.75;
    } else {
      e.spin += (e.ai3 || 1) * 0.3;
    }
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
 *  空中:下坠 0.15/钳 16 并横漂向玩家;地下(实心/液体):全向舵向玩家(0.1/0.15 双档,
 *  FTW ×1.2 :50359-50363);
 *  白天/玩家死:加速下坠,过岩石层整链消散;体节 135 探针随机激光 100。
 *  段链 80 段(原版 GetDestroyerSegmentsCount;链距 44px)由头驱动收缩跟随。 */
/** :50299-50306 毁灭者族段光：!flag2（未嵌实心/液体）且非 135 段 ai[2]==1 →
 *  Center (0.3,0.1,0.05)（钻地段不发光）。原版 AI_037 对头 134/身 135/尾 136
 *  每段独立生效；本仓身/尾为 wormBody 跳过 AI 分发 → 由 Enemy 共享尾段对全族
 *  三 id 统一调用（头亦经此，防双写）。flag2 扫描 = AABB 外扩 1-2 格内实心块或
 *  液体>64 与本体盒相交（:50278-50298） */
export function destroyerSegmentLight(e: Enemy, game: GameHooks): void {
  const st = game.world.store;
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
  if (!buried && !(e.vanillaId === 135 && e.ai2 === 1)) {
    e.lightRGB = [0.3, 0.1, 0.05];
  }
}

export function destroyerAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) {
    e.bInit = true;
    // 原版头生成 GetDestroyerSegmentsCount(:51339-51346: getGoodWorld?100:80) 身段
    // (135) + 1 尾(136)(2026-08-13 对齐:曾 79+1 差一;FTW 100 段同批补)
    const segs = enemySpawnChain(e, (game.world.seedFlags?.getGoodWorld ? 100 : 80) + 1);
    // realLife 共享生命建链（:50206-50227）:全链 ai[3]=头 → 段受击传导扣头
    // 80000 总血、段 hp 镜像（StrikeNPC :82132-82137）——节不可单独打死
    e.realLifeHost = e;
    for (const s of segs) { s.realLifeHost = e; addEnemy(game, s); }
  }
  // ---- 出生链门淡入（AI_037 :50162-50182，1:1）----
  // 头 134 恒过；段 135/136 须前段 spawnAlpha<128 才启动——渐显沿链向尾传播
  // （阈值 128 非 85，勿抄 EoW 门）。门内 alpha≠0 时 2 颗 182 号红尘（NewDust
  // alpha=100、scale 2、noGravity/noLight；贴图采样 (255,33,34) 纯红）→ 无条件
  // -42 钳 0（255→0 共 7 tick 现身）。原版每段独立跑 AI_037，本仓段链由头驱动
  // → 头循环逐段执行（头先段后，与原版 whoAmI 顺序一致）
  const fadeNpc = (n: Enemy) => {
    if (n.dead) return;
    const prev = n.wormFollow;
    if (n.vanillaId !== 134 && (!prev || prev.spawnAlpha >= 128)) return;
    if (n.spawnAlpha !== 0) {
      game.spawnParticles(
        n.x + Math.random() * n.w, n.y + Math.random() * n.h,
        '#FF2122', 2, 0, { life: 40, size: 2 },
      );
    }
    n.spawnAlpha = Math.max(0, n.spawnAlpha - 42);
  };
  fadeNpc(e);
  for (let s = e.wormNext; s; s = s.wormNext) fadeNpc(s);
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

  // 白天/玩家死(:50337-50356):vy+1,地表下再+1 且空中钳提到 32(num18);过岩石层
  // 整链消散——★原版不 return:flag2 置 false 强制空中分支照常跑(钳速+向玩家横漂),
  // 曾提前 return 丢 num18=32 钳与横漂,vy 无界坠穿
  const dayFlee = game.world.clock.isDay || !player || player.dead;
  let airClamp = 16;   // num18(空中分支钳)
  if (dayFlee) {
    buried = false;               // flag2 = false → 强制空中分支
    e.vy += 1;
    if (e.y > game.world.groundLevel * TILE) { e.vy += 1; airClamp = 32; }
    if (e.y > game.world.rockLevel * TILE) {
      e.bossFled = true; // 黎明钻地撤离=非击杀(Game 不播击败/不记账)
      for (let s: Enemy | null = e; s; s = s.wormNext) s.dead = true;
    }
  }

  // num19=0.1 / num20=0.15 地下双档步进(:50357-50358);FTW ×1.2(:50359-50363)
  const spd = 16;
  let acc = 0.1, acc2 = 0.15;
  if (game.world.seedFlags?.getGoodWorld) { acc *= 1.2; acc2 *= 1.2; }
  if (!buried) {
    // 空中(:50416-50458):下坠 0.15 钳 num18(常 16;白天地表下 32);慢速时横漂,
    // 满速下坠时向玩家 X 修正(player 空=无目标,以自身位置为锚≈零漂)
    e.vy += 0.15;
    if (e.vy > airClamp) e.vy = airClamp;
    const px = Math.floor((player?.cx ?? e.cx) / TILE) * TILE, py = Math.floor((player?.cy ?? e.cy) / TILE) * TILE;
    const sx = Math.floor(e.cx / TILE) * TILE, sy = Math.floor(e.cy / TILE) * TILE;
    const dx = px - sx, dy = py - sy;
    if (Math.abs(e.vx) + Math.abs(e.vy) < airClamp * 0.4) {
      e.vx += (e.vx < 0 ? -acc * 1.1 : acc * 1.1);
    } else if (e.vy === airClamp) {
      if (e.vx < dx) e.vx += acc;
      else if (e.vx > dx) e.vx -= acc;
    } else if (e.vy > 4) {
      e.vx += (e.vx < 0 ? acc * 0.9 : -acc * 0.9);
    }
    void dy;
  } else {
    // 地下(:50459-50585):目标速度 = 方向*16,分档加速(同向双轴 0.15→同向单轴 0.10+
    // 反轴轻推→主轴 0.11 次轴补速;含防卡死角交叉助推)(player 空=零目标向量,原地)
    const dx = Math.floor((player?.cx ?? e.cx) / TILE) * TILE - Math.floor(e.cx / TILE) * TILE;
    const dy = Math.floor((player?.cy ?? e.cy) / TILE) * TILE - Math.floor(e.cy / TILE) * TILE;
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
  // ---- Mechdusa 头锁位(AI_037 :50611-50620,方法尾段=覆盖常规移动的终值) ----
  // 中心 = GetMechQueenCenter + (0,100).RotatedBy(queen.vx×0.025, 中心) + queen.velocity;
  // 速度清零;rotation = num30×0.75 + π(倒挂,Renderer mech 态换画 136 尾帧 :24980)
  const mqQueen = mechQueenUp() ? getMechQueen() : null;
  if (mqQueen && e.vanillaId === 134) {
    const qc = getMechQueenCenter(mqQueen);
    const ang = mqQueen.vx * 0.025;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const px = qc.x - 100 * sin, py = qc.y + 100 * cos;
    e.x = px + mqQueen.vx - e.w / 2;
    e.y = py + mqQueen.vy - e.h / 2;
    e.vx = 0; e.vy = 0;
    e.spin = ang * 0.75 + Math.PI;
  }
  // 段链跟随(linkDist 44 = 44*scale;原版 num24) + 毁灭者激光(NPC.cs:50204-50241)
  if (mqQueen) driveMechChain(e);
  else driveChain(e, 44);
  for (let s = e.wormNext; s; s = s.wormNext) {
    // player 空（全场无存活者）时无瞄准目标，原版 Main.player[target] 恒存在、
    // 本仓以空玩家等价跳过本段
    if (s.vanillaId !== 135 || s.dead || !player) continue;
    // :50206-50208 真实概率公式：localAI[0] += Next(4)（0..3 均匀，均值 1.5/t），
    // 阈值【每 tick 重掷】Next(1400, 26000)（1400..25999 均匀）——计数器须先爬过
    // 1400 才有非零命中率，命中概率随计数线性升高后清零。无"每 tick 2/6850"这类
    // 常数率（旧近似已退役）；原版本段无埋地豁免，遮挡全靠下方 CanHit 门
    s.lai0 += Math.floor(Math.random() * 4);
    if (s.lai0 >= 1400 + Math.floor(Math.random() * 24600)) {
      s.lai0 = 0;
      // :50210-50212 TargetClosest 后 Collision.CanHit(段盒, 玩家盒)——埋地段被此门挡掉
      if (losClear(game, s.cx, s.cy, player.cx, player.cy)) {
        // :50215-50230 弹道：目标中心 ±20px 抖动 → 归一化到 8 速 → 再 ±20×0.05 速抖动；
        //   出膛点 = 段中心 + 单位速度×5（:50232-50233）
        const ox = s.x + s.w * 0.5, oy = s.y + s.h / 2;
        let n8 = player.cx - ox + (Math.floor(Math.random() * 41) - 20);
        let n9 = player.cy - oy + (Math.floor(Math.random() * 41) - 20);
        const n10 = 8 / Math.hypot(n8, n9);
        n8 *= n10; n9 *= n10;
        n8 += (Math.floor(Math.random() * 41) - 20) * 0.05;
        n9 += (Math.floor(Math.random() * 41) - 20) * 0.05;
        // :50223 伤害 GetAttackDamage_ForProjectiles(22, 18) = Remap(difficulty, Classic,
        //   Expert, 22, 18)——经典 22 / 专家及以上 18（大师钳在 Expert 端）；
        //   命中玩家的难度乘区另由 projTargets.hitPlayer（Projectile.cs:13770）施加
        //   （专家 22×1→18×2=36，与原版一致）。弹型 100（:50224），timeLeft 300（:50235）
        shoot(game, ox + n8 * 5, oy + n9 * 5, n8, n9, getAttackDamageForProjectiles(22, 18, e.difficulty), 100, 300);
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

/** Mechdusa 毁灭者蛇发段链(AI_037 :50131-50155 num 计数 + :50386-50413 压缩跟随):
 *  每段 num = 沿 wormFollow 数到头(含头)的族内段数(头后第 1..9 段压缩,≥10 → 0
 *  回落常规);压缩段:Y 悬挂 num25 = 44-44×(num-1)×0.1 钳 [0,44](逐段递减),
 *  X 跟距 num24/10×num = 4.4×num(整链压缩成 queen 头下的紧密蛇尾);
 *  速度清零、位置吸附到跟距(原版 :50408-50410 段恒零速吸附);尾旋 = 指向前段。 */
function driveMechChain(head: Enemy): void {
  const num24 = 44;   // = 44×scale(与 driveChain 同基值;原版 num24 = (int)(44f×scale))
  let idx = 0;
  for (let s = head.wormNext; s; s = s.wormNext) {
    idx++;
    const ahead = s.wormFollow!;
    const num = idx >= 10 ? 0 : idx;
    if (num > 0) {
      let num25 = num24 - num24 * (num - 1) * 0.1;
      if (num25 < 0) num25 = 0;
      else if (num25 > num24) num25 = num24;
      const dx = ahead.cx - s.cx;
      const dy = ahead.cy + num25 - s.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        const follow = (num24 / 10) * num;
        const shrink = (dist - follow) / dist;
        s.vx = 0; s.vy = 0;
        s.x += dx * shrink;
        s.y += dy * shrink;
      }
    } else {
      const dxC = ahead.cx - s.cx;
      const dyC = ahead.cy - s.cy;
      const dist = Math.hypot(dxC, dyC);
      if (dist > 0.01) {
        const shrink = (dist - num24) / dist;
        s.vx = 0; s.vy = 0;
        s.x += dxC * shrink;
        s.y += dyC * shrink;
      }
    }
    s.spin = Math.atan2(ahead.cy - s.cy, ahead.cx - s.cx) + Math.PI / 2;
    s.facing = (ahead.cx - s.cx) < 0 ? 1 : -1;
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
