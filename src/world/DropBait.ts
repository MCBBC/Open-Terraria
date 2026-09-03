// KillTile_DropBait 掷骰核心（WorldGen.cs:66304-66480 纯函数化；1457 行号漂移
// 至 :66784-66944——分母/帧带结构零变化，金掷与四叶草支见下）：
// 分母表 + 帧带门 + 花靴 ×10000 + 金掷/序贯族型选择。出生姿势/上限计数在
// Game.killTileDropBait（实体侧）。幸运四叶草 5574 掷（:66337-66340，独立 if）
// 单独成 dropCloverRoll——虫族早退结构（单产物）之外可与之同年同击双中。
// ★幸运消费面七类②（2026-09-03）：金变体掷原为 `rand<1/400` 均匀近似——原版是
// Player.GetClosestRollLuck(i, j, goldCritterChance)==0f（WorldGen.cs:66885 worm
// /:66903 grasshopper；NPC.cs:6054 goldCritterChance=400）= Luck.RollLuck 三态掷
// （正运内掷收窄 [N/2,N) → 命中率 ≈1.39/N、负运扩张 [N,2N) → ≈0.69/N）。luck=0
// 时 rollLuck≡Next(400)==0 ≡ rand<1/400（旧行为逐位等价，单测种子流零变化）。
// worm 墓地档：num7 先被 606 覆写、金掷门 `num7 == 357 && …` 短路 = 墓地【不掷】
// （:66881-66887）——wormGraveyard 参承载短路序（先判再掷，掷流计数同原版）。
import { rollLuck } from '../stats/Luck';
export type BaitKind = 'worm' | 'hop' | 'grub' | 'lava';

/** 掷一次产出；null = 无（tile 不在表内 / 帧带不命中 / 概率未中）。
 *  rand = [0,1) 掷源；flowerBoots = 装备且 frameX>=108（自长植株门）
 *  ——62/233/185-187 族原版无花靴门。
 *  luck = 破坏点最近存活玩家 luck（GetClosestRollLuck 语义，Game 侧
 *  closestPlayerLuckAt 注入；缺省 0 = 单掷基线）；wormGraveyard = 破坏点最近玩家
 *  ZoneGraveyard（worm 606 覆写 → 金掷短路不掷）。 */
export function dropBaitRoll(
  sheet: number, fx: number, fy: number, flowerBoots: boolean, rand: () => number,
  luck = 0, wormGraveyard = false,
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
  // 金变体掷：GetClosestRollLuck(i,j,400)==0（Luck.RollLuck 三态）；墓地 worm 短路
  // 在掷【之前】（原版 && 序，掷流计数一致）。grub（485-487）/lava（653/654）两族
  // 原版无金掷（:66914-66937 直选变体）。
  const gold = (worm: boolean): boolean =>
    !(worm && wormGraveyard) && rollLuck(luck, 400, rand) === 0;
  if (wormDenom > 0 && rand() < 1 / wormDenom) return { kind: 'worm', gold: gold(true) };
  if (hopDenom > 0 && rand() < 1 / hopDenom) return { kind: 'hop', gold: gold(false) };
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
