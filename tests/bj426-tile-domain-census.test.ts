// ★BJ426（2026-09-23）tile 错域雷全域定谳+落刀 —— bj154t「tile 错域=危险失效」同族第四案
// 背景:tile 双域（internal=TILE_DEFS 注册序/st.type[] vs sheet=原版 TileID/vanilla.sheet）
//   758/760 defs 两域数值错位（tests/tile-domain-sentinel §1 撞号率 752/761——错域几乎必
//   命中错项）。BJ426 揭出 Game.ts 岩浆门 TILE_SOLID_TOP_FAMILY（tid() 平移后的【内部
//   id 域】表,stats/TouchDamage.ts:57）被裸传 sheet 域实参 → 双向失效。本刀全域普查
//   （表×消费点×传参域三态）结果：
//   活错域 4 处（本刀落刀面）：
//     ① Game.ts liqGate tileSolid 短路（原 :26310）裸传 shL（sheet）——平台九件套全漏
//       （style13/43/47 lava-allowed 平台+花盆箱 380 误放行=原版 tileSolid 恒拒）+
//       sheet 11/132/442/529/535-539 撞号误命中（判值详 §3 注）；
//     ② Game.ts BP1 tileSolidCreate（原 :27206）裸传 shSolid（sheet）——平台九件套全漏
//       （KillGrassForSolids 对平台整缺=平台压草不转化;239/380 另漏 Unslope）+同批误命中；
//     ③④ TeleporterPass.canKillTile UP_PROTECT_FAMILY/IS_TREE_TRUNK（idsByVanillaSheet/
//       IS_A_TREE_TRUNK_IDS=内部域）裸传 sheetOf(...)（sheet）——两臂全死=传送器清场
//       CanKillTile 上邻箱/祭坛/树干保护整缺（原版 cs:62308-62316/:62278 type 对 type）。
//   域一致钉注释 2 处：DungeonPass DG_CLOUD_SHEETS（名带 SHEETS 实为 CLOUDS_IDS 内部域,
//     消费点 :781 传 st.type 一致）;SecretSeedDoEndsPass DESERT_CLOUD_IDS（名带 IDS 实为
//     CLOUDS_SHEETS sheet 域,消费点 :679/:1615 传 shOf/sh 一致,原注已钉）。
//   其余普查面（零活错域,§6 源锚+sentinel 网既有钉承载）：TILE_SOLID_TOP_FAMILY 七消费点
//     （TouchDamage:167/VanillaSpawner:309,326/Player:9657/Game:32098,32130 全 st.type 内部
//     域）;SOLID_LUT 全消费点;VANILLA_TILE_SOLID_TOP/vanillaTileSolidPure;VAN_TILE_SOLID_
//     EXTRA（sheet 域,13 消费点全 sheet/经 SHEET_OF_TYPE）;SOLID_TOP_SHEETS;PLATFORMS_
//     SHEETS;LAVA_DEATH_SHEETS（Game shL/LiquidSim bySheet 平移/FinishRemix sheetOf）;
//     TeleportSpotCheck lutFromSheets LUT 族;TOUCH_* 五表;VAN_TILE_SOLIDTOP_SHEET_SET;
//     TileCleanupPass/FinalSeedCleanupPass UP_PROTECT（sheet 域字面,sheet 消费一致）;
//     PilesPass SUP_CHECK2X2_FAMILY;WorldEvolution SNOW_FAMILY;GenSolid 三谓词。
// 分层钉法：数据域事实（§1-§2）+ 岩浆门源锚（§3）+ Game 壳行为面（§4-§5,sw-bp1 同款）
//   + TeleporterPass 源锚与死臂判别（§6）。禁读仓外反编译树——原版行号证据落源注释。
// ★变异证红记录（2026-09-23,均在验证后逐字节还原+sha256 对拍相等）：
//   M1 Game.ts liqGate 平移式回退 `TILE_SOLID_TOP_FAMILY.has(shL)` → §3 两红+
//      §4 平台 style13 岩浆判别红（3 red）;
//   M2 Game.ts BP1 平移式回退 `…has(shSolid)` → §3 两红+§5 漏判面/误判面双红+
//      tests/sw-bp1-composite-debts 结构锁红（5 red）;
//   M3 TeleporterPass 消费回退 `has(sh)` → §6 源锚红（1 red）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET, TILE_BY_KEY, IS_A_TREE_TRUNK_IDS, IS_A_TREE_TRUNK_SHEETS, CLOUDS_IDS } from '../src/data/tiles';
import { TILE_SOLID_TOP_FAMILY } from '../src/stats/TouchDamage';

