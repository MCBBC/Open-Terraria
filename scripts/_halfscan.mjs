// 全图扫描:半砖格的液体分布(半砖格有液 vs 上格有液半砖格无液),
// 以及"水在半砖上"构型统计——判定我们存档的液体状态 vs 原版可达态。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (5).json', 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope-profile17',
  args: ['--no-first-run'], defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

const stats = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  let halfWet = 0, halfDryUpWet = 0, halfDryUpDry = 0;
  const examples = [];
  for (let y = 2; y < st.h - 2; y++) {
    for (let x = 2; x < st.w - 2; x++) {
      const i = st.idx(x, y);
      if (!st.half[i]) continue;
      const up = st.liquid[st.idx(x, y - 1)];
      if (st.liquid[i] > 0) { halfWet++; if (examples.wet < 3) examples.push(`wet(${x},${y}) lq=${st.liquid[i]} up=${up}`); }
      else if (up > 0) { halfDryUpWet++; if (examples.length < 6) examples.push(`dryUpWet(${x},${y}) up=${up}`); }
      else halfDryUpDry++;
    }
  }
  return { halfWet, halfDryUpWet, halfDryUpDry, examples };
});
console.log(JSON.stringify(stats, null, 1));
await browser.close();
