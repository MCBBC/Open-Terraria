// D-1/D-3/D-4 decor 失撑链单元测试（审计 docs/audit/tile-audit-2026-08-23.md 分区 D）：
//   D-1 运行期 decor 失撑：原版 TileFrameImportant(:85703) Check* 族（PlantCheck :81280/
//       CheckAlch :45981/CheckSunflower :53744/Check1x1 :45243/CheckLogicTiles :45288/
//       CheckOrb :54187/CheckPot :57273）——挖支撑格 → 清除+掉落；未列入支撑语义表的
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

// ===================== D-1 二批：TileFrameImportant(:86241) 派发全量补齐 =====================
// 对照表：docs/audit/tile-audit-2026-08-23.md「TileFrame 全量派发对照」。
// 用户实报场景：挖掉方块后 233 丛林大型植物（3×2,fx=54 fy=0）悬空——根因=
// 多格植物/装饰/画族整族漏列 DECOR_SUPPORT_KIND（曾走家具 hasSupport 墙锚支）。
describe('D-1b 多格植物族（CheckJunglePlant :48358 / CheckOasisPlant :48026）', () => {
  it('用户场景：233 丛林大型植物 3×2（fx54 fy0）挖底格丛林草 → 整件清（墙不算支撑）', () => {
    const w = new World(40, 40, 7, 'decor-support-jungle');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const PLANT = idOfSheet(233), JGRASS = idOfSheet(60), STONE = idOfSheet(1);
    // 丛林壁（墙在——原版 CheckJunglePlant 不认墙锚,曾走家具墙锚支=悬空根因）
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) w.store.setWall(10 + dx, 9 + dy, 66);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 11, JGRASS, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 9 + dy, PLANT, dx * 18 + 54, dy * 18);   // style1
    }
    g.checkFurnitureSupport(11, 10);       // 草在 → 活
    expect(w.store.get(10, 9)).toBe(PLANT);
    // 挖中列支撑（用户操作：挖掉植物脚下方块）
    w.store.setTile(11, 11, STONE, 0, 0);  // 先换石（非丛林草=地基失配同款杀）
    g.checkFurnitureSupport(11, 10);
    expect(w.store.get(10, 9)).toBe(0);
    expect(w.store.get(12, 10)).toBe(0);   // 整件 3×2 全清
    expect(drops).toEqual([]);             // 233 原版无掉落（非放置物,KillTile 无 233 档）
  });

  it('233 2×2 变体（frameY>=36,style×36 帧）挖支撑 → 整件清（:48386-48431 锚列%2）', () => {
    const w = new World(40, 40, 7, 'decor-support-jungle2');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const PLANT = idOfSheet(233), JGRASS = idOfSheet(60);
    for (let dx = 0; dx < 2; dx++) w.store.setTileSilent(10 + dx, 11, JGRASS, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 9 + dy, PLANT, dx * 18 + 36, dy * 18 + 36);
    }
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 9)).toBe(PLANT);
    w.store.setTile(10, 11, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(11, 10)).toBe(0);
  });

  it('236 生命果植物失撑 → 掉 1291 生命果（breakTile :12698 特支=原版 :48438 Item 1291）', () => {
    const w = new World(40, 40, 7, 'decor-support-lifefruit');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const FRUIT = idOfSheet(236), JGRASS = idOfSheet(60);
    for (let dx = 0; dx < 2; dx++) w.store.setTileSilent(10 + dx, 11, JGRASS, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 9 + dy, FRUIT, dx * 18, dy * 18);
    }
    w.store.setTile(10, 11, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(11, 9)).toBe(0);
    expect(drops).toContainEqual({ key: 'vi_1291_life_fruit', n: 1 });
  });

  it('530 绿洲植物 3×2 沙上活;挖沙 → 清（CheckOasisPlant :48026 沙族地基）', () => {
    const w = new World(40, 40, 7, 'decor-support-oasis');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const OASIS = idOfSheet(530), SAND = idOfSheet(53), DIRT = idOfSheet(0);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, SAND, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, OASIS, dx * 18 + 54, dy * 18);
    }
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(10, 10)).toBe(OASIS);
    w.store.setTile(11, 12, DIRT, 0, 0);   // 换非沙族 → 杀
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(12, 11)).toBe(0);
  });
});

