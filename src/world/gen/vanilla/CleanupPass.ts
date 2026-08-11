// 原版 pass 37 "Clean Up Dirt"(L6873)移植:
// 1) 表层天然墙清理:地表以上暴露区的土/雪/丛林/蜂巢墙(2/40/64/86)清除(含左右 ±3 邻列,±2/3 各 50%);
// 2) ScanTileColumnAndRemoveClumps(L4141):逐列找竖向连续 < tileCounterMax(20) 的可清实心段,
//    连通块总 size < 20 则整块移除(消灭浮空散块)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';

const TILE_COUNTER_MAX = 20;
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block']!;
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block']!;

export function runCleanupPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  // 1) 表层墙清理两遍(cs L6877-6938):
  //    左→右(3..w-4):中央清 2/40/64/86;右→左(w-5..5):中央清 2/40/64(不重复清蜂巢墙)。
  //    邻列两遍都只清 2/40;沙系 tile(53/112/234,第二遍仅 53)跳过邻列清理
  for (let dir = 0; dir < 2; dir++) {
    const from = dir === 0 ? 3 : w - 5;
    const to = dir === 0 ? w - 4 : 5;
    for (let x = from; dir === 0 ? x <= to : x >= to; x += dir === 0 ? 1 : -1) {
      let open = true;
      for (let y = 0; y < gs.worldSurface; y++) {
        if (open) {
          clearWallSet(st, x, y, dir === 0 ? [2, 40, 64, 86] : [2, 40, 64]);
          const t = st.type[st.idx(x, y)];
          const isSand = dir === 0
            ? (t === T.SAND || t === EBONSAND || t === CRIMSAND)
            : t === T.SAND;
          if (!isSand) {
            if (clearWallSet(st, x - 1, y, [2, 40])) { /* 邻列 1 恒清 */ }
            if (rng.next() < 0.5) clearWallSet(st, x - 2, y, [2, 40]);
            if (rng.next() < 0.5) clearWallSet(st, x - 3, y, [2, 40]);
            clearWallSet(st, x + 1, y, [2, 40]);
            if (rng.next() < 0.5) clearWallSet(st, x + 2, y, [2, 40]);
            if (rng.next() < 0.5) clearWallSet(st, x + 3, y, [2, 40]);
          }
          if (st.flags[st.idx(x, y)]) open = false;
        } else {
          // 重新开放判定:本格与下方 4 格、左右 2 格全无墙且上方 4 格无活性块
          let reopen = true;
          for (let dy = 0; dy <= 4 && reopen; dy++) if (st.wall[st.idx(x, y + dy)] !== 0) reopen = false;
          for (const dx of [-2, -1, 1, 2]) if (st.wall[st.idx(x + dx, y)] !== 0) reopen = false;
          for (let dy = 0; dy <= 3 && reopen; dy++) if (st.flags[st.idx(x, y + dy)]) reopen = false;
          if (reopen) open = true;
        }
      }
    }
  }
  // 2) 散块清除已移至 MudCaves pass（1456 调用点 cs:12526—— DirtWallCleanup 只清墙；
  //    此前重复跑=双倍清除偏离原版，已删）
}

function clearWallSet(st: TileStore, x: number, y: number, set: number[]): boolean {
  if (!st.inBounds(x, y)) return false;
  const wl = st.wall[st.idx(x, y)];
  if (set.includes(wl)) { st.wall[st.idx(x, y)] = 0; return true; }
  return false;
}
