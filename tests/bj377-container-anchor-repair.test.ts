// ★BJ377（2026-09-28）存量 .wld 导入档容器锚格误写批修（repairLegacyContainerAnchorsInStore）。
//
// 病灶（用户实报三件套）：旧构建 WldImport 箱锚兜底（蓝队门1 前判据
// `type[anchor] !== CHEST_TILE`）把 467 群系箱族/88 梳妆台族的登记锚格强写成
// tile 21（帧保留）→ ①左上格贴图错（外来帧值落 21 sheet 带）②破坏链同类型门
// 碎片化（挖 1 格清 3 留 1 / 清 1 留 3 =「多段破坏」）③锚帧落 21 锁带白送 locked
// （本种 66 锚 37 误锁）。现行导入链已净（重导审计 421 锚 0 坏），本修管存量档。
//
// 判别面：
//  A. saveGame→loadSaveData 全链：污染态锚归位（type 换族、帧/内容零扰动）、
//     误锁清零、合法箱（21 木/金锁/467 style13 锁）零扰动、证据不全/反证/未注册
//     三负控制、幂等二载。
//  B. breakTile 破坏链：修后（同族四格）挖任一格 = 整件齐清+单掉落；污染态
//     （锚 21+余格 467）= 碎片化（至少一格残留）——修复前后判别。
import '../src/net/AssetCache';   // 环入边钉死（ftw-ash-chain 同序）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { saveGame, loadSaveData } from '../src/save/SaveFile';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const CHEST21 = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const DRESSER = TILE_BY_KEY['dresser']!;

/** 箱 2×2 四格帧（style 带基 fx0；18px 格距） */
function chestCells(st: World['store'], x: number, y: number, type: number, fx0: number): void {
  st.setTileSilent(x, y, type, fx0, 0);
  st.setTileSilent(x + 1, y, type, fx0 + 18, 0);
  st.setTileSilent(x, y + 1, type, fx0, 18);
  st.setTileSilent(x + 1, y + 1, type, fx0 + 18, 18);
}
/** 梳妆台 3×2 六格帧（54px 带） */
function dresserCells(st: World['store'], x: number, y: number, fx0: number): void {
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTileSilent(x + dx, y + dy, DRESSER, fx0 + dx * 18, dy * 18);
  }
}

/** 污染态构造：467 箱(360 带)+梳妆台(1296 带)+局部残箱+反证箱+未注册箱
 *  +合法 21 木箱/合法 21 锁箱(72 带)/合法 467 style13 锁箱(468 带) */
