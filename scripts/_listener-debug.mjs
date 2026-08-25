// 监听器链最小验证
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const g = window.__swGame;
  const st = g.world.store;
  let fired = 0;
  st.onTileChanged((x, y) => { fired++; });
  const X = g.world.spawnX + 12;
  const Y = Math.floor(g.world.groundLevel);
  st.setTile(X, Y - 8, 0, 0, 0);
  return {
    listenersRegistered: st.listeners ? st.listeners.length : 'n/a',
    myListenerFired: fired,
    sandQueueAfter: g.sandQueue?.length ?? 'n/a',
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
