// 一次性:BJ510 发光层 A/B（同会话内 patch ensureVImage 摘 Glow_* → 对拍像素差=发光层净贡献）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-glow-ab.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
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

const sp = await page.evaluate(async () => {
  const g = window.__swGame;
  const T = 16;
  const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
  g.world.lunarEvent.shield = { solar: 0, vortex: 0, nebula: 0, stardust: 0 };
  const px = Math.floor(g.player.cx / T);
  let by = Math.floor(g.player.cy / T);
  for (let d = 0; d < 200; d++) { const y = Math.floor(g.player.cy / T) - 40 + d; if (g.world.store.isSolid(px, y)) { by = y; break; } }
  const ids = [517, 422, 507, 493];
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const e = spawnVanillaEnemy(g, ids[i], (px - 30 + i * 14) * T, (by - 20) * T);
    if (e) e.y -= e.h / 2;
    out.push(e ? { vid: ids[i], cx: Math.round(e.cx), cy: Math.round(e.cy) } : null);
  }
  const flareX = (px - 10) * T, flareY = (by - 34) * T;
  spawnVanillaEnemy(g, 516, flareX, flareY);
  const mid = out[2];
  window.__bj510Anchor = { x: mid.cx - 200, y: mid.cy + 60 };
  window.__bj510Flare = { x: flareX, y: flareY };
  g.player.x = window.__bj510Anchor.x; g.player.y = window.__bj510Anchor.y;
  g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.9;
  // 预热 glow 贴图（ensureVImage 懒载,先拉齐再 A/B）
  for (const n of ['Glow_162', 'Glow_149', 'Glow_143', 'Glow_132', 'NPC_516']) {
    g.renderer.atlas.ensureVImage('vanilla/' + n + '.png');
  }
  return out;
});
console.log('spawned:', JSON.stringify(sp));
await page.evaluate(() => new Promise((r) => {
  window.__bj510Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj510Anchor, f = window.__bj510Flare;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
    const fl = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 516 && !e.dead);
    if (fl && f) {
      const spd = Math.max(6, Math.hypot(fl.vx, fl.vy));
      fl.x = f.x - fl.w / 2; fl.y = f.y - fl.h / 2;
      fl.hitWall = false; fl.hitHead = false; fl.collideY = false;
      const m = Math.hypot(fl.vx, fl.vy) || 1;
      fl.vx = fl.vx / m * spd; fl.vy = fl.vy / m * spd;
    }
  }, 16);
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 2600);
}));

const geo = await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  const T = 16;
  const towers = (g.enemies ? g.enemies() : []).filter((e) => [517, 422, 507, 493].includes(e.vanillaId) && !e.dead);
  const flare = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 516 && !e.dead);
  return {
    cam: { x: g.camera.x, y: g.camera.y, z: g.camera.zoom },
    cv: { w: R.canvas.width, h: R.canvas.height },
    towers: towers.map((e) => ({ vid: e.vanillaId, cx: e.cx, cy: e.cy })),
    flare: flare ? { cx: flare.cx, cy: flare.cy } : null,
    queueLen: (R.towerGlowQueue ?? []).length,
  };
});
console.log('GEO:', JSON.stringify(geo));

// A 帧（发光层在）
const imgA = await page.screenshot({ type: 'png' });
// B 帧（patch ensureVImage 摘 Glow_*/NPC_516 → 消费侧 continue=发光层全摘）
await page.evaluate(() => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  if (!atlas.__bj510OrigEnsure) {
    atlas.__bj510OrigEnsure = atlas.ensureVImage.bind(atlas);
    atlas.ensureVImage = (file) => (/^(vanilla\/(Glow_|NPC_516))/.test(file) ? null : atlas.__bj510OrigEnsure(file));
  }
});
await new Promise((r) => setTimeout(r, 300));
const imgB = await page.screenshot({ type: 'png' });
await page.evaluate(() => {
  const atlas = window.__swGame.renderer.atlas;
  atlas.ensureVImage = atlas.__bj510OrigEnsure;
  delete atlas.__bj510OrigEnsure;
});
await new Promise((r) => setTimeout(r, 300));
const imgA2 = await page.screenshot({ type: 'png' });   // 复原复核（应≈A）
writeFileSync('/tmp/bj510-ab-A.png', imgA);
writeFileSync('/tmp/bj510-ab-B.png', imgB);

const pa = PNG.sync.read(imgA), pb = PNG.sync.read(imgB), pa2 = PNG.sync.read(imgA2);
const { cam, cv, towers, flare } = geo;
const z = cam.z;
const w2s = (wx, wy) => [cv.w / 2 + Math.round((wx - cam.x) * z), cv.h / 2 + Math.round((wy - cam.y) * z)];
const diffMean = (cx0, cy0, rw, rh, P1, P2) => {
  const [sx, sy] = w2s(cx0, cy0);
  let dr = 0, dg = 0, db = 0, n = 0, mx = 0;
  for (let y = Math.max(0, sy - rh); y < Math.min(pa.height, sy + rh); y += 1) {
    for (let x = Math.max(0, sx - rw); x < Math.min(pa.width, sx + rw); x += 1) {
      const i = (y * pa.width + x) * 4;
      const d1 = Math.abs(P1.data[i] - P2.data[i]);
      const d2 = Math.abs(P1.data[i+1] - P2.data[i+1]);
      const d3 = Math.abs(P1.data[i+2] - P2.data[i+2]);
      dr += P1.data[i] - P2.data[i]; dg += P1.data[i+1] - P2.data[i+1]; db += P1.data[i+2] - P2.data[i+2];
      mx = Math.max(mx, d1, d2, d3); n++;
    }
  }
  return { mean: [Math.round(dr / n), Math.round(dg / n), Math.round(db / n)], maxAbs: mx };
};
console.log('glow-layer net contribution (A-B, + = glow adds):');
for (const t of towers) console.log(`  vid=${t.vid}:`, JSON.stringify(diffMean(t.cx, t.cy, 90, 150, pa, pb)));
if (flare) console.log('  flare:', JSON.stringify(diffMean(flare.cx, flare.cy, 40, 40, pa, pb)));
console.log('  restore-check A2-A (should be ~0):', JSON.stringify(diffMean(towers[2].cx, towers[2].cy, 90, 150, pa2, pa)));
await browser.close();
