// SW-BJ18 2026-09-07：ReplaceTile 原位重写守卫测试（保留面矩阵）。
// 标杆 = Terarria1457 WorldGen.cs ReplaceTile(:63061-63283) + Player.cs:40218 消费位；
// 设计文档 docs/block-swap-replacetile-sw-bj18.md（三表+集成图）。
// 本批刀：块换写面从 breakTile+place 两段写面换为 ReplaceTile 原位重写 1:1——
// F2 致动保持（全函数无 wire/inActive 写位）/F3 坡保留（CanPoundTile 以新 type 求值）/
// D2 篝火燃态（frameY>=36 → frameOffsetY 36）/D3 非空箱可换（无内容检查+实体存续）/
// D4 亡命箱信号（IsChestRigged→HitSwitch）/旧块掉落一次（includeLargeObjectDrops 面）/
// 邻接清除（ReplaceTileBreakUp/Down）/平台帧组合（:63116-63119 + SW-BJ10 平台面）。
// BJ12 门矩阵（C1/C5/C6/C7/A/B2）在此之上零重排——见 sw-bj12-block-swap-audit.test.ts。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { itemCombat } from '../src/data/vanillaItemCombat';

const TITANIUM_PICK = 1202;   // pick 190 ut 7（一击积累 ≥100）
const WOOD_V = 9;

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
function defByVid(vid: number): (typeof ITEM_DEFS)[number] {
  const d = ITEM_DEFS[iidOf(vid)];
  if (!d) throw new Error(`missing ITEM_DEFS for vid ${vid}`);
  return d;
}
/** 手持放置物 def：vi_ 真物品或 place_ 面板，按 tile 键查 */
function defForTile(tileKey: string): (typeof ITEM_DEFS)[number] {
  const d = ITEM_DEFS.find((x) => x.tile === tileKey
    && (x.key.startsWith('vi_') || x.key.startsWith('place_')));
  if (!d) throw new Error(`missing held item def for tile ${tileKey}`);
  return d;
}

interface Shell {
  world: World;
  player: Record<string, unknown> & {
    useTime: number;
    inv: { slots: unknown[]; heldItem(): unknown; removeHeld(n?: number): void; countOf(): number };   // SW-RB6a 2026-09-07：补 countOf 声明（tsc 零错基线）
  };
  drops: Array<[string, number]>;
  rig: Array<[number, number]>;
  tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
}

function shell(w: World, opts: {
  heldDef: (typeof ITEM_DEFS)[number];
  placeStyle?: number;
  picks?: Array<[vid: number, slot: number]>;
}): Shell {
  const drops: Array<[string, number]> = [];
  const rig: Array<[number, number]> = [];
  const acc = new Map<number, number>();
  const g = Object.create(Game.prototype) as unknown as Shell & Record<string, unknown>;
  g.world = w;
  (w as unknown as { seedFlags: Record<string, boolean> }).seedFlags = {};
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
  g.playSfxFile = () => {};
  g.playSfxFiles = () => {};
  g.wiring = { hitSwitch: (x: number, y: number) => { rig.push([x, y]); } };
  g.hitTiles = {
    addDamage(_tx: number, _ty: number, dmg: number, buf = 0): number {
      const v = (acc.get(buf) ?? 0) + dmg;
      acc.set(buf, v);
      return v;
    },
    getDamage(_tx: number, _ty: number, buf = 0): number { return acc.get(buf) ?? 0; },
    clear(_tx: number, _ty: number, buf = 0): void { acc.delete(buf); },
  };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  const heldId = ITEM_DEFS.indexOf(opts.heldDef);
  const slots: unknown[] = new Array(50).fill(null);
  for (const [vid, slot] of opts.picks ?? []) slots[slot] = { id: iidOf(vid), stack: 1 };
  g.player = {
    placeSpeedTileRaw: () => 1,   // ★SW-BJ59 后桩须携法(旧 Game 内联已迁 Player 委托;桩 buff/equipStats 空 ⇒ 恒 1)
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, usedAmbrosia: false,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 },
    equipStats: {},
    inv: {
      slots,
      countOf: () => 0,   // killTileShouldDropSeeds 吹管/吹枪门读面（无 → 不掷种子）
      heldItem: () => ({ id: heldId, stack: 9, ...(opts.placeStyle !== undefined ? { placeStyle: opts.placeStyle } : {}) }),
      removeHeld: () => {},
    },
  };
  g.drops = drops;
  g.rig = rig;
  return g;
}

