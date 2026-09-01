// 终极复现:真实存档 + 叠回 18:38 日志地形 + 完整按键时间线重放 + 屏幕录制
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SAVE = '/Users/vinlic/Downloads/Starter_World-20260901-1123.sbw.json';
const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T10-38-59-497Z.json', 'utf8'));
const CELLS = LOG.meta.terrain.cells;
const OUT = '/Users/vinlic/.claude/jobs/4a66e745/tmp/pf8';
mkdirSync(OUT, { recursive: true });

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
  console.log('[pf8] welcome dismissed');
}
await page.evaluate((cells) => {
  const st = window.__swGame.world.store;
  for (const [k, v] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    if (x < 3150 || x > 3214 || y < 270 || y > 292) continue;
    // 只还原碰撞相关格(方块/平台/坡/半砖/空气),跳过家具装饰(无锚定数据会渲染错乱)
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
console.log('[pf8] 18:38 terrain restored');

const cdp = await page.createCDPSession();
let frameNo = 0;
const frameTs = [];
cdp.on('Page.screencastFrame', async (ev) => {
  writeFileSync(`${OUT}/f${String(frameNo).padStart(4, '0')}.png`, Buffer.from(ev.data, 'base64'));
  frameTs.push({ f: frameNo, t: ev.metadata.timestamp });
  frameNo++;
  try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch { /* ignore */ }
});
await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

// 锚点与按键时间线(同 pf5)
let anchor = null;
for (const e of LOG.events) {
  if (e.k === 'sample' && e.d.x / 16 < 3200 && e.d.x / 16 > 3140) { anchor = { t: e.t, x: e.d.x, y: e.d.y }; break; }
}
const KEYS = LOG.events.filter(e => e.k === 'key').map(e => ({ t: e.t - anchor.t, c: e.d.c, down: e.d.down }));
const END_T = KEYS[KEYS.length - 1].t + 30;

const out = await page.evaluate(async ({ anchor, KEYS, END_T }) => {
  const g = window.__swGame, p = g.player;
  (window).__SW_SLOPE_LOG = [];
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

await cdp.send('Page.stopScreencast');
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ samples: out, frames: frameTs, anchor }));
console.log('[pf8] samples:', out.length, 'frames:', frameNo);

// 空中段摘要
let cur = null; const segs = [];
for (const p of out) { if (!p.g) { if (!cur) cur = { t0: p.t, t1: p.t, x0: p.x / 16, ft0: (p.y + 42) / 16, v0: p.vy }; cur.t1 = p.t; } else if (cur) { segs.push(cur); cur = null; } }
if (cur) segs.push(cur);
console.log('空中段:', segs.length);
for (const g of segs) console.log(`  AIR t${g.t0}-${g.t1}(${g.t1 - g.t0 + 1}f) x${g.x0.toFixed(2)} ft${g.ft0.toFixed(2)} vy${g.v0}`);
await browser.close();
