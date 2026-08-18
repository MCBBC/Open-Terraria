// 原版 1.4.4+ 水面波动模拟（Water Waves）+ 浪质量四档（Wave Quality）1:1 移植。
//
// 【原版机制考古（全部带行号）】
// · 设置：Main.cs:405 `public static int WaveQuality = 3;`（默认 3=高）；
//   持久化 Main.cs:4215 Put("WaveQuality") / :4465 Get + :4466-4473 钳 [0,3]；
//   UI 行 IngameOptions.cs:1040-1055（`(WaveQuality + 1) % 4` 四档循环：
//   0=关 1=低 2=中 3=高，GameUI.WaveQuality + GameUI.QualityOff/Low/Medium/High）。
// · 档位门（WaterShaderData.cs:114-118 Update）：
//     >=3 → _useViscosityFilter + _useProjectileWaves（弹幕波）
//     >=2 → _usePlayerWaves + _useRippleWaves + _useCustomWaves（玩家/涟漪/自定义）
//     恒开 → _useNPCWaves（NPC 波不受档位控制，:79/:192）
//   SceneState.cs:129 ManageSpecialBiomeVisuals("WaterDistortion", WaveQuality > 0)
//   —— 0 档整个滤镜关闭（连环境噪声波都没有）；1 档只有噪声环境波无涟漪源。
// · 步进节奏：Update :119-128（_progress += dt·Intensity·0.75 模 86400；任一
//   q≥2 源开启时 _queuedSteps++）；PreDraw :336-360 每帧消费 min(queuedSteps,2)
//   步（渲染跳帧时补 2 步）——q<2 无源时不步进（缓冲静默清零）。
// · 波场缓冲（WaterShaderData）：DISTORTION_BUFFER_SCALE=0.25（:47）屏幕 1/4
//   分辨率双缓冲 ping-pong（:138-158 StepLiquids）；中性值 R=G=0.5（清色
//   :141/:146）；随相机滚动（:148-152 相机位移增量 floor 到缓冲像素）。
// · 传播内核 = 编译像素着色器 "WaterProcessor"（DyeInitializer.cs:427 注册），
//   C# 反编译无 HLSL —— 本模块数学由 tools/disasm-fx.mjs 反汇编
//   terraria-assets/PixelShader.cso obj49（ps_2_0 字节码）逐指令复原：
//     S      = Σ(2·N.R − 1)（四邻，含末尾补的第 4 个 −1 = c3.y）
//     T      = (S·0.25 − (2C.R−1)) · (1 − C.B)
//     w      = (C.G − 0.5)·(10/3)；H = (2C.R−1) + 2T + w·|w|
//     newH   = H · exp2(−0.0551416·(1 − C.B))
//     outR   = clamp01(round512(newH·0.5 + 0.5))   ← unorm 8bit + 1/512 量化
//     dv     = (1 − 0.05·C.B)·(newH − (2C.R−1))
//     outG   = clamp01(0.5 + 0.3·sign(dv)·√|dv|)   ← 速度 √ 压缩编码
//     outB   = 0（黏度每步被清零，由波掩码重画——见下）
//   ★(G−0.5)/0.3 与 0.3·sign·√|dv| 互逆（w·|w| ≡ dv）——实为速度 Verlet 形式
//   波动方程；√ 编码只是精度压缩。unorm 钳制（强涟漪把高度打满 1.0）是动力学的
//   一部分，必须保留。
// · 黏度通道 B：LiquidRenderer 波掩码（LiquidRenderer.cs:110 WAVE_MASK_STRENGTH、
//   :529-548 写 R=G=A=strength/2、B=VISCOSITY_MASK）。**1.4.5.6 的
//   WAVE_MASK_STRENGTH 是 `new byte[5]` 全零、全工程无赋值**（1405 为
//   {0,0,0,255,0}）→ 掩码 alpha 恒 0 = 重画是 no-op → B 通道恒 0 = 黏度分化
//   已死（本仓 VanillaLiquidRenderer.ts P4 注释同一结论）。故本移植 B 不建
//   模：damp 恒 exp2(−0.0551416)、(1−B)=1；:211/:247/:304 的
//   `!_useViscosityFilter && (honeyWet||lavaWet) → 强度×0.3` 补偿仍按档位保留。
// · 实体注入（WaterShaderData.DrawWaves :181-334，本模块 injectWash/injectRipple）：
//   湿身拖尾 = "WaterDistortionObject" 着色器（PixelShader.cso obj50 复原）：
//     radial = normalize(uv−0.5)；flow = normalize(vColor.xy−0.5)
//     r = |uv−0.5|·25.12；r≥4π 时 φ=−0.00637 否则 φ=wrap(r/2π)
//     s = vColor.z · max(dot(−flow,radial)−0.2, 0) · min(sin φ, 0)
//     输出 (s,0,0,s)，预乘 AlphaBlend：out = src + dst·(1−a)
//   NPC（:192-230）：num = |vel/(h,w)|²·(0.3+0.7·1024/(h·w)) 钳 0.08 +
//   |vel−oldVel|·0.5；quad (2w,2h)@center−v̂·10；wetCount≠0 涟漪强度
//   0.195·√|vel|、尺寸 (w, h·wetCount/9)·clamp(num·10,0,1)、Circle。
//   玩家（:232-265，q≥2）：num = 0.05·√|vel|（涟漪 ×3）；同构。
//   弹幕（:267-311，q≥3）：CanDistortWater（ProjectileID.cs:195 默认 true，
//   例外 7,8,150,151,152,493,494）&& !NoLiquidDistortion（:333 {511,512,513}）
//   && wet；num = 2·√(0.05·|vel|)；quad (max(12,0.75w), max(12,0.75h))。
//   涟漪队列（:314-327/446-470）：上限 200；QueueRipple(pos,strength) 色
//   (0.5, s·0.5+0.5, 0)·min(|s|,1)、尺寸 4·max(|s|,1)；!_useRippleWaves 时
//   入队即清空全队列（:462-465）。形状贴图 Images/Misc/Ripples（64×128：
//   Square=(1,1,62,62) 纯白方 / Circle=(1,65,62,62) 硬边圆，实测像素）。
//   外部涟漪源：Gore.cs:986（血块落水 QueueRipple(pos+8,8) 默认强度 1）、
//   Projectile.cs:30674（水枪尾迹）、FakeFishParticle.cs:184（假鱼脉冲——
//   本仓无假鱼系统，不移植）。
// · 消费端 = "FilterWaterDistortion"（ScreenShader.cso obj19 复原）：
//   uIntensity 由 SceneState.cs:159-173 动态计算：
//     num  = maxTilesX/2 − |tileX − maxTilesX/2|（离世界边 tile 距）
//     I    = 1 + |wind|·1.25 + clamp(rain,0,1)·1.25 − (clamp((num−380)/100,0,1)·0.5 − 0.25)
//     num6 = 1 − clamp(3·(tileY−worldSurface)/(rockLayer−worldSurface), 0, 1)
//     I   *= num6；I += 0.9 − clamp((maxTilesY−tileY−200)/300,0,1)·0.9 + (1−num6)·0.75；钳 [0,2.5]
//   位移场（:44-104）：n1 = noise(uv·0.1 + (0,prog·0.04))、n2 = noise(uv·0.2 −
//   (0,prog·0.04))（uv = 屏幕px/noise尺寸，LinearWrap）；grad = n1.xy − n2.xy；
//   h' = (bufR − 0.5)·(1 − 0.4·bufB)（1456 bufB=0）；DISPY = grad.y·0.1·I −
//   clamp(h',−0.3,0.3)；DISPX = grad.x·0.1·I；屏幕像素位移 = (0.1·32·DISPX,
//   32·DISPY)（c14/c5 链，uOpacity=1）。X 位移只含噪声（涟漪只垂直推——
//   原版水面涟漪是"上下起伏"）。水体内部 lerp 权重 20%（(αA+αB)·0.1 钳 1，
//   :89-97）+ 边缘全权重（α 差门控）→ 本移植取"表层全权重/内部 0.2"分档。
//   波光 tint（:106-111）：mask·waterA·(0.3·h' + |grad|)·(r+g+b)/3 加色提亮。
// 【Canvas2D 取舍（非静默近似，逐条登记）】
// · 原版 Filter 是全屏 pass：位移采样的是【合成后屏幕】，水体边缘处把位移后
//   的屏幕内容混入（水线两侧一起扭）。Canvas2D 无屏幕纹理——本移植把位移施加
//   在【液体绘制侧】：表层格水线随 dy 升降 + 纹样横移 dx，水线以下的背景不扭。
// · 内部 20% 权重纹样位移 ≤0.3px（噪声环境波量级），视觉不可辨——不施加。
// · 波光 tint 的 (r+g+b) 为屏幕实际亮度，此处以固定 0.75 亮度近似（亮处波光
//   略强、暗处略弱，幅度差 <2%）。

