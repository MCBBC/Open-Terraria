// SW-BB1 2026-09-06 备案项清偿实机探针:
//   ① D1 落地账:页签往返(look→hairColor→look / hair 同理)同键重烘请求应被跳过
//      (toBlob 440×80/440×968 编码次数=0;AX1 前每轮 buildContent 都全量重烘+重编码)
//   ② D1 键变仍烘:改发型(箭头)→ 键变 → 恰 1 次 440×968 编码(不漏烘)
//   ③ D2a 重武装:预抢 800ms 窗内 document.hidden=true 跳过后,回前台
//      (hidden=false + visibilitychange)补跑(ensure 再发一次)
//   ④ 快烘不闪 + longtask 守线随批报告
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: '/tmp/cc-bb1-' + (Date.now() % 100000),
  args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const go = await page.evaluate(() => !document.getElementById('sw-splash') && !!document.querySelector('[data-act=sp]'));
  if (go) break;
}
await page.click('[data-act=sp]');
for (let i = 0; i < 20; i++) { if (await page.$('[data-act=new]')) break; await new Promise((r) => setTimeout(r, 250)); }
await page.click('[data-act=new]');
for (let i = 0; i < 20; i++) { if (await page.$('.sw-cc-tab[data-tab=look]')) break; await new Promise((r) => setTimeout(r, 250)); }

await page.evaluate(() => {
  const W = window;
  W.__bb1 = { tob: [], ensure: [], lt: [], t0: performance.now() };
  const A = W.__bb1;
  const oTB = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    const t = performance.now();
    return oTB.call(this, (b) => { A.tob.push({ t, ms: performance.now() - t, w: this.width, h: this.height }); cb(b); }, ...a);
  };
  return import('/src/assets/SpriteAtlas.ts').then(({ SpriteAtlas }) => {
    const oEUB = SpriteAtlas.prototype.ensureUiBatch;
    SpriteAtlas.prototype.ensureUiBatch = function (names, c) {
      A.ensure.push({ t: performance.now(), n: names.length });
      return oEUB.call(this, names, c);
    };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) A.lt.push({ at: +(e.startTime - A.t0).toFixed(0), ms: +e.duration.toFixed(1) }); })
        .observe({ entryTypes: ['longtask'] });
    } catch { /* 无 longtask 支持 */ }
  });
});
await new Promise((r) => setTimeout(r, 300));

// 预热:look 页首烘完成(440×80 编码落地)
const warm = await page.evaluate(async () => {
  document.querySelector('.sw-cc-tab[data-tab=look]').click();
  for (let i = 0; i < 1200; i++) {
    const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
    if (th && (th.style.backgroundImage || '').includes('url')) return true;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
});
console.log('预热(look 首烘落地)=', warm);
await new Promise((r) => setTimeout(r, 1400));   // 越过 800ms 预抢窗(其 ensure 落账为基线)

// ---- ① D1: 页签往返同键重烘跳过 ----
const roundTrip = await page.evaluate(async () => {
  const A = window.__bb1;
  const mark = { tob: A.tob.length, ensure: A.ensure.length };
  const t0 = performance.now();
  document.querySelector('.sw-cc-tab[data-tab=eye]').click();    // → 颜色页(只跑 ensure,无 sheet)
  await new Promise((r) => setTimeout(r, 120));
  document.querySelector('.sw-cc-tab[data-tab=look]').click();   // → 回 look 页(键同 → 应跳过)
  await new Promise((r) => setTimeout(r, 600));                  // 越过 250ms 防抖窗
  // look 页网格仍带图 + baking 类已撤
  const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
  const baked = A.tob.slice(mark.tob).filter((d) => d.w === 440 && d.h === 80);
  return {
    sheetEncodes: baked.length,                                  // D1 前=1(重烘重编码),D1 后=0
    thumbStillHasImage: (th?.style.backgroundImage ?? '').includes('url'),
    ensureCalls: A.ensure.slice(mark.ensure).length,
    ms: performance.now() - t0,
  };
});
console.log('== D1 页签往返(look→eye→look) ==', JSON.stringify(roundTrip));
console.log('   判据: sheetEncodes=0(同键跳过) ∧ thumbStillHasImage=true(现值仍挂)');

// ---- ② D1: 键变仍烘(箭头换发型,键内 hair 变 → 重烘) ----
const hairRebake = await page.evaluate(async () => {
  const A = window.__bb1;
  const mark = A.tob.length;
  const t0 = performance.now();
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();
  const maskOn = await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    if (!el) return res(-1);
    if (el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => { if (el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); } });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 5000);
  });
  const done = await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    const mo = new MutationObserver(() => { if (!el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); } });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 20000);
  });
  // 键变仍烘:hair 页进入=键变(tab 在键内)→ 烘#1;拖发色(键内色变,颜色页 noop);
  // 切回 hair 页 → 键与落地账不同(色变)→ 必须重烘#2。若 D1 误跳过则只见 1 次
  document.querySelector('.sw-cc-tab[data-tab=hairColor]').click();
  await new Promise((r) => setTimeout(r, 120));
  const bar = document.querySelector('.sw-cc-sliderbar');
  const rect = bar.getBoundingClientRect();
  bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + rect.width * 0.5, buttons: 1 }));
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();
  await new Promise((r) => setTimeout(r, 1200));   // 250ms 防抖 + 213 格烘 + 编码
  const bakes = A.tob.slice(mark).filter((d) => d.w === 440 && d.h === 968);
  return { maskOn: maskOn === -1 ? -1 : +maskOn.toFixed(1), maskOff: done === -1 ? -1 : +done.toFixed(1), hairEncodes: bakes.length };
});
console.log('== D1 键变(hair 进入烘#1 + 发色拖动后回切烘#2) ==', JSON.stringify(hairRebake));
console.log('   判据: hairEncodes=2(键变不漏烘,色变未被落地账误跳) ∧ maskOff>0');

