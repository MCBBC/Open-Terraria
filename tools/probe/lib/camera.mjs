/**
 * IIII236 统一探针框架 —— 相机坐标与画布取证。
 *
 * 坑史锚(memory: lavaslope 五坑#2/#3、desert-style4、_iii227-livecanvas):
 *  - camera.x/y 是【世界像素】;循环变量是 tile 序号——直接把 cam.x 当 tile 序号
 *    = 全程越界 0 检查(oracle 假阴性)。viewRectTiles 统一除 16 折算。
 *  - 相机 follow 是 0.15/frame 缓动:传送后要么等 ≥2.5s 要么直接写 camera.x/y。
 *  - 游戏画布 = querySelectorAll('canvas')[1]([0] 是 80×80 ui-canvas)——
 *    但更稳的是 g.renderer.canvas(防 DOM 顺序变化)。
 *  - drawImage 源是 ImageBitmap 无 .src:指纹用 bmp{width}x{height}。
 */
import { front } from './browser.mjs';

/** 相机/玩家置位(世界像素直写,免 0.15 缓动等待)。 */
export async function camSnapTo(page, wx, wy, { player = true } = {}) {
  await front(page);
  return page.evaluate(({ wx, wy, player }) => {
    const g = window.__swGame;
    if (!g) return false;
    if (player && g.player) { g.player.x = wx; g.player.y = wy; g.player.vx = 0; g.player.vy = 0; }
    g.camera.x = wx; g.camera.y = wy;   // follow 缓动的旁路:直写=本帧已就位
    return true;
  }, { wx, wy, player });
}

/** 相机对准 tile(收 tile 序号——内部 ×16,别再让探针手写 ×16/÷16)。 */
export async function camSnapToTile(page, tx, ty, { player = true } = {}) {
  return camSnapTo(page, tx * 16, ty * 16, { player });
}

/** 当前视野的 tile 包络 { x0,y0,x1,y1, zoom }——循环扫描一律以它为准。 */
export async function viewRectTiles(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    if (!g?.camera) return null;
    const cam = g.camera;
    const halfW = cam.viewW / 2 / cam.zoom, halfH = cam.viewH / 2 / cam.zoom;
    return {
      x0: Math.floor((cam.x - halfW) / 16), y0: Math.floor((cam.y - halfH) / 16),
      x1: Math.ceil((cam.x + halfW) / 16), y1: Math.ceil((cam.y + halfH) / 16),
      zoom: cam.zoom, camX: cam.x, camY: cam.y,
    };
  });
}

/** 世界像素 → 屏幕像素(与 Camera.worldToScreen 同式,含 punch/zoom)。 */
export async function worldToScreen(page, wx, wy) {
  return page.evaluate(({ wx, wy }) => {
    const cam = window.__swGame?.camera;
    if (!cam) return null;
    const [x, y] = cam.worldToScreen(wx, wy);
    return [Math.round(x), Math.round(y)];
  }, { wx, wy });
}

/** 游戏主画布元素句柄信息(优先 renderer.canvas;DPR/尺寸指纹用)。 */
export async function gameCanvasInfo(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas
      ?? document.querySelectorAll('canvas')[1]   // [0]=80×80 ui-canvas(历史坑)
      ?? document.querySelector('canvas');
    if (!cv) return null;
    return {
      w: cv.width, h: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight,
      isRenderer: !!(g?.renderer?.canvas),
      dpr: window.devicePixelRatio ?? 1,
    };
  });
}
