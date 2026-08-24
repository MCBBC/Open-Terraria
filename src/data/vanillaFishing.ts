// 钓鱼渔获结算（1.4.5.6 全量）。权威 = FishDropRule 规则表：
//   表数据   src/data/vanilla-fishing.json（tools/extract-fishing.mjs 从反编译
//            GameContentFishDropPopulator.cs 全量提取，158 条规则、逐条带源码行号）
//   装配     Main.cs:6525-6527 → Main.FishDropsDB
//   消费链   Projectile.FishingCheck :19175 → TryBuildFishingContext :19189
//            → SetFishingCheckResults :19333 → FishingCheck_RollItemDrop :19431
//            → FishDropRuleList.TryGetItemDropType（FishDropRuleList.cs:10-21）
//   求值序   FishDropRule.Attempt（FishDropRule.cs:31-51）：条件全中
//            → chance 掷骰 Next(den) < num → 稀有档命中 → 池内取一；
//            items 为空 = Stopper（IsStopper :15-29，命中即终止整表返回 0）
// 本模块同时承载渔夫任务链纯逻辑：每日任务鱼选取（Main.AnglerQuestSwap
// :3799-3947）与四段奖励（Player.GetAnglerReward* :55351-55741）。
import fishJson from './vanilla-fishing.json';
import { UnifiedRandom } from '../core/rng';

// ============================ 随机注入 ============================

/** Main.rand / context.Random 的最小面（Terraria.Utilities.UnifiedRandom = .NET Random 同源）。
 *  测试传种子实现拿确定性序列；next(0) 依 .NET 语义返回 0（Next(0)==0 恒真）。 */
export interface Rng {
  /** Next(maxValue)（左闭右开 [0,max)） */
  next(maxExclusive: number): number;
  /** Next(minValue, maxValue)（左闭右开） */
  range(min: number, max: number): number;
  /** NextDouble()/NextFloat()（[0,1)） */
  double(): number;
}

/** Math.random 直读实现（运行时默认） */
export const mathRng: Rng = {
  next: (n) => (n <= 0 ? 0 : Math.floor(Math.random() * n)),
  range: (min, max) => min + (max <= min ? 0 : Math.floor(Math.random() * (max - min))),
  double: () => Math.random(),
};

/** UnifiedRandom（core/rng.cs 1:1）种子实现——任务链按「世界种子 × 天数」播种 */
export function seededRng(seed: number): Rng {
  const r = new UnifiedRandom(seed);
  return {
    next: (n) => (n <= 0 ? 0 : r.nextInt(n)),          // Next(maxValue)
    range: (min, max) => (max <= min ? min : r.nextIntRange(min, max)),  // Next(min,max)
    double: () => r.nextDouble(),                      // NextDouble()
  };
}

// ============================ 类型 ============================

/** 规则条件（vanilla-fishing.json 的归一化形；src = 反编译行号，expr = 原 lambda） */
export interface FishCond {
  t: string;
  /** hardMode 档位 / height 比较值 */
  v?: boolean | number | number[];
  cmp?: '==' | '>' | '>=' | '<' | 'in';
  /** questFish / questFishRemix 的目标物品 id */
  item?: number;
  src: string;
  expr?: string;
}

export interface FishRule {
  group: string;
  rarity: string;
  num: number;
  den: number;
  items: number[];
  conditions: FishCond[];
  stopper: boolean;
  src: string;
}

const data = fishJson as unknown as {
  rules: FishRule[];
  anglerQuest: {
    items: number[]; itemsSrc: string; swapSrc: string;
    filters: Array<{ items: number[]; gates: Array<{ gate: string; want: boolean | string }>; src: string }>;
    noSurfaceItems: number[]; noSurfaceSrc: string;
  };
  rewardMilestones: Array<{ questsDone: number; item: number }>;
};

/** 全量渔获规则（GameContentFishDropPopulator.Populate 注册序，勿重排） */
export const FISH_DROP_RULES: FishRule[] = data.rules;

/** 渔夫任务鱼表（Main.anglerQuestItemNetIDs，Main.cs:1845-1852，41 条） */
export const ANGLER_QUEST_ITEMS: number[] = data.anglerQuest.items;

