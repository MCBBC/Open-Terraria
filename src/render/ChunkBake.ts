// ★C4 烘焙 Worker 化（2026-09-28）：chunk 烘焙内核抽出——主线程与 BakeWorker
// 【同一函数对象】执行（"同一套 bake 逻辑模块共享,主线程/worker 同源=内核逐式一致"）。
//
// 本模块把原 ChunkCache.bakeChunkInto/bakeChunkBody 的绘制主体整体迁出，状态面收敛
// 为 ChunkBakeEnv 注入：主线程由 ChunkCache.bakeEnv() 装配（真实 store/atlas/tiler），
// worker 由 BakeWorker 用快照 SliceStore + WorkerAtlas 装配——内核逐式零拷贝，两路
// 产物逐字节一致由 tests/wbake-*（协议锁）+ scripts/_wbake-digest.mjs（真机 md5）把门。
//
// 画布触点纪律：worker 上下文无 document——本模块内画布创建一律走 render/canvasEnv
// 工厂（主线程=HTMLCanvasElement 行为逐位不变；worker=OffscreenCanvas）。
//
// ★bakenoread 读回消除刀（2026-10-08）：x-ray 对拍 Trace-20261008T175748↔T212134 定谳
// 烘焙链逐格读回 7.3ms/s、op 1806/烘、主头=bakeChunkInto——用途定谳=油漆 pass（本文件
// bakeChunkBody 末段）经 TileTint.tintRegion 对 GPU 后备烘焙目标页逐漆格 16² 读回（烘焙
// 调用树内其余 getImageData 全在 WRF CPU scratch 侧,非本刀对象）。修法=env.noRead 旗
// （★已转正缺省开,?bakenoread=0 逃生门）切换「每漆层 1 次整 cell 快照 + CPU 行拷贝
// tint」支路;快照=同一份 GPU 光栅产物 → 产物逐位结构性等价（单位烘焙工作读回税
// −60%,Windows 实机）。证据链：scripts/_bake-noread-digest.mjs（双臂 md5+读回计数）、
// scripts/_paint-bake-truth.mjs（重跑=真值逐像素）、tests/tint-data-shared-truth.test.ts
// （tint 循环单源锚定）。
import { CHUNK, TILE } from '../core/constants';
import { T, TILE_DEFS, TILE_BY_KEY, WALL_DEFS } from '../data/tiles';
import { drawVanillaCell, drawTreeCell, drawCactusCell, tileDrawYOffsetOf, chestLidPoseAt, chestPoseSheet,
  treeTrunkPaintStyle, palmTreePaintStyle } from './VanillaTiler';
import { frameMergesWith } from './TileMergeFamily';
import { swayBakeSkip, tintedSwayCellForGlow } from './WindSway';
import { isDynamicAnimSheet } from './TileAnim';
import { cageFamilyOf } from './CritterCage';
import { VanillaWallTiler, wallAnimRate } from './VanillaWallTiler';
import { shade } from '../assets/Palette';
import { getTilePaintSettings } from '../world/Paint';
import { tintRegion, tintRegionData } from './TileTint';
import { TileStore } from '../world/TileStore';
import { mkCanvas, type AnyCanvas, type Ctx2D } from './canvasEnv';

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

/** worker 侧/主线程共用的 sheet 条目视图（TileSheetEntry 结构兼容：canvas 收窄为
 *  可作 drawImage 源的位图形态——worker 侧为随包 ImageBitmap，主线程为过程画布） */
export interface SheetEntryLike {
  canvas: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  kind: 'blend' | 'single' | 'object';
  w?: number; h?: number;
}

/** 烘焙环境（原 ChunkCache this.state 面）：主线程/worker 各自装配，内核只读此面。
 *  ★st 契约（烘焙调用树全读面,亲读核定）：idx/inBounds/type/flags/frameX/frameY/
 *  wall/liquid/half/slope/wire/paint/paintWall/coat/showInvisibleBlocks/isSolid/
 *  isActive + 真实维度 w/h（棕榈绿洲门 st.w-380 / 深扫描 ty>=st.h）。主线程=真实
 *  TileStore；worker=BakeSliceStore（结构子集,运行时经 as 跨越——子集完备性由
 *  tests/wbake-protocol 的成员枚举锁把门）。 */
