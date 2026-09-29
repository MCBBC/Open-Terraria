// ★债刀-4 清偿守卫（2026-09-17）双刀：
//  ① TrapShot vid 穿线（Dart.ts 构造器 projId=trapWetProjId(kind,form)）——此前无
//    projId 槽,中央 CutTiles 收口（Entity.ts `vanillaId ?? projId ?? 0`）恒传 0 →
//    Game.cutTile vid=0 视同非陷阱 → book（5309/5323）佩戴时 natureGuard 误罩陷阱弹。
//    原版 Projectile.trap=true = SetDefaults 型录旗（1457 Projectile.cs 20 站 27 id,
//    全仓无其它写点;1458 逐站同表——fire 时刻不置位）→ 弹型身份即 trap 语义:
//    trap 族 kind（98/184/185/186/187/99/654/980/1049）落 TRAP_PROJ_VIDS 表内=免保护,
//    非陷阱 kind（162/166/281/601/167-170/415-418/419-422/733）恒表外（受保护——
//    与原版 trap=false 同相）。三因可见面 = book 佩戴 + 陷阱弹 + 可割格。
//  ② 1052 Axearang 加砍面（CutTilesAt :15384-86;1458 :15386-88 同文）——出程
//    `type==1052 && ai[0]==0` 时 flag 再并 TileID.Sets.IsATreeTrunk
//    （TileID.cs:161 {5,72,583-589,596,616,634}）∪ {323 棕榈（PalmTree,非仙人掌）}。
//    树干/棕榈皆不在 Main.tileCut → 此面是弹域唯一可割它们的通道。type 位=vid、
//    ai[0] 位=载体旗（Boomerang.cutExtraTreeCactus = projId==1052 && ai0==0）,
//    Game.cutTile 收口处对 vid==1052 重验（防杂散调用面越权）。加砍候选同吃
//    natureGuard 面（树干/棕榈不在 13 例外表——book 佩戴不割,ignore 先于 flag 同序）。
// 变异证红（开发期实测）：
//  M1 Dart.ts 摘 `this.projId = trapWetProjId(...)` → ①穿线/三因组红；
//  M2 Entity.ts 摘 cutExtraTreeCactus 转发（恒 false）→ ②出程组红；
//  M3 Game.cutTile 摘 axearangExtraCut 臂（或摘 vid==1052 重验）→ ②加砍组红；
//  M4 cutTile 摘 TRAP_PROJ_VIDS 豁免 → ①book×陷阱组红。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY } from '../src/data/items';   // ★方案 A:装备 id 一律运行时反查（旧硬编码 6015=重排前内部号,已失效）
import { Game } from '../src/core/Game';
import { TrapShot, type TrapShotKind } from '../src/entities/Dart';
import { Boomerang } from '../src/entities/WeaponProj';
import { EntityManager } from '../src/entities/Entity';
import type { GameHooks } from '../src/entities/types';

// ============================================================
// ① TrapShot vid 穿线
// ============================================================
/** kind(+form) → 原版弹 id（trapWetProjId 全映射;fireworks 三件套按 form 展开） */
const EXPECTED_PROJ_ID: Array<[TrapShotKind, number, number?]> = [
  ['dart', 98], ['superdart', 184], ['flame', 187], ['venomdart', 980],
  ['spear', 186], ['spiky', 185], ['boulder', 99], ['geyser', 654],
  ['cannonball', 162], ['bunny', 281], ['snowball', 166], ['portalbolt', 601],
  ['hail', 1049],
  ['fireworkRocket', 167, 0], ['fireworkRocket', 170, 3],
  ['fireworksBoxRocket', 415, 0], ['fireworksBoxRocket', 418, 3],
  ['fireworkFountain', 419, 0], ['fireworkFountain', 422, 3],
  ['toiletPop', 733],
];
/** 原版 SetDefaults trap=true 型录在 TrapShot kind 域的投影（全 9 型） */
const TRAP_KIND_VIDS = new Set([98, 184, 185, 186, 187, 99, 654, 980, 1049]);