/** 档位门（WaterShaderData.cs:114-118）。q: 0..3 */
export function waveSourceGates(q: number): {
  /** NPC 波（恒开，:79） */
  npc: boolean; player: boolean; ripple: boolean; custom: boolean; projectile: boolean; viscosity: boolean;
} {
  return {
    npc: true,
    player: q >= 2,
    ripple: q >= 2,
    custom: q >= 2,
    projectile: q >= 3,
    viscosity: q >= 3,   // 1456 掩码 no-op，仅剩注入 ×0.3 补偿语义
  };
}

/** WaterProcessor 传播内核（纯函数；encoded R/G ∈ [0,1]，B 恒 0 见头部注释）。
 *  返回 [outR, outG]。金标同参数同输出。 */
export function waveProcessorStep(
  L: number, R: number, U: number, D: number, C: number, Cg: number,
): [number, number] {
  const signedC = 2 * C - 1;
  const S = (2 * L - 1) + (2 * R - 1) + (2 * U - 1) + (2 * D - 1);
  const T = (S * 0.25 - signedC);                      // (1−B)=1（1456）
  const w = (Cg - 0.5) * (10 / 3);
  const H = signedC + 2 * T + w * Math.abs(w);
  const newH = H * WATER_DAMP;
  // unorm + 1/512 量化：floor(512·enc + 0.5)/512（round-half-up），钳 [0,1]
  const outR = Math.min(1, Math.max(0, Math.round(512 * (newH * 0.5 + 0.5)) / 512));
  const dv = newH - signedC;                           // (1−0.05B)=1
  const outG = Math.min(1, Math.max(0, 0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))));
  return [outR, outG];
}

