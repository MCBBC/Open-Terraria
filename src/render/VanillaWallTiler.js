import { TILE } from '../core/constants';
// 4 位基数掩码位序（与 tile framing 不同！）：N=1 W=2 E=4 S=8
// 20×4 查找表（TEdit WallFrameLookup）：mask → [v0,v1,v2,v3] 的 (col,row)
const WALL_LOOKUP = [
    /* 0 none */ [[9, 3], [10, 3], [11, 3], [6, 6]],
    /* 1 N    */ [[6, 3], [7, 3], [8, 3], [4, 6]],
    /* 2 W    */ [[12, 0], [12, 1], [12, 2], [12, 5]],
    /* 3 N+W  */ [[1, 4], [3, 4], [5, 4], [3, 6]],
    /* 4 E    */ [[9, 0], [9, 1], [9, 2], [9, 5]],
    /* 5 N+E  */ [[0, 4], [2, 4], [4, 4], [2, 6]],
    /* 6 W+E  */ [[6, 4], [7, 4], [8, 4], [5, 6]],
    /* 7 N+W+E */ [[1, 2], [2, 2], [3, 2], [3, 5]],
    /* 8 S    */ [[6, 0], [7, 0], [8, 0], [6, 5]],
    /* 9 N+S  */ [[5, 0], [5, 1], [5, 2], [5, 5]],
    /* 10 W+S */ [[1, 3], [3, 3], [5, 3], [1, 6]],
    /* 11 N+W+S */ [[4, 0], [4, 1], [4, 2], [4, 5]],
    /* 12 E+S */ [[0, 3], [2, 3], [4, 3], [0, 6]],
    /* 13 N+E+S */ [[0, 0], [0, 1], [0, 2], [0, 5]],
    /* 14 W+E+S */ [[1, 0], [2, 0], [3, 0], [1, 5]],
    /* 15 ALL center0 */ [[1, 1], [2, 1], [3, 1], [2, 5]],
    /* 16 ALL center1 */ [[6, 1], [7, 1], [8, 1], [7, 5]],
    /* 17 ALL center2 */ [[6, 2], [7, 2], [8, 2], [8, 5]],
    /* 18 ALL center3 */ [[10, 0], [10, 1], [10, 2], [10, 5]],
    /* 19 ALL center4 */ [[11, 0], [11, 1], [11, 2], [11, 5]],
];
// 全邻时的中心子模式：CenterWallFrameLookup[y%3][x%3]（TEdit 源序）
const CENTER = [
    [2, 0, 0],
    [0, 1, 4],
    [0, 3, 0],
];
// Phlebas（largeFrame 1）：4×3 重复块，1-based
const PHLEBAS = [
    [2, 4, 2],
    [1, 3, 1],
    [2, 2, 4],
    [1, 1, 3],
];
// Lazure（largeFrame 2）：2×2 重复块，1-based
const LAZURE = [
    [1, 3],
    [2, 4],
];
const STRIDE = 36; // 32px 帧 + 4px 间隔
export class VanillaWallTiler {
    constructor(atlas) {
        Object.defineProperty(this, "atlas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: atlas
        });
        Object.defineProperty(this, "imgCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    wallImg(wallId) {
        let img = this.imgCache.get(wallId);
        if (img === undefined) {
            const m = this.atlas ? this.atlas.vanilla.walls[String(wallId)] : null;
            img = m && this.atlas ? this.atlas.vimages.get(m.sheet) ?? null : null;
            this.imgCache.set(wallId, img);
        }
        return img;
    }
    /** 邻居判定（TEdit HasWallNeighbor）：wall>0 任意 id 都算，或截断墙方块。
     *  truncates = 内部 tile id 数组（wld 54 玻璃 / 328 / 459 / 748 对应的 v_ 键） */
    hasNeighbor(st, x, y, truncates) {
        if (!st.inBounds(x, y))
            return false;
        const i = st.idx(x, y);
        if (st.wall[i] > 0)
            return true;
        if (st.flags[i] && truncates.includes(st.type[i]))
            return true;
        return false;
    }
    /** 绘制一格墙（源 32×32，目标以格为中心的 2×2 格大小） */
    draw(ctx, st, x, y, wallId, truncates, px, py) {
        const img = this.wallImg(wallId);
        if (!img)
            return;
        // 掩码：N=1 W=2 E=4 S=8
        let mask = 0;
        if (this.hasNeighbor(st, x, y - 1, truncates))
            mask |= 1;
        if (this.hasNeighbor(st, x - 1, y, truncates))
            mask |= 2;
        if (this.hasNeighbor(st, x + 1, y, truncates))
            mask |= 4;
        if (this.hasNeighbor(st, x, y + 1, truncates))
            mask |= 8;
        // 全邻 → 中心子模式
        if (mask === 15)
            mask += CENTER[y % 3][x % 3];
        // 变体（largeFrame 三模式）
        const lf = this.atlas ? this.atlas.vanilla.walls[String(wallId)]?.largeFrame ?? 0 : 0;
        let v;
        if (lf === 1)
            v = PHLEBAS[y % 4][x % 3] - 1;
        else if (lf === 2)
            v = LAZURE[x % 2][y % 2] - 1;
        else
            v = ((x * 7) + (y * 11)) % 3;
        const entry = WALL_LOOKUP[mask];
        if (!entry)
            return;
        const fr = entry[v] ?? entry[0];
        const sx = fr[0] * STRIDE, sy = fr[1] * STRIDE;
        if (sx + 32 > img.width || sy + 32 > img.height)
            return; // 变体3 超出矮表（默认模式不会发生）
        ctx.drawImage(img, sx, sy, 32, 32, px - TILE / 2, py - TILE / 2, 32, 32);
    }
    /** 墙帧（col,row）——调试/纠错面板定位用 */
    frameAt(st, x, y, wallId, truncates) {
        let mask = 0;
        if (this.hasNeighbor(st, x, y - 1, truncates))
            mask |= 1;
        if (this.hasNeighbor(st, x - 1, y, truncates))
            mask |= 2;
        if (this.hasNeighbor(st, x + 1, y, truncates))
            mask |= 4;
        if (this.hasNeighbor(st, x, y + 1, truncates))
            mask |= 8;
        if (mask === 15)
            mask += CENTER[y % 3][x % 3];
        const lf = this.atlas ? this.atlas.vanilla.walls[String(wallId)]?.largeFrame ?? 0 : 0;
        let v;
        if (lf === 1)
            v = PHLEBAS[y % 4][x % 3] - 1;
        else if (lf === 2)
            v = LAZURE[x % 2][y % 2] - 1;
        else
            v = ((x * 7) + (y * 11)) % 3;
        const fr = WALL_LOOKUP[mask]?.[v] ?? [1, 1];
        return { col: fr[0], row: fr[1] };
    }
    hasTexture(wallId) {
        return this.wallImg(wallId) !== null;
    }
}
