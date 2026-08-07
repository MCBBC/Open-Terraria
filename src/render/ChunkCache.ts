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
  1: 'Dirt', 2: 'Stone', 3: '@grass', 5: 'Iron', 8: 'Tree',
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

  /** 取 chunk 双层画布（惰性生成） */
  get(cx: number, cy: number): ChunkPair {
    const k = ChunkCache.key(cx, cy);
    let c = this.chunks.get(k);
    if (c) return c;
    c = this.renderChunk(cx, cy);
    this.chunks.set(k, c);
    return c;
  }

  /** 树枝判定：TREE 且上下皆非 TREE、恰好一侧为 TREE（横向独连树干）。
   *  下方是实心地面的属于树根底座 —— 走规则表渲染底座贴图，不算枝干 */
  private isBranchTile(st: World['store'], x: number, y: number): boolean {
    const at = (ax: number, ay: number) => st.inBounds(ax, ay) && st.type[st.idx(ax, ay)] === T.TREE;
    const up = at(x, y - 1), dn = at(x, y + 1), lf = at(x - 1, y), rt = at(x + 1, y);
    return !up && !dn && lf !== rt && !st.isSolid(x, y + 1);
  }

  private neighborMask(x: number, y: number, type: number): number {
    const st = this.world.store;
    let mask = 0;
    const same = (nx: number, ny: number) => st.inBounds(nx, ny) && st.type[st.idx(nx, ny)] === type ? 1 : 0;
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
        if (type === 0) continue;
        const def = TILE_DEFS[type];
        if (!def) { ctx.fillStyle = '#808080'; ctx.fillRect(px, py, TILE, TILE); continue; }
        // 树枝：TREE 且仅横向连接树干 → 跳过常规路径（第二遍半按 pivot 锚定专用绘制，
        // 规则表变体池混有树干碎片贴图，hash 选变体会 50% 画出残片）
        if (type === T.TREE && this.isBranchTile(st, x, y)) continue;
        // 原版素材图块（TileDef.vanilla）：TEdit framing 查找表（auto）或显式 18px 帧（style）
        if (def.vanilla && this.autotiler) {
          drawVanillaCell(
            ctx, this.autotiler.atlas, def.vanilla.sheet, def.vanilla.frame,
            def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
            st, x, y, type,
            (t) => t === type, // 同 id 融合判定（后续可扩 mergeWith）
            px, py, st.frameX[i], st.frameY[i],
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
    // ---- 第二遍半：树枝（pivot 锚定专用绘制） ----
    // Unity 切片 pivot：左向枝 0/2/4 = x0.8，右向枝 1/3/5 = x0.2（pivot 对齐格子中心），
    // 按 0.5 居中画会整体偏移 12-24px。外扩扫描防跨 chunk 裁剪（右向枝外伸 24px）。
    if (this.autotiler) {
      const EXT = 3;
      for (let ty = y0 - EXT; ty < y0 + CHUNK + EXT; ty++) {
        for (let tx = x0 - EXT; tx < x0 + CHUNK + EXT; tx++) {
          if (!st.inBounds(tx, ty)) continue;
          if (st.type[st.idx(tx, ty)] !== T.TREE) continue;
          if (!this.isBranchTile(st, tx, ty)) continue;
          // 树干在右 → 左向枝；树干在左 → 右向枝。
          // 只用朝上变体：_1/_4 的美术在下半部（下垂朝地），正常枝干应朝上
          const left = st.type[st.idx(tx + 1, ty)] === T.TREE;
          const names = left ? ['Tree_Branches_0', 'Tree_Branches_2']
            : ['Tree_Branches_3', 'Tree_Branches_5'];
          const name = names[Math.floor(hash2(tx, ty, 71) * names.length) % names.length];
          const r = this.autotiler.atlas.rect('地形/Tree_Branches.png', name);
          if (!r) continue;
          const pivX = left ? 0.8 : 0.2;
          const pivY = name === 'Tree_Branches_2' ? 0.475 : name === 'Tree_Branches_5' ? 0.4 : 0.5;
          const dx = tx * TILE + TILE / 2 - pivX * r.sw - x0 * TILE;
          const dy = ty * TILE + TILE / 2 - pivY * r.sh - y0 * TILE;
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, dx, dy, r.sw, r.sh);
        }
      }
    }

    // ---- 第三遍：树冠大图最上层 ----
    // 扫描本 chunk 及外扩 5 格的树顶格（上空气、下树干），绘制整幅树冠。
    // 外扩保证树冠跨 chunk 时不被裁剪（右边缺一块/头上缺一块的根因）。
    if (this.autotiler) {
      const EXT = 5;
      for (let ty = y0 - EXT; ty < y0 + CHUNK + EXT; ty++) {
        for (let tx = x0 - EXT; tx < x0 + CHUNK + EXT; tx++) {
          if (!st.inBounds(tx, ty)) continue;
          if (st.type[st.idx(tx, ty)] !== T.TREE) continue;
          if (st.inBounds(tx, ty - 1) && st.type[st.idx(tx, ty - 1)] === T.TREE) continue; // 非树顶
          if (!st.inBounds(tx, ty + 1) || st.type[st.idx(tx, ty + 1)] !== T.TREE) continue; // 下方须为树干
          const r = this.autotiler.tile('Tree', st, tx, ty, T.TREE);
          if (!r || r.sw <= TILE * 2) continue;
          const wx = tx * TILE, wy = ty * TILE; // 世界像素
          const dx = wx + (TILE - r.sw) / 2 - x0 * TILE;
          const dy = wy + (TILE - r.sh) / 2 - y0 * TILE;
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, dx, dy, r.sw, r.sh);
        }
      }
    }

    // ---- 第四遍：原版树冠/树枝（tile 5 标记帧，跨 chunk 外扩绘制） ----
    // 树冠 80×80 / 树枝 40×40 跨多格，主遍跳过这些标记帧，由此外扩遍统一绘制防裁剪
    if (this.autotiler) {
      const v5 = TILE_BY_KEY['v_5_trees'];
      if (v5 !== undefined) {
        const EXT = 6;
        for (let ty = y0 - EXT; ty < y0 + CHUNK + EXT; ty++) {
          for (let tx = x0 - EXT; tx < x0 + CHUNK + EXT; tx++) {
            if (!st.inBounds(tx, ty)) continue;
            const i = st.idx(tx, ty);
            if (st.type[i] !== v5) continue;
            const fx = st.frameX[i], fy = st.frameY[i];
            if (fy < 198 || fx < 22) continue; // 树干由主遍绘制
            drawTreeCell(ctx, this.autotiler.atlas, st, tx, ty, fx, fy,
              tx * TILE - x0 * TILE, ty * TILE - y0 * TILE, true);
          }
        }
      }
    }

    return { wall, tile };
  }
}
