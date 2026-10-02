// ★BJ442（2026-10-03）：树支撑格保护门——CheckTileBreakability 1:1 挂 breakTile 头
// （KillTile 等价入口）。用户实报：铜镐点击树木正下方的格子导致整树被砍伐。
//
// 金标链（1457 反编译；唯一标杆 Terarria1457/）：
//   · KillTile 头门 = WorldGen.cs:64049-64054
//     `int num = CheckTileBreakability(i, j); if (num == 1) fail = true; if (num == 2) return;`
//     —— num==2 直接拒绝（格子不掉、不消失、无音尘）；num==1 → fail 语义。
//   · CheckTileBreakability（WorldGen.cs:62874-62940）+ CheckTileBreakability_HasReasonToReturnEarly
//     （:62962-62984）：挖 (x,y) 时上格 (x,y-1) 为树干竖直段（IsATreeTrunk TileID.cs:161）
//     且帧不在横向枝段（frameX==66&&frameY 0-44 / frameX==88&&frameY 66-110 / frameY>=198）
//     → 2；棕榈 323（frameX 66/220）→ 2；仙人掌 80（frameX/18∈{0,1,4,5}）→ 2；
//     门 10 锁门 → 1；Boulders+CheckBoulderChest（:49216）→ 1；传送器 235 三格扫 → 2。
//   · fail 语义（KillTile fail=true 分支 :64221-64252）：音+尘+IsShakeable 摇树+原格转化
//     （草族→基底）+SquareTileFrame → return（不掉落不清格——:64252 在掉落段前）。
//   · 后果链（曾无门病灶）：挖掉支撑格 → KillTile 尾 SquareTileFrame → TileFrame(树根格)
//     → TileFrameImportant case 5 → CheckTree（:55045 树根臂 num4!=2 → KillTile 整树倒）。
// 仓库修复：breakTile 头旧部分近似 tileAboveProtected（干族+棕榈+箱柜 7 型+仙人掌）退役，
//   改挂 entities/Mounts.ts checkTileBreakabilityAt 全式（原仅矿车链 Minecart.ts:897 消费）。
// 变异证据：摘门（brk===2 支改放行）→ ①③④ 全红；逐字节还原 → 复绿。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, T } from '../src/data/tiles';
import { Game } from '../src/core/Game';

const TREE = T.TREE;                            // 内部 id（sheet 5，IsATreeTrunk 头目）
const GRASS = T.GRASS;                          // sheet 2
const DIRT = T.DIRT;                            // sheet 0
const PALM = TILE_BY_KEY['v_323_palm_trees'];   // sheet 323
const CACTUS = TILE_BY_KEY['v_80_cactus'];      // sheet 80
const DOOR = TILE_BY_KEY['door_closed'];        // sheet 10
const CHEST = TILE_BY_KEY['chest'];             // sheet 21（IsAContainer）
const BOULDER = TILE_BY_KEY['v_138_boulder'];   // sheet 138（Sets.Boulders）

const W = 160, H = 200;
const GX = 80, GY = 40;                         // 地表行

interface GateShell {
  world: { store: World['store']; flags: { hardMode: boolean }; chests: unknown[] };
  recLog: () => void;
  achievements: { notifyTileDestroyed: () => void; handleMining: () => void };
  breakTileBody: (x: number, y: number, type: number, noItem: boolean) => void;
  killTileBreakSound: (type: number, x: number, y: number) => void;
  tryShakeTree: (x: number, y: number) => void;
  spawnParticles: () => void;
  _achCurrentlyMining: boolean;
}

/** Object.create(Game.prototype) 桩（同 sw-bj39-tree-mid-chop / ghost-tile-mine-gate 模式）：
 *  breakTileBody 用 spy 顶替——本测试只验 breakTile 头保护门（KillTile 头 CheckTileBreakability
 *  等价位）的分诊,门后破坏体（掉落/级联/清格）由 evolution-tree-cascade / bj39 系测试承保。
 *  killTileFailTransform 不桩（真方法,只读 world.store+pickTransformTargetTileId 纯表）。 */
