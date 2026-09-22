// ★BJ276 信息栏文本方案 B(动态读数直绘)探针:churn/出生率/帧时/观感 A/B 留证。
// 用法:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj276-infobar-planb.mjs <tag> <dpr>
//   tag  = before|after(输出文件名标记;before=烘焙管线基线,after=方案 B)
//   dpr  = 2(hidpi 档,Mac Retina)|1(pixel 档,Windows 100%)
// 断言/产物:
//  ① 实机 canvas 出生率(测量窗内 document.createElement('canvas') 增量;烘焙 churn 面)
//  ② 实机 fillText/drawImage(canvas 源)计数:信息行动态面走哪条路径的机制指纹
//     (before=信息行 fillText=0 且 bake blit 每帧;after=信息行 fillText>0 且 bake blit=0)
//  ③ 帧时(rAF 间隔 avg/p50/p95/max + >25ms 帧数,行走 12s 窗;GPU 页禁 trace,只用 rAF)
//  ④ 受控 A/B 台架(白底,同一动态读数串):烘焙路径(真实 drawBakedMouseText)vs
//     直绘路径(after=真实 drawDirectMouseText;before=同式内联复刻)——
//     ramp(中间调)/hard(硬边对)/solid(实心芯)三度量(FX58 同式)+行带截图
//  ⑤ 截图:/tmp/bj276-<tag>-dpr<dpr>-infobar.png(实机信息栏)/-bench.png(台架)/-full.png
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// run-diag 子进程 argv = [node, self, '--_child', <script>, <tag>, <dpr>] → 取尾部两参
const TAIL = process.argv.slice(-2);
const TAG = 'ambient';
const DPR = Number.isFinite(Number(TAIL[1])) ? Number(TAIL[1]) : 2;
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5202') + '/?dev=1';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: DPR },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 全局仪表:canvas 出生计数 + fillText(按 font 分桶)+ canvas 源 5 参 drawImage + rAF 间隔
// evaluateOnNewDocument=在页面任何脚本前装表(捕获启动期全部出生)
await page.evaluateOnNewDocument(() => {
  const w = window;
  // 预种欢迎横幅 ack(WelcomeAnnounce z-60 会撕后续截图/挡行走;探针坑先例)
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ }
  w.__swBirths = 0;
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag, ...rest) {
    if (String(tag).toLowerCase() === 'canvas') w.__swBirths++;
    return origCreate(tag, ...rest);
  };
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('BJ276探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 【ambient】不授饰品/不行走:闲置出生基线(排除文本 churn 面)
const b0 = await page.evaluate(() => window.__swBirths);
await new Promise((r) => setTimeout(r, 12000));
const b1 = await page.evaluate(() => window.__swBirths);
console.log(`[bj276-ambient] idle 12s births=${b1 - b0} (${((b1 - b0) / 12).toFixed(1)}/s) boot总出生=${b1}`);
check('页面零报错', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`[bj276] RESULT ambient: pass=${pass} fail=${fail}`);
await browser.close();
process.exit(0);
