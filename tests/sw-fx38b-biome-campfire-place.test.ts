// SW-FX38b（2026-09-15）：营火群系自动转换（解锁火把神恩宠后放置普通营火→当期群系营火）。
// FX37 同族姊妹缺口：火把 4 转换已建（tryPlace 专用支），营火 215 走通用表驱动路径
// 无转换 = 解锁后放的营火仍是普通营火。
//
// 【定谳】原版转换在 Player 域、先于 CanPlace/PlaceTile：
//   - 门 = UsingBiomeTorches（Player.cs:3934-3941）= unlockedBiomeTorches ∧
//     builderAccStatus[11]==0（与火把 FX37 同门,Game.usingBiomeTorches 单源）。
//   - 放置消费位 FigureOutWhatToPlace（Player.cs:43759-43762）：
//     `if (UsingBiomeTorches && tileToCreate == 215 && previewPlaceStyle == 0)
//      BiomeCampfirePlaceStyle(ref tileToCreate, ref previewPlaceStyle)`——仅普通营火
//     （item 966,placeStyle 0）转换,显式群系营火（3046-3050/3723-3724/4689-4694/
//     5299/5357,placeStyle 1-15）不动;普通+智能光标放置同路（输出直入
//     PlaceThing_Tiles_TryPlacing）。
//   - 查表 BiomeCampfirePlaceStyle（Player.cs:40666-40721）——与 BiomeTorchPlaceStyle
//     同域同构但【优先序与值域都不同】（逐字比对,1457）：
//       优先序 shimmer15 → glowshroom14 → temple13 → dungeon7 → underworld2 →
//       hallow12 → corrupt10 → crimson11 → snow3 → jungle13 →
//       (desert∧地表 ∨ undergroundDesert)8 → (desert∧remix)8;无命中 = 0。
//       vs 火把序 dungeon→temple→…→glowshroom（glowshroom/temple 前移=营火独有）,
//       值域 {15,14,13,7,2,12,10,11,3,8} vs 火把 {23,13,21,7,22,20,18,19,9,16}。
//   - 块换消费位（本仓 Game.biomeSwapStyle 同管）：PlaceThing_TryReplacingTiles
//     :40214-40217（ReplaceTile 写面前）+ PlaceThing_ValidTileForReplacement
//     :40240-40243（verdict 前）——雪原持普通营火对雪营火 = 转换后同 style 拒换。
//   - 本仓帧语义：tile-anchors 215 表（Style3x2,UsesCustomCanPlace,AnchorBottom
//     SolidTile|SolidWithTop|SolidSide cnt3）+ framedCellFrame default 分支
//     frameX = style*(fw=3)*18 = style*54（块换 verdict frameX/54 同域）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';
import { biomeCampfirePlaceStyle, biomeTorchPlaceStyle } from '../src/world/Torch';
import { builderAccDefaults, BACC } from '../src/stats/builderAcc';
import type { ItemDef } from '../src/data/items';
import type { World } from '../src/world/World';

const TILE = 16;
const STONE = TILE_BY_KEY['stone']!;
const CAMPFIRE_TILE = TILE_BY_KEY['v_215_campfires']!;
const itemOf = (vid: number): ItemDef => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = ITEM_DEFS[ITEM_BY_KEY[key]];
  expect(d, `vid ${vid} 在册`).toBeTruthy();
  return d!;
};
const CAMPFIRE_ITEM = itemOf(966);         // 普通营火（placeStyle 0 → 转换域）
const FROZEN_CAMPFIRE_ITEM = itemOf(3048); // 显式雪原营火（placeStyle 3 → 不转换）

/** 场景群系旗快照（Game.biomeTorchZonesAt 消费面;未列旗恒 false） */
type ZoneFlags = Partial<Record<
  'zoneShimmer' | 'zoneDungeon' | 'zoneTemple' | 'zoneUnderworldHeight' | 'zoneGlowshroom'
  | 'zoneHallow' | 'zoneCorrupt' | 'zoneCrimson' | 'zoneSnow' | 'zoneJungle' | 'zoneDesert'
  | 'zoneUndergroundDesert' | 'belowSurface', boolean>>;

