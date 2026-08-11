// 石巨人 Boss 族 AI 1:1 移植(Terarria1456,1.4.5.6):
//   本体 245  aiStyle 45  AI_045_Golem        NPC.cs:19447-19722(地面蓄力→跳跃循环/断臂尘/离场)
//   挂载头 246 aiStyle 46                       NPC.cs:31273-31499(锚本体;嘴部火焰弹/眼激光)
//   拳 247/248 aiStyle 47  AI_047_GolemFist    NPC.cs:19171-19446(肩锚归位→蓄力→直线冲拳→回位)
//   自由头 249 aiStyle 48  GolemHeadFree       NPC.cs:31500-31741(自主悬浮+火焰弹/眼激光)
//   SetDefaults:NPC.cs:12095-12149(245-249 属性)、17943-17960(245-249 scale *= 0.5)。
// 经典模式主链 1:1;expert/getGoodWorld 分支保留注释;netcode/纯视觉尘(Gore/netOffset)跳过。
//
// 死亡链(任务约定,原版 checkDead 语义的对齐版):
//   · 挂载头在场时本体无敌(NPC.cs:19513 dontTakeDamage = flag)——一阶段打头/拳;
//   · 本体血尽 → 死亡演出 60t 后真死(ai3=1 标记),挂载头转自由态续战(本体死透后头继续);
//   · 挂载头血尽 → 原地转自由态(原版 HitEffect :85842-85847 在原地 NewNPC 249;
//     此处头原体变身,满血+属性对齐 249 SetDefaults),本体解除无敌;
//   · 自由头血尽 → 全族自毁(战斗结束;原版由 245 死亡置 downedGolemBoss,:80146)。
//   以上转换全部在各自 AI 首行处理,不依赖外部钩子。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { vanillaNpc } from '../data/vanillaNpcs';
import { spawnPart, shoot, accelTo, losClear } from './bossAI';

/** 原版 NPC 通用重力/maxFall(NPC.UpdateNPC 非 noGravity 族:0.3/2t、maxFall 10) */
const GRAV = 0.3;
const MAX_FALL = 10;
/** SetDefaults 245-249 scale *= 0.5(NPC.cs:17943-17960)——族内所有像素偏移按此缩放 */
const SCALE = 0.5;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Boss 伤害/防御基值缓存(自由头切换 249 属性时从基值派生,防重复写膨胀) */
const baseStats = new WeakMap<Enemy, { dmg: number; def: number }>();
const baseOf = (e: Enemy) => {
  let b = baseStats.get(e);
  if (!b) { b = { dmg: e.def.damage, def: e.def.defense ?? 0 }; baseStats.set(e, b); }
  return b;
};

/** 每实例附加槽位(原版 alpha/noTileCollide/localAI 等无对应 Enemy 字段) */
interface BodyX { alpha: number; noTC: boolean; dying: boolean; deadT: number }
interface HeadX { alpha: number; free: boolean; l0: number; l1: number }
interface FistX { alpha: number; noTC: boolean; state: number }
const bodyX = new WeakMap<Enemy, BodyX>();
const headX = new WeakMap<Enemy, HeadX>();
const fistX = new WeakMap<Enemy, FistX>();
const bodyXOf = (e: Enemy): BodyX => {
  let x = bodyX.get(e);
  if (!x) { x = { alpha: 255, noTC: false, dying: false, deadT: 0 }; bodyX.set(e, x); }
  return x;
};
const headXOf = (e: Enemy): HeadX => {
  let x = headX.get(e);
  if (!x) { x = { alpha: 255, free: false, l0: 0, l1: 0 }; headX.set(e, x); }
  return x;
};
const fistXOf = (e: Enemy): FistX => {
  let x = fistX.get(e);
  if (!x) { x = { alpha: 255, noTC: true, state: 0 }; fistX.set(e, x); }
  return x;
};

// ---------------------------------------------------------------------------
// 族内查找(原版静态 golemBoss 索引的等价物:NPC.cs:6052 声明、:19449 每帧回填)
// ---------------------------------------------------------------------------

const findBody = (game: GameHooks): Enemy | null =>
  (game.enemies() as Enemy[]).find((n) => !n.dead && n.vanillaId === 245) ?? null;
const findHead = (game: GameHooks): Enemy | null =>
  (game.enemies() as Enemy[]).find((n) => !n.dead && (n.vanillaId === 246 || n.vanillaId === 249)) ?? null;

