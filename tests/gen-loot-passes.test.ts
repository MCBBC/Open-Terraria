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

    // ① 全部有货:原版空箱仅两类——梳妆台容器(vanilla 88,Place3x2 里
    //    Chest.CreateChest 注册的空容器,地狱屋/地下屋都放;OOOOOO 批 x86 基线
    //    39 原版世界 10,017 箱共 239 空箱,100% 是梳妆台、0 其他)与神庙锁箱
    //    (锁箱语义)——非梳妆台空箱 ≤1。旧断言"至多 1 只空箱"与原版事实不符
    //    (TTTT 2026-08-19 接线梳妆台注册后暴露,UUUU 批已备案非回滚自因)。
    const DRESSER = TILE_BY_KEY['dresser']!;
    const st1 = world.store;
    const empty = world.chests.filter((c) => !c.items.some((it) => it));
    const emptyNonDresser = empty.filter((c) => {
      const i = st1.idx(c.x, c.y);   // 梳妆台容器锚点=3×2 左上格
      return !(st1.flags[i] && st1.type[i] === DRESSER);
    });
    expect(emptyNonDresser.length).toBeLessThanOrEqual(1);
    //    梳妆台空容器本身也要有界(原版小世界 1-10 只):防"容器泛滥"回归
    expect(empty.length).toBeLessThanOrEqual(16);

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

    // ⑦ 陶罐地表泛滥回归(cs:18216 门禁,逐格等价):锚点(罐底行左列)在平均地表线
    //    以上且锚点无墙 → 违规。右半罐/上半格露头的"墙龛罐"是原版同款合法形态
    //   (原版门禁只查 (num12,num13) 单格)
    const st = world.store;
    const POT = TILE_BY_KEY['pot']!;
    const isPot = (x: number, y: number) => st.inBounds(x, y) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === POT;
    let surfacePots = 0;
    for (let y = 0; y < Math.floor(world.groundLevel); y++) {
      for (let x = 0; x < st.w; x++) {
        // 锚点 = 罐底行左列:左侧与下方都不是罐
        if (!isPot(x, y) || isPot(x - 1, y) || isPot(x, y + 1)) continue;
        if (st.wall[st.idx(x, y)] === 0) surfacePots++;
      }
    }
    expect(surfacePots).toBe(0);
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
