// 一次性:cloudBG 大云图双层验证——白天形态 + 夜晚压极光。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

// 白天 + 阴天满 α
await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.5;   // 正午
  g.world.weather.cloudBGActive = 1;
  g.renderer.biomeBg.cloudBGAlpha = 1;                       // 免 33s 渐显
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: '/tmp/cloudbg-day.png' });

// 夜 + 雪 + 满月 + 阴天 → 极光被云幕压暗的合成观感
await page.evaluate(async () => {
  const td = await import('/src/data/tiles.ts');
  const defs = td.TILE_DEFS;
  const snowIds = new Set();
  for (let id = 0; id < defs.length; id++) {
    const v = defs[id]?.vanilla?.sheet;
    if (v === 147 || v === 161) snowIds.add(id);
  }
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  const gy = w.groundLevel;
  const colSnow = [];
  for (let x = 10; x < st.w - 10; x++) {
    let n = 0;
    for (let y = Math.max(5, gy - 80); y < Math.min(st.h - 5, gy + 40); y++) {
      if (snowIds.has(st.type[st.idx(x, y)])) n++;
    }
    colSnow.push(n);
  }
  const cand = [];
  for (let x = 16; x < colSnow.length - 16; x++) {
    let s = 0;
    for (let k = -16; k <= 16; k++) s += colSnow[x + k];
    cand.push({ x, s });
  }
  cand.sort((a, b) => b.s - a.s);
  let ty = -1, bx = -1;
  for (const cd of cand.slice(0, 40)) {
    for (let y = Math.max(4, gy - 100); y <= gy + 40; y++) {
      if (st.isSolid(cd.x, y)) {
        let open = true;
        for (let k = 1; k <= 6; k++) if (st.isSolid(cd.x, y - k)) { open = false; break; }
        if (open) { bx = cd.x; ty = y; }
        break;
      }
    }
    if (ty >= 0) break;
  }
  if (ty >= 0) { p.x = bx * 16 - p.w / 2; p.y = (ty - 3) * 16 - p.h; p.vx = 0; p.vy = 0; }
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.9;
  if ('moonPhase' in c) { try { c.moonPhase = 0; } catch { /* noop */ } }
  g.world.weather.cloudBGActive = 1;
  g.renderer.biomeBg.cloudBGAlpha = 1;
});
await new Promise((r) => setTimeout(r, 9000));
await page.screenshot({ path: '/tmp/cloudbg-night-aurora.png' });
console.log('saved /tmp/cloudbg-day.png + /tmp/cloudbg-night-aurora.png');
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
