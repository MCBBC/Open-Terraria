// ★SW-BJ55（2026-09-10）季节拾取物替代（Item.NewItem 节日变体臂 1:1）：
//   1457 Item.cs:49670-49720（1458 同位 49677-49692，逐行号零漂移）——
//   世界掉落生成 chokepoint（NewItem 整型坐标重载）在入表前把心 58 / 星 184
//   替换为节日糖果变体。三分支优先级（原文照抄）：
//     ① Main.tenthAnniversaryWorld → 58 从 {1734,1867,58} 均匀掷、184 从 {1735,1868,184}
//       （十周年世界糖果与原版心/星三分天下）；
//     ② else if halloween && xMas（两季叠加，如南瓜月胜利强制位撞上圣诞窗）
//       → 58 从 {1734,1867}、184 从 {1735,1868}；
//     ③ else → halloween: 58→1734 / 184→1735；xMas: 58→1867 / 184→1868
//       （两 if 独立——单季开窗时只走命中那支）。
//   消费端（Player.PickupItem Player.cs:35344-35362）心族 {58,1734,1867}=Heal(20)、
//   星族 {184,1735,1868}=+100 魔力——本仓 pickup 语义（ItemDrop 'heart'=+20HP /
//   'star'=+100MP）按【原始 id】打标（Enemy.ts spawn 闭包），替代后取值不变=1:1。
//   掷源：原版 Main.rand.NextFromList（均匀）；本仓 rand 注入（测试变异面）。

/** ItemID：心 58 / 星 184 / 糖苹果 1734 / 灵魂蛋糕 1735 / 拐杖糖 1867 / 糖梅 1868
 *  （Terraria.ID/ItemID.cs:5014/5016/5280/5282） */
export type PickupVid = 58 | 184;

export interface SeasonalPickupCtx {
  /** Main.halloween（现实万圣窗 10/10-11/1 ∪ 强制位，checkHalloween Main.cs:13329） */
  halloween: boolean;
  /** Main.xMas（现实圣诞窗 12/15-31 ∪ 强制位，checkXMas Main.cs:13290） */
  xMas: boolean;
  /** Main.tenthAnniversaryWorld（celebrationmk10 种子旗，优先级最高臂） */
  tenthAnniversaryWorld: boolean;
}

export function isPickupVid(vid: number): vid is PickupVid {
  return vid === 58 || vid === 184;
}

/** 节日替代决策（返回替代后的 vid；窗外/无旗恒原样返回） */
export function holidayPickupSubstitute(
  vid: PickupVid,
  ctx: SeasonalPickupCtx,
  rand: () => number = Math.random,
): number {
  const pick = (xs: readonly number[]): number => xs[Math.floor(rand() * xs.length)] ?? xs[0];
  if (ctx.tenthAnniversaryWorld) {
    // Item.cs:49672-49683：十周年世界——糖果与原版 pickup 三选一
    return vid === 58 ? pick([1734, 1867, 58]) : pick([1735, 1868, 184]);
  }
  if (ctx.halloween && ctx.xMas) {
    // Item.cs:49684-49696：双季叠加——糖果二选一
    return vid === 58 ? pick([1734, 1867]) : pick([1735, 1868]);
  }
  // Item.cs:49697-49719：单季（两 if 独立照抄）
  let out: number = vid;
  if (ctx.halloween) {
    if (out === 58) out = 1734;
    if (out === 184) out = 1735;
  }
  if (ctx.xMas) {
    if (out === 58) out = 1867;
    if (out === 184) out = 1868;
  }
  return out;
}
