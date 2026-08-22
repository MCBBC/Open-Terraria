// 彩蛋种子解析（对齐原版两条独立路由，1456 为基线、1457 增量注明）：
//  ① 特殊种子 = WorldGenerationOptions.GetOptionFromSeedText（WorldGenerationOptions.cs:66-90）：
//     int 路 = WorldFileData.TranslateSeed(原文) 比对 SpecialSeedValues（零填充/正负号/
//     CRC32 碰撞串自动命中）；文本路 = 归一化（lower+剥 [^a-z0-9]）比对 SpecialSeedNames。
//     注册序遍历、首中即返（:70-88）。
//  ② 秘密种子 = WorldGen.CheckInputForSecretSeed（WorldGen.cs:493-520，独立于
//     AWorldGenerationOption 体系）：归一化后与 SecretSeed 明文缓存/BCrypt 注册码比对，
//     明文匹配 = 归一化全等。37 枚明文（wiki 社区破解）已经本地 BCrypt 复算器
//     （Secrets.ToSecret 1:1 移植）对 1456 WorldGen.cs:340-408 + 1457 :411/:413 注册码
//     逐枚验证 37/37（2026-08-22，/tmp/s0-verify）。
// 匹配规则：去分隔符后小写比较（原版语义）。
import { translateSeed } from '../../core/rng';

export interface SeedFlags {
  // ── 特殊种子九位（AWorldGenerationOption → Main.* 世界旗标）──
  getGoodWorld?: boolean;    // for the worthy（Main.getGoodWorld）
  drunkWorld?: boolean;      // 05162020 数字路由（Main.drunkWorld）
  noTraps?: boolean;         // no traps（Main.noTrapsWorld）
  theConstant?: boolean;     // the constant（Main.dontStarveWorld）
  tenthAnniversary?: boolean;// celebrationmk10（Main.tenthAnniversaryWorld）
  remix?: boolean;           // don't dig up（Main.remixWorld）
  everything?: boolean;      // getfixedboi（Main.zenithWorld；组合种子）
  skyblock?: boolean;        // 1.4.5.6 新增 skyblock（Main.skyblockWorld）
  notTheBees?: boolean;      // not the bees（Main.notTheBeesWorld）

