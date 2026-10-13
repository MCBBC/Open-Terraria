// ★C4 烘焙 Worker 化（2026-09-28）——快照协议 + worker 侧切片 store。
//
// 设计（任务计划稿落地）：
//  · 重烘请求 = (16+2·EXT)² 宽 × (16+EXT+SCAN_DOWN) 高的 store 切片（逐通道
//    typed array,transfer 零拷贝）+ 树/地面/宝箱快照 + 时钟面（tick/GTW/wind/
//    plates428——时间依赖烘焙格 parity）。
//  · 切片范围亲读 bakeChunkBody 全读面定谳：墙 ±1 / 树族外扩 ±6 / 树·仙人掌·
//    棕榈向下深扫描 ≤100（scanTreeType/cactusTextureFor/palmTreePaintStyle/
//    treeTrunkPaintStyle——inBounds 截断域）→ down=EXT+100 恒定；零帧重建左/上
//    扫描 ≤256（drawVanillaCell recon run——多格零帧件才触发,按需扩带）。
//  · 回传 = 256² ImageBitmap 双层（+可选荧光层）,transferable 零拷贝。
//  · 本模块 worker 安全：无 document/无 DOM 触点（TileStore.SOLID_LUT 纯数据）。
import { TILE_DEFS } from '../data/tiles';
import { TileStore } from '../world/TileStore';

/** 水平/向上外扩（树族第四遍 EXT=6;墙 EXT=1 内含） */
export const BAKE_EXT = 6;
/** 向下深扫描带（树/仙人掌/棕榈 100 格向下扫描 + EXT 缓冲） */
export const BAKE_SCAN_DOWN = 100;
/** 零帧重建左/上扫描带（drawVanillaCell recon ≤256 + 本格缓冲） */
export const BAKE_RECON_EXT = 258;

/** chunk 页内 cell 尺寸（=CHUNK*TILE=256;与 ChunkCache 页几何解耦的独立常量） */
export const BAKE_S = 256;

/** 烘焙快照（主线程构建 → postMessage transfer;worker 侧 BakeSliceStore 重建）。
 *  切片数组均为【行主序、宽=sliceW】的独立 buffer（从世界 store 逐行拷出）。 */
export interface BakeSnapshot {
  cx: number; cy: number;
  /** 切片左上角（tile 坐标）与切片宽高 */
  bx: number; by: number; bw: number; bh: number;
  /** 真实世界尺寸（棕榈绿洲门 st.w-380 / 深扫描 st.h 界——禁用切片尺寸冒充） */
  worldW: number; worldH: number;
  // ---- store 切片（烘焙全读面 12 通道;liquid 仅 518 悬挂火盆 tileTop 消费）----
  type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
  wall: Uint16Array; liquid: Uint8Array; half: Uint8Array; slope: Uint8Array;
  wire: Uint8Array; paint: Uint8Array; paintWall: Uint8Array; coat: Uint8Array;
  showInvisibleBlocks: boolean;
  // ---- 世界元数据（树族/油漆 style/宝箱姿态派生面）----
  groundLevel: number; rockLevel: number;
  treeX: number[]; treeStyle: number[]; treeTops: number[];
  /** 宝箱锚点紧凑表 [x,y,frame]×N（chestLidPoseAt 消费;ChestData 最小投影） */
  chestAnchors: Int32Array;
  // ---- 时钟面（时间依赖烘焙格 parity:129 晶簇 GTW / 719·452·485 等 tick 钟 /
  //      489-493 风门 / 428 被踩测重板）----
  tick: number; gtwTicks: number;
  envWind: number; envWorldSurface: number; envRemix: boolean;
  /** 被踩中的 428 测重板格线性索引（plates428Pressed 镜像） */
  plates428: number[];
}

/** worker 消息（主线程 → worker）。ship:烘焙素材随包（ImageBitmap transfer——
 *  createImageBitmap 副本,主线程持有原件不受 detach 影响）。
 *  ★mod 桥（2026-10-04）：modTiles 随首波 ship 直落（applyModTileDefs 保序注册,
 *  与主线程 internal 下标对齐;缺省=零 mod 零变化） */
