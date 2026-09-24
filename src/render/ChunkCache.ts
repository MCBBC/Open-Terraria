// chunk 静态缓存：每 chunk 16×16 tile 预渲染到离屏 canvas（墙层+tile 层）
import { CHUNK, TILE } from '../core/constants';
import { T, TILE_DEFS, WALL_DEFS, TILE_BY_KEY } from '../data/tiles';
import { hash2 } from '../core/rng';
import { drawVanillaCell, drawTreeCell, drawCactusCell, tileDrawYOffsetOf, chestLidPoseAt, chestPoseSheet } from './VanillaTiler';
import { invalidateVanillaFrameAt, invalidateVanillaFrameArea } from './VanillaFraming';
import { treeTrunkPaintStyle, palmTreePaintStyle } from './VanillaTiler';
// 树油漆 style 派生已迁 VanillaTiler（2026-08-25：WindSway 同源消费防环）——re-export 保既有引用面
export { treeGroundVariant, treeTrunkPaintStyle, palmTreePaintStyle } from './VanillaTiler';
import { frameMergesWith } from './TileMergeFamily';
import { swayBakeSkip, tintedSwayCellForGlow } from './WindSway';
import { tileAnim, isDynamicAnimSheet } from './TileAnim';
import { tileFrameCapture } from '../debug/TileFrameCapture';
import { cageAnimRate, cageFamilyOf } from './CritterCage';
import { VanillaWallTiler, wallAnimRate } from './VanillaWallTiler';
import { shade } from '../assets/Palette';
import { getTilePaintSettings, type LeafPaintSettings } from '../world/Paint';
import { tintRegion } from './TileTint';
import type { TileSheetEntry } from '../assets/TileSheetGen';
import type { AutoTiler } from './AutoTiler';
import { TileStore } from '../world/TileStore';
import type { World } from '../world/World';

/** ★C3：世界外 chunk 的共享空格集（animCellsOf 缓存值;只读消费） */
const EMPTY_ANIM_CELLS = new Int32Array(0);

// 我们的 tile → Maples RuleTile 规则名（有规则的走素材自动贴合，无规则回退程序化）
// Grass 走人工标注（'@grass'）：Tiles_2.png 是多 tile 混排图集，自动分类不可靠；
// 用 public/annotator.html 标注后写入 sprites/annotations.json。无标注时回退程序化。
const TILE_RULES: Record<number, string> = {
  // 泥土/石/草走原版 BlendRules；铁矿走原版表——均不再用 Maples 规则
  13: '工作台', 14: '熔炉', 15: '铁砧',
};

/** 树族冠/枝标记帧判定（SW-FX12 荧光叠层补画用）：drawTreeCell 冠块入口
 *  `fy >= 198 && fx >= 22`（普通/宝石/装饰/灰烬树）与棕榈冠 `fx ∈ [88,132]`——
 *  这些格烘焙层为空（foliageOnly=false 早退 / 第四遍 continue→WindSway 摆动层）。
 *  蘑菇树 72 顶格在第四遍烘焙，页上有内容，不在此表。 */
