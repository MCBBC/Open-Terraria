// 极光天空(AuroraSky.cs,Terraria.GameContent.Skies/ 全文 1:1 移植 2026-08-20)。
// 激活:SceneState.cs:102/117-119 —— flag=ZoneRain&&ZoneSnow(暴雪)、
//  flag5=UseStormEffects(Main.cs:407 默认 true)&&flag、
//  flag6=!dayTime&&!flag5&&GraveyardVisualIntensity<0.5 →
//  ManageSpecialBiomeVisuals("Aurora", ZoneSnow && flag6)(Game.updateWeather 接线)。
// 绘制:DrawSurfaceBG 内首个 SkyManager.DrawToDepth(1/0.09)(Main.cs:58829)层 —— 远距云
//  (DrawClouds_Distant :58757)之后、云背景层之前;日月(:56310 DrawSunAndMoon)画于其【前】。
// tileColor 渗入:SetBackColor 尾(Main.cs:63360)ModifyHorizonLight(:63356)之后。
//
// 像素级(已落地,SM2 字节码逐指令 1:1):
//  原版走 GameShaders.Misc["Aurora"](DyeInitializer.cs:485-487:technique "Aurora",
//  uImage0=Extra_286(256²)/uImage1=Extra_287(128²),SamplerState.LinearWrap)+
//  VertexStrip 三角带。像素公式取自反编译字节码(tools/disasm-fx.mjs 产出的
//  fxPixel.txt "-- pass Aurora" 段,行号 :3109-3172;解释器侧同源字节码
//  src/data/fxPixelShader.json → src/fx/SM2Effect.ts,tests 用其对拍)。
//  顶点流:VertexStrip.AddVertexPair(:193-202)texcoord=底(uv_x,d,d)/顶(uv_x,0,d),
//  d=|v−v2| 参考空间厚度 → 像素公式里的 grad=t0.y/t0.z(上缘 0→下缘 1);
//  v0=color×num28(XNA Color*float = byte 截断钳位)。
//  合成:父批次 BlendState.AlphaBlend(预乘 One/InvSrcAlpha,Main.cs:56292/:61473)
//  × 着色器 α 恒 0(:3170)→ RGB 纯加法;RasterizerState.CullNone(:56292)+
//  PrepareIndices(includeBacksides)(VertexStrip.cs:122-150 正反两组同三角形)
//  → 每像素画两次 → 本仓 'lighter' drawImage×2 等价。

/** Utils.Remap(Utils.cs:313,clamped)= Lerp(toMin,toMax,GetLerpValue(fromMin,fromMax,v)) */
export function remap(v: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  const t = Math.max(0, Math.min(1, (v - fromMin) / (fromMax - fromMin)));
  return toMin + (toMax - toMin) * t;
}

import { getPass, defaultUniforms, SM2Pass, SM2Sampler } from '../fx/SM2Effect';
import { GLAurora } from './GLAurora';
import { globalTimeWrappedHourly } from '../core/GameTime';   // ★BJ330 GTW 单源

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
 *  统一乘 scale=屏宽/1920(:127-128 transform=背景矩阵×CreateScale(scale);【推断】
 *  背景矩阵按无相机平移的屏空间处理) */
export const AURORA_REF_W = 1920;
export const AURORA_REF_H = 1080;
/** 每带段数(num6=140,AuroraSky.cs:135) */
export const AURORA_SEG = 140;
/** 像素烘焙采样密度(相对屏空间;公式与密度无关,逐烘焙像素仍按屏坐标精确求值)。
 *  2026-08-20 Chrome/M 系 1920×1080 实测(scripts/_aurora-perf.mjs,经 run-diag):
 *   q=0.5 逐像素覆盖版 21-40ms/帧 → 跨度+286 预混列+增量属性 11.7-21.7ms
 *   → q=0.25 终态 3.4-7.1ms/帧(满月 3 带 ≈3.6;双带高族 ≈7)。
 *  视觉无损性:Extra_287 在带内是 ~16× 放大采样(密度无损);Extra_286 横向
 *  ×20 频率本就 2.7 纹素/屏px(GPU 侧即缩小采样),q=0.25 加深至 ~10.7:1,
 *  由预混+线性升采样平滑,探针实测列标准差 7.4(帘状竖纹结构保留)、竖缝 0、
 *  4px 块边差 0.92 vs 块内 0.68(轻微,噪声内容下不可辨)。 */
export const AURORA_QUALITY = 1.0;  // 全分辨率(1920×1080=2M px,~8ms/帧)——
  // 曾 0.25/0.5:极光射线/色带渐变在半分辨率+放大后丢失=用户实拍"效果不对"
  // 原版 GPU shader 逐屏像素连续采样,降采样无法复刻其柔滑渐变

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
  /** flag4(:152-156,sd.X=0.3 → 着色器亮度乘 1.3;luminosity 恒 1 不变) */
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

/** UseShaderSpecificData 的 Vector4(AuroraSky.cs:139-189 逐条同序;后写覆写前写):
 *  X=flag4 的 0.3(:155,着色器端亮度乘 1+X)、Y=分带竖向参数、Z=0.2 仅
 *  flag2&&!flag3(:167)——字节码不读 Z/W(全 pass 无 c4.z/c4.w 引用),纯遗留。
 *  表:Full (0,.5/…)·i1/i2=.4;3QL/QR i0=.3,i1=.5;HalfL/3QR X=.3,i0=.7→.6→.8;
 *  Empty i0=.7→.6→.8 + Z=.2。 */
