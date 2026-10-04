// 一次性:BJ510 四柱残影亮度复验探针 v2（私有实例 5207）。夜间+裸塔+日耀落弹 516(钉位)。
// SW_ORIGIN=http://localhost:5207 BJ510_TAG=after node tools/run-diag.mjs scripts/_bj510-pillar-glow-probe.mjs
// 产物:/tmp/bj510-<TAG>.png + 塔区/弹区均色分析(页截图合成面,含 GL 层)
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TAG = process.env.BJ510_TAG ?? 'before';
const wait = (ms) => new Promise((r) => setTimeout(r, 0 * ms + 0));
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
  g.world.lunarEvent.shield = { solar: 0, vortex: 0, nebula: 0, stardust: 0 };   // 裸塔=本体观感直判
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
  // 日耀落弹 516：塔间上方空中（interval 内钉位防撞墙自爆）
  const flareX = (px - 10) * T, flareY = (by - 34) * T;
  const flare = spawnVanillaEnemy(g, 516, flareX, flareY);
  const mid = out[2];
  window.__bj510Anchor = { x: mid.cx - 200, y: mid.cy + 60 };
  window.__bj510Flare = { x: flareX, y: flareY };
  g.player.x = window.__bj510Anchor.x; g.player.y = window.__bj510Anchor.y;
  g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.9;
  return { towers: out, flare: flare ? { cx: Math.round(flare.cx), cy: Math.round(flare.cy) } : null };
});
console.log('spawned:', JSON.stringify(sp));
await page.evaluate(() => new Promise((r) => {
  window.__bj510Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj510Anchor, f = window.__bj510Flare;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
    // 钉 516：位置回钉+速度保幅（残影/自爆判据用 velocity,位置钉住防撞墙）
    const fl = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 516 && !e.dead);
    if (fl && f) {
      const spd = Math.max(6, Math.hypot(fl.vx, fl.vy));
      fl.x = f.x - fl.w / 2; fl.y = f.y - fl.h / 2;
      fl.hitWall = false; fl.hitHead = false; fl.collideY = false;
      const m = Math.hypot(fl.vx, fl.vy) || 1;
      fl.vx = fl.vx / m * spd; fl.vy = fl.vy / m * spd;
    }
  }, 16);
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 2800);
}));

const snap = await page.evaluate(() => {
  const g = window.__swGame;
  const T = 16;
  const R = g.renderer;
  const towers = (g.enemies ? g.enemies() : []).filter((e) => [517, 422, 507, 493].includes(e.vanillaId) && !e.dead);
  const flares = (g.enemies ? g.enemies() : []).filter((e) => e.vanillaId === 516 && !e.dead);
  const cam = g.camera;
  const glowTbl = Object.getPrototypeOf(R).constructor.NPC_GLOW;
  const q = (R.towerGlowQueue ?? []).map((it) => ({ vid: it.vid, tex: it.tex, num: +(it.num?.toFixed?.(3) ?? it.num), opacity: +(it.opacity?.toFixed?.(3) ?? it.opacity), vx: +(it.vx?.toFixed?.(3) ?? it.vx), vy: +(it.vy?.toFixed?.(3) ?? it.vy), wx: Math.round(it.wx), wy: Math.round(it.wy), sw: it.sw, sh: it.sh, overlay: it.overlay, noOpac: it.noOpac, rot: +(it.rot?.toFixed?.(3) ?? it.rot) }));
  return {
    night: +g.world.clock.timeOfDay.toFixed(3),
    cam: cam ? { x: Math.round(cam.x), y: Math.round(cam.y), zoom: +cam.zoom.toFixed(4) } : null,
    canvas: { w: R.canvas?.width, h: R.canvas?.height },
    towers: towers.map((e) => ({
      vid: e.vanillaId, cx: Math.round(e.cx), cy: Math.round(e.cy),
      facing: e.facing, visAngle: +(e.visAngle ?? 0).toFixed(4), spawnAlpha: e.spawnAlpha,
      lit: Array.from(g.lighting?.lightAt(Math.floor(e.cx / T), Math.floor(e.cy / T)) ?? []),
    })),
    flare: flares.map((e) => ({
      cx: Math.round(e.cx), cy: Math.round(e.cy), facing: e.facing,
      visAngle: +(e.visAngle ?? 0).toFixed(3), spawnAlpha: e.spawnAlpha,
      vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2),
    })),
    glow516InTable: !!glowTbl[516],
    queueLen: q.length, queue: q,
  };
});
console.log('SNAP:', JSON.stringify(snap, null, 1));
const img = await page.screenshot({ type: 'png' });
writeFileSync(`/tmp/bj510-${TAG}.png`, img);
console.log(`saved /tmp/bj510-${TAG}.png`);

// ---- 塔区/弹区均色分析（页截图=全层合成面）----
const png = PNG.sync.read(img);
const { cam, towers, flare, canvas } = snap;
if (cam && canvas.w) {
  const z = cam.zoom;
  const w2s = (wx, wy) => [canvas.w / 2 + Math.round((wx - cam.x) * z), canvas.h / 2 + Math.round((wy - cam.y) * z)];
  const region = (cx0, cy0, rw, rh) => {
    const [sx, sy] = w2s(cx0, cy0);
    let r = 0, g2 = 0, b = 0, n = 0;
    for (let y = Math.max(0, sy - rh); y < Math.min(png.height, sy + rh); y += 2) {
      for (let x = Math.max(0, sx - rw); x < Math.min(png.width, sx + rw); x += 2) {
        const i = (y * png.width + x) * 4;
        r += png.data[i]; g2 += png.data[i + 1]; b += png.data[i + 2]; n++;
      }
    }
    return n ? [Math.round(r / n), Math.round(g2 / n), Math.round(b / n)] : null;
  };
  console.log('PIX tower regions (±90×±150 world→screen,step2):');
  for (const t of towers) console.log(`  vid=${t.vid} lit=[${t.lit}] rgb=`, region(t.cx, t.cy, 90, 150));
  if (flare?.length) console.log('  flare rgb=', region(flare[0].cx, flare[0].cy, 40, 40));
}
await browser.close();
