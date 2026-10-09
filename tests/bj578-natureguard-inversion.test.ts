// ★BJ578（2026-10-09）natureGuard 语义倒置定谳+落刀——挥割面/mowCutTiles 把
// IgnoreDontHurtNature 13 例外集当保护表 = 语义倒置（BJ577 范围外登记债清偿）。
//
// 定谳（原版 1457 亲读,编译反编译=唯一标杆）：
//   · TileID.cs:86 `IgnoreDontHurtNature = Factory.CreateBoolSet(true, 654, 444, 485,
//     231, 484, 32, 352, 655, 69, 51, 481, 482, 483)`；SetFactory.cs:94-106
//     `CreateBoolSet(defaultState, types)` = 全域填 defaultState + 逐项置
//     !defaultState → 该表=「全真唯 13 例外」（13 例外=false,其余全部=true）。
//   · 消费位 Player.cs:45032（ItemCheck_CutTiles——近战挥割 :44018 与 MowTheLawn
//     :20493 共用）：`… || shouldIgnore[type] || !CanCutTile(…) → continue`
//     ——真=忽略不割、假=可割。→ dontHurtNature（配饰 5309 环保指南/5323 和平
//     共处指南,Player.cs:12927）佩戴时保护面=候选 ∖ 13 例外表,13 例外表（陷阱/
//     TNT 桶/幼虫/刺藤/蛛网/裂砖）反而照割。
//   · 弹域 CutTilesAt :15380 `tileCutIgnorance[type] → continue` 同向；trap 弹
//     （fromTrap=true）→ TileCutIgnore.None 全割（:45010 !fromTrap 门）。
//   · 本仓 cutTile 单点（Game.ts :43199 `… && !CUT_IGNORE_NATURE.has(t)` + natureGuard
//     → return）读法正确（BJ108 落刀）；倒置面=挥割（updateSwingHits 内,旧
//     `shouldIgnore = natureGuard ? CUT_IGNORE_NATURE : …`）与 mowCutTiles（旧
//     `natureGuard && CUT_IGNORE_NATURE.has(t)`）——两处把「13 例外集」当保护表：
//     13 项反受保护、其余花草/药草/陶盆照割 = 与原版完全相反。
//   · 修正：两倒置面改 ignoreAt 谓词 `natureGuard ? !CUT_IGNORE_NATURE.has(t)
//     : staff && CUT_IGNORE_REGROWTH.has(t)`（全真唯 13 例外;nature 支后置覆盖
//     staff 支,:45010-45013 次序;nature 保护全集 ⊇ Regrowth 表——交集=∅——ternary
//     ≡ 原式）;陶盆（78 ∉ 13,tileCut[78]=false Main.cs 41 项表——vanilla melee/mow
//     循环瓦罐本非候选）在 repo 独立受理面补同向 ignore 门,与 cutTile 单源对齐。
//
// 判别测试（修正前必红面已用【旧式=】注释钉出——倒置方向双向判别）：
//   ① 13 例外集可割钉值（蛛网 51/丛林刺藤 69/腐化刺藤 32——book 佩戴三面皆割）
//   ② 非例外集保护（herb 84/长草 3——book 佩戴三面皆不割）
//   ③ 倒置面修正前后行为差（①②同测互为倒置判别;旧式下①红②红）
//   ④ cutTile 单源对齐（三面同格同书同相 + trap 弹 vid=108 fromTrap 豁免 + 覆盖序）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { ITEM_DEFS } from '../src/data/items';

afterEach(() => { vi.restoreAllMocks(); });

// ---- vid → 内部 item id（ITEM_DEFS 键 vi_<vid>_ 前缀解析,bj577 heldItemIdOf 同构） ----
let cachedVidToId: Map<number, number> | null = null;
function iidOf(vid: number): number {
  if (!cachedVidToId) {
    cachedVidToId = new Map();
    ITEM_DEFS.forEach((d, i) => {
      const m = /^vi_(\d+)_/.exec(d.key);
      if (m && !cachedVidToId!.has(+m[1])) cachedVidToId!.set(+m[1], i);
    });
  }
  const id = cachedVidToId.get(vid);
  if (id === undefined) throw new Error(`vid ${vid} 未注册`);
  return id;
}

