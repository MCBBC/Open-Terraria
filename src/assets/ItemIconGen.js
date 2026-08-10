// 物品图标程序化生成（16×16）
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { MATS, shade } from './Palette';
import { TILE_BY_KEY } from '../data/tiles';
import { RNG, hash2 } from '../core/rng';
function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    return [c, ctx];
}
function tileThumb(tileKey) {
    // 从 tile sheet 提取一个 16×16 缩样（用 mask=0 全边框帧）
    const [c, ctx] = mk(16, 16);
    // 直接画简化方块
    const m = matForTile(tileKey);
    const px = ctx.createImageData(16, 16);
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const n = hash2(x, y, TILE_BY_KEY[tileKey] ?? 3);
            let f = 0.92 + n * 0.16;
            if (y === 0 || x === 0)
                f *= 1.18;
            if (y === 15 || x === 15)
                f *= 0.82;
            const v = parseInt(shade(m.base, f).slice(1), 16);
            const i = (y * 16 + x) * 4;
            px.data[i] = (v >> 16) & 255;
            px.data[i + 1] = (v >> 8) & 255;
            px.data[i + 2] = v & 255;
            px.data[i + 3] = 255;
        }
    }
    ctx.putImageData(px, 0, 0);
    return c;
}
function matForTile(tileKey) {
    switch (tileKey) {
        case 'dirt': return MATS.dirt;
        case 'stone': return MATS.stone;
        case 'sand': return MATS.sand;
        case 'snow': return MATS.snow;
        case 'wood': return MATS.wood;
        case 'platform': return MATS.wood;
        default: return MATS.wood;
    }
}
function drawTool(kind, metal) {
    const [c, ctx] = mk(16, 16);
    const px = ctx.createImageData(16, 16);
    const set = (x, y, col) => {
        if (x < 0 || y < 0 || x > 15 || y > 15)
            return;
        const v = parseInt(col.slice(1), 16);
        const i = (y * 16 + x) * 4;
        px.data[i] = (v >> 16) & 255;
        px.data[i + 1] = (v >> 8) & 255;
        px.data[i + 2] = v & 255;
        px.data[i + 3] = 255;
    };
    // 柄：左下到右上
    for (let i = 0; i < 10; i++) {
        const x = 3 + i, y = 13 - i;
        set(x, y, i % 3 === 0 ? MATS.woodDark.dark : MATS.wood.base);
        set(x + 1, y, MATS.woodDark.dark);
    }
    if (kind === 'pick') {
        // 镐头：弧形横跨右上
        const head = [[6, 2], [7, 1], [8, 1], [9, 1], [10, 1], [11, 2], [12, 3], [13, 4], [5, 3], [4, 4], [3, 5]];
        for (const [x, y] of head) {
            set(x, y, metal.light);
            set(x, y + 1, metal.base);
        }
        set(8, 2, metal.light2);
    }
    else if (kind === 'axe') {
        // 斧刃：右上三角
        for (let y = 1; y <= 6; y++) {
            for (let x = 9; x <= 14; x++) {
                if (x - 9 + (6 - y) < 5 && x + y > 12)
                    set(x, y, (x === 9 || y === 6) ? metal.dark : metal.base);
            }
        }
        set(12, 1, metal.light);
        set(13, 2, metal.light);
    }
    else if (kind === 'hammer') {
        // 锤：方形锤头
        for (let y = 1; y <= 6; y++) {
            for (let x = 8; x <= 14; x++) {
                if (x === 8 || y === 1 || y === 6)
                    set(x, y, metal.dark);
                else
                    set(x, y, (x + y) % 3 === 0 ? metal.light : metal.base);
            }
        }
        set(11, 3, metal.light2);
    }
    else {
        // 剑：菱形刃
        for (let i = 0; i < 9; i++) {
            const wdt = i < 2 ? 1 : (i < 6 ? 2 : 1);
            const cx = 11, y = 1 + i;
            for (let dx = -wdt; dx <= wdt; dx++) {
                set(cx + dx, y, dx === 0 ? metal.light2 : (dx < 0 ? metal.light : metal.base));
            }
        }
        // 护手与柄
        for (let x = 7; x <= 15; x++)
            set(x, 10, x === 11 ? metal.light : metal.dark);
        set(10, 11, MATS.woodDark.base);
        set(10, 12, MATS.woodDark.dark);
    }
    ctx.putImageData(px, 0, 0);
    return c;
}
function drawBar(metal) {
    const [c, ctx] = mk(16, 16);
    const px = ctx.createImageData(16, 16);
    const set = (x, y, col) => {
        const v = parseInt(col.slice(1), 16);
        const i = (y * 16 + x) * 4;
        px.data[i] = (v >> 16) & 255;
        px.data[i + 1] = (v >> 8) & 255;
        px.data[i + 2] = v & 255;
        px.data[i + 3] = 255;
    };
    // 梯形锭
    for (let y = 6; y <= 11; y++) {
        const inset = y < 8 ? (8 - y) : 0;
        for (let x = 2 + inset; x <= 13 - inset; x++) {
            set(x, y, y === 6 ? metal.light2 : y === 11 ? metal.dark : metal.base);
        }
    }
    set(4, 7, metal.light);
    set(5, 7, metal.light);
    ctx.putImageData(px, 0, 0);
    return c;
}
function drawOreIcon(metal) {
    const [c, ctx] = mk(16, 16);
    const px = ctx.createImageData(16, 16);
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const n = hash2(x, y, 5);
            const v = parseInt(shade(MATS.stone.base, 0.85 + n * 0.3).slice(1), 16);
            const i = (y * 16 + x) * 4;
            px.data[i] = (v >> 16) & 255;
            px.data[i + 1] = (v >> 8) & 255;
            px.data[i + 2] = v & 255;
            px.data[i + 3] = 255;
        }
    }
    const rng = new RNG(9);
    for (let b = 0; b < 3; b++) {
        const bx = rng.int(2, 11), by = rng.int(2, 11);
        for (let dx = 0; dx < 2; dx++)
            for (let dy = 0; dy < 2; dy++) {
                const i = ((by + dy) * 16 + bx + dx) * 4;
                const v = parseInt(metal.light.slice(1), 16);
                px.data[i] = (v >> 16) & 255;
                px.data[i + 1] = (v >> 8) & 255;
                px.data[i + 2] = v & 255;
            }
    }
    ctx.putImageData(px, 0, 0);
    return c;
}
function simple(color, shape) {
    const [c, ctx] = mk(16, 16);
    const px = ctx.createImageData(16, 16);
    const set = (x, y, col) => {
        if (x < 0 || y < 0 || x > 15 || y > 15)
            return;
        const v = parseInt(col.slice(1), 16);
        const i = (y * 16 + x) * 4;
        px.data[i] = (v >> 16) & 255;
        px.data[i + 1] = (v >> 8) & 255;
        px.data[i + 2] = v & 255;
        px.data[i + 3] = 255;
    };
    shape(set);
    ctx.putImageData(px, 0, 0);
    return c;
}
function genItemIcon(key) {
    const def = ITEM_DEFS[ITEM_BY_KEY[key]];
    const metals = {
        copper: MATS.copper, iron: MATS.iron, silver: MATS.silver, gold: MATS.gold,
    };
    // 方块类
    if (def.tile && ['dirt', 'stone', 'sand', 'snow', 'wood', 'platform'].includes(def.tile)) {
        return tileThumb(def.tile);
    }
    if (def.tile === 'torch') {
        return simple('#000', (s) => {
            for (let y = 7; y <= 14; y++) {
                s(7, y, MATS.wood.base);
                s(8, y, MATS.wood.dark);
            }
            s(7, 4, MATS.fire.light2);
            s(8, 4, MATS.fire.light2);
            s(6, 5, MATS.fire.light);
            s(7, 5, MATS.fire.base);
            s(8, 5, MATS.fire.base);
            s(9, 5, MATS.fire.light);
            s(7, 6, MATS.fire.dark);
            s(8, 6, MATS.fire.dark);
        });
    }
    if (def.tile === 'workbench') {
        return simple('#000', (s) => {
            for (let x = 1; x <= 14; x++)
                for (let y = 1; y <= 5; y++)
                    s(x, y, y === 1 ? MATS.wood.light : MATS.wood.base);
            for (let y = 6; y <= 14; y++) {
                s(2, y, MATS.wood.dark);
                s(13, y, MATS.wood.dark);
            }
        });
    }
    if (def.tile === 'furnace') {
        return simple('#000', (s) => {
            for (let x = 1; x <= 14; x++)
                for (let y = 1; y <= 14; y++)
                    s(x, y, (x === 1 || y === 1) ? MATS.stone.light : (x === 14 || y === 14) ? MATS.stone.dark : MATS.stone.base);
            for (let x = 5; x <= 10; x++)
                for (let y = 8; y <= 13; y++)
                    s(x, y, y > 11 ? MATS.fire.light : MATS.fire.base);
        });
    }
    if (def.tile === 'anvil') {
        return simple('#000', (s) => {
            for (let x = 2; x <= 13; x++) {
                s(x, 3, MATS.metal.light2);
                s(x, 4, MATS.metal.base);
            }
            for (let y = 5; y <= 7; y++)
                for (let x = 6; x <= 9; x++)
                    s(x, y, MATS.metal.dark);
            for (let x = 4; x <= 11; x++) {
                s(x, 8, MATS.metal.base);
                s(x, 9, MATS.metal.dark);
            }
        });
    }
    if (def.tile === 'chest') {
        return simple('#000', (s) => {
            for (let x = 2; x <= 13; x++)
                for (let y = 3; y <= 13; y++)
                    s(x, y, y < 7 ? MATS.woodDark.light : MATS.woodDark.base);
            for (let x = 2; x <= 13; x++)
                s(x, 7, '#5A4520');
            s(7, 6, MATS.gold.light);
            s(8, 6, MATS.gold.light);
            s(7, 7, MATS.gold.base);
            s(8, 7, MATS.gold.base);
            s(7, 8, MATS.gold.dark);
            s(8, 8, MATS.gold.dark);
            for (let y = 3; y <= 13; y++) {
                s(2, y, MATS.gold.dark);
                s(13, y, MATS.gold.dark);
            }
        });
    }
    if (def.tile === 'door') {
        return simple('#000', (s) => {
            for (let x = 3; x <= 12; x++)
                for (let y = 1; y <= 14; y++)
                    s(x, y, (x === 3 || x === 12 || y === 1 || y === 14) ? MATS.wood.dark : MATS.wood.base);
            s(7, 8, MATS.gold.light);
            s(8, 8, MATS.gold.light);
        });
    }
    // 工具
    if (def.tool && ['pick', 'axe', 'sword'].includes(def.tool.type)) {
        const tier = key.split('_')[0];
        const metal = metals[tier] ?? MATS.wood;
        return drawTool(def.tool.type, metal);
    }
    // 锭
    if (key.endsWith('_bar')) {
        return drawBar(metals[key.replace('_bar', '')] ?? MATS.iron);
    }
    // 矿石
    if (key.endsWith('_ore')) {
        return drawOreIcon(metals[key.replace('_ore', '')] ?? MATS.copper);
    }
    switch (key) {
        case 'gel':
            return simple('#000', (s) => {
                for (let x = 4; x <= 11; x++)
                    for (let y = 6; y <= 12; y++) {
                        if ((x === 4 || x === 11) && (y === 6 || y === 12))
                            continue;
                        s(x, y, y === 6 ? '#8CE88C' : y === 12 ? '#3AA03A' : '#5FD35F');
                    }
                s(6, 8, '#B0F5B0');
                s(7, 8, '#B0F5B0');
            });
        case 'mushroom_item':
            return simple('#000', (s) => {
                for (let x = 5; x <= 10; x++)
                    s(x, 9, '#E8DFC8');
                for (let x = 3; x <= 12; x++)
                    s(x, 8, x < 5 || x > 10 ? MATS.copper.dark : MATS.copper.base);
                for (let x = 5; x <= 10; x++)
                    s(x, 7, MATS.copper.light);
                s(5, 8, '#F0E8D8');
                s(10, 7, '#F0E8D8');
            });
        case 'lens':
            return simple('#000', (s) => {
                for (let x = 4; x <= 11; x++)
                    for (let y = 4; y <= 11; y++) {
                        const dx = x - 7.5, dy = y - 7.5;
                        if (dx * dx + dy * dy < 15)
                            s(x, y, (dx < 0 && dy < 0) ? '#FFFFFF' : MATS.eye.base);
                    }
                s(7, 7, '#202020');
                s(8, 7, '#202020');
                s(7, 8, '#202020');
                s(8, 8, '#202020');
            });
        case 'suspicious_eye':
            return simple('#000', (s) => {
                for (let x = 2; x <= 13; x++)
                    for (let y = 2; y <= 13; y++) {
                        const dx = x - 7.5, dy = y - 7.5;
                        if (dx * dx + dy * dy < 30)
                            s(x, y, MATS.eye.base);
                    }
                for (let x = 6; x <= 9; x++)
                    for (let y = 5; y <= 10; y++)
                        s(x, y, MATS.eyeRed.base);
                s(7, 7, '#101010');
                s(8, 7, '#101010');
                s(7, 8, '#101010');
                s(8, 8, '#101010');
            });
        case 'lesser_healing_potion':
            return simple('#000', (s) => {
                for (let x = 6; x <= 9; x++)
                    for (let y = 3; y <= 5; y++)
                        s(x, y, '#9A8060');
                for (let x = 5; x <= 10; x++)
                    for (let y = 6; y <= 13; y++) {
                        if ((x === 5 || x === 10) && (y === 6 || y === 13))
                            continue;
                        s(x, y, y < 9 ? '#E83050' : '#B01838');
                    }
                s(6, 7, '#FF7088');
            });
        case 'coin_copper':
            return simple('#000', (s) => {
                for (let x = 5; x <= 10; x++)
                    for (let y = 5; y <= 10; y++) {
                        const dx = x - 7.5, dy = y - 7.5;
                        if (dx * dx + dy * dy < 8)
                            s(x, y, (dx < 0 && dy < 0) ? MATS.copper.light : MATS.copper.base);
                    }
            });
    }
    // 兜底：问号块
    return simple('#888', (s) => {
        for (let x = 3; x <= 12; x++)
            for (let y = 3; y <= 12; y++)
                s(x, y, '#777');
    });
}
export function generateAllItemIcons() {
    const map = new Map();
    for (const def of ITEM_DEFS) {
        map.set(ITEM_BY_KEY[def.key], genItemIcon(def.key));
    }
    return map;
}