describe('D-1c 画/武器架墙锚族（任一格 wall<=0 即塌）', () => {
  it('240 墙挂 3×3：墙在 → 活;挖任一格墙 → 整件塌+掉放置物（Check3x3Wall :44690）', () => {
    const w = new World(40, 40, 7, 'decor-support-painting');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const PAINT = idOfSheet(240);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      w.store.setWall(10 + dx, 10 + dy, 1);
      w.store.setTileSilent(10 + dx, 10 + dy, PAINT, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(10, 10)).toBe(PAINT);      // 墙全在 → 活（无地板同活）
    w.store.setWall(11, 11, 0);                    // 挖中格墙
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(12, 12)).toBe(0);           // 整件 9 格全清
    expect(drops.length).toBe(1);                  // 画=放置物返还（styleDrop/multiTile 链）
  });

  it('471 武器架 3×3 墙锚（TEWeaponsRack.Framing_CheckTile :74）挖墙 → 塌', () => {
    const w = new World(40, 40, 7, 'decor-support-rack');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const RACK = idOfSheet(471);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      w.store.setWall(10 + dx, 10 + dy, 1);
      w.store.setTileSilent(10 + dx, 10 + dy, RACK, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(RACK);
    w.store.setWall(12, 12, 0);
    g.checkFurnitureSupport(12, 12);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 11)).toBe(0);
  });
});

// ================= 八批幸存链缺口（2026-09-02）：CheckTallGate / 440 wallhang =================
// CheckTallGate（WorldGen.cs:52111-52173;派发 case 组 :86990-86993 388/389 同函数）：
// 完整性（:52136-52145）+顶/底双行 SolidTile（:52142 → CheckTileAnchors mode2
// :52292-52305）。几何：地面行 14、天花行 8（净空恰 5 行 9..13）,门列 x=10——
// 远离 3×3 扫的 ny<=5 边界门。触发=checkFurnitureSupport(门格)（=扫派发单格等价）。
describe('八批①高门 CheckTallGate（388/389 双态同链）', () => {
  /** 门体合成：统一 vanilla 行帧 0/20/38/56/74（TileObject.Place TileObject.cs:96-108
   *  heights+padding 累进;★M-2（2026-09-02 九批）后本仓放置面/导入/迁移全部此序,
   *  旧 18px 步进仅存在于迁移前的存量档——运行期出现即判坏,见下方守门用例 */
  const tallSetup = (w: World, tid: number) => {
    const st = w.store;
    const SN = idOfSheet(1);
    for (let x = 8; x <= 12; x++) {
      st.setTileSilent(x, 14, SN, 0, 0);   // 底锚行
      st.setTileSilent(x, 8, SN, 0, 0);    // 顶锚行
    }
    const FYS = [0, 20, 38, 56, 74];
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(10, 9 + dy, tid, 0, FYS[dy]);
  };
  const gone = (w: World, tid: number) => {
    for (let dy = 0; dy < 5; dy++) if (w.store.get(10, 9 + dy) === tid) return false;
    return true;
  };

  it('389 开态（原版帧序）：双锚在 → 幸存;挖顶锚 → 整件清+掉 3240（:52142/:52156）', () => {
    const w = new World(40, 40, 7, 'decor-support-tallgate');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const OPEN = idOfSheet(389);
    tallSetup(w, OPEN);
    g.checkFurnitureSupport(10, 11);          // 中格扰动（双锚在,非锚向）
    expect(w.store.get(10, 11)).toBe(OPEN);
    w.store.setTile(10, 8, 0);                // 挖顶锚行格（天花恰在门顶上一格）
    g.checkFurnitureSupport(10, 9);           // 门顶格复验（3×3 扫派发单格等价）
    expect(gone(w, OPEN)).toBe(true);
    expect(drops).toContainEqual({ key: VANILLA_ITEM_KEY_BY_ID[3240], n: 1 });   // :52156-52161
  });

  it('★M-2c 守门：旧 18px 步进帧（迁移前存量态,0/18/36/54/72）完整性判坏 → 整件清', () => {
    const w = new World(40, 40, 7, 'decor-support-tallgate-legacy');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const OPEN = idOfSheet(389);
    tallSetup(w, OPEN);
    for (let dy = 0; dy < 5; dy++) w.store.setTileSilent(10, 9 + dy, OPEN, 0, 18 * dy);   // 旧约定重写
    g.checkFurnitureSupport(10, 10);
    expect(gone(w, OPEN)).toBe(true);   // 存量档由 tallgateFrameRepair 迁移,运行期不该再见此态
  });

  it('388 闭态：双锚在 → 幸存（旧家具链 solid 早退=无幸存链）;388/389 半写态容忍', () => {
    const w = new World(40, 40, 7, 'decor-support-tallgate-closed');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const CLOSED = idOfSheet(388), OPEN = idOfSheet(389);
    tallSetup(w, CLOSED);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 11)).toBe(CLOSED);
    // ShiftTallGate（Door.ts:158/devices.ts:951）逐格 setTile 半写态：前 2 格已换
    // OPEN、后 3 格仍 CLOSED——原版运行期不评估半写态（:52215-52219 直写后整体
    // TileFrame :52224-52231）,配对态格放行=「写完再评估」等价
    for (let dy = 0; dy < 2; dy++) w.store.setTileSilent(10, 9 + dy, OPEN, 0, 20 * dy);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(OPEN);
    expect(w.store.get(10, 12)).toBe(CLOSED);
    // 切换写完（全列还原 CLOSED）后异型混入（非配对态）→ 完整性判坏整件清
    w.store.setTileSilent(10, 9, CLOSED, 0, 0);
    w.store.setTileSilent(10, 10, CLOSED, 0, 20);
    w.store.setTileSilent(10, 11, idOfSheet(1), 0, 0);
    g.checkFurnitureSupport(10, 9);
    expect(gone(w, OPEN)).toBe(true);
    expect(gone(w, CLOSED)).toBe(true);
    // ★⑤（2026-09-02 缓修小账）：CheckTallGate 杀段（WorldGen.cs:52151-52163）
    //   `int type2 = 3240; if (point.Y == 0) { type2 = 3240; }` 两支同值恒 3240=
    //   反编译本相——闭态 388 与开态 389 同掉原版 Tall Gate vi_3240;旧钉
    //   place_v_388_tall_gate_closed 兜底（本仓面板伪物品）按原版依据翻正
    expect(drops).toEqual([{ key: 'vi_3240_TallGate', n: 1 }]);
  });
});

