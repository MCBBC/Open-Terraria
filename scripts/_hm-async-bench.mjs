// 肉山困难模式转换异步化量化:同步 drain 总耗时 vs job 预算驱动的单帧最大增量
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox --enable-automation'], defaultViewport: { width: 988, height: 862 } });
const page = await b.newPage();
page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 160)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSERR', m.text().slice(0, 160)); });
await page.goto((process.env.SW_ORIGIN || 'http://localhost:5202') + '/', { waitUntil: 'domcontentloaded' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try { await page.waitForSelector('.sw-title-menu', { timeout: 120000 }); }
catch { console.log('BOOT-FAIL body:', await page.evaluate(() => document.body.innerHTML.slice(0, 400)).catch(() => 'no-eval'));
        await page.screenshot({ path: '/tmp/hm-bench-boot.png' }).catch(() => {});
        throw new Error('boot diag captured'); }
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000 }).catch(() => {});
await page.mouse.click(8, 8);
for (let i = 0; i < 10 && !(await page.$('.sw-title-menu')); i++) await sleep(500);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(() => {}); await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {}); }
await sleep(400);
// 需要一个"未困难化"世界:RainLab 已被上次 job 置 hardMode——新建专用世界
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('[data-f=name]', { timeout: 10000 }); await sleep(300);
await page.click('[data-f=name]'); await page.keyboard.type('HmLab'); await sleep(120);
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
await sleep(80);
await page.click('[data-act=create]');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 400000 });
await sleep(2500);
const res = await page.evaluate(async () => {
  const m = await import('/src/world/gen/vanilla/HardmodePass.ts');
  const g = window.__swGame;
  const w = g.world;
  // ① job 预算驱动:模拟 updateWorld 的 ≤2.5ms/tick 循环,记录每帧步进实际耗时与帧数
  const wof0 = { x: 300 * 16, y: 150 * 16 };
  m.createBrickBoxForWallOfFlesh(w.store, 300, 150, 100, w.crimson);
  const job = m.startHardmodeJob(w);
  const frameMs = []; const t0 = performance.now();
  let done = false, frames = 0, totalStepMs = 0;
  while (!done) {
    const f0 = performance.now();              // 帧内 job 段开始
    let d; 
    do { d = job.step(); totalStepMs = performance.now() - t0; } while (!(d) && performance.now() - f0 < 2.5);
    frameMs.push(performance.now() - f0);
    done = d; frames++;
    await new Promise(r => requestAnimationFrame(() => r()));
  }
  const totalWall = performance.now() - t0;
  frameMs.sort((a, b) => a - b);
  // ② 同步全量对照:再跑一遍 initializeHardModeGen drain(同 seed 新 RNG——结果幂等近似,仅量耗时)
  const t1 = performance.now();
  const it = m.initializeHardModeGen(w, new (await import('/src/core/rng.ts')).RNG(w.seed));
  for (let r = it.next(); !r.done; r = it.next());
  const syncTotal = performance.now() - t1;
  return { frames, totalWall_s: +(totalWall / 1000).toFixed(2), jobFrame_p50: +frameMs[Math.floor(frameMs.length/2)].toFixed(2),
           jobFrame_max: +frameMs[frameMs.length - 1].toFixed(2), syncFullDrain_ms: +syncTotal.toFixed(0),
           brickBoxNote: 'wof0 unused' };
});
console.log(JSON.stringify(res));
await b.close();
