// 放置管线债清偿批（2026-09-04 蓝队）——四项遗留近似 + PlaceIt autoPaint 墙侧钩。
// 反编译锚（/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/）：
//   ① PlaceIt_Walls autoPaint 三站点（Player.cs:39938-39942 PlaceThing_Walls /
//      :40018-40023 Walls_FillEmptySpace / :40136-40141 TryReplacingWalls）——
//      喷漆器族 2216/3061/5126（:14720-14734 = equipStats.autoPaint）+
//      builderAccStatus[3]==0（options.builderAutoPaintDisabled ↔ ==1）→
//      TryPainting(wall 通道, applyItemAnimation:false)。tile 侧钩本仓原已建
//      （tryPlace 尾 :21606 区 + moss/dye placeItAutoAcc），本批补墙侧。
//   ②a CanPlace 豁免半边：TileObject.cs:356-360 占用=active && (!tileCut||484/654)
//      && !BWP；IsReplaceableBlock（Player.cs:40079-40087）另拒 484/711。豁免格
//      CanPlace/Place 域经 TileObject.Place :84 KillTile 清格；legacy PlaceTile 域
//      直写覆写。绳索支 retarget 门 = CheckRopeUsability :41856-41859。
//      ★Collision.EmptyTile（Collision.cs:1361-1376）本身【无】豁免——豁免式不在
//      EmptyTile,在 CanPlace/IsReplaceableBlock（登记更正）。
//   ②b CheckChand 3×3 完整性环（WorldGen.cs:53254-53333）：:53300-53310 逐格
//      !active||type异||frameX异||frameY异 → 整件杀;:53318-53322 顶行第 2 列上方
//      nactive+solid+非 solidTop;454 仅宽 4 异（:53260-53263）。
//   ②c CheckStalactiteEcho frameY 半边（WorldGen.cs:39276 num4=(!num2)?18*num:0 +
//      :39289 frameY != num4+num6）——顶半帧基 0、底半帧基 n*18。
// 壳模式同 tests/ghost-place-swap.test.ts（Object.create(Game.prototype)+桩）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { options } from '../src/core/Options';

const STONE = TILE_BY_KEY['stone']!;
const GRASS = TILE_BY_KEY['grass']!;
const SAPLING = TILE_BY_KEY['acorn_sapling']!;
const ROPE = TILE_BY_KEY['v_213_rope']!;
const CHANDELIER = TILE_BY_KEY['chandelier']!;
const PIGRONATA = TILE_BY_KEY['v_454_pigronata']!;
const ECHO_1X2 = TILE_BY_KEY['v_694_stalactite_1x2_echo']!;
const MUSHROOM = TILE_BY_KEY['mushroom']!;
const TALLGRASS = TILE_BY_KEY['tallgrass']!;

interface Drop { key: string; n: number }

const iidOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]] ?? -1;
const defOf = (vid: number): (typeof ITEM_DEFS)[number] => ITEM_DEFS[iidOf(vid)];

const WALL_WOOD_VID = 93;      // vi_93_wood_wall → wall 4（vanilla-wallitems.json :93）
const WALL_BRICK_VID = 130;    // vi_130_gray_brick_wall → wall 5
const PAINT_RED_VID = 1073;    // 油漆 1073 → PaintID 1（items.ts PAINT_ITEM_TABLE）

