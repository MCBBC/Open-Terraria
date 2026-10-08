// BJ562 再生法杖两症状（2026-10-08 用户实报）：
//   ①收获支失效：1457 活性收获面 = BlockPlacementForAssortedThings 尾臂
//     （Player.cs:41595-41614）——法杖【左键使用】对 tile 3/73/84（或 83 且
//     IsAlchemyPlantHarvestable）→ KillTile（staffOfRegrowthBonus=true ⇒ case 83/84
//     掉落 草 ×Next(1,3)+种子 ×Next(1,6)，WorldGen.cs:66205-66213）+ 84/83 杀成后
//     TryReplantingHerbs（:46213）。本仓此前只挂了右键 QoL 镜像，左键使用面整缺
//     ⇒ 「无法收获草药」。
//   ②空地放草块：AssortedThings staff 支 canPlace 读裸 type∈{0,1,38}（:41364-41370）
//     被误当净效应，但后续 PlaceTile(2) 内门 `num==2 && (tile.type!=0 ||
//     !tile.active())`（WorldGen.cs:59876）恒拒空格/石/灰砖 ⇒ 原版净 no-op；
//     「石/灰砖→苔藓」只存在于 PlaceThing_Tiles_PlaceIt_StaffOfRegrowthCheck——
//     1457 反编译零调用点=死代码（1456 :40247 / 1458 :41222 同谳）。
//     本仓 tryGrassConvert 曾按 canPlace 面直写 setTile ⇒ 「空地放草块」。
//   落刀：tryGrassConvert 补收获支（3/73/84 + 83 时辰门 + 加成 + 补种）+
//     促草支收窄为【plain-active 泥土】+ 法杖射程门（:40034 IsInTileInteractionRange）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS, T } from '../src/data/tiles';
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
}

function shell(w: World, drops: Array<[string, number]>, heldVid = 0): Shell {
  const g = Object.create(Game.prototype) as unknown as Shell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [] };
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
      countOf: () => 0,   // killTileShouldDropSeeds 吹管/吹枪普查桩（73/3 掉种面）
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
const TALL = 'v_73_forest_tall_plants';
const SHORT = 'v_3_forest_short_plants';

function totalOf(drops: Array<[string, number]>, vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  return drops.filter(([k]) => k === key).reduce((a, [, n]) => a + n, 0);
}

describe('BJ562 收获支（AssortedThings 尾臂 Player.cs:41595-41614 1:1——左键使用面）', () => {
  it('开花 84 + 法杖：加成收获（草 ×Next(1,3)∈[1,2] + 种子 ×Next(1,6)∈[1,5]），格清空，加成旗复位', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 0);   // style 0 日耀草（84 恒可收）
    const g = shell(w, drops, 213);
    g.tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(0);
    const herb = totalOf(drops, 313);
    expect(herb).toBeGreaterThanOrEqual(1);                 // Next(1,3)
    expect(herb).toBeLessThanOrEqual(2);
    const seed = totalOf(drops, 307);
    expect(seed).toBeGreaterThanOrEqual(1);                 // Next(1,6)
    expect(seed).toBeLessThanOrEqual(5);
    expect(g._staffHarvestBonus).toBe(false);               // :41678 尾复位（防泄露）
  });

  it('成熟 83 时辰门：昼+日耀草(style0)→加成收获；昼+月光花(style1)→原版 no-op（不收获不转化）', () => {
    const d1: Array<[string, number]> = [];
    const w1 = new World(30, 40, 15, 'open');
    w1.clock.timeOfDay = 0.5;                               // 正午（isDay）
    col(w1, HERB_M, 10, 20, 0);
    shell(w1, d1, 213).tryPlace(10, 20, defOf(213));
    expect(w1.store.get(10, 20)).toBe(0);
    expect(totalOf(d1, 313)).toBeGreaterThanOrEqual(1);
    expect(totalOf(d1, 313)).toBeLessThanOrEqual(2);

    const d2: Array<[string, number]> = [];
    const w2 = new World(30, 40, 15, 'open');
    w2.clock.timeOfDay = 0.5;
    col(w2, HERB_M, 10, 20, 1 * 18);                        // 月光花 style1 昼不可收
    shell(w2, d2, 213).tryPlace(10, 20, defOf(213));
    expect(w2.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_M]); // 原样保留
    expect(d2.length).toBe(0);
  });

  it('未成熟 82：不在尾臂受理面 → 零行为（tile 82 ∌ {3,73,84,83}）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_S);
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_S]);
    expect(drops.length).toBe(0);
  });

  it('tile 分派 73/3：花草株臂 → KillTile（清格；掉落=killTileDropItems 既有域）', () => {
    for (const key of [TALL, SHORT]) {
      const drops: Array<[string, number]> = [];
      const w = col(new World(30, 40, 15, 'open'), key);
      shell(w, drops, 213).tryPlace(10, 20, defOf(213));
      expect(w.store.get(10, 20), key).toBe(0);
    }
  });

  it('盆栽补种（TryReplantingHerbs :46213）：84 下方陶盆 78 → 回种 82 苗（style 帧同源）', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B, 10, 20, 2 * 18);   // 闪烁根 style2
    w.store.setTileSilent(10, 21, TILE_BY_KEY['clay_pot'], 0, 0);
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_S]);
    expect(w.store.frameX[w.store.idx(10, 20)]).toBe(2 * 18);
  });

  it('收获支只认法杖（flag=HeldItem 213/5295）：草种 62 对药草格 → 零行为', () => {
    const drops: Array<[string, number]> = [];
    const w = col(new World(30, 40, 15, 'open'), HERB_B);
    shell(w, drops, 62).tryPlace(10, 20, defOf(62));
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY[HERB_B]);
    expect(drops.length).toBe(0);
  });
});

describe('BJ562 促草支（定谳收窄：净效应=仅 plain-active 泥土；空地零行为=症状②判别面）', () => {
  it('空地（无块）：零行为——canPlace(type 0) 真而 PlaceTile(2) 内门 :59876 恒拒', () => {
    const drops: Array<[string, number]> = [];
    const w = new World(30, 40, 15, 'open');
    shell(w, drops, 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(0);
    expect(drops.length).toBe(0);
  });

  it('石(1)/灰砖(38)/泥(59)：零行为（StaffOfRegrowthCheck 死代码,1457 零调用点）', () => {
    for (const key of ['stone', 'gray_brick', 'mud']) {
      const w = col(new World(30, 40, 15, 'open'), key);
      shell(w, [], 213).tryPlace(10, 20, defOf(213));
      expect(w.store.get(10, 20), key).toBe(TILE_BY_KEY[key]);
    }
  });

  it('活跃泥土→草（唯一净转化面，保活性语义不变）', () => {
    const w = col(new World(30, 40, 15, 'open'), 'dirt');
    shell(w, [], 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(T.GRASS);
  });
});
