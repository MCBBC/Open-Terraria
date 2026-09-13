// SW-BJ66 2026-09-13 坐姿 NPC 交互仲裁 + 占椅占用（用户实报：NPC 已坐椅子时点击
// NPC 对话，玩家角色也坐到了那把椅子上——对话/落座两臂同拍皆触发）
//
// 原版仲裁链（1457 反编译；1458 SetDefaults 零变更不改交互面）：
//   ①交谈闩 = LookForTileInteractions（Player.cs:32183-32197）：press 拍上
//     `currentNPCShowingChatBubble > -1 && (talkNPC == -1 || !npcChatRelease)`
//     ⇒ releaseUseTile=false——气泡候选 = HoverOverNPCs（Main.cs:43716-43812）
//     绘制帧盒悬停（:43722-43724）∨ 智能候选（:43743）→ townNPC 族过射程盒
//     （:43775-43782）→ 否决 651/stinky（:43785）。
//   ②格臂被跳 = TileInteractionsUse（Player.cs:32364 `bool flag = releaseUseTile`）
//     → :32414 `if (flag)` 包住全部标准格交互支（坐椅支 :32560-32576 在内）——
//     闩被交谈消费 ⇒ 坐椅 SitDown 不跑 ⇒ tileInteractionHappened 不置位。
//   ③交谈放行 = Main.cs:43807 `talkNPC != i && !tileInteractionHappened` ⇒ 开对话。
//   ④占椅占用 = SitDown 门（PlayerSittingHelper.cs:112-118 `sittingManager
//     GetNextPlayerStackIndexInCoords(座位格) < 2`，席位表 NPC+玩家同坐标计数
//     AnchoredEntitiesCollection.cs:53-68；坐姿 NPC 每帧登记 NPC.cs:54849）+
//     UpdateSitting 挤落（Helper.cs:66-68 count≥2 → SitUp）——落座当帧 count=1
//     过门、次帧挤落 = 原版「占椅不可坐」净效果。
//   ★SW-BJ25 任务书偏差「格交互先行」（容器/牌/床/致动恒赢帧盒悬停）本批收窄：
//   仅坐椅支回收原版 NPC 优先（①-③ 1:1）；坐姿 NPC 绘制帧盒罩住其椅格，
//   不回收即实报「点坐姿 NPC 玩家落座」。
//
// 仓库修复：Game.ts interactAt 坐椅支闩（npcChatBubbleHovered × (!dialogNpc ∨
// prevRightDown)）+ sitDownAt 占用门 + updateSitting 挤落 + anchoredSeatsAt。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';

type AnyGame = Record<string, any>;

const SRC = readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');

/** 几何（player-sitting.test.ts 同款椅格语义）：木椅 style0 两格——上 (40,30)
 *  frameY=0 / 下 (40,31) frameY=20。点击下格 (40,31)：frameY%40=20≠0 → num2=30 →
 *  sittingX=40*16+8−6=642, sittingY=31*16+16=512（=玩家 Bottom 目标）。
 *  占用门/挤落坐标 = (Bottom+(0,-2))格 = (40,31)=椅下格（=坐姿 NPC 登记格，
 *  NPC.cs:54843-54845/:55952 Bottom=地面行顶 512）。 */
const CHAIR_UPPER: [number, number] = [40, 30];
const CHAIR_LOWER: [number, number] = [40, 31];
const SIT_X = 40 * TILE + 8 - 6;          // 642（frameX=0 → targetDirection −1）
const SIT_Y = 31 * TILE + 16;             // 512
const CURSOR: [number, number] = [648, 504];   // 椅下格中心，同时落在 NPC 帧盒内
const chairTile = TILE_BY_KEY['chair']!;

/** 坐姿城镇 NPC 桩：Bottom=512（地面行顶）、cx=650（=40*16+8+2*dir 落座锚，
 *  sittingAnchor TownNPC.ts:183）——Bottom−2px 格=(40,31)=椅下格=占用计数格 */
const SEATED_NPC = {
  id: 7, vanillaId: 22, x: 641, y: 472, w: 18, h: 40,
  cx: 650, bound: false, dead: false, sitting: true,
};

/** 真 TypedArray store（getSittingTargetInfo 直读 type/flags/frameX/frameY） */
function makeStore(pairs: Array<[number, number, number, number, number]>) {
  const W = 400, H = 400;
  const type = new Uint16Array(W * H), flags = new Uint8Array(W * H);
  const fx = new Uint16Array(W * H), fy = new Uint16Array(W * H);
  for (const [x, y, tile, a, b] of pairs) {
    const i = y * W + x;
    type[i] = tile; flags[i] = 1; fx[i] = a; fy[i] = b;
  }
  return {
    w: W, h: H, type, flags, frameX: fx, frameY: fy,
    get: (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : type[y * W + x]),
    hasTile: (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : flags[y * W + x]),
    idx: (x: number, y: number) => y * W + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
    isSolid: () => false,
    isPlatform: () => false,
  };
}

