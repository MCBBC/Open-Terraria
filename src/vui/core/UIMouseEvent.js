export class UIMouseEvent {
    constructor(target, mousePosition) {
        Object.defineProperty(this, "target", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: target
        });
        Object.defineProperty(this, "mousePosition", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: mousePosition
        });
    }
}
export class UIScrollWheelEvent {
    constructor(target, mousePosition, scrollWheelValue) {
        Object.defineProperty(this, "target", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: target
        });
        Object.defineProperty(this, "mousePosition", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: mousePosition
        });
        Object.defineProperty(this, "scrollWheelValue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: scrollWheelValue
        });
    }
}
