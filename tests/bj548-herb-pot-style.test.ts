// ★BJ548（2026-10-07）：花盆/药草 style 全链判别测试。
//
// 用户实报：「所有花盆放去就变成太阳花盆」——全 8 材质种植盆物品（3215-3222）放置后
// 恒渲染成 style0（太阳花种植盆）。定谳（亲读 1457 + 本仓对读）：
//   · 原版：tileFrameImportant[380]=true（Main.cs:7771）存储帧直绘——frameY=18*style
//     材质行（PlaceTile case 380,WorldGen.cs:60717-60721）、frameX=连接档 {0,18,36,54}
//     （TileFrame case 380,:86575-86646 num7 三元链）；破坏掉落 = 3215+frameY/18
//     （KillTile case 380,:65726-65729）。
//   · 本仓病灶（两刀面叠加）：①tile def v_380_planter_boxes 曾 frame:'auto'（家族
//     19/239/427/435-439 全 'style',380 系漏网孤例）→ tryPlace generic 写循环仅对
//     frame:'style' 走 framedCellFrame 消费 placeStyle（:27924 vs :27945）→ 放置恒写
//     (0,0)=style0；②绘制 face 'auto'=TEdit blend 仿真按邻接掩码取帧,存储帧被无视
//     → 即便帧写对也恒采样 style0 行带。连带面：TileFrame 380 连接帧重算整缺、
//     styleFromFrame[380] 缺（破坏恒掉 def.drop=3215）。
//   · 种子面澄清：药草种子（307-312/2357）→ 82 芽 frameX=18*style 的放置/生长/采收/
//     补种各面本仓 1:1 正确（place-alch-runtime.test.ts 已钉 18*4/18*5 档）——
//     用户观感"herbStyle 恒 0"实为种植盆本体恒 Daybloom 形态的连带报告。
//     本文件 A/E 组把种子全 7 型 + 收获同链一并钉死防回归。
//
// 刀面：tiles.ts def frame→'style'（写面 framedCellFrame→furnitureStyleBase case 380
// = [0,style*18] 首次可达 + 绘制面存储帧直取）；Game.ts DECOR_SUPPORT_KIND 380:
// 'planterbox'（TileFrame case 380 1:1,framePlanterBoxSweep 挂 3×3 扫+块换尾）；vanillaStyleDrops
// styleFromFrame[380]/PlanterBoxes/case 380。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { framePlanterBoxSweep } from '../src/world/gen/vanilla/FinalCleanupPass';
import { styleDropVidOfFrames } from '../src/data/vanillaStyleDrops';
import { furnitureStyleBase } from '../src/world/FurnitureStyle';

let vidToId: Record<number, number> | null = null;
function iidOf(vid: number): number {
  if (!vidToId) {
    vidToId = {};
    ITEM_DEFS.forEach((d, i) => {
      const m = /^vi_(\d+)_/.exec(d.key);
      if (m) vidToId![+m[1]] = i;
    });
  }
  return vidToId[vid] ?? -1;
}
function defOf(vid: number) {
  return ITEM_DEFS[iidOf(vid)];
}

const CLAY_T = TILE_BY_KEY['clay_pot']!;                    // sheet 78 陶盆（PlaceAlch 全样式白名单）
const STONE_T = TILE_BY_KEY['stone']!;
const SPROUT_T = TILE_BY_KEY['v_82_herbs_sprout']!;         // sheet 82 芽
const MATURE_T = TILE_BY_KEY['v_83_herbs_mature']!;         // sheet 83 熟
const BLOOM_T = TILE_BY_KEY['v_84_herbs_bloom']!;           // sheet 84 开花
const PLANTER_T = TILE_BY_KEY['v_380_planter_boxes']!;      // sheet 380 种植箱
// 原版 ItemID（亲读 ItemID.cs:2160-2182/6260-6262/7978-7988）
const SEED_VIDS = [307, 308, 309, 310, 311, 312, 2357] as const;   // style 0-6
const PLANTER_VIDS = [3215, 3216, 3217, 3218, 3219, 3220, 3221, 3222] as const;  // style 0-7