/** Game 原型桩（sw-bj25 同式）：玩家立于椅左邻（cx=648 / Bottom=486 →
 *  withinSnapRange(40,31,40)=hypot(0,18)=18≤40 ✓；射程盒罩住椅格与 NPC） */
function makeRig(opts: {
  npc?: typeof SEATED_NPC | null;
  stinky?: boolean;
  dialogNpc?: unknown;
  prevRightDown?: boolean;
  smartId?: number;
  frameBox?: { sw: number; sh: number };
  cursor?: [number, number];
  preseat?: boolean;                       // 玩家已坐在本椅（同位态）
} = {}) {
  const dialogOpened: unknown[] = [];
  const stationOpens: unknown[] = [];
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  const px = SIT_X - 10, py = SIT_Y - 42 - (SIT_Y - 42 - 444);   // 预坐=落座位；否则立于邻格
  const player = {
    x: opts.preseat ? SIT_X - 10 : 638,
    y: opts.preseat ? SIT_Y - 42 : 444,
    w: 20, h: 42,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    get bottomY() { return this.y + this.h; },
    facing: 1, vx: 0, vy: 0, useTime: 0,
    sitting: !!opts.preseat, sitTicks: 0,
    seatOffsetX: 0, seatOffsetY: 0, seatIsToilet: false,
    onRope: false, ridingCart: false, ridingMount: false,
    removeAllGrapplingHooks: () => {},
    buffs: { has: (b: number) => (opts.stinky ? b === BuffType.Stinky : false) },
    inv: { heldItem: () => null, removeHeld: () => {} },
    equipStats: { tileRange: false, toolboxRange: 0, killClothier: false },
    banks: [[], [], [], []],
  };
  void px; void py;
  g.player = player;
  g.world = {
    store: makeStore([
      [CHAIR_UPPER[0], CHAIR_UPPER[1], chairTile, 0, 0],
      [CHAIR_LOWER[0], CHAIR_LOWER[1], chairTile, 0, 20],
    ]),
    flags: {}, clock: { isDay: true }, isJourney: false, chests: [],
  };
  g.camera = {
    tileUnder: (mx: number, my: number): [number, number] => [Math.floor(mx / TILE), Math.floor(my / TILE)],
    screenToWorld: (mx: number, my: number): [number, number] => [mx, my],   // 恒等：mouseX/Y 即世界像素
  };
  g.renderer = { atlas: { vnpc: () => ({ ...(opts.frameBox ?? { sw: 40, sh: 56 }) }) } };
  g.entities = { enemies: [], npcs: opts.npc ? [opts.npc] : [], projectiles: [] };
  const cur = opts.cursor ?? CURSOR;
  g.input = {
    rightDown: true, mouseX: cur[0], mouseY: cur[1], mouseHeld: false,
    downAction: () => false,
  };
  g._prevRightDown = opts.prevRightDown ?? false;
  g.smartInteractNpcId = opts.smartId ?? -1;
  g.dialogNpc = opts.dialogNpc ?? null;
  g.petFollower = null;
  g.lightPetFollower = null;
  g.wiring = { sheetOf: () => 15 };
  g.net = undefined;
  g.openChestRef = () => null;
  g.openChest = () => {};
  g.closeChestPanel = () => {};
  g.openNpcDialog = (n: unknown) => { dialogOpened.push(n); };
  g.freeBoundNpc = () => {};
  g.wakeBoundEnemyNpc = () => {};
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {}, onClothesWindow: () => {}, onCraftingStationOpen: (f: unknown) => { stationOpens.push(f); } };
  g.achievements = { handleSpecialEvent: () => {} };
  return { g, dialogOpened, stationOpens };
}

