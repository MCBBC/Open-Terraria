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
  // ── 1457 增量两枚（注册码 WorldGen.cs:411/:413；存档版本门 ≥323，1456=319 无此二旗）──
  moreLightning?: boolean;             // "electric boogaloo"（1457 WorldGen.cs:411）
  noLightning?: boolean;               // "calm before the storm"（1457 :413）
  // ── 秘密种子 37 位（WorldGen.SecretSeed 注册序）──
  paintEverythingGray?: boolean;       // "monochrome"
  paintEverythingNegative?: boolean;   // "negative infinity"
  coatEverythingEcho?: boolean;        // "invisible plane"
  coatEverythingIlluminant?: boolean;  // "x-ray vision"
  noSurface?: boolean;                 // "mole people"
  extraLivingTrees?: boolean;          // "save the rainforest"
  extraFloatingIslands?: boolean;      // "the care bears movie"
  errorWorld?: boolean;                // "I am error"
  graveyardBloodmoonStart?: boolean;   // "night of the living dead"
  surfaceIsInSpace?: boolean;          // "such great heights"
  rainsForAYear?: boolean;             // "bring a towel"
  biggerAbandonedHouses?: boolean;     // "abandoned manors"
  randomSpawn?: boolean;               // "how did I get here"
  addTeleporters?: boolean;            // "beam me up"
  startInHardmode?: boolean;           // "too easy"
  noInfection?: boolean;               // "fish mox"
  hallowOnTheSurface?: boolean;        // "does that sparkle"
  infectedSeed?: boolean;              // "purify this"
  surfaceIsMushrooms?: boolean;        // "toadstool"
  surfaceIsDesert?: boolean;           // "sandy britches"
  pooEverywhere?: boolean;             // "truck stop"
  noSpiderCaves?: boolean;             // "arachnophobia"
  actuallyNoTraps?: boolean;           // "more traps please"
  rainbowStuff?: boolean;              // "rainbow road"
  digExtraHoles?: boolean;             // "jagged rocks"
  roundLandmasses?: boolean;           // "planetoids"
  extraLiquid?: boolean;               // "waterpark"
  portalGunInChests?: boolean;         // "we don't even test for that"
  worldIsFrozen?: boolean;             // "winter is coming"
  halloweenGen?: boolean;              // "pumpkin season"
  endlessHalloween?: boolean;          // "hocus pocus"
  endlessChristmas?: boolean;          // "jingle all the way"
  vampireSeed?: boolean;               // "what a horrible night to have a curse"
  teamBasedSpawns?: boolean;           // "royale with cheese"
  dualDungeons?: boolean;              // "double daring dangers"
  // 1457 Variations 子旗标（派生组合门，由旗标组合+activeSecretSeedCount 推导）
  echoJustSomeThings?: boolean;
  echoJustInnerBlocks?: boolean;
  illuminantJustSomeThings?: boolean;
  illuminantJustRandomSpots?: boolean;
  grayUseWhite?: boolean;
  grayJustTreasure?: boolean;
  grayJustTheSurface?: boolean;
  negativeJustUnderground?: boolean;
  negativeJustSomeThings?: boolean;
}

// ── 特殊种子注册表（WorldGenerationOptions.cs:27-40 注册序逐项 1:1）──
const SPECIAL_OPTIONS: ReadonlyArray<{
  values: readonly number[];
  names: readonly string[];
  apply: (f: SeedFlags) => void;
}> = [
  // WorldSeedOption_Normal
  { values: [], names: [], apply: () => {} },
  // WorldSeedOption_NotTheBees
  { values: [], names: ['notthebees'], apply: (f) => { f.notTheBees = true; } },
  // WorldSeedOption_Drunk：唯一纯数字路由特殊种子
  { values: [5162020], names: [], apply: (f) => { f.drunkWorld = true; } },
  // WorldSeedOption_Anniversary
  { values: [5162021, 5162011], names: ['celebrationmk10'], apply: (f) => { f.tenthAnniversary = true; } },
  // WorldSeedOption_DontStarve
  { values: [], names: ['constant', 'theconstant', 'eye4aneye', 'eyeforaneye'], apply: (f) => { f.theConstant = true; } },
  // WorldSeedOption_ForTheWorthy
  { values: [], names: ['fortheworthy'], apply: (f) => { f.getGoodWorld = true; } },
  // WorldSeedOption_NoTraps
  { values: [], names: ['notraps'], apply: (f) => { f.noTraps = true; } },
  // WorldSeedOption_Remix
  { values: [], names: ['dontdigup'], apply: (f) => { f.remix = true; } },
  // WorldSeedOption_Everything：七依赖套件全置
  { values: [], names: ['getfixedboi'], apply: (f) => {
    f.everything = true; f.remix = true; f.drunkWorld = true; f.notTheBees = true;
    f.noTraps = true; f.theConstant = true; f.tenthAnniversary = true; f.getGoodWorld = true;
  } },
  // WorldSeedOption_Skyblock
  { values: [], names: ['skyblock'], apply: (f) => { f.skyblock = true; } },
];

// ── 秘密种子明文路由（37 枚，1456:340-408 + 1457:411/413 注册序）──
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
  [/^stormyweather$/, (f) => { f.moreLightning = true; }],
  [/^clearskies$/, (f) => { f.noLightning = true; }],
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
  [/^whatahorriblenighttohaveacurse$/, (f) => { f.vampireSeed = true; }],
  [/^royalewithcheese$/, (f) => { f.teamBasedSpawns = true; }],
  [/^doubledaringdangers$/, (f) => { f.dualDungeons = true; }],
  [/^electricboogaloo$/, (f) => { f.moreLightning = true; }],
  [/^calmbeforethestorm$/, (f) => { f.noLightning = true; }],
];