/** tryPlace 壳（同 place-alch-runtime placeShell 桩面） */
function placeShell(w: World, heldVid: number) {
  const consumed: number[] = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots: new Array(50).fill(null),
      heldItem: () => ({ id: iidOf(heldVid), stack: 5 }),
      removeAt: () => { consumed.push(1); },
      removeHeld: () => { consumed.push(1); },
    },
  };
  return {
    g: g as unknown as { tryPlace: (tx: number, ty: number, def: (typeof ITEM_DEFS)[number]) => void; checkDecorSquareFrame: (x: number, y: number) => void },
    consumed,
  };
}

/** interactAt 壳（同 replant-alch-579 shell 桩面） */
function interactShell(w: World, drops: Array<[string, number]>, heldVid = -1) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.input = { rightDown: true };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playAt: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, stack: number) => { drops.push([key, stack]); };
  g.player = { inv: { heldItem: () => (heldVid >= 0 ? { id: iidOf(heldVid) } : null) } };
  g.inTileRange = () => true;
  g.netCanEditTile = () => true;
  g.isAlchemyPlantHarvestable = () => true;
  g.wiring = undefined;
  return g as unknown as { interactAt: (tx: number, ty: number) => void };
}

/** 石地世界：行 21 石面,作业面行 20 */
function mkWorld(): { w: World; st: World['store'] } {
  const w = new World(40, 40, 13, 'bj548');
  const st = w.store;
  for (let x = 2; x < 38; x++) st.setTileSilent(x, 21, STONE_T);
  for (let x = 2; x < 38; x++) for (let y = 8; y <= 20; y++) st.setTile(x, y, 0, 0, 0);
  return { w, st };
}

// ═══════════ A 药草种子 → style（placeAlchRuntime 面,全 7 型钉值） ═══════════

describe('BJ548 A：药草种子种入陶盆 → 82 芽 frameX=18*style（WorldGen.cs:45868 + Item.cs:5068-5145/23737-23749）', () => {
  for (let s = 0; s < SEED_VIDS.length; s++) {
    const vid = SEED_VIDS[s];
    it(`种子 ${vid}（placeStyle ${s}）→ frameX=${18 * s}`, () => {
      const { w, st } = mkWorld();
      st.setTileSilent(8, 21, CLAY_T, 0, 0);           // 陶盆基座（全 style 白名单成员）
      const { g, consumed } = placeShell(w, vid);
      g.tryPlace(8, 20, defOf(vid));
      expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);   // 写面=82 芽（:45866 硬编码）
      expect(st.frameX[st.idx(8, 20)]).toBe(18 * s);   // frameX=18*style（:45868）
      expect(st.frameY[st.idx(8, 20)]).toBe(0);        // frameY=0（:45869）
      expect(consumed.length).toBe(1);
      expect(defOf(vid).placeStyle).toBe(s);           // 数据面：种子 placeStyle 域钉值
    });
  }
});

// ═══════════ B 种植盆放置 style（落刀面：全 8 材质不再恒太阳花盆） ═══════════

describe('BJ548 B：种植盆物品放置 → frameY=18*style 材质行（PlaceTile case 380 :60718）+ 孤立连接帧 54（:86642）', () => {
  for (let s = 0; s < PLANTER_VIDS.length; s++) {
    const vid = PLANTER_VIDS[s];
    it(`种植盆 ${vid}（placeStyle ${s}）→ frameY=${18 * s}, frameX=54(孤立)`, () => {
      const { w, st } = mkWorld();
      const { g, consumed } = placeShell(w, vid);
      g.tryPlace(8, 20, defOf(vid));
      expect(st.type[st.idx(8, 20)]).toBe(PLANTER_T);
      expect(st.frameY[st.idx(8, 20)]).toBe(18 * s);   // 材质行（:60718;修前恒 0=太阳花盆）
      expect(st.frameX[st.idx(8, 20)]).toBe(54);       // TileFrame case 380 孤立档（:86642 尾支）
      expect(consumed.length).toBe(1);
      expect(defOf(vid).placeStyle).toBe(s);           // 数据面：SHARED_GROUP_PLACE_STYLE_1457 钉值
    });
  }
});

// ═══════════ C TileFrame case 380 连接帧四态 + 邻变重帧 ═══════════

