// 一次性:BJ510 同帧判死（hook Glow_162 drawImage→帧内紧后读回同区像素）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-sameframe.mjs
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
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  const ctx = R.ctx;
  const orig = ctx.drawImage.bind(ctx);
  const rect = { x: 0, y: 0, w: 0, h: 0, captured: false, op: '', alpha: 0 };
  let armed = false, done = false;
  ctx.drawImage = function (...args) {
    const r = orig(...args);
    if (armed && !done) {
      const src = args[0];
      if (src && src.width === 170 && src.height === 360 && args.length === 9) {
        rect.x = args[5]; rect.y = args[6]; rect.w = args[7]; rect.h = args[8];
        const m = this.getTransform();
        rect.sx = Math.round(m.e + args[5]); rect.sy = Math.round(m.f + args[6]);
        rect.op = this.globalCompositeOperation; rect.alpha = this.globalAlpha;
        rect.captured = true;
        done = true;   // 只捕第一发
      }
    }
    return r;
  };
  return new Promise((resolve) => {
    let frames = 0;
    const cb = () => {
      frames++;
      if (frames === 100) armed = true;
      if (frames === 102) {
        // 此时 7d''' 已跑（ armed 自 frames2 起），立即读回
        armed = false;
        const cv = R.canvas;
        const c2 = document.createElement('canvas');
        c2.width = cv.width; c2.height = cv.height;
        const cx2 = c2.getContext('2d');
        cx2.drawImage(cv, 0, 0);
        const res = { rect, samples: [] };
        // 同帧队列项+塔状态（wy 漂移定位）
        const cam = g.camera;
        const t517b = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 517 && !e.dead);
        const q517 = (R.towerGlowQueue ?? []).find((it) => it.vid === 517);
        res.state = {
          cam: { x: Math.round(cam.x), y: Math.round(cam.y), z: cam.zoom },
          tower: t517b ? { cx: Math.round(t517b.cx), cy: Math.round(t517b.cy), y: Math.round(t517b.y), h: t517b.h } : null,
          q517: q517 ? { wx: Math.round(q517.wx), wy: Math.round(q517.wy) } : null,
          towerScreenTop: t517b ? Math.round(cv.height / 2 + (t517b.cy - 182 - cam.y) * cam.zoom) : null,
          glowScreenTop: rect.sy,
        };
        if (rect.captured) {
          for (const [dx, dy] of [[rect.sx + 87, rect.sy + 120], [rect.sx + 60, rect.sy + 200], [rect.sx + 100, rect.sy + 250], [rect.sx + 87, rect.sy + 60]]) {
            const d = cx2.getImageData(dx, dy, 1, 1).data;
            res.samples.push([dx, dy, [d[0], d[1], d[2], d[3]]]);
          }
          // 区域 warm 统计
          const d = cx2.getImageData(rect.sx, rect.sy, 174, 364).data;
          let warm = 0, cool = 0, bright = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 80 && d[i] > d[i+2] + 20) warm++;
            if (d[i+2] > 80 && d[i+2] > d[i] + 20) cool++;
            if (d[i] + d[i+1] + d[i+2] > 450) bright++;
          }
          res.warm = warm; res.cool = cool; res.bright = bright;
        }
        ctx.drawImage = orig;
        resolve(res);
        return;
      }
      requestAnimationFrame(cb);
    };
    requestAnimationFrame(cb);
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
