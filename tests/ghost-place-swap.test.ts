// 幽灵格放置漏判回归（2026-09-03 用户实报"放木材掉铁矿"）。
// 场景复现：世界存档（炫耀的护腿湿地 v5）解码实证幽灵格 256.7 万（active=0 且
// type≠0，占 51%——幽灵保域批的正常产物）；块交换链入口原版读 active()
// （Player.cs:40058 `!tile.active() || PlaceThing_IsReplaceableBlock(tile) || …`），
// 旧码裸 st.get≠0 让幽灵残型直通"先破坏旧块（完整掉落链）"→ 放木材挖出铁矿
// （behavior-log-炫耀的护腿湿地 t=5357 from "ore_iron" → drop vi_11_IronOre）。
// vanilla 语义：active()=false 的格 = 空位，直接走正常放置（setTile 静默覆写残型，
// 无破坏无掉落）；对照组 = 活性矿块仍走块交换（镐门+积累+完整掉落链）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS, T, VANILLA_TILE_ID } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { PetFollower } from '../src/entities/PetFollower';
import { TrapShot, Dart } from '../src/entities/Dart';
import { wetCollisionProbe } from '../src/entities/MinionProj';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const WOOD_V = 9;    // vi_9_Wood（木材）
const PICK_V = 3509; // 铜镐（开局镐,块交换镐门用）

let vidToId: Record<number, number> | null = null;
function iidOf(vid: number): number {
  if (!vidToId) {
    vidToId = {};
    ITEM_DEFS.forEach((d, i) => {
      const m = /^vi_(\d+)_/.exec(d.key);
      if (m) vidToId![+m[1]] = i;
    });
  }
  return vidToId[vid] ?? -1;
}
function defOf(vid: number) {
  return ITEM_DEFS[iidOf(vid)];
}

interface Shell {
  world: World;
  player: { inv: { slots: unknown[]; heldItem(): unknown } };
  tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
}

function shell(w: World, drops: Array<[string, number]>, heldVid: number, withPick: boolean): Shell {
  const g = Object.create(Game.prototype) as unknown as Shell & Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); };
  g.hitTiles = { addDamage: () => 100, clear: () => {} };   // 块交换积累条单拍达标
  g.swingTileCutSet = new Set<number>();                    // 挥击砍切去重表
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots: withPick ? [{ id: iidOf(PICK_V), stack: 1 }] : new Array(50).fill(null),
      heldItem: () => (heldVid ? { id: iidOf(heldVid), stack: 5 } : null),
      removeAt: () => {},
    },
  };
  return g;
}

/** 石地地面行 y=21（wood 铺放邻接支撑），格坐标以地面上一行 y=20 为作业面 */
function mkWorld(): World {
  const w = new World(40, 40, 7, 'ghost-place');
  for (let x = 2; x < 38; x++) w.store.setTileSilent(x, 21, TILE_BY_KEY['stone']);
  return w;
}

const ORE_T = TILE_BY_KEY['ore_iron'];
const woodTileKey = defOf(WOOD_V).tile ?? '';
const WOOD_T = TILE_BY_KEY[woodTileKey];

