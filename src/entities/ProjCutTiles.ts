// 弹体 CutTiles 共享助手（Projectile.Damage→CutTiles :12517/:15276 全仓单点）。
//
// 原版语义：friendly 玩家弹（!npcProj && !minion && type!=1054）每 tick 在 Damage()
// 内旁路调 CutTiles()——扫弹盒（CutTilesAt :15454，右/下各 +1 外沿、循环含端）把
// Main.tileCut 格 KillTile。门 = CanCutTiles(:15407)：aiStyle 45/137/92/105/106、
// 高尔夫球与排除型 {463,69,70,621,10,11,379,407,476,623,625..628,833..835,818,831,
// 820,864,970,995,908,1020,1105,1040}，尾支 return type!=1091；外层再套
// Damage_CanDealDamage(:12461) 排除表（如 535 前 30t / 1092 ai0≤1 段不结算=不砍）。
// **调用方自证**本弹型两道门都过——瓦罐(sheet28,非实心)/杂草等非实心可砍物全靠这条
// 旁路破坏；"撞实心才消亡"的移植惯用式对此全程漏砍（2026-08-26 冰川之牙用户报）。
import { TILE } from '../core/constants';
import type { GameHooks } from './types';

/** 弹盒(+1 外沿)逐格上报 game.cutTile（pot→smashPot 路由在 Game.cutTile，
 *  非 tileCut 格在其内部零操作，调用侧无需自筛） */
export function cutTilesBox(game: GameHooks, x: number, y: number, w: number, h: number): void {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w) / TILE) + 1;
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h) / TILE) + 1;
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) game.cutTile?.(ix, iy);
  }
}
