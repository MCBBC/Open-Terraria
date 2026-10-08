// ★BJ577（2026-10-09 用户复报「再生法杖采摘草药时会又种下种子」定谳）：
//
// 定谳（原版 1457 亲读,编译反编译=唯一标杆）——用户观察 = 原版 1.4.4+ 自动补种 QoL，
// 非本仓偏差（结论 A 主体,销案答询）：
//   · 法杖收获链只在 PlaceThing 面（Player.cs:41582 `flag = staffOfRegrowthBonus`
//     尾臂 :41595-41614）：flag 真（:41358-41361 持 213/5295 置位）且目标 plain
//     active → tile 3/73/84（或 83 且 IsAlchemyPlantHarvestable :41606）→ KillTile
//     （staffOfRegrowthBonus 在位 → case 83/84 掉落 草×Next(1,3)+种子×Next(1,6),
//     WorldGen.cs:66205-66211——种子=地上掉落物）；杀成且 84（:41599）/83（:41610）
//     → TryReplantingHerbs（:46213-46219）：下方基座 plain active ∈{78 陶盆,380 种植箱,
//     579 石魔像头} → PlaceTile(82,style)（=PlaceAlch 写回 82 幼苗 tile,frameX=18×style,
//     WorldGen.cs:45864-45869）——回种的是【草株 tile】非种子物品,零消耗。
//   · 三件并存观感（收获→地上种子+原格回芽）=原版本相;普通收获（镐/弹割）无回种
//     （TryReplantingHerbs 全树仅 :41599/:41610 两调用点,均在法杖 PlaceThing 面）。
//   · 挥击面不割药草：GetTileCutIgnoreList(allowRegrowth=true)（:44992-45014）→
//     TileCutIgnore.Regrowth（TileID.cs:88 含 82/83/84+花草族）→ 法杖挥割/MowTheLawn
//     (:20493 传 HeldItem) 对药草零作用。
// 本批连带落刀（同链掉落/割切面对拍出的三处偏差）：
//   S1 Game.cutTile（弹域割切）曾按「手持法杖」置 _staffHarvestBonus —— vanilla 置位
//      点仅 :41360（PlaceThing 面）/:45021（ItemCheck_CutTiles 玩家挥割）,弹域
//      Projectile.CutTilesAt 全程不触该旗 → 弹割药草越权加成（草×1-2+种子×1-5）。
//   S2 掉落面种子门曾单挂 harvestable —— vanilla bonus 臂【先于】else-if(harvestable)
//      且无 flag 检查（66206-66216）→ 门=bonus ∨ 收获性（WorldEvolution.ts:604-606
//      同构背书;现位可达面 harvestable 恒真,净行为不变,按原式逐字镜像）。
//   S3 Game.mowCutTiles（MowTheLawn）缺 held 法杖 Regrowth 忽略表 —— :20493
//      GetTileCutIgnoreList(HeldItem) → 持杖推割草机不割药草;本仓曾割。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Game } from '../src/core/Game';

interface Shell {
  world: World; chunks: { markDirtyArea: () => void };
  player: unknown; net?: unknown; sfx: { play: () => void };
  cb: { onInventoryChanged: () => void };
  input: { rightDown: boolean };
  _staffHarvestBonus: boolean;
  spawnDrop: (x: number, y: number, key: string, n: number) => void;
  spawnParticles: () => void;
  scene?: unknown;
  critterVid: () => number;
  spawnNpcByVanilla: () => null;
  entities: { critters: unknown[] };
  achievements: { notifyTileDestroyed: () => void; handleMining: () => void };
  smartCursor: { lockedContinuity: unknown; showing: boolean; x: number; y: number };
  tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
  cutTile(x: number, y: number, vid?: number, extra?: boolean): void;
  mowCutTiles(rx: number, ry: number, rw: number, rh: number, heldVid?: number): void;
}

function shell(w: World, drops: Array<[string, number]>, heldVid = 0): Shell {
  const g = Object.create(Game.prototype) as unknown as Shell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [] };
  (g as unknown as { swingTileCutSet: Set<number> }).swingTileCutSet = new Set<number>();   // 挥击砍切去重表
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.spawnDrop = (_x, _y, key, n) => { drops.push([key, n]); };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28, facing: 1, useTime: 0,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, equipStats: {},
    inv: {
      selected: 0, slots: new Array(50).fill(null),
      isItemSlotUnlockedAndUsable: () => false,
      heldItem: () => (heldVid ? { id: heldItemIdOf(heldVid), stack: 5 } : null),
      removeAt: () => {},
      removeHeld: () => {},
      countOf: () => 0,
    },
  };
  return g;
}

