import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on('pageerror', (e) => errors.push(e.message));
const errors = [];
await page.goto(ORIGIN + '/?play=small&bj213g' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 9500));
const info = await page.evaluate(() => {
  const out = [];
  for (const e of document.body.children) {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    out.push({
      tag: e.tagName, cls: (e.className ?? '').toString().slice(0, 60), id: e.id,
      z: cs.zIndex, pe: cs.pointerEvents, pos: cs.position,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      childCount: e.children.length,
      html0: e.outerHTML.slice(0, 120),
    });
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
console.log('errors:', JSON.stringify(errors));
await browser.close();
