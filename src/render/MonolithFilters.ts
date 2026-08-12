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

// ---------------------------------------------------------------------------
// 1) 天塔柱族 tile 表（内部 id ↔ 原版 sheet）
// ---------------------------------------------------------------------------

/** sheet → 激活判定阈值（SceneMetrics.ScanOnScreenTiles :524-583）：
 *  410/509：frameY ≥ 56 才激活；480/657/720/721/725/733：frameY ≥ 54；
 *  658（以太柱）三态：ShimmerMonolithState = frameY/54（0 关/1 开/2 关且压暗——
 *  SceneState.cs:331-332 的特殊门）。注意 SwitchMonolith 对 509 翻帧步长是 54
 *  （WorldGen.cs:51085-51092），但 SceneMetrics 判激活用 ≥56——两处照抄，勿"修齐"。 */
const MONO_THRESHOLD: Record<number, number> = {
  410: 56, 509: 56, 480: 54, 657: 54, 720: 54, 721: 54, 725: 54, 733: 54,
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

/** 天塔柱子集扫描（SceneMetrics.cs:524-583 1:1）。语义要点：
 *  - 只有"激活帧"才赋值（关帧不回写 -1）——与 Reset()+仅激活赋值的原版链路一致，
 *    同屏多柱时后扫到者覆盖（原版逐格直接赋值 :529-530/:536）；
 *  - 658 无条件赋 frameY/54（三态柱，关态也是有效状态）。 */
export function scanMonolithScene(st: TileStore, r: TileRect): MonolithSceneState {
  const out = emptyMonolithScene();
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
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

type FilterKind = 'miniTower' | 'moonLord' | 'bloodMoon' | 'sepia' | 'noir' | 'retro' | 'crt';

interface MonoFilterDef {
  key: string;            // Filters.Scene 键（ScreenEffectInitializer.cs）
  sceneKey: string;       // 激活来源（SceneState.cs:111-128）
  priority: number;
  kind: FilterKind;
  /** FilterMiniTower 的 UseColor + UseOpacity（ScreenEffectInitializer.cs:18-21） */
  color?: readonly [number, number, number];
  useOpacity?: number;
}

export const MONOLITH_FILTER_DEFS: readonly MonoFilterDef[] = [
  // 天塔柱四色（SceneState.cs:111-114；FilterMiniTower :18-21）
  { key: 'MonolithVortex', sceneKey: 'MonolithVortex', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [0, 0.7, 0.7], useOpacity: 0.5 },
  { key: 'MonolithNebula', sceneKey: 'MonolithNebula', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [1, 0, 0.9], useOpacity: 0.35 },
  { key: 'MonolithStardust', sceneKey: 'MonolithStardust', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [0, 0.5, 1], useOpacity: 0.5 },
  { key: 'MonolithSolar', sceneKey: 'MonolithSolar', priority: PRIORITY_MEDIUM, kind: 'miniTower', color: [1, 0.7, 0], useOpacity: 0.3 },
  // 月总柱（SceneState.cs:115；MoonLordScreenShaderData :21-44 aimAtPlayer）
  { key: 'MonolithMoonLord', sceneKey: 'MonolithMoonLord', priority: PRIORITY_MEDIUM, kind: 'moonLord' },
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
  /** SceneState.cs:110 flag4：四天塔在附近时压掉柱滤镜（引擎暂无塔邻接，默认 false） */
  lunarTowersNear?: boolean;
  /** 主玩星旋世界种旗（Main.onlyDontStarveWorld；引擎恒 false，保留字段对齐 :125 的 XOR） */
  onlyDontStarveWorld?: boolean;
  /** 玩家微光浸没（SceneState.cs:331 的 shimmering && UndergroundForShimmering 项） */
  zoneShimmer?: boolean;
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
  private shimmerBrightenDelay = 0;
  /** 血月滤镜本帧 UseOpacity（BloodMoonScreenShaderData.Update :10-21） */
  bloodMoonUseOpacity = 0;
  /** Sepia 本帧参数（SepiaScreenShaderData.Update） */
  sepia: SepiaParams = { progress: 0.3, intensity: 1.4, color: [0.191, -0.054, -0.221] };

  /** 天塔柱类型 → 滤镜激活（SceneState.cs:111-115） */
  miniTowerActive = -1;

  reset(): void {
    for (const f of this.filters) { f.active = false; f.opacity = 0; }
    this.shimmerAlpha = 0; this.shimmerDarken = 0; this.shimmerBrightenDelay = 0;
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
    const dt = Math.min(dtMs, 100) / 1000;
    const act = this.activation(scan, env);
    for (const f of this.filters) {
      f.active = !!act.get(f.def.sceneKey);
      // FilterManager.cs:95-101：active 上斜、inactive 下斜，速率 1/s
      f.opacity = f.active
        ? Math.min(f.opacity + dt * OPACITY_RATE, 1)
        : Math.max(f.opacity - dt * OPACITY_RATE, 0);
    }
    this.miniTowerActive = scan.activeMonolithType;

    // 微光三态（SceneState.cs:328-345）：state 1 → 开；state 2 显式关（压掉其它微光源）
    let flag = scan.shimmerMonolithState === 1 || !!env.zoneShimmer;      // :331
    if (scan.shimmerMonolithState === 2) flag = false;                    // :332-334
    // 原版按 tick 计（60Hz）：0.025/0.05 每步 → 每秒 ×60
    if (flag) {
      this.shimmerAlpha = moveTowards(this.shimmerAlpha, 1, 0.025 * 60 * dt);      // :337
      if (this.shimmerAlpha >= 0.5) {
        this.shimmerDarken = moveTowards(this.shimmerDarken, 1, 0.025 * 60 * dt);  // :339-341
        this.shimmerBrightenDelay = 4;
      }
    } else {
      this.shimmerDarken = moveTowards(this.shimmerDarken, 0, 0.05 * 60 * dt);     // :344
      if (this.shimmerDarken === 0) {
        this.shimmerBrightenDelay = moveTowards(this.shimmerBrightenDelay, 0, 1 * 60 * dt); // :345-347
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
  }

  /** 滤镜查询（测试/调试用） */
  state(key: string): FilterState | undefined {
    return this.filters.find((f) => f.def.key === key);
  }
  /** 任一滤镜仍在淡入/淡出（Filter.IsInUse Filter.cs:49-56） */
  get anyInUse(): boolean {
    return this.filters.some((f) => f.active || f.opacity > 0);
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
   *  playerScreen = 玩家屏幕坐标（MonolithMoonLord aimAtPlayer 的 target）。 */
  draw(
    ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
    viewW: number, viewH: number,
    playerScreen: { x: number; y: number },
  ): void {
    // MONOLITH_FILTER_DEFS 已按优先级升序声明（Medium → VeryHigh）
    for (const f of this.filters) {
      if (f.opacity <= 0) continue;   // Filter.IsVisible（Filter.cs:63-70）
      switch (f.def.kind) {
        case 'miniTower': this.drawMiniTower(ctx, f, viewW, viewH); break;
        case 'moonLord': this.drawMoonLord(ctx, f, viewW, viewH, playerScreen); break;
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

  /** FilterMoonLord（aimAtPlayer）：径向压暗近似（shader 二进制不在源码，
   *  深紫向外衰减——沿用既有近似基色 0.35/0.30/0.42） */
  private drawMoonLord(ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number,
    playerScreen: { x: number; y: number }): void {
    const r = Math.hypot(w, h) * 0.6;
    const grad = ctx.createRadialGradient(playerScreen.x, playerScreen.y, r * 0.2, playerScreen.x, playerScreen.y, r);
    grad.addColorStop(0, 'rgba(89,77,107,0)');
    grad.addColorStop(1, `rgba(89,77,107,${(0.35 * f.opacity).toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** FilterBloodMoon：UseColor(2,-0.8,-0.6) 的 multiply 近似（负通道按 0 截断；
   *  不透明度 = UseOpacity(BloodMoonScreenShaderData.Update) × Filter.Opacity） */
  private drawBloodMoon(ctx: CanvasRenderingContext2D, f: FilterState, w: number, h: number): void {
    const [r, g, b] = f.def.color!;
    const a = this.bloodMoonUseOpacity * f.opacity;
    if (a <= 0) return;
    const mix = (c: number) => Math.round(255 * Math.max(0, Math.min(1, 1 - a + c * a)));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** FilterSepia：半分辨率逐像素（亮度→棕调 + progress 加性染色），
   *  参数 progress/intensity/color 全部来自 SepiaScreenShaderData.Update（:10-55） */
  private drawSepia(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, f: FilterState, w: number, h: number): void {
    const low = this.lowCanvas(w, h);
    const lctx = low.getContext('2d')!;
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
    const lctx = low.getContext('2d')!;
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
}