/** GetMyBalance + 脱离神庙/丛林加成(NPC.cs:19450-19457 / :19173-19180 / :31274-31282):
 *  经典单人 = 1;getGoodWorld +2/+3(expert,略);玩家不在神庙/丛林带 或 在地表以上 → ×2。
 *  简化项:本工程无 ZoneLihzhardTemple/ZoneJungle 判定,仅保留"玩家在地表以上"一支
 *  (地下神庙内 = 1,与原版常态一致)。 */
const balanceNum = (game: GameHooks, player: Player | null): number => {
  let num = 1;
  if (player && player.cy < game.world.groundLevel * TILE) num *= 2;
  return num;
};

/** 出生渐显(SetDefaults alpha=255;AI 内 alpha -= 10/2t,NPC.cs:19477-19485 / :31310-31317 / :19187-19194)。
 *  返回剩余 alpha;期间 ai[1] 由调用方冻结(本体/拳 0、挂载头 30)——蓄力计时不起跑 */
const fadeAlpha = (e: Enemy, x: { alpha: number }): number => {
  if (x.alpha <= 0) return 0;
  x.alpha = Math.max(0, x.alpha - 10);
  e.spawnAlpha = Math.min(254, x.alpha);
  return x.alpha;
};

// ---------------------------------------------------------------------------
// 碰撞(本族私有拷贝:bossAI.collideGround 是 private;140px 宽本体需多列采样防半悬空)
// ---------------------------------------------------------------------------

/** 落地/顶墙/侧墙判定(原版共享 Collision 的 AABB 近似:底/顶三列、侧墙三点) */
function collideGround(e: Enemy, game: GameHooks): void {
  const st = game.world.store;
  const cols = [e.x + 2, e.cx, e.x + e.w - 2];
  if (e.vy >= 0) {
    const ty = Math.floor((e.y + e.h) / TILE);
    let top = Infinity;
    for (const cx of cols) {
      const tx = Math.floor(cx / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) top = Math.min(top, ty * TILE);
    }
    if (top < Infinity) { e.y = top - e.h; e.vy = 0; e.onGround = true; }
    else e.onGround = false;
  } else {
    e.onGround = false;
    const ty = Math.floor(e.y / TILE);
    let bottom = -Infinity;
    for (const cx of cols) {
      const tx = Math.floor(cx / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) bottom = Math.max(bottom, (ty + 1) * TILE);
    }
    if (bottom > -Infinity) { e.y = bottom; e.vy = 0; }
  }
  const rows = [e.y + 2, e.cy, e.y + e.h - 2];
  if (e.vx > 0) {
    const tx = Math.floor((e.x + e.w) / TILE);
    for (const ry of rows) {
      const ty = Math.floor(ry / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { e.x = tx * TILE - e.w; e.vx = 0; break; }
    }
  } else if (e.vx < 0) {
    const tx = Math.floor(e.x / TILE);
    for (const ry of rows) {
      const ty = Math.floor(ry / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { e.x = (tx + 1) * TILE; e.vx = 0; break; }
    }
  }
}

/** AABB 与实心块相交(原版 Collision.SolidTiles 近似):拳冲拳段关闭穿墙后的撞停判定 */
function hitSolid(game: GameHooks, e: Enemy): boolean {
  const st = game.world.store;
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.01) / TILE);
  const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 0.01) / TILE);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 弹幕(原版 NewProjectile 调用点:id 258 火焰弹 / 259 眼激光)
// ---------------------------------------------------------------------------

/** 嘴部/额前火焰弹(:31329-31347 / :31430-31447 / :31596-31617):
 *  从 (e.center + (ox,oy)) 朝玩家中心 proj 258 */
function golemSpit(
  game: GameHooks, e: Enemy, player: Player, ox: number, oy: number,
  spd: number, dmg: number, projId: number,
): void {
  const sx = e.cx + ox, sy = e.cy + oy;
  const dx = player.cx - sx, dy = player.cy - sy;
  const d = Math.hypot(dx, dy) || 1;
  shoot(game, sx, sy, (dx / d) * spd, (dy / d) * spd, dmg, projId);
}

/** 挂载头眼激光(:31459-31484):双侧眼(±18*scale,-22*scale)各一发 11 速;
 *  玩家在头正上/下方(localAI[1]==0)→ 双眼齐射,否则朝向侧单眼(±30*scale)12 速;伤 28,proj 259 */
