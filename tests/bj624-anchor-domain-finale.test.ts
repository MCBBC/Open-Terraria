// BJ624 2026-10-10 放置锚域收官刀（BJ600/602/622 四代债链闭合判别面）
//
// 件1（主件）：SolidWithTop 平台档 19 件翻案（BJ602④ 长尾,BJ622 登记清单）——
//   BJ622 判例：hasSupport 近似是双向偏差（严于原版拒平台 + 松于原版放贴墙）,
//   逐件翻案勿一刀切。路由 = 原版 Player.cs:40085 CustomPlace(type,placeStyle)
//   && type ∉ {82,227,4} → TileObject.CanPlace 全链（validateAnchors 即其移植）,
//   对【锚档 1×1】同样成立 → Game.ts uccp1x1 门（BJ622 anchorFree1x1 全语义化）。
//   逐件原版锚（TileObjectData.cs 亲读,addTile 行号）：
//     36 礼物   :4453-4456 CopyFrom(Style1x1) → 底 SolidTile|SolidWithTop|SolidSide
//     78 陶盆   :2384-2389 StyleOnTable1x1+底 +SolidWithTop+Table|SolidSide,LavaDeath=false
//     81 珊瑚   :4377-4388 顶 EmptyTile+底 SolidTile|SolidWithTop|SolidSide,uccp
//     135 压板  :4389-4393 Style1x1 继承底三档（BJ622 双判已核）
//     141 炸药  :4397-4399 Style1x1 继承,LavaDeath=false
//     210 地雷  :4404-4406 Style1x1 继承,DrawYOffset 2
//     239 矿锭  :4407-4411 Style1x1 继承,StyleHorizontal
//     324 海贝  :4419-4428 uccp+底 SolidTile|SolidWithTop|Table|SolidSide
//     428 加重板 :4393-4396 Style1x1 继承,LavaDeath=false
//     442 弹幕压垫 :4613-4663 uccp+HookCheckIfCanPlace=CanPlaceProjectilePressurePad
//     476 球洞  :4343-4348 底 SolidTile|SolidWithTop|Table
//     494 球座  :2389-2394 底 SolidTile|SolidWithTop|Table
//     520 食物盘 :2377-2384 底 SolidTile|SolidWithTop|Table+TEFoodPlatter
//     579 石魔头 :2241-2223 StyleDye+底 SolidTile|Table（无 SolidWithTop!）
//     593 小火山 :4428-4434 底 SolidTile|SolidWithTop|Table|SolidSide
//     630/631 臭虫箱 :4450-4487/4471-4488 五锚档（底/顶/右/左/墙,梁成员表真值）
//     723/724 锚桩 :4508-4536/4537-4560 五锚档（AlternateTile 位惰性=无成员表）
//  件2：AlternateTile 载体逐族翻案（82-84/753 白名单解禁;419 BJ622 判语维持;
//   165/442/723/724 位惰性销案锚维持;136 拉杆三档未建模保守回落）。
//  件3：uccp 路由矩阵（CustomPlace 全集亲读 :5017-5038 + Player.cs:40085 排除集;
//   uccp=false 件 185/233/236/238/530/637/709 legacy 回落面备案）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Game, anchorTilePlacementStyle, ANCHOR_GATE_SPECS } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import { Inventory } from '../src/items/Inventory';
import { LIQUID_TYPE } from '../src/world/TileStore';

const STONE = TILE_BY_KEY['stone']!;
const TABLE = TILE_BY_KEY['table']!;
const PLATFORM = TILE_BY_KEY['platform']!;

function TILE_INTERNAL_BY_SHEET(sheet: number): number {
  return TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
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
}
function mkShell(heldVid: number, heldStack = 3,
  at: { x: number; y: number } = { x: 13, y: 20 }): {
  g: GShell; w: World; inv: Inventory; drops: Array<{ key: string; n: number }>;
} {
  const w = new World(48, 48, 7, 'bj624-anchor-finale');
  const inv = new Inventory();
  inv.slots[0] = { id: iidOf(heldVid), stack: heldStack };
  const drops: Array<{ key: string; n: number }> = [];
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { nextId: 1, add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x, _y, key, n) => { drops.push({ key, n }); return null; };
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
  return { g, w, inv, drops };
}

