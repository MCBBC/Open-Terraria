// 城镇 NPC 挥击态（AI_007 ai[0]==15）逐拍判定盒纯函数——GetSwingStats /
// TweakSwingStats 1:1 移植（1457 NPC.cs:67247-67349 / :67350-67370；1456 同构
// :65277 段）。消费点 = TownNPC.swingUpdate（每 tick 重算盒后与敌怪盒相交判定）。
//
// ★拼写勘误记录（2026-08-31）：本文件历史登记名曾误写「townNpcSWing」（W 大写），
// 盘上实名一直为 townNpcSwing.ts——引文以盘面为准，勿按登记名回溯。
//
// 形状语义（原版三段，swingMax = AttackTime×2、swingCurrent = ai[1] 自
// AttackTime 起递减 → 比值 r 从 0.5 收到 0，故实际只经过 B→A 两带：
//   A  current < max×0.333（收势段）：锚 X = centerX ± (W/2 − numA)（numA 由宽
//      分档 10/14/24/28/38），Y = position.Y + 24；
//   B  ×0.333 ≤ current < ×0.666（中段）：锚 X = centerX ± (W/2 − numB)（分档
//      10/18/24/28/38），Y = position.Y + numYB（10/8/12/14 按 >32/>52/>64）；
//   C  current ≥ ×0.666：反手向锚 X = centerX ∓ (W/2 − numC)（6/14/18/24/28/38
//      注意 ≥48 与 ≥52 双门槛重叠，顺序覆写），Y = position.Y + numYC；
//   随后矩形 = (int)锚.X/(int)锚.Y + (W,H)，X<0 向时先回退 W 一格（TopLeft 翻面），
//   Y -= H —— 详链见 swingUpdate 注。
// Tweak 变形带（只作用 A/C 两带）：A 带 W→(int)(W×1.4)、反向侧 X 先回退
// (int)(W×1.4−W)、Y += (int)(H×0.5)、H→(int)(H×1.1)；C 带 W×2、同向侧
// X -= (int)(W×1.2)、Y 回退 (int)(H×1.4−H)、H→(int)(H×1.4)。乘区全部走
// double→int 截断（等价 Math.trunc），逐项行号见下注。

/** 判定盒锚点计算（NPC.cs:67247-67349 GetSwingStats 本体；返回第三分量 item 角度
 *  仅绘制端 Main.cs:27752 消费，本仓渲染不消费故省略——行为零影响）。
 *  centerX/posY 调用方传 base.Center.X / position.Y。 */
export function getSwingStatsAnchor(
  swingMax: number, swingCurrent: number, aimDir: number,
  itemW: number, itemH: number,
  centerX: number, posY: number,
): { x: number; y: number } {
  let ax: number;
  if (swingCurrent < swingMax * 0.333) {
    // :67366-67370 → :67259-67277 A 带宽档（注意全为顺序 if 覆写非 else-if）
    let num = 10;
    if (itemW > 32) num = 14;
    if (itemW >= 52) num = 24;
    if (itemW >= 64) num = 28;
    if (itemW >= 92) num = 38;
    ax = centerX + (itemW * 0.5 - num) * aimDir;              // :67278
    return { x: ax, y: posY + 24 };                            // :67279
  }
  if (swingCurrent < swingMax * 0.666) {
    // :67280-67293 中带宽档
    let num2 = 10;
    if (itemW > 32) num2 = 18;
    if (itemW >= 52) num2 = 24;
    if (itemW >= 64) num2 = 28;
    if (itemW >= 92) num2 = 38;
    ax = centerX + (itemW * 0.5 - num2) * aimDir;              // :67294
    let numY = 10;
    if (itemH > 32) numY = 8;                                  // :67298-67304
    if (itemH > 52) numY = 12;
    if (itemH > 64) numY = 14;
    return { x: ax, y: posY + numY };                          // :67305
  }
  // :67306-67346 C 带（反手段；≥48 档在中段没有——带序错位照抄）
  let num3 = 6;
  if (itemW > 32) num3 = 14;
  if (itemW >= 48) num3 = 18;
  if (itemW >= 52) num3 = 24;
  if (itemW >= 64) num3 = 28;
  if (itemW >= 92) num3 = 38;
  ax = centerX - (itemW * 0.5 - num3) * aimDir;                // :67331 反号
  let numY2 = 10;
  if (itemH > 32) numY2 = 10;
  if (itemH > 52) numY2 = 12;
  if (itemH > 64) numY2 = 14;
  return { x: ax, y: posY + numY2 };                           // :67333-67346
}

/** TweakSwingStats 1:1（NPC.cs:67350-67370）：对 GetSwingStats 盒原地变形，
 *  只作用首带（current < max×0.333）与尾带（current ≥ max×0.666）；中段恒原样 */
export function tweakSwingStats(
  r: { x: number; y: number; w: number; h: number },
  swingMax: number, swingCurrent: number, aimDir: number,
): void {
  if (swingCurrent < swingMax * 0.333) {
    // :67354-67360：反向侧先回退加宽量再整体 ×1.4 宽 / Y 半高下压 / 高 ×1.1
    if (aimDir === -1) r.x -= Math.trunc(r.w * 1.4) - r.w;     // `(int)(w*1.4-w)`
    r.w = Math.trunc(r.w * 1.4);                               // :67357
    r.y += Math.trunc(r.h * 0.5);                              // :67358
    r.h = Math.trunc(r.h * 1.1);                               // :67359
  } else if (!(swingCurrent < swingMax * 0.666)) {
    // :67361-67369 尾带：同向侧回退 ×1.2 / 宽 ×2 / Y 回退 (h*1.4−h) / 高 ×1.4
    if (aimDir === 1) r.x -= Math.trunc(r.w * 1.2);
    r.w *= 2;                                                  // :67363
    r.y -= Math.trunc(r.h * 1.4) - r.h;                        // :67364 `(int)(h*1.4-h)`
    r.h = Math.trunc(r.h * 1.4);                               // :67365
  }
}
