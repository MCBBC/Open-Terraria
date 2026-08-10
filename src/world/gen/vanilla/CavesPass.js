import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner, digTunnel } from './TileRunner';
const DIRT = T.DIRT;
const CLAY = TILE_BY_KEY['clay'];
/** pass 8-10:泥石混合 + 粘土 */
export function runRocksAndClayPass(st, rng, gs) {
    const { w, h } = st;
    const area = w * h;
    const run = (count, yMin, yMax, type, sMin, sMax, stMin, stMax) => {
        for (let n = 0; n < count; n++) {
            tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(Math.max(0, Math.floor(yMin)), Math.min(h - 1, Math.floor(yMax))), {
                strength: rng.int(sMin, sMax), steps: rng.int(stMin, stMax), type,
            });
        }
    };
    // 8 Rocks In Dirt(L5178):三档密度带,石嵌泥
    run(area * 0.00015, 0, gs.worldSurfaceLow, T.STONE, 4, 14, 5, 39);
    for (let n = 0; n < area * 0.0002; n++) { // 中带:起点上方 10 格须为实心否则重掷一次
        const i = rng.int(0, w - 1);
        let j = rng.int(gs.worldSurfaceLow, gs.worldSurfaceHigh);
        if (!st.flags[st.idx(i, Math.max(0, j - 10))])
            j = rng.int(gs.worldSurfaceLow, gs.worldSurfaceHigh);
        tileRunner(st, rng, gs, i, j, { strength: rng.int(4, 9), steps: rng.int(5, 29), type: T.STONE });
    }
    run(area * 0.0045, gs.worldSurfaceHigh, gs.rockLevelHigh, T.STONE, 2, 6, 2, 22);
    // 9 Dirt In Rocks(L5203):泥嵌石
    run(area * 0.005, gs.rockLevelLow, h, DIRT, 2, 5, 2, 39);
    // 10 Clay(L5212):三带 + 表层粘土清除
    run(area * 0.00002, 0, gs.worldSurfaceLow - 1, CLAY, 4, 13, 10, 49);
    run(area * 0.00005, gs.worldSurfaceLow, gs.worldSurfaceHigh, CLAY, 8, 13, 15, 44);
    run(area * 0.00002, gs.worldSurfaceHigh, gs.rockLevelHigh, CLAY, 8, 14, 5, 49);
    for (let x = 5; x < w - 5; x++) {
        for (let y = 1; y < gs.worldSurface - 1; y++) {
            if (!st.flags[st.idx(x, y)])
                continue;
            for (let y2 = y; y2 < y + 5; y2++) {
                if (st.get(x, y2) === CLAY)
                    st.setTileSilent(x, y2, 0);
            }
            break;
        }
    }
}
/** pass 11-14:洞穴(小孔/泥土层/岩石层/地表入口) */
export function runCavesPass(st, rng, gs) {
    const { w, h } = st;
    const area = w * h;
    // 位置避让(cs:4733):beachSandRandomCenter(320)+20 = 340
    const avoidBeach = 340;
    // 11 Small Holes(L5238):每轮两个 runner,1/5 液体;
    // 避让:海滩 340 内且浅于 worldSurfaceHigh、或中部 45-55% 且浅于 worldSurface → 重掷
    for (let n = 0; n < area * 0.0015; n++) {
        const type = rng.next() * 5 < 1 ? -2 : -1;
        let x1 = rng.int(0, w - 1), y1 = rng.int(gs.worldSurfaceHigh, h - 1);
        for (let a = 0; a < 40 && (((x1 < avoidBeach || x1 > w - avoidBeach) && y1 < gs.worldSurfaceHigh)
            || (x1 > w * 0.45 && x1 < w * 0.55 && y1 < gs.worldSurface)); a++) {
            x1 = rng.int(0, w - 1);
            y1 = rng.int(gs.worldSurfaceHigh, h - 1);
        }
        tileRunner(st, rng, gs, x1, y1, { strength: rng.int(2, 4), steps: rng.int(2, 19), type });
        let x2 = rng.int(0, w - 1), y2 = rng.int(gs.worldSurfaceHigh, h - 1);
        for (let a = 0; a < 40 && (((x2 < avoidBeach || x2 > w - avoidBeach) && y2 < gs.worldSurfaceHigh)
            || (x2 > w * 0.45 && x2 < w * 0.55 && y2 < gs.worldSurface)); a++) {
            x2 = rng.int(0, w - 1);
            y2 = rng.int(gs.worldSurfaceHigh, h - 1);
        }
        tileRunner(st, rng, gs, x2, y2, { strength: rng.int(8, 14), steps: rng.int(7, 29), type });
    }
    // 12 Dirt Layer Caves(L5262):1/6 液体;中部条件为闭区间 >=45% <=55%
    for (let n = 0; n < area * 0.00003; n++) {
        const type = rng.next() * 6 < 1 ? -2 : -1;
        let i = rng.int(0, w - 1);
        let j = rng.int(gs.worldSurfaceLow, gs.rockLevelHigh);
        for (let a = 0; a < 40 && ((i < avoidBeach || i > w - avoidBeach) && j < gs.worldSurfaceHigh
            || (i >= w * 0.45 && i <= w * 0.55 && j < gs.worldSurface)); a++) {
            i = rng.int(0, w - 1);
            j = rng.int(gs.worldSurfaceLow, gs.rockLevelHigh);
        }
        // digTunnel 蜿蜒版(原版 1.4.0.5 为直线 TileRunner;参考 1.4.4 洞型走 digTunnel,
        // 数量/尺寸/位置与原版一致,仅形状改为有机蜿蜒)
        const dx = rng.int(-100, 100) * 0.01, dy = rng.int(-100, 100) * 0.01;
        digTunnel(st, rng, i, j, dx, dy, rng.int(30, 199), rng.int(3, 7), type === -2);
    }
    // 13 Rock Layer Caves(L5280):1/10 液体(digTunnel 蜿蜒版,尺寸对齐原版 strength×0.5)
    for (let n = 0; n < area * 0.00013; n++) {
        const wet = rng.next() * 10 < 1;
        const dx = rng.int(-100, 100) * 0.01, dy = rng.int(-100, 100) * 0.01;
        digTunnel(st, rng, rng.int(0, w - 1), rng.int(gs.rockLevelHigh, h - 1), dx, dy, rng.int(50, 299), rng.int(3, 9), wet);
    }
    // 14 Surface Caves(L5296):五组地表入口
    const beachL = gs.beachLeftEnd + 20, beachR = gs.beachRightStart - 20;
    const surfaceCave = (count, lo, hi, runners) => {
        for (let n = 0; n < count; n++) {
            let x = rng.int(0, w - 1);
            for (let a = 0; a < 40 && (x > w * lo && x < w * hi || x < beachL || x > beachR); a++) {
                x = rng.int(0, w - 1);
            }
            // 找该列首个实心行
            let sy = -1;
            for (let y = 0; y < gs.worldSurfaceHigh; y++) {
                if (st.flags[st.idx(x, y)]) {
                    sy = y;
                    break;
                }
            }
            if (sy < 0)
                continue;
            for (const r of runners)
                r[0](x);
        }
    };
    // 14a:细入口
    surfaceCave(Math.floor(w * 0.002), 0.45, 0.55, [[(x) => {
                tileRunner(st, rng, gs, x, firstSolid(st, gs, x), { strength: rng.int(3, 5), steps: rng.int(5, 49), type: -1, speedX: rng.int(-10, 10) * 0.1, speedY: 1 });
            }]]);
    // 14b:中入口
    surfaceCave(Math.floor(w * 0.0007), 0.43, 0.57, [[(x) => {
                tileRunner(st, rng, gs, x, firstSolid(st, gs, x), { strength: rng.int(10, 14), steps: rng.int(50, 129), type: -1, speedX: rng.int(-10, 10) * 0.1, speedY: 2 });
            }]]);
    // 14c:大竖井(三连 runner)
    surfaceCave(Math.floor(w * 0.0003), 0.40, 0.60, [[(x) => {
                const y = firstSolid(st, gs, x);
                tileRunner(st, rng, gs, x, y, { strength: rng.int(12, 24), steps: rng.int(150, 499), type: -1, speedX: rng.int(-10, 10) * 0.1, speedY: 4 });
                tileRunner(st, rng, gs, x, y, { strength: rng.int(8, 16), steps: rng.int(60, 199), type: -1, speedX: rng.int(-10, 10) * 0.1, speedY: 2 });
                tileRunner(st, rng, gs, x, y, { strength: rng.int(5, 12), steps: rng.int(40, 169), type: -1, speedX: rng.int(-10, 10) * 0.1, speedY: 2 });
            }]]);
    // 14d:noYChange 入口
    surfaceCave(Math.floor(w * 0.0004), 0.40, 0.60, [[(x) => {
                tileRunner(st, rng, gs, x, firstSolid(st, gs, x), { strength: rng.int(7, 11), steps: rng.int(150, 249), type: -1, speedY: 1, noYChange: true });
            }]]);
    // 14e Caverer(L5360):5×(w/4200 整除截断) 个大洞穴系统;起点边距 340、y 上界 h-400 开
    const cavCount = 5 * Math.floor(w / 4200);
    for (let n = 0; n < cavCount; n++) {
        const cx = rng.int(340, w - 341);
        const cy = rng.int(gs.rockLevel, Math.max(gs.rockLevel + 1, h - 401));
        caverer(st, rng, gs, cx, cy);
    }
}
/** Caverer(L48064)1:1:模式 0 = 主隧道+粗支洞,模式 1 = 长细链 */
function caverer(st, rng, gs, X, Y) {
    const randDir = () => {
        let dx = rng.int(0, 99) * 0.01;
        let dy = 1 - dx;
        if (rng.next() < 0.5)
            dx = -dx;
        if (rng.next() < 0.5)
            dy = -dy;
        return [dx, dy];
    };
    if (rng.next() < 0.5) {
        // 模式 0:7-8 段,每段主挖(6-19 步,粗 4-8)+ 支挖(30-49 步,细 2-5)+ 小 runner
        let px = X + 0.0, py = Y + 0.0;
        let [dx, dy] = randDir();
        const segs = rng.int(7, 8);
        for (let k = 0; k < segs; k++) {
            [px, py] = digTunnel(st, rng, px, py, dx, dy, rng.int(6, 19), rng.int(4, 8));
            dx += rng.int(-20, 20) * 0.1;
            dy += rng.int(-20, 20) * 0.1;
            dx = Math.max(-1.5, Math.min(1.5, dx));
            dy = Math.max(-1.5, Math.min(1.5, dy));
            const [bx, by] = randDir();
            const [ex, ey] = digTunnel(st, rng, px, py, bx, by, rng.int(30, 49), rng.int(3, 5));
            tileRunner(st, rng, gs, Math.floor(ex), Math.floor(ey), {
                strength: rng.int(10, 19), steps: rng.int(5, 9), type: -1,
            });
        }
    }
    else {
        // 模式 1:15-29 段长细链(湿)
        let px = X + 0.0, py = Y + 0.0;
        let [dx, dy] = randDir();
        const segs = rng.int(15, 29);
        for (let k = 0; k < segs; k++) {
            [px, py] = digTunnel(st, rng, px, py, dx, dy, rng.int(5, 14), rng.int(2, 5), true);
            dx += rng.int(-20, 20) * 0.1;
            dy += rng.int(-20, 20) * 0.1;
            dx = Math.max(-1.5, Math.min(1.5, dx));
            dy = Math.max(-1.5, Math.min(1.5, dy));
        }
    }
}
function firstSolid(st, gs, x) {
    for (let y = 0; y < gs.worldSurfaceHigh && y < st.h; y++) {
        if (st.flags[st.idx(x, y)])
            return y;
    }
    return Math.floor(gs.worldSurfaceHigh);
}
