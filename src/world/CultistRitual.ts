// 拜月教仪式驱动（Terraria.GameContent.Events/CultistRitual.cs 1:1）
//  石巨人+骷髅王后:地牢门口延时出现神秘石碑 437(教徒仪式) → 玩家打碑召拜月教邪教徒
//  439 → 四塔 → 月总。此前本仓 437 无生成入口(下游 AI/四塔/月总全就绪但进度链断,
//  2026-08-13 接通)。
//  常量:delayStart=86400(24 游戏时)/respawnDelay=43200(打完一轮重置)/recheck=600
//  (AnyDanger ×6)。delay 存档(World.cultistDelay,WldParser 已读),recheck 运行时态。
import type { GameHooks } from '../entities/types';
import { TILE } from '../core/constants';
import { ritualCheckFloor } from '../entities/bossAI_lunar_misc';
import { spawnVanillaEnemy } from '../entities/bossAI';
import { canHit } from '../physics/LineOfSight';

export const CULTIST_DELAY_START = 86400;
export const CULTIST_RESPAWN_DELAY = 43200;
let recheck = 0;

/** Main.cs:64427 CultistRitual.UpdateTime()——每帧随 dayRate 递减双计时 */
export function cultistRitualUpdate(game: GameHooks, dayRate: number): void {
  const w = game.world;
  if (w.cultistDelay > 0) w.cultistDelay = Math.max(0, w.cultistDelay - dayRate);
  recheck = Math.max(0, recheck - dayRate);
  if (w.cultistDelay !== 0 || recheck !== 0) return;
  recheck = 600;
  const danger = (game.enemies() as Array<{ dead?: boolean }>).some((en) => !en.dead);
  if (danger) recheck *= 6;
  else trySpawning(game, w.dungeonX, w.dungeonY);
}

/** NPC.cs:38881 石碑召出 439 后重置(delay=43200) */
export function cultistTabletDestroyed(game: GameHooks): void {
  game.world.cultistDelay = CULTIST_RESPAWN_DELAY;
}

/** CultistRitual.TrySpawning(x,y)——视线/进度/站位四门,过则生成 437 */
export function trySpawning(game: GameHooks, x: number, y: number): boolean {
  const w = game.world;
  if (x < 0 || y < 0 || x >= w.store.w || y >= w.store.h) return false;
  // PlayerLOS(x±6,y):玩家正看着地牢口 → 不打扰
  const p = game.player;
  if (p && !p.dead) {
    // PlayerLOS(x±6,y):视线盒近似(玩家盒 ↔ 地牢口 ±6 格 1×1 盒)
    if (canHit(w.store, p.x, p.y, p.w, p.h, (x - 6) * TILE, y * TILE, TILE, TILE)
      || canHit(w.store, p.x, p.y, p.w, p.h, (x + 6) * TILE, y * TILE, TILE, TILE)) return false;
  }
  // CheckRitual:进度门 + 上方 7 格净空 + 无 437 在场 + 四锚站位
  if (w.cultistDelay !== 0 || !w.flags.hardMode
    || !w.flags.downedGolemBoss || !w.flags.downedSkeletron) return false;
  if (y < 7 || (y - 7) < w.store.h && w.store.isSolid(x, y - 7)) return false;
  const has437 = (game.enemies() as Array<{ vanillaId?: number; dead?: boolean }>)
    .some((en) => !en.dead && en.vanillaId === 437);
  if (has437) return false;
  const pts = ritualCheckFloor(game, x * TILE + 8, y * TILE - 64 - 8 - 27);
  if (!pts) return false;
  // spawnVanillaEnemy 是 Bottom 锚:源版 NewNPC 顶锚 (x*16+8,(y-4)*16-8),+ 高 54 换底
  const tablet = spawnVanillaEnemy(game, 437, x * TILE + 8 - 27, (y - 4) * TILE - 8 + 54);
  return !!tablet;
}