/** Game 壳（同 ghost-place-swap shell,补 wall/paint/decors 域所需桩） */
function shell(w: World, drops: Drop[], opts: {
  autoPaint?: boolean; paintVid?: number; heldStack?: number; paintSlot?: number;
} = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
    player: Record<string, unknown> & { inv: Record<string, unknown> & { slots: unknown[] } };
  };
  const consumed: Array<number> = [];
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.killTileDropItems = (Game.prototype as unknown as Record<string, unknown>)['killTileDropItems'];
  g.entities = { add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.trackTile = 0;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  const slots: unknown[] = new Array(60).fill(null);
  if (opts.paintVid) slots[opts.paintSlot ?? 1] = { id: iidOf(opts.paintVid), stack: 9 };
  g.player = {
    cx: 10 * 16 + 8, cy: 12 * 16 + 8, x: 10 * 16 + 2, y: 12 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false,
    buffs: { has: () => false }, equipStats: { autoPaint: !!opts.autoPaint },
    inv: {
      selected: 0,
      slots,
      findPaintSlot: () => slots.findIndex((s) => {
        const slot = s as { id: number } | null;
        return !!slot && ((ITEM_DEFS[slot.id] as { paint?: number })?.paint ?? 0) !== 0;
      }),
      heldItem: () => ({ id: -1, stack: opts.heldStack ?? 9 }),
      removeAt: (i: number, n: number) => {
        consumed.push(i);
        const s = slots[i] as { stack: number } | null;
        if (s) s.stack = Math.max(0, s.stack - n);
      },
      countOf: () => 0,
    },
  };
  return { g: g as unknown as Game & Record<string, (...a: unknown[]) => unknown>, consumed };
}

function mkWorld(): World {
  return new World(40, 40, 7, 'placement-pipeline-debt');
}

afterEach(() => { vi.restoreAllMocks(); });

// ============================================================
// ① 墙侧 autoPaint 尾奏（Player.cs:39938/:40018/:40136）
// ============================================================
describe('① PlaceIt_Walls autoPaint 尾奏（wall 通道三站点）', () => {
  const WOOD_WALL_DEF = defOf(WALL_WOOD_VID);

  it('新放墙：autoPaint+油漆在包 → 新墙 wall 通道上漆并耗漆（:39938-39942）', () => {
    const w = mkWorld();
    const st = w.store;
    // 邻接门：三邻有墙（目标 (10,10) 空）
    st.setWallSilent(10, 9, 4);
    st.setWallSilent(9, 10, 4);
    st.setWallSilent(11, 10, 4);
    const drops: Drop[] = [];
    const { g, consumed } = shell(w, drops, { autoPaint: true, paintVid: PAINT_RED_VID });
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof WOOD_WALL_DEF) => void })
      .tryPlaceWall(10, 10, WOOD_WALL_DEF);
    expect(st.wall[st.idx(10, 10)]).toBe(4);            // 墙已放
    expect(st.paintWall[st.idx(10, 10)]).toBe(1);       // ★wall 通道上漆（PaintID.RED）
    expect(consumed).toContain(1);                      // 油漆槽被耗（ApplyPaint stack--）
    expect(st.paint[st.idx(10, 10)]).toBe(0);           // tile 通道不动（paintingAWall=true）
  });

  it('未装备喷漆器（equipStats.autoPaint=false）→ 不上漆（:39939 autoPaint 门）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setWallSilent(10, 9, 4);
    const drops: Drop[] = [];
    const { g } = shell(w, drops, { paintVid: PAINT_RED_VID });
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof WOOD_WALL_DEF) => void })
      .tryPlaceWall(10, 10, WOOD_WALL_DEF);
    expect(st.wall[st.idx(10, 10)]).toBe(4);
    expect(st.paintWall[st.idx(10, 10)]).toBe(0);
  });

  it('builderAccStatus[3] 开关关断（builderAutoPaintDisabled）→ 不上漆不耗漆', () => {
    const w = mkWorld();
    const st = w.store;
    st.setWallSilent(10, 9, 4);
    const drops: Drop[] = [];
    const prev = options.data.builderAutoPaintDisabled;
    options.data.builderAutoPaintDisabled = true;
    try {
      const { g, consumed } = shell(w, drops, { autoPaint: true, paintVid: PAINT_RED_VID });
      (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof WOOD_WALL_DEF) => void })
        .tryPlaceWall(10, 10, WOOD_WALL_DEF);
      expect(st.wall[st.idx(10, 10)]).toBe(4);
      expect(st.paintWall[st.idx(10, 10)]).toBe(0);
      expect(consumed).not.toContain(1);                // 油漆未耗
    } finally {
      options.data.builderAutoPaintDisabled = prev;
    }
  });

  it('无油漆在包 → 墙照放不上漆（TryPainting FindPaintOrCoating null 早退 :41293）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setWallSilent(10, 9, 4);
    const drops: Drop[] = [];
    const { g } = shell(w, drops, { autoPaint: true });
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: typeof WOOD_WALL_DEF) => void })
      .tryPlaceWall(10, 10, WOOD_WALL_DEF);
    expect(st.wall[st.idx(10, 10)]).toBe(4);
    expect(st.paintWall[st.idx(10, 10)]).toBe(0);
  });

  it('墙替换（wallSwap）：换墙成功 → 新墙 wall 通道上漆（:40136-40141）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setWallSilent(10, 10, 4);                        // 旧木墙
    st.setWallSilent(11, 10, 4);                        // 邻接门（:38943-38952 四邻查）
    const drops: Drop[] = [];
    const { g } = shell(w, drops, { autoPaint: true, paintVid: PAINT_RED_VID });
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_BRICK_VID));
    expect(st.wall[st.idx(10, 10)]).toBe(5);            // 换成灰砖墙
    expect(st.paintWall[st.idx(10, 10)]).toBe(1);       // ★换墙面同刷
  });

  it('FillEmptySpace 补铺格逐格上漆（:40018-40023）', () => {
    const w = mkWorld();
    const st = w.store;
    // 目标 (10,10) 放木墙；(9,10) 空 + 四邻木墙 → 被补铺
    st.setWallSilent(8, 10, 4);
    st.setWallSilent(9, 9, 4);
    st.setWallSilent(9, 11, 4);
    st.setWallSilent(11, 10, 4);                        // 兼作目标邻接门
    const drops: Drop[] = [];
    const { g, consumed } = shell(w, drops, { autoPaint: true, paintVid: PAINT_RED_VID, heldStack: 5 });
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_WOOD_VID));
    expect(st.wall[st.idx(10, 10)]).toBe(4);
    expect(st.wall[st.idx(9, 10)]).toBe(4);             // 补铺格落墙
    expect(st.paintWall[st.idx(9, 10)]).toBe(1);        // ★补铺格即时上漆
    expect(consumed.filter((s) => s === 0).length).toBeGreaterThanOrEqual(2);   // 目标+补铺两耗
  });

  it('FillEmptySpace stack<=1 门（:39948）：单件持墙不补铺（?? 优先级回归）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setWallSilent(8, 10, 4);
    st.setWallSilent(9, 9, 4);
    st.setWallSilent(9, 11, 4);
    st.setWallSilent(11, 10, 4);
    const drops: Drop[] = [];
    const { g } = shell(w, drops, { autoPaint: true, paintVid: PAINT_RED_VID, heldStack: 1 });
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void })
      .tryPlaceWall(10, 10, defOf(WALL_WOOD_VID));
    expect(st.wall[st.idx(10, 10)]).toBe(4);            // 目标照放
    expect(st.wall[st.idx(9, 10)]).toBe(0);             // ★stack=1 不补铺（旧 `?? 0 > 1` 解析成恒真会补）
  });
});

