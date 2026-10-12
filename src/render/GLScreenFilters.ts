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
    screenRes: [number, number]; screenPos: [number, number];
    /** ★BJ346 勘误：塔心−(0,10)【世界】px（ScreenShaderData.Apply uTargetPosition 与
     *  uScreenPosition 同域；旧屏幕系致 rel 场被相机坐标污染） */
    targetPx: [number, number];
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
  | { kind: 'SkyWeatherTint'; color: readonly [number, number, number]; alpha: number }
  /** mod 全屏后处理 pass(2026-10-12;hooks.collectModScreenFx 产位——tML
   *  FilterManager.EndCapture MonoMod 前缀同位,插链最前=先于原版滤镜)。
   *  exec 自管子管线(自有程序/FBO),出口契约=写 outFbo(fboA,GL 朝向,同滤镜
   *  pass——直通 blit/present 据此闭合);uniform 侧不声明 uTint=自然豁免链乘
   *  (原版 mod 所见为未乘天色场景,FilterManager.cs:150-210 反编译定谳)。 */
  | { kind: 'ModScreenFx'; exec: ModScreenFxChainPass['exec'] };

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

/** ★BJ109-I FilterTower（obj9 :342-412，SceneShader.cso 反汇编直读）+ ★BJ346 勘误重对
 *  （2026-09-25 用户实报星云柱满屏实心洋红——preshader 按「dst=末位操作数」完整破译后
 *  五处偏离字节码，全部按 obj9 直读修正）：
 *  ① rel 场坐标系：uTargetPosition=塔心【世界】px（ScreenShaderData.Apply 与 uScreenPosition
 *     同减 offScreenRange(200)——差量恒世界系；旧组装端传屏幕系致 rel 被相机坐标污染，
 *     涡旋中心甩出屏外、tapC 采到屏幕边缘恒色）→ 组装端已改传世界系，本 frag 恒按世界系。
 *  ② 波前半径：preshader c0=1000·uProgress+180（lit16/17 直读），旧式 len−uProgress 错。
 *  ③ 相位：preshader c1=1−uProgress、c2=−5·uTime → X=0.2·(1−p)·len−5·t，经 frac(X/2π+0.5)
 *     ·2π−π 范围约简（≈sin(X)，保留约简保 f32 精度同相）；旧近似 fract(len·0.2+t·0.045)
 *     波长 6.28×过密+时向反。
 *  ④ hi 斜率：preshader c4=1−uColor（ps.add_s[3] lit18(1),−uColor 直读）；旧 (1−uColor)·2−uColor 错。
 *  ⑤ cmp 分支真实存在：sel=r3.w=k/2（k=V+mn−1），sel≥0→hi、<0→lo=sum·uColor（暗像素推暗
 *     塔色）——旧「恒走 hi 支」误判使暗像素被推到过饱和洋红（GL 输出钳制后≈实心洋红），
 *     为满屏洋红主因。 */
