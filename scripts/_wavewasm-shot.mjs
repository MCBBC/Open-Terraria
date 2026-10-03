// 水面波纹目检补拍(地表亮场景;场值闸已过,本件只补视觉面)
import { launchBrowser, openPage, bootstrap, waitForBridge, createGame, teleport,
  freezeClock, saveCanvasShot } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5210';
const browser = await launchBrowser({ viewport: { width: 1920, height: 1080 } });
try {
  const page = await openPage(browser, {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootstrap(page, ORIGIN);
  await page.goto(ORIGIN + '/?wavewasm=1&pbust=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await waitForBridge(page, { timeout: 120_000 });
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  const spot = await page.evaluate(() => {
    const g = window.__swGame, w = g.world, st = w.store;
    // 手工浅池(出生点右侧地表,确定性亮场景):挖 40×4 沉坑注满水,右侧留 4 格岸
    const sy = w.groundLevel + 2;
    const sx = Math.min(st.w - 60, Math.floor(g.player.x / 16) + 10);
    for (let x = sx; x < sx + 40; x++) {
      for (let y = sy; y < sy + 4; y++) {
        st.setTileSilent(x, y, 0);
        st.setLiquid(x, y, 255, 1);
      }
      for (let y = sy - 3; y < sy; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 1); }
    }
    return { x: (sx + 20) * 16, y: sy * 16 - 6 };   // 站池中(半浸=湿涟漪+洗掠持续注入)
  });
  console.log('surface pool:', JSON.stringify(spot));
  if (!spot) throw new Error('no surface pool');
  await teleport(page, spot.x, spot.y);
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => {
    window.__wig = setInterval(() => { const p = window.__swGame.player;
      p.vx = Math.sin(performance.now() / 260) * 3.4; }, 50);
  });
  await new Promise((r) => setTimeout(r, 5000));
  await saveCanvasShot(page, 'wavewasm-live-surface.png');
  const chk = await page.evaluate(async () => {
    const WW = await import('/src/render/WaterWaves.ts');
    return { q: WW.waterWaves.quality, wwOn: WW.waterWaves.wwActive(),
      nonNeutral: WW.waterWaves.readGridR().reduce((c, v) => c + (v !== 0.5 ? 1 : 0), 0) };
  });
  console.log('state:', JSON.stringify(chk), 'errors:', errors.length);
  await page.evaluate(() => { try { clearInterval(window.__wig); } catch { /* 已清 */ } });
  await page.close();
} finally { await browser.close(); }
process.exit(0);
