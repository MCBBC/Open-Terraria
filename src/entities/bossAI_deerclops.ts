// 鹿角怪 668 全链（NPC.cs AI_123_Deerclops :44338-44752 + 尖刺/碎石助手 :44754-44955
// + Movement :44957-45042 + 弹幕 961/962/965）1:1 移植。
//   状态机 ai0：-1 入场走位 / 0 追击选招 / 1 前向尖刺 / 2 碎石喷发 / 3 咆哮减速 /
//   4 双侧尖刺 / 5 影手六连 / 6 回家 / 7 回家落地传送 / 8 离场消散。
//   ai1=段内计数；ai2/ai3=家 tile（首帧落点）；lai0=空中标志（Movement 用）；
//   lai2=专家影手被动计数；lai3=远距免伤爬升（≥450px 每 t+1,满 30 免伤；
//   近距 -1）+出生红雾源。
//   近似：Boss_CanShootExtraAt（多人）→ 单人 1200px 距离门；dust 109 → 粒子。
import { Entity } from './Entity';
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { BuffType } from '../stats/Buffs';
import { TILE } from '../core/constants';

const SCREAM = ['deerclops_scream_0', 'deerclops_scream_1', 'deerclops_scream_2'];
const ICE = ['deerclops_ice_attack_0', 'deerclops_ice_attack_1', 'deerclops_ice_attack_2'];

/** WorldGen.SolidTile 语义（active+solid） */
function solidAt(game: GameHooks, x: number, y: number): boolean {
  const st = game.world.store;
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0 && !!st.isSolid(x, y);
}

/** WorldGen.ActiveAndWalkableTile：active 且非 solidTop 平台族（本仓 isPlatform 近似） */
function walkableAt(game: GameHooks, x: number, y: number): boolean {
  const st = game.world.store;
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0 && !st.isPlatform(x, y);
}

/** Collision.SolidCollision(px 盒与实心块相交；Collision.cs:2748-2791)：
 *  flag = tileSolid && !tileSolidTop；acceptTopSurfaces=true 时并入"可站顶面"
 *  （平台族 + 家具底行，本仓 isPlatform 语义）与半砖（y+8 高 8 的 AABB） */
function solidCollisionPx(game: GameHooks, x: number, y: number, w: number, h: number,
  acceptTopSurfaces = false): boolean {
  const st = game.world.store;
  const i0 = Math.floor(x / TILE), j0 = Math.floor(y / TILE);
  const i1 = Math.floor((x + w - 0.01) / TILE), j1 = Math.floor((y + h - 0.01) / TILE);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (!st.inBounds(i, j)) continue;
      const idx = st.idx(i, j);
      if (st.flags[idx] === 0) continue;               // !active
      let solid = st.isSolid(i, j) && !st.isPlatform(i, j);
      if (acceptTopSurfaces && st.isPlatform(i, j)) solid = true;
      if (!solid) continue;
      let ty = j * TILE, th = TILE;
      if (st.half[idx]) { ty += 8; th -= 8; }          // 半砖（:2778-2782）
      if (x + w > i * TILE && x < i * TILE + TILE && y + h > ty && y < ty + th) return true;
    }
  }
  return false;
}

/** ShouldRunAway（NPC.cs:44716-44738）：死/出雪原（或离家 480px 内视为雪原）且非追击态/
 *  离玩家 2400px → 撤。isChasing=false 时"非雪原"即撤（回家态）。
 *  zoneSnow 读 game.scene（SceneMetrics 每 15t 刷新）——★勿读 player 字段(不存在) */
function shouldRunAway(e: Enemy, game: GameHooks, p: Player | null, isChasing: boolean, homeX: number, homeY: number): boolean {
  if (!p || p.dead) return true;
  const zoneSnow = !!game.scene?.zoneSnow
    || Math.hypot(p.cx - homeX * TILE, p.cy - homeY * TILE) <= 480;
  if (!isChasing && !zoneSnow) return true;
  return Math.hypot(p.cx - e.cx, p.cy - e.cy) >= 2400;
}

