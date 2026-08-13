// 肉山死亡链无头实证（NPC.cs:80281-80292 + WorldGen.cs:31866/79837）：
//   砖盒（边缘非活动格→魔金砖140/猩红347、全盒清液）+ StartHardmode
//   （hardMode 置位 + V 带神圣/邪恶转化 + 洞穴墙回填）。
//   ★新三矿与"赐福"公告不在本链——原版由砸祭坛触发（SmashAltar misc[12-14]）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { createBrickBoxForWallOfFlesh, startHardmode } from '../src/world/gen/vanilla/HardmodePass';

const W = 900, H = 400;
const STONE = TILE_BY_KEY['stone']!;   // 内部 id 1 是 dirt——V 带只转石/草/沙,勿用裸土

function makeWorld(): World {
  const w = new World(W, H, 7, 'wof-chain-test');
  const st = w.store;
  w.groundLevel = 120;
  w.rockLevel = 200;
  // 表层草 + 全实心石世界（V 带转化有料可转）
  for (let x = 0; x < W; x++) {
    st.setTile(x, 100, TILE_BY_KEY['grass']!);
    for (let y = 101; y < H; y++) st.setTile(x, y, STONE);
  }
  return w;
}
const sheetOf = (id: number) => TILE_DEFS[id]?.vanilla?.sheet ?? -1;

describe('肉山死亡链', () => {
  it('砖盒：边缘非活动格变魔金砖(140)、盒内液体清零', () => {
    const w = makeWorld();
    const st = w.store;
    // 死亡点挖空 13×13 并灌岩浆（模拟地狱环境）
    const cx = 450, cy = 350, r = 6;
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      st.setTile(i, j, 0);
      st.liquid[st.idx(i, j)] = 255; st.liquidType[st.idx(i, j)] = 2;
    }
    createBrickBoxForWallOfFlesh(st, cx, cy, 160, false);   // WoF width=160 → r=6
    let shellBrick = 0, innerSolid = 0, liquidLeft = 0;
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      const ii = st.idx(i, j);
      if (st.liquid[ii] > 0) liquidLeft++;
      const onShell = i === cx - r || i === cx + r || j === cy - r || j === cy + r;
      if (onShell) {
        if (st.flags[ii] && sheetOf(st.type[ii]) === 140) shellBrick++;
      } else if (st.flags[ii]) innerSolid++;
    }
    expect(shellBrick).toBe(4 * (2 * r + 1) - 4);   // 完整环（全空环境 48 格全填）
    expect(innerSolid).toBe(0);                     // 内部保持空
    expect(liquidLeft).toBe(0);                     // 盒内液体清零
  });

  it('StartHardmode：hardMode 置位 + V 带转化出神圣/邪恶方块', () => {
    const w = makeWorld();
    const before = !!w.flags.hardMode;
    const { wasHard } = startHardmode(w);
    expect(wasHard).toBe(before);
    expect(w.flags.hardMode).toBe(true);
    // V 带扫过实心世界 → 一定出现神圣族(珍珠石117/神圣草109)与邪恶族(黑檀石25/腐化草23)
    const st = w.store;
    let hallow = 0, evil = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (!st.flags[i]) continue;
      const sh = sheetOf(st.type[i]);
      if (sh === 117 || sh === 109 || sh === 116) hallow++;
      if (sh === 25 || sh === 23 || sh === 112) evil++;
    }
    expect(hallow).toBeGreaterThan(50);
    expect(evil).toBeGreaterThan(50);
  });
});
