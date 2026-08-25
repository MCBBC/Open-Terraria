// 原版 1.4.4+ 水面波动模拟（Water Waves）+ 浪质量四档（Wave Quality）1:1 移植。
//
// 【原版机制考古（全部带行号，Terarria1456）】
// · 设置：Main.cs:405 `public static int WaveQuality = 3;`（默认 3=高）；
//   持久化 Main.cs:4215 Put("WaveQuality") / :4465 Get + :4466-4473 钳 [0,3]；
//   UI 行 IngameOptions.cs:1040-1055（`(WaveQuality + 1) % 4` 四档循环：
//   0=关 1=低 2=中 3=高，文案 GameUI.WaveQuality + GameUI.QualityOff/Low/Medium/High）。
// · 档位门（WaterShaderData.cs:114-118 Update）：
//     >=3 → _useViscosityFilter + _useProjectileWaves（弹幕波）
//     >=2 → _usePlayerWaves + _useRippleWaves + _useCustomWaves（玩家/涟漪/自定义）
//     恒开 → _useNPCWaves（NPC 波不受档位控制，:79/:192）
//   SceneState.cs:129 ManageSpecialBiomeVisuals("WaterDistortion", WaveQuality > 0)
//   —— 0 档整个滤镜关闭（连噪声环境波都没有）；1 档只有噪声环境波、无涟漪源。
// · 步进节奏：Update :119-128（_progress += dt·Intensity·0.75 模 86400；任一
//   q≥2 源开启时 _queuedSteps++）；PreDraw :336-360 每帧消费 min(queuedSteps, 2)
//   步（渲染跳帧时补 2 步）——q<2 无源时不步进（缓冲清回中性）。
// · 波场缓冲（WaterShaderData）：DISTORTION_BUFFER_SCALE=0.25（:47）屏幕 1/4
//   分辨率双缓冲 ping-pong（:138-158 StepLiquids）；中性值 R=G=0.5（清色
//   :141/:146）；随相机滚动（:148-152 位移增量 floor 到缓冲像素，每步只施加
//   一次——lastOffset 在 StepLiquids 内更新）。
// · 传播内核 = 编译像素着色器 "WaterProcessor"（DyeInitializer.cs:427 注册）。
//   C# 反编译不含 HLSL——本模块数学由 tools/disasm-fx.mjs 反汇编
//   terraria-assets/PixelShader.cso obj49（ps_2_0 字节码）逐指令复原：
//     S      = Σ(2·N.R − 1)（四邻各 −1，共 4 项）
//     T      = (S·0.25 − (2C.R−1)) · (1 − C.B)
//     w      = (C.G − 0.5)·(10/3)；H = (2C.R−1) + 2T + w·|w|
//     newH   = H · exp2(−0.0551416·(1 − C.B))
//     outR   = clamp01(round(512·(newH·0.5+0.5))/512)  ← unorm 8bit + 1/512 量化
//     dv     = (1 − 0.05·C.B)·(newH − (2C.R−1))
//     outG   = clamp01(0.5 + 0.3·sign(dv)·√|dv|)       ← 速度 √ 压缩编码
//     outB   = 0（黏度每步被清零，由波掩码重画——见下）
//   ★ (G−0.5)/0.3 与 0.3·sign·√|dv| 互逆（w·|w| ≡ dv）——实为速度 Verlet 形式
//   波动方程，√ 编码只是精度压缩。unorm 钳制（强涟漪把高度打满 1.0）是动力学
//   的一部分，必须保留。
// · 黏度通道 B：LiquidRenderer 波掩码（LiquidRenderer.cs:110 WAVE_MASK_STRENGTH、
//   :529-548 写 R=G=A=strength/2、B=VISCOSITY_MASK {0,200,240,0,0}）。
//   **1.4.5.6 的 WAVE_MASK_STRENGTH 是 `new byte[5]` 全零、全工程无赋值**（1405
//   为 {0,0,0,255,0}）→ 掩码 alpha 恒 0 = 传入 StepLiquids :161-177 的重画是
//   no-op → B 通道恒 0 = 黏度分化已死（本仓 VanillaLiquidRenderer.ts P4 注释同
//   一结论）。故本移植不建模 B：damp 恒 exp2(−0.0551416)、(1−B)=1；
//   :211/:247/:304 的 `!_useViscosityFilter && (honeyWet||lavaWet) → 强度×0.3`
//   补偿仍按档位保留。
// · 实体注入（WaterShaderData.DrawWaves :181-334；洗掠形状 = "WaterDistortionObject"
//   着色器，PixelShader.cso obj50 逐指令复原）：
//     radial = normalize(uv−0.5)；flow = normalize(vColor.xy−0.5)
//     r = |uv−0.5|·25.12；r≥4π → φ=−0.00637111，否则 φ = frac(max(r,2π)/2π+0.5)·2π−π
//     s = vColor.z · max(dot(−flow,radial)−0.2, 0) · min(sin φ, 0)
//     输出 (s,0,0,s)，非预乘 AlphaBlend（TileBatch blendState=null → XNA 默认）：
//     out = src.rgb·src.a + dst.rgb·(1−src.a)
//   NPC（:192-230，恒开）：num = |vel/(h,w)|²·(0.3+0.7·1024/(h·w)) 钳 0.08 +
//   |vel−oldVel|·0.5；流方向 = normalize(vel.RotatedBy(−rotation)/(h,w))；
//   quad (2w,2h) @ Center−v̂·10；wetCount≠0 涟漪走【raw Color 重载】：
//   Color(0.5, (wet?num:−num)·0.5+0.5, 0,1)×0.5 → (R,G,A)=(0.25, …, 0.5)、
//   尺寸 (w, h·wetCount/9)·clamp(num·10,0,1)、Circle、位置 Center+v̂·(wet?5:−20)。
//   玩家（:232-265，q≥2）：num = 0.05·√|vel|（涟漪再 ×3）；涟漪走 (strength,size)
//   重载：色 (0.5, s·0.5+0.5, 0)·min(|s|,1)、A=num。
//   弹幕（:267-311，q≥3）：CanDistortWater（ProjectileID.cs:195 默认 true，例外
//   7,8,150,151,152,493,494）&& !NoLiquidDistortion（:333 {511,512,513}）&& wet
//   （ignoreWater 时现场复查岩浆/水/蜂蜜碰撞）；num = 2·√(0.05·|vel|)；quad
//   (max(12,0.75w), max(12,0.75h)) @ Center（无 −v̂·10 偏移）。
//   涟漪队列（:314-327 队列上限 200 满即弃 / :446-470 三个 QueueRipple 重载；
//   !_useRippleWaves 时入队动作 = 清空全队列 :462-465）。形状贴图
//   Images/Misc/Ripples（64×128：Square=(1,1,62,62) 纯白方 / Circle=(1,65,62,62)
//   硬边圆——像素实测，形状在 RGB 通道、alpha 全 255）。
//   外部涟漪源：Gore.cs:986（血块落水 QueueRipple(pos+8,8) 默认强度 1）、
//   Projectile.cs:30674（水枪尾迹 raw Color）、FakeFishParticle.cs:184（假鱼
//   脉冲——本仓无假鱼系统，不移植）。
// · 消费端 = "FilterWaterDistortion"（ScreenShader.cso obj19 逐指令复原）：
//   uIntensity 由 SceneState.cs:159-173 动态算：
//     num  = maxTilesX/2 − |tileX − maxTilesX/2|（离世界边 tile 距）
//     I    = 1 + |wind|·1.25 + clamp(rain,0,1)·1.25 − (clamp((num−380)/100,0,1)·0.5 − 0.25)
//     num6 = 1 − clamp(3·(tileY−worldSurface)/(rockLayer−worldSurface), 0, 1)
//     I   *= num6；I += 0.9 − clamp((maxTilesY−tileY−200)/300,0,1)·0.9 + (1−num6)·0.75；钳 [0,2.5]
//   位移场（obj19 :44-104）：n1 = noise(uv·0.1 + (0, prog·0.04))、n2 = noise(uv·0.2 −
//   (0, prog·0.04))（uv = 屏幕px/noise 尺寸，LinearWrap 采样）；grad = n1.xy −
//   n2.xy；h' = (bufR − 0.5)·(1 − 0.4·bufB)（1456 bufB=0）；DISPY = grad.y·0.1·I −
//   clamp(h',−0.3,0.3)；DISPX = grad.x·0.1·I；屏幕像素位移 = (DISPX·0.1·32,
//   DISPY·32)（c14/c5 链，uOpacity=1）。X 位移只含噪声项（涟漪只垂直推——
//   原版水面涟漪是"上下起伏"）。水体内部 lerp 权重 20%（(αA+αB)·0.1 钳 1，
//   :89-97）、水线边缘全权重（水层 alpha 差门控）→ 本移植取"表层全权重"。
//   波光 tint（:106-111）：mask·waterA·(0.3·h' + |grad|)·(r+g+b)/3 加色提亮。
// 【Canvas2D 取舍（非静默近似，逐条登记）】
// · 原版 Filter 是全屏 pass：位移采样的是【合成后屏幕】，水线两侧内容一起扭。
//   Canvas2D 无屏幕纹理——本移植把位移施加在【液体绘制侧】：表层格水线随 dy
//   升降；水线处的背景/前景内容不扭。
// · 瀑布（WaterfallRenderer，另一套系统——"两套瀑布系统勿混淆"案）未接波动位移。
// · 水体内部 20% 权重纹样位移在环境波量级下 ≤0.3px，视觉不可辨——不施加。
// · 波光 tint 的 (r+g+b) 为屏幕实际亮度，此处以固定 0.75 亮度近似（亮处波光略
//   强、暗处略弱，幅度差 <2%）。
// · NPC 洗掠 quad 的 rotation（:217 传入 nPC.rotation）未建模——仅蠕虫族视觉
//   旋转非 0，且洗掠强度本就 ≤0.04，影响不可辨。

