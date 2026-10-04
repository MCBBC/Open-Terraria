// 一次性:BJ510 时间演化（同一会话内早/中/晚三读 warm 计数+塔存活/队列状态）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-timewash.mjs
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
const readWarm = () => page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  const cam = g.camera, z = cam.zoom;
  const t517 = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 517 && !e.dead);
  if (!t517) return { towerGone: true };
  const cv = R.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const cx2 = c2.getContext('2d');
  cx2.drawImage(cv, 0, 0);
  const sx = cv.width / 2 + Math.round((t517.cx - cam.x) * z) - 87;
  const sy = cv.height / 2 + Math.round((t517.cy - cam.y) * z) - 182;
  const d = cx2.getImageData(Math.max(0, sx), Math.max(0, sy), 174, 364).data;
  let warm = 0, bright = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 80 && d[i] > d[i+2] + 20) warm++;
    if (d[i] + d[i+1] + d[i+2] > 450) bright++;
  }
  const q = R.towerGlowQueue ?? [];
  return {
    warm, bright, towerAlive: true,
    towerPos: { cx: Math.round(t517.cx), cy: Math.round(t517.cy), spawnAlpha: t517.spawnAlpha },
    cam: { x: Math.round(cam.x), y: Math.round(cam.y) },
    queueLen: q.length,
    queue517: q.filter((it) => it.vid === 517).map((it) => ({ opacity: +it.opacity.toFixed(2), num: +it.num.toFixed(2) })),
    time: +g.world.clock.timeOfDay.toFixed(3), isDay: g.world.clock.isDay,
  };
});
// 早读（spawn 后 ~0.5s）
await new Promise((r) => setTimeout(r, 500));
console.log('EARLY :', JSON.stringify(await readWarm()));
// 中读（~1.5s）
await new Promise((r) => setTimeout(r, 1000));
console.log('MID   :', JSON.stringify(await readWarm()));
// 晚读（~3s）
await new Promise((r) => setTimeout(r, 1500));
console.log('LATE  :', JSON.stringify(await readWarm()));
await browser.close();
