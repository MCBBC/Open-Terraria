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
// 采样态：s1=Images/Misc/noise(256²,POT)→LinearWrap（ScreenShaderData.cs:175-178）；
// s0=链上前级目标，XNA 设备默认 LinearWrap——NPOT 画布 WebGL1 只能 CLAMP，
// 故片元内 mod(uv,1) 手工重复等价 wrap（差异=0，采样前已折回）。

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
  uvOut = mod(uvOut, 1.0);                    // s0 设备默认 wrap 的手工等价
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

const FRAGS: Record<ScreenFxPass['kind'], string> = {
  FilterHeatDistortion: FRAG_HEAT,
  FilterMiniTower: FRAG_MINITOWER,
  FilterGraveyard: FRAG_GRAVEYARD,
  FilterBloodMoon: FRAG_BLOODMOON,
  FilterTest2: FRAG_TEST2,
  FilterCRT: FRAG_CRT,
  FilterMoonLordShake: FRAG_MOONSHAKE,
  FilterCrystalDestructionColor: FRAG_CRYSTAL_COLOR,
  FilterCrystalDestructionVortex: FRAG_CRYSTAL_VORTEX,
  SkyWeatherTint: FRAG_SKY_TINT,
};

/** 各 pass 的 GLSL 源（测试锁字节码衍生常量用；键=ScreenShader.cso pass 名） */
export const SCREEN_FX_FRAGS: Readonly<Record<string, string>> = FRAGS;

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

export class GLScreenFilters {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private progs = new Map<ScreenFxPass['kind'], { prog: WebGLProgram; uni: Record<string, WebGLUniformLocation | null> }>();
  private texScreen: WebGLTexture | null = null;
  private texNoise: WebGLTexture | null = null;
  private noiseReady = false;
  private noiseW = 256;
  private noiseH = 256;
  private staging: HTMLCanvasElement | null = null;
  /** 上下文丢失/初始化失败时间戳(0=健在);调用方 5s 退避后可重建 */
  diedAt = 0;
  /** GL 永不可用——调用方直接走 2D 回退不再重建 */
  unavailable = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.init();
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
      'uTargetPx', 'uTime'];   // ★批III尾窗：MoonLordShake(uTime)/Vortex(uTargetPx) 新增
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
    this.noiseW = im.naturalWidth;
    this.noiseH = im.naturalHeight;
    this.noiseReady = true;
    return true;
  }

  /**
   * 合成一条滤镜链（passes 按 EffectPriority 升序——FilterManager.EndCapture :136-176：
   * 逐级把前级结果作为 s0 再滤；每级乘 ColorOfTheSkies）。结果写回 this.canvas，
   * 调用方 ctx.drawImage(this.canvas, 0, 0)。
   */
  drawChain(source: HTMLCanvasElement, passes: readonly ScreenFxPass[],
    tint: readonly [number, number, number]): boolean {
    const gl = this.gl;
    if (!gl || this.diedAt || this.unavailable || passes.length === 0) return false;
    const w = source.width, h = source.height;
    if (w === 0 || h === 0) return false;
    const needNoise = passes.some((p) => p.kind === 'FilterHeatDistortion' || p.kind === 'FilterCrystalDestructionVortex');
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
      gl.useProgram(entry.prog);
      const loc = gl.getAttribLocation(entry.prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(entry.uni.uScreen, 0);
      if (p.kind === 'FilterHeatDistortion') {
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
        gl.uniform1i(entry.uni.uNoise, 1);
        gl.uniform2f(entry.uni.uScreenRes, p.screenRes[0], p.screenRes[1]);
        gl.uniform2f(entry.uni.uTargetPx, p.targetPx[0], p.targetPx[1]);
        gl.uniform1f(entry.uni.uIntensity, p.intensity);
        gl.uniform1f(entry.uni.uProgress, p.progress);
        gl.uniform1f(entry.uni.uTimeScroll, -2.5 * p.time);   // preshader lit16(-2.5)×uTime
      } else if (p.kind === 'FilterMiniTower') {
        gl.uniform3f(entry.uni.uColor, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
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
      } else {
        gl.uniform1f(entry.uni.uScreenH, p.screenH);
        gl.uniform1f(entry.uni.uZoom, p.zoom);
        gl.uniform1f(entry.uni.uOpacity, p.opacity);
      }
      gl.uniform3f(entry.uni.uTint, tint[0], tint[1], tint[2]);
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
}
