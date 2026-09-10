// ============================================================================
// 渔获匣开箱全族引擎（Player.OpenFishingCrate 逐支 1:1。★SW-FX13 锚正 2026-09-10：
//   1457 终值域 = Player.cs:8052-9336；旧注 :7667-8921 系 1456 行号，随 1457 基准
//   全文换算——下文注释行号一律 1457，旧 1456 值以「1456=」形式保留对照）。
//   木匣 2334 / 铁匣 2335 / 金匣 2336 三大件走独立 while 循环（各自专属表：
//   :8058-8291 / :8292-8478 / :8479-8639）；
//   生物群系匣 3203-3208 / 珍珠木-钛金匣 3979-3987 / 冰冻 4405-4406 / 绿洲
//   4407-4408 / 熔岩 4877-4878 / 海洋 5002-5003 共用「通用循环 + 后置支」
//   （:8641-8977 / :8978-9335）。
//   入口 = ItemSlot.TryOpenContainer_GrantItems（1457 ItemSlot.cs:1784-1843，
//   IsFishingCrate 支 :1790-1793；1456=旧注 :1668-1721；1458 ItemSlot.cs 同文件
//   零增量）。
//   硬模式档 = ItemID.Sets.IsFishingCrateHardmode（1457 ItemID.cs:1088，1456=旧注
//   :1082，**按匣子物品 id 查表**——3979-3987/4406/4408/4878/5003 十三件，非按世界
//   hardMode 旗标；同一支代码靠 flag 位切换普通/困难双档表）。
//
// ★掷骰序铁律：分支序 + && 短路序与源码逐字一致（前支命中即止的 else-if 链、
//   `flag && Next(n)` 门在 flag 为假时不消费随机数、continue 回卷等），否则
//   种子对账全漂。Next(n)=[0,n)、Next(a,b)=[a,b)（UnifiedRandom 语义）。
// ============================================================================
import type { BagGive, BagRand } from './vanillaOpenBags';

/** ItemID.Sets.IsFishingCrate（1457 ItemID.cs:1086 全 26 件；1456=旧注 :1080） */
export const FISHING_CRATE_VIDS: ReadonlySet<number> = new Set<number>([
  2334, 2335, 2336,                                          // 木/铁/金匣
  3203, 3204, 3205, 3206, 3207, 3208,                        // 腐化/猩红/地牢/空岛/神圣/丛林
  4405, 4407, 4877, 5002,                                    // 冰冻/绿洲/熔岩/海洋
  3979, 3980, 3981, 3982, 3983, 3984, 3985, 3986, 3987,      // 珍珠木/秘银/山铜/钛金双档
  4406, 4408, 4878, 5003,
]);

/** ItemID.Sets.IsFishingCrateHardmode（1457 ItemID.cs:1088 全 13 件；1456=旧注
 *  :1082）——OpenFishingCrate :8055 的 flag 位来源，切换同支代码的普通/困难双档表 */
export const FISHING_CRATE_HARDMODE_VIDS: ReadonlySet<number> = new Set<number>([
  3979, 3980, 3981, 3982, 3983, 3984, 3985, 3986, 3987, 4406, 4408, 4878, 5003,
]);

/** 种子旗（Main.remixWorld = don't dig up 反转世界 / WorldGen.Skyblock.lowTiles
 *  = 天空岛世界）——冰冻匣 remix 支（:8739-8742）与空岛匣 2197 支（:9233）消费；
 *  全仓无这两类世界时缺省 false，字段保留保源码位 */
export interface CrateOpenContext {
  remixWorld?: boolean;
  skyblockLowTiles?: boolean;
}

