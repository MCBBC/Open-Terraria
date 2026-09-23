// 玩家可达区钳制【单源】（★BJ290 件2/件3,2026-09-23——普-U1 三实现不一致单源化裁决）。
//
// 原版锚（Terarria1457;1458 交叉 2026-09-23 亲读全同——Utils.cs:223/:236、Player.cs
// :45830、WorldUtils.cs:18-34、Main.cs:754-758）：
//   · Utils.Clamp<T>(value,min,max)（Utils.cs:223-231）判序=【先 max 后 min】：
//       value>max → return max;value<min → return min;否则 value。
//     退化域（自定义小世界 <3200×2480px 时 Right−W<Left,即 min>max）逐字面坍缩:
//       v>max → max（max<min≤v 全段落【max 支】返回 max——先判 max 故然,
//         ★BJ293 2026-09-23 勘误:旧括注"亦落 min 支"与判序相悖,bj290
//         reachable-area :32-34 钉值可证 Clamp(500,640,−960)=−960）;
//       v≤max → min（min>max 域内 v≤max<min 恒成立）。
//     ★BJ286② 定谳复核：仓内两旧式都对不上——ClingerStaffWallProj clampSeq
//     （min 先判,退化域 (max,min) 带误取 min）与 Game.ts min(max(v,min),max)
//     （退化域恒 max,v≤max 带误取 max）判序均反向;本函数=原文直译,勿再分叉。
//   · Utils.Clamp(Rectangle r,bounds)（Utils.cs:236-239）=【定尺寸平移钳】:
//       X=Clamp(r.X,Left,Right−W)/Y=Clamp(r.Y,Top,Bottom−H)/W,H 原样——盒恒
//       1920×1200 只平移进 play area,不与 play area 相交裁剪。旧 MissileProj
//       相交裁剪版（盒可缩小+中心=(裁后盒心)+玩家恒居盒心）=P1③ 偏差本体
//       （U1 例:世界宽 8400/玩家 cx=700/目标 2000:原版可达不动,旧版钳到 1660）。
//   · Player.LimitPointToPlayerReachableArea（Player.cs:45830-45858）:
//       worldRect = CenteredRectangle(Center, Main.MaxWorldViewSize 1920×1200
//       （Main.cs:758;CenteredRectangle Utils.cs:961-963=(int)(c−Size/2) 截断）)
//       → WorldUtils.ClampToWorldBorders（WorldUtils.cs:29-34=上式钳进
//       GetWorldPlayArea :18-24=世界四界各内缩 640px）→ 盒外点自【钳后矩形心】
//       沿射线等比回拉（num4/num6=钳后 Width/2,Height/2=恒 960/600——定尺寸,
//       与裁剪版"半宽按裁后尺寸"分域）。
//   消费面（★BJ290 件3 全改指本单源）：
//     · MissileProj 16/34/79 steer（Projectile.cs:44044-44046）+ 491 飞刀
//       （:44247-44249）——本文件 re-export 承接旧 import 面;
//     · Game.clampPointToPlayerReachableArea（SpawnMinionOnCursor Player.cs
//       :50097 + 6155 闪电之击 :49647）;
//     · Game.fireZenithSword（天顶剑 Player.cs:49208 pointPosition4——旧内联
//       ±960/600 连 play area 平移钳都没有,非退化世界贴边也偏,一并收编）;
//     · ClingerStaffWallProj.computeClingerWallSpawn（3014 爬藤怪墙 Player.cs
//       :49089 pointPosition3）。
//   未收编（备案,各需自锚+金标重产,登记 BJ290-M2）：Game.limitPointToPlayerReach
//   近似版（仅世界界钳）——6173 弧光涌流（原版 :49704-49745 域待亲读）与 950
//   公主武器（原版 GetFarthestSpawnPositionOnLine :50063-50089 调【全式】:50068,
//   收编时 950 落点行为会变,须随刀重产其钉值）。

/** Utils.Clamp<T>（Utils.cs:223-231 逐序直译——先 max 后 min,退化域语义见头注） */
export function clampScalarMaxFirst(v: number, min: number, max: number): number {
  return v > max ? max : v < min ? min : v;
}

/** Main.MaxWorldViewSize（Main.cs:754-758） */
export const MAX_WORLD_VIEW_W = 1920;
export const MAX_WORLD_VIEW_H = 1200;
/** WorldUtils.GetWorldPlayArea 四界内收（WorldUtils.cs:19-24,num=640） */
export const PLAY_AREA_INSET = 640;

/**
 * Player.LimitPointToPlayerReachableArea（Player.cs:45830-45858）1:1——光标点钳进
 * 玩家可达区。worldRect 恒 1920×1200（CenteredRectangle 截断 + Utils.Clamp 定尺寸
 * 平移钳;退化小世界盒不裁小,仅钉靠 Left 或 Right−W 一侧——Utils.cs:238 判序坍缩,
 * 盒恒罩住整个 play area=钳后目标恒可达）;盒外点沿钳后矩形心射线等比回拉
 * （k=min(960/|dx|,600/|dy|,1)）。返回 [x,y]。
 */
export function limitPointToPlayerReachableArea(
  px: number, py: number, pcx: number, pcy: number, worldWPx: number, worldHPx: number,
): [number, number] {
  // CenteredRectangle(Center, 1920×1200)（Utils.cs:961-963,(int) 截断,toward zero）
  const rx = Math.trunc(pcx - MAX_WORLD_VIEW_W / 2);
  const ry = Math.trunc(pcy - MAX_WORLD_VIEW_H / 2);
  // Utils.Clamp(Rectangle, GetWorldPlayArea)（Utils.cs:236-239;WorldUtils.cs:18-24
  // play area=[640, W−640]）——X∈[640, W−640−1920],定尺寸平移（先 max 后 min 判序）
  const cl = clampScalarMaxFirst(rx, PLAY_AREA_INSET, worldWPx - PLAY_AREA_INSET - MAX_WORLD_VIEW_W);
  const ct = clampScalarMaxFirst(ry, PLAY_AREA_INSET, worldHPx - PLAY_AREA_INSET - MAX_WORLD_VIEW_H);
  const ccx = cl + MAX_WORLD_VIEW_W / 2, ccy = ct + MAX_WORLD_VIEW_H / 2;   // worldRect.Center
  const dx = px - ccx, dy = py - ccy;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  let k = 1;
  if (adx > MAX_WORLD_VIEW_W / 2) k = Math.min(k, (MAX_WORLD_VIEW_W / 2) / adx);   // num4=Width/2
  if (ady > MAX_WORLD_VIEW_H / 2) k = Math.min(k, (MAX_WORLD_VIEW_H / 2) / ady);   // num6=Height/2
  return [ccx + dx * k, ccy + dy * k];
}
