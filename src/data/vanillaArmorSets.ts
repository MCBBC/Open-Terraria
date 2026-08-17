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
  endurance?: number;
  dmgMinion?: number;   // minionDamage +=
  solar?: boolean;         // 日曜护盾 3 层引擎（每层该次受伤 ×0.2,:37699;每 3s 回 1,:16227）
  dashType?: number;       // 冲撞档（日曜 3,:16288-16294）
  maxRunMul?: number;      // maxRunSpeed *=（暗影套 1.15）
  runSlowMul?: number;     // runSlowdown *=（暗影套 1.75）
  fireWalk?: boolean;
  frostBurn?: boolean;     // 冰霜盔甲引擎（StatusNPC :93712:近/远程命中 → Frostburn2）
  ammoCost80?: boolean;
  huntressAmmoCost90?: boolean;  // 省弹 1/10（:12754 case 3804 女猎手护甲——件门在
                                  // Player.ts ARMOR_AMMO_SAVE_VID 表承载，此键为表回填预留）
  manaCostMul?: number;      // manaCost -=（折扣）
  ghostHeal?: boolean;       // 幽灵治疗头（Spectre Hood :15850-15855，魔法命中吸血 engine）
  ghostHurt?: boolean;       // 幽灵伤害头（Spectre Mask :15856-15860，engine 未接）
  anglerSet?: boolean;       // 渔夫套装：生成环 spawnRate×1.3/maxSpawns×0.7（NPC.cs:627-630）
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
  // 日曜耀斑（2763/2764/2765=171|177|112,Player.cs:16224-16295 setSolar):
  // 受伤 ×0.88 + 护盾 3 层（每层该次受伤 ×0.2 + 反击 608 弹;每 3s 回 1 层;dashType=3 冲撞登记）
  '171|177|112': { endurance: 0.12, solar: true, dashType: 3 },
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
  // 渔夫套（Player.cs:15916-15921：head∈{161,286} && body∈{169,253} && legs∈{104,241}
  // → anglerSetSpawnReduction → NPC.cs:627-630 生成环 ×1.3/×0.7；2×2×2=8 组合）
  '161|169|104': { anglerSet: true, name: 'Angler' },
  '161|169|241': { anglerSet: true, name: 'Angler' },
  '161|253|104': { anglerSet: true, name: 'Angler' },
  '161|253|241': { anglerSet: true, name: 'Angler' },
  '286|169|104': { anglerSet: true, name: 'Angler' },
  '286|169|241': { anglerSet: true, name: 'Angler' },
  '286|253|104': { anglerSet: true, name: 'Angler' },
  '286|253|241': { anglerSet: true, name: 'Angler' },
};

// ---- DD2 盔甲散件主属性（Player.cs:12709-12810 胸/腿件——头盔哨兵位已由 SUMMON_GEAR 承载,
// 此处补齐魔伤/近战暴/远程暴/魔耗/移速等此前缺失的字段,2026-08-13） ----
export const DD2_PIECE_FX: Record<number, Partial<ArmorSetBonus>> = {
  3798: { dmgMagic: 0.1, dmgMinion: 0.2 },
  3799: { dmgMinion: 0.1, critMagic: 20, move: 0.2 },
  3801: { dmgMinion: 0.15 },
  3802: { dmgMinion: 0.15, critMelee: 15, move: 0.15 },
  3804: { dmgMinion: 0.2 },
  3805: { dmgMinion: 0.1, move: 0.2 },
  3807: { dmgMinion: 0.2 },
  3808: { dmgMinion: 0.1, critMelee: 15, move: 0.2 },
  3872: { dmgMinion: 0.3 },
  3873: { dmgMinion: 0.2, critMelee: 20, move: 0.2 },
  3875: { dmgMinion: 0.25, dmgMagic: 0.1, manaCostMul: 0.85 },
  3876: { dmgMinion: 0.2, critMagic: 25, move: 0.2 },
  3878: { dmgMinion: 0.25, ammoCost80: true },
  3879: { dmgMinion: 0.25, critRanged: 10, move: 0.2 },
  3881: { meleeSpd: 0.2, critMelee: 5, dmgMinion: 0.2 },
  3882: { dmgMinion: 0.2, critMelee: 20, move: 0.3 },
};
