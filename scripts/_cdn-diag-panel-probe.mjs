// 诊断面板端到端:冷启动→揭幕→logo 连点5次+句柄双路触发→断言面板与 trace 内容
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/cdn-diag-' + (Date.now() % 100000), args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 48; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  if (await page.$('[data-act=sp]')) break;
}
// 路 A:logo 连点 5 次(真实坐标 pointerdown,走 window 捕获——与手指一致)
for (let i = 0; i < 5; i++) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('.sw-title-logo')?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (!box) break;
  await page.mouse.pointerDown ? null : null;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 120));
}
let r = await page.evaluate(() => ({
  panelA: !!document.getElementById('sw-asset-diag'),
  hasHandle: typeof window.__swAssetDiag === 'function',
}));
console.log('连点5次:', JSON.stringify(r));
// 路 B:句柄直调(兜底/对照)
if (!r.panelA) {
  r = await page.evaluate(() => {
    try { window.__swAssetDiag(); } catch (e) { return { handleErr: String(e) }; }
    return { panelB: !!document.getElementById('sw-asset-diag') };
  });
  console.log('句柄直调:', JSON.stringify(r));
}
const final = await page.evaluate(() => {
  const ta = document.querySelector('#sw-asset-diag textarea');
  return { lines: ta ? ta.value.split('\n').length : 0, head: ta ? ta.value.split('\n').slice(-6) : [] };
});
console.log('trace 行数:', final.lines);
console.log(final.head.join('\n'));
console.log(final.lines > 3 ? '✅ 诊断面板可用' : '❌ 面板不可用');
await browser.close();
process.exit(final.lines > 3 ? 0 : 1);
