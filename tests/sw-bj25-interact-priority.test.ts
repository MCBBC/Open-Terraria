// SW-BJ25 2026-09-07 NPC 交互范围覆盖可交互格——格交互优先级（用户实报附截图：
// 向导旁猪猪存钱罐右键弹出向导对话框而非存钱罐界面）
//
// 原版仲裁链（1457 反编译；1458 SetDefaults 零变更不改交互面）：
//   ①格交互先行 = LookForTileInteractions（Player.cs:32159）→ TileInteractionsCheck
//     （:32273 active() 门）→ TileInteractionsUse（:32358）——容器族
//     `TileID.Sets.BasicChest[21,467] ∪ 29 猪罐 ∪ 97 保险箱 ∪ 463 ∪ 491`（:33314）
//     分支命中即置 flag2 → tileInteractionHappened = true（:33551）——锁箱失败支
//     同样置旗（flag2 在分支入口置位，num77=-1 只是不开）。
//   ②交谈被压 = HoverOverNPCs（Main.cs:43715）:43807 `talkNPC != i &&
//     !tileInteractionHappened`——格交互发生 ⇒ 本帧交谈被压制。
//   ③旗重置 = LookForTileInteractions 头 `if (releaseUseTile)
//     tileInteractionHappened = false`（Player.cs:32183-32186，右键闩释放态每帧清）。
//   ④智能支 = flag2 智能臂（Main.cs:43743 SmartInteractShowingGenuine）同样被
//     ②压制；城镇 NPC 射程门 = worldRegion ∩ 命中盒（:43778，BH1 已移植）。
//   ★诚实偏离声明（任务书裁决）：原版光标同时命中 NPC 绘制帧盒与可交互格时，
//   Player.cs:32190 消费闩（currentNPCShowingChatBubble 悬停帧盒 ⇒ 消费
//   releaseUseTile ⇒ 格臂被跳）使 NPC 赢——本仓按任务书判「格交互先行」：
//   可交互格（容器/牌/床/致动）恒赢过帧盒悬停。其余旗/边沿语义 1:1。
//
// 仓库修复（Game.ts rightClickTileNpcDispatch，本批从 updateUse 右键块抽出）：
//   序 = 宝箱 ±1 → 矿车套件 → 可疑之眼 → altUse 放置族 → interactAt 全格交互
//   → NPC 交谈（旗代理 = rightDown 未被格臂消费；边沿 = npcChatRelease
//   Main.cs:45755-45763 ≡ !prevRightDown）。旧序（宝箱→交谈→其余格交互）使
//   非箱容器/牌/床被交谈抢先 = 实报病根。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';

type AnyGame = Record<string, any>;

const SRC = readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');

/** 参照几何（BH1 同款玩家桩 x=160,y=160,w=20,h=42；tileReach 5/3）：
 *  tile 区 x∈[5,16] y∈[7,15]。向导踩猪罐右邻 tile 12（盒 191..209 × 152..192，
 *  底心 (200,192)）；绘制帧盒 40×56 = [180,220)×[136,192)——猪罐 tile (11,11)
 *  中心 (184,184) 在帧盒内（旧序在此命中交谈=实报复现点）。 */
const PIGGY_TILE: [number, number] = [11, 11];
const CURSOR_ON_PIGGY: [number, number] = [184, 184];
const GUIDE = { vanillaId: 22, x: 191, y: 152, w: 18, h: 40, id: 1, bound: false, dead: false };

const piggyType = TILE_BY_KEY['v_29_piggy_bank'] ?? -1;
const bedType = TILE_BY_KEY['bed'] ?? -2;

/** 假 store：tileAt[(x,y)]→type，frame/idx 由用例按需注入 */
function makeStore(tileAt: Record<string, number>, frames: Record<number, [number, number]> = {}) {
  const W = 400;
  const fx: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? t[k as number] : 0),          // 真身 TypedArray 默认 0（未写帧=0）
  });
  const fy: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? t[k as number] : 0),
  });
  for (const [k, [a, b]] of Object.entries(frames)) fx[Number(k)] = a, fy[Number(k)] = b;
  return {
    w: W, h: 400,
    get: (x: number, y: number) => tileAt[`${x},${y}`] ?? 0,
    hasTile: (x: number, y: number) => (tileAt[`${x},${y}`] ?? 0) !== 0,
    idx: (x: number, y: number) => y * W + x,
    frameX: fx, frameY: fy,
  };
}

