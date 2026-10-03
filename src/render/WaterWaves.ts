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
//   :141/:146）；世界锚定滚动 = 三件套（★BJ89 定谳移植，BJ76 登记债清偿）：
//   ①注入锚 snapUp（:183 `Center − vector2`，vector2=−_last/0.25）②传播增量
//   vector3=F_n−F_{n−1}（:151-156，F=floor(−camCss·0.25)，右/下移≤0=内容反向移）
//   ③读侧亚栅格补偿 uImageOffset=camCss−snapUp ∈(−4,0]（Apply :374 UseImageOffset；
//   obj19 c11 实证进波场采样坐标）——内容锚 4px 栅格、读补偿余量=任意龄期 0px 漂移。
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
//   (0, prog·0.04))（uv = 世界px/noise 尺寸——pixel = t0·uScreenResolution +
//   uScreenPosition = 屏幕uv·分辨率+相机世界左上（ScreenShaderData.Apply），LinearWrap
//   采样；★相机项 2026-09-14 BJ76 补上，此前屏幕锚定=波纹跟人跑）；grad = n1.xy −
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

import { swPerf, waveAmpParam } from './perfFlags';   // ★BJ77/BJ78 零语义优化层总闸(★转正缺省开;?swperf=0=豁免口回退旧行为逐位)
import { WorkerWatchdog, ladderDelayMs, newFallsBy, workerRetryEnabled,
  type WorkerFallReason } from '../workers/WorkerGovernance';   // ★看门狗治理(2026-09-28)
import { wavesWasmEnabled, wavesWasmReady, ensureWavesWasm, wavesWasmStep } from '../wasm/wavesWasm';   // ★WASM 第三刀(2026-10-03;wavesWasm.ts 四约定,旗 ?wavewasm=1 缺省关)

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
  // ★C8-D:`q <= 0`（原 `q < 0`）——Math.round(v·256) 对 v∈(−0.002,0) 产出 −0,
  // 旧 guard `−0 < 0`=false 会把 −0/256 写进场=数值同 +0 但字节面 0x80000000,
  // 破坏脏区字节编码「逐位同」判据。数值恒等(IEEE −0≡+0),零行为差。
  return q <= 0 ? 0 : q > 256 ? 1 : q / 256;
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

// ---- ★C8 波场 Worker（2026-09-23;?waveworker=1,缺省关）----
// capture 模式：写侧方法（injectWash/queueRippleRaw/setCamera）把参数推入
// _wwCapture 而非本地模拟；frame() 把注入批+帧输入 postMessage 给 Worker，
// Worker 步进后回传场快照写入类字段（读侧方法零改动）。主线程零阻塞、
// 零同步等待；注入锚=F_prev 语义由消息序天然保持（注入批先于 frame 应用）。
let _wwCapture: { k: string; a: number[] }[] | null = null;

/** ★C8 诊断计数器（探针对账:queued(capture 推入) vs posted(帧批发出) vs
 *  fields(场快照回达);falls=看门狗回落。纯读面零行为影响）。
 *  ★C8-D 追加:bytes=场消息载荷累计字节(主线程收达侧计;流量账探针消费)、
 *  fmt=三种场消息形态计数、resyncs=主线程请求重锚次数。
 *  ★看门狗治理(2026-09-28)追加:fallsBy=回落指纹三分类(onerror/no-result-dead/
 *  pickup-timeout)、respawns=阶梯重生执行次数（F5 驾驶舱扩展）。 */
const _wwStat = { camQ: 0, washQ: 0, rippleQ: 0, posted: 0, fields: 0, falls: 0,
  bytes: 0, resyncs: 0, fallsBy: newFallsBy(), respawns: 0,
  fmt: { full: 0, delta: 0, f32: 0 } };
export function wwWorkerStats(): { on: boolean; camQ: number; washQ: number; rippleQ: number;
  posted: number; fields: number; falls: number; bytes: number; resyncs: number;
  fallsBy: Record<WorkerFallReason, number>; respawns: number;
  fmt: { full: number; delta: number; f32: number } } {
  return { on: waterWaves.wwActive(), ..._wwStat, fallsBy: { ..._wwStat.fallsBy }, fmt: { ..._wwStat.fmt } };
}

// ---- ★C8-D 波场脏区增量回传（2026-09-25;三笔登记债之最大笔收偿）----
// 现状（R3-F2 后）：worker 每帧全量回传场快照——1080p 视口栅格 ~480×270×2 通道×
// Float32 = ~1MB/帧的 transferable churn（slice+memcpy 虽零拷贝过 postMessage,
// worker 侧复制与主线程收达带宽仍在）。本刀改脏区增量：
//   · 波场内核不动点是中性 (0.5,0.5)（kernel S=0,T=0,w=0 → out=(0.5,0.5)）——
//     活跃区（涟漪/洗掠波前）高度局部化,大部分格恒中性;
//   · 场值量化不变式：_R/_G 每格恒为 k/256（k∈0..256 整数——全部写入路径
//     q256()/rq/256/gq/256、_ensure/_clear fill(0.5)=128/256）→ 字节精确可表,
//     **解码后主线程 _R/_G 与 worker 全量逐位同**（硬判据,非混沌口径——场内容
//     确定性同源,无掷流分叉面）;
//   · worker 侧每帧 diff「影子」（=主线程已知场的 Float32 副本）→ 行扫描收集
//     变更跨度（span RLE）,跨间距奇 R,G 字节交织;影子在成功编码后按跨度补写;
//   · 保底锚帧：每 WW_FULL_ANCHOR_EVERY 帧强制全量字节快照;resize（影子失配）/
//     换档/相机大跳（WaveWorker 侧判据）/主线程 resync 请求同样强制全量;
//     diff 超限（载荷 > 全量字节）或量化不变式破坏 → 全量;不变式破坏再犯 →
//     旧 f32 全量逐帧逃生（=R3-F2 前行为,登记债回滚口）。
//   · 实测流量账（_c8d-wave-delta-probe,seed 05162020 small,64000 格栅格,
//     旧基线 = f32 全量 8B/格 = 512KB/帧）:静水（传送落水后静置,溅落能量衰减期
//     + 浮力振荡持续注入,~28k 格/帧仍逐位变更）56.2KB/帧 ≈ **11%基线（~9×）,
//     158 帧仅 1 次全量（周期锚）**;海浪（水中行走振荡）114.5KB/帧 ≈ **22%基线
//     （~4.5×）**,busy 帧（>75% 格变更）按设计回退 2B/格字节全量。f32 逃生=0、
//     resync=0。位等价硬判据由 tests/ww-delta-field.test.ts 锁（非混沌口径）。
// 协议（op:'field' 三形态,主线程按 fmt 分派;无 fmt=旧 f32 形态向后兼容）：
//   {fmt:'full', R,G:Uint8Array(n)}                       全量字节快照（2B/格）
//   {fmt:'delta', meta:Uint32Array, data:Uint8Array}      脏区增量（meta=[跨度数,
//     (y,x0,len)…],data=[R,G 字节交织,按跨度序]）        典型静水 ~4B/帧
//   {fmt:'f32', R,G:Float32Array}                         旧全量（逃生口/兼容）
// 元数据（gW/gH/progress/intensity/waveOff/cam/scroll）三形态恒带——读侧
//   sampleDisplace/_readR/waveReadOffset 零改动纪律。
export const WW_FULL_ANCHOR_EVERY = 120;
/** ★R3b-3 sticky f32 逃生探针帧距（escape 激活期每 N 帧试恢复 delta;
 *  N 帧内 f32 全量=带宽代价上界 8B/格×N,恢复后回 delta 模式） */
