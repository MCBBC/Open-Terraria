import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${(e.stack || e.message).slice(0, 400)}`));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const vids = ['vi_678_IronHelmet', 'vi_679_IronChainmail', 'vi_492_DemonWings', 'vi_3222_SolarFlareBreastplate',
    'vi_3572_ChlorophateDye', 'vi_237_PlayersHair'];
  const res = vids.map((v) => { let id; try { id = g.itemId(v); } catch (e) { id = 'THROW:' + String(e).slice(0, 60); } return `${v}→${id}`; });
  return { res, paused: !!document.body.textContent.includes('游戏线程异常已停机') };
});
console.log(JSON.stringify(out, null, 1));
console.log('LOGS', JSON.stringify(logs.slice(0, 8), null, 1));
await browser.close();