function golemEyeLasers(game: GameHooks, e: Enemy, player: Player, side: number): void {
  const fire = (ox: number, spd: number) => {
    const sx = e.cx + ox, sy = e.cy - 22 * SCALE;
    const dx = player.cx - sx, dy = player.cy - sy;
    const d = Math.hypot(dx, dy) || 1;
    const vx = (dx / d) * spd, vy = (dy / d) * spd;
    shoot(game, sx + vx * 3, sy + vy * 3, vx, vy, 28, 259, 300);
  };
  if (side === 0) { fire(-18 * SCALE, 11); fire(18 * SCALE, 11); }
  else fire(side * 30 * SCALE, 12);
}

/** 自由头眼激光(:31659-31717):双眼(±14*scale,-50*scale)各一发 proj 259;
 *  伤 24/速 11,本体(此处用头自身血量 r)每降一档 +1 伤/+0.25 速;
 *  无视线(flag49)→ 伤 ×1.5、速 ×2.5、按玩家速度随机提前量瞄准 */
function golemEyeLasersFree(
  game: GameHooks, e: Enemy, player: Player, noLos: boolean, r: number,
): void {
  for (let i = 0; i < 2; i++) {
    const sx = e.cx + (i === 0 ? -14 : 14) * SCALE;
    const sy = e.cy - 50 * SCALE;
    let dmg = 24, spd = 11;
    if (r < 0.5) { dmg += 1; spd += 0.25; }
    if (r < 0.4) { dmg += 1; spd += 0.25; }
    if (r < 0.3) { dmg += 1; spd += 0.25; }
    if (r < 0.2) { dmg += 1; spd += 0.25; }
    if (r < 0.1) { dmg += 1; spd += 0.25; }
    let tx = player.cx, ty = player.cy;
    if (noLos) {
      dmg = Math.floor(dmg * 1.5);
      spd *= 2.5;
      const pvx = (player as unknown as { vx: number }).vx ?? 0;
      const pvy = (player as unknown as { vy: number }).vy ?? 0;
      tx += pvx * Math.random() * 50;
      ty += pvy * Math.random() * 50;
    }
    const dx = tx - sx, dy = ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    const vx = (dx / d) * spd, vy = (dy / d) * spd;
    shoot(game, sx + vx * 3, sy + vy * 3, vx, vy, dmg, 259, 300);
  }
}

// ---------------------------------------------------------------------------
// AI_045 石巨人本体 245(NPC.cs:19447-19722)
// ---------------------------------------------------------------------------

/** 挂载头 → 自由态(原版 HitEffect :85842-85847:246 血尽原地 NewNPC 249;
 *  本工程头原体变身,满血+属性对齐 249 SetDefaults :12139-12149) */
function golemHeadGoFree(e: Enemy, game: GameHooks): void {
  const x = headXOf(e);
  if (x.free) return;
  x.free = true;
  e.ai3 = 1;          // 自由态标记(探针/部件锚定可观测)
  e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
  e.hp = e.maxHp;     // 原版 249 满血登场
  game.spawnParticles(e.cx, e.cy, '#C04030', 16, 2.6, { life: 30 });
  game.playSfx('roar', 0.8);
}

