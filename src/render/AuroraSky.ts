// 极光天空(AuroraSky.cs,Terraria.GameContent.Skies/ 全文 1:1 移植 2026-08-20)。
// 激活:SceneState.cs:102/117-119 —— flag=ZoneRain&&ZoneSnow(暴雪)、
//  flag5=UseStormEffects(Main.cs:407 默认 true)&&flag、
//  flag6=!dayTime&&!flag5&&GraveyardVisualIntensity<0.5 →
//  ManageSpecialBiomeVisuals("Aurora", ZoneSnow && flag6)(Game.updateWeather 接线)。
// 绘制:DrawSurfaceBG 内首个 SkyManager.DrawToDepth(1/0.09)(Main.cs:58829)层 —— 远距云
//  (DrawClouds_Distant :58757)之后、云背景层之前;日月(:56310 DrawSunAndMoon)画于其【前】。
// tileColor 渗入:SetBackColor 尾(Main.cs:63360)ModifyHorizonLight(:63356)之后。
//
// 原版渲染走 GameShaders.Misc["Aurora"](编译像素着色器,DyeInitializer.cs:485-487,
//  噪声贴图 Extra_286/287)+ VertexStrip 三角带;本仓 Canvas2D 以 CPU 侧顶点色
// (color/color2×num28,即 AddVertexPair 的逐段顶点数据 :401)重建条带几何,
//  shader 专属部分(specificData X/Y/Z/W、噪声采样、uTime 调制)不可复刻——
//  逐处以【shader 推断】标注。

/** Utils.Remap(Utils.cs:313,clamped)= Lerp(toMin,toMax,GetLerpValue(fromMin,fromMax,v)) */
export function remap(v: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  const t = Math.max(0, Math.min(1, (v - fromMin) / (fromMax - fromMin)));
  return toMin + (toMax - toMin) * t;
}

/** Main.hslToRgb(Main.cs:47266-47296,byte 取整)——极光带色 hue 源 */
export function hslToRgb255(hue: number, saturation: number, luminosity: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number) => {
    if (c < 0) c += 1;
    if (c > 1) c -= 1;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  if (saturation === 0) {
    const v = Math.round(luminosity * 255);
    return [v, v, v];
  }
  const q = luminosity < 0.5 ? luminosity * (1 + saturation) : luminosity + saturation - luminosity * saturation;
  const t = 2 * luminosity - q;
  return [
    Math.round(hue2rgb(hue + 1 / 3, t, q) * 255),
    Math.round(hue2rgb(hue, t, q) * 255),
    Math.round(hue2rgb(hue - 1 / 3, t, q) * 255),
  ];
}

/** 参考画布(Vector2(1920,1080),AuroraSky.cs:126)——所有带几何在此空间,渲染时
 *  统一乘 scale=屏宽/1920(:127-128 transform=背景矩阵×CreateScale(scale);【shader
 *  推断】背景矩阵按无相机平移的屏空间处理) */
export const AURORA_REF_W = 1920;
export const AURORA_REF_H = 1080;
/** 每带段数(num6=140,AuroraSky.cs:135) */
export const AURORA_SEG = 140;

/** 月相(MoonPhase.cs:Full=0…ThreeQuartersAtRight=7) */
export const enum AuroraMoonPhase {
  Full = 0, ThreeQuartersAtLeft = 1, HalfAtLeft = 2, QuarterAtLeft = 3,
  Empty = 4, QuarterAtRight = 5, HalfAtRight = 6, ThreeQuartersAtRight = 7,
}

/** 月相分支参数(AuroraSky.cs:76-123 switch 的活值) */
export interface AuroraMode {
  /** 带 num2 */
  bands: number;
  /** flag=Full(满月分支) */
  full: boolean;
  /** flag2=Empty 族(Empty/HalfAtLeft/ThreeQuartersAtRight) */
  emptyLike: boolean;
  /** flag3=Half 族(HalfAtLeft/ThreeQuartersAtRight) */
  halfLike: boolean;
  /** flag4(:152-156,luminosity=1+shader specificData.X=0.3)——仅 shader 数据,luminosity 恒 1 */
  dim: boolean;
  /** flag5=双带族(ThreeQuartersAtLeft/QuarterAtRight) */
  twoBand: boolean;
  /** num4 整体 α 乘子(:100/:120 HalfAtLeft/ThreeQuartersAtRight ×0.5) */
  alphaMul: number;
  /** 饱和度 saturation(:84/:111/:121) */
  saturation: number;
  /** hue 频率 num7 段前基值 2.5(:136);flag2→1(:159);flag3→0.5(:341) */
  hueFreq: number;
  /** hue 偏移 num8(:137 基 0;flag2 +0.33:160;段内 flag3→0.02:342 /
   *  flag2&&!flag3→0.45:347——均为带内常量,此处取合成终值) */
  hueOffset: number;
}

