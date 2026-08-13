// 钓鱼渔获全量化 + 渔夫任务链（26 机制审计 #5）回归。
// 权威 = 1.4.5.6 反编译：
//   渔获表  Terraria.GameContent.FishDropRules/（FishDropRule.Attempt :31-51）
//   结算链  Projectile.FishingCheck :19175 / RollDropLevels :20106-20168 / junk :19326
//           / ProbeForQuestFish :20089-20104 / PrepareFishingContext :19451-19502
//   任务链  Main.AnglerQuestSwap :3799-3947 / NPCChatText_DoAnglerQuest :39654-39690
//   奖励    Player.GetAnglerReward* :55351-55741
// 注：任务描述里"原版 400+ 条渔获规则"指的是 1.4.0 已删除的 FishingRules 类
//（1456 反编译全树无此类）——1.4.5.6 权威表 = FishDropRule 列表，全量 158 条，
// 此处以真实条数断言，不注水。
import { describe, it, expect } from 'vitest';
import fishJson from '../src/data/vanilla-fishing.json';
import {
  FISH_DROP_RULES, ANGLER_QUEST_ITEMS, ANGLER_REWARD_MILESTONES,
  rollDropLevels, rollJunk, heightLevelOf, prepareFishingContext, tryGetItemDrop,
  rollAnglerQuest, anglerRewardRarityMultiplier, rollAnglerRewards, seededRng,
  CAN_FISH_IN_LAVA_POLES, IS_LAVA_BAIT,
  type FishingRollCtx, type Rng, type ZoneInput,
} from '../src/data/vanillaFishing';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';

const json = fishJson as unknown as {
  _meta: { ruleCount: number; groupCounts: Record<string, number> };
  anglerQuest: {
    items: number[];
    filters: Array<{ items: number[]; gates: Array<{ gate: string }>; src: string }>;
    noSurfaceItems: number[];
  };
};

// ---- 掷骰注入 ----
/** 恒命中型（next→0 / range→min / double→0）：稀有档全真、chance 全中 */
const zeroRng: Rng = {
  next: () => 0,
  range: (min) => min,
  double: () => 0,
};
/** 恒落空型（next→max-1 / double→0.999）：稀有档全假、chance 全败 */
const missRng: Rng = {
  next: (n) => Math.max(0, n - 1),
  range: (min, max) => Math.max(min, max - 1),
  double: () => 0.999,
};
/** 队列驱动：next(n)/range/double 依序取值（超队列回退 0） */
function scriptedRng(values: number[]): Rng {
  let i = 0;
  const take = () => (i < values.length ? values[i++] : 0);
  return { next: () => take(), range: () => take(), double: () => take() };
}

const NO_ZONES: ZoneInput = {
  corrupt: false, crimson: false, jungle: false, snow: false,
  dungeon: false, desert: false, hallow: false,
};
const NO_ROLLED = {
  corruption: false, crimson: false, jungle: false, snow: false, desert: false,
  infectedDesert: false, remixOcean: false,
};

/** 全五档真 + 指定覆写的求值上下文 */
function ctx(over: Partial<FishingRollCtx> = {}, rng: Rng = zeroRng): FishingRollCtx {
  return {
    inLava: false, inHoney: false, junk: false, crate: false,
    common: true, uncommon: true, rare: true, veryrare: true, legendary: true,
    anyEnemies: false, canFishInLava: false,
    x: 1000, y: 100, waterTilesCount: 2000,
    rockLayer: 400, maxTilesX: 4200, heightLevel: 1, questFish: -1,
    hardMode: false, bloodMoon: false, combatBookWasUsed: false, remix: false,
    zones: { ...NO_ZONES }, rolled: { ...NO_ROLLED }, rng,
    ...over,
  };
}

// ==================== 提取表健全性 ====================