// ============================================================
// ① tile 侧钩面（本仓原已建,本批补端到端锚）
// ============================================================
describe('① tile 侧 autoPaint/autoActuator 钩端到端（tryPlace 尾）', () => {
  it('喷漆器+油漆在包 → 放置块 tile 通道上漆（:40950 TryPainting tile）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(12, 13, STONE);                    // 目标 (12,12) 正下方=铺放支撑
    const drops: Drop[] = [];
    const { g } = shell(w, drops, { autoPaint: true, paintVid: PAINT_RED_VID });
    const WOOD_V = 9;
    const woodDef = defOf(WOOD_V);
    (g as unknown as { tryPlace: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void })
      .tryPlace(12, 12, woodDef);
    const ti = st.idx(12, 12);
    expect(st.flags[ti]).toBe(1);                       // 木材落格
    expect(st.paint[ti]).toBe(1);                       // ★tile 通道上漆
    expect(st.paintWall[ti]).toBe(0);
  });
});

// ============================================================
// ②a CanPlace 豁免半边（TileObject.cs:356-360 + Player.cs:40079-40087）
// ============================================================
describe('②a placeAcornSapling 豁免半边（tileCut∪BWP 可置入）', () => {
  it('CanPlace/Place 域：目标=可割蘑菇 → 清格（掉落）后落苗（:357 豁免+:84 KillTile）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(8, 21, GRASS);                     // 地基=草（ACORN_ALT 档 0）
    st.setTileSilent(8, 20, MUSHROOM, 144, 0);          // 目标格被可割株占据（fx144=掉落档）
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    const ok = (g as unknown as { placeAcornSapling: (x: number, y: number) => boolean })
      .placeAcornSapling(8, 20);
    expect(ok).toBe(true);
    expect(st.type[st.idx(8, 20)]).toBe(SAPLING);       // 树苗落格
    expect(drops.map((d) => d.key)).toContain(VANILLA_ITEM_KEY_BY_ID[5]);   // 蘑菇走 KillTile 掉落
  });

  it('种弹 legacy 域（killObstacle=false）：直写覆写不清格不掉落（PlaceTile case 20）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(8, 21, GRASS);
    st.setTileSilent(8, 20, MUSHROOM, 144, 0);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    const ok = (g as unknown as {
      placeAcornSapling: (x: number, y: number, kill?: boolean) => boolean;
    }).placeAcornSapling(8, 20, false);
    expect(ok).toBe(true);
    expect(st.type[st.idx(8, 20)]).toBe(SAPLING);
    expect(drops).toEqual([]);                          // ★无 KillTile（legacy 覆写域）
  });

  it('非豁免占位（实心石）→ 拒置（:357 占用半边）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(8, 21, GRASS);
    st.setTileSilent(8, 20, STONE);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    const ok = (g as unknown as { placeAcornSapling: (x: number, y: number) => boolean })
      .placeAcornSapling(8, 20);
    expect(ok).toBe(false);
    expect(st.type[st.idx(8, 20)]).toBe(STONE);
  });

  it('绳索支：下延落入可割草丛格 → 绳写入该格后止步（CheckRopeUsability :41856 retarget）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(8, 16, TALLGRASS, 0, 0);           // 下延路径上的可割株
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { tryPlace: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void })
      .tryPlace(8, 12, defOf(965));
    expect(st.type[st.idx(8, 12)]).toBe(ROPE);
    expect(st.type[st.idx(8, 16)]).toBe(ROPE);          // ★绳写入豁免格（旧版在此 break 漏放）
    expect(st.type[st.idx(8, 17)]).toBe(0);             // 走查止于首个非绳格（不穿格续延）
  });

  it('绳索支：下延落入实心格 → 止步不入（:41835 走查门）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(8, 16, STONE);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { tryPlace: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void })
      .tryPlace(8, 12, defOf(965));
    expect(st.type[st.idx(8, 15)]).toBe(ROPE);          // 空域照铺
    expect(st.type[st.idx(8, 16)]).toBe(STONE);         // 实心格原样
    expect(st.type[st.idx(8, 17)]).toBe(0);
  });
});

