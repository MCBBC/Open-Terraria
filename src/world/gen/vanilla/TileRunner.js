import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
const MUD = TILE_BY_KEY['mud'];
const CLAY = TILE_BY_KEY['clay'];
const SANDSTONE = TILE_BY_KEY['sandstone'];
const HARDSAND = TILE_BY_KEY['hardened_sand'];
const MARBLE = TILE_BY_KEY['v_367_marble_block'];
const GRANITE = TILE_BY_KEY['v_368_granite_block'];
/** 按 vanilla sheet id 收集本仓库 tile id(缺失的自动跳过) */
export function idsByVanillaSheet(...sheets) {
    const out = new Set();
    for (const d of TILE_DEFS) {
        const vs = d.vanilla?.sheet;
        if (vs !== undefined && sheets.includes(vs))
            out.add(TILE_BY_KEY[d.key]);
    }
    return out;
}
// 原版 Main.tileStone(Main.cs:6120-6139):宝石 63-68 + 活/失活石 130/131 + 琥珀石 566。
// 只有这些"放置类型"触发 flag3(仅替换石头)
const STONE_PLACED = idsByVanillaSheet(63, 64, 65, 66, 67, 68, 130, 131, 566);
// TileID.Sets.CanBeClearedDuringGeneration 默认 true,仅这 11 种不可被生成期覆盖(TileID.cs:702)
export const NOT_CLEARABLE = idsByVanillaSheet(396, 400, 401, 397, 398, 399, 404, 368, 367, 226, 237);
// 原版 switch case 45/147/189/190/196/460:无条件 flag3(金砖/雪/云/荧光菇/雨云/雪云)
const FLAG3_ALWAYS = idsByVanillaSheet(45, 147, 189, 190, 196, 460);
// TileID.Sets.Ore:铺设 396/397 时矿石可覆盖
const ORE_SET = new Set();
{
    for (const k of ['ore_copper', 'ore_tin', 'ore_iron', 'ore_lead', 'ore_silver', 'ore_tungsten',
        'ore_gold', 'ore_platinum', 'ore_demonite', 'ore_crimtane', 'ore_cobalt', 'ore_mythril',
        'ore_adamantite', 'ore_palladium', 'ore_orichalcum', 'ore_titanium', 'ore_chlorophyte',
        'ore_hellstone', 'ore_meteorite']) {
        const id = TILE_BY_KEY[k];
        if (id !== undefined)
            ORE_SET.add(id);
    }
}
export function tileRunner(st, rng, gs, i, j, o) {
    const { strength, steps, type } = o;
    const addTile = o.addTile ?? false;
    const overRide = o.overRide ?? true;
    const noYChange = o.noYChange ?? false;
    const ignoreTileType = o.ignoreTileType ?? -1;
    let num1 = strength; // 当前半径(衰减)
    let num2 = steps; // 剩余步数
    let px = i + 0.0, py = j + 0.0;
    // 原版初始速度 Next(-10,11)*0.1(0.1 步长离散);仅 speedX/speedY 任一非 0 才覆写
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if ((o.speedX ?? 0) !== 0 || (o.speedY ?? 0) !== 0) {
        vx = o.speedX ?? 0;
        vy = o.speedY ?? 0;
    }
    while (num1 > 0 && num2 > 0) {
        // 泥向上钻出世界顶即停(原版)
        if (py < 0 && num2 > 0 && type === MUD)
            num2 = 0;
        num1 = strength * (num2 / steps);
        num2--;
        const x0 = Math.max(1, Math.floor(px - num1 * 0.5));
        const x1 = Math.min(st.w - 1, Math.floor(px + num1 * 0.5));
        const y0 = Math.max(1, Math.floor(py - num1 * 0.5));
        const y1 = Math.min(st.h - 1, Math.floor(py + num1 * 0.5));
        for (let x = x0; x < x1; x++) {
            for (let y = y0; y < y1; y++) {
                if (ignoreTileType >= 0 && st.type[st.idx(x, y)] === ignoreTileType && st.flags[st.idx(x, y)])
                    continue;
                const dist = Math.abs(x - px) + Math.abs(y - py);
                if (dist >= strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))
                    continue;
                const ti = st.idx(x, y);
                // 丛林泥墙(原版 mudWall 分支:浅层墙 15,深层墙 64,均避让邻墙)
                if (o.mudWall && y > gs.worldSurface && st.wall[st.idx(x, y - 1)] !== 2
                    && y < st.h - 210 - rng.int(0, 2)
                    && dist < strength * 0.45 * (1 + rng.int(-10, 10) * 0.01)) {
                    if (y > gs.lavaLine - rng.int(0, 3) - 50) {
                        if (st.wall[st.idx(x, y - 1)] !== 64 && st.wall[st.idx(x, y + 1)] !== 64
                            && st.wall[st.idx(x - 1, y)] !== 64)
                            st.wall[ti] = 15;
                    }
                    else if (st.wall[st.idx(x, y - 1)] !== 15 && st.wall[st.idx(x, y + 1)] !== 15
                        && st.wall[st.idx(x - 1, y)] !== 15) {
                        st.wall[ti] = 64;
                    }
                }
                // granite/marble 伴生墙(cs L46503-46506):核心 0.3R 内同步铺墙 180/178
                if (type === GRANITE || type === MARBLE) {
                    if (dist < strength * 0.3 * (1 + rng.int(-10, 10) * 0.01)) {
                        st.wall[ti] = type === GRANITE ? 180 : 178;
                    }
                }
                if (type < 0) {
                    // 挖空:沙不挖(原版 53 保护);-2 在活性块上填液体
                    if (st.type[ti] === T.SAND)
                        continue;
                    if (type === -2 && st.flags[ti] && (y < gs.waterLine || y > gs.lavaLine)) {
                        st.liquid[ti] = 255;
                        st.liquidType[ti] = y > gs.lavaLine ? 2 : 1;
                    }
                    st.type[ti] = 0;
                    st.flags[ti] = 0;
                }
                else {
                    // 铺设:原版 flag3 规则(WorldGen.cs:46509-46555)
                    if (overRide || !st.flags[ti]) {
                        const cur = st.type[ti];
                        // Main.tileStone[type](放置类型是宝石族)且目标非石头 → flag3
                        let flag3 = STONE_PLACED.has(type) && cur !== T.STONE;
                        // CanBeClearedDuringGeneration:11 种不可清 tile 被覆盖时恒 flag3
                        if (NOT_CLEARABLE.has(cur))
                            flag3 = true;
                        if (cur === T.STONE) {
                            // 泥不替换近地表的石头(±50 抖动)
                            if (type === MUD && y < gs.worldSurface + rng.int(-50, 49))
                                flag3 = true;
                        }
                        else if (FLAG3_ALWAYS.has(cur)) {
                            // 金砖/雪/云/荧光菇/雨云/雪云:无条件保护
                            flag3 = true;
                        }
                        else if (cur === T.SAND) {
                            if (type === MUD && inUndergroundDesert(gs, x, y))
                                flag3 = true;
                            if (type === CLAY)
                                flag3 = true; // 原版:沙上不可铺粘土
                            if (y < gs.worldSurface && type !== MUD)
                                flag3 = true;
                        }
                        else if (cur === MARBLE || cur === GRANITE) {
                            if (type === MUD)
                                flag3 = true;
                        }
                        else if (cur === SANDSTONE || cur === HARDSAND) {
                            if (!ORE_SET.has(type))
                                flag3 = true;
                        }
                        if (!flag3)
                            st.type[ti] = type;
                    }
                    if (addTile) {
                        st.flags[ti] = 1;
                        st.liquid[ti] = 0;
                        st.liquidType[ti] = 0;
                    }
                    if (noYChange && y < gs.worldSurface && type !== MUD)
                        st.wall[ti] = 2;
                    if (type === MUD && y > gs.waterLine && st.liquid[ti] > 0) {
                        st.liquid[ti] = 0;
                        st.liquidType[ti] = 0;
                    }
                }
            }
        }
        // 移动 + 大半径加速(原版 12 档阶梯 50..900,每档速度抖动 ±0.05)
        px += vx;
        py += vy;
        for (const thr of [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900]) {
            if (num1 > thr) {
                px += vx;
                py += vy;
                num2--;
                vy += rng.int(-10, 10) * 0.05;
                vx += rng.int(-10, 10) * 0.05;
            }
            else
                break;
        }
        // 每步全局速度抖动 + ±1 钳制(cs L46659-46673):X 恒抖;
        // !noYChange 时 Y 抖动;noYChange 且非泥、半径<3 时只钳不抖
        vx += rng.int(-10, 10) * 0.05;
        if (vx > 1)
            vx = 1;
        if (vx < -1)
            vx = -1;
        if (!noYChange) {
            vy += rng.int(-10, 10) * 0.05;
            if (vy > 1)
                vy = 1;
            if (vy < -1)
                vy = -1;
        }
        else if (type !== MUD && num1 < 3) {
            if (vy > 1)
                vy = 1;
            if (vy < -1)
                vy = -1;
        }
        // 泥专用 vy 规则(1456 cs L77484-77500)：±0.5 钳 + 岩层上界/地狱带上界定向推挤——
        // 丛林首轮泥 runner(vy 初始 ±1)靠它被压进 [rockLayer+100, maxTilesY-300] 带；缺失时泥漂出丛林
        if (type === MUD && !noYChange) {
            if (vy > 0.5)
                vy = 0.5;
            if (vy < -0.5)
                vy = -0.5;
            if (py < gs.rockLevel + 100)
                vy = 1;
            if (py > st.h - 300)
                vy = -1;
        }
    }
}
/**
 * 原版 WorldGen.digTunnel(L48132)移植:蜿蜒洞穴原语。
 * 速度 = (dir + 噪声游走±0.2/步) × 0.6 → 会拐弯;半径在 [Size×0.6, Size×2] 随机波动 → 粗细变化。
 * 这是有机洞型的来源(TileRunner strength<50 时恒速恒宽 = 直线刀砍)。
 */
