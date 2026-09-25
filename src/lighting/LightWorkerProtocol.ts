// ★C9 光照引擎 Worker 化·快照协议（2026-09-23;?lightworker=1 缺省关）。
// ★债登记（2026-09-25 trace:主线程残部 2-4% 恒在=TileLightScanner.exportTo/
//  blurLine 内联段）——C9 二期差量面:exportTo/blurLine 全量迁 worker（沿本文件
//  快照协议;scanner.reseed 掷流史与 FlickerClock 类随机源已登记的残余分歧面照抄）。
// 主线程每帧把「扫描窗 ± SNAPSHOT_PAD 的 tile 切片 + 相机/天空/时钟/点光参数」
// postMessage 给 LightWorker;worker 侧用同一份内核模块（TileLightScanner/LightMap/
// LightingEngine 零转录导入）在一个「快照 store」上跑 scan→blur→export,回传
// lightR/G/B（transferable）。
//
// ---- 快照 store 的坐标方案（内核零改动的前提） ----
// 内核对 tile store 的读法有两种：① st.idx(x,y) / st.inBounds / st.inWorld1
//（surfaceSky/hellSky/specialTileLight ctx）;② exportTo 热循环内联
// `rowBase = ty * st.w; i = rowBase + tx`（2026-09-19 热路径重排的产物,不改）。
// 因此切片不能做「索引重映射」（②会把世界坐标乘上切片宽度）,而采用**窗口 rebase**：
// worker 的 store 就是切片本身（w=sw, h=sh, idx(x',y')=y'*sw+x'）,扫描区域原点
// 平移进切片内 (px,py)=钳后 padding,世界标量按行/列平移（groundLevel/lavaLine −sy、
// 点光坐标 −sx/−sy）。可证与本地路径逐位同值的部分：
//   · InWorld(x,y,1) 外圈折叠：exportTo 的 lxLo/lxHi 由 rx 与 st.w 推出——worker 侧
//     rx'=px（钳后 padding）恰好编码了「区域到世界边缘的距离」：区域贴边 ⟺ px=0
//     ⟺ 折叠跳过首列/末列,与本地绝对坐标折叠逐格同集合（世界最外圈不扫描）。
//   · 天空/地狱行判定：surface = ty' <= groundLevel−sy,与绝对判定同值。
//   · shimmerBaseColor / localRandom 的坐标哈希：非平移不变——worker 侧给引擎的
//     FlickerClock/scanner 打 **坐标平移 shim**（见 applySnapshotToEngine）,把 rebase
//     坐标还原成绝对坐标再喂内核公式,同种子下位级可对拍（tests/light-worker-parity）。
// 残余混沌类分歧（与 C8 波场 Worker 同判例,生产态不可消除,逐项登记）：
//   a) FastRandom 种子链随实例调用史演化（scanner.reseed 每 exportTo 推进一步,
//      主/worker 调用节奏不同）;b) LightMap 水 flicker 种子 = Math.random（构造期）;
//   c) FlickerClock 水母笼 3×25 态机 = Math.random（不随快照恢复）;
//   d) specialTileLight case 719/316-318 直接消费 ctx.x/y（必须保持 rebase 值供
//      store 索引）→ 彩虹云色相/水母笼槽位随相机平移漂移（纯装饰、低幅）。
//
// ---- 切片窗口 = 扫描区域 ± SNAPSHOT_PAD ----
// 内核对「区域外」数据的三类触达：① surfaceSky/hellSky 的 ±1 邻格液体读（条件支路）;
// ② 718 星云的上邻格;③ 171 圣诞灯 origin 回溯（frameX<10 → 9 列 + frameY 行距
// ≤15）。SNAPSHOT_PAD=16 覆盖全部三类;切片再被世界边界钳制,钳后余量 (px,py) 就是
// worker 的区域原点（见上——折叠精确性依赖这一点）。
import type { LightingEngine } from './LightingEngine';
import type { AuroraFrameState, BiomeInfluence, FlickerClock } from './SkyColor';
import type { PerFrameLight } from './TileLightScanner';
import { updateLightDecay } from './lightTables';
import {
  getSkyFrameState, setFrameAtmo, setFrameAurora, setFrameBiome, setFrameCloudDim,
  setFrameDontStarve, setFrameHorizon, setFrameLightning, setFrameRemix,
} from './SkyColor';

