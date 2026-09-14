// SW-BJ25 2026-09-07 NPC 交互范围覆盖可交互格——格交互优先级（用户实报附截图：
// 向导旁猪猪存钱罐右键弹出向导对话框而非存钱罐界面）
// ★FX23 2026-09-14 翻案终审：本文件原判「格交互恒赢」（任务书诚实偏离）被用户
//   复测推翻——右键向导（帧盒罩住其脚下格=工作台/箱）→ 物品栏直开、对话不开
//   （FX23 探针 R2 栈实锤：interactAt 合成站臂 ← rightClickTileNpcDispatch）。终审
//   回归原版 Player.cs:32188-32197 交谈闩全臂化：光标悬停城镇 NPC 帧盒
//   （currentNPCShowingChatBubble>-1 ∧ (talkNPC==-1 ∨ !npcChatRelease)）⇒
//   releaseUseTile=false ⇒ :32414 if(flag) 包住的全部标准格交互支让位 ⇒ 交谈臂
//   （Main.cs:43807）开对话。仓内实现 = rightClickTileNpcDispatch 头 bubbleLatch
//   （BJ66 坐椅支同式谓词；物品层右键臂——矿车套件/可疑之眼/altUse 放置族——
//   原版属 ItemCheck 域不受闩辖）。BJ25 猪罐主诉存活面 = 光标落在罐格且在帧盒
//   【外】→ 格臂照常（原版两案自洽,见 ①(b)/③/④ 改测）。
//
// 原版仲裁链（1457 反编译；1458 SetDefaults 零变更不改交互面）：
//   ①格交互 = LookForTileInteractions（Player.cs:32159）→ TileInteractionsCheck
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
//   ⑤交谈闩 = LookForTileInteractions :32188-32197（FX23 回归 1:1,见上翻案注）。
//
// 仓库修复（Game.ts rightClickTileNpcDispatch，本批从 updateUse 右键块抽出）：
//   序 = 交谈闩（FX23）→ 宝箱 ±1 → 矿车套件 → 可疑之眼 → altUse 放置族 →
//   interactAt 全格交互 → NPC 交谈（旗代理 = rightDown 未被格臂消费；边沿 =
//   npcChatRelease Main.cs:45755-45763 ≡ !prevRightDown）。旧序（宝箱→交谈→
//   其余格交互）使非箱容器/牌/床被交谈抢先 = BJ25 实报病根（其光标在帧盒外的
//   部分由闩外路径继续覆盖）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, T } from '../src/data/tiles';
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
  // ★SW-RB7 2026-09-08：`t[k as number]` 直转 string|symbol→number 触 TS2352——经
  //  PropertyKey 键域读取（语义同值）,清 tsc 触碰文件零错
  const fx: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? (t as Record<PropertyKey, number>)[k] : 0),   // 真身 TypedArray 默认 0（未写帧=0）
  });
  const fy: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? (t as Record<PropertyKey, number>)[k] : 0),
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
// ① 交谈闩（FX23 翻案终审）：光标在向导帧盒内 = 对话赢（原版 :32188 闩全臂化）；
//    光标在帧盒外落在猪罐格 = 开罐（BJ25 主诉存活面）
// ---------------------------------------------------------------------------
describe('SW-BJ25 ① 交谈闩终审：帧盒内=对话赢；帧盒外猪罐=开罐', () => {
  it('(a) 光标在猪罐 tile 且同时落在向导帧盒内 → 闩施放 = 开对话、罐不开（原版 :32188）', () => {
    const rig = makeRig({ tileAt: { [`${PIGGY_TILE[0]},${PIGGY_TILE[1]}`]: piggyType } });
    const [mx, my] = CURSOR_ON_PIGGY;
    // 前置自证：该光标确实同时命中向导绘制帧盒（闩的施放面）
    expect((rig.g as AnyGame).npcHoverHit(22, mx, my, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);
    expect((rig.g as AnyGame).worldRegionIntersects(GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);

    const early = (rig.g as AnyGame).rightClickTileNpcDispatch(PIGGY_TILE[0], PIGGY_TILE[1], null);
    expect(early).toBe(false);
    expect(rig.dialogOpened).toEqual([GUIDE]);           // ★FX23：闩让格臂全让位 → 交谈臂开对话
    expect(rig.chestsOpened).toEqual([]);                // 储物臂被闩压制（releaseUseTile=false 面）
    expect(rig.g.input.rightDown).toBe(false);           // 交谈臂自消（:43800 消费面）
  });

  it("(b) 光标落在猪罐格但在向导帧盒外（BJ25 主诉存活面）→ 开 bank 面板、交谈零调用", () => {
    // 罐移到 tile (10,11)（中心 168,184）——x<180 在帧盒 [180,220) 外
    const rig = makeRig({ tileAt: { '10,11': piggyType } });
    rig.g.input.mouseX = 168; rig.g.input.mouseY = 184;
    expect((rig.g as AnyGame).npcHoverHit(22, 168, 184, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 11, null);
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
//    （★FX23：光标在帧盒外时箱臂照常——帧盒内则闩让对话赢,见 ①(a)）
// ---------------------------------------------------------------------------
describe('SW-BJ25 ③ 锁箱失败支置旗压制交谈（原版 flag2 分支入口语义）', () => {
  it('宝箱臂命中（光标帧盒外,即便锁箱不开）→ rightDown 消费 → 交谈零调用', () => {
    const rig = makeRig({ tileAt: {} });
    rig.g.input.mouseX = 170; rig.g.input.mouseY = 180;  // 帧盒 [180,220) 外 → 闩不施放
    const locked = { locked: true, x: 100, y: 100, items: [] };
    // ★SW-BJ52 2026-09-10：箱命中域收原版精确域（findChestNear 3×3 容差根除，
    // Player.cs:33314 本体门+:33317 帧回溯+:33497 FindChest 精确查）→ 箱臂桩换
    // findChest + 光标 tile 置箱族（T.CHEST∪sheet21）。优先级语义（本文件主旨）
    // 不变：箱臂命中即消费 rightDown 压制交谈。
    rig.g.wiring = { sheetOf: () => 21 };
    rig.g.world.store = {
      ...rig.g.world.store,
      get: (x: number, y: number) => (x === 12 && y === 11 ? T.CHEST : 0),
      hasTile: (x: number, y: number) => x === 12 && y === 11,
    };
    rig.g.findChest = () => locked;
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.tryOpenCalls).toEqual([locked]);          // tryOpenChest 被调（内部失败支自处）
    expect(rig.dialogOpened).toEqual([]);                // :33551 置旗 → :43807 压制
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('★FX23 翻案面：同箱几何、光标在向导帧盒内 → 闩施放 = 开对话、箱不开', () => {
    const rig = makeRig({ tileAt: {} });
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;  // 帧盒内 → bubbleLatch 施放
    rig.g.wiring = { sheetOf: () => 21 };
    rig.g.world.store = {
      ...rig.g.world.store,
      get: (x: number, y: number) => (x === 12 && y === 11 ? T.CHEST : 0),
      hasTile: (x: number, y: number) => x === 12 && y === 11,
    };
    rig.g.findChest = () => ({ locked: true, x: 100, y: 100, items: [] });
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.tryOpenCalls).toEqual([]);                // 箱臂被闩压制（releaseUseTile=false 面）
    expect(rig.dialogOpened).toEqual([GUIDE]);           // 交谈臂放行（:43807）
    expect(rig.g.input.rightDown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ④ 牌/床同类采样：非箱可交互格在【帧盒外】照常工作（帧盒内=闩让对话赢,①(a)）
// ---------------------------------------------------------------------------
describe('SW-BJ25 ④ 牌/床同类采样（帧盒外格臂照常,FX23 终审面）', () => {
  it('告示牌（sh=55）光标落在牌格且在向导帧盒外 → 开牌编辑器不弹对话', () => {
    const rig = makeRig({ tileAt: { '10,11': 999999 }, wiringSheet: 55 });
    rig.g.input.mouseX = 168; rig.g.input.mouseY = 180;  // x<180 帧盒外 → 闩不施放
    expect((rig.g as AnyGame).npcHoverHit(22, 168, 180, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 11, null);
    expect(rig.signEdits).toEqual([[10, 11]]);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('床（脚端 frameX=72 档）光标落在床格且在向导帧盒外 → 入睡支静默终止仍消费右键', () => {
    const idx = 11 * 400 + 10;
    const rig = makeRig(
      { tileAt: { '10,11': bedType }, frames: { [idx]: [72, 0] } },
    );
    rig.g.input.mouseX = 168; rig.g.input.mouseY = 184;  // (168,184) 在向导帧盒 [180,220) 外
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 11, null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);           // 床支尾部自消（分支命中=置旗面）
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
// ⑦ 超射程早退支不置旗（★SW-RB7 2026-09-08 清偿 BJ25 头注登记债）：
//    原版 Player.cs:32191-32197 超射程整段不进 TileInteractionsUse ⇒ flag2 恒
//    false ⇒ tileInteractionHappened 不置位 ⇒ :43807 交谈臂放行（BH1 交谈射程盒
//    worldRegion 与 tileRange 5/3 异形——NPC 帧盒探出 tile 区的头顶带原版可交谈）。
//    旧 interactAt 早退支 `rightDown=false` 把交谈与 6190/2611 快换臂整压=偏差。
// ---------------------------------------------------------------------------
describe('SW-BJ25 ⑦ 超射程 tile 交互不置旗：交谈照常（RB7）', () => {
  it('光标 tile 超射程（20,20）+ 帧盒悬停交谈射程内 → 开对话（不静默）', () => {
    const rig = makeRig({ tileAt: { '20,20': piggyType } });   // 罐在 tile 区外
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;        // 向导帧盒内（交谈射程 worldRegion 内）
    (rig.g as AnyGame).rightClickTileNpcDispatch(20, 20, null);
    expect(rig.chestsOpened).toEqual([]);                      // 超射程不进格交互（:32191 门）
    expect(rig.dialogOpened).toEqual([GUIDE]);                 // :43807 !tileInteractionHappened 放行
    expect(rig.g.input.rightDown).toBe(false);                 // 交谈臂自消（:43800 消费面）
  });

  it('超射程 + 无 NPC 悬停 → rightDown 保持（旧码此处误消费,压制 6190/2611 快换臂）', () => {
    const rig = makeRig({ tileAt: { '20,20': piggyType } });
    rig.g.entities.npcs = [];
    rig.g.input.mouseX = 700; rig.g.input.mouseY = 300;        // 帧盒外
    (rig.g as AnyGame).rightClickTileNpcDispatch(20, 20, null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(true);                  // ★RB7：不再被早退支吞
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
