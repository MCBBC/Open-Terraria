// UI 缩放体系 —— 对齐原版 Main.UIScale 语义：
//   Main.cs:3192-3198  UIScale = displayHeight / 1080 * 1.1
//   Main.cs:2082-2085  UIScaleMax = max(1, min(W/800, H/600))
// UI 逻辑分辨率 = 实际屏幕 / uiScale，随窗口动态变化（非固定 800×600 基准）。
export const UIScale = {
    cssW: 800,
    cssH: 600,
    dpr: 1,
    /** UI 缩放倍率（≥1） */
    scale: 1,
    /** UI 逻辑分辨率 */
    get logicalW() { return this.cssW / this.scale; },
    get logicalH() { return this.cssH / this.scale; },
    /** 鼠标位置（UI 逻辑坐标，每帧由 VUI 刷新） */
    mouseX: 0,
    mouseY: 0,
    resize(cssW, cssH, dpr = window.devicePixelRatio || 1) {
        this.cssW = cssW;
        this.cssH = cssH;
        this.dpr = dpr;
        this.recompute();
    },
    /** 设置界面可调的用户缩放偏好（倍率作用于默认公式） */
    userScale: 1,
    /** 尺寸变化回调（UserInterface/VUI 注入，避免循环依赖） */
    onResize: null,
    recompute() {
        this.scale = Math.max(1, Math.min(this.cssW / 800, this.cssH / 600), this.cssH / 1080 * 1.1) * this.userScale;
        // 尺寸变化 → 全树重排
        this.onResize?.();
    },
};
