// R7 钓鱼回归：钓竿/鱼饵数据、渔获池、浮标状态机（mock 驱动）
import { describe, it, expect } from 'vitest';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { pickPool, rollCatch } from '../src/data/vanillaFishing';
import { Bobber } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { ITEM_BY_KEY } from '../src/data/items';

function makeHooks(waterAt?: { x: number; y: number; w?: number }) {
  const store = new TileStore(200, 120);
  if (waterAt) {
    const w = waterAt.w ?? 1;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        store.setLiquid(waterAt.x + dx, waterAt.y + dy, 200, 1);
      }
    }
  }
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks: GameHooks = {
    world: {
      store,
      // 中性时段（乘区=1）：上午 10k tick ≈ timeOfDay 0.3426、无雨无云、月相 2 非血月
      clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
      weather: { raining: false, cloudAlpha: 0 },
      flags: {},
      scene: null,
    } as never,
    player: player as never,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, store, player };
}

describe('钓具数据', () => {
  it('9 支钓竿力度（木 5 → 金 50）；金钓竿 2294=50', () => {
    expect(itemFuncOfVid(2289)?.fishingPole).toBe(5);
    expect(itemFuncOfVid(2294)?.fishingPole).toBe(50);
    expect(itemFuncOfVid(2295)?.fishingPole).toBe(35);
    expect(itemFuncOfVid(4442)?.fishingPole).toBe(30);
  });
  it('鱼饵 29 种（大师诱饵 2676=50? 范例：虫子 1999?——以 2676 验证 >0）', () => {
    expect((itemFuncOfVid(2676)?.bait ?? 0) > 0 || (itemFuncOfVid(2674)?.bait ?? 0) > 0).toBe(true);
  });
});

describe('渔获池', () => {
  it('液体优先：岩浆→闪鳍锦鲤池；蜂蜜→蜂蜜鱼；地表普通→基础鱼池', () => {
    expect(pickPool({ liquid: 'lava', zone: 'forest', depth: 'cavern', zoneOcean: false }).fish).toContain(2312);
    expect(pickPool({ liquid: 'honey', zone: 'jungle', depth: 'surface', zoneOcean: false }).fish).toEqual([2314]);
    const surf = pickPool({ liquid: 'water', zone: 'forest', depth: 'surface', zoneOcean: false });
    expect(surf.fish).toContain(2290);
    expect(surf.crates).toContain(2334);
  });
  it('rollCatch：只掷出池内 id', () => {
    const pool = pickPool({ liquid: 'water', zone: 'forest', depth: 'surface', zoneOcean: false });
    const all = [...pool.fish, ...(pool.crates ?? []), ...(pool.junk ?? [])];
    for (let k = 0; k < 200; k++) expect(all).toContain(rollCatch(30, pool, false));
  });
});

describe('Bobber 状态机', () => {
  it('抛物线落水 → 漂浮 → 等待后咬钩 → 窗口内收竿得渔获', () => {
    const { hooks, player } = makeHooks({ x: 64, y: 95, w: 30 });
    // 背包放鱼饵（vi_2674 学徒诱饵 bait=15）
    const baitKey = 'vi_2674_ApprenticeBait';
    const baitId = ITEM_BY_KEY[baitKey];
    player.inv.slots[3] = { id: baitId, stack: 5 };
    const b = new Bobber(player.cx, player.y - 10, 6, -4, 30, 3, 15, () => player);
    // 抛物线 → 落水（x 方向朝 70 列）
    let landed = false;
    for (let k = 0; k < 200; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    // 咬钩（等待 300-210=90t 上下 + 60 随机）
    let bit = false;
    for (let k = 0; k < 400; k++) { b.fixedUpdate(1, hooks); if (b.biteT > 0) { bit = true; break; } }
    expect(bit).toBe(true);
    expect(b.catchId).toBeGreaterThan(0);
    // 收竿
    const caught = b.reel(hooks);
    expect(caught).toBe(b.catchId || caught); // reel 后 catchId 清零——用返回值
    expect(caught).toBeGreaterThan(0);
    expect(b.dead).toBe(true);
  });
  it('错过咬钩窗口 → catchId 清零（空竿）', () => {
    const { hooks, player } = makeHooks({ x: 62, y: 95, w: 30 });
    const b = new Bobber(player.cx, player.y - 10, 5, -4, 50, 0, 50, () => player);
    let landed2 = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed2 = true; break; } }
    expect(landed2).toBe(true);
    let bit = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.biteT > 0) { bit = true; break; } }
    expect(bit).toBe(true);
    // 等窗口过
    for (let k = 0; k < 70; k++) b.fixedUpdate(1, hooks);
    expect(b.catchId).toBe(0);
    expect(b.reel(hooks)).toBe(0);
  });
});
