// 高尔夫球手（NPC 588）商店分数门槛表 1:1 —— Chest.SetupShop case 22
// （Chest.cs:3135-3245；本文件只收 extract-shops.mjs 未捕获的 golferScoreAccumulated
//  门槛条目，常驻条目在 vanilla-shopstock.json）。
// 行号注释对准 仓库外基准树(game/ 的兄弟目录)Terarria1456/Terraria/Chest.cs
//   >=500 四杆族 4039/4094/4093/4092   :3163-3177（R14-C27:曾 >500 少一档,1456/1457 同 >=）
//   >500  高尔夫球箱 4265              :3183-3186
//   >500  铜奖杯 4599                  :3190-3193
//   >1000 金级四杆族 4591/4594/4593/4592 :3169-3178
//   >=1000 银奖杯 4600                 :3195-3199
//   >2000 钛金四杆族 4595/4598/4597/4596 :3202-3213
//   >2000 && downedBoss3 高尔夫球车 4264 :3208-3213
//   >=2000 金奖杯 4601                 :3216-3220
//   >=2000 月相四画 4658-4661          :3223-3237（0/1→4658、2/3→4659、4/5→4660、6/7→4661）

/** 分数门槛上架表（返回按原版顺序追加的物品 id 列表） */
export function golferShopScoreGates(
  golferScoreAccumulated: number, moonPhase: number, downedBoss3: boolean,
): number[] {
  const out: number[] = [];
  const add = (...ids: number[]) => out.push(...ids);
  const gs = golferScoreAccumulated;
  if (gs >= 500) add(4039, 4094, 4093, 4092);       // :3163-3177
  if (gs > 1000) add(4591, 4594, 4593, 4592);       // :3169-3178
  if (gs > 500) add(4265);                          // :3183-3186
  if (gs > 2000) {                                  // :3202-3213
    add(4595, 4598, 4597, 4596);
    if (downedBoss3) add(4264);                     // :3208-3213
  }
  if (gs > 500) add(4599);                          // :3190-3193
  if (gs >= 1000) add(4600);                        // :3195-3199
  if (gs >= 2000) {                                 // :3216-3220
    add(4601);
    add([4658, 4659, 4660, 4661][Math.floor(moonPhase / 2)]);  // :3224-3237
  }
  return out;
}