// ---- ③ D2a: 预抢被 hidden 跳过 → 回前台补跑 ----
const d2a = await page.evaluate(async () => {
  const A = window.__bb1;
  // 当前面板的预抢已在 look 首烘后跑过(sheetPrefetchDone=true)——重开一个面板验证:
  // 关闭再打开走完整生命周期。先记 hidden 跳过形态:重开面板前把 document.hidden 钉 true
  const back = document.querySelector('[data-act=back]');
  back.click();
  await new Promise((r) => setTimeout(r, 300));
  const before = A.ensure.length;
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });   // 实例 own 属性遮蔽原型 getter
  document.querySelector('[data-act=new]').click();
  for (let i = 0; i < 20; i++) { if (document.querySelector('.sw-cc-tab[data-tab=look]')) break; await new Promise((r) => setTimeout(r, 250)); }
  document.querySelector('.sw-cc-tab[data-tab=look]').click();
  for (let i = 0; i < 1200; i++) {
    const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
    if (th && (th.style.backgroundImage || '').includes('url')) break;
    await new Promise((r) => requestAnimationFrame(r));
  }
  await new Promise((r) => setTimeout(r, 1600));   // 越过 800ms 预抢定时器(hidden 中跳过)
  // 变体域预抢 = 大名单(n>100);烘焙前置 ensureBakeSources = 小名单(look 页 28)。
  const isPrefetch = (e) => e.n > 100;
  const skippedPrefetch = A.ensure.slice(before).filter(isPrefetch).length;
  // 回前台:摘实例遮蔽(露出原型 getter 的真实可见态=false)+派发 visibilitychange(重武装应补跑)
  delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 500));
  const afterVisiblePrefetch = A.ensure.slice(before).filter(isPrefetch).length - skippedPrefetch;
  return { skippedPrefetch, afterVisiblePrefetch };
});
console.log('== D2a 预抢重武装 ==', JSON.stringify(d2a));
console.log('   判据: skippedPrefetch=0(预抢被 hidden 跳过) ∧ afterVisiblePrefetch=1(回前台补跑)');

const lt = await page.evaluate(() => window.__bb1.lt);
console.log(`== longtask == 峰值=${lt.length ? Math.max(...lt.map((e) => e.ms)).toFixed(1) : 0}ms 次数=${lt.length} 明细=[${lt.map((e) => `@+${e.at}:${e.ms}ms`).join(' ')}](守线 ≤61ms)`);
await browser.close();
process.exit(0);
