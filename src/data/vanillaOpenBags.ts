// 礼袋/礼盒右键开包引擎（Player.OpenPresent :6651-6770 / OpenLegacyPresent :6772-6788 /
// OpenGoodieBag :9199-9282 / OpenHerbBag :9064-9138，1.4.5.6 逐支抄）。
// 渔获匣 26 型号（OpenFishingCrate；★SW-FX13 锚正 2026-09-10：1457 Player.cs:8052-9336，
// 1456=旧注 :7667-8921）在 vanillaFishingCrates.ts，
// 锁盒两件（OpenLockBox :9031 / OpenShadowLockbox :9011）与蠕虫罐/牡蛎/麒麟蛋
// （OpenCanofWorms :9140 / OpenOyster :9154 / OpenChilletEgg :9188）在本文件。
// 入口门 = ItemSlot.RightClick :1514-1527（context==0 背包格 && mouseItem 空或不可叠 &&
// OpenableBag）→ TryOpenContainer :1642-1660（掷骰 → stack-- → PlaySound(7)）。
// （1457 ItemSlot.cs 同链 = RightClick :1614 / 开包门 :1632-1645 / TryOpenContainer
//  :1764-1782 / TryOpenContainer_GrantItems :1784-1843——本文件其余注释行号仍为
//  1456 域,1458 ItemSlot.cs 与 1457 零增量。）
// 掷骰语义对齐 UnifiedRandom.Next：Next(n) = [0,n)、Next(a,b) = [a,b)。
import { VANILLA_ITEM_KEY_BY_ID } from './items';
import { openFishingCrate, FISHING_CRATE_VIDS } from './vanillaFishingCrates';
import { openBossBag, BOSS_BAG_IDS } from './vanillaBossBags';

/** ItemID.Sets.OpenableBag（ItemID.cs:1217 全量,1457 终值;1458 同域零增量，右键
 *  可开包集合——UI 门禁用）。其中 BossBag 子集 21 件（3318-3332/3860-3862/4782/
 *  4957/5111 = ItemID.cs:1215）由 openBagItem 首支路由 openBossBag（★SW-FX21
 *  2026-09-10：旧版 BossBag 族整缺右键面;★§五裁决(09-13)持用左键链已摘=原版唯右键入口
 *  都走 ItemSlot.TryOpenContainer_GrantItems 首支 ItemSlot.cs:1786-1789），
 *  其余全族（礼盒/礼袋/草药袋/渔获匣 26 型/锁盒两件/蠕虫罐/牡蛎/麒麟蛋）由本
 *  引擎 openBagItem 分派。 */
export const OPENABLE_BAG_VIDS: ReadonlySet<number> = new Set<number>([
  3318, 3319, 3320, 3321, 3322, 3323, 3324, 3325, 3326, 3327, 3328, 3329, 3330, 3331, 3332,
  3860, 3861, 3862, 4782, 4957, 5111, 2334, 2335, 2336, 3203, 3204, 3205, 3206, 3207, 3208,
  4405, 4407, 4877, 5002, 3979, 3980, 3981, 3982, 3983, 3984, 3985, 3986, 3987, 4406, 4408,
  4878, 5003, 3093, 4345, 4410, 1774, 6142, 3085, 4879, 1869, 599, 600, 601,
]);

/** Main.rand.Next 语义（UnifiedRandom.Next 重载：next(n)=[0,n) / next(a,b)=[a,b)）
 *  ——测试可注入定序源（脚本值直接作为返回值） */
export interface BagRand {
  next(a: number, b?: number): number;
}
const defaultRand: BagRand = {
  next: (a, b) => (b === undefined
    ? Math.floor(Math.random() * a)
    : a + Math.floor(Math.random() * (b - a))),
};

/** QuickSpawnItem 出口：give(原版 item id, stack)。调用方负责入包/落地 */
export type BagGive = (id: number, stack?: number) => void;

/** OpenPresent（Player.cs:6651-6770）：圣诞礼盒 1869——十六道门 + 兜底的
 *  else-if 链（十三支单品 + 套装/食物双 switch + 蛋奶酒/八角 + 建材兜底）。
 *  ★链式判定：每支独立掷 Next(n)，前支命中即止——顺序与概率逐字，
 *  不得改写为独立 if（否则后支概率被前支吞掉）。兜底支占比 =
 *  ∏(1-1/n) ≈ 0.470（tests/open-bags.test.ts 分布抽查锚定）。 */
