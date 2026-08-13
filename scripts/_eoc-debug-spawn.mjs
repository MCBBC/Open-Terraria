// 一次性诊断:F6 面板召唤克眼后是否动起来(采样位置/ai0/state/vx + 昼夜)
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=500000 scripts/_eoc-debug-spawn.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));

const trace = await page.evaluate(async () => {
  const g = window.__swGame;
  const before = g.entities.list('enemies').length;
  const err = g.debugSpawnNpc(4, 1, false);
  await new Promise((r) => setTimeout(r, 400));
  const eyes = g.entities.list('enemies').filter((e) => e.vanillaId === 4);
  const eye = eyes[eyes.length - 1];
  if (!eye) return { err, before, eyeFound: false };
  const samples = [];
  for (let t = 0; t < 10; t++) {
    await new Promise((r) => setTimeout(r, 1000));
    samples.push({
      t, x: Math.round(eye.x), y: Math.round(eye.y), vx: +eye.vx.toFixed(2), vy: +eye.vy.toFixed(2),
      ai0: eye.ai0, state: eye.state, ai2: eye.ai2, vis: +eye.visAngle.toFixed(2),
      hp: eye.hp, dead: !!eye.dead, netPuppet: !!eye.netPuppet,
      aiStyle: eye.vanilla?.aiStyle,
    });
  }
  const p = g.player;
  return {
    err, before, eyeFound: true,
    player: { x: Math.round(p.x), y: Math.round(p.y), dead: !!p.dead },
    clock: { isDay: g.world.clock.isDay, time: g.world.clock.timeOfDay?.toFixed?.(3) },
    samples,
  };
});
console.log(JSON.stringify(trace));
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
