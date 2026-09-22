// 弹体 CutTiles 共享助手（Projectile.Damage→CutTiles :12517/:15276 全仓单点）。
//
// 原版语义：friendly 玩家弹（!npcProj && !minion && type!=1054）每 tick 在 Damage()
// 内旁路调 CutTiles()——扫弹盒（CutTilesAt :15354-15405,右/下 +1 是【循环排除界】,
// 末含格=(int)((x+w)/16),见 cutTilesBox 注）把 Main.tileCut 格 KillTile。
// 门 = CanCutTiles(:15407)：aiStyle 45/137/92/105/106、
// 高尔夫球与排除型 {463,69,70,621,10,11,379,407,476,623,625..628,833..835,818,831,
// 820,864,970,995,908,1020,1105,1040}，尾支 return type!=1091；外层再套
// Damage_CanDealDamage(:12461) 排除表（如 535 无条件不结算【Damage() 整缺=不砍,
// ★BJ285-①勘误:旧注"535 前 30t"系 537 之误——(type==537&&localAI[0]<=30f) 才是
// 条件支,535 在 :12463 表内无条件】/ 1092 ai0≤1 段不结算=不砍）。
// **调用方自证**本弹型两道门都过——瓦罐(sheet28,非实心)/杂草等非实心可砍物全靠这条
// 旁路破坏；"撞实心才消亡"的移植惯用式对此全程漏砍（2026-08-26 冰川之牙用户报）。
import { TILE } from '../core/constants';
import type { GameHooks } from './types';

/** 弹盒(+1 外沿)逐格上报 game.cutTile（pot→smashPot 路由在 Game.cutTile，
 *  非 tileCut 格在其内部零操作，调用侧无需自筛）。
 *  ★SW-BJ67（2026-09-14）vid 穿线（最小刀）：Projectile.CutTiles 逐型豁免面
 *  （P.cs:15391-15393 `type==1047 && tile.type==231 → flag=false` 滚过幼虫不召
 *  蜂王;1458 :15392 同）需要弹型上下文——vid 由中央收口/调用侧传入,缺省
 *  undefined = 旧无型语义（全部既有调用方零变化）。
 *  ★债刀-4 ②（2026-09-17）1052 Axearang 加砍面穿线：CutTilesAt :15384-86
 *  （1458 :15386-88 同）`type==1052 && ai[0]==0` → flag 并入 IsATreeTrunk∪{323}。
 *  type 位=vid（第 6 参）,ai[0]==0 位=出程旗（第 7 参,由载体 Boomerang
 *  cutExtraTreeCactus 提供——缺省 false=非 1052 调用方零变化;Game.cutTile 收口处
 *  对 vid==1052 重验,type/ai0 两因不因穿线拆散）。 */
export function cutTilesBox(game: GameHooks, x: number, y: number, w: number, h: number,
  vid?: number, extraCutTreeCactus?: boolean): void {
  // ★SW-BJ88（2026-09-15）债4②：右/下边界对齐（CutTilesAt P.cs:15356-15359 +
  //  :15377/:15379 直译;1458 :15357 同,逐字对拍 2026-09-15）——原版
  //  `num2=(int)((x+w)/16)+1` 后循环【i < num2】= +1 是排除界,末含格 =
  //  (int)((x+w)/16);旧仓 `<= x1` 把 +1 当含端再吃一遍 → 右/下各多割 1 列/行
  //  （31 宽盒 x=104 曾割到第 9 列 [144,160),盒右缘 135 根本不触）。
  //  对齐后：非对齐缘=恰覆盖半格尾格;盒缘恰落在格界时含界上格（:15357 原版
  //  字面）。近战侧 mowCutTiles（Game.ts,ItemCheck_CutTiles :45024-45029 同为
  //  排除界）末含格=trunc((y+h)/16) 本就正确,唯此弹侧助手双计 +1。
  //  原版 num<0/num2>maxTilesX 钳制（:15360-15375）由 game.cutTile 内界外零操作
  //  等价承载,不另设钳。
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w) / TILE) + 1;
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h) / TILE) + 1;
  for (let ix = x0; ix < x1; ix++) {                   // i < num2（:15377 排除界,勿回改 <=）
    for (let iy = y0; iy < y1; iy++) game.cutTile?.(ix, iy, vid, extraCutTreeCactus);   // j < num4（:15379）
  }
}
