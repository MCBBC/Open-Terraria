import { hash2 } from '../core/rng';
export class WallTiler {
    constructor(atlas, files) {
        Object.defineProperty(this, "atlas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: atlas
        });
        Object.defineProperty(this, "files", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: files
        });
        Object.defineProperty(this, "groups", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        // ---- 梅花格（骰子5）连续图案 ----
        // 原版机制：砖块双层对角交叠 —— A 层平铺，B 层错开半个周期叠上，
        // 圆角/缺口互相咬合形成双轴交错的梅花格。合成 64×64 可平铺图案后按世界坐标连续取样。
        Object.defineProperty(this, "patterns", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    /** 启动期调用一次：分析精灵轮廓（需图片已解码，走 canvas 拷贝） */
    analyze() {
        for (const file of this.files) {
            const entry = this.atlas.data.files[file];
            const img = this.atlas.images.get(file);
            if (!entry || !img)
                continue;
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            for (const s of entry.sprites) {
                const rect = this.atlas.rect(file, s.name);
                if (!rect)
                    continue;
                const d = ctx.getImageData(rect.sx, rect.sy, rect.sw, rect.sh).data;
                const w = rect.sw, h = rect.sh;
                const bandOpaque = (x0, y0, bw, bh) => {
                    let n = 0, t = 0;
                    for (let y = y0; y < y0 + bh; y++) {
                        for (let x = x0; x < x0 + bw; x++) {
                            t++;
                            if (d[(y * w + x) * 4 + 3] > 40)
                                n++;
                        }
                    }
                    return t ? n / t : 0;
                };
                const coverage = bandOpaque(0, 0, w, h);
                if (coverage < 0.15)
                    continue; // 空块/噪声
                // 内墙变体（覆盖率 ≥75% 的完整块）强制归入 '0000'，
                // 否则半块边缘件会污染内墙组（此前"看起来没变"的根因）
                if (coverage >= 0.75) {
                    if (!this.groups.has('0000'))
                        this.groups.set('0000', []);
                    this.groups.get('0000').push({ file, name: s.name, rect });
                    continue;
                }
                const BAND = Math.max(2, Math.floor(Math.min(w, h) / 8));
                const innerOpaque = bandOpaque(BAND, BAND, w - BAND * 2, h - BAND * 2);
                if (innerOpaque < 0.4)
                    continue;
                // 相对比较：某侧带明显低于该精灵最实一侧 → 该侧敞开（变体向此侧收窄）
                const bands = [
                    bandOpaque(0, 0, w, BAND), // 上
                    bandOpaque(w - BAND, 0, BAND, h), // 右
                    bandOpaque(0, h - BAND, w, BAND), // 下
                    bandOpaque(0, 0, BAND, h), // 左
                ];
                const maxBand = Math.max(...bands);
                const open = [
                    bands[0] < maxBand * 0.6,
                    bands[1] < maxBand * 0.6,
                    bands[2] < maxBand * 0.6,
                    bands[3] < maxBand * 0.6,
                ];
                // 低于内墙阈值的件必是边缘/角块：若四侧都判封闭，强制最弱一侧敞开，
                // 防止半块件混入内墙组
                if (!open[0] && !open[1] && !open[2] && !open[3]) {
                    let minIdx = 0;
                    for (let k = 1; k < 4; k++)
                        if (bands[k] < bands[minIdx])
                            minIdx = k;
                    open[minIdx] = true;
                }
                const key = open.map((o) => (o ? 1 : 0)).join('');
                if (!this.groups.has(key))
                    this.groups.set(key, []);
                this.groups.get(key).push({ file, name: s.name, rect });
            }
        }
    }
    /**
     * 按 2×2 块的敞开方向选精灵。
     * open: [上右下左] 该侧是否有同类墙（true=有墙=封闭）
     */
    pick(closed, x, y) {
        // 需要的 key：封闭侧为 0（不敞开），敞开侧为 1
        const want = closed.map((c) => (c ? 0 : 1)).join('');
        let list = this.groups.get(want);
        if (!list || !list.length) {
            // 逐侧放宽：找不到精确组合时退回内墙
            list = this.groups.get('0000');
        }
        if (!list || !list.length)
            return null;
        const pick = list[Math.floor(hash2(x, y, 131) * list.length) % list.length];
        return pick.rect;
    }
    buildPatterns() {
        const interior = this.groups.get('0000') ?? [];
        for (const item of interior) {
            const c = document.createElement('canvas');
            c.width = 64;
            c.height = 64;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const r = item.rect;
            // A 层：64×64 四角平铺（完整覆盖），随后把整幅透明像素用自身土色填实
            // —— 完全封闭的内墙不再有砖缝漏光
            for (const [ox, oy] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
                ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, ox, oy, 32, 32);
            }
            {
                const img = ctx.getImageData(0, 0, 64, 64);
                const d = img.data;
                // 采样不透明像素平均色
                let sr = 0, sg = 0, sb = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] > 40) {
                        sr += d[i];
                        sg += d[i + 1];
                        sb += d[i + 2];
                        n++;
                    }
                }
                if (n > 0) {
                    sr = Math.round(sr / n);
                    sg = Math.round(sg / n);
                    sb = Math.round(sb / n);
                    for (let i = 0; i < d.length; i += 4) {
                        if (d[i + 3] <= 40) {
                            const f = 0.92 + hash2(i >> 2, 9, 17) * 0.16;
                            d[i] = Math.min(255, sr * f);
                            d[i + 1] = Math.min(255, sg * f);
                            d[i + 2] = Math.min(255, sb * f);
                            d[i + 3] = 255;
                        }
                    }
                    ctx.putImageData(img, 0, 0);
                }
            }
            // B 层：对角错开半周期（16px）叠上（含 -64 环绕保证无缝）。
            // 低透明度（35%）弱化梅花感 —— 整体读作一面连续的墙，
            // 只有隐约的交错纹理，避免"一大格一大格"的突兀中心块
            ctx.globalAlpha = 0.35;
            for (const [bx, by] of [[16, 16], [48, 16], [16, 48], [48, 48]]) {
                for (const [wx, wy] of [[0, 0], [-64, 0], [0, -64], [-64, -64]]) {
                    ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, bx + wx, by + wy, 32, 32);
                }
            }
            ctx.globalAlpha = 1;
            this.patterns.push(c);
        }
    }
    /** 内墙连续取样：按世界坐标从 64×64 图案取 16×16 */
    patternSample(x, y) {
        if (!this.patterns.length)
            return null;
        // 变体按 4×4 tile 超格 hash
        const supX = Math.floor(x / 4), supY = Math.floor(y / 4);
        const canvas = this.patterns[Math.floor(hash2(supX, supY, 313) * this.patterns.length) % this.patterns.length];
        return { canvas, sx: (x * 16) % 64, sy: (y * 16) % 64 };
    }
}
