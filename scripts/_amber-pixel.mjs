// 一次性诊断：宝石树渲染像素色相分类 + Tree_Tops_N 素材主色对照
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_amber-pixel.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 120 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未就绪'); process.exit(1); }

// 传送到蓝宝石树(2209,974)附近
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 2209 * 16; g.player.y = (974 - 6) * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
});
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  // 相机像素 → 屏幕像素
  const cam = g.camera;
  const toScreen = (wx, wy) => {
    const z = cam.zoom ?? 1;
    return [ (wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z ];
  };
  // 采样树冠区域: tile(2208..2211, 972..978) 的屏幕包围盒
  const [x0, y0] = toScreen(2207 * 16, 971 * 16);
  const [x1, y1] = toScreen(2212 * 16, 979 * 16);
  const r0 = cv.getBoundingClientRect();
  const sx = Math.max(0, Math.floor(x0)), sy = Math.max(0, Math.floor(y0));
  const sw = Math.min(cv.width - sx, Math.ceil(x1 - x0)), sh = Math.min(cv.height - sy, Math.ceil(y1 - y0));
  const data = ctx2.getImageData(sx, sy, Math.max(1, sw), Math.max(1, sh)).data;
  const hueCount = { blue: 0, amber: 0, green: 0, red: 0, purple: 0, cyan: 0, white: 0, dark: 0, other: 0 };
  const samples = [];
  for (let i = 0; i < data.length; i += 4) {
    const [rr, gg, bb, aa] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (aa < 40) continue;
    const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
    if (samples.length < 8 && aa > 200 && mx - mn > 60) samples.push([rr, gg, bb]);
    if (mx < 40) { hueCount.dark++; continue; }
    if (mx - mn < 25) { hueCount[mx > 200 ? 'white' : 'other']++; continue; }
    if (bb > rr && bb > gg) hueCount.blue++;
    else if (rr > 200 && gg > 110 && gg < 200 && bb < 110) hueCount.amber++;
    else if (gg > rr && gg > bb) hueCount.green++;
    else if (rr > gg && rr > bb) hueCount.red++;
    else if (rr > 100 && bb > 100 && gg < rr && gg < bb) hueCount.purple++;
    else if (gg > 180 && bb > 180 && rr < 150) hueCount.cyan++;
    else hueCount.other++;
  }
  // Tree_Tops_22..31 主色
  const domColor = async (n) => {
    const img = new Image();
    img.src = `/sprites/vanilla/Tree_Tops_${n}.png`;
    await img.decode().catch(() => null);
    if (!img.width) return null;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height).data;
    let r = 0, g = 0, b = 0, npx = 0;
    for (let i = 0; i < d.length; i += 16) {
      if (d[i + 3] < 100) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; npx++;
    }
    return npx ? [Math.round(r / npx), Math.round(g / npx), Math.round(b / npx)] : null;
  };
  const tops = {};
  for (const n of [22, 23, 24, 25, 26, 27, 28]) tops[n] = { avg: await domColor(n) };
  return { region: [sx, sy, sw, sh], hueCount, samples, tops };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 5));
await browser.close();