  // ── 秘密种子 37 位（WorldGen.SecretSeed 注册序；明文路由见 SECRET_ROUTES）──
  //  涂装四件（消费端 = FinalSeedCleanupPass.ts FinalSeedCleanup_Paint/全图涂装 pass 族）
  paintEverythingGray?: boolean;       // "monochrome"（1456 WorldGen.cs:340）
  paintEverythingNegative?: boolean;   // "negative infinity"（:342）
  coatEverythingEcho?: boolean;        // "invisible plane"（:344；Echo 涂=隐身+invisibleWall 位）
  coatEverythingIlluminant?: boolean;  // "x-ray vision"（:346）
  noSurface?: boolean;                 // "mole people"（:348）
  extraLivingTrees?: boolean;          // "save the rainforest"（:350）
  extraFloatingIslands?: boolean;      // "the care bears movie"（:352）
  errorWorld?: boolean;                // "I am error"（:354；DoErrorWorldFinish/联动族）
  graveyardBloodmoonStart?: boolean;   // "night of the living dead"（:356）——墓园 pass
  //  的第二触发源（WorldGen.cs:18117-18120），运行时血月起手
  surfaceIsInSpace?: boolean;          // "such great heights"（:358）
  rainsForAYear?: boolean;             // "bring a towel"（:360；DoRainsForAYear 永雨）
  biggerAbandonedHouses?: boolean;     // "abandoned manors"（:362；GenerateBiggerAbandonedHouses）
  randomSpawn?: boolean;               // "how did I get here"（:364）
  addTeleporters?: boolean;            // "beam me up"（:366）
  startInHardmode?: boolean;           // "too easy"（:368；DoStartInHardmode）
  noInfection?: boolean;               // "fish mox"（:370；DoNoInfection）
  hallowOnTheSurface?: boolean;        // "does that sparkle"（:372；DoHallowOnSurface）
  infectedSeed?: boolean;              // "purify this"（:374 worldIsInfected → Main.infectedSeed，
  //  InitializeSecretSeeds :554 置位；SceneMetrics 向日葵压制 ×3 等读取位）
  surfaceIsMushrooms?: boolean;        // "toadstool"（:376）
  surfaceIsDesert?: boolean;           // "sandy britches"（:378）
  pooEverywhere?: boolean;             // "truck stop"（:380）
  noSpiderCaves?: boolean;             // "arachnophobia"（:382）
  actuallyNoTraps?: boolean;           // "more traps please"（:384；DoActuallyNoTraps）
  rainbowStuff?: boolean;              // "rainbow road"（:386；GenerateRainbowGlowsticks）
  digExtraHoles?: boolean;             // "jagged rocks"（:388）
  roundLandmasses?: boolean;           // "planetoids"（:390）
  extraLiquid?: boolean;               // "waterpark"（:392）
  portalGunInChests?: boolean;         // "we don't even test for that"（:394）
  worldIsFrozen?: boolean;             // "winter is coming"（:396）
  halloweenGen?: boolean;              // "pumpkin season"（:398；生成期南瓜）
  endlessHalloween?: boolean;          // "hocus pocus"（:400 → Main.forceHalloweenForever）
  endlessChristmas?: boolean;          // "jingle all the way"（:402 → Main.forceXMasForever）
  vampireSeed?: boolean;               // "what a horrible night to have a curse"（:404 vampirism →
  //  Main.vampireSeed，:550 置位；运行时消费 Player.cs:28191-28238 阳光炽灼全链等）
  teamBasedSpawns?: boolean;           // "royale with cheese"（:406 → Main.teamBasedSpawnsSeed）
  dualDungeons?: boolean;              // "double daring dangers"（:408 → Main.dualDungeonsSeed）——
  //  placeTrap_CanContinue 界拒/AddBuriedChest SkipOnDualDungeons/DungeonLayoutProvider 双地牢（批 F）
  moreLightning?: boolean;             // "electric boogaloo"（1457 WorldGen.cs:411；旗标版本≥323。
  //  1456 基线全库无此二旗=现态即终态；运行时消费 SpawnStormLightning :72436 等，批 F）
  noLightning?: boolean;               // "calm before the storm"（1457 :413；禁雷）

  // ── 1457 Variations 子旗标（★非明文路由——SecretSeed.Variations.* 是 1457 新增的
  //  「派生组合门」属性类（1457 WorldGen.cs:43-230+），由旗标组合 + activeSecretSeedCount
  //  推导（例 paintEverythingGrayJustTreasure = gray.Enabled && count>=4、grayUseWhite =
  //  gray.Enabled && worldIsFrozen.Enabled、echoJustSomeThings = echo.Enabled && count>=4），
  //  没有独立触发词——parseSeed 恒不置位。此处仅作消费端形参预留
  //  （FinalSeedCleanupPass.ts 单格涂装分支已按 1457 形参接线），批 F 落地推导式）──
  echoJustSomeThings?: boolean;        // coatEverythingEchoJustSomeThings
  echoJustInnerBlocks?: boolean;       // coatEverythingJustInnerBlocks
  illuminantJustSomeThings?: boolean;  // coatEverythingIlluminantJustSomeThings
  illuminantJustRandomSpots?: boolean; // coatEverythingIlluminantJustRandomSpots
  grayUseWhite?: boolean;              // paintEverythingGrayUseWhite（漆 26 替 27）
  grayJustTreasure?: boolean;          // paintEverythingGrayJustTreasure
  grayJustTheSurface?: boolean;        // paintEverythingGrayJustTheSurface
  negativeJustUnderground?: boolean;   // paintEverythingNegativeJustUnderground
  negativeJustSomeThings?: boolean;    // paintEverythingNegativeJustSomeThings
}

