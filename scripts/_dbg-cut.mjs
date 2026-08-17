import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const mod = await import('/src/data/tiles.ts');
  const px = Math.floor(g.player.cx / 16) + 6;   // 玩家旁 6 格(不叠实体)
  let py = Math.floor(g.player.cy / 16);
  while (py < st.h - 4 && st.type[st.idx(px, py)] !== 0) py++;  // 找空格
  for (const key of ['v_3_forest_short_plants', 'v_185_small_decos']) {
    const tid = mod.TILE_BY_KEY[key];
    st.setTile(px, py, tid, 0, 0);
    g.cutTile(px, py);
    console.log(key, 'tid=', tid, 'cleared=', st.get(px, py) === 0);
  }
});
await browser.close();
