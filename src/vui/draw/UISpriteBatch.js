import { PixelText } from './PixelText';
export function rgb(r, g, b, a = 255) { return { r, g, b, a }; }
export function css(c) { return `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(3)})`; }
export class UISpriteBatch {
    constructor(ctx) {
        Object.defineProperty(this, "ctx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ctx
        });
        Object.defineProperty(this, "clipStack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "tintCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.ctx.imageSmoothingEnabled = false;
    }
    /** 贴图绘制。scale 默认 1；origin 默认左上 */
    draw(rect, x, y, opts = {}) {
        if (!rect.sw || !rect.sh)
            return;
        const scale = opts.scale ?? 1;
        const sx = opts.scaleX ?? scale;
        const sy = opts.scaleY ?? scale;
        const ctx = this.ctx;
        ctx.save();
        if (opts.alpha !== undefined)
            ctx.globalAlpha *= opts.alpha;
        const rot = opts.rotation ?? 0;
        const ox = opts.originX ?? 0;
        const oy = opts.originY ?? 0;
        if (rot !== 0 || ox !== 0 || oy !== 0) {
            ctx.translate(x, y);
            if (rot !== 0)
                ctx.rotate(rot);
            ctx.translate(-ox, -oy);
            x = 0;
            y = 0;
        }
        const src = (opts.color && !isWhite(opts.color)) ? this.tinted(rect, opts.color) : rect.img;
        const r = src === rect.img ? rect : { img: src, sx: 0, sy: 0, sw: rect.sw, sh: rect.sh };
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, Math.round(x), Math.round(y), rect.sw * sx, rect.sh * sy);
        ctx.restore();
    }
    /** 纯色矩形（MagicPixel 等价物：进度条填充/分隔线） */
    fillRect(x, y, w, h, color) {
        if (w <= 0 || h <= 0)
            return;
        this.ctx.fillStyle = css(color);
        this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    /** 描边像素文字（原版文字几乎都带黑描边） */
    drawString(text, x, y, color, scale = 1) {
        PixelText.draw(this.ctx, text, x, y, color, scale);
    }
    measureString(text, scale = 1) {
        return PixelText.measure(text) * scale;
    }
    pushClip(style) {
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(style.x, style.y, style.width, style.height);
        ctx.clip();
        this.clipStack.push(style);
    }
    popClip() {
        this.ctx.restore();
        this.clipStack.pop();
    }
    /** tint 缓存：multiply 铺色 + destination-in 用原 alpha 裁回 */
    tinted(rect, color) {
        const key = `${rect.img.src ?? '?'}|${rect.sx},${rect.sy},${rect.sw},${rect.sh}|${color.r},${color.g},${color.b},${color.a}`;
        let c = this.tintCache.get(key);
        if (c)
            return c;
        c = document.createElement('canvas');
        c.width = rect.sw;
        c.height = rect.sh;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(rect.img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
        cx.globalCompositeOperation = 'multiply';
        cx.fillStyle = css(color);
        cx.fillRect(0, 0, c.width, c.height);
        cx.globalCompositeOperation = 'destination-in';
        cx.drawImage(rect.img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
        this.tintCache.set(key, c);
        return c;
    }
}
function isWhite(c) { return c.r === 255 && c.g === 255 && c.b === 255 && c.a === 255; }
