// SW-K1 2026-09-03：CanKillTile 消费面三件回归（TileStore 演算,不实例化 Game）。
// ① Wiring.canKillTile 全式（Wiring.cs:1428/:3227 调全函数——四支子集退役）
// ② 割草机 MowingTheGrass 语境（WorldGen.cs:62693-62704:2/109 恒真先于全函数体）
// ③ Dirt Rod 目标表（Player.cs:53167）+ 弹 17 亡格铺设（Projectile.cs:79239-79290）
import { describe, expect, it } from 'vitest';
import { canKillTileAt, type KillTileCtx } from '../src/entities/Mounts';
import { chestDestroyableAt, canKillTileMowingAt, mowedSheetOf, isDirtRodTargetSheet } from '../src/core/Game';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { dirtBallDepositTile, blockBelowMakesSandFallAt } from '../src/entities/DirtBallProj';
import type { ChestData } from '../src/world/World';

const S = (sh: number) => TILE_INTERNAL_BY_SHEET.get(sh)!;
const ctx = (chests: ChestData[] = []): KillTileCtx => ({
  hardMode: true,
  chestDestroyable: (cx: number, cy: number) => chestDestroyableAt(chests, cx, cy),
});
const mkWiring = (st: TileStore, chests: ChestData[]) => {
  const w = new Wiring(st);
  w.killTileCtxProvider = () => ctx(chests);
  return w;
};
const chest = (x: number, y: number): ChestData =>
  ({ x, y, items: [{ id: 754, stack: 5 }] }) as ChestData;

describe('SW-K1 CanKillTile 消费面三件', () => {
  it('Wiring 全式四支：巨石压箱/锁门/传送器上有物/非空箱拒;树干承载保留', () => {
    const st = new TileStore(32, 32);
    const chests = [chest(11, 9), chest(4, 4)];
    const w = mkWiring(st, chests);
    for (const [dx, dy, fx, fy] of [[0, 0, 0, 0], [1, 0, 18, 0], [0, 1, 0, 18], [1, 1, 18, 18]] as const)
      st.setTile(10 + dx, 10 + dy, S(138), fx, fy);            // 巨石 2×2 @10,10
    st.setTile(11, 9, S(21));                                  // 非空箱压巨石右半
    expect(w.canKillTile(11, 10)).toBe(false);                 // Boulders+CheckBoulderChest 支
    st.setTile(11, 9, 0);
    st.setTile(6, 6, S(10), 0, 594);                           // 神庙锁门（frameY∈[594,646] 关闭态）
    expect(w.canKillTile(6, 6)).toBe(false);
    st.setTile(6, 6, S(10), 0, 648);                           // 出锁段 → 可杀
    expect(w.canKillTile(6, 6)).toBe(true);
    st.setTile(14, 12, S(235), 0, 0);
    st.setTile(15, 11, S(21));                                 // 传送器上方 3 格扫到容器
    expect(w.canKillTile(14, 12)).toBe(false);
    st.setTile(4, 4, S(21));                                   // 锚格登记非空 → CanDestroyChest 拒
    expect(w.canKillTile(4, 4)).toBe(false);
    chests[1] = { x: 4, y: 4, items: [null] } as ChestData;    // 清空 → 放行
    expect(w.canKillTile(4, 4)).toBe(true);
    st.setTile(20, 8, S(5), 0, 0);                             // 上邻树干（子集既有行为不回退）
    st.setTile(20, 9, S(1));
    expect(w.canKillTile(20, 9)).toBe(false);
  });

  it('割草机 MowingTheGrass：草/神圣草恒真（压箱也割）,其余格走全函数门', () => {
    const st = new TileStore(32, 32);
    const chests = [chest(8, 4)];
    const w = mkWiring(st, chests);
    st.setTile(8, 4, S(21));                                   // 箱压草（全函数会拒）
    st.setTile(8, 5, S(2));
    expect(canKillTileAt(st, 8, 5, ctx(chests))).toBe(false);  // 全函数：上邻承载位 → false
    expect(canKillTileMowingAt(st, 8, 5, ctx(chests))).toBe(true); // 语境 2/109 早返
    st.setTile(8, 5, S(109));                                  // 神圣草同款
    expect(canKillTileMowingAt(st, 8, 5, ctx(chests))).toBe(true);
    st.setTile(8, 5, S(10), 0, 594);                           // 锁门非草 → 落全函数拒
    expect(canKillTileMowingAt(st, 8, 5, ctx(chests))).toBe(false);
    st.setTile(8, 4, 0);                                       // 撤箱:泥土无承载保护 → 全函数放行
    st.setTile(8, 5, S(0));
    expect(canKillTileMowingAt(st, 8, 5, ctx(chests))).toBe(true);
    expect(w.canKillTile(8, 5)).toBe(true);
    expect(mowedSheetOf(2)).toBe(477);                         // Player.cs:20522-20532 转换表
    expect(mowedSheetOf(109)).toBe(492);
    expect(mowedSheetOf(1)).toBe(0);
  });

  it('Dirt Rod：目标表 {0,2,23,109,199,477,492} 与弹 17 亡格铺设', () => {
    const st = new TileStore(32, 32);
    for (const sh of [0, 2, 23, 109, 199, 477, 492]) expect(isDirtRodTargetSheet(sh)).toBe(true);
    for (const sh of [1, 5, 10, 21]) expect(isDirtRodTargetSheet(sh)).toBe(false);
    st.setTile(10, 11, S(1));                                  // 落点空+下方实心 → 可铺
    expect(dirtBallDepositTile(st, 10 * 16 + 8, 10 * 16 + 8, 0, 3))
      .toEqual({ tx: 10, ty: 10, occupied: false, blocked: false });
    expect(blockBelowMakesSandFallAt(st, 10, 10)).toBe(false);
    expect(dirtBallDepositTile(st, 10 * 16 + 8, 10 * 16 + 8 + 16, 0, 3).occupied).toBe(true);
    st.setTile(20, 11, S(314), 0, 0);                          // 下方轨道 314 → flag2 拒铺
    expect(dirtBallDepositTile(st, 20 * 16 + 8, 10 * 16 + 8, 0, 3).blocked).toBe(true);
    st.setTile(14, 12, S(1));                                  // 半砖上推：vy 主导 → 上一行
    st.setHalfBrick(14, 12, true);
    expect(dirtBallDepositTile(st, 14 * 16 + 8, 12 * 16 + 8, 0, 3))
      .toEqual({ tx: 14, ty: 11, occupied: false, blocked: false });
    st.setTile(24, 11, S(1));                                  // 下格实心+再下空 → 中间支不触发
    expect(blockBelowMakesSandFallAt(st, 24, 10)).toBe(false);
    st.setTile(24, 11, 0);                                     // 下格 !nactive → SandFall 真
    expect(blockBelowMakesSandFallAt(st, 24, 10)).toBe(true);
  });
});