/** damp = exp2(−0.0551416)（c2.x，(1−B)=1 恒定） */
export const WATER_DAMP = Math.pow(2, -0.0551416);

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
 *  uvC = quad 局部 uv − 0.5；flowSigned = vColor.xy − 0.5；strength = vColor.z。 */
export function washShapeValue(
  uvcx: number, uvcy: number, flowX: number, flowY: number, strength: number,
): number {
  const rlen = Math.hypot(uvcx, uvcy);
  if (rlen === 0) return 0;
  const radx = uvcx / rlen, rady = uvcy / rlen;            // normalize(radial)
  const flen = Math.hypot(flowX, flowY);
  if (flen === 0) return 0;
  const fx = flowX / flen, fy = flowY / flen;              // normalize(flow)
  const r = rlen * 25.12;                                   // c0.w
  const dotTerm = Math.max(-fx * radx - fy * rady - 0.2, 0);
  let phi: number;
  if (r >= 12.56) {                                         // ≥ 4π → 恒小负角
    phi = -0.00637111;
  } else {
    const frac = (r * 0.159155 + 0.5) % 1;                  // r/2π + 0.5 → frac
    phi = frac * 6.28319 - 3.14159;                         // ·2π − π
  }
  const sinPhi = Math.sin(phi);
  return strength * dotTerm * (sinPhi >= 0 ? 0 : -sinPhi);  // min(sin,0) 取负半波
}

/** 涟漪形状槽（RippleShape.cs enum + RIPPLE_SHAPE_SOURCE_RECTS :18-23） */
export const enum RippleShape { None = 0, Square = 1, Circle = 2 }

// ---- 涟漪队列（200 上限，:51/:69）----
const MAX_RIPPLES = 200;
const _rqX = new Float64Array(MAX_RIPPLES);
const _rqY = new Float64Array(MAX_RIPPLES);
const _rqW = new Float64Array(MAX_RIPPLES);
const _rqH = new Float64Array(MAX_RIPPLES);
const _rqG = new Float64Array(MAX_RIPPLES);   // 已编码的 waveData.rgb（0.5num, g·num, 0）之 G 分量与 R 分量
const _rqR = new Float64Array(MAX_RIPPLES);
const _rqA = new Float64Array(MAX_RIPPLES);   // num（alpha）
const _rqRot = new Float64Array(MAX_RIPPLES);
const _rqShape = new Uint8Array(MAX_RIPPLES);
let _rqCount = 0;

/** QueueRipple(pos, strength=1, shape=Square, rotation=0)（:446-451）。
 *  色 (0.5, s·0.5+0.5, 0)·min(|s|,1)、尺寸 4·max(|s|,1)。 */
export function queueRipple(x: number, y: number, strength = 1, shape = RippleShape.Square, rotation = 0): void {
  const g = strength * 0.5 + 0.5;
  const num = Math.min(Math.abs(strength), 1);
  queueRippleRaw(x, y, 4 * Math.max(Math.abs(strength), 1), 4 * Math.max(Math.abs(strength), 1),
    0.5 * num, g * num, num, shape, rotation);
}

