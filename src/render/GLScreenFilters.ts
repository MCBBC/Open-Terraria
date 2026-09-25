// 屏幕后处理滤镜 GL 模块（ScreenShader.cso SM2 字节码逐指令 1:1）。
//
// 唯一真值 = 反编译 SM2 字节码（../terraria-assets/ScreenShader.cso；
// `node tools/disasm-fx.mjs ../terraria-assets/ScreenShader.cso <out>` 反汇编，
// 本文件行号注释 = 反汇编输出行号）。本模块覆盖的 pass：
//   FilterHeatDistortion :839  FilterMiniTower :483  FilterGraveyard :159
//   FilterBloodMoon     :429  FilterTest2     :1122  FilterCRT       :1182
// （FilterMoonLord :103 / FilterSepia :176 / FilterNoir :248 未入——见
//  MonolithFilters 审计结论表。）
//
// C# 注入侧（uniform 取值来源）：
//   ScreenEffectInitializer.cs:15-47（pass 名/UseColor/UseOpacity/UseIntensity）
//   ScreenShaderData.Apply()（uTime=GlobalTimeWrappedHourly、
//   uScreenResolution=UnscaledScreenSize=screen/RenderZoom、
//   uScreenPosition=UnscaledScreenPosition−offScreenRange(=200)、
//   uOpacity=CombinedOpacity=UseOpacity×Filter.Opacity、uImageSize1=噪声图尺寸）
//   FilterManager.EndCapture（链式叠加 + 每级 ×ColorOfTheSkies :172/:194）。
//
// 采样态：s1=Images/Misc/noise(256²,POT)→LinearWrap（ScreenShaderData.cs:175-178
// POT 分支，显式设 SamplerStates[1]）；s0=链上前级目标→LinearClamp（★BJ65
// 2026-09-13 勘误：滤镜循环 spriteBatch.Begin(Immediate,AlphaBlend) 两参调用
// sampler=null → FNA `?? SamplerState.LinearClamp`（FNA SpriteBatch.cs:296；
// 1.4.5.7 跑 FNA=反编译 csproj FNA.dll/SDL3 指纹）。Apply() 只设 s1-s3 采样器、
// 从不设 s0。旧注「XNA 设备默认 LinearWrap→片元 mod 手工 wrap」系错框架假设，
// 曾致 FRAG_HEAT 顶行回绕采底行=用户实报顶部 1-2px 错位条伪影，已废——
// s0 越界一律钳边（uScreen=CLAMP_TO_EDGE），勿再手写 wrap。

/** 一条滤镜链中的一个 pass（字段=已折入 preshader 的语义 uniform） */
export type ScreenFxPass =
  | {
    kind: 'FilterHeatDistortion';
    /** c4=UnscaledScreenSize(viewW/z, viewH/z)；c5=屏幕左上世界px（ScreenShaderData.cs:96-98） */
    screenRes: [number, number];
    screenPos: [number, number];
    /** preshader：c0=1/uImageSize1、c1/c2=±0.04·uTime、c3=(uIntensity·uOpacity)/c4 */
    intensity: number;
    opacity: number;
    /** uTime=GlobalTimeWrappedHourly（秒，%3600 Main.cs:16777） */
    time: number;
  }
  | { kind: 'FilterMiniTower'; color: readonly [number, number, number]; opacity: number }
  /** ★BJ109-I：塔邻接屏幕染色（SceneState.cs:107-110 ManageSpecialBiomeVisuals
   *  "Solar/Nebula/Vortex/Stardust"；ScreenEffectInitializer.cs:14-17 分塔预设）。
   *  uTargetPosition=最近塔心−(0,10)（SceneState.cs:107-110 尾参）；uIntensity/
   *  uProgress=塔盾态驱动（Main.cs:24565 盾在 UseIntensity(1+num319).UseProgress(0)/
   *  :24584 破盾 UseIntensity(min(5,15·num320)+1).UseProgress(num320)） */
  | { kind: 'FilterTower'; color: readonly [number, number, number]; opacity: number;
    screenRes: [number, number]; screenPos: [number, number]; targetPx: [number, number];
    intensity: number; progress: number; time: number }
  | { kind: 'FilterGraveyard'; intensity: number; progress: number; opacity: number }
  | { kind: 'FilterBloodMoon'; color: readonly [number, number, number]; intensity: number; opacity: number }
  | { kind: 'FilterTest2'; opacity: number }
  | { kind: 'FilterCRT'; screenH: number; zoom: number; opacity: number }
  /** ★批III尾窗：月总死亡倒计时 shake（FilterMoonLordShake :509-547；强度曲线
   *  Main.cs:65956-65965 clamp(sin(cd/60×0.5)×2,0,1)×(0.75−0.5·cd/max)） */
  | { kind: 'FilterMoonLordShake'; intensity: number; time: number }
  /** 天柱死亡水晶 tint（:986-1014；ScreenEffectInitializer.cs:42 UseColor(1,0,0.75)+
   *  UseIntensity(1)——UseOpacity 未设=默认 1,组装端按相序传强度） */
  | { kind: 'FilterCrystalDestructionColor'; color: readonly [number, number, number]; intensity: number; opacity: number }
  /** 天柱死亡水晶涡旋扭曲（:1016-1108；UseImage(Misc/noise) s1=LinearWrap,
   *  uTargetPosition=死亡塔水晶中心 px,uProgress=相2 (t/60)×30） */
  | { kind: 'FilterCrystalDestructionVortex'; screenRes: [number, number]; targetPx: [number, number]; intensity: number; progress: number; time: number }
  /** ★修齐批终口：收音机→Sepia（SceneState.cs:125,FilterSepia :176-247）——
   *  uColor=SepiaScreenShaderData.color（sepiaParams,可含负分量）;uProgress/uIntensity
   *  同源该 Update 链 */
  | { kind: 'FilterSepia'; color: readonly [number, number, number]; intensity: number; progress: number; opacity: number }
  /** 黑白→Noir（SceneState.cs:126,FilterNoir :248-341）——胶片颗粒随 uTime 滚动 */
  | { kind: 'FilterNoir'; opacity: number; time: number }
  /** 沙尘暴/暴风雪全屏色罩（SandstormSky.cs:49-60 / BlizzardSky.cs:48-60 的
   *  MagicPixel 全屏 alpha 混合,参数由 SkyRenderer.sandstormSkyTint/blizzardSkyTint
   *  按原版公式算好）。注意:这不是 FilterManager 滤镜(是 SkyManager 天空层),
   *  故 cots 已含在 color/alpha 内、不参与链尾 uTint 乘(EndCapture :194 不经过) */
  | { kind: 'SkyWeatherTint'; color: readonly [number, number, number]; alpha: number };

const VERT = `
attribute vec2 aPos;              // 单位 quad (0..1)^2
varying vec2 vUv;
void main() {
  vUv = aPos;                      // y 翻转同 GLWorldLight（canvas y 向下）
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

/** ★A1 FBO→FBO 直通 blit（偶数长度链的朝向归还;纯位搬运=零舍入面）:
 *  原 VERT 的 clip 翻转让「片元@FBO row v 采 vUv.y=(h−v−0.5)/h=源 row h−1−v 的
 *  精确 texel 中心」——源为恒等布局（v0=图像顶）时直通采样即产出 GL 朝向
 *  （v1=图像顶）副本,LINEAR 精确对齐中心=恒等重采样（A2/opresent present 同族
 *  已对拍实证）,8bit 值 k→k 零算术零舍入。 */
const FRAG_PASSTHRU = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

// ---- 各 pass 片元着色器（GLSL 100；常量/指令序照抄字节码） ----

/** FilterHeatDistortion（obj18 :839-871）：双噪声场差分 → 屏幕重采样 */
const FRAG_HEAT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;      // s0
uniform sampler2D uNoise;       // s1 = Images/Misc/noise
uniform vec2 uScreenRes;        // c4
uniform vec2 uScreenPos;        // c5
uniform vec2 uNoiseRcp;         // c0 = 1/uImageSize1（preshader rcp）
uniform float uTimeScroll;      // c1 = 0.04*uTime（c2 = -c1）
uniform vec2 uOffset;           // c3 = (uIntensity*uOpacity)/uScreenRes
uniform vec3 uTint;             // ColorOfTheSkies（EndCapture :194）
void main() {
  vec2 world = vUv * uScreenRes + uScreenPos;                     // :846-847
  vec2 halfNuv = world * uNoiseRcp * 0.5;                         // :848-849,851
  vec2 nB = texture2D(uNoise, halfNuv + vec2(0.0, -uTimeScroll)).rg; // :852-854(c2)
  vec2 nA = texture2D(uNoise, halfNuv + vec2(0.0,  uTimeScroll)).rg; // :850,855(c1)
  vec2 delta = nA - nB - 0.5;                                     // :856-857(def c6.y=-0.5)
  vec2 uvOut = vUv + delta * uOffset;                             // :858
  // ★BJ65 顶缘横线伪影定谳（2026-09-13 用户实报沙漠/地狱地表顶 1-2px 错位条）：
  //  字节码 :858-859 无 frc/sat/clamp，s0 越界行为=采样器地址模式。滤镜循环
  //  spriteBatch.Begin(Immediate, AlphaBlend) 两参调用 sampler=null → FNA 解析
  //  为 SamplerState.LinearClamp（FNA SpriteBatch.cs:296；1.4.5.7=FNA，
  //  反编译 csproj 引 FNA.dll+Program.cs SDL3/FNA3D 指纹；旧注「XNA 设备默认
  //  LinearWrap」系错框架假设已废）。故原版顶缘=钳到边行，此处曾有
  //  手工 mod 回绕 → 顶行采底行内容=1-2px 错位图像条。uScreen 纹理
  //  已是 CLAMP_TO_EDGE+LINEAR（init :492-495），与 FNA Clamp+双线性等价，
  //  越界交硬件钳制——内部像素（uv∈[0,1)）零改动。
  // ★v0 死参数定谳（2026-08-25 用户实报血月过暗）：ScreenShader.cso 全 pass 反汇编
  //  ——滤镜族（Heat/MiniTower/Graveyard/BloodMoon/Test2/CRT/MoonLord…）【无一读取
  //  v0】（仅 Default 直通/沙尘暴/暴风雪/水波读）——EndCapture C# 侧
  //  Draw(…, Main.ColorOfTheSkies) 的顶点色对着色器是死参数（自定义像素着色器
  //  不采样 v0 即不生效）。曾从 C# 侧误推 ×uTint = 全屏多乘一次夜色 → 血月
  //  暗得离谱（F9 也救不回，乘在光照之后）。已按字节码删除
  gl_FragColor = vec4(texture2D(uScreen, uvOut).rgb, 1.0); // :859
}`;

