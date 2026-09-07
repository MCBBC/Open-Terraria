// SW-BJ10 2026-09-07：平台放置失败 + 锤击渲染不变 双线法证回归（用户实报复现）。
//
// 【行为日志重建】behavior-log-Starter_World-2026-09-07T05-22-28-226Z.json（Starter_World,
// 手持 vi_94_wood_platform t=14780→17466）：
//   · use×38 → tile place×11（3338,349…3335,349 全为与既有台正交相邻的格）；
//   · 4 段连续全败爆发（15273-15329×5 / 15709-15781×7 / 16400-16431×3 / 17235-17306×4,
//     间隔 ≈14t = useTime 持按重试节拍）。
// 【放置线根因】斜向续铺目标（仅角接触）被 hasSupport 拒：原版平台放置支撑 = 通用支
//   （Player.cs:41613-41651 正交邻 active 实心/墙）∪ 平台回退支 :41653-41666（3×3 内
//   任一 active 格即 canPlace）。本仓 hasSupport 非框架路径只查 底行 SolidTile2 近似/
//   墙/上侧 isActive——3×3 回退整缺 → 对角目标 37 帧全败（11 成功全部是正交邻格帧）。
// 【渲染线根因】锤整形只写 slope/half 位，平台 frameX 不重算：原版 SlopeTile/PoundTile
//   尾 SquareTileFrame（WorldGen.cs:82058/:82101）→ TileFrame → TileFrameImportant
//   平台支 :86648-86760 重算 frameX（slope1→432/360/468 列、slope2→414/342/450 列），
//   slope 旗本身不参与 'style' 绘制路径帧选择 → "锤平台有声无形"。放置面同理缺
//   PlaceTile 尾 SquareTileFrame(:60748) 的平台重帧（运行时平台 frameX 恒置放值）。
//   chunk 脏标记链（setSlope→listeners→ChunkCache.markDirtyAround）本身完好——断点
//   在帧数据从未更新，不在缓存失效。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { viIdFromKey } from '../src/data/vanillaItemCombat';
import type { ItemDef } from '../src/data/items';

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;
const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;
const PLAT_ITEM = ITEM_DEFS.find((d) => d.key === 'vi_94_wood_platform') as ItemDef;
const DIRT_ITEM = ITEM_DEFS.find((d) => d.tile === 'dirt') as ItemDef;
const PICK_ITEM = ITEM_DEFS.find((d) => {
  const v = viIdFromKey(d.key);
  const f = v != null && v > 0 ? itemFuncOfVid(v) : null;
  return !!f?.pick && f.pick > 0;
}) as ItemDef;
expect(PLAT_ITEM, 'vi_94_wood_platform 在册').toBeTruthy();
expect(DIRT_ITEM, '泥土放置物在册').toBeTruthy();
expect(PICK_ITEM, '镐类物品在册（块换积累门用）').toBeTruthy();

