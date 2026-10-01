// ★tile id 双域纪律哨兵网（2026-09-18;BJ154 金属探测器定谳 + 全仓普查第三案扩网）==
// 背景:tile 双域并存——internal=TILE_DEFS 注册序(运行时域,st.type[])vs sheet=原版
//   TileID(TILE_DEFS[].vanilla.sheet,≈stable 存档域)。★与物品域(BJ150/BJ152)的本质
//   差异:两域数值高度重叠——761 个有 sheet 的内部 id 中 752 个与某 sheet 撞号(本测
//   §1 普查钉死),错域查询几乎必【命中错项】而非落空:
//     · BJ154(2026-09-18):金属探测器优先级表 sheet 键被内部 id 直查——叶绿矿
//       (sheet211=内部40)永不可探测,火把(内部12)撞 sheet12 生命水晶幻影报矿;
//     · BJ154-T(2026-09-18,本网新钉):SceneMetrics 影烛计数 `counts.get(646)` 以
//       sheet 646 裸查内部域 counts——646 恰是 v_619_truffle_worm_cage 的【内部
//       id】,真影烛(sheet646=内部665)永不计数、虫笼幻影计数 → 骷髅商 453 出门
//       被虫笼封死/真影烛压蠕虫+商人门失效(VanillaSpawner:1197/3634 经
//       Game:33399 消费;原版权威=SceneMetrics.cs:393-395 `type==646&&frameX<18`);
//     · 史前案:2026-08-13 TILE_NO_FAIL 换算错误→58 种方块一击秒挖(Game.ts:20344 注);
//     · 2026-08-25 蚁狮案:裸写原版 53 沙直写 store=写进 53 号注册位(已修,antlion-sand
//       memory)。本网=四案正确性的钉死层。
// ★普查定谳(2026-09-18,三路并行逐表核读 ~90 表):除上述 BJ154-T 外全仓零活错域——
//   sheet 键表消费面三类习语:①构建期平移(internalIdsOfVanSheets/SHEET_MAP/ids());
//   ②消费点包裹(doorSmashable/grassParticleFold/sheetAt/sheetOf/vanSheet);③init 期
//   LUT 展开(TileLightScanner sheetById/WindSway SWAY_REC)。grep 臂=tools/
//   id-domain-guard.mjs IDG-T1..T3(平移链锚/裸 sheet 表漏出/命名域纪律)。
// ★变异证红记录(2026-09-18,均在验证后还原):
//   M1 SceneMetrics 扫描环 ORE_FINDER_PRIORITY[t] 换回 sheet 直查 → §3 全红+
//      tests/metal-detector-priority.test.ts 同红;
//   M2 shadowCandleLit 累加换回 counts.get(646) 裸查 → §4 两红;
//   M3 影烛帧门 `frameX<18` 摘除 → §4 灭档红;
//   M4 Game.ts 新增 `const FOO_SHEETS = internalIdsOfVanSheets([1])` → IDG-T3 红;
//   M5 SceneMetrics.ts 删 SHADOW_CANDLE 行 → IDG-T1 红;
//   M6 TileParticles.ts 代码面引用 ORE_FINDER_PRIORITY_SHEET → IDG-T2 红。
// ★BJ158 批变异证红记录(2026-09-18,均在验证后还原):
//   M7 FORBIDS_SLOPING_IDS 错域回退(new Set(SHEETS) 裸值顶替) → §6 镜像+域判别两红
//      (宝箱消费案仍绿=CanKillTile 上支族双闸兜住;纯单闸牙口=假箱 441 案,见 §6);
//   M8 FORBIDS_SLOPING_SHEETS 漏 597 → §6 金标+镜像两红;
//   M9 TILE_AXE_SHEETS 漏 5(树) → §6b 金标红+tests/smart-select.test.ts 树→AXE 红;
//   M10 CanCutTile.ts 再立本地 TILE_AXE_SHEETS 副本 → IDG-T2 红(结构锁=无副本可立);
//   M11 TILE_CUT_SHEETS 漏 444 → §6c 金标红;
//   M12 iii224 零扰动旧单臂断言复刻 8 跑 4 红(50/50) → 钉种后 6 跑全绿(tests/
//      iii224-fourflags-runtime.test.ts,Music.ts:404 dayMusic 掷币槽)。
// ★BJ168-债2 批变异证红记录(2026-09-19,均在验证后还原):
//   M13 BOULDERS_SHEETS 漏 484 → §6d 金标+镜像两红;
//   M14 IS_A_TREE_TRUNK_SHEETS 漏 72 → §6d 金标红;
//   M15 FinalCleanupPass 再立 const TILE_CUT_FC 副本 → §6e 结构锁红(无副本可立);
//   M16 BOULDERS_IDS 错域回退(new Set(BOULDERS_SHEETS) 裸值顶替) → §6d 镜像+
//      域判别两红(内部 138 幻影入表即红)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// @ts-expect-error - tools/id-domain-guard.mjs 无声明文件(工具域 .mjs;id-domain-guard.test.ts 同款)
import { auditIdDomains, findNameBounded } from '../tools/id-domain-guard.mjs';
import { World } from '../src/world/World';
import { scanScene, ORE_FINDER_PRIORITY_SHEET } from '../src/world/SceneMetrics';
import {
  TILE_BY_KEY, TILE_DEFS, VANILLA_TILE_ID, TILE_INTERNAL_BY_SHEET,
  TILE_STABLE_OF_INTERNAL, TILE_INTERNAL_OF_STABLE, TILE_CUT_SHEETS,
  TILE_TABLE_SHEETS, doorSmashable, T,
  FORBIDS_SLOPING_SHEETS, FORBIDS_SLOPING_IDS, TILE_AXE_SHEETS, TILE_HAMMER_SHEETS,
  IS_A_TREE_TRUNK_SHEETS, BOULDERS_SHEETS, BOULDERS_IDS, PLATFORMS_SHEETS,
  PLATFORMS_IDS, IS_A_TREE_TRUNK_IDS,
  ORE_SHEETS, NOT_REALLY_SOLID_SHEETS, IS_BEAM_SHEETS, IS_A_DRIP_TILE_SHEETS,
  IS_A_CONTAINER_SHEETS,
  CLOUDS_SHEETS, CLOUDS_IDS, CRACKED_BRICKS_SHEETS, CRACKED_BRICKS_IDS,
  CONV_GRASS_SHEETS, CONV_JUNGLE_GRASS_SHEETS, CONV_GOLF_GRASS_SHEETS,
  CONV_SNOW_SHEETS, CONV_STONE_SHEETS, CONV_ICE_SHEETS, CONV_SAND_SHEETS,
  CONV_HARDENED_SAND_SHEETS, CONV_SANDSTONE_SHEETS, CONV_THORN_SHEETS,
  MOSS_SHEETS, TILE_MOSS_SHEETS, MOSS_BRICK_SHEETS, TILE_MOSS_BRICK_SHEETS,
  CONV_SAND_IDS, CONV_HARDENED_SAND_IDS, CONV_SANDSTONE_IDS,
  PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS, FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS,
  COMMON_SAPLING_SHEETS, COMMON_SAPLING_IDS, GETS_DESTROYED_FOR_METEORS_SHEETS,
  IS_SHAKEABLE_SHEETS, GETS_CHECKED_FOR_LEAVES_SHEETS, PREVENTS_TILE_REPLACE_IF_ON_TOP_SHEETS,
  ICES_SNOW_SHEETS, ICES_SNOW_IDS, IS_VINE_SHEETS, VINE_THREADS_SHEETS,
  SWAYS_IN_WIND_BASIC_SHEETS, FALLING_SHEETS, BASIC_CHEST_SHEETS,
  CONV_CORRUPT_SHEETS, CONV_CRIMSON_SHEETS, CONV_HALLOW_SHEETS,
  SPREADS_CORRUPTION_SHEETS, SPREADS_CRIMSON_SHEETS, SPREADS_HALLOW_SHEETS,
  CORRUPT_BIOME_SIGHT_SHEETS, CRIMSON_BIOME_SIGHT_SHEETS, HALLOW_BIOME_SIGHT_SHEETS,
  CORRUPT_COUNT_COLLECTION_SHEETS, CRIMSON_COUNT_COLLECTION_SHEETS, HALLOW_COUNT_COLLECTION_SHEETS,
  ASH_GROUND_SHEETS, ASH_GROUND_IDS, DOESNT_PLACE_WITH_TILE_REPLACEMENT_SHEETS,
  RESETS_HALF_BRICK_PLACEMENT_ATTEMPT_SHEETS, MUSHROOM_GRASS_SHEETS, MUSHROOM_GRASS_IDS,
  ORE_MERGES_WITH_MUD_SHEETS, SUFFOCATE_SHEETS, TOUCH_HOT_SHEETS, TOUCH_BLEEDING_SHEETS,
  TOUCH_DESTROY_SHEETS, DUNGEON_UNION_CRACKED_SHEETS, DUNGEON_UNION_CRACKED_IDS,
  TILE_DUNGEON_SHEETS,
  CHECKS_FOR_MERGE_SHEETS, FORCED_DIRT_MERGING_SHEETS, MERGES_WITH_CLOUDS_SHEETS,
  DONT_MERGE_WITH_SNOW_SHEETS, SETS_DIRT_SHEETS, SETS_MUD_SHEETS, SETS_ASH_SHEETS,
  GRASS_SPECIAL_SHEETS, LAVA_BURN_TO_DIRT_SHEETS, JUNGLE_SPECIAL_SHEETS, HELL_SPECIAL_SHEETS,
  HAS_SLOPE_FRAMES_SHEETS, BLOCKS_STAIRS_SHEETS, DONT_DRAW_TILE_SLOPES_SHEETS,
  IGNORES_NEARBY_HALFBRICKS_SHEETS, ALL_BLOCKS_WITH_SMOOTH_BORDERS_SHEETS,
  NON_SOLID_SAVE_SLOPES_SHEETS, NON_SOLID_SAVE_SLOPES_IDS,
  SLOWLY_DIES_IN_WATER_SHEETS, SLOWLY_DIES_IN_WATER_IDS, SPAWNS_NATURE_FLIES_SHEETS,
  GENERAL_PLACEMENT_TILES_SHEETS, GENERAL_PLACEMENT_TILES_IDS,
  SPREAD_OVERGROUND_SHEETS, SPREAD_UNDERGROUND_SHEETS, CAN_GROW_CRYSTAL_SHARDS_SHEETS,
  PAINTINGS_SHEETS, PAINTINGS_IDS, PREVENTS_SLOPES_DURING_GENERATION_SHEETS,
  PREVENTS_SLOPES_DURING_GENERATION_IDS, AVOIDED_BY_NPCS_SHEETS, INTERACTABLE_BY_NPCS_SHEETS,
  IGNORED_BY_NPC_STEP_UP_SHEETS, CAN_BE_SAT_ON_FOR_PLAYERS_SHEETS, HOUSING_WALLS_SHEETS,
  IGNORED_IN_HOUSE_SCORE_SHEETS, IS_A_MECHANISM_SHEETS, IS_A_MECHANISM_IDS,
  IS_A_TRIGGER_SHEETS, IS_A_TRIGGER_IDS, IGNORE_WHEN_VALIDATING_TRAPS_SHEETS,
  IGNORE_WHEN_VALIDATING_TRAPS_IDS, ALLOW_LIGHT_IN_WATER_SHEETS, BASIC_CHEST_FAKE_SHEETS,
  BASIC_DRESSER_SHEETS, CAMPFIRES_SHEETS, COUNTS_AS_WATER_FOR_CRAFTING_SHEETS,
  DISABLE_SMART_INTERACT_SHEETS, HAS_OUTLINES_SHEETS, TORCHES_SHEETS,
  DOESNT_GET_REPLACED_WITH_TILE_REPLACEMENT_SHEETS, REPLACE_TILE_BREAK_UP_SHEETS,
  REPLACE_TILE_BREAK_DOWN_SHEETS, LIVING_FIRE_SHEETS,
  IGNORES_TILE_REPLACEMENT_DROP_CHECK_WHEN_BEING_PLACED_SHEETS,
  DOES_NOT_OPEN_CRAFTING_MENU_ON_INTERACT_SHEETS, PREVENTS_ACTUATION_UNDER_SHEETS,
  NOT_CLEARABLE_SHEETS, NOT_CLEARABLE_IDS,
} from '../src/data/tiles';
import { NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';
import { DOES_NOT_OPEN_CRAFTING_MENU } from '../src/ui/craftingGrid';
import { PREVENTS_ACTUATION_UNDER } from '../src/world/Wiring';
import { canPoundTile } from '../src/world/gen/vanilla/HalfBrickPass';
import { TILE_CUT } from '../src/core/Game';
import { grassParticleFold, GRASS_COUNTER_SHEETS } from '../src/core/Game';
import { SITTABLE_SHEETS } from '../src/player/PlayerSitting';
import { NPC_STEPUP_IGNORE } from '../src/physics/TileCollision';
import { TILE_HAS_OUTLINES } from '../src/render/TileHighlight';
import { CAMPFIRE_TILES, COUNTS_AS_WATER_FOR_CRAFTING, DISABLE_SMART_INTERACT } from '../src/core/SmartInteractTiles';

// ---- 掩蔽对字面量(键注册表推导+钉死;与两域数值重叠普查同源) ----
const TORCH = TILE_BY_KEY['torch']!;                          // 内部 12(sheet 4)
const HEART = TILE_BY_KEY['crystal_heart']!;                  // sheet 12(生命水晶)
const CHLORO = TILE_BY_KEY['ore_chlorophyte']!;               // sheet 211(内部 40)
const SAND = TILE_BY_KEY['sand']!;                            // 内部 22(sheet 53)
const DEMONITE = TILE_BY_KEY['ore_demonite']!;                // sheet 22(魔矿)
const COPPER = TILE_BY_KEY['ore_copper']!;                    // 内部 4(sheet 7)
const TREE = TILE_BY_KEY['tree']!;                            // 内部 8(sheet 5)
const GOLD = TILE_BY_KEY['ore_gold']!;                        // sheet 8(金矿)
const SHADOW_CANDLE = TILE_BY_KEY['v_646_shadow_candle']!;    // sheet 646(内部 665)
const WORM_CAGE = TILE_BY_KEY['v_619_truffle_worm_cage']!;    // 内部 646(sheet 619)

describe('§1 掩蔽对与全域普查(反自回环根基)', () => {
  it('掩蔽对字面量钉死(注册序漂移须有意识重钉,见 BJ152 方案 A 注记同案)', () => {
    expect(TORCH).toBe(12);                                   // 内部 12 ≠ sheet 4
    expect(TILE_DEFS[TORCH].vanilla?.sheet).toBe(4);
    expect(HEART).not.toBe(12);                               // 内部 12 幻影撞 sheet 12
    expect(TILE_DEFS[HEART].vanilla?.sheet).toBe(12);
    expect(CHLORO).toBe(40);                                  // BJ154 叶绿矿:内部 40 ≠ sheet 211
    expect(TILE_DEFS[CHLORO].vanilla?.sheet).toBe(211);
    expect(SAND).toBe(22);                                    // 内部 22 撞 sheet 22(魔矿)
    expect(TILE_DEFS[DEMONITE].vanilla?.sheet).toBe(22);
    expect(COPPER).toBe(4);                                   // 内部 4 撞 sheet 4(火把)
    expect(TREE).toBe(8);                                     // 内部 8 撞 sheet 8(金矿)
    // BJ154-T 本案对:影烛 sheet 646 vs 虫笼内部 646(两域错位直查=幻影同格)
    expect(TILE_DEFS[SHADOW_CANDLE].vanilla?.sheet).toBe(646);
    expect(WORM_CAGE).toBe(646);
    expect(SHADOW_CANDLE).not.toBe(WORM_CAGE);
  });
  it('全域普查:两域数值高度重叠(错域=命中错项,非保守落空)——752/761 撞号率钉死', () => {
    const sheetSet = new Set<number>();
    let withSheet = 0;
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const s = TILE_DEFS[i]?.vanilla?.sheet;
      if (s === undefined) continue;
      withSheet++;
      sheetSet.add(s);
    }
    let collide = 0;
    for (let i = 1; i < TILE_DEFS.length; i++) {
      const s = TILE_DEFS[i]?.vanilla?.sheet;
      if (s !== undefined && sheetSet.has(i)) collide++;
    }
    expect(withSheet).toBeGreaterThan(700);                   // 普查非空洞
    expect(collide).toBeGreaterThan(700);                     // 重叠率 >90%:tile 域错域=危险失效
    expect(collide).toBeLessThan(withSheet);                  // 非恒等域
  });
});

describe('§2 桥不变量(sheet↔internal↔stable 三表同源一致性)', () => {
  it('VANILLA_TILE_ID ≡ TILE_INTERNAL_BY_SHEET(双读向桥首胜归一恒等;0 泥土域差钉死)', () => {
    // VANILLA_TILE_ID 域=sheet>0(tiles.ts:997 显式 v>0 门——0 与「无 tile」比较语义
    // 撞车,弹域落档/击碎清单按 undefined 落空);TILE_INTERNAL_BY_SHEET 含 0(泥土放置
    // 回填 DirtBallProj TILE_INTERNAL_BY_SHEET.get(0))。差集恰={0}。
    expect(TILE_INTERNAL_BY_SHEET.size - VANILLA_TILE_ID.size).toBe(1);
    expect(TILE_INTERNAL_BY_SHEET.has(0)).toBe(true);
    expect(VANILLA_TILE_ID.has(0)).toBe(false);
    for (const [sheet, internal] of VANILLA_TILE_ID) {
      expect(TILE_INTERNAL_BY_SHEET.get(sheet)).toBe(internal);
    }
  });
  it('桥终点自洽:每 sheet → 内部 id 的 vanilla.sheet 还原该 sheet;真身 stable≡sheet', () => {
    let checked = 0;
    for (const [sheet, internal] of VANILLA_TILE_ID) {
      expect(TILE_DEFS[internal]?.vanilla?.sheet).toBe(sheet);   // 桥落点 def 域自洽
      if (TILE_STABLE_OF_INTERNAL[internal] === sheet) {         // 真身 def(非 PRIV/借用身)
        expect(TILE_INTERNAL_OF_STABLE[sheet]).toBe(internal);   // 读向规范化恒等
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(650);                       // BJ152 收口6 同口径(732 真身)
  });
  it('读向规范化:TILE_INTERNAL_OF_STABLE[sheet] 的写向还原=规范化恒等(389 别名域)', () => {
    for (let s = 1; s <= 752; s++) {
      const i = TILE_INTERNAL_OF_STABLE[s];
      if (i === 0) continue;                                    // 缺口=退役/并 def 身(21 sheet)
      // 389 别名(tiles.ts:1036):旧存档开门态 stable 389→落 1027 真身 def,
      // 其写向还原=1027 非 389——规范化恒等的文档化唯一例外(BJ152 收口6 同钉)
      expect(TILE_STABLE_OF_INTERNAL[TILE_INTERNAL_OF_STABLE[s]]).toBe(s === 389 ? 1027 : s);
    }
  });
});

describe('§3 金属探测器链(BJ154 修法钉死:构建期平移+输出回译)', () => {
  it('全表平移性质:36 条 sheet 键全部平移且优先级逐值保持(单键漂移即红)', () => {
    const entries = Object.entries(ORE_FINDER_PRIORITY_SHEET);
    expect(entries.length).toBe(36);
    for (const [sheet] of entries) {
      const internal = VANILLA_TILE_ID.get(Number(sheet));
      expect(internal).toBeGreaterThanOrEqual(0);               // 全部已注册(0 跳过,2026-09-18 实测)
      // 平移链消费点 = SceneMetrics 扫描环 ORE_FINDER_PRIORITY[internal]——
      // 行为面等价验证:同一 tile 摆进窗内必被探测且报 sheet 恒等。
      // frameX=340:有效性门唯一公共域(227 限 272≤fx≤374、129 限 fx≥324,
      // cs:904-918——否则门内键 129/227 会被帧门拒报 -1)
      const w = new World(400, 400, 42, 'sentinel');
      w.groundLevel = 120; w.rockLevel = 200;
      w.store.setTileSilent(200, 100, internal!, 340, 0);
      expect(scanScene(w, 200 * 16, 100 * 16, 0).bestOreSheet).toBe(Number(sheet));
    }
  });
  it('火把掩蔽负空间:只有火把在窗内 → 无珍宝 -1(内部 12 不得撞 sheet 12 生命水晶 550)', () => {
    const w = new World(400, 400, 42, 'sentinel');
    w.groundLevel = 120; w.rockLevel = 200;
    w.store.setTileSilent(200, 100, TORCH, 0, 0);
    expect(scanScene(w, 200 * 16, 100 * 16, 0).bestOreSheet).toBe(-1);
  });
  it('生命水晶(sheet 12)照常可探 550:平移不是把 sheet12 从表里抹掉', () => {
    const w = new World(400, 400, 42, 'sentinel');
    w.groundLevel = 120; w.rockLevel = 200;
    w.store.setTileSilent(200, 100, HEART, 0, 0);
    expect(scanScene(w, 200 * 16, 100 * 16, 0).bestOreSheet).toBe(12);
  });
  it('输出回译:bestOreSheet 恒为 sheet 域(对全部 36 键,内部 id 勿外泄)', () => {
    for (const sheet of Object.keys(ORE_FINDER_PRIORITY_SHEET)) {
      const s = Number(sheet);
      const internal = VANILLA_TILE_ID.get(s)!;
      // 回译恒等:内部 id 的 vanilla.sheet === 原始 sheet(输出面域自洽)
      expect(TILE_DEFS[internal]?.vanilla?.sheet).toBe(s);
    }
  });
});

describe('§4 影烛计数(BJ154-T 本案修法钉死:内部域+帧门)', () => {
  const mk = () => {
    const w = new World(400, 400, 42, 'sentinel');
    w.groundLevel = 120; w.rockLevel = 200;
    return w;
  };
  it('★实害面:亮档影烛(frameX<18)在窗内 → zoneShadowCandle=true', () => {
    const w = mk();
    w.store.setTileSilent(200, 100, SHADOW_CANDLE, 0, 0);       // frameX 0=亮档
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneShadowCandle).toBe(true);
  });
  it('★幻影面:虫笼(truffle worm cage,内部恰 646)在窗内 → zoneShadowCandle=false', () => {
    const w = mk();
    w.store.setTileSilent(200, 100, WORM_CAGE, 0, 0);
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneShadowCandle).toBe(false);
  });
  it('帧门 1:1(cs:393-395 frameX<18):灭档影烛(frameX=18)不计', () => {
    const w = mk();
    w.store.setTileSilent(200, 100, SHADOW_CANDLE, 18, 0);      // frameX 18=灭档
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneShadowCandle).toBe(false);
  });
  it('空窗 → false;真影烛与虫笼并存 → true 只由影烛驱动', () => {
    const w = mk();
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneShadowCandle).toBe(false);
    w.store.setTileSilent(198, 100, WORM_CAGE, 0, 0);
    w.store.setTileSilent(202, 100, SHADOW_CANDLE, 0, 0);
    expect(scanScene(w, 200 * 16, 100 * 16, 0).zoneShadowCandle).toBe(true);
  });
});

