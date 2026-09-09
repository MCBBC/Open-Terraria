// SW-BJ49 2026-09-09：平台放置 × 智能光标状态域收尾（用户实报"有时开智能光标能放平台,
// 关了反而放不了"）。
//
// 【定谳】实机状态矩阵（scripts/_bj49-platform-smartcursor-probe.mjs,真实管线）证:
//   · 智能关放置=vanilla 1:1——tryPlace 头 TileTargetDesired 门在锁空时恒直通;
//     hasSupport 平台并集（BJ10 3×3 兜底 :41663-41678 ∪ 正交邻墙 :41627-41631 ∪
//     足迹墙臂）对 vanilla 平台 canPlace 域无缺无超;悬空 2 格无墙失败=原版本相
//     （vanilla 同拒,Player.cs:41356-41678 全臂不中）。
//   · "开智能能放/关智能不能"主根=原版 Step_Platforms 目标重定位面本身:智能开时
//     续铺目标被搬到平台邻格（必过支撑门）,关智能时目标=鼠标格（悬空即原版拒）。
//   · BJ29/RB8a 旧修复真机在位:锁生命周期（置锁→关智能→清锁→放置放行）逐帧成立。
//   【残余真偏差 2 刀】
//   D1 stepPlatforms :1347 臂条件反写（`!flag` 应为 `flag`）——「鼠标水平对齐∧活动格
//      ∧非实心∧左右任一平台」的【非平台】格应被收编为续铺源;反写后臂只命中平台格
//      （零动作）⇒ 中断格（火把/草/杂隔断的行）两侧无法智能续铺,智能开域被缩水。
//   D3 updateSmartCursor blocked 表含 `!!this.minecart`——原版 SmartCursorLookup 调用
//      点（Player.cs:25640-25645）仅 whoAmI/IsCameraTrackingObject 两门,乘矿车不豁免
//      （矿车亦不拦使用链）⇒ 车上"智能开+持平台+按住"被 lookupSkipped 滞留锁+showing
//      恒 false ⇒ TileTargetDesired 拦死=「开智能反放不了」的状态依赖变体。
//
// 【原版锚】
//  - SmartCursorHelper.cs:1333-1398 Step_Platforms（:1346 flag 语义/:1347-1350 收编臂/
//    :1351 skip/:1381-1393 置锁）
//  - Player.cs:25640-25645 SmartCursorLookup 调用点（无矿车门）
//  - Player.cs:40032 PlaceThing_Tiles 头门（TileTargetDesired）
//  - SmartCursorHelper.cs:1400-1411 TileTargetDesired / :64-68 清锁门
//  - TriggersSet.cs:835-841 controlUseItem 电平（RB8a 面）
//  几何注:TileReachCheckSettings.Simple 垂直臂=±3（Player.tileRangeY=3,tileRegion
//  :1978 min(20,3)+tb）——平台行须落在玩家盒纵向 ±3 内,水平 ±5。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { T, TILE_BY_KEY } from '../src/data/tiles';
import type { ItemDef } from '../src/data/items';
import type { World } from '../src/world/World';
import { SmartCursor, DEFAULT_SMART_CURSOR_SETTINGS, type SmartCursorEnv } from '../src/player/SmartCursor';

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;
const PLAT_ITEM = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[94]]];   // 木平台 vid94
expect(PLAT_ITEM, '平台物品在册').toBeTruthy();

// ═══════════ A. D1：Step_Platforms 非平台续铺源收编臂（:1346-1351） ═══════════

const W = 220, H = 160;
const px = 100 * TILE, py = 95 * TILE;
function mkActor() {
  return { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, facing: 1 };
}
function mkEnv(st: TileStore, mouse: { x: number; y: number }, over: Partial<SmartCursorEnv> = {}): SmartCursorEnv {
  return {
    st,
    mouse,
    actor: mkActor(),
    held: { def: PLAT_ITEM, tool: null },
    settings: { ...DEFAULT_SMART_CURSOR_SETTINGS },
    tileBoost: 0,
    wireToolMode: 0,
    occupants: [],
    controlUseItem: true,
    ...over,
  };
}
function run(st: TileStore, mouse: { x: number; y: number }, sc = new SmartCursor()) {
  sc.wanted = true;
  sc.lookup(mkEnv(st, mouse));
  return { target: sc.showing ? { x: sc.x, y: sc.y } : null, lock: sc.lockedContinuity, dir: sc.lockedDirection };
}
const mouseAt = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 8 });
// 行 93 ∈ 玩家(95-97 行盒) reach y [92,102];列 95-99 ∈ x [95,106]
const ROW = 93;