/** 真分派 shell（同 sw-bj3 shell 式：Game.prototype 直调,外围 stub） */
function shell(w: World, o: { smart?: boolean; showing?: boolean; scx?: number; scy?: number;
  lock?: { x: number; y: number } | null; dirty?: number[][]; enemies?: unknown[];
  held?: ItemDef; extraSlots?: Array<{ id: number; stack: number } | null>;
  log?: Array<Record<string, unknown>>; hitDmg?: number } = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.world = w;
  g.chunks = { markDirtyArea: (x0: number, y0: number, x1: number, y1: number) => { o.dirty?.push([x0, y0, x1, y1]); } };
  g.sfx = { play: () => {} };
  g.playSfxFile = () => true;
  g.cb = { onInventoryChanged: () => {} };
  g.input = {};
  g.entities = { critters: [], enemies: o.enemies ?? [], npcs: [], projectiles: [] };
  g.remotePlayerProxies = [];
  g.smartCursor = {
    wanted: o.smart ?? true,
    showing: o.showing ?? false,
    x: o.scx ?? -1,
    y: o.scy ?? -1,
    lockedContinuity: o.lock ?? null,
    lockedDirection: null,
  };
  g.spawnParticles = () => {};
  g.recLog = (k: string, d: Record<string, unknown>) => { o.log?.push({ k, ...d }); };
  g.spawnDrop = () => {};
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.hitTiles = {
    addDamage: () => o.hitDmg ?? 0,       // 默认 0（无积累）,块换案显式注入
    clear: () => {},
  };
  const held = o.held ?? PLAT_ITEM;
  const slots: Array<{ id: number; stack: number } | null> = [{ id: ITEM_DEFS.indexOf(held), stack: 99 }];
  for (const s of o.extraSlots ?? []) slots.push(s);
  g.player = {
    // 站位行 33：目标行 30 ∈ inTileRange 盒（y=tileReach 3 外扩 → [30,37]）且玩家盒
    // (528..556) 与目标格 (480..496) 不相交——实体门夹具需重叠时显式改写 player
    cx: 20 * TILE + 8, cy: 33 * TILE + 8, x: 20 * TILE + 2, y: 33 * TILE, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, dead: false, gfxOffY: 0,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots,
      heldItem: () => slots[0],
      removeAt: () => {},
      removeHeld: () => {},
    },
  } as unknown as Record<string, unknown>;
  return g;
}

function mkWorld(): { w: World; st: TileStore } {
  const w = new World(64, 64, 7, 'sw-bj10');
  return { w, st: w.store as TileStore };
}

// ═══════════════ 放置线：目标格支撑矩阵（can-place 门 1:1） ═══════════════

