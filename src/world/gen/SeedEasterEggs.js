// 彩蛋种子解析（对齐原版 WorldGen.CheckSpecialWorldSeed / UIWorldCreation.ProcessSeed）。
// 匹配规则：去分隔符后小写比较（原版语义）。
import { RNG, hashString } from '../../core/rng';
const TABLE = [
    [/^notthebees$/i, (f) => { f.notTheBees = true; f.crimsonForce = true; }],
    [/^fortheworthy$/i, (f) => { f.getGoodWorld = true; }],
    [/^(05162020|drunkworld)$/i, (f) => { f.drunkWorld = true; }],
    [/^notraps$/i, (f) => { f.noTraps = true; }],
    [/^(theconstant|constant|eye4aneye|eyeforaneye)$/i, (f) => { f.theConstant = true; }],
    [/^(celebrationmk10|5162021|5162011)$/i, (f) => { f.tenthAnniversary = true; }],
    [/^dontdigup$/i, (f) => { f.remix = true; }],
    [/^getfixedboi$/i, (f) => { f.everything = true; f.drunkWorld = true; f.getGoodWorld = true; f.notTheBees = true; }],
    [/^skyblock$/i, (f) => { f.skyblock = true; }], // 1.4.5.6 WorldGenerationOptions 新增
];
export function parseSeed(rawSeed) {
    const normalized = rawSeed.replace(/[\s._-]/g, '').toLowerCase();
    const flags = {};
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
/** 随机世界名（原版随机命名池的小样本） */
const WORLD_NAME_A = ['翠绿', '绯红', '幽暗', '黎明', '苍穹', '秘银', '曙光', '余烬', '苍翠', '深蓝'];
const WORLD_NAME_B = ['之地', '之境', '领域', '平原', '王国', '秘境'];
/** 由调用方传入种子派生 RNG——生成期不使用 Math.random（种子决定一切契约） */
export function randomWorldName(seedText) {
    const r = new RNG(hashString(seedText ?? String(Date.now())));
    return WORLD_NAME_A[Math.floor(r.next() * WORLD_NAME_A.length)] +
        WORLD_NAME_B[Math.floor(r.next() * WORLD_NAME_B.length)] +
        (r.next() < 0.5 ? '' : String(Math.floor(r.next() * 90 + 10)));
}
