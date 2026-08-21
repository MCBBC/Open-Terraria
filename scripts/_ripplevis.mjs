import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/rv',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const st = g.world.store;
  let wx = 0, wy = 0;
  for (let y = 200; y < 350; y++) {
    let run = 0;
    for (let x = 300; x < 600; x++) {
      if (st.liquid[st.idx(x, y)] > 200 && !st.isSolid(x, y - 1)) {
        run++;
        if (run >= 20) { wx = x - 10; wy = y; break; }
      } else run = 0;
    }
    if (wx) break;
  }
  g.player.x = wx * 16 + 8; g.player.y = (wy - 8) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.5;
  // 等相机稳定
  await new Promise((res) => setTimeout(res, 1500));
  const W = r.canvas.width, H = r.canvas.height;
  const z = g.camera.zoom;
  const sx = Math.round((wx * 16 + 8 - g.camera.x) * z + W / 2);
  const sy = Math.round((wy * 16 - g.camera.y) * z + H / 2);
  const ctx = r.ctx;
  // 采水线亮度时间序列(玩家入水点)
  const grab = () => {
    let sum = 0, n = 0;
    for (let dx = -6; dx <= 6; dx += 3) {
      for (let dy = -3; dy <= 3; dy += 3) {
        if (sx + dx < 0 || sx + dx >= W || sy + dy < 0 || sy + dy >= H) continue;
        const d = ctx.getImageData(sx + dx, sy + dy, 1, 1).data;
        sum += d[0] + d[1] + d[2]; n++;
      }
    }
    return n ? sum / n : 0;
  };
  const baseline = grab();
  // 跳水
  g.player.vy = 12;
  const series = [];
  let wasWet = false;
  for (let i = 0; i < 50; i++) {
    await new Promise((res) => requestAnimationFrame(res));
    const p = g.player;
    if (p.inWater && !wasWet) wasWet = true;
    if (wasWet) series.push(Math.round(grab()));
    if (series.length >= 25) break;
  }
  // 波动幅度 = max-min
  const amp = series.length ? Math.max(...series) - Math.min(...series) : -1;
  return { baseline: Math.round(baseline), amp, series: series.slice(0, 12), wc: g.player.wetCount };
});
console.log(JSON.stringify(result));
await browser.close();
