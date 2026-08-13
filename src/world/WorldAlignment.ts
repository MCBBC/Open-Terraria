// 世界阵营占比与树妖世界状态对话（WorldGen.CountTiles/AddUpAlignmentCounts :71160-71296
// + Lang.GetDryadWorldStatusDialog :246-288 的 1:1 数据面）。
// 计数语义：地表段（y ∈ [40, worldSurface+1)）权重 ×5、地下段 ×1（:71201-71212 num7）；
// 阵营集（TileID.cs:325/333/343 CountCollection）——Corrupt{23,661,25,112,163,398,400,
// 636,24,32} / Hallow{109,492,117,116,164,402,403,115,110,113} / Crimson{199,662,203,
// 234,200,399,401,205,201,352}；solid 基底 = {2 草,477 高尔夫草,1 石,60 丛林草,53 沙,
// 161 冰}（TileID.cs:437/755/1387 实证——★泥土 0 不进基底，原版语义）+ 三阵营合计。
// 百分比 = round(count/solid*100) 钳 byte，>0 且取整为 0 时进位 1（:71168-71181）。
// ★ 与原版逐列 RLE 管线的差异：此处为对话打开时的一次性全图直扫（等价求值，
// 非增量 per-column 维护——tGood 系列原版运行时也不持久化，读取时机一致）。
import { TILE_DEFS } from '../data/tiles';
import { Lang } from '../i18n/Lang';

const CORRUPT = new Set([23, 661, 25, 112, 163, 398, 400, 636, 24, 32]);
const HALLOW = new Set([109, 492, 117, 116, 164, 402, 403, 115, 110, 113]);
const CRIMSON = new Set([199, 662, 203, 234, 200, 399, 401, 205, 201, 352]);
const SOLID_BASE = new Set([2, 477, 1, 60, 53, 161]);

export interface AlignmentPcts { tGood: number; tEvil: number; tBlood: number }

/** 阵营计数 → 百分比（CountTiles 尾段 :71168-71181） */
function toPct(count: number, solid: number): number {
  if (solid <= 0) return 0;
  let t = Math.round((count / solid) * 100);
  if (t === 0 && count > 0) t = 1;
  return Math.min(255, t);
}

/** 全图阵营扫描（CountTiles+AddUpAlignmentCounts 等价一次求值） */
export function alignmentPcts(st: { w: number; h: number; flags: Uint8Array; type: Uint16Array }, worldSurface: number): AlignmentPcts {
  let good = 0, evil = 0, blood = 0, solid = 0;
  const { w, h } = st;
  for (let x = 0; x < w; x++) {
    for (let y = 40; y < h - 40; y++) {
      const i = y * w + x;
      if (!st.flags[i]) continue;
      const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
      const weight = y < worldSurface + 1 ? 5 : 1;   // 地表段 ×5（:71205/:71211）
      if (HALLOW.has(sheet)) { good += weight; solid += weight; }
      else if (CORRUPT.has(sheet)) { evil += weight; solid += weight; }
      else if (CRIMSON.has(sheet)) { blood += weight; solid += weight; }
      else if (SOLID_BASE.has(sheet)) solid += weight;
    }
  }
  return { tGood: toPct(good, solid), tEvil: toPct(evil, solid), tBlood: toPct(blood, solid) };
}

/** Lang.GetDryadWorldStatusDialog（Lang.cs:246-288）1:1：返回 [文案, 是否完全纯净]。
 *  纯净判定 = tEvil/tBlood/tGood 全 0（:279-283）——对话文案 + 描述行拼接 */
export function dryadWorldStatus(p: AlignmentPcts, worldName: string): { text: string; pure: boolean } {
  const { tGood, tEvil, tBlood } = p;
  let text = '';
  let pure = false;
  if (tGood > 0 && tEvil > 0 && tBlood > 0) text = Lang.text('DryadSpecialText.WorldStatusAll', worldName, tGood, tEvil, tBlood);
  else if (tGood > 0 && tEvil > 0) text = Lang.text('DryadSpecialText.WorldStatusHallowCorrupt', worldName, tGood, tEvil);
  else if (tGood > 0 && tBlood > 0) text = Lang.text('DryadSpecialText.WorldStatusHallowCrimson', worldName, tGood, tBlood);
  else if (tEvil > 0 && tBlood > 0) text = Lang.text('DryadSpecialText.WorldStatusCorruptCrimson', worldName, tEvil, tBlood);
  else if (tEvil > 0) text = Lang.text('DryadSpecialText.WorldStatusCorrupt', worldName, tEvil);
  else if (tBlood > 0) text = Lang.text('DryadSpecialText.WorldStatusCrimson', worldName, tBlood);
  else if (tGood <= 0) {
    text = Lang.text('DryadSpecialText.WorldStatusPure', worldName);
    pure = true;
    return { text, pure };
  } else text = Lang.text('DryadSpecialText.WorldStatusHallow', worldName, tGood);
  // 描述行（:287）：平衡（good×1.2 ≥ evil+blood 且 good×0.8 ≤ evil+blood）/
  // 童话（good ≥ evil+blood）/冷酷（evil+blood > good+20）/接近（evil+blood ≤ 5）/其他
  const desc = (tGood * 1.2 >= tEvil + tBlood && tGood * 0.8 <= tEvil + tBlood)
    ? Lang.text('DryadSpecialText.WorldDescriptionBalanced')
    : (tGood >= tEvil + tBlood)
      ? Lang.text('DryadSpecialText.WorldDescriptionFairyTale')
      : (tEvil + tBlood > tGood + 20)
        ? Lang.text('DryadSpecialText.WorldDescriptionGrim')
        : (tEvil + tBlood <= 5)
          ? Lang.text('DryadSpecialText.WorldDescriptionClose')
          : Lang.text('DryadSpecialText.WorldDescriptionWork');
  return { text: `${text} ${desc}`, pure };
}