// ★ITEM_DEFS 的 id = 数组索引（item() 不写 id 字段）
let cachedVidToId: Record<number, number> | null = null;
function heldItemIdOf(vid: number): number {
  if (!cachedVidToId) {
    cachedVidToId = {};
    ITEM_DEFS.forEach((d, i) => {
      const m = /^vi_(\d+)_/.exec(d.key);
      if (m) cachedVidToId![+m[1]] = i;
    });
  }
  return cachedVidToId[vid] ?? -1;
}

function defOf(vid: number) {
  return ITEM_DEFS[heldItemIdOf(vid)];
}

function col(w: World, key: string, x = 10, y = 20, fx = 0): World {
  w.store.setTileSilent(x, y, TILE_BY_KEY[key], fx, 0);
  return w;
}

const HERB_M = 'v_83_herbs_mature';
const HERB_B = 'v_84_herbs_bloom';
const HERB_S = 'v_82_herbs_sprout';
const CLAY = 'clay_pot';
const PLANTER = 'v_380_planter_boxes';
const GOLEM_HEAD = 'v_579_rock_golem_head';
const GRASS_T = TILE_INTERNAL_BY_SHEET.get(2)!;   // style0 白名单基座（非盆器 → 外门判别面）

function totalOf(drops: Array<[string, number]>, vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  return drops.filter(([k]) => k === key).reduce((a, [, n]) => a + n, 0);
}

function withRand(v: number, fn: () => void): void {
  const orig = Math.random;
  Math.random = () => v;
  try { fn(); } finally { Math.random = orig; }
}

describe('BJ577 销案答询组：收获三件并存 = 掉落（草+地上种子）+ 回种 82 苗（原版补种 QoL）', () => {
  it('盆栽开花草法杖收获：掉落非空 + 原格=82 苗同 style（:41590 KillTile + :41599 TryReplantingHerbs :46213）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 2 * 18);   // 闪烁根 style2
    w.store.setTileSilent(10, 21, TILE_BY_KEY[CLAY], 0, 0);
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    // 三件并存：① 地上掉落（草+种子物品,加成掷 1-2/1-5）
    expect(totalOf(drops, 315)).toBeGreaterThanOrEqual(1);                  // Blinkroot=315
    expect(totalOf(drops, 309)).toBeGreaterThanOrEqual(1);                  // Blinkroot Seeds=309
    expect(totalOf(drops, 315)).toBeLessThanOrEqual(2);
    expect(totalOf(drops, 309)).toBeLessThanOrEqual(5);
    // ② 原格回种=82 幼苗 tile（非种子物品、零消耗）
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_S]);
    expect(w.store.frameX[w.store.idx(10, 20)]).toBe(2 * 18);               // PlaceAlch frameX=18×style
  });

  it('种植箱 380 基座同面回种（:46215 基座白名单 {78,380,579}）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 3 * 18);   // 死亡草 style3
    w.store.setTileSilent(10, 21, TILE_BY_KEY[PLANTER], 0, 0);
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_S]);
    expect(w.store.frameX[w.store.idx(10, 20)]).toBe(3 * 18);
  });

  it('自然基座（草,style0 白名单内非盆器）：掉落有、零回种——TryReplantingHerbs 外门拒', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
    w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(0);                                    // 收获成功
    expect(totalOf(drops, 313)).toBeGreaterThanOrEqual(1);                  // Daybloom 掉落
    // 下方 grass(2) ∉ {78,380,579} → 不回种（若外门被删,placeAlchRuntime style0
    // 白名单含 grass → 会误回种 = 本判别面）
  });

  it('579 石魔像头基座：外门过、PlaceAlch per-style 白名单（:45794-45856 无 579）拒 → 零回种', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
    w.store.setTileSilent(10, 21, TILE_BY_KEY[GOLEM_HEAD], 0, 0);
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(0);                                    // 净原版=不回种
    expect(totalOf(drops, 313)).toBeGreaterThanOrEqual(1);
  });

  it('非法杖收获（弹域 cutTile）零回种（TryReplantingHerbs 全树仅法杖 PlaceThing 面 :41599/:41610 两调用点）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
    w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
    shell(w, drops, 213).cutTile(10, 20);
    expect(w.store.get(10, 20)).toBe(0);                                    // 弹割成功
    expect(totalOf(drops, 313)).toBeGreaterThanOrEqual(1);
  });

  it('83 时辰窗外（昼×月光花 style1）+ 法杖：零收获零回种（:41606 IsAlchemyPlantHarvestable 门）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_M, 10, 20, 1 * 18);
    w.store.setTileSilent(10, 21, TILE_BY_KEY[CLAY], 0, 0);
    w.clock.timeOfDay = 0.5;                                                // 正午
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_M]);                  // 原样
    expect(drops.length).toBe(0);
  });
});

