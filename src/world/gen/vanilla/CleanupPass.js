import { T, TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
const TILE_COUNTER_MAX = 20;
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block'];
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block'];
export function runCleanupPass(st, rng, gs) {
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
                        if (rng.next() < 0.5)
                            clearWallSet(st, x - 2, y, [2, 40]);
                        if (rng.next() < 0.5)
                            clearWallSet(st, x - 3, y, [2, 40]);
                        clearWallSet(st, x + 1, y, [2, 40]);
                        if (rng.next() < 0.5)
                            clearWallSet(st, x + 2, y, [2, 40]);
                        if (rng.next() < 0.5)
                            clearWallSet(st, x + 3, y, [2, 40]);
                    }
                    if (st.flags[st.idx(x, y)])
                        open = false;
                }
                else {
                    // 重新开放判定:本格与下方 4 格、左右 2 格全无墙且上方 4 格无活性块
                    let reopen = true;
                    for (let dy = 0; dy <= 4 && reopen; dy++)
                        if (st.wall[st.idx(x, y + dy)] !== 0)
                            reopen = false;
                    for (const dx of [-2, -1, 1, 2])
                        if (st.wall[st.idx(x + dx, y)] !== 0)
                            reopen = false;
                    for (let dy = 0; dy <= 3 && reopen; dy++)
                        if (st.flags[st.idx(x, y + dy)])
                            reopen = false;
                    if (reopen)
                        open = true;
                }
            }
        }
    }
    // 2) 连通小块清除(< 20):扫描列范围 [10, w-10)(cs L5519-5521)
    for (let x = 10; x < w - 10; x++)
        scanTileColumnAndRemoveClumps(st, x);
}
function clearWallSet(st, x, y, set) {
    if (!st.inBounds(x, y))
        return false;
    const wl = st.wall[st.idx(x, y)];
    if (set.includes(wl)) {
        st.wall[st.idx(x, y)] = 0;
        return true;
    }
    return false;
}
/** 可被生成期清除的实心块(关键物块 fw/fh 不算) */
function clearable(st, i) {
    const d = TILE_DEFS[st.type[i]];
    if (!d)
        return false;
    if (d.vanilla?.fw || d.vanilla?.fh)
        return false;
    return !!d.solid;
}
function scanTileColumnAndRemoveClumps(st, x) {
    const { h } = st;
    let run = 0, runY = 0;
    for (let y = 10; y < h - 10; y++) {
        const i = st.idx(x, y);
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.solid && clearable(st, i)) {
            if (run === 0)
                runY = y;
            run++;
        }
        else {
            if (run > 0 && run < TILE_COUNTER_MAX) {
                // 连通块计数(BFS,cap 20)
                if (tileCounter(st, x, runY) < TILE_COUNTER_MAX)
                    tileCounterKill(st);
            }
            run = 0;
        }
    }
}
const _cx = new Int32Array(TILE_COUNTER_MAX);
const _cy = new Int32Array(TILE_COUNTER_MAX);
let _cn = 0;
function tileCounter(st, x, y) {
    _cn = 0;
    tileCounterNext(st, x, y);
    return _cn;
}
function tileCounterNext(st, x, y) {
    if (_cn >= TILE_COUNTER_MAX || x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5)
        return;
    const i = st.idx(x, y);
    if (!st.flags[i] || !TILE_DEFS[st.type[i]]?.solid || !clearable(st, i))
        return;
    for (let k = 0; k < _cn; k++) {
        if (_cx[k] === x && _cy[k] === y)
            return;
    }
    _cx[_cn] = x;
    _cy[_cn] = y;
    _cn++;
    tileCounterNext(st, x - 1, y);
    tileCounterNext(st, x + 1, y);
    tileCounterNext(st, x, y - 1);
    tileCounterNext(st, x, y + 1);
}
function tileCounterKill(st) {
    for (let k = 0; k < _cn; k++) {
        const i = st.idx(_cx[k], _cy[k]);
        st.flags[i] = 0;
        st.type[i] = 0;
    }
}