/** FilterMiniTower（obj12 :483-508）：V+min 亮度度量驱动的柱色推色 */
const FRAG_MINITOWER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform vec3 uColor;            // c0（ScreenEffectInitializer.cs:18-21）
uniform float uOpacity;         // c1 = UseOpacity×Filter.Opacity
uniform vec3 uTint;
void main() {
  vec4 s = texture2D(uScreen, vUv);                               // :489
  float V = max(max(s.r, s.g), s.b);                              // :490-491
  float mn = min(min(s.r, s.g), s.b);                             // :492-493
  float sum = V + mn;                                             // :494
  float k = sum - 1.0;                                            // :495(def c3.z)
  vec3 hi = mix(uColor, vec3(1.0) - uColor, k);                   // :496-497(c2=1-color preshader)
  vec3 lo = sum * uColor;                                         // :499
  vec3 tgt = k >= 0.0 ? hi : lo;                                  // :498,500(cmp r2.x=k/2)
  gl_FragColor = vec4(mix(s.rgb, tgt * s.a, uOpacity), 1.0); // :501-502（★v0 死参数,见 FRAG_HEAT 注）
}`;

/** ★BJ109-I FilterTower（obj9 :342-412，SceneShader.cso 反汇编直读）：目标向极坐标
 *  sin 扫描微扰采样（dir=rel/len（len 按 ×(1.5,1) 纵横度量 c11.xy）、
 *  amp=min(|50/(len−uProgress)|,5)×uIntensity、ph=frac(len·0.2+…)×2π−π、
 *  采样位=dir·(sin(ph)·amp+len)+target）+ V+min 亮度度量塔色推色
 *  （k=V+mn−1；hi=uColor+k·(1−2uColor)——与 FilterMiniTower :496-500 同度量族，
 *  字节码 cmp r3.w 恒负→恒走 hi 支）+lerp uOpacity；尾段 tapA.b−tapC.b/tapB.g−tapC.g
 *  两通道色差修正（:397-403，三 tap=uv→u 存插值 1/2.25/3.5）。
 *  ★近似备案：c1/c2 相位系数（preshader 输出）按 defs 邻值以 uTime 滚动近似；
 *  尾段两通道修正按主项重构。 */
const FRAG_TOWER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;      // s0
uniform vec3 uColor;            // c5 = UseColor（ScreenEffectInitializer.cs:14-17 分塔）
uniform float uOpacity;         // c9 = UseOpacity×Filter.Opacity
uniform float uIntensity;       // c10 = UseIntensity（塔盾态）
uniform float uProgress;        // c0 = UseProgress（破盾波前）
uniform vec2 uScreenRes;        // c6
uniform vec2 uScreenPos;        // c7
uniform vec2 uTargetPx;         // c8 = 塔心−(0,10) 世界px
uniform float uTime;
void main() {
  vec2 world = vUv * uScreenRes + uScreenPos;                     // :347-348
  vec2 rel = world - uTargetPx;                                   // :349
  float len = length(rel * vec2(1.5, 1.0));                       // :350-356（c11=(1.5,1,…)）
  vec2 dir = rel / max(len, 1e-4);                                // :357
  float amp = min(abs(50.0 / max(len - uProgress, 1e-3)), 5.0) * uIntensity; // :358-363
  float ph = fract(len * 0.2 + uTime * 0.045) * 6.2831853 - 3.1415927; // :364-370（相位近似,备案）
  float r2 = sin(ph) * amp + len;                                 // :371
  vec2 duv = (dir * r2 + uTargetPx - uScreenPos) / uScreenRes;    // :372-377
  vec4 sA = texture2D(uScreen, duv);                              // :378 tapA=全失真位
  vec4 sB = texture2D(uScreen, vUv + 2.25 * (duv - vUv));         // :379-380 tapB（c13.z=2.25）
  vec4 sC = texture2D(uScreen, vUv + 3.5 * (duv - vUv));          // :381-382 tapC（c13.w=3.5）
  float V = max(max(sC.r, sC.g), sC.b);                           // :384-386
  float mn = min(min(sC.r, sC.g), sC.b);                          // :387-389
  float k = (V + mn) - 1.0;                                       // :390-391（c11.y=1）
  vec3 tgt = uColor + k * ((vec3(1.0) - uColor) * 2.0 - uColor);  // :392-396（hi 支,c4=1−2uColor 近似）
  vec3 col = mix(sC.rgb, tgt * sC.a, uOpacity);                   // :404-406
  col.b += sA.b - sC.b;                                           // :397-399
  col.g += sB.g - sC.g;                                           // :401-403
  gl_FragColor = vec4(col, 1.0);
}`;

/** FilterGraveyard（obj6 :159-175）：intensity 标定灰度 + progress 去饱和 */
const FRAG_GRAVEYARD = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform float uIntensity;       // c1（SceneState.cs:138 UseIntensity(1.2)）
uniform float uProgress;        // c2（SceneState.cs:134 Lerp(0,0.75,强度)）
uniform float uOpacity;         // c0
uniform vec3 uTint;
void main() {
  vec4 s = texture2D(uScreen, vUv);                                // :165
  float gray = (s.r + s.g + s.b) * uIntensity * 0.333333;          // :166-168,169(c3)
  vec3 desat = mix(s.rgb, vec3(gray), uProgress);                  // :170
  gl_FragColor = vec4(mix(s.rgb, desat * s.a, uOpacity), 1.0); // :171-172（★v0 死参数,见 FRAG_HEAT 注）
}`;

/** FilterBloodMoon（obj11 :429-482）：V+min 分档染色 + 径向衰减 + alpha 抛物线 */
const FRAG_BLOODMOON = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform vec3 uColor;            // c2（UseColor(2,-0.8,-0.6) :27）
uniform float uIntensity;       // c4（BloodMoon 恒 1）
uniform float uOpacity;         // c3 = UseOpacity(BloodMoonScreenShaderData.Update)×Opacity
uniform vec3 uTint;
void main() {
  vec4 s = texture2D(uScreen, vUv);                               // :437
  // :438-445 c = uv-0.5（c0=1/sceneSize、c5=uImageSize0、c6=0 → EndCapture 默认恒等）
  vec2 c = vUv - 0.5;
  float d = length(c);
  float radial = (d - 0.3) >= 0.0 ? 1.0 - 2.0 * (d - 0.3) : 1.0;  // :446-448(不夹下界)
  float V = max(max(s.r, s.g), s.b);                              // :449-450
  float mn = min(min(s.r, s.g), s.b);                             // :451-452
  float sum = V + mn;                                             // :453
  vec3 hi = vec3(1.0) - (vec3(1.0) - uColor) * (1.5 - 0.5 * sum); // :456-457(c1=1-color)
  vec3 lo = sum * uColor;                                         // :459
  vec3 base = (0.5 * (1.0 - sum)) >= 0.0 ? lo : hi;               // :458,460(sum<=1→lo)
  base += -0.5 * sum;                                             // :461
  vec3 tgt = base * ((V - mn) + 0.166667) + 0.5 * sum;            // :454-455,462,466
  float amt = (1.0 - 0.5 * sum) * uIntensity * 0.7;               // :463-465
  vec3 A = s.a * tgt;                                             // :468
  vec3 mid = 0.3 * A + 0.7 * A * A;                               // :469-471
  vec3 outc = mix(s.rgb, mid, amt);                               // :472
  // :472-474 尾段 = mix(s.rgb, radial·outc, uOpacity)——★字节码 mov oDepth,r0 前
  //  无任何 v0 乘（dcl v0 声明即死）,×ColorOfTheSkies 系 C# 顶点色死参数误推,删除
  gl_FragColor = vec4(mix(s.rgb, radial * outc, uOpacity), 1.0); // :473-474
}`;

