// 树族砍伐对账（2026-08-17 用户报"海边棕榈树无法砍伐"触发，同日二审扩到全树族）：
//   根因 = v_323 def 缺 axe（默认 -1 → toolCanBreak 斧档 false）。一审连带修：
//   ①原版镐排除门（Player.cs:45039）；②fellImportedTree 棕榈分支；③清格前帧捕获。
//   二审（KillTile_GetTreeDrops :66245-66309 权威核对）连带修：
//   ④宝石树 gemcorn 门在**树顶**标记格（X≥22/Y≥198，growTreeWithSettings cs:30932
//    树顶覆写帧）——一审误查干底格（实际是 132-176 基座帧）→ 真树仍永假；
//   ⑤砍伐范围 = 切口及以上（CheckTree :54598 上行级联），切口以下树桩保留
//    ——旧实现整列连桩清除非原版；
//   ⑥木材种类按基座草族（GetTreeType :63106）：丛林→红木 620/腐化→乌木 619/
//    猩红→阴森木 911/雪原→针叶木 2503/神圣→珍珠木 621/灰烬→灰烬木 5215/
//    蘑菇草 70→50% 发光蘑菇或无——旧实现恒掉普通木材 9；
//   ⑦橡实 = 树冠标记格 50% ×1（TreeTypeDropsAcorns :63140：None/Mushroom/
//    Jungle 不掉）——旧 75%×2-3 非原版；
//   ⑧仙人掌（CheckCactus :54132 级联）：整株倒 + 每格 vi_276——旧 1×1 路径
//    掉 place_v_ 假物品且上方柱悬空。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_DEFS, T } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

interface FellShell {
  world: World; chunks: { markDirtyArea: () => void };
  spawnDrop: (x: number, y: number, key: string, n: number) => void;
  spawnParticles: () => void;
  fellImportedTree: (x: number, y: number, t: number) => void;
  fellTree: (x: number, y: number) => void;
  fellCactus: (x: number, y: number) => void;
  breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  sfx: { play: () => void }; playSfxFile: () => void;
}

/** 原型壳直调（private 仅编译期；vitest 环境无 DOM 不走构造器） */
function shell(w: World, drops: Array<[string, number]>): FellShell {
  const g = Object.create(Game.prototype) as unknown as FellShell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.playSfxFile = () => {};
  g.spawnDrop = (_x, _y, key, n) => { drops.push([key, n]); };
  return g;
}

function ground(w: World): World {
  for (let x = 0; x < 60; x++) w.store.setTileSilent(x, 40, 1, 0, 0);
  return w;
}

const PALM = TILE_BY_KEY['v_323_palm_trees'];
const TREE = TILE_BY_KEY['v_5_trees'];
const CAC = TILE_BY_KEY['v_80_cactus'];
const DIRT = TILE_BY_KEY['dirt'];
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block'];
const SNOW = TILE_BY_KEY['v_147_snow_block'];