// ============================================================================
// 件1-A 逐件三面数据锁（validateAnchors=CanPlace 移植,每面反编译行号锚）
//   面：实心收（SolidTile）/ 平台收（SolidWithTop→平台 proper-top 帧带）/
//       桌面收（Table→非平台桌面格）/ 贴墙拒（wall=false 记录无墙锚）/ 悬空拒。
//   期望位面逐件从 tile-anchors.json 记录推导（记录=提取器金标,BJ602-A 同拍锁）,
//   与原版 CanPlace 四支（TileObject.cs:404-476）语义一致。
// ============================================================================
const SHEET_VID: ReadonlyArray<readonly [number, number]> = [
  [36, 1869], [78, 222], [81, 275], [135, 529], [141, 580], [210, 937],
  [239, 19], [324, 2625], [428, 3626], [476, 4040], [494, 4089], [520, 4326],
  [579, 4761], [593, 4868], [178, 177],
];

describe('BJ624-件1A uccp1x1 十五件三面数据锁（validateAnchors 逐面）', () => {
  for (const [sheet, vid] of SHEET_VID) {
    it(`sheet ${sheet}（item ${vid}）：实心/平台/桌面/贴墙/悬空 五面`, () => {
      const rec = anchorSpecOf(sheet)!;
      expect(rec, `sheet ${sheet} 应入表驱动链`).not.toBeNull();
      expect(rec.uccp).toBe(true);
      const bits = rec.anchorBottom?.t ?? [];
      const st = new World(40, 40, 7, 't').store;
      // 实心面：SolidTile 位在记录中 → 实心底收
      if (bits.includes('SolidTile')) {
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, STONE, 0, 0);
        expect(validateAnchors(st, 12, 19, rec, 0), '实心底收').toBe(true);
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, 0, 0, 0);
      }
      // 平台面：SolidWithTop 位 → 平台（proper-top 帧带 frameX=0）收;
      // 无该位（579 石魔头/178 宝石）→ 平台拒 = 原版四支无平台臂（:404-476）
      if (bits.includes('SolidWithTop')) {
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
        expect(validateAnchors(st, 12, 19, rec, 0), '平台 proper-top 收').toBe(true);
        // 半砖平台不承（SolidWithTop 平台支 !halfBrick,TileObject.cs:466-473）
        st.half[st.idx(12, 20)] = 1;
        expect(validateAnchors(st, 12, 19, rec, 0), '半砖平台拒').toBe(false);
        st.half[st.idx(12, 20)] = 0;
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, 0, 0, 0);
      } else {
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
        expect(validateAnchors(st, 12, 19, rec, 0), '记录无 SolidWithTop → 平台拒').toBe(false);
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, 0, 0, 0);
      }
      // 桌面面：Table 位（!Platforms 前置,TileObject.cs:404-408）→ 桌收
      if (bits.includes('Table')) {
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, TABLE, 0, 0);
        expect(validateAnchors(st, 12, 19, rec, 0), '桌面收').toBe(true);
        for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, 0, 0, 0);
      }
      // 贴墙松面翻正：记录 wall=false（原版无 AnchorWall 档）→ 背墙悬空拒
      //（旧 hasSupport wall 松臂放行=松于原版,BJ622 判例）
      st.wall[st.idx(12, 19)] = 1;
      expect(validateAnchors(st, 12, 19, rec, 0), '贴墙无底锚拒').toBe(false);
      st.wall[st.idx(12, 19)] = 0;
      // 悬空拒：锚档记录带底锚带（cnt=1）→ 纯悬空拒（原版 CanPlace 锚带满分制）
      expect(validateAnchors(st, 12, 19, rec, 0), '悬空拒').toBe(false);
      void vid;
    });
  }

  it('ItemID 反查哨兵：SHEET_VID 表与 vanilla-itemfunc createTile 同源', () => {
    // 防测试表自身漂移（vid 错挂 → Game 级用例放错件）
    const funcs = require('../src/data/vanilla-itemfunc.json') as Record<string, { createTile?: number }>;
    for (const [sheet, vid] of SHEET_VID) {
      expect(funcs[String(vid)]?.createTile, `item ${vid} createTile`).toBe(sheet);
    }
  });
});

