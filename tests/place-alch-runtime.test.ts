// ★②（2026-09-04 幽灵战役掉落/放置族批）：PlaceAlch 运行时 1:1 回归。
// 原版锚：WorldGen.cs:45776-45867 PlaceAlch 全文——
//   门（:45784-45858）＝目标格 !tile.active()；基座 (x,y+1) nactive()+非半砖+slope==0；
//   基座型 per-style 白名单（0 草族{2,477,492,78,380,109}/1 丛林{60,78,380}/
//   2 土泥{0,59,78,380}/3 邪恶{661,662,203,199,23,25,78,380}/4 沙{53,78,380,116}/
//   5 灰烬{57,633,78,380}/6 雪{78,380,147,161,163,164,200}）；目标格液体 per-style
//   （0-3 任何液体拒/4 岩浆拒/5 非岩浆拒/6 岩浆拒）。
//   写面（:45864-45869）＝type=82（芽,硬编码）+ frameX=18*style + frameY=0 +
//   CopyPaintAndCoating(基座)（Tile.cs:869-873：color/invisibleBlock/fullbrightBlock）。
//   掷位：PlaceAlch 全文无 genRand/Main.rand = 零掷。
// 路由锚：PlaceTile default 支 WorldGen.cs:60666-60670 `Main.tileAlch[num] → PlaceAlch`；
//   种子 createTile=82（Item.cs:5068-5081 等 placeStyle 0-6）——本仓 items.ts 种子 tile
//   字段挂 v_83（同族 82-84 判族等价）,写面终值=原版 82 苗（GrowAlch 熟化链承接）。
// 支撑位次：★② 后种子不再走 hasSupport 家具支撑近似（原版 legacy 放置无
//   TileObjectData 锚定）→ 陶盆 78/种植箱 380 非实心基座（vanilla 白名单明列）可植。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

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

const GRASS_T = TILE_INTERNAL_BY_SHEET.get(2)!;
const SAND_T = TILE_INTERNAL_BY_SHEET.get(53)!;
const ASH_T = TILE_INTERNAL_BY_SHEET.get(57)!;
const STONE_T = TILE_BY_KEY['stone']!;
const CLAY_T = TILE_BY_KEY['clay_pot']!;            // sheet 78（PlaceAlch 全样式白名单）
const PLANTER_T = TILE_BY_KEY['v_380_planter_boxes']!;  // sheet 380
const SPROUT_T = TILE_BY_KEY['v_82_herbs_sprout']!;     // sheet 82 写面

/** tryPlace 壳（同 active-gates-tb4 placeShell 桩面,removeAt 换计数器） */
function placeShell(w: World, heldVid: number) {
  const consumed: number[] = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  // ★SW-BJ12 2026-09-07 重钉：BJ10 SmartCursorHelper.TileTargetDesired 门
  // （tryPlace 头 lockedContinuity 读）缺 stub——锁存续期 null=无锁直通
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
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots: new Array(50).fill(null),
      heldItem: () => ({ id: iidOf(heldVid), stack: 5 }),
      removeAt: () => { consumed.push(1); },
      removeHeld: () => { consumed.push(1); },   // SW-AZ1:手持消耗统一入口
    },
  };
  return {
    g: g as unknown as { tryPlace: (tx: number, ty: number, def: (typeof ITEM_DEFS)[number]) => void },
    consumed,
  };
}

/** 石地世界：行 21 石面（部分用例覆写基座），作业面行 20 */
function mkWorld(): { w: World; st: World['store'] } {
  const w = new World(40, 40, 13, 'place-alch');
  const st = w.store;
  for (let x = 2; x < 38; x++) st.setTileSilent(x, 21, STONE_T);
  for (let x = 2; x < 38; x++) for (let y = 8; y <= 20; y++) st.setTile(x, y, 0, 0, 0);
  return { w, st };
}