/** 任务奖励里程碑道具（Player.cs:55374-55393 switch：5/10/15/20/25/30 次阶梯） */
export const ANGLER_REWARD_MILESTONES = data.rewardMilestones;

/** ItemID.Sets.CanFishInLava（ItemID.cs:1072）——岩浆可钓竿 = {热线钓钩 2422} */
export const CAN_FISH_IN_LAVA_POLES = new Set([2422]);
/** ItemID.Sets.IsLavaBait（ItemID.cs:1074）——岩浆鱼饵 = {地狱蝶 4849/熔岩蝇 4845/岩浆蜗牛 4847} */
export const IS_LAVA_BAIT = new Set([4849, 4845, 4847]);

// ==================== 咬钩前的档位掷骰（Projectile.cs:20106-20168）====================

export interface DropLevels {
  common: boolean; uncommon: boolean; rare: boolean; veryrare: boolean; legendary: boolean; crate: boolean;
}

/** FishingCheck_RollDropLevels（:20106-20168）1:1：五档分母 = 150×{1,2,7,15,30}/L
 *  整除、下限 {2,3,4,5,6}；crate = Next(100) < 10 + 宝匣药水 15。各档独立掷、可并存。 */
export function rollDropLevels(level: number, cratePotion: boolean, rng: Rng = mathRng): DropLevels {
  const L = Math.max(1, Math.floor(level));
  // C# int 除法（:20108-20112）→ JS floor 对正数等价
  let common = Math.floor(150 / L);          // num
  let uncommon = Math.floor(300 / L);        // num2
  let rare = Math.floor(1050 / L);           // num3
  let veryrare = Math.floor(2250 / L);       // num4
  let legendary = Math.floor(4500 / L);      // num5
  let crateDen = 10;                         // num6（:20113）
  if (cratePotion) crateDen += 15;           // :20114-20117
  if (common < 2) common = 2;                // :20118-20121
  if (uncommon < 3) uncommon = 3;            // :20122-20125
  if (rare < 4) rare = 4;                    // :20126-20129
  if (veryrare < 5) veryrare = 5;            // :20130-20133
  if (legendary < 6) legendary = 6;          // :20134-20137
  return {
    common: rng.next(common) === 0,          // :20144-20147
    uncommon: rng.next(uncommon) === 0,      // :20148-20151
    rare: rng.next(rare) === 0,              // :20152-20155
    veryrare: rng.next(veryrare) === 0,      // :20156-20159
    legendary: rng.next(legendary) === 0,    // :20160-20163
    crate: rng.next(100) < crateDen,         // :20164-20167
  };
}

/** TryBuildFishingContext 垃圾档（:19326）1:1：
 *  Next(50) > L 且 Next(50) > L 且 水量 < 所需水量——三条件同时成立才是 junk。
 *  （水量 ≥ 所需时恒非垃圾；L ≥ 50 时两次掷骰必失败恒非垃圾） */
export function rollJunk(level: number, waterTilesCount: number, waterNeededToFish: number, rng: Rng = mathRng): boolean {
  const L = Math.floor(level);
  return rng.next(50) > L && rng.next(50) > L && waterTilesCount < waterNeededToFish;
}

/** TryBuildFishingContext 高度档（:19306-19325 非 remix 分支）1:1：
 *  0=天空(<地表/2) 1=地表 2=地下(<岩层) 3=洞穴(<H-300) 4=地狱 */
export function heightLevelOf(y: number, worldSurface: number, rockLayer: number, maxTilesY: number): number {
  if (y < worldSurface * 0.5) return 0;        // :19306-19309
  if (y < worldSurface) return 1;              // :19310-19313
  if (y < rockLayer) return 2;                 // :19314-19317
  if (y < maxTilesY - 300) return 3;           // :19318-19321
  return 4;                                    // :19322-19325
}

// ==================== PrepareFishingContext（Projectile.cs:19451-19502）====================

/** 玩家 zone 快照（SceneMetrics）。dungeon 须已折 downedBoss3 门（:19458-19461）；
 *  beach/glowshroom 为规则表消费的可选扩展位（CrateDrops/HallowedDrops 用）。 */
export interface ZoneInput {
  corrupt: boolean; crimson: boolean; jungle: boolean; snow: boolean;
  dungeon: boolean; desert: boolean; hallow: boolean;
  beach?: boolean; glowshroom?: boolean;
}