describe('棕榈树砍伐（tileAxe 族对齐）', () => {
  it('axe 覆盖：原版 tileAxe 16 件全表（Main.cs:7157-7172）', () => {
    const VANILLA = [5, 72, 80, 488, 704, 323, 596, 616, 634, 589, 584, 588, 586, 587, 585, 583];
    const missing = VANILLA.filter((s) => {
      const d = TILE_DEFS.find((t) => t.vanilla?.sheet === s);
      return !d || d.axe == null || d.axe < 0;
    });
    expect(missing, `缺 axe 的 sheet: ${missing}`).toEqual([]);
  });

  it('镐排除门（:45039）：树/棕榈/倒木/仙人掌 pick 不可挖，镐可挖普通块', () => {
    // toolCanBreak 经 (game as any) 直调——private 仅编译期
    const g = Object.create(Game.prototype) as unknown as {
      toolCanBreak(t: number, power: number, tool: string): boolean;
    };
    for (const t of [PALM, TREE, CAC, TILE_BY_KEY['v_488_fallen_log'], TILE_BY_KEY['v_704_fallen_log_echo']]) {
      expect(g.toolCanBreak(t, 100, 'pick'), `sheet ${TILE_DEFS[t].vanilla?.sheet} pick`).toBe(false);
      expect(g.toolCanBreak(t, 0, 'axe'), `sheet ${TILE_DEFS[t].vanilla?.sheet} axe`).toBe(true);
    }
    expect(g.toolCanBreak(DIRT, 50, 'pick')).toBe(true);
  });

  it('fellImportedTree 棕榈分支：每干格棕榈木 + 树冠格橡实（帧前捕获）', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(60, 60, 30, 'open'));
    // 5 格棕榈（沙地、真实布局：树冠在上，frameX 88-132）
    w.store.setTileSilent(30, 35, PALM, 88, 0);
    w.store.setTileSilent(30, 36, PALM, 110, 0);
    for (let i = 37; i < 40; i++) w.store.setTileSilent(30, i, PALM, 22, 0);
    shell(w, drops).fellImportedTree(30, 39, PALM);
    const palmWood = drops.filter(([k]) => k.startsWith('vi_2504')).reduce((a, [, n]) => a + n, 0);
    const acorns = drops.filter(([k]) => /^vi_27_/.test(k)).reduce((a, [, n]) => a + n, 0);
    expect(palmWood).toBe(5);          // 每干格 1（棕榈无 bonusWood 掷）
    expect(acorns).toBe(2);            // 树冠两格（88/110 → 88-132 门）
    // 整棵清除
    expect(w.store.get(30, 39)).toBe(0);
  });

  it('切口以下树桩保留（CheckTree :54598 上行级联语义）', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(60, 60, 30, 'open'));
    for (let i = 0; i < 5; i++) w.store.setTileSilent(30, 35 + i, PALM, i < 2 ? 88 + i * 22 : 22, 0);
    shell(w, drops).fellImportedTree(30, 37, PALM);   // 拦腰砍（第 3 格）
    expect(w.store.get(30, 35)).toBe(0);              // 切口及以上清
    expect(w.store.get(30, 37)).toBe(0);
    expect(w.store.get(30, 38)).toBe(PALM);           // 树桩保留
    expect(w.store.get(30, 39)).toBe(PALM);
    const wood = drops.filter(([k]) => k.startsWith('vi_2504')).reduce((a, [, n]) => a + n, 0);
    expect(wood).toBe(3);                             // 只掉倒下段 3 格
  });

  it('宝石树 gemcorn 门在树顶标记格（growTreeWithSettings cs:30932 树顶覆写帧）', () => {
    const GEM = TILE_BY_KEY['v_583_topaz_tree'];
    let gemcorn = 0;
    // 50% 掷骰：跑 12 棵，修复后命中率应 > 0（恒 0 = 回归）
    for (let trial = 0; trial < 12; trial++) {
      const drops: Array<[string, number]> = [];
      const w = ground(new World(40, 60, 30, 'open'));
      w.store.setTileSilent(20, 38, GEM, 22, 198);   // 树顶 = 冠标记帧（22,198）
      w.store.setTileSilent(20, 39, GEM, 0, 132);    // 干底 = 基座帧（132-176 带）
      shell(w, drops).fellImportedTree(20, 39, GEM);
      gemcorn += drops.filter(([k]) => k.includes('4851')).length;
    }
    expect(gemcorn).toBeGreaterThan(0);   // 12 树 50% → P(全空) = 1/4096
  });
});