// ---- 13 例外集钉值样张（TileID.cs:86 表成员,全部可割面=tileCut ∩ 13）----
const COBWEB = TILE_INTERNAL_BY_SHEET.get(51)!;        // 蛛网（tileCut[51],掉落零干扰）
const JTHORN = TILE_INTERNAL_BY_SHEET.get(69)!;        // 丛林刺藤
const CTHORN = TILE_INTERNAL_BY_SHEET.get(32)!;        // 腐化刺藤
const HERB_B = TILE_INTERNAL_BY_SHEET.get(84)!;        // 开花草（非例外∈Regrowth,保护面）
const GRASS3 = TILE_INTERNAL_BY_SHEET.get(3)!;         // 长草（非例外,保护面）
const DIRT = TILE_INTERNAL_BY_SHEET.get(0)!;           // 泥土基座（CanCutTile 下格门白名单外）
const POT = TILE_BY_KEY['pot'];                        // 陶盆 78（tileCut 表外,repo 独立受理面）
const BOOK = 5309;                                     // Guide to Environmental Preservation
const BOOK_COMBO = 5323;                               // 和平共处指南（5309+4767 合成面同旗）
const STAFF = 213;                                     // Staff of Regrowth（Regrowth 忽略表支）
const EXPLOSIVES_PROJ = 108;                           // Explosives 弹（TRAP_PROJ_VIDS,fromTrap 豁免）

if (COBWEB === undefined || HERB_B === undefined || GRASS3 === undefined || DIRT === undefined || POT === undefined) {
  throw new Error('BJ578 样张 tile 未注册（51/84/3/0/78）');
}

// ---- 近战挥割台（melee-cancutile-gate swingGame 同构+accVid 扩展）----
// 判定盒 (789,1428,32,22) → 扫描域=列 49..51 × 行 89..90;band 46..56×87..94 缺省铺长草
function swingGame(heldVid: number, accVid?: number) {
  const world = new World(120, 120, 30, 'bj578-swing');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iidOf(heldVid), 1);
  if (accVid !== undefined) player.inv.armor[3] = { id: iidOf(accVid), stack: 1 };
  g.swing = { t: 20, dur: 25, dmg: 50, kb: 3, item: iidOf(heldVid), useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.entities = { critters: [], npcs: [], enemies: [] };
  g.player = player;
  g.world = world;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.spawnDust = vi.fn();
  g.spawnFriendlyProj = vi.fn();
  g.net = null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  g.dropContext = () => undefined;
  g.onEnemyKilled = () => {};
  g.achievements = { notifyProgressionEvent: vi.fn() };
  const cut: Array<[number, number]> = [];
  g.breakTile = (x: number, y: number) => { cut.push([x, y]); };
  g.smashPot = vi.fn();
  g.netCatchCritter = vi.fn();
  g.mowTheLawnTick = vi.fn();
  const st = world.store;
  for (let x = 46; x <= 56; x++) {
    for (let y = 87; y <= 94; y++) {
      if (st.get(x, y) === 0) st.setTileSilent(x, y, GRASS3);   // 缺省铺长草(保护面对照)
    }
  }
  return { g, player, world, st, cut, smashPot: g.smashPot as ReturnType<typeof vi.fn> };
}

const runSwing = (g: Record<string, unknown>) =>
  (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
const wasCut = (cut: Array<[number, number]>, x: number, y: number) =>
  cut.some(([cx, cy]) => cx === x && cy === y);

// ---- 割草机台（bj577 shell 同构+真 Inventory;矩形覆盖列 6..11 × 行 19..20）----
type MowCutTiles = (rx: number, ry: number, rw: number, rh: number, heldVid?: number) => void;
type CutTileFn = (x: number, y: number, vid?: number, extraCutTreeCactus?: boolean) => void;
function mowerShell(w: World, heldVid = 0, accVid?: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    mowCutTiles: MowCutTiles;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [] };
  g.swingTileCutSet = new Set<number>();
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.spawnDust = () => null;
  g.spawnDrop = () => null;
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  const inv = new Inventory();
  if (heldVid) inv.add(iidOf(heldVid), 1);
  if (accVid !== undefined) inv.armor[3] = { id: iidOf(accVid), stack: 1 };
  g.player = {
    cx: 10 * TILE + 8, cy: 19 * TILE + 8, x: 10 * TILE + 2, y: 19 * TILE - 6, w: 12, h: 28, facing: 1, useTime: 0,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, equipStats: {}, inv,
  };
  const smashPot = vi.fn();
  g.smashPot = smashPot;
  return { g: g as unknown as { mowCutTiles: MowCutTiles }, st: w.store, smashPot };
}
const runMow = (g: { mowCutTiles: MowCutTiles }, heldVid = 0) =>
  g.mowCutTiles(6 * TILE, 19 * TILE, 80, 20, heldVid);