function openPresent(give: BagGive, hardMode: boolean, rnd: BagRand): void {
  if (rnd.next(15) === 0 && hardMode) {                       // :6654 Snow Globe 602（硬模式门）
    give(602);
  } else if (rnd.next(30) === 0) {                            // :6658 Coal 1922
    give(1922);
  } else if (rnd.next(400) === 0) {                           // :6662 Dog Whistle 1927
    give(1927);
  } else if (rnd.next(150) === 0) {                           // :6666-6669 Red Ryder 1870 + Musket Ball 97×30-60
    give(1870);
    give(97, rnd.next(30, 61));
  } else if (rnd.next(150) === 0) {                           // :6671 Candy Cane Sword 1909
    give(1909);
  } else if (rnd.next(150) === 0) {                           // :6675 Candy Cane Pickaxe 1917
    give(1917);
  } else if (rnd.next(150) === 0) {                           // :6679 Candy Cane Hook 1915
    give(1915);
  } else if (rnd.next(150) === 0) {                           // :6683 Fruitcake Chakram 1918
    give(1918);
  } else if (rnd.next(150) === 0) {                           // :6687 Hand Warmer 1921
    give(1921);
  } else if (rnd.next(300) === 0) {                           // :6691 Toolbox 1923
    give(1923);
  } else if (rnd.next(40) === 0) {                            // :6695 Reindeer Antlers 1907
    give(1907);
  } else if (rnd.next(10) === 0) {                            // :6699 Holly 1908
    give(1908);
  } else if (rnd.next(15) === 0) {                            // :6703-6728 圣诞套装 switch(Next(5))
    switch (rnd.next(5)) {
      case 0: give(1932); give(1933); give(1934); break;      // Mrs. Claus 三件
      case 1: give(1935); give(1936); give(1937); break;      // Parka 三件
      case 2: give(1940); give(1941); give(1942); break;      // Tree 三件
      case 3: give(1938); break;                              // Snow Hat
      default: give(1939); break;                             // Ugly Sweater
    }
  } else if (rnd.next(7) === 0) {                             // :6730-6745 食物 switch(Next(3))
    switch (rnd.next(3)) {
      case 0: give(1911); break;                              // Christmas Pudding
      case 1: give(1919); break;                              // Sugar Cookie
      default: give(1920); break;                             // Gingerbread Cookie
    }
  } else if (rnd.next(8) === 0) {                             // :6747-6749 Eggnog 1912×1-3
    give(1912, rnd.next(1, 4));
  } else if (rnd.next(9) === 0) {                             // :6751-6753 Star Anise 1913×20-40
    give(1913, rnd.next(20, 41));
  } else {                                                    // :6755-6769 兜底建材 switch(Next(3))
    switch (rnd.next(3)) {
      case 0: give(1872, rnd.next(20, 50)); break;            // Pine Tree Block
      case 1: give(586, rnd.next(20, 50)); break;             // Candy Cane Block
      default: give(591, rnd.next(20, 50)); break;            // Green Candy Cane Block
    }
  }
}

/** OpenLegacyPresent（Player.cs:6772-6788）：旧版三色礼盒 599/600/601——单掷 14 支 */
function openLegacyPresent(give: BagGive, hardMode: boolean, rnd: BagRand): void {
  const num = rnd.next(14);                                   // :6775
  if (num === 0 && hardMode) {                                // :6776-6779 0/14 Snow Globe（硬模式门）
    give(602);
  } else if (num <= 7) {                                      // :6780-6783 1-7 → Candy Cane Block
    give(586, rnd.next(20, 50));
  } else {                                                    // :6784-6787 8-13 → Green Candy Cane Block
    give(591, rnd.next(20, 50));
  }
}

/** OpenGoodieBag（Player.cs:9199-9282）：礼袋 1774。前四支独立掷后 early return
 *  （:9205/9210/9215/9220），兜底 switch(Next(19)) 十九套装（QuickSpawnItem_CostumeSet
 *  :9175-9186 = 逐件 QuickSpawnItem） */
