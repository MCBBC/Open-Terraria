// DCU 舱体贴图视觉取证：骑乘后 静止/移动/开火 三态各截一张（地表）+ 地底一张
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  for (let i = 0; i < 90 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
  const fx = Math.floor(p.cx / 16), fy = Math.floor((p.y + p.h) / 16);
  for (let dx = -12; dx <= 12; dx++) { st.setTile(fx + dx, fy, 1, 0, 0); for (let dy = 1; dy <= 6; dy++) st.setTile(fx + dx, fy - dy, 0); }
  await sleep(300);
  const key = Object.keys(items).find(k => /^vi_2768_/.test(k));
  inv.add(items[key], 1);
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items[key]) { inv.selected = i; break; }
  g.input.mouseDown = true; await sleep(300); g.input.mouseDown = false; await sleep(300);
  window.__dcuState = 'idle';
});
await page.screenshot({ path: '/tmp/dcu-idle.png' });
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  g.input.keys.add('KeyD');
  window.__dcuState = 'moving';
  await sleep(120);
});
// 跟随镜头连拍 3 张移动态
for (const n of ['move1', 'move2']) {
  await new Promise(r => setTimeout(r, 160));
  await page.screenshot({ path: `/tmp/dcu-${n}.png` });
}
await page.evaluate(() => { const g = window.__swGame; g.input.keys.delete('KeyD'); });
await new Promise(r => setTimeout(r, 300));
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 停稳后开火（对准右侧地面）
  for (let i = 0; i < 40 && !(Math.abs(p.vx) < 0.5); i++) await sleep(30);
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const [sx, sy] = g.camera.worldToScreen(p.cx + 120, p.cy + 40);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseDown = true;
  window.__dcuState = 'firing';
  await sleep(700);
});
await page.screenshot({ path: '/tmp/dcu-firing.png' });
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
// 地底
await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const uy = Math.floor(g.world.groundLevel) + 40;
  const ux = Math.floor(p.cx / 16);
  for (let dx = -6; dx <= 6; dx++) for (let dy = -4; dy <= 4; dy++) st.setTile(ux + dx, uy + dy, 0);
  for (let dx = -7; dx <= 7; dx++) { st.setTile(ux + dx, uy + 5, 1, 0, 0); st.setTile(ux + dx, uy - 5, 1, 0, 0); }
  for (let dy = -4; dy <= 4; dy++) { st.setTile(ux - 7, uy + dy, 1, 0, 0); st.setTile(ux + 7, uy + dy, 1, 0, 0); }
  p.x = ux * 16; p.y = uy * 16; p.vx = 0; p.vy = 0; p.fallStartY = null;
  await sleep(800);
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const [sx, sy] = g.camera.worldToScreen(p.cx + 120, p.cy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseDown = true;
  await sleep(700);
});
await page.screenshot({ path: '/tmp/dcu-underground.png' });
console.log('screenshots done');
await browser.close();