interface Opts {
  unlocked?: boolean;
  toggleOff?: boolean;   // builderAccStatus[11]=1（群系炬图标 OFF）
  zones?: ZoneFlags;
  held?: ItemDef;
}

function shell(w: World, o: Opts = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.recLog = () => {};
  g.net = null;                                  // netCanEditTile → true
  g.scene = { ...o.zones };                      // biomeTorchZonesAt 的 SceneMetrics 侧影
  g.smartCursor = { lockedContinuity: null, showing: false, x: -1, y: -1 };
  const held = o.held ?? CAMPFIRE_ITEM;
  const slots: Array<{ id: number; stack: number; favorited: boolean } | null> = [
    { id: ITEM_DEFS.indexOf(held), stack: 99, favorited: false },
  ];
  const ba = builderAccDefaults();
  if (o.toggleOff) ba[BACC.TorchBiome] = 1;
  g.player = {
    cx: 20 * TILE + 10, cy: 30 * TILE + 14, x: 20 * TILE, y: 30 * TILE, w: 20, h: 42,
    facing: 1, useTime: 0, dead: false, builderAccStatus: ba, equipStats: {},
    // 通用放置尾段 paintTileSpeed 消费（Player.placeSpeedTileRaw Player.ts:3430——
    //  mock 无 buff/配饰面,恒 1 = 无加速原值）
    placeSpeedTileRaw: () => 1,
    buffs: { has: () => false },
    inv: { selected: 0, slots, heldItem: () => slots[0], removeHeld: () => {} },
  };
  return g;
}

function mkWorld(seedFlags?: { remix?: boolean }): { st: TileStore; w: World } {
  const st = new TileStore(64, 640);
  const w = {
    store: st, w: 64, h: 640, flags: {}, chests: [], furnitureItems: [],
    groundLevel: 40, seedFlags, oldOnesArmy: { ongoing: false },
  } as unknown as World;
  return { st, w };
}

/** 铺 3 宽地板（营火 3×2 底锚）+ 以 shell 当前持物在 (20,29)（底中格=Origin(1,1)）放营火。
 *  返回锚左上格 frameX（=style*54;未写格=-1）与写入 type */
function placeCampfire(st: TileStore, g: Record<string, any>, tx = 20, ty = 29): { frameX: number; type: number } {
  for (const dx of [-1, 0, 1]) st.setTileSilent(tx + dx, ty + 1, STONE, 0, 0);
  g.tryPlace(tx, ty, ITEM_DEFS[g.player.inv.slots[0].id]);
  const i = st.idx(tx - 1, ty - 1);   // 锚左上 = 点击 − Origin(1,1)
  return { frameX: st.type[i] === CAMPFIRE_TILE ? st.frameX[i] : -1, type: st.type[i] };
}

/** 逐群系查表期望（:40670-40716 优先序表值;frameX = style*54） */
const ALL_ZONES: Partial<Record<keyof ZoneFlags, number>> = {
  zoneShimmer: 15, zoneGlowshroom: 14, zoneTemple: 13, zoneDungeon: 7,
  zoneUnderworldHeight: 2, zoneHallow: 12, zoneCorrupt: 10, zoneCrimson: 11,
  zoneSnow: 3, zoneJungle: 13,
};

