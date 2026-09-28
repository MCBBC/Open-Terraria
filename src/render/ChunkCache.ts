// chunk 静态缓存：每 chunk 16×16 tile 预渲染到离屏 canvas（墙层+tile 层）
// ★C4（2026-09-28）：烘焙内核（bakeChunkInto/bakeChunkBody）抽出至 ChunkBake.ts
// （主线程/worker 同源）；本类保留账本（页池/粘滞槽/GL 脏账/LRU/晚到表链）与
// wbake=1 的 worker 分派面（flushDirty/get 支路 + completeWorkerBake 落页）。
import { CHUNK, TILE } from '../core/constants';
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';
import { hash2 } from '../core/rng';
import { invalidateVanillaFrameAt, invalidateVanillaFrameArea } from './VanillaFraming';
// 树油漆 style 派生已迁 VanillaTiler（2026-08-25：WindSway 同源消费防环）——re-export 保既有引用面
export { treeGroundVariant, treeTrunkPaintStyle, palmTreePaintStyle } from './VanillaTiler';
import { tileAnim, isDynamicAnimSheet } from './TileAnim';
import { tileFrameCapture } from '../debug/TileFrameCapture';
import { VanillaWallTiler } from './VanillaWallTiler';
import type { TileSheetEntry } from '../assets/TileSheetGen';
import type { AutoTiler } from './AutoTiler';
import type { World } from '../world/World';
import { bakeChunkIntoEnv, type ChunkBakeEnv } from './ChunkBake';
import type { BakeClient } from '../workers/BakeClient';

