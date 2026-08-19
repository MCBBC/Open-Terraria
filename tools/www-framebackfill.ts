// RRRR 批探针基建：WWW 重放混合基座的帧回填（相位感知）。
// 问题：金标 dump 无帧通道；/tmp/www-b 边界 frames 只覆盖 JS 管线写过的格。
// 两个极端都被实证否决：
//  - 全信边界：捕获管线与金标局部错位（#77 陶罐 45% 覆盖，混合帧自相矛盾）；
//  - 全几何回填：把捕获期可信帧（#59 洞穴房 187 覆盖 97.5%）也抹掉——样式带门
//    （187 styles 0-5/6-8/29-34）与 26 祭坛尘掷门（frameX<54）全部失真。
// 方案（相位感知）：连通 run 内若有覆盖格，用其帧推导盒相位（x0 ≡ x-(fx/18%w)）
// 与样式，run 内未覆盖格按此相位回填；覆盖格保留边界帧；无覆盖格的 run 右/下锚
// 切瓦。165 钟乳按支撑定 hang/stand 与 biome style；185 小堆一律 1x1。
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** 2x2 盒族（CheckPot 28/653、CheckSuper 485/376/443/444） */
const BOX2 = new Set([28, 653, 485, 376, 443, 444]);
/** 3x2 盒族（Check3x2 全 case 族；26/695 保持 style0——尘掷门 frameX<54） */
const BOX3X2 = new Set([14, 17, 26, 77, 86, 87, 88, 89, 114, 133, 186, 187, 215, 217, 218, 237, 244, 285, 286, 298, 299, 310, 339, 361, 362, 363, 364, 377, 469, 532, 533, 538, 544, 555, 556, 582, 619, 629, 695]);
/** 3x3 墙画族（Check3x3Wall 240/440） */
const BOX3W = new Set([240, 440]);
/** 1x3 门族 */
const DOOR = new Set([10, 11]);
/** 垂挂/立柱族（165/693/694：1-2 格竖排） */
const STALACTITE = new Set([165, 693, 694]);
/** 185 小堆：一律按 1x1（fy=0）——边界帧失真（捕获期 2x1 vs 金标 1x1）伪杀须消除 */
const SMALLPILE = new Set([185, 649]);
/** getDesiredStalagtiteStyle 支撑表（ShimmerPass 同源副本——禁 import） */
const MOSS_SHEETS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
const styleForSup = (sup: number, wall: number, hang2: boolean): number => {
  if (sup === 1 || MOSS_SHEETS.has(sup)) return hang2 && wall === 62 ? 11 : 0;
  if (sup === 200) return 10;
  if (sup === 164) return 8;
  if (sup === 163) return 9;
  if (sup === 117 || sup === 402 || sup === 403) return 1;
  if (sup === 25 || sup === 398 || sup === 400) return 2;
  if (sup === 203 || sup === 399 || sup === 401) return 3;
  if (sup === 396 || sup === 397) return 4;
  if (sup === 367) return 6;
  if (sup === 368) return 5;
  if (sup === 147 || sup === 161) return 7;
  return -1;
};
/** ShimmerPass FX_BASE_BY_STYLE 同源副本 */
const FX_BASE_BY_STYLE = [54, 216, 270, 324, 378, 432, 486, 0, 540, 594, 648, 108, 162];

