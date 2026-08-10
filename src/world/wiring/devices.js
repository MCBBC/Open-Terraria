import { TILE_BY_KEY } from '../../data/tiles';
/** 宝石块 off/on id 对(255-261 off ↔ 262-268 on,±7;Wiring.cs:863-873) */
const GEMSPARK_OFF = ['v_255_amethystgemsparkoff', 'v_256_topazgemsparkoff', 'v_257_sapphiregemsparkoff',
    'v_258_emeraldgemsparkoff', 'v_259_rubygemsparkoff', 'v_260_diamondgemsparkoff', 'v_261_ambergemsparkoff'];
const GEMSPARK_ON = ['v_262_amethystgemspark', 'v_263_topazgemspark', 'v_264_sapphiregemspark',
    'v_265_emeraldgemspark', 'v_266_rubygemspark', 'v_267_diamondgemspark', 'v_268_ambergemspark'];
/** 通电石/宝石块等的成对 tile id 切换 */
function swapTile(w, x, y, fromKey, toKey) {
    const st = w.st;
    if (!st.inBounds(x, y))
        return;
    const i = st.idx(x, y);
    const cur = st.type[i];
    const from = TILE_BY_KEY[fromKey], to = TILE_BY_KEY[toKey];
    if (cur === from)
        st.setTile(x, y, to, st.frameX[i], st.frameY[i]);
    else if (cur === to)
        st.setTile(x, y, from, st.frameX[i], st.frameY[i]);
}
/** 多格器件整体翻帧(篝火/壁炉/吊灯等通用模式,Wiring.cs:1003-1052 等):
 *  锚点 = (x - frameX%blockW/18, y - frameY%blockH/18);delta 由锚点帧阈值定;整体 SkipWire */
function flipBlock(w, x, y, blockW, blockH, tilesW, tilesH, axis, threshold, delta) {
    const st = w.st;
    const i = st.idx(x, y);
    const ox = x - Math.floor(st.frameX[i] % blockW / 18);
    const oy = y - Math.floor(st.frameY[i] % blockH / 18);
    let d = delta;
    const ai = st.idx(ox, oy);
    if (axis === 'y' ? st.frameY[ai] >= threshold : st.frameX[ai] >= threshold)
        d = -delta;
    for (let ix = ox; ix < ox + tilesW; ix++) {
        for (let iy = oy; iy < oy + tilesH; iy++) {
            if (!st.inBounds(ix, iy))
                continue;
            const ii = st.idx(ix, iy);
            w.skipCell(ix, iy);
            if (axis === 'y')
                st.setTile(ix, iy, st.type[ii], st.frameX[ii], st.frameY[ii] + d);
            else
                st.setTile(ix, iy, st.type[ii], st.frameX[ii] + d, st.frameY[ii]);
        }
    }
}
/** 单格帧翻转(火把/蜡烛等) */
function flipCell(w, x, y, delta) {
    const st = w.st;
    if (!st.inBounds(x, y))
        return;
    const i = st.idx(x, y);
    let d = delta;
    if (st.frameX[i] >= delta)
        d = -delta;
    st.setTile(x, y, st.type[i], st.frameX[i] + d, st.frameY[i]);
}
/** 陷阱(137)发射(Wiring.cs:1495-1743 + Item.cs placeStyle)。frameY/18=种类:
 *  0飞镖(98) 1超级飞镖(184) 2烈焰(187,隐形+尘埃) 3尖刺球(185) 4长矛(186) */