const src = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

// 掩蔽对字面量（tests/tile-domain-sentinel §1 家法:九件套 sheet→internal 双域全错位）
const PLATFORM_SHEETS = [19, 239, 380, 427, 435, 436, 437, 438, 439] as const;
// sheet 域裸值撞号集 = TILE_SOLID_TOP_FAMILY 内部域成员的字面（误命中面）
const SHEET_COLLIDE_TRAP = [11, 132, 442, 529, 535, 536, 537, 538, 539] as const;

describe('§1 域事实:平台九件套两域全错位（本刀双失效的数值根基）', () => {
  it('TILE_SOLID_TOP_FAMILY（内部域）≡ 九 sheet 经 TILE_INTERNAL_BY_SHEET 的像（逐值钉死）', () => {
    const image = PLATFORM_SHEETS.map((s) => TILE_INTERNAL_BY_SHEET.get(s)!);
    expect([...TILE_SOLID_TOP_FAMILY].sort((a, b) => a - b)).toEqual([...image].sort((a, b) => a - b));
    expect(TILE_SOLID_TOP_FAMILY.size).toBe(9);
  });
  it('九 sheet 裸值全不在表内（漏判面根因）+ 撞号 sheet 裸值全在表内（误命中面根因）', () => {
    for (const s of PLATFORM_SHEETS) expect(TILE_SOLID_TOP_FAMILY.has(s)).toBe(false);
    for (const s of SHEET_COLLIDE_TRAP) expect(TILE_SOLID_TOP_FAMILY.has(s)).toBe(true);
    // 掩蔽对字面量（错域=命中错项的具象）:sheet 11=开门(solid:false)/132=拉杆/442=压力板
    // /529=海燕麦/538=瓢虫笼——裸传 sheet 时这些被误当平台;内部 11 才是真平台(sheet19)。
    expect(TILE_BY_KEY['platform']!).toBe(11);
    expect(TILE_DEFS[TILE_BY_KEY['platform']!].vanilla?.sheet).toBe(19);
    expect(TILE_DEFS[TILE_INTERNAL_BY_SHEET.get(11)!].vanilla?.sheet).toBe(11);   // 内部 11 真身=sheet 11 开门
  });
  it('平移契约（判别核心,全 762 defs 扫描）:查表前经 TILE_INTERNAL_BY_SHEET 平移 ⇒ 谓词恰对九 sheet 为真', () => {
    let hits = 0;
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sheet = TILE_DEFS[i]?.vanilla?.sheet;
      if (sheet === undefined) continue;
      const hit = TILE_SOLID_TOP_FAMILY.has(TILE_INTERNAL_BY_SHEET.get(sheet) ?? -1);
      expect(hit).toBe((PLATFORM_SHEETS as readonly number[]).includes(sheet));
      if (hit) hits++;
    }
    expect(hits).toBe(9);
  });
});