/** Game 原型桩（achievements-trigger-surface / sw-bh1 同式；格交互分派直驱） */
function makeRig(opts: {
  tileAt?: Record<string, number>;
  frames?: Record<number, [number, number]>;
  wiringSheet?: number | null;
  prevRightDown?: boolean;
  smartId?: number;
} = {}) {
  const dialogOpened: unknown[] = [];
  const chestsOpened: Array<{ x: number }> = [];
  const signEdits: Array<[number, number]> = [];
  const toggles: Array<[number, number, number]> = [];
  const tryOpenCalls: unknown[] = [];
  const sfx: string[] = [];
  let panel: { x: number } | null = null;
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    x: 160, y: 160, w: 20, h: 42, cx: 170, cy: 181,
    useTime: 0, vx: 0, facing: 1, ridingMount: false, mount: { type: 0 },
    buffs: { has: () => false },
    inv: { heldItem: () => null, removeHeld: () => {} },
    equipStats: { tileRange: false, toolboxRange: 0 },
    banks: [[], [], [], []],
  };
  g.world = { store: makeStore(opts.tileAt ?? {}, opts.frames), flags: {}, clock: { isDay: true }, isJourney: false, chests: [] };
  g.camera = {
    tileUnder: (mx: number, my: number): [number, number] => [Math.floor(mx / TILE), Math.floor(my / TILE)],
    screenToWorld: (mx: number, my: number): [number, number] => [mx, my],   // 恒等：mouseX/Y 即世界像素
  };
  g.renderer = { atlas: { vnpc: () => ({ sw: 40, sh: 56 }) } };               // 向导帧盒 40×56（NPC_22 条带实载同值）
  g.entities = { enemies: [], npcs: [GUIDE], projectiles: [] };
  g.input = { rightDown: true, mouseX: CURSOR_ON_PIGGY[0], mouseY: CURSOR_ON_PIGGY[1], mouseHeld: false };
  g._prevRightDown = opts.prevRightDown ?? false;
  g.smartInteractNpcId = opts.smartId ?? -1;
  g.dialogNpc = null;
  g.petFollower = null;
  g.lightPetFollower = null;
  g.wiring = opts.wiringSheet == null ? null : { sheetOf: () => opts.wiringSheet };
  g.net = undefined;
  g.openChestRef = () => panel;
  g.openChest = (c: { x: number }) => { panel = c; chestsOpened.push(c); };
  g.closeChestPanel = () => { panel = null; };
  g.openNpcDialog = (n: unknown) => { dialogOpened.push(n); };
  g.freeBoundNpc = () => {};
  g.wakeBoundEnemyNpc = () => {};
  g.openSignEditor = (x: number, y: number) => { signEdits.push([x, y]); g.input.rightDown = false; };
  g.toggleSwitch = (x: number, y: number, t: number) => { toggles.push([x, y, t]); g.input.rightDown = false; };
  g.canSnapPlayerTo = () => false;                                            // 床：堵塞态静默终止（:165-169 旗门）
  g.tryOpenChest = (c: unknown) => { tryOpenCalls.push(c); };                 // 锁箱失败支：内里不开（仅声/消息）
  g.sfx = { play: (n: string) => { sfx.push(n); } };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {}, onClothesWindow: () => {}, onReadSign: () => {} };
  g.achievements = { handleSpecialEvent: () => {} };
  return { g, dialogOpened, chestsOpened, signEdits, toggles, tryOpenCalls, sfx };
}