/** FilterTest2（obj25 :1122-1152）：复古柱 GB 四阶调色板（V+min 度量） */
const FRAG_TEST2 = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform float uOpacity;         // c0
uniform vec3 uTint;
void main() {
  vec4 s = texture2D(uScreen, vUv);                                // :1133
  float V = max(max(s.r, s.g), s.b);                               // :1134-1135
  float mn = min(min(s.r, s.g), s.b);                              // :1136-1137
  float x = max((V + mn) * 0.55 - 0.1, 0.0);                       // :1138-1140(c1)
  vec3 pal = x >= 0.75 ? vec3(0.607843, 0.737255, 0.058824)        // c2 :1141-1143
           : x >= 0.5  ? vec3(0.545098, 0.674510, 0.058824)        // c5 :1146
           : x >= 0.25 ? vec3(0.188235, 0.384314, 0.188235)        // c4 :1147
                       : vec3(0.058824, 0.219608, 0.058824);       // c3 :1146
  gl_FragColor = vec4(mix(s.rgb, pal, uOpacity), 1.0);     // :1148（★v0 死参数,见 FRAG_HEAT 注）
}`;

/** FilterCRT（obj27 :1182-1238）：不透明度缩放交叉桶形 + 边缘遮黑 + RGB 相位扫描线 */
const FRAG_CRT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform float uScreenH;         // c2.y = uScreenResolution.y（viewH/z）
uniform float uZoom;            // c4
uniform float uOpacity;         // c3
uniform vec3 uTint;
void main() {
  // c0=uImageSize0/uSceneSize、c1=倒数（EndCapture 默认恒等 :1234-1237）
  vec2 p = vUv * 2.0 - 1.0;                                        // :1193-1194
  vec2 q = p * uOpacity;                                           // :1195-1196
  vec2 q2 = (q / 7.0) * (q / 7.0);                                 // :1197-1198(c6.z=1/7)
  vec2 dst = p * vec2(1.0 + q2.y, 1.0 + q2.x);                     // :1199 交叉桶形
  vec2 duv = dst * 0.5 + 0.5;                                      // :1202
  // :1200-1215 边缘检测：bottom(dst.y>=1)/left(duv.x<=0)/top(duv.y<=0) 任一越界→黑
  float outSide = (dst.y * 0.5 - 0.5 >= 0.0 || duv.x <= 0.0 || duv.y <= 0.0) ? 1.0 : 0.0;
  vec2 suv = mod(duv, 1.0);                    // s0 wrap 等价（右缘越界采到左缘）
  vec4 col = outSide > 0.5 ? vec4(0.0) : texture2D(uScreen, suv);  // :1210,1215
  // :1216 cmp -uMultiChunkScene(false) → 恒取畸变采样
  // ★R33 C4：:1220 mad c8.y(+0.5) 后 frc——曾漏 +0.5 → cos/sin 反相（扫描线明暗带互换）
  float ph = fract(vUv.y * uScreenH * uZoom * 0.222656 + 0.5) * 6.283185 - 3.141593; // :1217-1221
  float mx = 1.0 + (cos(ph) - 1.0) * 0.13;                         // :1224-1225(c7.z)
  float my = 1.0 + (sin(ph) - 1.0) * 0.16;                         // :1223,1227(c7.x)
  vec3 scan = vec3(col.r * mx, col.g * my, col.b * mx);            // :1226-1228
  gl_FragColor = vec4(mix(col.rgb, scan, uOpacity), 1.0);  // :1230（★v0 死参数,见 FRAG_HEAT 注）
}`;

/** SkyWeatherTint（非 shader 移植——SandstormSky/BlizzardSky 的 SpriteBatch
 *  MagicPixel 全屏绘制）:out = src.rgb×src.a + dst×(1−src.a) = mix(dst, color, α)。
 *  不含 uTint:cots 已按天空层公式折入 color/alpha(SkyManager 层,非 EndCapture 链) */
const FRAG_SKY_TINT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform vec3 uColor;              // src.rgb(含 cots×强度系数)
uniform float uOpacity;           // src.a(=同一强度系数)
void main() {
  vec4 s = texture2D(uScreen, vUv);
  gl_FragColor = vec4(mix(s.rgb, uColor, uOpacity), 1.0);
}`;


/** ★批III尾窗 FilterMoonLordShake（obj13 :509-547）：水平 3-tap 微震(±dx 权重
 *  0.15/0.7/0.15,c1=preshader 0.01×I×sin(2π·frac(t×3.183099+0.5)−π))+径向压暗
 *  (gainX=1−1.3·d·I / gainY=1−d·I)。强度曲线=Main.cs:65956-65965（组装端算好） */
const FRAG_MOONSHAKE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform float uIntensity;       // c0（组装端=clamp(sin(cd/60*0.5)*2,0,1)*(0.75-0.5*cd/max)）
uniform float uTime;            // GlobalTimeWrappedHourly
void main() {
  float ph = fract(uTime * 3.1830988618 + 0.5) * 6.2831853 - 3.1415927; // preshader :546-551
  float dx = 0.01 * uIntensity * sin(ph);                // c1（:552）
  vec2 p = vUv - 0.5;                                    // :517（c2.x=-0.5）
  float d = length(p);                                   // :518-521（dp2add/rsq/rcp=√）
  float gainY = 1.0 - uIntensity * d;                    // :523
  float gainX = 1.0 - 1.3 * uIntensity * d;              // :524-525（c3.y=1.3）
  vec3 minus = texture2D(uScreen, vUv - vec2(dx, 0.0)).rgb; // :529
  vec3 plus  = texture2D(uScreen, vUv + vec2(dx, 0.0)).rgb; // :528
  vec3 ctr   = texture2D(uScreen, vUv).rgb;                 // :530
  vec3 col = ctr * 0.7 + plus * 0.15 + minus * 0.15;        // :531-534（c3.x=0.7/c2.w=0.15）
  gl_FragColor = vec4(col * vec3(gainX, gainY, gainY), 1.0); // :535（z 增益掩码省略,按 y 同档）
}`;

/** ★批III尾窗 FilterCrystalDestructionColor（obj21 :986-1014）：V=sat((r+g+b)/3),
 *  k=3-2V,q=(k·V²)²,m=sat(2q);色相正部选择(:1007-1008 cmp 级联近似)=
 *  m·uColor + max(2q-1,0)·(1-uColor);lrp uOpacity(=uIntensity,preshader :1013)。 */
const FRAG_CRYSTAL_COLOR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;
uniform vec3 uColor;            // c2 = (1,0,0.75)（ScreenEffectInitializer.cs:42）
uniform float uIntensity;       // 相序强度（组装端,Projectile.cs:37025/:37032）
uniform float uOpacity;         // UseOpacity 未设=1（:42 无该链）
void main() {
  vec4 s = texture2D(uScreen, vUv);                              // :994
  float V = clamp((s.r + s.g + s.b) / 3.0, 0.0, 1.0);            // :995-998（c3.x=1/3）
  float k = -2.0 * V + 3.0;                                      // :999（c3.y/z）
  float kV2 = k * V * V;                                         // :1000-1002
  float q = kV2 * kV2;                                           // :1003
  float m = clamp(2.0 * q, 0.0, 1.0);                            // :1006（sat）
  vec3 comp = (vec3(1.0) - uColor) * max(2.0 * q - 1.0, 0.0);    // :1007-1008（cmp 级联=正部）
  vec3 col = m * uColor + comp;                                  // :1009（mad c2）
  gl_FragColor = vec4(mix(s.rgb, col, uOpacity * uIntensity), 1.0); // :1011-1012（lrp,preshader uOp=I）
}`;

/** ★批III尾窗 FilterCrystalDestructionVortex（obj22 :1016-1108）：目标向极坐标
 *  噪声涡旋——atan 字节码=多项式逼近（GLSL atan 精确,数学级同构）;swirl=
 *  len·I+ang 采 noise(0.318319,0.02 两轴),径向窗 clamp(len·I-progress,0,π) 的
 *  sin×0.1 调制;噪声平方链（掩码省略,按主项 r 通道重构）。 */
const FRAG_CRYSTAL_VORTEX = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;      // s0
uniform sampler2D uNoise;       // s1 = Images/Misc/noise（LinearWrap）
uniform vec2 uScreenRes;        // c3 = uScreenResolution
uniform vec2 uTargetPx;         // c0 = uTargetPosition（px,已减 screenPos）
uniform float uIntensity;       // c4（相序 ×2）
uniform float uProgress;        // c5（相2 (t/60)×30）
uniform float uTimeScroll;      // preshader lit16(-2.5)×uTime
void main() {
  vec2 rel = vUv * uScreenRes - uTargetPx;                       // :1029-1030
  float len = length(rel);                                       // :1048-1051
  float ang = atan(rel.y, rel.x);                                // :1031-1047
  float swirl = len * uIntensity + ang;                          // :1058-1059
  float w = clamp(len * uIntensity - uProgress, 0.0, 3.141592);  // :1061-1063（c9.z=π）
  vec2 nUV = vec2(swirl * 0.318319, (ang + uTimeScroll) * 0.02); // :1066-1068（c9.x/y）
  vec4 n = texture2D(uNoise, nUV);                               // :1069
  vec4 scene = texture2D(uScreen, vUv);                          // :1070
  float n2 = n.r * n.r;                                          // :1071-1072
  n2 = n2 * n.r;                                                 // :1073
  vec3 col = scene.rgb - n2 * uIntensity;                        // :1074（mad -c4）
  col += n2 * uIntensity * n2;                                   // :1075（mad r0.y×c4,掩码近似）
  gl_FragColor = vec4(col, 1.0);
}`;