describe('§3 岩浆门/BP1 源锚（Game.ts 域平移钉死,错域回退即红）', () => {
  const game = src('../src/core/Game.ts');
  it('liqGate tileSolid 短路:内部域查表前必须平移（修复串在位+裸 sheet 串禁入）', () => {
    expect(game).toContain('TILE_SOLID_TOP_FAMILY.has(TILE_INTERNAL_BY_SHEET.get(shL) ?? -1)');
    expect(game).not.toContain('TILE_SOLID_TOP_FAMILY.has(shL)');
    expect(game).toContain('★BJ426（2026-09-23 域错位定谳+落刀）：TILE_SOLID_TOP_FAMILY 是 tid() 平移后的');
  });
  it('BP1 tileSolidCreate 同刀钉死（与 tests/sw-bp1 结构锁双持）', () => {
    expect(game).toContain('TILE_SOLID_TOP_FAMILY.has(TILE_INTERNAL_BY_SHEET.get(shSolid) ?? -1)');
    expect(game).not.toContain('TILE_SOLID_TOP_FAMILY.has(shSolid)');
  });
  it('域哨兵网:Game.ts 全部 TILE_SOLID_TOP_FAMILY.has(ARG) 实参必须是 st.type（内部域）或平移式', () => {
    const hits = [...game.matchAll(/TILE_SOLID_TOP_FAMILY\.has\(([^)]+)\)/g)].map((m) => m[1]);
    expect(hits.length).toBeGreaterThanOrEqual(4);   // 26310/27206 平移式 + 32098/32130 st.type
    for (const arg of hits) {
      expect({ arg, ok: arg.startsWith('st.type') || arg.startsWith('TILE_INTERNAL_BY_SHEET.get') })
        .toEqual({ arg, ok: true });
    }
  });
});

// ---- Game 壳（sw-bp1 同款:只接 tryPlace 消费面,余桩=空记录）----
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import type { TileStore } from '../src/world/TileStore';

const TILE = 16;
const STONE_T = TILE_BY_KEY['stone']!;
const GRASS_T = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 2);
const STONE_ITEM = ITEM_DEFS.find((d) => d && (d as unknown as { tile?: string }).tile === 'stone');
const PLAT13 = ITEM_DEFS.find((d) => d && (d as unknown as { tile?: string }).tile === 'platform'
  && (d as unknown as { placeStyle?: number }).placeStyle === 13);   // style13=LavaPlacement Allowed 档
const PLAT0 = ITEM_DEFS.find((d) => d && (d as unknown as { tile?: string }).tile === 'platform'
  && (d as unknown as { placeStyle?: number }).placeStyle === undefined);   // style0 基档 lava notAllowed

type Shell = { tryPlace(tx: number, ty: number, def: typeof ITEM_DEFS[number]): void };

function shell(w: World): Shell {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & Shell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = {};
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.remotePlayerProxies = [];
  g.smartCursor = { wanted: false, showing: false };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => {};
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    isGhostPhase: () => false,
    cx: 8 * TILE + 8, cy: 16 * TILE + 8, x: 8 * TILE + 2, y: 16 * TILE, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, dead: false, gfxOffY: 0,
    buffs: { has: () => false }, equipStats: {},
    placeSpeedTileRaw: () => 1,
    inv: {
      selected: 0,
      slots: [{ id: STONE_ITEM ? ITEM_DEFS.indexOf(STONE_ITEM) : 0, stack: 99 }],
      heldItem: () => (STONE_ITEM ? { id: ITEM_DEFS.indexOf(STONE_ITEM), stack: 99 } : null),
      removeAt: () => {},
      removeHeld: () => {},
    },
  } as unknown as Record<string, unknown>;
  return g;
}

function mkWorld(): { w: World; st: TileStore } {
  const w = new World(40, 40, 7, 'bj426');
  return { w, st: w.store as TileStore };
}

const sheetAt = (st: TileStore, x: number, y: number): number =>
  TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;

