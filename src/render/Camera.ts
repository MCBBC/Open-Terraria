// 相机：跟随玩家 + 缓动 + 世界边界钳制
import { TILE } from '../core/constants';
import { CameraModifierStack } from './CameraModifierStack';

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

  /** CameraModifierStack（Main.instance.CameraModifiers，Terraria.Graphics.CameraModifiers
   *  1:1，2026-08-20）：punch 旧"线性衰减近似"退役——现为标准修饰器栈
   *  （PunchCameraModifier 余弦振动 × 线性包络 × 距离衰减），ApplyTo 每渲染帧一次 */
  readonly modifiers = new CameraModifierStack();
  punchX = 0; punchY = 0;
  /** 每帧渲染前调用：ApplyTo(cameraPosition)（Main.cs:62091）——本帧全部修饰器
   *  合成位移写入 punchX/punchY，worldToScreen 统一叠加；屏幕尺寸按当前视野/zoom 折算 */
  tickPunch(): void {
    // ★复审 R3 P2:原版 OriginalCameraCenter = 视口左上+屏尺寸/2 = 视口中心;
    //   Camera.x/y 本就是视口中心 → 传 0 屏尺寸即以中心为基准(曾再叠加半屏
    //   → 鹿角怪震屏距离衰减象限不对称+偏弱)
    const off = this.modifiers.applyTo(this.x, this.y, 0, 0);
    this.punchX = off.x;
    this.punchY = off.y;
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
