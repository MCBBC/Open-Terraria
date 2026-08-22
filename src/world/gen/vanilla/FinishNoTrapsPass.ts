// FinishNoTraps（1456 WorldGen.cs:26129-26367 / 1457 cs:26253-26478，~240 行全新
// 尾段）——noTrapsWorldGen 专属 Finish 子段，挂在 FinalCleanup pass 体内
// Dirtiest Block(⑭) 之后、ShimmerCleanUp 之前（cs:22624 调用位）。
//
// 五段结构（逐行对照 1457）：
//   A 生命水晶 12→665 巨石 1/maxValue（getGood&&!tenth 时 1/2；掷照耗，全图扫描
//     ≈(w-100)×(h-100) 次 Next——本 pass 的 RNG 主消费）；只写 type（帧不动——
//     12/665 同为 Style2x2 帧表，帧天然兼容）。
//   B 雕像 105 / 死亡之箱 467@fx144/162 无线时：3×3 无线 → 25×25 随机找线接驳
//     （L 形 x 先 y 后）；无线且 105 → 15×15 随机放压板 135（style Next(2,4) 每掷
//     照耗）成功后接驳。
//   C 467（!tenth||remix）：8×8 随机找 0/1/Ore/59/151 格 + 3×3 SolidTile → 直写
//     141 炸药（帧/坡/半砖归零）+ TileFrame(resetFrame:true)（Check1x1 可杀——杀则
//     continue）→ 接驳。else j++（105 跳列，原版字面 bug-for-bug）。
//   D 残存无线 467@fx144/fy0 → 金箱 21@fx36/54（2×2 四格 type+frameX 改写）。
//   E 每箱 1/15：item[1] 非空时首个空位（自 idx1 起）塞 5346 Gas Trap。
//
// 巨石实心窗：头 SetBoulderSolidity(false)（cs:26255——SolidTile 判定不含巨石格）
// + (D) 前还原 true（cs:26453）。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { setBoulderSolidity, placePlate } from './TrapsPass';
import { genTileFrame } from './FinalCleanupPass';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const sheetOf = (t: number): number => (t >= 0 && t < SHEET.length ? SHEET[t] : -1);

const T665 = TILE_BY_KEY['v_665_life_crystal_boulder']!;
const T141 = TILE_BY_KEY['v_141_explosives']!;
const T21 = TILE_BY_KEY['chest']!;
const PLATE_SHEET = 135;

/** Main.tileSolidTop（TrapsPass 同表副本——同源副本禁 import 惯例） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileID.Sets.Ore（TileID.cs:399） */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);

const WIRE_RED = TileStore.WIRE_RED;

/** SolidTile（cs:70155）：active && 生成期 tileSolid && !solidTop && !half && slope==0
 *  && !inActive。★巨石族在 FinishNoTraps 头已翻非实心 → 巨石格不过本门（(C) 的
 *  3×3 支撑判定语义关键）。 */
function solidTileF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(sheetOf(t))
    && !st.half[i] && st.slope[i] === 0 && ((st.wire[i] >>> 5) & 1) === 0;
}

/** L 形布线（cs:26300-26320 字面两段式：起点→x 走→y 走；与 TrapsPass.lWire 的
 *  合流循环等价覆盖同格集，此处按原版字面另写副本）。 */
function wireL(st: TileStore, x0: number, y0: number, x1: number, y1: number): void {
  st.wire[st.idx(x0, y0)] |= WIRE_RED;
  let wx = x0, wy = y0;
  while (wx !== x1) {
    if (wx < x1) wx++; else wx--;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
  }
  while (wy !== y1) {
    if (wy < y1) wy++; else wy--;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
  }
}

/** 原版物品 id → 本仓内部 id（BuriedChestsPass.vid 同源副本） */
function vid(id: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[id];
  return k ? (ITEM_BY_KEY[k] ?? -1) : -1;
}

type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;

