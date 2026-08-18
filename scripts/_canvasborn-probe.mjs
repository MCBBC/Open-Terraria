// canvas 出生栈普查(2026-08-18):_chunkatlas-probe 发现移动期 ~450 张/秒的
// 隐藏 canvas 工厂(与 chunk 无关)——本探针按创建点聚栈,定位真凶。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_canvasborn-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/canvasborn-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  // 聚栈:按第 2-4 帧(跳过 patch 自身)聚合;只记 window 开始计数之后的
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
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,渲染 5s…');
await sleep(5000);
await page.evaluate(() => { window.__bornOn = true; });
console.log('开始移动采样 12s…');
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => { window.__swGame.player.x += 600; });
  await sleep(1500);
}
const stacks = await page.evaluate(() => [...window.__bornStacks.entries()]
  .sort((a, b) => b[1] - a[1]).slice(0, 12));
console.log(`== canvas 出生栈 TOP12(12s 移动期) ==`);
for (const [st, n] of stacks) console.log(`${String(n).padStart(6)}  ${st.slice(0, 220)}`);
await browser.close();