const TRUNK = TILE_BY_KEY['v_5_trees']!;        // sheet 5∈IsATreeTrunk,不在 TILE_CUT
const PALM = TILE_BY_KEY['v_323_palm_trees']!;  // sheet 323=棕榈（:15386 直比项）
const WEED = TILE_BY_KEY['tallgrass']!;         // sheet 3∈TILE_CUT（13 例外表外）

/** Game 原型台（bj108 cutHarness 同构）：cutTile 真法 + breakTile/smashPot 桩。
 *  acc5309 → 配饰槽 3 挂 vi_5309_DontHurtNatureBook（★方案 A 恒等域 iid=5309;运行时反查防漂移）。 */
const BOOK_IID = ITEM_BY_KEY['vi_5309_DontHurtNatureBook']
  ?? ITEM_BY_KEY['vi_5309_DontHurtNature'] ?? -1;
function cutGame(tiles: Map<number, number>, acc5309: boolean) {
  const game = Object.create(Game.prototype) as unknown as {
    world: { store: unknown };
    player: unknown;
    breakTile: ReturnType<typeof vi.fn>;
    smashPot: ReturnType<typeof vi.fn>;
    cutTile: (x: number, y: number, vid?: number, extraCut?: boolean) => void;
    _staffHarvestBonus: boolean;
  };
  game.world = {
    store: {
      inBounds: () => true,
      hasTile: () => true,
      get: (x: number, y: number) => tiles.get(x * 100000 + y) ?? 0,
      // ★红蓝-C 门配套（2026-09-17）：Game.cutTile 候选格现求值 canCutTile——
      //  谓词读 idx/wall/frameX（wall 350 / 254 frameX 面）。本测候选格恒
      //  零墙/零帧，全零表即可（idx 只需落表内，坐标个位数无混叠）。
      idx: (x: number, y: number) => (x & 255) * 256 + (y & 255),
      wall: new Uint16Array(256 * 256),
      frameX: new Uint16Array(256 * 256),
    },
  };
  game.player = {
    inv: {
      armor: acc5309 ? { 3: { id: BOOK_IID } } : {},   // ★方案 A:运行时反查,
      accSlotMax: 8,
      isItemSlotUnlockedAndUsable: () => true,   // ★刀I补桩(9545b31c 单点门):旧界 8 全开同义,BOOK 3 槽可扫
      heldItem: () => null,
    },
  };
  game.breakTile = vi.fn();
  game.smashPot = vi.fn();
  game._staffHarvestBonus = false;
  return game;
}

/** 中央收口台：真 World + TrapShot/Boomerang 可跑的 hooks 桩 + cutTile 观察口
 *  （vid/extraCut 转发链 e2e）。tiles 表键 = x*100000+y。 */
function emGame(tiles: Map<number, number>, acc5309: boolean) {
  const w = new World(60, 60, 11, 'bj114-d');
  const breakTile = vi.fn();
  const game = Object.create(Game.prototype) as unknown as GameHooks & {
    breakTile: ReturnType<typeof vi.fn>;
    smashPot: ReturnType<typeof vi.fn>;
  };
  const stub = game as unknown as Record<string, unknown>;
  stub.world = w;
  stub.entities = { enemies: [], critters: [], npcs: [], projectiles: [], drops: [], props: [] };
  stub.sfx = { play: () => true, playFiles: () => true, playLoop: () => null, playWav: () => true };
  stub.enemies = () => [];
  stub.critters = () => [];
  stub.npcs = () => [];
  stub.playSfx = () => {};
  stub.playSfxFiles = () => {};
  stub.playSfxWav = () => {};
  stub.spawnParticles = () => {};
  stub.spawnBurst = () => {};
  stub.spawnDust = () => null;
  stub.spawnDrop = () => null;
  stub.addDamageNumber = () => {};
  stub.hitTilesFx = () => {};
  stub.notifyInventoryChanged = () => {};
  stub.damagePlayer = () => 0;
  stub.onEnemyKilled = () => {};
  stub.spawnEnemy = () => {};
  // 逐格覆写 store.get（真 store 之上叠表;hasTile 恒真=全格视为 active）
  (w.store as unknown as { get: (x: number, y: number) => number }).get =
    (x: number, y: number) => tiles.get(x * 100000 + y) ?? 0;
  (w.store as unknown as { hasTile: () => boolean }).hasTile = () => true;
  game.player = {
    x: -500, y: -500, w: 20, h: 42, cx: -490, cy: -479, dead: true, iframes: 0,
    inv: {
      armor: acc5309 ? { 3: { id: BOOK_IID } } : {},   // ★方案 A:运行时反查,
      accSlotMax: 8,
      isItemSlotUnlockedAndUsable: () => true,   // ★刀I补桩(9545b31c 单点门):旧界 8 全开同义
      heldItem: () => null,
    },
    buffs: new Set(),                       // hitEnemies 快照读（hitEnemies :305-313）
    equipStats: {},
    critChance: () => 0,
  } as unknown as GameHooks['player'];
  game.breakTile = breakTile;
  game.smashPot = vi.fn();
  stub._staffHarvestBonus = false;
  return { w, game, breakTile };
}
type PlayerLike = { x: number; y: number; w: number; h: number; dead: boolean };

