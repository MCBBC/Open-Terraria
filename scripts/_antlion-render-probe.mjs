// 蚁狮渲染复现：刷 69 于沙面 → 截图 + dump 位置/帧/渲染矩形
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5219';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 140)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('蚁狮');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  // 找沙漠地面（天然地形传送到出生点附近即可——出生点大概率不是沙漠,用玩家脚下平地代替）
  const p = g.player;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  // 在玩家旁边放一块 6 宽平台当地面
  for (let x = px + 3; x < px + 9; x++) for (let y = py + 3; y < py + 6; y++) g.world.store.setTile(x, y, 0);
  for (let x = px + 3; x < px + 9; x++) g.world.store.setTile(x, py + 3, 1);
  const e = g.spawnNpcByVanilla(69, (px + 5) * 16 + 8, (py + 1) * 16);
  if (!e) return { fail: 'spawn failed' };
  for (let i = 0; i < 120; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  // 渲染矩形换算（帧中心钉 Center）
  const cam = g.camera;
  const z = cam.zoom || 1;
  const dpr = g.renderer.dpr || 1;
  const fr = g.renderer.atlas.vnpc(69, e.frame ?? 0);
  return {
    cx: e.cx, cy: e.cy, x: e.x, y: e.y, w: e.w, h: e.h,
    frame: e.frame, frameIdx: e.frame, visAngle: e.visAngle,
    frSize: fr ? [fr.sw, fr.sh] : null,
    screen: { sx: Math.round((e.cx - cam.x) * z + canvas0(g) / (2 * dpr)), sy: Math.round((e.cy - cam.y) * z + canvas1(g) / (2 * dpr)) },
    floorRow: py + 3,
    tileAt: [g.world.store.get(px + 5, py + 3), g.world.store.get(px + 5, py + 4)],
  };
  function canvas0(g) { return g.renderer.canvas.width; }
  function canvas1(g) { return g.renderer.canvas.height; }
});
console.log(JSON.stringify(res));
await page.screenshot({ path: '/tmp/antlion-render.png' });
await browser.close();
