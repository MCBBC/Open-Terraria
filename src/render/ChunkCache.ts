// chunk 静态缓存：每 chunk 16×16 tile 预渲染到离屏 canvas（墙层+tile 层）
import { CHUNK, TILE } from '../core/constants';
import { T, TILE_DEFS, WALL_DEFS, TILE_BY_KEY } from '../data/tiles';
import { hash2 } from '../core/rng';
import { drawVanillaCell, drawTreeCell } from './VanillaTiler';
import { treeTrunkPaintStyle, palmTreePaintStyle } from './VanillaTiler';
// 树油漆 style 派生已迁 VanillaTiler（2026-08-25：WindSway 同源消费防环）——re-export 保既有引用面
export { treeGroundVariant, treeTrunkPaintStyle, palmTreePaintStyle } from './VanillaTiler';
import { frameMergesWith } from './TileMergeFamily';
import { swayBakeSkip } from './WindSway';
import { TILE_ANIM_RATE, tileAnim, campfireYOffset } from './TileAnim';
import { cageAnimRate, cageFamilyOf } from './CritterCage';
import { VanillaWallTiler, wallAnimRate } from './VanillaWallTiler';
import { shade } from '../assets/Palette';
import { getTilePaintSettings, type LeafPaintSettings } from '../world/Paint';
import { tintRegion } from './TileTint';
import type { TileSheetEntry } from '../assets/TileSheetGen';
import type { AutoTiler } from './AutoTiler';
import { TileStore } from '../world/TileStore';
import type { World } from '../world/World';

// 我们的 tile → Maples RuleTile 规则名（有规则的走素材自动贴合，无规则回退程序化）
// Grass 走人工标注（'@grass'）：Tiles_2.png 是多 tile 混排图集，自动分类不可靠；
// 用 public/annotator.html 标注后写入 sprites/annotations.json。无标注时回退程序化。
const TILE_RULES: Record<number, string> = {
  // 泥土/石/草走原版 BlendRules；铁矿走原版表——均不再用 Maples 规则
  13: '工作台', 14: '熔炉', 15: '铁砧',
};

export interface ChunkPair {
  wall: HTMLCanvasElement;   // atlas 页·墙层（水画在它之上）——用 sx/sy 源矩形取 cell
  tile: HTMLCanvasElement;   // atlas 页·tile 层（画在水之上）
  /** cell 页内左上(两页同位;Renderer drawImage 9 参源矩形用) */
  sx: number;
  sy: number;
  /** cell 归还凭据 page*CELLS_PER_PAGE+slot;-1 = 外部 stub(测试)/独立目标(无页) */
  cell: number;
  /** 荧光涂层叠层（独立 256² 画布，懒分配——仅 chunk 内存在 fullbrightBlock/Wall
   *  涂层位时创建）：从已烘墙/页拷贝涂层格 16×16 区域。Renderer 在光照合成【后】
   *  绘制 = 原版 DrawTiles_GetLightOverride（TileDrawing.cs:6727-6731）tileLight=White
   *  的等价物（全屏乘光管线无逐格顶点色通道，叠层是仓内最小侵入实现）。
   *  undefined = 本 chunk 无荧光涂层格（零开销路径）。 */
  glow?: HTMLCanvasElement;
}

// ---- 油漆逐像素着色：tintRegion 迁至共享模块 render/TileTint（2026-08-23：摆动件
// 绘制时染色同源复用，防双实现漂移） ----


export class ChunkCache {
  chunks = new Map<number, ChunkPair>();
  dirtyQueue: number[] = [];
  /** dirtyQueue 伴生去重集——includes O(n)(invalidateAll 时 O(n²));Set 化后入队 O(1) */
  private dirtySet = new Set<number>();
  sheets: Map<number, TileSheetEntry>;
  world: World;
  autotiler: AutoTiler | null;
  wallTiler: VanillaWallTiler | null;
  truncatesWalls: number[] = [];
  /** 含动画 tile 的 chunk，按 sheet 分组（换帧时只重建对应 chunk，避免全量重烘焙） */
  private animChunksBySheet = new Map<number, Set<number>>();
  /** 含动画墙的 chunk，按 wallId 分组（墙无 sheet 概念；DoUpdate_AnimateWalls 的
   *  11 类换带墙 + 242/243 星彩玻璃逐格错相——换带时只重建对应 chunk） */
  private animChunksByWall = new Map<number, Set<number>>();
  /** 满档基数(唯一事实源):进世界回满(Game.afterWorldLoad)与熔断减半
   *  (Renderer onLost)都从这里取值——★曾两处各自硬编码,静态改 192 后
   *  afterWorldLoad 仍写回 384 = 改动静默失效(2026-08-19 实证)。
   *  384→192(双开 IOSurface 实测:满额 = 2×24=48 张/窗,是单窗张数大头;
   *  192 = 2×12=24 张,仍为视野 ~48 chunk 的 4 倍余量,跑图重烘焙由
   *  flushDirty 4 chunk/帧限速兜底) */
  static readonly BASE_MAX_CHUNKS = 192;
  /** LRU 上限(.chunk 计;atlas 化后上限页数 = ceil(N/16)×2 张画布)。
   *  此前 Map 只增不减——跑图积累无界(内存泄漏 #1) */
  static MAX_CHUNKS = ChunkCache.BASE_MAX_CHUNKS;
  /** CPU 软渲染门(Renderer.setRenderMode 写入):烘焙画布走 willReadFrequently */
  static CPU_RENDER = false;  // 起高(2026-08-14 复原 224:contextlost 自适应兜底已就位,压力真来自动减半 384→192→96;★--force-gpu-mem-available-mb 已证为安慰剂(只管 cc tile 预算,见 2026-08-18 IOSurface 审计),双开靠本类 atlas 页化+云染池化+renderMode=cpu)
  /** 最近一次 flushDirty 实测耗时 ms（F5 调试报告：烘焙尖峰证据面） */
  lastFlushMs = 0;
  lastFlushCount = 0;

