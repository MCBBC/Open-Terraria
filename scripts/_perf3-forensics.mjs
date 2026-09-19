#!/usr/bin/env node
// perf3 取证小探针:①雨池为何 0(makeRain 门逐项查);②云会话 quad 数/bbox 实值归因。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, installPinnedRandom } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5276';
const log = (...a) => console.log('[forensic]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
try {
  const page = await openPage(browser, {});
  installPinnedRandom(page, 913);
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1200 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  await godMode(page, true);

  const rainGate = await page.evaluate(async () => {
    const g = window.__swGame;
    const hooks = g.renderer.weatherFx?.hooks;
    return {
      weatherFxActive: g.renderer.weatherFxActive,
      worldPaused: g.renderer._worldPaused,
      paused: g.paused,
      hooksNull: !hooks,
      zoneRain: hooks?.zoneRain, atmo: hooks?.atmo, shimmer: hooks?.shimmerAlpha,
      cloudAlpha: g.world.weather.cloudAlpha, raining: g.world.weather.raining,
      quality: (await import('/src/core/GfxQuality.ts')).gfxQuality.value,
      playerCy: g.player.cy, ground: g.world.groundLevel,
      playWhenUnfocused: (await import('/src/core/Options.ts')).options.data.playWhenUnfocused,
    };
  });
  log('rain gates:', JSON.stringify(rainGate));

  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    options.data.playWhenUnfocused = true;
    window.__swGame.paused = false;
    const { SkyRenderer } = await import('/src/render/SkyRenderer.ts');
    const g = window.__swGame;
    const P = globalThis.__pf = { sessions: [], layer: null };
    const layer = g.renderer.sky.cloudGlLayer;
    P.layerInfo = layer ? {
      unavailable: layer.unavailable, canvasW: layer.canvas.width, canvasH: layer.canvas.height,
      cloudFxOK: layer.cloudFxOK,
    } : null;
    try {
      const gl = layer && layer.canvas.getContext('webgl2');
      P.glRenderer = gl ? String(gl.getParameter(gl.RENDERER)) : 'no-context';
    } catch { P.glRenderer = 'query-failed'; }
    P.bgGlEnabled = g.renderer.bgGlEnabled;
    const glProto = Object.getPrototypeOf(layer);
    const oQuad = glProto.quad, oCQuad = glProto.cloudQuad;
    let cur = null;
    const beginSession = (tag) => {
      cur = { tag, quads: 0, quadsExec: 0, bbox: null, blits: [] };
      P.sessions.push(cur);
      if (P.sessions.length > 14) P.sessions.shift();
    };
    glProto.quad = function (...a) { if (!cur) beginSession('stray-quad'); cur.quads++; if (!this.unavailable) cur.quadsExec++; return oQuad.apply(this, a); };
    glProto.cloudQuad = function (...a) { if (!cur) beginSession('stray-cloudQuad'); cur.quads++; if (!this.unavailable) cur.quadsExec++; return oCQuad.apply(this, a); };
    // 主画布 drawImage 账:只记 src===layerCanvas 的(云/背景层合成 blit)
    const mainCtx = g.renderer.ctx ?? g.renderer.canvas.getContext('2d');
    const oDi = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (cur && args[0] === layer.canvas) {
        const b = args.length > 5 ? [args[4], args[5], args[6], args[7]] : [0, 0, args[0].width, args[0].height];
        cur.blits.push(b);
      }
      return oDi.apply(this, args);
    };
    const wrapEnd = (obj, name, tag) => {
      const o = obj.prototype[name];
      obj.prototype[name] = function (...a) {
        beginSession(tag);
        const r = o.apply(this, a);
        cur.bbox = { ...this.cloudBlitBox };
        cur.hatch = SkyRenderer.cloudRegionBlit;
        cur = null;
        return r;
      };
    };
    wrapEnd(SkyRenderer, 'drawVanillaClouds', 'pass1');
    wrapEnd(SkyRenderer, 'drawCloudsNear', 'near');
  });

  await freezeClock(page, { tod: 12 / 24 });
  // 场景:谷底列(perf3 同款)+ 雨开 → 一次取证帧窗
  await page.evaluate(() => {
    const g = window.__swGame;
    const w = g.world;
    const st = w.store;
    const surfaceTy = (tx) => { for (let ty = 0; ty < w.h; ty++) { if (st.flags[st.idx(tx, ty)] !== 0) return ty; } return w.h; };
    const c0 = Math.floor(w.w / 2);
    let best = c0, bestTy = -1;
    for (let tx = Math.max(1, c0 - 48); tx < Math.min(w.w - 1, c0 + 48); tx += 2) {
      const ty = surfaceTy(tx);
      if (ty > bestTy) { bestTy = ty; best = tx; }
    }
    g.player.x = best * 16 + 8;
    g.player.y = (bestTy - 6) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    w.weather.startRain(true, 0.85);
    return { x: g.player.x, surfTy: bestTy };
  });
  await sleep(3500);
  await page.evaluate(() => window.__swGame.world.weather.stopRain(true));
  await sleep(500);
  // 冻结 + 断言渲染活性,采两个 hatch 态的会话样本
  await page.evaluate(() => { window.__swGame.paused = true; });
  await sleep(400);
  await page.evaluate(() => { globalThis.__pf.sessions.length = 0; });
  await sleep(300);
  const snapNew = await page.evaluate(() => ({ sessions: [...globalThis.__pf.sessions], layer: globalThis.__pf.layerInfo, glRenderer: globalThis.__pf.glRenderer, bgGl: globalThis.__pf.bgGlEnabled }));
  const snapFlip = await page.evaluate(async () => {
    const { SkyRenderer } = await import('/src/render/SkyRenderer.ts');
    SkyRenderer.cloudRegionBlit = false;
    globalThis.__pf.sessions.length = 0;
    return SkyRenderer.cloudRegionBlit;
  });
  await sleep(300);
  const snapOld = await page.evaluate(() => ({ sessions: [...globalThis.__pf.sessions] }));
  log('layer:', JSON.stringify({ ...snapNew.layer, glRenderer: snapNew.glRenderer, bgGl: snapNew.bgGl, flippedTo: snapFlip }));
  log('sessions(new-path):', JSON.stringify(snapNew.sessions));
  log('sessions(old-path):', JSON.stringify(snapOld.sessions));
} finally {
  await closeAllBrowsers().catch(() => {});
}
