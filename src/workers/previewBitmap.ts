// 生成期实时预览的降采样 RGBA 位图（worker 侧渲染，transfer 回主线程 putImageData）。
// 预览控件显示宽度上限 ~520 CSS px（GenWorldPreview），maxW=640 已超显示分辨率；
// 全量 type 数组每 pass 34MB 拷贝不可接受——此处直接在 worker 着色输出 RGBA。
import type { TileStore } from '../world/TileStore';
import { mapColor24 } from '../render/MapColors';

/** 降采样：每个输出像素取源格 (x*fx, y*fy) 的 mapColor24（tile>liquid>wall 优先级，
 *  MapColors.mapColor24 已封装）。bg = 世界面上下文（对齐游戏内小地图背景分层；
 *  ★IIIII218 补 underworld=地狱顶与 remix 上表旗——与 Renderer.colorFor 同构）。
 *  中世界 6400×1800 → 640×180×4 ≈ 460KB/帧（maxW 1024 ≈ 1.2MB/帧——DPR2 下
 *  显示宽 ~1040 设备像素，640 源会被放大糊掉；微光湖等小地物也靠分辨率保住） */
export function renderPreviewBitmap(st: TileStore, maxW = 1024,
  bg?: { groundLevel: number; rockLevel: number; underworld?: number; remix?: boolean }): {
  width: number; height: number; rgba: Uint8ClampedArray;
} {
  const fx = Math.max(1, Math.ceil(st.w / maxW));
  const fy = fx; // 保持纵横比
  const width = Math.floor(st.w / fx);
  const height = Math.floor(st.h / fy);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const c = mapColor24(st, ox * fx, oy * fy, bg);
      const i = (oy * width + ox) * 4;
      rgba[i] = (c >> 16) & 255;
      rgba[i + 1] = (c >> 8) & 255;
      rgba[i + 2] = c & 255;
      rgba[i + 3] = 255;
    }
  }
  return { width, height, rgba };
}
