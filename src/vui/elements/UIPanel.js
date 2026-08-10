// 移植自 Terarria1405/GameContent/UI/Elements/UIPanel.cs
// 九宫格：cornerSize=12, barSize=4；背景 (63,82,151)*0.785，边框黑*0.785
import { UIElement } from '../core/UIElement';
import { rgb } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
export class UIPanel extends UIElement {
    constructor() {
        super();
        Object.defineProperty(this, "cornerSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 12
        });
        Object.defineProperty(this, "barSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 4
        });
        Object.defineProperty(this, "borderColor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { r: 0, g: 0, b: 0, a: 200 }
        });
        Object.defineProperty(this, "backgroundColor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rgb(63, 82, 151, 200)
        });
        this.setPadding(this.cornerSize);
    }
    drawPanel(batch, textureKey, color) {
        const tex = UITextures.get(textureKey);
        if (!tex)
            return;
        const d = this.getDimensions();
        const cs = this.cornerSize;
        const bs = this.barSize;
        const p1x = Math.round(d.x), p1y = Math.round(d.y);
        const p2x = p1x + Math.round(d.width) - cs, p2y = p1y + Math.round(d.height) - cs;
        const w = p2x - p1x - cs;
        const h = p2y - p1y - cs;
        // 四角
        batch.draw(tex, p1x, p1y, { color });
        batch.draw({ img: tex.img, sx: tex.sx + cs + bs, sy: tex.sy, sw: cs, sh: cs }, p2x, p1y, { color });
        batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy + cs + bs, sw: cs, sh: cs }, p1x, p2y, { color });
        batch.draw({ img: tex.img, sx: tex.sx + cs + bs, sy: tex.sy + cs + bs, sw: cs, sh: cs }, p2x, p2y, { color });
        // 四边
        batch.draw({ img: tex.img, sx: tex.sx + cs, sy: tex.sy, sw: bs, sh: cs }, p1x + cs, p1y, { color, scaleX: w / bs, scaleY: 1 });
        batch.draw({ img: tex.img, sx: tex.sx + cs, sy: tex.sy + cs + bs, sw: bs, sh: cs }, p1x + cs, p2y, { color, scaleX: w / bs, scaleY: 1 });
        batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy + cs, sw: cs, sh: bs }, p1x, p1y + cs, { color, scaleX: 1, scaleY: h / bs });
        batch.draw({ img: tex.img, sx: tex.sx + cs + bs, sy: tex.sy + cs, sw: cs, sh: bs }, p2x, p1y + cs, { color, scaleX: 1, scaleY: h / bs });
        // 中心
        batch.draw({ img: tex.img, sx: tex.sx + cs, sy: tex.sy + cs, sw: bs, sh: bs }, p1x + cs, p1y + cs, { color, scaleX: w / bs, scaleY: h / bs });
    }
    drawSelf(batch) {
        this.drawPanel(batch, 'UI_PanelBackground', this.backgroundColor);
        this.drawPanel(batch, 'UI_PanelBorder', this.borderColor);
    }
}