describe('提取表健全性（tools/extract-fishing.mjs → vanilla-fishing.json）', () => {
  it('规则全量：158 条（1.4.5.6 FishDropRule 列表真实规模；400+ 是 1.4.0 旧类）', () => {
    expect(FISH_DROP_RULES.length).toBe(158);
    expect(json._meta.ruleCount).toBe(158);
  });
  it('18 个规则组齐全且注册序与 Populate() 一致（首组 Populate=AnyEnemies stopper）', () => {
    const groups = [...new Set(FISH_DROP_RULES.map((r) => r.group))];
    expect(groups).toEqual(['Populate', 'LavaDrops', 'HoneyDrops', 'JunkDrops', 'CrateDrops',
      'RareDrops', 'RemixDrops', 'DungeonDrops', 'CorruptionDrops', 'CrimsonDrops',
      'HallowedDrops', 'GlowingMushroomsDrops', 'SnowDrops', 'JungleDrops', 'OceanDrops',
      'DesertDrops', 'FloatingIslandDrops', 'SurfaceDrops']);
    expect(FISH_DROP_RULES[0]).toMatchObject({ group: 'Populate', stopper: true, items: [] });
    expect(FISH_DROP_RULES[0].conditions[0].t).toBe('anyEnemies');
  });
  it('条件域合法：t 全在白名单 / height 比较 cmp+v 完整 / 每条带反编译行号', () => {
    const OK = new Set(['hardMode', 'inLava', 'inHoney', 'junk', 'crate', 'anyEnemies',
      'canFishInLava', 'dungeon', 'beach', 'hallow', 'glowshroom', 'trueDesert', 'trueSnow',
      'remix', 'height', 'underRockLayer', 'rolledCorruption', 'rolledCrimson', 'rolledJungle',
      'rolledSnow', 'rolledDesert', 'rolledHallowDesert', 'originalOcean', 'rolledRemixOcean',
      'ocean', 'water1000', 'bloodMoon', 'didNotUseCombatBook', 'questFish', 'questFishRemix']);
    for (const r of FISH_DROP_RULES) {
      expect(r.num, r.src).toBeGreaterThanOrEqual(1);
      expect(r.den, r.src).toBeGreaterThan(0);
      expect(r.num, r.src).toBeLessThanOrEqual(r.den);
      expect(r.src, r.group).toMatch(/^GameContentFishDropPopulator\.cs:\d+$/);
      if (r.items.length === 0) expect(r.stopper, r.src).toBe(true);
      for (const c of r.conditions) {
        expect(OK.has(c.t), `${r.src} ${c.t}`).toBe(true);
        if (c.t === 'height') {
          expect(['==', '>', '>=', '<', 'in']).toContain(c.cmp);
          expect(c.v).toBeDefined();
        }
        if (c.t === 'questFish' || c.t === 'questFishRemix') expect(c.item).toBeGreaterThan(0);
        if (c.t === 'hardMode') expect(typeof c.v).toBe('boolean');
      }
    }
  });
  it('池 id 全注册：每条规则 items 都能落到 VANILLA_ITEM_KEY_BY_ID', () => {
    for (const r of FISH_DROP_RULES) {
      for (const id of r.items) {
        expect(VANILLA_ITEM_KEY_BY_ID[id], `规则 ${r.src} 的物品 ${id} 未注册`).toBeDefined();
      }
    }
  });
  it('任务鱼 41 条全量 + 表内 QuestFish 规则全覆盖（Remix 变体 10 条）', () => {
    expect(ANGLER_QUEST_ITEMS).toHaveLength(41);
    expect(json.anglerQuest.items).toEqual(ANGLER_QUEST_ITEMS);
    const questItems = new Set(FISH_DROP_RULES
      .filter((r) => r.conditions.some((c) => c.t === 'questFish')).flatMap((r) => r.items));
    expect([...questItems].sort((a, b) => a - b)).toEqual([...ANGLER_QUEST_ITEMS].sort((a, b) => a - b));
    const remix = new Set(FISH_DROP_RULES
      .filter((r) => r.conditions.some((c) => c.t === 'questFishRemix')).flatMap((r) => r.items));
    expect(remix.size).toBe(10);
  });
  it('关键锚点行号：血月 4382 在 RareDrops :196、海洋 stopper :108、末条兜底 2290 :70', () => {
    const rare4382 = FISH_DROP_RULES.find((r) => r.group === 'RareDrops' && r.items[0] === 4382);
    expect(rare4382?.src).toBe('GameContentFishDropPopulator.cs:196');
    expect((FISH_DROP_RULES)[(FISH_DROP_RULES).length - 1]).toMatchObject({ items: [2290], src: 'GameContentFishDropPopulator.cs:70' });
  });
});

