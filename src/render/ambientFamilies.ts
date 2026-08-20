// 天空氛围选族纯函数 + SkyEntityType 映射（自 SkyRenderer 抽出的共享数据层，
// 2026-08-20 MP 氛围联机批：server/src/room.ts 的 AmbienceServer 1:1 复用本表，
// 故独立成无渲染依赖模块——SkyRenderer 同名导出转 re-export 兼容既有消费方）。
// 标杆：Terraria1456
//   Terraria.GameContent.Ambience/AmbienceServer.cs（条件表 :60-84 / Update :96-129）
//   Terraria.GameContent.Ambience/SkyEntityType.cs（注册序 id——module100 线上编码）

/** 天空装饰族（AmbienceServer.cs:60-84 十七族 + Meteor :1316 已由 spawnSkyMeteor 单接）。
 *  BoneSerpent（:1078）为空类且 Spawn 分发 :1446-1531 无 case——原版死代码，不实装。 */
export type AmbientFamily =
  | 'birds' | 'wyvern' | 'airship' | 'airballoon' | 'eyeball' | 'butterflies'
  | 'lostkite' | 'vulture' | 'bats' | 'pixieposse' | 'seagulls' | 'slimeBalloons'
  | 'gastropod' | 'pegasus' | 'eos' | 'crimera' | 'hellbats';

/** SkyEntityType.cs 注册序（module100 u8 type 的线上值；Meteor=5 走 spawnSkyMeteor
 *  单链、BoneSerpent=6 死码——两型不入本表） */
export const AMBIENT_FAMILY_SKY_TYPE: Record<AmbientFamily, number> = {
  birds: 0,          // BirdsV
  wyvern: 1,
  airship: 2,
  airballoon: 3,
  eyeball: 4,
  bats: 7,
  butterflies: 8,
  lostkite: 9,
  vulture: 10,
  pixieposse: 11,
  seagulls: 12,
  slimeBalloons: 13,
  gastropod: 14,
  pegasus: 15,
  eos: 16,           // EaterOfSouls
  crimera: 17,
  hellbats: 18,
};

const SKY_TYPE_TO_FAMILY = new Map<number, AmbientFamily>(
  Object.entries(AMBIENT_FAMILY_SKY_TYPE).map(([f, id]) => [id as number, f as AmbientFamily]),
);

/** module100 到达型 → 族（未知型/单接型 null——调用方静默忽略，前向兼容） */
export function ambientFamilyOfSkyType(id: number): AmbientFamily | null {
  return SKY_TYPE_TO_FAMILY.get(id) ?? null;
}

/** 选族判定输入（AmbienceServer 各判定 + 玩家高度带；新增字段均可选，向后兼容） */
export interface AmbientSpawnInput {
  dayTime: boolean;
  /** Main.IsItRaining = cloudAlpha>0（Main.cs:2659） */
  raining: boolean;
  eclipse: boolean;
  bloodMoon: boolean;
  pumpkinMoon: boolean;
  snowMoon: boolean;
  /** 次级条件（AmbienceServer.cs:77-84）：各族 Zone 门 */
  zoneHallow: boolean;
  /** 玩家在可见天空高度带（AmbienceServer.cs:190-193：position.Y ≤ worldSurface*16+1600） */
  playerAtSkyHeight: boolean;
  /** Main.rand.Next(5) 掷点 0-4（:119：<3 时走放宽列表 → 60% 概率忽略次级条件） */
  roll5: number;
  /** source2.ElementAt(Next(num)) 的均匀选点 0-1 */
  pick: number;
  // ---- 全族扩展（天空视觉深化批；均缺省 false → 只影响对应族） ----
  zoneDesert?: boolean;       // Vulture（:77）
  zoneBeach?: boolean;        // Seagulls（:79）
  zoneJungle?: boolean;       // Bats（:84）
  zoneCorrupt?: boolean;      // EaterOfSouls（:82）
  zoneCrimson?: boolean;      // Crimera（:83）
  /** Main.hardMode（Wyvern 门 :61） */
  hardMode?: boolean;
  /** Main.IsItAHappyWindyDay = _shouldUseWindyDayMusic（Main.cs:2976） */
  windyDay?: boolean;
  /** IsSunset（:39-46：白天 time>40500 → timeOfDay>0.625）——Bats 黄昏支 :68 */
  sunset?: boolean;
  /** NPC.TooWindyForButterflies（NPC.cs:6801：|windSpeedTarget|≥0.4） */
  tooWindyForButterflies?: boolean;
  /** NPC.butterflyChance<6（:65；每日黎明掷，<6 仅约 13% 的日子） */
  butterflyChanceLow?: boolean;
  /** 玩家地狱高度带（:195-198：position.Y ≥ (UnderworldLayer-100)×16）——Hellbats 专属高度门 */
  playerAtHellHeight?: boolean;
  /** 月总在场（AnActiveSkyConflictsWithAmbience :1362-1369 → Ambience 整体禁出） */
  moonLordActive?: boolean;
}

