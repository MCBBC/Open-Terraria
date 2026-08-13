// 摇树子系统 1:1 回归（WorldGen.ShakeTree WorldGen.cs:63169-63462）。
// 覆盖：树底归位/树型门/掉落表分支序/每日一摇冷却/无叶顶与实心门消耗份额/
// 棕榈绿洲门/昼夜门/渲染查询。
//
// 掷骰用 ScriptedRNG 队列驱动：`int(min,max)` 按序吐队列值，0 = 命中该支
// （原版 `genRand.Next(n) == 0`）。默认主机（无秘密种子/白天/非万圣）下，
// 各分支门从左到右短路求值，除 notTheBees/getGoodWorld/remix 三个宿主门在最左
// （假值不掷）外，每支 miss 恰好消耗 1 掷——因此"第 r 掷命中"= r 个 1 后跟 0。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import {
  TreeShakeState, TreeTypes, TREE_SHAKEABLE_SHEETS, shakeTree,
  getTreeBottom, getTreeTypeAndTreeBottom, isTileALeafyTreeTop, isPalmOasisTree,
  type TreeShakeHost, type TreeShakeSinks, type TreeShakeNpcOpts,
} from '../src/world/TreeShake';

/** 队列驱动 RNG：int/next 按序吐值；空队列回"未命中"档（0 起 → 1，其余 → min） */
class ScriptedRNG extends RNG {
  constructor() { super(1); }
  private q: number[] = [];
  push(...v: number[]): this { this.q.push(...v); return this; }
  next(): number { return this.q.length ? this.q.shift()! : 0.5; }
  int(min: number, _max: number): number {
    if (!this.q.length) return min === 0 ? 1 : min;
    const v = this.q.shift()!;
    return v;
  }
  /** NextFromList 走 nextInt（Utils/主表族）——同样入队驱动 */
  nextInt(maxValue: number): number {
    return this.int(0, maxValue - 1);
  }
}

const TREE = TILE_BY_KEY['tree']!;              // sheet 5
const GRASS = TILE_BY_KEY['grass']!;            // sheet 2
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;              // sheet 147
const HALLOW_GRASS = TILE_BY_KEY['v_109_hallowed_grass_block']!;
const CORRUPT_GRASS = TILE_BY_KEY['v_23_corrupt_grass_block']!;
const CRIMSON_GRASS = TILE_BY_KEY['v_199_crimson_grass_block']!;
const ASH_GRASS = TILE_BY_KEY['v_633_ash_grass_block']!;
const SAND = TILE_BY_KEY['sand']!;              // sheet 53
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block']!;
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block']!;
const PEARLSAND = TILE_BY_KEY['v_116_pearlsand_block']!;
const PALM = TILE_BY_KEY['v_323_palm_trees']!;
const MUSHROOM_TREE = TILE_BY_KEY['v_72_mushroom_tree']!;
const GEM_TREE = TILE_BY_KEY['v_583_topaz_tree']!;
const STONE = TILE_BY_KEY['stone']!;

function sheetTile(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
  return i;
}

interface Log {
  items: Array<{ vid: number; stack: number; x: number; y: number }>;
  npcs: Array<{ vid: number; x: number; y: number; o?: TreeShakeNpcOpts }>;
  bombs: Array<{ vid: number; vx: number }>;
  hives: number;
  leaves: number;
  ashDust: number;
}

function makeLog(): { log: Log; sinks: TreeShakeSinks } {
  const log: Log = { items: [], npcs: [], bombs: [], hives: 0, leaves: 0, ashDust: 0 };
  return {
    log,
    sinks: {
      item: (vid, x, y, stack) => { log.items.push({ vid, stack, x, y }); },
      npc: (vid, x, y, o) => { log.npcs.push({ vid, x, y, o }); },
      bomb: (vid, _x, _y, vx) => { log.bombs.push({ vid, vx }); },
      beehive: () => { log.hives++; },
      leaf: () => { log.leaves++; },
      ashDust: () => { log.ashDust++; },
    },
  };
}