/** 月相分支(AuroraSky.cs:85-123 一比一;QuarterAtLeft(:102)/HalfAtRight(:113)
 *  return 不画 → null) */
export function auroraMode(moonPhase: number): AuroraMode | null {
  switch (moonPhase) {
    case 0:  // Full :87-90(flag,num2=3)
      return { bands: 3, full: true, emptyLike: false, halfLike: false, dim: false, twoBand: false, alphaMul: 1, saturation: 1, hueFreq: 2.5, hueOffset: 0 };
    case 1:  // ThreeQuartersAtLeft :91-94(num2=2,flag5)
      return { bands: 2, full: false, emptyLike: false, halfLike: false, dim: false, twoBand: true, alphaMul: 1, saturation: 1, hueFreq: 2.5, hueOffset: 0 };
    case 2:  // HalfAtLeft :95-101(flag2,flag3,num2=3,flag4,num4×0.5)
      return { bands: 3, full: false, emptyLike: true, halfLike: true, dim: true, twoBand: false, alphaMul: 0.5, saturation: 1, hueFreq: 0.5, hueOffset: 0.02 };
    case 3:  // QuarterAtLeft :102-103 return
      return null;
    case 4:  // Empty :104-107(flag2,num2=3)
      return { bands: 3, full: false, emptyLike: true, halfLike: false, dim: false, twoBand: false, alphaMul: 1, saturation: 1, hueFreq: 1, hueOffset: 0.45 };
    case 5:  // QuarterAtRight :108-112(num2=2,flag5,saturation=0.5)
      return { bands: 2, full: false, emptyLike: false, halfLike: false, dim: false, twoBand: true, alphaMul: 1, saturation: 0.5, hueFreq: 2.5, hueOffset: 0 };
    case 6:  // HalfAtRight :113-114 return
      return null;
    case 7:  // ThreeQuartersAtRight :115-122(flag2,flag3,num2=3,flag4,num4×0.5,saturation=0.5)
      return { bands: 3, full: false, emptyLike: true, halfLike: true, dim: true, twoBand: false, alphaMul: 0.5, saturation: 0.5, hueFreq: 0.5, hueOffset: 0.02 };
    default:
      return null;
  }
}

/** 首尾 180tick 淡入出门(AuroraSky.cs:69-75):夜长 32400;
 *  skyOpacity×Remap(time,0,180,0,1)×Remap(time,32400−180,32400,1,0),
 *  ≤0.01 或白天 → 0(不画)。 */
export function auroraGatedOpacity(opacity: number, nightTicks: number, isDay: boolean): number {
  if (isDay) return 0;                                          // :72
  const v = opacity * remap(nightTicks, 0, 180, 0, 1)
    * remap(nightTicks, 32400 - 180, 32400, 1, 0);              // :71
  return v <= 0.01 ? 0 : v;                                     // :72
}

/** _lastSkyColor 赋值结论(AuroraSky.cs:376-379):仅带 i==0、段 num9==19(即
 *  num10=19/140,带 0 无 flag5 重映射)时写入 color ——
 *  color = hslToRgb((num19 + cos(num10·2π·num7)·0.1) % 1, saturation, 0.5)(:374),
 *  其中带 0: num19=num5(num19=num5 基值 :211;flag3 的 +i·0.05(:340)在 i=0 为 +0)、
 *  num7/saturation 按月相(hueFreq/saturation,见 auroraMode)。
 *  num5 = GlobalTimeWrappedHourly/60(:131)。 */
