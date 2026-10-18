// 真实世界复现:载入用户存档(氙奇葩)→ 标记段(2602-2603,999-1000 上左坡)上车左行,
// 测正常速度是否爬得上坡(用户报:正常速度上不去,极高冲劲才行,下坡顺畅)
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WORLD = process.env.MC_WORLD ?? needInput(join(DOWNLOADS, 'map-氙奇葩 (5).json'));
const worldText = readFileSync(WORLD, 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

console.log('--- 注入世界存档 ---');
await page.evaluate(async (text) => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swLoadJson) && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 300));
  await window.__swLoadJson(text);
}, worldText);
// 等世界+玩家就绪
for (let i = 0; i < 120; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.world && window.__swGame?.player && !window.__swGame.world.generating)).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = 16;
  // 标记段核对
  const seg = {
    f7: st.frameX[st.idx(2603, 1000)], f5: st.frameX[st.idx(2602, 999)],
    flat: st.frameX[st.idx(2610, 1000)],
  };
  // 锁左输入(defineProperty getter 拦截 Input 每帧赋值)
  const p = g.player;
  Object.defineProperty(p, 'inputX', { configurable: true, get: () => -1, set: (v) => { void v; } });
  const run = async (startTx, startTy, vx0, label) => {
    if (g.minecart) { /* 已有车先下 */ }
    const ok = g.mountMinecartAt(startTx, startTy, -1);
    if (!ok) return { label, mountFail: true };
    const cart = g.minecart;
    cart.x = startTx * T + 8 - cart.w / 2;
    cart.y = startTy * T - cart.h;
    cart.vx = vx0; cart.vy = 0;
    p.x = cart.x; p.y = cart.y;
    const samples = [];
    for (let i = 0; i < 24; i++) {
      await sleep(250);
      samples.push({ t: (i + 1) * 0.25, x: +(cart.x / T).toFixed(1), y: +(cart.y / T).toFixed(1), vx: +cart.vx.toFixed(2) });
      if (!g.minecart) break;   // 下车/消亡
    }
    const climbed = g.minecart ? (g.minecart.x / T) < 2602.5 : samples.some((s) => s.x < 2602.5);
    // 下车复位输入
    delete p.inputX;
    if (g.minecart) { g.dismountMinecart(); }
    p.inputX = 0;
    return { label, climbed, samples };
  };
  const res = {};
  res.seg = seg;
  res.normal = await run(2609, 1000, -3, '正常速度 vx=-3');
  await sleep(500);
  res.boost = await run(2609, 1000, -9, '高冲 vx=-9');
  delete p.inputX;
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
