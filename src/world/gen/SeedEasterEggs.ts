// 彩蛋种子解析（对齐原版 WorldGen.CheckSpecialWorldSeed / UIWorldCreation.ProcessSeed）。
// 匹配规则：去分隔符后小写比较（原版语义）。

export interface SeedFlags {
  crimsonForce?: boolean;    // not the bees：强制猩红
  getGoodWorld?: boolean;    // for the worthy
  drunkWorld?: boolean;      // 05162020 / drunk world
  noTraps?: boolean;         // no traps
  theConstant?: boolean;     // the constant（dontstarve）
  tenthAnniversary?: boolean;// celebrationmk10
  remix?: boolean;           // don't dig up
  everything?: boolean;      // getfixedboi（组合种子）
  skyblock?: boolean;        // 1.4.5.6 新增 skyblock
  notTheBees?: boolean;
  infectedSeed?: boolean;    // 1.4.5 worldIsInfected 秘密种子（Main.infectedSeed）——
  //  尚无文本种子映射到该位（注册为哈希种子，WorldGen.cs:374），仅作 SceneMetrics
  //  向日葵压制 ×3 等读取位的预留（恒 false 时行为与原版普通世界一致）
  graveyardBloodmoonStart?: boolean; // SecretSeed.graveyardBloodmoonStart（WorldGen.cs:356，
  //  哈希注册无文本种子）——墓园 pass 的第二触发源（:18117-18120），预留位恒 false
  //  时行为与原版普通世界一致
  vampireSeed?: boolean;     // SecretSeed.vampirism → Main.vampireSeed（WorldGen.cs:404
  //  哈希注册 "4eijvDtfcSl66CDifYSVP3WBZm9OLBoW"、:550 InitializeSecretSeeds 置位，
  //  Main.cs:327 声明、NetMessage.cs:363/MessageBuffer.cs:611 联机同步、WorldFile.cs
  //  :1420/:2469 落盘）。明文 = "what a horrible night to have a curse"（Castlevania II
  //  致敬；Secrets.ToSecret = BCrypt 哈希不可逆——原版凭哈希匹配，wiki 社区试出）。
  //  匹配口径同其它条目：去全部非字母数字后小写比对。运行时消费见 Player
  //  vampireSeedSunlightExposure（Player.cs:28191-28238 阳光炽灼全链）等
}

const TABLE: Array<[RegExp, (f: SeedFlags) => void]> = [
  [/^notthebees$/i, (f) => { f.notTheBees = true; f.crimsonForce = true; }],
  [/^fortheworthy$/i, (f) => { f.getGoodWorld = true; }],
  [/^(05162020|drunkworld)$/i, (f) => { f.drunkWorld = true; }],
  [/^notraps$/i, (f) => { f.noTraps = true; }],
  // 饥荒世界（Main.dontStarveWorld 消费源 = 稀有云 1/25 直通门 Cloud.cs:139/215-223）：
  // WorldSeedOption_DontStarve.SpecialSeedNames = {constant, theconstant, eye4aneye, eyeforaneye}
  [/^(theconstant|constant|eye4aneye|eyeforaneye)$/i, (f) => { f.theConstant = true; }],
  // 十周年世界（Main.tenthAnniversaryWorld 消费源 = 稀有云 1/25+1/3 直通/范围收窄
  // Cloud.cs:139-146/189）：WorldSeedOption_Anniversary.SpecialSeedNames = {celebrationmk10}
  // + SpecialSeedValues = {5162021, 5162011}（TranslateSeed 数字种子直出）
  [/^(celebrationmk10|5162021|5162011)$/i, (f) => { f.tenthAnniversary = true; }],
  [/^dontdigup$/i, (f) => { f.remix = true; }],
  [/^getfixedboi$/i, (f) => { f.everything = true; f.drunkWorld = true; f.getGoodWorld = true; f.notTheBees = true; }],
  [/^skyblock$/i, (f) => { f.skyblock = true; }],  // 1.4.5.6 WorldGenerationOptions 新增
  // 吸血鬼秘密种子（SecretSeed.vampirism，WorldGen.cs:404 哈希注册——明文为社区
  // 试出的 "what a horrible night to have a curse"；归一化后任意大小写/分隔变体命中）
  [/^whatahorriblenighttohaveacurse$/i, (f) => { f.vampireSeed = true; }],
];

export function parseSeed(rawSeed: string): { flags: SeedFlags; seedText: string; /** UI 展示用特殊世界名（无则 null） */ specialName: string | null } {
  // 归一化 = WorldGenerationOptions.GetOptionFromSeedText :69：
  // `Regex.Replace(processedSeed.ToLower(), "[^a-z0-9]+", "")`——去全部非字母数字
  // （"celebration mk10!" → "celebrationmk10" 亦命中；旧实现只剥 空格/._- 窄一档）
  const normalized = rawSeed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const flags: SeedFlags = {};
  for (const [re, apply] of TABLE) {
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