describe('SW-BJ49 D1：Step_Platforms 非平台续铺源收编臂（SmartCursorHelper.cs:1346-1351）', () => {
  it('★主案 火把隔断行：鼠标水平对齐火把格 → 火把格收编为源,续铺目标越过隔断', () => {
    const st = new TileStore(W, H);
    for (let x = 95; x <= 97; x++) st.setTile(x, ROW, PLAT, 0, 0);   // 平台行 95-97
    st.setTile(98, ROW, T.TORCH, 0, 0);                              // 火把隔断（活动∧非实心∧非 tileCut）
    // 鼠标 (100,93)：与火把格水平对齐（dir.y=0）
    const r = run(st, mouseAt(100, ROW));
    // vanilla：源 (98,93)（火把:active∧!SolidTile∧左邻 97 平台）→ dir(1,0) → 目标 (99,93);
    // 平台源推进位全被占（96/97 平台,98 火把非 cut 被拒）→ 唯一候选
    expect(r.target).toEqual({ x: 99, y: ROW });
    expect(r.lock).toEqual({ x: 99, y: ROW });
    expect(r.dir).toEqual({ x: 1, y: 0 });
  });

  it('平台行正常续铺不回退（BJ10 语义保全）：单锚平台,鼠标水平对齐行端外两格', () => {
    const st = new TileStore(W, H);
    st.setTile(95, ROW, PLAT, 0, 0);
    const r = run(st, mouseAt(98, ROW));
    expect(r.target).toEqual({ x: 96, y: ROW });
    expect(r.dir).toEqual({ x: 1, y: 0 });
  });

  it('臂门逐项：非水平对齐（dir.y≠0）不收编——斜向鼠标下隔断格不产出越隔断目标', () => {
    const st = new TileStore(W, H);
    for (let x = 95; x <= 97; x++) st.setTile(x, ROW, PLAT, 0, 0);
    st.setTile(98, ROW, T.TORCH, 0, 0);
    // 鼠标 (99,92) 斜向：dir.y≠0 → 火把格(98,93)不收编;若误收编则 dir(1,-1) 会产出
    // (99,92)（距鼠标 0 必胜）。正确域=平台源(97,93) dir(1,-1) → 目标 (98,92)。
    const r = run(st, mouseAt(99, ROW - 1));
    expect(r.target).toEqual({ x: 98, y: ROW - 1 });
  });
});

// ═══════════ B/C. 壳测：矿车帧 + 状态矩阵 ═══════════

const P = { x: 20 * TILE + 2, y: 30 * TILE, w: 12, h: 28 };
const MOUSE = { x: 24 * TILE + 8, y: 32 * TILE + 8 };

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
  smartPresses?: boolean[];
  mouse?: { x: number; y: number };
  minecart?: Record<string, unknown> | null;
}

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
  g.minecart = o.minecart ?? null;
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
    // RB8a 电平面（TriggersSet.cs:835-841）
    mouseHeld: !!o.mouseDown,
    blockMouse: false,
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
  g.smartCursor = new SmartCursor();
  return g;
}

describe('SW-BJ49 D3：矿车帧智能光标管线不整支跳过（Player.cs:25640-25645）', () => {
  it('★主案 乘矿车+智能开+持平台+按住：lookup 全管线运行 → 续铺目标重定位+锁置位', () => {
    const { st, w } = mkWorld();
    st.setTile(20, 32, PLAT, 0, 0);   // 单锚平台（BJ29 同几何）
    const g = shell(w, { mouseDown: true, smartPresses: [true], minecart: { dead: false, mounted: true } });
    g.updateSmartCursor();
    expect(g.smartCursor.wanted).toBe(true);
    // 修复前:blocked(minecart) → lookupSkipped → showing 恒 false+锁不出 → 放置被门拦死
    expect(g.smartCursor.showing).toBe(true);
    expect(g.smartCursor.lockedContinuity).toEqual({ x: 21, y: 32 });
  });

  it('乘矿车+智能关：lookupSkipped 清锁路径不受影响（used=false ⇒ 双锁必清）', () => {
    const { st, w } = mkWorld();
    st.setTile(20, 32, PLAT, 0, 0);
    const g = shell(w, { mouseDown: true, minecart: { dead: false, mounted: true } });
    g.smartCursor.wanted = false;
    g.smartCursor.lockedContinuity = { x: 21, y: 32 };
    g.smartCursor.lockedDirection = { x: 1, y: 0 };
    g.smartCursor.showing = true;
    g.updateSmartCursor();
    expect(g.smartCursor.lockedContinuity).toBeNull();
    expect(g.smartCursor.lockedDirection).toBeNull();
    expect(g.smartCursor.showing).toBe(false);
  });
});

