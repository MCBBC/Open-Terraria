import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) { try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; } catch { if (i === 9) throw new Error('sp failed'); } }
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ41b');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('1');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else { await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img'); }
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const worldSurface = g.world.groundLevel;
  const px = Math.floor(g.player.cx / 16);
  const cy = Math.min(g.world.store.h - 396 - 40, Math.ceil(worldSurface + 84) + 60);
  const W = 32, AIRH = 8, LIQH = 16;
  const x0 = px - W / 2, x1 = px + W / 2;
  for (let x = x0; x <= x1; x++) {
    for (let y = cy - AIRH; y <= cy + LIQH + 2; y++) st.setTile(x, y, 0);
    for (let y = cy; y < cy + LIQH; y++) st.setLiquid(x, y, 255, 4);
    st.setTile(x, cy + LIQH + 1, 1, 0, 0); st.setTile(x, cy + LIQH + 2, 1, 0, 0);
  }
  for (let y = cy - AIRH; y <= cy + LIQH; y++) { st.setTile(x0 - 1, y, 1, 0, 0); st.setTile(x1 + 1, y, 1, 0, 0); }
  g.player.x = px * 16; g.player.y = (cy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  if (g.player.position) { g.player.position.x = px * 16; g.player.position.y = (cy - 4) * 16; }
  await new Promise((r) => setTimeout(r, 3500));
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  await new Promise((r) => setTimeout(r, 300));
  return { zoneShimmer: g.scene?.zoneShimmer, alpha: g.renderer?.monoFilters?.shimmerAlpha };
});
console.log(JSON.stringify(out));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/bj41-aether-clean.png' });
await browser.close();