/** AI_123 主状态机（NPC.cs:44338-44752） */
export function deerclopsAI(e: Enemy, game: GameHooks, p: Player | null): void {
  if (e.ai0 === -1120) e.ai0 = 0;   // 本仓 ai0 缺省 -1120（史莱姆族哨兵）→ 原版 ai[0] 缺省 0
  const DMG_HANDS = 15;   // 主线影手/咆哮段伤害（外层 num）
  const far = p != null && !p.dead && Math.hypot(p.cx - e.cx, p.cy - e.cy) >= 450;
  // :44346-44347 lai3 远距爬升 + 免伤（下界 -10 供入场段清零语义）
  e.lai3 = Math.max(-10, Math.min(30, e.lai3 + (far ? 1 : -1)));
  e.dontTakeDamage = e.lai3 >= 30;
  if (e.lai3 > 0) {
    // :44352-44360 红雾（dust 109）密度随 lai3/30
    const k = e.lai3 / 30;
    let n = Math.random() * k * 3;
    while (n > 0) { n -= 1; game.spawnParticles(e.cx, e.cy, '#A03030', 1, 1.4, { life: 30, grav: -0.04 }); }
  }
  // :44362-44374 家 tile 初始化（首帧落点 → ai2/ai3）+ 离场计时
  if (e.ai2 === 0 && e.ai3 === 0) {
    e.ai2 = Math.floor(e.cx / TILE);
    e.ai3 = Math.floor((e.y + e.h) / TILE);
    e.despawnTimer = 86400;
  }
  if (e.despawnTimer > 0) e.despawnTimer--;
  const homeX = e.ai2, homeY = e.ai3;
  // :44378-44382 专家被动影手（SpawnPassiveShadowHands :44730-44752：
  //   间隔随血量 80→40t；计数对 interval 取模触发，num3=计数/间隔 → 每 1×/2×/3×
  //   拍各出 1 只（hint=num3%3 = 1,2,0），第 3 只同拍把 localAI[2] 清零重开。
  //   曾加 idx<3 门 → 每轮只出 2 只（第 3 只被吞）。单人近似 Boss_CanShootExtraAt=1200px 门）
  if (game.world.isExpert && p && !p.dead) {
    const lifePct = e.hp / e.maxHp;
    const interval = Math.trunc(80 + (0 - (1 - lifePct)) * 40);   // (int)Remap(:44732)
    e.lai2 += 1;
    const idx = Math.floor(e.lai2 / interval);
    if (e.lai2 % interval === 0 && Math.hypot(p.cx - e.cx, p.cy - e.cy) < 1200) {
      addProj(game, new InsanityShadowProj(p, 10, idx % 3));
    }
    if (idx >= 3) e.lai2 = 0;
  } else {
    e.lai2 = 0;
  }

  let halt = false, goHome = false;
  switch (e.ai0) {
    case -1: e.lai3 = -10; break;                    // :44386-44387
    case 6: {                                        // 回家态 :44389-44439
      if (p && !p.dead && !shouldRunAway(e, game, p, false, homeX, homeY)) {
        e.ai0 = 0; e.ai1 = 0; e.lai1 = 0; break;
      }
      if (e.despawnTimer <= 0) { e.ai0 = 8; e.ai1 = 0; e.lai1 = 0; break; }
      goHome = true;
      e.ai1 += 1;
      const homePx = { x: homeX * TILE, y: homeY * TILE };
      const aboveLine = e.y < homePx.y + 1600;       // 原版 Top.Y > other.Y+1600 = 深于家 1600px
      const nearHome = Math.hypot(homePx.x - e.cx, homePx.y - e.cy) < 1020;
      if (nearHome && e.ai1 % 600 < 420) halt = true;
      if ((!aboveLine && e.ai1 >= 300) || (!nearHome && e.ai1 >= 1500)) {
        // 深于家 1600px 且 >300t,或远离超 1500t → 落地传送段
        e.ai0 = 7; e.ai1 = 0; e.lai1 = 0;
      }
      break;
    }
    case 0: {                                        // 追击选招 :44441-44526
      if (!p || p.dead || shouldRunAway(e, game, p, true, homeX, homeY)) {
        e.ai0 = 6; e.ai1 = 0; e.lai1 = 0; break;
      }
      e.ai1 += 1;
      // 玩家脚底参考点（base.Bottom-32 → 目标盒最近点）
      const vx = e.cx, vy = e.y + e.h - 32;
      const tx = Math.max(p.x, Math.min(vx, p.x + p.w));
      const ty = Math.max(p.y, Math.min(vy, p.y + p.h));
      const dx = tx - vx, dy = ty - vy;
      const facingX = Math.abs(dx) >= Math.abs(dy) * 0.6 || Math.hypot(dx, dy) < 48;
      const nearVert = dy <= 100 + p.h && dy >= -200;
      if (Math.abs(dx) < 120 && nearVert && e.vy === 0 && e.lai1 >= 2) {
        e.vx = 0; e.ai0 = 4; e.ai1 = 0; e.lai1 = 0; break;   // 双侧尖刺
      }
      if (Math.abs(dx) < 120 && nearVert && e.vy === 0 && facingX) {
        e.vx = 0; e.ai0 = 1; e.ai1 = 0; e.lai1 += 1; break;  // 前向尖刺
      }
      if (e.vy === 0 && e.vx !== 0 && e.ai1 >= 240) {
        e.vx = 0; e.ai0 = 2; e.ai1 = 0; e.lai1 = 0; break;   // 碎石
      }
      if (e.vy === 0 && e.vx === 0 && e.ai1 >= 90) {
        e.vx = 0; e.ai0 = 5; e.ai1 = 0; e.lai1 = 0; break;   // 影手
      }
      if (e.vy === 0 && e.ai1 >= 120 && Math.abs(dx) > 100 && !p.buffs.has(BuffType.Slow)) {
        e.vx = 0; e.ai0 = 3; e.ai1 = 0; e.lai1 = 0;          // 咆哮减速
      }
      break;
    }
    case 1:                                          // 前向尖刺 :44528-44538
      e.ai1 += 1; halt = true;
      makeSpikesForward(game, e, p, 1);
      // FindFrame :67394-67400 尖刺态入攻击帧带时 Scream(原版在帧机,此处
      // AI 侧入态首拍等价——曾整态无声,2026-08-19 终审补)
      if (e.ai1 === 30) game.playSfxFiles(SCREAM, 1, e.cx, e.cy);
      if (e.ai1 >= 80) { e.ai0 = 0; e.ai1 = 0; }
      break;
    case 4:                                          // 双侧尖刺 :44530-44543
      e.ai1 += 1; halt = true;
      if (e.ai1 === 30) game.playSfxFiles(SCREAM, 1, e.cx, e.cy);   // :67452-67460 入带 Scream(终审补)
      makeSpikesBothSides(game, e, p, 1);
      if (e.ai1 >= 90) { e.ai0 = 0; e.ai1 = 0; }
      break;
    case 2: {                                        // 碎石喷发 :44545-44588
      const START = 32;                              // num8=4 → num9=8×4=32
      e.ai1 += 1;
      if (e.ai1 === START - 20) game.playSfxFiles(SCREAM, 1, e.cx, e.cy);
      if (e.ai1 === START) game.playSfxFile?.('deerclops_rubble_attack', 1, e.cx, e.cy);
      halt = true;
      if (e.ai1 >= START) {
        const srcX = Math.floor(e.cx / TILE) + e.facing * 3;
        const srcY = Math.floor(e.y / TILE) - 10;
        const since = e.ai1 - START;
        if (since === 0) punch(game, e.cx, e.cy, 0, -1, 30);
        // 每 t 一颗（num12=1）,共 20 颗
        shootRubbleUp(game, e, p, srcX, srcY, 20, 1, 200, since);
      }
      if (e.ai1 >= 60) { e.ai0 = 0; e.ai1 = 0; }     // :44587
      break;
    }
    case 3:                                          // 咆哮减速 :44589-44623
      if (e.ai1 === 30) { game.playSfxFiles(SCREAM, 1, e.cx, e.cy); e.facing = p && p.cx > e.cx ? 1 : -1; }
      e.ai1 += 1; halt = true;
      if (e.ai1 % 4 === 0 && e.ai1 >= 28) {
        punch(game, e.cx, e.cy, Math.cos(Math.random() * Math.PI * 2), Math.sin(Math.random() * Math.PI * 2), 20);
        // :44609-44616 800px 内玩家无 Slow(buff32) → AddBuff(32, 720t)
        if (p && !p.dead && Math.hypot(p.cx - e.cx, p.cy - e.cy) < 800 && !p.buffs.has(BuffType.Slow)) {
          p.buffs.apply(BuffType.Slow, 720 / 60);
        }
      }
      if (e.ai1 >= 60) { e.ai0 = 0; e.ai1 = 0; }
      break;
    case 7:                                          // 回家落地 :44624-44646
      if (e.ai1 === 30) game.playSfxFiles(SCREAM, 1, e.cx, e.cy);
      e.ai1 += 1; halt = true;
      if (e.ai1 % 4 === 0 && e.ai1 >= 28) {
        punch(game, e.cx, e.cy, Math.cos(Math.random() * Math.PI * 2), Math.sin(Math.random() * Math.PI * 2), 20);
      }
      if (e.ai1 === 40) {                            // :44637-44641 传送回家（Bottom 落点）
        if (p && !p.dead) e.facing = p.cx > e.cx ? 1 : -1;
        e.x = homeX * TILE - e.w / 2;
        e.y = homeY * TILE - e.h;
      }
      if (e.ai1 >= 60) { e.ai0 = 0; e.ai1 = 0; }
      break;
    case 8:                                          // 离场消散 :44647-44670
      if (e.ai1 === 30) game.playSfxFiles(SCREAM, 1, e.cx, e.cy);
      e.ai1 += 1; halt = true;
      if (e.ai1 % 4 === 0 && e.ai1 >= 28) {
        punch(game, e.cx, e.cy, Math.cos(Math.random() * Math.PI * 2), Math.sin(Math.random() * Math.PI * 2), 20);
      }
      if (e.ai1 >= 40) {
        // :44667-44670 life=-1 → 无掉落消散（直置 dead 绕过 hurt 死亡链即无掉落/公告）
        e.hp = -1; e.dead = true;
        return;
      }
      break;
    case 5:                                          // 影手六连 :44671-44707
      if (e.ai1 === 30) {
        game.playSfxFiles(SCREAM, 1, e.cx, e.cy);
        if (p && !p.dead) e.facing = p.cx > e.cx ? 1 : -1;
        for (let i = 0; i < 6; i++) addProj(game, new InsanityShadowProj(p, DMG_HANDS, i % 3));
      }
      e.ai1 += 1; halt = true;
      if (e.ai1 % 4 === 0 && e.ai1 >= 28) {
        punch(game, e.cx, e.cy, Math.cos(Math.random() * Math.PI * 2), Math.sin(Math.random() * Math.PI * 2), 20);
      }
      if (e.ai1 >= 60) { e.ai0 = 0; e.ai1 = 0; }
      break;
  }
  deerclopsMovement(e, game, p, halt, goHome, homeX, homeY);
}