export interface ChunkBakeEnv {
  st: TileStore;
  treeX: number[];
  treeStyle: number[];
  treeTops: number[];
  groundLevel: number;
  /** 原版 rockLevel（vanillaFrameFor 链的 rock 带判定；ChunkCache 原第二遍消费） */
  rockLevel: number;
  chests: Array<{ x: number; y: number; frame?: number }> | undefined;
  sheets: Map<number, SheetEntryLike>;
  autotiler: { atlas: import('../assets/SpriteAtlas').SpriteAtlas; saplingSprite(x: number, y: number): import('../assets/SpriteAtlas').DrawRect | null; weedSprite(x: number, y: number): import('../assets/SpriteAtlas').DrawRect | null; tile(ruleName: string, st: TileStore, x: number, y: number, tileType: number, layer?: 'tile' | 'wall'): import('../assets/SpriteAtlas').DrawRect | null } | null;
  wallTiler: VanillaWallTiler | null;
  truncatesWalls: number[];
  /** ★bakenoread 灰度（2026-10-08;?bakenoread=1,缺省关=现状逐位）：油漆 pass 禁止
   *  逐格 getImageData 读烘焙目标页（Windows GPU 驱动逐 op 读回管线同步放大,
   *  trace Trace-202608T175748 定谳 31ms/s 主头=bakeChunkInto）——改走「每漆层至多
   *  1 次整 cell 快照 + CPU 侧逐格行拷贝」支路（TileTint.tintRegionData）。快照=
   *  同一时刻同一份 GPU 光栅产物的一次性读回 → tint 源字节与旧逐格读回逐位同源,
   *  产物逐位结构性等价（非 CPU/GPU 光栅后端对拍假设）。主线程=ChunkCache.BAKE_NOREAD,
   *  worker=init 消息 noRead 下发（BakeClient→BakeProtocol→BakeWorker）。 */
  noRead?: boolean;
}