/** 切片外扩（tile）。≥1 覆盖 surfaceSky/hellSky 邻格;≥16 覆盖 171 圣诞灯 origin 回溯
 *  （frameX<10 → 9 列;frameY 行距 ≤15）。>16 行高的巨树灯 origin 落切片外 = 有界
 *  边缘案例（灯在区域外圈 padding 带、贡献经 ≥28 格 blur 衰减 ≈7%,亚感知）,登记。 */
export const SNAPSHOT_PAD = 16;

/** 2s 失联看门狗（承 C8 WaveWorker 语义） */
export const LIGHT_WATCHDOG_MS = 2000;

// ---- 消息形状（type-only;运行时按此对齐,同 src/workers/protocol.ts 惯例） ----

/** worker 侧 SkyColor 模块级帧状态（getSkyFrameState 捕获 → applySkyFrameState 重放） */
export interface SkyFrameState {
  cloudDim: number;
  biome: BiomeInfluence | null;
  horizon: { sunrise: number; sunset: number; phase: number } | null;
  remixWorld: boolean;
  remixBlackSky: boolean;
  dontStarve: boolean;
  lightning: number;
  atmo: number;
  aurora: AuroraFrameState | null;
}

/** Game 每帧 updateLightDecay 实参（worker 按同参重放 → DECAY_AIR/SOLID/WATER 与
 *  globalBrightness、shimmerAlpha/shimmerDarken/shimmerWaterAlpha、sceneAir·SolidDecay
 *  状态机 1:1 演化——lightTables 模块级状态无外部 setter,重放是唯一同步口） */
export interface DecayArgs {
  waterStyle: number;
  nightVision: boolean;
  blackout: boolean;
  blind: boolean;
  opts: { headcovered?: boolean; inShimmer?: boolean; ftwDecay?: 'queen' | 'temple' | 'dungeon' };
}

/** FlickerClock pre-tick 状态快照（私有 dir 字段经 Record 通道捕获/恢复;
 *  水母笼态机不恢复=混沌类 c） */
export interface FlickerState {
  mt: number; mtd: number;      // mouseTextColor / mouseDir
  ca: number; cad: number;      // cursorAlpha / cursorDir
  dt: number; dtd: number;      // demonTorch / demonDir
  dr: number; dg: number; db: number; dss: number;   // disco 三通道 / discoStyle
  es: number; esd: number;      // essScale / essDir
  mc: number; mcd: number;      // masterColor / masterColorDir
  tve: number;                  // timeForVisualEffects
}

/** 13 通道切片包（行主序、宽 sw;主线程侧从世界数组按行复制,postMessage 结构克隆） */
export interface TileSlicePack {
  sx: number; sy: number; sw: number; sh: number;   // 切片窗口（世界 tile 坐标）
  px: number; py: number;                            // 区域原点在切片内 = 钳后 padding
  type: Uint16Array; flags: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array;
  wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array;
  half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  paint: Uint8Array; paintWall: Uint8Array; coat: Uint8Array;
  showInvisibleBlocks: boolean;
}

/** main→worker 每帧快照 */
export interface LightSnapshotMsg {
  op: 'frame';
  seq: number;
  /** 绝对扫描区域（= 引擎 ensureRegion 现值;回显于结果供主线程回填公共面） */
  rx: number; ry: number; rw: number; rh: number;
  /** 世界标量（绝对值;worker 侧 rebase） */
  groundLevel: number; lavaLine: number;
  clock: { timeOfDay: number; dayCount: number; eclipse: boolean; bloodMoon: boolean; moonPhase: number; isDay: boolean };
  sundial: number; moondial: number; raining: boolean;
  sky: SkyFrameState;
  decay: DecayArgs | null;
  flicker: FlickerState;
  /** 主线程 Main.GlobalTimeWrappedHourly 同步值（worker perf.now 时间原点不同） */
  hourly: number;
  /** 点光（绝对 tile 坐标;[tx,ty,r,g,b]） */
  held: [number, number, number, number, number] | null;
  buffs: number[][];
  per: number[][];
  tiles: TileSlicePack;
}

/** worker→main 结果（R/G/B transferable;rx/ry 绝对区域,主线程整体回填公共面） */
export interface LightResultMsg {
  op: 'light';
  seq: number;
  rx: number; ry: number; rw: number; rh: number;
  R: Uint8Array; G: Uint8Array; B: Uint8Array;
}

