// C14 放置锚域清偿（红蓝 R14 findings F1-F7 判别面,2026-10-11）
//
// F1（判谳级翻案）：共享臂两开——原版 TileObject.cs:392-406 亲读判语：
//   `if (!flag6 && ((anchorBottom.type & AnchorType.SolidWithTop) == AnchorType.SolidWithTop
//     || (anchorBottom.type & AnchorType.Table) == AnchorType.Table))`——平台支
//   （Platforms→!halfBrick∧PlatformProperTopFrame）与非平台支（tileSolid∧solidTop）
//   为共享体;:407-410 Table 臂（tileTable∧!Platform∧bt0）=追加支。生存面同构
//   （WorldGen.AnchorValid :52310-52326）。Table 单位记录平台承重=原版本相,
//   76 条记录解锁（Table∧!SolidWithTop 解析记录普查,下方 census 锁）。
// F2：备档评估链——CanPlace TileObject.cs:203-225 逐备档 GetTileData(type,style,num7)
//   满分制、:836-839 首中即中;:208-209 逐备档各自 Origin 换算;:209-212 Direction 过滤。
//   批 a=宝石 178（备档 63右/21顶/42左,TileObjectData.cs:4664-4683 亲读——R14 任务单
//   所写「33/66/99」系邻块 184 之数,提取器直读为准）;
//   批 b=标牌 55/箭牌 510（吊顶/左/右/墙四备档,:3823-3846/:3918-3942）、拉杆 132
//   （墙挂单备档 sb2,:3813-3822——R14 任务单「四备档」误,实为一档）、物品框 395
//   （四备档,:3949-3973）;
//   批 c=平台下挂（42/91/270/271/572/581/660/698/453 备档 AnchorTop=Platform,addAlternate(0)）;
//   批 d=591 平台顶放（备档 AnchorTop=PlatformNonHammered|AllFlatHeight :3074-3085,
//   AllFlatHeight 一致门=TileObject.cs:493-530 num28 跨格一致制）。
// F3：AnchorValidTiles/AnchorInvalidTiles（TileObjectData.cs:1910-1935 isValidTileAnchor
//   —invalid 先查、valid 缺省无门）——27/254/590/595/615/187 等 13 记录入库。
// F4（伪翻案反锁）：R14「ChangeDir(Sign(vx)) 全树零命中」系 grep 字面子串漏报——
//   原文 Projectile.cs:36477-36481 `int num973 = Math.Sign(player14.velocity.X);
//   if (num973 != 0) { player14.ChangeDir(num973); }`（AI_125 通道期分支,两步式
//   局部变量）——本仓 tickGrandDesignRoute 引导期朝向同步=原版 1:1,不摘。
// F6：边距 5 格硬门（CanPlace :215 `num8 < 5 || … > maxTilesX - 5` 任一备档越界
//   即整体 return false quirk）。
// F5/F7：纯文档（recon-tileobj 头注勘正 / bj624 十九件行号勘正）无判别面。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { anchorSpecOf, anchorChainOf, validateAnchors, validateAnchorChainAt } from '../src/world/TileAnchorValidator';
import anchorsJson from '../src/data/tile-anchors.json';
import { Inventory } from '../src/items/Inventory';

const STONE = TILE_BY_KEY['stone']!;
const GRASS = TILE_BY_KEY['grass']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const RAW_TILES = (anchorsJson as unknown as { tiles: Record<string, unknown> }).tiles;