describe('§4 行为面:岩浆门平台漏判修复（tileSolid 短路=原版 IsBlockedByLava :41815 恒拒）', () => {
  it('★判别面:平台 style13（LavaPlacement=Allowed 档）入岩浆格 → 恒拒（tileSolid 短路在 per-style 档之前）', () => {
    expect(PLAT13).toBeTruthy();
    const { w, st } = mkWorld();
    st.setTileSilent(6, 20, STONE_T);                     // 左支撑
    st.setTileSilent(7, 21, STONE_T);                     // 下支撑
    const li = st.idx(7, 20);
    st.liquid[li] = 255; st.liquidType[li] = 2;           // 目标格=岩浆（liquidType LAVA=2）
    shell(w).tryPlace(7, 20, PLAT13!);
    expect(st.hasTile(7, 20)).toBe(false);                // 原版:tileSolid[19]=true 短路（旧刀漏判=会放进来）
  });
  it('控制组:同件入无液格 → 正常放置（门只对岩浆格生效）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(6, 20, STONE_T);
    st.setTileSilent(7, 21, STONE_T);
    shell(w).tryPlace(7, 20, PLAT13!);
    expect(st.hasTile(7, 20)).toBe(true);
    expect(sheetAt(st, 7, 20)).toBe(19);
  });
  it('控制组:style0 基档（lava notAllowed）入岩浆格 → 拒（per-style 臂,新旧同判非判别面）', () => {
    expect(PLAT0).toBeTruthy();
    const { w, st } = mkWorld();
    st.setTileSilent(6, 20, STONE_T);
    st.setTileSilent(7, 21, STONE_T);
    const li = st.idx(7, 20);
    st.liquid[li] = 255; st.liquidType[li] = 2;
    shell(w).tryPlace(7, 20, PLAT0!);
    expect(st.hasTile(7, 20)).toBe(false);
  });
  it('误命中面反例:开门(sheet11)/拉杆(sheet132)/压力板(sheet442)/瓢虫笼(sheet538) 平移后不在族内', () => {
    // 数据面反证（§1 平移契约已全扫,此处按 sheet 逐件钉死误命中清单）——
    // 岩浆门消费位行为差:132/442/538 liquidSpec lava=notAllowed、529∈LAVA_DEATH、
    // 11 被 gated 豁免 → 判值与旧路径同值（零行为差）,但机制域必须归位。
    for (const s of SHEET_COLLIDE_TRAP) {
      expect({ sheet: s, inFamily: TILE_SOLID_TOP_FAMILY.has(TILE_INTERNAL_BY_SHEET.get(s) ?? -1) })
        .toEqual({ sheet: s, inFamily: false });
    }
  });
});

describe('§5 行为面:BP1 tileSolidCreate 域修复（UnslopeForSolids 活性面）', () => {
  // 判值面预勘（勿臆测）：KillGrassForSolids 的 3×3 SolidTile 门含放置格本身——九件套
  // 全 tileSolidTop ⇒ SolidTile(放置格)=false ⇒ flag 必假（Game.ts :25726-25728 原注
  // 「平台影响被 3×3 SolidTile 门自然吸收」同理）⇒ 平台/花盆箱压草在【原版】也无转化,
  // 不可作判别面。真正的活判别面=UnslopeForSolids（:40848 只排 Platforms 集）:
  //   漏判面=239 矿锭/380 花盆箱（原版 tileSolid=true ∧ ∉Platforms ∧ 本仓 solid=false）
  //   误判面=132 拉杆/442 压力板/529 海燕麦/538 瓢虫笼/11 开门（solid=false,原版不进段）。
  it('★漏判面:矿锭(239)放置 → 上邻 bottomSlope 拍平（原版 tileSolid[239]=true ∧ ∉Platforms）', () => {
    const OREBAR = ITEM_DEFS.find((d) => d && (d as unknown as { tile?: string }).tile === 'v_239_ore_bars');
    expect(OREBAR).toBeTruthy();
    const { w, st } = mkWorld();
    st.setTileSilent(7, 21, STONE_T);                     // 下支撑（平地——坡面支锚定拒置,勿用）
    st.setTileSilent(7, 19, STONE_T);
    st.slope[st.idx(7, 19)] = 3;                          // 上邻 bottomSlope（:40863-40871 臂）
    shell(w).tryPlace(7, 20, OREBAR!);
    expect(st.hasTile(7, 20)).toBe(true);                 // 矿锭已放置
    expect(st.slope[st.idx(7, 19)]).toBe(0);              // 拍平（旧刀漏判=坡保持）
  });
  it('★误判面:压力板(442)放置 → 上邻坡【不】拍平（solid=false,原版 tileSolid[442]=false）', () => {
    const PAD = ITEM_DEFS.find((d) => d && (d as unknown as { tile?: string }).tile === 'v_442_projectilepressurepad');
    expect(PAD).toBeTruthy();
    const { w, st } = mkWorld();
    st.setTileSilent(7, 21, STONE_T);
    st.setTileSilent(7, 19, STONE_T);
    st.slope[st.idx(7, 19)] = 3;
    shell(w).tryPlace(7, 20, PAD!);
    expect(st.hasTile(7, 20)).toBe(true);                 // 压力板已放置
    expect(st.slope[st.idx(7, 19)]).toBe(3);              // 坡保持（旧刀 sheet 442 撞号误入族=会拍平）
  });
  it('控制组:平台(19)放置 → 坡不拍平（tileSolid=true 但 Platforms 集排 Unslope :40848）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(7, 21, STONE_T);
    st.setTileSilent(7, 19, STONE_T);
    st.slope[st.idx(7, 19)] = 3;
    shell(w).tryPlace(7, 20, PLAT0!);
    expect(st.hasTile(7, 20)).toBe(true);
    expect(st.slope[st.idx(7, 19)]).toBe(3);              // SpinSmartPlatform 专属域,Unslope 不排
  });
});

