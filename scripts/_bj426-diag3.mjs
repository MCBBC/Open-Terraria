// BJ426 诊断探针③：复检 diag1 放置点的支撑来源（墙/下方格实况）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const R = { trace: [] };
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  R.trace.push(`sy(first solid @x=400)=${sy}`);
  for (let x = 398; x <= 408; x++) {
    let cols = [];
    for (let y = sy - 4; y <= sy + 3; y++) {
      cols.push(`${y}:${st.type[st.idx(x, y)]}/${st.isSolid(x, y) ? 'S' : '-'}/w${st.wall[st.idx(x, y)]}`);
    }
    R.trace.push(`x=${x} ${cols.join(' ')}`);
  }
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
