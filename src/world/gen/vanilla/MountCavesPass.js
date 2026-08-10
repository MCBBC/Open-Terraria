import { ctrunc } from '../../../core/csCompat';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';
import { T, TILE_BY_KEY } from '../../../data/tiles';
/** 山丘区域避让的沙族（原版 box 检查 type 53/151/274：沙/沙岩砖/沙岩板） */
const SAND_AVOID = idsByVanillaSheet(53, 151, 274);
/** Mountinater（L48367）：上漂泥土 blob = 山丘本体。只在空气格激活填土(type 0=Dirt) */
function mountinater(st, rng, i, j) {
    let num1 = rng.int(79, 119); // Next(80,120)
    let num2 = rng.int(39, 54); // Next(40,55)
    let px = i, py = j + num2 / 2;
    let vx = rng.int(-10, 10) * 0.1; // Next(-10,11)
    let vy = rng.int(-20, -11) * 0.1; // Next(-20,-10)
    while (num1 > 0 && num2 > 0) {
        num1 -= rng.int(0, 3); // Next(4)
        num2--;
        let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
        let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
        if (x0 < 0)
            x0 = 0;
        if (x1 > st.w)
            x1 = st.w;
        if (y0 < 0)
            y0 = 0;
        if (y1 > st.h)
            y1 = st.h;
        const r = num1 * rng.int(79, 119) * 0.01; // Next(80,120)
        for (let x = x0; x < x1; x++) {
            for (let y = y0; y < y1; y++) {
                const dx = Math.abs(x - px), dy = Math.abs(y - py);
                if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
                    const k = st.idx(x, y);
                    if (!st.flags[k])
                        st.setTileSilent(x, y, T.DIRT); // 原版 active(true)+type 0(=Dirt)
                }
            }
        }
        px += vx;
        py += vy;
        vx += rng.int(-10, 10) * 0.05;
        vy += rng.int(-10, 10) * 0.05;
        if (vx > 0.5)
            vx = 0.5;
        if (vx < -0.5)
            vx = -0.5;
        if (vy > -0.5)
            vy = -0.5;
        if (vy < -1.5)
            vy = -1.5;
    }
}
/** pass 7 Mount Caves：w*0.001 次尝试，避开中心 ±90/沙族 ±50×25/前丘 ±100（L5095-5148） */
export function runMountCavesPass(st, rng, gs) {
    const count = Math.floor(st.w * 0.001);
    for (let n = 0; n < count; n++) {
        let x = rng.int(Math.floor(st.w * 0.25), Math.floor(st.w * 0.75) - 1); // Next(w*.25, w*.75)
        let tries = 0;
        let giveUp = false;
        let placed = false;
        while (!placed && !giveUp) {
            placed = true;
            while (x > st.w / 2 - 90 && x < st.w / 2 + 90) {
                x = rng.int(Math.floor(st.w * 0.25), Math.floor(st.w * 0.75) - 1);
            }
            for (let k = 0; k < gs.numMCaves; k++) {
                if (Math.abs(x - gs.mCaveX[k]) < 100) {
                    tries++;
                    placed = false;
                    break;
                }
            }
            if (tries >= st.w / 5) {
                giveUp = true;
                break;
            }
        }
        if (giveUp)
            continue;
        // 找该列地表首个实心格
        for (let y = 0; y < gs.worldSurface; y++) {
            if (!st.flags[st.idx(x, y)])
                continue;
            let nearSand = false;
            for (let dx = -50; dx < 50 && !nearSand; dx++) {
                for (let dy = -25; dy < 25; dy++) {
                    const xx = x + dx, yy = y + dy;
                    if (!st.inBounds(xx, yy) || !st.flags[st.idx(xx, yy)])
                        continue;
                    if (SAND_AVOID.has(st.type[st.idx(xx, yy)])) {
                        nearSand = true;
                        break;
                    }
                }
            }
            if (!nearSand) {
                mountinater(st, rng, x, y);
                gs.mCaveX[gs.numMCaves] = x;
                gs.mCaveY[gs.numMCaves] = y;
                gs.numMCaves++;
            }
            break; // 原版无论放没放都 break 出列扫描
        }
    }
}
/** CaveOpenater（L48789）：山侧横向开口，100 步或直到离开墙/碰不可清 tile */
function caveOpenater(st, rng, i, j) {
    let num1 = rng.int(6, 11); // Next(7,12)
    let dir = rng.int(0, 1) === 0 ? -1 : 1; // Next(2)
    if (rng.int(0, 9) !== 0)
        dir = i >= st.w / 2 ? -1 : 1; // 90% 朝世界外侧（Next(10)!=0）
    let px = i, py = j;
    let steps = 100;
    let vx = dir, vy = 0;
    while (steps > 0) {
        const k = st.idx(Math.max(0, Math.min(st.w - 1, ctrunc(px))), Math.max(0, Math.min(st.h - 1, ctrunc(py))));
        const t = st.type[k];
        if (st.wall[k] === 0 || (st.flags[k] && NOT_CLEARABLE.has(t)))
            steps = 0;
        steps--;
        let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
        let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
        if (x0 < 0)
            x0 = 0;
        if (x1 > st.w)
            x1 = st.w;
        if (y0 < 0)
            y0 = 0;
        if (y1 > st.h)
            y1 = st.h;
        const r = num1 * rng.int(79, 119) * 0.01;
        for (let x = x0; x < x1; x++) {
            for (let y = y0; y < y1; y++) {
                const dx = Math.abs(x - px), dy = Math.abs(y - py);
                if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
                    const kk = st.idx(x, y);
                    if (st.flags[kk] && !NOT_CLEARABLE.has(st.type[kk]))
                        st.setTileSilent(x, y, 0);
                }
            }
        }
        px += vx;
        py += vy;
        vx += rng.int(-10, 10) * 0.05;
        vy += rng.int(-10, 10) * 0.05;
        if (vx > dir + 0.5)
            vx = dir + 0.5;
        if (vx < dir - 0.5)
            vx = dir - 0.5;
        if (vy > 0)
            vy = 0;
        if (vy < -0.5)
            vy = -0.5;
    }
}
/** Cavinator（L48733）：向下蜿蜒洞穴，递归 steps 次直至岩层（不挖沙 53） */
function cavinator(st, rng, gs, i, j, steps) {
    let num1 = rng.int(6, 14); // Next(7,15)
    const dir = rng.int(0, 1) === 0 ? -1 : 1;
    let px = i, py = j;
    let count = rng.int(19, 39); // Next(20,40)
    let vx = dir, vy = rng.int(10, 19) * 0.01; // Next(10,20)
    const SAND = TILE_BY_KEY['sand'];
    while (count > 0) {
        count--;
        let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
        let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
        if (x0 < 0)
            x0 = 0;
        if (x1 > st.w)
            x1 = st.w;
        if (y0 < 0)
            y0 = 0;
        if (y1 > st.h)
            y1 = st.h;
        const r = num1 * rng.int(79, 119) * 0.01;
        for (let x = x0; x < x1; x++) {
            for (let y = y0; y < y1; y++) {
                const dx = Math.abs(x - px), dy = Math.abs(y - py);
                if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
                    const kk = st.idx(x, y);
                    if (st.flags[kk] && !NOT_CLEARABLE.has(st.type[kk]) && st.type[kk] !== SAND) {
                        st.setTileSilent(x, y, 0);
                    }
                }
            }
        }
        px += vx;
        py += vy;
        vx += rng.int(-10, 10) * 0.05;
        vy += rng.int(-10, 10) * 0.05;
        if (vx > dir + 0.5)
            vx = dir + 0.5;
        if (vx < dir - 0.5)
            vx = dir - 0.5;
        if (vy > 2)
            vy = 2;
        if (vy < 0)
            vy = 0;
    }
    if (steps <= 0 || ctrunc(py) >= gs.rockLevel + 50)
        return;
    cavinator(st, rng, gs, ctrunc(px), ctrunc(py), steps - 1);
}
/** pass 34 Mountain Caves（L6628-6639）：每座山丘 开口+蜿蜒 */
export function runMountainCavesPass(st, rng, gs) {
    for (let n = 0; n < gs.numMCaves; n++) {
        const x = gs.mCaveX[n], y = gs.mCaveY[n];
        caveOpenater(st, rng, x, y);
        cavinator(st, rng, gs, x, y, rng.int(39, 49)); // Next(40,50)
    }
}
