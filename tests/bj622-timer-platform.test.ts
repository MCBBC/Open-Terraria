// BJ622 2026-10-10 计时器平台放置（用户实报「计时器不能放在平台上？」——BJ602 件4
// 1×1 单件族 raw 路长尾首个实报实例）
//
// 定谳（Terarria1457 亲读行号锚）：
//   · 计时器 tile id = 144（TileID.cs:725 `Timers = 144`；642=叶绿提取机,任务面误记勘正）。
//   · TileObjectData.cs:4399-4404：CopyFrom(Style1x1 :4246-4251) + StyleHorizontal +
//     AnchorBottom = new AnchorData(AnchorType.None, 0, 0) + AnchorInvalidTiles=null +
//     LavaDeath=false → 【无任何锚定面】。uccp 继承 Style1x1=true → CustomPlace(144)
//     =true（TileObjectData.cs:5017-5036）→ 原版路由 = TileObject.CanPlace
//     （Player.cs:40085）；CanPlace :390 `anchorBottom.tileCount != 0` 整段跳过 →
//     平台/桌面/实心/悬空皆可放,门=占用(:357)+液体(LiquidPlace :1853-1907,水
//     Allowed/岩浆 NotAllowed)。物品 583/584/585（Item.cs:8194/8209/8224）+
//     4484/4485（:37830）createTile=144 placeStyle 0-4。
//   · 生存面：原版 TileFrame 无 case 144 → 无失撑杀（悬空保留=原版本相）。
//   · 本仓拒放点：主放置链 anchorRec 非空但 1×1 不走 chooseAnchorFromClick/validate
//     Anchors（`anchorRec.w>1||h>1` 门）→ 落 hasSupport 近似（底 SolidTile2∪墙,
//     framed 恒拒）→ 平台/桌面/悬空拒放。修=无锚 1×1 档（四侧 cnt==0 ∧ wall=false ∧
//     uccp===true）路由 validateAnchors 自记录全语义消费。
//   · 同族收编（同构 None 块 + uccp=true）：420 逻辑门(:4251-4256)/423 传感器
//     (:4353-4358)/424 管线(:4358-4363)/445 像素盒(:4363-4368)/429 灯泡(:4368-4373)。
//     排除：19 平台（非 framed）/427 队伍平台（framed 但 uccp=false,原版 legacy
//     AssortedThings 路 TileObjectData.cs:4445-4452）/419 灯（anchorBottom=
//     AlternateTile exotic 豁免 → placeLogicLampGate 专用门维持）。
//   · 生存对称（420/423/424/429/445）：原版 TileFrame 仅 CheckLogicTiles 帧对齐支
//     （:86874-86881 派发,:45678 函数体——419 独占下锚门,余帧 18 对齐判）→ 悬空
//     放置后无失撑杀;本仓 DECOR_SUPPORT_KIND 'logic' 同语义（Game.ts case 'logic'）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import { Inventory } from '../src/items/Inventory';
import { LIQUID_TYPE } from '../src/world/TileStore';

const STONE = TILE_BY_KEY['stone']!;
const TABLE = TILE_BY_KEY['table']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const CHEST = TILE_BY_KEY['chest']!;

function TILE_INTERNAL_BY_SHEET(sheet: number): number {
  return TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
}