// ---------------------------------------------------------------------------
// ① 实报主诉：坐姿 NPC + 点击（光标在其椅格上、同时在其绘制帧盒内）
//    = 开对话、玩家不落座（Player.cs:32188-32197 闩 → :32414 flag 门 → 交谈臂）
// ---------------------------------------------------------------------------
describe('SW-BJ66 ① 坐姿 NPC 点击=对话不落座（原版交谈闩回收）', () => {
  it('坐姿 NPC 罩住椅格：右键 → 对话开、sitting=false、rightDown 被交谈臂消费', () => {
    const rig = makeRig({ npc: SEATED_NPC });
    // 前置自证：光标同拍命中 NPC 绘制帧盒（气泡候选成立=闩消费前提）
    expect((rig.g as AnyGame).npcHoverHit(22, CURSOR[0], CURSOR[1], SEATED_NPC.x, SEATED_NPC.y, SEATED_NPC.w, SEATED_NPC.h)).toBe(true);
    expect((rig.g as AnyGame).worldRegionIntersects(SEATED_NPC.x, SEATED_NPC.y, SEATED_NPC.w, SEATED_NPC.h)).toBe(true);

    const early = (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(early).toBe(false);
    expect(rig.dialogOpened).toEqual([SEATED_NPC]);   // 交谈臂开对话（Main.cs:43807）
    expect(rig.g.player.sitting).toBe(false);          // 坐椅支被闩跳过（:32414 flag 门）
    expect(rig.g.input.rightDown).toBe(false);          // 由交谈臂消费
    expect(rig.stationOpens).toEqual([]);               // 合成站尾谓词不截胡（坐椅非配方站）
  });

  it('stinky 否决气泡（:43785）→ 闩不消费 → 坐椅支照旧落座（1:1 反向面）', () => {
    const rig = makeRig({ npc: SEATED_NPC, stinky: true });
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.player.sitting).toBe(true);            // 无气泡=原版格臂放行
    expect(rig.g.player.x).toBeCloseTo(SIT_X - 10, 5);  // Bottom 对齐 playerSittingPosition
    expect(rig.g.player.y + rig.g.player.h).toBeCloseTo(SIT_Y, 5);
  });
});

// ---------------------------------------------------------------------------
// ② 反过度压制：空椅（无 NPC）→ 落座照旧；占用门 count≤1 不拦
// ---------------------------------------------------------------------------
describe('SW-BJ66 ② 空椅落座照旧（防过压）', () => {
  it('无 NPC：右键椅格 → 玩家落座、rightDown 由 sitDownAt 消费、零对话', () => {
    const rig = makeRig({});
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.player.sitting).toBe(true);
    expect(rig.g.player.y + rig.g.player.h).toBeCloseTo(SIT_Y, 5);
    expect(rig.g.input.rightDown).toBe(false);
    expect(rig.g.player.facing).toBe(-1);               // frameX=0 → targetDirection −1
  });
});

// ---------------------------------------------------------------------------
// ③ 占椅占用（User 期望②）：被坐 NPC 占用的椅格——落座当帧过门（count=1），
//    次帧 updateSitting 挤落（Helper.cs:66-68 count=2）=原版净拒绝
// ---------------------------------------------------------------------------
describe('SW-BJ66 ③ 占椅不可坐：挤落（Helper.cs:66-68）', () => {
  it('NPC 已占椅 + stinky 让闩放行 → 落座当帧成立、updateSitting 次帧弹出', () => {
    const rig = makeRig({ npc: SEATED_NPC, stinky: true });
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.g.player.sitting).toBe(true);            // 当帧：count=1 < 2 过门（Helper.cs:114）
    (rig.g as AnyGame).updateSitting();                  // 次帧：NPC+玩家同格 count=2
    expect(rig.g.player.sitting).toBe(false);            // 挤落（Helper.cs:66-68）
  });

  it('挤落只认同格共占：NPC 坐别的椅（异格 +32px，帧盒离光标）→ 玩家安坐不被弹', () => {
    // +32px：锚格 (42,31)≠(40,31)；帧盒 [662,702)×[456,512) 不罩光标 → 闩不消费
    const rig = makeRig({ npc: { ...SEATED_NPC, cx: SEATED_NPC.cx + 32, x: SEATED_NPC.x + 32 } });
    expect((rig.g as AnyGame).npcHoverHit(22, CURSOR[0], CURSOR[1], SEATED_NPC.x + 32, SEATED_NPC.y, SEATED_NPC.w, SEATED_NPC.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.g.player.sitting).toBe(true);
    (rig.g as AnyGame).updateSitting();
    expect(rig.g.player.sitting).toBe(true);             // 异格 count=1 → 不挤落
  });
});

// ---------------------------------------------------------------------------
// ④ 占用门本体（Helper.cs:114）在【同位重坐起身】之前：共占态连点同椅不再起身
// ---------------------------------------------------------------------------
describe('SW-BJ66 ④ 占用门序：count≥2 先于同位起身支（:114 → :120）', () => {
  it('玩家已坐本椅 + NPC 同格共占 → sitDownAt 早退（不触发同位起身）', () => {
    const rig = makeRig({ npc: SEATED_NPC, preseat: true });
    expect(rig.g.player.sitting).toBe(true);
    (rig.g as AnyGame).sitDownAt(CHAIR_LOWER[0], CHAIR_LOWER[1]);
    expect(rig.g.player.sitting).toBe(true);             // 门拦下：连点不站起（原版序）
    expect(rig.g.player.x).toBeCloseTo(SIT_X - 10, 5);   // 位置不被改写
  });

  it('同几何无共占（仅玩家自坐）→ 同位重坐=起身（:120-125 原语义不回退）', () => {
    const rig = makeRig({ preseat: true });
    (rig.g as AnyGame).sitDownAt(CHAIR_LOWER[0], CHAIR_LOWER[1]);
    expect(rig.g.player.sitting).toBe(false);             // 同位重坐=起身照旧
  });
});

