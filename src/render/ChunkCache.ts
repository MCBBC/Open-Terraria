// chunk 静态缓存：每 chunk 16×16 tile 预渲染到离屏 canvas（墙层+tile 层）
import { CHUNK, TILE } from '../core/constants';
import { T, TILE_DEFS, WALL_DEFS, TILE_BY_KEY } from '../data/tiles';
import { hash2 } from '../core/rng';
import { drawVanillaCell, drawTreeCell } from './VanillaTiler';
import { VanillaWallTiler } from './VanillaWallTiler';
import { shade } from '../assets/Palette';
import type { TileSheetEntry } from '../assets/TileSheetGen';
import type { AutoTiler } from './AutoTiler';
import type { World } from '../world/World';

// 我们的 tile → Maples RuleTile 规则名（有规则的走素材自动贴合，无规则回退程序化）
// Grass 走人工标注（'@grass'）：Tiles_2.png 是多 tile 混排图集，自动分类不可靠；
// 用 public/annotator.html 标注后写入 sprites/annotations.json。无标注时回退程序化。
const TILE_RULES: Record<number, string> = {
  // 泥土/石/草走原版 BlendRules；铁矿走原版表——均不再用 Maples 规则
  13: '工作台', 14: '熔炉', 15: '铁砧',
};

export interface ChunkPair {
  wall: HTMLCanvasElement;   // 背景墙层（水画在它之上）
  tile: HTMLCanvasElement;   // 前景 tile/物体层（画在水之上）
}

export class ChunkCache {
  chunks = new Map<number, ChunkPair>();
  dirtyQueue: number[] = [];
  sheets: Map<number, TileSheetEntry>;
  world: World;
  autotiler: AutoTiler | null;
  wallTiler: VanillaWallTiler | null;
  truncatesWalls: number[] = [];
  /** LRU 上限:每 chunk 2×256² canvas = 512KB;384 chunk ≈ 196MB(缩放 0.5 时
   *  可视 ~100 chunk 仍绰绰有余)。此前 Map 只增不减——跑图积累无界(内存泄漏 #1) */
  static readonly MAX_CHUNKS = 384;

  constructor(world: World, sheets: Map<number, TileSheetEntry>, autotiler: AutoTiler | null = null, wallTiler: VanillaWallTiler | null = null) {
    this.world = world;
    this.sheets = sheets;
    this.autotiler = autotiler;
    this.wallTiler = wallTiler;
    // 原版 TileID.Sets.TruncatesWalls（54 玻璃 / 328 暗影宝箱 / 459 / 748）→ 内部 tile id
    this.truncatesWalls = ['glass', 'v_328_shadow_chest', 'v_459_', 'v_748_']
      .map((k) => TILE_BY_KEY[k] ?? -1)
      .filter((id) => id >= 0);
    world.store.onTileChanged((x, y) => this.markDirtyAround(x, y));
  }

  static key(cx: number, cy: number): number {
    return (cx & 0xffff) | ((cy & 0xffff) << 16);
  }

  markDirty(cx: number, cy: number) {
    const k = ChunkCache.key(cx, cy);
    if (!this.chunks.has(k)) return; // 未生成的 chunk 惰性创建
    this.chunks.set(k, undefined as unknown as ChunkPair); // 标记删除，重绘时重建
    if (!this.dirtyQueue.includes(k)) this.dirtyQueue.push(k);
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
   *  4/帧 的 flushDirty 会逐步重烘焙,dirtyQueue.includes 去重防重复入队 */
  invalidateAll(): void {
    for (const k of this.chunks.keys()) {
      if (this.chunks.get(k) === undefined) continue; // 已是待重建哨兵
      this.chunks.set(k, undefined as unknown as ChunkPair);
      if (!this.dirtyQueue.includes(k)) this.dirtyQueue.push(k);
    }
  }

  /** 每帧最多重绘 maxN 个脏 chunk */
  flushDirty(maxN = 4) {
    let n = 0;
    while (this.dirtyQueue.length && n < maxN) {
      const k = this.dirtyQueue.shift()!;
      const cx = k & 0xffff, cy = (k >> 16) & 0xffff;
      if (this.chunks.get(k) !== undefined) continue; // 已重建
      this.get(cx, cy);
      n++;
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
    // 双层画布：墙层 / tile 层分离 —— 水渲染在两层之间（墙之上、图块之下）
    const wall = document.createElement('canvas');
    wall.width = CHUNK * TILE; wall.height = CHUNK * TILE;
    const tile = document.createElement('canvas');
    tile.width = CHUNK * TILE; tile.height = CHUNK * TILE;
    let ctx = wall.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
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
          const px = lx * TILE, py = ly * TILE;
          if (this.wallTiler.hasTexture(wallId)) {
            this.wallTiler.draw(ctx, st, x, y, wallId, this.truncatesWalls, px, py);
          } else {
            const wd = WALL_DEFS[wallId];
            if (wd) {
              ctx.fillStyle = wd.mapColor;
              ctx.fillRect(px, py, TILE, TILE);
              ctx.fillStyle = shade(wd.mapColor, 0.8);
              ctx.fillRect(px, py + TILE - 1, TILE, 1);
              ctx.fillRect(px + TILE - 1, py, 1, TILE);
            }
          }
        }
      }
    }

