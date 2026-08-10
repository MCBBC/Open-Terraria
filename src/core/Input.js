// 键盘/鼠标输入。UI 打开时屏蔽游戏输入。
export class Input {
    constructor(el) {
        Object.defineProperty(this, "keys", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "mouseX", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "mouseY", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "mouseDown", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "rightDown", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "uiBlocking", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        }); // 背包/合成等打开时为 true
        Object.defineProperty(this, "wheelDelta", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "keydownHandlers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "el", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.el = el;
        window.addEventListener('keydown', (e) => {
            if (e.repeat)
                return;
            this.keys.add(e.code);
            this.keydownHandlers.forEach((fn) => fn(e.code));
            if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code))
                e.preventDefault();
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.keys.clear());
        el.addEventListener('mousemove', (e) => {
            const r = this.el.getBoundingClientRect();
            this.mouseX = e.clientX - r.left;
            this.mouseY = e.clientY - r.top;
        });
        // mousedown 挂 window：不依赖事件目标是否恰好是 canvas
        window.addEventListener('mousedown', (e) => {
            // UI 面板上的点击不穿透为游戏输入
            if (e.target?.closest?.('.sw-panel, .sw-slot, .sw-recipe, .sw-btn'))
                return;
            if (e.button === 0)
                this.mouseDown = true;
            if (e.button === 2)
                this.rightDown = true;
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0)
                this.mouseDown = false;
            if (e.button === 2)
                this.rightDown = false;
        });
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        el.addEventListener('wheel', (e) => {
            this.wheelDelta += Math.sign(e.deltaY);
            e.preventDefault();
        }, { passive: false });
    }
    down(code) {
        return !this.uiBlocking && this.keys.has(code);
    }
    /** 每帧末调用，处理一次性输入（滚轮切换快捷栏） */
    endFrame() {
        this.wheelDelta = 0;
    }
}
