// 一次性:BJ510 主画布读回（塔区/弹区——判 7d''' 残影在主画布上的原色与 α）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-canvas-readback.mjs
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
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 2400);
}));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  const cam = g.camera, z = cam.zoom;
  const towers = (g.enemies ? g.enemies() : []).filter((e) => [517, 422, 507, 493].includes(e.vanillaId) && !e.dead);
  const cv = R.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const cx2 = c2.getContext('2d');
  cx2.drawImage(cv, 0, 0);
  const res = { queueLen: (R.towerGlowQueue ?? []).length, towers: [] };
  for (const t of towers) {
    const q = (R.towerGlowQueue ?? []).find((qq) => qq.vid === t.vid);
    const sx = cv.width / 2 + Math.round((t.cx - cam.x) * z);
    const sy = cv.height / 2 + Math.round((t.cy - cam.y) * z);
    const d = cx2.getImageData(Math.max(0, sx - 90), Math.max(0, sy - 150), 180, 300).data;
    let warm = 0, cool = 0, n = 0, opaque = 0, mx = 0, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      n++; sum[0] += d[i]; sum[1] += d[i+1]; sum[2] += d[i+2];
      if (d[i+3] > 8) opaque++;
      if (d[i] > d[i+2] + 20) warm++;
      if (d[i+2] > d[i] + 20) cool++;
      mx = Math.max(mx, d[i], d[i+1], d[i+2]);
    }
    res.towers.push({
      vid: t.vid, queuedTex: q?.tex ?? null,
      mainCanvasRegion: { mean: sum.map((v) => Math.round(v / n)), opaquePx: opaque, warm, cool, maxCh: mx },
    });
  }
  // 贴图直证：ensureVImage('vanilla/Glow_162.png') 画到临时画布读中心色
  const img = R.atlas.ensureVImage('vanilla/Glow_162.png');
  if (img) {
    const c3 = document.createElement('canvas');
    c3.width = img.width; c3.height = img.height;
    c3.getContext('2d').drawImage(img, 0, 0);
    const d3 = c3.getContext('2d').getImageData(img.width / 2 | 0, img.height / 4 | 0, 1, 1).data;
    res.glow162CenterPx = [d3[0], d3[1], d3[2], d3[3]];
    res.glow162Dims = [img.width, img.height];
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
