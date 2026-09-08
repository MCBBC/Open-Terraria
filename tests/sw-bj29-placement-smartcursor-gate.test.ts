// SW-BJ29 2026-09-08：不开智能光标放不了平台/物块（用户实报,头号嫌疑 BJ10 回归）。
//
// 【定谳】BJ10 在 tryPlace 头接的 TileTargetDesired 门（Game.ts ← Player.cs:40032 ←
//  SmartCursorHelper.cs:1400-1411）本身 1:1,但【锁生命周期】在本仓断裂：
//  原版 SmartCursorLookup 每帧【无条件】调用（Player.cs:25641-25645,仅 whoAmI/相机
//  跟踪两门）,清锁门（SmartCursorHelper.cs:64-68）先于 `!SmartCursorIsUsed` 早退
//  （:69-72）——智能光标【关闭】的帧平台连通锁也被清（used=false ⇒ 条件恒真）。
//  本仓 Game.updateSmartCursor 在 !wanted/界面遮挡帧【整支跳过 lookup】,锁一旦置位
//  （Step_Platforms :1392-1393,须智能开+持平台）就永不清理 → showing 恒 false ⇒
//  门判别式 `!(showing && tileTarget==SmartCursor)` 恒真 ⇒ 一切 tile 放置（平台/块/
//  火把）被拦。修复 = 跳过帧补跑 lookup 头（SmartCursor.lookupSkipped :63-68 等价）,
//  门本体不动（BJ10 智能开态语义原样保留）。
//
// 【原版锚】
//  - Player.cs:40032 门头（无条件域,但锁态只能由智能光标管线置位）
//  - SmartCursorHelper.cs:1400-1411 TileTargetDesired
//  - SmartCursorHelper.cs:61-72 lookup 头（清锁 :64-68 先于早退 :69-72）
//  - SmartCursorHelper.cs:167-175 UsingSmartCursorWithContinuity（持平台才续锁）
//  - Player.cs:25586-25607 tileTarget 每帧鼠标直取（非智能态恒新,无锁存）
//  - Player.cs:25641-25645 lookup 每帧无条件调用
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, T } from '../src/data/tiles';
import type { ItemDef } from '../src/data/items';
import type { World } from '../src/world/World';
import { SmartCursor } from '../src/player/SmartCursor';

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;
const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;
const TORCH = T.TORCH;
const PLAT_ITEM = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[94]]];   // 木平台
const DIRT_ITEM = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]]];    // 泥土块
const TORCH_ITEM = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]]];   // 火把
expect(PLAT_ITEM, '平台物品在册').toBeTruthy();
expect(DIRT_ITEM, '泥土物品在册').toBeTruthy();
expect(TORCH_ITEM, '火把物品在册').toBeTruthy();

/** 玩家站 (20,30) 行（同 sw-bj10 几何）;平台锚 (20,32),鼠标 (24,32) → 续铺目标 (21,32)。
 *  该域 [18-26]×[28-34] 在 World(64,64,7) 生成期全空（本文件头注几何依据）。 */
const P = { x: 20 * TILE + 2, y: 30 * TILE, w: 12, h: 28 };
const MOUSE = { x: 24 * TILE + 8, y: 32 * TILE + 8 };

/** 真 TileStore + 最小 world 侧貌（updateSmartCursor 的 clock/weather/groundLevel 消费面） */
function mkWorld(): { st: TileStore; w: World } {
  const st = new TileStore(64, 64);
  const w = {
    store: st, w: 64, h: 64, flags: {}, chests: [], furnitureItems: [],
    clock: { isDay: true, bloodMoon: false, moonPhase: 0, timeOfDay: 0.5 },
    weather: { raining: false, cloudAlpha: 0 },
    groundLevel: 40, oldOnesArmy: { ongoing: false }, seedFlags: undefined, isJourney: false,
  } as unknown as World;
  return { st, w };
}

