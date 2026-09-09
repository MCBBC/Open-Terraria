// SW-RB9c 临时探针：熔炉/平台/失撑交互（跑完即删）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';

const HF_KEY = 'place_v_77_hellforge';
const HF_TILE = TILE_BY_KEY['v_77_hellforge']!;
const HF_ITEM = ITEM_DEFS[ITEM_BY_KEY[HF_KEY]!];

interface Drop { key: string; x: number; y: number; n: number }

function shell(w: World, drops: Drop[]) {
  let stack = 5;
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    tryPlace(tx: number, ty: number, def?: (typeof ITEM_DEFS)[number]): void;
    breakTile(x: number, y: number, byPlayer?: boolean, noItem?: boolean): void;
    checkFurnitureSupport(x: number, y: number): void;
  };
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
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    if (process.env.RB9C_DBG) console.log('[drop]', key, x, y, n);
    drops.push({ key, x, y, n }); return null;
  };
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.netCanEditTile = () => true;
  g.inTileRange = () => true;
  g.playSfxFile = () => {};
  g.playSfxFiles = () => {};
  g.dumpChest = () => {};
  g.trackTile = 0;
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, equipStats: {},
    inv: {
      selected: 0,
      slots: new Array(50).fill(null),
      heldItem: () => (stack > 0 ? { id: ITEM_BY_KEY[HF_KEY]!, stack } : null),
      removeAt: () => {},
      removeHeld: () => { stack--; },
      countOf: () => 0,
    },
  };
  return { g, get stack() { return stack; } };
}

function mkWorld(platform: boolean): World {
  const w = new World(60, 40, 7, 'sw-rb9c');
  const st = w.store;
  const ground = platform ? TILE_BY_KEY['platform']! : TILE_BY_KEY['stone']!;
  for (let x = 2; x < 58; x++) st.setTileSilent(x, 21, ground, 0, 0);
  return w;
}

const forgeCells = (st: World['store']): number => {
  let n = 0;
  for (let x = 8; x < 24; x++) for (let y = 16; y < 22; y++) {
    if (st.type[st.idx(x, y)] === HF_TILE && (st.flags[st.idx(x, y)] & 1)) n++;
  }
  return n;
};

describe('SW-RB9c 探针', () => {
  it('石地放熔炉 → 放置后存活 6 格', () => {
    const w = mkWorld(false);
    const { g } = shell(w, []);
    g.tryPlace(20, 20, HF_ITEM);
    expect(forgeCells(w.store)).toBe(6);
  });

  it('平台放熔炉 → 放置后存活 6 格（SolidWithTop 锚）', () => {
    const w = mkWorld(true);
    const { g } = shell(w, []);
    g.tryPlace(20, 20, HF_ITEM);
    expect(forgeCells(w.store)).toBe(6);
  });

  it('平台熔炉：挖其下一块平台 → 整件塌+单掉（原版 Check3x2 锚失同款）', () => {
    const w = mkWorld(true);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    g.tryPlace(20, 20, HF_ITEM);
    expect(forgeCells(w.store)).toBe(6);
    g.breakTile(20, 21, true);   // 挖熔炉中列下方平台
    g.checkFurnitureSupport(20, 20);   // 监听位换算 (x, y-1)
    expect(forgeCells(w.store)).toBe(0);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[221]!);
  });

  it('平台熔炉：挖【旁列】平台（非锚列）→ 原版锚行只剩本列两格仍在……整件塌（列扫描判定）', () => {
    const w = mkWorld(true);
    const drops: Drop[] = [];
    const { g } = shell(w, drops);
    g.tryPlace(20, 20, HF_ITEM);
    g.breakTile(23, 21, true);   // (23,21) 不在本件锚列 19..21 内
    g.checkFurnitureSupport(23, 20);   // 监听位换算
    if (process.env.RB9C_DBG) console.log('[dbg] map221=', VANILLA_ITEM_KEY_BY_ID[221], 'drops=', JSON.stringify(drops), 'cells=', forgeCells(w.store), 'filtered=', drops.filter((d) => d.key === VANILLA_ITEM_KEY_BY_ID[221]!).length);
    expect(forgeCells(w.store)).toBe(6);   // 不连带
    expect(drops.filter((d) => d.key === VANILLA_ITEM_KEY_BY_ID[221]!).length).toBe(0);
    expect(drops.length).toBe(0);
  });
});