describe('SW-BJ10 放置线：平台支撑矩阵（Player.cs:41653-41666 3×3 回退 + :41627 邻墙臂）', () => {
  it('★回归主案：对角仅角接触（左上台）→ 可放（预修 hasSupport 拒=实报根因）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(19, 29, PLAT, 0, 0);            // 唯一支撑=左上对角 (x-1,y-1)
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(PLAT);
    expect(st.flags[st.idx(20, 30)]).toBe(1);
  });

  it('四对角方向全开：右上/左下/右下仅角接触 → 全部可放', () => {
    for (const [dx, dy] of [[1, -1], [-1, 1], [1, 1]] as const) {
      const { w, st } = mkWorld();
      st.setTileSilent(20 + dx, 30 + dy, PLAT, 0, 0);
      shell(w).tryPlace(20, 30, PLAT_ITEM!);
      expect(st.type[st.idx(20, 30)], `对角(${dx},${dy})`).toBe(PLAT);
    }
  });

  it('正交横续（左邻平台）→ 可放（既有臂基线,防新臂掩盖回归）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(19, 30, PLAT, 0, 0);
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(PLAT);
  });

  it('3×3 全空且无墙（悬空孤点）→ 不可放（原版回退支同样拒绝）', () => {
    const { w, st } = mkWorld();
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(0);
  });

  it('正交邻格空墙位（wall>0 无 tile）→ 可放（:41627 tile3/4/5/6.wall>0 臂）', () => {
    const { w, st } = mkWorld();
    st.wall[st.idx(19, 30)] = 1;                     // 左邻:纯背景墙空格
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(PLAT);
  });

  it('目标格自身有墙无 tile → 可放（既有臂基线钉值）', () => {
    const { w, st } = mkWorld();
    st.wall[st.idx(20, 30)] = 1;
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(PLAT);
  });

  it('已致动邻台（inActive,active() 含）→ 3×3 臂可放（原版裸 active() 口径）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(19, 30, PLAT, 0, 0);
    st.wire[st.idx(19, 30)] |= TileStore.WIRE_ACTUATED;   // 致动位:isActive 变假,hasTile 仍真
    expect(st.isActive(19, 30)).toBe(false);
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(PLAT);
  });

  it('目标格被敌怪占位 → 不可放（PlaceTile :59896 Collision.EmptyTile 实体半边,tileSolid[19]=true）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(19, 30, PLAT, 0, 0);
    const enemy = { x: 20 * TILE, y: 30 * TILE, w: 16, h: 16 };
    shell(w, { enemies: [enemy] }).tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(0);         // 实体重叠拒
  });

  it('目标格被玩家占位 → 不可放（同上门,玩家半边）：玩家盒显式改写进目标格', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(19, 30, PLAT, 0, 0);
    const g = shell(w);
    // 玩家盒 (322..334, 480..508) ⊃ 目标格 (20,30)=(320..336,480..496) 相交
    (g.player as Record<string, number>).y = 30 * TILE;
    (g.player as Record<string, number>).cy = 30 * TILE + 14;
    g.tryPlace(20, 30, PLAT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(0);
  });

  it('TileTargetDesired（SmartCursorHelper.cs:1400-1411,:40032 第三门）：锁存续期 miss 帧拦下、命中帧放行', () => {
    // 夹具：左邻平台给足支撑（排除 hasSupport 干扰,隔离出本门的拦截面）
    const { w, st } = mkWorld();
    st.setTileSilent(24, 35, PLAT, 0, 0);
    // 锁在 + 智能光标本帧未命中 → 放置让位（原版 TileTargetDesired()=false）
    shell(w, { lock: { x: 24, y: 35 }, showing: false }).tryPlace(25, 35, PLAT_ITEM!);
    expect(st.type[st.idx(25, 35)]).toBe(0);
    // 无锁（首放/非平台持物/锁已被清）→ mouse 回落照常（vanilla return true）——
    // 同支撑夹具对照,证明拦截来自门而非支撑
    const { w: w2, st: st2 } = mkWorld();
    st2.setTileSilent(24, 35, PLAT, 0, 0);
    shell(w2, { lock: null, showing: false }).tryPlace(25, 35, PLAT_ITEM!);
    expect(st2.type[st2.idx(25, 35)]).toBe(PLAT);
    // 锁在 + 本帧命中且 tileTarget==SmartCursor 目标 → 放行
    const { w: w3, st: st3 } = mkWorld();
    st3.setTileSilent(24, 35, PLAT, 0, 0);
    shell(w3, { lock: { x: 25, y: 35 }, showing: true, scx: 25, scy: 35 }).tryPlace(25, 35, PLAT_ITEM!);
    expect(st3.type[st3.idx(25, 35)]).toBe(PLAT);
    // 注：原版判别式只看 (SmartCursorShowing ∧ tileTarget==SmartCursorX/Y),不比较
    // 锁坐标本身（SmartCursorHelper.cs:1403-1409）——锁向语义由 Step_Platforms 的
    // AllowedForContinuity 承担,不在本门。故"锁坐标≠目标但本帧命中锁向推进位"的
    // 帧按 vanilla 同样放行,不作独立拦截案。
  });
});

// ═══════════════ 并入项（2026-09-07 用户实报"土块直接代替镐挖矿"）：占用格放置门 ═══════════════
// 原版语义链（Player.cs:40058 头门 → :39182-39383 Block Swap → :39186-39232 镐门）：
//  ① 头门 :40058 `(!tile.active() && …) || PlaceThing_IsReplaceableBlock(tile)`——实心
//     石/土格 active 且非可替换族 → 不进 PlaceIt（普通放置拒绝）;
//  ② TileReplacementEnabled（默认开,builderAccStatus[10]==0）→ Block Swap 支:
//     需背包有镐（GetBestPickaxe()==null → return false :39191-39193）+ 按【最佳背包镐】
//     伤害积累 hitReplace（:39200-39228,<100 只播尘/声不替换）≥100 才 ReplaceTile;
//  ③ 智能光标对实心块物品（smartBlocksEnabled 默认 false）无目标策略 → tileTarget
//     回落鼠标格——开/关两态对本场景等价（感知差=放置发生在相邻空格,非占用格被替）。

