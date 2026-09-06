// SW-BJ3 2026-09-06：平台族全集 × 锤击 × 自动斜放 矩阵审计（用户要求全面检查
// "锤子对平台（各种木平台等）锤击是否生效 + 各平台斜放可用性（智能光标斜上/斜下）"）。
//
// 审计面（型 × 面）：
//   A 数据面（style 透传的根）：全部原版平台放置物品 vid → (tile sheet, placeStyle)
//     对 1457 Item.cs 真值表逐件断言。真值表来源 = 反编译 Item.cs 亲读提取
//     （createTile=19 直赋 / DefaultToPlaceableTile((ushort)19,N) / 共享 case 算式
//     `placeStyle = 21+type-2627`(:25640) / `placeStyle = 30+type-3903`(:34551) /
//     `placeStyle = type-3215`(:29739) / 内嵌 switch(:29430-29440)）。
//     itemfunc 提取盲区（共享算式段）此前 10 件 tile19 平台 + 8 件种植箱 placeStyle
//     全缺=0（全渲染成 style 0 木平台/日光花盆）——本表即防回退守卫。
//   B 锤击面（分派级）：每型走真 Game.tryMine 四拍坡循环（slope1→slope2→半砖→整），
//     239 矿石条架走尾段整↔半 toggle、380 种植箱走 CanPoundTile 拒整形 no-op
//     （SW-BA1 面的类型全集扫）；并断言【style 行经锤整形不丢】（frameY 恒 18*style
//     ——渲染层坡帧 = 该 style 行内平帧 + 绝对 X 补片 198/324/162/306，
//     TileDrawing.cs:1537-1575,1457）。
//   C 自动斜放面：智能光标态 tryPlace 逐型斜放（SW-BE1 面的类型全集扫）+ style 帧带位
//     （frameY=18*placeStyle 与斜放标志共存——"斜放后渲染仍是该型材质"）。
//   D 碰撞面：坡面平台楼梯（Collision.cs:1851-1866 单向门）对异型平台同成立。
//   E 渲染面结构锁：VanillaTiler 平台坡补片帧码 / 半砖源上半帧 / slope2 抑制 {0,4}
//     （源文本锚，防静默回退；行为面由私有实例探针截图核验）。
// "海边样式"定谳：棕榈木平台 PalmWoodPlatform vid 2518 = tile19 style 17（海边棕榈树
//   木材，Item.cs:24466）；1.4.5 新增海洋主题珊瑚礁平台 CoralPlatform vid 5162 =
//   style 45（Item.cs:41299）。两者均在下方矩阵内钉值。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { moveAndCollide } from '../src/physics/TileCollision';
import type { ItemDef } from '../src/data/items';

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;

