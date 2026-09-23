// 光照引擎(Terarria1456 Terraria.Graphics.Light/LightingEngine.cs 一比一)。
// 4 状态轮转(MinimapUpdate→ExportMetrics→Scan→Blur),每 tick 推进一态;
// dirty(tile 改动/区域移动/手持光)→ 同 tick 快进整个周期(原版传送双 LightTiles 技巧);
// liquidDirty → 同快进但 3 tick 节流(20Hz)。
// 替换原 BFS 引擎(备份见 docs/backup/LightingEngine.legacy.bak.ts)。
import { TILE } from '../core/constants';
import { TileStore } from '../world/TileStore';
import { AREA_PADDING, globalBrightness, NON_VISIBLE_PADDING } from './lightTables';
import { FlickerClock } from './SkyColor';
import { LightMap } from './LightMap';
import { PerFrameLight, ScannerWorld, TileLightScanner } from './TileLightScanner';
import { LightWorkerLink, lightWorkerFlag } from './LightWorkerLink';
import { buildEngineSnapshot, type DecayArgs, type LightSnapshotMsg } from './LightWorkerProtocol';

/** 引擎依赖的最小世界结构(World 结构兼容;单测可注入 fake) */
export interface LightingWorld {
  store: TileStore;
  groundLevel: number;  // 原版 worldSurface
  lavaLine: number;     // 原版 UnderworldLayer
  clock: { timeOfDay: number; dayCount: number };
}

const enum State { MinimapUpdate = 0, ExportMetrics = 1, Scan = 2, Blur = 3 }

export class LightingEngine {
  world: LightingWorld;
  // ---- 公共面(与 Game.ts/Renderer.ts 契约,勿改) ----
  rx = 0; ry = 0; rw = 0; rh = 0;
  r: Uint8Array = new Uint8Array(0);
  g: Uint8Array = new Uint8Array(0);
  b: Uint8Array = new Uint8Array(0);
  dirty = true;
  liquidDirty = false;
  heldLight: { tx: number; ty: number; r: number; g: number; b: number } | null = null;
  /** 玩家 buff 点光（光芒 11 / 狱火 116，Player.cs:9687-9690/:9896-9898 中心格
   *  【无条件】独立发射——与手持光源并存，引擎侧逐通道 max 合并
   *  （ApplyPerFrameLights :744 同原版 Vector3.Max，不叠加不优先） */
  buffLights: Array<{ tx: number; ty: number; r: number; g: number; b: number }> = [];
  /** 动态点光 API(原版 Lighting.AddLight;0-1 RGB)——每周期消费后清空 */
  addLight(x: number, y: number, r: number, g: number, b: number): void {
    this.perFrame.push({ x, y, r, g, b });
    this.dirty = true;
  }

  /** 本帧已注册的动态点光数（F5 调试报告只读 perFrame 长度） */
  get perFrameCount(): number { return this.perFrame.length; }

  // ---- 内部 ----
  private state: State = State.MinimapUpdate;
  private work = new LightMap();
  private active = new LightMap();
  private flicker = new FlickerClock();

  /** 全局闪烁时钟(mouseTextColor/cursorScale 等),资源条 HUD 等渲染层读取 */
  get clock(): FlickerClock { return this.flicker; }
  private scanner: TileLightScanner;
  private perFrame: PerFrameLight[] = [];
  private liqTick = 0;
  /** ★C9 光照 Worker 门面（?lightworker=1,缺省关=null）：快照发 worker、结果回填
   *  公共面;失联/异常 → 置 null 永久回落本地。镜像引擎在 worker 线程（LightWorker.ts） */
  private _lw: LightWorkerLink | null = null;
  /** ★C9：Game 每帧 updateLightDecay 实参捕获（noteDecayArgs）——lightTables 模块级
   *  衰减/shimmer 状态无外部 setter,worker 侧按同参重放 updateLightDecay 同步演化 */
  private _lwDecay: DecayArgs | null = null;

  constructor(world: LightingWorld) {
    this.world = world;
    this.scanner = new TileLightScanner(this.flicker);
    world.store.onTileChanged(() => { this.dirty = true; });
    world.store.onLiquidChanged(() => { this.liquidDirty = true; });
    // ★C9：惰性建链（Worker 首帧 compute 才真正 spawn）;旗关恒 null=本地路径零分叉
    if (lightWorkerFlag) this._lw = new LightWorkerLink();
  }

