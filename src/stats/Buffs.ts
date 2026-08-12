// Buff 系统（1.4.5.6 原版框架语义移植：Player.cs AddBuff / UpdateBuffs）
//  - AddBuff 合并规则（AddBuff_TryUpdatingExistingBuffTime L5138+）：同类 buff 时间
//    取 max——续期不缩短（蜂蜜浸入每 tick AddBuff(48,1800) 因此天然成立：浸着恒 30s，
//    离开后从 30s 倒计时自然消退）。
//  - 效果聚合按 UpdateBuffs L9640+ 逐 case，数值一律取 1456：
//      Regeneration(2): lifeRegen += 4（=2 HP/s）
//      Swiftness(3): moveSpeed += 0.25
//      Ironskin(5): statDefense += 8
//      Thorns(14): thorns = 1 → 反弹接触伤害全额（cap 1000，StrikeNPC 侧 L30940-30944）
//      PotionSickness(21): 封锁治疗药水
//      Honey(48): lifeRegenTime += 2、lifeRegen += 2（=1 HP/s）；lifeRegen<0 时 +4 对冲
//      （debuff 系统未移植，对冲分支暂缺）；授予来源 = 浸蜜（Player.cs:27436
//      AddBuff(48,1800)）/ 蜂蜜史莱姆接触（:30904）/ 蜂窝饰品受击（:37905 AddBuff(48,300)）
//      Campfire(87)：原版为 SceneMetrics.HasCampfire 光环 lifeRegen++（:18990）——
//      本仓库沿用 Game 每 20tick 扫描写入的持续小时长 buff 表达
// 名称/描述走原版 l10n：BuffName.<Internal> + 自有 Mods.SandboxWorld.Buff.* 描述
import { Lang } from '../i18n/Lang';

