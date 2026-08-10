// 角色 sprite 程序化生成：玩家动画帧 + 敌人形象
import { MATS, shade } from './Palette';
function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
}
class Px {
    constructor(ctx, w, h, ox = 0, oy = 0) {
        Object.defineProperty(this, "ctx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ctx
        });
        Object.defineProperty(this, "w", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: w
        });
        Object.defineProperty(this, "h", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: h
        });
        Object.defineProperty(this, "ox", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ox
        });
        Object.defineProperty(this, "oy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: oy
        });
        Object.defineProperty(this, "img", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.img = ctx.createImageData(w, h);
    }
    set(x, y, color, a = 255) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h)
            return;
        const v = parseInt(color.slice(1), 16);
        const i = (y * this.w + x) * 4;
        this.img.data[i] = (v >> 16) & 255;
        this.img.data[i + 1] = (v >> 8) & 255;
        this.img.data[i + 2] = v & 255;
        this.img.data[i + 3] = a;
    }
    rect(x0, y0, w, h, color, a = 255) {
        for (let y = y0; y < y0 + h; y++)
            for (let x = x0; x < x0 + w; x++)
                this.set(x, y, color, a);
    }
    flush() { this.ctx.putImageData(this.img, this.ox, this.oy); }
}
// 玩家：20 宽 × 42 高 hitbox，sprite 画 24×44，帧横排
// 形象参考原版轮廓比例（大头小身、刺猬棕发、蓝上衣棕长裤），像素画为原创绘制
// 布局（y 坐标全部落帧内）：发 0-8 / 头 6-17 / 躯干 19-30 / 腿 31-40 / 鞋 41-42
export const PLAYER_FRAME_W = 24;
export const PLAYER_FRAME_H = 44;
function drawPlayerFrame(px, pose) {
    const skin = MATS.skin.base, skinDark = shade(MATS.skin.base, 0.82);
    const shirt = '#3E5CBE', shirtDark = '#2C4494', shirtLight = '#5A78D4';
    const pants = '#4A3826', pantsDark = '#382A1C';
    const hair = '#8A5A28', hairDark = '#6A4420';
    const boot = '#33241A';
    const eyeW = '#F0F0F0';
    const cx = 12;
    const bob = pose.bodyBob; // ±1，只作用于头/躯干/手臂，脚固定在地面
    // ---- 头发（帧顶，y 0..8）----
    const hy = 0 + bob;
    px.rect(cx - 6, hy + 2, 12, 6, hair); // 发主体
    px.rect(cx - 7, hy + 4, 2, 6, hair); // 后脑勺
    px.rect(cx + 6, hy + 4, 2, 4, hair); // 鬓角
    // 发刺（原版后掠感）
    px.set(cx - 5, hy + 0, hair);
    px.set(cx - 2, hy + 0, hair);
    px.set(cx + 2, hy + 0, hair);
    px.set(cx + 5, hy + 0, hair);
    px.set(cx - 4, hy + 1, hair);
    px.set(cx + 1, hy + 1, hair);
    px.set(cx + 4, hy + 1, hair);
    px.rect(cx - 6, hy + 7, 12, 1, hairDark); // 刘海底边
    // ---- 头（y 6..17，大头小身）----
    const fy = 6 + bob;
    px.rect(cx - 6, fy, 12, 12, skin); // 脸
    px.rect(cx - 6, fy + 10, 12, 2, skinDark); // 下颌阴影
    px.rect(cx - 1, fy + 11, 2, 2, skinDark); // 脖子
    // 眼白 + 瞳孔 + 眉（面向右）
    px.rect(cx + 0, fy + 4, 2, 3, eyeW);
    px.rect(cx + 4, fy + 4, 2, 3, eyeW);
    px.set(cx + 1, fy + 5, '#183050');
    px.set(cx + 5, fy + 5, '#183050');
    px.rect(cx + 0, fy + 3, 2, 1, hairDark);
    px.rect(cx + 4, fy + 3, 2, 1, hairDark);
    // ---- 躯干（y 19..30）----
    const ty = 19 + bob;
    px.rect(cx - 5, ty, 10, 11, shirt); // 上衣
    px.rect(cx - 5, ty, 2, 11, shirtLight); // 左受光
    px.rect(cx + 3, ty, 2, 11, shirtDark); // 右背光
    px.rect(cx - 5, ty + 9, 10, 2, pantsDark); // 腰带
    // ---- 手臂（y 19..28，手 28..30）----
    const ay = 19 + bob;
    px.rect(cx - 8 + pose.armSwing, ay + 1, 3, 8, shirtDark);
    px.rect(cx + 5 + pose.armSwing, ay + 1, 3, 8, shirtDark);
    px.rect(cx - 8 + pose.armSwing, ay + 9, 3, 3, skin);
    px.rect(cx + 5 + pose.armSwing, ay + 9, 3, 3, skin);
    // ---- 腿（y 31..40，脚固定）----
    const drawLeg = (offset, swing) => {
        const lx = cx + offset;
        for (let y = 31; y <= 40; y++) {
            const bend = y > 35 ? swing : swing * 0.4;
            px.rect(lx + bend, y, 4, 1, pants);
        }
        px.rect(lx + swing, 40, 4, 1, pantsDark); // 裤脚
        px.rect(lx + swing, 41, 5, 2, boot); // 鞋
    };
    drawLeg(-6, pose.legL);
    drawLeg(2, pose.legR);
}
export function generatePlayerSheet() {
    const poses = [
        { legL: 0, legR: 0, armSwing: 0, bodyBob: 0 }, // 0 idle
        { legL: -3, legR: 2, armSwing: -1, bodyBob: 0 }, // 1 walk1
        { legL: -1, legR: 1, armSwing: 0, bodyBob: -1 }, // 2 walk2（收腿过渡）
        { legL: 2, legR: -3, armSwing: 1, bodyBob: 0 }, // 3 walk3
        { legL: -3, legR: 3, armSwing: 0, bodyBob: 0 }, // 4 jump（双腿分开）
    ];
    const [c, ctx] = mk(PLAYER_FRAME_W * poses.length, PLAYER_FRAME_H);
    poses.forEach((p, i) => {
        const px = new Px(ctx, PLAYER_FRAME_W, PLAYER_FRAME_H, i * PLAYER_FRAME_W, 0);
        drawPlayerFrame(px, p);
        px.flush();
    });
    return c;
}
function slimeSprite(color) {
    // 28×24 圆润 blob，squash/stretch 渲染时变换
    const [c, ctx] = mk(28, 24);
    const px = new Px(ctx, 28, 24);
    for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 28; x++) {
            const dx = (x - 13.5) / 13.5, dy = (y - 12) / 12;
            const d = dx * dx + dy * dy;
            if (d > 1)
                continue;
            const edge = d > 0.82;
            const col = edge ? shade(color, 0.72) : y < 8 ? shade(color, 1.2) : color;
            px.set(x, y, col, 200);
        }
    }
    // 眼睛
    px.rect(8, 8, 3, 4, '#202020', 255);
    px.rect(16, 8, 3, 4, '#202020', 255);
    px.rect(9, 9, 1, 2, '#FFFFFF', 255);
    px.rect(17, 9, 1, 2, '#FFFFFF', 255);
    px.flush();
    return c;
}
function zombieSprite() {
    const [c, ctx] = mk(24, 44);
    const px = new Px(ctx, 24, 44);
    const skin = MATS.zombieSkin, shirt = '#5A5A6A', pants = '#3A3A4A';
    const cx = 12;
    // 腿
    px.rect(cx - 6, 26, 4, 16, pants);
    px.rect(cx + 2, 26, 4, 16, shade(pants, 0.8));
    px.rect(cx - 6, 42, 5, 2, '#2A2A32');
    px.rect(cx + 2, 42, 5, 2, '#2A2A32');
    // 躯干
    px.rect(cx - 6, 14, 12, 13, shirt);
    px.rect(cx - 6, 14, 3, 13, shade(shirt, 1.2));
    // 前伸手臂（僵尸姿势）
    px.rect(cx + 4, 16, 9, 3, skin.base);
    px.rect(cx + 12, 16, 3, 3, skin.light);
    px.rect(cx - 9, 16, 3, 9, skin.dark);
    // 头
    px.rect(cx - 6, 3, 12, 11, skin.base);
    px.rect(cx - 6, 3, 3, 11, skin.light);
    px.rect(cx - 6, 12, 12, 3, skin.dark);
    px.set(cx + 2, 7, '#C02020');
    px.set(cx + 5, 7, '#C02020');
    // 乱发
    px.rect(cx - 6, 1, 12, 3, '#2E4A2E');
    px.set(cx - 4, 0, '#2E4A2E');
    px.set(cx + 1, 0, '#2E4A2E');
    px.set(cx + 5, 0, '#2E4A2E');
    px.flush();
    return c;
}
function eyeSprite(big) {
    // 球形眼球 + 后拖尾巴，2 帧（虹膜位置）
    const S = big ? 40 : 26;
    const frames = 2;
    const [c, ctx] = mk(S * frames, S);
    for (let f = 0; f < frames; f++) {
        const px = new Px(ctx, S, S, f * S, 0);
        const cx = S / 2 - 1, cy = S / 2, r = S / 2 - 2;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = x - cx, dy = y - cy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d <= r) {
                    let col = MATS.eye.base;
                    if (d > r - 2)
                        col = MATS.eye.dark;
                    else if (dx < -r * 0.3 && dy < -r * 0.3)
                        col = '#FFFFFF';
                    // 虹膜
                    const ix = cx + (f === 0 ? 3 : -3), iy = cy + (f === 1 ? 2 : -1);
                    const di = Math.sqrt((x - ix) ** 2 + (y - iy) ** 2);
                    if (di < r * 0.34)
                        col = MATS.eyeRed.base;
                    if (di < r * 0.15)
                        col = '#101010';
                    px.set(x, y, col);
                }
                else if (d <= r + 1 && y > cy) {
                    // 尾巴触须（下半圈外延伸）
                    px.set(x, y, MATS.eyeRed.dark);
                }
            }
        }
        px.flush();
    }
    return c;
}
function eocPhase2Sprite() {
    // 克苏鲁之眼 P2：大眼球 + 嘴部裂开
    const S = 80, frames = 2;
    const [c, ctx] = mk(S * frames, S);
    for (let f = 0; f < frames; f++) {
        const px = new Px(ctx, S, S, f * S, 0);
        const cx = S / 2, cy = S / 2, r = S / 2 - 3;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = x - cx, dy = y - cy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d <= r) {
                    let col = d > r - 3 ? MATS.eyeRed.dark : MATS.eye.base;
                    if (dx < -r * 0.35 && dy < -r * 0.35 && d < r - 4)
                        col = '#F0F0F0';
                    // 裂嘴：下半部分牙齿
                    if (dy > r * 0.3) {
                        const tooth = Math.sin(x * 0.8 + f) > 0;
                        col = tooth ? '#E8E0D0' : '#601010';
                        if (d > r - 3)
                            col = MATS.eyeRed.dark;
                    }
                    px.set(x, y, col);
                }
            }
        }
        px.flush();
    }
    return c;
}
function batSprite() {
    // 20×14，2 帧扇翅
    const [c, ctx] = mk(40, 14);
    for (let f = 0; f < 2; f++) {
        const px = new Px(ctx, 20, 14, f * 20, 0);
        const body = '#5A3A6E', wing = '#4A2E5E';
        px.rect(8, 5, 5, 6, body);
        px.set(9, 4, body);
        px.set(11, 4, body);
        px.set(9, 3, '#C02020');
        px.set(12, 3, '#C02020'); // 眼
        // 翅膀
        const lift = f === 0 ? 0 : 3;
        for (let i = 0; i < 7; i++) {
            px.set(7 - i, 6 - Math.round(lift * (1 - i / 7)), wing);
            px.set(7 - i, 7 - Math.round(lift * (1 - i / 7)), wing);
            px.set(13 + i, 6 - Math.round(lift * (1 - i / 7)), wing);
            px.set(13 + i, 7 - Math.round(lift * (1 - i / 7)), wing);
        }
        px.flush();
    }
    return c;
}
function guideSprite() {
    // 向导 NPC：类似玩家但配色不同、无动画需求（单帧 + 走路翻转）
    const [c, ctx] = mk(24, 44);
    const px = new Px(ctx, 24, 44);
    const skin = MATS.skin, shirt = '#3A7A4A', pants = '#6A5A3A', hair = '#C8A030';
    const cx = 12;
    px.rect(cx - 6, 26, 4, 16, pants);
    px.rect(cx + 2, 26, 4, 16, shade(pants, 0.85));
    px.rect(cx - 6, 42, 5, 2, '#4A3020');
    px.rect(cx + 2, 42, 5, 2, '#4A3020');
    px.rect(cx - 5, 14, 10, 13, shirt);
    px.rect(cx - 5, 14, 3, 13, shade(shirt, 1.2));
    px.rect(cx - 7, 16, 3, 10, shade(shirt, 0.85));
    px.rect(cx + 5, 16, 3, 10, shade(shirt, 0.7));
    px.rect(cx - 6, 3, 12, 11, skin.base);
    px.rect(cx - 6, 11, 12, 3, skin.dark);
    px.set(cx + 2, 7, '#202020');
    px.set(cx + 5, 7, '#202020');
    px.rect(cx - 6, 1, 12, 3, hair);
    px.rect(cx - 7, 2, 2, 8, hair);
    px.flush();
    return c;
}
export function generateEnemySprites() {
    const m = new Map();
    m.set('slime_green', { canvas: slimeSprite('#5FD35F'), fw: 28, fh: 24 });
    m.set('slime_blue', { canvas: slimeSprite('#4FA8E0'), fw: 28, fh: 24 });
    m.set('zombie', { canvas: zombieSprite(), fw: 24, fh: 44 });
    m.set('demon_eye', { canvas: eyeSprite(false), fw: 26, fh: 26 });
    m.set('cave_bat', { canvas: batSprite(), fw: 20, fh: 14 });
    m.set('eye_of_cthulhu', { canvas: eocPhase2Sprite(), fw: 80, fh: 80 });
    m.set('servant_of_cthulhu', { canvas: eyeSprite(false), fw: 26, fh: 26 });
    m.set('guide', { canvas: guideSprite(), fw: 24, fh: 44 });
    return m;
}