export function auroraLastSkyColor(moonPhase: number, globalTime: number): [number, number, number] {
  const m = auroraMode(moonPhase);
  if (!m) return [0, 0, 0];
  const num10 = 19 / AURORA_SEG;
  const hue = (globalTime / 60 + Math.cos(num10 * Math.PI * 2 * m.hueFreq) * 0.1) % 1;
  return hslToRgb255(hue, m.saturation, 0.5);
}

// ================= AuroraSky 实例(CustomSky 状态机 + Canvas2D 条带) =================

/** 条带采样缓冲(预分配;3 带 × 141 段,零每帧分配) */
const MAX_BANDS = 3;
const SAMPLES = MAX_BANDS * (AURORA_SEG + 1);

/** 绘制输入(Draw/DrawAuroraSky 的帧参数) */
export interface AuroraDrawOpts {
  /** 夜 tick(Main.time 夜段 0-32400) */
  nightTicks: number;
  isDay: boolean;
  /** 月相 0-7 */
  moonPhase: number;
  /** Main.GlobalTimeWrappedHourly(秒,%3600;缺省 performance.now 推导) */
  globalTime?: number;
  /** 屏顶 tile Y(地表门用,Main.cs:58775 screenPosition.Y/16) */
  camTopTiles: number;
  /** worldSurface(tile) */
  surfaceTiles: number;
  /** 月屏位占比(Main.LastCelestialBodyPosition/ScreenSize,Main.cs:62458-62459);
   *  null=本帧无月(静态位沿用) */
  moonFrac: { x: number; y: number } | null;
  dtSec: number;
}

export class AuroraSky {
  // ---- CustomSky 状态(:19-27/:424-444) ----
  private _isActive = false;
  private _isLeaving = false;
  /** _opacity:淡入 +0.3/s(:50)、淡出 −0.5/s(:41) */
  private _opacity = 0;
  /** _lastSkyColor(默认 Color(0,0,0,0);ModifyTileColor 强制 A=255 → 黑) */
  private _lastSkyColor: [number, number, number] = [0, 0, 0];
  /** 最近一次绘制的月相(ModifyTileColor 的月相门在消费侧读实时相位) */
  phase = -1;
  /** 月屏位锚(Main.LastCelestialBodyPosition 静态位语义:静态持久,缺帧沿用) */
  private _moonFrac: { x: number; y: number } = { x: 0, y: 0 };

  // ---- 采样数组(1920×1080 参考空间→屏空间换算后写入) ----
  private sBotX = new Float32Array(SAMPLES);
  private sBotY = new Float32Array(SAMPLES);
  private sTopX = new Float32Array(SAMPLES);
  private sTopY = new Float32Array(SAMPLES);
  /** 底边顶点色 color.RGB(0-255;顶边 color2 恒白——luminosity 全分支恒 1,见下) */
  private sR = new Float32Array(SAMPLES);
  private sG = new Float32Array(SAMPLES);
  private sB = new Float32Array(SAMPLES);
  /** num28 = num16·skyOpacity·num18·num4(:380)顶点 α */
  private sA = new Float32Array(SAMPLES);
  /** 条带纹理(141×2:row0=底边色、row1=顶边色【白】;逐带 putImageData 复用) */
  private stripCanvas: HTMLCanvasElement | null = null;
  private stripCtx: CanvasRenderingContext2D | null = null;
  private stripData: ImageData | null = null;

  /** Activate/Deactivate(:424-433)。翻转守卫=ManageSpecialBiomeVisuals
   *  (SceneState.cs:123-133)的 `inZone != IsActive()` 语义——淡出中 _isActive
   *  仍 true,期间重入雪原【不会】重新 Activate(原版行为,含怪癖 1:1)。 */
  setActive(on: boolean): void {
    if (on === this._isActive) return;
    if (on) {
      this._isActive = true;          // Activate :426-427
      this._isLeaving = false;
    } else {
      this._isLeaving = true;         // Deactivate :432
    }
  }

  /** Reset(:435-439,SkyManager.Reset/世界卸载) */
  reset(): void {
    this._opacity = 0;
    this._isActive = false;
    this._isLeaving = false;
  }