// ==================== 咬钩前的档位掷骰 ====================

describe('rollDropLevels（Projectile.cs:20106-20168）', () => {
  it('分母下限：L=800 → legendary 恒 1/6（next(6)==0 命中）', () => {
    expect(rollDropLevels(800, false, zeroRng).legendary).toBe(true);
    expect(rollDropLevels(800, false, missRng).legendary).toBe(false);
  });
  it('常规分母：L=30 → legendary 1/150、uncommon 1/10（下限 3）', () => {
    // L=30：150/30=5(common) 300/30=10 1050/30=35 2250/30=75 4500/30=150
    const lv = rollDropLevels(30, false, zeroRng);
    expect(lv).toMatchObject({ common: true, uncommon: true, rare: true, veryrare: true, legendary: true });
    expect(rollDropLevels(30, false, missRng).legendary).toBe(false);
  });
  it('宝匣药水：crate 概率 10% → 25%（Next(100)<25，missRng(99) 不中 / 20 中）', () => {
    expect(rollDropLevels(30, true, scriptedRng([0, 0, 0, 0, 0, 20])).crate).toBe(true);
    expect(rollDropLevels(30, true, scriptedRng([0, 0, 0, 0, 0, 25])).crate).toBe(false);
    expect(rollDropLevels(30, false, scriptedRng([0, 0, 0, 0, 0, 9])).crate).toBe(true);
  });
});

describe('rollJunk / heightLevelOf（:19326 / :19306-19325）', () => {
  it('junk 三条件：水量足恒非垃圾；L≥50 恒非垃圾；双掷 49 + 水量不足 → 垃圾', () => {
    expect(rollJunk(10, 300, 300, zeroRng)).toBe(false);            // 水量 ≥ 所需
    expect(rollJunk(50, 100, 300, zeroRng)).toBe(false);            // Next(50)>50 不可能
    expect(rollJunk(0, 100, 300, missRng)).toBe(true);              // 49>0 且 49>0 且 100<300
  });
  it('heightLevel 五档边界（地表/2、地表、岩层、H-300）', () => {
    const gs = 200, rk = 400, h = 1200;
    expect(heightLevelOf(99, gs, rk, h)).toBe(0);
    expect(heightLevelOf(100, gs, rk, h)).toBe(1);   // y<地表/2 严格小于：100 不属天空
    expect(heightLevelOf(199, gs, rk, h)).toBe(1);
    expect(heightLevelOf(399, gs, rk, h)).toBe(2);
    expect(heightLevelOf(899, gs, rk, h)).toBe(3);
    expect(heightLevelOf(900, gs, rk, h)).toBe(4);
  });
});

// ==================== 结算分支（规则表求值）====================

