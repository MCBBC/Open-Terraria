// IIII220 侧探针:small 世界的 hell 结构普查(ash/岩浆/既有药草分布)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const census = {};
  const ashRows = {};
  for (let y = st.h - 300; y < st.h - 10; y++) {
    for (let x = 10; x < st.w - 10; x += 2) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      census[t] = (census[t] ?? 0) + 1;
      if (t === 57) ashRows[y] = (ashRows[y] ?? 0) + 1;
    }
  }
  const rows = Object.entries(ashRows).map(([y, n]) => ({ y: +y, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  // 全图既有药草普查(82/83/84 各 frameX 档计数)
  const herbs = {};
  for (let y = 10; y < st.h - 10; y += 1) {
    for (let x = 10; x < st.w - 10; x += 1) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      if (t === 82 || t === 83 || t === 84) {
        const k = `t${t}_fx${st.frameX[i]}`;
        herbs[k] = (herbs[k] ?? 0) + 1;
      }
    }
  }
  return { h: st.h, w: st.w, ashTopRows: rows, herbCensus: herbs, ashTotal: Object.values(ashRows).reduce((a, b) => a + b, 0) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
