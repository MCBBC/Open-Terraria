// 原版 HellFort(L16550-16930)1:1 移植。
// 5 列(左右界数组,列宽 8-20/中央 ±4-10)× 10 行(层高 6-12)房间网格塔;
// 占用 = 2 轮侧翼(1/3 概率,双列同行标记 + 单列随机走)+ 中央列 [num1..num2] 跨度;
// 边缘格实心砖(75 黑曜石 4/5 或 76 狱石),内部墙(14/13)+清空;
// 门 style19(列间 1/3 + 左右外门)/平台 style13(层间 + 顶层口);恶魔火把独立 pass(L16095)。
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
      hellFort(st, rng, i, j, tileType, wallType);
    }
    i += rng.int(30, 129);
    if (rng.next() < 0.1) i += rng.int(0, 199);
  }
  // ---- 恶魔火把(L16095-16136):200×(w/4200) 个,贴砖放置,±8 内无其他火把 ----
  const torchCount = Math.floor(200 * Math.floor(w / 4200));
  for (let n = 0; n < torchCount; n++) {
    let tries = 0, placed = false;
    while (!placed) {
      tries++;
      const x = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);
      const y = rng.int(h - 300, h - 21);
      if (!st.inBounds(x, y)) { if (tries > 1000) break; continue; }
      const ti = st.idx(x, y);
      if (!st.flags[ti] || (st.type[ti] !== OBS_BRICK && st.type[ti] !== HELL_BRICK)) {
        if (tries > 1000) break; else continue;
      }
      let side = 0;
      if (st.inBounds(x - 1, y) && st.wall[st.idx(x - 1, y)] > 0) side = -1;
      else if (st.inBounds(x + 1, y) && st.wall[st.idx(x + 1, y)] > 0) side = 1;
      if (side === 0) { if (tries > 1000) break; else continue; }
      if (st.flags[st.idx(x + side, y)] || st.flags[st.idx(x + side, y + 1)]) {
        if (tries > 1000) break; else continue;
      }
      let near = false;
      for (let ix = x - 8; ix < x + 8 && !near; ix++) {
        for (let iy = y - 8; iy < y + 8; iy++) {
          if (st.inBounds(ix, iy) && st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] === TORCH) { near = true; break; }
        }
      }
      if (near) { if (tries > 1000) break; else continue; }
      st.setTileSilent(x + side, y, TORCH, 7 * 36, 0);
      placed = true;
    }
  }
  void gs;
}