// ---- 弹域 cutTile 台（bj577 shell 同构+真 Inventory;真 cutTile 真 breakTile）----
function cutShell(w: World, drops: Array<[string, number]>, accVid?: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    cutTile: CutTileFn;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [] };
  g.swingTileCutSet = new Set<number>();
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.spawnDust = () => null;
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  const inv = new Inventory();
  if (accVid !== undefined) inv.armor[3] = { id: iidOf(accVid), stack: 1 };
  g.player = {
    cx: 10 * TILE + 8, cy: 19 * TILE + 8, x: 10 * TILE + 2, y: 19 * TILE - 6, w: 12, h: 28, facing: 1, useTime: 0,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, equipStats: {}, inv,
  };
  const smashPot = vi.fn();
  g.smashPot = smashPot;
  (g as Record<string, unknown>).cutTile = Game.prototype.cutTile;
  return { g: g as unknown as { cutTile: CutTileFn }, st: w.store, smashPot };
}

describe('BJ578-① 近战挥割面（updateSwingHits ignoreAt 全真唯 13 例外）', () => {
  it('佩戴 5309：扫描域 13 例外集（蛛网+双刺藤）照割、长草全保护——cut 恰=2 例外格', () => {
    const { g, st, cut } = swingGame(3013, BOOK);
    st.setTileSilent(50, 90, COBWEB);
    st.setTileSilent(51, 90, JTHORN);
    st.setTileSilent(49, 90, CTHORN);
    runSwing(g);
    // 旧式（shouldIgnore=CUT_IGNORE_NATURE 把 13 集当保护表）：三例外格受保护不割、
    // 长草照割 → 本断言组全红 = 倒置双向判别
    expect(wasCut(cut, 50, 90)).toBe(true);    // 蛛网 51 ∈ 13 → 可割（原版相钉值）
    expect(wasCut(cut, 51, 90)).toBe(true);    // 丛林刺藤 69 ∈ 13 → 可割
    expect(wasCut(cut, 49, 90)).toBe(true);    // 腐化刺藤 32 ∈ 13 → 可割
    expect(wasCut(cut, 49, 89)).toBe(false);   // 长草 3 ∉ 13 → 保护（全真唯 13 例外）
    expect(cut.length).toBe(3);                // 域内恰 3 例外格被割,其余长草零割
  });

  it('佩戴 5323（和平共处指南合成件同旗 Player.cs:12926-12928）同相', () => {
    const { g, st, cut } = swingGame(3013, BOOK_COMBO);
    st.setTileSilent(50, 90, COBWEB);
    runSwing(g);
    expect(wasCut(cut, 50, 90)).toBe(true);
    expect(wasCut(cut, 49, 89)).toBe(false);
  });

  it('无书对照：长草与例外格皆割（None 忽略表=零保护,新旧同相回归面）', () => {
    const { g, st, cut } = swingGame(3013);
    st.setTileSilent(50, 90, COBWEB);
    runSwing(g);
    expect(wasCut(cut, 50, 90)).toBe(true);
    expect(wasCut(cut, 49, 89)).toBe(true);    // 长草照割
    expect(cut.length).toBe(6);                // 扫描域 3×2 全割
  });

  it('佩戴书+陶盆：瓦罐支同吃 ignore 门（78 ∉ 13 → 保护,与 cutTile :43199 同相）', () => {
    const { g, st, smashPot } = swingGame(3013, BOOK);
    st.setTileSilent(50, 89, POT);
    runSwing(g);
    expect(smashPot).not.toHaveBeenCalled();
  });

  it('无书+陶盆：瓦罐支照常受理（对照）', () => {
    const { g, st, smashPot } = swingGame(3013);
    st.setTileSilent(50, 89, POT);
    runSwing(g);
    expect(smashPot).toHaveBeenCalledTimes(1);
  });

  it('佩戴书持杖（5309+213）：nature 支后置覆盖 staff 支（:45010-45013）——例外格仍割', () => {
    const { g, st, cut } = swingGame(STAFF, BOOK);
    st.setTileSilent(50, 90, COBWEB);
    runSwing(g);
    expect(wasCut(cut, 50, 90)).toBe(true);    // 覆盖序判别:非 Regrowth 支致保护
    expect(wasCut(cut, 49, 89)).toBe(false);   // 长草受 nature 全集保护
  });
});