/** 档位门（WaterShaderData.cs:114-118）。q: 0..3 */
export interface WaveSourceGates {
  /** NPC 波（恒开，:79） */
  npc: boolean;
  player: boolean;
  ripple: boolean;
  /** 自定义波（OnWaveDraw 订阅者 = 假鱼；本仓无，恒 false 但档位语义保留） */
  custom: boolean;
  projectile: boolean;
  viscosity: boolean;
}

export function waveSourceGates(q: number): WaveSourceGates {
  return {
    // q>0 滤镜激活即 NPC 波生效（_useNPCWaves :79 无档位门，但 0 档滤镜整体关）
    npc: q > 0,
    player: q >= 2,
    ripple: q >= 2,
    custom: q >= 2,
    projectile: q >= 3,
    viscosity: q >= 3,   // 1456 掩码 no-op，仅剩注入 ×0.3 补偿语义
  };
}

/** damp = exp2(c2.x)（obj49 def c2.x float32 = −0.0551415532827；(1−B)=1 恒定——B 通道 1456 已死） */
export const WATER_DAMP = Math.pow(2, -0.0551415532827);

/** unorm8 通道量化（渲染目标 R8G8B8A8 存储 = 1/256 步；★动力学一部分——
 *  小速度被 8bit 量化截断是涟漪能量汇，浮点缓冲会出"永生驻波"） */
const q256 = (v: number): number => {
  const q = Math.round(v * 256);
  return q < 0 ? 0 : q > 256 ? 1 : q / 256;
};

/** WaterProcessor 传播内核（纯函数，供单测金标；encoded R/G ∈ [0,1]）。
 *  L/R/U/D = 四邻 encoded 高度；C/Cg = 本格 encoded 高度/速度。返回 [outR, outG]。 */
export function waveProcessorStep(
  L: number, R: number, U: number, D: number, C: number, Cg: number,
): [number, number] {
  const signedC = 2 * C - 1;
  const S = (2 * L - 1) + (2 * R - 1) + (2 * U - 1) + (2 * D - 1);
  const T = S * 0.25 - signedC;                        // (1−B)=1（1456）
  const w = (Cg - 0.5) * (10 / 3);
  const H = signedC + 2 * T + w * Math.abs(w);
  const newH = H * WATER_DAMP;
  // 着色器内 1/512 量化（floor(512·enc+0.5)/512）→ 写入 unorm8 目标再 1/256 量化
  const q512 = Math.round(512 * (newH * 0.5 + 0.5));
  const outR = q256(q512 < 0 ? 0 : q512 > 512 ? 1 : q512 / 512);
  const dv = newH - signedC;                           // (1−0.05B)=1
  const outG = q256(0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv)));
  return [outR, outG];
}

