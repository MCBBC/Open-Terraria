import { T } from '../data/tiles';
/** 关门锚点帧（顶格）：[frameX, frameY] */
export function doorClosedFrame(style, variant = 0) {
    return [variant * 18 + 54 * Math.floor(style / 36), 54 * (style % 36)];
}
/** 由任意关门格帧反推 style */
export function doorStyleOf(fx, fy) {
    return Math.floor(fx / 54) * 36 + Math.floor(fy / 54);
}
/** 生成期放置整扇关闭门（1×3，锚点在顶格 (x,y)） */
export function placeDoorClosed(st, x, y, style, variant = 0) {
    const [fx, fy] = doorClosedFrame(style, variant);
    for (let dy = 0; dy < 3; dy++) {
        if (st.inBounds(x, y + dy))
            st.setTileSilent(x, y + dy, T.DOOR_CLOSED, fx, fy + dy * 18);
    }
}
/** 挖除含 (x,y) 格的整扇门（关门 1×3 / 开门 2×3，帧内偏移 = frame%/格步长）。
 *  返回掉落锚点；非门格返回 null。 */
export function clearDoorAt(st, x, y) {
    const t = st.get(x, y);
    if (t !== T.DOOR_CLOSED && t !== T.DOOR_OPEN)
        return null;
    const i = st.idx(x, y);
    const w = t === T.DOOR_OPEN ? 2 : 1;
    const col = Math.floor(st.frameX[i] / 18) % w;
    const row = Math.floor(st.frameY[i] / 18) % 3;
    const ax = x - col, ay = y - row;
    for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < 3; dy++) {
            if (st.inBounds(ax + dx, ay + dy) && st.get(ax + dx, ay + dy) === t)
                st.setTile(ax + dx, ay + dy, 0);
        }
    }
    return [ax, ay];
}
/** 开门（原版 OpenDoor 语义）。direction: 玩家面朝方向 ±1。
 *  返回 false = 目标侧被挡（调用方应换 -direction 重试）。 */
export function openDoor(st, x, y, direction) {
    if (st.get(x, y) !== T.DOOR_CLOSED)
        return false;
    // 锚点行：frameY % 54 === 0
    let ay = y;
    while (st.get(x, ay) === T.DOOR_CLOSED && st.frameY[st.idx(x, ay)] % 54 !== 0) {
        if (--ay < 0)
            return false;
    }
    if (st.get(x, ay) !== T.DOOR_CLOSED)
        return false;
    const ai = st.idx(x, ay);
    const style = doorStyleOf(st.frameX[ai], st.frameY[ai]);
    const col = Math.floor(style / 36), row = style % 36;
    // 目标侧列须为空（原版只砍草藤类，这里保守要求空格）
    const clearX = direction === -1 ? x - 1 : x + 1;
    for (let dy = 0; dy < 3; dy++) {
        if (st.get(clearX, ay + dy) !== 0)
            return false;
    }
    // 开门占 2 列：direction==-1 锚点左移一格、frameX+36（原版 num1/x 逻辑）
    const ax = direction === -1 ? x - 1 : x;
    const baseFx = 72 * col + (direction === -1 ? 36 : 0);
    for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 3; dy++) {
            if (!st.inBounds(ax + dx, ay + dy))
                continue;
            st.setTile(ax + dx, ay + dy, T.DOOR_OPEN, baseFx + dx * 18, 54 * row + dy * 18);
        }
    }
    return true;
}
/** 关门（原版 CloseDoor 语义，点到的可以是开门 2×3 中任意一格）。
 *  blocked = 实体占格判定（原版 Collision.EmptyTile(ignoreTiles:true)：只看玩家/NPC，忽略图格——
 *  关门列此刻还是开门图格）。返回 false = 门位被实体挡住。 */
export function closeDoor(st, x, y, rng = Math.random, blocked) {
    if (st.get(x, y) !== T.DOOR_OPEN)
        return false;
    // 锚点行：frameY % 54 === 0
    let ay = y;
    while (st.get(x, ay) === T.DOOR_OPEN && st.frameY[st.idx(x, ay)] % 54 !== 0) {
        if (--ay < 0)
            return false;
    }
    if (st.get(x, ay) !== T.DOOR_OPEN)
        return false;
    const fx = st.frameX[st.idx(x, ay)];
    // 原版 switch(frameX % 72)：关门列与开门方向
    let closedX;
    switch (fx % 72) {
        case 18:
            closedX = x - 1;
            break; // 点到右侧列 → 锚点在左
        case 36:
            closedX = x + 1;
            break; // direction==-1 的锚点列
        case 54:
            closedX = x;
            break; // direction==-1 的右侧列
        default:
            closedX = x;
            break; // 0：direction==+1 锚点列
    }
    // 关门位实体检查（原版 Collision.EmptyTile(ignoreTiles:true)：图格忽略，只挡实体）
    for (let dy = 0; dy < 3; dy++) {
        if (blocked?.(closedX, ay + dy))
            return false;
    }
    // 样式行先取（清格后 frameY 归零；原版关门不重写 frameY，样式行开门/关门一致）
    const col = Math.floor(fx / 72);
    const row = Math.floor(st.frameY[st.idx(x, ay)] / 54) % 36;
    // 清两列再写关门列（原版 num6..num6+1 循环）
    const sweepL = Math.min(closedX, x - 1), sweepR = Math.max(closedX + 1, x + 1);
    for (let sx = sweepL; sx <= sweepR; sx++) {
        for (let dy = 0; dy < 3; dy++) {
            if (!st.inBounds(sx, ay + dy))
                continue;
            st.setTile(sx, ay + dy, 0);
        }
    }
    const [cfx] = doorClosedFrame(col * 36, Math.floor(rng() * 3));
    for (let dy = 0; dy < 3; dy++) {
        if (!st.inBounds(closedX, ay + dy))
            continue;
        st.setTile(closedX, ay + dy, T.DOOR_CLOSED, cfx, 54 * row + dy * 18);
    }
    return true;
}
