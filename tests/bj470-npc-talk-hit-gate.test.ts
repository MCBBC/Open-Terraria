// BJ470 2026-10-03 NPC 对话右键命中判定定谳（用户实报：靠近 NPC 的区域右键任何一处
// 都强行开启 NPC 对话）。
//
// 原版定谳链（1457 反编译亲读；1458 SetDefaults 零变更不改交互面）：
//   HoverOverNPCs（Main.cs:43715-43813）逐 NPC：
//   ①外门 flag2（:43742-43743）= mouseRectangle（1×1 鼠标世界像素,DrawMouseOver
//     :43597-43599）∩ 【绘制帧盒】(:43729-43730 `(int)nPC.Bottom.X - frame.Width/2,
//     (int)nPC.Bottom.Y - frame.Height, frame.W, frame.H`——底边钉命中盒底、水平帧宽
//     居中;特型盒 :43731-43740 87-92=64×64/677=20×20/695-696=60×40) ∨ 智能候选
//     (SmartInteractShowingGenuine && SmartInteractNPC == i)。
//   ②交谈门 flag3（:43774-43782）= 智能候选 ∨ townNPC 族（:43775 名单）命中盒 ∩
//     worldRegion（:43718 TileReachCheckSettings.Simple.GetWorldRegion——tileRangeX/Y
//     5/3 外扩矩形）。★帧盒悬停是【点击命中判据】,worldRegion 只是【射程门】——
//     原版没有"射程内任意点击开最近 NPC 对话"的普通鼠标路径。
//   ③消费（:43800-43812）= mouseRight ∧ npcChatRelease（:45755-45763
//     DrawInterface_41 npcChatRelease=!mouseRight → 按压沿）∧ !player.dead →
//     npcChatRelease=false（首个 flag3 候选即消费,无 break 但后续全被沿门拦）
//     ∧ talkNPC != i ∧ !tileInteractionHappened（:43807——格交互先行,Player.cs
//     :33551 置旗/:32183 释放态清旗）→ SetTalkNPC(i)+GetChat+Sound 24。
//   ④否决族（:43783-43787）= ownedProjectileCounts[651]>0 / player.stinky /
//     player.mouseInterface。
//   ⑤智能候选 = NPCSmartInteractCandidateProvider.cs:32-63（SmartInteractLookup
//     Player.cs:17490-17511 门 = SmartCursorIsUsed〔Main.cs:2985 ≡ SmartCursorWanted
//     ——cSmartCursorModeIsToggleAndNotHold 默认 true:Main.cs:67589=切换态〕∧
//     !Main.mouseItem.IsAir 早退）：active townNPC ∧ Hitbox ∩ worldRegion 全部入池
//     【无鼠标悬停要求】,离光标最近者胜（零距立即 break）→ WinCandidacy 置
//     SmartInteractNPC+SmartInteractShowingGenuine（provider :14-18）。
//     ⇒ 智能光标开启态右键射程内任意位置=与最近城镇 NPC 对话 = 原版本相（本文件
//     ⑥锚定,防未来再按"任何位置都开对话"误报落刀）。
//
// 本仓对照（Game.ts npcHoverHit :21108 / worldRegionIntersects :21084 /
// talkToNearbyNpc :37263 / rightClickTileNpcDispatch :28166）：
//   npcHoverHit = 677 特型 20×20 中心盒（:43734-43736）∨ atlas 帧盒（vnpc 帧尺寸,
//   底心锚 = :43729 同式）∨ 未载回退命中盒 ±8px（登记备案,非原版域）;
//   worldRegionIntersects = TileReachCheckSettings.cs:70-85 直译;
//   交谈臂 = 按压沿 ∧ !tileInteractHappened ∧ hover∨smartId（ BJ1/BH1/FX23 已收口）。
// 判谳：普通鼠标路径逐门与原版同相（①-⑤ 全绿=同相证词）;「任何位置都开对话」
// 仅在智能光标开启态出现 = ⑥原版同相锚。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, T } from '../src/data/tiles';
import { TILE } from '../src/core/constants';

type AnyGame = Record<string, any>;

const SRC = readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');

/** 参照几何（BJ25 同款）：玩家 x=160,y=160,w=20,h=42 → tileReach 5/3 →
 *  worldRegion = [80,271)×[112,255)。向导 tile (12,11) 盒 191..209 × 152..192，
 *  绘制帧盒 40×56 = [180,220)×[136,192)。 */
const GUIDE = { vanillaId: 22, x: 191, y: 152, w: 18, h: 40, id: 1, bound: false, dead: false };
const PIGGY_TILE: [number, number] = [10, 11];   // 中心 (168,184) 在向导帧盒 [180,220) 外
const piggyType = TILE_BY_KEY['v_29_piggy_bank'] ?? -1;

