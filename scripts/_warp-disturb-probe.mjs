// 水体 GL 扰动·高速落入 vs 悬停 对比探针（2026-08-25 用户报：高处跳入水的扰动
// 像被跳过，水面接触扰动正常）：入水后沿入水列垂直扫描 sampleDisplace，
// 记录扰动能量随深度的分布——验证注入是落在水面线还是沉到深水。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_warp-disturb-probe.mjs --timeout=120000
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

// 深水池（6 深让高速落入有下沉空间）
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
  return { px, gy, surfaceY: (gy + 1) * 16 };
});
console.log('pond:', JSON.stringify(setup));

const runCase = async (name, mode) => {
  const out = await page.evaluate(async ({ s, mode }) => {
    const g = window.__swGame;
    const WW = await import('/src/render/WaterWaves.ts');
    g.paused = true;
    g.player.wetCount = 0;
    g.player.inWater = false;
    g.player.x = s.px * 16 - g.player.w / 2 + 8;
    g.player.vx = 0;
    g.player.vy = 0;
    g.player.fallStartY = null;
    if (mode === 'fall') {
      g.player.y = s.surfaceY - 220 - g.player.h;
    } else {
      // 悬停：站在池底浅水（中心在水面附近上下）——模拟翅膀贴水面
      g.player.y = s.surfaceY - g.player.h + 6;   // 中心 ≈ 水面 +6
      g.player.vy = -1;
    }
    // 波形缓冲清不干净没关系——先记录基线
    const sampleLine = () => {
      const col = s.px * 16 + 8;
      const depths = [];
      for (let d = -8; d <= 80; d += 8) {
        WW.waterWaves.sampleDisplace(col, s.surfaceY + d, __d);
        depths.push(+Math.hypot(__d[0], __d[1]).toFixed(2));
      }
      return depths;
    };
    const __d = [0, 0];
    const series = [];
    let entered = -1;
    for (let t = 0; t < 90; t++) {
      g.fixedUpdate(1 / 60);
      if (g.player.inWater && entered < 0) entered = t;
      if (entered >= 0 && (t - entered) % 4 === 0 && t - entered <= 24) {
        series.push({ dt: t - entered, line: sampleLine() });
      }
      if (entered >= 0 && t - entered > 24) break;
    }
    return { entered, series };
  }, { s: setup, mode });
  console.log(`\n=== ${name}（入水@t${out.entered}）列扫描 [−8px..+80px 每 8px] ===`);
  for (const s of out.series) {
    console.log(`  +${String(s.dt).padStart(2)}t: ${s.line.join(' ')}`);
  }
};

await runCase('A 高速落入 220px', 'fall');
await runCase('B 悬停水面（中心贴水面）', 'hover');
await browser.close();