/** 渔获规则求值上下文（FishingContext + FishingAttempt 的并集投影） */
export interface FishingRollCtx {
  /** FishingAttempt 直读字段 */
  inLava: boolean; inHoney: boolean; junk: boolean; crate: boolean;
  common: boolean; uncommon: boolean; rare: boolean; veryrare: boolean; legendary: boolean;
  /** rolledEnemySpawn > 0（表首 AnyEnemies stopper 的门，:19398-19429 掷出） */
  anyEnemies: boolean;
  /** 竿/饵/配饰三源之一（:19230） */
  canFishInLava: boolean;
  /** 浮标 tile 坐标（Ocean 条件的横向边缘 380 判定 + UnderRockLayer 用） */
  x: number; y: number;
  waterTilesCount: number;
  rockLayer: number;
  maxTilesX: number;
  heightLevel: number;
  /** FishingCheck_ProbeForQuestFish（:20089-20104）结果：-1 = 无任务鱼 */
  questFish: number;
  hardMode: boolean;
  bloodMoon: boolean;
  combatBookWasUsed: boolean;
  /** Main.remixWorld（本仓无 remix 世界，调用方恒传 false） */
  remix: boolean;
  zones: ZoneInput;
  /** PrepareFishingContext 掷出的 rolled 旗 */
  rolled: RolledFlags;
  rng?: Rng;
}

export interface RolledFlags {
  corruption: boolean; crimson: boolean; jungle: boolean; snow: boolean; desert: boolean;
  infectedDesert: boolean; remixOcean: boolean;
}

/** PrepareFishingContext（:19451-19502）1:1：zone 撞车随机仲裁 + infected desert /
 *  remix ocean 掷骰。notTheBees 分支（:19462-19465）本仓无该彩蛋种子，恒跳过；
 *  remix 分支（:19466-19470/:19491）remix 恒 false 时不可达。 */
export function prepareFishingContext(
  zones: ZoneInput, heightLevel: number, y: number, rockLayer: number,
  rng: Rng = mathRng,
): RolledFlags {
  void heightLevel; void y; void rockLayer;    // remix 分支专用（:19466/:19491），remix 恒 false 不参与
  let corrupt = zones.corrupt;                 // flag  :19453
  let crimson = zones.crimson;                 // flag2 :19454
  const jungle = zones.jungle;                 // flag3 :19455（notTheBees 抑制不适用）
  let snow = zones.snow;                       // flag4 :19456
  // 腐化∩猩红 → 二选一（:19471-19481）
  if (corrupt && crimson) {
    if (rng.next(2) === 0) crimson = false; else corrupt = false;
  }
  // 雪∩丛林 1/2 弃雪（:19482-19485）
  if (snow && jungle && rng.next(2) === 0) snow = false;
  const desert = zones.desert;                 // flag6 :19486（flag5 地牢为真时弃沙漠 :19487-19490 由调用方折）
  return {
    corruption: corrupt, crimson, jungle, snow, desert,
    infectedDesert: desert && rng.next(2) === 0,   // :19499
    remixOcean: false,                             // :19491（remix 恒 false）
  };
}

// ==================== 规则表求值（FishDropRuleList.cs:10-21 + FishDropRule.cs:31-51）====================