describe('幽灵格放置漏判（块交换入口 active() 门）', () => {
  it('幽灵铁矿（flags=0,type=铁矿）上放木材：无铁矿掉落、当拍直接铺放、残型覆写', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(8, 20)] = ORE_T;                    // 残型=铁矿
    st.flags[st.idx(8, 20)] = 0;                       // active=0 → 幽灵格
    const drops: Array<[string, number]> = [];
    shell(w, drops, WOOD_V, false).tryPlace(8, 20, defOf(WOOD_V));
    expect(drops).toEqual([]);                         // 不掉铁矿（核心回归）
    expect(st.flags[st.idx(8, 20)]).toBe(1);           // 木材已铺（激活）
    expect(st.type[st.idx(8, 20)]).toBe(WOOD_T);       // 残型被覆写
  });

  it('幽灵草上放木材同款：空位语义（无破坏无掉落）', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(12, 20)] = TILE_BY_KEY['grass'];    // 残型=草
    st.flags[st.idx(12, 20)] = 0;
    const drops: Array<[string, number]> = [];
    shell(w, drops, WOOD_V, false).tryPlace(12, 20, defOf(WOOD_V));
    expect(drops).toEqual([]);
    expect(st.type[st.idx(12, 20)]).toBe(WOOD_T);
  });

  it('对照：活性矿块仍走块交换（镐门+完整掉落链；两步流=本拍破坏、下拍放置）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, ORE_T);                    // active 铁矿
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, WOOD_V, true);
    g.tryPlace(9, 20, defOf(WOOD_V));                  // 第一拍：先破坏旧块（行为档 [8] 同款）
    expect(drops.some(([k]) => k.includes('IronOre'))).toBe(true);   // 旧块完整掉落链
    expect(st.type[st.idx(9, 20)]).toBe(0);            // 旧块已清（placed 延到下拍）
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));                  // 第二拍：正常放置（[30] 同款）
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
  });
});

// ============================================================
// 砍切族同款洞清扫（CutTiles 族首门 active()——ItemCheck_CutTiles :45027 /
// Collision.CutTiles :15454）：割草机/挥击/弹体砍切不割幽灵残型
// ============================================================
describe('砍切族幽灵格门（active() 首门）', () => {
  it('割草机 mowCutTiles 扫过幽灵香草（83,tileCut 成员）：不割不掉落、残型原样', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(8, 20)] = TILE_BY_KEY['v_83_herbs_mature'];
    st.flags[st.idx(8, 20)] = 0;
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, 0, false);
    (g as unknown as { mowCutTiles(rx: number, ry: number, rw: number, rh: number): void })
      .mowCutTiles(6 * TILE, 19 * TILE, 80, 20);   // 列 6..10
    expect(drops).toEqual([]);
    expect(st.type[st.idx(8, 20)]).toBe(TILE_BY_KEY['v_83_herbs_mature']);   // 残型原样
    expect(st.flags[st.idx(8, 20)]).toBe(0);
  });

  it('弹体砍切 game.cutTile 打在幽灵草上：零操作', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(9, 20)] = TILE_BY_KEY['grass'];
    st.flags[st.idx(9, 20)] = 0;
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, 0, false);
    (g as unknown as { cutTile(x: number, y: number): void }).cutTile(9, 20);
    expect(drops).toEqual([]);
    expect(st.flags[st.idx(9, 20)]).toBe(0);                     // 未被清
  });

  it('对照：活性香草照常被割（割草机掉落链不变）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, TILE_BY_KEY['v_83_herbs_mature']);  // active 香草
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, 0, false);
    (g as unknown as { mowCutTiles(rx: number, ry: number, rw: number, rh: number): void })
      .mowCutTiles(9 * TILE, 19 * TILE, 32, 20);   // 列 9..10
    expect(st.flags[st.idx(10, 20)]).toBe(0);                    // 被割清
  });
});

