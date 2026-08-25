// 移动态坐骑状态取证：骑乘→按住右移，逐 160ms dump 坐骑状态 + 截图
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

const dump = `(() => {
  const g = window.__swGame, p = g.player, m = p.mount;
  return JSON.stringify({ riding: p.ridingMount, type: m.type, fs: m.frameState, frame: m.frame,
    fr: +m.fullRotation.toFixed(3), ring: +m.outerRingRotation.toFixed(3), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
    og: p.onGround, facing: p.facing, x: +p.x.toFixed(0), y: +p.y.toFixed(0) });
})()`;

await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  for (let i = 0; i < 90 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
  const fx = Math.floor(p.cx / 16), fy = Math.floor((p.y + p.h) / 16);
  for (let dx = -20; dx <= 40; dx++) { st.setTile(fx + dx, fy, 1, 0, 0); for (let dy = 1; dy <= 6; dy++) st.setTile(fx + dx, fy - dy, 0); }
  await sleep(300);
  const key = Object.keys(items).find(k => /^vi_2768_/.test(k));
  inv.add(items[key], 1);
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items[key]) { inv.selected = i; break; }
  g.input.mouseDown = true; await sleep(300); g.input.mouseDown = false; await sleep(300);
});
console.log('idle:', await page.evaluate(dump));
await page.evaluate(() => { window.__swGame.input.keys.add('KeyD'); });
for (let i = 0; i < 8; i++) {
  await new Promise(r => setTimeout(r, 160));
  console.log(`move${i}:`, await page.evaluate(dump));
  if (i === 1 || i === 4) await page.screenshot({ path: `/tmp/dcu-mv${i}.png` });
}
await page.evaluate(() => { window.__swGame.input.keys.delete('KeyD'); });
await browser.close();