/** 条件求值（AFishDropRulePopulator.cs 各字段 lambda 的归一化实现，行号见 cond.src） */
function condMatches(c: FishCond, ctx: FishingRollCtx): boolean {
  switch (c.t) {
    case 'hardMode': return ctx.hardMode === !!c.v;
    case 'inLava': return ctx.inLava;
    case 'inHoney': return ctx.inHoney;
    case 'junk': return ctx.junk;
    case 'crate': return ctx.crate;
    case 'anyEnemies': return ctx.anyEnemies;
    case 'canFishInLava': return ctx.canFishInLava;
    case 'dungeon': return ctx.zones.dungeon;
    case 'beach': return !!ctx.zones.beach;
    case 'hallow': return ctx.zones.hallow;
    case 'glowshroom': return !!ctx.zones.glowshroom;
    case 'trueDesert': return ctx.zones.desert;
    case 'trueSnow': return ctx.zones.snow;
    case 'remix': return ctx.remix;
    case 'height': {
      const h = ctx.heightLevel;
      switch (c.cmp) {
        case '==': return h === c.v;
        case '>': return h > (c.v as number);
        case '>=': return h >= (c.v as number);
        case '<': return h < (c.v as number);
        case 'in': return (c.v as number[]).includes(h);
        default: return false;
      }
    }
    case 'underRockLayer': return ctx.y >= ctx.rockLayer;
    case 'rolledCorruption': return ctx.rolled.corruption;
    case 'rolledCrimson': return ctx.rolled.crimson;
    case 'rolledJungle': return ctx.rolled.jungle;
    case 'rolledSnow': return ctx.rolled.snow;
    case 'rolledDesert': return ctx.rolled.desert;
    case 'rolledHallowDesert': return ctx.rolled.infectedDesert && ctx.zones.hallow;  // :147
    case 'originalOcean': return isOriginalOcean(ctx);                                 // :149/:257-264
    case 'rolledRemixOcean': return ctx.rolled.remixOcean;                             // :151
    case 'ocean': return ctx.rolled.remixOcean || isOriginalOcean(ctx);                // :153
    case 'water1000': return ctx.waterTilesCount > 1000;
    case 'bloodMoon': return ctx.bloodMoon;
    case 'didNotUseCombatBook': return !ctx.combatBookWasUsed;
    case 'questFish': return ctx.questFish === c.item;                                 // FishingConditions.cs:5-13
    case 'questFishRemix': return ctx.questFish === c.item && ctx.remix;               // FishingConditions.cs:15-27
    default: return false;
  }
}

/** IsOriginalOcean（AFishDropRulePopulator.cs:257-264）：heightLevel ≤ 1
 *  且 横向边缘 380 格内 且 水量 > 1000 */
function isOriginalOcean(ctx: FishingRollCtx): boolean {
  return ctx.heightLevel <= 1 && (ctx.x < 380 || ctx.x > ctx.maxTilesX - 380) && ctx.waterTilesCount > 1000;
}

/** 稀有档命中（AFishDropRulePopulator.cs:41-83 Rarity 表） */
function rarityMatches(rarity: string, ctx: FishingRollCtx): boolean {
  switch (rarity) {
    case 'Any': return true;
    case 'Legendary': return ctx.legendary;
    case 'VeryRare': return ctx.veryrare;
    case 'Rare': return ctx.rare;
    case 'Uncommon': return ctx.uncommon;
    case 'Common': return ctx.common;
    case 'UncommonOrCommon': return ctx.uncommon || ctx.common;
    case 'BombRarityOfNotLegendaryAndNotVeryRareAndUncommon':
      return !ctx.legendary && !ctx.veryrare && ctx.uncommon;   // :74
    default: return false;
  }
}

/** FishDropRuleList.TryGetItemDropType（FishDropRuleList.cs:10-21）1:1：
 *  按注册序逐条 Attempt，第一条命中即返回其物品 id；全表落空返回 0。
 *  单条 Attempt（FishDropRule.cs:31-51）：条件 → chance（Next(den) < num）→ 稀有档 → 池取一。 */
export function tryGetItemDrop(ctx: FishingRollCtx): number {
  const rng = ctx.rng ?? mathRng;
  for (let i = 0; i < FISH_DROP_RULES.length; i++) {
    const rule = FISH_DROP_RULES[i];
    let ok = true;
    for (const c of rule.conditions) {              // MeetsConditions（:53-64）
      if (!condMatches(c, ctx)) { ok = false; break; }
    }
    if (!ok) continue;
    if (rng.next(rule.den) >= rule.num) continue;   // :38-41（chance 先于稀有档）
    if (!rarityMatches(rule.rarity, ctx)) continue; // :42-45
    if (rule.items.length === 0) return 0;          // Stopper：Attempt 返回 true 但无物品
    return rule.items[rng.next(rule.items.length)]; // NextFromList（:46-49）
  }
  return 0;
}

// ==================== 渔夫任务链：每日选取（Main.cs:3799-3947）====================

/** AnglerQuestSwap 的世界门（Main.cs:3807-3866 逐条 if 的归一化形，见 json filters） */
export interface AnglerQuestGates {
  hardMode: boolean;
  /** 世界邪恶类型（WorldGen.crimson） */
  evil: 'corrupt' | 'crimson';
  /** downedBoss1||downedBoss2||downedBoss3||hardMode||downedSlimeKing||downedQueenBee（:3807） */
  anyBoss: boolean;
  /** Main.isThereAWorldSurface（Main.cs:2861 = worldSurface > 50） */
  hasWorldSurface: boolean;
}

