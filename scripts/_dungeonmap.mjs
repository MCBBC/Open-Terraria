// 地牢竖井逐格图:x=dx±12, y=塔顶..worldSurface+10;B=实心+地牢墙 b=实心无墙 .=开放
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
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const dx = g.world.dungeonX, dy = g.world.dungeonY;
  // 地牢墙 id:91-99(取入口处最多见的 wall 值)
  const wallHist = {};
  for (let x = dx - 8; x <= dx + 8; x++) for (let y = dy; y < dy + 60; y++) {
    const w = st.wall[st.idx(x, y)];
    if (w) wallHist[w] = (wallHist[w] || 0) + 1;
  }
  const dWall = +Object.entries(wallHist).sort((a, b) => b[1] - a[1])[0][0];
  const brick = st.type[st.idx(dx, dy + 30)];
  const lines = [];
  for (let y = Math.max(2, dy - 25); y < Math.min(st.h - 1, g.world.groundLevel + 8); y++) {
    let line = `y=${String(y).padStart(4)} `;
    for (let x = dx - 12; x <= dx + 12; x++) {
      const i = st.idx(x, y);
      const w = st.wall[i] === dWall;
      if (!st.flags[i]) line += w ? 'o' : '.';
      else line += w ? (st.type[i] === brick ? 'B' : 'b') : (st.type[i] === brick ? '#' : 'b');
    }
    lines.push(line);
  }
  return { dWall, brick, dx, dy, ground: g.world.groundLevel, lines };
});
console.log(`dx=${out.dx} dy=${out.dy} ground=${out.ground} dWall=${out.dWall} brick=${out.brick}`);
console.log('   x:', Array.from({ length: 25 }, (_, i) => (i === 12 ? '^' : String((i - 12 + 10) % 10)).padEnd(1)).join(''));
for (const l of out.lines) console.log(l);
await browser.close();