export enum BuffType {
  Agility = 0,    // 敏捷：移速 +25% → Swiftness(3)
  Ironskin = 1,   // 铁皮：防御 +8 → Ironskin(5)
  Resistance = 2, // 耐药性：立即回 80 HP，期间禁用治疗药水（60s）→ PotionSickness(21)
  Thorns = 3,     // 荆棘：反弹接触伤害全额（cap 1000）→ Thorns(14)
  Regen = 4,      // 恢复：2 HP/s → Regeneration(2)
  Campfire = 5,   // 篝火：范围光环(由附近篝火/心灯实体驱动,Game 每帧续期) → Campfire(87)
  Honey = 6,      // 蜂蜜：1 HP/s（浸蜜授予，30s）→ Honey(48)
  OnFire = 7,     // 着火(24)：4 HP/s（lifeRegen-8,Player.cs:18793）；入水熄灭（:27426）
  Burning = 8,    // 燃烧(67)：30 HP/s（lifeRegen-60）+ 移速减半；站上陨石/狱石授予（ApplyTouchDamage）
  Bleeding = 9,   // 流血(30)：清自然恢复计时 lifeRegenTime=0（:18998,无直接 DoT）
  Suffocation = 10, // 窒息(68)：20 HP/s（lifeRegen-40）；埋入沙族持续 1 tick 授予
  // ---- 药水 buff 族（Item.cs case 288-304 buffType/buffTime;效果取 Player.cs UpdateBuffs）----
  ObsidianSkin = 11, // 黑曜石皮(1,360s)：lavaImmune+fireWalk+着火免疫（:9573）
  Gills = 12,        // 鱼鳃(4,240s)：gills 水下呼吸不耗（:9656）
  ManaRegen = 13,    // 魔力再生(6,480s)：manaRegenBuff 静止加成常开+满额倍率（:19238）
  MagicPower = 14,   // 魔法力量(7,240s)：magicDamage+0.2（:9667）
  Featherfall = 15,  // 羽落(8,600s)：slowFall 重力/3+fallStart 重置免摔（:9671/:21367）
  WaterWalking = 16, // 水上行走(15,600s)：waterWalk=true（:9706）
  Archery = 17,      // 射手(16,480s)：archery+arrowDamage×1.1（:9710）
  NightOwl = 18,     // 夜枭(12,600s)：nightVision→光衰减 ×1.03（:9636/184）——水下/洞穴更亮
  // ---- 环境光环 + 工作站 buff（SceneMetrics 扫描 / Player.cs:25235-25266 授予链）----
  Sunflower = 19,    // 向日葵(146,光环)：moveSpeed +0.1 再 ×1.1（两步复合 ≈×1.21,Player.cs:10598）
  CatBast = 20,      // 猫堡垒(215,光环)：statDefense +5（:9778）
  StarInBottle = 21, // 瓶中星(158,光环)：manaRegenDelay×0.5+manaRegenBonus+10（:9629）→本作回蓝×2
  PeaceCandle = 22,  // 和平蜡烛(157,光环)：刷怪 spawnRate×1.3/max×0.7（NPC.cs:645）
  Clairvoyance = 23, // 预见(29,水晶球右键,1800s)：manaMax+20/magicDmg+5%/crit+2/manaCost-2%（:11481）
  Sharpened = 24,    // 磨刀石(159,右键)：近战穿甲 +12（:9625，穿甲系统未接先登记）
  AmmoBox = 25,      // 弹药箱(93,右键)：20% 不耗弹（PickAmmo :52746）
  Bewitched = 26,    // 附魔台(150,右键)：maxMinions+1（:9857，召唤位未接先登记）
  WarTable = 27,     // 战争桌(348,右键)：maxTurrets+1（:9863，哨兵位未接先登记）
  SugarRush = 28,    // 糖分冲刺(192,蛋糕右键,120s)：moveSpeed+0.2+镐速（:9634）
  // ---- R1 数值批（Player.cs UpdateBuffs 逐条对 1456）----
  Battle = 29,        // 战斗(13,420s)：spawnRate×0.5/max×2（NPC.cs:632）
  Calming = 30,       // 镇静(106,240s)：spawnRate×1.65/max×0.6（NPC.cs:617）
  Mining = 31,        // 挖矿(104,600s)：pickSpeed-0.25 → 挖掘冷却×0.75（:9818）
  Builder = 32,       // 建筑工(107,900s)：tileSpeed+0.25/wallSpeed+0.25/blockRange+1（:9841）
  Heartreach = 33,    // 拾心(105,180s)：lifeMagnet 心拾取范围扩大（:9822）
  FlipperPotion = 34, // 脚蹼药(109,180s)：ignoreWater 游泳自由（:9851）
  Titan = 35,         // 泰坦(108,180s)：kbBuff → 近战击退×1.5（:20812）
  AmmoReservation = 36, // 弹药储备(112,480s)：20% 不耗弹（PickAmmo :52751）
  Lifeforce = 37,     // 生命力(113,300s)：maxHp +20%（statLifeMax2 += max/5/20*20,:9883）
  Endurance = 38,     // 耐久(114,300s)：endurance+0.1 → 受伤×0.9（:9886）
  Wrath = 39,         // ★标签对调说明：本枚举名 Wrath 实挂 vanillaBuff 115=原版 Rage 药水(怒气)：
                      //   melee/ranged/magic 暴击+10（:9888-9893，召唤不吃——GetWeaponCrit summon=0）
  Rage = 40,          // ★本枚举名 Rage 实挂 vanillaBuff 117=原版 Wrath 药水(暴怒)：四系伤害+10%（:9947）
  Tipsy = 41,         // 醉酒(25,清酒)：def-4/近战暴击+2/近战伤+10%/近战速+10%（:11513）
  // ---- R2 武器浸剂（meleeEnchant 表 Player.cs:11604-11636 → 敌 debuff :6141-6171）----
  ImbueVenom = 42,    // 毒液药剂(71)→敌 Venom(70) 5-10s（30HP/s）
  ImbueCursed = 43,   // 诅咒焰药剂(73)→敌 Cursed Inferno(39) 3-7s（24HP/s）
  ImbueFire = 44,     // 烈火药剂(74)→敌 OnFire(24) 3-7s（4HP/s）
  ImbueGold = 45,     // 金药剂(75)→敌 Midas(72) 2s（掉钱 ×1.10-1.51）
  ImbueIchor = 46,    // 灵液药剂(76)→敌 Ichor(69) 10-20s（防御 -15）
  ImbueNano = 47,     // 纳米药剂(77)→敌 Confused(31) 1-4s（AI 反向近似）
  ImbueParty = 48,    // 派对药剂(78)→命中爆彩带（视觉）
  ImbuePoison = 49,   // 毒药剂(79)→敌 Poison(20) 5-10s（6HP/s）
  Inferno = 50,       // 狱火药水(116)：200px 光环烧敌 2s+20 伤/60t（:9896）
  // ---- R3 视觉批 ----
  Shine = 51,         // 光芒(11,1800s)：玩家格常亮 1.3/1.3/1.3（:9872）
  Spelunker = 52,     // 洞穴探险(9)：矿物高亮（Renderer 叠层）
  Dangersense = 53,   // 危险感(111)：陷阱高亮
  Hunter = 54,        // 狩猎(17)：小动物高亮（detectCreature :9719）
  BiomeSight = 55,    // 群系视觉(343)：邪恶/神圣方块高亮
  Luck = 56,           // 幸运(257)：luckPotion 三档（buffTime>600s=3/>300s=2）×0.1（:9971/:28674）
  Summoning = 57,      // 召唤(110,480s)：maxMinions+1（:9855）
  // ---- R7 钓鱼三药水 ----
  Fishing = 58,        // 钓鱼(121,480s)：fishingSkill+15（:9831）
  Sonar = 59,          // 声呐(122,480s)：显示渔获名（sonar :9835）
  Crate = 60,          // 宝匣(123,300s)：渔获箱率 +10%（cratePotion :9839）
  Gravitation = 61,    // 重力(18,180s)：Up 键切换 gravDir（:9720）
  // ---- R8 敌弹状态批（Projectile.StatusPlayer :11450+ 授予链）----
  Chilled = 62,        // 冰寒(46)：移速 ×0.75（Player.cs:25659-25661）——霜月冰弹
                       //   348 FrostWave / 349 FrostShard 命中授予（:11554-11576）
  Frozen = 63,         // 冰冻(47)：整帧封移动输入（player.frozen :9749，input 清零
                       //   同 :18474 重置段）——冰女王霜弹 348 概率授予
  // ---- 食物链（Item.cs:47653 SetFoodDefaults → DefaultToFood useStyle 2 咀嚼/9 仰饮；
  // ---- 三档数值 Player.cs:11523-11570 逐档）----
  WellFed = 64,   // 饱腹(26)：def+2/全系暴击+2/全系伤+5%/近战速+5%/移速+20%/镐速-5%（:11523）
  WellFed2 = 65,  // 很饱(206)：def+3/暴击+3/伤+7.5%/近战速+7.5%/移速+30%/镐速-10%（:11539）
  WellFed3 = 66,  // 饕餮(207)：def+4/暴击+4/伤+10%/近战速+10%/移速+40%/镐速-15%（:11555）
  // ---- 后期批（Player.cs UpdateBuffs 逐条对 1456）----
  MoonLeech = 67,  // 月噬(145)：吸血/幽灵/治疗弹回复全禁（moonLeech，:11454-11457）
                   //   ——由月总月噬弹 456 贴身 20px 授予（Projectile.cs:30722-30732，
                   //   840t/专家 960t）；消费点 Projectile.cs:12879/12885/27124。
                   //   本仓吸血/治疗弹链未实装，效果位 getter 备用；
                   //   载荷在 NPC 401 召唤门禁（bossAI_duke_moonlord）
  Werewolf = 71,     // 狼人(28,月亮符 485 夜间)：melee +5.1%伤/+2暴/+5.1%速（:11488-11498）
  BrainOfConfusionBuff = 72, // 混乱之脑触发(321,受击1/6 4s)：三系+10暴 + 召唤+10%伤（:9639）
  ManaSickness = 69, // 魔力眩晕(94,喝蓝 AddBuff 300t)：magicDamage *= 1-0.25×(剩余/300)
                   //   （Player.cs:10000-10004 + :25616；满 debuff -25% 线性恢复。
                   //   ★33 是 Weak(近战-5.1%伤/速) 勿混）
  Obstructed = 68, // 遮挡(163)：headcovered + bleed（:11421-11425）——bleed 清自然恢复
                   //   计时（:18998 同流血 30）；headcovered → ScreenObstruction 遮屏
                   //   （目标 0.95/步进 0.3，ScreenObstruction.cs:27-31）。
                   //   由星云头蟹 421 头顶吸附每 tick AddBuff(163,59)（NPC.cs:39199）
}

