// 礼袋/礼盒右键开包引擎（Player.OpenPresent :6651-6770 / OpenLegacyPresent :6772-6788 /
// OpenGoodieBag :9199-9282 / OpenHerbBag :9064-9138，1.4.5.6 逐支抄）。
// 入口门 = ItemSlot.RightClick :1514-1527（context==0 背包格 && mouseItem 空或不可叠 &&
// OpenableBag）→ TryOpenContainer :1642-1660（掷骰 → stack-- → PlaySound(7)）。
// 掷骰语义对齐 UnifiedRandom.Next：Next(n) = [0,n)、Next(a,b) = [a,b)。
import { VANILLA_ITEM_KEY_BY_ID } from './items';

/** ItemID.Sets.OpenableBag（ItemID.cs:1211 全量，右键可开包集合——UI 门禁用）。
 *  其中宝藏袋 3318-3332/3860-3862/4782/4957/5111 与木匣/钓鱼箱等走各自引擎
 *  （openBossBag / OpenLockBox / OpenFishingCrate），本引擎只接管 1869/1774/3093/599-601。 */
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

/** OpenPresent（Player.cs:6651-6770）：圣诞礼盒 1869 十九支 else-if 链。
 *  ★链式判定：每支独立掷 Next(n)，前支命中即 return——顺序与概率逐字，
 *  不得改写为独立 if（否则后支概率被前支吞掉）。 */
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

/** 右键开包分派（TryOpenContainer_GrantItems :1662-1721 同源子集）：
 *  返回 true = 已开（调用方做 stack-- + PlaySound(7)）；false = 非本引擎物品
 *  （宝藏袋/木匣/钓鱼箱等走各自链，UI 应回落原右键行为） */
export function openBagItem(
  vid: number,
  give: BagGive,
  world: { hardMode: boolean },
  rng: BagRand = defaultRand,
): boolean {
  switch (vid) {
    case 1869: openPresent(give, world.hardMode, rng); return true;
    case 599: case 600: case 601: openLegacyPresent(give, world.hardMode, rng); return true;
    case 1774: openGoodieBag(give, rng); return true;
    case 3093: openHerbBag(give, rng); return true;
    default: return false;
  }
}

/** give 出口的 id 是否在本仓已注册（防 vanilla.json 缺条目静默吞掉） */
export function bagItemIdRegistered(id: number): boolean {
  return VANILLA_ITEM_KEY_BY_ID[id] !== undefined;
}
