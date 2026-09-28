// ★liqgl 水体过亮·全帧猎捕(2026-09-28;用户"重点解决过亮"):
// 实况 900 帧,逐帧采水体区 24×10 采样格网,判"过亮"=格点亮度显著高于同区中位
// (未乘光指纹:lit≈0.53×texel;过亮帧≈texel 本体)。输出过亮帧号/占比/空间分布。
// 双臂:B(缺省 liqgl) vs C(?liqgl=0)。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-bright-hunt.mjs
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
  // 玩家入水(潜到池心,身体没入)
  g.player.x = (X0 + 12) * 16; g.player.y = (G + 1) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = (X0 + 12) * 16; g.camera.y = (G + 2) * 16;
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
  await page.evaluate(() => { window.__swGame.paused = false; });
  await page.evaluate(() => window.__drive(30));
  // 采样格网:池体 (X0+3..X0+22, G+1..G+4) 每 2px 一点(设备)
  await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const cam = g.camera, dpr = window.devicePixelRatio, zoom = cam.zoom;
    const dev = (wx, wy) => [Math.round((wx - cam.x) * zoom * dpr + r.canvas.width / 2),
      Math.round((wy - cam.y) * zoom * dpr + r.canvas.height / 2)];
    const pts = [];
    for (let ty = window.__scene.G + 1; ty <= window.__scene.G + 4; ty++)
      for (let tx = window.__scene.X0 + 3; tx <= window.__scene.X0 + 22; tx += 2)
        pts.push(dev(tx * 16 + 8, ty * 16 + 8));
    const lc = document.createElement('canvas');
    lc.width = r.canvas.width; lc.height = r.canvas.height;
    window.__samp = { pts, lc, lx: lc.getContext('2d', { willReadFrequently: true }) };
  });
  const N = 900;
  const brightFrames = [];
  for (let i = 0; i < N; i++) {
    const r = await page.evaluate(() => {
      window.__drive(1);
      const { pts, lc, lx } = window.__samp;
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.drawImage(window.__swGame.renderer.canvas, 0, 0);
      // 逐点亮度;过亮点=亮度 > 区口中位×1.35(未乘光指纹)
      const vals = pts.map(([x, y]) => {
        const d = lx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      });
      const lum = vals.map(([r0, g0, b0]) => r0 * 0.3 + g0 * 0.45 + b0 * 0.25);
      const med = [...lum].sort((a, b) => a - b)[Math.floor(lum.length / 2)];
      const bright = [];
      for (let k = 0; k < lum.length; k++) if (lum[k] > med * 1.35 + 8) bright.push(k);
      return { bright, n: pts.length, vals: bright.length ? bright.map((k) => vals[k].join(',')) : null };
    });
    if (r.bright.length >= 3) brightFrames.push({ i, n: r.bright.length, vals: r.vals });
  }
  await page.close();
  console.log(`== ${label} == 过亮帧(≥3 点): ${brightFrames.length}/${N}`);
  for (const f of brightFrames.slice(0, 12)) console.log(`  @${f.i}: ${f.n} 点 ${f.vals?.slice(0, 4).join(' | ')}`);
  return brightFrames.length;
}

const browser = await launchBrowser({});
const b = await arm(browser, '?', 'B 缺省(liqgl)');
const c = await arm(browser, '?liqgl=0', 'C liqgl=0');
console.log(`结论: B 过亮帧=${b}  C 过亮帧=${c}`);
process.exit(0);
