// 实机精确重放:完整日志地形 + 用户真实按键时间线逐 tick 驱动
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T10-38-59-497Z.json', 'utf8'));
const TERRAIN = LOG.meta.terrain;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (t.includes('[pf2]')) console.log(t); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5202') + '/?play=small', { waitUntil: 'domcontentloaded' });
page.on('pageerror', e => console.log('[pgerr]', String(e).slice(0, 160)));
{
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise(r => setTimeout(r, 2000));
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.player));
    if (i % 5 === 4 || ok) console.log('[boot]', i * 2 + 's', await page.evaluate(() => ({ g: !!window.__swGame, body: document.body.innerText.slice(0, 60) })).then(v => JSON.stringify(v)));
  }
  if (!ok) throw new Error('boot timeout');
}
await new Promise(r => setTimeout(r, 1200));

// 找玩家起点:第一个出现在结构附近(x<3200) 的采样
let anchor = null;
for (const e of LOG.events) {
  if (e.k === 'sample' && e.d.x / 16 < 3200 && e.d.x / 16 > 3140) { anchor = { t: e.t, x: e.d.x, y: e.d.y }; break; }
}
console.log('[pf2] anchor:', anchor ? `t${anchor.t} x${(anchor.x / 16).toFixed(1)} feet${((anchor.y + 42) / 16).toFixed(1)}` : '无');
const KEYS = LOG.events.filter(e => e.k === 'key').map(e => ({ t: e.t - anchor.t, c: e.d.c, down: e.d.down }));
const END_T = KEYS[KEYS.length - 1].t + 30;

const out = await page.evaluate(async ({ cells, anchor, KEYS, END_T }) => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  await new Promise(r => setTimeout(r, 200));
  for (const [k, v] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    st.setTile(x, y, v[0]);
    const i = st.idx(x, y);
    st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] |= 1;
    if (v[3]) st.flags[i] |= 64;
    st.wire[i] = 0;
  }
  // 快照 bbox 外围一圈改为空气封边(防边缘外来干扰,不改变内部)
  let bx0 = 9e9, bx1 = -9e9, by0 = 9e9, by1 = -9e9;
  for (const k of Object.keys(cells)) {
    const [x, y] = k.split(',').map(Number);
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
  }
  await new Promise(r => setTimeout(r, 250));
  // 起点摆放
  p.x = anchor.x; p.y = anchor.y; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 500));
  const t0 = g.tickCount;
  const held = new Set();
  let ki = 0;
  const samples = [];
  // 主循环:真实游戏 tick 推进,按相对 tick 应用按键
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      const rel = g.tickCount - t0;
      while (ki < KEYS.length && KEYS[ki].t <= rel) {
        const k = KEYS[ki];
        if (k.down) { g.input.keys.add(k.c); held.add(k.c); }
        else { g.input.keys.delete(k.c); held.delete(k.c); }
        ki++;
      }
      samples.push({ t: rel, x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), g: !!p.onGround });
      if (rel > END_T || ki >= KEYS.length && rel > END_T) { for (const k of held) g.input.keys.delete(k); resolve(); }
    }, 1000 / 60);
  });
  return samples.slice(0, 2400);
}, { cells: TERRAIN.cells, anchor, KEYS, END_T });

writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/pf2-replay.json', JSON.stringify(out));
console.log('[pf2] samples:', out.length, '(end)');
await browser.close();
