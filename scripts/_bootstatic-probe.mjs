// 首屏静态加载屏探针:CDP 节流网络,验证①HTML 落地即有原版向日葵加载屏
// (bundle 未完成时,data-URI 零外部请求)②启动幕挂载后静态层被摘除(无缝交接)。
// 用法:SW_ORIGIN=http://localhost:5281 node tools/run-diag.mjs scripts/_bootstatic-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
// ~160KB/s 下载节流:12MB bundle ≈ 70s,窗口足够采样;JS 执行后走完正常链
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 40,
  downloadThroughput: 160 * 1024, uploadThroughput: 160 * 1024,
});
// ★module 脚本阻塞 DCL/load,节流下 goto 任何生命周期都会超时——
//   直接 CDP Page.navigate(导航发起即返回)+ 定长采样(静态层是纯 HTML+CSS,无需 JS)
await cdp.send('Page.enable');
await cdp.send('Page.navigate', { url: ORIGIN });
console.log('[stage] navigated');
page.on('console', (m) => { if (/^\[boot\]/.test(m.text())) console.log('[page]', m.text()); });
await new Promise((r) => setTimeout(r, 2500));
const s1 = await page.evaluate(() => {
  const el = document.getElementById('sw-boot-static');
  if (!el) return { present: false };
  const cs = getComputedStyle(el.querySelector('.sb-flower'));
  return {
    present: true,
    anim: cs.animationName,
    inlineDataUri: cs.backgroundImage.includes('data:image/png;base64,'),
    bgSize: cs.backgroundSize,
    pixelated: cs.imageRendering === 'pixelated',
    veilMounted: !!document.getElementById('sw-boot-prime'),
  };
});
console.log('throttled-early:', JSON.stringify(s1));
await page.screenshot({ path: '/tmp/bootstatic-vanilla.png' });
if (!s1.present || s1.anim !== 'sb-flower' || !s1.inlineDataUri || !s1.pixelated) {
  console.log('FAIL: bundle 下载窗内静态加载屏不在位'); await browser.close(); process.exit(1);
}
if (s1.veilMounted) { console.log('NOTE: 节流下启动幕已先挂载(bundle 或已缓存)——继续验证摘除'); }

// 放开节流,等启动幕挂载 → 静态层应被摘除
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});
await page.waitForFunction(() => !!document.getElementById('sw-boot-prime'), { timeout: 180000 });
const s2 = await page.evaluate(() => ({
  staticGone: !document.getElementById('sw-boot-static'),
  veilMounted: !!document.getElementById('sw-boot-prime'),
}));
console.log('after-veil:', JSON.stringify(s2));
if (!s2.staticGone || !s2.veilMounted) { console.log('FAIL: 启动幕挂载后静态层未摘除'); await browser.close(); process.exit(1); }
console.log('PASS 2/2');
await browser.close();