/** 邻居掩码（原 ChunkCache.neighborMask——blend 表用,位序 N E S W NE SE SW NW） */
function neighborMask(st: ChunkBakeEnv['st'], x: number, y: number, type: number): number {
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

export interface BakeOutcome {
  /** 荧光涂层叠层（256²;null=本 chunk 无荧光涂层格）。主线程=HTMLCanvasElement,
   *  worker=OffscreenCanvas(transferToImageBitmap 消费)。 */
  glow: AnyCanvas | null;
}

export const CHUNK_BAKE_CELLS_PER_PAGE = 16;
export const CHUNK_BAKE_PAGE_COLS = 4;

/** 把 chunk 烘焙进目标页的 cell（原 ChunkCache.bakeChunkInto 全体;cell 语义不变：
 *  ≥0 = atlas 页内槽位, <0 = 外部独立 256² 目标 ox=oy=0）。返回荧光叠层（如有）。 */
export function bakeChunkIntoEnv(env: ChunkBakeEnv, cx: number, cy: number,
  wallPage: AnyCanvas, tilePage: AnyCanvas, cell: number): BakeOutcome {
  // 双层：墙层 / tile 层分离 —— 水渲染在两层之间（墙之上、图块之下）
  // ★cell 裁剪+平移:与旧"独立 256² 画布"完全同语义——墙 EXT=1/树 EXT=6 的
  //   负坐标/越界外溢绘制被 clip 挡在 cell 内,绝不漏进相邻 cell;
  //   重烘焙前 clearRect 洗掉旧内容(旧版靠新画布天然透明)
  const S = CHUNK * TILE;
  const slot = cell >= 0 ? cell % CHUNK_BAKE_CELLS_PER_PAGE : 0;
  const ox = (slot % CHUNK_BAKE_PAGE_COLS) * S;
  const oy = Math.floor(slot / CHUNK_BAKE_PAGE_COLS) * S;
  const wctx = wallPage.getContext('2d') as Ctx2D;
  const tctx = tilePage.getContext('2d') as Ctx2D;
  if (!wctx || !tctx) return { glow: null };
  for (const c of [wctx, tctx]) {
    c.save();
    c.beginPath(); c.rect(ox, oy, S, S); c.clip();
    c.translate(ox, oy);
    c.clearRect(0, 0, S, S);
    c.imageSmoothingEnabled = false;
  }
  const ctx: Ctx2D = tctx; // 前景层(下文 tile pass);墙层=wctx
  const wall = wallPage, tile = tilePage;
  // ★异常安全:save 后必须 restore——异常逃逸会让【共享页】上下文残留 clip+
  // translate,下次烘焙错位到 2×偏移(独立画布时代异常自含,页化后必须显式复位)
  let glow: AnyCanvas | null = null;
  try {
    bakeChunkBody(env, cx, cy, wctx, ctx, wall, tile, ox, oy);
  } finally {
    wctx.restore();
    ctx.restore();
  }
  // ---- 荧光涂层叠层烘焙（fullbrightBlock/Wall 位格 16×16 拷贝；无涂层格零开销）----
  //  墙区先拷、tile 区后拷 = 同格内墙下 tile 上的世界层序（跨格序与原版逐格
  //  绘制一致：涂层格各自独立 16×16）。多格物件只有被涂格区域进叠层 = 与油漆
  //  逐格着色的等价边界同口径（见下方油漆 pass 登记注）。
  const st2 = env.st;
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const FB = TileStore.COAT_FULLBRIGHT_BLOCK | TileStore.COAT_FULLBRIGHT_WALL;
  let hasGlow = false;
  for (let ly = 0; ly < CHUNK && !hasGlow; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      if (st2.coat[st2.idx(x0 + lx, y0 + ly)] & FB) { hasGlow = true; break; }
    }
  }
  if (hasGlow) {
    const glowC = mkCanvas(S, S);
    if (glowC) {
      const gctx = glowC.getContext('2d') as Ctx2D;
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
            if (env.autotiler && v
              && (swayBakeSkip(st2.type[i], st2.frameX[i]) || isTreeCrownFrame(v.sheet, st2.frameX[i], st2.frameY[i]))) {
              const x = x0 + lx, y = y0 + ly;
              const trees = { treeX: env.treeX, treeStyle: env.treeStyle,
                treeTops: env.treeTops, worldSurface: env.groundLevel, worldW: st2.w };
              if (isTreeCrownFrame(v.sheet, st2.frameX[i], st2.frameY[i])) {
                drawTreeCell(gctx, env.autotiler.atlas, st2, x, y, st2.frameX[i], st2.frameY[i],
                  px, py, v.sheet, true, trees, 0, undefined, st2.paint[i]);
              } else if (st2.paint[i] > 0
                && tintedSwayCellForGlow(env.autotiler.atlas, st2, x, y, st2.type[i],
                  st2.frameX[i], st2.frameY[i], st2.paint[i], trees)) {
                // ★SW-RB11e 2026-09-10：sway 族补画同样要吃 paint（涂漆∧荧光并置时
                //  叠层不得显原色）——tintedSwayCellForGlow = WindSway 摆动层染色
                //  单源（scratch 画格+tintRegion,特判组分派同烘焙油漆 pass）。
                gctx.drawImage(tintedSwayCellForGlow(env.autotiler.atlas, st2, x, y,
                  st2.type[i], st2.frameX[i], st2.frameY[i], st2.paint[i], trees)!,
                  px, py);
              } else {
                drawVanillaCell(gctx, env.autotiler.atlas, v.sheet, v.frame, v.fw ?? 1, v.fh ?? 1,
                  st2, x, y, st2.type[i],
                  (t) => t === st2.type[i] || frameMergesWith(st2.type[i], t),
                  px, py, st2.frameX[i], st2.frameY[i], trees);
              }
            }
          }
        }
      }
      glow = glowC;
    }
  }
  return { glow };
}

/** bakeChunkIntoEnv 的绘制主体（原 ChunkCache.bakeChunkBody;坐标全为 cell 内局部,
 *  translate 已由外层挂好）。★主线程/worker 同源内核——禁在此函数新增宿主状态读取,
 *  一切宿主面经 ChunkBakeEnv 注入。 */
