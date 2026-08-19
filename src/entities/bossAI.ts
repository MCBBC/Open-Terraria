// Boss AI 1:1 移植(Terarria1456 NPC.cs SetDefaults 指定 aiStyle 的专用核)。
// 由 Enemy.fixedUpdate 的 aiStyle 分发调用;弹幕用 MagicProj/投射桶,部件用 fromVanilla。
// 各核保留原版状态机主链与特征机制(移速/计时/阶段),专家专属分支注释标明。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { mainExpertMode, getAttackDamageForProjectiles } from '../stats/ScaleStats';
import { canHit } from '../physics/LineOfSight';
import { moveAndCollide } from '../physics/TileCollision';
import { MagicProj } from './MagicProj';
import { Arrow } from './Arrow';
import { markMechQueen, registerMechQueen, mechQueenUp, getMechQueen, getMechQueenCenter } from './mechQueen';
import { GorePiece } from './GorePiece';

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
 *  悬浮: Y 拉向玩家上方 250(0.02/±2),X 朝玩家 0.05/±8(:22030-22055);
 *  旋冲: rotation+=0.3*dir、每 tick 直设 dir×num200(经典 1.5/专家 3.5+距离阶梯,
 *  :22166-22242)、伤害 Remap(def,def×1.3)、防御 -10(:22153)。
 *  专家额外(:21948-22004):防御 += 存活手×25;(手<2||血<75%)且悬浮 →
 *  ai[2] 每 80/40t 发 270 追踪髅骨弹(3/5 速,LOS 门,:21959-22003)。 */
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
    if (e.ai1 !== 2) {
      // 旋冲方向用独立字段（原版读 direction 持久朝向）——★勿写 ai3：ai[3]==1 是
      // RedHatSkeletron 变体位（NpcDrops/Renderer/GorePiece 消费），曾挪用致普通
      // 骷髅王击杀时 ai3 常为 1 → 必掉全套 Chippy 时装（刷物品漏洞，2026-08-18 审查抓出）
      (e as unknown as { skeletronSpinDir?: number }).skeletronSpinDir = player && player.cx > e.cx ? 1 : -1;
      // :21943-21947 转换瞬间 Roar 一声（SoundID 15 style0 = Roar_0,'roar' 键恒此轨）
      game.playSfx('roar', 1, e.cx, e.cy);
    }
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
    e.spin += ((e as unknown as { skeletronSpinDir?: number }).skeletronSpinDir || 1) * 0.3;
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

  // ---- 专家分支一揽子(NPC.cs:21948-22004)----
  // num173 = 存活手数(type+1=36);defense += num173*25(:21958);
  // (num173<2 || 血<75%) 且悬浮态 → ai[2] 每 num175 tick 朝玩家发 270 追踪髅骨弹
  const expert = mainExpertMode(game.world);
  const num173 = (game.enemies() as Enemy[]).filter(
    (n) => !n.dead && n.vanillaId === (e.vanillaId ?? 0) + 1).length;
  const b = baseOf(e);
  const defBase = b.def + (expert ? num173 * 25 : 0);   // :21958 专家按存活手数加防
  if (expert && (num173 < 2 || e.hp < e.maxHp * 0.75) && e.ai1 === 0) {
    // :21961-21969 num175=80(无手 40;FTW ×0.8);ai[2] 为悬浮计时(:22012)
    let num175 = 80;
    if (num173 === 0) num175 /= 2;
    if (game.world.seedFlags?.getGoodWorld) num175 *= 0.8;
    if (e.ai2 % num175 === 0
      && canHit(game.world.store, e.cx, e.cy, 1, 1, player.x, player.y, player.w, player.h)) {
      // :21975-21999 num176=3(无手 +2);先 ±20px 抖动归一到 num176,再 ±0.5 速抖动
      // 归一 ×num176,最后 += 自身速度(骷髅王头本体常为零速,专家旋冲前近似为零)
      const num176 = 3 + (num173 === 0 ? 2 : 0);
      let sx = player.cx - e.cx + (Math.floor(Math.random() * 41) - 20);
      let sy = player.cy - e.cy + (Math.floor(Math.random() * 41) - 20);
      let sl = Math.hypot(sx, sy) || 1;
      sx = sx / sl * num176; sy = sy / sl * num176;
      let jx = sx + (Math.floor(Math.random() * 101) - 50) * 0.01;
      let jy = sy + (Math.floor(Math.random() * 101) - 50) * 0.01;
      sl = Math.hypot(jx, jy) || 1;
      jx = jx / sl * num176 + e.vx; jy = jy / sl * num176 + e.vy;
      shoot(game, e.cx + jx * 5, e.cy + jy * 5, jx, jy,
        getAttackDamageForProjectiles(17, 17, e.difficulty), 270);   // :21996-22000 timeLeft 300
    }
  }

  e.ai2 += 1;
  if (e.ai1 === 0) {
    // 悬浮段(:22046-22091):rotation = velocity.X/15(倾转);
    // 位移档 :22030-22055——经典 0.02/±2(Y) 0.05/±8(X),专家 0.03/±4 0.07/±9.5(:22034-22040),
    // FTW 追加 +0.01/+1/+0.05/+2(:22049-22055;RedHat 变体档不适用本核)
    e.spin = e.vx / 15;
    if (e.ai2 >= 800) {
      e.ai2 = 0;
      e.ai1 = 1;
      // 旋冲方向冻结 = 目标侧(TargetClosest direction 语义,见上 ai1=2 注)——独立字段勿占 ai3
      (e as unknown as { skeletronSpinDir?: number }).skeletronSpinDir = player.cx > e.cx ? 1 : -1;
    }
    e.def.damage = b.dmg;               // :22007 悬浮段伤害基值复位
    e.def.defense = defBase;            // :21908/:21958(含专家手数加成)
    let nY = 0.02, cY = 2, nX = 0.05, cX = 8;
    if (expert) { nY = 0.03; cY = 4; nX = 0.07; cX = 9.5; }
    if (game.world.seedFlags?.getGoodWorld) { nY += 0.01; cY += 1; nX += 0.05; cX += 2; }
    if (e.y > player.y - 250) {
      if (e.vy > 0) e.vy *= 0.98;
      e.vy -= nY;
      if (e.vy > cY) e.vy = cY;
    } else {
      if (e.vy < 0) e.vy *= 0.98;
      e.vy += nY;
      if (e.vy < -cY) e.vy = -cY;
    }
    if (e.cx > player.cx) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= nX;
      if (e.vx > cX) e.vx = cX;
    } else {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += nX;
      if (e.vx < -cX) e.vx = -cX;
    }
  } else if (e.ai1 === 1) {
    // 旋冲段(:22105-22243):rot+=0.3*dir;速度 = 朝玩家单位向量 × num200 **每 tick 直设**
    // (:22240-22242,曾用 0.1 lerp 逼近 12 速=自造);num200 经典 1.5,专家 3.5 起步
    // + 距离阶梯(>150 ×1.05;>200..>600 每 100px ×1.1 共 10 级,:22179-22231)
    // + 按存活手数(0→×1.1 / 1→×1.05);FTW ×1.3(:22236-22239)。
    // 伤害 = GetAttackDamage_LerpBetweenFinalValues(defDamage, defDamage*1.3)
    // (:22174,与 ForProjectiles 同式 Remap——经典基值/专家 1.3×);
    // 防御 -10(:22153,在专家手数加成之后再减)
    if (e.ai2 === 2) game.playSfx('roar', 1, e.cx, e.cy);   // :22155-22157 ai[2]==2 入场吼(style0 满响,2026-08-18 对账补)
    if (e.ai2 >= 400) { e.ai2 = 0; e.ai1 = 0; }
    e.def.defense = Math.max(0, defBase - 10);
    e.def.damage = getAttackDamageForProjectiles(b.dmg, b.dmg * 1.3, e.difficulty);
    e.spin += ((e as unknown as { skeletronSpinDir?: number }).skeletronSpinDir || 1) * 0.3;
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const dist = Math.hypot(dx, dy) || 1;
    let num200 = 1.5;
    if (expert) {
      num200 = 3.5;
      if (dist > 150) num200 *= 1.05;
      for (const d2 of [200, 250, 300, 350, 400, 450, 500, 550, 600]) if (dist > d2) num200 *= 1.1;
      if (num173 === 0) num200 *= 1.1;
      else if (num173 === 1) num200 *= 1.05;
    }
    if (game.world.seedFlags?.getGoodWorld) num200 *= 1.3;
    e.vx = dx / dist * num200;
    e.vy = dy / dist * num200;
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

/** AI_012 骷髅王手五态机（NPC.cs:22289-22604 全量重写,台账 D 2026-08-19）：
 *  ai[2] 状态：0/3 = 悬停（环绕位 = 头心 ±200×ai0、头下 230;ai[3] 300t 计满
 *  → +1 进蓄升——红帽 +1/t、专家再 +0.5/t;头旋冲中(非红帽)改回侧位 ±120/
 *  头上 100）→ 1 = 蓄升（vx×0.95、vy−0.1,帽 −8/专家 −13(extra −0.06)/红帽 −15;
 *  升到头上方 200 → 直冲初速 = 朝玩家单位向量 × 18/专家 21/红帽 24）→ 2 = 直冲
 *  （纯弹道;越过玩家 Y / 点积 ≤0 / 距离 >2000 / vy<0 任一 → 3）→ 4 = 侧浮
 *  （vy×0.95、vx += 0.1×(−ai0),帽 ±8/专家 ±12(+0.07)/红帽 ±15;离心 500px →
 *  回冲初速 ×17/专家 22/红帽 25）→ 5 = 回冲（越过玩家 X / 点积 ≤0 / >2000 → 0）。
 *  rotation = atan2(环绕锚点向量)+1.57（悬停/蓄升/侧浮三态）;头离场 → ai[2]+10,
 *  >50 或非服务器（本仓恒单机 netMode!=2）→ 即灭;头 ai[1]==3 离场 → EncourageDespawn(10)
 *  而非自灭。localAI[3] = 头 ai[3]（红帽标记,RedHatSkeletronAdjustmentsEnabled
 *  :67282 type36 取 localAI[3]==1 → flag21 档:伤害 ×1.3）。 */
export function skeletronHandAI(e: Enemy, game: GameHooks, player: Player | null) {
  const headId = e.ai1;
  const enemies = game.enemies() as unknown[];
  const head = enemies.find((n) => (n as Enemy).id === headId) as Enemy | undefined;
  e.facing = -(e.ai0 || 1);                        // spriteDirection = -(int)ai[0]（:22292）
  if (!head || head.vanilla?.aiStyle !== 11 || head.dead) {
    // :22294-22303 头失效 → ai[2] += 10,>50 或非服务器 → life=-1 即灭
    // （本仓恒单机 netMode!=2 → 首帧即死;>50 门仅专用服务器等待同步用）
    e.ai2 += 10;
    e.dead = true;
    return;
  }
  e.master = head; // 臂骨 IK 渲染用（Renderer.drawSkeletronArm）
  e.lai3 = head.ai3;                               // :22308 localAI[3] = 头 ai[3]
  const flag21 = e.lai3 === 1;                     // RedHatSkeletronAdjustmentsEnabled（type 36）
  const expert = mainExpertMode(game.world);
  if (flag21) {
    const b = baseOf(e);
    e.def.damage = Math.round(b.dmg * 1.3);        // :22310-22312 红帽伤害 ×1.3
  }
  if (!player) { e.x += e.vx; e.y += e.vy; return; }
  const headCx = head.x + head.w / 2;
  // 环绕锚点（rotation 基向,cs:22395-22404/22414-22423/22479-22488）
  const anchorRot = () => {
    const ax = headCx - 200 * e.ai0 - e.cx;
    const ay = head.y + 230 - e.cy;
    e.visAngle = Math.atan2(ay, ax) + 1.57;
  };
  if (e.ai2 === 0 || e.ai2 === 3) {
    // ---- 悬停态（cs:22313-22411）----
    if (head.ai1 === 3) e.encourageDespawn(10);    // :22314-22316 头离场 → 手劝退（非自灭!）
    if (head.ai1 !== 0 && !flag21) {
      // 头旋冲中：回侧位 ±120 / 头上 100（cs:22317-22358;Y 步 0.07 帽 ±6、X 步 0.1 帽 ±8,逆向 ×0.96）
      if (e.y > head.y - 100) {
        if (e.vy > 0) e.vy *= 0.96;
        e.vy -= 0.07;
        if (e.vy > 6) e.vy = 6;
      } else if (e.y < head.y - 100) {
        if (e.vy < 0) e.vy *= 0.96;
        e.vy += 0.07;
        if (e.vy < -6) e.vy = -6;
      }
      if (e.cx > headCx - 120 * e.ai0) {
        if (e.vx > 0) e.vx *= 0.96;
        e.vx -= 0.1;
        if (e.vx > 8) e.vx = 8;
      }
      if (e.cx < headCx - 120 * e.ai0) {
        if (e.vx < 0) e.vx *= 0.96;
        e.vx += 0.1;
        if (e.vx < -8) e.vx = -8;
      }
    } else {
      // 头悬浮：环绕位 ±200/+230 + ai[3] 计时（cs:22359-22407;红帽 +1/t、专家 +0.5/t
      // → 计满 300 提前;专家先跑一遍同参段再跑普通段 = 双倍步长）
      e.ai3 += 1;
      if (flag21) e.ai3 += 1;
      if (expert) e.ai3 += 0.5;
      if (e.ai3 >= 300) { e.ai2 += 1; e.ai3 = 0; }
      const passes = expert ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        if (e.y > head.y + 230) {
          if (e.vy > 0) e.vy *= 0.96;
          e.vy -= 0.04;
          if (e.vy > 3) e.vy = 3;
        } else if (e.y < head.y + 230) {
          if (e.vy < 0) e.vy *= 0.96;
          e.vy += 0.04;
          if (e.vy < -3) e.vy = -3;
        }
        if (e.cx > headCx - 200 * e.ai0) {
          if (e.vx > 0) e.vx *= 0.96;
          e.vx -= 0.07;
          if (e.vx > 8) e.vx = 8;
        }
        if (e.cx < headCx - 200 * e.ai0) {
          if (e.vx < 0) e.vx *= 0.96;
          e.vx += 0.07;
          if (e.vx < -8) e.vx = -8;
        }
      }
    }
    anchorRot();
  } else if (e.ai2 === 1) {
    // ---- 蓄升态（cs:22412-22466）----
    anchorRot();
    e.vx *= 0.95;
    e.vy -= 0.1;
    if (flag21) {
      e.vy -= 0.09;
      if (e.vy < -15) e.vy = -15;
    } else if (expert) {
      e.vy -= 0.06;
      if (e.vy < -13) e.vy = -13;
    } else if (e.vy < -8) {
      e.vy = -8;
    }
    if (e.y < head.y - 200) {
      // 升到头上方 200 → 直冲（TargetClosest + 朝玩家 ×18/专家 21/红帽 24,cs:22448-22466）
      e.ai2 = 2;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const spd = flag21 ? 24 : expert ? 21 : 18;
      e.vx = dx / d * spd;
      e.vy = dy / d * spd;
    }
  } else if (e.ai2 === 2) {
    // ---- 直冲态（cs:22468-22476,纯弹道只查收尾门）----
    const dot = e.vx * (player.cx - e.cx) + e.vy * (player.cy - e.cy);
    if (e.y > player.y || dot <= 0
      || Math.hypot(player.x - e.x, player.y - e.y) > 2000 || e.vy < 0) {
      e.ai2 = 3;
    }
  } else if (e.ai2 === 4) {
    // ---- 侧浮态（cs:22478-22535）----
    anchorRot();
    e.vy *= 0.95;
    e.vx += 0.1 * -e.ai0;
    if (flag21) {
      e.vx += 0.1 * -e.ai0;
      if (e.vx < -15) e.vx = -15;
      else if (e.vx > 15) e.vx = 15;
    } else if (expert) {
      e.vx += 0.07 * -e.ai0;
      if (e.vx < -12) e.vx = -12;
      else if (e.vx > 12) e.vx = 12;
    } else if (e.vx < -8) {
      e.vx = -8;
    } else if (e.vx > 8) {
      e.vx = 8;
    }
    if (e.cx < headCx - 500 || e.cx > headCx + 500) {
      // 离心 500px → 回冲（×17/专家 22/红帽 25,cs:22514-22535）
      e.ai2 = 5;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const spd = flag21 ? 25 : expert ? 22 : 17;
      e.vx = dx / d * spd;
      e.vy = dy / d * spd;
    }
  } else if (e.ai2 === 5) {
    // ---- 回冲态（cs:22537-22552）----
    const dot = e.vx * (player.cx - e.cx) + e.vy * (player.cy - e.cy);
    if ((e.vx > 0 && e.cx > player.cx) || (e.vx < 0 && e.cx < player.cx)
      || dot <= 0 || Math.hypot(player.x - e.x, player.y - e.y) > 2000) {
      e.ai2 = 0;
    }
  }
  e.x += e.vx; e.y += e.vy;
}