function makeHost(world: World, over: Partial<TreeShakeHost> = {}): TreeShakeHost {
  return {
    st: world.store,
    isDay: true,
    halloween: false,
    raining: false,
    windyForButterflies: false,
    tenthAnniversary: false,
    getGoodWorld: false,
    remixWorld: false,
    notTheBees: false,
    drunkWorld: false,
    luck: 0,
    ...over,
  };
}

/** 造一棵普通树：x 列，干身 rows topY..groundY-1，顶格带冠标记帧 (22,198)，
 *  ground 行放地面块。树顶上方留空（climb 停靠点） */
function plantTree(world: World, x: number, groundY: number, groundTile: number, topY: number) {
  world.store.setTile(x, groundY, groundTile, 0, 0);
  for (let y = topY; y < groundY; y++) {
    world.store.setTile(x, y, TREE, 0, 0);
  }
  world.store.setTile(x, topY, TREE, 22, 198);   // 冠顶标记帧（IsTileALeafyTreeTop）
}

/** 新世界（宽 800 供绿洲判定 x>=380 用） */
function newWorld(): World {
  return new World(800, 200, 42, '摇树测试');
}

// ---- 默认主机下各分支的掷骰序号（miss 路径每支恰 1 掷；宿主门假值不掷） ----
// 0:832  1:933  2:3360  3:3361  4:5517  5:4366  6:5629  7:橡实  8:蘑菇194
// 9:臭蛋 10:砍树木 11:钱币 12:单小动物 13:仙灵 14:猫头鹰 15:鹦鹉 16:渡鸦
// 17:五雀 18:五蜂 19:海鸥 20:crimera 21:eater 22:丛林蝠 23:蜂巢 24:蝴蝶
// 25:灰烬动物 26:森林果 27:雪果 28:丛林果 29:棕榈果 30:腐化果 31:神圣果
// 32:猩红果 33:灰烬果
function hitRoll(r: number): ScriptedRNG {
  const rng = new ScriptedRNG();
  for (let i = 0; i < r; i++) rng.push(1);   // 前序支全部 miss
  rng.push(0);                               // 命中第 r 支
  return rng;
}

describe('摇树：树底归位与树型门', () => {
  it('getTreeBottom 从干身命中格下探到地面行', () => {
    const w = newWorld();
    plantTree(w, 100, 20, GRASS, 15);
    expect(getTreeBottom(w.store, 100, 17)).toEqual({ x: 100, y: 20 });
    expect(getTreeBottom(w.store, 100, 15)).toEqual({ x: 100, y: 20 });
  });

  it('草地/丛林/蘑菇/雪/神圣/腐化/猩红/灰烬 → 对应 TreeTypes', () => {
    const cases: Array<[number, TreeTypes]> = [
      [GRASS, TreeTypes.Forest], [JUNGLE_GRASS, TreeTypes.Jungle],
      [MUSHROOM_GRASS, TreeTypes.Mushroom], [SNOW, TreeTypes.Snow],
      [HALLOW_GRASS, TreeTypes.Hallowed], [CORRUPT_GRASS, TreeTypes.Corrupt],
      [CRIMSON_GRASS, TreeTypes.Crimson], [ASH_GRASS, TreeTypes.Ash],
    ];
    for (const [g, want] of cases) {
      const w = newWorld();
      plantTree(w, 100, 20, g, 15);
      expect(getTreeTypeAndTreeBottom(w.store, 100, 17).type).toBe(want);
    }
  });

  it('宝石树长在石上 → TreeTypes.None → 摇不出任何东西且不占表（:63181）', () => {
    const w = newWorld();
    worldWithGemTree(w);
    const { log, sinks } = makeLog();
    const st = new TreeShakeState();
    const rng = new ScriptedRNG();   // 全 miss 也无所谓——None 门在前
    const res = shakeTree(makeHost(w), sinks, st, rng, new ScriptedRNG(), 100, 15);
    expect(res?.treeType).toBe(TreeTypes.None);
    expect(res?.shook).toBe(false);
    expect(log.items.length + log.npcs.length).toBe(0);
    expect(st.size).toBe(0);
  });

  it('IsShakeable 集合 = 13 项树族（TileID.cs:163），仙人掌 80 不在', () => {
    expect(TREE_SHAKEABLE_SHEETS.has(5)).toBe(true);
    expect(TREE_SHAKEABLE_SHEETS.has(72)).toBe(true);
    expect(TREE_SHAKEABLE_SHEETS.has(323)).toBe(true);
    expect([...Array.from({ length: 7 }, (_, i) => 583 + i)] .every((s) => TREE_SHAKEABLE_SHEETS.has(s))).toBe(true);
    expect(TREE_SHAKEABLE_SHEETS.has(596)).toBe(true);
    expect(TREE_SHAKEABLE_SHEETS.has(616)).toBe(true);
    expect(TREE_SHAKEABLE_SHEETS.has(634)).toBe(true);
    expect(TREE_SHAKEABLE_SHEETS.size).toBe(13);
    expect(TREE_SHAKEABLE_SHEETS.has(80)).toBe(false);
    expect(TREE_SHAKEABLE_SHEETS.has(488)).toBe(false);
    expect(TREE_SHAKEABLE_SHEETS.has(704)).toBe(false);
  });

  it('冠顶标记帧判定（IsTileALeafyTreeTop :29836）', () => {
    const w = newWorld();
    w.store.setTile(50, 10, TREE, 22, 198);
    expect(isTileALeafyTreeTop(w.store, 50, 10)).toBe(true);
    w.store.setTile(50, 10, TREE, 22, 242);
    expect(isTileALeafyTreeTop(w.store, 50, 10)).toBe(true);
    w.store.setTile(50, 10, TREE, 22, 176);
    expect(isTileALeafyTreeTop(w.store, 50, 10)).toBe(false);
    w.store.setTile(50, 10, TREE, 0, 0);
    expect(isTileALeafyTreeTop(w.store, 50, 10)).toBe(false);
    // 棕榈 frameX>=88（:29841）
    w.store.setTile(50, 10, PALM, 88, 0);
    expect(isTileALeafyTreeTop(w.store, 50, 10)).toBe(true);
    w.store.setTile(50, 10, PALM, 66, 0);
    expect(isTileALeafyTreeTop(w.store, 50, 10)).toBe(false);
  });
});

