// 用户真实存档实机重放:loadJson 载入 Starter_World → 真实玩家/真实地形 →
// 按 10:38 行为日志完整按键时间线行走 → 逐 tick 采样 + __SW_SLOPE_LOG 全量
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const SAVE = '/Users/vinlic/Downloads/Starter_World-20260901-1123.sbw.json';
const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T10-38-59-497Z.json', 'utf8'));

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
console.log('[pf5] flow ready, loading save...');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, readFileSync(SAVE, 'utf8'));
{
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise(r => setTimeout(r, 2000));
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.player));
  }
  if (!ok) throw new Error('game boot timeout');
}
await new Promise(r => setTimeout(r, 1500));
console.log('[pf5] save loaded, world in');

// 锚点 = 日志第一个结构区采样(t900, x3182.3, feet284.0);按键时间线同 pf3 规则
let anchor = null;
for (const e of LOG.events) {
  if (e.k === 'sample' && e.d.x / 16 < 3200 && e.d.x / 16 > 3140) { anchor = { t: e.t, x: e.d.x, y: e.d.y }; break; }
}
const KEYS = LOG.events.filter(e => e.k === 'key').map(e => ({ t: e.t - anchor.t, c: e.d.c, down: e.d.down }));
const END_T = KEYS[KEYS.length - 1].t + 30;
console.log('[pf5] anchor t', anchor.t, 'x', (anchor.x / 16).toFixed(1), 'keys', KEYS.length, 'end', END_T);

const out = await page.evaluate(async ({ anchor, KEYS, END_T }) => {
  const g = window.__swGame, p = g.player;
  // 记录玩家真实装备(配件位 armor[10..19])供对照,但不做任何修改
  const equip = (p.inv.armor || []).slice(0, 20).map(s => s ? (s.id ?? s.key ?? '?') : null);
  // 起步摆放(用户 t900 真实位置/速度)
  (window).__SW_SLOPE_LOG = [];
  (window).__SW_SLOPE_LOG.push(`MARK anchor x=${anchor.x} y=${anchor.y}`);
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
      if (rel % 10 === 0) (window).__SW_SLOPE_LOG.push(`MARK t=${rel}`);
      samples.push({ t: rel, x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), g: !!p.onGround });
      if (rel > END_T) { for (const k of held) g.input.keys.delete(k); resolve(); }
    }, 1000 / 60);
  });
  return { samples, slog: (window).__SW_SLOPE_LOG.slice(), equip };
}, { anchor, KEYS, END_T });

writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/pf5.json', JSON.stringify(out));
console.log('[pf5] samples:', out.samples.length, 'slog:', out.slog.length);
console.log('[pf5] 玩家装备:', JSON.stringify(out.equip));
await browser.close();