export type BakeWorkerRequest =
  | { type: 'init'; id: number;
      /** ★bakenoread（2026-10-08 读回消除刀）:主线程 ?bakenoread=1 旗值下发
       *  （worker 无页面 query,不能自读 location）——与主线程 BAKE_NOREAD 同值,
       *  保内核（ChunkBakeEnv.noRead）主线程/worker 同旗同分支。缺省 false=现状。 */
      noRead?: boolean }
  | { type: 'ship'; id: number;
      vimages: Array<{ file: string; bmp: ImageBitmap }>;
      maples: Array<{ file: string; bmp: ImageBitmap }>;
      sheets: Array<{ id: number; kind: 'blend' | 'single' | 'object'; w?: number; h?: number; bmp: ImageBitmap }>;
      modTiles?: Array<{ def: import('../data/tiles').TileDef; internal: number; stable: number }>;
      modTileMetas?: Array<{ stableId: number; meta: unknown }>;
      /** ★刀3-墙/R-A-C2:mod 墙跨 worker(键注入 WALL_DEFS+vmeta 并入 vanilla.walls;
       *  贴图位图随 vimages 通道) */
      wallKeys?: Array<[string, number]>;
      modWallVmetas?: Array<{ id: number; meta: unknown }> }
  | { type: 'bake'; id: number; snap: BakeSnapshot };

/** worker 回包（worker → 主线程）。baked 的位图与快照通道全部 transfer。 */
export type BakeWorkerResponse =
  | { type: 'ready'; id: number }
  | { type: 'baked'; id: number; cx: number; cy: number;
      wall: ImageBitmap; tile: ImageBitmap; glow: ImageBitmap | null;
      missing: string[]; consumed: string[]; ms: number }
  | { type: 'fatal'; message: string }
  | { type: 'error'; id: number; message: string };

// ---------------------------------------------------------------------------
// 快照构建（主线程;ChunkCache/探针消费）
// ---------------------------------------------------------------------------

/** 零帧多格重建扫描触发检测：核心区（含 y0-1 底缝补绘行）内存在 active 多格
 *  零帧件 → recon 扩带（左/上 258）。判定与 drawVanillaCell recon 门同谓词
 *  （vanilla.fw>1||vanilla.fh>1 ∧ fx==0 ∧ fy==0 ∧ active）。 */
function needsReconExt(store: TileStore, x0: number, y0: number): boolean {
  for (let y = y0 - 1; y < y0 + 16; y++) {
    for (let x = x0; x < x0 + 16; x++) {
      if (!store.inBounds(x, y)) continue;
      const i = store.idx(x, y);
      if (!store.flags[i]) continue;
      const v = TILE_DEFS[store.type[i]]?.vanilla;
      if (!v) continue;
      if ((v.fw ?? 1) > 1 || (v.fh ?? 1) > 1) {
        if (store.frameX[i] === 0 && store.frameY[i] === 0) return true;
      }
    }
  }
  return false;
}

/** 逐通道矩形切片（世界 store 行主序大数组 → 行拷贝小数组）。 */
function sliceChannel<T extends Uint8Array | Uint16Array>(
  src: T, w: number, x0: number, y0: number, bw: number, bh: number): T {
  const out = new (src.constructor as new (n: number) => T)(bw * bh);
  for (let row = 0; row < bh; row++) {
    const s = (y0 + row) * w + x0;
    out.set(src.subarray(s, s + bw), row * bw);
  }
  return out;
}

export interface BakeSnapshotMeta {
  groundLevel: number; rockLevel: number;
  treeX: number[]; treeStyle: number[]; treeTops: number[];
  chests: Array<{ x: number; y: number; frame?: number }> | undefined;
  showInvisibleBlocks: boolean;
  tick: number; gtwTicks: number;
  envWind: number; envWorldSurface: number; envRemix: boolean;
  plates428: number[];
}