interface ShellOpts {
  held?: ItemDef;
  mouseDown?: boolean;
  /** downAction('SmartCursor') 队列（toggle 模式:按下沿翻转 wanted） */
  smartPresses?: boolean[];
  mouse?: { x: number; y: number };
}

/** 整合 shell：updateSmartCursor 与 tryPlace 共用同一实例（BJ10 shell 式 + 真 SmartCursor）。
 *  智能光标生命周期是本批被测对象——不再直注 lock/showing（直注态只留给门判别式组）。 */
function shell(w: World, o: ShellOpts = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.playSfxFile = () => true;
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.remotePlayerProxies = [];
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => {};
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.hitTiles = { addDamage: () => 0, clear: () => {} };
  g.net = null;
  g.minecart = null;
  g.annotateMode = false;
  g.wireToolMode = 0;
  g.renderer = { fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] };
  g.smartSettings = () => ({ toggleMode: true, smartAxeAfterPickaxe: false, smartBlocksEnabled: false, holdCanReleaseMidUse: false });
  g.inpOverDomUi = () => false;
  const presses = [...(o.smartPresses ?? [])];
  const m = o.mouse ?? MOUSE;
  g.input = {
    downAction: () => presses.shift() ?? false,
    uiBlocking: false,
    mouseX: m.x, mouseY: m.y,
    mouseDown: !!o.mouseDown,
  };
  const slots: Array<{ id: number; stack: number; favorited: boolean } | null> = [
    { id: ITEM_DEFS.indexOf(o.held ?? PLAT_ITEM), stack: 99, favorited: false },
  ];
  g.player = {
    ...P, cx: P.x + 6, cy: P.y + 14, facing: 1, useTime: 0, attackSpeedMult: 1,
    dead: false, gfxOffY: 0, buffs: { has: () => false }, equipStats: {},
    actuationRodLock: false, actuationRodLockSetting: false, grappleAnchorTiles: () => [],
    inv: { selected: 0, slots, heldItem: () => slots[0], removeAt: () => {}, removeHeld: () => {} },
  };
  g.smartCursor = new SmartCursor();      // wanted=false 起步（世界初值同 Game :6994）
  return g;
}

/** 阶段一公共件：智能开 + 持平台 + 按住 → updateSmartCursor 置平台连通锁（:1392-1393） */
function primeLock(g: Record<string, any>): void {
  g.player.useTime = 0;
  g.updateSmartCursor();
  expect(g.smartCursor.wanted).toBe(true);
  expect(g.smartCursor.showing).toBe(true);
  expect(g.smartCursor.lockedContinuity).toEqual({ x: 21, y: 32 });
}

// ═══════════════ A. lookupSkipped 单元（SmartCursorHelper.cs:63-68 前奏语义） ═══════════════

describe('SW-BJ29 lookupSkipped：跳过帧 lookup 头等价（:63-68 清锁门先于 :69 早退）', () => {
  it('used=false（智能关帧）：持平台+按住使用也必清双锁+showing 复位（原文 used=false ⇒ 条件恒真）', () => {
    const sc = new SmartCursor();
    sc.lockedDirection = { x: 1, y: 0 };
    sc.lockedContinuity = { x: 21, y: 32 };
    sc.showing = true;
    sc.lookupSkipped(true, false, PLAT_ITEM);
    expect(sc.showing).toBe(false);          // :63
    expect(sc.lockedDirection).toBeNull();   // :66
    expect(sc.lockedContinuity).toBeNull();  // :67——本 bug 根因修复面
  });

  it('used=true + 按住 + 持平台：锁保留（blocked 但 wanted 帧,原文清锁门不触发）', () => {
    const sc = new SmartCursor();
    sc.lockedDirection = { x: 1, y: 0 };
    sc.lockedContinuity = { x: 21, y: 32 };
    sc.lookupSkipped(true, true, PLAT_ITEM);
    expect(sc.lockedContinuity).toEqual({ x: 21, y: 32 });
    expect(sc.lockedDirection).toEqual({ x: 1, y: 0 });
  });

  it('used=true + 按住 + 持非平台（火把）：清（UsingSmartCursorWithContinuity :167-175 第三门）', () => {
    const sc = new SmartCursor();
    sc.lockedContinuity = { x: 21, y: 32 };
    sc.lookupSkipped(true, true, TORCH_ITEM);
    expect(sc.lockedContinuity).toBeNull();
  });

  it('used=true + 未按住 + 持平台：清（:64 首项 !controlUseItem）', () => {
    const sc = new SmartCursor();
    sc.lockedContinuity = { x: 21, y: 32 };
    sc.lookupSkipped(false, true, PLAT_ITEM);
    expect(sc.lockedContinuity).toBeNull();
  });

  it('lookupSkipped 后 lookup 正常续跑（前奏不污染管线初值）', () => {
    const sc = new SmartCursor();
    sc.lookupSkipped(true, false, PLAT_ITEM);
    expect(sc.showing).toBe(false);
    expect(sc.x).toBe(-1);
    expect(sc.y).toBe(-1);
  });
});