/**
 * 天空装饰选族纯函数（AmbienceServer.Update :96-129 一比一，全 17 族）：
 *  ① source = 主条件（:60-76）成立的族（注册序 = Dictionary 插入序）；
 *  ② source2 严格列表 = 高度门（:87-94：Hellbats 走地狱带门、其余走天空带门）
 *     + 有次级条件且满足（:117）；
 *  ③ 严格列表空或 roll5<3（60%）→ 放宽到「高度门 + 无次级条件或满足」（:119-123）；
 *  ④ 均匀选点（:126）。
 *  月总天空冲突（:1362-1369）在 :1383 直接 Deactivate——此处以 null 表达。
 */
export function pickAmbientFamily(i: AmbientSpawnInput): AmbientFamily | null {
  if (i.moonLordActive) return null;                                // :1362-1369/:1383
  const sunny = !i.raining && i.dayTime && !i.eclipse;              // :30-37 IsSunnyDay
  const calmNight = !i.raining && !i.dayTime && !i.bloodMoon && !i.pumpkinMoon && !i.snowMoon; // :48-55
  const windy = i.windyDay ?? false;
  const sunset = i.sunset ?? false;
  const butterfliesOK = sunny && !windy && !(i.tooWindyForButterflies ?? false)
    && (i.butterflyChanceLow ?? false);                            // :65
  /** [族, 主条件, 次级条件(undefined=无), 是否地狱高度门]——顺序 = _spawnConditions 注册序 :60-76 */
  const table: Array<[AmbientFamily, boolean, boolean | undefined, boolean]> = [
    ['birds', sunny, undefined, false],                             // :60
    ['wyvern', sunny && (i.hardMode ?? false), undefined, false],   // :61
    ['airship', sunny && windy, undefined, false],                  // :62
    ['airballoon', sunny && !windy, undefined, false],              // :63
    ['eyeball', !i.dayTime, undefined, false],                      // :64
    ['butterflies', butterfliesOK, undefined, false],               // :65
    ['lostkite', i.dayTime && !i.eclipse && windy, undefined, false], // :66
    ['vulture', sunny, i.zoneDesert ?? false, false],               // :67 + :77
    ['bats', (sunset && sunny) || calmNight, i.zoneJungle ?? false, false], // :68 + :84
    ['pixieposse', sunny || calmNight, i.zoneHallow, false],        // :69 + :78
    ['seagulls', sunny, i.zoneBeach ?? false, false],               // :70 + :79
    ['slimeBalloons', sunny && windy, undefined, false],            // :71
    ['gastropod', calmNight, i.zoneHallow, false],                  // :72 + :80
    ['pegasus', sunny, i.zoneHallow, false],                        // :73 + :81
    ['eos', sunny || calmNight, i.zoneCorrupt ?? false, false],     // :74 + :82
    ['crimera', sunny || calmNight, i.zoneCrimson ?? false, false], // :75 + :83
    ['hellbats', true, undefined, true],                            // :76（:89-91 地狱高度门）
  ];
  const source = table.filter((row) => row[1]);
  if (!source.length) return null;                                  // :108-111
  const heightOk = (row: typeof source[number]) =>
    row[3] ? (i.playerAtHellHeight ?? false) : i.playerAtSkyHeight; // :87-94
  let pool = source.filter((row) => heightOk(row) && row[2] === true);   // :117 严格列表
  if (pool.length === 0 || i.roll5 < 3) {                           // :119
    pool = source.filter((row) => heightOk(row) && row[2] !== false);    // :121 放宽列表
  }
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(i.pick * pool.length))][0];  // :126
}