function TILE_INTERNAL_BY_SHEET(sheet: number): number {
  return TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
}
function iidOf(vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} 应有物品`).toBeTruthy();
  return ITEM_BY_KEY_ORDER()[key!];
}
// 延迟解析避免与 items 模块循环依赖假设
import { ITEM_BY_KEY } from '../src/data/items';
function ITEM_BY_KEY_ORDER(): Record<string, number> {
  return ITEM_BY_KEY as unknown as Record<string, number>;
}

interface GShell {
  world: World;
  player: Record<string, unknown> & { useTime: number; facing: number };
  smartCursor: { lockedContinuity: null; showing: boolean; x: number; y: number };
  chunks: { markDirtyArea: (...a: unknown[]) => void };
  sfx: { play: () => void };
  cb: { onInventoryChanged: () => void };
  entities: Record<string, unknown>;
  spawnParticles: (...a: unknown[]) => void;
  spawnDrop: (...a: unknown[]) => unknown;
  recLog: (...a: unknown[]) => void;
  dumpChest: () => void;
  killTileDropBait: (...a: unknown[]) => void;
  trackTile: number;
  flexWandCycle: number;
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
}
function mkShell(heldVid: number, heldStack = 3,
  at: { x: number; y: number } = { x: 13, y: 20 }): { g: GShell; w: World; inv: Inventory } {
  const w = new World(64, 64, 7, 'c14-anchor-r14');
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
// F1 共享臂两开（判谳级翻案）：数据面 census + 抽检 + Game 级平台承重
// ============================================================================
describe('C14-F1 共享臂两开（TileObject.cs:392-410 亲读判语）', () => {
  it('census：Table∧!SolidWithTop 解析记录 = 76 条（平台承重解锁全集）', () => {
    const ids = Object.entries(anchorsJson.tiles as unknown as Record<string, { anchorBottom?: { t: string[] } } | null>)
      .filter(([, r]) => r?.anchorBottom?.t.includes('Table')
        && !r.anchorBottom.t.includes('SolidWithTop'))
      .map(([id]) => id);
    expect(ids.length, `解锁集=${ids.join(',')}`).toBe(76);
    // 抽检位面：书 50/烛 33/水烛 49/瓶 13/存钱罐 372?/石像 532/710/579 ∈ 集
    for (const s of ['13', '29', '33', '49', '50', '372', '532', '579', '646', '707', '710']) {
      expect(ids, `sheet ${s} 应在解锁集`).toContain(s);
    }
  });

  it('抽检：Table 单位记录平台承（50/33/49/707/579/532）,SolidTile 纯档仍拒（178）', () => {
    const st = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    for (const s of [50, 33, 49, 707, 579, 532]) {
      const rec = anchorSpecOf(s)!;
      expect(rec, `sheet ${s}`).not.toBeNull();
      // 平台行 y=20,占位底行 = 20-rec.h（多格石像 532 3×2 底行=锚行）
      expect(validateAnchors(st, 12, 20 - rec.h, rec, 0), `sheet ${s} 平台承（共享臂两开）`).toBe(true);
    }
    // 178 宝石基记录=底 SolidTile 纯档（无 SolidWithTop/Table）→ 平台仍拒
    expect(validateAnchors(st, 12, 19, anchorSpecOf(178)!, 0), '178 平台拒').toBe(false);
    // 半砖平台不承（共享臂平台支 !halfBrick,TileObject.cs:394-401）
    const rec50 = anchorSpecOf(50)!;
    st.half[st.idx(12, 20)] = 1;
    expect(validateAnchors(st, 12, 19, rec50, 0), '50 半砖平台拒').toBe(false);
    st.half[st.idx(12, 20)] = 0;
  });

  it('Game 级：烛 33 平台放置（vid 105）落格+扣耗;悬空仍拒（Table 位无臂命中）', () => {
    const { g, w, inv } = mkShell(105);
    const st = w.store;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(105)]);   // 悬空:无桌面无平台
    expect(st.get(12, 19)).toBe(0);
    expect(inv.slots[0]!.stack).toBe(3);
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(105)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(33));
    expect(inv.slots[0]!.stack).toBe(2);
  });
});

// ============================================================================
// F2 批 a：宝石 178 备档链（63右/21顶/42左,TileObjectData.cs:4664-4683 亲读）
// ============================================================================
describe('C14-F2a 宝石 178 备档评估链（uccp1x1 逐备档首中+备档帧带）', () => {
  it('数据面：alts=[63右,21顶,42左]+sty(wrap 7,FullHeight 18)', () => {
    const raw = RAW_TILES['178'] as unknown as {
      alts: Array<{ sb: number; anchorRight?: { t: string[] } | null; anchorTop?: { t: string[] } | null;
        anchorLeft?: { t: string[] } | null }>; sty: { swl: number; sm: number; cw: number; cp: number; hts: number[] };
    };
    expect(raw.alts.map((a) => a.sb)).toEqual([63, 21, 42]);
    expect(raw.alts[0].anchorRight?.t).toEqual(['SolidTile']);
    expect(raw.alts[1].anchorTop?.t).toEqual(['SolidTile']);
    expect(raw.alts[2].anchorLeft?.t).toEqual(['SolidTile']);
    expect(raw.sty).toEqual({ sh: true, swl: 7, sls: 1, sm: 1, cw: 16, cp: 2, hts: [16] });
  });

  it('链评估：吊顶/左墙/右墙逐备档首中（CanPlace TileObject.cs:203-225 同序）', () => {
    const st = new World(48, 48, 7, 't').store;
    // 吊顶：石天花板 y=19,宝石放 (12,20) → 链位 2（sb21 顶锚）中
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 19, STONE, 0, 0);
    const ceil = validateAnchorChainAt(st, 12, 20, 178, 0, 1);
    expect(ceil?.alt).toBe(2);
    expect(ceil?.sb).toBe(21);
    // 左墙：x=11 石柱 → 链位 3（sb42 左锚）中
    const st2 = new World(48, 48, 7, 't').store;
    st2.setTileSilent(11, 20, STONE, 0, 0);
    const left = validateAnchorChainAt(st2, 12, 20, 178, 0, 1);
    expect(left?.alt).toBe(3);
    expect(left?.sb).toBe(42);
    // 右墙：x=13 石柱 → 链位 1（sb63 右锚）中
    const st3 = new World(48, 48, 7, 't').store;
    st3.setTileSilent(13, 20, STONE, 0, 0);
    const right = validateAnchorChainAt(st3, 12, 20, 178, 0, 1);
    expect(right?.alt).toBe(1);
    expect(right?.sb).toBe(63);
    // 悬空全备档不中
    const st4 = new World(48, 48, 7, 't').store;
    expect(validateAnchorChainAt(st4, 12, 20, 178, 0, 1)).toBeNull();
  });

  it('Game 级：吊顶宝石落格 frameY=54/frameX=36（sb21+placeStyle2→wrap7 row3 col2）;地面 frameY=0', () => {
    // 帧 = TileObject.Place :60-108：num=placeStyle(2)*1+sb → wrap7（row=num/7,col=num%7）
    //   → 横排 frameX=FullWidth*col、frameY=FullHeight*row（FullHeight=(16+2)*1=18）。
    //   吊顶 sb21：num=23 → row3 col2 → (36,54)。物品 177 placeStyle=2（宝石样式档）。
    const { g, w } = mkShell(177);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 19, STONE, 0, 0);
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(177)]);
    expect(st.get(12, 20)).toBe(TILE_INTERNAL_BY_SHEET(178));
    expect(st.frameY[st.idx(12, 20)]).toBe(54);      // sb21 → row 3 → 18*3
    expect(st.frameX[st.idx(12, 20)]).toBe(36);      // placeStyle 2 → col 2 → 18*2
    // 地面：底锚基记录（alt=0）→ furnitureStyleBase 旧路 frameY=0
    const { g: g2, w: w2 } = mkShell(177);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 21, STONE, 0, 0);
    g2.tryPlace(12, 20, ITEM_DEFS[iidOf(177)]);
    expect(w2.store.get(12, 20)).toBe(TILE_INTERNAL_BY_SHEET(178));
    expect(w2.store.frameY[w2.store.idx(12, 20)]).toBe(0);
  });
});

// ============================================================================
// F2 批 b：标牌 55 四备档 / 物品框 395 墙挂 / 拉杆 132 墙挂
// ============================================================================
describe('C14-F2b 标牌族四备档（TileObjectData.cs:3823-3846）+物品框 395 墙挂', () => {
  it('标牌 55：吊顶/左/右/墙四备档链评估+帧带 36 步（sb1..4,Style2x2 FullWidth=36）', () => {
    const rec = anchorSpecOf(55)!;
    expect(rec).not.toBeNull();
    // 吊顶：天花板 y=18 覆 12-13,点击 (12,20) → alt0（sb1 顶锚 2 宽）
    const st = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 18, STONE, 0, 0);
    const ceil = validateAnchorChainAt(st, 12, 19, 55, 0, 1);
    expect(ceil?.alt).toBe(1);
    expect(ceil?.sb).toBe(1);
    // 墙挂（alt3 sb4 AnchorWall）：背墙 12-13×19-20
    const st4 = new World(48, 48, 7, 't').store;
    for (let x = 12; x <= 13; x++) for (let y = 19; y <= 20; y++) st4.wall[st4.idx(x, y)] = 1;
    const wall = validateAnchorChainAt(st4, 12, 19, 55, 0, 1);
    expect(wall?.alt).toBe(4);
    expect(wall?.sb).toBe(4);
    void rec;
  });

  it('标牌 55 Game 级：地面基记录 frameX=0 不回归;吊顶 frameX=36（备档帧带）', () => {
    const { g, w } = mkShell(171);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 21, STONE, 0, 0);
    g.tryPlace(12, 20, ITEM_DEFS[iidOf(171)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(55));
    expect(st.frameX[st.idx(12, 19)]).toBe(0);
    // 吊顶：天花板 y=18,点击 19（Origin(0,0) 备档 → 占位 19-20,顶锚 18）
    const { g: g2, w: w2 } = mkShell(171);
    for (let x = 8; x < 24; x++) w2.store.setTileSilent(x, 18, STONE, 0, 0);
    g2.tryPlace(12, 19, ITEM_DEFS[iidOf(171)]);
    expect(w2.store.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(55));
    expect(w2.store.frameX[w2.store.idx(12, 19)]).toBe(36);   // sb1 → FullWidth*1=36
  });

  it('物品框 395 墙挂（alt3 sb4 AnchorWall——原版主用法）+地面基记录不回归', () => {
    const { g, w } = mkShell(3270);
    const st = w.store;
    for (let x = 12; x <= 13; x++) for (let y = 19; y <= 20; y++) st.wall[st.idx(x, y)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(3270)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(395));
    expect(st.frameX[st.idx(12, 19)]).toBe(36 * 4);           // sb4 → FullWidth*4
  });

  it('拉杆 132 墙挂单备档（sb2,:3813-3822——R14 任务单「四备档」误,实一档）', () => {
    const raw = RAW_TILES['132'] as unknown as { alts: Array<{ sb: number; wall: boolean }> };
    expect(raw.alts.length).toBe(1);
    expect(raw.alts[0]).toMatchObject({ sb: 2, wall: true });
    const { g, w } = mkShell(513);
    const st = w.store;
    for (let x = 12; x <= 13; x++) for (let y = 19; y <= 20; y++) st.wall[st.idx(x, y)] = 1;
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(513)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(132));
  });
});

// ============================================================================
// F2 批 c/d：平台下挂（42 备档 AnchorTop=Platform）+ 591 平台顶
//   （PlatformNonHammered|AllFlatHeight 一致门）
// ============================================================================
describe('C14-F2c/d 平台锚备档（Platform / PlatformNonHammered|AllFlatHeight）', () => {
  it('灯笼 42 平台下挂（备档 AnchorTop=Platform sb0——基记录 SolidTile 拒平台）', () => {
    const rec = anchorSpecOf(42)!;
    expect(rec).not.toBeNull();
    const st = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 18, PLATFORM, 0, 0);
    // 基记录：顶锚 SolidTile|SolidSide|PlanterBox → 平台全臂不中（顶锚行=物件顶行-1）
    expect(validateAnchors(st, 12, 19, rec, 0), '基记录平台拒').toBe(false);
    // 链：备档 AnchorTop=Platform → 中（点击格=物件顶行=平台行+1,Origin(0,0) 直判）
    const hit = validateAnchorChainAt(st, 12, 19, 42, 0, 1);
    expect(hit?.alt).toBe(1);
    expect(hit?.sb).toBe(0);
  });

  it('灯笼 42 Game 级：平台下挂落格（帧带 sb0=基带,frameY=style*36 同基）', () => {
    const { g, w } = mkShell(136);
    const st = w.store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 18, PLATFORM, 0, 0);
    g.tryPlace(12, 19, ITEM_DEFS[iidOf(136)]);
    expect(st.get(12, 19)).toBe(TILE_INTERNAL_BY_SHEET(42));
    expect(st.get(12, 18)).toBe(PLATFORM);            // 平台本体不被吞
  });

  it('591 平台顶放（备档 PlatformNonHammered|AllFlatHeight :3074-3085）+AllFlatHeight 一致门', () => {
    const rec = anchorSpecOf(591)!;
    expect(rec).not.toBeNull();
    // 纯平平台行：两锚格 num30 同 8 → AllFlatHeight 过（点击=物件顶行=平台行+1）
    const st = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 18, PLATFORM, 0, 0);
    const hit = validateAnchorChainAt(st, 12, 19, 591, 0, 1);
    expect(hit?.alt).toBe(1);
    // 平台行半砖混排：num30 8/0 失一致（TileObject.cs:493-530 num28 制）→ 备档拒
    const st2 = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) st2.setTileSilent(x, 18, PLATFORM, 0, 0);
    st2.half[st2.idx(12, 18)] = 1;
    expect(validateAnchorChainAt(st2, 12, 19, 591, 0, 1)).toBeNull();
    void rec;
  });
});

// ============================================================================
// F3 AnchorValidTiles/InvalidTiles 门（TileObjectData.cs:1910-1935）
// ============================================================================
describe('C14-F3 成员表门（isValidTileAnchor）', () => {
  it('向日葵 27 {2,477,109,60,492,633}：草承/石泥拒', () => {
    const rec = anchorSpecOf(27)!;
    expect(rec.vTiles).toEqual([2, 477, 109, 60, 492, 633]);
    const stG = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stG.setTileSilent(x, 24, GRASS, 0, 0);
    expect(validateAnchors(stG, 12, 20, rec, 0), '草地承').toBe(true);
    const stS = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stS.setTileSilent(x, 24, STONE, 0, 0);
    expect(validateAnchors(stS, 12, 20, rec, 0), '石地拒').toBe(false);
  });

  it('南瓜 254 {2,477,109,492} 草承石拒;宝石苗 590 十五石表 石承草拒', () => {
    const stG = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stG.setTileSilent(x, 22, GRASS, 0, 0);
    expect(validateAnchors(stG, 12, 20, anchorSpecOf(254)!, 0), '254 草承').toBe(true);
    const stS = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stS.setTileSilent(x, 22, STONE, 0, 0);
    expect(validateAnchors(stS, 12, 20, anchorSpecOf(254)!, 0), '254 石拒').toBe(false);
    // 590 宝石苗（15 石表 TileObjectData.cs:4919-4923 多行数组——C14 并线修复首例）
    const raw590 = RAW_TILES['590'] as unknown as { vTiles?: number[] };
    expect(raw590.vTiles).toEqual([1, 25, 117, 203, 182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
    expect(validateAnchors(stS, 12, 20, anchorSpecOf(590)!, 0), '590 石承').toBe(true);
    expect(validateAnchors(stG, 12, 20, anchorSpecOf(590)!, 0), '590 草拒').toBe(false);
  });

  it('187 大石堆子样式表（style0 {59,60,226}）经 validateAnchors style 维生效', () => {
    const raw = RAW_TILES['187'] as unknown as { subTiles: Record<string, { vTiles?: number[] }> };
    expect(raw.subTiles['0']?.vTiles).toEqual([59, 60, 226]);
    const stM = new World(48, 48, 7, 't').store;
    const MUD = TILE_BY_KEY['mud']!;                       // sheet 59 ∈ {59,60,226}
    for (let x = 8; x < 26; x++) stM.setTileSilent(x, 22, MUD, 0, 0);
    expect(validateAnchors(stM, 12, 20, anchorSpecOf(187, 0)!, 0), '泥承（style0）').toBe(true);
    const stS = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 26; x++) stS.setTileSilent(x, 22, STONE, 0, 0);
    expect(validateAnchors(stS, 12, 20, anchorSpecOf(187, 0)!, 0), '石拒（style0）').toBe(false);
  });

  it('AnchorInvalidTiles 反表（46 条经 Style1x1 基档继承 :4245→:4251 addBaseTile）：巨石锚拒', () => {
    // 原版继承链：420 块 :4245 `AnchorInvalidTiles = anchorInvalidTiles`（:2113
    //   {127,138,664,665,484,711-716}）→ :4251 `addBaseTile(out Style1x1)` 快照携表
    //   → CopyFrom(Style1x1) 的 624 全族 + Style1x1Plant_Height22/34/Style1x1Drip
    //   派生基全承——巨石/滚石族不可为其 SolidTile 锚（isValidTileAnchor :1917-1925
    //   invalid 先查）。
    const raw624 = RAW_TILES['624'] as unknown as { ivTiles?: number[] };
    expect(raw624.ivTiles).toEqual([127, 138, 664, 665, 484, 711, 712, 713, 714, 715, 716]);
    const BOULDER = TILE_BY_KEY['v_138_boulder']!;
    const rec624 = anchorSpecOf(624)!;
    const stB = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stB.setTileSilent(x, 20, BOULDER, 0, 0);
    expect(validateAnchors(stB, 12, 19, rec624, 0), '624 巨石锚拒（invalid 表）').toBe(false);
    const stK = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stK.setTileSilent(x, 20, STONE, 0, 0);
    expect(validateAnchors(stK, 12, 19, rec624, 0), '624 石锚承').toBe(true);
    // 470 展示人台（:3069 直赋）同表
    const rec470 = anchorSpecOf(470)!;
    const stB2 = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) stB2.setTileSilent(x, 22, BOULDER, 0, 0);
    expect(validateAnchors(stB2, 12, 19, rec470, 0), '470 巨石锚拒').toBe(false);
  });
});

// ============================================================================
// F4 伪翻案反锁（AI_125 :36477-36481 ChangeDir(Sign(vx)) 在树——R14 grep 漏报）
// ============================================================================
describe('C14-F4 引导期朝向同步反锁（两步式局部变量=grep 字面漏报判例）', () => {
  it('tickGrandDesignRoute 引导期 facing=Sign(vx) 机制在位（原版 Projectile.cs:36477-36481 1:1）', () => {
    // 定谳亲读（1457 Projectile.cs AI_125 通道期分支）：
    //   `int num973 = Math.Sign(player14.velocity.X); if (num973 != 0) {
    //      player14.ChangeDir(num973); }`（:36477-36481）——R14「全树零命中」
    //   系字面子串 grep 漏报（decompiler 局部变量两步式）。摘除=偏离原版。
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'Game.ts'), 'utf8');
    expect(src).toMatch(/const vs = Math\.sign\(p\.vx\);/);
    expect(src).toMatch(/AI_125 :36477-36481/);            // 亲读行号锚注释在位
    // 释放刻消费=执行刻 direction（Wiring.cs:437 master.direction==1 同相）
    expect(src).toMatch(/this\.player\.facing === 1/);
  });
});