  // ---- chunk atlas 页池(2026-08-18 IOSurface 张数优化) ----
  // 旧结构:每 chunk 2 张 256² canvas(稳态 35 chunk=70 张、满额 768 张),且
  // renderChunkInner 每次重烘焙【新建】画布——移动期 flushDirty 4 chunk/帧 =
  // 每帧 8 张新画布,GPU 进程 ~480 次/秒 IOSurface 分配/释放(双窗翻倍)。
  // 双开 GPU 爆的根因即此:macOS IOSurface 按【张】计费(mach port 级内核资源),
  // 字节无关(16×16 的分配也失败)——`--force-gpu-mem-available-mb` 只管 cc tile
  // 预算救不了(blink/common/switches.cc 注释实证)。
  // 页化:墙/tile 各一摞 1024² 页(4×4 cell/页),活张数 ≤ 2×ceil(N/16)
  // (稳态 ~6 张、满额 50 张),重烘焙 = clip+translate 原位重画 cell,
  // 运行期画布创建/销毁 = 0(页只在 dispose/退出世界时销毁)。
  private static readonly CELLS_PER_PAGE = 16;
  private static readonly PAGE_COLS = 4;
  private wallPages: HTMLCanvasElement[] = [];
  private tilePages: HTMLCanvasElement[] = [];
  /** 每页在用 cell 数(与 wallPages 同长;页全空可被 trimFreePages 回收——
   *  熔断软收缩路径的显存释放在 atlas 化后不能只还 cell 不放页,每页 2×4MB) */
  private pageUsed: number[] = [];
  /** 空闲 cell 栈(page*16+slot;栈顶复用 = 热页优先) */
  private cellFree: number[] = [];
  /** 调试/F5:当前 atlas 页数(墙+tile 双层各一摞,画布张数 = 2×页数) */
  get pageCount(): number { return this.wallPages.length; }

  /** 归还 chunk cell(★页不销毁——重烘焙/换 chunk 复用同一批页,零画布churn)。
   *  所有丢弃旧 pair 的路径(标脏重建/LRU 淘汰/全量标脏)都必须先过这里;
   *  外部 stub(测试)/独立目标(cell=-1)无页可还 = no-op */
  releasePair(pair: ChunkPair | undefined): void {
    const c = pair?.cell;
    if (typeof c !== 'number' || c < 0) return;
    this.cellFree.push(c);
    this.pageUsed[Math.floor(c / ChunkCache.CELLS_PER_PAGE)]--;
  }

  /** 回收尾部全空页(GPU 软收缩后调用:LRU 淘汰只还 cell,页的 4MB 背板仍在;
   *  中段空页留待复用不毁——索引稳定性,只从尾部收缩) */
  trimFreePages(): void {
    while (this.wallPages.length && this.pageUsed[this.wallPages.length - 1] === 0) {
      const wp = this.wallPages.pop()!, tp = this.tilePages.pop()!;
      this.pageUsed.pop();
      wp.width = 0; wp.height = 0;
      tp.width = 0; tp.height = 0;
    }
    const live = this.wallPages.length * ChunkCache.CELLS_PER_PAGE;
    if (this.cellFree.some((c) => c >= live)) {
      this.cellFree = this.cellFree.filter((c) => c < live);
    }
  }

  private allocCell(): number {
    if (!this.cellFree.length) {
      const pageIdx = this.wallPages.length;
      const S = CHUNK * TILE * ChunkCache.PAGE_COLS;
      const mkPage = (): HTMLCanvasElement => {
        const c = document.createElement('canvas');
        if (ChunkCache.CPU_RENDER) { c.getContext('2d', { willReadFrequently: true }); }
        c.width = S; c.height = S;
        return c;
      };
      this.wallPages.push(mkPage());
      this.tilePages.push(mkPage());
      this.pageUsed.push(0);
      for (let s = ChunkCache.CELLS_PER_PAGE - 1; s >= 0; s--) {
        this.cellFree.push(pageIdx * ChunkCache.CELLS_PER_PAGE + s);
      }
    }
    const cell = this.cellFree.pop()!;
    this.pageUsed[Math.floor(cell / ChunkCache.CELLS_PER_PAGE)]++;
    return cell;
  }

  dispose(): void {
    // 页级释放(width=0 即刻归还 GPU 背板);cell/chunk 表随页一起清
    for (const p of this.wallPages) { p.width = 0; p.height = 0; }
    for (const p of this.tilePages) { p.width = 0; p.height = 0; }
    this.wallPages.length = 0;
    this.tilePages.length = 0;
    this.pageUsed.length = 0;
    this.cellFree.length = 0;
    this.chunks.clear();
    this.dirtyQueue.length = 0;
    this.dirtySet.clear();
    this.animChunksBySheet.clear();
    this.animChunksByWall.clear();
    if (this.bakeArriveTimer) { clearTimeout(this.bakeArriveTimer); this.bakeArriveTimer = 0; }
    if (this.sheetReplacedTimer) { clearTimeout(this.sheetReplacedTimer); this.sheetReplacedTimer = 0; }
    this.chunkSheets.clear();
    this.arriveFiles.clear();
    this.chunkConsumed.clear();
    this.replacedFiles.clear();
    if (this.atlasRef?.bakeTracker) this.atlasRef.bakeTracker = null; // 解绑,防跨世界回调
  }