describe('BJ548 C：TileFrame case 380 连接帧（WorldGen.cs:86575-86646 num7 链 1:1）', () => {
  it('四态：孤立 54 / 双连 18 / 仅左连 36 / 仅右连 0；frameY 材质行不触', () => {
    const { w, st } = mkWorld();
    // 孤立
    st.setTileSilent(8, 20, PLANTER_T, 0, 18 * 5);
    framePlanterBoxSweep(st, 8, 20);
    expect(st.frameX[st.idx(8, 20)]).toBe(54);
    expect(st.frameY[st.idx(8, 20)]).toBe(18 * 5);
    // 三连 [A][B][C]：A 仅右连 0 / B 双连 18 / C 仅左连 36
    st.setTileSilent(12, 20, PLANTER_T, 0, 0);
    st.setTileSilent(13, 20, PLANTER_T, 0, 18 * 2);
    st.setTileSilent(14, 20, PLANTER_T, 0, 18 * 4);
    framePlanterBoxSweep(st, 12, 20);
    framePlanterBoxSweep(st, 13, 20);
    framePlanterBoxSweep(st, 14, 20);
    expect(st.frameX[st.idx(12, 20)]).toBe(0);    // L=-1,R=380 → 0（b3 false||false）
    expect(st.frameX[st.idx(13, 20)]).toBe(18);   // L,R 同型 → 18
    expect(st.frameX[st.idx(14, 20)]).toBe(36);   // L=380,R=-1 → 36
    // 异型实心邻居与空同判：石左 + 380 右 → 0（b3 = L==T||R≠T → false||false）
    st.setTileSilent(20, 20, STONE_T, 0, 0);
    st.setTileSilent(21, 20, PLANTER_T, 0, 0);
    st.setTileSilent(22, 20, PLANTER_T, 0, 0);
    framePlanterBoxSweep(st, 21, 20);
    expect(st.frameX[st.idx(21, 20)]).toBe(0);
    // 非实心 active 邻格不计（!Main.tileSolid → -1,:86634-86641）：药草(82 非实心)左邻
    st.setTileSilent(26, 20, SPROUT_T, 0, 0);
    st.setTileSilent(27, 20, PLANTER_T, 0, 0);
    framePlanterBoxSweep(st, 27, 20);
    expect(st.frameX[st.idx(27, 20)]).toBe(54);   // 药草非实心 → L=-1 → 孤立
  });

  it('破坏中位 → 邻箱重帧（checkDecorSquareFrame 3×3 扫 = SquareTileFrame :81462 等价）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 20, PLANTER_T, 18, 0);
    st.setTileSilent(9, 20, PLANTER_T, 18, 18);
    st.setTileSilent(10, 20, PLANTER_T, 36, 18 * 3);
    const { g } = placeShell(w, 3215);
    st.setTile(9, 20, 0);                          // 挖中箱（运行时 onTileChanged→checkDecorSquareFrame
                                                   //   监听在 Game 启动时注册 :7577,测试壳手动补拍）
    g.checkDecorSquareFrame(9, 20);
    expect(st.frameX[st.idx(8, 20)]).toBe(54);     // 18 → 54（失右连）
    expect(st.frameX[st.idx(10, 20)]).toBe(54);    // 36 → 54（失左连）
    expect(st.frameY[st.idx(8, 20)]).toBe(0);      // 材质行不动
    expect(st.frameY[st.idx(10, 20)]).toBe(18 * 3);
  });
});

// ═══════════ D 绘制形态钉值（style 存储帧直绘链） ═══════════

