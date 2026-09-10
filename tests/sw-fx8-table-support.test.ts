// SW-FX8（2026-09-10）审计 tile-audit-2026-08-23.md E 区 ❌#9 随批备案清偿：
//   Check2x1 桌面支撑门 29 存钱罐/103 碗/462 沙漠精灵灯（DECOR_SUPPORT_KIND 'table2x1'）。
// 金标（1457）：
//   - Check2x1（WorldGen.cs:47379）：case 103 :47426-47440（下方逐格 active∧tileTable∧
//     !halfBrick∧!topSlope,败则 AnchorValid(Table) 兜底 :52294-52329）；case 29/462
//     :47441-47451（仅直接门,无兜底臂）；尾段 :47507-47519 flag→destroyObject+KillTile。
//   - 放置侧：TileObjectData.cs:2810-2823 addTile(29)/addTile(103)/addTile(462) 复制
//     Style2x1 后 AnchorBottom=AnchorType.Table（tile-anchors.json 三件已 1:1）。
//   - Main.tileTable 全表 81 sheet（Main.cs:7018-7081/:7897-7898/:8171-8181/:8190-8191/
//     :8446/:10121/:10124-10131 for 循环 435-439）——SW-FX8 补齐 TILE_TABLE_SHEETS 435-439。
// 壳模式同 decor-support.test.ts（Object.create(Game.prototype)+桩）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET, TILE_TABLE_SHEETS } from '../src/data/tiles';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

interface Drop { key: string; n: number }

function mkShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
    checkFurnitureSupport: (x: number, y: number) => void;
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
  g.player = { inv: { countOf: () => 0 }, equipStats: {}, cx: 0, cy: 0 };
  return g;
}

const keyOf = (k: string) => {
  const id = TILE_BY_KEY[k];
  expect(id, `def ${k} 应存在`).toBeDefined();
  return id!;
};

const PIGGY = keyOf('v_29_piggy_bank');
const BOWL = keyOf('v_103_bowls');
const LAMP = keyOf('v_462_desert_spirit_lamp');
const DIRT = keyOf('dirt');
const TABLE = keyOf('table');
const PLATFORM = keyOf('platform');
const TEAM_PLAT = keyOf('v_435_green_team_platform');

/** 放一件 2×1 style 件（左列 fx=0/右列 fx=18,Style2x1 style0 帧式） */
function place2x1(w: World, id: number, x: number, y: number) {
  w.store.setTileSilent(x, y, id, 0, 0);
  w.store.setTileSilent(x + 1, y, id, 18, 0);
}
/** 铺下方两格支撑 */
function ground2(w: World, x: number, y: number, id: number) {
  w.store.setTileSilent(x, y, id, 0, 0);
  w.store.setTileSilent(x + 1, y, id, 0, 0);
}

