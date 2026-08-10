// 移植自 Terarria1405/UI/StyleDimension.cs
// 布局单位：pixels + precent * containerSize
export class StyleDimension {
    constructor(pixels = 0, precent = 0) {
        Object.defineProperty(this, "pixels", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "precent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.pixels = pixels;
        this.precent = precent;
    }
    set(pixels, precent) {
        this.pixels = pixels;
        this.precent = precent;
    }
    getValue(containerSize) {
        return this.pixels + this.precent * containerSize;
    }
    static fromPixels(pixels) { return new StyleDimension(pixels, 0); }
    static fromPercent(percent) { return new StyleDimension(0, percent); }
    static fromPixelsAndPercent(pixels, percent) { return new StyleDimension(pixels, percent); }
}
Object.defineProperty(StyleDimension, "Fill", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new StyleDimension(0, 1)
});
Object.defineProperty(StyleDimension, "Empty", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new StyleDimension(0, 0)
});
