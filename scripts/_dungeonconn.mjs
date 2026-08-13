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
  await page.waitForSelector('select', { timeout: 120000 });
  await page.evaluate((s) => {
    const inp = document.querySelector('input');
    if (inp) inp.value = s;
    document.querySelector('select').selectedIndex = 0;
  }, seed);
  await page.click('button');
  await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
  const r = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const dx = g.world.dungeonX, dy = g.world.dungeonY;
    // 旧统计对照:dx±2 列窗口内从 dy-70 到 ground+40 的最长连续实心段
    let run = 0, maxRun = 0, maxRunTop = 0;
    for (let y = Math.max(2, dy - 70); y < Math.min(st.h - 1, g.world.groundLevel + 40); y++) {
      let solid = 0;
      for (let x = dx - 2; x <= dx + 2; x++) if (st.flags[st.idx(x, y)]) solid++;
      if (solid >= 5) { run++; if (run > maxRun) { maxRun = run; maxRunTop = y - run + 1; } }
      else run = 0;
    }
    // BFS 灌水
    const startY = dy - 1;
    const startI = st.idx(dx, startY);
    const startOpen = !st.flags[startI];
    const seen = new Uint8Array(st.w * st.h);
    const stack = startOpen ? [dx, startY] : [];
    if (startOpen) seen[startI] = 1;
    let maxDeep = startOpen ? startY : -1, count = 0;
    const x0 = Math.max(2, dx - 220), x1 = Math.min(st.w - 3, dx + 220);
    const y0 = Math.max(2, dy - 90), y1 = Math.min(st.h - 3, g.world.rockLevel + 320);
    while (stack.length && count < 400000) {
      const y = stack.pop(), x = stack.pop();
      count++;
      if (y > maxDeep) maxDeep = y;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let k = 0; k < 4; k++) {
        const nx = x + nb[k][0], ny = y + nb[k][1];
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const i = st.idx(nx, ny);
        if (seen[i] || st.flags[i]) continue;
        seen[i] = 1;
        stack.push(nx, ny);
      }
    }
    return {
      seed: g.world.seedText ?? '', w: st.w, h: st.h,
      dx, dy, ground: g.world.groundLevel, rock: g.world.rockLevel,
      startOpen, maxDeep, count, maxRun, maxRunTop,
      conn: startOpen && maxDeep >= g.world.groundLevel + 60,
    };
  });
  check(`种子 ${seed}: 老人位开放`, r.startOpen, `dungeon=(${r.dx},${r.dy})`);
  check(`种子 ${seed}: 入口 BFS 接入地下地牢(深达 ground+60=${r.ground + 60})`,
    r.conn, `maxDeep=${r.maxDeep} visited=${r.count} 列实心段≤${r.maxRun}(top=${r.maxRunTop})`);
  // 对照断言:旧窗口实心段不应再有 50+ 行级堵塞(BFS 为准,此为辅助信号)
  check(`种子 ${seed}: 老人位列窗无巨堵(实心段<40)`, r.maxRun < 40);
}
check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 160));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
