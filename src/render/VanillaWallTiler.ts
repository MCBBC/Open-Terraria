// 原版背景墙渲染器：TEdit WallFraming.cs 精确移植（= vanilla Framing.WallFrame 1.4.5.4）。
// 墙 id 直用原版 wld id，贴图为 Wall_N.png（13 列 × 36px 步长 = 32px 帧 + 4 间隔）。
// 绘制以格子为中心的 32×32（2×2 格大小）。★实测(2026-08-10 逐像素 alpha):
// 内部帧(mask15-19)的 8px 外圈全透明,不透明核心恰好是中心 16×16——相邻格核心
// 精确贴合、零重叠零容错(并非"半格交叠");故渲染端任何半像素偏移都会显缝,
// 相机像素吸附见 Renderer.draw。边缘变体帧的轮廓是硬边抖动,全表无半透明 alpha。
import type { SpriteAtlas, DrawRect } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { tileAnim } from './TileAnim';

// 4 位基数掩码位序（与 tile framing 不同！）：N=1 W=2 E=4 S=8
// 20×4 查找表（TEdit WallFrameLookup）：mask → [v0,v1,v2,v3] 的 (col,row)
const WALL_LOOKUP: Array<[number, number][]> = [
  /* 0 none */ [[9, 3], [10, 3], [11, 3], [6, 6]],
  /* 1 N    */ [[6, 3], [7, 3], [8, 3], [4, 6]],
  /* 2 W    */ [[12, 0], [12, 1], [12, 2], [12, 5]],
  /* 3 N+W  */ [[1, 4], [3, 4], [5, 4], [3, 6]],
  /* 4 E    */ [[9, 0], [9, 1], [9, 2], [9, 5]],
  /* 5 N+E  */ [[0, 4], [2, 4], [4, 4], [2, 6]],
  /* 6 W+E  */ [[6, 4], [7, 4], [8, 4], [5, 6]],
  /* 7 N+W+E */ [[1, 2], [2, 2], [3, 2], [3, 5]],
  /* 8 S    */ [[6, 0], [7, 0], [8, 0], [6, 5]],
  /* 9 N+S  */ [[5, 0], [5, 1], [5, 2], [5, 5]],
  /* 10 W+S */ [[1, 3], [3, 3], [5, 3], [1, 6]],
  /* 11 N+W+S */ [[4, 0], [4, 1], [4, 2], [4, 5]],
  /* 12 E+S */ [[0, 3], [2, 3], [4, 3], [0, 6]],
  /* 13 N+E+S */ [[0, 0], [0, 1], [0, 2], [0, 5]],
  /* 14 W+E+S */ [[1, 0], [2, 0], [3, 0], [1, 5]],
  /* 15 ALL center0 */ [[1, 1], [2, 1], [3, 1], [2, 5]],
  /* 16 ALL center1 */ [[6, 1], [7, 1], [8, 1], [7, 5]],
  /* 17 ALL center2 */ [[6, 2], [7, 2], [8, 2], [8, 5]],
  /* 18 ALL center3 */ [[10, 0], [10, 1], [10, 2], [10, 5]],
  /* 19 ALL center4 */ [[11, 0], [11, 1], [11, 2], [11, 5]],
];

// 全邻时的中心子模式：原版 Framing.cs:399 centerWallFrameLookup[i%3][j%3],i=x j=y
// (曾照抄 TEdit 写成 [y%3][x%3]——转置,3×3 平铺图案与原版镜像)
const CENTER = [
  [2, 0, 0],
  [0, 1, 4],
  [0, 3, 0],
];

// Phlebas（largeFrame 1）：4×3 重复块，1-based
const PHLEBAS = [
  [2, 4, 2],
  [1, 3, 1],
  [2, 2, 4],
  [1, 1, 3],
];

// Lazure（largeFrame 2）：2×2 重复块，1-based
const LAZURE = [
  [1, 3],
  [2, 4],
];

const STRIDE = 36; // 32px 帧 + 4px 间隔

// ============ 墙动画（Main.DoUpdate_AnimateWalls，Main.cs:19181-19305）============
// 动画墙表 468×1440 = 13 列 × 40 行（36px/行）＝ 8 个动画带 × 5 行/带
// （WallDrawing.cs:119 `wallFrameY + wallFrame[wall]*180`，180px=5 行）。
// rate 归一化同 tile 表：counter>=N → 每 N tick
export const WALL_ANIM_RATE: Record<number, number> = {
  136: 5, 137: 10, 168: 5, 169: 5, 172: 10, 225: 5, 226: 10, 227: 5,
  347: 10, 357: 5, 365: 8,
};

/** 242/243 星彩玻璃（WallDrawing.cs:122-127）：不走全局 wallFrame，逐格错相——
 *  (counter + x*11 + y*27) % 160，每 20 tick 一带共 8 带（counter 每 tick +1） */
export function starGlassBand(tick: number, x: number, y: number): number {
  return Math.floor((((tick + x * 11 + y * 27) % 160) + 160) % 160 / 20);
}

/** 该墙当前动画带（无动画返回 0）。225 回卷 2 带（Main.cs:19241-19249 `>1`），
 *  其余 8 带（`>7`） */
export function wallAnimFrame(wallId: number): number {
  const rate = WALL_ANIM_RATE[wallId];
  if (!rate) return 0;
  const frames = wallId === 225 ? 2 : 8;
  return Math.floor(tileAnim.tick / rate) % frames;
}