// ---------------------------------------------------------------------------
// ① 猪罐在 NPC 旁 → 右键猪罐 = 开罐界面，不弹对话（实报主诉）
// ---------------------------------------------------------------------------
describe('SW-BJ25 ① 格交互先行：向导旁猪罐右键=开罐不弹对话', () => {
  it('光标在猪罐 tile（同时落在向导帧盒内）→ 开 bank 面板（chest=-2）、交谈零调用、rightDown 消费', () => {
    const rig = makeRig({ tileAt: { [`${PIGGY_TILE[0]},${PIGGY_TILE[1]}`]: piggyType } });
    const [mx, my] = CURSOR_ON_PIGGY;
    // 前置自证：该光标确实同时命中向导绘制帧盒（旧序 talkToNearbyNpc 会抢先开对话）
    expect((rig.g as AnyGame).npcHoverHit(22, mx, my, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);
    expect((rig.g as AnyGame).worldRegionIntersects(GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);

    const early = (rig.g as AnyGame).rightClickTileNpcDispatch(PIGGY_TILE[0], PIGGY_TILE[1], null);
    expect(early).toBe(false);
    expect(rig.chestsOpened).toEqual([{ x: -2, y: 0, items: [] }]);  // bank0 = chest -2（原版 :33352 num77=-2）
    expect(rig.dialogOpened).toEqual([]);                // 交谈被旗代理压制（:43807 !tileInteractionHappened）
    expect(rig.g.input.rightDown).toBe(false);           // 罐臂自消 rightDown（=原版置旗面）
    expect(rig.sfx).toContain('menuOpen');
  });

  it('同几何、tile 不可交互（air）→ 光标帧盒悬停交谈照常（悬停门 BH1/BJ1 保留）', () => {
    const rig = makeRig({ tileAt: {} });                 // 光标格 air
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;  // 向导帧盒 [180,220)×[136,192) 内
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.dialogOpened).toEqual([GUIDE]);
    expect(rig.g.input.rightDown).toBe(false);
    expect(rig.chestsOpened).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ② 交谈边沿门 = npcChatRelease（Main.cs:45755-45763 !mouseRight；:43800 消费）
// ---------------------------------------------------------------------------
describe('SW-BJ25 ② 交谈边沿门：按住右键滑到 NPC 上不交谈', () => {
  it('prevRightDown=true（按住中）+ 帧盒悬停 + 无格交互 → 不开对话、rightDown 保持', () => {
    const rig = makeRig({ prevRightDown: true });        // tile air
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(true);            // 未被任何臂消费（原版闩语义）
  });
});

// ---------------------------------------------------------------------------
// ③ 锁箱失败支：格臂命中即置旗（Player.cs :33314 分支入口 flag2 → :33551）→ 不交谈
// ---------------------------------------------------------------------------
describe('SW-BJ25 ③ 锁箱失败支置旗压制交谈（原版 flag2 分支入口语义）', () => {
  it('宝箱臂命中（即便锁箱不开）→ rightDown 消费 → 交谈零调用', () => {
    const rig = makeRig({ tileAt: {} });
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;  // 光标同时在向导帧盒上
    const locked = { locked: true, x: 100, y: 100, items: [] };
    rig.g.findChestNear = () => locked;
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.tryOpenCalls).toEqual([locked]);          // tryOpenChest 被调（内部失败支自处）
    expect(rig.dialogOpened).toEqual([]);                // :33551 置旗 → :43807 压制
    expect(rig.g.input.rightDown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ④ 牌/床同类采样：非箱可交互格同样赢过帧盒悬停交谈
// ---------------------------------------------------------------------------
describe('SW-BJ25 ④ 牌/床同类优先级采样', () => {
  it('告示牌（sh=55）在向导帧盒下 → 开牌编辑器不弹对话', () => {
    const rig = makeRig({ tileAt: { '12,11': 999999 }, wiringSheet: 55 });
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;
    expect((rig.g as AnyGame).npcHoverHit(22, 200, 180, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.signEdits).toEqual([[12, 11]]);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('床（脚端 frameX=72 档）在向导帧盒下 → 入睡支静默终止仍消费右键，不弹对话', () => {
    const idx = 11 * 400 + 11;
    const rig = makeRig(
      { tileAt: { '11,11': bedType }, frames: { [idx]: [72, 0] } },
    );
    const [mx, my] = CURSOR_ON_PIGGY;                    // (184,184) 在向导帧盒内
    (rig.g as AnyGame).rightClickTileNpcDispatch(11, 11, null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);           // 床支尾部自消（分支命中=置旗面）
    expect(mx).toBe(184); expect(my).toBe(184);          // 几何自证（防夹具漂移空转）
  });
});

// ---------------------------------------------------------------------------
// ⑤ talkNPC != i 门（Main.cs:43807）：对话中同体右键不重谈；另一体可换谈
// ---------------------------------------------------------------------------
describe('SW-BJ25 ⑤ talkNPC != i 门 + 智能支在旗代理下仍可达', () => {
  it('对话已开在同体 → talkToNearbyNpc 对同体不再返回 true', () => {
    const rig = makeRig({ tileAt: {} });
    rig.g.dialogNpc = GUIDE;
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;  // 帧盒悬停同体
    expect((rig.g as AnyGame).talkToNearbyNpc(200, 180)).toBe(false);
    expect(rig.dialogOpened).toEqual([]);
  });

  it('对话中右键另一 NPC（体不同）→ 换谈照常（i 不同即过 :43807）', () => {
    const rig = makeRig({ tileAt: {} });
    const other = { ...GUIDE, x: 260, y: 152, id: 2 };   // 帧盒 [240,280)×[136,192)
    rig.g.dialogNpc = GUIDE;
    rig.g.entities.npcs = [GUIDE, other];
    rig.g.input.mouseX = 260; rig.g.input.mouseY = 180;
    expect((rig.g as AnyGame).talkToNearbyNpc(260, 180)).toBe(true);
    expect(rig.dialogOpened).toEqual([other]);
  });

  it('智能支（BJ1）存活：光标不在帧盒上、tile air（不置旗）→ smartId 命中即交谈', () => {
    const rig = makeRig({ tileAt: {}, smartId: 1 });     // GUIDE.id = 1
    rig.g.input.mouseX = 264; rig.g.input.mouseY = 180;  // tile 16 在射程内、帧盒 [180,220) 外
    (rig.g as AnyGame).rightClickTileNpcDispatch(16, 11, null);
    expect(rig.dialogOpened).toEqual([GUIDE]);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 结构锁：分派序 = 宝箱→套件→眼→altUse→interactAt→交谈（防静默回退）
// ---------------------------------------------------------------------------
describe('SW-BJ25 ⑥ 结构锁（源文本锚）', () => {
  const mStart = SRC.indexOf('private rightClickTileNpcDispatch');
  const mEnd = SRC.indexOf('private interactAt(', mStart);
  const body = SRC.slice(mStart, mEnd);

  it('交谈臂在 interactAt 之后（格交互先行）', () => {
    expect(mStart).toBeGreaterThan(0);
    const iChest = body.indexOf('this.tryOpenChest(nearChest)');
    const iInteract = body.indexOf('this.interactAt(tx, ty)');
    const iTalk = body.indexOf('this.talkToNearbyNpc(');
    expect(iChest).toBeGreaterThan(-1);
    expect(iInteract).toBeGreaterThan(iChest);
    expect(iTalk).toBeGreaterThan(iInteract);
    // 旗代理 + 边沿门在交谈臂上（条件行先于 talkToNearbyNpc 调用行）
    const iGuard = body.indexOf('this.input.rightDown && !this._prevRightDown');
    expect(iGuard).toBeGreaterThan(iInteract);
    expect(iGuard).toBeLessThan(iTalk);
  });

  it('旧「宝箱→交谈→其余格交互」中位交谈臂已移除（全仓唯一右键交谈消费点在新方法内）', () => {
    expect(SRC.includes('} else if (this.talkToNearbyNpc(')).toBe(false);
    expect(SRC.split('rightClickTileNpcDispatch(tx, ty, heldDef)').length).toBe(2); // 1 调用点
  });

  it('调用点在 updateUse 右键块内、6190 快换块之前（交谈先于尾段 alt 物品臂消费）', () => {
    const iCall = SRC.indexOf('rightClickTileNpcDispatch(tx, ty, heldDef)');
    const i6190 = SRC.indexOf('旧世界跑酷指南 6190↔6195', iCall);
    expect(i6190).toBeGreaterThan(iCall);
  });
});