describe('SW-BJ10 并入项：占用实心格放置门（土块→石块,智能光标开/关两态）', () => {
  it('智能光标开：土块指实心石格 → 拒绝（石原样,无放置事件;无镐=块换早退 :39191）', () => {
    const { w, st } = mkWorld();
    const log: Array<Record<string, unknown>> = [];
    st.setTileSilent(20, 30, STONE, 0, 0);
    shell(w, { smart: true, held: DIRT_ITEM, log }).tryPlace(20, 30, DIRT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(STONE);            // 石块原样
    expect(log.filter((e) => e.k === 'tile')).toEqual([]);  // 零格变更=零录制（录制器无漏记面）
  });

  it('智能光标关：同场景同拒绝（两态等价,目标格=鼠标格无旁路）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(20, 30, STONE, 0, 0);
    shell(w, { smart: false, held: DIRT_ITEM }).tryPlace(20, 30, DIRT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(STONE);
  });

  it('有镐在包 + 单击：块换积累 <100 → 不替换（挖矿节拍门 :39200-39228,尘+hit 声）', () => {
    const { w, st } = mkWorld();
    const log: Array<Record<string, unknown>> = [];
    st.setTileSilent(20, 30, STONE, 0, 0);
    st.setTileSilent(20, 31, STONE, 0, 0);                  // 下方实心（若误放也过支撑门,隔离出积累门）
    shell(w, { smart: false, held: DIRT_ITEM, log, extraSlots: [{ id: ITEM_DEFS.indexOf(PICK_ITEM), stack: 1 }], hitDmg: 50 })
      .tryPlace(20, 30, DIRT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(STONE);            // 积累不足,石原样
  });

  it('有镐在包 + 积累 ≥100：块换走通=breakTile(石掉落)+泥土写入+两段录制（recorder 覆盖实证）', () => {
    const { w, st } = mkWorld();
    const log: Array<Record<string, unknown>> = [];
    st.setTileSilent(20, 30, STONE, 0, 0);
    st.setTileSilent(20, 31, STONE, 0, 0);
    shell(w, { smart: false, held: DIRT_ITEM, log, extraSlots: [{ id: ITEM_DEFS.indexOf(PICK_ITEM), stack: 1 }], hitDmg: 100 })
      .tryPlace(20, 30, DIRT_ITEM!);
    expect(st.type[st.idx(20, 30)]).toBe(DIRT);             // 块换成功=泥土写入
    const tileEvents = log.filter((e) => e.k === 'tile');
    expect(tileEvents.some((e) => e.cause === 'mine' || e.cause === 'other')).toBe(true);   // 旧石破坏有录制
    expect(tileEvents.some((e) => e.cause === 'place')).toBe(true);          // 泥土写入有录制
  });

  it('结构锁：placeObstructionClearable 豁免并集 = tileCut∪BWP（实心块族不入,484/654 carve-out 在位）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/core/Game.ts', 'utf8');
    expect(src).toMatch(/function placeObstructionClearable\(typeId: number, sheet: number\): boolean \{\s*\n\s*return \(TILE_CUT\.has\(typeId\) && sheet !== 484 && sheet !== 654\)\s*\n\s*\|\| TILE_BREAK_WHEN_PLACING\.has\(typeId\);/);
    // 行为面：石/土（solid 非豁免族）不可被清格相放行=占用拒绝门的实体
    const TILE_CUT_VANILLA_MATCH = src.match(/const TILE_CUT_VANILLA = new Set\(\[([^\]]*)\]/);
    expect(TILE_CUT_VANILLA_MATCH).toBeTruthy();
    const sheets = (TILE_CUT_VANILLA_MATCH![1].match(/\d+/g) ?? []).map(Number);
    expect(sheets).not.toContain(1);     // stone
    expect(sheets).not.toContain(0);     // dirt
    const BWP_MATCH = src.match(/const TILE_BREAK_WHEN_PLACING = internalIdsOfVanSheets\(\[([^\]]*)\]/);
    expect(BWP_MATCH).toBeTruthy();
    const bwp = (BWP_MATCH![1].match(/\d+/g) ?? []).map(Number);
    expect(bwp).not.toContain(1);        // stone
    expect(bwp).not.toContain(0);        // dirt
  });
});

// ═══════════════ 渲染线：运行时平台帧重算 + chunk 脏标记链 ═══════════════

describe('SW-BJ10 渲染线：SquareTileFrame 平台面（TileFrameImportant 平台支 :86648-86760）', () => {
  it('放置即重帧：孤立台 frameX=90（slope0 链 num9=num8=-1 → 90;置放帧 0 为缺陷态）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(20, 31, DIRT, 0, 0);            // 下方支撑（不进 num10 L/R 邻判）
    shell(w).tryPlace(20, 30, PLAT_ITEM!);
    const i = st.idx(20, 30);
    expect(st.type[i]).toBe(PLAT);
    expect(st.frameY[i]).toBe(0);                    // style 行不变（case 19 frameY=18*style）
    expect(st.frameX[i]).toBe(90);
  });

  it('成排连接帧：左→右连放三台 → [36(左端),0(中列),18(右端)]（原版连接码,此前恒 0）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(18, 31, DIRT, 0, 0);            // 首台支撑（ vanilla 亦拒全空首放）
    const g = shell(w);
    for (const tx of [18, 19, 20]) {
      (g.player as Record<string, number>).useTime = 0;   // 重置 useTime 节流（连放）
      g.tryPlace(tx, 30, PLAT_ITEM!);
    }
    expect(st.frameX[st.idx(18, 30)]).toBe(36);      // num9==-1 && num8==type（第二次放置 3×3 重帧）
    expect(st.frameX[st.idx(19, 30)]).toBe(0);       // num9==type && num8==type（第三次放置重帧）
    expect(st.frameX[st.idx(20, 30)]).toBe(18);      // num9==type && num8==-1（本格放置重帧）
  });

  it('锤四拍帧序列（真 tryMine）：整90 → slope1·432 → slope2·414 → 半砖90 → 回整90', () => {
    const store = new TileStore(64, 64);
    const world = { store, w: 64, h: 64, flags: {}, chests: [], furnitureItems: [] } as unknown as World;
    const g = Object.create(Game.prototype) as unknown as Record<string, any>;
    g.world = world;
    g.chunks = { markDirtyArea: () => {} };
    g.player = { cx: 8 * TILE, cy: 8 * TILE, x: 8 * TILE - 10, y: 8 * TILE - 21, w: 20, h: 42, equipStats: {} };
    g.tickCount = 100;
    g.lastMineHitTick = -999;
    g.hammerPoundRelease = true;
    g.trackTile = 0;
    g.mining = null;
    g.sfx = { play: () => {}, playWavFile: () => true };
    g.playSfxFile = () => true;
    g.spawnParticles = () => {};
    g.hitTiles = { addDamage: () => 0, clear: () => {} };
    g.input = { mouseX: 8 * TILE, mouseY: 8 * TILE, rightDown: false, mouseDown: false, mouseHeld: false };
    store.setTileSilent(8, 8, PLAT, 0, 0);
    const fx = () => store.frameX[store.idx(8, 8)];
    expect(fx()).toBe(0);                            // 置放帧（直写,未经放置链）
    g.hammerPoundRelease = true;
    g.tryMine(8, 8, 0, 'hammer', 20);
    g.lastMineHitTick = -999;
    expect(store.slope[store.idx(8, 8)]).toBe(1);
    expect(fx()).toBe(432);                          // slope1 孤立:BL 空首臂 + L/TL 空支持 → 432
    g.hammerPoundRelease = true;
    g.tryMine(8, 8, 0, 'hammer', 20);
    g.lastMineHitTick = -999;
    expect(store.slope[store.idx(8, 8)]).toBe(2);
    expect(fx()).toBe(414);                          // slope2 孤立:BL 空首臂 + R/TR 空支持 → 414
    g.hammerPoundRelease = true;
    g.tryMine(8, 8, 0, 'hammer', 20);
    g.lastMineHitTick = -999;
    expect(!!store.half[store.idx(8, 8)]).toBe(true);
    expect(store.slope[store.idx(8, 8)]).toBe(0);
    expect(fx()).toBe(90);                           // 半砖拍 slope0 连接链 → 孤立 90
    g.hammerPoundRelease = true;
    g.tryMine(8, 8, 0, 'hammer', 20);
    expect(!!store.half[store.idx(8, 8)]).toBe(false);
    expect(fx()).toBe(90);
  });

  it('锤坡后邻台帧联动：slope2 台的左下邻斜台经 3×3 重帧吃 342/378 坡连接码', () => {
    const { w, st } = mkWorld();
    // 布局：右上台 (31,29) + 左下台 (29,31)，对 (30,30) 锤出 slope2（num=2 感知：右上台在 (x+1,y-1)）
    st.setTileSilent(31, 29, PLAT, 0, 0);
    st.setTileSilent(29, 31, PLAT, 0, 0);
    const store = w.store as TileStore;
    const world = { store, w: 64, h: 64, flags: {}, chests: [], furnitureItems: [] } as unknown as World;
    const g = Object.create(Game.prototype) as unknown as Record<string, any>;
    g.world = world;
    g.chunks = { markDirtyArea: () => {} };
    g.player = { cx: 30 * TILE, cy: 30 * TILE, x: 30 * TILE - 10, y: 30 * TILE - 21, w: 20, h: 42, equipStats: {} };
    g.tickCount = 100;
    g.lastMineHitTick = -999;
    g.hammerPoundRelease = true;
    g.trackTile = 0;
    g.mining = null;
    g.sfx = { play: () => {}, playWavFile: () => true };
    g.playSfxFile = () => true;
    g.spawnParticles = () => {};
    g.hitTiles = { addDamage: () => 0, clear: () => {} };
    g.input = { mouseX: 30 * TILE, mouseY: 30 * TILE, rightDown: false, mouseDown: false, mouseHeld: false };
    store.setTileSilent(30, 30, PLAT, 0, 0);
    g.hammerPoundRelease = true;
    g.tryMine(30, 30, 0, 'hammer', 20);
    expect(store.slope[store.idx(30, 30)]).toBe(2);  // 右上台 → num=2 起步
    // (30,30) slope2：BL=(29,31) 平台斜邻 → else 臂,R=(31,30) 空、TR=(31,29) 平台 slope0
    // → 378（:86748 slope2 else 臂）；帧列 378 = Tiles_19 坡面图形,渲染层取帧即变。
    expect(store.frameX[store.idx(30, 30)]).toBe(378);
    // 邻台也被重帧（3×3 覆盖）：右上台 slope0 孤立 L/R → 90
    expect(store.frameX[store.idx(31, 29)]).toBe(90);
  });

  it('chunk 脏标记链：锤整形/放置都触发 markDirtyArea 3×3（setSlope 监听→ChunkCache 链上游补帧后显式失效）', () => {
    const { w, st } = mkWorld();
    const dirty: number[][] = [];
    st.setTileSilent(20, 31, DIRT, 0, 0);
    shell(w, { dirty }).tryPlace(20, 30, PLAT_ITEM!);
    expect(dirty.length).toBe(1);
    expect(dirty[0]).toEqual([19, 29, 21, 31]);      // (x-1,y-1)..(x+1,y+1)
    // TileStore 监听面（链第一环,ChunkCache 构造订阅同款）：setSlope/setHalfBrick 均派发
    const fired: string[] = [];
    st.onTileChanged((x, y) => fired.push(`${x},${y}`));
    st.setSlope(20, 30, 1);
    st.setHalfBrick(20, 30, true);
    expect(fired).toContain('20,30');
    expect(fired.filter((s) => s === '20,30').length).toBe(2);
  });

  it('帧码域锁：重算后 frameX ∈ 原版平台连接码全集（WorldGen.cs:86748 num10 取值域）', () => {
    const CODES = new Set([0, 18, 36, 54, 72, 90, 108, 126, 144, 180, 216, 234, 252, 270, 288, 342, 360, 378, 396, 414, 432, 450, 468]);
    const { w, st } = mkWorld();
    st.setTileSilent(19, 29, PLAT, 0, 0);
    shell(w).tryPlace(20, 30, PLAT_ITEM!);           // 对角续铺
    expect(CODES.has(st.frameX[st.idx(20, 30)])).toBe(true);
    expect(CODES.has(st.frameX[st.idx(19, 29)])).toBe(true);
    expect(st.frameY[st.idx(20, 30)]).toBe(0);       // style 行恒不进 frameX（WebGL/style 渲染行带）
  });
});