describe('BJ548 D：绘制形态——def frame=style 存储帧直取 + atlas 帧域覆盖全 style', () => {
  const meta = (JSON.parse(readFileSync(new URL('../public/sprites/vanilla.json', import.meta.url), 'utf8')) as {
    tiles: Record<string, { cols: number; rows: number; stride: [number, number] }>;
  }).tiles;
  it('380 def frame=style（drawVanillaCell 存储帧路径选择器,修前 auto=blend 仿真无视存储帧）', () => {
    const v = TILE_DEFS[PLANTER_T]!.vanilla!;
    expect(v.frame).toBe('style');
    expect(v.fw ?? 1).toBe(1);
    expect(v.fh ?? 1).toBe(1);
  });
  it('atlas Tiles_380 4 列×8 行：连接档 0-54 与材质行 0-126 全在帧域内', () => {
    expect(meta['380'].cols).toBe(4);              // 4 连接列（Tiles_380.png 72px 实证）
    expect(meta['380'].rows).toBe(8);              // 8 材质行（placeStyle 0-7）
    for (const fx of [0, 18, 36, 54]) expect(fx + 16).toBeLessThanOrEqual(meta['380'].cols * 18);
    for (let s = 0; s < 8; s++) expect(18 * s + 16).toBeLessThanOrEqual(meta['380'].rows * 18);
  });
  it('furnitureStyleBase case 380 = [0, style*18]（写面→绘制面同构;FurnitureStyle.ts:25）', () => {
    for (let s = 0; s < 8; s++) {
      expect(furnitureStyleBase(380, s, 1)).toEqual([0, 18 * s]);
    }
  });
  it('药草 82/83/84 atlas 7 列横排（frameX=18*style 采样域,cols=7）', () => {
    for (const k of ['82', '83', '84']) {
      expect(meta[k].cols).toBe(7);
      expect(meta[k].rows).toBe(1);
      for (let s = 0; s < 7; s++) expect(18 * s + 16).toBeLessThanOrEqual(meta[k].cols * 18);
    }
    for (const t of [SPROUT_T, MATURE_T, BLOOM_T]) expect(TILE_DEFS[t]!.vanilla!.frame).toBe('style');
  });
});

// ═══════════ E 收获/破坏返还同链对拍 ═══════════

describe('BJ548 E：成熟采收回种子（herb/seed vid=style 权威式）+ 种植箱破坏返还同 style 档', () => {
  const HERB_VID = (s: number) => (s === 6 ? 2358 : 313 + s);
  const SEED_VID = (s: number) => (s === 6 ? 2357 : 307 + s);

  for (let s = 0; s < 7; s++) {
    it(`开花株 style ${s} 采收 → 掉 ${HERB_VID(s)} + 种子 ${SEED_VID(s)}`, () => {
      const { w, st } = mkWorld();
      st.setTileSilent(8, 21, CLAY_T, 0, 0);
      st.setTileSilent(8, 20, BLOOM_T, 18 * s, 0);   // 开花株（84 恒可收）
      const drops: Array<[string, number]> = [];
      interactShell(w, drops).interactAt(8, 20);
      expect(st.type[st.idx(8, 20)]).toBe(0);        // 采收清格
      const vids = drops.map(([k]) => {
        const i = Object.values(VANILLA_ITEM_KEY_BY_ID).indexOf(k);
        return Number(Object.keys(VANILLA_ITEM_KEY_BY_ID)[i]);
      });
      expect(vids).toContain(HERB_VID(s));
      expect(vids).toContain(SEED_VID(s));
    });
  }

  it('再生法杖采收 380 基座上 style3 株 → 原地补种同 style（TryReplantingHerbs :46215 链）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, PLANTER_T, 54, 18 * 3);  // 种植箱基座（连接帧 54=孤立;材质行 style3）
    st.setTileSilent(8, 20, BLOOM_T, 18 * 3, 0);
    const drops: Array<[string, number]> = [];
    interactShell(w, drops, 213).interactAt(8, 20);
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);   // 补种 82 芽
    expect(st.frameX[st.idx(8, 20)]).toBe(18 * 3);   // ★两域数值撞车备案：82 域 frameX=style*18（54=style3）
                                                     //   与 380 域 frameX=连接档 54(孤立) 不同 tile 域,互不相涉
    expect(st.frameY[st.idx(8, 20)]).toBe(0);
    expect(st.type[st.idx(8, 21)]).toBe(PLANTER_T);  // 基座在位
    expect(drops.length).toBeGreaterThanOrEqual(2);  // 法杖加成掉落（草+种子）
  });

  it('styleDropVidOfFrames(380) = 3215+frameY/18（KillTile case 380 :65726-65729）,连接档无关', () => {
    for (let s = 0; s < 8; s++) {
      for (const fx of [0, 18, 36, 54]) {
        expect(styleDropVidOfFrames(380, fx, 18 * s)).toBe(3215 + s);
      }
    }
  });
});
