// getContext/画布创建风暴归因（#perf2026-08-28 trace t2.6-3.9s 段 ~1.3s）:
// evaluateOnNewDocument 阶段包装 HTMLCanvasElement.prototype.getContext /
// createElement('canvas') / OffscreenCanvas,进入世界后回收:
//   总数/总耗时/按类型分布 + >3ms 慢创建的 stack 特征(截 bundle:line);
// 另测 window 进世界前后的差分窗口(以 __swGame.world 就绪为界)。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const W = window;
  const rep = { total: 0, ms: 0, byType: {}, slow: [], canvases: 0, diffN: 0, diffMs: 0, diffOn: false };
  W.__ctxRep = rep;
  W.__ctxSnap = () => { rep.diffN = 0; rep.diffMs = 0; rep.diffOn = true; };
  const C = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error 原型包装
  HTMLCanvasElement.prototype.getContext = function (...a) {
    const t0 = performance.now();
    const r = C.apply(this, a);
    const dt = performance.now() - t0;
    rep.total++; rep.ms += dt;
    const k = String(a[0]);
    rep.byType[k] = (rep.byType[k] || 0) + 1;
    if (rep.diffOn) { rep.diffN++; rep.diffMs += dt; }
    if (dt > 3 && rep.slow.length < 80) {
      const st = (new Error().stack || '').split('\n').slice(2, 6)
        .map((s) => s.replace(/^.*?at /, '').replace(/\?.*$/, '').slice(0, 140)).join(' ← ');
      rep.slow.push({ dt: Math.round(dt), w: this.width, h: this.height, type: k, st });
    }
    return r;
  };
  // 零侵入数新画布:MutationObserver 记进 DOM 的 canvas 节点(挂不进树的临时画布漏计——够归因用)
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes)
      if (n?.tagName === 'CANVAS') rep.canvases++;
  }).observe(document, { childList: true, subtree: true });
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
// 建 char+world（与 perf-parity 探针同路）：无角色→新建角色；有角色→直接进世界列表
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('ctxprobe');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
}
if (!(await page.$('.sw-vsel .sw-vitem'))) throw new Error('角色创建后仍无 vitem');
// ★开始差分窗口:从点击"进世界"起
await page.evaluate(() => window.__ctxSnap());
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(() => {});
if (!(await page.$('[data-f=seed]'))) {
  await page.click('.sw-vsel [data-act=new]').catch(() => {});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(() => {});
}
if (await page.$('[data-f=seed]')) {
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click();
  });
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 2000));
const rep = await page.evaluate(() => {
  const r = window.__ctxRep;
  // stack 聚合:同文件前缀合并
  const agg = {};
  for (const s of r.slow) {
    const key = s.st.split(' ← ').map(x => x.replace(/:\d+:\d+$/, '')).join('←');
    agg[key] = agg[key] || { n: 0, ms: 0, sample: s };
    agg[key].n++; agg[key].ms += s.dt;
  }
  return { ...r, agg: Object.entries(agg).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12) };
});
console.log(JSON.stringify(rep, (k, v) => k === 'slow' ? v.slice(0, 8) : v, 2));
await browser.close();