// ═══════════════ 结构锁：源文本锚（防静默回退） ═══════════════

describe('SW-BJ10 结构锁', () => {
  it('hasSupport 平台 3×3 回退臂在位（读 hasTile 裸 active() 口径,非 isActive）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/core/Game.ts', 'utf8');
    expect(src).toMatch(/SW-BJ10 2026-09-07（平台放置支撑 1:1 收编/);
    expect(src).toMatch(/if \(PLATFORMS_SHEETS\.has\(sheet\)\) \{\s*\n\s*for \(let dy = -1; dy <= 1; dy\+\+\)/);
    // 回退支读裸 active()（原版 tile.active(),Player.cs:41659）——nactive 口径会让
    // 已致动邻台丢支撑（原版致动格仍算在场锚）
    expect(src).toMatch(/st\.hasTile\(x \+ dx, y \+ dy\)\) return true;/);
  });

  it('squareTileFramePlatform 三消费位在位：hammer/worldGenSlopeTile/tryPlace', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/core/Game.ts', 'utf8');
    expect(src.match(/this\.squareTileFramePlatform\(/g)?.length).toBe(3);
    expect(src).toMatch(/import \{ framePlatformSweep \} from '\.\.\/world\/gen\/vanilla\/FinalCleanupPass';/);
  });

  it('vanilla 权威同源：vanilla/FinalCleanupPass.framePlatformSweep 已导出（III190 面）且码表齐全', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/world/gen/vanilla/FinalCleanupPass.ts', 'utf8');
    expect(src).toMatch(/export function framePlatformSweep\(st: TileStore, ctx: SweepCtx, x: number, y: number\): void/);
    // 码表齐全性：取函数体片段逐码断言（部分码在条件表达式内联,不做赋值形锚）
    const body = src.slice(src.indexOf('export function framePlatformSweep'), src.indexOf('framePlatformSweep(st, ctx, x, y);') > 0
      ? src.indexOf('framePlatformSweep(st, ctx, x, y);') : undefined);
    for (const code of [90, 126, 342, 378, 414, 432, 450, 468]) {
      expect(new RegExp(`\\b${code}\\b`).test(body), `连接码 ${code} 在 authority 码表`).toBe(true);
    }
  });

  it('平台族 def 全集域不变（TileID.cs:243 {19,427,435-439}）', () => {
    for (const sheet of [19, 427, 435, 436, 437, 438, 439]) {
      expect(TILE_DEFS.some((d) => d?.vanilla?.sheet === sheet), `sheet ${sheet} 在册`).toBe(true);
    }
    expect(TILE_DEFS[PLAT]?.platform).toBe(true);
  });
});