  /** ★C9：Game 在每帧 updateLightDecay(...) 后调用（同参捕获,worker 重放同步） */
  noteDecayArgs(waterStyle: number, nightVision: boolean, blackout: boolean, blind: boolean,
    opts: { headcovered?: boolean; inShimmer?: boolean; ftwDecay?: 'queen' | 'temple' | 'dungeon' }): void {
    this._lwDecay = { waterStyle, nightVision, blackout, blind, opts };
  }

  /** ★C9：实例弃用前拆除 Worker 链（Game.destroy 调用）——不拆则跨世界旧 worker
   *  持续自跑（泄漏 + 双份 CPU） */
  dispose(): void {
    if (this._lw !== null) { this._lw.dispose(); this._lw = null; }
  }

  /**
   * 区域 = 相机视口 ± AREA_PADDING(原版 GetAreaToLight 边界 1..2 + ProcessScan 膨胀 28 合并)。
   * camCX/camCY 为像素;viewW/viewH 为 tile 数(Game 现有调用约定)。
   */
  ensureRegion(camCX: number, camCY: number, viewW: number, viewH: number): void {
    const st = this.world.store;
    const x0 = Math.max(0, Math.floor(camCX / TILE) - Math.ceil(viewW / 2) - 1 - AREA_PADDING);
    const y0 = Math.max(0, Math.floor(camCY / TILE) - Math.ceil(viewH / 2) - 1 - AREA_PADDING);
    const x1 = Math.min(st.w - 1, Math.floor(camCX / TILE) + Math.ceil(viewW / 2) + 2 + AREA_PADDING);
    const y1 = Math.min(st.h - 1, Math.floor(camCY / TILE) + Math.ceil(viewH / 2) + 2 + AREA_PADDING);
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
    if (rw !== this.rw || rh !== this.rh || x0 !== this.rx || y0 !== this.ry) {
      // 原点只在重算时原子移动(防光影相对世界平移)
      this.rx = x0; this.ry = y0;
      if (rw !== this.rw || rh !== this.rh) {
        this.rw = rw; this.rh = rh;
        this.r = new Uint8Array(rw * rh);
        this.g = new Uint8Array(rw * rh);
        this.b = new Uint8Array(rw * rh);
      }
      this.dirty = true;
    }
  }

  /** 每帧调用。dayFactor 参数弃用(天空色改由 clock 内部推导;旧调用方签名兼容)。 */
  compute(_dayFactor: number): void {
    if (this.rw === 0) return;
    // ---- ★C9 光照 Worker 分支（?lightworker=1）----
    // 快照（区域 ± padding tile 切片 + 时钟/天空/衰减/点光参数）发 worker,结果回填
    // 公共面。三态：warmup(结果未达)=快照+本地双跑兜底(首帧不黑屏) → live=worker
    // only(本地 scan/blur 整段跳过,主线程拿回 7-12%) → 失联看门狗 2s/异常回执=
    // dispose+_lw 置 null 永久回落本地(dirty 强制首帧全周期)。时钟仍在主线程 tick
    // (HUD/渲染层 cursorScale/mouseTextColor 消费面照常);快照捕获 pre-tick 状态,
    // worker 侧恢复后由其 compute 的 tick 推进到同态(位级同相)。
    const lw = this._lw;
    if (lw !== null) {
      if (!lw.healthy()) {
        lw.dispose();
        this._lw = null;
        this.dirty = true;   // 回落后首帧强制全周期
      } else {
        const live = lw.isLive();
        // 快照区域须取本帧 ensureRegion 现值——applyPending 会把公共面区域回拨成
        // worker 上一帧区域(1 帧滞后;渲染读 (区域,数组) 恒成对一致),先捕获再回填。
        const reg = { rx: this.rx, ry: this.ry, rw: this.rw, rh: this.rh };
        lw.applyPending(this);
        lw.send(this.buildWorkerSnapshot(reg));
        if (live) {
          this.flicker.tick();        // HUD/渲染层闪烁消费面照常推进
          this.perFrame.length = 0;   // 点光已随快照带走(本地 processScan 不再跑)
          return;
        }
        // warmup：快照已发,本地照算兜底——tick 交给下方本地路径(勿双推进)
      }
    }
    this.flicker.tick();

    if (this.dirty) {
      this.runFullCycle();
      return;
    }
    if (this.liquidDirty) {
      this.liqTick++;
      if (this.liqTick % 3 !== 0) return; // 20Hz 节流
      this.runFullCycle();
      return;
    }
    // 空闲:每 tick 一态(完整周期 4 tick,原版 4 帧节奏)
    this.step();
  }

