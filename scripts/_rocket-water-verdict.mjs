// 火箭入水湿段定谳探针（2026-09-04 用户实报"火箭无水花+尾焰持续"）。
// 直造 GrenadeProj(134, fired) 从空中射入海面 → 记录溅花尘/湿旗跃迁/水中位移阻尼 →
// 截帧。尾焰持续性属原版本相（AI_016 :48181 无 wet 门,num13=6 恒撒）——探针同时
// 采尾焰尘证据佐证"水下仍有尘 6/31 撒出=原版同相"。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await page.evaluate(() => ({ g: !!(window.__swGame && window.__swGame.player) }));
  if (s.g) break;
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  g.world.timeOfDay = 0.5;
  if (g.world.clock) g.world.clock.timeOfDay = 0.5;
  document.querySelectorAll('button').forEach((b) => { if (/我已知晓/.test(b.textContent ?? '')) b.click(); });
  await new Promise((r) => setTimeout(r, 300));
  // 找海面（连续 12 列表层水）
  let spot = null;
  for (let x = 40; x < st.w - 40 && !spot; x += 7) {
    for (let y = 20; y < 620; y++) {
      if (st.liquid[st.idx(x, y)] > 0 && !st.liquid[st.idx(x, y - 1)] && !st.type[st.idx(x, y - 1)]) {
        let span = 0, depth = 0;
        for (let k = 0; k < 12; k++) if (st.liquid[st.idx(x + k, y)] > 0 && !st.type[st.idx(x + k, y - 1)]) span++;
        for (let d = 0; d < 12; d++) if (st.liquid[st.idx(x, y + d)] > 0) depth++; else break;
        if (span >= 12 && depth >= 3) { spot = { x: x + 6, y }; break; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  g.player.x = spot.x * 16 - g.player.w / 2;
  g.player.y = (spot.y - 8) * 16 - g.player.h / 2;
  g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 600));

  // 尘生成记录（溅花窗 = 入水前后 12 tick）
  const dustLog = [];
  const origDust = g.spawnDust.bind(g);
  g.spawnDust = (...a) => { const d = origDust(...a); if (d) dustLog.push({ t: g.tickCount ?? -1, type: d.type, x: +d.x.toFixed(0), y: +d.y.toFixed(0) }); return d; };

  const { GrenadeProj } = await import('/src/entities/WeaponProj.ts');
  const sx = spot.x * 16, sy = (spot.y - 6) * 16;    // 水面上方 6 格
  const rocket = new GrenadeProj(sx, sy, 0, 4, 40, 3600, 134,
    () => { (window.__rocketEvents ??= []).push('explode@' + (+rocket.y.toFixed(0))); });
  rocket.fired = true;
  g.entities.add(rocket, 'projectiles');
  window.__rocket = rocket;
  window.__rocketEvents = [];

  // 泵 40 tick（入水约在第 10-20 tick）,逐拍记录
  const trace = [];
  for (let i = 0; i < 40; i++) {
    g.fixedUpdate(1 / 60);
    trace.push({ i, y: +rocket.y.toFixed(1), wet: rocket.wet, vy: +rocket.vy.toFixed(2) });
  }
  g.spawnDust = origDust;
  // 湿段直诊：火箭终位处的 wetCollision/液体网格
  const { wetCollision, lavaCollision } = await import('/src/entities/npcLiquid.ts');
  const diag = {
    stuck: { x: rocket.x, y: rocket.y, w: rocket.w, h: rocket.h },
    wetNow: wetCollision(st, rocket.x, rocket.y, rocket.w, rocket.h),
    lavaNow: lavaCollision(st, rocket.x, rocket.y, rocket.w, rocket.h),
    liquidGrid: (() => {
      const rows = [];
      for (let ty = 567; ty <= 571; ty++) {
        rows.push([ty, [1180, 1181, 1182, 1183].map((tx) => st.liquid[st.idx(tx, ty)])]);
      }
      return rows;
    })(),
    presetDone: rocket.wetPresetDone,
    wetSectionExists: typeof rocket.grenadeWetSection === 'function',
  };
  const splashDust = dustLog.filter((d) => d.type === 33 || d.type === 35 || d.type === 152 || d.type === 308 || (d.type >= 98 && d.type <= 105));
  const trailDust = dustLog.filter((d) => d.type === 6 || d.type === 31);
  window.__splashSpot = spot;
  return {
    diag, spot, splashN: splashDust.length, splashSample: splashDust.slice(0, 4),
    trailN: trailDust.length, trailSample: trailDust.slice(0, 4),
    events: window.__rocketEvents,
    trace: trace.filter((_, i) => i % 4 === 0),
  };
});
console.log('STATE=' + JSON.stringify(out));
fs.mkdirSync('/tmp/splash', { recursive: true });
await new Promise(r => setTimeout(r, 120));
await page.screenshot({ path: '/tmp/splash/rocket.png' });
if (errs.length) console.log('ERRS=' + JSON.stringify(errs.slice(0, 4)));
await browser.close();
