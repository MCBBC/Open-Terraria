// 溅花台账清偿终验收:多类弹 1:1 溅花 + 豁免反证 + 玩家四液
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
        if (span >= 10 && depth >= 3) { spot = { x: x + 7, y }; break; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  const isSplashDust = (t) => t === 33 || (t >= 98 && t <= 105) || t === 123 || t === 288;
  const run = async (spawnFn, ticks) => {
    const log = [];
    const orig = g.spawnDust.bind(g);
    g.spawnDust = (...a) => { const d = orig(...a); if (d) log.push(d.type); return d; };
    const ent = spawnFn();
    g.entities.add(ent, 'projectiles');
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    g.spawnDust = orig;
    return { splash: log.filter(isSplashDust).length, dead: !!ent.dead };
  };
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { GrenadeProj } = await import('/src/entities/WeaponProj.ts');
  const res = {};
  res.arrow1 = await run(() => new Arrow(spot.x * 16, (spot.y - 5) * 16, 0, 5, 20, 0, 1, null), 40);
  res.shuriken3 = await run(() => new Arrow(spot.x * 16, (spot.y - 5) * 16, 2, 5, 20, 0, 3, null), 40);
  res.golf607 = await run(() => new Arrow(spot.x * 16, (spot.y - 5) * 16, 0, 5, 20, 0, 607, null), 40); // 豁免反证
  res.rocket134 = await run(() => {
    const r = new GrenadeProj(spot.x * 16, (spot.y - 6) * 16, 0, 4, 40, 3600, 134, () => {});
    r.fired = true; return r;
  }, 40);
  // 回旋镖 6(Boomerang 在 WeaponProj)
  const W = await import('/src/entities/WeaponProj.ts');
  if (W.Boomerang) {
    res.boomerang6 = await run(() => {
      const b = new W.Boomerang(spot.x * 16, (spot.y - 5) * 16, 0, 6, 20, 6);
      return b;
    }, 50);
  } else res.boomerang6 = { err: 'no class' };
  // 沙滩球 155(入水免溅+出水 vy×0.5)
  if (W.BeachBallProj ?? W.BallProjs) {
    const Cls = W.BeachBallProj ?? null;
    if (Cls) {
      let exitVy = null;
      const log = [];
      const orig = g.spawnDust.bind(g);
      g.spawnDust = (...a) => { const d = orig(...a); if (d) log.push(d.type); return d; };
      const ball = new Cls(spot.x * 16, (spot.y - 4) * 16, 0, 3, 20, 155);
      g.entities.add(ball, 'projectiles');
      for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
      g.spawnDust = orig;
      res.ball155 = { splash: log.filter(isSplashDust).length, dead: !!ball.dead };
    } else res.ball155 = { err: 'no class' };
  }
  // 打窝桶 820
  const { ChumBucketProj } = await import('/src/entities/ChumBucketProj.ts');
  res.chum820 = await run(() => new ChumBucketProj(spot.x * 16, (spot.y - 5) * 16, 0, 5, 20, 820), 40);
  // 玩家入水:50 粒 dustWater + Splash_0
  g.player.x = spot.x * 16 - g.player.w / 2;
  g.player.y = (spot.y - 6) * 16 - g.player.h / 2;
  g.player.vy = 3;
  const plog = [];
  const orig2 = g.spawnDust.bind(g);
  g.spawnDust = (...a) => { const d = orig2(...a); if (d) plog.push(d.type); return d; };
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.spawnDust = orig2;
  res.player = { splash: plog.filter(isSplashDust).length, n308: plog.filter((t) => t === 308).length };
  return { spot, res };
});
console.log('FINAL=' + JSON.stringify(out));
await browser.close();
