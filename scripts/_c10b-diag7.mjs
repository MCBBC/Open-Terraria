// ★C10b 聚焦诊断7:页错误/console 捕获+rAF 活性——渲染停摆定罪
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => { errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 4).join('\n')); });
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') errors.push(`CONSOLE.${t}: ` + m.text());
});
await bootstrap(page, URL0);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  let n = 0;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    n++;
    window.__skyDrawN = n;
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  window.__rafN = 0;
  const loop = () => { window.__rafN++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
await freezeClock(page, { tod: 0.5 });
await pump(page, 100);
const s1 = await page.evaluate(() => ({ skyDrawN: window.__skyDrawN, rafN: window.__rafN, path: window.__swGame.renderer.cloudPathUsed, merge: window.__swGame.renderer.cloudMergeUsed }));
console.log('100 ticks 后:', JSON.stringify(s1));
await pump(page, 100);
const s2 = await page.evaluate(() => ({ skyDrawN: window.__skyDrawN, rafN: window.__rafN, path: window.__swGame.renderer.cloudPathUsed }));
console.log('200 ticks 后:', JSON.stringify(s2));
console.log('errors:', errors.length ? errors.slice(0, 6).join('\n---\n') : '(无)');

await browser.close();
process.exit(0);
