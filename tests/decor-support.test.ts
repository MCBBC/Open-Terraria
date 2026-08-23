// D-1/D-3/D-4 decor 失撑链单元测试（审计 docs/audit/tile-audit-2026-08-23.md 分区 D）：
//   D-1 运行期 decor 失撑：原版 TileFrameImportant(:85703) Check* 族（PlantCheck :81280/
//       CheckAlch :45981/CheckSunflower :53744/Check1x1 :45243/CheckLogicTiles :45288/
//       CheckOrb :54187/CheckPot :56807）——挖支撑格 → 清除+掉落；未列入支撑语义表的
//       decor（绳/梁/币堆/蛛网…Main.tileFrameImportant=0）悬空保留=原版同款（勿误修）。
//   D-3 火把 24 档 style 掉落（KillTile case 4 :65106-65164）——失撑按档还炬。
//   D-4 割藤 cordage（case 52/62/382 :65087-65092）1/2 掉藤绳 2996（装备 3068）。
// shell 模式同 style-drop-restore.test.ts（Object.create(Game.prototype)+桩）。
import { describe, expect, it, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { LIQUID_TYPE } from '../src/world/TileStore';

const keyOf = (k: string) => {
  const id = TILE_BY_KEY[k];
  expect(id, `def ${k} 应存在`).toBeDefined();
  return id!;
};
const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s} 应有 def`).toBeGreaterThan(0);
  return id;
};

interface Drop { key: string; n: number }

/** Game 壳（同 style-drop-restore breakShell,补 decor 链所需桩） */
function mkShell(w: World, drops: Drop[], opts: { cordage?: boolean } = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
    checkFurnitureSupport: (x: number, y: number) => void;
    checkTorchDetach: (x: number, y: number) => void;
    breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.entities = { add: () => {}, critters: [], drops: [] };
  g.trackTile = 0;
  g.scene = null;
  // 最小玩家桩（killTileShouldDropSeeds 背包门 / cordage 装备位）
  g.player = { inv: { countOf: () => 0 }, equipStats: { cordage: !!opts.cordage }, cx: 0, cy: 0 };
  return g;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('D-1 decor 失撑链（PlantCheck/CheckAlch 族）', () => {
  it('蘑菇（tile 3 fx144）挖掉脚下草 → 清除+掉蘑菇 5（KillTile case 3 :65041）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const MUSH = keyOf('mushroom'), GRASS = keyOf('grass');
    w.store.setTileSilent(10, 10, GRASS, 0, 0);
    w.store.setTileSilent(10, 9, MUSH, 144, 0);
    w.store.setTile(10, 10, 0);   // 挖掉支撑（运行期经监听 → checkFurnitureSupport(10,9)）
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);                            // 蘑菇塌
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[5], n: 1 }]);   // 掉蘑菇本体
  });

  it('地基在 → 存活（PlantCheck 失配才杀,:81280）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const MUSH = keyOf('mushroom'), GRASS = keyOf('grass');
    w.store.setTileSilent(10, 10, GRASS, 0, 0);
    w.store.setTileSilent(10, 9, MUSH, 144, 0);
    g.checkFurnitureSupport(10, 9);   // 邻格扰动同款触发
    expect(w.store.get(10, 9)).toBe(MUSH);
    expect(drops).toEqual([]);
  });

  it('腐化蔓延过境 → 换型不杀（PlantCheck_TryGetNewType :81886,森林高株 73→腐化 24）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const T73 = keyOf('v_73_forest_tall_plants');
    const CORRUPT_GRASS = idOfSheet(23), CORRUPT_PLANT = keyOf('v_24_corruption_short_plants');
    w.store.setTileSilent(10, 10, CORRUPT_GRASS, 0, 0);
    w.store.setTileSilent(10, 9, T73, 0, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(CORRUPT_PLANT);   // 变型（非清除）
    expect(drops).toEqual([]);
  });

  it('药草 83 列 2（fx36）泥土上存活;挖掉泥土 → 塌（CheckAlch :45981 列地基表）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const HERB = keyOf('v_83_herbs_mature'), DIRT = idOfSheet(0);
    w.store.setTileSilent(10, 10, DIRT, 0, 0);
    w.store.setTileSilent(10, 9, HERB, 36, 0);      // col=fx/18=2 → 地基含泥土 0
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(HERB);          // 泥土是列 2 合法地基
    w.store.setTile(10, 10, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);             // 支撑没了 → 塌
  });

  it('药草泡岩浆 → 枯杀（CheckAlch :46000-46065 lava 门,列 2 非 5 豁免档）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const HERB = keyOf('v_83_herbs_mature'), DIRT = idOfSheet(0);
    w.store.setTileSilent(10, 10, DIRT, 0, 0);
    w.store.setTileSilent(10, 9, HERB, 36, 0);
    const i = w.store.idx(10, 9);
    w.store.liquid[i] = 100;
    w.store.liquidType[i] = LIQUID_TYPE.LAVA;
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);
  });

  it('向日葵 2×4 挖支撑 → 整件清+掉一份（CheckSunflower :53744 → Item 63=place_v_27）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SUN = keyOf('v_27_sunflower'), GRASS = keyOf('grass');
    for (let dx = 0; dx < 2; dx++) {
      w.store.setTileSilent(10 + dx, 14, GRASS, 0, 0);
      for (let dy = 0; dy < 4; dy++) w.store.setTileSilent(10 + dx, 10 + dy, SUN, dx * 18, dy * 18);
    }
    w.store.setTile(10, 14, 0);          // 挖左半支撑
    g.checkFurnitureSupport(10, 13);     // 监听触发：查上方格（底行左列）
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 13)).toBe(0); // 整件 8 格全清
    expect(drops).toEqual([{ key: 'place_v_27_sunflower', n: 1 }]);   // 原版 Item.NewItem(63)
  });

  it('勿误修：绳 213 悬空保留（Main.tileFrameImportant=0,无支撑语义=原版同款）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const ROPE = keyOf('v_213_rope');
    w.store.setTileSilent(10, 10, ROPE, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(ROPE);
    expect(drops).toEqual([]);
  });

  it('水晶心 12 挖支撑 → 整件清+掉 29 生命水晶（CheckOrb :54252-54254）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const HEART = keyOf('crystal_heart'), STONE = idOfSheet(1);
    for (let dx = 0; dx < 2; dx++) {
      w.store.setTileSilent(10 + dx, 12, STONE, 0, 0);
      for (let dy = 0; dy < 2; dy++) w.store.setTileSilent(10 + dx, 10 + dy, HEART, dx * 18, dy * 18);
    }
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 11)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[29], n: 1 }]);
  });

  it('逻辑灯 419 失去灯座 420 → 塌（CheckLogicTiles :45291-45296）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const LAMP = keyOf('v_419_logicgatelamp'), GATE = keyOf('v_420_logicgate');
    w.store.setTileSilent(10, 10, GATE, 0, 0);
    w.store.setTileSilent(10, 9, LAMP, 0, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(LAMP);   // 灯座在 → 活
    w.store.setTile(10, 10, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);      // 灯座没了 → 塌
  });

  it('树苗（玩家种植单格表示）挖支撑 → 塌;地基族变更 → 重帧（Check1x2 :43377）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SAP = keyOf('acorn_sapling'), GRASS = keyOf('grass'), SAND = idOfSheet(53);
    w.store.setTileSilent(10, 10, GRASS, 0, 0);
    w.store.setTileSilent(10, 9, SAP, 0, 0);          // 单格表示（placeAcornSapling :12398）
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(SAP);             // 草在 → 活（草=档 0 地基）
    w.store.setTile(10, 10, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);               // 支撑没了 → 塌
    // 导入档 1×2 两格表示 + 地基族变更重帧（草→沙 档 6）
    w.store.setTileSilent(20, 10, SAND, 0, 0);
    w.store.setTileSilent(20, 8, SAP, 0, 0);
    w.store.setTileSilent(20, 9, SAP, 0, 18);
    g.checkFurnitureSupport(20, 9);
    expect(w.store.get(20, 8)).toBe(SAP);             // 沙是合法地基（档 18=alt6）→ 重帧不杀
    expect(Math.floor(w.store.frameX[w.store.idx(20, 8)] / 54)).toBe(6);
    expect(w.store.frameX[w.store.idx(20, 8)]).toBe(w.store.frameX[w.store.idx(20, 9)]);
  });

  it('蘑菇树 72 下方须 72/70（case 72 :86978 内联）——挖蘑菇草 → 整段级联塌', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const TREE = keyOf('v_72_mushroom_tree'), SHROOMGRASS = idOfSheet(70);
    w.store.setTileSilent(10, 12, SHROOMGRASS, 0, 0);
    w.store.setTileSilent(10, 11, TREE, 0, 0);
    w.store.setTileSilent(10, 10, TREE, 18, 0);
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);   // 底干格失基 → 塌
    expect(w.store.get(10, 11)).toBe(0);
    expect(w.store.get(10, 10)).toBe(0);   // 级联：上格下方空 → 连塌
  });
});

describe('D-3 火把 style 掉落（KillTile case 4 :65106-65164）', () => {
  it('咒火炬（style8,fy=176）失撑 → 掉 523 咒火炬（曾恒掉 8=刷炬漏洞）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const TORCH = keyOf('torch'), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 10, STONE, 0, 0);
    w.store.setTileSilent(10, 9, TORCH, 0, 8 * 22);   // frameY=style*22
    w.store.setTile(10, 10, 0);
    g.checkTorchDetach(10, 10);
    expect(w.store.get(10, 9)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[523], n: 1 }]);
  });

  it('彩炬 style2（fy=44）→ 掉 428（default=426+style 档）;普通炬 style0 → 掉 8', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const TORCH = keyOf('torch'), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 10, STONE, 0, 0);
    w.store.setTileSilent(10, 9, TORCH, 0, 2 * 22);
    w.store.setTile(10, 10, 0);
    g.checkTorchDetach(10, 10);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[428], n: 1 }]);
    // style0 回归
    const drops2: Drop[] = [];
    const g2 = mkShell(w, drops2);
    w.store.setTileSilent(12, 10, STONE, 0, 0);
    w.store.setTileSilent(12, 9, TORCH, 0, 0);
    w.store.setTile(12, 10, 0);
    g2.checkTorchDetach(12, 10);
    expect(drops2).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[8], n: 1 }]);
  });
});

describe('D-4 割藤 cordage（case 52/62/382 :65087-65092）', () => {
  const VINE = () => keyOf('v_52_vines');

  it('装备 3068（cordage）割藤 → 1/2 掉藤绳 2996（掷 0 命中）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops, { cordage: true });
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0);   // Next(2)==0 命中
    w.store.setTileSilent(10, 10, VINE(), 0, 0);
    g.breakTile(10, 10, false);
    expect(w.store.get(10, 10)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[2996], n: 1 }]);
    expect(rand).toHaveBeenCalled();
  });

  it('未装备 → 恒无掉落（GetPlayerForTile.cordage 门）', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const drops: Drop[] = [];
    const g = mkShell(w, drops, { cordage: false });
    vi.spyOn(Math, 'random').mockReturnValue(0);   // 掷命中但 cordage=false
    w.store.setTileSilent(10, 10, VINE(), 0, 0);
    g.breakTile(10, 10, false);
    expect(drops).toEqual([]);
  });
});

describe('D-6 直掉 vid 接档抽查（1×1 通用尾）', () => {
  it('藤绳 213→965 / 白金蜡烛 174→713 / 逻辑灯 419 亮档(fx18)→3618', () => {
    const w = new World(40, 40, 7, 'decor-support');
    const cases: Array<[string, number, number, number]> = [
      // [def key, frameX, frameY, 期望 vid]
      ['v_213_rope', 0, 0, 965],
      ['v_174_platinumcandle', 0, 0, 713],
      ['v_419_logicgatelamp', 18, 0, 3618],   // style1=亮档（:65352-65354）
      ['v_593_volcanosmall', 0, 0, 4868],
    ];
    for (const [k, fx, fy, vid] of cases) {
      const drops: Drop[] = [];
      const g = mkShell(w, drops);
      w.store.setTileSilent(10, 10, keyOf(k), fx, fy);
      g.breakTile(10, 10, false);
      expect(drops, k).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[vid], n: 1 }]);
    }
  });
});