  /** Update(:33-56):淡入 +0.3/s 钳 1 / 淡出 −0.5/s 归零即停。
   *  (原版 FocusHelper.PauseSkies 门 :35-38 为 1.4.5 新暂停特性,本仓无对应态。)
   *  ★原版 SkyManager.Update 每 Main.Update 调一次、且 dayRate 倍速下每帧调
   *  dayRate 次(SkyManager.cs:26-45)——即快进时淡入淡出按游戏时间加速;本仓以
   *  真实秒计(dayRate=1 档 1:1),倍速加速未镜像【登记】。 */
  update(dtSec: number): void {
    if (this._isLeaving) {
      this._opacity -= dtSec * 0.5;                       // :41
      if (this._opacity < 0) {
        this._isActive = false;                           // :44
        this._opacity = 0;                                // :45
      }
    } else {
      this._opacity += dtSec * 0.3;                       // :50
      if (this._opacity > 1) this._opacity = 1;           // :51-54
    }
  }

  get opacity(): number { return this._opacity; }
  get isActive(): boolean { return this._isActive; }
  get lastSkyColor(): readonly [number, number, number] { return this._lastSkyColor; }

  /** Renderer 每帧读出 → SkyColor.setFrameAurora(ModifyTileColor 的输入态)。
   *  opacity≤0 → null(:412 的 !(opacity<=0) 门)。 */
  tileColorState(): { rgb: [number, number, number]; opacity: number } | null {
    if (this._opacity <= 0) return null;
    return { rgb: [this._lastSkyColor[0], this._lastSkyColor[1], this._lastSkyColor[2]], opacity: this._opacity };
  }

  /** Draw(:58-64)+DrawAuroraSky(:66-408)。maxDepth==MaxValue 层
   *  (DrawSurfaceBG 首个 DrawToDepth,Main.cs:58829)= 本仓 sky.draw 云层之后。 */
  draw(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, o: AuroraDrawOpts): void {
    // 未激活且已淡尽 = SkyManager 活跃清单外,不 Update 不画
    if (!this._isActive && this._opacity <= 0) return;
    this.update(o.dtSec);
    // 首尾 180tick 淡入出 + 白天直返(:69-75)
    const skyOpacity = auroraGatedOpacity(this._opacity, o.nightTicks, o.isDay);
    if (skyOpacity <= 0) return;
    const m = auroraMode(o.moonPhase);
    if (!m) return;                                       // QuarterAtLeft :102 / HalfAtRight :113
    // 地表门:cloudBG 块条件(Main.cs:58775 screenPosition.Y/16 ≤ worldSurface+10)
    if (o.camTopTiles > o.surfaceTiles + 10) return;
    this.phase = o.moonPhase;
    if (o.moonFrac) this._moonFrac = o.moonFrac;
    const globalTime = o.globalTime ?? (typeof performance !== 'undefined'
      ? (performance.now() / 1000) % 3600 : 0);
    // :126-128 参考空间 → 屏空间:scale = 屏宽/1920(背景矩阵按恒等屏空间处理【推断】)
    const scale = viewW / AURORA_REF_W;
    for (let i = 0; i < m.bands; i++) {
      this.computeBand(i, m, globalTime, skyOpacity, scale);
      this.rasterBand(ctx, i, m.bands);
    }
  }

