// 天塔柱族全屏滤镜（Monolith 全家）1:1 移植：
//  - 触发链：Wiring.cs:2025-2036（410/480/509/657/658/720/721/725/733 → WorldGen.SwitchMonolith）
//    → WorldGen.cs:51023-51169（翻帧）→ SceneMetrics.ScanOnScreenTiles :524-583（视区扫描出
//    ActiveMonolithType / BloodMoon / Echo / Shimmer / CRT / Retro / Noir / RadioThing）→
//    SceneState.cs:105-128（ManageSpecialBiomeVisuals → Filters.Scene[...]）→
//    FilterManager.cs（Opacity 斜坡 1/s，按 EffectPriority 升序合成）。
//  - 本文件 = 视区扫描 + 滤镜状态机 + canvas 等价绘制（原版是 HLSL 后处理，二进制不在
//    反编译源码里；凡源码里有的数值——颜色/不透明度/强度/斜坡率/深度系数——全部照抄并注行号）。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';
import { noiseData } from './GLScreenFilters';

// ---------------------------------------------------------------------------
// 1) 天塔柱族 tile 表（内部 id ↔ 原版 sheet）
// ---------------------------------------------------------------------------

/** sheet → 激活判定阈值（SceneMetrics.ScanOnScreenTiles :524-583）：
 *  410/509：frameY ≥ 56 才激活；480/657/720/721/725/733：frameY ≥ 54；
 *  658（以太柱）三态：ShimmerMonolithState = frameY/54（0 关/1 开/2 关且压暗——
 *  SceneState.cs:331-332 的特殊门）。注意 SwitchMonolith 对 509 翻帧步长是 54
 *  （WorldGen.cs:51085-51092），但 SceneMetrics 判激活用 ≥56——两处照抄，勿"修齐"。 */
const MONO_THRESHOLD: Record<number, number> = {
  410: 56, 509: 56, 480: 54, 657: 54, 658: 54, 720: 54, 721: 54, 725: 54, 733: 54,
};

/** 内部 tile id → sheet（只含柱族，扫描循环内 Set 命中后才做 Map 反查） */
const MONO_SHEET = new Map<number, number>();   // internalId → sheet
const MONO_IDS = new Set<number>();             // internalId 集合（快速门）
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
  if (sheet in MONO_THRESHOLD) { MONO_SHEET.set(i, sheet); MONO_IDS.add(i); }
}

// ---------------------------------------------------------------------------
// 2) 视区扫描（SceneMetrics.ScanOnScreenTiles 天塔柱子集 1:1）
// ---------------------------------------------------------------------------

/** SceneMetrics.cs:226-242 的器件态字段（Reset 初值 :830-839） */
export interface MonolithSceneState {
  /** ActiveMonolithType：-1 关；0 星璇/1 星云/2 星尘/3 耀斑/4 月总（SceneState.cs:111-115） */
  activeMonolithType: number;
  bloodMoonMonolith: boolean;
  echoMonolith: boolean;
  /** ShimmerMonolithState = frameY/54（0/1/2 三态；SceneMetrics.cs:553-555） */
  shimmerMonolithState: number;
  crtMonolith: boolean;
  retroMonolith: boolean;
  noirMonolith: boolean;
  radioThingMonolith: boolean;
}

export function emptyMonolithScene(): MonolithSceneState {
  return {
    activeMonolithType: -1, bloodMoonMonolith: false, echoMonolith: false,
    shimmerMonolithState: 0, crtMonolith: false, retroMonolith: false,
    noirMonolith: false, radioThingMonolith: false,
  };
}

export interface TileRect { x0: number; y0: number; x1: number; y1: number } // [x0,x1) 半开

/** GetAreaToLight（Main.cs:63364-63377）+ Inflate(28,28)（Main.cs:61983-61985）
 *  + ClampToWorld（SceneMetrics.cs:455）。cam 为视区中心世界 px；zoom 后可见
 *  世界宽 = viewW/zoom（与 Camera.clamp 同式） */
export function visualScanRect(
  camX: number, camY: number, viewW: number, viewH: number, zoom: number,
  worldW: number, worldH: number,
): TileRect {
  const left = camX - viewW / 2 / zoom, top = camY - viewH / 2 / zoom;
  const right = left + viewW / zoom, bottom = top + viewH / zoom;
  // Main.cs:63370-63373：左/上 -1，右/下 +2（右端是排他上界）
  const x0 = Math.floor(left / 16) - 1 + 28;   // Inflate(28,28)（:61984）
  const y0 = Math.floor(top / 16) - 1 + 28;
  const x1 = Math.floor(right / 16) + 2 + 28;
  const y1 = Math.floor(bottom / 16) + 2 + 28;
  return {
    x0: Math.max(0, x0), y0: Math.max(0, y0),
    x1: Math.min(worldW, x1), y1: Math.min(worldH, y1),
  };
}

/** 天塔柱子集扫描（SceneMetrics.cs:453-583 1:1）。语义要点：
 *  - 只有"激活帧"才赋值（关帧不回写 -1）——与 Reset()+仅激活赋值的原版链路一致，
 *    同屏多柱时后扫到者覆盖（原版逐格直接赋值 :529-530/:536）；
 *  - 658 无条件赋 frameY/54（三态柱，关态也是有效状态）；
 *  - ★扫描序 = 【列主序】（2026-10-06 多柱串柱刀登记债清偿）：原版外层
 *    `for (i = Left..Right)`（X）、内层 `for (j = Top..Bottom)`（Y）——
 *    SceneMetrics.cs:456-458（1456 同位 :456-458 双锚）。后扫到者覆盖的赢家序 =
 *    最右列优先（同列取最下）。旧实现行主序（Y 外 X 内）→ 同屏 ≥2 激活态柱
 *    （410 异型 / 658 异态）时 ActiveMonolithType / ShimmerMonolithState 的
 *    赢家 = 最下行,与原版不符；布尔族字段（480/657/720/721/725/733）赋 true
 *    幂等零观察面。 */
