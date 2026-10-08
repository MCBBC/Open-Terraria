// ★BJ567（2026-10-08 用户实报「种植草药时位置已种下种子也消耗种子/重复种植不拒绝」）：
// 种子族占用拒绝面回归。
//
// 定谳（原版 1457 亲读）：种子 createTile=82（Item.cs:5075-5140/23744 七种全 82）走
// legacy 放置路——TileObjectData.CustomPlace 对 82 显式排除（Player.cs:40085
// `&& tileToCreate != 82`）→ AssortedThings（:41356）。占用裁决 = flag8 块
// （Player.cs:41623-41651；种子 :41614-41617 tileAlch[createTile] 强制 canPlace 后）：
//   ① 同型拒绝 :41647-41650 `type == createTile → canPlace=false`——苗 82 vs 种子
//     createTile 82 恒同型 → 重复种植拒绝+零消耗+苗保留（本刀主诉;异种同拒）。
//   ② 异型杀格面 :41625-41645——num9（下方非盆器 78/380/579,:41627）∨（flag3{3,73}
//     :41628 ∨ IsVine :41629 ∨ IsADripTile :41630 ∨ 165 :41631 ∨ flag7 收获株 :41632
//     =tileAlch∧IsHarvestableHerbWithSeed（WorldGen.cs:66638-66656:82 恒不可收/83 走
//     IsAlchemyPlantHarvestable :66663-66690 时辰门/84 恒可收））& flag8 → KillTile
//     （:41636 带掉落;杀格在 canPlace 相,后置 PlaceAlch 成败【不回滚】）;否则拒绝。
//   ③ 外门 :40058 IsReplaceableBlock（:40107-40113）——非 tileCut∪BreakableWhenPlacing
//     （484/711 除外）∪{373-375,461,709} → 拒。
//   消耗 ⇔ 放置成功：ApplyItemTime 仅 PlaceIt flag=true（:40477-40480）,消耗在
//   itemTime==itemTimeMax 面（:43589-43607）→ 拒置零消耗。
// 本仓病灶：共享放置清格相（TileObject.Place :79-93 port）曾对种子族无条件 KillTile
//   苗/株 → placeAlchRuntime 见空格成功 → 重复种植吞种子;修 = tryPlace 清格相 alch 分支
//   （Game.ts ★BJ567 块）按 flag8 面 1:1。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

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

const GRASS_T = TILE_INTERNAL_BY_SHEET.get(2)!;      // style0 白名单基座
const SAND_T = TILE_INTERNAL_BY_SHEET.get(53)!;      // style0 白名单外（杀格不回滚面用）
const CLAY_T = TILE_BY_KEY['clay_pot']!;             // sheet 78 盆器域
const PLANTER_T = TILE_BY_KEY['v_380_planter_boxes']!;   // sheet 380 盆器域
const SPROUT_T = TILE_BY_KEY['v_82_herbs_sprout']!;  // 苗 82（同型拒绝面对象）
const HERB_T = TILE_BY_KEY['v_83_herbs_mature']!;    // 成熟株 83
const BLOOM_T = TILE_BY_KEY['v_84_herbs_bloom']!;    // 开花株 84
const PEBBLE_T = TILE_INTERNAL_BY_SHEET.get(185)!;   // 小石块（BreakableWhenPlacing 非 flag3-7）

/** tryPlace 壳（同 place-alch-runtime placeShell 桩面 + isAlchemyPlantHarvestable 可覆写） */
function placeShell(
  w: World,
  heldVid: number,
  opts?: { harvestable?: boolean },
) {
  const consumed: number[] = [];
  const drops: Array<[string, number]> = [];
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
  g.spawnDrop = (x: number, y: number, key: string, stack: number) => { drops.push([key, stack]); return null; };
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  if (opts?.harvestable !== undefined) {
    g.isAlchemyPlantHarvestable = () => opts.harvestable;   // 时辰门桩（谓词本体非本批对象）
  }
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
    g: g as unknown as { tryPlace: (tx: number, ty: number, def: (typeof ITEM_DEFS)[number]) => void },
    consumed,
    drops,
  };
}

/** 石地世界：行 21 石面（各用例覆写基座），作业面行 20 */
function mkWorld(): { w: World; st: World['store'] } {
  const w = new World(40, 40, 13, 'bj567');
  const st = w.store;
  for (let x = 2; x < 38; x++) st.setTileSilent(x, 21, TILE_BY_KEY['stone']!);
  for (let x = 2; x < 38; x++) for (let y = 8; y <= 20; y++) st.setTile(x, y, 0, 0, 0);
  return { w, st };
}

