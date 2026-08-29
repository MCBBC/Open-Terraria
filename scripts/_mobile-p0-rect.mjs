// 一次性:控件 rect/样式实测(vs CSS 声明)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 2600));
const out = await page.evaluate(() => {
  const pick = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { sel, rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      cssLeft: cs.left, cssBottom: cs.bottom, cssTop: cs.top, opacity: cs.opacity, z: cs.zIndex };
  };
  const mr = window.__swGame?.renderer?.minimapRect ?? null;
  return {
    vw: innerWidth, vh: innerHeight,
    minimapRect: mr,
    items: [
      pick('.sw-mjoy'), pick('.sw-matk'), pick('.sw-mjump'), pick('.sw-mpause'),
      pick('.sw-msys'), pick('.sw-mpot'), pick('.sw-mfs'), pick('.sw-hotbar'),
    ],
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