function makeStore(tileAt: Record<string, number>, frames: Record<number, [number, number]> = {}) {
  const W = 400;
  const fx: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? (t as Record<PropertyKey, number>)[k] : 0),
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

function makeRig(opts: {
  tileAt?: Record<string, number>;
  frames?: Record<number, [number, number]>;
  wiringSheet?: number | null;
  prevRightDown?: boolean;
  smartId?: number;
  npcs?: unknown[];
} = {}) {
  const dialogOpened: unknown[] = [];
  const chestsOpened: Array<{ x: number }> = [];
  const tryOpenCalls: unknown[] = [];
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
    screenToWorld: (mx: number, my: number): [number, number] => [mx, my],
  };
  g.renderer = { atlas: { vnpc: () => ({ sw: 40, sh: 56 }) } };
  g.entities = { enemies: [], npcs: opts.npcs ?? [GUIDE], projectiles: [] };
  g.input = { rightDown: true, mouseX: 200, mouseY: 180, mouseHeld: false };
  g._prevRightDown = opts.prevRightDown ?? false;
  g.smartInteractNpcId = opts.smartId ?? -1;
  g.dialogNpc = null;
  g.petFollower = null;
  g.lightPetFollower = null;
  g.wiring = opts.wiringSheet == null ? null : { sheetOf: () => opts.wiringSheet };
  g.net = undefined;
  g.openChestRef = () => null;
  g.openChest = (c: { x: number }) => { chestsOpened.push(c); };
  g.closeChestPanel = () => {};
  g.openNpcDialog = (n: unknown) => { dialogOpened.push(n); };
  g.freeBoundNpc = () => {};
  g.wakeBoundEnemyNpc = () => {};
  g.openSignEditor = () => { g.input.rightDown = false; };
  g.toggleSwitch = () => { g.input.rightDown = false; };
  g.canSnapPlayerTo = () => false;
  g.tryOpenChest = (c: unknown) => { tryOpenCalls.push(c); };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {}, onClothesWindow: () => {}, onReadSign: () => {} };
  g.achievements = { handleSpecialEvent: () => {} };
  return { g, dialogOpened, chestsOpened, tryOpenCalls };
}

