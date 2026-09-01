// 实机精确步行取证:用户精确起步点 KeyD 纯步行 + __SW_SLOPE_LOG 全量捕获
// 场景 A: x3163.8(用户 t885 静止点)  场景 B: x3166.1(用户 t945 KeyD 起步点)
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T10-38-59-497Z.json', 'utf8'));
const CELLS = LOG.meta.terrain.cells;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pgerr]', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:4199') + '/?play=small', { waitUntil: 'domcontentloaded' });
{
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise(r => setTimeout(r, 2000));
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.player));
  }
  if (!ok) throw new Error('boot timeout');
}
await new Promise(r => setTimeout(r, 1200));

const SCENARIOS = [
  { name: 'A-x3163.8', startX: 3163.8 },
  { name: 'B-x3166.1', startX: 3166.1 },
  { name: 'C-x3164.4-用户demo1', startX: 3164.4 },
];

const results = {};
for (const sc of SCENARIOS) {
  results[sc.name] = await page.evaluate(async ({ cells, startX }) => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
    await new Promise(r => setTimeout(r, 150));
    for (const [k, v] of Object.entries(cells)) {
      const [x, y] = k.split(',').map(Number);
      st.setTile(x, y, v[0]);
      const i = st.idx(x, y);
      st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] |= 1;
      if (v[3]) st.flags[i] |= 64; st.wire[i] = 0;
    }
    await new Promise(r => setTimeout(r, 250));
    // 起步摆放(用户 ft275.0 站立位)
    p.x = startX * 16; p.y = 275 * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = false;
    p.fallStartY = p.y;
    await new Promise(r => setTimeout(r, 600));   // 等落地稳定
    const holdD = g.input.keys.has('KeyD');
    // 清空取证日志并起步
    (window).__SW_SLOPE_LOG = [];
    (window).__SW_SLOPE_LOG.push(`MARK start x=${p.x.toFixed(2)} h=${p.h} feet=${(p.y + p.h).toFixed(2)} wasD=${holdD}`);
    g.input.keys.add('KeyD');
    const t0 = g.tickCount;
    const samples = [];
    await new Promise((resolve) => {
      let n = 0;
      const iv = setInterval(() => {
        const rel = g.tickCount - t0;
        if (rel % 10 === 0) (window).__SW_SLOPE_LOG.push(`MARK t=${rel}`);
        samples.push({ t: rel, x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), g: !!p.onGround, h: p.h });
        if (++n >= 200) { g.input.keys.delete('KeyD'); resolve(); }
      }, 1000 / 60);
    });
    return { samples, slog: (window).__SW_SLOPE_LOG.slice(), h: p.h };
  }, { cells: CELLS, startX: sc.startX });
  console.log(`[pf4] ${sc.name}: samples=${results[sc.name].samples.length} slog=${results[sc.name].slog.length} h=${results[sc.name].h}`);
}

writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/pf4.json', JSON.stringify(results));
console.log('[pf4] done → pf4.json');
await browser.close();