describe('SW-BJ49 状态矩阵：锁生命周期 × 使用电平（TriggersSet.cs:835-841）', () => {
  it('★切换瞬间按住放置：智能开置锁 → 松Ctrl再按关（按住鼠标不松）→ 锁清 → 鼠标格放置写格成功', () => {
    const { st, w } = mkWorld();
    st.setTile(20, 32, PLAT, 0, 0);
    // 沿队列:帧1 Ctrl 沿(开) → 帧2 松(沿不翻) → 帧3 再按(沿→关);鼠标全程按住
    const g = shell(w, { mouseDown: true, smartPresses: [true, false, true] });
    g.updateSmartCursor();
    expect(g.smartCursor.wanted).toBe(true);
    expect(g.smartCursor.lockedContinuity).toEqual({ x: 21, y: 32 });
    g.updateSmartCursor();   // 松 Ctrl:wanted 保持(toggle 模式沿触发)
    expect(g.smartCursor.wanted).toBe(true);
    g.updateSmartCursor();   // 再按:沿 → 关;used=false ⇒ 锁清
    expect(g.smartCursor.wanted).toBe(false);
    expect(g.smartCursor.lockedContinuity).toBeNull();
    expect(g.smartCursor.lockedDirection).toBeNull();
    // 智能关后 tryPlace 直通（tileTarget=鼠标格,门锁空恒真）
    g.tryPlace(21, 32, PLAT_ITEM);
    expect(st.type[st.idx(21, 32)]).toBe(PLAT);
  });

  it('★电平判别力：mouseDown 闩已消费（=false）而 mouseHeld 电平在 → 锁向优先推进不改道', () => {
    const { st, w } = mkWorld();
    st.setTile(20, 32, PLAT, 0, 0);
    const g = shell(w, { mouseDown: true, smartPresses: [true] });
    g.updateSmartCursor();
    expect(g.smartCursor.lockedContinuity).toEqual({ x: 21, y: 32 });
    expect(g.smartCursor.lockedDirection).toEqual({ x: 1, y: 0 });
    // 第二帧:mouseDown 闩已被消费（真实管线语义）,电平 mouseHeld 仍按住;鼠标斜移
    // (22,34)——几何量化方向=(1,1),锁在则 GetDesiredDirectionFrom 锁向优先
    // （SmartCursorHelper.cs:1440-1443）→ dir 仍 (1,0) → 目标仍沿线 (21,32)。
    // 若 controlUseItem 退化为边沿量（RB8a 旧码）:本帧清锁 → 量化改道 → 目标 (21,33)。
    g.input.mouseDown = false;
    g.input.mouseHeld = true;
    g.input.mouseX = 22 * TILE + 8;
    g.input.mouseY = 34 * TILE + 8;
    g.updateSmartCursor();
    expect(g.smartCursor.lockedDirection).toEqual({ x: 1, y: 0 });
    expect(g.smartCursor.showing).toBe(true);
    expect(g.smartCursor.x).toBe(21);
    expect(g.smartCursor.y).toBe(32);
  });

  it('关智能直接放置端到端：wanted=false + 鼠标格合法 → 写格成功（主报域基线）', () => {
    const { st, w } = mkWorld();
    st.setTile(20, 32, PLAT, 0, 0);
    const g = shell(w, { mouseDown: false });
    g.updateSmartCursor();
    expect(g.smartCursor.wanted).toBe(false);
    expect(g.smartCursor.lockedContinuity).toBeNull();
    g.tryPlace(21, 32, PLAT_ITEM);   // 行端相邻格
    expect(st.type[st.idx(21, 32)]).toBe(PLAT);
  });

  it('悬空 2 格无墙：关智能放置拒绝=原版本相（Player.cs:41356-41678 全臂不中）', () => {
    const { st, w } = mkWorld();
    st.setTile(20, 32, PLAT, 0, 0);
    const g = shell(w, { mouseDown: false });
    g.tryPlace(25, 32, PLAT_ITEM);   // 距锚 5 格,3×3 无 active 无墙
    expect(st.hasTile(25, 32)).toBe(false);
  });
});

// ═══════════ D. 结构锁 ═══════════

describe('SW-BJ49 结构锁', () => {
  it('updateSmartCursor blocked 表不再含矿车臂（D3 修复在位）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/core/Game.ts', 'utf8');
    const head = src.slice(src.indexOf('private updateSmartCursor()'), src.indexOf('private updateSmartSelect()'));
    expect(head).not.toMatch(/\|\| !!this\.minecart/);
    expect(head).toMatch(/this\.player\.dead\n\s*\|\| this\.renderer\.fullMap\.open/);
  });

  it('stepPlatforms 收编臂条件=flag（D1 修复在位,勿再反写）', async () => {
    const src = await (await import('node:fs/promises')).readFile('src/player/SmartCursor.ts', 'utf8');
    expect(src).toMatch(/if \(flag && dir\.y === 0 && hasTileAt\(st, i, j\) && !solidTile\(st, i, j\)/);
    expect(src).not.toMatch(/if \(!flag && dir\.y === 0/);
  });
});
