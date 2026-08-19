// 湖左缘(x342-368, y236-250)数据倒库:liquid/half/slope/tile sheet + 截图裁剪。
// 目标:定位"半砖/坡面水没水面线"的确切几何。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dline5-profile',
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
  g.player.x = 385 * 16; g.player.y = 232 * 16;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 12000));
const dump = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = window.__swDebugHooks ?? {};
  const rows = [];
  for (let y = 236; y <= 250; y++) {
    const cells = [];
    for (let x = 342; x <= 368; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      let sheet = 0;
      // 通过 renderer 的贴图登记反查太重;直接用全局 TILE_DEFS(经 vite 模块)
      cells.push({ x, lq: st.liquid[i], lt: st.liquidType[i], t, half: st.half[i] ? 1 : 0,
        sl: st.slope[i], fl: st.flags[i] ? 1 : 0, w: st.wall[i] });
    }
    rows.push({ y, cells });
  }
  return rows;
}).catch((e) => ({ err: String(e).slice(0, 300) }));
// 打印紧凑矩阵:x 轴 342..368。lq=液体量 h=半砖 s=坡面 t=tile内码(.=0)
for (const row of dump.err ? [dump] : dump) {
  if (row.err) { console.log(row.err); break; }
  const line = row.cells.map((c) => {
    const lq = c.lq ? (c.lq > 240 ? '█' : c.lq > 160 ? '▓' : c.lq > 80 ? '▒' : '░') : '·';
    const mark = c.half ? 'h' : c.sl ? '' + c.sl : '';
    return lq + mark;
  }).join('');
  console.log(`y${row.y} ${line}`);
}
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) fs.writeFileSync('/Users/vinlic/.claude/jobs/8405c930/tmp/dline5.png', shot);
await browser.close();