function worldWithGemTree(w: World) {
  w.store.setTile(100, 20, STONE, 0, 0);
  for (let y = 15; y < 20; y++) w.store.setTile(100, y, GEM_TREE, 0, 0);
  w.store.setTile(100, 15, GEM_TREE, 22, 198);
}

describe('摇树：掉落表分支（默认主机 + 森林树）', () => {
  it('1/300 活木魔杖 832（:63219）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    shakeTree(makeHost(w), sinks, new TreeShakeState(), hitRoll(0), new ScriptedRNG(), 100, 16);
    expect(log.items.map((i) => i.vid)).toEqual([832]);
  });

  it('1/300 树叶魔杖 933（:63223）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    shakeTree(makeHost(w), sinks, new TreeShakeState(), hitRoll(1), new ScriptedRNG(), 100, 16);
    expect(log.items.map((i) => i.vid)).toEqual([933]);
  });

  it('1/7 橡实 ×1-2（:63247）——stack 走 Next(1,3) 闭区间', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(7); gen.push(2);          // 命中后栈掷 Next(1,3)=2
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
    expect(log.items).toEqual([{ vid: 27, stack: 2, x: 100 * 16, y: 15 * 16 }]);
  });

  it('1/20 钱币：默认铜币 71 ×50-99（:63269/:63270）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(11); gen.push(77);        // Next(50,100)
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
    expect(log.items).toEqual([{ vid: 71, stack: 77, x: 1600, y: 240 }]);
  });

  it('1/20 钱币：金 1/30 分支 73（:63272）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(11); gen.push(50).push(0).push(1);   // num3=Next(50,100) → Next(30)==0 → Next(5)!=0
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
    expect(log.items[0].vid).toBe(73);
    expect(log.items[0].stack).toBe(1);
  });

  it('1/15 单只小动物（:63302 五选一表）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(12); gen.push(3);         // Next(5)=3 → 松鼠 299
    const main = new ScriptedRNG(); main.push(1); // rollLuck(luck=0) → Next(400)!=0
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, main, 100, 16);
    expect(log.npcs.map((n) => n.vid)).toEqual([299]);
  });

  it('1/15 小动物金动物门：luck 命中 → 539/442（:63309）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(12); gen.push(0);         // Next(5)=0 → 雀 74
    const main = new ScriptedRNG();
    main.push(0.1);   // Luck.RollLuck: luck>0 且 NextFloat()<luck → 改掷 [range/2,range)
    main.push(0);     // 改掷结果 == 0 → 金动物门命中
    shakeTree(makeHost(w, { luck: 0.5 }), sinks, new TreeShakeState(), gen, main, 100, 16);
    expect(log.npcs.map((n) => n.vid)).toEqual([539]);
  });

  it('1/12 森林水果五选一（:63409）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    for (const [roll, want] of [[0, 4009], [1, 4293], [2, 4282], [3, 4290], [4, 4291]] as const) {
      const { log, sinks } = makeLog();
      const gen = hitRoll(26); gen.push(roll);
      shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
      expect(log.items.map((i) => i.vid)).toEqual([want]);
    }
  });

  it('1/12 砍树木支 → 森林木 9（KillTile_GetTreeDrops :66277）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(10); gen.push(2);         // 栈 Next(1,4)=2
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
    expect(log.items).toEqual([{ vid: 9, stack: 2, x: 1600, y: 240 }]);
  });

  it('全 miss → 无掉落，但叶爆 FX 照发（TreeGrowFX hitTree 3+5=8 叶）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = new ScriptedRNG();
    for (let i = 0; i < 40; i++) gen.push(1);
    const main = new ScriptedRNG();
    for (let i = 0; i < 20; i++) main.push(0.5);
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, main, 100, 16);
    expect(log.items.length).toBe(0);
    expect(log.npcs.length).toBe(0);
    expect(log.leaves).toBe(8);      // :29769-29787 直排 3 + hitTree 尾爆 5
    expect(log.ashDust).toBe(0);
  });
});

