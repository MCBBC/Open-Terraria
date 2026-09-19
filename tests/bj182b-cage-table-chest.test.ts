// ★BJ182b-②（2026-09-19）PC_TILE_TABLE 缺 280 真值差定谳+收编行为面钉死。
// 机制:chestLegOK Table 路（TileObject.cs:407 `!TileID.Sets.Platforms ∧ Main.tileTable ∧
//  blockType()==0`）——vanilla tileTable[280]=true（1457 Main.cs:7018 首条赋值,280=蓝坚鸟
//  笼,笼族 275-281 与 279/281 同批入表）→ 平放鸟笼可承箱【半桌半地】锚。旧 PC_TILE_TABLE
//  (80 项)缺 280 → JS 拒/vanilla 收。本测以 placeBuriedChest 全链实测:
//    A. 左腿 280 平放笼+右腿石 → 修正后收(vanilla 同收);变异 M17(主表摘 280)即红;
//    B. blockType 门:左腿 280 坡腿 → vanilla/new 均拒（cs:407 blockType==0 同钉）;
//    C. 纯石双腿负控制 → 恒收（链路自身健全）。
//  世界生成重放定谳:纯 worldgen 无观测差——笼族 275-281 vanilla WorldGen 全树零布点
//  （grep =27[5-9];=28[01] 仅 mountainSet/炮弹/掉落物,无 type 写面）且本仓 worldgen passes
//  同零布点;placeBuriedChest 唯一 Table 路可达面=落定行邻格,而落定行恒 SolidTile
//  （solidDrop 门 cs:35931 循环,solidTop 族不拦截坠落=DDDD 判例）——280 只可能经玩家
//  runtime 摆件进入世界,而 runtime 箱锚链 Game.ts:43826 直查主表本就含 280。
//  → 收编=语义对齐原版,worldgen 流位零漂（worldgen 金标族全绿承证）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_TABLE_SHEETS } from '../src/data/tiles';
import { placeBuriedChest } from '../src/world/gen/vanilla/BuriedChestsPass';
import { newGenState } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';

const CAGE = TILE_BY_KEY['v_280_blue_jay_cage']!;
const STONE = TILE_BY_KEY['stone']!;
expect(CAGE).toBeGreaterThan(0);
expect(STONE).toBeGreaterThan(0);

function mkScene(legLSheet: typeof CAGE | typeof STONE, legLSlope = 0): { w: World; i: number; gy: number } {
  const w = new World(300, 300, 42, 'bj182b');
  w.groundLevel = 120;
  w.rockLevel = 200;
  const st = w.store;
  // 落定行 gy=150:右腿石(实心锚),左腿=被测锚格;箱体 (i-1..i)×(148..149) 恒空
  const i = 150, gy = 150;
  st.setTileSilent(i, gy, STONE, 0, 0);
  st.setTileSilent(i - 1, gy, legLSheet, 0, 0);
  if (legLSlope) st.slope[st.idx(i - 1, gy)] = legLSlope;
  return { w, i, gy };
}

describe('BJ182b-② 鸟笼 280 桌面路箱锚(机制+blockType 门+负控制)', () => {
  it('主表 280 在位(定谳前置;M17 摘 280 即本案+§6f 双红)', () => {
    expect(TILE_TABLE_SHEETS.has(280)).toBe(true);
  });
  it('A:左腿 280 平放笼+右腿石 → placeBuriedChest 收(vanilla TileObject.cs:407 同收)', () => {
    const { w, i, gy } = mkScene(CAGE);
    const chests: Array<unknown> = [];
    const ok = placeBuriedChest(w.store, new RNG(7), newGenState(300, 300), chests as never, i, gy - 8, { style: 1 });
    expect(ok).toBe(true);
    expect(chests.length).toBe(1);
  });
  it('B:blockType 门——左腿 280 顶坡腿 → 拒(cs:407 blockType()==0,new 同钉)', () => {
    const { w, i, gy } = mkScene(CAGE, 1);                       // slope=1 → blockType 2
    const chests: Array<unknown> = [];
    const ok = placeBuriedChest(w.store, new RNG(7), newGenState(300, 300), chests as never, i, gy - 8, { style: 1 });
    expect(ok).toBe(false);
    expect(chests.length).toBe(0);
  });
  it('C:负控制——双腿纯石 → 恒收(链路健全性)', () => {
    const { w, i, gy } = mkScene(STONE);
    const chests: Array<unknown> = [];
    const ok = placeBuriedChest(w.store, new RNG(7), newGenState(300, 300), chests as never, i, gy - 8, { style: 1 });
    expect(ok).toBe(true);
  });
});
