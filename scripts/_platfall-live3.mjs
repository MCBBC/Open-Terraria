// 带钩子的实机重放:同 live2 流程 + __SW_SLOPE_LOG 全量捕获
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T10-38-59-497Z.json', 'utf8'));
const TERRAIN = LOG.meta.terrain;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
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

let anchor = null;
for (const e of LOG.events) {
  if (e.k === 'sample' && e.d.x / 16 < 3200 && e.d.x / 16 > 3140) { anchor = { t: e.t, x: e.d.x, y: e.d.y }; break; }
}
console.log('[pf3] anchor t', anchor.t, 'x', (anchor.x / 16).toFixed(1));
const KEYS = LOG.events.filter(e => e.k === 'key').map(e => ({ t: e.t - anchor.t, c: e.d.c, down: e.d.down }));
const END_T = KEYS[KEYS.length - 1].t + 30;

const out = await page.evaluate(async ({ cells, anchor, KEYS, END_T }) => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  for (const [k, v] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    st.setTile(x, y, v[0]);
    const i = st.idx(x, y);
    st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] |= 1;
    if (v[3]) st.flags[i] |= 64; st.wire[i] = 0;
  }
  await new Promise(r => setTimeout(r, 250));
  p.x = anchor.x; p.y = anchor.y; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 500));
  // ★开启 slopeCollide 取证
  (window).__SW_SLOPE_LOG = [];
  const t0 = g.tickCount;
  const samples = [];
  const held = new Set();
  let ki = 0;
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      const rel = g.tickCount - t0;
      while (ki < KEYS.length && KEYS[ki].t <= rel) {
        const k = KEYS[ki];
        if (k.down) { g.input.keys.add(k.c); held.add(k.c); } else { g.input.keys.delete(k.c); held.delete(k.c); }
        ki++;
      }
      samples.push({ t: rel, x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), g: !!p.onGround });
      if (rel > END_T || ki >= KEYS.length && rel > END_T) { for (const k of held) g.input.keys.delete(k); resolve(); }
    }, 1000 / 60);
  });
  return {
    samples,
    slog: (window).__SW_SLOPE_LOG.slice(-400),
  };
}, { cells: TERRAIN.cells, anchor, KEYS, END_T });

writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/pf3.json', JSON.stringify(out));
console.log('[pf3] samples:', out.samples.length, 'slog:', out.slog.length);
await browser.close();
