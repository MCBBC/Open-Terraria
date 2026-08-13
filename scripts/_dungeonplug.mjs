// 地牢入口塔堵塞复现:种子 12345 小世界,检查 dungeonX 列从塔顶到地表的实心段
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 3000));

const scan = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const dx = g.world.dungeonX, dy = g.world.dungeonY;
  const rows = [];
  for (let y = Math.max(0, dy - 30); y < Math.min(st.h - 1, g.world.groundLevel + 30); y++) {
    let solid = 0, brick = 0, wall = 0, open = 0;
    for (let x = dx - 4; x <= dx + 4; x++) {
      const i = st.idx(x, y);
      if (st.flags[i]) { solid++; if (st.type[i] === st.type[st.idx(dx, dy)]) brick++; }
      else open++;
      if (st.wall[i]) wall++;
    }
    rows.push({ y, solid, open, wall });
  }
  // 找从 dy 向下的首个开放行(连通判定)与最长连续实心段
  let firstOpen = -1, run = 0, maxRun = 0, maxRunY = 0;
  for (const r of rows) {
    if (r.open >= 3) { if (firstOpen < 0 && r.y > dy) firstOpen = r.y; if (run > maxRun) { maxRun = run; maxRunY = r.y - run; } run = 0; }
    else run++;
  }
  if (run > maxRun) { maxRun = run; maxRunY = rows[rows.length - 1].y - run + 1; }
  return { dx, dy, ground: g.world.groundLevel, firstOpenBelow: firstOpen, maxSolidRun: maxRun, maxSolidRunTop: maxRunY, rows: rows.filter(r => r.y % 10 === 0 || (r.y >= dy - 2 && r.y <= dy + 6)) };
});
console.log(JSON.stringify({ dx: scan.dx, dy: scan.dy, ground: scan.ground, firstOpenBelow: scan.firstOpenBelow, maxSolidRun: scan.maxSolidRun, maxSolidRunTop: scan.maxSolidRunTop }, null, 1));
console.log('rows (y:solid/open/wall):');
for (const r of scan.rows) console.log(`  y=${r.y} solid=${r.solid} open=${r.open} wall=${r.wall}`);
await browser.close();
