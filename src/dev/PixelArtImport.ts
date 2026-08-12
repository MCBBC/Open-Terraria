// F11 图片 → 像素方块群导入(自研功能,原版无)。
// 与游戏逻辑的耦合面仅三处:tile 注册(tiles.ts pixel_block)、渲染分支
// (VanillaTiler.drawPixelBlock)、F11 挂钩(Game.openPixelArtImport)。
// 本模块只做三件纯事:降采样成色格、找放置位、写 tile——全部走 TileStore
// 既有入口(setTile),因此可镐挖/进存档/联机上报自动成立,无任何旁路状态。
import { TileStore } from '../world/TileStore';
import { TILE_BY_KEY } from '../data/tiles';

const PIXEL = TILE_BY_KEY['pixel_block'];

export interface ArtGrid { w: number; h: number; rgba: Uint8ClampedArray }

/** 图片 → 像素格:盒式平均降采样(最长边 ≤ maxSide),通道轻度量化(32 级/通道,
 *  压缩色数更接近像素画);alpha < alphaThresh 的格子标记透明(放置时跳过)。 */
export function imageToGrid(img: HTMLImageElement | HTMLCanvasElement, maxSide = 48, alphaThresh = 40): ArtGrid {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  // 轻度量化:r/g/b → 32 级(×8 取整回填);透明格 alpha 置 0
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / 8) * 8;
    d[i + 1] = Math.round(d[i + 1] / 8) * 8;
    d[i + 2] = Math.round(d[i + 2] / 8) * 8;
    if (d[i + 3] < alphaThresh) d[i + 3] = 0; else d[i + 3] = 255;
  }
  return { w, h, rgba: d };
}

/** 放置位扫描:锚列(anchorX)自 fromY 向下找地表,底边贴地表悬空放置;
 *  若 width×h 矩形在该高度非全空(地面不平/有障碍),整体逐格抬升直到全空
 *  (上限 300 行,防浮空找不满)。找不到返回 null。
 *  返回 {x, y} = 色格左上角的世界格坐标。 */
export function findArtPlacement(
  st: TileStore, anchorX: number, fromY: number, w: number, h: number,
): { x: number; y: number } | null {
  const x = Math.max(2, Math.min(st.w - w - 2, Math.round(anchorX)));
  if (x + w >= st.w - 1) return null;
  // 地表:锚跨中列自 fromY 向下首个实心
  const cxCol = Math.min(st.w - 1, x + (w >> 1));
  let groundY = -1;
  for (let y = Math.max(1, Math.floor(fromY)); y < st.h - 10; y++) {
    if (st.flags[st.idx(cxCol, y)]) { groundY = y; break; }
  }
  if (groundY < 0) return null;
  const allAir = (bottom: number): boolean => {
    const top = bottom - h;
    if (top < 10) return false;
    for (let yy = top; yy < bottom; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (st.flags[st.idx(xx, yy)]) return false;
      }
    }
    return true;
  };
  for (let bottom = groundY; bottom > groundY - 300; bottom--) {
    if (allAir(bottom)) return { x, y: bottom - h };
  }
  return null;
}

/** 写入方块群:跳过透明格与已占用格;RGB 编码 fx=((r||1)<<8)|(g||1)、fy=(b||1)
 *  (||1 防 (0,0) 触发 style 路径锚点重建扫描)。返回实际放置格数。 */
export function placeArt(st: TileStore, grid: ArtGrid, origin: { x: number; y: number }): number {
  if (PIXEL === undefined) return 0;
  let n = 0;
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = (cy * grid.w + cx) * 4;
      if (grid.rgba[i + 3] === 0) continue;
      const wx = origin.x + cx, wy = origin.y + cy;
      if (!st.inBounds(wx, wy)) continue;
      const wi = st.idx(wx, wy);
      if (st.flags[wi]) continue; // 不覆盖既有方块
      const r = grid.rgba[i], g = grid.rgba[i + 1], b = grid.rgba[i + 2];
      st.setTile(wx, wy, PIXEL, ((r || 1) << 8) | (g || 1), b || 1);
      n++;
    }
  }
  return n;
}
