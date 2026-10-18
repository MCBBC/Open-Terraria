// drawImage 插桩:捕获 Waterfall_8 贴图(512×40)的所有绘制调用,按世界坐标还原
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = needInput(join(DOWNLOADS, 'map-12345世界 (1).json'));
const CX = 1485, CY = 590;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const save = readFileSync(SAVE, 'utf8');

async function attempt() {
  await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return await page.evaluate(async ([saveTxt, CX, CY]) => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 60000) {
      await new Promise((r2) => setTimeout(r2, 500));
    }
    const g = window.__swGame;
    if (!g?.player) return 'no game';
    const { loadSave } = await import('/src/save/SaveFile.ts');
    const { world, player } = loadSave(saveTxt);
    g.world = world;
    Object.assign(g.player, player);
    g.player.x = (CX + 8) * 16; g.player.y = (CY + 8) * 16;
    world.explored.fill(1); world.exploredVersion++;
    g.camera.x = CX * 16; g.camera.y = CY * 16;
    g.renderer.fullbright = true;
    g.lighting.liquidDirty = true;
    return 'ok';
  }, [save, CX, CY]);
}

let ok = null;
for (let att = 0; att < 12; att++) {
  try { ok = await attempt(); break; }
  catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log('load:', ok);
if (ok !== 'ok') { console.log('GAVE UP'); await browser.close(); process.exit(1); }

await new Promise((r2) => setTimeout(r2, 2500));
const diag = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.renderer && Date.now() - t0 < 30000) {
    await new Promise((r2) => setTimeout(r2, 300));
  }
  const g = window.__swGame;
  // 插桩:只抓 512×40 源(Waterfall_N 胶片条)
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const orig = cv.getContext('2d').drawImage.bind(cv.getContext('2d'));
  const calls = [];
  const c2 = cv.getContext('2d');
  c2.drawImage = function (img, ...rest) {
    try {
      if (img && img.width === 512 && img.height === 40) {
        // 9 参形式:img sx sy sw sh dx dy dw dh;用当前变换矩阵换算世界坐标
        const [sx, sy, sw, sh, dx, dy, dw, dh] = rest;
        const m = c2.getTransform();
        const wx = m.a * dx + m.c * dy + m.e;
        const wy = m.b * dx + m.d * dy + m.f;
        calls.push([sx, sy, sw, sh, wx, wy, dw, dh, c2.globalAlpha, m.a < 0]);
      }
    } catch { /* ignore */ }
    return orig(img, ...rest);
  };
  // 等一帧游戏渲染
  await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
  await new Promise((r2) => setTimeout(r2, 200));
  c2.drawImage = orig;
  // 相机信息供换算
  const cam = { x: g.camera.x, y: g.camera.y, w: cv.width, h: cv.height };
  return { calls, cam };
});
// 屏幕坐标 → 世界坐标(格)
const toTile = (px) => (px - diag.cam.w / 2) / 16 + diag.cam.x / 16;
const toTileY = (py) => (py - diag.cam.h / 2) / 16 + diag.cam.y / 16;
console.log('cam tile:', (diag.cam.x / 16).toFixed(1), (diag.cam.y / 16).toFixed(1));
for (const c of diag.calls) {
  const [sx, sy, sw, sh, dx, dy, dw, dh, a] = c;
  console.log(
    `src(${sx},${sy},${sw}x${sh}) dst[${toTile(dx).toFixed(1)},${toTileY(dy).toFixed(1)} ${dw}x${dh}] a=${a.toFixed(2)}`);
}
console.log('total:', diag.calls.length);
await browser.close();
