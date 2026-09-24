// ★BJ316 红蓝复核:hover !important 毯是否过捕 mcraft 定 α 槽(FX43 压 hover 全亮)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'],
  defaultViewport: { width: 500, height: 300 },
});
const page = await browser.newPage();
await page.goto('file:///tmp/bj316-hover-cascade.html');
await new Promise(r => setTimeout(r, 300));
const before = await page.evaluate(() => ({ anim: window.__anim('animated'), a: window.__read('animated'), b: window.__read('mcraft') }));
// 悬停 mcraft 槽(页面坐标:100+26,10+26 + body margin 8)
await page.mouse.move(134, 44);
await new Promise(r => setTimeout(r, 200));
const hoverMcraft = await page.evaluate(() => ({ a: window.__read('animated'), b: window.__read('mcraft'), matches: document.getElementById('mcraft').matches(':hover') }));
// 悬停动画槽
await page.mouse.move(44, 44);
await new Promise(r => setTimeout(r, 200));
const hoverAnim = await page.evaluate(() => ({ a: window.__read('animated'), matches: document.getElementById('animated').matches(':hover') }));
console.log('REST   animated(opacity)=', before.a, 'animationName=', before.anim, ' mcraft=', before.b);
console.log('HOVER-mcraft  animated=', hoverMcraft.a, ' mcraft=', hoverMcraft.b, ' (:hover matched=', hoverMcraft.matches, ')');
console.log('HOVER-anim    animated=', hoverAnim.a);
const expectMcraft = hoverMcraft.b === '1';
console.log(expectMcraft
  ? 'REGRESSION-CONFIRMED: mcraft 定 α 槽 hover 被抬到 1(FX43 压制被 !important 毯击穿)'
  : 'NO-REGRESSION: mcraft 槽 hover 保持定 α');
await browser.close();
process.exit(expectMcraft ? 2 : 0);
