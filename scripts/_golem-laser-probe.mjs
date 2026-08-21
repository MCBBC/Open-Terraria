// 石巨人眼激光层级探针:259 弹与头(246)的绘制先后。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  // 生成挂载头 246 在玩家上方(神庙风格),玩家在下方 → 激光往下打
  const head = g.spawnNpcByVanilla(246, p.x / 16, p.y / 16 - 6);
  if (!head) return { err: 'spawn 246 fail' };
  await new Promise((r) => setTimeout(r, 300));
  // 记录 sorted 顺序:头与 259 弹谁先画
  const rec = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (img, a1, a2, a3, a4, a5, a6, a7, a8) {
    rec.push({ w: arguments.length === 9 ? a7 : arguments[3], h: arguments.length === 9 ? a8 : arguments[4] });
    return orig.apply(this, arguments);
  };
  // 强制眼部阶段发射
  head.ai0 = 1;
  await new Promise((r) => setTimeout(r, 600));
  proto.drawImage = orig;
  const laser = g.entities.projectiles.filter((e) => e.projId === 259);
  const order = {};
  // 简化:比较头与弹的 y(排序依据)
  return {
    lasers: laser.length,
    headY: Math.round(head.y), headH: head.h,
    laserY: laser.map((l) => Math.round(l.y)),
    laserBelowHead: laser.map((l) => l.y > head.y + head.h * 0.5),
    note: 'sorted 升序:y 小先画。弹 y>头 y → 弹后画(在头前);弹 y<头 y → 弹被头盖',
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
