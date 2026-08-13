// 敌怪液体交互 1:1（1.4.5.6 NPC.cs UpdateCollision :93712-93805 + Collision_MoveWhileWet :93986
// + Collision.cs WetCollision :1575 / LavaCollision :1657 + TryRemovingWaterPerishableEffects :94537）。
//
// 原版全量语义（本模块逐条实现）：
//  1. wet 判定 = Collision.WetCollision：**中心小盒**（宽 min(10,w) × 高 min(h/2,h)，居中），
//     而非整包围盒；液体格按液面高度收缩（(256-liquid)/32 ×2px 下探、有效高 16-该值）；
//     坡面格（slope≠0 且上方格有液体）按整格 16px 计。岩浆格同样令 wet=true。
//  2. 永不沾水族（:94252）：(690 且 ai[0]==0) | 72 | aiStyle21 | aiStyle67 | 376 | 579 | 541
//     | (aiStyle7 且 ai[0]==25) → wet 恒 false、wetCount=0；且随后 `if(!wet)` 会把本 tick
//     岩浆判定留下的 lavaWet 一并清掉 → 这族在岩浆里照常受伤但移动不受任何液体减速。
//  3. 出入水 transition（wetCount 10t 去抖，:94280/:94386）：入水/出水瞬间各播一次溅落；
//     出水瞬间 velocity.X *= 0.5（:94381）；620 火把僵尸出水朝上玩家补 vy-=8（:94384）。
//  4. 移动积分（Collision_MoveWhileWet :93986）：wet 时位移 ×factor —— **velocity 本身不变**，
//     只缩位移（TileCollision.moveAndCollide 入口按 liqFactor 缩 dx/dy 同语义）。
//     factor 默认表（NPC.cs:5946-5952）：水 .5 / 岩浆 .5 / 蜂蜜 .25 / 微光 .375；
//     优先级 微光 > 蜂蜜 > 岩浆 > 水（:93748-93762）。例外 = 1f：DD2 族
//     （LazySetLiquidMovementDD2 :18031，类型 548/549/551-578/620）与 612/613（:16810）。
//  5. 入水熄火（TryRemovingWaterPerishableEffects :94537）：wet 且非岩浆 → DelBuff 24(OnFire)
//     与 323(OnFire3)。蜂蜜/微光同样熄火（门只查 lavaWet）。
//  6. 岩浆（Collision_LavaCollision :94513）：lavaWet=true；非 lavaImmune 族 30t 独立冷却
//     （immune[255]）→ AddBuff(24,420) + 50 直伤。
//
// 本仓差异说明：原版 AI() 先跑、UpdateCollision 后跑（AI 读的是上一 tick 的 wet）；
// 本仓 AI 内部自带移动积分，故液体状态在 AI 之后更新，liqFactor 生效于下一 tick——
// 入水首帧差 1 帧全速，量级 <4px，不可感知。AI 分支读 wet 的时序与原版一致。
import { TILE } from '../core/constants';
import type { TileStore } from '../world/TileStore';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { liquidCollision } from '../stats/TouchDamage';
import { NPC_LAVA_IMMUNE } from '../data/npcLavaImmune';

/** Collision.WetCollision（Collision.cs:1575-1656）1:1：中心小盒 + 液面收缩 + 坡上液体。 */
export function wetCollision(
  st: TileStore, px: number, py: number, pw: number, ph: number,
): { wet: boolean; honey: boolean; shimmer: boolean } {
  const TS = TILE;
  let num = 10;                       // 盒宽（>Width 时取 Width）
  let num2 = Math.floor(ph / 2);      // 盒高（>Height 时取 Height）
  if (num > pw) num = pw;
  if (num2 > ph) num2 = ph;
  const vx = px + pw / 2 - num / 2;   // 盒左上（实体中心居中）
  const vy = py + ph / 2 - num2 / 2;
  const i0 = Math.max(0, Math.floor(px / TS) - 1);
  const i1 = Math.min(st.w - 1, Math.floor((px + pw) / TS) + 2);
  const j0 = Math.max(0, Math.floor(py / TS) - 1);
  const j1 = Math.min(st.h - 40, Math.floor((py + ph) / TS) + 2);
  let honey = false;
  let shimmer = false;
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      if (!st.inBounds(i, j)) continue;
      const idx = st.idx(i, j);
      if (st.liquid[idx] > 0) {
        // 液面高度：liquid 255 → 几乎满格；不足时表面下探、有效高收缩（:1609-1616）
        const drop = (256 - st.liquid[idx]) / 32;
        const surfY = j * TS + drop * 2;
        const effH = TS - Math.trunc(drop * 2);
        if (vx + num > i * TS && vx < i * TS + TS && vy + num2 > surfY && vy < surfY + effH) {
          if (st.liquidType[idx] === 3) honey = true;
          if (st.liquidType[idx] === 4) shimmer = true;
          return { wet: true, honey, shimmer };
        }
      } else {
        // 坡面格 + 上方格有液体 → 整格按满高 16 计（:1635-1654）
        if (!st.isActive(i, j) || st.slope[idx] === 0 || j <= 0) continue;
        const above = st.idx(i, j - 1);
        if (st.liquid[above] <= 0) continue;
        if (vx + num > i * TS && vx < i * TS + TS && vy + num2 > j * TS && vy < j * TS + TS) {
          if (st.liquidType[above] === 3) honey = true;
          else if (st.liquidType[above] === 4) shimmer = true;
          return { wet: true, honey, shimmer };
        }
      }
    }
  }
  return { wet: false, honey, shimmer };
}