/** SceneState.cs:159-173 强度公式（纯函数）。tileX/tileY = 玩家中心 tile。 */
export function waterDistortionIntensity(
  windAbs: number, rain: number, tileX: number, tileY: number,
  maxTilesX: number, maxTilesY: number, worldSurface: number, rockLayer: number,
): number {
  const num = maxTilesX * 0.5 - Math.abs(tileX - maxTilesX * 0.5);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  let i = 1 + windAbs * 1.25 + clamp01(rain) * 1.25;
  i += -(clamp01((num - 380) / 100) * 0.5 - 0.25);
  const num6 = 1 - clamp01((3 * (tileY - worldSurface)) / (rockLayer - worldSurface));
  i *= num6;
  i += 0.9 - clamp01((maxTilesY - tileY - 200) / 300) * 0.9;
  i += (1 - num6) * 0.75;
  return Math.min(2.5, Math.max(0, i));
}

/** WaterDistortionObject 实体洗掠强度（纯函数，obj50 复原）。
 *  uvcX/uvcY = quad 局部 uv − 0.5；flowX/flowY = vColor.xy − 0.5；strength = vColor.z。
 *  ★内圈 max(r, 2π) 钳(2026-08-20 字节码复核)：obj50 #27 `max r1.z, r0.z, c1.x(6.28)`
 *  在 frac 前钳 r——r<2π(内圈 |uvc|<0.25)的 φ 恒 ≈ −0.0039（frac(2π·0.159155+0.5)），
 *  旧实现直接用原 r 算 frac → 内圈 φ 全域摆动 → 洗掠图案内圈错形。
 *  ★sincos 分量序(2026-08-24 r15 复核)：obj50 `sincos r2.x` 按 ps_2_0 语义写
 *  **cos**(MSDN sincos-ps:x=cos/y=sin)——曾写 sin(随旧解释器 `sin→x` 错校准),
 *  cos(−0.0039)≈1>0 → 内圈恒 0(非旧值 0.0039 弱尾迹);负半波取 cos。 */
export function washShapeValue(
  uvcX: number, uvcY: number, flowX: number, flowY: number, strength: number,
): number {
  const rlen = Math.hypot(uvcX, uvcY);
  if (rlen === 0) return 0;
  const radx = uvcX / rlen, rady = uvcY / rlen;            // normalize(radial)
  const flen = Math.hypot(flowX, flowY);
  if (flen === 0) return 0;
  const fx = flowX / flen, fy = flowY / flen;              // normalize(flow)
  const r = rlen * 25.1200008392334;                        // c0.w(float32 字节码精确值)
  const dotTerm = Math.max(-fx * radx - fy * rady - 0.2, 0);
  let phi: number;
  if (r >= 12.5600004196167) {                              // c1.y ·(−1):#29 cmp 恒小负角
    phi = -0.00637111347169;                                // c2.z float32 精确值
  } else {
    const rEff = Math.max(r, 6.28000020980835);             // #27 max(r, c1.x)
    let frac = (rEff * 0.15915493671 + 0.5) % 1;            // r/2π + 0.5 → frac(c1.z float32)
    if (frac < 0) frac += 1;
    phi = frac * 6.28318548202515 - 3.14159274101257;       // ·2π − π(c2.x/c2.y float32)
  }
  const cosPhi = Math.cos(phi);
  return strength * dotTerm * (cosPhi >= 0 ? 0 : -cosPhi);  // min(cos,0) 取负半波
}

/** 涟漪形状（RippleShape.cs enum + RIPPLE_SHAPE_SOURCE_RECTS :18-23） */
export const RippleShape = { None: 0, Square: 1, Circle: 2 } as const;
export type RippleShape = typeof RippleShape[keyof typeof RippleShape];

// ---- 涟漪队列（200 上限满即弃，:51/:69/:466-469）----
const MAX_RIPPLES = 200;
const _rqX = new Float64Array(MAX_RIPPLES);
const _rqY = new Float64Array(MAX_RIPPLES);
const _rqW = new Float64Array(MAX_RIPPLES);
const _rqH = new Float64Array(MAX_RIPPLES);
const _rqColR = new Float64Array(MAX_RIPPLES);
const _rqColG = new Float64Array(MAX_RIPPLES);
const _rqA = new Float64Array(MAX_RIPPLES);
const _rqRot = new Float64Array(MAX_RIPPLES);
const _rqShape = new Uint8Array(MAX_RIPPLES);
let _rqCount = 0;

/** QueueRipple(pos, strength=1, shape=Square, rotation=0)（:446-451）。
 *  色 (0.5, s·0.5+0.5, 0)·min(|s|,1)、尺寸 4·max(|s|,1)×4·max(|s|,1)。
 *  Gore.cs:986 血块落水走此重载。 */
export function queueRipple(x: number, y: number, strength = 1,
  shape: RippleShape = RippleShape.Square, rotation = 0): void {
  const g = strength * 0.5 + 0.5;
  const num = Math.min(Math.abs(strength), 1);
  const size = 4 * Math.max(Math.abs(strength), 1);
  queueRippleRaw(x, y, size, size, 0.5 * num, g * num, num, shape, rotation);
}

/** QueueRipple(pos, strength, size, shape, rotation)（:453-458）。玩家涟漪走此重载 */
export function queueRippleSized(x: number, y: number, strength: number,
  sx: number, sy: number, shape: RippleShape = RippleShape.Square, rotation = 0): void {
  const g = strength * 0.5 + 0.5;
  const num = Math.min(Math.abs(strength), 1);
  queueRippleRaw(x, y, sx, sy, 0.5 * num, g * num, num, shape, rotation);
}

