// 盔甲套装加成（Player.cs:15790+ ApplyEquipFunctional 前的套装 if-chain，数值 1:1 抄录）。
// 表键 = `${head}|${body}|${legs}`（原版 head/body/legs = Item.headSlot/bodySlot/legSlot 槽序号，
// **非物品 id**——铁三件槽序都是 2，见 itemstats s 字段族的兄弟：本表直接用槽序匹配）。
// 每条 = 原版同 if 块内的纯数值/旗标效果；行为型（召唤骷髅/幽灵治疗等）标注 engine。
// 首批覆盖肉前全套装 + 部分常打套；后续按 system 进度扩表。
export interface ArmorSetBonus {
  def?: number;              // statDefense +=
  mana?: number;             // statManaMax2 +=
  move?: number;             // moveSpeed +=
  meleeSpd?: number;         // meleeSpeed +=
  dmgMelee?: number;
  dmgRanged?: number;
  dmgMagic?: number;
  critMelee?: number;
  critRanged?: number;
  critMagic?: number;
  noKnockback?: boolean;
  runAccMul?: number;      // runAcceleration *=（暗影套 1.75,:26195-26201）
  maxRunMul?: number;      // maxRunSpeed *=（暗影套 1.15）
  runSlowMul?: number;     // runSlowdown *=（暗影套 1.75）
  fireWalk?: boolean;
  frostBurn?: boolean;     // 冰霜盔甲引擎（StatusNPC :93712:近/远程命中 → Frostburn2）
  ammoCost80?: boolean;
  manaCostMul?: number;      // manaCost -=（折扣）
  ghostHeal?: boolean;       // 幽灵治疗头（Spectre Hood :15850-15855，魔法命中吸血 engine）
  ghostHurt?: boolean;       // 幽灵伤害头（Spectre Mask :15856-15860，engine 未接）
  name?: string;             // ArmorSetBonus.*（调试/后续 UI 展示）
}

export const ARMOR_SET_BONUSES: Record<string, ArmorSetBonus> = {
  // 金属一档（铜 1,1,1 / 铁(72|2),2,2 / 铅 47,28,27——木套 1.4.5 无加成）：防 +2
  '1|1|1': { def: 2, name: 'MetalTier1' },
  '72|2|2': { def: 2, name: 'MetalTier1' },
  '2|2|2': { def: 2, name: 'MetalTier1' },
  '47|28|27': { def: 2, name: 'MetalTier1' },
  // 金属二档（铜 3 / 银(73|4) / 钨 48 / 金 49）：防 +3
  '3|3|3': { def: 3, name: 'MetalTier2' },
  '73|4|4': { def: 3, name: 'MetalTier2' },
  '4|4|4': { def: 3, name: 'MetalTier2' },
  '48|29|28': { def: 3, name: 'MetalTier2' },
  '49|30|29': { def: 3, name: 'MetalTier2' },
  // 铂金 50：防 +4
  '50|31|30': { def: 4, name: 'Platinum' },
  // 角斗士 180：击退免疫
  '180|182|122': { noKnockback: true, name: 'Gladiator' },
  // 忍者 22：移速 +20%
  '22|14|14': { move: 0.2, name: 'Ninja' },
  // 化石 188：弹药 20% 不耗
  '188|189|129': { ammoCost80: true, name: 'Fossil' },
  // 死灵 (75|7)：远程暴 +10
  '75|7|7': { critRanged: 10, name: 'Bone' },
  '7|7|7': { critRanged: 10, name: 'Bone' },
  // 巫师帽 14 + 长袍：魔法暴 +10
  '14|58|*': { critMagic: 10, name: 'Wizard' },
  // 暗影 (5|74)：shadowArmor 旗标（:15842）→ 移动四参数加成（:26195-26201,
  // 2026-08-13 接入移动模型:runAcc×1.75/maxRun×1.15/accRun×1.15/runSlow×1.75）
  '5|5|5': { runAccMul: 1.75, maxRunMul: 1.15, runSlowMul: 1.75 },      // 暗影（102/101/100）
  '74|48|44': { runAccMul: 1.75, maxRunMul: 1.15, runSlowMul: 1.75 },   // 远古暗影（956/957/958,同 :15842 旗标）
  // 丛林 (76|8)(49|45) 2×2×2=8 种组合全配（:15873-15877 manaCost-=0.16f）
  '8|8|8': { manaCostMul: 0.84, name: 'Jungle' },
  '76|8|8': { manaCostMul: 0.84, name: 'Jungle' },
  '76|49|45': { manaCostMul: 0.84, name: 'Jungle' },
  '8|49|45': { manaCostMul: 0.84, name: 'Jungle' },
  '76|49|8': { manaCostMul: 0.84, name: 'Jungle' },
  '76|8|45': { manaCostMul: 0.84, name: 'Jungle' },
  '8|49|8': { manaCostMul: 0.84, name: 'Jungle' },
  '8|8|45': { manaCostMul: 0.84, name: 'Jungle' },
  // 熔岩 9：近战伤 +10% + fireWalk
  '9|9|9': { dmgMelee: 0.1, fireWalk: true, name: 'Molten' },
  // 霜寒 46：近远程伤 +10% + frostBurn engine（StatusNPC :93712-93716：
  //   melee||ranged 命中 → Frostburn2(324) 60×Next(5,15)t = 5-14s）
  '46|27|26': { dmgMelee: 0.1, dmgRanged: 0.1, frostBurn: true, name: 'Frost' },
  // 幽灵套（Spectre Robe 66 / Pants 55；Player.cs:15850-15860）：
  // 头 101 兜帽 → ghostHeal（魔法命中回血，魔法伤 −40%）；
  // 头 156 面具 → ghostHurt（伤害强化 engine 未接，登记）
  '101|66|55': { ghostHeal: true, dmgMagic: -0.4, name: 'SpectreHealing' },
  '156|66|55': { ghostHurt: true, name: 'SpectreDamage' },
};
