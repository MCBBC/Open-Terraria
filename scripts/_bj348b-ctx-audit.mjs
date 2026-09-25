// ★BJ348b ctx 状态审计探针（数据面）——帧尾审计各画布 ctx 的
// filter/globalCompositeOperation/globalAlpha/transform 残留 + worldCanvas 颜色度量。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5213', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('bj348ba', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  let groundY = -1;
  const pcol0 = Math.trunc(4200 * 8);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  const c0 = groundY >= 0 ? pcol0 : Math.trunc(p.x / 16);
  if (groundY < 0) for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  p.x = c0 * 16; p.y = groundY * 16 - p.h;
  p.vx = 0; p.vy = 0;
  p.baseMaxMana = 400; p.mana = 400;
  const r = g.renderer;
  const ctxs = {};
  const addCtx = (tag, cv) => { try { if (cv) ctxs[tag] = cv.getContext('2d'); } catch { /* ignore */ } };
  addCtx('main', r.canvas);
  addCtx('world', r.worldCanvas);
  addCtx('light', r.lightMaskCanvas);

  const audit = () => {
    const bad = [];
    for (const [tag, c] of Object.entries(ctxs)) {
      if (!c) continue;
      if (c.filter !== 'none') bad.push(`${tag}.filter=${c.filter}`);
      if (c.globalCompositeOperation !== 'source-over') bad.push(`${tag}.gco=${c.globalCompositeOperation}`);
      if (c.globalAlpha !== 1) bad.push(`${tag}.ga=${c.globalAlpha}`);
      const m = c.getTransform();
      if (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1) bad.push(`${tag}.tf=${m.a},${m.b},${m.c},${m.d},${m.e.toFixed(1)},${m.f.toFixed(1)}`);
    }
    return bad;
  };
  const colorStat = () => {
    const wc = r.worldCanvas;
    if (!wc) return null;
    const ww = wc.width, wh = wc.height;
    const c = wc.getContext('2d');
    const d = c.getImageData(Math.floor(ww * 0.3), Math.floor(wh * 0.35), Math.floor(ww * 0.4), Math.floor(wh * 0.3)).data;
    let sky = 0, tile = 0, transparent = 0, other = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      n++;
      if (d[i + 3] < 16) { transparent++; continue; }
      const rr = d[i], gg = d[i + 1], b = d[i + 2];
      if (b > 150 && b > rr + 30 && gg > 100) sky++;
      else if (rr + gg + b > 90) tile++;
      else other++;
    }
    return { transparent, sky, tile, other, n };
  };
  const step = (n2) => { for (let i = 0; i < n2; i++) { g.fixedUpdate(1 / 60); g.render(); } };
  const log = [];
  step(30);
  log.push({ phase: 'baseline', audit: audit(), world: colorStat() });

  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  if (!key3476) return { fail: 'item-key-3476-missing' };
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60);
  const scr = g.camera.worldToScreen ? g.camera.worldToScreen(p.cx + 200, p.cy - 6) : [600, 380];
  g.input.mouseX = scr[0] ?? 600; g.input.mouseY = scr[1] ?? 380;
  let firstBadFrame = -1;
  for (let f = 0; f < 150; f++) {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60); g.render();
    g.input.mouseDown = false;
    const bad = audit();
    if (bad.length && firstBadFrame < 0) {
      firstBadFrame = f;
      log.push({ phase: `firstBad f${f}`, bad });
    }
    if (f % 50 === 49) log.push({ phase: `use f${f + 1}`, bad: bad.length, world: colorStat() });
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  step(60);
  log.push({ phase: 'released', audit: audit(), world: colorStat() });
  return { accMode: r._accMode, firstBadFrame, log };
});
console.log(JSON.stringify(out, null, 1));
console.error('pageErrors:', JSON.stringify(pageErrors.slice(0, 5)));
await browser.close();
