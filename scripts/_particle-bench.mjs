// 粒子原版运动律验证:火星上浮(y 减)、碎屑穿地不停驻(无碰撞)、寿命清退、2000 粒帧耗。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/pbench-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const ground = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  for (let y = 240; y < 280; y++) if (st.isSolid(380, y)) return y;
  return -1;
});
const out = await page.evaluate((gy) => {
  const g = window.__swGame;
  // 火星(上浮)+碎屑(下落,落在地面上方起点)
  for (let i = 0; i < 100; i++) {
    g.particles.push({ x: 380 * 16, y: (gy - 2) * 16, vx: 0, vy: -0.5, grav: -0.015, damp: 0.985, life: 99999, maxLife: 99999, color: '#FFB642', size: 2 });
    g.particles.push({ x: 380 * 16, y: (gy - 1) * 16, vx: 0, vy: 0.5, grav: 0.05, damp: 0.99, life: 99999, maxLife: 99999, color: '#888', size: 2 });
  }
  return { ground: gy, sparkY0: (gy - 2) * 16, debrisY0: (gy - 1) * 16 };
}, ground);
await new Promise((r) => setTimeout(r, 1500));
const check = await page.evaluate(() => {
  const g = window.__swGame;
  let nan = 0;
  const sparks = [], debris = [];
  for (const p of g.particles) {
    if (Number.isNaN(p.x + p.y)) nan++;
    (p.grav < 0 ? sparks : debris).push(p);
  }
  const avg = (a) => a.length ? a.reduce((s, p) => s + p.y, 0) / a.length : NaN;
  return { alive: g.particles.length, nan,
    sparkAvgY: Math.round(avg(sparks)), debrisAvgY: Math.round(avg(debris)),
    debrisBelowGround: debris.filter((p) => p.y > 253 * 16).length };
});
console.log('[原版律]', JSON.stringify({ ...out, ...check }));
// 2000 粒帧耗
await page.evaluate((gy) => {
  const g = window.__swGame;
  g.particles.length = 0;
  for (let i = 0; i < 2000; i++) {
    g.particles.push({ x: 380 * 16 + Math.random() * 12, y: (gy - 10) * 16,
      vx: (Math.random() - 0.5) * 2, vy: Math.random(), grav: 0.05, damp: 0,
      life: 999999, maxLife: 999999, color: '#FA0', size: 2 });
  }
  window.__ft = { n: 0, sum: 0, last: performance.now() };
  const tick = () => {
    const now = performance.now();
    window.__ft.sum += now - window.__ft.last; window.__ft.last = now; window.__ft.n++;
    if (window.__ft.n < 180) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, ground);
await new Promise((r) => setTimeout(r, 4000));
const perf = await page.evaluate(() => ({ frames: window.__ft.n, avgMs: +(window.__ft.sum / Math.max(1, window.__ft.n)).toFixed(2) }));
console.log('[2000 粒帧耗]', JSON.stringify(perf));
await browser.close();