// ============================================================
// 右键交互族幽灵格门（interactAt active() 首门——Player.cs:32270-32281
// TileInteractionsCheck `if (Main.tile[myX,myY].active())` 才进 MouseOver/Use，
// active() 为假即整体不进交互链）：幽灵水晶心 usePlacedLifeCrystal 面零操作、
// 幽灵拉杆不触发（hitSwitch 不达）、幽灵门不开；活性对照照常进分支
// ============================================================
describe('右键交互族幽灵格门（interactAt active() 首门）', () => {
  type Calls = Record<'life' | 'lever' | 'door', Array<[number, number]>>;
  function ishell(w: World, calls: Calls) {
    const g = Object.create(Game.prototype) as unknown as
      Record<string, unknown> & { interactAt(tx: number, ty: number): void };
    g.world = w;
    g.input = { rightDown: true };
    g.netCanEditTile = () => true;      // 单人权威面（联机保护门禁非本测面）
    g.inTileRange = () => true;         // 距离门非本测面（:31495 另档）
    g.usePlacedLifeCrystal = (tx: number, ty: number) => { calls.life.push([tx, ty]); };
    g.toggleSwitch = (tx: number, ty: number) => { calls.lever.push([tx, ty]); };
    g.toggleDoor = (tx: number, ty: number) => { calls.door.push([tx, ty]); };
    return g;
  }
  const rec = (): Calls => ({ life: [], lever: [], door: [] });

  it('幽灵水晶心右键：usePlacedLifeCrystal 面零操作（不加上限不消耗）', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(8, 20)] = TILE_BY_KEY['crystal_heart'];
    st.flags[st.idx(8, 20)] = 0;                    // 幽灵残型
    const calls = rec();
    ishell(w, calls).interactAt(8, 20);
    expect(calls.life).toEqual([]);
    expect(st.flags[st.idx(8, 20)]).toBe(0);        // 残型原样
  });

  it('幽灵拉杆右键：不复活不触发（toggleSwitch/hitSwitch 不达）', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(9, 20)] = TILE_BY_KEY['v_132_lever'];
    st.flags[st.idx(9, 20)] = 0;
    const calls = rec();
    ishell(w, calls).interactAt(9, 20);
    expect(calls.lever).toEqual([]);
    expect(st.flags[st.idx(9, 20)]).toBe(0);        // 帧未翻转（残型原样）
  });

  it('幽灵门右键：不开（toggleDoor 不达）', () => {
    const w = mkWorld();
    const st = w.store;
    st.type[st.idx(10, 20)] = T.DOOR_CLOSED;
    st.flags[st.idx(10, 20)] = 0;
    const calls = rec();
    ishell(w, calls).interactAt(10, 20);
    expect(calls.door).toEqual([]);
  });

  it('对照：活性水晶心/拉杆/门右键照常进分支', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(8, 20, TILE_BY_KEY['crystal_heart']);
    st.setTileSilent(9, 20, TILE_BY_KEY['v_132_lever']);
    st.setTileSilent(10, 20, T.DOOR_CLOSED);
    const calls = rec();
    const g = ishell(w, calls);
    g.interactAt(8, 20);
    g.interactAt(9, 20);
    g.interactAt(10, 20);
    expect(calls.life).toEqual([[8, 20]]);
    expect(calls.lever).toEqual([[9, 20]]);
    expect(calls.door).toEqual([[10, 20]]);
  });
});

// ============================================================
// 实体锚点族幽灵格门（红蓝对抗 F4/F6/F7/F8，2026-09-04）：实体 AI 以
// "锚点格/扫描格是否仍存在"为生死与掉落判定，原版一律读 active() 位本体
// （Tile.cs:591-594 sTileHeader 0x20），幽灵残型格（flags=0,type≠0——保域批
// 正常产物）= 不在场。旧码用 type≠0 代读 active 位 → 幽灵锚不死/幽灵树掉木材/
// 幽灵坡误判湿。对照组一律证活性面行为不变。
// ============================================================

/** ground-ai-parity 同款 harness（原型直调私有 AI 方法） */
function enemyHarness(w: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: Array<Record<string, unknown>> = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Record<string, unknown>);
    },
  };
  const player = new Player(playerAt.x * TILE, playerAt.y * TILE, new Inventory());
  const hooks = {
    world: w, player, enemies: () => enemies, critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    scene: { zoneGraveyard: false }, entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player, em };
}

const driveAI = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>)[fn];