  constructor(world: World, sheets: Map<number, TileSheetEntry>, autotiler: AutoTiler | null = null, wallTiler: VanillaWallTiler | null = null, atlas?: import('../assets/SpriteAtlas').SpriteAtlas | null) {
    this.world = world;
    this.sheets = sheets;
    this.autotiler = autotiler;
    this.wallTiler = wallTiler;
    // 原版 TileID.Sets.TruncatesWalls（54 玻璃 / 328 暗影宝箱 / 459 / 748）→ 内部 tile id
    this.truncatesWalls = ['glass', 'v_328_shadow_chest', 'v_459_', 'v_748_']
      .map((k) => TILE_BY_KEY[k] ?? -1)
      .filter((id) => id >= 0);
    world.store.onTileChanged((x, y) => this.markDirtyAround(x, y));
    // 烘焙懒取自注册(2026-08-13 结构自愈):renderChunk 置 _baking 期间 ensureVImage
    // 的 miss 被 note 记录到【当前 chunk 的缺表集】,晚到 onLoaded → 去抖后只重烘
    // 含该表的 chunk(★2026-08-14 trace 实锤:进地牢 = 地牢墙/砖/背景批晚到 →
    // 旧版全量 invalidateAll = 384 chunk × 数百 drawImage 大表 = 15s 内 21 万次
    // 图像重解码风暴(GPU 内存压力致解码缓存反复驱逐)→ 渲染进程崩溃)
    if (atlas) {
      this.atlasRef = atlas;
      atlas.bakeTracker = {
        _baking: false,
        note: (file: string) => {
          if (this._bakingKey === null) return;
          let s = this.chunkSheets.get(this._bakingKey);
          if (!s) { s = new Set(); this.chunkSheets.set(this._bakingKey, s); }
          s.add(file);
          this.noteConsumedInto(this._bakingKey, file);
        },
        // 消费登记(2026-08-19 素材重制热补丁):烘焙期 ensureVImage 命中(hit)的表
        // 也登记——onBakeAssetArrived 只覆盖 miss 晚到,替换已就位表必须走
        // onSheetReplaced(否则热补丁替换 tile/wall sheet 后已烘 chunk 不重烘)
        noteConsumed: (file: string) => {
          if (this._bakingKey === null) return;
          this.noteConsumedInto(this._bakingKey, file);
        },
        onLoaded: (file: string) => this.onBakeAssetArrived(file),
      };
    }
  }

  private noteConsumedInto(k: number, file: string): void {
    let s = this.chunkConsumed.get(k);
    if (!s) { s = new Set(); this.chunkConsumed.set(k, s); }
    s.add(file);
  }

  private atlasRef: import('../assets/SpriteAtlas').SpriteAtlas | null = null;
  /** 每 chunk 烘焙时缺失的贴图文件(晚到精确重烘依据;markDirty/淘汰时删) */
  private chunkSheets = new Map<number, Set<string>>();
  /** 每 chunk 烘焙时消费过的贴图文件(miss+hit 全量;运行期替换 sheet 的精确
   *  重烘依据——素材重制热补丁用;markDirty/淘汰时删) */
  private chunkConsumed = new Map<number, Set<string>>();
  /** 当前正在烘焙的 chunk key(note 写入用) */
  private _bakingKey: number | null = null;

  /** 晚到贴图 → 去抖合批 → 只重烘登记过该文件的 chunk。
   *  全程无登记(所有烘焙时已就位)= 无 fallback 可修 → no-op(绝不能 invalidateAll
   *  兜底——那正是解码风暴根因) */
  private bakeArriveTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private arriveFiles = new Set<string>();
  /** 调试/F5:最近一轮晚到重烘的 chunk 数(0=无需修) */
  arriveInvalidateChunks = 0;
  onBakeAssetArrived(file: string): void {
    this.arriveFiles.add(file);
    if (this.bakeArriveTimer) return;
    this.bakeArriveTimer = setTimeout(() => {
      this.bakeArriveTimer = 0;
      const files = this.arriveFiles;
      this.arriveFiles = new Set();
      let hit = 0;
      for (const [k, sheets] of this.chunkSheets) {
        for (const f of files) {
          if (sheets.has(f)) {
            this.markDirty(k & 0xffff, (k >> 16) & 0xffff);
            hit++;
            break;
          }
        }
      }
      this.arriveInvalidateChunks = hit;
    }, 500) as unknown as ReturnType<typeof setTimeout>;
  }

  /** 运行期替换已就位的 sheet(素材重制热补丁)→ 去抖合批 → 只重烘【消费过】
   *  该文件的 chunk。与 onBakeAssetArrived 同构但查 chunkConsumed(hit 也有登记);
   *  统计并入 arriveInvalidateChunks(F5 观测同源)。★禁 invalidateAll(解码风暴前科) */
  private sheetReplacedTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private replacedFiles = new Set<string>();
  onSheetReplaced(file: string): void {
    this.replacedFiles.add(file);
    if (this.sheetReplacedTimer) return;
    this.sheetReplacedTimer = setTimeout(() => {
      this.sheetReplacedTimer = 0;
      const files = this.replacedFiles;
      this.replacedFiles = new Set();
      let hit = 0;
      for (const [k, consumed] of this.chunkConsumed) {
        for (const f of files) {
          if (consumed.has(f)) {
            this.markDirty(k & 0xffff, (k >> 16) & 0xffff);
            hit++;
            break;
          }
        }
      }
      if (hit) this.arriveInvalidateChunks = hit;
    }, 500) as unknown as ReturnType<typeof setTimeout>;
  }

