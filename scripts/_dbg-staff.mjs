import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.setupDevMode();
  const inv = g.player.inv;
  const shoots = {};
  for (let i = 0; i < 50; i++) {
    const it = inv.slots[i];
    if (!it) continue;
    const def = it.def ?? {};
    if (def.shoot) shoots[def.shoot] = (shoots[def.shoot] ?? 0) + 1;
  }
  // 也查 ITEM_DEFS 全表（不经背包）
  return { shoots, sample: Object.entries(shoots).slice(0, 5) };
});
console.log(JSON.stringify(out).slice(0, 400));
await browser.close();