/** QueueRipple(pos, strength, size, shape, rotation)（:453-458） */
export function queueRippleSized(x: number, y: number, strength: number, sx: number, sy: number,
  shape = RippleShape.Square, rotation = 0): void {
  const g = strength * 0.5 + 0.5;
  const num = Math.min(Math.abs(strength), 1);
  queueRippleRaw(x, y, sx, sy, 0.5 * num, g * num, num, shape, rotation);
}

/** QueueRipple(pos, Color waveData, size, shape, rotation)（:460-470）。
 *  !ripple 档入队 = 清空整个队列（:462-465 原版语义）。 */
export function queueRippleRaw(
  x: number, y: number, sx: number, sy: number,
  colR: number, colG: number, colA: number, shape: RippleShape, rotation: number,
): void {
  if (!waterWaves.gates.ripple) { _rqCount = 0; return; }
  if (_rqCount >= MAX_RIPPLES) return;
  _rqX[_rqCount] = x; _rqY[_rqCount] = y;
  _rqW[_rqCount] = sx; _rqH[_rqCount] = sy;
  _rqR[_rqCount] = colR; _rqG[_rqCount] = colG; _rqA[_rqCount] = colA;
  _rqRot[_rqCount] = rotation; _rqShape[_rqCount] = shape;
  _rqCount++;
}

// ---- 纹理数据（noise 256×256 RGB / Ripples 64×128 灰度，懒提取一次）----
let _noiseData: Uint8ClampedArray | null = null;
let _noiseW = 0, _noiseH = 0;
let _rippleData: Uint8ClampedArray | null = null;

/** 供测试/探针注入预提取的贴图像素（游戏侧由 atlas 提取后 set） */
export function setWaveTextures(noise: { w: number; h: number; data: Uint8ClampedArray } | null,
  ripple: { data: Uint8ClampedArray } | null): void {
  if (noise) { _noiseData = noise.data; _noiseW = noise.w; _noiseH = noise.h; }
  if (ripple) _rippleData = ripple.data;
}

/** noise 双线性 + wrap 采样（原版 LinearWrap，pow2 256）单通道 */
function noiseAt(ch: number, u: number, v: number): number {
  if (!_noiseData) return 0.5;
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const fx = u - x0, fy = v - y0;
  const w = _noiseW, h = _noiseH;
  const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
  const xa = ((x0 % w) + w) % w, ya = ((y0 % h) + h) % h;
  const d = _noiseData;
  const i00 = (ya * w + xa) * 4 + ch, i10 = (ya * w + x1) * 4 + ch;
  const i01 = (y1 * w + xa) * 4 + ch, i11 = (y1 * w + x1) * 4 + ch;
  return (d[i00] * (1 - fx) + d[i10] * fx) * (1 - fy) / 255
    + (d[i01] * (1 - fx) + d[i11] * fx) * fy / 255;
}

/** Ripples 形状采样（64×128 灰度；square 槽 (1,1,62,62) 纯白 / circle (1,65,62,62)）。
 *  返回 [0,1] 形状强度（灰度值/255；alpha 全 255 实测，用 RGB）。 */
function rippleShape(shape: RippleShape, u: number, v: number): number {
  if (!_rippleData || shape === RippleShape.None) return 0;
  const src = shape === RippleShape.Circle ? { x: 1, y: 65 } : { x: 1, y: 1 };
  let px = src.x + u * 62, py = src.y + v * 62;
  px = Math.min(63, Math.max(0, px)); py = Math.min(127, Math.max(0, py));
  return _rippleData[((py | 0) * 64 + (px | 0)) * 4] / 255;
}

// ---- 波场系统 ----
export interface WaveFrameInput {
  /** 相机可视左上（世界 px）与缩放 */
  camX: number; camY: number; zoom: number;
  viewW: number; viewH: number;
  /** 玩家中心 tile（强度公式用） */
  tileX: number; tileY: number;
  maxTilesX: number; maxTilesY: number;
  worldSurface: number; rockLayer: number;
  windAbs: number; rain: number;
  /** 本帧真实流逝秒（progress/步进节奏） */
  dt: number;
}

