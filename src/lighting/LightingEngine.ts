// 光照引擎(Terarria1456 Terraria.Graphics.Light/LightingEngine.cs 一比一)。
// 4 状态轮转(MinimapUpdate→ExportMetrics→Scan→Blur),每 tick 推进一态;
// dirty(tile 改动/区域移动/手持光)→ 同 tick 快进整个周期(原版传送双 LightTiles 技巧);
// liquidDirty → 同快进但 3 tick 节流(20Hz)。
// 替换原 BFS 引擎(备份见 docs/backup/LightingEngine.legacy.bak.ts)。
import { TILE } from '../core/constants';
import { TileStore } from '../world/TileStore';
import { AREA_PADDING, GLOBAL_BRIGHTNESS, NON_VISIBLE_PADDING } from './lightTables';
import { FlickerClock } from './SkyColor';
import { LightMap } from './LightMap';
import { PerFrameLight, ScannerWorld, TileLightScanner } from './TileLightScanner';

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
  heldLight: { tx: number; ty: number } | null = null;
  /** 动态点光 API(原版 Lighting.AddLight;0-1 RGB)——每周期消费后清空 */
  addLight(x: number, y: number, r: number, g: number, b: number): void {
    this.perFrame.push({ x, y, r, g, b });
    this.dirty = true;
  }

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

  constructor(world: LightingWorld) {
    this.world = world;
    this.scanner = new TileLightScanner(this.flicker);
    world.store.onTileChanged(() => { this.dirty = true; });
    world.store.onLiquidChanged(() => { this.liquidDirty = true; });
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
    // 手持火把:原版 TorchID.TorchColor(0)=1/0.95/0.8 全亮(与放置火把同亮度;此前的 ×0.5 是压暗偏差)
    const perFrame = this.perFrame;
    if (this.heldLight) perFrame.push({ x: this.heldLight.tx, y: this.heldLight.ty, r: 1, g: 0.95, b: 0.8 });
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
    const scale = GLOBAL_BRIGHTNESS * 255;
    for (let i = 0; i < outR.length; i++) {
      outR[i] = Math.min(255, Math.round(ar[i] * scale));
      outG[i] = Math.min(255, Math.round(ag[i] * scale));
      outB[i] = Math.min(255, Math.round(ab[i] * scale));
    }
  }

  /** 取某 tile 光照(区域外返回 0;原版 GetColor 区域外语义) */
  lightAt(tx: number, ty: number, _dayFactor = 0): [number, number, number] {
    if (tx < this.rx || ty < this.ry || tx >= this.rx + this.rw || ty >= this.ry + this.rh) return [0, 0, 0];
    const i = (ty - this.ry) * this.rw + (tx - this.rx);
    return [this.r[i], this.g[i], this.b[i]];
  }
}
