import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/spawn-profile',
  args: ['--no-first-run'], defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const ret = g.spawnEnemy('slime_green', 383 * 16, 250 * 16);
  const list = g.enemies;
  return { retType: typeof ret, retKey: ret?.key ?? null, count: list?.length,
    first: list?.[0] ? { key: list[0].key, x: list[0].x, y: list[0].y, dead: list[0].dead } : null,
    enemiesIsArray: Array.isArray(list) };
});
console.log(JSON.stringify(out));
await new Promise((r) => setTimeout(r, 2000));
const out2 = await page.evaluate(() => {
  const g = window.__swGame;
  return { count: g.enemies?.length, first: g.enemies?.[0] ? { y: g.enemies[0].y, dead: g.enemies[0].dead, hp: g.enemies[0].hp } : null,
    tint: g.renderer.tintAtlas ? { e: g.renderer.tintAtlas.size, p: g.renderer.tintAtlas.pageCount } : null };
});
console.log(JSON.stringify(out2));
await browser.close();
