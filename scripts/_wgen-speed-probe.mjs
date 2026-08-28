// worker 世界生成速度剖析:拦截 WorldGenClient.generate 的进度回调,
// 记录每个 (label,p) 事件时间戳 → pass 级耗时表;对比 genIcons 排队影响
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5210');
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  (window).__wgen = { t0: 0, events: [], total: 0 };
  const origStart = performance.now;
  // 延迟包装:WorldGenClient 在模块内动态 import,这里钩 prototype 不可行——
  // 改钩 postMessage? 不可行。换思路:钩 loadState.setProgress 不可行。
  // 最稳:UIWorldCreation 的 create 点击→world ready 全程 rAF 外的
  // performance.mark 由主流程打? 不改源码,改用 Worker 截获:
  const OW = window.Worker;
  window.Worker = function (url, opts) {
    const w = new OW(url, opts);
    if (String(url).includes('worldGen.worker')) {
      const osend = w.postMessage.bind(w);
      w.postMessage = function (msg, tr) {
        if (msg && msg.type === 'generate') {
          (window).__wgen.t0 = performance.now();
          (window).__wgen.genPostedAt = performance.now();
        }
        if (msg && msg.type === 'genIcons') {
          (window).__wgen.iconsPostedAt = performance.now();
        }
        return osend(msg, tr);
      };
      w.addEventListener('message', (e) => {
        const d = e.data;
        if (!d) return;
        if (d.type === 'progress' && d.phase === 'generate') {
          (window).__wgen.events.push({ at: performance.now(), label: d.label, p: d.p });
        }
        if (d.type === 'icons') (window).__wgen.iconsDoneAt = performance.now();
        if (d.type === 'result' && d.world) (window).__wgen.total = performance.now();
      });
    }
    return w;
  };
  window.Worker.prototype = OW.prototype;
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('sp');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
await page.click('.sw-vsel [data-act=new]').catch(()=>{});
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await page.click('[data-f=seed]'); await page.keyboard.type('12345');
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
const clickAt = await page.evaluate(() => performance.now());
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 200 });
const readyAt = await page.evaluate(() => performance.now());
const out = await page.evaluate(() => {
  const w = (window).__wgen;
  return { t0: w.t0, total: w.total, iconsPostedAt: w.iconsPostedAt, iconsDoneAt: w.iconsDoneAt, events: w.events };
});
console.log('click→ready 总墙钟:', (readyAt - clickAt).toFixed(0), 'ms');
if (out.t0) {
  console.log('worker generate 耗时:', (out.total - out.t0).toFixed(0), 'ms');
  console.log('genIcons:', out.iconsPostedAt?.toFixed(0), '→', out.iconsDoneAt?.toFixed(0), `(占 ${(out.iconsDoneAt - out.iconsPostedAt).toFixed(0)}ms,与 generate 串行)`);
  // pass 段耗时
  const ev = out.events;
  console.log('=== generate pass 时间线(相邻差值) ===');
  for (let i = 0; i < ev.length; i++) {
    const prev = i === 0 ? out.t0 : ev[i - 1].at;
    console.log(`${(ev[i].at - prev).toFixed(0).padStart(6)}ms  ${ev[i].label}  p=${ev[i].p.toFixed(2)}`);
  }
} else {
  console.log('未截获 generate(可能走了主线程 fallback!)events=', out.events.length);
}
await browser.close();
