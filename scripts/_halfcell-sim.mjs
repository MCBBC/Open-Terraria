// 半砖格液体状态追踪:加载后 0/3/10s 读"半砖格与其上格"的液位,看 sim 是否把水沉入半砖格。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (5).json')), 'utf8');
// (半砖格, 上格) 对:取 round-4 标注 #1/#2/#3 的左邻半砖与其上格
const pairs = [[881, 282, 881, 281], [878, 284, 878, 283], [845, 280, 845, 279], [3989, 303, 3989, 302]];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile15'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

const read = () => page.evaluate((ps) => {
  const g = window.__swGame;
  const st = g.world.store;
  return ps.map(([hx, hy, ux, uy]) => {
    const hi = st.idx(hx, hy), ui = st.idx(ux, uy);
    return `half(${hx},${hy}) lq=${st.liquid[hi]} type=${st.type[hi]} | up(${ux},${uy}) lq=${st.liquid[ui]}`;
  });
}, pairs);
console.log('[t=0.5s]', (await read()).join('  '));
await new Promise((r) => setTimeout(r, 3000));
console.log('[t=3.5s]', (await read()).join('  '));
await new Promise((r) => setTimeout(r, 7000));
console.log('[t=10s]', (await read()).join('  '));
await browser.close();