describe('BJ567 ① 同型拒绝——已种位置重复种植零消耗（Player.cs:41647-41650）', () => {
  it('苗 82（style0）上重植日曜草种 → 拒绝：苗原样 + 零消耗（主诉面）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    st.setTileSilent(8, 20, SPROUT_T, 0, 0);          // 已种下日曜草苗
    const { g, consumed } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);    // 苗保留（KillTile 不发生）
    expect(st.frameX[st.idx(8, 20)]).toBe(0);         // style0 帧原样
    expect(consumed.length).toBe(0);                  // 零消耗（ApplyItemTime 未走）
  });

  it('异种同拒——月光草种(308,style1)/火焰花种(312,style5) 植苗 82 → 全拒（七种 createTile 同值）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    st.setTileSilent(8, 20, SPROUT_T, 0, 0);
    st.setTileSilent(12, 21, GRASS_T, 0, 0);
    st.setTileSilent(12, 20, SPROUT_T, 0, 0);
    const a = placeShell(w, 308);
    a.g.tryPlace(8, 20, defOf(308));
    const b = placeShell(w, 312);
    b.g.tryPlace(12, 20, defOf(312));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    expect(st.type[st.idx(12, 20)]).toBe(SPROUT_T);
    expect(a.consumed.length).toBe(0);
    expect(b.consumed.length).toBe(0);
  });

  it('BJ548 面不回归——同基座空位照常落芽+消耗', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    const { g, consumed } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    expect(st.frameX[st.idx(8, 20)]).toBe(0);
    expect(consumed.length).toBe(1);
  });
});

describe('BJ567 ② 异型杀格面（Player.cs:41625-41645）', () => {
  it('盆器+成熟可收株 83（时辰门开）→ KillTile 掉落 + 补种 + 消耗（收割补种 QoL）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, PLANTER_T, 0, 0);
    st.setTileSilent(8, 20, HERB_T, 0, 0);            // 成熟株 style0
    const { g, consumed, drops } = placeShell(w, 307, { harvestable: true });
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);    // 旧株杀→新芽（seed style 终值）
    expect(st.frameX[st.idx(8, 20)]).toBe(0);
    expect(drops.length).toBeGreaterThanOrEqual(1);   // KillTile :41636 带掉落
    expect(consumed.length).toBe(1);
  });

  it('盆器+成熟不可收株 83（时辰门关）→ 拒绝零消耗零掉落,株保留（:41642-41645）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, PLANTER_T, 0, 0);
    st.setTileSilent(8, 20, HERB_T, 0, 0);
    const { g, consumed, drops } = placeShell(w, 307, { harvestable: false });
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(HERB_T);      // 株保留
    expect(st.frameX[st.idx(8, 20)]).toBe(0);
    expect(drops.length).toBe(0);                     // 零杀格
    expect(consumed.length).toBe(0);
  });

  it('盆器+开花株 84 恒可收（IsHarvestableHerbWithSeed :66650 无时辰门）→ 杀+补种+消耗', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, PLANTER_T, 0, 0);
    st.setTileSilent(8, 20, BLOOM_T, 5 * 18, 0);      // 开花株 style5
    const { g, consumed, drops } = placeShell(w, 307, { harvestable: false });  // 桩=false 证 84 无条件支
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(consumed.length).toBe(1);
  });

  it('自然基座+不可收株 83 → num9 支杀格+补种+消耗（:41627/:41634）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, GRASS_T, 0, 0);
    st.setTileSilent(8, 20, HERB_T, 0, 0);
    const { g, consumed } = placeShell(w, 307, { harvestable: false });
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(SPROUT_T);    // 杀株（掉落面别域）→ 补种
    expect(consumed.length).toBe(1);
  });

  it('杀格不回滚——可收株+基座失配（style0 植沙基）→ 株已杀+拒置零消耗（KillTile 在 canPlace 相 :41636）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, SAND_T, 0, 0);            // 53 ∉ style0 白名单 {2,477,492,78,380,109}
    st.setTileSilent(8, 20, HERB_T, 0, 0);
    const { g, consumed, drops } = placeShell(w, 307, { harvestable: true });
    g.tryPlace(8, 20, defOf(307));
    expect(st.hasTile(8, 20)).toBe(false);            // 株已杀（后置 PlaceAlch 失败不回滚,原版同相）
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(consumed.length).toBe(0);                  // 拒置零消耗
  });

  it('盆器+非杀格对象（小石块 185,BreakableWhenPlacing 非 flag3-7）→ 拒绝零消耗', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(8, 21, CLAY_T, 0, 0);
    st.setTileSilent(8, 20, PEBBLE_T, 0, 0);
    const { g, consumed } = placeShell(w, 307);
    g.tryPlace(8, 20, defOf(307));
    expect(st.type[st.idx(8, 20)]).toBe(PEBBLE_T);    // 对象保留（共享清格相不再吞）
    expect(consumed.length).toBe(0);
  });
});