// ═══════════════ B. 生命周期整合：updateSmartCursor → tryPlace（实报根因回归） ═══════════════

describe('SW-BJ29 生命周期：智能开置锁 → 智能关（曾整支跳过=锁滞留）→ 放置放行', () => {
  it('★主案 平台：置锁→智能关→锁清零→tryPlace 写格成功（修复前锁滞留+showing=false 全拦）', () => {
    const { st, w } = mkWorld();
    st.setTileSilent(20, 32, PLAT, 0, 0);              // 平台锚（续铺源）
    const g = shell(w, { held: PLAT_ITEM, mouseDown: true, smartPresses: [true] });
    primeLock(g);
    // 智能光标关（toggle 需先松 Ctrl 复位按下沿,再按翻转——TryToToggleSmartCursor 边沿语义）
    g.input.downAction = () => false;
    g.updateSmartCursor();
    g.input.downAction = () => true;                    // 本帧按下沿 → wanted 翻 false
    g.updateSmartCursor();
    expect(g.smartCursor.wanted).toBe(false);
    expect(g.smartCursor.lockedContinuity).toBeNull();  // ★修复面：跳过帧清锁（曾滞留）
    expect(g.smartCursor.lockedDirection).toBeNull();
    expect(g.smartCursor.showing).toBe(false);
    // 门清 → 鼠标格/续铺位照常放置（支撑 = 相邻既有平台,3×3 回退支）
    g.player.useTime = 0;
    g.tryPlace(21, 32, PLAT_ITEM!);
    expect(st.type[st.idx(21, 32)]).toBe(PLAT);
  });

  it('物块：置锁→智能关+换持泥土→锁清→泥土放置放行（锁生命周期与持物无关,原文本义）', () => {
    const { st, w } = mkWorld();
    st.setTileSilent(20, 32, PLAT, 0, 0);
    st.setTileSilent(24, 33, STONE, 0, 0);              // 泥土支撑（下方实心）
    const g = shell(w, { held: PLAT_ITEM, mouseDown: true, smartPresses: [true] });
    primeLock(g);
    g.input.downAction = () => true;
    g.player.inv.slots[0].id = ITEM_DEFS.indexOf(DIRT_ITEM!);   // 中途换持非平台物品
    g.updateSmartCursor();
    expect(g.smartCursor.lockedContinuity).toBeNull();
    g.player.useTime = 0;
    g.tryPlace(24, 32, DIRT_ITEM!);
    expect(st.type[st.idx(24, 32)]).toBe(DIRT);
  });

  it('火把：置锁→智能关+换持火把→锁清→火把放置放行（BJ28 旁证面：门对火把本就应无效）', () => {
    const { st, w } = mkWorld();
    st.setTileSilent(20, 32, PLAT, 0, 0);
    st.setTileSilent(23, 33, STONE, 0, 0);              // 火把下锚
    const g = shell(w, { held: PLAT_ITEM, mouseDown: true, smartPresses: [true] });
    primeLock(g);
    g.input.downAction = () => true;
    g.player.inv.slots[0].id = ITEM_DEFS.indexOf(TORCH_ITEM!);
    g.updateSmartCursor();
    expect(g.smartCursor.lockedContinuity).toBeNull();
    g.player.useTime = 0;
    g.tryPlace(23, 32, TORCH_ITEM!);
    expect(st.type[st.idx(23, 32)]).toBe(TORCH);
  });

  it('★BJ10 语义不回退（智能开拖拽全程）：miss 帧锁保留+放置被拦;松开鼠标→锁清→智能重取目标放置放行', () => {
    const { st, w } = mkWorld();
    st.setTileSilent(20, 32, PLAT, 0, 0);
    st.setTileSilent(24, 33, STONE, 0, 0);              // 远格支撑（隔离"拦截来自门"）
    const g = shell(w, { held: PLAT_ITEM, mouseDown: true, smartPresses: [true] });
    primeLock(g);
    // miss 帧：方向锁 (1,0) 持有下鼠标远近无关（GetDesiredDirectionFrom :1442-1444 锁向
    //  优先恒返 (1,0)）——锁向唯一续铺位 (21,32) 被石块占据 → 平台步零候选 = 真 miss
    st.setTileSilent(21, 32, STONE, 0, 0);
    g.input.mouseX = 30 * TILE + 8; g.input.mouseY = 20 * TILE + 8;
    g.player.useTime = 0;
    g.updateSmartCursor();
    expect(g.smartCursor.wanted).toBe(true);
    expect(g.smartCursor.showing).toBe(false);          // miss 帧
    expect(g.smartCursor.lockedContinuity).toEqual({ x: 21, y: 32 });   // 锁存续期（:64 三条件全真）
    // 支撑齐备的远格（24,32 下方实心）同样被拦 = 拦截来自门而非支撑（Player.cs:40032）
    g.tryPlace(24, 32, PLAT_ITEM!);
    expect(st.type[st.idx(24, 32)]).toBe(0);
    // 原版逃生门：松开鼠标 → :64 首项 !controlUseItem → 头清锁;同帧智能开态管线重取
    // 目标并重写新锁（Step_Platforms 命中拍即锁——锁清断言归 A 组/lookup 级）,门放行,
    // 放置落智能目标位（非智能态无此段——skip 臂只跑前奏不重锁）
    g.input.mouseDown = false;
    g.player.useTime = 0;
    g.updateSmartCursor();
    const sx = g.smartCursor.x, sy = g.smartCursor.y;
    expect(g.smartCursor.showing).toBe(true);           // 智能重取（锁向释放后按鼠标量化重扫）
    expect(g.smartCursor.lockedContinuity).not.toEqual({ x: 21, y: 32 });   // 旧续铺位不再锁
    g.tryPlace(sx, sy, PLAT_ITEM!);
    expect(st.type[st.idx(sx, sy)]).toBe(PLAT);
  });

  it('界面遮挡帧（wanted 仍在,fullMap open）：按原文条件清锁——未按住 ⇒ 清', () => {
    const { w } = mkWorld();
    st0(w).setTileSilent(20, 32, PLAT, 0, 0);
    const g = shell(w, { held: PLAT_ITEM, mouseDown: true, smartPresses: [true] });
    primeLock(g);
    g.renderer.fullMap.open = true;                     // blocked 帧（lookup 整支跳过,前奏仍跑）
    g.input.mouseDown = false;
    g.updateSmartCursor();
    expect(g.smartCursor.lockedContinuity).toBeNull();
  });
});