/** 调试/探针快照 */
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
  private _R: Float32Array = new Float32Array(0);
  private _G: Float32Array = new Float32Array(0);
  private _R2: Float32Array = new Float32Array(0);
  private _G2: Float32Array = new Float32Array(0);
  /** 相机滚动偏移（缓冲像素，floor；:151-152 _lastDistortionDrawOffset） */
  private _scrollX = 0; private _scrollY = 0;
  private _stepsLast = 0;
  debugActiveTexels = 0;

  setQuality(q: number): void {
    // Main.cs:4466-4473 钳 [0,3]
    this.quality = Math.min(3, Math.max(0, q));
    this.gates = waveSourceGates(this.quality);
  }

  /** 每渲染帧：Update(:112-129) + PreDraw(:336-360) + DrawWaves 注入。 */
  frame(inp: WaveFrameInput): void {
    const gates = this.gates;
    // 强度（SceneState.cs:159-173）+ progress（:121 ×0.75 模 86400）
    this.intensity = waterDistortionIntensity(
      inp.windAbs, inp.rain, inp.tileX, inp.tileY,
      inp.maxTilesX, inp.maxTilesY, inp.worldSurface, inp.rockLayer);
    this.progress = (this.progress + inp.dt * this.intensity * 0.75) % 86400;

    const w = Math.max(1, Math.ceil(inp.viewW * 0.25));
    const h = Math.max(1, Math.ceil(inp.viewH * 0.25));
    this._ensure(w, h);

    // 相机滚动（缓冲像素 floor；0.25 缩放 × zoom）
    const sx = Math.floor(inp.camX * inp.zoom * 0.25);
    const sy = Math.floor(inp.camY * inp.zoom * 0.25);
    const dx = sx - this._scrollX, dy = sy - this._scrollY;
    this._scrollX = sx; this._scrollY = sy;

    if (this.quality === 0) {
      // 0 档：滤镜关闭（SceneState :129）——不步进、注入全弃；缓冲回中性
      this._clear();
      _rqCount = 0;
      this._stepsLast = 0;
      return;
    }

    // 注入（DrawWaves :181-334 → 注入进当前缓冲，传播内核随后整体处理）
    this._drawRipples();

    // 步进：正常 1 步；掉帧补 2 步（PreDraw min(queuedSteps,2)，dt>1/60 → 2）
    const steps = this.quality >= 2 ? (inp.dt > 1 / 60 + 1 / 240 ? 2 : 1) : 0;
    this._stepsLast = steps;
    for (let s = 0; s < steps; s++) this._step(dx, dy);
    if (steps === 0) {
      // q=1：无源不步进（PreDraw :350-358 脏缓冲清回中性）——涟漪注入也不会发生
      // （gates.ripple=false 已在入队时清队列），保持一次清零语义
      if (!this._isNeutral()) this._clear();
    }
  }

  /** 位移采样（FilterWaterDistortion obj19 公式）。
   *  worldX/worldY = 世界 px；out = [dxPx, dyPx]（屏幕 px，含 ±号）。 */
  sampleDisplace(worldX: number, worldY: number, out: [number, number]): void {
    out[0] = 0; out[1] = 0;
    if (this.quality === 0 || !_noiseData) return;
    const z = this._zoom;
    const px = (worldX - this._camX) * z;
    const py = (worldY - this._camY) * z;
    // uv = 屏幕 px / noise 尺寸（c0 = 1/uImageSize1）
    const u = px / _noiseW, v = py / _noiseH;
    const prog = this.progress;
    const n1x = noiseAt(0, u * 0.1, v * 0.1 + prog * 0.04);
    const n1y = noiseAt(1, u * 0.1, v * 0.1 + prog * 0.04);
    const n2x = noiseAt(0, u * 0.2, v * 0.2 - prog * 0.04);
    const n2y = noiseAt(1, u * 0.2, v * 0.2 - prog * 0.04);
    const gx = n1x - n2x, gy = n1y - n2y;
    // 涟漪高度项：h' = bufR − 0.5（(1−0.4·bufB)=1，1456 bufB=0），钳 ±0.3 取负
    const h = this._readR(px, py);
    const hClamp = Math.min(0.3, Math.max(-0.3, h - 0.5));
    const I = this.intensity;
    const dispx = gx * 0.1 * I;
    const dispy = gy * 0.1 * I - hClamp;
    out[0] = dispx * 0.1 * 32;   // c14.x=0.1 × c5=32/res × res
    out[1] = dispy * 32;         // c14.y=1.0
  }

  /** 波光 tint 量（obj19 :106-111 近似：lum 取 0.75，见头部取舍）。>0 需 'lighter' 提亮 */
  sampleGlint(worldX: number, worldY: number): number {
    if (this.quality === 0 || !_noiseData) return 0;
    const z = this._zoom;
    const px = (worldX - this._camX) * z;
    const py = (worldY - this._camY) * z;
    const u = px / _noiseW, v = py / _noiseH;
    const prog = this.progress;
    const gx = noiseAt(0, u * 0.1, v * 0.1 + prog * 0.04) - noiseAt(0, u * 0.2, v * 0.2 - prog * 0.04);
    const gy = noiseAt(1, u * 0.1, v * 0.1 + prog * 0.04) - noiseAt(1, u * 0.2, v * 0.2 - prog * 0.04);
    const h = this._readR(px, py) - 0.5;
    return Math.min(1, Math.abs(0.3 * h + Math.hypot(gx, gy)) * 0.75 * 0.3333);
  }

  /** 实体洗掠注入（DrawWaves NPC/玩家/弹幕 + WaterDistortionObject obj50）。
   *  center = 世界中心 px；quadW/H = 世界 px（C# 已 ×2 或 ×0.75 族）；
   *  flowX/Y = 已归一化速度向；strength = vColor.z；仅 q 门由调用方把守。 */
  injectWash(centerX: number, centerY: number, quadW: number, quadH: number,
    flowX: number, flowY: number, strength: number): void {
    if (this.quality === 0) return;
    const z = this._zoom;
    // 缓冲像素坐标：center − v̂·10 已由调用方算进 centerX/Y（此处收最终中心）
    const cx = (centerX - this._camX) * z * 0.25;
    const cy = (centerY - this._camY) * z * 0.25;
    const hw = quadW * z * 0.25 * 0.5, hh = quadH * z * 0.25 * 0.5;
    if (hw < 0.05 || hh < 0.05) return;
    const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(this._gW - 1, Math.ceil(cx + hw));
    const y0 = Math.max(0, Math.floor(cy - hh)), y1 = Math.min(this._gH - 1, Math.ceil(cy + hh));
    const R = this._R, G = this._G;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // quad 局部 uv（MagicPixel 1×1 拉伸 → uv = (texel − center)/size + 0.5）
        const uvcx = ((x + 0.5) - cx) / (hw * 2) * 0.5;
        const uvcy = ((y + 0.5) - cy) / (hh * 2) * 0.5;
        const s = washShapeValue(uvcx, uvcy, flowX, flowY, strength);
        if (s <= 0) continue;
        const i = y * this._gW + x;
        // 预乘 AlphaBlend：out = src.rgb + dst·(1−src.a)，src=(s,0,0,s)
        const inv = 1 - s;
        R[i] = s + R[i] * inv;
        G[i] = G[i] * inv;
      }
    }
  }

  /** 调试快照（F5 DebugReport / 探针） */
  debug(): WaterWaveDebug {
    let active = 0;
    for (let i = 0; i < this._R.length; i++) if (this._R[i] !== 0.5) active++;
    return {
      quality: this.quality, gridW: this._gW, gridH: this._gH,
      progress: this.progress, intensity: this.intensity,
      stepsLastFrame: this._stepsLast, rippleQueueUsed: _rqCount, activeTexels: active,
    };
  }

  // ---- 内部 ----
  private _camX = 0; private _camY = 0; private _zoom = 1;

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

  /** 读缓冲 R（屏幕 px → 缓冲 texel，双线性；FilterWaterDistortion 采样 s2 用
   *  LinearWrap——非 pow2 → AnisotropicClamp，取 clamp 语义） */
  private _readR(px: number, py: number): number {
    const bx = px * 0.25 - 0.5, by = py * 0.25 - 0.5;
    const x0 = Math.floor(bx), y0 = Math.floor(by);
    const fx = bx - x0, fy = by - y0;
    const w = this._gW, h = this._gH;
    const cl = (v: number, m: number) => Math.min(m - 1, Math.max(0, v));
    const R = this._R;
    const xa = cl(x0), xb = cl(x0 + 1), ya = cl(y0), yb = cl(y0 + 1);
    const v00 = R[ya * w + xa], v10 = R[ya * w + xb];
    const v01 = R[yb * w + xa], v11 = R[yb * w + xb];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  }

  /** 涟漪队列光栅化（DrawWaves :314-327；预乘 AlphaBlend，色 (0.5num, g·num, 0)·num） */
  private _drawRipples(): void {
    if (!this.gates.ripple) { _rqCount = 0; return; }
    if (!_rippleData) { _rqCount = 0; return; }
    const z = this._zoom;
    const R = this._R, G = this._G, w = this._gW, h = this._gH;
    for (let q = 0; q < _rqCount; q++) {
      const cx = (_rqX[q] - this._camX) * z * 0.25;
      const cy = (_rqY[q] - this._camY) * z * 0.25;
      const hw = _rqW[q] * z * 0.25 * 0.5, hh = _rqH[q] * z * 0.25 * 0.5;
      if (hw < 0.05 || hh < 0.05) { continue; }
      const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(w - 1, Math.ceil(cx + hw));
      const y0 = Math.max(0, Math.floor(cy - hh)), y1 = Math.min(h - 1, Math.ceil(cy + hh));
      const cos = Math.cos(_rqRot[q]), sin = Math.sin(_rqRot[q]);
      const num = _rqA[q], gCol = _rqG[q], rCol = _rqR[q], shape = _rqShape[q] as RippleShape;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          // 局部坐标 → 旋转（origin = 形状中心，:323）
          let lx = ((x + 0.5) - cx) / hw, ly = ((y + 0.5) - cy) / hh;
          const rx = lx * cos - ly * sin, ry = lx * sin + ly * cos;
          if (rx < -1 || rx > 1 || ry < -1 || ry > 1) continue;
          const shapeV = rippleShape(shape, (rx + 1) * 0.5, (ry + 1) * 0.5);
          if (shapeV <= 0) continue;
          const a = shapeV * num;
          const inv = 1 - a;
          const i = y * w + x;
          R[i] = shapeV * rCol + R[i] * inv;
          G[i] = shapeV * gCol + G[i] * inv;
        }
      }
    }
    _rqCount = 0;
  }

  /** WaterProcessor 一步（滚动增量 dx/dy 应用在采样侧 = 原版把旧缓冲按位移画进
   *  清空 swap 的语义，越界 clamp 采样 = RenderTarget Clamp） */
  private _step(dx: number, dy: number): void {
    const w = this._gW, h = this._gH;
    const R = this._R, G = this._G, R2 = this._R2, G2 = this._G2;
    for (let y = 0; y < h; y++) {
      const sy0 = y - dy;
      const ya = Math.min(h - 1, Math.max(0, sy0 - 1));
      const ym = Math.min(h - 1, Math.max(0, sy0));
      const yb = Math.min(h - 1, Math.max(0, sy0 + 1));
      for (let x = 0; x < w; x++) {
        const sx0 = x - dx;
        const xl = Math.min(w - 1, Math.max(0, sx0 - 1));
        const xm = Math.min(w - 1, Math.max(0, sx0));
        const xr = Math.min(w - 1, Math.max(0, sx0 + 1));
        const i = y * w + x;
        const r = waveProcessorStep(
          R[ya * w + xl], R[ym * w + xr], R[ya * w + xm], R[yb * w + xm],
          R[ym * w + xm], G[ym * w + xm]);
        R2[i] = r[0]; G2[i] = r[1];
      }
    }
    this._R = R2; this._G = G2; this._R2 = R; this._G2 = G;
  }

  /** Renderer 每帧注入相机态（采样换算用；frame() 之外的 draw 路径也取最新） */
  setCamera(camX: number, camY: number, zoom: number): void {
    this._camX = camX; this._camY = camY; this._zoom = zoom;
  }
}