describe('八批②440 宝石锁 wallhang（Check3x3Wall :44690 逐格 wall>0）', () => {
  const glSetup = (w: World) => {
    const GLOCK = idOfSheet(440);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      w.store.setWall(10 + dx, 10 + dy, 1);
      w.store.setTileSilent(10 + dx, 10 + dy, GLOCK, 54 + dx * 18, dy * 18);   // style1 带基
    }
    return GLOCK;
  };

  it('墙全在（style 带基 54）→ 幸存;清一格墙 → 整件塌+掉 3645（:44722-44727/:44915）', () => {
    const w = new World(40, 40, 7, 'decor-support-gemlock');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const GLOCK = glSetup(w);
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(10, 10)).toBe(GLOCK);
    w.store.setWall(11, 11, 0);              // 清中格墙（setWall 发监听 → wallhang 门）
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(12, 12)).toBe(0);     // 整件 9 格全清
    expect(drops).toContainEqual({ key: VANILLA_ITEM_KEY_BY_ID[3645], n: 1 });   // GemLocks[1]
  });

  it('帧混格 → 判坏（:44724-44725 逐格 frameX 比对,八批对拍补缺）', () => {
    const w = new World(40, 40, 7, 'decor-support-gemlock-frame');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const GLOCK = glSetup(w);
    w.store.frameX[w.store.idx(12, 12)] = 108 + 2 * 18;   // 右下格改异 style 基
    g.checkFurnitureSupport(11, 11);
    expect(w.store.get(10, 10)).toBe(0);     // 完整性含帧 → 整件塌
    expect(w.store.get(11, 11)).toBe(0);
    expect(drops.length).toBe(1);
  });
});

describe('D-1d 瓦砾/碎砾族（Check3x2 完整性支 / Check2x1 / Check1x1 / Check2x2）', () => {
  it('647 大碎砾 3×2：挖支撑 → 悬空保留（:86899 组→goto case 14→Check3x2 无支撑行=原版同款）', () => {
    const w = new World(40, 40, 7, 'decor-support-rubble');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const RUB = idOfSheet(647), STONE = idOfSheet(1);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, STONE, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, RUB, dx * 18, dy * 18);
    }
    for (let dx = 0; dx < 3; dx++) w.store.setTile(10 + dx, 12, 0);   // 支撑全挖
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(RUB);         // 原版：碎砾自身完整即不塌
    expect(w.store.get(12, 11)).toBe(RUB);
    expect(drops).toEqual([]);
    // 自身缺件 → 塌（Check3x2 完整性 :49640-49647）
    w.store.setTile(11, 10, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('650 小碎砾 1×1 挖支撑 → 塌（Check1x1 :45633）;649 2×1 挖支撑 → 塌（Check2x1 :47379）', () => {
    const w = new World(40, 40, 7, 'decor-support-rubble2');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const S = idOfSheet(650), M = idOfSheet(649), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 11, STONE, 0, 0);
    w.store.setTileSilent(10, 10, S, 0, 0);
    w.store.setTileSilent(12, 11, STONE, 0, 0);
    w.store.setTileSilent(12, 10, M, 0, 0);
    w.store.setTileSilent(13, 10, M, 18, 0);
    w.store.setTile(10, 11, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);           // 650 塌
    w.store.setTile(12, 11, 0);
    g.checkFurnitureSupport(12, 10);
    expect(w.store.get(12, 10)).toBe(0);           // 649 整件塌
    expect(w.store.get(13, 10)).toBe(0);
  });

  it('652 中碎砾 2×2 挖支撑 → 塌（:86949 组→goto case 132→Check2x2 通用支 :48852）', () => {
    const w = new World(40, 40, 7, 'decor-support-rubble3');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const R = idOfSheet(652), STONE = idOfSheet(1);
    for (let dx = 0; dx < 2; dx++) w.store.setTileSilent(10 + dx, 12, STONE, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, R, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(R);
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(11, 11)).toBe(0);
  });
});