export function backfillHybridFrames(st: TileStore, covered?: Uint8Array): void {
  const isCov = covered ?? new Uint8Array(st.w * st.h);   // 缺省=全未覆盖（纯几何模式）
  const sheetOf = (x: number, y: number): number => {
    if (!st.inBounds(x, y)) return -1;
    const i = st.idx(x, y);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  const solidish = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return st.flags[i] !== 0 && !!TILE_DEFS[st.type[i]]?.solid;
  };
  const supSheet = (x: number, y: number): number => {
    if (!st.inBounds(x, y)) return -1;
    const i = st.idx(x, y);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const sh = SHEET[st.type[i]];
      if (sh < 0) continue;
      if (SMALLPILE.has(sh)) {
        // 185 无条件 1x1（含覆盖格）：边界帧系捕获期历史（金标 1x1 被记 2x1 →
        // CheckPile 走 2x1 分支误杀搭档，#77 (1250,744) 实证）
        st.frameX[i] = 0;
        st.frameY[i] = 0;
        continue;
      }
      if (STALACTITE.has(sh)) {
        // 165 全几何（含覆盖格）：放置 pass 在槽 53 前（不在尾链），边界帧系捕获
        // 期历史不可信；几何 style=biome 收敛值——实测 restype 掷零分歧（s9 流）
        const up = sheetOf(x, y - 1) === sh;
        let fy: number, supY: number, hang2 = false;
        if (!up) {
          fy = solidish(x, y - 1) ? 72 : 90;
          supY = fy === 72 ? y - 1 : y + 1;
        } else {
          const hang = solidish(x, y - 2);
          fy = hang ? 18 : 54;
          hang2 = hang;
          supY = hang ? y - 2 : y + 1;
        }
        const style = styleForSup(supSheet(x, supY), st.wall[i]!, hang2);
        const fx = style >= 0 ? FX_BASE_BY_STYLE[style]! : 0;
        st.frameY[i] = fy;
        st.frameX[i] = fx;
        if (up) {
          const ti = st.idx(x, y - 1);
          st.frameY[ti] = hang2 ? 0 : 36;
          st.frameX[ti] = fx;
        }
        continue;
      }
      let w = 2, h = 2;
      if (BOX2.has(sh)) { w = 2; h = 2; }
      else if (BOX3X2.has(sh)) { w = 3; h = 2; }
      else if (BOX3W.has(sh)) { w = 3; h = 3; }
      else if (DOOR.has(sh)) { w = 1; h = 3; }
      else continue;
      // 信任分裂：陶罐 28/653 与 485 的边界帧覆盖 45%/91% 且与金标几何矛盾
      // （(2846,697) 失真实证）→ 全几何（实测 12/12 罐杀精确）；186/187/26 覆盖
      // 97%+（#59 洞穴房写侧）→ 相位感知（保留覆盖帧+带门/尘掷门语义）
      const phaseAware = (BOX3X2.has(sh) && sh !== 186 && sh !== 187) || BOX3W.has(sh) || DOOR.has(sh);
      if (phaseAware && isCov[i]) continue;         // 覆盖格保留边界帧
      // 横向 run：相位优先取覆盖格 frameX，否则右锚
      let runStart = x, runEnd = x;
      while (sheetOf(runStart - 1, y) === sh) runStart--;
      while (sheetOf(runEnd + 1, y) === sh) runEnd++;
      let phaseX: number | null = null;
      let styleX = 0;
      if (phaseAware) {
        for (let cx = runStart; cx <= runEnd; cx++) {
          const ci = st.idx(cx, y);
          if (isCov[ci]) {
            const fx = st.frameX[ci]!;
            const col = ((Math.floor(fx / 18) % w) + w) % w;
            phaseX = ((cx - col) % w + w) % w;      // run 内 x≡phaseX（mod w）为盒左列
            styleX = Math.floor(fx / (18 * w));
            break;
          }
        }
      }
      let x0: number;
      if (phaseX !== null) {
        x0 = x - (((x - phaseX) % w) + w) % w;
      } else {
        x0 = runEnd - Math.floor((runEnd - x) / w) * w - w + 1;
        styleX = sh === 186 || sh === 187 ? 9 : 0;  // 无门带 + <864 免金币掷
      }
      // 纵向 run：右/下锚（竖排邻接罕见；门/3x3 竖排可信）
      let runY = y;
      while (sheetOf(x, runY + 1) === sh) runY++;
      const y0 = runY - Math.floor((runY - y) / h) * h - h + 1;
      st.frameX[i] = (x - x0) * 18 + styleX * w * 18;
      st.frameY[i] = (y - y0) * 18;
    }
  }
}
