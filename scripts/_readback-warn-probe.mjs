// willReadFrequently 警告源定位探针：进世界后强制多次 chunk 烘焙+渲染,
// 捕获 Chrome "willReadFrequently" 控制台警告的真实 文件:行(未压缩 dev)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const warns = [];
page.on('console', (m) => {
  if (m.type() === 'warning' && /willReadFrequently/.test(m.text())) {
    // DevTools console 会带 location;location 信息在 stackTraceDetails 可能拿不到,直接记文本
    warns.push(m.text().slice(0, 160) + ' ||| ' + (m.location?.() && JSON.stringify(m.location())));
  }
});
page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 120)));
await page.goto('http://localhost:5203/', { waitUntil: 'domcontentloaded' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
for (let i = 0; i < 40 && !(await page.evaluate(() => !!document.querySelector('[data-act=sp]'))); i++) await sleep(500);
await sleep(2000);
await page.evaluate(() => document.querySelector('[data-act=sp]')?.click());
await page.waitForSelector('.sw-vsel-panel', { timeout: 15000 });
await sleep(600);
{
  const hasChar = await page.evaluate(() => !!document.querySelector('.sw-vsel-list .sw-vitem'));
  if (!hasChar) {
    await page.evaluate(() => document.querySelector('.sw-vsel-footer [data-act=new]')?.click());
    await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
    await sleep(400);
    await page.evaluate(() => document.querySelector('.sw-char-panel input[type=text]')?.focus());
    await page.keyboard.type('读回探针');
    await sleep(150);
    await page.evaluate(() => document.querySelector('.sw-char-footer [data-act=create]')?.click());
    await page.waitForSelector('.sw-vsel-list .sw-vitem', { timeout: 10000 });
    await sleep(500);
  }
  const idx = await page.evaluate(() => Math.max(0, [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].findIndex(e => e.textContent.includes('读回探针'))));
  await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
}
await page.waitForFunction(() => /世界|World/i.test(document.querySelector('.sw-vsel-title')?.textContent ?? ''), { timeout: 10000 });
await sleep(600);
{
  const hasW = await page.evaluate(() => document.querySelectorAll('.sw-vsel-list .sw-vitem').length > 0);
  if (!hasW) {
    await page.evaluate(() => document.querySelector('.sw-vsel-footer [data-act=new]')?.click());
    await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
    await sleep(300);
    await page.evaluate(() => (document.querySelector('.sw-wc-panel input[data-f=name]')).focus());
    await page.keyboard.type('WarnLab');
    await sleep(120);
    await page.evaluate(() => document.querySelector('[data-g=size] .sw-wc-opt')?.click());
    await sleep(100);
    await page.evaluate(() => document.querySelector('.sw-wc-footer [data-act=create]')?.click());
  } else {
    await page.evaluate(() => [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].find(e => /DuckLab|WarnLab/.test(e.textContent))?.click());
  }
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await sleep(3000);
// 强制跨图传送烘焙多组 chunk + 小幅移动刷新可见集
for (let k = 1; k <= 6; k++) {
  await page.evaluate((k) => {
    const g = window.__swGame; const p = g.player;
    p.x = p.x + 900; p.y = Math.max(g.world.store.surfaceYAt ? 0 : 0, p.y);
  }, k).catch(() => {});
  await sleep(700);
}
// 在探针页 hook 记录:补一次全量 chunk get 的 bake 触发(清缓存走 renderChunk.get)
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  for (const dx of [0, 30, 60, 90, 120, -60]) {
    p.x += dx * 16 * 2;
    await new Promise(r => setTimeout(r, 350));
  }
});
await sleep(1500);
console.log('WARN-COUNT:', warns.length);
for (const w of new Set(warns.map(w => w.slice(0, 80)))) console.log('WARN:', w);
// 抓 location 精确源:Chrome 对该警告提供 stackTraceDetails? 退而求其次用 CDP 全局异常定位不适用——
// 这里直接把页面内所有 canvas 相关文件做标记即可人工比对(见报告)
await browser.close();