export function auroraSpecificData(m: AuroraMode, i: number): [number, number, number, number] {
  let x = 0, y = 0, z = 0;                                     // :139 Vector4(0,0,0,0)
  if (i === 0) y = 0;                                          // :140-143
  if (i === 1) y = 0.7;                                        // :144-147
  if (i === 2) y = 0.8;                                        // :148-151
  if (m.dim) x = 0.3;                                          // :152-156 flag4
  if (m.emptyLike) {                                           // :157-169 flag2
    if (i !== 0) y = Math.fround(0.4 + i * 0.2);               // :161-164(C# float 运算位)
    if (!m.halfLike) z = 0.2;                                  // :165-168 !flag3
  }
  if (m.full && i !== 0) y = 0.4;                              // :170-173
  if (m.twoBand && i === 0) y = 0.3;                           // :174-177
  if (m.twoBand && i === 1) y = 0.5;                           // :178-181
  if (m.full && i === 0) y = 0.5;                              // :182-185
  if (m.emptyLike && i === 0) y = 0.7;                         // :186-189
  return [x, y, z, 0];
}

// ================= Aurora 像素公式(pass Aurora SM2 字节码逐指令) =================
// 反汇编锚(工具产出全文 fxPixel.txt "-- pass Aurora",ps_2_0):
//   def c5=(1.2,3,6,1) :3125  c6=(0,20,0.7,1) :3126  c7=(0.1,0.7,0.3,0.9) :3127
//   c4=uShaderSpecificData :3173;s0=uImage0(Extra_286) s1=uImage1(Extra_287)
//   (CTAB 符号);c0..c3 由 D3DX preshader(:3174-3179)逐帧算出:
//     T  = uTime.x+uTime.x → +sd.y     (add_s×2;t4 = 2·uTime + sd.y)
//     c0 = T·lit(−0.01)  c1 = T·lit(+0.01)  c2 = T·lit(−0.02)  c3 = T·lit(+0.02)
// 反汇编器/解释器约定:无 swizzle 后缀的源操作数 = .xxxx 复制(编码 0x00)。
// def 常量按 float32 位取值(下述字面量 = f32 精确十进制)。

/** def c5/c6/c7 的 float32 精确值(:3125-3127)——字节码位级输入 */
export const AURORA_F32 = {
  pow1_2: 1.2000000476837158,   // c5.x
  mul3: 3, mul6: 6, mul20: 20,  // c5.y / c5.z / c6.y(整数精确)
  nz: 0.699999988079071,        // c6.z = 0.7
  one: 1,                       // c5.w / c6.w
  add01: 0.10000000149011612,   // c7.x = 0.1
  mul07: 0.699999988079071,     // c7.y = 0.7
  add03: 0.30000001192092896,   // c7.z = 0.3
  mul09: 0.8999999761581421,    // c7.w = 0.9
} as const;

/** 噪声采样 UV+preshader 常量(:3132-3144、:3174-3179)。
 *  返回 [u1x,u1y, u2x,u2y, u3x,u3y]:s0 Extra_286 两路(横 20/6 倍频 + 时间对角
 *  漂移)、s1 Extra_287(t0.x, grad)。uTime=Main.GlobalTimeWrappedHourly
 *  (MiscShaderData.Apply :91)。 */
export function auroraNoiseUV(t0x: number, t0y: number, t0z: number,
  uTime: number, sdY: number): [number, number, number, number, number, number] {
  const T = uTime + uTime + sdY;                 // preshader :3174-3175(t4)
  const z = t0x + sdY;                           // :3133 add r0.z, t0.x, c4.y
  const invD = 1 / t0z;                          // :3138 rcp r0.z, t0.z
  const grad = t0y * invD;                       // :3139 mul r2.y, r0.z, t0.y
  return [
    z * AURORA_F32.mul20 + T * -0.02,            // :3132/:3134-3135 mad ×20 + c2
    T * 0.02,                                    // :3132 mov r0.y, c3
    z * AURORA_F32.mul6 + T * -0.01,             // :3136-3137 mad ×6 + c0
    T * 0.01,                                    // :3140 mov r1.y, c1
    t0x,                                         // :3141 mov r2.x, t0
    grad,                                        // :3139
  ];
}

/** 强度链(:3145-3166,n1/n2=Extra_286 两路 R 通道、n3=Extra_287 R 通道,均 0..1):
 *  A = sat(1−0.7·n1³)(★#15 mad r0.x_sat) → B = lrp(A,1,grad+0.1) → C = lrp(lrp(B,1,sdY),1,grad·sdY)
 *  E = max(1−n2⁴,0) → F = lrp(E,1,sdY) → G = lrp(F,1,grad·sdY)
 *  intensity = (0.1+0.9·C)·(0.3+0.7·G)·sat(3·grad)·n3^1.2(★#37 mul r0.y_sat)
 *  (lrp 无钳:grad+0.1 可到 1.1 → 外插,:3149;两处 sat = 2026-08-24 r15 _sat
 *   判据修复后字节码实证,此前镜像按无钳旧解释器校准)。 */