/** PunchCameraModifier 近似（Main.instance.CameraModifiers） */
function punch(game: GameHooks, x: number, y: number, dirX: number, dirY: number, frames: number): void {
  void x; void y;
  game.punchCamera?.(dirX, dirY, frames);
}

/** AI_123_Deerclops_MakeSpikesForward（:44776-44810）:ai1≥36 起每 4t 一根,前向 20 根 */
function makeSpikesForward(game: GameHooks, e: Enemy, p: Player | null, slot: number): void {
  const LEAD = 36;
  const ai1 = slot === 1 ? e.ai1 : e.lai1;
  if (ai1 < LEAD) return;
  const srcX = Math.floor((e.x + e.w / 2) / TILE) + e.facing * 3;
  const srcY = Math.floor((e.y + e.h) / TILE);
  const since = ai1 - LEAD;
  if (since === 0) punch(game, e.cx, e.cy, 0, 1, 30);
  const step = Math.floor(since / 4) * 4;
  const hi = since % 4 === 0 ? step + 4 : step;
  for (let i = step; i < hi && i < 20; i++) {
    tryMakingSpike(game, e, p, srcX, srcY, e.facing, 20, i, i);
  }
}

/** AI_123_Deerclops_MakeSpikesBothSides（:44812-44842）:ai1≥56 起每 2t,双侧各 15 根 */
function makeSpikesBothSides(game: GameHooks, e: Enemy, p: Player | null, slot: number): void {
  const LEAD = 56;
  const ai1 = slot === 1 ? e.ai1 : e.lai1;
  if (ai1 < LEAD) return;
  const srcX = Math.floor((e.x + e.w / 2) / TILE) + e.facing * 3;
  const srcY = Math.floor((e.y + e.h) / TILE);
  const since = ai1 - LEAD;
  if (since === 0) punch(game, e.cx, e.cy, 0, 1, 30);
  const step = Math.floor(since / 2) * 2;
  const hi = since % 2 === 0 ? step + 2 : step;
  for (let i = step; i >= 0 && i < hi && i < 15; i++) {
    tryMakingSpike(game, e, p, srcX, srcY, e.facing, 15, -i, i);
    tryMakingSpike(game, e, p, srcX, srcY, -e.facing, 15, -i, i);
  }
}

