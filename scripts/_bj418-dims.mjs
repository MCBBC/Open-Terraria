import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5540';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small&bj418d=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__bj418d = { trace: false, dims: {} };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    w.trace = true;
    try { return origGrid(e); } finally { w.trace = false; }
  };
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  proto.drawImage = function (...rest) {
    if (w.trace) {
      const k = `${rest[1] ?? 'x'},${rest[2] ?? 'x'},${rest[3] ?? 'x'},${rest[4] ?? 'x'} -> ${rest[6] ?? '5a'},${rest[7] ?? '5a'} a=${Math.round((this.globalAlpha ?? 1) * 1000) / 1000}`;
      w.dims[k] = (w.dims[k] ?? 0) + 1;
    }
    return origDraw.apply(this, rest);
  };
  // 召唤 668 并钉玩家 1200px
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
await new Promise((r) => setTimeout(r, 1500));
const dims = await page.evaluate(() => window.__bj418d.dims);
console.log(JSON.stringify(dims, null, 1));
const img = await page.evaluate(async () => {
  const i = await window.__swGame.renderer.atlas.ensureVImage('vanilla/NPC_668.png');
  return i ? { w: i.width, h: i.height } : null;
});
console.log('NPC_668 img:', JSON.stringify(img));
await browser.close();
