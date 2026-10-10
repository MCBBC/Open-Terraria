// BJ602 2026-10-10 tile-anchors 提取缺口收尾（BJ600 收刀新登记四债，放置域收官刀）
//
// 债面→定谳→落刀（Terarria1457 亲读行号锚）：
//   ① tile 241 地下墓穴缺 AnchorWall：TileObjectData.cs:4794 Style3x3Wall 基样式块
//      `newTile.AnchorWall = true` → CopyFrom 后接 Width 的 241（:4840-4846 w4 h3）/242/
//      245/246 同承；旧提取器 Width 处家族头净化【无条件】清 wall/锚 → 继承面丢失
//      （wall 恒 false）=提取缺口。修=recon-tileobj.mjs 净化门改「仅本块无 CopyFrom
//      时生效」→ 241 入通用表驱动链（validateAnchors rec.wall 逐格门 + 'wallhang'
//      Check4x3Wall 级联 Game.ts:1214 区派发表）。
//   ② tile 698 瓶 anchorTop 含 AlternateTile 特殊位：TileObjectData.cs:2480-2481
//      anchorTop = SolidTile|SolidSide|AlternateTile|SolidBottom|PlanterBox +
//      AnchorAlternateTiles {213,366,365,353,214,449,450,451}——AlternateTile 语义 =
//      锚格 active 且 sheet∈成员表（isValidAlternateAnchor :1969-1984,消费位
//      TileObject.cs:509）。修=提取器 altTiles 维度 + evalCell AlternateTile 分支 +
//      anchorSpecOf 白名单（ALTERNATE_MODELED={698,693,694}）→ 698 入链。
//   ③ multi 族魔杖 1×1 直写：碎块 5330→647/648（3×2,Style3x2 :3168-3185）/便携窑
//      5481→653（2×2）/MiteyTitey 5464→693/694——原版同支 ModifyFlexibleWandPlacementInfo
//      （Player.cs:40105-40125）只覆写 tile/style,CustomPlace(647)=true（uccp 继承
//      Style3x2 :3172）→ CanPlace/Place 全链。修=BJ600 fall-through 注入链去掉
//      !consumesAmmo 与 !==241 门；弹药消耗=链尾分流（ConsumeFlexibleWandMaterial
//      Player.cs:40477-40479/:40490-40499）。MiteyTitey 694 style≥42 坐地变体 =
//      子样式记录（TileObjectData.cs:4231-4241 addSubTileRange(39,39) anchorBottom
//      翻转,GetTileData :5127-5162 整记录替换）→ 提取器 subTiles 维度 + 锚样式解析。
//   ④ 1×1 单件族 raw 路 belowOk 近似：书 50=仅桌面（anchorBottom Table,CopyFrom
//      Style1x1 :4246-4251 区）/珊瑚 81=顶格须空+底部实心族（anchorTop EmptyTile+
//      anchorBottom SolidTile|SolidWithTop|SolidSide）/宝石 178=SolidTile/
//      小碎砾 650/700/701/703/707=各自底锚档。修=raw 路支撑面 validateAnchors 化
//      （wSpec null 保留 belowOk 兜底）。
//   ⑤ BJ600 除外清单翻转：`!wand.consumesAmmo` 与 `opt.tileSheet !== 241` 双门撤除
//      （源码锚断言 + ①②③行为锁覆盖）。
// 金标闸：tests/golden/tile-anchor-authority.json 与 src/data/tile-anchors.json 同拍
//   再生（本测试 A 组钉 18 变更面值,反编译行号逐条锚）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import { Inventory } from '../src/items/Inventory';
import { LIQUID_TYPE } from '../src/world/TileStore';
import manifestJson from '../src/data/tile-anchors.json';
import goldenJson from './golden/tile-anchor-authority.json';

const STONE = TILE_BY_KEY['stone']!;
const TABLE = TILE_BY_KEY['table']!;