// ═══════════════ A 数据面：1457 平台放置物品真值表 ═══════════════
// [vid, tileSheet, placeStyle, 备注(Item.cs 行号)]
const VANILLA_PLATFORM_ITEMS: ReadonlyArray<readonly [number, number, number, string]> = [
  [94, 19, 0, '木平台 :2474'],
  [631, 19, 1, '黑木平台 :8730'],
  [632, 19, 2, '红木平台 :8742'],
  [633, 19, 3, '珍珠木平台 :8754'],
  [634, 19, 4, '骨头平台 :8766'],
  [913, 19, 5, '阴木平台 :11925'],
  [1384, 19, 6, '蓝砖平台 :17137'],
  [1385, 19, 7, '粉砖平台 :17149'],
  [1386, 19, 8, '绿砖平台 :17161'],
  [1387, 19, 9, '金属架 :17173'],
  [1388, 19, 10, '黄铜架 :17185'],
  [1389, 19, 11, '木架 :17197'],
  [1418, 19, 12, '地牢架 :17572'],
  [1457, 19, 13, '黑曜石平台 :18074'],
  [1702, 19, 14, '玻璃平台 :19247'],
  [1796, 19, 15, '南瓜平台 :19919'],
  [1818, 19, 16, '阴森平台 :20151'],
  [2518, 19, 17, '★棕榈木平台(海边样式) :24466'],
  [2549, 19, 18, '蘑菇平台 :24718'],
  [2566, 19, 19, '北地木平台 :25114'],
  [2581, 19, 20, '史莱姆平台 :25308'],
  [2627, 19, 21, '蒸汽朋克平台 :25640 `21+type-2627`'],
  [2628, 19, 22, '天域平台 :25640'],
  [2629, 19, 23, '生命木平台 :25640'],
  [2630, 19, 24, '蜂蜜平台 :25640'],
  [2744, 19, 25, '仙人掌平台 :26203'],
  [2822, 19, 26, '火星平台 :26835'],
  [3144, 19, 27, '陨石平台 :29430 内嵌 switch'],
  [3146, 19, 28, '花岗岩平台 :29438'],
  [3145, 19, 29, '大理石平台 :29434'],
  [3903, 19, 30, '水晶平台 :34551 `30+type-3903`'],
  [3904, 19, 31, '金平台 :34551'],
  [3905, 19, 32, '王朝木平台 :34551'],
  [3906, 19, 33, '丛林蜥蜴平台 :34551'],
  [3907, 19, 34, '血肉平台 :34551'],
  [3908, 19, 35, '冰冻平台 :34551'],
  [3945, 19, 36, '蜘蛛平台 :34951'],
  [3957, 19, 37, '损伤平台 :35094'],
  [4159, 19, 38, '日耀平台 :36072 DefaultToPlaceableTile'],
  [4180, 19, 39, '星旋平台 :36198'],
  [4201, 19, 40, '星云平台 :36324'],
  [4222, 19, 41, '星尘平台 :36450'],
  [4311, 19, 42, '沙岩平台 :36942'],
  [4416, 19, 43, '石平台 :37439'],
  [4580, 19, 44, '竹平台 :38079'],
  [5162, 19, 45, '★珊瑚礁平台(海洋主题,1.4.5) :41299'],
  [5183, 19, 46, '气球平台 :41425'],
  [5204, 19, 47, '灰烬木平台 :41551'],
  [5292, 19, 48, '回声平台 :42098'],
  [5544, 19, 49, '云平台 :43702'],
  [5562, 19, 50, '天蓝平台 :43842'],
  [5615, 19, 51, '坠星平台 :44156'],
  [5703, 19, 52, '妖精木平台 :44787'],
  [5726, 19, 53, '神圣平台 :44919'],
  [5751, 19, 54, '哥特平台 :45073'],
  [5770, 19, 55, '魔矿平台 :45187'],
  [5791, 19, 56, '血腥矿平台 :45313'],
  [5812, 19, 57, '雪域平台 :45439'],
  [5833, 19, 58, '狐獴毛平台 :45565'],
  [5852, 19, 59, '松木平台 :45679'],
  [5872, 19, 60, '复活节平台 :45799'],
  [5912, 19, 61, '水母平台 :46039'],
  [5946, 19, 62, '鸟妖平台 :46210'],
  [5989, 19, 63, '月板平台 :46462'],
  [6012, 19, 64, '图书管理员平台 :46594'],
  [6035, 19, 65, '尖刺平台 :46726'],
  [6058, 19, 66, '办公平台 :46858'],
  [6081, 19, 67, '禁忌平台 :46990'],
  [6103, 19, 68, '水平台 :47116'],
  [6125, 19, 69, '巨石平台 :47242'],
  [3622, 427, 0, '红团队平台 :32635 createTile=427'],
  [3638, 435, 0, '绿团队平台 :32795 `435+(type-3638)`'],
  [3639, 436, 0, '蓝团队平台 :32795'],
  [3640, 437, 0, '黄团队平台 :32795'],
  [3641, 438, 0, '粉团队平台 :32795'],
  [3642, 439, 0, '白团队平台 :32795'],
  [3215, 380, 0, '日光花盆箱 :29739 `type-3215`'],
  [3216, 380, 1, '月光花盆箱 :29739'],
  [3217, 380, 2, '腐化花盆箱 :29739'],
  [3218, 380, 3, '猩红花盆箱 :29739'],
  [3219, 380, 4, '闪根花盆箱 :29739'],
  [3220, 380, 5, '水叶花盆箱 :29739'],
  [3221, 380, 6, '寒颤棘花盆箱 :29739'],
  [3222, 380, 7, '火焰花盆箱 :29739'],
];

