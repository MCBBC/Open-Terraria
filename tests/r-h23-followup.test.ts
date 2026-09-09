// R-H23 终审批测试（2026-09-04 蓝队）——侏儒/巨石/放置钩批复核七修二 nit 逐项锁定。
// 反编译真值锚（/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/）：
//   H2-1 WorldGen.cs:88124-88163 InAPlaceWithWind 两重载（Vector2 像素域 :88124-88129
//        → int tile 域 :88141-88163）+ DoesWindBlowAtThisHeight :88131-88139 remix 翻转；
//        TileDrawing.cs:4562-4564 贴图风门私有封装（489 风铃 2×3/:4802、490 风向标
//        2×2/:4817、493 旗 1×1/:5312）；WallID.cs:54 AllowsWind 白名单 13 成员。
//   H2-2 NPC.cs:56456-56463 石化击杀记账【无交互门】（不经 checkDead→NPCLoot :79643
//        的 GetWereThereAnyInteractions :80640，也不调 CountKillForAchievements
//        :79644/:80650，Player.lastCreatureHit 写入点 Player.cs:20175/:43750 不参与）；
//        BannerSystem.AddNPCKillBy（Banners.ts 单源）。
//   H2-3 TileObject.cs:79-88 Place 写前清格臂（active && type!=484 && (tileCut||BWP)
//        → KillTile;:86-88 netMode 补 SendData 17 = 联机面）+ :94-110 裸写
//        `if (!tileSafely2.active())` 跳写。
//   H3-1 Player.cs:39946-40025 FillEmptySpace（:39949 stack<=1 门读【消耗前】库存——
//        主放消耗在 ItemCheck 通用段 :43612-43651，时点晚于 FillEmptySpace 与
//        autoPaint 尾奏）。
//   H3-2 Projectile.cs:47710-47753 AI_016_CanAcornPlant（CanCutTile 门 :47735-47746）→
//        WorldGen.cs:60504-60519 PlaceTile case 20（13 成员落地表、无液体门、无 KillTile）
//        → :80250-80273 种弹 Kill（CanAcornPlant 真即不掉落，PlaceTile 失败=橡实白吃）。
//   H3-3 WorldGen.cs:63033-63054 ReplaceWall（:63049-63050 非0→非0 也
//        ClearWallPaintAndCoating；蔓延域 Convert_ActuallyConvertWall 保漆）。
//   H3-4 Player.cs:38943-38952 邻接门（裸 active()=hasTile，幽灵格判例）+
//        WorldGen.cs:75727-75745 PlaceWall（:75728-75731 世界边 2 格 margin +
//        :75741-75743 内建 PlaySound(0)）。
//   H3-5 行号卫生不设测试（注释面）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Inventory } from '../src/items/Inventory';
import { inAPlaceWithWind, inAPlaceWithWindTiles } from '../src/entities/Mounts';
import { bannerOfNpc } from '../src/world/Banners';

const iidOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]] ?? -1;
const defOf = (vid: number): (typeof ITEM_DEFS)[number] => ITEM_DEFS[iidOf(vid)];
const WALL_WOOD_VID = 93;    // → wallId 4
const WALL_BRICK_VID = 130;  // → wallId 5

const STONE = TILE_BY_KEY['stone']!;
const TALLGRASS = TILE_BY_KEY['tallgrass']!;
const ROLLING_CACTUS_484 = TILE_BY_KEY['v_484_rolling_cactus']!;
const MOWED_GRASS_477 = TILE_BY_KEY['v_477_mowed_grass_block']!;
const GRASS = TILE_INTERNAL_BY_SHEET.get(2)!;
const SAPLING = TILE_INTERNAL_BY_SHEET.get(20)!;

type AnyGame = Game & Record<string, (...a: never[]) => unknown>;

