// _terraprisma-debug:召不出问题定位(点击链路逐级探)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5212') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const key = Object.keys(window.__swItems).find((k) => /^vi_5005_/.test(k));
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0;
  p.useTime = 0;
  p.mana = 100;
  const before = g.entities.projectiles.length;
  g.input.mouseDown = true;
  g.input.mouseHeld = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  g.input.mouseHeld = false;
  await new Promise((r) => setTimeout(r, 300));
  const projs = g.entities.projectiles.map((q) => ({ cls: q.constructor.name, pid: q.projId, dead: q.dead }));
  return {
    key,
    before, after: g.entities.projectiles.length,
    projs: projs.slice(-6),
    useTime: p.useTime,
    minions: projs.filter((q) => q.cls === 'MinionProj'),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