/** vid → ITEM_DEFS 条目（量产注册键 vi_<id>_<Key>，同 vid 双注册取首个=权威反查同序） */
const DEF_BY_VID = (() => {
  const m = new Map<number, ItemDef>();
  for (const d of ITEM_DEFS) {
    const mm = /^vi_(\d+)_/.exec(d.key);
    if (mm && !m.has(Number(mm[1]))) m.set(Number(mm[1]), d);
  }
  return m;
})();

describe('SW-BJ3 A 数据面：平台放置物品 vid → (tile, placeStyle) 对 1457 真值表', () => {
  it('tile19 全 70 材质 + 427/435-439 团队 + 380 种植箱逐件 style 带位（防全渲染成 style0）', () => {
    const bad: string[] = [];
    for (const [vid, sheet, ps, tag] of VANILLA_PLATFORM_ITEMS) {
      const d = DEF_BY_VID.get(vid);
      if (!d) { bad.push(`vid ${vid}(${tag}) 无 def`); continue; }
      const tKey = VANILLA_ITEM_KEY_BY_ID[vid];
      void tKey;
      // tile 键解析：def.tile 必须指向 sheet 对应 tile def
      const tileId = d.tile !== undefined ? TILE_BY_KEY[d.tile] : undefined;
      if (tileId === undefined) { bad.push(`vid ${vid}(${tag}) tile=${String(d.tile)} 未解析`); continue; }
      const gotSheet = TILE_DEFS[tileId]?.vanilla?.sheet;
      if (gotSheet !== sheet) { bad.push(`vid ${vid}(${tag}) sheet=${String(gotSheet)}≠${sheet}`); continue; }
      if ((d.placeStyle ?? 0) !== ps) { bad.push(`vid ${vid}(${tag}) placeStyle=${String(d.placeStyle)}≠${ps}`); }
    }
    expect(bad).toEqual([]);
  });

  it('平台家族 tile def 全部 platform:true（碰撞/锤门/坡循环判据域）', () => {
    for (const sheet of [19, 427, 435, 436, 437, 438, 439, 239, 380]) {
      const found = [...(globalThis as unknown as Record<string, never> && [])];
      void found;
      const any = TILE_DEFS.some((d) => d?.vanilla?.sheet === sheet);
      expect(any, `sheet ${sheet} tile def 在册`).toBe(true);
    }
    for (const key of ['platform', 'v_427_red_team_platform', 'v_435_green_team_platform', 'v_436_blue_team_platform',
      'v_437_yellow_team_platform', 'v_438_pink_team_platform', 'v_439_white_team_platform', 'v_239_ore_bars', 'v_380_planter_boxes']) {
      const id = TILE_BY_KEY[key]!;
      expect(TILE_DEFS[id]?.platform, `${key} platform:true`).toBe(true);
    }
  });
});

// ═══════════════ B 锤击面（分派级,真 Game.tryMine） ═══════════════

function mkHammerGame(w = 40, h = 20) {
  const store = new TileStore(w, h);
  const world = { store, w, h, flags: {}, chests: [] } as unknown as World;
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.world = world;
  g.player = { cx: 8 * TILE, cy: 8 * TILE, x: 8 * TILE - 10, y: 8 * TILE - 21, w: 20, h: 42, equipStats: {} };
  g.tickCount = 100;
  g.lastMineHitTick = -999;
  g.hammerPoundRelease = true;
  g.trackTile = 0;
  g.mining = null;
  g.sfx = { play: () => {}, playWavFile: () => true };
  g.playSfxFile = () => true;
  g.spawnParticles = () => {};
  g.hitTiles = { addDamage: () => 0, clear: () => {} };
  g.input = { mouseX: 8 * TILE, mouseY: 8 * TILE, rightDown: false, mouseDown: false, mouseHeld: false };
  return { g, store };
}

