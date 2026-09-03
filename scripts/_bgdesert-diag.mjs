// 诊断:建同 seed 世界后 90s,看直方图/treeX/seed 与沙分布
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e?.message ?? e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.mouse.click(8, 8);
for (let i = 0; i < 6 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
if (!(await page.$('.sw-char-row input[type=text]'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('bgprobe2');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(() => {});
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]').catch(() => {});
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await page.click('[data-f=seed]');
await page.keyboard.type('1247539775');
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 420000, polling: 1000 });
await new Promise((r) => setTimeout(r, 90000));
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = st.w, h = st.h, ty = st.type;
  const hist = new Map();
  for (let i = 0; i < ty.length; i += 7) { const v = ty[i]; if (v) hist.set(v, (hist.get(v) ?? 0) + 1); }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  // 沙列分布
  const colN = [];
  for (let x = 60; x < w - 60; x += 40) {
    let n = 0;
    for (let y = 0; y < h; y++) if (ty[x + y * w] === 53) n++;
    colN.push([x, n]);
  }
  colN.sort((a, b) => b[1] - a[1]);
  return {
    seed: g.world.seed, name: g.world.name, treeX: g.world.treeX, groundLevel: g.world.groundLevel,
    topTiles: top, sandTop10: colN.slice(0, 10),
    bg: { bgStyle: g.renderer.biomeBg.bgStyle, desertStyle: g.renderer.biomeBg.desertStyle },
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
console.log('DIAG DONE');
