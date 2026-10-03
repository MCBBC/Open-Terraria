// ★C4 烘焙 Worker（2026-09-28;?wbake=1 灰度,缺省关）——chunk 重烘出主线程。
//
// 职责图（交付物）：
//   主线程（BakeClient/ChunkCache）            BakeWorker（本文件）
//   ─────────────────────────────              ─────────────────────────
//   markDirty/invalidateAll → dirtyQueue       常驻:WorkerAtlas(SpriteAtlas 子类,
//   flushDirty(get→worker 支路)                缺网缺 DOM,ensureVImage/rect 命中
//     → buildBakeSnapshot(切片,transfer)  ──▶  只读预置位图,miss 记账)+AutoTiler+
//   get(可视 miss) → 同上(去重/bump)            VanillaWallTiler + SheetEntry 视图
//   回包 completeWorkerBake:              ◀──  bake:'bake' → 时钟面同步(tileAnim.
//     ImageBitmap→页画布 drawImage             tick/renderEnv/GTW/plates428)→
//     +glMarkPageDirty(GL 增量账)              BakeSliceStore(切片 store)→
//   missing→ship(位图副本)→重派                 bakeChunkIntoEnv(共享内核,cell=-1
//   consumed→chunkConsumed(表替换链)            全画布)→transferToImageBitmap×2
//   旗关/worker 失败→主线程全链(现状)           (+荧光)→回包(missing/consumed 记账)
//
// worker 上下文禁令家族:本文件及 import 链零 document 触点（画布经 canvasEnv
// 工厂落 OffscreenCanvas;素材位图全部主线程 createImageBitmap 副本随包 transfer,
// worker 内不发网络请求、不建 Image）。
import { assertWorkerBootGate } from './workerBootGate';   // ★首导入 boot 闸（必须保持第一位;见该文件头注,x-ray 定谳防线）
import { SpriteAtlas, type DrawRect } from '../assets/SpriteAtlas';
import { AutoTiler } from '../render/AutoTiler';
import { VanillaWallTiler } from '../render/VanillaWallTiler';
import { TILE_BY_KEY } from '../data/tiles';
import { bakeChunkIntoEnv, type ChunkBakeEnv, type SheetEntryLike } from '../render/ChunkBake';
import { tileAnim } from '../render/TileAnim';
import { renderEnv, plates428Pressed } from '../render/VanillaTiler';
import { pinGameTimeTicks } from '../core/GameTime';
import { BAKE_S, BakeSliceStore, type BakeWorkerRequest, type BakeWorkerResponse } from './BakeProtocol';

assertWorkerBootGate('BakeWorker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

/** worker 侧 atlas：SpriteAtlas 子类——元数据全量复用（JSON 静态导入同源），
 *  位图表（vimages/images/sheets 视图）由主线程 ship 消息预置；ensureVImage/rect
 *  命中即记 consumed、图缺记 missing（回包上报 → 主线程 ship → 重派链）。
 *  ★绝不触父类懒加载（new Image/document）——worker 无 DOM。 */
class WorkerAtlas extends SpriteAtlas {
  missing = new Set<string>();
  consumed = new Set<string>();

  override ensureVImage(file: string): ImageBitmap | HTMLImageElement | null {
    const hit = this.vimages.get(file);
    if (hit) {
      this.consumed.add(file);
      return hit;
    }
    this.missing.add(file);
    return null;
  }

  override rect(file: string, sprite: string): DrawRect | null {
    const img = this.images.get(file);
    const entry = this.data.files[file];
    if (!img || !entry) {
      this.missing.add(file);   // 图缺=晚到表语义（表到位重派）;sprite 缺=永久数据缺,不区分记账（主线程同样静默 null）
      return null;
    }
    const s = entry.sprites.find((x) => x.name === sprite);
    if (!s) return null;
    this.consumed.add(file);
    return { img, sx: s.x, sy: img.height - s.y - s.h, sw: s.w, sh: s.h };
  }
}

const atlas = new WorkerAtlas();
const autotiler = new AutoTiler(atlas);
const wallTiler = new VanillaWallTiler(atlas);
/** 自有 tile 过程 sheet 视图（主线程 TileSheetGen 画布的随包位图） */
const workerSheets = new Map<number, SheetEntryLike>();
/** truncatesWalls（原 ChunkCache 构造期同表——玻璃/彩纸块/落雪块/水族箱） */
const TRUNCATES_WALLS = ['glass', 'v_328_confetti_block', 'v_459_snowfall_block', 'v_748_aquarium_block']
  .map((k) => TILE_BY_KEY[k] ?? -1)
  .filter((id) => id >= 0);

/** 常驻 256² scratch（transferToImageBitmap 后画布自动清零复用——零画布churn） */
const scratchWall = new OffscreenCanvas(BAKE_S, BAKE_S);
const scratchTile = new OffscreenCanvas(BAKE_S, BAKE_S);

self.onmessage = (ev: MessageEvent<BakeWorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      reply({ type: 'ready', id: msg.id });
      return;
    }
    if (msg.type === 'ship') {
      for (const { file, bmp } of msg.vimages) atlas.vimages.set(file, bmp);
      for (const { file, bmp } of msg.maples) atlas.images.set(file, bmp);
      for (const s of msg.sheets) {
        workerSheets.set(s.id, { canvas: s.bmp, kind: s.kind, w: s.w, h: s.h });
      }
      return;
    }
    if (msg.type === 'bake') {
      bake(msg.id, msg.snap);
      return;
    }
  } catch (e) {
    // 单请求失败:回 error（客户端对该 key 回退主线程）;结构化异常(初始化炸)回 fatal
    const message = e instanceof Error ? `${e.message}` : String(e);
    if (msg.type === 'bake') reply({ type: 'error', id: msg.id, message });
    else reply({ type: 'fatal', message: `[init/ship] ${message}` });
  }
};

