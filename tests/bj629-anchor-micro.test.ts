// BJ629 2026-10-10 放置锚微面批（BJ624 收刀新登记五条,放置锚域真收官尾）
//
// 件1（136 拉杆 alternates 三档）：TileObjectData.cs:4551-4577 亲读定谳——StyleSwitch
//   经 addBaseTile(:4560) 俘获于 AnchorBottom 赋值(:4562)【之前】,故三备档
//   CopyFrom(StyleSwitch) 不含底锚=exclusive 制:alt0 底 SolidTile|SolidSide（无
//   SolidWithTop→平台拒）/alt1 左（SolidTile|SolidSide|Tree|AlternateTile
//   {124,561,574-578}）/alt2 右/alt3 墙,无顶档。落位=ANCHOR_GATE_SPECS[136]
//   （top:false+sideAlts:[1,2]+wallAlt:3+bottomSolidTop:false+sideMembersOnly）。
// 件2（evalCell SolidTile 臂缺 tileNoAttach 排除）：TileObject.cs:388/:457/:561/:647
//   四锚同款 `!Main.tileNoAttach`——关态门 10（tileSolid∧noAttach）曾被当承重锚
//   （松于原版）;SolidSide/SolidBottom/SolidWithTop 臂原文本无该位=不扩大。
// 件3（630/631 生存树干臂细判）：ConsideredSolidTileForAnchor（WorldGen.cs:54350-54371）
//   全式——`323 ∨ (IsATreeTrunk ∧ !IsTileATreeBranch) 且 !IsTileALeafyTreeTop`;
//   IsTileATreeBranch :29998-30021（fx44·fy{198,220,242}/fx66·fy{0,22,44}/
//   fx66·fy{198,220,242}/fx88·fy{66,88,110}）;IsTileALeafyTreeTop :29960-29974
//   （GetsCheckedForLeaves∧(323·fx≥88 ∨ fx22·fy∈[198,242])）。
// 件4（419 叠挂 alternate）：TileObjectData.cs:4344-4352——alt1 Origin(0,1)+成员{419},
//   点击格【就是】419 灯 → 新灯落点击上一格（帧带 1→frameX 18）;420 ∉ alt1 成员表;
//   幸存面 'logic'（CheckLogicTiles :45678 下锚门）按下方格判=叠挂对称,无需新支。
// 件5（442/630/631(/723/724) 放置幽灵预览）：CanPlace onlyCheck（TileObject.cs:205-765
//   逐备档满分制）+ DrawPreview（:860-896 命中档帧带;:944 num13 帧宽居中）——足印
//   三谓词唯一可见域;442 HookCheckIfCanPlace（WorldGen.cs:87583 badReturn=-1）→
//   全向 viable 失=AllInvalid 全红（:728-731）;630/631 无 hook=备档全灭仍白格
//   （placementCache 首备档缓存 doctrine）。帧带与实放同一 gateTilePlacementStyle 门源。
import { describe, it, expect, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game, anchorTilePlacementStyle, ANCHOR_GATE_SPECS } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import { Inventory } from '../src/items/Inventory';
import { updatePlacePreviewFrame, placePreviewFrame, clearPlacePreviewFrame,
  USES_CUSTOM_CAN_PLACE_SHEETS, type PlacePreviewCtx } from '../src/core/PlacePreview';
import { drawPlacePreview, type PvAtlas, type PvScratch } from '../src/render/PlacePreviewDraw';
import { options } from '../src/core/Options';
import { LIQUID_TYPE } from '../src/world/TileStore';

const STONE = TILE_BY_KEY['stone']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const DOOR = TILE_BY_KEY['door_closed']!;
const BEAM = TILE_INTERNAL(124);
const TRUNK = TILE_INTERNAL(5);
const PALM = TILE_INTERNAL(323);
const LAMP419 = TILE_INTERNAL(419);
const LAMP420 = TILE_INTERNAL(420);
const B630 = TILE_INTERNAL(630);
const B442 = TILE_INTERNAL(442);