function openGoodieBag(give: BagGive, rnd: BagRand): void {
  if (rnd.next(150) === 0) { give(1810); return; }            // :9202-9205 Unlucky Yarn 1810
  if (rnd.next(150) === 0) { give(1800); return; }            // :9207-9210 Bat Hook 1800
  if (rnd.next(4) === 0) { give(1809, rnd.next(10, 41)); return; } // :9212-9215 Rotten Egg 1809×10-40
  if (rnd.next(10) === 0) { give(rnd.next(1846, 1851)); return; }  // :9217-9220 挂画 1846-1850（Next(1846,1851) 闭开）
  switch (rnd.next(19)) {                                     // :9222-9281 化装套装
    case 0: give(1749); give(1750); give(1751); break;        // Cat 三件
    case 1: give(1746); give(1747); give(1748); break;        // Creeper 三件
    case 2: give(1752); give(1753); break;                    // Ghost 头/衣
    case 3: give(1767); give(1768); give(1769); break;        // Leprechaun 三件
    case 4: give(1770); give(1771); break;                    // Pixie 衣/裤
    case 5: give(1772); give(1773); break;                    // Princess 帽/裙
    case 6: give(1754); give(1755); give(1756); break;        // Pumpkin 三件
    case 7: give(1757); give(1758); give(1759); break;        // Robot 三件
    case 8: give(1760); give(1761); give(1762); break;        // Unicorn 三件
    case 9: give(1763); give(1764); give(1765); break;        // Vampire 三件
    case 10: give(1766); give(1775); give(1776); break;       // Witch 帽+裙+靴
    case 11: give(1777); give(1778); break;                   // Bride of Frankenstein 头/裙
    case 12: give(1779); give(1780); give(1781); break;       // Karate Tortoise 三件
    case 13: give(1819); give(1820); break;                   // Reaper 兜帽/长袍
    case 14: give(1821); give(1822); give(1823); break;       // Fox 三件
    case 15: give(1824); break;                               // Cat Ears
    case 16: give(1838); give(1839); give(1840); break;       // Space Creature 三件
    case 17: give(1841); give(1842); give(1843); break;       // Wolf 三件
    default: give(1851); give(1852); break;                   // Treasure Hunter 衣/裤
  }
}

/** OpenHerbBag（Player.cs:9064-9138）：草药袋 3093——2-4 件（1/3 +1），每件
 *  Next(14) 七草七籽映射 + 2-4 栈（1/3 再 +1-4） */
function openHerbBag(give: BagGive, rnd: BagRand): void {
  let num = rnd.next(2, 5);                                   // :9067 件数 2-4
  if (rnd.next(3) === 0) num++;                               // :9068-9071 1/3 → +1
  for (let i = 0; i < num; i++) {                             // :9072
    let id = rnd.next(14);                                    // :9074
    switch (id) {                                             // :9075-9130 十四支映射（七草七籽）
      case 0: id = 313; break;   // Daybloom
      case 1: id = 314; break;   // Moonglow
      case 2: id = 315; break;   // Blinkroot
      case 3: id = 317; break;   // Waterleaf（注意 317≠316 顺序对调）
      case 4: id = 316; break;   // Deathweed
      case 5: id = 318; break;   // Fireblossom
      case 6: id = 2358; break;  // Shiverthorn
      case 7: id = 307; break;   // Daybloom Seeds
      case 8: id = 308; break;   // Moonglow Seeds
      case 9: id = 309; break;   // Blinkroot Seeds
      case 10: id = 311; break;  // Waterleaf Seeds
      case 11: id = 310; break;  // Deathweed Seeds
      case 12: id = 312; break;  // Fireblossom Seeds
      default: id = 2357; break; // Shiverthorn Seeds
    }
    let stack = rnd.next(2, 5);                               // :9131 栈 2-4
    if (rnd.next(3) === 0) stack += rnd.next(1, 5);           // :9132-9134 1/3 → +1-4
    give(id, stack);
  }
}

// ---------------------------------------------------------------------------
// S 级开箱小件族（锁盒 / 蠕虫罐 / 牡蛎 / 麒麟蛋）
// ---------------------------------------------------------------------------

/** OpenLockBox（Player.cs:9031-9062）：金锁盒 3085——地牢武器 7 选 1 + 1/3 暗影钥匙
 *  329 + 1/8 5465 + FTW 1/5 5515。switch(Next(7)) 的 0 支走 default=164（村正）。
 *  金钥匙 327 的消耗门在分派层（ItemSlot.cs:1695-1698 ConsumeItem 先于开盒）。
 *  1457（:9424-9450）尾段新增 1/4 SilverBracer(6156)（无条件掷,FTW 支之后）。 */