/** 各型锤四拍：整→slope1→slope2→半砖→整，style 行 frameY 全程不变 */
const HAMMER_PLAT_TYPES: ReadonlyArray<readonly [number, string, number]> = [
  [PLAT, '木平台(sheet19 style0)', 0],
  [PLAT, '棕榈木平台(sheet19 style17=海边)', 17],
  [PLAT, '珊瑚礁平台(sheet19 style45)', 45],
  [PLAT, '雪域平台(sheet19 style57)', 57],
  [PLAT, '巨石平台(sheet19 style69=末行)', 69],
  [TILE_BY_KEY['v_427_red_team_platform']!, '红团队平台(427)', 0],
  [TILE_BY_KEY['v_435_green_team_platform']!, '绿团队平台(435)', 0],
  [TILE_BY_KEY['v_439_white_team_platform']!, '白团队平台(439)', 0],
];

describe('SW-BJ3 B 锤击面：逐型真 tryMine 四拍坡循环 + style 行不变', () => {
  for (const [tileId, name, style] of HAMMER_PLAT_TYPES) {
    it(`${name}：整→slope1→slope2→半砖→整；frameY=${18 * style} 全程保持`, () => {
      const { g, store } = mkHammerGame();
      store.setTileSilent(8, 8, tileId, 0, 18 * style);
      const fy = () => store.frameY[store.idx(8, 8)];
      // 拍1 整→slope1
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(store.slope[store.idx(8, 8)]).toBe(1);
      expect(fy()).toBe(18 * style);                       // style 行经整形不丢
      // 拍2 slope1→slope2
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(store.slope[store.idx(8, 8)]).toBe(2);
      expect(fy()).toBe(18 * style);
      // 拍3 slope2→半砖
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(!!store.half[store.idx(8, 8)]).toBe(true);
      expect(store.slope[store.idx(8, 8)]).toBe(0);
      expect(fy()).toBe(18 * style);
      // 拍4 半砖→回整
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(!!store.half[store.idx(8, 8)]).toBe(false);
      expect(store.slope[store.idx(8, 8)]).toBe(0);
      expect(fy()).toBe(18 * style);
    });
  }

  it('239 矿石条架（各材质）：尾段整↔半 toggle、slope 恒 0（SW-BA1 面,逐 style 带 frameX）', () => {
    const ORE = TILE_BY_KEY['v_239_ore_bars']!;
    for (const style of [0, 4, 19]) {
      const { g, store } = mkHammerGame();
      store.setTileSilent(8, 8, ORE, 18 * style, 0);       // 239 材质=frameX 列（:45623）
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(!!store.half[store.idx(8, 8)]).toBe(true);
      expect(store.slope[store.idx(8, 8)]).toBe(0);
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(!!store.half[store.idx(8, 8)]).toBe(false);
      expect(store.frameX[store.idx(8, 8)]).toBe(18 * style);   // 材质列不被锤改写
    }
  });

  it('380 种植箱（各材质）：入锤目标门但 CanPoundTile(case380) 拒整形=形不变闩消费', () => {
    const PLANTER = TILE_BY_KEY['v_380_planter_boxes']!;
    for (const style of [0, 7]) {
      const { g, store } = mkHammerGame();
      store.setTileSilent(8, 8, PLANTER, 0, 18 * style);
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(g.hammerPoundRelease).toBe(false);            // 闩照常消费（原版 :46700）
      expect(store.half[store.idx(8, 8)]).toBe(0);
      expect(store.slope[store.idx(8, 8)]).toBe(0);
      expect(store.frameY[store.idx(8, 8)]).toBe(18 * style);
    }
  });
});