// ============================================================================
// F6 边距 5 格硬门（CanPlace TileObject.cs:215）
// ============================================================================
describe('C14-F6 边距 5 格（validateAnchors 对齐 num8<5 硬门）', () => {
  it('ax/ay < 5 拒、= 5 收（世界 40×40,烛 33 Table 锚）', () => {
    const rec = anchorSpecOf(33)!;
    const st = new World(48, 48, 7, 't').store;
    for (let x = 4; x < 30; x++) {
      st.setTileSilent(x, 12, TILE_BY_KEY['table']!, 0, 0);
      st.setTileSilent(x, 6, TILE_BY_KEY['table']!, 0, 0);
    }
    expect(validateAnchors(st, 5, 11, rec, 0), 'ax=5 收').toBe(true);
    expect(validateAnchors(st, 4, 11, rec, 0), 'ax=4 拒（5 格硬门）').toBe(false);
    expect(validateAnchors(st, 12, 5, rec, 0), 'ay=5 收').toBe(true);
    expect(validateAnchors(st, 12, 4, rec, 0), 'ay=4 拒').toBe(false);
  });
});

// ============================================================================
// 链结构哨兵：anchorChainOf 基备档同序 + Direction 过滤（CanPlace :209-212）
// ============================================================================
describe('C14-F2 链结构哨兵', () => {
  it('55 链序=[基,吊顶,左,右,墙]（GetTileData :5127-5162 alternate 0=基,N=Alternates[N-1]）', () => {
    const chain = anchorChainOf(55, 0);
    expect(chain.length).toBe(5);
    expect(chain[0].sb).toBe(0);
    expect(chain.map((e) => e.sb)).toEqual([0, 1, 2, 3, 4]);
    expect(chain[4].rec.wall).toBe(true);
  });

  it('Direction 过滤：579 基档 PlaceLeft 朝右被跳过（备档 PlaceRight 同锚=结果等价）', () => {
    const rec579 = anchorSpecOf(579)!;
    expect(rec579.dir).toBe('PlaceLeft');
    // 朝右（dir=1）：PlaceLeft 基档跳过 → 备档（PlaceRight,CopyFrom 同锚）接住
    const st = new World(48, 48, 7, 't').store;
    for (let x = 8; x < 24; x++) st.setTileSilent(x, 20, STONE, 0, 0);
    const hitR = validateAnchorChainAt(st, 12, 19, 579, 0, 1);
    expect(hitR?.alt).toBe(1);
    // 朝左（dir=-1）：基档直收
    const hitL = validateAnchorChainAt(st, 12, 19, 579, 0, -1);
    expect(hitL?.alt).toBe(0);
  });
});