function mkCorruptWorld(): World {
  const w = new World(80, 40, 42, 'bj377');
  const st = w.store;
  // ① 467 箱（沙岩箱 style10,fx0=360）：锚被污染成 21
  chestCells(st, 10, 10, CHEST2, 360);
  st.setTileSilent(10, 10, CHEST21, 360, 0);
  // ② 梳妆台（style24,fx0=1296——锚帧恰落 21 锁带 [1296,1330]）：锚被污染成 21
  dresserCells(st, 20, 10, 1296);
  st.setTileSilent(20, 10, CHEST21, 1296, 0);
  // ③ 局部残箱（右下格存证,其余被挖）：锚污染成 21（fx0=432→467 style12）
  st.setTileSilent(10, 20, CHEST21, 432, 0);
  st.setTileSilent(11, 21, CHEST2, 450, 18);
  // ④ 反证箱（右邻 467 但帧不合污染签名）：不得修
  st.setTileSilent(20, 20, CHEST21, 432, 0);
  st.setTileSilent(21, 20, CHEST2, 999, 0);
  // ⑤ 未注册污染锚：不得修
  st.setTileSilent(30, 20, CHEST21, 360, 0);
  // ⑥ 合法 21 木箱（fx0=0）：零扰动
  chestCells(st, 30, 10, CHEST21, 0);
  // ⑦ 合法 21 锁箱（fx0=72 ∈ [72,106]）：零扰动且 locked 保真
  chestCells(st, 40, 10, CHEST21, 72);
  // ⑧ 合法 467 style13 沙漠锁箱（fx0=468）：零扰动且 locked 保真
  chestCells(st, 50, 10, CHEST2, 468);
  // ⑨ 合法 467 style12 整箱（fx0=432）：零扰动（对照③的污染签名）
  chestCells(st, 60, 10, CHEST2, 432);

  const it = (id: number, stack: number) => ({ id, stack });
  w.chests = [
    { x: 10, y: 10, items: [it(41, 25), null] },            // ①
    { x: 20, y: 10, items: [], locked: true },              // ② 污染锚误锁
    { x: 10, y: 20, items: [] },                            // ③
    { x: 20, y: 20, items: [] },                            // ④
    { x: 30, y: 10, items: [] },                            // ⑥
    { x: 40, y: 10, items: [], locked: true },              // ⑦
    { x: 50, y: 10, items: [], locked: true },              // ⑧
    { x: 60, y: 10, items: [] },                            // ⑨
  ];
  return w;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ377 容器锚存量批修（saveGame→loadSaveData 全链）', () => {
  it('污染锚归位：type 换族、帧不动、误锁清零、合法箱零扰动', () => {
    const data = JSON.parse(saveGame(mkCorruptWorld(), new Player(100, 100, new Inventory()), 0));
    const { world } = loadSaveData(data);
    const st = world.store;
    const T = (x: number, y: number) => st.type[st.idx(x, y)];
    const F = (x: number, y: number) => [st.frameX[st.idx(x, y)], st.frameY[st.idx(x, y)]];
    const chestOf = (x: number, y: number) => world.chests.find((c) => c.x === x && c.y === y)!;

    // ① 467 箱锚归位 + 帧原样
    expect(T(10, 10)).toBe(CHEST2);
    expect(F(10, 10)).toEqual([360, 0]);
    expect(T(11, 10)).toBe(CHEST2);
    expect(T(10, 11)).toBe(CHEST2);
    expect(T(11, 11)).toBe(CHEST2);
    expect(F(11, 11)).toEqual([378, 18]);
    // ② 梳妆台锚归位 + 误锁清零（dresser 非 21/467 → 恒解锁）
    expect(T(20, 10)).toBe(DRESSER);
    expect(F(20, 10)).toEqual([1296, 0]);
    expect(T(22, 11)).toBe(DRESSER);
    expect(chestOf(20, 10).locked).toBeFalsy();
    // ③ 局部残箱：右下格存证 → 修
    expect(T(10, 20)).toBe(CHEST2);
    expect(F(10, 20)).toEqual([432, 0]);
    // ④ 反证（同族格帧不合）→ 不修
    expect(T(20, 20)).toBe(CHEST21);
    // ⑤ 未注册 → 不修
    expect(T(30, 20)).toBe(CHEST21);
    // ⑥⑦⑧⑨ 合法箱零扰动
    expect(T(30, 10)).toBe(CHEST21);
    expect(F(30, 10)).toEqual([0, 0]);
    expect(T(40, 10)).toBe(CHEST21);
    expect(F(40, 10)).toEqual([72, 0]);
    expect(chestOf(40, 10).locked).toBe(true);      // 合法 21 锁带保真
    expect(T(50, 10)).toBe(CHEST2);
    expect(F(50, 10)).toEqual([468, 0]);
    expect(chestOf(50, 10).locked).toBe(true);      // 合法 467 style13 锁保真
    expect(T(60, 10)).toBe(CHEST2);
    expect(F(60, 10)).toEqual([432, 0]);
    // 修复不改箱内容
    expect(chestOf(10, 10).items[0]).toEqual({ id: 41, stack: 25 });
  });

  it('幂等：修后世界再存再载 = 零二次修（锚已非 21,合法箱照常）', () => {
    const w = mkCorruptWorld();
    const first = loadSaveData(JSON.parse(saveGame(w, new Player(100, 100, new Inventory()), 0)));
    const second = loadSaveData(JSON.parse(saveGame(first.world, new Player(100, 100, new Inventory()), 0)));
    const st = second.world.store;
    expect(st.type[st.idx(10, 10)]).toBe(CHEST2);
    expect(st.type[st.idx(20, 10)]).toBe(DRESSER);
    expect(st.type[st.idx(30, 10)]).toBe(CHEST21);
    expect(st.type[st.idx(40, 10)]).toBe(CHEST21);
    expect(second.world.chests.find((c) => c.x === 40 && c.y === 10)!.locked).toBe(true);
  });
});

/** breakTile 可驱动面最小桩（形制同 ftw-ash-chain.test.ts shell） */
function shell(w: World, drops: Array<[string, number]>): Game & { breakTile(x: number, y: number): void } {
  const g = Object.create(Game.prototype) as unknown as Game & { breakTile(x: number, y: number): void };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {}, playWavFile: () => {}, playFiles: () => true } as never;
  g.entities = { add: () => {}, projectiles: [] } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.player = { cx: 12 * 16 + 8, cy: 12 * 16 + 8, equipStats: {} } as never;
  return g;
}

describe('BJ377 破坏链判别面（同族整件 vs 污染碎片化）', () => {
  it('修后（同族 2×2）：挖非锚格 = 整件四格齐清 + 单掉落', () => {
    const w = mkCorruptWorld();
    const st = w.store;
    // 手动完成修复等价态：锚改回 467（修后世界形态）；清空箱（原版非空箱整件不可拆）
    st.setTileSilent(10, 10, CHEST2, 360, 0);
    w.chests.find((c) => c.x === 10 && c.y === 10)!.items = [];
    const drops: Array<[string, number]> = [];
    shell(w, drops).breakTile(11, 10);          // 挖右上格
    for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11]] as const) {
      expect(st.hasTile(x, y)).toBe(false);
    }
    expect(drops.length).toBe(1);               // 单掉落
  });

  it('污染态（锚 21+余格 467）：挖非锚格 = 碎片化（锚格残留）——修复即消', () => {
    const w = mkCorruptWorld();
    const st = w.store;
    w.chests.find((c) => c.x === 10 && c.y === 10)!.items = [];
    const drops: Array<[string, number]> = [];
    shell(w, drops).breakTile(11, 10);          // 挖右上格（余格侧）
    expect(st.hasTile(11, 10)).toBe(false);     // 命中格被清
    expect(st.hasTile(10, 11)).toBe(true);      // 同族邻格残留（不在命中相位框）
    expect(st.hasTile(10, 10)).toBe(true);      // 污染锚残留 = 多段破坏实感
    expect(TILE_DEFS[st.type[st.idx(10, 10)]]?.key).toBe('chest');
  });
});
