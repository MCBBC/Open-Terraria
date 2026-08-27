// ═══ CELEB 续批（EEEEEEEE 2026-08-27）：ImproveAllChestContents 前缀引擎 ═══
// 1458 WorldGen.cs:24989-25047（FinishTenthAnniversaryWorld 尾、巨石扫之后）+
// GoodPrefix 表 :3743-3754。掷流语义：
//   - 每件箱内非空物品按 GiveItemGoodPrefixes(:25006-25040) 判五类
//     （accessory/melee/GunsBows/Magic/Summon——各类**独立**触发，双类物品吃两次掷）；
//   - PrefixItemFromOptions(:25043-25058)：Prefix(-3) 仅查 CanHavePrefixes
//     （GetRollablePrefixes!=null，Item.cs:494）零掷；候选环 `genRand.Next(list.Count)`
//     逐次收缩，`item.Prefix(num)` 对正 id 走 TryGetPrefixStatMultipliersForItem
//     switch 全表命中（Item.cs:710-1061 词缀 1..97 无 default 失败项）⇒ **恒零骰直写**
//     且首候中签即 return ⇒ 每类恰 1 次 Next(len)。
//   - 生成期只承载掷流与前缀字节；伤害/暴击等乘区由运行期重铸系统读同一张
//     vanilla-prefix.json 表，故这里不复制 Item.Prefix 的数值副作用。
// 物品分类表 provenance：一次性扫描 Terarria1458/Terraria/Item.cs SetDefaults1..5
// 主 switch 的 `melee/accessory = true`，并对 `SetDefaultsK(n)` 模板继承做终值模拟
// （抽查：3507 铜短剑 melee ✓ / 1553 红白机枪 ranged ✓ / 掉落侧无 accessory）。即
// item.melee / item.accessory 的逐 vid 终值表，与 PrefixLegacy.*Set 是独立谓词。
import type { RNG } from '../../../core/rng';
import { PREFIX_ITEM_SETS, rollablePrefixes } from '../../../data/vanillaPrefixes';
// internal id → 原版 vid（vi_N 键的 N；data/items.ts 尾构建，世界生成期已定稿）
import { ITEM_STABLE_OF_INTERNAL } from '../../../data/items';

/** vanilla WorldGen.cs:3745-3753 TenthAnniversaryWorldInfo.GoodPrefixIdsFor* */
const GOOD_PREFIX_ACCESSORY = [65, 68, 72, 76];
const GOOD_PREFIX_MELEE = [81, 59, 57];
const GOOD_PREFIX_RANGED = [82, 57, 60];
const GOOD_PREFIX_MAGIC = [83, 57, 60];
const GOOD_PREFIX_SUMMON = [85, 59, 95, 96, 97];


/** Item.melee=true 终值集（提取法证见文件头）*/
const MELEE_FLAG_VIDS = [
45, 46, 55, 65, 103, 104, 119, 121, 122, 155, 162, 163, 186, 190, 191, 196, 198, 199, 200, 201,
202, 203, 204, 213, 217, 220, 273, 274, 277, 280, 284, 367, 368, 383, 384, 385, 386, 387, 388, 389,
390, 406, 426, 482, 483, 484, 486, 537, 550, 561, 579, 653, 654, 656, 657, 659, 660, 670, 671, 672,
674, 675, 676, 723, 724, 756, 757, 776, 777, 778, 787, 795, 797, 798, 799, 801, 802, 881, 882, 921,
922, 946, 989, 990, 991, 992, 993, 1122, 1123, 1166, 1185, 1186, 1188, 1189, 1190, 1192, 1193,
1195, 1196, 1197, 1199, 1200, 1202, 1203, 1204, 1222, 1223, 1224, 1226, 1227, 1228, 1230, 1231,
1232, 1233, 1234, 1259, 1262, 1294, 1297, 1304, 1305, 1306, 1314, 1320, 1324, 1325, 1327, 1506,
1507, 1513, 1569, 1571, 1786, 1825, 1826, 1827, 1909, 1917, 1918, 1928, 1947, 2176, 2273, 2294,
2330, 2331, 2332, 2341, 2342, 2424, 2516, 2517, 2608, 2611, 2745, 2746, 2772, 2773, 2774, 2775,
2776, 2777, 2778, 2779, 2780, 2781, 2782, 2783, 2784, 2785, 2786, 2798, 2880, 3012, 3013, 3018,
3030, 3054, 3063, 3065, 3097, 3098, 3106, 3211, 3258, 3292, 3349, 3351, 3352, 3368, 3389, 3462,
3463, 3464, 3465, 3466, 3473, 3481, 3482, 3483, 3484, 3485, 3487, 3488, 3489, 3490, 3491, 3493,
3494, 3495, 3496, 3497, 3499, 3500, 3501, 3502, 3503, 3505, 3506, 3507, 3508, 3509, 3511, 3512,
3513, 3514, 3515, 3517, 3518, 3519, 3520, 3521, 3525, 3543, 3769, 3772, 3823, 3827, 3835, 3836,
3858, 4059, 4144, 4258, 4259, 4272, 4317, 4463, 4707, 4711, 4722, 4760, 4764, 4818, 4923, 4956,
5012, 5094, 5095, 5096, 5097, 5129, 5283, 5284, 5294, 5295, 5298, 5382, 5462, 5519, 5526, 5535,
5536, 5669, 5670, 5671, 5687,
];

