// SW-FX37（2026-09-15）：群系炬自动转换（解锁火把神恩宠后放置普通火把→当期群系火把）
// 用户实报：解锁后放置的火把仍是普通火把。
//
// 【定谳】原版转换在 Player 域、先于 WorldGen.PlaceTile：
//   - 门 = UsingBiomeTorches（Player.cs:3934-3941）= unlockedBiomeTorches ∧
//     builderAccStatus[11]==0（背包左群系炬图标 Main.cs:43282 DrawTorchBiomeSwapIcon
//     翻 [11],音 22;图标帧 Frame(4,1,flag?1:0)=ON 帧1/OFF 帧0,UI.ts FX35 已 1:1）。
//   - 转换调用位 PlaceThing_Tiles_PlaceIt（Player.cs:40447）：
//     `if (UsingBiomeTorches && tileToCreate == 4 && style == 0)
//      BiomeTorchPlaceStyle(ref tileToCreate, ref style)`——仅普通炬（placeStyle==0）
//     转换,显式群系炬/水炬/彩炬不动;智能光标预览（FigureOutWhatToPlace :43755）与
//     方块替换面（:40210/:40236/:40262）同表。
//   - 查表 BiomeTorchPlaceStyle（Player.cs:40550-40585）优先序（1457 逐支）：
//     shimmer23 → dungeon13 → temple21 → underworld7 → glowshroom22 → hallow20 →
//     corrupt18 → crimson19 → snow9 → jungle21 → (desert∧地表 ∨ undergroundDesert)16 →
//     (desert∧remix)16;无命中 = 不改（0 普通炬）。
//   - 水下特支（WorldGen.PlaceTile :59949）：tile.liquid>0 时火把仅 style 8/11/17
//     （咒火/灵液/珊瑚炬）放行,其余拒——转换值域 {23,13,21,7,22,20,18,19,9,16} 与
//     水炬集 ∩ = ∅ → 水下放普通炬在解锁后仍拒（与未解锁同判,原版同序:转换在先）。
//   - 本仓曾缺整个转换支（Game.tryPlace 火把支恒 torchStyleOfItemKey→0）=
//     实报根因;持物光标图标覆写门（Main.cs:45800）曾只读 unlockedBiomeTorches 漏
//     [11] 位,一并接 usingBiomeTorches()。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, T } from '../src/data/tiles';
import { biomeTorchPlaceStyle, torchStyleOfItemKey, WATER_TORCH_STYLES } from '../src/world/Torch';
import { builderAccDefaults, BACC } from '../src/stats/builderAcc';
import type { ItemDef } from '../src/data/items';
import type { World } from '../src/world/World';

const TILE = 16;
const STONE = TILE_BY_KEY['stone']!;
const TORCH = T.TORCH;
const itemOf = (vid: number): ItemDef => {
  const d = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];
  expect(d, `vid ${vid} 在册`).toBeTruthy();
  return d;
};
const TORCH_ITEM = itemOf(8);        // 普通火把
const SNOW_TORCH_ITEM = itemOf(974); // 冰雪火把（显式群系炬,style9）
const CURSED_TORCH_ITEM = itemOf(523); // 咒火炬（水炬,style8）

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
  const slots: Array<{ id: number; stack: number; favorited: boolean } | null> = [
    { id: ITEM_DEFS.indexOf(o.held ?? TORCH_ITEM), stack: 99, favorited: false },
  ];
  const ba = builderAccDefaults();
  if (o.toggleOff) ba[BACC.TorchBiome] = 1;
  g.player = {
    cx: 20 * TILE + 10, cy: 30 * TILE + 14, x: 20 * TILE, y: 30 * TILE, w: 20, h: 42,
    facing: 1, useTime: 0, dead: false, builderAccStatus: ba, equipStats: {},
    buffs: { has: () => false },
    inv: { selected: 0, slots, heldItem: () => slots[0], removeHeld: () => {} },
  };
  return g;
}

function mkWorld(): { st: TileStore; w: World } {
  const st = new TileStore(64, 64);
  const w = {
    store: st, w: 64, h: 64, flags: {}, chests: [], furnitureItems: [],
    groundLevel: 40, seedFlags: undefined, oldOnesArmy: { ongoing: false },
  } as unknown as World;
  return { st, w };
}

/** 铺地板 + 以 shell 当前持物放炬;可注水。返回写入的 frameY（=style*22,-1=未写格） */
function place(st: TileStore, g: Record<string, any>, tx: number, ty: number, liquid = 0): number {
  st.setTileSilent(tx, ty + 1, STONE, 0, 0);
  if (liquid > 0) st.liquid[st.idx(tx, ty)] = liquid;
  g.tryPlace(tx, ty, ITEM_DEFS[g.player.inv.slots[0].id]);
  return st.type[st.idx(tx, ty)] === TORCH ? st.frameY[st.idx(tx, ty)] : -1;
}

const ALL_ZONES: Partial<Record<keyof ZoneFlags, number>> = {
  zoneShimmer: 23, zoneDungeon: 13, zoneTemple: 21, zoneUnderworldHeight: 7,
  zoneGlowshroom: 22, zoneHallow: 20, zoneCorrupt: 18, zoneCrimson: 19,
  zoneSnow: 9, zoneJungle: 21,
};