  /** ★C9：组装每帧快照（区域捕获值 + 点光/时钟/天空/衰减;tile 切片由门面暂存切出）。
   *  读表面清单见 LightWorkerProtocol 头注——快照协议的契约边界。 */
  private buildWorkerSnapshot(reg: { rx: number; ry: number; rw: number; rh: number }): Omit<LightSnapshotMsg, 'op' | 'seq'> {
    const lw = this._lw!;
    const tiles = lw.buildSlice(this.world.store, reg.rx, reg.ry, reg.rw, reg.rh);
    return buildEngineSnapshot({
      rx: reg.rx, ry: reg.ry, rw: reg.rw, rh: reg.rh,
      world: this.world,
      flicker: this.flicker,
      heldLight: this.heldLight,
      buffLights: this.buffLights,
      perFrame: this.perFrame,
      decay: this._lwDecay,
    }, tiles, 0);
  }

  /** 快进:同 tick 完成 Scan→Blur→Present(状态回 0) */
  private runFullCycle(): void {
    this.dirty = false;
    this.liquidDirty = false;
    this.liqTick = 0;
    this.processScan();
    this.processBlurAndPresent();
    this.state = State.MinimapUpdate;
  }

  private step(): void {
    switch (this.state) {
      case State.MinimapUpdate: // 空槽(小地图导出未移植;保留维持 4 tick 周期)
      case State.ExportMetrics: // 空槽(SceneMetrics 在 VanillaSpawner 独立实现)
        break;
      case State.Scan:
        this.processScan();
        break;
      case State.Blur:
        this.processBlurAndPresent();
        break;
    }
    this.state = (this.state + 1) % 4;
  }

  private processScan(): void {
    const w = this.world as ScannerWorld;
    this.work.setSize(this.rw, this.rh);
    this.work.nonVisiblePadding = Math.min(NON_VISIBLE_PADDING, (Math.min(this.rw, this.rh) - 1) >> 1);
    // 手持光源:RGB 来自 TorchID.TorchColor(原版 ItemCheck_EmitHeldItemLight 按火把种类取色)
    const perFrame = this.perFrame;
    if (this.heldLight) perFrame.push({ x: this.heldLight.tx, y: this.heldLight.ty, r: this.heldLight.r, g: this.heldLight.g, b: this.heldLight.b });
    for (const L of this.buffLights) perFrame.push({ x: L.tx, y: L.ty, r: L.r, g: L.g, b: L.b });
    this.scanner.exportTo(w, this.work, this.rx, this.ry, perFrame);
    perFrame.length = 0;
  }

  private processBlurAndPresent(): void {
    this.work.blur();
    // Present(LightingEngine.cs:131-135):交换双缓冲 + 导出 ×1.2 到公共面
    const tmp = this.active;
    this.active = this.work;
    this.work = tmp;
    const outR = this.r, outG = this.g, outB = this.b;
    const ar = this.active.r, ag = this.active.g, ab = this.active.b;
    const scale = globalBrightness * 255;
    for (let i = 0; i < outR.length; i++) {
      // 原版 ExportTo(LT57:231-233)是 `(int)(color*num)` 截断,非四舍五入。
      // 2026-09-19:`>=255 ? 255 : |0` 与旧 `Math.min(255, Math.trunc(v))` 全域等值
      // (v≥0 截断=|0;NaN:|0=0=ToUint8(NaN);Inf→255;-0.5:|0=0=ToUint8(-0);
      //  负值两侧同为 ToUint8(trunc(v))——光照图无负值,纯防御),省 3 对内建调用
      const vr = ar[i] * scale, vg = ag[i] * scale, vb = ab[i] * scale;
      outR[i] = vr >= 255 ? 255 : vr | 0;
      outG[i] = vg >= 255 ? 255 : vg | 0;
      outB[i] = vb >= 255 ? 255 : vb | 0;
    }
  }

  /** 取某 tile 光照(区域外返回 0;原版 GetColor 区域外语义) */
  lightAt(tx: number, ty: number, _dayFactor = 0): [number, number, number] {
    if (tx < this.rx || ty < this.ry || tx >= this.rx + this.rw || ty >= this.ry + this.rh) return [0, 0, 0];
    const i = (ty - this.ry) * this.rw + (tx - this.rx);
    return [this.r[i], this.g[i], this.b[i]];
  }