/** 石地地面行 y=21,作业面 y=20 */
function mkWorld(): World {
  const w = new World(40, 40, 7, 'sw-bj18');
  for (let x = 2; x < 38; x++) w.store.setTileSilent(x, 21, TILE_BY_KEY['stone']);
  return w;
}

const WOOD_T = TILE_BY_KEY[defByVid(WOOD_V).tile ?? ''];
const CHEST21_T = TILE_BY_KEY['chest'];
const CHEST467_T = TILE_BY_KEY['v_467_chests_group_2'];
const CAMPFIRE_T = TILE_BY_KEY['v_215_campfires'];
const PLATFORM_T = TILE_BY_KEY['platform'];
const PLANT3_T = TILE_BY_KEY['v_3_forest_short_plants'];

// ============================================================
// F3 坡保留面（:63125-63134——CanPoundTile 以【新 type】求值;平台↔平台豁免）
// ============================================================
describe('F3 slope 保留面', () => {
  it('坡块换实心块：CanPoundTile 过门 → slope/half 原值保留（旧两段写清零=债）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['dirt']);
    st.slope[st.idx(9, 20)] = 2;
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
    expect(st.slope[st.idx(9, 20)]).toBe(2);       // 坡保留（vanilla :63130 flag=false 不清）
    expect(st.half[st.idx(9, 20)]).toBe(0);
  });

  it('上邻 ForbidsSloping（箱 21）→ CanPoundTile 拒 → slope 清零（:63130-63134）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['dirt']);
    st.slope[st.idx(9, 20)] = 2;
    // 箱体下缘格（锚 (9,18) 2×2 的底左格）压在 (9,19) = ForbidsSloping 集
    st.setTileSilent(9, 19, CHEST21_T, 0, 18);
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
    expect(st.slope[st.idx(9, 20)]).toBe(0);       // 拒整形 → slope(0)+halfBrick(false)
  });
});

// ============================================================
// F2 致动保持 + F1 漆清除（:63111-63151 全函数无 wire/inActive 写位；:63124 清块漆）
// ============================================================
describe('F2 致动/wire 位保持 + F1 漆清除', () => {
  it('已致动+挂件+红导线逐位保持;漆/块涂层清除（旧两段写经 setTile(0) 丢 WIRE_ACTUATED=债）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['dirt']);
    const i = st.idx(9, 20);
    st.wire[i] = TileStore.WIRE_ACTUATOR | TileStore.WIRE_ACTUATED | TileStore.WIRE_RED;
    st.paint[i] = 5;
    st.coat[i] = TileStore.COAT_INVISIBLE_BLOCK | TileStore.COAT_FULLBRIGHT_BLOCK;
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(st.type[i]).toBe(WOOD_T);
    expect(st.wire[i]).toBe(TileStore.WIRE_ACTUATOR | TileStore.WIRE_ACTUATED | TileStore.WIRE_RED);
    expect(st.paint[i]).toBe(0);                   // :63124 ClearBlockPaintAndCoating
    expect(st.coat[i]).toBe(0);                    // 方块侧两位清,墙侧不动（本格未设）
  });

  it('未致动格换后保持未致动（wire=0 → 0）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['dirt']);
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(st.wire[st.idx(9, 20)]).toBe(0);
  });
});