describe('tryGetItemDrop 结算分支（FishDropRuleList.cs:10-21）', () => {
  it('anyEnemies stopper 居表首：敌怪已掷出 → 渔获恒 0（互斥）', () => {
    expect(tryGetItemDrop(ctx({ anyEnemies: true }))).toBe(0);
  });
  it('岩浆池：canFishInLava + veryrare 独占 → 2312 闪鳍锦鲤（LavaDrops :245，先于它的是 Legendary :243/:244）', () => {
    expect(tryGetItemDrop(ctx({ inLava: true, canFishInLava: true, legendary: false }))).toBe(2312);
    // legendary 命中时早两档胜出：非困难取 4819（:244 EarlyMode 池）
    expect(tryGetItemDrop(ctx({ inLava: true, canFishInLava: true }))).toBe(4819);
    // 无熔线钓钩三源 → 岩浆全组拒 → 0（钓钩烧毁外的空咬）
    expect(tryGetItemDrop(ctx({ inLava: true, canFishInLava: false }))).toBe(0);
  });
  it('蜂蜜池：rare 优先于 uncommon → 2314 蜂蜜鱼（HoneyDrops :233-234）', () => {
    expect(tryGetItemDrop(ctx({ inHoney: true, common: false, uncommon: false }))).toBe(2314);
    expect(tryGetItemDrop(ctx({ inHoney: true, rare: false, veryrare: false, legendary: false, rng: scriptedRng([1]) }))).toBe(2314);
  });
  it('junk 组：Next(8)==0 → 海草 5275，否则锡罐族 2337-2339（JunkDrops :226-227）', () => {
    expect(tryGetItemDrop(ctx({ junk: true, legendary: false, veryrare: false, rare: false, uncommon: false, common: false, crate: false }))).toBe(5275);
    expect(tryGetItemDrop(ctx({ junk: true, legendary: false, veryrare: false, rare: false, uncommon: false, common: false, crate: false, rng: scriptedRng([1, 0, 1]) }))).toBe(2338);
  });
  it('crate 组：地表无群系 → 木匣 2334（CrateDrops :220 Any 档）', () => {
    expect(tryGetItemDrop(ctx({ crate: true, legendary: false, veryrare: false, rare: false, uncommon: false, common: false, junk: false }))).toBe(2334);
  });
  it('血月池：legendary + bloodMoon + 未用战斗书 → 4382（RareDrops :196，Next(3)==0）', () => {
    expect(tryGetItemDrop(ctx({ bloodMoon: true }))).toBe(4382);
    // 战斗书用过 → 跳过 4382 落到 5240（:197）
    expect(tryGetItemDrop(ctx({ bloodMoon: true, combatBookWasUsed: true, rng: scriptedRng([0, 0]) }))).toBe(5240);
    // 非血月 → 2423（:198，Next(5)==0）
    expect(tryGetItemDrop(ctx({ rng: scriptedRng([0]) }))).toBe(2423);
  });
  it('任务鱼优先于普通池：uncommon + questFish 命中 → 直接出任务鱼', () => {
    const quest = ANGLER_QUEST_ITEMS[0];   // 2450 Batfish（SurfaceDrops HeightAbove1）
    expect(tryGetItemDrop(ctx({
      heightLevel: 2, rare: false, veryrare: false, legendary: false, questFish: quest,
      rng: { next: (n) => (n === 5 ? 1 : 0), range: (min) => min, double: () => 0 },
    }))).toBe(quest);
    // 深度不符（heightLevel=1 的 Height1 段无 2450 规则）→ 落常规池
    expect(tryGetItemDrop(ctx({
      heightLevel: 1, rare: false, veryrare: false, legendary: false, questFish: quest,
    }))).not.toBe(quest);
  });
  it('海洋组：边缘 380 + 水量>1000 → 海洋池 2341（关 legendary 隔离前置 Rare 档）；非边缘全稀有档 → RareDrops 2423 先命中（:198 注册序先于 :95 组调用序）', () => {
    // 原版 Populate（GameContentFishDropPopulator.cs:10-30）：RareDrops() 在 OceanDrops() 之前调用，
    // Legendary 2423（1/5 无条件）在全稀有档下必然先命中——此为原版语义，非实现缺陷
    expect(tryGetItemDrop(ctx({ x: 100, waterTilesCount: 2000, legendary: false }))).toBe(2341); // OceanDrops VeryRare :98
    expect(tryGetItemDrop(ctx({ x: 1000 }))).toBe(2423);                        // RareDrops Legendary :198（注册序在前）
  });
  it('海洋 stopper（:108）：海洋命中后 Desert/FloatingIsland/Surface 组全部不可达', () => {
    const stopper = FISH_DROP_RULES.find((r) => r.group === 'OceanDrops' && r.stopper);
    expect(stopper?.src).toBe('GameContentFishDropPopulator.cs:108');
    expect((() => { const arr = FISH_DROP_RULES.filter((r) => r.group === 'OceanDrops'); return arr[arr.length - 1]; })()).toBe(stopper);
  });
  it('prepareFishingContext 撞车仲裁（:19471-19485）：腐化∩猩红二选一、雪∩丛林弃雪', () => {
    const both = prepareFishingContext({ ...NO_ZONES, corrupt: true, crimson: true }, 1, 100, 400, scriptedRng([0]));
    expect(both.corruption).toBe(true);
    expect(both.crimson).toBe(false);
    const snowJungle = prepareFishingContext({ ...NO_ZONES, snow: true, jungle: true }, 1, 100, 400, scriptedRng([0]));
    expect(snowJungle.snow).toBe(false);
    expect(snowJungle.jungle).toBe(true);
  });
});

// ==================== 渔夫任务链 ====================

