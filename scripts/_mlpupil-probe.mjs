// 一次性探针:月总瞳孔椭圆修复视觉验收(scripts/_mlpupil-probe.mjs)
// 白天召唤月总 → 等部件+攻击表运转 → 截图(核对瞳孔在眼窝内)。
// 经 tools/run-diag.mjs 运行;SW_ORIGIN 指向私有实例。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
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
  await page.keyboard.type('瞳孔验证');
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

await page.exposeFunction('__mlSnap', async (name) => {
  await page.screenshot({ path: '/tmp/ml_' + name + '.png', type: 'png' });
});
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // 钉正午(0.5,昼窗 0.1875-0.8125 正中)——规避夜光压暗
  g.world.clock.timeOfDay = 0.5;
  g.toggleDebugGod();
  const p = g.player;
  // ★不传送:程序化瞬移会打黑主视图渲染(小地图正常,走路则正常)——就在出生地召唤
  const spawned = g.summonBoss('moon_lord', { onPlayer: true });
  // 等部件就位+头进攻击态(瞳孔开度上去);期间钉正午防时钟走黑
  for (let i = 0; i < 14; i++) { await wait(1000); g.world.clock.timeOfDay = 0.5; }
  const parts = g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId)).map(e => ({
    vid: e.vanillaId, ai0: +e.ai0.toFixed(1), lai0: +e.lai0.toFixed(3), lai1: +e.lai1.toFixed(3),
    cx: Math.round(e.cx), cy: Math.round(e.cy), dead: e.dead,
  }));
  // ---- 原子抓取:钩 prototype.drawImage 记录月总贴图的变换矩阵(与 parts 同一瞬间) ----
  const mlDraws = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (img, ...rest) {
    try {
      if (rest.length >= 5) {
        const [sx, sy, sw, sh] = rest;
        const iw = img.width, ih = img.height;
        // 月总贴图源尺寸指纹:NPC_396 帧 191x268(表 573x804)、Extra_25 56x56、
        // Extra_29 90x100、Extra_18 38x68、Extra_19 32x32、NPC_397 帧 246x272、
        // Extra_13 290x638、Extra_14 172x400、Extra_15 128x426、Extra_16 230x178
        const hit =
          (iw === 573 && sw === 191 && sh === 268) || (sw === 56 && sh === 56 && iw === 56) ||
          (iw === 90 && sw === 90 && (sh === 100 || sh === 99)) || (iw === 38 && sw === 38 && sh === 68) ||
          (iw === 32 && sw === 32 && sh === 32) || (iw === 246 && sw === 246 && sh === 272) ||
          (iw === 290) || (iw === 172) || (iw === 128) || (iw === 230);
        if (hit) {
          const m = this.getTransform();
          mlDraws.push({ tag: iw + 'x' + ih, sx, sy, sw, sh, e: +m.e.toFixed(1), f: +m.f.toFixed(1), a: +m.a.toFixed(3), d: +m.d.toFixed(3) });
        }
      }
    } catch (e) {}
    return orig.call(this, img, ...rest);
  };
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  proto.drawImage = orig;
  await window.__mlSnap('B-ml-14s');
  // ---- atlas 内容核对:活页面里 NPC_396 菱形眼区 / Extra_18 的实际像素 ----
  let atlasCheck = null;
  try {
    const atlas = g.renderer.atlas;
    const probe = (path, pts) => {
      const img = atlas.ensureVImage(path);
      if (!img) return 'null';
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, img.width, img.height).data;
      return { w: img.width, h: img.height, pts: pts.map(([x, y]) => {
        const k = (y * img.width + x) * 4;
        return [x, y, d[k], d[k + 1], d[k + 2], d[k + 3]];
      }) };
    };
    atlasCheck = {
      npc396: probe('vanilla/NPC_396.png', [[95, 50], [95, 65], [95, 78], [90, 60], [100, 70]]),
      ex18: probe('vanilla/Extra_18.png', [[19, 10], [19, 34], [19, 55], [10, 34], [28, 34]]),
    };
  } catch (e) { atlasCheck = 'err:' + e.message; }
  return { atlasCheck, mlDraws, cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom }, parts2: g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId)).map(e => ({ vid: e.vanillaId, cx: Math.round(e.cx), cy: Math.round(e.cy) })) };
  return { spawned, isDay: g.world.clock.isDay, tod: +g.world.clock.timeOfDay.toFixed(3), parts };
});
console.log(JSON.stringify(out, null, 1));
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/ml_pupil_fixed.png', type: 'png' });
console.log('errs:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