function fireTrap(w, ctx, x, y) {
    const st = w.st;
    const i = st.idx(x, y);
    const kind = Math.floor(st.frameY[i] / 18);
    if (kind === 0 || kind === 1 || kind === 2) {
        if (!w.checkMech(x, y, 200))
            return;
        // 方向:frameX 0=左 18=右;frameY<36 平置 / ≥36 竖置(上下)
        const dirX = st.frameX[i] === 0 ? -1 : st.frameX[i] === 18 ? 1 : 0;
        const dirY = st.frameX[i] < 36 ? 0 : st.frameX[i] < 72 ? -1 : 1;
        const speed = kind === 0 ? 12 : kind === 1 ? 12 : 5;
        const dmg = kind === 0 ? 20 : 40;
        const px = x * 16 + 8 + 10 * dirX, py = y * 16 + 8 + 10 * dirY;
        ctx.shootProjectile(px, py, dirX * speed, dirY * speed, dmg, kind === 0 ? 'dart' : kind === 1 ? 'superdart' : 'flame');
    }
    else if (kind === 3) {
        // 尖刺球:CheckMech 300 + 同场数量惩罚表(Wiring.cs:1536-1599)
        if (!w.checkMech(x, y, 300))
            return;
        let budget = 200;
        const near = ctx.countProjectiles('spiky', x * 16 + 8, y * 16 + 8, 1200);
        for (let k = 0; k < near; k++) {
            budget -= k < 1 ? 50 : k < 2 ? 15 : k < 4 ? 10 : k < 7 ? 8 : k < 12 ? 6 : k < 20 ? 5 : k < 38 ? 4 : k < 65 ? 3 : k < 105 ? 2 : 1;
        }
        if (budget <= 0)
            return;
        let dx = 0, dy = 0;
        switch (Math.floor(st.frameX[i] / 18)) {
            case 0:
            case 1:
                dy = 1;
                break;
            case 2:
                dy = -1;
                break;
            case 3:
                dx = -1;
                break;
            case 4:
                dx = 1;
                break;
        }
        const px = x * 16 + 8 + 14 * dx, py = y * 16 + 8 + 14 * dy;
        ctx.shootProjectile(px, py, dx * 4, dy * 4, 40, 'spiky');
    }
    else if (kind === 4) {
        // 下向火焰(CheckMech 90)
        if (!w.checkMech(x, y, 90))
            return;
        let dx = 0, dy = 0;
        switch (Math.floor(st.frameX[i] / 18)) {
            case 0:
                dx = -1;
                break;
            case 1:
                dx = 1;
                break;
            case 2:
                dy = -1;
                break;
            case 3:
                dy = 1;
                break;
        }
        ctx.shootProjectile(x * 16 + 8 + 10 * dx, y * 16 + 8 + 10 * dy, dx * 8, dy * 8, 60, 'spear');
    }
}
/** 热喷泉 443(Wiring.cs:2284-2312;由 HitSwitch 直调) */
export function geyserTrap(w, ctx, x, y) {
    const st = w.st;
    if (!st.inBounds(x, y))
        return false;
    const i = st.idx(x, y);
    const num = Math.floor(st.frameX[i] / 36);
    const i1 = x - Math.floor((st.frameX[i] - num * 36) / 18);
    if (!w.checkMech(i1, y, 200))
        return false;
    const up = num < 2;
    ctx.shootProjectile((i1 + 1) * 16, (y + (up ? 0 : 1)) * 16, 0, up ? -8 : 8, 20, 'geyser');
    return true;
}
/** 雕像 style → 原版 NPC id 表(Wiring.cs:1892-1996)。
 *  num79 = frameX/36 + (frameY/54 % 3) * 55 */
