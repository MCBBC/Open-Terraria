// 召唤师专属数值链（原版 Player.ApplyEquipFunctional 按装备 type 的 if-chain 1:1 抄录；
// 原版该循环覆盖 armor[0-9]——盔甲三件+配饰同判，本表由 Player.equipStats 对两类槽位各扫一遍）。
// vanilla-accfx.json 提取器未覆盖 maxMinions/minionDamage/whipRange 模式 → 独立表补齐。
// 行号：Player.cs:13405-13459（散件）、12847-12863（禁戒）、13180-13184（神圣兜帽）、
// 13235-13239（绿藻）、13391-13404（Flinx/蜂）、13426-13437（Tiki）、13438-13447（蜘蛛）、
// 13448-13459（星尘）、13513-13528（诡异）、14766-14781（配饰四件）
export interface SummonFx {
  slot?: number;      // maxMinions += N
  sentry?: number;    // maxTurrets += N
  dmg?: number;       // minionDamage += X（加算乘区）
  kb?: number;        // minionKB += N
  whipRange?: number; // whipRangeMultiplier += X
  /** 1457 鞭 tag 栈族（ApplyEquipFunctional :13068-13083）：
   *  tagEffectDuration += N（SilverBracer 6156 系 +2 → tag/proc/buff 时长 ×3） */
  tagDur?: number;
  /** maxTagEffects += N（6156/6158/6159 系各 +1——多鞭 mark 并存上限） */
  maxTag?: number;
  /** accSnakeBand（6157/6162/6186——每 3 挥中段补挥背包下一把鞭,需 maxTagEffects>1） */
  snakeBand?: boolean;
  /** accWickedArmlet（6159/6163/6179/6182——出鞭击退 +1,ItemCheck_Shoot :49159-49163） */
  wickedArmlet?: boolean;
  /** OOA 配饰族（3809-3812）：dd2Accessory 布尔——全部佩戴只计一次（Player.cs:12571-12575） */
  dd2?: boolean;
}

