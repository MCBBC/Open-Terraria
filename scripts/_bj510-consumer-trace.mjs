// 一次性:BJ510 消费面插桩（patch npcGlowVel4Offsets 记录调用+drawImage 目的矩形）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-consumer-trace.mjs
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
  // 插桩：npcGlowVel4Offsets 仅 7d''' 消费侧调用
  const RC = Object.getPrototypeOf(g.renderer).constructor;
  window.__bj510trace = { offsCalls: [], queueLens: [] };
  const orig = RC.npcGlowVel4Offsets;
  RC.npcGlowVel4Offsets = function (vx, vy, num, xoff) {
    window.__bj510trace.offsCalls.push({ vx: +vx.toFixed(2), vy: +vy.toFixed(2), num: +num.toFixed(2), xoff });
    return orig.call(this, vx, vy, num, xoff);
  };
});
await page.evaluate(() => new Promise((r) => {
  window.__bj510Timer = setInterval(() => {
    const g = window.__swGame;
    const a = window.__bj510Anchor;
    if (!a) return;
    g.player.x = a.x; g.player.y = a.y; g.player.vx = 0; g.player.vy = 0;
    g.world.clock.timeOfDay = 0.9;
    window.__bj510trace.queueLens.push((g.renderer.towerGlowQueue ?? []).length);
  }, 16);
  setTimeout(() => { clearInterval(window.__bj510Timer); r(); }, 2000);
}));
const trace = await page.evaluate(() => ({
  offsCalls: window.__bj510trace.offsCalls.slice(0, 12),
  offsTotal: window.__bj510trace.offsCalls.length,
  queueLensNonZero: window.__bj510trace.queueLens.filter((v) => v > 0).length,
  queueLensSample: window.__bj510trace.queueLens.slice(0, 40),
}));
console.log(JSON.stringify(trace, null, 1));
await browser.close();