/** QueueRipple(pos, Color waveData, size, shape, rotation)（:460-470）。
 *  NPC 涟漪（色 ×0.5）与水枪尾迹（Projectile.cs:30674）走此重载。
 *  !ripple 档时入队动作 = 清空整个队列（:462-465 原版语义）。 */
export function queueRippleRaw(
  x: number, y: number, sx: number, sy: number,
  colR: number, colG: number, colA: number, shape: RippleShape, rotation: number,
): void {
  if (!waterWaves.gates.ripple) { _rqCount = 0; return; }
  if (_rqCount >= MAX_RIPPLES) return;
  _rqX[_rqCount] = x; _rqY[_rqCount] = y;
  _rqW[_rqCount] = sx; _rqH[_rqCount] = sy;
  _rqColR[_rqCount] = colR; _rqColG[_rqCount] = colG; _rqA[_rqCount] = colA;
  _rqRot[_rqCount] = rotation; _rqShape[_rqCount] = shape;
  _rqCount++;
}

// ---- 纹理数据（noise 256×256 RGB 彩噪 / Ripples 64×128 灰度形状，提取一次）----
let _noiseData: Uint8ClampedArray | null = null;
let _noiseW = 256, _noiseH = 256;
let _rippleData: Uint8ClampedArray | null = null;
let _texReady = false;

/** 游戏侧由 atlas 提取像素后注入（探针/测试也可直接喂数组） */
export function setWaveTextures(
  noise: { w: number; h: number; data: Uint8ClampedArray } | null,
  ripple: { data: Uint8ClampedArray } | null,
): void {
  if (noise) { _noiseData = noise.data; _noiseW = noise.w; _noiseH = noise.h; }
  if (ripple) _rippleData = ripple.data;
  _texReady = !!(noise && ripple);
}

/** 纹理是否已提取（探针/调试） */
export function waveTexReady(): boolean { return _texReady; }

/** 从 atlas 提取两张原版贴图像素（Images/Misc/noise 256×256、Images/Misc/Ripples
 *  64×128；各一次，离屏 canvas getImageData）。Renderer 每帧幂等调用。 */
export function ensureWaveTextures(
  atlas: { ensureVImage(f: string): ImageBitmap | HTMLImageElement | null } | null,
): void {
  if (_texReady || !atlas || typeof document === 'undefined') return;
  const noise = atlas.ensureVImage('vanilla/Misc_noise.png');
  const ripple = atlas.ensureVImage('vanilla/Misc_Ripples.png');
  if (!noise || !ripple) return;   // 未就绪下帧再试
  const grab = (img: ImageBitmap | HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cc = c.getContext('2d');
    if (!cc) return null;
    cc.drawImage(img, 0, 0);
    return cc.getImageData(0, 0, c.width, c.height).data;
  };
  const nd = grab(noise), rd = grab(ripple);
  if (!nd || !rd) return;
  setWaveTextures({ w: noise.width, h: noise.height, data: nd }, { data: rd });
}

/** noise 双线性 + wrap 采样（原版 LinearWrap，256 pow2）单通道 0..1 */
function noiseAt(ch: number, u: number, v: number): number {
  if (!_noiseData) return 0.5;
  const w = _noiseW, h = _noiseH;
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const fx = u - x0, fy = v - y0;
  const xa = ((x0 % w) + w) % w, ya = ((y0 % h) + h) % h;
  const x1 = (xa + 1) % w, y1 = (ya + 1) % h;
  const d = _noiseData;
  const i00 = (ya * w + xa) * 4 + ch, i10 = (ya * w + x1) * 4 + ch;
  const i01 = (y1 * w + xa) * 4 + ch, i11 = (y1 * w + x1) * 4 + ch;
  return ((d[i00] * (1 - fx) + d[i10] * fx) * (1 - fy)
    + (d[i01] * (1 - fx) + d[i11] * fx) * fy) / 255;
}

/** Ripples 形状采样（64×128 灰度；Square 槽 (1,1,62,62) 纯白 / Circle (1,65,62,62) 硬边圆） */
function rippleShape(shape: RippleShape, u: number, v: number): number {
  if (!_rippleData || shape === RippleShape.None) return 0;
  const sy0 = shape === RippleShape.Circle ? 65 : 1;
  const px = Math.min(63, Math.max(0, 1 + u * 62));
  const py = Math.min(127, Math.max(0, sy0 + v * 62));
  return _rippleData[((py | 0) * 64 + (px | 0)) * 4] / 255;
}

/** 帧输入（Renderer 每渲染帧组装） */
export interface WaveFrameInput {
  /** 相机可视左上（世界 px）与缩放（canvas px / 世界 px） */
  camX: number; camY: number; zoom: number;
  viewW: number; viewH: number;
  /** 玩家中心 tile（强度公式 SceneState metrics.TileCenter） */
  tileX: number; tileY: number;
  maxTilesX: number; maxTilesY: number;
  worldSurface: number; rockLayer: number;
  windAbs: number; rain: number;
  /** 本帧真实流逝秒（progress/步进节奏；>1/60+容差 → 补 2 步） */
  dt: number;
}

/** 调试/探针快照（F5 / _waveprobe） */
export interface WaterWaveDebug {
  quality: number; gridW: number; gridH: number;
  progress: number; intensity: number; stepsLastFrame: number;
  rippleQueueUsed: number; activeTexels: number;
}

class WaterWaveSystem {
  quality = 3;
  gates = waveSourceGates(3);
  /** uProgress（WaterShaderData._progress :67/:121） */
  progress = 0;
  intensity = 1;
  private _gW = 0; private _gH = 0;
  private _R = new Float32Array(0);
  private _G = new Float32Array(0);
  private _R2 = new Float32Array(0);
  private _G2 = new Float32Array(0);
  private _camX = 0; private _camY = 0; private _zoom = 1;
  /** 相机滚动偏移（缓冲像素，floor；:151-152 _lastDistortionDrawOffset） */
  private _scrollX = 0; private _scrollY = 0;
  private _stepsLast = 0;