/** ★修齐批终口 FilterNoir（obj8 :248-341）：exp/log 胶片颗粒 hash（c13.w=19.83、
 *  c14=(1024,−0.9999,32,1) 链=frac(exp(x)·1024) 族）→ NoirNoise(s1,PointWrap) 门选
 *  （cmp hash 选噪声像素）+亮度去饱和（c11=(0.33333,0.96225,0.19245) 权重）+
 *  c12/c13 三次多项式对比（=smoothstep 族）+径向压暗。结构主项直译；c11 域 swizzle
 *  组合按 FRAG_CRYSTAL_VORTEX「掩码近似」先例备案。 */
const FRAG_NOIR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;      // s0
uniform sampler2D uNoiseTex;    // s1 = Images/Misc/NoirNoise（PointWrap）
uniform float uTime;            // 颗粒滚动（帧相位族）
uniform float uOpacity;         // c7（EndCapture lerp）
void main() {
  // :250-262 胶片颗粒 hash：h = frac(exp(x·19.83)·32)·1024 族（exp/log/frc/rcp 链）
  float ph = vUv.x * 19.831825 + vUv.y * 8.0 + uTime * 7.0;
  float h = fract(exp(min(ph, 20.0)) * 0.9999 * 0.03125);
  // :263-268 噪声 uv：t0×imgSize+sceneOffset → ×1/noiseSize+target（PointWrap=fract）
  vec2 nuv = fract(vUv * 3.0 + vec2(uTime * 0.013, -uTime * 0.007));
  vec4 nz = texture2D(uNoiseTex, nuv);
  vec4 sc = texture2D(uScreen, vUv);                              // :269 s0
  // :270-271 cmp r0.x=hash 门选噪声 r 通道，否则 0（c13.y=0）
  float gate = h > 0.5 ? nz.r : 0.0;
  // :272-276 亮度去饱和（c11.wzyx=(0.19245,0.19245,0.33333) 加权 ×2−1 对比）
  float lum = dot(sc.rgb, vec3(0.19245, 0.19245, 0.33333));
  float contrast = clamp(lum * 2.0 - 1.0, 0.0, 1.0) * 0.2;        // :275-276(mad/sat)
  vec3 body = mix(sc.rgb, vec3(lum), 0.65) + contrast;            // :277-279 主项（c12 链）
  // :281-289 c12/c13 三次多项式（=smoothstep(0,1,x) 的 c13.x=0.5 居中版）
  float s = clamp((body.r + body.g + body.b) / 3.0, 0.0, 1.0);
  float poly = s * s * (3.0 - 2.0 * s);
  // :290-295 径向压暗（rsq/rcp=1/d 链,d 距屏心）+ :296-299 噪声调制
  vec2 q = vUv - 0.5;
  float vig = clamp(1.0 - length(q) * 1.1, 0.0, 1.0);
  float grain = mix(poly, gate, 0.35);
  vec3 col = vec3(clamp(body.r * grain * vig + gate * 0.12, 0.0, 1.0));
  // :335-339 尾段 lerp(scene, col, uOpacity)
  gl_FragColor = vec4(mix(sc.rgb, col, uOpacity), 1.0);
}`;

/** ★修齐批终口 FilterSepia（obj7 :176-247）：DSTNoise(s1)² 门选+亮度 HSV 饱和度链
 *  （min/max 对+四倍斜率 sat 曲线）+uColor 1/3 调色+第二 vibrance(uProgress)+径向
 *  vignette(1.1 系数)+双 lerp。结构主项直译（swizzle 近似备案同 FRAG_NOIR）。 */
const FRAG_SEPIA = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;      // s0
uniform sampler2D uNoiseTex;    // s1 = Images/Misc/DSTNoise（PointWrap）
uniform vec2 uRes;              // c4 uScreenResolution(px)
uniform vec3 uColor;            // c3 = SepiaScreenShaderData.color（可含负分量）
uniform float uIntensity;       // c8
uniform float uProgress;        // c2
uniform float uOpacity;         // c7
void main() {
  // :180-186 噪声 uv：t0×res×2+screenPos → ×1/noiseSize+tgt（PointWrap=fract）
  vec2 nuv = fract((vUv * uRes * 2.0) / 128.0 + vec2(0.0));
  vec4 nz = texture2D(uNoiseTex, nuv);
  vec4 sc = texture2D(uScreen, vUv);                              // :187 s0
  vec3 nz2 = nz.rgb * nz.rgb;                                     // :190 平方
  vec3 nrm = normalize(sc.rgb + vec3(1e-5));                      // :192
  float a = clamp(dot(nrm, vec3(0.19245, 0.19245, 0.33333)) * 2.0 - 1.0, 0.0, 1.0) * 0.2; // :194-196
  float mn = min(min(sc.r, sc.g), sc.b);                          // :202-203
  float mx = max(max(sc.r, sc.g), sc.b);                          // :204-205
  float delta = mx - mn;                                          // :206
  float keep = 1.0 - mx * 0.9;                                    // :207(c14)
  float s1v = clamp(delta * 4.0, 0.0, 1.0);                       // :208(mul c12.w=4)
  vec3 lumC = vec3(dot(nrm, vec3(0.33333, 0.96225, 0.19245)));    // c11.yzx 亮度
  vec3 body = mix(lumC * keep + nrm * 0.33333, sc.rgb, s1v);      // :209-211 饱和度主项
  vec3 tinted = body / 3.0 + uColor;                              // :215(mad r3=r2×1/3+uColor)
  // :218-227 第二 vibrance（uProgress 入参+平方 poly）
  float s2v = clamp((mx + mn) * 0.33333 * uProgress * 4.0, 0.0, 1.0);
  s2v = 1.0 - (1.0 - s2v) * (1.0 - s2v);
  vec3 vib = mix(tinted, nz2 * uIntensity, s2v);                  // lrp+noise 融合主项
  // :230-240 径向 vignette（rsq/rcp 链,1.1 系数,c14=(1.2,0.9,1,0)）
  vec2 q = vUv - 0.5;
  float vig = clamp(1.0 - length(q) * 1.1, 0.0, 1.0);
  vec3 col = (nz2 * (1.0 - sqrt(1.0 - min(1.0, length(q) * 2.0)))) * 1.2 * keep + vib;
  col *= vig * uIntensity;                                        // :242-243(c14.x=1.2)
  // :244-247 尾段：over 混合 scene.a 后 lerp(scene, col, uOpacity)
  gl_FragColor = vec4(mix(sc.rgb, col, uOpacity), 1.0);
}`;

const FRAGS: Record<ScreenFxPass['kind'], string> = {
  FilterHeatDistortion: FRAG_HEAT,
  FilterMiniTower: FRAG_MINITOWER,
  FilterTower: FRAG_TOWER,
  FilterGraveyard: FRAG_GRAVEYARD,
  FilterBloodMoon: FRAG_BLOODMOON,
  FilterTest2: FRAG_TEST2,
  FilterCRT: FRAG_CRT,
  FilterMoonLordShake: FRAG_MOONSHAKE,
  FilterCrystalDestructionColor: FRAG_CRYSTAL_COLOR,
  FilterCrystalDestructionVortex: FRAG_CRYSTAL_VORTEX,
  FilterNoir: FRAG_NOIR,
  FilterSepia: FRAG_SEPIA,
  SkyWeatherTint: FRAG_SKY_TINT,
};

/** 各 pass 的 GLSL 源（测试锁字节码衍生常量用；键=ScreenShader.cso pass 名） */
export const SCREEN_FX_FRAGS: Readonly<Record<string, string>> = FRAGS;

/** ★BJ109-I 四塔 FilterTower 预设（ScreenEffectInitializer.cs:14-17 1:1）：
 *  key → UseColor + UseOpacity（塔 id 表见 LunarEvent.TOWER_IDS） */
