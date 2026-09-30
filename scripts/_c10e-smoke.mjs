// C10e 冒烟:旗开建世界,检查三画布栈+呈现窗+帧推进+零页错误
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errors = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
await bootstrap(page, ORIGIN + '/?c10e=1&fx=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
console.log('createGame:', !!gen?.ok, gen?.why ?? '');
await new Promise(r => setTimeout(r, 3000));
const st = await page.evaluate(() => {
  const g = window.__swGame; const r = g.renderer;
  const gl = document.getElementById('sw-c10e-glcanvas');
  return {
    hasSky: !!r.skyCanvas, hasGl: !!gl, glShown: gl ? gl.style.display !== 'none' : false,
    glW: gl ? gl.width : 0, glH: gl ? gl.height : 0,
    skyW: r.skyCanvas ? r.skyCanvas.width : 0, hudW: r.canvas.width, hudH: r.canvas.height,
    hudInRoot: !!r.canvas.parentElement && r.canvas.parentElement.id === 'game-root',
    order: r.canvas.parentElement ? [...r.canvas.parentElement.children].map(c => c.id || c.tagName).slice(0, 6) : [],
    c10eFlag: r.constructor.c10e,
    fps: g.fpsCounter ? Math.round(g.fpsCounter.avg || 0) : null,
    frameCount: r._diagFrame,
    composePath: r.composePathUsed, cloudPath: r.cloudPathUsed, merge: r.cloudMergeUsed,
    opresent: r.opresentUsed,
  };
});
console.log('STACK:', JSON.stringify(st, null, 1));
// 夜景检查（星直出路径）
const setNight = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.0;
  return g.world.clock.isDay;
});
console.log('night set, isDay=', setNight);
await new Promise(r => setTimeout(r, 1500));
const st2 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const gl = document.getElementById('sw-c10e-glcanvas');
  return { glShown: gl.style.display !== 'none', frameCount: r._diagFrame, starsDirect: r.sky.c10eStarDirect, over: r.sky.c10eOver };
});
console.log('NIGHT:', JSON.stringify(st2));
console.log('errors:', errors.length, errors.slice(0, 5));
process.exit(errors.length ? 1 : 0);