/** DD2 族液体全速表（LazySetLiquidMovementDD2 调用点反查 SetDefaults：31 处） */
const DD2_FULL_SPEED = new Set<number>([
  548, 549, 620, ...Array.from({ length: 578 - 551 + 1 }, (_, k) => 551 + k),
]);

/** 本 tick 移动积分用液体减速因子（Collision_MoveWhileWet 的 Slowdown 参数）。
 *  dry / 永不沾水族 = 1（走 Collision_MoveWhileDry 不缩位移） */
export function liquidMoveFactor(b: NpcLiquidHost): number {
  if (!b.wet) return 1;
  if (DD2_FULL_SPEED.has(b.vanillaId ?? -1) || b.vanillaId === 612 || b.vanillaId === 613) return 1;
  if (b.shimmerWet) return 0.375;
  if (b.honeyWet) return 0.25;
  if (b.lavaWet) return 0.5;
  return 0.5; // waterMovementSpeed 默认（NPC.cs:5946）
}

/** 永不沾水族（NPC.cs:94252）：wet 恒 false（连带本 tick lavaWet 被清） */
export function skipsWet(b: NpcLiquidHost): boolean {
  const id = b.vanillaId;
  const aiStyle = b.vanilla?.aiStyle ?? -1;
  return (id === 690 && b.ai0 === 0) || id === 72 || aiStyle === 21 || aiStyle === 67
    || id === 376 || id === 579 || id === 541 || (aiStyle === 7 && b.ai0 === 25);
}

/** Enemy 侧液体宿主（结构化窄接口，避免与 Enemy 形成循环依赖） */
export interface NpcLiquidHost {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  cx: number; cy: number;
  vanillaId: number | null;
  vanilla: { aiStyle: number; noGravity?: boolean } | null;
  ai0: number;
  wet: boolean;
  wetCount: number;
  honeyWet: boolean;
  shimmerWet: boolean;
  lavaWet: boolean;
  lavaCd: number;
  onFireT: number;
  onFire3T: number;
  inWater: boolean;
  liqFactor: number;
  def: { boss?: boolean };
  hurt(dmg: number, kx: number, ky: number, game: GameHooks): void;
}

/** 溅落声播放门（NPC.cs:94305-94310 入水 / :94424-94428 出水）：
 *  水栖/浮空/无重力族不播（它们出入水是常态）；615 海豚例外恒播 */
function splashSoundAllowed(b: NpcLiquidHost, entry: boolean): boolean {
  const id = b.vanillaId ?? -1;
  const aiStyle = b.vanilla?.aiStyle ?? -1;
  const noGravity = b.vanilla?.noGravity ?? false;
  const quiet = id === 376 || id === 579 || aiStyle === 1 || id === 1 || id === 16 || id === 147
    || id === 59 || id === 300 || aiStyle === 39 || (!entry && aiStyle === 68)
    || id === 362 || id === 364 || id === 361 || id === 445 || noGravity;
  return !quiet || id === 615;
}

/** NPC.UpdateCollision 液体段 1:1（:93712-93805 + :94513-94560）。
 *  顺序照原版：岩浆判定（受伤）→ 水湿判定（wet/蜂蜜/微光/去抖溅落）→ !wet 清岩浆态 →
 *  熄火 → wetCount 递减 → liqFactor 供本帧之后的移动积分消费 */
