// 湖缘精确 JSON 倒库(x358-380, y236-248):liquid/half/slope/type/sheet。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dline6-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.setDefaultTimeout(420000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 360000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 374 * 16; g.player.y = 232 * 16;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 12000));
const dump = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const mod = await import('/src/data/tiles.ts');
  const out = [];
  for (let y = 236; y <= 248; y++) {
    const cells = [];
    for (let x = 358; x <= 380; x++) {
      const i = st.idx(x, y);
      const def = mod.TILE_DEFS[st.type[i]];
      cells.push({ x, lq: st.liquid[i], half: !!st.half[i], sl: st.slope[i],
        sheet: def?.vanilla?.sheet ?? null, solid: !!def?.solid });
    }
    out.push({ y, cells });
  }
  return out;
}).catch((e) => ({ err: String(e).slice(0, 300) }));
if (dump.err) console.log(dump.err);
else for (const r of dump) {
  console.log(`y${r.y}: ` + r.cells.map((c) =>
    `${c.lq ? 'L' + c.lq : '··'}${c.half ? 'h' : ''}${c.sl ? 's' + c.sl : ''}${c.sheet != null && c.lq === 0 && !c.half && !c.sl ? '[' + c.sheet + ']' : ''}`
  ).join(' '));
}
await browser.close();