function openLockBox(give: BagGive, rnd: BagRand, remixWorld: boolean, getGoodWorld: boolean): void {
  const roll = rnd.next(7);                                   // :9432
  give([164, 3317, 155, 156, remixWorld ? 2623 : 157, 163, 113][roll]);
  if (rnd.next(3) === 0) give(329);                           // :9441-9444 Shadow Key
  if (rnd.next(8) === 0) give(5465);                          // :9445-9448 Bone Key
  if (getGoodWorld && rnd.next(5) === 0) give(5515);          // :9449-9451 FTW 世界 5515
  if (rnd.next(4) === 0) give(6156);                          // 1457 :9452-9454 SilverBracer 1/4
}

/** OpenShadowLockbox（Player.cs:9011-9029）：黑曜石锁盒 4879——地狱武器 5 选 1
 *  （remixWorld 时 112→683）+ 1/5 5010。暗影钥匙 329 只验不耗（:1701-1704）。 */
function openShadowLockbox(give: BagGive, rnd: BagRand, remixWorld: boolean): void {
  let item = [274, 220, 112, 218, 3019][rnd.next(5)];         // :9018 NextFromList=Next(len)
  if (remixWorld) item = [274, 220, 683, 218, 3019][rnd.next(5)]; // :9019-9022 重掷
  give(item);
  if (rnd.next(5) === 0) give(5010);                          // :9024-9027 硬鞍
}

/** OpenCanofWorms（Player.cs:9140-9151）：蠕虫罐 4345——蠕虫 2002×5-8 +
 *  3/10 学者蠕虫 3191×1-2 + 1/20 金蠕虫 2895 */
function openCanofWorms(give: BagGive, rnd: BagRand): void {
  give(2002, rnd.next(5, 9));                                 // :9143
  if (rnd.next(10) < 3) give(3191, rnd.next(1, 3));           // :9144-9147 ★Next(10)<3
  if (rnd.next(20) === 0) give(2895);                         // :9148-9150
}

/** OpenOyster（Player.cs:9154-9185）：牡蛎 4410——3/4 无珍珠；1/4 出珍珠再分档：
 *  1/10 黑珍珠 4414 / 3/10 白珍珠 4413 / 6/10 粉珍珠 4412。末尾无条件出
 *  去壳牡蛎 4411（QuickSpawnItem 在珍珠 if 之外）。 */
function openOyster(give: BagGive, rnd: BagRand): void {
  if (rnd.next(4) === 0) {                                    // :9157
    if (rnd.next(10) === 0) give(4414);                       // :9158-9160 黑珍珠
    else if (rnd.next(3) === 0) give(4413);                   // :9161-9163 白珍珠
    else give(4412);                                          // :9164-9166 粉珍珠
  }
  give(4411);                                                 // :9168
}

/** OpenChilletEgg（Player.cs:9188-9196）：麒麟蛋 6142——Next(2)==0 → 5666，
 *  否则 5665（默认值 5665，掷 0 才覆写——勿写反） */
function openChilletEgg(give: BagGive, rnd: BagRand): void {
  give(rnd.next(2) === 0 ? 5666 : 5665);                      // :9191-9195
}

/** 钱槽 3213 持用契约（Item.cs:28979-28990 + ItemCheck_Shoot :47463 通用落底
 *  :49957——projPet[525] 未置位不走宠物支）：使用 → 发射飞猪弹幕 525（aiStyle97
 *  entities/FlyingPiggyBank 1:1），右键弹幕 → chest=-2 开 piggy +
 *  PlayInteractiveProjectileOpenCloseSound(525)=Item59（Main.cs:38643-38645）。
 *  表值保留为容器面测试桩（tests/fishing-crates.test.ts 钉 chest=-2/bank0/28/
 *  Item_59/不消耗）——使用链已 1:1 实装,不再【直开】面板。 */
export const MONEY_TROUGH_USE = {
  openChestX: -2,          // player.chest = -2（存钱罐容器约定，与储物族 tile 同）
  bankIndex: 0,            // player.banks[0] = piggy
  cursorIconVid: 3213,     // 悬停光标=MoneyTrough 弹(525)本体支 Main.cs:38433/1456 :37308
                           // （TryInteractingWithMoneyTrough 默认；==960 支→5098 归 CHESTER_CONTAINER）
  useTime: 28,             // Item.cs:28986 useTime = useAnimation = 28
  sound: 'Item_59',        // UseSound（:28985）= 容器开/关音（:38643-38645 同值）
} as const;