export const WW_ESCAPE_PROBE_EVERY = 120;
export const WW_JUMP_TEXELS = 8;
/** 字节 k → 场值 k/256 精确 LUT（k/256 在 float32 精确可表:k≤256=2^8,尾数≤9 位）*/
const WW_B2F = (() => { const t = new Float32Array(257); for (let k = 0; k <= 256; k++) t[k] = k / 256; return t; })();

/** 场消息三形态（worker→main op:'field' 载荷;主线程 _wwApplyField 按 fmt 分派） */
export type WWFieldMsg =
  | { fmt: 'full'; R: Uint8Array; G: Uint8Array; gW: number; gH: number;
    progress: number; intensity: number; waveOff: [number, number];
    cam: [number, number, number]; scroll: [number, number] }
  | { fmt: 'delta'; meta: Uint32Array; data: Uint8Array; gW: number; gH: number;
    progress: number; intensity: number; waveOff: [number, number];
    cam: [number, number, number]; scroll: [number, number] }
  | { fmt: 'f32'; R: Float32Array; G: Float32Array; gW: number; gH: number;
    progress: number; intensity: number; waveOff: [number, number];
    cam: [number, number, number]; scroll: [number, number] };

/** ★C8-D 相机大跳判据（WaveWorker 每帧调用,纯函数供单测）：F=floor(−camCss·0.25)
 *  （WaterShaderData.StepLiquids :148-157 滚动偏移,texel 单位）位移超过
 *  WW_JUMP_TEXELS texel（=32 css px@0.25 栅格）视为大跳（传送/respawn/大甩镜）
 *  → 强制下一场消息全量锚帧。正常行走 ΔF∈{0,±1} 恒不触发。返回 [是否大跳, 新F]。 */
export function wwCameraJumpForceFull(
  lastF: readonly [number, number] | null, camX: number, camY: number, zoom: number,
): [boolean, [number, number]] {
  const fx = Math.floor(-camX * zoom * 0.25), fy = Math.floor(-camY * zoom * 0.25);
  const jump = lastF !== null
    && (Math.abs(fx - lastF[0]) > WW_JUMP_TEXELS || Math.abs(fy - lastF[1]) > WW_JUMP_TEXELS);
  return [jump, [fx, fy]];
}

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
  // ★C8 capture 模式：推参入批（worker 侧自行跑 gates/清队语义）
  if (_wwCapture) { _wwStat.rippleQ++; _wwCapture.push({ k: 'rippleRaw', a: [x, y, sx, sy, colR, colG, colA, shape, rotation] }); return; }
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
    const cc = c.getContext('2d', { willReadFrequently: true });
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

/** ★C8 转正（2026-09-23）：缺省开——双模式对拍（worker nonNeutral=25652 vs main
 *  25415,+0.9% 混沌系等价;343 帧批全应答;falls=0）+BJ316 getError 审计窗共存
 *  验证。?waveworker=0 = 逃生门（回主线程模拟,失联看门狗双保险保留）。 */
const wwWorkerFlag = (() => {
  try {
    // ★fork bomb 修复（2026-09-23 用户实机 217 workers 实锤）：Worker 上下文
    //  （无 document）恒 false——转正缺省开的表达式在 worker 里也为 true,
    //  worker 的 frame() 会 _wwEnsure 自嵌套=每帧消息沿链 spawn 一级。
    if (typeof document === 'undefined') return false;
    return typeof location === 'undefined' || new URLSearchParams(location.search).get('waveworker') !== '0';
  } catch { return false; }
})();

export class WaterWaveSystem {
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
  /** 相机滚动偏移 F = floor(−camCss·0.25)（WaterShaderData.StepLiquids :148-157：
   *  `vector−Main.screenPosition`（=−camCss）×0.25 floor——即 _lastDistortionDrawOffset，
   *  相机右/下移时 ≤0）。★BJ89 定谳（BJ76 登记债清偿）：旧实现存 +camCss·0.25（符号
   *  反）且注入用真 cam——内容随相机【同向】移（+Δ），真实在环探针：世界静止 stamp
   *  在 +40px 跳变后表观世界 1004→1080（≈2× 相机速漂移）；原版 = 内容移 vector3
   *  (=F_n−F_{n−1}, −Δ) + 注入/读两侧 snapUp(−4F) 锚定/补偿（:183/:374）= 任意龄期
   *  0px 漂移（字节码 obj19 c11=uImageOffset 实证进波场采样坐标） */
  private _scrollX = 0; private _scrollY = 0;
  private _stepsLast = 0;

  /** ★C8 波场 Worker（?waveworker=1）:模拟整体移出主线程——弱机 _step 死亡
   *  螺旋（dt 补偿 2 步×11 万格）在 worker 线程无害化，渲染主线程拿回预算。
   *  内核同源（worker 导入本模块=同一份类）零转录；同步纪律：主线程零阻塞
   *  （全异步消息）、场快照原子替换、注入批随帧发送（锚=F_prev 时序同构）。 */
  private _ww: Worker | null = null;
  private _wwOn = false;
  private _wwSpawned = false;
  /** ★C8 纹理下发旗：Ripples 形状纹理是否已喂给 worker（一次性 32KB；重生实例重置） */
  private _wwTexSent = false;
  /** 诊断面（看门狗退役后保留）：最后一场快照到达时刻（0=从未到达）/实例创建时刻。
   *  ★旧「2s 无回传即杀」判据已退役（2026-09-28 看门狗治理）——墙钟回传缺席不分
   *  「主线程忙/暂停/隐藏」与「worker 真死」，开局冷模块图取>2s 必杀（trace 定谳），
   *  判据改由 WorkerWatchdog outstanding-aware 语义承担。 */
  private _wwLastField = 0;
  private _wwStartedAt = 0;
  /** ★看门狗治理（2026-09-28）：outstanding-aware 心跳（每实例一个,回落即弃） +
   *  onerror 硬证据旗 + 阶梯重生状态。_wwShadow=重生双轨（本地模拟连续+worker
   *  预热,首场到达切主）——重生期水不静止（「宁可回落不可静态水」判例的延续）。 */
  private _wwWd: WorkerWatchdog | null = null;
  private _wwErrored = false;
  private _wwFallCount = 0;
  private _wwRespawnAt = 0;
  private _wwShadow = false;

  private _wwEnsure(): void {
    if (this._wwSpawned) return;
    if (typeof document === 'undefined') { this._wwSpawned = true; return; }   // ★worker 上下文禁自嵌套（双保险）
    this._wwSpawned = true;
    this._wwSpawnWorker(false);
  }