  /** 单带逐段几何/颜色(AuroraSky.cs:132-402 段循环 1:1;num* 命名保持反编译对照)。
   *  死代码(算后被覆写的中间式,反编译产物)不落地,行注释标注。 */
  private computeBand(i: number, m: AuroraMode, globalTime: number, skyOpacity: number, scale: number): void {
    const flag = m.full, flag2 = m.emptyLike, flag3 = m.halfLike, flag5 = m.twoBand;
    const num3 = 1;                       // :81(全分支未改)
    const num4 = m.alphaMul;
    const saturation = m.saturation;
    // num7/num8/num19/luminosity:原版在段循环内赋值但为带内常量,合成终值:
    //  num7: 2.5(:136)→flag2 1(:159)→flag3 0.5(:341);num8: 0(:137)→flag2 +0.33
    //  (:160)→flag3 0.02(:342)或 flag2&&!flag3 0.45(:347);num19: num5(:211)→
    //  flag3 num5+i·0.05(:340 覆写;:291-295 的 ±0.35 被其覆写);luminosity 恒 1
    //  (:138/:155/:346)→ color2 = hslToRgb(·,·,1) ≡ 白(255,255,255)。
    const num5 = globalTime / 60;         // :131
    const num7 = m.hueFreq;
    const num8 = m.hueOffset;
    const num19 = flag3 ? num5 + i * 0.05 : num5;
    // specificData(X/Y/Z/W,:139-189)为 shader 专属参数(带 Y:0/0.7/0.8、flag4 X=0.3、
    //  flag2 Z=0.2 等)——Canvas2D 无对应通道,不落地【shader 推断:不可复刻】
    const moonX = this._moonFrac.x, moonY = this._moonFrac.y;
    const base = i * (AURORA_SEG + 1);
    const TAU = Math.PI * 2;
    for (let num9 = AURORA_SEG; num9 >= 0; num9--) {      // :191(140→0)
      let num10 = num9 / AURORA_SEG;
      const num11 = num10;                                // :194(重映射前快照)
      if (flag5 && i === 1) {
        num10 = remap(num10, 0, 1, 50 / AURORA_SEG, 90 / AURORA_SEG);   // :195-198
      }
      const amount = flag ? num10 : 1 - num10;            // :199-203
      let num12 = 0.4 + (0.1 - 0.4) * num10;              // :204 Lerp(0.4,0.1,num10)
      const num13 = 0.4 + num5;                           // :205
      let num15 = 0.5 + Math.cos(num10 * Math.PI * 3 + num13) * 0.4 * (1 + (0.3 - 1) * amount);  // :207
      let num16 = remap(Math.abs(Math.sin(num10 * Math.PI * 3 + num13)), 0, 0.98, 0, 1);          // :208
      let num17 = (0.2 + (0.05 - 0.2) * amount) * num3;   // :209
      let num18 = 0.5 - 0.5 * Math.cos(num10 * TAU);      // :210
      // ---- flag5 双带族(:212-242) ----
      if (flag5) {
        const num20 = num5 * 0.16;                        // :214
        num12 += (1 - num10) * 0.05;                      // :219(i==1 分支内被覆写→仅 i==0 存活)
        num17 += 0.05;                                    // :220(同上)
        if (i === 1) {
          // :223-227/num17+=0.15(:228) 均被 :229-233 覆写(死代码)
          num15 = num11 * 1.1;                                                        // :229
          num16 = 1 - Math.sin(num11 * TAU * 2 + Math.PI / 2) * 0.35 - 0.35;          // :230
          num12 = Math.sin(num11 * TAU * 2 + Math.PI / 2) * 0.0125 + 0.55;            // :231
          num17 = 0.16 * num3 + 0.05 + Math.sin(num11 * TAU * 2) * 0.025 + 0.2;       // :232-233
        }
        if (i === 0) {
          const num22 = remap(num10, 0, 0.3, 0, 1);      // :237
          num18 *= num22 * num22 * num22;                // :238
          num17 -= 0.1;                                  // :239
          num17 += 0.8 * num10 * num10;                  // :240
        }
      }
      // ---- flag=满月带 0(:243-256;:246-251 死代码) ----
      if (flag && i === 0) {
        num15 = num11 * 1.1;                                                        // :252
        num12 = Math.sin(num11 * TAU * 2 + Math.PI / 2 + num5 * 2 + Math.PI) * 0.025 + 0.55;   // :253
        num17 = 0.16 * num3 + 0.05 + Math.sin(num11 * TAU * 2 + num5 * 2) * 0.02;   // :254
        num16 = 1 - Math.sin(num11 * TAU * 2 + Math.PI / 2) * 0.35 - 0.35;          // :255
      }
      // ---- flag2=Empty 族(:257-337) ----
      if (flag2) {
        if (i === 0) {
          // :262-267/:270 前段与 num17+=0.15(:267)被 :268-271 覆写(死代码)
          num15 = num11 * 1.1;                                                        // :268
          num16 = 1 - Math.sin(num11 * TAU * 2 + Math.PI / 2) * 0.35 - 0.35;          // :269
          num12 = Math.sin(num11 * TAU * 2 + Math.PI / 2) * 0.025 + 0.55;             // :270
          num17 = 0.16 * num3 + 0.05 + Math.sin(num11 * TAU * 2) * 0.05;              // :271
        } else if (i === 1 || i === 2) {
          num12 = 0.3;                                    // :280 Lerp(0.3,0.3,num10)
          if (i === 1) num17 += 0.5 * num10;              // :285-286
          num12 -= Math.cos(num10 * TAU + num5 * 2) * 0.07;   // :287
          num16 = 1;                                      // :289(覆写 :288)
          num15 = num10;                                  // :290
          num18 *= 0.55;                                  // :296
          if (i === 2) {
            num12 -= Math.cos(num5 * TAU * 0.35 + num10 * 13.73) * 0.04 * (1 - num10) + 0.04;  // :301
            num12 -= 0.03;                                // :302
          }
        }
        // :305-335 的 else/switch(num9>2 段结构)为反编译不可达分支(num2≤3,带号恒
        //  落在上面两支)——不落地
      }
      // flag3(:338-343)/flag2&&!flag3(:344-348)已合成进 num7/num8/num19/luminosity
      // ---- flag=满月带 1/2 磁吸月位(:349-360) ----
      if (flag && i !== 0) {
        num18 = Math.max(num18 * 2, num10);              // :351
        if (num18 > 1) num18 = 1;
        num15 = num15 + (moonX - num15) * num10;         // :356 Lerp(num15,月X,num10)
        num12 += 0.05;                                   // :357
        num12 = num12 + (moonY + 0.025 - num12) * num10; // :358
        num18 *= 0.5;                                    // :359
      }
      // ---- 顶点对(:361-373;v=下缘,v2=上缘=num17 高) ----
      let vx = AURORA_REF_W * num15, vy = AURORA_REF_H * num12;
      let tx = vx, ty = AURORA_REF_H * (num12 - num17);
      if (!flag) {
        // 非满月微摆(:364-372,ToRotationVector2=(cos,sin))
        const num27 = globalTime * 0.1;
        vx += Math.cos((num27 + 0.3) * TAU) * 2;
        vy += Math.sin((num27 + 0.3) * TAU) * 2;
        tx += Math.cos((num27 * 0.8 + 0.67) * TAU) * 2;
        ty += Math.sin((num27 * 0.8 + 0.67) * TAU) * 2;
        ty += Math.sin((num27 + num10) * TAU * 3) * 15 - 15;
        vy += Math.sin((num27 + num10) * TAU * 0.5) * 1;
        ty += Math.sin((num27 + num10) * TAU * 0.5) * 1;
        vx += Math.sin((num27 + num10) * TAU * 1) * 3;
        tx += Math.sin((num27 + num10) * TAU * 0.75) * 3;
      }
      // ---- 顶点色(:374-375;color=下缘、color2=上缘恒白) ----
      const hueCos = Math.cos(num10 * TAU * num7) * 0.1;
      const o = base + num9;
      this.hslInto((num19 + hueCos) % 1, saturation, 0.5, o);
      if (i === 0 && num9 === 19) {
        // :376-379 _lastSkyColor = color(带 0 / 段 19)
        this._lastSkyColor[0] = this.sR[o];
        this._lastSkyColor[1] = this.sG[o];
        this._lastSkyColor[2] = this.sB[o];
      }
      let num28 = num16 * skyOpacity * num18 * num4;      // :380
      if (flag) {
        // 满月:月距淡出(:383-384)+带 1/2 尾端水平外扩/压 α(:385-399)
        const dx = AURORA_REF_W * num15 - AURORA_REF_W * moonX;
        const dy = AURORA_REF_H * (num12 - num17 * 0.25) - AURORA_REF_H * moonY;
        num28 *= remap(Math.hypot(dx, dy), 29, 60, 0, 1);
        const num29 = 505;
        const num30 = (1 - num10) * (1 - num10) * (1 - num10);
        if (i === 1) { vx -= num29 * num30; tx -= num29 * num30; num28 -= num10 * num10 * 0.36; }
        if (i === 2) { vx += num29 * num30; tx += num29 * num30; num28 -= num10 * num10 * 0.36; }
      }
      // AddVertexPair(v,v2,num10,color*num28,color2*num28)(:401)→采样落盘(屏空间)
      // (sR/sG/sB 已由 hslInto 直写;color2=白由 rasterBand 行1 生成)
      this.sBotX[o] = vx * scale; this.sBotY[o] = vy * scale;
      this.sTopX[o] = tx * scale; this.sTopY[o] = ty * scale;
      this.sA[o] = Math.max(0, Math.min(1, num28));       // Color*float 负值钳 0
    }
  }