// ============================================================
// ②b CheckChand 3×3 完整性环（WorldGen.cs:53254-53333）
// ============================================================
function placeChandelier(w: World, ax: number, ay: number, width: number,
  tile: number, corrupt?: { dx: number; dy: number; fx?: number; fy?: number }): void {
  const st = w.store;
  st.setTileSilent(ax + 1, ay - 1, STONE);              // 顶锚=顶行第 2 列上方
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      let fx = dx * 18, fy = dy * 18;
      if (corrupt && corrupt.dx === dx && corrupt.dy === dy) {
        if (corrupt.fx !== undefined) fx = corrupt.fx;
        if (corrupt.fy !== undefined) fy = corrupt.fy;
      }
      st.setTileSilent(ax + dx, ay + dy, tile, fx, fy);
    }
  }
}

describe('②b CheckChand 3×3 完整性环（34/454）', () => {
  it('整件完好+顶锚实心 → 存活（环全对齐）', () => {
    const w = mkWorld();
    placeChandelier(w, 9, 10, 3, CHANDELIER);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(11, 12);                   // 任意在件格触发
    expect(w.store.get(9, 10)).toBe(CHANDELIER);        // 全件存活
    expect(w.store.get(11, 12)).toBe(CHANDELIER);
    expect(drops).toEqual([]);
  });

  it('环内一格 frameY 失配 → 整件杀（:53300-53310 逐格帧比对,本批新增半边）', () => {
    const w = mkWorld();
    placeChandelier(w, 9, 10, 3, CHANDELIER, { dx: 0, dy: 2, fy: 40 });
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(11, 12);
    expect(w.store.get(9, 10)).toBe(0);                 // 整件塌（killDecorTile→breakTile）
    expect(w.store.get(11, 12)).toBe(0);
    expect(drops.map((d) => d.key)).toContain(VANILLA_ITEM_KEY_BY_ID[106]);   // 吊灯掉落
  });

  it('环内一格缺失（active=0）→ 整件杀（!active 支）', () => {
    const w = mkWorld();
    placeChandelier(w, 9, 10, 3, CHANDELIER);
    w.store.setTileSilent(10, 11, 0);                   // 中格消失（幽灵挖格）
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(9, 12);
    expect(w.store.get(9, 10)).toBe(0);
    expect(w.store.get(9, 12)).toBe(0);
  });

  it('顶锚失实 → 整件杀（既有 :53318-53322 半边,回归锚）', () => {
    const w = mkWorld();
    placeChandelier(w, 9, 10, 3, CHANDELIER);
    w.store.setTileSilent(10, 9, 0);                    // 顶锚被挖
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(10, 11);
    expect(w.store.get(9, 10)).toBe(0);
  });

  it('454 皮格纳塔宽 4 异（:53260-53263）：第 4 列帧失配同杀', () => {
    const w = mkWorld();
    placeChandelier(w, 9, 10, 4, PIGRONATA, { dx: 3, dy: 0, fx: 99 });
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(9, 11);
    expect(w.store.get(9, 10)).toBe(0);
    expect(w.store.get(12, 12)).toBe(0);
  });
});