/** 换帧行列的推进节奏（ChunkCache.advanceAnim 重烘焙判定用）：
 *  0=无动画；1=逐格错相（星彩玻璃，每 tick 都有格换带）；否则=表内 rate */
export function wallAnimRate(wallId: number): number {
  if (wallId === 242 || wallId === 243) return 1;
  return WALL_ANIM_RATE[wallId] ?? 0;
}

/** 动画带 → 本渲染器行偏移（5 行/带） */
export function wallAnimBandRows(wallId: number, x: number, y: number): number {
  if (wallId === 242 || wallId === 243) return starGlassBand(tileAnim.tick, x, y) * 5;
  return wallAnimFrame(wallId) * 5;
}

export class VanillaWallTiler {
  private imgCache = new Map<number, HTMLImageElement | null>();

  constructor(private atlas: SpriteAtlas | null) {}

  private wallImg(wallId: number): HTMLImageElement | null {
    // ★ 只缓存命中：懒加载未就绪时 ensureVImage 返回 null，若把 null 也缓存，
    //   图片晚到后 onVImageLoaded→invalidateAll 重烘焙也永远查到 null → 永久色块回退
    //   （与 VanillaLiquidRenderer null-texCache / PaperDoll 同款缓存投毒）
    const cached = this.imgCache.get(wallId);
    if (cached) return cached;
    const m = this.atlas ? this.atlas.vanilla.walls[String(wallId)] : null;
    const img = m && this.atlas ? this.atlas.ensureVImage(m.sheet) : null;
    if (img) this.imgCache.set(wallId, img);
    return img ?? null;
  }

  /** 邻居判定（TEdit HasWallNeighbor）：wall>0 任意 id 都算，或截断墙方块。
   *  truncates = 内部 tile id 数组（wld 54 玻璃 / 328 / 459 / 748 对应的 v_ 键） */
  private hasNeighbor(st: TileStore, x: number, y: number, truncates: number[]): boolean {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (st.wall[i] > 0) return true;
    if (st.flags[i] && truncates.includes(st.type[i])) return true;
    return false;
  }

  /** 绘制一格墙（源 32×32，目标以格为中心的 2×2 格大小） */
  draw(ctx: CanvasRenderingContext2D, st: TileStore, x: number, y: number, wallId: number, truncates: number[], px: number, py: number): void {
    const img = this.wallImg(wallId);
    if (!img) return;
    // 掩码：N=1 W=2 E=4 S=8
    let mask = 0;
    if (this.hasNeighbor(st, x, y - 1, truncates)) mask |= 1;
    if (this.hasNeighbor(st, x - 1, y, truncates)) mask |= 2;
    if (this.hasNeighbor(st, x + 1, y, truncates)) mask |= 4;
    if (this.hasNeighbor(st, x, y + 1, truncates)) mask |= 8;
    // 全邻 → 中心子模式
    if (mask === 15) mask += CENTER[x % 3][y % 3];
    // 变体（largeFrame 三模式）
    const lf = this.atlas ? this.atlas.vanilla.walls[String(wallId)]?.largeFrame ?? 0 : 0;
    let v: number;
    if (lf === 1) v = PHLEBAS[y % 4][x % 3] - 1;
    else if (lf === 2) v = LAZURE[x % 2][y % 2] - 1;
    else v = ((x * 7) + (y * 11)) % 3;
    const entry = WALL_LOOKUP[mask];
    if (!entry) return;
    const fr = entry[v] ?? entry[0];
    // 动画带（DoUpdate_AnimateWalls）：行 += 带×5（180px=5 行，WallDrawing.cs:119）
    const bandRows = wallAnimBandRows(wallId, x, y);
    const sx = fr[0] * STRIDE, sy = (fr[1] + bandRows) * STRIDE;
    if (sx + 32 > img.width || sy + 32 > img.height) return; // 变体3 超出矮表（默认模式不会发生）
    ctx.drawImage(img, sx, sy, 32, 32, px - TILE / 2, py - TILE / 2, 32, 32);
  }

  /** 墙帧（col,row）——调试/纠错面板定位用 */
  frameAt(st: TileStore, x: number, y: number, wallId: number, truncates: number[]): { col: number; row: number } {
    let mask = 0;
    if (this.hasNeighbor(st, x, y - 1, truncates)) mask |= 1;
    if (this.hasNeighbor(st, x - 1, y, truncates)) mask |= 2;
    if (this.hasNeighbor(st, x + 1, y, truncates)) mask |= 4;
    if (this.hasNeighbor(st, x, y + 1, truncates)) mask |= 8;
    if (mask === 15) mask += CENTER[x % 3][y % 3];
    const lf = this.atlas ? this.atlas.vanilla.walls[String(wallId)]?.largeFrame ?? 0 : 0;
    let v: number;
    if (lf === 1) v = PHLEBAS[y % 4][x % 3] - 1;
    else if (lf === 2) v = LAZURE[x % 2][y % 2] - 1;
    else v = ((x * 7) + (y * 11)) % 3;
    const fr = WALL_LOOKUP[mask]?.[v] ?? [1, 1];
    return { col: fr[0], row: fr[1] + wallAnimBandRows(wallId, x, y) };
  }

  hasTexture(wallId: number): boolean {
    return this.wallImg(wallId) !== null;
  }
}
