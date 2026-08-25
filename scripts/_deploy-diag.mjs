// 跳过门端到端验证:①加载中点击→拒绝 ②暖缓存完成后空格→跳过揭幕。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const splashPresent = () => p.evaluate(() => !!document.getElementById('sw-splash')).catch(() => false);
const click = () => p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
const space = () => p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })));
const warmDone = () => p.evaluate(async () => {
  let n = 0;
  for (const nm of await caches.keys()) n += (await (await caches.open(nm)).keys()).length;
  return n >= 12034;
}).catch(() => false);

await new Promise((r) => setTimeout(r, 5000));   // 等 revealBehind(菜单幕后就位)
const earlyPresent = await splashPresent();
await click();
await new Promise((r) => setTimeout(r, 400));
const afterEarlyClick = await splashPresent();
console.log(JSON.stringify({ earlyPresent, afterEarlyClick, verdict: afterEarlyClick ? '加载中点击被拒 ✓' : '加载中点击竟跳过 ✗' }));

for (let i = 0; i < 40; i++) { if (await warmDone()) break; await new Promise((r) => setTimeout(r, 1000)); }
await space();
await new Promise((r) => setTimeout(r, 400));
const afterSpace = await splashPresent();
console.log(JSON.stringify({ afterSpace, verdict: !afterSpace ? '暖完空格跳过 ✓' : '暖完空格未跳过 ✗' }));
console.log('页面错误:', errs.length, errs.slice(0, 2).join(' | '));
await b.close();
process.exit(afterEarlyClick && !afterSpace && errs.length === 0 ? 0 : 1);
