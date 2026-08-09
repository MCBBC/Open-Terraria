// 移植自 Terarria1405/UI/StyleDimension.cs
// 布局单位：pixels + precent * containerSize
export class StyleDimension {
  static Fill = new StyleDimension(0, 1);
  static Empty = new StyleDimension(0, 0);

  pixels = 0;
  precent = 0;

  constructor(pixels = 0, precent = 0) {
    this.pixels = pixels;
    this.precent = precent;
  }

  set(pixels: number, precent: number) {
    this.pixels = pixels;
    this.precent = precent;
  }

  getValue(containerSize: number): number {
    return this.pixels + this.precent * containerSize;
  }

  static fromPixels(pixels: number) { return new StyleDimension(pixels, 0); }
  static fromPercent(percent: number) { return new StyleDimension(0, percent); }
  static fromPixelsAndPercent(pixels: number, percent: number) { return new StyleDimension(pixels, percent); }
}