/** worker 致命错误通知（主线程立即回落,不等 2s 看门狗） */
export interface LightErrorMsg { op: 'error'; message: string }

// ---- 快照 store（worker 侧;内核以 TileStore 结构最小面直接消费,见头注） ----

/** 内核读表面（TileLightScanner 全链 + 引擎）逐字段对齐的窗口 store。
 *  写面不存在——快照只读,每帧整体 adopt 替换通道引用（postMessage 克隆产物直接持有,
 *  worker 侧零拷贝零重分配）。onTileChanged/onLiquidChanged 空实现供引擎构造器订阅。 */
export class SnapshotTileStore {
  w = 0; h = 0;
  showInvisibleBlocks = false;
  // 通道显式松型标注（Uint16Array 缺省 = ArrayBufferLike 视图域;adopt 每帧换引用,
  //  来源含结构克隆产物,不能钉成 <ArrayBuffer>）
  type: Uint16Array = new Uint16Array(0);
  flags: Uint8Array = new Uint8Array(0);
  frameX: Uint16Array = new Uint16Array(0);
  frameY: Uint16Array = new Uint16Array(0);
  wall: Uint16Array = new Uint16Array(0);
  liquid: Uint8Array = new Uint8Array(0);
  liquidType: Uint8Array = new Uint8Array(0);
  half: Uint8Array = new Uint8Array(0);
  slope: Uint8Array = new Uint8Array(0);
  wire: Uint8Array = new Uint8Array(0);
  paint: Uint8Array = new Uint8Array(0);
  paintWall: Uint8Array = new Uint8Array(0);
  coat: Uint8Array = new Uint8Array(0);

  adopt(t: TileSlicePack): void {
    this.w = t.sw; this.h = t.sh;
    this.showInvisibleBlocks = t.showInvisibleBlocks;
    this.type = t.type; this.flags = t.flags;
    this.frameX = t.frameX; this.frameY = t.frameY;
    this.wall = t.wall; this.liquid = t.liquid; this.liquidType = t.liquidType;
    this.half = t.half; this.slope = t.slope; this.wire = t.wire;
    this.paint = t.paint; this.paintWall = t.paintWall; this.coat = t.coat;
  }

