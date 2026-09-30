import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5540';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small&bj418a=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__bj418a = { trace: false, rows: [] };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    w.trace = true;
    try { return origGrid(e); } finally { w.trace = false; }
  };
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  proto.drawImage = function (...rest) {
    if (w.trace && rest.length >= 9 && rest[3] > 210 && rest[3] < 226 && rest[4] > 234 && rest[4] < 248) {
      w.rows.push({ a: Math.round((this.globalAlpha ?? 1) * 10000) / 10000, args: rest.slice(1).map((v) => Math.round(v * 100) / 100) });
    }
    return origDraw.apply(this, rest);
  };
  g.debugClearEnemies();
  g.toggleSummonPanel?.();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div')?.click();
  g.summonPanel?.close();
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const p = g.player;
  p.x = e.cx - 1200; p.y = e.y + e.h - 60; p.vx = 0; p.vy = 0; p.iframes = 600;
  p.hp = p.maxHp ?? 500;
});
await new Promise((r) => setTimeout(r, 1200));
const rows = await page.evaluate(() => window.__bj418a.rows.splice(0));
console.log('n=', rows.length);
for (const row of rows.slice(0, 24)) console.log(JSON.stringify(row));
await browser.close();
