import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch {} });
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'wedonteventestforthat', size: 0, name: 'iii227c', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
let ok = false;
const t1 = Date.now();
while (Date.now() - t1 < 420000) {
  ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const rep = await page.evaluate(() => {
  const world = globalThis.__swGame.world;
  let total = 0, eligible = 0, withGunRaw = 0, gunSlots = [];
  for (const chest of world.chests) {
    if (!chest) continue;
    total++;
    const it1 = chest.items[1];
    if (!it1 || it1.stack === 0) continue;
    eligible++;
    for (let k = 0; k < chest.items.length; k++) {
      const it = chest.items[k];
      if (it && it.id === 4273 && it.stack > 0) { withGunRaw++; gunSlots.push({ cx: chest.x, cy: chest.y, slot: k, stack: it.stack }); break; }
    }
  }
  return { total, eligible, withGunRaw, gunSlots: gunSlots.slice(0, 6), itemsLenSample: world.chests.slice(0, 3).map((c) => c.items.length) };
});
console.log(JSON.stringify(rep));
await browser.close();
