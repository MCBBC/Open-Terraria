// 帧耗时分布(余量评估):常规/压力两场景,取 rAF 间隔的均值/p95/最大
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 420000 });
await new Promise((r) => setTimeout(r, 2500));

const stats = async (label) => {
  const r = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        deltas.push(now - last);
        last = now;
        if (deltas.length < 600) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    const s = [...deltas].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return {
      avgMs: +(sum / s.length).toFixed(2),
      p50: +s[300].toFixed(1), p95: +s[570].toFixed(1), max: +s[599].toFixed(1),
      impliedFpsCeiling: Math.round(1000 / (sum / s.length)),
    };
  });
  console.log(label, JSON.stringify(r));
};
await stats('常规帧耗时');
// 压力:30 敌 + 流水 + 镜头快速横移(强制 chunk 连续烘焙)
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  for (let x = px - 20; x <= px - 10; x++) for (let y = py - 12; y <= py - 2; y++) st.setLiquid(x, y, 255, 1);
  for (let i = 0; i < 30; i++) g.spawnEnemy('zombie', (px - 25 + i) * 16, (py - 20) * 16);
  // 相机持续右移模拟跑图(不动玩家,直接平移相机)
  const orig = g.camera.follow.bind(g.camera);
  g.camera.follow = (x, y) => orig(g.camera.x + 14, y); // 每帧右移 14px ≈ 0.9 格/帧
});
await new Promise((r) => setTimeout(r, 500));
await stats('压力帧耗时(30敌+流水+跑图)');
await browser.close();