export function updateNpcLiquid(b: NpcLiquidHost, game: GameHooks, st: TileStore): void {
  const player = (game as unknown as { player: Player }).player;
  // ---- 1. 岩浆（Collision_LavaCollision :94513）----
  if (b.lavaCd > 0) b.lavaCd--;
  let lava = liquidCollision(st, b.x, b.y, b.w, b.h, 2);
  if (b.vanillaId === 441) lava = false;                  // :94515 type 441 强制豁免
  if (lava) {
    // lavaImmune 只免伤不免 lavaWet（:94524 置位在 !lavaImmune 门之外）——
    // 免疫族入浆同样走岩浆减速档且不熄火
    b.lavaWet = true;
    const lavaImmune = b.vanillaId !== null && NPC_LAVA_IMMUNE.has(b.vanillaId);
    if (!lavaImmune && b.lavaCd <= 0) {
      b.lavaCd = 30;                                      // immune[255] = 30（:94527）
      b.onFireT = Math.max(b.onFireT, 7);                 // AddBuff(24, 420)
      b.hurt(50, 0, 0, game);                             // StrikeNPCNoInteraction(50)
      game.spawnParticles(b.cx, b.cy, '#FF9A3C', 10, 1.6, { life: 30, grav: -0.05 });
    }
  }

  // ---- 2. 水湿（Collision_WaterCollision :94250）----
  const skip = skipsWet(b);
  let flag = false;
  if (skip) {
    b.wetCount = 0;
  } else {
    const r = wetCollision(st, b.x, b.y, b.w, b.h);
    flag = r.wet;
    b.honeyWet = r.honey;
    b.shimmerWet = r.shimmer;
  }
  const wasWet = b.wet;
  if (flag && !wasWet && b.wetCount === 0) {
    b.wetCount = 10;                                      // 入水去抖（:94290）
    if (player && !player.dead && splashSoundAllowed(b, true)) {
      const d = Math.hypot(player.cx - b.cx, player.cy - b.cy);
      const vol = Math.max(0.12, Math.min(1, 1 - d / (TILE * 45))) * (b.def.boss ? 1.2 : 0.9);
      game.playSfx('splash', vol);
    }
  } else if (!flag && wasWet) {
    b.vx *= 0.5;                                          // 出水横向衰减（:94381）
    if (b.vanillaId === 620 && player && player.cy < b.cy) b.vy -= 8; // :94384
    if (b.wetCount === 0) {
      b.wetCount = 10;                                    // 出水去抖（:94388）
      if (player && !player.dead && splashSoundAllowed(b, false)) {
        const d = Math.hypot(player.cx - b.cx, player.cy - b.cy);
        const vol = Math.max(0.12, Math.min(1, 1 - d / (TILE * 45))) * (b.def.boss ? 1.2 : 0.9);
        game.playSfx('splash', vol);
      }
    }
  }
  b.wet = flag;
  // ---- 3. !wet 清液体类型态（:93729-93733）----
  if (!b.wet) {
    b.lavaWet = false;
    b.honeyWet = false;
    b.shimmerWet = false;
  }
  // ---- 4. 入水熄火（TryRemovingWaterPerishableEffects :94537，门 = flag 且非岩浆）----
  if (flag && !lava) {
    b.onFireT = 0;                                        // DelBuff(24)
    b.onFire3T = 0;                                       // DelBuff(323)
  }
  if (b.wetCount > 0) b.wetCount--;                       // :93734
  b.inWater = b.wet;                                      // 兼容旧字段
  // ---- 5. 移动积分因子（:93748-93762 优先级链）----
  b.liqFactor = liquidMoveFactor(b);
  // ---- 6. wet 落速帽（UpdateNPC_UpdateGravity :91936-91944）----
  // 原版 wet 时重力 0.3→0.2 且 maxFallSpeed 10→7（蜂蜜 0.1/4、微光 0.15/5.5；
  // 岩浆走水档 else 分支）。本仓各 AI 内联 GRAVITY=0.4（全仓既有偏差，不逐点改），
  // 这里补落速帽——配合 liqFactor ×0.5 位移后有效下沉 ≤3.5px/t，与原版同档
  if (b.wet) {
    const cap = b.shimmerWet ? 5.5 : b.honeyWet ? 4 : 7;
    if (b.vy > cap) b.vy = cap;
  }
}