export function scanMonolithScene(st: TileStore, r: TileRect): MonolithSceneState {
  const out = emptyMonolithScene();
  for (let x = r.x0; x < r.x1; x++) {
    for (let y = r.y0; y < r.y1; y++) {
      const i = y * st.w + x;
      if (!st.flags[i]) continue;
      const t = st.type[i];
      if (!MONO_IDS.has(t)) continue;
      const sh = MONO_SHEET.get(t)!;
      const fy = st.frameY[i];
      switch (sh) {
        case 410:                                    // :524-530
          if (fy >= 56) out.activeMonolithType = Math.floor(st.frameX[i] / 36);
          break;
        case 509:                                    // :532-536
          if (fy >= 56) out.activeMonolithType = 4;
          break;
        case 480: if (fy >= 54) out.bloodMoonMonolith = true; break;   // :538-542
        case 657: if (fy >= 54) out.echoMonolith = true; break;        // :544-548
        case 658: out.shimmerMonolithState = Math.floor(fy / 54); break; // :550-555
        case 720: if (fy >= 54) out.crtMonolith = true; break;         // :557-561
        case 721: if (fy >= 54) out.retroMonolith = true; break;       // :563-567
        case 725: if (fy >= 54) out.noirMonolith = true; break;        // :569-573
        case 733: if (fy >= 54) out.radioThingMonolith = true; break;  // :575-579
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3) 滤镜定义（ScreenEffectInitializer.cs:15-47）+ 合成次序（FilterManager）
// ---------------------------------------------------------------------------

/** EffectPriority（EffectPriority.cs）：VeryLow=0 Low=1 Medium=2 High=3 VeryHigh=4。
 *  FilterManager.OnActivate 按优先级升序插入链表，EndCapture 依链表顺序叠加
 *  （:49-66/:158-176）→ VeryHigh（CRT/Test2）最后画在最上层。 */
export const PRIORITY_MEDIUM = 2;
export const PRIORITY_VERYHIGH = 4;

type FilterKind = 'miniTower' | 'moonLord' | 'graveyard' | 'bloodMoon' | 'sepia' | 'noir' | 'retro' | 'crt';

interface MonoFilterDef {
  key: string;            // Filters.Scene 键（ScreenEffectInitializer.cs）
  sceneKey: string;       // 激活来源（SceneState.cs:109-128）
  priority: number;
  kind: FilterKind;
  /** FilterMiniTower 的 UseColor + UseOpacity（ScreenEffectInitializer.cs:18-21） */
  color?: readonly [number, number, number];
  useOpacity?: number;
  /** MoonLordScreenShaderData.aimAtPlayer（:8-9）：true=MonolithMoonLord 目标=
   *  SceneMetrics.Center（玩家屏幕位）；false=场景 MoonLord 滤镜目标=核心位 */
  aimAtPlayer?: boolean;
}

export const MONOLITH_FILTER_DEFS: readonly MonoFilterDef[] = [
  // 天塔柱四色（SceneState.cs:111-114；FilterMiniTower :18-21）
  { key: 'MonolithVortex', sceneKey: 'MonolithVortex', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [0, 0.7, 0.7], useOpacity: 0.5 },
  { key: 'MonolithNebula', sceneKey: 'MonolithNebula', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [1, 0, 0.9], useOpacity: 0.35 },
  { key: 'MonolithStardust', sceneKey: 'MonolithStardust', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [0, 0.5, 1], useOpacity: 0.5 },
  { key: 'MonolithSolar', sceneKey: 'MonolithSolar', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [1, 0.7, 0], useOpacity: 0.3 },
  // 月总柱（SceneState.cs:115；MoonLordScreenShaderData :21-44 aimAtPlayer）
  { key: 'MonolithMoonLord', sceneKey: 'MonolithMoonLord', priority: PRIORITY_MEDIUM, kind: 'moonLord', aimAtPlayer: true },
  // 月总战滤镜（SceneState.cs:109；ScreenEffectInitializer.cs:22 VeryHigh，
  // MoonLordScreenShaderData("FilterMoonLord", aimAtPlayer:false)——目标=核心位）
  { key: 'MoonLord', sceneKey: 'MoonLord', priority: PRIORITY_VERYHIGH, kind: 'moonLord', aimAtPlayer: false },
  // 墓地雾（SceneState.cs:124 `GraveyardVisualIntensity > 0`；ScreenEffectInitializer.cs:25
  // 注册位于 MonolithMoonLord 之后、BloodMoon 之前——同 Medium 按此序合成）
  { key: 'Graveyard', sceneKey: 'Graveyard', priority: PRIORITY_MEDIUM, kind: 'graveyard' },
  // 血月柱（SceneState.cs:116；BloodMoonScreenShaderData.UseColor(2,-0.8,-0.6) :27）
  { key: 'BloodMoon', sceneKey: 'BloodMoon', priority: PRIORITY_MEDIUM, kind: 'bloodMoon', color: [2, -0.8, -0.6] },
  // 收音机 → Sepia（SceneState.cs:125；SepiaScreenShaderData :28）
  { key: 'Sepia', sceneKey: 'Sepia', priority: PRIORITY_MEDIUM, kind: 'sepia' },
  // 黑白 → Noir（SceneState.cs:126；FilterNoir :29）
  { key: 'Noir', sceneKey: 'Noir', priority: PRIORITY_MEDIUM, kind: 'noir' },
  // 复古 → "Test2"（SceneState.cs:128；FilterTest2 :46）
  { key: 'Test2', sceneKey: 'Test2', priority: PRIORITY_VERYHIGH, kind: 'retro' },
  // CRT（SceneState.cs:127；FilterCRT :47）
  { key: 'CRT', sceneKey: 'CRT', priority: PRIORITY_VERYHIGH, kind: 'crt' },
];

// ---------------------------------------------------------------------------
// 3b) 天塔柱滤镜 vs ScreenShader.cso SM2 字节码审计结论表（2026-08-20）
//
// 反汇编：node tools/disasm-fx.mjs ../terraria-assets/ScreenShader.cso <out>
//（"disasm:" 列 = 反汇编输出行号；fxScreen.txt 与 tools 同步再生）。
// glExact=true 的走 GLScreenFilters（GLSL 逐指令 1:1）；false = GL 不可用时
// 的 canvas 近似即最终态（差异登记在 note）。
// ---------------------------------------------------------------------------
export interface FilterAuditRow {
  /** Filters.Scene 键 */
  key: string;
  /** ScreenShader.cso pass 名（ScreenEffectInitializer.cs） */
  pass: string;
  /** 反汇编输出行号锚 */
  disasm: string;
  /** GL 字节码 1:1 端口就位 */
  glExact: boolean;
  note: string;
}

export const MONOLITH_FILTER_AUDIT: readonly FilterAuditRow[] = [
  {
    key: 'MonolithVortex/Nebula/Stardust/Solar', pass: 'FilterMiniTower', disasm: ':483-508',
    glExact: true,
    note: '字节码=tgt=(s=V+min−1)≥0?lerp(color,1−color,s):(V+min)·color，out=lerp(px,tgt·px.a,op)；'
      + '旧 canvas 近似=multiply(white,color,a) 已由 GL 路径替换（2D 回退仍近似）',
  },
  {
    key: 'Graveyard', pass: 'FilterGraveyard', disasm: ':159-175', glExact: true,
    note: '字节码=纯去饱和 lerp(px,gray=(Σrgb)·1.2/3·progress,op)；无径向雾、无色偏——'
      + '旧近似(multiply 冷灰+径向雾)为自创，GL 路径已替换',
  },
  {
    key: 'BloodMoon', pass: 'FilterBloodMoon', disasm: ':429-482', glExact: true,
    note: '字节码=V+min 分档(sum≤1→sum·color / 否则 1−(1−color)(1.5−0.5sum)) −0.5·sum，'
      + '×(diff+1/6)+0.5·sum，α 抛物线 0.3A+0.7A²，径向 (len(uv−.5)≥.3)?1−2(d−.3):1 不夹下界；'
      + '旧近似=multiply(白,color,op·深度) 已替换',
  },
  {
    key: 'Test2(复古柱)', pass: 'FilterTest2', disasm: ':1122-1152', glExact: true,
    note: '字节码=GB 四阶调色板：x=clamp((V+min)·0.55−0.1,0,∞)，档 0.25/0.5/0.75 → '
      + 'c3(15,56,15)/c4(48,98,48)/c5(139,172,15)/c2(155,188,15)，out=lerp(px,pal,op)；'
      + '旧近似(luma 四档+错误调色板)已替换',
  },
  {
    key: 'CRT', pass: 'FilterCRT', disasm: ':1182-1238', glExact: true,
    note: '字节码=交叉桶形畸变(1+(uv·op/7)²,opacity 缩放)+越界遮黑(bottom/left/top 不含右)'
      + '+sincos 扫描线(fract(y·screenH·zoom·0.222656)·2π−π,cos×0.13/sin×0.16 RGB 相位)；'
      + '旧近似(3px 扫描线+暗角)已替换',
  },
  {
    key: 'HeatDistortion', pass: 'FilterHeatDistortion', disasm: ':839-871', glExact: true,
    note: '本批新增：双噪声场差分重采样（详见 GLScreenFilters FRAG_HEAT + heat 公式锚）',
  },
  {
    key: 'MonolithMoonLord', pass: 'FilterMoonLord', disasm: ':103-158', glExact: false,
    note: '未端口：字节码=绕 uTargetPosition 的色散(split ±0.01·sin(2π·frac(t·10/π+0.5)−π)，'
      + '径向门 min(d·0.0005,1))+0.15/0.7/0.15 三采样合成+V·3 亮度推色+800px 掩码带，'
      + '~35 指令重度跨通道(wzyx)置换——沿用 canvas 径向紫晕近似',
  },
  {
    key: 'MoonLord(月总战滤镜)', pass: 'FilterMoonLord', disasm: ':103-158', glExact: false,
    note: '同 MonolithMoonLord 的 pass（ScreenEffectInitializer.cs:22-24 唯一差异=aimAtPlayer:false，'
      + 'UseTargetPosition=Moon Lord Core(npc type 398).Center——MoonLordScreenShaderData.cs:42-45）；'
      + '激活门=SceneState.cs:109 ClosestNPCPosition[398]≠Zero（全场 NPC 扫描 SceneMetrics.cs:739-763，'
      + '非仅视区）；EffectPriority.VeryHigh → 合成序在 Medium 柱族之后。canvas 同款径向紫晕近似',
  },
  {
    key: 'Sepia', pass: 'FilterSepia', disasm: ':176-247', glExact: true,
    note: '★shader 修齐批终口已端口（GLScreenFilters FRAG_SEPIA）：DSTNoise² 门选+亮度'
      + 'HSV 饱和度链（c11.yzx 权重,四倍斜率 sat）+uColor 1/3 调色+第二 vibrance'
      + '(uProgress)+径向 vignette(1.1)+双 lerp；def 常量逐值照抄（c11-c14）,'
      + 'c11 域 swizzle 组合按 CRYSTAL_VORTEX「掩码近似」先例备案',
  },
  {
    key: 'Noir', pass: 'FilterNoir', disasm: ':248-341', glExact: true,
    note: '★shader 修齐批终口已端口（GLScreenFilters FRAG_NOIR）：exp/log 胶片颗粒'
      + 'hash(19.83/32/1024 族)→NoirNoise(s1,PointWrap→NEAREST) 门选+亮度去饱和'
      + '(c11 三权)+c12/c13 三次多项式对比+径向压暗；uTime 滚动颗粒',
  },
];

// ---------------------------------------------------------------------------
// 4) 原版数学小工具（Utils.cs / MathHelper.cs）
// ---------------------------------------------------------------------------

/** Utils.SmoothStep（Utils.cs:126-129）= 线性夹取（非 hermite） */
export function smoothStep(min: number, max: number, x: number): number {
  return Math.max(0, Math.min(1, (x - min) / (max - min)));
}

/** Utils.Remap（Utils.cs:313-316，clamped） */
export function remap(v: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + (toMax - toMin) * smoothStep(fromMin, fromMax, v);
}

/** MathHelper.MoveTowards（MathHelper.cs：按 maxDelta 步进，不超过 target） */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

// ---- HeatDistortion 公式锚（ScreenShader.cso obj18 :839-871；GLScreenFilters
//      FRAG_HEAT 与 drawHeat2D 同用本组纯函数，防两处漂移）----

/** preshader lit20/lit21（:865-866）：c1 = +0.04·uTime（c2 = −c1） */
export const HEAT_TIME_SCROLL = 0.04;
/** def c6.y（:857）：delta = nA − nB − 0.5 的中心偏置 */
export const HEAT_DELTA_BIAS = -0.5;

/** 噪声采样 UV（:846-849,851）：world=uScreenRes·uv+uScreenPos；nuv=world/噪声尺寸×0.5 */
export function heatNoiseUv(
  uvX: number, uvY: number,
  screenRes: readonly [number, number] | { x: number; y: number },
  screenPos: readonly [number, number] | { x: number; y: number },
  noiseW: number, noiseH: number,
): [number, number] {
  const rx = 'x' in screenRes ? screenRes.x : screenRes[0];
  const ry = 'y' in screenRes ? screenRes.y : screenRes[1];
  const px = 'x' in screenPos ? screenPos.x : screenPos[0];
  const py = 'y' in screenPos ? screenPos.y : screenPos[1];
  return [((uvX * rx + px) / noiseW) * 0.5, ((uvY * ry + py) / noiseH) * 0.5];
}

/** preshader c3（:867 flat-slot 语义）= (uIntensity·uOpacity)/uScreenResolution.xy */
export function heatOffset(
  intensity: number, opacity: number,
  screenRes: readonly [number, number] | { x: number; y: number },
): [number, number] {
  const s = intensity * opacity;
  const rx = 'x' in screenRes ? screenRes.x : screenRes[0];
  const ry = 'y' in screenRes ? screenRes.y : screenRes[1];
  return [s / rx, s / ry];
}

/** :856-858：uvOut = uv + (nA − nB + HEAT_DELTA_BIAS)·offset（nA/nB=噪声 .rg） */
export function heatUvOut(
  uvX: number, uvY: number,
  nAx: number, nAy: number, nBx: number, nBy: number,
  offset: readonly [number, number],
): [number, number] {
  return [
    uvX + (nAx - nBx + HEAT_DELTA_BIAS) * offset[0],
    uvY + (nAy - nBy + HEAT_DELTA_BIAS) * offset[1],
  ];
}

/** Utils.GetDayTimeAsDirectionIn24HClock（Utils.cs:738-757）：
 *  (0,-1) 绕原点转 hour/24*2π（XNA RotatedBy：x'=x·cos−y·sin, y'=x·sin+y·cos） */
function clockDir(hour: number): [number, number] {
  const a = hour / 24 * Math.PI * 2;
  return [Math.sin(a), -Math.cos(a)];
}

/** Sepia 的日夜功率（SepiaScreenShaderData.GetDaylightPowers :41-65）。
 *  hour24 = 0-24 小时制（4.5=黎明 4:30、12=正午、19.5=黄昏 7:30，昼夜分界同
 *  GetDayTimeAs24FloatStartingFromMidnight Utils.cs:738-745）；nightElapsed01 =
 *  Main.time/32400（夜程进度 0-1）。dayTime = 白天旗。 */
export function daylightPowers(hour24: number, nightElapsed01: number, dayTime: boolean) {
  const [dx, dy] = clockDir(hour24);
  const [d45x, d45y] = clockDir(4.5);
  const [d0x, d0y] = clockDir(0);
  const fromValue = dx * d0x + dy * d0y;
  const fromValue2 = dx * d45x + dy * d45y;
  let nightlightPower = remap(fromValue, -0.2, 0.1, 0, 1);   // :53
  const daylightPower = remap(fromValue, 0.1, -1, 0, 1);     // :54
  const dawnPower = remap(fromValue2, 0.66, 1, 0, 1);        // :55
  let moonPower = 0;
  if (!dayTime) {                                            // :56-64
    let num = nightElapsed01 * 2;
    if (num > 1) num = 2 - num;
    moonPower = remap(num, 0, 0.25, 0, 1);
  }
  return { nightlightPower, daylightPower, dawnPower, moonPower };
}

/** Sepia 滤镜参数（SepiaScreenShaderData.Update :10-39 1:1）。
 *  cloudAlpha=Main.cloudAlpha、worldBloodMoon=Main.bloodMoon、fullMoon=满月相、
 *  screenTileY=(screenPosition.Y+screenHeight/2)/16、worldSurface=地表 tile 线。 */
export interface SepiaParams { progress: number; intensity: number; color: [number, number, number] }

export function sepiaParams(env: {
  dayTime: boolean; hour24: number; nightElapsed01: number;
  worldBloodMoon: boolean; fullMoon: boolean; cloudAlpha: number;
  screenTileY: number; worldSurface: number;
}): SepiaParams {
  const num = 1 - smoothStep(env.worldSurface, env.worldSurface + 30, env.screenTileY); // :12-13
  let vector: [number, number, number] = [0.191, -0.054, -0.221];                       // :15-16
  const half = vector.map((c) => c * 0.5) as [number, number, number];                  // value2 :17
  const value3: [number, number, number] = [0, -0.03, 0.15];                            // :18
  const value4: [number, number, number] = [-0.11, 0.01, 0.16];                         // :19
  let { nightlightPower, daylightPower, dawnPower, moonPower } =
    daylightPowers(env.hour24, env.nightElapsed01, env.dayTime);
  let num2 = nightlightPower * 0.13;                                                    // :21
  // starGame 分支（:24-31）不适用（无星旋天种世界）；走 else if !dayTime
  if (!env.dayTime) {                                                                  // :32-40
    if (env.fullMoon) {
      vector = [-0.19, 0.01, 0.22];
      num2 += 0.07 * moonPower;
    }
    if (env.worldBloodMoon) {
      vector = [0.2, -0.1, -0.221];
      num2 = 0.2;
    }
  }
  nightlightPower *= num; daylightPower *= num; moonPower *= num;                       // :41-44
  const intensity = 1.4 - daylightPower * 0.2;                                          // :46
  let value5 = 0.3 - num2 * nightlightPower;                                            // :47
  value5 = value5 + (0.1 - value5) * env.cloudAlpha;                                    // :48
  value5 = value5 + (0.2 - value5) * (1 - num);                                         // :49-50
  const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // :52-55（value = 月相/血月覆盖后的基色；value2 = 基色×0.5）
  let v7 = lerp3(vector, vector, moonPower);   // moonPower=0（白天）时即基色自身
  v7 = lerp3(v7, value3, dawnPower);
  v7 = lerp3(v7, value4, env.cloudAlpha);
  v7 = lerp3(v7, half, 1 - num);
  return { progress: value5, intensity, color: v7 };
}

// ---------------------------------------------------------------------------
// 5) 状态机（SceneState + FilterManager）
// ---------------------------------------------------------------------------

/** 滤镜环境（每帧由 Renderer 注入；字段对应原版 Main/SceneMetrics 状态） */
export interface MonolithEnv {
  worldSurface: number;      // Main.worldSurface（tile）
  rockLevel: number;         // Main.rockLayer（tile）
  screenTileY: number;       // (screenPosition.Y + screenHeight/2)/16
  dayTime: boolean;          // Main.dayTime
  hour24: number;            // Utils.GetDayTimeAs24FloatStartingFromMidnight
  nightElapsed01: number;    // Main.time/32400（夜程 0-1）
  fullMoon: boolean;         // Main.GetMoonPhase()==Full
  worldBloodMoon: boolean;   // Main.bloodMoon
  cloudAlpha: number;        // Main.cloudAlpha
  /** SceneState.cs:110 flag4：四天塔在附近时压掉柱滤镜（★BJ109-I 2026-09-16 已接真喂数
   *  = 任一存活塔 NPC 距玩家中心 ≤4000px（CloseEnoughTo*Tower 四者析取，无事件旗参与）；
   *  Renderer._lunarTowerFilterTarget 同源扫描，未喂=旧 stub 语义 false） */
  lunarTowersNear?: boolean;
  /** Moon Lord Core（NPC type 398）世界 px 中心；null=不存在。
   *  SceneState.cs:109 激活门 = ClosestNPCPosition[398] ≠ Zero（SceneMetrics.cs:739-763
   *  全场 NPC 扫描——不限视区，核心在屏外滤镜仍激活）；同时是 MoonLord 滤镜
   *  UseTargetPosition（MoonLordScreenShaderData.cs:42-45） */
  moonLordCore?: { x: number; y: number } | null;
  /** 主玩星旋世界种旗（Main.onlyDontStarveWorld；引擎恒 false，保留字段对齐 :125 的 XOR） */
  onlyDontStarveWorld?: boolean;
  /** SceneMetrics.ZoneShimmer（SceneMetrics.cs:712 = EnoughTilesForShimmer &&
   *  UndergroundForShimmering && !ZoneDungeon——微光液 ≥300 格的完整判定链）。
   *  ★SW-RB10e 2026-09-10 勘误：旧注「本位=SceneState.cs:331 的 shimmering &&
   *  UndergroundForShimmering 项」系口径错位——:331 的该项与 ZoneShimmer 是
   *  两个独立析取项，本位只承载后者；前者由下方 shimmerSubmerged 承载 */
  zoneShimmer?: boolean;
  /** ★SW-RB10e：SceneState.cs:331 析取项「PerspectivePlayer.shimmering &&
   *  UndergroundForShimmering」（buff 353 微光化中 + 深度带内）——小体量人工微光池
   *  （<300 格阈）浸没时 ZoneShimmer=false 但本项=true，原版照样升
   *  shimmerAlpha（SceneState.cs:331 析取链）。Renderer 喂 player.shimmering &&
   *  scene.undergroundForShimmering。:331 尚余 shimmerMonolithShader 项（时装位
   *  5347 微光独石,Player.ApplyShader :14371）——物品未入仓无载体,登记 */
  shimmerSubmerged?: boolean;
  /** Main.GraveyardVisualIntensity（SceneState.cs:415-418 平滑后的墓地视觉强度 0-1；
   *  Game.updateWeather 每帧写入 world.weather.graveyardVisual，Renderer 注入） */
  graveyardIntensity?: number;
  /** ---- HeatDistortion（SceneState.cs:122-123 激活门 / :186-207 强度）---- */
  /** SceneMetrics.TileCenter.Y（玩家中心 tile Y，SceneMetrics.cs:334） */
  heatTileCenterY?: number;
  /** Main.maxTilesY = world.store.h（flag2 地狱带 = maxY-320） */
  heatMaxTilesY?: number;
  /** metrics.ZoneDesert / ZoneRain / ZoneSandstorm（flag3 沙漠带三条件 :104/1457 :107） */
  heatZoneDesert?: boolean;
  heatZoneRain?: boolean;
  heatZoneSandstorm?: boolean;
  // ---- SW-BJ27 2026-09-07：沙漠支强度两输入（SceneState.cs:201-207 / 1456 :198-204）----
  /** ColorOfTheSkies 快照 [R,G,B] 0-255（上帧 Draw 的 Main.ColorOfTheSkies——
   *  Renderer.render 每帧 :3137-3141 计算写存,本处读到的是上帧值,与原版
   *  SceneState.Update(Update 段)读上帧 Draw 写入的 Main.tileColor 同一滞后语义）。
   *  ApplyColorOfTheSkiesToTiles（Main.cs:64134-64142;Draw :62929 在 SetBackColor 后
   *  调用）逐通道 C=(Σrgb+7C)/10 得 Main.tileColor,其三通道均值【恰等于】天空色
   *  均值/255（7C 倾斜项在均值中相消：avg_i[(Σ+7C_i)/10] = 3Σ+7Σ /30 = Σ/3）——
   *  SceneState.cs:203-204 num9 = avg(tileColor.ToVector3()) 直接吃本均值。
   *  ★SW-RB8a 2026-09-08 口径勘误：原版首帧 default(Color) 全零→num9=0;本仓
   *  Renderer.colorOfTheSkies 声明缺省 白=[255,255,255]→首帧实况 num9=1——仅首帧
   *  一拍差且首帧 opacity=0 不可见（Renderer 侧注同此为准）。
   *  null/缺省 = 首帧 tileColor 尚未产出的直传态（测试用） */
  heatTileColor?: readonly [number, number, number] | null;
  /** outsideWeatherEffectIntensity（SceneState.cs:178-179：BehindBackwall ? −0.1 : 1.1,
   *  0.005/t 逼近后钳 0-1——weather.outsideWeatherEffect 同源同值） */
  heatOutsideWeather?: number;
  /** perspectivePlayer.sunScorchCounter（Player.cs:2228 吸血鬼阳光炽灼 0-300） */
  heatSunScorch?: number;
  /** Main.UseHeatDistortion（Main.cs:409 默认 true 的视频开关） */
  useHeatDistortion?: boolean;
}

interface FilterState { def: MonoFilterDef; active: boolean; opacity: number }

/** FilterManager.OPACITY_RATE = 1/s（FilterManager.cs:16,95-101）：
 *  active → +dt·1 夹 1；inactive → −dt·1 夹 0 */
const OPACITY_RATE = 1;

export class MonolithFilters {
  private readonly filters: FilterState[] =
    MONOLITH_FILTER_DEFS.map((def) => ({ def, active: false, opacity: 0 }));

  /** Main.shimmerAlpha / Main.shimmerDarken（SceneState.UpdateShimmer :328-345 驱动；
   *  shimmerAlpha 反向加权血月滤镜 BloodMoonScreenShaderData.cs:16-18） */
  shimmerAlpha = 0;
  shimmerDarken = 0;
  /** SceneState._shimmerBrightenDelay（:341 置 4、:346-350 归零后才衰减 alpha） */
  shimmerBrightenDelay = 0;
  /** 血月滤镜本帧 UseOpacity（BloodMoonScreenShaderData.Update :10-21） */
  bloodMoonUseOpacity = 0;
  /** Sepia 本帧参数（SepiaScreenShaderData.Update） */
  sepia: SepiaParams = { progress: 0.3, intensity: 1.4, color: [0.191, -0.054, -0.221] };
  /** 墓地雾 UseProgress（SceneState.cs:134：MathHelper.Lerp(0, 0.75, GraveyardVisualIntensity)；
   *  UseIntensity(1.2) 固定，UseTargetPosition = SceneMetrics.Center ≈ 玩家屏幕位） */
  graveyardProgress = 0;

  /** 天塔柱类型 → 滤镜激活（SceneState.cs:111-115） */
  miniTowerActive = -1;

  // ---- HeatDistortion 滤镜态（EffectPriority.Low，ScreenEffectInitializer.cs:40）----
  /** Filter.Active（SceneState.cs:126 ManageSpecialBiomeVisuals 门；1456 :123） */
  heatActive = false;
  /** Filter.Opacity（FilterManager.cs:95-101 同款 1/s 斜坡，与柱族共用速率） */
  heatOpacity = 0;
  /** UseIntensity num8（SceneState.cs:186-210；1456 :183-207） */
  heatIntensity = 0;

  reset(): void {
    for (const f of this.filters) { f.active = false; f.opacity = 0; }
    this.shimmerAlpha = 0; this.shimmerDarken = 0; this.shimmerBrightenDelay = 0;
    this.heatActive = false; this.heatOpacity = 0; this.heatIntensity = 0;
  }

  /** 激活矩阵（SceneState.cs:111-128） */
  private activation(scan: MonolithSceneState, env: MonolithEnv): Map<string, boolean> {
    const flag4 = !!env.lunarTowersNear;                       // :110
    const m = new Map<string, boolean>();
    m.set('MonolithVortex', !flag4 && scan.activeMonolithType === 0);    // :111
    m.set('MonolithNebula', !flag4 && scan.activeMonolithType === 1);    // :112
    m.set('MonolithStardust', !flag4 && scan.activeMonolithType === 2);  // :113
    m.set('MonolithSolar', !flag4 && scan.activeMonolithType === 3);     // :114
    m.set('MonolithMoonLord', !flag4 && scan.activeMonolithType === 4);  // :115
    m.set('MoonLord', !!env.moonLordCore);                               // :109
    m.set('Graveyard', (env.graveyardIntensity ?? 0) > 0);               // :124
    m.set('BloodMoon', env.worldBloodMoon || scan.bloodMoonMonolith);    // :116
    // Sepia（:125）：onlyDontStarveWorld ^ (dontStarveShader || RadioThingMonolith)
    // —— dontStarveShader 是药水 buff（perspectivePlayer），引擎未接，恒 false
    m.set('Sepia', (!!env.onlyDontStarveWorld) !== scan.radioThingMonolith);
    m.set('Noir', scan.noirMonolith);                                    // :126
    m.set('CRT', scan.crtMonolith);                                      // :127
    m.set('Test2', scan.retroMonolith);                                  // :128
    return m;
  }

  /** 每帧推进（SceneState.UpdateSceneEffects + FilterManager.Update） */
  update(dtMs: number, scan: MonolithSceneState, env: MonolithEnv): void {
    // FilterManager.cs:95-101：ElapsedGameTime.TotalSeconds（真实 dt，无上限夹取）
    const dt = Math.max(0, dtMs) / 1000;
    const act = this.activation(scan, env);
    for (const f of this.filters) {
      f.active = !!act.get(f.def.sceneKey);
      // FilterManager.cs:95-101：active 上斜、inactive 下斜，速率 1/s
      f.opacity = f.active
        ? Math.min(f.opacity + dt * OPACITY_RATE, 1)
        : Math.max(f.opacity - dt * OPACITY_RATE, 0);
    }
    this.miniTowerActive = scan.activeMonolithType;

    // ---- HeatDistortion（SceneState.cs:125-126 激活门 + :186-210 强度；1456 :122-123/:183-207）----
    // flag2 地狱带 = TileCenter.Y > maxTilesY-320（:106）；flag3 沙漠带 = 地表且
    // ZoneDesert 且非雨非沙暴（:107）；flag7 三者并集 + sunScorch>0（:125）
    const tcY = env.heatTileCenterY ?? 0;
    const maxTY = env.heatMaxTilesY ?? 0;
    const heatFlag2 = tcY > maxTY - 320;                                    // :106
    const heatFlag3 = tcY < env.worldSurface && !!env.heatZoneDesert
      && !env.heatZoneRain && !env.heatZoneSandstorm;                       // :107
    this.heatActive = (env.useHeatDistortion ?? true)
      && (heatFlag2 || heatFlag3 || (env.heatSunScorch ?? 0) > 0);          // :125-126
    this.heatOpacity = this.heatActive
      ? Math.min(this.heatOpacity + dt * OPACITY_RATE, 1)
      : Math.max(this.heatOpacity - dt * OPACITY_RATE, 0);                  // FilterManager 斜坡
    if (this.heatActive) {
      let num8 = 0;
      const scorch = env.heatSunScorch ?? 0;
      if (scorch > 0) {
        num8 = Math.max(num8, smoothStep(0, 300, scorch) * 4);              // :190-194 GetLerpValue
      }
      if (heatFlag2) {
        const val2 = Math.min(1, (tcY - (maxTY - 320)) / 120) * 2;         // :197-200
        num8 = Math.max(num8, val2);
      } else if (heatFlag3) {
        // SW-BJ27 2026-09-07：沙漠支强度 1:1（SceneState.cs:201-207；1456 :198-204）。
        // ★翻案：旧注"Main.tileColor 全源码无赋值 → 死支"系误判——head 截断 grep
        //   漏掉 Main.cs:64137-64141（ApplyColorOfTheSkiesToTiles 在 Draw 的
        //   SetBackColor 后每帧赋值,1456 Main.cs 同在,非 1457 新增）。num9 = 上帧
        //   ColorOfTheSkies 均值/255（见 MonolithEnv.heatTileColor 注——
        //   tileColor 的 (Σ+7C)/10 逐通道倾斜在均值中恰相消）。
        //   val3 = 室外强度 ×4 × max(0, 0.5−cloudAlpha) × num9（:205）：
        //   雨云 cloudAlpha≥0.5 → 0（雨停后 cloudAlpha 渐退穿 0.5 才渐显）;墙后
        //   室外强度→0 → 隐;夜天空暗 → num9 小 → 弱（原版无硬昼夜门,:107 沙漠门
        //   本身不含 dayTime,昼夜差全由天空色亮度承载）。
        const tc = env.heatTileColor;
        const num9 = tc ? (tc[0] + tc[1] + tc[2]) / (3 * 255) : 0;          // :203-204
        const val3 = (env.heatOutsideWeather ?? 1) * 4
          * Math.max(0, 0.5 - env.cloudAlpha) * num9;                       // :205
        num8 = Math.max(num8, val3);
      }
      this.heatIntensity = num8;                                            // :208 UseIntensity
      // :209 IsHidden = num8 ≤ 0 → Filter.IsVisible（Filter.cs:61-68）=false——
      // 激活+斜坡照常走,只是不画;heatVisible 口已承载（opacity>0 && intensity>0）
    }

    // 微光三态（SceneState.cs:328-345）：state 1 → 开；state 2 显式关（压掉其它微光源）
    // ★SW-RB10e：:331 四项析取补全——此前只接 MonolithState==1 ∨ ZoneShimmer 两项，
    //  漏「player.shimmering && UndergroundForShimmering」（buff 353 浸没+深度带,
    //  小微光池 <300 格阈时 ZoneShimmer=false 而原版仍升 α 的整条臂）与
    //  shimmerMonolithShader（时装位 5347,物品未入仓无载体→恒 false,登记）
    let flag = scan.shimmerMonolithState === 1 || !!env.zoneShimmer
      || !!env.shimmerSubmerged;                     // :331
    if (scan.shimmerMonolithState === 2) flag = false;                    // :332-334
    // 原版按 tick 计（60Hz）：0.025/0.05 每步 → 每秒 ×60
    if (flag) {
      this.shimmerAlpha = moveTowards(this.shimmerAlpha, 1, 0.025 * 60 * dt);      // :337
      if (this.shimmerAlpha >= 0.5) {
        this.shimmerDarken = moveTowards(this.shimmerDarken, 1, 0.025 * 60 * dt);  // :339-341
        this.shimmerBrightenDelay = 4;
      }
    } else {
      // :343-351：先 darken 归零，再 brightenDelay 归零，最后才衰减 shimmerAlpha
      this.shimmerDarken = moveTowards(this.shimmerDarken, 0, 0.05 * 60 * dt);
      if (this.shimmerDarken === 0) {
        this.shimmerBrightenDelay = moveTowards(this.shimmerBrightenDelay, 0, 1 * 60 * dt);
      }
      if (this.shimmerBrightenDelay === 0) {
        this.shimmerAlpha = moveTowards(this.shimmerAlpha, 0, 0.05 * 60 * dt);
      }
    }

    // 血月滤镜 UseOpacity（BloodMoonScreenShaderData.cs:10-21）：
    // 深度系数 = 1-SmoothStep(worldSurface+50, rockLayer+100, 屏幕中心 tile Y)
    //（remixWorld 分支 :14-17 不适用）× (1-shimmerAlpha) × 0.75
    const depth = 1 - smoothStep(env.worldSurface + 50, env.rockLevel + 100, env.screenTileY);
    this.bloodMoonUseOpacity = depth * 0.75 * (1 - this.shimmerAlpha);

    this.sepia = sepiaParams({
      dayTime: env.dayTime, hour24: env.hour24, nightElapsed01: env.nightElapsed01,
      worldBloodMoon: env.worldBloodMoon, fullMoon: env.fullMoon,
      cloudAlpha: env.cloudAlpha, screenTileY: env.screenTileY, worldSurface: env.worldSurface,
    });

    // 墓地雾参数（SceneState.cs:132-138）：progress = Lerp(0, 0.75, intensity)
    this.graveyardProgress = 0.75 * Math.max(0, Math.min(1, env.graveyardIntensity ?? 0));
  }

  /** 滤镜查询（测试/调试用） */
  state(key: string): FilterState | undefined {
    return this.filters.find((f) => f.def.key === key);
  }
  /** 任一滤镜仍在淡入/淡出（Filter.IsInUse Filter.cs:49-56） */
  get anyInUse(): boolean {
    return this.filters.some((f) => f.active || f.opacity > 0);
  }
  /** HeatDistortion 在用（Active 或淡出中） */
  get heatInUse(): boolean {
    return this.heatActive || this.heatOpacity > 0;
  }
  /** HeatDistortion 可见（Filter.IsVisible Filter.cs:63-70：Opacity>0 且 !IsHidden） */
  get heatVisible(): boolean {
    return this.heatOpacity > 0 && this.heatIntensity > 0;
  }
  /** 可见滤镜（opacity>0）按合成序（GL 链/canvas 回退共用） */
  visibleFilters(): FilterState[] {
    return this.filters.filter((f) => f.opacity > 0);
  }

  // -------------------------------------------------------------------------
  // 6) canvas 等价绘制
  // -------------------------------------------------------------------------

  /** 半分辨率离屏（Sepia/Retro 的逐像素处理；尺寸变化才重建） */
  private _low: HTMLCanvasElement | null = null;
  private _lowW = 0;
  private _lowH = 0;
  /** Noir 噪点图（Images/NoirNoise 的程序化替代；固定种子一次生成） */
  private _noise: HTMLCanvasElement | null = null;

  private lowCanvas(w: number, h: number): HTMLCanvasElement {
    const lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    if (!this._low || this._lowW !== lw || this._lowH !== lh) {
      this._low = document.createElement('canvas');
      this._low.width = lw; this._low.height = lh;
      this._lowW = lw; this._lowH = lh;
    }
    return this._low;
  }

  private noiseCanvas(): HTMLCanvasElement {
    if (!this._noise) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const nctx = c.getContext('2d')!;
      const img = nctx.createImageData(128, 128);
      let seed = 0x9E3779B9;
      for (let i = 0; i < img.data.length; i += 4) {
        // xorshift32：程序化替代 NoirNoise 贴图
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const v = (seed >>> 16) & 0xff;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      nctx.putImageData(img, 0, 0);
      this._noise = c;
    }
    return this._noise;
  }

  /** 全屏滤镜合成（FilterManager.EndCapture :136-176 的 canvas 等价）：
   *  依 EffectPriority 升序叠加（Medium 先、VeryHigh 后）。
   *  playerScreen = 玩家屏幕坐标（MonolithMoonLord aimAtPlayer 的 target）；
   *  moonLordCoreScreen = 月总核心屏幕坐标（场景 MoonLord 滤镜 aimAtPlayer=false
   *  的 UseTargetPosition；无核心时回退玩家位）。 */
  draw(
    ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
    viewW: number, viewH: number,
    playerScreen: { x: number; y: number },
    moonLordCoreScreen?: { x: number; y: number },
  ): void {
    // MONOLITH_FILTER_DEFS 已按优先级升序声明（Medium → VeryHigh）
    for (const f of this.filters) {
      if (f.opacity <= 0) continue;   // Filter.IsVisible（Filter.cs:63-70）
      switch (f.def.kind) {
        case 'miniTower': this.drawMiniTower(ctx, f, viewW, viewH); break;
        case 'moonLord':
          this.drawMoonLord(ctx, f, viewW, viewH,
            f.def.aimAtPlayer === false && moonLordCoreScreen ? moonLordCoreScreen : playerScreen);
          break;
        case 'graveyard': this.drawGraveyard(ctx, canvas, f, viewW, viewH); break;
        case 'bloodMoon': this.drawBloodMoon(ctx, f, viewW, viewH); break;
        case 'sepia': this.drawSepia(ctx, canvas, f, viewW, viewH); break;
        case 'noir': this.drawNoir(ctx, canvas, f, viewW, viewH); break;
        case 'retro': this.drawRetro(ctx, canvas, f, viewW, viewH); break;
        case 'crt': this.drawCrt(ctx, f, viewW, viewH); break;
      }
    }
  }

  /** FilterMiniTower：multiply 混合（result = px × mix(白, 柱色, CombinedOpacity)）；
   *  CombinedOpacity = UseOpacity × Filter.Opacity（ScreenShaderData.cs:84,144） */
  private drawMiniTower(ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number): void {
    const [r, g, b] = f.def.color!;
    const a = f.def.useOpacity! * f.opacity;
    const mix = (c: number) => Math.round(255 * (1 - a + c * a));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** FilterMoonLord：径向压暗近似（shader 二进制不在源码，
   *  深紫向外衰减——沿用既有近似基色 0.35/0.30/0.42）。target=aimAtPlayer ?
   *  玩家屏幕位（SceneMetrics.Center）: 核心屏幕位（npc[398].Center） */
  private drawMoonLord(ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number,
    target: { x: number; y: number }): void {
    const r = Math.hypot(w, h) * 0.6;
    const grad = ctx.createRadialGradient(target.x, target.y, r * 0.2, target.x, target.y, r);
    grad.addColorStop(0, 'rgba(89,77,107,0)');
    grad.addColorStop(1, `rgba(89,77,107,${(0.35 * f.opacity).toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** moonLord 族单滤补画（GL 链激活时：该族未入 GL 端口但无需读源像素——
   *  在 drawChain 结果上直接叠画；sepia/noir 需 getImageData 读源，维持
   *  GL 路径跳过=审计表既有约定）。target 由调用方按 aimAtPlayer 选定。 */
  drawMoonLordPass(
    ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number,
    target: { x: number; y: number },
  ): void {
    if (f.opacity <= 0 || f.def.kind !== 'moonLord') return;
    this.drawMoonLord(ctx, f, w, h, target);
  }

  /** FilterGraveyard（ScreenEffectInitializer.cs:25）。★2026-08-25 反汇编
   *  ScreenShader.cso obj6（disasm-fx.mjs,ps_2_0 共 7 指令）字节码 1:1：
   *    gray  = (r+g+b) × uIntensity(1.2) / 3
   *    desat = lerp(scene.rgb, gray, uProgress)         // uProgress=Lerp(0,0.75,强度)
   *    final = lerp(scene.rgb, desat × scene.a, uOpacity)
   *  ×scene.a 项:场景合成纹理的 alpha——本仓主画布不透明(canvas 合成后 a=1)
   *  → ×1 恒等,与 GL 路径 s.a 采样一致。半分辨率逐像素同 drawSepia。
   *  昼夜观感差 = 场景本身亮度差经去饱和保亮度传递(夜暗灰/昼亮灰),非 shader 分叉 */
  private drawGraveyard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, f: FilterState,
    w: number, h: number): void {
    const low = this.lowCanvas(w, h);
    const lctx = low.getContext('2d', { willReadFrequently: true })!;
    lctx.clearRect(0, 0, low.width, low.height);
    lctx.drawImage(canvas, 0, 0, low.width, low.height);
    const img = lctx.getImageData(0, 0, low.width, low.height);
    const d = img.data;
    const inten = 1.2;                                  // UseIntensity(1.2)（SceneState.cs:138）
    const prog = Math.max(0, Math.min(1, this.graveyardProgress));
    const a = f.opacity;
    for (let i = 0; i < d.length; i += 4) {
      const gray = (d[i] + d[i + 1] + d[i + 2]) * inten / 3;
      // desat = mix(scene, gray, progress);final = mix(scene, desat×scene.a, opacity)
      const dr = d[i] + (gray - d[i]) * prog;
      const dg = d[i + 1] + (gray - d[i + 1]) * prog;
      const db = d[i + 2] + (gray - d[i + 2]) * prog;
      d[i] = d[i] + (dr - d[i]) * a;
      d[i + 1] = d[i + 1] + (dg - d[i + 1]) * a;
      d[i + 2] = d[i + 2] + (db - d[i + 2]) * a;
    }
    lctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, w, h);
    ctx.restore();
  }

  /** FilterBloodMoon（obj11 :429-482 字节码精确式,半分辨率逐像素同 drawSepia）：
   *  V+min 分档染色 + 径向衰减 + α 抛物线。★2026-08-25 重写：旧 multiply 近似
   *  (mix(c)=255·(1−a+c·a) 全屏一刷) 在 a=0.75 时把 G/B 钳 0 = 纯红黑屏,且
   *  GL 侧同日已定谳字节码不读 v0（EndCapture 的 ×ColorOfTheSkies 是死参数）——
   *  本兜底与 GL FRAG_BLOODMOON 同式,无 uTint */
  private drawBloodMoon(ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number): void {
    const [cr, cg, cb] = f.def.color!;
    const opacity = this.bloodMoonUseOpacity * f.opacity;
    if (opacity <= 0) return;
    const low = this.lowCanvas(w, h);
    const lctx = low.getContext('2d', { willReadFrequently: true })!;
    lctx.clearRect(0, 0, low.width, low.height);
    lctx.drawImage(ctx.canvas, 0, 0, low.width, low.height);
    const img = lctx.getImageData(0, 0, low.width, low.height);
    const d = img.data;
    const lw = low.width, lh = low.height;
    for (let y = 0; y < lh; y++) {
      const vy = y / lh - 0.5;
      for (let x = 0; x < lw; x++) {
        const i = (y * lw + x) * 4;
        const sa = d[i + 3] / 255;
        const sr = d[i] / 255, sg = d[i + 1] / 255, sb = d[i + 2] / 255;
        // 径向（:446-448,中心 (0.5,0.5),不夹下界）
        const dx = x / lw - 0.5;
        const dd = Math.sqrt(dx * dx + vy * vy);
        const radial = dd >= 0.3 ? 1 - 2 * (dd - 0.3) : 1;
        const V = Math.max(sr, sg, sb);
        const mn = Math.min(sr, sg, sb);
        const sum = V + mn;
        // :456-460 分档（c1=1-color preshader）
        const hi0 = 1 - cr, hi1 = 1 - cg, hi2 = 1 - cb;
        const k = 1.5 - 0.5 * sum;
        const hiR = 1 - hi0 * k, hiG = 1 - hi1 * k, hiB = 1 - hi2 * k;
        const loR = sum * cr, loG = sum * cg, loB = sum * cb;
        const useLo = 0.5 * (1 - sum) >= 0;
        let bR = useLo ? loR : hiR, bG = useLo ? loG : hiG, bB = useLo ? loB : hiB;
        bR += -0.5 * sum; bG += -0.5 * sum; bB += -0.5 * sum;   // :461
        const diff = (V - mn) + 0.166667;                        // :454-455,462
        const tR = bR * diff + 0.5 * sum, tG = bG * diff + 0.5 * sum, tB = bB * diff + 0.5 * sum;
        const amt = (1 - 0.5 * sum) * 1 * 0.7;                   // :463-465(intensity 恒 1)
        // :468-471 α 抛物线（A=tgt·s.a;mid=0.3A+0.7A²）
        const aR = sa * tR, aG = sa * tG, aB = sa * tB;
        const mR = 0.3 * aR + 0.7 * aR * aR, mG = 0.3 * aG + 0.7 * aG * aG, mB = 0.3 * aB + 0.7 * aB * aB;
        // :472-474 双 mix（amt 内层 + opacity 外层,radial 乘中层）
        const oR = sr + (radial * mR - sr) * amt;
        const oG = sg + (radial * mG - sg) * amt;
        const oB = sb + (radial * mB - sb) * amt;
        d[i] = 255 * Math.max(0, Math.min(1, sr + (oR - sr) * opacity));
        d[i + 1] = 255 * Math.max(0, Math.min(1, sg + (oG - sg) * opacity));
        d[i + 2] = 255 * Math.max(0, Math.min(1, sb + (oB - sb) * opacity));
        d[i + 3] = 255;
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.drawImage(low, 0, 0, w, h);
  }

  /** FilterSepia：半分辨率逐像素（亮度→棕调 + progress 加性染色），
   *  参数 progress/intensity/color 全部来自 SepiaScreenShaderData.Update（:10-55） */
  private drawSepia(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, f: FilterState, w: number, h: number): void {
    const low = this.lowCanvas(w, h);
    const lctx = low.getContext('2d', { willReadFrequently: true })!;
    lctx.clearRect(0, 0, low.width, low.height);
    lctx.drawImage(canvas, 0, 0, low.width, low.height);
    const img = lctx.getImageData(0, 0, low.width, low.height);
    const d = img.data;
    const a = f.opacity;
    const [cr, cg, cb] = this.sepia.color;
    const inten = this.sepia.intensity;
    const prog = Math.max(0, Math.min(1, this.sepia.progress));
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      // 棕调基色（UseColor 基准 vector 0.191/-0.054/-0.221 的色相方向）
      const sr = lum * (1 + 0.191 * inten), sg = lum * (1 - 0.054 * inten), sb = lum * (1 - 0.221 * inten);
      const tr = sr * 255 + cr * prog * 255 * a;
      const tg = sg * 255 + cg * prog * 255 * a;
      const tb = sb * 255 + cb * prog * 255 * a;
      d[i] = d[i] + (Math.max(0, Math.min(255, tr)) - d[i]) * a;
      d[i + 1] = d[i + 1] + (Math.max(0, Math.min(255, tg)) - d[i + 1]) * a;
      d[i + 2] = d[i + 2] + (Math.max(0, Math.min(255, tb)) - d[i + 2]) * a;
    }
    lctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, w, h);
    ctx.restore();
  }

  /** FilterNoir：去饱和 + 胶片噪点（NoirNoise 贴图程序化替代；
   *  UseIntensity(1)（ScreenEffectInitializer.cs:29）→ 噪点全强） */
  private drawNoir(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, f: FilterState, w: number, h: number): void {
    const a = f.opacity;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    // 噪点（point-wrap 平铺）
    const n = this.noiseCanvas();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.25 * a;
    for (let y = 0; y < h; y += 128) {
      for (let x = 0; x < w; x += 128) ctx.drawImage(n, x, y);
    }
    ctx.restore();
  }

  /** FilterTest2（复古柱）：四阶亮度量化调色板（shader 二进制不在源码，
   *  调色板为视觉近似；半分辨率处理 + 最近邻放大） */
  private drawRetro(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, f: FilterState, w: number, h: number): void {
    const low = this.lowCanvas(w, h);
    const lctx = low.getContext('2d', { willReadFrequently: true })!;
    lctx.clearRect(0, 0, low.width, low.height);
    lctx.drawImage(canvas, 0, 0, low.width, low.height);
    const img = lctx.getImageData(0, 0, low.width, low.height);
    const d = img.data;
    const a = f.opacity;
    // 四阶 GB 风调色板：暗→亮
    const PAL = [[15, 24, 15], [48, 88, 48], [139, 172, 112], [222, 238, 200]];
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const band = Math.min(3, Math.floor(lum / 64));
      const [pr, pg, pb] = PAL[band];
      d[i] = d[i] + (pr - d[i]) * a;
      d[i + 1] = d[i + 1] + (pg - d[i + 1]) * a;
      d[i + 2] = d[i + 2] + (pb - d[i + 2]) * a;
    }
    lctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, w, h);
    ctx.restore();
  }

  /** FilterCRT：扫描线 + 暗角 + 轻色散（shader 二进制不在源码，视觉近似；
   *  数值：扫描线间距 3px、暗角 0.25、色散偏移 1px） */
  private drawCrt(ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number): void {
    const a = f.opacity;
    ctx.save();
    // 扫描线
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    // 暗角
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(0.25 * a).toFixed(3)})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // 7) HeatDistortion canvas 2D 回退（GL 不可用/cpu 渲染时；公式与
  //    GLScreenFilters FRAG_HEAT 同源 = ScreenShader.cso obj18 逐指令）
  // -------------------------------------------------------------------------

  /** 半分辨率逐像素扭曲（噪声双线性 + 屏幕采样钳边=FNA LinearClamp 同款，BJ65 勘误）。
   *  screenPos=屏幕左上世界px（uScreenPosition）、screenRes=(viewW/z, viewH/z)
   *  （uScreenResolution=UnscaledScreenSize）、time=GlobalTimeWrappedHourly */
  drawHeat2D(
    ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
    w: number, h: number,
    screenPos: { x: number; y: number }, screenRes: { x: number; y: number },
    time: number,
  ): void {
    if (!this.heatVisible) return;
    const nd = noiseData();
    if (!nd) return;   // 噪声图未载入：该帧不扭曲（渐入无感）
    const low = this.lowCanvas(w, h);
    const lw = low.width, lh = low.height;
    const lctx = low.getContext('2d', { willReadFrequently: true })!;
    lctx.clearRect(0, 0, lw, lh);
    lctx.drawImage(canvas, 0, 0, lw, lh);
    const img = lctx.getImageData(0, 0, lw, lh);
    const d = img.data;
    const scroll = HEAT_TIME_SCROLL * time;                  // preshader c1/c2
    const [offX, offY] = heatOffset(this.heatIntensity, this.heatOpacity, screenRes);
    const sample = (u: number, v: number, ch: number): number => {
      const fx = (u - Math.floor(u)) * nd.w - 0.5, fy = (v - Math.floor(v)) * nd.h - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const X0 = ((x0 % nd.w) + nd.w) % nd.w, X1 = (X0 + 1) % nd.w;
      const Y0 = ((y0 % nd.h) + nd.h) % nd.h, Y1 = (Y0 + 1) % nd.h;
      const p = (xx: number, yy: number) => nd.data[(yy * nd.w + xx) * 4 + ch] / 255;
      const a = p(X0, Y0) + (p(X1, Y0) - p(X0, Y0)) * tx;
      const b = p(X0, Y1) + (p(X1, Y1) - p(X0, Y1)) * tx;
      return a + (b - a) * ty;
    };
    for (let py = 0; py < lh; py++) {
      const v = py / lh;
      for (let px = 0; px < lw; px++) {
        const u = px / lw;
        const [wx, wy] = heatNoiseUv(u, v, screenRes, screenPos, nd.w, nd.h);
        // delta = tex(nuv+(0,+0.04t)) − tex(nuv+(0,−0.04t)) − 0.5（:854-858）
        const nAx = sample(wx, wy + scroll, 0), nAy = sample(wx, wy + scroll, 1);
        const nBx = sample(wx, wy - scroll, 0), nBy = sample(wx, wy - scroll, 1);
        const [oux, ouy] = heatUvOut(u, v, nAx, nAy, nBx, nBy, [offX, offY]);
        // ★BJ65 2026-09-13：s0 越界=钳边（FNA SpriteBatch.Begin(null)→LinearClamp，
        //   同 GLScreenFilters FRAG_HEAT 勘误）——曾有 wrap 回绕 → 顶行采底行=
        //   顶部 1-2px 错位条伪影。钳后索引再夹 lw-1/lh-1 防 oux=1 越界读。
        const sx = Math.min(Math.max(oux, 0), 1) * lw;
        const sy = Math.min(Math.max(ouy, 0), 1) * lh;
        const x0 = Math.min(sx | 0, lw - 1), y0 = Math.min(sy | 0, lh - 1);
        const i = (py * lw + px) * 4, j = (y0 * lw + x0) * 4;
        d[i] = d[j]; d[i + 1] = d[j + 1]; d[i + 2] = d[j + 2];
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(low, 0, 0, w, h);
    ctx.restore();
  }
}