export function digTunnel(st, rng, X, Y, xDir, yDir, steps, size, wet = false) {
    let x = Math.max(size + 1, Math.min(st.w - size - 1, X));
    let y = Math.max(size + 1, Math.min(st.h - size - 1, Y));
    let noiseX = 0, noiseY = 0;
    let radius = size;
    for (let step = 0; step < steps; step++) {
        const x0 = Math.floor(x - radius), x1 = Math.floor(x + radius);
        const y0 = Math.floor(y - radius), y1 = Math.floor(y + radius);
        for (let ix = x0; ix <= x1; ix++) {
            for (let iy = y0; iy <= y1; iy++) {
                if (Math.abs(ix - x) + Math.abs(iy - y) < radius * (1 + rng.int(-10, 10) * 0.005)
                    && st.inBounds(ix, iy)) {
                    const i = st.idx(ix, iy);
                    st.type[i] = 0;
                    st.flags[i] = 0;
                    if (wet) {
                        st.liquid[i] = 255;
                        st.liquidType[i] = 1;
                    }
                }
            }
        }
        radius += rng.int(-50, 50) * 0.03;
        if (radius < size * 0.6)
            radius = size * 0.6;
        if (radius > size * 2)
            radius = size * 2;
        noiseX += rng.int(-20, 20) * 0.01;
        noiseY += rng.int(-20, 20) * 0.01;
        noiseX = Math.max(-1, Math.min(1, noiseX));
        noiseY = Math.max(-1, Math.min(1, noiseY));
        x += (xDir + noiseX) * 0.6;
        y += (yDir + noiseY) * 0.6;
    }
    return [x, y];
}
function inUndergroundDesert(gs, x, y) {
    const ud = gs.undergroundDesert;
    return !!ud && x >= ud.x0 && x <= ud.x1 && y >= ud.y0 && y <= ud.y1;
}