export const BUFF_DEFS: Record<BuffType, { vanillaBuff: number; descKey: string; fallbackName: string }> = {
  [BuffType.Campfire]: { vanillaBuff: 87, descKey: 'Mods.SandboxWorld.Buff.Campfire.Desc', fallbackName: '篝火' },
  [BuffType.Agility]: { vanillaBuff: 3, descKey: 'Mods.SandboxWorld.Buff.Agility.Desc', fallbackName: '敏捷' },
  [BuffType.Ironskin]: { vanillaBuff: 5, descKey: 'Mods.SandboxWorld.Buff.Ironskin.Desc', fallbackName: '铁皮' },
  [BuffType.Resistance]: { vanillaBuff: 21, descKey: 'Mods.SandboxWorld.Buff.Resistance.Desc', fallbackName: '耐药性' },
  [BuffType.Thorns]: { vanillaBuff: 14, descKey: 'Mods.SandboxWorld.Buff.Thorns.Desc', fallbackName: '荆棘' },
  [BuffType.Regen]: { vanillaBuff: 2, descKey: 'Mods.SandboxWorld.Buff.Regen.Desc', fallbackName: '恢复' },
  // 蜂蜜描述直接用原版 BuffDescription.Honey（12 语言现成，语义一致）
  [BuffType.Honey]: { vanillaBuff: 48, descKey: 'BuffDescription.Honey', fallbackName: '蜂蜜' },
  // 环境伤害 debuff:名称走原版 BuffName,描述用自有键
  [BuffType.OnFire]: { vanillaBuff: 24, descKey: 'Mods.SandboxWorld.Buff.OnFire.Desc', fallbackName: '着火！' },
  [BuffType.Burning]: { vanillaBuff: 67, descKey: 'Mods.SandboxWorld.Buff.Burning.Desc', fallbackName: '燃烧！' },
  [BuffType.Bleeding]: { vanillaBuff: 30, descKey: 'Mods.SandboxWorld.Buff.Bleeding.Desc', fallbackName: '流血' },
  [BuffType.Suffocation]: { vanillaBuff: 68, descKey: 'Mods.SandboxWorld.Buff.Suffocation.Desc', fallbackName: '窒息' },
  // 药水族
  [BuffType.ObsidianSkin]: { vanillaBuff: 1, descKey: 'Mods.SandboxWorld.Buff.ObsidianSkin.Desc', fallbackName: '黑曜石皮' },
  [BuffType.Gills]: { vanillaBuff: 4, descKey: 'Mods.SandboxWorld.Buff.Gills.Desc', fallbackName: '鱼鳃' },
  [BuffType.ManaRegen]: { vanillaBuff: 6, descKey: 'Mods.SandboxWorld.Buff.ManaRegen.Desc', fallbackName: '魔力再生' },
  [BuffType.MagicPower]: { vanillaBuff: 7, descKey: 'Mods.SandboxWorld.Buff.MagicPower.Desc', fallbackName: '魔法力量' },
  [BuffType.Featherfall]: { vanillaBuff: 8, descKey: 'Mods.SandboxWorld.Buff.Featherfall.Desc', fallbackName: '羽落' },
  [BuffType.WaterWalking]: { vanillaBuff: 15, descKey: 'Mods.SandboxWorld.Buff.WaterWalking.Desc', fallbackName: '水上行走' },
  [BuffType.Archery]: { vanillaBuff: 16, descKey: 'Mods.SandboxWorld.Buff.Archery.Desc', fallbackName: '射手' },
  [BuffType.NightOwl]: { vanillaBuff: 12, descKey: 'Mods.SandboxWorld.Buff.NightOwl.Desc', fallbackName: '夜枭' },
  [BuffType.Sunflower]: { vanillaBuff: 146, descKey: 'Mods.SandboxWorld.Buff.Sunflower.Desc', fallbackName: '向日葵' },
  [BuffType.CatBast]: { vanillaBuff: 215, descKey: 'Mods.SandboxWorld.Buff.CatBast.Desc', fallbackName: '猫堡垒' },
  [BuffType.StarInBottle]: { vanillaBuff: 158, descKey: 'Mods.SandboxWorld.Buff.StarInBottle.Desc', fallbackName: '瓶中星' },
  [BuffType.PeaceCandle]: { vanillaBuff: 157, descKey: 'Mods.SandboxWorld.Buff.PeaceCandle.Desc', fallbackName: '和平蜡烛' },
  [BuffType.Clairvoyance]: { vanillaBuff: 29, descKey: 'Mods.SandboxWorld.Buff.Clairvoyance.Desc', fallbackName: '预见' },
  [BuffType.Sharpened]: { vanillaBuff: 159, descKey: 'Mods.SandboxWorld.Buff.Sharpened.Desc', fallbackName: '磨刀石' },
  [BuffType.AmmoBox]: { vanillaBuff: 93, descKey: 'Mods.SandboxWorld.Buff.AmmoBox.Desc', fallbackName: '弹药箱' },
  [BuffType.Bewitched]: { vanillaBuff: 150, descKey: 'Mods.SandboxWorld.Buff.Bewitched.Desc', fallbackName: '魅惑' },
  [BuffType.WarTable]: { vanillaBuff: 348, descKey: 'Mods.SandboxWorld.Buff.WarTable.Desc', fallbackName: '战争桌' },
  [BuffType.SugarRush]: { vanillaBuff: 192, descKey: 'Mods.SandboxWorld.Buff.SugarRush.Desc', fallbackName: '糖分冲刺' },
  [BuffType.Battle]: { vanillaBuff: 13, descKey: 'Mods.SandboxWorld.Buff.Battle.Desc', fallbackName: '战斗' },
  [BuffType.Calming]: { vanillaBuff: 106, descKey: 'Mods.SandboxWorld.Buff.Calming.Desc', fallbackName: '镇静' },
  [BuffType.Mining]: { vanillaBuff: 104, descKey: 'Mods.SandboxWorld.Buff.Mining.Desc', fallbackName: '挖矿' },
  [BuffType.Builder]: { vanillaBuff: 107, descKey: 'Mods.SandboxWorld.Buff.Builder.Desc', fallbackName: '建筑工' },
  [BuffType.Heartreach]: { vanillaBuff: 105, descKey: 'Mods.SandboxWorld.Buff.Heartreach.Desc', fallbackName: '拾心' },
  [BuffType.FlipperPotion]: { vanillaBuff: 109, descKey: 'Mods.SandboxWorld.Buff.FlipperPotion.Desc', fallbackName: '脚蹼' },
  [BuffType.Titan]: { vanillaBuff: 108, descKey: 'Mods.SandboxWorld.Buff.Titan.Desc', fallbackName: '泰坦' },
  [BuffType.AmmoReservation]: { vanillaBuff: 112, descKey: 'Mods.SandboxWorld.Buff.AmmoReservation.Desc', fallbackName: '弹药储备' },
  [BuffType.Lifeforce]: { vanillaBuff: 113, descKey: 'Mods.SandboxWorld.Buff.Lifeforce.Desc', fallbackName: '生命力' },
  [BuffType.Endurance]: { vanillaBuff: 114, descKey: 'Mods.SandboxWorld.Buff.Endurance.Desc', fallbackName: '耐久' },
  [BuffType.Wrath]: { vanillaBuff: 115, descKey: 'Mods.SandboxWorld.Buff.Wrath.Desc', fallbackName: '怒气' },  // 原版 Rage 药水
  [BuffType.Rage]: { vanillaBuff: 117, descKey: 'Mods.SandboxWorld.Buff.Rage.Desc', fallbackName: '暴怒' },  // 原版 Wrath 药水
  [BuffType.Tipsy]: { vanillaBuff: 25, descKey: 'Mods.SandboxWorld.Buff.Tipsy.Desc', fallbackName: '醉酒' },
  [BuffType.ManaSickness]: { vanillaBuff: 94, descKey: 'Mods.SandboxWorld.Buff.ManaSickness.Desc', fallbackName: '魔力眩晕' },
  [BuffType.Werewolf]: { vanillaBuff: 28, descKey: 'Mods.SandboxWorld.Buff.Werewolf.Desc', fallbackName: '狼人' },
  [BuffType.BrainOfConfusionBuff]: { vanillaBuff: 321, descKey: 'Mods.SandboxWorld.Buff.BrainOfConfusionBuff.Desc', fallbackName: '混乱之脑' },
  [BuffType.ImbueVenom]: { vanillaBuff: 71, descKey: 'Mods.SandboxWorld.Buff.ImbueVenom.Desc', fallbackName: '武器浸剂：毒液' },
  [BuffType.ImbueCursed]: { vanillaBuff: 73, descKey: 'Mods.SandboxWorld.Buff.ImbueCursed.Desc', fallbackName: '武器浸剂：诅咒焰' },
  [BuffType.ImbueFire]: { vanillaBuff: 74, descKey: 'Mods.SandboxWorld.Buff.ImbueFire.Desc', fallbackName: '武器浸剂：烈火' },
  [BuffType.ImbueGold]: { vanillaBuff: 75, descKey: 'Mods.SandboxWorld.Buff.ImbueGold.Desc', fallbackName: '武器浸剂：黄金' },
  [BuffType.ImbueIchor]: { vanillaBuff: 76, descKey: 'Mods.SandboxWorld.Buff.ImbueIchor.Desc', fallbackName: '武器浸剂：灵液' },
  [BuffType.ImbueNano]: { vanillaBuff: 77, descKey: 'Mods.SandboxWorld.Buff.ImbueNano.Desc', fallbackName: '武器浸剂：纳米' },
  [BuffType.ImbueParty]: { vanillaBuff: 78, descKey: 'Mods.SandboxWorld.Buff.ImbueParty.Desc', fallbackName: '武器浸剂：派对' },
  [BuffType.ImbuePoison]: { vanillaBuff: 79, descKey: 'Mods.SandboxWorld.Buff.ImbuePoison.Desc', fallbackName: '武器浸剂：剧毒' },
  [BuffType.Inferno]: { vanillaBuff: 116, descKey: 'Mods.SandboxWorld.Buff.Inferno.Desc', fallbackName: '狱火' },
  [BuffType.Shine]: { vanillaBuff: 11, descKey: 'Mods.SandboxWorld.Buff.Shine.Desc', fallbackName: '光芒' },
  [BuffType.Spelunker]: { vanillaBuff: 9, descKey: 'Mods.SandboxWorld.Buff.Spelunker.Desc', fallbackName: '洞穴探险' },
  [BuffType.Dangersense]: { vanillaBuff: 111, descKey: 'Mods.SandboxWorld.Buff.Dangersense.Desc', fallbackName: '危险感' },
  [BuffType.Hunter]: { vanillaBuff: 17, descKey: 'Mods.SandboxWorld.Buff.Hunter.Desc', fallbackName: '狩猎' },
  [BuffType.BiomeSight]: { vanillaBuff: 343, descKey: 'Mods.SandboxWorld.Buff.BiomeSight.Desc', fallbackName: '生物群系视觉' },
  [BuffType.Luck]: { vanillaBuff: 257, descKey: 'Mods.SandboxWorld.Buff.Luck.Desc', fallbackName: '幸运' },
  [BuffType.Summoning]: { vanillaBuff: 110, descKey: 'Mods.SandboxWorld.Buff.Summoning.Desc', fallbackName: '召唤' },
  [BuffType.Fishing]: { vanillaBuff: 121, descKey: 'Mods.SandboxWorld.Buff.Fishing.Desc', fallbackName: '钓鱼' },
  [BuffType.Sonar]: { vanillaBuff: 122, descKey: 'Mods.SandboxWorld.Buff.Sonar.Desc', fallbackName: '声呐' },
  [BuffType.Crate]: { vanillaBuff: 123, descKey: 'Mods.SandboxWorld.Buff.Crate.Desc', fallbackName: '宝匣' },
  [BuffType.Gravitation]: { vanillaBuff: 18, descKey: 'Mods.SandboxWorld.Buff.Gravitation.Desc', fallbackName: '重力' },
  // 描述直接用原版 BuffDescription（12 语言现成，语义一致，同 Honey 先例）
  [BuffType.Chilled]: { vanillaBuff: 46, descKey: 'BuffDescription.Chilled', fallbackName: '冰寒' },
  [BuffType.Frozen]: { vanillaBuff: 47, descKey: 'BuffDescription.Frozen', fallbackName: '冰冻' },
  // 食物三档：描述用原版 BuffDescription.WellFed*（"全面提升属性"语义一致，12 语言现成）
  [BuffType.WellFed]: { vanillaBuff: 26, descKey: 'BuffDescription.WellFed', fallbackName: '饱腹' },
  [BuffType.WellFed2]: { vanillaBuff: 206, descKey: 'BuffDescription.WellFed2', fallbackName: '很饱' },
  [BuffType.WellFed3]: { vanillaBuff: 207, descKey: 'BuffDescription.WellFed3', fallbackName: '饕餮' },
  // 后期批：描述直接用原版 BuffDescription（12 语言现成，语义一致，同 Chilled/Honey 先例）
  [BuffType.MoonLeech]: { vanillaBuff: 145, descKey: 'BuffDescription.MoonLeech', fallbackName: '月噬' },
  [BuffType.Obstructed]: { vanillaBuff: 163, descKey: 'BuffDescription.Obstructed', fallbackName: '遮挡' },
};