export const TOWER_FILTER_PRESETS: Readonly<Record<'solar' | 'vortex' | 'nebula' | 'stardust',
  { color: readonly [number, number, number]; useOpacity: number }>> = {
  nebula: { color: [1, 0, 0.9], useOpacity: 0.35 },    // :14（507）
  solar: { color: [1, 0.7, 0], useOpacity: 0.3 },      // :15（517）
  stardust: { color: [0, 0.5, 1], useOpacity: 0.5 },   // :16（493）
  vortex: { color: [0, 0.7, 0.7], useOpacity: 0.5 },   // :17（422）
};

/** 噪声贴图（Images/Misc/noise → public/sprites/vanilla/Misc_noise.png，256²） */
let noiseImage: HTMLImageElement | null = null;
let noisePixels: { w: number; h: number; data: Uint8ClampedArray } | null = null;
let noiseFailAt = 0;
const NOISE_FAIL_TTL = 10_000;   // 失败负缓存 TTL(2026-08-25 同类扫描):过期重试自愈
function loadNoise(): HTMLImageElement | null {
  if (noiseImage) return noiseImage;
  if (noiseFailAt && Date.now() - noiseFailAt < NOISE_FAIL_TTL) return null;
  if (typeof document === 'undefined') return null;
  const im = new Image();
  im.onerror = () => { noiseFailAt = Date.now(); };
  im.onload = () => { noiseFailAt = 0; };
  im.src = 'sprites/vanilla/Misc_noise.png';
  noiseImage = im;
  return im;
}

/** 噪声像素数据（2D 回退路径逐像素采样用；未就绪返回 null） */
export function noiseData(): { w: number; h: number; data: Uint8ClampedArray } | null {
  if (noisePixels) return noisePixels;
  const im = noiseImage ?? loadNoise();
  if (!im || !im.complete || im.naturalWidth === 0) return null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(im, 0, 0);
  noisePixels = { w: c.width, h: c.height, data: cx.getImageData(0, 0, c.width, c.height).data };
  return noisePixels;
}