// ---------------------------------------------------------------------------
// 木匣 2334 / 珍珠木匣 3979（:8058-8291；1456=旧注 :7673-7905）
// ---------------------------------------------------------------------------
function openWoodenCrate(give: BagGive, hard: boolean, rnd: BagRand): void {
  let f = true;                                              // :8061 flag3
  while (f) {
    if (hard && f && rnd.next(200) === 0) { give(3064); f = false; }        // :8064-8068
    if (f && rnd.next(40) === 0) { give(3200); f = false; }                // :8069-8073
    if (f && rnd.next(40) === 0) { give(3201); f = false; }                // :8074-8078
    if (hard && f && rnd.next(25) === 0) { give(2424); f = false; }        // :8079-8083
    if (rnd.next(20) === 0) {                                               // :8084-8110 六选一
      // 1457: 饰品池 Next(5)→Next(6)，尾插 PoisonBarb(6165)（旧五件各被稀释到 1/6）
      give([285, 953, 4341, 3068, 3084, 6165][rnd.next(6)]);
      f = false;
    }
    if (!hard && f && rnd.next(50) === 0) { give(997); f = false; }        // :8111-8115 普通档灰 Zapinator
    if (rnd.next(7) === 0) {                                                // :8116-8132 钱币
      if (rnd.next(3) === 0) give(73, rnd.next(1, 6));                      //   1/3 铂金币 1-5
      else give(72, rnd.next(20, 91));                                      //   金币 20-90
      f = false;
    }
    if (rnd.next(7) === 0) {                                                // :8133-8167 矿锭
      let num5 = [12, 699, 11, 700][rnd.next(4)];                           //   铁/铅/铜/锡
      if (rnd.next(2) === 0 && hard) num5 = [364, 1104][rnd.next(2)];       //   困难档→钴/钯
      give(num5, rnd.next(4, 16));
      f = false;
    } else if (rnd.next(8) === 0) {                                         // :8168-8227 矿石（锭掷不中才掷）
      let num6 = [20, 703, 22, 704][rnd.next(4)];                           //   铜/锡/银/钨（switch 后四支死码）
      let stack9 = rnd.next(2, 6);
      if (rnd.next(2) === 0 && hard) {                                      //   困难档→钴/钯矿，栈改 2-3
        num6 = [381, 1184][rnd.next(2)];                                    //   （switch 2-5 支死码）
        stack9 = rnd.next(2, 4);
      }
      give(num6, stack9);
      f = false;
    }
    if (rnd.next(7) === 0) {                                                // :8228-8267 药水十支
      give([288, 290, 292, 299, 298, 304, 291, 2322, 2323, 2329][rnd.next(10)], rnd.next(1, 4));
      f = false;
    }
  }
  if (rnd.next(3) === 0) {                                                  // :8269-8283 后置矿锭
    give([28, 110][rnd.next(2)], rnd.next(5, 16));                          //   铜/锡锭 5-15
  }
  if (rnd.next(3) === 0) {                                                  // :8284-8289 后置锭
    give(rnd.next(3) !== 0 ? 2674 : 2675, rnd.next(1, 5));                  //   2/3 铜锭 1/3 铁锭 1-4
  }
}

