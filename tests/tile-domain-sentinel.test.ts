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
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { scanScene, ORE_FINDER_PRIORITY_SHEET } from '../src/world/SceneMetrics';
import {
  TILE_BY_KEY, TILE_DEFS, VANILLA_TILE_ID, TILE_INTERNAL_BY_SHEET,
  TILE_STABLE_OF_INTERNAL, TILE_INTERNAL_OF_STABLE, TILE_CUT_SHEETS,
  TILE_TABLE_SHEETS, doorSmashable, T,
  FORBIDS_SLOPING_SHEETS, FORBIDS_SLOPING_IDS, TILE_AXE_SHEETS, TILE_HAMMER_SHEETS,
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