describe('rollAnglerQuest 每日选取（Main.cs:3809-3945）', () => {
  const freshGates = { hardMode: false, evil: 'corrupt' as const, anyBoss: false, hasWorldSurface: true };
  it('同种子同天数同任务鱼（seededRng 注入确定性）', () => {
    const a = rollAnglerQuest(freshGates, seededRng(12345));
    const b = rollAnglerQuest(freshGates, seededRng(12345));
    const c = rollAnglerQuest(freshGates, seededRng(999));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(41);
    expect(c).not.toBe(a);   // 异种子通常不同（弱断言：只验不塌缩到单值）
  });
  it('世界门过滤：普通腐化世界不会选到 hardMode/猩红限定任务鱼', () => {
    // 拒绝表（Main.cs:3814-3866）：非困难世界禁 2462/2465/2468/2471/2473/2480/2483/2484
    // 与 双限定 2454/2463；腐化世界禁 2457/2477/2485
    // 普通腐化世界被禁：困难限定 8 条 + 双限定 2454/2463 + anyBoss 三连；2457/2485 是
    // 腐化世界鱼（:3818/:3862 拒猩红）——在腐化世界反而放行
    const banned = new Set([2454, 2462, 2463, 2465, 2468, 2471, 2473, 2476, 2480, 2483, 2484]);
    for (let seed = 1; seed <= 400; seed++) {
      const q = ANGLER_QUEST_ITEMS[rollAnglerQuest(freshGates, seededRng(seed))];
      expect(banned.has(q), `seed=${seed} 选到被禁任务鱼 ${q}`).toBe(false);
    }
  });
  it('困难猩红世界放行双限定族（2454 需 hardMode+腐化 / 2463 需 hardMode+猩红）', () => {
    const hardCrimson = { hardMode: true, evil: 'crimson' as const, anyBoss: true, hasWorldSurface: true };
    const bannedCrimson = new Set([2454, 2457, 2485]);   // 腐化世界限定族（:3818/:3814/:3862）
    for (let seed = 1; seed <= 300; seed++) {
      const q = ANGLER_QUEST_ITEMS[rollAnglerQuest(hardCrimson, seededRng(seed))];
      expect(bannedCrimson.has(q), `seed=${seed} 猩红世界选到腐化限定鱼 ${q}`).toBe(false);
    }
    const hardCorrupt = { hardMode: true, evil: 'corrupt' as const, anyBoss: true, hasWorldSurface: true };
    const bannedCorrupt = new Set([2463, 2477]);  // 猩红限定（:3826/:3846）；2485 是腐化限定（:3862）腐化世界合法
    for (let seed = 1; seed <= 300; seed++) {
      const q = ANGLER_QUEST_ITEMS[rollAnglerQuest(hardCorrupt, seededRng(seed))];
      expect(bannedCorrupt.has(q), `seed=${seed} 腐化世界选到猩红限定鱼 ${q}`).toBe(false);
    }
  });
  it('拒绝表元数据：14 条过滤 + 无地表整族 18 条（提取脚本断言的镜像）', () => {
    expect(json.anglerQuest.filters).toHaveLength(14);
    expect(json.anglerQuest.noSurfaceItems).toHaveLength(18);
    expect(json.anglerQuest.filters.every((f) => /^Main\.cs:\d+$/.test(f.src))).toBe(true);
  });
});

