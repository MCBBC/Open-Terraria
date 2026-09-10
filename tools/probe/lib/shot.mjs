/**
 * IIII236 统一探针框架 —— 截图与"非零像素哨兵"。
 *
 * 坑史锚:
 *  - memory: lavaslope 五坑#1 —— 截图前 canvas 活像素门(后台节流→黑屏假象);
 *    本模块 litStats 默认跑哨兵,全黑=没画而不是"功能缺失"。
 *  - _iii227-livecanvas —— 传送相机 → 等数帧 → 读主画布对应屏幕区非背景像素率。
 *  - _iii232-credits-roll —— overlay 非空像素:离屏 canvas drawImage+getImageData
 *    数 alpha>0。
 *  - memory: desert-style4 —— "纯背景模拟 vs 含世界格实机帧"对比=苹果比橘子,
 *    暗像素追源必须先做"全关帧对照";模板匹配阈值必须够高(ncc=0.01 假峰)。
 *  - willReadFrequently:本框架读回画布一律是"创建→draw→read→丢弃"的一次性
 *    离屏 scratch(canvas-readback-flag-policy 判据),不碰生产热路径画布。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { front } from './browser.mjs';

/**
 * 屏幕区域取证。以世界像素(或 DOM overlay 选择器)定位,读回:
 *   { total, nonZero(alpha>0), nonBlack(rgb 和>30), ratio }
 * sentinel 非 0 = 活像素哨兵通过。overlay 优先(selector 传了就用 DOM 元素)。
 */
export async function litStats(page, { selector = null, wx = null, wy = null, w = 96, h = 96, zoom = null } = {}) {
  await front(page);
  return page.evaluate(({ selector, wx, wy, w, h, zoom }) => {
    const g = window.__swGame;
    let cv, sx = 0, sy = 0, sw = 0, sh = 0;
    if (selector) {
      const el = document.querySelector(selector);
      if (!el) return { why: 'no-overlay', total: 0, nonZero: 0, nonBlack: 0, ratio: 0 };
      cv = el;
      sx = 0; sy = 0; sw = el.width; sh = el.height;
    } else {
      cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
      if (!cv) return { why: 'no-canvas', total: 0, nonZero: 0, nonBlack: 0, ratio: 0 };
      const cam = g.camera;
      const [px, py] = cam.worldToScreen(wx, wy);
      const z = zoom ?? cam.zoom;
      sx = Math.max(0, Math.round(px - w * z / 2)); sy = Math.max(0, Math.round(py - h * z / 2));
      sw = Math.min(cv.width - sx, Math.round(w * z)); sh = Math.min(cv.height - sy, Math.round(h * z));
      if (sw <= 0 || sh <= 0) return { why: 'offscreen', total: 0, nonZero: 0, nonBlack: 0, ratio: 0 };
    }
    const c2 = document.createElement('canvas');   // 一次性读回 scratch(带 flag 合规)
    c2.width = sw; c2.height = sh;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    let nonZero = 0, nonBlack = 0;
    const total = sw * sh;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) nonZero++;
      if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++;
    }
    return { total, nonZero, nonBlack, ratio: +(nonBlack / Math.max(1, total)).toFixed(4) };
  }, { selector, wx, wy, w, h, zoom });
}

/** 整页截图(人工复核用;自动先 bringToFront)。 */
export async function savePageShot(page, path) {
  await front(page);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path }).catch((e) => { throw new Error(`[probe] page.screenshot 失败: ${e.message}`); });
  return path;
}

/** 游戏画布整帧落盘 PNG(dataURL 通道,不经 page.screenshot 的合成层)。 */
export async function saveCanvasShot(page, path) {
  await front(page);
  const data = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
    return cv ? cv.toDataURL('image/png') : null;
  });
  if (!data) throw new Error('[probe] 无游戏画布可截');
  mkdirSync(dirname(path), { recursive: true });
  await import('node:fs/promises').then((fs) => fs.writeFile(path, Buffer.from(data.split(',')[1], 'base64')));
  return path;
}

/** 任意 JSON 产物落盘(out 目录约定 /tmp/probe-out/<场景>/)。 */
export function saveJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
  return path;
}

export { join };
