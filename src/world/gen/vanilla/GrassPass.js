import { T } from '../../../data/tiles';
export function runGrassPass(st, rng, gs) {
    const { w, h } = st;
    const count = (w * h) / 500;
    const isDirt = (x, y) => st.inBounds(x, y) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === T.DIRT;
    const seed = (x, y) => {
        if (isDirt(x - 1, y) && isDirt(x + 1, y) && isDirt(x, y - 1) && isDirt(x, y + 1)) {
            const i = st.idx(x, y);
            st.flags[i] = 1;
            st.type[i] = T.GRASS;
        }
    };
    for (let n = 0; n < count; n++) {
        const x1 = rng.int(1, w - 2);
        let y1 = rng.int(gs.worldSurfaceLow, Math.max(gs.worldSurfaceLow, gs.worldSurfaceHigh - 1));
        if (y1 >= h)
            y1 = h - 2;
        seed(x1, y1);
        const x2 = rng.int(1, w - 2);
        let y2 = rng.int(0, Math.max(1, gs.worldSurfaceLow - 1));
        if (y2 >= h)
            y2 = h - 2;
        seed(x2, y2);
    }
}