export const waterWaves = new WaterWaveSystem();

// ---- 实体注入采集（Renderer 调；纯数据无实体类依赖，防循环导入）----
export interface WaveEntitySample {
  kind: 'npc' | 'player' | 'projectile' | 'gore';
  x: number; y: number; w: number; h: number;     // 左上 + 尺寸（世界 px）
  vx: number; vy: number;
  wet: boolean; wetCount: number;
  honeyWet: boolean; lavaWet: boolean;
  rotation?: number;
  /** 弹幕 ignoreWater（弹幕族） */
  ignoreWater?: boolean;
  /** 弹幕 CanDistortWater&&!NoLiquidDistortion 预筛结果（调用方算） */
  projDistort?: boolean;
}

/** NPC/玩家洗掠强度（DrawWaves :196-229 纯函数部分）。
 *  返回 vColor.z（=0.5·num）或 0；oldVel 供 |vel−oldVel|·0.5 项。 */
export function npcWashStrength(
  vx: number, vy: number, ovx: number, ovy: number,
  w: number, h: number, rotation: number, viscous: boolean, honeyOrLava: boolean,
): number {
  // vector5 = velocity.RotatedBy(−rotation) / (h, w)（:202）
  const cos = Math.cos(-rotation), sin = Math.sin(-rotation);
  const rx = (vx * cos - vy * sin) / h;
  const ry = (vx * sin + vy * cos) / w;
  let num = rx * rx + ry * ry;
  num = num * 0.3 + 0.7 * num * (1024 / (h * w));
  num = Math.min(num, 0.08);
  num += Math.hypot(vx - ovx, vy - ovy) * 0.5;
  if (!viscous && honeyOrLava) num *= 0.3;
  return 0.5 * num;   // vColor.z = 0.5·num
}