describe('BJ578-② 割草机面（mowCutTiles ignoreAt 全真唯 13 例外）', () => {
  it('佩戴 5309：蛛网照割、开花草保护——旧式（natureGuard && 13集.has → 跳过）全红', () => {
    const w = new World(30, 40, 15, 'bj578-mow');
    const st = w.store;
    st.setTileSilent(10, 20, COBWEB);
    st.setTileSilent(10, 21, DIRT);
    st.setTileSilent(9, 20, HERB_B);
    st.setTileSilent(9, 21, DIRT);
    const { g } = mowerShell(w, 0, BOOK);
    runMow(g);
    expect(st.get(10, 20)).toBe(0);            // 蛛网 51 ∈ 13 → 可割（原版相钉值）
    expect(st.get(9, 20)).toBe(HERB_B);        // 开花草 ∉ 13 → 保护
  });

  it('无书对照：开花草与蛛网皆割', () => {
    const w = new World(30, 40, 15, 'bj578-mow2');
    const st = w.store;
    st.setTileSilent(10, 20, COBWEB);
    st.setTileSilent(10, 21, DIRT);
    st.setTileSilent(9, 20, HERB_B);
    st.setTileSilent(9, 21, DIRT);
    const { g } = mowerShell(w, 0);
    runMow(g);
    expect(st.get(10, 20)).toBe(0);
    expect(st.get(9, 20)).toBe(0);
  });

  it('佩戴书+陶盆：瓦罐支受保护（旧式 78 ∉ 13 → 照碎=倒置面）；无书对照照碎', () => {
    const wb = new World(30, 40, 15, 'bj578-mow3');
    wb.store.setTileSilent(10, 20, POT);
    wb.store.setTileSilent(10, 21, DIRT);
    const gb = mowerShell(wb, 0, BOOK);
    runMow(gb.g);
    expect(gb.smashPot).not.toHaveBeenCalled();
    expect(wb.store.get(10, 20)).toBe(POT);

    const wn = new World(30, 40, 15, 'bj578-mow4');
    wn.store.setTileSilent(10, 20, POT);
    wn.store.setTileSilent(10, 21, DIRT);
    const gn = mowerShell(wn, 0);
    runMow(gn.g);
    expect(gn.smashPot).toHaveBeenCalledTimes(1);
  });

  it('佩戴书持杖：覆盖序——蛛网仍割（非 Regrowth 臂）、开花草受 nature 全集保护', () => {
    const w = new World(30, 40, 15, 'bj578-mow5');
    const st = w.store;
    st.setTileSilent(10, 20, COBWEB);
    st.setTileSilent(10, 21, DIRT);
    st.setTileSilent(9, 20, HERB_B);
    st.setTileSilent(9, 21, DIRT);
    const { g } = mowerShell(w, STAFF, BOOK);
    runMow(g, STAFF);
    expect(st.get(10, 20)).toBe(0);
    expect(st.get(9, 20)).toBe(HERB_B);
  });

  it('仅持杖无书：Regrowth 忽略表支原相不变（bj577-S3 兼容面——84 保护、51 照割）', () => {
    const w = new World(30, 40, 15, 'bj578-mow6');
    const st = w.store;
    st.setTileSilent(10, 20, COBWEB);
    st.setTileSilent(10, 21, DIRT);
    st.setTileSilent(9, 20, HERB_B);
    st.setTileSilent(9, 21, DIRT);
    const { g } = mowerShell(w, STAFF);
    runMow(g, STAFF);
    expect(st.get(9, 20)).toBe(HERB_B);        // 84 ∈ Regrowth → 保护（bj577 锁面）
    expect(st.get(10, 20)).toBe(0);            // 51 ∉ Regrowth 且无书 → 照割
  });
});