export function golemAI(e: Enemy, game: GameHooks, player: Player | null) {
  const x = bodyXOf(e);

  // ---- 血尽转换(首行):死亡演出 60t 后真死;头由自身 AI 转自由态续战 ----
  if (e.hp <= 0 && !x.dying) {
    x.dying = true; x.deadT = 0;
    e.ai3 = 1;          // 死亡标记(头据此转自由态)
    e.hp = e.maxHp;     // 满血续命防每 tick 重入
    game.playSfx('roar', 0.9);
  }

  // ---- 首帧:localAI[0]==0 生成部件(NPC.cs:19458-19467) ----
  //  原版 NewNPC 传左上角坐标:拳 247=(Center-84,-9)、248=(+78,-9)、头 246=(-3,-57)
  if (!e.bInit) {
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 0; e.ai3 = 0;
    e.alphaFade = false;           // 接管渐显(原版 AI 内 alpha -= 10)
    const spawn = (id: number, ox: number, oy: number, side: number) => {
      const p = spawnPart(game, e, id);
      if (!p) return;
      p.x = e.cx + ox; p.y = e.cy + oy;
      p.ai0 = side;                // 拳 ai0=侧别(-1 左/1 右;头不使用)
    };
    spawn(247, -84, -9, -1);
    spawn(248, 78, -9, 1);
    spawn(246, -3, -57, 0);
  }

  // ---- 出生渐显(NPC.cs:19477-19485):期间 ai[1]=0,蓄力冻结 ----
  if (fadeAlpha(e, x) > 0) e.ai1 = 0;

  // ---- 死亡演出:无敌+碎裂尘,60t 后真死(头/拳继续) ----
  if (x.dying) {
    e.iframes = 2;
    e.vx *= 0.9;
    e.vy = Math.min(e.vy + GRAV, MAX_FALL);
    e.x += e.vx; e.y += e.vy;
    collideGround(e, game);
    x.deadT++;
    if (x.deadT % 6 === 0) {
      game.spawnParticles(
        e.cx + (Math.random() - 0.5) * e.w, e.cy + (Math.random() - 0.5) * e.h,
        '#B04030', 6, 2.4, { life: 36 });
    }
    if (x.deadT >= 60) { e.dead = true; return; }
    return;
  }

  const num = balanceNum(game, player);

  // ---- 部件存活扫描(NPC.cs:19487-19512):flag=头/flag2=左拳/flag3=右拳 ----
  //  注意头原体变身自由态后(ai3=1)视为"挂载头已失"——本体解除无敌且蓄力提速,
  //  对齐原版"246 死亡 → NewNPC 249"后 flag 为假的语义
  let hasHead = false, hasL = false, hasR = false;
  for (const n of game.enemies() as Enemy[]) {
    if (n.dead) continue;
    if (n.vanillaId === 246 && n.ai3 !== 1) hasHead = true;
    else if (n.vanillaId === 247) hasL = true;
    else if (n.vanillaId === 248) hasR = true;
  }
  // dontTakeDamage = 挂载头在场(NPC.cs:19513):一阶段本体无敌,先打头/拳
  if (hasHead) e.iframes = 2;
  // getGoodWorld 落体砸火把(:19514-19534,expert 略)

  // ---- 断臂尘(NPC.cs:19536-19595):原版每 tick 双簇 Dust+Gore,此处每 10t 一簇粒子近似 ----
  if (!hasL && e.aiT % 10 === 0) game.spawnParticles(e.cx - 80 * SCALE, e.cy - 9, '#9A8FA0', 3, 1.2, { life: 40 });
  if (!hasR && e.aiT % 10 === 0) game.spawnParticles(e.cx + 62 * SCALE, e.cy - 9, '#9A8FA0', 3, 1.2, { life: 40 });

  // ---- 跳跃穿墙解除(NPC.cs:19569-19578):下落低于玩家顶 / 有视线且自身不在块内 ----
  if (x.noTC && player && !player.dead) {
    if (e.vy > 0 && e.y + e.h > player.y) x.noTC = false;
    else if (losClear(game, e.cx, e.cy, player.cx, player.cy) && !hitSolid(game, e)) x.noTC = false;
  }

  // TargetClosest 的 direction 近似:朝玩家符号,同侧回退 facing
  const dir = player ? (Math.sign(player.cx - e.cx) || e.facing || 1) : 1;
  if (player) e.facing = dir;

  if (player && e.ai0 === 0) {
    // ---- 地面蓄力(NPC.cs:19580-19645):ai[1] 攒 300 → -20 蹲伏 20t → ==-1 起跳 ----
    //  蹲伏段(负值)num4 固定 1;蓄力段按断臂/残血提速,再乘脱庙狂暴系数
    if (e.vy === 0) {
      e.vx *= 0.8;
      let num4 = 1;
      if (e.ai1 > 0) {
        if (!hasL) num4 += 2;
        if (!hasR) num4 += 2;
        if (!hasHead) num4 += 2;
        if (e.hp < e.maxHp) num4 += 1;
        if (e.hp < e.maxHp / 2) num4 += 4;
        if (e.hp < e.maxHp / 3) num4 += 8;
        num4 *= num;
        // getGoodWorld:num4 += 100(:19613-19616,expert 略)
      }
      e.ai1 += num4;
      if (e.ai1 >= 300) e.ai1 = -20;
      else if (e.ai1 === -1) {
        // 起跳(:19624-19643):穿墙跳,vx=4*dir;残血跳更高 -12.1*(num+9)/10 钳 -19.1
        x.noTC = true;
        e.vx = 4 * dir;
        e.vy = e.hp < e.maxHp ? Math.max(-19.1, (-12.1 * (num + 9)) / 10) : -12.1;
        e.ai0 = 1; e.ai1 = 0;
      }
    }
  } else if (player && e.ai0 === 1) {
    // ---- 跳跃段(NPC.cs:19646-19708) ----
    if (e.vy === 0) {
      // 落地(:19648-19661):Item14 音效 + 落地尘/Gore
      game.playSfx('roar', 0.35);
      game.spawnParticles(e.cx, e.y + e.h, '#9A8FA0', 12, 2.2, { life: 40 });
      e.ai0 = 0;
    } else {
      // 玩家在身下水平跨度内 → 收横向速度(夹住玩家下压),否则朝玩家加速钳 ±num7
      if (e.x < player.x + player.w && e.x + e.w > player.x) {
        e.vx *= 0.9;
        if (e.y + e.h < player.y) e.vy += (0.2 * (num + 1)) / 2;
      } else {
        e.vx += 0.2 * dir;
        let num7 = 3;
        if (e.hp < e.maxHp) num7 += 1;
        if (e.hp < e.maxHp / 2) num7 += 1;
        if (e.hp < e.maxHp / 4) num7 += 1;
        num7 *= (num + 1) / 2;
        e.vx = clamp(e.vx, -num7, num7);
      }
    }
  }

  // ---- 玩家死亡 vs 远离（NPC.cs:19469-19475 / 19709-19721）----
  // 玩家死：仅 noTileCollide=true（无 despawn 无状态切换，AI 继续跑）；
  // 活人曼哈顿 >3000：瞬消（二次判定 TargetClosest 后）
  if (!player) {
    x.noTC = true;
  } else if (Math.abs(e.cx - player.cx) + Math.abs(e.cy - player.cy) > 3000) {
    e.dead = true; e.bossFled = true;
    return;
  }

  // ---- 重力+位移+落地(原版共享物理:noGravity=false → 0.3/2t、maxFall 10) ----
  e.vy = Math.min(e.vy + GRAV, MAX_FALL);
  e.x += e.vx;
  e.y += e.vy;
  if (!x.noTC) collideGround(e, game);
  else e.onGround = false;
}

