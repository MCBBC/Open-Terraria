// 原版 pass "TileCleanup"(1456 WorldGen.cs:21327-21751)1:1 移植。
//
// ── 建议接入位(协调者接线用) ──
//   原版注册序 cs:21327(Traps cs:18769 之后、LihzahrdAltar cs:21753 之前);
//   我方应在 runTrapsPass 之后、蜥蜴祭坛 pass 之前调用:
//     runTileCleanupPass(store, rng, gs);
//
// 12 个子项处置(审计裁决「补」):
//   ① tileSolid[379]=false 临时覆写(cs:21329)——本 pass 全程生效,⑫ 末尾还原(cs:21750)
//   ② 全图清坡(cs:21333-21343):非 SaveSlopes 类型一律 ClearSlope
//      (= slope(0)+halfBrick(false) 双清,Tile.cs:158-163)
//   ③ 坡接半砖修复(cs:21344-21353):坡面格朝半砖格一侧 → slope=0+halfBrick
//   ④ 液体中 SlowlyDiesInWater 方块 KillTile(cs:21354-21357)
//   ⑤ 滴水石笋(cs:21358-21435):上方 15-20 格内液体≥128 / 下方 3-10 格内液体≥200,
//      概率随距离衰减;墙 86(蜂巢)强制蜂蜜滴头
//   ⑥ 墙 13/14 液体清零;墙 87 普通世界液体清零(cs:21437-21458)
//   ⑦⑧⑨⑩ 帧规范化族(cs:21461-21741:137 邻半砖清除/162/31/12/639/箱 21·467/28/26
//      祭坛族)——跳过(审计裁决:我方放置端已保证帧);其中 137 邻格半砖清除
//      (cs:21461-21475)是几何修复而非纯帧,若后续发现雕像/陷阱贴半砖异常再补
//   ⑪ 祭坛 237 正下方 232 木刺 → 226 蜥蜴砖(cs:21743-21746)
//
// SaveSlopes(TileID.cs:425-429)= Main.tileSolid ∪ NonSolidSaveSlopes
//   (TileID.cs:179:{131,351,336,340,341,342,343,344})。
// SlowlyDiesInWater(1456 TileID.cs:249)={3,20,24,27,73,201,80,110,529,530,590,595,615,637}
//   ——⚠️ 审计清单曾写「采掘物 398/399/400/401/404/235 等」,以 1456 原文为准,
//   实为草本/树苗/盆栽族(植物 3、灌木 20/24/73/201、藤壶 80 等),与采掘物无关。
//
// RNG 消费清单(顺序敏感,缺一即流偏移):
//   ⑤ 门 Next(3)!=0(仅 !active && liquid==0 格消费)→ Next(15,21)
//     → 上扫每个 liquid>=128 && !shimmer 格 Next(l-n2)(n2 从 l-2 起)
//     → (未放置)Next(3,11) → 下扫每个 liquid>=200 && !shimmer 格 Next((m-l)*3)
//     → (仍未放置)Next(4)(不论沙岩判定是否命中都消费)
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';

/** sheet(=原版 tile id)→ 内部 id;未实装时 0(空格)安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
export function sheetId(sheet: number): number {
  return SHEET_TO_INTERNAL.get(sheet) ?? 0;
}

const NON_SOLID_SAVE_SLOPES = idsByVanillaSheet(131, 351, 336, 340, 341, 342, 343, 344);
const SLOWLY_DIES_IN_WATER = idsByVanillaSheet(3, 20, 24, 27, 73, 201, 80, 110, 529, 530, 590, 595, 615, 637);
/** TileID.Sets.Conversion.Sandstone/HardenedSand(TileID.cs:32-34) */
const CONV_SANDSTONE = idsByVanillaSheet(396, 400, 403, 401);
const CONV_HARDENED_SAND = idsByVanillaSheet(397, 398, 402, 399);

const BUBBLE = sheetId(379);            // ①/⑫ tileSolid[379] 覆写对象(气泡块)
const DRIP_WATER = sheetId(373);
const DRIP_LAVA = sheetId(374);
const DRIP_HONEY = sheetId(375);
const DRIP_SHIMMER = sheetId(709);      // 注:两处扫描的 !shimmer() 门使 709 不可达(原版同,cs:21373/21389 死分支)
const SAND_PILE = sheetId(461);         // 沙岩/硬沙正下方 1/4 概率的小沙堆
const LIHZARD_ALTAR = sheetId(237);
const WOODEN_SPIKE = sheetId(232);
const LIHZARD_BRICK = sheetId(226);
const BEE_WALL = 86;                    // 蜂巢墙 → 强制蜂蜜滴头(cs:21404)

/** SaveSlopes[t] = tileSolid[t](含 ① 的 379=false 覆写)∪ NonSolidSaveSlopes */
function isSaveSlope(t: number): boolean {
  return (t !== BUBBLE && !!TILE_DEFS[t]?.solid) || NON_SOLID_SAVE_SLOPES.has(t);
}

/** WorldGen.SolidTile(cs:42370):active && tileSolid && !tileSolidTop && !halfBrick && slope==0。
 *  tileSolid 经 ① 覆写(379 非实心);tileSolidTop 近似为 platform(与 HalfBrickPass 同口径) */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i];
  if (t === BUBBLE) return false; // ① 覆写
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 生成期 KillTile(cs:63559,isGeneratingOrLoadingWorld → noItem=true):
 *  仅清活性/类型,保留液体(与 SurfaceDecorPasses.killTile 同口径;TileStore 无法表达
 *  原版 active(false) 留 type 的幽灵态,沿用全仓约定 type 一并清零) */
function killTile(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  st.setTileSilent(x, y, 0);
}