describe('实体锚点族幽灵格门（active()/nactive() 位本体——F4/F6/F7/F8）', () => {
  it('F4 plantAI：幽灵残型锚（flags=0,type≠0）→ 判死（NPC.cs:22729 !tile.active()）', () => {
    const w = mkWorld();
    const st = w.store;
    const h = enemyHarness(w, { x: 20, y: 14 });
    const e = Enemy.fromVanilla(101, 20 * TILE, 19 * TILE)!;   // 爬行者（aiStyle 13 族）
    e.ai0 = 10; e.ai1 = 20;                          // 锚 = 作业面一格
    st.type[st.idx(10, 20)] = 1;                     // 残型=泥土（type 位在）
    st.flags[st.idx(10, 20)] = 0;                    // active=0 → 幽灵锚
    driveAI(e, 'plantAI').call(e, h.hooks, h.player);
    expect(e.dead).toBe(true);                       // 锚失活即死（原版 life=-1+HitEffect）
  });

  it('F4 对照：活性锚照常存活运转（不误杀）', () => {
    const w = mkWorld();
    const st = w.store;
    const h = enemyHarness(w, { x: 20, y: 14 });
    const e = Enemy.fromVanilla(101, 20 * TILE, 19 * TILE)!;
    e.ai0 = 10; e.ai1 = 20;
    e.ai3 = 0;                                       // 计数清零（驱动一次 = +1）
    st.setTileSilent(10, 20, TILE_BY_KEY['stone']);  // active 锚
    driveAI(e, 'plantAI').call(e, h.hooks, h.player);
    expect(e.dead).toBe(false);
    expect(e.ai3).toBe(1);                           // :22755 ai[2]++ 状态机照走
  });

  it('F6 烟花喷泉：幽灵残型 338 锚 → 下一 tick Kill（Projectile.cs:30983 !active()）', () => {
    const w = mkWorld();
    const st = w.store;
    const bursts: Array<{ count: number }> = [];
    const game = {
      world: w,
      player: { x: -500, y: -500, w: 20, h: 20, dead: false, cx: -490 },
      enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {},
      spawnBurst: (_x: number, _y: number, _c: string, count: number) => { bursts.push({ count }); },
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
      notifyInventoryChanged: () => {},
    } as unknown as GameHooks;
    st.setTileSilent(30, 20, TILE_BY_KEY['v_338_fireworkfountain']);
    const p = new TrapShot(30 * 16 + 8, 20 * 16 + 2, 0, 0, 0, 'fireworkFountain', 0, [30, 20]);
    for (let t = 0; t < 3; t++) p.fixedUpdate(1, game);
    expect(p.dead).toBe(false);
    expect(bursts).toHaveLength(3);                  // 每 tick 2 粒（:29386）
    // 锚变幽灵残型（type 保留 338、active 位清零）——旧 type≠0 判定恒存活
    st.flags[st.idx(30, 20)] = 0;
    p.fixedUpdate(1, game);
    expect(p.dead).toBe(true);                       // 核心回归
    expect(bursts).toHaveLength(3);                  // Kill 帧不再喷
  });

  it('F7 宠物斧：幽灵残型树不被锁定、不掉木材（Projectile.cs:71285 tile.active()）', () => {
    const w = mkWorld();
    const st = w.store;
    const drops: Array<[string, number]> = [];
    const game = {
      world: w, spawnParticles: () => {}, playSfxFiles: () => {},
      spawnDrop: (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); },
    } as unknown as GameHooks;
    st.type[st.idx(10, 20)] = TILE_BY_KEY['tree'];   // 残型=树干（sheet 5 ∈ IsShakeable）
    st.flags[st.idx(10, 20)] = 0;                    // active=0 → 幽灵树
    const player = {
      x: 8 * 16 + 2, y: 19 * 16, w: 20, h: 42,
      cx: 8 * 16 + 12, cy: 19 * 16 + 21, facing: 1, dead: false,
    };
    const pet = new PetFollower(0, 0, 1050, () => player);
    pet.x = 9 * 16 + 8 - pet.w / 2;                  // 中心钉在格 (9,20)（扫描起点）
    pet.y = 20 * 16 + 8 - pet.h / 2;
    const cast = pet as unknown as Record<string, unknown>;
    cast.frame = 8;                                  // 斧劈帧行（:71301 砍击拍门）
    cast.frameAcc = 0;
    cast.chopAccum = 9999;                           // 蓄量拉满——门若误开必掉
    (pet as unknown as { axeFairyAI(p: unknown, g: GameHooks): void }).axeFairyAI(player, game);
    expect(cast._axeTargetX).toBeUndefined();        // 扫描未锁定（核心回归）
    expect(drops).toEqual([]);                       // 幽灵树不掉木材
    expect(st.flags[st.idx(10, 20)]).toBe(0);        // 残型原样（不毁不换）
  });

  it('F7 对照：活性树照常锁定+掉木材（dropFairyWood 链不回归）', () => {
    const w = mkWorld();
    const st = w.store;
    const drops: Array<[string, number]> = [];
    const game = {
      world: w, spawnParticles: () => {}, playSfxFiles: () => {},
      spawnDrop: (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); },
    } as unknown as GameHooks;
    st.setTileSilent(10, 20, TILE_BY_KEY['tree']);   // active 树（基座=石行 21 → 缺省 vid 9 木材）
    const player = {
      x: 8 * 16 + 2, y: 19 * 16, w: 20, h: 42,
      cx: 8 * 16 + 12, cy: 19 * 16 + 21, facing: 1, dead: false,
    };
    const pet = new PetFollower(0, 0, 1050, () => player);
    pet.x = 9 * 16 + 8 - pet.w / 2;                  // 中心钉在格 (9,20)（扫描起点）
    pet.y = 20 * 16 + 8 - pet.h / 2;
    const cast = pet as unknown as Record<string, unknown>;
    // 掉落带 1/5 掷门（:71322 Math.random()%5）——重复斧劈拍直至命中（P(全空)≈0.8^n）
    for (let i = 0; i < 300 && drops.length === 0; i++) {
      cast.frame = 8;
      cast.frameAcc = 0;
      (pet as unknown as { axeFairyAI(p: unknown, g: GameHooks): void }).axeFairyAI(player, game);
    }
    expect(cast._axeTargetX).toBeDefined();          // 扫描锁定树格
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0]![0]).toBe('vi_9_Wood');
    expect(st.flags[st.idx(10, 20)]).toBe(1);        // 树不毁（不掉木材不毁树语义）
  });

  it('F8 wet 四副本之 MinionProj 坡面支：幽灵残型坡判干（Collision.cs:1632 active()）', () => {
    const st = new TileStore(4, 6);
    st.setTile(1, 3, 1);                             // 泥土格（在场）
    st.setSlope(1, 3, 2);                            // 斜坡
    st.setLiquid(1, 2, 255, 0);                      // 上格满水
    // 探针盒与格 (1,3) 整格相交（同 minionproj-ledger 台账批⑥ 几何）
    expect(wetCollisionProbe(st, 26, 54, 16, 16)).toBe(true);   // 在场坡+上格液 → 湿
    st.flags[st.idx(1, 3)] = 0;                      // 幽灵残型（type 保留、active 位清）
    expect(wetCollisionProbe(st, 26, 54, 16, 16)).toBe(false);  // 判干（核心回归）
    st.flags[st.idx(1, 3)] = 1;                      // 恢复在场
    expect(wetCollisionProbe(st, 26, 54, 16, 16)).toBe(true);   // 活性面行为不变
  });
});

