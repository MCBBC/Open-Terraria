// 重试按钮 force 路径合成验证:删 3 条缓存 → warm(true) → 断言补齐回满
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5311', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
const res = await page.evaluate(async () => {
  const h = window.__swAssetCache;
  if (!h) return { fail: 'no handle' };
  // 删 3 条缓存(合成"部分清理+失败"场景)
  const keys = await caches.keys();
  const cache = await caches.open(keys[0]);
  const all = await cache.keys();
  for (let i = 0; i < 3; i++) await cache.delete(all[i]);
  const before = (await cache.keys()).length;
  // force 重拉(=门槛弹窗重试按钮同一路径)
  h.warm(true);
  // 等补齐
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = h.state();
    if (st.phase === 'done') break;
  }
  const after = (await cache.keys()).length;
  return { before, after, state: h.state(), complete: h.complete() };
});
console.log(JSON.stringify(res, null, 1));
console.log(res.complete && res.after >= res.before + 3 ? 'PASS: force 重试补齐' : 'FAIL');
await browser.close();
