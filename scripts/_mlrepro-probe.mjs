// 一次性探针:复现用户"覆层右偏+真眼孔空"状态,原子抓取头部件全部 drawImage 变换
// (scripts/_mlrepro-probe.mjs)——战斗刚开始(满血)连续抓 3 个时间点。
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
  await page.keyboard.type('复现偏移');
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

// 连续三轮:召唤后 2s/7s/14s 各抓一次(变换+部件状态+截图)
for (let round = 0; round < 3; round++) {
  const waitMs = round === 0 ? 2000 : (round === 1 ? 5000 : 7000);
  if (round > 0) {
    await page.evaluate((ms) => new Promise(r => setTimeout(r, ms)), waitMs);
  } else {
    await page.evaluate(async () => {
      const g = window.__swGame;
      g.world.clock.timeOfDay = 0.95;
      g.toggleDebugGod();
      g.summonBoss('moon_lord', { onPlayer: true });
      await new Promise(r => setTimeout(r, 2000));
    });
  }
  const out = await page.evaluate(() => {
    const g = window.__swGame;
    const records = [];
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__mlHooked) {
      proto.__mlHooked = true;
      const orig = proto.drawImage;
      proto.drawImage = function (img, ...rest) {
        try {
          if (rest.length >= 5) {
            const [sx, sy, sw, sh] = rest;
            const iw = img.width, ih = img.height;
            if ((iw === 573 && sw === 191) || (iw === 38) || (iw === 32 && sw === 32) ||
                (iw === 90 && sw === 90) || (iw === 56 && sw === 56 && ih === 168)) {
              const m = this.getTransform();
              records.push({ t: iw + 'x' + ih, sx, sy, sw, sh, e: +m.e.toFixed(1), f: +m.f.toFixed(1), a: +m.a.toFixed(2) });
            }
          }
        } catch (e) {}
        return orig.call(this, img, ...rest);
      };
    }
    return new Promise(res => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const parts = g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId)).map(e => ({
          vid: e.vanillaId, ai0: +e.ai0.toFixed(1), ai1: Math.round(e.ai1), facing: e.facing,
          lai0: +e.lai0.toFixed(2), lai1: +e.lai1.toFixed(2), lai2: +e.lai2.toFixed(1), lai3: +e.lai3.toFixed(1),
          cx: Math.round(e.cx), cy: Math.round(e.cy), hp: e.hp,
        }));
        res({ records, parts, cam: { x: Math.round(g.camera.x), y: Math.round(g.camera.y), z: +g.camera.zoom.toFixed(2) } });
      }));
    });
  });
  console.log('=== round ' + round + ' ===');
  console.log('parts:', JSON.stringify(out.parts));
  console.log('draws:', JSON.stringify(out.records.filter(r => r.t !== '32x32' || r.e > 600)));
  await page.screenshot({ path: '/tmp/ml_repro_' + round + '.png', type: 'png' });
}
console.log('errs:', JSON.stringify(errs.slice(0, 3)));
await browser.close();