// ============================================================
// 破坏族幽灵格门（2026-09-04 红队 RB 实体域三洞 F1/F2/F3 回归）：
// F2 = breakTile 头门（WorldGen.cs:64041 `if (!tile.active()) return;`——全游戏
//      唯一破坏原语首门,爆炸/砍切/破坏/挖矿全调用方对幽灵格 no-op）;
// F1 = explodeAt 破坏循环门序（Projectile.cs:80467-80474——`tile != null &&
//      tile.active()` 在 CanExplodeTile 之【前】,active 才进 KillTile）;
// F3 = Dart 沙球族（碎晶首门 P.cs:59031-59033 + 落沙放置占位门 :79246
//      `!tile.active()`——与 DirtBallProj:189/Arrow:5034/FallingBlock:106-109
//      幽灵保域口径同）。
// ============================================================
describe('破坏族幽灵格门（breakTile 头门 :64041 + explodeAt 门序 :80467-80474）', () => {
  /** explodeAt 可驱动面最小桩:复用 shell()（recLog/spawnDrop/achievements/sfx/
   *  chunks/entities 全桩;vanillaDust/net 未初始化=视觉与联网支自然跳过,链爆空）。
   *  爆心钉 (25,12),壳玩家 (10,19) 距爆心 |dx|≈240px > 自伤盒 48+6 → 自伤支跳过 */
  function boom(g: Record<string, unknown>): void {
    (g as unknown as {
      explodeAt: (tx: number, ty: number, dmg: number, r: number, dest: boolean,
        hb: number | undefined, pen: number, pid: number) => void;
    }).explodeAt(25, 12, 100, 3, true, undefined, 0, 28);
  }

  it('F1:爆炸半径内幽灵晶簇+幽灵矿不掉落不被毁（残型原样,无破坏记录）', () => {
    const w = mkWorld();
    const st = w.store;
    const logs: Array<Record<string, unknown>> = [];
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, 0, false);
    (g as unknown as { recLog: (k: string, v: Record<string, unknown>) => void }).recLog =
      (k, v) => logs.push({ k, ...v });
    st.type[st.idx(25, 12)] = TILE_BY_KEY['v_129_crystal_shard'];   // 残型=晶簇
    st.flags[st.idx(25, 12)] = 0;                                    // active=0 → 幽灵
    st.type[st.idx(24, 12)] = TILE_BY_KEY['ore_iron'];               // 残型=铁矿（掉落通道钉面）
    st.flags[st.idx(24, 12)] = 0;
    boom(g as unknown as Record<string, unknown>);
    expect(drops).toEqual([]);                                       // 零掉落（核心回归）
    expect(logs.filter((l) => l.k === 'tile')).toEqual([]);          // 零破坏记录
    expect(st.type[st.idx(25, 12)]).toBe(TILE_BY_KEY['v_129_crystal_shard']);
    expect(st.flags[st.idx(25, 12)]).toBe(0);                        // 残型原样
    expect(st.type[st.idx(24, 12)]).toBe(TILE_BY_KEY['ore_iron']);
    expect(st.flags[st.idx(24, 12)]).toBe(0);
  });

  it('F2:breakTile 直打幽灵格 no-op（:64041 头门）——不掉落残型原样;对照活性格被清', () => {
    const w = mkWorld();
    const st = w.store;
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, 0, false) as unknown as
      Record<string, unknown> & { breakTile(x: number, y: number): void };
    st.type[st.idx(8, 20)] = TILE_BY_KEY['ore_iron'];
    st.flags[st.idx(8, 20)] = 0;                    // 幽灵铁矿
    st.setTileSilent(9, 20, TILE_BY_KEY['ore_iron']);   // 活性铁矿对照
    g.breakTile(8, 20);
    expect(drops).toEqual([]);                      // 幽灵格零掉落（核心回归）
    expect(st.type[st.idx(8, 20)]).toBe(TILE_BY_KEY['ore_iron']);
    expect(st.flags[st.idx(8, 20)]).toBe(0);        // 残型原样
    g.breakTile(9, 20);
    expect(st.type[st.idx(9, 20)]).toBe(0);         // 活性格照常被清
    expect(drops.some(([k]) => k.includes('IronOre'))).toBe(true);   // 掉落链活
  });

  it('F1 对照:活性晶簇/活性矿照常炸（破坏+掉落链不回归）', () => {
    const w = mkWorld();
    const st = w.store;
    const drops: Array<[string, number]> = [];
    const g = shell(w, drops, 0, false);
    st.setTileSilent(25, 12, TILE_BY_KEY['v_129_crystal_shard']);
    st.setTileSilent(24, 12, TILE_BY_KEY['ore_iron']);
    boom(g as unknown as Record<string, unknown>);
    expect(st.type[st.idx(25, 12)]).toBe(0);        // 晶簇被炸清
    expect(st.type[st.idx(24, 12)]).toBe(0);        // 矿被炸清
    expect(drops.some(([k]) => k.includes('IronOre'))).toBe(true);   // 掉落链活
  });
});