/** Item.accessory=true 终值集 */
const ACCESSORY_FLAG_VIDS = [
49, 53, 54, 111, 128, 156, 158, 159, 187, 193, 208, 211, 212, 216, 223, 267, 285, 394, 396, 397,
399, 405, 407, 485, 489, 490, 491, 492, 493, 497, 532, 535, 536, 554, 555, 576, 665, 748, 749, 761,
785, 786, 821, 822, 823, 854, 855, 857, 860, 861, 862, 863, 885, 886, 887, 888, 889, 890, 891, 892,
893, 897, 898, 899, 900, 901, 902, 903, 904, 906, 907, 908, 934, 935, 936, 938, 948, 950, 953, 963,
975, 976, 977, 982, 983, 984, 987, 1131, 1132, 1158, 1162, 1163, 1164, 1165, 1167, 1247, 1248,
1249, 1250, 1251, 1252, 1253, 1290, 1300, 1301, 1303, 1307, 1321, 1322, 1323, 1343, 1515, 1578,
1579, 1583, 1584, 1585, 1586, 1595, 1612, 1613, 1724, 1797, 1830, 1845, 1858, 1860, 1861, 1862,
1863, 1864, 1865, 1866, 1871, 1921, 1923, 1987, 2213, 2219, 2220, 2221, 2276, 2280, 2283, 2375,
2423, 2494, 2501, 2609, 2770, 2799, 2998, 3015, 3016, 3017, 3033, 3034, 3035, 3061, 3068, 3090,
3097, 3110, 3200, 3201, 3212, 3223, 3224, 3225, 3228, 3241, 3245, 3252, 3305, 3308, 3333, 3334,
3336, 3337, 3366, 3471, 3536, 3537, 3538, 3539, 3580, 3581, 3582, 3588, 3592, 3619, 3624, 3721,
3731, 3781, 3809, 3810, 3811, 3812, 3883, 3924, 3928, 3929, 4054, 4318, 4730, 4746, 4750, 4754,
4762, 4823, 4954, 4978, 4987, 4989, 5064, 5075, 5076, 5077, 5080, 5100, 5106, 5331, 5345, 5347,
5452, 5465, 5540, 5541, 5543, 5547, 5586, 5587, 5627, 5628, 5659, 5686, 6140, 6141,
];


const MELEE_IDS = new Set(MELEE_FLAG_VIDS);
const ACCESSORY_IDS = new Set(ACCESSORY_FLAG_VIDS);
const GUNS_BOWS = new Set(PREFIX_ITEM_SETS.GunsBows);
const MAGIC_SET = new Set(PREFIX_ITEM_SETS.Magic);
const SUMMON_SET = new Set(PREFIX_ITEM_SETS.Summon);

export interface ChestItemLike { id: number; stack?: number; prefix?: number }
export interface ChestLike { items: Array<ChestItemLike | null> }

/** 箱内物 internal id → 原版 vid：稳定表 vi_N 段的 N 即原版 vid（BuriedChestsPass
 *  vid() 的反演——箱内物全部经 vid(v) 写入，必然命中 vi_ 键）。 */
