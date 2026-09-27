// ★Ring3 附随判别：那一排"蓝珠"是否与 618 无关（空手不施法对照拍）。
// 运行：SW_ORIGIN=http://localhost:5238 node tools/run-diag.mjs scripts/_nb618-discrim.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5238', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
// 空手世界，不施法、不装机——只等待实时渲染
await page.evaluate(async () => {
  const g = window.__swGame;
  await g.newWorld('nb618disc', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
});
await new Promise((r) => setTimeout(r, 5000));
const snap = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    projs: g.entities.projectiles.length,
    dust: (g.vanillaDust?.pool ?? []).filter((d) => d?.active).length,
    timeOfDay: g.world?.timeOfDay ?? g.world?.store?.timeOfDay ?? null,
  };
});
console.log('[disc] snapshot', JSON.stringify(snap));
await page.screenshot({ path: '/tmp/nb618-discrim.png' });
console.log('[disc] saved /tmp/nb618-discrim.png');
await browser.close().catch(() => {});
process.exit(0);