/** AI_123_Deerclops_TryMakingSpike（:44887-44908）：落点 BestY + 961 弹（伤害 13,
 *  ai1 = 0.1+rand0.1+xOffset*1.1/howMany 尺度相位） */
function tryMakingSpike(
  game: GameHooks, e: Enemy, p: Player | null,
  srcX: number, srcY: number, dir: number, howMany: number, whichOne: number, xOffset: number,
): void {
  const DMG = 13;
  const x = srcX + xOffset * dir;
  const y = findBestSpikeY(game, e, p, srcY, x);
  if (!walkableAt(game, x, y)) return;
  const px = x * TILE + 8, py = y * TILE - 8;
  const ang = -Math.PI / 2 + whichOne * dir * 0.7 * (Math.PI / 4 / howMany);
  addProj(game, new DeerclopsSpikeProj(px, py, ang, DMG,
    0.1 + Math.random() * 0.1 + (xOffset * 1.1) / howMany));
}

/** AI_123_Deerclops_TryMakingSpike_FindBestY（:44900-44955）：目标侧向找最近可行走面,
 *  再上拔 20 格出实心、下探 20 格落到可行走 */
function findBestSpikeY(game: GameHooks, e: Enemy, p: Player | null, srcY: number, x: number): number {
  void e;
  let y = srcY;
  if (p && !p.dead) {
    const tBottom = Math.floor((p.y + p.h) / TILE);
    const sgn = Math.sign(tBottom - srcY) || 1;
    const end = tBottom + sgn * 15;
    let best: number | null = null, bestD = Infinity;
    for (let i = srcY; i !== end; i += sgn) {
      if (!game.world.store.inBounds(x, i)) continue;
      if (walkableAt(game, x, i)) {
        const d = Math.abs(i * TILE + 8 - (p.y + p.h));
        if (best === null || d < bestD) { best = i; bestD = d; }
      }
    }
    if (best !== null) y = best;
  }
  for (let k = 0; k < 20; k++) {                 // 上拔出实心
    if (y < 10 || !solidAt(game, x, y)) break;
    y--;
  }
  for (let k = 0; k < 20; k++) {                 // 下探到可行走
    if (y > game.world.store.h - 10 || walkableAt(game, x, y)) break;
    y++;
  }
  return y;
}