/** 装备散件/配饰（type 直查）——含配饰 1158/1167/1845/1864 与 OOA 四配饰 3809-3812 */
export const SUMMON_GEAR: Record<number, SummonFx> = {
  // 配饰（14766-14781 + OOA 12571-12575）
  1158: { slot: 1 },                    // 俾格米项链
  1167: { dmg: 0.15, kb: 2 },           // 大力士甲虫（不加槽）
  1845: { slot: 1, dmg: 0.10 },         // 死灵卷轴
  1864: { slot: 1, dmg: 0.15, kb: 2 },  // 纸莎草圣甲虫
  3809: { dd2: true },              // 学徒围巾（OOA 布尔:全族只计一次 +1哨兵/+10%召唤伤,:12571——旧每件累加+4/+40%）
  3878: { dmg: 0.25 },                   // 忍者大师装备（:12799 minionDamage+25%+ammoCost80）
  3810: { dd2: true },              // 侍从盾（OOA 布尔:全族只计一次 +1哨兵/+10%召唤伤,:12571——旧每件累加+4/+40%）
  3811: { dd2: true },              // 女猎手扣盾（OOA 布尔:全族只计一次 +1哨兵/+10%召唤伤,:12571——旧每件累加+4/+40%）
  3812: { dd2: true },              // 武僧腰带（OOA 布尔:全族只计一次 +1哨兵/+10%召唤伤,:12571——旧每件累加+4/+40%）

  // ---- 1457 召唤师鞭 tag 配饰九件（ApplyEquipFunctional case 6156-6163/:14615-14632
  //      + 组合件 6179/6182/6183 :14690-14715;数值段 :13068-13083）----
  //  6156 SilverBracer:tagEffectDuration += 2（时长 ×3!）+ maxTagEffects++（:13068-13074,
  //    minionDamage += 0f 死代码勿抄）;6157 SnakeBand:accSnakeBand;6158 MobiusStrip:
  //    maxTagEffects++ + whipRangeMultiplier += 0.1;6159 WickedArmlet:maxTagEffects++;
  //  组合件=旗标并集:6162 OuroborosRing = MobiusStrip+SnakeBand（:14624-14627）;
  //  6163 TwilightGrasp = SilverBracer+WickedArmlet（:14628-14630 → 时长+2+双 +1）;
  //  6179 ArmletOfRuin = WickedArmlet+accArmletOfRuin（:14690-14693）;6182 WickedClaws
  //  = WickedArmlet+autoReuseGlove+meleeSpeed+0.12（:14705-14709）;6183 SilverShield
  //  = SilverBracer+noKnockback+fireWalk（:14711-14715）
  6156: { tagDur: 2, maxTag: 1 },                 // 银护腕（上锁盒 1/4,OpenLockBox :9452-9454）
  6157: { snakeBand: true },                      // 蛇环
  6158: { maxTag: 1, whipRange: 0.1 },            // 莫比乌斯带（石巨人袋 1/6,OpenBossBag :7516-7518）
  6159: { maxTag: 1, wickedArmlet: true },        // 邪恶臂镯
  6162: { maxTag: 1, whipRange: 0.1, snakeBand: true },   // 衔尾蛇环 = 6158+6157
  6163: { tagDur: 2, maxTag: 2, wickedArmlet: true },     // 暮光之握 = 6156+6159
  6179: { maxTag: 1, wickedArmlet: true },        // 毁灭臂镯 = 6159+accArmletOfRuin（旗在 Player 侧）
  6182: { maxTag: 1, wickedArmlet: true },        // 邪恶之爪 = 6159+autoReuseGlove+近战速+12%（Player 侧）
  6183: { tagDur: 2, maxTag: 1 },                 // 白银之盾 = 6156+免击退+火焰块（Player 侧）
  6186: { snakeBand: true },                      // 德鲁伊蛇斗篷 = 6157+星星斗篷（:14726-14729,星斗篷旗 Player 侧）

  // ---- DD2 头盔散件（ApplyEquipFunctional :12709-12810:头盔 maxTurrets;2026-08-13 补——
  // 旧缺 8 件致哨兵上限卡 ~3。T1 头 3797/3800/3803/3806 各 +1;T3 头 3871/3874/3877/3880
  // 各 +2;T3 头另带 minionDamage（3871 +0.1/3874 +0.15/3877 +0.1/3880 +0.2）。
  // ★世代勘误:3797-3808=T2 族（T1 无头盔散件 maxTurrets）
  // 主属性（manaCost/魔伤/再生/暴击/攻速等）走 armorStat 大批,登记未接 ----
  3797: { sentry: 1 },                 // 学徒帽 T2（:12711 +1;manaCost-0.1/魔伤+0.1）
  3800: { sentry: 1 },                 // 侍从头盔 T2（:12721 +1;lifeRegen+4）
  3803: { sentry: 1 },                 // 女猎手头巾 T2（:12740 +1;远程暴+10）
  3806: { sentry: 1 },                 // 武僧头带 T2（:12732 +1;近战速+0.2）
  3871: { sentry: 2, dmg: 0.10 },      // 学徒战斗帽 T3（:12763 +2;近战/召唤伤+0.1）
  3874: { sentry: 2, dmg: 0.15 },      // 侍从巨盔 T3（:12770 +2）
  3877: { sentry: 2, dmg: 0.10 },      // 女猎手服 T3（:12786 +2;远程暴+10）
  3880: { sentry: 2, dmg: 0.20 },      // 武僧束发 T3（:12807 +2;近战伤+0.2）  // 盔甲散件
  2361: { slot: 1, dmg: 0.04 },         // 蜂头饰
  2362: { slot: 1, dmg: 0.04 },         // 蜂胸甲
  2363: { dmg: 0.05 },                  // 蜂护胫（无槽）
  2370: { slot: 1, dmg: 0.05 },         // 蜘蛛面具
  2371: { slot: 1, dmg: 0.05 },         // 蜘蛛胸甲
  2372: { slot: 1, dmg: 0.06 },         // 蜘蛛护胫
  3266: { dmg: 0.08 },                  // 黑曜头
  3267: { slot: 1 },                    // 黑曜衫
  3268: { dmg: 0.08 },                  // 黑曜裤
  3381: { slot: 1, sentry: 1, dmg: 0.22 },            // 星尘头盔（同加两链！）
  3382: { slot: 2, dmg: 0.22, whipRange: 0.15 },      // 星尘胸甲
  3383: { slot: 2, dmg: 0.22, whipRange: 0.15 },      // 星尘护腿
  1159: { slot: 1, dmg: 0.10, whipRange: 0.10 },      // 提基面具
  1160: { slot: 1, dmg: 0.10 },         // 提基衫
  1161: { slot: 1, dmg: 0.10 },         // 提基裤
  1832: { slot: 1, dmg: 0.11 },         // 诡异头盔
  1833: { slot: 2, dmg: 0.11 },         // 诡异胸甲
  1834: { slot: 1, dmg: 0.11 },         // 诡异护腿
  3776: { dmg: 0.15 },                  // 禁戒面具（另 magicDmg——accfx 主链管）
  3777: { slot: 1, dmg: 0.10 },         // 禁戒长袍
  3778: { slot: 1 },                    // 禁戒裤
  4873: { slot: 1, dmg: 0.10 },         // 神圣兜帽
  4899: { slot: 1, dmg: 0.10 },         // 神圣面具(远古)
  5524: { slot: 1, dmg: 0.16 },         // 绿藻头饰
  5068: { slot: 1, dmg: 0.05 },         // Flinx 皮大衣
};

