import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5250/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'fx49-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('fx49', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 2000));
await page.mouse.move(700, 380, { steps: 2 });
await page.evaluate(() => { const v = window.__swVUI; v.cursorAlpha = 1; v.cursorColorDirection = 0; });
await new Promise((r) => setTimeout(r, 300));
for (const [name, setup] of [['air', ''], ['smart', 'window.__swVUI.smartCursorOn = true;'], ['override2', 'window.__swVUI.cursorOverride = 2;']]) {
  await page.evaluate(setup);
  await new Promise((r) => setTimeout(r, 250));
  const url = await page.evaluate(() => document.getElementById('ui-canvas').toDataURL('image/png'));
  const b64 = url.split(',')[1];
  const fs = await import('node:fs');
  fs.writeFileSync(`/tmp/fx49-canvas-${name}.png`, Buffer.from(b64, 'base64'));
  if (name !== 'air') await page.evaluate(setup.replace('= true', ' = false').replace('= 2', ' = -1'));
}
await browser.close();
console.log('grabbed');