describe('摇树：树型/世界门', () => {
  it('夜间神圣树仙灵 1/50（:63316 需 Hallowed+!dayTime）——白天不出', () => {
    const w = newWorld(); plantTree(w, 100, 20, HALLOW_GRASS, 15);
    const { log, sinks } = makeLog();
    shakeTree(makeHost(w), sinks, new TreeShakeState(), hitRoll(13), new ScriptedRNG(), 100, 16);
    expect(log.npcs.length).toBe(0);
  });

  it('夜间森林猫头鹰 611 + vy=1（:63325）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    shakeTree(makeHost(w, { isDay: false }), sinks, new TreeShakeState(),
      hitRoll(14), new ScriptedRNG(), 100, 16);
    expect(log.npcs).toEqual([{ vid: 611, x: 1600, y: 240, o: { vy: 1 } }]);
  });

  it('白天丛林鹦鹉族五选一（:63331 NextFromList）', () => {
    const w = newWorld(); plantTree(w, 100, 20, JUNGLE_GRASS, 15);
    const { log, sinks } = makeLog();
    const main = new ScriptedRNG(); main.push(2);   // NextFromList 索引 2 → 673
    shakeTree(makeHost(w), sinks, new TreeShakeState(), hitRoll(15), main, 100, 16);
    expect(log.npcs.map((n) => n.vid)).toEqual([673]);
    expect(log.npcs[0].o).toEqual({ vy: 1 });
  });

  it('蘑菇树 1/8 发光蘑菇 194 且 stack 恒 1（:63251 Next(1,2)）', () => {
    const w = newWorld(); plantTree(w, 100, 20, MUSHROOM_GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(8); gen.push(1);            // Next(1,2) → 1
    shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
    expect(log.items).toEqual([{ vid: 194, stack: 1, x: 1600, y: 240 }]);
  });

  it('灰烬树 250 深度门：地表灰烬树不出灰烬动物（:63392 bottomY>h-250）', () => {
    // 世界需足够高让 h-250 真正落在树顶之下（200 高世界 h-250<0 门恒真，测不出）
    const w = new World(800, 600, 42, '高世界');
    plantTree(w, 100, 20, ASH_GRASS, 15);   // 顶行 15 < 600-250=350 → 门不通过
    const { log, sinks } = makeLog();
    shakeTree(makeHost(w), sinks, new TreeShakeState(), hitRoll(25), new ScriptedRNG(), 100, 16);
    expect(log.npcs.length).toBe(0);
  });

  it('灰烬树深度门内：五雀支前置 roll miss 序不同——灰烬动物 654/653/655（:63394）', () => {
    const w = new World(800, 60, 42, '深灰烬');
    plantTree(w, 100, 55, ASH_GRASS, 50);           // 顶行 50 > 60-250 恒真
    for (const [roll, want] of [[0, 654], [1, 653], [2, 655]] as const) {
      const { log, sinks } = makeLog();
      const gen = hitRoll(25); gen.push(roll);
      shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 51);
      expect(log.npcs.map((n) => n.vid)).toEqual([want]);
    }
  });

  it('万圣季臭蛋 1/35（:63255 需 Main.halloween）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = hitRoll(9); gen.push(2);
    shakeTree(makeHost(w, { halloween: true }), sinks, new TreeShakeState(),
      gen, new ScriptedRNG(), 100, 16);
    expect(log.items[0].vid).toBe(1809);
  });

  it('FTW 世界 1/17 落炸弹 28（:63215），十周年换 75 且概率 1/34', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    // getGoodWorld 分支在宿主门之后、832 支之前：主机开 FTW 后它是第 0 掷
    const { log, sinks } = makeLog();
    const gen = new ScriptedRNG(); gen.push(0);
    shakeTree(makeHost(w, { getGoodWorld: true }), sinks, new TreeShakeState(),
      gen, new ScriptedRNG(), 100, 16);
    expect(log.bombs.map((b) => b.vid)).toEqual([28]);
    // 十周年（非 remix）→ 75
    const { log: log2, sinks: sinks2 } = makeLog();
    const gen2 = new ScriptedRNG(); gen2.push(0);
    shakeTree(makeHost(w, { getGoodWorld: true, tenthAnniversary: true }), sinks2,
      new TreeShakeState(), gen2, new ScriptedRNG(), 100, 16);
    expect(log2.bombs.map((b) => b.vid)).toEqual([75]);
  });

  it('十周年×notthebees×非drunk 1/50 蜂榴弹 1130 ×12-20（:63210 掉在命中格）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const { log, sinks } = makeLog();
    const gen = new ScriptedRNG(); gen.push(0).push(15);
    shakeTree(makeHost(w, { tenthAnniversary: true, notTheBees: true }), sinks,
      new TreeShakeState(), gen, new ScriptedRNG(), 100, 16);
    expect(log.items).toEqual([{ vid: 1130, stack: 15, x: 1600, y: 256 }]);  // 命中格 y=16
  });
});