const STATUE_NPC = {
    5: 73, 13: 24, 30: 6, 35: 2,
    51: [299, 538], 52: 356, 53: 357, 54: [355, 358], 55: [367, 366],
    56: [359, 359, 359, 359, 360], 57: 377, 58: 300, 59: [364, 362], 60: 148, 61: 361,
    62: [487, 486, 485], 64: 86, 65: 490, 66: 82, 67: 449, 68: 167, 69: 480, 70: 48,
    71: [170, 180, 171], 72: 481, 73: 482, 74: 430, 75: 489, 76: 611, 77: 602,
    78: [595, 596, 599, 597, 600, 598], 79: [616, 617],
};
/** 单独分支的雕像 style(NPC 直刷,Wiring.cs:2010-2208) */
const STATUE_NPC_DIRECT = {
    4: 1, 7: 49, 8: 55, 9: 46, 10: 21, 16: 42, 18: 67, 23: 63, 27: 85, 28: 74, 42: 58, 50: 65,
};
/** 物品雕像 style → 原版 item id(2王冠 17心 37星;Wiring.cs:2014-2131) */
const STATUE_ITEM = { 2: 184, 17: 166, 37: 58 };
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
/** 雕像 105(Wiring.cs:1866-2215) */
function fireStatue(w, ctx, x, y) {
    const st = w.st;
    const i = st.idx(x, y);
    // 锚点与 style(:1867-1879)
    const num73 = Math.floor(st.frameX[i] / 18);
    let num74 = 0;
    let rem = num73;
    while (rem >= 2) {
        rem -= 2;
        num74++;
    }
    const ox = x - rem;
    const ax = x - Math.floor(st.frameX[i] % 36 / 18);
    const ay = y - Math.floor(st.frameY[i] % 54 / 18);
    const num79 = Math.floor(st.frameX[i] / 36) + Math.floor(st.frameY[i] / 54 % 3) * 55;
    w.skipCell(ax, ay);
    w.skipCell(ax, ay + 1);
    w.skipCell(ax, ay + 2);
    w.skipCell(ax + 1, ay);
    w.skipCell(ax + 1, ay + 1);
    w.skipCell(ax + 1, ay + 2);
    const px = ax * 16 + 16, py = (ay + 3) * 16;
    // NPC 雕像主表
    const entry = STATUE_NPC[num79];
    if (entry !== undefined) {
        const npcId = Array.isArray(entry) ? pick(entry) : entry;
        if (w.checkMech(ax, ay, 30) && ctx.mechSpawnOk(px, py)) {
            ctx.spawnNpc(npcId, px, py);
        }
        return;
    }
    // 单独分支 NPC 雕像
    const direct = STATUE_NPC_DIRECT[num79];
    if (direct !== undefined) {
        if (w.checkMech(ax, ay, 30) && ctx.mechSpawnOk(px, py)) {
            ctx.spawnNpc(direct, px, py - 12);
        }
        return;
    }
    // 物品雕像(CheckMech 600)
    const itemId = STATUE_ITEM[num79];
    if (itemId !== undefined) {
        if (w.checkMech(ax, ay, 600) && ctx.itemSpawnOk(px, py)) {
            ctx.dropItem(itemId, px, py - 16);
        }
        return;
    }
    switch (num79) {
        case 34: { // 蘑菇雕像:2×3 变 tile 349 动画(:2108-2119)
            const T349 = TILE_BY_KEY['v_349_mushroom_statue'] ?? 0;
            for (let dx = 0; dx < 2; dx++) {
                for (let dy = 0; dy < 3; dy++) {
                    st.setTile(ax + dx, ay + dy, T349, dx * 18 + 216, dy * 18);
                }
            }
            return;
        }
        case 40:
        case 41: // 城镇 NPC 搬迁(CheckMech 300,:2133-2186)
            if (w.checkMech(ax, ay, 300))
                ctx.relocateTownNpc(num79 === 40 ? 0 : 1, px, py);
            return;
        case 63: // 随机传送雕像(:1942-1945,额外 MechSpawn(165))
            if (w.checkMech(ax, ay, 30) && ctx.mechSpawnOk(px, py)) {
                ctx.spawnNpc(164, px, py);
            }
            return;
    }
}
/** 巨石雕像 531(Wiring.cs:1747-1762) */
function fireBoulderStatue(w, ctx, x, y) {
    const st = w.st;
    const i = st.idx(x, y);
    const ox = x - Math.floor(st.frameX[i] % 36 / 18);
    const oy = y - Math.floor(st.frameY[i] % 36 / 18);
    if (!w.checkMech(ox, oy, 900))
        return;
    w.skipCell(ox, oy);
    w.skipCell(ox + 1, oy);
    w.skipCell(ox, oy + 1);
    w.skipCell(ox + 1, oy + 1);
    ctx.shootProjectile(ox * 16 + 16, (oy + 1) * 16, 0, 0, 70, 'boulder');
}
/** 可接线灯器件的开关帧判定(Wiring.cs 翻帧 delta 推导):on = frame%(2δ) < δ。
 *  火把 δ=66(22px×3 变体一组)、蜡烛族 δ=18、2×2 灯具 δ=36、吊灯/彩灯 δ=54、篝火走 Y 轴 δ=36 */
