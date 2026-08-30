// P0-SHM 标注验证:进世界后
// ① domBreakdown 中不再有数千级图标 surface 计数类条目(改为可见画布计数个位数)
// ② Canvas2D SHM 后备不可直接读——用间接信号:glfx 上传列无周期尖峰(静态源缓存成立)
// ③ 控制台无 Canvas2D 警告刷屏
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5207') + '/?gpulog=1';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const logs = [], warns = [];
page.on('console', m => { const t = m.text(); if (t.includes('[gpulog]') || t.includes('驻留=')) logs.push(t); if (/Canvas2D/.test(t)) warns.push(t.slice(0, 100)); });
const errs=[];
page.on('pageerror', e => errs.push('[pe] ' + String(e.message).slice(0,150)));
page.on('console', m => { const t=m.text(); if (/失败|error|异常|WorldGen|toast/i.test(t)) errs.push('[c] ' + t.slice(0,140)); });
const ev2=(fn)=>page.evaluate(fn);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('shm');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
if (await page.$('.sw-vsel .sw-vitem')) {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
} else {
  await page.click('.sw-vsel [data-act=new]').catch(()=>{});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(()=>{});
  await page.click('[data-f=seed]'); await page.keyboard.type('12345');
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 8000));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// ---- 暴风雪色罩层位验证 ----
{
  const st = await page.evaluate(() => ({
    hasGame: !!window.__swGame,
    w: window.__swGame?.world?.store?.w ?? null,
    running: window.__swGame?.running ?? null,
    menuTitle: document.querySelector('.sw-title-menu') ? 'menu' : (document.querySelector('.sw-vsel-title')?.textContent ?? document.querySelector('body').children.length),
  }));
  console.log('STATE:', JSON.stringify(st));
}
const snowSpot = await ev2(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = g.world.weather;
  w.raining = true;
  if ('cloudAlpha' in w) w.cloudAlpha = 1;
  if ('cloudBGActive' in w) w.cloudBGActive = 1;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;
  const T = await import('/src/data/tiles');
  const snowIds = new Set();
  T.TILE_DEFS.forEach((d, id) => { if (d?.key && (d.key.includes('snow') || d.key.includes('ice'))) snowIds.add(id); });
  let bestX = -1, bestCount = 0, bestY = 0;
  for (let x = 40; x < st.w - 40; x += 4) {
    let c = 0, firstY = 0;
    for (let y = 0; y < Math.min(st.h, (g.world.groundLevel ?? 200) + 80); y++) {
      if (snowIds.has(st.type[st.idx(x, y)])) { c++; if (!firstY) firstY = y; }
    }
    if (c > bestCount) { bestCount = c; bestX = x; bestY = firstY; }
  }
  if (bestX >= 0) {
    g.player.x = bestX * 16 + 8;
    g.player.y = (bestY - 8) * 16;
    g.player.vx = 0; g.player.vy = 0;
  }
  return { bestX, bestCount };
});
console.log('SNOW SPOT:', JSON.stringify(snowSpot));
await sleep(3500);
await ev2(() => {
  const s = window.__swGame.renderer.sky;
  console.log('TINT: passes=' + s.weatherTintPasses().length +
    ' blizzOpacity=' + s.blizzTintState.opacity.toFixed(2) +
    ' zoneSnow=' + !!s.frameCtx?.scene?.zoneSnow +
    ' zoneRain=' + !!s.frameCtx?.scene?.zoneRain);
});
await sleep(400);
await new Promise(r => setTimeout(r, 2600));
const fly = await ev2(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;
  g.player.x = 2768 * 16 + 8;
  g.player.y = Math.max(64, ((g.world.groundLevel ?? 300) - 30) * 16);
  g.player.vx = 0; g.player.vy = -2;
  return { x: g.renderer.canvas.width, y: g.renderer.canvas.height };
});
console.log('FLY:', JSON.stringify(fly));
const shotA = (await page.screenshot({ type: 'png' })).toString('base64');
await ev2(() => { window.__swGame.renderer.sky.weatherTintPasses = () => []; });
await ev2(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;
  g.player.y = Math.max(64, ((g.world.groundLevel ?? 300) - 30) * 16);
  g.player.vy = -2;
});
await sleep(350);
const shotB = (await page.screenshot({ type: 'png' })).toString('base64');
const restore = await page.evaluate(async () => {
  const s = window.__swGame.renderer.sky;
  s.weatherTintPasses = s._realPasses;
  return true;
});
await sleep(250);
const shotC = (await page.screenshot({ type: 'png' })).toString('base64');
const metrics = await page.evaluate(async (aB64, bB64, cB64) => {
  const load = (b) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b; });
  const A = await load(aB64), B = await load(bB64), C = await load(cB64);
  const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d', { willReadFrequently: true }); };
  const zoneAvg = (img, x0, y0, x1, y1) => {
    const cx = mk(); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { s += (d[i] + d[i+1] + d[i+2]) / 3; n++; }
    return s / n;
  };
  return {
    skyOn: Math.round(zoneAvg(A, Math.round(W*0.55), Math.round(H*0.04), Math.round(W*0.95), Math.round(H*0.22))),
    skyOff: Math.round(zoneAvg(B, Math.round(W*0.55), Math.round(H*0.04), Math.round(W*0.95), Math.round(H*0.22))),
    skyRestore: Math.round(zoneAvg(C, Math.round(W*0.55), Math.round(H*0.04), Math.round(W*0.95), Math.round(H*0.22))),
    worldOn: Math.round(zoneAvg(A, Math.round(W*0.05), Math.round(H*0.45), Math.round(W*0.5), Math.round(H*0.75))),
    worldOff: Math.round(zoneAvg(B, Math.round(W*0.05), Math.round(H*0.45), Math.round(W*0.5), Math.round(H*0.75))),
    worldRestore: Math.round(zoneAvg(C, Math.round(W*0.55 - W*0.45) + Math.round(W*0.05), Math.round(H*0.45), Math.round(W*0.5), Math.round(H*0.75))),
  };
}, shotA, shotB, shotC);
console.log('METRICS:', JSON.stringify(metrics));
const skyDelta = Math.abs(metrics.skyOn - metrics.skyOff);
const worldDelta = Math.abs(metrics.worldOn - metrics.worldOff);
console.log(`天空区: 开=${metrics.skyOn} 关=${metrics.skyOff} Δ=${skyDelta}`);
console.log(`世界区: 开=${metrics.worldOn} 关=${metrics.worldOff} Δ=${worldDelta}`);
console.log(skyDelta > 20 && worldDelta <= 3 ? '=== PASS: 色罩仅在背景层(天空变白、世界零影响) ==='
  : skyDelta > 20 ? '=== 色罩生效但世界区也受影响 ===' : '=== 色罩未上屏 ===');
await browser.close();
process.exit(0);