  setQuality(q: number): void {
    const clamped = Math.min(3, Math.max(0, Math.round(q)));   // Main.cs:4466-4473 钳 [0,3]
    if (clamped === this.quality) return;
    this.quality = clamped;
    this.gates = waveSourceGates(this.quality);
    // 降档/升档横跳时缓冲回到中性（原版档位变化 → 滤镜重激活 → _clearNextFrame）
    this._clear();
  }

  /** 相机态（注入/采样换算共用；Renderer 在实体注入前调用） */
  setCamera(camX: number, camY: number, zoom: number): void {
    this._camX = camX; this._camY = camY; this._zoom = zoom;
  }

  /** 采样系缩放（css px / 世界 px；绘制侧换算位移用） */
  viewZoom(): number { return this._zoom; }

  /** 每渲染帧：Update(:112-129) + PreDraw(:336-360) + 涟漪队列注入。 */
  frame(inp: WaveFrameInput): void {
    this.setCamera(inp.camX, inp.camY, inp.zoom);
    this.intensity = waterDistortionIntensity(
      inp.windAbs, inp.rain, inp.tileX, inp.tileY,
      inp.maxTilesX, inp.maxTilesY, inp.worldSurface, inp.rockLayer);
    this.progress = (this.progress + inp.dt * this.intensity * 0.75) % 86400;

    const w = Math.max(1, Math.ceil(inp.viewW * 0.25));
    const h = Math.max(1, Math.ceil(inp.viewH * 0.25));
    this._ensure(w, h);

    // 相机滚动（缓冲像素 floor；:148-152）——只在第一步施加（lastOffset 在
    // StepLiquids 内更新，第二步增量 0）
    const sx = Math.floor(inp.camX * inp.zoom * 0.25);
    const sy = Math.floor(inp.camY * inp.zoom * 0.25);
    const dx = sx - this._scrollX, dy = sy - this._scrollY;
    this._scrollX = sx; this._scrollY = sy;

    if (this.quality === 0) {
      // 0 档：滤镜整体关闭（SceneState :129）——不注入不步进，缓冲回中性
      this._clear();
      _rqCount = 0;
      this._stepsLast = 0;
      return;
    }

    // 涟漪队列注入（DrawWaves :314-327；实体洗掠已由 Renderer 在 frame 前注入）
    this._drawRipples();

    // 步进（PreDraw :343-349 min(queuedSteps,2)；正常 1 步、掉帧补 2）
    const steps = this.quality >= 2 ? (inp.dt > 1 / 60 + 1 / 240 ? 2 : 1) : 0;
    this._stepsLast = steps;
    if (steps > 0) {
      this._step(dx, dy);
      if (steps > 1) this._step(0, 0);
    } else if (!this._isNeutral()) {
      // q=1：无源不步进（PreDraw :350-358）——脏缓冲清回中性
      this._clear();
    }
  }

  /** 位移采样（FilterWaterDistortion obj19 公式）。
   *  worldX/worldY = 世界 px；out = [dxPx, dyPx]（canvas px，z=1 时=原版屏幕 px）。
   *  ★噪声坐标单位修正(2026-08-20 用户实报"静水自然扰动缺失"定罪)：字节码
   *  obj19 #13-#17 的采样坐标 = 屏幕px/noise尺寸·{0.1,0.2} = 【噪声 UV】(0..1
   *  = 整张贴图)，而 noiseAt 的入参是【texel】。旧实现把 UV 值直接喂 texel 采样
   *  → 全屏落在第 0-1 个 texel 内 = 场恒定 → 静水只剩 ±0.1px 时间漂移抖动。
   *  正确换算：texel = uv·256(贴图边长)，即 px·{0.1,0.2} 与 prog·0.04·256。 */
  sampleDisplace(worldX: number, worldY: number, out: [number, number]): void {
    out[0] = 0; out[1] = 0;
    if (this.quality === 0 || !_noiseData) return;
    const px = (worldX - this._camX) * this._zoom;
    const py = (worldY - this._camY) * this._zoom;
    const u = px / _noiseW, v = py / _noiseH;   // uv = 屏幕px/noise 尺寸（c0）
    const prog = this.progress;
    const d1v = v * 0.1 + prog * 0.04;          // n1 的 v 漂移（X 无漂移）
    // texel 坐标（noiseAt 吃 texel；×贴图边长 256）
    const gx = noiseAt(0, u * 0.1 * _noiseW, d1v * _noiseH) - noiseAt(0, u * 0.2 * _noiseW, (v * 0.2 - prog * 0.04) * _noiseH);
    const gy = noiseAt(1, u * 0.1 * _noiseW, d1v * _noiseH) - noiseAt(1, u * 0.2 * _noiseW, (v * 0.2 - prog * 0.04) * _noiseH);
    // 涟漪高度项：h' = bufR − 0.5（(1−0.4·bufB)=1，1456 bufB=0），钳 ±0.3 取负入 DISPY
    const h = this._readR(px, py);
    const hClamp = Math.min(0.3, Math.max(-0.3, h - 0.5));
    const I = this.intensity;
    const dispx = gx * 0.1 * I;
    const dispy = gy * 0.1 * I - hClamp;
    out[0] = dispx * 0.1 * 32;   // c14.x=0.1 × c5=32/res × res
    out[1] = dispy * 32;         // c14.y=1.0
  }

