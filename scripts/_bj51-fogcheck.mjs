import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN + '/?play=small&bj51fog=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90 && !(await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 2000));
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const a = g.renderer.atlas;
  const r1 = a.ensureVImage('vanilla/Extra_245.png');
  await new Promise((res) => setTimeout(res, 1200));
  const r2 = a.ensureVImage('vanilla/Extra_245.png');
  const dims = (x) => x ? { w: x.width ?? x.drawWidth, h: x.height ?? x.drawHeight } : null;
  const resp = await fetch('sprites/vanilla/Extra_245.png').catch((e) => ({ err: String(e) }));
  return { first: dims(r1), after1s: dims(r2), fetch: resp.status ?? resp.err };
});
console.log(JSON.stringify(out));
await browser.close();
