// 原版 pass 37 "Clean Up Dirt"(L6873)移植:
// 1) 表层天然墙清理:地表以上暴露区的土/雪/丛林/蜂巢墙(2/40/64/86)清除(含左右 ±3 邻列,±2/3 各 50%);
// 2) ScanTileColumnAndRemoveClumps(L4141):逐列找竖向连续 < tileCounterMax(20) 的可清实心段,
//    连通块总 size < 20 则整块移除(消灭浮空散块)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_DEFS } from '../../../data/tiles';

const TILE_COUNTER_MAX = 20;

export function runCleanupPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  // 1) 表层墙清理(左右各扫一遍,原版 L6877-6938 简化保留语义)
  for (let dir = 0; dir < 2; dir++) {
    for (let n = 0; n < w - 6; n++) {
      const x = dir === 0 ? n + 3 : w - 6 - n;
      let open = true;
      for (let y = 0; y < gs.worldSurface; y++) {
        if (open) {
          clearNaturalWall(st, x, y);
          if (st.type[st.idx(x, y)] !== T.SAND) {
            clearNaturalWall(st, x - 1, y);
            if (rng.next() < 0.5) clearNaturalWall(st, x - 2, y);
            if (rng.next() < 0.5) clearNaturalWall(st, x - 3, y);
            clearNaturalWall(st, x + 1, y);
            if (rng.next() < 0.5) clearNaturalWall(st, x + 2, y);
            if (rng.next() < 0.5) clearNaturalWall(st, x + 3, y);
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
  // 2) 连通小块清除(< 20)
  for (let x = 5; x < w - 5; x++) scanTileColumnAndRemoveClumps(st, x);
}

function clearNaturalWall(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const wl = st.wall[st.idx(x, y)];
  if (wl === 2 || wl === 40 || wl === 64 || wl === 86) st.wall[st.idx(x, y)] = 0;
}

/** 可被生成期清除的实心块(关键物块 fw/fh 不算) */
function clearable(st: TileStore, i: number): boolean {
  const d = TILE_DEFS[st.type[i]];
  if (!d) return false;
  if (d.vanilla?.fw || d.vanilla?.fh) return false;
  return !!d.solid;
}

function scanTileColumnAndRemoveClumps(st: TileStore, x: number): void {
  const { h } = st;
  let run = 0, runY = 0;
  for (let y = 10; y < h - 10; y++) {
    const i = st.idx(x, y);
    if (st.flags[i] && TILE_DEFS[st.type[i]]?.solid && clearable(st, i)) {
      if (run === 0) runY = y;
      run++;
    } else {
      if (run > 0 && run < TILE_COUNTER_MAX) {
        // 连通块计数(BFS,cap 20)
        if (tileCounter(st, x, runY) < TILE_COUNTER_MAX) tileCounterKill(st);
      }
      run = 0;
    }
  }
}

const _cx = new Int32Array(TILE_COUNTER_MAX);
const _cy = new Int32Array(TILE_COUNTER_MAX);
let _cn = 0;

function tileCounter(st: TileStore, x: number, y: number): number {
  _cn = 0;
  tileCounterNext(st, x, y);
  return _cn;
}

function tileCounterNext(st: TileStore, x: number, y: number): void {
  if (_cn >= TILE_COUNTER_MAX || x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return;
  const i = st.idx(x, y);
  if (!st.flags[i] || !TILE_DEFS[st.type[i]]?.solid || !clearable(st, i)) return;
  for (let k = 0; k < _cn; k++) {
    if (_cx[k] === x && _cy[k] === y) return;
  }
  _cx[_cn] = x; _cy[_cn] = y; _cn++;
  tileCounterNext(st, x - 1, y);
  tileCounterNext(st, x + 1, y);
  tileCounterNext(st, x, y - 1);
  tileCounterNext(st, x, y + 1);
}

function tileCounterKill(st: TileStore): void {
  for (let k = 0; k < _cn; k++) {
    const i = st.idx(_cx[k], _cy[k]);
    st.flags[i] = 0;
    st.type[i] = 0;
  }
}