describe('§6 TeleporterPass canKillTile 域修复（UP_PROTECT/IS_TREE_TRUNK 内部域两臂复活）', () => {
  const tp = src('../src/world/gen/vanilla/TeleporterPass.ts');
  it('源锚:两表消费传内部 id（tUp）+ 裸 sheet 实参禁入;表定义保持单源内部域', () => {
    expect(tp).toContain('UP_PROTECT_FAMILY.has(tUp)');
    expect(tp).toContain('IS_TREE_TRUNK.has(tUp)');
    expect(tp).not.toContain('UP_PROTECT_FAMILY.has(sh)');
    expect(tp).not.toContain('IS_TREE_TRUNK.has(sh)');
    expect(tp).toContain('const UP_PROTECT_FAMILY = idsByVanillaSheet(21, 26, 72, 77, 88, 467, 488);');
    expect(tp).toContain('const IS_TREE_TRUNK = IS_A_TREE_TRUNK_IDS;');   // §6g 结构锁正锚同款
  });
  it('死臂判别（旧刀两臂恒假的数据证明）:七保护 sheet 与树干 sheet 裸值在内部域表中全落空', () => {
    // 旧代码 UP_PROTECT_FAMILY.has(sheetOf(...))——sheet 21/26/72/77/88/467/488 裸值
    // 与其内部像全错位（内部像=16/23/…），树干 sheet {5,72,583-589,596,616,634} 同理,
    //  ⇒ has(sh) 恒 false=保护臂整缺。修后按内部 id 命中。
    const protectSheets = [21, 26, 72, 77, 88, 467, 488];
    const protectImage = protectSheets.map((s) => TILE_INTERNAL_BY_SHEET.get(s)!);
    expect(protectImage).not.toContain(-1);
    for (const s of protectSheets) {
      expect(protectImage).not.toContain(s);              // 内部像≠自身（域错位）
      expect(IS_A_TREE_TRUNK_IDS.has(s)).toBe(false);     // 树干表吃 sheet 裸值恒空
    }
    for (const s of IS_A_TREE_TRUNK_SHEETS) {
      expect(IS_A_TREE_TRUNK_IDS.has(s)).toBe(false);     // 同判（树干 sheet 裸值全不在内部镜像）
    }
    expect(IS_A_TREE_TRUNK_IDS.size).toBe(13);            // 真镜像非空洞（sentinel §6f 同值）
  });
});

describe('§7 域一致别名钉注释（防回潮,消费面判值不变）', () => {
  it('DungeonPass DG_CLOUD_SHEETS:名带 SHEETS 实为 CLOUDS_IDS 内部域,消费点传 st.type 一致', () => {
    const dp = src('../src/world/gen/vanilla/DungeonPass.ts');
    expect(dp).toContain('const DG_CLOUD_SHEETS = CLOUDS_IDS;');
    expect(dp).toContain('★BJ426 域哨兵');               // 钉注释在位
    expect(dp).toContain('DG_CLOUD_SHEETS.has(st.type[qi])');   // 消费点域一致正锚
    // 掩蔽对:sheet 189(云)∈CLOUDS_SHEETS 而内部 91 才是其真身——若有人误改传 sheet 即红
    expect(CLOUDS_IDS.has(91)).toBe(true);
    expect(CLOUDS_IDS.has(189)).toBe(false);
  });
});
