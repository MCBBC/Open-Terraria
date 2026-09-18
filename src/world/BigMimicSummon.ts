// 宝箱怪召唤链（光明钥匙/夜光钥匙 × 空宝箱 → 对应大宝箱怪）
//
// 权威（Terarria1457；1458 对拍 = NPC.cs:78295-78400 与 Player.cs:28981-29000 区间
// diff 零变更）：
//   NPC.BigMimicSummonCheck    NPC.cs:78318-78400 —— 判定/销毁/生成全链
//   NPC.BigMimicSpawnSmoke     NPC.cs:78295-78316 —— 20 尘 54 + 6 gore 99
//   Player.ChestChangeEvents   Player.cs:28983-29001 —— 关箱拍触发（Update :25581 每 tick）
//
// 机制（1.4.4）：宝箱内除【恰好 1 堆叠】钥匙外全空 → 关箱时销毁宝箱（钥匙随箱消耗，
// 物品不清落）→ 原位生成：
//   Key of Light  (3092) → Hallowed Mimic (475)
//   Key of Night  (3091) → Corrupt Mimic (473，腐化世界) / Crimson Mimic (474，猩红世界)
//
// 门与细节（逐式）：
//   - Main.hardMode 门（:78320）
//   - Chest.FindChest 精确坐标（:78323，Chest.cs:507）
//   - 统计面（:78330-78350）：TileID.Sets.BasicChest = {21,467}（TileID.cs:315）；
//     tile 21 排除 frameX/36 ∈ {5,6}（fx 180-254 特殊箱段，原文排除照录）；
//     其他物品计数 num4 必须为 0（空箱），两把钥匙同放（2+1 堆叠合计≠1）不触发
//   - 校正箱左上（:78352-78356 frameX/frameY %36）
//   - 先清 items 再 DestroyChest（:78359-78366；Chest.cs:619 DestroyChest 空箱门）
//   - 清 2×2 箱 tile（:78367-78376，逐格 BasicChest 判定 ClearTile）
//   - msg34 箱移除 / SendTileSquare / msg23 NPC 广播：本仓 TileStore.setTile 自带
//     netReporter 联机 tile 面、enemies 走房主权威快照；chest 槽位广播缺口登记债
//   - NewNPC(x*16+16, y*16+32)（:78392）= Bottom 锚（NPC.cs:81598 Bottom=(X,Y)）
//     → 本仓 fromVanilla 盒心锚：调用方 spawnMimic 内 y 上移半盒
import type { ChestData } from './World';
import { TILE_DEFS } from '../data/tiles';
import { ITEM_DEFS } from '../data/items';
import { viIdFromKey } from '../data/vanillaItemCombat';

export interface BigMimicBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BigMimicSummonEnv {
  store: import('./TileStore').TileStore;
  hardMode: boolean;
  /** WorldGen.crimson（World.ts:426；true=猩红 false=腐化） */
  crimson: boolean;
  /** Chest.FindChest 等价（Game.findChest：chests 按 (x,y) 精确匹配） */
  findChest(x: number, y: number): ChestData | null;
  /** Chest.DestroyChest 尾 RemoveChest 等价（Chest.cs:619 → world.chests 重赋） */
  removeChest(c: ChestData): void;
  /** spawnVanillaEnemy 等价（已按原版 NewNPC Bottom=(X,Y) 锚落位）；返回实例供烟效取盒 */
  spawnMimic(npcId: number, bottomX: number, bottomY: number): BigMimicBox | null;
  markDirtyArea(x0: number, y0: number, x1: number, y1: number): void;
  smoke(box: BigMimicBox): void;
}

/** TileID.Sets.BasicChest = Factory.CreateBoolSet(21, 467)（TileID.cs:315） */
const isBasicChestSheet = (sheet: number): boolean => sheet === 21 || sheet === 467;

/** NPC.BigMimicSummonCheck（NPC.cs:78318-78400）1:1。
 *  返回 true = 已生成（测试判别面；原版恒返回 false，bool 返回值无消费方）。 */