  /** 波光 tint 量（obj19 :106-111 精确解码，2026-08-25 反汇编订正）：
   *  glint = (0.3·h' + 0.01·|∇n|)·场景亮度·水面掩码·边缘门 ÷ 3。
   *  ★:70-71 rsq+rcp 连用 = 相互抵消 → r0.w = 0.1·|∇(n1−n2)| 正比小项（曾误读
   *  1/|∇n| 焦散项 → 饱和白色带"比之前更严重"用户报；更早版本常数 0.75+正向
   *  梯度 → 地底静水脉动发白）。h' = 波场高（(1−0.4wz) 因子略≈1）；亮度=位移后
   *  场景像素 RGB 和（地底暗→glint→0，lum 由 Renderer 注入 tile 光照均值）；
   *  掩码/边缘门平水面≈1 略。静水 glint≈0.003 不可见=原版语义；大波 h→±0.3
   *  时 ≈0.03·lum 微亮。>0 → 'lighter' 提亮 */
  sampleGlint(worldX: number, worldY: number, lum = 0.75): number {
    if (this.quality === 0 || !_noiseData || lum <= 0.004) return 0;
    const px = (worldX - this._camX) * this._zoom;
    const py = (worldY - this._camY) * this._zoom;
    const u = px / _noiseW, v = py / _noiseH;
    const prog = this.progress;
    const gx = noiseAt(0, (u * 0.1) * _noiseW, (v * 0.1 + prog * 0.04) * _noiseH) - noiseAt(0, (u * 0.2) * _noiseW, (v * 0.2 - prog * 0.04) * _noiseH);
    const gy = noiseAt(1, (u * 0.1) * _noiseW, (v * 0.1 + prog * 0.04) * _noiseH) - noiseAt(1, (u * 0.2) * _noiseW, (v * 0.2 - prog * 0.04) * _noiseH);
    const h = this._readR(px, py) - 0.5;
    return Math.min(1, lum * (0.3 * h + 0.01 * Math.hypot(gx, gy)) * 0.3333);
  }

  /** 实体洗掠注入（WaterDistortionObject obj50 + DrawWaves 调用参数）。
   *  center = 世界中心 px（NPC/玩家已含 −v̂·10 偏移；弹幕为裸 Center）；
   *  quadW/H = 世界 px；flowX/Y = 已归一化流方向；strength = vColor.z。
   *  ★混合模型修正(2026-08-20 字节码+TileBatch 复核)：DrawWaves 的
   *  tileBatch.Begin()(:190) → TileBatch.Begin :220-227 → _spriteBatch.Begin(
   *  Deferred, blendState=null) —— null = XNA SpriteBatch 默认
   *  BlendState.AlphaBlend（非预乘：out.rgb = src.rgb·src.a + dst.rgb·(1−src.a)）。
   *  shader 输出 (s,0,0,s) → R 通道实际沉积 = s·s（旧实现按预乘 (One,InvSrcAlpha)
   *  写 s = 大 ~25× 过强）。 */
  injectWash(centerX: number, centerY: number, quadW: number, quadH: number,
    flowX: number, flowY: number, strength: number): void {
    if (this.quality === 0) return;
    const z = this._zoom;
    const cx = (centerX - this._camX) * z * 0.25;
    const cy = (centerY - this._camY) * z * 0.25;
    const qw = quadW * z * 0.25, qh = quadH * z * 0.25;
    if (qw < 0.1 || qh < 0.1) return;
    const hw = qw * 0.5, hh = qh * 0.5;
    const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(this._gW - 1, Math.ceil(cx + hw));
    const y0 = Math.max(0, Math.floor(cy - hh)), y1 = Math.min(this._gH - 1, Math.ceil(cy + hh));
    const R = this._R, G = this._G, w = this._gW;
    const flowSignedX = flowX - 0.5, flowSignedY = flowY - 0.5;   // vColor.xy − 0.5
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // quad 局部 uv（MagicPixel 1×1 拉伸 → uv = (texel−center)/size + 0.5），再 −0.5
        const uvcX = ((x + 0.5) - cx) / qw - 0.5;
        const uvcY = ((y + 0.5) - cy) / qh - 0.5;
        const s = washShapeValue(uvcX, uvcY, flowSignedX, flowSignedY, strength);
        if (s <= 0) continue;
        const i = y * w + x;
        const inv = 1 - s;              // 非预乘 AlphaBlend：out = src.rgb·a + dst·(1−a)
        R[i] = q256(s * s + R[i] * inv);   // src=(s,0,0,s) → R 沉积 s·s
        G[i] = q256(G[i] * inv);           // src.g=0
      }
    }
  }

  /** 0 档停机（Renderer 早退路径调用；重置步进计数防陈旧读数 + 清缓冲/队列） */
  disable(): void {
    this._clear();
    _rqCount = 0;
    this._stepsLast = 0;
  }

  /** 调试快照（F5 / 探针；activeTexels 全格扫描，勿每帧调） */
  debug(): WaterWaveDebug {
    let active = 0;
    for (let i = 0; i < this._R.length; i++) if (this._R[i] !== 0.5) active++;
    return {
      quality: this.quality, gridW: this._gW, gridH: this._gH,
      progress: this.progress, intensity: this.intensity,
      stepsLastFrame: this._stepsLast, rippleQueueUsed: _rqCount, activeTexels: active,
    };
  }

  private _ensure(w: number, h: number): void {
    if (w === this._gW && h === this._gH) return;
    const n = w * h;
    this._R = new Float32Array(n).fill(0.5);
    this._G = new Float32Array(n).fill(0.5);
    this._R2 = new Float32Array(n).fill(0.5);
    this._G2 = new Float32Array(n).fill(0.5);
    this._gW = w; this._gH = h;
  }

  private _clear(): void {
    this._R.fill(0.5); this._G.fill(0.5);
  }

  private _isNeutral(): boolean {
    const R = this._R;
    for (let i = 0; i < R.length; i++) if (R[i] !== 0.5) return false;
    return true;
  }

  /** 读缓冲 R（屏幕 px → 缓冲 texel 双线性；非 pow2 缓冲 → clamp 采样语义） */
  private _readR(px: number, py: number): number {
    const bx = px * 0.25 - 0.5, by = py * 0.25 - 0.5;
    const x0 = Math.floor(bx), y0 = Math.floor(by);
    const fx = bx - x0, fy = by - y0;
    const w = this._gW, h = this._gH;
    const cl = (v: number, m: number) => Math.min(m - 1, Math.max(0, v));
    const R = this._R;
    const xa = cl(x0, w), xb = cl(x0 + 1, w), ya = cl(y0, h), yb = cl(y0 + 1, h);
    return (R[ya * w + xa] * (1 - fx) + R[ya * w + xb] * fx) * (1 - fy)
      + (R[yb * w + xa] * (1 - fx) + R[yb * w + xb] * fx) * fy;
  }

  /** 涟漪队列光栅化（DrawWaves :314-327；非预乘 AlphaBlend——同 injectWash 复核，
   *  out.rgb = src.rgb·src.a + dst·(1−src.a)，src = shape·WaveData，a = shape·num） */
  private _drawRipples(): void {
    if (!this.gates.ripple || !_rippleData) { _rqCount = 0; return; }
    const z = this._zoom;
    const R = this._R, G = this._G, w = this._gW, h = this._gH;
    for (let q = 0; q < _rqCount; q++) {
      const cx = (_rqX[q] - this._camX) * z * 0.25;
      const cy = (_rqY[q] - this._camY) * z * 0.25;
      const qw = _rqW[q] * z * 0.25, qh = _rqH[q] * z * 0.25;
      if (qw < 0.1 || qh < 0.1) continue;
      const hw = qw * 0.5, hh = qh * 0.5;
      const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(w - 1, Math.ceil(cx + hw));
      const y0 = Math.max(0, Math.floor(cy - hh)), y1 = Math.min(h - 1, Math.ceil(cy + hh));
      const cos = Math.cos(_rqRot[q]), sin = Math.sin(_rqRot[q]);
      const num = _rqA[q], gCol = _rqColG[q], rCol = _rqColR[q];
      const shape = _rqShape[q] as RippleShape;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const lx = ((x + 0.5) - cx) / hw, ly = ((y + 0.5) - cy) / hh;   // ∈ [−1,1]
          const rx = lx * cos - ly * sin, ry = lx * sin + ly * cos;
          if (rx < -1 || rx > 1 || ry < -1 || ry > 1) continue;
          const shapeV = rippleShape(shape, (rx + 1) * 0.5, (ry + 1) * 0.5);
          if (shapeV <= 0) continue;
          const a = shapeV * num;
          const inv = 1 - a;
          const i = y * w + x;
          R[i] = q256(shapeV * rCol * a + R[i] * inv);   // 非预乘:src.rgb·a（unorm8 量化）
          G[i] = q256(shapeV * gCol * a + G[i] * inv);
        }
      }
    }
    _rqCount = 0;
  }

  /** WaterProcessor 一步（滚动增量 dx/dy 施加在采样侧 = 原版把旧缓冲按位移增量
   *  画进清空 swap 的语义；越界 clamp = RenderTarget Clamp 采样） */
  private _step(dx: number, dy: number): void {
    const w = this._gW, h = this._gH;
    const R = this._R, G = this._G, R2 = this._R2, G2 = this._G2;
    for (let y = 0; y < h; y++) {
      const sy0 = y - dy;
      const yU = Math.min(h - 1, Math.max(0, sy0 - 1));   // 上邻（uv y 向下）
      const yM = Math.min(h - 1, Math.max(0, sy0));
      const yD = Math.min(h - 1, Math.max(0, sy0 + 1));
      const rowM = yM * w, rowU = yU * w, rowD = yD * w;
      for (let x = 0; x < w; x++) {
        const sx0 = x - dx;
        const xL = Math.min(w - 1, Math.max(0, sx0 - 1));
        const xM = Math.min(w - 1, Math.max(0, sx0));
        const xR = Math.min(w - 1, Math.max(0, sx0 + 1));
        // 内联 waveProcessorStep（热循环零分配；公式+双重量化见纯函数版）
        const c = R[rowM + xM], cg = G[rowM + xM];
        const signedC = 2 * c - 1;
        const S = (2 * R[rowM + xL] - 1) + (2 * R[rowM + xR] - 1)
          + (2 * R[rowU + xM] - 1) + (2 * R[rowD + xM] - 1);
        const wv = (cg - 0.5) * (10 / 3);
        const newH = (signedC + 2 * (S * 0.25 - signedC) + wv * Math.abs(wv)) * WATER_DAMP;
        const i = y * w + x;
        const q = Math.round(512 * (newH * 0.5 + 0.5));
        let rq = Math.round((q < 0 ? 0 : q > 512 ? 1 : q / 512) * 256);
        if (rq < 0) rq = 0; else if (rq > 256) rq = 256;
        R2[i] = rq / 256;
        const dv = newH - signedC;
        let gq = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256);
        if (gq < 0) gq = 0; else if (gq > 256) gq = 256;
        G2[i] = gq / 256;
      }
    }
    this._R = R2; this._G = G2; this._R2 = R; this._G2 = G;
  }

  /** 测试/探针用：直接读内部格（encoded R） */
  readGridR(): Float32Array { return this._R; }
  readGridG(): Float32Array { return this._G; }
  gridW(): number { return this._gW; }
  gridH(): number { return this._gH; }
  /** 测试用：重置到干净态 */
  resetForTest(): void {
    this._gW = 0; this._gH = 0;
    this.progress = 0; this._scrollX = 0; this._scrollY = 0;
    this.quality = -1;          // 使后续 setQuality 必经换档路径（重算 gates）
    _rqCount = 0;
  }
}

