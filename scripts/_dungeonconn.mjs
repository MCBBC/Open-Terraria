// 地牢入口连通性验证(堵塔修复回归):多种子 BFS——从守卫老人位(=原版 Main.dungeonX/Y)
// 沿开放格 4 向灌水,断言能灌到 groundLevel+60 以下(= 真正接入地下地牢)。
// 旧法(列扫描最长实心段)对斜井会误报,BFS 是连通的构造性证明。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const SEEDS = ['12345', '9293480', '20260811', '2147483647'];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

for (const seed of SEEDS) {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000 });
  await page.evaluate((s) => window.__swFlow.newWorld(s, 4200, 1200), seed);
  await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
  const r = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const dx = g.world.dungeonX, dy = g.world.dungeonY;
    // BFS 灌水:门 tile(内部 id 17 关/18 开,tiles.ts:34)视为可通行(原版门可开,不是墙);
    // 断言 = 最深"地牢墙开放格"(竖井/房厅挖空格自带地牢墙,天然洞穴没有)
    const DOOR = new Set([17, 18]);
    const passable = (i) => !st.flags[i] || DOOR.has(st.type[i]);
    const startY = dy - 1;
    const startI = st.idx(dx, startY);
    const startOpen = passable(startI);
    const seen = new Uint8Array(st.w * st.h);
    const stack = startOpen ? [dx, startY] : [];
    if (startOpen) seen[startI] = 1;
    let maxDeep = startOpen ? startY : -1, maxDeepDW = -1, count = 0;
    const x0 = Math.max(2, dx - 400), x1 = Math.min(st.w - 3, dx + 400);
    const y0 = Math.max(2, dy - 90), y1 = Math.min(st.h - 3, g.world.rockLevel + 320);
    const isDW = (x, y) => { const w = st.wall[st.idx(x, y)]; return w >= 7 && w <= 9 || w >= 94 && w <= 99; };
    while (stack.length && count < 600000) {
      const y = stack.pop(), x = stack.pop();
      count++;
      if (y > maxDeep) maxDeep = y;
      if (y > maxDeepDW && isDW(x, y)) maxDeepDW = y;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let k = 0; k < 4; k++) {
        const nx = x + nb[k][0], ny = y + nb[k][1];
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const i = st.idx(nx, ny);
        if (seen[i] || !passable(i)) continue;
        seen[i] = 1;
        stack.push(nx, ny);
      }
    }
    return {
      seed: g.world.seedText ?? '', w: st.w, h: st.h,
      dx, dy, ground: g.world.groundLevel, rock: g.world.rockLevel,
      startOpen, maxDeep, maxDeepDW, count,
      conn: startOpen && maxDeepDW >= g.world.rockLevel - 80,
    };
  });
  check(`种子 ${seed}: 老人位开放`, r.startOpen, `dungeon=(${r.dx},${r.dy})`);
  check(`种子 ${seed}: 入口经门接塔→竖井→地牢深处(最深地牢墙格≥rock-80=${r.rock - 80})`,
    r.conn, `maxDeepDW=${r.maxDeepDW} maxDeep=${r.maxDeep} visited=${r.count}`);
}
check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 160));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