function iidOf(vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} 应有物品`).toBeTruthy();
  return ITEM_BY_KEY[key!]!;
}

/** tryPlace 可驱动面最小桩（shell 形制同 tests/bj602-tile-anchor-gaps.test.ts mkShell） */
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
  const w = new World(48, 48, 7, 'bj622-timer-platform');
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

describe('BJ622-A 数据面锁（防提取器再生漂移,反编译行号锚）', () => {
  it('计时器 144 记录 = 无锚四侧 + uccp=true + 墙 false（TileObjectData.cs:4399-4404）', () => {
    const rec = anchorSpecOf(144)!;
    expect(rec).not.toBeNull();
    expect(rec.w).toBe(1);
    expect(rec.h).toBe(1);
    expect(rec.uccp).toBe(true);                       // CustomPlace 路由维（Style1x1 继承）
    expect(rec.wall).toBe(false);
    for (const side of [rec.anchorTop, rec.anchorBottom, rec.anchorLeft, rec.anchorRight] as const) {
      expect(side === null || side.cnt === 0, `锚侧应空（${JSON.stringify(side)}）`).toBe(true);
    }
    expect(rec.liq).toEqual({ water: 'allowed', lava: 'notAllowed' });   // LavaDeath=false→默认档
    // validateAnchors 消费自记录：空场无锚即过（占用+液体门外无判据）
    const st = new World(40, 40, 7, 't').store;
    expect(validateAnchors(st, 12, 12, rec, 0)).toBe(true);
  });

  it('同族收编面（420/423/424/429/445 同构 None 块 uccp=true）与排除面（427 uccp=false）', () => {
    for (const sheet of [420, 423, 424, 429, 445]) {
      const rec = anchorSpecOf(sheet)!;
      expect(rec, `sheet ${sheet} 应入表`).not.toBeNull();
      expect(rec.uccp, `sheet ${sheet} uccp`).toBe(true);
      expect(rec.wall).toBe(false);
      for (const side of [rec.anchorTop, rec.anchorBottom, rec.anchorLeft, rec.anchorRight] as const) {
        expect(side === null || side.cnt === 0).toBe(true);
      }
    }
    // 427 队伍平台：uccp=false（TileObjectData.cs:4445-4452 UsesCustomCanPlace=false）
    // → 原版 legacy 路不吃 CanPlace → 本刀路由判据排除
    expect(anchorSpecOf(427)!.uccp).toBe(false);
  });
});

describe('BJ622-B 计时器放置锁（①平台/悬空/桌面逐面 + ②既有支撑面回归）', () => {
  it('平台上方放置（用户实报主诉）：平台行上空格 → 落格+帧 style0+扣 1', () => {
    const { g, w, inv } = mkShell(583);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    const tid = TILE_INTERNAL_BY_SHEET(144);
    expect(st.get(12, 19)).toBe(tid);
    expect(st.frameX[st.idx(12, 19)]).toBe(0);           // style 0（Place1x1 case 144 :45624 frameX=style*18）
    expect(st.frameY[st.idx(12, 19)]).toBe(0);
    expect(inv.slots[0]!.stack).toBe(2);                 // 消耗 1
  });

  it('placeStyle 面：¼秒计时器（4485,placeStyle4）→ frameX=72（掉落映射 :66120 区 frameX 72=4485）', () => {
    const { g, w } = mkShell(4485);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(4485)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
    expect(st.frameX[st.idx(12, 19)]).toBe(4 * 18);
  });

  it('悬空放置（无支撑无墙）→ 成功（AnchorBottom=None 原版本相,旧 hasSupport 恒拒）', () => {
    const { g, w, inv } = mkShell(583);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
    expect(inv.slots[0]!.stack).toBe(2);
    // 生存对称：放置尾级联（m-5 SquareTileFrame 等价面）不杀——原版 TileFrame 无 144 支
    g.checkDecorSquareFrame(12, 19);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
  });

  it('桌面上放置 → 成功（原版同放,旧 hasSupport onTable 门不含 144 恒拒）', () => {
    const { g, w } = mkShell(583);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, TABLE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
  });

  it('实心地面放置回归（旧能放的照放）', () => {
    const { g, w } = mkShell(583);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
  });

  it('水中放置 → 成功（liq water=allowed,LiquidPlace :1853-1907 水维放行）', () => {
    const { g, w } = mkShell(583);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    st.setLiquid(12, 19, 255, LIQUID_TYPE.WATER);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
  });

  it('岩浆中拒放（liq lava=notAllowed）→ 零写零消耗', () => {
    const { g, w, inv } = mkShell(583);
    const st = w.store;
    st.setLiquid(12, 19, 255, LIQUID_TYPE.LAVA);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
  });

  it('占用拒（点击平台格本体=非 tileCut/BWP 占位格,CanPlace :357）→ 零写零消耗平台保留', () => {
    const { g, w, inv } = mkShell(583);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 20)).toBe(PLATFORM);               // 平台原样
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
  });

  it('邻格非支撑件不误伤（点箱旁悬空照放——无锚档不读邻域）', () => {
    const { g, w } = mkShell(583);
    const st = w.store;
    st.setTileSilent(13, 19, CHEST, 0, 0);               // 右邻箱子（非锚域）
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(583)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(144));
  });
});

describe('BJ622-C 同族收编/排除锁', () => {
  it('420 逻辑门悬空放置 → 成功（同构 None 块收编,:4251-4256）+ 生存不杀', () => {
    const { g, w, inv } = mkShell(3603);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3603)]);
    const tid = TILE_INTERNAL_BY_SHEET(420);
    expect(st.get(12, 19)).toBe(tid);
    expect(inv.slots[0]!.stack).toBe(2);
    g.checkDecorSquareFrame(12, 19);                     // CheckLogicTiles 帧对齐支（frameX=0 过）
    expect(st.get(12, 19)).toBe(tid);
  });

  it('424 管线悬空放置 → 成功（:4358-4363 同构收编）', () => {
    const { g, w } = mkShell(3616);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3616)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(424));
  });

  it('427 队伍平台排除面：悬空拒放（uccp=false → 旧 hasSupport 路维持,不因 framed 误入本支）', () => {
    const { g, w, inv } = mkShell(3622);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3622)]);
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
    // 实心邻接照放（legacy 路不回归）
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3622)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(427));
  });

  it('419 灯专用门维持：悬空拒（下方无 419/420）/下方逻辑门收（placeLogicLampGate :45712 不回归）', () => {
    const { g, w, inv } = mkShell(3602);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3602)]);
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
    st.setTileSilent(12, 20, TILE_INTERNAL_BY_SHEET(420), 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3602)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(419));
  });

  it('有锚 1×1 族零回归（belowOk 未动）：压板 135 实心底收/纯悬空拒（原版锚档同判）', () => {
    const { g, w, inv } = mkShell(529);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(529)]);
    expect(st.get(12, 19)).toBe(0);                      // anchorBottom SolidTile|SolidWithTop|SolidSide 悬空拒=原版同
    expect(inv.slots[0]!.stack).toBe(3);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(529)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(135));
  });
});