export function parseSeed(rawSeed: string): { flags: SeedFlags; seedText: string; specialName: string | null } {
  const normalized = rawSeed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const seedInt = translateSeed(rawSeed);
  const flags: SeedFlags = {};
  for (const opt of SPECIAL_OPTIONS) {
    if (opt.values.includes(seedInt) || opt.names.includes(normalized)) {
      opt.apply(flags);
      break;
    }
  }
  for (const [re, apply] of SECRET_ROUTES) {
    if (re.test(normalized)) {
      apply(flags);
      break;
    }
  }
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

/** 多段秘种子串解析（vanilla '|' 分隔协议，★IIIIIII18 FILE 车道新增出入口）。
 *
 *  原版档的 header seed 文本并非单一种子——UIWorldCreation.FinishCreatingWorld
 *  （cs:1004-1008）写侧为 `SetSeed(string.Join("|", _secretSeedTextsEntered) +
 *  "|" + SeedText)`：每录入一枚秘种子就往头部拼一段，SetSeedToRandomWithCurrentEvents
 *  （WorldFileData.cs:419-425）还会前缀 `"pumpkinseason|"`。因此原版 .wld 可携带
 *  `purify this|jingle all the way|48152` 型多段串；读侧比对 = TryParseSecretSeed
 *  循环（WorldFileData.cs:296-309）逐段 CheckInputForSecretSeed。
 *
 *  本函数逐段独立过 parseSeed（与新创建世界完全同一解析层），命中段**并集**合并：
 *  - 单段/无分隔串行为与 parseSeed 全等（主路径零变化）；
 *  - 原版自写重复段（如 `hocus pocus|hocus pocus|底种`——单秘种子时输入文本会
 *    出现在 join 与 SeedText 两处）幂等吸收；
 *  - 纯数字段照常走数字路由（05162020/5162021 等 SpecialSeedValues 同源命中，
 *    与「把这串单独输进新世界」的语义一致）。 */
export function parseSeedChain(rawSeed: string): { flags: SeedFlags; hitTexts: string[] } {
  const flags: SeedFlags = {};
  const hitTexts: string[] = [];
  for (const part of String(rawSeed ?? '').split('|')) {
    if (!part || !part.trim()) continue;
    const seg = parseSeed(part);
    if (Object.keys(seg.flags).length > 0) {
      Object.assign(flags, seg.flags);
      hitTexts.push(part.trim());
    }
  }
  return { flags, hitTexts };
}

// ── ★IIIII41-T3② arachnophobia 变体门（WorldGen.cs GenVars.Variations）────────
//
// vanilla 语义（Terarria1457 WorldGen.cs:269-291）：
//   noSpiderCavesActuallyNoSpiderCaves   = noSpiderCaves ∧ activeSecretSeedCount<4
//   noSpiderCavesILiedMoreSpiderCaves    = noSpiderCaves ∧ activeSecretSeedCount≥4
// 生成域消费位（1457）：SpiderCaves pass 整跳(:17472)、饥荒草墙蜘蛛墙地表化反向门
// (:19804)；count≥4 位 :17537/:20185；组合专用位 :13736(NTB+FTW-noCeleb)/:25899；
// 终结面 NPC.savedStylist=true(:688-691)。
//
// activeSecretSeedCount 全量计数器不在本批（另案 master-plan §3 组合专项——46 旗标
// 注册序计数与 getfixedboi 七依赖展开需先过 S0 层）。单秘种子路由（'arachnophobia'
// 明文段，count=1）恒命中 count<4 支 ⇒ 本批按「无其他秘种子旗标」单路由精确等价：
export function noSpiderCavesActuallyNoSpiderCaves(f: SeedFlags): boolean {
  return f.noSpiderCaves === true && !noOtherSecretFlag(f, 'noSpiderCaves');
}

/** noSpiderCavesILiedMoreSpiderCaves 对称臂（本仓多秘计数另案，恒 false 并登记）。 */
export function noSpiderCavesILiedMoreSpiderCaves(_f: SeedFlags): boolean {
  return false; // 组合债：需要 activeSecretSeedCount≥4 才为真（:17537/:20185 域）
}

/** SeedFlags 中的派生 Variations 子旗标名（非注册种子位，不计入保守计数）。 */
const DERIVED_VARIATION_KEYS = new Set([
  'echoJustSomeThings', 'echoJustInnerBlocks', 'illuminantJustSomeThings',
  'illuminantJustRandomSpots', 'grayUseWhite', 'grayJustTreasure',
  'grayJustTheSurface', 'negativeJustUnderground', 'negativeJustSomeThings',
]);

/** f 中除 skip 指定位外是否还存在任一秘种子/特殊种子位（Variations 计数的保守替代）。
 *  moreLightning/noLightning 在原版同为 Register 秘种子（#36/#37），计入。 */
export function noOtherSecretFlag(f: SeedFlags, ...skip: string[]): boolean {
  for (const [k, v] of Object.entries(f)) {
    if (!v) continue;
    if (skip.includes(k)) continue;
    if (DERIVED_VARIATION_KEYS.has(k)) continue;   // 派生 Variations 子位不计数
    return true;
  }
  return false;
}
