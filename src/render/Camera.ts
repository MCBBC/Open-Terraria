// 相机：跟随玩家 + 缓动 + 世界边界钳制
import { TILE } from '../core/constants';
import { CameraModifierStack } from './CameraModifierStack';

export class Camera {
  x = 0; y = 0;         // 视野中心（世界 px）
  zoom = 1;             // 当前缩放（向 targetZoom 缓动）
  zoomTarget = 1;       // 目标缩放
  // ★缩放域 [1,2] = 原版 Main.GameZoomTarget 语义（Main.cs:256 默认 1f、
  //   :16986-16990 键调整钳 [1,2]、:62953 消费钳 [1,2]、config "Zoom" 持久化
  //   :4284/4575；IngameOptions.cs:521-561 设置滑条杆值=zoom-1）。
  //   密度等价：SW zoom1 = 16 css px/tile（Retina 上 32 设备 px）≡ 原版 zoom1
  //   16 backbuffer px/tile——旧 0.5 下限的"0.5×DPR≡原版 100%"推导作废
  //   （2026-09-08 用户拍板对齐原版；250%=原版不存在的域,是水线细缝复现参数）。
  //   消费：options.gameZoom（持久化,Settings 滑条）→ Game 启动应用到本相机。
  static ZOOM_MIN = 1;
  static ZOOM_MAX = 2;
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
  /**
   * ★SW-FX27：呈现面垂直镜像开关 ≙ GameViewMatrix.Effects=FlipVertically
   *  （Main.cs:62944 `(!gameMenu && player[myPlayer].gravDir != 1f) ?
   *  SpriteEffects.FlipVertically : None`，BackgroundViewMatrix.Effects 同步
   *  :62945）。true = gravDir=-1（重力药水/地球仪/FTW 克脑）：
   *  - 渲染：Renderer 翻转点把已合成世界画面（背景+地形+实体+光照）整幅
   *    y'=viewH-y 镜像（原版经 TransformationMatrix 全屏翻转的等价实现——
   *    SpriteViewMatrix.Rebuild :145-148 `CreateScale(1,-1)*CreateTranslation(0,H)`）；
   *  - 输入：screenToWorld 内置鼠标 Y 镜像（ReverseGravitySupport）。
   *  相机 x/y（世界中心）与 follow/clamp 语义不受翻转影响（原版 Translation
   *  只含 zoom 项，SpriteViewMatrix.cs:149-154 翻转只进 _effectMatrix）。
   *  写入方：Game.fixedUpdate（player.fixedUpdate 后）与 Renderer.render 帧头
   *  双点同步 = player.gravDir===-1。 */
  flipY = false;

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

  // ★BJ103-A1（2026-09-16）：CurrentPan 平滑+黑幕传送（Main.UpdateCameraPan 尾段
  // Main.cs:63634-63675/1458 :63640-63681,两版逐字同文——本轮 sed 区间 diff 实证）。
  // CurrentPan（Main.cs:554）= 玩家受控镜头平移的持续偏移量（世界 px）,每 tick 以
  // Utils.MoveTowards（Utils.cs:1862-1870）趋近 targetPan;施加点 = screenPosition 组合
  // （PlayerFocusedScreenPosition Main.cs:63523）。本仓 Camera 每世界重建
  // （Game fixedUpdate 构造点）= WorldGen.cs:6952 CurrentPan=Zero 的进图复位同相。
  panX = 0; panY = 0;
  /** maxPanSpeed 玩家受控档恒值（Main.cs:63652 `float maxPanSpeed = 36f`;手柄支
   *  :63778/1458 :63784 覆写 48f——本仓无手柄 pan 通道,登记债）。物体跟踪档
   *  （观战/高尔夫 :63648-63657）为比例率 num×panRate,本仓由 follow 重锚承载不经此。 */
  static PAN_MAX_SPEED = 36;
  /** BlackFadeDist（Main.cs:3127 `Camera.UnscaledSize.Length()/2f + 100f`）——
   *  UnscaledSize=(screenWidth,screenHeight)（Terraria.Graphics/Camera.cs:10）=本仓
   *  viewW/viewH（CSS px）。原版即拿未缩放 px 阈值比世界 px 距离（zoom>1 偏保守）,
   *  1:1 照录该混用。 */
  static blackFadeDist(viewW: number, viewH: number): number {
    return Math.hypot(viewW, viewH) / 2 + 100;
  }
  /**
   * UpdateCameraPan 尾段（Main.cs:63638-63669/1458 :63644-63675）：
   *   ①NaN 守卫（:63638-63645 float.IsNaN→归零,Number.isFinite 等价面）；
   *   ②黑幕门（:63662-63666）dist(CurrentPan,targetPan) ≥ BlackFadeDist →
   *     CurrentPan=targetPan 瞬移,返回 true（调用方接 BlackFadeCameraTeleport 等价面）；
   *   ③否则 MoveTowards（Utils.cs:1862-1870：v=target−cur,v 长<步长→直落目标;
   *     否则 cur+v.SafeNormalize×步长——step=min(d,max) 逐步合流同式）。
   * 返回 true = 本拍触发黑幕传送。 */
  advancePan(targetX: number, targetY: number): boolean {
    if (!Number.isFinite(this.panX)) this.panX = 0;
    if (!Number.isFinite(this.panY)) this.panY = 0;
    const d = Math.hypot(this.panX - targetX, this.panY - targetY);
    if (d >= Camera.blackFadeDist(this.viewW, this.viewH)) {
      this.panX = targetX;
      this.panY = targetY;
      return true;
    }
    if (d > 0) {
      const step = Math.min(d, Camera.PAN_MAX_SPEED);
      this.panX += (targetX - this.panX) / d * step;
      this.panY += (targetY - this.panY) / d * step;
    }
    return false;
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
    // ★SW-FX27：ReverseGravitySupport(MouseScreen) 逆变换（Main.cs:3242-3250 +
    //   MouseWorld :2835-2842：`result.Y = screenPosition.Y + screenHeight - mouseY`）
    //   ——gravDir=-1 时鼠标 Y 先按视口高镜像再做常规换算（Utils.cs:1137
    //   ScreenToWorldPosition = Invert(TransformationMatrix) 同一矩阵的解析形）。
    //   本仓全部鼠标→世界消费（Game.ts 100+ 处 screenToWorld / 高亮 / SmartCursor
    //   / SmartSelect / 交互命中）经此单点获得翻转一致性；gd=1（flipY=false）
    //   逐位恒等（分支前原式）。
    if (this.flipY) sy = this.viewH - sy;
    return [(sx - this.viewW / 2) / this.zoom + this.x, (sy - this.viewH / 2) / this.zoom + this.y];
  }
  /**
   * ★SW-FX27：世界→【显示屏幕】坐标（Main.cs:47397-47399 DrawSmartCursor /
   *   :47445-47447 DrawSmartInteract / :46504-46510 签名泡 / Utils.cs:1131
   *   ToScreenPosition——原版屏空间层手翻 `screenHeight - y` 语义）。
   *   仅限【翻转点之后】画在主画布上的世界锚定覆盖层（飘字/签名泡/遮屏孔/
   *   月总脉冲）使用；翻转点之前的绘制保持 worldToScreen（随呈现面整体镜像）。
   *   gd=1 逐位恒等。 */
  worldToScreenDisplayed(wx: number, wy: number): [number, number] {
    const [sx, sy] = this.worldToScreen(wx, wy);
    return this.flipY ? [sx, this.viewH - sy] : [sx, sy];
  }
  tileUnder(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
  }
}