// ============================================================
// D3 非空箱可换（反证：ReplaceTile/WouldTileReplacementWork 无内容检查;实体存续）
// ============================================================
describe('D3 非空箱可换 + 箱实体存续', () => {
  it('非空箱 21→467：4 格原位重写、实体与内容保留、旧箱物品掉一次（点击右下格=锚归一）', () => {
    const w = mkWorld();
    const st = w.store;
    // 箱 21 style0 锚 (9,19)：右下格 (10,20) fx=18/fy=18
    st.setTileSilent(9, 19, CHEST21_T, 0, 0);
    st.setTileSilent(10, 19, CHEST21_T, 18, 0);
    st.setTileSilent(9, 20, CHEST21_T, 0, 18);
    st.setTileSilent(10, 20, CHEST21_T, 18, 18);
    (w.chests as unknown[]).push({
      x: 9, y: 19,
      items: Array.from({ length: 40 }, (_, k) => (k === 0 ? { id: iidOf(WOOD_V), stack: 5 } : null)),
    });
    const g = shell(w, { heldDef: defForTile('v_467_chests_group_2'), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(10, 20, defForTile('v_467_chests_group_2'));   // 点击右下格 → MoveReplaceTileAnchor 归一 (9,19)
    // 4 格全部 467 style0 帧（frameX=dx*18 / frameY=dy*18）
    expect(st.get(9, 19)).toBe(CHEST467_T);
    expect(st.get(10, 19)).toBe(CHEST467_T);
    expect(st.get(9, 20)).toBe(CHEST467_T);
    expect(st.get(10, 20)).toBe(CHEST467_T);
    expect(st.frameX[st.idx(10, 20)]).toBe(18);
    expect(st.frameY[st.idx(10, 20)]).toBe(18);
    // 实体存续 + 内容保留（旧两段写经 dumpChest/shouldTileSurvive 整链=债）
    const chest = (w.chests as Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>)[0];
    expect(chest.x).toBe(9);
    expect(chest.y).toBe(19);
    expect(chest.items[0]).toEqual({ id: iidOf(WOOD_V), stack: 5 });
    // 旧箱物品一次（GetItemDrop_Chests style0 = 箱 48）
    expect(g.drops).toEqual([['vi_48_Chest', 1]]);
  });
});

// ============================================================
// D4 亡命箱布线信号（:63089-63093 IsChestRigged(:36127) → Wiring.HitSwitch(anchor)）
// ============================================================
describe('D4 亡命箱信号', () => {
  it('467 style4（frameX/36==4）交换 → HitSwitch 在锚格触发,帧重写为目标 style', () => {
    const w = mkWorld();
    const st = w.store;
    // 亡命箱 467 style4 锚 (9,19)：frameX = 4*36 + dx*18
    st.setTileSilent(9, 19, CHEST467_T, 144, 0);
    st.setTileSilent(10, 19, CHEST467_T, 162, 0);
    st.setTileSilent(9, 20, CHEST467_T, 144, 18);
    st.setTileSilent(10, 20, CHEST467_T, 162, 18);
    (w.chests as unknown[]).push({ x: 9, y: 19, items: Array(40).fill(null) });
    const g = shell(w, { heldDef: defForTile('v_467_chests_group_2'), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(10, 20, defForTile('v_467_chests_group_2'));   // style0（异 style → 族段放行）
    expect(g.rig).toEqual([[9, 19]]);              // HitSwitch(topLeft)（:63090-63092）
    expect(st.frameX[st.idx(9, 19)]).toBe(0);      // style0 重写
    expect(st.frameX[st.idx(10, 20)]).toBe(18);
    expect(st.get(9, 19)).toBe(CHEST467_T);
    // 旧亡命箱物品（GetItemDrop_Chests secondType style4 = 3988）
    expect(g.drops).toEqual([['vi_3988_DeadMansChest', 1]]);
  });
});

// ============================================================
// D2 篝火燃态（:63100-63103 frameY>=36 → frameOffsetY=36）
// ============================================================
describe('D2 篝火燃态跨交换保留', () => {
  it('未燃 style0→style1：frameY=dy*18;已燃：frameY=36+dy*18（3×2 全格）', () => {
    const mk = (lit: boolean) => {
      const w = mkWorld();
      const st = w.store;
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          st.setTileSilent(9 + dx, 19 + dy, CAMPFIRE_T, dx * 18, dy * 18 + (lit ? 36 : 0));
        }
      }
      const g = shell(w, { heldDef: defForTile('v_215_campfires'), placeStyle: 1, picks: [[TITANIUM_PICK, 5]] });
      g.tryPlace(10, 19, defForTile('v_215_campfires'));   // 点击中上格 → 锚归一 (9,19)
      return { st, g };
    };
    const unlit = mk(false);
    expect(unlit.st.get(9, 19)).toBe(CAMPFIRE_T);
    expect(unlit.st.frameX[unlit.st.idx(11, 20)]).toBe(54 + 2 * 18);   // style1*(3*18)+dx*18
    expect(unlit.st.frameY[unlit.st.idx(11, 20)]).toBe(18);            // dy*18 + 0
    const lit = mk(true);
    expect(lit.st.frameY[lit.st.idx(11, 20)]).toBe(36 + 18);           // 燃态 offset 36 保留
    expect(lit.st.frameX[lit.st.idx(9, 19)]).toBe(54);
  });
});

// ============================================================
// 尘量分型档（★SW-RB6a 2026-09-07：KillTile_GetTileDustAmount(fail:false)
// :67119-67207——苔石族 5/回声块 1,曾写死 10）
// ============================================================
describe('尘量分型档（fail:false 档）', () => {
  function dustOf(tileKey: string): number {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY[tileKey]);
    const seen: Array<number> = [];
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    (g as unknown as { spawnParticles: (...a: unknown[]) => void }).spawnParticles
      = (...a: unknown[]) => { seen.push(a[3] as number); };
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(seen.length).toBeGreaterThanOrEqual(1);
    return Math.max(...seen);
  }
  it('普通块（泥土）缺省 10 粒（:67123-67128）', () => {
    expect(dustOf('dirt')).toBe(10);
  });
  it('苔石族 534 = 5 粒（:67189-67195,fail 档 3 不适用）', () => {
    expect(dustOf('v_534_krypton_moss_block')).toBe(5);
  });
  it('回声块 541 = 1 粒（:67141-67143）', () => {
    expect(dustOf('v_541_echo_block')).toBe(1);
  });
});

// ============================================================
// 旧块掉落一次（:63079 KillTile_DropItems includeLargeObjectDrops 面,单格=普通块）
// ============================================================
describe('旧块掉落一次', () => {
  it('石→木：恰好一次掉落（vi_3 石块）,无重复/无 place_v 兜底双掉', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['stone']);
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
    expect(g.drops).toEqual([['vi_3_StoneBlock', 1]]);
  });
});