/** 涟漪强度（NPC :219-228）：0.195·√|vel| */
export function npcRippleStrength(velLen: number): number {
  return 0.195 * Math.sqrt(velLen);
}

const _oldVel = new WeakMap<object, [number, number]>();

/** 采集一个实体并注入（Renderer 侧逐实体调用；档位门在此把守） */
export function injectEntity(e: WaveEntitySample, camX: number, camY: number,
  viewW: number, viewH: number, zoom: number): void {
  const gates = waterWaves.gates;
  if (waterWaves.quality === 0) return;
  // 屏幕盒剔除（:196 Collision.CheckAABBvAABBCollision，屏矩形 vs 实体盒 ±16px）
  const sx = (e.x - camX) * zoom, sy = (e.y - camY) * zoom;
  const sw = e.w * zoom, sh = e.h * zoom;
  if (sx + sw < -16 || sy + sh < -16 || sx > viewW + 16 || sy > viewH + 16) return;

  const velLen = Math.hypot(e.vx, e.vy);
  const vnx = velLen > 0 ? e.vx / velLen : 0;
  const vny = velLen > 0 ? e.vy / velLen : 0;
  const isNpc = e.kind === 'npc';
  const isPlayer = e.kind === 'player';
  const viscous = gates.viscosity;

  if (isNpc || (isPlayer && gates.player) || (e.kind === 'projectile' && gates.projectile && e.projDistort)) {
    // v̂·10 逆推的注入中心（:210/:246/:299）
    const cx = e.x + e.w / 2 - vnx * 10;
    const cy = e.y + e.h / 2 - vny * 10;
    if (isPlayer) {
      // :242-253 num3 = 0.05·√|vel|；quad (2w, 2h)
      let num3 = 0.05 * Math.sqrt(velLen);
      if (!viscous && (e.honeyWet || e.lavaWet)) num3 *= 0.3;
      if (e.wet) {
        waterWaves.injectWash(cx, cy, e.w * 2, e.h * 2, vnx, vny, 0.5 * num3);
      }
      if (e.wetCount !== 0) {
        // :255-263 num3 ×= 3 → QueueRipple(center + v̂·(wet?5:−20), wet? num3 : −num3, size)
        const s3 = num3 * 3;
        const px = e.x + e.w / 2 + vnx * (e.wet ? 5 : -20);
        const py = e.y + e.h / 2 + vny * (e.wet ? 5 : -20);
        const k = Math.min(1, Math.max(0, s3 * 10));
        queueRippleSized(px, py, e.wet ? s3 : -s3, e.w, e.h * (e.wetCount / 9) * k, RippleShape.Circle, 0);
      }
    } else if (isNpc) {
      // :200-217
      let num = 0;
      const key = e as unknown as object;
      const ov = _oldVel.get(key);
      const vz = npcWashStrength(e.vx, e.vy, ov ? ov[0] : e.vx, ov ? ov[1] : e.vy,
        e.w, e.h, e.rotation ?? 0, viscous, e.honeyWet || e.lavaWet);
      num = vz;
      if (e.wet) {
        waterWaves.injectWash(cx, cy, e.w * 2, e.h * 2, vnx, vny, num);
      }
      if (ov) { ov[0] = e.vx; ov[1] = e.vy; } else _oldVel.set(key, [e.vx, e.vy]);
      if (e.wetCount !== 0) {
        // :219-228 涟漪：num = 0.195·√|vel|；色 G=(wet?+num:−num)·0.5+0.5 再 ×0.5；
        // 尺寸 (w, h·wetCount/9)·clamp(num·10)
        const n2 = npcRippleStrength(velLen);
        const px = e.x + e.w / 2 + vnx * (e.wet ? 5 : -20);
        const py = e.y + e.h / 2 + vny * (e.wet ? 5 : -20);
        const k = Math.min(1, Math.max(0, n2 * 10));
        queueRippleSized(px, py, e.wet ? n2 : -n2, e.w, e.h * (e.wetCount / 9) * k, RippleShape.Circle, 0);
      }
    } else {
      // 弹幕 :299-310：num6 = 2·√(0.05·|vel|)；quad (max(12, 0.75w), max(12, 0.75h))
      let num6 = 2 * Math.sqrt(0.05 * velLen);
      if (!viscous && (e.honeyWet || e.lavaWet)) num6 *= 0.3;
      const qw = Math.max(12, e.w * 0.75), qh = Math.max(12, e.h * 0.75);
      waterWaves.injectWash(cx, cy, qw, qh, vnx, vny, 0.5 * num6);
    }
  }

  // Gore 涟漪（Gore.cs:986：落水首帧 QueueRipple(pos+8,8) 默认强度 1）
  if (e.kind === 'gore' && gates.ripple) {
    queueRipple(e.x + 8, e.y + 8, 1, RippleShape.Square, 0);
  }
}