const FRAG_TOWER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScreen;      // s0
uniform vec3 uColor;            // c5 = UseColor（ScreenEffectInitializer.cs:14-17 分塔）
uniform float uOpacity;         // c9 = UseOpacity×Filter.Opacity
uniform float uIntensity;       // c10 = UseIntensity（塔盾态）
uniform float uProgress;        // C# UseProgress（0..1；preshader 折算波前/波长）
uniform vec2 uScreenRes;        // c6
uniform vec2 uScreenPos;        // c7（屏幕左上世界px）
uniform vec2 uTargetPx;         // c8 = 塔心−(0,10) 世界px（★BJ346 ①）
uniform float uTime;
void main() {
  vec2 world = vUv * uScreenRes + uScreenPos;                     // :347-348
  vec2 rel = world - uTargetPx;                                   // :349
  float len = length(rel * vec2(1.5, 1.0));                       // :350-356（c11=(1.5,1,…)）
  vec2 dir = rel / max(len, 1e-4);                                // :357
  float wavefront = 180.0 + 1000.0 * uProgress;                   // preshader c0（★BJ346 ②）
  // :358-363 rcp(-（len-c0))：分母带号（环外 |50/(c0−len)| 随 len 衰减,近环 →∞ 被 min 5 截）。
  //  ★零除哨=保号（max(denom,1e-4) 会把负分母翻正=远场 amp 恒 5=全屏浪环,本刀曾犯,探针 12 分离）
  float denom = wavefront - len;
  if (abs(denom) < 1e-4) denom = 1e-4 * (denom >= 0.0 ? 1.0 : -1.0);
  float amp = min(abs(50.0 / denom), 5.0) * uIntensity;
  float ph = fract((0.2 * (1.0 - uProgress) * len - 5.0 * uTime) * 0.15915494 + 0.5) // :364-370+371
    * 6.2831853 - 3.1415927;                                      // （c12.z=1/2π,c12.w=0.5;c1/c2 见头注③）
  float r2 = sin(ph) * amp + len;                                 // :371
  vec2 duv = (dir * r2 + uTargetPx - uScreenPos) / uScreenRes;    // :372-377
  vec4 sA = texture2D(uScreen, duv);                              // :378 tapA=全失真位
  vec4 sB = texture2D(uScreen, vUv + 2.25 * (duv - vUv));         // :379-380 tapB（c13.z=2.25）
  vec4 sC = texture2D(uScreen, vUv + 3.5 * (duv - vUv));          // :381-382 tapC（c13.w=3.5）
  float V = max(max(sC.r, sC.g), sC.b);                           // :384-386
  float mn = min(min(sC.r, sC.g), sC.b);                          // :387-389
  float sum = V + mn;                                             // :390
  float k = sum - 1.0;                                            // :391（c11.y=1）
  vec3 hi = uColor + k * (vec3(1.0) - uColor);                    // :392-395（c4=1−uColor,★BJ346 ④）
  vec3 lo = sum * uColor;                                         // :396（r4）
  vec3 tgt = (k * 0.5 >= 0.0) ? hi : lo;                          // :397 cmp r3.w=k/2（★BJ346 ⑤）
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

/** ★BJ346 FilterTower 盾态驱动（Main.cs:24564/24573/24581 三支 1:1）：
 *  盾上 ai3∈(0,30] 重塑闪光 num319=1−ai3/30 → intensity=1+num319/progress=0；
 *  盾破 ai3>0 破裂冲击 num320=ai3/120 → intensity=min(5,15·num320)+1/progress=num320；
 *  盾破 ai3==0（破裂演出毕）→ intensity=0/progress=0（涡旋停，染色仍在）。
 *  旧实现缺第三支（破盾演出后永久 intensity=1）。 */
export function towerFilterDrive(shieldUp: boolean, ai3: number): { intensity: number; progress: number } {
  if (!shieldUp && ai3 > 0) {
    const num320 = Math.min(1, ai3 / 120);
    return { intensity: Math.min(5, 15 * num320) + 1, progress: ai3 / 120 };
  }
  if (!shieldUp) return { intensity: 0, progress: 0 };
  const num319 = ai3 > 0 && ai3 <= 30 ? 1 - ai3 / 30 : 0;
  return { intensity: 1 + num319, progress: 0 };
}

/** ★BJ346 FilterTower 波前半径（preshader c0 = 1000·uProgress + 180，lit16/lit17 直读）。
 *  旧实现把 uProgress 当半径直接用（波前恒 0..1px=静止）。 */
export function towerWavefront(progress: number): number {
  return 180 + 1000 * progress;
}

const fract = (x: number) => x - Math.floor(x);

/** ★BJ346 FilterTower 相位角（obj9 :364-371+preshader c1=1−uProgress、c2=−5·uTime）：
 *  X = 0.2·(1−uProgress)·len − 5·uTime；字节码经 frac(X/2π+0.5)·2π−π 范围约简后 sincos
 *  ——数学上 ≡ sin(X)（约简保 f32 大参数精度，GLSL 端保留同款约简）。 */
export function towerPhaseAngle(len: number, progress: number, time: number): number {
  return Math.sin(fract((0.2 * (1 - progress) * len - 5 * time) * 0.15915494 + 0.5) * 6.2831853 - 3.1415927);
}

/** ★BJ346 FilterTower 色推核（obj9 :390-406 直译）：V+min 亮度度量 sum=V+mn、
 *  k=sum−1；cmp sel=k/2：k≥0 → hi=uColor+k·(1−uColor)（preshader c4=1−uColor）、
 *  k<0 → lo=sum·uColor（暗像素推暗塔色）；lerp(sC.rgb, tgt·a, uOpacity)。
 *  旧实现：恒走 hi 且斜率误用 (1−uColor)·2−uColor → 暗像素被推到过饱和洋红
 *  （GL 输出钳制后≈实心洋红）=满屏洋红主因。 */
export function towerFilterColorPush(
  s: { r: number; g: number; b: number; a: number },
  uColor: readonly [number, number, number],
  uOpacity: number,
): [number, number, number] {
  const V = Math.max(s.r, s.g, s.b);
  const mn = Math.min(s.r, s.g, s.b);
  const sum = V + mn;
  const k = sum - 1;
  const hi = [uColor[0] + k * (1 - uColor[0]), uColor[1] + k * (1 - uColor[1]), uColor[2] + k * (1 - uColor[2])];
  const lo = [sum * uColor[0], sum * uColor[1], sum * uColor[2]];
  const tgt = k * 0.5 >= 0 ? hi : lo;
  return [
    s.r + uOpacity * (tgt[0] * s.a - s.r),
    s.g + uOpacity * (tgt[1] * s.a - s.g),
    s.b + uOpacity * (tgt[2] * s.a - s.b),
  ];
}

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
import type { ModScreenFxChainPass } from '../mods/hooks';   // mod 全屏后处理 pass 载体(纯 type——零运行时环)
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
  /** drawChainPipe（非 Stack 变体）链源槽：每帧 texImage2D 全量重传（A1 原语义,
   *  ★K1-2b 起 Stack 变体不再借本槽——sky 腿改专用持久槽 pipeTexStackSky） */
  private pipeTexScreen: WebGLTexture | null = null;
  private pipeTexScreenW = 0;
  private pipeTexScreenH = 0;
  // ★持久化 treatment（2026-10-04,exit trace texImage2D top1 的可达路径补刀——
  //  K1-2 Stack 档同款）:尺寸账+同尺寸帧 texSubImage2D 原位更新（免 realloc/orphan
  //  churn）;尺寸变/首用/pipeDrop 后=texImage2D 全量重分配（字节逐位同）。
  /** ★K1-2b（2026-10-04）：Stack 变体两腿持久上传槽（persist 槽范式=pipeTexHud
   *  判例扩展）。sky 腿=专用新槽（不与 drawChainPipe 的 pipeTexScreen 共率,不撞
   *  sfxA/sfxB FBO 纹理与 hud 槽）;hud 腿=原 pipeTexHud 判例槽续用。同参
   *  LINEAR+CLAMP_TO_EDGE,按视口尺寸惰性分配+尺寸账（W/H）:首用/尺寸变化/
   *  pipeDrop 槽重建 → texImage2D 全量重分配（=旧路径逐字面）;尺寸不变帧 →
   *  texSubImage2D 原位更新（同源画布/同 pixelStorei 态=纹理字节逐位同,省驱动端
   *  texImage2D realloc churn——exit trace texImage2D 主线程自耗 top1 的 K1-2 收益面）。
   *  失效面:pipeDrop（上下文指纹变更）齐清两槽+尺寸账;GLStats 双口径:分配算驻留
   *  （texCreate 仅 !tex 分支）、逐帧刷新只算带宽（upload 两支同记,worldLight/water
   *  判例同款——t1036 教训:对既有纹理重传勿走 texCreate 入口）。 */
  private pipeTexStackSky: WebGLTexture | null = null;
  private pipeTexStackSkyW = 0;
  private pipeTexStackSkyH = 0;
  private pipeTexHud: WebGLTexture | null = null;
  private pipeTexHudW = 0;
  private pipeTexHudH = 0;
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
    // ★K1-2b:两腿持久槽+尺寸账齐清（pipeTexHud 判例面——清后首用走 texImage2D 重建）
    this.pipeTexStackSky = null;
    this.pipeTexStackSkyW = 0;
    this.pipeTexStackSkyH = 0;
    this.pipeTexHud = null;
    this.pipeTexHudW = 0;
    this.pipeTexHudH = 0;
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
    // ★K1-2:抽取共用（drawChainPipe/drawChainPipeStack 单源——防双路漂移）
    const chain = this.pipePrepareChain(pipe, gl, passes);
    if (!chain) return false;
    // 帧界（管线画布=主画布尺寸;调用方已保证 wK===1 防 compose 帧界振荡churn）
    pipe.beginFrame(w, h);
    const fboA = pipe.fbo('sfxA', w, h);
    const fboB = pipe.fbo('sfxB', w, h);
    if (!fboA?.tex || !fboB?.tex) return false;
    let ok = false;
    try {
      // ---- 源纹理上传（首 pass 输入=主画布全幅;语义与旧链一致。旧链 texScreen
      //      参数 init 一次:LINEAR+CLAMP_TO_EDGE——此处建时同参,驻留复用）----
      const sizeChanged = this.pipeTexScreenW !== w || this.pipeTexScreenH !== h;
      if (!this.pipeTexScreen || sizeChanged) {
        this.pipeTexScreen = gl.createTexture();
        this.pipeTexScreenW = w; this.pipeTexScreenH = h;
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
      if (sizeChanged) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        // ★持久化:同尺寸原位更新（免 realloc/orphan churn——exit trace texImage2D top1 的可达路径补刀）
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
      glStatUpload(pipe.statName, w * h * 4);
      // ---- 逐 pass（★K1-2 起为共用执行面 pipeRunPasses——drawChainPipe 输入=
      //      上传源纹理（恒等布局）,drawChainPipeStack 输入=屏栈组装折返 sfxB;
      //      uniform 转录/朝向账/字节等价论证见 pipeRunPasses 注）----
      ok = this.pipeRunPasses(gl, pipe, w, h, chain, tint, this.pipeTexScreen!, fboA, fboB);
    } finally {
      // 预乘态还原（GLPipeline.uploadCanvas 依赖 init 收口缺省 true——防跨消费方渗漏）
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    return ok;
  }

  // ==== ★K1-2 屏栈 FBO 直入滤镜链（2026-10-02;docs/c10e-design.md §八f 二期债）====
  //
  // K1（合成即折叠）后滤镜帧仍付两段 2D 全幅腿:P1/P2 合成（glCanvas+sky2D 两次
  // 全幅 drawImage 落 HUD）+链头整幅上传。本变体把链输入组装全数搬进 GPU 侧:
  //
  //   sky2D 一次上传（G 朝向）→ presentTexTo blend-off 直写 sfxA 基底
  //   → screenStack 逐层 present 程序 premul-over 重放（flipY=1 恒等 texel 映射）
  //   → HUD 一次上传（G 朝向）premul-over 叠加（最顶层）
  //   → sfx:flip 直通 blit sfxA(G)→sfxB(恒等布局) 归还链输入契约
  //   → pipeRunPasses 照常（复用 A1 pass 执行面）→ 末 pass present 回 pipe.canvas。
  //
  // ★K1-2b（2026-10-04）上传腿持久纹理化:sky/HUD 两腿原每帧 texImage2D 全幅重
  //  分配（exit trace texImage2D 主线程自耗 top1=9194ms/12.3%）→ 两专用持久槽
  //  （sky=pipeTexStackSky 专槽/hud=pipeTexHud 判例槽）+尺寸账,稳态帧
  //  texSubImage2D 原位更新（同源同参数=字节逐位同;分配/resize/pipeDrop 重建=
  //  旧路径 texImage2D 逐字面）。单源=pipeStackLegUpload（防双腿漂移）;GLStats
  //  双口径不变（分配=驻留、刷新=带宽）。对拍锁 scripts/_k12-persist-ab.mjs
  //  （纹理读回逐位）+ tests/k12-stack-persist-tex.test.ts。
  //
  // 等价性论证（对拍锁 scripts/_k12-stack-ab.mjs 冻结态整帧逐字节）:
  // ① 层序:porter-duff over 结合律——栈不变式「任意时点 glCanvas 内容 ≙ 屏栈 FBO
  //    的 over 折叠（层序=入栈序）」（restackScreen 注钉死）,重放序=栈序=折叠序;
  //    HUD 恒最顶层（c10eChainSource 折叠第三腿同位）。合成帧（xform）不走本变体
  //    （HUD 已含 sky+gl 全帧,二次计入禁走——Renderer 路由分档）。
  // ② 朝向:屏栈 FBO 全为 GLSpriteLayer VERT（自带 y 翻转）产物=G 朝向「图像顶=v1」
  //    （GLWorldCompose opresent 头注同判）;present(flipY=1)=texel 恒等映射
  //    （PRESENT_VERT gl_Position.y 取反+vUv.y=1−aPos.y 双翻抵消,精确 texel 中心
  //    LINEAR=恒等重采样零舍入）→ 重放 flipY=1 逐位同 restackScreen 重放语义。
  //    sky2D/HUD 上传翻 UNPACK_FLIP_Y_WEBGL=true=G 朝向（纯行重排零算术）与栈
  //    对齐;组装积 sfxA=G 朝向,经 sfx:flip 直通 blit（FRAG_PASSTHRU 零算术）翻回
  //    恒等布局喂链——链 pass 契约（A1③「恒等布局输入」）零改动。
  // ③ 预乘域:基底 sky2D 不透明（天空渐变 rgb() 全幅 fillRect 打底）→ 全折叠 a=1
  //    域 premul≡straight,链 pass 读数逐位同;上传 premultiply=true=画布预乘背板
  //    恒等拷贝（零舍入,SpriteAtlas 判例同款）;栈层 FBO texel 本就预乘;premul-over
  //    （ONE,1−SA）≙ 2D drawImage source-over（Skia out_p=src_p+dst_p·(1−src_a)
  //    同式）。单层覆盖像素两侧恰一次舍入（逐位同——含 merged opresent 主流帧:
  //    现路径=glCanvas 拷贝+2D 一次 over 舍入,本路径=present-over 一次舍入）;
  //    多层半透明重叠像素舍入位次不同=结合律 8bit 备案族 ±1~2LSB（cloudbatch/
  //    C10b GC·GD 同族,方向中性,探针实测口径）。
  // ④ pass 面:pipePrepareChain/pipeRunPasses/pipeFlipTo 三抽取与 drawChainPipe
  //    单源共用（禁转录）;程序/采样参数/FBO/状态机纪律全同 A1。
  // 失败面:返回 false → 调用方落 c10eChainSource 三腿折叠（既有回退语义不动）。

  /** ★A1/K1-2 链噪声依赖过滤（旧链 drawChain :681-693 逐式转录——Noir/Sepia
   *  未就绪剔该 pass;Misc 噪声未就绪只剔 Heat/Vortex;空链返 null）。
   *  drawChainPipe/drawChainPipeStack 单源共用（防双路漂移） */
  private pipePrepareChain(pipe: GLPipeline, gl: WebGL2RenderingContext,
    passes: readonly ScreenFxPass[]): readonly ScreenFxPass[] | null {
    let chain = passes;
    const needNoise = chain.some((p) => p.kind === 'FilterHeatDistortion' || p.kind === 'FilterCrystalDestructionVortex'
      || p.kind === 'FilterNoir' || p.kind === 'FilterSepia');
    for (const p2 of chain) {
      if ((p2.kind === 'FilterNoir' || p2.kind === 'FilterSepia')
        && !this.pipeKindNoiseOk(p2.kind === 'FilterNoir' ? 'NoirNoise' : 'DSTNoise', gl, pipe.statName)) {
        chain = chain.filter((q) => q !== p2);
      }
    }
    if (chain.length === 0) return null;
    if (needNoise && !this.pipeEnsureNoise(pipe)) {
      chain = chain.filter((p) => p.kind !== 'FilterHeatDistortion' && p.kind !== 'FilterCrystalDestructionVortex');
      if (chain.length === 0) return null;
    }
    return chain;
  }

  /** 非末 pass 朝向归还直通 blit（from=GL 朝向→to=恒等布局;FRAG_PASSTHRU 纯位
   *  搬运零舍入——★K1-2 自 pass 环抽取,drawChainPipe 环内与 Stack 组装收口共用） */
  private pipeFlipTo(gl: WebGL2RenderingContext, pipe: GLPipeline, w: number, h: number,
    from: PipelineFbo, to: PipelineFbo): boolean {
    const flipEntry = this.pipeFlipProgram(pipe);
    if (!flipEntry?.prog || !from.tex || !to.tex) return false;
    pipe.bindTarget(to);
    gl.viewport(0, 0, w, h);
    gl.useProgram(flipEntry.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.tex);
    gl.uniform1i(pipe.uni(flipEntry, 'uTex'), 0);
    pipe.setBlend('off');
    pipe.drawQuad(flipEntry, [0, 0, w, h], 0);
    return !gl.isContextLost();
  }

  /** ★A1 pass 执行面（★K1-2 自 drawChainPipe 抽取共用:drawChainPipe 输入=
   *  pipeTexScreen 上传源,drawChainPipeStack 输入=屏栈组装折返 sfxB;uniform
   *  转录/朝向账/字节等价论证全同原内联版,漂移即对拍爆红,禁改滤镜数学）。
   *  每 pass 读恒等布局输入、写 GL 朝向输出（原 VERT 片元@row v 的
   *  vUv.y=1−(v+.5)/h,产「画布行 r」的片元 vUv=(·,(r+.5)/h) ≙ 旧链 ✓坐标数学
   *  逐位同;数据流:片元采输入 row h−1−v=恒等布局 image row h−1−v ✓）;非末 pass
   *  后经 FRAG_PASSTHRU 直通 blit（纯位搬运）翻回恒等布局喂下级;末 pass present
   *  回 pipe.canvas（调用方 ctx.drawImage(pipe.canvas) 单次回贴;flipY=1 画布顶
   *  采 v1=图像顶 ✓闭合）。 */
  private pipeRunPasses(gl: WebGL2RenderingContext, pipe: GLPipeline, w: number, h: number,
    chain: readonly ScreenFxPass[], tint: readonly [number, number, number],
    srcTex0: WebGLTexture, fboA: PipelineFbo, fboB: PipelineFbo): boolean {
    let srcTex: WebGLTexture = srcTex0;   // 恒等布局（v0=图像顶）
    for (let i = 0; i < chain.length; i++) {
      const p = chain[i];
      // ---- mod 全屏后处理 pass:无 FRAGS 程序表项,exec 自管子管线(uTint 豁免
      //      ——着色器不声明即不乘;契约=出口写 fboA GL 朝向,直通 blit/present 照常) ----
      if (p.kind === 'ModScreenFx') {
        if (!fboA.tex || !fboB.tex) return false;
        p.exec(gl, pipe, srcTex, fboA, w, h);
        if (gl.isContextLost()) return false;
        if (i === chain.length - 1) break;
        if (!this.pipeFlipTo(gl, pipe, w, h, fboA, fboB)) return false;
        srcTex = fboB.tex!;
        continue;
      }
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
      if (!this.pipeFlipTo(gl, pipe, w, h, fboA, fboB)) return false;
      srcTex = fboB.tex!;
    }
    // ---- 末 pass 出口:GL 朝向 FBO('sfxA') → present（调用方 ctx.drawImage
    //      (pipe.canvas) 单次回贴;flipY=1 画布顶采 v1=图像顶 ✓闭合）----
    pipe.present(fboA);
    return true;
  }

  /** ★K1-2b Stack 腿持久纹理上传（sky/HUD 两腿单源——防双腿漂移）。槽按视口尺寸
   *  惰性分配:首用/尺寸变化/pipeDrop 槽重建 → texImage2D 全量重分配（与旧路径逐
   *  字面同——同 canvas 源/同 target/level/format/type/同 pixelStorei 态）;尺寸
   *  不变帧 → texSubImage2D 原位更新——DOM 源拷贝管线与 texImage2D 同一
   *  （pixelStorei premultiply+FLIP_Y 同态施加,WebGL 规范两态对 texSubImage2D
   *  同样生效）,存储尺寸恰等时全幅覆盖=纹理字节逐位同,唯一差异=不重定义存储
   *  （省驱动端 realloc churn=K1-2 收益面）。
   *  失效面:pipeDrop（上下文指纹变更）齐清两槽+尺寸账=pipeTexHud 判例;resize 走
   *  尺寸账失配自动重分配。pixelStorei 逐笔显式（GLPipeline init 收口 premul=true/
   *  FLIP_Y=false——本腿临时翻 FLIP_Y=true,链尾 finally 统一还原）。 */
  private pipeStackLegUpload(gl: WebGL2RenderingContext, stat: string, leg: 'sky' | 'hud',
    src: HTMLCanvasElement): void {
    const w = src.width, h = src.height;
    const isSky = leg === 'sky';
    let tex = isSky ? this.pipeTexStackSky : this.pipeTexHud;
    const hadTex = !!tex;
    if (!tex) {
      tex = gl.createTexture();
      if (isSky) this.pipeTexStackSky = tex; else this.pipeTexHud = tex;
    }
    const tw = isSky ? this.pipeTexStackSkyW : this.pipeTexHudW;
    const th = isSky ? this.pipeTexStackSkyH : this.pipeTexHudH;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (!hadTex) {
      // 首用：采样参数+驻留账（=旧槽创建块逐字面;后续 texImage2D 重定义存储不改参数）
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      glStatTexCreate(stat, w * h * 4);
    }
    // 画布预乘背板恒等拷贝+G 朝向纯行重排（K1-2①原语义——texSubImage2D 同受两态约束）
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (tw !== w || th !== h) {
      // 分配/重分配（=旧路径 texImage2D 全幅上传逐字面）
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } else {
      // 稳态：原位更新（同源同参数=字节逐位同）
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }
    glStatUpload(stat, w * h * 4);
    // 尺寸账回写（稳态判据;pipeDrop 归零→下帧走重分配）
    if (isSky) { this.pipeTexStackSkyW = w; this.pipeTexStackSkyH = h; }
    else { this.pipeTexHudW = w; this.pipeTexHudH = h; }
  }

  /**
   * ★K1-2 屏栈 FBO 直入滤镜链（等价性论证见上方 ★K1-2 段头注）。pipe=Renderer
   * 共管 GLPipeline（须 screenStackMode 在=屏栈内容有效）;src.sky=sky2D 基底
   * （与 hud 同界,不等即返 false 落折叠）;src.hud=HUD-so-far（最顶层覆盖内容——
   * 7x 直绘覆盖层/夹层族/夹层帧世界 blit 全在此）;src.useHud=false=免 HUD 腿
   * （预留位——当前路由恒 true,覆盖层必须在链输入内,原版采集界 EndCapture）。
   * 成功返回 true——调用方 ctx.drawImage(pipe.canvas, 0, 0)。失败返回 false——
   * 调用方落 c10eChainSource 三腿折叠。
   */
  drawChainPipeStack(pipe: GLPipeline, src: { sky: HTMLCanvasElement; hud: HTMLCanvasElement; useHud: boolean },
    passes: readonly ScreenFxPass[], tint: readonly [number, number, number]): boolean {
    const gl = pipe.glx;
    if (!gl || pipe.unavailable || passes.length === 0) return false;
    const w = src.hud.width, h = src.hud.height;
    if (w === 0 || h === 0) return false;
    if (src.sky.width !== w || src.sky.height !== h) return false;   // 界不等=回退折叠
    if (!pipe.screenStackMode) return false;   // 屏栈不在=栈内容无效（revive 窗/旗关）
    if (this.pipeGlId !== gl) { this.pipeDrop(); this.pipeGlId = gl; }
    const chain = this.pipePrepareChain(pipe, gl, passes);
    if (!chain) return false;
    // 帧界（同 drawChainPipe:调用方已保证 wK===1 防 compose 帧界振荡 churn）
    pipe.beginFrame(w, h);
    const fboA = pipe.fbo('sfxA', w, h);
    const fboB = pipe.fbo('sfxB', w, h);
    if (!fboA?.tex || !fboB?.tex) return false;
    let ok = false;
    try {
      // ---- ① sky2D 基底上传（G 朝向:UNPACK_FLIP_Y=true 纯行重排与屏栈 FBO 同
      //      朝向;premultiply=true=画布预乘背板恒等拷贝——基底不透明域
      //      premul≡straight。★K1-2b 持久槽 pipeTexStackSky（专用新槽,不与
      //      drawChainPipe 的 pipeTexScreen 共率）——texImage2D 分配/texSubImage2D
      //      原位更新语义见 pipeStackLegUpload 注;首帧/重建=旧路径逐字面）----
      this.pipeStackLegUpload(gl, pipe.statName, 'sky', src.sky);
      // 基底 blend off 直写 sfxA（全幅替换陈旧帧内容;flipY=1 恒等 texel 映射）
      // !:helper 已保证槽在（drawChainPipe pipeTexScreen! 同款）
      pipe.presentTexTo(fboA, this.pipeTexStackSky!, false, 1);
      // ---- ② 屏栈逐层 premul-over 重放（flipY=1 恒等映射=restackScreen 重放同款
      //      语义;栈序=折叠序;presentTexTo 不入栈——「glCanvas=屏栈」不变式不动）----
      for (const layer of pipe.screenStackView) {
        if (!layer.tex) continue;
        pipe.presentTexTo(fboA, layer.tex, true, 1);
      }
      // ---- ③ HUD-so-far 一次上传 over 叠加（最顶层;useHud 门;★K1-2b 持久槽
      //      pipeTexHud 判例槽续用——语义见 pipeStackLegUpload 注）----
      if (src.useHud) {
        this.pipeStackLegUpload(gl, pipe.statName, 'hud', src.hud);
        // !:helper 已保证槽在
        pipe.presentTexTo(fboA, this.pipeTexHud!, true, 1);
      }
      // ---- ④ 朝向归还:组装积 sfxA(G 朝向) 直通 blit→sfxB(恒等布局)——链输入
      //      契约闭合（A1③）;⑤ passes 照常复用执行面 ----
      if (!this.pipeFlipTo(gl, pipe, w, h, fboA, fboB)) return false;
      ok = this.pipeRunPasses(gl, pipe, w, h, chain, tint, fboB.tex!, fboA, fboB);
    } finally {
      // 预乘/翻转态还原（GLPipeline init 收口缺省 premul=true+FLIP_Y=false——
      // 防跨消费方渗漏;本变体上传腿临时翻 FLIP_Y=true 亦在此归还）
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    return ok;
  }
}