// ═══════════════ C 自动斜放面（真 tryPlace,智能光标态） ═══════════════

function shell(w: World, item: ItemDef, o: { smart?: boolean } = {}) {
  const vid = Number((/^vi_(\d+)_/.exec(item.key) ?? [])[1] ?? -1);
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & { tryPlace: Function; player: Record<string, unknown> };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = {};
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.remotePlayerProxies = [];
  g.smartCursor = { wanted: o.smart ?? true, showing: false };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => {};
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    cx: 10 * TILE + 8, cy: 16 * TILE + 8, x: 10 * TILE + 2, y: 16 * TILE, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, dead: false, gfxOffY: 0,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots: [{ id: ITEM_DEFS.indexOf(item), stack: 5 }],
      heldItem: () => ({ id: ITEM_DEFS.indexOf(item), stack: 5 }),
      removeAt: () => {},
      removeHeld: () => {},
    },
  } as unknown as Record<string, unknown>;
  void vid;
  return g;
}

const AUTO_TYPES: ReadonlyArray<readonly [number, string, number]> = [
  [94, '木平台', 0],
  [2518, '棕榈木平台(海边)', 17],
  [2627, '蒸汽朋克平台', 21],
  [3908, '冰冻平台', 35],
  [5162, '珊瑚礁平台', 45],
  [5812, '雪域平台', 57],
  [6125, '巨石平台(末样式)', 69],
  [3622, '红团队平台(427)', 0],
  [3638, '绿团队平台(435)', 0],
];

describe('SW-BJ3 C 自动斜放面：智能光标态逐型斜上/斜下 + style 帧带位', () => {
  for (const [vid, name, ps] of AUTO_TYPES) {
    const item = DEF_BY_VID.get(vid)!;
    it(`${name}：右上邻台 → 斜上(slope2)斜放下行；frameY 保持 ${18 * ps}`, () => {
      const w = new World(40, 40, 7, 'sw-bj3');
      const st = w.store as TileStore;
      st.setTileSilent(10, 21, TILE_BY_KEY['dirt']!, 0, 0);          // 支撑
      st.setTileSilent(11, 19, PLAT, 0, 0);                          // 上右平台锚
      shell(w, item).tryPlace(10, 20, item);
      const i = st.idx(10, 20);
      expect(st.type[i]).toBe(TILE_DEFS[TILE_BY_KEY[item.tile!]]?.vanilla?.sheet === 19 ? PLAT : st.type[i]);
      expect(st.slope[i]).toBe(2);                                    // 右上平台 → 斜上 slope2
      expect(st.frameY[i]).toBe(18 * ps);                             // ★style 帧与坡共存
      expect(st.frameX[i]).toBe(0);
      expect(st.half[i]).toBe(0);
    });
    it(`${name}：左下邻台 → 斜下(slope2 下行链)`, () => {
      const w = new World(40, 40, 7, 'sw-bj3');
      const st = w.store as TileStore;
      st.setTileSilent(10, 21, TILE_BY_KEY['dirt']!, 0, 0);
      st.setTileSilent(9, 21, PLAT, 0, 0);                            // 下左平台锚
      shell(w, item).tryPlace(10, 20, item);
      const i = st.idx(10, 20);
      expect(st.slope[i]).toBe(2);
      expect(st.frameY[i]).toBe(18 * ps);
    });
  }

  it('智能光标关 → 恒平放（原版门 Main.SmartCursorIsUsed,逐型抽查 2518/3908）', () => {
    for (const vid of [2518, 3908]) {
      const item = DEF_BY_VID.get(vid)!;
      const w = new World(40, 40, 7, 'sw-bj3');
      const st = w.store as TileStore;
      st.setTileSilent(9, 19, PLAT, 0, 0);
      shell(w, item, { smart: false }).tryPlace(10, 20, item);
      expect(st.slope[st.idx(10, 20)]).toBe(0);
    }
  });
});

// ═══════════════ D 碰撞面：异型坡面平台楼梯单向门 ═══════════════

