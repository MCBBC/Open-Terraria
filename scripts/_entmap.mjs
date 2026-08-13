// 入口结构逐格图:前厅(老人位)→塔身→竖井。B=砖+地牢墙 #=砖无墙 o=开放+地牢墙 .=开放 d=门
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const dx = g.world.dungeonX, dy = g.world.dungeonY;
  const dir = dx > st.w / 2 ? -1 : 1;
  // 塔心在前厅向中心方向 dx1*0.6+dx2*0.55 ≈ 34..44 格
  const towerCx = dx - dir * 40;
  const X0 = Math.min(dx, towerCx) - 30, X1 = Math.max(dx, towerCx) + 30;
  const Y0 = Math.max(2, dy - 60), Y1 = Math.min(st.h - 1, g.world.groundLevel + 30);
  const isDW = (x, y) => { const w = st.wall[st.idx(x, y)]; return w >= 7 && w <= 9 || w >= 94 && w <= 99; };
  const lines = [];
  for (let y = Y0; y < Y1; y++) {
    let line = `y=${String(y).padStart(4)} `;
    for (let x = X0; x <= X1; x++) {
      const i = st.idx(x, y);
      const dw = isDW(x, y);
      let ch;
      if (st.type[i] === 10 || st.type[i] === 388 || st.type[i] === 389) ch = 'd';
      else if (!st.flags[i]) ch = dw ? 'o' : '.';
      else ch = dw ? (st.type[i] === st.type[st.idx(dx, dy + 60)] ? 'B' : 'b') : (st.type[i] === st.type[st.idx(dx, dy + 60)] ? '#' : 'b');
      line += ch;
    }
    lines.push(line);
  }
  return { dx, dy, dir, towerCx, ground: g.world.groundLevel, X0, X1, lines, rowLen: X1 - X0 + 1 };
});
console.log(`dungeon=(${out.dx},${out.dy}) dir=${out.dir} towerCx≈${out.towerCx} ground=${out.ground} x:[${out.X0},${out.X1}]`);
console.log('     ' + Array.from({ length: out.rowLen }, (_, i) => String((i % 10)).slice(-1)).join(''));
for (const l of out.lines) console.log(l);
await browser.close();