/** 构建重烘快照（主线程调用;通道数组随 postMessage transfer）。 */
export function buildBakeSnapshot(store: TileStore, cx: number, cy: number, meta: BakeSnapshotMeta): BakeSnapshot {
  const x0 = cx * 16, y0 = cy * 16;
  const recon = needsReconExt(store, x0, y0);
  const left = recon ? BAKE_RECON_EXT : BAKE_EXT;
  const top = recon ? BAKE_RECON_EXT : BAKE_EXT;
  const bx = Math.max(0, x0 - left);
  const by = Math.max(0, y0 - top);
  const bw = Math.min(store.w, x0 + 16 + BAKE_EXT) - bx;
  const bh = Math.min(store.h, y0 + 16 + BAKE_EXT + BAKE_SCAN_DOWN) - by;
  const chests = meta.chests;
  const anchors = new Int32Array(Math.max(0, chests?.length ?? 0) * 3);
  if (chests) {
    for (let i = 0; i < chests.length; i++) {
      anchors[i * 3] = chests[i].x; anchors[i * 3 + 1] = chests[i].y;
      anchors[i * 3 + 2] = chests[i].frame ?? 0;
    }
  }
  return {
    cx, cy, bx, by, bw, bh, worldW: store.w, worldH: store.h,
    type: sliceChannel(store.type, store.w, bx, by, bw, bh),
    flags: sliceChannel(store.flags, store.w, bx, by, bw, bh),
    frameX: sliceChannel(store.frameX, store.w, bx, by, bw, bh),
    frameY: sliceChannel(store.frameY, store.w, bx, by, bw, bh),
    wall: sliceChannel(store.wall, store.w, bx, by, bw, bh),
    liquid: sliceChannel(store.liquid, store.w, bx, by, bw, bh),
    half: sliceChannel(store.half, store.w, bx, by, bw, bh),
    slope: sliceChannel(store.slope, store.w, bx, by, bw, bh),
    wire: sliceChannel(store.wire, store.w, bx, by, bw, bh),
    paint: sliceChannel(store.paint, store.w, bx, by, bw, bh),
    paintWall: sliceChannel(store.paintWall, store.w, bx, by, bw, bh),
    coat: sliceChannel(store.coat, store.w, bx, by, bw, bh),
    showInvisibleBlocks: meta.showInvisibleBlocks,
    groundLevel: meta.groundLevel, rockLevel: meta.rockLevel,
    treeX: meta.treeX, treeStyle: meta.treeStyle, treeTops: meta.treeTops,
    chestAnchors: anchors,
    tick: meta.tick, gtwTicks: meta.gtwTicks,
    envWind: meta.envWind, envWorldSurface: meta.envWorldSurface, envRemix: meta.envRemix,
    plates428: meta.plates428,
  };
}

/** 快照所有可 transfer 的 buffer（postMessage transfer 列表;零拷贝纪律） */
export function snapshotBuffers(snap: BakeSnapshot): ArrayBuffer[] {
  return [snap.type, snap.flags, snap.frameX, snap.frameY, snap.wall, snap.liquid,
    snap.half, snap.slope, snap.wire, snap.paint, snap.paintWall, snap.coat,
    snap.chestAnchors].map((a) => a.buffer as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// worker 侧切片 store：TileStore 结构子集（烘焙内核全读面）。
// idx/inBounds 映射切片局部；w/h 暴露真实世界维度（绿洲门/深扫描界——
// 与 ChunkBakeEnv 契约一致）。isSolid/isActive 逐式复制 TileStore 同名语义。
// ---------------------------------------------------------------------------

export class BakeSliceStore {
  readonly w: number; readonly h: number;
  showInvisibleBlocks: boolean;
  readonly type: Uint16Array; readonly flags: Uint8Array;
  readonly frameX: Uint16Array; readonly frameY: Uint16Array;
  readonly wall: Uint16Array; readonly liquid: Uint8Array;
  readonly half: Uint8Array; readonly slope: Uint8Array; readonly wire: Uint8Array;
  readonly paint: Uint8Array; readonly paintWall: Uint8Array; readonly coat: Uint8Array;
  private readonly bx: number; private readonly by: number;
  private readonly bw: number; private readonly bh: number;

  constructor(snap: BakeSnapshot) {
    this.w = snap.worldW; this.h = snap.worldH;
    this.showInvisibleBlocks = snap.showInvisibleBlocks;
    this.type = snap.type; this.flags = snap.flags;
    this.frameX = snap.frameX; this.frameY = snap.frameY;
    this.wall = snap.wall; this.liquid = snap.liquid;
    this.half = snap.half; this.slope = snap.slope; this.wire = snap.wire;
    this.paint = snap.paint; this.paintWall = snap.paintWall; this.coat = snap.coat;
    this.bx = snap.bx; this.by = snap.by; this.bw = snap.bw; this.bh = snap.bh;
  }

  idx(x: number, y: number): number { return (y - this.by) * this.bw + (x - this.bx); }

  inBounds(x: number, y: number): boolean {
    return x >= this.bx && y >= this.by && x < this.bx + this.bw && y < this.by + this.bh;
  }

  /** TileStore.isSolid 逐式（切片版）：active 门 + 致动门 + SOLID_LUT */
  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (this.flags[i] === 0) return false;
    if (this.wire[i] & TileStore.WIRE_ACTUATED) return false;
    return TileStore.SOLID_LUT[this.type[i]] === 1;
  }

  /** TileStore.isActive 逐式（切片版）：active ∧ 非致动 */
  isActive(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.flags[this.idx(x, y)] !== 0
      && (this.wire[this.idx(x, y)] & TileStore.WIRE_ACTUATED) === 0;
  }
}
