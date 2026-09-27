// ★BJ368 真实玩法扫描——鼠标按住连打 10s,游戏自跑循环,逐帧全屏白块扫描+截图
//  夜晚+DPR2;白块=200×200 tile 内近白像素>2500 的帧记名+落图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DPR = Number(process.env.SW_DPR ?? 2);
const NIGHT = process.env.SW_NIGHT !== '0';
const ARGS = ['--no-sandbox'];
if (process.env.SW_ANGLE === 'metal') ARGS.push('--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist');
const HEADLESS = process.env.SW_HEADED === '0';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: HEADLESS, args: ARGS, defaultViewport: { width: 1280, height: 800, deviceScaleFactor: DPR }, protocolTimeout: 300_000 });
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

const out = await page.evaluate(async (NIGHT) => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const O = { env: {} };
  const { options } = await import('/src/core/Options.ts');
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  await g.newWorld('bj368rp', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  if (NIGHT) g.world.clock.timeOfDay = 0.0;   // 午夜
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  p.statLife = p.statLifeMax2 ?? p.statLifeMax ?? 100;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  O.env = { dpr: window.devicePixelRatio, scale, canvasW: canvas.width, path: g.renderer.bglPathUsed, zoom: g.camera.zoom ?? null };

  // 全屏低频扫描:4px 步进,找近白/亮中性块
  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = canvas.width; scanCanvas.height = canvas.height;
  const sctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  const scan = () => {
    sctx.drawImage(canvas, 0, 0);
    const w = canvas.width, h = canvas.height;
    const d = sctx.getImageData(0, 0, w, h).data;
    const COLS = Math.ceil(w / 100), ROWS = Math.ceil(h / 100);
    const grid = new Array(COLS * ROWS).fill(0);
    const tgrid = new Array(COLS * ROWS).fill(0);
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        const i = (y * w + x) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        if (mx - mn < 30 && mn > 110) grid[Math.floor(y / 100) * COLS + Math.floor(x / 100)]++;
        if (Math.abs(r - 48) < 80 && Math.abs(gg - 248) < 80 && Math.abs(b - 171) < 80) tgrid[Math.floor(y / 100) * COLS + Math.floor(x / 100)]++;
      }
    }
    scan._t = tgrid;
    const hits = [];
    for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) {
      if (grid[gy * COLS + gx] > 250) hits.push({ gx, gy, n: grid[gy * COLS + gx], k: 'w' });
      if ((scan._t?.[gy * COLS + gx] ?? 0) > 250) hits.push({ gx, gy, n: scan._t[gy * COLS + gx], k: 't' });
    }
    return hits;
  };

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  const hits = [];
  const shots = [];
  // 真实循环跑 600 帧:按住鼠标 40 拍→松 20 拍循环(模拟连打)
  g.input.mouseHeld = true;
  let frame = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 12000 && frame < 900) {
    await new Promise((r) => requestAnimationFrame(r));
    frame++;
    const cyc = frame % 60;
    if (cyc === 0) { aim(p.cx + (Math.random() * 400 - 200), p.cy - 60 - Math.random() * 160); g.input.mouseDown = true; }
    if (cyc === 40) g.input.mouseDown = false;
    if (frame % 2 === 0) {
      const hs = scan();
      if (hs.length) {
        hits.push({ frame, blocks: hs });
        const c2 = document.createElement('canvas');
        c2.width = canvas.width; c2.height = canvas.height;
        c2.getContext('2d').drawImage(canvas, 0, 0);
        shots.push({ frame, dataURL: c2.toDataURL('image/png') });
      }
    }
    if (frame % 45 === 0) {
      const c2 = document.createElement('canvas');
      c2.width = canvas.width; c2.height = canvas.height;
      c2.getContext('2d').drawImage(canvas, 0, 0);
      shots.push({ frame, dataURL: c2.toDataURL('image/png') });
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  O.frames = frame;
  O.hitFrames = hits.length;
  O.hits = hits.slice(0, 12);
  O.headFinal = (() => {
    const h = g.entities.projectiles.find((q) => q.projId === 404);
    return h ? { x: Math.round(h.x), y: Math.round(h.y), st: h.st } : null;
  })();
  O.pathFinal = g.renderer.bglPathUsed;
  O.shimStats = g.renderer.bglShimStats ? g.renderer.bglShimStats() : null;
  O._shots = shots.slice(0, 16);
  return O;
}, NIGHT);

if (out && out._shots && out._shots.length) {
  const fs = await import('node:fs');
  for (const s of out._shots) fs.writeFileSync(`/tmp/bj368-rp-f${s.frame}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
}
const slim = { ...out, _shots: undefined };
console.log('BJ368_RP=' + JSON.stringify(slim, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
