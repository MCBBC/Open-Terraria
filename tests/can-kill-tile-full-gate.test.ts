// SW-G1 2026-09-03：CanKillTile 全函数门回归（WorldGen.cs:62716-62810）。演算面 =
// Mounts.canKillTileAt（钻头链同源 1:1 全式）+ Game.chestDestroyableAt，与
// Game.canKillTile 委托同参，不实例化 Game。方向权威：CheckBoulderChest 查巨石
// 锚点上行两格（cs:49232 num2-1；2×2 锚点公式同 BoulderMech cs:48824）——容器在【上】。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canKillTileAt } from '../src/entities/Mounts';
import { chestDestroyableAt } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import type { ChestData } from '../src/world/World';

const S = (sh: number) => TILE_INTERNAL_BY_SHEET.get(sh)!;
const ctx = (chests: ChestData[] = []) => ({
  hardMode: true,
  chestDestroyable: (cx: number, cy: number) => chestDestroyableAt(chests, cx, cy),
});
const boulder = (st: TileStore, ax: number, ay: number) => {
  for (const [dx, dy, fx, fy] of [[0, 0, 0, 0], [1, 0, 18, 0], [0, 1, 0, 18], [1, 1, 18, 18]] as const)
    st.setTile(ax + dx, ay + dy, S(138), fx, fy);
};

describe('CanKillTile 全函数门（SW-G1 2026-09-03）', () => {
  it('wall350 魔法冰墙格拒绝；普通墙放行（:62733-62735）', () => {
    const st = new TileStore(32, 32);
    st.setTile(5, 5, S(1));
    st.setWall(5, 5, 350);
    expect(canKillTileAt(st, 5, 5, ctx())).toBe(false);
    st.setWall(5, 5, 1);
    expect(canKillTileAt(st, 5, 5, ctx())).toBe(true);
  });

  it('Boulders+CheckBoulderChest：上邻两格容器（右半）→ 四成员格全拒；容器在下不拦（:49216/:62748）', () => {
    const st = new TileStore(32, 32);
    boulder(st, 10, 10);
    st.setTile(11, 9, S(21));                                   // 箱压巨石右半（只走 Boulders 支）
    for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11]])
      expect(canKillTileAt(st, x, y, ctx())).toBe(false);
    st.setTile(11, 9, 0);
    st.setTile(11, 12, S(21));                                  // 箱在巨石下方 = 无保护（源查上行两格）
    expect(canKillTileAt(st, 10, 10, ctx())).toBe(true);
  });

  it('上邻保护族不回退 + case 10 锁门 + case 21 箱内容（:62739-62765/:62781-62794）', () => {
    const st = new TileStore(32, 32);
    st.setTile(8, 5, S(1)); st.setTile(8, 4, S(5), 0, 0);       // 干基在顶
    expect(canKillTileAt(st, 8, 5, ctx())).toBe(false);
    st.setTile(8, 4, S(5), 66, 0);                              // 分支帧豁免（fx66/fy0-44）
    expect(canKillTileAt(st, 8, 5, ctx())).toBe(true);
    st.setTile(6, 6, S(10), 0, 594);                            // 神庙锁门
    expect(canKillTileAt(st, 6, 6, ctx())).toBe(false);
    st.setTile(6, 6, S(10), 0, 648);                            // 开锁帧出锁段
    expect(canKillTileAt(st, 6, 6, ctx())).toBe(true);
    st.setTile(12, 12, S(21));
    expect(canKillTileAt(st, 12, 12, ctx([{ x: 12, y: 12, items: [{ id: 754, stack: 5 }] }]))).toBe(false);
    expect(canKillTileAt(st, 12, 12, ctx([{ x: 12, y: 12, items: [null] }]))).toBe(true);
  });

  it('挖掘面重锚在位：Game.ts 消费 canKillTile ×7，镐/斧/锤面不再直挂 tileAboveProtected', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    // SW-K1 2026-09-03：+1 = Dirt Rod 使用链（useDirtRod 光标格 CanKillTile 全函数门,
    // Player.cs:52946）;割草机 MowingTheGrass 语境走 canKillTileMowingAt 包装不入计数
    // ★X2 重锚（2026-10-01）:6→7——BJ324（028ecf65,2026-09-24）活板门移植
    //  toggleTrapdoor 关门件可毁检查 canKill 闭包（原版 :51990-51992）入账
    expect(src.match(/\bthis\.canKillTile\(/g)?.length).toBe(7);
    expect(src).not.toContain('this.tileAboveProtected(tx, ty)');   // 挖掘面门点全重锚
    expect(src).toContain('this.tileAboveProtected(x, y)');         // breakTile 头 CheckTileBreakability 门保留
  });
});