describe('SW-FX38b 营火群系自动转换：解锁后放普通营火按当期群系转换（FigureOutWhatToPlace :43759 → BiomeCampfirePlaceStyle）', () => {
  it('逐群系查表（:40670-40716 优先序表值,帧 style*54）', () => {
    for (const [flag, style] of Object.entries(ALL_ZONES)) {
      const { st, w } = mkWorld();
      (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
      const g = shell(w, { unlocked: true, zones: { [flag]: true } });
      const deep = flag === 'zoneUnderworldHeight';
      if (deep) g.player.y = 450 * TILE;                              // 地狱带(像素门)
      const r = placeCampfire(st, g, 20, deep ? 449 : 29);
      expect(r.type, flag).toBe(CAMPFIRE_TILE);
      expect(r.frameX, flag).toBe(style * 54);
    }
  });

  it('沙漠双门：地表（<worldSurface）→8;地下沙漠旗 →8;地下无沙漠旗 →不转', () => {
    const { st, w } = mkWorld();
    (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g = shell(w, { zones: { zoneDesert: true } });                       // belowSurface 未置=地表
    expect(placeCampfire(st, g).frameX).toBe(8 * 54);
    const r2 = mkWorld();
    (r2.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g2 = shell(r2.w, { zones: { zoneDesert: true, belowSurface: true, zoneUndergroundDesert: true } });
    g2.player.y = 1000;                                                        // 地下带(<7040)
    expect(placeCampfire(r2.st, g2, 20, 61).frameX).toBe(8 * 54);
    const r3 = mkWorld();
    (r3.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g3 = shell(r3.w, { zones: { zoneDesert: true, belowSurface: true } });
    g3.player.y = 1000;
    expect(placeCampfire(r3.st, g3, 20, 61).frameX).toBe(0);                           // 地下普通沙漠无营火
    // remix 补支 :40714-40716
    const r4 = mkWorld({ remix: true });
    (r4.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g4 = shell(r4.w, { zones: { zoneDesert: true, belowSurface: true } });
    expect(placeCampfire(r4.st, g4).frameX).toBe(8 * 54);
  });

  it('★优先序与火把表差异：glowshroom>temple>dungeon（火把序 dungeon→temple→glowshroom）', () => {
    const seq: Array<ZoneFlags & { deep?: boolean }> = [   // deep=zoneUnderworldHeight 深带支（shell 内 scene 快照运行时已携带）
      { zoneGlowshroom: true, zoneDungeon: true },     // 营火 glowshroom 先 → 14;火把同景 dungeon 先
      { zoneTemple: true, zoneDungeon: true },         // 营火 temple 先 → 13;火把同景 dungeon 先
      { zoneDungeon: true, zoneUnderworldHeight: true }, // 两表同序 dungeon → 7
      { zoneUnderworldHeight: true, zoneGlowshroom: true, deep: true }, // glowshroom 先 → 14
      { zoneSnow: true, zoneJungle: true },            // snow → 3
      { zoneHallow: true, zoneCorrupt: true, zoneCrimson: true },   // 12
      { zoneCorrupt: true, zoneCrimson: true },        // 10
    ];
    const want = [14, 13, 7, 14, 3, 12, 10];
    seq.forEach((zones, k) => {
      const { st, w } = mkWorld();
      (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
      const g = shell(w, { zones });
      expect(placeCampfire(st, g).frameX, `case ${k}`).toBe(want[k] * 54);
    });
    // 同景对拍：火把表同景给 dungeon 13（dungeon>glowshroom/temple）——两表序差异实证
    const torchZones = { shimmer: false, dungeon: true, temple: false, underworld: false,
      glowshroom: true, hallow: false, corrupt: false, crimson: false, snow: false,
      jungle: false, desert: false, undergroundDesert: false, aboveSurface: true, remixWorld: false };
    expect(biomeTorchPlaceStyle(torchZones)).toBe(13);
    expect(biomeCampfirePlaceStyle(torchZones)).toBe(14);   // 营火同景 glowshroom 先
  });

  it('无命中群系（森林）→ 保持普通营火 style0（BiomeCampfirePlaceStyle 兜底 return 0）', () => {
    const { st, w } = mkWorld();
    (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g = shell(w, {});
    expect(placeCampfire(st, g).frameX).toBe(0);
  });

  it('★门控两态：未解锁 → 恒普通营火（雪原也不转）;解锁+开关 OFF（status[11]=1）→ 同普通营火', () => {
    const { st, w } = mkWorld();
    const g = shell(w, { zones: { zoneSnow: true } });                          // 未解锁
    expect(placeCampfire(st, g).frameX).toBe(0);
    const r2 = mkWorld();
    (r2.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g2 = shell(r2.w, { unlocked: true, toggleOff: true, zones: { zoneSnow: true } });
    expect(placeCampfire(r2.st, g2).frameX).toBe(0);                           // 图标 OFF=保持普通营火
  });

  it('显式群系营火不转换（门 placeStyle==0）：神圣地持雪原营火仍 3', () => {
    const { st, w } = mkWorld();
    (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g = shell(w, { unlocked: true, held: FROZEN_CAMPFIRE_ITEM, zones: { zoneHallow: true } });
    const heldDef = ITEM_DEFS[g.player.inv.slots[0].id];
    expect(`${heldDef.key}|${TILE_BY_KEY[heldDef.tile as string]}|${heldDef.placeStyle}`).toBe('vi_3048_FrozenCampfire|186|3');
    expect(placeCampfire(st, g).frameX).toBe(3 * 54);
  });
});

describe('SW-FX38b biomeCampfirePlaceStyle 纯表（Torch.ts 提取单源;与放置机解耦）', () => {
  const zonesOf = (over: Partial<Parameters<typeof biomeCampfirePlaceStyle>[0]>): Parameters<typeof biomeCampfirePlaceStyle>[0] => ({
    shimmer: false, dungeon: false, temple: false, underworld: false, glowshroom: false,
    hallow: false, corrupt: false, crimson: false, snow: false, jungle: false,
    desert: false, undergroundDesert: false, aboveSurface: true, remixWorld: false,
    ...over,
  });
  it('全 12 支逐值', () => {
    expect(biomeCampfirePlaceStyle(zonesOf({ shimmer: true }))).toBe(15);
    expect(biomeCampfirePlaceStyle(zonesOf({ glowshroom: true }))).toBe(14);
    expect(biomeCampfirePlaceStyle(zonesOf({ temple: true }))).toBe(13);
    expect(biomeCampfirePlaceStyle(zonesOf({ dungeon: true }))).toBe(7);
    expect(biomeCampfirePlaceStyle(zonesOf({ underworld: true }))).toBe(2);
    expect(biomeCampfirePlaceStyle(zonesOf({ hallow: true }))).toBe(12);
    expect(biomeCampfirePlaceStyle(zonesOf({ corrupt: true }))).toBe(10);
    expect(biomeCampfirePlaceStyle(zonesOf({ crimson: true }))).toBe(11);
    expect(biomeCampfirePlaceStyle(zonesOf({ snow: true }))).toBe(3);
    expect(biomeCampfirePlaceStyle(zonesOf({ jungle: true }))).toBe(13);
    expect(biomeCampfirePlaceStyle(zonesOf({ desert: true }))).toBe(8);                       // 地表
    expect(biomeCampfirePlaceStyle(zonesOf({ desert: true, aboveSurface: false, undergroundDesert: true }))).toBe(8);
    expect(biomeCampfirePlaceStyle(zonesOf({ desert: true, aboveSurface: false, remixWorld: true }))).toBe(8);
    expect(biomeCampfirePlaceStyle(zonesOf({ desert: true, aboveSurface: false }))).toBe(0);  // 地下普通沙漠
  });
  it('值域 {15,14,13,7,2,12,10,11,3,8} 与火把查表值域差异（:40666 vs :40554 同域异值）', () => {
    const outputs = new Set<number>();
    const keys = ['shimmer', 'dungeon', 'temple', 'underworld', 'glowshroom', 'hallow',
      'corrupt', 'crimson', 'snow', 'jungle', 'desert', 'undergroundDesert'] as const;
    for (const k of keys) {
      outputs.add(biomeCampfirePlaceStyle(zonesOf({ [k]: true } as never)));
    }
    outputs.add(biomeCampfirePlaceStyle(zonesOf({ desert: true, aboveSurface: false, remixWorld: true })));
    outputs.add(biomeCampfirePlaceStyle(zonesOf({})));   // 无命中 = 0
    expect(outputs).toEqual(new Set([15, 14, 13, 7, 2, 12, 10, 11, 3, 8, 0]));
  });
});
