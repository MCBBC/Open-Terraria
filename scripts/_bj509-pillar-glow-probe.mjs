// 一次性:BJ509 四柱自发光探针 v3（私有实例 5204）。玩家传送到塔旁保证入画。
// SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj509-pillar-glow-probe.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  g.world.lunarEvent.shield = { solar: 100, vortex: 100, nebula: 100, stardust: 100 };
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
  // 玩家每帧钉到 422 与 507 之间同高（防重力掉落/塔底钳把塔抬出画面）
  const mid = out[2];
  window.__bj509Anchor = { x: mid.cx - 200, y: mid.cy + 60 };
  g.player.x = window.__bj509Anchor.x; g.player.y = window.__bj509Anchor.y;
  g.player.vx = 0; g.player.vy = 0;
  // 置夜
  g.world.clock.timeOfDay = 0.9;
  // hook drawNpcGlow
  const R = Object.getPrototypeOf(g.renderer);
  window.__bj509Glow = {};
  if (R.drawNpcGlow) {
    const orig = R.drawNpcGlow;
    R.drawNpcGlow = function (e, r, bx, by) {
      const id = e?.vanillaId ?? -1;
      const w = window.__bj509Glow;
      w[id] = (w[id] ?? 0) + 1;
      return orig.call(this, e, r, bx, by);
    };
  }
  return out;
});
console.log('spawned:', JSON.stringify(sp));
await page.evaluate(() => new Promise((r) => {
  window.__bj509Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj509Anchor;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
    const t2 = g.enemies ? g.enemies().find((e) => e.vanillaId === 507 && !e.dead) : null;
    if (t2) { a.y = t2.cy + 60; a.x = t2.cx - 200; }
  }, 16);
  setTimeout(() => { clearInterval(window.__bj509Timer); r(); }, 3200);
}));

const snap = await page.evaluate(() => {
  const g = window.__swGame;
  const T = 16;
  const towers = (g.enemies ? g.enemies() : []).filter((e) => [517, 422, 507, 493].includes(e.vanillaId) && !e.dead);
  const cam = g.camera;
  return {
    night: +g.world.clock.timeOfDay.toFixed(3),
    isDay: g.world.clock.isDay,
    cam: cam ? { x: Math.round(cam.x), y: Math.round(cam.y) } : null,
    player: { x: Math.round(g.player.cx), y: Math.round(g.player.cy) },
    towers: towers.map((e) => ({
      vid: e.vanillaId, cx: Math.round(e.cx), cy: Math.round(e.cy),
      lit: Array.from(g.lighting?.lightAt(Math.floor(e.cx / T), Math.floor(e.cy / T)) ?? []),
    })),
    glow: window.__bj509Glow,
    glowTex: ['Glow_162', 'Glow_149', 'Glow_143', 'Glow_132'].map((n) => {
      const img = g.renderer.atlas?.ensureVImage?.('vanilla/' + n + '.png');
      if (!img) return { n, loaded: false };
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx2 = c.getContext('2d');
      cx2.drawImage(img, 0, 0);
      let nonA = 0, nonRGB = 0, tot = 0;
      try {
        const d = cx2.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) { tot++; if (d[i] > 8) { nonA++; if (d[i-1] > 8 || d[i-2] > 8 || d[i-3] > 8) nonRGB++; } }
      } catch (e) { return { n, err: String(e).slice(0, 60) }; }
      return { n, w: img.width, h: img.height, opaqueFrac: +(nonA / tot).toFixed(3), rgbFrac: +(nonRGB / tot).toFixed(3) };
    }),
    towerAlpha: towers.map((e) => ({ vid: e.vanillaId, spawnAlpha: e.spawnAlpha, alpha: e.alpha })),
    // worldCanvas vs 主 canvas 塔区像素对拍（multiply 削暗判别）
    layerPix: (() => {
      const wc = g.renderer.worldCanvas;
      const out = { hasWC: !!wc };
      if (!wc) return out;
      const t517 = towers.find((e) => e.vanillaId === 517);
      if (!t517) return out;
      const z = g.camera.zoom, T = 16;
      const ox = wc.width / 2 + Math.round((t517.cx - g.camera.x) * z);
      const oy = wc.height / 2 + Math.round((t517.cy - g.camera.y) * z);
      const c2 = document.createElement('canvas');
      c2.width = wc.width; c2.height = wc.height;
      const cx3 = c2.getContext('2d');
      cx3.drawImage(wc, 0, 0);
      let dr, dg, db, n = 0;
      try {
        const d = cx3.getImageData(ox - 60, oy - 60, 120, 120).data;
        for (let i = 0; i < d.length; i += 4) { dr += d[i]; dg += d[i+1]; db += d[i+2]; n++; }
        out.wcBody = [Math.round(dr/n), Math.round(dg/n), Math.round(db/n)];
      } catch (e) { out.wcErr = String(e).slice(0, 80); }
      return out;
    })(),
  };
});
console.log('SNAP:', JSON.stringify(snap));
const img = await page.screenshot({ type: 'png' });
writeFileSync('/tmp/bj509-night3.png', img);
console.log('saved /tmp/bj509-night3.png');
await browser.close();