// ============================================================
// ②c CheckStalactiteEcho frameY 半边（WorldGen.cs:39276/:39289）
// ============================================================
describe('②c Echo 凌柱完整性 frameY 半边（693/694）', () => {
  it('694 顶半对（fy 0/18+顶锚实心）→ 存活', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 9, STONE);
    st.setTileSilent(10, 10, ECHO_1X2, 0, 0);
    st.setTileSilent(10, 11, ECHO_1X2, 0, 18);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(10, 10);
    expect(st.get(10, 10)).toBe(ECHO_1X2);
    expect(st.get(10, 11)).toBe(ECHO_1X2);
  });

  it('694 底半对（fy 36/54+底锚实心）→ 存活（num4=18*num 支,本批新增路径）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 12, STONE);
    st.setTileSilent(10, 10, ECHO_1X2, 0, 36);
    st.setTileSilent(10, 11, ECHO_1X2, 0, 54);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(10, 10);
    expect(st.get(10, 10)).toBe(ECHO_1X2);
    expect(st.get(10, 11)).toBe(ECHO_1X2);
  });

  it('694 顶半 frameY 异值（0/19）→ 整段杀（:39289 frameY 半边,旧缺此半边漏判）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 9, STONE);
    st.setTileSilent(10, 10, ECHO_1X2, 0, 0);
    st.setTileSilent(10, 11, ECHO_1X2, 0, 19);          // 应为 18
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(10, 10);
    expect(st.get(10, 10)).toBe(0);
    expect(st.get(10, 11)).toBe(0);
  });

  it('694 底半 frameY 异值（36/55）→ 整段杀', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 12, STONE);
    st.setTileSilent(10, 10, ECHO_1X2, 0, 36);
    st.setTileSilent(10, 11, ECHO_1X2, 0, 55);          // 应为 54
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    (g as unknown as { checkFurnitureSupport: (x: number, y: number) => void })
      .checkFurnitureSupport(10, 10);
    expect(st.get(10, 10)).toBe(0);
    expect(st.get(10, 11)).toBe(0);
  });
});
