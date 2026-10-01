// C10e 二期鸟群桥目检:等鸟群驻留窗→连拍截图(GL quads 渲染正确性:鸟可见/层序/无黑块)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, ORIGIN + '/?c10e=1&');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
// 等鸟出现(10-120s 周期;轮询 2s,最长 150s)
let seen = false;
for (let i = 0; i < 75; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const n = await page.evaluate(() => window.__swGame.renderer.sky.ambEntities.length);
  if (n > 0) { console.log(`birds at +${i * 2}s n=${n}`); seen = true; break; }
}
if (!seen) { console.log('no birds in 150s window'); process.exit(1); }
// 驻留窗连拍(鸟在屏内才拍:每拍先看鸟屏坐标)
// 简化:驻留窗内连拍 10 张(屏坐标过滤不可靠——视差 depth 大时鸟可能瞬时出界)
const n0 = await page.evaluate(() => window.__swGame.renderer.sky.ambEntities.length);
for (let i = 0; i < 10; i++) {
  await page.screenshot({ path: `shots/c10e-trail/amb-${i}.png` });
  await new Promise((r) => setTimeout(r, 700));
}
console.log('birds at shot time:', n0);
console.log('errs:', errs.slice(0, 4));
process.exit(0);
