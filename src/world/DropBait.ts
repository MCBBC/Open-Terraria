// KillTile_DropBait 掷骰核心（WorldGen.cs:66304-66480 纯函数化）：
// 分母表 + 帧带门 + 花靴 ×10000 + 金掷/序贯族型选择。出生姿势/上限计数在
// Game.killTileDropBait（实体侧）。幸运四叶草 5574 掷（:66337-66340，独立 if）
// 单独成 dropCloverRoll——虫族早退结构（单产物）之外可与之同年同击双中。
export type BaitKind = 'worm' | 'hop' | 'grub' | 'lava';

/** 掷一次产出；null = 无（tile 不在表内 / 帧带不命中 / 概率未中）。
 *  rand = [0,1) 掷源；flowerBoots = 装备且 frameX>=108（自长植株门）
 *  ——62/233/185-187 族原版无花靴门。 */
export function dropBaitRoll(
  sheet: number, fx: number, fy: number, flowerBoots: boolean, rand: () => number,
): { kind: BaitKind; gold: boolean; grubType?: 485 | 486 | 487; lavaType?: 653 | 654; wormType?: 357 | 448 | 606 } | null {
  let wormDenom = -1, hopDenom = -1, grubDenom = -1, lavaDenom = -1;
  if (sheet === 3) { wormDenom = 400; hopDenom = 100; if (flowerBoots) { wormDenom *= 10000; hopDenom *= 10000; } }
  else if (sheet === 73) { wormDenom = 200; hopDenom = 50; if (flowerBoots) { wormDenom *= 10000; hopDenom *= 10000; } }
  else if (sheet === 61) { grubDenom = 80; if (flowerBoots) grubDenom *= 10000; }
  else if (sheet === 74) { grubDenom = 40; if (flowerBoots) grubDenom *= 10000; }
  else if (sheet === 62) grubDenom = 250;
  else if (sheet === 233) grubDenom = 10;
  else if (sheet === 637) { lavaDenom = 100; if (flowerBoots) lavaDenom *= 10000; }
  else if (sheet === 185) {
    if ((fy === 0 && fx < 214) || (fy === 18 && (fx < 214 || fx >= 1368))) wormDenom = 6;
  } else if (sheet === 186) {
    if (fx >= 378 && fx <= 700) wormDenom = 6;
  } else if (sheet === 187) {
    if ((fx >= 756 && fx <= 916) || fx <= 322) wormDenom = 6;
  } else return null;
  const gold = () => rand() < 1 / 400;   // goldCritterChance=400（luck 掷近似）
  if (wormDenom > 0 && rand() < 1 / wormDenom) return { kind: 'worm', gold: gold() };
  if (hopDenom > 0 && rand() < 1 / hopDenom) return { kind: 'hop', gold: gold() };
  if (grubDenom > 0 && rand() < 1 / Math.floor(grubDenom * 1.25)) {   // :66452 ×1.25
    // 序贯两掷（:66455-66461）：Next(4)==0→486，独立 Next(12)==0→487 覆写
    let grubType: 485 | 486 | 487 = 485;
    if (rand() < 1 / 4) grubType = 486;
    if (rand() < 1 / 12) grubType = 487;
    return { kind: 'grub', gold: false, grubType };
  }
  if (lavaDenom > 0 && rand() < 1 / lavaDenom) {
    return { kind: 'lava', gold: false, lavaType: rand() < 0.5 ? 654 : 653 };
  }
  return null;
}

/** worm 族的 NPC 类型（墓地 606 / 金 448 / 普通 357——:66416-19 墓地覆金） */
export function baitWormType(graveyard: boolean, gold: boolean): 357 | 448 | 606 {
  if (graveyard) return 606;
  return gold ? 448 : 357;
}

/** 幸运四叶草 5574 掷骰（KillTile_DropBait :66337-66340 `num3=1000（仅 tile 73
 *  且 frameX<108——成熟药草株；花靴 ×10000 不及此表）→ genRand.Next(1000)==0 →
 *  Item.NewItem 5574`）。与虫族掷骰【相互独立】（原版顺序独立 if：worm →
 * clover → hop → grub → lava，本表单独成函数即此语义）。5575 枯萎四叶草的唯一
 * 来源 = 5574 微光转化（ShimmerTransformToItem[5574]=5575）；5576 乌鸦羽 =
 * 乌鸦 301 掉落 1/10（ItemDropDatabase.cs:959，vanilla-npcdrops.json 已载） */
export function dropCloverRoll(sheet: number, fx: number, rand: () => number): boolean {
  if (sheet !== 73 || fx >= 108) return false;
  return rand() < 1 / 1000;
}