  idx(x: number, y: number): number { return y * this.w + x; }
  inBounds(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** 原版 InWorld(x,y,1)——与 TileStore.inWorld1 同式（对切片尺寸取语义） */
  inWorld1(x: number, y: number): boolean { return x >= 1 && y >= 1 && x < this.w - 1 && y < this.h - 1; }
  onTileChanged(_fn: (x: number, y: number) => void): void { /* 快照 store 无写入面 */ }
  onLiquidChanged(_fn: (x: number, y: number) => void): void { /* 同上 */ }
}

// ---- 快照装配（主线程侧;引擎 buildWorkerSnapshot 与对拍测试共用同一条代码路径） ----

/** 引擎捕获视图（LightingEngine 的结构最小面;测试可直接喂真实引擎实例） */
export interface EngineCaptureView {
  rx: number; ry: number; rw: number; rh: number;
  world: { groundLevel: number; lavaLine: number; clock: { timeOfDay: number; dayCount: number } };
  flicker: FlickerClock;
  heldLight: { tx: number; ty: number; r: number; g: number; b: number } | null;
  buffLights: Array<{ tx: number; ty: number; r: number; g: number; b: number }>;
  perFrame: PerFrameLight[];
  decay: DecayArgs | null;
}

/** 组装每帧快照消息。tiles 由调用方（LightWorkerLink.buildSlice）先行切好;
 *  时钟取 pre-tick 状态（worker 侧 compute 的 tick 恰好推进到主线程 scan 时的状态）。 */
export function buildEngineSnapshot(cap: EngineCaptureView, tiles: TileSlicePack, seq: number): LightSnapshotMsg {
  const wc = cap.world.clock as { timeOfDay: number; dayCount: number; eclipse?: boolean; bloodMoon?: boolean; moonPhase?: number; isDay?: boolean };
  const w = cap.world as { sundialCooldown?: number; moondialCooldown?: number; weather?: { raining?: boolean } };
  const f = cap.flicker as unknown as Record<string, number>;
  const hourly = cap.flicker.globalTimeWrappedHourly;   // 经 getter 读（测试可钉）
  return {
    op: 'frame',
    seq,
    rx: cap.rx, ry: cap.ry, rw: cap.rw, rh: cap.rh,
    groundLevel: cap.world.groundLevel, lavaLine: cap.world.lavaLine,
    clock: {
      timeOfDay: wc.timeOfDay, dayCount: wc.dayCount,
      eclipse: wc.eclipse === true, bloodMoon: wc.bloodMoon === true,
      moonPhase: wc.moonPhase ?? 0, isDay: wc.isDay !== false,
    },
    sundial: w.sundialCooldown ?? 0,
    moondial: w.moondialCooldown ?? 0,
    raining: w.weather?.raining === true,
    sky: getSkyFrameState(),
    decay: cap.decay,
    flicker: {
      mt: f.mouseTextColor, mtd: f.mouseDir,
      ca: f.cursorAlpha, cad: f.cursorDir,
      dt: f.demonTorch, dtd: f.demonDir,
      dr: f.discoR, dg: f.discoG, db: f.discoB, dss: f.discoStyle,
      es: f.essScale, esd: f.essDir,
      mc: f.masterColor, mcd: f.masterColorDir,
      tve: f.timeForVisualEffects,
    },
    hourly,
    held: cap.heldLight ? [cap.heldLight.tx, cap.heldLight.ty, cap.heldLight.r, cap.heldLight.g, cap.heldLight.b] : null,
    buffs: cap.buffLights.map((l) => [l.tx, l.ty, l.r, l.g, l.b]),
    per: cap.perFrame.map((l) => [l.x, l.y, l.r, l.g, l.b]),
    tiles,
  };
}

// ---- worker 侧驱动（LightWorker.ts 薄壳调用;对拍测试直接调本函数=同一条代码路径） ----

/** worker 侧持久驱动状态（shim 偏移/时钟同步值——每帧消息更新） */
export interface WorkerDriveState {
  off: { sx: number; sy: number };
  hourly: number;
  shimmed: boolean;
}

export function createWorkerDriveState(): WorkerDriveState {
  return { off: { sx: 0, sy: 0 }, hourly: 0, shimmed: false };
}

/** SkyColor 模块级帧状态重放（worker 模块实例与主线程分立,setter 为唯一写口） */
function applySkyFrameState(s: SkyFrameState): void {
  setFrameCloudDim(s.cloudDim);
  setFrameBiome(s.biome);
  setFrameRemix(s.remixWorld, s.remixBlackSky);
  setFrameDontStarve(s.dontStarve);
  setFrameLightning(s.lightning);
  setFrameAtmo(s.atmo);
  setFrameHorizon(s.horizon);
  setFrameAurora(s.aurora);
}

/** FlickerClock pre-tick 状态恢复（私有 dir 字段经 Record 通道;水母笼态机不恢复） */
function restoreFlicker(fk: FlickerClock, s: FlickerState): void {
  const f = fk as unknown as Record<string, number>;
  f.mouseTextColor = s.mt; f.mouseDir = s.mtd;
  f.cursorAlpha = s.ca; f.cursorDir = s.cad;
  f.demonTorch = s.dt; f.demonDir = s.dtd;
  f.discoR = s.dr; f.discoG = s.dg; f.discoB = s.db; f.discoStyle = s.dss;
  f.essScale = s.es; f.essDir = s.esd;
  f.masterColor = s.mc; f.masterColorDir = s.mcd;
  f.timeForVisualEffects = s.tve;
}

/** 一次性 shim 安装：rebase 坐标 → 绝对坐标的平移补偿（内核公式零改动,见头注）。
 *  · shimmerBaseColor：波相位 = (x+y/6)/10,世界锚定——不补偿会随相机平移游移。
 *  · scanner.localRandom：RNG 哈希 (y*2654435761+x)|0 非平移不变——不补偿则每个
 *    闪烁随机元随 rebase 重掷（生产态同种子序列下与本地路径位级可比的保证,
 *    tests/light-worker-parity 锁定;种子链节奏差=混沌类 a,不受本 shim 影响）。
 *  · globalTimeWrappedHourly：worker performance.now 时间原点 ≠ 主线程——每帧同步值
 *    以实例自有属性遮蔽原型 getter（金标测试同款手法）。 */
function installClockShims(e: LightingEngine, fk: FlickerClock, ds: WorkerDriveState): void {
  const baseShimmer = fk.shimmerBaseColor;
  fk.shimmerBaseColor = (x: number, y: number) => baseShimmer.call(fk, x + ds.off.sx, y + ds.off.sy);
  const sc = (e as unknown as { scanner: { localRandom: (x: number, y: number) => unknown; random: { getSeed(): number } } }).scanner;
  const origLocalRandom = sc.localRandom.bind(sc);
  sc.localRandom = (x: number, y: number) => origLocalRandom(x + ds.off.sx, y + ds.off.sy);
  Object.defineProperty(fk, 'globalTimeWrappedHourly', { get: () => ds.hourly, configurable: true });
}

/** 应用一帧快照到 worker 侧镜像引擎并跑完整 Scan→Blur→Present 周期。
 *  返回结果负载（R/G/B 为引擎新分配数组,调用方 postMessage transfer）。 */
export function runSnapshotOnEngine(e: LightingEngine, m: LightSnapshotMsg, ds: WorkerDriveState): { rx: number; ry: number; rw: number; rh: number; R: Uint8Array; G: Uint8Array; B: Uint8Array } {
  // ① tile 窗口（通道引用整体替换,零拷贝）
  const st = e.world.store as unknown as SnapshotTileStore;
  st.adopt(m.tiles);
  // ② 世界标量 rebase（行/列平移,见头注）
  e.world.groundLevel = m.groundLevel - m.tiles.sy;
  e.world.lavaLine = m.lavaLine - m.tiles.sy;
  const clk: { timeOfDay: number; dayCount: number; eclipse?: boolean; bloodMoon?: boolean; moonPhase?: number; isDay?: boolean } = {
    timeOfDay: m.clock.timeOfDay, dayCount: m.clock.dayCount,
    eclipse: m.clock.eclipse, bloodMoon: m.clock.bloodMoon,
    moonPhase: m.clock.moonPhase, isDay: m.clock.isDay,
  };
  e.world.clock = clk;
  const wx = e.world as { sundialCooldown?: number; moondialCooldown?: number; weather?: { raining?: boolean } };
  wx.sundialCooldown = m.sundial;
  wx.moondialCooldown = m.moondial;
  wx.weather = { raining: m.raining };
  // ③ 天空帧状态 + 衰减表（worker 模块实例状态同步;顺序=主线程 decay→compute 同构）
  applySkyFrameState(m.sky);
  if (m.decay) updateLightDecay(m.decay.waterStyle, m.decay.nightVision, m.decay.blackout, m.decay.blind, m.decay.opts);
  // ④ 闪烁时钟：pre-tick 状态恢复 + shim（compute 内 tick 推进到主线程 scan 同态）
  const fk = (e as unknown as { flicker: FlickerClock }).flicker;
  restoreFlicker(fk, m.flicker);
  ds.off.sx = m.tiles.sx; ds.off.sy = m.tiles.sy;
  ds.hourly = m.hourly;
  if (!ds.shimmed) { installClockShims(e, fk, ds); ds.shimmed = true; }
  // ⑤ 区域（切片内坐标）+ 输出数组（上一帧 R/G/B 已 transfer 走,必须新分配）
  e.rx = m.tiles.px; e.ry = m.tiles.py; e.rw = m.rw; e.rh = m.rh;
  e.r = new Uint8Array(m.rw * m.rh);
  e.g = new Uint8Array(m.rw * m.rh);
  e.b = new Uint8Array(m.rw * m.rh);
  // ⑥ 点光（坐标 rebase）+ 脏标（快照模式每帧全量重扫,v1 不做脏标优化）
  e.heldLight = m.held ? { tx: m.held[0] - m.tiles.sx, ty: m.held[1] - m.tiles.sy, r: m.held[2], g: m.held[3], b: m.held[4] } : null;
  e.buffLights = m.buffs.map((a) => ({ tx: a[0] - m.tiles.sx, ty: a[1] - m.tiles.sy, r: a[2], g: a[3], b: a[4] }));
  e.dirty = true;
  e.liquidDirty = false;
  for (const p of m.per) e.addLight(p[0] - m.tiles.sx, p[1] - m.tiles.sy, p[2], p[3], p[4]);
  // ⑦ 完整周期（compute → tick → runFullCycle → scan/blur/present）
  e.compute(0);
  return { rx: m.rx, ry: m.ry, rw: m.rw, rh: m.rh, R: e.r, G: e.g, B: e.b };
}
