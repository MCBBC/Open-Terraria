// 一次性探针:F6 面板路径(debugSpawnNpc(398))复现(scripts/_mlf6-probe.mjs)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
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
  await page.keyboard.type('F6复现');
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
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.world.clock.timeOfDay = 0.95;
  g.toggleDebugGod();
  // ★用户路径:F6 面板 = debugSpawnNpc(398)(裸核心,核心 AI 自己拉手+头)
  const msg = g.debugSpawnNpc(398, 1, false);
  await wait(9000);
  g.world.clock.timeOfDay = 0.95;
  const records = [];
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__mlHooked4) {
    proto.__mlHooked4 = true;
    const orig = proto.drawImage;
    proto.drawImage = function (img, ...rest) {
      try {
        if (rest.length >= 5) {
          const [sx, sy, sw, sh] = rest;
          const iw = img.width, ih = img.height;
          if ((iw === 573 && sw === 191) || (iw === 38) || (iw === 90 && sw === 90) ||
              (iw === 56 && sw === 56 && ih === 168) || (iw === 32 && sw === 32)) {
            const m = this.getTransform();
            const c = this.canvas;
            records.push({ t: iw + 'x' + ih, cv: c.width + 'x' + c.height, sx, sy, e: +m.e.toFixed(1), f: +m.f.toFixed(1), a: +m.a.toFixed(2) });
          }
        }
      } catch (e) {}
      return orig.call(this, img, ...rest);
    };
  }
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const parts = g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId)).map(e => ({
    vid: e.vanillaId, ai0: +e.ai0.toFixed(1), lai0: +e.lai0.toFixed(2), lai1: +e.lai1.toFixed(2),
    cx: Math.round(e.cx), cy: Math.round(e.cy), dead: e.dead,
  }));
  return { msg, records, parts, cam: { x: Math.round(g.camera.x), y: Math.round(g.camera.y), z: g.camera.zoom } };
});
console.log('msg:', out.msg, 'cam:', JSON.stringify(out.cam));
console.log('parts:', JSON.stringify(out.parts));
for (const r of out.records) console.log(JSON.stringify(r));
await page.screenshot({ path: '/tmp/ml_f6.png', type: 'png' });
console.log('errs:', JSON.stringify(errs.slice(0, 3)));
await browser.close();
