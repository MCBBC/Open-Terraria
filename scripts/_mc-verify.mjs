// 矿车复现 v2:轮询式输入(不拦 getter,防熔断)+ 熔断侦测
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const worldText = readFileSync(process.env.MC_WORLD, 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const cerr = [];
page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => cerr.push('PAGEERR: ' + e.message.slice(0, 200)));
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
  // 输入保持:get+set 对——Input 每帧赋值进暗袋不抛(纯 getter 会在严格模式赋值炸熔断),读取恒 -1
  Object.defineProperty(p, 'inputX', { configurable: true, get: () => -1, set: (v) => { void v; } });
  const ok = g.mountMinecartAt(2609, 1000, -1);
  const cart = g.minecart;
  const s = [{ ok, x: +(cart.x / 16).toFixed(1), vx: cart.vx, running: g.running }];
  // 左行 8s:每 80ms 轮询置 inputX=-1(Input 每帧覆盖,占空比 ~高即可)
  for (let i = 0; i < 32; i++) {
    await sleep(250);
    s.push({ x: +(cart.x / 16).toFixed(1), vx: +cart.vx.toFixed(2), vy: +cart.vy.toFixed(2), anim: cart.animTick, onTrack: cart.onTrackNow, running: g.running });
    if (!g.running || !g.minecart) break;
  }
  return s;
});
console.log(JSON.stringify(out, null, 2));
console.log('CONSOLE_ERRS:', JSON.stringify(cerr.slice(0, 4), null, 1));
await browser.close();