function bakeChunkBody(env: ChunkBakeEnv, cx: number, cy: number, wctx: Ctx2D, ctx: Ctx2D,
  wall: AnyCanvas, tile: AnyCanvas, ox: number, oy: number): void {
  const st = env.st;
  const x0 = cx * CHUNK, y0 = cy * CHUNK;

  // ---- 第一遍：背景墙全部先画（避免后格的墙盖住跨格物体如宝箱/树冠）----
  // 原版墙 framing（VanillaWallTiler）：32×32 帧以格为中心外溢 8px →
  // 扫描范围外扩 1 格，跨 chunk 边界的帧由相邻 chunk 补齐（像素一致无副作用）
  if (env.wallTiler) {
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
        if (env.wallTiler.hasTexture(wallId)) {
          // ★2026-08-31 根治（墙版）：动画墙（DoUpdate_AnimateWalls 换带 +
          // 星彩玻璃逐格错相）不进烘焙，由 Renderer.drawAnimatedWallLayer 逐帧
          // 补画——同 tiles 侧判例（密度放大 ⇒ 重烘风暴）
          if (wallAnimRate(wallId) !== 0) continue;
          env.wallTiler.draw(wctx, st, x, y, wallId, env.truncatesWalls, px, py);
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
  if (env.autotiler) {
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
        drawCactusCell(ctx, env.autotiler.atlas, st, x, y, type, lx * TILE, -TILE);
        continue;
      }
      // 动态/覆盖绘制族不参与静态补绘（主遍/Renderer overlay 自管）
      if (sheet === 378) continue;
      if (isDynamicAnimSheet(sheet)) continue;   // 动画格统一动态层（含 215/207/314/笼/瀑布族）
      if (swayBakeSkip(type, st.frameX[i]) || cageFamilyOf(sheet)) continue;
      if (tileDrawYOffsetOf(sheet, st.frameX[i], st.frameY[i]) > 0) {
        drawVanillaCell(
          ctx, env.autotiler.atlas, sheet, def.vanilla.frame,
          def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
          st, x, y, type,
          (t) => t === type || frameMergesWith(type, t),
          lx * TILE, -TILE, st.frameX[i], st.frameY[i],
          undefined,
          // ★SW-BJ17 2026-09-07：宝箱开/关盖姿态随帧烘焙（上溢补绘条带同姿态防重影）
          // ★IIIII252：姿态消费面仅 21/467（chestPoseSheet 单源）——chestLidPoseAt
          //   是 O(chests) 全表线性查,逐格急切求值 = 长龄世界烘焙成本放大器。
          chestPoseSheet(sheet) ? chestLidPoseAt(env.chests, x, y, st.frameX[i], st.frameY[i]) : 0,
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
      if (def.vanilla && env.autotiler) {
        // ★2026-08-31 根治：动画格一律不进烘焙（isDynamicAnimSheet 谓词 =
        //   TILE_ANIM_RATE 全表 ∪ 笼族 ∪ 314），由 Renderer.drawAnimatedTileLayer
        //   逐帧补画。机制=含动画格的 chunk 在 rate 节拍整块失效（256 格×完整
        //   管线），密度放大即"重烘风暴"（判例：272 齿轮船区 20% CPU、215 篝火
        //   rate4 潜在更凶）。动态层画在整屏世界坐标系无 chunk 边界裁剪，顺带
        //   消灭动画家具跨 chunk 的 2px 陈旧溢出行隐患。215/207 的相位预加
        //   （campfireYOffset/fountainYOffset）随格子移入动态层。
        if (isDynamicAnimSheet(def.vanilla.sheet)) continue;
        drawVanillaCell(
          ctx, env.autotiler.atlas, def.vanilla.sheet, def.vanilla.frame,
          def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
          st, x, y, type,
          // 同 id 融合 + 原版跨类型合并家族（TileMergeFamily:砖/沙/冰雪族互连,
          // 群系交界按已连接取帧——边缘帧圆角透明像素会透出远景背景亮光）
          (t) => t === type || frameMergesWith(type, t),
          px, py, st.frameX[i], st.frameY[i],
          { treeX: env.treeX, treeStyle: env.treeStyle, treeTops: env.treeTops,
            worldSurface: env.groundLevel, worldW: st.w,
            rockLevel: env.rockLevel },
          // ★SW-BJ17 2026-09-07：宝箱开/关盖姿态随帧烘焙（Chest.cs:3599 UpdateChestFrames
          //  驱动 frame → 本处重烘焙取姿态；帧变化时 Game 侧 markDirtyArea 触发重烘）
          // ★IIIII252：同上溢带注释——chestPoseSheet 门短路 O(chests) 急切求值。
          chestPoseSheet(def.vanilla.sheet) ? chestLidPoseAt(env.chests, x, y, st.frameX[i], st.frameY[i]) : 0,
        );
        continue;
      }
      // 树苗：Tree_Bodys 树干段作小苗（底部对齐）
      if (type === T.SAPLING && env.autotiler) {
        const r = env.autotiler.saplingSprite(x, y);
        if (r) {
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px + (TILE - r.sw) / 2, py + TILE - r.sh, r.sw, r.sh);
          continue;
        }
      }
      // 杂草：Maples Tiles_3 杂草贴图（16×20，底部对齐，hash 选变体）
      if (type === T.TALLGRASS && env.autotiler) {
        const r = env.autotiler.weedSprite(x, y);
        if (r) {
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px - (r.sw - TILE) / 2, py + TILE - r.sh, r.sw, r.sh);
          continue;
        }
      }
      // 有 RuleTile 规则的 tile 用 Maples 素材自动贴合
      const ruleName = env.autotiler ? TILE_RULES[type] : undefined;
      if (ruleName && env.autotiler) {
        // 草皮覆盖件：保持原生透明（缺口露出背后的墙/天空），不做任何垫底/填充
        if (ruleName === '@grass') {
          const r = env.autotiler.tile(ruleName, st, x, y, type);
          if (r) ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
          continue;
        }
        const r = env.autotiler.tile(ruleName, st, x, y, type);
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
      const entry = env.sheets.get(type);
      if (!entry) {
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      if (entry.kind === 'blend') {
        const mask = neighborMask(st, x, y, type);
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
  // ★bakenoread（2026-10-08）：noRead 旗开时首漆格触发该层【一次】整 cell 快照
  //  getImageData(ox,oy,256²)（旧路=每漆格一次 16² 页读回,Windows 逐 op 管线同步
  //  放大=Trace-202608T175748 定谳 31ms/s 主头），逐格 tint 改从快照行拷贝
  //  （TileTint.tintRegionData）。快照=同一份 GPU 光栅产物一次性读回 → tint 源
  //  字节与逐格读回逐位同源,回写链（tintCanvas→drawImage）不变 → 产物逐位等价;
  //  无漆 chunk 零快照零开销。旗关 = 旧逐格路径逐字不变。
  //  （getImageData 不受 ctx transform/clip 影响 = 页绝对坐标,快照矩形与 cell 对齐）
  const noRead = env.noRead === true;
  const S = CHUNK * TILE;
  let wallSnap: ImageData | null = null;
  let tileSnap: ImageData | null = null;
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, y = y0 + ly;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      const pw = st.paintWall[i];
      if (pw > 0 && st.wall[i] !== 0) {
        if (noRead && !wallSnap) wallSnap = wctx.getImageData(ox, oy, S, S);
        if (wallSnap) tintRegionData(wctx, wallSnap, lx * TILE, ly * TILE, pw, lx * TILE, ly * TILE, true);
        else tintRegion(wctx, wall, ox + lx * TILE, oy + ly * TILE, pw, lx * TILE, ly * TILE, true);
      }
      const pt = st.paint[i];
      if (pt > 0 && st.flags[i] && st.type[i] !== 0) {
        const vt = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
        let style = 0;
        if (vt === 5) style = treeTrunkPaintStyle(st, x, y, st.frameX[i], st.frameY[i], env.groundLevel);
        else if (vt === 323) style = palmTreePaintStyle(st, x, y, st.w);
        // 表外类型(null)或 paint 非 1-12(函数内守卫) → 普通组 applyPaintTint
        const special = pt >= 1 && pt <= 12 ? getTilePaintSettings(vt ?? -1, style) ?? undefined : undefined;
        if (noRead && !tileSnap) tileSnap = ctx.getImageData(ox, oy, S, S);
        if (tileSnap) tintRegionData(ctx, tileSnap, lx * TILE, ly * TILE, pt, lx * TILE, ly * TILE, false, special);
        else tintRegion(ctx, tile, ox + lx * TILE, oy + ly * TILE, pt, lx * TILE, ly * TILE, false, special);
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
  if (env.autotiler) {
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
          const trees = { treeX: env.treeX, treeStyle: env.treeStyle, treeTops: env.treeTops,
            worldSurface: env.groundLevel, worldW: st.w };
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
              ? getTilePaintSettings(323, palmTreePaintStyle(st, tx, ty, st.w)) ?? undefined
              : undefined;
            drawTreeCell(ctx, env.autotiler.atlas, st, tx, ty, fx, fy,
              tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, false, trees,
              0, undefined, pp, trunkSpecial);
          } else {
            // 蘑菇树：顶格标记帧原版不摆动，保留烘焙（DrawTrees switch 无 case 72）
            drawTreeCell(ctx, env.autotiler.atlas, st, tx, ty, fx, fy,
              tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, true, trees,
              0, undefined, st.paint[i]);   // ★IIIII227：同上（油漆 pass 后绘制）
          }
        }
      }
    }
  }
  // restore/return 在外层 bakeChunkIntoEnv(异常安全 try/finally)
}