// ── 特殊种子注册表（WorldGenerationOptions.cs:27-40 注册序逐项 1:1；
//    values/names 与各 WorldSeedOption_*.cs 构造器逐字对表）──
const SPECIAL_OPTIONS: ReadonlyArray<{
  values: readonly number[];             // SpecialSeedValues（int 路：TranslateSeed(原文) 比对）
  names: readonly string[];              // SpecialSeedNames（文本路：归一化全等比对）
  apply: (f: SeedFlags) => void;
}> = [
  // WorldSeedOption_Normal（无路由）
  { values: [], names: [], apply: () => {} },
  // WorldSeedOption_NotTheBees
  { values: [], names: ['notthebees'], apply: (f) => { f.notTheBees = true; } },
  // WorldSeedOption_Drunk：唯一纯数字路由特殊种子（SpecialSeedNames 为空——
  //  "drunkworld" 文本非原版触发，曾误接已删）
  { values: [5162020], names: [], apply: (f) => { f.drunkWorld = true; } },
  // WorldSeedOption_Anniversary：int+文本双路（5162021/5162011 = 05162021 零填充/
  //  负号/CRC 碰撞串经 int 路自动命中）
  { values: [5162021, 5162011], names: ['celebrationmk10'], apply: (f) => { f.tenthAnniversary = true; } },
  // WorldSeedOption_DontStarve（饥荒世界；Main.dontStarveWorld 消费源 = 稀有云 1/25
  //  直通门 Cloud.cs:139/215-223）
  { values: [], names: ['constant', 'theconstant', 'eye4aneye', 'eyeforaneye'], apply: (f) => { f.theConstant = true; } },
  // WorldSeedOption_ForTheWorthy
  { values: [], names: ['fortheworthy'], apply: (f) => { f.getGoodWorld = true; } },
  // WorldSeedOption_NoTraps
  { values: [], names: ['notraps'], apply: (f) => { f.noTraps = true; } },
  // WorldSeedOption_Remix
  { values: [], names: ['dontdigup'], apply: (f) => { f.remix = true; } },
  // WorldSeedOption_Everything：Dependencies 七件套全置（Remix/Drunk/NotTheBees/NoTraps/
  //  DontStarve/Anniversary/ForTheWorthy，OnEnabledStateChanged 逐依赖级联置位——
  //  2026-08-22 补齐 noTraps/theConstant/tenthAnniversary 三缺位，原「殊途同归」校准
  //  退役：墓园门 graveyardSeedGate 在全七件下仍被 !tenthAnniversary 否决，与原版
  //  zenith 世界逐门同值）。remix×getGood = SpecialSeedFeatures.Mechdusa（物品变体
  //  Stronger/Weaker/DisabledBossSummon/Enabled 全激活）
  { values: [], names: ['getfixedboi'], apply: (f) => {
    f.everything = true; f.remix = true; f.drunkWorld = true; f.notTheBees = true;
    f.noTraps = true; f.theConstant = true; f.tenthAnniversary = true; f.getGoodWorld = true;
  } },
  // WorldSeedOption_Skyblock（1.4.5.6 新增）
  { values: [], names: ['skyblock'], apply: (f) => { f.skyblock = true; } },
];

