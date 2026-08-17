// 插桩：hermes 跑动 vx 轨迹 + spawnFastRunParticles 调用次数/门值。
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
  const g = window.__swGame, p = g.player, st = g.world.store;
  const proto = Object.getPrototypeOf(p);
  const orig = proto.spawnFastRunParticles;
  let calls = 0, fired = 0;
  proto.spawnFastRunParticles = function (game, maxRun, accRun) {
    calls++;
    if (Math.abs(this.vx) > (accRun + maxRun) / 2) fired++;
    return orig.call(this, game, maxRun, accRun);
  };
  p.inv.armor[3] = { id: g.itemId('vi_54_hermes_boots'), stack: 1 };
  await new Promise(r => setTimeout(r, 500));
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  const under = st.type[st.idx(bx, by + 2)];
  for (let dx = -120; dx <= 120; dx++) for (let dy = -14; dy <= 2; dy++)
    st.setTile(bx + dx, by + dy, dy === 2 ? under : 0);
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 300));
  const vxSamples = [];
  const onGroundSamples = [];
  g.input.touchKeys.add('KeyD');
  const t0 = performance.now();
  const sampler = setInterval(() => {
    vxSamples.push(+p.vx.toFixed(2));
    onGroundSamples.push(p.vy === 0 ? 1 : 0);
  }, 50);
  await new Promise(r => setTimeout(r, 6000));
  clearInterval(sampler);
  g.input.touchKeys.delete('KeyD');
  proto.spawnFastRunParticles = orig;
  return {
    calls, fired,
    vxTail: vxSamples.slice(-40),
    vy0Frac: onGroundSamples.reduce((a, b) => a + b, 0) / onGroundSamples.length,
    vxMaxSeen: Math.max(...vxSamples),
    soundDelay: p.runSoundDelay,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
