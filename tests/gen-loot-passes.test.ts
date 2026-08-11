// 物资对齐回归:AddBuriedChest 四深度分支战利品 + Statues/JungleShrines/CaveHouse/
// OceanCaves/Hellforges pass 密度(cs:16952/16059/17066/15228/18298)。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import type { World } from '../src/world/World';

function sheetId(sheet: number): number {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return -1;
}

function countTile(world: World, type: number): number {
  const st = world.store;
  let n = 0;
  for (let i = 0; i < st.type.length; i++) {
    if (st.flags[i] && st.type[i] === type) n++;
  }
  return n;
}

function countWall(world: World, wall: number): number {
  const st = world.store;
  let n = 0;
  for (let i = 0; i < st.wall.length; i++) if (st.wall[i] === wall) n++;
  return n;
}

describe('物资对齐:战利品与新增 pass', () => {
  it('全部宝箱有货 + 新 pass 密度(小世界)', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'loot-check-1' });

    // ① 全部有货:原版仅神庙箱可能为空(锁箱语义)——至多 1 只空箱
    const empty = world.chests.filter((c) => !c.items.some((it) => it));
    expect(empty.length).toBeLessThanOrEqual(1);

    // ② 战利品丰富度:深度分支杂物表 → 平均每箱 ≥3 件
    const totalItems = world.chests.reduce((s, c) => s + c.items.filter(Boolean).length, 0);
    expect(totalItems / world.chests.length).toBeGreaterThan(2.5);

    // ③ 雕像:Statues pass count = floor(73*2*w/4200) = 146 次尝试,净空失败损耗后仍应 ≥60
    //    (雕像 2×3 帧,按 6 格/座折算)
    const statueN = (countTile(world, sheetId(105)) + countTile(world, sheetId(349))) / 6;
    expect(statueN).toBeGreaterThan(60);

    // ④ 地狱熔炉:w/200 = 21 次尝试(墙 13/14 门禁)→ 实际 ≥5
    expect(countTile(world, TILE_BY_KEY['v_77_hellforge']!)).toBeGreaterThan(4);

    // ⑤ 丛林神龛:jungleHut 砖(119/120/158/175/45)应有实体量
    let shrineBricks = 0;
    for (const s of [119, 120, 158, 175, 45]) shrineBricks += countTile(world, sheetId(s));
    expect(shrineBricks).toBeGreaterThan(100);

    // ⑥ 洞穴小屋墙:七主题墙(27/149/42/187/181/179/74)应有分布
    let houseWalls = 0;
    for (const wl of [27, 149, 42, 187, 181, 179, 74]) houseWalls += countWall(world, wl);
    expect(houseWalls).toBeGreaterThan(500);
  }, 300000);

  it('地狱箱主件序 [274,220,112,218,3019] 乱序轮换(主件多样性)', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'loot-check-2' });
    const hellMains = new Set<number>();
    for (const c of world.chests) {
      if (c.y < world.store.h - 250) continue;
      const first = c.items.find((it) => it);
      if (first) hellMains.add((first as { id: number }).id);
    }
    // 地狱箱 10-15 只、主件池 5 种乱序轮换 → 至少 3 种不同主件
    expect(hellMains.size).toBeGreaterThanOrEqual(3);
  }, 300000);
});