// ── 秘密种子明文路由（37 枚，WorldGen.cs 1456:340-408 + 1457:411/413 注册序；
//    明文 = wiki 社区破解，本地 BCrypt 复算器对注册码 37/37 验证）──
const SECRET_ROUTES: ReadonlyArray<[RegExp, (f: SeedFlags) => void]> = [
  [/^monochrome$/, (f) => { f.paintEverythingGray = true; }],
  [/^negativeinfinity$/, (f) => { f.paintEverythingNegative = true; }],
  [/^invisibleplane$/, (f) => { f.coatEverythingEcho = true; }],
  [/^xrayvision$/, (f) => { f.coatEverythingIlluminant = true; }],
  [/^molepeople$/, (f) => { f.noSurface = true; }],
  [/^savetherainforest$/, (f) => { f.extraLivingTrees = true; }],
  [/^thecarebearsmovie$/, (f) => { f.extraFloatingIslands = true; }],
  [/^iamerror$/, (f) => { f.errorWorld = true; }],
  [/^nightofthelivingdead$/, (f) => { f.graveyardBloodmoonStart = true; }],
  [/^suchgreatheights$/, (f) => { f.surfaceIsInSpace = true; }],
  [/^bringatowel$/, (f) => { f.rainsForAYear = true; }],
  [/^abandonedmanors$/, (f) => { f.biggerAbandonedHouses = true; }],
  [/^howdidigethere$/, (f) => { f.randomSpawn = true; }],
  [/^beammeup$/, (f) => { f.addTeleporters = true; }],
  [/^tooeasy$/, (f) => { f.startInHardmode = true; }],
  [/^fishmox$/, (f) => { f.noInfection = true; }],
  [/^doesthatsparkle$/, (f) => { f.hallowOnTheSurface = true; }],
  [/^purifythis$/, (f) => { f.infectedSeed = true; }],
  [/^toadstool$/, (f) => { f.surfaceIsMushrooms = true; }],
  [/^sandybritches$/, (f) => { f.surfaceIsDesert = true; }],
  [/^truckstop$/, (f) => { f.pooEverywhere = true; }],
  [/^arachnophobia$/, (f) => { f.noSpiderCaves = true; }],
  [/^moretrapsplease$/, (f) => { f.actuallyNoTraps = true; }],
  [/^rainbowroad$/, (f) => { f.rainbowStuff = true; }],
  [/^jaggedrocks$/, (f) => { f.digExtraHoles = true; }],
  [/^planetoids$/, (f) => { f.roundLandmasses = true; }],
  [/^waterpark$/, (f) => { f.extraLiquid = true; }],
  [/^wedonteventestforthat$/, (f) => { f.portalGunInChests = true; }],
  [/^winteriscoming$/, (f) => { f.worldIsFrozen = true; }],
  [/^pumpkinseason$/, (f) => { f.halloweenGen = true; }],
  [/^hocuspocus$/, (f) => { f.endlessHalloween = true; }],
  [/^jinglealltheway$/, (f) => { f.endlessChristmas = true; }],
  // 吸血鬼秘密种子（vampirism；Castlevania II 致敬。原版凭 BCrypt 哈希匹配——
  //  明文为社区试出；匹配口径同其它条目：去全部非字母数字后小写全等）
  [/^whatahorriblenighttohaveacurse$/, (f) => { f.vampireSeed = true; }],
  [/^royalewithcheese$/, (f) => { f.teamBasedSpawns = true; }],
  [/^doubledaringdangers$/, (f) => { f.dualDungeons = true; }],
  // 1457 增量两枚（注册码 WorldGen.cs:411/:413；存档版本门 ≥323，1456=319 无此二旗）
  [/^electricboogaloo$/, (f) => { f.moreLightning = true; }],
  [/^calmbeforethestorm$/, (f) => { f.noLightning = true; }],
];

export function parseSeed(rawSeed: string): { flags: SeedFlags; seedText: string; /** UI 展示用特殊世界名（无则 null） */ specialName: string | null } {
  // 归一化 = WorldGenerationOptions.GetOptionFromSeedText :69：
  // `Regex.Replace(processedSeed.ToLower(), "[^a-z0-9]+", "")`——去全部非字母数字
  // （"celebration mk10!" → "celebrationmk10" 亦命中）
  const normalized = rawSeed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // int 路比对基数 = WorldFileData.TranslateSeed(原文)（:68，对未归一化原文——
  //  数字串 Abs / 其余 CRC32；"05162020"/"-5162020"/CRC 碰撞串在此命中）
  const seedInt = translateSeed(rawSeed);
  const flags: SeedFlags = {};
  // ① 特殊种子：注册序遍历、首中即返（原版 :70-88 逐 option 先 values 后 names）
  for (const opt of SPECIAL_OPTIONS) {
    if (opt.values.includes(seedInt) || opt.names.includes(normalized)) {
      opt.apply(flags);
      break;
    }
  }
  // ② 秘密种子：独立体系（CheckInputForSecretSeed），与①可叠加、明文互不碰撞
  for (const [re, apply] of SECRET_ROUTES) {
    if (re.test(normalized)) {
      apply(flags);
      break;
    }
  }
  // 原版还支持「大小.难度.邪恶.种子」复合格式（如 1.2.1.abc）——保留原文作 seed
  const specialName = flags.everything ? 'get fixed boi'
    : flags.drunkWorld ? '05162020'
    : flags.notTheBees ? 'not the bees'
    : flags.getGoodWorld ? 'for the worthy'
    : flags.theConstant ? 'the constant'
    : flags.remix ? "don't dig up"
    : flags.skyblock ? 'skyblock'
    : flags.tenthAnniversary ? 'celebrationmk10'
    : flags.noTraps ? 'no traps'
    : null;
  return { flags, seedText: rawSeed, specialName };
}