  /** 创建 worker 实例并进入 worker 模式。respawn=false=首建（会话开局,原 C8 语义:
   *  worker 模式即启,冷取窗口静态水——现已由音频门 prefetch 预热缓解）;true=看门狗
   *  回落后的阶梯重生——shadow 双轨:本地模拟保持连续（水不静止）,worker 预热至首场
   *  到达再切主。 */
  private _wwSpawnWorker(respawn: boolean): void {
    try {
      // ★WASM 第三刀(2026-10-03):?wavewasm=1 经 Worker options.name 注入 worker 域
      //  (loader wavesWasm.ts 双域旗读取的 worker 半边——worker 无页面 URL,快照
      //  协议不动)。★vite:worker-import-meta-url 约束=worker options 必须静态
      //  字面量(动态三元=vite 500 实锤)——双静态分支构造(LightWorkerLink:241
      //  判例同款);window.name 同名串不误伤(仅 document 缺席域读 name)。
      if (wavesWasmEnabled()) {
        this._ww = new Worker(new URL('../workers/WaveWorker.ts', import.meta.url),
          { type: 'module', name: 'sw-wavewasm=1' });
      } else {
        this._ww = new Worker(new URL('../workers/WaveWorker.ts', import.meta.url),
          { type: 'module', name: 'WaveWorker' });
      }
      this._wwStartedAt = performance.now();
      this._wwLastField = 0;
      this._wwErrored = false;
      this._wwWd = new WorkerWatchdog();
      this._ww.onerror = (e) => {
        this._wwErrored = true;   // ★onerror=硬证据（旧版仅 log,404 类死法要等满预算）
        console.warn('[WaveWaves] worker error:', String(e.message ?? '').slice(0, 140));
      };
      this._ww.onmessage = (e: MessageEvent) => {
        _wwStat.fields++;
        this._wwLastField = performance.now();
        this._wwWd?.onResult(this._wwLastField);   // 到达即冲账（应用/世代丢弃不影响心跳）
        this._wwApplyField(e.data);
        // ★重生完成判定:shadow 期首个场到达 → 切主（本地模拟退役,后续纯 worker 模式）
        if (this._wwShadow) this._wwShadow = false;
      };
      this._ww.postMessage({ op: 'quality', q: this.quality });
      _wwCapture = _wwCapture || [];
      // ★C8 修复（2026-09-23 探针定谳：worker 臂 washQ=206/rippleQ=9 被 capture 吞
      //  而 posted=0/fields=0）——_wwOn 此前【全文件无置 true 点】：frame() 的 worker
      //  分支永不进入 → 注入批永不 postMessage、场快照永不回传、_wwCapture 无界增长
      //  （内存泄漏）→ 用户实报"水面有噪声波动但无实体交互波纹"（本地 sim 照跑=环境
      //  噪声在，全部实体注入被吞=交互波纹无）。旗开即切换 capture 模式。
      this._wwOn = true;
      this._wwTexSent = false;
      this._wwTrySendTex();
      if (respawn) { this._wwShadow = true; _wwStat.respawns++; }
    } catch {
      this._ww = null; this._wwOn = false; this._wwWd = null;
      if (respawn) this._wwShadow = false;
    }
  }

  /** ★R2-F3 注入批本地重放（回落帧不丢注入;重生 shadow 帧同款消费——先摘 capture
   *  态再调用,防重放再入 capture 批,时序锚=F_prev）。 */
  private _replayInj(pending: { k: string; a: number[] }[] | null): void {
    if (!pending) return;
    for (const inj of pending) {
      if (inj.k === 'wash') {
        const [cx, cy, qw, qh, fx, fy, st] = inj.a;
        this.injectWash(cx, cy, qw, qh, fx, fy, st);
      } else if (inj.k === 'rippleRaw') {
        const [x, y, sx, sy, colR, colG, colA, shape, rot] = inj.a as [number, number, number, number, number, number, number, RippleShape, number];
        queueRippleRaw(x, y, sx, sy, colR, colG, colA, shape, rot);
      } else if (inj.k === 'camera') {
        const [x, y, z] = inj.a;
        this.setCamera(x, y, z);
      }
    }
  }

  /** ★C8：Ripples 形状纹理下发（worker 模块实例无 document，ensureWaveTextures
   *  不可达 → 不喂则 worker 侧 _drawRipples 的 !_rippleData 门把涟漪整批清队
   *  =worker 模式涟漪全缺）。atlas 未就绪时随帧重试直至发出（一次性开销）。 */
  private _wwTrySendTex(): void {
    if (this._wwTexSent || !this._wwOn || !this._ww) return;
    if (!_rippleData) return;   // 纹理懒提取未就绪——下帧再试
    this._wwTexSent = true;
    this._ww.postMessage({ op: 'tex', ripple: _rippleData });
  }

  /** worker 场消息 → 类字段（读侧方法 sampleDisplace/readGridR/waveReadOffset 零改动）。
   *  ★C8-D（2026-09-25）：按 fmt 三形态分派——
   *    'delta'  脏区增量:主线程 _R/_G 原地按跨度补写（零分配解码,B2F LUT 精确
   *             k/256→逐位同 worker 全量;网格失配/跨度越界=丢帧+resync 重锚请求,
   *             防半应用毒化）;
   *    'full'   全量字节快照:2B/格解码（换长支同步对齐步进 scratch _R2/_G2）;
   *    'f32'/无fmt  旧全量逐字保留（逃生口/向后兼容——b2b 批 B 假消息面不变）。
   *  ★R2-F2（2026-09-25 红蓝批 B）：换长支贴身对齐 _R2/_G2 语义在 full/f32 两形态
   *  原样保留（worker 模式 frame() 走快照喂早退,主线程 _ensure 不跑;看门狗回落帧
   *  _step 依赖四数组同长）。delta 形态不改长度 → _R2/_G2 无需触碰。 */
  private _wwApplyField(m: WWFieldMsg): void {
    // 运行时兼容:旧形态消息无 fmt 字段 → undefined 落 f32 支（判别式收窄仍成立）
    if (m.fmt === 'delta') {
      // 网格守卫：worker 保证 delta 只在无 resize 帧发出（消息序天然同相）;
      // 失配=协议异常 → 丢弃+请求重锚（下帧全量），绝不半应用。
      if (m.gW !== this._gW || m.gH !== this._gH || this._R.length !== m.gW * m.gH) {
        this._wwRequestResync(); return;
      }
      const meta = m.meta, data = m.data, gW = m.gW, gH = m.gH;
      const spans = meta[0] | 0;
      // 跨度预验证（防半应用:任何越界/载荷短缺 → 整帧丢弃+resync）
      let need = 0;
      for (let s = 0; s < spans; s++) {
        const y = meta[1 + s * 3], x0 = meta[2 + s * 3], len = meta[3 + s * 3];
        if (y >= gH || x0 + len > gW) { this._wwRequestResync(); return; }
        need += len;
      }
      if (data.length < need * 2) { this._wwRequestResync(); return; }
      const R = this._R, G = this._G;
      let c = 0;
      for (let s = 0; s < spans; s++) {
        const y = meta[1 + s * 3], x0 = meta[2 + s * 3], len = meta[3 + s * 3];
        let i = y * gW + x0;
        for (let t = 0; t < len; t++, i++) {
          R[i] = WW_B2F[data[c]]; G[i] = WW_B2F[data[c + 1]]; c += 2;
        }
      }
      this.progress = m.progress; this.intensity = m.intensity;
      this._camX = m.cam[0]; this._camY = m.cam[1]; this._zoom = m.cam[2];
      this._scrollX = m.scroll[0]; this._scrollY = m.scroll[1];
      _wwStat.fmt.delta++;
      _wwStat.bytes += meta.length * 4 + data.length;
      return;
    }
    if (m.fmt === 'full') {
      const n = m.gW * m.gH;
      const R8 = m.R, G8 = m.G;
      if (R8.length !== n || G8.length !== n) { this._wwRequestResync(); return; }   // 载荷短缺守卫
      if (this._R.length === n && this._gW === m.gW && this._gH === m.gH) {
        const R = this._R, G = this._G;
        for (let i = 0; i < n; i++) { R[i] = WW_B2F[R8[i]]; G[i] = WW_B2F[G8[i]]; }
      } else {
        const R = new Float32Array(n), G = new Float32Array(n);
        for (let i = 0; i < n; i++) { R[i] = WW_B2F[R8[i]]; G[i] = WW_B2F[G8[i]]; }
        this._R = R; this._G = G;
        this._R2 = new Float32Array(n).fill(0.5);
        this._G2 = new Float32Array(n).fill(0.5);
      }
      this._gW = m.gW; this._gH = m.gH;
      this.progress = m.progress; this.intensity = m.intensity;
      this._camX = m.cam[0]; this._camY = m.cam[1]; this._zoom = m.cam[2];
      this._scrollX = m.scroll[0]; this._scrollY = m.scroll[1];
      _wwStat.fmt.full++;
      _wwStat.bytes += n * 2;
      return;
    }
    // 旧 f32 全量（fmt 缺省=批 B 前消息形态;逐字保留）
    if (this._R.length === m.R.length) { this._R.set(m.R); this._G.set(m.G); }
    else {
      this._R = m.R as typeof this._R; this._G = m.G as typeof this._G;
      this._R2 = new Float32Array(m.R.length).fill(0.5);
      this._G2 = new Float32Array(m.G.length).fill(0.5);
    }
    this._gW = m.gW; this._gH = m.gH;
    this.progress = m.progress; this.intensity = m.intensity;
    this._camX = m.cam[0]; this._camY = m.cam[1]; this._zoom = m.cam[2];
    this._scrollX = m.scroll[0]; this._scrollY = m.scroll[1];
    _wwStat.fmt.f32++;
    _wwStat.bytes += m.R.length * 8;
  }

