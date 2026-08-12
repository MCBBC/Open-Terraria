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
}

/** 装备散件/配饰（type 直查）——含配饰 1158/1167/1845/1864 与 OOA 四配饰 3809-3812 */
export const SUMMON_GEAR: Record<number, SummonFx> = {
  // 配饰（14766-14781 + OOA 12571-12575）
  1158: { slot: 1 },                    // 俾格米项链
  1167: { dmg: 0.15, kb: 2 },           // 大力士甲虫（不加槽）
  1845: { slot: 1, dmg: 0.10 },         // 死灵卷轴
  1864: { slot: 1, dmg: 0.15, kb: 2 },  // 纸莎草圣甲虫
  3809: { sentry: 1, dmg: 0.10 },       // 学徒围巾（OOA 配饰四件同款）
  3810: { sentry: 1, dmg: 0.10 },       // 侍从盾
  3811: { sentry: 1, dmg: 0.10 },       // 女猎手扣盾
  3812: { sentry: 1, dmg: 0.10 },       // 武僧腰带
  // 盔甲散件
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
  '24|229|*': { slot: 2 }, '24|212|*': { slot: 2 },      // 神圣召唤头（身体两版）
  '23|229|*': { slot: 2 }, '23|212|*': { slot: 2 },
  '82|53|48': { slot: 1, whipRange: 0.2 },               // 提基
  '134|95|79': { dmg: 0.25 },                            // 诡异 +25%
  '160|168|103': { dmg: 0.10 },                          // 蜂 +10%
  '162|170|105': { dmg: 0.12 },                          // 蜘蛛 +12%
  '185|187|127': { dmg: 0.15, whipRange: 0.3, whipSpd: 1 / 1.15 }, // 黑曜（+15%伤/鞭程+30%/鞭速+15%）
  '189|190|130': { guardian: true },                     // 星尘（不加槽，守护者行为型）
};