/** Main.buffNoSave 全名单（Main.cs:8896-8990：不写入玩家存档的 buff;
 *  含 173-181 整段 for 循环）——本仓仅存 BUFF_DEFS 已映射项,交集生效 */
const BUFF_NO_SAVE = new Set([
  20, 22, 23, 24, 28, 29, 30, 31, 34, 35, 37, 38, 39, 43, 44, 46, 47, 48,
  58, 59, 60, 62, 63, 64, 67, 68, 69, 70, 72, 80, 87, 88, 89, 93, 94, 95,
  96, 97, 98, 99, 100, 103, 119, 120, 125, 126, 133, 134, 135, 137, 139,
  140, 144, 146, 147, 150, 158, 159, 161, 163, 164, 170, 171, 172, 173, 174,
  175, 176, 177, 178, 179, 180, 181, 182, 187, 188, 194, 195, 196, 197, 198,
  199, 205, 213, 214, 215, 263, 271, 320, 321, 322, 325, 335, 348, 353, 355,
  366, 385, 386,
]);
/** vanilla buff id → 本仓 BuffType 反查（存档恢复用） */
const BUFF_TYPE_BY_VANILLA = new Map<number, BuffType>(
  (Object.keys(BUFF_DEFS) as unknown as BuffType[]).map((t) => [BUFF_DEFS[t].vanillaBuff, t]),
);