describe('BJ578-③ 弹域 cutTile（BJ108 正相锁定——单源参照面不回退）', () => {
  it('佩戴 5309：长草保护、蛛网照割（:43199 !CUT_IGNORE_NATURE.has(t) 正相）', () => {
    const w = new World(30, 40, 15, 'bj578-cut1');
    const st = w.store;
    st.setTileSilent(10, 20, GRASS3);
    st.setTileSilent(10, 21, DIRT);
    const { g } = cutShell(w, [], BOOK);
    g.cutTile(10, 20);
    expect(st.get(10, 20)).toBe(GRASS3);       // ∉ 13 → 保护（若本面被倒置=此处红）

    const w2 = new World(30, 40, 15, 'bj578-cut2');
    w2.store.setTileSilent(10, 20, COBWEB);
    w2.store.setTileSilent(10, 21, DIRT);
    const { g: g2 } = cutShell(w2, [], BOOK);
    g2.cutTile(10, 20);
    expect(w2.store.get(10, 20)).toBe(0);      // ∈ 13 → 可割
  });

  it('佩戴 5309 + trap 弹（108 Explosives ∈ TRAP_PROJ_VIDS）：fromTrap → None 全割', () => {
    const w = new World(30, 40, 15, 'bj578-cut3');
    const st = w.store;
    st.setTileSilent(10, 20, GRASS3);
    st.setTileSilent(10, 21, DIRT);
    const { g } = cutShell(w, [], BOOK);
    g.cutTile(10, 20, EXPLOSIVES_PROJ);
    expect(st.get(10, 20)).toBe(0);            // 陷阱弹免 nature 保护（Player.cs:45010 !fromTrap）
  });

  it('无书对照：长草照割', () => {
    const w = new World(30, 40, 15, 'bj578-cut4');
    const st = w.store;
    st.setTileSilent(10, 20, GRASS3);
    st.setTileSilent(10, 21, DIRT);
    const { g } = cutShell(w, []);
    g.cutTile(10, 20);
    expect(st.get(10, 20)).toBe(0);
  });
});

describe('BJ578-④ 三面单源对齐（同格同书跨面同相——挥割/割草机/弹域 cutTile）', () => {
  const cases = [
    { name: '蛛网 51（∈13 例外）', sheet: 51, expectedCut: true },
    { name: '开花草 84（∉13 例外）', sheet: 84, expectedCut: false },
  ] as const;

  for (const c of cases) {
    it(`${c.name}：书佩戴三面行为一致（割=${c.expectedCut}）`, () => {
      const tile = TILE_INTERNAL_BY_SHEET.get(c.sheet)!;
      // 近战挥割
      const s = swingGame(3013, BOOK);
      s.st.setTileSilent(50, 90, tile);
      runSwing(s.g);
      const meleeCut = wasCut(s.cut, 50, 90);
      // 割草机
      const wm = new World(30, 40, 15, `bj578-parity-m${c.sheet}`);
      wm.store.setTileSilent(10, 20, tile);
      wm.store.setTileSilent(10, 21, DIRT);
      const gm = mowerShell(wm, 0, BOOK);
      runMow(gm.g);
      const mowCut = wm.store.get(10, 20) === 0;
      // 弹域 cutTile
      const wc = new World(30, 40, 15, `bj578-parity-c${c.sheet}`);
      wc.store.setTileSilent(10, 20, tile);
      wc.store.setTileSilent(10, 21, DIRT);
      const { g: gc } = cutShell(wc, [], BOOK);
      gc.cutTile(10, 20);
      const projCut = wc.store.get(10, 20) === 0;
      // 三面同相（=GetTileCutIgnorance 单一语义）
      expect(meleeCut).toBe(c.expectedCut);
      expect(mowCut).toBe(c.expectedCut);
      expect(projCut).toBe(c.expectedCut);
    });
  }
});