// ---------------------------------------------------------------------------
// 铁匣 2335 / 秘银匣 3980（:8292-8478；1456=旧注 :7906-8122）
// ---------------------------------------------------------------------------
function openIronCrate(give: BagGive, hard: boolean, rnd: BagRand): void {
  let f = true;                                              // :8295 flag4
  while (f) {
    if (hard && f && rnd.next(60) === 0) { give(3064); f = false; }        // :8298-8302
    if (f && rnd.next(25) === 0) { give(2501); f = false; }                // :8303-8307 Soul Cutter
    if (f && rnd.next(20) === 0) { give(2587); f = false; }                // :8308-8312 玻璃钢钓竿
    if (f && rnd.next(15) === 0) { give(2608); f = false; }                // :8313-8317 鱼饵投掷者
    if (f && rnd.next(20) === 0) { give(3200); f = false; }                // :8318-8322 船锚
    if (f && rnd.next(20) === 0) { give(3201); f = false; }                // :8323-8327 帆鱼靴
    if (rnd.next(4) === 0) { give(73, rnd.next(5, 11)); f = false; }       // :8328-8334 铂金币 5-10
    if (rnd.next(6) === 0) {                                                // :8335-8381 矿锭
      let num9 = [12, 699, 11, 700, 14, 701][rnd.next(6)];                  //   铁/铅/铜/锡/金/铂
      if (rnd.next(2) === 0 && hard) num9 = [364, 1104, 365, 1105][rnd.next(4)]; // 困难→钴/钯/秘银/山铜
      give(num9, rnd.next(12, 22));
      f = false;
    } else if (rnd.next(4) === 0) {                                         // :8382-8429 矿石
      let num10 = [20, 703, 22, 704, 21, 705][rnd.next(6)];                 //   铜/锡/银/钨/铁/铅
      let num11 = rnd.next(4, 8);
      if (rnd.next(3) !== 0 && hard) {                                      //   困难 2/3 →钴/钯/秘银/山铜矿
        num10 = [381, 1184, 382, 1191][rnd.next(4)];                        //   栈 -0/1
        num11 -= rnd.next(2);
      }
      give(num10, num11);
      f = false;
    }
    if (rnd.next(4) === 0) {                                                // :8430-8463 药水八支
      give([288, 296, 304, 305, 2322, 2323, 2324, 2327][rnd.next(8)], rnd.next(2, 5));
      f = false;
    }
  }
  if (rnd.next(2) === 0) {                                                  // :8465-8470 后置矿石
    give(rnd.next(188, 190), rnd.next(5, 16));                              //   铁/银矿 5-15
  }
  if (rnd.next(2) === 0) {                                                  // :8471-8476 后置锭
    give(rnd.next(3) !== 0 ? 2675 : 2676, rnd.next(2, 5));                  //   1/3 铁锭 2/3 银锭
  }
}

// ---------------------------------------------------------------------------
// 金匣 2336 / 山铜匣 3981（:8479-8639；1456=旧注 :8123-8251）
//   ★else 分支 `if (Next(3)!=0) continue;`——锭掷不中时 2/3 直接回卷重掷
//   （矿石支不消费随机数），与木/铁匣的 else-if 结构不同。
// ---------------------------------------------------------------------------
function openGoldenCrate(give: BagGive, hard: boolean, rnd: BagRand): void {
  let f = true;                                              // :8482 flag2
  while (f) {
    if (hard && f && rnd.next(20) === 0) { give(3064); f = false; }        // :8485-8489
    if (f && rnd.next(8) === 0) { give(29); f = false; }                   // :8490-8494 生命水晶
    if (f && rnd.next(10) === 0) { give(2491); f = false; }                // :8495-8499 Hardy Saddle
    if (rnd.next(3) === 0) { give(73, rnd.next(8, 21)); f = false; }       // :8500-8506 铂金币 8-20
    if (rnd.next(5) === 0) {                                                // :8507-8547 矿锭
      let num = [14, 701, 13, 702][rnd.next(4)];                            //   金/铂/?/?
      if (rnd.next(2) === 0 && hard) num = [365, 1105, 366, 1106][rnd.next(4)]; // 困难→秘银/山铜/钛金
      give(num, rnd.next(25, 35));
      f = false;
    } else {
      if (rnd.next(3) !== 0) continue;                                      // :8550-8553 ★2/3 回卷
      let num2 = [21, 19, 705, 706][rnd.next(4)];                           // :8554-8591 矿石
      if (rnd.next(3) !== 0 && hard) num2 = [382, 391, 1191, 1198][rnd.next(4)];
      give(num2, rnd.next(8, 12));
      f = false;
    }
  }
  if (rnd.next(3) === 0) {                                                  // :8594-8617 后置药水五支
    give([288, 296, 305, 2322, 2323][rnd.next(5)], rnd.next(2, 6));
  }
  if (rnd.next(2) === 0) {                                                  // :8618-8623 后置矿石
    give(rnd.next(188, 190), rnd.next(5, 21));                              //   铁/银矿 5-20
  }
  if (rnd.next(3) !== 0) {                                                  // :8624-8629 后置金锭（2/3）
    give(2676, rnd.next(3, 8));
  }
  if (rnd.next(30) === 0 && !hard) give(989);                               // :8630-8633 普通档 1/30 附魔日晷
  if (rnd.next(15) === 0 && hard) give(989);                                // :8634-8637 困难档 1/15
}

