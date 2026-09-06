// SW-RB3 2026-09-06 审计探针#3:F1 修复端到端——close() 落在 toBlob 编码窗内,
//   落地 blob 必须当场回收(修复前=存活 1 泄漏;修复后=存活 0)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: process.env.SW_USERDIR ?? ('/tmp/rb3-ax1c-' + (Date.now() % 100000)),
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

const result = await page.evaluate(async () => {
  const W = window;
  const live = new Set();
  const oCreate = W.URL.createObjectURL.bind(W.URL);
  W.URL.createObjectURL = (b) => { const u = oCreate(b); live.add(u); return u; };
  const oRevoke = W.URL.revokeObjectURL.bind(W.URL);
  W.URL.revokeObjectURL = (u) => { live.delete(u); return oRevoke(u); };
  // 拖慢 toBlob 回调 300ms → 编码窗远超 close 时机
  const oTB = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    return oTB.call(this, (b) => setTimeout(() => cb(b), 300), ...a);
  };
  // look 页暖一烘(旧 sheet 在=重烘路径)
  document.querySelector('.sw-cc-tab[data-tab=look]').click();
  await new Promise((res) => {
    const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
    if (th && (th.style.backgroundImage || '').includes('url')) return res();
    const mo = new MutationObserver(() => {
      const t = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
      if (t && (t.style.backgroundImage || '').includes('url')) { res(); mo.disconnect(); }
    });
    mo.observe(document.querySelector('.sw-cc-look'), { subtree: true, attributes: true, attributeFilter: ['style'] });
    setTimeout(res, 20000);
  });
  live.clear();   // 基线归零(暖烘的 sheet 算面板存量)
  // 随机一击 → 50ms 后点创建(close)——300ms 编码回调在 close 之后落地
  const btn = [...document.querySelectorAll('.sw-cc-looklow .sw-cc-small')].find((b) => (b.querySelector('img')?.src ?? '').includes('Randomize'));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  document.querySelector('[data-act=create]').click();   // close():revokeSheetUrls 先跑
  await new Promise((r) => setTimeout(r, 1200));          // 拖慢的编码落地
  return { liveAfterClose: live.size, panelGone: !document.querySelector('.sw-char-panel') };
});
console.log(`== close()×编码窗竞态 == 存活 blob=${result.liveAfterClose}(修复后应 0) 面板已关=${result.panelGone}`);
console.log(result.liveAfterClose === 0 ? 'OK F1 修复生效:落地 blob 已当场回收' : '!! 泄漏仍存');
await browser.close();