// ---------------------------------------------------------------------------
// ⑤ 闩消费条件 1:1（Player.cs:32190 `(talkNPC == -1 || !npcChatRelease)`）：
//    对话中同体 press 边沿=格臂放行（原版 quirk）；按住中=闩消费（无操作）
// ---------------------------------------------------------------------------
describe('SW-BJ66 ⑤ 消费条件两臂（talkNPC==−1 ∨ !npcChatRelease）', () => {
  it('对话中 press 边沿再点坐姿 NPC：闩不消费 → 落座（对话中同体不重谈）', () => {
    const rig = makeRig({ npc: SEATED_NPC, dialogNpc: SEATED_NPC, prevRightDown: false });
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.dialogOpened).toEqual([]);                 // talkNPC==i 门（Main.cs:43807）
    expect(rig.g.player.sitting).toBe(true);              // 原版 quirk：格臂放行=落座
  });

  it('对话中按住（非边沿）悬停：闩消费 → 不落座亦不重谈、rightDown 保持', () => {
    const rig = makeRig({ npc: SEATED_NPC, dialogNpc: SEATED_NPC, prevRightDown: true });
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.g.player.sitting).toBe(false);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(true);             // 双臂皆不消费=原版无操作
  });
});

// ---------------------------------------------------------------------------
// ⑥ 气泡候选含智能臂（Main.cs:43743 flag2 ∨ SmartInteractNPC）：智能候选在册
//    即使光标帧盒未中 NPC，闩同样消费（1:1）
// ---------------------------------------------------------------------------
describe('SW-BJ66 ⑥ 智能候选臂进闩', () => {
  it('smartInteractNpcId 在册 + 光标帧盒未中 NPC → 坐椅支被跳、对话经智能臂开', () => {
    // 光标 (650,500)：仍在椅下格 [640,656)×[496,512) 内，但窄帧盒 [642,650)×[504,512) 外
    const rig = makeRig({ npc: SEATED_NPC, smartId: SEATED_NPC.id, frameBox: { sw: 8, sh: 8 }, cursor: [650, 500] });
    // 前置自证：窄帧盒下光标不再悬停 NPC（悬停臂零命中）
    expect((rig.g as AnyGame).npcHoverHit(22, 650, 500, SEATED_NPC.x, SEATED_NPC.y, SEATED_NPC.w, SEATED_NPC.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(CHAIR_LOWER[0], CHAIR_LOWER[1], null);
    expect(rig.dialogOpened).toEqual([SEATED_NPC]);       // 智能候选臂放行交谈
    expect(rig.g.player.sitting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 结构锁：坐椅支闩表达式 + 占用门/挤落行在源（防重构漂移，bj32 同式）
// ---------------------------------------------------------------------------
describe('SW-BJ66 结构锁', () => {
  it('坐椅支闩/占用门/挤落三式在 Game.ts 源面（源序：宝箱臂→交谈臂→interactAt 坐椅支；运行序坐椅支先于交谈臂）', () => {
    expect(SRC).toContain('npcChatBubbleHovered(mxS, myS) && (!this.dialogNpc || this._prevRightDown)');
    expect(SRC).toContain('anchoredSeatsAt(Math.floor(t.sittingX / TILE), Math.floor((t.sittingY - 2) / TILE)) >= 2');
    expect(SRC).toContain('anchoredSeatsAt(cx, cy) >= 2');
    const sitBranch = SRC.indexOf('if (SITTABLE_SHEETS.has(sh) && this.withinSnapRange(tx, ty, 40))');
    const talkArm = SRC.indexOf('this.talkToNearbyNpc(...this.camera.screenToWorld(inp.mouseX, inp.mouseY))');
    const chestArm = SRC.indexOf('const chestTile =');
    const interactAtDef = SRC.indexOf('private interactAt(');
    expect(sitBranch).toBeGreaterThan(-1);
    expect(talkArm).toBeGreaterThan(-1);
    // 源序（rightClickTileNpcDispatch 在 interactAt 之前定义）：宝箱臂→交谈臂尾→interactAt 坐椅支
    expect(talkArm).toBeGreaterThan(chestArm);            // BJ25 分派序不倒转（容器族仍格先行）
    expect(sitBranch).toBeGreaterThan(interactAtDef);     // 坐椅支（+闩）住在 interactAt 内
    expect(sitBranch).toBeGreaterThan(talkArm);           // 运行序：dispatch else→interactAt(坐椅支)→交谈臂
  });
});
