// 烟囱格状态持续监控:有没有什么逻辑在改这些格子?
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 480, height: 360 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 收集所有烟囱格世界坐标与初始状态
  const chimneyCells = [];
  for (let x = 4128; x <= 4134; x++) {
    for (let y = 432; y <= 440; y++) {
      const i = st.idx(x, y);
      if (st.type[i] === 224) chimneyCells.push({ x, y, i, t0: 224 });
    }
  }
  // 确认数
  const cellCount = chimneyCells.length;
  // 设时间到白天让画面可见
  g.world.clock.timeOfDay = 0.35;   // 正午偏前
  // 监听 10s 内是否有任何变化
  const changes = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    for (const c of chimneyCells) {
      const i = c.i;
      const curT = st.type[i];
      const curFl = st.flags[i];
      const curFx = st.frameX[i], curFy = st.frameY[i];
      if (curT !== 224 || curFl === 0 || curFx !== c.fx || curFy !== c.fy) {
        changes.push({ x: c.x, y: c.y, was: '224', now: curT, fl: curFl, fx: curFx, fy: curFy, tick: Date.now() - t0 });
        c.t0 = curT; c.fx = curFx; c.fy = curFy; // 更新基准继续监控
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { cellCount, changeCount: changes.length,
    changes: changes.slice(0, 10),
    cellsSnapshot: chimneyCells.map((c) => ({ x: c.x, y: c.y })), done: true };
});
console.log(JSON.stringify(result, null, 1));
fs.writeFileSync('/tmp/chimney-cells.json', JSON.stringify(result));
await browser.close();
