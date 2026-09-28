// ★liqgl 水体色差·双臂 world-FBO 读回(2026-09-28):B(缺省 liqgl) vs C(?liqgl=0)
// 同一 GL 管线,只差液体发射路——world FBO 水体 texel 直读定谳批 UV/带错。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-compose-diag.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

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

const lv = (x) => x ? `${x.water} : ${x.slope}` : 'null';

async function arm(browser, query, label) {
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
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
  await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
  await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => {
    const ww = window.__wwMod.waterWaves;
    const origFrame = ww.frame.bind(ww);
    ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
  });
  await page.evaluate(() => window.__drive(10));
  await page.evaluate(() => {
    const g = window.__swGame;
    g.camera.x = (window.__scene.XE - 2) * 16; g.camera.y = window.__scene.G * 16;
  });
  await page.evaluate(() => window.__drive(5));
  const out = await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    const glw = r._accGlw;
    const pipe = glw?.pipe;
    const gl = glw?.gl;
    const W = glw.canvas.width, H = glw.canvas.height;
    const cam = g.camera, dpr = window.devicePixelRatio, zoom = cam.zoom;
    const dev = (wx, wy) => [Math.round((wx - cam.x) * zoom * dpr + r.canvas.width / 2),
      Math.round((wy - cam.y) * zoom * dpr + r.canvas.height / 2)];
    const [wx0, wy0] = dev((window.__scene.X0 + 4) * 16, (window.__scene.G + 2) * 16);
    const [sx0, sy0] = dev((window.__scene.XE - 2) * 16 + 8, (window.__scene.G + 1) * 16 + 8);
    const readFbo = (fboName) => {
      const f = pipe.fbo(fboName, W, H);
      if (!f) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      const px = (x, y) => { const o = new Uint8Array(4); gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o); return Array.from(o); };
      const a = px(wx0, wy0), b = px(sx0, sy0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { water: a, slope: b };
    };
    const canvasPx = (c, x, y) => {
      const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
      const x2 = t.getContext('2d', { willReadFrequently: true });
      x2.drawImage(c, 0, 0);
      return Array.from(x2.getImageData(x, y, 1, 1).data);
    };
    // 垂直剖面:固定 x=水面列,主画布 y∈[wy0-24, wy0+40] 逐像素 RGB→亮度特征
    const prof = [];
    for (let dy = -24; dy <= 40; dy++) {
      const p = canvasPx(r.canvas, wx0, wy0 + dy);
      prof.push(p);
    }
    return {
      prof,
      mainCanvas: { water: canvasPx(r.canvas, wx0, wy0), slope: canvasPx(r.canvas, sx0, sy0) },
      world: gl ? readFbo('world') : null,
      gate: gl ? readFbo('liqgate') : null,
    };
  });
  await page.close();
  return { out, errs };
}

const browser = await launchBrowser({});
for (const [q, label] of [['?', 'B 缺省(liqgl)'], ['?liqgl=0', 'C liquid CPU 链'], ['?wwarp=0', 'D 缺省-无扭曲']]) {
  const { out, errs } = await arm(browser, q, label);
  console.log(`== ${label} ==`);
  console.log('  world      ', lv(out.world));
  console.log('  mainCanvas ', lv(out.mainCanvas));
  console.log('  liqgate    ', lv(out.gate));
  console.log('  垂直剖面 (dy:R,G,B):');
  let line = '   ';
  for (let i = 0; i < out.prof.length; i++) {
    const dy = i - 24;
    const [r0, g0, b0] = out.prof[i];
    line += ` ${dy}:${r0},${g0},${b0}`;
    if (i % 4 === 3) { console.log(line); line = '   '; }
  }
  if (line.trim()) console.log(line);
  if (errs.length) console.log('  errors:', errs.slice(0, 2));
}
process.exit(0);