/** Chester 宠物箱 960 便携容器契约（Main.cs:38411-38487 TryInteractingWithMoneyTrough
 *  的 proj.type==960 支 + Projectile.cs:80556-80564 TryGetContainerIndex + Player.cs:
 *  31245-31327 HandleBeingInChestRange 追踪支）。右键宠物 → chest=-2 开【玩家存钱罐
 *  player.bank】（TryGetContainerIndex：525/960 → -2，无独立存储）；再右键/宠物消失/
 *  走出射程 → 关面板 + 关音。表值即测试桩（tests/chester-pet.test.ts）。 */
export const CHESTER_CONTAINER = {
  projId: 960,             // Projectile.cs:63714 type==960 帧机支
  openChestX: -2,          // Main.cs:38463 localPlayer.chest = -2
  bankIndex: 0,            // GetCurrentContainer → player.bank（本仓 banks[0]）
  cursorIconVid: 5098,     // 悬停光标=ChesterPetItem（Main.cs:38436/1456 :37311 proj.type==960 支；默认支 3213=MoneyTrough）
} as const;

/** 虚空透镜容器 734 契约（孤儿武器 B3 波 工单1；Main.cs:38403-38400 段
 *  TryInteractingWithVoidLens 的右键支 + Projectile.cs:80568 TryGetContainerIndex
 *  type==734 → -5 + Player.cs:31245 HandleBeingInChestRange voidLensChest 支 +
 *  Player.cs:1571 Chest.CreateBank(-5)=bank4）。左键使用不【直开】面板——
 *  Item.cs case 4131/5325 :35876-35894 两 case 全同数据（useStyle1/shoot 734/
 *  speed 4/26×24/useAnim=useTime28/UseSound Item130/rare3/不消耗），使用 =
 *  ItemCheck_Shoot 通用发射弹 734（VoidLensProj）；右键透镜本体才 chest=-5 开
 *  banks[3] 面板（openChestX=-5 与储物族 tile 容器约定同源）；再右键/超射程/
 *  弹亡 → 关。开/关音 = SoundID.Item130（Main.cs:38453/:38471 双向同音）。
 *  关闭视觉态互换：手持 4131↔5325 右键换型（Player.cs:31796-31801 快换表 +
 *  ChangeItemType :31874,Item.cs IsTheSameBeingFastSwapped :47870-47876）。
 *  表值即测试桩（tests/orphan-b3.test.ts）。 */
export const VOID_LENS_CONTAINER = {
  projId: 734,             // Projectile.cs:80568 type==734 支
  openChestX: -5,          // Main.cs:38463 支 localPlayer.chest = -5
  bankIndex: 3,            // GetCurrentContainer → player.bank4（本仓 banks[3],Player.ts 注）
  cursorIconVid: 4131,     // 悬停光标=VoidLens（Main.cs:38359 TryInteractingWithVoidLens flag2 段；1456 :37233 同值）
  soundFile: 'Item_130',   // UseSound / PlayInteractiveProjectileOpenCloseSound 共值
  useTime: 28,             // Item.cs:35890 useTime = useAnimation = 28
  shootSpeed: 4,           // Item.cs:35880
} as const;

/** 开包上下文（世界旗 + 锁盒钥匙门）：
 *  - hardMode：OpenPresent :6654 硬模式门（读档旗）。
 *  - consumeItem / hasItem：锁盒族钥匙门回调（3085 金钥匙 327【消耗】/
 *    4879 暗影钥匙 329【只验不耗】，Player.ConsumeItem :8846 / HasItemInInventoryOrOpenVoidBag
 *    :54963——UI 侧注入背包实现；缺省 = 视为无钥匙 → 两锁盒拒开返回 false）。
 *  - remixWorld / getGoodWorld：Main 种子旗（don't dig up / FTW），作用于锁盒
 *    与冰冻匣个别支。skyblockLowTiles：WorldGen.Skyblock.lowTiles（空岛匣 2197 支）。
 *  ★SW-FX21（2026-09-10）BossBag 族（OpenBossBag Player.cs:7206）新增上下文：
 *  - masterMode：Main.masterMode（:7208 首读;袋 master/noMaster 条件臂）。
 *  - crimson：WorldGen.crimson（3319/3320 猩红三元矿种臂 :7255/:7260）。
 *  - extraAccessory：玩家饰品第六格（demon heart 臂 noExtra 条件）。
 *  - tenthAnniversary：十周年世界（TryGettingDevArmor 1/8 门,:7911=1457 终值,
 *    ★SW-RB12b 锚正:旧注 :7526 系 1456 域行号;`Next(tenth?8:16)==0`+`Next(21)` 套装表）。
 *  - hasItemInventory：Player.HasItem（:56551-56561 **仅查背包 0-57**,moonlord 袋
 *    3384 传送门枪 noItem 条件 :7748 用它;与锁盒的 HasItemInInventoryOrOpenVoidBag
 *    :56575（含虚空袋）不同方法,故与 hasItem 并存两回调）。 */
