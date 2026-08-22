// 多格放置物破坏返还（审计 docs/audit/item-audit-2026-08-22.md ⚠️1「多格破坏无返还
// 99 族 338 件」——本轮最大缺口）：
// 根因 = Game.breakTile 多格 object 分支 def.drop===null → 无掉落，而 1×1 路径有
// place_v_ 兜底 → 雕像/画/旗帜/地狱熔炉/提取器/水晶球/日晷/训练假人等挖掉即蒸发。
// 原版语义（标杆 ../Terarria1456）：这些族在 KillTile_GetItemDrops 共享 no-drop 表
// （WorldGen.cs:65803-66145，case 165/105/240-247/91/77/219/125/356/378/21/467/55…
//  → 共享 break 无赋值），掉落走 TileFrame 的 Check* 帧检分支——锚点 Item.NewItem
//  **一次**（非逐格）：
//   Check2xX   :38009（雕像 105 :38166-38172 StatueStyleToItem(frameX/36+…) /
//                     日晷 356 :38180-38182→3064 / 训练假人 378 :38297-38299→3202 /
//                     天塔柱 410 :38235-38238→3536+style / 月神像 663→5381）
//   Check2x2   :48405（水晶球 125 :48716-48719 / 水槽 172→GetItemDrop_Sinks
//                     :48849-48851 / 笼缸 360/505/521-527/543/568-570/580/620/652
//                     :48624-48656 / 巨石 132/138/664/665/711/712 经 TileFrame
//                     :86672-86680 派发）
//   Check3x2   :49190（地狱熔炉 77→2190 / 营火 215→GetCampfireItemDrop :64033 /
//                     精金·钛金熔炉 133 / 砧 86 / 山铜·秘银砧 134→Check2x1 :46804 组）
//   Check3x3   :53092（提取器 219→997 / 灌注台 243 / 染料缸 228 / 固体机 220）
//   CheckBanner :46103（旗帜 91 :46174-46204 逐 style 掉 5651/5672/5673…放置旗）
//   CheckChest  :57938（空箱 → GetItemDrop_Chests :58022→:58024 style 档）
//   CheckSign   :43593（告示牌 :43731-43754 逐 style 掉牌物品 + Sign.KillSign :43729）
// 非空容器不可拆：CheckTileBreakability2_ShouldTileSurvive :62515-62540（BasicChest
// {21,467}=TileID.cs:315 / 梳妆台 88=:319）→ Chest.DestroyChest false（Chest.cs:606-624
// 任一槽 id>0&&stack>0）→ KillTile :63899-63902 早退（无掉落无清格）。
// 本批做「按 tile 掉 place_v_ 物品」的基础返还（style→真物品还原=审计 ⚠️2 另批 21 族）；
// 兜底判据=存在真实原版放置物品（vanillaPlaceableTileKeys，vi_* tile 反查）——纯世界
// 生成装饰（165 冰凌/233 丛林大植物/529 海燕麦/530 绿洲植物/647-652 瓦砾/751·752 蜥蛋
// …27 族）原版无物品可还，维持无掉落（itemfunc+vanilla.json 双源 createTile 均无）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import {
  vanillaPlaceableTileKeys, CAGE_ITEM_SHEET,
} from '../src/data/items';
import { VI } from '../src/data/itemKeys';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import funcJson from '../src/data/vanilla-itemfunc.json';
import vanillaItemMeta from '../public/sprites/vanilla.json';
import { multiTileDropKey, chestDestroyableAt } from '../src/core/Game';
import { shouldTileSurviveAt } from '../src/entities/Mounts';

const placeable = vanillaPlaceableTileKeys();
const keyOf = (k: string) => TILE_BY_KEY[k]!;
const dropKeyOf = (k: string) => {
  const def = TILE_DEFS[keyOf(k)];
  expect(def, `tile def ${k} 应存在`).toBeDefined();
  return multiTileDropKey(def!, placeable);
};

