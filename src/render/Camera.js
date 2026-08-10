// 相机：跟随玩家 + 缓动 + 世界边界钳制
import { TILE } from '../core/constants';
export class Camera {
    /** 每帧把 zoom 向 target 缓动（指数趋近，永不到达导致卡死） */
    easeZoom() {
        const diff = this.zoomTarget - this.zoom;
        if (Math.abs(diff) < 0.0005) {
            this.zoom = this.zoomTarget;
            return;
        }
        this.zoom += diff * 0.18;
    }
    setZoomTarget(z) {
        this.zoomTarget = Math.max(Camera.ZOOM_MIN, Math.min(Camera.ZOOM_MAX, z));
    }
    constructor(worldW, worldH) {
        Object.defineProperty(this, "worldW", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: worldW
        });
        Object.defineProperty(this, "worldH", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: worldH
        });
        Object.defineProperty(this, "x", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "y", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 视野中心（世界 px）
        Object.defineProperty(this, "zoom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1.25
        }); // 当前缩放（向 targetZoom 缓动）
        Object.defineProperty(this, "zoomTarget", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1.25
        }); // 目标缩放
        Object.defineProperty(this, "viewW", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 800
        });
        Object.defineProperty(this, "viewH", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 600
        }); // 屏幕尺寸
    }
    follow(targetX, targetY) {
        this.x += (targetX - this.x) * 0.15;
        this.y += (targetY - this.y) * 0.15;
    }
    clamp() {
        const halfW = this.viewW / 2 / this.zoom;
        const halfH = this.viewH / 2 / this.zoom;
        this.x = Math.max(halfW, Math.min(this.worldW * TILE - halfW, this.x));
        this.y = Math.max(halfH, Math.min(this.worldH * TILE - halfH, this.y));
        // 世界比视野小的情况
        if (this.worldW * TILE < halfW * 2)
            this.x = this.worldW * TILE / 2;
        if (this.worldH * TILE < halfH * 2)
            this.y = this.worldH * TILE / 2;
    }
    worldToScreen(wx, wy) {
        return [(wx - this.x) * this.zoom + this.viewW / 2, (wy - this.y) * this.zoom + this.viewH / 2];
    }
    screenToWorld(sx, sy) {
        return [(sx - this.viewW / 2) / this.zoom + this.x, (sy - this.viewH / 2) / this.zoom + this.y];
    }
    tileUnder(sx, sy) {
        const [wx, wy] = this.screenToWorld(sx, sy);
        return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
    }
}
Object.defineProperty(Camera, "ZOOM_MIN", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 0.75
});
Object.defineProperty(Camera, "ZOOM_MAX", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 2.5
});