/** 套装奖励中的召唤系条目（Player.cs:15905-16167；槽序键同 ARMOR_SET_BONUSES） */
export interface SummonSetFx extends SummonFx {
  /** 黑曜套装鞭攻速（whipUseTimeMultiplier *= 1/1.15 → 鞭 useTime ×1/1.15） */
  whipSpd?: number;
  /** 行为型：星尘守护者（套装在身 → buff 187 + 常驻 proj 623） */
  guardian?: boolean;
  /** 女猎手 T2/T3 套装旗标（Player.cs:16119-16122 / :16145-16149 setHuntressT2）：
   *  爆炸机关弹 694-696 命中上 Oiled 门（StatusNPC :10786）+ 机关冷却 90→60/30
   *  （GetExplosiveTrapCooldown :66109-66119,冷却档未接登记） */
  huntressT2?: boolean;
}

export const SUMMON_SET: Record<string, SummonSetFx> = {
  '283|51|47': { slot: 2 },                              // 绿藻召唤头
  // 神圣召唤头(Player.cs:16023-16028:head 254/258 +1 maxMinions×2)——旧键
  // '24|229|*'(hs24=红帽/hs23=空槽)致真套装永不触发+红帽误触发,2026-08-13 修
  '254|24|23': { slot: 2 }, '254|24|212': { slot: 2 },
  '254|229|23': { slot: 2 }, '254|229|212': { slot: 2 },
  '258|24|23': { slot: 2 }, '258|24|212': { slot: 2 },
  '258|229|23': { slot: 2 }, '258|229|212': { slot: 2 },
  '82|53|48': { slot: 1, whipRange: 0.2 },               // 提基
  '134|95|79': { dmg: 0.25 },                            // 诡异 +25%
  '160|168|103': { dmg: 0.10 },                          // 蜂 +10%
  '162|170|105': { dmg: 0.12 },                          // 蜘蛛 +12%
  '185|187|127': { dmg: 0.15, whipRange: 0.3, whipSpd: 1 / 1.15 }, // 黑曜（+15%伤/鞭程+30%/鞭速+15%）
  // ---- DD2 八组套装（:16107-16157 各 maxTurrets++;键=hs|bs|ls 即源码 head/body/legs 偏移段）----
  // 套装专精旗标（setSquireT3 等→Etherian mana 消耗/哨兵行为）与 bonus 文本登记未接
  '204|201|145': { sentry: 1 },      // Squire T2（:16107）
  '203|200|144': { sentry: 1 },      // Apprentice T2（:16113）
  '205|202|146': { sentry: 1, huntressT2: true },  // Huntress T2（:16119;腿 146/147 双变体,146 实装）
  '205|202|147': { sentry: 1, huntressT2: true },  // Huntress T2 腿变体 147（:16121 (legs == 147 || legs == 146)）
  '206|203|148': { sentry: 1 },      // Monk T2（:16125）
  '210|204|152': { sentry: 1 },      // Squire T3（:16131）
  '211|205|153': { sentry: 1 },      // Apprentice T3（:16138）
  '212|206|154': { sentry: 1, huntressT2: true },  // Huntress T3（:16145;T3 也置 setHuntressT2 :16149）
  '212|206|155': { sentry: 1, huntressT2: true },  // Huntress T3 腿变体 155（:16147）
  '213|207|156': { sentry: 1 },      // Monk T3（:16152）
  '189|190|130': { guardian: true },                     // 星尘（不加槽，守护者行为型）
};