export function bigMimicSummonCheck(env: BigMimicSummonEnv, x: number, y: number): boolean {
  const st = env.store;
  if (!env.hardMode) return false; // !Main.hardMode（:78320；netMode==1 门在 Game 壳）
  const c = env.findChest(x, y);
  if (!c) return false; // Chest.FindChest（:78323）

  const tileAt = (tx: number, ty: number): { sheet: number; fx: number; fy: number } => {
    const i = st.idx(tx, ty);
    return { sheet: TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1, fx: st.frameX[i], fy: st.frameY[i] };
  };
  if (!st.inBounds(c.x, c.y)) return false;
  const t0 = tileAt(c.x, c.y); // Main.tile[chest.x, chest.y]（:78331-78332）
  if (!isBasicChestSheet(t0.sheet)) return false;

  // 统计（:78334-78350）：num2=光明钥匙堆叠 / num3=夜光钥匙堆叠 / num4=其他物品数
  let light = 0;
  let night = 0;
  let other = 0;
  const style0 = Math.floor(t0.fx / 36);
  for (const it of c.items) {
    if (!it || !(it.stack > 0)) continue; // item != null && type > 0
    if (t0.sheet !== 21 || style0 < 5 || style0 > 6) {
      if (vidOfItem(it) === 3092) light += it.stack;
      else if (vidOfItem(it) === 3091) night += it.stack;
      else other++;
    }
  }
  if (other !== 0 || light + night !== 1) return false; // （:78351）空箱 + 恰好 1 堆叠钥匙

  // 校正箱左上（:78352-78356）
  if (st.inBounds(x, y)) {
    const t = tileAt(x, y);
    if (t.fx % 36 !== 0) x--;
    if (t.fy % 36 !== 0) y--;
  }
  // 清 items（:78359-78365，chest2 = 入参 findChest 的箱——原版 number 死变量、chest2=Main.chest[num]）
  c.items = c.items.map(() => null);
  // Chest.DestroyChest（:78366，Chest.cs:619 —— 先清空再毁）→ RemoveChest
  const destroyed = env.findChest(x, y) ?? c;
  env.removeChest(destroyed);
  // 清 2×2 箱 tile（:78367-78376）
  for (let k = x; k <= x + 1; k++) {
    for (let l = y; l <= y + 1; l++) {
      if (!st.inBounds(k, l)) continue;
      const sheet = TILE_DEFS[st.type[st.idx(k, l)]]?.vanilla?.sheet ?? -1;
      if (isBasicChestSheet(sheet)) st.setTile(k, l, 0); // ClearTile（清帧/漆/致动位同口径）
    }
  }
  env.markDirtyArea(x - 1, y - 1, x + 2, y + 2);
  // （:78388-78390）msg34(number2 = 校正后 tile==467 ? 5 : 1, x, y, number)+SendTileSquare(3)：
  //   chest 槽位移除广播本仓未接（登记债）；tile 面经 setTile netReporter 联机同步。
  // 生成（:78391-78396）：光明 → 475；夜光 → 腐化世界 473 / 猩红世界 474
  const npcId = night === 1 ? (env.crimson ? 474 : 473) : 475;
  const e = env.spawnMimic(npcId, x * 16 + 16, y * 16 + 32);
  // （:78398-78399）msg23 NPC 广播：enemies 走房主权威快照（netPuppet），无需单发。
  if (e) env.smoke(e); // BigMimicSpawnSmoke（:78400）
  return true;
}

/** NPC.BigMimicSpawnSmoke（NPC.cs:78295-78316）1:1：
 *  20× 尘 54（α50, scale1.5, noGravity, velocity×2）+ 3×2 gore 99（scale1.1, velocity×0.3）。
 *  （netMode==2 的 SendData(51) 支：粒子面本仓各端自渲，登记债） */
export function bigMimicSpawnSmoke(
  spawnDust: (
    x: number, y: number, w: number, h: number, type: number,
    speedX: number, speedY: number, alpha: number,
    color: { r: number; g: number; b: number; a: number } | null,
    scale: number,
  ) => { vx: number; vy: number; noGravity?: boolean } | null,
  newGore: (type: number, x: number, y: number, vx: number, vy: number, scale: number) => { vx: number; vy: number } | null,
  e: BigMimicBox,
): void {
  for (let i = 0; i < 20; i++) {
    const d = spawnDust(e.x, e.y, e.w, e.h, 54, 0, 0, 50, null, 1.5);
    if (d) {
      d.vx *= 2;
      d.vy *= 2;
      d.noGravity = true;
    }
  }
  for (let j = 0; j < 3; j++) {
    for (let k = 0; k < 2; k++) {
      const g = newGore(99, e.x + e.w * j * 0.45 - 20, e.y + e.h * k * 0.5 + 10, 0, 0, 1.1);
      if (g) {
        g.vx *= 0.3;
        g.vy *= 0.3;
      }
    }
  }
}

/** 箱内物品 → 原版 vid（Game.slotVanillaId 同源：ITEM_DEFS key → viIdFromKey） */
function vidOfItem(it: { id: number; stack: number }): number {
  return viIdFromKey(ITEM_DEFS[it.id]?.key ?? '');
}
