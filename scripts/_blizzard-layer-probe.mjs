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
await ev2(() => {
  const g = window.__swGame;
  const w = g.world.weather;
  w.raining = true;
  if ('cloudAlpha' in w) w.cloudAlpha = 1;
  if ('cloudBGActive' in w) w.cloudBGActive = 1;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;
});
await new Promise(r => setTimeout(r, 2600));
const shotA = (await page.screenshot({ type: 'png' })).toString('base64');
await page.evaluate(() => { window.__swGame.renderer.sky.weatherTintPasses = () => []; });
await new Promise(r => setTimeout(r, 350));
const shotB = (await page.screenshot({ type: 'png' })).toString('base64');
await page.evaluate(() => { delete window.__swGame.renderer.sky.weatherTintPasses; });
const metrics = await page.evaluate(async (aB64, bB64) => {
  const load = (b) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b; });
  const A = await load(aB64), B = await load(bB64);
  const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d', { willReadFrequently: true }); };
  const ca = mk(); ca.drawImage(A, 0, 0); const da = ca.getImageData(0, 0, W, H).data;
  const cb = mk(); cb.drawImage(B, 0, 0); const db = cb.getImageData(0, 0, W, H).data;
  const zoneAvg = (x0, y0, x1, y1) => {
    let sA = 0, sB = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      sA += (da[i] + da[i+1] + da[i+2]) / 3; sB += (db[i] + db[i+1] + db[i+2]) / 3; n++;
    }
    return (sA - sB) / n;
  };
  return {
    skyTop: zoneAvg(Math.round(W*0.55), Math.round(H*0.04), Math.round(W*0.95), Math.round(H*0.22)),
    midWorld: zoneAvg(Math.round(W*0.05), Math.round(H*0.45), Math.round(W*0.5), Math.round(H*0.75)),
  };
}, shotA, shotB);
console.log('METRICS:', JSON.stringify(metrics));
for (const e of errs.slice(0,8)) console.log(e);
console.log(metrics.midWorld < 3 ? '=== PASS:世界内容不受色罩影响 ===' : '=== FAIL ===');
await browser.close();
process.exit(metrics.midWorld < 3 ? 0 : 3);