/** AI_015 史莱姆王(NPC.cs:43436-43735 全核 1:1,2026-08-19 台账 E 重写):
 *  落地充能起跳循环(ai0 从负回充,+2/t+血量分档;跳序 -8/-8/-6/-13、vx+4/4/4.5/3.5×dir)
 *  + 周期传送(ai2 无视线/高差>160 累计 300 → 缩身 60t → 落位淡入 30t;
 *  antiCheese(localAI[0]≥360 或距>2000)直落玩家脚底) + 掉血 5% 出 1-3 只
 *  小史莱姆(经典 1 号/专家 1/4 出 535,:43708-43734)。 */
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
  // AI_015_KingSlime(NPC.cs:43436-43735)1:1 状态机:
  //  ai0 = 落地充能计数(负值回充,≥0 起跳;5/6 态复用为缩放计时)
  //  ai1 = 跳序 0→1→2→3→0(三小跳 + 一大跳)/5 缩身传送/6 淡入回归
  //  ai2 = 周期传送计数(无视线||高差>160 时累计)
  //  ai3 = 小史莱姆掉血水位(初值 lifeMax)
  if (!e.bInit) { e.bInit = true; e.ai0 = -100; e.ai1 = 0; e.ai2 = 0; }  // :43454-43464
  if (e.ai3 === 0 && e.hp > 0) e.ai3 = e.maxHp;                          // :43450-43453
  let num = 1;          // 体型倍率(5/6 态缩放 1↔0.5)
  let flag2 = false;    // 传送态(5/6)=落地不充能
  let flag3 = false;    // 完全缩没(60t 起,dontTakeDamage)
  // 玩家死/远距 3000px(:43466-43490):TargetClosest 二次判定后仍失败 →
  // EncourageDespawn(10) + 背对 + ai[2]=0/ai[0]=0/ai[1]=5 缩身传送世界角
  const ksd = player ? Math.hypot(player.cx - e.cx, player.cy - e.cy) : Infinity;
  if (!player || player.dead || ksd > 3000) {
    e.encourageDespawn(10);
    if (player) e.facing = player.cx < e.cx ? 1 : -1;   // :43472-43479 转身背对
    if (e.ai1 !== 5 && e.ai1 !== 6) {
      e.ai2 = 0; e.ai0 = 0; e.ai1 = 5;
      kingTpDest.set(e, { x: game.world.w * TILE, y: game.world.h * TILE });  // :43486-43487
    }
  }
  // ---- 常规周期传送(:43491-43513):玩家活/timeLeft>10/计数≥300/非传送态/落地 →
  //  计数清零进 5;antiCheese(localAI[0]≥360 或距>2000px)直落玩家脚底,否则 FindTeleportSpot
  if (player && !player.dead && e.despawnTimer > 10 && e.ai2 >= 300 && e.ai1 < 5 && e.onGround) {
    e.ai2 = 0; e.ai0 = 0; e.ai1 = 5;
    let ac = kingAntiCheese.get(e) ?? 0;
    const vec = Math.hypot(player.cx - e.cx, player.cy - e.cy);
    let antiCheese = false;
    if (ac >= 360 || vec > 2000) {
      if (ac >= 360) { ac = 360; kingAntiCheese.set(e, ac); }   // :43505-43508 钳 360
      antiCheese = true;
    }
    kingTpDest.set(e, antiCheese
      ? { x: player.cx, y: player.y + player.h }   // :43404-43409 FindTeleportSpot(antiCheese)
      : kingFindTeleportSpot(e, game, player));
  }
  // ---- 反挂机计数(:43514-43529,每 tick 无地面门):无视线||高差>160 →
  //  ai[2]+1 且 localAI[0]+1;否则 localAI[0]−1 钳 0(曾写成恒 +1=语义反,2026-08-19)。
  //  视线 = Center↔Center 连线(CanHitLine 0×0);高差 = Top.Y↔player.Bottom.Y ----
  if (player) {
    const los = canHit(game.world.store, e.cx, e.cy, 0, 0, player.cx, player.cy, 0, 0);
    const gap = Math.abs(e.y - (player.y + player.h));
    if (!los || gap > 160) {
      e.ai2 += 1;
      kingAntiCheese.set(e, (kingAntiCheese.get(e) ?? 0) + 1);
    } else {
      kingAntiCheese.set(e, Math.max(0, (kingAntiCheese.get(e) ?? 0) - 1));
    }
  }
  if (e.ai1 === 5) {
    // 缩身传送态(:43537-43573):num = clamp((60-ai0)/60)×0.5+0.5;60t 起 flag3
    // (隐没无敌);==60 Gore734 王冠;≥60 Bottom 锚落位 → 6 号;未隐没时每帧 10 蓝尘
    flag2 = true;
    e.ai0 += 1;
    num = Math.max(0, Math.min(1, (60 - e.ai0) / 60)) * 0.5 + 0.5;
    if (e.ai0 >= 60) flag3 = true;
    if (e.ai0 === 60) {
      game.spawnParticles(e.cx, e.cy - e.h / 2, '#FFD060', 6, 2, { life: 40 }); // Gore 734 王冠(:43550)
    }
    if (e.ai0 >= 60) {
      const dest = kingTpDest.get(e) ?? { x: game.world.w * TILE, y: game.world.h * TILE };
      e.x = dest.x - e.w / 2;
      e.y = dest.y - e.h;                          // base.Bottom = (localAI[1], localAI[2])(:43554)
      e.ai1 = 6; e.ai0 = 0;
    }
    if (!flag3) game.spawnParticles(e.cx, e.cy, '#4E88FF', 10, 1.2, { life: 30 });  // :43564-43571
  } else if (e.ai1 === 6) {
    // 淡入回归态(:43574-43600):num = clamp(ai0/30)×0.5+0.5;30t 回战斗;到达尘 ×2 速
    flag2 = true;
    e.ai0 += 1;
    num = Math.max(0, Math.min(1, e.ai0 / 30)) * 0.5 + 0.5;
    if (e.ai0 >= 30) { e.ai1 = 0; e.ai0 = 0; }
    game.spawnParticles(e.cx, e.cy, '#4E88FF', 10, 2.4, { life: 30 });  // :43594-43599
  }
  e.dontTakeDamage = flag3;      // :43601 dontTakeDamage = (hide = flag3)
  e.squash = (1 - num) * 1.2;    // 体型倍率近似(缩放 0.5..1 ↔ squash 0.6..0)
  if (e.onGround) {
    // 落地(:43602-43663):vx 阻尼 0.8(<0.1 归零);非传送态充能起跳
    e.vx *= 0.8;
    if (e.vx > -0.1 && e.vx < 0.1) e.vx = 0;
    if (!flag2) {
      // :43611-43631 充能 +2/t + 血量分档(<80 +1/<60 +1/<40 +2/<20 +3/<10 +4 = +2..+13)
      e.ai0 += 2;
      if (e.hp < e.maxHp * 0.8) e.ai0 += 1;
      if (e.hp < e.maxHp * 0.6) e.ai0 += 1;
      if (e.hp < e.maxHp * 0.4) e.ai0 += 2;
      if (e.hp < e.maxHp * 0.2) e.ai0 += 3;
      if (e.hp < e.maxHp * 0.1) e.ai0 += 4;
      if (e.ai0 >= 0) {
        // 跳序(:43632-43656):ai1==3 → vy-13/vx+3.5dir/回充-200/回 0;
        // ai1==2 → vy-6/vx+4.5dir/回充-120/ai1+1;其余 → vy-8/vx+4dir/回充-120/ai1+1
        // (方向 = TargetClosest 的 direction,即玩家侧)
        const dir = player ? (player.cx > e.cx ? 1 : -1) : (e.facing || 1);
        e.facing = dir;
        if (e.ai1 === 3) { e.vy = -13; e.vx += 3.5 * dir; e.ai0 = -200; e.ai1 = 0; }
        else if (e.ai1 === 2) { e.vy = -6; e.vx += 4.5 * dir; e.ai0 = -120; e.ai1 += 1; }
        else { e.vy = -8; e.vx += 4 * dir; e.ai0 = -120; e.ai1 += 1; }
      }
      // :43658-43661 ai0 ≥ -30 = 起跳前蹲伏动画段(aiAction=1,squash 视觉)
    }
  } else if (player) {
    // 空中(:43664-43682):朝 direction 0.2/t 加速,限 |vx|<3(FTW 6);已反向时先 0.93 阻尼
    const num7 = game.world.seedFlags?.getGoodWorld ? 6 : 3;
    const dir = e.facing || 1;
    if ((dir === 1 && e.vx < num7) || (dir === -1 && e.vx > -num7)) {
      if ((dir === -1 && e.vx < 0.1) || (dir === 1 && e.vx > -0.1)) e.vx += 0.2 * dir;
      else e.vx *= 0.93;
    }
  }
  // 重力+地形 = 共享段(UpdateNPC_UpdateGravity + MoveWhileDry):0.3 重力/高空衰减/落速钳
  e.applyGravity(game);
  moveAndCollide(e, game.world, e.vx, e.vy);
  if (e.hp <= 0) return;
  // ---- 掉血 5% 出小史莱姆(:43708-43734):水位 ai3 每越线补记;1-3 只;
  //  经典 1 号蓝史莱姆,专家 1/4 概率换 535(:43720-43723);体内随机点出、
  //  初速 Next(-15,16)*0.1 / Next(-30,1)*0.1、ai[0]=-1000*Next(3) ----
  const num10 = e.maxHp * 0.05;
  if (e.hp + num10 < e.ai3) {
    e.ai3 = e.hp;
    const expert = mainExpertMode(game.world);
    const n = 1 + Math.floor(Math.random() * 3);   // Next(1,4) = 1..3
    for (let k = 0; k < n; k++) {
      const s = spawnPart(game, e, expert && Math.floor(Math.random() * 4) === 0 ? 535 : 1);
      if (s) {
        s.x = e.x + Math.random() * Math.max(1, e.w - 32);
        s.y = e.y + Math.random() * Math.max(1, e.h - 32);
        s.vx = (Math.floor(Math.random() * 31) - 15) * 0.1;
        s.vy = (Math.floor(Math.random() * 31) - 30) * 0.1;
        s.ai0 = -1000 * Math.floor(Math.random() * 3);
        s.ai1 = 0;
      }
    }
  }
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
    //   血块 gore 392-395（position 左上角出、初速 Next(-30,31)*0.2 各自独立掷，
    //   NewGore 尾段另有 :1347-1348 扰动）+ 尘 5 号 ×20 + SoundID 15
    //   （ZombieMoan wav 未提取 → 略，登记）
    if (e.lai2 === 0) {
      e.lai2 = 1;
      game.playSfxFiles(['NPC_Hit_1'], 1, e.cx, e.cy);
      for (let gi = 392; gi <= 395; gi++) {
        GorePiece.newGore(gi, e.x, e.y,
          (Math.floor(Math.random() * 61) - 30) * 0.2,
          (Math.floor(Math.random() * 61) - 30) * 0.2);
      }
      game.spawnParticles(e.cx, e.cy, '#A03050', 20, 2);
      // :32582 二阶段入场第二声 = PlaySound(15,x,y,0) = Roar_0 满响(曾误播
      // Zombie_2@0.8——把 15 号当 ZombieMoan 的误判,2026-08-19 终审修)
      game.playSfx('roar', 1, e.cx, e.cy);
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
 *  三阶段:雷眼 = 悬浮(300t) ↔ 侧移 ±340 边移边射(180t,无冲刺段,:27008-27114),
 *  魔眼 = 悬浮(400t) → 冲刺-减速循环;伤害×1.5,防 +10/+18。
 *  expert 档全量实装(2026-08-19):雷眼一阶悬浮 8.25/0.115(:26594-26597)、
 *  激光 10.5 速+四档计数(:26693-26727)、冲刺 15(:26746-26748)、三阶悬浮
 *  9.5/0.175(:26878-26881)与激光 10(:26994-26996)、侧移 9.5/0.25+计数+1.5
 *  (:27015-27018/:27087-27089);魔眼冲刺 13→15.8 血量阶梯(:27349-27372)、
 *  诅焰 14 速+计数+0.6(:27309-27311/:27329-27331)、三阶悬浮距离六档
 *  (:27512-27537)。
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
  // Main.expertMode——双子专家档(2026-08-19 对齐):雷眼悬浮/激光提速、魔眼
  // 冲刺血量阶梯、诅焰提速计数、二阶段悬浮/激光、侧移逼近与连射 +1.5 全在此门
  const expert = mainExpertMode(game.world);
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
      // 侧向悬浮:雷眼 玩家侧 300/上方 300——经典 7/0.1,专家 8.25/0.115(:26592-26597),
      // FTW ×1.15(:26599-26603);魔眼 侧 400——经典 12/0.4(无专家档,:27216-27222),
      // FTW ×1.15
      let spd = spaz ? 12 : 7, acc = spaz ? 0.4 : 0.1;
      if (!spaz && expert) { spd = 8.25; acc = 0.115; }
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
      // 悬浮期弹幕:魔眼 每 60t 诅咒焰 96;雷眼 位于玩家上方且距悬浮点<400 时绿激光 83
      if (spaz) {
        // :27306-27316 计数 +1/t;专家血<80% +0.6(:27309-27311);FTW +0.4
        e.ai3 += 1;
        if (expert && e.hp < e.maxHp * 0.8) e.ai3 += 0.6;
        if (ftw) e.ai3 += 0.4;
        if (e.ai3 >= 60) {
          e.ai3 = 0;
          // :27326-27341 速 12(专家 14,:27329-27331),伤 Remap(25,22),弹 96,
          // 速度 ±40×0.05 抖动,出膛点 = 中心 + v×4
          const spdF = expert ? 14 : 12;
          let fx = player.cx - e.cx, fy = player.cy - e.cy;
          const fl = Math.hypot(fx, fy) || 1;
          fx = fx / fl * spdF + (Math.floor(Math.random() * 81) - 40) * 0.05;
          fy = fy / fl * spdF + (Math.floor(Math.random() * 81) - 40) * 0.05;
          shoot(game, e.cx + fx * 4, e.cy + fy * 4, fx, fy,
            getAttackDamageForProjectiles(25, 22, e.difficulty), 96);
        }
      } else if (e.y + e.h < player.y && hoverDist < 400) {
        // :26690-26712 计数 +1/t;专家血 <90%/<80%/<70%/<60% 各 +0.3(:26693-26708);
        // FTW +0.5(:26709-26711)
        e.ai3 += 1;
        if (expert && e.hp < e.maxHp * 0.9) e.ai3 += 0.3;
        if (expert && e.hp < e.maxHp * 0.8) e.ai3 += 0.3;
        if (expert && e.hp < e.maxHp * 0.7) e.ai3 += 0.3;
        if (expert && e.hp < e.maxHp * 0.6) e.ai3 += 0.3;
        if (ftw) e.ai3 += 0.5;
        // mech 激光门 60→90/120(:26673-26679 num441 = !npcsFoundForCheckActive[135]
        //   ? 90 : 120——毁灭者身段在场=更慢)
        const laserGate = mq
          ? ((game.enemies() as Enemy[]).some((n) => !n.dead && n.vanillaId === 135) ? 120 : 90)
          : 60;
        if (e.ai3 >= laserGate) {
          e.ai3 = 0;
          // :26722-26737 速 9(专家 10.5,:26725-26727),伤 Remap(20,19),弹 83,
          // 速度 ±40×0.08 抖动,出膛点 = 中心 + v×15
          const spdL = expert ? 10.5 : 9;
          let lx = player.cx - e.cx, ly = player.cy - e.cy;
          const ll = Math.hypot(lx, ly) || 1;
          lx = lx / ll * spdL + (Math.floor(Math.random() * 81) - 40) * 0.08;
          ly = ly / ll * spdL + (Math.floor(Math.random() * 81) - 40) * 0.08;
          shoot(game, e.cx + lx * 15, e.cy + ly * 15, lx, ly,
            getAttackDamageForProjectiles(20, 19, e.difficulty), 83);
        }
      }
    } else if (e.ai1 === 1) {
      // 冲撞:一次性朝玩家定速——雷眼 12(专家 15,:26745-26749;FTW +2 :26750-26752);
      // 魔眼 13 + 专家血量阶梯 +0.5/+0.5/+0.55/+0.6/+0.65(<90/80/70/60/50%,
      // :27349-27372,满档 15.8;FTW ×1.2 :27373-27376)
      e.spin = target;
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      let spd = spaz ? 13 : 12;
      if (spaz) {
        if (expert) {
          if (e.hp < e.maxHp * 0.9) spd += 0.5;
          if (e.hp < e.maxHp * 0.8) spd += 0.5;
          if (e.hp < e.maxHp * 0.7) spd += 0.55;
          if (e.hp < e.maxHp * 0.6) spd += 0.6;
          if (e.hp < e.maxHp * 0.5) spd += 0.65;
        }
        if (ftw) spd *= 1.2;
      } else {
        if (expert) spd = 15;
        if (ftw) spd += 2;
      }
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
        // 变身完成双声=NPCHit1(style 缺省 1)+Roar——雷眼 :26843-26844 / 魔眼
        // :27466-27467 **两眼同播**(曾按 spaz 分流漏魔眼前置声,终审纠)
        game.playSfxFiles?.(['NPC_Hit_1'], 1, e.cx, e.cy);
        game.playSfx('roar', 1, e.cx, e.cy);   // :26855/:27478 PlaySound(15,style0) 满响
        game.spawnParticles(e.cx, e.cy, '#FF6040', 20, 2);
      }
    }
    e.vx *= 0.98; e.vy *= 0.98;
    if (Math.abs(e.vx) < 0.1) e.vx = 0;
    if (Math.abs(e.vy) < 0.1) e.vy = 0;
    e.x += e.vx; e.y += e.vy;
    return;
  }

  // ---- 三阶段(ai0=3):伤害×1.5,防御 +(雷眼10/魔眼18);HitSound 换 NPCHit4
  //      (:26873/:27494 战斗二段每帧覆写)——曾恒 NPCHit1(终审补) ----
  const b = baseOf(e);
  e.def.damage = Math.round(b.dmg * 1.5);
  e.def.defense = b.def + (spaz ? 18 : 10);
  e.def.hitSound = ['NPC_Hit_4'];
  if (e.ai1 === 0) {
    // 上方悬浮:雷眼 玩家正上 300——经典 8/0.15,专家 9.5/0.175(:26876-26882),
    // FTW ×1.15(:26883-26887);魔眼 侧 180 同高——经典 4/0.1,专家按距悬浮点
    // 距离六档 +0.5/+0.5/+0.55/+0.55/+0.6/+0.6(>300..>800,:27512-27537,mech 态跳过),
    // FTW ×1.15(速/步进同乘,:27539-27543);雷眼 300t/魔眼 400t → 换态
    let spd = spaz ? 4 : 8, acc = spaz ? 0.1 : 0.15;
    const offX = spaz ? 180 : 0, offY = spaz ? 0 : 300;
    const side = e.cx < player.x + player.w ? -1 : 1;
    const htx = player.cx + side * offX, hty = player.cy - offY;
    if (!spaz && expert) { spd = 9.5; acc = 0.175; }
    if (spaz && expert && !mq) {
      // :27512-27537 专家魔眼距悬浮点阶梯(>300→+0.5 … >800→+0.6)
      const dh = Math.hypot(htx - e.cx, hty - e.cy);
      if (dh > 300) spd += 0.5;
      if (dh > 400) spd += 0.5;
      if (dh > 500) spd += 0.55;
      if (dh > 600) spd += 0.55;
      if (dh > 700) spd += 0.6;
      if (dh > 800) spd += 0.6;
    }
    if (ftw) { spd *= 1.15; acc *= 1.15; }
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
      seek(e, htx, hty, spd, acc);
    }
    e.ai2 += 1;
    // mech 悬浮计时:雷眼 300→1200 / 魔眼 400→1200(:26950/:27581)
    if (e.ai2 >= (mq ? 1200 : (spaz ? 400 : 300))) { e.ai1 = 1; e.ai2 = 0; e.ai3 = 0; }
    e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
    // 弹幕节奏 = localAI[1] 血量阶梯累积器（雷眼 :26971-26987 / 魔眼 :27604-27620，
    // 本仓 e.lai1——与雷眼侧移态共用同一计数，状态切换不重置）：
    // 魔眼累积在视线可达门内（:27594 CanHit 本盒↔玩家盒），另由 localAI[2]
    // （本仓 e.lai2）每 23t 播 Item34 火焰音（:27596-27600）
    if (spaz) {
      if (canHit(game.world.store, e.x, e.y, e.w, e.h, player.x, player.y, player.w, player.h)) {
        e.lai2 += 1;
        if (e.lai2 > 22) { e.lai2 = 0; game.playSfxFiles(['Item_34'], 1, e.cx, e.cy); }
        e.lai1 += 1;
        if (e.hp < e.maxHp * 0.75) e.lai1 += 1;
        if (e.hp < e.maxHp * 0.5) e.lai1 += 1;
        if (e.hp < e.maxHp * 0.25) e.lai1 += 1;
        if (e.hp < e.maxHp * 0.1) e.lai1 += 2;
        if (e.lai1 > 8) {
          e.lai1 = 0;
          // :27623-27647 火焰 101:速 6,伤 Remap(30,27),±0.4 抖动 + 自身速度×0.5,
          // 出膛点 = 中心 − 速度×1(反向出膛);mech 态沿自身朝向喷(下方分支)
          const num500 = 6;
          let fx = player.cx - e.cx, fy = player.cy - e.cy;
          const fl = Math.hypot(fx, fy) || 1;
          fx = fx / fl * num500; fy = fy / fl * num500;
          fy += (Math.floor(Math.random() * 81) - 40) * 0.01;
          fx += (Math.floor(Math.random() * 81) - 40) * 0.01;
          fy += e.vy * 0.5; fx += e.vx * 0.5;
          let ox = e.cx - fx, oy = e.cy - fy;
          if (mq) {
            // mech 魔眼火焰沿自身朝向喷(:27640-27647):速度 = (rotation+π/2) 单位向量
            // ×6 + 自身速度×0.5,出膛点 = 中心 - 速度×3
            const ux = Math.cos(e.spin + Math.PI / 2) * num500 + e.vx * 0.5;
            const uy = Math.sin(e.spin + Math.PI / 2) * num500 + e.vy * 0.5;
            fx = ux; fy = uy;
            ox = e.cx - ux * 3; oy = e.cy - uy * 3;
          }
          shoot(game, ox, oy, fx, fy, getAttackDamageForProjectiles(30, 27, e.difficulty), 101);
        }
      }
    } else {
      // 雷眼 :26971-27005:计数无条件累积,>180 且视线可达才发射
      e.lai1 += 1;
      if (e.hp < e.maxHp * 0.75) e.lai1 += 1;
      if (e.hp < e.maxHp * 0.5) e.lai1 += 1;
      if (e.hp < e.maxHp * 0.25) e.lai1 += 1;
      if (e.hp < e.maxHp * 0.1) e.lai1 += 2;
      if (e.lai1 > 180 && losClear(game, e.cx, e.cy, player.cx, player.cy)) {
        e.lai1 = 0;
        // :26991-27004 激光 100:速 8.5(专家 10,:26994-26996),伤 Remap(25,23),
        // 无抖动,出膛点 = 中心 + v×15
        const spdP = expert ? 10 : 8.5;
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        const vx = dx / d * spdP, vy = dy / d * spdP;
        shoot(game, e.cx + vx * 15, e.cy + vy * 15, vx, vy,
          getAttackDamageForProjectiles(25, 23, e.difficulty), 100);
      }
    }
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
  } else if (e.ai1 === 1 && spaz) {
    // 魔眼冲撞启动帧(:27672-27688):吼(style0 满响)后 14 速直冲(expert +2.5
    // =16.5,无 FTW 档),ai1=2 进减速段——全树 case15 仅此一处二阶段专属吼,
    // 2026-08-18 对账补
    game.playSfx('roar', 1, e.cx, e.cy);
    e.spin = target;
    const dx = player.cx - e.cx, dy = player.cy - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    const spd = expert ? 16.5 : 14;
    e.vx = dx / d * spd; e.vy = dy / d * spd;
    e.ai1 = 2;
  } else if (spaz) {
    // 魔眼冲撞减速段(50t 起阻尼,80t 一循环,6 循环回悬浮;expert 计时 ×1.5
    // —— :27696-27700 ai[2]+=1 且 expert 再 +0.5,2026-08-18 补)
    e.ai2 += expert ? 1.5 : 1;
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
  } else {
    // ---- 雷眼二阶段侧移态(:27008-27114,原版 else=任意 ai1!=0;无 ai1==2)----
    // 贴玩家侧 ±340(num460=玩家在哪侧)同高水平位移逼近:经典 8/0.2,专家
    // 9.5/0.25(:27013-27019),FTW ×1.15(:27020-27024);持续 180t 回悬浮
    // (:27106-27114)。曾误写成"直冲 12/专家 15 + 减速循环"(抄了魔眼拓扑+一阶段
    // 冲刺数,2026-08-19 台账 E 重写)
    const num460 = e.cx < player.x + player.w ? -1 : 1;
    let spd2 = 8, acc2 = 0.2;
    if (expert) { spd2 = 9.5; acc2 = 0.25; }
    if (ftw) { spd2 *= 1.15; acc2 *= 1.15; }
    seek(e, player.cx + num460 * 340, player.cy, spd2, acc2);
    e.spin = Math.atan2(player.cy - e.cy, player.cx - e.cx) - Math.PI / 2;
    // :27070-27090 连射计数(localAI[1],与悬浮态共用):+1/t,<75% +0.5,<50% +0.75,
    // <25% +1,<10% +1.5,专家恒 +1.5;>60 且视线可达 → 清零发射
    e.lai1 += 1;
    if (e.hp < e.maxHp * 0.75) e.lai1 += 0.5;
    if (e.hp < e.maxHp * 0.5) e.lai1 += 0.75;
    if (e.hp < e.maxHp * 0.25) e.lai1 += 1;
    if (e.hp < e.maxHp * 0.1) e.lai1 += 1.5;
    if (expert) e.lai1 += 1.5;
    if (e.lai1 > 60 && losClear(game, e.cx, e.cy, player.cx, player.cy)) {
      e.lai1 = 0;
      // :27094-27103 激光 100:速 9,伤 Remap(18,17),无抖动,出膛点 = 中心 + v×15
      const dx = player.cx - e.cx, dy = player.cy - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      const vx = dx / d * 9, vy = dy / d * 9;
      shoot(game, e.cx + vx * 15, e.cy + vy * 15, vx, vy,
        getAttackDamageForProjectiles(18, 17, e.difficulty), 100);
    }
    e.ai2 += 1;
    if (e.ai2 >= 180) { e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
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
    game.playSfx('roar', 1, e.cx, e.cy);   // :27785 style0 满响带坐标
  }
  if (e.ai1 === 0) {
    // 悬浮段(:27787-27874):Y 带 [玩家-200, 玩家-500] 0.1/±2;X 窗 ±100 0.1/±8;
    // 专家档 :27819-27824——0.03/±4(Y)、0.07/±9.5(X)(FTW 无档);
    // mech:Y 带 [玩家-300, 玩家-350]、X 窗平移 -450×侧(:27813-27818)
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
    let nY = 0.1, cY = 2, nX = 0.1, cX = 8;
    if (mainExpertMode(game.world)) { nY = 0.03; cY = 4; nX = 0.07; cX = 9.5; }
    if (e.y > player.y - yLow) {
      if (e.vy > 0) e.vy *= 0.98;
      e.vy -= nY;
      if (e.vy > cY) e.vy = cY;
    } else if (e.y < player.y - yHigh) {
      if (e.vy < 0) e.vy *= 0.98;
      e.vy += nY;
      if (e.vy < -cY) e.vy = -cY;
    }
    if (e.cx > player.cx + 100 + xShift) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= nX;
      if (e.vx > cX) e.vx = cX;
    }
    if (e.cx < player.cx - 100 + xShift) {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += nX;
      if (e.vx < -cX) e.vx = -cX;
    }
  } else if (e.ai1 === 1) {
    // 旋冲段(:27875-27970):防伤×2,速度 = 朝玩家单位向量 × num200 每 tick 直设
    // (:27955-27957)——经典 2;专家 6 + 距离阶梯(>150 ×1.05;>200..>600 每
    // 100px ×1.1 共 10 级,:27906-27948);400t 回悬浮;
    // mech:旋转改 AngleLerp 倾转(:27887-27892)、冲速 ×0.75(无 135)/0.6
    // (有 135)(:27950-27954)、距玩家 < 冲速时速度钳到距离防过冲抖动(:27958-27966)
    e.def.defense = b.def * 2;
    e.def.damage = b.dmg * 2;
    e.ai2 += 1;
    if (e.ai2 === 2) game.playSfx('roar', 1, e.cx, e.cy);   // :27882 style0 满响
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
    if (mainExpertMode(game.world)) {
      spd = 6;
      if (dist > 150) spd *= 1.05;
      for (const d2 of [200, 250, 300, 350, 400, 450, 500, 550, 600]) if (dist > d2) spd *= 1.1;
    }
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
    // 离场(:28043-28052):下坠离场;非 mech EncourageDespawn(500)(:28045,
    // 曾误 10——500=远离玩家 500t 才允许消散)
    e.vy += 0.1;
    if (e.vy < 0) e.vy *= 0.95;
    e.vx *= 0.95;
    if (e.vy > 13) e.vy = 13;
    e.encourageDespawn(500); // 离屏即消(bossFled,不播击败)
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
    // ---- 锯(NPC 129,aiStyle 33,:28134-28358) ----
    if (e.ai2 === 0 || e.ai2 === 3) {
      if (head.ai1 !== 0) {
        // 头冲撞中:7 速逼近玩家(0.05 步进/0.97 阻尼)
        seekSteer(e, player, 7, 0.05);
        e.ai3 += 1;
        if (e.ai3 >= 600) { e.ai2 = 0; e.ai3 = 0; }
      } else {
        e.ai3 += 1;
        // :28203-28209 悬浮 300t → ai[2]+1(0→1 举起 / 3→4 追玩家——曾恒 →1
        // 使 4 追玩家态不可达=死码,2026-08-19 终审修)
        if (e.ai3 >= 300) { e.ai2 += 1; e.ai3 = 0; }
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
    } else if (e.ai2 === 4 && player) {
      // :28300-28354 追玩家态:7 速 0.05 舵 600t → 回 0(曾缺=砸后直接回待机,
      // 追击压制段丢失,2026-08-19 终审补)
      seekSteer(e, player, 7, 0.05);
      e.ai3 += 1;
      if (e.ai3 >= 600) { e.ai2 = 0; e.ai3 = 0; }
      e.spin = Math.atan2(ay - e.cy, ax - e.cx) + Math.PI / 2;
    } else if (e.ai2 === 5 && player) {
      if ((e.vx > 0 && e.cx > player.cx) || (e.vx < 0 && e.cx < player.cx)) e.ai2 = 0;
    }
  } else if (style === 34) {
    // ---- 钳(NPC 130,aiStyle 34,:28360-28638;曾误标"激光"——128=炮/131=激光,
    //      NPCID.cs:11321-11327 权威:128 Cannon/129 Saw/130 Vice/131 Laser) ----
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
        // :28488-28494 悬浮 600t → ai[2]+1(0→1 / 3→4 横扫——曾恒 →1 使
        // 4↔5 横扫不可达,2026-08-19 终审修)
        if (e.ai3 >= 600) { e.ai2 += 1; e.ai3 = 0; }
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
    // ---- 炮(NPC 128,aiStyle 35,:28640-28875;弹 102 伤 0 威慑;曾误标"钳") ----
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
      // 头旋冲时 localAI[0]+2 = 射速×3(:28661)——周期 ÷3
      if (e.aiT % Math.round(140 / (head.ai1 !== 0 ? 3 : 1)) === 0) {
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
      if (e.aiT % Math.round(40 / (head.ai1 !== 0 ? 3 : 1)) === 0) {
        const dx = player.cx - e.cx, dy = player.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        shoot(game, e.cx + dx / d * 4, e.cy + dy / d * 4,
          dx / d * 10 + (Math.random() - 0.5) * 0.8, dy / d * 10 + (Math.random() - 0.5) * 0.8, 0, 102);
      }
    }
  } else if (style === 36) {
    // ---- 激光(NPC 131,aiStyle 36,:28876-29110;初 ai3=150 计入 800 门;曾误标"炮") ----
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
        // 头旋冲时 localAI[0]+3 = 射速×4(:28897)
        if (e.aiT % Math.round(200 / (head.ai1 !== 0 ? 4 : 1)) === 0) {
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
      if (e.aiT % Math.round(80 / (head.ai1 !== 0 ? 4 : 1)) === 0) {
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
  // ---- 掘地周期音（AI_037 :50459-50473 else 段）：soundDelay==0 → 玩家距/40 钳
  // 10..20 → PlaySound(15,x,y) 无 style = style 默认 1 = Roar_1 满响（与 AI_006
  // 蠕虫掘地同构;原版 80 段各自掷、靠 case15 单实例互斥收敛为单声——本仓段链
  // 由头驱动,头单点掷即等价,2026-08-18 补） ----
  if (e.digSndDelay <= 0) {
    const dd = player ? Math.hypot(player.cx - e.cx, player.cy - e.cy) : 400;
    e.digSndDelay = Math.round(Math.min(20, Math.max(10, dd / 40)));
    game.playSfxWav?.('Roar_1', 1, e.cx, e.cy);
  } else {
    e.digSndDelay--;
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

  // 头追近门(:50306-50330):头在玩家【下方】且 1000px 内 → flag2=true 强制钻地
  // 分支朝玩家逼近(空中暴露的头主动扎地追击——曾缺=悬空头只走空中钳速)
  if (player && !player.dead && !buried
    && e.cy > player.cy && Math.hypot(player.cx - e.cx, player.cy - e.cy) < 1000) {
    buried = true;
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