function bake(id: number, snap: import('./BakeProtocol').BakeSnapshot): void {
  // ---- 时钟面同步（时间依赖烘焙格 parity:晶簇 GTW/tick 钟/风门/被踩板）----
  tileAnim.tick = snap.tick;
  renderEnv.wind = snap.envWind;
  renderEnv.worldSurface = snap.envWorldSurface;
  renderEnv.remix = snap.envRemix;
  pinGameTimeTicks(snap.gtwTicks);
  plates428Pressed.clear();
  for (const p of snap.plates428) plates428Pressed.add(p);

  const st = new BakeSliceStore(snap) as unknown as import('../world/TileStore').TileStore;
  // ↑结构子集跨越：烘焙调用树全读面已在 BakeSliceStore 落齐（idx/inBounds/isSolid/
  // isActive/12 通道/showInvisibleBlocks/真实 w/h）——契约见 ChunkBakeEnv 注。
  const chests: Array<{ x: number; y: number; frame?: number }> = [];
  for (let i = 0; i * 3 < snap.chestAnchors.length; i++) {
    chests.push({ x: snap.chestAnchors[i * 3], y: snap.chestAnchors[i * 3 + 1], frame: snap.chestAnchors[i * 3 + 2] });
  }
  const env: ChunkBakeEnv = {
    st,
    treeX: snap.treeX, treeStyle: snap.treeStyle, treeTops: snap.treeTops,
    groundLevel: snap.groundLevel, rockLevel: snap.rockLevel,
    chests,
    sheets: workerSheets,
    autotiler,
    wallTiler,
    truncatesWalls: TRUNCATES_WALLS,
  };
  const t0 = performance.now();
  const out = bakeChunkIntoEnv(env, snap.cx, snap.cy, scratchWall, scratchTile, -1);
  const ms = performance.now() - t0;
  const wallBmp = scratchWall.transferToImageBitmap();
  const tileBmp = scratchTile.transferToImageBitmap();
  const glowBmp = out.glow ? (out.glow as OffscreenCanvas).transferToImageBitmap() : null;
  const missing = [...atlas.missing]; atlas.missing.clear();
  const consumed = [...atlas.consumed]; atlas.consumed.clear();
  const tr: Transferable[] = [wallBmp, tileBmp];
  if (glowBmp) tr.push(glowBmp);
  reply({ type: 'baked', id, cx: snap.cx, cy: snap.cy, wall: wallBmp, tile: tileBmp,
    glow: glowBmp, missing, consumed, ms }, tr);
}

function reply(res: BakeWorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as Worker).postMessage(res, transfer ?? []);
}