export interface BagOpenWorld {
  hardMode: boolean;
  consumeItem?: (vanillaId: number) => boolean;
  hasItem?: (vanillaId: number) => boolean;
  hasItemInventory?: (vanillaId: number) => boolean;
  masterMode?: boolean;
  crimson?: boolean;
  extraAccessory?: boolean;
  tenthAnniversary?: boolean;
  remixWorld?: boolean;
  getGoodWorld?: boolean;
  skyblockLowTiles?: boolean;
}

/** 右键开包分派（TryOpenContainer_GrantItems,1457 终值 ItemSlot.cs:1784-1843 同源;
 *  1456 旧注 :1662-1721）：返回 true = 已开（调用方做 stack-- + PlaySound(7)）；
 *  false = 非本引擎物品或钥匙门未过（原版 GrantItems 返回 false 时盒子不消耗）。
 *  ★SW-FX21（2026-09-10）补齐 BossBag 首支（ItemSlot.cs:1786-1789 =
 *  `if (ItemID.Sets.BossBag[item.type]) player.OpenBossBag(item.type)`,全树唯一
 *  调用方）——★§五裁决(09-13)Game 持用左键链已摘除,本引擎为唯一开包承载。 */
export function openBagItem(
  vid: number,
  give: BagGive,
  world: BagOpenWorld,
  rng: BagRand = defaultRand,
): boolean {
  if (BOSS_BAG_IDS.has(vid)) {                              // :1786-1789 首支（ItemID.cs:1215 全集 21 件）
    openBossBag(vid, give, {
      masterMode: world.masterMode ?? false,
      crimson: world.crimson ?? false,
      extraAccessory: world.extraAccessory ?? false,
      // 原版 OpenBossBag 内 HasItem(3384)（:7748）= Player.HasItem 仅查背包
      // :56551——注入 hasItemInventory（缺省回落 hasItem/恒 false 防误吞产出）
      hasItem: world.hasItemInventory ?? world.hasItem ?? (() => false),
      remixWorld: world.remixWorld,
      tenthAnniversary: world.tenthAnniversary,
    });
    return true;                                            // :1842 原版恒 true（无 case 也不 false）→ 盒照耗
  }
  switch (vid) {
    case 1869: openPresent(give, world.hardMode, rng); return true;
    case 599: case 600: case 601: openLegacyPresent(give, world.hardMode, rng); return true;
    case 1774: openGoodieBag(give, rng); return true;
    case 3093: openHerbBag(give, rng); return true;
    case 4345: openCanofWorms(give, rng); return true;        // :1677-1680
    case 4410: openOyster(give, rng); return true;            // :1681-1684
    case 6142: openChilletEgg(give, rng); return true;        // :1689-1692
    case 3085:                                                // :1693-1698 金钥匙消耗门
      if (!world.consumeItem?.(327)) return false;
      openLockBox(give, rng, !!world.remixWorld, !!world.getGoodWorld);
      return true;
    case 4879:                                                // :1699-1704 暗影钥匙门槛门（不消耗）
      if (!world.hasItem?.(329)) return false;
      openShadowLockbox(give, rng, !!world.remixWorld);
      return true;
    default:
      if (FISHING_CRATE_VIDS.has(vid)) {                      // ★SW-FX13 锚正：1457 ItemSlot.cs:1790-1793 IsFishingCrate（1456=旧注 :1668-1670）
        openFishingCrate(vid, give, rng, {
          remixWorld: world.remixWorld,
          skyblockLowTiles: world.skyblockLowTiles,
        });
        return true;
      }
      return false;
  }
}

/** give 出口的 id 是否在本仓已注册（防 vanilla.json 缺条目静默吞掉） */
export function bagItemIdRegistered(id: number): boolean {
  return VANILLA_ITEM_KEY_BY_ID[id] !== undefined;
}