// ---------------------------------------------------------------------------
// aiStyle 46 挂载头 246(NPC.cs:31273-31499)+ aiStyle 48 自由头 249(NPC.cs:31500-31741)
// ---------------------------------------------------------------------------

export function golemHeadAI(e: Enemy, game: GameHooks, player: Player | null) {
  const x = headXOf(e);
  if (e.vanillaId === 249) x.free = true;   // 直接生成的自由头(原版 NewNPC 249)
  if (!e.bInit) {
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
    e.ai3 = x.free ? 1 : 0;
    e.alphaFade = false;
    x.alpha = x.free ? 0 : 255;             // 249 SetDefaults 无 alpha(:12139-12149)
  }

  // ---- 血尽转换(首行):自由头死=战斗结束全族自毁;挂载头死=转自由态 ----
  if (e.hp <= 0) {
    if (x.free) {
      e.dead = true;
      for (const n of game.enemies() as Enemy[]) {
        if (!n.dead && n !== e && n.vanillaId !== null && n.vanillaId >= 245 && n.vanillaId <= 249) n.dead = true;
      }
      game.spawnParticles(e.cx, e.cy, '#C04030', 20, 3, { life: 40 });
      game.playSfx('roar', 1);
      return;
    }
    golemHeadGoFree(e, game);
  }

  // ---- 属性:自由头按 249 SetDefaults(NPC.cs:12139-12149:damage 80/defense 32) ----
  if (x.free) {
    const free = vanillaNpc(249);
    e.def.damage = free?.damage ?? 80;
    e.def.defense = free?.defense ?? 32;
  } else {
    const b = baseOf(e);
    e.def.damage = b.dmg;
    e.def.defense = b.def;
  }

  // 本体死亡/缺失 → 挂载头转自由态(本体死透后头继续)
  const body = findBody(game);
  if (!x.free && (!body || body.ai3 === 1 || body.hp <= 0)) golemHeadGoFree(e, game);

  const num = balanceNum(game, player);

  if (!x.free && body) {
    // ================= 挂载态 aiStyle 46(NPC.cs:31273-31499) =================
    // noTileCollide = true(:31284);锚点 = 本体.Center + (-3*scale,-57*scale)(:31290-31308)
    const dx = body.cx - 3 * SCALE - e.cx;
    const dy = body.cy - 57 * SCALE - e.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 100) { e.spin = 0; e.vx = dx; e.vy = dy; }        // 100 内整帧贴锚
    else { e.vx = (dx / dist) * 100; e.vy = (dy / dist) * 100; e.spin = e.vx * 0.1; }
    // 渐显(:31310-31317):期间 ai[1]=30
    if (fadeAlpha(e, x) > 0) e.ai1 = 30;

    if (player) {
      if (e.ai0 === 0) {
        // ---- 嘴部火焰弹循环(:31319-31347):300t 一发 proj 258(伤 18 速 8) ----
        e.ai1 += 1;
        if (e.ai1 < 20 || e.ai1 > 280) { e.ai1 += (2 * (num - 1)) / 3; x.l0 = 1; }  // 张嘴帧
        else { e.ai1 += (1 * (num - 1)) / 2; x.l0 = 0; }
        if (e.ai1 >= 300) {
          e.ai1 = 0;
          golemSpit(game, e, player, 0, 10 * SCALE, 8, 18, 258);
        }
      } else if (e.ai0 === 1) {
        // ---- 眼部阶段(:31353-31486):嘴弹伤 24 + 眼激光 259(伤 28) ----
        x.l1 = player.cx < e.cx - e.w ? -1 : player.cx > e.cx + e.w ? 1 : 0;        // localAI[1]
        const num733 = (num + 3) / 4;
        e.ai1 += num733;
        if (e.hp < e.maxHp * 0.4) e.ai1 += num733;
        if (e.hp < e.maxHp * 0.2) e.ai1 += num733;
        x.l0 = e.ai1 < 20 || e.ai1 > 280 ? 1 : 0;
        if (e.ai1 >= 300) {
          e.ai1 = 0;
          golemSpit(game, e, player, x.l1 * 40 * SCALE, 10 * SCALE, 8, 24, 258);
        }
        e.ai2 += num733;
        if (e.hp < e.maxHp / 3) e.ai2 += num733;
        if (e.hp < e.maxHp / 4) e.ai2 += num733;
        if (e.hp < e.maxHp / 5) e.ai2 += num733;
        if (!losClear(game, e.cx, e.cy, player.cx, player.cy)) e.ai2 += 4;          // :31456 无视线催速
        if (e.ai2 > 60 + Math.random() * 600) {
          e.ai2 = 0;
          golemEyeLasers(game, e, player, x.l1);
        }
      }
      // 阶段派生(:31487-31491):血 < 半 → 眼部阶段
      e.ai0 = e.hp < e.maxHp / 2 ? 1 : 0;
    }
  } else {
    // ================= 自由态 aiStyle 48 GolemHeadFree(NPC.cs:31500-31741) =================
    // flag48(:31503-31519):看不到玩家 → 穿墙(flag49 联动弹幕预判;原版判定本体↔玩家视线,
    // 二阶段本体已亡 → 用头↔玩家视线,简化项)
    const noLos = !player || !losClear(game, e.cx, e.cy, player.cx, player.cy);
    if (player) {
      // 悬浮(:31521-31564):目标 = 玩家 + (0,-300),7 速/0.05 步进(符号翻转双步进)
      const dx = player.cx - e.cx, dy = player.cy - 300 - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = accelTo(e.vx, (dx / d) * 7, 0.05);
      e.vy = accelTo(e.vy, (dy / d) * 7, 0.05);
      // 火焰弹节奏(:31566-31595):num761=(num+4)/5;原版按本体残血分档 → 改按头自身血量(简化项)
      const num761 = (num + 4) / 5;
      e.ai1 += num761;
      const r = e.hp / e.maxHp;
      if (r < 0.8) e.ai1 += num761;
      if (r < 0.6) e.ai1 += num761;
      if (r < 0.2) e.ai1 += num761;
      if (r < 0.1) e.ai1 += num761;
      x.l0 = e.ai1 < 20 || e.ai1 > 280 ? 1 : 0;   // 张嘴帧(:31584-31592)
      if (noLos) e.ai1 = 20;                       // :31593-31595 无视线时不蓄满
      if (e.ai1 >= 300) {                          // :31596-31617 嘴弹 proj 258(伤 20 速 8)
        e.ai1 = 0;
        golemSpit(game, e, player, 0, -10 * SCALE, 8, 20, 258);
      }
      // 眼激光节奏(:31618-31658):基数 num,本体残血分档 → 头自身血量(简化项)
      e.ai2 += num;
      if (r < 1 / 1.25) e.ai2 += num;
      if (r < 1 / 1.5) e.ai2 += num;
      if (r < 1 / 2) e.ai2 += num;
      if (r < 1 / 3) e.ai2 += num;
      if (r < 1 / 4) e.ai2 += num;
      if (r < 1 / 5) e.ai2 += num;
      if (r < 1 / 6) e.ai2 += num;
      if (noLos) e.ai2 += num * 10;                // :31646-31651
      if (e.ai2 > 100 + Math.random() * 4800) {
        e.ai2 = 0;
        golemEyeLasersFree(game, e, player, noLos, r);
      }
    }
    // :31721-31740 排焰尘(纯视觉,略)
  }

  e.x += e.vx;
  e.y += e.vy;
}