  /** ★C8-D 主线程请求 worker 重锚（delta 网格失配/跨度越界丢帧后;worker 下帧
   *  强制全量。worker 已死时静默——看门狗回落兜底） */
  private _wwRequestResync(): void {
    _wwStat.resyncs++;
    try { this._ww?.postMessage({ op: 'resync' }); } catch { /* 死 worker,看门狗兜底 */ }
  }

  /** worker 回传快照（worker 侧调用,读私有字段）。★R3-F2（2026-09-25 红蓝批 B）：
   *  slice 产【独立 buffer 副本】供 WaveWorker 走 transferable 零拷贝回传（旧
   *  结构克隆 125-180MB/s churn 清零）——所有权单向转移:主线程收达后 worker 侧
   *  副本即弃（WaveWorker slice 后无再引用面,本体 _R/_G 留 worker 继续步进）;
   *  主线程读侧 sampleDisplace 单线程消费,与收达时序无交叠面。★C8-D 起
   *  WaveWorker 常规走 exportFieldDelta（脏区增量）;本方法保留为 f32 逃生口
   *  与探针/金标全量面（降采样仍不做,登记债）。 */
  exportFieldSnapshot(): { R: Float32Array; G: Float32Array; gW: number; gH: number;
    progress: number; intensity: number; waveOff: [number, number];
    cam: [number, number, number]; scroll: [number, number] } {
    return {
      R: this._R.slice(), G: this._G.slice(),
      gW: this._gW, gH: this._gH,
      progress: this.progress, intensity: this.intensity,
      waveOff: this.waveReadOffset(),
      cam: [this._camX, this._camY, this._zoom],
      scroll: [this._scrollX, this._scrollY],
    };
  }

  // ---- ★C8-D 脏区增量编码态（仅 worker 侧实例消费;主线程实例零触碰）----
  /** 影子=主线程已知场（成功回传后与 _R/_G 逐位同;diff 判据=Float32 全等比较） */
  private _dShR = new Float32Array(0);
  private _dShG = new Float32Array(0);
  /** 距上次全量锚帧的场消息数（≥WW_FULL_ANCHOR_EVERY → 强制全量） */
  private _dFrame = 0;
  /** 量化不变式破坏 sticky 逃生：恒走旧 f32 全量（=R3-F2 前行为回滚口）。
   *  ★R3b-3（2026-09-27 红蓝批 β）：不再永粘——每 WW_ESCAPE_PROBE_EVERY 帧
   *  试一次全量字节快照（_dFullBytes 自带逐格不变式复核）,成功=场已回到
   *  k/256 可量化域,清 sticky 恢复 delta 模式（协议侧 'full' 解码无影子依赖,
   *  主线程 _wwApplyField 三形态分派天然兼容;失败照旧 f32,下轮再试）。
   *  换档/resync 的 forceFull 帧立即试（forceFull 短路探针节流）。 */
  private _dF32Escape = false;
  /** sticky 探针帧距计数（escape 激活期推进;WW_ESCAPE_PROBE_EVERY 到点试恢复） */
  private _dEscProbe = 0;
  /** 跨度/payload 复用 scratch（成功编码后 slice 出精确尺寸回传;容量按需长） */
  private _dMetaBuf = new Uint32Array(1 + 3 * 8192);
  private _dDataBuf = new Uint8Array(1 << 16);

  private _dHead(): Pick<WWFieldMsg, 'gW' | 'gH' | 'progress' | 'intensity' | 'waveOff' | 'cam' | 'scroll'> {
    return {
      gW: this._gW, gH: this._gH,
      progress: this.progress, intensity: this.intensity,
      waveOff: this.waveReadOffset(),
      cam: [this._camX, this._camY, this._zoom],
      scroll: [this._scrollX, this._scrollY],
    };
  }

  /** 量化不变式破坏 → sticky f32 逃生（一次性告警;worker 上下文 console 可用） */
  private _dViolate(): WWFieldMsg {
    if (!this._dF32Escape) {
      console.warn('[WaveWaves] 场量化不变式破坏（k/256 外值）→ f32 全量逃生（8B/格,登记债）');
      this._dF32Escape = true;
    }
    this._dFrame = 0;
    return { fmt: 'f32', R: this._R.slice(), G: this._G.slice(), ...this._dHead() };
  }