/** AI_123_Deerclops_ShootRubbleUp（:44754-44781）：从实心块顶喷 962 碎石（伤害 18,
 *  速度 = (0,-1) 旋 (whichOne*dir)*0.7*π/4/howMany × (8+rand8)） */
function shootRubbleUp(
  game: GameHooks, e: Enemy, p: Player | null,
  srcX: number, srcY: number, howMany: number, dist: number, upBias: number, whichOne: number,
): void {
  void p;
  const DMG = 18;
  const offset = whichOne * dist;
  for (let i = 0; i < 35; i++) {
    const x = srcX + offset * e.facing, y = srcY + i;
    if (!solidAt(game, x, y)) continue;
    const ang = -Math.PI / 2 + whichOne * e.facing * 0.7 * (Math.PI / 4 / howMany);
    const spd = 8 + Math.random() * 8;
    // ai[1]：原文两行连写(:44768-44769)，第二行覆盖第一行 → frame = 6 + rand(6)
    //（rand(12) 首行是死码；3×4 网格只取下两行 6..11）
    addProj(game, new DeerclopsRubbleProj(x * TILE + 8, y * TILE - 8,
      Math.cos(ang) * spd, Math.sin(ang) * spd, DMG, 6 + Math.floor(Math.random() * 6)));
    break;
  }
}

/** AI_123_Deerclops_Movement（:44957-45042）：自定义重力/跳跃（noTileCollide 下自管垂直） */
function deerclopsMovement(
  e: Enemy, game: GameHooks, p: Player | null,
  halt: boolean, goHome: boolean, homeX: number, homeY: number,
): void {
  const rage = 1 - e.hp / e.maxHp;
  const speed = 3.5 + rage;                    // :44959 num3 = 3.5 + 1×(1-lifeFrac)
  let tx: number, ty: number, tw: number, th: number;
  if (goHome) {
    tx = homeX * TILE; ty = homeY * TILE; tw = 16; th = 16;
    if (Math.hypot(tx - e.cx, ty - e.cy) < 240) { tx = e.cx + 160 * e.facing; }
  } else if (p && !p.dead) {
    tx = p.x; ty = p.y; tw = p.w; th = p.h;
  } else {
    tx = e.cx + 100 * e.facing; ty = e.y; tw = 16; th = 16;
  }
  const dx = (tx + tw / 2) - e.cx;
  const adx = Math.abs(dx);
  if (goHome && dx !== 0) e.facing = Math.sign(dx);
  const nearX = adx < 80;
  let stop = nearX || halt;
  let spd = speed;
  let dir = dx;
  if (e.ai0 === -1) { dir = 5; spd = 5.35; stop = false; }   // :44985-44988 入场
  if (stop) {
    e.vx *= 0.9;
    if (Math.abs(e.vx) < 0.1) e.vx = 0;
  } else {
    e.vx += (Math.sign(dir) * spd - e.vx) / 4;                // Lerp(v, target, 1/4)
  }
  // :44998-45018 底部碰撞探针（40×20）+ 前方净空（16×80）。
  // acceptTopSurfaces = Bottom.Y >= 目标 Top 且非传送态（:45009）——为真时平台/
  // 上坡面也算"地面"（曾在冰原木平台上悬空踩空、贴地判定失效）
  const bx = e.cx - 20, by = e.y + e.h - 20;
  const straddle = bx < tx && bx + e.w > tx + tw;             // num13：横跨目标
  const targetAbove = by + 20 < ty + th - 16;                 // flag3
  const teleporting = e.ai0 === 7;
  const acceptTop = e.y + e.h >= ty && !teleporting;
  const ground = solidCollisionPx(game, bx, by, 40, 20, acceptTop);
  const groundHigh = solidCollisionPx(game, bx, by, 40, 16, acceptTop);
  const openAhead = !solidCollisionPx(game, bx + 40 * e.facing, by, 16, 80, acceptTop);
  if (ground || groundHigh) e.lai0 = 0;
  if (teleporting) e.vy = -0.1;
  if ((straddle || nearX) && targetAbove) {
    e.vy = Math.min(Math.max(e.vy + 0.8, 0.001), 16);         // 落到目标层
  } else if (ground && !groundHigh) {
    e.vy = 0;                                                 // 半砖缘站定
  } else if (ground) {
    e.vy = Math.max(Math.min(e.vy - 0.4, 0), -8);             // 贴地
  } else if (e.vy === 0 && openAhead) {
    e.vy = -8; e.lai0 = 1;                                    // 起跳
  } else {
    e.vy = Math.min(Math.max(e.vy + 0.4, -8), 16);            // 重力
  }
  // 位置积分（SetDefaults :17384 noGravity+noTileCollide → 原版引擎直移穿墙；
  // AI 只经底部/前方探针模拟"贴地行走"）。★曾整段漏接——AI 状态机照跑但坐标
  // 永不动 = 召唤在哪冻在哪（2026-08-19 用户实报"冻结在半空"，探针复现恒 y）
  e.x += e.vx;
  e.y += e.vy;
}