/** FinishNoTraps 主体（cs:26253-26478）。chests=世界箱表（(E) 段消费）。 */
export function runFinishNoTraps(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const nf = gs.seedFlags;
  setBoulderSolidity(false);                                          // cs:26255
  let maxValue = 5;
  if (nf.getGoodWorld && !nf.tenthAnniversary) maxValue = 2;          // cs:26256-26259
  const w = st.w, h = st.h;
  for (let i = 50; i < w - 50; i++) {
    for (let j = 50; j < h - 50; j++) {
      // ---- (A) 生命水晶 → 巨石（cs:26264-26274；掷照耗） ----
      const ai = st.idx(i, j);
      if (rng.int(0, maxValue - 1) === 0 && st.flags[ai]
        && sheetOf(st.type[ai]!) === 12 && st.frameX[ai] === 0 && st.frameY[ai] === 0) {
        st.type[st.idx(i, j)] = T665;
        st.type[st.idx(i, j + 1)] = T665;
        st.type[st.idx(i + 1, j)] = T665;
        st.type[st.idx(i + 1, j + 1)] = T665;
      }
      // ---- (B) 门（cs:26275-26277）：偶偶格 + 活性 + 105/467@fx144|162 ----
      const bi = st.idx(i, j);
      if (i % 2 !== 0 || j % 2 !== 0 || !st.flags[bi]) continue;
      const sh = sheetOf(st.type[bi]!);
      if (sh !== 105 && !(sh === 467 && (st.frameX[bi] === 144 || st.frameX[bi] === 162))) continue;
      // 3×3 邻域无线判定（cs:26279-26290）
      let wired = false;
      for (let k = i - 1; k <= i + 1; k++) {
        for (let l = j - 1; l <= j + 1; l++) {
          if (st.inBounds(k, l) && (st.wire[st.idx(k, l)] & WIRE_RED)) wired = true;
        }
      }
      if (!wired) {
        // 25×25 随机找线（cs:26292-26306；625 掷上限）
        const num = 25;
        let tx = 0, ty = 0, found = false;
        for (let m = 0; m < num * num; m++) {
          tx = rng.int(i - num, i + num);
          ty = rng.int(j - num, j + num);
          if (st.wire[st.idx(tx, ty)] & WIRE_RED) { found = true; break; }
        }
        if (found) {
          wireL(st, i, j, tx, ty);                                      // cs:26308-26326
        } else if (sh === 105) {
          // 15×15 随机放板（cs:26327-26351；每掷 3 耗：x/y/style）
          const num15 = 15;
          let px2 = 0, py2 = 0, placed = false;
          for (let n = 0; n < num15 * num15; n++) {
            px2 = i + rng.int(-num15, num15);
            py2 = j + rng.int(-num15, num15);
            placePlate(st, px2, py2, rng.int(2, 3));                    // Next(2,4) style
            if (sheetOf(st.type[st.idx(px2, py2)]!) === PLATE_SHEET) { placed = true; break; }
          }
          if (placed) wireL(st, i, j, px2, py2);
        }
      }
      // ---- (C) 467 → 141 炸药埋点（cs:26355-26448；else j++ 跳列） ----
      if (sh === 467 && (!nf.tenthAnniversary || nf.remix)) {
        const num8 = 8;
        for (let q = 0; q < num8 * num8; q++) {
          const ex = i + rng.int(-num8, num8);
          const ey = j + rng.int(-num8, num8);
          const et = sheetOf(st.type[st.idx(ex, ey)]!);
          if (!(et === 0 || et === 1 || ORE_SHEETS.has(et) || et === 59 || et === 151)) continue;
          let solid = true;
          for (let a = ex - 1; a <= ex + 1 && solid; a++) {
            for (let b = ey - 1; b <= ey + 1; b++) {
              if (!solidTileF(st, a, b)) { solid = false; break; }
            }
          }
          if (!solid) continue;
          const ei = st.idx(ex, ey);
          st.type[ei] = T141;
          st.frameX[ei] = 0; st.frameY[ei] = 0;
          st.slope[ei] = 0; st.half[ei] = 0;
          // TileFrame(ex,ey,resetFrame:true)（cs:26417）——Check1x1 无地基可杀
          genTileFrameSafe(st, rng, ex, ey);
          if (sheetOf(st.type[ei]!) !== 141) continue;                  // cs:26421-26423
          wireL(st, i, j, ex, ey);
          break;
        }
      } else {
        j++;                                                            // cs:26449 else j++（105 跳列）
      }
    }
  }
  setBoulderSolidity(true);                                           // cs:26453
  // ---- (D) 残存无线 467@fx144/fy0 → 金箱 21@fx36/54（cs:26455-26475） ----
  for (let x = 20; x < w - 20; x++) {
    for (let y = 20; y < h - 20; y++) {
      const di = st.idx(x, y);
      if (!st.flags[di] || sheetOf(st.type[di]!) !== 467) continue;
      if (st.frameX[di] !== 144 || st.frameY[di] !== 0) continue;
      if ((st.wire[st.idx(x, y)] & WIRE_RED) || (st.wire[st.idx(x + 1, y)] & WIRE_RED)
        || (st.wire[st.idx(x, y + 1)] & WIRE_RED) || (st.wire[st.idx(x + 1, y + 1)] & WIRE_RED)) continue;
      st.type[st.idx(x, y)] = T21; st.frameX[st.idx(x, y)] = 36;
      st.type[st.idx(x + 1, y)] = T21; st.frameX[st.idx(x + 1, y)] = 54;
      st.type[st.idx(x, y + 1)] = T21; st.frameX[st.idx(x, y + 1)] = 36;
      st.type[st.idx(x + 1, y + 1)] = T21; st.frameX[st.idx(x + 1, y + 1)] = 54;
    }
  }
  // ---- (E) 每箱 1/15 塞 5346 Gas Trap（cs:26477-26492） ----
  const gasId = vid(5346);
  for (const c of chests) {
    if (rng.int(0, 14) !== 0) continue;                                 // Next(15)!=0（掷照耗）
    if (gasId < 0) continue;                                            // 未注册防御（现注册,不触发）
    const items = c.items;
    if (!items[1] || items[1].stack === 0) continue;                    // item[1].stack==0 跳过
    for (let q = 1; q < 20; q++) {
      const cur = q < items.length ? items[q]! : null;
      if (!cur || cur.stack === 0) { items[q] = { id: gasId, stack: 1 }; break; }
    }
  }
}

/** TileFrame 单格生成期入口（FinalCleanupPass.genTileFrame = TileFrame(resetFrame:true) 字面包装） */
function genTileFrameSafe(st: TileStore, rng: RNG, x: number, y: number): void {
  genTileFrame(st, rng, x, y);
}
