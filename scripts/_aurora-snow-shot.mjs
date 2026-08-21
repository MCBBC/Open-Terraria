// 一次性:雪原夜景极光构图截图——带与山脊线/地面的层次关系。
// 传送玩家到雪原(扫 vanilla sheet 147/161 地表块)→ 满月深夜 → 等极光淡入满 → 截图。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

const tp = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  // 雪/冰块内部 id(vanilla sheet 147/161)
  const ids = [];
  for (let id = 0; id < (window.__swTileCount ?? 600); id++) { /* 占位,下面走 TILE_DEFS */ }
  return { ok: true };
});

// 用模块表找雪 id 并传送
const spot = await page.evaluate(async () => {
  const td = await import('/src/data/tiles.ts');
  const defs = td.TILE_DEFS;
  const snowIds = new Set();
  for (let id = 0; id < defs.length; id++) {
    const v = defs[id]?.vanilla?.sheet;
    if (v === 147 || v === 161) snowIds.add(id);
  }
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  // 地表附近扫雪块(y < groundLevel+80),取最靠中的一块
  const gy = w.groundLevel;
  let best = null;
  for (let y = Math.max(5, gy - 60); y < Math.min(st.h - 5, gy + 80); y++) {
    for (let x = 10; x < st.w - 10; x += 2) {
      if (snowIds.has(st.type[st.idx(x, y)])) {
        const surfaceOk = !st.isSolid(x, y - 3) && !st.isSolid(x, y - 2);
        if (surfaceOk && (!best || Math.abs(x - st.w / 2) < Math.abs(best.x - st.w / 2))) best = { x, y };
      }
    }
    if (best) break;   // 最浅雪层即可
  }
  if (!best) return { found: false };
  p.x = best.x * 16 - p.w / 2;
  p.y = (best.y - 3) * 16 - p.h;
  p.vx = 0; p.vy = 0;
  return { found: true, x: best.x, y: best.y };
});
console.log('SPOT:', JSON.stringify(spot));

await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.9;
  if ('moonPhase' in c) c.moonPhase = 0;
  const aur = g.renderer.sky.aurora;
  aur.setActive(true);
  aur._opacity = 1;
});
await new Promise((r) => setTimeout(r, 2000));   // 噪声/几何/渗入链就绪
await page.screenshot({ path: '/tmp/aurora-snow.png' });
console.log('saved /tmp/aurora-snow.png');
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
