// 水体扰动传播验证（真实时序）：不暂停游戏，传送玩家高空落入，rAF 采样水面线
// 位移 3 秒——深层注入应经波形模拟传播到水面（原版行为）。对照悬停。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_warp-propagate-probe.mjs --timeout=150000
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 520 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 120)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5232', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16) + 10;
  const gy = Math.floor(g.player.y / 16) + 2;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = gy; y <= gy + 6; y++) st.setTile(x, y, 0);
    for (let y = gy + 1; y <= gy + 6; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;
    }
    st.setTile(x, gy + 7, 1);
  }
  for (let y = gy; y <= gy + 7; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  g.world.clock.timeOfDay = 0.5;
  // 相机对准池塘（波形缓冲是相机系坐标，采样与渲染同系）
  g.camera.x = px * 16 + 8;
  g.camera.y = (gy + 3) * 16;
  return { px, gy, surfaceY: (gy + 1) * 16 };
});

const runCase = async (name, mode) => {
  // 复位+触发（游戏保持运行）
  await page.evaluate(({ s, mode }) => {
    const g = window.__swGame;
    g.player.wetCount = 0;
    g.player.inWater = false;
    g.player.x = s.px * 16 - g.player.w / 2 + 8;
    g.player.vx = 0;
    g.player.vy = 0;
    g.player.fallStartY = null;
    if (mode === 'fall') {
      g.player.y = s.surfaceY - 220 - g.player.h;
    } else {
      g.player.y = s.surfaceY - g.player.h + 6;
      g.player.vy = -1;
    }
    window.__warpSample = { t0: performance.now(), on: true };
  }, { s: setup, mode });
  // rAF 采样 3 秒：水面线 ±8px 的位移幅值
  const series = await page.evaluate(() => new Promise((resolve) => {
    const WW = import('/src/render/WaterWaves.ts');
    const samples = [];
    const __d = [0, 0];
    const tick = () => {
      WW.then((m) => {
        const s = window.__warpSample;
        if (!s || !s.on) { resolve(samples); return; }
        const col = window.__pondCol;
        void col;
        m.waterWaves.sampleDisplace(window.__surfX, window.__surfY, __d);
        samples.push(+Math.hypot(__d[0], __d[1]).toFixed(2));
        if (performance.now() - s.t0 < 3000) requestAnimationFrame(tick);
        else { s.on = false; resolve(samples); }
      });
    };
    requestAnimationFrame(tick);
  }));
  // 汇总：每 250ms 窗口取 max
  const windows = [];
  for (let i = 0; i < series.length; i += 15) {
    const seg = series.slice(i, i + 15);
    windows.push(seg.length ? Math.max(...seg).toFixed(2) : '-');
  }
  console.log(`\n=== ${name} 水面线位移 max/250ms 窗口 ===`);
  console.log(windows.join(' '));
};

// 把采样坐标暴露给页内
await page.evaluate((s) => {
  window.__surfX = s.px * 16 + 8;
  window.__surfY = s.surfaceY + 4;
}, setup);

await runCase('A 高速落入 220px', 'fall');
await new Promise((r) => setTimeout(r, 2000));   // 等波形衰减
await runCase('B 悬停水面', 'hover');
await browser.close();