describe('BJ577-S1 弹域零加成（cutTile 曾按持杖置 _staffHarvestBonus = 越权加成面）', () => {
  it('held 213 + 弹割开花 84（泥土基座可割）r=0.9999：草=1、种子=3（非加成 Next(1,4) 顶格;旧码=草2/种子5 必红）', () => {
    withRand(0.9999, () => {
      const drops: Array<[string, number]> = [];
      const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
      w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
      shell(w, drops, 213).cutTile(10, 20);
      expect(w.store.get(10, 20)).toBe(0);
      expect(totalOf(drops, 313)).toBe(1);                    // 非加成：草×1（加成臂=1-2）
      expect(totalOf(drops, 307)).toBe(3);                    // 非加成 Next(1,4) 顶格（加成臂=1-5）
    });
  });

  it('弹割面 bonus 旗恒不复位泄露：cutTile 后 _staffHarvestBonus === false', () => {
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
    w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
    const g = shell(w, [], 213);
    g.cutTile(10, 20);
    expect(g._staffHarvestBonus).toBe(false);
  });
});

describe('BJ577-S3 割草机持杖（MowTheLawn :20493 GetTileCutIgnoreList(HeldItem) → TileCutIgnore.Regrowth :88）', () => {
  it('mowCutTiles heldVid=213 扫过开花 84（草基座,非 CanCutTile 拒位）：格原样、零掉落', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
    w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
    shell(w, drops, 213).mowCutTiles(6 * 16, 19 * 16, 80, 20, 213);   // 列 6..11 行 19..20 覆盖 (10,20)
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_B]);            // 药草全阶 ∈ Regrowth 表 → 保护
    expect(drops.length).toBe(0);
  });

  it('heldVid 缺省（非杖）：同矩形割除+掉落（判别面——保护只认 held 213/5295）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
    w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
    shell(w, drops, 0).mowCutTiles(6 * 16, 19 * 16, 80, 20);
    expect(w.store.get(10, 20)).toBe(0);
    expect(totalOf(drops, 313)).toBeGreaterThanOrEqual(1);
  });
});

describe('BJ577-S2 掉落面 bonus-first 镜像（66206-66211 bonus 臂先于 else-if harvestable、无 flag 检查）', () => {
  it('83 时辰窗内（昼×日耀草 style0）+ 法杖 r=0.9999：草=2、种子=5（bonus 臂在 83 面同效）', () => {
    withRand(0.9999, () => {
      const drops: Array<[string, number]> = [];
      const w = col(new World(30, 40, 15, 'open'), HERB_M, 10, 20, 0);
      w.clock.timeOfDay = 0.5;
      shell(w, drops, 213).tryPlace(10, 20, defOf(213));
      expect(w.store.get(10, 20)).toBe(0);
      expect(totalOf(drops, 313)).toBe(2);                  // Next(1,3) 顶格
      expect(totalOf(drops, 307)).toBe(5);                  // Next(1,6) 顶格（bonus 门 ∨ 收获性）
    });
  });

  it('非加成收获性掉种 Next(1,4)（r=0.9999 → 种子=3,加成/非加成两臂乘数判别）', () => {
    withRand(0.9999, () => {
      const drops: Array<[string, number]> = [];
      const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);
      w.store.setTileSilent(10, 21, GRASS_T, 0, 0);
      shell(w, drops, 0).cutTile(10, 20);                   // 无杖弹割：bonus=false
      expect(totalOf(drops, 313)).toBe(1);
      expect(totalOf(drops, 307)).toBe(3);                  // 1+⌊0.9999×3⌋（Next(1,4)）
    });
  });
});