/** mkWorld 的 store 侧小助手（上面 blocked 帧用例避免重复解构） */
function st0(w: World): TileStore {
  return (w as unknown as { store: TileStore }).store;
}

// ═══════════════ C. 门判别式域（TileTargetDesired 本体 1:1,直注态;BJ10 门不动） ═══════════════

describe('SW-BJ29 门判别式域：TileTargetDesired（Player.cs:40032/SmartCursorHelper.cs:1400-1411）', () => {
  /** 门级 shell（同 BJ10 法证式:直注 smartCursor 态,只测门本体——生命周期归 B 组） */
  function gateShell(w: World, scState: Record<string, unknown>, held: ItemDef) {
    const g = shell(w, { held });
    g.smartCursor = scState;
    return g;
  }

  it('无锁（正常非智能态/首放）：平台/块/火把三物品全部直通', () => {
    for (const [item, tile] of [[PLAT_ITEM, PLAT], [DIRT_ITEM, DIRT], [TORCH_ITEM, TORCH]] as const) {
      const { st, w } = mkWorld();
      st.setTileSilent(24, 33, STONE, 0, 0);
      st.setTileSilent(20, 32, PLAT, 0, 0);
      const g = gateShell(w, { lockedContinuity: null, showing: false, x: -1, y: -1 }, item!);
      g.player.useTime = 0;
      g.tryPlace(24, 32, item!);
      expect(st.type[st.idx(24, 32)]).toBe(tile);
    }
  });

  it('锁在+本帧命中且 tileTarget==SmartCursor：放行（智能开拖拽命中拍）', () => {
    const { st, w } = mkWorld();
    st.setTileSilent(20, 32, PLAT, 0, 0);
    const g = gateShell(w, { lockedContinuity: { x: 21, y: 32 }, lockedDirection: { x: 1, y: 0 },
      showing: true, x: 21, y: 32 }, PLAT_ITEM!);
    g.player.useTime = 0;
    g.tryPlace(21, 32, PLAT_ITEM!);
    expect(st.type[st.idx(21, 32)]).toBe(PLAT);
  });

  it('锁在+showing 但 tileTarget≠SmartCursor：拦（判别式尾项）;锁在+!showing：拦（滞留态判别式）', () => {
    const { st, w } = mkWorld();
    st.setTileSilent(20, 32, PLAT, 0, 0);
    const g1 = gateShell(w, { lockedContinuity: { x: 21, y: 32 }, showing: true, x: 30, y: 20 }, PLAT_ITEM!);
    g1.tryPlace(21, 32, PLAT_ITEM!);
    expect(st.type[st.idx(21, 32)]).toBe(0);
    const g2 = gateShell(w, { lockedContinuity: { x: 21, y: 32 }, showing: false, x: -1, y: -1 }, PLAT_ITEM!);
    g2.tryPlace(21, 32, PLAT_ITEM!);
    expect(st.type[st.idx(21, 32)]).toBe(0);
  });
});

