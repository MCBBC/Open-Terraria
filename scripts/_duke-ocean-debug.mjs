import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const options = await import('/src/core/Options.ts');
  for (let i = 0; i < 100; i++) { if (options.options?.data) { options.options.data.renderMode = 'cpu'; return; } await new Promise(r => setTimeout(r, 50)); }
});
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => document.querySelector('[data-act=sp]')?.click());
await page.waitForSelector('.sw-vsel', { timeout: 20000 });
await new Promise(r => setTimeout(r, 500));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-vsel .sw-vitem'));
if (!hasChar) {
  await page.evaluate(() => document.querySelector('.sw-vsel [data-act=new]')?.click());
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('DBG');
  await page.evaluate(() => document.querySelector('[data-act=create]')?.click());
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 20000 });
}
await page.evaluate(() => document.querySelector('.sw-vsel .sw-vitem .sw-vitem-btns img')?.click());
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-vsel .sw-vitem'));
if (!hasWorld) {
  await page.evaluate(() => document.querySelector('.sw-vsel [data-act=new]')?.click());
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('[data-f=seed]')?.click());
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await page.evaluate(() => document.querySelector('[data-act=create]')?.click());
} else {
  await page.evaluate(() => document.querySelector('.sw-vsel .sw-vitem .sw-vitem-btns img')?.click());
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const runs = [];
  for (let y = Math.max(5, g.world.groundLevel - 60); y < Math.min(st.h - 5, g.world.groundLevel + 120); y += 5) {
    let x = 1, best = null;
    while (x < 500) {
      if (st.liquid[st.idx(x, y)] > 60) {
        let e = x; while (e < 500 && st.liquid[st.idx(e, y)] > 60) e++;
        if (!best || e - x > best.run) best = { x, run: e - x };
        x = e;
      } else x++;
    }
    if (best) runs.push({ y, ...best });
  }
  return { w: st.w, h: st.h, gl: g.world.groundLevel, runs: runs.slice(0, 14) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
