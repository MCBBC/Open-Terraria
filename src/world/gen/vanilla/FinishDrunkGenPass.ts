// 原版 FinishDrunkGen（Terarria1457/Terraria/WorldGen.cs:26493-26611）1:1 移植。
// 调用点：FinalCleanup pass 体（cs:22630 `if (drunkWorldGen) FinishDrunkGen();`）
// ——序在 noTraps/tenth 之后、notTheBees/getGood/remix 之前；纯 drunk 世界无后三支
// = finalGenMergeScan（cs:22639-50 LiquidCheck）之前的尾段钩子（WorldGen.ts
// finalCleanupPass 内接线）。
//
// 三链：
//   ① 全图扫描定 paint 主色（cs:26494-26517，列优先 i 外 j 内）：初始 Next(13,25)，
//      扫描中每碰到活动地牢砖按砖种重掷——44 粉→Next(13,15)，再 Next(2)==0→
//      Next(23,25)；43 绿→Next(15,19)；41 蓝→Next(19,23)。★原始 break 段
//      （`bool flag=false; if (flag) break;`）flag 恒 false=原版死码，不移植。
//      Main.tileDungeon={41,43,44,677,678,679}（Main.cs:8131-8136），古砖族只参与
//      "是否入域"判定、不触发掷骰。
//   ② 涂装（cs:26519-26582，内域 [10,w-11]×[10,h-11]）：地牢砖+裂纹砖(481-483)
//      →color(color)；地牢墙→wallColor(25) 黑涂；丛林草（60）±1 邻域 147/161→59 泥；
//      菌草/垂叶（226 / 60 下格 226 / sheet137 frameY 行 1..4）→color(16)；
//      墙 87→wallColor(16)。
//   ③ 宝箱尾修（cs:26584-26610）：逐箱照掷两颗——Next(15)==0 且 item[1].stack≠0
//      →首个空槽塞 5001（红药水）；Next(30)==0 且 item[1].stack≠0 →塞 678
//      （月总腿）。★C# `if (Next(30) != 0 || item[1].stack == 0) continue`
//      ——Next(30) **恒掷**（左值先求值短路纪律，M 批惯例照抄）。
//
// ★IIIII21：M 车 IIIII14 排期项②落地。paint/wallColor 双通道走 TileStore 现有
// st.paint/st.paintWall 字段（值域 ≤31，本函数最大 25/16 安全）；生成期直写数组
// （等价 setPaintSilent——此时无 chunk 监听器）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_DUNGEON_IDS, WALL_DUNGEON_SHEETS } from '../../../data/tiles';
import { VI_ID } from '../../../data/itemKeys';
import type { ChestSink } from './BuriedChestsPass';

/** 5001=Blood Rainbow(红药水) / 678=Moon Lord Legs（SetDefaults 按 vid SetDefaults；
 *  本仓物品面为内部 id——与 dgLootItems 的 VANILLA_ITEM_KEY_BY_ID 同构映射） */
const POTION_5001 = VI_ID(5001);
const MOON_LEGS_678 = VI_ID(678);

/** 内部 tile id ↔ 原版 sheet 映射（模块载入一次性构建；本仓 tile id ≠ 原版 TileID，
 *  判定一律走 sheet 定锚——见 MEMORY「蚁狮沙球/tile id 域」）。 */
const SHEET_OF: number[] = [];
const ID_BY_SHEET = new Map<number, number>();
for (let t = 0; t < TILE_DEFS.length; t++) {
  const sh = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  if (sh >= 0) {
    SHEET_OF[t] = sh;
    if (!ID_BY_SHEET.has(sh)) ID_BY_SHEET.set(sh, t);
  }
}
const sheetOf = (t: number): number => SHEET_OF[t] ?? -1;
const one = (s: number): number => ID_BY_SHEET.get(s) ?? -1;
const ids = (...sheets: number[]): Set<number> =>
  new Set(sheets.map(one).filter((v): v is number => v >= 0));

/** Main.tileDungeon（Main.cs:8131-8136）：41 蓝/43 绿/44 粉 + 古砖 677-679
 *  ——★BJ187 收编 data/tiles.ts:TILE_DUNGEON_IDS 单源（旧 ids() 平移副本逐值全等） */
const DUNGEON_BRICKS = TILE_DUNGEON_IDS;
/** TileID.Sets.CrackedBricks（TileID.cs:183）＝481/482/483 */
const CRACKED_BRICKS = ids(481, 482, 483);
const BRICK_PINK = one(44), BRICK_GREEN = one(43), BRICK_BLUE = one(41);
const JUNGLE_GRASS = one(60), MUSHROOM_GRASS = one(226), VINE_137 = one(137);
const MUD_59 = one(59);