/** sheet→内部 tile id（测试辅助;域平移单源在 Game.TILE_INTERNAL_BY_SHEET,此处独立
 *  反查防测试与生产耦合;缺册返回 -1 由用例断言兜底） */
function TILE_INTERNAL_BY_SHEET(sheet: number): number {
  return TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
}

function iidOf(vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} 应有物品`).toBeTruthy();
  return ITEM_BY_KEY[key!]!;
}

/** tryPlace 可驱动面最小桩（shell 形制同 tests/bj600-garden-gnome-place.test.ts） */
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
function mkShell(heldVid: number, heldStack = 3, cycle = 0,
  at: { x: number; y: number } = { x: 13, y: 20 }): {
  g: GShell; w: World; inv: Inventory; drops: Array<{ key: string; n: number }>;
} {
  const w = new World(48, 48, 7, 'bj602-anchors');
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
  g.flexWandCycle = cycle;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    // 站位贴点击格（inTileRange 射程门 tileReach 缺省 5 格——原版 PlaceThing 同门）
    cx: (at.x + 1) * 16 + 8, cy: (at.y + 1) * 16 + 8,
    x: (at.x + 1) * 16 + 2, y: (at.y + 1) * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false, dead: false, isGhostPhase: () => false,
    buffs: { has: () => false }, equipStats: {},
    inv,
  };
  return { g, w, inv, drops };
}

describe('BJ602-A 提取器三维度金标（反编译行号锚,防静默漂移）', () => {
  it('运行时 manifest 与金标逐字节一致（同拍再生）', () => {
    expect(manifestJson.v).toBe('1457');
    expect(goldenJson).toEqual(manifestJson);
  });

  it('①241 AnchorWall 继承修复（TileObjectData.cs:4794→:4840-4846）', () => {
    const rec = (manifestJson.tiles as Record<string, any>)['241'];
    expect(rec).toMatchObject({ w: 4, h: 3, ox: 1, oy: 1, wall: true, uccp: true });
    // 同承族：242（:4853-4856 w6 h4）/245（:4825-4833）/246（:4804-4807）
    expect((manifestJson.tiles as Record<string, any>)['242']).toMatchObject({ w: 6, h: 4, wall: true });
    expect((manifestJson.tiles as Record<string, any>)['245']).toMatchObject({ w: 2, h: 3, wall: true });
    expect((manifestJson.tiles as Record<string, any>)['246']).toMatchObject({ w: 3, h: 2, wall: true });
    // 家族头净化门仍生效：27 藤蔓（Width 无 CopyFrom 块头,wall 不继承）
    expect((manifestJson.tiles as Record<string, any>)['27']!.wall).toBe(false);
  });

  it('②698 altTiles 成员表（TileObjectData.cs:2481）+ anchorSpecOf 解禁', () => {
    const rec = (manifestJson.tiles as Record<string, any>)['698'];
    expect(rec.altTiles).toEqual([213, 366, 365, 353, 214, 449, 450, 451]);
    expect(anchorSpecOf(698)).not.toBeNull();
    // 保守回落面（★BJ624 翻案后复核）：165 位惰性（无成员表=原版恒 false,销案锚维持）
    // 与 136 拉杆（alternates 三档未建模）维持;82-84/753 已随 BJ624 件2 逐族翻案解禁
    // （82: AnchorAlternateTiles={78} :4756——放置路由仍走 placeAlchRuntime 专用支,
    // Player.cs:40085 `tileToCreate != 82` 路由排除,解禁只放开数据面/预览/实体门域）
    expect(anchorSpecOf(165)).toBeNull();
    expect(anchorSpecOf(82)).not.toBeNull();
    expect(anchorSpecOf(753)).not.toBeNull();
    expect(anchorSpecOf(419)).toBeNull();     // BJ622 判语维持（placeLogicLampGate）
  });

  it('③693/694 subTiles 坐地变体（:4406-4426/:4231-4241 addSubTileRange(39,39)）', () => {
    const r694 = anchorSpecOf(694)!;
    expect(r694.anchorTop!.t).toContain('SolidTile');           // 基样式=吊顶（anchorTop）
    expect(r694.anchorBottom).toBeNull();
    const sit = anchorSpecOf(694, 42)!;                          // style 42 = 坐地子样式
    expect(sit).not.toBe(r694);
    expect(sit.anchorTop).toBeNull();
    expect(sit.anchorBottom!.t).toEqual(['SolidTile', 'SolidWithTop', 'SolidSide']);
    expect(sit.oy).toBe(1);                                      // Origin(0,1)（:4238）
    const r693 = anchorSpecOf(693)!;
    expect(r693.anchorTop).not.toBeNull();
    expect(anchorSpecOf(693, 42)!.anchorBottom).not.toBeNull(); // 1×1 坐地（:4412-4415）
    // 全 39 档（39-77）入库
    expect(Object.keys((manifestJson.tiles as Record<string, any>)['694']!.subTiles!).length).toBe(39);
  });

  it('④uccp 维度（UsesCustomCanPlace:ctor :1679 缺省 false/Style 系继承/ApplyNaturalObjectRules :1847）', () => {
    expect((manifestJson.tiles as Record<string, any>)['241']!.uccp).toBe(true);   // Style3x3Wall :4795
    expect((manifestJson.tiles as Record<string, any>)['694']!.uccp).toBe(true);   // Style1x2 系
    expect((manifestJson.tiles as Record<string, any>)['165']!.uccp).toBe(false);  // ApplyNaturalObjectRules :4993
    expect((manifestJson.tiles as Record<string, any>)['19']!.uccp).toBe(false);   // 平台 :2134
    expect((manifestJson.tiles as Record<string, any>)['14']!.uccp).toBe(true);    // Style3x2 :3172
  });
});

describe('BJ602-① 241 地下墓穴放置锁（4×3 墙写+Check4x3Wall 语义）', () => {
  it('validateAnchors：逐格墙门（AnchorWall→isValidWallAnchor 全格 wall>0）', () => {
    const st = new World(40, 40, 7, 't').store;
    const rec = anchorSpecOf(241)!;
    // 背景墙全域 + 底行实心（Style3x3Wall 无侧锚,墙即全部锚定面）
    for (let x = 8; x < 20; x++) for (let y = 8; y < 20; y++) st.wall[st.idx(x, y)] = 1;
    for (let x = 8; x < 20; x++) st.setTileSilent(x, 16, STONE, 0, 0);
    expect(validateAnchors(st, 10, 13, rec, 0)).toBe(true);
    // 任一格墙缺失 → 整件拒（CanPlace :339-350 num24 满分制）
    st.wall[st.idx(12, 14)] = 0;
    expect(validateAnchors(st, 10, 13, rec, 0)).toBe(false);
  });

  it('Game 级：碎墓杖（1417）→ 4×3 整件落位+帧带 case 241+零掉落', () => {
    const { g, w, drops } = mkShell(1417, 2, 0);
    const st = w.store;
    for (let x = 8; x < 24; x++) for (let y = 8; y < 24; y++) st.wall[st.idx(x, y)] = 1;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 22, STONE, 0, 0);   // 地板在足印外
    g.flexWandCycle = 3;                                   // style 3
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(1417)]);
    const tid = TILE_INTERNAL_BY_SHEET(241);
    // Origin(1,1)：点击格=物件内 (1,1) → 左上 (11,18)
    for (let dx = 0; dx < 4; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        expect(st.get(11 + dx, 18 + dy), `241@${11 + dx},${18 + dy}`).toBe(tid);
        // 帧：frameX=dx*18,frameY=style*54+dy*18（furnitureStyleBase case 241 竖排;
        // Check4x3Wall WorldGen.cs:45309-45311 frameX=(i-num4)*18/frameY=带*54+行*18 同域）
        expect(st.frameX[st.idx(11 + dx, 18 + dy)]).toBe(dx * 18);
        expect(st.frameY[st.idx(11 + dx, 18 + dy)]).toBe(3 * 54 + dy * 18);
      }
    }
    expect(drops).toEqual([]);                             // 零掉落（旧病=1×1 裸写→级联杀→循环）
    // 完整性稳态：Check4x3Wall 级联（'wallhang' 派发）复验不杀
    g.checkDecorSquareFrame(12, 19);
    expect(st.get(11, 18)).toBe(tid);
    expect(st.get(14, 20)).toBe(tid);
  });

  it('Game 级：无墙区拒放（validateAnchors 墙门）→ 零写零消耗', () => {
    const { g, w, inv } = mkShell(1417, 2, 0);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);   // 地板有、墙无
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(1417)]);
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(2);
  });
});

describe('BJ602-② 698 展示罐放置锁（anchorTop+AlternateTile 特殊位）', () => {
  it('validateAnchors：顶锚 SolidTile / 梁 213（AlternateTile）/ 种植箱 380 / 空顶拒', () => {
    const st = new World(40, 40, 7, 't').store;
    const rec = anchorSpecOf(698)!;
    const beam = TILE_INTERNAL_BY_SHEET(213);
    const planter = TILE_INTERNAL_BY_SHEET(380);
    for (let x = 8; x < 20; x++) st.setTileSilent(x, 10, STONE, 0, 0);   // 天花板行
    expect(validateAnchors(st, 12, 11, rec, 1)).toBe(true);              // 实心顶
    st.setTileSilent(14, 10, beam, 0, 0);
    expect(validateAnchors(st, 14, 11, rec, 1)).toBe(true);              // 梁=AlternateTile 成员
    st.setTileSilent(16, 10, planter, 0, 0);
    expect(validateAnchors(st, 16, 11, rec, 1)).toBe(true);              // 种植箱=PlanterBox 位
    expect(validateAnchors(st, 20, 11, rec, 1)).toBe(false);             // 无顶格=锚带缺（天花板带止于 x<20）
  });

  it('Game 级：展示罐杖（5472）→ 1×2 吊挂整件+display_jar TE 登记+零掉落', () => {
    const { g, w, drops } = mkShell(5472, 2, 0, { x: 13, y: 12 });
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 10, STONE, 0, 0);
    g.tryPlace(12, 11, ITEM_DEFS[iidOf(5472)]);
    const tid = TILE_INTERNAL_BY_SHEET(698);
    // Origin(0,0)：点击格=顶格；1×2 向下延伸（帧带 style1）
    expect(st.get(12, 11)).toBe(tid);
    expect(st.get(12, 12)).toBe(tid);
    expect(st.frameX[st.idx(12, 11)]).toBe(18);            // StyleHorizontal：frameX=style*18（Style1x2Top :2471-2473）
    expect(drops).toEqual([]);
    // TE 登记（HookPostPlaceMyPlayer TEDeadCellsDisplayJar.Hook_AfterPlacement 等价面）
    const reg = (w as unknown as { furnitureItems: Array<{ x: number; y: number }> }).furnitureItems;
    expect(reg.some((f) => f.x === 12 && f.y === 11)).toBe(true);
  });
});

describe('BJ602-③ multi 族魔杖整件落位锁（碎块 647 3×2 足印/便携窑/钟乳石坐地）', () => {
  it('碎块魔杖大（5330+石块弹药）→ 647 3×2 六格整件+逐格帧+弹药扣 1+杖不扣', () => {
    const { g, w, inv, drops } = mkShell(5330, 1, 0);
    const st = w.store;
    inv.slots[1] = { id: iidOf(3), stack: 9 };             // 石块弹药（RubblePlacementLarge 桶 3）
    for (let x = 8; x < 26; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.flexWandCycle = 0;                                   // large 桶[3] 首选项=647 style 7
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5330)]);
    const tid = TILE_INTERNAL_BY_SHEET(647);
    // Origin(1,1)：点击格=物件内 (1,1) → 左上 (11,18),足印 3×2
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(st.get(11 + dx, 18 + dy), `647@${11 + dx},${18 + dy}`).toBe(tid);
        // 帧：横排 X 步 54（Style3x2 StyleHorizontal,frameX=style*54+dx*18,frameY=dy*18）
        expect(st.frameX[st.idx(11 + dx, 18 + dy)]).toBe(7 * 54 + dx * 18);
        expect(st.frameY[st.idx(11 + dx, 18 + dy)]).toBe(dy * 18);
      }
    }
    expect(drops).toEqual([]);                             // 零掉落（旧病=1×1 直写残废）
    expect(inv.slots[1]!.stack).toBe(8);                   // 弹药扣 1（ConsumeFlexibleWandMaterial）
    expect(inv.slots[0]!.stack).toBe(1);                   // 杖本体不扣（consumable=false 族）
  });

  it('便携窑（5481+雪块弹药 664）→ 653 2×2 整件落位（旧 1×1 直写残废同族）', () => {
    const { g, w, inv, drops } = mkShell(5481, 1, 0);
    const st = w.store;
    inv.slots[1] = { id: iidOf(664), stack: 9 };           // CreatePortableKiln 桶 664（:365 ByRow rows4-6）
    for (let x = 8; x < 26; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5481)]);
    const tid = TILE_INTERNAL_BY_SHEET(653);
    // 653 Origin(0,1)：点击格=底行左格 → 左上 (12,18),足印 2×2
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(st.get(12 + dx, 18 + dy), `653@${12 + dx},${18 + dy}`).toBe(tid);
      }
    }
    expect(drops).toEqual([]);
    expect(inv.slots[1]!.stack).toBe(8);
  });

  it('MiteyTitey 坐地变体（5464+石块 cycle9→694 style42）→ 底锚落位+折行帧带', () => {
    const { g, w, inv, drops } = mkShell(5464, 1, 0);
    const st = w.store;
    inv.slots[1] = { id: iidOf(3), stack: 9 };
    for (let x = 8; x < 26; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    g.flexWandCycle = 9;                                   // mitey 桶[3] 第 9 项=694 style 42（坐地）
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(5464)]);
    const tid = TILE_INTERNAL_BY_SHEET(694);
    // 坐地子样式 Origin(0,1)：点击格=底格 → 顶格 (12,18),1×2 立地
    expect(st.get(12, 18)).toBe(tid);
    expect(st.get(12, 19)).toBe(tid);
    // 折行帧带：style42 → frameX=(42%39)*18=54,frameY=1*36+dy*18（case 694）
    expect(st.frameX[st.idx(12, 18)]).toBe(54);
    expect(st.frameY[st.idx(12, 18)]).toBe(36);
    expect(st.frameY[st.idx(12, 19)]).toBe(54);
    expect(drops).toEqual([]);
    expect(inv.slots[1]!.stack).toBe(8);
  });

  it('MiteyTitey 吊顶变体（cycle6→694 style3）→ anchorTop 顶锚落位', () => {
    const { g, w, inv, drops } = mkShell(5464, 1, 0, { x: 13, y: 12 });
    const st = w.store;
    inv.slots[1] = { id: iidOf(3), stack: 9 };
    for (let x = 8; x < 26; x++) st.setTileSilent(x, 10, STONE, 0, 0);   // 天花板
    g.flexWandCycle = 6;                                   // 桶[3] 第 6 项=694 style 3（吊顶）
    g.tryPlace(12, 11, ITEM_DEFS[iidOf(5464)]);
    const tid = TILE_INTERNAL_BY_SHEET(694);
    expect(st.get(12, 11)).toBe(tid);                      // Origin(0,0)：点击=顶格
    expect(st.get(12, 12)).toBe(tid);
    expect(st.frameY[st.idx(12, 11)]).toBe(0);             // 吊顶带（style<39 不折行）
    expect(drops).toEqual([]);
  });
});

describe('BJ602-④ 1×1 单件族专锚锁（书=仅桌面/珊瑚=顶格须空/宝石=实心底）', () => {
  it('书杖（149）：实心地面拒（旧 belowOk 放行=偏离）、桌面收', () => {
    const { g, w, inv } = mkShell(149, 2, 0, { x: 13, y: 14 });
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 14, STONE, 0, 0);   // 实心地面
    g.tryPlace(12, 13, ITEM_DEFS[iidOf(149)]);
    expect(st.get(12, 13)).toBe(0);                        // anchorBottom.Table 拒
    expect(inv.slots[0]!.stack).toBe(2);                   // 零消耗
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 14, TABLE, 0, 0);   // 换桌面
    g.tryPlace(12, 13, ITEM_DEFS[iidOf(149)]);
    expect(st.get(12, 13)).toBe(TILE_INTERNAL_BY_SHEET(50));
  });

  it('珊瑚杖（275）：实心底收、顶格被占拒（anchorTop EmptyTile 旧缺门）', () => {
    const { g, w } = mkShell(275, 2, 0, { x: 13, y: 14 });
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 14, STONE, 0, 0);
    g.tryPlace(12, 13, ITEM_DEFS[iidOf(275)]);
    expect(st.get(12, 13)).toBe(TILE_INTERNAL_BY_SHEET(81));
    // 顶格占用 → 拒（anchorTop EmptyTile）
    const { g: g2, w: w2 } = mkShell(275, 2, 0, { x: 13, y: 14 });
    const st2 = w2.store;
    for (let x = 8; x < 24; x++) st2.setTileSilent(x, 14, STONE, 0, 0);
    st2.setTileSilent(12, 12, STONE, 0, 0);                // 顶格实心
    g2.tryPlace(12, 13, ITEM_DEFS[iidOf(275)]);
    expect(st2.get(12, 13)).toBe(0);
  });

  it('宝石杖（178）：桌面拒（anchorBottom SolidTile 纯档,旧 belowOk 桌面放行=松于原版）', () => {
    const { g, w } = mkShell(178, 2, 0, { x: 13, y: 14 });
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 14, TABLE, 0, 0);
    g.tryPlace(12, 13, ITEM_DEFS[iidOf(178)]);
    expect(st.get(12, 13)).toBe(0);
  });

  it('Abigail 母花（5324 桶弹药 5114→700）：水水域拒（liq notAllowed 旧缺门）', () => {
    const { g, w, inv } = mkShell(5324, 1, 0, { x: 13, y: 14 });
    const st = w.store;
    inv.slots[1] = { id: iidOf(5114), stack: 9 };          // small 桶[5114]=[(700,0)] 唯一项
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 14, STONE, 0, 0);
    st.setLiquid(12, 13, 255, LIQUID_TYPE.WATER);
    g.tryPlace(12, 13, ITEM_DEFS[iidOf(5324)]);
    expect(st.get(12, 13)).toBe(0);                        // 700 档 water=notAllowed（validateAnchors 液体门）
    expect(inv.slots[1]!.stack).toBe(9);                   // 零消耗
  });
});

describe('BJ602-⑤ BJ600 除外清单翻转锁（241/698 移出除外注）', () => {
  it('源码锚：wand 回落门不含 !wand.consumesAmmo 与 opt.tileSheet !== 241', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'Game.ts'), 'utf8');
    expect(src).not.toMatch(/!wand\.consumesAmmo && wSpec/);
    expect(src).not.toMatch(/opt\.tileSheet !== 241/);
    expect(src).toContain('wandAmmoVid');
  });
});