  /** 全量字节快照（2B/格;含逐格不变式复核,破坏返 null）。影子随全量重置。 */
  private _dFullBytes(): { fmt: 'full'; R: Uint8Array; G: Uint8Array } | null {
    const n = this._R.length;
    const R = this._R, G = this._G;
    const R8 = new Uint8Array(n), G8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const kf = R[i] * 256, kg = G[i] * 256;
      const kR = Math.round(kf), kG = Math.round(kg);
      if (kR !== kf || kG !== kg || kR < 0 || kR > 256 || kG < 0 || kG > 256) return null;
      R8[i] = kR; G8[i] = kG;
    }
    return { fmt: 'full', R: R8, G: G8 };
  }

  /** 脏区 diff 编码（行扫描跨度 RLE;R,G 字节交织）。返回 null=超限落全量,
   *  'violation'=量化不变式破坏走 f32 逃生。成功时影子尚未补写（调用方按跨度补）。 */
  private _dEncode(): { meta: Uint32Array; data: Uint8Array; spans: number } | null | 'violation' {
    const w = this._gW, h = this._gH, n = w * h;
    const R = this._R, G = this._G, shR = this._dShR, shG = this._dShG;
    // scratch 容量与 0.75 全量阈值对齐（超出必走全量,slice 前无需增长路径）。
    // ★阈值 0.75（探针实测定谳）:玩家浮水时浮力振荡持续注入 → 真实场 50~75% 格
    //  逐帧变更,delta（2B/格+跨度头）在 75% 密度内仍恒优于全量 2B/格——0.5 阈值
    //  会在浮水场景把过半帧顶成全量回退（_c8d-wave-delta-probe 海浪臂 168/206 full）。
    const cellsCap = Math.ceil(n * 0.75) + 1024;
    if (this._dDataBuf.length < cellsCap * 2) this._dDataBuf = new Uint8Array(cellsCap * 2);
    if (this._dMetaBuf.length < 1 + 3 * 8192) this._dMetaBuf = new Uint32Array(1 + 3 * 8192);
    const meta = this._dMetaBuf, data = this._dDataBuf;
    let mOff = 1, dOff = 0, spans = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w;) {
        while (x < w && R[row + x] === shR[row + x] && G[row + x] === shG[row + x]) x++;
        if (x >= w) break;
        const x0 = x;
        while (x < w && (R[row + x] !== shR[row + x] || G[row + x] !== shG[row + x])) x++;
        const len = x - x0;
        if (mOff + 3 > meta.length || dOff + len + len > data.length) return null;
        meta[mOff] = y; meta[mOff + 1] = x0; meta[mOff + 2] = len; mOff += 3;
        for (let t = 0; t < len; t++) {
          const i = row + x0 + t;
          const kf = R[i] * 256, kg = G[i] * 256;
          const kR = Math.round(kf), kG = Math.round(kg);
          if (kR !== kf || kG !== kg || kR < 0 || kR > 256 || kG < 0 || kG > 256) return 'violation';
          data[dOff++] = kR; data[dOff++] = kG;
        }
        spans++;
      }
    }
    // 真实收益判据：delta 载荷（含 12B/跨度开销）大于全量字节 → 不如全量
    if (dOff + mOff * 4 > n * 2) return null;
    meta[0] = spans;   // ★跨度数写头部（消费端 meta[0] 驱动解码循环）
    return { meta: meta.slice(0, mOff), data: data.slice(0, dOff), spans };
  }

  /** ★C8-D 场消息出口（WaveWorker 每帧调用,替代 exportFieldSnapshot 常规面）。
   *  forceFull=true（换档/大跳/resync/首帧）或周期锚或影子失配（resize）→ 全量
   *  字节快照;否则脏区增量（静水帧 ~4B vs 旧全量 8B/格）。
   *  ★R3b-3:sticky escape 带探针解除路径（见 _dF32Escape 注）——旧码破坏一次
   *  恒 f32 全量 8B/格（124MB/s 级）直到实例弃用。 */
  exportFieldDelta(forceFull: boolean): WWFieldMsg {
    const head = this._dHead();
    if (this._dF32Escape) {
      const probe = forceFull || ++this._dEscProbe >= WW_ESCAPE_PROBE_EVERY;
      if (probe) {
        this._dEscProbe = 0;
        const fb = this._dFullBytes();
        if (fb) {
          // 恢复 delta:清 sticky+重置锚节拍+影子对齐（与正常全量锚同语义）
          this._dF32Escape = false;
          this._dFrame = 0;
          this._dShR = this._R.slice(); this._dShG = this._G.slice();
          return { ...fb, ...head };
        }
      }
      return { fmt: 'f32', R: this._R.slice(), G: this._G.slice(), ...head };
    }
    this._dEscProbe = 0;
    this._dFrame++;
    const n = this._R.length;
    const needFull = forceFull || this._dShR.length !== n || this._dFrame >= WW_FULL_ANCHOR_EVERY;
    if (!needFull) {
      const enc = this._dEncode();
      if (enc === 'violation') return this._dViolate();
      if (enc) {
        // 影子补写（按跨度;未变格影子本就同相）
        const { meta, data, spans } = enc;
        const w = this._gW, R = this._R, G = this._G, shR = this._dShR, shG = this._dShG;
        for (let s = 0; s < spans; s++) {
          const y = meta[1 + s * 3], x0 = meta[2 + s * 3], len = meta[3 + s * 3];
          let i = y * w + x0;
          for (let t = 0; t < len; t++, i++) { shR[i] = R[i]; shG[i] = G[i]; }
        }
        return { fmt: 'delta', meta, data, ...head };
      }
    }
    this._dFrame = 0;
    const fb = this._dFullBytes();
    if (!fb) return this._dViolate();
    this._dShR = this._R.slice(); this._dShG = this._G.slice();
    return { ...fb, ...head };
  }

  setQuality(q: number): void {
    const clamped = Math.min(3, Math.max(0, Math.round(q)));   // Main.cs:4466-4473 钳 [0,3]
    if (clamped === this.quality) return;
    if (this._wwOn) { this._ww!.postMessage({ op: 'quality', q: clamped }); }   // ★C8：worker 侧同步换档
    this.quality = clamped;
    this.gates = waveSourceGates(this.quality);
    // 降档/升档横跳时缓冲回到中性（原版档位变化 → 滤镜重激活 → _clearNextFrame）
    this._clear();
  }

  /** 相机态（注入/采样换算共用；Renderer 在实体注入前调用） */
  setCamera(camX: number, camY: number, zoom: number): void {
    if (_wwCapture) { _wwStat.camQ++; _wwCapture.push({ k: 'camera', a: [camX, camY, zoom] }); return; }   // ★C8
    this._camX = camX; this._camY = camY; this._zoom = zoom;
  }

  /** 采样系缩放（css px / 世界 px；绘制侧换算位移用） */
  viewZoom(): number { return this._zoom; }

  /** 每渲染帧：Update(:112-129) + PreDraw(:336-360) + 涟漪队列注入。 */
  frame(inp: WaveFrameInput): void {
    // ★看门狗治理（2026-09-28）：阶梯重生分派——回落态下阶梯到期即重建 worker
    //  （shadow 双轨:本地模拟保持连续,worker 预热至首场到达切主）。?wwretry=0
    //  时 _wwRespawnAt 恒 0=旧「回落即终态」语义。
    if (!this._wwOn && this._wwRespawnAt !== 0) {
      const nowR = performance.now();
      if (nowR >= this._wwRespawnAt) {
        this._wwRespawnAt = 0;
        if (wwWorkerFlag) this._wwSpawnWorker(true);
      }
    }
    // ★C8：worker 模式=注入批+帧输入发往 worker,本地模拟整段跳过（读侧由
    //  _wwApplyField 快照喂）。主线程零阻塞;模拟在 worker 线程自harmless。
    //  ★治理批例外：_wwShadow（重生双轨）发完不早退,本地模拟继续跑（水不静止）。
    if (this._wwOn) {
      // ★失联看门狗（outstanding-aware,2026-09-28 治理重构）：「发了帧且最老未答
      //  请求年龄超预算（warmup 15s/稳态 2s）+双拍确认」才定谳失效——主线程忙/
      //  暂停/隐藏恢复（outstanding=0）永不定谳;onerror=硬证据直杀。宁可回落不可
      //  静态水（判例保留）,但回落不再是终态→阶梯重生。
      const now = performance.now();
      if (!this._wwWd!.healthy(now, this._wwErrored)) {
        _wwStat.falls++;
        _wwStat.fallsBy[this._wwWd!.fallReason()]++;
        console.warn('[WaveWaves] worker 失联回落主线程模拟 (' + this._wwWd!.fallReason()
          + ' @' + now.toFixed(0) + ',falls=' + _wwStat.falls + ')');
        // ★R2-F3（2026-09-25 红蓝批 B）：回落帧不得丢注入批——先摘 capture 态再
        //  把已捕获批按 capture 语义本地重放（injectWash/queueRippleRaw/setCamera
        //  走正常本地路径=worker 侧逐式同源;摘态在前,防重放再入 capture 批）。
        //  时序锚=F_prev:此刻 _scroll 仍是最后快照值,本帧注入+步进同帧完成。
        const pending = _wwCapture;
        _wwCapture = null;
        this._wwOn = false;
        this._wwShadow = false;
        try { this._ww?.terminate(); } catch { /* 已死 */ }
        this._ww = null;
        this._wwWd = null;
        this._wwErrored = false;
        this._replayInj(pending);
        // ★去永久化：阶梯重生（5s/10s/20s;?wwretry=0 逃生门=旧终态语义）
        if (workerRetryEnabled()) this._wwRespawnAt = now + ladderDelayMs(this._wwFallCount++);
        // 落回后继续走本地模拟（下方原路径）
      } else {
        this._wwTrySendTex();   // ★C8：纹理未就绪时随帧补发（一次性）
        const inj = _wwCapture || [];
        _wwCapture = [];
        _wwStat.posted++;
        this._wwWd!.onSend(now);
        this._ww!.postMessage({ op: 'frame', inp, inj });
        if (!this._wwShadow) return;
        // ★shadow 双轨（重生预热期）：已发 worker,本地模拟照跑——先把本批注入
        //  本地重放（摘态→重放→再武装,与回落帧同款防再入语义）,随后走本地路径。
        _wwCapture = null;
        this._replayInj(inj);
        _wwCapture = [];
      }
    }
    if (wwWorkerFlag) this._wwEnsure();   // 首帧惰性建（旗开即 Worker 化）
    this.setCamera(inp.camX, inp.camY, inp.zoom);
    this.intensity = waterDistortionIntensity(
      inp.windAbs, inp.rain, inp.tileX, inp.tileY,
      inp.maxTilesX, inp.maxTilesY, inp.worldSurface, inp.rockLayer);
    this.progress = (this.progress + inp.dt * this.intensity * 0.75) % 86400;

    const w = Math.max(1, Math.ceil(inp.viewW * 0.25));
    const h = Math.max(1, Math.ceil(inp.viewH * 0.25));
    this._ensure(w, h);

    // 相机滚动 F = floor(−camCss·0.25)（:149 `vector−screenPosition`=−camCss、
    // :155-157 ×0.25 floor）。★BJ89：dx/dy = F_n − F_{n−1} ≙ 原版 vector3，直接喂
    // _step（源索引 `x − dx` ≙ "新[p]=旧[p−vector3]"）——右/下移时 F 减小 → dx≤0 →
    // 内容 −|dx|（原版方向：世界锚定）。
    const sx = Math.floor(-inp.camX * inp.zoom * 0.25);
    const sy = Math.floor(-inp.camY * inp.zoom * 0.25);
    const dx = sx - this._scrollX, dy = sy - this._scrollY;

    if (this.quality === 0) {
      // 0 档：滤镜整体关闭（SceneState :129）——不注入不步进，缓冲回中性
      //（F 不更新：原版 StepLiquids 只在有源帧运行——重启用时 stale-F 大跳变落在
      // 中性缓冲上=无感，同原版）
      this._clear();
      _rqCount = 0;
      this._stepsLast = 0;
      return;
    }

    // 涟漪队列注入（DrawWaves :314-327；实体洗掠已由 Renderer 在 frame 前注入）。
    // ★注入锚=F_prev（DrawWaves :183 `vector2 = −_lastDistortionDrawOffset/0.25` 在
    // _last 更新【前】消费）——_scrollX 更新必须晚于全部注入（Renderer 实体洗掠在
    // frame 调用前=天然 F_prev；本处 _drawRipples 亦然）
    this._drawRipples();

    // 步进（PreDraw :343-349 min(queuedSteps,2)；正常 1 步、掉帧补 2）。
    // F 更新在 StepLiquids 内（:156-157）→ 只在真步进帧落盘（第二步增量 0）
    const steps = this.quality >= 2 ? (inp.dt > 1 / 60 + 1 / 240 ? 2 : 1) : 0;
    this._stepsLast = steps;
    if (steps > 0) {
      this._scrollX = sx; this._scrollY = sy;
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
   *  obj19 #13-#17 的采样坐标 = pixel/noise尺寸·{0.1,0.2} = 【噪声 UV】(0..1
   *  = 整张贴图)，而 noiseAt 的入参是【texel】。旧实现把 UV 值直接喂 texel 采样
   *  → 全屏落在第 0-1 个 texel 内 = 场恒定 → 静水只剩 ±0.1px 时间漂移抖动。
   *  正确换算：texel = uv·256(贴图边长)，即 px·{0.1,0.2} 与 prog·0.04·256。
   *  ★噪声场世界锚定(2026-09-14 BJ76 定谳，用户报"走动时波纹跟着角色跑")：
   *  obj19 #10-12 pixel = t0·uScreenResolution + uScreenPosition，其中
   *  uScreenPosition = UnscaledScreenPosition − offScreenRange = 相机可视左上
   *  （世界 px，ScreenShaderData.Apply）⇒ 原版噪声涟漪场采样【世界坐标】。
   *  本仓曾只实现 t0·uScreenResolution（屏幕 px）→ 涟漪场钉在屏幕上,走动时世界
   *  从场下滑过 = 波纹"跟着角色跑"。修复：噪声 uv 用世界 css px（屏幕 px +
   *  cam·cssZoom）；波场缓冲读 _readR 含读侧亚栅格补偿（uImageOffset 同域，
   *  ★BJ89——旧注"仍用屏幕 px 不改"已废：内容移向曾反+补偿缺=双速漂移）。 */
  sampleDisplace(worldX: number, worldY: number, out: [number, number]): void {
    out[0] = 0; out[1] = 0;
    if (this.quality === 0 || !_noiseData) return;
    const px = (worldX - this._camX) * this._zoom;
    const py = (worldY - this._camY) * this._zoom;
    const wpx = px + this._camX * this._zoom;   // 世界 css px = 屏幕 px + cam·cssZoom
    const wpy = py + this._camY * this._zoom;
    const u = wpx / _noiseW, v = wpy / _noiseH; // uv = 世界px/noise 尺寸（c0·pixel 域）
    const prog = this.progress;
    const d1v = v * 0.1 + prog * 0.04;          // n1 的 v 漂移（X 无漂移）
    // texel 坐标（noiseAt 吃 texel；×贴图边长 256）
    const gx = noiseAt(0, u * 0.1 * _noiseW, d1v * _noiseH) - noiseAt(0, u * 0.2 * _noiseW, (v * 0.2 - prog * 0.04) * _noiseH);
    const gy = noiseAt(1, u * 0.1 * _noiseW, d1v * _noiseH) - noiseAt(1, u * 0.2 * _noiseW, (v * 0.2 - prog * 0.04) * _noiseH);
    // 涟漪高度项：h' = bufR − 0.5（(1−0.4·bufB)=1，1456 bufB=0），钳 ±0.3 取负入 DISPY。
    // ★waveAmp：波形偏差增益（★默认 1=原版原样直通,2026-09-08 水面直线缝案定版,
    //   与 GLWaterDistortion.uploadWave 同值;2=2026-08-25 观感校准值,可显式 ?wamp=2
    //   取回,但位移×2 会加宽水线边缘"越出水体"的采样带=直线缝复现参数）
    const h = this._readR(px, py);
    // ★BJ78 W1(swPerf 快路径):上行 waveAmp 原为每调用 `new URLSearchParams`+闭包热分配
    //   （本函数每帧×表层水格数百次调用=全链最热分配点）。flag 开 → 走缓存读取面
    //   perfFlags.waveAmpParam(按 search 串键控,值逐位同——同一表达式含 fallback);
    //   flag 关 → 原样逐调用解析(现行行为逐位不变)。
    const waveAmp = swPerf ? waveAmpParam() : (() => { try { return Number(new URLSearchParams(location.search).get('wamp')) || 1; } catch { return 1; } })();
    const hClamp = Math.min(0.3, Math.max(-0.3, (h - 0.5) * waveAmp));
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
    const wpx = px + this._camX * this._zoom;   // 噪声场世界锚定（同 sampleDisplace,BJ76）
    const wpy = py + this._camY * this._zoom;
    const u = wpx / _noiseW, v = wpy / _noiseH;
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
    if (_wwCapture) { _wwStat.washQ++; _wwCapture.push({ k: 'wash', a: [centerX, centerY, quadW, quadH, flowX, flowY, strength] }); return; }   // ★C8
    if (this.quality === 0) return;
    const z = this._zoom;
    // ★BJ89 注入锚 = snapUp 栅格（DrawWaves :183 `vector4 = Center − vector2`，
    //  vector2 = −_lastDistortionDrawOffset/0.25 = −4F = snapUp(camCss)）——缓冲内容
    //  世界锚定在 4px 栅格（texel q ↔ 世界 css q·4 + snapUp），传播 shift 保持该锚，
    //  亚栅格余量由读侧补偿（_readR/waveReadOffset→uWaveOff）。旧实现锚真 cam +
    //  屏幕锚定读 = 双速漂移（探针实测 +40px 跳变后表观世界 1004→1080）。
    //  center·z + 4F ≡ center·z − snapUp（F=本帧滚动偏移，注入时= F_prev）
    const cx = (centerX * z + 4 * this._scrollX) * 0.25;
    const cy = (centerY * z + 4 * this._scrollY) * 0.25;
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
  /** ★C8 诊断:worker 模式是否激活（F5 报告/控制台访问面） */
  wwActive(): boolean { return this._wwOn; }

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
    // ★R2-F2:兜底查四数组——gW/gH 对不上快照换长后的 _R（worker 模式主线程
    //  _ensure 不跑,回落帧 _gW 已被快照改写）或 _R2/_G2 陈旧长时重建全套
    const n = w * h;
    if (w === this._gW && h === this._gH
      && this._R.length === n && this._R2.length === n) return;
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

  /** 读缓冲 R（屏幕 px → 缓冲 texel 双线性；非 pow2 缓冲 → clamp 采样语义）。
   *  ★BJ89 读侧亚栅格补偿（WaterShaderData.Apply :374 `UseImageOffset(
   *  -(vector2 − _lastDistortionDrawOffset/0.25))` = camCss − snapUp(−4F) ∈ (−4,0]；
   *  字节码 obj19 `mad r0.zw, t0·uScreenResolution + c11(uImageOffset)` → ×0.25 →
   *  texld s2）：缓冲内容锚在 4px 栅格（snapUp），补偿把真 cam 的亚栅格余量加回
   *  采样坐标 = 世界精确对齐（内容 texel q ↔ 世界 css q·4+snapUp；采样 (s+off)/4
   *  命中 s+cam−snap → 世界 s+cam ✓ 任意龄期 0px 漂移） */
  private _readR(px: number, py: number): number {
    const ox = this._camX * this._zoom + 4 * this._scrollX;
    const oy = this._camY * this._zoom + 4 * this._scrollY;
    const bx = (px + ox) * 0.25 - 0.5, by = (py + oy) * 0.25 - 0.5;
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
      // ★BJ89 注入锚 = snapUp 栅格（同 injectWash 注——:314-327 `Position − vector2`）
      const cx = (_rqX[q] * z + 4 * this._scrollX) * 0.25;
      const cy = (_rqY[q] * z + 4 * this._scrollY) * 0.25;
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

  /** WaterProcessor 一步（滚动增量 dx/dy = 原版 vector3 = F_n−F_{n−1}：源索引
   *  `x − dx` ≙ 新[p]=旧[p−vector3]——旧缓冲按 vector3 偏移画进清空 swap）。
   *  ★BJ89 两级出界语义（原版 = copy 与滤波同一 draw，旧纹理硬件 Clamp 采样器）：
   *   ①中心源出界（copy 未覆盖的新暴露区）= 中性 0.5（swap 清屏(0.5,0.5,0.5,1)残留；
   *     中性是内核不动点——旧 clamp 会把边缘 texel 拉成条带）；
   *   ②内核邻居采样越界（缓冲数组边缘）= clamp 边缘复制（硬件 sampler Clamp；
   *     dx=dy=0 时与 BJ78 W3 快路径逐位一致）。 */
  private _step(dx: number, dy: number): void {
    const w = this._gW, h = this._gH;
    const R = this._R, G = this._G, R2 = this._R2, G2 = this._G2;
    // ★WASM 第三刀(2026-10-03):旗开 → 惰性点火(幂等,fire-and-forget)+就绪走 WASM
    //  推进核;未就绪/失败/拒 → 静默落回下方 JS 三路径(逐字保留,fail-closed)。
    //  位级策略见 src/wasm/waves.as.ts 头注:内核纯 f64 零随机、AS Math.round=JS
    //  精确语义、WATER_DAMP 形参传入灭 libm 面;三 JS 路径(bj78/bj270 锁)互为
    //  逐位同值 → WASM 单核(快+泛形两支)复刻全部。
    if (wavesWasmEnabled()) {
      if (!wavesWasmReady()) void ensureWavesWasm();
      else if (wavesWasmStep(R, G, R2, G2, w, h, dx, dy, WATER_DAMP)) {
        this._R = R2; this._G = G2; this._R2 = R; this._G2 = G;
        return;
      }
    }
    if (swPerf && dx === 0 && dy === 0) {
      // ★BJ78 W3(swPerf 快路径)：dx=dy=0（静止相机的每一步 + 任何相机下每帧
      //   的第二步 _step(0,0)）时外提不变式成立——
      //     sy0 = y - dy ≡ y、sx0 = x - dx ≡ x，而 0≤y<h、0≤x<w 恒成立
      //     ⇒ clamp(y)=y、clamp(x)=x（yM=y、xM=x），剩余四邻钳制塌缩为
      //       一次边界三元（yU=y>0?y-1:0 / yD / xL / xR，与 min/max 逐值相同）；
      //     行基准 rowM = yM·w = y·w ⇒ 像素索引 i = y·w+x ≡ rowM+x（乘法外提）。
      //   核公式段与下方原路径【逐字同序】（S/wv/newH/双重量化/dv/gq）——
      //   位恒等由 tests/bj78-waves-swperf.test.ts 双支对拍+Math.min/max 计数锁。
      //   非零滚动增量（走动帧的第一步）走下方原路径逐字不动。
      for (let y = 0; y < h; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const rowM = y * w, rowU = yU * w, rowD = (y < h - 1 ? y + 1 : h - 1) * w;
        for (let x = 0; x < w; x++) {
          const xL = x > 0 ? x - 1 : 0;
          const xR = x < w - 1 ? x + 1 : w - 1;
          // 内联 waveProcessorStep（热循环零分配；公式+双重量化见纯函数版）
          const c = R[rowM + x], cg = G[rowM + x];
          const signedC = 2 * c - 1;
          const S = (2 * R[rowM + xL] - 1) + (2 * R[rowM + xR] - 1)
            + (2 * R[rowU + x] - 1) + (2 * R[rowD + x] - 1);
          const wv = (cg - 0.5) * (10 / 3);
          const newH = (signedC + 2 * (S * 0.25 - signedC) + wv * Math.abs(wv)) * WATER_DAMP;
          const i = rowM + x;
          const q = Math.round(512 * (newH * 0.5 + 0.5));
          let rq = Math.round((q < 0 ? 0 : q > 512 ? 1 : q / 512) * 256);
          if (rq <= 0) rq = 0; else if (rq > 256) rq = 256;   // ★C8-D `<=` 收 −0(Math.round(−0)=−0,旧 guard 漏)
          R2[i] = rq / 256;
          const dv = newH - signedC;
          let gq = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256);
          if (gq < 0) gq = 0; else if (gq > 256) gq = 256;
          G2[i] = gq / 256;
        }
      }
      this._R = R2; this._G = G2; this._R2 = R; this._G2 = G;
      return;
    }
    if (swPerf) {
      // ★BJ270 内域快路径(2026-09-22,Windows 丛林卡顿 trace:_step 全 trace self
      //  2.27s/6.8%,走动帧走下方原路径=每像素 3 次 x 钳制 min/max+分支)。判据:
      //   内域像素满足 sx0=x-dx∈[1,w-2] 且 sy0=y-dy∈[1,h-2] ⇒ xL/xM/xR 与
      //   yU/yM/yD 的钳制全部不缚(xL=sx0-1/xM=sx0/xR=sx0+1、yU=sy0-1/yM=sy0/
      //   yD=sy0+1 逐值同)+中性出界支不可达 ⇒ 免钳制免分支,核公式段与原路径
      //   【逐字同序】(位恒等 by construction,tests/bj270-waves-interior.test.ts
      //   随机场/走动/大跳 dx,dy 双支对拍+min/max 计数锁)。内域=行走帧的
      //   ~全格(dx,dy∈{-1,0,1} 时内域≈(w-2)×(h-2));W3(dx=dy=0)仍走上方专路。
      //   原路径整段保留于下方= ?swperf=0 豁免臂逐字不动。
      //   ★BJ289 GPU 段指针：BJ270 trace 期 T3 观察「GPU 进程 ~50% busy」——
      //   判读=GPU 半忙非饱和,瓶颈在 CPU 侧读回/步进（与本刀落点一致）;
      //   登记=memory bj270 判例文件 GPU 段（观察项非缺陷定谳,后续 perf 波判读背景:
      //   若现 GPU>80% 且 CPU self 低,再启 canvas/GPU 分工核查）。
      const xLo = Math.max(0, dx + 1), xHi = Math.max(xLo, Math.min(w, dx + w - 1));
      const yLo = Math.max(0, dy + 1), yHi = Math.max(yLo, Math.min(h, dy + h - 1));
      // 边缘像素(内域外的 L 形带:出界中性/0、w-1 与 h-1 缚边钳制)——与原路径
      // 逐值同式;闭包每 _step 一次,边缘像素占比 O(边缘带) 极薄
      const edgePx = (x: number, y: number, sy0: number, yIn: boolean,
        rowU: number, rowM: number, rowD: number): void => {
        const sx0 = x - dx;
        const i = y * w + x;
        if (!yIn || sx0 < 0 || sx0 >= w) {
          R2[i] = 0.5; G2[i] = 0.5;        // ① 未覆盖区中性(非 clamp 条带)
          return;
        }
        const xL = Math.min(w - 1, Math.max(0, sx0 - 1));
        const xM = Math.min(w - 1, Math.max(0, sx0));
        const xR = Math.min(w - 1, Math.max(0, sx0 + 1));
        const c = R[rowM + xM], cg = G[rowM + xM];
        const signedC = 2 * c - 1;
        const S = (2 * R[rowM + xL] - 1) + (2 * R[rowM + xR] - 1)
          + (2 * R[rowU + xM] - 1) + (2 * R[rowD + xM] - 1);
        const wv = (cg - 0.5) * (10 / 3);
        const newH = (signedC + 2 * (S * 0.25 - signedC) + wv * Math.abs(wv)) * WATER_DAMP;
        const q = Math.round(512 * (newH * 0.5 + 0.5));
        let rq = Math.round((q < 0 ? 0 : q > 512 ? 1 : q / 512) * 256);
        if (rq <= 0) rq = 0; else if (rq > 256) rq = 256;   // ★C8-D `<=` 收 −0(Math.round(−0)=−0,旧 guard 漏)
        R2[i] = rq / 256;
        const dv = newH - signedC;
        let gq = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256);
        if (gq < 0) gq = 0; else if (gq > 256) gq = 256;
        G2[i] = gq / 256;
      };
      for (let y = 0; y < h; y++) {
        const sy0 = y - dy;
        const yIn = sy0 >= 0 && sy0 < h;
        if (yIn && y >= yLo && y < yHi) {
          // 内域行:三邻行自动在界(yU=sy0-1/yM=sy0/yD=sy0+1 无钳制)
          const rowM = sy0 * w, rowU = (sy0 - 1) * w, rowD = (sy0 + 1) * w;
          for (let x = 0; x < xLo; x++) edgePx(x, y, sy0, true, rowU, rowM, rowD);
          for (let x = xLo; x < xHi; x++) {
            const sx0 = x - dx;             // ∈[1,w-2](xLo/xHi 构造保证)
            const xL = sx0 - 1, xM = sx0, xR = sx0 + 1;
            const i = y * w + x;
            const c = R[rowM + xM], cg = G[rowM + xM];
            const signedC = 2 * c - 1;
            const S = (2 * R[rowM + xL] - 1) + (2 * R[rowM + xR] - 1)
              + (2 * R[rowU + xM] - 1) + (2 * R[rowD + xM] - 1);
            const wv = (cg - 0.5) * (10 / 3);
            const newH = (signedC + 2 * (S * 0.25 - signedC) + wv * Math.abs(wv)) * WATER_DAMP;
            const q = Math.round(512 * (newH * 0.5 + 0.5));
            let rq = Math.round((q < 0 ? 0 : q > 512 ? 1 : q / 512) * 256);
            if (rq <= 0) rq = 0; else if (rq > 256) rq = 256;   // ★C8-D `<=` 收 −0(Math.round(−0)=−0,旧 guard 漏)
            R2[i] = rq / 256;
            const dv = newH - signedC;
            let gq = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256);
            if (gq < 0) gq = 0; else if (gq > 256) gq = 256;
            G2[i] = gq / 256;
          }
          for (let x = xHi; x < w; x++) edgePx(x, y, sy0, true, rowU, rowM, rowD);
        } else {
          const yU = Math.min(h - 1, Math.max(0, sy0 - 1));   // 上邻(uv y 向下)
          const yM = Math.min(h - 1, Math.max(0, sy0));
          const yD = Math.min(h - 1, Math.max(0, sy0 + 1));
          const rowM = yM * w, rowU = yU * w, rowD = yD * w;
          for (let x = 0; x < w; x++) edgePx(x, y, sy0, yIn, rowU, rowM, rowD);
        }
      }
      this._R = R2; this._G = G2; this._R2 = R; this._G2 = G;
      return;
    }
    for (let y = 0; y < h; y++) {
      const sy0 = y - dy;
      const yU = Math.min(h - 1, Math.max(0, sy0 - 1));   // 上邻（uv y 向下）
      const yM = Math.min(h - 1, Math.max(0, sy0));
      const yD = Math.min(h - 1, Math.max(0, sy0 + 1));
      const rowM = yM * w, rowU = yU * w, rowD = yD * w;
      // ★BJ89 ①中心源覆盖判定：源出界 = swap 未被 copy 覆盖的中性区（先于内核）；
      //   ②邻居/中心越界仍 clamp（硬件 sampler Clamp——dx=0 时与 W3 快路径逐位一致）
      const yIn = sy0 >= 0 && sy0 < h;
      for (let x = 0; x < w; x++) {
        const sx0 = x - dx;
        const i = y * w + x;
        if (!yIn || sx0 < 0 || sx0 >= w) {
          R2[i] = 0.5; G2[i] = 0.5;        // ① 未覆盖区中性（非 clamp 条带）
          continue;
        }
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
        const q = Math.round(512 * (newH * 0.5 + 0.5));
        let rq = Math.round((q < 0 ? 0 : q > 512 ? 1 : q / 512) * 256);
        if (rq <= 0) rq = 0; else if (rq > 256) rq = 256;   // ★C8-D `<=` 收 −0(Math.round(−0)=−0,旧 guard 漏)
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
  /** 波场读侧亚栅格补偿（obj19 c11=uImageOffset；WaterShaderData.Apply :374）——
   *  = camCss − snapUp(−4F) ∈ (−4,0] css px，GLWaterDistortion uWaveOff 消费
   *  （与 _readR 的 CPU 侧补偿同式）。必须在 waterWaves.frame() 之后读取
   *  （_camX/_scrollX 同帧态）。 */
  waveReadOffset(): [number, number] {
    return [this._camX * this._zoom + 4 * this._scrollX, this._camY * this._zoom + 4 * this._scrollY];
  }
  /** 测试用：重置到干净态 */
  resetForTest(): void {
    this._gW = 0; this._gH = 0;
    this.progress = 0; this._scrollX = 0; this._scrollY = 0;
    this.quality = -1;          // 使后续 setQuality 必经换档路径（重算 gates）
    _rqCount = 0;
    // ★C8-D:增量编码态一并归零（影子/锚帧计数/f32 逃生）——单例生产者跨场景
    // 串态会让新场景首场消息误判 delta（消费者空场 → resync 丢帧=假红）。
    this._dShR = new Float32Array(0); this._dShG = new Float32Array(0);
    this._dFrame = 0; this._dF32Escape = false;
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
  /** ★偏离实验 v2：入水翻转 tick 液面 Y——wet 窗口内涟漪+洗掠 Y 钳此线
   *  （原版跟身沉底，高速落入时扰动全部在水下=水面线无感，用户实测定罪） */
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