export function auroraIntensity(n1: number, n2: number, n3: number,
  grad: number, sdY: number): number {
  const sat01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const n1sq = n1 * n1;                          // :3145
  const a = sat01(AURORA_F32.nz * (n1 * n1sq) * -1 + 1); // :3146-3147 mad r0.x_sat
  const f1 = grad + AURORA_F32.add01;            // :3148 mad t0.y,r0.z,c7.x
  const b = f1 + (1 - f1) * a;                   // :3149 lrp(1, A, f1)
  const b2 = sdY * (1 - b) + b;                  // :3150-3151 mad c4.y,1−B,+B
  const f2 = grad * sdY;                         // :3152 mul r2.y,c4.y
  const c = f2 + (1 - f2) * b2;                  // :3153 lrp(1, b2, f2)
  const t15 = AURORA_F32.add01 + AURORA_F32.mul09 * c;   // :3154 mad c7.w,c7.x
  const n2sq = n2 * n2;                          // :3155
  const d = n2sq * -n2sq + 1;                    // :3156 mad ·(−r0.z)+c5.w → 1−n2⁴
  const e = d > 0 ? d : 0;                       // :3157 max(·, c6.x=0)
  const f = sdY * (1 - e) + e;                   // :3158-3159 mad c4.y,1−E,+E
  const g = f2 + (1 - f2) * f;                   // :3160 lrp(1, F, f2)
  const t16 = AURORA_F32.add03 + AURORA_F32.mul07 * g;   // :3161 mad c7.y,c7.z
  const band = sat01(grad * AURORA_F32.mul3);    // :3165 mul r0.y_sat
  return (t15 * t16) * (band * Math.pow(n3, AURORA_F32.pow1_2));  // :3162-3166
}

/** 完整像素输出(:3167-3171):oC0.rgb = sat(intensity·(v0.rgb + sat(v0.rgb·sd.x))),
 *  α=c6.x=0(UNORM 钳 0..1)。v0=插值后的顶点色(Color×num28 已 byte 截断/255)。
 *  ★#52 mul r0.yzw_sat = 逐通道 v+sat(v·sd.x)(2026-08-24 r15);v·sd.x≤1 时
 *  等价旧式 intensity·(1+sd.x)·v,sd.x>1/v 高位时旧式高估(现按字节码精确形)。 */
export function auroraPixel(n1: number, n2: number, n3: number, grad: number,
  sdX: number, sdY: number, vr: number, vg: number, vb: number): [number, number, number] {
  const k = auroraIntensity(n1, n2, n3, grad, sdY);              // :3162-3166
  const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v); // :3171 oC0 UNORM
  const ch = (v: number): number => v + Math.min(1, Math.max(0, v * sdX)); // :3168 mul r0.yzw_sat + :3169 add
  return [sat(k * ch(vr)), sat(k * ch(vg)), sat(k * ch(vb))];
}

// ---- 噪声面(Extra_286/287 R 通道,LinearWrap 双线性 → 红通道平面浮点缓存) ----
let tex286: Float32Array | null = null;   // 256×256
let tex287: Float32Array | null = null;   // 128×128
let noiseState = 0;                       // 0 未启动/失败待重试 / 1 在途 / 2 就绪
let noiseFailAt = 0;                      // 失败时刻(TTL 内不重发,2026-08-25 同类扫描:
                                          // 原状态机 onerror 未接线,失败闩死在 1=极光永不渲染)
const NOISE_FAIL_TTL = 10_000;

function loadRedPlane(src: string, w: number, done: (p: Float32Array) => void, onFail: () => void): void {
  const img = new Image();
  img.onload = (): void => {
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = w;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) { onFail(); return; }
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, w).data;
      const plane = new Float32Array(w * w);
      for (let i = 0; i < plane.length; i++) plane[i] = d[i * 4] / 255;
      done(plane);
    } catch { onFail(); }
  };
  img.onerror = (): void => { onFail(); };
  img.src = src;
}

/** 首次 draw 触发噪声面懒加载(同源静态资源;remaster 热替换不追踪,备案) */
function ensureNoise(): void {
  if (noiseState !== 0) return;
  if (noiseFailAt && Date.now() - noiseFailAt < NOISE_FAIL_TTL) return;   // 失败 TTL 内不重发
  if (typeof Image === 'undefined' || typeof document === 'undefined') { noiseState = 1; return; }
  noiseState = 1;
  let pending = 2;
  let failed = false;
  const finish = (p: Float32Array | null): void => {
    // null 回执 = 该张加载失败(曾因丢弃 p 使 failed 恒 false → 失败照样置就绪,
    // 下帧 uploadNoise(null).length 崩停帧循环;现凭回执判定,TTL 后自动重试)
    if (p === null) failed = true;
    if (--pending === 0) {
      if (failed) { noiseState = 0; noiseFailAt = Date.now(); }
      else noiseState = 2;
    }
  };
  loadRedPlane('sprites/vanilla/Extra_286.png', 256, (p) => { tex286 = p; finish(p); }, () => finish(null));
  loadRedPlane('sprites/vanilla/Extra_287.png', 128, (p) => { tex287 = p; finish(p); }, () => finish(null));
}

/** 噪声面是否就绪(探针/测试用) */
export function auroraNoiseReady(): boolean { return noiseState === 2; }