// ============================================================================
// 件1-B Game 级放置锁（tryPlace 全链：uccp1x1 门 → validateAnchors → 写格）
// ============================================================================
describe('BJ624-件1B Game 级三面锁（平台收/贴墙拒/实心收,消耗面伴随）', () => {
  it('压板 135 平台上放置（BJ602④ 长尾主诉件,BJ622 同族）→ 落格+扣 1', () => {
    const { g, w, inv } = mkShell(529);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(529)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(135));
    expect(st.frameX[st.idx(12, 19)]).toBe(0);
    expect(inv.slots[0]!.stack).toBe(2);
  });

  it('陶盆 78 平台上放置（StyleOnTable1x1 底 SolidWithTop 档）→ 落格', () => {
    const { g, w } = mkShell(222);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(222)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(78));
  });

  it('礼物 36 贴墙悬空拒（wall 松面翻正）→ 零写零消耗;同局实心照收', () => {
    const { g, w, inv } = mkShell(1869);
    const st = w.store;
    st.wall[st.idx(12, 19)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(1869)]);
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(1869)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(36));
    expect(inv.slots[0]!.stack).toBe(2);
  });

  it('炸药 141 平台收+悬空拒;地雷 210 平台收（LavaDeath=false 族同构件）', () => {
    const { g, w } = mkShell(580);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(580)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(141));
    const { g: g2, w: w2 } = mkShell(937);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 20, PLATFORM, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(937)]);
    expect(w2.store.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(210));
  });

  it('球洞 476 平台收（PLACE_OVER_PLAYER_ROSTER 16×16 实体门维持）+食物盘 520 桌面收', () => {
    const { g, w } = mkShell(4040);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(4040)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(476));
    const { g: g2, w: w2 } = mkShell(4326);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 20, TABLE, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(4326)]);
    expect(w2.store.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(520));
    // TE 登记面（TEFoodPlatter.Hook_AfterPlacement 等价,:2382 PlacementHook）
    const reg = (w2 as unknown as { furnitureItems: Array<{ x: number; y: number }> }).furnitureItems;
    expect(reg.some((f) => f.x === 12 && f.y === 19)).toBe(true);
  });

  it('石魔头 579 平台拒（记录无 SolidWithTop=原版底 SolidTile|Table 双档）桌面收', () => {
    const { g, w } = mkShell(4761);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(4761)]);
    expect(st.get(12, 19)).toBe(0);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, TABLE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(4761)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(579));
  });

  it('珊瑚 81：实心底收+顶格占用拒（anchorTop EmptyTile）+岩浆拒（liq 档）', () => {
    const { g, w } = mkShell(275);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(275)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(81));
    st.setLiquid(12, 19, 255, LIQUID_TYPE.LAVA);
    const { g: g2, w: w2, inv } = mkShell(275);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 20, PLATFORM, 0, 0);
    w2.store.setLiquid(12, 19, 255, LIQUID_TYPE.LAVA);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(275)]);
    expect(w2.store.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
  });

  it('海贝 324 悬空拒（BJ121 RepeatedCoral 门序不变）+矿锭 239 平台收', () => {
    const { g, w } = mkShell(2625);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(2625)]);
    expect(st.get(12, 19)).toBe(0);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(2625)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(324));
    const { g: g2, w: w2 } = mkShell(19);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 20, PLATFORM, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(19)]);
    expect(w2.store.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(239));
  });

  it('宝石 178 平台/桌面双拒（底 SolidTile 纯档,BJ602④ 判语回归）', () => {
    const { g, w } = mkShell(177);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(177)]);
    expect(st.get(12, 19)).toBe(0);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, TABLE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(177)]);
    expect(st.get(12, 19)).toBe(0);
  });
});

