// 带端点探针的复现:开 trackDebugLog,抓 t=30 的 flag6 现场
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const worldText = readFileSync(process.env.MC_WORLD, 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(async (text) => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!window.__swLoadJson && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 300));
  await window.__swLoadJson(text);
}, worldText);
for (let i = 0; i < 120; i++) {
  if (await page.evaluate(() => !!(window.__swGame?.world && window.__swGame?.player)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mt = await import('/src/world/MinecartTrack.ts');
  const p = g.player;
  Object.defineProperty(p, 'inputX', { configurable: true, get: () => -1, set: (v) => { void v; } });
  g.mountMinecartAt(2612, 1000, -1);
  const cart = g.minecart;
  cart.vx = -4;
  const log = [];
  const orig = cart.fixedUpdate.bind(cart);
  let tick = 0;
  let debugOn = false;
  let dbg = [];
  cart.fixedUpdate = (dt, game) => {
    const preX = cart.x / 16, preVx = cart.vx;
    if (debugOn) { mt.trackDebugOn(); dbg = mt.trackDebugLog; }
    orig(dt, game);
    if (debugOn && dbg.length) log.push({ t: tick, x: +preX.toFixed(2), vx: +preVx.toFixed(2), events: dbg.splice(0) });
    if (debugOn) mt.trackDebugOff();
    const postX = cart.x / 16;
    if (!debugOn && preX < 2604.2 && postX >= 2603.4) { debugOn = true; log.push({ t: tick, mark: 'approaching corner' }); }
    if (debugOn && cart.vx === 0) { log.push({ t: tick, mark: 'STUCK', x: +postX.toFixed(2) }); return; }
    tick++;
  };
  for (let i = 0; i < 300; i++) { await sleep(16); if (log.some((e) => e.mark === 'STUCK')) break; }
  delete p.inputX;
  return log;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