describe('树族二审：KillTile_GetTreeDrops 1:1（:66245-66309）', () => {
  /** 自有树（内部 'tree' id，worldgen/橡实生长主路径）砍基座 */
  function fellOn(groundKey: string, drops: Array<[string, number]>, height = 5): World {
    const w = ground(new World(60, 60, 30, 'open'));
    const gt = groundKey === 'grass' ? T.GRASS : groundKey === 'snow' ? T.SNOW : TILE_BY_KEY[groundKey]!;
    w.store.setTileSilent(30, 40, gt, 0, 0);
    const topY = 40 - height;                      // 基座恒在 40 行，树向上排
    for (let i = 0; i < height; i++) {
      w.store.setTileSilent(30, topY + i, T.TREE, i === 0 ? 22 : 0, i === 0 ? 198 : 0);
    }
    shell(w, drops).fellTree(30, 39);
    return w;
  }

  it('木材种类按基座草族（GetTreeType :63106）', () => {
    const cases: Array<[string, number]> = [
      ['v_60_jungle_grass_block', 620],   // Jungle → Rich Mahogany
      ['v_23_corrupt_grass_block', 619],  // Corrupt → Ebonwood
      ['v_199_crimson_grass_block', 911], // Crimson → Shadewood
      ['v_109_hallowed_grass_block', 621],// Hallowed → Pearlwood
    ];
    for (const [gk, vid] of cases) {
      const drops: Array<[string, number]> = [];
      fellOn(gk, drops);
      const woodKey = VANILLA_ITEM_KEY_BY_ID[vid];
      const woods = drops.filter(([k]) => k === woodKey).reduce((a, [, n]) => a + n, 0);
      const plain = drops.filter(([k]) => /^vi_9_/.test(k)).length;
      expect(woods, `${gk} → item ${vid}`).toBeGreaterThanOrEqual(5);  // 每格 1（bonus 只增不减）
      expect(plain, `${gk} 不应掉普通木材`).toBe(0);
    }
    // 雪原：雪块（tile 147，GetTreeType :63130 Snow → Boreal Wood 2503）
    const snow: Array<[string, number]> = [];
    fellOn('snow', snow);
    expect(snow.filter(([k]) => k === VANILLA_ITEM_KEY_BY_ID[2503]).length).toBeGreaterThan(0);
  });

  it('每格 1 木 + bonusWood 掷骰只增不减（:66306-66308）', () => {
    const drops: Array<[string, number]> = [];
    const w = fellOn('grass', drops, 8);
    const woodKey = VANILLA_ITEM_KEY_BY_ID[9];
    const total = drops.filter(([k]) => k === woodKey).reduce((a, [, n]) => a + n, 0);
    expect(total).toBeGreaterThanOrEqual(8);   // 8 格基线；手持斧力 0 时 bonus≈1/3+1/35
    for (let i = 0; i < 8; i++) expect(w.store.get(30, 32 + i)).toBe(0);
  });

  it('橡实：树冠标记格 50% ×1，蘑菇/丛林/无基座不掉（TreeTypeDropsAcorns :63140）', () => {
    let forestAcorns = 0;
    for (let t = 0; t < 16; t++) {
      const d: Array<[string, number]> = [];
      fellOn('grass', d);
      forestAcorns += d.filter(([k]) => /^vi_27_/.test(k)).reduce((a, [, n]) => a + n, 0);
    }
    expect(forestAcorns).toBeGreaterThan(0);   // 16×50% 全空 P=1/65536
    expect(forestAcorns).toBeLessThanOrEqual(16); // 每棵最多 1 颗（旧实现 2-3 颗必爆）
    for (const gk of ['v_60_jungle_grass_block', 'v_70_mushroom_grass_block']) {
      let acorns = 0;
      for (let t = 0; t < 8; t++) {
        const d: Array<[string, number]> = [];
        fellOn(gk, d);
        acorns += d.filter(([k]) => /^vi_27_/.test(k)).length;
      }
      expect(acorns, `${gk} 不掉橡实`).toBe(0);
    }
  });

  it('蘑菇草地上：每格 50% 发光蘑菇 / 50% 无掉落（:66298-66304）', () => {
    let shrooms = 0, tiles = 0;
    for (let t = 0; t < 6; t++) {
      const d: Array<[string, number]> = [];
      const w = fellOn('v_70_mushroom_grass_block', d);
      shrooms += d.filter(([k]) => k.includes('vi_183')).reduce((a, [, n]) => a + n, 0);
      tiles += w === w ? 5 : 0;
    }
    // 30 格掷 50%：全部为空 P=1/2^30，全部都有也几乎不可能
    expect(shrooms).toBeGreaterThan(0);
    expect(shrooms).toBeLessThan(tiles);
  });

  it('树桩语义：拦腰砍 → 下方保留 + 登记表收缩', () => {
    const d: Array<[string, number]> = [];
    const w = ground(new World(60, 60, 30, 'open'));
    w.store.setTileSilent(30, 40, T.GRASS, 0, 0);
    for (let i = 0; i < 6; i++) w.store.setTileSilent(30, 34 + i, T.TREE, i === 0 ? 22 : 0, i === 0 ? 198 : 0);
    w.trees.push({ x: 30, y: 34, h: 6 });
    shell(w, d).fellTree(30, 37);           // 砍第 4 格
    for (let i = 0; i < 4; i++) expect(w.store.get(30, 34 + i)).toBe(0);
    expect(w.store.get(30, 38)).toBe(T.TREE);   // 树桩 2 格保留
    expect(w.store.get(30, 39)).toBe(T.TREE);
    expect(w.trees).toEqual([{ x: 30, y: 38, h: 2 }]);   // 收缩为树桩段
    const woodKey = VANILLA_ITEM_KEY_BY_ID[9];
    const total = d.filter(([k]) => k === woodKey).reduce((a, [, n]) => a + n, 0);
    expect(total).toBeGreaterThanOrEqual(4);   // 只掉倒下段
  });
});