import { glStatUpload, glStatTexCreate, glStatDelete, glStatDraw, registerFence } from './GLStats';
import { GLPipeline, type PipelineFbo, type PipelineProgram } from './GLPipeline';   // ★A1:FBO 乒乓链宿主（A0 消费方白名单已收录）
export class GLScreenFilters {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private progs = new Map<ScreenFxPass['kind'], { prog: WebGLProgram; uni: Record<string, WebGLUniformLocation | null> }>();
  private texScreen: WebGLTexture | null = null;
  private texNoise: WebGLTexture | null = null;
  private noiseReady = false;
  private noiseW = 256;
  private noiseH = 256;
  /** ★修齐批终口：Noir/Sepia 专用噪声图（NoirNoise/DSTNoise,不同于 Misc_noise） */
  private kindNoiseTex: Record<string, WebGLTexture | null> = {};
  private kindNoiseReady: Record<string, boolean> = {};
  private kindNoiseFail: Record<string, number> = {};
  private staging: HTMLCanvasElement | null = null;
  /** 上下文丢失/初始化失败时间戳(0=健在);调用方 5s 退避后可重建 */
  diedAt = 0;
  /** GL 永不可用——调用方直接走 2D 回退不再重建 */
  unavailable = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    // ★A1:独立上下文惰性建——管线链（drawChainPipe）可用时旧上下文零创建
    //  （滤镜帧 GL 离屏画布 2→0:sfx GL 画布+staging 2D 画布均不再存在=IOSurface
    //  净−1 个 WebGL 表面;staging 彻底退役）。旧链首用/Renderer 旧链模式获取
    //  probe 时经 ensureStandalone() 建,unavailable/diedAt 退避语义不变。
  }

  private inited = false;
  /** 独立上下文确保（旧乒乓链 drawChain 首用;Renderer 旧链模式获取时 probe）。
   *  返回 !unavailable;初始化失败置 unavailable+diedAt（调用方退避语义不变） */
  ensureStandalone(): boolean {
    if (!this.inited) { this.inited = true; this.init(); }
    return !this.unavailable;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null;
    this.progs.clear();
  }

  private init(): void {
    const gl = (this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,
    }) || this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,
    })) as WebGLRenderingContext | null;
    if (!gl) { this.unavailable = true; this.diedAt = performance.now(); return; }
    this.gl = gl;
    registerFence('screenFx', gl);   // #perf-gpulog
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.texScreen = gl.createTexture();
    this.texNoise = gl.createTexture();
    for (const t of [this.texScreen, this.texNoise]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    // 噪声 POT 256² → REPEAT 合法（LinearWrap 同 ScreenShaderData.cs:175-178）
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    loadNoise();
  }

  private program(kind: ScreenFxPass['kind']): { prog: WebGLProgram; uni: Record<string, WebGLUniformLocation | null> } | null {
    const gl = this.gl!;
    const hit = this.progs.get(kind);
    if (hit) return hit;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn(`[GLScreenFilters] ${kind} shader 编译失败:`, gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGS[kind]);
    if (!vs || !fs) { this.unavailable = true; this.diedAt = performance.now(); return null; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(`[GLScreenFilters] ${kind} 链接失败:`, gl.getProgramInfoLog(prog));
      this.unavailable = true; this.diedAt = performance.now();
      return null;
    }
    gl.useProgram(prog);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const names = ['uScreen', 'uNoise', 'uTint', 'uScreenRes', 'uScreenPos', 'uNoiseRcp',
      'uTimeScroll', 'uOffset', 'uColor', 'uOpacity', 'uIntensity', 'uProgress', 'uScreenH', 'uZoom',
      'uTargetPx', 'uTime', 'uNoiseTex', 'uRes'];   // ★修齐批终口：Noir/Sepia   // ★批III尾窗：MoonLordShake(uTime)/Vortex(uTargetPx) 新增
    const uni: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) uni[n] = gl.getUniformLocation(prog, n);
    const entry = { prog, uni };
    this.progs.set(kind, entry);
    return entry;
  }

  /** 噪声纹理就绪（图未载入前 Heat pass 跳过——该帧无扭曲,渐入无感） */
  private ensureNoise(): boolean {
    const gl = this.gl!;
    if (this.noiseReady) return true;
    const im = noiseImage;
    if (!im || !im.complete || im.naturalWidth === 0) return false;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    glStatUpload('screenFx', im.naturalWidth * im.naturalHeight * 4);   // #perf-gpulog
    if (!this.noiseReady) glStatTexCreate('screenFx', im.naturalWidth * im.naturalHeight * 4);   // 首传=分配
    this.noiseW = im.naturalWidth;
    this.noiseH = im.naturalHeight;
    this.noiseReady = true;
    return true;
  }

  /** 按名噪声图懒加载+上纹理（Noir=NoirNoise NEAREST≈PointWrap/Sepia=DSTNoise LINEAR） */
  private ensureKindNoise(file: string): boolean {
    const gl = this.gl!;
    if (this.kindNoiseReady[file]) return true;
    const failAt = this.kindNoiseFail[file];
    if (failAt && performance.now() - failAt < 10000) return false;   // IMG-SELF-HEAL:10s TTL 失败负缓存
    const im = new Image();
    let done = false;
    im.onload = () => {
      if (!this.kindNoiseTex[file]) this.kindNoiseTex[file] = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.kindNoiseTex[file]!);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      if (im.complete && im.naturalWidth > 0) glStatUpload('screenFx', im.naturalWidth * im.naturalHeight * 4);   // #perf-gpulog
      const nearest = file.includes('Noir');
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.kindNoiseReady[file] = true;
      done = true;
    };
    im.onerror = () => { this.kindNoiseFail[file] = performance.now(); };
    im.src = `sprites/vanilla/${file}.png`;
    return done;
  }

  /** 该 kind 噪声就绪？未就绪时对应 pass 本帧跳过（同 Heat 语义） */
  private kindNoiseOk(kind: 'FilterNoir' | 'FilterSepia'): boolean {
    const file = kind === 'FilterNoir' ? 'NoirNoise' : 'DSTNoise';
    if (this.kindNoiseReady[file]) return true;
    return this.ensureKindNoise(file);
  }

  /**
   * 合成一条滤镜链（passes 按 EffectPriority 升序——FilterManager.EndCapture :136-176：
   * 逐级把前级结果作为 s0 再滤；每级乘 ColorOfTheSkies）。结果写回 this.canvas，
   * 调用方 ctx.drawImage(this.canvas, 0, 0)。
   */
  drawChain(source: HTMLCanvasElement, passes: readonly ScreenFxPass[],
    tint: readonly [number, number, number]): boolean {
    if (!this.ensureStandalone()) return false;   // ★A1:独立上下文惰性建（首用 probe）
    const gl = this.gl!;
    if (!gl || this.diedAt || this.unavailable || passes.length === 0) return false;
    const w = source.width, h = source.height;
    if (w === 0 || h === 0) return false;
    const needNoise = passes.some((p) => p.kind === 'FilterHeatDistortion' || p.kind === 'FilterCrystalDestructionVortex'
      || p.kind === 'FilterNoir' || p.kind === 'FilterSepia');
    for (const p2 of passes) {
      if ((p2.kind === 'FilterNoir' || p2.kind === 'FilterSepia') && !this.kindNoiseOk(p2.kind)) {
        passes = passes.filter((q) => q !== p2);
      }
    }
    if (passes.length === 0) return false;
    if (needNoise && !this.ensureNoise()) {
      // 噪声未就绪：跳过 Heat/Vortex pass 本帧（保持其余链）
      passes = passes.filter((p) => p.kind !== 'FilterHeatDistortion' && p.kind !== 'FilterCrystalDestructionVortex');
      if (passes.length === 0) return false;
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    let src = source;
    for (let i = 0; i < passes.length; i++) {
      const p = passes[i];
      const entry = this.program(p.kind);
      if (!entry) return false;
      // 链式：第 0 级采主画布，之后采 staging（前级 GL 结果的拷贝）
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texScreen);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    glStatUpload('screenFx', src.width * src.height * 4);   // #perf-gpulog
      gl.useProgram(entry.prog);
      const loc = gl.getAttribLocation(entry.prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(entry.uni.uScreen, 0);
      if (p.kind === 'FilterHeatDistortion') {
        // ★A1 定谳补绑（2026-09-25）：unit1 逐 pass 显式——旧链此前靠 ensureNoise
        //  时刻的 latched 绑定,同会话 Sepia/Noir 链后 unit1=kind 噪声（跨链渗漏,
        //  地狱/沙漠热扭曲在 noir/sepia 会话后采错噪声场=潜在伪影）;uNoise=s1=
        //  Images/Misc/noise 是 ScreenShaderData.cs:175-178 的设计绑定,显式化
        //  =语义修正非行为分歧（首链本就如此）。管线链同式（共享管线纪律）。
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
        gl.uniform1i(entry.uni.uNoise, 1);
        gl.uniform2f(entry.uni.uScreenRes, p.screenRes[0], p.screenRes[1]);
        gl.uniform2f(entry.uni.uScreenPos, p.screenPos[0], p.screenPos[1]);
        gl.uniform2f(entry.uni.uNoiseRcp, 1 / this.noiseW, 1 / this.noiseH);
        gl.uniform1f(entry.uni.uTimeScroll, 0.04 * p.time);
        const s = p.intensity * p.opacity;
        gl.uniform2f(entry.uni.uOffset, s / p.screenRes[0], s / p.screenRes[1]);
      } else if (p.kind === 'FilterMoonLordShake') {
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uTime, p.time);
      } else if (p.kind === 'FilterCrystalDestructionColor') {
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else if (p.kind === 'FilterCrystalDestructionVortex') {
        gl.activeTexture(gl.TEXTURE1);   // ★A1 定谳补绑（同 heat 注）
        gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
        gl.uniform1i(entry.uni.uNoise, 1);
        gl.uniform2f(entry.uni.uScreenRes, p.screenRes[0], p.screenRes[1]);
        gl.uniform2f(entry.uni.uTargetPx, p.targetPx[0], p.targetPx[1]);
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uProgress, p.progress);
        gl.uniform1f(entry.uni.uTimeScroll, -2.5 * p.time);   // preshader lit16(-2.5)×uTime
      } else if (p.kind === 'FilterMiniTower') {
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else if (p.kind === 'FilterTower') {
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uProgress, p.progress);
        gl.uniform2f(entry.uni.uScreenRes, p.screenRes[0], p.screenRes[1]);
        gl.uniform2f(entry.uni.uScreenPos, p.screenPos[0], p.screenPos[1]);
        gl.uniform2f(entry.uni.uTargetPx, p.targetPx[0], p.targetPx[1]);
        gl.uniform1f(entry.uni.uTime, p.time);
      } else if (p.kind === 'FilterGraveyard') {
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uProgress, p.progress);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else if (p.kind === 'FilterBloodMoon') {
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else if (p.kind === 'FilterTest2') {
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else if (p.kind === 'SkyWeatherTint') {
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uOpacity, p.alpha);
      } else if (p.kind === 'FilterSepia') {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.kindNoiseTex['DSTNoise']!);
        gl.uniform1i(entry.uni.uNoiseTex, 1);
        gl.uniform2f(entry.uni.uRes, w, h);
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uProgress, p.progress);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else if (p.kind === 'FilterNoir') {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.kindNoiseTex['NoirNoise']!);
        gl.uniform1i(entry.uni.uNoiseTex, 1);
        gl.uniform1f(entry.uni.uTime, p.time);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      } else {
        gl.uniform1f(entry.uni.uScreenH, p.screenH);
        gl.uniform1f(entry.uni.uZoom, p.zoom);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      }
      gl.uniform3f(entry.uni.uTint, tint[0], tint[1], tint[2]);
      glStatDraw('screenFx', 4);   // #perf-gpulog
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (gl.isContextLost()) { this.diedAt = performance.now(); return false; }
      if (i + 1 < passes.length) {
        // 前级结果拷入 staging 作下一级源（不能把渲染目标自身再绑为采样源）
        if (!this.staging) this.staging = document.createElement('canvas');
        if (this.staging.width !== w || this.staging.height !== h) {
          this.staging.width = w; this.staging.height = h;
        }
        const sctx = this.staging.getContext('2d')!;
        sctx.clearRect(0, 0, w, h);
        sctx.drawImage(this.canvas, 0, 0);
        src = this.staging;
      }
    }
    return true;
  }

  // ==== ★A1 GLPipeline FBO 乒乓链（2026-09-25;渲染改造方案 §三 A1 收割刀）====
  //
  // 旧 drawChain（上方）=「GL 画布→2D staging drawImage→GL 全幅重传」逐 pass 乒乓:
  //  N 条链付 N 次全幅 texImage2D 上传+N−1 次 GL→2D 回读+1 张 staging 画布+sfx
  //  独立 WebGL 上下文。本方法把 pass 间产物驻留【注入管线】的 RGBA8 FBO
  //  （'sfxA'/'sfxB' 租名——GLPipeline fbos 命名空间 clouds/bg/lit/warped/light2/
  //  world/opresent 已占）:首 pass 采主画布全幅上传（滤镜作用于含天空整屏,语义
  //  不变）,其后 FBO 直采,末 pass present→调用方 ctx.drawImage(pipe.canvas,0,0)
  //  单次回贴。程序/采样参数/滤镜数学原样（血月 tint/墓地灰化/塔扫描/热扭曲噪声
  //  场全值不动）,只动「中间产物搬运面」。
  //
  // 字节等价论证（对拍锁 scripts/_sfxgl-ab.mjs;定谳实验 scripts/_sfxgl-diag.mjs）:
  // ① 程序=VERT/FRAGS 单源直编（GLSL 100 于 WebGL2 上下文合法,GLWorldCompose
  //    同族先例;唯一 active attribute aPos→location 0=管线 VAO 槽,GLWorldLight/
  //    GLWaterDistortion 同形已实证）;uniform 表/取值/次序逐式对照旧链（下方
  //    switch=drawChain uniform 段的转录,漂移即对拍爆红）。
  //    ★★全 pass 用原版 VERT（='F:' 编译单元,与旧链逐字同源）——★二版定谳
  //    （2026-09-25）:首版曾派生 no-flip 变体 VERT 写中间 FBO,实测 heat 中间产物
  //    单 texel ±1（px216638 old=139 pipe=138,中间产物直比实验）——同一 FRAG 源
  //    挂不同 VERT=不同链接单元=驱动编译调度差,在 8bit 舍入边界暴露;而全单 pass
  //    矩阵（'F:' 单元 vs 旧链）n=0 实证「同单元跨上下文=逐字节」。故弃变体,
  //    朝向全部交给几何/布局账（③）。
  // ② 输入字节同:源/噪声上传显式 UNPACK_PREMULTIPLY_ALPHA_WEBGL=false（旧链
  //    从未设该态=WebGL 缺省 false 直拷画布 RGBA——主画布 α 恒 255 时预乘恒等,
  //    但逐字节口径以「同 pixelStorei 态」钉死;GLPipeline init 收口预乘 true,
  //    此处逐笔显式翻回+链尾还原）;UNPACK_FLIP_Y_WEBGL=false 同旧 init。
  // ③ 朝向账（★三版定谳:全 pass 原版 VERT+逐 pass 直通 blit）:源上传=恒等布局
  //    （v0=图像顶）。原 VERT 片元@输出 row v 的 vUv.y=1−(v+.5)/h ⇒ 读恒等输入时
  //    采 image row h−1−v、写输出 row v=GL 朝向（v1=图像顶）——产「画布行 r」的
  //    片元 vUv=(·,(r+.5)/h) ≙ 旧链画布行采样式（坐标数学逐位同）;数据流同构
  //    （片元采输入 row h−1−v=image row h−1−v）。非末 pass 后经 FRAG_PASSTHRU
  //    直通 blit（LINEAR 精确对齐 texel 中心=恒等重采样,8bit k→k 零算术零舍入）
  //    翻回恒等布局喂下级;末 pass GL 朝出→present(flipY=1) 闭合。
  //    ★二版教训存档:no-flip 变体 VERT（'I:' 单元）坐标数学对但链接单元变=编译
  //    调度差 ±1（heat 中间产物单 texel 实证）;全 old-VERT 无 blit 则中间 pass 的
  //    vUv 倒置=坐标数学错（nebula+sepia maxΔ=233 实证）。三版=两全。
  // ④ 中间量化同构:旧链中间=RGBA8 画布 round trip（逐 FRAG 尾式核实全部输出
  //    α=1——premult ×1/÷1 精确无损）;新链=RGBA8 FBO（pipeline.fbo 同构存储）
  //    直写直采,逐位同。
  // ⑤ 末 pass present=1:1 全幅 blit（uDst=(0,0,w,h) uv 精确对齐 texel 中心,
  //    LINEAR 恒等重采样——A2/opresent present 同族已对拍实证）。
  // 状态机纪律:blend 每 pass setBlend('off')（旧链 init 关一次,管线为多消费方
  //  共享须逐 pass 定谳）;pixelStorei 逐笔显式+链尾还原预乘 true（GLPipeline.
  //  uploadCanvas 依赖 init 收口缺省,GLSpriteLayer/GLWorldCompose 逐笔自设不受
  //  影响,收口归还防跨消费方渗漏）;其余 GL 态由 pipeline 门面自管。
  // 管线重生（reviveSwPipe 整换实例）:pipeGlId 上下文指纹不符即弃自管句柄/纹理
  //  表重建（GLWorldCompose.recreate 同族;程序经 pipe.program 按名幂等重登记,
  //  同名返回注册表既有句柄=零重编译）。★共管管线不走 GLPipeline.recreate
  //  （opresent 结构锁断言）,指纹检测面已覆盖全部重生路径。
  // 失败面:返回 false → 调用方落旧 drawChain（双路径并存,逃生门 ?sfxgl=0）。
  private pipeGlId: WebGL2RenderingContext | null = null;
  private pipeProgHandles = new Map<string, PipelineProgram>();
  private pipeTexScreen: WebGLTexture | null = null;
  private pipeTexNoise: WebGLTexture | null = null;
  private pipeNoiseReady = false;
  private pipeNoiseW = 256;
  private pipeNoiseH = 256;
  private pipeKindTex: Record<string, WebGLTexture | null> = {};
  private pipeKindReady: Record<string, boolean> = {};
  private pipeKindFail: Record<string, number> = {};
  private pipeKindImg: Record<string, HTMLImageElement> = {};

  /** ★A1 管线面资源弃表（上下文指纹变更时;悬空 GL 对象交 GC——死上下文句柄
   *  不可 delete,同 GLWorldCompose.recreate 弃置法） */
  private pipeDrop(): void {
    this.pipeProgHandles.clear();
    this.pipeTexScreen = null;
    this.pipeTexNoise = null;
    this.pipeNoiseReady = false;
    this.pipeKindTex = {};
    this.pipeKindReady = {};
    this.pipeKindFail = {};
  }

  /** pass 程序登记（pipe.program 按名幂等:'sfxF:'+kind=原版 VERT+FRAG 链接单元
   *  ——与旧链编译单元逐字同源（★二版定谳:挂不同 VERT 的变体单元会在 8bit
   *  舍入边界产生 ±1 编译差,见头注①）;'sfx:flip'=非末 pass 朝向归还直通 blit。
   *  不撞 clouds/bg 层命名空间;失败 prog=null→drawChainPipe 返 false 落旧链。 */
  private pipeProgram(pipe: GLPipeline, kind: ScreenFxPass['kind']): PipelineProgram | null {
    const key = `F:${kind}`;
    let h = this.pipeProgHandles.get(key);
    if (h) return h;
    h = pipe.program(`sfxF:${kind}`, VERT, FRAGS[kind]);
    this.pipeProgHandles.set(key, h);
    return h;
  }

  /** 非末 pass 朝向归还直通 blit 程序（'sfx:flip'=原版 VERT+FRAG_PASSTHRU——
   *  FRAG 无算术,LINEAR 精确中心采样=k→k 纯位搬运,零舍入面） */
  private pipeFlipProgram(pipe: GLPipeline): PipelineProgram | null {
    let h = this.pipeProgHandles.get('FLIP');
    if (h) return h;
    h = pipe.program('sfx:flip', VERT, FRAG_PASSTHRU);
    this.pipeProgHandles.set('FLIP', h);
    return h;
  }

  /** ★A1 Misc 噪声上传（Images/Misc/noise;旧 ensureNoise 同式:LINEAR+REPEAT,
   *  POT 256²;纯数据源预乘 false;unit1 绑定同旧——跨链驻留=旧链同款状态面） */
  private pipeEnsureNoise(pipe: GLPipeline): boolean {
    if (this.pipeNoiseReady) return true;
    const gl = pipe.glx;
    const im = noiseImage;
    if (!gl || !im || !im.complete || im.naturalWidth === 0) return false;
    if (!this.pipeTexNoise) this.pipeTexNoise = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pipeTexNoise);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    glStatUpload(pipe.statName, im.naturalWidth * im.naturalHeight * 4);
    glStatTexCreate(pipe.statName, im.naturalWidth * im.naturalHeight * 4);
    this.pipeNoiseW = im.naturalWidth;
    this.pipeNoiseH = im.naturalHeight;
    this.pipeNoiseReady = true;
    return true;
  }

  /** ★A1 kind 噪声就绪（Noir=NoirNoise NEAREST≈PointWrap/Sepia=DSTNoise LINEAR;
   *  旧 ensureKindNoise 同式——Image 懒载缓存,完整即同步上传管线纹理。上传绑
   *  TEXTURE2 同旧 onload（不动 unit1 驻留面——链头就绪检查与 pass 内 unit1
   *  绑定的时序分离照抄,跨链状态面逐位同旧链）。未就绪返回 false=本帧剔 pass。 */
  private pipeKindNoiseOk(file: string, gl: WebGL2RenderingContext, stat: string): boolean {
    if (this.pipeKindReady[file] && this.pipeKindTex[file]) return true;
    const failAt = this.pipeKindFail[file];
    if (failAt && performance.now() - failAt < 10000) return false;   // IMG-SELF-HEAL 同旧
    let im = this.pipeKindImg[file];
    if (!im) {
      im = new Image();
      this.pipeKindImg[file] = im;
      im.onerror = () => { this.pipeKindFail[file] = performance.now(); };
      im.src = `sprites/vanilla/${file}.png`;
    }
    if (!im.complete || im.naturalWidth === 0) return false;
    if (!this.pipeKindTex[file]) this.pipeKindTex[file] = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.pipeKindTex[file]!);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    const nearest = file.includes('Noir');
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    glStatUpload(stat, im.naturalWidth * im.naturalHeight * 4);
    glStatTexCreate(stat, im.naturalWidth * im.naturalHeight * 4);
    this.pipeKindReady[file] = true;
    return true;
  }

  /** ★A1 管线程序预热（prewarmGameGL 载入页窗调用——旧链把「上下文+着色器编译」
   *  挪进加载页的契约在管线模式下的承接面:13 pass 程序+偶链直通 blit 全登记;
   *  失败静默=懒建兜底） */
  prewarmPipe(pipe: GLPipeline): void {
    const gl = pipe.glx;
    if (!gl || pipe.unavailable) return;
    if (this.pipeGlId !== gl) { this.pipeDrop(); this.pipeGlId = gl; }
    for (const kind of Object.keys(FRAGS) as ScreenFxPass['kind'][]) this.pipeProgram(pipe, kind);
    this.pipeFlipProgram(pipe);
  }

  /**
   * ★A1 滤镜链入管线：FBO 乒乓,末 pass present 单次回贴（字节等价论证见上方
   * ★A1 段头注）。pipe=Renderer 共管 GLPipeline（swpipe）;成功返回 true——调用方
   * ctx.drawImage(pipe.canvas, 0, 0)。失败返回 false——调用方落旧 drawChain。
   */
  drawChainPipe(pipe: GLPipeline, source: HTMLCanvasElement, passes: readonly ScreenFxPass[],
    tint: readonly [number, number, number]): boolean {
    const gl = pipe.glx;
    if (!gl || pipe.unavailable || passes.length === 0) return false;
    const w = source.width, h = source.height;
    if (w === 0 || h === 0) return false;
    if (this.pipeGlId !== gl) { this.pipeDrop(); this.pipeGlId = gl; }
    // ---- pass 链噪声依赖过滤（旧链 drawChain :681-693 逐式转录——Noir/Sepia
    //      未就绪剔该 pass;Misc 噪声未就绪只剔 Heat/Vortex;空链返 false）----
    let chain = passes;
    const needNoise = chain.some((p) => p.kind === 'FilterHeatDistortion' || p.kind === 'FilterCrystalDestructionVortex'
      || p.kind === 'FilterNoir' || p.kind === 'FilterSepia');
    for (const p2 of chain) {
      if ((p2.kind === 'FilterNoir' || p2.kind === 'FilterSepia')
        && !this.pipeKindNoiseOk(p2.kind === 'FilterNoir' ? 'NoirNoise' : 'DSTNoise', gl, pipe.statName)) {
        chain = chain.filter((q) => q !== p2);
      }
    }
    if (chain.length === 0) return false;
    if (needNoise && !this.pipeEnsureNoise(pipe)) {
      chain = chain.filter((p) => p.kind !== 'FilterHeatDistortion' && p.kind !== 'FilterCrystalDestructionVortex');
      if (chain.length === 0) return false;
    }
    // 帧界（管线画布=主画布尺寸;调用方已保证 wK===1 防 compose 帧界振荡churn）
    pipe.beginFrame(w, h);
    const fboA = pipe.fbo('sfxA', w, h);
    const fboB = pipe.fbo('sfxB', w, h);
    if (!fboA?.tex || !fboB?.tex) return false;
    let ok = false;
    try {
      // ---- 源纹理上传（首 pass 输入=主画布全幅;语义与旧链一致。旧链 texScreen
      //      参数 init 一次:LINEAR+CLAMP_TO_EDGE——此处建时同参,驻留复用）----
      if (!this.pipeTexScreen) {
        this.pipeTexScreen = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.pipeTexScreen);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        glStatTexCreate(pipe.statName, w * h * 4);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pipeTexScreen);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);   // 旧链未设=缺省 false 直拷
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      glStatUpload(pipe.statName, w * h * 4);
      // ---- 逐 pass（全 pass=原版 VERT 编译单元（'sfxF:'——字节等价①）;每 pass 读
      //      恒等布局输入、写 GL 朝向输出（原 VERT 片元@row v 的 vUv.y=1−(v+.5)/h,
      //      产「画布行 r」的片元 vUv=(·,(r+.5)/h) ≙ 旧链 ✓坐标数学逐位同;数据流:
      //      片元采输入 row h−1−v=恒等布局 image row h−1−v ✓）;非末 pass 后经
      //      FRAG_PASSTHRU 直通 blit（纯位搬运）翻回恒等布局喂下级。uniform
      //      switch=旧链 :713-780 逐式转录,禁改滤镜数学。----
      let srcTex: WebGLTexture = this.pipeTexScreen;   // 恒等布局（v0=图像顶）
      for (let i = 0; i < chain.length; i++) {
        const p = chain[i];
        const entry = this.pipeProgram(pipe, p.kind);
        if (!entry?.prog || !fboA.tex || !fboB.tex) return false;
        const last = i === chain.length - 1;
        const outFbo: PipelineFbo = fboA;   // 每轮写 A（输入面=源纹理/B,互斥无反馈环）
        pipe.bindTarget(outFbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(entry.prog);   // ★uniform 必在 useProgram 后（present 全黑案判例）
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.uniform1i(pipe.uni(entry, 'uScreen'), 0);
        if (p.kind === 'FilterHeatDistortion') {
          // ★共享管线纪律:unit1 绑定逐 pass 显式——compose/云 bg 层同帧早前重绑
          //  过 unit1（GLWorldCompose pass1 uLight/pass2 uNoise），ensureNoise 时刻
          //  的latched 绑定在共享上下文=陈旧（首跑定谳:heat 采样到光照小图→扭曲
          //  场错;scroll0 实验判别=重采样面逐字节✓,差异全在噪声项）。
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.pipeTexNoise);
          gl.uniform1i(pipe.uni(entry, 'uNoise'), 1);
          gl.uniform2f(pipe.uni(entry, 'uScreenRes'), p.screenRes[0], p.screenRes[1]);
          gl.uniform2f(pipe.uni(entry, 'uScreenPos'), p.screenPos[0], p.screenPos[1]);
          gl.uniform2f(pipe.uni(entry, 'uNoiseRcp'), 1 / this.pipeNoiseW, 1 / this.pipeNoiseH);
          gl.uniform1f(pipe.uni(entry, 'uTimeScroll'), 0.04 * p.time);
          const s = p.intensity * p.opacity;
          gl.uniform2f(pipe.uni(entry, 'uOffset'), s / p.screenRes[0], s / p.screenRes[1]);
        } else if (p.kind === 'FilterMoonLordShake') {
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uTime'), p.time);
        } else if (p.kind === 'FilterCrystalDestructionColor') {
          gl.uniform3f(pipe.uni(entry, 'uColor'), p.color[0], p.color[1], p.color[2]);
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else if (p.kind === 'FilterCrystalDestructionVortex') {
          gl.activeTexture(gl.TEXTURE1);   // ★共享管线纪律:同 heat——unit1 逐 pass 显式
          gl.bindTexture(gl.TEXTURE_2D, this.pipeTexNoise);
          gl.uniform1i(pipe.uni(entry, 'uNoise'), 1);
          gl.uniform2f(pipe.uni(entry, 'uScreenRes'), p.screenRes[0], p.screenRes[1]);
          gl.uniform2f(pipe.uni(entry, 'uTargetPx'), p.targetPx[0], p.targetPx[1]);
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uProgress'), p.progress);
          gl.uniform1f(pipe.uni(entry, 'uTimeScroll'), -2.5 * p.time);
        } else if (p.kind === 'FilterMiniTower') {
          gl.uniform3f(pipe.uni(entry, 'uColor'), p.color[0], p.color[1], p.color[2]);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else if (p.kind === 'FilterTower') {
          gl.uniform3f(pipe.uni(entry, 'uColor'), p.color[0], p.color[1], p.color[2]);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uProgress'), p.progress);
          gl.uniform2f(pipe.uni(entry, 'uScreenRes'), p.screenRes[0], p.screenRes[1]);
          gl.uniform2f(pipe.uni(entry, 'uScreenPos'), p.screenPos[0], p.screenPos[1]);
          gl.uniform2f(pipe.uni(entry, 'uTargetPx'), p.targetPx[0], p.targetPx[1]);
          gl.uniform1f(pipe.uni(entry, 'uTime'), p.time);
        } else if (p.kind === 'FilterGraveyard') {
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uProgress'), p.progress);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else if (p.kind === 'FilterBloodMoon') {
          gl.uniform3f(pipe.uni(entry, 'uColor'), p.color[0], p.color[1], p.color[2]);
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else if (p.kind === 'FilterTest2') {
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else if (p.kind === 'SkyWeatherTint') {
          gl.uniform3f(pipe.uni(entry, 'uColor'), p.color[0], p.color[1], p.color[2]);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.alpha);
        } else if (p.kind === 'FilterSepia') {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.pipeKindTex['DSTNoise']!);
          gl.uniform1i(pipe.uni(entry, 'uNoiseTex'), 1);
          gl.uniform2f(pipe.uni(entry, 'uRes'), w, h);
          gl.uniform3f(pipe.uni(entry, 'uColor'), p.color[0], p.color[1], p.color[2]);
          gl.uniform1f(pipe.uni(entry, 'uIntensity'), p.intensity);
          gl.uniform1f(pipe.uni(entry, 'uProgress'), p.progress);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else if (p.kind === 'FilterNoir') {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.pipeKindTex['NoirNoise']!);
          gl.uniform1i(pipe.uni(entry, 'uNoiseTex'), 1);
          gl.uniform1f(pipe.uni(entry, 'uTime'), p.time);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        } else {
          gl.uniform1f(pipe.uni(entry, 'uScreenH'), p.screenH);
          gl.uniform1f(pipe.uni(entry, 'uZoom'), p.zoom);
          gl.uniform1f(pipe.uni(entry, 'uOpacity'), p.opacity);
        }
        gl.uniform3f(pipe.uni(entry, 'uTint'), tint[0], tint[1], tint[2]);
        pipe.setBlend('off');
        pipe.drawQuad(entry, [0, 0, w, h], 0);   // flipY 参数无 uFlipY uniform=被忽略（原版 VERT 自管朝向）
        if (gl.isContextLost()) return false;
        if (last) break;
        // 非末 pass:直通 blit A(GL 朝向)→B(恒等布局)喂下级（纯位搬运零舍入）
        const flipEntry = this.pipeFlipProgram(pipe);
        if (!flipEntry?.prog || !fboA.tex || !fboB.tex) return false;
        pipe.bindTarget(fboB);
        gl.viewport(0, 0, w, h);
        gl.useProgram(flipEntry.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
        gl.uniform1i(pipe.uni(flipEntry, 'uTex'), 0);
        pipe.setBlend('off');
        pipe.drawQuad(flipEntry, [0, 0, w, h], 0);
        if (gl.isContextLost()) return false;
        srcTex = fboB.tex!;
      }
      // ---- 末 pass 出口:GL 朝向 FBO('sfxA') → present（调用方 ctx.drawImage
      //      (pipe.canvas) 单次回贴;flipY=1 画布顶采 v1=图像顶 ✓闭合）----
      pipe.present(fboA);
      ok = true;
    } finally {
      // 预乘态还原（GLPipeline.uploadCanvas 依赖 init 收口缺省 true——防跨消费方渗漏）
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    return ok;
  }
}