function gatesPass(gates: Array<{ gate: string; want: boolean | string }>, g: AnglerQuestGates): boolean {
  return gates.every((x) => {
    switch (x.gate) {
      case 'hardMode': return g.hardMode === x.want;
      case 'evil': return g.evil === x.want;
      case 'anyBoss': return g.anyBoss === !!x.want;
      default: return false;
    }
  });
}

/** Main.AnglerQuestSwap 选取循环（Main.cs:3809-3945）1:1：
 *  Next(41) 取索引 → 命中拒绝表（世界门不满足）则重掷 → 无地表世界整族拒绝
 *  （noSurfaceItems）。返回 anglerQuest 索引。
 *  ★ 原版掷 Main.rand（世界主随机流，跨系统不可复现）；此处由调用方注入按
 *  「世界种子 × 天数」播种的独立 rng → 同种子同天数同任务鱼（读档/联机一致），
 *  拒绝语义逐条不变。 */
export function rollAnglerQuest(gates: AnglerQuestGates, rng: Rng = mathRng): number {
  const bannedItems = data.anglerQuest.filters
    .filter((f) => !gatesPass(f.gates, gates))
    .flatMap((f) => f.items);
  if (!gates.hasWorldSurface) bannedItems.push(...data.anglerQuest.noSurfaceItems);   // :3870-3944
  const banned = new Set(bannedItems);
  for (;;) {
    const q = rng.next(ANGLER_QUEST_ITEMS.length);     // :3812 rand.Next(41)
    if (!banned.has(ANGLER_QUEST_ITEMS[q])) return q;  // 拒绝表全过 → 采纳
  }
}

// ==================== 渔夫任务链：四段奖励（Player.cs:55351-55741）====================

/** 奖励产出（物品 id × 数量；货币以金币 73 / 银币 72 条目出现） */
export interface AnglerRewardGrant { id: number; stack: number }

/** GetAnglerRewardRarityMultiplier（Player.cs:55363-55368）1:1：
 *  ≤50 次：1-0.01n；≤100：0.5-0.005(n-50)；≤150：0.25-0.002(n-100)；>150：0.15——再 ×0.9 */
export function anglerRewardRarityMultiplier(questsDone: number): number {
  let m: number;
  if (questsDone <= 50) m = 1 - questsDone * 0.01;
  else if (questsDone <= 100) m = 0.5 - (questsDone - 50) * 0.005;
  else if (questsDone > 150) m = 0.15;
  else m = 0.25 - (questsDone - 100) * 0.002;
  return m * 0.9;
}

/** RemoveAnglerAccOptionsFromRewardPool（Player.cs:55704-55741）组合件表：
 *  玩家持有组合件 → 其全部零件从奖励池剔除 */
const ACC_COMBOS: Array<{ combo: number[]; parts: number[] }> = [
  { combo: [3721, 5064], parts: [2373, 2375, 2374] },                              // :55713-55718
  { combo: [3036, 3123, 3124, 5358, 5359, 5360, 5361], parts: [3120, 3037, 3096] }, // :55719-55729
  { combo: [5140, 5141, 5142, 5143, 5144, 5145, 5146], parts: [5139] },            // :55730-55738
];

export interface AnglerRewardOpts {
  /** 已完成任务数（交付时先 ++ 再结算，Main.cs:39671-39672） */
  questsDone: number;
  /** 本次交付的任务鱼 id（GetAnglerReward questItemType，:55351 入参） */
  questItemType: number;
  hardMode: boolean;
  /** Main.expertMode（:55611-55614 金钱段再 ×2）——R14-E8 补（1456 同款,曾缺=专家/大师金钱少一倍） */
  expertMode?: boolean;
  /** 玩家持有的物品类型全集（inventory/armor/bank×4/loadouts，DropAnglerAccByMissing :55647-55685） */
  ownedTypes: Set<number>;
  /** currentShoppingSettings.PriceAdjustment（:55356）——本仓无快乐度议价，缺省 0 */
  priceAdjustment?: number;
  rng?: Rng;
}