function mkShell(w: World) {
  const calls = { body: 0, sound: 0, shake: 0 };
  const g = Object.create(Game.prototype) as unknown as GateShell;
  g.world = { store: w.store, flags: { hardMode: false }, chests: [] };
  g.recLog = () => {};
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.breakTileBody = () => { calls.body++; };
  g.killTileBreakSound = () => { calls.sound++; };
  g.tryShakeTree = () => { calls.shake++; };
  g.spawnParticles = () => {};
  g._achCurrentlyMining = false;
  const breakTile = (Game.prototype as unknown as {
    breakTile: (this: GateShell, x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean) => void;
  }).breakTile;
  return { g, calls, breakTile };
}

/** 地表 + 树（干列 + 基座帧可指定）：基座 = (gx, gy-1)，被挖支撑格 = (gx, gy) 草 */
function buildGround(w: World): void {
  for (let x = 0; x < W; x++) w.store.setTileSilent(x, GY, GRASS, 0, 0);
}
function setBase(w: World, type: number, fx: number, fy: number, x = GX): void {
  w.store.setTileSilent(x, GY - 1, type, fx, fy);
}

describe('BJ442 树支撑格保护门（CheckTileBreakability 1:1 → breakTile 头）', () => {
  it('① 树下支撑格（草上方=树干竖直段基座帧 0/132）挖掘被拒——格不消失、树不倒、无音', () => {
    const w = new World(W, H, 30, 'open');
    buildGround(w);
    // 本仓树基座帧域（TreePass growTrunk cs:30326-30371）：fx∈{0,66,88} × fy∈{132,154,176}
    setBase(w, TREE, 0, 132);
    const { g, calls, breakTile } = mkShell(w);
    breakTile.call(g, GX, GY, true);
    expect(w.store.get(GX, GY)).toBe(GRASS);            // 支撑格未破坏
    expect(w.store.hasTile(GX, GY)).toBe(true);
    expect(w.store.get(GX, GY - 1)).toBe(TREE);         // 树基座原样
    expect(calls.body).toBe(0);                         // 破坏体未入（原版 num==2 return 在一切之前）
    expect(calls.sound).toBe(0);                        // num==2 早退在 KillTile_PlaySounds 前（:64053→:64070）
  });

  it('①b 树干族全表帧域拒（宝石树 583/灰烬树 634/蘑菇树 72 同面——旧 tileAboveProtected 缺 583-589/596/616/634）', () => {
    for (const key of ['v_583_topaz_tree', 'v_72_mushroom_tree', 'v_634_ash_tree'] as const) {
      const t = TILE_BY_KEY[key];
      if (t === undefined) continue;                    // 键缺失=该型未注册（跳过,不造假红）
      const w = new World(W, H, 30, 'open');
      buildGround(w);
      setBase(w, t, 0, 132);
      const { g, calls, breakTile } = mkShell(w);
      breakTile.call(g, GX, GY, true);
      expect(w.store.get(GX, GY), key).toBe(GRASS);
      expect(calls.body, key).toBe(0);
    }
  });

  it('② 枝段/冠帧放行——frameX66/fy0-44、frameY>=198（挂干上不落地,原版 return 0 支）', () => {
    for (const [fx, fy] of [[66, 0], [66, 44], [88, 66], [88, 110], [22, 198], [0, 242]] as const) {
      const w = new World(W, H, 30, 'open');
      buildGround(w);
      setBase(w, TREE, fx, fy);
      const { g, calls, breakTile } = mkShell(w);
      breakTile.call(g, GX, GY, true);
      expect(calls.body, `tree(${fx},${fy}) 放行`).toBe(1);   // 门过 → 破坏体入（原版 return 0）
    }
  });

  it('②b 同型干身放行（砍树面不受门误伤——HasReasonToReturnEarly ignoreType==target.type 短路）', () => {
    const w = new World(W, H, 30, 'open');
    buildGround(w);
    w.store.setTileSilent(GX, GY, TREE, 0, 0);        // 被挖格=树干（下段）
    w.store.setTileSilent(GX, GY - 1, TREE, 0, 0);    // 上方=树干（同型）
    const { g, calls, breakTile } = mkShell(w);
    breakTile.call(g, GX, GY, true);
    expect(calls.body).toBe(1);
  });

  it('③a 棕榈 323 支：frameX 66/220 拒、直干帧放行（:62916-62922）', () => {
    const w = new World(W, H, 30, 'open');
    buildGround(w);
    setBase(w, PALM, 66, 0);
    let s = mkShell(w);
    s.breakTile.call(s.g, GX, GY, true);
    expect(w.store.get(GX, GY)).toBe(GRASS);
    expect(s.calls.body).toBe(0);
    const w2 = new World(W, H, 30, 'open');
    buildGround(w2);
    setBase(w2, PALM, 220, 0);
    s = mkShell(w2);
    s.breakTile.call(s.g, GX, GY, true);
    expect(s.calls.body).toBe(0);
    const w3 = new World(W, H, 30, 'open');
    buildGround(w3);
    setBase(w3, PALM, 0, 0);                          // 非枝基帧 → return 0 放行
    s = mkShell(w3);
    s.breakTile.call(s.g, GX, GY, true);
    expect(s.calls.body).toBe(1);
  });

  it('③b 仙人掌 80 支：frameX/18∈{0,1,4,5} 拒、中身列放行（:62924-62929）', () => {
    for (const fx of [0, 18, 72, 90]) {               // col {0,1,4,5} = 底/帽帧
      const w = new World(W, H, 30, 'open');
      buildGround(w);
      setBase(w, CACTUS, fx, 0);
      const { g, calls, breakTile } = mkShell(w);
      breakTile.call(g, GX, GY, true);
      expect(calls.body, `cactus fx=${fx} col=${fx / 18} 拒`).toBe(0);
      expect(w.store.get(GX, GY)).toBe(GRASS);
    }
    const w = new World(W, H, 30, 'open');
    buildGround(w);
    setBase(w, CACTUS, 36, 0);                        // col 2 = 中身列 → 放行
    const { g, calls, breakTile } = mkShell(w);
    breakTile.call(g, GX, GY, true);
    expect(calls.body).toBe(1);
  });

  it('③c 仙人掌同型放行（砍仙人掌链不受门误伤：tile2.type!=tile.type 门）', () => {
    const w = new World(W, H, 30, 'open');
    w.store.setTileSilent(GX, GY, CACTUS, 0, 0);      // 被挖=仙人掌底段
    w.store.setTileSilent(GX, GY - 1, CACTUS, 0, 0);  // 上方=仙人掌（同型）
    const { g, calls, breakTile } = mkShell(w);
    breakTile.call(g, GX, GY, true);
    expect(calls.body).toBe(1);
  });

  it('④ num==1 fail 语义——锁门（10：fy594-646∧fx<54）不破坏不掉格,走音+转化 fail 支', () => {
    const w = new World(W, H, 30, 'open');
    w.store.setTileSilent(GX, GY, DOOR, 0, 594);      // 锁门帧域（IsLockedDoor WorldGen.cs:69717）
    w.store.setTileSilent(GX, GY - 1, DIRT, 0, 0);    // 上方活性格（门臂在 tile2.active() 内 :62924）
    const { g, calls, breakTile } = mkShell(w);
    breakTile.call(g, GX, GY, true);
    expect(w.store.get(GX, GY)).toBe(DOOR);           // 不破坏（原版 fail 分支 :64252 return 不清格）
    expect(w.store.hasTile(GX, GY)).toBe(true);
    expect(calls.body).toBe(0);                       // 破坏体未入
    expect(calls.sound).toBe(1);                      // fail 音照播（KillTile_PlaySounds(fail:true) :64070）
    expect(calls.shake).toBe(0);                      // 门不在 IsShakeable 表（:64224 门恒假）
  });

  it('④b num==1 fail 语义——巨石压箱（Boulders+CheckBoulderChest :49216）底格不破坏', () => {
    const w = new World(W, H, 30, 'open');
    // 2×2 巨石 (GX..GX+1, GY..GY+1) + 箱格在锚行上方 (GX, GY-1)
    w.store.setTileSilent(GX, GY - 1, CHEST, 0, 0);
    w.store.setTileSilent(GX, GY, BOULDER, 0, 0);
    w.store.setTileSilent(GX + 1, GY, BOULDER, 18, 0);
    w.store.setTileSilent(GX, GY + 1, BOULDER, 0, 18);
    w.store.setTileSilent(GX + 1, GY + 1, BOULDER, 18, 18);
    const { g, calls, breakTile } = mkShell(w);
    // 底左格：tile2=巨石顶左（同型→HasReason 短路）→ 落 Boulders 臂 → CheckBoulderChest=1
    breakTile.call(g, GX, GY + 1, true);
    expect(w.store.get(GX, GY + 1)).toBe(BOULDER);
    expect(calls.body).toBe(0);
    expect(calls.sound).toBe(1);                      // num==1 → fail 音（区别于 num==2 静默）
    // 顶左格：tile2=箱（容器 → HasReason 真且非干/棕榈 → return 2 静默拒）
    const s2 = mkShell(w);
    s2.breakTile.call(s2.g, GX, GY, true);
    expect(w.store.get(GX, GY)).toBe(BOULDER);
    expect(s2.calls.body).toBe(0);
    expect(s2.calls.sound).toBe(0);                   // num==2 静默
  });

  it('⑤ 普通格不受影响——上方同型土/无物上方皆放行（挖掘面零回归锚）', () => {
    const w = new World(W, H, 30, 'open');
    w.store.setTileSilent(GX, GY, DIRT, 0, 0);
    w.store.setTileSilent(GX, GY - 1, DIRT, 0, 0);    // 同型上邻（HasReason 短路 + 非 80/10/Boulders）
    let s = mkShell(w);
    s.breakTile.call(s.g, GX, GY, true);
    expect(s.calls.body).toBe(1);
    const w2 = new World(W, H, 30, 'open');
    w2.store.setTileSilent(GX, GY, DIRT, 0, 0);       // 上方空气
    s = mkShell(w2);
    s.breakTile.call(s.g, GX, GY, true);
    expect(s.calls.body).toBe(1);
  });

  it('⑥ 端到端：铜镐级挖掘（tryMine 挖掘面）打树下支撑格——dmg=0 不积累、格不消失、树不倒', () => {
    const w = new World(W, H, 30, 'open');
    buildGround(w);
    setBase(w, TREE, 0, 132);
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.player = { x: GX * 16, y: (GY + 2) * 16, w: 20, h: 42, equipStats: {}, dead: false,
      usedAmbrosia: false, buffs: { has: () => false, wellFedTier: 0 } };
    g.world = { store: w.store, flags: { hardMode: false }, chests: [], groundLevel: GY, seedFlags: {} };
    g.netCanEditTile = () => true;
    g.inTileRange = () => true;
    g.pickSpeedMult = () => 1;
    g.mining = null;
    g.tickCount = 1000;
    g.lastMineHitTick = 0;
    g.lastMineItemTime = 0;
    g.hammerPoundRelease = false;
    g.sfx = { play: () => {}, playWavFile: () => {}, playSfxFile: () => {} };
    g.particles = [];
    g.spawnParticles = () => {};
    g.addDamageNumber = () => {};
    g.spawnDrop = () => null;
    g.intentionGuesser = { track: () => {}, allowTracking: () => {} };
    g.camera = { screenToWorld: (x: number, y: number): [number, number] => [x, y] };
    g.input = { mouseX: 0, mouseY: 0 };
    g.hitTiles = { addDamage: () => 0, getDamage: () => 0, clear: () => {}, prune: () => {} };
    g.canKillTile = (Game.prototype as unknown as {
      canKillTile: (this: Record<string, unknown>, x: number, y: number) => boolean;
    }).canKillTile;                                    // 真方法：CanKillTile 全式（挖掘面 damage 门）
    g.killTileBreakSound = () => {};
    g.killTileFailTransform = (Game.prototype as unknown as {
      killTileFailTransform: (this: Record<string, unknown>, x: number, y: number, sheet: number) => void;
    }).killTileFailTransform;                          // 真方法（原版 fail 支草族转化 :64226-64249）
    g.pruneHitTiles = () => {};
    let bodyCalls = 0;
    g.breakTileBody = () => { bodyCalls++; };
    (g as { tryMine: (...a: unknown[]) => void }).tryMine(GX, GY, 35, 'pick', 20, 20);
    // 铜镐（power 35）：CanKillTile false → dmg=0 → 不积累 → 不破坏；支撑格仍在（草→土的
    // fail 转化属原版 :64223 `tile.type==2→0` 支,本断言只锁「格不消失」）
    expect(w.store.get(GX, GY)).not.toBe(0);
    expect(w.store.hasTile(GX, GY)).toBe(true);
    expect(w.store.get(GX, GY - 1)).toBe(TREE);        // 树基座原样
    expect(bodyCalls).toBe(0);
  });
});