describe('债刀-4 ① TrapShot vid 穿线（Dart.ts projId=trapWetProjId）', () => {
  it('构造器填 projId：kind(+form)→原版 id 全映射（fireworks 三件套按 form 展开）', () => {
    for (const [kind, vid, form] of EXPECTED_PROJ_ID) {
      const t = new TrapShot(0, 0, 0, 0, 70, kind, form ?? 0);
      expect(t.projId, `${kind}(form=${form ?? 0})`).toBe(vid);
    }
  });

  it('trap 族 kind（9 型）vid 全落 SetDefaults trap=true 型录;非陷阱 kind 恒表外', () => {
    for (const [kind, vid, form] of EXPECTED_PROJ_ID) {
      const t = new TrapShot(0, 0, 0, 0, 70, kind, form ?? 0);
      if (TRAP_KIND_VIDS.has(t.projId)) {
        expect(TRAP_KIND_VIDS.has(vid), `${kind} vid=${vid} 应在 trap 型录`).toBe(true);
      } else {
        expect(TRAP_KIND_VIDS.has(vid), `${kind} vid=${vid} 应在表外`).toBe(false);
      }
    }
  });

  it('中央收口穿线：EntityManager.update → cutTile 收到真实 vid（dart=98 / snowball=166）', () => {
    const { game } = emGame(new Map(), false);
    const em = new EntityManager();
    const cutCalls: Array<[number, number, number | undefined]> = [];
    (game as { cutTile: (x: number, y: number, vid?: number) => void }).cutTile =
      (x: number, y: number, vid?: number) => { cutCalls.push([x, y, vid]); };
    em.add(new TrapShot(5 * TILE, 5 * TILE, 0, 0, 70, 'dart'), 'projectiles');
    em.add(new TrapShot(10 * TILE, 5 * TILE, 0, 0, 70, 'snowball'), 'projectiles');
    em.update(1 / 60, game);
    // 弹盒(8×4 @80,80)恰覆盖 tile(5,5);雪球(14×14 @160,80)覆盖 tile(10,5)
    expect(cutCalls).toContainEqual([5, 5, 98]);
    expect(cutCalls).toContainEqual([10, 5, 166]);
  });

  it('三因场景（book+陷阱弹+可割格）：book 佩戴下陷阱 dart 照割（vid∈TRAP_PROJ_VIDS 免保护）', () => {
    const { game, breakTile } = emGame(new Map([[5 * 100000 + 5, WEED]]), true);
    const em = new EntityManager();
    em.add(new TrapShot(5 * TILE, 5 * TILE, 0, 0, 70, 'dart'), 'projectiles');
    em.update(1 / 60, game);
    expect(breakTile).toHaveBeenCalled();     // 98∈TRAP_PROJ_VIDS → natureGuard 免保护
  });

  it('三因对照（book+非陷阱弹+可割格）：snowball（166 表外）被 natureGuard 罩住', () => {
    const { game, breakTile } = emGame(new Map([[5 * 100000 + 5, WEED]]), true);
    const em = new EntityManager();
    em.add(new TrapShot(5 * TILE, 5 * TILE, 0, 0, 70, 'snowball'), 'projectiles');
    em.update(1 / 60, game);
    expect(breakTile).not.toHaveBeenCalled(); // 166∉TRAP_PROJ_VIDS → 原版 trap=false 同相
  });

  it('无书基线：snowball 照割（非陷阱弹不受保护,只 book 面）', () => {
    const { game, breakTile } = emGame(new Map([[5 * 100000 + 5, WEED]]), false);
    const em = new EntityManager();
    em.add(new TrapShot(5 * TILE, 5 * TILE, 0, 0, 70, 'snowball'), 'projectiles');
    em.update(1 / 60, game);
    expect(breakTile).toHaveBeenCalled();
  });
});