describe('摇树：棕榈族', () => {
  /** 棕榈（sheet 323）：多格干身 + 顶格冠（frameX>=88）；地面块在干基下一行。
   *  ★单格棕榈的树顶±2窗会罩住地面实心 → 原版同样摇空（SolidTiles 门 :63199），
   *    真实棕榈干身数格，冠顶窗口够不到地面 */
  function plantPalm(w: World, x: number, groundY: number, groundTile: number, trunkTop = 24) {
    w.store.setTile(x, groundY, groundTile, 0, 0);
    for (let y = trunkTop; y < groundY; y++) w.store.setTile(x, y, PALM, 0, 0);
    w.store.setTile(x, trunkTop, PALM, 88, 0);   // 冠顶（IsTileALeafyTreeTop :29841）
  }

  it('GetTreeBottom 棕榈支：向下穿棕榈格到地面（:63474-63483）', () => {
    const w = newWorld();
    plantPalm(w, 400, 30, SAND);
    expect(getTreeBottom(w.store, 400, 27)).toEqual({ x: 400, y: 30 });
    expect(getTreeTypeAndTreeBottom(w.store, 400, 27).type).toBe(TreeTypes.Palm);
  });

  it('棕榈地面沙种决定 Palm 变体（112 腐化/234 猩红/116 神圣）', () => {
    const w = newWorld();
    plantPalm(w, 400, 30, EBONSAND);
    expect(getTreeTypeAndTreeBottom(w.store, 400, 29).type).toBe(TreeTypes.PalmCorrupt);
    plantPalm(w, 401, 30, CRIMSAND);
    expect(getTreeTypeAndTreeBottom(w.store, 401, 29).type).toBe(TreeTypes.PalmCrimson);
    plantPalm(w, 402, 30, PEARLSAND);
    expect(getTreeTypeAndTreeBottom(w.store, 402, 29).type).toBe(TreeTypes.PalmHallowed);
  });

  it('IsPalmOasisTree 语义：海滩 380 格外（地图中部=沙漠）才是绿洲棕榈（:27352）', () => {
    const w = newWorld();                            // 宽 800 → 绿洲带 [380, 420]
    plantPalm(w, 100, 30, SAND);                     // x=100 < 380 = 海滩棕榈
    expect(isPalmOasisTree(w.store, 100)).toBe(false);
    plantPalm(w, 400, 30, SAND);                     // 地图中部 = 绿洲/沙漠棕榈
    expect(isPalmOasisTree(w.store, 400)).toBe(true);
    // 海鸥支（roll 19）与棕榈果支（roll 29）只给海滩棕榈——对绿洲棕榈落空
    for (const r of [19, 29]) {
      const { log, sinks } = makeLog();
      shakeTree(makeHost(w), sinks, new TreeShakeState(), hitRoll(r), new ScriptedRNG(), 400, 27);
      expect(log.npcs.length + log.items.length).toBe(0);
    }
  });

  it('海滩棕榈 1/20 海鸥 603（:63363）与 1/12 椰子/香蕉（:63426）', () => {
    const w = newWorld();
    plantPalm(w, 100, 30, SAND);                     // x=100 海滩（非绿洲）
    const a = makeLog();
    shakeTree(makeHost(w), a.sinks, new TreeShakeState(), hitRoll(19), new ScriptedRNG(), 100, 27);
    expect(a.log.npcs.map((n) => n.vid)).toEqual([603]);
    for (const [roll, want] of [[1, 4287], [0, 4283]] as const) {   // Next(2)!=0 → 4287
      const { log, sinks } = makeLog();
      const gen = hitRoll(29); gen.push(roll);      // Next(2)
      shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 27);
      expect(log.items.map((i) => i.vid)).toEqual([want]);
    }
  });

  it('蘑菇树（多格干身）可摇：顶格冠标记帧 + 树顶 ±2 避开地面实心（:63199）', () => {
    // ★单格蘑菇树树顶±2窗会罩住地面实心 → 原版同样摇空（SolidTiles 门）——
    //   真实巨型蘑菇干身数格，窗口够不到地面
    const w = newWorld();
    w.store.setTile(100, 20, MUSHROOM_GRASS, 0, 0);
    for (let y = 14; y < 20; y++) w.store.setTile(100, y, MUSHROOM_TREE, 0, 0);
    w.store.setTile(100, 14, MUSHROOM_TREE, 22, 198);
    const { log, sinks } = makeLog();
    const gen = new ScriptedRNG();
    for (let i = 0; i < 40; i++) gen.push(1);
    const res = shakeTree(makeHost(w), sinks, new TreeShakeState(), gen, new ScriptedRNG(), 100, 19);
    expect(res?.shook).toBe(true);
    expect(log.leaves).toBe(8);
  });
});

