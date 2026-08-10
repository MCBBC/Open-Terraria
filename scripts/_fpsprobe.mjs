// FPS/长任务/内存实测:常规场景 + 压力场景(30 敌+流动水)
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

const measure = async (label, stress) => {
  const r = await page.evaluate(async (stress) => {
    const g = window.__swGame;
    if (stress) {
      // 压力:玩家附近刷 30 只敌 + 一池流动水 + 快速跑图(强制 chunk 烘焙)
      const st = g.world.store;
      const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
      for (let x = px - 20; x <= px - 10; x++) for (let y = py - 12; y <= py - 2; y++) st.setLiquid(x, y, 255, 1);
      for (let i = 0; i < 30; i++) {
        const e = window.__swEnemyFromVanilla ? null : null;
        g.spawnEnemy ? g.spawnEnemy('zombie', (px - 25 + i) * 16, (py - 20) * 16) : 0;
      }
    }
    // FPS 采样 8s
    let frames = 0;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => { frames++; if (performance.now() - t0 < 8000) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const dt = performance.now() - t0;
    // 长任务统计
    const longTasks = [];
    const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.duration > 50) longTasks.push(Math.round(e.duration)); });
    try { po.observe({ entryTypes: ['longtask'] }); } catch { }
    await new Promise((r2) => setTimeout(r2, 2000));
    po.disconnect();
    const mem = performance.memory ? {
      jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
    } : null;
    return {
      fps: Math.round(frames / (dt / 1000)),
      longTasks: longTasks.length ? { count: longTasks.length, maxMs: Math.max(...longTasks) } : null,
      mem,
      enemies: g.entities.enemies.length,
    };
  }, stress);
  console.log(label, JSON.stringify(r));
};
await measure('常规', false);
await measure('压力(30敌+水)', true);
await browser.close();