// ---------------------------------------------------------------------------
// ① 点 NPC 身上（帧盒悬停 + 射程内）→ 开对话（Main.cs:43742/:43807 链）
// ---------------------------------------------------------------------------
describe('BJ470 ① 点 NPC 身上 → 对话', () => {
  it('光标落在命中盒本体（200,180 在帧盒 [180,220)×[136,192) 内）→ openNpcDialog', () => {
    const rig = makeRig({ tileAt: {} });   // 光标格 air：不涉格交互优先级
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;
    expect((rig.g as AnyGame).npcHoverHit(22, 200, 180, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);
    expect((rig.g as AnyGame).worldRegionIntersects(GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.dialogOpened).toEqual([GUIDE]);
    expect(rig.g.input.rightDown).toBe(false);   // :43800 npcChatRelease 消费面
  });

  it('帧盒边缘自证：命中盒外一点 (179,180)/(221,180) 不算 NPC 身上（XNA Intersects 边沿同相）', () => {
    expect((makeRig().g as AnyGame).npcHoverHit(22, 179, 180, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(false);
    expect((makeRig().g as AnyGame).npcHoverHit(22, 221, 180, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ② 点 NPC 旁空格 → 零对话（★BJ470 主诉判别面：射程内但帧盒外 = 原版不开）
// ---------------------------------------------------------------------------
describe('BJ470 ② 点 NPC 旁空格 → 零对话（主诉面）', () => {
  const CASES: Array<[number, number, string]> = [
    [224, 180, '右邻 15px（帧盒右界 220 外、射程内）'],
    [176, 180, '左邻 15px（帧盒左界 180 外）'],
    [200, 130, '头顶 6px（帧盒顶界 136 外）'],
    [200, 196, '脚下 4px（帧盒底界 192 外、射程内）'],
  ];
  for (const [mx, my, label] of CASES) {
    it(`${label}（${mx},${my}）→ 零对话、rightDown 保持（原版 flag3=false 不消费 :43800）`, () => {
      const rig = makeRig({ tileAt: {} });
      rig.g.input.mouseX = mx; rig.g.input.mouseY = my;
      // 前置自证：光标确在射程盒内（射程不是问题,问题只可能出在悬停门放水）
      expect((rig.g as AnyGame).worldRegionIntersects(GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(true);
      expect((rig.g as AnyGame).npcHoverHit(22, mx, my, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(false);
      const [tx, ty] = [Math.floor(mx / TILE), Math.floor(my / TILE)];
      (rig.g as AnyGame).rightClickTileNpcDispatch(tx, ty, null);
      expect(rig.dialogOpened).toEqual([]);        // ★主诉判别：任何位置都不许开
      expect(rig.g.input.rightDown).toBe(true);    // 原版无消费者态（不吞沿）
    });
  }

  it('atlas 未载回退（命中盒 ±8px）同相：帧盒外 15px 亦零对话', () => {
    const rig = makeRig({ tileAt: {} });
    rig.g.renderer = { atlas: { vnpc: () => null } };   // 未载回退域
    rig.g.input.mouseX = 224; rig.g.input.mouseY = 180;
    expect((rig.g as AnyGame).npcHoverHit(22, 224, 180, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(14, 11, null);
    expect(rig.dialogOpened).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ③ 多 NPC 重叠选优：首个 flag3 候选消费按压沿（原版 :43800 消费位在循环体内,
//    无 break 但后续全被 npcChatRelease=false 拦）⇒ 遍历序首者胜
// ---------------------------------------------------------------------------
describe('BJ470 ③ 多 NPC 重叠选优', () => {
  const npcA = { ...GUIDE, x: 191, id: 1 };   // 帧盒 [180,220)
  const npcB = { ...GUIDE, x: 211, id: 2 };   // 帧盒 [200,240)——与 A 在 [200,220) 重叠

  it('光标 (210,180) 同落两体帧盒 → 遍历序首者（A）胜（:43800 首候选消费沿）', () => {
    const rig = makeRig({ tileAt: {}, npcs: [npcA, npcB] });
    rig.g.input.mouseX = 210; rig.g.input.mouseY = 180;
    expect((rig.g as AnyGame).npcHoverHit(22, 210, 180, npcA.x, npcA.y, npcA.w, npcA.h)).toBe(true);
    expect((rig.g as AnyGame).npcHoverHit(22, 210, 180, npcB.x, npcB.y, npcB.w, npcB.h)).toBe(true);
    (rig.g as AnyGame).rightClickTileNpcDispatch(13, 11, null);
    expect(rig.dialogOpened).toEqual([npcA]);    // 首个 flag3 候选（原版沿消费序）
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('光标只落 B 帧盒 (230,180) → B 胜（A 帧盒外 flag2 假,原版逐体独立判定）', () => {
    const rig = makeRig({ tileAt: {}, npcs: [npcA, npcB] });
    rig.g.input.mouseX = 230; rig.g.input.mouseY = 180;
    (rig.g as AnyGame).rightClickTileNpcDispatch(14, 11, null);
    expect(rig.dialogOpened).toEqual([npcB]);
  });

  it('敌怪桶 bound 形态先于城镇桶（talkToNearbyNpc 序）——仅文档化次序锚', () => {
    const bound = { vanillaId: 376, x: 191, y: 152, w: 18, h: 40, id: 9, dead: false, hp: 10, maxHp: 10 };
    const rig = makeRig({ tileAt: {} });
    rig.g.entities.enemies = [bound];
    const keys = (Game as unknown as { ENEMY_BOUND_TOWN_KEY: Record<number, string> }).ENEMY_BOUND_TOWN_KEY;
    expect(keys[376]).toBeTruthy();
    expect((rig.g as AnyGame).talkToNearbyNpc(200, 180)).toBe(true);   // 唤醒支（桩面无 openNpcDialog 断言）
  });
});

// ---------------------------------------------------------------------------
// ④ NPC 远于射程 → 零对话（:43778 worldRegion.Intersects(hitbox) 门）
// ---------------------------------------------------------------------------
describe('BJ470 ④ NPC 远于射程 → 零对话', () => {
  it('NPC 在射程盒外（x=500 > 右界 271）+ 光标正对其本体 → 零对话', () => {
    const far = { ...GUIDE, x: 500, id: 3 };
    const rig = makeRig({ tileAt: {}, npcs: [far] });
    rig.g.input.mouseX = 509; rig.g.input.mouseY = 180;   // 帧盒 [490,530) 内=点在身上
    expect((rig.g as AnyGame).npcHoverHit(22, 509, 180, far.x, far.y, far.w, far.h)).toBe(true);
    expect((rig.g as AnyGame).worldRegionIntersects(far.x, far.y, far.w, far.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(31, 11, null);
    expect(rig.dialogOpened).toEqual([]);                  // :43778 射程门拦
    expect(rig.g.input.rightDown).toBe(true);
  });

  it('垂直射程门：NPC 在头顶射程外（y=60 < 上界 112）→ 零对话（BH1 楼上楼下判例）', () => {
    const up = { ...GUIDE, x: 191, y: 60, id: 4 };
    const rig = makeRig({ tileAt: {}, npcs: [up] });
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 88;
    expect((rig.g as AnyGame).worldRegionIntersects(up.x, up.y, up.w, up.h)).toBe(false);
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 5, null);
    expect(rig.dialogOpened).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑤ tile 右键交互优先级不回归（FX23/BJ52/BJ66 终审面压缩回归）
// ---------------------------------------------------------------------------
describe('BJ470 ⑤ tile 右键交互优先级不回归', () => {
  it('光标落猪罐格且在帧盒外 → 开罐、零对话（BJ25 主诉存活面）', () => {
    const rig = makeRig({ tileAt: { [`${PIGGY_TILE[0]},${PIGGY_TILE[1]}`]: piggyType } });
    rig.g.input.mouseX = 168; rig.g.input.mouseY = 184;   // 帧 [180,220) 外
    (rig.g as AnyGame).rightClickTileNpcDispatch(PIGGY_TILE[0], PIGGY_TILE[1], null);
    expect(rig.chestsOpened).toEqual([{ x: -2, y: 0, items: [] }]);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('光标落在罐格且同时在帧盒内 → 原版交谈闩（:32188）= 对话赢、罐不开（FX23 终审）', () => {
    const rig = makeRig({ tileAt: { [`${PIGGY_TILE[0]},${PIGGY_TILE[1]}`]: piggyType } });
    rig.g.input.mouseX = 184; rig.g.input.mouseY = 184;
    (rig.g as AnyGame).rightClickTileNpcDispatch(PIGGY_TILE[0], PIGGY_TILE[1], null);
    expect(rig.dialogOpened).toEqual([GUIDE]);
    expect(rig.chestsOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('按住中滑到 NPC（prevRightDown=true）→ 不交谈不落座（npcChatRelease 同相）', () => {
    const rig = makeRig({ tileAt: {}, prevRightDown: true });
    rig.g.input.mouseX = 200; rig.g.input.mouseY = 180;
    (rig.g as AnyGame).rightClickTileNpcDispatch(12, 11, null);
    expect(rig.dialogOpened).toEqual([]);
    expect(rig.g.input.rightDown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 原版同相锚：智能光标开启态右键射程内任意位置=与最近 NPC 对话（Main.cs:43743
//    + NPCSmartInteractCandidateProvider.cs:32-63——候选无鼠标悬停要求）。
//    ★BJ470 定谳：「任何位置都开对话」仅此态出现 = 原版本相,非本仓差异。
// ---------------------------------------------------------------------------
describe('BJ470 ⑥ 智能候选支原版同相锚（任何位置开对话=智能光标态原版本相）', () => {
  it('smartId 命中 + 光标在帧盒外射程内 → 开对话（BJ1 已收口面,BJ470 复锚）', () => {
    const rig = makeRig({ tileAt: {}, smartId: 1 });
    rig.g.input.mouseX = 264; rig.g.input.mouseY = 180;
    (rig.g as AnyGame).rightClickTileNpcDispatch(16, 11, null);
    expect(rig.dialogOpened).toEqual([GUIDE]);
  });

  it('智能候选无射程内 NPC（smartId=-1）→ 光标空格零对话（provider :57 num==-1 不出候选）', () => {
    const rig = makeRig({ tileAt: {}, smartId: -1 });
    rig.g.input.mouseX = 264; rig.g.input.mouseY = 180;
    (rig.g as AnyGame).rightClickTileNpcDispatch(16, 11, null);
    expect(rig.dialogOpened).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑦ 结构锁：交谈臂悬停门 = npcHoverHit（帧盒）单源,无距离/最近 NPC 兜底支
// ---------------------------------------------------------------------------
describe('BJ470 ⑦ 结构锁（源文本锚：无「最近 NPC 兜底」支）', () => {
  it('talkToNearbyNpc 域内只存在 hover∨smartId 两门,禁距离兜底（防 BJ470 复发锚）', () => {
    const start = SRC.indexOf('private talkToNearbyNpc(');
    const end = SRC.indexOf('private wakeBoundEnemyNpc(', start);
    const body = SRC.slice(start, end);
    expect(body).toContain('npcHoverHit(');
    expect(body).toContain('worldRegionIntersects(');
    expect(body).toContain('smartId !== npc.id');
    // 反锚：距离兜底签名禁入（本仓 2026-09-06 前旧病=3.5 格圆 + 最近 NPC 兜底）
    expect(body).not.toMatch(/Math\.hypot|最近.*兜底|nearestFalloff/);
  });
});
