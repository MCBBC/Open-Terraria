// 彩蛋种子解析（对齐原版 WorldGen.CheckSpecialWorldSeed / UIWorldCreation.ProcessSeed）。
// 匹配规则：去分隔符后小写比较（原版语义）。
export interface SeedFlags {
  crimsonForce?: boolean;    // not the bees：强制猩红
  getGoodWorld?: boolean;    // for the worthy
  drunkWorld?: boolean;      // 05162020 / drunk world
  noTraps?: boolean;         // no traps
  theConstant?: boolean;     // the constant
  tenthAnniversary?: boolean;// celebrationmk10
  remix?: boolean;           // don't dig up / rem625?（先记 flag）
  everything?: boolean;      // getfixedboi / don't tackle（组合种子）
  notTheBees?: boolean;
}

const TABLE: Array<[RegExp, (f: SeedFlags) => void]> = [
  [/^notthebees$/i, (f) => { f.notTheBees = true; f.crimsonForce = true; }],
  [/^fortheworthy$/i, (f) => { f.getGoodWorld = true; }],
  [/^(05162020|drunkworld)$/i, (f) => { f.drunkWorld = true; }],
  [/^notraps$/i, (f) => { f.noTraps = true; }],
  [/^theconstant(ck)?$/i, (f) => { f.theConstant = true; }],
  [/^celebrationmk10$/i, (f) => { f.tenthAnniversary = true; }],
  [/^(dontdigup|remix)$/i, (f) => { f.remix = true; }],
  [/^(getfixedboi|donttackle)$/i, (f) => { f.everything = true; f.drunkWorld = true; f.getGoodWorld = true; f.notTheBees = true; }],
];

export function parseSeed(rawSeed: string): { flags: SeedFlags; seedText: string; /** UI 展示用特殊世界名（无则 null） */ specialName: string | null } {
  const normalized = rawSeed.replace(/[\s._-]/g, '').toLowerCase();
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
    : flags.tenthAnniversary ? 'celebrationmk10'
    : flags.noTraps ? 'no traps'
    : null;
  return { flags, seedText: rawSeed, specialName };
}

/** 随机世界名（原版随机命名池的小样本） */
const WORLD_NAME_A = ['翠绿', '绯红', '幽暗', '黎明', '苍穹', '秘银', '曙光', '余烬', '苍翠', '深蓝'];
const WORLD_NAME_B = ['之地', '之境', '领域', '平原', '王国', '秘境'];
export function randomWorldName(): string {
  return WORLD_NAME_A[Math.floor(Math.random() * WORLD_NAME_A.length)] +
    WORLD_NAME_B[Math.floor(Math.random() * WORLD_NAME_B.length)] +
    (Math.random() < 0.5 ? '' : String(Math.floor(Math.random() * 90 + 10)));
}
