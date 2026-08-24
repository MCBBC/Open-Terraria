// 一次性:1458 菜单对齐验证矩阵——昼/黄昏/夜(远山交叉淡化)/样式8/样式3。
// OUT 环境变量选输出目录(before/after 对拍);STATE 额外 dump alphaFar 坡道态。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT ?? '/tmp/menu-align1458';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
if (!menuReady) { console.log('FAIL: menu handle missing'); process.exit(1); }
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1500));

const setTime = (t, day) => page.evaluate((t, day) => {
  const mb = window.__swMenuBg;
  mb.vTime = t; mb.dayTime = day;
}, t, day);
const shoot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 白天正午(time 27000)
await setTime(27000, true); await wait(1500); await shoot('menu-day-noon');
// 2. 样式 8(184 槽 scale=1.2 覆写面)/样式 3(91 特例)
for (const st of [8, 3]) {
  await page.evaluate((st) => { window.__swMenuBg.style = st; }, st);
  await wait(1200);
  await shoot(`menu-style-${st}`);
}
// 3. 黄昏 time=46500
await setTime(46500, true); await wait(1500); await shoot('menu-dusk');
// 4. 深夜 time=16200(夜槽腐化 + 远山 tex24/25 交叉淡化)
await setTime(16200, false); await wait(3000);
await shoot('menu-night-corrupt');
// 黄昏→夜的过渡中段(alphaFar 双槽同时 >0 的交叉淡化证据)
await setTime(50000, true); await wait(400);
await setTime(0, false); await wait(700);
await shoot('menu-night-transition');
await wait(2500);
const state = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  const bb = mb.biomeBg ?? mb['biomeBg'];
  return {
    style: mb.style, bgStyle: bb.bgStyle,
    alphaFront: [bb.alphaFront[0], bb.alphaFront[1]].map((v) => +v.toFixed(3)),
    alphaFar0: +(bb.alphaFar?.[0] ?? -1).toFixed(3),
    alphaFar2: +(bb.alphaFar?.[2] ?? -1).toFixed(3),
    menuMode: bb.menuMode,
  };
});
console.log('STATE:', JSON.stringify(state));
await browser.close();
