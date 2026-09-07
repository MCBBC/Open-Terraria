// 冒烟：确认合成世界装载链可用（BJ15 探针底座）
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 120000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.on('console', (m) => console.log('  [console]', m.text().slice(0, 200)));
console.log('goto', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('goto done');
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
console.log('flow ready');
const ok = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 1200, H = 400;
  const world = new World(W, H, 777, 'bj15-probe');
  world.spawnX = 600; world.spawnY = 170;
  world.groundLevel = 160; world.rockLevel = 260; world.lavaLine = 340;
  for (let x = 0; x < W; x++) {
    for (let y = 165; y < 190; y++) world.store.setTile(x, y, 1);
    for (let y = 190; y < H; y++) world.store.setTile(x, y, 2);
    world.store.setTile(x, 164, 3);
  }
  const parts = sf.buildSaveParts(world);
  const json = sf.serializeSave(parts.view, parts.meta, parts.player, 0);
  console.log('[bj15] json size', json.length);
  await window.__swFlow.loadJson(json);
  return 'loaded';
});
console.log('loadJson:', ok);
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 60000 });
console.log('game ready, player at', await page.evaluate(() => { const g = window.__swGame; return [g.player.cx, g.player.cy]; }));
await browser.close();
console.log('smoke done');
