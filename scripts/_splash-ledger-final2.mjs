// 二轮终验收:集束裂片(779/862)/高尔夫(721 真实域)/鱼漂(360 通用湿段)/豁免反证(17)
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
        for (let k = 0; k < 10; k++) if (st.liquid[st.idx(x + k, y)] > 0 && !st.type[st.idx(x + k, y - 1)]) span++;
        for (let d = 0; d < 12; d++) if (st.liquid[st.idx(x, y + d)] > 0) depth++; else break;
        if (span >= 10 && depth >= 3) { spot = { x: x + 5, y }; break; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  const isSplash = (t) => t === 33 || (t >= 98 && t <= 105) || t === 123 || t === 288;
  const run = async (make, ticks) => {
    const log = [];
    const orig = g.spawnDust.bind(g);
    g.spawnDust = (...a) => { const d = orig(...a); if (d) log.push(d.type); return d; };
    const ent = make();
    if (!ent) { g.spawnDust = orig; return { err: 'ctor fail' }; }
    g.entities.add(ent, 'projectiles');
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    g.spawnDust = orig;
    return { splash: log.filter(isSplash).length, dead: !!ent.dead };
  };
  const { ClusterFragmentProj } = await import('/src/entities/ClusterFragmentProj.ts');
  const { GolfBall } = await import('/src/entities/GolfBall.ts');
  const { Bobber } = await import('/src/entities/Bobber.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const res = {};
  res.frag779 = await run(() => new ClusterFragmentProj(spot.x * 16, (spot.y - 4) * 16, 1, 4, 20, 779, 60, () => {}), 40);
  res.frag862 = await run(() => new ClusterFragmentProj(spot.x * 16 + 40, (spot.y - 4) * 16, -1, 4, 20, 862, 60, () => {}), 40);
  try {
    res.golf721 = await run(() => new GolfBall(spot.x * 16, (spot.y - 5) * 16, 721, () => g.player), 40);
  } catch (e) { res.golf721 = { err: String(e).slice(0, 60) }; }
  try {
    res.bobber360 = await run(() => new Bobber(spot.x * 16, (spot.y - 5) * 16, 0, 5, 40, 1, 10, () => g.player), 40);
  } catch (e) { res.bobber360 = { err: String(e).slice(0, 60) }; }
  res.dart17 = await run(() => new Arrow(spot.x * 16, (spot.y - 5) * 16, 0, 5, 20, 0, 17, null), 40); // 豁免反证
  return { spot, res };
});
console.log('FINAL2=' + JSON.stringify(out));
await browser.close();
