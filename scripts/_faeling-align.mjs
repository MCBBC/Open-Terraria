// 精灵萤 vs 白斑对齐：重建世界 → 湖右岸等待 spawnFaelings →
// 对每个 677 实体：屏幕位置画十字标记 → 截图比对白斑位置是否重合。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('萤对');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-wc-panel input[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    (opts.find((o) => o.textContent.includes('小')) ?? opts[0]).click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 传送到湖右岸（报告玩家位）
  g.player.x = 247 * 16 + 8; g.player.y = 446 * 16;
  // 进微光区上升沿触发 spawnFaelings（scene.zoneShimmer 需为 true——玩家位置决定）
  for (let i = 0; i < 120; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  // 等精灵萤生成（spawnFaelings 上升沿一次生成一批）
  await new Promise(r => setTimeout(r, 1000));
  for (let i = 0; i < 60; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const faelings = g.entities.critters.filter((c) => c.vanillaId === 677 && !c.dead)
    .map((c) => ({ tx: Math.round(c.cx / 16), ty: Math.round(c.cy / 16), sx: Math.round(c.cx), sy: Math.round(c.cy) }));
  // 屏幕白斑采样
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const blobs = [];
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let y = 100; y < canvas.height - 100; y += 2) for (let x = 100; x < canvas.width - 100; x += 2) {
    const j = (y * canvas.width + x) * 4;
    if (d[j] > 230 && d[j+1] > 230 && d[j+2] > 230) {
      const wx = Math.round((x - canvas.width / 2) / 1.25 + g.camera.x);
      const wy = Math.round((y - canvas.height / 2) / 1.25 + g.camera.y);
      blobs.push({ tx: Math.round(wx / 16), ty: Math.round(wy / 16), px: [d[j], d[j+1], d[j+2]] });
    }
  }
  return { faelings, blobCount: blobs.length, blobs: blobs.slice(0, 12), zoneShimmer: g.scene?.zoneShimmer };
});
console.log('zoneShimmer:', res.zoneShimmer);
console.log('精灵萤 677 实体:', JSON.stringify(res.faelings));
console.log('屏幕白斑数:', res.blobCount, ' 样本:', JSON.stringify(res.blobs.slice(0, 6)));
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await page.screenshot({ path: '/tmp/sw-faeling.png' });
await browser.close();
