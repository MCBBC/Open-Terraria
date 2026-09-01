// 有头浏览器 + tooltip 隐藏追踪仪（用户可复现场景用）：
//  打开可见浏览器 → 进世界 → 开背包 → 悬停任意物品。任何把 .sw-tooltip
//  写成 display:none 的代码路径都会打印 [HIDE] + JS 堆栈（直接定位元凶）；
//  元素被移出 DOM 会打印 [DETACH]。Ctrl+C 结束。
//  用法：node tools/run-diag.mjs scripts/_tooltip-trace.mjs（默认 5199）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false, args: ['--no-sandbox'],
  userDataDir: '/tmp/sw-pptr-trace', defaultViewport: null,
});
const page = (await browser.pages())[0] ?? await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[HIDE]') || t.startsWith('[DETACH]')) console.log(t.slice(0, 500)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 }).catch(() => {});
console.log('[trace] 页面就绪——进世界、开背包、悬停物品即可；本仪器打印一切隐藏路径');
await page.evaluate(() => {
  const ui = window.__swUI;
  if (!ui) { console.log('[trace] __swUI 未就绪'); return; }
  const tip = ui.tooltip;
  const proxy = new Proxy(tip.style, {
    set(tgt, prop, val) {
      if (prop === 'display' && val === 'none') {
        try { throw new Error('t'); } catch (e) { console.log('[HIDE]', e.stack.split('\n').slice(1, 6).join(' | ').slice(0, 480)); }
      }
      tgt[prop] = val;
      return true;
    },
    get(tgt, prop) { return tgt[prop]; },
  });
  Object.defineProperty(tip, 'style', { get() { return proxy; }, configurable: true });
  new MutationObserver((muts) => {
    for (const mu of muts) for (const n of mu.removedNodes) if (n === tip) console.log('[DETACH] tooltip 被移出 DOM，父=', String(mu.target.className).slice(0, 40));
  }).observe(ui.root, { childList: true, subtree: true });
  new MutationObserver((muts) => {
    for (const mu of muts) if (mu.target === tip && mu.attributeName === 'style') {
      const d = /display:\s*([^;]+)/.exec(mu.target.getAttribute('style') || '')?.[1] ?? '(unset)';
      if (d !== 'block') console.log('[STYLE] display→' + d);
    }
  }).observe(tip, { attributes: true, attributeFilter: ['style'] });
});
// 保持运行直到用户 Ctrl+C
await new Promise(() => {});