    // ---- 第二遍：前景 tile / 物体（绘制到 tile 层画布；水渲染在墙层与 tile 层之间）----
    ctx = tile.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, y = y0 + ly;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        const px = lx * TILE, py = ly * TILE;
        const type = st.type[i];
        // 原版语义:非活性格不渲染(TileRunner 会给空气格写幽灵 type)
        if (type === 0 || !st.flags[i]) continue;
        // 已致动(inActive):幽灵态淡显(原版 DrawInactiveSorter,Main.cs:2828 附近)
        // 每格开头统一设定 alpha(各 continue 路径无需逐个恢复,下一格自愈)
        const actuated = (st.wire[i] & 32) !== 0;
        ctx.globalAlpha = actuated ? 0.3 : 1;
        const def = TILE_DEFS[type];
        if (!def) { ctx.fillStyle = '#808080'; ctx.fillRect(px, py, TILE, TILE); continue; }
        // 原版素材图块（TileDef.vanilla）：TEdit framing 查找表（auto）或显式 18px 帧（style）
        if (def.vanilla && this.autotiler) {
          drawVanillaCell(
            ctx, this.autotiler.atlas, def.vanilla.sheet, def.vanilla.frame,
            def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
            st, x, y, type,
            (t) => t === type, // 同 id 融合判定（后续可扩 mergeWith）
            px, py, st.frameX[i], st.frameY[i],
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

    // ---- 第三遍：半砖（halfBrick）——主绘制后清掉上半 8px ----
    // 原版 TileDrawing.cs:689-690：源矩形高度 -8、目标下移 8（贴图上半画进格下半）。
    // 此处统一后处理 clearRect 上半（对 blend/auto/rule 全部绘制路径生效；
    // 与原版的差异是保留贴图下半而非上半，纹理内容差异可忽略）
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = st.idx(x0 + lx, y0 + ly);
        if (st.half[i]) ctx.clearRect(lx * TILE, ly * TILE, TILE, 8);
      }
    }

    // ---- 第四遍：原版树冠/树枝（tile 5 标记帧，跨 chunk 外扩绘制） ----
    // 树冠 80×80 / 树枝 40×40 跨多格，主遍跳过这些标记帧，由此外扩遍统一绘制防裁剪。
    // 棕榈（323）整棵都在此绘制：干身 frameY 是倾斜偏移（最大 ±12px 跨列），
    // 主遍画会在 chunk 边缘列被裁剪 → 干+冠全部走外扩遍
    if (this.autotiler) {
      const treeIds = ['tree', 'v_72_mushroom_tree', 'v_323_palm_trees', 'v_5_trees',
        'v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree', 'v_586_emerald_tree',
        'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree',
        'v_596_vanity_tree_sakura', 'v_616_vanity_tree_yellow_willow', 'v_634_ash_tree']
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
            const isPalm = sheet === 323;
            const isCrown = isPalm ? (fx >= 88 && fx <= 132) : (fy >= 198 && fx >= 22);
            if (isPalm) {
              // 棕榈：干+冠都画（干身倾斜跨列，必须外扩遍）
              drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
                tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, isCrown,
                { treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
                worldSurface: this.world.groundLevel, worldW: this.world.w });
            } else if (isCrown) {
              // 其他树：仅标记帧（干身由主遍绘制）
              drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
                tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, sheet, true,
                { treeX: this.world.treeX, treeStyle: this.world.treeStyle, treeTops: this.world.treeTops,
                worldSurface: this.world.groundLevel, worldW: this.world.w });
            }
          }
        }
      }
    }

    return { wall, tile };
  }
}
