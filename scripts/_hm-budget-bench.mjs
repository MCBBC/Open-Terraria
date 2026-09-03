// 预算放宽量化:复用既有世界(hardMode 重置),真实 FIFO 驱动,量墙钟/帧分布/转化增量
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 }).catch(() => {});
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(() => {}); await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {}); }
await sleep(400);
// 无角色 → 创建;选第一个角色进世界列表
if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 }); await sleep(400);
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('探针' + Math.floor(Math.random() * 90 + 10));
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel-list .sw-vitem', { timeout: 15000 }); await sleep(600);
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 12000 }).catch(() => {});
await sleep(400);
// 选最小世界(小世界转换最快,量相对值)
const names = await page.evaluate(() => [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].map(e => e.textContent.slice(0, 14)));
console.log('worlds:', JSON.stringify(names));
const smallIdx = await page.evaluate(() => {
  const its = [...document.querySelectorAll('.sw-vsel-list .sw-vitem')];
  const i = its.findIndex(e => e.textContent.includes('小'));
  return i >= 0 ? i : 0;
});
await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), smallIdx);
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 400000, polling: 500 });
await sleep(2000);
// 重置 hardMode(测量用:该世界若已转换过,F2 门会跳过)
const pre = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/world/gen/vanilla/HardmodePass.ts');
  g.world.flags.hardMode = false;
  delete g.world.flags.hardModeConverted;
  const st = g.world.store;
  const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
  let before = 0;
  for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) before++;
  return { before, size: st.w + 'x' + st.h };
});
console.log('PRE:', JSON.stringify(pre));
// 真实 FIFO 驱动 + 帧采样(与生产驱动同款 20ms 预算)
const r = await page.evaluate(async () => await new Promise(res => {
  const m = window.__hmMod;
  const frames = []; let last = performance.now(); let jobMs = 0; let done = false;
  const g = window.__swGame;
  function tick(t) {
    frames.push(t - last); last = t;
    if (!done) {
      const f0 = performance.now();
      if (g.worldJobs.length) { g.worldJobs[0].step(); if (g.worldJobs[0].step ?? 0) {} }
      if (g.worldJobs.length === 0) done = true;
      jobMs += performance.now() - f0;
      if (g.worldJobs.length) g.worldJobs.shift();   // 与生产驱动同款:done 则 shift
    }
    if (frames.length > 6000) { res({ frames, jobMs }); return; }
    requestAnimationFrame(tick);
  }
  // 入队
  import('/src/world/gen/vanilla/HardmodePass.ts').then(m => {
    g.worldJobs = g.worldJobs || [];
    g.worldJobs.push(m.startHardmodeJob(g.world));
    requestAnimationFrame(tick);
  });
}));
const frames = r.frames.sort((a, b) => a - b);
console.log(`BUDGET-20ms: 墙钟=${(r.jobMs / 1000).toFixed(2)}s(job 段累计) 帧数=${frames.length} p50=${frames[Math.floor(frames.length/2)].toFixed(1)}ms p99=${frames[Math.floor(frames.length*0.99)].toFixed(1)}ms max=${frames[frames.length-1].toFixed(1)}ms`);
const post = await page.evaluate(() => {
  const g = window.__swGame; const st = g.world.store;
  const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
  let after = 0;
  for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) after++;
  return { after, convertedFlag: g.world.flags.hardModeConverted === true };
});
console.log('POST:', JSON.stringify(post));
console.log('errs:', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
await b.close();
