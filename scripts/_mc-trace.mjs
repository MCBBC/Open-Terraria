// 逐 tick 追踪:真实世界+真实矿车,进左向坡全程 pre/post 状态对
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
  const p = g.player;
  Object.defineProperty(p, 'inputX', { configurable: true, get: () => -1, set: (v) => { void v; } });
  g.mountMinecartAt(2612, 1000, -1);
  const cart = g.minecart;
  cart.vx = -4;
  const log = [];
  const orig = cart.fixedUpdate.bind(cart);
  let tick = 0;
  cart.fixedUpdate = (dt, game) => {
    const pre = { x: +(cart.x / 16).toFixed(2), y: +(cart.y / 16).toFixed(3), vx: +cart.vx.toFixed(2), vy: +cart.vy.toFixed(2) };
    orig(dt, game);
    const post = { x: +(cart.x / 16).toFixed(2), y: +(cart.y / 16).toFixed(3), vx: +cart.vx.toFixed(2), vy: +cart.vy.toFixed(2), ot: cart.onTrackNow ? 1 : 0, wg: cart.onWrongGround ? 1 : 0 };
    log.push({ t: tick++, ...pre, ...post });
  };
  await sleep(5000);
  delete p.inputX;
  // 只保留坡附近(x<2610)与首尾
  const near = log.filter((e) => e.x < 2611 || e.t < 3);
  return { total: log.length, tail: log.slice(-6), near: near.slice(0, 80) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