describe('§5 包裹函数域契约(消费点平移习语的性质钉死)', () => {
  it('doorSmashable(internal) 恒与 sheet 域原表对拍(TILE_CUT_SHEETS∪DOOR_SMASH)', () => {
    // 全 def 对拍:doorSmashable 以内部 id 入参,命中集≡其 sheet ∈ 两 sheet 表并集
    const doorSmashSheets = new Set([165, 373, 374, 375, 461, 709]);
    let hits = 0;
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sh = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
      const expectHit = TILE_CUT_SHEETS.has(sh) || doorSmashSheets.has(sh);
      expect(doorSmashable(i)).toBe(expectHit);
      if (expectHit) hits++;
    }
    expect(hits).toBeGreaterThan(30);                           // 非空洞(41 cut + 6 door smash)
  });
  it('grassParticleFold(sheet) 域契约:sheet 域锚值(3 草域/592 已折/184 苔/27 多格草)', () => {
    expect(GRASS_COUNTER_SHEETS.has(3)).toBe(true);             // WindyGrass 域 sheet 锚
    expect(grassParticleFold(3, true)).toBe(0.25);              // 折算档
    expect(grassParticleFold(3, false)).toBe(1);                // Windy 域随设置回落
    expect(grassParticleFold(592, true)).toBe(1);               // FOLD_SKIP:prob 已含结构折
    expect(grassParticleFold(184, true)).toBe(0.25);            // DirectionalGrass
    expect(grassParticleFold(27, true)).toBe(0.25);             // MultiTileGrass(向日葵)
    expect(grassParticleFold(34, true)).toBe(0.25);             // MultiTileVine
    expect(grassParticleFold(1, true)).toBe(1);                 // 石块非草域=不折
  });
  it('TILE_CUT(内部键)≡TILE_CUT_SHEETS(sheet 键)双向对拍(构建期平移无漏无多)', () => {
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sh = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
      expect(TILE_CUT.has(i)).toBe(TILE_CUT_SHEETS.has(sh));
    }
    expect(TILE_CUT.size).toBeGreaterThan(30);
  });
  it('TILE_TABLE_SHEETS(sheet 键)消费域锚:桌面族真身 sheet 全在表内', () => {
    for (const s of [14, 18, 19, 87, 88, 101, 114]) expect(TILE_TABLE_SHEETS.has(s)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(0)).toBe(false);
  });
});

describe('§6 ForbidsSloping 双域单源（★BJ158①:六副本两名双域收编 data/tiles.ts）', () => {
  // 2026-09-18 定谳:同一语义集合（WorldGen.cs:82022-82039 switch 13 型）此前六本账——
  //   sheet 裸值副本×4（Game.canPoundTile 局部集/TrackPass.FORBIDS_SLOPING_SHEETS/
  //   FinalCleanupPass.FORBIDS_SLOPING/TemplePass.FORBIDS_SLOPING）+ 内部 id 副本×2
  //   （HalfBrickPass.idsByVanillaSheet/Mounts.idsWithSheets）。四消费点键域亲读:
  //   Game aboveSheet=sheet/TrackPass sh=SHEET_OF[type]=sheet/HalfBrickPass st.type[up]
  //   =internal/Mounts st.type[up]=internal——各处与其副本域相配,无活错域;本节钉死
  //   单源后的双域契约（sheet 域消费面 Game/TrackPass/FinalCleanup/TemplePass 行为
  //   回归由 worldgen 金标族承载;internal 域消费面见本案 canPoundTile+mounts.test.ts）。
  it('sheet 域金标:FORBIDS_SLOPING_SHEETS ≡ WorldGen.cs:82022-82039 switch 全 13 型(逐值钉死)', () => {
    expect([...FORBIDS_SLOPING_SHEETS].sort((a, b) => a - b)).toEqual(
      [21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597]);
  });
  it('内部域镜像:FORBIDS_SLOPING_IDS 全表平移无漏无多(旧 idsByVanillaSheet/idsWithSheets 两习语逐值全等)', () => {
    // 习语 A(旧 HalfBrickPass 产物)=TILE_BY_KEY[d.key] 键;习语 B(旧 Mounts 产物)=数组
    // 下标键——两习语对该集全等（2026-09-18 探针定谳:13 id 16,67,160,175,188,199,
    // 220,242,256,288,375,380,397）;单源采用习语 B（下标=内部 id,不依赖 key 反查）。
    const a = new Set<number>(), b = new Set<number>();
    for (const d of TILE_DEFS) {
      const vs = d.vanilla?.sheet;
      if (vs !== undefined && FORBIDS_SLOPING_SHEETS.has(vs)) a.add(TILE_BY_KEY[d.key]!);
    }
    for (let i = 0; i < TILE_DEFS.length; i++) {
      if (FORBIDS_SLOPING_SHEETS.has(TILE_DEFS[i].vanilla?.sheet ?? -1)) b.add(i);
    }
    expect(FORBIDS_SLOPING_IDS.size).toBe(13);
    expect(FORBIDS_SLOPING_SHEETS.size).toBe(13);
    expect([...FORBIDS_SLOPING_IDS].sort((x, y) => x - y)).toEqual([...b].sort((x, y) => x - y));
    expect([...a].sort((x, y) => x - y)).toEqual([...b].sort((x, y) => x - y));
  });
  it('域判别(错域回退即红):宝箱内部 16 ∈ IDS ∉ SHEETS;sheet 21 ∈ SHEETS;内部→sheet 双向还原', () => {
    expect(T.CHEST).toBe(16);                                  // 掩蔽对字面量(§1 家法)
    expect(FORBIDS_SLOPING_IDS.has(T.CHEST)).toBe(true);       // 宝箱(sheet 21)内部 16=禁坡物
    expect(FORBIDS_SLOPING_SHEETS.has(T.CHEST)).toBe(false);   // 16 ∉ sheet 型集——IDS 被 sheet 裸值顶替即红
    expect(FORBIDS_SLOPING_SHEETS.has(21)).toBe(true);         // sheet 裸值在 SHEETS——SHEETS 被内部 id 顶替即红(21 ∉ 旧 IDS 值域可见上案)
    for (const id of FORBIDS_SLOPING_IDS) {
      expect(FORBIDS_SLOPING_SHEETS.has(TILE_DEFS[id].vanilla!.sheet)).toBe(true);
    }
  });
  it('消费面(生成期 internal 域):canPoundTile 上格宝箱 → false;上格空 → true', () => {
    const w = new World(400, 400, 42, 'sentinel');
    w.store.setTileSilent(5, 5, T.DIRT, 0, 0);
    expect(canPoundTile(w.store, 5, 5)).toBe(true);            // 负对照:净土可砸(canKillTileGen 直通)
    w.store.setTileSilent(5, 4, T.CHEST, 0, 0);                // 上格宝箱(内部 16/sheet 21)
    expect(canPoundTile(w.store, 5, 5)).toBe(false);           // ④ 上格 ForbidsSloping 门
    // ★宝箱案被 CanKillTile 上方承载族(sheet 21∈{21,26,72,77,88,467,488})双闸兜住,
    // 对单源域漂移不敏感(变异证红 M7 实测:IDS 错域回退后本案仍绿)——纯单闸见证见下案。
  });
  it('消费面纯见证(M7 变异牙口):上格假箱 441(内部 375)不在 CanKillTile 上支族,唯一闸=ForbidsSloping', () => {
    // FORBIDS_SLOPING∖CanKillTile 上支族差集={235,237,441,468,470,475,597}——这些型
    // 在上格时 canKillTileGen 不拦,canPoundTile=false 只能来自 ForbidsSloping 门:
    // IDS 错域回退(如 sheet 裸值顶替)→ 门漏 → 放行 → 本案红。
    const w = new World(400, 400, 42, 'sentinel');
    w.store.setTileSilent(5, 5, T.DIRT, 0, 0);
    const fakeChest = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 441);
    expect(fakeChest).toBe(375);                               // v_441_fakecontainers 掩蔽对字面量
    w.store.setTileSilent(5, 4, fakeChest, 0, 0);
    expect(canPoundTile(w.store, 5, 5)).toBe(false);
    w.store.setTileSilent(5, 4, 0, 0, 0);                      // 清空恢复
    expect(canPoundTile(w.store, 5, 5)).toBe(true);
  });
});

describe('§6b tileAxe/tileHammer 单源金标（★BJ158②:Game×SmartSelect×SmartCursor 六副本收编）', () => {
  // 此前三文件六本副本（Game.TILE_AXE_SHEETS/TILE_HAMMER_SHEETS(导出)、
  // SmartSelect.TILE_HAMMER_SHEETS/TILE_AXE_SHEETS、SmartCursor.HAMMER_TILES/
  // TILE_AXE_SHEETS_SC——Game 副本由 IDG-T2 家清单收编时钓出）,注释行号亦互相漂移;
  // 收编 data/tiles.ts 单源后,消费面行为由 tests/smart-select.test.ts（sheet 5 树→AXE/
  // sheet 26 祭坛→HAMMER）、tests/smart-cursor.test.ts（斧/锤步）、tests/orb-hammer-gate
  // .test.ts（tileHammer 权威表,导入已迁 data/tiles）与 Game 工具分派面承载。
  it('TILE_AXE_SHEETS ≡ Main.tileAxe(Main.cs:7347-7362 全 16 条,逐值钉死)', () => {
    expect([...TILE_AXE_SHEETS].sort((a, b) => a - b)).toEqual(
      [5, 72, 80, 323, 488, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 704]);
  });
  it('TILE_HAMMER_SHEETS ≡ Main.tileHammer(Main.cs:7343-7346 全 4 条,逐值钉死)', () => {
    expect([...TILE_HAMMER_SHEETS].sort((a, b) => a - b)).toEqual([26, 31, 695, 696]);
  });
});

describe('§6c Main.tileCut 41 项金标（★BJ158③:SurfaceDecorPasses 本地遮蔽名拆除,单源收编）', () => {
  // 此前 SurfaceDecorPasses 本地 TILE_CUT（sheet 键）与 Game 导出同名 TILE_CUT（internal
  // 键）同名校蔽=BJ154 影烛同族病;消费面四点（凹龛顶/蜂巢净空×2/藤上格）全吃 sheet 域,
  // 收编 TILE_CUT_SHEETS（与旧副本逐值对拍 41≡41 仅序异,行为零差;worldgen 回归由金标
  // 族承载）。
  it('TILE_CUT_SHEETS ≡ Main.tileCut 全表 41 项(Main.cs 逐条赋值;2026-09-01 对拍补齐 236/254/454)', () => {
    expect(TILE_CUT_SHEETS.size).toBe(41);
    const pin = [654, 518, 519, 549, 529, 637, 231, 484, 711, 201, 3, 24, 28, 32, 51, 52, 61,
      62, 69, 655, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 205, 352, 382, 528, 636, 638,
      444, 485, 454, 254, 236];
    for (const s of pin) expect(TILE_CUT_SHEETS.has(s)).toBe(true);
  });
});

