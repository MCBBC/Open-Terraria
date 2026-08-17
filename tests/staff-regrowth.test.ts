// 再生法杖全链（2026-08-17 用户报障"再生法杖没效果"）：
//   根因 = vi_213 createTile=2（草 tile）走通用"铺空格"放置，而原版语义是
//   【转化已有块】（BlockPlacementForAssortedThings :40379-40440）→ 指向泥土
//   时目标格非空 → 通用路径静默 return = 无效果。
//   修：草族转化放置（法杖可转泥土/石/灰砖；种子各族按表）+ 药草采收全链
//   （case 83/84 掉落 1:1 + 法杖加成 + 盆栽补种 + 挥割加成）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS, T } from '../src/data/tiles';
import { ITEM_DEFS } from '../src/data/items';
import { Game } from '../src/core/Game';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

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
  tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
  interactAt(tx: number, ty: number): void;
  cutTile(x: number, y: number): void;
  breakTile(x: number, y: number, byPlayer?: boolean): void;
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
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28, facing: 1, useTime: 0,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0, slots: new Array(50).fill(null),
      heldItem: () => (heldVid ? { id: heldItemIdOf(heldVid), stack: 5 } : null),
      removeAt: () => {},
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

const DIRT = TILE_BY_KEY['dirt'];       // sheet 0
const STONE = TILE_BY_KEY['stone'];     // sheet 1
const GRASS = T.GRASS;                  // sheet 2

function col(w: World, sheet: number, x = 10, y = 20): World {
  const key = TILE_DEFS.find((d) => d.vanilla?.sheet === sheet)?.key;
  w.store.setTileSilent(x, y, key ? TILE_BY_KEY[key] : 1, 0, 0);
  return w;
}

describe('再生法杖/草族转化放置（BlockPlacementForAssortedThings :40379-40440）', () => {
  it('法杖 213：泥土/石头/灰砖 → 草（createTile=2 的"凭空种草"）', () => {
    for (const sheet of [0, 1, 38]) {
      const drops: Array<[string, number]> = [];
      const w = col(new World(30, 40, 15, 'open'), sheet);
      const g = shell(w, drops, 213);
      g.tryPlace(10, 20, defOf(213));
      expect(w.store.get(10, 20), `sheet ${sheet}`).toBe(GRASS);
      expect(drops.length, '法杖非消耗无掉落').toBe(0);
    }
  });

  it('草种子 62：泥土→草 ✓ / 石头 ✗（非法杖仅泥土）', () => {
    const d1: Array<[string, number]> = [];
    const w1 = col(new World(30, 40, 15, 'open'), 0);
    shell(w1, d1, 62).tryPlace(10, 20, defOf(62));
    expect(w1.store.get(10, 20)).toBe(GRASS);
    const d2: Array<[string, number]> = [];
    const w2 = col(new World(30, 40, 15, 'open'), 1);
    shell(w2, d2, 62).tryPlace(10, 20, defOf(62));
    expect(w2.store.get(10, 20)).not.toBe(GRASS);   // 石头不转（需法杖）
  });

  it('腐化种子 59 → 泥或泥土；丛林种子 62 族 → 泥（:40438-40440）', () => {
    const w = col(new World(30, 40, 15, 'open'), 59);   // 泥
    shell(w, [], 59).tryPlace(10, 20, defOf(59));
    const got = TILE_DEFS[w.store.get(10, 20)]?.vanilla?.sheet;
    expect(got).toBe(23);                               // 腐化草
  });

  it('八向暴露门：完全埋死的泥土不可转（exposed8）', () => {
    const w = new World(30, 40, 15, 'open');
    // (10,20) 四周+四角全实心
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      if (ox === 0 && oy === 0) w.store.setTileSilent(10, 20, DIRT, 0, 0);
      else w.store.setTileSilent(10 + ox, 20 + oy, STONE, 0, 0);
    }
    shell(w, [], 213).tryPlace(10, 20, defOf(213));
    expect(w.store.get(10, 20)).toBe(DIRT);             // 未转化
  });
});