describe('仙人掌砍伐（CheckCactus :54132 级联）', () => {
  it('破坏基座 → 整株倒（含侧臂），每格掉仙人掌 276', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(40, 60, 30, 'open'));
    const SAND = TILE_BY_KEY['sand'];
    w.store.setTileSilent(10, 40, SAND, 0, 0);
    for (let i = 0; i < 3; i++) w.store.setTileSilent(10, 37 + i, CAC, 22, 0);
    w.store.setTileSilent(11, 38, CAC, 44, 0);   // 侧臂（下方 39 非仙人掌）
    shell(w, drops).fellCactus(10, 39);
    expect(w.store.get(10, 37)).toBe(0);
    expect(w.store.get(10, 38)).toBe(0);
    expect(w.store.get(10, 39)).toBe(0);
    expect(w.store.get(11, 38)).toBe(0);          // 臂随主干同落
    const cactus = drops.filter(([k]) => k.includes('vi_276')).reduce((a, [, n]) => a + n, 0);
    expect(cactus).toBe(4);                        // 3 干 + 1 臂，无 bonus 掷（确定性）
  });

  it('挖掉脚下沙 → 被 CanKillTile 保护拦（底帽帧 c∈{0,1,4,5}，:62298-62305）', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(40, 60, 30, 'open'));
    const SAND = TILE_BY_KEY['sand'];
    w.store.setTileSilent(10, 40, SAND, 0, 0);
    for (let i = 0; i < 2; i++) w.store.setTileSilent(10, 38 + i, CAC, 22, 0);  // 底帽帧
    shell(w, drops).breakTile(10, 40);             // 破坏沙（非仙人掌本体）→ 拦
    expect(w.store.get(10, 40)).toBe(SAND);        // 沙未被破坏
    expect(w.store.get(10, 39)).toBe(CAC);
    expect(drops.length).toBe(0);
  });

  it('CanKillTile 干族保护：挖树脚下草被拦（:62277-62282），枝/冠帧例外放行', () => {
    const g = Object.create(Game.prototype) as unknown as {
      world: World; tileAboveProtected(x: number, y: number): boolean;
    };
    const w = ground(new World(40, 60, 30, 'open'));
    g.world = w;
    // 普通树干在草上：草(10,40) 上方干帧 (0,0) → 保护
    w.store.setTileSilent(10, 39, T.TREE, 0, 0);
    expect(g.tileAboveProtected(10, 40)).toBe(true);
    // 冠标记帧（Y≥198 例外）→ 放行
    w.store.setTileSilent(10, 39, T.TREE, 22, 198);
    expect(g.tileAboveProtected(10, 40)).toBe(false);
    // 枝帧例外（66, 0-44 / 88, 66-110）→ 放行
    w.store.setTileSilent(10, 39, T.TREE, 66, 22);
    expect(g.tileAboveProtected(10, 40)).toBe(false);
    w.store.setTileSilent(10, 39, T.TREE, 88, 88);
    expect(g.tileAboveProtected(10, 40)).toBe(false);
    // 根帧（22/44 @132-176）→ 保护（挖根下的格被拦）
    w.store.setTileSilent(10, 39, T.TREE, 44, 154);
    expect(g.tileAboveProtected(10, 40)).toBe(true);
    // 同类型（砍干本身）不拦
    w.store.setTileSilent(10, 40, T.TREE, 0, 0);
    expect(g.tileAboveProtected(10, 40)).toBe(false);
  });

  it('拦腰砍 → 下方保留', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(40, 60, 30, 'open'));
    const SAND = TILE_BY_KEY['sand'];
    w.store.setTileSilent(10, 40, SAND, 0, 0);
    for (let i = 0; i < 3; i++) w.store.setTileSilent(10, 37 + i, CAC, 22, 0);
    shell(w, drops).fellCactus(10, 38);
    expect(w.store.get(10, 37)).toBe(0);
    expect(w.store.get(10, 38)).toBe(0);
    expect(w.store.get(10, 39)).toBe(CAC);        // 切口以下保留
    expect(drops.filter(([k]) => k.includes('vi_276')).length).toBe(2);
  });

  it('叠臂级联：下臂先死 → 上臂失撑再死（CheckCactus 不动点）', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(40, 60, 30, 'open'));
    const SAND = TILE_BY_KEY['sand'];
    w.store.setTileSilent(10, 40, SAND, 0, 0);
    for (let i = 0; i < 3; i++) w.store.setTileSilent(10, 37 + i, CAC, 22, 0);
    w.store.setTileSilent(11, 38, CAC, 44, 0);   // 下臂（39 非仙人掌）
    w.store.setTileSilent(11, 37, CAC, 66, 0);   // 上臂（叠在 38 上）
    shell(w, drops).fellCactus(10, 39);
    for (let yy = 37; yy <= 39; yy++) {
      expect(w.store.get(10, yy)).toBe(0);
      expect(w.store.get(11, yy)).toBe(0);       // 双臂全落，无悬空
    }
    const cactus = drops.filter(([k]) => k.includes('vi_276')).reduce((a, [, n]) => a + n, 0);
    expect(cactus).toBe(5);                       // 3 干 + 2 臂
  });
});