/** Player.GetAnglerReward（:55351-55361）四段主干的纯函数移植。
 *  返回按原版顺序的发放列表（MainReward → Decoration → Money → Bait）；
 *  2417/2498 的随带件已展开（:55499-55516）。 */
export function rollAnglerRewards(opts: AnglerRewardOpts): AnglerRewardGrant[] {
  const rng = opts.rng ?? mathRng;
  const n = opts.questsDone;
  let rarity = anglerRewardRarityMultiplier(n);
  rarity *= ((opts.priceAdjustment ?? 0) + 1) / 2;              // :55356
  const grants: AnglerRewardGrant[] = [];
  const push = (id: number, stack = 1) => grants.push({ id, stack });

  // ---- ① MainReward（:55370-55517）----
  let main = 0;
  let mainStack = 1;
  const milestone = ANGLER_REWARD_MILESTONES.find((m) => m.questsDone === n);
  if (milestone) {
    main = milestone.item;                                      // :55374-55393 switch
  } else if (opts.questItemType === 2451 && opts.hardMode) {
    main = rng.next(2) === 0 ? 5303 : 5302;                     // 蜂蜜鱼+困难 :55396-55399
  } else if (opts.questItemType === 2451 && !opts.hardMode && rng.next(2) === 0) {
    main = rng.next(2) === 0 ? 5303 : 5302;                     // 蜂蜜鱼+普通 :55401-55404
  } else {
    // 渔具池配件累计概率（:55406-55418）：
    //   num2 = 1-(1-1/⌊40r⌋)³·(1-1/⌊30r⌋)³·(1-1/⌊25r⌋)，再 ×0.8
    const pool = [2373, 2374, 2375, 3120, 3037, 3096, 5139];    // :55406
    let p = 1;
    for (let i = 0; i < 3; i++) p *= 1 - 1 / Math.floor(40 * rarity);   // :55408-55411
    for (let j = 0; j < 3; j++) p *= 1 - 1 / Math.floor(30 * rarity);   // :55412-55415
    p *= 1 - 1 / Math.floor(25 * rarity);                               // :55416
    const accChance = (1 - p) * 0.8;                                    // :55417-55418
    // 高阶奖励串（:55419-55468，先到先得）
    if (n > 75 && rng.next(Math.floor(250 * rarity)) === 0) main = 2294;                 // :55419-55423
    else if (opts.hardMode && n > 25 && rng.next(Math.floor(100 * rarity)) === 0) main = 2422; // :55424-55428
    else if (opts.hardMode && n > 10 && rng.next(Math.floor(70 * rarity)) === 0) main = 2494;  // :55429-55433
    else if (n > 10 && rng.next(Math.floor(70 * rarity)) === 0) main = 3031;                   // :55434-55438
    else if (n > 10 && rng.next(Math.floor(70 * rarity)) === 0) main = 3032;                   // :55439-55443
    else if (rng.next(Math.floor(80 * rarity)) === 0) main = 3183;                             // :55444-55448
    else if (rng.next(Math.floor(60 * rarity)) === 0) main = 2360;                             // :55449-55453
    else if (rng.next(Math.floor(60 * rarity)) === 0) main = 4067;                             // :55454-55458
    else if (rng.next(Math.floor(80 * rarity)) === 0) main = 2417;                             // :55459-55463
    else if (rng.next(Math.floor(80 * rarity)) === 0) main = 2498;                             // :55464-55468
    else {
      // DropAnglerAccByMissing（:55643-55702）：持有零件/组合件先剔除，池空则 bothered=false
      const avail = pool.filter((id) => !opts.ownedTypes.has(id)
        && !ACC_COMBOS.some((c) => c.combo.some((t) => opts.ownedTypes.has(t)) && c.parts.includes(id)));
      let bothered = avail.length > 0;                           // :55686-55688（池空直接 false）
      let picked = 0;
      if (bothered && rng.double() < accChance) {                // :55690-55699
        picked = avail[rng.next(avail.length)];
      }
      if (picked === 0 && !bothered && rng.double() < accChance) {
        picked = pool[rng.next(pool.length)];                    // :55474-55479（全池随机兜底）
      }
      if (picked > 0) main = picked;
      else {
        // 兜底三选一：药水族 2354/2355/2356 ×Next(2,6)（:55480-55494）
        const pick = rng.next(3);
        main = pick === 0 ? 2354 : pick === 1 ? 2355 : 2356;
        mainStack = rng.range(2, 6);
      }
    }
  }
  if (main > 0) {
    push(main, mainStack);
    if (main === 2417) { push(2418); push(2419); }               // :55499-55507
    else if (main === 2498) { push(2499); push(2500); }          // :55508-55516
  }

  // ---- ② Decoration（:55519-55552）----
  {
    const from = 1 - rarity;                                     // :55521 value = 1 - rarityReduction
    const chance = from + (1 - from) * Math.min(1, n / 100);     // Lerp(value,1,min(1,n/100)) :55523
    if (chance >= 1 || rng.double() <= chance) {                 // :55524
      const decor = [2442, 2443, 2444, 2445, 2497, 2495, 2446, 2447, 2448, 2449,
        2490, 2496, 5235, 5252, 5256, 5259, 5263, 5264, 5265];  // Next(19) switch :55528-55549
      push(decor[rng.next(19)]);
    }
  }

  // ---- ③ Money（:55599-55640）----
  {
    let money = Math.floor((n + 50) / 2);                        // :55602
    money = Math.floor(money * rng.range(50, 201) * 0.015);      // :55603
    money = Math.floor(money * 1.5);                             // :55604
    if (opts.hardMode) money *= 2;                               // :55605-55608
    if (opts.expertMode) money *= 2;                             // :55611-55614（R14-E8）
    if (money > 100) {                                           // :55613-55626 金币
      money = Math.floor(money / 100);
      if (money > 10) money = 10;
      if (money < 1) money = 1;
      push(73, money);
    } else {                                                     // :55627-55639 银币
      if (money > 99) money = 99;
      if (money < 1) money = 1;
      push(72, money);
    }
  }

  // ---- ④ Bait（:55554-55597）----
  if (rng.next(Math.floor(100 * rarity)) <= 50) {                // :55556
    let bait: number;
    if (rng.next(Math.floor(15 * rarity)) === 0) bait = 2676;    // 大师诱饵 :55559-55562
    else if (rng.next(Math.floor(5 * rarity)) === 0) bait = 2675;// :55563-55566
    else bait = 2674;                                            // :55567-55570
    let stack = 1;
    for (const denom of [25, 50, 100, 150, 200, 250]) {          // :55571-55594 六档增量
      if (rng.next(denom) <= n) stack++;
    }
    push(bait, stack);
  }
  return grants;
}

