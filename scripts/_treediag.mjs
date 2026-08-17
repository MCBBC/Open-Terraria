import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 300));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('树诊');
  await new Promise(r => setTimeout(r, 150));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 150));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const t5 = { total: 0, fyGt198: 0, fx: {}, fy: {} };
  const samples = [];
  const ptx = Math.floor(g.player.cx / 16);
  for (let x = 5; x < st.w - 5; x++) {
    for (let y = 4; y < st.h - 5; y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== 5) continue;
      t5.total++;
      t5.fx[st.frameX[i]] = (t5.fx[st.frameX[i]] ?? 0) + 1;
      t5.fy[st.frameY[i]] = (t5.fy[st.frameY[i]] ?? 0) + 1;
      if (st.frameY[i] >= 198) {
        t5.fyGt198++;
        if (samples.length < 8) samples.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
      }
    }
  }
  return { t5, samples, grass: Math.floor(g.world.groundLevel), spawnX: ptx };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
