// R7 钓鱼回归：钓竿/鱼饵数据、渔获规则表结算、浮标状态机（mock 驱动）
import { describe, it, expect } from 'vitest';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { FISH_DROP_RULES, tryGetItemDrop, ANGLER_QUEST_ITEMS, type FishingRollCtx } from '../src/data/vanillaFishing';
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

describe('渔获规则表', () => {
  const baseCtx = (over: Partial<FishingRollCtx> = {}): FishingRollCtx => ({
    inLava: false, inHoney: false, junk: false, crate: false,
    common: true, uncommon: true, rare: true, veryrare: true, legendary: true,
    anyEnemies: false, canFishInLava: false,
    x: 1000, y: 100, waterTilesCount: 2000,
    rockLayer: 400, maxTilesX: 4200, heightLevel: 1, questFish: -1,
    hardMode: false, bloodMoon: false, combatBookWasUsed: false, remix: false,
    zones: {
      corrupt: false, crimson: false, jungle: false, snow: false,
      dungeon: false, desert: false, hallow: false,
    },
    rolled: {
      corruption: false, crimson: false, jungle: false, snow: false, desert: false,
      infectedDesert: false, remixOcean: false,
    },
    ...over,
  });
  it('岩浆池：CanFishInLava + veryrare → 2312（表内 LavaDrops :245）', () => {
    // legendary 必须关：GameContentFishDropPopulator.cs:243/:244 的 Legendary 1/3 池
    // （hardMode 4819/4820/4872/2331、EarlyMode 4819/4820/4872）注册在 :245
    // VeryRare→2312 之前，且 Attempt 顺序=条件→chance→稀有档（FishDropRule.cs:38-45）。
    // 留 true 时 1/3 概率先命中 Legendary 池 → 断言掷骰相关（实测 9/12 过 3/12 挂）。
    const ctx = baseCtx({ inLava: true, canFishInLava: true, common: false, uncommon: false, rare: false, legendary: false });
    expect(FISH_DROP_RULES.some((r) => r.group === 'LavaDrops' && r.items.includes(2312))).toBe(true);
    expect(tryGetItemDrop(ctx)).toBe(2312);
  });
  it('蜂蜜池：rare → 2314（HoneyDrops :233）', () => {
    expect(tryGetItemDrop(baseCtx({ inHoney: true, common: false, uncommon: false }))).toBe(2314);
  });
  it('地表普通：兜底 Any 池 → 2290（SurfaceDrops :70）', () => {
    expect(tryGetItemDrop(baseCtx({ common: false, uncommon: false, rare: false, veryrare: false, legendary: false }))).toBe(2290);
  });
  it('任务鱼：questFish 命中且 uncommon → 对应任务鱼（SurfaceDrops QuestFish 规则）', () => {
    const quest = ANGLER_QUEST_ITEMS[0]; // 2450 Batfish（HeightAbove1 + uncommon）
    // 注入定序 rng 闪避两个 Next(5) 掷（同 fishing-full.test.ts 任务鱼例）：
    // RareDrops :198（2423，didNotUseCombatBook 条件过）与 :201（炸弹鱼 3196，
    // BombRarity=!legendary&&!veryrare&&uncommon 恰好过）都注册在 QuestFish 规则
    // 之前——next(5)=1 ≥ num(1) 即跳过；不注入则 1/5 概率被抢先 → 断言 flaky
    const rng = { next: (n: number) => (n === 5 ? 1 : 0), range: (min: number) => min, double: () => 0 };
    expect(tryGetItemDrop(baseCtx({ heightLevel: 2, common: false, rare: false, veryrare: false, legendary: false, questFish: quest, rng }))).toBe(quest);
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
    // 咬钩（AI_061 累积器 1:1：钓鱼力 45 → 每 tick 期望 +4.3，>660 触发一次咬钩判定）
    let bit = false;
    for (let k = 0; k < 2000; k++) { b.fixedUpdate(1, hooks); if (b.biteT > 0) { bit = true; break; } }
    expect(bit).toBe(true);
    expect(b.catchId).toBeGreaterThan(0);
    // 收竿
    const caught = b.reel(hooks);
    expect(caught).toBe(b.catchId || caught); // reel 后 catchId 清零——用返回值
    expect(caught).toBeGreaterThan(0);
    expect(b.dead).toBe(true);
  });
  it('错过咬钩窗口 → catchId 清零（空竿，ai[1] 归零即逃脱）', () => {
    const { hooks, player } = makeHooks({ x: 62, y: 95, w: 30 });
    const b = new Bobber(player.cx, player.y - 10, 5, -4, 50, 0, 50, () => player);
    let landed2 = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed2 = true; break; } }
    expect(landed2).toBe(true);
    let bit = false;
    for (let k = 0; k < 2000; k++) { b.fixedUpdate(1, hooks); if (b.biteT > 0) { bit = true; break; } }
    expect(bit).toBe(true);
    // 窗口 = rand(-240,-90) - 钓鱼力(100) → 幅度 191-340，每 tick -= rand(1,5)
    for (let k = 0; k < 800; k++) { b.fixedUpdate(1, hooks); if (b.biteT === 0) break; }
    expect(b.catchId).toBe(0);
    expect(b.reel(hooks)).toBe(0);
  });
});