// ============ A. 审计 ⚠️1 名录族：破坏返还 place_v_（基础返还） ============
describe('多格家具破坏返还 place_v_（审计 ⚠️1 名录族）', () => {
  it('雕像 105（51 件）——原版 Check2xX :38166 StatueStyleToItem', () => {
    const d = TILE_DEFS[keyOf('v_105_statue')]!;
    expect(d.w).toBe(2); expect(d.h).toBe(3);       // 多格 → object 分支
    expect(d.drop).toBeNull();                        // 机械重生成批的 null（根因）
    expect(dropKeyOf('v_105_statue')).toBe('place_v_105_statue');
  });

  it('画 240/242/245/246（107 件）——原版 Check2x2/Check3x2 帧检返还', () => {
    for (const k of ['v_240_wall_hangings_3x3', 'v_242_paintings_6x4', 'v_245_paintings_2x3', 'v_246_paintings_3x2']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });

  it('旗帜 91（33 件）——原版 CheckBanner :46174 逐 style 掉放置旗', () => {
    expect(dropKeyOf('v_91_banners')).toBe('place_v_91_banners');
  });

  it('功能站族：地狱熔炉 77/提取器 219/灌注台 243/染料缸 228/水晶球 125', () => {
    // 77→2190（Check3x2）/219→997、243、228（Check3x3 :53092）/125（Check2x2 :48716）
    for (const k of ['v_77_hellforge', 'v_219_extractinator', 'v_243_imbuing_station', 'v_228_dye_vat', 'v_125_crystal_ball']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });

  it('首轮 26 族同漏：日晷 356/训练假人 378/营火 215/大炮 209/天塔柱 410', () => {
    // 356→3064（Check2xX :38180）/378→3202（:38297）/215→GetCampfireItemDrop（:64033
    // includeLargeObjectDrops 段——常规破坏走 Check3x2）/410→3536+style（:38235）
    for (const k of ['v_356_enchanted_sundial', 'v_378_target_dummy', 'v_215_campfires', 'v_209_cannon', 'v_410_lunarmonolith']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });

  it('容器/桌/水槽/砧/碗/拉杆/引爆器/宝石锁/钓鱼箱/二类桌', () => {
    for (const k of ['v_467_chests_group_2', 'v_469_tables_group_2', 'v_172_sinks', 'v_133_forges', 'v_134_anvils_hardmode', 'v_103_bowls', 'v_132_lever', 'v_411_detonator', 'v_440_gemlocks', 'v_376_fishing_crates']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });

  it('巨石族（Check2x2 :86672 派发——132/138/664/665/711/712 有物品档）', () => {
    for (const k of ['v_138_boulder', 'v_664_bouncy_boulder', 'v_711_rainbow_boulder', 'v_712_poo_boulder', 'v_713_lava_boulder', 'v_714_spider_boulder', 'v_715_ghoulder']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });

  it('笼缸族（CAGE_ITEM_SHEET 92 条权威源——createTile 提取器解不开的 87 条）', () => {
    // 6×3 大笼 275 / 2×2 罐缸 316 / 2×2 蝶罐 288（TileObjectData Style6x3/Style2x2）
    for (const k of ['v_275_bunny_cage', 'v_316_blue_jellyfish_jar', 'v_288_monarch_butterfly_jar']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });

  it('告示牌 55/模特 legacy 128/女模特 legacy 269（CheckSign :43731/CheckMan :46539）', () => {
    for (const k of ['v_55_signs', 'v_128_mannequin_legacy', 'v_269_womannequin_legacy']) {
      expect(dropKeyOf(k)).toBe('place_' + k);
    }
  });
});

// ============ B. 无物品纯世界生成装饰：维持无掉落 ============
describe('无原版放置物品的装饰：维持无掉落（原版无物可还）', () => {
  it('冰凌 165/丛林大植物 233/海燕麦 529/绿洲植物 530', () => {
    // 529 原版单格写入（cs:58333 CheckSeaOat 无 Item.NewItem）——def 1×2 走多格分支
    for (const k of ['v_165_cave_decos', 'v_233_jungle_large_plants', 'v_529_sea_oats', 'v_530_oasis_plants']) {
      expect(dropKeyOf(k)).toBe('');
    }
  });

  it('瓦砾 648/649/651/652 + 蜥蛋 751/752', () => {
    for (const k of ['v_648_large_rubble_3x2_group_2', 'v_649_medium_rubble_2x1', 'v_651_large_rubble_3x2_group_3', 'v_652_medium_rubble_2x2', 'v_751_sleeping_digtoise', 'v_752_chillet_egg']) {
      expect(dropKeyOf(k)).toBe('');
    }
  });

  it('echo 变体/倒木/垃圾桶/legacy 武器架/开态门件（特例分支或特例拦截承担）', () => {
    // 488 倒木→mysticLogs 延迟旗分支；706→breakShrineSword（4144/989）；
    // 236/238→生命果/世花分支；386/389=开态（关闭态 387/388 才有物品）
    for (const k of ['v_694_stalactite_1x2_echo', 'v_702_life_fruit_replica', 'v_704_fallen_log_echo', 'v_705_oasis_plants_echo', 'v_706_terragrim_shrine_echo', 'v_488_fallen_log', 'v_99_trash_can', 'v_334_weapon_rack_legacy_do_not_use', 'v_386_trapdooropen', 'v_389_tallgateopen', 'v_165_cave_decos']) {
      expect(dropKeyOf(k)).toBe('');
    }
  });

  it('716 友好巨石无物品档（713-715 有）——逐 tile 判据非逐组', () => {
    expect(dropKeyOf('v_716_friendly_boulder')).toBe('');
  });
});

// ============ C. 真实 drop 值不回归 ============
describe('def.drop 有值的族：直掉原版物品不变', () => {
  it('宝箱 21→48 / 梳妆台 88→334（GetItemDrop_Chests/Dressers style0 档）', () => {
    expect(dropKeyOf('chest')).toBe(VI(48));
    expect(dropKeyOf('dresser')).toBe(VI(334));
  });
});

// ============ D. 系统性 oracle：279 个多格 drop:null def 全量对拍 ============
describe('系统性对拍：多格 drop:null 全量 def vs 原版 createTile 数据', () => {
  // 独立 oracle：itemfunc（提取器）∪ vanilla.json items.createTile（终态回退源）∪
  // CAGE_ITEM_SHEET（87 条提取器解不开的笼缸）→ sheet 是否有原版放置物品
  const vanillaSheets = new Set<number>();
  for (const f of Object.values(funcJson as Record<string, { createTile?: number }>)) {
    if (f.createTile != null && f.createTile !== -1) vanillaSheets.add(f.createTile);
  }
  for (const it of Object.values(vanillaItemMeta.items as unknown as Record<string, { createTile?: number }>)) {
    if (it.createTile != null) vanillaSheets.add(it.createTile);
  }
  for (const [, sheet] of CAGE_ITEM_SHEET) vanillaSheets.add(sheet);

  const multiDropNull = TILE_DEFS.filter((d): d is NonNullable<(typeof TILE_DEFS)[number]> =>
    !!d && d.key.startsWith('v_') && d.vanilla?.sheet !== undefined && d.drop === null
    && ((d.w ?? 1) > 1 || (d.h ?? 1) > 1));

  it('样本量健康（机械重生成批的多格 drop:null def 应有 250+）', () => {
    expect(multiDropNull.length).toBeGreaterThan(250);
  });

  it('全量：有原版物品 ↔ place_v_ 兜底；无 ↔ 无掉落（与 vanillaPlaceableTileKeys 一致）', () => {
    let withItem = 0, withoutItem = 0;
    for (const d of multiDropNull) {
      const has = vanillaSheets.has(d.vanilla!.sheet!);
      const expected = has ? 'place_' + d.key : '';
      expect(multiTileDropKey(d, placeable), `${d.key}(sheet ${d.vanilla!.sheet})`).toBe(expected);
      has ? withItem++ : withoutItem++;
    }
    expect(withItem).toBeGreaterThan(240);   // 审计 ⚠️1 主体（雕像/画/旗/功能站/笼缸…）
    expect(withoutItem).toBeGreaterThan(20); // 纯装饰 27 族
  });

  it('vanillaPlaceableTileKeys 覆盖 oracle 全集（vi_ tile 反查无漏）', () => {
    for (const d of multiDropNull) {
      if (vanillaSheets.has(d.vanilla!.sheet!)) {
        expect(placeable.has(d.key), d.key).toBe(true);
      }
    }
  });
});

// ============ E. 非空容器存活门（CheckTileBreakability2_ShouldTileSurvive） ============
// Game.breakTile 头部新门（原版 KillTile :63899-63902 位置，在 DropBait/DropItems 前）
describe('非空容器整件不可拆（宝箱 21/467 + 梳妆台 88）', () => {
  const CHEST = keyOf('chest');
  const CHEST2 = keyOf('v_467_chests_group_2');
  const DRESSER = keyOf('dresser');

  function mkWorld(): World {
    return new World(48, 48, 7, 'multi-tile-drop');
  }
  /** 2×2 箱帧布局（fw2 fh2：frameX=style*36+col*18 / frameY=row*18） */
  function placeChest(st: World['store'], type: number, ax: number, ay: number) {
    st.setTileSilent(ax, ay, type, 0, 0);
    st.setTileSilent(ax + 1, ay, type, 18, 0);
    st.setTileSilent(ax, ay + 1, type, 0, 18);
    st.setTileSilent(ax + 1, ay + 1, type, 18, 18);
  }
  /** 3×2 梳妆台（fw3：frameX=style*54+col*18） */
  function placeDresser(st: World['store'], ax: number, ay: number) {
    for (let c = 0; c < 3; c++) {
      st.setTileSilent(ax + c, ay, DRESSER, c * 18, 0);
      st.setTileSilent(ax + c, ay + 1, DRESSER, c * 18, 18);
    }
  }
  /** 与 Game.breakTile 头部同源的 ctx（world.chests 背书） */
  const ctxOf = (w: World) => ({
    hardMode: false,
    chestDestroyable: (cx: number, cy: number) => chestDestroyableAt(w.chests, cx, cy),
  });

  it('非空宝箱 21：任一格命中 → 存活（Chest.cs:606-624 DestroyChest false）', () => {
    const w = mkWorld();
    placeChest(w.store, CHEST, 12, 18);
    w.chests.push({ x: 12, y: 18, items: Array(10).fill(null) });
    w.chests[0].items[3] = { id: 1, stack: 5 };   // 任一非空槽
    for (const [hx, hy] of [[12, 18], [13, 18], [12, 19], [13, 19]] as const) {
      expect(shouldTileSurviveAt(w.store, hx, hy, ctxOf(w)), `命中(${hx},${hy})`).toBe(true);
    }
  });

  it('空宝箱 21：可拆（DestroyChest true → CheckChest :57938 掉箱物品）', () => {
    const w = mkWorld();
    placeChest(w.store, CHEST, 12, 18);
    w.chests.push({ x: 12, y: 18, items: Array(10).fill(null) });
    expect(shouldTileSurviveAt(w.store, 13, 19, ctxOf(w))).toBe(false);
  });

  it('非空/空 二类箱 467（BasicChest 同表 TileID.cs:315）', () => {
    const w = mkWorld();
    placeChest(w.store, CHEST2, 20, 18);
    w.chests.push({ x: 20, y: 18, items: [{ id: 9, stack: 1 }, null, null, null, null, null, null, null, null, null] });
    expect(shouldTileSurviveAt(w.store, 21, 18, ctxOf(w))).toBe(true);
    w.chests[0].items[0] = null;
    expect(shouldTileSurviveAt(w.store, 21, 18, ctxOf(w))).toBe(false);
  });

  it('梳妆台 88：3 宽锚点 %3 归一（右列格命中也归对锚）', () => {
    const w = mkWorld();
    placeDresser(w.store, 12, 18);
    w.chests.push({ x: 12, y: 18, items: Array(10).fill(null) });
    w.chests[0].items[0] = { id: 2, stack: 1 };
    // 右列中格 (14,19)：frameX=36 → (36/18)%3=2 → ax=14-2=12
    expect(shouldTileSurviveAt(w.store, 14, 19, ctxOf(w))).toBe(true);
    w.chests[0].items[0] = null;
    expect(shouldTileSurviveAt(w.store, 14, 19, ctxOf(w))).toBe(false);
  });

  it('chestDestroyableAt 判据 = Chest.CanDestroyChest（Chest.cs:590-606）：id>0 且 stack>0', () => {
    const chests = [{ x: 5, y: 5, items: [{ id: 0, stack: 9 }, { id: 3, stack: 0 }, null, null, null, null, null, null, null, null] }];
    expect(chestDestroyableAt(chests, 5, 5)).toBe(true);    // id=0 / stack=0 都不算有物
    chests[0].items[1]!.stack = 1;
    expect(chestDestroyableAt(chests, 5, 5)).toBe(false);
    expect(chestDestroyableAt(chests, 6, 6)).toBe(true);    // 无登记 = 可毁（:594-597）
  });

  it('模特 470 不被 chest 表门误拦（TE 侧门在 FURNITURE_TILE_KIND blocked 分支）', () => {
    const w = mkWorld();
    const MAN = keyOf('v_470_mannequins');
    w.store.setTileSilent(20, 18, MAN, 0, 0);
    w.store.setTileSilent(21, 18, MAN, 18, 0);
    w.store.setTileSilent(20, 19, MAN, 0, 18);
    w.store.setTileSilent(20, 20, MAN, 0, 36);
    w.store.setTileSilent(21, 19, MAN, 18, 18);
    w.store.setTileSilent(21, 20, MAN, 18, 36);
    expect(shouldTileSurviveAt(w.store, 20, 19, ctxOf(w))).toBe(false);
  });

  it('普通块不受门影响（土块恒可拆）', () => {
    const w = mkWorld();
    w.store.setTile(10, 10, 1);
    expect(shouldTileSurviveAt(w.store, 10, 10, ctxOf(w))).toBe(false);
  });
});

// ============ F. 锚点单次掉落 / 两路径不重叠 ============
describe('锚点单次掉落与 1×1 路径隔离', () => {
  it('掉落键只依赖 def（与命中格无关）——整件一个掉落键,锚点 spawn 一次', () => {
    // object 分支的掉落在锚点 (ax,ay) 一次 spawnDrop（Game.ts object 分支尾段），
    // 清格循环走 st.setTile（无掉落路径）——同物任一格命中解析出同一 key
    const d = TILE_DEFS[keyOf('v_105_statue')]!;
    const k1 = multiTileDropKey(d, placeable);
    const k2 = multiTileDropKey(d, placeable);
    expect(k1).toBe(k2);
    expect(k1).toBe('place_v_105_statue');
  });

  it('两路径不重叠：1×1 def 恒不满足多格分支门（w>1||h>1）', () => {
    // 防双掉结构断言：1×1（蘑菇 3/火把 4/蛛网 51/瓶 13）走 1×1 路径的 place_ 兜底，
    // 多格（箱 21/雕像 105/画 240）走 object 分支——互斥
    for (const k of ['mushroom', 'torch', 'v_51_cobweb', 'v_13_placed_bottles']) {
      const d = TILE_DEFS[keyOf(k)];
      if (!d) continue;
      expect((d.w ?? 1) > 1 || (d.h ?? 1) > 1, k).toBe(false);
    }
    for (const k of ['chest', 'v_105_statue', 'v_240_wall_hangings_3x3', 'dresser']) {
      const d = TILE_DEFS[keyOf(k)]!;
      expect((d.w ?? 1) > 1 || (d.h ?? 1) > 1, k).toBe(true);
    }
  });

  it('海燕麦 529（def 1×2 走多格分支）解析为无掉落——与 sea-oats-anchor 清格护栏不冲突', () => {
    // 既有护栏：锚点盒清格带同类型门（沙保留）；本批只改掉落解析（'' = 无掉落），
    // 清格循环未动
    const d = TILE_DEFS[keyOf('v_529_sea_oats')]!;
    expect(d.w).toBe(1); expect(d.h).toBe(2);
    expect(multiTileDropKey(d, placeable)).toBe('');
  });
});