describe('② PlaceAlch 运行时（WorldGen.cs:45776-45867 1:1）', () => {
  it('日曜草种子（style0）植草基 → 写 82 芽 frameX=0 + 消耗种子', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);          // 草基座（style0 白名单）
    const { g, consumed } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);   // 写面=82 芽（:45866 硬编码,非入口 83）
    expect(st.frameX[st.idx(8, 20)]).toBe(0);        // frameX=18*style（:45867）
    expect(st.frameY[st.idx(8, 20)]).toBe(0);        // frameY=0（:45868）
    expect(consumed.length).toBe(1);                 // PlaceTile true → 消耗
  });

  it('基座失配（石基植 style0）→ 拒置不消耗（PlaceTile false 不扣不施时）', () => {
    const { w, st } = mkWorld();
    const { g, consumed } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.hasTile(8, 20)).toBe(false);
    expect(consumed.length).toBe(0);
  });

  it('目标格有水 + style0 → 任何液体拒（:45799-45801,liqGateHerb 岩浆窄域外的新增门）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    st.setLiquid(8, 20, 200, 1);                     // 目标格水（非岩浆=旧岩浆门放行）
    const { g, consumed } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.hasTile(8, 20)).toBe(false);           // PlaceAlch case0 `tile.liquid>0 → flag`
    expect(consumed.length).toBe(0);
  });

  it('水叶种子（style4）植沙基+水格 → 可植（case4 只拒岩浆）;火焰花（style5）水格拒', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, SAND_T, 0, 0);
    st.setLiquid(8, 20, 200, 1);
    const a = placeShell(w, 311);
    a.g.tryPlace(8, 20, defOf(311));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);   // case4 `liquid>0 && lava` → 水放行
    expect(st.frameX[st.idx(8, 20)]).toBe(18 * 4);
    st.setTileSilent(12, 21, ASH_T, 0, 0);
    st.setLiquid(12, 20, 200, 1);
    const b = placeShell(w, 312);
    b.g.tryPlace(12, 20, defOf(312));
    expect(st.hasTile(12, 20)).toBe(false);          // case5 `liquid>0 && !lava` → 水拒
    expect(b.consumed.length).toBe(0);
  });

  it('火焰花（style5）植灰烬基+岩浆格 → 可植（岩浆 Allowed 档）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, ASH_T, 0, 0);
    st.setLiquid(8, 20, 255, 2);                     // 岩浆
    const { g } = placeShell(w, 312);
    g.tryPlace(8, 20, defOf(312));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    expect(st.frameX[st.idx(8, 20)]).toBe(18 * 5);
  });

  it('基座半砖/顶坡 → 拒置（:45784 !halfBrick + slope==0）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    st.half[st.idx(8, 21)] = 1;
    const a = placeShell(w, 307);
    a.g.tryPlace(8, 20, defOf(307));
    expect(st.hasTile(8, 20)).toBe(false);
    st.half[st.idx(8, 21)] = 0;
    st.slope[st.idx(8, 21)] = 2;                     // topSlope 基座（PlaceAlch 不拍平不挑平）
    const b = placeShell(w, 307);
    b.g.tryPlace(8, 20, defOf(307));
    expect(st.hasTile(9, 20)).toBe(false);
    expect(st.hasTile(8, 20)).toBe(false);
    expect(st.slope[st.idx(8, 21)]).toBe(2);         // 基座原样（拒置无写面）
    expect(b.consumed.length).toBe(0);
  });

  it('陶盆 78 / 种植箱 380 基座 → 可植（★② hasSupport 豁免位：非实心白名单基座曾误拒）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, CLAY_T, 0, 0);
    const a = placeShell(w, 307);
    a.g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    st.setTileSilent(12, 21, PLANTER_T, 0, 0);
    const b = placeShell(w, 309);                    // 闪烁根（style2 白名单 {0,59,78,380}）
    b.g.tryPlace(12, 20, defOf(309));
    expect(st.type[st.idx(12, 20)]).toBe(SPROUT_T);
    expect(b.consumed.length).toBe(1);
  });

  it('CopyPaintAndCoating（Tile.cs:869-873）：基座漆/方块涂层位 → 芽继承', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    st.paint[st.idx(8, 21)] = 6;                     // 基座油漆（color）
    st.coat[st.idx(8, 21)] = 8;                      // fullbrightBlock 位（方块侧）
    const { g } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    expect(st.paint[st.idx(8, 20)]).toBe(6);
    expect(st.coat[st.idx(8, 20)] & 8).toBe(8);      // 方块侧掩码位照抄
  });

  it('掷位登记：PlaceAlch 全文零 RNG——放置全程不触 Math.random（零掷）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    const { g } = placeShell(w, 307);
    let rolls = 0;
    const orig = Math.random;
    Math.random = () => { rolls++; return 0.5; };
    try { g.tryPlace(8, 20, defOf(307)); } finally { Math.random = orig; }
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    expect(rolls).toBe(0);                           // :45776-45867 无 genRand/Main.rand
  });
});