interface TestBody { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; hitWall: boolean; hitHead: boolean }

describe('SW-BJ3 D 碰撞面：坡面平台楼梯对异型平台同成立（Collision.cs:1851-1866）', () => {
  for (const [tileId, name] of [[PLAT, '木平台'], [TILE_BY_KEY['v_435_green_team_platform']!, '绿团队平台'],
    [TILE_BY_KEY['v_380_planter_boxes']!, '花盆箱(非坡化族,slope 域外)']] as const) {
    if (tileId === TILE_BY_KEY['v_380_planter_boxes']) continue;   // 380 不在 PLATFORMS_SHEETS,无坡面
    it(`${name} slope1 从上方落下贴合斜面`, () => {
      const w = { store: new TileStore(40, 20), w: 40, h: 20 } as unknown as World;
      const st = w.store;
      st.setTile(20, 10, tileId);
      st.setSlope(20, 10, 1);
      const b: TestBody = { x: 20 * TILE + 2, y: 130, w: 12, h: 28, vx: 0, vy: 6, onGround: false, hitWall: false, hitHead: false };
      moveAndCollide(b as never, w, 0, 6);
      expect(b.onGround).toBe(true);
      expect(b.y + b.h).toBe(10 * TILE + 2);
    });
  }
});

// ═══════════════ E 渲染面结构锁（源文本锚；行为面=探针截图） ═══════════════

describe('SW-BJ3 E 渲染面结构锁：VanillaTiler 平台坡补片/半砖源/slope2 抑制门', () => {
  const tilerSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/render/VanillaTiler.ts'), 'utf8');

  it('平台坡面补片帧码 198/324（slope1）/162/306（slope2）绝对 X + style 行 r.sy 相对 Y（TileDrawing.cs:1552-1570）', () => {
    expect(tilerSrc).toMatch(/slope === 1 && diagOK\(1\)[\s\S]{0,400}?324/);
    expect(tilerSrc).toMatch(/slope === 2 && diagOK\(-1\)[\s\S]{0,400}?306/);
    expect(tilerSrc).toMatch(/ctx\.drawImage\(r\.img, fx2, r\.sy, 16, 16, dpx, dpy \+ 16/);
  });

  it('SW-BJ3 半砖源=帧上半（r.sy 起,非 r.sy+8）——平台半砖素材在帧上半 8px,原下半源=透明即隐形', () => {
    // 原版：normalTileRect=(frameX,frameY,w,halfBrickHeight=8 减项)（TileDrawing.cs:1016）,
    // 位置 y*16+halfBrickHeight（:1022）→ 源=帧【上半】8px 画到格下半。
    // 旧实现源 r.sy+8（帧下半）对平台=纯透明区 → 半砖平台整格隐形（物理仍在）。
    expect(tilerSrc).not.toMatch(/ctx\.drawImage\(r\.img, r\.sx, r\.sy \+ 8, r\.sw, 4/);
    expect(tilerSrc).not.toMatch(/ctx\.drawImage\(r\.img, r\.sx, r\.sy \+ 8, r\.sw, r\.sh - 8/);
    expect(tilerSrc).toMatch(/r\.sy, r\.sw, 4/);                    // 无支撑非平台:顶 4px + 暗条
  });

  it('SW-BJ3 平台半砖不吃 D2 暗条支（原版 :1655 Platforms 支画整 normalTileRect）', () => {
    // 原版 :1655 if(Platforms) 画 normalTileRect（与基础拍同）;暗条 (144,66) 仅非平台
    expect(tilerSrc).toMatch(/isPlatHalf/);
  });

  it('SW-BJ3 slope2 补片抑制门 = below blockType∈{0,4}（原版 :1565 !=4;slope1 支 :1551 !=5）', () => {
    expect(tilerSrc).toMatch(/bt !== 0 && bt !== 4/);               // slope2 支
    expect(tilerSrc).toMatch(/bt !== 0 && bt !== 5/);               // slope1 支
  });
});
