import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/rj',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
// 打桩 queueRippleSized 看是否被调
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找开阔水面(连续 20 格水,上方无遮挡)
  let wx = 0, wy = 0;
  for (let y = 200; y < 350; y++) {
    let run = 0;
    for (let x = 300; x < 600; x++) {
      if (st.liquid[st.idx(x, y)] > 200 && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) {
        run++;
        if (run >= 20) { wx = x - 10; wy = y; break; }
      } else run = 0;
    }
    if (wx) break;
  }
  if (!wx) return { error: 'no open water' };
  // 玩家放到水面上方 8 格,自由落体
  g.player.x = wx * 16 + 8;
  g.player.y = (wy - 8) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.5;
  // 打桩:hook WaterWaves 的 ripple 队列(通过模块不可达,改为监测波场变化)
  // 改为监测:玩家入水前后,波场在玩家位置的 R 值
  const samples = [];
  let wasWet = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => requestAnimationFrame(res));
    const p = g.player;
    if (p.inWater && !wasWet) {
      wasWet = true;
      // 入水了,密集采样 10 帧
      for (let j = 0; j < 10; j++) {
        await new Promise((res) => requestAnimationFrame(res));
        samples.push({ j, wc: p.wetCount, vy: p.vy.toFixed(1) });
      }
      break;
    }
    if (i === 39) samples.push({ noWater: true });
  }
  return { waterAt: [wx, wy], entry: samples, wetNow: g.player.inWater, wc: g.player.wetCount };
});
console.log(JSON.stringify(result));
await browser.close();
