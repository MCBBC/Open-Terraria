// ★C10b 聚焦诊断2:drawImage 钩直测(手动触发+全量 3 参计数)+路径仪器实读
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, URL0);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

await page.evaluate(() => {
  const g = window.__swGame;
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    window.__diCount = 0;
    window.__di3 = 0;
    window.__diSrcs = [];
    P.drawImage = function (src, ...rest) {
      window.__diCount++;
      if (rest.length === 2) {
        window.__di3++;
        if (window.__diSrcs.length < 12) {
          window.__diSrcs.push({
            tag: (src && src.id) || (src && src.width + 'x' + src.height) || 'null',
            isGlfx: !!(window.__swGame?.renderer?.glfx && src === window.__swGame.renderer.glfx.canvas),
            isPipe: !!(window.__swGame?.renderer?.cloudPipeLayer && src === window.__swGame.renderer.cloudPipeLayer.canvas),
          });
        }
      }
      return orig.call(this, src, ...rest);
    };
    P.__c10bPatched = true;
  }
});
await freezeClock(page, { tod: 0.5 });
await pump(page, 40);

const info1 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    diCount: window.__diCount, di3: window.__di3, srcs: window.__diSrcs,
    cloudPath: r.cloudPathUsed, merge: r.cloudMergeUsed,
    hasGlfx: !!r.glfx, hasPipe: !!r.cloudPipeLayer,
    glfxDim: r.glfx ? r.glfx.canvas.width + 'x' + r.glfx.canvas.height : null,
    mainDim: r.canvas.width + 'x' + r.canvas.height,
  };
});
console.log('40帧后:', JSON.stringify(info1, null, 1));

// 手动钩子直测
const manual = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__blits = [];
  window.__snapOn = true;
  const P = Object.getPrototypeOf(r.ctx);
  // 直调:原型补丁是否对 r.ctx 生效
  r.ctx.drawImage(r.glfx.canvas, 0, 0);
  const hit = window.__blits.length;
  window.__snapOn = false;
  return { hit, protoIsPatched: !!P.__c10bPatched, glfxAlive: !!r.glfx && !r.glfx.unavailable };
});
console.log('手动直测:', JSON.stringify(manual));

await browser.close();
process.exit(0);