/** Extra_286 在 v 恒定(带内时间常量)时的纵向预混列:col[x] = 上下行按 fy 混合。
 *  逐像素只剩横向一维 lerp(热路径内联);与 :3142/:3143 的 wrap 双线性在数学上
 *  等价(仅 fp 结合次序不同,差 ~1e-7,远小于 GPU f32 与 f64 的固有差)。
 *  287 无常量维 → 热路径内联全二维 wrap 双线性。 */
function blendColumns(t: Float32Array, v: number, out: Float32Array): void {
  const y = v * 256 - 0.5;
  const y0 = Math.floor(y);
  const fy = y - y0;
  const ra = (y0 & 255) * 256, rb = ((y0 + 1) & 255) * 256;
  for (let x = 0; x < 256; x++) {
    const a = t[ra + x], c = t[rb + x];
    out[x] = a + (c - a) * fy;
  }
}

// ================= AuroraSky 实例(CustomSky 状态机 + 逐像素光栅) =================

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
  /** Main.GlobalTimeWrappedHourly(秒,%3600;缺省 GameTime 单源——★BJ330)——
   *  兼作像素公式的 uTime(MiscShaderData.Apply :91) */
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
  /** t0.x = AddVertexPair 的 uv_x(:401 num10,含 flag5 i==1 重映射终值) */
  private sU = new Float32Array(SAMPLES);
  /** t0.z = |v−v2| 参考空间厚度(AddVertexPair :199 Vector2.Distance;底=t0.y 同值) */
  private sD = new Float32Array(SAMPLES);
  /** 底边顶点色 color.RGB(0-255;顶边 color2 恒白——luminosity 全分支恒 1,见下) */
  private sR = new Float32Array(SAMPLES);
  private sG = new Float32Array(SAMPLES);
  private sB = new Float32Array(SAMPLES);
  /** num28 = num16·skyOpacity·num18·num4(:380)顶点 α */
  private sA = new Float32Array(SAMPLES);
  /** 逐像素烘焙离屏(grow-only 复用;α=255 黑底,'lighter' 加法直读 rgb) */
  private bandCanvas: HTMLCanvasElement | null = null;
  /** SM2 字节码解释器上下文（Aurora pass .cso 逐指令执行） */
  private sm2Pass: SM2Pass | null = null;
  private _sm2C = new Float64Array(64 * 4);
  private _sm2Regs = new Float64Array(32 * 4);
  private _sm2Tex = new Float64Array(8 * 4);
  private _sm2V0 = new Float64Array(8);
  private _sm2O = new Float64Array(4);
  /** WebGL2 极光渲染器（用户令：GPU shader 渲染替代 CPU 离屏）。
   *  ★懒建（#perf2026-08-28 trace 定罪：字段初始化式 new GLAurora() 在构造链
   *  Game→Renderer→SkyRenderer→AuroraSky 上一同步引爆 getContext+着色器编译
   *  ~790ms=进图风暴主犯,prewarmGameGL 够不到的死角）。改惰性访问器后由
   *  Renderer.prewarmGameGL 显式预热到加载页窗口；取值路径语义不变 */
  private _glAurora: GLAurora | null = null;
  get glAurora(): GLAurora {
    return this._glAurora ?? (this._glAurora = new GLAurora());
  }
  /** 预热入口（仅触发惰建;幂等） */
  prewarmGL(): void { void this.glAurora; }
  /** GL 顶点暂存（grow-only 复用；3 带上限 × 140 段 × 6 顶点 × 8 float） */
  private glVerts: Float32Array | null = null;
  private glNoiseReady = false;
  private bandCtx: CanvasRenderingContext2D | null = null;
  private bandImg: ImageData | null = null;
  private bandBuf32: Uint32Array | null = null;
  /** 三角形顶点暂存(x,y,u,ty,tz,r,g,b)×4 顶点(段四边形),零分配 */
  private triV = new Float64Array(32);
  /** 286 两路纵向预混列(每带每帧重建;v=c3x/c1x 带内常量) */
  private colR1 = new Float32Array(256);
  private colR2 = new Float32Array(256);

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
  get isActive(): boolean {
    // ★债登记（2026-09-25 塌方 trace:P0-A 路径面 isActive 轮询占 8.4%）——上游
    //  高频轮询本 getter 的消费方随 P0-A 自愈提速回落,观察项非定谳;若回落后仍
    //  热点,再评估把 isActive 并入每帧一次的天空态快照（勿单方面改谓词语义）。
    return this._isActive;
  }
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
    const globalTime = o.globalTime ?? globalTimeWrappedHourly();   // ★BJ330：GTW 单源（原 performance.now 缺省）
    // :126-128 参考空间 → 屏空间:scale = 屏宽/1920(背景矩阵按恒等屏空间处理【推断】)
    const scale = viewW / AURORA_REF_W;
    ensureNoise();                                        // 噪声面懒加载(首 draw 触发)
    for (let i = 0; i < m.bands; i++) this.computeBand(i, m, globalTime, skyOpacity, scale);
    // 纹理未就位帧跳过:加载窗 ≤ 数十 ms,而 skyOpacity 淡入 ≥ 数秒,视觉不可见;
    // 失败(资源缺失)则极光不画——像素公式的采样器是硬依赖,不做近似降级。
    // 除状态字外再验数据面(双保险:任何状态机漂移都不许把 null 送进渲染管线)。
    if (noiseState !== 2 || !tex286 || !tex287) return;
    // ★WebGL2 GPU 渲染路径（用户令：shader 反编译→GLSL→GPU 逐像素）——
    //    computeBand 已产出带几何（sBotX/Y/sTopX/Y/sU/sD/sR/G/B/sA），
    //    展开为三角形顶点传 GLAurora 用 GPU shader 逐像素渲染。
    //    CPU rasterBands 保留为 GL 不可用时的兜底。
    if (this.glAurora.ready) {
      this.renderGL(ctx, viewW, viewH, m, globalTime);
      return;
    }
    this.rasterBands(ctx, m, globalTime);
  }

  /** WebGL2 极光渲染：computeBand 几何 → 逐带 GLAurora GPU 渲染（specificData
   *  逐带不同，分带 draw）→ blit 到主画布（×2 = CullNone 双面等效） */
  private renderGL(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    m: AuroraMode, globalTime: number): void {
    if (!this.glAurora.ready) return;
    const SEG = AURORA_SEG;
    const maxFloats = 3 * SEG * 6 * 8;
    if (!this.glVerts || this.glVerts.length < maxFloats) this.glVerts = new Float32Array(maxFloats);
    this.glAurora.beginFrame(viewW, viewH, globalTime, tex286!, tex287!);
    const V = this.glVerts!;
    let drew = false;
    for (let i = 0; i < m.bands; i++) {
      const sd = auroraSpecificData(m, i);
      let vi = 0;
      const base = i * (SEG + 1);
      for (let k = SEG; k >= 1; k--) {
        const o1 = base + k, o2 = base + k - 1;
        const a1 = this.sA[o1], a2 = this.sA[o2];
        if (a1 <= 0 && a2 <= 0) continue;
        // 顶点(x,y,u,grad,d,r,g,b):grad 顶缘 0/底缘 1(:3139 grad=t0.y/t0.z,
        //  四角恰 0/1 且 t0.z 沿横向线性 → 内域 grad≡(1-s) 与直传属性插值精确
        //  同值);色 = XNA Color*float 的 byte 截断(底=带色×num28,顶=白×num28 :401)
        const push = (o: number, top: boolean): void => {
          const a = this.sA[o];
          V[vi++] = top ? this.sTopX[o] : this.sBotX[o];
          V[vi++] = top ? this.sTopY[o] : this.sBotY[o];
          V[vi++] = this.sU[o];
          V[vi++] = top ? 0 : 1;
          V[vi++] = this.sD[o];
          V[vi++] = ((top ? 255 : this.sR[o]) * a | 0) / 255;
          V[vi++] = ((top ? 255 : this.sG[o]) * a | 0) / 255;
          V[vi++] = ((top ? 255 : this.sB[o]) * a | 0) / 255;
        };
        push(o1, false); push(o1, true); push(o2, false);
        push(o1, true); push(o2, true); push(o2, false);
      }
      if (vi > 0) { this.glAurora.drawBand(V, vi / 8, sd[0], sd[1]); drew = true; }
    }
    if (!drew) return;
    // blit GL canvas → 主画布（additive，×2 = includeBacksides+CullNone 双画）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glAurora.canvas!, 0, 0, viewW, viewH);
    ctx.drawImage(this.glAurora.canvas!, 0, 0, viewW, viewH);
    ctx.restore();
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
    // specificData(X/Y/Z/W :139-189)→ auroraSpecificData()(像素公式消费:
    // X=亮度乘 1+X、Y=UV/lerp 竖向参数;Z/W 字节码不读)
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
      // AddVertexPair(v,v2,num10,color*num28,color2*num28)(:401)→采样落盘:
      // 位置×scale(参考→屏);texcoord 的 d=|v−v2| 在参考空间(矩阵缩放前)。
      const d = Math.sqrt((vx - tx) * (vx - tx) + (vy - ty) * (vy - ty));  // :199
      this.sBotX[o] = vx * scale; this.sBotY[o] = vy * scale;
      this.sTopX[o] = tx * scale; this.sTopY[o] = ty * scale;
      this.sU[o] = num10;
      this.sD[o] = d;
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

  /** 全带逐像素光栅:141 段×2 三角形(PrepareIndices :135-140)扫描线跨度覆盖 +
   *  仿射增量插值(t0x/t0y/t0z/v0.rgb)→ SM2 公式 → 离屏 ImageData → 'lighter'×2。
   *  覆盖:逐扫描线解三边与 sx 的交点得闭区间跨度(内部 E>0);相邻三角形共享边
   *  系数互为精确取负 → 交点 bitwise 同值 → 跨度相接零缝隙(交点恰落像素中心时
   *  双画,测度零;加法合成下不可见)。
   *  性能(2026-08-20 Chrome/M 系实测):q=0.5 逐像素覆盖版 21-40ms/帧 →
   *  跨度+286 纵向预混列+增量属性后见 AURORA_QUALITY 注释。 */
  private rasterBands(ctx: CanvasRenderingContext2D, m: AuroraMode, globalTime: number): void {
    const n = m.bands * (AURORA_SEG + 1);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let o = 0; o < n; o++) {
      let v = this.sBotX[o]; if (v < minX) minX = v; if (v > maxX) maxX = v;
      v = this.sTopX[o]; if (v < minX) minX = v; if (v > maxX) maxX = v;
      v = this.sBotY[o]; if (v < minY) minY = v; if (v > maxY) maxY = v;
      v = this.sTopY[o]; if (v < minY) minY = v; if (v > maxY) maxY = v;
    }
    if (!Number.isFinite(minX)) return;
    const q = AURORA_QUALITY;
    const bx = Math.floor(minX) - 1, by = Math.floor(minY) - 1;
    const bw = Math.ceil(maxX) + 1 - bx, bh = Math.ceil(maxY) + 1 - by;
    const ow = Math.max(1, Math.round(bw * q)), oh = Math.max(1, Math.round(bh * q));
    if (!this.bandCanvas) {
      this.bandCanvas = document.createElement('canvas');
      this.bandCtx = this.bandCanvas.getContext('2d');
    }
    const cv = this.bandCanvas, g = this.bandCtx;
    if (!g) return;
    if (cv.width < ow || cv.height < oh) {
      cv.width = Math.max(cv.width, ow); cv.height = Math.max(cv.height, oh);
      this.bandImg = null;                                 // 尺寸变 → 重建
    }
    if (!this.bandImg) {
      this.bandImg = g.createImageData(cv.width, cv.height);
      this.bandBuf32 = new Uint32Array(this.bandImg.data.buffer);
    }
    this.bandBuf32!.fill(0xFF000000, 0, ow * oh);          // α=255 黑底('lighter' 加 0)

    const V = this.triV;
    // ★SM2 字节码解释器初始化（Aurora pass .cso 逐指令执行）
    if (!this.sm2Pass) this.sm2Pass = getPass('Aurora');
    const sm2Pass = this.sm2Pass;
    const uniforms = defaultUniforms();
    uniforms.uTime = globalTime;
    let sm2C: Float64Array | null = null;
    let sm2Samplers: SM2Sampler[] | null = null;
    if (sm2Pass && tex286 && tex287) {
      uniforms.uShaderSpecificData = [0, 0, 0, 0];  // per-band 覆写
      sm2C = sm2Pass.setupConstants(uniforms);
      sm2Samplers = [
        (u: number, v: number): [number, number, number, number] => {
          const x = u * 256 - 0.5, y = v * 256 - 0.5;
          const ix = Math.floor(x), iy = Math.floor(y);
          const fx = x - ix, fy = y - iy;
          const x0 = ix & 255, x1 = (ix + 1) & 255;
          const y0 = (iy & 255) * 256, y1 = ((iy + 1) & 255) * 256;
          const a = tex286![y0 + x0], b = tex286![y0 + x1];
          const c = tex286![y1 + x0], d = tex286![y1 + x1];
          const r0 = a + (b - a) * fx, r1 = c + (d - c) * fx;
          return [r0 + (r1 - r0) * fy, 0, 0, 1];
        },
        (u: number, v: number): [number, number, number, number] => {
          const x = u * 128 - 0.5, y = v * 128 - 0.5;
          const ix = Math.floor(x), iy = Math.floor(y);
          const fx = x - ix, fy = y - iy;
          const x0 = ix & 127, x1 = (ix + 1) & 127;
          const y0 = (iy & 127) * 128, y1 = ((iy + 1) & 127) * 128;
          const a = tex287![y0 + x0], b = tex287![y0 + x1];
          const c = tex287![y1 + x0], d = tex287![y1 + x1];
          const r0 = a + (b - a) * fx, r1 = c + (d - c) * fx;
          return [r0 + (r1 - r0) * fy, 0, 0, 1];
        },
      ];
    }
    for (let i = 0; i < m.bands; i++) {
      const sd = auroraSpecificData(m, i);
      const sdX = sd[0], sdY = sd[1];
      const T = globalTime + globalTime + sdY;             // preshader :3174-3175
      const c3x = T * 0.02, c1x = T * 0.01, c2x = -c3x, c0x = -c1x;  // :3176-3179
      // 286 两路 v 坐标带内恒量(c3x/c1x)→ 纵向预混列(见 blendColumns)
      blendColumns(tex286!, c3x, this.colR1);
      blendColumns(tex286!, c1x, this.colR2);
      const base = i * (AURORA_SEG + 1);
      for (let k = AURORA_SEG; k >= 1; k--) {
        const o1 = base + k, o2 = o1 - 1;
        const a1 = this.sA[o1], a2 = this.sA[o2];
        if (a1 <= 0 && a2 <= 0) continue;                  // 两端 num28≤0 → 顶点色黑,零贡献
        // 顶点(x,y,u,ty,tz,r,g,b);色 = XNA Color*float 的 byte 截断(int cast)→/255
        V[0] = this.sBotX[o1]; V[1] = this.sBotY[o1];
        V[2] = this.sU[o1]; V[3] = this.sD[o1]; V[4] = this.sD[o1];
        V[5] = (this.sR[o1] * a1 | 0) / 255; V[6] = (this.sG[o1] * a1 | 0) / 255; V[7] = (this.sB[o1] * a1 | 0) / 255;
        V[8] = this.sTopX[o1]; V[9] = this.sTopY[o1];
        V[10] = this.sU[o1]; V[11] = 0; V[12] = this.sD[o1];
        const w1 = (255 * a1 | 0) / 255; V[13] = w1; V[14] = w1; V[15] = w1;   // color2=白×num28
        V[16] = this.sBotX[o2]; V[17] = this.sBotY[o2];
        V[18] = this.sU[o2]; V[19] = this.sD[o2]; V[20] = this.sD[o2];
        V[21] = (this.sR[o2] * a2 | 0) / 255; V[22] = (this.sG[o2] * a2 | 0) / 255; V[23] = (this.sB[o2] * a2 | 0) / 255;
        V[24] = this.sTopX[o2]; V[25] = this.sTopY[o2];
        V[26] = this.sU[o2]; V[27] = 0; V[28] = this.sD[o2];
        const w2 = (255 * a2 | 0) / 255; V[29] = w2; V[30] = w2; V[31] = w2;
        // PrepareIndices :135-140 前向两三角(后 6 索引=同三角背向,CullNone 重画
        // 两次 → 合成端 drawImage×2)
        this.rasterTri(0, 8, 16, bx, by, q, ow, oh, sdX, sdY, c2x, c0x, sm2Pass, sm2C, sm2Samplers);
        this.rasterTri(16, 8, 24, bx, by, q, ow, oh, sdX, sdY, c2x, c0x, sm2Pass, sm2C, sm2Samplers);
      }
    }
    g.putImageData(this.bandImg, 0, 0, 0, 0, ow, oh);
    const prevOp = ctx.globalCompositeOperation;
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.globalCompositeOperation = 'lighter';              // α=0×One/InvSrcAlpha → 加法
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, 0, 0, ow, oh, bx, by, bw, bh);
    ctx.drawImage(cv, 0, 0, ow, oh, bx, by, bw, bh);       // includeBacksides+CullNone ×2
    ctx.globalCompositeOperation = prevOp;
    ctx.imageSmoothingEnabled = prevSmooth;
  }

  /** 单三角形扫描线跨度光栅(V[b0/b1/b2] 顶点;离屏像素中心反投回屏坐标,
   *  属性沿跨度增量步进——属性精度 1e-12 级漂移,覆盖判定仍逐线精确求交)。 */
  private rasterTri(b0: number, b1: number, b2: number,
    bx: number, by: number, q: number, ow: number, oh: number,
    sdX: number, sdY: number, c2x: number, c0x: number,
    sm2Pass: SM2Pass | null, sm2C: Float64Array | null,
    sm2Samplers: SM2Sampler[] | null): void {
    const V = this.triV;
    const v0x = V[b0], v0y = V[b0 + 1], v1x = V[b1], v1y = V[b1 + 1], v2x = V[b2], v2y = V[b2 + 1];
    const e1x = v1x - v0x, e1y = v1y - v0y, e2x = v2x - v0x, e2y = v2y - v0y;
    const det = e1x * e2y - e1y * e2x;
    if (det === 0) return;                                 // 零面积三角形 GPU 不光栅化
    // 边系数 A·px+B·py+C(内部>0;det<0 时整组精确取负)
    let a0 = -e1y, b0c = e1x, c0v = e1y * v0x - e1x * v0y;
    let a1 = -(v2y - v1y), b1c = v2x - v1x, c1v = (v2y - v1y) * v1x - (v2x - v1x) * v1y;
    let a2 = -(v0y - v2y), b2c = v0x - v2x, c2v = (v0y - v2y) * v2x - (v0x - v2x) * v2y;
    if (det < 0) {
      a0 = -a0; b0c = -b0c; c0v = -c0v;
      a1 = -a1; b1c = -b1c; c1v = -c1v;
      a2 = -a2; b2c = -b2c; c2v = -c2v;
    }
    // 属性仿射梯度(attr = a0 + gx·dx + gy·dy;6 通道:u/t0y/t0z/r/g/b)
    const inv = 1 / det;
    const g1 = (p: number): number => (V[b1 + p] - V[b0 + p]) * e2y - e1y * (V[b2 + p] - V[b0 + p]);
    const g2 = (p: number): number => e1x * (V[b2 + p] - V[b0 + p]) - (V[b1 + p] - V[b0 + p]) * e2x;
    const gux = g1(2) * inv, guy = g2(2) * inv;
    const gtx = g1(3) * inv, gty = g2(3) * inv;
    const gzx = g1(4) * inv, gzy = g2(4) * inv;
    const grx = g1(5) * inv, gry = g2(5) * inv;
    const ggx = g1(6) * inv, ggy = g2(6) * inv;
    const gbx = g1(7) * inv, gby = g2(7) * inv;
    const u00 = V[b0 + 2], ty00 = V[b0 + 3], tz00 = V[b0 + 4];
    const r00 = V[b0 + 5], g00 = V[b0 + 6], b00 = V[b0 + 7];
    // 离屏行范围(像素中心反投:sy = by+(oy+0.5)/q)
    const ymin = Math.min(v0y, v1y, v2y), ymax = Math.max(v0y, v1y, v2y);
    let oy0 = Math.ceil((ymin - by) * q - 0.5), oy1 = Math.floor((ymax - by) * q - 0.5);
    if (oy0 < 0) oy0 = 0; if (oy1 > oh - 1) oy1 = oh - 1;
    if (oy0 > oy1) return;
    const q1 = 1 / q;
    const du = gux * q1, dty = gty * q1, dtz = gzy * q1;
    const dr = grx * q1, dg = ggx * q1, db = gbx * q1;
    const du1 = du * AURORA_F32.mul20, du2 = du * AURORA_F32.mul6;
    const data = this.bandImg!.data;
    const colR1 = this.colR1, colR2 = this.colR2, t287 = tex287!;
    const kx = 1 + sdX;                                    // :3167-3169 ×(1+sdX)
    for (let oy = oy0; oy <= oy1; oy++) {
      const sy = by + (oy + 0.5) * q1;
      // 三边与 sx 的交点 → 覆盖跨度 [enter, exit](内部 E>0;A>0 边给下界,
      //  A<0 边给上界,A==0 水平边只做整线通过/拒绝)
      let enter = -Infinity, exit = Infinity;
      let t = b0c * sy + c0v;
      if (a0 > 0) { const xc = -t / a0; if (xc > enter) enter = xc; }
      else if (a0 < 0) { const xc = -t / a0; if (xc < exit) exit = xc; }
      else if (t < 0) continue;
      t = b1c * sy + c1v;
      if (a1 > 0) { const xc = -t / a1; if (xc > enter) enter = xc; }
      else if (a1 < 0) { const xc = -t / a1; if (xc < exit) exit = xc; }
      else if (t < 0) continue;
      t = b2c * sy + c2v;
      if (a2 > 0) { const xc = -t / a2; if (xc > enter) enter = xc; }
      else if (a2 < 0) { const xc = -t / a2; if (xc < exit) exit = xc; }
      else if (t < 0) continue;
      if (enter > exit) continue;
      let px0 = Math.ceil((enter - bx) * q - 0.5);
      let px1 = Math.floor((exit - bx) * q - 0.5);
      if (px0 < 0) px0 = 0; if (px1 > ow - 1) px1 = ow - 1;
      if (px0 > px1) continue;
      // 跨度起点属性(px0 像素中心屏坐标)
      const dx0 = bx + (px0 + 0.5) * q1 - v0x, dy0 = sy - v0y;
      let u = u00 + gux * dx0 + guy * dy0;
      let tyv = ty00 + gtx * dx0 + gty * dy0;
      let tz = tz00 + gzx * dx0 + gzy * dy0;
      let r = r00 + grx * dx0 + gry * dy0;
      let g = g00 + ggx * dx0 + ggy * dy0;
      let b = b00 + gbx * dx0 + gby * dy0;
      let u1x = (u + sdY) * AURORA_F32.mul20 + c2x;        // :3133/:3134-3135
      let u2x = (u + sdY) * AURORA_F32.mul6 + c0x;         // :3136-3137
      let idx = (oy * ow + px0) * 4;
      for (let x = px0; x <= px1; x++, idx += 4) {
        const gv = tyv * (1 / tz);
        // ★SM2Effect 字节码解释器逐像素执行 .cso Aurora pass 实际指令（用户令替换手写公式）
        if (sm2Pass && sm2C && sm2Samplers) {
          const V0 = this._sm2V0, TX = this._sm2Tex;
          V0[0] = r; V0[1] = g; V0[2] = b; V0[3] = 1;
          TX[2] = tz;
          const res = sm2Pass.execPixel(sm2C, this._sm2Regs, TX, V0, this._sm2O, u, gv, sm2Samplers);
          if (res) {
            data[idx] = Math.min(255, data[idx] + res[0] * 255);
            data[idx + 1] = Math.min(255, data[idx + 1] + res[1] * 255);
            data[idx + 2] = Math.min(255, data[idx + 2] + res[2] * 255);
          }
        } else {
          // 兜底：手写公式（bake 失败时）
          const x1 = u1x * 256 - 0.5; let i1 = Math.floor(x1);
          const f1v = x1 - i1;
          const va = colR1[i1 & 255], vb = colR1[(i1 + 1) & 255];
          const n1 = va + (vb - va) * f1v;
          const x2 = u2x * 256 - 0.5; let i2 = Math.floor(x2);
          const f2v = x2 - i2;
          const wa = colR2[i2 & 255], wb = colR2[(i2 + 1) & 255];
          const n2 = wa + (wb - wa) * f2v;
          const x3 = u * 128 - 0.5, y3 = gv * 128 - 0.5;
          let i3 = Math.floor(x3); let j3 = Math.floor(y3);
          const fx3 = x3 - i3, fy3 = y3 - j3;
          const ta = t287[(j3 & 127) * 128 + (i3 & 127)], tb = t287[(j3 & 127) * 128 + ((i3 + 1) & 127)];
          const tc = t287[((j3 + 1) & 127) * 128 + (i3 & 127)], td = t287[((j3 + 1) & 127) * 128 + ((i3 + 1) & 127)];
          const n3 = ta + (tb - ta) * fx3 + ((tc + (td - tc) * fx3) - (ta + (tb - ta) * fx3)) * fy3;
          const k = auroraIntensity(n1, n2, n3, gv, sdY) * kx;
          data[idx] = Math.min(255, data[idx] + r * k * 255);
          data[idx + 1] = Math.min(255, data[idx + 1] + g * k * 255);
          data[idx + 2] = Math.min(255, data[idx + 2] + b * k * 255);
        }
        u += du; tyv += dty; tz += dtz; r += dr; g += dg; b += db;
        u1x += du1; u2x += du2;
      }
    }
  }
}
