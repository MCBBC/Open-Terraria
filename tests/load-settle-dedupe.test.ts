// ★load 级联去重 A/B 末态等价测试(2026-09-07):
// 同一世界,waterCheck 级联去重开 vs 关,断言液体/块/墙末态全等(帧允许差异:
// updateStalagtiteStyle 掷骰走私有流,每次读档本就随机——见 FinalCleanupPass 注)。
// 去重只应消除「邻域无新杀的冗余重帧」,杀链触发的必要复查必须保留(killTouch)。
import { it, expect } from 'vitest';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { setReframeDedupe } from '../src/world/gen/vanilla/FinalCleanupPass';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';

const W = 60, H = 40;
const SHEET_STONE = 1, SHEET_STALACTITE = 165;

function mkWorld(): World {
  const st = new TileStore(W, H);
  st.onTileChanged = () => {};
  const setTile = (x: number, y: number, type: number, fx = 0, fy = 0) => {
    const i = y * W + x;
    st.type[i] = type; st.flags[i] = 1; st.frameX[i] = fx; st.frameY[i] = fy;
  };
  // 顶部固体横梁(y=6):钟乳石锚
  for (let x = 10; x < 50; x++) setTile(x, 6, SHEET_STONE, 18, 0);
  // 钟乳石串(sheet 165):多列多串(连通分量密集区,放大级联量)
  // frameY 0=顶格 18=下格(fy>=36 是双格串)
  for (let x = 12; x < 48; x += 2) {
    setTile(x, 7, SHEET_STALACTITE, 0, 36);   // 串上格(fy=36 双格支)
    setTile(x, 8, SHEET_STALACTITE, 0, 0);    // 串下格(fy=0 垂挂)
  }
  // 底部水池(y=30..32 水位)
  for (let x = 5; x < 55; x++) {
    const i = 30 * W + x;
    st.liquid[i] = 255; st.liquidType[i] = 1;
    const i2 = 31 * W + x;
    st.liquid[i2] = 255; st.liquidType[i2] = 1;
    const i3 = 32 * W + x;
    st.liquid[i3] = 128; st.liquidType[i3] = 1;
  }
  // 地板(y=33):承接水
  for (let x = 5; x < 55; x++) setTile(x, 33, SHEET_STONE, 18, 0);
  const world = { store: st, w: W, h: H, groundLevel: 20, rockLevel: 28 } as unknown as World;
  return world;
}

function runSettle(dedupe: boolean) {
  const world = mkWorld();
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  if (dedupe) setReframeDedupe(world.store);
  sim.quickWater();
  sim.waterCheck();
  sim.quickSettle = true;
  let iter = 0;
  while (sim.numLiquid > 0 && iter < 100000) { sim.updateLiquid(); iter++; }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  sim.waterCheck();
  if (dedupe) setReframeDedupe(null);
  sim.dispose();
  return world.store;
}

it('load 级联去重 A/B:液体/块/墙末态全等', () => {
  const a = runSettle(false);
  const b = runSettle(true);
  expect([...a.liquid]).toEqual([...b.liquid]);
  expect([...a.liquidType]).toEqual([...b.liquidType]);
  expect([...a.type]).toEqual([...b.type]);
  expect([...a.flags]).toEqual([...b.flags]);
  expect([...a.wall]).toEqual([...b.wall]);
});

it('load 级联去重 A/B:水被正常安置(基准 sanity)', () => {
  const b = runSettle(true);
  // 底部三行水+沉降后:totalLiquid 守恒(无蒸发,世界浅)
  let total = 0;
  for (let i = 0; i < W * H; i++) total += b.liquid[i];
  expect(total).toBeGreaterThan(0);
  // 顶部钟乳石区无残留液体(settle 已收敛)
  for (let x = 12; x < 48; x += 2) {
    expect(b.liquid[7 * W + x]).toBe(0);
    expect(b.liquid[8 * W + x]).toBe(0);
  }
  void SHEET_STONE; void SHEET_STALACTITE; void TILE_STABLE_OF_INTERNAL;
});
