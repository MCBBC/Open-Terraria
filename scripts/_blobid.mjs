// 白斑身份终查：重建种子 12345 小世界 → 传送到 (292,428) → 列举该处实体+粒子
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
  await page.keyboard.type('白斑');
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
  // 传送到白斑区
  g.player.x = 292 * 16; g.player.y = 428 * 16;
  for (let i = 0; i < 60; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const out = { entities: [], particles: 0 };
  for (const c of g.entities.critters) {
    out.entities.push({ kind: 'critter', id: c.vanillaId, key: c.key, x: Math.round(c.cx / 16), y: Math.round(c.cy / 16), dead: c.dead });
  }
  for (const c of g.entities.enemies) {
    out.entities.push({ kind: 'enemy', id: c.vanillaId, x: Math.round(c.cx / 16), y: Math.round(c.cy / 16) });
  }
  // 画布白斑采样：玩家周围 ±200px 找纯白斑
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const cx0 = Math.round(canvas.width / 2 - 200), cy0 = Math.round(canvas.height / 2 - 200);
  const d = ctx.getImageData(cx0, cy0, 400, 400).data;
  let white = 0;
  const wpts = [];
  for (let y = 0; y < 400; y += 2) for (let x = 0; x < 400; x += 2) {
    const j = (y * 400 + x) * 4;
    if (d[j] > 230 && d[j+1] > 230 && d[j+2] > 230) { white++; if (wpts.length < 5) wpts.push({ sx: cx0 + x, sy: cy0 + y }); }
  }
  out.whitePx = white;
  out.whiteSamples = wpts.map((p) => {
    const wx = Math.round((p.sx - canvas.width / 2) / 1.25 + g.camera.x);
    const wy = Math.round((p.sy - canvas.height / 2) / 1.25 + g.camera.y);
    return { tile: [Math.round(wx / 16), Math.round(wy / 16)], rgb: (() => { const k = ctx.getImageData(p.sx, p.sy, 1, 1).data; return k[0] + ',' + k[1] + ',' + k[2]; })() };
  });
  return out;
});
console.log('实体:', JSON.stringify(res.entities, null, 0).slice(0, 400));
console.log('白像素:', res.whitePx, ' 样本:', JSON.stringify(res.whiteSamples));
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await page.screenshot({ path: '/tmp/sw-blob.png' });
await browser.close();
