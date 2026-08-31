// 弹幕命中尾 npc.immune[owner] 写值档位表（★GC1 清零批二波，2026-08-31；
// 蓝队二轮 F4 行号/叙事校准 + F1 face 判定序重排，2026-08-31）。
// 唯一标杆：Terarria1457/Terraria/Projectile.cs Damage() 命中尾免疫梯
// （:14031-14183），逐支对照 1456 :13007-13162 同构段确认无漂移。
//
// ★蓝队 F4 三处事实勘误（原头注叙事有误，此为准）：
//   · type 1110【非】1457 新增——1456 :13052 `443 || 1110` 已同档写 8（:13052-13054）；
//   · 632 在 1456 是常量档 immune[owner]=5（1456 :13032-13035），1457 改为动态
//     GetSlowMagicUseTime(5)（:14056-14058）——实现按 1457 动态式保留，正确；
//   · 286 在 1456 有专属定档写 5（1456 :13048-13051），该支被 1457 删除
//     （1457 梯内无 286 型）——本表依 1457 权威不登记 286 定档（其 SetDefaults
//     三旗面 idStatic+applies 见 vanillaProjImmuneFaces.ts，仍由 idStatic 支正确接住）。
//
// 原文结构（写段先于 `if (penetrate > 0) penetrate--` :14189，故判定用写前现存量）：
//   ① usesIDStaticNPCImmunity → immune[owner]=0 + perIDStaticNPCImmunity[id,victim]
//      = GameUpdateCount+idStaticNPCHitCooldown（:14031-14037）；penetrate==1 且
//      !appliesImmunityTimeOnSingleHits 时整支不触全局窗。★顶层分支，优先于一切型档。
//   ② type==434 → numUpdates=0，【无】任何免疫写（:14039-14041）。
//   ③ type∈{598,636,614}（镖/标枪上限管理族）→ KillOldestJavelin 后落出整条
//      梯子 = 【无】全局免疫写（:14043-14054，顶层分派跳过 default 档）。
//   ④ 显型定档（else-if 链中层）：
//        632 → GetSlowMagicUseTime(5)（:14056-14058；慢施蓝空过载放大窗，
//              调用方持 player 上下文自行换算）
//        514 → 1（:14060-14062）     595/735 → 5（:14064-14066）
//        927 → 4（:14068-14070）    443/1110 → 8（:14072-14074）
//        424..426 → 5（:14076-14078） 634/635 → 5（:14080-14082） 659 → 5（:14084-14086）
//        246 → 7（:14088-14090）    249 → 7（:14092-14094）   16 → 8（:14096-14098）
//        409 → 6（:14100-14102）    582/902 → 7（:14104-14106，另有 ai[0] net 面）
//   ⑤ else 内层（:14113-14184）：451 特化 return（无写 :14115-14128）/ 864·866
//      局部表写+immune[owner]=0（:14130-14140 / :14141-14169）/ 611·612 → immune=4
//      且【同时】局部表写（:14170-14173）/ usesLocalNPCImmunity&&cd!=-2 →
//      immune[owner]=0（:14175-14179，全局窗显式清零、节流全由弹内局部表承担）/
//      末档 `(penetrate != 1 || appliesImmunityTimeOnSingleHits)` → 10
//      （:14180-14183——单发弹 flag3 绕门族既绕过 ：12636 免疫门也不回写窗口）。
// ★判定序照原文链位：idStatic(①) → 旁路无写支(②③) → 显型定档(④) → 内层 864/866/
//   611/612 → usesLocal 主支 → 末档——face 参在显型定档【之前】只接受 idStatic，
//   localFace 不再前插到④之前（弹型既带显型档又带局部旗时按原版③④优先）。

export const PROJ_IMMUNE_NO_WRITE_TYPES = new Set<number>([
  434,            // （:14039-14041 numUpdates 支,无写）
  451,            // （:14115-14128 特化支 keepIterating=false 提前 return,无写）
  598, 636, 614,  // （:14043-14054 标枪上限族,顶层分派旁路整条梯子）
]);

/** 无慢施上下文可用的 632 慢施放大档标记值（调用方见 set 即自算替换：
 *  player.getSlowMagicUseTime(5)，最小 5 恒底） */
export const PROJ_IMMUNE_SLOW_MAGIC_TIER = -3;

/** ①④⑤ 梯子纯表。返回 noteNpcPlayerImmune 语义帧数：
 *  -1 = 本型该次无写（不调 API）/ 0 = 显式清窗（原版写 0 段）/
 *  N>0 = 写 N 帧 / PROJ_IMMUNE_SLOW_MAGIC_TIER = 632 慢施档由调用方换算 */
export function projGlobalImmuneWriteTicks(
  type: number,
  opts?: {
    /** Damage() 现存穿透数（写段时刻未递减值；缺省=数据面 penetrate ?? 1） */
    penetrate?: number | null;
    /** usesLocalNPCImmunity && localNPCHitCooldown != -2 面（含 864/866 族）
     *  ——★按原文位置在显型定档【之后】求值 */
    localFace?: boolean;
    /** appliesImmunityTimeOnSingleHits（SetDefaults 登记源 =
     *  data/vanillaProjImmuneFaces.ts;桥层未传时自动补表解析） */
    appliesSingleHit?: boolean;
    /** usesIDStaticNPCImmunity 面（perIDStatic 冷却在弹类自有表承接）——顶层支 */
    idStaticFace?: boolean;
  },
): number {
  const o = opts ?? {};
  if (o.idStaticFace) {
    // （:14031-14037）：penetrate!=1 || applies… 才触全局窗（恒清零语义）
    const p = o.penetrate ?? 1;
    return (p !== 1 || o.appliesSingleHit === true) ? 0 : -1;
  }
  if (PROJ_IMMUNE_NO_WRITE_TYPES.has(type)) return -1;
  switch (type) {
    case 514: return 1;
    case 595: case 735: return 5;
    case 927: return 4;
    case 443: case 1110: return 8;
    case 424: case 425: case 426: return 5;
    case 634: case 635: case 659: return 5;
    case 246: case 249: return 7;
    case 16: return 8;
    case 409: return 6;
    case 582: case 902: return 7;
    case 632: return PROJ_IMMUNE_SLOW_MAGIC_TIER;   // GetSlowMagicUseTime(5)（:14056）
    default:
      break;
  }
  // —— else 内层（:14113-14184）——
  if (type === 864 || type === 866) return 0;       // （:14130-14140/:14141-14169 局部表写+immune=0 同形支）
  if (type === 611 || type === 612) return 4;       // （:14170-14173 全局 4 + 局部表并写）
  if (o.localFace) return 0;                        // （:14175-14179 usesLocalNPCImmunity 主支,cd!=-2 门在桥层核）
  // 末档（:14180-14183）：写前现存 penetrate != 1（或单发也设帧旗标）→ 默认 10t
  const p = o.penetrate ?? 1;
  return (p !== 1 || o.appliesSingleHit === true) ? 10 : -1;
}
