export const UI_FONT = '"Fusion Pixel 12px", "Microsoft YaHei", "PingFang SC", sans-serif';
const BASE_PX = 12;
let sharedCtxCache = null;
export const PixelText = {
    /** 字体是否已就绪（await UIFont.load() 后为 true） */
    ready: false,
    measure(text) {
        if (typeof document === 'undefined')
            return text.length * BASE_PX;
        const ctx = PixelText.sharedCtx();
        return ctx.measureText(text).width;
    },
    draw(ctx, text, x, y, color, scale = 1, outline = true) {
        const px = BASE_PX * scale;
        ctx.save();
        ctx.font = `${px}px ${UI_FONT}`;
        ctx.textBaseline = 'top';
        const rx = Math.round(x), ry = Math.round(y);
        if (outline) {
            ctx.lineWidth = 2 * scale;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.lineJoin = 'round';
            ctx.strokeText(text, rx, ry);
        }
        ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${(color.a / 255).toFixed(3)})`;
        ctx.fillText(text, rx, ry);
        ctx.restore();
    },
    /** 测量用共享 context */
    sharedCtx() {
        if (!sharedCtxCache) {
            const c = document.createElement('canvas');
            c.width = 8;
            c.height = 8;
            sharedCtxCache = c.getContext('2d');
            sharedCtxCache.font = `${BASE_PX}px ${UI_FONT}`;
        }
        return sharedCtxCache;
    },
    /** 载入字体（await document.fonts.load），失败回退系统字体 */
    async load() {
        if (typeof document === 'undefined' || !('fonts' in document))
            return false;
        try {
            await document.fonts.load(`${BASE_PX}px "Fusion Pixel 12px"`);
            // 校验真的拿到了（离线/文件缺失时 load 也会 resolve）
            PixelText.ready = document.fonts.check(`${BASE_PX}px "Fusion Pixel 12px"`);
        }
        catch {
            PixelText.ready = false;
        }
        return PixelText.ready;
    },
};
