// 一次性:菜单 cots 诊断——设 time 后逐秒读 vTime/clockTime/cots,确认 rAF 活性与时基
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100 && !await page.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await new Promise((r) => setTimeout(r, 1000));
for (let i = 0; i < 120; i++) {
  if (await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const read = () => page.evaluate(() => {
  const mb = window.__swMenuBg;
  return { vTime: Math.round(mb.vTime), dayTime: mb.dayTime, clock: +mb.clockTime().toFixed(4), cots: mb.sky.cots?.map((v) => Math.round(v)) };
});
console.log('boot:', JSON.stringify(await read()));
await page.evaluate(() => { const mb = window.__swMenuBg; mb.dayTime = true; mb.vTime = 46500; });
for (let k = 0; k < 5; k++) {
  await new Promise((r) => setTimeout(r, 1000));
  console.log(`+${k + 1}s:`, JSON.stringify(await read()));
}
await browser.close();
