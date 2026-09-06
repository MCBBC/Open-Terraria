// SW-RB3 2026-09-06 审计探针#2:慢烘遮罩可见性 + 切页残留 + 慢烘不闪窗边界。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: process.env.SW_USERDIR ?? ('/tmp/rb3-ax1b-' + (Date.now() % 100000)),
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
await new Promise((r) => setTimeout(r, 300));

await page.evaluate(() => {
  const W = window;
  W.__rb3 = { mask: [] };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target;
      if (el.classList?.contains('sw-cc-hair') || el.classList?.contains('sw-cc-look')) {
        W.__rb3.mask.push({ t: performance.now(), on: el.classList.contains('baking'), page: el.classList.contains('sw-cc-hair') ? 'hair' : 'look' });
      }
    }
  });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
await new Promise((r) => setTimeout(r, 200));

// ---- 慢烘可见性:hair 页重烘路径(旧 sheet 已在)清 PaperDoll 缓存后经 tab 重入
//        触发 213 格重烘(>120ms)→ arm(false) 延迟挂应转可见、烘完摘除。
//        (注:hair 页随机钮=setHair,不改 sheet 内容、不触发烘——正确设计) ----
const slow = await page.evaluate(async () => {
  // 先进 hair 页暖一次(建立旧 sheet = 重烘路径前提)
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();
  await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    const th = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
    if (th && (th.style.backgroundImage || '').includes('url') && !el.classList.contains('baking')) return res();
    const mo = new MutationObserver(() => {
      const t = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
      if (t && (t.style.backgroundImage || '').includes('url') && !el.classList.contains('baking')) { res(); mo.disconnect(); }
    });
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    setTimeout(res, 20000);
  });
  const { clearPaperDollCache } = await import('/src/player/PaperDoll.ts');
  clearPaperDollCache();   // 强制重烘全量重合成(慢烘形态)
  window.__rb3.mask.length = 0;
  const t0 = performance.now();
  // tab 重入 hair = buildHair 复用支尾部 scheduleSheetBake(0) → 重烘(旧 sheet 在=延迟挂)
  document.querySelector('.sw-cc-tab[data-tab=info]').click();
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();
  const maskOn = await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    if (el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      if (el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 5000);
  });
  const maskOff = await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    if (!el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      if (!el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 10000);
  });
  return { maskOn, maskOff };
});
console.log(`== 慢烘(清缓存后 hair tab 重入重烘) == 遮罩挂=${slow.maskOn.toFixed(1)}ms(应 ≥120 或 -1=烘<120ms) 摘=${slow.maskOff.toFixed(1)}ms  ${slow.maskOff > slow.maskOn ? 'OK 烘完摘除' : '!!'}`);

// ---- 切页残留:hair 重烘遮罩在场(或延迟窗内)时切 look → look 页不得被挂遮罩;
//      落地后双页 baking 均清 ----
await page.evaluate(async () => {
  const { clearPaperDollCache } = await import('/src/player/PaperDoll.ts');
  clearPaperDollCache();
  document.querySelector('.sw-cc-tab[data-tab=info]').click();
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();   // 重烘起飞(213 格)
});
await new Promise((r) => setTimeout(r, 15));
await page.evaluate(() => document.querySelector('.sw-cc-tab[data-tab=look]').click());   // 烘焙中切页
await new Promise((r) => setTimeout(r, 1500));
await new Promise((r) => setTimeout(r, 1500));
const residue = await page.evaluate(() => {
  const look = document.querySelector('.sw-cc-look');
  const hair = document.querySelector('.sw-cc-hair');
  const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
  return {
    lookBaking: !!look && look.classList.contains('baking'),
    hairInDom: !!hair,
    lookThumbHasSheet: !!(th && (th.style.backgroundImage || '').includes('url')),
    events: window.__rb3.mask.slice(-8),
  };
});
console.log(`== 切页残留 == look.baking=${residue.lookBaking}(应 false) look 缩略图有 sheet=${residue.lookThumbHasSheet}  ${!residue.lookBaking && residue.lookThumbHasSheet ? 'OK 无残留' : '!! 残留/未挂图'}`);
console.log(`尾部 baking 事件: ${JSON.stringify(residue.events)}`);

await browser.close();