export const waterWaves = new WaterWaveSystem();

// ---- 实体注入采集（Renderer 调；纯数据防实体类循环导入）----
export interface WaveEntitySample {
  kind: 'npc' | 'townnpc' | 'player' | 'projectile' | 'gore';
  x: number; y: number; w: number; h: number;     // 左上 + 尺寸（世界 px）
  vx: number; vy: number;
  wet: boolean; wetCount: number;
  honeyWet: boolean; lavaWet: boolean;
  /** NPC 视觉旋转（洗掠流方向 RotatedBy(−rotation) 用；默认 0） */
  rotation?: number;
  /** 弹幕侧预筛：CanDistortWater[type] && !NoLiquidDistortion[type] &&（wet ||
   *  ignoreWater 现场复查）——调用方算好放 projDistort && wet */
  projDistort?: boolean;
}

/** NPC 洗掠参数（DrawWaves :200-217 纯函数部分）。
 *  out[0] = vColor.z（=0.5·num），out[1]/out[2] = 流方向 xy（normalize(vel/(h,w))，
 *  再 +0.5 编码进色）。ovx/ovy = 上一 tick 速度（|vel−oldVel|·0.5 项）。 */
const _npcOut = [0, 0, 0];
export function npcWashParams(
  vx: number, vy: number, ovx: number, ovy: number,
  w: number, h: number, rotation: number, viscous: boolean, honeyOrLava: boolean,
): [number, number, number] {
  // vector5 = velocity.RotatedBy(−rotation) / (h, w)（:202——注意除的是 (height,width)）
  const cos = Math.cos(-rotation), sin = Math.sin(-rotation);
  const rx = (vx * cos - vy * sin) / h;
  const ry = (vx * sin + vy * cos) / w;
  let num = rx * rx + ry * ry;
  num = num * 0.3 + 0.7 * num * (1024 / (h * w));
  num = Math.min(num, 0.08);
  num += Math.hypot(vx - ovx, vy - ovy) * 0.5;
  if (!viscous && honeyOrLava) num *= 0.3;
  const len = Math.hypot(rx, ry);
  const fl = len > 0 ? 1 / len : 0;
  _npcOut[0] = 0.5 * num;
  _npcOut[1] = (len > 0 ? rx * fl : 0) * 0.5 + 0.5;   // vColor.x = vector5.X·0.5+0.5
  _npcOut[2] = (len > 0 ? ry * fl : 0) * 0.5 + 0.5;   // vColor.y
  return _npcOut as [number, number, number];
}

