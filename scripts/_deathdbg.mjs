// 死亡散飞 vx 清零问题逐 tick 诊断
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const log = [];
  const snap = () => ({
    dead: p.dead, hp: Math.round(p.hp), hd: p.deathHitDir,
    h: [p.deadParts.head.px.toFixed(2), p.deadParts.head.py.toFixed(2), p.deadParts.head.vx.toFixed(2), p.deadParts.head.vy.toFixed(2), p.deadParts.head.rot.toFixed(2)],
    b: [p.deadParts.body.vx.toFixed(2), p.deadParts.body.vy.toFixed(2)],
    l: [p.deadParts.legs.vx.toFixed(2), p.deadParts.legs.vy.toFixed(2)],
  });
  const t0 = performance.now();
  p.damage(99999, p.cx + 20, p.y);
  log.push({ ms: 0, tag: 'justAfterDamage', ...snap() });
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 50));
    log.push({ ms: Math.round(performance.now() - t0), ...snap() });
  }
  // 再看 respawnPlayer 之后二次死亡（软核重生→再杀）
  return { log, appearance: !!p.appearance, skinVariant: p.appearance?.skinVariant, h: p.h, w: p.w, zoom: g.camera.zoom, dead: p.dead };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
