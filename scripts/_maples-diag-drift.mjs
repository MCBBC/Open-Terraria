// 一次性诊断:玩家裁片跨跑漂移定位——元数据全量 dump(t0 与 t0+3s 两拍)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5211';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(origin + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('05162020', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 300 && !ready; i++) {
  ready = await page.evaluate(() => window.__swGame?.world?.store?.w === 4200).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 1500));
// 确定性套件(与 features 探针同款)
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = true; g.enemySpawnEnabled = false;
  const sky = g.renderer.sky;
  const origDraw = Object.getPrototypeOf(sky).draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try {
    const w = g.world.weather;
    if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
    const fx = g.renderer.weatherFx;
    if (fx) { fx.update = () => {}; (fx.pool || []).forEach((d) => { d.active = false; }); (fx.snow || []).forEach((d) => { d.active = false; }); (fx.sand || []).forEach((d) => { d.active = false; }); }
  } catch {}
  try { for (const e of g.entities.enemies) e.dead = true; } catch {}
});
await page.evaluate(async () => {
  const g = window.__swGame;
  const ta = await import('/src/render/TileAnim.ts'); ta.tileAnim.tick = 4800;
  const vt = await import('/src/render/VanillaTiler.ts');
  vt.renderEnv.wind = 0; vt.renderEnv.worldSurface = g.world.groundLevel; vt.renderEnv.remix = false;
});
// freezeClock 同款(clock.mjs 的页内实现:直接用模块)
await page.evaluate(async () => {
  const ck = await import('/src/core/GameTime.ts').catch(() => null);
  const g = window.__swGame;
  // 近似:直接冻结 world clock
  try { g.world.clock.freeze?.(true); } catch {}
});
await new Promise((r) => setTimeout(r, 1200));
// arm-default
await page.evaluate(async () => {
  const m = await import('/src/player/Appearance.ts');
  const g = window.__swGame;
  g.player.appearance = m.defaultAppearance('probe-default');
});
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = g.world.spawnX * 16 + 8 - p.w / 2;
  p.y = g.world.spawnY * 16 - p.h;
  p.vx = 0; p.vy = 0; p.animT = 0; p.animTime = 0; p.eyeFrame = 0;
  try { p.inv.slots[p.selected] = null; } catch {}
});
await new Promise((r) => setTimeout(r, 2200));
await page.evaluate(async () => {
  const m = await import('/src/player/Appearance.ts');
  const g = window.__swGame;
  if (!g.player.appearance) g.player.appearance = m.defaultAppearance('probe-default');
});

const dump = async (tag) => page.evaluate((tag) => {
  const g = window.__swGame;
  const p = g.player;
  const c = g.renderer.canvas;
  const rect = c.getBoundingClientRect();
  return {
    tag, camX: g.camera.x, camY: g.camera.y, zoom: g.camera.zoom,
    pcx: p.cx, pcy: p.cy, px: p.x, py: p.y, w: p.w, h: p.h,
    onGround: p.onGround, eyeFrame: p.eyeFrame, animT: p.animT, stepRenderY: p.stepRenderY,
    canvasW: c.width, canvasH: c.height, rectW: rect.width, rectH: rect.height,
    spawnX: g.world.spawnX, spawnY: g.world.spawnY,
    light: g.lighting?.lightAt ? g.lighting.lightAt(Math.trunc(p.cx / 16), Math.trunc(p.cy / 16)) : null,
    tod: g.world.clock?.timeOfDay ?? g.world.clock?.tod ?? null,
  };
}, tag);
const m1 = await dump('t0');
await new Promise((r) => setTimeout(r, 3000));
const m2 = await dump('t3s');
console.log(JSON.stringify({ m1, m2 }, null, 1));
await browser.close();