/** Game 壳（模式同 tests/placement-pipeline-debt.test.ts / ghost-place-swap） */
function shell(w: World, opts: {
  inv?: Inventory; breakTile?: (x: number, y: number) => void; sfx?: string[];
} = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  const sfx: string[] = opts.sfx ?? [];
  g.sfx = { play: (k: string) => { sfx.push(k); }, playWavFile: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => null;
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.killTileDropItems = () => {};
  g.achCheckBestiary = () => {};
  g.entities = { add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.trackTile = 0;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  if (opts.breakTile) g.breakTile = opts.breakTile;
  const inv = opts.inv ?? new Inventory();
  g.player = {
    cx: 10 * TILE + 8, cy: 12 * TILE + 8, x: 10 * TILE + 2, y: 12 * TILE - 6, w: 12, h: 28,
    facing: 1, useTime: 0,
    buffs: { has: () => false }, equipStats: { autoPaint: false },
    lastCreatureHit: 0,
    inv: {
      get selected() { return inv.selected; },
      slots: inv.slots,
      heldItem: () => inv.heldItem(),
      removeAt: (i: number, n: number) => inv.removeAt(i, n),
      removeHeld: (n: number) => inv.removeHeld(n),   // SW-AZ1：手持消耗统一入口
      findPaintSlot: () => -1,
      countOf: () => 0,
    },
  };
  return { g: g as AnyGame, inv, sfx };
}

// ===========================================================================
// H2-1 inAPlaceWithWind 单源收敛（Mounts 两重载）
// ===========================================================================
describe('H2-1 InAPlaceWithWind 单源（Mounts int/Vector2 双重载）', () => {
  const w = new World(40, 120, 11, 'r-h23-wind');
  w.groundLevel = 20;
  const st = w.store;

  it('int 重载（tile 域）：width/height 精确覆盖 + 液体/挡风墙双门', () => {
    expect(inAPlaceWithWindTiles(st, 5, 10, 2, 3, 20)).toBe(true);
    st.liquid[st.idx(6, 12)] = 100;                       // 覆盖盒末格有液
    expect(inAPlaceWithWindTiles(st, 5, 10, 2, 3, 20)).toBe(false);
    st.liquid[st.idx(6, 12)] = 0;
    st.wall[st.idx(6, 12)] = 1;                           // 土墙（白名单外）
    expect(inAPlaceWithWindTiles(st, 5, 10, 2, 3, 20)).toBe(false);
    st.wall[st.idx(6, 12)] = 150;                         // 木栅栏墙（AllowsWind,WallID.cs:54）
    expect(inAPlaceWithWindTiles(st, 5, 10, 2, 3, 20)).toBe(true);
    st.wall[st.idx(6, 12)] = 0;
  });

  it('DoesWindBlowAtThisHeight remix 翻转（:88132-88138）', () => {
    expect(inAPlaceWithWindTiles(st, 5, 10, 1, 1, 20, false)).toBe(true);   // 地上有风
    expect(inAPlaceWithWindTiles(st, 5, 10, 1, 1, 20, true)).toBe(false);   // remix 地上无风
    expect(inAPlaceWithWindTiles(st, 5, 30, 1, 1, 20, true)).toBe(true);    // remix 地下有风
    expect(inAPlaceWithWindTiles(st, 5, 30, 1, 1, 20, false)).toBe(false);
  });

  it('Vector2 重载两角闭区间 = int 重载同盒（1+point2-point）', () => {
    // 像素域 (5,10)+32×48px ≙ tile 域 (5,10) 2×3 格
    st.liquid[st.idx(6, 12)] = 100;
    expect(inAPlaceWithWind(st, 5 * TILE, 10 * TILE, 32, 48, 20)).toBe(false);
    expect(inAPlaceWithWindTiles(st, 5, 10, 2, 3, 20)).toBe(false);
    st.liquid[st.idx(6, 12)] = 0;
    expect(inAPlaceWithWind(st, 5 * TILE, 10 * TILE, 32, 48, 20)).toBe(true);
    expect(inAPlaceWithWindTiles(st, 5, 10, 2, 3, 20)).toBe(true);
  });
});

// ===========================================================================
// H2-2 石化旗杀旁路（NPC.cs:56456-56463 无交互门 / 不写 lastCreatureHit / 不通知）
// ===========================================================================
describe('H2-2 onEnemyKilled 石化旁路（petrifyBypassInteractionGate）', () => {
  function killShell() {
    const w = new World(40, 40, 7, 'r-h23-gnome-kill');
    const banner = bannerOfNpc(624);
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.world = w;
    g.newText = () => {};
    g.playerName = () => 'Tester';
    g.achCheckBestiary = () => {};
    g.hasNpcId = () => false;
    const drops: number[] = [];
    g.spawnDrop = (...a: unknown[]) => { drops.push(a.length); return null; };
    const notified: number[] = [];
    g.achievements = {
      notifyNPCKilled: (id: number) => notified.push(id),
      mechaMayhemKill: () => {},
      handleSpecialEvent: () => {},
      notifyProgressionEvent: () => {},
    };
    g.entities = { enemies: [] };
    const player = { lastCreatureHit: 0 };
    g.player = player;
    w.bannerKills[banner] = 49;   // 预置差 1 达标 → 本杀即授予
    return {
      g: g as AnyGame, w, banner, drops, notified, player,
      enemyLike: { vanillaId: 624, vanillaNetId: 0, playerInteracted: false, killBossFlag: false, dead: false } as never,
    };
  }

  it('石化旁路：无交互也记旗杀并授予（:56456-56463 原文无门）', () => {
    const k = killShell();
    (k.g.onEnemyKilled as (key: string, e: unknown, o?: { petrifyBypassInteractionGate?: boolean }) => void)(
      'gnome', k.enemyLike, { petrifyBypassInteractionGate: true });
    expect(k.w.bannerKills[k.banner]).toBe(50);   // 记账直通
    expect(k.drops.length).toBe(1);               // 达标掉旗
    expect(k.player.lastCreatureHit).toBe(0);     // 不写计数器行
    expect(k.notified.length).toBe(0);            // 不调 NotifyNPCKilled
  });

  it('无旁路且无交互：维持 R3-A3 门=旗杀被吞（死亡路径语义不回归）', () => {
    const k = killShell();
    k.g.onEnemyKilled('gnome', k.enemyLike);
    expect(k.w.bannerKills[k.banner]).toBe(49);
    expect(k.drops.length).toBe(0);
  });

  it('无旁路但有交互：死亡路径旗杀/通知全保留（计数器行不写——SW-BJ47 命中写位迁移）', () => {
    const k = killShell();
    (k.enemyLike as { playerInteracted: boolean }).playerInteracted = true;
    k.g.onEnemyKilled('gnome', k.enemyLike);
    expect(k.w.bannerKills[k.banner]).toBe(50);
    expect(k.drops.length).toBe(1);
    // ★SW-BJ47（2026-09-09）：lastCreatureHit 击杀时写已摘除——原版击杀结算
    //   CountKillForBannersAndDropThem（NPC.cs:80627-80637）不写此位,三写位均为
    //   【命中即写】（Player.cs:20609-20619/:44769-44775 + Projectile.cs:13382-13389）,
    //   仓内写位 = Enemy.hurt fromPlayer 尾段（tests/sw-bj47-tally-counter.test.ts 锁）。
    //   旧断言 `toBe(624)` 锁的是击杀写偏差,随迁移一并更正。
    expect(k.player.lastCreatureHit).toBe(0);
    expect(k.notified).toContain(624);
  });
});

// ===========================================================================
// H2-3 placeObjectCells 写前清格臂（TileObject.cs:79-88 + :94-110）
// ===========================================================================
describe('H2-3 placeObjectCells Place 头 KillTile 清格臂', () => {
  function pcShell(w: World) {
    const breaks: Array<[number, number]> = [];
    const { g } = shell(w, {
      // KillTile 效果等价桩：清 active/type（本测试只对清格臂的占位裁决负责）
      breakTile: (x: number, y: number) => {
        breaks.push([x, y]);
        const st = w.store;
        st.flags[st.idx(x, y)] = 0;
        st.type[st.idx(x, y)] = 0;
      },
    });
    return { g, breaks };
  }

  it('tileCut 占位格 → 先 KillTile 再写入（:79-88）', () => {
    const w = new World(40, 40, 7, 'r-h23-poc-cut');
    const st = w.store;
    const { g, breaks } = pcShell(w);
    st.setTileSilent(10, 10, TALLGRASS, 0, 0);
    g.placeObjectCells([{ x: 10, y: 10, type: STONE, fx: 0, fy: 0 }], 10, 10);
    expect(breaks).toEqual([[10, 10]]);                 // 清格臂触发
    expect(st.type[st.idx(10, 10)]).toBe(STONE);        // 写入成功
  });

  it('484 占位格 → 不 Kill 不覆写（type!=484 排除 + pass2 !active 跳写）', () => {
    const w = new World(40, 40, 7, 'r-h23-poc-484');
    const st = w.store;
    const { g, breaks } = pcShell(w);
    st.setTileSilent(10, 10, ROLLING_CACTUS_484, 0, 0);
    g.placeObjectCells([{ x: 10, y: 10, type: STONE, fx: 0, fy: 0 }], 10, 10);
    expect(breaks).toEqual([]);                                  // 484 不入清格臂
    expect(st.type[st.idx(10, 10)]).toBe(ROLLING_CACTUS_484);    // 原格保留（跳写）
  });
});

// ===========================================================================
// H3-1 FillEmptySpace 门读消耗前库存（Player.cs:39949 + ItemCheck :43612-43651 时序）
// ===========================================================================
describe('H3-1 tryPlaceWall 补铺门时序（消耗前库存）', () => {
  function fillWorld(): World {
    const w = new World(40, 40, 7, 'r-h23-fill');
    const st = w.store;
    // (10,10) 三邻有墙（邻接门）+ (9,10) 其余三邻 = 补铺候选
    st.setWallSilent(11, 10, 4);
    st.setWallSilent(10, 9, 4);
    st.setWallSilent(10, 11, 4);
    st.setWallSilent(8, 10, 4);
    st.setWallSilent(9, 9, 4);
    st.setWallSilent(9, 11, 4);
    return w;
  }

  it('持 2 张：主放 + 补铺 1 格，两件全用（:39949 门读消耗前 stack=2）', () => {
    const w = fillWorld();
    const { g, inv } = shell(w);
    inv.slots[0] = { id: iidOf(WALL_WOOD_VID), stack: 2 };
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof ITEM_DEFS[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_WOOD_VID));
    const st = w.store;
    expect(st.wall[st.idx(10, 10)]).toBe(4);   // 主放
    expect(st.wall[st.idx(9, 10)]).toBe(4);    // ★补铺（旧码只主放）
    expect(inv.slots[0]).toBeNull();           // 两件全用
  });

  it('持 1 张：仅主放（stack<=1 门原样拒绝补铺）', () => {
    const w = fillWorld();
    const { g, inv } = shell(w);
    inv.slots[0] = { id: iidOf(WALL_WOOD_VID), stack: 1 };
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof ITEM_DEFS[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_WOOD_VID));
    const st = w.store;
    expect(st.wall[st.idx(10, 10)]).toBe(4);
    expect(st.wall[st.idx(9, 10)]).toBe(0);
    expect(inv.slots[0]).toBeNull();
  });
});