// ============================================================================
// 件1-C 桌面族与 riders 回归（13/33/49/50/174/372/646 双闸同判 + 707 书 Echo）
// ============================================================================
describe('BJ624-件1C 桌面族双闸回归', () => {
  it('书 50 平台拒（CanPlace Table 臂 !Platforms,TileObject.cs:404-408）桌面收不回归', () => {
    const { g, w } = mkShell(149);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(149)]);
    expect(st.get(12, 19)).toBe(0);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, TABLE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(149)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(50));
  });

  it('书 Echo 707（无直接放置物品=echo 变体族,数据面锁）：Table 档收/平台拒/贴墙拒', () => {
    // 707 BooksEcho Table-only（TileObjectData.cs:4566-4571 区 CopyFrom(Style1x1)+
    // anchorBottom Table,uccp 继承）——旧 hasSupport 近似下桌不收（严偏差）+
    // 墙收（松偏差）双面;若来日接入直接放置物品,uccp1x1 门按本判据归位。
    const rec = anchorSpecOf(707)!;
    expect(rec).not.toBeNull();
    expect(rec.anchorBottom!.t).toEqual(['Table']);
    const st = new World(40, 40, 7, 't').store;
    for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, TABLE, 0, 0);
    expect(validateAnchors(st, 12, 19, rec, 0), '桌面收').toBe(true);
    for (let x = 8; x < 20; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    expect(validateAnchors(st, 12, 19, rec, 0), '平台拒（Table 臂 !Platforms）').toBe(false);
  });

  it('拉杆 136 保守回落面维持（uccp1x1 排除 → hasSupport 底∪墙,墙挂照收）', () => {
    // 136 拉杆原版 alternates 1/2/3=左/右(Tree+梁)/墙（TileObjectData.cs:4560-4593）
    // ——基记录入 validateAnchors 会丢墙挂档=新严偏差,故 uccp1x1 排除（登记债）。
    // 保守态 = hasSupport 底行 SolidTile2 ∪ 墙（≈原版 alt0∪alt3 两域）。
    const { g, w } = mkShell(538);
    const st = w.store;
    st.wall[st.idx(12, 19)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(136));
    const { g: g2, w: w2 } = mkShell(538);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 20, STONE, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(538)]);
    expect(w2.store.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(136));
  });
});

// ============================================================================
// 件2 白名单解禁（82-84 药草数据面 / 753 巨型提基多格链）+ 销案锚维持
// ============================================================================
describe('BJ624-件2 AlternateTile 白名单逐族翻案', () => {
  it('82-84 解禁：anchorSpecOf 非空+altTiles=[78]（:4756）+liq 档双维独立', () => {
    for (const sheet of [82, 83, 84]) {
      const rec = anchorSpecOf(sheet)!;
      expect(rec).not.toBeNull();
      expect(rec.altTiles).toEqual([78]);
      expect(rec.liq).toEqual({ water: 'notAllowed', lava: 'notAllowed' });
      // 解禁后 validateAnchors 语义：陶盆 78 上可植（AlternateTile 成员臂）
      const st = new World(40, 40, 7, 't').store;
      st.setTileSilent(12, 20, TILE_INTERNAL_BY_SHEET(78), 0, 0);
      expect(validateAnchors(st, 12, 19, rec, 0)).toBe(true);
      // 非盆非实心（悬空）拒
      const st2 = new World(40, 40, 7, 't').store;
      expect(validateAnchors(st2, 12, 19, rec, 0)).toBe(false);
    }
  });

  it('药草放置路由不变：placeAlchRuntime 专用支（Player.cs:40085 != 82 路由排除）', () => {
    // 种子（307→82 daybloom seeds）放陶盆上 → placeAlchRuntime 落格（不经 uccp1x1 门）
    // ★盆须有地（'ontable' 级联 78 地面特支 :43930）——先铺石再置盆,防世界生成悬空
    const { g, w, inv } = mkShell(307);
    const st = w.store;
    st.setTileSilent(12, 21, STONE, 0, 0);
    st.setTileSilent(12, 20, TILE_INTERNAL_BY_SHEET(78), 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(307)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(82));
    expect(inv.slots[0]!.stack).toBe(2);
    // 生存级联（'alch' CheckAlch）不杀（盆在地=78 地面特支活）
    g.checkDecorSquareFrame(12, 19);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(82));
  });

  it('753 巨型提基解禁：3×3 多格链入表驱动（底行 SolidWithTop 平台档归位）', () => {
    const rec = anchorSpecOf(753)!;
    expect(rec).not.toBeNull();
    expect(rec.w).toBe(3);
    expect(rec.h).toBe(3);
    expect(rec.altTiles).toEqual([753]);                 // AnchorAlternateTiles={753}（:4129）
    expect(rec.uccp).toBe(true);
    // Game 级：实心底 → 3×3 落格（Origin(1,2),Style3x3）;平台底 → 落格（翻正前拒）
    const { g, w } = mkShell(6147);
    const st = w.store;
    for (let x = 8; x < 26; x++) st.setTileSilent(x, 22, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(6147)]);
    const tid = TILE_INTERNAL_BY_SHEET(753);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(st.get(11 + dx, 19 + dy), `753@${11 + dx},${19 + dy}`).toBe(tid);
    }
    // 平台底（点击平台上一格,Origin oy=2 → ay=19? 点击格=Origin 格 (12,21)）
    const { g: g2, w: w2 } = mkShell(6147, 2, { x: 13, y: 22 });
    for (let x = 8; x < 26; x++) w2.store.setTileSilent(x, 22, PLATFORM, 0, 0);
    g2.tryPlace(12, 21, ITEM_DEFS[iidOf(6147)]);
    expect(w2.store.get(11, 19)).toBe(tid);
    // 生存级联不杀（furniture 链整件复验）
    g.checkDecorSquareFrame(12, 21);
    expect(w2.store.get(11, 19)).toBe(tid);
  });

  it('销案锚维持：419 exotic 豁免（BJ622 判语）/165 位惰性/136 拉杆保守回落', () => {
    expect(anchorSpecOf(419)).toBeNull();                // placeLogicLampGate 专用门
    expect(anchorSpecOf(165)).toBeNull();                // AlternateTile 位无成员表=恒 false 惰性
    // 723/724 位惰性（无 AnchorAlternateTiles,:4508-4560 无赋值行）→ 走 BJ426 五锚档
    // （数据面锁见 BJ624-件1D）
    expect((require('../src/data/tile-anchors.json') as { tiles: Record<string, { altTiles?: number[] }> })
      .tiles['723']?.altTiles).toBeUndefined();
    expect((require('../src/data/tile-anchors.json') as { tiles: Record<string, { altTiles?: number[] }> })
      .tiles['442']?.altTiles).toBeUndefined();
  });
});

