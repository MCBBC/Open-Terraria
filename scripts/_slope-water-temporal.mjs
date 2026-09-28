// ★liqgl 水体闪烁·时间序列(2026-09-28):B(缺省 liqgl) vs C(?liqgl=0) vs A(?bglshim=0)
// 实况(不冻结波场/动画),逐帧采水体 3 点 RGB 序列 ×240 帧——闪烁=带序时间指纹。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-temporal.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';

const SCENE = `
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const JG = window.__swTiles?.['v_60_jungle_grass_block'] ?? 0;
  const PX = Math.floor(g.player.cx / 16);
  const G = Math.floor(g.player.y / 16) + 3, XE = PX + 24, X0 = XE - 26;
  for (let x = X0 - 6; x <= XE + 10; x++) for (let y = G - 12; y <= G + 8; y++) {
    st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); st.setHalfBrick(x, y, false); st.setSlope(x, y, 0);
  }
  for (let x = XE; x <= XE + 8; x++) for (let y = G; y <= G + 6; y++) st.setTile(x, y, JG);
  st.setTile(XE, G, JG); st.setSlope(XE, G, 2);
  st.setTile(XE - 1, G + 1, JG); st.setSlope(XE - 1, G + 1, 2);
  st.setTile(XE - 3, G + 2, JG); st.setSlope(XE - 3, G + 2, 2);
  st.setTile(XE - 4, G + 3, JG); st.setSlope(XE - 4, G + 3, 2);
  st.setTile(XE - 1, G + 2, JG); st.setTile(XE - 1, G + 3, JG);
  st.setTile(XE - 2, G + 3, JG); st.setTile(XE - 2, G + 4, JG); st.setTile(XE - 1, G + 4, JG);
  st.setTile(XE - 3, G + 4, JG); st.setTile(XE - 2, G + 5, JG); st.setTile(XE - 3, G + 5, JG);
  for (let x = X0; x <= XE - 1; x++) {
    for (let y = G + 1; y <= G + 4; y++) if (!st.flags[st.idx(x, y)]) st.setLiquid(x, y, 255, 1);
    st.setLiquid(x, G, 60, 1);
  }
  st.setTile(X0 + 8, G + 4, JG); st.setHalfBrick(X0 + 8, G + 4, true);
  for (let x = X0; x <= XE - 5; x++) st.setTile(x, G + 5, JG);
  g.camera.x = (XE - 2) * 16; g.camera.y = G * 16;
  window.__scene = { G, X0, XE };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
`;

async function arm(browser, query, label) {
  const page = await openPage(browser, {});
  await page.goto(ORIGIN + '/' + query + 't=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  { const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 180000) {
      ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
  await godMode(page, true);
  await page.evaluate(SCENE);
  await page.evaluate(() => { window.__swGame.paused = false; });   // 实况:动画/波场/液体模拟全活
  await page.evaluate(() => window.__drive(20));
  await page.evaluate(() => {
    const g = window.__swGame;
    g.camera.x = (window.__scene.XE - 2) * 16; g.camera.y = window.__scene.G * 16;
  });
  // 采样点(设备):池体内部 3 行(避开水面亮带)
  const setup = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const cam = g.camera, dpr = window.devicePixelRatio, zoom = cam.zoom;
    const dev = (wx, wy) => [Math.round((wx - cam.x) * zoom * dpr + r.canvas.width / 2),
      Math.round((wy - cam.y) * zoom * dpr + r.canvas.height / 2)];
    const pts = [
      dev((window.__scene.X0 + 4) * 16 + 8, (window.__scene.G + 2) * 16 + 8),
      dev((window.__scene.X0 + 4) * 16 + 8, (window.__scene.G + 3) * 16 + 8),
      dev((window.__scene.X0 + 20) * 16 + 8, (window.__scene.G + 2) * 16 + 8),
    ];
    const lc = document.createElement('canvas');
    lc.width = r.canvas.width; lc.height = r.canvas.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    window.__samp = { pts, lc, lx };
    return pts;
  });
  // 时间序列:480 帧,每帧 drive(1) 后采 3 点
  const seq = [];
  for (let i = 0; i < 480; i++) {
    const s = await page.evaluate(() => {
      window.__drive(1);
      const { pts, lc, lx } = window.__samp;
      const c = window.__swGame.renderer.canvas;
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.drawImage(c, 0, 0);
      return pts.map(([x, y]) => Array.from(lx.getImageData(x, y, 1, 1).data.slice(0, 3)));
    });
    seq.push(s);
  }
  await page.close();
  return { label, seq, pts: setup };
}

const browser = await launchBrowser({});
for (const [q, label] of [['?', 'B 缺省(liqgl)'], ['?liqgl=0', 'C liqgl=0']]) {
  const { seq } = await arm(browser, q, label);
  console.log(`== ${label} ==  (3 点 ×240 帧;行=采样点)`);
  for (let p = 0; p < 3; p++) {
    // 变化率:相邻帧色变的帧占比 + 每次变化的幅度
    let changes = 0, sum = 0, maxStep = 0;
    const uniq = new Set();
    for (let i = 0; i < seq.length; i++) {
      uniq.add(seq[i][p].join(','));
      if (i > 0) {
        const [a, b] = [seq[i - 1][p], seq[i][p]];
        const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
        if (d > 2) { changes++; sum += d; if (d > maxStep) maxStep = d; }
      }
    }
    console.log(`  点${p}: 色变帧=${changes}/479 幅度均=${(sum / Math.max(1, changes)).toFixed(1)} max=${maxStep} 唯一色数=${uniq.size}`);
    // 色值跳变时刻表(前 24 次)
    const jumps = [];
    for (let i = 1; i < seq.length; i++) {
      const [a, b] = [seq[i - 1][p], seq[i][p]];
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      if (d > 2) jumps.push(`@${i}:${a.join(',')}→${b.join(',')}`);
      if (jumps.length >= 24) break;
    }
    console.log(`    跳变: ${jumps.join(' ') || '(无)'}`);
  }
}
process.exit(0);