// ==================== 钓鱼力乘区（Player.cs:41560-41604）====================

/** Fishing_GetPowerMultiplier（Player.cs:41560-41604 1:1）：天气/时段/月相/血月乘区。
 *  time = 当时段 tick（昼 0-54000 / 夜 0-32400）。 */
export function fishingPowerMultiplier(ctx: {
  raining: boolean; cloudBGAlpha: number; dayTime: boolean; time: number;
  moonPhase: number; bloodMoon: boolean;
}): number {
  let m = 1;
  if (ctx.raining) m *= 1.2;
  if (ctx.cloudBGAlpha > 0) m *= 1.1;
  if (ctx.dayTime && (ctx.time < 5400 || ctx.time > 48600)) m *= 1.3;          // 晨昏 :41571-41574
  if (ctx.dayTime && ctx.time > 16200 && ctx.time < 37800) m *= 0.8;           // 正午 :41575-41578
  if (!ctx.dayTime && ctx.time > 6480 && ctx.time < 25920) m *= 0.8;           // 前半夜 :41579-41582
  if (ctx.moonPhase === 0) m *= 1.1;                                           // 满月 :41583-41586
  if (ctx.moonPhase === 1 || ctx.moonPhase === 7) m *= 1.05;                   // :41587-41590
  if (ctx.moonPhase === 3 || ctx.moonPhase === 5) m *= 0.95;                   // :41591-41594
  if (ctx.moonPhase === 4) m *= 0.9;                                           // 新月 :41595-41598
  if (ctx.bloodMoon) m *= 1.1;                                                 // :41599-41602
  return m;
}

// 注：旧精简池 API（pickPool/rollCatch/rollRarities）已删除——结算一律走
// tryGetItemDrop 规则表；引用方 tests/fishing-r7.test.ts 已同步改写。
