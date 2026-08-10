import { T, TILE_BY_KEY } from '../../../data/tiles';
export function runIceBiomePass(st, rng, gs) {
    const { w, h } = st;
    gs.snowTop = gs.worldSurface;
    const num2 = gs.lavaLine - rng.int(160, 199); // 完整转换深度线
    let left = gs.snowOriginLeft, right = gs.snowOriginRight;
    let thickness = 10;
    // C# 是 int[]：边界与厚度全程整数、`/2` 为整除截断（cs L5408-5411）。
    // 曾用 Float32Array 浮点累积 → 边界逐行漂移、雪原范围与原版不符
    gs.snowMinX = new Int32Array(h);
    gs.snowMaxX = new Int32Array(h);
    const CORRUPT_GRASS = TILE_BY_KEY['v_23_corrupt_grass_block'];
    const CLAY = TILE_BY_KEY['clay'];
    const ICE = TILE_BY_KEY['ice'];
    for (let y = 0; y <= gs.lavaLine - 140; y++) {
        left += rng.int(-4, 3);
        right += rng.int(-3, 4);
        if (y > 0) {
            // C# int[] 整除截断（非负 → Math.floor 等价）
            left = Math.floor((left + gs.snowMinX[y - 1]) / 2);
            right = Math.floor((right + gs.snowMaxX[y - 1]) / 2);
        }
        // 雪原整体向地牢侧缓慢漂移
        if (gs.dungeonSide > 0) {
            if (rng.next() * 4 < 1) {
                left++;
                right++;
            }
        }
        else if (rng.next() * 4 < 1) {
            left--;
            right--;
        }
        gs.snowMinX[y] = left;
        gs.snowMaxX[y] = right;
        const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(w, Math.ceil(right));
        for (let x = x0; x < x1; x++) {
            if (y < num2) {
                const i = st.idx(x, y);
                // 原版只写 type 不激活——未激活格保持空气,跳过
                if (!st.flags[i])
                    continue;
                if (st.wall[i] === 2)
                    st.wall[i] = 40;
                const t = st.type[i];
                if (t === T.DIRT || t === T.GRASS || t === CORRUPT_GRASS || t === CLAY || t === T.SAND)
                    st.type[i] = T.SNOW;
                else if (t === T.STONE)
                    st.type[i] = ICE;
            }
            else {
                thickness += rng.int(-3, 3);
                if (rng.next() * 3 < 1) {
                    thickness += rng.int(-4, 4);
                    if (rng.next() * 3 < 1)
                        thickness += rng.int(-6, 6);
                }
                if (thickness < 0)
                    thickness = rng.int(0, 2);
                else if (thickness > 50)
                    thickness = 50 - rng.int(0, 2);
                for (let y2 = y; y2 < y + thickness && y2 < h; y2++) {
                    const i = st.idx(x, y2);
                    if (!st.flags[i])
                        continue;
                    if (st.wall[i] === 2)
                        st.wall[i] = 40;
                    const t = st.type[i];
                    if (t === T.DIRT || t === T.GRASS || t === CORRUPT_GRASS || t === CLAY || t === T.SAND)
                        st.type[i] = T.SNOW;
                    else if (t === T.STONE)
                        st.type[i] = ICE;
                }
            }
        }
        if (gs.snowBottom < y)
            gs.snowBottom = y;
    }
}
