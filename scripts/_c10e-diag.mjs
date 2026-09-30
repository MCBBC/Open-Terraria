// C10e 诊断 v2:全部 diff 在页内完成(零 ImageData 过桥)——B 臂分画布帧间漂移定位
// + A/B 全帧 diff bbox + 分层画像。
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];

async function arm(url, tag) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] PAGEERROR ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${tag}] ` + m.text().slice(0, 160)); });
  await bootstrap(page, url);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
      return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
    };
    try {
      const w = g.world.weather;
      if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; w.lightning = 0; }
      const fx = r.weatherFx; if (fx) { fx.update = () => {}; }
    } catch {}
    g.lighting.clock.tick = () => {};
    import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; m.options.data.swayInWind = false; });
    window.__stage = () => {
      const lc = document.createElement('canvas'); lc.width = r.canvas.width; lc.height = r.canvas.height;
      return { lc, c: lc.getContext('2d', { willReadFrequently: true }) };
    };
    window.__grab = (stage, src) => {
      stage.c.clearRect(0, 0, stage.lc.width, stage.lc.height);
      if (src) stage.c.drawImage(src, 0, 0);
      return stage.c.getImageData(0, 0, stage.lc.width, stage.lc.height).data;
    };
    window.__diff = (P, Q) => {
      const W = r.canvas.width;
      let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < P.length; i += 4) {
        const dd = Math.max(Math.abs(P[i]-Q[i]), Math.abs(P[i+1]-Q[i+1]), Math.abs(P[i+2]-Q[i+2]));
        if (dd > 0) { n++; if (dd > maxd) maxd = dd;
          const px = (i >> 2) % W, py = (i >> 2) / W | 0;
          if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      }
      return { n, maxd, bbox: [x0, y0, x1, y1] };
    };
    window.__diagB = () => {
      const st = window.__stage();
      const gl = document.getElementById('sw-c10e-glcanvas');
      const g1 = window.__grab(st, gl), g2 = window.__grab(st, gl);
      const dGl = window.__diff(g1, g2);
      const s1 = window.__grab(st, r.skyCanvas), s2 = window.__grab(st, r.skyCanvas);
      const dSky = window.__diff(s1, s2);
      const h1 = window.__grab(st, r.canvas), h2 = window.__grab(st, r.canvas);
      const dHud = window.__diff(h1, h2);
      const comp1 = window.__grab(st, null);
      st.c.clearRect(0,0,st.lc.width,st.lc.height);
      for (const s of [r.skyCanvas, gl, r.canvas]) st.c.drawImage(s, 0, 0);
      const c1 = st.c.getImageData(0, 0, st.lc.width, st.lc.height).data;
      // 与 B 自身上一轮全帧 diff 在调用方拼
      return { dGl, dSky, dHud, comp: c1, md5ish: c1.length };
    };
  });
  await freezeClock(page, { tod: 0.5 });
  for (let i = 0; i < 40; i++) await page.evaluate(() => window.__swGame.fixedUpdate(1 / 60));
  return page;
}

const pageA = await arm(ORIGIN + '/?fx=0', 'A');
const pageB = await arm(ORIGIN + '/?c10e=1&fx=0', 'B');

const bd = await pageB.evaluate(() => {
  const r1 = window.__diagB();
  return { dGl: r1.dGl, dSky: r1.dSky, dHud: r1.dHud, comp: r1.comp };
});
console.log('[B] glCanvas 帧间:', JSON.stringify(bd.dGl));
console.log('[B] sky2D 帧间:', JSON.stringify(bd.dSky));
console.log('[B] HUD 帧间:', JSON.stringify(bd.dHud));

const ad = await pageA.evaluate(() => {
  const r = window.__swGame.renderer;
  const st = window.__stage();
  st.c.clearRect(0,0,st.lc.width,st.lc.height);
  st.c.drawImage(r.canvas, 0, 0);
  return st.c.getImageData(0, 0, st.lc.width, st.lc.height).data;
});
const ab = await pageB.evaluate((A) => window.__diff(A, window.__diagB().comp), ad);
console.log('[A vs B] 全帧:', JSON.stringify(ab));

const probe = await pageB.evaluate(() => {
  const rd = (src) => {
    const lc = document.createElement('canvas'); lc.width = 8; lc.height = 8;
    const c = lc.getContext('2d'); c.drawImage(src, 0, 0, src.width, src.height, 0, 0, 8, 8);
    return [...c.getImageData(0, 0, 8, 8).data.slice(0, 16)].join(',');
  };
  const r = window.__swGame.renderer;
  return { sky: rd(r.skyCanvas), gl: rd(document.getElementById('sw-c10e-glcanvas')), hud: rd(r.canvas) };
});
console.log('[B] 分层画像:', JSON.stringify(probe));
console.log('errors:', errs.slice(0, 5));
process.exit(0);