describe('债刀-4 ② 1052 Axearang 加砍面（CutTilesAt :15384-86）', () => {
  it('cutTile 收口：出程旗（vid=1052,extraCut=true）割树干/棕榈;杂散 vid 重验拒绝', () => {
    // 树干（IsATreeTrunk 5）
    const g = cutGame(new Map([[5 * 100000 + 5, TRUNK]]), false);
    g.cutTile(5, 5, 1052, true);
    expect(g.breakTile).toHaveBeenCalledTimes(1);
    // 棕榈（323 直比项）
    const g2 = cutGame(new Map([[5 * 100000 + 5, PALM]]), false);
    g2.cutTile(5, 5, 1052, true);
    expect(g2.breakTile).toHaveBeenCalledTimes(1);
    // ★vid 重验：extraCut 旗但 vid≠1052 → 拒（type 位在收口处,与原版 type==1052 同位）
    const g3 = cutGame(new Map([[5 * 100000 + 5, TRUNK]]), false);
    g3.cutTile(5, 5, 6, true);
    expect(g3.breakTile).not.toHaveBeenCalled();
    // 返回段（extraCut=false=ai[0]≠0 面）→ 不割
    const g4 = cutGame(new Map([[5 * 100000 + 5, TRUNK]]), false);
    g4.cutTile(5, 5, 1052);
    expect(g4.breakTile).not.toHaveBeenCalled();
    // 非树干/棕榈格（普通石）→ 不割
    const g5 = cutGame(new Map([[5 * 100000 + 5, TILE_BY_KEY['stone_block']!]]), false);
    g5.cutTile(5, 5, 1052, true);
    expect(g5.breakTile).not.toHaveBeenCalled();
  });

  it('book 佩戴：树干不在 13 例外表 → 加砍面同吃 natureGuard（ignore 先于 flag 同序）', () => {
    const g = cutGame(new Map([[5 * 100000 + 5, TRUNK]]), true);
    g.cutTile(5, 5, 1052, true);
    expect(g.breakTile).not.toHaveBeenCalled();
  });

  it('载体旗：Boomerang.cutExtraTreeCactus = projId==1052 && ai0==0（出程才真）', () => {
    const bom = new Boomerang(0, 0, 0, 0, 20, 5, 1052, 1);
    expect(bom.projId).toBe(1052);
    expect(bom.cutExtraTreeCactus).toBe(true);   // 出程 ai0=0
    bom.ai0 = 1;                                  // 返回段
    expect(bom.cutExtraTreeCactus).toBe(false);
    const wood = new Boomerang(0, 0, 0, 0, 20, 5, 6, 1);   // 木回旋镖
    expect(wood.cutExtraTreeCactus).toBe(false);
  });

  it('中央收口 e2e：出程 1052 扫过树干 → 破坏;出程 6 木回旋镖 → 不破坏', () => {
    // 1052 出程（vx=0 原地悬停出程态）→ 弹盒(22×22 @80,80)覆盖 tile(5,5)
    const a = emGame(new Map([[5 * 100000 + 5, TRUNK]]), false);
    const emA = new EntityManager();
    emA.add(new Boomerang(5 * TILE, 5 * TILE, 0, 0, 20, 5, 1052, 1), 'projectiles');
    emA.update(1 / 60, a.game);
    expect(a.breakTile).toHaveBeenCalled();
    // 木回旋镖（vid 6,getter 恒 false）→ 加砍面不达
    const b = emGame(new Map([[5 * 100000 + 5, TRUNK]]), false);
    const emB = new EntityManager();
    emB.add(new Boomerang(5 * TILE, 5 * TILE, 0, 0, 20, 5, 6, 1), 'projectiles');
    emB.update(1 / 60, b.game);
    expect(b.breakTile).not.toHaveBeenCalled();
  });
});