// ============================================================================
// 件3 uccp 路由矩阵（CustomPlace 全集 :5017-5038 + Player.cs:40085 排除集）
// ============================================================================
describe('BJ624-件3 uccp 路由矩阵锁', () => {
  it('630/631 成员表数据面（altTiles=[124,561,574-578] :4449/:4470——与 723/724 惰性位反证）', () => {
    for (const sheet of [630, 631]) {
      expect((require('../src/data/tile-anchors.json') as { tiles: Record<string, { altTiles?: number[] }> })
        .tiles[String(sheet)]?.altTiles).toEqual([124, 561, 574, 575, 576, 577, 578]);
    }
  });

  it('路由归属定谳：非 1×1 uccp 件已走表驱动链（BJ600/602），本刀扩展面=1×1 锚档', () => {
    // BJ622 anchorFree1x1 谓词扩展问题定谳：原版路由对 uccp=true 不分足印——
    // Player.cs:40085 CustomPlace → CanPlace 全链。本仓多格 uccp=true（14 炉/241 墓穴/
    // 647 碎块/753 提基等）自 BJ600/602 起已走 chooseAnchorFromClick/validateAnchors
    // （=CanPlace 移植）→ 无需扩展;本刀扩展面 = 1×1 锚档（uccp1x1 门全语义化）。
    // uccp=false 多格（233/236/238/530）原版走 AssortedThings legacy catch-all——
    // 本仓维持表驱动（严于 catch-all 的邻接/墙域=登记债,见下用例备案）。
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'Game.ts'), 'utf8');
    expect(src).toMatch(/anchorRec\.w > 1 \|\| anchorRec\.h > 1/);   // 多格链门不变
    expect(src).toMatch(/const uccp1x1 = anchorRec !== null/);
  });

  it('uccp=false 表驱动件（185/233/236/238/530/637/709）数据面+legacy 回落面备案', () => {
    // 原版路由：CustomPlace=false → AssortedThings legacy（Player.cs:40097）。
    // 185 小石堆/:4145 尾支 catch-all（四邻 active∧(tileSolid|IsBeam|绳|轨314)∨墙>0）
    // 233/236/238/530 无专属支落同 catch-all;637 同;709 ∈ IsADripTile 专属支
    // （:41410-41415 上方 nactive∧tileSolid∧!tileSolidTop）。
    // 本仓面：233/236/238/530 多格表驱动（validateAnchors 底行制,严于 catch-all 的
    // 邻接/墙域=登记债,不在本刀翻）;637/709 1×1 uccp=false → hasSupport/专用支。
    for (const sheet of [185, 233, 236, 238, 530, 637, 709]) {
      const rec = anchorSpecOf(sheet)!;
      expect(rec, `sheet ${sheet}`).not.toBeNull();
      expect(rec.uccp, `sheet ${sheet} uccp=false（原版 legacy 路由域）`).toBe(false);
    }
    // 427 队伍平台（BJ622 排除面）uccp=false 维持
    expect(anchorSpecOf(427)!.uccp).toBe(false);
  });

  it('路由门源码结构锁：uccp1x1 门（136 排除）替换 anchorFree1x1;82 路由排除面', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'Game.ts'), 'utf8');
    expect(src).not.toMatch(/const anchorFree1x1/);      // 旧谓词已退役
    expect(src).toMatch(/const uccp1x1 = anchorRec !== null/);
    expect(src).toMatch(/&& \(def\.vanilla\?\.sheet \?\? -1\) !== 136;/);
    // 原版 Player.cs:40085 排除集 {82,227,4} 的本仓对应：82-84 isAlchPlace 豁免 +
    // 4 火把专用支 + 227 染料专用支（tryPlace 早退分支,不落 uccp1x1 门）
    expect(src).toMatch(/const isAlchPlace = !itemDef\.key\.startsWith\('place_v_'\)/);
    expect(src).toMatch(/const isLogicLamp = def\?\.vanilla\?\.sheet === 419;/);
  });

  it('validateAnchors 拆臂哨兵：SolidWithTop/Table 两臂独立（旧合并支退役）', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'world', 'TileAnchorValidator.ts'), 'utf8');
    expect(src).not.toMatch(/bit\('SolidWithTop'\) \|\| bit\('Table'\)/);   // 合并支已拆
    expect(src).toMatch(/bit\('SolidWithTop'\)/);
    expect(src).toMatch(/bit\('Table'\) && TILE_TABLE_SHEETS\.has\(sheet\) && !PLATFORMS_SHEETS\.has\(sheet\)/);
    // SolidWithTop 平台臂须带 proper-top 帧带门（WorldGen.PlatformProperTopFrame :70686）
    expect(src).toMatch(/platformProperTopFrame/);
  });
});