describe('SW-FX37 群系炬自动转换：解锁后放普通炬按当期群系转换（PlaceThing :40447 → BiomeTorchPlaceStyle）', () => {
  it('逐群系查表（:40550-40585 优先序表值）', () => {
    for (const [flag, style] of Object.entries(ALL_ZONES)) {
      const { st, w } = mkWorld();
      (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
      const g = shell(w, { unlocked: true, zones: { [flag]: true } });
      expect(place(st, g, 20, 29), flag).toBe(style * 22);
    }
  });

  it('沙漠双门：地表（<worldSurface）→16;地下沙漠旗 →16;地下无沙漠旗 →不转', () => {
    const { st, w } = mkWorld();
    (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g = shell(w, { zones: { zoneDesert: true } });                       // belowSurface 未置=地表
    expect(place(st, g, 20, 29)).toBe(16 * 22);
    const r2 = mkWorld();
    (r2.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g2 = shell(r2.w, { zones: { zoneDesert: true, belowSurface: true, zoneUndergroundDesert: true } });
    expect(place(r2.st, g2, 20, 29)).toBe(16 * 22);
    const r3 = mkWorld();
    (r3.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g3 = shell(r3.w, { zones: { zoneDesert: true, belowSurface: true } });
    expect(place(r3.st, g3, 20, 29)).toBe(0);                                  // 地下普通沙漠无炬
  });

  it('优先级序：shimmer>dungeon>temple>underworld、hall>cor>cri、snow>jungle、dungeon>snow', () => {
    const seq: ZoneFlags[] = [
      { zoneShimmer: true, zoneDungeon: true, zoneSnow: true },
      { zoneDungeon: true, zoneTemple: true },
      { zoneUnderworldHeight: true, zoneGlowshroom: true },
      { zoneHallow: true, zoneCorrupt: true, zoneCrimson: true },
      { zoneCorrupt: true, zoneCrimson: true },
      { zoneSnow: true, zoneJungle: true },
    ];
    const want = [23, 13, 7, 20, 18, 9];
    seq.forEach((zones, k) => {
      const { st, w } = mkWorld();
      (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
      const g = shell(w, { zones });
      expect(place(st, g, 20, 29), `case ${k}`).toBe(want[k] * 22);
    });
  });

  it('无命中群系（森林）→ 保持普通炬 style0（BiomeTorchPlaceStyle 兜底 return 0）', () => {
    const { st, w } = mkWorld();
    (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g = shell(w, {});
    expect(place(st, g, 20, 29)).toBe(0);
  });

  it('★门控两态：未解锁 → 恒普通炬（雪原也不转）;解锁+开关 OFF（status[11]=1）→ 同普通炬', () => {
    const { st, w } = mkWorld();
    const g = shell(w, { zones: { zoneSnow: true } });                          // 未解锁
    expect(place(st, g, 20, 29)).toBe(0);
    const r2 = mkWorld();
    (r2.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g2 = shell(r2.w, { unlocked: true, toggleOff: true, zones: { zoneSnow: true } });
    expect(place(r2.st, g2, 20, 29)).toBe(0);                                  // 图标 OFF=保持普通炬
  });

  it('显式群系炬/水炬不转换（门 style==0）：雪原持神圣炬仍 9、咒火炬仍 8', () => {
    const { st, w } = mkWorld();
    (w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g = shell(w, { unlocked: true, held: SNOW_TORCH_ITEM, zones: { zoneHallow: true } });
    const heldDef = ITEM_DEFS[g.player.inv.slots[0].id];
    expect(`${heldDef.key}|${TILE_BY_KEY[heldDef.tile as string]}|${T.TORCH}|${torchStyleOfItemKey(heldDef.key)}`).toBe('vi_974_ice_torch|12|12|9');
    expect(place(st, g, 20, 29)).toBe(9 * 22);
    const r2 = mkWorld();
    (r2.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g2 = shell(r2.w, { unlocked: true, held: CURSED_TORCH_ITEM, zones: { zoneHallow: true } });
    expect(place(r2.st, g2, 20, 29)).toBe(8 * 22);
  });

  it('★水下特支（PlaceTile :59949）：液体中普通炬拒;解锁+雪原（转 9）仍拒——转换值域与水炬集无交', () => {
    const { st, w } = mkWorld();
    const g = shell(w, {});
    expect(place(st, g, 20, 29, 200)).toBe(-1);                                // 未解锁:拒
    const r2 = mkWorld();
    (r2.w.flags as Record<string, boolean>).unlockedBiomeTorches = true;
    const g2 = shell(r2.w, { unlocked: true, zones: { zoneSnow: true } });
    expect(place(r2.st, g2, 20, 29, 200)).toBe(-1);                            // 解锁后转 9:仍拒
    const r3 = mkWorld();
    const g3 = shell(r3.w, { held: CURSED_TORCH_ITEM });
    expect(place(r3.st, g3, 20, 29, 200)).toBe(8 * 22);                        // 水炬 8:放行
  });

  it('查表单源不变式：BiomeTorchPlaceStyle 值域 ∩ 水炬集 {8,11,17} = ∅（转换永不改水体门结果）', () => {
    const outputs = new Set<number>();
    const zones = { shimmer: false, dungeon: false, temple: false, underworld: false,
      glowshroom: false, hallow: false, corrupt: false, crimson: false, snow: false,
      jungle: false, desert: false, undergroundDesert: false, aboveSurface: true, remixWorld: false };
    for (const k of Object.keys(zones) as Array<keyof typeof zones>) {
      zones[k] = true;
      outputs.add(biomeTorchPlaceStyle(zones));
      zones[k] = false;
    }
    for (const s of outputs) expect(WATER_TORCH_STYLES.has(s), `style ${s}`).toBe(false);
  });
});
