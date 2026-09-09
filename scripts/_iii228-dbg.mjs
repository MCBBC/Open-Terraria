import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5284') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await page.evaluate(() => { globalThis.__III228DBG = true; });
const out = await page.evaluate(() => {
  const w = window.__swGame.world;
  const st = w.store;
  const R = [];
  // 洋面普查：x=40 与 x=4159 两列首个液体
  for (const x of [40, 45, 50, 4159, 4150]) {
    let firstLiq = -1, firstSolid = -1;
    for (let y = 40; y < 600; y++) {
      const i = st.idx(x, y);
      if (firstLiq < 0 && st.liquid[i] > 0) firstLiq = y;
      if (firstSolid < 0 && st.isSolid(x, y)) firstSolid = y;
    }
    R.push(`x=${x} firstLiquid=${firstLiq} firstSolid=${firstSolid}`);
  }
  // 直接跑一次搜索并埋点
  const sp = window.__swGame.vanillaSpawner ?? window.__swGame;
  const r = window.__swGame.requestMagicConchTeleportPosition(false);
  R.push('conch left = ' + JSON.stringify(r));
  const r2 = window.__swGame.requestMagicConchTeleportPosition(true);
  R.push('conch right = ' + JSON.stringify(r2));
  return R;
});
console.log(out.join('\n'));
await browser.close();
