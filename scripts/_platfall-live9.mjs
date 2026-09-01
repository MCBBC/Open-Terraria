// 修复终验:真实存档 + 18:38 碰撞地形 + 用户新日志(14-13-15)完整键序重放
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const SAVE = '/Users/vinlic/Downloads/Starter_World-20260901-1123.sbw.json';
const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T14-13-15-987Z.json', 'utf8'));
const CELLS = LOG.meta.terrain.cells;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pgerr]', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:4199') + '/', { waitUntil: 'domcontentloaded' });
{
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    await new Promise(r => setTimeout(r, 2000));
    ok = await page.evaluate(() => !!(window.__swFlow && window.__swFlow.loadJson));
  }
  if (!ok) throw new Error('flow boot timeout');
}
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, readFileSync(SAVE, 'utf8'));
{
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise(r => setTimeout(r, 2000));
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.player));
  }
  if (!ok) throw new Error('game boot timeout');
}
await new Promise(r => setTimeout(r, 1200));
{
  const rect = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(el => el.textContent?.trim() === '我已知晓' && el.children.length === 0);
    if (!els.length) return null;
    const r = els[els.length - 1].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (rect) { await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await new Promise(r => setTimeout(r, 60)); await page.mouse.up(); }
  await new Promise(r => setTimeout(r, 500));
}
await page.evaluate((cells) => {
  const st = window.__swGame.world.store;
  for (const [k, v] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    if (x < 3150 || x > 3214 || y < 270 || y > 292) continue;
    const t = v[0];
    const coll = (t === 0 || t === 11 || v[1] !== 0 || v[2] !== 0 || t === 110 || t === 106 || t === 91);
    if (!coll) continue;
    st.setTile(x, y, t);
    const i = st.idx(x, y);
    st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] |= 1;
    if (v[3]) st.flags[i] |= 64; st.wire[i] = 0;
  }
}, CELLS);
await new Promise(r => setTimeout(r, 300));

const pm = LOG.events.filter(e => e.k === 'playerMove');
const anchor = { t: pm[0].t, x: pm[0].d.x, y: pm[0].d.y + 21 };  // playerMove.y=中心 → 顶点=y+21
const KEYS = LOG.events.filter(e => e.k === 'key').map(e => ({ t: e.t - anchor.t, c: e.d.c, down: e.d.down }));
const END_T = KEYS[KEYS.length - 1].t + 60;
console.log('[pf9] anchor t', anchor.t, 'x', (anchor.x / 16).toFixed(1), 'keys', KEYS.length);

const out = await page.evaluate(async ({ anchor, KEYS, END_T }) => {
  const g = window.__swGame, p = g.player;
  p.x = anchor.x; p.y = anchor.y; p.vx = 0; p.vy = 0; p.onGround = false;
  p.fallStartY = p.y;
  await new Promise(r => setTimeout(r, 800));
  const t0 = g.tickCount;
  const held = new Set();
  let ki = 0;
  const samples = [];
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      const rel = g.tickCount - t0;
      while (ki < KEYS.length && KEYS[ki].t <= rel) {
        const k = KEYS[ki];
        if (k.down) { g.input.keys.add(k.c); held.add(k.c); } else { g.input.keys.delete(k.c); held.delete(k.c); }
        ki++;
      }
      samples.push({ t: rel, x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), g: !!p.onGround });
      if (rel > END_T) { for (const k of held) g.input.keys.delete(k); resolve(); }
    }, 1000 / 60);
  });
  return samples;
}, { anchor, KEYS, END_T });

writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/pf9.json', JSON.stringify(out));
console.log('[pf9] samples:', out.length);
// 30t 整点对拍用户日志
const byT = new Map(out.map(p => [p.t, p]));
console.log('rel_t | 用户 x/ft | 修复后 x/ft');
for (const e of pm) {
  const rel = e.t - anchor.t, d = e.d;
  const r = byT.get(rel);
  if (!r) continue;
  const uf = ((d.y + 21) / 16).toFixed(2), rf = ((r.y + 42) / 16).toFixed(2);
  const mark = Math.abs(parseFloat(rf) - parseFloat(uf)) > 0.8 ? '  <<< 分歧' : '';
  console.log(String(rel).padStart(5), `x${(d.x / 16).toFixed(1)} ft${uf}`.padEnd(20), `| x${(r.x / 16).toFixed(1)} ft${rf} ${r.g ? 'G' : 'AIR'}`, mark);
}
await browser.close();
