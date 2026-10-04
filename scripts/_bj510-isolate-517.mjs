// 一次性:BJ510 隔离 517 发光消费（关泡+只留 517 队列项+独立画布重放 consumer 调用）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-isolate-517.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
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
  // 关泡：drawForceFieldBubble 无法直接 patch（模块内导入）→ 摘 isTowerId 绘制门:
  // 直接 patch drawTowerShield 为空
  const Rp = Object.getPrototypeOf(g.renderer);
  if (Rp.drawTowerShield && !Rp.__bj510OrigShield) {
    Rp.__bj510OrigShield = Rp.drawTowerShield;
    Rp.drawTowerShield = function () {};
  }
});
await page.evaluate(() => new Promise((r) => {
  window.__bj510Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj510Anchor;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
  }, 16);
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 2000);
}));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  // 独立画布：逐队列项重放 consumer drawImage 调用（lighter+同 α+同源矩形）
  const q = (R.towerGlowQueue ?? []);
  const c = document.createElement('canvas');
  c.width = 200; c.height = 400;
  const cx2 = c.getContext('2d');
  cx2.imageSmoothingEnabled = false;
  cx2.globalCompositeOperation = 'lighter';
  const items = [];
  for (const it of q) {
    const img = R.atlas.ensureVImage(it.tex);
    items.push({ vid: it.vid, tex: it.tex, imgOk: !!img, iw: img?.width, ih: img?.height, wx: Math.round(it.wx), sy: it.sy, gh: it.gh, sw: it.sw, sh: it.sh, alpha: +((64 / 255) * (it.noOpac ? 1 : it.opacity)).toFixed(3) });
    if (!img) continue;
    // 把每个塔的残影画到独立画布（sx=塔内 13px 处取样带）
    cx2.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * (it.noOpac ? 1 : it.opacity)));
    cx2.drawImage(img, 0, it.sy, it.iw, it.gh, 0, 0, it.sw, it.sh);
  }
  window.__bj510iso = c;
  // 主画布塔1区读回（无泡版）
  const cam = g.camera, z = cam.zoom;
  const t517 = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 517 && !e.dead);
  const cv = R.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  c2.getContext('2d').drawImage(cv, 0, 0);
  const sx = cv.width / 2 + Math.round((t517.cx - cam.x) * z), sy = cv.height / 2 + Math.round((t517.cy - cam.y) * z);
  const d = c2.getContext('2d').getImageData(Math.max(0, sx - 90), Math.max(0, sy - 182), 180, 364).data;
  let warm = 0, cool = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 80 && d[i] > d[i+2] + 20) warm++;
    if (d[i+2] > 80 && d[i+2] > d[i] + 20) cool++;
  }
  return { queue: items, mainCanvasTower1: { warm, cool } };
});
console.log(JSON.stringify(out, null, 1));
const iso = await page.evaluate(() => window.__bj510iso.toDataURL('image/png'));
await page.evaluate(() => { const c = window.__bj510iso; c.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;image-rendering:pixelated;width:400px;height:800px;background:#000'; document.body.appendChild(c); });
const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 420, height: 820 } });
writeFileSync('/tmp/bj510-iso-canvas.png', shot);
const img = await page.screenshot({ type: 'png' });
writeFileSync('/tmp/bj510-nobubble.png', img);
console.log('saved /tmp/bj510-iso-canvas.png /tmp/bj510-nobubble.png');
await browser.close();