/** Buff 名:原版 BuffName.<Internal>(Lang 未就绪回退中文兜底) */
export function buffName(t: BuffType): string {
  return Lang.buffName(BUFF_DEFS[t].vanillaBuff) ?? BUFF_DEFS[t].fallbackName;
}

/** Buff 描述:自有键(机制数值是本仓库实现,不用原版通用描述) */
export function buffDesc(t: BuffType): string {
  return Lang.text(BUFF_DEFS[t].descKey);
}

/** HP/s 汇总表（UpdateBuffs lifeRegen 项换算：lifeRegen N = N/2 HP/s） */
const HP_PER_SEC: Partial<Record<BuffType, number>> = {
  [BuffType.Regen]: 2,   // lifeRegen+4
  [BuffType.Honey]: 1,   // lifeRegen+2
};

export class BuffState {
  active = new Map<BuffType, number>(); // 剩余秒（≈buffTime/60）
  campfireAccum = 0;
  lanternAccum = 0;
  /** 当前篝火光环强度(Game 每 20tick 扫描写入:篝火+1,心灯额外+1) */
  campfireHeal = 1;
  /** 心灯(lifeRegen+2 = 1 HP/s,Player.cs:12247):Game 扫描写入 0/1 */
  lanternHeal = 0;
  /** AddBuff 语义（Player.cs:5138-5150）：同类取 max 不缩短——浸入类 buff 可每帧无脑续期 */
  apply(type: BuffType, durationSec: number) {
    const cur = this.active.get(type);
    if (cur === undefined || cur < durationSec) this.active.set(type, durationSec);
  }
  has(type: BuffType): boolean {
    return this.active.has(type);
  }
  remove(type: BuffType) {
    this.active.delete(type);
  }
  /** 存档序列化（Player.cs:53913-53925 buffType+buffTime 槽位语义）:
   *  存 vanilla id + 剩余秒;Main.buffNoSave 名单(Main.cs:8896-8990)过滤不落盘的 buff */
  toSave(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const [t, sec] of this.active) {
      const v = BUFF_DEFS[t]?.vanillaBuff;
      if (v === undefined || BUFF_NO_SAVE.has(v)) continue;
      out.push([v, Math.max(1, Math.round(sec))]);
    }
    return out;
  }
  /** 读档恢复（旧档/导入缺省=无 buff;未知 vanilla id 静默丢弃——后续接入的 buff 不丢档） */
  applySaved(list: Array<[number, number]> | undefined): void {
    if (!list) return;
    for (const [v, sec] of list) {
      if (BUFF_NO_SAVE.has(v)) continue;
      const t = BUFF_TYPE_BY_VANILLA.get(v);
      if (t !== undefined) this.active.set(t, sec);
    }
  }
  /** 每逻辑帧（dt 秒）。返回本帧生命净变化（正=回复,负=持续伤害/DoT,无视无敌帧与防御） */
  tick(dt: number): number {
    let heal = 0;
    for (const [t, time] of [...this.active]) {
      const left = time - dt;
      if (left <= 0) this.active.delete(t);
      else this.active.set(t, left);
    }
    // 定额 HP/s buff（Regeneration 2 HP/s / Honey 1 HP/s）
    heal += this.rateAccum(BuffType.Regen, 2, dt);
    heal += this.rateAccum(BuffType.Honey, 1, dt);
    // 环境 DoT debuff（Player.cs:18793-18934 lifeRegen 负项 / 2 = HP/s）
    heal += this.rateAccum(BuffType.OnFire, -4, dt);        // lifeRegen-8
    heal += this.rateAccum(BuffType.Burning, -30, dt);      // lifeRegen-60
    heal += this.rateAccum(BuffType.Suffocation, -20, dt);  // lifeRegen-40
    // 蜂蜜对冲（Player.cs:18934-18940:lifeRegen<0 时 honey 额外 lifeRegen+4 = +2 HP/s）——
    // DoT 系统已实装,补上 buff-system-port 备忘里标"暂缺"的分支
    const dotActive = heal < 0;
    if (dotActive && this.active.has(BuffType.Honey)) {
      heal += this.rateAccum(BuffType.Honey, 2, dt, true);
    }
    if (this.active.has(BuffType.Campfire)) {
      // 原版 lifeRegen+1 = 0.5 HP/s(Player.cs:18990/12244-12245)→ 每 2 秒 1 HP
      this.campfireAccum += dt;
      if (this.campfireAccum >= 2) {
        this.campfireAccum -= 2;
        heal += this.campfireHeal;
      }
    }
    if (this.lanternHeal > 0) {
      this.lanternAccum += dt;
      if (this.lanternAccum >= 1) {
        this.lanternAccum -= 1;
        heal += this.lanternHeal;
      }
    }
    return heal;
  }
  /** 定额回复/伤害 buff 的独立累加器（Map 存每 buff 的秒余数;负速率=DoT）。
   *  separate=true 用独立累加器键(蜂蜜对冲与常规蜂蜜回复分账,避免共用余数) */
  private rateLeft = new Map<string, number>();
  private rateAccum(t: BuffType, hpPerSec: number, dt: number, separate = false): number {
    if (!this.active.has(t)) { this.rateLeft.delete(`${t}:${separate}`); return 0; }
    const key = `${t}:${separate}`;
    let left = (this.rateLeft.get(key) ?? 0) + hpPerSec * dt;
    let heal = 0;
    if (hpPerSec >= 0) {
      while (left >= 1) { left -= 1; heal += 1; }
    } else {
      while (left <= -1) { left += 1; heal -= 1; }
    }
    this.rateLeft.set(key, left);
    return heal;
  }
  // ---- 属性聚合（幂等读取，不做副作用写入）----
  get moveSpeedMult(): number {
    let m = this.active.has(BuffType.Agility) ? 1.25 : 1;   // Swiftness moveSpeed += 0.25
    if (this.active.has(BuffType.Burning)) m *= 0.5;         // Burning moveSpeed *= 0.5（:18886）
    if (this.active.has(BuffType.Chilled)) m *= 0.75;        // Chilled moveSpeed *= 0.75（:25659-25661）
    if (this.active.has(BuffType.Sunflower)) m *= 1.21;      // 向日葵 +0.1 再 ×1.1 两步复合（:10598）
    if (this.active.has(BuffType.SugarRush)) m *= 1.2;       // 糖分冲刺 moveSpeed += 0.2（:9634）
    m += [0, 0.2, 0.3, 0.4][this.wellFedTier];               // 食物 moveSpeed += 0.2/0.3/0.4（:11532+）
    return m;
  }
  get defenseBonus(): number {
    let d = this.active.has(BuffType.Ironskin) ? 8 : 0;     // Ironskin statDefense += 8（1456）
    if (this.active.has(BuffType.CatBast)) d += 5;          // 猫堡垒 statDefense += 5（:9778）
    if (this.active.has(BuffType.Tipsy)) d -= 4;            // 醉酒 statDefense -= 4（:11514）
    d += [0, 2, 3, 4][this.wellFedTier];                    // 食物 statDefense += 2/3/4（:11524+）
    return d;
  }
  /** 魔力上限加成：水晶球预见 statManaMax2 += 20（:11481） */
  get manaMaxBonus(): number {
    return this.active.has(BuffType.Clairvoyance) ? 20 : 0;
  }
  /** 弹药箱 20% 不耗弹（PickAmmo :52746 rand.Next(5)==0） */
  get hasAmmoBox(): boolean {
    return this.active.has(BuffType.AmmoBox);
  }
  // ---- 食物三档属性（Player.cs:11523-11570；同时多档激活时取最高档，与原版逐条累加
  // 等价——原版吃高档后低档不可能并存低于高档单独存在的情况）----
  /** 当前生效的食物档位：0 无 / 1 WellFed(26) / 2 WellFed2(206) / 3 WellFed3(207) */
  get wellFedTier(): 0 | 1 | 2 | 3 {
    if (this.active.has(BuffType.WellFed3)) return 3;
    if (this.active.has(BuffType.WellFed2)) return 2;
    if (this.active.has(BuffType.WellFed)) return 1;
    return 0;
  }
  /** 全系伤害 +5/7.5/10%（meleeDamage/magicDamage/rangedDamage/minionDamage 同值,:11527+） */
  get wellFedDamage(): number {
    return [0, 0.05, 0.075, 0.1][this.wellFedTier];
  }
  /** 全系暴击 +2/3/4（melee/magic/rangedCrit 同值,:11525+） */
  get wellFedCrit(): number {
    return [0, 2, 3, 4][this.wellFedTier];
  }
  /** 近战速度 +5/7.5/10%（meleeSpeed += ,:11528+） */
  get wellFedMeleeSpeed(): number {
    return [0, 0.05, 0.075, 0.1][this.wellFedTier];
  }
  /** 镐速 +5/10/15%（pickSpeed -= ,:11534+）→ 挖掘倍率 */
  get wellFedPickMult(): number {
    return [1, 0.95, 0.9, 0.85][this.wellFedTier];
  }
  get healthBonus(): number {
    return this.active.has(BuffType.Resistance) ? 80 : 0;
  }
  get hasThorns(): boolean {
    return this.active.has(BuffType.Thorns);
  }
  get healBlocked(): boolean {
    return this.active.has(BuffType.Resistance);
  }
  // ---- 月噬 145（Player.cs:11454-11457 moonLeech = true）----
  // 消费点（Projectile.cs）：12879 吸血弹 304 vampireHeal / 12885 ghostHeal /
  // 27124 aiStyle 52 治疗弹拾取——三处均在 !moonLeech 门内。本仓吸血/治疗弹链
  // 未实装，效果位在此备用；实际载荷 = NPC 401 月噬怪召唤门禁（原版以
  // FindBuffIndex(145) 判，见 bossAI_duke_moonlord.spawnMoonLeech）
  get moonLeech(): boolean {
    return this.active.has(BuffType.MoonLeech);
  }
  // ---- 遮挡 163（Player.cs:11421-11425 headcovered + bleed）----
  /** bleed 语义（:18998）：清 lifeRegenTime → 自然恢复计时归零阻断（同流血 30）。
   *  Player.ts 自然回血段与 Bleeding 同门消费 */
  get obstructed(): boolean {
    return this.active.has(BuffType.Obstructed);
  }
  // ---- 药水族效果聚合（Player.cs UpdateBuffs 各 case 1:1）----
  /** 黑曜石皮:lavaImmune + fireWalk + 着火免疫（:9573-9577） */
  get obsidianSkin(): boolean {
    return this.active.has(BuffType.ObsidianSkin);
  }
  get gills(): boolean {
    return this.active.has(BuffType.Gills);
  }
  get slowFall(): boolean {
    return this.active.has(BuffType.Featherfall);
  }
  get canWaterWalk(): boolean {
    return this.active.has(BuffType.WaterWalking);
  }
  get manaRegenBuff(): boolean {
    return this.active.has(BuffType.ManaRegen);
  }
  /** 魔法伤害 +20%（:9669） */
  get magicDmgBonus(): number {
    return this.active.has(BuffType.MagicPower) ? 0.2 : 0;
  }
  /** 箭伤 ×1.1（:9712;本仓库 ranged 管道统一消费,乘 ranged 全系——近义注明） */
  /** 魔力眩晕 magic 减伤（Player.cs:10003：0.25×剩余/300；apply 用秒，300t=5s） */
  get manaSickMagicMult(): number {
    const left = this.active.get(BuffType.ManaSickness);
    if (left === undefined) return 1;
    return 1 - Math.min(0.25, 0.25 * (left / 5));
  }
  get arrowDmgMult(): number {
    return this.active.has(BuffType.Archery) ? 1.1 : 1;
  }
}