// ============================================================
// 平台帧组合（:63116-63119 frameY=style*18 + SW-BJ10 squareTileFramePlatform 平台面）
// ============================================================
describe('平台换平台帧', () => {
  it('platform style0→style1：frameY=18（连接帧由 squareTileFramePlatform 重算）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, PLATFORM_T, 0, 0);
    const g = shell(w, { heldDef: defForTile('platform'), placeStyle: 1, picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defForTile('platform'));
    expect(st.type[st.idx(9, 20)]).toBe(PLATFORM_T);
    expect(st.frameY[st.idx(9, 20)]).toBe(18);     // :63116-63119（旧两段写=通用放置重铺,帧同——此格锁定原位重写路径）
  });
});

// ============================================================
// 邻接清除（:63113 ReplaceTile_EliminateNaturalExtras → BreakUp 表）
// ============================================================
describe('EliminateNaturalExtras', () => {
  it('上邻短草（BreakUp sheet 3）→ 单格重写前 KillTile 清除', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['dirt']);
    st.setTileSilent(9, 19, PLANT3_T, 0, 0);
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
    expect(st.get(9, 19)).toBe(0);                 // BreakUp 上邻清除（:63157-63160）
  });
});

// ============================================================
// 尾奏（vanilla :40221-40226）：消耗 + 双段冷却合并（SetItemTime num4+num5）
// ============================================================
describe('成功拍尾奏', () => {
  it('冷却 = 方块段+镐段（钛镐 7+木 10=17）;不再回落通用放置链（无重复掉落/重复消耗）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, TILE_BY_KEY['dirt']);
    const g = shell(w, { heldDef: defByVid(WOOD_V), picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defByVid(WOOD_V));
    // SetItemTime(num4+num5)：方块段（木 useTime 10×tileSpeed 1）+ 镐段（钛镐 7×pickSpeed 1）
    expect(g.player.useTime).toBe((itemCombat(WOOD_V)?.useTime ?? 14) + (itemCombat(TITANIUM_PICK)?.useTime ?? 0));
    expect(g.drops).toHaveLength(1);               // 恰一次旧块掉落（无回落链二次写面）
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
  });
});