/** Main.wallDungeon（Main.cs:10734-10745；主砖墙 + 板/柱墙族）wall id 即原版 id
 *  ——★BJ187 收编 data/tiles.ts:WALL_DUNGEON_SHEETS 单源（9 项逐值全等） */
const WALL_DUNGEON = WALL_DUNGEON_SHEETS;

export function runFinishDrunkGenPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;

  // ---- 链① 主色定夺（列优先全图扫描）----
  let color = rng.int(13, 24);                            // byte color = Next(13,25)
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const ti = st.idx(i, j);
      if (!st.flags[ti]) continue;
      const ty = st.type[ti];
      if (!DUNGEON_BRICKS.has(ty)) continue;              // !tileDungeon[type] → continue
      if (ty === BRICK_PINK) {
        color = rng.int(13, 14);
        if (rng.int(0, 1) === 0) color = rng.int(23, 24); // Next(2)==0 → Next(23,25)
      }
      if (ty === BRICK_GREEN) color = rng.int(15, 18);    // Next(15,19)
      if (ty === BRICK_BLUE) color = rng.int(19, 22);     // Next(19,23)
    }
  }

  // ---- 链② 涂装 ----
  const b = 16;
  for (let k = 10; k < w - 10; k++) {
    for (let l = 10; l < h - 10; l++) {
      const ti = st.idx(k, l);
      const active = st.flags[ti] !== 0;
      const ty = active ? st.type[ti] : -1;
      const sh = active ? sheetOf(ty) : -1;
      if (active && (DUNGEON_BRICKS.has(ty) || CRACKED_BRICKS.has(ty))) {
        st.paint[ti] = color & 31;                        // .color(color)
      }
      if (WALL_DUNGEON.has(st.wall[ti])) {
        st.paintWall[ti] = 25;                            // .wallColor(25) 黑涂
      }
      if (active) {
        if (ty === JUNGLE_GRASS) {                        // ±1 邻域雪/冰→泥
          for (let m = k - 1; m <= k + 1; m++) {
            for (let n = l - 1; n <= l + 1; n++) {
              if (!st.inBounds(m, n)) continue;
              const ni = st.idx(m, n);
              const ns = sheetOf(st.type[ni]);
              if (ns === 147 || ns === 161) st.type[ni] = MUD_59;
            }
          }
        }
        let flag2 = false;
        if (ty === MUSHROOM_GRASS) flag2 = true;          // 菌草
        if (ty === JUNGLE_GRASS && st.inBounds(k, l + 1) && st.flags[st.idx(k, l + 1)] !== 0
          && sheetOf(st.type[st.idx(k, l + 1)]) === 226) flag2 = true;
        if (ty === VINE_137) {
          const row = Math.trunc(st.frameY[ti] / 18);
          if (row >= 1 && row <= 4) flag2 = true;         // 垂叶 frameY 行 1..4
        }
        if (flag2 && !gs.seedFlags.notTheBees) {
          st.paint[ti] = b;                               // .color(b)
        }
      }
      if (st.wall[ti] === 87) {
        st.paintWall[ti] = b;                             // .wallColor(b)
      }
    }
  }

  // ---- 链③ 宝箱尾修 ----
  for (let n3 = 0; n3 < 8000 && n3 < chests.length; n3++) {
    const chest = chests[n3];
    if (chest == null) break;                             // Main.chest 首空位即终止
    if (rng.int(0, 14) === 0 && chestItemStack(chest.items, 1) !== 0) {
      if (POTION_5001 > 0) giveChestItem(chest.items, POTION_5001);
    }
    if (rng.int(0, 29) !== 0 || chestItemStack(chest.items, 1) === 0) continue;
    if (MOON_LEGS_678 > 0) giveChestItem(chest.items, MOON_LEGS_678);
  }
}

/** chest.item[i].stack 读（缺槽=默认 Item.stack==0） */
function chestItemStack(items: Array<{ id: number; stack: number } | null>, i: number): number {
  return items[i]?.stack ?? 0;
}

/** 首个空槽（num 从 1 起）SetDefaults 放 stack1——上限 chest.maxItems=40 */
function giveChestItem(items: Array<{ id: number; stack: number } | null>, id: number): void {
  for (let m = 1; m < 40; m++) {
    if (!items[m]) {
      items[m] = { id, stack: 1 };
      return;
    }
  }
}
