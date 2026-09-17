import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await page.goto(ORIGIN + '/?play=small&bj109cl' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const g = window.__swGame;
  g.triggerLunarApocalypse();
  const st = g.world.store;
  const t = null;
  // 找平地
  for (let x = 200; x < 400; x++) {
    for (let y = 60; y < st.h - 40; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)
        && st.isSolid(x + 5, y) && !st.isSolid(x + 5, y - 1) && !st.isSolid(x + 5, y - 2) && !st.isSolid(x + 5, y - 3)) {
        g.player.x = x * 16 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        g.player.vy = 0;
        window.__spot = { px: (x + 5) * 16, py: y * 16, x, y };
        return;
      }
    }
  }
});
const spot = await page.evaluate(() => window.__spot);
console.log('spot:', JSON.stringify(spot));
await page.evaluate((s) => {
  const g = window.__swGame;
  const vs = g.vanillaSpawner ?? (g.vanillaSpawner = g.makeVanillaSpawner(g.world));
  const rng = { next: () => Math.random(), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) };
  window.__e = vs.spawnNPC(s.px, s.py, 415, rng);
}, spot);
for (const delay of [0, 300, 1000, 3000, 6000]) {
  await new Promise((r) => setTimeout(r, delay));
  console.log(delay, JSON.stringify(await page.evaluate(() => {
    const g = window.__swGame;
    const e = window.__e;
    return {
      inBucket: g.entities.enemies.some((x) => x === e),
      dead: e?.dead, hp: e?.hp, cy: e ? Math.round(e.cy) : null, vy: e ? +e.vy.toFixed(1) : null,
      ai2: e?.ai2, embed: e ? (() => { const st = g.world.store; return st.isSolid(Math.floor(e.cx / 16), Math.floor(e.cy / 16)); })() : null,
      total: g.entities.enemies.filter((x) => !x.dead).length,
    };
  })));
}
await browser.close();