// ---------------------------------------------------------------------------
// AI_047 石巨人拳 247/248(NPC.cs:19171-19446)
// ---------------------------------------------------------------------------
// 原版 ai[0] 是状态机(0 归位/1 蓄力/2 冲拳/3 直飞);任务约定 ai0=侧别,
// 状态机落在本文件 WeakMap(fistX.state),计时仍用 ai[1]。

export function golemFistAI(e: Enemy, game: GameHooks, player: Player | null) {
  const x = fistXOf(e);
  if (!e.bInit) {
    e.bInit = true;
    e.ai0 = e.vanillaId === 247 ? -1 : 1;   // ai0=侧别(-1 左拳/1 右拳;由本体生成时预置)
    e.ai1 = 0;
    e.alphaFade = false;
    x.alpha = 255;
  }
  const isLeft = e.vanillaId === 247;

  // ---- 锚主:golemBoss 缺失 → 自毁(NPC.cs:19182-19186) ----
  //  本体存活(含死亡演出)→ 锚本体;本体死透 → 锚自由头(任务约定"锚定本体(或头)")
  const body = findBody(game);
  const head = findHead(game);
  const anchor = body && !body.dead ? body : head;
  if (!anchor) { e.dead = true; return; }
  e.master = anchor; // 拳链渲染用（Renderer.drawGolemFistChain，Main.cs:22593-22632）

  const num = balanceNum(game, player);
  // 渐显(:19187-19194):期间 ai[1]=0
  if (fadeAlpha(e, x) > 0) e.ai1 = 0;

  // ---- 肩锚点(:19197-19199):锚主.Center + 锚主.velocity + (±84/78*scale, -9*scale) ----
  const offX = isLeft ? -84 : 78;
  const tx = anchor.cx + anchor.vx + offX * SCALE;
  const ty = anchor.cy + anchor.vy - 9 * SCALE;
  const dx = tx - e.cx, dy = ty - e.cy;
  const dist = Math.hypot(dx, dy);
  e.facing = isLeft ? 1 : -1;               // 镜像朝向(原版贴图方向)

  if (!player) { e.x += e.vx; e.y += e.vy; return; }

  if (x.state === 0) {
    // ---- 归位/待机蓄力(:19202-19270) ----
    x.noTC = true;
    let num3 = 14;
    if (e.hp < e.maxHp / 2) num3 += 3;
    if (e.hp < e.maxHp / 4) num3 += 3;
    if (anchor.hp < anchor.maxHp) num3 += 8;
    num3 *= (num + 3) / 4;
    if (num3 > 32) num3 = 32;
    if (dist < 12 + num3) {
      // 贴肩:整帧速度 = 偏移量(原版 velocity = delta),蓄力计时(:19216-19259)
      e.spin = 0;
      e.vx = dx; e.vy = dy;
      e.ai1 += num;
      if (e.hp < e.maxHp / 2) e.ai1 += num;
      if (e.hp < e.maxHp / 4) e.ai1 += num;
      if (anchor.hp < anchor.maxHp) e.ai1 += 10 * num;
      if (e.ai1 >= 60) {
        // 出拳侧别门(:19244-19256):左拳只在玩家偏左时出、右拳对称
        const sideOk = isLeft ? e.cx + 100 > player.cx : e.cx - 100 < player.cx;
        e.ai1 = 0;
        if (sideOk) x.state = 1;
      }
    } else {
      e.vx = (dx / dist) * num3;
      e.vy = (dy / dist) * num3;
      // 归位朝向(:19260-19262):默认 atan2(-vy,-vx),247 镜像为 atan2(vy,vx)
      e.spin = isLeft ? Math.atan2(e.vy, e.vx) : Math.atan2(-e.vy, -e.vx);
    }
  } else if (x.state === 1) {
    // ---- 蓄力:贴肩 30t(:19271-19332) ----
    e.ai1 += 1;
    e.x = tx - e.w / 2;                     // 原版 base.Center = vector(整帧钉在肩锚)
    e.y = ty - e.h / 2;
    e.spin = 0; e.vx = 0; e.vy = 0;
    if (e.ai1 <= 15) {                      // :19278-19292 聚能尘(粒子近似)
      game.spawnParticles(
        e.cx + (Math.random() - 0.5) * 30, e.cy + (Math.random() - 0.5) * 30,
        '#C8A040', 1, 0.8, { life: 26 });
    }
    if (e.ai1 >= 30) {
      x.noTC = true;
      x.state = 2; e.ai1 = 0;
      // 冲拳速度(:19302-19321):12 + 残血/本体受损加成,×(num+3)/4 钳 48
      let num6 = 12;
      if (e.hp < e.maxHp / 2) num6 += 4;
      if (e.hp < e.maxHp / 4) num6 += 4;
      if (anchor.hp < anchor.maxHp) num6 += 10;
      num6 *= (num + 3) / 4;
      if (num6 > 48) num6 = 48;
      const pdx = player.cx - e.cx, pdy = player.cy - e.cy;
      const pd = Math.hypot(pdx, pdy) || 1;
      e.vx = (pdx / pd) * num6; e.vy = (pdy / pd) * num6;
      // 冲拳朝向(:19325-19328):默认 atan2(vy,vx),247 镜像为 atan2(-vy,-vx)(与归位相反)
      e.spin = isLeft ? Math.atan2(-e.vy, -e.vx) : Math.atan2(e.vy, e.vx);
    }
  } else if (x.state === 2) {
    // ---- 冲拳飞行(:19333-19393) ----
    e.ai1 += 1;
    if (e.ai1 === 1) game.playSfx('roar', 0.4);   // SoundID.Item14(:19344-19346)
    if (e.aiT % 2 === 0) {                        // :19348-19356 焰尾尘(粒子近似)
      game.spawnParticles(e.cx + e.vx * 0.5, e.cy + e.vy * 0.5, '#E08040', 1, 0.6, { life: 20 });
    }
    // 过轴判定(:19363-19388):主轴冲过玩家 → 关穿墙(开始撞墙)
    if (Math.abs(e.vx) > Math.abs(e.vy)) {
      if (e.vx > 0 && e.cx > player.cx) x.noTC = false;
      if (e.vx < 0 && e.cx < player.cx) x.noTC = false;
    } else {
      if (e.vy > 0 && e.cy > player.cy) x.noTC = false;
      if (e.vy < 0 && e.cy < player.cy) x.noTC = false;
    }
    // 离锚 700 → 回位(:19389-19392;撞墙分支在位移后判定)
    if (dist > 700) { x.noTC = true; x.state = 0; }
  } else if (x.state === 3) {
    // ---- 直飞追击(:19394-19446;原版无处置 ai[0]=3 的代码,保留 1:1) ----
    x.noTC = true;
    const pdx = player.cx - e.cx, pdy = player.cy - e.cy;
    const pd = Math.hypot(pdx, pdy) || 1;
    e.vx = accelTo(e.vx, (pdx / pd) * 12, 0.4);
    e.vy = accelTo(e.vy, (pdy / pd) * 12, 0.4);
    e.spin = isLeft ? Math.atan2(-e.vy, -e.vx) : Math.atan2(e.vy, e.vx);
  }

  // ---- 位移(蓄力态已整帧钉锚;冲拳非穿墙段撞墙即回位) ----
  if (x.state !== 1) {
    e.x += e.vx;
    e.y += e.vy;
    if (x.state === 2 && !x.noTC && hitSolid(game, e)) {
      x.noTC = true;
      x.state = 0;                          // :19389-19392 collideX/collideY → 回位
    }
  }
}
