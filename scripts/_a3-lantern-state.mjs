// A3 诊断 2:灯笼状态机实际值（plans 位置/α/tex 尺寸/lanterns 采样/camY/surfaceY）
import { launchBrowser, openPage, bootstrap, createGame, freezeClock } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?c10e=1&');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await freezeClock(page, { tod: 22 / 24 });
await page.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  window.__diag = { plans: [], nearDrawn: 0, texW: 0, texH: 0 };
  const origEmit = sky.emitLanternQuads.bind(sky);
  sky.emitLanternQuads = function (gl, entry, s, p) {
    if (window.__diag.plans.length < 8) {
      window.__diag.plans.push({ sx: Math.round(p.sx), sy: Math.round(p.sy), scale: +p.scale.toFixed(2),
        aG: +p.alphaGlow.toFixed(3), aM: +p.alphaMain.toFixed(3), var: p.variant, rot: +p.rot.toFixed(2) });
    }
    return origEmit(gl, entry, s, p);
  };
  const orig2D = sky.drawLanternPlan2D.bind(sky);
  sky.drawLanternPlan2D = function (...a) {
    window.__diag.nearDrawn++;
    const p = a[5];
    if (window.__diag.plans.length < 8) {
      window.__diag.plans.push({ sx: Math.round(p.sx), sy: Math.round(p.sy), scale: +p.scale.toFixed(2),
        aG: +p.alphaGlow.toFixed(3), aM: +p.alphaMain.toFixed(3), var: p.variant, rot: +p.rot.toFixed(2), via: '2d' });
    }
    return orig2D(...a);
  };
});
const hold = setInterval(() => { page.evaluate(() => { window.__swGame.renderer.sky.lanternOpacity = 0.9; }).catch(() => {}); }, 130);
await page.evaluate(() => { window.__swGame.renderer.sky.lanternOpacity = 0.9; });
await new Promise((r) => setTimeout(r, 2500));
const st = await page.evaluate(() => {
  const r = window.__swGame.renderer, sky = r.sky;
  const fc = sky.frameCtx;
  return {
    plans: window.__diag.plans, nearDrawn: window.__diag.nearDrawn,
    op: sky.lanternOpacity, leaving: sky.lanternsLeaving, n: sky.lanterns.length,
    lanterns: sky.lanterns.slice(0, 4).map((l) => ({ x: Math.round(l.x), y: Math.round(l.y), d: +l.depth.toFixed(2), a: l.active })),
    surfaceY: sky.fx.surfaceY, camY: fc?.camY ?? null, viewH: r.canvas.height, viewW: r.canvas.width,
    z: fc?.z ?? null, texW: sky.lanternTex?.width ?? 0, texH: sky.lanternTex?.height ?? 0,
    pure: r._c10eFrame, defer: sky.farDeferGate,
  };
});
clearInterval(hold);
console.log(JSON.stringify(st));
await browser.close();