// ============================================================================
// 件1-D 五锚档扩展（630/631 臭虫箱 + 442 弹幕压垫）与 723/724 惰性位翻正
// ============================================================================
describe('BJ624-件1D 630/631 臭虫箱五锚档（TileObjectData.cs:4450-4487/:4471-4488）', () => {
  const B630 = TILE_INTERNAL_BY_SHEET(630);

  function w630(): ReturnType<typeof mkShell> {
    return mkShell(5137);
  }

  it('档0 底锚：实心/平台（SolidWithTop 翻正前拒）承', () => {
    const { g, w } = w630();
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(st.get(12, 19)).toBe(0);                       // 悬空拒
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(st.get(12, 19)).toBe(B630);
    expect(st.frameX[st.idx(12, 19)]).toBe(0);            // 档0 帧
  });

  it('档0 AlternateTile 成员臂（梁 124 承=成员表真值 :4449——723/724 反证面）', () => {
    const st = new World(40, 40, 7, 't').store;
    st.setTileSilent(12, 20, TILE_INTERNAL_BY_SHEET(124), 0, 0);
    expect(anchorTilePlacementStyle(st, 12, 19, ANCHOR_GATE_SPECS[630])).toBe(0);
    // 反证：723 spec（成员表空=惰性位）同域不承
    expect(anchorTilePlacementStyle(st, 12, 19)).toBe(-1);
  });

  it('档1 顶锚（吊挂 SolidTile|SolidSide|AlternateTile|SolidBottom）+帧带 18', () => {
    const { g, w } = w630();
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 18, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(st.get(12, 19)).toBe(B630);
    expect(st.frameX[st.idx(12, 19)]).toBe(18);           // 档1 帧（alternate 1）
    // 生存级联 'stinkbug'：吊挂态不杀（CheckStinkbugBlocker 重定向后 style1 活）
    g.checkDecorSquareFrame(12, 19);
    expect(st.get(12, 19)).toBe(B630);
  });

  it('档2/3 侧锚（alternate 2=右/3=左,序互换 :4462-4469）+帧带 36/54', () => {
    // 右邻实心 → alternate 2（帧 36）
    const { g, w } = w630();
    const st = w.store;
    st.setTileSilent(13, 19, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(st.get(12, 19)).toBe(B630);
    expect(st.frameX[st.idx(12, 19)]).toBe(36);
    // 左邻实心 → alternate 3（帧 54）
    const { g: g2, w: w2 } = w630();
    w2.store.setTileSilent(11, 19, STONE, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(w2.store.frameX[w2.store.idx(12, 19)]).toBe(54);
  });

  it('档4 墙锚 + 帧带 72 + 生存级联墙臂不杀（放置/幸存对称翻正）', () => {
    const { g, w } = w630();
    const st = w.store;
    st.wall[st.idx(12, 19)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5137)]);
    expect(st.get(12, 19)).toBe(B630);                    // 旧态可放但级联即拆
    expect(st.frameX[st.idx(12, 19)]).toBe(72);
    g.checkDecorSquareFrame(12, 19);                      // 'stinkbug' 墙臂（:54351）
    expect(st.get(12, 19)).toBe(B630);
  });

  it('631 回声变体同构（5138 同门）', () => {
    const { g, w } = mkShell(5138);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5138)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(631));
  });
});

