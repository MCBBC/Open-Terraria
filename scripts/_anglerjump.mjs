// 渔夫跳跃复现 v4：海洋场景——安家海边 + 解除避水，记录 20s 轨迹
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.debugSpawnNpc(369, 1, false);
  await wait(500);
  const a = (g.entities.npcs ?? []).find(n => n.vanillaId === 369);
  if (!a) return { noAngler: true };
  // 传送到右侧海滩（w-300 内）
  const ox = st.w - 300;
  const surf = Math.floor(g.world.groundLevel);
  // 找海滩岸线：从 ox 向右找第一个水柱
  let shore = -1;
  for (let x = ox; x < st.w - 20; x++) {
    if (st.liquid[st.idx(x, surf + 2)] > 0) { shore = x; break; }
  }
  if (shore < 0) return { noOcean: true };
  const landX = shore - 6;
  const landY = (() => { let y = surf - 20; while (!st.isSolid(landX, y)) y++; return y; })();
  a.x = landX * 16; a.y = landY * 16 - a.h; a.vx = 0; a.vy = 0;
  // 安家岸边
  a.home = { x: landX, y: landY - 1 };
  a.walkMode = 1; a.walkT = 1200; a.facing = 1;
  const samples = [];
  const t0 = performance.now();
  let vyMin = 0, maxVyTick = null;
  while (performance.now() - t0 < 20000) {
    const s = { y: Math.round(a.y), vy: +a.vy.toFixed(1), wet: !!a.wet, x: Math.round(a.x), t: Math.round(performance.now() - t0) };
    samples.push(s);
    if (a.vy < vyMin) { vyMin = a.vy; maxVyTick = s; }
    await wait(50);
  }
  // vy < -10 的事件段
  const rockets = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].vy <= -10 && samples[i - 1].vy > -10) {
      rockets.push(samples.slice(i, i + 10).map(s => `${s.vy}${s.wet ? 'w' : ''}`).join('→'));
    }
  }
  return {
    shore, landX, landY, vyMin: +vyMin.toFixed(1), maxVyTick,
    rocketCount: rockets.length, rocketSegs: rockets.slice(0, 3),
    yRange: [Math.min(...samples.map(s => s.y)), Math.max(...samples.map(s => s.y))],
    wetN: samples.filter(s => s.wet).length, n: samples.length,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length ? 1 : 0);
