// 相机：跟随玩家 + 缓动 + 世界边界钳制
import { TILE } from '../core/constants';

export class Camera {
  x = 0; y = 0;         // 视野中心（世界 px）
  zoom = 1.25;          // 当前缩放（向 targetZoom 缓动）
  zoomTarget = 1.25;    // 目标缩放
  // 下限 0.5:canvas 背板是 CSS px(无 DPR 适配),retina(DPR2)上 zoom 0.5 才等效
  // 原版 100% 的视野/屏上速度(0.5×2=1.0)——2026-08-13 用户报"EoC 二阶段冲刺体感
  // 差距大",数值链已证 1:1,差在有效缩放(1.25×2=250% 原版)
  static ZOOM_MIN = 0.5;
  static ZOOM_MAX = 2.5;
  /** 每帧把 zoom 向 target 缓动（指数趋近，永不到达导致卡死） */
  easeZoom() {
    const diff = this.zoomTarget - this.zoom;
    if (Math.abs(diff) < 0.0005) { this.zoom = this.zoomTarget; return; }
    this.zoom += diff * 0.18;
  }
  setZoomTarget(z: number) {
    this.zoomTarget = Math.max(Camera.ZOOM_MIN, Math.min(Camera.ZOOM_MAX, z));
  }
  viewW = 800; viewH = 600; // 屏幕尺寸

  constructor(public worldW: number, public worldH: number) {}

  follow(targetX: number, targetY: number) {
    this.x += (targetX - this.x) * 0.15;
    this.y += (targetY - this.y) * 0.15;
  }

  clamp() {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    this.x = Math.max(halfW, Math.min(this.worldW * TILE - halfW, this.x));
    this.y = Math.max(halfH, Math.min(this.worldH * TILE - halfH, this.y));
    // 世界比视野小的情况
    if (this.worldW * TILE < halfW * 2) this.x = this.worldW * TILE / 2;
    if (this.worldH * TILE < halfH * 2) this.y = this.worldH * TILE / 2;
  }

  /** PunchCameraModifier（Main.cs）近似：冲击向量随帧衰减,worldToScreen 统一叠加 */
  punchX = 0; punchY = 0;
  private punchFrames = 0;
  private punchVecX = 0; private punchVecY = 0;
  addPunch(dirX: number, dirY: number, strength = 20, frames = 30): void {
    const d = Math.hypot(dirX, dirY) || 1;
    this.punchVecX += (dirX / d) * strength;
    this.punchVecY += (dirY / d) * strength;
    this.punchFrames = Math.max(this.punchFrames, frames);
  }
  /** 每帧渲染前调用：衰减位移（线性归零 + 向量残留 ×0.92） */
  tickPunch(): void {
    if (this.punchFrames <= 0) { this.punchX = this.punchY = 0; this.punchVecX = this.punchVecY = 0; return; }
    this.punchFrames--;
    this.punchX = this.punchVecX * (this.punchFrames / 30);
    this.punchY = this.punchVecY * (this.punchFrames / 30);
    this.punchVecX *= 0.92; this.punchVecY *= 0.92;
  }
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x + this.punchX) * this.zoom + this.viewW / 2, (wy - this.y + this.punchY) * this.zoom + this.viewH / 2];
  }
  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.viewW / 2) / this.zoom + this.x, (sy - this.viewH / 2) / this.zoom + this.y];
  }
  tileUnder(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
  }
}
