// ★BJ367 SW/加载链检查——页面内 fetch Image 双路验证 404 贴图可达性
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('fail') || t.includes('404') || t.includes('bitmap')) console.log('CONSOLE', t.slice(0, 220)); });
page.on('requestfailed', (r) => { if (r.url().includes('404') || r.url().includes('Chain')) console.log('REQFAIL', r.url().slice(-60), r.failure()?.errorText); });
page.on('response', (r) => { if (r.url().includes('Projectile_404') || r.url().includes('Chain37')) console.log('RESP', r.status(), r.url().slice(-50)); });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const sws = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
  const keys = typeof caches !== 'undefined' ? await caches.keys() : [];
  let swHas404 = null, swHas405 = null, cacheNames = [];
  for (const cn of keys) {
    const c = await caches.open(cn);
    const reqs = await c.keys();
    cacheNames.push({ cn, n: reqs.length });
    const p404 = reqs.filter((r) => r.url.includes('Projectile_404')).length;
    const p405 = reqs.filter((r) => r.url.includes('Projectile_405')).length;
    if (p404 || p405) cacheNames.push({ cn, p404, p405 });
  }
  // 直接 fetch
  let fetchStat = null;
  try { const r = await fetch('sprites/vanilla/Projectile_404.png'); fetchStat = { status: r.status, len: (await r.blob()).size }; } catch (e) { fetchStat = String(e); }
  // Image 加载
  const imgLoad = await new Promise((res) => {
    const im = new Image();
    const t0 = Date.now();
    im.onload = () => res({ ok: true, ms: Date.now() - t0, w: im.naturalWidth });
    im.onerror = () => res({ ok: false, ms: Date.now() - t0 });
    im.src = 'sprites/vanilla/Projectile_404.png?v=' + Date.now();
  });
  return { swCount: sws.length, cacheNames, fetchStat, imgLoad };
});
console.log('SWCHECK=' + JSON.stringify(out, null, 1));
await browser.close();