/** ★C3：世界外 chunk 的共享空格集（animCellsOf 缓存值;只读消费） */
const EMPTY_ANIM_CELLS = new Int32Array(0);

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
  /** ★C4（2026-09-28;?wbake=1 灰度,缺省关）：烘焙 worker 客户端（Game 装配）。
   *  非 null 时 flushDirty/get 的烘焙分派改走 worker（主线程烘焙 self→~0）；
   *  worker 不可用/失败时客户端自锁死（dead latch）并把在飞请求重新入脏队，
   *  本类随即将 bakeClient 置 null 回主线程全链（双路径纪律:旗关/降级=现状逐位）。 */
  bakeClient: import('../workers/BakeClient').BakeClient | null = null;

  /** ★wbake=1 入场覆盖门账（2026-09-28 世界入场空白修复刃）：worker 占位对
   *  （首烘/重建中,页区=透明）的 chunk key 集。get() wbake 支路建占位入账;
   *  completeWorkerBake 真对落页/主线程重建（降级）/LRU 淘汰/dispose 出账。
   *  viewportCovered() 消费（Game.whenViewportBaked 幕布覆盖门）——旗关恒空=
   *  查询恒 true（幕布语义零变化）。 */
  readonly workerAwaiting = new Set<number>();

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
  /** ★P0 回退路径去毒（2026-09-25）：旧 ★B1 设计「bgl 激活⇒页画布 WRF（CPU/SHM
   *  背板,反降 IOSurface 张数）」已废除——页画布背板耦合在旗上=「为 happy path
   *  优化毒杀回退路径」,违背分级回退承诺（用户实机 trace 定谳:GL 世界路径未
   *  介入的会话里,drawChunkGrid 逐块 blit SHM 页单 op 5.4µs→36-66µs（7-12×）,
   *  渲染帧 5.1→26.7ms=20fps）。修=页画布恒 GPU 后备（WRF=false;页画布无
   *  getImageData 读回面——消费方仅 bakeChunkInto 写入/drawChunkGrid 读绘/
   *  worldPageTex texFromImage+texSubUpdate 上传,全不需要 WRF）,IOSurface 张数
   *  回升（+12~24）显式备案:回退速度 > 张数优化。旗耦合删除点=Renderer 构造期
   *  与 bglSetForTest 两处。 */
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
  // ★★按层分账（bgl-tile-starve 定谳 2026-09-24）:一次 bakeChunkInto 同时
  //  写墙/tile 两张页画布(同 cell)——脏账必须【双层同记】;消费方(墙段/tile 段
  //  各自的 worldPageTex)只许消费并清除【本层】账。曾用单账 Map<页号,…> 共享:
  //  墙段先跑先删 → tile 段永远读到空账 = tpg 纹理永缺「页驻留后增量烘焙」格
  //  （实测定谳:全会话 sub wpg:*=47 条而 sub tpg:*=0 条;44/123 槽画布 α>0 纹理
  //  α=0）= 用户实报 ?bgl=1 物块整片透明洞(墙/背景正常)根因。
  //  【页纹理生命周期不变式】
  //  I1 记账完备:bakeChunkInto(cell≥0) 恰好一次双记 W+T;消费即清账(不清=每帧
  //     重传,清他层=对层饥饿),两不变式互为存在前提。
  //  I2 全量合法:state① 全量上传「上传时刻」的整张画布并清【本层】账——账中
  //     既有 slot 必已在画布上;此后该页任何格再烘焙必走 state② 增量补传。
  //  I3 三态推进:①新页(idx≥层内计数) drop+全量;②驻留 只 texSubUpdate 本层账
  //     中 slot;③尾裁 计数回落+尾键 drop+双层账同清(idx 复用防陈旧增量)。
  //  I4 纹理蒸发自愈:GL 层 dispose/键驱逐后 state① 的 texFromImage 键未命中
  //     会以画布现态全量重建——账只是增量化优化,画布才是唯一真值。
  readonly glDirtyPagesW = new Map<number, Set<number>>();
  readonly glDirtyPagesT = new Map<number, Set<number>>();
  private glMarkPageDirty(cell: number): void {
    const pg = Math.floor(cell / ChunkCache.CELLS_PER_PAGE);
    const slot = cell % ChunkCache.CELLS_PER_PAGE;
    for (const m of [this.glDirtyPagesW, this.glDirtyPagesT]) {
      let s = m.get(pg);
      if (!s) { s = new Set(); m.set(pg, s); }
      s.add(slot);
    }
  }
  /** ★B1 消费方访问器(层分账):取指定层指定页的脏 slot 集(undefined=无脏) */
  glDirtySlots(layer: 'wall' | 'tile', idx: number): Set<number> | undefined {
    return (layer === 'wall' ? this.glDirtyPagesW : this.glDirtyPagesT).get(idx);
  }
  /** ★B1 消费方访问器(层分账):清指定层指定页的脏账(消费即清;只许清本层) */
  glDirtyClear(layer: 'wall' | 'tile', idx: number): void {
    (layer === 'wall' ? this.glDirtyPagesW : this.glDirtyPagesT).delete(idx);
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
      this.glDirtyPagesW.delete(idx);   // ★B1:页销毁双层同清脏标（idx 复用防陈旧增量）
      this.glDirtyPagesT.delete(idx);
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
        // ★P0 去毒:仅 CPU 软渲染门（真 CPU 态整链本来就在软件光栅,WRF 无害且省张）;
        //  GL/2D 回退态页画布恒 GPU 后备（SHM 页=回退路径 7-12× 慢 op,见类内注）
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
    this.stickyCell.clear();
    this.glDirtyPagesW.clear();   // ★B1:页纹理账随世界整弃（双层）
    this.glDirtyPagesT.clear();
    this.chunks.clear();
    this.dirtyQueue.length = 0;
    this.dirtySet.clear();
    this.workerAwaiting.clear();
    this.animChunksBySheet.clear();
    this.animChunksByWall.clear();
    if (this.bakeArriveTimer) { clearTimeout(this.bakeArriveTimer); this.bakeArriveTimer = 0; }
    if (this.sheetReplacedTimer) { clearTimeout(this.sheetReplacedTimer); this.sheetReplacedTimer = 0; }
    this.chunkSheets.clear();
    this.arriveFiles.clear();
    this.chunkConsumed.clear();
    this.replacedFiles.clear();
    if (this.atlasRef?.bakeTracker) this.atlasRef.bakeTracker = null; // 解绑,防跨世界回调
    this.bakeClient?.dispose();   // ★C4:worker 链随缓存拆除（dispose 幂等;GPU 恢复路径 5885 同域防泄漏,C9 同款纪律）
    this.bakeClient = null;
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
    // ★C4:晚到的表先补送 worker（wbake 路径）——烘焙缺表 chunk 在 ship 落地后
    // 由 awaiting 链重派;下方 markDirty 链（chunkSheets 反查）对两路同域兜底
    this.bakeClient?.noteFileArrived(file);
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
    // ★C4:在飞 worker 请求标 bump——标脏晚于快照派发时,回包应用后立即重派
    // （快照=派发时刻切片,其后编辑若不重派=陈旧像素钉死;主线程路径 markDirty→
    // flushDirty 天然带 1 帧滞后,worker 路径经 bump 重派等价）
    this.bakeClient?.bump(k);
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

  /** ★C4:worker 降级/单请求失败时把 chunk 重新入脏队（主线程路径接手）。
   *  仅当该 chunk 确实待重建（无真对）才入队——占位对情形 get() 已在飞。 */
  requeueWorkerBake(cx: number, cy: number): void {
    const k = ChunkCache.key(cx, cy);
    if (this.chunks.get(k) !== undefined) return;
    if (!this.world.store.inBounds(cx * CHUNK, cy * CHUNK)) return;
    this.enqueueDirty(k);
  }

  /** ★视口优先调度判定（2026-09-28 世界入场空白修复刃）：chunk 与 animView 视域
   *  （相机视野+2 chunk 外延带,Game.fixedUpdate 每 tick 写入,Renderer 动画重烘
   *  同源消费）相交 = 高优烘焙。animView 未置（null）= 保守低优（不抢快车道,
   *  也不阻塞已有高优）。 */
  inViewport(cx: number, cy: number): boolean {
    const v = this.animView;
    if (!v) return false;
    const s = CHUNK * TILE;
    const x = cx * s, y = cy * s;
    return x + s > v.x0 && x < v.x1 && y + s > v.y0 && y < v.y1;
  }

  /** ★入场幕布覆盖门查询（2026-09-28）：可视视口内是否还有 worker 占位 chunk
   *  （透明页区）。false = 幕布不可掀（Game.whenViewportBaked 消费）。
   *  旗关/降级（workerAwaiting 恒空）/视域未置恒 true = 幕布语义零变化。 */
  viewportCovered(): boolean {
    const v = this.animView;
    if (!v || this.workerAwaiting.size === 0) return true;
    const s = CHUNK * TILE;
    for (const k of this.workerAwaiting) {
      const x = (k & 0xffff) * s, y = ((k >> 16) & 0xffff) * s;
      if (x + s > v.x0 && x < v.x1 && y + s > v.y0 && y < v.y1) return false;
    }
    return true;
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
      this.bakeClient?.bump(k);   // ★C4:同 markDirty——在飞请求回包后重派
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
    // ★C4 wbake 支路（?wbake=1 才有 bakeClient）:脏 chunk 出队后不调 get() 主线程
    // 烘焙,改发 worker 快照请求（快照构建 = typed array 切片,~0.1ms/块）。吞吐按
    // 快照预算放宽（DISPATCH=12:进世界「终态保险全量标脏」级联 384 块 ≈32 帧排空,
    // 烘焙本体在 worker 并行——主线程 self 只剩切片+回包落页 drawImage）。
    if (this.bakeClient) {
      const DISPATCH = 12;
      while (this.dirtyQueue.length && n < DISPATCH) {
        const k = this.dirtyQueue.shift()!;
        this.dirtySet.delete(k);
        const cx = k & 0xffff, cy = (k >> 16) & 0xffff;
        if (this.chunks.get(k) !== undefined) continue; // 占位对已由 get() 建立且请求已在飞
        if (!this.world.store.inBounds(cx * CHUNK, cy * CHUNK)
          && !this.world.store.inBounds(cx * CHUNK + CHUNK - 1, cy * CHUNK + CHUNK - 1)) {
          continue; // 世界外/已淘汰的悬空 key:静默出队(防永久滞留)
        }
        this.bakeClient.request(cx, cy, this);
        n++;
        if (performance.now() - t0 > budgetMs) break; // 快照切片超预算也至少完成 1 个
      }
      this.lastFlushMs = performance.now() - t0;
      this.lastFlushCount = n;
      return;
    }
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

  /** 取 chunk 双层画布（惰性生成，LRU 淘汰最久未用）。
   *  ★C4 wbake 支路：未生成/待重建时不做主线程同步烘焙——改发 worker 请求并返回
   *  「占位对」（cell 取自粘滞槽位:待重建=旧像素原位显示到回包覆写,首烘=空白透明,
   *  背后墙层/生物群系背景透出=与逐块渐进装载同观感,无黑块）。回包由
   *  completeWorkerBake 原位落页换真对。 */
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
    if (this.bakeClient) {
      this.bakeClient.request(cx, cy, this, true);   // 内部按 key 去重;可视支路=高优（视口优先调度）
      this.workerAwaiting.add(k);                    // 占位账:回包/主线程重建/淘汰出账
      const cell = this.acquireCell(k);        // 粘滞槽位:重建=旧像素,首烘=空白页区
      const page = Math.floor(cell / ChunkCache.CELLS_PER_PAGE);
      const slot = cell % ChunkCache.CELLS_PER_PAGE;
      const S = CHUNK * TILE;
      const pair: ChunkPair = {
        wall: this.wallPages[page], tile: this.tilePages[page],
        sx: (slot % ChunkCache.PAGE_COLS) * S, sy: Math.floor(slot / ChunkCache.PAGE_COLS) * S,
        cell,
      };
      this.chunks.set(k, pair);
      this.trimLru();
      return pair;
    }
    c = this.renderChunk(cx, cy);
    this.workerAwaiting.delete(k);   // 降级回主线程:重建即出账（覆盖门不被死 key 拖住）
    this.chunks.set(k, c);
    this.trimLru();
    return c;
  }

  /** LRU 上限裁剪（get/completeWorkerBake 共用;★槽位粘滞：淘汰=连粘滞登记一起
   *  注销再还池（不变量：还池的 cell 必无主人）） */
  private trimLru(): void {
    while (this.chunks.size > ChunkCache.MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.stickyCell.delete(oldest);
      this.releasePair(this.chunks.get(oldest)); // 淘汰画布同样释放,防 detached 积压
      this.chunkSheets.delete(oldest);
      this.chunkConsumed.delete(oldest);
      this.workerAwaiting.delete(oldest);   // ★入场覆盖门:淘汰=出账（重访重建,防死 key 阻门）
      this.chunks.delete(oldest);
    }
  }

  /** ★C4:worker 回包落页（wbake=1 主线程消费面）。把 256² ImageBitmap 双层（+可选
   *  荧光层）画进粘滞 cell 对应的页矩形,装配真对并接上既有账本：
   *  glMarkPageDirty（GL 页纹理增量上传）+ chunkSheets/chunkConsumed 登记
   *  （晚到表/表替换精确重烘链与主线程路径同源——missing/consumed 由 worker
   *  端 atlas 适配层逐请求收集上报）。画布才是唯一真值（页纹理生命周期 I4）:
   *  本方法只写页画布,GL 段按既有 glDirtySlots 消费,零改动。 */
  completeWorkerBake(cx: number, cy: number, wallBmp: ImageBitmap, tileBmp: ImageBitmap,
    glowBmp: ImageBitmap | null, missing: string[], consumed: string[]): void {
    if (!this.wallPages.length) return;   // dispose 后迟到的回包:页池已空,静默弃
    const k = ChunkCache.key(cx, cy);
    const cell = this.acquireCell(k);
    const page = Math.floor(cell / ChunkCache.CELLS_PER_PAGE);
    const slot = cell % ChunkCache.CELLS_PER_PAGE;
    const S = CHUNK * TILE;
    const ox = (slot % ChunkCache.PAGE_COLS) * S;
    const oy = Math.floor(slot / ChunkCache.PAGE_COLS) * S;
    const wallPage = this.wallPages[page], tilePage = this.tilePages[page];
    const wctx = wallPage.getContext('2d')!;
    const tctx = tilePage.getContext('2d')!;
    wctx.clearRect(ox, oy, S, S);
    wctx.drawImage(wallBmp, ox, oy);
    tctx.clearRect(ox, oy, S, S);
    tctx.drawImage(tileBmp, ox, oy);
    let glow: HTMLCanvasElement | undefined;
    if (glowBmp) {
      const g = document.createElement('canvas');
      g.width = S; g.height = S;
      g.getContext('2d')!.drawImage(glowBmp, 0, 0);
      glow = g;
    }
    const pair: ChunkPair = { wall: wallPage, tile: tilePage, sx: ox, sy: oy, cell, glow };
    this.chunks.set(k, pair);
    this.workerAwaiting.delete(k);   // 真对落页=出账
    // 晚到表链登记:missing=该 chunk 烘焙时 worker 缺的表(=烤了空位,表到位后由
    // onBakeAssetArrived 精确重烘);consumed=消费过的表(表替换热补丁链同源)
    if (missing.length) this.chunkSheets.set(k, new Set(missing));
    else this.chunkSheets.delete(k);
    if (consumed.length) this.chunkConsumed.set(k, new Set(consumed));
    else this.chunkConsumed.delete(k);
    if (cell >= 0) this.glMarkPageDirty(cell);
    this.trimLru();
  }

  /** 烘焙环境装配（内核 ChunkBakeEnv;每烘一次装配一次——字段全为直读引用,零拷贝） */
  private bakeEnv(): ChunkBakeEnv {
    return {
      st: this.world.store,
      treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
      groundLevel: this.world.groundLevel, rockLevel: this.world.rockLevel,
      chests: this.world.chests,
      sheets: this.sheets,
      autotiler: this.autotiler,
      wallTiler: this.wallTiler,
      truncatesWalls: this.truncatesWalls,
    };
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
   *  独立画布走同一函数、同一 clip 语义 → 像素一致由构造保证,无第二份烘焙代码。
   *  ★C4：绘制本体已抽至 ChunkBake.bakeChunkIntoEnv（主线程/worker 同源内核）,
   *  本方法只做 pair 装配 + GL 页脏账。 */
  bakeChunkInto(cx: number, cy: number, wallPage: HTMLCanvasElement, tilePage: HTMLCanvasElement, cell: number): ChunkPair {
    const out = bakeChunkIntoEnv(this.bakeEnv(), cx, cy, wallPage, tilePage, cell);
    const S = CHUNK * TILE;
    const slot = cell >= 0 ? cell % ChunkCache.CELLS_PER_PAGE : 0;
    const ox = (slot % ChunkCache.PAGE_COLS) * S;
    const oy = Math.floor(slot / ChunkCache.PAGE_COLS) * S;
    const pair: ChunkPair = { wall: wallPage, tile: tilePage, sx: ox, sy: oy, cell,
      glow: (out.glow as HTMLCanvasElement | null) ?? undefined };
    if (cell >= 0) this.glMarkPageDirty(cell);   // ★B1:GL 页纹理增量上传账（外部独立目标 cell<0 不入账）
    return pair;
  }
}

