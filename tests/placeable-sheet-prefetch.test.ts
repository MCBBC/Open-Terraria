// 合成/入包 → 可放置 sheet 预取测试（2026-08-21 用户报"合成工作台后放置:
// 放置音效即响、贴图过一会才显示"——放置物 tile sheet 此前只在出生点扫描/
// 烘焙懒取时拉取,合成产出时未预热,首放烘焙 miss → fallback 烤进 chunk →
// 表晚到 500ms 去抖重烘 = 白窗）。
// 链路:placeableSheetsForItems（items.ts 纯解析）→ Game.prefetchPlaceableSheets
// （文件级在飞去重）→ atlas.preloadFiles（统一底层:已载早退 + onload→
// onVImageLoaded→ChunkCache 精确重烘）。触发点 = vanillaCraft 合成直调 +
// mainFlow onInventoryChanged 入包全扫（拾取/宝箱/商店同覆盖）。
// node 无 DOM:本测断言【解析正确性 + atlas 数据可落地性】（sheet 文件在
// vanilla.json 有登记 = 预取必发请求且放置烘焙必命中）;晚到重烘兜底链已有专测
// （chunk-cache-precise-invalidate.test.ts）。
import { describe, it, expect } from 'vitest';
import { placeableSheetsForItems, ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import vanillaJson from '../public/sprites/vanilla.json';

interface SheetMeta { sheet: string }
const vTiles = (vanillaJson as unknown as { tiles: Record<string, SheetMeta> }).tiles;
const vWalls = (vanillaJson as unknown as { walls: Record<string, SheetMeta> }).walls;

const idOf = (key: string): number => ITEM_DEFS.findIndex((d) => d && d.key === key);

describe('可放置 sheet 预取解析（placeableSheetsForItems）', () => {
  it('工作台成品 vi_36 解析出 sheet 18（TileID.WorkBenches）,atlas 已登记该表', () => {
    const id = idOf('vi_36_work_bench');
    expect(id).toBeGreaterThanOrEqual(0);
    // createTile 回填链必须已把 tile 落到 def（tryPlace 同源字段）
    expect(ITEM_DEFS[id].tile).toBe('workbench');
    const { tileSheets, wallIds } = placeableSheetsForItems([id]);
    expect(wallIds.size).toBe(0);
    expect(tileSheets.has(18)).toBe(true);
    expect(vTiles['18']?.sheet).toBe('vanilla/Tiles_18.png');
  });

  it('非放置物品/非法 id → 双空集（不发生任何请求）', () => {
    const { tileSheets, wallIds } = placeableSheetsForItems([idOf('vi_3509_copper_pickaxe'), -1, 999999]);
    expect(tileSheets.size).toBe(0);
    expect(wallIds.size).toBe(0);
  });

  it('墙物品（wallId）解析进 wallIds,atlas 已登记对应 Wall_ 表', () => {
    const wi = ITEM_DEFS.findIndex((d) => d && d.wallId !== undefined);
    expect(wi).toBeGreaterThanOrEqual(0);
    const { tileSheets, wallIds } = placeableSheetsForItems([wi]);
    expect(wallIds.size).toBe(1);
    expect(tileSheets.size).toBe(0);
    expect(vWalls[String([...wallIds][0])]?.sheet).toMatch(/^vanilla\/Wall_\d+\.png$/);
  });

  it('全量通用:每件 def.tile 物品都解析到 atlas 已登记的表（放置零死角）', () => {
    let resolved = 0;
    let deadEnds = 0;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const def = ITEM_DEFS[i];
      if (!def?.tile) continue;
      const tid = TILE_BY_KEY[def.tile];
      const vs = tid !== undefined ? TILE_DEFS[tid]?.vanilla?.sheet : undefined;
      if (vs === undefined) { deadEnds++; continue; }   // 解析死角 = 预取接不到该物品
      resolved++;
      expect(vTiles[String(vs)], `sheet ${vs}（item ${def.key} → tile ${def.tile}）缺 atlas 登记`).toBeDefined();
    }
    expect(resolved).toBeGreaterThan(500);   // createTile 回填 1040 条 → 解析面须成规模
    expect(deadEnds).toBe(0);                // 有死角即本预取对该物品失效（须补数据/解析）
  });

  it('全量通用:每件 wallId 物品都解析到 atlas 已登记的墙表', () => {
    let resolved = 0;
    for (const def of ITEM_DEFS) {
      if (!def?.wallId) continue;
      resolved++;
      expect(vWalls[String(def.wallId)], `wall ${def.wallId}（item ${def.key}）缺 atlas 登记`).toBeDefined();
    }
    expect(resolved).toBeGreaterThan(100);   // vanilla-wallitems 292 条
  });
});
