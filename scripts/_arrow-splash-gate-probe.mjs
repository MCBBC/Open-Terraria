// 湿段开闸验证:木箭 1 / 手里剑 3 / 燃烧箭 2 射入深水 → 各应溅花 10 粒 dustWater
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 5000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break;
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  g.world.timeOfDay = 0.5; if (g.world.clock) g.world.clock.timeOfDay = 0.5;
  document.querySelectorAll('button').forEach((b) => { if (/我已知晓/.test(b.textContent ?? '')) b.click(); });
  await new Promise((r) => setTimeout(r, 300));
  let spot = null;
  for (let x = 40; x < st.w - 40 && !spot; x += 7) {
    for (let y = 20; y < 620; y++) {
      if (st.liquid[st.idx(x, y)] > 0 && !st.liquid[st.idx(x, y - 1)] && !st.type[st.idx(x, y - 1)]) {
        let span = 0, depth = 0;
        for (let k = 0; k < 12; k++) if (st.liquid[st.idx(x + k, y)] > 0 && !st.type[st.idx(x + k, y - 1)]) span++;
        for (let d = 0; d < 12; d++) if (st.liquid[st.idx(x, y + d)] > 0) depth++; else break;
        if (span >= 12 && depth >= 4) { spot = { x: x + 6, y }; break; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  g.player.x = spot.x * 16 - g.player.w / 2; g.player.y = (spot.y - 10) * 16 - g.player.h / 2; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 600));
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const per = {};
  for (const pid of [1, 2, 3, 75]) {
    const log = [];
    const orig = g.spawnDust.bind(g);
    g.spawnDust = (...a) => { const d = orig(...a); if (d) log.push(d.type); return d; };
    const a = new Arrow(spot.x * 16, (spot.y - 5) * 16, 0, 5, 20, 0, pid, null);
    a.ignoreWaterProj = undefined;
    g.entities.add(a, 'projectiles');
    for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
    g.spawnDust = orig;
    per[pid] = { splash: log.filter((t) => t === 33 || (t >= 98 && t <= 105) || t === 123 || t === 288).length, dustN: log.length };
  }
  return { spot, per };
});
console.log('GATE=' + JSON.stringify(out));
await browser.close();