describe('摇树：每日一摇状态机（WorldGen.cs:4353-4359/:63164）', () => {
  it('同树第二次摇：不重复登记也不掉落（:63183-63189 去重扫描）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const st = new TreeShakeState();
    const a = makeLog();
    const gen1 = new ScriptedRNG();
    for (let i = 0; i < 40; i++) gen1.push(1);
    shakeTree(makeHost(w), a.sinks, st, gen1, new ScriptedRNG(), 100, 16);
    expect(st.size).toBe(1);
    expect(a.log.leaves).toBe(8);
    // 第二次：全命中序列也摇不出（今日已摇）
    const b = makeLog();
    const res = shakeTree(makeHost(w), b.sinks, st, hitRoll(7), new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(false);
    expect(b.log.items.length + b.log.leaves).toBe(0);
    expect(st.size).toBe(1);
  });

  it('同一棵树不同高度命中格 → 同一登记键（树底去重而非命中格去重）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const st = new TreeShakeState();
    const a = makeLog();
    const gen1 = new ScriptedRNG();
    for (let i = 0; i < 40; i++) gen1.push(1);
    shakeTree(makeHost(w), a.sinks, st, gen1, new ScriptedRNG(), 100, 18);   // 命中格 y=18
    const b = makeLog();
    const res = shakeTree(makeHost(w), b.sinks, st, hitRoll(7), new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(false);
    expect(st.size).toBe(1);
  });

  it('reset 后可再摇（UpdateTime_StartDay Main.cs:64846）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const st = new TreeShakeState();
    const a = makeLog();
    const gen1 = new ScriptedRNG();
    for (let i = 0; i < 40; i++) gen1.push(1);
    shakeTree(makeHost(w), a.sinks, st, gen1, new ScriptedRNG(), 100, 16);
    st.reset();
    expect(st.size).toBe(0);
    const b = makeLog();
    const res = shakeTree(makeHost(w), b.sinks, st, hitRoll(7), new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(true);
    expect(b.log.items[0].vid).toBe(27);
  });

  it('无叶顶的树：份额被消耗但零掉落（:63190 注册先于 :63199 门）', () => {
    const w = newWorld();
    w.store.setTile(100, 20, GRASS, 0, 0);
    for (let y = 15; y < 20; y++) w.store.setTile(100, y, TREE, 0, 0);  // 顶格无冠标记
    const st = new TreeShakeState();
    const { log, sinks } = makeLog();
    const res = shakeTree(makeHost(w), sinks, st, hitRoll(7), new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(false);
    expect(log.items.length + log.leaves).toBe(0);
    expect(st.size).toBe(1);          // ★已登记——当日份额已消耗（原版行为）
  });

  it('树顶被实心块围死：同样消耗份额零掉落（:63199 SolidTiles 门）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    w.store.setTile(102, 16, STONE, 0, 0);          // 树顶 ±2 内实心
    const st = new TreeShakeState();
    const { log, sinks } = makeLog();
    const res = shakeTree(makeHost(w), sinks, st, hitRoll(7), new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(false);
    expect(log.items.length).toBe(0);
    expect(st.size).toBe(1);
  });

  it('满 500 表拒收（maxTreeShakes :63171）', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const st = new TreeShakeState();
    for (let k = 0; k < 500; k++) expect(st.register(k, 30)).toBe(true);
    const { log, sinks } = makeLog();
    const res = shakeTree(makeHost(w), sinks, st, hitRoll(7), new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(false);
    expect(log.items.length).toBe(0);
    expect(st.size).toBe(500);
  });
});

describe('摇树：渲染查询（getTreeShake，非原版机制）', () => {
  it('命中后可查到脉冲，任意同树格归位同一键', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const st = new TreeShakeState();
    st.bind(w.store);
    const { sinks } = makeLog();
    const gen = new ScriptedRNG();
    for (let i = 0; i < 40; i++) gen.push(1);
    const res = shakeTree(makeHost(w), sinks, st, gen, new ScriptedRNG(), 100, 16);
    expect(res?.shook).toBe(true);
    st.notePulse(res!.bottomX, res!.groundY, 1000, -1);
    // 树干中段格查询 → 同一脉冲
    const p = st.getTreeShake(100, 17, 1010);
    expect(p).toEqual({ since: 10, dir: -1 });
    // 无脉冲的树 → null
    expect(st.getTreeShake(300, 17, 1010)).toBeNull();
  });

  it('reset 同时清脉冲', () => {
    const w = newWorld(); plantTree(w, 100, 20, GRASS, 15);
    const st = new TreeShakeState();
    st.bind(w.store);
    st.notePulse(100, 20, 5, 1);
    expect(st.getTreeShake(100, 17, 6)).not.toBeNull();
    st.reset();
    expect(st.getTreeShake(100, 17, 6)).toBeNull();
  });
});

describe('摇树：sheetTile 辅助自洽（防 tile 表漂移）', () => {
  it('测试用到的 sheet 反查都命中', () => {
    for (const s of [2, 5, 23, 53, 60, 70, 72, 109, 112, 116, 147, 199, 234, 323, 583, 633]) {
      expect(sheetTile(s)).toBeGreaterThan(0);
    }
  });
});