// ============================================================
// F3:Dart 沙球族幽灵门（碎晶首门 :59031-59033 / 落沙放置占位门 :79246）
// ============================================================
const BW = 120, BH = 60, BFLOOR = 50;
function mkBallWorld(): World {
  const w = new World(BW, BH, 11, 'ghost-place-ball');
  const st = w.store;
  for (let x = 0; x < BW; x++) st.setTile(x, BFLOOR, 1);
  return w;
}
function ballHooks(w: World): { hooks: GameHooks; breaks: Array<[number, number]> } {
  const breaks: Array<[number, number]> = [];
  const player = new Player(80 * TILE, (BFLOOR - 4) * TILE, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    spawnBurst: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    breakTile: (x: number, y: number) => { breaks.push([x, y]); w.store.setTile(x, y, 0); },
    scene: { zoneGraveyard: false },
    entities: { nextId: 1, add: () => {} },
  } as unknown as GameHooks;
  return { hooks, breaks };
}
function rollBall(d: Dart, h: GameHooks, n: number): void {
  for (let i = 0; i < n && !d.dead; i++) d.fixedUpdate(1 / 60, h);
}

describe('F3 沙球族幽灵门（碎晶 :59031-59033 / 落沙占位 :79246）', () => {
  it('F3a:沙球扫过幽灵晶簇不碎不掉落（DirtBall/Arrow 两载体同款已修,此处 Dart 载体）', () => {
    const w = mkBallWorld();
    const st = w.store;
    const crystal = VANILLA_TILE_ID.get(12)!;
    st.type[st.idx(60, 30)] = crystal;      // 残型=水晶（球道正中）
    st.flags[st.idx(60, 30)] = 0;           // 幽灵格
    const { hooks, breaks } = ballHooks(w);
    rollBall(new Dart(60 * TILE, 20 * TILE, 0, 3, 10, 31), hooks, 60);
    expect(breaks).toEqual([]);             // 核心回归:不碎
    expect(st.type[st.idx(60, 30)]).toBe(crystal);   // 残型原样
    expect(st.flags[st.idx(60, 30)]).toBe(0);
  });

  it('F3a 对照:活性晶簇照常碎（KillTile 链活）', () => {
    const w = mkBallWorld();
    const st = w.store;
    const crystal = VANILLA_TILE_ID.get(12)!;
    st.setTile(60, 30, crystal);
    const { hooks, breaks } = ballHooks(w);
    rollBall(new Dart(60 * TILE, 20 * TILE, 0, 3, 10, 31), hooks, 60);
    expect(breaks.some(([x, y]) => x === 60 && y === 30)).toBe(true);
    expect(st.get(60, 30)).toBe(0);         // 已清
  });

  it('F3b:落沙落点=幽灵残型 → 视为空位,沙覆盖残型直铺（:79246 !tile.active()）', () => {
    const w = mkBallWorld();
    const st = w.store;
    st.type[st.idx(60, BFLOOR - 1)] = TILE_BY_KEY['stone'];   // 残型=石（幽灵）
    st.flags[st.idx(60, BFLOOR - 1)] = 0;
    const { hooks } = ballHooks(w);
    const d = new Dart(60 * TILE, (BFLOOR - 5) * TILE, 0, 2, 10, 31);
    rollBall(d, hooks, 30);
    expect(d.dead).toBe(true);              // 穿幽灵格落地（幽灵非实心不碰撞）
    expect(st.get(60, BFLOOR - 1)).toBe(TILE_BY_KEY['sand']);   // 核心回归:覆盖残型
    expect(st.flags[st.idx(60, BFLOOR - 1)]).toBe(1);
  });

  it('F3b 对照:落点活性草（占位）→ 不放沙不覆盖（无叠放无替换）', () => {
    const w = mkBallWorld();
    const st = w.store;
    st.setTileSilent(60, BFLOOR - 1, TILE_BY_KEY['grass']);   // active 非实心占位
    const { hooks } = ballHooks(w);
    const d = new Dart(60 * TILE, (BFLOOR - 5) * TILE, 0, 2, 10, 31);
    rollBall(d, hooks, 30);
    expect(d.dead).toBe(true);              // 穿非实心草落地
    expect(st.get(60, BFLOOR - 1)).toBe(TILE_BY_KEY['grass']);  // 原样（未放沙）
  });
});