const TREE_FOLIAGE_SHEETS = new Set([5, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
function isTreeCrownFrame(sheet: number, fx: number, fy: number): boolean {
  if (sheet === 323) return fx >= 88 && fx <= 132;
  return TREE_FOLIAGE_SHEETS.has(sheet) && fy >= 198 && fx >= 22;
}

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
  /** ★B1 改公开（2026-09-24）:Renderer 世界层 GL 页纹理增量上传按 slot 推
   *  页内 256² 矩形坐标（slot%PAGE_COLS, ⌊slot/PAGE_COLS⌋） */
  static readonly PAGE_COLS = 4;
  /** ★B1（2026-09-24）:GL 页纹理驻留态下页画布走 willReadFrequently——GPU 驻留
   *  已由页纹理接管,页画布只作上传源,CPU 背板反降 IOSurface 张数（GPU 加速
   *  画布每张一个 IOSurface,内核级计费）。Renderer.bgl 激活时置 true（构造期
   *  与 setBglForTest 两处写）。★仅 bgl 灰度态生效,主线（bgl=0）页保持 GPU
   *  加速=烘焙栅格化路径零变化。 */
  static PAGE_WRF = false;
  private wallPages: HTMLCanvasElement[] = [];
  private tilePages: HTMLCanvasElement[] = [];
  /** 每页在用 cell 数(与 wallPages 同长;页全空可被 trimFreePages 回收——
   *  熔断软收缩路径的显存释放在 atlas 化后不能只还 cell 不放页,每页 2×4MB) */
  private pageUsed: number[] = [];
  /** 空闲 cell 栈(page*16+slot;栈顶复用 = 热页优先) */
  private cellFree: number[] = [];
  /**
   * ★槽位粘滞表（2026-08-30 动画邻域抖扭修复）：chunkKey → 已占用的 atlas 页内 cell。
   * 【根因】Chromium GPU 光栅化的缩放 drawImage 不严格守最近邻——同一 256² 位图
   * 放在共享大图不同偏移处放大绘制，输出会因【页邻域纹理渗色】而不同
   * （scripts/_atlas-sampling-semantics.mjs 实验：z1.25 差 4572px、z2 整数倍也差
   * 一圈边界 8128px）。动画件每 tick 触发整 chunk 重烘，若 allocCell 把 chunk 分到
   * 新 slot = 换了页邻居 = 渗色模式变化 = 静态块以动画频率"抖扭"（用户实报：
   * 锯木机最明显、特定缩放比才出现、最大放大消失——全部吻合）。
   * 【修法】chunk 生命周期内 cell 只分配一次：标脏不还池、重烘原位覆写。
   * 不变量：粘滞表中持有的 cell 绝不入 cellFree 池；所有回收入口（LRU 淘汰/
   * dispose/烘炸兜底）必须先删粘滞登记再归还。 */
  private stickyCell = new Map<number, number>();
  /** 取 cell：优先本 chunk 的粘滞槽位（不存在才新分配）。
   *  ★槽位亲和（2026-08-31 船区往返渗色案根治）：LRU 淘汰→重访若换槽，
   *  页邻域内容改变 ⇒ 非整数 zoom 的 upscale 边缘采样随邻域漂移 = 静态块
   *  "渲染层面扭曲"复发（_slot-churn-probe 实证：往返后同窗 15.9% 像素漂移、
   *  带状分布在 chunk 缝行）。修=chunkKey 哈希亲和：优先取回自己的历史槽位
   *  （空闲时），被占才退回空闲链——邻域趋于恒定。 */
  private acquireCell(k: number): number {
    let c = this.stickyCell.get(k);
    if (c === undefined || c < 0) {
      const total = this.wallPages.length * ChunkCache.CELLS_PER_PAGE;
      if (total > 0) {
        const pref = hash2(k, 0x9e3779b9, 0) % total;   // 单键散列：key 为 x、常数作 y
        const fi = this.cellFree.indexOf(pref);
        if (fi >= 0) {
          this.cellFree.splice(fi, 1);
          this.pageUsed[Math.floor(pref / ChunkCache.CELLS_PER_PAGE)]++;
          this.stickyCell.set(k, pref);
          return pref;
        }
      }
      c = this.allocCell();
      this.stickyCell.set(k, c);
    }
    return c;
  }
  /** 调试/F5:当前 atlas 页数(墙+tile 双层各一摞,画布张数 = 2×页数) */
  get pageCount(): number { return this.wallPages.length; }

  // ---- ★B1 页纹理脏标（2026-09-24）:chunk 页 GPU 驻留的增量上传账 ----
  // 烘焙落页后登记 (页号→页内 slot 集),Renderer.worldPageTex 消费:新页全量
  // texFromImage 上传时整组清账;已驻留页逐 slot 256² texSubUpdate(判例
  // GLSpriteLayer.texSubUpdate)。页生命周期:trimFreePages 尾裁同页清理;
  // dispose 全清;世界切换走 Renderer.dropSwPipe→dropWorldPipe 整弃（纹理
  // 随 GLSpriteLayer.texs 表蒸发,本表同步清）。
  readonly glDirtyPages = new Map<number, Set<number>>();
  private glMarkPageDirty(cell: number): void {
    const pg = Math.floor(cell / ChunkCache.CELLS_PER_PAGE);
    const slot = cell % ChunkCache.CELLS_PER_PAGE;
    let s = this.glDirtyPages.get(pg);
    if (!s) { s = new Set(); this.glDirtyPages.set(pg, s); }
    s.add(slot);
  }
  /** ★B1 页画布访问器（GL 页纹理上传源;只读面）。越界/不存在返 null */
  pageCanvas(layer: 'wall' | 'tile', idx: number): HTMLCanvasElement | null {
    const arr = layer === 'wall' ? this.wallPages : this.tilePages;
    return idx >= 0 && idx < arr.length ? arr[idx] : null;
  }

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
      const idx = this.wallPages.length - 1;
      this.glDirtyPages.delete(idx);   // ★B1:页销毁同页清脏标（idx 复用防陈旧增量）
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
        if (ChunkCache.CPU_RENDER || ChunkCache.PAGE_WRF) { c.getContext('2d', { willReadFrequently: true }); }
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
    this.stickyCell.clear();
    this.glDirtyPages.clear();   // ★B1:页纹理账随世界整弃
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
    // 原版 TileID.Sets.TruncatesWalls（54 玻璃 / 328 / 459 / 748）→ 内部 tile id。
    // ★曾写 'v_328_shadow_chest'/'v_459_'/'v_748_' 等不存在的 key → 映射 -1 被滤掉,
    //   全表只剩 glass 截断（2026-08-27 FTW V2 墙审查顺带修）
    this.truncatesWalls = ['glass', 'v_328_confetti_block', 'v_459_snowfall_block', 'v_748_aquarium_block']
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
    this._animIdx.delete(k);   // ★C3：动画格索引与烘焙图同域失效（先于惰性创建早退）
    if (!this.chunks.has(k)) return; // 未生成的 chunk 惰性创建
    // ★槽位粘滞：不再 releasePair——cell 保留在 stickyCell 中（页占用计数不回退），
    //   原位重烘覆写。这里补登记是防御性的（正常路径 renderChunk→acquireCell 已登
    //   记）；stub pair(cell<0) 不入表。
    const oldCell = (this.chunks.get(k) as ChunkPair | undefined)?.cell;
    if (typeof oldCell === 'number' && oldCell >= 0) this.stickyCell.set(k, oldCell);
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

  // ---- ★C3 动画格脏索引（2026-09-22）----
  // 动画格（isDynamicAnimSheet）原先每帧视口全格谓词扫（Renderer.drawAnimatedTileLayer,
  // ~1900 格/帧）。按 chunk 缓存格集：markDirty/invalidateAll 失效,绘制时惰性重建——
  // 重建读【实时】store 态,与烘焙态解耦（烘焙滞后 flushDirty ≤4 块/帧;bake 期登记会
  // 有数帧新鲜度分歧,故选惰性重建而非 bake 时登记）。失效域与烘焙图同域：不触发
  // 标脏的 store 变更（silent 路径契约违例）本就使烘焙图陈旧=既有破损窗,索引与其
  // 同相不引入新分歧（绘制侧仍逐格复检谓词,假阳过滤）。
  // ★墙动态层（drawAnimatedWallLayer）不索化：wallAnimRate 谓词还叠 wt.hasTexture
  // （懒到纹理随时翻转真,无 markDirty 域）——索引会永久漏晚到动画墙,须独立定谳另立。
  private _animIdx = new Map<number, Int32Array>();

  /** chunk 动画格集（行主序,元素=格内线性索引 li=ly*CHUNK+lx）。
   *  谓词与 drawAnimatedTileLayer 全扫逐字同式：flags && TILE_DEFS.vanilla &&
   *  isDynamicAnimSheet(van.sheet)。世界外 chunk=缓存空集。 */
  animCellsOf(cx: number, cy: number): Int32Array {
    const k = ChunkCache.key(cx, cy);
    const hit = this._animIdx.get(k);
    if (hit) return hit;
    const st = this.world.store;
    const bx = cx * CHUNK, by = cy * CHUNK;
    const lxMax = Math.min(CHUNK, this.world.w - bx);
    const lyMax = Math.min(CHUNK, this.world.h - by);
    let cells: Int32Array;
    if (lxMax <= 0 || lyMax <= 0) {
      cells = EMPTY_ANIM_CELLS;
    } else {
      const list: number[] = [];
      for (let ly = 0; ly < lyMax; ly++) {
        for (let lx = 0; lx < lxMax; lx++) {
          const i = st.idx(bx + lx, by + ly);
          if (!st.flags[i]) continue;
          const van = TILE_DEFS[st.type[i]]?.vanilla;
          if (!van || !isDynamicAnimSheet(van.sheet)) continue;
          list.push(ly * CHUNK + lx);
        }
      }
      cells = Int32Array.from(list);
    }
    this._animIdx.set(k, cells);
    return cells;
  }

  /** 区域标脏（tile 范围）：供树冠等大范围精灵清理使用 */
  markDirtyArea(x0: number, y0: number, x1: number, y1: number) {
    // silent 编辑路径(陨石/祭坛粉碎等 setTileSilent 直写)不触发 onTileChanged,
    // 原版全链帧缓存须在此一并区域失效(±1 协商边距由 invalidate 内部处理)
    invalidateVanillaFrameArea(x0, y0, x1, y1);
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        if (cx < 0 || cy < 0) continue;
        this.markDirty(cx, cy);
      }
    }
  }

  markDirtyAround(x: number, y: number) {
    invalidateVanillaFrameAt(x, y); // 原版全链帧缓存局部失效(协商旗受 ±1 格影响)
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
    this._animIdx.clear();   // ★C3：全量标脏同域清索引
    for (const k of this.chunks.keys()) {
      if (this.chunks.get(k) === undefined) continue; // 已是待重建哨兵
      // ★槽位粘滞：同 markDirty——补登记后不还池，原位重烘
      const oldCell = (this.chunks.get(k) as ChunkPair | undefined)?.cell;
      if (typeof oldCell === 'number' && oldCell >= 0) this.stickyCell.set(k, oldCell);
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
    // sheet 侧重烘循环已随「动画格不进烘焙」根治移除（animChunksBySheet 恒空，
    // 保留字段供回滚安全）；墙动画仍走 chunk 失效（未迁移）。
    // 墙侧重烘循环已随「动画墙不进烘焙」根治移除（animChunksByWall 恒空保留回滚位）。
    // 帧捕获快照节拍（cam=animView 中点=视野中心；无视野信息时跳过出图）
    if (tileFrameCapture.recording && this.animView) {
      const v = this.animView;
      tileFrameCapture.snapTick((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2);
    } else {
      tileFrameCapture.snapTick(-1, -1);
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
      // ★槽位粘滞：淘汰=连粘滞登记一起注销再还池（不变量：还池的 cell 必无主人）
      this.stickyCell.delete(oldest);
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
    // ★槽位粘滞：优先复用本 chunk 原槽位（见 stickyCell 注——页邻域渗色敏感性）
    const cell = this.acquireCell(this._bakingKey);
    try {
      const page = Math.floor(cell / ChunkCache.CELLS_PER_PAGE);
      return this.bakeChunkInto(cx, cy, this.wallPages[page], this.tilePages[page], cell);
    } catch (e) {
      // 烘焙异常：本次放弃粘滞占位，连同 cell 一起归还（防泄漏；正常路径不至此）
      this.stickyCell.delete(this._bakingKey);
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
    if (cell >= 0) this.glMarkPageDirty(cell);   // ★B1:GL 页纹理增量上传账（外部独立目标 cell<0 不入账）
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
            // ★SW-FX12（2026-09-10）：摆动族（草/藤/药草,swayBakeSkip 烘焙摘除）与
            //  树冠/树枝/棕榈冠标记格（drawTreeCell foliageOnly=false 早退 / 第四遍
            //  continue）页上无内容 → 上面直拷=空荧光。原版这些特殊绘制路径同样吃
            //  fullbright→White（TileDrawing.cs:6727-6740 GetLightOverride 经
            //  DrawAnimatedTile_AdjustForVisionChangers 对草族生效；DrawTrees :8290/
            //  :8345/:8455 冠枝 tile.fullbrightBlock()→color=White）→ 本地静态重画
            //  进叠层（风摆 ±2px 瞬态错位=烘焙层同口径等价边界）。动态动画格
            //  （isDynamicAnimSheet/378/272）帧随节拍变,静态拷贝会错帧 → 登记债不接。
            const tdef = TILE_DEFS[st2.type[i]];
            const v = tdef?.vanilla;
            if (this.autotiler?.atlas && v
              && (swayBakeSkip(st2.type[i], st2.frameX[i]) || isTreeCrownFrame(v.sheet, st2.frameX[i], st2.frameY[i]))) {
              const x = x0 + lx, y = y0 + ly;
              const trees = { treeX: this.world.treeX, treeStyle: this.world.treeStyle,
                treeTops: this.world.treeTops, worldSurface: this.world.groundLevel, worldW: this.world.w };
              if (isTreeCrownFrame(v.sheet, st2.frameX[i], st2.frameY[i])) {
                drawTreeCell(gctx, this.autotiler.atlas, st2, x, y, st2.frameX[i], st2.frameY[i],
                  px, py, v.sheet, true, trees, 0, undefined, st2.paint[i]);
              } else if (st2.paint[i] > 0
                && tintedSwayCellForGlow(this.autotiler.atlas, st2, x, y, st2.type[i],
                  st2.frameX[i], st2.frameY[i], st2.paint[i], trees)) {
                // ★SW-RB11e 2026-09-10：sway 族补画同样要吃 paint（涂漆∧荧光并置时
                // 叠层不得显原色）——tintedSwayCellForGlow = WindSway 摆动层染色
                // 单源（scratch 画格+tintRegion,特判组分派同烘焙油漆 pass）。
                gctx.drawImage(tintedSwayCellForGlow(this.autotiler.atlas, st2, x, y,
                  st2.type[i], st2.frameX[i], st2.frameY[i], st2.paint[i], trees)!,
                  px, py);
              } else {
                drawVanillaCell(gctx, this.autotiler.atlas, v.sheet, v.frame, v.fw ?? 1, v.fh ?? 1,
                  st2, x, y, st2.type[i],
                  (t) => t === st2.type[i] || frameMergesWith(st2.type[i], t),
                  px, py, st2.frameX[i], st2.frameY[i], trees);
              }
            }
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
            // ★2026-08-31 根治（墙版）：动画墙（DoUpdate_AnimateWalls 换带 +
            // 星彩玻璃逐格错相）不进烘焙，由 Renderer.drawAnimatedWallLayer 逐帧
            // 补画——同 tiles 侧判例（密度放大 ⇒ 重烘风暴）
            if (wallAnimRate(wallId) !== 0) continue;
            this.wallTiler.draw(wctx, st, x, y, wallId, this.truncatesWalls, px, py);
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

    // ---- 第 1.5 遍：chunk 底缝补绘（tileTop>0 跨 chunk 溢出带；2026-08-27 仙人掌
    //      专项 → 2026-08-28 推广到全部正 tileTop 族）----
    // tileTop>0 的 tile 内容画在 y*16+off..+16+off，底部 off px 越入下一格。chunk
    // 末行（y%16=15）的溢出带被本 chunk 画布 clip 裁掉，下一 chunk 首格又从 +off
    // 起画 → 两 chunk 之间 off px 无人绘制。单格件底 2px 常被下方地面覆盖不可见
    // （2026-08-27 备案），但**多行 framed 物体（3×2 大石堆 185/186/187）跨 chunk
    // 边界时（上行走上一 chunk 末行）内部行缝裸露**——缝带 = 上行被裁 2px + 下行
    // 顶部未覆盖 2px = 4px 天空横断（2026-08-28 用户实报腐化/洞穴石堆）。修 =
    // 沿用仙人掌 py=-TILE 整格重画法：凡上一行 tile 有效位移 >0，借 clip 只留
    // 溢出带，落位与原版逐像素一致；先于主遍 = 原版行序（上行先画、下行覆盖）。
    if (this.autotiler) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, y = y0 - 1;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        const type = st.type[i];
        if (type === 0 || !st.flags[i]) continue;
        const def = TILE_DEFS[type];
        if (!def?.vanilla) continue;
        // 回声涂层块不绘制（IsVisible 同款门，与主遍一致）
        if ((st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0 && !st.showInvisibleBlocks) continue;
        const actuated = (st.wire[i] & 32) !== 0;
        ctx.filter = actuated ? 'brightness(0.4)' : 'none';
        const sheet = def.vanilla.sheet;
        if (sheet === 80 && def.vanilla.frame === 'style') {
          drawCactusCell(ctx, this.autotiler.atlas, st, x, y, type, lx * TILE, -TILE);
          continue;
        }
        // 动态/覆盖绘制族不参与静态补绘（主遍/Renderer overlay 自管）
        if (sheet === 378) continue;
        if (isDynamicAnimSheet(sheet)) continue;   // 动画格统一动态层（含 215/207/314/笼/瀑布族）
        if (swayBakeSkip(type, st.frameX[i]) || cageFamilyOf(sheet)) continue;
        if (tileDrawYOffsetOf(sheet, st.frameX[i], st.frameY[i]) > 0) {
          drawVanillaCell(
            ctx, this.autotiler.atlas, sheet, def.vanilla.frame,
            def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
            st, x, y, type,
            (t) => t === type || frameMergesWith(type, t),
            lx * TILE, -TILE, st.frameX[i], st.frameY[i],
            undefined,
            // ★SW-BJ17 2026-09-07：宝箱开/关盖姿态随帧烘焙（上溢补绘条带同姿态防重影）
            // ★IIIII252：姿态消费面仅 21/467（chestPoseSheet 单源）——chestLidPoseAt
            //   是 O(chests) 全表线性查,逐格急切求值 = 长龄世界烘焙成本放大器。
            chestPoseSheet(sheet) ? chestLidPoseAt(this.world.chests, x, y, st.frameX[i], st.frameY[i]) : 0,
          );
        }
      }
      ctx.globalAlpha = 1;
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
        // 已致动(inActive):原版视觉=光照 RGB×0.4 暗化(TileDrawing.cs:4418-4421
        // GetFinalLight 走 tileCache.actColor,Tile.cs:274-283 num=0.4 三通道乘、
        // alpha 不变)——同纹理暗 40% 仍不透明,非半透明(曾 globalAlpha 0.3,
        // 亮背景会透出墙/天空,与原版不等价)。注:旧注释引用的「DrawInactiveSorter
        // Main.cs:2828」在 1457 反编译中不存在(调研 2026-09-07 全库零命中)。
        // filter 只作用于紧随的 drawImage 源,精确到本格。
        const actuated = (st.wire[i] & 32) !== 0;
        ctx.filter = actuated ? 'brightness(0.4)' : 'none';
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
        // 齿轮块（tile 272）：摘出静态烘焙，由 Renderer drawAnimatedTileLayer 逐帧动态
        // 绘制（dummy 378 同款先例）——rate10 的整块重烘风暴曾致船区掉帧主因
        // （海盗船体 329 块 ⇒ 覆盖 chunk 每 10t 全量重画 + 油漆 tintRegion 重刷）
        if (def.vanilla?.sheet === 272) continue;
        // 原版素材图块（TileDef.vanilla）：TEdit framing 查找表（auto）或显式 18px 帧（style）
        if (def.vanilla && this.autotiler) {
          // ★2026-08-31 根治：动画格一律不进烘焙（isDynamicAnimSheet 谓词 =
          //   TILE_ANIM_RATE 全表 ∪ 笼族 ∪ 314），由 Renderer.drawAnimatedTileLayer
          //   逐帧补画。机制=含动画格的 chunk 在 rate 节拍整块失效（256 格×完整
          //   管线），密度放大即"重烘风暴"（判例：272 齿轮船区 20% CPU、215 篝火
          //   rate4 潜在更凶）。动态层画在整屏世界坐标系无 chunk 边界裁剪，顺带
          //   消灭动画家具跨 chunk 的 2px 陈旧溢出行隐患。215/207 的相位预加
          //   （campfireYOffset/fountainYOffset）随格子移入动态层。
          if (isDynamicAnimSheet(def.vanilla.sheet)) continue;
          drawVanillaCell(
            ctx, this.autotiler.atlas, def.vanilla.sheet, def.vanilla.frame,
            def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
            st, x, y, type,
            // 同 id 融合 + 原版跨类型合并家族（TileMergeFamily:砖/沙/冰雪族互连,
            // 群系交界按已连接取帧——边缘帧圆角透明像素会透出远景背景亮光）
            (t) => t === type || frameMergesWith(type, t),
            px, py, st.frameX[i], st.frameY[i],
            { treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
              worldSurface: this.world.groundLevel, worldW: this.world.w,
              rockLevel: this.world.rockLevel },
            // ★SW-BJ17 2026-09-07：宝箱开/关盖姿态随帧烘焙（Chest.cs:3599 UpdateChestFrames
            //  驱动 frame → 本处重烘焙取姿态；帧变化时 Game 侧 markDirtyArea 触发重烘）
            // ★IIIII252：同上溢带注释——chestPoseSheet 门短路 O(chests) 急切求值。
            chestPoseSheet(def.vanilla.sheet) ? chestLidPoseAt(this.world.chests, x, y, st.frameX[i], st.frameY[i]) : 0,
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
    ctx.globalAlpha = 1; // alpha 复位(防影响后续 pass;致动暗化走 filter,已逐格显式复位)

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
            // ★幽灵保域（2026-09-03）：flags bit0（active）首门——幽灵残型（flags=0,
            // type≠0,x86 对齐行为）不进树干静态补绘（主遍 665 同款门）
            if (st.type[i] !== v5 || !st.flags[i]) continue;
            const fx = st.frameX[i], fy = st.frameY[i];
            const def = TILE_DEFS[st.type[i]];
            const sheet = def?.vanilla?.sheet ?? 5;
            const trees = { treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
              worldSurface: this.world.groundLevel, worldW: this.world.w };
            if (sheet === 323) {
              const isCrown = fx >= 88 && fx <= 132;
              if (isCrown) continue; // 棕榈冠 → WindSway overlay
              // 棕榈干身（倾斜跨列，必须外扩遍）
              // ★IIIII227：第四遍在油漆 pass 之后 → 棕榈干身须自带 paint（源染色）
              // ★SW-FX12：干身特判组（GetTileSettings(323,style)=棕榈四沙型档,
              //  TreePaintSystemData.cs:283-300;style=GetPalmTreeBiome 沙型+绿洲）
              const pi = st.idx(tx, ty);
              const pp = st.paint[pi];
              const trunkSpecial = pp >= 1 && pp <= 12
                ? getTilePaintSettings(323, palmTreePaintStyle(st, tx, ty, this.world.w)) ?? undefined
                : undefined;
              drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
                tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, false, trees,
                0, undefined, pp, trunkSpecial);
            } else {
              // 蘑菇树：顶格标记帧原版不摆动，保留烘焙（DrawTrees switch 无 case 72）
              drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
                tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, true, trees,
                0, undefined, st.paint[i]);   // ★IIIII227：同上（油漆 pass 后绘制）
            }
          }
        }
      }
    }
    // restore/return 在外层 bakeChunkInto(异常安全 try/finally)
  }
}

