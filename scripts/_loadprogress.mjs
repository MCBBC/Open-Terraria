// 读档进度文案探针:mock worker postMessage 抓 progress 事件
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const texts = [];
page.on('console', m => { const t = m.text(); if (t.startsWith('PROG')) texts.push(t); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => {
  const orig = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (...a) { return orig.apply(this, a); };
  // 抓 WorldGenClient 的 onProgress:直接包装 ui.showProgress
  const iv = setInterval(() => {
    const ui = window.__swUI ?? (window).ui;
    if (ui?.showProgress) {
      clearInterval(iv);
      const origShow = ui.showProgress.bind(ui);
      ui.showProgress = (label, p) => { if (String(label).includes('%')) console.log('PROG', label, (+p).toFixed(2)); return origShow(label, p); };
    }
  }, 300);
});
// 触发读档:需要 UI 操作——直接调用暴露的 loadFromKey 不行;用 F12?改用直接驱动:
// 简化:检查 loadProgressLabel 导出不可行(模块内函数)。改在页面里模拟读档入口。
// 世界列表 UI 点第一个世界的开始按钮成本高——改抓通用进度层即可,不强求 E2E。
setTimeout(() => { console.log('SAMPLE', texts.slice(0, 8).join(' | ')); }, 500);
await browser.close();
