// 卡死态单步解剖:在 x=2603 卡死态上手动单 tick 驱动,观测 vx 归零来源与 y 快照
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
  g.mountMinecartAt(2609, 1000, -1);
  await sleep(4000);   // 开到角格卡死
  const cart = g.minecart;
  const stuck = { x: +(cart.x / 16).toFixed(2), y: +(cart.y / 16).toFixed(2), vx: cart.vx, onTrack: cart.onTrackNow };
  // 单步解剖:复刻 Minecart.fixedUpdate 的碰撞段,分阶段读数
  const { trackCollision } = await import('/src/world/MinecartTrack.ts');
  const st = g.world.store;
  const steps = [];
  const r = { x: cart.x, y: cart.y, vx: -3, vy: 0, lastBoostX: cart.lastBoostX, lastBoostY: cart.lastBoostY };
  const w = 20, h = 42;
  // 阶段 1:纯 trackCollision
  const bits = trackCollision(st, r, w, h, false, false, 0, false, {});
  steps.push({ phase: 'after trackCollision', x: +(r.x / 16).toFixed(3), y: +(r.y / 16).toFixed(3), vx: r.vx, vy: r.vy, onTrack: !!(bits & 1) });
  // 阶段 2:积分
  r.x += r.vx; r.y += r.vy;
  steps.push({ phase: 'after integrate', x: +(r.x / 16).toFixed(3), y: +(r.y / 16).toFixed(3) });
  // 阶段 3:贴墙探针
  if (r.vx !== 0) {
    const headX = Math.floor((r.x + w / 2 + Math.sign(r.vx) * w / 2) / 16);
    const feetY = Math.floor((r.y + h - 4) / 16);
    const solid = st.inBounds(headX, feetY) ? st.isSolid(headX, feetY) : 'oob';
    steps.push({ phase: 'probe', headX, feetY, solid, tileAt: st.get(headX, feetY) });
    if (solid === true) { r.x -= r.vx; r.vx = 0; steps.push({ phase: 'probe REVERTED' }); }
  }
  // 周边格读数
  const around = {};
  for (const [dx, dy] of [[-1, 0], [-1, -1], [0, -1], [0, 0], [1, 0], [1, -1]]) {
    const tx = 2603 + dx, ty = 1000 + dy;
    around[`${tx},${ty}`] = `${st.get(tx, ty)}/${st.frameX[st.idx(tx, ty)]}/solid=${st.isSolid(tx, ty)}`;
  }
  return { stuck, steps, around, cartY: +(cart.y).toFixed(2), cartH: cart.h };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
