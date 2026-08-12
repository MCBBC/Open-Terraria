// 钓鱼渔获表（R7）。原版 FishingRules 条目 400+（深度/群系/月相/任务鱼），此处按
// 分层×液体×群系精简为常见池（id 均经 l10n 实名核对）；权威后续可全量提取扩表。
export interface FishPool { fish: number[]; crates?: number[]; junk?: number[] }

export const FISH_POOLS: Record<string, FishPool> = {
  // 地表（海洋区由 Game 侧判定换 ocean 池）
  surface: {
    fish: [2290, 2297, 2298, 2299, 2301, 2308], // 鲈鱼/鳟鱼/三文鱼/大西洋鳕/红鲷/金鲤鱼
    crates: [2334, 2335, 2336],                   // 木匣/铁匣/金匣
    junk: [2339, 2337, 753],                      // 锡罐/旧鞋/海草
  },
  ocean: {
    fish: [2299, 2301, 2302, 2308, 2488],         // 鳕鱼/红鲷/霓虹脂鲤/金鲤/热带梭鱼
    crates: [2334, 2335, 2336],
    junk: [2339, 2337],
  },
  cavern: {
    fish: [2303, 2309, 2310, 2311, 2330],         // 装甲洞穴鱼/镜面鱼/七彩矿鱼/斑驳油鱼/紫挥棒鱼
    crates: [2334, 2335],
    junk: [2339, 2337],
  },
  // 腐化/猩红/神圣/丛林/雪原（cavern/surface 深度均可，Game 按 scene 选池）
  corrupt: { fish: [2318, 2319] },                // 黑檀锦鲤/血腥食人鱼(腐化共用 ebonkoi)
  crimson: { fish: [2305, 2319] },                // 猩红虎鱼/血腥食人鱼
  hallow: { fish: [2310, 2420] },                 // 七彩矿鱼/和风鱼
  jungle: { fish: [2486, 2330] },                 // 泥鱼/紫挥棒鱼
  snow: { fish: [2298, 2330] },
  honey: { fish: [2314] },                        // 蜂蜜鱼
  lava: { fish: [2312, 2315] },                   // 闪鳍锦鲤/黑曜石鱼（需熔线钓钩）
};

/** 按渔获场景选池（Game 调用：液体优先，再群系，再深度） */
export function pickPool(opts: {
  liquid: 'water' | 'lava' | 'honey'; zone: string; depth: 'sky' | 'surface' | 'cavern' | 'underworld';
  zoneOcean: boolean;
}): FishPool {
  if (opts.liquid === 'lava') return FISH_POOLS.lava;
  if (opts.liquid === 'honey') return FISH_POOLS.honey;
  if (opts.zoneOcean && opts.depth === 'surface') return FISH_POOLS.ocean;
  const biomePool = FISH_POOLS[opts.zone];
  if (biomePool && opts.zone !== 'forest') return biomePool;
  return opts.depth === 'cavern' || opts.depth === 'underworld' ? FISH_POOLS.cavern : FISH_POOLS.surface;
}

/** 稀有档独立 roll（FishingCheck_RollDropLevels :20106-20167：各档独立掷，
 *  分母 = max(⌊4500/L⌉类整除⌋, 下限)——可同时命中，不互斥） */
export interface DropRarity { legendary: boolean; veryrare: boolean; rare: boolean; uncommon: boolean }
export function rollRarities(L: number): DropRarity {
  const one = (num: number, min: number) => Math.random() < 1 / Math.max(Math.floor(num / Math.max(1, L)), min);
  return {
    legendary: one(4500, 6),   // :20134/20160
    veryrare: one(2250, 5),    // :20130/20156
    rare: one(1050, 4),        // :20126/20152
    uncommon: one(300, 3),     // :20122/20148
  };
}

/** 掷一次渔获（FishingCheck 规则表序：Junk→Crate→RareDrops→普通池；
 *  GameContentFishDropPopulator 注册序 :12-30，第一条命中即返回）。
 *  power = 钓鱼力（含乘区）；ctx = 血月/战斗书旗标（4382 门 :19650-19654） */
export function rollCatch(
  power: number, pool: FishPool, cratePotion: boolean,
  ctx?: { rarity: DropRarity; bloodMoon: boolean; combatBook: boolean },
): number {
  const L = Math.max(1, Math.floor(power));
  // junk（原版 :19326 双 Next(50) 门——水量未跟踪，用低力近似公式）
  const junkChance = Math.max(0.05, 0.35 - power * 0.004);
  if (pool.junk?.length && Math.random() < junkChance) {
    return pool.junk[Math.floor(Math.random() * pool.junk.length)];
  }
  // crate（:20113-20117：10%，宝匣药水 +15）
  if (pool.crates?.length && Math.random() < 0.1 + (cratePotion ? 0.15 : 0)) {
    return pool.crates[Math.floor(Math.random() * pool.crates.length)];
  }
  // RareDrops 传说族（:196-201，串行独立 roll 各自失败才落下一条）：
  //   血月 4382（须 !combatBookWasUsed）→ 血月 5240 → 2423/3225/2420
  if (ctx?.rarity) {
    if (ctx.rarity.legendary && ctx.bloodMoon && !ctx.combatBook && Math.random() < 1 / 3) return 4382; // Next(3)==0（:19650-19654）
    if (ctx.rarity.legendary && ctx.bloodMoon && Math.random() < 0.5) return 5240;
    if (ctx.rarity.legendary && Math.random() < 0.2) return 2423;
    if (ctx.rarity.legendary && Math.random() < 0.2) return 3225;
    if (ctx.rarity.legendary && Math.random() < 0.1) return 2420;
  }
  return pool.fish[Math.floor(Math.random() * pool.fish.length)];
}

/** Fishing_GetPowerMultiplier（Player.cs:41560-41605 1:1）：天气/时段/月相/血月乘区。
 *  time = 当时段 tick（昼 0-54000 / 夜 0-32400）。 */
export function fishingPowerMultiplier(ctx: {
  raining: boolean; cloudBGAlpha: number; dayTime: boolean; time: number;
  moonPhase: number; bloodMoon: boolean;
}): number {
  let m = 1;
  if (ctx.raining) m *= 1.2;
  if (ctx.cloudBGAlpha > 0) m *= 1.1;
  if (ctx.dayTime && (ctx.time < 5400 || ctx.time > 48600)) m *= 1.3;          // 晨昏
  if (ctx.dayTime && ctx.time > 16200 && ctx.time < 37800) m *= 0.8;           // 正午
  if (!ctx.dayTime && ctx.time > 6480 && ctx.time < 25920) m *= 0.8;           // 前半夜
  if (ctx.moonPhase === 0) m *= 1.1;                                           // 满月
  if (ctx.moonPhase === 1 || ctx.moonPhase === 7) m *= 1.05;
  if (ctx.moonPhase === 3 || ctx.moonPhase === 5) m *= 0.95;
  if (ctx.moonPhase === 4) m *= 0.9;                                           // 新月
  if (ctx.bloodMoon) m *= 1.1;
  return m;
}