function vidOfInternal(internalId: number): number {
  if (internalId <= 0 || internalId >= ITEM_STABLE_OF_INTERNAL.length) return 0;
  return ITEM_STABLE_OF_INTERNAL[internalId] ?? 0;
}

/** Item.CanHavePrefixes（Item.cs:494-496）：GetRollablePrefixes()!=null */
function canHavePrefixes(vvid: number): boolean {
  // GetRollablePrefixes（Item.cs:1100-1136）武器族集合在前、IsAPrefixableAccessory 兜底
  if (PREFIX_ITEM_SETS.SwordsHammersAxesPicks.includes(vvid)) return true;
  if (PREFIX_ITEM_SETS.SpearsMacesChainsawsDrillsPunchCannon.includes(vvid)) return true;
  if (GUNS_BOWS.has(vvid)) return true;
  if (MAGIC_SET.has(vvid)) return true;
  if (SUMMON_SET.has(vvid)) return true;
  if (PREFIX_ITEM_SETS.BoomerangsChakrams.includes(vvid)) return true;
  if (PREFIX_ITEM_SETS.ItemsThatCanHaveLegendary2.includes(vvid)) return true;
  return rollablePrefixes(vvid, ACCESSORY_IDS.has(vvid)) !== null;
}

/** WorldGen.PrefixItemFromOptions（cs:25043-25058）：正 id 候选恒 TryGet 命中 ⇒
 *  零附加掷、首候必中（语义见文件头）；失败支（本域不可达）保留结构以备审计。 */
function prefixItemFromOptions(rng: RNG, item: ChestItemLike, options: number[]): boolean {
  if (!canHavePrefixes(vidOfInternal(item.id))) return false;   // item.Prefix(-3) false 支
  const list = [...options];
  while (list.length > 0) {
    const index = rng.int(0, list.length - 1);   // genRand.Next(list.Count)
    const num = list[index]!;
    // item.Prefix(num)：TryGet 全表命中 → rolledPrefix=num 直写 prefix 字节（Item.cs:636）
    item.prefix = num;
    if (item.prefix === num) return true;
    list.splice(index, 1);                        // RemoveAt(index)——收缩重抽
  }
  return false;
}

/** WorldGen.GiveItemGoodPrefixes（cs:25006-25041）：五类独立判定（可叠加触发多次掷） */
function giveGoodPrefixes(rng: RNG, item: ChestItemLike): void {
  const vvid = vidOfInternal(item.id);
  if (vvid <= 0) return;                          // 未注册 vi_ 映射（老稳定键）——vanilla 无此型
  if (ACCESSORY_IDS.has(vvid)) prefixItemFromOptions(rng, item, GOOD_PREFIX_ACCESSORY);
  if (MELEE_IDS.has(vvid)) prefixItemFromOptions(rng, item, GOOD_PREFIX_MELEE);
  if (GUNS_BOWS.has(vvid)) prefixItemFromOptions(rng, item, GOOD_PREFIX_RANGED);
  if (MAGIC_SET.has(vvid)) prefixItemFromOptions(rng, item, GOOD_PREFIX_MAGIC);
  if (SUMMON_SET.has(vvid)) prefixItemFromOptions(rng, item, GOOD_PREFIX_SUMMON);
}

/** WorldGen.ImproveAllChestContents（cs:24989-25004）：Main.chest[0..8000)×maxItems 全扫。
 *  空槽（null/id 0/stack 0=IsAir）跳过零掷。celeb 专属（调用位见 FinalCleanupPass）。 */
export function improveAllChestContents(chests: Array<{ x: number; y: number; items: Array<ChestItemLike | null> }> | undefined | null, rng: RNG): void {
  if (!chests) return;
  for (let i = 0; i < chests.length && i < 8000; i++) {
    const chest = chests[i];
    if (!chest) continue;
    const items = chest.items ?? [];
    for (let j = 0; j < items.length && j < 40; j++) {   // chest.maxItems=40（Chest.cs:58）
      const it = items[j];
      if (!it || !(it.id > 0) || !(it.stack === undefined || it.stack > 0)) continue;   // IsAir
      giveGoodPrefixes(rng, it);
    }
  }
}
