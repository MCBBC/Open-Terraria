// 一次性探针:白斜坡补差插桩(scripts/_mlfloor-debug.mjs)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'log') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('斜坡插桩');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const worldItem = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (worldItem) {
  await page.click('.sw-list-panel .sw-item');
} else {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2500));
// 插桩:包一层 applyMoonLordLightFloor
await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer);
  const orig = proto.applyMoonLordLightFloor;
  window.__floorCalls = [];
  proto.applyMoonLordLightFloor = function (...args) {
    const [entities] = args;
    const parts = entities.filter(n => n instanceof Object && [396, 397, 398, 400].includes(n.vanillaId) && !n.dead);
    window.__floorCalls.push({ n: parts.length, vids: parts.map(p => p.vanillaId) });
    return orig.apply(this, args);
  };
});
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.world.clock.timeOfDay = 0.95;
  g.toggleDebugGod();
  const spawned = g.summonBoss('moon_lord', { onPlayer: true });
  for (let i = 0; i < 10; i++) { await wait(1000); g.world.clock.timeOfDay = 0.95; }
  return {
    spawned,
    hasMethod: typeof Object.getPrototypeOf(g.renderer).applyMoonLordLightFloor,
    fullbright: g.renderer.fullbright,
    calls: window.__floorCalls.slice(-5),
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('mlfloor logs:', JSON.stringify(logs.filter(l => l.includes('mlfloor')).slice(0, 6)));
await browser.close();