describe('渔夫奖励（Player.GetAnglerReward* :55351-55741）', () => {
  it('稀有度系数阶梯（:55363-55368）：0→0.9 / 50→0.45 / 100→0.225 / 150→0.135', () => {
    expect(anglerRewardRarityMultiplier(0)).toBeCloseTo(0.9, 6);
    expect(anglerRewardRarityMultiplier(50)).toBeCloseTo(0.45, 6);
    expect(anglerRewardRarityMultiplier(100)).toBeCloseTo(0.225, 6);
    expect(anglerRewardRarityMultiplier(150)).toBeCloseTo(0.135, 6);
    expect(anglerRewardRarityMultiplier(200)).toBeCloseTo(0.135, 6);   // >150 恒 0.15×0.9
  });
  it('里程碑阶梯（:55374-55393）：5→熔线钓钩 2428 / 25→3001? 否 3031 / 30→金钓竿 2294', () => {
    expect(ANGLER_REWARD_MILESTONES).toEqual([
      { questsDone: 5, item: 2428 }, { questsDone: 10, item: 2367 },
      { questsDone: 15, item: 2368 }, { questsDone: 20, item: 2369 },
      { questsDone: 25, item: 3031 }, { questsDone: 30, item: 2294 },
    ]);
    const at5 = rollAnglerRewards({ questsDone: 5, questItemType: ANGLER_QUEST_ITEMS[0], hardMode: false, ownedTypes: new Set() });
    expect(at5[0]).toMatchObject({ id: 2428, stack: 1 });
    const at30 = rollAnglerRewards({ questsDone: 30, questItemType: ANGLER_QUEST_ITEMS[0], hardMode: false, ownedTypes: new Set() });
    expect(at30[0]).toMatchObject({ id: 2294, stack: 1 });   // 金钓竿第 30 个任务
  });
  it('四段齐全（:55357-55360）：主奖励 + 装饰 + 货币 + 鱼饵 按序产出', () => {
    const g = rollAnglerRewards({ questsDone: 1, questItemType: 2450, hardMode: false, ownedTypes: new Set(), rng: scriptedRng([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]) });
    const ids = g.map((x) => x.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain(72);            // 货币（银币）
    expect([2674, 2675, 2676]).toContain((ids)[(ids).length - 1]);   // 鱼饵收尾
  });
  it('货币公式（:55599-55640）：n=0 + R=50 → 银币 27；hardMode 翻倍 → 银币 54；R=200 → 金币', () => {
    // money = ⌊((0+50)/2)·R·0.015⌋ → ⌊·1.5⌋；R=50：⌊25·50·0.015⌋=18 → ⌊27⌋ 银币 27
    const soft = rollAnglerRewards({ questsDone: 0, questItemType: 2450, hardMode: false, ownedTypes: new Set(), rng: moneyRng(50) });
    expect(soft.find((x) => x.id === 72)?.stack).toBe(27);
    // 困难 ×2（:55605-55608）：27×2=54 仍走银币档
    const hard = rollAnglerRewards({ questsDone: 0, questItemType: 2450, hardMode: true, ownedTypes: new Set(), rng: moneyRng(50) });
    expect(hard.find((x) => x.id === 72)?.stack).toBe(54);
    // R=200：⌊75·1.5⌋=112 >100 → 金币 ⌊112/100⌋=1；困难 224 → 2
    const gold = rollAnglerRewards({ questsDone: 0, questItemType: 2450, hardMode: false, ownedTypes: new Set(), rng: moneyRng(200) });
    expect(gold.find((x) => x.id === 73)?.stack).toBe(1);
    const goldHard = rollAnglerRewards({ questsDone: 0, questItemType: 2450, hardMode: true, ownedTypes: new Set(), rng: moneyRng(200) });
    expect(goldHard.find((x) => x.id === 73)?.stack).toBe(2);
  });
  it('鱼饵增量六档（:55571-55594）：next(den)≤n 各 +1，n=0 时仅 1/den 概率叠堆', () => {
    // n=0：六档 next(den)≤0 只有 0 命中——全 miss（1）→ stack=1；全中（0）→ stack=7
    const miss = rollAnglerRewards({ questsDone: 0, questItemType: 2450, hardMode: false, ownedTypes: new Set(), rng: baitRng([1, 1, 1, 1, 1, 1]) });
    expect((miss)[(miss).length - 1]?.stack).toBe(1);
    const hit = rollAnglerRewards({ questsDone: 0, questItemType: 2450, hardMode: false, ownedTypes: new Set(), rng: baitRng([0, 0, 0, 0, 0, 0]) });
    expect((hit)[(hit).length - 1]?.stack).toBe(7);
    // n=250：六档 next(den)≤250 恒真 → 必叠满
    const big = rollAnglerRewards({ questsDone: 250, questItemType: 2450, hardMode: false, ownedTypes: new Set(), rng: baitRng([1, 1, 1, 1, 1, 1]) });
    expect((big)[(big).length - 1]?.stack).toBe(7);
  });
  it('持有组合件剔除零件（RemoveAnglerAccOptionsFromRewardPool :55704-55741）', () => {
    // 持有钓具箱 3721（组合件）→ 2373/2374/2375 全部出池
    const owned = new Set([3721]);
    for (let seed = 1; seed <= 200; seed++) {
      const g = rollAnglerRewards({ questsDone: 2, questItemType: 2450, hardMode: false, ownedTypes: owned, rng: accRng(seed) });
      const main = g[0].id;
      expect([2373, 2374, 2375], `seed=${seed} 组合件零件 ${main} 漏剔除`).not.toContain(main);
    }
  });
});

/** 货币专项 rng：前面 chance 段全落空，money 的 range(50,201) 取 R */
function moneyRng(R: number): Rng {
  let moneyDone = false;
  return {
    next: () => 1,                 // chance 段全 miss（≠0）
    range: () => { moneyDone = true; return R; },
    double: () => 0.999,           // 装饰段落空
  };
}
/** 鱼饵专项 rng：前置段（主奖励 chance×9/装饰 double）依次落空进入 bait 段，
 *  bait 门 next(45)=0（≤50 恒过）→ 选饵 next(6)=0（大师诱饵）→ 六档增量按入参 */
function baitRng(stackRolls: number[]): Rng {
  // 原版消费序（GetAnglerReward :55357-55360）：主奖链 5 掷 + accDouble + next(3) + range(2,6)
  //  + 装饰 double + 钱 range(50,201) = 10 拍全 1 → 第 11 拍鱼饵门 0.999 过 → 第 12 拍 15r=0
  //  大师诱饵短路（5r 不掷）→ stack 六掷全吃 stackRolls
  const pre = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.999, 0];
  const seq = [...pre, ...stackRolls];
  let i = 0;
  const take = () => (i < seq.length ? seq[i++] : 0);
  return { next: () => take(), range: () => take(), double: () => take() };
}
/** 配件段专项 rng：前段全 miss，DropAnglerAccByMissing 的 double 取伪随机 0..1 */
function accRng(seed: number): Rng {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  let n = 0;
  return {
    next: (m) => { n++; return n <= 10 ? 1 : Math.floor(rnd() * m); },
    range: (min, max) => min + Math.floor(rnd() * (max - min)),
    double: () => rnd(),
  };
}