describe('D-1e 洞穴装饰/苔藓/染料/水生族', () => {
  it('165 冰凌 fy72 吊顶 1 格：上实心活,挖上 → 塌;fy90 立地 1 格挖下 → 塌（CheckStalactite :39389）', () => {
    const w = new World(40, 40, 7, 'decor-support-stalac');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const ST = idOfSheet(165), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 9, STONE, 0, 0);
    w.store.setTileSilent(10, 10, ST, 0, 72);      // 吊顶档
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(ST);
    w.store.setTile(10, 9, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
    // 立地档
    w.store.setTileSilent(14, 11, STONE, 0, 0);
    w.store.setTileSilent(14, 10, ST, 0, 90);
    g.checkFurnitureSupport(14, 10);
    expect(w.store.get(14, 10)).toBe(ST);
    w.store.setTile(14, 11, 0);
    g.checkFurnitureSupport(14, 10);
    expect(w.store.get(14, 10)).toBe(0);
  });

  it('694 Echo 凌柱 2 格上半（fy0）吊顶锚：挖天花板 → 整段塌（CheckStalactiteEcho :39267）', () => {
    const w = new World(40, 40, 7, 'decor-support-echo');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const E = idOfSheet(694), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 8, STONE, 0, 0);
    w.store.setTileSilent(10, 9, E, 0, 0);
    w.store.setTileSilent(10, 10, E, 0, 18);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(E);
    w.store.setTile(10, 8, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('184 苔藓植物：四邻有苔藓色活,无 → 塌（case 184 :86463+GetTileMossColor :82492）', () => {
    const w = new World(40, 40, 7, 'decor-support-moss');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const MOSS = idOfSheet(184), MOSSTILE = idOfSheet(182);
    w.store.setTileSilent(9, 10, MOSSTILE, 0, 0);
    w.store.setTileSilent(10, 10, MOSS, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(MOSS);        // 左邻苔藓 → 活
    w.store.setTileSilent(20, 10, MOSS, 0, 0);     // 孤格（无苔藓邻）
    g.checkFurnitureSupport(20, 10);
    expect(w.store.get(20, 10)).toBe(0);
  });

  it('227 染料植物默认档立地（CheckDye :54257）;fx238（band7）吊挂档认上方', () => {
    const w = new World(40, 40, 7, 'decor-support-dye');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const DYE = idOfSheet(227), DIRT = idOfSheet(0), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 11, DIRT, 0, 0);
    w.store.setTileSilent(10, 10, DYE, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(DYE);
    w.store.setTile(10, 11, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
    // 吊挂档（fx=7*34=238）：上方实心 → 活
    w.store.setTileSilent(14, 9, STONE, 0, 0);
    w.store.setTileSilent(14, 10, DYE, 238, 0);
    g.checkFurnitureSupport(14, 10);
    expect(w.store.get(14, 10)).toBe(DYE);
  });

  it('571 竹下方须 571/60（CheckBamboo :58933）;549 海草上 3 格全水+沙族地基（:59027）', () => {
    const w = new World(40, 40, 7, 'decor-support-water');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const BAM = idOfSheet(571), SEA = idOfSheet(549), JGRASS = idOfSheet(60), SAND = idOfSheet(53), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 11, JGRASS, 0, 0);
    w.store.setTileSilent(10, 10, BAM, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(BAM);
    w.store.setTile(10, 11, STONE, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
    // 549：上 3 格全水+下方沙 → 活;挖沙 → 塌
    for (let dy = 0; dy <= 2; dy++) {
      const qi = w.store.idx(14, 10 - dy);
      w.store.liquid[qi] = 255; w.store.liquidType[qi] = LIQUID_TYPE.WATER;
    }
    w.store.setTileSilent(14, 11, SAND, 0, 0);
    w.store.setTileSilent(14, 10, SEA, 0, 0);
    g.checkFurnitureSupport(14, 10);
    expect(w.store.get(14, 10)).toBe(SEA);
    w.store.setTile(14, 11, 0);
    g.checkFurnitureSupport(14, 10);
    expect(w.store.get(14, 10)).toBe(0);
  });

  it('519 香蒲地基族表（CheckCatTail :59231）——草上活,石上塌', () => {
    const w = new World(40, 40, 7, 'decor-support-cattail');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const CT = idOfSheet(519), GRASS = idOfSheet(2), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 12, GRASS, 0, 0);
    w.store.setTileSilent(10, 11, CT, 0, 0);
    w.store.setTileSilent(10, 10, CT, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(CT);
    w.store.setTile(10, 12, STONE, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 11)).toBe(0);
    expect(w.store.get(10, 10)).toBe(0);
  });
});

describe('D-1f 树基/侏儒/吊顶/圣诞树/碎砾 2×2/传送器/堆', () => {
  it('583 宝石树基格石上活;挖石 → 塌（CheckTreeWithSettings :54877+GemTreeGroundTest :30585）', () => {
    const w = new World(40, 40, 7, 'decor-support-gemtree');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const GEM = idOfSheet(583), STONE = idOfSheet(1), DIRT = idOfSheet(0);
    w.store.setTileSilent(10, 11, STONE, 0, 0);
    w.store.setTileSilent(10, 10, GEM, 0, 0);
    w.store.setTileSilent(10, 9, GEM, 0, 66);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(GEM);
    w.store.setTile(10, 11, DIRT, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('567 侏儒 1×2（fy0/20）挖地板 → 塌（CheckGnome :54400）', () => {
    const w = new World(40, 40, 7, 'decor-support-gnome');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const GN = idOfSheet(567), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 12, STONE, 0, 0);
    w.store.setTileSilent(10, 10, GN, 0, 0);
    w.store.setTileSilent(10, 11, GN, 0, 20);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(GN);
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(10, 11)).toBe(0);
  });

  it('591 吊盆顶锚：天花在活,挖天花 → 塌（Check2xX 吊挂支 :38464——曾走家具底行支=反向）', () => {
    const w = new World(40, 40, 7, 'decor-support-hangpot');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const HP = idOfSheet(591), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 8, STONE, 0, 0);
    w.store.setTileSilent(11, 8, STONE, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++) {
      w.store.setTileSilent(10 + dx, 9 + dy, HP, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(HP);           // 天花在 → 活（下方悬空同活）
    w.store.setTile(10, 8, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);
    expect(w.store.get(11, 11)).toBe(0);
  });

  it('171 圣诞树中柱支撑挖 → 整树清（CheckXmasTree :39998 SolidTile2 中两柱）', () => {
    const w = new World(40, 40, 7, 'decor-support-xmas');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const XT = idOfSheet(171), STONE = idOfSheet(1);
    w.store.setTileSilent(11, 16, STONE, 0, 0);
    w.store.setTileSilent(12, 16, STONE, 0, 0);
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 8; dy++) {
      w.store.setTileSilent(10 + dx, 8 + dy, XT, dx, dy);   // 帧=列/行序号（:40004-40008）
    }
    g.checkFurnitureSupport(11, 15);
    expect(w.store.get(10, 8)).toBe(XT);
    w.store.setTile(11, 16, 0);
    g.checkFurnitureSupport(11, 15);
    expect(w.store.get(10, 8)).toBe(0);
    expect(w.store.get(13, 15)).toBe(0);           // 4×8 全清
  });

  it('235 传送器 3×1 挖支撑 → 整件塌（Check3x1 :49541）', () => {
    const w = new World(40, 40, 7, 'decor-support-tp');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const TP = idOfSheet(235), STONE = idOfSheet(1);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 11, STONE, 0, 0);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 10, TP, dx * 18, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(TP);
    w.store.setTile(11, 11, 0);
    g.checkFurnitureSupport(11, 10);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(12, 10)).toBe(0);
  });

  it('185 堆 style36-47 雪/冰地基（CheckPile :47313-47355）——雪上活,泥上塌;style0 任意', () => {
    const w = new World(40, 40, 7, 'decor-support-pile');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const P = idOfSheet(185), SNOW = idOfSheet(147), DIRT = idOfSheet(0);
    w.store.setTileSilent(10, 11, SNOW, 0, 0);
    w.store.setTileSilent(10, 10, P, 36 * 18, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(P);           // 雪堆在雪上 → 活
    w.store.setTileSilent(12, 11, DIRT, 0, 0);
    w.store.setTileSilent(12, 10, P, 36 * 18, 0);
    g.checkFurnitureSupport(12, 10);
    expect(w.store.get(12, 10)).toBe(0);           // 雪堆档在泥上 → 塌
    w.store.setTileSilent(14, 11, DIRT, 0, 0);
    w.store.setTileSilent(14, 10, P, 0, 0);
    g.checkFurnitureSupport(14, 10);
    expect(w.store.get(14, 10)).toBe(P);           // style0 任意地基 → 活
  });

  it('630 臭虫 blocker 锚向重定向不杀（CheckStinkbugBlocker :54373）——地板失效转天花板', () => {
    const w = new World(40, 40, 7, 'decor-support-stinkbug');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SB = idOfSheet(630), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 11, STONE, 0, 0);
    w.store.setTileSilent(10, 10, SB, 0, 0);       // style0=地板锚
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(SB);
    w.store.setTileSilent(10, 9, STONE, 0, 0);     // 补天花板（正上方=style1 锚格）
    w.store.setTile(10, 11, 0);                    // 地板没了
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(SB);          // 重定向存活（非杀）
    expect(w.store.frameX[w.store.idx(10, 10)]).toBe(18);   // style1=天花板锚
    // 全失效 → 杀
    w.store.setTile(10, 9, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
  });
});

describe('D-1g 原版无支撑语义=悬空保留（负例,勿误修）', () => {
  it.each([
    ['荆棘 32（非 frameImportant,TileFrame 无支撑语义）', 'v_32_corruption_thorns'],
    ['钱币堆 330（TileFrameImportant 派发落空 return）', 'v_330_copper_coin_pile'],
    ['木梁 124（IsBeam 仅合并帧,无杀）', 'v_124_wooden_beam'],
  ])('%s → checkFurnitureSupport 不清不掉', (_name, key) => {
    const w = new World(40, 40, 7, 'decor-support-noop');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const ID = keyOf(key);
    w.store.setTileSilent(10, 10, ID, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(ID);
    expect(drops).toEqual([]);
  });
});

describe('D-1h 二批补遗（454/590/639/653/696/579/704-706/滴落族）', () => {
  it('454 皮格纳塔 4×3 顶行第 2 列锚（CheckChand :53254 num3=4）——挖天花 → 塌', () => {
    const w = new World(40, 40, 7, 'decor-support-pigronata');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const PG = idOfSheet(454), STONE = idOfSheet(1);
    w.store.setTileSilent(11, 9, STONE, 0, 0);     // 第 2 列（ax+1）上方
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, PG, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(PG);
    w.store.setTile(11, 9, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(13, 12)).toBe(0);
  });

  it('590 宝石树苗=Check1x2 普通支（:43772）——黏土上活（无橡实地基族门）', () => {
    const w = new World(40, 40, 7, 'decor-support-gemsap');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const GS = idOfSheet(590), CLAY = idOfSheet(57);
    w.store.setTileSilent(10, 12, CLAY, 0, 0);
    w.store.setTileSilent(10, 10, GS, 0, 0);
    w.store.setTileSilent(10, 11, GS, 0, 18);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(GS);          // 黏土非橡实地基族,普通支仍活
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('639 法力水晶复制品=CheckOrb 12/639 同支（:48240）——挖底 → 整件清', () => {
    const w = new World(40, 40, 7, 'decor-support-manacrystal');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const MC = idOfSheet(639), STONE = idOfSheet(1);
    for (let dx = 0; dx < 2; dx++) w.store.setTileSilent(10 + dx, 12, STONE, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, MC, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(MC);
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(11, 11)).toBe(0);
  });

  it('653 复制花盆=CheckPot（:57273）2×2+底行 SolidTile2——挖底 → 整件清', () => {
    const w = new World(40, 40, 7, 'decor-support-pot653');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const P = idOfSheet(653), STONE = idOfSheet(1);
    for (let dx = 0; dx < 2; dx++) w.store.setTileSilent(10 + dx, 12, STONE, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, P, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(P);
    w.store.setTile(11, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 11)).toBe(0);
  });

  it('696 影珠复制品=CheckOrb 仅完整性支（:48240 地基行仅 12/639）——悬空保留', () => {
    const w = new World(40, 40, 7, 'decor-support-orb696');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const O = idOfSheet(696);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, O, dx * 18, dy * 18);
    }
    g.checkFurnitureSupport(10, 11);               // 下方悬空 → 仍活（仅完整性）
    expect(w.store.get(10, 10)).toBe(O);
    expect(drops).toEqual([]);
  });

  it('579 石巨人头=下方 SolidTileAllowBottomSlope 单判据（CheckRockGolemHead :54282）', () => {
    const w = new World(40, 40, 7, 'decor-support-golemhead');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const RH = idOfSheet(579), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 11, STONE, 0, 0);
    w.store.setTileSilent(10, 10, RH, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(RH);
    w.store.setTile(10, 11, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('373 水滴族=IsADripTile 顶锚（:86390）——上方实心活,挖顶 → 塌', () => {
    const w = new World(40, 40, 7, 'decor-support-drip');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const DR = idOfSheet(373), STONE = idOfSheet(1);
    w.store.setTileSilent(10, 9, STONE, 0, 0);
    w.store.setTileSilent(10, 10, DR, 0, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(DR);
    w.store.setTile(10, 9, 0);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('706 圣剑龛 3×2 完整性支（goto case 14 链）——挖支撑悬空保留,自身缺件才塌', () => {
    const w = new World(40, 40, 7, 'decor-support-shrine706');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SH = idOfSheet(706), STONE = idOfSheet(1);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, STONE, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, SH, dx * 18, dy * 18);
    }
    for (let dx = 0; dx < 3; dx++) w.store.setTile(10 + dx, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(SH);          // 支撑掏空不塌（无支撑行）
    w.store.setTile(11, 10, 0);
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);           // 自身缺件 → 塌
  });
});

// ================= 2026-09-02 九批（红蓝对抗后裁定存活项修复批） =================
// M-1：387 闭态活板门幸存链（CheckTrapDoor 387 臂 :52059-52063 完整性 CheckTileFrames
// :52245 + 左右外格 mode1 StrictSolid :52063/:52261-52276;失配杀+掉 3239 :52090-52108）。
// 387 常态来源 = WldImport copyFrame + 电线开合 devices.ts case 386/387（无放置物品）。
describe('九批 M-1：387 闭态活板门（CheckTrapDoor 387 臂）', () => {
  /** 几何：门 2×1 行 10 列 10..11（frameX=dx*18,frameY=0）;侧锚列 9/12 实心 */
  const tdSetup = (w: World, tid: number) => {
    const st = w.store;
    const SN = idOfSheet(1);
    st.setTileSilent(9, 10, SN, 0, 0);
    st.setTileSilent(12, 10, SN, 0, 0);
    st.setTileSilent(10, 10, tid, 0, 0);
    st.setTileSilent(11, 10, tid, 18, 0);
  };
  it('侧锚在 → 两格派发均幸存;挖一侧支承 → 整件清+掉 3239（:52063/:52090-52108）', () => {
    const w = new World(40, 40, 7, 'decor-support-td387');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const TD = idOfSheet(387);
    tdSetup(w, TD);
    g.checkFurnitureSupport(10, 10);          // 左格派发
    expect(w.store.get(10, 10)).toBe(TD);
    g.checkFurnitureSupport(11, 10);          // 右格派发（锚反推=10）
    expect(w.store.get(11, 10)).toBe(TD);
    w.store.setTile(9, 10, 0);                // 挖左侧支承
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 10)).toBe(0);
    // 掉落语义=item 3239（CheckTrapDoor :52097-52108 Item.NewItem(3239)）——本仓
    // 走 multiTileDropKey place_v_ 兜底（item 3239 createTile=387 同语义,D-8 备案族;
    // vi_3239_Trapdoor def 在册但 placeable 兜底优先,备案）
    expect(drops).toContainEqual({ key: 'place_v_387_trap_door_closed', n: 1 });
  });
  it('侧锚扰动对照（右锚旁格非锚）→ 幸存;帧失配（异 36 带基）→ 判坏清（CheckTileFrames）', () => {
    const w = new World(40, 40, 7, 'decor-support-td387-ctrl');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const TD = idOfSheet(387), STONE = idOfSheet(1);
    tdSetup(w, TD);
    w.store.setTileSilent(12, 9, STONE, 0, 0);
    w.store.setTile(12, 9, 0);                // 右锚上方旁格扰动（非锚）
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(TD);
    // 帧带基失配：右格 frameX 改 36+18=54（styleX=1 的 dx=0 位）→ 与左格(0)不同带
    w.store.frameX[w.store.idx(11, 10)] = 54;
    g.checkFurnitureSupport(11, 10);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 10)).toBe(0);
  });
});

// B-1：相邻共边罐不被越权收编（原版 PlacePot :54529-54566 净空只查自身 2×2+底行 →
// 相邻罐合法;CheckPot 杀环 :57347-57356 只杀本件 2×2 → loot 各掉各的 :57490）。
describe('九批 B-1：smashPot 帧解码收集（相邻共边罐隔离）', () => {
  /** A 罐列 10..11、B 罐列 12..13（共竖边）,行 9(fy=0)/10(fy=18),锚行 11 实心 */
  const potsSetup = (w: World) => {
    const st = w.store;
    const POT = idOfSheet(28), STONE = idOfSheet(1);
    for (let x = 9; x <= 14; x++) st.setTileSilent(x, 11, STONE, 0, 0);
    for (let k = 0; k < 2; k++) {
      for (const [row, fy] of [[9, 0], [10, 18]] as const) {
        st.setTileSilent(10 + k, row, POT, k * 18, fy);            // A（variant 0）
        st.setTileSilent(12 + k, row, POT, 36 + k * 18, fy);       // B（variant 36）
      }
    }
    return POT;
  };
  it('敲 A → A 4 格清、B 4 格幸存、loot 恰 1 次;再敲 B → loot 累计 2 次', () => {
    const w = new World(40, 40, 7, 'decor-support-pot-adj');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const POT = potsSetup(w);
    const loot = vi.fn();
    g.potLoot = loot;
    (g.smashPot as (x: number, y: number) => void).call(g, 11, 10);   // A 右下格
    expect(w.store.get(10, 9)).toBe(0);
    expect(w.store.get(11, 10)).toBe(0);
    expect(w.store.get(12, 9)).toBe(POT);
    expect(w.store.get(13, 10)).toBe(POT);
    expect(loot).toHaveBeenCalledTimes(1);
    (g.smashPot as (x: number, y: number) => void).call(g, 13, 9);   // B 右上格
    expect(w.store.get(12, 10)).toBe(0);
    expect(w.store.get(13, 9)).toBe(0);
    expect(loot).toHaveBeenCalledTimes(2);
  });
  it('单罐对照：任一格触发 → 整罐 2×2 清（帧解码锚反推）', () => {
    const w = new World(40, 40, 7, 'decor-support-pot-solo');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const POT = potsSetup(w);
    const loot = vi.fn();
    g.potLoot = loot;
    // 只留 A：清 B 的 4 格（静默,不触发链）
    for (let x = 12; x <= 13; x++) for (let y = 9; y <= 10; y++) w.store.setTileSilent(x, y, 0, 0, 0);
    (g.smashPot as (x: number, y: number) => void).call(g, 12, 9 - 1 + 1);   // 越界格无害
    (g.smashPot as (x: number, y: number) => void).call(g, 10, 10);
    for (let x = 10; x <= 11; x++) for (let y = 9; y <= 10; y++) expect(w.store.get(x, y)).toBe(0);
    expect(loot).toHaveBeenCalledTimes(1);
  });
});

// m-4：武器架 334 带 5000 系帧剥离（CheckWeaponsRack :46802-46810 锚格/:46819-46827
// 各格剥 5000 系再 %54;标记=PlaceWeapon Player.cs:54721+ :54795/:54796 写
// 5000+100+itemType / 10000+prefix,二行带 20000/25000 :54790-54794）。
describe('九批 m-4：334 武器架 5000 系帧剥离（wallhang 支）', () => {
  /** 3×3 架列 10..12 行 10..12,背墙全 1;中行左格挂武器（5000+100+id）右格前缀（10000+prefix） */
  const rackSetup = (w: World, marked = true) => {
    const st = w.store;
    const RK = idOfSheet(334);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      const x = 10 + dx, y = 10 + dy;
      w.store.setWall(x, y, 1);
      w.store.setTileSilent(x, y, RK, dx * 18, dy * 18);
    }
    if (marked) {
      st.frameX[st.idx(10, 11)] = 5100 + 123;    // 5000+100+itemType（ itemId=123 ）
      st.frameX[st.idx(11, 11)] = 10000 + 5;     // 10000+prefix
    }
    return RK;
  };
  it('带武器架（5000 系标记帧）：邻格扰动 → 整架幸存（剥离后列号 0/18 自洽）', () => {
    const w = new World(40, 40, 7, 'decor-support-rack334');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const RK = rackSetup(w);
    const STONE = idOfSheet(1);
    w.store.setTileSilent(9, 11, STONE, 0, 0);
    w.store.setTile(9, 11, 0);                 // 左侧旁格扰动（非架体）
    g.checkFurnitureSupport(10, 11);           // 自带标记格派发（锚剥离解码）
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(w.store.get(10 + dx, 10 + dy)).toBe(RK);
    }
  });
  it('无标记对照幸存;清一角墙 → 整架塌（Check3x3Wall 逐格 wall 门同链）', () => {
    const w = new World(40, 40, 7, 'decor-support-rack334-ctrl');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const RK = rackSetup(w, false);
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(RK);
    w.store.setWall(10, 10, 0);                // 清一角墙（监听链 → wallhang 逐格 wall 门）
    g.checkFurnitureSupport(10, 10);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(12, 12)).toBe(0);
  });
});
