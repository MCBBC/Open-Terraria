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

  // ---- DD2 头盔散件（ApplyEquipFunctional :12709-12810:头盔 maxTurrets;2026-08-13 补——
  // 旧缺 8 件致哨兵上限卡 ~3。T1 头 3797/3800/3803/3806 各 +1;T3 头 3871/3874/3877/3880
  // 各 +2;T3 头另带 minionDamage（3871 +0.1/3874 +0.15/3877 +0.1/3880 +0.2）。
  // 主属性（manaCost/魔伤/再生/暴击/攻速等）走 armorStat 大批,登记未接 ----
  3797: { sentry: 1 },                 // 学徒帽 T1（:12711 +1;manaCost-0.1/魔伤+0.1）
  3800: { sentry: 1 },                 // 侍从头盔 T1（:12721 +1;lifeRegen+4）
  3803: { sentry: 1 },                 // 女猎手头巾 T1（:12740 +1;远程暴+10）
  3806: { sentry: 1 },                 // 武僧头带 T1（:12732 +1;近战速+0.2）
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
  '189|190|130': { guardian: true },                     // 星尘（不加槽，守护者行为型）
};
