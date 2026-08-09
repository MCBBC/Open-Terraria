// saveGame 峰值复测(JS 堆 spike + 耗时),与修复前基线(144MB/147ms)对比
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--enable-precise-memory-info'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input', { timeout: 30000 }).catch(() => {});
await page.type('input', 'spike1').catch(() => {});
await page.evaluate(() => { const s = document.querySelector('select'); if (s) s.selectedIndex = 1; }).catch(() => {});
await page.click('button').catch(() => {});
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { saveGame } = await import('/src/save/SaveFile.ts');
  // 两轮:第一轮预热(GC 噪声),报告第二轮
  let results = [];
  for (let round = 0; round < 2; round++) {
    const before = performance.memory.usedJSHeapSize;
    const t0 = performance.now();
    const json = saveGame(g.world, g.player, 0);
    const ms = performance.now() - t0;
    const peak = performance.memory.usedJSHeapSize;
    void json;
    results.push({ ms: Math.round(ms), jsonMB: +(json.length / 1048576).toFixed(1), spikeMB: +((peak - before) / 1048576).toFixed(1) });
  }
  return { w: g.world.w, h: g.world.h, rounds: results };
});
console.log(JSON.stringify(out));
await browser.close();