// ===========================================================================
// H3-2 种弹域分域（AI_016 CanAcornPlant + PlaceTile case 20 + :80250-80273）
// ===========================================================================
describe('H3-2 橡实种弹域门集分域', () => {
  function acornShell(w: World, drops: Array<{ key: string; n: number }> = []) {
    const { g } = shell(w);
    (g as unknown as { spawnDrop: (x: number, y: number, key: string, n: number) => unknown })
      .spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
    return { g, drops };
  }
  const place = (g: AnyGame, tx: number, ty: number, killObstacle: boolean) =>
    (g as unknown as { placeAcornSapling: (tx: number, ty: number, k?: boolean) => boolean })
      .placeAcornSapling(tx, ty, killObstacle);

  it('①484 占位：种弹域无 carve-out 可覆写；玩家域 carve-out 拒置', () => {
    const w = new World(160, 200, 7, 'r-h23-a484');
    const st = w.store;
    st.setTileSilent(10, 11, GRASS, 0, 0);
    st.setTileSilent(10, 10, ROLLING_CACTUS_484, 0, 0);
    const { g } = acornShell(w);
    expect(place(g, 10, 10, false)).toBe(true);   // 种弹：直写覆写
    expect(st.type[st.idx(10, 10)]).toBe(SAPLING);
    st.setTileSilent(20, 10, ROLLING_CACTUS_484, 0, 0);
    st.setTileSilent(20, 11, GRASS, 0, 0);
    expect(place(g, 20, 10, true)).toBe(false);   // 玩家：484 carve-out 拒
  });

  it('②地基坡：种弹域收底坡 3/4 拒顶坡 1；玩家域坡全拒', () => {
    const w = new World(160, 200, 7, 'r-h23-aslope');
    const st = w.store;
    st.setTileSilent(10, 11, GRASS, 0, 0);
    st.slope[st.idx(10, 11)] = 3;                            // bottomSlope
    const { g } = acornShell(w);
    expect(place(g, 10, 10, false)).toBe(true);   // 种弹可种
    st.setTileSilent(20, 11, GRASS, 0, 0);
    st.slope[st.idx(20, 11)] = 3;
    expect(place(g, 20, 10, true)).toBe(false);   // 玩家整砖锚拒坡
    st.setTileSilent(30, 11, GRASS, 0, 0);
    st.slope[st.idx(30, 11)] = 1;                            // topSlope
    expect(place(g, 30, 10, false)).toBe(false);  // 种弹也拒顶坡
  });

  it('④液体门：种弹域水中照种；玩家域拒', () => {
    const w = new World(160, 200, 7, 'r-h23-aliq');
    const st = w.store;
    st.setTileSilent(10, 11, GRASS, 0, 0);
    st.liquid[st.idx(10, 10)] = 200;
    const { g } = acornShell(w);
    expect(place(g, 10, 10, false)).toBe(true);   // case 20 无液体门
    st.setTileSilent(20, 11, GRASS, 0, 0);
    st.liquid[st.idx(20, 10)] = 200;
    expect(place(g, 20, 10, true)).toBe(false);   // WaterPlacement NotAllowed
  });

  it('⑤地基 477：种弹域静默失败；玩家域照种（case 20 表 :60509-60510）', () => {
    const w = new World(160, 200, 7, 'r-h23-a477');
    const st = w.store;
    st.setTileSilent(10, 11, MOWED_GRASS_477, 0, 0);
    const { g } = acornShell(w);
    expect(place(g, 10, 10, false)).toBe(false);  // 13 成员表外
    expect(place(g, 10, 10, true)).toBe(true);    // 玩家链 15 成员表内
  });

  it('③CanAcornPlant 补 CanCutTile 门：wall 350 域定位失败（:47735-47746）', () => {
    const w = new World(160, 200, 7, 'r-h23-acut');
    const st = w.store;
    st.setTileSilent(70, 100, GRASS, 0, 0);
    const { g } = acornShell(w);
    st.wall[st.idx(70, 99)] = 350;
    expect((g as unknown as { canAcornPlant: (cx: number, cy: number) => { x: number; y: number } | null })
      .canAcornPlant(70 * TILE + 8, 99 * TILE + 8)).toBeNull();
    st.wall[st.idx(70, 99)] = 0;
    expect((g as unknown as { canAcornPlant: (cx: number, cy: number) => { x: number; y: number } | null })
      .canAcornPlant(70 * TILE + 8, 99 * TILE + 8)).toEqual({ x: 70, y: 99 });
  });

  it('种弹 Kill：可种位但 PlaceTile 静默失败（477）= 橡实白吃不掉落（:80262-80273）', () => {
    const w = new World(160, 200, 7, 'r-h23-aeat');
    const st = w.store;
    st.setTileSilent(80, 100, MOWED_GRASS_477, 0, 0);        // CanAcornPlant 真(15 表)
    const drops: Array<{ key: string; n: number }> = [];
    const { g } = acornShell(w, drops);
    (g as unknown as { acornSeedDeath: (x: number, y: number, ovx: number, ovy: number) => void })
      .acornSeedDeath(80 * TILE + 8, 99 * TILE + 8, 0, 0);
    expect(drops.length).toBe(0);                            // 白吃：不掉橡实
    expect(st.type[st.idx(80, 99)]).not.toBe(SAPLING);
    // 对照：不可种（无地基）→ 掉落橡实
    (g as unknown as { acornSeedDeath: (x: number, y: number, ovx: number, ovy: number) => void })
      .acornSeedDeath(20 * TILE + 8, 5 * TILE + 8, 0, 0);
    expect(drops.length).toBe(1);
  });
});