  /** Main.hslToRgb 直写采样数组(hslToRgb255 同式,零分配路径——段循环 423 次/帧) */
  private hslInto(hue: number, saturation: number, luminosity: number, o: number): void {
    const b = (c: number, t1: number, t2: number) => {
      if (c < 0) c += 1;
      if (c > 1) c -= 1;
      if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
      if (2 * c < 1) return t2;
      if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
      return t1;
    };
    if (saturation === 0) {
      const v = Math.round(luminosity * 255);
      this.sR[o] = v; this.sG[o] = v; this.sB[o] = v;
      return;
    }
    const q = luminosity < 0.5 ? luminosity * (1 + saturation) : luminosity + saturation - luminosity * saturation;
    const t = 2 * luminosity - q;
    this.sR[o] = Math.round(b(hue + 1 / 3, t, q) * 255);
    this.sG[o] = Math.round(b(hue, t, q) * 255);
    this.sB[o] = Math.round(b(hue - 1 / 3, t, q) * 255);
  }

  /** 单带光栅:141×2 条带纹理(底边色→白)→140 段仿射切片(顶点色 Gouraud 等价)。
   *  像素=(color.RGB·num28, α=num28) 非预乘入 ImageData;source-over 合成
   *  = color·num28²+dst·(1−num28) —— XNA AlphaBlend(地表背景批次态,Main.cs:56294)
   *  ×顶点色(Shader 输出 RGB 已乘顶点色)的逐字结果【shader 推断:shader 输出
   *  是否再乘顶点色无源码可证,取标准乘法语义】。 */
  private rasterBand(ctx: CanvasRenderingContext2D, band: number, bands: number): void {
    if (!this.stripData) {
      if (typeof document === 'undefined') return;
      this.stripCanvas = document.createElement('canvas');
      this.stripCanvas.width = AURORA_SEG + 1;
      this.stripCanvas.height = 2;
      this.stripCtx = this.stripCanvas.getContext('2d');
      if (!this.stripCtx) return;
      this.stripData = this.stripCtx.createImageData(AURORA_SEG + 1, 2);
    }
    const sd = this.stripData;
    const d = sd.data;
    const base = band * (AURORA_SEG + 1);
    for (let k = 0; k <= AURORA_SEG; k++) {
      const o = base + k;
      const a = this.sA[o];
      const ab = Math.round(a * 255);                     // α=num28
      let p = k * 8;                                      // row0=下缘 color·num28
      d[p] = Math.max(0, Math.min(255, Math.round(this.sR[o] * a)));
      d[p + 1] = Math.max(0, Math.min(255, Math.round(this.sG[o] * a)));
      d[p + 2] = Math.max(0, Math.min(255, Math.round(this.sB[o] * a)));
      d[p + 3] = ab;
      p = ((AURORA_SEG + 1) + k) * 8;                     // row1=上缘 color2(白)·num28
      const w = ab;
      d[p] = w; d[p + 1] = w; d[p + 2] = w; d[p + 3] = ab;
    }
    this.stripCtx!.putImageData(sd, 0, 0);
    const strip = this.stripCanvas!;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const baseM = ctx.getTransform();   // 调用方基变换(段间还原锚)
    for (let k = AURORA_SEG; k >= 1; k--) {
      // 段 k:采样 k(num10=k/140)→k−1;源列 (k−1..k) 跨段线性 = 顶点色插值。
      // 矩阵序:CTM = 基变换 × 段仿射(transform 后乘——先段后基)
      const a = base + k, b = base + k - 1;
      const ax = this.sBotX[a], ay = this.sBotY[a];
      const uX = this.sBotX[b] - ax, uY = this.sBotY[b] - ay;   // u:沿带(下缘)
      const vX = this.sTopX[a] - ax, vY = this.sTopY[a] - ay;   // v:下缘→上缘
      ctx.setTransform(baseM);
      ctx.transform(uX, uY, vX, vY, ax, ay);
      ctx.drawImage(strip, k - 1, 0, 2, 2, 0, 0, 1, 1);
    }
    ctx.setTransform(baseM);
    ctx.restore();
    void bands;
  }
}