// ---------------------------------------------------------------------------
// 生物群系匣通用段（:8641-8977 while 循环 + :8978-9335 后置支；1456=旧注
//   :8252-8592/:8593-8921）
//   maxValue=1 → `Next(maxValue)==0` 恒真（仍消费一次随机数）——专属支只对
//   匹配匣型生效（前置 crateItemID 短路）；神圣匣 3207/3986 无专属支，
//   靠通用三掷（铂金币/矿锭/弹药）命中才出循环。
// ---------------------------------------------------------------------------
export function openFishingCrate(
  crateItemID: number,
  give: BagGive,
  rnd: BagRand,
  ctx: CrateOpenContext = {},
): void {
  const hard = FISHING_CRATE_HARDMODE_VIDS.has(crateItemID);   // :8055 flag
  switch (crateItemID) {
    case 2334:
    case 3979:
      openWoodenCrate(give, hard, rnd);
      return;
    case 2335:
    case 3980:
      openIronCrate(give, hard, rnd);
      return;
    case 2336:
    case 3981:
      openGoldenCrate(give, hard, rnd);
      return;
  }

  const maxValue = 1;                                          // 1457 Player.cs:8641（1456=旧注 :8253;1458 :8641 同值）★SW-RB10b 锚正
  let flag5 = true;                                            // 1457 :8642
  while (flag5) {
    if ((crateItemID === 5002 || crateItemID === 5003) && flag5 && rnd.next(maxValue) === 0) {
      // :8645-8657 海洋匣：1/10 海龟雕像兜底四选一
      let num13 = rnd.next(4);
      num13 = rnd.next(10) === 0 ? 863 : [186, 4404, 277, 187][num13];
      give(num13);
      flag5 = false;
    }
    if ((crateItemID === 3203 || crateItemID === 3982) && flag5 && rnd.next(maxValue) === 0) {
      // :8658-8669 腐化匣五选一
      give([162, 111, 96, 115, 64][rnd.next(5)]);
      flag5 = false;
    }
    if ((crateItemID === 3204 || crateItemID === 3983) && flag5 && rnd.next(maxValue) === 0) {
      // :8670-8681 猩红匣五选一
      give([800, 802, 1256, 1290, 3062][rnd.next(5)]);
      flag5 = false;
    }
    if ((crateItemID === 3205 || crateItemID === 3984) && flag5 && rnd.next(maxValue) === 0) {
      // :8682-8702 地牢匣：锁盒 3085 + 1/2 金钥匙 149×5-15 + 1/2 骨/骨尘 134/137/139×25-50
      give(3085);
      flag5 = false;
      if (rnd.next(2) === 0) give(149, rnd.next(5, 16));
      if (rnd.next(2) === 0) give([134, 137, 139][rnd.next(3)], rnd.next(25, 51));
    }
    if ((crateItemID === 3206 || crateItemID === 3985) && flag5 && rnd.next(maxValue) === 0) {
      // :8703-8713 空岛匣四选一
      give([158, 65, 159, 2219][rnd.next(4)]);
      flag5 = false;
    }
    if ((crateItemID === 3208 || crateItemID === 3987) && flag5 && rnd.next(maxValue) === 0) {
      // :8714-8735 丛林匣：1/20 花冠 3017（num14=Next(5) 后被覆写=死掷保序），否则五选一
      if (rnd.next(20) === 0) {
        rnd.next(5);                                           // :8718 死掷（源码 :8717-8720）
        give(3017);
        flag5 = false;
      } else {
        give([212, 964, 211, 213, 2292][rnd.next(5)]);
        flag5 = false;
      }
    }
    if ((crateItemID === 4405 || crateItemID === 4406) && flag5 && rnd.next(maxValue) === 0) {
      // :8736-8745 冰冻匣七选一（1456 六项 → 1457 +6153 GlacierFang；remix 第 4 支 1319→725；
      // 源码 Utils.SelectRandom(Main.rand, 7 项)=均匀取一,1 掷）
      const i = rnd.next(7);
      give([670, 724, 950, ctx.remixWorld ? 725 : 1319, 987, 1579, 6153][i]);
      flag5 = false;
    }
    if (crateItemID === 4407 || crateItemID === 4408) {
      // 1457 Player.cs:8746-8782（1456=旧注 :8365-8395;1458 :8750-8786 同值;★SW-RB10b 锚正）
      // 绿洲匣：八选一（:8750-8760，含 4263 魔法海螺）+ 1/4 4423×4-6 + 1/2 3380×10-16 + 1/35 857（后三支不查 flag5）
      if (flag5 && rnd.next(maxValue) === 0) {
        give([4056, 4442, 4055, 4061, 4062, 4276, 4262, 4263][rnd.next(8)]);
        flag5 = false;
      }
      if (rnd.next(4) === 0) { give(4423, rnd.next(4, 7)); flag5 = false; }
      if (rnd.next(2) === 0) { give(3380, rnd.next(10, 17)); flag5 = false; }
      if (rnd.next(35) === 0) { give(857); flag5 = false; }
    }
    if (crateItemID === 4877 || crateItemID === 4878) {
      // :8783-8847 熔岩匣：1/20 黑曜石剑鱼 906（num16=Next(5) 后覆写=死掷保序），
      // 否则五选一 + 1/4 4858×2；随后【无条件】暗影锁盒 4879 + 1/3 4824×7-10 +
      // 1/2 黑曜石盔甲五选一
      if (flag5 && rnd.next(maxValue) === 0) {
        if (rnd.next(20) === 0) {
          rnd.next(5);                                         // :8789 死掷
          give(906);
          flag5 = false;
        } else {
          give([4822, 4828, 4880, 4881, 4868][rnd.next(5)]);
          flag5 = false;
        }
        if (rnd.next(4) === 0) { give(4858, 2); flag5 = false; }
      }
      give(4879);                                              // :8814 无条件
      flag5 = false;
      if (rnd.next(3) === 0) { give(4824, rnd.next(7, 11)); flag5 = false; }
      if (rnd.next(2) === 0) {
        give([4902, 4903, 4904, 4905, 4906][rnd.next(5)]);
        flag5 = false;
      }
    }
    if (rnd.next(4) === 0) { give(73, rnd.next(5, 13)); flag5 = false; }    // :8848-8854 铂金币 5-12
    if (rnd.next(7) === 0) {                                                // :8855-8917 矿锭
      let num18 = [12, 699, 11, 700, 14, 701, 13, 702][rnd.next(8)];        //   铁铅铜锡金铂+2
      if (crateItemID === 4877 || crateItemID === 4878) num18 = 174;        //   熔岩匣→黑曜石
      if (rnd.next(2) === 0 && hard) num18 = [364, 1104, 365, 1105, 366, 1106][rnd.next(6)];
      give(num18, rnd.next(20, 36));
      flag5 = false;
    }
    if (rnd.next(4) !== 0) continue;                                        // :8918-8921 ★3/4 回卷
    let num19 = [22, 21, 19, 704, 705, 706][rnd.next(6)];                   // :8922-8977 矿石/弹药
    let num20 = rnd.next(6, 17);
    if (crateItemID === 4877 || crateItemID === 4878) num19 = 175;          //   熔岩匣→黑曜石
    if (rnd.next(3) !== 0 && hard) {                                        //   困难 2/3 换新三矿
      num19 = [381, 382, 391, 1184, 1191, 1198][rnd.next(6)];               //   （钴/秘银/山铜/钯/钛/绿藻）
      num20 -= rnd.next(2);
    }
    give(num19, num20);
    flag5 = false;
  }
  if (rnd.next(4) === 0) {                                                  // :8978-9005 后置药水六支
    give([288, 296, 304, 305, 2322, 2323][rnd.next(6)], rnd.next(2, 5));
  }
  if (rnd.next(2) === 0) {                                                  // :9006-9011 后置矿石
    give(rnd.next(188, 190), rnd.next(5, 18));                              //   铁/银矿 5-17
  }
  if (rnd.next(2) === 0) {                                                  // :9012-9017 后置锭
    give(rnd.next(2) !== 0 ? 2675 : 2676, rnd.next(2, 7));                  //   1/2 铁锭 1/2 银锭
  }
  if (crateItemID === 5002 || crateItemID === 5003) {
    // :9018-9041 海洋匣后置：1/5 5527 / 1/3 4090×20-50 / 1/10 4460 / 1/10 4425
    if (rnd.next(5) === 0) give(5527);
    if (rnd.next(3) === 0) give(4090, rnd.next(20, 51));
    if (rnd.next(10) === 0) give(4460);
    if (rnd.next(10) === 0) give(4425);
  }
  if ((crateItemID === 3205 || crateItemID === 3984) && rnd.next(2) === 0) {
    // :9042-9124 地牢匣后置 1/2：金钥匙地牢宝箱战利品 25 选 1
    give([
      1438, 1375, 1573, 1420, 1435, 1434, 1421, 5234, 1374, 1425, 1372, 1441, 1373,
      1433, 1436, 1426, 1424, 1419, 2995, 1422, 1439, 1502, 1423, 1437, 1500,
    ][rnd.next(25)]);
  }
  if (crateItemID === 3208 || crateItemID === 3987) {
    // :9125-9138 丛林匣后置：1/3 4564×20-50 / 1/20 753
    if (rnd.next(3) === 0) give(4564, rnd.next(20, 51));
    if (rnd.next(20) === 0) give(753);
  }
  if ((crateItemID === 4405 || crateItemID === 4406) && rnd.next(20) === 0) {
    // :9139-9143 冰冻匣后置 1/20 → 669
    give(669);
  }
  if ((crateItemID === 4407 || crateItemID === 4408) && rnd.next(2) === 0) {
    // :9144-9193 绿洲匣后置 1/2：沙漠墙 14 选 1
    give([4639, 4627, 4628, 4632, 4630, 4638, 4629, 4633, 4634, 4635, 4636, 4637, 4631, 4626][rnd.next(14)]);
  }
  if (crateItemID === 3206 || crateItemID === 3985) {
    // :9194-9238 空岛匣后置：1/2 天空六选一 / 1/2 751×50-100 / 1/40 4978 /
    // 天空岛世界(Skyblock.lowTiles) 1/3 2197
    if (rnd.next(2) === 0) give([5226, 5254, 5238, 5258, 5255, 5388][rnd.next(6)]);
    if (rnd.next(2) === 0) give(751, rnd.next(50, 101));
    if (rnd.next(40) === 0) give(4978);
    if (ctx.skyblockLowTiles && rnd.next(3) === 0) give(2197);
  }
  if (crateItemID === 4877 || crateItemID === 4878) {
    // :9239-9305 熔岩匣后置：1/2 地狱十二选一 / 1/20 221 / 1/20 4443 / 1/20 4737 / 1/20 4551
    if (rnd.next(2) === 0) {
      give([1497, 1475, 1479, 1542, 1476, 1538, 1501, 1478, 1539, 1540, 1499, 1541][rnd.next(12)]);
    }
    if (rnd.next(20) === 0) give(221);
    if (rnd.next(20) === 0) give(4443);
    if (rnd.next(20) === 0) give(4737);
    if (rnd.next(20) === 0) give(4551);
  }
  // :9306-9335 困难档尾段：仅 3982/3983/3986（腐化/猩红/神圣困难匣）
  if (!hard || (crateItemID !== 3982 && crateItemID !== 3986 && crateItemID !== 3983)) return;
  if (rnd.next(2) === 0) {
    // :9310-9319 1/2 光明/暗影之魂：3986 神圣→520，其余→521 ×2-5
    give(crateItemID === 3986 ? 520 : 521, rnd.next(2, 6));
  }
  if (rnd.next(2) === 0) {
    // :9320-9335 1/2：默认 522×2-5；3983 猩红→1332；3986 神圣→502×4-10（重掷栈）
    let item33 = 522;
    let stack32 = rnd.next(2, 6);
    if (crateItemID === 3983) item33 = 1332;
    else if (crateItemID === 3986) { item33 = 502; stack32 = rnd.next(4, 11); }
    give(item33, stack32);
  }
}