describe('SW-FX8 Check2x1 桌面支撑门（29/103/462,WorldGen.cs:47426-47451）', () => {
  it('注册面：29/103/462 → table2x1 且入 DECOR_SWEEP（3×3 扫域）', () => {
    // 经 DECOR_SWEEP_TILE_IDS 间接锁——直接断言 checkFurnitureSupport 路由行为在下方用例;
    // 此处锁三件 def 形态（2×1 framed 非 solid）与 TILE_TABLE_SHEETS 补齐
    for (const id of [PIGGY, BOWL, LAMP]) {
      const d = TILE_DEFS[id]!;
      expect(d.w).toBe(2); expect(d.h).toBe(1); expect(d.framed).toBe(true); expect(!d.solid).toBe(true);
    }
    // Main.tileTable 全表 81 sheet（Main.cs:10124-10131 循环 435-439 补齐）
    expect(TILE_TABLE_SHEETS.size).toBe(81);
    for (const s of [19, 427, 435, 436, 437, 438, 439]) expect(TILE_TABLE_SHEETS.has(s)).toBe(true);
  });

  it('存钱罐 29 在泥土上 → 整件塌+掉 87（:47441 泥土非 tileTable）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-piggy-dirt');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    place2x1(w, PIGGY, 10, 9);
    ground2(w, 10, 10, DIRT);
    w.store.setTileSilent(10, 10, 0);   // 挖掉左下支撑
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);
    expect(w.store.get(11, 9)).toBe(0);   // 整件清（:47513-47517 KillTile 两格）
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[87], n: 1 }]);   // Piggy Bank
  });

  it('存钱罐 29 在木桌 14 上 → 幸存（tileTable :8171）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-piggy-table');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    // 桌顶行铺两格作支撑面（table def platform:true 顶面即下格）
    ground2(w, 10, 10, TABLE);
    place2x1(w, PIGGY, 10, 9);
    g.checkFurnitureSupport(10, 9);   // 邻格扰动直接触发（不破坏支撑）
    expect(w.store.get(10, 9)).toBe(PIGGY);   // 幸存
    expect(w.store.get(11, 9)).toBe(PIGGY);
    expect(drops).toEqual([]);
  });

  it('存钱罐 29 下方桌格 halfBrick → 塌（:47444 halfBrick 拒）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-piggy-half');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    ground2(w, 10, 10, TABLE);
    place2x1(w, PIGGY, 10, 9);
    w.store.half[w.store.idx(10, 10)] = 1;   // 左格半砖（原版 halfBrick() 门,下方格在世）
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);
    expect(drops.length).toBe(1);
  });

  it('存钱罐 29 在平台 19 上 → 幸存（Main.tileTable[19]=true,Main.cs:8174）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-piggy-plat');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    ground2(w, 10, 10, PLATFORM);
    place2x1(w, PIGGY, 10, 9);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(PIGGY);
  });

  it('存钱罐 29 在队伍平台 435 上 → 幸存（SW-FX8 补 Main.cs:10128 for 循环臂）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-piggy-teamplat');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    ground2(w, 10, 10, TEAM_PLAT);
    place2x1(w, PIGGY, 10, 9);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(PIGGY);
  });

  it('碗 103：泥土上塌掉 356 碗（style0）;桌沿顶坡平台帧带 12 由 AnchorValid(Table) 兜底臂救活（:47432/:52308-52321）', () => {
    // ①泥上塌
    const w1 = new World(40, 40, 7, 'sw-fx8-bowl-dirt');
    const drops1: Drop[] = [];
    const g1 = mkShell(w1, drops1);
    place2x1(w1, BOWL, 10, 9);
    ground2(w1, 10, 10, DIRT);
    w1.store.setTileSilent(10, 10, 0);
    g1.checkFurnitureSupport(10, 9);
    expect(w1.store.get(10, 9)).toBe(0);
    expect(drops1).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[356], n: 1 }]);   // Bowl（BOWLS 表 style0）
  });

  it('碗 103 vs 沙漠精灵灯 462：顶坡平台（非半砖,帧带 12-16）——103 兜底臂活/462 无兜底臂塌（分支差异锁）', () => {
    const mk = (name: string, id: number) => {
      const w = new World(40, 40, 7, name);
      const drops: Drop[] = [];
      const g = mkShell(w, drops);
      ground2(w, 10, 10, PLATFORM);
      // 平台左格锤成顶坡 slope1（blockType2）——直接门 topSlope 拒;
      // 帧带 num=frameX/18=12（216）∈12-16 且非半砖 → AnchorValid(Table) ③臂真
      w.store.slope[w.store.idx(10, 10)] = 1;
      w.store.frameX[w.store.idx(10, 10)] = 216;
      place2x1(w, id, 10, 9);
      g.checkFurnitureSupport(10, 9);   // 下方格在世（兜底臂才可达）
      return { drops, alive: w.store.get(10, 9) === id };
    };
    const bowl = mk('sw-fx8-bowl-anchor', BOWL);
    expect(bowl.alive).toBe(true);    // case 103 兜底臂 :47432 AnchorValid(Table)
    const lamp = mk('sw-fx8-lamp-noanchor', LAMP);
    expect(lamp.alive).toBe(false);   // case 462 无兜底臂 :47441-47451
    expect(lamp.drops.length).toBe(1);
  });

  it('半件态（右列已失）→ 锚格扫域整件杀不留孤儿（:47407-47413 flag 恒 true 尾段 KillTile）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-piggy-halfpiece');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    ground2(w, 10, 10, TABLE);
    place2x1(w, PIGGY, 10, 9);
    w.store.setTileSilent(11, 9, 0);   // 右列先被破坏（半件态）
    w.store.setTileSilent(10, 10, 0);
    g.checkFurnitureSupport(10, 9);
    expect(w.store.get(10, 9)).toBe(0);
  });

  it('放置侧锁：29/103/462 AnchorBottom=Table——泥土下不可放/桌下可放（TileObjectData.cs:2810-2823）', () => {
    const w = new World(40, 40, 7, 'sw-fx8-place-anchor');
    const st = w.store;
    ground2(w, 10, 10, DIRT);
    for (const sheet of [29, 103, 462]) {
      const rec = anchorSpecOf(sheet);
      expect(rec, `sheet ${sheet} anchorRec`).not.toBeNull();
      expect(rec!.anchorBottom?.t).toEqual(['Table']);
      const id = TILE_INTERNAL_BY_SHEET.get(sheet)!;
      // 泥土下：占位格空 → 校验走锚——Table 位 solidTopLike(泥土)=false → 拒
      expect(validateAnchors(st, 10, 9, rec!, 0)).toBe(false);
      // 桌下：真
      ground2(w, 10, 10, TABLE);
      expect(validateAnchors(st, 10, 9, rec!, 0)).toBe(true);
      st.setTileSilent(10, 9, id, 0, 0);
      st.setTileSilent(11, 9, id, 18, 0);
      st.setTileSilent(10, 9, 0); st.setTileSilent(11, 9, 0);   // 清占位格（下一 sheet 复用窗）
      st.setTileSilent(10, 10, 0); st.setTileSilent(11, 10, 0);
    }
  });
});