function TILE_INTERNAL(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  expect(i, `sheet ${sheet} 应有内部 id`).toBeGreaterThan(0);
  return i;
}
function iidOf(vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} 应有物品`).toBeTruthy();
  return ITEM_BY_KEY[key!]!;
}

interface GShell {
  world: World;
  player: Record<string, unknown> & { useTime: number };
  smartCursor: { lockedContinuity: null; showing: boolean; x: number; y: number };
  chunks: { markDirtyArea: (...a: unknown[]) => void };
  sfx: { play: (name: string, v?: number, x?: number, y?: number) => void };
  cb: { onInventoryChanged: () => void };
  entities: Record<string, unknown>;
  spawnParticles: (...a: unknown[]) => void;
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => unknown;
  recLog: (...a: unknown[]) => void;
  dumpChest: () => void;
  killTileDropBait: (...a: unknown[]) => void;
  trackTile: number;
  flexWandCycle: number;
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
  breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean) => void;
  checkDecorSquareFrame: (x: number, y: number) => void;
  checkDecorSupport: (x: number, y: number, def: unknown, sheet: number, kind: string) => void;
}
function mkShell(heldVid: number, heldStack = 3,
  at: { x: number; y: number } = { x: 13, y: 20 }): {
  g: GShell; w: World; inv: import('../src/items/Inventory').Inventory;
} {
  const w = new World(48, 48, 7, 'bj629-anchor-micro');
  const inv = new Inventory();
  inv.slots[0] = { id: iidOf(heldVid), stack: heldStack };
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { nextId: 1, add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => null;
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.trackTile = 0;
  g.flexWandCycle = 0;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    cx: (at.x + 1) * 16 + 8, cy: (at.y + 1) * 16 + 8,
    x: (at.x + 1) * 16 + 2, y: (at.y + 1) * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false, dead: false, isGhostPhase: () => false,
    buffs: { has: () => false }, equipStats: {},
    inv,
  };
  return { g, w, inv };
}

// ============================================================================
// 件1 136 拉杆四备档（gateTilePlacementStyle + tryPlace 全链,帧带=档×18）
// ============================================================================
describe('BJ629-件1 136 拉杆四备档（TileObjectData.cs:4551-4577）', () => {
  const SPEC = ANCHOR_GATE_SPECS[136];
  it('规格面：exclusive 四备档（top:false/sideAlts [1,2]/wallAlt 3/bottomSolidTop false/'
    + 'sideMembersOnly）', () => {
    expect(SPEC).toBeDefined();
    expect(SPEC.top).toBe(false);
    expect(SPEC.sideAlts).toEqual([1, 2]);
    expect(SPEC.wallAlt).toBe(3);
    expect(SPEC.bottomSolidTop).toBe(false);
    expect(SPEC.sideMembersOnly).toBe(true);
    // 五备档族规格零回归（缺省语义不变）
    expect(ANCHOR_GATE_SPECS[630].top).toBeUndefined();
    expect(ANCHOR_GATE_SPECS[630].sideAlts).toBeUndefined();
    expect(ANCHOR_GATE_SPECS[723].wallAlt).toBeUndefined();
    expect(ANCHOR_GATE_SPECS[442].bottomSolidTop).toBeUndefined();
  });

  it('档0 底锚：实心收（帧 0）/坡3 坡4 收（SolidSide 臂）/平台拒（bottomSolidTop:false）', () => {
    const st = new World(40, 40, 7, 't').store;
    st.setTileSilent(12, 20, STONE, 0, 0);
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(0);
    // SolidSide 底臂（blockType 4/5=slope 3/4,TileObject.cs:411-418）
    st.setTileSilent(12, 20, STONE, 0, 3);
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(0);
    st.setTileSilent(12, 20, STONE, 0, 4);
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(0);
    // 平台=solidTop → SolidTile 臂拒,Spec 关 SolidWithTop 两臂 → 全档失
    st.setTileSilent(12, 20, PLATFORM, 0, 0);
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(-1);
  });

  it('档1/2 侧锚（左=1/右=2,sideAlts 映射）+Tree 臂+梁成员臂+底成员惰性', () => {
    const st = new World(40, 40, 7, 't').store;
    st.setTileSilent(11, 19, STONE, 0, 0);            // 左邻实心 → alt1
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(1);
    const st2 = new World(40, 40, 7, 't').store;
    st2.setTileSilent(13, 19, STONE, 0, 0);           // 右邻实心 → alt2
    expect(anchorTilePlacementStyle(st2, 12, 19, SPEC)).toBe(2);
    // Tree 臂（:659-696 侧锚三格干,1×1 tileCount=1 → 上下邻同检）
    const st3 = new World(40, 40, 7, 't').store;
    for (const y of [18, 19, 20]) st3.setTileSilent(11, y, TRUNK, 0, 0);
    expect(anchorTilePlacementStyle(st3, 12, 19, SPEC)).toBe(1);
    // 梁成员臂（AlternateTile{124,...} :4565——侧档生效）
    const st4 = new World(40, 40, 7, 't').store;
    st4.setTileSilent(13, 19, BEAM, 0, 0);
    expect(anchorTilePlacementStyle(st4, 12, 19, SPEC)).toBe(2);
    // 底档无 AlternateTile 位（基记录 :4562 双位）→ 梁在底=惰性位恒 false
    const st5 = new World(40, 40, 7, 't').store;
    st5.setTileSilent(12, 20, BEAM, 0, 0);
    expect(anchorTilePlacementStyle(st5, 12, 19, SPEC)).toBe(-1);
    // 侧锚 noAttach（关态门 10）：SolidTile 臂拒+SolidSide 臂坡型不合 → 全档失
    const st6 = new World(40, 40, 7, 't').store;
    st6.setTileSilent(11, 19, DOOR, 0, 0);
    expect(anchorTilePlacementStyle(st6, 12, 19, SPEC)).toBe(-1);
  });

  it('档3 墙锚（wallAlt 3）+档序（底锚先于墙,bottom+wall → 0）', () => {
    const st = new World(40, 40, 7, 't').store;
    st.wall[st.idx(12, 19)] = 1;
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(3);
    st.setTileSilent(12, 20, STONE, 0, 0);
    expect(anchorTilePlacementStyle(st, 12, 19, SPEC)).toBe(0);   // 备档序 alt0 先中
  });

  it('Game 级 tryPlace：墙挂帧 54/左挂 18/右挂 36/底 0/平台拒零消耗', () => {
    const { g, w, inv } = mkShell(538);
    const st = w.store;
    st.wall[st.idx(12, 19)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL(136));
    expect(st.frameX[st.idx(12, 19)]).toBe(54);          // alt3 ×18
    const { g: g2, w: w2 } = mkShell(538);
    w2.store.setTileSilent(11, 19, STONE, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(w2.store.frameX[w2.store.idx(12, 19)]).toBe(18);   // alt1 ×18（左）
    const { g: g3, w: w3 } = mkShell(538);
    w3.store.setTileSilent(13, 19, STONE, 0, 0);
    g3.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(w3.store.frameX[w3.store.idx(12, 19)]).toBe(36);   // alt2 ×18（右）
    const { g: g4, w: w4 } = mkShell(538);
    for (let x = 8; x < 24; x++) w4.store.setTileSilent(x, 20, STONE, 0, 0);
    g4.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(w4.store.frameX[w4.store.idx(12, 19)]).toBe(0);    // alt0 底
    // 平台拒（bottomSolidTop:false——旧 hasSupport 底行近似同拒,门归位后仍拒=原版同相）
    const { g: g5, w: w5, inv: inv5 } = mkShell(538);
    for (let x = 8; x < 24; x++) w5.store.setTileSilent(x, 20, PLATFORM, 0, 0);
    g5.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(w5.store.get(12, 19)).toBe(0);
    expect(inv5.slots[0]!.stack).toBe(3);
    void inv;
  });

  it('442 侧档成员臂翻正（memberAt sideMembersOnly 语义落全,BJ629 rider）：梁侧挂 → 档2', () => {
    // 442 alt2/3 AnchorAlternateTiles={124,...}（:4652/:4658 真值）——旧 memberAt
    // `!sideMembersOnly && …` 把侧档臂整臂杀死=梁侧挂拒（严于原版）;翻正后:
    // 侧档吃成员表/底档（基记录 AlternateTile 位无表 :4662）仍惰性。
    const st = new World(40, 40, 7, 't').store;
    st.setTileSilent(11, 19, BEAM, 0, 0);
    expect(anchorTilePlacementStyle(st, 12, 19, ANCHOR_GATE_SPECS[442])).toBe(2);
    const st2 = new World(40, 40, 7, 't').store;
    st2.setTileSilent(12, 20, BEAM, 0, 0);
    expect(anchorTilePlacementStyle(st2, 12, 19, ANCHOR_GATE_SPECS[442])).toBe(-1);
  });

  it('梁侧挂 Game 级（成员表真值）+630 平台档零回归（bottomSolidTop 缺省 true）', () => {
    const { g, w } = mkShell(538);
    w.store.setTileSilent(11, 19, BEAM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(w.store.get(12, 19)).toBe(TILE_INTERNAL(136));
    expect(w.store.frameX[w.store.idx(12, 19)]).toBe(18);
    // BJ624-件1D 档0 平台收（630）不回归
    const { g: g2, w: w2 } = mkShell(5137);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 20, PLATFORM, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(w2.store.get(12, 19)).toBe(B630);
    expect(w2.store.frameX[w2.store.idx(12, 19)]).toBe(0);
  });
});

// ============================================================================
// 件2 evalCell SolidTile 臂 tileNoAttach 排除（TileObject.cs:388/:457/:561/:647）
// ============================================================================
describe('BJ629-件2 SolidTile 锚臂 tileNoAttach 排除', () => {
  it('1×1（压板 135）：关态门（10,noAttach∧tileSolid）不作底锚;实心照收', () => {
    const rec = anchorSpecOf(135)!;
    expect(rec).not.toBeNull();
    const st = new World(40, 40, 7, 't').store;
    st.setTileSilent(12, 20, DOOR, 0, 0);
    expect(validateAnchors(st, 12, 19, rec, 0), 'noAttach 实心件拒（原版 :388）').toBe(false);
    st.setTileSilent(12, 20, STONE, 0, 0);
    expect(validateAnchors(st, 12, 19, rec, 0), '非 noAttach 实心收').toBe(true);
  });

  it('多格链共面受益（工作台 18 底行双格）：门列拒/石列收', () => {
    const rec = anchorSpecOf(18)!;
    expect(rec.w).toBe(2);
    const st = new World(40, 40, 7, 't').store;
    for (const x of [12, 13]) st.setTileSilent(x, 21, DOOR, 0, 0);
    expect(validateAnchors(st, 12, 20, rec, 0), '底行双门=双格锚臂皆拒').toBe(false);
    for (const x of [12, 13]) st.setTileSilent(x, 21, STONE, 0, 0);
    expect(validateAnchors(st, 12, 20, rec, 0), '石列收').toBe(true);
  });

  it('臂域不扩大：SolidBottom 臂无 noAttach 位（TileObject.cs:465 原文——平台半砖顶锚照收）', () => {
    // SolidTile 臂（:457）有 !tileNoAttach;SolidBottom 臂（:465）原文无该位——
    // 平台 19（noAttach∧solidTop）半砖形态被 SolidBottom 平台支（halfBrick）收=档1。
    // 若误把 noAttach 扩到 SolidBottom 臂 → 此面红（判别力=臂域守卫）。
    const rec724 = ANCHOR_GATE_SPECS[724];
    const st = new World(40, 40, 7, 't').store;
    st.setTileSilent(12, 18, PLATFORM, 0, 0);
    st.half[st.idx(12, 18)] = 1;
    expect(anchorTilePlacementStyle(st, 12, 19, rec724)).toBe(1);
    // 平台平顶（非半砖）不承（SolidBottom 平台支只认 halfBrick/topSlope——原版同相）
    const st2 = new World(40, 40, 7, 't').store;
    st2.setTileSilent(12, 18, PLATFORM, 0, 0);
    expect(anchorTilePlacementStyle(st2, 12, 19, rec724)).toBe(-1);
  });
});

// ============================================================================
// 件3 630 臭虫箱生存树干臂细判（ConsideredSolidTileForAnchor 全式,WorldGen.cs:54350-54371）
// ============================================================================
describe('BJ629-件3 stinkbug 树干臂细判（枝臂/叶冠不作锚）', () => {
  function blockerOnStone(): { g: GShell; w: World } {
    const { g, w } = mkShell(5137);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(st.get(12, 19)).toBe(B630);
    expect(st.frameX[st.idx(12, 19)]).toBe(0);
    return { g, w };
  }
  function anchorBelow(w: World, type: number, fx: number, fy: number): void {
    w.store.setTileSilent(12, 20, type, fx, fy);
  }
  const dispatch = (g: GShell, w: World): void =>
    g.checkDecorSupport(12, 19, TILE_DEFS[B630], 630, 'stinkbug');

  it('素干（fx0/fy0）承桩=幸存（对照 BJ624 粗判面零回归）', () => {
    const { g, w } = blockerOnStone();
    anchorBelow(w, TRUNK, 0, 0);
    dispatch(g, w);
    expect(w.store.get(12, 19)).toBe(B630);
  });

  it('枝臂三形（fx44·fy198/fx66·fy44/fx88·fy66）不作锚 → 全向失=杀', () => {
    for (const [fx, fy] of [[44, 198], [66, 44], [88, 66]] as const) {
      const { g, w } = blockerOnStone();
      anchorBelow(w, TRUNK, fx, fy);
      dispatch(g, w);
      expect(w.store.get(12, 19), `枝位 fx${fx}/fy${fy} 承桩应杀`).toBe(0);
    }
  });

  it('叶冠（fx22·fy198-242）不作锚 → 杀;fy242 边界含', () => {
    for (const fy of [198, 220, 242]) {
      const { g, w } = blockerOnStone();
      anchorBelow(w, TRUNK, 22, fy);
      dispatch(g, w);
      expect(w.store.get(12, 19), `叶冠 fy${fy} 承桩应杀`).toBe(0);
    }
  });

  it('棕榈 323：干身（fx<88）承桩幸存/树冠（fx≥88）杀', () => {
    const { g, w } = blockerOnStone();
    anchorBelow(w, PALM, 0, 0);
    dispatch(g, w);
    expect(w.store.get(12, 19)).toBe(B630);
    const { g: g2, w: w2 } = blockerOnStone();
    anchorBelow(w2, PALM, 88, 0);
    dispatch(g2, w2);
    expect(w2.store.get(12, 19)).toBe(0);
  });

  it('重定向相不回归：下方挖除 → 右石邻重定向（写帧=helper 约定 style3 → 54,'
    + 'CheckStinkbugBlocker :54391 style*18 字面）', () => {
    // 原版重定向写值走 ValidateOrAttemptReorientingAnchor 的 helper 约定（2=左/3=右）,
    // 非放置备档序（630 alt2=右）——右锚重定向写 54 字面（2↔3 互换只作用于免写比对,
    // :54380-54392;与放置档 36 分域=原版 quirk 照抄）。
    const { g, w } = blockerOnStone();
    w.store.setTileSilent(13, 19, STONE, 0, 0);          // 右邻
    w.store.setTileSilent(12, 20, 0, 0, 0);              // 挖除底锚
    dispatch(g, w);
    expect(w.store.get(12, 19)).toBe(B630);
    expect(w.store.frameX[w.store.idx(12, 19)]).toBe(54); // helper style3 ×18
  });
});

// ============================================================================
// 件4 419 叠挂 alternate（TileObjectData.cs:4344-4352,Origin(0,1)+成员{419}）
// ============================================================================
describe('BJ629-件4 419 逻辑门灯叠挂档', () => {
  it('alt0 零回归：下方 420 → 灯落点击格帧 0（BJ622 判语面）', () => {
    const { g, w, inv } = mkShell(3602);
    w.store.setTileSilent(12, 20, LAMP420, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3602)]);
    expect(w.store.get(12, 19)).toBe(LAMP419);
    expect(w.store.frameX[w.store.idx(12, 19)]).toBe(0);
    expect(inv.slots[0]!.stack).toBe(2);
  });

  it('alt1 叠挂：点击格=既有 419 → 新灯落上一格帧 18,旧灯保持,串可续叠', () => {
    const { g, w, inv } = mkShell(3602, 5);
    // 夹具=合法灯态：420 垫底（无生存门）→ alt0 放灯 (12,20) → 点击该灯走 alt1
    //（连续成功放置须清 useTime 节流门——PlaceThing 头门,原版同域）
    w.store.setTileSilent(12, 21, LAMP420, 0, 0);
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(3602)]);
    expect(w.store.get(12, 20)).toBe(LAMP419);
    g.player.useTime = 0;
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(3602)]);           // 点击既有灯 → alt1
    expect(w.store.get(12, 19)).toBe(LAMP419);            // 新灯
    expect(w.store.frameX[w.store.idx(12, 19)]).toBe(18); // alt Style=1 帧带
    expect(w.store.get(12, 20)).toBe(LAMP419);            // 被点旧灯原样
    expect(inv.slots[0]!.stack).toBe(3);                  // 5−alt0−alt1
    // 续叠：点击新灯 → 再上一层
    g.player.useTime = 0;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3602)]);
    expect(w.store.get(12, 18)).toBe(LAMP419);
    expect(w.store.frameX[w.store.idx(12, 18)]).toBe(18);
    expect(inv.slots[0]!.stack).toBe(2);
  });

  it('成员表面：点击 420（灭灯）不放（alt1 成员={419} 排 420）;悬空不放', () => {
    const { g, w, inv } = mkShell(3602);
    w.store.setTileSilent(12, 20, LAMP420, 0, 0);
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(3602)]);
    expect(w.store.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
    const { g: g2, w: w2, inv: inv2 } = mkShell(3602);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(3602)]);          // 悬空:下方无灯+点击格空
    expect(w2.store.get(12, 19)).toBe(0);
    expect(inv2.slots[0]!.stack).toBe(3);
  });

  it('alt1 足印门：上方实心占位拒/岩浆拒（CanPlace flag3/flag5,零消耗）', () => {
    const { g, w, inv } = mkShell(3602);
    w.store.setTileSilent(12, 20, LAMP419, 0, 0);
    w.store.setTileSilent(12, 19, STONE, 0, 0);           // 新灯位被石占（非 clearable）
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(3602)]);
    expect(w.store.get(12, 18)).toBe(0);
    expect(w.store.get(12, 19)).toBe(STONE);
    expect(inv.slots[0]!.stack).toBe(3);
    const { g: g2, w: w2, inv: inv2 } = mkShell(3602);
    w2.store.setTileSilent(12, 20, LAMP419, 0, 0);
    w2.store.setLiquid(12, 19, 255, LIQUID_TYPE.LAVA);    // 新灯位岩浆（lava notAllowed）
    g2.tryPlace(12, 20, ITEM_DEFS[iidOf(3602)]);
    expect(w2.store.get(12, 18)).toBe(0);
    expect(inv2.slots[0]!.stack).toBe(3);
  });
});

// ============================================================================
// 件5 442/630/631(/723/724) 放置幽灵预览（CanPlace onlyCheck + DrawPreview 语义）
// ============================================================================
describe('BJ629-件5 五锚档族放置幽灵', () => {
  const prevOpt = options.data.placementPreview;
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    clearPlacePreviewFrame();
    options.data.placementPreview = true;
    for (const fn of cleanup.splice(0)) fn();
  });
  cleanup.push(() => { options.data.placementPreview = prevOpt; });

  function pvCtx(st: import('../src/world/TileStore').TileStore, sheet: number,
    tx: number, ty: number): PlacePreviewCtx {
    const def = TILE_DEFS[TILE_INTERNAL(sheet)];
    const spec = ANCHOR_GATE_SPECS[sheet]!;
    return {
      st, tx, ty, sheet,
      defFramed: !!def?.framed, defW: def?.w ?? 1, defH: def?.h ?? 1,
      style: 0, pylonDuplicate: false,
      hasSupport: () => true,
      obstructionClearable: () => false,
      anchorStyleAt: (x, y) => anchorTilePlacementStyle(st, x, y, spec),
    };
  }
  function floor(st: import('../src/world/TileStore').TileStore, row: number): void {
    for (let x = 5; x <= 30; x++) st.setTile(x, row, STONE);
  }

  it('UCCP 数据面：五锚档族全在册（CustomPlace 受理=原版有幽灵的前提）', () => {
    for (const s of [442, 630, 631, 723, 724]) {
      expect(USES_CUSTOM_CAN_PLACE_SHEETS.has(s), `sheet ${s}`).toBe(true);
    }
  });

  it('630：底锚命中 → 白格+帧带 0;左邻 → 帧带 54（alt3=左,sideSwap 同域）;墙 → 72', () => {
    options.data.placementPreview = true;
    const st = new World(48, 32, 7, 't').store;
    floor(st, 13);
    updatePlacePreviewFrame(pvCtx(st, 630, 14, 12));
    let pv = placePreviewFrame.data!;
    expect(pv).not.toBeNull();
    expect(pv.sheet).toBe(630);
    expect(Array.from(pv.cells)).toEqual([1]);
    expect(pv.pvFrame).toMatchObject({ fx: 0, fy: 0, sw: 16, sh: 16 });
    // 左邻实心（无底锚干扰域）→ 630 alternate 3=AnchorLeft → 帧带 3×18=54
    const stL = new World(48, 32, 7, 't').store;
    stL.setTile(13, 12, STONE);
    updatePlacePreviewFrame(pvCtx(stL, 630, 14, 12));
    pv = placePreviewFrame.data!;
    expect(pv.pvFrame!.fx).toBe(54);
    // 墙 → alt4 → 72
    const st2 = new World(48, 32, 7, 't').store;
    st2.wall[st2.idx(14, 12)] = 1;
    updatePlacePreviewFrame(pvCtx(st2, 630, 14, 12));
    expect(placePreviewFrame.data!.pvFrame!.fx).toBe(72);
    expect(Array.from(placePreviewFrame.data!.cells)).toEqual([1]);
  });

  it('630 备档全灭无 hook → 白格 doctrine（placementCache 首备档缓存,:756-763）+占用红', () => {
    options.data.placementPreview = true;
    const st = new World(48, 32, 7, 't').store;          // 全空无锚
    updatePlacePreviewFrame(pvCtx(st, 630, 14, 12));
    let pv = placePreviewFrame.data!;
    expect(pv).not.toBeNull();
    expect(Array.from(pv.cells)).toEqual([1]);           // 白格=点击落空原版本相
    expect(pv.pvFrame!.fx).toBe(0);                      // 首备档（alt0）帧带回退
    st.setTile(14, 12, STONE);                           // 足印占用
    updatePlacePreviewFrame(pvCtx(st, 630, 14, 12));
    pv = placePreviewFrame.data!;
    expect(Array.from(pv.cells)).toEqual([2]);
  });

  it('630 液体门：岩浆格红（lava notAllowed）;442/723 面存在性', () => {
    options.data.placementPreview = true;
    const st = new World(48, 32, 7, 't').store;
    st.setLiquid(14, 12, 255, LIQUID_TYPE.LAVA);
    updatePlacePreviewFrame(pvCtx(st, 630, 14, 12));
    expect(Array.from(placePreviewFrame.data!.cells)).toEqual([2]);
    floor(st, 13);
    updatePlacePreviewFrame(pvCtx(st, 442, 14, 12));
    expect(placePreviewFrame.data!.sheet).toBe(442);
    updatePlacePreviewFrame(pvCtx(st, 723, 14, 12));
    expect(placePreviewFrame.data!.sheet).toBe(723);
  });

  it('442：下向 viable → 白格+帧带 0（20×20,dx −2 居中）;悬空全向 viable 失 → AllInvalid 全红', () => {
    options.data.placementPreview = true;
    const st = new World(48, 32, 7, 't').store;
    floor(st, 13);
    updatePlacePreviewFrame(pvCtx(st, 442, 14, 12));
    let pv = placePreviewFrame.data!;
    expect(Array.from(pv.cells)).toEqual([1]);
    expect(pv.pvFrame).toMatchObject({ fx: 0, fy: 0, sw: 20, sh: 20, dx: -2 });
    // 悬空（无任何 viable 方向）→ hook badReturn=-1 → AllInvalid（:728-731）
    const st2 = new World(48, 32, 7, 't').store;
    updatePlacePreviewFrame(pvCtx(st2, 442, 14, 12));
    pv = placePreviewFrame.data!;
    expect(Array.from(pv.cells)).toEqual([2]);
  });

  it('绘制面：pvFrame 直供切片（442 sw20 + dx −2;TileObject.cs:944 num13 同域）', () => {
    class RecCtx {
      ops: Array<{ op: string; alpha: number; args: unknown[] }> = [];
      globalAlpha = 1;
      imageSmoothingEnabled = true;
      globalCompositeOperation = 'source-over';
      fillStyle = '';
      drawImage(...args: unknown[]): void { this.ops.push({ op: 'drawImage', alpha: this.globalAlpha, args }); }
      save(): void { /* 省略 */ }
      restore(): void { this.globalAlpha = 1; }
      clearRect(): void { /* 省略 */ }
      fillRect(): void { this.ops.push({ op: 'fillRect', alpha: this.globalAlpha, args: [] }); }
    }
    const fakeImg = {} as CanvasImageSource;
    const atlas: PvAtlas = {
      vframeAt: (sheet, fx, fy) => ({ img: fakeImg, sx: fx, sy: fy, sw: 16, sh: 16 }),
      ensureVImage: () => fakeImg,
    };
    const ctx = new RecCtx();
    const pv = {
      sheet: 442, fw: 1, style: 0, ax: 14, ay: 12, w: 1, h: 1,
      cells: new Uint8Array([1]),
      pvFrame: { fx: 44, fy: 0, sw: 20, sh: 20, dx: -2 },
    };
    const n = drawPlacePreview(ctx as unknown as CanvasRenderingContext2D, atlas, pv,
      () => null);
    expect(n).toBe(1);
    const draws = ctx.ops.filter((o) => o.op === 'drawImage');
    const [img, sx, sy, sw, sh, dx0] = draws[0].args as unknown[];
    expect(img).toBe(fakeImg);
    expect(sx).toBe(44); expect(sy).toBe(0);              // 命中档帧带（alt2×22）
    expect(sw).toBe(20); expect(sh).toBe(20);             // CoordinateWidth 20/heights 20
    expect(dx0).toBe(14 * 16 - 2);                        // num13=(20−16)/2 居中偏移
    // 红支 scratch 面随 sw/sh 动态（20×20 不裁切）
    const sc = new RecCtx();
    const scratch: PvScratch = {
      width: 0, height: 0,
      getContext: () => sc as unknown as CanvasRenderingContext2D,
      source: () => scratch as unknown as CanvasImageSource,
    };
    const ctx2 = new RecCtx();
    drawPlacePreview(ctx2 as unknown as CanvasRenderingContext2D, atlas,
      { ...pv, cells: new Uint8Array([2]) }, () => scratch);
    const draws2 = ctx2.ops.filter((o) => o.op === 'drawImage');
    const [, , , sw2, sh2] = draws2[draws2.length - 1].args as unknown[];
    expect(sw2).toBe(20); expect(sh2).toBe(20);
    expect(draws2[draws2.length - 1].alpha).toBe(0.35);
  });
});
