// 一次性:BJ510 HUD drawImage 插桩（捕 Glow_162 调用的目的矩形+变换矩阵+落点像素）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-drawimage-trace.mjs
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
});
await page.evaluate(() => new Promise((r) => {
  window.__bj510Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj510Anchor;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
  }, 16);
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 1800);
}));
// hook 主画布 drawImage 一帧
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  const cv = R.canvas;
  const ctx = R.ctx;
  const hits = [];
  const orig = ctx.drawImage.bind(ctx);
  let hooking = false;
  ctx.drawImage = function (...args) {
    if (hooking) {
      const src = args[0];
      const w = src && src.width, h = src && src.height;
      // 捕 Glow 帧尺寸(170x360/174x364)与 38x38(516) 的调用
      if ((w === 170 && h === 360) || (w === 174 && h === 364) || (w === 38 && h === 38)) {
        const m = this.getTransform();
        hits.push({
          dims: [w, h], nargs: args.length,
          dest: args.length === 9 ? [args[5], args[6], args[7], args[8]] : [args[1], args[2]],
          a: +m.a.toFixed(3), d: +m.d.toFixed(3), e: +m.e.toFixed(1), f: +m.f.toFixed(1),
          op: this.globalCompositeOperation, alpha: +this.globalAlpha.toFixed(3),
        });
      }
    }
    return orig(...args);
  };
  return new Promise((resolve) => {
    let frames = 0;
    const cb = () => {
      frames++;
      if (frames === 1) hooking = true;
      if (frames === 3) {
        hooking = false;
        ctx.drawImage = orig;
        const cam = g.camera, z = cam.zoom;
        const t517 = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 517 && !e.dead);
        // 读落点像素（若 dest 可解析）
        resolve({
          hits: hits.slice(0, 10), hitTotal: hits.length,
          cam: { x: Math.round(cam.x), y: Math.round(cam.y), z },
          t517: { cx: t517.cx, cy: t517.cy },
          viewWH: [R.canvas.width, R.canvas.height],
        });
        return;
      }
      requestAnimationFrame(cb);
    };
    requestAnimationFrame(cb);
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
