// 伤害飘字色单源（★附带④：Enemy/Player/Minecart 各站硬编码收敛——真值全表
// 取 Terraria.CombatText.cs:8-16 的六个静态只读字段；×0.4f 为 Color 标量乘。
// hex 必须保 '#RRGGBB' 定式——Renderer 位图字体路径按三元组解析（drawCombatText
// 前置 parse），rgba()/rgb() 写法会 NaN 化）
//
//   DamagedFriendly        = (255, 80, 90)     CombatText.cs:8
//   DamagedFriendlyCrit    = (255,100, 30)     CombatText.cs:10
//   DamagedHostile         = (255,160, 80)     CombatText.cs:12
//   DamagedHostileCrit     = (255,100, 30)     CombatText.cs:14
//   OthersDamagedHostile      = DamagedHostile    ×0.4 = (102, 64, 32) CombatText.cs:15
//   OthersDamagedHostileCrit  = DamagedHostileCrit ×0.4 = (102, 40, 12) CombatText.cs:16

export const COMBAT_TEXT_DAMAGED_FRIENDLY = '#FF505A';        // (255,80,90)
export const COMBAT_TEXT_DAMAGED_FRIENDLY_CRIT = '#FF641E';   // (255,100,30)
export const COMBAT_TEXT_DAMAGED_HOSTILE = '#FFA050';         // (255,160,80)
export const COMBAT_TEXT_DAMAGED_HOSTILE_CRIT = '#FF641E';    // (255,100,30)——与 friendly crit 同值
export const OTHERS_DAMAGED_HOSTILE = '#664020';              // ×0.4 (102,64,32)
export const OTHERS_DAMAGED_HOSTILE_CRIT = '#66280C';         // ×0.4 (102,40,12)

/** 玩家受击（Player.Hurt 文本位 :38670 分档）飘字色——摔伤/熔岩等一切 Hurt 系直扣
 *  共用此分档（Player.ts 摔伤×2/预览×2 与 Minecart 碾压站消费） */
export function playerHurtFloatColor(crit: boolean): string {
  return crit ? COMBAT_TEXT_DAMAGED_FRIENDLY_CRIT : COMBAT_TEXT_DAMAGED_FRIENDLY;
}

/** NPC 受击（StrikeNPC :82006-82015 单点发射）飘字色分档：friendly 支 /
 * hostile 本端支 / 远端访客来源支（msg42 pendingStrikeOwner≥0 → Others ×0.4 灰） */
export function enemyHurtFloatColor(opts: {
  friendly: boolean;
  crit: boolean;
  fromRemoteVisitor?: boolean;
}): string {
  if (opts.friendly) return opts.crit ? COMBAT_TEXT_DAMAGED_FRIENDLY_CRIT : COMBAT_TEXT_DAMAGED_FRIENDLY;
  if (opts.fromRemoteVisitor) {
    return opts.crit ? OTHERS_DAMAGED_HOSTILE_CRIT : OTHERS_DAMAGED_HOSTILE;
  }
  return opts.crit ? COMBAT_TEXT_DAMAGED_HOSTILE_CRIT : COMBAT_TEXT_DAMAGED_HOSTILE;
}