function hellFort(st: TileStore, rng: RNG, i: number, j: number, tileType: number, wallType: number): void {
  const { w, h } = st;
  const hellTop = h - 200;
  // ---- 列左右界(cs L16563-16572):中央 ±4-9,其余依次外扩 8-19 ----
  const colL = new Array<number>(5), colR = new Array<number>(5);
  colL[2] = i - rng.int(4, 9);
  colR[2] = i + rng.int(4, 9);
  colL[3] = colR[2]; colR[3] = colL[3] + rng.int(8, 19);
  colL[4] = colR[3]; colR[4] = colL[4] + rng.int(8, 19);
  colR[1] = colL[2]; colL[1] = colR[1] - rng.int(8, 19);
  colR[0] = colL[1]; colL[0] = colR[0] - rng.int(8, 19);
  // ---- 行上下界(cs L16575-16586):层高 6-11,行 3 锚定 j ----
  const rowT = new Array<number>(10), rowB = new Array<number>(10);
  rowT[3] = j - rng.int(6, 11); rowB[3] = j;
  for (let r = 4; r < 10; r++) { rowT[r] = rowB[r - 1]; rowB[r] = rowT[r] + rng.int(6, 11); }
  for (let r = 2; r >= 0; r--) { rowB[r] = rowT[r + 1]; rowT[r] = rowB[r] - rng.int(6, 11); }
  // ---- 占用网格(cs L16587-16640):2 轮各两个 1/3 翼 ----
  const occ: boolean[][] = Array.from({ length: 5 }, () => new Array(10).fill(false));
  let hasLWing = false, hasRWing = false;
  let spanLo = 3, spanHi = 3;
  for (let round = 0; round < 2; round++) {
    if (rng.int(0, 2) === 0) {
      hasLWing = true;
      let r = rng.int(0, 9);
      if (r < spanLo) spanLo = r;
      if (r > spanHi) spanHi = r;
      let wingCol = 1;
      if (rng.int(0, 1) === 0) { occ[0][r] = true; occ[1][r] = true; wingCol = 0; }
      else occ[1][r] = true;
      let dir = rng.int(0, 1); if (dir === 0) dir = -1;
      for (let steps = rng.int(0, 9); steps > 0 && r >= 0 && r < 10; r += dir) occ[wingCol][r] = true;
    }
    if (rng.int(0, 2) === 0) {
      hasRWing = true;
      let r = rng.int(0, 9);
      if (r < spanLo) spanLo = r;
      if (r > spanHi) spanHi = r;
      let wingCol = 3;
      if (rng.int(0, 1) === 0) { occ[3][r] = true; occ[4][r] = true; wingCol = 4; }
      else occ[3][r] = true;
      let dir = rng.int(0, 1); if (dir === 0) dir = -1;
      for (let steps = rng.int(0, 9); steps > 0 && r >= 0 && r < 10; r += dir) occ[wingCol][r] = true;
    }
  }
  // ---- 列合法性(cs L16641-16662):出界或地狱层已有墙 → 整列弃用 ----
  for (let c = 0; c < 5; c++) {
    let bad = false;
    if (colL[c] < 10 || colL[c] > w - 10) bad = true;
    else {
      for (let y = hellTop; y < h; y++) {
        if (st.inBounds(colL[c], y) && st.wall[st.idx(colL[c], y)] > 0) { bad = true; break; }
      }
    }
    if (bad) for (let r = 0; r < 10; r++) occ[c][r] = false;
  }
  // ---- 中央列跨度(cs L16663-16682)----
  let n4 = rng.int(0, 9); if (n4 < spanLo) spanLo = n4;
  let n5 = rng.int(0, 9); if (n5 > spanHi) spanHi = n5;
  if (!hasLWing && !hasRWing) {
    let guard = 0;
    while (spanHi - spanLo < 5 && guard++ < 1000) {
      const a = rng.int(0, 9); if (a < spanLo) spanLo = a;
      const b = rng.int(0, 9); if (b > spanHi) spanHi = b;
    }
  }
  for (let r = spanLo; r <= spanHi; r++) occ[2][r] = true;
  // ---- 越界单元清除(cs L16683-16690)----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (occ[c][r] && (rowT[r] < hellTop || rowB[r] > h - 20)) occ[c][r] = false;
    }
  }
  // ---- 绘制(cs L16691-16718):四边实心砖,内部墙+清空 ----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      for (let x = colL[c]; x <= colR[c]; x++) {
        if (x < 10 || x > w - 10) continue;
        for (let y = rowT[r]; y <= rowB[r]; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (x === colL[c] || x === colR[c] || y === rowT[r] || y === rowB[r]) {
            st.type[ti] = tileType; st.flags[ti] = 1;
          } else {
            st.wall[ti] = wallType;
            st.type[ti] = 0; st.flags[ti] = 0;
          }
        }
      }
    }
  }
  // ---- 列间门 style19(cs L16719-16748):每个列对随机选一个共占行开 3 高门洞 ----
  for (let c = 0; c < 4; c++) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r] && occ[c + 1][r]) { rows[r] = true; any = true; }
    }
    while (any) {
      const r = rng.int(0, 9);
      if (rows[r]) {
        any = false;
        for (let k = 1; k <= 3; k++) {
          const y = rowB[r] - k;
          if (!st.inBounds(colR[c], y)) continue;
          const ti = st.idx(colR[c], y);
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = wallType;
        }
        if (st.inBounds(colR[c], rowB[r] - 1)) {
          st.setTileSilent(colR[c], rowB[r] - 1, DOOR, 19 * 54, 0);
        }
      }
    }
  }
  // ---- 层间平台口 + 列间 1/3 门(cs L16749-16792)----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      if (r > 0 && occ[c][r - 1]) {
        // 平台口:列内 x 跨度 2-5
        let x1 = rng.int(colL[c] + 2, colR[c] - 2);
        let x2 = rng.int(colL[c] + 2, colR[c] - 2);
        let tries = 0;
        while ((x2 - x1 < 2 || x2 - x1 > 5) && tries <= 10000) {
          x1 = rng.int(colL[c] + 2, colR[c] - 2);
          x2 = rng.int(colL[c] + 2, colR[c] - 2);
          tries++;
        }
        if (tries <= 10000) {
          for (let x = x1; x <= x2; x++) {
            if (x < 20 || x > w - 20 || !st.inBounds(x, rowT[r])) continue;
            const ti = st.idx(x, rowT[r]);
            st.type[ti] = 0; st.flags[ti] = 0;
            st.setTileSilent(x, rowT[r], PLATFORM, 0, 13 * 18);
            st.wall[ti] = wallType;
          }
        } else break;
      }
      if (c < 4 && occ[c + 1][r] && rng.int(0, 2) === 0) {
        for (let k = 1; k <= 3; k++) {
          const y = rowB[r] - k;
          if (!st.inBounds(colR[c], y)) continue;
          const ti = st.idx(colR[c], y);
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = wallType;
        }
        if (st.inBounds(colR[c], rowB[r] - 1)) {
          st.setTileSilent(colR[c], rowB[r] - 1, DOOR, 19 * 54, 0);
        }
      }
    }
  }
  // ---- 左外门(cs L16793-16832):最左占用列,外侧 3 格空且无液 ----
  for (let c = 0; c < 5; c++) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r]) { rows[r] = true; any = true; }
    }
    if (any) {
      let ok = false;
      for (let r = 0; r < 10; r++) {
        if (!rows[r]) continue;
        const x = colL[c] - 1;
        if (x < 1) { rows[r] = false; continue; }
        if (!st.flags[st.idx(x, rowB[r] - 1)] && !st.flags[st.idx(x, rowB[r] - 2)] && !st.flags[st.idx(x, rowB[r] - 3)]
          && st.liquid[st.idx(x, rowB[r] - 1)] === 0 && st.liquid[st.idx(x, rowB[r] - 2)] === 0
          && st.liquid[st.idx(x, rowB[r] - 3)] === 0) ok = true;
        else rows[r] = false;
      }
      while (ok) {
        const r = rng.int(0, 9);
        if (rows[r]) {
          ok = false;
          for (let k = 1; k <= 3; k++) {
            const y = rowB[r] - k;
            if (!st.inBounds(colL[c], y)) continue;
            const ti = st.idx(colL[c], y);
            st.type[ti] = 0; st.flags[ti] = 0;
          }
          if (st.inBounds(colL[c], rowB[r] - 1)) {
            st.setTileSilent(colL[c], rowB[r] - 1, DOOR, 19 * 54, 0);
          }
        }
      }
      break;
    }
  }
  // ---- 右外门(cs L16833-16877):最右占用列 ----
  for (let c = 4; c >= 0; c--) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r]) { rows[r] = true; any = true; }
    }
    if (any) {
      let ok = false;
      for (let r = 0; r < 10; r++) {
        if (!rows[r]) continue;
        const x = colR[c] + 1;
        if (x > w - 2) { rows[r] = false; continue; }
        if (!st.flags[st.idx(x, rowB[r] - 1)] && !st.flags[st.idx(x, rowB[r] - 2)] && !st.flags[st.idx(x, rowB[r] - 3)]
          && st.liquid[st.idx(x, rowB[r] - 1)] === 0 && st.liquid[st.idx(x, rowB[r] - 2)] === 0
          && st.liquid[st.idx(x, rowB[r] - 3)] === 0) ok = true;
        else rows[r] = false;
      }
      while (ok) {
        const r = rng.int(0, 9);
        if (rows[r]) {
          ok = false;
          for (let k = 1; k <= 3; k++) {
            const y = rowB[r] - k;
            if (!st.inBounds(colR[c], y)) continue;
            const ti = st.idx(colR[c], y);
            st.type[ti] = 0; st.flags[ti] = 0;
          }
          if (st.inBounds(colR[c], rowB[r] - 1)) {
            st.setTileSilent(colR[c], rowB[r] - 1, DOOR, 19 * 54, 0);
          }
        }
      }
      break;
    }
  }
  // ---- 顶层平台口(cs L16878-16929):最上占用行,列内 2-5 跨,上方须净空 ----
  for (let r = 0; r < 10; r++) {
    const cols: boolean[] = new Array(5).fill(false);
    let any = false;
    for (let c = 0; c < 5; c++) {
      if (occ[c][r]) { cols[c] = true; any = true; }
    }
    if (any) {
      let searching = true;
      while (searching) {
        const c = rng.int(0, 4);
        if (cols[c]) {
          let x1 = rng.int(colL[c] + 2, colR[c] - 2);
          let x2 = rng.int(colL[c] + 2, colR[c] - 2);
          let tries = 0;
          while ((x2 - x1 < 2 || x2 - x1 > 5) && tries <= 10000) {
            x1 = rng.int(colL[c] + 2, colR[c] - 2);
            x2 = rng.int(colL[c] + 2, colR[c] - 2);
            tries++;
          }
          if (tries > 10000) break;
          let clear = true;
          for (let x = x1; x <= x2; x++) {
            if (x < 10 || x > w - 10 || !st.inBounds(x, rowT[r] - 1)) continue;
            const ti = st.idx(x, rowT[r] - 1);
            if (st.flags[ti] || st.liquid[ti] > 0) { clear = false; break; }
          }
          if (clear) {
            for (let x = x1; x <= x2; x++) {
              if (x < 10 || x > w - 10 || !st.inBounds(x, rowT[r])) continue;
              const ti = st.idx(x, rowT[r]);
              st.type[ti] = 0; st.flags[ti] = 0;
              st.setTileSilent(x, rowT[r], PLATFORM, 0, 13 * 18);
            }
          }
          searching = false;
        }
      }
      break;
    }
  }
}
