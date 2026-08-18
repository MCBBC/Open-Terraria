// 第三工厂追捕(2026-08-19):哨兵实报 new Fp 构造器形态,107 连窗 ~9 分钟,
// 暂停中也持续。模拟用户环境 = 资产慢速长尾到达(所有 vanilla 图随机延迟
// 300-900ms,把加载期拉长到分钟级)+ 90s 采样 + 30s 处暂停,聚栈定位。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=400000 scripts/_slowload-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/slowload-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
// 全部 vanilla 图随机延迟(拉长加载尾巴到分钟级 = 用户环境)
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const d = /\/sprites\/vanilla\//.test(u) ? 300 + Math.random() * 600 : 0;
  if (d) setTimeout(() => req.continue().catch(() => {}), d);
  else req.continue().catch(() => {});
});
await page.evaluateOnNewDocument(() => {
  window.__bornStacks = new Map();
  window.__bornOn = false;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas' && window.__bornOn) {
      const st = (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/^at\s+/, '')).join(' | ');
      window.__bornStacks.set(st, (window.__bornStacks.get(st) || 0) + 1);
    }
    return orig(tag, ...rest);
  };
});
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 180000 });
console.log('世界就绪,开始 90s 采样(30s 处暂停;加载尾巴拉长中)…');
await page.evaluate(() => { window.__bornOn = true; });
// 走动期 0-30s
for (let i = 0; i < 10; i++) {
  await page.evaluate((k) => { const p = window.__swGame.player; p.x += 500; if (k % 2) p.y += 150; }, i);
  await sleep(3000);
}
// 暂停期 30-60s(用户实报暂停中持续)
await page.evaluate(() => { window.__swGame.paused = true; });
console.log('-- 暂停中 --');
const pausedAt = Date.now();
await sleep(30000);
// 恢复走动 60-90s
await page.evaluate(() => { window.__swGame.paused = false; });
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => { window.__swGame.player.x -= 500; });
  await sleep(3000);
}
const stacks = await page.evaluate(() => [...window.__bornStacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
console.log('== canvas 出生栈 TOP10(90s:走动30+暂停30+走动30)==');
for (const [st, n] of stacks) console.log(`${String(n).padStart(6)}  ${st.slice(0, 200)}`);
await browser.close();
