// 相机修饰器通用栈（Terraria.Graphics.CameraModifiers 1:1 移植，2026-08-20）：
//   ICameraModifier.cs / CameraModifierStack.cs / PunchCameraModifier.cs / CameraInfo.cs
// 原版唯一注册的修饰器 = PunchCameraModifier（鹿角怪震屏 NPC.cs:44568-44828 /
// 观战无目标提示 Player.cs:16974）。MoonLordShake（Main.cs:64437-64447）是
// Filters.Scene 屏幕后处理滤镜（以玩家为靶心的红色扰动），**不是**相机修饰器——
// 本仓留在 Renderer.drawMoonLordShake，不入本栈。
//
// Update 语义（PunchCameraModifier.Update :40-55）：
//   位移 = direction × cos(framesLasted/60 × cycles × 2π) × strength
//          × Remap(framesLasted, 0, framesToLast, 1, 0)         ← 线性包络衰减
//          × (distanceFalloff == -1 ? 1 : Remap(dist(startPos, 原相机中心), 0, falloff, 1, 0))
// 逐帧 framesLasted++；到 framesToLast 即 Finished（栈内 ClearFinished 剔除）。

/** Utils.Remap（Terraria.Utils :1344 附近）：input 从 [inMin,inMax] 线性映射到 [outMin,outMax]。 */
export function remap(input: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + (input - inMin) * (outMax - outMin) / (inMax - inMin);
}

/** CameraInfo（CameraInfo.cs）：栈逐修饰器传引用改写的相机状态载体。 */
export interface CameraInfo {
  /** 当前相机位置（修饰器叠加位移的落点） */
  cameraPositionX: number;
  cameraPositionY: number;
  /** 本帧原始相机中心（= 原位置 + 屏幕尺寸/2——距离衰减的分母基准） */
  originalCameraCenterX: number;
  originalCameraCenterY: number;
  /** 本帧原始相机位置 */
  originalCameraPositionX: number;
  originalCameraPositionY: number;
}

/** ICameraModifier（ICameraModifier.cs）——未来挂点（原版接口形状）。 */
export interface ICameraModifier {
  /** 同名身份（null = 不去重）；Add 时移除栈内同 identity 旧修饰器 */
  readonly uniqueIdentity: string | null;
  /** 屏幕震动类（Main.UseScreenShake 关闭时拒收——设置项"屏幕震动"） */
  readonly isAScreenShake: boolean;
  /** 结束标记（ApplyTo 前统一清理） */
  readonly finished: boolean;
  update(info: CameraInfo): void;
}

/** PunchCameraModifier（PunchCameraModifier.cs）1:1。 */
export class PunchCameraModifier implements ICameraModifier {
  private readonly framesToLast: number;
  private readonly startPositionX: number;
  private readonly startPositionY: number;
  private readonly directionX: number;
  private readonly directionY: number;
  private readonly distanceFalloff: number;
  private readonly strength: number;
  private readonly vibrationCyclesPerSecond: number;
  private framesLasted = 0;

  finished = false;
  readonly uniqueIdentity: string | null;
  isAScreenShake = true;   // 原版构造默认 true（观战提示显式置 false）

  constructor(startX: number, startY: number, dirX: number, dirY: number,
    strength: number, vibrationCyclesPerSecond: number, frames: number,
    distanceFalloff = -1, uniqueIdentity: string | null = null) {
    this.startPositionX = startX;
    this.startPositionY = startY;
    this.directionX = dirX;
    this.directionY = dirY;
    this.strength = strength;
    this.vibrationCyclesPerSecond = vibrationCyclesPerSecond;
    this.framesToLast = frames;
    this.distanceFalloff = distanceFalloff;
    this.uniqueIdentity = uniqueIdentity;
  }

  update(info: CameraInfo): void {
    const num = Math.cos(this.framesLasted / 60 * this.vibrationCyclesPerSecond * Math.PI * 2);
    const num2 = remap(this.framesLasted, 0, this.framesToLast, 1, 0);
    let num3 = 1;
    if (this.distanceFalloff !== -1) {
      const d = Math.hypot(this.startPositionX - info.originalCameraCenterX,
        this.startPositionY - info.originalCameraCenterY);
      num3 = remap(d, 0, this.distanceFalloff, 1, 0);
    }
    info.cameraPositionX += this.directionX * num * this.strength * num2 * num3;
    info.cameraPositionY += this.directionY * num * this.strength * num2 * num3;
    this.framesLasted++;
    if (this.framesLasted >= this.framesToLast) this.finished = true;
  }
}

/** CameraModifierStack（CameraModifierStack.cs）1:1。 */
export class CameraModifierStack {
  private readonly modifiers: ICameraModifier[] = [];

  /** Main.UseScreenShake（设置项；false 时拒收震动类修饰器）。缺省 true = 无此设置。 */
  useScreenShake = true;

  add(modifier: ICameraModifier): void {
    this.removeIdenticalModifiers(modifier);
    if (this.useScreenShake || !modifier.isAScreenShake) {
      this.modifiers.push(modifier);
    }
  }

  private removeIdenticalModifiers(modifier: ICameraModifier): void {
    const id = modifier.uniqueIdentity;
    if (id === null) return;
    for (let i = this.modifiers.length - 1; i >= 0; i--) {
      if (this.modifiers[i].uniqueIdentity === id) this.modifiers.splice(i, 1);
    }
  }

  /** 活跃修饰器数（测试/诊断口；含未过期的全部成员） */
  get count(): number { return this.modifiers.length; }

  /** ApplyTo（:35-44）：清过期 → 逐修饰器 update → 写回位置。返回合成后的位移量。 */
  applyTo(posX: number, posY: number, screenW: number, screenH: number): { x: number; y: number } {
    const info: CameraInfo = {
      cameraPositionX: posX,
      cameraPositionY: posY,
      originalCameraCenterX: posX + screenW / 2,
      originalCameraCenterY: posY + screenH / 2,
      originalCameraPositionX: posX,
      originalCameraPositionY: posY,
    };
    this.clearFinishedModifiers();
    for (const m of this.modifiers) m.update(info);
    return { x: info.cameraPositionX - posX, y: info.cameraPositionY - posY };
  }

  private clearFinishedModifiers(): void {
    for (let i = this.modifiers.length - 1; i >= 0; i--) {
      if (this.modifiers[i].finished) this.modifiers.splice(i, 1);
    }
  }
}
