import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const { projSprite } = await import('/src/entities/Arrow.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const g = window.__swGame;
  projSprite(1094); projSprite(1113);
  for (let i = 0; i < 100 && !projSprite(1094); i++) await new Promise((r) => setTimeout(r, 100));
  const mk = (id, dx) => { const m = new MinionProj(g.player.cx + dx, g.player.cy - 60, id, 10, 1, false, 0, false, () => (g.player.dead ? null : g.player)); g.entities.add(m, 'projectiles'); return m; };
  mk(1094, -80); mk(1113, 80);
  await new Promise((r) => setTimeout(r, 2000));
  return (g.entities.projectiles ?? []).filter((m) => m && (m.projId === 1094 || m.projId === 1113))
    .map((m) => ({ id: m.projId, frame: m.foxFrame ?? null, onGround: m.onGround, x: Math.round(m.cx - g.player.cx), y: Math.round(m.cy - g.player.cy), dead: m.dead }));
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.length, errors.slice(0, 3));
await browser.close();
