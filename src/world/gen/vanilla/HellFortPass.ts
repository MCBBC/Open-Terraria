// 原版 HellFort(L16550-16930)1:1 移植(算法文档 docs/vanilla-algos/island-house-hellfort-chasm-sword.md)。
// 外形 = 5 列 × 10 行"房间网格塔":列2 在 i±Next(4,10),其余列依次外扩 Next(8,20);
// 行距 Next(6,12);中央列必然全占(垂直主塔);2 轮各 1/3 概率上侧翼(列0-1)/下侧翼(列3-4)。
// 边缘格实心砖(75 黑曜石 4/5 或 76 狱石),内部墙(14/13)+清空;黑曜石门(style19)/平台(style13)/恶魔火把。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY } from '../../../data/tiles';

const OBS_BRICK = TILE_BY_KEY['v_75_obsidian_brick']!;
const HELL_BRICK = TILE_BY_KEY['v_76_obsidian_brick'] ?? OBS_BRICK;
const DOOR = TILE_BY_KEY['door_closed']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const TORCH = TILE_BY_KEY['torch']!;

export function runHellFortPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const hellTop = h - 200;
  if (hellTop >= h - 60) return;
  // AddHellHouses(L16068):中间 50% 扫描,上空下实地表;放完 i += Next(30,130)
  let i = Math.floor(w * 0.25);
  const endX = Math.floor(w * 0.75);
  while (i < endX - 30) {
    // 找落点:从 h-40 向上找"上空下实"
    let j = -1;
    for (let y = h - 40; y > hellTop; y--) {
      if (!st.flags[st.idx(i, y)] && st.liquid[st.idx(i, y)] === 0 && st.flags[st.idx(i, y + 1)]) { j = y; break; }
    }
    if (j > 0) {
      const tileType = rng.next() < 0.8 ? OBS_BRICK : HELL_BRICK;
      const wallType = tileType === OBS_BRICK ? 14 : 13;
      hellFort(st, rng, gs, i, j, tileType, wallType);
    }
    i += rng.int(30, 129);
    if (rng.next() < 0.1) i += rng.int(0, 199);
  }
}

function hellFort(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, tileType: number, wallType: number): void {
  const { w, h } = st;
  // ---- 列位置:5 列 ----
  const colX: number[] = new Array(5);
  colX[2] = i + (rng.next() < 0.5 ? -1 : 1) * rng.int(4, 9);
  colX[3] = colX[2] + rng.int(8, 19);
  colX[4] = colX[3] + rng.int(8, 19);
  colX[1] = colX[2] - rng.int(8, 19);
  colX[0] = colX[1] - rng.int(8, 19);
  // ---- 行位置:10 层 ----
  const rowY: number[] = new Array(10);
  rowY[3] = j - rng.int(6, 11);
  for (let r = 4; r < 10; r++) rowY[r] = rowY[r - 1] + rng.int(6, 11);
  for (let r = 2; r >= 0; r--) rowY[r] = rowY[r + 1] - rng.int(6, 11);
  // ---- 占用网格 ----
  const occ: boolean[][] = Array.from({ length: 5 }, () => new Array(10).fill(false));
  // 中央列:必占(垂直主塔,行 0..9 大段)
  const cTop = 0, cBot = 9;
  for (let r = cTop; r <= cBot; r++) occ[2][r] = true;
  // 两轮侧翼
  for (let round = 0; round < 2; round++) {
    if (rng.next() >= 1 / 3) continue;
    const upper = rng.next() < 0.5;
    const cols = upper ? [0, 1] : [3, 4];
    const startRow = rng.int(0, 5);
    for (const c of cols) {
      let run = rng.int(1, 9);
      for (let r = startRow; r < 10 && run-- > 0; r++) occ[c][r] = true;
    }
  }
  // ---- 绘制 ----
  for (let c = 0; c < 5; c++) {
    if (colX[c] < 10 || colX[c] > w - 10) continue;
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      if (rowY[r] < gs.lavaLine - 190 || rowY[r] > h - 20) continue;
      // 单元格:该列 x,从 rowY[r] 到 rowY[r+1](末行 +6)
      const y0 = rowY[r];
      const y1 = r < 9 ? rowY[r + 1] : rowY[r] + 6;
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(colX[c], y)) continue;
        const ci = st.idx(colX[c], y);
        st.liquid[ci] = 0;
        // 边缘(上下端)实心,内部墙+清空
        const edge = y === y0 || y >= y1 - 1;
        if (edge) {
          st.type[ci] = tileType; st.flags[ci] = 1;
        } else {
          st.type[ci] = 0; st.flags[ci] = 0;
          st.wall[ci] = wallType;
        }
      }
      // 横向:该格向相邻列延伸(填该行高度的地板/天花板)——简化:每格向两侧延伸 2 格
      for (const dx of [-2, 2]) {
        for (let y = y0; y < y1; y++) {
          const x = colX[c] + dx;
          if (!st.inBounds(x, y)) continue;
          const ci = st.idx(x, y);
          const edge = y === y0 || y >= y1 - 1;
          st.liquid[ci] = 0;
          if (edge) { st.type[ci] = tileType; st.flags[ci] = 1; }
          else { st.type[ci] = 0; st.flags[ci] = 0; st.wall[ci] = wallType; }
        }
      }
    }
  }
  // ---- 门(相邻列同行占用,3 高洞 + 黑曜石门 style19)----
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r] || !occ[c + 1][r] || rng.next() >= 0.5) continue;
      const dx = Math.floor((colX[c] + colX[c + 1]) / 2);
      const dy = rowY[r] + 2;
      if (!st.inBounds(dx, dy)) continue;
      for (let k = 1; k <= 3; k++) {
        const ci = st.idx(dx, dy - k + 1);
        if (st.inBounds(dx, dy - k + 1)) { st.type[ci] = 0; st.flags[ci] = 0; }
      }
      st.setTileSilent(dx, dy, DOOR, 19 * 54, 0);
      break;
    }
  }
  // ---- 平台口(style13):上下相邻层交界开 2-5 宽平台 ----
  for (let c = 0; c < 5; c++) {
    if (!occ[c][5]) continue;
    const y = rowY[5];
    const pw = rng.int(2, 5);
    for (let dx = 0; dx < pw; dx++) {
      const x = colX[c] + dx;
      if (!st.inBounds(x, y)) continue;
      st.setTileSilent(x, y, PLATFORM, 0, 13 * 18);
    }
    break;
  }
  // ---- 恶魔火把(tile4 style7):砖旁空位 ----
  for (let n = 0; n < 8; n++) {
    const tx = colX[2] + rng.int(-15, 15);
    const ty = rng.int(rowY[3], Math.min(h - 30, rowY[9]));
    if (!st.inBounds(tx, ty) || st.flags[st.idx(tx, ty)]) continue;
    if (!st.inBounds(tx, ty + 1) || !st.flags[st.idx(tx, ty + 1)]) continue;
    st.setTileSilent(tx, ty, TORCH, 7 * 36, 0);
  }
}