// ═══════════════ D. 结构锁（防并行会话整文件回写/矫枉过正删门） ═══════════════

describe('SW-BJ29 结构锁', () => {
  it('Game.updateSmartCursor 跳过臂调用 sc.lookupSkipped（清锁前奏在位）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/core/Game.ts', 'utf8');
    expect(src).toMatch(/if \(blocked \|\| !sc\.wanted\) \{[\s\S]{0,2000}?sc\.lookupSkipped\(/);
  });

  it('tryPlace 头 BJ10 TileTargetDesired 门仍在（不回退智能开态修复面）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/core/Game.ts', 'utf8');
    expect(src).toMatch(/if \(this\.smartCursor\.lockedContinuity\s*\n\s*&& !\(this\.smartCursor\.showing && this\.smartCursor\.x === tx && this\.smartCursor\.y === ty\)\) return;/);
  });

  it('SmartCursor.lookupSkipped 清双锁结构（:63-68 前奏单点）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/player/SmartCursor.ts', 'utf8');
    expect(src).toMatch(/lookupSkipped\(controlUseItem: boolean, used: boolean, heldDef: ItemDef \| null\): void \{/);
    expect(src).toMatch(/usingSmartCursorWithContinuity\(def: ItemDef \| null \| undefined\): boolean/);
  });
});