  /** ★C6 雨雪（2026-09-23）：lightAt 的零分配变体——结果写进调用方缓冲
   *  out[0..2],返回 out。逐位同值（同界外 0 语义/同索引式/同 0-255 域）；
   *  消费面=drawRain 逐滴采样（750 滴/帧 × 每次新建数组 = 雨天 ~90MB/s 级
   *  GC 流量,用户实机 trace 侧证 GC 面来自渲染热路径分配）。out.length<3
   *  时调用方契约违例（不兜底,尽早暴露）。 */
  lightAtTo(tx: number, ty: number, out: number[]): number[] {
    if (tx < this.rx || ty < this.ry || tx >= this.rx + this.rw || ty >= this.ry + this.rh) {
      out[0] = 0; out[1] = 0; out[2] = 0;
      return out;
    }
    const i = (ty - this.ry) * this.rw + (tx - this.rx);
    out[0] = this.r[i]; out[1] = this.g[i]; out[2] = this.b[i];
    return out;
  }
}

// ---- Utils.PlotLine / PlotTileLine 一比一(Utils.cs:2359-2415/:2460-2487;2026-09-03
//      荧光体 5107 手持光接线引入,玩家侧消费见 Player.emitMagiluminescenceLight) ----

/** Utils.PlotLine(Utils.cs:2359-2415):Bresenham 整数步进——陡线(x/y 斜率)先 Swap,
 *  终点格【不落】(`i != x1` 前闭后开);jump=false 时斜步双落点(中途格也 plot)。
 *  plot 返回 false 即中断并整线返回 false(调用方以此做界外/实体截断) */
export function plotLine(x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => boolean, jump = true): boolean {
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) { [x0, y0, x1, y1] = [y0, x0, y1, x1]; }
  const num = Math.abs(x1 - x0);
  const num2 = Math.abs(y1 - y0);
  let num3 = Math.trunc(num / 2);
  let num4 = y0;
  const num5 = x0 < x1 ? 1 : -1;
  const num6 = y0 < y1 ? 1 : -1;
  for (let i = x0; i !== x1; i += num5) {
    if (!plot(steep ? num4 : i, steep ? i : num4)) return false;
    num3 -= num2;
    if (num3 >= 0) continue;
    num4 += num6;
    if (!jump && !plot(steep ? num4 : i, steep ? i : num4)) return false;
    num3 += num;
  }
  return true;
}

/** Utils.PlotTileLine(Utils.cs:2460-2487):宽 width(世界像素)的"粗线"——沿线方向
 *  单位向量取垂直向量 ×(width/2) 得 ± 平行偏移(只在起点算一次,全段共用),对中线
 *  Bresenham 逐点再画 minOffset→maxOffset 的垂直短线(jump=false)。start/end 为
 *  世界像素坐标,格坐标换算 = Math.trunc(px/16)(Vector2.ToTileCoordinates 截断语义)。
 *  ★零长线退化保真:start==end(velocity==0 臂)时原版 normalize=0/0=NaN →
 *  (int)NaN = 0x80000000 不定值偏移 → 内层垂直短线落界外 → CastLightOpen 界外
 *  返回 false 整臂无光(荧光体站定帧只剩 Left→Right 横贯臂布光,原版即此行为) */
export function plotTileLine(sx: number, sy: number, ex: number, ey: number,
  width: number, plot: (x: number, y: number) => boolean): boolean {
  const half = width / 2;
  const dx = ex - sx, dy = ey - sy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;       // len==0 → 0/0=NaN(与 C# float 除零同语义)
  const px = -uy * half, py = ux * half;    // ±val3(NaN 传播)
  const toTile = (v: number): number => (Number.isNaN(v) ? -2147483648 : Math.trunc(v / 16));
  const mx = toTile(sx - px), my = toTile(sy - py);   // start−val3
  const nx = toTile(sx + px), ny = toTile(sy + py);   // start+val3
  const x0 = toTile(sx), y0 = toTile(sy);
  const x1 = toTile(ex), y1 = toTile(ey);
  const offMinX = mx - x0, offMinY = my - y0;
  const offMaxX = nx - x0, offMaxY = ny - y0;
  return plotLine(x0, y0, x1, y1, (x, y) =>
    plotLine(x + offMinX, y + offMinY, x + offMaxX, y + offMaxY, plot, false));
}