/** 按液体类型选滴头(cs:21370-21378/21386-21394:先 lava 再 honey;shimmer 被 !shimmer() 门排除) */
function dripFor(liquidType: number): number {
  if (liquidType === LIQUID_TYPE.LAVA) return DRIP_LAVA;
  if (liquidType === LIQUID_TYPE.HONEY) return DRIP_HONEY;
  if (liquidType === LIQUID_TYPE.SHIMMER) return DRIP_SHIMMER;
  return DRIP_WATER;
}

export function runTileCleanupPass(st: TileStore, rng: RNG, _gs: GenState): void {
  const { w, h } = st;

  // ② 全图清坡(cs:21333-21343,全图含边缘,先于内层 40 收缩圈)
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const t = st.idx(i, j);
      if (!st.flags[t] || !isSaveSlope(st.type[t])) {
        st.slope[t] = 0;
        st.half[t] = 0; // 原版 ClearSlope = slope(0)+halfBrick(false)(Tile.cs:158-163)
      }
    }
  }

  for (let k = 40; k < w - 40; k++) {
    for (let l = 40; l < h - 40; l++) {
      const i = st.idx(k, l);

      // ③ 坡接半砖修复(cs:21344-21353):topSlope(1/2) 且左坡(2/4)接右邻半砖、
      //    或右坡(1/3)接左邻半砖 → slope=0 + halfBrick=true
      if (st.flags[i] && (st.slope[i] === 1 || st.slope[i] === 2)) {
        const s: number = st.slope[i]; // 显式 number:后续 3/4 比较是全坡面表(外层门只到 1/2)
        const leftSlope = s === 2 || s === 4;
        const rightSlope = s === 1 || s === 3;
        const r = st.idx(k + 1, l);
        const lf = st.idx(k - 1, l);
        if ((leftSlope && st.flags[r] && st.half[r] === 1) || (rightSlope && st.flags[lf] && st.half[lf] === 1)) {
          st.slope[i] = 0;
          st.half[i] = 1;
        }
      }

      // ④ 液体中的 SlowlyDiesInWater 方块清除(cs:21354-21357)
      if (st.flags[i] && st.liquid[i] > 0 && SLOWLY_DIES_IN_WATER.has(st.type[i])) {
        killTile(st, k, l);
      }

      // ⑤ 滴水石笋(cs:21358-21435):空格+无液+上方实心才进
      if (!st.flags[i] && st.liquid[i] === 0 && rng.int(0, 2) !== 0 && solidTile(st, k, l - 1)) {
        // 上扫(cs:21360-21411):l-2 起向上 num(15-20) 格,液体>=128
        let num = rng.int(15, 20); // Next(15,21)
        for (let n2 = l - 2; n2 >= l - num; n2--) {
          const up = st.idx(k, n2);
          if (st.liquid[up] >= 128 && st.liquidType[up] !== LIQUID_TYPE.SHIMMER) {
            const maxValue = l - n2; // 距离,最小 2
            if (rng.int(0, maxValue - 1) <= 1) { // Next(maxValue)
              let drip = dripFor(st.liquidType[up]);
              if (st.wall[i] === BEE_WALL) drip = DRIP_HONEY; // cs:21404
              st.setTileSilent(k, l, drip, 0, 0);
              break;
            }
          }
        }
        // 下扫(cs:21413-21429):l+1 起向下 num(3-10) 格,液体>=200
        if (!st.flags[i]) {
          num = rng.int(3, 10); // Next(3,11)
          for (let m = l + 1; m <= l + num; m++) {
            const dn = st.idx(k, m);
            if (st.liquid[dn] >= 200 && st.liquidType[dn] !== LIQUID_TYPE.SHIMMER) {
              const dist = m - l;
              if (rng.int(0, dist * 3 - 1) <= 1) { // Next(dist*3)
                st.setTileSilent(k, l, dripFor(st.liquidType[dn]), 0, 0);
                break;
              }
            }
          }
        }
        // 小沙堆(cs:21431-21441):上方是沙岩/硬沙 → 1/4 概率放 461
        if (!st.flags[i] && rng.int(0, 3) === 0) { // Next(4)
          const above = st.idx(k, l - 1);
          if (CONV_SANDSTONE.has(st.type[above]) || CONV_HARDENED_SAND.has(st.type[above])) {
            st.setTileSilent(k, l, SAND_PILE, 0, 0);
          }
        }
      }

      // ⑥ 墙 13/14 液体清零(cs:21437-21439)
      if (st.wall[i] === 13 || st.wall[i] === 14) {
        st.liquid[i] = 0; // 原版只清液量,liquidType 位保留
      }
      // ⑥ 墙 87(cs:21441-21458):extraLiquid 特殊种子分支未实装(SeedFlags 无该旗标),
      //    恒走普通世界分支 = 液体清零
      if (st.wall[i] === 87) {
        st.liquid[i] = 0;
      }

      // ⑦⑧⑨⑩ 帧规范化族(cs:21461-21741)——跳过(我方放置端已保证帧,审计裁决)

      // ⑪ 祭坛 237 正下方 232 木刺 → 226 蜥蜴砖(cs:21743-21746)
      if (st.flags[i] && st.type[i] === LIHZARD_ALTAR && st.type[st.idx(k, l + 1)] === WOODEN_SPIKE) {
        st.type[st.idx(k, l + 1)] = LIHZARD_BRICK;
      }
    }
  }

  // ⑫ tileSolid[379] 还原 true(cs:21750)——TileStore 无全局 tileSolid 表,
  //    覆写经 solidTile/isSaveSlope 内的 BUBBLE 判定实现,pass 结束自动失效
}