// ===========================================================================
// H3-3 换墙清旧墙漆（ReplaceWall :63049-63050 ClearWallPaintAndCoating）
// ===========================================================================
describe('H3-3 非0→非0 换墙清漆', () => {
  it('墙替换：旧墙漆/墙涂层归零（Tile.cs:941-946 清位域）', () => {
    const w = new World(40, 40, 7, 'r-h23-swap');
    const st = w.store;
    st.setWallSilent(11, 10, 4);                      // 邻接门
    st.setWallSilent(10, 10, 4);                      // 旧木墙（WALL_HOUSE 族=friendly）
    st.paintWall[st.idx(10, 10)] = 3;
    st.coat[st.idx(10, 10)] |= TileStore.COAT_WALL_MASK;
    const { g, inv } = shell(w);
    inv.slots[0] = { id: iidOf(WALL_BRICK_VID), stack: 5 };
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof ITEM_DEFS[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_BRICK_VID));
    expect(st.wall[st.idx(10, 10)]).toBe(5);          // 换墙成功
    expect(st.paintWall[st.idx(10, 10)]).toBe(0);     // ★旧漆清
    expect(st.coat[st.idx(10, 10)] & TileStore.COAT_WALL_MASK).toBe(0);
  });
});

// ===========================================================================
// H3-4 邻接门裸 active + PlaceWall margin + 补铺格 PlaySound
// ===========================================================================
describe('H3-4 tryPlaceWall 邻接门/margin/补铺音', () => {
  it('幽灵格邻接（flags bit0=1,type=0）→ 邻接通过（hasTile 代读修复）', () => {
    const w = new World(40, 40, 7, 'r-h23-ghost');
    const st = w.store;
    st.flags[st.idx(11, 10)] = 1;                     // 幽灵残型：active 位在,type=0
    st.type[st.idx(11, 10)] = 0;
    const { g, inv } = shell(w);
    inv.slots[0] = { id: iidOf(WALL_WOOD_VID), stack: 5 };
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof ITEM_DEFS[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_WOOD_VID));
    expect(st.wall[st.idx(10, 10)]).toBe(4);          // 旧谓词 type!==0 判假=拒放
  });

  it('世界边 2 格 margin（PlaceWall :75728-75731）→ 拒放不耗物', () => {
    const w = new World(40, 40, 7, 'r-h23-margin');
    const st = w.store;
    st.setWallSilent(2, 9, 4);
    st.setWallSilent(2, 11, 4);
    const { g, inv } = shell(w);
    inv.slots[0] = { id: iidOf(WALL_WOOD_VID), stack: 5 };
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof ITEM_DEFS[number]) => void })
      .tryPlaceWall(1, 10, defOf(WALL_WOOD_VID));     // tx<=1 → 静默 no-op
    expect(st.wall[st.idx(1, 10)]).toBe(0);
    expect(inv.slots[0]?.stack).toBe(5);
  });

  it('补铺格逐格 PlaySound(0)（PlaceWall 内建 :75741-75743）', () => {
    const w = new World(40, 40, 7, 'r-h23-fillsfx');
    const st = w.store;
    st.setWallSilent(11, 10, 4);
    st.setWallSilent(10, 9, 4);
    st.setWallSilent(10, 11, 4);
    st.setWallSilent(8, 10, 4);
    st.setWallSilent(9, 9, 4);
    st.setWallSilent(9, 11, 4);
    const sfx: string[] = [];
    const { g, inv } = shell(w, { sfx });
    inv.slots[0] = { id: iidOf(WALL_WOOD_VID), stack: 3 };
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof ITEM_DEFS[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_WOOD_VID));
    const digs = sfx.filter((k) => k === 'dig').length;
    expect(digs).toBeGreaterThanOrEqual(2);           // 主放 + 补铺格各响一次
    expect(st.wall[st.idx(9, 10)]).toBe(4);
  });
});