  static key(cx: number, cy: number): number {
    return (cx & 0xffff) | ((cy & 0xffff) << 16);
  }

  markDirty(cx: number, cy: number) {
    const k = ChunkCache.key(cx, cy);
    if (!this.chunks.has(k)) return; // 未生成的 chunk 惰性创建
    this.releasePair(this.chunks.get(k)); // 旧画布丢弃前先释放,防 detached canvas 积压
    this.chunks.set(k, undefined as unknown as ChunkPair); // 标记删除，重绘时重建
    this.chunkSheets.delete(k);  // 重建时会重新登记缺表
    this.chunkConsumed.delete(k);
    this.enqueueDirty(k);
  }

  private enqueueDirty(k: number) {
    if (this.dirtySet.has(k)) return;
    this.dirtySet.add(k);
    this.dirtyQueue.push(k);
  }

  /** 区域标脏（tile 范围）：供树冠等大范围精灵清理使用 */
  markDirtyArea(x0: number, y0: number, x1: number, y1: number) {
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        if (cx < 0 || cy < 0) continue;
        this.markDirty(cx, cy);
      }
    }
  }

  markDirtyAround(x: number, y: number) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    this.markDirty(cx, cy);
    // 边缘融合：邻接 chunk 也要标脏
    if (x % CHUNK === 0) this.markDirty(cx - 1, cy);
    if (x % CHUNK === CHUNK - 1) this.markDirty(cx + 1, cy);
    if (y % CHUNK === 0) this.markDirty(cx, cy - 1);
    if (y % CHUNK === CHUNK - 1) this.markDirty(cx, cy + 1);
  }

  /** 全量标脏(atlas 懒加载晚到的新表 → 已烘焙的 chunk 里可能烤了 fallback)。
   *  4/帧 的 flushDirty 会逐步重烘焙,dirtySet 去重防重复入队 */
  invalidateAll(): void {
    for (const k of this.chunks.keys()) {
      if (this.chunks.get(k) === undefined) continue; // 已是待重建哨兵
      this.releasePair(this.chunks.get(k)); // 同 markDirty:旧画布丢弃前释放
      this.chunks.set(k, undefined as unknown as ChunkPair);
      this.enqueueDirty(k);
    }
  }

  /** 每帧重绘脏 chunk:数量上限 maxN 之外再加时间预算 budgetMs——
   *  跑图/全量标脏时烘焙突发不再挤占帧预算(实测 87ms 尖峰来源) */
  flushDirty(maxN = 4, budgetMs = 6) {
    let n = 0;
    const t0 = performance.now();
    while (this.dirtyQueue.length && n < maxN) {
      const k = this.dirtyQueue.shift()!;
      this.dirtySet.delete(k);
      const cx = k & 0xffff, cy = (k >> 16) & 0xffff;
      if (this.chunks.get(k) !== undefined) continue; // 已重建(动画 chunk 稳态轮转的正常路径)
      if (!this.world.store.inBounds(cx * CHUNK, cy * CHUNK)
        && !this.world.store.inBounds(cx * CHUNK + CHUNK - 1, cy * CHUNK + CHUNK - 1)) {
        continue; // 世界外/已淘汰的悬空 key:静默出队(防永久滞留)
      }
      this.get(cx, cy);
      n++;
      if (performance.now() - t0 > budgetMs) break; // 单 chunk 烘焙超预算也至少完成 1 个
    }
    this.lastFlushMs = performance.now() - t0;
    this.lastFlushCount = n;
  }

  /** 动画时钟推进（Game 每帧调用）：sheet/wallId 到达换帧行 tick → 只重建对应 chunk。
   *  原版语义 = AnimateTiles / DoUpdate_AnimateWalls 每 rate tick 推进一帧；
   *  帧内 chunk 复用零开销 */
  /** 视野范围(像素世界坐标);advanceAnim 只重烘视野内 chunk(2026-08-14
   *  trace②实锤:站定+暂停仍崩溃——屏外/暂停下的动画重烘=持续 drawImage 大表
   *  =慢性解码风暴。原版单机暂停世界全冻结,屏外动画不推进无视觉差异) */
  animView: { x0: number; y0: number; x1: number; y1: number } | null = null;
  advanceAnim(): void {
    const inView = (k: number) => {
      const v = this.animView;
      if (!v) return true;
      const cx = (k & 0xffff) * CHUNK * TILE, cy = ((k >> 16) & 0xffff) * CHUNK * TILE;
      const s = CHUNK * TILE;
      return cx + s > v.x0 && cx < v.x1 && cy + s > v.y0 && cy < v.y1;
    };
    tileAnim.tick++;
    if (this.animChunksBySheet.size) {
      for (const [sheet, set] of this.animChunksBySheet) {
        const rate = TILE_ANIM_RATE[sheet] ?? (cageFamilyOf(sheet) ? cageAnimRate(sheet) : 0);
        if (!rate || tileAnim.tick % rate !== 0) continue;
        for (const k of set) if (inView(k)) this.markDirty(k & 0xffff, (k >> 16) & 0xffff);
      }
    }
    if (this.animChunksByWall.size) {
      for (const [wallId, set] of this.animChunksByWall) {
        const rate = wallAnimRate(wallId);
        if (!rate || tileAnim.tick % rate !== 0) continue;
        for (const k of set) if (inView(k)) this.markDirty(k & 0xffff, (k >> 16) & 0xffff);
      }
    }
  }

  /** 取 chunk 双层画布（惰性生成，LRU 淘汰最久未用） */
  get(cx: number, cy: number): ChunkPair {
    const k = ChunkCache.key(cx, cy);
    let c = this.chunks.get(k);
    if (c) {
      // LRU:命中即刷新 recency(delete+set 移到 Map 尾部)。渲染循环每帧都 get
      // 可视 chunk,故屏上 chunk 永远最新、不会被误淘汰
      this.chunks.delete(k);
      this.chunks.set(k, c);
      return c;
    }
    c = this.renderChunk(cx, cy);
    this.chunks.set(k, c);
    while (this.chunks.size > ChunkCache.MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.releasePair(this.chunks.get(oldest)); // 淘汰画布同样释放,防 detached 积压
      this.chunkSheets.delete(oldest);
      this.chunkConsumed.delete(oldest);
      this.chunks.delete(oldest);
    }
    return c;
  }

  /** 树枝判定：TREE 且上下皆非 TREE、恰好一侧为 TREE（横向独连树干）。
   *  下方是实心地面的属于树根底座 —— 走规则表渲染底座贴图，不算枝干 */

  private neighborMask(x: number, y: number, type: number): number {
    const st = this.world.store;
    let mask = 0;
    const same = (nx: number, ny: number) => st.inBounds(nx, ny) && st.flags[st.idx(nx, ny)] && st.type[st.idx(nx, ny)] === type ? 1 : 0;
    mask |= same(x, y - 1);        // N
    mask |= same(x + 1, y) << 1;   // E
    mask |= same(x, y + 1) << 2;   // S
    mask |= same(x - 1, y) << 3;   // W
    mask |= same(x + 1, y - 1) << 4; // NE
    mask |= same(x + 1, y + 1) << 5; // SE
    mask |= same(x - 1, y + 1) << 6; // SW
    mask |= same(x - 1, y - 1) << 7; // NW
    return mask;
  }

  private renderChunk(cx: number, cy: number): ChunkPair {
    // 烘焙期标志:此块内 ensureVImage 的 miss/晚到走 bakeTracker 自注册重烘链
    const tracker = this.atlasRef?.bakeTracker;
    if (tracker) tracker._baking = true;
    this._bakingKey = ChunkCache.key(cx, cy);
    this.chunkSheets.delete(this._bakingKey); // 重烘焙 = 重新登记
    this.chunkConsumed.delete(this._bakingKey);
    const cell = this.allocCell();
    try {
      const page = Math.floor(cell / ChunkCache.CELLS_PER_PAGE);
      return this.bakeChunkInto(cx, cy, this.wallPages[page], this.tilePages[page], cell);
    } catch (e) {
      this.cellFree.push(cell); // 烘焙异常:cell 归还,防页池泄漏
      this.pageUsed[Math.floor(cell / ChunkCache.CELLS_PER_PAGE)]--;
      throw e;
    } finally {
      if (tracker) tracker._baking = false;
      this._bakingKey = null;
    }
  }

  /** 把 chunk 烘焙进目标页的 cell。cell ≥ 0 = atlas 页内槽位(ox/oy 由 cell 推出);
   *  cell < 0 = 外部传入的独立 256² 目标(E2E 像素对拍用,ox=oy=0)。atlas 页与
   *  独立画布走同一函数、同一 clip 语义 → 像素一致由构造保证,无第二份烘焙代码 */
  bakeChunkInto(cx: number, cy: number, wallPage: HTMLCanvasElement, tilePage: HTMLCanvasElement, cell: number): ChunkPair {
    // 双层：墙层 / tile 层分离 —— 水渲染在两层之间（墙之上、图块之下）
    // ★cell 裁剪+平移:与旧"独立 256² 画布"完全同语义——墙 EXT=1/树 EXT=6 的
    //   负坐标/越界外溢绘制被 clip 挡在 cell 内,绝不漏进相邻 cell;
    //   重烘焙前 clearRect 洗掉旧内容(旧版靠新画布天然透明)
    const S = CHUNK * TILE;
    const slot = cell >= 0 ? cell % ChunkCache.CELLS_PER_PAGE : 0;
    const ox = (slot % ChunkCache.PAGE_COLS) * S;
    const oy = Math.floor(slot / ChunkCache.PAGE_COLS) * S;
    const wctx = wallPage.getContext('2d')!;
    const tctx = tilePage.getContext('2d')!;
    for (const c of [wctx, tctx]) {
      c.save();
      c.beginPath(); c.rect(ox, oy, S, S); c.clip();
      c.translate(ox, oy);
      c.clearRect(0, 0, S, S);
      c.imageSmoothingEnabled = false;
    }
    let ctx = tctx; // 前景层(下文 tile pass);墙层=wctx
    const wall = wallPage, tile = tilePage;
    // ★异常安全:save 后必须 restore——异常逃逸会让【共享页】上下文残留 clip+
    // translate,下次烘焙错位到 2×偏移(独立画布时代异常自含,页化后必须显式复位)
    let pair: ChunkPair;
    try {
      this.bakeChunkBody(cx, cy, wctx, ctx, wall, tile, ox, oy);
    } finally {
      wctx.restore();
      ctx.restore();
    }
    pair = { wall, tile, sx: ox, sy: oy, cell };
    // ---- 荧光涂层叠层烘焙（fullbrightBlock/Wall 位格 16×16 拷贝；无涂层格零开销）----
    //  墙区先拷、tile 区后拷 = 同格内墙下 tile 上的世界层序（跨格序与原版逐格
    //  绘制一致：涂层格各自独立 16×16）。多格物件只有被涂格区域进叠层 = 与油漆
    //  逐格着色的等价边界同口径（见下方油漆 pass 登记注）。
    const st2 = this.world.store;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const FB = TileStore.COAT_FULLBRIGHT_BLOCK | TileStore.COAT_FULLBRIGHT_WALL;
    let hasGlow = false;
    for (let ly = 0; ly < CHUNK && !hasGlow; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        if (st2.coat[st2.idx(x0 + lx, y0 + ly)] & FB) { hasGlow = true; break; }
      }
    }
    if (hasGlow && typeof document !== 'undefined') {
      const glow = document.createElement('canvas');
      glow.width = S; glow.height = S;
      const gctx = glow.getContext('2d')!;
      gctx.imageSmoothingEnabled = false;
      for (let ly = 0; ly < CHUNK; ly++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const i = st2.idx(x0 + lx, y0 + ly);
          const c = st2.coat[i];
          if (!(c & FB)) continue;
          const px = lx * TILE, py = ly * TILE;
          if (c & TileStore.COAT_FULLBRIGHT_WALL) {
            gctx.drawImage(wallPage, ox + px, oy + py, TILE, TILE, px, py, TILE, TILE);
          }
          if (c & TileStore.COAT_FULLBRIGHT_BLOCK && st2.flags[i] && st2.type[i] !== 0) {
            gctx.drawImage(tilePage, ox + px, oy + py, TILE, TILE, px, py, TILE, TILE);
          }
        }
      }
      pair.glow = glow;
    }
    return pair;
  }

  /** bakeChunkInto 的绘制主体(私有;坐标全为 cell 内局部,translate 已由外层挂好) */
  private bakeChunkBody(cx: number, cy: number, wctx: CanvasRenderingContext2D, ctx: CanvasRenderingContext2D,
    wall: HTMLCanvasElement, tile: HTMLCanvasElement, ox: number, oy: number): void {
    const st = this.world.store;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;

    // ---- 第一遍：背景墙全部先画（避免后格的墙盖住跨格物体如宝箱/树冠）----
    // 原版墙 framing（VanillaWallTiler）：32×32 帧以格为中心外溢 8px →
    // 扫描范围外扩 1 格，跨 chunk 边界的帧由相邻 chunk 补齐（像素一致无副作用）
    if (this.wallTiler) {
      const EXT = 1;
      for (let ly = -EXT; ly < CHUNK + EXT; ly++) {
        for (let lx = -EXT; lx < CHUNK + EXT; lx++) {
          const x = x0 + lx, y = y0 + ly;
          if (!st.inBounds(x, y)) continue;
          const i = st.idx(x, y);
          const wallId = st.wall[i];
          if (wallId === 0) continue;
          // 回声涂层墙（invisibleWall）：不绘制（TileDrawing.IsVisible 同款门——
          // DrawTiles 墙段 :991 flag2=IsVisible → !flag2 时 flag=false 跳墙绘制），
          // 仅 showInvisibleBlocks（回声腔激活/幽灵护目镜）时显形
          if ((st.coat[i] & TileStore.COAT_INVISIBLE_WALL) !== 0 && !st.showInvisibleBlocks) continue;
          const px = lx * TILE, py = ly * TILE;
          if (this.wallTiler.hasTexture(wallId)) {
            this.wallTiler.draw(wctx, st, x, y, wallId, this.truncatesWalls, px, py);
            // 动画墙（DoUpdate_AnimateWalls 换带 + 星彩玻璃逐格错相）：登记进换带
            // 重烘焙行列——墙无 sheet 概念，按 wallId 另建 map（tiles 侧同款机制）
            if (wallAnimRate(wallId) !== 0) {
              let wset = this.animChunksByWall.get(wallId);
              if (!wset) { wset = new Set(); this.animChunksByWall.set(wallId, wset); }
              wset.add(ChunkCache.key(cx, cy));
            }
          } else {
            const wd = WALL_DEFS[wallId];
            if (wd) {
              wctx.fillStyle = wd.mapColor;
              wctx.fillRect(px, py, TILE, TILE);
              wctx.fillStyle = shade(wd.mapColor, 0.8);
              wctx.fillRect(px, py + TILE - 1, TILE, 1);
              wctx.fillRect(px + TILE - 1, py, 1, TILE);
            }
          }
        }
      }
    }

    // ---- 第二遍：前景 tile / 物体（绘制到 tile 层画布；水渲染在墙层与 tile 层之间）----
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, y = y0 + ly;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        const px = lx * TILE, py = ly * TILE;
        const type = st.type[i];
        // 原版语义:非活性格不渲染(TileRunner 会给空气格写幽灵 type)
        if (type === 0 || !st.flags[i]) continue;
        // 回声涂层块（invisibleBlock）：不绘制（TileDrawing.IsVisible，TileDrawing.cs:
        // 1434-1452——invisibleBlock() → return _shouldShowInvisibleBlocks；墙/水从
        // 缺口透出 = 原版"隐形的墙后世界"）。特例同表：19 平台 48 行/541·631 恒隐
        // （:1437-1443，与涂层无关的固有隐形帧，本仓未建模该帧语义，不接）
        if ((st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0 && !st.showInvisibleBlocks) continue;
        // 已致动(inActive):幽灵态淡显(原版 DrawInactiveSorter,Main.cs:2828 附近)
        // 每格开头统一设定 alpha(各 continue 路径无需逐个恢复,下一格自愈)
        const actuated = (st.wire[i] & 32) !== 0;
        ctx.globalAlpha = actuated ? 0.3 : 1;
        const def = TILE_DEFS[type];
        if (!def) { ctx.fillStyle = '#808080'; ctx.fillRect(px, py, TILE, TILE); continue; }
        // 风摆动图块（草/藤/吊挂植物/树冠标记帧）：摘出静态烘焙，
        // 由 Renderer 的 WindSway overlay 逐帧动态绘制（原版 AddSpecialPoint 特殊路径）
        if (def.vanilla && swayBakeSkip(type, st.frameX[i])) continue;
        // 训练假人（tile 378）：摘出静态烘焙，由 Renderer drawDummyTileAnim 逐帧
        // 动态绘制当前动画行（TileDrawing.cs:4374-4399 addFrY 单层绘制语义）——
        // 烘焙静止行垫底+动画行覆盖会出现"同朝向重影"：后仰姿态的底部/边缘
        // 透明像素会透出烘焙层的静止行（2026-08-23 用户实报）
        if (def.vanilla?.sheet === 378) continue;
        // 原版素材图块（TileDef.vanilla）：TEdit framing 查找表（auto）或显式 18px 帧（style）
        if (def.vanilla && this.autotiler) {
          // 动画陈设（原版 AnimateTiles/GetTileDrawData addFrY）：frameY += 帧索引*pitch
          // （pitch 默认 38，3 格高特例组 54，篝火族特例 36+熄灭行静止——见 TileAnim）
          let fy = st.frameY[i];
          if (def.vanilla.sheet === 215) {
            fy = campfireYOffset(st.frameY[i]);   // 返回完整绘制 y（基行归位+动画帧）
            let set215 = this.animChunksBySheet.get(215);
            if (!set215) { set215 = new Set(); this.animChunksBySheet.set(215, set215); }
            set215.add(ChunkCache.key(cx, cy));
          } else if (def.vanilla.sheet === 314) {
            // 矿车轨道加速带动画（Main.cs:18734-18741 每 10 tick 推进、5 帧回卷）：
            // 只注册重烘焙——frameY 是后轨连接 ID，勿走 addFrY 帧偏移；
            // 帧行偏移由 drawMinecartTrackCell → sourceRectOf(frameID, anim) 处理
            let set314 = this.animChunksBySheet.get(314);
            if (!set314) { set314 = new Set(); this.animChunksBySheet.set(314, set314); }
            set314.add(ChunkCache.key(cx, cy));
          } else if (cageFamilyOf(def.vanilla.sheet)) {
            // 小动物笼族（CritterCage.ts）：帧行偏移由 drawVanillaCell→drawCageCell
            // 内部按 (族,槽位,tick) 计算，此处只注册重烘焙
            let setC = this.animChunksBySheet.get(def.vanilla.sheet);
            if (!setC) { setC = new Set(); this.animChunksBySheet.set(def.vanilla.sheet, setC); }
            setC.add(ChunkCache.key(cx, cy));
          } else if (TILE_ANIM_RATE[def.vanilla.sheet]) {
            // 动画家具换帧行：此处只登记重烘焙——帧带偏移由 drawVanillaCell 在
            // 零帧重建/分带换算之后叠加（原版 GetTileDrawData addFrY 语义）。
            // 曾在此预加进 fy：零帧多格物体（生成端 dgWr 系放置未写帧）的
            // 重建门 (ofx===0 && ofy===0) 被动画偏移破坏 → 炼金台 355/巫惑台 354
            // 在 idx≥1 帧整物塌成 9 块重复左上角碎片（idx=0 时偶发正常）
            let set = this.animChunksBySheet.get(def.vanilla.sheet);
            if (!set) { set = new Set(); this.animChunksBySheet.set(def.vanilla.sheet, set); }
            set.add(ChunkCache.key(cx, cy));
          }
          drawVanillaCell(
            ctx, this.autotiler.atlas, def.vanilla.sheet, def.vanilla.frame,
            def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
            st, x, y, type,
            // 同 id 融合 + 原版跨类型合并家族（TileMergeFamily:砖/沙/冰雪族互连,
            // 群系交界按已连接取帧——边缘帧圆角透明像素会透出远景背景亮光）
            (t) => t === type || frameMergesWith(type, t),
            px, py, st.frameX[i], fy,
            { treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
              worldSurface: this.world.groundLevel, worldW: this.world.w },
          );
          continue;
        }
        // 树苗：Tree_Bodys 树干段作小苗（底部对齐）
        if (type === T.SAPLING && this.autotiler) {
          const r = this.autotiler.saplingSprite(x, y);
          if (r) {
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px + (TILE - r.sw) / 2, py + TILE - r.sh, r.sw, r.sh);
            continue;
          }
        }
        // 杂草：Maples Tiles_3 杂草贴图（16×20，底部对齐，hash 选变体）
        if (type === T.TALLGRASS && this.autotiler) {
          const r = this.autotiler.weedSprite(x, y);
          if (r) {
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px - (r.sw - TILE) / 2, py + TILE - r.sh, r.sw, r.sh);
            continue;
          }
        }
        // 有 RuleTile 规则的 tile 用 Maples 素材自动贴合
        const ruleName = this.autotiler ? TILE_RULES[type] : undefined;
        if (ruleName && this.autotiler) {
          // 草皮覆盖件：保持原生透明（缺口露出背后的墙/天空），不做任何垫底/填充
          if (ruleName === '@grass') {
            const r = this.autotiler.tile(ruleName, st, x, y, type);
            if (r) ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
            continue;
          }
          const r = this.autotiler.tile(ruleName, st, x, y, type);
          if (r) {
            // 大图（树冠 80×80，宽>2格）跳过 —— 第三遍统一绘制（跨 chunk 补全 + 树叶盖树干）
            if (r.sw > TILE * 2) continue;
            // 按精灵原始尺寸绘制。树干等"宽≤2格、高>1格"的竖向件顶部对齐：
            // 溢出向下伸，由更下方的格（后画）覆盖 —— 下层不压上层。
            let dy = py + (TILE - r.sh) / 2;
            if (r.sh > TILE && r.sw <= TILE * 2) dy = py;
            const dx = px + (TILE - r.sw) / 2;
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, dx, dy, r.sw, r.sh);
            continue;
          }
        }
        const entry = this.sheets.get(type);
        if (!entry) {
          ctx.fillStyle = '#FF00FF';
          ctx.fillRect(px, py, TILE, TILE);
          continue;
        }
        if (entry.kind === 'blend') {
          const mask = this.neighborMask(x, y, type);
          const col = mask & 15, row = mask >> 4;
          ctx.drawImage(entry.canvas, col * TILE, row * TILE, TILE, TILE, px, py, TILE, TILE);
        } else if (entry.kind === 'object') {
          // 仅锚点绘制整体
          if (st.frameX[i] === 0 && st.frameY[i] === 0) {
            const w = (entry.w ?? 1) * TILE, h = (entry.h ?? 1) * TILE;
            ctx.drawImage(entry.canvas, px, py, w, h);
          }
        } else {
          // single：帧偏移直接取
          ctx.drawImage(entry.canvas, st.frameX[i], st.frameY[i], TILE, TILE, px, py, TILE, TILE);
        }
      }
    }
    ctx.globalAlpha = 1; // 致动幽灵 alpha 复位(防影响后续 pass)

    // ---- 油漆逐像素 pass：墙层 + tile 层分别着色（TileShader.cso 真值） ----
    // 原版 tile/wall 各自经 tileShader 按格取 paint（TilePaintSystemV2）；
    // Canvas 等价 = tintRegion 逐像素 applyPaintTint/applyPaintTintSpecial。
    // 分发判据（Main.cs:58064-58083）：特判组 ⟺ paint∈[1,12] ∧ 类型在
    // getTilePaintSettings 表内【都】成立；墙恒无特判组（isWall 只影响负相 30 档）。
    // style 派生仅 5/323（GetTreeBiome/GetPalmTreeBiome，TileDrawing.cs:1460-1478）。
    // ★ 等价边界：原版按"绘制调用"着色（多格物件整张贴图随锚格上色）；
    //   本实现按 16×16 格区域着色——涂多格家具/树只有被涂格区域显色（登记）
    //   (atlas 化:src=页画布,区域坐标须用页内绝对 ox+lx*TILE)
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, y = y0 + ly;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        const pw = st.paintWall[i];
        if (pw > 0 && st.wall[i] !== 0) {
          tintRegion(wctx, wall, ox + lx * TILE, oy + ly * TILE, pw, lx * TILE, ly * TILE, true);
        }
        const pt = st.paint[i];
        if (pt > 0 && st.flags[i] && st.type[i] !== 0) {
          const vt = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
          let style = 0;
          if (vt === 5) style = treeTrunkPaintStyle(st, x, y, st.frameX[i], st.frameY[i], this.world.groundLevel);
          else if (vt === 323) style = palmTreePaintStyle(st, x, y, this.world.w);
          // 表外类型(null)或 paint 非 1-12(函数内守卫) → 普通组 applyPaintTint
          const special = pt >= 1 && pt <= 12 ? getTilePaintSettings(vt ?? -1, style) ?? undefined : undefined;
          tintRegion(ctx, tile, ox + lx * TILE, oy + ly * TILE, pt, lx * TILE, ly * TILE, false, special);
        }
      }
    }

    // ---- 第三遍：半砖（halfBrick）——主绘制后清掉上半 8px ----
    // VanillaTiler blend/auto/style 三路径已按原版源矩形裁剪（源 y+8 高-8）；
    // 此处 clearRect 仅作兜底（uv 查找失败走 vframe(1,1) 全帧回退等路径仍画满 16×16）
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = st.idx(x0 + lx, y0 + ly);
        if (st.half[i]) ctx.clearRect(lx * TILE, ly * TILE, TILE, 8);
      }
    }

    // ---- 第四遍：树静态部分（跨 chunk 外扩绘制） ----
    // 风摆动系统接管后：树冠/树枝标记帧不再烘焙（Renderer WindSway overlay 逐帧摆动），
    // 本遍只保留棕榈干身（倾斜跨列必须外扩遍）与蘑菇树顶（72 原版不摆动）。
    if (this.autotiler) {
      const treeIds = ['v_72_mushroom_tree', 'v_323_palm_trees']
        .map((k) => TILE_BY_KEY[k]).filter((id) => id !== undefined);
      for (const v5 of treeIds) {
        const EXT = 6;
        for (let ty = y0 - EXT; ty < y0 + CHUNK + EXT; ty++) {
          for (let tx = x0 - EXT; tx < x0 + CHUNK + EXT; tx++) {
            if (!st.inBounds(tx, ty)) continue;
            const i = st.idx(tx, ty);
            if (st.type[i] !== v5) continue;
            const fx = st.frameX[i], fy = st.frameY[i];
            const def = TILE_DEFS[st.type[i]];
            const sheet = def?.vanilla?.sheet ?? 5;
            const trees = { treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
              worldSurface: this.world.groundLevel, worldW: this.world.w };
            if (sheet === 323) {
              const isCrown = fx >= 88 && fx <= 132;
              if (isCrown) continue; // 棕榈冠 → WindSway overlay
              // 棕榈干身（倾斜跨列，必须外扩遍）
              drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
                tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, false, trees);
            } else {
              // 蘑菇树：顶格标记帧原版不摆动，保留烘焙（DrawTrees switch 无 case 72）
              drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
                tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, true, trees);
            }
          }
        }
      }
    }
    // restore/return 在外层 bakeChunkInto(异常安全 try/finally)
  }
}