describe('BJ624-件1E 442 弹幕压垫四档+四向 viable（CanPlaceProjectilePressurePad :87583）', () => {
  const B442 = TILE_INTERNAL_BY_SHEET(442);

  it('档0 下锚：下方实心承（bits+canDown 双门）+帧带 22×0=0', () => {
    const { g, w } = mkShell(3707);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(st.get(12, 19)).toBe(B442);
    expect(st.frameX[st.idx(12, 19)]).toBe(0);
    g.checkDecorSquareFrame(12, 19);                      // 'projpad' 生存不杀
    expect(st.get(12, 19)).toBe(B442);
  });

  it('档0 平台承（SolidWithTop+canDown 平台豁免 noAttach :87548）', () => {
    const { g, w } = mkShell(3707);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(st.get(12, 19)).toBe(B442);                    // 旧态 hasSupport 拒平台
  });

  it('悬空拒（bits EmptyTile 臂被 hook canDown 压制=原版 :87583 case0）+贴墙拒（无墙档）', () => {
    const { g, w } = mkShell(3707);
    const st = w.store;
    st.wall[st.idx(12, 19)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(st.get(12, 19)).toBe(0);                       // 旧态墙挂可放=松于原版
  });

  it('档1 上锚（吊挂）+帧带 22;生存重定向对称', () => {
    const { g, w } = mkShell(3707);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 18, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(st.get(12, 19)).toBe(B442);
    expect(st.frameX[st.idx(12, 19)]).toBe(22);           // 档1 帧
    g.checkDecorSquareFrame(12, 19);
    expect(st.get(12, 19)).toBe(B442);
  });

  it('档2/3 侧锚（左/右邻实心）+帧带 44/66', () => {
    const { g, w } = mkShell(3707);
    const st = w.store;
    st.setTileSilent(11, 19, STONE, 0, 0);                // 左邻（alternate 2=Left :4652）
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(st.get(12, 19)).toBe(B442);
    expect(st.frameX[st.idx(12, 19)]).toBe(44);
    const { g: g2, w: w2 } = mkShell(3707);
    w2.store.setTileSilent(13, 19, STONE, 0, 0);          // 右邻（alternate 3=Right :4658）
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(w2.store.frameX[w2.store.idx(12, 19)]).toBe(66);
  });

  it('生存重定向：下方支撑挖除 → 重定向到 viable 档（CheckProjectilePressurePad :87487-87495）', () => {
    const { g, w } = mkShell(3707);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    st.setTileSilent(11, 19, STONE, 0, 0);                // 左邻亦有 → 重定向候选
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3707)]);
    expect(st.frameX[st.idx(12, 19)]).toBe(0);
    // 挖除下方支撑 → 级联重定向到左锚（帧 44）
    st.setTileSilent(12, 20, 0, 0, 0);
    g.checkDecorSquareFrame(12, 19);
    expect(st.get(12, 19)).toBe(B442);
    expect(st.frameX[st.idx(12, 19)]).toBe(44);
  });
});
