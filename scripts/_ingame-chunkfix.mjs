// 游戏内 chunk 修复验证：小世界 + 强制 zoom 1.27（用户报告值）+ DPR2，
// 出生点旁全部树冠标记 × 无风/强风 × 干带（中心±8px）全透明行检测。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('chunk验证');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (n, c, e) => { out.steps.push({ n, c: !!c, e }); return !!c; };
  try {
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const st = g.world.store;
    const T = 16;
    const TREE = TILE_BY_KEY['tree'];
    // 出生点 ±100 列找冠标记
    const ptx = Math.floor(g.player.cx / T);
    const markers = [];
    for (let dx = -100; dx <= 100; dx++) {
      const x = ptx + dx;
      if (x < 5 || x >= st.w - 5) continue;
      for (let y = 4; y < st.h - 5; y++) {
        const i = st.idx(x, y);
        if (st.type[i] === TREE && st.frameY[i] >= 198 && (st.frameX[i] === 22 || st.frameX[i] === 0)) {
          markers.push({ x, y });
          break;
        }
      }
    }
    ok('找到树 ≥3', markers.length >= 3, String(markers.length));
    // zoom 1.27（模拟用户档；相机 snap round(cam.x*z)/z 同产线）
    g.camera.zoom = 1.27;
    g.camera.zoomTarget = 1.27;
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    const z = 1.27;
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const scan = async (m, mode, frames) => {
      g.world.weather.windSpeedCurrent = mode === 'gale' ? 1 : 0;
      g.world.weather.windSpeedTarget = mode === 'gale' ? 1 : 0;
      // 钉玩家到该树（相机跟随收敛）
      const B = (m.y + 1) * T;
      const pin = (k) => {
        const o = [[0, 0], [0.3, 0.6], [0.7, 0.2], [0.5, 0.5]][k % 4];
        g.player.x = m.x * T + 8 + o[0]; g.player.y = B - 8 + o[1];
        g.player.vx = 0; g.player.vy = 0;
      };
      pin(0);
      for (let i = 0; i < 60; i++) { pin(0); g.fixedUpdate(1 / 60); }
      let bad = 0, worst = null;
      for (let f = 0; f < frames; f++) {
        for (let i = 0; i < 2; i++) { pin(f); g.fixedUpdate(1 / 60); }
        await raf(); await raf();
        const camRX = Math.round(g.camera.x * z) / z, camRY = Math.round(g.camera.y * z) / z;
        for (let dy = -4; dy <= 6; dy++) {
          const sx = Math.round((m.x * T + 0 - camRX) * z + canvas.width / 2);
          const sy = Math.round((B + dy - camRY) * z + canvas.height / 2);
          if (sx < 0 || sy < 0 || sx + Math.round(16 * z) >= canvas.width || sy >= canvas.height) continue;
          const d = ctx.getImageData(sx, sy, Math.round(16 * z), 1).data;
          let op = 0, n2 = 0;
          for (let j = 3; j < d.length; j += 4) { n2++; if (d[j] > 60) op++; }
          if (op / n2 === 0) { bad++; if (!worst) worst = { dy, f }; break; }
        }
      }
      return { bad, worst };
    };
    out.trees = [];
    for (const m of markers.slice(0, 5)) {
      const idle = await scan(m, 'idle', 14);
      const gale = await scan(m, 'gale', 14);
      out.trees.push({ x: m.x, y: m.y, idleBad: idle.bad, idleW: idle.worst, galeBad: gale.bad, galeW: gale.worst });
    }
  } catch (err) { out.steps.push({ n: 'ERR ' + String(err && err.stack || err).slice(0, 300), c: false }); }
  return out;
});
for (const s of res.steps) console.log((s.c ? 'PASS' : 'FAIL') + ':', s.n, s.e ?? '');
let anyBad = false;
for (const t of res.trees ?? []) {
  const b = t.idleBad || t.galeBad;
  if (b) anyBad = true;
  console.log(`树@(${t.x},${t.y}) 无风坏=${t.idleBad}${JSON.stringify(t.idleW) ?? ''} 强风坏=${t.galeBad}${JSON.stringify(t.galeW) ?? ''}`);
}
console.log(anyBad ? '仍有缝帧' : '✅ 全树 × 无风/强风 × zoom1.27 DPR2：干带零全透明行（修复生效）');
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
