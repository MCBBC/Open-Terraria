// ★BJ368 浸泡测试——3 分钟连续战斗,亮度包络累积(逐像素 max),任何瞬态白块都会烧进包络
//  夜晚+真实循环+连打;结束导出包络图+白块统计
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SECONDS = Number(process.env.SW_SOAK ?? 150);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async (SECONDS) => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const O = {};
  const { options } = await import('/src/core/Options.ts');
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  await g.newWorld('bj368soak', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.0;
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  const work = document.createElement('canvas');
  work.width = canvas.width; work.height = canvas.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  // 包络(半分辨率)
  const EW = Math.ceil(canvas.width / 2), EH = Math.ceil(canvas.height / 2);
  const env = new Float32Array(EW * EH * 3);

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  g.input.mouseHeld = true;
  const t0 = performance.now();
  let frame = 0;
  let samples = 0;
  let maxWhiteBlock = 0;
  const whiteBlocks = [];
  while (performance.now() - t0 < SECONDS * 1000) {
    await new Promise((r) => requestAnimationFrame(r));
    frame++;
    const cyc = frame % 55;
    if (cyc === 1) { aim(p.cx + (Math.random() * 400 - 200), p.cy - 40 - Math.random() * 170); g.input.mouseDown = true; }
    if (cyc === 38) g.input.mouseDown = false;
    if (frame % 3 === 0) {
      wctx.drawImage(canvas, 0, 0);
      const d = wctx.getImageData(0, 0, canvas.width, canvas.height).data;
      samples++;
      for (let y = 0; y < EH; y++) {
        for (let x = 0; x < EW; x++) {
          const si = ((y * 2) * canvas.width + x * 2) * 4;
          const di = (y * EW + x) * 3;
          if (d[si] > env[di]) env[di] = d[si];
          if (d[si + 1] > env[di + 1]) env[di + 1] = d[si + 1];
          if (d[si + 2] > env[di + 2]) env[di + 2] = d[si + 2];
        }
      }
      // 逐帧白块计数(200px 步)
      const COLS = Math.ceil(canvas.width / 200), ROWS = Math.ceil(canvas.height / 200);
      const grid = new Float32Array(COLS * ROWS);
      for (let y = 0; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const si = (y * canvas.width + x) * 4;
          const r = d[si], gg = d[si + 1], b = d[si + 2];
          if (r >= 235 && gg >= 235 && b >= 235) grid[Math.floor(y / 200) * COLS + Math.floor(x / 200)]++;
        }
      }
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] > maxWhiteBlock) {
          maxWhiteBlock = grid[i];
          whiteBlocks.push({ frame, gx: i % COLS, gy: Math.floor(i / COLS), n: grid[i] });
        }
      }
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  // 导出包络
  const envCv = document.createElement('canvas');
  envCv.width = EW; envCv.height = EH;
  const ectx = envCv.getContext('2d');
  const ed = ectx.createImageData(EW, EH);
  for (let i = 0; i < EW * EH; i++) {
    ed.data[i * 4] = env[i * 3];
    ed.data[i * 4 + 1] = env[i * 3 + 1];
    ed.data[i * 4 + 2] = env[i * 3 + 2];
    ed.data[i * 4 + 3] = 255;
  }
  ectx.putImageData(ed, 0, 0);
  return {
    frame, samples, maxWhiteBlock, whiteBlocks: whiteBlocks.slice(-8),
    envURL: envCv.toDataURL('image/png'),
    path: g.renderer.bglPathUsed,
    pathStats: { ...g.renderer.bglPathStats },
  };
}, SECONDS);

if (out && out.envURL) {
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/bj368-soak-envelope.png', Buffer.from(out.envURL.split(',')[1], 'base64'));
}
const { envURL, ...slim } = out ?? {};
console.log('BJ368_SOAK=' + JSON.stringify(slim, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