describe('药草采收全链（case 83/84 :65726-65750 + 法杖）', () => {
  const HERB_M = TILE_BY_KEY['v_83_herbs_mature'];
  const HERB_B = TILE_BY_KEY['v_84_herbs_bloom'];

  it('右键采收开花 84：草药+种子（1:1 掉落；修复仅掉 1 种子/无草药）', () => {
    const drops: Array<[string, number]> = [];
    const w = new World(30, 40, 15, 'open');
    w.store.setTileSilent(10, 20, HERB_B, 0 * 18, 0);       // style 0 日耀草
    shell(w, drops).interactAt(10, 20);
    const herb = drops.filter(([k]) => k === VANILLA_ITEM_KEY_BY_ID[313]).reduce((a, [, n]) => a + n, 0);
    const seed = drops.filter(([k]) => k === VANILLA_ITEM_KEY_BY_ID[307]).reduce((a, [, n]) => a + n, 0);
    expect(herb).toBe(1);                                   // 草药 313 ×1
    expect(seed).toBeGreaterThanOrEqual(1);                 // 种子 1-3
    expect(seed).toBeLessThanOrEqual(3);
    expect(w.store.get(10, 20)).toBe(0);
  });

  it('成熟 83 时辰门：白天采日耀草(style0)✓ / 白天采月光花(style1)✗', () => {
    const d1: Array<[string, number]> = [];
    const w1 = new World(30, 40, 15, 'open');
    w1.clock.timeOfDay = 0.5;                               // 正午
    w1.store.setTileSilent(10, 20, HERB_M, 0, 0);           // 日耀草 昼
    shell(w1, d1).interactAt(10, 20);
    expect(w1.store.get(10, 20)).toBe(0);                   // 可采
    const d2: Array<[string, number]> = [];
    const w2 = new World(30, 40, 15, 'open');
    w2.clock.timeOfDay = 0.5;
    w2.store.setTileSilent(10, 20, HERB_M, 1 * 18, 0);      // 月光花 夜
    shell(w2, d2).interactAt(10, 20);
    expect(w2.store.get(10, 20)).toBe(HERB_M);              // 不可采：原样保留
  });

  it('法杖加成 + 盆栽补种（TryReplantingHerbs：below 78 → 回种 82 苗）', () => {
    const drops: Array<[string, number]> = [];
    const w = new World(30, 40, 15, 'open');
    w.clock.timeOfDay = 0.5;
    w.store.setTileSilent(10, 20, HERB_B, 0, 0);
    w.store.setTileSilent(10, 21, TILE_BY_KEY['clay_pot'], 0, 0);   // 陶盆 78
    shell(w, drops, 213).interactAt(10, 20);
    const herb = drops.filter(([k]) => k === VANILLA_ITEM_KEY_BY_ID[313]).reduce((a, [, n]) => a + n, 0);
    const seed = drops.filter(([k]) => k === VANILLA_ITEM_KEY_BY_ID[307]).reduce((a, [, n]) => a + n, 0);
    expect(herb).toBeGreaterThanOrEqual(1);
    expect(herb).toBeLessThanOrEqual(2);                    // Next(1,3)
    expect(seed).toBeGreaterThanOrEqual(1);
    expect(seed).toBeLessThanOrEqual(5);                    // Next(1,6)
    expect(w.store.get(10, 20)).toBe(TILE_BY_KEY['v_82_herbs_sprout']);   // 补种苗
    expect(w.store.frameX[w.store.idx(10, 20)]).toBe(0);    // style 0 帧
  });

  it('砍取（breakTile 链）：开花 84 掉草药；法杖持有 → 加成', () => {
    // 无加成
    const d1: Array<[string, number]> = [];
    const w1 = new World(30, 40, 15, 'open');
    w1.store.setTileSilent(10, 20, HERB_B, 3 * 18, 0);      // 死亡草
    shell(w1, d1).cutTile(10, 20);
    expect(d1.some(([k]) => k === VANILLA_ITEM_KEY_BY_ID[316])).toBe(true);   // 死亡草 316
    expect(d1.some(([k]) => k === VANILLA_ITEM_KEY_BY_ID[310])).toBe(true);   // 死亡草种 310
    // 法杖加成（cutTile 挥割置位 → breakTile 消费）
    const d2: Array<[string, number]> = [];
    const w2 = new World(30, 40, 15, 'open');
    w2.store.setTileSilent(10, 20, HERB_B, 3 * 18, 0);
    shell(w2, d2, 213).cutTile(10, 20);
    const seed = d2.filter(([k]) => k === VANILLA_ITEM_KEY_BY_ID[310]).reduce((a, [, n]) => a + n, 0);
    expect(seed).toBeLessThanOrEqual(5);                    // Next(1,6) 上界
  });
});