// ---------------------------------------------------------------------------
// 弹幕 961 冰尖刺（AI_157_SharpTears :48432-48567 type==961 段）
// ---------------------------------------------------------------------------
export class DeerclopsSpikeProj extends Entity {
  w = 32; h = 32;
  dead = false;
  private ai0 = 0;
  private readonly ai1: number;
  private opacity = 0;      // Opacity（0-1 语义）
  private readonly rot: number;
  /** 变体帧:AI_157 flag=true → frame=rand(5)（Projectile.cs:48487-48490,maxValue=5） */
  private readonly frame: number;
  life = 20;                // num9=20 出世
  constructor(x: number, y: number, angle: number, private dmg: number, ai1: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.rot = angle;
    this.ai1 = ai1;
    this.frame = Math.floor(Math.random() * 5);
  }
  fixedUpdate(_dt: number, game: GameHooks): void {
    const was = this.ai0;
    this.ai0 += 1;
    if (--this.life <= 0) { this.dead = true; game.onProjectileDeath?.(961, this.x, this.y); return; }
    if (was === 0) {
      // :48498-48526 首帧：尘爆 + 冰攻音
      game.spawnParticles(this.cx, this.cy, '#BFE8FF', 5, 2.2, { life: 24 });
      game.playSfxFiles(ICE, 1, this.cx, this.cy);
    }
    if (was < 10) {          // :48536-48539 生长期 [0,10)：Opacity+0.1,scale=Opacity*ai1
      this.opacity = Math.min(1, this.opacity + 0.1);
    } else {                 // :48548-48551 收缩期 [10,20)：Opacity-0.2
      this.opacity = Math.max(0, this.opacity - 0.2);
    }
    // 接触伤害（hostile 全窗有效；iframes 由 damagePlayer 节流）
    const p = game.player;
    if (p && !p.dead && this.opacity > 0.05
      && p.x < this.x + this.w && p.x + p.w > this.x && p.y < this.y + this.h && p.y + p.h > this.y) {
      game.damagePlayer(this.dmg, this.cx, this.cy);
    }
    void game.world;
  }
  scale(): number { return this.opacity * this.ai1; }
  draw(r: import('../render/Renderer').Renderer, _cam: import('../render/Camera').Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = r.atlas?.ensureVImage('vanilla/Projectile_961.png');
    const s = this.scale();
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.cx, this.cy);
    // 朝右贴图:原版 rotation = velocity.ToRotation()（:48485）,无 +π/2 偏置——
    // 曾 +π/2 把横置冰泪竖过来（G11 旋转模式）。AI 的 scaleY 生长斜坡
    // GetLerpValue(30,25,ai0)（Main.cs:31009-31011）在 ai0<=20 即 Kill 的寿命内恒 1,死码
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img) {
      // Frame(1,5)（Main.cs:31004）:贴图 200×240 → 帧格 200×48,× scale=Opacity*ai[1]（:48536）。
      // 曾压成 32×32 判定盒（横向 6.25× / 纵向 5× 失真）。origin (16, 24) = (16, 帧高/2)
      // （Main.cs:31005）——泪体自锚点向 velocity 方向前伸
      const fh = img.height / 5;
      ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
        -16 * s, -(fh / 2) * s, img.width * s, fh * s);
    } else { ctx.fillStyle = '#9FD8F0'; ctx.fillRect(-16 * s, -16 * s, 32 * s, 32 * s); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 弹幕 962 碎石（aiStyle 1 抛物线 + ai1 = rand(12) 3×4 网格变体;timeLeft 220）
// ---------------------------------------------------------------------------
export class DeerclopsRubbleProj extends Entity {
  w = 32; h = 32;
  dead = false;
  life = 220;
  /** 出世姿态角（:54039 localAI[0]==0 时 rotation = velocity.ToRotation() 一次定型,
   *  此后不随当前速度更新——曾每帧重算 atan2(vy,vx)） */
  private readonly spawnRot: number;
  constructor(x: number, y: number, public vx: number, public vy: number,
    private dmg: number, private frame: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.spawnRot = Math.atan2(vy, vx);
  }
  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; game.onProjectileDeath?.(962, this.x, this.y); return; }
    this.vy = Math.min(this.vy + 0.3, 16);                    // aiStyle 1 重力
    this.x += this.vx; this.y += this.vy;                     // tileCollide=false 穿落
    const p = game.player;
    if (p && !p.dead
      && p.x < this.x + this.w && p.x + p.w > this.x && p.y < this.y + this.h && p.y + p.h > this.y) {
      game.damagePlayer(this.dmg, this.cx, this.cy);
    }
  }
  draw(r: import('../render/Renderer').Renderer, _cam: import('../render/Camera').Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = r.atlas?.ensureVImage('vanilla/Projectile_962.png');
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.spawnRot);
    ctx.imageSmoothingEnabled = false;
    if (img) {
      // 网格 = Frame(3,4)（Main.cs:32828-32834:projFrames[962]=3 横 × 4 纵,帧格 34×34）;
      // frameX = frame%3 / frameY = frame/3。曾按 4 列×3 行（25.5×45.33 非整数格）切片
      // 并归一到 32×32 判定盒（纵横比翻转,G11）
      const fw = img.width / 3, fh = img.height / 4;
      const f = Math.max(0, Math.min(11, this.frame));
      ctx.drawImage(img, Math.round((f % 3) * fw), Math.round(Math.floor(f / 3) * fh),
        Math.round(fw), Math.round(fh), -fw / 2, -fh / 2, fw, fh);
    } else { ctx.fillStyle = '#887860'; ctx.fillRect(-16, -16, 32, 32); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 弹幕 965 敌对影手（AI_187_ShadowHand :39798-39940 + RandomizeInsanityShadowFor
// :39703-39796）。ai0 初值 0/180/300/390 直接选定变体段,到段尾即灭（总寿 480t 封顶）
// ---------------------------------------------------------------------------
export class InsanityShadowProj extends Entity {
  w = 40; h = 40;
  dead = false;
  life = 300;   // Projectile.cs:8833 timeLeft=300(曾 480,终审修)
  alpha = 255;              // 255=全透明（SetDefaults）→ 淡入至 50
  private ai0: number;
  private readonly ai1: number;
  private rotation = 0;
  constructor(target: { cx: number; cy: number; vx: number } | null, private dmg: number, hint: number) {
    super();
    // RandomizeInsanityShadowFor 单人近似：玩家环上随机点 + 段直选
    const c = target ?? { cx: 0, cy: 0, vx: 0 };
    const a = Math.random() * Math.PI * 2;
    this.x = c.cx - Math.cos(a) * 200 - this.w / 2;
    this.y = c.cy - Math.sin(a) * 200 - this.h / 2;
    this.vx = Math.cos(a) * 4;
    this.vy = Math.sin(a) * 4;
    this.ai0 = [0, 180, 300, 390][hint % 4];
    this.ai1 = a;
  }
  fixedUpdate(_dt: number, game: GameHooks): void {
    this.ai0 += 1;
    // 变体段（:39903-39940）
    let variation = 0, start = 0, len = 180;
    if (this.ai0 >= 390) { variation = 3; start = 390; len = 90; }
    else if (this.ai0 >= 300) { variation = 2; start = 300; len = 90; }
    else if (this.ai0 >= 180) { variation = 1; start = 180; len = 120; }
    const fc = this.ai0 - start;
    // :39825-39841 alpha：段尾 15t 淡出至 255,否则淡入至 50
    if (fc > len - 15) this.alpha = Math.min(255, this.alpha + 25);
    else this.alpha = Math.max(50, this.alpha - 25);
    if (fc >= len - 1 || --this.life <= 0) {
      this.dead = true;
      game.onProjectileDeath?.(965, this.x, this.y);
      return;
    }
    if (variation === 0) {                       // :39847-39856 减速滑行
      this.vx *= 0.98; this.vy *= 0.98;
      this.rotation = Math.atan2(this.vy, this.vx) + (this.vx < 0 ? Math.PI : 0);
    } else if (variation === 1) {                // :39857-39874 绕轴摆荡
      const t = fc / len;
      if (Math.hypot(this.vx, this.vy) > 0.1) { this.vx *= 0.95; this.vy *= 0.95; }
      const pivotD = 70 * (this.vx >= 0 ? 1 : -1);
      const a1 = remap(t, 0.3, 0.5, 0, 1) * remap(t, 0.45, 0.5, 1, 0);
      const a2 = remap(t, 0.5, 0.55, 0, 1) * remap(t, 0.5, 1, 1, 0);
      this.rotation += (a1 * (Math.PI / 60) + a2 * (-Math.PI * 8 / 60)) * -(this.vx >= 0 ? 1 : -1);
      const px = this.cx - Math.cos(this.rotation) * pivotD;
      const py = this.cy - Math.sin(this.rotation) * pivotD;
      this.x = px + Math.cos(this.rotation) * pivotD - this.w / 2;
      this.y = py + Math.sin(this.rotation) * pivotD - this.h / 2;
    } else if (variation === 2) {                // :39875-39888 俯冲（0.4 处峰值速）
      const t = fc / len;
      const v1 = remap(t, 0, 0.4, 1, 0);
      const v2 = remap(t, 0.3, 0.4, 0, 1) * remap(t, 0.4, 1, 1, 0);
      const spd = v1 * 2 + v2 * 8 + 0.01;
      this.vx = Math.cos(this.ai1) * spd;
      this.vy = Math.sin(this.ai1) * spd;
      this.rotation = Math.atan2(this.vy, this.vx) + (this.vx < 0 ? Math.PI : 0);
    } else {                                     // :39889-39899 旋进
      const w = this.ai1;
      const cos = Math.cos(w), sin = Math.sin(w);
      const nvx = this.vx * cos - this.vy * sin;
      const nvy = this.vx * sin + this.vy * cos;
      this.vx = nvx; this.vy = nvy;
      this.rotation = Math.atan2(this.vy, this.vx) + (this.vx < 0 ? Math.PI : 0);
    }
    const p = game.player;
    if (p && !p.dead && this.alpha < 250
      && p.x < this.x + this.w && p.x + p.w > this.x && p.y < this.y + this.h && p.y + p.h > this.y) {
      game.damagePlayer(this.dmg, this.cx, this.cy);
    }
  }
  draw(r: import('../render/Renderer').Renderer, _cam: import('../render/Camera').Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = r.atlas?.ensureVImage('vanilla/Projectile_965.png');
    ctx.save();
    ctx.globalAlpha = 1 - this.alpha / 255;
    ctx.translate(this.cx, this.cy);
    // 原版:rotation = ToRotation(+π 向左) 且 dir=FlipHorizontally（AI_187 :39850-39857
    // 等:velocity.X<0 → spriteDirection=-1 + rotation += π）——两变换叠加,曾漏镜像。
    // 未单独登记的 vanilla 视觉层（登记偏差）:4 尾影幽灵拷贝 + Black×Opacity 剪影着色
    // （Main.cs:30747-30757/:30793-30796）
    ctx.rotate(this.rotation);
    if (this.vx < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (img) {
      // 原生 80×84 × scale=1（SetDefaults 965 无 scale;曾归一 40×40 判定盒 → 整体减半）。
      // origin（Main.cs:29934-29937）:X = spriteDirection==1 ? W-20 : 20,Y = H/2——腕部锚点
      const ox = this.vx >= 0 ? img.width - 20 : 20;
      const oy = img.height / 2;
      ctx.drawImage(img, -ox, -oy, img.width, img.height);
    } else { ctx.fillStyle = '#6020B0'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function remap(x: number, a: number, b: number, c: number, d: number): number {
  if (x < a) return c;
  if (x > b) return d;
  return c + (d - c) * ((x - a) / (b - a));
}

/** 弹幕入桶（与 duke 系同款：hostile 类自管运动,dead 由桶清理） */
function addProj(game: GameHooks, p: Entity): void {
  (game as unknown as { entities: { add(e: Entity, bucket: string): void } })
    .entities.add(p, 'projectiles');
}
