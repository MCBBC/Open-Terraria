import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__swGame && window.__swGame.player) {
      clearInterval(iv);
      (async () => {
        const g = window.__swGame;
        await new Promise((r2) => setTimeout(r2, 1000));
        const { Enemy } = await import('/src/entities/Enemy.ts');
        const bosses = [4, 50, 266, 35, 222, 125, 127, 134, 262, 370, 398, 439, 636, 657];
        const out = [];
        for (const id of bosses) {
          const e = Enemy.fromVanilla(id, g.player.cx + 400, g.player.cy - 400);
          if (!e) { out.push([id, 'fail']); continue; }
          out.push([id, e.vanilla?.name ?? '?', 'w=' + e.w, 'h=' + e.h, 'defW=' + e.def.width, 'defH=' + e.def.height]);
          e.dead = true;
        }
        res(out);
      })();
    } else if (Date.now() - t0 > 120000) { clearInterval(iv); res('timeout'); }
  }, 250);
}));
console.log(JSON.stringify(r, null, 1));
await browser.close();
