// 一次性:BJ510 全画布暖色聚类扫描（找发光层实际落点）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-warm-scan.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
await page.evaluate(async () => {
  const g = window.__swGame;
  const T = 16;
  const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
  g.world.lunarEvent.shield = { solar: 0, vortex: 0, nebula: 0, stardust: 0 };
  const px = Math.floor(g.player.cx / T);
  let by = Math.floor(g.player.cy / T);
  for (let d = 0; d < 200; d++) { const y = Math.floor(g.player.cy / T) - 40 + d; if (g.world.store.isSolid(px, y)) { by = y; break; } }
  for (const [i, id] of [517, 422, 507, 493].entries()) {
    const e = spawnVanillaEnemy(g, id, (px - 30 + i * 14) * T, (by - 20) * T);
    if (e) e.y -= e.h / 2;
  }
  const mid = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 507 && !e.dead);
  window.__bj510Anchor = { x: mid.cx - 200, y: mid.cy + 60 };
  g.player.x = window.__bj510Anchor.x; g.player.y = window.__bj510Anchor.y;
  g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.9;
  for (const n of ['Glow_162', 'Glow_149', 'Glow_143', 'Glow_132']) g.renderer.atlas.ensureVImage('vanilla/' + n + '.png');
});
await page.evaluate(() => new Promise((r) => {
  window.__bj510Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj510Anchor;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
  }, 16);
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 2200);
}));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  const cam = g.camera, z = cam.zoom;
  const cv = R.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const cx2 = c2.getContext('2d');
  cx2.drawImage(cv, 0, 0);
  const d = cx2.getImageData(0, 0, cv.width, cv.height).data;
  // 暖色网格聚类（48px 格）
  const grid = new Map();
  for (let y = 0; y < cv.height; y += 2) {
    for (let x = 0; x < cv.width; x += 2) {
      const i = (y * cv.width + x) * 4;
      const r = d[i], gg = d[i+1], b = d[i+2];
      if (r > 80 && r > b + 20) {
        const k = (x >> 6) + ',' + (y >> 6);
        grid.set(k, (grid.get(k) ?? 0) + 1);
      }
    }
  }
  const towers = (g.enemies ? g.enemies() : []).filter((e) => [517, 422, 507, 493].includes(e.vanillaId) && !e.dead);
  const w2s = (wx, wy) => [cv.width / 2 + Math.round((wx - cam.x) * z), cv.height / 2 + Math.round((wy - cam.y) * z)];
  return {
    warmCells: [...grid.entries()].filter(([, v]) => v > 12).sort((a, b) => b[1] - a[1]).slice(0, 14),
    towers: towers.map((t) => ({ vid: t.vid, screen: w2s(t.cx, t.cy), queue: (R.towerGlowQueue ?? []).filter((q) => q.vid === t.vid).map((q) => ({ wx: Math.round(q.wx), wy: Math.round(q.wy), screen: w2s(q.wx, q.wy) })) })),
    cam: { x: Math.round(cam.x), y: Math.round(cam.y), z },
    viewWH: [R.viewW ?? null, R.viewH ?? null],
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
