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
} from '../src/data/tiles';
import { canPoundTile } from '../src/world/gen/vanilla/HalfBrickPass';
import { TILE_CUT } from '../src/core/Game';
import { grassParticleFold, GRASS_COUNTER_SHEETS } from '../src/core/Game';

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