// ==================== 存档往返 ====================

describe('任务链持久化（WorldFile.cs:1329-1335 / Player.cs:53943）', () => {
  it('saveGame → loadSave：anglerQuest + 今日名单 + 完成计数完整往返', () => {
    const w = new World(60, 40, 42, 'angler-save');
    w.anglerQuest = 17;
    w.anglerWhoFinishedToday = ['泰拉瑞亚'];
    w.anglerQuestFinished = true;          // 运行时态——读档应重置（WF:628-629）
    w.groundLevel = 20; w.rockLevel = 30;
    const p = new Player(100, 100, new Inventory());
    p.anglerQuestsFinished = 12;
    const jsonStr = saveGame(w, p, 0);
    const { world: w2, player: p2 } = loadSave(jsonStr);
    expect(w2.anglerQuest).toBe(17);
    expect(w2.anglerWhoFinishedToday).toEqual(['泰拉瑞亚']);
    expect(w2.anglerQuestFinished).toBe(false);   // 不随档（loadTempInfo 重置）
    expect(p2.anglerQuestsFinished).toBe(12);
  });
  it('旧档兼容：缺 angler 段 → 索引 0/空名单，不炸', () => {
    const w = new World(60, 40, 7, 'angler-legacy');
    w.groundLevel = 20; w.rockLevel = 30;
    const p = new Player(0, 0, new Inventory());
    const raw = JSON.parse(saveGame(w, p, 0)) as Record<string, unknown>;
    delete raw.angler;
    delete (raw.player as Record<string, unknown>).anglerQuestsFinished;
    const { world: w2, player: p2 } = loadSave(JSON.stringify(raw));
    expect(w2.anglerQuest).toBe(0);
    expect(w2.anglerWhoFinishedToday).toEqual([]);
    expect(p2.anglerQuestsFinished).toBeUndefined();
  });
});

// ==================== 物品集（ItemID.cs:1072/1074）====================

describe('岩浆可钓物品集', () => {
  it('CanFishInLava = {2422 热线钓钩}；IsLavaBait = {4845/4847/4849}', () => {
    expect([...CAN_FISH_IN_LAVA_POLES]).toEqual([2422]);
    expect([...IS_LAVA_BAIT].sort((a, b) => a - b)).toEqual([4845, 4847, 4849]);
  });
});