describe('§6d TileID.Sets 家族单源金标（★BJ168-债2:IsATreeTrunk/Boulders/Platforms 收编 data/tiles.ts）', () => {
  // 2026-09-19 定谳:原版三表（1457 TileID.cs:161/:195/:243,1458 零变更）此前 sheet 域
  //   副本族跨 ~8 文件（世界生成面 7 处本批拆除:FinalCleanup×3/BuriedChests×3/
  //   NotTheBees/SecretSeedDoEnds/WorldEvolution×2/MicroBiomes×2/Torch×2/
  //   SurfaceDecorPasses;player 面 SmartCursor×3=并行禁区登记债;Game.ts 同名
  //   PLATFORMS_SHEETS=并行热文件登记债）。全量普查另见 ~30 文件同值副本=扩面登记债
  //   （DungeonPass/TemplePass/PilesPass/TrackPass/TrapsPass/HalfBrickPass 等）。
  it('IS_A_TREE_TRUNK_SHEETS ≡ TileID.cs:161 全 12 条(逐值钉死;★不含棕榈 323,原表如此)', () => {
    expect([...IS_A_TREE_TRUNK_SHEETS].sort((a, b) => a - b)).toEqual(
      [5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
  });
  it('BOULDERS_SHEETS ≡ TileID.cs:195 全 10 条(逐值钉死)', () => {
    expect([...BOULDERS_SHEETS].sort((a, b) => a - b)).toEqual(
      [138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
  });
  it('PLATFORMS_SHEETS ≡ TileID.cs:243 全 7 条(逐值钉死)', () => {
    expect([...PLATFORMS_SHEETS].sort((a, b) => a - b)).toEqual([19, 427, 435, 436, 437, 438, 439]);
  });
  it('BOULDERS_IDS 内部域镜像:双习语全等(旧 idsByVanillaSheet TILE_BY_KEY 键 vs 数组下标键)+读向还原', () => {
    // 习语 A(旧 FinalCleanup/BuriedChests/MicroBiomes 产物)=TILE_BY_KEY[d.key] 键;
    // 习语 B(单源采用)=数组下标键——762 defs 零重复 key(2026-09-19 探针定谳)故两习语
    // 对任意集全等;此处以 Boulders 逐值钉死(10 id:146,158,295,299,300,301,302,303,682,727)。
    const a = new Set<number>(), b = new Set<number>();
    for (const d of TILE_DEFS) {
      const vs = d.vanilla?.sheet;
      if (vs !== undefined && BOULDERS_SHEETS.has(vs)) a.add(TILE_BY_KEY[d.key]!);
    }
    for (let i = 0; i < TILE_DEFS.length; i++) {
      if (BOULDERS_SHEETS.has(TILE_DEFS[i].vanilla?.sheet ?? -1)) b.add(i);
    }
    expect(BOULDERS_IDS.size).toBe(10);
    expect([...BOULDERS_IDS].sort((x, y) => x - y)).toEqual(
      [146, 158, 295, 299, 300, 301, 302, 303, 682, 727]);
    expect([...a].sort((x, y) => x - y)).toEqual([...b].sort((x, y) => x - y));
    for (const id of BOULDERS_IDS) {
      expect(BOULDERS_SHEETS.has(TILE_DEFS[id].vanilla!.sheet)).toBe(true);
    }
  });
  it('域判别(错域回退即红):Boulders 掩蔽对——sheet 138 ∈ SHEETS 而 内部 138(sheet 379) ∉ IDS', () => {
    // tile 域两域 752/761 撞号(§1):BOULDERS_SHEETS 被内部 id 顶替→138/484/711 幻影;
    // BOULDERS_IDS 被 sheet 裸值顶替→真巨石(内部 146 等)全漏。掩蔽对字面量:
    expect(TILE_DEFS[138]?.vanilla?.sheet).toBe(379);          // 内部 138 = 硬化沙族,非巨石
    expect(BOULDERS_SHEETS.has(138)).toBe(true);               // sheet 138 = 巨石(原版型)
    expect(BOULDERS_IDS.has(138)).toBe(false);                 // 内部 138 ∉ 镜像——错域顶替即红
    expect(BOULDERS_IDS.has(295)).toBe(true);                  // 真巨石内部 id(295∈镜像)
    expect(BOULDERS_SHEETS.has(295)).toBe(false);              // sheet 295 非巨石——反向错域即红
    expect(TILE_BY_KEY['v_484_rolling_cactus']).toBe(146);     // 掩蔽对字面量钉死(滚刺球 sheet 484)
  });
});

describe('§6e BJ168-债2 结构锁:收编副本禁复活（源码扫描=事故字节签名禁入）', () => {
  // 收编后「无副本可立」:下列文件再出现本地定义即红。注释面豁免(取证注提及旧名
  // 带『拆除』字样,不含 `名字 =` 赋值形);正锚=同文件必须仍消费单源名(防空洞)。
  const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
  const FORBIDDEN: Array<[string, RegExp, string]> = [
    ['src/world/gen/vanilla/FinalCleanupPass.ts', /\bTILE_CUT_FC\s*=/, 'TILE_CUT_SHEETS'],
    ['src/world/gen/vanilla/FinalCleanupPass.ts', /\bconst BOULDERS\s*=/, 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/FinalCleanupPass.ts', /\bconst BOULDER_SHEETS\s*=/, 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/FinalCleanupPass.ts', /\bconst PLATFORMS\s*=/, 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/FinalCleanupPass.ts', /\bconst IS_TREE_TRUNK\s*=/, 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', /\bPC_TILE_CUT\s*=/, 'TILE_CUT_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', /\bPC_BREAK_PLACE\s*=/, 'BREAKABLE_WHEN_PLACING_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', /\bPC_BOULDERS\s*=/, 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', /\bBOULDER_TILES\s*=/, 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', /\bPC_PLATFORMS\s*=/, 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/DesertPass.ts', /\bAV_TILE_CUT\s*=/, 'TILE_CUT_SHEETS'],
    ['src/world/gen/vanilla/DesertPass.ts', /\bAV_BREAK_PLACE\s*=/, 'BREAKABLE_WHEN_PLACING_SHEETS'],
    ['src/world/gen/vanilla/DesertPass.ts', /\bconst BOULDERS\s*=/, 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/NotTheBeesPass.ts', /\bconst BOULDERS\s*=/, 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', /\bconst IS_A_TREE_TRUNK\s*=/, 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/MicroBiomesPass.ts', /\bBOULDER_TILES\s*=/, 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/MicroBiomesPass.ts', /\bTREE_TRUNK_MB\s*=/, 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/evolution/WorldEvolution.ts', /\bconst TILE_PLATFORMS\s*=/, 'PLATFORMS_SHEETS'],
    ['src/world/evolution/WorldEvolution.ts', /\bconst IS_A_TREE_TRUNK\s*=/, 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/Torch.ts', /\bIS_A_TREE_TRUNK_SHEETS\s*=\s*new/, 'data/tiles.ts 单源(转出口)'],
    ['src/world/Torch.ts', /\bPLATFORM_SHEETS\s*=\s*new/, 'data/tiles.ts 单源(转出口别名)'],
    ['src/world/gen/vanilla/SurfaceDecorPasses.ts', /\bconst PLATFORMS_SHEETS\s*=/, 'PLATFORMS_SHEETS 单源'],
    ['src/world/gen/vanilla/SurfaceDecorPasses.ts', /\bconst BOULDERS\s*=/, 'BOULDERS_SHEETS'],
  ];
  const REQUIRED: Array<[string, string]> = [
    ['src/world/gen/vanilla/FinalCleanupPass.ts', 'TILE_CUT_SHEETS.has('],
    ['src/world/gen/vanilla/FinalCleanupPass.ts', 'BOULDERS_IDS.has('],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', 'TILE_CUT_SHEETS.has('],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', 'BOULDERS_SHEETS.has('],
    ['src/world/gen/vanilla/DesertPass.ts', 'TILE_CUT_SHEETS.has('],
    ['src/world/gen/vanilla/DesertPass.ts', 'BOULDERS_IDS.has('],
    ['src/world/gen/vanilla/NotTheBeesPass.ts', 'BOULDERS_SHEETS.has('],
    ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'IS_A_TREE_TRUNK_SHEETS.has('],
    ['src/world/gen/vanilla/MicroBiomesPass.ts', 'BOULDERS_IDS.has('],
    ['src/world/evolution/WorldEvolution.ts', 'IS_A_TREE_TRUNK_SHEETS.has('],
    ['src/world/evolution/WorldEvolution.ts', 'PLATFORMS_SHEETS.has('],
    ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'BOULDERS_SHEETS.has('],
    ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'PLATFORMS_SHEETS.has('],
    ['src/world/Torch.ts', 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/Torch.ts', 'PLATFORMS_SHEETS'],
    // ★BJ426-债A(2026-10-01):Door.ts shiftTrapdoor 折翼行砍切门(BJ324 消费面转正,
    //   ≡WorldGen.cs:52013-52019 `active()&&(tileCut∥drip)→KillTile`)
    ['src/world/Door.ts', 'TILE_CUT_SHEETS.has('],
  ];
  it('禁复活:22 个收编副本旧定义字节签名禁入(注释面提及不受影响)', () => {
    for (const [file, sig] of FORBIDDEN) {
      expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
    }
  });
  it('防空洞正锚:每个收编文件必须仍消费 data/tiles.ts 单源名', () => {
    for (const [file, anchor] of REQUIRED) {
      expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
    }
  });
});

// ★BJ182b 批变异证红记录(2026-09-19,均在验证后还原):
//   M17 TILE_TABLE_SHEETS 摘 280(回退 PC_TILE_TABLE 病灶) → §6f 金标红+
//      tests/bj182b-cage-table-chest.test.ts(280 鸟笼箱锚行为面)红;
//   M18 DungeonPass 再立 `const DG_PLATFORMS = new Set([19,427])` 错值副本 → §6g 结构锁红
//      (IDG-T2 家清单只看单源名,别名复活由本结构锁单闸承责——§6e 同款分工);
//   M19 PLATFORMS_IDS 错域回退(new Set(PLATFORMS_SHEETS) 裸 sheet 值顶替) → §6f 镜像+
//      域判别两红(内部 11 幻影入表即红)。
describe('§6f BJ182b 收编金标:tileTable 81 项(★280 定谳)+双域镜像扩员', () => {
  // 2026-09-19 定谳:Main.tileTable 全表 81 项=1457 Main.cs:7018-7081(46 条直赋,首条
  //   tileTable[280]=true)+:7897-7898(376/380)+:8171-8191(14/469/18/19/114/101/87/88)
  //   +:8446(405)+:10121(427)+:10125-10131(435-439 循环臂)——程序化提取直读对拍,
  //   主表 81≡81 逐值全等零差。旧 76 项副本族(FinalCleanup/HalfBrick×2/Piles×2/Traps×2)
  //   系漏循环臂(缺 435-439);PC_TILE_TABLE 80 项系缺 280(BJ168-债2 附录登记本案)。
  it('TILE_TABLE_SHEETS ≡ Main.tileTable 全 81 项(逐值钉死;含 280 与 435-439 循环臂)', () => {
    expect(TILE_TABLE_SHEETS.size).toBe(81);
    const pin = [14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 280, 281,
      285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380,
      391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532, 533, 538,
      542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604,
      605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710];
    for (const s of pin) expect(TILE_TABLE_SHEETS.has(s)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(280)).toBe(true);              // ★鸟笼族桌面路(BJ182b 定谳锚)
    for (const s of [435, 436, 437, 438, 439]) expect(TILE_TABLE_SHEETS.has(s)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(0)).toBe(false);
  });
  it('PLATFORMS_IDS 内部域镜像:7 id 逐值钉死+双习语全等+读向还原', () => {
    expect(PLATFORMS_IDS.size).toBe(7);
    expect([...PLATFORMS_IDS].sort((a, b) => a - b)).toEqual([11, 529, 535, 536, 537, 538, 539]);
    const b = new Set<number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      if (PLATFORMS_SHEETS.has(TILE_DEFS[i].vanilla?.sheet ?? -1)) b.add(i);
    }
    expect([...PLATFORMS_IDS].sort((x, y) => x - y)).toEqual([...b].sort((x, y) => x - y));
    for (const id of PLATFORMS_IDS) expect(PLATFORMS_SHEETS.has(TILE_DEFS[id].vanilla!.sheet)).toBe(true);
  });
  it('IS_A_TREE_TRUNK_IDS 内部域镜像:13 id(12 sheet,sheet5 双内部身)逐值钉死', () => {
    expect(IS_A_TREE_TRUNK_IDS.size).toBe(13);
    expect([...IS_A_TREE_TRUNK_IDS].sort((a, b) => a - b)).toEqual(
      [8, 159, 173, 174, 177, 180, 181, 182, 185, 192, 196, 317, 326]);
    for (const id of IS_A_TREE_TRUNK_IDS) {
      expect(IS_A_TREE_TRUNK_SHEETS.has(TILE_DEFS[id].vanilla!.sheet)).toBe(true);
    }
  });
  it('域判别(错域回退即红):Platforms 掩蔽对——内部 19(sheet 3 草)∉IDS 幻影;内部 427(sheet 170)∉镜像而 sheet 427∈SHEETS', () => {
    expect(TILE_DEFS[19]?.vanilla?.sheet).toBe(3);             // 内部 19=草(掩蔽对字面量)
    expect(PLATFORMS_IDS.has(19)).toBe(false);                 // IDS 被 sheet 裸值顶替(19∈SHEETS)即红
    expect(TILE_DEFS[427]?.vanilla?.sheet).toBe(170);          // 内部 427 非平台
    expect(PLATFORMS_IDS.has(427)).toBe(false);                // 真镜像不含 427
    expect(PLATFORMS_SHEETS.has(427)).toBe(true);              // SHEETS 被内部 id 顶替(427 幻影)即红
    expect(PLATFORMS_IDS.has(11)).toBe(true);                  // 真平台内部 id(11=平台 sheet19)
  });
});

describe('§6g BJ182b 结构锁扩:65 副本禁复活（收编面=Platforms×22/Boulders×16/IsATreeTrunk×9/tileTable×10/tileCut×2/BreakPlace×1/内部镜像×5）', () => {
  const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
  // 签名=「名字 = new Set」或「名字 = idsByVanillaSheet」——单源别名(`= MASTER;`)不匹配=合法转出口
  const F = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(new\\s+Set|idsByVanillaSheet)`);
  const FORBIDDEN: Array<[string, RegExp, string]> = [
    // Platforms sheet 域(22)
    ['src/core/Game.ts', F('PLATFORMS_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/core/Game.ts', F('CONCH_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/entities/LeashedCritter.ts', F('SETS_PLATFORMS_VANILLA_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/entities/Player.ts', F('VANILLA_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/entities/RollingBoulder.ts', F('RB_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/player/SmartCursor.ts', F('PLATFORMS'), 'PLATFORMS_SHEETS'],
    ['src/render/VanillaTiler.ts', F('VANILLA_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/ui/JourneyBrowser.ts', F('TILE_PLATFORMS'), 'PLATFORMS_SHEETS'],
    ['src/wld/WldImport.ts', F('VANILLA_SOLID_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/world/spawn/SpawnPlacement.ts', F('VANILLA_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/DungeonDualLayout.ts', F('PLATFORM_SHEET_SET'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/DungeonEarlyFeatures.ts', F('DE_PLATFORM_SHEET'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/DungeonPass.ts', F('DG_PLATFORMS'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/FinishNoTrapsPass.ts', F('PLATFORMS_FNT'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/HellforgesPass.ts', F('HF_PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/PilesPass.ts', F('PLATFORM_SOLID'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/PilesPass.ts', F('SUP_PLATFORMS'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/StatuesPass.ts', F('PLATFORMS_TOP'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/TeleportSpotCheck.ts', F('SHEET_PLATFORMS'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/TemplePass.ts', F('PLATFORMS_TP'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/TileCleanupPass.ts', F('PLATFORM_99'), 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/TrapsPass.ts', F('PLATFORM_SHEETS'), 'PLATFORMS_SHEETS'],
    // Boulders sheet 域(16)
    ['src/core/Game.ts', F('BOULDER_SUPPORT_SHEETS'), 'BOULDERS_SHEETS'],
    ['src/player/SmartCursor.ts', F('BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/DungeonDualZones.ts', F('BOULDER_SHEETS'), 'BOULDERS_SHEETS'],
    ['src/world/spawn/ExtraSpawnsRoyale.ts', F('BOULDER_SHEETS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/CaveHousePass.ts', F('BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/DungeonPass.ts', F('DG_BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/DungeonPass.ts', F('E137_BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/FinishNoTrapsPass.ts', F('BOULDERS_SETS_FNT'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/LivingTreePass.ts', F('PILE_BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/PilesPass.ts', F('SUP_BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/Spread.ts', F('BOULDER_SHEETS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/StatuesPass.ts', F('BOULDERS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/TemplePass.ts', F('BOULDERS_TP'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/TrackPass.ts', F('BOULDER_SS'), 'BOULDERS_SHEETS'],
    ['src/world/gen/vanilla/TrapsPass.ts', F('BOULDER_SHEETS'), 'BOULDERS_SHEETS'],
    // IsATreeTrunk sheet 域(9)
    ['src/core/Game.ts', F('TREE_TRUNK_SHEETS'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/data/grappleHooks.ts', F('TREE_TRUNK_SHEETS'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/player/SmartCursor.ts', F('IS_A_TREE_TRUNK'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/TreeShake.ts', F('TREE_TRUNK_SHEETS'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', F('IS_TREE_TRUNK'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/TemplePass.ts', F('TREE_TRUNKS_TP'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/TileCleanupPass.ts', F('IS_TREE_TRUNK'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/TrackPass.ts', F('TREE_TRUNK_SS'), 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/world/gen/vanilla/TrapsPass.ts', F('TREE_TRUNK_T'), 'IS_A_TREE_TRUNK_SHEETS'],
    // tileTable(10:81 全本×3+76 项×7)
    ['src/world/gen/vanilla/DungeonPass.ts', F('DG_TILE_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/SkyblockPass.ts', /\bconst\s+TILE_TABLE_SHEETS\s*=/, 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('PLACE2X2_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/FinalCleanupPass.ts', F('TILE_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/HalfBrickPass.ts', F('TILE_TABLE_2X2KT'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/HalfBrickPass.ts', F('TILE_TABLE_S'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/PilesPass.ts', F('SUP_TILE_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/PilesPass.ts', F('PILES_PLACE2X2_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/TrapsPass.ts', F('TILE_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/TrapsPass.ts', F('PLACE2X2_TABLE'), 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', F('PC_TILE_TABLE'), 'TILE_TABLE_SHEETS'],
    // tileCut/BreakableWhenPlacing(3)
    ['src/world/gen/vanilla/DungeonPass.ts', F('DG_TILE_CUT'), 'TILE_CUT_SHEETS'],
    ['src/world/liquid/LiquidSim.ts', F('CUT_SHEETS'), 'TILE_CUT_SHEETS'],
    ['src/world/gen/vanilla/DungeonPass.ts', F('DG_BREAK_PLACE'), 'BREAKABLE_WHEN_PLACING_SHEETS'],
    // 内部域镜像(8)
    ['src/world/gen/vanilla/CorruptionPass.ts', F('BOULDERS'), 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', F('BOULDERS'), 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/HalfBrickPass.ts', F('BOULDERS'), 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/CorruptionPass.ts', F('PLATFORMS'), 'PLATFORMS_IDS'],
    ['src/world/gen/vanilla/QuickCleanupPass.ts', F('PLATFORMS'), 'PLATFORMS_IDS'],
    ['src/world/gen/vanilla/HalfBrickPass.ts', F('TREE_TRUNK'), 'IS_A_TREE_TRUNK_IDS'],
    ['src/world/gen/vanilla/TeleporterPass.ts', F('IS_TREE_TRUNK'), 'IS_A_TREE_TRUNK_IDS'],
  ];
  const REQUIRED: Array<[string, string]> = [
    ['src/core/Game.ts', 'PLATFORMS_SHEETS'],
    ['src/core/Game.ts', 'BOULDERS_SHEETS'],
    ['src/core/Game.ts', 'IS_A_TREE_TRUNK_SHEETS'],
    ['src/player/SmartCursor.ts', 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/DungeonPass.ts', 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/DungeonPass.ts', 'PLATFORMS_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/BuriedChestsPass.ts', 'PC_TILE_TABLE'],
    ['src/world/liquid/LiquidSim.ts', 'TILE_CUT_SHEETS'],
    ['src/world/gen/vanilla/SkyblockPass.ts', 'TILE_TABLE_SHEETS'],
    ['src/world/gen/vanilla/CorruptionPass.ts', 'BOULDERS_IDS'],
    ['src/world/gen/vanilla/QuickCleanupPass.ts', 'PLATFORMS_IDS'],
    ['src/world/gen/vanilla/HalfBrickPass.ts', 'IS_A_TREE_TRUNK_IDS'],
    ['src/world/gen/vanilla/TeleporterPass.ts', 'IS_A_TREE_TRUNK_IDS'],
    ['src/data/grappleHooks.ts', 'IS_A_TREE_TRUNK_SHEETS'],
  ];
  it('禁复活:收编副本「=new Set/=idsByVanillaSheet」字节签名禁入(单源别名转出口不受影响)', () => {
    for (const [file, sig] of FORBIDDEN) {
      expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
    }
  });
  it('防空洞正锚:每个收编文件必须仍引用 data/tiles.ts 单源名', () => {
    for (const [file, anchor] of REQUIRED) {
      expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
    }
  });
});

// ★BJ203 批变异证红记录(2026-09-20,均在验证后还原):
//   M17 ORE_SHEETS 漏 211 → §6h 金标红;
//   M18 IS_A_CONTAINER_SHEETS 错域回退(内部 16 顶替 sheet 21) → §6h 域判别红;
//   M19 TrapsPass 再立 const NOT_REALLY_SOLID = new Set([387,388,10]) 副本 → §6h 结构锁红。
describe('§6h BJ203 收编金标:TileID.cs 五表第二收编批(Ore/NotReallySolid/IsBeam/IsADripTile/IsAContainer)', () => {
  // 2026-09-20 定谳:BJ203 面三全仓数值普查（tools/_bj203-census.mjs 字符串感知逐值
  //   扫描）钓出 TileID.cs 五表字面副本 Ore×10/NotReallySolid×9/IsBeam×5/IsADripTile×5/
  //   IsAContainer×3——全部逐值对拍全等后收编 data/tiles.ts 单源;1457≡1458 同行号同值。
  //   消费面键域逐点亲读全 sheet 域（RollingBoulder sheet/TrapsPass sheetOf/SmartCursor
  //   sheetOf/Game vanilla.sheet/WldImport TILE_DEFS[].sheet/LiquidSim bySheet 平移/
  //   TeleportSpotCheck lutFromSheets 平移）。普查另登记 BJ204 债:Clouds ×13/CrackedBricks
  //   ×9/Moss/MossBrick/Ice/Stone/Snow/Sand/Grass 等转化族/PreventsTileRemoval ×5/
  //   FriendlyFairyCanLureTo ×2/CommonSapling ×2（注释锚已核出,收编法同本批）。
  it('ORE_SHEETS ≡ TileID.cs:403 全 19 项(逐值钉死;1457≡1458 零增量)', () => {
    expect(ORE_SHEETS.size).toBe(19);
    expect([...ORE_SHEETS].sort((a, b) => a - b)).toEqual(
      [6, 7, 8, 9, 22, 37, 58, 107, 108, 111, 166, 167, 168, 169, 204, 211, 221, 222, 223]);
  });
  it('NOT_REALLY_SOLID_SHEETS ≡ TileID.cs:359={387,388,10}(逐值钉死)', () => {
    expect([...NOT_REALLY_SOLID_SHEETS].sort((a, b) => a - b)).toEqual([10, 387, 388]);
  });
  it('IS_BEAM_SHEETS ≡ TileID.cs:239 全 7 项(逐值钉死)', () => {
    expect([...IS_BEAM_SHEETS].sort((a, b) => a - b)).toEqual([124, 561, 574, 575, 576, 577, 578]);
  });
  it('IS_A_DRIP_TILE_SHEETS ≡ TileID.cs:157 全 5 项(逐值钉死)', () => {
    expect([...IS_A_DRIP_TILE_SHEETS].sort((a, b) => a - b)).toEqual([373, 374, 375, 461, 709]);
  });
  it('IS_A_CONTAINER_SHEETS ≡ TileID.cs:409={21,467,88}(逐值钉死;≠ 7 值箱锚保护族)', () => {
    expect([...IS_A_CONTAINER_SHEETS].sort((a, b) => a - b)).toEqual([21, 88, 467]);
  });
  it('域判别(错域回退即红):ORE 掩蔽对 sheet8 金矿∈/内部8 树;内部4 铜∉ 而 sheet7 铜∈;Container 内部16 木箱∉', () => {
    // ORE:若被内部 id 顶替——内部 4(铜矿 §1 掩蔽对 COPPER)必∈(铜是矿)而 sheet 7(铜)
    // 与 sheet 8(金 §1 GOLD)双落空 → 本案双断言红;sheet 域真身:8∈/4∉。
    expect(ORE_SHEETS.has(8)).toBe(true);                      // sheet 8=金矿(§1 GOLD)
    expect(ORE_SHEETS.has(7)).toBe(true);                      // sheet 7=铜矿
    expect(ORE_SHEETS.has(4)).toBe(false);                     // 内部 4=铜矿 sheet——错域顶替即红
    expect(TILE_DEFS[4]?.vanilla?.sheet).toBe(7);              // 掩蔽对字面量:内部 4 的 sheet 恰=7
    expect(ORE_SHEETS.has(22)).toBe(true);                     // sheet 22=魔矿(§1 DEMONITE)
    // IS_A_CONTAINER:§6 同案——sheet 21∈/内部 16(T.CHEST)∉
    expect(T.CHEST).toBe(16);
    expect(IS_A_CONTAINER_SHEETS.has(21)).toBe(true);
    expect(IS_A_CONTAINER_SHEETS.has(16)).toBe(false);         // 错域顶替即红
  });
  describe('§6h 结构锁:BJ203 收编副本禁复活（33 处字节签名禁入+防空洞正锚）', () => {
    const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    const F = (name: string) => new RegExp(`\\b${name}\\s*=\\s*new\\s+Set`);
    const LUT = (name: string) => new RegExp(`\\b${name}\\s*=\\s*lutFromSheets\\(\\s*new\\s+Set`);
    const FORBIDDEN: Array<[string, RegExp, string]> = [
      // Ore(10)
      ['src/entities/RollingBoulder.ts', F('RB_ORE_SHEETS'), 'ORE_SHEETS'],
      ['src/world/gen/WorldGen.ts', F('ORE_SHEETS'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', F('ORE'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/FinishNoTrapsPass.ts', F('ORE_SHEETS'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/LivingTreePass.ts', F('ORE_SHEETS'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/MarbleGranitePass.ts', F('VANILLA_ORE'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/NotTheBeesPass.ts', F('ORE_SHEETS'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('ORE_SHEETS'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('SET_ORE'), 'ORE_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('ORE_SHEETS'), 'ORE_SHEETS'],
      // NotReallySolid(9)
      ['src/player/SmartCursor.ts', F('NOT_REALLY_SOLID'), 'NOT_REALLY_SOLID_SHEETS'],
      ['src/render/VanillaTiler.ts', F('NOT_REALLY_SOLID'), 'NOT_REALLY_SOLID_SHEETS'],
      ['src/world/Torch.ts', F('NOT_REALLY_SOLID_SHEETS'), 'data/tiles.ts 转出口'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('NOT_REALLY_SOLID_BANNER'), 'NOT_REALLY_SOLID_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('NOT_REALLY_SOLID'), 'NOT_REALLY_SOLID_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('NOT_REALLY_SOLID_S'), 'NOT_REALLY_SOLID_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', LUT('VAN_NOT_REALLY_SOLID'), 'lutFromSheets(NOT_REALLY_SOLID_SHEETS)'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('NOT_REALLY_SOLID'), 'NOT_REALLY_SOLID_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', F('NOT_REALLY_SOLID_SHEETS'), 'NOT_REALLY_SOLID_SHEETS'],
      // IsBeam(5)
      ['src/core/Game.ts', F('IS_BEAM_SHEETS'), 'IS_BEAM_SHEETS'],
      ['src/player/SmartCursor.ts', F('IS_BEAM'), 'IS_BEAM_SHEETS'],
      ['src/world/Torch.ts', F('IS_BEAM_SHEETS'), 'data/tiles.ts 转出口'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('IS_BEAM'), 'IS_BEAM_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', LUT('VAN_IS_BEAM'), 'lutFromSheets(IS_BEAM_SHEETS)'],
      // IsADripTile(5)
      ['src/core/Game.ts', F('ADRIP_TILE_SHEETS'), 'IS_A_DRIP_TILE_SHEETS'],
      ['src/entities/RollingBoulder.ts', F('RB_DRIP_SHEETS'), 'IS_A_DRIP_TILE_SHEETS'],
      ['src/render/WindSway.ts', F('NO_DRAW_SHEETS'), 'IS_A_DRIP_TILE_SHEETS'],
      ['src/render/WindSway.ts', F('DRIP_TILES'), 'IS_A_DRIP_TILE_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('IS_DRIP'), 'IS_A_DRIP_TILE_SHEETS(死码已删)'],
      // IsAContainer(3)
      ['src/wld/WldImport.ts', F('CONTAINER_SHEETS'), 'IS_A_CONTAINER_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('CONTAINER_SS'), 'IS_A_CONTAINER_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', F('CONTAINER_SHEETS'), 'IS_A_CONTAINER_SHEETS'],
      // 结构锁漏网副本(BJ203 普查钓出):TeleportSpotCheck 树干 LUT 源字面量
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', LUT('VAN_IS_TREE_TRUNK'), 'lutFromSheets(IS_A_TREE_TRUNK_SHEETS)'],
    ];
    const REQUIRED: Array<[string, string]> = [
      ['src/core/Game.ts', 'IS_BEAM_SHEETS.has('],
      ['src/core/Game.ts', 'IS_A_DRIP_TILE_SHEETS'],
      ['src/world/Torch.ts', 'NOT_REALLY_SOLID_SHEETS'],
      ['src/player/SmartCursor.ts', 'NOT_REALLY_SOLID_SHEETS'],
      ['src/entities/RollingBoulder.ts', 'IS_A_DRIP_TILE_SHEETS'],
      ['src/entities/RollingBoulder.ts', 'RB_ORE_SHEETS.has('],
      ['src/render/WindSway.ts', 'IS_A_DRIP_TILE_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'IS_BEAM'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'NOT_REALLY_SOLID'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'NOT_REALLY_SOLID_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', 'lutFromSheets(IS_A_TREE_TRUNK_SHEETS)'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', 'lutFromSheets(IS_BEAM_SHEETS)'],
      ['src/world/gen/vanilla/TrapsPass.ts', 'ORE_SHEETS.has('],
      ['src/world/gen/vanilla/TrapsPass.ts', 'NOT_REALLY_SOLID'],
      ['src/world/gen/vanilla/TrackPass.ts', 'IS_A_CONTAINER_SHEETS'],
      ['src/wld/WldImport.ts', 'IS_A_CONTAINER_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', 'IS_A_CONTAINER_SHEETS'],
      ['src/world/gen/vanilla/FinishNoTrapsPass.ts', 'ORE_SHEETS.has('],
      ['src/world/gen/vanilla/NotTheBeesPass.ts', 'ORE_SHEETS.has('],
      ['src/world/gen/vanilla/LivingTreePass.ts', 'ORE_SHEETS.has('],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'ORE_SHEETS.has('],
      ['src/world/gen/WorldGen.ts', 'ORE_SHEETS.has('],
      ['src/world/gen/vanilla/MarbleGranitePass.ts', 'ORE_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'ORE_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', 'ORE_SHEETS'],
      ['src/render/VanillaTiler.ts', 'NOT_REALLY_SOLID_SHEETS'],
      // ★BJ426-债A(2026-10-01):IDG-T2 八处基线违例收编后四消费面转正入锚(域判别
      //   详证见 §6m;REQUIRED=防收编面静默拆除)
      ['src/core/Game.ts', 'NOT_REALLY_SOLID_SHEETS.has(d.vanilla?.sheet ?? -1)'],
      ['src/world/Door.ts', 'IS_A_DRIP_TILE_SHEETS'],
      ['src/render/VanillaFraming.ts', 'S256([...ORE_SHEETS])'],
      ['src/entities/ClingerStaffWallProj.ts', 'PLATFORMS_SHEETS'],
    ];
    it('禁复活:33 处收编副本「=new Set/=lutFromSheets(new Set」字节签名禁入(单源别名转出口不受影响)', () => {
      for (const [file, sig] of FORBIDDEN) {
        expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
      }
    });
    it('防空洞正锚:每个收编文件必须仍消费 data/tiles.ts 单源名', () => {
      for (const [file, anchor] of REQUIRED) {
        expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
      }
    });
  });
});

// ★BJ210 批变异证红记录(2026-09-20,均在验证后还原):
//   M20 CLOUDS_SHEETS 漏 719 → §6i Clouds 金标红;
//   M21 CONV_SAND_IDS 错域回退(new Set(CONV_SAND_SHEETS) 裸值顶替,内部 53 幻影入表)
//      → §6i 镜像+域判别两红(沙块内部 53(sheet404 化石)不在 IDS);
//   M22 TreeShake 再立 const TREE_SHAKEABLE = new Set([5,72,323,...]) 副本 → §6i 结构锁红。
describe('§6i BJ210 收编金标:TileID.cs 第三收编批(Clouds/CrackedBricks/Conversion 全族+四杂表)', () => {
  // 2026-09-20 定谳:BJ203 登记债清偿——tools/_bj210-census.mjs 字符串感知 lexer
  //   （泛型 new Set<T> 与 ids/idsByVanillaSheet/S256/boolArrayOf 包装习语全扫描）
  //   钓出 16 表 ~90 处字面副本，逐值对拍 1457 终值全等后收编 data/tiles.ts 单源;
  //   消费面别名改指;1457≡1458 同行号同值零增量（Terarria1458 TileID.cs 抽核）。
  it('CLOUDS_SHEETS ≡ TileID.cs:197 全 6 项(逐值钉死;1457≡1458 零增量)', () => {
    expect(CLOUDS_SHEETS.size).toBe(6);
    expect([...CLOUDS_SHEETS].sort((a, b) => a - b)).toEqual([189, 196, 460, 717, 718, 719]);
  });
  it('CLOUDS_IDS 内部域镜像:6 id 逐值钉死(91,105,552,728,729,730)+读向还原', () => {
    expect([...CLOUDS_IDS].sort((a, b) => a - b)).toEqual([91, 105, 552, 728, 729, 730]);
    for (const sh of [189, 196, 460, 717, 718, 719]) {
      const internal = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sh);
      expect(CLOUDS_IDS.has(internal)).toBe(true);
    }
  });
  it('CRACKED_BRICKS_SHEETS ≡ TileID.cs:183={481,482,483}(逐值钉死)+IDS 镜像 3 id', () => {
    expect([...CRACKED_BRICKS_SHEETS].sort((a, b) => a - b)).toEqual([481, 482, 483]);
    expect([...CRACKED_BRICKS_IDS].sort((a, b) => a - b)).toEqual([95, 292, 392]);
  });
  it('Conversion.Grass ≡ TileID.cs:18 全 6 项(≡MergesWithDirtInASpecialWay :12 同值)', () => {
    expect([...CONV_GRASS_SHEETS].sort((a, b) => a - b)).toEqual([2, 23, 109, 199, 477, 492]);
  });
  it('Conversion.JungleGrass/GolfGrass(:14/:20)+Snow/Stone/Ice(:24/:26/:28) 逐值钉死', () => {
    expect([...CONV_JUNGLE_GRASS_SHEETS].sort((a, b) => a - b)).toEqual([60, 661, 662]);
    expect([...CONV_GOLF_GRASS_SHEETS].sort((a, b) => a - b)).toEqual([477, 492]);
    expect([...CONV_SNOW_SHEETS].sort((a, b) => a - b)).toEqual([147]);
    expect([...CONV_STONE_SHEETS].sort((a, b) => a - b)).toEqual([1, 25, 117, 203]);
    expect([...CONV_ICE_SHEETS].sort((a, b) => a - b)).toEqual([161, 163, 164, 200]);
  });
  it('Conversion.Sand/HardenedSand/Sandstone/Thorn(:30/:32/:34/:36) 逐值钉死', () => {
    expect([...CONV_SAND_SHEETS].sort((a, b) => a - b)).toEqual([53, 112, 116, 234]);
    expect([...CONV_HARDENED_SAND_SHEETS].sort((a, b) => a - b)).toEqual([397, 398, 399, 402]);
    expect([...CONV_SANDSTONE_SHEETS].sort((a, b) => a - b)).toEqual([396, 400, 401, 403]);
    expect([...CONV_THORN_SHEETS].sort((a, b) => a - b)).toEqual([32, 69, 352, 655]);
  });
  it('Conversion.Moss(:38)/MossBrick(:40) 全 11 项+双语义名同值锁(≡Main.tileMoss/tileMossBrick)', () => {
    expect([...MOSS_SHEETS].sort((a, b) => a - b)).toEqual(
      [179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
    expect([...MOSS_BRICK_SHEETS].sort((a, b) => a - b)).toEqual(
      [512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
    expect(MOSS_SHEETS).toBe(TILE_MOSS_SHEETS);               // Main.tileMoss(Main.cs:7146-7187) 语义名同源
    expect(MOSS_BRICK_SHEETS).toBe(TILE_MOSS_BRICK_SHEETS);   // tileMossBrick(:309) 语义名同源
  });
  it('Conversion 内部域镜像三表:SAND/HARDENED_SAND/SANDSTONE 逐值钉死', () => {
    expect([...CONV_SAND_IDS].sort((a, b) => a - b)).toEqual([22, 121, 278, 395]);
    expect([...CONV_HARDENED_SAND_IDS].sort((a, b) => a - b)).toEqual([52, 137, 282, 516]);
    expect([...CONV_SANDSTONE_IDS].sort((a, b) => a - b)).toEqual([51, 514, 515, 517]);
  });
  it('PreventsTileRemovalIfOnTopOfIt ≡ TileID.cs:169 全 17 项(逐值钉死)', () => {
    expect(PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS.size).toBe(17);
    expect([...PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS].sort((a, b) => a - b)).toEqual(
      [5, 26, 72, 323, 470, 475, 488, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
  });
  it('FriendlyFairyCanLureTo ≡ TileID.cs:413 全 17 项(逐值钉死)', () => {
    expect(FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS.size).toBe(17);
    expect([...FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS].sort((a, b) => a - b)).toEqual(
      [8, 12, 21, 107, 108, 111, 169, 211, 221, 222, 223, 227, 236, 467, 639, 665, 702]);
  });
  it('CommonSapling ≡ TileID.cs:173 全 4 项+IDS 镜像(24,627,629,644)', () => {
    expect([...COMMON_SAPLING_SHEETS].sort((a, b) => a - b)).toEqual([20, 590, 595, 615]);
    expect([...COMMON_SAPLING_IDS].sort((a, b) => a - b)).toEqual([24, 627, 629, 644]);
  });
  it('GetsDestroyedForMeteors ≡ TileID.cs:165 全 13 项(逐值钉死)', () => {
    expect(GETS_DESTROYED_FOR_METEORS_SHEETS.size).toBe(13);
    expect([...GETS_DESTROYED_FOR_METEORS_SHEETS].sort((a, b) => a - b)).toEqual(
      [5, 32, 352, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
  });
  it('面二三名同值锁:IsShakeable(:163)=GetsCheckedForLeaves(:167)=PreventsTileReplace(:171) 同一值源 13 项', () => {
    // 值同=零行为差:三名必须指向同一 Set 对象(单一值源);若原版未来分叉,此处先红。
    expect(IS_SHAKEABLE_SHEETS).toBe(GETS_CHECKED_FOR_LEAVES_SHEETS);
    expect(IS_SHAKEABLE_SHEETS).toBe(PREVENTS_TILE_REPLACE_IF_ON_TOP_SHEETS);
    expect(IS_SHAKEABLE_SHEETS.size).toBe(13);
    expect([...IS_SHAKEABLE_SHEETS].sort((a, b) => a - b)).toEqual(
      [5, 72, 323, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
    // 今日值=IsATreeTrunk(:161)∪{323 棕榈}(关系注记;两表在原版相互独立,此处仅证当前一致)
    const asUnion = new Set([...IS_A_TREE_TRUNK_SHEETS, 323]);
    expect(asUnion.size).toBe(IS_SHAKEABLE_SHEETS.size);
    for (const v of asUnion) expect(IS_SHAKEABLE_SHEETS.has(v)).toBe(true);
  });
  it('域判别(错域回退即红):Clouds/CRACKED/SAND/SAPLING 四组掩蔽对', () => {
    // Clouds:sheet 189∈SHEETS/内部 91(其真身)∈IDS;反向双落空——
    //   内部 189(sheet 592 已折草)∉IDS,sheet 91∉SHEETS。
    expect(CLOUDS_SHEETS.has(189)).toBe(true);
    expect(CLOUDS_IDS.has(91)).toBe(true);
    expect(CLOUDS_IDS.has(189)).toBe(false);      // 错域顶替即红
    expect(CLOUDS_SHEETS.has(91)).toBe(false);    // 错域顶替即红
    // CRACKED:内部 95(=sheet 481)∈IDS;内部 481(sheet 328)∉IDS。
    expect(CRACKED_BRICKS_IDS.has(95)).toBe(true);
    expect(CRACKED_BRICKS_IDS.has(481)).toBe(false);
    // SAND:内部 22(=sheet 53)∈IDS;内部 53(sheet 404 化石)∉IDS;sheet 22(魔矿)∉SHEETS。
    expect(CONV_SAND_IDS.has(22)).toBe(true);
    expect(CONV_SAND_IDS.has(53)).toBe(false);
    expect(CONV_SAND_SHEETS.has(22)).toBe(false);
    // SAPLING:内部 24(=sheet 20 苗)∈IDS;内部 20(sheet 3 草)∉IDS。
    expect(COMMON_SAPLING_IDS.has(24)).toBe(true);
    expect(COMMON_SAPLING_IDS.has(20)).toBe(false);
  });
  describe('§6i 结构锁:BJ210 收编副本禁复活（字节签名禁入+防空洞正锚）', () => {
    const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    const F = (name: string) => new RegExp(`\\b${name}\\s*=\\s*new\\s+Set`);
    const IDS = (name: string) => new RegExp(`\\b${name}\\s*=\\s*idsByVanillaSheet|\\b${name}\\s*=\\s*ids\\(`);
    const S256LIT = (name: string) => new RegExp(`\\b${name}\\s*=\\s*S256\\(\\s*\\[\\s*\\d`);
    const FORBIDDEN: Array<[string, RegExp, string]> = [
      // Clouds(sheet 域)
      ['src/entities/Player.ts', F('CLOUD_SHEETS'), 'CLOUDS_SHEETS'],
      ['src/core/Game.ts', F('TILE_CLOUD_SHEETS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', F('CLOUDS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('CLOUD_SHEETS_FGG'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/FinishRemixWorldPass.ts', F('CLOUD_SHEETS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/LivingTreePass.ts', F('LT_CLOUD_SHEETS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/LivingTreePass.ts', F('CLOUD_SHEETS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/NotTheBeesPass.ts', F('CLOUDS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('DESERT_CLOUD_IDS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('CLOUDS'), 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/DungeonPass.ts', F('DG_CLOUDS'), 'CLOUDS_SHEETS'],
      // Clouds(内部域)
      ['src/world/gen/vanilla/CorruptionPass.ts', IDS('CLOUD_IDS'), 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/DesertPass.ts', IDS('CLOUDS'), 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/TeleporterPass.ts', IDS('CLOUD_TILES'), 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', IDS('SGIS_CLOUD_IDS'), 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', IDS('CLOUDS'), 'CLOUDS_IDS'],
      // CrackedBricks(sheet 域)
      ['src/data/grappleHooks.ts', F('CRACKED_BRICK_SHEETS'), 'CRACKED_BRICKS_SHEETS'],
      ['src/lighting/lightTables.ts', F('CRACKED_SHEETS'), 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', F('CRACKED'), 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('CRACKED_FGG'), 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/FinishRemixWorldPass.ts', F('CRACKED_BRICKS'), 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/NotTheBeesPass.ts', F('CRACKED_BRICKS'), 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('EW_CRACKED'), 'CRACKED_BRICKS_SHEETS'],
      // CrackedBricks(内部域/派生)
      ['src/world/gen/vanilla/FinalCleanupPass.ts', IDS('CRACKED_BRICKS'), 'CRACKED_BRICKS_IDS'],
      ['src/world/gen/vanilla/FinishDrunkGenPass.ts', IDS('CRACKED_BRICKS'), 'CRACKED_BRICKS_IDS'],
      ['src/world/gen/vanilla/DungeonDualLayout.ts', /crackedBricks:\s*boolArrayOf\(\s*\[\s*\d/, 'boolArrayOf([...CRACKED_BRICKS_SHEETS])'],
      // Conversion 族+Moss/MossBrick(sheet 域;Game 同名 import 直用=无需别名)
      ['src/core/Game.ts', F('CONV_MOSS_SHEETS'), 'MOSS_SHEETS'],
      ['src/core/Game.ts', F('CONV_MOSSBRICK_SHEETS'), 'MOSS_BRICK_SHEETS'],
      ['src/core/Game.ts', F('CONVERSION_GRASS_SHEETS'), 'CONV_GRASS_SHEETS'],
      ['src/core/Game.ts', F('PREVENTS_TILE_REPLACE_SHEETS'), 'PREVENTS_TILE_REPLACE_IF_ON_TOP_SHEETS'],
      ['src/ui/JourneyBrowser.ts', F('TILE_GRASS'), 'CONV_GRASS_SHEETS'],
      ['src/world/evolution/PlantRules.ts', F('MOSS_CONVERT_SHEETS'), 'MOSS_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_JUNGLE_GRASS'), 'CONV_JUNGLE_GRASS_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_GRASS'), 'CONV_GRASS_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_GOLF_GRASS'), 'CONV_GOLF_GRASS_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_STONE'), 'CONV_STONE_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_ICE'), 'CONV_ICE_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_SAND'), 'CONV_SAND_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_HARD_SAND'), 'CONV_HARDENED_SAND_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_SANDSTONE'), 'CONV_SANDSTONE_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_THORN'), 'CONV_THORN_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CONV_SNOW'), 'CONV_SNOW_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('TILE_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('TILE_MOSS_BRICK'), 'MOSS_BRICK_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('GETS_CHECKED_FOR_LEAVES'), 'GETS_CHECKED_FOR_LEAVES_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', F('LAVA_BURN_TO_AIR'), 'CONV_GRASS_SHEETS'],
      ['src/render/TileMergeFamily.ts', F('SNOW'), 'CONV_SNOW_SHEETS'],
      ['src/world/gen/vanilla/GemPasses.ts', F('TILE_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/MossPass.ts', F('MOSS_SHEETS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/PilesPass.ts', F('TILE_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/HiveSpiderPass.ts', F('STAL_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/ShimmerPass.ts', F('MOSS_SHEETS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('EW_CONV_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('TILE_MOSS_BRICK'), 'MOSS_BRICK_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('TILE_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('TILE_MOSS_BRICK'), 'MOSS_BRICK_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('ICE_SET'), 'CONV_ICE_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('ICE_SET_3X2'), 'CONV_ICE_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('ICE_SHEET_SET'), 'CONV_ICE_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('PREVENTS_REMOVAL'), 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('TILE_MOSS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('TILE_MOSS_BRICK'), 'MOSS_BRICK_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('PREVENTS_REMOVAL_SS'), 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('TILE_MOSS_SS'), 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('TILE_MOSS_BRICK_SS'), 'MOSS_BRICK_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('SNOW_SS'), 'CONV_SNOW_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('ICE_SS'), 'CONV_ICE_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('SAND_SS'), 'CONV_SAND_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('HARDSAND_SS'), 'CONV_HARDENED_SAND_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', F('SANDSTONE_SS'), 'CONV_SANDSTONE_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', F('PREVENTS_REMOVAL_FSC'), 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('PREVENTS_REMOVAL_ON_TOP'), 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/MicroBiomesPass.ts', F('PREVENTS_REMOVAL_MB'), 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('GETS_DESTROYED_FOR_METEORS'), 'GETS_DESTROYED_FOR_METEORS_SHEETS'],
      ['src/player/SmartCursor.ts', F('COMMON_SAPLING'), 'COMMON_SAPLING_SHEETS'],
      ['src/world/gen/vanilla/TreePass.ts', F('COMMON_SAPLING_VAN'), 'COMMON_SAPLING_SHEETS'],
      ['src/world/gen/vanilla/TreePass.ts', IDS('COMMON_SAPLING'), 'COMMON_SAPLING_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', IDS('PALM_GROUND'), 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', IDS('SAND_CONV_IDS'), 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/UndergroundJungleTreesPass.ts', IDS('SAPLING_OK'), 'COMMON_SAPLING_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', IDS('SAND_CONV'), 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', IDS('SAND_FAMILY'), 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', IDS('PALM_GROUND'), 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', IDS('CONV_SANDSTONE'), 'CONV_SANDSTONE_IDS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', IDS('CONV_HARDENED_SAND'), 'CONV_HARDENED_SAND_IDS'],
      // VanillaFraming S256 字面派生面(单源名派生不受影响,禁裸字面数组复活)
      ['src/render/VanillaFraming.ts', S256LIT('TILE_MOSS'), 'S256([...TILE_MOSS_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('TILE_MOSS_BRICK'), 'S256([...MOSS_BRICK_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('MERGES_WITH_DIRT_SPECIAL'), 'S256([...CONV_GRASS_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('CONVERSION_MOSS'), 'S256([...MOSS_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('CONVERSION_MOSS_BRICK'), 'S256([...MOSS_BRICK_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('CONVERSION_GRASS'), 'S256([...CONV_GRASS_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_SNOW'), 'S256([...CONV_SNOW_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_ICES'), 'S256([...CONV_ICE_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_ORE'), 'S256([...ORE_SHEETS])'],
      // 面二三名同值案消费面
      ['src/world/TreeShake.ts', F('TREE_SHAKEABLE_SHEETS'), 'IS_SHAKEABLE_SHEETS'],
    ];
    const REQUIRED: Array<[string, string]> = [
      ['src/entities/Player.ts', 'CLOUDS_SHEETS'],
      ['src/core/Game.ts', 'CLOUDS_SHEETS'],
      ['src/core/Game.ts', 'MOSS_SHEETS'],
      ['src/core/Game.ts', 'PREVENTS_TILE_REPLACE_IF_ON_TOP_SHEETS'],
      ['src/core/Game.ts', 'CONV_GRASS_SHEETS'],
      ['src/entities/Enemy.ts', 'FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS'],
      ['src/entities/RollingBoulder.ts', 'FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS'],
      ['src/world/MeteorFall.ts', 'GETS_DESTROYED_FOR_METEORS_SHEETS'],
      ['src/world/TreeShake.ts', 'IS_SHAKEABLE_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'CONV_THORN_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'GETS_CHECKED_FOR_LEAVES_SHEETS'],
      ['src/world/evolution/PlantRules.ts', 'MOSS_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', 'CONV_GRASS_SHEETS'],
      ['src/lighting/lightTables.ts', 'CRACKED_BRICKS_SHEETS'],
      ['src/data/grappleHooks.ts', 'CRACKED_BRICKS_SHEETS'],
      ['src/ui/JourneyBrowser.ts', 'CONV_GRASS_SHEETS'],
      ['src/render/TileMergeFamily.ts', 'CONV_SNOW_SHEETS'],
      ['src/render/VanillaFraming.ts', 'TILE_MOSS_SHEETS'],
      ['src/render/VanillaFraming.ts', 'ORE_SHEETS'],
      ['src/player/SmartCursor.ts', 'COMMON_SAPLING_SHEETS'],
      ['src/world/gen/vanilla/CorruptionPass.ts', 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/DesertPass.ts', 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/TeleporterPass.ts', 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/StructuresPass.ts', 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/DungeonPass.ts', 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/DungeonPass.ts', 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'CLOUDS_IDS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'CRACKED_BRICKS_IDS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'MOSS_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/FinishRemixWorldPass.ts', 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/FinishRemixWorldPass.ts', 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/LivingTreePass.ts', 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/NotTheBeesPass.ts', 'CONV_GRASS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'CONV_GRASS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'GETS_DESTROYED_FOR_METEORS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'MOSS_BRICK_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'CLOUDS_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'CONV_ICE_SHEETS'],
      ['src/world/gen/vanilla/FinishDrunkGenPass.ts', 'CRACKED_BRICKS_IDS'],
      ['src/world/gen/vanilla/DungeonDualLayout.ts', 'CRACKED_BRICKS_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'CONV_ICE_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', 'CONV_SANDSTONE_IDS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', 'CONV_HARDENED_SAND_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', 'CONV_SAND_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', 'COMMON_SAPLING_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', 'COMMON_SAPLING_SHEETS'],
      ['src/world/gen/vanilla/UndergroundJungleTreesPass.ts', 'COMMON_SAPLING_IDS'],
      ['src/world/gen/vanilla/TrackPass.ts', 'CONV_SAND_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/MicroBiomesPass.ts', 'PREVENTS_TILE_REMOVAL_IF_ON_TOP_SHEETS'],
      ['src/world/gen/vanilla/GemPasses.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/MossPass.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/PilesPass.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/HiveSpiderPass.ts', 'TILE_MOSS_SHEETS'],
      ['src/world/gen/vanilla/ShimmerPass.ts', 'TILE_MOSS_SHEETS'],
    ];
    it('禁复活:BJ210 收编副本字面定义签名禁入（单源别名/拷贝转出口不受影响）', () => {
      for (const [file, sig] of FORBIDDEN) {
        expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
      }
    });
    it('防空洞正锚:每个收编文件必须仍消费 data/tiles.ts 单源名', () => {
      for (const [file, anchor] of REQUIRED) {
        expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
      }
    });
  });
});

// ★BJ218 批变异证红记录(2026-09-20,均在验证后还原):
//   M23 ICES_SNOW_SHEETS 漏 147(回退 Ices∪{161,163,164,200} 病灶) → §6j IcesSnow 金标红;
//   M24 DUNGEON_UNION_CRACKED_IDS 错域回退(new Set(DUNGEON_UNION_CRACKED_SHEETS) 裸值顶替,
//       内部 95/306/327/328/392 幻影入表) → §6j 镜像+域判别两红;
//   M25 TrapsPass 再立 const RESETS_HALF_EXEMPT_SHEETS=new Set([2,23,…633]) 33 值副本
//       → §6j 结构锁红(无副本可立)。
describe('§6j BJ218 收编金标:TileID.cs 第四收编批(IcesSnow 族/纯值族/并集族/TouchDamage 三表)', () => {
  // 2026-09-20 定谳:BJ210 登记债第二清偿——tools/_bj218-census.mjs 全仓字面副本扫描
  //   × Terarria1457/Terraria.ID/TileID.cs 亲读对拍（1458 同行号同值零增量抽核）,
  //   面一 IcesSnow 族 8 处/面二纯值族 ~26 处/面三并集族 4 处+TouchDamage 三表 7 处,
  //   逐值全等后收编 data/tiles.ts 单源,消费面别名改指。值同语义异案（VineThreads≡
  //   IsVine、Spreads*≡*BiomeSight≡*CountCollection、AshGround≡NeedsGrassFraming 单值
  //   巧合）单一值源+语义名导出（§6i 三名同值判例）。
  it('ICES_SNOW_SHEETS ≡ TileID.cs:297 = Ices(:293)∪Snow(:291) 全 5 项(逐值钉死;1457≡1458)', () => {
    expect(ICES_SNOW_SHEETS.size).toBe(5);
    expect([...ICES_SNOW_SHEETS].sort((a, b) => a - b)).toEqual([147, 161, 163, 164, 200]);
    expect(ICES_SNOW_SHEETS.has(224)).toBe(false);   // 224=IcesSlush(:295)/雪族灌水臂(cs:64416) 异表,勿并
    expect(ICES_SNOW_SHEETS.has(162)).toBe(false);   // 162=薄冰独立 id(TID:761),勿并
  });
  it('ICES_SNOW_IDS 内部域镜像 5 id 逐值钉死+读向还原', () => {
    expect([...ICES_SNOW_IDS].sort((a, b) => a - b)).toEqual([23, 47, 393, 394, 426]);
    for (const sh of [147, 161, 163, 164, 200]) {
      expect(ICES_SNOW_IDS.has(TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sh))).toBe(true);
    }
    for (const id of ICES_SNOW_IDS) expect(ICES_SNOW_SHEETS.has(TILE_DEFS[id].vanilla!.sheet)).toBe(true);
  });
  it('IS_VINE_SHEETS(:237) 全 8 项+VineThreads(:263) 同值锁(两名一值源)', () => {
    expect(IS_VINE_SHEETS.size).toBe(8);
    expect([...IS_VINE_SHEETS].sort((a, b) => a - b)).toEqual([52, 62, 115, 205, 382, 528, 636, 638]);
    expect(IS_VINE_SHEETS).toBe(VINE_THREADS_SHEETS);   // TileID.cs 两表今日同值;分叉即红
  });
  it('SWAYS_IN_WIND_BASIC_SHEETS ≡ TileID.cs:273 全 23 项(逐值钉死)', () => {
    expect(SWAYS_IN_WIND_BASIC_SHEETS.size).toBe(23);
    expect([...SWAYS_IN_WIND_BASIC_SHEETS].sort((a, b) => a - b)).toEqual(
      [3, 20, 24, 61, 71, 73, 74, 83, 84, 110, 113, 201, 227, 529, 590, 595, 615, 624, 637, 656, 700, 701, 703]);
  });
  it('FALLING_SHEETS ≡ TileID.cs:395 全 11 项;BASIC_CHEST_SHEETS ≡ :315={21,467}', () => {
    expect(FALLING_SHEETS.size).toBe(11);
    expect([...FALLING_SHEETS].sort((a, b) => a - b)).toEqual([53, 112, 116, 123, 224, 234, 330, 331, 332, 333, 495]);
    expect(BASIC_CHEST_SHEETS.size).toBe(2);
    expect([...BASIC_CHEST_SHEETS].sort((a, b) => a - b)).toEqual([21, 467]);
    expect(BASIC_CHEST_SHEETS.has(88)).toBe(false);     // 梳妆台=BasicDresser(:317) 异表
    expect(BASIC_CHEST_SHEETS.has(441)).toBe(false);    // 假箱=BasicChestFake(:317 下一行) 异表
  });
  it('Conversion.Corrupt(:333)/Crimson(:351)/Hallow(:341) 各全 8 项逐值钉死', () => {
    expect(CONV_CORRUPT_SHEETS.size).toBe(8);
    expect([...CONV_CORRUPT_SHEETS].sort((a, b) => a - b)).toEqual([23, 25, 112, 163, 398, 400, 636, 661]);
    expect(CONV_CRIMSON_SHEETS.size).toBe(8);
    expect([...CONV_CRIMSON_SHEETS].sort((a, b) => a - b)).toEqual([199, 200, 203, 205, 234, 399, 401, 662]);
    expect(CONV_HALLOW_SHEETS.size).toBe(8);
    expect([...CONV_HALLOW_SHEETS].sort((a, b) => a - b)).toEqual([109, 115, 116, 117, 164, 402, 403, 492]);
    // 8 项基集 ⊂ 10 项 Spreads 面
    for (const v of CONV_CORRUPT_SHEETS) expect(SPREADS_CORRUPTION_SHEETS.has(v)).toBe(true);
    for (const v of CONV_CRIMSON_SHEETS) expect(SPREADS_CRIMSON_SHEETS.has(v)).toBe(true);
    for (const v of CONV_HALLOW_SHEETS) expect(SPREADS_HALLOW_SHEETS.has(v)).toBe(true);
  });
  it('Spreads×BiomeSight×CountCollection 三名同值锁(:335/:331/:329 三族 ×10 项)', () => {
    expect(SPREADS_CORRUPTION_SHEETS.size).toBe(10);
    expect([...SPREADS_CORRUPTION_SHEETS].sort((a, b) => a - b)).toEqual([23, 24, 25, 32, 112, 163, 398, 400, 636, 661]);
    expect(SPREADS_CRIMSON_SHEETS.size).toBe(10);
    expect([...SPREADS_CRIMSON_SHEETS].sort((a, b) => a - b)).toEqual([199, 200, 201, 203, 205, 234, 352, 399, 401, 662]);
    expect(SPREADS_HALLOW_SHEETS.size).toBe(10);
    expect([...SPREADS_HALLOW_SHEETS].sort((a, b) => a - b)).toEqual([109, 110, 113, 115, 116, 117, 164, 402, 403, 492]);
    expect(SPREADS_CORRUPTION_SHEETS).toBe(CORRUPT_BIOME_SIGHT_SHEETS);       // CorruptBiomeSight :331
    expect(SPREADS_CORRUPTION_SHEETS).toBe(CORRUPT_COUNT_COLLECTION_SHEETS);  // CorruptCountCollection :329
    expect(SPREADS_CRIMSON_SHEETS).toBe(CRIMSON_BIOME_SIGHT_SHEETS);          // CrimsonBiomeSight :349
    expect(SPREADS_CRIMSON_SHEETS).toBe(CRIMSON_COUNT_COLLECTION_SHEETS);     // CrimsonCountCollection :347
    expect(SPREADS_HALLOW_SHEETS).toBe(HALLOW_BIOME_SIGHT_SHEETS);            // HallowBiomeSight :339
    expect(SPREADS_HALLOW_SHEETS).toBe(HALLOW_COUNT_COLLECTION_SHEETS);       // HallowCountCollection :337
  });
  it('ASH_GROUND_SHEETS={633}(值同语义异 NeedsGrassFraming 备案)+IDS 镜像 [89];MUSHROOM_GRASS={70}+IDS [310]', () => {
    expect(ASH_GROUND_SHEETS.size).toBe(1);
    expect([...ASH_GROUND_SHEETS]).toEqual([633]);
    expect([...ASH_GROUND_IDS].sort((a, b) => a - b)).toEqual([89]);
    expect(MUSHROOM_GRASS_SHEETS.size).toBe(1);
    expect([...MUSHROOM_GRASS_SHEETS]).toEqual([70]);
    expect([...MUSHROOM_GRASS_IDS].sort((a, b) => a - b)).toEqual([310]);
  });
  it('DOESNT_PLACE_WITH_TILE_REPLACEMENT(:233) 全 9 项;RESETS_HALF_BRICK(:181) 全 33 项', () => {
    expect(DOESNT_PLACE_WITH_TILE_REPLACEMENT_SHEETS.size).toBe(9);
    expect([...DOESNT_PLACE_WITH_TILE_REPLACEMENT_SHEETS].sort((a, b) => a - b)).toEqual(
      [2, 23, 60, 70, 109, 199, 633, 661, 662]);
    expect(RESETS_HALF_BRICK_PLACEMENT_ATTEMPT_SHEETS.size).toBe(33);
    expect([...RESETS_HALF_BRICK_PLACEMENT_ATTEMPT_SHEETS].sort((a, b) => a - b)).toEqual(
      [2, 23, 60, 70, 109, 179, 180, 181, 182, 183, 199, 381, 477, 492, 512, 513, 514, 515, 516, 517,
        534, 535, 536, 537, 539, 540, 625, 626, 627, 628, 633, 661, 662]);
  });
  it('ORE_MERGES_WITH_MUD_SHEETS ≡ TileID.cs:399 全 18 项(=ORE_SHEETS ∖ {211 叶绿})', () => {
    expect(ORE_MERGES_WITH_MUD_SHEETS.size).toBe(18);
    expect([...ORE_MERGES_WITH_MUD_SHEETS].sort((a, b) => a - b)).toEqual(
      [6, 7, 8, 9, 22, 37, 58, 107, 108, 111, 166, 167, 168, 169, 204, 221, 222, 223]);
    expect(ORE_MERGES_WITH_MUD_SHEETS.has(211)).toBe(false);
    for (const v of ORE_MERGES_WITH_MUD_SHEETS) expect(ORE_SHEETS.has(v)).toBe(true);
  });
  it('TouchDamage 三表(:387/:389/:391) 逐值钉死+DestroyTile(:385≡CONV_THORN) 转出口锁', () => {
    expect(SUFFOCATE_SHEETS.size).toBe(6);
    expect([...SUFFOCATE_SHEETS].sort((a, b) => a - b)).toEqual([53, 112, 116, 123, 224, 234]);
    expect(TOUCH_HOT_SHEETS.size).toBe(5);
    expect([...TOUCH_HOT_SHEETS].sort((a, b) => a - b)).toEqual([37, 58, 76, 230, 684]);
    expect(TOUCH_BLEEDING_SHEETS.size).toBe(3);
    expect([...TOUCH_BLEEDING_SHEETS].sort((a, b) => a - b)).toEqual([48, 232, 750]);
    expect(TOUCH_DESTROY_SHEETS).toBe(CONV_THORN_SHEETS);   // Conversion.Thorn(:36)≡TouchDamageDestroyTile(:385) 同值(BJ210 钉)
    expect(TOUCH_DESTROY_SHEETS.has(230)).toBe(false);      // HOT 灼烧面不混 TOUCH_DESTROY
  });
  it('DUNGEON_UNION_CRACKED 并集 6 项+IDS 镜像 6 id+与 tileDungeon 全表/CrackedBricks 关系锁(勿并轨)', () => {
    expect(DUNGEON_UNION_CRACKED_SHEETS.size).toBe(6);
    expect([...DUNGEON_UNION_CRACKED_SHEETS].sort((a, b) => a - b)).toEqual([41, 43, 44, 481, 482, 483]);
    expect([...DUNGEON_UNION_CRACKED_IDS].sort((a, b) => a - b)).toEqual([95, 292, 306, 327, 328, 392]);
    expect(DUNGEON_UNION_CRACKED_SHEETS.has(677)).toBe(false);   // 古砖 677-679 只在 tileDungeon 全表,不在并集
    for (const v of CRACKED_BRICKS_SHEETS) expect(DUNGEON_UNION_CRACKED_SHEETS.has(v)).toBe(true);
    for (const v of [41, 43, 44]) {
      expect(TILE_DUNGEON_SHEETS.has(v)).toBe(true);
      expect(DUNGEON_UNION_CRACKED_SHEETS.has(v)).toBe(true);
    }
    expect(DUNGEON_UNION_CRACKED_SHEETS).not.toBe(TILE_DUNGEON_SHEETS);   // 两表独立(超集语义分名,BJ187 备案)
    for (const v of [677, 678, 679]) expect(DUNGEON_UNION_CRACKED_SHEETS.has(v)).toBe(false);
  });
  it('域判别(错域回退即红):IcesSnow/并集/灰烬草/蘑菇草/BasicChest 五组掩蔽对', () => {
    // IcesSnow: 内部 23(=sheet 147 雪)∈IDS;sheet 23(腐草)∉SHEETS;内部 161(=sheet 23)∉IDS
    expect(ICES_SNOW_IDS.has(23)).toBe(true);
    expect(ICES_SNOW_SHEETS.has(23)).toBe(false);
    expect(ICES_SNOW_IDS.has(161)).toBe(false);
    // DUNGEON_UNION: 内部 95(=sheet 481 裂砖)∈IDS;内部 481(sheet 328 彩带)∉;sheet 95∉
    expect(DUNGEON_UNION_CRACKED_IDS.has(95)).toBe(true);
    expect(DUNGEON_UNION_CRACKED_IDS.has(481)).toBe(false);
    expect(DUNGEON_UNION_CRACKED_SHEETS.has(95)).toBe(false);
    expect(DUNGEON_UNION_CRACKED_SHEETS.has(41)).toBe(true);
    // ASH_GROUND: 内部 89(=sheet 633 灰烬草)∈IDS;sheet 89∉
    expect(ASH_GROUND_IDS.has(89)).toBe(true);
    expect(ASH_GROUND_SHEETS.has(89)).toBe(false);
    // MUSHROOM_GRASS: 内部 310(=sheet 70 蘑菇草)∈IDS;内部 70(sheet 3 草)∉
    expect(MUSHROOM_GRASS_IDS.has(310)).toBe(true);
    expect(MUSHROOM_GRASS_IDS.has(70)).toBe(false);
    expect(MUSHROOM_GRASS_SHEETS.has(310)).toBe(false);
    // BASIC_CHEST: sheet 21∈;内部 16(§6 同案 T.CHEST)∉
    expect(BASIC_CHEST_SHEETS.has(21)).toBe(true);
    expect(BASIC_CHEST_SHEETS.has(16)).toBe(false);
  });
  it('双域平移性质:被收编镜像对全 defs 对拍(键域契约无漏无多)', () => {
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sh = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
      expect(ICES_SNOW_IDS.has(i)).toBe(ICES_SNOW_SHEETS.has(sh));
      expect(DUNGEON_UNION_CRACKED_IDS.has(i)).toBe(DUNGEON_UNION_CRACKED_SHEETS.has(sh));
      expect(ASH_GROUND_IDS.has(i)).toBe(ASH_GROUND_SHEETS.has(sh));
      expect(MUSHROOM_GRASS_IDS.has(i)).toBe(MUSHROOM_GRASS_SHEETS.has(sh));
    }
  });
  describe('§6j 结构锁:BJ218 收编副本禁复活（字节签名禁入+防空洞正锚）', () => {
    const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    const F = (name: string) => new RegExp(`\\b${name}\\s*=\\s*new\\s+Set`);
    const S256LIT = (name: string) => new RegExp(`\\b${name}\\s*=\\s*S256\\(\\s*\\[\\s*\\d`);
    const IDSV = (name: string) => new RegExp(`\\b${name}\\s*=\\s*idsByVanillaSheet\\(`);
    const FORBIDDEN: Array<[string, RegExp, string]> = [
      // 面一 IcesSnow(8)
      ['src/render/TileMergeFamily.ts', F('ICES_SNOW'), 'ICES_SNOW_SHEETS'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_ICES_SNOW'), 'S256([...ICES_SNOW_SHEETS])'],
      ['src/world/evolution/WorldEvolution.ts', F('SNOW_FAMILY'), 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('PILE_SNOW_OK'), 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/HiveSpiderPass.ts', /new Set\(\s*\[\s*147,\s*161/, 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/ShimmerPass.ts', F('ICE_FAM'), 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/StructuresPass.ts', /idsByVanillaSheet\(\s*78,\s*380,\s*147/, 'idsByVanillaSheet(78,380,...ICES_SNOW_SHEETS)'],
      ['src/world/gen/vanilla/StructuresPass.ts', /idsByVanillaSheet\(\s*147,\s*163/, 'idsByVanillaSheet(...ICES_SNOW_SHEETS)'],
      ['src/world/gen/vanilla/WaterIcePasses.ts', F('SNOW_OR_ICE'), 'ICES_SNOW_SHEETS'],
      // 面二 IsVine/SwaysInWindBasic/Falling/BasicChest(16)
      ['src/core/Game.ts', F('VINE_SHEETS'), 'IS_VINE_SHEETS'],
      ['src/core/Game.ts', F('GRASS_WINDY_SHEETS'), 'SWAYS_IN_WIND_BASIC_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('IS_VINE'), 'IS_VINE_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('IS_VINE'), 'IS_VINE_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('IS_VINE'), 'IS_VINE_SHEETS'],
      ['src/render/WindSway.ts', F('SWAYS_IN_WIND_BASIC'), 'SWAYS_IN_WIND_BASIC_SHEETS'],
      ['src/render/WindSway.ts', F('VINE_THREADS'), 'VINE_THREADS_SHEETS'],
      ['src/entities/FallingBlock.ts', F('FALLING_SHEET_SET'), 'FALLING_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', F('FALLING_SHEETS'), 'FALLING_SHEETS import'],
      ['src/world/gen/vanilla/DungeonPass.ts', F('E137_FALLING'), 'FALLING_SHEETS'],
      ['src/render/TileHighlight.ts', F('BASIC_CHEST'), 'BASIC_CHEST_SHEETS'],
      ['src/world/Housing.ts', F('BASIC_CHEST'), 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/BuriedChestsPass.ts', F('KILL_SURVIVE_CHEST_SHEETS'), 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/DungeonEarlyFeatures.ts', F('DE_BASIC_CHEST_SHEET'), 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('BASIC_CHEST_S'), 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('CHEST_SHEETS'), 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('CHEST_SHEETS'), 'BASIC_CHEST_SHEETS'],
      // 面二 Corrupt/Crimson/Hallow/Spreads/CountCollection(6)
      ['src/world/gen/vanilla/HardmodePass.ts', F('SET_CORRUPT'), 'CONV_CORRUPT_SHEETS'],
      ['src/world/gen/vanilla/HardmodePass.ts', F('SET_HALLOW'), 'CONV_HALLOW_SHEETS'],
      ['src/world/gen/vanilla/HardmodePass.ts', F('SET_CRIMSON'), 'CONV_CRIMSON_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('SET_CORRUPT'), 'CONV_CORRUPT_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', F('SET_CRIMSON'), 'CONV_CRIMSON_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('SPREADS_CORRUPTION'), 'SPREADS_CORRUPTION_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('SPREADS_CRIMSON'), 'SPREADS_CRIMSON_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('SPREADS_HALLOW'), 'SPREADS_HALLOW_SHEETS'],
      ['src/world/WorldAlignment.ts', F('CORRUPT'), 'CORRUPT_COUNT_COLLECTION_SHEETS'],
      ['src/world/WorldAlignment.ts', F('HALLOW'), 'HALLOW_COUNT_COLLECTION_SHEETS'],
      ['src/world/WorldAlignment.ts', F('CRIMSON'), 'CRIMSON_COUNT_COLLECTION_SHEETS'],
      // 面二 AshGround/MushroomGrass/OreMergesWithMud/DoesntPlace/Resets(10)
      ['src/world/gen/vanilla/FinalCleanupPass.ts', F('ASH_TREE_GROUND'), 'ASH_GROUND_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('ASH_TREE_GROUND'), 'ASH_GROUND_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', F('CONV_MUSHROOM_GRASS'), 'MUSHROOM_GRASS_SHEETS'],
      ['src/world/gen/vanilla/TreePass.ts', IDSV('MUSHROOM_GRASS'), 'MUSHROOM_GRASS_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', IDSV('ASH_GROUND'), 'ASH_GROUND_IDS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', /637:\s*new Set\(\s*\[\s*633/, 'ASH_GROUND_SHEETS'],
      ['src/world/evolution/PlantRules.ts', /637:\s*new Set\(\s*\[\s*633/, 'ASH_GROUND_SHEETS'],
      ['src/render/VanillaFraming.ts', S256LIT('ORE_MERGES_WITH_MUD'), 'S256([...ORE_MERGES_WITH_MUD_SHEETS])'],
      ['src/core/Game.ts', F('BLOCK_SWAP_DOESNT_PLACE_SHEETS'), 'DOESNT_PLACE_WITH_TILE_REPLACEMENT_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', F('RESETS_HALF_EXEMPT_SHEETS'), 'RESETS_HALF_BRICK_PLACEMENT_ATTEMPT_SHEETS'],
      // 面三 tileDungeon∪Cracked 并集(4)+TouchDamage 三表(7)
      ['src/world/gen/vanilla/LivingTreePass.ts', F('EXCLUDE_BRICK'), 'DUNGEON_UNION_CRACKED_SHEETS'],
      ['src/world/DungeonDualZones.ts', /\[\s*41,\s*43,\s*44,\s*481,\s*482,\s*483\s*\]\.includes/, 'DUNGEON_UNION_CRACKED_SHEETS.has'],
      ['src/world/SceneMetrics.ts', /\bDUNGEON_TILES\s*=\s*ids\(/, 'DUNGEON_UNION_CRACKED_IDS'],
      ['src/world/spawn/ExtraSpawnsRoyale.ts', F('TILE_DUNGEON_SHEETS'), 'DUNGEON_UNION_CRACKED_SHEETS 别名'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', F('SHEET_SUFFOCATE'), 'SUFFOCATE_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', F('SHEET_TOUCH_BLEEDING'), 'TOUCH_BLEEDING_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', F('SHEET_TOUCH_HOT'), 'TOUCH_HOT_SHEETS'],
      ['src/stats/TouchDamage.ts', /setOf\(\s*\[\s*48,\s*232/, 'setOf([...TOUCH_BLEEDING_SHEETS])'],
      ['src/stats/TouchDamage.ts', /setOf\(\s*\[\s*37,\s*58/, 'setOf([...TOUCH_HOT_SHEETS])'],
      ['src/stats/TouchDamage.ts', /setOf\(\s*\[\s*53,\s*112,\s*116,\s*123/, 'setOf([...SUFFOCATE_SHEETS])'],
      ['src/stats/TouchDamage.ts', /setOf\(\s*\[\s*32,\s*69,\s*352/, 'setOf([...TOUCH_DESTROY_SHEETS])'],
    ];
    const REQUIRED: Array<[string, string]> = [
      ['src/render/TileMergeFamily.ts', 'ICES_SNOW_SHEETS'],
      ['src/render/VanillaFraming.ts', 'ICES_SNOW_SHEETS'],
      ['src/render/VanillaFraming.ts', 'ORE_MERGES_WITH_MUD_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'ICES_SNOW_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'IS_VINE_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'SPREADS_CORRUPTION_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/HiveSpiderPass.ts', 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/ShimmerPass.ts', 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/StructuresPass.ts', 'ICES_SNOW_SHEETS'],
      ['src/world/gen/vanilla/WaterIcePasses.ts', 'ICES_SNOW_SHEETS'],
      ['src/core/Game.ts', 'SWAYS_IN_WIND_BASIC_SHEETS'],
      ['src/core/Game.ts', 'IS_VINE_SHEETS'],
      ['src/core/Game.ts', 'DOESNT_PLACE_WITH_TILE_REPLACEMENT_SHEETS'],
      ['src/core/Game.ts', 'BASIC_CHEST_SHEETS'],
      ['src/render/WindSway.ts', 'SWAYS_IN_WIND_BASIC_SHEETS'],
      ['src/render/WindSway.ts', 'VINE_THREADS_SHEETS'],
      ['src/entities/FallingBlock.ts', 'FALLING_SHEETS'],
      ['src/world/gen/vanilla/FinalSeedCleanupPass.ts', 'ASH_GROUND_SHEETS'],
      ['src/world/gen/vanilla/DungeonPass.ts', 'FALLING_SHEETS'],
      ['src/render/TileHighlight.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/Housing.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/BuriedChestsPass.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/DungeonEarlyFeatures.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'MUSHROOM_GRASS_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'ASH_GROUND_SHEETS'],
      ['src/world/gen/vanilla/SecretSeedDoEndsPass.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', 'BASIC_CHEST_SHEETS'],
      ['src/world/gen/vanilla/TrapsPass.ts', 'RESETS_HALF_BRICK_PLACEMENT_ATTEMPT_SHEETS'],
      ['src/world/gen/vanilla/HardmodePass.ts', 'CONV_CORRUPT_SHEETS'],
      ['src/world/gen/vanilla/HardmodePass.ts', 'CONV_HALLOW_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'CONV_CORRUPT_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'IS_VINE_SHEETS'],
      ['src/world/gen/vanilla/SurfaceDecorPasses.ts', 'ASH_GROUND_SHEETS'],
      ['src/world/evolution/PlantRules.ts', 'ASH_GROUND_SHEETS'],
      ['src/world/gen/vanilla/TreePass.ts', 'MUSHROOM_GRASS_IDS'],
      ['src/world/gen/vanilla/TreePass.ts', 'ASH_GROUND_IDS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'IS_VINE_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'ASH_GROUND_SHEETS'],
      ['src/world/gen/vanilla/LivingTreePass.ts', 'DUNGEON_UNION_CRACKED_SHEETS'],
      ['src/world/DungeonDualZones.ts', 'DUNGEON_UNION_CRACKED_SHEETS'],
      ['src/world/SceneMetrics.ts', 'DUNGEON_UNION_CRACKED_IDS'],
      ['src/world/spawn/ExtraSpawnsRoyale.ts', 'DUNGEON_UNION_CRACKED_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', 'SUFFOCATE_SHEETS'],
      ['src/world/gen/vanilla/TeleportSpotCheck.ts', 'TOUCH_HOT_SHEETS'],
      ['src/stats/TouchDamage.ts', 'TOUCH_BLEEDING_SHEETS'],
      ['src/world/WorldAlignment.ts', 'COUNT_COLLECTION_SHEETS'],
    ];
    it('禁复活:BJ218 收编副本字面定义签名禁入（单源别名/拷贝转出口不受影响）', () => {
      for (const [file, sig] of FORBIDDEN) {
        expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
      }
    });
    it('防空洞正锚:每个收编文件必须仍消费 data/tiles.ts 单源名', () => {
      for (const [file, anchor] of REQUIRED) {
        expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
      }
    });
  });
});

// ★BJ221 批变异证红记录(2026-09-20,均在验证后还原):
//   M26 CHECKS_FOR_MERGE_SHEETS 摘 407(字面缺值) → §6k 金标红;
//   M27 GENERAL_PLACEMENT_TILES_IDS 错域回退(new Set(GENERAL_PLACEMENT_TILES_SHEETS) 裸值顶替,
//       内部 225(sheet305 蛛丝)/41(sheet63 宝石) 幻影入表) → §6k 镜像+域判别两红;
//   M28 VanillaTiler 再立 const HAS_SLOPE_FRAMES = new Set([421,422]) 副本 → §6k 结构锁红;
//   M29 LiquidSim 再立 bySheet(new Set([88])) 内联字面副本 → §6k 结构锁红。
describe('§6k BJ221 收编金标:TileID.cs 第五收编批(分帧/坡面/世界生成/NPC/房屋/接线/照明/交互 ~40 表)', () => {
  // 2026-09-20 定谳:BJ218 普查残留副本族第三清偿——逐值对拍 Terarria1457 TileID.cs 亲读
  //   终值全等（校验脚本 51 处逐族 SAME;1458 同行号同值零增量全 44 行抽核）,收编
  //   data/tiles.ts 单源,消费面别名改指。无漂移案(全纯同值);值同语义异=LAVA_BURN_TO_DIRT
  //   ≡GrassSpecial（Liquid.cs:1561 字面 switch,原版彼处不读表）;半砖 PLATFORMS_4X2 改指
  //   既有 PLATFORMS_IDS（:243 同值三名案）。照登维持:TeleportSpotCheck
  //   .SHEET_TOUCH_IMMEDIATE_GT0(int 表 0 哨兵键域)/PlantRules.GRASS_CONVERT_SHEETS。
  const A = (x: ReadonlySet<number>) => [...x].sort((a, b) => a - b);
  it('分帧域四表:ChecksForMerge(:373) 51 项/ForcedDirtMerging(:185) 60 项/MergesWithClouds(:191) 5 项/DontMergeWithSnow(:193) 7 项', () => {
    expect(A(CHECKS_FOR_MERGE_SHEETS)).toEqual(
      [0, 2, 57, 58, 59, 60, 70, 75, 76, 109, 112, 147, 161, 162, 163, 164, 170, 189, 191, 196, 199, 200, 211, 224, 225, 226, 234, 383, 396, 397, 398, 399, 400, 401, 402, 403, 404, 407, 460, 477, 492, 633, 661, 662, 668, 684, 717, 718, 719, 738, 747]);
    expect(A(FORCED_DIRT_MERGING_SHEETS)).toEqual(
      [54, 75, 76, 192, 226, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 272, 273, 274, 284, 325, 326, 327, 328, 329, 345, 357, 384, 385, 409, 458, 459, 507, 508, 669, 670, 671, 672, 673, 674, 675, 676, 683, 684, 708, 735, 736, 737, 738, 741, 742, 743, 745, 746, 747, 748, 749]);
    expect(A(MERGES_WITH_CLOUDS_SHEETS)).toEqual([196, 460, 717, 718, 719]);
    expect(MERGES_WITH_CLOUDS_SHEETS.has(189)).toBe(false);   // ≠Clouds(:197) 全 6 型,缺云本体
    expect(A(DONT_MERGE_WITH_SNOW_SHEETS)).toEqual([161, 163, 164, 170, 200, 224, 738]);
  });
  it('Dirt/Mud/Ash(:285-289)+GrassSpecial(:299,≡LAVA_BURN_TO_DIRT 值同语义异备案)+Jungle/HellSpecial(:301/:303)', () => {
    expect(A(SETS_DIRT_SHEETS)).toEqual([0, 668]);            // ★≠Conversion.Dirt(:22={0})
    expect(A(SETS_MUD_SHEETS)).toEqual([59]);
    expect(A(SETS_ASH_SHEETS)).toEqual([57]);
    expect(A(GRASS_SPECIAL_SHEETS)).toEqual([60, 70, 661, 662]);
    expect(LAVA_BURN_TO_DIRT_SHEETS).toBe(GRASS_SPECIAL_SHEETS);  // Liquid.cs:1561 字面 switch 同值单源(分叉即红)
    expect(A(JUNGLE_SPECIAL_SHEETS)).toEqual([211, 225, 226]);
    expect(A(HELL_SPECIAL_SHEETS)).toEqual([58, 75, 76]);
  });
  it('坡面渲染域:HasSlopeFrames(:267)/BlocksStairs(:357)/DontDrawTileSlopes(:153,≠Sliced 缺 160)/IgnoresNearbyHalfbricks(:271)/SmoothBorders(:175) 109 项', () => {
    expect(A(HAS_SLOPE_FRAMES_SHEETS)).toEqual([421, 422]);
    expect(A(BLOCKS_STAIRS_SHEETS)).toEqual([54, 328, 386, 387, 459, 541]);
    expect(A(DONT_DRAW_TILE_SLOPES_SHEETS)).toEqual(
      [137, 138, 235, 388, 476, 630, 631, 664, 665, 711, 712, 713, 714, 715, 716, 723, 726]);
    expect(DONT_DRAW_TILE_SLOPES_SHEETS.has(160)).toBe(false);   // 160 只在 DontDrawTileSliced(:151),勿并
    expect(A(IGNORES_NEARBY_HALFBRICKS_SHEETS)).toEqual(
      [137, 138, 235, 380, 421, 422, 476, 484, 664, 711, 712, 713, 714, 715, 716]);
    expect(A(ALL_BLOCKS_WITH_SMOOTH_BORDERS_SHEETS)).toEqual(
      [38, 39, 45, 46, 54, 56, 80, 118, 119, 121, 122, 127, 140, 145, 146, 148, 150, 151, 152, 153, 154, 155, 156, 157, 159, 160, 175, 176, 190, 198, 202, 206, 208, 226, 229, 250, 251, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 272, 273, 274, 284, 311, 321, 325, 326, 327, 328, 329, 345, 346, 347, 348, 350, 357, 369, 370, 385, 426, 430, 431, 432, 433, 434, 472, 473, 477, 478, 479, 492, 496, 507, 508, 563, 618, 680, 681, 682, 685, 686, 687, 688, 689, 690, 691, 692, 708, 722, 727, 728, 729, 730, 731, 732, 735, 748]);
  });
  it('存档/生成域:NonSolidSaveSlopes(:179) 8 项+IDS 镜像 8 id;SlowlyDiesInWater(:249) 14 项+IDS 镜像 17 id(sheet3 四内部身);SpawnsNatureFlies(:251)=Slowly∖{590}', () => {
    expect(A(NON_SOLID_SAVE_SLOPES_SHEETS)).toEqual([131, 336, 340, 341, 342, 343, 344, 351]);
    expect(A(NON_SOLID_SAVE_SLOPES_IDS)).toEqual([285, 334, 486, 489, 490, 491, 492, 497]);
    expect(A(SLOWLY_DIES_IN_WATER_SHEETS)).toEqual([3, 20, 24, 27, 73, 80, 110, 201, 529, 530, 590, 595, 615, 637]);
    expect(A(SLOWLY_DIES_IN_WATER_IDS)).toEqual(
      [19, 20, 21, 24, 154, 184, 206, 243, 314, 316, 318, 319, 321, 330, 627, 629, 644]);
    expect(SLOWLY_DIES_IN_WATER_IDS.size).toBe(17);            // sheet 3(草)有 19/20/21/319 四内部身
    const nf = [...SPAWNS_NATURE_FLIES_SHEETS].sort((a, b) => a - b);
    const sd = [...SLOWLY_DIES_IN_WATER_SHEETS].filter((v) => v !== 590).sort((a, b) => a - b);
    expect(nf).toEqual(sd);                                     // 关系锁:SpawnsNatureFlies=SlowlyDies∖{590 宝石苗}
  });
  it('GeneralPlacementTiles(:311) 28 项+IDS 镜像 28 id;SpreadOverground(:417)/Underground(:419) 关系锁;CanGrowCrystalShards(:345) ⊂ Conversion.Hallow', () => {
    expect(A(GENERAL_PLACEMENT_TILES_SHEETS)).toEqual(
      [12, 21, 25, 31, 41, 43, 44, 70, 112, 138, 151, 203, 225, 226, 467, 481, 482, 483, 639, 664, 665, 696, 711, 712, 713, 714, 715, 716]);
    expect(A(GENERAL_PLACEMENT_TILES_IDS)).toEqual(
      [16, 74, 87, 94, 95, 121, 158, 175, 277, 292, 295, 299, 300, 301, 302, 303, 305, 306, 310, 311, 327, 328, 329, 392, 659, 682, 712, 727]);
    expect(A(SPREAD_OVERGROUND_SHEETS)).toEqual([2, 23, 32, 60, 70, 109, 199, 226, 352, 477, 492, 633, 661, 662]);
    expect(A(SPREAD_UNDERGROUND_SHEETS)).toEqual([23, 60, 70, 109, 199, 226, 633, 661, 662]);
    const over = new Set(SPREAD_OVERGROUND_SHEETS);
    const under = new Set(SPREAD_UNDERGROUND_SHEETS);
    for (const v of under) expect(over.has(v)).toBe(true);      // Underground ⊂ Overground
    for (const v of [2, 32, 352, 477, 492]) {                    // 差集恰=普通草/荆棘/高尔夫草(地表专属)
      expect(over.has(v)).toBe(true);
      expect(under.has(v)).toBe(false);
    }
    expect(A(CAN_GROW_CRYSTAL_SHARDS_SHEETS)).toEqual([116, 117, 164, 402, 403]);
    for (const v of CAN_GROW_CRYSTAL_SHARDS_SHEETS) expect(CONV_HALLOW_SHEETS.has(v)).toBe(true);
  });
  it('Paintings(:187) 5 项+IDS 镜像;PreventsSlopesDuringGeneration(:323) 9 项+IDS 镜像', () => {
    expect(A(PAINTINGS_SHEETS)).toEqual([240, 241, 242, 245, 246]);
    expect(A(PAINTINGS_IDS)).toEqual([156, 165, 171, 172, 195]);
    expect(A(PREVENTS_SLOPES_DURING_GENERATION_SHEETS)).toEqual([48, 135, 137, 151, 191, 232, 274, 428, 442]);
    expect(A(PREVENTS_SLOPES_DURING_GENERATION_IDS)).toEqual([102, 104, 119, 122, 123, 163, 277, 372, 376]);
  });
  it('NPC/房屋/坐席域:AvoidedByNPCs(:377) 25 项/InteractableByNPCs(:379) 90 项/IgnoredByNpcStepUp(:209)/CanBeSatOnForPlayers(:213)/HousingWalls(:381)/IgnoredInHouseScore(:415)', () => {
    expect(A(AVOIDED_BY_NPCS_SHEETS)).toEqual(
      [21, 29, 55, 85, 88, 97, 99, 209, 334, 356, 395, 425, 440, 441, 463, 467, 468, 471, 491, 510, 511, 520, 573, 663, 698]);
    expect(INTERACTABLE_BY_NPCS_SHEETS.size).toBe(90);
    expect(A(INTERACTABLE_BY_NPCS_SHEETS)).toEqual(
      [12, 17, 21, 26, 29, 33, 35, 36, 49, 50, 55, 77, 78, 79, 88, 94, 96, 97, 99, 100, 101, 103, 106, 114, 125, 128, 133, 171, 172, 173, 174, 207, 209, 215, 219, 220, 228, 237, 244, 247, 269, 282, 287, 302, 354, 355, 372, 377, 378, 390, 395, 405, 406, 411, 425, 441, 452, 454, 455, 457, 462, 463, 464, 467, 468, 470, 471, 475, 491, 494, 499, 505, 510, 511, 520, 543, 565, 573, 597, 598, 617, 621, 639, 642, 646, 665, 695, 698, 699, 707]);
    expect(A(IGNORED_BY_NPC_STEP_UP_SHEETS)).toEqual([14, 16, 18, 134, 469]);
    expect(A(CAN_BE_SAT_ON_FOR_PLAYERS_SHEETS)).toEqual([15, 89, 102, 487, 497]);
    expect(CAN_BE_SAT_ON_FOR_PLAYERS_SHEETS.has(497)).toBe(true);
    expect(A(HOUSING_WALLS_SHEETS)).toEqual([11, 386, 389]);
    expect(A(IGNORED_IN_HOUSE_SCORE_SHEETS)).toEqual([3, 4, 73, 82, 83, 84, 386]);
  });
  it('接线域 Wiring 三表:IsAMechanism(:132) 86 项+IDS 87 id(sheet389 双内部身)/IsATrigger(:134) 10 项+IDS/IgnoreWhenValidatingTraps(:136) 14 项+IDS 15 id', () => {
    expect(IS_A_MECHANISM_SHEETS.size).toBe(86);
    expect(A(IS_A_MECHANISM_SHEETS)).toEqual(
      [4, 10, 11, 21, 33, 34, 35, 42, 92, 93, 95, 100, 105, 126, 130, 131, 137, 139, 141, 142, 143, 149, 207, 209, 210, 212, 215, 216, 219, 235, 244, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 314, 335, 338, 349, 356, 386, 387, 388, 389, 405, 406, 411, 419, 420, 421, 422, 425, 429, 443, 452, 455, 467, 480, 497, 506, 509, 531, 546, 557, 564, 565, 593, 594, 642, 657, 658, 663, 720, 721, 725, 733]);
    expect(IS_A_MECHANISM_IDS.size).toBe(87);                  // sheet 389(开门别名域)双内部身 213/364
    expect(A(IS_A_TRIGGER_SHEETS)).toEqual([132, 135, 136, 144, 411, 423, 440, 441, 468, 476]);
    expect(A(IS_A_TRIGGER_IDS)).toEqual([163, 178, 202, 287, 290, 369, 374, 375, 380, 381]);
    expect(A(IGNORE_WHEN_VALIDATING_TRAPS_SHEETS)).toEqual([4, 10, 11, 21, 215, 219, 314, 386, 387, 388, 389, 411, 467, 642]);
    expect(IGNORE_WHEN_VALIDATING_TRAPS_IDS.size).toBe(15);
    // ⊂/⊃关系:IgnoreWhenValidatingTraps ⊂ IsAMechanism(原版谓词 !Mechanism&&Ignore 恒 false 才成立——
    // 实际 IsItATrap=actuator||(Mechanism&&!Ignore),Ignore 单独存在无消费意义,锁定包含关系防漂)
    for (const v of IGNORE_WHEN_VALIDATING_TRAPS_SHEETS) expect(IS_A_MECHANISM_SHEETS.has(v)).toBe(true);
  });
  it('照明/交互/高亮/杂项:AllowLightInWater(:363)/BasicChestFake(:317)/BasicDresser(:319)/Campfires(:407)/CountsAsWaterForCrafting(:281)/DisableSmartInteract(:207)/HasOutlines(:277) 95 项/Torches(:405)', () => {
    expect(A(ALLOW_LIGHT_IN_WATER_SHEETS)).toEqual([54, 328, 459, 541, 748, 750]);
    expect(A(BASIC_CHEST_FAKE_SHEETS)).toEqual([441, 468]);
    expect(BASIC_CHEST_FAKE_SHEETS.has(21)).toBe(false);        // ≠BasicChest(:315) 真箱
    expect(A(BASIC_DRESSER_SHEETS)).toEqual([88]);
    expect(A(CAMPFIRES_SHEETS)).toEqual([215]);
    expect(A(COUNTS_AS_WATER_FOR_CRAFTING_SHEETS)).toEqual([172, 207]);
    expect(A(DISABLE_SMART_INTERACT_SHEETS)).toEqual(
      [4, 33, 334, 395, 410, 455, 471, 480, 509, 520, 657, 658, 698, 720, 721, 725, 733]);
    expect(HAS_OUTLINES_SHEETS.size).toBe(95);
    expect(A(HAS_OUTLINES_SHEETS)).toEqual(
      [10, 11, 15, 16, 17, 18, 21, 26, 29, 55, 77, 79, 85, 86, 88, 89, 94, 96, 97, 101, 102, 104, 106, 114, 125, 132, 133, 134, 136, 139, 144, 172, 207, 209, 212, 215, 216, 217, 218, 220, 228, 237, 243, 247, 283, 287, 300, 301, 302, 303, 304, 305, 306, 307, 308, 335, 338, 354, 355, 356, 377, 386, 387, 388, 389, 410, 411, 412, 425, 441, 455, 463, 464, 467, 468, 470, 475, 480, 487, 494, 497, 499, 509, 510, 511, 621, 622, 657, 658, 663, 699, 720, 721, 725, 733]);
    expect(A(TORCHES_SHEETS)).toEqual([4]);
  });
  it('内部域镜像八表:全 defs 双域平移性质(键域契约无漏无多)', () => {
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sh = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
      expect(NON_SOLID_SAVE_SLOPES_IDS.has(i)).toBe(NON_SOLID_SAVE_SLOPES_SHEETS.has(sh));
      expect(SLOWLY_DIES_IN_WATER_IDS.has(i)).toBe(SLOWLY_DIES_IN_WATER_SHEETS.has(sh));
      expect(GENERAL_PLACEMENT_TILES_IDS.has(i)).toBe(GENERAL_PLACEMENT_TILES_SHEETS.has(sh));
      expect(PAINTINGS_IDS.has(i)).toBe(PAINTINGS_SHEETS.has(sh));
      expect(PREVENTS_SLOPES_DURING_GENERATION_IDS.has(i)).toBe(PREVENTS_SLOPES_DURING_GENERATION_SHEETS.has(sh));
      expect(IS_A_MECHANISM_IDS.has(i)).toBe(IS_A_MECHANISM_SHEETS.has(sh));
      expect(IS_A_TRIGGER_IDS.has(i)).toBe(IS_A_TRIGGER_SHEETS.has(sh));
      expect(IGNORE_WHEN_VALIDATING_TRAPS_IDS.has(i)).toBe(IGNORE_WHEN_VALIDATING_TRAPS_SHEETS.has(sh));
    }
  });
  it('域判别(错域回退即红):NonSolid/SLOWLY/GenPlace/Paintings/PrevSlopes/Mech/Trig/IgnoreValid 八组掩蔽对', () => {
    // NonSolid: 内部 131(sheet 477 高尔夫草)∉IDS;sheet 131(魔灯)∈SHEETS;真身内部 334 ∈ IDS
    expect(TILE_DEFS[131]?.vanilla?.sheet).toBe(477);
    expect(NON_SOLID_SAVE_SLOPES_SHEETS.has(131)).toBe(true);
    expect(NON_SOLID_SAVE_SLOPES_IDS.has(131)).toBe(false);     // 错域顶替即红
    expect(NON_SOLID_SAVE_SLOPES_IDS.has(334)).toBe(true);
    // SLOWLY: 内部 529(sheet 427 竞技平台)∉IDS;sheet 529 ∈ SHEETS;真身内部 206 ∈ IDS
    expect(TILE_DEFS[529]?.vanilla?.sheet).toBe(427);
    expect(SLOWLY_DIES_IN_WATER_SHEETS.has(529)).toBe(true);
    expect(SLOWLY_DIES_IN_WATER_IDS.has(529)).toBe(false);
    expect(SLOWLY_DIES_IN_WATER_IDS.has(206)).toBe(true);
    // GenPlace: 内部 225(sheet 305)∉IDS;sheet 225(丛林蜥蜴砖)∈SHEETS;真身内部 94 ∈ IDS
    expect(TILE_DEFS[225]?.vanilla?.sheet).toBe(305);
    expect(GENERAL_PLACEMENT_TILES_SHEETS.has(225)).toBe(true);
    expect(GENERAL_PLACEMENT_TILES_IDS.has(225)).toBe(false);
    expect(GENERAL_PLACEMENT_TILES_IDS.has(94)).toBe(true);
    // Paintings: 内部 245(sheet 387 高门)∉IDS;sheet 245 ∈ SHEETS;真身内部 172 ∈ IDS
    expect(TILE_DEFS[245]?.vanilla?.sheet).toBe(387);
    expect(PAINTINGS_SHEETS.has(245)).toBe(true);
    expect(PAINTINGS_IDS.has(245)).toBe(false);
    expect(PAINTINGS_IDS.has(172)).toBe(true);
    // PrevSlopes: 内部 48(sheet 162 薄冰)∉IDS;sheet 48(尖刺)∈SHEETS;真身内部 102 ∈ IDS
    expect(TILE_DEFS[48]?.vanilla?.sheet).toBe(162);
    expect(PREVENTS_SLOPES_DURING_GENERATION_SHEETS.has(48)).toBe(true);
    expect(PREVENTS_SLOPES_DURING_GENERATION_IDS.has(48)).toBe(false);
    expect(PREVENTS_SLOPES_DURING_GENERATION_IDS.has(102)).toBe(true);
    // Mechanism: 内部 137(sheet 398 腐化沙岩)∉IDS;sheet 137(雕像)∈SHEETS;真身内部 119 ∈ IDS;
    //   内部 4(sheet 7 铜矿)∉IDS 而 sheet 4(火把)∈SHEETS——§1 COPPER/TORCH 双掩蔽
    expect(TILE_DEFS[137]?.vanilla?.sheet).toBe(398);
    expect(IS_A_MECHANISM_SHEETS.has(137)).toBe(true);
    expect(IS_A_MECHANISM_IDS.has(137)).toBe(false);
    expect(IS_A_MECHANISM_IDS.has(119)).toBe(true);
    expect(TILE_DEFS[4]?.vanilla?.sheet).toBe(7);
    expect(IS_A_MECHANISM_SHEETS.has(4)).toBe(true);
    expect(IS_A_MECHANISM_IDS.has(4)).toBe(false);
    expect(IS_A_MECHANISM_IDS.has(12)).toBe(true);
    // Trig: 内部 135(sheet 371)∉IDS;sheet 135(压力板)∈SHEETS;真身内部 163 ∈ IDS;
    //   内部 441(sheet 238)∉IDS;sheet 441(假箱)∈SHEETS;真身内部 375 ∈ IDS
    expect(TILE_DEFS[135]?.vanilla?.sheet).toBe(371);
    expect(IS_A_TRIGGER_SHEETS.has(135)).toBe(true);
    expect(IS_A_TRIGGER_IDS.has(135)).toBe(false);
    expect(IS_A_TRIGGER_IDS.has(163)).toBe(true);
    expect(TILE_DEFS[441]?.vanilla?.sheet).toBe(238);
    expect(IS_A_TRIGGER_SHEETS.has(441)).toBe(true);
    expect(IS_A_TRIGGER_IDS.has(441)).toBe(false);
    expect(IS_A_TRIGGER_IDS.has(375)).toBe(true);
    // IgnoreValid: 内部 4(sheet 7)∉IDS;sheet 4 ∈ SHEETS;真身内部 12 ∈ IDS
    expect(IGNORE_WHEN_VALIDATING_TRAPS_SHEETS.has(4)).toBe(true);
    expect(IGNORE_WHEN_VALIDATING_TRAPS_IDS.has(4)).toBe(false);
    expect(IGNORE_WHEN_VALIDATING_TRAPS_IDS.has(12)).toBe(true);
  });
  it('转出口别名同源锁:SITTABLE/NPC_STEPUP/TILE_HAS_OUTLINES/CAMPFIRE/COUNTS_WATER/DISABLE_SI 六名一值源', () => {
    // 消费面导出名仍从原文件出口(PlayerSitting/TileCollision/TileHighlight/SmartInteractTiles)
    // ——此处钉 data/tiles.ts 单源与消费面别名同对象,防转出口再立字面副本。
    expect(SITTABLE_SHEETS).toBe(CAN_BE_SAT_ON_FOR_PLAYERS_SHEETS);
    expect(NPC_STEPUP_IGNORE).toBe(IGNORED_BY_NPC_STEP_UP_SHEETS);
    expect(TILE_HAS_OUTLINES).toBe(HAS_OUTLINES_SHEETS);
    expect(CAMPFIRE_TILES).toBe(CAMPFIRES_SHEETS);
    expect(COUNTS_AS_WATER_FOR_CRAFTING).toBe(COUNTS_AS_WATER_FOR_CRAFTING_SHEETS);
    expect(DISABLE_SMART_INTERACT).toBe(DISABLE_SMART_INTERACT_SHEETS);
    expect(TORCHES_SHEETS.has(4)).toBe(true);
    expect(AVOIDED_BY_NPCS_SHEETS.size).toBe(25);
  });
  describe('§6k 结构锁:BJ221 收编副本禁复活（字节签名禁入+防空洞正锚）', () => {
    const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    const F = (name: string) => new RegExp(`\\b${name}\\s*=\\s*new\\s+Set`);
    const S256LIT = (name: string) => new RegExp(`\\b${name}\\s*=\\s*S256\\(\\s*\\[\\s*\\d`);
    const IDSV = (name: string) => new RegExp(`\\b${name}\\s*=\\s*idsByVanillaSheet\\(`);
    const OBJ = (name: string) => new RegExp(`\\b${name}\\s*:\\s*idsByVanillaSheet\\(`);
    const FORBIDDEN: Array<[string, RegExp, string]> = [
      // 分帧域(4+12 S256)
      ['src/render/TileMergeFamily.ts', F('DIRT'), 'SETS_DIRT_SHEETS'],
      ['src/render/TileMergeFamily.ts', F('MUD'), 'SETS_MUD_SHEETS'],
      ['src/render/TileMergeFamily.ts', F('ASH'), 'SETS_ASH_SHEETS'],
      ['src/render/TileMergeFamily.ts', F('DONT_MERGE_SNOW'), 'DONT_MERGE_WITH_SNOW_SHEETS'],
      ['src/render/VanillaFraming.ts', S256LIT('CHECKS_FOR_MERGE'), 'S256([...CHECKS_FOR_MERGE_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('FORCED_DIRT_MERGING'), 'S256([...FORCED_DIRT_MERGING_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('MERGES_WITH_CLOUDS'), 'S256([...MERGES_WITH_CLOUDS_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('DONT_MERGE_WITH_SNOW'), 'S256([...DONT_MERGE_WITH_SNOW_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_DIRT'), 'S256([...SETS_DIRT_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_MUD'), 'S256([...SETS_MUD_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_ASH'), 'S256([...SETS_ASH_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('GRASS_SPECIAL'), 'S256([...GRASS_SPECIAL_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('JUNGLE_SPECIAL'), 'S256([...JUNGLE_SPECIAL_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('HELL_SPECIAL'), 'S256([...HELL_SPECIAL_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('HAS_SLOPE_FRAMES'), 'S256([...HAS_SLOPE_FRAMES_SHEETS])'],
      ['src/render/VanillaFraming.ts', S256LIT('SETS_PLATFORMS'), 'S256([...PLATFORMS_SHEETS])'],
      // 坡面渲染域(4+1 内联)
      ['src/render/VanillaTiler.ts', F('DONT_DRAW_SLOPES'), 'DONT_DRAW_TILE_SLOPES_SHEETS'],
      ['src/render/VanillaTiler.ts', F('HAS_SLOPE_FRAMES'), 'HAS_SLOPE_FRAMES_SHEETS'],
      ['src/render/VanillaTiler.ts', F('IGNORES_NEARBY_HALFBRICK'), 'IGNORES_NEARBY_HALFBRICKS_SHEETS'],
      ['src/render/VanillaTiler.ts', F('SMOOTH_BORDER'), 'ALL_BLOCKS_WITH_SMOOTH_BORDERS_SHEETS'],
      ['src/render/VanillaTiler.ts', F('BLOCKS_STAIRS_SHEETS'), 'BLOCKS_STAIRS_SHEETS import'],
      // 存档/生成域
      ['src/world/gen/vanilla/TileRunner.ts', /\[\s*131,\s*351,\s*336/, 'NON_SOLID_SAVE_SLOPES_SHEETS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', IDSV('NON_SOLID_SAVE_SLOPES'), 'NON_SOLID_SAVE_SLOPES_IDS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', IDSV('SLOWLY_DIES_IN_WATER'), 'SLOWLY_DIES_IN_WATER_IDS'],
      ['src/world/gen/vanilla/QuickCleanupPass.ts', IDSV('NON_SOLID_SAVE_SLOPES'), 'NON_SOLID_SAVE_SLOPES_IDS'],
      ['src/wld/WldImport.ts', F('NON_SOLID_SAVE_SLOPES'), 'NON_SOLID_SAVE_SLOPES_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('SPREAD_OVERGROUND'), 'SPREAD_OVERGROUND_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('SPREAD_UNDERGROUND'), 'SPREAD_UNDERGROUND_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('CAN_GROW_SHARDS'), 'CAN_GROW_CRYSTAL_SHARDS_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', F('SLOWLY_DIES_IN_WATER'), 'SLOWLY_DIES_IN_WATER_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', IDSV('PAINTINGS'), 'PAINTINGS_IDS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', OBJ('PREVENTS_SLOPES'), 'PREVENTS_SLOPES_DURING_GENERATION_IDS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', IDSV('PLATFORMS_4X2'), 'PLATFORMS_IDS'],
      ['src/world/gen/vanilla/TrackPass.ts', IDSV('PLACEMENT_BLOCKED'), 'GENERAL_PLACEMENT_TILES_IDS'],
      ['src/world/gen/vanilla/GenState.ts', F('GENERAL_PLACEMENT_SHEETS'), 'GENERAL_PLACEMENT_TILES_SHEETS'],
      // NPC/房屋/坐席/接线
      ['src/entities/TownNPC.ts', F('AVOIDED_BY_NPC_SHEETS'), 'AVOIDED_BY_NPCS_SHEETS'],
      ['src/entities/TownNPC.ts', F('INTERACTABLE_BY_NPC_SHEETS'), 'INTERACTABLE_BY_NPCS_SHEETS'],
      ['src/world/Housing.ts', F('HOUSING_WALL_TILES'), 'HOUSING_WALLS_SHEETS'],
      ['src/world/Housing.ts', F('IGNORED_IN_HOUSE_SCORE'), 'IGNORED_IN_HOUSE_SCORE_SHEETS'],
      ['src/ui/itemTooltip.ts', F('WIRE_MECHANISM_TILES'), 'IS_A_MECHANISM_SHEETS'],
      ['src/ui/itemTooltip.ts', F('WIRE_TRIGGER_TILES'), 'IS_A_TRIGGER_SHEETS'],
      ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', IDSV('IS_A_MECHANISM'), 'IS_A_MECHANISM_IDS'],
      ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', IDSV('IS_A_TRIGGER'), 'IS_A_TRIGGER_IDS'],
      ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', IDSV('IGNORE_WHEN_VALIDATING'), 'IGNORE_WHEN_VALIDATING_TRAPS_IDS'],
      // 照明/交互/高亮/杂项
      ['src/lighting/lightTables.ts', F('ALLOW_LIGHT_IN_WATER_SHEETS'), 'data/tiles.ts 单源(TileLightScanner 直引)'],
      ['src/physics/TileCollision.ts', F('NPC_STEPUP_IGNORE'), 'IGNORED_BY_NPC_STEP_UP_SHEETS'],
      ['src/player/PlayerSitting.ts', F('SITTABLE_SHEETS'), 'CAN_BE_SAT_ON_FOR_PLAYERS_SHEETS'],
      ['src/core/SmartInteractTiles.ts', F('CAMPFIRE_TILES'), 'CAMPFIRES_SHEETS'],
      ['src/core/SmartInteractTiles.ts', F('COUNTS_AS_WATER_FOR_CRAFTING'), 'COUNTS_AS_WATER_FOR_CRAFTING_SHEETS'],
      ['src/core/SmartInteractTiles.ts', F('DISABLE_SMART_INTERACT'), 'DISABLE_SMART_INTERACT_SHEETS'],
      ['src/render/TileHighlight.ts', F('TILE_HAS_OUTLINES'), 'HAS_OUTLINES_SHEETS'],
      ['src/player/SmartCursor.ts', F('TORCH_TILES'), 'TORCHES_SHEETS'],
      ['src/core/Game.ts', F('NATURE_FLIES'), 'SPAWNS_NATURE_FLIES_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', F('LAVA_BURN_TO_DIRT'), 'LAVA_BURN_TO_DIRT_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', /new Set\(\s*\[\s*88\s*\]\)/, 'BASIC_DRESSER_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('BASIC_DRESSER_S'), 'BASIC_DRESSER_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', F('BASIC_CHEST_FAKE_S'), 'BASIC_CHEST_FAKE_SHEETS'],
    ];
    const REQUIRED: Array<[string, string]> = [
      ['src/render/TileMergeFamily.ts', 'SETS_DIRT_SHEETS'],
      ['src/render/TileMergeFamily.ts', 'DONT_MERGE_WITH_SNOW_SHEETS'],
      ['src/render/VanillaFraming.ts', 'CHECKS_FOR_MERGE_SHEETS'],
      ['src/render/VanillaFraming.ts', 'GRASS_SPECIAL_SHEETS'],
      ['src/render/VanillaFraming.ts', 'HAS_SLOPE_FRAMES_SHEETS'],
      ['src/render/VanillaFraming.ts', 'PLATFORMS_SHEETS'],
      ['src/render/VanillaTiler.ts', 'BLOCKS_STAIRS_SHEETS'],
      ['src/render/VanillaTiler.ts', 'ALL_BLOCKS_WITH_SMOOTH_BORDERS_SHEETS'],
      ['src/render/VanillaTiler.ts', 'DONT_DRAW_TILE_SLOPES_SHEETS'],
      ['src/world/gen/vanilla/TileRunner.ts', 'NON_SOLID_SAVE_SLOPES_SHEETS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', 'NON_SOLID_SAVE_SLOPES_IDS'],
      ['src/world/gen/vanilla/TileCleanupPass.ts', 'SLOWLY_DIES_IN_WATER_IDS'],
      ['src/world/gen/vanilla/QuickCleanupPass.ts', 'NON_SOLID_SAVE_SLOPES_IDS'],
      ['src/wld/WldImport.ts', 'NON_SOLID_SAVE_SLOPES_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'SPREAD_OVERGROUND_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'SLOWLY_DIES_IN_WATER_SHEETS'],
      ['src/world/evolution/WorldEvolution.ts', 'CAN_GROW_CRYSTAL_SHARDS_SHEETS'],
      ['src/world/gen/vanilla/FinalCleanupPass.ts', 'PAINTINGS_IDS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'PREVENTS_SLOPES_DURING_GENERATION_IDS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'PLATFORMS_IDS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'BASIC_DRESSER_SHEETS'],
      ['src/world/gen/vanilla/HalfBrickPass.ts', 'BASIC_CHEST_FAKE_SHEETS'],
      ['src/world/gen/vanilla/TrackPass.ts', 'GENERAL_PLACEMENT_TILES_IDS'],
      ['src/world/gen/vanilla/GenState.ts', 'GENERAL_PLACEMENT_TILES_SHEETS'],
      ['src/entities/TownNPC.ts', 'AVOIDED_BY_NPCS_SHEETS'],
      ['src/entities/TownNPC.ts', 'INTERACTABLE_BY_NPCS_SHEETS'],
      ['src/world/Housing.ts', 'HOUSING_WALLS_SHEETS'],
      ['src/world/Housing.ts', 'IGNORED_IN_HOUSE_SCORE_SHEETS'],
      ['src/ui/itemTooltip.ts', 'IS_A_MECHANISM_SHEETS'],
      ['src/ui/itemTooltip.ts', 'IS_A_TRIGGER_SHEETS'],
      ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', 'IS_A_MECHANISM_IDS'],
      ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', 'IS_A_TRIGGER_IDS'],
      ['src/world/gen/vanilla/BrokenTrapCleanupPass.ts', 'IGNORE_WHEN_VALIDATING_TRAPS_IDS'],
      ['src/lighting/TileLightScanner.ts', 'ALLOW_LIGHT_IN_WATER_SHEETS'],
      ['src/physics/TileCollision.ts', 'IGNORED_BY_NPC_STEP_UP_SHEETS'],
      ['src/player/PlayerSitting.ts', 'CAN_BE_SAT_ON_FOR_PLAYERS_SHEETS'],
      ['src/core/SmartInteractTiles.ts', 'CAMPFIRES_SHEETS'],
      ['src/core/SmartInteractTiles.ts', 'COUNTS_AS_WATER_FOR_CRAFTING_SHEETS'],
      ['src/core/SmartInteractTiles.ts', 'DISABLE_SMART_INTERACT_SHEETS'],
      ['src/render/TileHighlight.ts', 'HAS_OUTLINES_SHEETS'],
      ['src/player/SmartCursor.ts', 'TORCHES_SHEETS'],
      ['src/core/Game.ts', 'SPAWNS_NATURE_FLIES_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', 'LAVA_BURN_TO_DIRT_SHEETS'],
      ['src/world/liquid/LiquidSim.ts', 'BASIC_DRESSER_SHEETS'],
    ];
    it('禁复活:BJ221 收编副本字面定义签名禁入（单源别名/拷贝转出口不受影响）', () => {
      for (const [file, sig] of FORBIDDEN) {
        expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
      }
    });
    it('防空洞正锚:每个收编文件必须仍消费 data/tiles.ts 单源名', () => {
      for (const [file, anchor] of REQUIRED) {
        expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
      }
    });
  });
});

// ★BJ263 批变异证红记录(2026-09-22,均在验证后还原):
//   M30 NOT_CLEARABLE_SHEETS 摘 237(字面缺值) → §6l 金标红;
//   M31 NOT_CLEARABLE_IDS 错域回退(new Set(NOT_CLEARABLE_SHEETS) 裸值顶替,
//       内部 41(sheet63 宝石)幻影入表) → §6l 镜像+域判别两红+TileRunner 别名红;
//   M32 Wiring 再立 const PREVENTS_ACTUATION_UNDER = new Set([...]) 字面副本 → §6l 结构锁红。
describe('§6l BJ263 收编金标:TileID.cs 第七收编批(块交换/替换破碎/活火/豁免/站点/致动/不可清 8 表)', () => {
  // 2026-09-22 定谳:红蓝 S2 第 7 批 8 面——逐值对拍 Terarria1457/Terraria.ID/TileID.cs
  //   亲读终值全等(1458 同 8 行号同值零增量抽核)。全部 sheet 域消费面:Game
  //   blockSwap(:1550-1588 五表)/craftingGrid:142/Wiring:36+devices:130/MushroomPass:104。
  //   仅 NOT_CLEARABLE 带 IDS 镜像(TileRunner idsByVanillaSheet 内部域六 pass 副本收编
  //   改指,TILE_BY_KEY≡注册序已核无重键);其余七表无内部域消费面不设镜像(§6k 惯例)。
  //   ★S2 锚勘误:MushroomPass NOT_CLEARABLE 原记 TileID.cs「:279」系与
  //   DoesNotOpenCraftingMenuOnInteract 撞号——真锚=:321 CreateBoolSet(true,…) 反集
  //   例外清单 17 值(默认 true 全可清,例外=false)。旧注「项目侧近似」同步勘误。
  const A = (x: ReadonlySet<number>) => [...x].sort((a, b) => a - b);
  it('块交换域:DoesntGetReplaced(:235) 8 值+IgnoresReplacementDropCheck(:217) 2 值', () => {
    expect(A(DOESNT_GET_REPLACED_WITH_TILE_REPLACEMENT_SHEETS)).toEqual(
      [58, 127, 171, 225, 423, 481, 482, 483]);
    expect(A(IGNORES_TILE_REPLACEMENT_DROP_CHECK_WHEN_BEING_PLACED_SHEETS)).toEqual([30, 158]);
  });
  it('ReplaceTile 邻清域:BreakUp(:245) 36 值+BreakDown(:247) 9 值', () => {
    expect(REPLACE_TILE_BREAK_UP_SHEETS.size).toBe(36);
    expect(A(REPLACE_TILE_BREAK_UP_SHEETS)).toEqual(
      [3, 20, 24, 27, 61, 71, 73, 74, 82, 83, 84, 110, 113, 185, 186, 187, 201, 227,
        233, 236, 238, 254, 484, 485, 529, 530, 549, 590, 595, 615, 624, 637, 700, 702, 703, 705]);
    expect(A(REPLACE_TILE_BREAK_DOWN_SHEETS)).toEqual([52, 62, 115, 205, 382, 444, 528, 636, 638]);
  });
  it('活火/站点/致动:IsLivingFire(:241) 6 值+DoesNotOpenCraftingMenu(:279) 2 值+PreventsActuationUnder(:313) 11 值', () => {
    expect(A(LIVING_FIRE_SHEETS)).toEqual([336, 340, 341, 342, 343, 344]);
    expect(A(DOES_NOT_OPEN_CRAFTING_MENU_ON_INTERACT_SHEETS)).toEqual([207, 215]);
    expect(A(PREVENTS_ACTUATION_UNDER_SHEETS)).toEqual(
      [21, 26, 77, 88, 237, 441, 467, 468, 470, 475, 597]);
  });
  it('NOT_CLEARABLE(:321 反集例外清单) 17 值+IDS 镜像 17 id(sheet 41→内部 51 全表平移)', () => {
    expect(A(NOT_CLEARABLE_SHEETS)).toEqual(
      [41, 43, 44, 226, 237, 367, 368, 396, 397, 398, 399, 400, 401, 404, 481, 482, 483]);
    expect(NOT_CLEARABLE_IDS.size).toBe(17);
    expect(A(NOT_CLEARABLE_IDS)).toEqual(
      [51, 52, 53, 86, 87, 88, 95, 137, 242, 282, 292, 306, 327, 328, 392, 514, 515]);
    expect(NOT_CLEARABLE).toBe(NOT_CLEARABLE_IDS);   // TileRunner 别名同源锁(六 pass 消费面)
  });
  it('内部域镜像:全 defs 双域平移性质(键域契约无漏无多)', () => {
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sh = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
      expect(NOT_CLEARABLE_IDS.has(i)).toBe(NOT_CLEARABLE_SHEETS.has(sh));
    }
  });
  it('域判别(错域回退即红):NOT_CLEARABLE sheet 41(地牢砖)↔内部 41(宝石 sheet63)掩蔽对', () => {
    expect(TILE_DEFS[41]?.vanilla?.sheet).toBe(63);   // 内部 41=红玉宝石,非地牢砖
    expect(NOT_CLEARABLE_SHEETS.has(41)).toBe(true);  // sheet 41=地牢砖 ∈ SHEETS
    expect(NOT_CLEARABLE_IDS.has(41)).toBe(false);    // 错域顶替即红
    expect(NOT_CLEARABLE_IDS.has(51)).toBe(true);     // 真身内部 51
    // 反向掩蔽:内部 237(sheet405 太阳花板)∉IDS;sheet 237(陨石)∈SHEETS
    expect(TILE_DEFS[237]?.vanilla?.sheet).toBe(405);
    expect(NOT_CLEARABLE_SHEETS.has(237)).toBe(true);
    expect(NOT_CLEARABLE_IDS.has(237)).toBe(false);
  });
  it('转出口别名同源锁:craftingGrid DOES_NOT_OPEN_CRAFTING_MENU/Wiring PREVENTS_ACTUATION_UNDER', () => {
    expect(DOES_NOT_OPEN_CRAFTING_MENU).toBe(DOES_NOT_OPEN_CRAFTING_MENU_ON_INTERACT_SHEETS);
    expect(PREVENTS_ACTUATION_UNDER).toBe(PREVENTS_ACTUATION_UNDER_SHEETS);
  });
  describe('§6l 结构锁:BJ263 收编副本禁复活（字节签名禁入+防空洞正锚）', () => {
    const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    const F = (name: string) => new RegExp(`\\b${name}\\s*=\\s*new\\s+Set`);
    const FORBIDDEN: Array<[string, RegExp, string]> = [
      ['src/core/Game.ts', F('BLOCK_SWAP_DOESNT_GET_REPLACED_SHEETS'), 'DOESNT_GET_REPLACED_WITH_TILE_REPLACEMENT_SHEETS'],
      ['src/core/Game.ts', F('REPLACE_TILE_BREAK_UP_SHEETS'), 'REPLACE_TILE_BREAK_UP_SHEETS import'],
      ['src/core/Game.ts', F('REPLACE_TILE_BREAK_DOWN_SHEETS'), 'REPLACE_TILE_BREAK_DOWN_SHEETS import'],
      ['src/core/Game.ts', F('LIVING_FIRE_SHEETS'), 'LIVING_FIRE_SHEETS import'],
      ['src/core/Game.ts', F('IGNORES_REPLACEMENT_DROP_CHECK_SHEETS'), 'IGNORES_TILE_REPLACEMENT_DROP_CHECK_WHEN_BEING_PLACED_SHEETS'],
      ['src/ui/craftingGrid.ts', F('DOES_NOT_OPEN_CRAFTING_MENU'), 'DOES_NOT_OPEN_CRAFTING_MENU_ON_INTERACT_SHEETS'],
      ['src/world/Wiring.ts', F('PREVENTS_ACTUATION_UNDER'), 'PREVENTS_ACTUATION_UNDER_SHEETS'],
      ['src/world/gen/vanilla/MushroomPass.ts', F('NOT_CLEARABLE'), 'NOT_CLEARABLE_SHEETS'],
      ['src/world/gen/vanilla/TileRunner.ts', /NOT_CLEARABLE\s*=\s*idsByVanillaSheet\(/, 'NOT_CLEARABLE_IDS'],
    ];
    const REQUIRED: Array<[string, string]> = [
      ['src/core/Game.ts', 'DOESNT_GET_REPLACED_WITH_TILE_REPLACEMENT_SHEETS'],
      ['src/core/Game.ts', 'REPLACE_TILE_BREAK_UP_SHEETS'],
      ['src/core/Game.ts', 'REPLACE_TILE_BREAK_DOWN_SHEETS'],
      ['src/core/Game.ts', 'LIVING_FIRE_SHEETS'],
      ['src/core/Game.ts', 'IGNORES_TILE_REPLACEMENT_DROP_CHECK_WHEN_BEING_PLACED_SHEETS'],
      ['src/ui/craftingGrid.ts', 'DOES_NOT_OPEN_CRAFTING_MENU_ON_INTERACT_SHEETS'],
      ['src/world/Wiring.ts', 'PREVENTS_ACTUATION_UNDER_SHEETS'],
      ['src/world/gen/vanilla/MushroomPass.ts', 'NOT_CLEARABLE_SHEETS'],
      ['src/world/gen/vanilla/TileRunner.ts', 'NOT_CLEARABLE_IDS'],
    ];
    it('禁复活:BJ263 收编副本字面定义签名禁入（单源别名/拷贝转出口不受影响）', () => {
      for (const [file, sig] of FORBIDDEN) {
        expect({ file, hit: sig.test(srcOf(file)) }).toEqual({ file, hit: false });
      }
    });
    it('防空洞正锚:每个收编文件必须仍消费 data/tiles.ts 单源名', () => {
      for (const [file, anchor] of REQUIRED) {
        expect({ file, has: srcOf(file).includes(anchor) }).toEqual({ file, has: true });
      }
    });
  });
});

// ============================== §6m BJ426-债A ==============================
// ★BJ426-债A(2026-10-01)IDG-T2 八处基线违例收编(T1 tile 错域普查登记债清偿):
//   T1 普查时 IDG-T2 基线红恰 8 处,逐处三态定谳(表定义域 vs 消费传参域+原版亲读)
//   ——零域错位真病/零死码:7 处=域一致消费面(T2 家清单陈旧,转正),1 处=守卫匹配伪报。
//     ① data/tiles.ts:1776 ALLOW_LIGHT_IN_WATER_SHEETS 定义家(BJ221 已迁单源,
//       lightTables.ts 本地副本拆除,唯二消费 TileLightScanner:752 sheet 域)→家清单补定义家;
//     ② world/Door.ts:355 foldRowBlocked TILE_CUT∪IS_A_DRIP 拒开门(cellSheet 平移
//       sheet 域,≡WorldGen.cs:52001 `!tileCut && !IsADripTile` 折翼行门)→转正;
//     ③ world/Door.ts:465 开臂砍切(≡WorldGen.cs:52013-52019 `active&&(tileCut∥drip)
//       →KillTile`)→转正(②③同批);
//     ④ render/VanillaFraming.ts:83 SETS_ORE=S256([...ORE_SHEETS]) 构建期 sheet 键 LUT
//       (facade `Ore:(t)=>SETS_ORE[t]`,t=原版 tile.type;TileID.cs:403 §6h 金标已锁)→转正;
//     ⑤ render/VanillaFraming.ts:84 SETS_PLATFORMS=S256([...PLATFORMS_SHEETS]) 同构
//       (:243;§6k REQUIRED 已有本文件 PLATFORMS_SHEETS 锚)→转正;
//     ⑥ core/Game.ts:1584 anchorSolidBottom 顶锚 !NotReallySolid 臂
//       (`NOT_REALLY_SOLID_SHEETS.has(d.vanilla?.sheet ?? -1)`;TileID.cs:359 §6h 金标)→转正;
//     ⑦ entities/ClingerStaffWallProj.ts:68 CLINGER_WALL_STOP_SHEETS=[...PLATFORMS,380]
//       停行集(sheetAt sheet 域消费,≡Player.cs:49110-49117 弹482 发射侧下扫
//       `Platforms[t]∥t==380`;行为面 tests/bj286-clinger-staff-wall §e 已锁 380)→转正;
//     ⑧ world/Housing.ts:19/286「ORE_SHEETS 跨文件漏出」=守卫伪报——IGNORED_IN_HOUSE_
//       SCORE_SHEETS 超名子串(SC|ORE_SHEETS);词边界 grep 全文件零 ORE_SHEETS,其真实
//       消费面 IGNORED_IN_HOUSE_SCORE_SHEETS 本就是 BJ221 收编单源(§6k REQUIRED 在锚)
//       →守卫 T2 改词边界匹配 findNameBounded,Housing.ts 零改动。
//   收编面=tools/id-domain-guard.mjs(T_SHEET_TABLES 六表家清单+T2 词边界)+
//   §6e/§6h REQUIRED 转正面入锚;旧行为对拍=守卫修前恰 8 红(7 实+1 伪),修后全绿
//   (tests/id-domain-guard.test.ts)。
// ★变异证红记录(2026-10-01,均在验证后逐字节还原+sha256 对拍):
//   M42 守卫 TILE_CUT_SHEETS 家清单摘 world/Door.ts → tests/id-domain-guard.test.ts
//       IDG-T2 红(转正面失效即红);
//   M43 ClingerStaffWallProj 停行集摘 380 → §6m 消费面锚红+tests/bj286-clinger-staff-wall
//       §e(380 停行)行为红;
//   M44 Door.ts cellSheet 换向内部域(st.get 直返,BJ154 同款危险面) → §6m 域判别锚红
//       +tests/bj324-trapdoor-shift-vanilla 折翼行门行为红。
describe('§6m BJ426-债A 收编:IDG-T2 八处基线违例转正（家清单+词边界+消费面域判别）', () => {
  const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
  it('T2 词边界判别:超名子串(SCORE_SHEETS 判例)不误报,整名漏出必报', () => {
    // 伪报面:Housing.ts 消费的是 IGNORED_IN_HOUSE_SCORE_SHEETS(单源在锚),非 ORE_SHEETS
    expect(findNameBounded(['const IGNORED_IN_HOUSE_SCORE = IGNORED_IN_HOUSE_SCORE_SHEETS;'], 'ORE_SHEETS')).toEqual([]);
    expect(findNameBounded(['import { IGNORED_IN_HOUSE_SCORE_SHEETS } from "../data/tiles";'], 'ORE_SHEETS')).toEqual([]);
    // 真漏出面仍须红(守卫 T2 主齿不钝)
    expect(findNameBounded(['import { ORE_SHEETS } from "../data/tiles";'], 'ORE_SHEETS').length).toBe(1);
    expect(findNameBounded(['if (ORE_SHEETS.has(sh)) kill();'], 'ORE_SHEETS').length).toBe(1);
    expect(findNameBounded(['export const ORE_SHEETS2 = null;'], 'ORE_SHEETS')).toEqual([]);
  });
  it('守卫 T2 基线清零:八处收编后 IDG-T2 零违例(其余规则面由 id-domain-guard.test 全绿闸承责)', () => {
    expect(auditIdDomains().filter((v: { rule: string }) => v.rule === 'IDG-T2')).toEqual([]);
  });
  it('消费面域判别锚:五处转正面在盘上仍以 sheet 域消费(被换向内部域/拆除即红)', () => {
    // ⑥ Game.ts:1584——锚串内嵌 d.vanilla?.sheet=域证据
    expect(srcOf('src/core/Game.ts')).toContain('NOT_REALLY_SOLID_SHEETS.has(d.vanilla?.sheet ?? -1)');
    // ②③ Door.ts——cellSheet 平移面+双表同臂原文
    const door = srcOf('src/world/Door.ts');
    expect(door).toContain('return TILE_DEFS[st.get(x, y)]?.vanilla?.sheet ?? -1;');
    expect(door).toContain('!TILE_CUT_SHEETS.has(sh) && !IS_A_DRIP_TILE_SHEETS.has(sh)');
    expect(door).toContain('if (TILE_CUT_SHEETS.has(sh) || IS_A_DRIP_TILE_SHEETS.has(sh)) st.setTile(cx, cy, 0)');
    // ④⑤ VanillaFraming——构建期 spread 单源(sheet 键 LUT)
    const vf = srcOf('src/render/VanillaFraming.ts');
    expect(vf).toContain('const SETS_ORE = S256([...ORE_SHEETS])');
    expect(vf).toContain('const SETS_PLATFORMS = S256([...PLATFORMS_SHEETS])');
    // ⑦ ClingerStaffWallProj——停行集原文+sheetAt 消费面
    const cs = srcOf('src/entities/ClingerStaffWallProj.ts');
    expect(cs).toContain('const CLINGER_WALL_STOP_SHEETS = new Set<number>([...PLATFORMS_SHEETS, 380]);');
    expect(cs).toContain('CLINGER_WALL_STOP_SHEETS.has(s.sheetAt(tileX, row))');
  });
  it('域判别(∪ 面不串域):380 平底花箱∈ClingerWallStop 而 ∉ PLATFORMS_SHEETS(七项平台族)', () => {
    expect(PLATFORMS_SHEETS.has(19)).toBe(true);      // 平台 sheet 真身(§6d 金标首项)
    expect(PLATFORMS_SHEETS.has(380)).toBe(false);    // 380=PlanterBox 非平台——∪ 前须补值
    expect(PLATFORMS_SHEETS.size).toBe(7);
  });
});
