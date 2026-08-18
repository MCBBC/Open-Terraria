// 藤蔓支撑级联(CheckVines,WorldGen.cs:85599-85700 1:1):
//   ①打掉中间一节 → 下方整段消失、上方保留(同型续接 + 亲代面存活)
//   ②打掉顶节亲代草 → 整段消失
//   ③亲代面变型(52 挂丛林草 → 变 62)
//   ④蘑菇藤 528 挂蘑菇草 70 存活;挖掉 70 → 死
// 级联链:onTileChanged(x,y) → checkVineAt(x,y+1) → breakTile → setTile(0)
//         再触发监听逐节向下(下落沙同款自然级联)
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s}`).toBeGreaterThan(0);
  return id;
};
const JUNGLE_GRASS = idOfSheet(60);
const VINE_J = idOfSheet(62);
const VINE_P = idOfSheet(52);
const GRASS = idOfSheet(2);
const MUSH_GRASS = idOfSheet(70);
const VINE_M = idOfSheet(528);

/** 原型壳 + 真实藤监听(palm-chop shell 模式;private 仅编译期) */
function vineShell(w: World) {
  const g = Object.create(Game.prototype) as unknown as {
    world: World; chunks: { markDirtyArea: () => void };
    spawnDrop: () => void; spawnParticles: () => void;
    sfx: { play: () => void }; playSfxFile: () => void;
    checkVineAt: (x: number, y: number) => void;
    breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.playSfxFile = () => {};
  g.spawnDrop = () => {};
  w.store.onTileChanged((x, y) => g.checkVineAt(x, y + 1));
  return g;
}

function vineWorld() {
  const w = new World(40, 60, 7, 'vine-cascade');
  w.groundLevel = 30; w.rockLevel = 40;
  return w;
}

describe('藤蔓支撑级联(CheckVines :85599)', () => {
  it('打掉中间一节:下方整段消失,上方保留(同型续接)', () => {
    const w = vineWorld();
    const g = vineShell(w);
    const st = w.store;
    // 丛林草 60 @40,藤 62 挂 41-45
    st.setTileSilent(20, 40, JUNGLE_GRASS);
    for (let y = 41; y <= 45; y++) st.setTileSilent(20, y, VINE_J);
    // 打掉中间 43(玩家挖 = setTile 0,触发监听)
    st.setTile(20, 43, 0);
    expect(st.get(20, 41)).toBe(VINE_J);   // 顶节保留(上方 60)
    expect(st.get(20, 42)).toBe(VINE_J);   // 第二节保留(上方同型)
    expect(st.get(20, 43)).toBe(0);
    expect(st.get(20, 44)).toBe(0);        // ★下方级联消失
    expect(st.get(20, 45)).toBe(0);
  });

  it('打掉顶节亲代草:整段藤全灭', () => {
    const w = vineWorld();
    const g = vineShell(w);
    const st = w.store;
    st.setTileSilent(21, 40, JUNGLE_GRASS);
    for (let y = 41; y <= 45; y++) st.setTileSilent(21, y, VINE_J);
    st.setTile(21, 40, 0);                 // 挖草
    for (let y = 41; y <= 45; y++) expect(st.get(21, y)).toBe(0);
  });

  it('亲代面变型:普通藤 52 上方换丛林草 → 变 62(:85630/:85657)', () => {
    const w = vineWorld();
    const g = vineShell(w);
    const st = w.store;
    st.setTileSilent(22, 40, GRASS);       // 普通草上挂普通藤
    st.setTileSilent(22, 41, VINE_P);
    st.setTileSilent(22, 42, VINE_P);
    expect(st.get(22, 41)).toBe(VINE_P);   // 挂草 2:合法存活
    st.setTile(22, 40, JUNGLE_GRASS);      // 草面替换(泥土传播链的等价扰动)
    expect(st.get(22, 41)).toBe(VINE_J);   // ★52 变型 62
    expect(st.get(22, 42)).toBe(VINE_J);   // 下方随上方新型再查(3×3 帧化级联)
  });

  it('蘑菇藤 528:挂蘑菇草 70 存活,挖 70 即死', () => {
    const w = vineWorld();
    const g = vineShell(w);
    const st = w.store;
    st.setTileSilent(23, 40, MUSH_GRASS);
    for (let y = 41; y <= 43; y++) st.setTileSilent(23, y, VINE_M);
    // 邻列扰动不误伤
    st.setTile(24, 40, 0);
    expect(st.get(23, 43)).toBe(VINE_M);
    st.setTile(23, 40, 0);                 // 挖蘑菇草
    for (let y = 41; y <= 43; y++) expect(st.get(23, y)).toBe(0);
  });

  it('62 支撑白名单 {60,384,226}:活红木叶 384 上的藤扰动不死', () => {
    const w = vineWorld();
    const g = vineShell(w);
    const st = w.store;
    st.setTileSilent(25, 40, idOfSheet(384));
    st.setTileSilent(25, 41, VINE_J);
    st.setTileSilent(25, 42, VINE_J);
    st.setTile(26, 40, 0);                 // 邻列扰动
    expect(st.get(25, 41)).toBe(VINE_J);
    expect(st.get(25, 42)).toBe(VINE_J);
  });
});