/** NPC 涟漪强度（:219-222）：num = 0.195·√|vel| */
export function npcRippleStrength(velLen: number): number {
  return 0.195 * Math.sqrt(velLen);
}

/** 上一 tick 速度缓存（|vel−oldVel| 项；WeakMap 每实体一槽） */
const _oldVel = new WeakMap<object, [number, number]>();

/** 采集一个实体并注入（Renderer 逐实体调用；档位门在此把守） */
export function injectEntity(e: WaveEntitySample, camX: number, camY: number,
  viewW: number, viewH: number, zoom: number): void {
  const gates = waterWaves.gates;
  if (waterWaves.quality === 0) return;
  // 屏幕盒剔除（:196 Collision.CheckAABBvAABBCollision：屏矩形 vs 实体盒 ±16px）
  const sx = (e.x - camX) * zoom, sy = (e.y - camY) * zoom;
  const sw = e.w * zoom, sh = e.h * zoom;
  if (sx + sw < -16 || sy + sh < -16 || sx > viewW + 16 || sy > viewH + 16) return;

  const velLen = Math.hypot(e.vx, e.vy);
  const vnx = velLen > 0 ? e.vx / velLen : 0;
  const vny = velLen > 0 ? e.vy / velLen : 0;
  const viscous = gates.viscosity;
  const cx0 = e.x + e.w / 2, cy0 = e.y + e.h / 2;

  if (e.kind === 'npc' || e.kind === 'townnpc') {
    // NPC（恒开，:192-230）
    const key = e as unknown as object;
    const ov = _oldVel.get(key);
    const [b, fx, fy] = npcWashParams(e.vx, e.vy, ov ? ov[0] : e.vx, ov ? ov[1] : e.vy,
      e.w, e.h, e.rotation ?? 0, viscous, e.honeyWet || e.lavaWet);
    if (ov) { ov[0] = e.vx; ov[1] = e.vy; } else _oldVel.set(key, [e.vx, e.vy]);
    if (e.wet) {
      // quad @ Center − v̂·10（:201/:210），流方向 = vColor.xy（含 +0.5 编码）
      waterWaves.injectWash(cx0 - vnx * 10, cy0 - vny * 10, e.w * 2, e.h * 2, fx, fy, b);
    }
    if (e.wetCount !== 0) {
      // raw Color 重载（:228）：Color(0.5, (wet?num:−num)·0.5+0.5, 0,1)×0.5
      const n2 = npcRippleStrength(velLen);
      const g = ((e.wet ? n2 : -n2) * 0.5 + 0.5) * 0.5;
      const k = Math.min(1, Math.max(0, n2 * 10));
      queueRippleRaw(cx0 + vnx * (e.wet ? 5 : -20), cy0 + vny * (e.wet ? 5 : -20),
        e.w * k, e.h * (e.wetCount / 9) * k, 0.25, g, 0.5, RippleShape.Circle, 0);
    }
    return;
  }

  if (e.kind === 'player') {
    if (!gates.player) return;
    // :242-263：num3 = 0.05·√|vel|；quad @ Center − v̂·10；流方向 = v̂（+0.5 编码）
    let num3 = 0.05 * Math.sqrt(velLen);
    if (!viscous && (e.honeyWet || e.lavaWet)) num3 *= 0.3;
    if (e.wet) {
      waterWaves.injectWash(cx0 - vnx * 10, cy0 - vny * 10, e.w * 2, e.h * 2,
        vnx * 0.5 + 0.5, vny * 0.5 + 0.5, 0.5 * num3);
    }
    if (e.wetCount !== 0) {
      // (strength,size) 重载（:263）：num3 ×= 3 → s3；尺寸 (w, h·wetCount/9)·clamp(s3·10)
      const s3 = num3 * 3;
      const k = Math.min(1, Math.max(0, s3 * 10));
      queueRippleSized(cx0 + vnx * (e.wet ? 5 : -20), cy0 + vny * (e.wet ? 5 : -20),
        e.wet ? s3 : -s3, e.w * k, e.h * (e.wetCount / 9) * k, RippleShape.Circle, 0);
    }
    return;
  }

  if (e.kind === 'projectile') {
    if (!gates.projectile || !e.projDistort || !e.wet) return;
    // :299-310：quad @ Center（无 −v̂·10）；num6 = 2·√(0.05·|vel|)
    let num6 = 2 * Math.sqrt(0.05 * velLen);
    if (!viscous && (e.honeyWet || e.lavaWet)) num6 *= 0.3;
    waterWaves.injectWash(cx0, cy0, Math.max(12, e.w * 0.75), Math.max(12, e.h * 0.75),
      vnx * 0.5 + 0.5, vny * 0.5 + 0.5, num6 * 0.5);
    return;
  }

  if (e.kind === 'gore' && gates.ripple) {
    // Gore.cs:986：落水帧 QueueRipple(pos+8, 8)（默认强度 1；落水沿由调用方把守）
    queueRipple(e.x + 8, e.y + 8, 1, RippleShape.Square, 0);
  }
}