export const LIGHT_TOGGLE = {
    4: ['x', 66],
    33: ['x', 18], 174: ['x', 18], 49: ['x', 18], 372: ['x', 18],
    42: ['x', 18], 92: ['x', 18], 93: ['x', 18],
    95: ['x', 36], 100: ['x', 36], 126: ['x', 36], 173: ['x', 36], 564: ['x', 36],
    34: ['x', 54], 149: ['x', 54],
    215: ['y', 36],
};
/** 该格灯光是否点亮(非灯器件恒 true;供 LightingEngine 查询) */
export function lightIsOn(sheet, frameX, frameY) {
    const t = LIGHT_TOGGLE[sheet];
    if (!t)
        return true;
    const v = t[0] === 'x' ? frameX : frameY;
    return v % (2 * t[1]) < t[1];
}
/** HitWireSingle 器件主分发表。返回 true = 已处理 */
export function deviceTable(w, ctx, sheet, x, y) {
    const st = w.st;
    const i = st.idx(x, y);
    switch (sheet) {
        case 4: // 火把 frameX ±66(:1207-1213)
            flipCell(w, x, y, 66);
            return true;
        case 10: // 关门 → 开(随机方向+反向,原版 :1171-1188)
            ctx.doorOpen(x, y);
            return true;
        case 11:
            ctx.doorClose(x, y);
            return true;
        case 15: { // 马桶(frameY/40 判定,:1194-1204;喷水近似粒子)
            if (Math.floor(st.frameY[i] / 40) !== 1 && Math.floor(st.frameY[i] / 40) !== 20)
                return true;
            if (w.checkMech(x, y, 60))
                ctx.sfx('splash', x * 16 + 8, y * 16 + 8);
            return true;
        }
        case 33:
        case 174:
        case 49:
        case 372: // 蜡烛族 frameX ±18(:1472-1480)
            flipCell(w, x, y, 18);
            return true;
        case 34: // 吊灯 3×3 frameX ±54(:1405-1428)
            flipBlock(w, x, y, 108, 54, 3, 3, 'x', 54, 54);
            return true;
        case 35:
        case 139:
        case 207:
        case 410:
        case 480:
        case 509:
            // 南瓜灯/八音盒/喷泉/三色天塔柱:原版 SwitchMB/SwitchFountain/SwitchMonolith。
            // 引擎暂无对应状态系统 → toast 占位
            ctx.toast('装置切换(音乐/喷泉/天塔柱系统未接入)');
            return true;
        case 42: // 挂链灯笼 1×2 frameX ±18(:1214-1227)
            flipBlock(w, x, y, 36, 36, 1, 2, 'x', 18, 18);
            return true;
        case 92: // 路灯柱 1×6 frameX ±18(:1483-1494)
            flipBlock(w, x, y, 18, 108, 1, 6, 'x', 18, 18);
            return true;
        case 93: // 蒂基火炬 1×3 frameX ±18(:1228-1243)
            flipBlock(w, x, y, 18, 54, 1, 3, 'x', 18, 18);
            return true;
        case 95:
        case 100:
        case 126:
        case 173:
        case 564: // 2×2 灯具族 frameX ±36(:1381-1404)
            flipBlock(w, x, y, 72, 36, 2, 2, 'x', 36, 36);
            return true;
        case 105:
            fireStatue(w, ctx, x, y);
            return true;
        case 130: { // 通电石:上方有宝箱则不缩(:878-884)
            const above = y > 0 ? w.sheetOf(x, y - 1) : -1;
            if (above === 21 || above === 88 || above === 467)
                return true;
            swapTile(w, x, y, 'v_130_active_stone_block', 'v_131_inactivestoneblock');
            return true;
        }
        case 131:
            swapTile(w, x, y, 'v_130_active_stone_block', 'v_131_inactivestoneblock');
            return true;
        case 137:
            fireTrap(w, ctx, x, y);
            return true;
        case 141: // 炸药:清格+爆炸(:1781-1785)
            w.skipCell(x, y);
            st.setTile(x, y, 0);
            ctx.explode(x, y, 500);
            return true;
        case 149: // 节日彩灯 frameX ±54(:1244-1250)
            flipCell(w, x, y, 54);
            return true;
        case 209: { // 大炮:CheckMech 30 发射炮弹(:890-945;弹药系统未接入,固定炮弹)
            const ox = x - Math.floor(st.frameX[i] % 72 / 18);
            const oy = y - Math.floor(st.frameY[i] % 54 / 18);
            if (!w.checkMech(ox, oy, 30))
                return true;
            // 角度:frameX 块内列(0-3)= 抬角 0-45°;朝向 frameY
            const col = Math.floor((st.frameX[i] % 72) / 18) % 4;
            const dir = st.frameY[i] >= 54 ? -1 : 1;
            const ang = (col * Math.PI) / 12;
            ctx.shootProjectile(ox * 16 + 24, oy * 16, dir * 6 * Math.cos(ang), -6 * Math.sin(ang) - 2, 40, 'boulder');
            return true;
        }
        case 210: // 地雷:原版 ExplodeMine(:1786-1788)清格+爆炸
            st.setTile(x, y, 0);
            ctx.explode(x, y, 100);
            return true;
        case 212: { // 雪球发射器:CheckMech 10 发射(:946-1002)
            const ox = x - Math.floor(st.frameX[i] % 54 / 18);
            const oy = y - Math.floor(st.frameY[i] % 54 / 18);
            if (!w.checkMech(x, y, 10))
                return true;
            ctx.shootProjectile(ox * 16 + 16, oy * 16, 8, -8, 20, 'boulder');
            return true;
        }
        case 215: // 篝火 3×2 frameY ±36(:1003-1020)
            flipBlock(w, x, y, 54, 36, 3, 2, 'y', 36, 36);
            return true;
        case 216: // 烟花火箭(:1189-1192;近似粒子升空)
            w.skipCell(x, y);
            ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
            return true;
        case 244: // 泡泡机 3×2 frameX ±54(:1272-1293)
            flipBlock(w, x, y, 54, 36, 3, 2, 'x', 54, 54);
            return true;
        case 255:
        case 256:
        case 257:
        case 258:
        case 259:
        case 260:
        case 261: { // 宝石块 off→on(:863-873)
            if (st.wire[i] & 16)
                return true; // 原版有致动器时不响应
            const to = TILE_BY_KEY[GEMSPARK_ON[sheet - 255]] ?? 0;
            if (to)
                st.setTile(x, y, to, st.frameX[i], st.frameY[i]);
            return true;
        }
        case 262:
        case 263:
        case 264:
        case 265:
        case 266:
        case 267:
        case 268: { // on→off
            if (st.wire[i] & 16)
                return true;
            const to = TILE_BY_KEY[GEMSPARK_OFF[sheet - 262]] ?? 0;
            if (to)
                st.setTile(x, y, to, st.frameX[i], st.frameY[i]);
            return true;
        }
        case 314: // 压板轨道:CheckMech 5 + FlipSwitchTrack(:1429-1433;矿车系统占位)
            w.checkMech(x, y, 5);
            return true;
        case 335: // 烟花盒 2×2(:1294-1304)
            w.skipCell(x, y);
            w.skipCell(x + 1, y);
            if (w.checkMech(x, y, 30))
                ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
            return true;
        case 338: // 烟花喷泉 1×2(:1305-1324)
            w.skipCell(x, y);
            if (w.checkMech(x, y, 30))
                ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
            return true;
        case 386:
        case 387: { // 活板门开/关互换(ShiftTrapdoor;帧近似)
            const openK = 'v_386_trapdooropen', closedK = 'v_387_trap_door_closed';
            const toOpen = sheet === 387;
            const target = TILE_BY_KEY[toOpen ? openK : closedK] ?? 0;
            if (!target)
                return true;
            const ox = x - Math.floor(st.frameX[i] % 36 / 18);
            for (let ix = ox; ix < ox + 2; ix++) {
                if (!st.inBounds(ix, y))
                    continue;
                const ii = st.idx(ix, y);
                w.skipCell(ix, y);
                st.setTile(ix, y, target, (ix - ox) * 18, st.frameY[ii]);
            }
            return true;
        }
        case 388:
        case 389: { // 高门关/开互换(ShiftTallGate;帧近似)
            const openK = 'v_389_tallgateopen', closedK = 'v_388_tall_gate_closed';
            const toOpen = sheet === 388;
            const target = TILE_BY_KEY[toOpen ? openK : closedK] ?? 0;
            if (!target)
                return true;
            const ox = x - Math.floor(st.frameX[i] % 20 / 18);
            const oy = y - Math.floor(st.frameY[i] % 90 / 18);
            for (let ix = ox; ix < ox + 1; ix++) {
                for (let iy = oy; iy < oy + 5; iy++) {
                    if (!st.inBounds(ix, iy))
                        continue;
                    const ii = st.idx(ix, iy);
                    w.skipCell(ix, iy);
                    st.setTile(ix, iy, target, st.frameX[ii], st.frameY[ii]);
                }
            }
            return true;
        }
        case 405: // 壁炉 3×2 frameX ±54(:1021-1038)
            flipBlock(w, x, y, 54, 36, 3, 2, 'x', 54, 54);
            return true;
        case 406: // 烟囱 3×3 frameY +54/-108(:1039-1056)
            flipBlock(w, x, y, 54, 54, 3, 3, 'y', 108, 54);
            return true;
        case 411: // 引爆器 2×2 frameX ±36(:1057-1074)
            flipBlock(w, x, y, 36, 36, 2, 2, 'x', 36, 36);
            return true;
        case 421:
        case 422: { // 传送带反向互换(:844-861;有致动器不响应)
            if (st.wire[i] & 16)
                return true;
            const other = TILE_BY_KEY[sheet === 421 ? 'v_422_conveyor_belt_ccw' : 'v_421_conveyorbeltleft'] ?? 0;
            if (other)
                st.setTile(x, y, other, st.frameX[i], st.frameY[i]);
            return true;
        }
        case 425: // 广播盒:读木牌文本聊天近似(:1087-1131;引擎无木牌系统)
            w.skipCell(x, y);
            w.skipCell(x + 1, y);
            ctx.toast('📢 广播盒触发');
            return true;
        case 442: return true; // 投射物垫板(触发源侧处理)
        case 443:
            geyserTrap(w, ctx, x, y);
            return true;
        case 452: // 呆萌气球机 3×3 frameX ±54(:1132-1149)
            flipBlock(w, x, y, 54, 54, 3, 3, 'x', 54, 54);
            return true;
        case 455: // 派对中心(:1789-1791;派对系统占位)
            ctx.toast('🎉 派对开始!');
            return true;
        case 476: return true; // 高尔夫球洞(无高尔夫系统)
        case 497: // 马桶(frameY/40,同 case 15 分支)
            if (w.checkMech(x, y, 60))
                ctx.sfx('splash', x * 16 + 8, y * 16 + 8);
            return true;
        case 506: // 巴斯特雕像 2×3 frameX ±72(:2239-2261)
            flipBlock(w, x, y, 72, 54, 2, 3, 'x', 72, 72);
            return true;
        case 531:
            fireBoulderStatue(w, ctx, x, y);
            return true;
        case 546:
        case 557: // 格栅开/关互换(:2262-2271)
            swapTile(w, x, y, 'v_546_grate', 'v_557_grateclosed');
            return true;
        case 565: // 造雾机 2×2 frameX ±36(:1358-1379)
            flipBlock(w, x, y, 72, 36, 2, 2, 'x', 36, 36);
            return true;
        case 593: // 小火山 frameX ±18(:1434-1445;动画近似粒子)
            flipCell(w, x, y, 18);
            ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
            return true;
        case 594: // 大火山 2×2 frameX ±36(:1446-1470)
            flipBlock(w, x, y, 72, 36, 2, 2, 'x', 36, 36);
            ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
            return true;
    }
    return false;
}
/** 装配:把器件表挂到 Wiring(器件 case 之外的默认落点) */
export function attachDevices(w, ctx) {
    w.device = (ww, sheet, x, y) => deviceTable(ww, ctx, sheet, x, y);
    w.teleportPair = (a, b) => ctx.teleportPair(a, b);
}
